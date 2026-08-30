#!/usr/bin/env node
/**
 * Import ALL US ketamine/infusion therapy leads from TrustLeads → HumanizedTrust
 * Source: TrustLeads discovery_leads (all non-duplicate ketamine leads)
 * Dedup: skips by email (when available) or company_name+state
 *
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
    console.log('[import] Fetching ALL ketamine leads from TrustLeads discovery_leads...');

    // Get existing leads in HumanizedTrust for dedup
    const { rows: existing } = await htClient.query(
      'SELECT email, company_name, state FROM discovery_leads'
    );
    const existingEmails = new Set(
      existing.filter(r => r.email).map(r => r.email.toLowerCase().trim())
    );
    const existingKeys = new Set(
      existing.map(r => `${(r.company_name || '').toLowerCase().trim()}|${(r.state || '').toLowerCase().trim()}`)
    );
    console.log(`[import] ${existing.length} leads already in HumanizedTrust`);

    // Fetch ALL ketamine leads (no approval/email filter — user will qualify manually)
    const { rows: leads } = await tlClient.query(`
      SELECT
        company_name,
        website,
        email,
        phone,
        city,
        state,
        linkedin_url,
        lead_score,
        niche,
        first_name,
        last_name,
        job_title
      FROM discovery_leads
      WHERE niche = 'ketamine_therapy'
        AND duplicate_flag = false
      ORDER BY lead_score DESC NULLS LAST
    `);

    console.log(`[import] Found ${leads.length} ketamine leads in TrustLeads`);

    // Dedup: skip if email matches, or if company+state matches (for null-email leads)
    const toImport = leads.filter(r => {
      if (r.email) {
        return !existingEmails.has(r.email.toLowerCase().trim());
      }
      const key = `${(r.company_name || '').toLowerCase().trim()}|${(r.state || '').toLowerCase().trim()}`;
      return !existingKeys.has(key);
    });

    console.log(`[import] ${toImport.length} new leads to import (${leads.length - toImport.length} already exist)`);

    if (toImport.length === 0) {
      console.log('[import] Nothing to import. All leads already in HumanizedTrust.');
      return;
    }

    let imported = 0;
    let skipped = 0;

    await htClient.query('BEGIN');

    for (const lead of toImport) {
      try {
        const score = lead.lead_score || 30;
        const score_label = score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold';

        const { rows } = await htClient.query(`
          INSERT INTO discovery_leads (
            company_name, website, email, phone,
            city, state, niche, linkedin_url,
            score, score_label,
            review_status, nace_code, nace_description
          ) VALUES ($1, $2, $3, $4, $5, $6, 'ketamine', $7, $8, $9, 'new', '86', 'Healthcare')
          RETURNING id
        `, [
          lead.company_name,
          lead.website || null,
          lead.email || null,
          lead.phone || null,
          lead.city || null,
          lead.state || null,
          lead.linkedin_url || null,
          score,
          score_label,
        ]);

        // Import contact if we have a name
        if (rows.length > 0 && (lead.first_name || lead.last_name)) {
          const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ');
          await htClient.query(`
            INSERT INTO contacts (lead_id, name, title, email, source)
            VALUES ($1, $2, $3, $4, 'trustleads')
          `, [rows[0].id, name, lead.job_title || 'Owner', lead.email || null]);
        }

        imported++;
      } catch (err) {
        console.error(`[import] Skip ${lead.company_name}: ${err.message}`);
        skipped++;
      }
    }

    await htClient.query('COMMIT');
    console.log(`[import] Done. Imported: ${imported}, Skipped: ${skipped}`);

    // Final count
    const { rows: count } = await htClient.query('SELECT COUNT(*) FROM discovery_leads');
    console.log(`[import] HumanizedTrust total: ${count[0].count} leads`);

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
