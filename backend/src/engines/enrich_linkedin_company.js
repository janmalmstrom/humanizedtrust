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
  const key = process.env.SERPER_API_KEY;
  if (!key) return null;

  const { company_name, city, state } = lead;
  if (!company_name) return null;

  const location = [city, state].filter(Boolean).join(' ');
  const query = `site:linkedin.com/company/ "${company_name}"${location ? ' "' + location + '"' : ''}`;

  let data;
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: 5 }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(`[LinkedInCompany] API error ${res.status}`);
      return null;
    }
    data = await res.json();
  } catch (err) {
    console.warn(`[LinkedInCompany] Fetch failed for "${company_name}": ${err.message}`);
    return null;
  }

  if (!data.organic || data.organic.length === 0) return null;

  const normTarget = normalizeCompanyName(company_name);
  const targetWords = normTarget.split(' ').filter(w => w.length > 2);

  for (const item of data.organic) {
    if (!urlLooksLikeCompanyPage(item.link)) continue;

    // Verify enough words from company name appear in title/snippet
    const haystack = normalizeCompanyName((item.title || '') + ' ' + (item.snippet || ''));
    const hits = targetWords.filter(w => haystack.includes(w));
    if (targetWords.length > 0 && hits.length < Math.min(2, targetWords.length)) continue;

    return { linkedinUrl: item.link, source: 'serper_xray' };
  }

  return null;
}

module.exports = { findLinkedInCompanyUrl };
