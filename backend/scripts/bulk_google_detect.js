'use strict';
/**
 * bulk_google_detect.js — Detect Google Workspace via MX record lookup
 *
 * Targets leads where tech_stack is NULL or 'other' (not already identified as microsoft365)
 * Sets tech_stack = 'google_workspace' on matches
 *
 * Usage:
 *   node backend/scripts/bulk_google_detect.js [--dry-run] [--limit=500] [--all]
 *
 * MX patterns for Google Workspace:
 *   aspmx.l.google.com        — primary Google MX
 *   alt1.aspmx.l.google.com   — Google alternate
 *   alt2.aspmx.l.google.com   — Google alternate
 *   googlemail.com            — older Google routing
 *   smtp.google.com           — Google SMTP
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const dns     = require('dns').promises;
const db      = require('../src/db');

const DRY_RUN = process.argv.includes('--dry-run');
const ALL     = process.argv.includes('--all');  // scan all leads, not just sweet-spot
const LIMIT   = parseInt((process.argv.find(a => a.startsWith('--limit=')) || '').replace('--limit=', '') || '2000');
const CONCURRENCY = 10;

const GOOGLE_MX_PATTERNS = [
  'aspmx.l.google.com',
  'googlemail.com',
  'smtp.google.com',
  'google.com',
];

async function checkMxDomain(domain) {
  try {
    const records = await dns.resolveMx(domain);
    for (const rec of records) {
      const exchange = (rec.exchange || '').toLowerCase();
      if (GOOGLE_MX_PATTERNS.some(pat => exchange.includes(pat))) return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function isGoogleWorkspace(website, email) {
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
  console.log(`[google-detect] Starting${DRY_RUN ? ' (DRY RUN)' : ''} · limit=${LIMIT} · scope=${ALL ? 'all leads' : 'sweet-spot only'}`);

  // Only scan leads not already confirmed as M365
  const sweetSpotClause = ALL ? '' : `AND num_employees_exact BETWEEN 50 AND 249 AND nis2_registered = true`;

  const { rows: leads } = await db.query(
    `SELECT id, company_name, website, email, tech_stack
     FROM discovery_leads
     WHERE tech_stack IS DISTINCT FROM 'microsoft365'
       ${sweetSpotClause}
       AND (
         (website IS NOT NULL AND website <> '')
         OR
         (email IS NOT NULL AND email LIKE '%@%')
       )
     ORDER BY score DESC NULLS LAST
     LIMIT $1`,
    [LIMIT]
  );

  console.log(`[google-detect] ${leads.length} leads to check`);

  let googleCount = 0;
  let otherCount  = 0;
  let errorCount  = 0;

  for (let i = 0; i < leads.length; i += CONCURRENCY) {
    const batch = leads.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async lead => {
      try {
        const isGoogle = await isGoogleWorkspace(lead.website, lead.email);

        if (isGoogle) {
          googleCount++;
          if (!DRY_RUN) {
            await db.query(
              `UPDATE discovery_leads SET tech_stack = 'google_workspace', ms365_detected_at = NOW() WHERE id = $1`,
              [lead.id]
            );
          }
          console.log(`  ✅ Google WS: ${lead.company_name} (${lead.website || lead.email})`);
        } else {
          otherCount++;
          // Only mark as 'other' if not already identified
          if (!DRY_RUN && !lead.tech_stack) {
            await db.query(
              `UPDATE discovery_leads SET tech_stack = 'other', ms365_detected_at = NOW() WHERE id = $1`,
              [lead.id]
            );
          }
        }
      } catch (err) {
        errorCount++;
        console.error(`  ❌ ${lead.company_name}: ${err.message}`);
      }
    }));

    const done = Math.min(i + CONCURRENCY, leads.length);
    process.stdout.write(`\r  Progress: ${done}/${leads.length}`);
  }

  console.log(`\n[google-detect] Done — Google WS: ${googleCount} · Other: ${otherCount} · Errors: ${errorCount}`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
