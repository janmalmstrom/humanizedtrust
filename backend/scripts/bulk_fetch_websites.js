'use strict';
/**
 * bulk_fetch_websites.js — Derive + validate company website from company name
 *
 * Strategy:
 *   1. Generate domain candidates from company name (companyname.se)
 *   2. Validate via DNS A-record lookup (does the domain actually exist?)
 *   3. If valid, store as website + immediately check MX for Microsoft 365
 *   4. Sets tech_stack = 'microsoft365' | 'other' on discovery
 *
 * Targets: sweet-spot leads (nis2_registered + 50-249 emp) without website or email
 *
 * Usage:
 *   node backend/scripts/bulk_fetch_websites.js [--dry-run] [--limit=500]
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const dns  = require('dns').promises;
const db   = require('../src/db');

const DRY_RUN     = process.argv.includes('--dry-run');
const LIMIT       = parseInt((process.argv.find(a => a.startsWith('--limit=')) || '').replace('--limit=', '') || '2000');
const CONCURRENCY = 15;

// Legal suffixes to strip from Swedish company names
const STRIP_SUFFIX = /\b(aktiebolag|ab|kb|hb|ef|ek\s*för|ekonomisk\s+f[oö]rening|handelsbolag|kommanditbolag|stiftelse|f[oö]rening|ideell)\b/gi;
// Common filler words
const STRIP_WORDS  = /\b(i|och|av|f[oö]r|the|of|and|nordic|sweden|svenska|swedish|sverige|group|gruppen|holding|invest|konsult)\b/gi;

const MS365_PATTERNS = ['mail.protection.outlook.com', 'onmicrosoft.com', 'smtp.microsoft.com'];

function sweChar(s) {
  return s.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/å/g, 'a')
          .replace(/é/g, 'e').replace(/ü/g, 'u').replace(/ñ/g, 'n');
}

function generateCandidates(companyName) {
  const base = sweChar(companyName.toLowerCase());
  const candidates = new Set();

  // Version 1: strip suffix + filler + all non-alnum → compact
  const compact = base
    .replace(STRIP_SUFFIX, ' ')
    .replace(STRIP_WORDS, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim().replace(/\s+/g, '');
  if (compact.length >= 3 && compact.length <= 40) candidates.add(`${compact}.se`);

  // Version 2: strip suffix + filler, join with hyphens
  const hyphenated = base
    .replace(STRIP_SUFFIX, ' ')
    .replace(STRIP_WORDS, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim().replace(/\s+/g, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (hyphenated.length >= 3 && hyphenated !== compact) candidates.add(`${hyphenated}.se`);

  // Version 3: first word only (often brand name)
  const firstWord = compact.split(/[^a-z0-9]/)[0];
  if (firstWord && firstWord.length >= 4 && firstWord !== compact) candidates.add(`${firstWord}.se`);

  return [...candidates];
}

async function dnsResolvesSafe(domain) {
  try {
    await dns.resolve4(domain);
    return true;
  } catch {
    try {
      await dns.resolve6(domain);
      return true;
    } catch {
      return false;
    }
  }
}

async function checkMs365(domain) {
  try {
    const records = await dns.resolveMx(domain);
    for (const rec of records) {
      const ex = (rec.exchange || '').toLowerCase();
      if (MS365_PATTERNS.some(p => ex.includes(p))) return true;
    }
  } catch {}
  return false;
}

async function findWebsite(companyName) {
  const candidates = generateCandidates(companyName);
  for (const domain of candidates) {
    if (await dnsResolvesSafe(domain)) {
      return domain;
    }
  }
  return null;
}

async function run() {
  console.log(`[fetch-websites] Starting${DRY_RUN ? ' (DRY RUN)' : ''} · limit=${LIMIT}`);

  const { rows: leads } = await db.query(
    `SELECT id, company_name, org_nr
     FROM discovery_leads
     WHERE nis2_registered = true
       AND num_employees_exact BETWEEN 50 AND 249
       AND (website IS NULL OR website = '')
       AND (email IS NULL OR email = '')
     ORDER BY score DESC NULLS LAST
     LIMIT $1`,
    [LIMIT]
  );

  console.log(`[fetch-websites] ${leads.length} leads to check`);

  let found = 0, ms365 = 0, notFound = 0;

  for (let i = 0; i < leads.length; i += CONCURRENCY) {
    const batch = leads.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async lead => {
      const website = await findWebsite(lead.company_name);

      if (website) {
        found++;
        const isM365 = await checkMs365(website);
        if (isM365) ms365++;

        console.log(`  ✅ ${lead.company_name} → ${website}${isM365 ? ' [M365]' : ''}`);

        if (!DRY_RUN) {
          await db.query(
            `UPDATE discovery_leads
             SET website = $1, tech_stack = $2, ms365_detected_at = NOW()
             WHERE id = $3`,
            [`https://${website}`, isM365 ? 'microsoft365' : 'other', lead.id]
          );
        }
      } else {
        notFound++;
      }
    }));

    const done = Math.min(i + CONCURRENCY, leads.length);
    process.stdout.write(`\r  Progress: ${done}/${leads.length} · found: ${found} · M365: ${ms365}`);
  }

  console.log(`\n[fetch-websites] Done — websites found: ${found} · M365: ${ms365} · no domain: ${notFound}`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
