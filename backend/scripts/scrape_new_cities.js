#!/usr/bin/env node
/**
 * Option 2: Scrape new US cities for ketamine_therapy via TrustLeads Google Maps pipeline
 * Option 3: Expand to adjacent niches
 *
 * The TrustLeads pipeline endpoint is SYNCHRONOUS — one city at a time, waits for completion.
 * Each city can take 2-10 minutes (Apify + crawl + verify).
 *
 * Run: node scripts/scrape_new_cities.js
 */

const http = require('http');
const jwt = require('jsonwebtoken');

const TL_JWT_SECRET = 'tl_jwt_8Kx2mNqR7vBw4pZe9yAsDfGhJkLcUiOp';
const TL_JWT = jwt.sign({ id: 1, role: 'admin', email: 'jan@simaroa.com' }, TL_JWT_SECRET, { expiresIn: '1d' });

// Results log written to disk
const fs = require('fs');
const LOG_FILE = '/tmp/scrape_new_cities.log';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function post(body, timeoutMs = 600000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: 'localhost',
      port: 3003,
      path: '/api/discovery/run-google-maps-pipeline',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': `Bearer ${TL_JWT}`,
      },
    };

    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch (e) { resolve({ status: res.statusCode, body: raw }); }
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Request timed out'));
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Parse "Seattle, WA" → { city: "Seattle", state: "WA" }
function parseLocation(str) {
  const parts = str.split(',').map(s => s.trim());
  return { city: parts[0], state: parts[1] || null };
}

async function scrapeCity(cityStr, searchTerms, niche, maxResults = 40) {
  const { city, state } = parseLocation(cityStr);
  log(`Scraping: ${city}, ${state} | niche=${niche} | terms=${searchTerms.length}`);

  try {
    const res = await post({
      searchTerms,
      location: cityStr,   // Actor needs "Seattle, WA" as single location string
      city,
      state,
      country: 'United States',
      maxResults,
      websiteOnly: true,
      skipClosed: true,
    });

    if (res.status !== 200) {
      log(`FAIL HTTP ${res.status}: ${JSON.stringify(res.body).slice(0, 200)}`);
      return { city: cityStr, niche, success: false, error: `HTTP ${res.status}` };
    }

    const { success, data, error } = res.body;
    if (!success) {
      log(`FAIL: ${error}`);
      return { city: cityStr, niche, success: false, error };
    }

    const count = data?.approved || data?.processed || data?.total || JSON.stringify(data).slice(0, 100);
    log(`OK: ${city}, ${state} → ${JSON.stringify(count)}`);
    return { city: cityStr, niche, success: true, data };

  } catch (err) {
    log(`ERROR: ${city}, ${state} → ${err.message}`);
    return { city: cityStr, niche, success: false, error: err.message };
  }
}

// ── Option 2: New ketamine cities ─────────────────────────────────────────────
const KETAMINE_TERMS = [
  'ketamine therapy clinic',
  'ketamine infusion center',
  'IV ketamine treatment',
];

const NEW_KETAMINE_CITIES = [
  'Seattle, WA',
  'Portland, OR',
  'Minneapolis, MN',
  'Kansas City, MO',
  'Nashville, TN',
  'Indianapolis, IN',
  'Columbus, OH',
  'Oklahoma City, OK',
  'Louisville, KY',
  'Milwaukee, WI',
  'Albuquerque, NM',
  'Tucson, AZ',
  'El Paso, TX',
  'Raleigh, NC',
  'Richmond, VA',
  'Hartford, CT',
  'Providence, RI',
  'Buffalo, NY',
  'Rochester, NY',
  'Boise, ID',
  'Spokane, WA',
  'Omaha, NE',
  'Des Moines, IA',
  'Little Rock, AR',
  'Jackson, MS',
];

// ── Option 3: Adjacent niches ─────────────────────────────────────────────────
const ADJACENT_NICHES = [
  {
    niche: 'tms_therapy',
    label: 'TMS Therapy',
    terms: ['TMS therapy clinic', 'transcranial magnetic stimulation clinic', 'TMS depression treatment'],
    cities: [
      'New York, NY', 'Los Angeles, CA', 'Chicago, IL', 'Houston, TX', 'Phoenix, AZ',
      'Philadelphia, PA', 'San Antonio, TX', 'San Diego, CA', 'Dallas, TX', 'San Jose, CA',
      'Austin, TX', 'Jacksonville, FL', 'Fort Worth, TX', 'Columbus, OH', 'Charlotte, NC',
      'Seattle, WA', 'Denver, CO', 'Nashville, TN', 'Portland, OR', 'Las Vegas, NV',
    ],
  },
  {
    niche: 'iv_therapy',
    label: 'IV Therapy / NAD+',
    terms: ['IV therapy clinic', 'NAD+ infusion clinic', 'IV hydration center', 'IV vitamin drip'],
    cities: [
      'Miami, FL', 'Los Angeles, CA', 'Las Vegas, NV', 'New York, NY', 'Chicago, IL',
      'Dallas, TX', 'Houston, TX', 'Phoenix, AZ', 'Austin, TX', 'San Diego, CA',
      'Denver, CO', 'Atlanta, GA', 'Orlando, FL', 'Tampa, FL', 'Nashville, TN',
      'Charlotte, NC', 'Seattle, WA', 'Portland, OR', 'San Francisco, CA', 'Boston, MA',
    ],
  },
  {
    niche: 'psychedelic_therapy',
    label: 'Psychedelic / Psilocybin Therapy',
    terms: ['psilocybin therapy clinic', 'psychedelic therapy center', 'plant medicine clinic'],
    cities: [
      'Denver, CO', 'Portland, OR', 'Seattle, WA', 'San Francisco, CA', 'Los Angeles, CA',
      'Austin, TX', 'Boulder, CO', 'Asheville, NC', 'Santa Fe, NM', 'Burlington, VT',
    ],
  },
];

async function main() {
  fs.writeFileSync(LOG_FILE, ''); // reset log
  log('=== Simaroa Media Lead Scrape — Option 2 + 3 ===');

  const summary = [];

  // ── OPTION 2 ──────────────────────────────────────────────────────────────
  log('\n━━━ OPTION 2: Ketamine — New Cities ━━━');
  for (const cityStr of NEW_KETAMINE_CITIES) {
    const result = await scrapeCity(cityStr, KETAMINE_TERMS, 'ketamine_therapy', 40);
    summary.push(result);
  }

  // ── OPTION 3 ──────────────────────────────────────────────────────────────
  log('\n━━━ OPTION 3: Adjacent Niches ━━━');
  for (const nicheConfig of ADJACENT_NICHES) {
    log(`\n— Niche: ${nicheConfig.label} —`);
    for (const cityStr of nicheConfig.cities) {
      const result = await scrapeCity(cityStr, nicheConfig.terms, nicheConfig.niche, 40);
      summary.push(result);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const ok = summary.filter(r => r.success).length;
  const fail = summary.filter(r => !r.success).length;
  log(`\n=== Done === OK: ${ok} / ${summary.length} | Failed: ${fail}`);
  if (fail > 0) {
    log('Failed cities:');
    summary.filter(r => !r.success).forEach(r => log(`  ${r.city} [${r.niche}]: ${r.error}`));
  }
  log('Next step: node scripts/import_ketamine_leads.js');
}

main().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
