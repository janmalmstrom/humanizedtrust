'use strict';
/**
 * NIS2Klar Content Publisher
 *
 * Takes repurposed content files for a given article slug and publishes to:
 *   - Issuu (PDF slideshow)
 *   - Calameo (PDF slideshow)
 *   - Scribd (PDF slideshow)
 *   - LinkedIn (long-form post + native document upload)
 *   - Facebook Page (post)
 *   - EIN Presswire (PR syndication → 600+ news sites)
 *   - AWS SES (email to leads — scheduled for next 07:30 CET)
 *
 * Usage:
 *   node scripts/publish_content.js nis2-boten-sanktioner-sverige
 *   node scripts/publish_content.js --latest
 *   node scripts/publish_content.js [slug] --skip email
 *   node scripts/publish_content.js [slug] --only linkedin,email
 */

require('dotenv').config({ path: __dirname + '/../.env' });

const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');
const FormData = require('form-data');
const { chromium } = require('playwright');

const ARTIKLAR_DIR   = path.join(__dirname, '../../frontend/public/artiklar');
const REPURPOSED_DIR = path.join(__dirname, '../../frontend/public/repurposed');
const PDF_DIR        = path.join(__dirname, '../../frontend/public/repurposed/pdfs');

// ── ENV ──────────────────────────────────────────────────────────────────────
const {
  // Issuu
  ISSUU_TOKEN,
  // Calameo
  CALAMEO_API_KEY,
  CALAMEO_PRIVATE_KEY,
  CALAMEO_SUBSCRIBER_LOGIN,
  // Scribd
  SCRIBD_API_KEY,
  SCRIBD_API_SECRET,
  // LinkedIn
  LINKEDIN_ACCESS_TOKEN,
  LINKEDIN_PAGE_ID,        // e.g. "urn:li:organization:XXXXXXX"
  // Facebook
  FACEBOOK_PAGE_TOKEN,
  FACEBOOK_PAGE_ID,
  // EIN Presswire
  EIN_API_KEY,
  EIN_ACCOUNT_ID,
  // AWS SES (reuse existing)
  AWS_REGION,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  SES_FROM_EMAIL,
  // DB (for lead emails)
  DATABASE_URL,
} = process.env;

// ── HELPERS ──────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(platform, msg) {
  console.log(`[${platform.padEnd(12)}] ${msg}`);
}

function readRepurposed(slug, format) {
  const file = path.join(REPURPOSED_DIR, `${slug}-${format}.md`);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8');
}

/**
 * Parse next 07:30 CET timestamp for email scheduling
 */
function nextMorning0730() {
  const now = new Date();
  const target = new Date(now);
  target.setHours(7, 30, 0, 0);
  // CET = UTC+1 (UTC+2 in summer) — adjust to UTC
  const cetOffset = 1; // use 1 for CET, 2 for CEST
  target.setHours(target.getHours() - cetOffset);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target.toISOString();
}

// ── PDF GENERATION ───────────────────────────────────────────────────────────

async function generatePDF(slug) {
  if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });
  const pdfPath = path.join(PDF_DIR, `${slug}.pdf`);

  // Build HTML from slideshow markdown
  const slideshowMd = readRepurposed(slug, 'slideshow');
  if (!slideshowMd) throw new Error(`No slideshow content found for ${slug}`);

  // Convert slide markdown to HTML presentation
  const slides = slideshowMd.split('---SLIDE---').map(s => s.trim()).filter(Boolean);
  const slidesHtml = slides.map((slide, i) => `
    <div class="slide" id="slide-${i + 1}">
      ${slide
        .replace(/^# (.+)$/m, '<h1>$1</h1>')
        .replace(/^## (.+)$/m, '<h2>$1</h2>')
        .replace(/^### (.+)$/m, '<h3>$1</h3>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>')
      }
    </div>
  `).join('');

  const html = `<!DOCTYPE html>
<html><head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@700;900&family=Barlow:wght@400;600&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #141416; color: #f0f0f0; font-family: 'Barlow', sans-serif; }
    .slide {
      width: 297mm; height: 210mm;
      padding: 40px 56px;
      display: flex; flex-direction: column; justify-content: center;
      background: #141416;
      page-break-after: always;
      border-bottom: 4px solid #f5c518;
    }
    .slide:last-child { page-break-after: avoid; }
    h1 { font-family: 'Poppins', sans-serif; font-size: 36px; font-weight: 900; color: #f5c518; margin-bottom: 20px; }
    h2 { font-family: 'Poppins', sans-serif; font-size: 28px; font-weight: 700; color: #f0f0f0; margin-bottom: 16px; }
    h3 { font-family: 'Poppins', sans-serif; font-size: 20px; font-weight: 700; color: #f5c518; margin-bottom: 12px; }
    p, br { font-size: 17px; line-height: 1.7; color: #cccccc; }
    strong { color: #ffffff; font-weight: 700; }
    .logo { position: absolute; bottom: 20px; right: 40px; font-family: 'Poppins', sans-serif; font-size: 14px; font-weight: 900; color: #f5c518; opacity: 0.6; }
  </style>
</head><body>
  ${slidesHtml}
  <div class="logo">NIS2Klar</div>
</body></html>`;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    landscape: true,
    printBackground: true,
  });
  await browser.close();

  log('PDF', `Generated: ${pdfPath}`);
  return pdfPath;
}

