const express = require('express');
const router = express.Router();
const db = require('../db');
const axios = require('axios');

async function sendLeadNotification(name, email, company, source) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return; // silently skip if not configured

  const notifyTo = process.env.NOTIFY_EMAIL || 'jan@lifeandpower.se';
  const subject  = `🔔 Ny lead: ${company} (${source})`;
  const html     = `
    <h2 style="margin:0 0 16px">Ny inbound lead på nis2klar.se</h2>
    <table style="font-size:15px;line-height:1.8;border-collapse:collapse">
      <tr><td style="color:#888;padding-right:16px">Namn</td><td><strong>${name || '—'}</strong></td></tr>
      <tr><td style="color:#888;padding-right:16px">E-post</td><td><a href="mailto:${email}">${email}</a></td></tr>
      <tr><td style="color:#888;padding-right:16px">Bolag</td><td><strong>${company}</strong></td></tr>
      <tr><td style="color:#888;padding-right:16px">Källa</td><td>${source}</td></tr>
    </table>
    <p style="margin-top:24px;font-size:13px;color:#888">
      Se lead i CRM: <a href="https://humanizedtrust.xyz">humanizedtrust.xyz</a>
    </p>
  `;

  try {
    await axios.post('https://api.resend.com/emails', {
      from:    'NIS2Klar <onboarding@resend.dev>',
      to:      [notifyTo],
      subject,
      html
    }, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
  } catch (err) {
    console.error('[inbound] notify error:', err.response?.data || err.message);
  }
}

// POST /api/inbound — public lead capture from NIS2 lead magnet pages
// No auth required — called from public HTML pages
router.post('/', async (req, res) => {
  const { name, email, company, source, score_data } = req.body;

  if (!email || !company) {
    return res.status(400).json({ success: false, error: 'email and company required' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanCompany = company.trim();
  const cleanSource = source || 'nis2-inbound';

  try {
    // Determine score from self-assessed risk
    let score = 45;
    let score_label = 'warm';
    if (score_data) {
      const risk = score_data.risk;
      if (risk === 'red')   { score = 80; score_label = 'hot'; }
      if (risk === 'amber') { score = 55; score_label = 'warm'; }
      if (risk === 'green') { score = 30; score_label = 'cold'; }
      // kalkylator sends maxFine in EUR
      if (score_data.maxFine && !risk) {
        if (score_data.maxFine >= 7000000)  { score = 80; score_label = 'hot'; }
        else if (score_data.maxFine >= 3000000) { score = 60; score_label = 'warm'; }
      }
    }

    // Try to find existing lead by email
    let leadId;
    const existing = await db.query(
      'SELECT id FROM discovery_leads WHERE LOWER(email) = $1 LIMIT 1',
      [cleanEmail]
    );

    if (existing.rows.length > 0) {
      leadId = existing.rows[0].id;
      // Bump to qualified since they raised their hand
      await db.query(
        `UPDATE discovery_leads
         SET review_status = CASE WHEN review_status IN ('new','cold') THEN 'qualified' ELSE review_status END,
             updated_at = NOW()
         WHERE id = $1`,
        [leadId]
      );
    } else {
      // Create new lead from inbound capture
      const insert = await db.query(
        `INSERT INTO discovery_leads
           (company_name, email, source, review_status, score, score_label, notes, created_at, updated_at)
         VALUES ($1, $2, $3, 'qualified', $4, $5, $6, NOW(), NOW())
         RETURNING id`,
        [
          cleanCompany,
          cleanEmail,
          cleanSource,
          score,
          score_label,
          `Inbound via ${cleanSource}. Kontaktnamn: ${name || '—'}`
        ]
      );
      leadId = insert.rows[0].id;
    }

    // Log activity on lead card
    const activityTitle = formatActivityTitle(cleanSource, score_data);
    const activityBody = formatActivityBody(name, score_data);

    await db.query(
      `INSERT INTO activities (lead_id, type, title, body, created_at)
       VALUES ($1, 'inbound', $2, $3, NOW())`,
      [leadId, activityTitle, activityBody]
    );

    // Fire-and-forget email notification
    sendLeadNotification(name, cleanEmail, cleanCompany, cleanSource);

    res.json({ success: true, lead_id: leadId });
  } catch (err) {
    console.error('[inbound] error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

function formatActivityTitle(source, score_data) {
  const labels = {
    'nis2-checklista':   'NIS2 Checklista ifylld',
    'nis2-kalkylator':   'NIS2 Riskkalylator använd',
    'nis2-styrelsepaket':'NIS2 Styrelsepaket begärt',
  };
  let title = labels[source] || 'NIS2 Inbound';
  if (score_data?.risk === 'red')   title += ' — HÖG RISK 🔴';
  if (score_data?.risk === 'amber') title += ' — Medelhög risk 🟡';
  if (score_data?.risk === 'green') title += ' — Låg risk 🟢';
  return title;
}

function formatActivityBody(name, score_data) {
  const lines = [];
  if (name) lines.push(`Namn: ${name}`);
  if (score_data) {
    if (score_data.jaCount !== undefined) lines.push(`Checklista: ${score_data.jaCount}/10 Ja-svar`);
    if (score_data.maxFine)    lines.push(`Max böterisk: ${score_data.maxFine.toLocaleString('sv-SE')} EUR`);
    if (score_data.breachCost) lines.push(`Incidentkostnad: ${score_data.breachCost.toLocaleString('sv-SE')} EUR`);
    if (score_data.sector)     lines.push(`Sektor: ${score_data.sector}`);
    if (score_data.employees)  lines.push(`Anställda: ${score_data.employees}`);
  }
  return lines.join('\n');
}

module.exports = router;
