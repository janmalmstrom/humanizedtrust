const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/enrichment/stats
router.get('/stats', async (req, res) => {
  try {
    const [statsRes, recentRes] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(email) AS has_email,
          COUNT(CASE WHEN email_status='verified' THEN 1 END) AS verified_emails,
          COUNT(CASE WHEN email_status='guessed' THEN 1 END) AS guessed_emails,
          COUNT(website) AS has_website,
          COUNT(linkedin_url) AS has_linkedin,
          COUNT(phone) AS has_phone,
          COUNT(CASE WHEN last_enriched_at IS NOT NULL THEN 1 END) AS ever_enriched,
          MAX(last_enriched_at) AS last_enriched
        FROM discovery_leads
      `),
      db.query(`
        SELECT id, lead_id, type, title, body, created_at
        FROM activities
        WHERE type LIKE 'enrich%'
        ORDER BY created_at DESC
        LIMIT 5
      `)
    ]);

    res.json({
      success: true,
      data: {
        stats: statsRes.rows[0],
        recent_activity: recentRes.rows
      }
    });
  } catch (err) {
    console.error('[enrichment] stats error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/enrichment/trigger — fire enrichment immediately
router.post('/trigger', async (req, res) => {
  try {
    const { run } = require('../jobs/enrichLeads');
    setImmediate(() => run().catch(err => console.error('[enrichment] trigger error:', err.message)));
    res.json({ success: true, data: { message: 'Enrichment started — check back in a few minutes' } });
  } catch (err) {
    console.error('[enrichment] trigger error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
