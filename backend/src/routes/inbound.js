const express = require('express');
const router = express.Router();
const db = require('../db');
const axios = require('axios');
const { generateGapPdf } = require('../lib/generateGapPdf');
const { DOMAINS } = require('../lib/nis2Domains');

async function sendAutoReply(name, email, company, gapData) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const firstName = name ? name.split(' ')[0] : 'där';
  const bookingUrl = process.env.CAL_BOOKING_URL || 'https://outlook.office.com/bookwithme/user/f2557dc405cf4b3aaff3c558773b7945@nomadcyber.ai/meetingtype/-Xi3MIAkN0uUGXQjAhZ88w2?anonymous&ismsaljsauthenabled&ep=mLinkFromTile';

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
    const payload = {
      from:    'Jan Malmström <jan@nis2klar.se>',
      to:      [email],
      subject: `Vi återkommer inom 24 timmar — NIS2Klar`,
      html
    };

    // Attach PDF if gap analysis data provided
    if (gapData) {
      try {
        const pdfBuf = await generateGapPdf({
          company,
          name: name || '',
          score:        gapData.score     ?? 0,
          scorePct:     gapData.scorePct  ?? 0,
          riskLevel:    gapData.riskLevel ?? 'red',
          criticalGaps: gapData.criticalGaps ?? 0,
          partialGaps:  gapData.partialGaps  ?? 0,
          domains:      gapData.domains  ?? {},
          answers:      gapData.answers  ?? {},
        });
        payload.attachments = [{
          filename: 'NIS2_Gap_Analys.pdf',
          content:  pdfBuf.toString('base64'),
        }];
        console.log(`[inbound] PDF generated (${pdfBuf.length} bytes) for ${email}`);
      } catch (pdfErr) {
        console.error('[inbound] PDF generation failed:', pdfErr.message);
        // Continue without attachment
      }
    }

    await axios.post('https://api.resend.com/emails', payload,
      { headers: { Authorization: `Bearer ${apiKey}` } });
    console.log(`[inbound] auto-reply sent to ${email}`);
  } catch (err) {
    console.error('[inbound] auto-reply error:', err.response?.data || err.message);
  }
}

const RISK_COLORS = { red: '#cc0000', amber: '#cc7700', green: '#2a7a2a' };
const RISK_LABELS = { red: 'HOG RISK', amber: 'MEDELHOG RISK', green: 'GOD TACKNING' };


// Estimate per-question answers from domain scores + gap counts
// Used when answers object is not present (e.g. old cached HTML)
function estimateAnswers(domainScores, criticalGaps, partialGaps) {
  const DOMAIN_NAMES = ['Styrning & Ledning','Riskhantering','Incidentrespons','Leverantörskedja','Tekniska kontroller'];
  const answers = {};
  const totalGaps = criticalGaps + partialGaps;
  if (!totalGaps) return answers;

  const severities = DOMAIN_NAMES.map(n => Math.max(0, 100 - (domainScores?.[n] || 50)));
  const totalSev = severities.reduce((s, v) => s + v, 0) || 1;

  // Distribute gaps and kritisk proportionally, then fix totals with largest remainder
  const rawGaps    = severities.map(s => totalGaps    * s / totalSev);
  const rawKritisk = severities.map(s => criticalGaps * s / totalSev);

  const gapsAlloc    = rawGaps.map(v => Math.floor(v));
  const kritiskAlloc = rawKritisk.map(v => Math.floor(v));

  let gr = totalGaps    - gapsAlloc.reduce((s,v) => s+v, 0);
  let kr = criticalGaps - kritiskAlloc.reduce((s,v) => s+v, 0);

  rawGaps.map((v,i) => [i, v%1]).sort((a,b) => b[1]-a[1]).slice(0,gr).forEach(([i]) => gapsAlloc[i]++);
  rawKritisk.map((v,i) => [i, v%1]).sort((a,b) => b[1]-a[1]).slice(0,kr).forEach(([i]) => kritiskAlloc[i]++);

  for (let di = 0; di < 5; di++) {
    const domGaps    = Math.min(5, gapsAlloc[di]);
    const domKritisk = Math.min(domGaps, kritiskAlloc[di]);
    const domForbattra = domGaps - domKritisk;
    for (let qi = 0; qi < 5; qi++) {
      if      (qi < domKritisk)              answers[`d${di}_q${qi}`] = 0;
      else if (qi < domKritisk + domForbattra) answers[`d${di}_q${qi}`] = 1;
      else                                     answers[`d${di}_q${qi}`] = 2;
    }
  }
  return answers;
}

