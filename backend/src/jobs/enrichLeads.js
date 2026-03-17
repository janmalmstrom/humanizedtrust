/**
 * Nightly enrichment pipeline
 * 1. Website crawl → find email
 * 2. LinkedIn company search (Serper X-ray)
 * 3. Swedish email permutation (firstname.lastname@domain.se)
 * 4. Re-score updated leads
 */
const db = require('../db');
const { computeScore } = require('../engines/scorer');

const BATCH_SIZE = 20;
const DELAY_MS = 2000;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log('[enrich] Starting nightly enrichment pipeline');

  // Get leads that need enrichment (no email, have website)
  const { rows: leads } = await db.query(`
    SELECT * FROM discovery_leads
    WHERE email IS NULL
      AND website IS NOT NULL
      AND review_status != 'rejected'
    ORDER BY score DESC NULLS LAST
    LIMIT $1
  `, [BATCH_SIZE]);

  console.log(`[enrich] Processing ${leads.length} leads`);

  for (const lead of leads) {
    try {
      let updated = false;

      // 1. Website crawl
      if (lead.website && !lead.email) {
        try {
          const { crawlForEmail } = require('../engines/enrich_website_crawl');
          const result = await crawlForEmail(lead.website);
          if (result?.email) {
            await db.query(
              'UPDATE discovery_leads SET email=$1, email_source=$2, updated_at=NOW() WHERE id=$3',
              [result.email, 'crawl', lead.id]
            );
            lead.email = result.email;
            updated = true;
          }
        } catch (e) { /* crawl failed, continue */ }
      }

      // 2. LinkedIn search
      if (!lead.linkedin_url) {
        try {
          const { findLinkedIn } = require('../engines/enrich_linkedin_company');
          const result = await findLinkedIn(lead.company_name, lead.city);
          if (result?.url) {
            await db.query(
              'UPDATE discovery_leads SET linkedin_url=$1, linkedin_url_source=$2, updated_at=NOW() WHERE id=$3',
              [result.url, result.source, lead.id]
            );
            lead.linkedin_url = result.url;
            updated = true;
          }
        } catch (e) { /* linkedin failed */ }
      }

      // 3. Email permutation if we have a domain
      if (!lead.email && lead.website) {
        try {
          const { tryPermutations } = require('../engines/enrich_smtp_permutation');
          const domain = new URL(lead.website.startsWith('http') ? lead.website : `https://${lead.website}`).hostname;
          const result = await tryPermutations(domain, 'jan', 'malmstrom'); // placeholder names
          if (result?.email) {
            await db.query(
              'UPDATE discovery_leads SET email=$1, email_source=$2, email_status=$3, updated_at=NOW() WHERE id=$4',
              [result.email, 'smtp_permutation', result.status, lead.id]
            );
            updated = true;
          }
        } catch (e) { /* permutation failed */ }
      }

      // Re-score if anything changed
      if (updated) {
        const { rows } = await db.query('SELECT * FROM discovery_leads WHERE id=$1', [lead.id]);
        const { score, label, breakdown } = computeScore(rows[0]);
        await db.query(
          'UPDATE discovery_leads SET score=$1, score_label=$2, score_breakdown=$3, last_enriched_at=NOW() WHERE id=$4',
          [score, label, JSON.stringify(breakdown), lead.id]
        );
      }

      await sleep(DELAY_MS);
    } catch (err) {
      console.error(`[enrich] Error on lead ${lead.id}: ${err.message}`);
    }
  }

  console.log(`[enrich] Pipeline complete`);
}

module.exports = { run };
