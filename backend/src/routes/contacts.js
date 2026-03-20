const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/contacts/:lead_id — list contacts for a lead
router.get('/:lead_id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, lead_id, name, title, email, phone, linkedin_url, notes, created_at
       FROM contacts WHERE lead_id = $1 ORDER BY created_at ASC`,
      [req.params.lead_id]
    );
    res.json({ success: true, data: { contacts: rows } });
  } catch (err) {
    console.error('[contacts] list error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/contacts/:lead_id — create contact
router.post('/:lead_id', async (req, res) => {
  const { name, title, email, phone, linkedin_url, notes } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'name required' });
  try {
    const { rows } = await db.query(
      `INSERT INTO contacts (lead_id, name, title, email, phone, linkedin_url, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.params.lead_id, name, title || null, email || null, phone || null, linkedin_url || null, notes || null]
    );
    res.json({ success: true, data: { contact: rows[0] } });
  } catch (err) {
    console.error('[contacts] create error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/contacts/:id — update contact
router.patch('/:id', async (req, res) => {
  const { name, title, email, phone, linkedin_url, notes } = req.body;
  const fields = [];
  const params = [];

  if (name !== undefined)        { params.push(name);        fields.push(`name = $${params.length}`); }
  if (title !== undefined)       { params.push(title);       fields.push(`title = $${params.length}`); }
  if (email !== undefined)       { params.push(email);       fields.push(`email = $${params.length}`); }
  if (phone !== undefined)       { params.push(phone);       fields.push(`phone = $${params.length}`); }
  if (linkedin_url !== undefined){ params.push(linkedin_url);fields.push(`linkedin_url = $${params.length}`); }
  if (notes !== undefined)       { params.push(notes);       fields.push(`notes = $${params.length}`); }

  if (!fields.length) return res.status(400).json({ success: false, error: 'Nothing to update' });

  fields.push(`updated_at = NOW()`);
  params.push(req.params.id);

  try {
    const { rows } = await db.query(
      `UPDATE contacts SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Contact not found' });
    res.json({ success: true, data: { contact: rows[0] } });
  } catch (err) {
    console.error('[contacts] update error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/contacts/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM contacts WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[contacts] delete error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
