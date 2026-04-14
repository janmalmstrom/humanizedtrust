'use strict';
/**
 * bulk_allabolag_sweetspot.js — Allabolag enrichment for sweet-spot leads not yet fetched
 *
 * Targets: nis2_registered + 50–249 employees + allabolag_enriched_at IS NULL
 * These were skipped by Phase 2 (below revenue threshold) but ARE NIS2-registered.
 *
 * Fetches: board contacts, company phone, company email (same as bulk_allabolag.js)
 * Then immediately checks email domain for Microsoft 365.
 *
 * Usage:
 *   node backend/scripts/bulk_allabolag_sweetspot.js [--dry-run]
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const dns = require('dns').promises;
const db  = require('../src/db');
const { enrichFromAllabolag } = require('../src/engines/enrich_allabolag');

const DRY_RUN          = process.argv.includes('--dry-run');
const ALLABOLAG_DELAY  = 2000;
const sleep            = ms => new Promise(r => setTimeout(r, ms));

const MS365_PATTERNS = ['mail.protection.outlook.com', 'onmicrosoft.com', 'smtp.microsoft.com'];

async function checkMs365FromEmail(email) {
  if (!email || !email.includes('@')) return false;
  const domain = email.split('@')[1];
  try {
    const records = await dns.resolveMx(domain);
    for (const rec of records) {
      if (MS365_PATTERNS.some(p => (rec.exchange || '').toLowerCase().includes(p))) return true;
    }
  } catch {}
  return false;
}

async function run() {
  const { rows: leads } = await db.query(
    `SELECT id, org_nr, company_name, city, phone, email, website
     FROM discovery_leads
     WHERE nis2_registered = true
       AND num_employees_exact BETWEEN 50 AND 249
       AND allabolag_enriched_at IS NULL
       AND org_nr IS NOT NULL
     ORDER BY score DESC NULLS LAST`
  );

  console.log(`[sweetspot-allabolag] ${leads.length} leads to enrich${DRY_RUN ? ' (DRY RUN)' : ''}`);

  let contacts = 0, emails = 0, phones = 0, ms365 = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];

    if (!DRY_RUN) {
      try {
        const result = await enrichFromAllabolag(db, lead);
        contacts += result.contactsAdded;
        if (result.emailUpdated) {
          emails++;
          // Re-fetch lead to get new email, then check M365
          const { rows } = await db.query('SELECT email FROM discovery_leads WHERE id = $1', [lead.id]);
          const newEmail = rows[0]?.email;
          if (newEmail) {
            const isM365 = await checkMs365FromEmail(newEmail);
            if (isM365) {
              ms365++;
              await db.query(
                `UPDATE discovery_leads SET tech_stack = 'microsoft365', ms365_detected_at = NOW() WHERE id = $1`,
                [lead.id]
              );
              console.log(`  ✅ M365: ${lead.company_name} (${newEmail})`);
            } else {
              await db.query(
                `UPDATE discovery_leads SET tech_stack = 'other', ms365_detected_at = NOW() WHERE id = $1`,
                [lead.id]
              );
            }
          }
        }
        if (result.phoneUpdated) phones++;
      } catch (err) {
        console.error(`  ❌ ${lead.company_name}: ${err.message}`);
      }
    }

    if (i % 10 === 0) {
      process.stdout.write(`\r  Progress: ${i + 1}/${leads.length} · contacts: ${contacts} · emails: ${emails} · M365: ${ms365}`);
    }

    await sleep(ALLABOLAG_DELAY);
  }

  console.log(`\n[sweetspot-allabolag] Done — contacts: ${contacts} · emails: ${emails} · phones: ${phones} · M365: ${ms365}`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