function buildGapHtml(gapData) {
  if (!gapData) return '';
  const { scorePct, riskLevel, criticalGaps, partialGaps, domains, answers } = gapData;
  const riskColor = RISK_COLORS[riskLevel] || '#888';
  const riskLabel = RISK_LABELS[riskLevel] || riskLevel;
  const totalGaps = criticalGaps + partialGaps;

  // Domain bars
  let domainRows = '';
  DOMAINS.forEach(d => {
    const pct = domains?.[d.name] ?? 0;
    const color = pct >= 75 ? '#2a7a2a' : pct >= 50 ? '#cc7700' : '#cc0000';
    domainRows += `<tr>
      <td style="padding:4px 12px 4px 0;font-size:13px;color:#444">${d.name}</td>
      <td style="padding:4px 0;font-size:13px;font-weight:bold;color:${color}">${pct}%</td>
    </tr>`;
  });

  // Collect KRITISK (0) and FÖRBÄTTRA (1) gaps
  const kritiska = [];
  const forbattra = [];
  DOMAINS.forEach((d, di) => {
    d.recs.forEach((rec, qi) => {
      const val = answers?.[`d${di}_q${qi}`];
      if (val === 0)      kritiska.push({ ...rec });
      else if (val === 1) forbattra.push({ ...rec });
    });
  });

  const allGaps = [
    ...kritiska.map(g => ({ ...g, severity: 'KRITISK', color: '#cc0000', bg: '#fff5f5' })),
    ...forbattra.map(g => ({ ...g, severity: 'FORBATTRA', color: '#cc7700', bg: '#fffbf0' })),
  ];

  let gapCards = '';
  allGaps.forEach(gap => {
    gapCards += `
      <div style="margin-bottom:16px;padding:14px;background:${gap.bg};border-left:4px solid ${gap.color};border-radius:4px">
        <div style="margin-bottom:6px">
          <span style="background:${gap.color};color:#fff;font-size:11px;font-weight:bold;padding:2px 8px;border-radius:3px">${gap.severity}</span>
          &nbsp;
          <span style="font-size:14px;font-weight:bold;color:#111">${gap.title}</span>
        </div>
        <p style="margin:0 0 6px;font-size:12px;color:#555;line-height:1.5">${gap.why}</p>
        <p style="margin:0;font-size:12px;color:#333;line-height:1.5"><strong>Atgard:</strong> ${gap.action}</p>
      </div>`;
  });

  return `
    <div style="margin-top:24px;border:2px solid ${riskColor};border-radius:8px;overflow:hidden">
      <div style="background:${riskColor};padding:10px 16px">
        <span style="color:#fff;font-size:16px;font-weight:bold">${riskLabel} — ${scorePct}% NIS2-tackning</span>
        &nbsp;&nbsp;
        <span style="color:rgba(255,255,255,0.85);font-size:13px">${criticalGaps} kritiska gap · ${partialGaps} forbattringsomraden</span>
      </div>
      <div style="padding:16px;background:#fff">
        <p style="margin:0 0 10px;font-size:13px;font-weight:bold;color:#333">Tackning per doman:</p>
        <table style="border-collapse:collapse;margin-bottom:20px">${domainRows}</table>
        <p style="margin:0 0 12px;font-size:14px;font-weight:bold;color:#111">Era ${totalGaps} gap att atgarda</p>
        ${gapCards}
      </div>
    </div>
  `;
}

