#!/usr/bin/env node
/**
 * Import US ketamine/infusion therapy leads from TrustLeads DB → HumanizedTrust DB
 * Run: node scripts/import_ketamine_leads.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const htPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const tlPool = new Pool({
  connectionString: 'postgresql://trustleads_user:TL_9xK2mPqR7nVbW4@localhost:5434/trustleads',
});

async function run() {
  const tlClient = await tlPool.connect();
  const htClient = await htPool.connect();

  try {
    console.log('[import] Fetching ketamine leads from TrustLeads...');

    // Fetch all ketamine/infusion clinic companies with their best contact
    const { rows: companies } = await tlClient.query(`
      SELECT DISTINCT ON (c.id)
        c.id::text AS tl_id,
        c.company_name,
        c.website,
        c.phone,
        c.city,
        c.state,
        c.quality_score,
        c.service_type,
        ct.email,
        ct.full_name AS contact_name,
        ct.role_title AS contact_title
      FROM companies c
      LEFT JOIN contacts ct ON ct.company_id = c.id AND ct.email IS NOT NULL
      WHERE
        c.service_type ILIKE '%ketamine%'
        OR c.company_name ILIKE '%ketamine%'
        OR c.company_name ILIKE '%infusion%'
      ORDER BY c.id, ct.engagement_score DESC NULLS LAST
    `);

    console.log(`[import] Found ${companies.length} companies`);

    let imported = 0;
    let skipped = 0;

    await htClient.query('BEGIN');

    for (const co of companies) {
      try {
        const score = co.quality_score || 30;
        const score_label = score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold';

        const { rows } = await htClient.query(`
          INSERT INTO discovery_leads (
            company_name, website, email, phone,
            city, state, niche,
            score, score_label,
            review_status, nace_code, nace_description
          ) VALUES ($1, $2, $3, $4, $5, $6, 'ketamine', $7, $8, 'new', '86', 'Healthcare')
          RETURNING id
        `, [
          co.company_name,
          co.website || null,
          co.email || null,
          co.phone || null,
          co.city || null,
          co.state || null,
          score,
          score_label,
        ]);

        if (rows.length > 0 && co.contact_name && co.email) {
          await htClient.query(`
            INSERT INTO contacts (lead_id, name, title, email, source)
            VALUES ($1, $2, $3, $4, 'trustleads')
          `, [rows[0].id, co.contact_name, co.contact_title || 'Owner', co.email]);
        }

        imported++;
      } catch (err) {
        console.error(`[import] Skip ${co.company_name}: ${err.message}`);
        skipped++;
      }
    }

    await htClient.query('COMMIT');
    console.log(`[import] Done. Imported: ${imported}, Skipped: ${skipped}`);

  } catch (err) {
    await htClient.query('ROLLBACK');
    console.error('[import] Fatal error:', err.message);
    process.exit(1);
  } finally {
    tlClient.release();
    htClient.release();
    await tlPool.end();
    await htPool.end();
  }
}

run();
