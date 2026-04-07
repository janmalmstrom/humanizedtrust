require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3004;

app.use(helmet());
app.use(cors({
  origin: [process.env.FRONTEND_URL, 'http://localhost:5175'].filter(Boolean),
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('combined'));

const { authenticateToken } = require('./middleware/auth');

// Public
app.use('/api/auth',    require('./routes/auth'));
app.use('/api/inbound', require('./routes/inbound'));
app.use('/api/track',   require('./routes/tracking'));
app.use('/api/booking', require('./routes/booking'));

// Public — prospect confirms attendance by clicking link in email
app.get('/api/confirm/:token', async (req, res) => {
  const db = require('./db');
  try {
    const { rows } = await db.query(
      `UPDATE tasks SET confirmed_at = NOW()
       WHERE confirm_token = $1 AND confirmed_at IS NULL
       RETURNING id, title, scheduled_at`,
      [req.params.token]
    );
    const task = rows[0];
    const timeStr = task?.scheduled_at
      ? new Date(task.scheduled_at).toLocaleString('sv-SE', { dateStyle: 'long', timeStyle: 'short' })
      : '';
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html><html lang="sv"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Bekräftad — NIS2Klar</title>
      <style>body{font-family:Arial,sans-serif;background:#f5f7ff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
      .card{background:#fff;border-radius:12px;padding:40px 48px;max-width:420px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}
      h1{color:#1a1a1a;font-size:22px;margin:0 0 12px}p{color:#555;line-height:1.7;font-size:15px}
      .time{background:#f0f4ff;border-radius:8px;padding:12px 20px;margin:20px 0;font-weight:bold;color:#0055cc;font-size:16px}
      a{color:#0066cc}</style></head><body>
      <div class="card">
        <div style="font-size:48px;margin-bottom:16px">✅</div>
        <h1>Tack — vi ses!</h1>
        ${timeStr ? `<div class="time">📅 ${timeStr}</div>` : ''}
        <p>Din närvaro är bekräftad. Jan hör av sig om det är något du undrar över innan samtalet.</p>
        <p style="margin-top:24px;font-size:13px;color:#999">— Jan Malmström, <a href="https://nis2klar.se">NIS2Klar</a></p>
      </div></body></html>`);
  } catch (err) {
    console.error('[confirm] error:', err.message);
    res.status(500).send('Något gick fel. Kontakta jan@nis2klar.se');
  }
});

// Protected
app.use('/api/leads',      authenticateToken, require('./routes/leads'));
app.use('/api/discovery',  authenticateToken, require('./routes/discovery'));
app.use('/api/tasks',      authenticateToken, require('./routes/tasks'));
app.use('/api/activities', authenticateToken, require('./routes/activities'));
app.use('/api/contacts',   authenticateToken, require('./routes/contacts'));
app.use('/api/sequences',  authenticateToken, require('./routes/sequences'));
app.use('/api/enrichment', authenticateToken, require('./routes/enrichment'));
app.use('/api/messages',   authenticateToken, require('./routes/messages'));
app.use('/api/seo',        authenticateToken, require('./routes/seo'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'humanizedtrust', timestamp: new Date() }));

// ========== BACKGROUND JOBS ==========
const { run: enrichLeadsJob } = require('./jobs/enrichLeads');
const { startInboxPoller } = require('./jobs/pollInbox');
const { enrichIntentSignals } = require('./engines/enrich_intent_signal');

// Every 4 hours: 02:00, 06:00, 10:00, 14:00, 18:00, 22:00 UTC
// ~125 Serper searches/run × 6 runs/day = ~750/day = ~22,500/month — safe for paid tier
cron.schedule('0 2,6,10,14,18,22 * * *', () => {
  console.log('[cron] Starting enrichment pipeline');
  enrichLeadsJob().catch(err => console.error('[cron] enrichLeads error:', err.message));
});

// Daily at 07:00 UTC — intent signal check (JobTech API, no auth, ~10s run)
const db = require('./db');
cron.schedule('0 7 * * *', () => {
  console.log('[cron] Running intent signal check');
  enrichIntentSignals(db)
    .then(r => console.log(`[cron] Intent signals: ${r.signalsFound} found, ${r.leadsUpdated} leads updated`))
    .catch(err => console.error('[cron] intent signal error:', err.message));
});

// IMAP reply detection — every 5 minutes (activates when IMAP_HOST is set in .env)
startInboxPoller().catch(err => console.error('[PollInbox] startup error:', err.message));

app.listen(PORT, () => {
  console.log(`[server] HumanizedTrust backend running on port ${PORT}`);
});

module.exports = app;
