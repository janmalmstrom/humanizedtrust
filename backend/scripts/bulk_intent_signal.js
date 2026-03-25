'use strict';
/**
 * Intent Signal Runner — standalone script
 *
 * Queries JobTech API for security hiring signals and matches to discovery_leads.
 * Lightweight — runs in < 30s. Safe to run daily.
 *
 * Usage:
 *   cd /home/janne/humanizedtrust/backend
 *   node scripts/bulk_intent_signal.js
 */

require('dotenv').config({ path: __dirname + '/../.env' });

const db = require('../src/db');
const { enrichIntentSignals } = require('../src/engines/enrich_intent_signal');

async function main() {
  console.log('[intent] ── Intent Signal Run ────────────────────────────');
  console.log('[intent] Querying JobTech API for NIS2/security hiring...');

  const start = Date.now();
  const result = await enrichIntentSignals(db);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`[intent] Signals found (unique companies): ${result.signalsFound}`);
  console.log(`[intent] Leads updated in DB:              ${result.leadsUpdated}`);
  console.log(`[intent] Elapsed: ${elapsed}s`);

  // Show top leads with intent signal
  const { rows: top } = await db.query(`
    SELECT company_name AS name, city, score, intent_signal_detail->>'employer_name' AS employer,
           jsonb_array_length(intent_signal_detail->'job_titles') AS open_roles
    FROM discovery_leads
    WHERE intent_signal = 'hiring_security'
    ORDER BY score DESC
    LIMIT 10
  `);

  if (top.length > 0) {
    console.log('\n[intent] Top leads with hiring_security signal:');
    console.log('[intent] ' + '-'.repeat(60));
    for (const r of top) {
      console.log(`[intent]  • ${r.name} (${r.city}) — score: ${r.score} — ${r.open_roles} open role(s)`);
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error('[intent] Fatal:', err.message);
  process.exit(1);
});
