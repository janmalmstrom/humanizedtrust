const express = require('express');
const router = express.Router();
const db = require('../db');
const { computeScore } = require('../engines/scorer');
const { scrapeAllabolag, scrapeCompanyDetail, TARGET_SNI, SWEDISH_COUNTIES } = require('../engines/discovery_allabolag');

// GET /api/discovery/targets — available SNI codes and counties
router.get('/targets', (req, res) => {
  res.json({ success: true, data: { sni: TARGET_SNI, counties: SWEDISH_COUNTIES } });
});

// POST /api/discovery/run — trigger scrape batch
router.post('/run', async (req, res) => {
  const { sni_prefix, county, max_results = 50 } = req.body;
  if (!sni_prefix) return res.status(400).json({ success: false, error: 'sni_prefix required' });

  res.json({ success: true, data: { message: `Discovery started for SNI ${sni_prefix} / ${county || 'all counties'} — check back in 2 minutes` } });

  // Run in background
  setImmediate(async () => {
    try {
      console.log(`[discovery] Starting Allabolag scrape: SNI ${sni_prefix} / ${county}`);
      const companies = await scrapeAllabolag({ sniPrefix: sni_prefix, county, maxResults: max_results });

      let added = 0, skipped = 0;
      for (const company of companies) {
        if (!company.company_name) continue;
        try {
          const { rows } = await db.query(
            `INSERT INTO discovery_leads (org_nr, company_name, city, nace_code, employee_range, source)
             VALUES ($1, $2, $3, $4, $5, 'allabolag')
             ON CONFLICT (org_nr) DO NOTHING RETURNING id`,
            [company.org_nr, company.company_name, company.city, sni_prefix, company.employee_range]
          );
          if (rows[0]) {
            const { rows: full } = await db.query('SELECT * FROM discovery_leads WHERE id=$1', [rows[0].id]);
            const { score, label, breakdown } = computeScore(full[0]);
            await db.query('UPDATE discovery_leads SET score=$1,score_label=$2,score_breakdown=$3 WHERE id=$4',
              [score, label, JSON.stringify(breakdown), rows[0].id]);
            added++;
          } else { skipped++; }
        } catch (e) { console.error('[discovery] insert error:', e.message); }
      }
      console.log(`[discovery] Done: ${added} added, ${skipped} skipped`);
    } catch (err) {
      console.error('[discovery] run error:', err.message);
    }
  });
});

// POST /api/discovery/enrich-detail/:id — fetch full company detail from Allabolag
router.post('/enrich-detail/:id', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM discovery_leads WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
    const lead = rows[0];
    if (!lead.org_nr) return res.status(400).json({ success: false, error: 'No org_nr to look up' });

    res.json({ success: true, data: { message: 'Enriching in background...' } });

    setImmediate(async () => {
      const detail = await scrapeCompanyDetail(lead.org_nr);
      if (!detail) return;
      await db.query(
        `UPDATE discovery_leads SET
          website = COALESCE($1, website),
          phone = COALESCE($2, phone),
          address = COALESCE($3, address),
          postal_code = COALESCE($4, postal_code),
          city = COALESCE($5, city),
          county = COALESCE($6, county),
          nace_code = COALESCE($7, nace_code),
          nace_description = COALESCE($8, nace_description),
          employee_range = COALESCE($9, employee_range),
          revenue_range = COALESCE($10, revenue_range),
          last_enriched_at = NOW(),
          updated_at = NOW()
         WHERE id = $11`,
        [detail.website, detail.phone, detail.address, detail.postal_code,
         detail.city, detail.county, detail.nace_code, detail.nace_description,
         detail.employee_range, detail.revenue_range, lead.id]
      );
      // Re-score
      const { rows: updated } = await db.query('SELECT * FROM discovery_leads WHERE id=$1', [lead.id]);
      const { score, label, breakdown } = computeScore(updated[0]);
      await db.query('UPDATE discovery_leads SET score=$1,score_label=$2,score_breakdown=$3 WHERE id=$4',
        [score, label, JSON.stringify(breakdown), lead.id]);
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/discovery/import-nis2 — import NIS2 org list and cross-reference
router.post('/import-nis2', async (req, res) => {
  const { organizations } = req.body; // Array of { org_nr, company_name, sector }
  if (!Array.isArray(organizations)) return res.status(400).json({ success: false, error: 'organizations array required' });

  let imported = 0, matched = 0;
  for (const org of organizations) {
    try {
      await db.query(
        `INSERT INTO nis2_organizations (org_nr, company_name, sector) VALUES ($1,$2,$3) ON CONFLICT (org_nr) DO NOTHING`,
        [org.org_nr, org.company_name, org.sector]
      );
      imported++;

      // Cross-reference with existing leads
      const update = await db.query(
        `UPDATE discovery_leads SET nis2_registered=true, nis2_sector=$1, updated_at=NOW()
         WHERE org_nr=$2 AND nis2_registered IS DISTINCT FROM true RETURNING id`,
        [org.sector, org.org_nr]
      );
      if (update.rows.length) {
        // Re-score the matched lead
        const { rows } = await db.query('SELECT * FROM discovery_leads WHERE id=$1', [update.rows[0].id]);
        const { score, label, breakdown } = computeScore(rows[0]);
        await db.query('UPDATE discovery_leads SET score=$1,score_label=$2,score_breakdown=$3 WHERE id=$4',
          [score, label, JSON.stringify(breakdown), rows[0].id]);
        matched++;
      }
    } catch (e) { console.error('[nis2 import] error:', e.message); }
  }

  res.json({ success: true, data: { imported, matched_in_leads: matched } });
});

// POST /api/discovery/rescore-all — re-run scorer on all leads
router.post('/rescore-all', async (req, res) => {
  const { rescoreAll } = require('../engines/scorer');
  res.json({ success: true, data: { message: 'Rescoring in background...' } });
  setImmediate(async () => {
    const updated = await rescoreAll(db);
    console.log(`[rescore] Updated ${updated} leads`);
  });
});

module.exports = router;
