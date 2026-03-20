'use strict';
/**
 * emailService.js — AWS SES outbound email sender
 *
 * Required env vars:
 *   AWS_REGION          e.g. eu-north-1
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 *   SES_FROM_EMAIL      e.g. jan@humanizedtrust.xyz (must be verified in SES)
 */

const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

function getClient() {
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error('AWS SES not configured — set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY');
  }

  return new SESClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
}

/**
 * Send a plain-text email via SES.
 * @param {object} opts
 * @param {string} opts.to        — recipient address
 * @param {string} opts.subject
 * @param {string} opts.body      — plain text body
 * @param {string} [opts.from]    — override SES_FROM_EMAIL
 * @returns {Promise<{messageId: string}>}
 */
async function sendEmail({ to, subject, body, from }) {
  const fromAddr = from || process.env.SES_FROM_EMAIL;
  if (!fromAddr) throw new Error('SES_FROM_EMAIL not configured');

  const client = getClient();
  const cmd = new SendEmailCommand({
    Source: fromAddr,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Text: { Data: body, Charset: 'UTF-8' } },
    },
  });

  const result = await client.send(cmd);
  return { messageId: result.MessageId };
}

module.exports = { sendEmail };
