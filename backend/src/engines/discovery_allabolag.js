/**
 * Allabolag.se Discovery Engine
 * Scrapes Swedish companies by SNI/NACE code and employee range
 * Target: 50-249 employees in Manufacturing, Healthcare, Financial
 */
const { chromium } = require('playwright');

// SNI codes to target (Swedish NACE equivalents)
const TARGET_SNI = {
  manufacturing: [
    '25', '26', '27', '28', '29', '30', '31', '32', '33' // Metal, electronics, machinery
  ],
  healthcare: [
    '86', '87', '88' // Hospital, nursing, social work
  ],
  financial: [
    '64', '65', '66' // Banking, insurance, finance
  ],
  it_services: [
    '62', '63' // Software, IT consulting
  ],
  energy: [
    '35', '36' // Electricity, gas, water
  ],
  transport: [
    '49', '50', '51', '52', '53' // Land, sea, air, logistics
  ]
};

// All target SNI prefixes flat
const ALL_TARGET_SNI = Object.values(TARGET_SNI).flat();

const SWEDISH_COUNTIES = [
  'Stockholm', 'Uppsala', 'Södermanland', 'Östergötland', 'Jönköping',
  'Kronoberg', 'Kalmar', 'Gotland', 'Blekinge', 'Skåne', 'Halland',
  'Västra Götaland', 'Värmland', 'Örebro', 'Västmanland', 'Dalarna',
  'Gävleborg', 'Västernorrland', 'Jämtland', 'Västerbotten', 'Norrbotten'
];

async function scrapeAllabolag({ sniPrefix, county, maxResults = 100 }) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results = [];

  try {
    // Allabolag search by SNI code
    const url = `https://www.allabolag.se/bransch/${sniPrefix}00?antal_anst=4&lan=${encodeURIComponent(county || '')}`;
    // antal_anst=4 = 50-199 employees, 5 = 200-499

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const companies = await page.evaluate(() => {
      const rows = document.querySelectorAll('.company-list-item, .search-result-item, tr[data-orgnr]');
      return Array.from(rows).map(row => {
        const nameEl = row.querySelector('.company-name, .name, h3 a, td a');
        const orgnrEl = row.querySelector('[data-orgnr]') || row;
        const cityEl = row.querySelector('.city, .municipality');
        const sniEl = row.querySelector('.sni, .industry');
        const empEl = row.querySelector('.employees, .antal-anst');

        return {
          company_name: nameEl?.textContent?.trim(),
          org_nr: orgnrEl?.getAttribute('data-orgnr') || orgnrEl?.getAttribute('data-org-nr'),
          city: cityEl?.textContent?.trim(),
          nace_description: sniEl?.textContent?.trim(),
          employee_range: empEl?.textContent?.trim(),
          detail_url: nameEl?.href || nameEl?.closest('a')?.href
        };
      }).filter(c => c.company_name);
    });

    results.push(...companies.slice(0, maxResults));
  } catch (err) {
    console.error(`[allabolag] Error scraping SNI ${sniPrefix} / ${county}: ${err.message}`);
  } finally {
    await browser.close();
  }

  return results;
}

async function scrapeCompanyDetail(orgNr) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    const url = `https://www.allabolag.se/${orgNr.replace('-', '')}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1500);

    const detail = await page.evaluate(() => {
      const get = (sel) => document.querySelector(sel)?.textContent?.trim();
      const getAttr = (sel, attr) => document.querySelector(sel)?.getAttribute(attr);

      return {
        website: getAttr('a[href*="http"]:not([href*="allabolag"])', 'href') ||
                 get('.website a') || get('[itemprop="url"]'),
        phone: get('.phone, [itemprop="telephone"]'),
        address: get('.address, [itemprop="streetAddress"]'),
        postal_code: get('[itemprop="postalCode"]'),
        city: get('[itemprop="addressLocality"]'),
        county: get('.county, .lan'),
        nace_code: get('.sni-code, .branschkod'),
        nace_description: get('.sni-description, .bransch'),
        employee_range: get('.employees-range, .antal-anstallda'),
        revenue_range: get('.revenue, .omsattning'),
        founded_year: parseInt(get('.founded, .registrerad')?.match(/\d{4}/)?.[0])
      };
    });

    return detail;
  } catch (err) {
    console.error(`[allabolag] Detail error for ${orgNr}: ${err.message}`);
    return null;
  } finally {
    await browser.close();
  }
}

module.exports = { scrapeAllabolag, scrapeCompanyDetail, TARGET_SNI, ALL_TARGET_SNI, SWEDISH_COUNTIES };
