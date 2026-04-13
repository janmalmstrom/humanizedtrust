const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Max 5 login attempts per IP per 15 minutes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true, // only count failed attempts
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts — try again in 15 minutes' },
});

// Max 10 TOTP attempts per IP per 15 minutes
const totpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many attempts — try again in 15 minutes' },
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required' });

  try {
    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (!rows[0]) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    // If MFA is enabled, return short-lived pending token
    if (rows[0].totp_enabled) {
      const mfaToken = jwt.sign(
        { mfaPending: true, userId: rows[0].id },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({ success: true, data: { mfa_required: true, mfa_token: mfaToken } });
    }

    const token = jwt.sign(
      { userId: rows[0].id, email: rows[0].email, name: rows[0].name },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({ success: true, data: { token, user: { id: rows[0].id, email: rows[0].email, name: rows[0].name } } });
  } catch (err) {
    console.error('[auth] login error:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/auth/totp/login — complete MFA step
router.post('/totp/login', totpLimiter, async (req, res) => {
  const { mfa_token, code } = req.body;
  if (!mfa_token || !code) return res.status(400).json({ success: false, error: 'mfa_token and code required' });

  try {
    let decoded;
    try {
      decoded = jwt.verify(mfa_token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, error: 'MFA session expired — please log in again' });
    }

    if (!decoded.mfaPending) return res.status(401).json({ success: false, error: 'Invalid MFA token' });

    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    if (!rows[0] || !rows[0].totp_enabled || !rows[0].totp_secret) {
      return res.status(401).json({ success: false, error: 'MFA not configured' });
    }

    const valid = speakeasy.totp.verify({
      secret: rows[0].totp_secret,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    if (!valid) return res.status(401).json({ success: false, error: 'Invalid code — try again' });

    const token = jwt.sign(
      { userId: rows[0].id, email: rows[0].email, name: rows[0].name },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({ success: true, data: { token, user: { id: rows[0].id, email: rows[0].email, name: rows[0].name } } });
  } catch (err) {
    console.error('[auth] totp/login error:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/auth/totp/setup — generate secret + QR code (authenticated)
router.post('/totp/setup', authenticateToken, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT email FROM users WHERE id = $1', [req.user.userId]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'User not found' });

    const secret = speakeasy.generateSecret({
      name: `HumanizedTrust (${rows[0].email})`,
      issuer: 'HumanizedTrust',
    });

    // Save secret but don't enable yet (enabled on confirm)
    await db.query('UPDATE users SET totp_secret = $1, totp_enabled = FALSE WHERE id = $2', [secret.base32, req.user.userId]);

    const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.json({ success: true, data: { qr: qrDataUrl, secret: secret.base32 } });
  } catch (err) {
    console.error('[auth] totp/setup error:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/auth/totp/confirm — verify first code and enable MFA (authenticated)
router.post('/totp/confirm', authenticateToken, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ success: false, error: 'Code required' });

  try {
    const { rows } = await db.query('SELECT totp_secret FROM users WHERE id = $1', [req.user.userId]);
    if (!rows[0] || !rows[0].totp_secret) {
      return res.status(400).json({ success: false, error: 'Run /totp/setup first' });
    }

    const valid = speakeasy.totp.verify({
      secret: rows[0].totp_secret,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    if (!valid) return res.status(400).json({ success: false, error: 'Invalid code — check your authenticator app' });

    await db.query('UPDATE users SET totp_enabled = TRUE WHERE id = $1', [req.user.userId]);

    res.json({ success: true, data: { message: 'MFA enabled successfully' } });
  } catch (err) {
    console.error('[auth] totp/confirm error:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/auth/totp/disable — disable MFA (authenticated, requires password)
router.post('/totp/disable', authenticateToken, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ success: false, error: 'Password required' });

  try {
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.user.userId]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'User not found' });

    const valid = await bcrypt.compare(password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ success: false, error: 'Invalid password' });

    await db.query('UPDATE users SET totp_enabled = FALSE, totp_secret = NULL WHERE id = $1', [req.user.userId]);

    res.json({ success: true, data: { message: 'MFA disabled' } });
  } catch (err) {
    console.error('[auth] totp/disable error:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/auth/totp/status — check if MFA is enabled (authenticated)
router.get('/totp/status', authenticateToken, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT totp_enabled FROM users WHERE id = $1', [req.user.userId]);
    res.json({ success: true, data: { enabled: rows[0]?.totp_enabled ?? false } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/auth/register (single user — personal tool)
router.post('/register', async (req, res) => {
  const { email, password, name, setup_key } = req.body;

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
      { expiresIn: '30d' }
    );

    res.json({ success: true, data: { token, user: rows[0] } });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ success: false, error: 'Email already registered' });
    console.error('[auth] register error:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  res.json({ success: true, data: { user: req.user } });
});

module.exports = router;
