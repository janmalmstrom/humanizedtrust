const express = require('express');
const router = express.Router();
const db = require('../db');
const crypto = require('crypto');

// POST /api/booking — Cal.com webhook
// Add this URL in Cal.com → Settings → Developer → Webhooks
// Events to subscribe: BOOKING_CREATED, BOOKING_CANCELLED, BOOKING_RESCHEDULED
router.post('/', async (req, res) => {
  // Optional signature verification
  const secret = process.env.CAL_WEBHOOK_SECRET;
  if (secret) {
    const sig = req.headers['x-cal-signature-256'] || '';
    const expected = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');
    if (sig !== expected) {
      console.warn('[booking] invalid signature');
      return res.status(401).json({ error: 'invalid signature' });
    }
  }

  const { triggerEvent, payload } = req.body;
  if (!payload) return res.status(400).json({ error: 'no payload' });

  const attendee = payload.attendees?.[0] || {};
  const email    = (attendee.email || '').toLowerCase().trim();
  const name     = attendee.name || '';
  const startIso = payload.startTime;
  const endIso   = payload.endTime;
  const title    = payload.title || '30 min möte';

  console.log(`[booking] ${triggerEvent} — ${email} @ ${startIso}`);

  try {
    if (triggerEvent === 'BOOKING_CREATED') {
      // Find lead by email
      const { rows: leads } = await db.query(
        'SELECT id, company_name FROM discovery_leads WHERE LOWER(email) = $1 LIMIT 1',
        [email]
      );
      const lead = leads[0] || null;
      const companyName = lead?.company_name || name || 'Unknown';

      // Get user id 1 (Jan) as task owner — adjust if multi-user
      const { rows: users } = await db.query('SELECT id FROM users LIMIT 1');
      const userId = users[0]?.id || 1;

      // Create task
      const token = crypto.randomBytes(24).toString('hex');
      const { rows: taskRows } = await db.query(
        `INSERT INTO tasks (user_id, lead_id, title, scheduled_at, due_date, confirm_token, confirmed_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING id`,
        [
          userId,
          lead?.id || null,
          `📞 Samtal · ${companyName} (via Cal.com)`,
          startIso,
          startIso ? startIso.slice(0, 10) : null,
          token,
        ]
      );

      // Log activity on lead if found
      if (lead?.id) {
        const startDate = new Date(startIso);
        const timeStr = startDate.toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
        await db.query(
          `INSERT INTO activities (lead_id, type, title, body)
           VALUES ($1, 'call', $2, $3)`,
          [
            lead.id,
            `📅 Samtal bokat via Cal.com — ${timeStr}`,
            `Bokat av: ${name} (${email})\nTitel: ${title}`,
          ]
        );
      }

      console.log(`[booking] task created for ${email}, task_id=${taskRows[0]?.id}`);

    } else if (triggerEvent === 'BOOKING_CANCELLED') {
      // Mark task as cancelled — set completed with note
      await db.query(
        `UPDATE tasks SET completed = true, completed_at = NOW(),
         title = title || ' [AVBOKAT]'
         WHERE scheduled_at = $1 AND lead_id IN (
           SELECT id FROM discovery_leads WHERE LOWER(email) = $2
         )`,
        [startIso, email]
      );
      console.log(`[booking] cancelled for ${email} @ ${startIso}`);

    } else if (triggerEvent === 'BOOKING_RESCHEDULED') {
      const newStart = payload.rescheduleStartTime || startIso;
      await db.query(
        `UPDATE tasks SET scheduled_at = $1, due_date = $2
         WHERE scheduled_at = $3 AND lead_id IN (
           SELECT id FROM discovery_leads WHERE LOWER(email) = $4
         )`,
        [newStart, newStart?.slice(0, 10), startIso, email]
      );
      console.log(`[booking] rescheduled for ${email} → ${newStart}`);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[booking] error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
