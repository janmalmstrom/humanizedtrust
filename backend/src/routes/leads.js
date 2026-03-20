const express = require('express');
const router = express.Router();
const db = require('../db');
const { computeScore } = require('../engines/scorer');

// GET /api/leads — list with filters
router.get('/', async (req, res) => {
  const {
    page = 1, limit = 50,
    status, county, nace, employees, nis2, has_website,
    score_min, score_label, search,
    sort = 'score', dir = 'desc'
  } = req.query;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  const conditions = [];

  if (status)               { params.push(status);     conditions.push(`review_status = $${params.length}`); }
  if (county)               { params.push(county);     conditions.push(`county ILIKE $${params.length}`); }
  if (nace)                 { params.push(`${nace}%`); conditions.push(`nace_code LIKE $${params.length}`); }
  if (employees)            { params.push(employees);  conditions.push(`employee_range = $${params.length}`); }
  if (nis2 === 'true')      conditions.push('nis2_registered = true');
  if (has_website === 'true')  conditions.push('website IS NOT NULL');
  if (score_min)            { params.push(parseInt(score_min)); conditions.push(`score >= $${params.length}`); }
  if (score_label)          { params.push(score_label); conditions.push(`score_label = $${params.length}`); }
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

// GET /api/leads/export — CSV export with same filters
router.get('/export', async (req, res) => {
  const { status, county, nace, employees, nis2, has_website, score_min, score_label, search, ids } = req.query;

  const params = [];
  const conditions = [];

  if (ids) {
    const idList = ids.split(',').map(Number).filter(Boolean);
    if (idList.length) {
      params.push(idList);
      conditions.push(`id = ANY($${params.length})`);
    }
  } else {
    if (status)               { params.push(status);     conditions.push(`review_status = $${params.length}`); }
    if (county)               { params.push(county);     conditions.push(`county ILIKE $${params.length}`); }
    if (nace)                 { params.push(`${nace}%`); conditions.push(`nace_code LIKE $${params.length}`); }
    if (employees)            { params.push(employees);  conditions.push(`employee_range = $${params.length}`); }
    if (nis2 === 'true')      conditions.push('nis2_registered = true');
    if (has_website === 'true') conditions.push('website IS NOT NULL');
    if (score_min)            { params.push(parseInt(score_min)); conditions.push(`score >= $${params.length}`); }
    if (score_label)          { params.push(score_label); conditions.push(`score_label = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(company_name ILIKE $${params.length} OR city ILIKE $${params.length} OR email ILIKE $${params.length})`);
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const { rows } = await db.query(
      `SELECT org_nr, company_name, city, county, nace_code, employee_range, email, phone, website,
              linkedin_url, score, score_label, review_status, nis2_registered, nis2_sector, notes
       FROM discovery_leads ${where}
       ORDER BY score DESC NULLS LAST`,
      params
    );

    const today = new Date().toISOString().split('T')[0];
    const header = 'org_nr,company_name,city,county,nace_code,employee_range,email,phone,website,linkedin_url,score,score_label,review_status,nis2_registered,nis2_sector,notes';

    const escape = (v) => {
      if (v == null) return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const lines = [header, ...rows.map(r =>
      [r.org_nr, r.company_name, r.city, r.county, r.nace_code, r.employee_range,
       r.email, r.phone, r.website, r.linkedin_url, r.score, r.score_label,
       r.review_status, r.nis2_registered, r.nis2_sector, r.notes].map(escape).join(',')
    )];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="leads_export_${today}.csv"`);
    res.send(lines.join('\n'));
  } catch (err) {
    console.error('[leads] export error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/leads/bulk-status — update status for multiple leads
router.post('/bulk-status', async (req, res) => {
  const { ids, status } = req.body;
  if (!ids || !ids.length || !status) return res.status(400).json({ success: false, error: 'ids and status required' });

  try {
    const { rowCount } = await db.query(
      'UPDATE discovery_leads SET review_status=$1, updated_at=NOW() WHERE id = ANY($2)',
      [status, ids]
    );
    res.json({ success: true, data: { updated: rowCount } });
  } catch (err) {
    console.error('[leads] bulk-status error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/leads/bulk-enroll — enroll multiple leads in a sequence
router.post('/bulk-enroll', async (req, res) => {
  const { ids, sequence_id } = req.body;
  if (!ids || !ids.length || !sequence_id) return res.status(400).json({ success: false, error: 'ids and sequence_id required' });

  try {
    const { rows: seqRows } = await db.query('SELECT * FROM sequences WHERE id = $1', [sequence_id]);
    if (!seqRows[0]) return res.status(404).json({ success: false, error: 'Sequence not found' });

    const sequence = seqRows[0];
    const steps = Array.isArray(sequence.steps) ? sequence.steps : JSON.parse(sequence.steps || '[]');

    // Find leads already enrolled in this sequence
    const { rows: existing } = await db.query(
      'SELECT lead_id FROM sequence_enrollments WHERE lead_id = ANY($1) AND sequence_id = $2',
      [ids, sequence_id]
    );
    const alreadyEnrolled = new Set(existing.map(r => r.lead_id));

    const today = new Date();
    let enrolled = 0;
    let skipped = 0;

    for (const leadId of ids) {
      if (alreadyEnrolled.has(leadId)) { skipped++; continue; }

      const { rows: enrollRows } = await db.query(
        `INSERT INTO sequence_enrollments (lead_id, sequence_id, status, current_step)
         VALUES ($1, $2, 'active', 0) RETURNING id`,
        [leadId, sequence_id]
      );

      for (const step of steps) {
        const dueDate = new Date(today);
        dueDate.setDate(dueDate.getDate() + (step.day || 0));
        await db.query(
          'INSERT INTO tasks (user_id, lead_id, title, due_date) VALUES ($1, $2, $3, $4)',
          [req.user.id, leadId, step.title, dueDate.toISOString().split('T')[0]]
        );
      }
      enrolled++;
    }

    res.json({ success: true, data: { enrolled, skipped } });
  } catch (err) {
    console.error('[leads] bulk-enroll error:', err.message);
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
      db.query(`SELECT COALESCE(LEFT(nace_code,2),'unknown') AS sector, COUNT(*) FROM discovery_leads GROUP BY sector ORDER BY count DESC`),
      db.query(`SELECT COALESCE(county,'unknown') AS county, COUNT(*) FROM discovery_leads GROUP BY county ORDER BY count DESC LIMIT 21`),
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

// GET /api/leads/bdr-stats — BDR KPIs for dashboard
router.get('/bdr-stats', async (req, res) => {
  try {
    const [outreach, funnel, enrichment, goingCold, seqStats, revenueByStage] = await Promise.all([
      // Outreach activity last 7 days + today
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE type = 'email'    AND created_at > NOW() - INTERVAL '7 days') AS emails_7d,
          COUNT(*) FILTER (WHERE type = 'phone'    AND created_at > NOW() - INTERVAL '7 days') AS calls_7d,
          COUNT(*) FILTER (WHERE type = 'linkedin' AND created_at > NOW() - INTERVAL '7 days') AS linkedin_7d,
          COUNT(*) FILTER (WHERE type = 'email'    AND created_at > NOW() - INTERVAL '30 days') AS emails_30d,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS total_7d,
          COUNT(*) FILTER (WHERE type = 'email'    AND created_at >= CURRENT_DATE) AS emails_today,
          COUNT(*) FILTER (WHERE type = 'phone'    AND created_at >= CURRENT_DATE) AS calls_today,
          COUNT(*) FILTER (WHERE type = 'linkedin' AND created_at >= CURRENT_DATE) AS linkedin_today
        FROM activities
      `),
      // Funnel by pipeline stage
      db.query(`
        SELECT review_status, COUNT(*) AS count
        FROM discovery_leads
        GROUP BY review_status
        ORDER BY CASE review_status
          WHEN 'new' THEN 1 WHEN 'contacted' THEN 2 WHEN 'qualified' THEN 3
          WHEN 'customer' THEN 4 WHEN 'rejected' THEN 5 ELSE 6 END
      `),
      // Enrichment health
      db.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE email IS NOT NULL)       AS has_email,
          COUNT(*) FILTER (WHERE website IS NOT NULL)     AS has_website,
          COUNT(*) FILTER (WHERE linkedin_url IS NOT NULL) AS has_linkedin,
          COUNT(*) FILTER (WHERE phone IS NOT NULL)       AS has_phone,
          COUNT(*) FILTER (WHERE last_enriched_at > NOW() - INTERVAL '24 hours') AS enriched_today
        FROM discovery_leads
      `),
      // Going cold: contacted/qualified leads with no activity in 7+ days
      db.query(`
        SELECT COUNT(*) AS count
        FROM discovery_leads l
        WHERE l.review_status IN ('contacted', 'qualified')
          AND NOT EXISTS (
            SELECT 1 FROM activities a
            WHERE a.lead_id = l.id
              AND a.created_at > NOW() - INTERVAL '7 days'
          )
      `),
      // Sequence stats
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active')    AS active,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed,
          COUNT(DISTINCT lead_id)                      AS enrolled_leads
        FROM sequence_enrollments
      `),
      // Pipeline revenue forecasting (weighted by stage probability)
      db.query(`
        SELECT
          review_status,
          COUNT(*) AS count,
          COALESCE(SUM(estimated_value_sek), 0) AS total_value,
          COALESCE(AVG(estimated_value_sek) FILTER (WHERE estimated_value_sek IS NOT NULL), 0) AS avg_value,
          COUNT(*) FILTER (WHERE estimated_value_sek IS NOT NULL) AS valued_count
        FROM discovery_leads
        WHERE review_status IN ('new','contacted','qualified','customer')
        GROUP BY review_status
      `)
    ]);

    res.json({
      success: true,
      data: {
        outreach: outreach.rows[0],
        funnel: funnel.rows,
        enrichment: enrichment.rows[0],
        going_cold: parseInt(goingCold.rows[0].count),
        sequences: seqStats.rows[0],
        revenue_by_stage: revenueByStage.rows,
      }
    });
  } catch (err) {
    console.error('[leads] bdr-stats error:', err.message);
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
  const { review_status, notes, outreach_angle, contacted_at, estimated_value_sek, scheduler_url } = req.body;
  const fields = [];
  const params = [];

  if (review_status !== undefined)      { params.push(review_status);      fields.push(`review_status = $${params.length}`); }
  if (notes !== undefined)              { params.push(notes);              fields.push(`notes = $${params.length}`); }
  if (outreach_angle !== undefined)     { params.push(outreach_angle);     fields.push(`outreach_angle = $${params.length}`); }
  if (contacted_at !== undefined)       { params.push(contacted_at);       fields.push(`contacted_at = $${params.length}`); }
  if (estimated_value_sek !== undefined){ params.push(estimated_value_sek);fields.push(`estimated_value_sek = $${params.length}`); }
  if (scheduler_url !== undefined)      { params.push(scheduler_url);      fields.push(`scheduler_url = $${params.length}`); }

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

// POST /api/leads/:id/fetch-annual-report — scrape allabolag.se for financials
router.post('/:id/fetch-annual-report', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id, org_nr, company_name FROM discovery_leads WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
    const lead = rows[0];

    if (!lead.org_nr) return res.status(400).json({ success: false, error: 'No org_nr on this lead' });

    const { fetchAnnualReport } = require('../engines/enrich_annual_report');
    console.log(`[annual-report] fetching for org_nr: "${lead.org_nr}"`);
    const data = await fetchAnnualReport(lead.org_nr);
    console.log(`[annual-report] result:`, data);

    if (!data) {
      return res.json({ success: false, error: 'No financial data found on allabolag.se' });
    }

    await db.query(
      `UPDATE discovery_leads
       SET revenue_sek=$1, profit_sek=$2, num_employees_exact=$3,
           annual_report_year=$4, annual_report_fetched_at=NOW(), updated_at=NOW()
       WHERE id=$5`,
      [data.revenue_sek, data.profit_sek, data.num_employees_exact, data.annual_report_year, lead.id]
    );

    res.json({ success: true, data });
  } catch (err) {
    console.error('[leads] fetch-annual-report error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/leads/:id/generate-pitch — AI cold email generator (tiered)
router.post('/:id/generate-pitch', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM discovery_leads WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
    const lead = rows[0];

    const { generatePitch } = require('../engines/pitchGenerator');
    const result = await generatePitch(lead);

    await db.query('UPDATE discovery_leads SET outreach_angle=$1 WHERE id=$2', [result.full, lead.id]);
    res.json({ success: true, data: { email: result.full, subject: result.subject, body: result.body } });
  } catch (err) {
    console.error('[leads] generate-pitch error:', err.message);
    res.status(err.message.includes('ANTHROPIC') ? 503 : 500).json({ success: false, error: err.message });
  }
});

// POST /api/leads/:id/generate-call-scripts — two script variations (Immediate Ask + Pause Before Ask)
router.post('/:id/generate-call-scripts', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM discovery_leads WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
    const lead = rows[0];

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prefix = lead.nace_code ? String(lead.nace_code).substring(0, 2) : null;
    const scoreLabel = lead.score >= 70 ? 'Hot' : lead.score >= 40 ? 'Warm' : 'Cold';

    const prompt = `Du är Cold Call Script GPT, expert på Connor's Value Statement Framework. Du genererar kalla samtalsskript för B2B-säljare.

Produkt: Nomad Cyber — NIS2 Readiness Assessment, Microsoft Copilot-säkerhet, SOCaaS
Persona: VD, IT-ansvarig eller CFO
Bransch: ${lead.nace_description || 'Okänd'} (SNI ${prefix || lead.nace_code})
Företag: ${lead.company_name}, ${lead.city || 'Sverige'}
Anställda: ${lead.employee_range || 'okänt'}
NIS2-registrerat: ${lead.nis2_registered ? 'JA — sektor: ' + lead.nis2_sector : 'Nej'}
Score: ${lead.score} (${scoreLabel})

Generera OMEDELBART, utan förklaring:

**Skript 1 – Omedelbar fråga (Immediate Ask)**
Kort öppning som introducerar Jan, levererar ett tight value statement kopplat till NIS2 eller Copilot-säkerhet för deras bransch, och går direkt till mötesförfrågan. Antagande, självsäker ton. Inga utfyllnadsfraser. Max 5 meningar.

**Skript 2 – Paus innan fråga (Pause Before Ask)**
Samma value statement-struktur men med ett avsiktligt stopp efter hook — ge prospekten ett ögonblick att reagera innan frågan om möte landar. Lite mjukare ingång, samma direkthet. Max 6 meningar.

**3 Discovery-frågor**
Öppna, kvalificerande frågor anpassade till detta företagets bransch och situation. Ska naturligt följa efter öppningen och driva samtalet mot BANT-kvalificering (Budget, Authority, Need, Timeline). Fokus på NIS2-beredskap, AI-säkerhet eller Copilot-användning beroende på kontext.

REGLER:
- Skriv ENDAST på svenska
- Naturligt talspråk — inget som låter uppläst
- Aldrig "Hoppas det är ett bra tillfälle" eller "Jag hoppas detta hittar dig väl"
- Peer-level ton — inte säljig eller desperat
- Value hook MÅSTE referera till NIS2-krav eller Copilot-säkerhetsrisk kopplat till deras specifika bransch
- Avsluta alltid med att be om 15–20 minuter nästa vecka
- Jan presenterar sig som "Jan Malmström från Nomad Cyber"

OUTPUT FORMAT (exakt detta format, inget annat):
SCRIPT1: [hela skriptet på en sammanhängande text]
SCRIPT2: [hela skriptet på en sammanhängande text]
Q1: [första discovery-frågan]
Q2: [andra discovery-frågan]
Q3: [tredje discovery-frågan]`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].text;
    const s1match = raw.match(/SCRIPT1:\s*([\s\S]+?)(?=SCRIPT2:|$)/);
    const s2match = raw.match(/SCRIPT2:\s*([\s\S]+?)(?=Q1:|$)/);
    const q1match = raw.match(/Q1:\s*(.+)/);
    const q2match = raw.match(/Q2:\s*(.+)/);
    const q3match = raw.match(/Q3:\s*(.+)/);

    const script1 = s1match ? s1match[1].trim() : raw;
    const script2 = s2match ? s2match[1].trim() : '';
    const questions = [
      q1match ? q1match[1].trim() : null,
      q2match ? q2match[1].trim() : null,
      q3match ? q3match[1].trim() : null,
    ].filter(Boolean);

    res.json({ success: true, data: { script1, script2, questions } });
  } catch (err) {
    console.error('[leads] generate-call-scripts error:', err.message);
    res.status(err.message.includes('ANTHROPIC') ? 503 : 500).json({ success: false, error: err.message });
  }
});

