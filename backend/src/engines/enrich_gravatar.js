/**
 * Gravatar Personal Email Finder
 *
 * Finds personal email addresses (Gmail, Yahoo, Outlook) for leads
 * that already have a contact name (from BBB or website crawl).
 *
 * Method:
 *   1. Generate ~8 likely personal email patterns from first + last name
 *   2. Check each against Gravatar (free, no API key, no email sent)
 *      GET https://www.gravatar.com/avatar/{MD5(email)}?d=404&s=1
 *      → 200 = email is registered → confirmed personal email
 *      → 404 = not found
 *   3. Return the first hit
 *
 * Protection rules:
 *   - Skip if personal_email already set with confidence >= 70
 *   - Skip if personal_email_source marks it as already processed
 *   - Requires first_name OR last_name to generate candidates
 */

const https  = require('https');
const crypto = require('crypto');

const SKIP_SOURCES = new Set([
  'gravatar_confirmed', 'gravatar_not_found', 'gravatar_error', 'gravatar_skipped',
]);

// Generic business email prefixes — owner is unlikely to monitor these directly
const GENERIC_PREFIXES = new Set([
  'info','hello','contact','sales','admin','service','support','team',
  'office','mail','booking','bookings','reception','inquiry','inquiries',
  'enquiry','enquiries','billing','accounts','help','noreply','no-reply',
  'general','post','hq','web','online','us','we','email','company',
]);

/**
 * Infer whether to use the personal or business email for outreach.
 * - Generic business prefix (info@, hello@, etc.) → 'personal'
 * - No business email → 'personal'
 * - Personalised prefix (mark@, jorge@, etc.) → 'business' (already direct)
 */
