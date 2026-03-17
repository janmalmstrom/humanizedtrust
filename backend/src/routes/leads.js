const express = require('express');
const router = express.Router();
const db = require('../db');
const { computeScore } = require('../engines/scorer');

// GET /api/leads — list with filters
router.get('/', async (req, res) => {
  const {
    page = 1, limit = 50,
    status, county, nace, employees, nis2,
    score_min, score_label, search,
    sort = 'score', dir = 'desc'
  } = req.query;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  const conditions = [];

  if (status)      { params.push(status);     conditions.push(`review_status = $${params.length}`); }
  if (county)      { params.push(county);     conditions.push(`county ILIKE $${params.length}`); }
  if (nace)        { params.push(`${nace}%`); conditions.push(`nace_code LIKE $${params.length}`); }
  if (employees)   { params.push(employees);  conditions.push(`employee_range = $${params.length}`); }
  if (nis2 === 'true') conditions.push('nis2_registered = true');
  if (score_min)   { params.push(parseInt(score_min)); conditions.push(`score >= $${params.length}`); }
  if (score_label) { params.push(score_label); conditions.push(`score_label = $${params.length}`); }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(company_name ILIKE $${params.length} OR city ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const validSort = ['score','company_name','city','employee_range','created_at'].includes(sort) ? sort : 'score';
  const validDir = dir === 'asc' ? 'ASC' : 'DESC';

  try {
    const countRes = await db.query(`SELECT COUNT(*) FROM discovery_leads ${where}`, params);
    const total = parseInt(countRes.rows[0].count);

    params.push(parseInt(limit), offset);
    const { rows } = await db.query(
      `SELECT id, org_nr, company_name, website, email, email_status, phone,
              city, county, nace_code, nace_description, employee_range, revenue_range,
              nis2_registered, nis2_sector, linkedin_url, score, score_label,
              review_status, contacted_at, outreach_angle, created_at
       FROM discovery_leads ${where}
       ORDER BY ${validSort} ${validDir} NULLS LAST
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ success: true, data: { leads: rows, total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    console.error('[leads] list error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/leads/stats — pipeline overview
router.get('/stats', async (req, res) => {
  try {
    const [overview, byLabel, byNace, byCounty, byEmployees, nis2Stats] = await Promise.all([
      db.query(`SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE email IS NOT NULL) AS has_email,
        COUNT(*) FILTER (WHERE linkedin_url IS NOT NULL) AS has_linkedin,
        COUNT(*) FILTER (WHERE nis2_registered = true) AS nis2_count,
        COUNT(*) FILTER (WHERE review_status = 'contacted') AS contacted,
        COUNT(*) FILTER (WHERE review_status = 'qualified') AS qualified,
        ROUND(AVG(score)::numeric, 1) AS avg_score
        FROM discovery_leads`),
      db.query(`SELECT score_label, COUNT(*) FROM discovery_leads WHERE score_label IS NOT NULL GROUP BY score_label`),
      db.query(`SELECT COALESCE(LEFT(nace_code,2),'unknown') AS sector, COUNT(*) FROM discovery_leads GROUP BY sector ORDER BY count DESC LIMIT 10`),
      db.query(`SELECT COALESCE(county,'unknown') AS county, COUNT(*) FROM discovery_leads GROUP BY county ORDER BY count DESC LIMIT 10`),
      db.query(`SELECT COALESCE(employee_range,'unknown') AS range, COUNT(*) FROM discovery_leads GROUP BY range ORDER BY count DESC`),
      db.query(`SELECT nis2_sector, COUNT(*) FROM discovery_leads WHERE nis2_registered = true AND nis2_sector IS NOT NULL GROUP BY nis2_sector ORDER BY count DESC`)
    ]);

    res.json({
      success: true,
      data: {
        overview: overview.rows[0],
        by_label: byLabel.rows,
        by_nace: byNace.rows,
        by_county: byCounty.rows,
        by_employees: byEmployees.rows,
        nis2: nis2Stats.rows
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/leads/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM discovery_leads WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: { lead: rows[0] } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/leads/:id — update status, notes, outreach angle
router.patch('/:id', async (req, res) => {
  const { review_status, notes, outreach_angle, contacted_at } = req.body;
  const fields = [];
  const params = [];

  if (review_status !== undefined) { params.push(review_status); fields.push(`review_status = $${params.length}`); }
  if (notes !== undefined)         { params.push(notes);         fields.push(`notes = $${params.length}`); }
  if (outreach_angle !== undefined){ params.push(outreach_angle);fields.push(`outreach_angle = $${params.length}`); }
  if (contacted_at !== undefined)  { params.push(contacted_at);  fields.push(`contacted_at = $${params.length}`); }

  if (!fields.length) return res.status(400).json({ success: false, error: 'Nothing to update' });

  fields.push('updated_at = NOW()');
  params.push(req.params.id);

  try {
    const { rows } = await db.query(
      `UPDATE discovery_leads SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    res.json({ success: true, data: { lead: rows[0] } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/leads — manual add
router.post('/', async (req, res) => {
  const { org_nr, company_name, website, email, city, county, nace_code, employee_range } = req.body;
  if (!company_name) return res.status(400).json({ success: false, error: 'company_name required' });

  try {
    const { rows } = await db.query(
      `INSERT INTO discovery_leads (org_nr, company_name, website, email, city, county, nace_code, employee_range)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [org_nr, company_name, website, email, city, county, nace_code, employee_range]
    );
    const lead = rows[0];
    const { score, label, breakdown } = computeScore(lead);
    await db.query(
      'UPDATE discovery_leads SET score=$1, score_label=$2, score_breakdown=$3 WHERE id=$4',
      [score, label, JSON.stringify(breakdown), lead.id]
    );
    res.json({ success: true, data: { lead: { ...lead, score, score_label: label } } });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ success: false, error: 'Company already exists' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/leads/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM discovery_leads WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/leads/outreach — log outreach action
router.post('/:id/outreach', async (req, res) => {
  const { channel, message } = req.body;
  try {
    await db.query(
      'INSERT INTO outreach_log (lead_id, channel, message) VALUES ($1, $2, $3)',
      [req.params.id, channel, message]
    );
    await db.query(
      "UPDATE discovery_leads SET review_status='contacted', contacted_at=NOW(), updated_at=NOW() WHERE id=$1",
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