// POST /api/leads/:id/generate-objection-bank — ARA + ACE dual-layer responses for 5 common objections
router.post('/:id/generate-objection-bank', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM discovery_leads WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
    const lead = rows[0];

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prefix = lead.nace_code ? String(lead.nace_code).substring(0, 2) : null;
    const scoreLabel = lead.score >= 70 ? 'Hot' : lead.score >= 40 ? 'Warm' : 'Cold';

    const prompt = `Du är Connor's Cold Call Objection Handling Coach. Du bygger personliga invändningssvar för B2B-säljare med ARA och ACE-ramverken. Detta är ett förberedelseverktyg — inte för live-samtal.

Produkt: Nomad Cyber — NIS2 Readiness Assessment, Microsoft Copilot-säkerhet, SOCaaS
Prospect: VD, IT-ansvarig eller CFO
Bransch: ${lead.nace_description || 'Okänd'} (SNI ${prefix || lead.nace_code})
Företag: ${lead.company_name}, ${lead.city || 'Sverige'}
Anställda: ${lead.employee_range || 'okänt'}
NIS2-registrerat: ${lead.nis2_registered ? 'JA — sektor: ' + lead.nis2_sector : 'Nej'}
Score: ${lead.score} (${scoreLabel})

Generera svar för de 5 vanligaste invändningarna för detta företag och bransch. För varje invändning, ge två lager:

LAGER 1 – ARA: Bekräfta invändningen genuint → Bekräfta deras perspektiv eller din trovärdighet → Driv mot mötesfrågan
LAGER 2 – ACE: Ställ en klargörande fråga → Klargör oron med kontext → Expandera samtalet tillbaka mot mötet

REGLER:
- Skriv ENDAST på svenska
- Naturligt talspråk — 2–4 meningar per lager
- Varje svar MÅSTE sluta med en mötesfråga — aldrig en produktpitch
- Peer-level ton, aldrig defensiv eller ursäktande
- Anpassa invändningarna till deras specifika bransch och situation

OUTPUT FORMAT (exakt, inga avvikelser):
OBJ1: [invändningen]
ARA1: [ARA-svar]
ACE1: [ACE-svar]
OBJ2: [invändningen]
ARA2: [ARA-svar]
ACE2: [ACE-svar]
OBJ3: [invändningen]
ARA3: [ARA-svar]
ACE3: [ACE-svar]
OBJ4: [invändningen]
ARA4: [ARA-svar]
ACE4: [ACE-svar]
OBJ5: [invändningen]
ARA5: [ARA-svar]
ACE5: [ACE-svar]`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].text;
    const objections = [];
    for (let i = 1; i <= 5; i++) {
      const objMatch = raw.match(new RegExp(`OBJ${i}:\\s*(.+)`));
      const araMatch = raw.match(new RegExp(`ARA${i}:\\s*([\\s\\S]+?)(?=ACE${i}:)`));
      const aceMatch = raw.match(new RegExp(`ACE${i}:\\s*([\\s\\S]+?)(?=OBJ${i + 1}:|$)`));
      if (objMatch) {
        objections.push({
          obj: objMatch[1].trim(),
          ara: araMatch ? araMatch[1].trim() : '',
          ace: aceMatch ? aceMatch[1].trim() : '',
        });
      }
    }

    res.json({ success: true, data: { objections } });
  } catch (err) {
    console.error('[leads] generate-objection-bank error:', err.message);
    res.status(err.message.includes('ANTHROPIC') ? 503 : 500).json({ success: false, error: err.message });
  }
});