function inferEmailPreference(businessEmail) {
  if (!businessEmail || !businessEmail.includes('@')) return 'personal';
  const prefix = businessEmail.split('@')[0].toLowerCase().replace(/[^a-z]/g, '');
  return GENERIC_PREFIXES.has(prefix) ? 'personal' : 'business';
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function md5(str) {
  return crypto.createHash('md5').update(str.toLowerCase().trim()).digest('hex');
}

function normalize(name) {
  return (name || '').toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Check if an email address has a Gravatar profile.
 * Returns true if 200, false if 404 or any error.
 */
function checkGravatar(email) {
  return new Promise((resolve) => {
    const hash = md5(email);
    const path = `/avatar/${hash}?d=404&s=1`;

    const options = {
      hostname: 'www.gravatar.com',
      path,
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    };

    const req = https.request(options, (res) => {
      resolve(res.statusCode === 200);
      res.resume(); // discard body
    });

    req.on('error', () => resolve(false));
    req.setTimeout(6000, () => { req.destroy(); resolve(false); });
    req.end();
  });
}

/**
 * Generate personal email candidates from first/last name.
 *
 * Priority 1 — same domain as existing business email (owner likely has own-domain email):
 *   mark@lonestarproservices.com
 *   mark.andersson@lonestarproservices.com
 *   markandersson@lonestarproservices.com
 *   m.andersson@lonestarproservices.com
 *   mandersson@lonestarproservices.com
 *
 * Priority 2 — common personal providers (Gmail / Yahoo / Outlook):
 *   mark.andersson@gmail.com  etc.
 */
function generateCandidates(firstName, lastName, existingEmail) {
  const f  = normalize(firstName);
  const l  = normalize(lastName);
  const fi = f ? f[0] : '';

  const candidates = [];

  // ── Priority 1: same domain permutations ──────────────────────────────────
  if (existingEmail && existingEmail.includes('@')) {
    const domain = existingEmail.split('@')[1].toLowerCase();

    if (f && l) {
      candidates.push(
        `${f}@${domain}`,
        `${f}.${l}@${domain}`,
        `${f}${l}@${domain}`,
        `${fi}.${l}@${domain}`,
        `${fi}${l}@${domain}`,
        `${f}_${l}@${domain}`,
      );
    } else if (f) {
      candidates.push(`${f}@${domain}`);
    } else if (l) {
      candidates.push(`${l}@${domain}`);
    }
  }

  // ── Priority 2: common personal providers ─────────────────────────────────
  if (f && l) {
    candidates.push(
      `${f}.${l}@gmail.com`,
      `${f}${l}@gmail.com`,
      `${fi}${l}@gmail.com`,
      `${f}.${l}@yahoo.com`,
      `${f}.${l}@outlook.com`,
      `${f}.${l}@hotmail.com`,
    );
  } else if (f) {
    candidates.push(`${f}@gmail.com`, `${f}@yahoo.com`);
  } else if (l) {
    candidates.push(`${l}@gmail.com`);
  }

  // Deduplicate and remove the original business email itself (no point re-checking it)
  const seen = new Set([existingEmail]);
  return candidates.filter(c => { if (seen.has(c)) return false; seen.add(c); return true; });
}

// ─── MAIN ENRICH FUNCTION ─────────────────────────────────────────────────────

/**
 * Find a personal email for a single lead via Gravatar.
 * Returns result object or null.
 */
async function gravatarEnrich(lead) {
  const { first_name, last_name, email } = lead;

  if (!first_name && !last_name) return null;

  const candidates = generateCandidates(first_name, last_name, email);
  if (candidates.length === 0) return null;

  for (const candidate of candidates) {
    // Polite micro-delay between checks
    await new Promise(r => setTimeout(r, 150));

    const found = await checkGravatar(candidate);
    if (found) {
      const isPersonal = candidate.includes('@gmail') || candidate.includes('@yahoo') ||
                         candidate.includes('@outlook') || candidate.includes('@hotmail');
      return {
        personal_email:            candidate,
        personal_email_confidence: isPersonal ? 80 : 65,
        personal_email_source:     'gravatar_confirmed',
      };
    }
  }

  return null;
}

// ─── PROTECTION CHECK ─────────────────────────────────────────────────────────

function needsGravatarEnrichment(lead) {
  if (lead.personal_email && (lead.personal_email_confidence || 0) >= 70) {
    return { needed: false, reason: 'Already has high-confidence personal email' };
  }
  if (lead.personal_email_source && SKIP_SOURCES.has(lead.personal_email_source)) {
    return { needed: false, reason: `Already processed: ${lead.personal_email_source}` };
  }
  if (!lead.first_name && !lead.last_name) {
    return { needed: false, reason: 'No name to generate candidates from' };
  }
  return { needed: true, reason: 'Missing personal email' };
}

// ─── DATABASE UPDATE ──────────────────────────────────────────────────────────

async function updateGravatarData(db, leadId, result, businessEmail) {
  if (!result) return null;

  const preference = inferEmailPreference(businessEmail);

  await db.query(
    `UPDATE discovery_leads
     SET personal_email            = $1,
         personal_email_confidence = $2,
         personal_email_source     = $3,
         email_preference          = $4
     WHERE id = $5`,
    [result.personal_email, result.personal_email_confidence, result.personal_email_source, preference, leadId]
  );

  return { ...result, email_preference: preference };
}

// ─── BATCH PROCESSOR ─────────────────────────────────────────────────────────

async function gravatarBatch(db, leadIds) {
  const results = { enriched: [], skipped: [], failed: [], total: leadIds.length };

  const { rows: leads } = await db.query(
    `SELECT id, company_name, first_name, last_name, email,
            personal_email, personal_email_confidence, personal_email_source
     FROM discovery_leads
     WHERE id = ANY($1) AND duplicate_flag IS NOT TRUE`,
    [leadIds]
  );

  for (const lead of leads) {
    const check = needsGravatarEnrichment(lead);
    if (!check.needed) {
      results.skipped.push({ lead_id: lead.id, company_name: lead.company_name, reason: check.reason });
      continue;
    }

    try {
      const result = await gravatarEnrich(lead);

      if (!result) {
        // Mark so we don't retry
        await db.query(
          `UPDATE discovery_leads SET personal_email_source = 'gravatar_not_found' WHERE id = $1`,
          [lead.id]
        );
        results.skipped.push({ lead_id: lead.id, company_name: lead.company_name, reason: 'Not found on Gravatar' });
        continue;
      }

      await updateGravatarData(db, lead.id, result, lead.email);
      results.enriched.push({
        lead_id:        lead.id,
        company_name:   lead.company_name,
        personal_email: result.personal_email,
        confidence:     result.personal_email_confidence,
      });

    } catch (err) {
      await db.query(
        `UPDATE discovery_leads SET personal_email_source = 'gravatar_error' WHERE id = $1`,
        [lead.id]
      );
      results.failed.push({ lead_id: lead.id, company_name: lead.company_name, error: err.message });
    }
  }

  return results;
}

module.exports = { gravatarEnrich, gravatarBatch, updateGravatarData, needsGravatarEnrichment, inferEmailPreference };
