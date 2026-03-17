/**
 * SMTP Permutation Email Finder
 *
 * For leads with a known owner name and a company website, this engine:
 *   1. Extracts the domain from the website URL
 *   2. Checks that the domain has MX records (if not, skip)
 *   3. Tests whether the domain is a "catch-all" (accepts all addresses)
 *      — if so, skip to avoid false positives
 *   4. Generates ~8 common email permutations (firstname.lastname@domain, etc.)
 *   5. Verifies each via an SMTP RCPT TO handshake — no email is actually sent
 *   6. Returns the first verified hit
 *
 * Free, no API key, no third-party service, no email sent.
 */

const net  = require('net');
const dns  = require('dns').promises;

const SMTP_EHLO       = 'trustleadsbot.xyz'; // identifies us in EHLO
const CONNECT_TIMEOUT = 9000;                // ms per TCP connection attempt
const CHECK_DELAY     = 450;                 // ms between permutation checks (polite)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Domain helpers ────────────────────────────────────────────────────────

function extractDomain(website) {
  try {
    let url = website;
    if (!url.startsWith('http')) url = 'https://' + url;
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch { return null; }
}

async function getMxHost(domain) {
  try {
    const records = await dns.resolveMx(domain);
    if (!records?.length) return null;
    records.sort((a, b) => a.priority - b.priority);
    return records[0].exchange;
  } catch { return null; }
}

// ─── Email permutation generator ──────────────────────────────────────────

function generatePermutations(firstName, lastName, domain) {
  const f  = (firstName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const l  = (lastName  || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const fi = f.charAt(0);
  const li = l.charAt(0);

  const candidates = [];

  if (f && l) {
    candidates.push(
      `${f}.${l}@${domain}`,    // john.smith   (most common)
      `${f}${l}@${domain}`,     // johnsmith
      `${fi}${l}@${domain}`,    // jsmith
      `${fi}.${l}@${domain}`,   // j.smith
      `${f}.${li}@${domain}`,   // john.s
      `${f}@${domain}`,         // john
      `${l}.${f}@${domain}`,    // smith.john
      `${l}${fi}@${domain}`,    // smithj
    );
  } else if (f) {
    candidates.push(`${f}@${domain}`);
  } else if (l) {
    candidates.push(`${l}@${domain}`, `${li}@${domain}`);
  }

  // Deduplicate while preserving order
  return [...new Set(candidates)];
}

// ─── SMTP RCPT TO handshake ────────────────────────────────────────────────

/**
 * Connect to mx host port 25, run a minimal SMTP session through RCPT TO.
 * Returns { exists: boolean, code: number, note: string }
 * No email is ever sent — we QUIT immediately after RCPT TO.
 */
function smtpCheck(email, mxHost) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (result) => {
      if (!settled) { settled = true; socket.destroy(); resolve(result); }
    };

    const socket = net.createConnection({ host: mxHost, port: 25 });
    socket.setTimeout(CONNECT_TIMEOUT);

    let buf = '';
    let step = 0;

    socket.on('data', (chunk) => {
      buf += chunk.toString();
      // Process all complete lines
      const lines = buf.split('\r\n');
      buf = lines.pop(); // keep incomplete trailing line

      for (const line of lines) {
        if (!line) continue;
        const code = parseInt(line.slice(0, 3), 10);

        if (step === 0 && code === 220) {
          socket.write(`EHLO ${SMTP_EHLO}\r\n`);
          step = 1;
        } else if (step === 1 && !isNaN(code)) {
          // EHLO may return multiple 250- continuation lines — wait for final 250 (no dash)
          if (code === 250 && !line.startsWith('250-')) {
            socket.write(`MAIL FROM:<>\r\n`); // RFC 5321 null sender for probing
            step = 2;
          } else if (code !== 250) {
            done({ exists: false, code, note: 'EHLO rejected: ' + line.slice(0, 80) });
          }
        } else if (step === 2 && code === 250) {
          socket.write(`RCPT TO:<${email}>\r\n`);
          step = 3;
        } else if (step === 3) {
          socket.write('QUIT\r\n');
          done({ exists: code === 250, code, note: line.slice(0, 100) });
        }
      }
    });

    socket.on('timeout', () => done({ exists: false, code: 0, note: 'timeout' }));
    socket.on('error',   (err) => done({ exists: false, code: 0, note: err.message }));
    socket.on('close',   ()    => done({ exists: false, code: 0, note: 'connection closed' }));
  });
}

/**
 * Quick connectivity probe: try to connect on port 25 with a short timeout.
 * Returns true if the server responds with a 220 greeting (port is accessible).
 */
function canConnectSmtp(mxHost) {
  return new Promise((resolve) => {
    const PROBE_TIMEOUT = 5000; // faster timeout for initial probe
    const socket = net.createConnection({ host: mxHost, port: 25 });
    socket.setTimeout(PROBE_TIMEOUT);
    let resolved = false;
    const done = (ok) => { if (!resolved) { resolved = true; socket.destroy(); resolve(ok); } };
    socket.on('data', (chunk) => {
      if (chunk.toString().startsWith('220')) done(true); // got SMTP greeting
    });
    socket.on('timeout', () => done(false));
    socket.on('error',   () => done(false));
    socket.on('close',   () => done(false));
  });
}

/**
 * Catch-all detection: probe a random address.
 * If the server accepts it → domain accepts everything → skip to avoid false positives.
 */