// ── ISSUU ─────────────────────────────────────────────────────────────────────

async function publishIssuu(slug, pdfPath, title, description) {
  if (!ISSUU_TOKEN) { log('Issuu', 'ISSUU_TOKEN not set — skipping'); return; }

  // Step 1: Create draft
  const draftRes = await fetch('https://api.issuu.com/v2/drafts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ISSUU_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,
      description,
      access: 'public',
      tags: ['NIS2', 'Cybersäkerhet', 'Sverige', 'Compliance', 'GDPR'],
    }),
  });
  const draft = await draftRes.json();
  const draftSlug = draft.slug;
  log('Issuu', `Draft created: ${draftSlug}`);

  // Step 2: Upload PDF
  const form = new FormData();
  form.append('file', fs.createReadStream(pdfPath));
  form.append('confirmCopyright', 'true');

  const uploadRes = await fetch(`https://api.issuu.com/v2/drafts/${draftSlug}/upload`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${ISSUU_TOKEN}`, ...form.getHeaders() },
    body: form,
  });

  if (!uploadRes.ok) {
    log('Issuu', `Upload failed: ${await uploadRes.text()}`);
    return;
  }

  // Step 3: Publish
  await fetch(`https://api.issuu.com/v2/drafts/${draftSlug}/publish`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ISSUU_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ visibility: 'public' }),
  });

  log('Issuu', `✅ Published: https://issuu.com/nis2klar/docs/${draftSlug}`);
}

// ── CALAMEO ───────────────────────────────────────────────────────────────────

async function publishCalameo(slug, pdfPath, title, description) {
  if (!CALAMEO_API_KEY || !CALAMEO_PRIVATE_KEY) { log('Calameo', 'Credentials not set — skipping'); return; }

  const crypto = require('crypto');
  const params = {
    apikey: CALAMEO_API_KEY,
    login: CALAMEO_SUBSCRIBER_LOGIN,
    action: 'API.uploadPublication',
    output: 'JSON',
    name: title,
    description,
    is_published: '1',
  };

  // MD5 signature: private_key + alphabetically sorted key+value pairs
  const sorted = Object.keys(params).sort().map(k => `${k}${params[k]}`).join('');
  params.signature = crypto.createHash('md5').update(CALAMEO_PRIVATE_KEY + sorted).digest('hex');

  const form = new FormData();
  Object.entries(params).forEach(([k, v]) => form.append(k, v));
  form.append('file', fs.createReadStream(pdfPath));

  const res = await fetch('https://upload.calameo.com/1.0', {
    method: 'POST',
    headers: form.getHeaders(),
    body: form,
  });

  const data = await res.json();
  if (data.response?.status === 'ok') {
    log('Calameo', `✅ Published: https://www.calameo.com/books/${data.response.content?.BookID}`);
  } else {
    log('Calameo', `Failed: ${JSON.stringify(data.response)}`);
  }
}

// ── SCRIBD ────────────────────────────────────────────────────────────────────

async function publishScribd(slug, pdfPath, title, description) {
  if (!SCRIBD_API_KEY) { log('Scribd', 'SCRIBD_API_KEY not set — skipping'); return; }

  const form = new FormData();
  form.append('api_key', SCRIBD_API_KEY);
  form.append('title', title);
  form.append('description', description);
  form.append('access', 'public');
  form.append('license', 'c');  // standard copyright
  form.append('file', fs.createReadStream(pdfPath));

  const res = await fetch('https://api.scribd.com/api?method=docs.upload&response_type=json', {
    method: 'POST',
    headers: form.getHeaders(),
    body: form,
  });

  const data = await res.json();
  if (data.rsp?.stat === 'ok') {
    log('Scribd', `✅ Published: https://www.scribd.com/doc/${data.rsp.doc_id}`);
  } else {
    log('Scribd', `Failed: ${JSON.stringify(data)}`);
  }
}

