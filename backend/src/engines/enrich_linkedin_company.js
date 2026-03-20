'use strict';
/**
 * enrich_linkedin_company.js
 *
 * Finds the LinkedIn company page URL for a lead using Serper.dev
 * Google X-ray search: site:linkedin.com/company/ "company name" "city"
 *
 * Returns: { linkedinUrl, source } or null
 */

// Strip noise words so "ABC Cleaning LLC" matches "ABC Cleaning | LinkedIn"
function normalizeCompanyName(name) {
  return name
    .toLowerCase()
    .replace(/\b(llc|inc|corp|ltd|co\.?|company|services|service|cleaning|solutions|group)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function urlLooksLikeCompanyPage(url) {
  // Must be linkedin.com/company/slug — not /in/ (personal profile)
  return /linkedin\.com\/company\/[a-z0-9\-_%]+\/?$/i.test(url);
}

async function findLinkedInCompanyUrl(lead) {
  const braveKey = process.env.BRAVE_API_KEY;
  const serperKey = process.env.SERPER_API_KEY;
  if (!braveKey && !serperKey) return null;

  const { company_name, city, state } = lead;
  if (!company_name) return null;

  const location = [city, state].filter(Boolean).join(' ');
  const query = `site:linkedin.com/company/ "${company_name}"${location ? ' "' + location + '"' : ''}`;

  let results = []; // [{ url, title, snippet }]

  if (braveKey) {
    try {
      const res = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
        {
          headers: { 'Accept': 'application/json', 'X-Subscription-Token': braveKey },
          signal: AbortSignal.timeout(8000),
        }
      );
      if (res.ok) {
        const data = await res.json();
        results = (data.web?.results || []).map(r => ({ url: r.url, title: r.title || '', snippet: r.description || '' }));
      } else {
        console.warn(`[LinkedInCompany] Brave API error ${res.status}`);
      }
    } catch (err) {
      console.warn(`[LinkedInCompany] Brave fetch failed: ${err.message}`);
    }
  } else {
    try {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, num: 5 }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        results = (data.organic || []).map(r => ({ url: r.link, title: r.title || '', snippet: r.snippet || '' }));
      } else {
        console.warn(`[LinkedInCompany] Serper API error ${res.status}`);
      }
    } catch (err) {
      console.warn(`[LinkedInCompany] Serper fetch failed: ${err.message}`);
    }
  }

  if (!results.length) return null;

  const normTarget = normalizeCompanyName(company_name);
  const targetWords = normTarget.split(' ').filter(w => w.length > 2);
  const source = braveKey ? 'brave_xray' : 'serper_xray';

  for (const item of results) {
    if (!urlLooksLikeCompanyPage(item.url)) continue;
    const haystack = normalizeCompanyName(item.title + ' ' + item.snippet);
    const hits = targetWords.filter(w => haystack.includes(w));
    if (targetWords.length > 0 && hits.length < Math.min(2, targetWords.length)) continue;
    return { linkedinUrl: item.url, source };
  }

  return null;
}

module.exports = { findLinkedInCompanyUrl };