async function isCatchAll(domain, mxHost) {
  const rand = `xyznotarealuser${Math.random().toString(36).slice(2, 10)}@${domain}`;
  const r = await smtpCheck(rand, mxHost);
  return r.exists;
}

// ─── Main enrichment function ──────────────────────────────────────────────

async function smtpPermutationEnrich(lead) {
  if (!lead.website) return { status: 'skipped', reason: 'No website' };

  const domain = extractDomain(lead.website);
  if (!domain)  return { status: 'skipped', reason: 'Could not parse domain from website' };

  const hasName = (lead.first_name && lead.first_name.length > 1) ||
                  (lead.last_name  && lead.last_name.length  > 1);
  if (!hasName) return { status: 'skipped', reason: 'No owner name to build permutations from' };

  // MX check
  const mxHost = await getMxHost(domain);
  if (!mxHost) return { status: 'no_mx', reason: `${domain} has no MX records`, domain };

  await sleep(200);

  // Quick connectivity check — if port 25 is blocked, bail fast instead of 9×timeout
  const reachable = await canConnectSmtp(mxHost);
  if (!reachable) return { status: 'no_smtp', reason: `Port 25 blocked by ${mxHost} (Google/GoDaddy/M365 block cloud IPs)`, domain };

  await sleep(CHECK_DELAY);

  // Catch-all check
  const catchAll = await isCatchAll(domain, mxHost);
  if (catchAll) return { status: 'catch_all', reason: 'Domain is catch-all — cannot verify individuals', domain };

  await sleep(CHECK_DELAY);

  // Try each permutation
  const candidates = generatePermutations(lead.first_name, lead.last_name, domain);

  for (const email of candidates) {
    const result = await smtpCheck(email, mxHost);
    if (result.exists) {
      return {
        status:            'found',
        email,
        domain,
        confidence:        85, // SMTP RCPT TO confirmed delivery path exists
        smtp_code:         result.code,
        permutations_tried: candidates.length,
      };
    }
    await sleep(CHECK_DELAY);
  }

  return {
    status:            'not_found',
    reason:            'All permutations rejected by mail server',
    domain,
    permutations_tried: candidates.length,
  };
}

// ─── Guard / update helpers ────────────────────────────────────────────────

function needsSmtpEnrichment(lead) {
  if (lead.email)                            return { needed: false, reason: 'Already has email' };
  if (lead.smtp_perm_status === 'found')     return { needed: false, reason: 'Already found via SMTP' };
  if (lead.smtp_perm_status === 'not_found') return { needed: false, reason: 'Already tried — not found' };
  if (lead.smtp_perm_status === 'catch_all') return { needed: false, reason: 'Catch-all domain' };
  if (lead.smtp_perm_status === 'no_smtp')   return { needed: false, reason: 'Port 25 blocked (major provider)' };
  if (!lead.website)                         return { needed: false, reason: 'No website' };

  const hasName = (lead.first_name && lead.first_name.length > 1) ||
                  (lead.last_name  && lead.last_name.length  > 1);
  if (!hasName) return { needed: false, reason: 'No owner name' };

  return { needed: true, reason: 'Has name + website, missing email' };
}

async function updateSmtpData(db, leadId, result) {
  if (result.status === 'found') {
    await db.query(`
      UPDATE discovery_leads SET
        email            = $1,
        email_source     = 'smtp_permutation',
        email_confidence = $2,
        email_status     = 'smtp_verified',
        smtp_perm_status = 'found',
        smtp_perm_at     = NOW(),
        enrich_status    = 'enriched'
      WHERE id = $3
    `, [result.email, result.confidence, leadId]);
  } else {
    await db.query(
      `UPDATE discovery_leads SET smtp_perm_status = $1, smtp_perm_at = NOW() WHERE id = $2`,
      [result.status, leadId]
    );
  }
}

// ─── Batch helper (for manual endpoint) ───────────────────────────────────

async function smtpBatch(db, leadIds) {
  const results = { enriched: [], skipped: [], failed: [], total: leadIds.length };

  const { rows: leads } = await db.query(
    `SELECT id, company_name, first_name, last_name, website, email, smtp_perm_status
     FROM discovery_leads WHERE id = ANY($1) AND review_status != 'rejected'`,
    [leadIds]
  );

  for (const lead of leads) {
    const check = needsSmtpEnrichment(lead);
    if (!check.needed) {
      results.skipped.push({ lead_id: lead.id, company_name: lead.company_name, reason: check.reason });
      continue;
    }
    try {
      const result = await smtpPermutationEnrich(lead);
      await updateSmtpData(db, lead.id, result);
      if (result.status === 'found') {
        results.enriched.push({ lead_id: lead.id, company_name: lead.company_name, email: result.email });
      } else {
        results.skipped.push({ lead_id: lead.id, company_name: lead.company_name, reason: result.reason || result.status });
      }
    } catch (err) {
      await db.query(
        `UPDATE discovery_leads SET smtp_perm_status = 'error', smtp_perm_at = NOW() WHERE id = $1`,
        [lead.id]
      );
      results.failed.push({ lead_id: lead.id, company_name: lead.company_name, error: err.message });
    }
  }

  return results;
}

module.exports = {
  smtpPermutationEnrich,
  smtpBatch,
  updateSmtpData,
  needsSmtpEnrichment,
  generatePermutations,
  extractDomain,
};
