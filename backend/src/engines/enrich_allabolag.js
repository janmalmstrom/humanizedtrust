'use strict';
/**
 * Allabolag Enrichment Engine
 *
 * Fetches company page from allabolag.se and extracts:
 *   - VD (CEO) → personally liable under NIS2
 *   - ALL board members (Ledamot, Suppleant) → ALL personally liable under NIS2
 *   - Company phone / mobile / email (when registered)
 *
 * NIS2 context: management bodies are personally liable for cybersecurity failures.
 * Every board member is a valid outreach target.
 *
 * Data source: __NEXT_DATA__ JSON embedded in allabolag.se company pages
 * Rate limit: 2s between requests (allabolag rate limits aggressively)
 *
 * Requires: org_nr on discovery_lead
 * Writes:   contacts table (one row per board member)
 *           discovery_leads.allabolag_enriched_at
 *           discovery_leads.board_contacts_count
 *           discovery_leads.phone / email (if missing)
 */

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Skip non-decision-maker roles
const SKIP_ROLES = ['revisor', 'lekmannarevisor', 'auktor', 'godkänd'];

function shouldSkip(role) {
  if (!role) return true;
  const r = role.toLowerCase();
  return SKIP_ROLES.some(s => r.includes(s));
}

function getRolePriority(role) {
  if (!role) return 5;
  const r = role.toLowerCase();
  if (r.includes('verkst') || r === 'vd') return 1;           // VD — highest liability
  if (r.includes('ordförande')) return 2;                       // Board Chair
  if (r.includes('ledamot') && !r.includes('suppleant')) return 3; // Board Member
  if (r.includes('suppleant')) return 4;                        // Deputy
  return 5;
}

async function fetchAllabolagData(orgNr, { retries = 2, delayMs = 2000 } = {}) {
  if (!orgNr) return null;

  const normalized = orgNr.replace(/[-\s]/g, '');
  const url = `https://www.allabolag.se/${normalized}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(delayMs * attempt);

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'sv-SE,sv;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(12000),
      });

      if (!res.ok) continue;
      const html = await res.text();

      // Extract __NEXT_DATA__ JSON
      const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/);
      if (!m) continue;

      const parsed = JSON.parse(m[1]);
      const company = parsed.props && parsed.props.pageProps && parsed.props.pageProps.company;
      if (!company) continue;

      // --- Contacts from roles — ALL board members (NIS2: all are personally liable) ---
      const contacts = [];
      const roles = company.roles;

      if (roles) {
        // Manager field = VD directly (most reliable field)
        if (roles.manager && roles.manager.name) {
          contacts.push({
            name: roles.manager.name,
            title: 'VD',
            source: 'allabolag_roles',
            priority: 1,
          });
        }

        // All roleGroups — capture every board member, skip only auditors
        if (roles.roleGroups) {
          for (const group of roles.roleGroups) {
            for (const role of (group.roles || [])) {
              if (!role.name || !role.role) continue;
              if (shouldSkip(role.role)) continue;
              // Skip if already added (e.g. VD also listed as Ledamot)
              const alreadyAdded = contacts.some(c => c.name === role.name);
              if (alreadyAdded) continue;
              contacts.push({
                name: role.name,
                title: role.role,
                source: 'allabolag_roles',
                priority: getRolePriority(role.role),
              });
            }
          }
        }

        // Sort by priority so VD is always first
        contacts.sort((a, b) => a.priority - b.priority);
      }

      // --- Company-level contact info ---
      const companyContact = {
        phone: company.phone || company.mobile || null,
        email: company.email || null,
      };

      return { contacts, companyContact };

    } catch (err) {
      if (attempt === retries) throw err;
    }
  }

  return null;
}

/**
 * Enrich a single lead with allabolag data.
 * Upserts contacts and updates company phone/email if missing.
 *
 * @param {object} db  - pg pool
 * @param {object} lead - { id, org_nr, city, phone, email }
 * @returns {object} { contactsAdded, phoneUpdated, emailUpdated }
 */
async function enrichFromAllabolag(db, lead) {
  const result = { contactsAdded: 0, phoneUpdated: false, emailUpdated: false };

  const data = await fetchAllabolagData(lead.org_nr);
  if (!data) {
    // Mark as attempted even if no data
    await db.query(
      'UPDATE discovery_leads SET allabolag_enriched_at = NOW() WHERE id = $1',
      [lead.id]
    );
    return result;
  }

  // --- Upsert contacts ---
  for (const contact of data.contacts) {
    const { rows } = await db.query(
      `INSERT INTO contacts (lead_id, name, title, source, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [lead.id, contact.name, contact.title, contact.source]
    );
    if (rows.length > 0) result.contactsAdded++;
  }

  // --- Update company phone/email if missing ---
  const updates = [];
  const vals = [];

  if (data.companyContact.phone && !lead.phone) {
    updates.push(`phone = $${vals.push(data.companyContact.phone)}`);
    result.phoneUpdated = true;
  }
  if (data.companyContact.email && !lead.email) {
    updates.push(`email = $${vals.push(data.companyContact.email)}, email_source = $${vals.push('allabolag')}`);
    result.emailUpdated = true;
  }

  // Update board_contacts_count from DB (total contacts now linked to this lead)
  const { rows: countRows } = await db.query(
    `SELECT COUNT(*) AS cnt FROM contacts WHERE lead_id = $1 AND source LIKE '%allabolag%'`,
    [lead.id]
  );
  updates.push(`board_contacts_count = $${vals.push(parseInt(countRows[0].cnt))}`);
  updates.push(`allabolag_enriched_at = NOW()`);
  vals.push(lead.id);

  await db.query(
    `UPDATE discovery_leads SET ${updates.join(', ')} WHERE id = $${vals.length}`,
    vals
  );

  return result;
}

module.exports = { enrichFromAllabolag, fetchAllabolagData };
