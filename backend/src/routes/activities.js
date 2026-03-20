const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../db');

// GET /api/activities/:lead_id — list activities for a lead
router.get('/:lead_id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, lead_id, user_id, type, title, body, created_at
       FROM activities
       WHERE lead_id = $1
       ORDER BY created_at DESC`,
      [req.params.lead_id]
    );
    res.json({ success: true, data: { activities: rows } });
  } catch (err) {
    console.error('[activities] list error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/activities/:lead_id — create activity
router.post('/:lead_id', async (req, res) => {
  const { type, title, body } = req.body;
  if (!type) return res.status(400).json({ success: false, error: 'type required' });

  try {
    const { rows } = await db.query(
      `INSERT INTO activities (lead_id, user_id, type, title, body)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.lead_id, req.user.id, type, title || null, body || null]
    );
    res.json({ success: true, data: { activity: rows[0] } });
  } catch (err) {
    console.error('[activities] create error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
