/**
 * daily_enroll.js
 *
 * Drip-enrolls 10 new leads/day into "Microsoft 365 NIS2 Security" sequence.
 * Skips weekends — run via cron Mon–Fri only (0 7 * * 1-5).
 *
 * Usage:
 *   node backend/scripts/daily_enroll.js           # dry run
 *   node backend/scripts/daily_enroll.js --enroll  # live
 *   node backend/scripts/daily_enroll.js --limit 5 --enroll  # custom limit
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../src/db');

const DRY_RUN = !process.argv.includes('--enroll');
const LIMIT = (() => {
  const idx = process.argv.indexOf('--limit');
  return idx !== -1 ? parseInt(process.argv[idx + 1]) : 10;
})();

const SEQUENCE_NAME = 'Microsoft 365 NIS2 Security';

// Push date to next Monday if it falls on a weekend
function nextBusinessDay(date) {
  const d = new Date(date);
  const day = d.getDay();
  if (day === 6) d.setDate(d.getDate() + 2); // Sat → Mon
  if (day === 0) d.setDate(d.getDate() + 1); // Sun → Mon
  return d;
}

async function main() {
  const today = new Date();
  const dayOfWeek = today.getDay();

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    console.log('Weekend — skipping daily enroll.');
    process.exit(0);
  }

  console.log(`\n📅 Daily Enroll — ${SEQUENCE_NAME}`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'} · Limit: ${LIMIT}\n`);

  // Get sequence
  const { rows: seqRows } = await db.query(
    `SELECT id, steps FROM sequences WHERE name = $1`,
    [SEQUENCE_NAME]
  );
  if (!seqRows.length) {
    console.error(`Sequence "${SEQUENCE_NAME}" not found.`);
    process.exit(1);
  }
  const { id: sequenceId, steps } = seqRows[0];
  const parsedSteps = Array.isArray(steps) ? steps : JSON.parse(steps);

  // Get unenrolled leads — sweet_spot first, then score
  const { rows: leads } = await db.query(
    `SELECT dl.id, dl.company_name, dl.email, dl.score, dl.outreach_tier, dl.intent_signal
     FROM discovery_leads dl
     WHERE dl.email IS NOT NULL
       AND dl.review_status NOT IN ('rejected', 'customer')
       AND NOT EXISTS (
         SELECT 1 FROM sequence_enrollments se
         WHERE se.lead_id = dl.id AND se.sequence_id = $1
           AND se.status IN ('active', 'completed')
       )
     ORDER BY
       CASE WHEN dl.outreach_tier = 'sweet_spot' THEN 0 ELSE 1 END,
       dl.score DESC NULLS LAST
     LIMIT $2`,
    [sequenceId, LIMIT]
  );

  if (!leads.length) {
    console.log('No unenrolled leads found.');
    process.exit(0);
  }

  console.log(`Leads to enroll: ${leads.length}`);
  if (DRY_RUN) {
    leads.forEach(l => console.log(`  - ${l.company_name} | score=${l.score} | tier=${l.outreach_tier}`));
    console.log('\nRun with --enroll to proceed.');
    process.exit(0);
  }

  let enrolled = 0, errors = 0;

  for (const lead of leads) {
    try {
      await db.query(
        `INSERT INTO sequence_enrollments (lead_id, sequence_id, enrolled_at, status, current_step)
         VALUES ($1, $2, NOW(), 'active', 0)`,
        [lead.id, sequenceId]
      );

      for (const step of parsedSteps) {
        const dueDate = nextBusinessDay(new Date(today.getTime() + step.day * 86400000));
        await db.query(
          `INSERT INTO tasks (lead_id, title, due_date) VALUES ($1, $2, $3)`,
          [lead.id, `[${step.channel.toUpperCase()}] ${step.title}`, dueDate]
        );
      }

      enrolled++;
      console.log(`✅ Enrolled: ${lead.company_name}`);
    } catch (err) {
      errors++;
      console.error(`❌ ${lead.company_name}: ${err.message}`);
    }
  }

  console.log(`\nDone: ${enrolled} enrolled · ${errors} errors`);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
