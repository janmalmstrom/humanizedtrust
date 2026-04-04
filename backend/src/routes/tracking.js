const express = require('express');
const router = express.Router();
const db = require('../db');

const PAGE_URLS = {
  'nis2':               '/nis2.html',
  'nis2-checklista':    '/nis2-checklista.html',
  'nis2-kalkylator':    '/nis2-kalkylator.html',
  'nis2-styrelsepaket': '/nis2-styrelsepaket.html',
};

// GET /api/track?t=TOKEN&page=nis2
// Called when lead clicks a tracked link in an email.
// Marks lead as warm → redirects to the NIS2 page.
router.get('/', async (req, res) => {
  const { t: token, page = 'nis2' } = req.query;
  const redirectUrl = PAGE_URLS[page] || '/nis2.html';

  if (token) {
    try {
      const result = await db.query(
        `UPDATE discovery_leads
         SET warm_signal        = true,
             warm_signal_at     = NOW(),
             warm_signal_source = 'email_link_click',
             outreach_tier      = CASE
               WHEN intent_signal IS NOT NULL THEN 'hot'
               ELSE 'warm'
             END
         WHERE sequence_token = $1
         RETURNING id, company_name`,
        [token]
      );

      if (result.rows.length > 0) {
        const lead = result.rows[0];
        await db.query(
          `INSERT INTO activities (lead_id, type, title, body)
           VALUES ($1, 'warm_signal', 'Visited NIS2 page via email link', $2)`,
          [lead.id, `Clicked tracked link → ${page} page`]
        );
        console.log(`[tracking] Warm signal set: ${lead.company_name} (id=${lead.id}) via ${page}`);
      }
    } catch (err) {
      console.error('[tracking] Error setting warm signal:', err.message);
    }
  }

  res.redirect(302, redirectUrl);
});

// GET /api/track/pixel?page=nis2
// 1×1 transparent GIF fired from NIS2 pages (anonymous, no lead ID).
// Just counts page views — no PII, GDPR-safe.
router.get('/pixel', (req, res) => {
  const { page = 'unknown' } = req.query;
  console.log(`[pixel] Anonymous visit: ${page}`);
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' });
  res.send(gif);
});

module.exports = router;
