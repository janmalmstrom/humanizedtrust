'use strict';
const express = require('express');
const router  = express.Router();
const { sendEmail } = require('../services/emailService');

router.post('/', async (req, res) => {
  const { rating, name, feedback } = req.body;
  const r = parseInt(rating, 10);

  if (!r || r < 1 || r > 5) {
    return res.status(400).json({ error: 'Invalid rating' });
  }

  // Low rating — alert so Merlita can follow up
  if (r <= 3) {
    try {
      await sendEmail({
        to:      'info@lifeandpower.se',
        from:    'Life and Power <jan@nis2klar.se>',
        subject: `Oj — betyg ${r}/5 pa Life and Power. Kunden behover uppfoljning`,
        body: [
          'En kund lamnade ett lagt betyg via recensionsformulaeret.',
          '',
          `Betyg:    ${r}/5`,
          `Namn:     ${name     || '(ej angivet)'}`,
          `Feedback: ${feedback || '(ingen feedback)'}`,
          '',
          'Atgard: Kontakta kunden, erbjud atgarder eller rabatt pa nasta besok.',
        ].join('\n'),
      });
    } catch (err) {
      console.error('[lp-review-gate] email error:', err.message);
    }
  }

  res.json({ ok: true, rating: r });
});

module.exports = router;
