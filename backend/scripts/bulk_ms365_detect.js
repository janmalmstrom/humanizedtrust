'use strict';
/**
 * bulk_ms365_detect.js — Detect Microsoft 365 via MX record lookup
 *
 * Targets only sweet-spot leads: 50–249 employees AND nis2_registered = true
 * Sets tech_stack = 'microsoft365' on matches, 'other' on non-matches
 *
 * Usage:
 *   node backend/scripts/bulk_ms365_detect.js [--dry-run] [--limit=500]
 *
 * MX patterns for M365:
 *   *.mail.protection.outlook.com  — Exchange Online / M365
 *   *.onmicrosoft.com              — older M365 routing
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const dns     = require('dns').promises;
const db      = require('../src/db');

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT   = parseInt((process.argv.find(a => a.startsWith('--limit=')) || '').replace('--limit=', '') || '2100');
const CONCURRENCY = 10;  // parallel DNS lookups

const MS365_MX_PATTERNS = [
  'mail.protection.outlook.com',
  'onmicrosoft.com',
  'smtp.microsoft.com',
];

async function checkMxDomain(domain) {
  try {
    const records = await dns.resolveMx(domain);
    for (const rec of records) {
      const exchange = (rec.exchange || '').toLowerCase();
      if (MS365_MX_PATTERNS.some(pat => exchange.includes(pat))) return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function isMicrosoft365(website, email) {
  // Try website domain first, then email domain as fallback
  const domains = [];

  if (website) {
    try {
      const url = website.startsWith('http') ? website : `https://${website}`;
      const hostname = new URL(url).hostname.replace(/^www\./, '');
      domains.push(hostname);
    } catch {}
  }

  if (email) {
    const emailDomain = email.split('@')[1];
    if (emailDomain && !domains.includes(emailDomain)) {
      domains.push(emailDomain);
    }
  }

  for (const domain of domains) {
    if (await checkMxDomain(domain)) return true;
  }
  return false;
}

async function run() {
  console.log(`[ms365-detect] Starting${DRY_RUN ? ' (DRY RUN)' : ''} · limit=${LIMIT}`);

  const { rows: leads } = await db.query(
    `SELECT id, company_name, website, email
     FROM discovery_leads
     WHERE nis2_registered = true
       AND num_employees_exact BETWEEN 50 AND 249
       AND (
         (website IS NOT NULL AND website <> '')
         OR
         (email IS NOT NULL AND email LIKE '%@%')
       )
       AND (ms365_detected_at IS NULL OR ms365_detected_at < NOW() - INTERVAL '30 days')
     ORDER BY score DESC NULLS LAST
     LIMIT $1`,
    [LIMIT]
  );

  console.log(`[ms365-detect] ${leads.length} sweet-spot leads to check`);

  let ms365Count = 0;
  let otherCount = 0;
  let errorCount = 0;

  // Process in batches of CONCURRENCY
  for (let i = 0; i < leads.length; i += CONCURRENCY) {
    const batch = leads.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async lead => {
      try {
        const isM365 = await isMicrosoft365(lead.website, lead.email);
        const stack  = isM365 ? 'microsoft365' : 'other';

        if (isM365) ms365Count++;
        else otherCount++;

        if (!DRY_RUN) {
          await db.query(
            `UPDATE discovery_leads SET tech_stack = $1, ms365_detected_at = NOW() WHERE id = $2`,
            [stack, lead.id]
          );
        }

        if (isM365) {
          console.log(`  ✅ M365: ${lead.company_name} (${lead.website})`);
        }
      } catch (err) {
        errorCount++;
        console.error(`  ❌ ${lead.company_name}: ${err.message}`);
      }
    }));

    const done = Math.min(i + CONCURRENCY, leads.length);
    process.stdout.write(`\r  Progress: ${done}/${leads.length}`);
  }

  console.log(`\n[ms365-detect] Done — M365: ${ms365Count} · Other: ${otherCount} · Errors: ${errorCount}`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