// POST /api/leads/:id/generate-meeting-agenda — two agenda formats for a booked meeting
router.post('/:id/generate-meeting-agenda', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM discovery_leads WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
    const lead = rows[0];

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prefix = lead.nace_code ? String(lead.nace_code).substring(0, 2) : null;

    const prompt = `Du är en expert på B2B-säljmöten och skapar professionella kalenderinbjudningar som dramatiskt förbättrar show rates.

Prospect-kontext:
Företag: ${lead.company_name}, ${lead.city || 'Sverige'}
Bransch: ${lead.nace_description || 'Okänd'} (SNI ${prefix || lead.nace_code})
Anställda: ${lead.employee_range || 'okänt'}
NIS2-registrerat: ${lead.nis2_registered ? 'JA — sektor: ' + lead.nis2_sector : 'Nej'}
Möteskanal: Bokades via kalla samtal / prospektering
Produkt: Nomad Cyber NIS2 Readiness Assessment + Copilot-säkerhet

Generera en mötesagenda i två format:

FORMAT 1 – Kortfattad professionell agenda
3–5 punkter, en mening per punkt. Ska läsas som en trovärdig affärsmötesbokning. Varje punkt formulerad som en diskussionstopic, INTE en säljpitch. Exempel: "Kartlägga er nuvarande säkerhetsprocess och NIS2-beredskap" — INTE "Presentera Nomad Cyber".

FORMAT 2 – Expanderad agenda med underpunkter
Samma 3–5 punkter men med 1–2 underpunkter vardera. Underpunkterna lägger till kontext: varför ämnet är relevant för dem, vad som utforskas, eller vilket resultat som förväntas. Fortfarande tight — inget fluff.

REGLER:
- Skriv ENDAST på svenska
- Professionellt men mänskligt — inte stelt företagsspråk
- Fokus på prospektens värld — deras utmaningar och mål
- Aldrig "Intro-möte", "Snabb koll" eller liknande vaga titlar
- Aldrig generiska buzzwords
- Mötet ska kännas designat specifikt för ${lead.company_name}
- Inkludera en skarp mötestittel i varje format (ej bara "Agenda")

OUTPUT FORMAT (exakt):
TITLE1: [mötestittel för format 1]
CONCISE:
[agenda punkt 1]
[agenda punkt 2]
[agenda punkt 3]
[agenda punkt 4 om relevant]
[agenda punkt 5 om relevant]
TITLE2: [mötestittel för format 2]
EXPANDED:
[punkt 1]
- [underpunkt]
- [underpunkt]
[punkt 2]
- [underpunkt]
- [underpunkt]
[punkt 3]
- [underpunkt]
- [underpunkt]`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 900,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].text;
    const title1match = raw.match(/TITLE1:\s*(.+)/);
    const title2match = raw.match(/TITLE2:\s*(.+)/);
    const conciseMatch = raw.match(/CONCISE:\s*([\s\S]+?)(?=TITLE2:|$)/);
    const expandedMatch = raw.match(/EXPANDED:\s*([\s\S]+?)$/);

    res.json({
      success: true,
      data: {
        title1: title1match ? title1match[1].trim() : `NIS2-genomgång — ${lead.company_name}`,
        title2: title2match ? title2match[1].trim() : `NIS2-beredskap & Copilot-säkerhet — ${lead.company_name}`,
        concise: conciseMatch ? conciseMatch[1].trim() : '',
        expanded: expandedMatch ? expandedMatch[1].trim() : '',
      }
    });
  } catch (err) {
    console.error('[leads] generate-meeting-agenda error:', err.message);
    res.status(err.message.includes('ANTHROPIC') ? 503 : 500).json({ success: false, error: err.message });
  }
});

