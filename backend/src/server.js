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

// Protected
app.use('/api/leads',      authenticateToken, require('./routes/leads'));
app.use('/api/discovery',  authenticateToken, require('./routes/discovery'));
app.use('/api/tasks',      authenticateToken, require('./routes/tasks'));
app.use('/api/activities', authenticateToken, require('./routes/activities'));
app.use('/api/contacts',   authenticateToken, require('./routes/contacts'));
app.use('/api/sequences',  authenticateToken, require('./routes/sequences'));
app.use('/api/enrichment', authenticateToken, require('./routes/enrichment'));

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
