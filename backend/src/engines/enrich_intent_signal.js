'use strict';
/**
 * Intent Signal Engine — Job Posting Detection
 *
 * Queries the Swedish government JobTech API (no auth needed) for security-related
 * job postings at companies that already exist in discovery_leads.
 *
 * When a company is hiring for NIS2/security roles it signals:
 *   - Active security initiative underway
 *   - Budget allocated (they're paying salary)
 *   - Board has approved it (personal NIS2 liability now top of mind)
 *
 * Score boost: +20 pts → pushes companies toward Hot threshold faster
 *
 * JobTech API docs: https://jobsearch.api.jobtechdev.se/
 * No auth required. Swedish government open data.
 */

const https = require('https');

const JOBTECH_BASE = 'https://jobsearch.api.jobtechdev.se';

// NIS2 / cybersecurity hiring signals
const SEARCH_QUERIES = [
  'CISO',
  'IT-säkerhetschef',
  'Informationssäkerhetschef',
  'säkerhetsansvarig',
  'NIS2',
  'ISO 27001',
  'Dataskydd',
  'Compliance IT',
  'Cybersäkerhet',
  'Informationssäkerhet',
];

const SIGNAL_TYPE = 'hiring_security';
const SCORE_BOOST  = 20;

/**
 * Fetch job ads for a given query term.
 * Returns array of { org_nr, employer_name, headline, published_at }
 */
async function fetchJobs(query) {
  return new Promise((resolve, reject) => {
    const url = `${JOBTECH_BASE}/search?q=${encodeURIComponent(query)}&limit=100&offset=0`;

    https.get(url, {
      headers: { 'Accept': 'application/json' }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            return resolve([]);
          }
          const data = JSON.parse(body);
          const hits = data.hits || [];
          const results = [];
          for (const hit of hits) {
            const orgNr = hit.employer?.organization_number;
            if (!orgNr) continue;
            // Normalize to Swedish org_nr format: nnnnnn-nnnn
            const digits = orgNr.replace(/\D/g, '');
            if (digits.length < 10) continue;
            const normalized = digits.length === 10
              ? `${digits.slice(0, 6)}-${digits.slice(6)}`
              : digits; // leave as-is if unexpected length
            results.push({
              org_nr:        normalized,
              employer_name: hit.employer?.name || '',
              headline:      hit.headline || '',
              published_at:  hit.publication_date || null,
            });
          }
          resolve(results);
        } catch (e) {
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });
}

/**
 * Run intent signal enrichment.
 *
 * @param {object} db  — pg pool (from ../db)
 * @returns {{ signalsFound: number, leadsUpdated: number }}
 */
async function enrichIntentSignals(db) {
  // Collect all matching jobs across all queries
  const signalMap = new Map(); // org_nr → { headlines[], employer_name, published_at }

  for (const query of SEARCH_QUERIES) {
    let jobs;
    try {
      jobs = await fetchJobs(query);
    } catch (e) {
      console.error(`[intent] JobTech error for "${query}": ${e.message}`);
      continue;
    }

    for (const job of jobs) {
      const existing = signalMap.get(job.org_nr);
      if (existing) {
        if (!existing.headlines.includes(job.headline)) {
          existing.headlines.push(job.headline);
        }
        // Keep most recent published_at
        if (job.published_at > (existing.published_at || '')) {
          existing.published_at = job.published_at;
          existing.employer_name = job.employer_name;
        }
      } else {
        signalMap.set(job.org_nr, {
          employer_name: job.employer_name,
          headlines:     [job.headline],
          published_at:  job.published_at,
        });
      }
    }
  }

  if (signalMap.size === 0) {
    return { signalsFound: 0, leadsUpdated: 0 };
  }

  // Match against discovery_leads by org_nr
  const orgNrs = Array.from(signalMap.keys());

  // Fetch leads that match any of these org_nrs
  const { rows: leads } = await db.query(`
    SELECT id, org_nr, score, intent_signal
    FROM discovery_leads
    WHERE org_nr = ANY($1::text[])
      AND review_status != 'rejected'
  `, [orgNrs]);

  let leadsUpdated = 0;

  for (const lead of leads) {
    const signal = signalMap.get(lead.org_nr);
    if (!signal) continue;

    const detail = {
      query_matched: SEARCH_QUERIES.filter(q =>
        signal.headlines.some(h => h.toLowerCase().includes(q.toLowerCase()))
      ),
      job_titles:    signal.headlines.slice(0, 5),
      employer_name: signal.employer_name,
      published_at:  signal.published_at,
      detected_at:   new Date().toISOString(),
    };

    // Only update if not already flagged (avoid duplicate score boosts)
    const alreadyFlagged = lead.intent_signal === SIGNAL_TYPE;
    const newScore = alreadyFlagged ? lead.score : (lead.score || 0) + SCORE_BOOST;

    await db.query(`
      UPDATE discovery_leads
      SET intent_signal        = $1,
          intent_signal_at     = NOW(),
          intent_signal_detail = $2,
          score                = $3,
          updated_at           = NOW()
      WHERE id = $4
    `, [SIGNAL_TYPE, JSON.stringify(detail), newScore, lead.id]);

    leadsUpdated++;
  }

  return { signalsFound: signalMap.size, leadsUpdated };
}

module.exports = { enrichIntentSignals };
