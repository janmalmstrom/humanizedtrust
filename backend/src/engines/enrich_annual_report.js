'use strict';
/**
 * Annual Report Fetcher
 * Scrapes allabolag.se for financial data: revenue, profit, employees, year
 * Values are in thousands SEK (tkr) — multiplied to SEK on return
 * Retries up to 2 times with 2s delay to handle allabolag.se rate limiting
 */

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchAnnualReport(orgNr, { retries = 2, delayMs = 2000 } = {}) {
  if (!orgNr) return null;

  const normalized = orgNr.replace(/[-\s]/g, '');
  const url = `https://www.allabolag.se/${normalized}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(delayMs * attempt);

    let html;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'sv-SE,sv;q=0.9',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) continue;
      html = await res.text();
    } catch {
      continue;
    }

    const match = html.match(/"revenue":"(\d+)","currency":"([^"]+)","profit":"(-?\d+)","companyAccountsLastUpdatedDate":"(\d+)","employees":"(\d+)"/);
    if (!match) continue;

    return {
      revenue_sek:         parseInt(match[1]) * 1000,
      profit_sek:          parseInt(match[3]) * 1000,
      num_employees_exact: parseInt(match[5]),
      annual_report_year:  parseInt(match[4]),
    };
  }

  return null;
}

module.exports = { fetchAnnualReport };
