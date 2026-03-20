'use strict';
/**
 * pollInbox.js — IMAP reply detection for HumanizedTrust
 *
 * Polls a configured inbox every 5 minutes looking for replies to outreach emails.
 * When a reply is detected from a known lead email address:
 *   1. Logs a 'reply' activity on the lead
 *   2. Marks the sequence enrollment as 'replied' (pauses sequence)
 *   3. Promotes lead status to 'qualified' if still 'contacted'
 *
 * Required env vars to activate:
 *   IMAP_HOST, IMAP_USER, IMAP_PASS, IMAP_PORT (default 993), IMAP_TLS (default true)
 */

const db = require('../db');

let Imap, simpleParser;
try {
  Imap = require('imap');
  simpleParser = require('mailparser').simpleParser;
} catch {
  // imap / mailparser not installed — silent, will skip
}

async function getLeadByEmail(email) {
  const { rows } = await db.query(
    'SELECT id, company_name, review_status FROM discovery_leads WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [email]
  );
  return rows[0] || null;
}

async function handleReply(fromEmail, subject) {
  const lead = await getLeadByEmail(fromEmail);
  if (!lead) return; // Not a known lead

  console.log(`[PollInbox] Reply detected from ${fromEmail} (${lead.company_name})`);

  // 1. Log reply activity
  await db.query(
    `INSERT INTO activities (lead_id, type, title, body, created_at)
     VALUES ($1, 'reply', $2, $3, NOW())
     ON CONFLICT DO NOTHING`,
    [lead.id, `Reply received: ${subject || '(no subject)'}`, `Inbound reply from ${fromEmail}`]
  );

  // 2. Mark active sequence enrollment as replied
  await db.query(
    `UPDATE sequence_enrollments
     SET status = 'replied', replied_at = NOW(), updated_at = NOW()
     WHERE lead_id = $1 AND status = 'active'`,
    [lead.id]
  );

  // 3. Promote to qualified if still just contacted
  if (lead.review_status === 'contacted') {
    await db.query(
      `UPDATE discovery_leads SET review_status = 'qualified', updated_at = NOW() WHERE id = $1`,
      [lead.id]
    );
  }
}

function pollOnce() {
  return new Promise((resolve) => {
    if (!Imap || !process.env.IMAP_HOST || !process.env.IMAP_USER || !process.env.IMAP_PASS) {
      return resolve(); // Not configured — skip silently
    }

    const imap = new Imap({
      user:     process.env.IMAP_USER,
      password: process.env.IMAP_PASS,
      host:     process.env.IMAP_HOST,
      port:     parseInt(process.env.IMAP_PORT || '993'),
      tls:      process.env.IMAP_TLS !== 'false',
      tlsOptions: { rejectUnauthorized: false },
    });

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err, box) => {
        if (err) { imap.end(); return resolve(); }

        // Search unseen messages from the last 7 days
        const since = new Date();
        since.setDate(since.getDate() - 7);
        imap.search(['UNSEEN', ['SINCE', since]], (err, uids) => {
          if (err || !uids || uids.length === 0) { imap.end(); return resolve(); }

          const fetch = imap.fetch(uids, { bodies: ['HEADER.FIELDS (FROM SUBJECT)', ''], markSeen: true });
          const promises = [];

          fetch.on('message', (msg) => {
            let fromEmail = null, subject = null;
            msg.on('body', (stream, info) => {
              if (info.which === 'HEADER.FIELDS (FROM SUBJECT)') {
                let data = '';
                stream.on('data', c => { data += c.toString(); });
                stream.once('end', () => {
                  const fromMatch = data.match(/From:.*?([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
                  const subjMatch = data.match(/Subject:\s*(.+)/i);
                  if (fromMatch) fromEmail = fromMatch[1];
                  if (subjMatch) subject = subjMatch[1].trim();
                });
              }
            });
            msg.once('end', () => {
              if (fromEmail) promises.push(handleReply(fromEmail, subject));
            });
          });

          fetch.once('end', async () => {
            await Promise.allSettled(promises);
            imap.end();
            resolve();
          });
        });
      });
    });

    imap.once('error', () => resolve());
    imap.once('end', () => resolve());
    imap.connect();
  });
}

async function startInboxPoller() {
  if (!process.env.IMAP_HOST) {
    console.log('[PollInbox] No IMAP_HOST configured — reply detection disabled');
    return;
  }

  // Check imap package is available
  if (!Imap) {
    console.log('[PollInbox] imap package not installed — run: npm install imap mailparser');
    return;
  }

  console.log(`[PollInbox] Starting — polling ${process.env.IMAP_HOST} every 5 minutes`);
  await pollOnce();
  setInterval(pollOnce, 5 * 60 * 1000);
}

module.exports = { startInboxPoller, pollOnce };