async function sendLeadNotification(name, email, phone, company, source, gapData) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const notifyTo = process.env.NOTIFY_EMAIL || 'malmstromjan@gmail.com';
  const isGap    = source === 'nis2-gap-analys' && gapData;
  const subject  = isGap
    ? `🛡️ Gap-analys: ${company} — ${RISK_LABELS[gapData?.riskLevel] || ''} (${gapData?.scorePct}%)`
    : `🔔 Ny lead: ${company} (${source})`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:620px">
      <h2 style="margin:0 0 16px;font-size:18px">Ny inbound lead — nis2klar.se</h2>
      <table style="font-size:14px;line-height:1.8;border-collapse:collapse">
        <tr><td style="color:#888;padding-right:16px">Namn</td><td><strong>${name || '—'}</strong></td></tr>
        <tr><td style="color:#888;padding-right:16px">E-post</td><td><a href="mailto:${email}">${email}</a></td></tr>
        <tr><td style="color:#888;padding-right:16px">Telefon</td><td>${phone ? `<a href="tel:${phone}">${phone}</a>` : '—'}</td></tr>
        <tr><td style="color:#888;padding-right:16px">Bolag</td><td><strong>${company}</strong></td></tr>
        <tr><td style="color:#888;padding-right:16px">Källa</td><td>${source}</td></tr>
      </table>
      ${buildGapHtml(isGap ? gapData : null)}
      <p style="margin-top:20px;font-size:12px;color:#aaa">
        Se lead i CRM: <a href="https://humanizedtrust.xyz">humanizedtrust.xyz</a>
      </p>
    </div>
  `;

  try {
    await axios.post('https://api.resend.com/emails', {
      from: 'NIS2Klar <jan@nis2klar.se>',
      to:   [notifyTo],
      subject,
      html
    }, { headers: { Authorization: `Bearer ${apiKey}` } });
  } catch (err) {
    console.error('[inbound] notify error:', err.response?.data || err.message);
  }
}

// POST /api/inbound — public lead capture from NIS2 lead magnet pages
// No auth required — called from public HTML pages
router.post('/', async (req, res) => {
  const { name, email, phone, company, source, score_data, answers: bodyAnswers } = req.body;
  const answers = score_data?.answers || bodyAnswers || {};

  if (!email || !company) {
    return res.status(400).json({ success: false, error: 'email and company required' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanCompany = company.trim();
  const cleanPhone = phone ? phone.trim() : null;
  const cleanSource = source || 'nis2-inbound';

  if (cleanSource === 'nis2-gap-analys') {
    const ansKeys = Object.keys(answers || {}).length;
    console.log(`[inbound] gap-analys answers keys: ${ansKeys}, score_data keys: ${Object.keys(score_data || {}).join(',')}, body keys: ${Object.keys(req.body).join(',')}`);
  }

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
             source = $3,
             updated_at = NOW()
         WHERE id = $1`,
        [leadId, cleanPhone, cleanSource]
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

    // Save gap analysis submission if this is from the gap analysis form
    if (cleanSource === 'nis2-gap-analys' && score_data) {
      try {
        await db.query(
          `INSERT INTO gap_analysis_submissions
             (lead_id, company_name, contact_name, score, score_pct, risk_level,
              critical_gaps, partial_gaps, domains, answers)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            leadId,
            cleanCompany,
            name || null,
            score_data.score        ?? null,
            score_data.gapScore     ?? null,
            score_data.risk         ?? null,
            score_data.criticalGaps ?? null,
            score_data.partialGaps  ?? null,
            JSON.stringify(score_data.domains ?? {}),
            JSON.stringify(answers ?? {}),
          ]
        );
        console.log(`[inbound] gap analysis saved for lead ${leadId}`);
      } catch (err) {
        console.error('[inbound] gap analysis save error:', err.message);
      }
    }

    // Fire-and-forget notifications
    const gapData = (cleanSource === 'nis2-gap-analys' && score_data)
      ? {
          score:        score_data.score        ?? 0,
          scorePct:     score_data.gapScore      ?? 0,
          riskLevel:    score_data.risk          ?? 'red',
          criticalGaps: score_data.criticalGaps  ?? 0,
          partialGaps:  score_data.partialGaps   ?? 0,
          domains:      score_data.domains       ?? {},
          answers:      (Object.keys(answers || {}).length > 0)
            ? answers
            : estimateAnswers(score_data.domains, score_data.criticalGaps ?? 0, score_data.partialGaps ?? 0),
        }
      : null;

    sendLeadNotification(name, cleanEmail, cleanPhone, cleanCompany, cleanSource, gapData);
    sendAutoReply(name, cleanEmail, cleanCompany, gapData);

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

// POST /api/inbound/email — Cloudflare Worker / Resend inbound webhook
// Receives emails sent to jan@nis2klar.se and stores them as messages on matching leads
router.post('/email', async (req, res) => {
  const { simpleParser } = require('mailparser');

  const payload   = req.body?.data || req.body;
  const fromRaw   = payload?.from || '';
  const rawText   = payload?.text || '';
  const messageId = payload?.message_id || payload?.messageId || null;

  // Parse MIME email if raw contains headers (Cloudflare Worker sends full RFC 2822)
  let subject  = payload?.subject || '(no subject)';
  let bodyText = rawText.trim();
  let bodyHtml = payload?.html || '';

  if (rawText.includes('Received:') || rawText.includes('MIME-Version:')) {
    try {
      const parsed = await simpleParser(rawText);
      subject  = parsed.subject || subject;
      bodyText = parsed.text?.trim() || bodyText;
      bodyHtml = parsed.html  || bodyHtml;
    } catch {}
  }

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
