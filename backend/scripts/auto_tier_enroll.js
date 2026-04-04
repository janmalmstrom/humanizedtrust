/**
 * auto_tier_enroll.js
 *
 * Reads all unenrolled leads, assigns outreach tier based on signals,
 * and bulk-enrolls them in the matching Preheat sequence.
 *
 * Usage:
 *   node backend/scripts/auto_tier_enroll.js           # dry run (preview only)
 *   node backend/scripts/auto_tier_enroll.js --enroll  # actually enroll
 *   node backend/scripts/auto_tier_enroll.js --tier hot --enroll  # only hot tier
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../src/db');

const DRY_RUN = !process.argv.includes('--enroll');
const TIER_FILTER = (() => {
  const idx = process.argv.indexOf('--tier');
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

const SEQUENCE_NAMES = {
  hot:  'Preheat — Hot (Intent Signal)',
  warm: 'Preheat — Warm (Site Visit or Score 60+)',
  cold: 'Preheat — Cold (Standard)',
};

async function getSequenceIds() {
  const result = await db.query(
    `SELECT id, name FROM sequences WHERE name LIKE 'Preheat —%'`
  );
  const map = {};
  for (const row of result.rows) {
    if (row.name.includes('Hot'))  map.hot  = row.id;
    if (row.name.includes('Warm')) map.warm = row.id;
    if (row.name.includes('Cold')) map.cold = row.id;
  }
  return map;
}

async function getUnenrolledLeads(tier) {
  const tierFilter = tier ? `AND outreach_tier = '${tier}'` : '';
  const result = await db.query(
    `SELECT
       dl.id,
       dl.company_name,
       dl.score,
       dl.score_label,
       dl.intent_signal,
       dl.warm_signal,
       dl.outreach_tier,
       dl.review_status,
       dl.email
     FROM discovery_leads dl
     WHERE dl.review_status NOT IN ('rejected', 'customer')
       AND dl.email IS NOT NULL
       ${tierFilter}
       AND NOT EXISTS (
         SELECT 1 FROM sequence_enrollments se
         JOIN sequences s ON s.id = se.sequence_id
         WHERE se.lead_id = dl.id
           AND s.name LIKE 'Preheat —%'
           AND se.status IN ('active', 'completed')
       )
     ORDER BY
       CASE dl.outreach_tier WHEN 'hot' THEN 1 WHEN 'warm' THEN 2 ELSE 3 END,
       dl.score DESC NULLS LAST
    `
  );
  return result.rows;
}

async function enrollLead(leadId, sequenceId) {
  // Check not already enrolled
  const existing = await db.query(
    `SELECT id FROM sequence_enrollments WHERE lead_id = $1 AND sequence_id = $2`,
    [leadId, sequenceId]
  );
  if (existing.rows.length > 0) return false;

  const seq = await db.query(`SELECT steps FROM sequences WHERE id = $1`, [sequenceId]);
  if (!seq.rows.length) return false;

  const steps = seq.rows[0].steps;
  const enrolledAt = new Date();

  await db.query(
    `INSERT INTO sequence_enrollments (lead_id, sequence_id, enrolled_at, status, current_step)
     VALUES ($1, $2, NOW(), 'active', 0)`,
    [leadId, sequenceId]
  );

  // Create tasks for each step
  for (const step of steps) {
    const dueDate = new Date(enrolledAt);
    dueDate.setDate(dueDate.getDate() + step.day);
    await db.query(
      `INSERT INTO tasks (lead_id, title, due_date)
       VALUES ($1, $2, $3)`,
      [leadId, `[${step.channel.toUpperCase()}] ${step.title}`, dueDate]
    );
  }

  return true;
}

async function main() {
  console.log('\n🔥 Auto Tier Enroll — Preheating Engine');
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (preview only)' : '✅ LIVE — will enroll leads'}`);
  if (TIER_FILTER) console.log(`   Tier filter: ${TIER_FILTER}`);
  console.log('');

  const sequenceIds = await getSequenceIds();

  if (!sequenceIds.hot || !sequenceIds.warm || !sequenceIds.cold) {
    console.error('❌ Preheat sequences not found. Run migration 004_preheat_engine.sql first.');
    process.exit(1);
  }

  console.log('Sequences found:');
  console.log(`  🔥 Hot  → sequence id=${sequenceIds.hot}`);
  console.log(`  🟡 Warm → sequence id=${sequenceIds.warm}`);
  console.log(`  🔵 Cold → sequence id=${sequenceIds.cold}`);
  console.log('');

  const leads = await getUnenrolledLeads(TIER_FILTER);

  const tiers = { hot: [], warm: [], cold: [] };
  for (const lead of leads) {
    tiers[lead.outreach_tier]?.push(lead) ?? tiers.cold.push(lead);
  }

  console.log(`Unenrolled leads found: ${leads.length}`);
  console.log(`  🔥 Hot:  ${tiers.hot.length}`);
  console.log(`  🟡 Warm: ${tiers.warm.length}`);
  console.log(`  🔵 Cold: ${tiers.cold.length}`);
  console.log('');

  if (DRY_RUN) {
    console.log('--- DRY RUN PREVIEW (first 5 per tier) ---');
    for (const [tier, tierLeads] of Object.entries(tiers)) {
      const icon = tier === 'hot' ? '🔥' : tier === 'warm' ? '🟡' : '🔵';
      console.log(`\n${icon} ${tier.toUpperCase()} (${tierLeads.length} leads) → "${SEQUENCE_NAMES[tier]}":`);
      tierLeads.slice(0, 5).forEach(l =>
        console.log(`   - ${l.company_name} | score=${l.score} | intent=${l.intent_signal || '-'} | warm=${l.warm_signal}`)
      );
      if (tierLeads.length > 5) console.log(`   ... and ${tierLeads.length - 5} more`);
    }
    console.log('\nRun with --enroll to proceed.');
    process.exit(0);
  }

  let enrolled = 0, skipped = 0, errors = 0;

  for (const [tier, tierLeads] of Object.entries(tiers)) {
    const sequenceId = sequenceIds[tier];
    const icon = tier === 'hot' ? '🔥' : tier === 'warm' ? '🟡' : '🔵';

    for (const lead of tierLeads) {
      try {
        const ok = await enrollLead(lead.id, sequenceId);
        if (ok) {
          enrolled++;
          console.log(`${icon} Enrolled: ${lead.company_name} → ${SEQUENCE_NAMES[tier]}`);
        } else {
          skipped++;
        }
      } catch (err) {
        errors++;
        console.error(`❌ Error enrolling ${lead.company_name}: ${err.message}`);
      }
    }
  }

  console.log(`\n✅ Done: ${enrolled} enrolled · ${skipped} skipped · ${errors} errors`);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
