'use strict';
/**
 * Hitta.se Phone Lookup Engine
 *
 * Given a person name + city, searches hitta.se and returns their
 * personal mobile number (E.164 format).
 *
 * Data source: __NEXT_DATA__ JSON in hitta.se search results
 * Match strategy:
 *   1. Exact full name match in the same city → high confidence
 *   2. Exact full name match anywhere → medium confidence (pick closest city)
 *   3. No match → return null
 *
 * Rate limit: caller should delay 1.5s between requests
 */

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Normalize Swedish city names for comparison (remove 'ö'→'o', 'ä'→'a' etc.)
function normalizeCity(city) {
  if (!city) return '';
  return city.toLowerCase()
    .replace(/ö/g, 'o').replace(/ä/g, 'a').replace(/å/g, 'a')
    .replace(/[^a-z0-9]/g, '');
}

function normalizeName(name) {
  return (name || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Look up a person's mobile number on hitta.se
 *
 * @param {string} fullName  - e.g. "Anders Eriksson"
 * @param {string} city      - e.g. "Stockholm"
 * @returns {object|null} { phone, displayAs, confidence, hittaName, hittaCity } or null
 */
async function lookupPhone(fullName, city, { retries = 1, delayMs = 2000 } = {}) {
  if (!fullName) return null;

  const searchUrl = 'https://www.hitta.se/sok?vad=' + encodeURIComponent(fullName) +
    (city ? '&var=' + encodeURIComponent(city) : '');

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(delayMs);

    try {
      const res = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'sv-SE,sv;q=0.9',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) continue;
      const html = await res.text();

      const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/);
      if (!m) continue;

      const data = JSON.parse(m[1]);
      const persons = data.props &&
                      data.props.pageProps &&
                      data.props.pageProps.result &&
                      data.props.pageProps.result.persons;

      if (!persons || persons.length === 0) return null;

      const searchName = normalizeName(fullName);
      const searchCity = normalizeCity(city);

      // Split search name into first + last for flexible matching
      const searchParts = searchName.split(' ');
      const searchFirst = searchParts[0];
      const searchLast = searchParts[searchParts.length - 1];

      // Pass 1: exact display name + same city
      for (const p of persons) {
        const pName = normalizeName(p.displayName);
        const pCity = normalizeCity(p.address && p.address[0] && p.address[0].city);
        if (pName === searchName && pCity === searchCity) {
          const phone = extractPhone(p);
          if (phone) return { ...phone, confidence: 'high', hittaName: p.displayName, hittaCity: p.zipCity };
        }
      }

      // Pass 2: first + last name match (ignores middle names) + same city
      for (const p of persons) {
        const fullName = p.name && normalizeName(p.name.full);
        if (!fullName) continue;
        const parts = fullName.split(' ');
        const pFirst = parts[0];
        const pLast = parts[parts.length - 1];
        const pCity = normalizeCity(p.address && p.address[0] && p.address[0].city);
        if (pFirst === searchFirst && pLast === searchLast && pCity === searchCity) {
          const phone = extractPhone(p);
          if (phone) return { ...phone, confidence: 'high', hittaName: p.displayName, hittaCity: p.zipCity };
        }
      }

      // Pass 3: first + last name match, any city (pick first with phone)
      for (const p of persons) {
        const fullName = p.name && normalizeName(p.name.full);
        if (!fullName) continue;
        const parts = fullName.split(' ');
        const pFirst = parts[0];
        const pLast = parts[parts.length - 1];
        if (pFirst === searchFirst && pLast === searchLast) {
          const phone = extractPhone(p);
          if (phone) return { ...phone, confidence: 'medium', hittaName: p.displayName, hittaCity: p.zipCity };
        }
      }

      return null; // Found persons but no phone match

    } catch (err) {
      if (attempt === retries) return null;
    }
  }

  return null;
}

function extractPhone(person) {
  if (!person.phone || person.phone.length === 0) return null;
  // Prefer mobile over landline
  const mobile = person.phone.find(p => p.label && p.label.toLowerCase().includes('mobil'));
  const entry = mobile || person.phone[0];
  if (!entry || !entry.callTo) return null;
  return {
    phone: entry.callTo,       // E.164: +46707955857
    displayAs: entry.displayAs, // Human readable: 070-795 58 57
  };
}

/**
 * Enrich a single contact with phone from hitta.se
 *
 * @param {object} db      - pg pool
 * @param {object} contact - { id, name, phone, lead_city }
 * @returns {boolean} true if phone was found and saved
 */
async function enrichContactPhone(db, contact) {
  if (!contact.name || contact.phone) return false; // Already has phone

  const result = await lookupPhone(contact.name, contact.lead_city);
  if (!result) return false;

  await db.query(
    `UPDATE contacts
     SET phone = $1, source = COALESCE(source, '') || '+hitta(' || $2 || ')', updated_at = NOW()
     WHERE id = $3`,
    [result.phone, result.confidence, contact.id]
  );

  console.log(`[hitta] ${contact.name} (${contact.lead_city}) → ${result.displayAs} [${result.confidence}]`);
  return true;
}

module.exports = { lookupPhone, enrichContactPhone };