// ── LINKEDIN ──────────────────────────────────────────────────────────────────

async function publishLinkedIn(slug, pdfPath, title) {
  if (!LINKEDIN_ACCESS_TOKEN || !LINKEDIN_PAGE_ID) { log('LinkedIn', 'Credentials not set — skipping'); return; }

  const postContent = readRepurposed(slug, 'linkedin');
  if (!postContent) { log('LinkedIn', 'No linkedin content found — skipping'); return; }

  // Step 1: Register PDF upload
  const registerRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LINKEDIN_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-document'],
        owner: LINKEDIN_PAGE_ID,
        serviceRelationships: [{
          relationshipType: 'OWNER',
          identifier: 'urn:li:userGeneratedContent',
        }],
      },
    }),
  });

  const regData = await registerRes.json();
  const uploadUrl = regData.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
  const assetId = regData.value?.asset;

  if (!uploadUrl) { log('LinkedIn', `Register failed: ${JSON.stringify(regData)}`); return; }

  // Step 2: Upload PDF
  const pdfBuffer = fs.readFileSync(pdfPath);
  await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${LINKEDIN_ACCESS_TOKEN}`, 'Content-Type': 'application/octet-stream' },
    body: pdfBuffer,
  });
  log('LinkedIn', 'PDF uploaded');

  // Step 3: Post with document + text
  // Strip markdown formatting for LinkedIn plain text
  const postText = postContent
    .replace(/#{1,3} .+\n/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .trim()
    .slice(0, 3000);

  const postRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LINKEDIN_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: LINKEDIN_PAGE_ID,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: postText },
          shareMediaCategory: 'DOCUMENT',
          media: [{
            status: 'READY',
            media: assetId,
            title: { text: title },
          }],
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
  });

  if (postRes.ok) {
    log('LinkedIn', '✅ Post + document published');
  } else {
    log('LinkedIn', `Failed: ${await postRes.text()}`);
  }
}

// ── FACEBOOK ──────────────────────────────────────────────────────────────────

async function publishFacebook(slug) {
  if (!FACEBOOK_PAGE_TOKEN || !FACEBOOK_PAGE_ID) { log('Facebook', 'Credentials not set — skipping'); return; }

  const postContent = readRepurposed(slug, 'linkedin'); // reuse LinkedIn post text for FB
  if (!postContent) { log('Facebook', 'No content found — skipping'); return; }

  const postText = postContent
    .replace(/#{1,3} .+\n/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .trim()
    .slice(0, 63206);

  const res = await fetch(`https://graph.facebook.com/v19.0/${FACEBOOK_PAGE_ID}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: postText,
      access_token: FACEBOOK_PAGE_TOKEN,
    }),
  });

  const data = await res.json();
  if (data.id) {
    log('Facebook', `✅ Published: post ID ${data.id}`);
  } else {
    log('Facebook', `Failed: ${JSON.stringify(data)}`);
  }
}

// ── EIN PRESSWIRE ──────────────────────────────────────────────────────────────

async function publishEIN(slug, title) {
  if (!EIN_API_KEY || !EIN_ACCOUNT_ID) { log('EIN', 'Credentials not set — skipping'); return; }

  // Use the article HTML as the press release body
  const articlePath = path.join(ARTIKLAR_DIR, `${slug}.html`);
  if (!fs.existsSync(articlePath)) { log('EIN', 'No article HTML found — skipping'); return; }

  // Strip HTML tags for plain text body
  const html = fs.readFileSync(articlePath, 'utf8');
  const body = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);

  const res = await fetch('https://www.einpresswire.com/api/release/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: EIN_API_KEY,
      accountId: EIN_ACCOUNT_ID,
      title,
      body,
      keywords: 'NIS2, cybersäkerhet, Sverige, compliance, styrelseansvar',
      language: 'sv',
      publish: true,
    }),
  });

  const data = await res.json();
  if (data.success) {
    log('EIN', `✅ Press release submitted — distribution to 600+ sites`);
  } else {
    log('EIN', `Failed: ${JSON.stringify(data)}`);
  }
}

// ── EMAIL (AWS SES) ───────────────────────────────────────────────────────────