// POST /api/leads/:id/call-simulator — interactive cold call roleplay
router.post('/:id/call-simulator', async (req, res) => {
  const { action, difficulty = 'standard', messages = [] } = req.body;
  // action: 'start' | 'respond' | 'end'

  try {
    const { rows } = await db.query('SELECT * FROM discovery_leads WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
    const lead = rows[0];

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prefix = lead.nace_code ? String(lead.nace_code).substring(0, 2) : null;
    const hardMode = difficulty === 'hard';

    const prospectSystem = `Du spelar rollen som en skeptisk, upptagen svensk chef på ${lead.company_name} i ${lead.city || 'Sverige'}.
Bransch: ${lead.nace_description || 'Okänd'} (SNI ${prefix || lead.nace_code})
Anställda: ${lead.employee_range || 'okänt'}
NIS2-registrerat: ${lead.nis2_registered ? 'JA — sektor: ' + lead.nis2_sector : 'Nej'}

Du är VD eller IT-ansvarig. Du får ett kallt samtal från Jan Malmström på Nomad Cyber som säljer NIS2 Readiness Assessment och Copilot-säkerhet.

KARAKTÄRSREGLER:
- Svara ALLTID på svenska, naturligt talspråk
- Du är upptagen och skeptisk — inte fientlig, men du ger inte tid gratis
- Reagera på VAD säljaren faktiskt säger — följ inget fast manus
- Använd företagskontext för specifika invändningar (t.ex. "Vi har precis avslutat ett stort IT-projekt" eller "Vi har ingen IT-avdelning")
- Om säljaren ger ett svagt eller generiskt svar: öka motståndet
- Om säljaren ger ett skarpt, relevant svar: visa genuint intresse
- Håll dina svar korta — 1-3 meningar max, som ett riktigt samtal
${hardMode ? `
HARD MODE — extra regler:
- Avbryt säljaren om de pratar för länge
- Visa otålighet: "Jag har ett möte om 3 minuter"
- Hota att lägga på om de inte kommer till saken snabbt
- Ge aldrig efter lätt — kräv konkreta svar på konkreta frågor` : ''}

BRYT ALDRIG KARAKTÄREN under simulationen. Inga meta-kommentarer, inga etiketter.`;

    if (action === 'start') {
      // Generate pre-call plan + first prospect line
      const planPrompt = `Ge en kort förhandsgranskning (pre-call plan) för detta samtal i 3 punkter:
1. Bästa öppningsvinkeln för Jan mot ${lead.company_name} (${lead.nace_description}, ${lead.employee_range} anst.)
2. De mest sannolika invändningarna baserat på deras situation
3. En strategisk hook kopplad till deras specifika kontext (NIS2: ${lead.nis2_registered ? 'JA' : 'Nej'})

Håll det kort och actionable. På svenska.`;

      const planMsg = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 300,
        messages: [{ role: 'user', content: planPrompt }],
      });

      const firstLineMsg = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 60,
        system: prospectSystem,
        messages: [{ role: 'user', content: 'Simulationen börjar. Du plockar upp telefonen.' }],
      });

      return res.json({
        success: true,
        data: {
          prePlan: planMsg.content[0].text.trim(),
          prospectLine: firstLineMsg.content[0].text.trim(),
        }
      });
    }

    if (action === 'respond') {
      // Continue as prospect — messages is [{role:'rep'|'prospect', content}]
      const claudeMessages = messages.map(m => ({
        role: m.role === 'rep' ? 'user' : 'assistant',
        content: m.content,
      }));

      const reply = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 120,
        system: prospectSystem,
        messages: claudeMessages,
      });

      return res.json({ success: true, data: { reply: reply.content[0].text.trim() } });
    }

    if (action === 'end') {
      // Debrief — analyze the full conversation
      const transcript = messages.map(m =>
        `${m.role === 'rep' ? 'JAN' : 'PROSPECT'}: ${m.content}`
      ).join('\n');

      const debriefPrompt = `Du är en erfaren B2B-säljcoach. Analysera detta kalla samtal och ge feedback till Jan.

TRANSKRIPT:
${transcript}

GE FEEDBACK PÅ SVENSKA:
BRÄFT: [En konkret sak Jan gjorde bra — specifik, inte generell]
FÖRBÄTTRA: [Var tappade Jan momentum eller gav upp mark — specifik situation]
ÄNDRA: [En sak Jan ska ändra i nästa försök — konkret och actionable]
BETYG: [Sätt ett betyg: Bokat möte / Nästan / Tappat kontakt / Lade på]`;

      const debriefMsg = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 400,
        messages: [{ role: 'user', content: debriefPrompt }],
      });

      const raw = debriefMsg.content[0].text;
      const braftMatch  = raw.match(/BRÄFT:\s*(.+)/);
      const fixMatch    = raw.match(/FÖRBÄTTRA:\s*([\s\S]+?)(?=ÄNDRA:|$)/);
      const changeMatch = raw.match(/ÄNDRA:\s*([\s\S]+?)(?=BETYG:|$)/);
      const gradeMatch  = raw.match(/BETYG:\s*(.+)/);

      return res.json({
        success: true,
        data: {
          good:   braftMatch  ? braftMatch[1].trim()  : '',
          improve: fixMatch   ? fixMatch[1].trim()    : '',
          change: changeMatch ? changeMatch[1].trim() : '',
          grade:  gradeMatch  ? gradeMatch[1].trim()  : '',
        }
      });
    }

    res.status(400).json({ success: false, error: 'Invalid action' });
  } catch (err) {
    console.error('[leads] call-simulator error:', err.message);
    res.status(err.message.includes('ANTHROPIC') ? 503 : 500).json({ success: false, error: err.message });
  }
});

