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
app.use('/api/auth', require('./routes/auth'));

// Protected
app.use('/api/leads',     authenticateToken, require('./routes/leads'));
app.use('/api/discovery', authenticateToken, require('./routes/discovery'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'humanizedtrust', timestamp: new Date() }));

// ========== BACKGROUND JOBS ==========
const { run: enrichLeadsJob } = require('./jobs/enrichLeads');

// 06:00 UTC — enrich leads with LinkedIn, email, website
cron.schedule('0 6 * * *', () => {
  console.log('[cron] 06:00 — Starting enrichment pipeline');
  enrichLeadsJob().catch(err => console.error('[cron] enrichLeads error:', err.message));
});

app.listen(PORT, () => {
  console.log(`[server] HumanizedTrust backend running on port ${PORT}`);
});

module.exports = app;
