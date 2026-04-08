'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const axios   = require('axios');
const crypto  = require('crypto');

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function sendWelcomeEmail(email) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const unsubUrl = `https://nis2klar.se/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
      <p style="font-size:16px">Välkommen!</p>
      <p style="font-size:15px;line-height:1.7">
        Du prenumererar nu på <strong>NIS2Klar</strong> — veckovisa guider om NIS2 för svenska VD:ar och styrelser.
      </p>
      <p style="font-size:15px;line-height:1.7">
        Nästa artikel kommer direkt till din inkorg. Under tiden kan du läsa våra befintliga guider:
      </p>
      <p style="text-align:center;margin:24px 0">
        <a href="https://nis2klar.se/artiklar.html" style="background:#f5c518;color:#141416;text-decoration:none;padding:13px 32px;border-radius:6px;font-size:15px;font-weight:bold;display:inline-block">
          Läs alla NIS2-guider →
        </a>
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
      <p style="font-size:12px;color:#999">
        NIS2Klar drivs av M&amp;J Trusted Marketing KB ·
        <a href="${unsubUrl}" style="color:#999">Avprenumerera</a> ·
        <a href="https://nis2klar.se/integritetspolicy.html" style="color:#999">Integritetspolicy</a>
      </p>
    </div>
  `;

  try {
    await axios.post('https://api.resend.com/emails', {
      from:    'Jan Malmström <jan@nis2klar.se>',
      to:      [email],
      subject: 'Välkommen till NIS2Klar — veckovisa NIS2-guider',
      html
    }, { headers: { Authorization: `Bearer ${apiKey}` } });
    console.log(`[newsletter] welcome sent to ${email}`);
  } catch (err) {
    console.error('[newsletter] welcome email error:', err.response?.data || err.message);
  }
}

async function sendNewSubscriberNotification(email, source) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const notifyTo = process.env.NOTIFY_EMAIL || 'malmstromjan@gmail.com';
  try {
    await axios.post('https://api.resend.com/emails', {
      from:    'NIS2Klar <onboarding@resend.dev>',
      to:      [notifyTo],
      subject: `📬 Ny prenumerant: ${email}`,
      html:    `<p>Ny nyhetsbrevsprenumerant på nis2klar.se</p>
                <p><strong>E-post:</strong> ${email}<br>
                <strong>Källa:</strong> ${source || '—'}</p>`
    }, { headers: { Authorization: `Bearer ${apiKey}` } });
    console.log(`[newsletter] notify sent to ${notifyTo}`);
  } catch (err) {
    console.error('[newsletter] notify error:', err.response?.data || err.message);
  }
}

// POST /api/newsletter/subscribe
router.post('/subscribe', async (req, res) => {
  const { email, source } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'email required' });

  const cleanEmail = email.trim().toLowerCase();

  try {
    const existing = await db.query(
      'SELECT id, unsubscribed_at FROM newsletter_subscribers WHERE LOWER(email) = $1',
      [cleanEmail]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      if (row.unsubscribed_at) {
        // Re-subscribe — update DB and send welcome + notify
        await db.query(
          'UPDATE newsletter_subscribers SET unsubscribed_at = NULL, subscribed_at = NOW() WHERE id = $1',
          [row.id]
        );
        sendWelcomeEmail(cleanEmail);
        sendNewSubscriberNotification(cleanEmail, source);
      }
      // Already active — silent success (no double welcome email)
      return res.json({ success: true });
    }

    const token = generateToken();
    await db.query(
      'INSERT INTO newsletter_subscribers (email, source, unsubscribe_token) VALUES ($1, $2, $3)',
      [cleanEmail, source || 'article', token]
    );

    sendWelcomeEmail(cleanEmail);
    sendNewSubscriberNotification(cleanEmail, source);

    res.json({ success: true });
  } catch (err) {
    console.error('[newsletter] subscribe error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/newsletter/unsubscribe?email=xxx
router.get('/unsubscribe', async (req, res) => {
  const email = (req.query.email || '').trim().toLowerCase();
  if (!email) return res.status(400).send('Ogiltig länk.');

  try {
    await db.query(
      'UPDATE newsletter_subscribers SET unsubscribed_at = NOW() WHERE LOWER(email) = $1',
      [email]
    );
    res.send(`
      <html><head><meta charset="UTF-8"><title>Avprenumererad</title>
      <style>body{font-family:Arial,sans-serif;max-width:500px;margin:80px auto;text-align:center;color:#333}</style>
      </head><body>
      <h2>Du är avprenumererad</h2>
      <p>Du kommer inte längre att få nyhetsbrev från NIS2Klar.</p>
      <p><a href="https://nis2klar.se/nis2.html">Tillbaka till nis2klar.se</a></p>
      </body></html>
    `);
  } catch (err) {
    res.status(500).send('Något gick fel.');
  }
});

module.exports = router;
