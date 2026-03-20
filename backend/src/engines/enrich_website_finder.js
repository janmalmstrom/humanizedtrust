'use strict';
/**
 * Website Finder Engine
 *
 * Finds the company website using Brave Search API (primary).
 * Falls back to Serper if BRAVE_API_KEY is not set.
 */

const BLOCKLIST = [
  'allabolag.se', 'linkedin.com', 'facebook.com', 'instagram.com',
  'twitter.com', 'x.com', 'youtube.com', 'google.com', 'bing.com',
  'ratsit.se', 'hitta.se', 'eniro.se', 'proff.se', 'bloomberg.com',
  'wikipedia.org', 'wikidata.org', 'uc.se', 'kreditinfo.se',
  'bolagsverket.se', 'brreg.no', 'bisnode.com', 'merinfo.se',
  'foretagsfakta.se', 'creditsafe.com', 'dnb.com', 'dun.com',
  'truecaller.com', '118700.se', 'gulasidorna.se',
  'bolagsfakta.se', 'bokadirekt.se', 'foretagsinfo.se', 'foretaget.se',
  'allakando.se', 'birthday.se', 'foretagsregistret.se',
  'reco.se', 'hittahem.se', 'blocket.se', 'finn.no', 'bytbil.com',
  'tandpriskollen.se', 'doktify.se', 'vardguiden.se', '1177.se',
  'tripadvisor.com', 'yelp.com', 'trustpilot.com', 'glassdoor.com',
];

function isBlocklisted(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return BLOCKLIST.some(b => host === b || host.endsWith('.' + b));
  } catch { return true; }
}

function looksLikeCompanySite(url) {
  try {
    const { hostname, pathname } = new URL(url);
    if (!hostname.includes('.')) return false;
    if (pathname.split('/').filter(Boolean).length > 2) return false;
    return true;
  } catch { return false; }
}

function normalizeToRoot(url) {
  try {
    const { protocol, hostname } = new URL(url);
    return `${protocol}//${hostname}`;
  } catch { return null; }
}

async function searchBrave(query) {
  const key = process.env.BRAVE_API_KEY;
  if (!key) return [];
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10&country=se`,
    {
      headers: { 'Accept': 'application/json', 'X-Subscription-Token': key },
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.web?.results || []).map(r => r.url).filter(Boolean);
}

async function searchSerper(query) {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, num: 10, gl: 'se', hl: 'sv' }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.organic || []).map(r => r.link).filter(Boolean);
}

async function findWebsite(companyName, city) {
  if (!companyName) return null;

  const queries = city
    ? [`"${companyName}" "${city}" Sverige`, `"${companyName}" Sverige`]
    : [`"${companyName}" Sverige`];

  const search = process.env.BRAVE_API_KEY ? searchBrave : searchSerper;
  const source = process.env.BRAVE_API_KEY ? 'brave_search' : 'serper_search';

  for (const query of queries) {
    let urls = [];
    try { urls = await search(query); } catch { continue; }

    for (const url of urls) {
      if (isBlocklisted(url)) continue;
      if (!looksLikeCompanySite(url)) continue;
      const website = normalizeToRoot(url);
      if (website) return { website, source };
    }
  }

  return null;
}

module.exports = { findWebsite };
