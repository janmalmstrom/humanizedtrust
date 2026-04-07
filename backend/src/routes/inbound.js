const express = require('express');
const router = express.Router();
const db = require('../db');
const axios = require('axios');

async function sendAutoReply(name, email, company) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const firstName = name ? name.split(' ')[0] : 'där';
  const bookingUrl = process.env.CAL_BOOKING_URL || 'https://cal.eu/jan-malmstrom-dq23y8/30min';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
      <p style="font-size:16px">Hej ${firstName},</p>
      <p style="font-size:15px;line-height:1.7">
        Tack för din förfrågan — vi har tagit emot den och återkommer inom <strong>24 timmar</strong>
        med information om vad NIS2 innebär för ${company}.
      </p>
      <p style="font-size:15px;line-height:1.7">
        Vill du hellre boka ett samtal direkt? Välj en tid som passar dig:
      </p>
      <p style="text-align:center;margin:24px 0">
        <a href="${bookingUrl}" style="background:#0066cc;color:#fff;text-decoration:none;padding:13px 32px;border-radius:6px;font-size:15px;font-weight:bold;display:inline-block">
          📅 Boka ett kostnadsfritt samtal
        </a>
      </p>
      <p style="font-size:15px;line-height:1.7">
        Under tiden kan du läsa mer i våra guider på
        <a href="https://nis2klar.se/artiklar.html" style="color:#0066cc">nis2klar.se/artiklar</a>.
      </p>
      <p style="font-size:15px;margin-top:24px">— Jan Malmström, NIS2Klar</p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
      <p style="font-size:12px;color:#999">
        NIS2Klar drivs av M&amp;J Trusted Marketing KB ·
        <a href="https://nis2klar.se/integritetspolicy.html" style="color:#999">Integritetspolicy</a>
      </p>
    </div>
  `;

  try {
    await axios.post('https://api.resend.com/emails', {
      from:    'Jan Malmström <jan@nis2klar.se>',
      to:      [email],
      subject: `Vi återkommer inom 24 timmar — NIS2Klar`,
      html
    }, { headers: { Authorization: `Bearer ${apiKey}` } });
    console.log(`[inbound] auto-reply sent to ${email}`);
  } catch (err) {
    console.error('[inbound] auto-reply error:', err.response?.data || err.message);
  }
}

async function sendLeadNotification(name, email, phone, company, source) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return; // silently skip if not configured

  const notifyTo = process.env.NOTIFY_EMAIL || 'jan@lifeandpower.se';
  const subject  = `🔔 Ny lead: ${company} (${source})`;
  const html     = `
    <h2 style="margin:0 0 16px">Ny inbound lead på nis2klar.se</h2>
    <table style="font-size:15px;line-height:1.8;border-collapse:collapse">
      <tr><td style="color:#888;padding-right:16px">Namn</td><td><strong>${name || '—'}</strong></td></tr>
      <tr><td style="color:#888;padding-right:16px">E-post</td><td><a href="mailto:${email}">${email}</a></td></tr>
      <tr><td style="color:#888;padding-right:16px">Telefon</td><td>${phone ? `<a href="tel:${phone}">${phone}</a>` : '—'}</td></tr>
      <tr><td style="color:#888;padding-right:16px">Bolag</td><td><strong>${company}</strong></td></tr>
      <tr><td style="color:#888;padding-right:16px">Källa</td><td>${source}</td></tr>
    </table>
    <p style="margin-top:24px;font-size:13px;color:#888">
      Se lead i CRM: <a href="https://humanizedtrust.xyz">humanizedtrust.xyz</a>
    </p>
  `;

  try {
    await axios.post('https://api.resend.com/emails', {
      from:    'NIS2Klar <jan@nis2klar.se>',
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
  const { name, email, phone, company, source, score_data } = req.body;

  if (!email || !company) {
    return res.status(400).json({ success: false, error: 'email and company required' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanCompany = company.trim();
  const cleanPhone = phone ? phone.trim() : null;
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
      // Bump to qualified + update phone if provided
      await db.query(
        `UPDATE discovery_leads
         SET review_status = CASE WHEN review_status IN ('new','cold') THEN 'qualified' ELSE review_status END,
             phone = COALESCE($2, phone),
             updated_at = NOW()
         WHERE id = $1`,
        [leadId, cleanPhone]
      );
    } else {
      // Create new lead from inbound capture
      const insert = await db.query(
        `INSERT INTO discovery_leads
           (company_name, email, phone, source, review_status, score, score_label, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'qualified', $5, $6, $7, NOW(), NOW())
         RETURNING id`,
        [
          cleanCompany,
          cleanEmail,
          cleanPhone,
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

    // Fire-and-forget notifications
    sendLeadNotification(name, cleanEmail, cleanPhone, cleanCompany, cleanSource);
    sendAutoReply(name, cleanEmail, cleanCompany);

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

// POST /api/inbound/email — Resend inbound webhook
// Receives emails sent to jan@nis2klar.se and stores them as messages on matching leads
router.post('/email', async (req, res) => {
  // Resend sends the payload directly (not nested under 'data')
  const payload = req.body?.data || req.body;
  const fromRaw   = payload?.from || '';
  const subject   = payload?.subject || '(no subject)';
  const bodyText  = payload?.text || '';
  const bodyHtml  = payload?.html || '';
  const messageId = payload?.message_id || payload?.messageId || null;

  // Extract plain email from "Name <email>" format
  const fromMatch = fromRaw.match(/<([^>]+)>/) || [null, fromRaw];
  const fromEmail = (fromMatch[1] || fromRaw).trim().toLowerCase();

  if (!fromEmail) {
    return res.status(400).json({ success: false, error: 'no from email' });
  }

  try {
    // Find lead by email
    const { rows } = await db.query(
      'SELECT id FROM discovery_leads WHERE LOWER(email) = $1 LIMIT 1',
      [fromEmail]
    );

    const leadId = rows.length > 0 ? rows[0].id : null;

    // Store message (even if no lead found, lead_id = null)
    await db.query(
      `INSERT INTO messages (lead_id, direction, from_email, to_email, subject, body_text, body_html, resend_message_id)
       VALUES ($1, 'inbound', $2, 'jan@nis2klar.se', $3, $4, $5, $6)`,
      [leadId, fromEmail, subject, bodyText, bodyHtml, messageId]
    );

    // Log activity if lead found
    if (leadId) {
      await db.query(
        `INSERT INTO activities (lead_id, type, title, body)
         VALUES ($1, 'email', $2, $3)`,
        [leadId, `📩 Inbound email: ${subject}`, `From: ${fromRaw}`]
      );
    }

    console.log(`[inbound/email] stored message from ${fromEmail}, lead_id=${leadId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[inbound/email] error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
