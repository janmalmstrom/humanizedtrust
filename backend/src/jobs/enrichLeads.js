/**
 * Enrichment pipeline — runs every 4 hours
 *
 * Step 0: Website finder   — Serper search (skips if searched within 7 days)
 * Step 1: LinkedIn finder  — Serper X-ray (skips if searched within 7 days)
 * Step 2: Website crawl    — extract email from company website
 * Step 3: SMTP permutation — verify email patterns against MX
 * Step 4: Re-score updated leads
 *
 * Serper budget per run:
 *   Step 0: up to 50 leads × ~1.5 searches = ~75 calls
 *   Step 1: up to 50 leads × 1 search      = ~50 calls
 *   Total:  ~125 calls/run × 6 runs/day    = ~750/day = ~22,500/month
 */
const db = require('../db');
const { computeScore } = require('../engines/scorer');
const { findWebsite } = require('../engines/enrich_website_finder');
const { findLinkedInCompanyUrl } = require('../engines/enrich_linkedin_company');

const BATCH_SIZE = 50;
const WEBSITE_DELAY_MS = 1500;  // 1.5s between Serper website searches
const LINKEDIN_DELAY_MS = 2000; // 2s between Serper LinkedIn searches
const CRAWL_DELAY_MS = 1000;    // 1s between website crawls (no external quota)
const RETRY_DAYS = 7;           // don't retry a failed search for 7 days

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log('[enrich] Starting enrichment pipeline');

  // ── Step 0: Find websites ──────────────────────────────────────────────────
  // Only leads with no website that haven't been searched recently
  const { rows: noWebsite } = await db.query(`
    SELECT id, company_name, city FROM discovery_leads
    WHERE website IS NULL
      AND review_status != 'rejected'
      AND (website_searched_at IS NULL
           OR website_searched_at < NOW() - INTERVAL '${RETRY_DAYS} days')
    ORDER BY score DESC NULLS LAST
    LIMIT $1
  `, [BATCH_SIZE]);

  console.log(`[enrich] Step 0: finding websites for ${noWebsite.length} leads`);
  let websitesFound = 0;

  for (const lead of noWebsite) {
    try {
      // Mark as attempted regardless of result (prevents retry spam)
      await db.query(
        'UPDATE discovery_leads SET website_searched_at=NOW() WHERE id=$1',
        [lead.id]
      );

      const result = await findWebsite(lead.company_name, lead.city);
      if (result?.website) {
        await db.query(
          'UPDATE discovery_leads SET website=$1, updated_at=NOW() WHERE id=$2',
          [result.website, lead.id]
        );
        websitesFound++;
        console.log(`[enrich] website found: ${lead.company_name} → ${result.website}`);
      }
    } catch (e) {
      console.error(`[enrich] website finder error ${lead.id}: ${e.message}`);
    }
    await sleep(WEBSITE_DELAY_MS);
  }

  console.log(`[enrich] Step 0 complete: ${websitesFound}/${noWebsite.length} websites found`);

  // ── Steps 1–3: LinkedIn + email for leads that have a website ──────────────
  const { rows: leads } = await db.query(`
    SELECT * FROM discovery_leads
    WHERE website IS NOT NULL
      AND email IS NULL
      AND review_status != 'rejected'
    ORDER BY score DESC NULLS LAST
    LIMIT $1
  `, [BATCH_SIZE]);

  console.log(`[enrich] Steps 1-3: enriching ${leads.length} leads`);
  let enriched = 0;

  for (const lead of leads) {
    try {
      let updated = false;

      // Step 1: LinkedIn (skip if searched recently)
      const linkedinReady = !lead.linkedin_url && (
        !lead.linkedin_searched_at ||
        new Date(lead.linkedin_searched_at) < new Date(Date.now() - RETRY_DAYS * 86400000)
      );

      if (linkedinReady) {
        try {
          await db.query(
            'UPDATE discovery_leads SET linkedin_searched_at=NOW() WHERE id=$1',
            [lead.id]
          );
          const result = await findLinkedInCompanyUrl(lead);
          if (result?.linkedinUrl) {
            await db.query(
              'UPDATE discovery_leads SET linkedin_url=$1, linkedin_url_source=$2, updated_at=NOW() WHERE id=$3',
              [result.linkedinUrl, result.source, lead.id]
            );
            lead.linkedin_url = result.linkedinUrl;
            updated = true;
          }
        } catch (e) { /* linkedin failed silently */ }
        await sleep(LINKEDIN_DELAY_MS);
      }

      // Step 2: Website crawl for email + phone
      if (!lead.email || !lead.phone) {
        try {
          const { crawlForEmail } = require('../engines/enrich_website_crawl');
          const result = await crawlForEmail(lead.website);
          const sets = [];
          const vals = [];
          if (result?.email && !lead.email) {
            sets.push(`email=$${vals.push(result.email)}, email_source=$${vals.push('crawl')}`);
            lead.email = result.email;
            updated = true;
          }
          if (result?.phone && !lead.phone) {
            sets.push(`phone=$${vals.push(result.phone)}`);
            lead.phone = result.phone;
            updated = true;
          }
          if (sets.length) {
            vals.push(lead.id);
            await db.query(
              `UPDATE discovery_leads SET ${sets.join(', ')}, updated_at=NOW() WHERE id=$${vals.length}`,
              vals
            );
          }
        } catch (e) { console.error(`[enrich] crawl error ${lead.id}: ${e.message}`); }
        await sleep(CRAWL_DELAY_MS);
      }

      // Step 3: SMTP permutation
      if (!lead.email && lead.website) {
        try {
          const { tryPermutations } = require('../engines/enrich_smtp_permutation');
          const domain = new URL(
            lead.website.startsWith('http') ? lead.website : `https://${lead.website}`
          ).hostname;
          const result = await tryPermutations(domain);
          if (result?.email) {
            await db.query(
              'UPDATE discovery_leads SET email=$1, email_source=$2, email_status=$3, updated_at=NOW() WHERE id=$4',
              [result.email, 'smtp_permutation', result.status, lead.id]
            );
            updated = true;
          }
        } catch (e) { /* permutation failed silently */ }
      }

      // Re-score if anything changed
      if (updated) {
        enriched++;
        const { rows } = await db.query('SELECT * FROM discovery_leads WHERE id=$1', [lead.id]);
        const { score, label, breakdown } = computeScore(rows[0]);
        await db.query(
          'UPDATE discovery_leads SET score=$1, score_label=$2, score_breakdown=$3, last_enriched_at=NOW() WHERE id=$4',
          [score, label, JSON.stringify(breakdown), lead.id]
        );
      }

      await sleep(CRAWL_DELAY_MS);
    } catch (err) {
      console.error(`[enrich] Error on lead ${lead.id}: ${err.message}`);
    }
  }

  console.log(`[enrich] Pipeline complete — ${enriched}/${leads.length} leads updated`);
}

module.exports = { run };