// POST /api/leads/:id/generate-email-sequence — full cold email sequence (5 templates + subjects + 3-touch cadence)
router.post('/:id/generate-email-sequence', async (req, res) => {
  const { persona, extra_context } = req.body;
  try {
    const { rows } = await db.query('SELECT * FROM discovery_leads WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
    const lead = rows[0];

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const scoreLabel = lead.score >= 70 ? 'Hot' : lead.score >= 40 ? 'Warm' : 'Cold';
    const detectedPersona = persona || (lead.contact_title || 'VD / beslutsfattare');
    const nisContext = lead.nis2_registered
      ? `Företaget är NIS2-registrerat (sektor: ${lead.nis2_sector || 'okänd'}) — NIS2-compliance är direkt relevant.`
      : 'Företaget är inte NIS2-registrerat men kan beröras indirekt som leverantör eller kund till reglerade aktörer.';

    const prompt = `Du är en expert på kalla e-postsekvenser tränad i Connors direkta, antagande outbound-ramverk. Generera en komplett e-postsekvens på svenska för denna lead.

LEAD-KONTEXT:
Företag: ${lead.company_name}, ${lead.city || 'Sverige'}
Bransch: ${lead.nace_description || 'Okänd'} (SNI ${lead.nace_code || '?'})
Anställda: ${lead.employee_range || 'okänt'}
Persona: ${detectedPersona}
${nisContext}
Score: ${lead.score} (${scoreLabel})
Produkt: Nomad Cyber — NIS2 Readiness Assessment, Microsoft Copilot-säkerhet, SOCaaS
Avsändare: Jan, BDR på Nomad Cyber
${extra_context ? `Extra kontext: ${extra_context}` : ''}

Connors ramverksregler (tillämpas på ALLA mejl):
- Tydlig struktur: vem du är, varför du hör av dig, vad du vill
- Inga utfyllnadsfraser, inga passiva formuleringar, inga svaga kvalificerare
- Direkt och antagande ton — skriv som om utfallet redan är förväntat
- Varje mejl ska ha EN tydlig uppmaning till handling
- Anpassa ton och ordval till personan — ett mejl till en VD läses annorlunda än ett till en IT-ansvarig

Generera OMEDELBART följande, använd exakt dessa etiketter:

SUBJECT1: [Nyfikenhetslinje]
SUBJECT2: [Direktlinje]
SUBJECT3: [Personaliseringslinje]
SUBJECT4: [Urgency-linje]

TEMPLATE_A:
Ämne: [använd en av ovan]
[Standard outbound — ny kontakt, direkt kall approach. 4-6 meningar. Tydlig CTA: boka 15 min.]

TEMPLATE_B:
Ämne: [använd en av ovan]
[Standard outbound — alternativ vinkel eller hook. Annan ingång än A. 4-6 meningar.]

FORMAL_A:
Ämne: [använd en av ovan]
[Formell account management — skriv som om det redan finns en viss kännedom om kontot. Mer polerad ton.]

FORMAL_B:
Ämne: [använd en av ovan]
[Formell account management — alternativ version av ovan med annan vinkel.]

NATURAL:
Ämne: [använd en av ovan]
[Kortare, konversationell, ideal för IC eller mellanchefer. Max 3-4 meningar. Avslappnad men professionell.]

TOUCH1:
[Uppföljning 1 — artig påminnelse, anta att de var upptagna, lyft fram värdet igen. 3 meningar max.]

TOUCH2:
[Uppföljning 2 — direkt fråga, kortare, mer rakt på sak, låg friktion CTA. 2-3 meningar.]

TOUCH3:
[Uppföljning 3 — antagande break-up, skapa urgency, lämna dörren öppen. 2-3 meningar.]`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].text;

    const pick = (label, nextLabel) => {
      const re = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n(?:${nextLabel}):|$)`, 'i');
      const m = raw.match(re);
      return m ? m[1].trim() : '';
    };

    const subjects = [
      pick('SUBJECT1', 'SUBJECT2'),
      pick('SUBJECT2', 'SUBJECT3'),
      pick('SUBJECT3', 'SUBJECT4'),
      pick('SUBJECT4', 'TEMPLATE_A'),
    ].filter(Boolean);

    res.json({
      success: true,
      data: {
        subjects,
        templates: {
          a: pick('TEMPLATE_A', 'TEMPLATE_B'),
          b: pick('TEMPLATE_B', 'FORMAL_A'),
          formalA: pick('FORMAL_A', 'FORMAL_B'),
          formalB: pick('FORMAL_B', 'NATURAL'),
          natural: pick('NATURAL', 'TOUCH1'),
        },
        followup: {
          touch1: pick('TOUCH1', 'TOUCH2'),
          touch2: pick('TOUCH2', 'TOUCH3'),
          touch3: pick('TOUCH3', '~~~~'),
        },
      },
    });
  } catch (err) {
    console.error('[leads] generate-email-sequence error:', err.message);
    res.status(err.message.includes('ANTHROPIC') ? 503 : 500).json({ success: false, error: err.message });
  }
});

// POST /api/leads/:id/generate-meeting-recap — follow-up email from meeting notes
router.post('/:id/generate-meeting-recap', async (req, res) => {
  const { notes } = req.body;
  if (!notes || notes.trim().length < 20) {
    return res.status(400).json({ success: false, error: 'Notes too short' });
  }
  try {
    const { rows } = await db.query('SELECT * FROM discovery_leads WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
    const lead = rows[0];

    const cr = await db.query('SELECT * FROM contacts WHERE lead_id = $1 ORDER BY created_at ASC LIMIT 1', [lead.id]);
    const contact = cr.rows[0] || null;

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const recipientName = contact?.name || 'kontaktpersonen';
    const recipientTitle = contact?.title || '';

    const prompt = `Du är en expert på säljkommunikation med djup erfarenhet av B2B-försäljning och professionellt affärsskrivande. Omvandla dessa mötesanteckningar till ett polerat uppföljningsmejl på svenska.

KONTEXT:
Avsändare: Jan, BDR på Nomad Cyber
Mottagare: ${recipientName}${recipientTitle ? ', ' + recipientTitle : ''} på ${lead.company_name}
Produkt: Nomad Cyber — NIS2 Readiness Assessment, Microsoft Copilot-säkerhet, SOCaaS

MÖTESANTECKNINGAR / TRANSKRIPT:
${notes.trim()}

INSTRUKTIONER:
- Producera ett komplett uppföljningsmejl OMEDELBART utan frågor
- Struktur: kort öppning som bekräftar samtalet → punktlista med viktiga diskussionspunkter → tydliga nästa steg med specifika CTAs och tidsramar
- Antagande språk på nästa steg: "Vi ses på torsdag för att gå igenom förslaget" INTE "Hör av dig om du vill..."
- Uppfinn aldrig detaljer som inte finns i anteckningarna — använd [DATUM] eller [NAMN] som platshållare vid behov
- Professionell, skarp, proaktiv ton — mejlet ska göra Jan sedd som organiserad och på hugget
- Inga långa introduktioner — leverera mejlet direkt, klart att kopiera och skicka

OUTPUT FORMAT (använd exakt dessa etiketter):

SUBJECT: [Kortfattad, relevant ämnesrad]

BODY:
[Komplett mejltext — redo att kopiera och skicka]

TIP: [En rad som föreslår en möjlig justering användaren kanske vill göra, t.ex. kortare, mer antagande ton, etc.]`;

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = msg.content[0].text;

    const subject = (raw.match(/SUBJECT:\s*([^\n]+)/i) || [])[1]?.trim() || '';
    const bodyMatch = raw.match(/BODY:\s*([\s\S]*?)(?=\nTIP:|$)/i);
    const body = bodyMatch ? bodyMatch[1].trim() : '';
    const tip = (raw.match(/TIP:\s*([^\n]+)/i) || [])[1]?.trim() || '';

    res.json({ success: true, data: { subject, body, tip } });
  } catch (err) {
    console.error('[leads] generate-meeting-recap error:', err.message);
    res.status(err.message.includes('ANTHROPIC') ? 503 : 500).json({ success: false, error: err.message });
  }
});

// POST /api/leads/:id/generate-discovery-brief — 9-section discovery call prep brief
router.post('/:id/generate-discovery-brief', async (req, res) => {
  const { contact_id, extra_context } = req.body;
  try {
    const { rows } = await db.query('SELECT * FROM discovery_leads WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
    const lead = rows[0];

    let contact = null;
    if (contact_id) {
      const cr = await db.query('SELECT * FROM contacts WHERE id = $1 AND lead_id = $2', [contact_id, lead.id]);
      contact = cr.rows[0] || null;
    } else {
      const cr = await db.query('SELECT * FROM contacts WHERE lead_id = $1 ORDER BY created_at ASC LIMIT 1', [lead.id]);
      contact = cr.rows[0] || null;
    }

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const scoreLabel = lead.score >= 70 ? 'Hot' : lead.score >= 40 ? 'Warm' : 'Cold';
    const nisContext = lead.nis2_registered
      ? `NIS2-registrerat (sektor: ${lead.nis2_sector || 'okänd'}) — compliance är direkt relevant`
      : 'Ej NIS2-registrerat — kan beröras indirekt som leverantör till reglerade aktörer';
    const contactLine = contact
      ? `Kontakt: ${contact.name}${contact.title ? ', ' + contact.title : ''}${contact.notes ? ' — anteckningar: ' + contact.notes : ''}`
      : 'Ingen namngiven kontakt — utgå från typisk beslutsfattare för sektorn (VD eller IT-ansvarig)';

    const prompt = `Du är en elit säljstrateg och discovery call-specialist med djup expertis inom B2B-försäljning. Producera ett komplett Discovery Call Prep Brief på svenska i ett enda svar — klart att använda på under 2 minuter.

LEAD-KONTEXT:
Företag: ${lead.company_name}, ${lead.city || 'Sverige'}
Bransch: ${lead.nace_description || 'Okänd'} (SNI ${lead.nace_code || '?'})
Anställda: ${lead.employee_range || 'okänt'}
${contactLine}
${nisContext}
Score: ${lead.score} (${scoreLabel})
Produkt Jan säljer: Nomad Cyber — NIS2 Readiness Assessment, Microsoft Copilot-säkerhet, SOCaaS
Avsändare: Jan, BDR på Nomad Cyber
${extra_context ? `Extra kontext (triggers, vad som diskuterades i cold call, etc.): ${extra_context}` : ''}

Generera ALLA 9 avsnitt i ordning. Ställ aldrig frågor innan du genererar. Anpassa allt efter persona, titel, senioritiet, bransch och triggers. Skriv som en erfaren säljare — direkt, konkret, ingen utfyllnad. Allt ska vara skanningsbart — Jan läser detta minuter innan mötet.

Använd EXAKT dessa etiketter:

SECTION1_BACKGROUND:
[Kortfattad snapshot: vad företaget gör, storlek/fas om möjligt, recent news/triggers, vad som är viktigt för denna persona i deras roll]

SECTION2_INDUSTRY:
[2-4 aktuella utmaningar eller trender som påverkar denna bransch och persona — specifika, inte generiska]

SECTION3_VALUEPROP:
[Hur Nomad Cybervs lösning mappar direkt mot denna prospects prioriteringar och NIS2/Copilot-situation]

SECTION4_QUESTIONS:
[Fyra frågefunnels med 2-3 lagerfördjupade frågor var:
Funnel 1 – Nuläge (Current State)
Funnel 2 – Påverkan & smärta (Impact & Pain)
Funnel 3 – Initiativ & prioritet (Initiative & Priority)
Funnel 4 – Beslut & process (Decision & Process)]

SECTION5_VALUEPOINTS:
[3 specifika, outcome-fokuserade talking points för denna persona — inte generiska features]

SECTION6_OPENER:
[Ordagrant öppningsskript 60-90 sek som Jan kan läsa eller anpassa: kontextsättande mening + anledning till mötet + mjuk brygga till discovery-frågor]

SECTION7_OBJECTIONS:
[3 invändningar denna persona sannolikt kommer ta upp, var och en parad med ett skarp, icke-defensivt svar]

SECTION8_NEXTSTEPS:
[2 konkreta avslut Jan ska sikta på för att avsluta mötet med momentum]

SECTION9_RESOURCES:
[2-3 resurstyper som passar denna personas bekymmer — om specifika resurser inte finns, beskriv idealisk resurstyp och vinkel]`;

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = msg.content[0].text;

    const pickSection = (label, nextLabel) => {
      const re = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\nSECTION\\d+_|$)`, 'i');
      const m = raw.match(re);
      return m ? m[1].trim() : '';
    };

    res.json({
      success: true,
      data: {
        contact: contact ? { name: contact.name, title: contact.title } : null,
        background:   pickSection('SECTION1_BACKGROUND',  'SECTION2'),
        industry:     pickSection('SECTION2_INDUSTRY',    'SECTION3'),
        valueprop:    pickSection('SECTION3_VALUEPROP',   'SECTION4'),
        questions:    pickSection('SECTION4_QUESTIONS',   'SECTION5'),
        valuepoints:  pickSection('SECTION5_VALUEPOINTS', 'SECTION6'),
        opener:       pickSection('SECTION6_OPENER',      'SECTION7'),
        objections:   pickSection('SECTION7_OBJECTIONS',  'SECTION8'),
        nextsteps:    pickSection('SECTION8_NEXTSTEPS',   'SECTION9'),
        resources:    pickSection('SECTION9_RESOURCES',   '~~~~'),
      },
    });
  } catch (err) {
    console.error('[leads] generate-discovery-brief error:', err.message);
    res.status(err.message.includes('ANTHROPIC') ? 503 : 500).json({ success: false, error: err.message });
  }
});