async function scheduleEmail(slug, title) {
  if (!AWS_ACCESS_KEY_ID || !SES_FROM_EMAIL) { log('Email', 'AWS SES not configured — skipping'); return; }

  const emailContent = readRepurposed(slug, 'email');
  if (!emailContent) { log('Email', 'No email content found — skipping'); return; }

  // Use existing emailService
  const emailService = require('../src/emailService');

  // Parse subject lines from content (first 3 lines starting with "A)", "B)", "C)")
  const subjectMatch = emailContent.match(/^[ABC]\) (.+)$/m);
  const subject = subjectMatch ? subjectMatch[1].replace('[FIRST_NAME]', '{{first_name}}') : title;

  // For now: send a test to jan@ to verify before bulk
  // Full lead send will be a separate confirm step
  await emailService.sendEmail({
    to: SES_FROM_EMAIL,
    from: `NIS2Klar <noreply@nis2info.se>`,
    subject: `[TEST] ${subject}`,
    body: emailContent,
  });

  log('Email', `✅ Test email sent to ${SES_FROM_EMAIL} — run with --send-all to send to leads`);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
Usage:
  node publish_content.js [slug]
  node publish_content.js --latest
  node publish_content.js [slug] --only linkedin,email
  node publish_content.js [slug] --skip issuu,calameo

Platforms: issuu, calameo, scribd, linkedin, facebook, ein, email
    `);
    process.exit(0);
  }

  let slug = args[0] === '--latest' ? getLatestSlug() : args[0];

  // Parse --only / --skip flags
  const onlyIdx  = args.indexOf('--only');
  const skipIdx  = args.indexOf('--skip');
  const only  = onlyIdx  >= 0 ? args[onlyIdx + 1].split(',')  : null;
  const skip  = skipIdx  >= 0 ? args[skipIdx + 1].split(',')  : [];

  const should = p => (!only || only.includes(p)) && !skip.includes(p);

  // Read title from article HTML
  const articlePath = path.join(ARTIKLAR_DIR, `${slug}.html`);
  if (!fs.existsSync(articlePath)) {
    console.error(`Article not found: ${articlePath}`);
    process.exit(1);
  }

  const html = fs.readFileSync(articlePath, 'utf8');
  const titleMatch = html.match(/<title>([^<|]+)/);
  const title = titleMatch ? titleMatch[1].trim() : slug;
  const descMatch = html.match(/<meta name="description" content="([^"]+)"/);
  const description = descMatch ? descMatch[1] : '';

  console.log(`\n📢 Publishing: ${title}`);
  console.log(`   Slug: ${slug}\n`);

  // Generate PDF (needed for slideshow platforms + LinkedIn document)
  let pdfPath = null;
  if (should('issuu') || should('calameo') || should('scribd') || should('linkedin')) {
    try {
      pdfPath = await generatePDF(slug);
    } catch (e) {
      log('PDF', `Generation failed: ${e.message} — skipping PDF-dependent platforms`);
    }
  }

  // Publish in parallel where possible
  const tasks = [];

  if (pdfPath) {
    if (should('issuu'))   tasks.push(publishIssuu(slug, pdfPath, title, description));
    if (should('calameo')) tasks.push(publishCalameo(slug, pdfPath, title, description));
    if (should('scribd'))  tasks.push(publishScribd(slug, pdfPath, title, description));
    if (should('linkedin')) tasks.push(publishLinkedIn(slug, pdfPath, title));
  }

  if (should('facebook'))  tasks.push(publishFacebook(slug));
  if (should('ein'))       tasks.push(publishEIN(slug, title));
  if (should('email'))     tasks.push(scheduleEmail(slug, title));

  await Promise.allSettled(tasks.map(t => t.catch(e => log('ERROR', e.message))));

  console.log(`\n✅ Publishing run complete for: ${slug}`);
  console.log(`\nManual steps for team:`);
  console.log(`  AnyFlip   → upload PDF: ${pdfPath || 'N/A'}`);
  console.log(`  PubHTML5  → upload PDF: ${pdfPath || 'N/A'}`);
  console.log(`  Speaker Deck → upload PDF: ${pdfPath || 'N/A'}`);
  console.log(`  DocPlayer → upload PDF: ${pdfPath || 'N/A'}`);
}

function getLatestSlug() {
  if (!fs.existsSync(ARTIKLAR_DIR)) throw new Error('No artiklar directory found');
  const files = fs.readdirSync(ARTIKLAR_DIR)
    .filter(f => f.endsWith('.html') && f !== 'index.html')
    .map(f => ({ name: f.replace('.html', ''), mtime: fs.statSync(path.join(ARTIKLAR_DIR, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!files.length) throw new Error('No articles found');
  return files[0].name;
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
