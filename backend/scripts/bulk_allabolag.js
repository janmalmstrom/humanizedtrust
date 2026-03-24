'use strict';
/**
 * Bulk Allabolag + Hitta Runner
 *
 * Processes ALL leads with org_nr through:
 *   1. Allabolag → board member names + company phone/email
 *   2. Hitta.se  → personal mobile for each board member
 *
 * No API keys needed. Fully free.
 * Resumable — skips leads already processed (allabolag_enriched_at IS NOT NULL)
 *
 * Usage:
 *   cd /home/janne/humanizedtrust/backend
 *   node scripts/bulk_allabolag.js
 *
 * Press Ctrl+C to stop — resumes where it left off next time.
 */

require('dotenv').config({ path: __dirname + '/../.env' });

const db = require('../src/db');
const { enrichFromAllabolag } = require('../src/engines/enrich_allabolag');
const { enrichContactPhone } = require('../src/engines/enrich_hitta');

const ALLABOLAG_DELAY_MS = 2000;  // 2s between allabolag requests
const HITTA_DELAY_MS     = 1500;  // 1.5s between hitta requests
const PAGE_SIZE          = 500;   // leads fetched per DB query

const sleep = ms => new Promise(r => setTimeout(r, ms));

let running = true;
process.on('SIGINT', () => {
  console.log('\n[bulk] Caught Ctrl+C — finishing current lead then stopping...');
  running = false;
});

function eta(done, total, startMs) {
  if (done === 0) return '?';
  const elapsed = (Date.now() - startMs) / 1000;
  const rate = done / elapsed;
  const remaining = (total - done) / rate;
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

async function main() {
  console.log('[bulk] Starting bulk allabolag + hitta enrichment');

  // Count total pending
  const { rows: [counts] } = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE allabolag_enriched_at IS NULL) AS pending,
      COUNT(*) FILTER (WHERE allabolag_enriched_at IS NOT NULL) AS done,
      COUNT(*) AS total
    FROM discovery_leads
    WHERE org_nr IS NOT NULL
      AND review_status != 'rejected'
  `);

  const totalPending = parseInt(counts.pending);
  const alreadyDone  = parseInt(counts.done);
  const grandTotal   = parseInt(counts.total);

  console.log(`[bulk] ${grandTotal.toLocaleString()} leads with org_nr`);
  console.log(`[bulk] ${alreadyDone.toLocaleString()} already processed`);
  console.log(`[bulk] ${totalPending.toLocaleString()} pending`);

  if (totalPending === 0) {
    console.log('[bulk] All leads already enriched. Nothing to do.');
    process.exit(0);
  }

  const estHours = ((totalPending * ALLABOLAG_DELAY_MS) / 1000 / 3600).toFixed(1);
  console.log(`[bulk] Estimated time at 2s/lead: ~${estHours}h`);
  console.log('[bulk] Press Ctrl+C to stop and resume later\n');

  let processed = 0;
  let contactsAdded = 0;
  let phonesFound = 0;
  let emailsFound = 0;
  const startMs = Date.now();
  let offset = 0;

  while (running) {
    // Fetch a page of unprocessed leads (no score filter — process everyone)
    const { rows: leads } = await db.query(`
      SELECT id, org_nr, city, phone, email
      FROM discovery_leads
      WHERE org_nr IS NOT NULL
        AND allabolag_enriched_at IS NULL
        AND review_status != 'rejected'
      ORDER BY score DESC NULLS LAST
      LIMIT $1
    `, [PAGE_SIZE]);

    if (leads.length === 0) {
      console.log('\n[bulk] All done!');
      break;
    }

    for (const lead of leads) {
      if (!running) break;

      try {
        // Step 1: Allabolag
        const result = await enrichFromAllabolag(db, lead);
        contactsAdded += result.contactsAdded;
        if (result.phoneUpdated) emailsFound++;   // reusing var — count any update
        if (result.emailUpdated) emailsFound++;

        // Step 2: Hitta for ALL new contacts on this lead (inline, not batched)
        if (result.contactsAdded > 0) {
          const { rows: newContacts } = await db.query(`
            SELECT c.id, c.name, c.phone, dl.city AS lead_city
            FROM contacts c
            JOIN discovery_leads dl ON dl.id = c.lead_id
            WHERE c.lead_id = $1
              AND c.phone IS NULL
              AND c.name IS NOT NULL
              AND c.source LIKE '%allabolag%'
          `, [lead.id]);

          for (const contact of newContacts) {
            if (!running) break;
            try {
              const found = await enrichContactPhone(db, contact);
              if (found) phonesFound++;
            } catch (e) {
              // hitta errors are non-fatal
            }
            await sleep(HITTA_DELAY_MS);
          }
        }
      } catch (e) {
        // Mark as attempted so we don't retry this lead in a broken state
        await db.query(
          'UPDATE discovery_leads SET allabolag_enriched_at = NOW() WHERE id = $1',
          [lead.id]
        );
        console.error(`[bulk] error lead ${lead.id}: ${e.message}`);
      }

      processed++;

      // Progress every 10 leads
      if (processed % 10 === 0) {
        const pct = ((processed / totalPending) * 100).toFixed(1);
        const rate = (processed / ((Date.now() - startMs) / 1000)).toFixed(2);
        process.stdout.write(
          `\r[bulk] ${processed.toLocaleString()}/${totalPending.toLocaleString()} (${pct}%) ` +
          `| contacts: ${contactsAdded.toLocaleString()} ` +
          `| phones: ${phonesFound.toLocaleString()} ` +
          `| ${rate}/s ` +
          `| ETA: ${eta(processed, totalPending, startMs)}   `
        );
      }

      await sleep(ALLABOLAG_DELAY_MS);
    }

    offset += PAGE_SIZE;
  }

  const elapsed = ((Date.now() - startMs) / 1000 / 60).toFixed(1);
  console.log(`\n\n[bulk] ── Summary ──────────────────────────`);
  console.log(`[bulk] Leads processed : ${processed.toLocaleString()}`);
  console.log(`[bulk] Contacts added  : ${contactsAdded.toLocaleString()}`);
  console.log(`[bulk] Phones found    : ${phonesFound.toLocaleString()}`);
  console.log(`[bulk] Elapsed         : ${elapsed} min`);
  console.log(`[bulk] ─────────────────────────────────────`);

  process.exit(0);
}

main().catch(err => {
  console.error('[bulk] Fatal error:', err);
  process.exit(1);
});