// POST /api/leads/:id/check-deliverability — inbox deliverability score + fixes
router.post('/:id/check-deliverability', async (req, res) => {
  const { email_text } = req.body;
  if (!email_text || email_text.trim().length < 20) {
    return res.status(400).json({ success: false, error: 'Email text too short' });
  }
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prompt = `Du är en Inbox Deliverability Coach — specialist på cold email-infrastruktur, spamfilter och domänrykte. Ditt enda fokus är att e-post når inkorgen, inte att förbättra copy.

Analysera detta e-postmeddelande och ge ett strukturerat deliverability-bedömning.

E-POSTMEDDELANDE:
${email_text.trim()}

Poängsystem:
- 🟢 Grön (87–100): Säkert att skicka
- 🟡 Gul (70–86): Varning — fixbara problem
- 🔴 Röd (under 70): Skicka inte — kräver revision

Utvärdera mot:
- Ämnesrad: säljspråk, överdrivet skiljetecken, VERSALER, hype-ord
- Länkbelastning: för många URL:er, länkförkortare, låg-trust-domäner
- Bilagor: alltid en risk i kall utskick
- Spam-utlösande fraser: aggressiva CTAs, överdrivet fetstil/kursiv
- Personaliseringssignaler: generiska öppningar som triggar spamfilter
- Avanmälningsspråk: avsaknad av unsubscribe-mening
- HTML vs. ren text: tung HTML ökar spampoäng
- Avsändarsignatur: ofullständig info minskar förtroendesignaler

OUTPUT FORMAT (använd exakt dessa etiketter):

SCORE: [nummer 0-100]
RATING: [green/yellow/red]

RISKS:
[Punktlista med identifierade problem — varje punkt förklarar VARFÖR det är en risk]

FIXES:
[Konkreta, åtgärdbara redigeringar för varje identifierat problem. Visa före/efter där relevant]

REVISED:
[Om gul eller röd: leverera en deliverability-optimerad version av mejlet. Notera: denna version prioriterar inkorgsplacering — förfina ton och övertalning efteråt]

Var direkt och specifik. Förklara alltid VARFÖR varje risk är ett problem, inte bara vad man ska fixa.`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].text;

    const pickLine = (label) => {
      const m = raw.match(new RegExp(`${label}:\\s*([^\\n]+)`, 'i'));
      return m ? m[1].trim() : '';
    };
    const pickBlock = (label, nextLabel) => {
      const m = raw.match(new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n${nextLabel}:|$)`, 'i'));
      return m ? m[1].trim() : '';
    };

    const scoreRaw = pickLine('SCORE');
    const score = parseInt(scoreRaw) || 0;
    const ratingRaw = pickLine('RATING').toLowerCase();
    const rating = ratingRaw.includes('green') ? 'green' : ratingRaw.includes('red') ? 'red' : 'yellow';

    res.json({
      success: true,
      data: {
        score,
        rating,
        risks: pickBlock('RISKS', 'FIXES'),
        fixes: pickBlock('FIXES', 'REVISED'),
        revised: pickBlock('REVISED', '~~~~'),
      },
    });
  } catch (err) {
    console.error('[leads] check-deliverability error:', err.message);
    res.status(err.message.includes('ANTHROPIC') ? 503 : 500).json({ success: false, error: err.message });
  }
});

// POST /api/leads/:id/analyze-call — cold call transcript analysis (BANT/MEDDIC)
router.post('/:id/analyze-call', async (req, res) => {
  const { transcript } = req.body;
  if (!transcript || transcript.trim().length < 50) {
    return res.status(400).json({ success: false, error: 'Transcript too short' });
  }
  try {
    const { rows } = await db.query('SELECT * FROM discovery_leads WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
    const lead = rows[0];

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const scoreLabel = lead.score >= 70 ? 'Hot' : lead.score >= 40 ? 'Warm' : 'Cold';

    const prompt = `Du är en expert säljcoach och B2B cold call-tränare. Analysera detta samtalstranskript och ge konkret, direkt feedback på svenska.

LEAD-KONTEXT (känd information om detta företag):
Företag: ${lead.company_name}, ${lead.city || 'Sverige'}
Bransch: ${lead.nace_description || 'Okänd'} (SNI ${lead.nace_code || '?'})
Anställda: ${lead.employee_range || 'okänt'}
NIS2-registrerat: ${lead.nis2_registered ? 'JA — sektor: ' + (lead.nis2_sector || 'okänd') : 'Nej'}
Score: ${lead.score} (${scoreLabel})
Produkt såld: Nomad Cyber — NIS2 Readiness Assessment, Microsoft Copilot-säkerhet, SOCaaS
Säljare: Jan (BDR)

TRANSKRIPT:
${transcript.trim()}

Analysera transkriptet på dessa 5 områden. Var specifik och hänvisa direkt till vad som sades i samtalet.

OUTPUT FORMAT (använd exakt dessa etiketter):

TEMPO:
[Bedömning av tempo, fyllnadsord, om Jan ramlade på sig, pratade för snabbt/långsamt, tappade kontrollen. Hänvisa till konkreta meningar i transkriptet.]

MISSADE:
[Vad borde Jan ha frågat men frågade inte? Vad signalerade prospekten som Jan inte följde upp? Specifika exempel från transkriptet.]

BANT:
Budget: [vad avslöjades / vad är okänt]
Authority: [vad avslöjades / vad är okänt]
Need: [vad avslöjades / vad är okänt]
Timeline: [vad avslöjades / vad är okänt]

TOPP3:
1. [Specifik förbättring för nästa samtal — kopplad till något konkret i transkriptet]
2. [Specifik förbättring]
3. [Specifik förbättring]

UPPFOLJNING:
[Vad ska Jan ta upp eller klarlägga i nästa kontakt? Vad är fortfarande olöst? Konkret förslag på hur man öppnar nästa samtal.]`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].text;

    const extract = (label, nextLabel) => {
      const regex = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=${nextLabel}:|$)`, 'i');
      const m = raw.match(regex);
      return m ? m[1].trim() : '';
    };

    const bantRaw = extract('BANT', 'TOPP3');
    const bantLines = bantRaw.split('\n').filter(l => l.trim());

    res.json({
      success: true,
      data: {
        tempo: extract('TEMPO', 'MISSADE'),
        missed: extract('MISSADE', 'BANT'),
        bant: bantLines,
        top3: extract('TOPP3', 'UPPFOLJNING').split('\n').filter(l => l.trim()),
        followup: extract('UPPFOLJNING', '~~~~'),
      },
    });
  } catch (err) {
    console.error('[leads] analyze-call error:', err.message);
    res.status(err.message.includes('ANTHROPIC') ? 503 : 500).json({ success: false, error: err.message });
  }
});

