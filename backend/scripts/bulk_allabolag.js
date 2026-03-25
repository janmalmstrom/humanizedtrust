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
 * Auto-reconnects on DB connection drops.
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
const DB_RETRY_DELAY_MS  = 10000; // 10s wait before reconnect attempt

const sleep = ms => new Promise(r => setTimeout(r, ms));

let running = true;
process.on('SIGINT', () => {
  console.log('\n[bulk] Caught Ctrl+C — finishing current lead then stopping...');
  running = false;
});

// Retry wrapper — handles transient DB connection drops
async function q(text, params, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      return await db.query(text, params);
    } catch (e) {
      const isConn = e.message.includes('Connection terminated') ||
                     e.message.includes('connection') ||
                     e.code === 'ECONNRESET' ||
                     e.code === 'ECONNREFUSED';
      if (isConn && i < retries - 1) {
        console.log(`\n[bulk] DB connection error (${e.message.slice(0, 60)}), retrying in ${DB_RETRY_DELAY_MS / 1000}s... (${i + 1}/${retries - 1})`);
        await sleep(DB_RETRY_DELAY_MS);
        continue;
      }
      throw e;
    }
  }
}

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

  const { rows: [counts] } = await q(`
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

  while (running) {
    const { rows: leads } = await q(`
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
        const result = await enrichFromAllabolag(db, lead);
        contactsAdded += result.contactsAdded;
        if (result.phoneUpdated) emailsFound++;
        if (result.emailUpdated) emailsFound++;

        if (result.contactsAdded > 0) {
          const { rows: newContacts } = await q(`
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
        await q(
          'UPDATE discovery_leads SET allabolag_enriched_at = NOW() WHERE id = $1',
          [lead.id]
        );
        console.error(`\n[bulk] error lead ${lead.id}: ${e.message}`);
      }

      processed++;

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

// Outer restart loop — if DB drops, wait and restart (script is fully resumable)
async function run() {
  while (true) {
    try {
      await main();
      break;
    } catch (err) {
      const isConn = err.message.includes('Connection terminated') ||
                     err.message.includes('connection') ||
                     err.code === 'ECONNRESET' ||
                     err.code === 'ECONNREFUSED';
      if (isConn && running) {
        console.log(`\n[bulk] Connection lost — restarting in ${DB_RETRY_DELAY_MS / 1000}s...`);
        await sleep(DB_RETRY_DELAY_MS);
      } else {
        console.error('[bulk] Fatal error:', err);
        process.exit(1);
      }
    }
  }
}

run();
