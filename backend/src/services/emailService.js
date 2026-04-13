'use strict';
/**
 * emailService.js — Outbound email via Resend
 *
 * Required env vars:
 *   RESEND_API_KEY   — from resend.com dashboard
 *   FROM_EMAIL       — verified sender, e.g. jan@nis2klar.se (optional, defaults below)
 */

const axios = require('axios');

/**
 * Send a plain-text email via Resend.
 * @param {object} opts
 * @param {string} opts.to        — recipient address
 * @param {string} opts.subject
 * @param {string} opts.body      — plain text body
 * @param {string} [opts.from]    — override default sender
 * @returns {Promise<{messageId: string}>}
 */
async function sendEmail({ to, subject, body, from }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');

  const fromAddr = from || process.env.FROM_EMAIL || 'Jan Malmström <jan@nis2klar.se>';

  const resp = await axios.post(
    'https://api.resend.com/emails',
    {
      from:    fromAddr,
      to:      [to],
      subject: subject,
      text:    body,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return { messageId: resp.data?.id || 'sent' };
}

module.exports = { sendEmail };