// POST /api/leads/:id/generate-linkedin-sequence — 4-step LinkedIn DM sequence
router.post('/:id/generate-linkedin-sequence', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM discovery_leads WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
    const lead = rows[0];

    const { extra_context } = req.body;

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prefix = lead.nace_code ? String(lead.nace_code).substring(0, 2) : null;

    const prompt = `Du är en LinkedIn-prospekteringsexpert som skapar personliga, konverterande DM-sekvenser för B2B-försäljning i Sverige.

Vi säljer (Nomad Cyber): NIS2-compliance-konsulting, cybersäkerhetsriskbedömningar och löpande cybersäkerhetstjänster för svenska medelstora företag.

Prospekt-kontext:
Företag: ${lead.company_name}, ${lead.city || 'Sverige'}
Bransch: ${lead.nace_description || 'okänd'} (SNI ${prefix || lead.nace_code || 'okänd'})
Anställda: ${lead.employee_range || 'okänt'}
NIS2-registrerat: ${lead.nis2_registered ? 'JA – sektor: ' + lead.nis2_sector : 'Nej / okänt'}
${lead.website ? `Webbplats: ${lead.website}` : ''}
${extra_context ? `\nExtra kontext / triggers:\n${extra_context}` : ''}

Skapa en komplett 4-stegs LinkedIn DM-sekvens på svenska. Varje meddelande ska kännas äkta och naturligt – inte säljigt eller generiskt. Tonen ska vara professionell men avslappnad, som en kunnig kollega.

OUTPUT FORMAT (exakt, använd dessa markörer):

STEP1_LABEL: Anslutningsförfrågan
STEP1_PURPOSE: [en mening om syftet med detta steg]
STEP1_MSG: [meddelandet – max 50 ord – refererar till en specifik trigger eller kontext, känns som en äkta anledning att connecta]

STEP2_LABEL: Första DM efter anslutning
STEP2_PURPOSE: [syfte]
STEP2_MSG: [meddelandet – 50-100 ord – lätt rapportbyggande, hint om värde, mjuk CTA (fråga eller observation). Ingen hård försäljning.]

STEP3_LABEL: Uppföljning med ny vinkel
STEP3_PURPOSE: [syfte]
STEP3_MSG: [meddelandet – 50-100 ord – ny vinkel, insikt eller relevant observation om deras bransch/NIS2. Håller konversationen levande utan att pressa.]

STEP4_LABEL: Direkta mötesfrågan
STEP4_PURPOSE: [syfte]
STEP4_MSG: [meddelandet – 50-100 ord – assumptiv mötesförfrågan. Använd "Låt oss ta 15 minuter..." inte "Skulle du vara öppen för...". Direkt men inte aggressiv.]

Regler:
- Alla meddelanden på svenska
- Inga generiska fraser ("Hoppas detta hittar dig väl" etc.)
- Referera till något specifikt om företaget eller branschen i varje steg
- Sälj mötet, inte produkten
- Peer-to-peer ton, inte säljare-till-prospekt`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].text;

    const get = (key) => {
      const m = raw.match(new RegExp(`${key}:\\s*([\\s\\S]+?)(?=\\nSTEP[0-9]_|$)`));
      return m ? m[1].trim() : '';
    };

    const steps = [1, 2, 3, 4].map(n => ({
      label: get(`STEP${n}_LABEL`),
      purpose: get(`STEP${n}_PURPOSE`),
      message: get(`STEP${n}_MSG`),
    }));

    res.json({ success: true, data: { steps } });
  } catch (err) {
    console.error('[leads] generate-linkedin-sequence error:', err.message);
    res.status(err.message.includes('ANTHROPIC') ? 503 : 500).json({ success: false, error: err.message });
  }
});

