'use strict';
/**
 * Phase 1: Bulk Annual Report Runner
 *
 * Fetches revenue, profit, and employee count from allabolag.se for ALL leads.
 * Same URL as allabolag board member fetch — no extra cost per company.
 *
 * After this runs you know EXACTLY which companies qualify for NIS2:
 *   - Essential entities:  250+ employees OR revenue >= 50M EUR (~550 MSEK)
 *   - Important entities:  50–249 employees AND revenue >= 10M EUR (~110 MSEK)
 *
 * Phase 2 (bulk_allabolag.js) will then fetch board members ONLY for qualifiers.
 *
 * Resumable — skips leads where annual_report_fetched_at IS NOT NULL.
 * Auto-reconnects on DB connection drops.
 *
 * Usage:
 *   cd /home/janne/humanizedtrust/backend
 *   node scripts/bulk_annual_report.js
 *
 * Press Ctrl+C to stop — resumes where it left off next time.
 */

require('dotenv').config({ path: __dirname + '/../.env' });

const db = require('../src/db');
const { fetchAnnualReport } = require('../src/engines/enrich_annual_report');

const DELAY_MS           = 2000;   // 2s between requests (allabolag rate limit)
const PAGE_SIZE          = 500;
const DB_RETRY_DELAY_MS  = 10000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

let running = true;
process.on('SIGINT', () => {
  console.log('\n[phase1] Caught Ctrl+C — finishing current lead then stopping...');
  running = false;
});

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
        console.log(`\n[phase1] DB connection error, retrying in ${DB_RETRY_DELAY_MS / 1000}s...`);
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
  console.log('[phase1] ── Phase 1: Annual Report Fetch ──────────────────');
  console.log('[phase1] Fetching revenue + employees for all leads');
  console.log('[phase1] Purpose: identify NIS2-qualifying companies for Phase 2\n');

  const { rows: [counts] } = await q(`
    SELECT
      COUNT(*) FILTER (WHERE annual_report_fetched_at IS NULL) AS pending,
      COUNT(*) FILTER (WHERE annual_report_fetched_at IS NOT NULL) AS done,
      COUNT(*) AS total
    FROM discovery_leads
    WHERE org_nr IS NOT NULL
      AND review_status != 'rejected'
  `);

  const totalPending = parseInt(counts.pending);
  const alreadyDone  = parseInt(counts.done);
  const grandTotal   = parseInt(counts.total);

  console.log(`[phase1] ${grandTotal.toLocaleString()} leads with org_nr`);
  console.log(`[phase1] ${alreadyDone.toLocaleString()} already fetched`);
  console.log(`[phase1] ${totalPending.toLocaleString()} pending`);

  if (totalPending === 0) {
    console.log('[phase1] All done! Run bulk_allabolag.js for Phase 2.');
    printSummaryStats();
    process.exit(0);
  }

  const estHours = ((totalPending * DELAY_MS) / 1000 / 3600).toFixed(1);
  console.log(`[phase1] Estimated time: ~${estHours}h`);
  console.log('[phase1] Press Ctrl+C to stop and resume later\n');

  let processed   = 0;
  let found        = 0;
  let nis2Eligible = 0;
  const startMs    = Date.now();

  while (running) {
    const { rows: leads } = await q(`
      SELECT id, org_nr
      FROM discovery_leads
      WHERE org_nr IS NOT NULL
        AND annual_report_fetched_at IS NULL
        AND review_status != 'rejected'
      ORDER BY score DESC NULLS LAST
      LIMIT $1
    `, [PAGE_SIZE]);

    if (leads.length === 0) {
      console.log('\n[phase1] All done!');
      break;
    }

    for (const lead of leads) {
      if (!running) break;

      try {
        const fin = await fetchAnnualReport(lead.org_nr);

        if (fin) {
          await q(`
            UPDATE discovery_leads
            SET revenue_sek          = $1,
                profit_sek           = $2,
                num_employees_exact  = $3,
                annual_report_year   = $4,
                annual_report_fetched_at = NOW(),
                updated_at           = NOW()
            WHERE id = $5
          `, [fin.revenue_sek, fin.profit_sek, fin.num_employees_exact, fin.annual_report_year, lead.id]);

          found++;

          // NIS2: essential (250+ emp OR 550M+ SEK rev) or important (50-249 emp AND 110M+ SEK rev)
          const isEssential = fin.num_employees_exact >= 250 || fin.revenue_sek >= 550_000_000;
          const isImportant = fin.num_employees_exact >= 50  && fin.revenue_sek >= 110_000_000;
          if (isEssential || isImportant) nis2Eligible++;

        } else {
          // Mark as attempted so we skip it next run
          await q(
            'UPDATE discovery_leads SET annual_report_fetched_at = NOW() WHERE id = $1',
            [lead.id]
          );
        }
      } catch (e) {
        await q(
          'UPDATE discovery_leads SET annual_report_fetched_at = NOW() WHERE id = $1',
          [lead.id]
        );
        console.error(`\n[phase1] error lead ${lead.id}: ${e.message}`);
      }

      processed++;

      if (processed % 10 === 0) {
        const pct  = ((processed / totalPending) * 100).toFixed(1);
        const rate = (processed / ((Date.now() - startMs) / 1000)).toFixed(2);
        process.stdout.write(
          `\r[phase1] ${processed.toLocaleString()}/${totalPending.toLocaleString()} (${pct}%) ` +
          `| found: ${found.toLocaleString()} ` +
          `| NIS2 eligible: ${nis2Eligible.toLocaleString()} ` +
          `| ${rate}/s ` +
          `| ETA: ${eta(processed, totalPending, startMs)}   `
        );
      }

      await sleep(DELAY_MS);
    }
  }

  const elapsed = ((Date.now() - startMs) / 1000 / 60).toFixed(1);
  console.log(`\n\n[phase1] ── Summary ────────────────────────────────────`);
  console.log(`[phase1] Leads processed  : ${processed.toLocaleString()}`);
  console.log(`[phase1] Financial data   : ${found.toLocaleString()}`);
  console.log(`[phase1] NIS2 eligible    : ${nis2Eligible.toLocaleString()}`);
  console.log(`[phase1] Elapsed          : ${elapsed} min`);
  console.log(`[phase1] ────────────────────────────────────────────────`);

  if (!running) {
    console.log('[phase1] Stopped early — run again to resume.');
  } else {
    console.log('[phase1] Phase 1 complete!');
    console.log('[phase1] Next: run bulk_allabolag.js — it will now only target NIS2-qualifying companies.');
  }

  process.exit(0);
}

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
        console.log(`\n[phase1] Connection lost — restarting in ${DB_RETRY_DELAY_MS / 1000}s...`);
        await sleep(DB_RETRY_DELAY_MS);
      } else {
        console.error('[phase1] Fatal error:', err);
        process.exit(1);
      }
    }
  }
}

run();
