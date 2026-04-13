const express = require('express');
const router = express.Router();
const db = require('../db');
const axios = require('axios');

// GET /api/messages/unread-summary — all leads with unread inbound messages (for dashboard)
// MUST be before /:lead_id to avoid Express treating "unread-summary" as a lead_id
router.get('/unread-summary', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT m.lead_id, l.company_name, l.email AS lead_email,
              COUNT(*) AS unread_count,
              MAX(m.created_at) AS latest_at,
              (SELECT m2.subject FROM messages m2
               WHERE m2.lead_id = m.lead_id AND m2.direction = 'inbound' AND m2.read_at IS NULL
               ORDER BY m2.created_at DESC LIMIT 1) AS latest_subject
       FROM messages m
       JOIN discovery_leads l ON l.id = m.lead_id
       WHERE m.direction = 'inbound' AND m.read_at IS NULL AND m.lead_id IS NOT NULL
       GROUP BY m.lead_id, l.company_name, l.email
       ORDER BY MAX(m.created_at) DESC`
    );
    res.json({ success: true, data: { unread: rows } });
  } catch (err) {
    console.error('[messages] unread-summary error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/messages/:lead_id — list messages, mark inbound as read
router.get('/:lead_id', async (req, res) => {
  const { lead_id } = req.params;
  try {
    const { rows } = await db.query(
      `SELECT id, lead_id, direction, from_email, to_email, subject,
              body_text, body_html, read_at, created_at
       FROM messages
       WHERE lead_id = $1
       ORDER BY created_at ASC`,
      [lead_id]
    );
    // Mark unread inbound as read
    await db.query(
      `UPDATE messages SET read_at = NOW()
       WHERE lead_id = $1 AND direction = 'inbound' AND read_at IS NULL`,
      [lead_id]
    );
    res.json({ success: true, data: { messages: rows } });
  } catch (err) {
    console.error('[messages] list error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/messages/:lead_id/unread-count
router.get('/:lead_id/unread-count', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT COUNT(*) AS count FROM messages
       WHERE lead_id = $1 AND direction = 'inbound' AND read_at IS NULL`,
      [req.params.lead_id]
    );
    res.json({ success: true, count: parseInt(rows[0].count) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/messages/:lead_id/reply — send email via Resend, store as outbound
router.post('/:lead_id/reply', async (req, res) => {
  const { lead_id } = req.params;
  const { to_email, subject, body } = req.body;

  if (!to_email || !body) {
    return res.status(400).json({ success: false, error: 'to_email and body required' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'RESEND_API_KEY not configured' });
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || 'jan@nis2klar.se';

  try {
    // Send via Resend
    const response = await axios.post('https://api.resend.com/emails', {
      from: `Jan Malmström <${fromEmail}>`,
      to: [to_email],
      subject: subject || 'Ang. NIS2',
      html: body.replace(/\n/g, '<br>'),
      text: body,
    }, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });

    const resendId = response.data?.id;

    // Store as outbound message
    await db.query(
      `INSERT INTO messages (lead_id, direction, from_email, to_email, subject, body_text, body_html, resend_message_id, read_at)
       VALUES ($1, 'outbound', $2, $3, $4, $5, $6, $7, NOW())`,
      [lead_id, fromEmail, to_email, subject || 'Ang. NIS2', body, body.replace(/\n/g, '<br>'), resendId]
    );

    // Log activity
    await db.query(
      `INSERT INTO activities (lead_id, type, title, body)
       VALUES ($1, 'email', $2, $3)`,
      [lead_id, `Email sent: ${subject || 'Ang. NIS2'}`, `To: ${to_email}`]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[messages] reply error:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data?.message || err.message });
  }
});

module.exports = router;