// POST /api/leads/:id/buying-triggers — surface real-time buying signals via Brave Search + Claude
router.post('/:id/buying-triggers', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM discovery_leads WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
    const lead = rows[0];

    const braveKey = process.env.BRAVE_API_KEY;
    if (!braveKey) return res.status(503).json({ success: false, error: 'BRAVE_API_KEY not set' });

    // Search Brave for rich results (title + snippet + url + age)
    async function braveSearch(query) {
      try {
        const r = await fetch(
          `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8&country=se&search_lang=sv`,
          { headers: { 'Accept': 'application/json', 'X-Subscription-Token': braveKey }, signal: AbortSignal.timeout(8000) }
        );
        if (!r.ok) return [];
        const data = await r.json();
        return (data.web?.results || []).map(r => ({
          title: r.title || '',
          url: r.url || '',
          snippet: r.description || '',
          age: r.age || '',
        }));
      } catch { return []; }
    }

    const company = lead.company_name;
    const city = lead.city || '';

    // Run 3 targeted searches in parallel
    const [newsResults, securityResults, leadershipResults] = await Promise.all([
      braveSearch(`"${company}" ${city} nyheter 2024 2025`),
      braveSearch(`"${company}" cybersäkerhet NIS2 säkerhet IT`),
      braveSearch(`"${company}" VD chef ledning rekrytering`),
    ]);

    // Format search results as context for Claude
    const formatResults = (results, label) => {
      if (!results.length) return `[${label}: inga resultat]`;
      return results.slice(0, 5).map((r, i) =>
        `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}${r.age ? `\n   Datum: ${r.age}` : ''}`
      ).join('\n\n');
    };

    const searchContext = `
=== SÖKRESULTAT: NYHETER ===
${formatResults(newsResults, 'Nyheter')}

=== SÖKRESULTAT: CYBERSÄKERHET/NIS2 ===
${formatResults(securityResults, 'Säkerhet')}

=== SÖKRESULTAT: LEDARSKAP/REKRYTERING ===
${formatResults(leadershipResults, 'Ledarskap')}
`.trim();

    const prefix = lead.nace_code ? String(lead.nace_code).substring(0, 2) : null;

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prompt = `Du är en Strategic Account Research Specialist som identifierar köpsignaler och strategiska triggers för B2B-säljare.

Vi säljer (Nomad Cyber): NIS2-compliance-konsulting, cybersäkerhetsriskbedömningar och löpande cybersäkerhetstjänster för svenska medelstora företag i NIS2-sektorer.

Målföretag:
Namn: ${company}
Stad: ${city || 'okänd'}
Bransch: ${lead.nace_description || 'okänd'} (SNI ${prefix || lead.nace_code || 'okänd'})
Anställda: ${lead.employee_range || 'okänt'}
NIS2-registrerat: ${lead.nis2_registered ? 'JA – sektor: ' + lead.nis2_sector : 'Nej / okänt'}
${lead.website ? `Webbplats: ${lead.website}` : ''}

Nedan finns aktuella sökresultat om detta företag. Analysera dem och identifiera köpsignaler.

${searchContext}

Leverera analysen i exakt detta format (använd dessa markörer):

SNAPSHOT: [2-3 meningar: affärsmodell, marknadspositon, storlek/fas, tillväxtindikatorer]

STRATEGIC: [2-3 meningar: nuvarande prioriteringar, tillväxtinitiativ, synliga konkurrensrörelser baserat på sökresultaten]

TRIGGERS:
TRIGGER1_EVENT: [vad som hände – specifik händelse från sökresultaten]
TRIGGER1_WHEN: [när det hände/annonserades]
TRIGGER1_URL: [källans URL från sökresultaten, eller "Ej bekräftad offentligt" om ingen källa finns]
TRIGGER1_WHY: [varför det är kommersiellt relevant för NIS2/cybersäkerhet]
TRIGGER2_EVENT: [händelse 2 – om finns]
TRIGGER2_WHEN: [datum]
TRIGGER2_URL: [källa]
TRIGGER2_WHY: [relevans]
TRIGGER3_EVENT: [händelse 3 – om finns, annars skriv "Inga ytterligare triggers identifierade"]
TRIGGER3_WHEN: [datum eller "—"]
TRIGGER3_URL: [källa eller "—"]
TRIGGER3_WHY: [relevans eller "—"]

IMPLICATIONS: [2-4 meningar: hur dessa triggers skapar möjlighet för Nomad Cyber just nu – varför IDAG är rätt tid att kontakta]

PERSONAS:
PERSONA1: [titel och roll – mest sannolikt beslutsfattare givet triggerna]
PERSONA1_WHY: [varför denna person äger beslutet]
PERSONA2: [titel och roll]
PERSONA2_WHY: [varför]
PERSONA3: [titel och roll]
PERSONA3_WHY: [varför]

CRITICAL: Hitta på inga triggers. Om sökresultaten är tunna, notera det ärligt i TRIGGERS och basera IMPLICATIONS på branschkontext istället. Varje trigger måste ha en URL från sökresultaten ovan – använd "Ej bekräftad offentligt" om ingen källa finns.`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1600,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].text;

    const get = (key) => {
      const m = raw.match(new RegExp(`${key}:\\s*([\\s\\S]+?)(?=\\n[A-Z][A-Z0-9_]+:|$)`));
      return m ? m[1].trim() : '';
    };

    const triggers = [1, 2, 3].map(n => ({
      event: get(`TRIGGER${n}_EVENT`),
      when: get(`TRIGGER${n}_WHEN`),
      url: get(`TRIGGER${n}_URL`),
      why: get(`TRIGGER${n}_WHY`),
    })).filter(t => t.event && !t.event.includes('Inga ytterligare'));

    const personas = [1, 2, 3].map(n => ({
      title: get(`PERSONA${n}`),
      why: get(`PERSONA${n}_WHY`),
    })).filter(p => p.title);

    res.json({
      success: true,
      data: {
        company,
        snapshot: get('SNAPSHOT'),
        strategic: get('STRATEGIC'),
        triggers,
        implications: get('IMPLICATIONS'),
        personas,
        searchedAt: new Date().toISOString(),
      }
    });
  } catch (err) {
    console.error('[leads] buying-triggers error:', err.message);
    res.status(err.message.includes('ANTHROPIC') ? 503 : 500).json({ success: false, error: err.message });
  }
});

// POST /api/leads/:id/generate-battle-card — competitor battle card for Nomad Cyber
router.post('/:id/generate-battle-card', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM discovery_leads WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
    const lead = rows[0];

    const { competitor_name } = req.body;
    if (!competitor_name || !competitor_name.trim()) {
      return res.status(400).json({ success: false, error: 'competitor_name required' });
    }

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prefix = lead.nace_code ? String(lead.nace_code).substring(0, 2) : null;

    const prompt = `Du är en expert på konkurrensstrategi och sälj-enablement inom B2B cybersecurity i Sverige. Du skapar specifika, omedelbart användbara battle cards för Nomad Cyber.

Vår produkt (Nomad Cyber): NIS2-compliance-konsulting, riskbedömningar, säkerhetsarkitektur och löpande cybersäkerhetstjänster för svenska medelstora företag i NIS2-sektorer (finans, hälsa, transport, energi, digital infrastruktur, tillverkning m.fl.). Vi är ett boutique-bolag med hög specialisering på NIS2 och Microsoft Copilot-säkerhet – vi är inte en stor generalist-IT-byrå.

Prospekt-kontext:
Företag: ${lead.company_name}, ${lead.city || 'Sverige'}
Bransch: ${lead.nace_description || 'okänd'} (SNI ${prefix || lead.nace_code || 'okänd'})
Anställda: ${lead.employee_range || 'okänt'}
NIS2-registrerat: ${lead.nis2_registered ? 'JA – sektor: ' + lead.nis2_sector : 'Nej / okänt'}

Generera en komplett battle card mot konkurrenten: ${competitor_name.trim()}

OUTPUT FORMAT (exakt, använd dessa markörer utan extra text mellan dem):
SNAPSHOT: [3-5 meningar om ${competitor_name.trim()} – marknadsposition, typisk kundprofil, hur de vinner affärer]
STRENGTHS: • [styrka 1] • [styrka 2] • [styrka 3]
WEAKNESSES: • [svaghet 1] • [svaghet 2] • [svaghet 3]
DIFFERENTIATION: • [Vi gör X – de gör inte] • [Vi gör Y – de gör inte] • [Vi gör Z – de gör inte]
OBJ1: [vanligaste invändningen från prospekt som vill välja ${competitor_name.trim()}]
REB1: [skarpt, konkret svar – sälj mötet, inte produkten]
OBJ2: [näst vanligaste invändningen]
REB2: [svar]
OBJ3: [tredje invändningen]
REB3: [svar]
QUESTIONS: • [fråga 1 som avslöjar konkurrentens svaghet utan att nämna dem] • [fråga 2] • [fråga 3] • [fråga 4]
SOUNDBITES: • [minnesvärd one-liner 1] • [one-liner 2] • [one-liner 3]

Allt på svenska. Var specifik – detta är ett verktyg för en säljare som ska in i ett möte om 30 minuter.`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1400,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].text;

    const getSection = (key) => {
      const m = raw.match(new RegExp(`${key}:\\s*([\\s\\S]+?)(?=\\n[A-Z]+[0-9]*:|$)`));
      return m ? m[1].trim() : '';
    };
    const parseBullets = (text) => text.split('•').map(s => s.trim()).filter(Boolean);

    const objections = ['OBJ1', 'OBJ2', 'OBJ3'].map((key, i) => ({
      objection: getSection(key),
      rebuttal: getSection(`REB${i + 1}`),
    })).filter(o => o.objection);

    res.json({
      success: true,
      data: {
        competitor: competitor_name.trim(),
        snapshot: getSection('SNAPSHOT'),
        strengths: parseBullets(getSection('STRENGTHS')),
        weaknesses: parseBullets(getSection('WEAKNESSES')),
        differentiation: parseBullets(getSection('DIFFERENTIATION')),
        objections,
        questions: parseBullets(getSection('QUESTIONS')),
        soundbites: parseBullets(getSection('SOUNDBITES')),
      }
    });
  } catch (err) {
    console.error('[leads] generate-battle-card error:', err.message);
    res.status(err.message.includes('ANTHROPIC') ? 503 : 500).json({ success: false, error: err.message });
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
