const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required' });

  try {
    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (!rows[0]) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const token = jwt.sign(
      { userId: rows[0].id, email: rows[0].email, name: rows[0].name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ success: true, data: { token, user: { id: rows[0].id, email: rows[0].email, name: rows[0].name } } });
  } catch (err) {
    console.error('[auth] login error:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/auth/register (single user — personal tool)
router.post('/register', async (req, res) => {
  const { email, password, name, setup_key } = req.body;

  // One-time setup key prevents unauthorized signups
  if (setup_key !== process.env.SETUP_KEY) {
    return res.status(403).json({ success: false, error: 'Invalid setup key' });
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await db.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
      [email.toLowerCase(), hash, name]
    );

    const token = jwt.sign(
      { userId: rows[0].id, email: rows[0].email, name: rows[0].name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ success: true, data: { token, user: rows[0] } });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ success: false, error: 'Email already registered' });
    console.error('[auth] register error:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth').authenticateToken, (req, res) => {
  res.json({ success: true, data: { user: req.user } });
});

module.exports = router;
