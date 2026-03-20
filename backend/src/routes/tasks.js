const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/tasks — list tasks for current user
// Query params: ?completed=false&limit=20&lead_id=X
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
      `SELECT t.id, t.lead_id, t.title, t.due_date, t.completed, t.completed_at, t.created_at,
              l.company_name
       FROM tasks t
       LEFT JOIN discovery_leads l ON l.id = t.lead_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.due_date ASC NULLS LAST, t.created_at ASC
       LIMIT $${params.length}`,
      params
    );
    res.json({ success: true, data: { tasks: rows } });
  } catch (err) {
    console.error('[tasks] list error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/tasks — create task
router.post('/', async (req, res) => {
  const { lead_id, title, due_date } = req.body;
  if (!title) return res.status(400).json({ success: false, error: 'title required' });

  try {
    const { rows } = await db.query(
      `INSERT INTO tasks (user_id, lead_id, title, due_date)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, lead_id || null, title, due_date || null]
    );
    res.json({ success: true, data: { task: rows[0] } });
  } catch (err) {
    console.error('[tasks] create error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/tasks/:id — update task
router.patch('/:id', async (req, res) => {
  const { completed, title, due_date } = req.body;
  const fields = [];
  const params = [];

  if (title !== undefined)     { params.push(title);     fields.push(`title = $${params.length}`); }
  if (due_date !== undefined)  { params.push(due_date);  fields.push(`due_date = $${params.length}`); }
  if (completed !== undefined) {
    params.push(completed);
    fields.push(`completed = $${params.length}`);
    if (completed) {
      fields.push(`completed_at = NOW()`);
    } else {
      fields.push(`completed_at = NULL`);
    }
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
    await db.query(
      'DELETE FROM tasks WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[tasks] delete error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
