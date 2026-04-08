'use strict';
/**
 * NIS2Klar Weekly Newsletter Digest
 *
 * Finds articles published since the last digest, emails all active subscribers.
 * Run via cron: Fridays 14:00 UTC (16:00 CET)
 *
 * Usage:
 *   node scripts/send_newsletter_digest.js          # normal run
 *   node scripts/send_newsletter_digest.js --dry-run # preview without sending
 *   node scripts/send_newsletter_digest.js --force   # ignore last_digest_at, send all articles
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const fs    = require('fs');
const path  = require('path');
const axios = require('axios');
const db    = require('../src/db');

const ARTICLES_DIR = path.join(__dirname, '../../frontend/public/artiklar');
const STATE_FILE   = path.join(__dirname, '../data/newsletter_state.json');
const BASE_URL     = 'https://nis2klar.se';

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE   = args.includes('--force');

// ── State helpers ────────────────────────────────────────────────────────────

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { last_digest_at: null };
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

// ── Article discovery ────────────────────────────────────────────────────────

function extractMeta(html) {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const descMatch  = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)
                  || html.match(/<meta\s+content="([^"]+)"\s+name="description"/i);
  const title = titleMatch ? titleMatch[1].replace(' | NIS2Klar', '').trim() : null;
  const desc  = descMatch  ? descMatch[1].trim() : null;
  return { title, desc };
}

function getNewArticles(since) {
  const files = fs.readdirSync(ARTICLES_DIR)
    .filter(f => f.endsWith('.html'))
    .map(f => {
      const fpath = path.join(ARTICLES_DIR, f);
      const stat  = fs.statSync(fpath);
      const html  = fs.readFileSync(fpath, 'utf-8');
      const { title, desc } = extractMeta(html);
      return {
        slug:     f.replace('.html', ''),
        url:      `${BASE_URL}/artiklar/${f}`,
        title,
        desc,
        mtime:    stat.mtime,
      };
    })
    .filter(a => a.title); // skip if title extraction failed

  if (FORCE || !since) return files.sort((a, b) => b.mtime - a.mtime);

  const sinceDate = new Date(since);
  return files
    .filter(a => a.mtime > sinceDate)
    .sort((a, b) => b.mtime - a.mtime);
}

// ── Email builder ────────────────────────────────────────────────────────────

function buildDigestEmail(articles, unsubEmail) {
  const unsubUrl = `${BASE_URL}/api/newsletter/unsubscribe?email=${encodeURIComponent(unsubEmail)}`;
  const count    = articles.length;
  const subject  = count === 1
    ? `Ny NIS2-guide: ${articles[0].title}`
    : `${count} nya NIS2-guider den här veckan`;

  const articleCards = articles.map(a => `
    <tr>
      <td style="padding:0 0 28px;">
        <a href="${a.url}" style="display:block; text-decoration:none; background:#1c1c1f; border:1px solid #2e2e33; border-left:3px solid #f5c518; border-radius:4px; padding:20px 24px;">
          <p style="margin:0 0 6px; font-size:17px; font-weight:700; color:#f0f0f0; line-height:1.4;">${a.title}</p>
          ${a.desc ? `<p style="margin:0 0 12px; font-size:14px; color:#888; line-height:1.6;">${a.desc}</p>` : ''}
          <span style="font-size:13px; color:#f5c518; font-weight:600;">Läs artikeln →</span>
        </a>
      </td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html lang="sv">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="margin:0;padding:0;background:#141416;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#141416;">
        <tr><td align="center" style="padding:40px 20px;">
          <table width="100%" style="max-width:580px;">

            <!-- Header -->
            <tr><td style="padding:0 0 32px;">
              <a href="${BASE_URL}/nis2.html" style="text-decoration:none;">
                <span style="font-size:22px;font-weight:900;color:#f5c518;font-family:Arial,sans-serif;">NIS2<span style="color:#f0f0f0;">Klar</span></span>
              </a>
            </td></tr>

            <!-- Intro -->
            <tr><td style="padding:0 0 28px;">
              <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#f5c518;">VECKANS NIS2-GUIDER</p>
              <p style="margin:0;font-size:22px;font-weight:700;color:#f0f0f0;line-height:1.3;">
                ${count === 1 ? 'En ny guide är publicerad' : `${count} nya guider publicerade`}
              </p>
              <p style="margin:10px 0 0;font-size:15px;color:#888;line-height:1.6;">
                Konkret NIS2-vägledning för VD:ar och styrelser — utan teknisk jargong.
              </p>
            </td></tr>

            <!-- Article cards -->
            <tr><td>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${articleCards}
              </table>
            </td></tr>

            <!-- CTA -->
            <tr><td style="padding:8px 0 40px;text-align:center;">
              <a href="${BASE_URL}/nis2.html#boka"
                 style="display:inline-block;background:#f5c518;color:#141416;text-decoration:none;padding:14px 32px;border-radius:4px;font-size:15px;font-weight:700;">
                Boka kostnadsfri gap-analys →
              </a>
              <p style="margin:12px 0 0;font-size:12px;color:#555;">
                Böterna är upp till 10 miljoner euro. Gap-analysen är gratis.
              </p>
            </td></tr>

            <!-- Footer -->
            <tr><td style="border-top:1px solid #2e2e33;padding:24px 0 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#555;line-height:1.8;">
                NIS2Klar · M&amp;J Trusted Marketing KB · Växjö<br>
                <a href="${unsubUrl}" style="color:#555;">Avprenumerera</a> ·
                <a href="${BASE_URL}/integritetspolicy.html" style="color:#555;">Integritetspolicy</a> ·
                <a href="${BASE_URL}/artiklar.html" style="color:#555;">Alla guider</a>
              </p>
            </td></tr>

          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;

  return { subject, html };
}

// ── Send one email ────────────────────────────────────────────────────────────

async function sendDigestTo(email, articles) {
  const { subject, html } = buildDigestEmail(articles, email);
  await axios.post('https://api.resend.com/emails', {
    from:    'Jan Malmström <jan@nis2klar.se>',
    to:      [email],
    subject,
    html
  }, { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[digest] Starting ${DRY_RUN ? '(DRY RUN)' : ''} ${FORCE ? '(FORCE)' : ''}`);

  const state    = loadState();
  const articles = getNewArticles(state.last_digest_at);

  if (articles.length === 0) {
    console.log('[digest] No new articles since last digest. Skipping.');
    await db.pool.end();
    return;
  }

  console.log(`[digest] Found ${articles.length} new article(s):`);
  articles.forEach(a => console.log(`  - ${a.title}`));

  // Get active subscribers
  const { rows: subscribers } = await db.query(
    'SELECT email FROM newsletter_subscribers WHERE unsubscribed_at IS NULL ORDER BY subscribed_at'
  );

  console.log(`[digest] Sending to ${subscribers.length} subscriber(s)...`);

  if (DRY_RUN) {
    console.log('[digest] DRY RUN — no emails sent.');
    const { subject } = buildDigestEmail(articles, 'preview@example.com');
    console.log(`[digest] Subject would be: "${subject}"`);
    await db.pool.end();
    return;
  }

  let sent = 0, failed = 0;
  for (const { email } of subscribers) {
    try {
      await sendDigestTo(email, articles);
      console.log(`  ✓ ${email}`);
      sent++;
      // Small delay to avoid Resend rate limits
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error(`  ✗ ${email}: ${err.response?.data?.message || err.message}`);
      failed++;
    }
  }

  // Update state
  saveState({ last_digest_at: new Date().toISOString() });
  console.log(`[digest] Done. Sent: ${sent}, Failed: ${failed}`);

  await db.pool.end();
}

main().catch(err => {
  console.error('[digest] Fatal error:', err.message);
  process.exit(1);
});
