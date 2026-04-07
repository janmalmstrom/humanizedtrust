const express = require('express');
const router = express.Router();
const db = require('../db');
const axios = require('axios');
const crypto = require('crypto');

// GET /api/tasks — list tasks for current user
router.get('/', async (req, res) => {
  const { completed, limit = 20, lead_id } = req.query;
  const params = [req.user.id];
  const conditions = ['t.user_id = $1'];

  if (completed !== undefined) {
    params.push(completed === 'true');
    conditions.push(`t.completed = $${params.length}`);
  }
  if (lead_id) {
    params.push(parseInt(lead_id));
    conditions.push(`t.lead_id = $${params.length}`);
  }
  params.push(parseInt(limit));

  try {
    const { rows } = await db.query(
      `SELECT t.id, t.lead_id, t.title, t.due_date, t.scheduled_at,
              t.confirm_token, t.confirmed_at,
              t.completed, t.completed_at, t.created_at,
              l.company_name, l.email AS lead_email
       FROM tasks t
       LEFT JOIN discovery_leads l ON l.id = t.lead_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.scheduled_at ASC NULLS LAST, t.due_date ASC NULLS LAST, t.created_at ASC
       LIMIT $${params.length}`,
      params
    );
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: { tasks: rows } });
  } catch (err) {
    console.error('[tasks] list error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/tasks — create task
router.post('/', async (req, res) => {
  const { lead_id, title, due_date, scheduled_at } = req.body;
  if (!title) return res.status(400).json({ success: false, error: 'title required' });

  try {
    const { rows } = await db.query(
      `INSERT INTO tasks (user_id, lead_id, title, due_date, scheduled_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, lead_id || null, title, due_date || null, scheduled_at || null]
    );
    res.json({ success: true, data: { task: rows[0] } });
  } catch (err) {
    console.error('[tasks] create error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/tasks/:id/send-invite — send calendar invite email to prospect
router.post('/:id/send-invite', async (req, res) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ success: false, error: 'RESEND_API_KEY not set' });

  try {
    // Load task + lead details
    const { rows } = await db.query(
      `SELECT t.*, l.company_name, l.email AS lead_email, l.phone AS lead_phone
       FROM tasks t
       LEFT JOIN discovery_leads l ON l.id = t.lead_id
       WHERE t.id = $1 AND t.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Task not found' });
    const task = rows[0];

    if (!task.lead_email) return res.status(400).json({ success: false, error: 'Lead has no email address' });

    // Generate confirm token if not already set
    let token = task.confirm_token;
    if (!token) {
      token = crypto.randomBytes(24).toString('hex');
      await db.query('UPDATE tasks SET confirm_token = $1 WHERE id = $2', [token, task.id]);
    }

    const scheduledAt = task.scheduled_at ? new Date(task.scheduled_at) : null;
    const dateStr = scheduledAt
      ? scheduledAt.toLocaleDateString('sv-SE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : 'TBD';
    const timeStr = scheduledAt
      ? scheduledAt.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
      : '';

    // Google Calendar link
    let gcalLink = '';
    if (scheduledAt) {
      const end = new Date(scheduledAt.getTime() + 30 * 60000); // 30 min
      const fmt = d => d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
      const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: `NIS2-samtal med Jan Malmström — NIS2Klar`,
        dates: `${fmt(scheduledAt)}/${fmt(end)}`,
        details: `Kostnadsfri NIS2-genomgång med Jan Malmström, NIS2Klar.\n\nVi går igenom vad NIS2 innebär för ${task.company_name} och vad som behöver göras.`,
        location: 'Videosamtal / telefon',
      });
      gcalLink = `https://calendar.google.com/calendar/render?${params.toString()}`;
    }

    // Confirm link
    const baseUrl = process.env.APP_URL || 'https://humanizedtrust.xyz';
    const confirmLink = `${baseUrl}/api/confirm/${token}`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
        <p style="font-size:16px">Hej,</p>
        <p style="font-size:15px;line-height:1.7">
          Jan Malmström från <strong>NIS2Klar</strong> har bokat ett samtal med dig om vad NIS2-direktivet innebär för <strong>${task.company_name}</strong>.
        </p>
        <div style="background:#f5f7ff;border-left:4px solid #0066cc;padding:16px 20px;margin:24px 0;border-radius:4px">
          <p style="margin:0;font-size:15px;font-weight:bold">📅 ${dateStr}${timeStr ? ` kl ${timeStr}` : ''}</p>
          <p style="margin:8px 0 0;font-size:14px;color:#555">Varaktighet: ca 30 minuter · Videosamtal / telefon</p>
        </div>
        ${gcalLink ? `
        <p style="text-align:center;margin:28px 0">
          <a href="${gcalLink}" style="background:#0066cc;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:15px;font-weight:bold;display:inline-block">
            📅 Lägg till i Google Kalender
          </a>
        </p>` : ''}
        <p style="text-align:center;margin:16px 0">
          <a href="${confirmLink}" style="background:#22c55e;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:15px;font-weight:bold;display:inline-block">
            ✅ Bekräfta att du kommer
          </a>
        </p>
        <p style="font-size:13px;color:#888;text-align:center;margin-top:8px">
          Kan du inte? Svara på det här mailet eller ring Jan direkt.
        </p>
        <p style="font-size:15px;margin-top:28px">— Jan Malmström, NIS2Klar</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
        <p style="font-size:12px;color:#999">
          NIS2Klar drivs av M&amp;J Trusted Marketing KB ·
          <a href="https://nis2klar.se/integritetspolicy.html" style="color:#999">Integritetspolicy</a>
        </p>
      </div>
    `;

    await axios.post('https://api.resend.com/emails', {
      from:    'Jan Malmström <jan@nis2klar.se>',
      to:      [task.lead_email],
      subject: `Bokningsbekräftelse: NIS2-samtal ${timeStr ? `kl ${timeStr}` : dateStr}`,
      html,
    }, { headers: { Authorization: `Bearer ${apiKey}` } });

    console.log(`[tasks] invite sent to ${task.lead_email} for task ${task.id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[tasks] send-invite error:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/tasks/:id — update task
router.patch('/:id', async (req, res) => {
  const { completed, title, due_date, scheduled_at } = req.body;
  const fields = [];
  const params = [];

  if (title !== undefined)        { params.push(title);        fields.push(`title = $${params.length}`); }
  if (due_date !== undefined)     { params.push(due_date);     fields.push(`due_date = $${params.length}`); }
  if (scheduled_at !== undefined) { params.push(scheduled_at); fields.push(`scheduled_at = $${params.length}`); }
  if (completed !== undefined) {
    params.push(completed);
    fields.push(`completed = $${params.length}`);
    fields.push(completed ? `completed_at = NOW()` : `completed_at = NULL`);
  }

  if (!fields.length) return res.status(400).json({ success: false, error: 'Nothing to update' });

  params.push(req.params.id, req.user.id);
  try {
    const { rows } = await db.query(
      `UPDATE tasks SET ${fields.join(', ')}
       WHERE id = $${params.length - 1} AND user_id = $${params.length}
       RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, data: { task: rows[0] } });
  } catch (err) {
    console.error('[tasks] update error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[tasks] delete error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
