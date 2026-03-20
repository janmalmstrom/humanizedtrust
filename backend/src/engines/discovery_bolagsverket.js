/**
 * Bolagsverket + SCB Bulk Discovery Engine
 *
 * Files (weekly, free, CC BY 2.5 SE):
 *   - bolagsverket_bulkfil.txt  → org_nr, name, address (semicolon-delimited, UTF-8)
 *   - scb_bulkfil_*.txt         → SNI codes, legal form, status (tab-delimited, latin1)
 *
 * Filters applied:
 *   - FtgStat = 1 (active)
 *   - JurForm = 49 (Aktiebolag / AB only)
 *   - Ng1 SNI prefix in target sectors
 *
 * SCB columns:
 *   ForAndrTyp COAdress Foretagsnamn FtgStat Gatuadress JEStat JurForm Namn
 *   Ng1 Ng2 Ng3 Ng4 Ng5 PeOrgNr PostNr PostOrt RegDatKtid Reklamsparrtyp
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const BULK_DIR = '/home/janne/humanizedtrust/data/bolagsverket';

const TARGET_SNI_PREFIXES = [
  // Energy (el, gas, oil, district heating)
  '06','19','35','36',
  // Transport (air, rail, water, road)
  '49','50','51','52','53',
  // Banking & financial market infrastructure
  '64','65','66',
  // Healthcare
  '86','87','88',
  // Drinking water & wastewater
  '37','38','39',
  // Digital infrastructure & IT services (datacenters, cloud, telecom, software)
  '61','62','63',
  // Public administration
  '84',
  // Manufacturing (medical devices, computers, machinery, vehicles, weapons)
  '25','26','27','28','29','30','31','32','33',
  // Chemicals & pharmaceuticals
  '20','21',
  // Food production & distribution
  '10','11',
  // Space (aircraft/spacecraft manufacturing — SNI 30)
  // already covered by '30' above
  // Research & development
  '72',
  // Postal & courier (SNI 53 already above)
  // Waste management (SNI 38,39 already above)
];

function normalizeOrgNr(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return `${digits.slice(0,6)}-${digits.slice(6)}`;
  if (digits.length === 12) return `${digits.slice(2,8)}-${digits.slice(8)}`;
  return null;
}

// Parse SCB tab-delimited file (latin1 encoding)
async function parseScbFile(filePath) {
  console.log(`[bv] Parsing SCB file: ${path.basename(filePath)}`);
  const map = new Map();

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'latin1' }),
    crlfDelay: Infinity
  });

  let lineNum = 0;
  for await (const line of rl) {
    lineNum++;
    if (lineNum === 1) continue; // skip header

    const cols = line.split('\t');
    // Columns: [0]ForAndrTyp [1]COAdress [2]Foretagsnamn [3]FtgStat [4]Gatuadress
    //          [5]JEStat [6]JurForm [7]Namn [8]Ng1 [9]Ng2 [10]Ng3 [11]Ng4 [12]Ng5
    //          [13]PeOrgNr [14]PostNr [15]PostOrt

    const ftgStat  = (cols[3] || '').trim();
    const jurForm  = (cols[6] || '').trim();
    const ng1      = (cols[8] || '').trim();
    const peOrgNr  = (cols[13] || '').trim();

    // Only active ABs
    if (ftgStat !== '1') continue;
    if (jurForm !== '49') continue; // 49 = AB

    // Only target SNI sectors
    const sniPrefix = ng1.substring(0, 2);
    if (!TARGET_SNI_PREFIXES.includes(sniPrefix)) continue;

    const orgNr = normalizeOrgNr(peOrgNr);
    if (!orgNr) continue;

    map.set(orgNr, {
      nace_code: ng1,
      street:    (cols[4] || '').trim(),
      postal_code: (cols[14] || '').trim(),
      city:      (cols[15] || '').trim(),
      name:      (cols[7] || cols[2] || '').trim(),
    });
  }

  console.log(`[bv] SCB: ${map.size} target companies found`);
  return map;
}

// Parse Bolagsverket semicolon-delimited file (UTF-8)
// Format: "ORG_NR$ORGNR-IDORG";"";country;"NAME$FORETAGSNAMN-ORGNAM$DATE";form;avregDate;avregCause;...;"STREET$CO$CITY$ZIP$LAND"
function parseBvRow(line) {
  // Split on semicolons not inside quotes
  const cols = [];
  let cur = '';
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ';' && !inQuote) { cols.push(cur); cur = ''; continue; }
    cur += ch;
  }
  cols.push(cur);

  // Extract org_nr from field 0: "5020105499$ORGNR-IDORG"
  const idField = cols[0] || '';
  const orgNrRaw = idField.split('$')[0];
  const orgNr = normalizeOrgNr(orgNrRaw);

  // Check if deregistered (field 5 = avregistreringsdatum)
  const avregDate = (cols[5] || '').trim();
  if (avregDate) return null; // skip deregistered

  // Extract company name from field 3: "Name$FORETAGSNAMN-ORGNAM$DATE|AltName$..."
  const nameField = cols[3] || '';
  const companyName = nameField.split('$')[0].trim();

  // Extract address from last field: "STREET$CO$CITY$ZIP$SE-LAND"
  const addrField = cols[cols.length - 1] || '';
  const addrParts = addrField.split('$');
  const street    = addrParts[0]?.trim() || '';
  const co        = addrParts[1]?.trim() || '';
  const city      = addrParts[2]?.trim() || '';
  const zip       = addrParts[3]?.trim() || '';

  if (!orgNr || !companyName) return null;

  return { orgNr, companyName, street, co, city, zip };
}

async function parseBvFile(filePath) {
  console.log(`[bv] Parsing Bolagsverket file...`);
  const map = new Map();

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  let lineNum = 0;
  for await (const line of rl) {
    lineNum++;
    if (lineNum === 1) continue; // skip header
    if (!line.trim()) continue;

    const row = parseBvRow(line);
    if (row) map.set(row.orgNr, row);
  }

  console.log(`[bv] Bolagsverket: ${map.size} active companies parsed`);
  return map;
}

async function runBulkImport(db) {
  console.log('[bv] Starting bulk import from local files...');

  // Find files
  const files = fs.readdirSync(BULK_DIR);
  const bvFile = files.find(f => f === 'bolagsverket_bulkfil.txt');
  const scbFile = files.find(f => f.startsWith('scb_bulkfil') && f.endsWith('.txt'));

  if (!bvFile) throw new Error(`bolagsverket_bulkfil.txt not found in ${BULK_DIR}`);
  if (!scbFile) throw new Error(`scb_bulkfil*.txt not found in ${BULK_DIR}`);

  // Parse both files
  const [scbMap, bvMap] = await Promise.all([
    parseScbFile(path.join(BULK_DIR, scbFile)),
    parseBvFile(path.join(BULK_DIR, bvFile))
  ]);

  const { computeScore } = require('./scorer');

  let inserted = 0, skipped = 0, enriched = 0;

  console.log(`[bv] Merging and importing ${scbMap.size} target companies...`);

  for (const [orgNr, scb] of scbMap) {
    const bv = bvMap.get(orgNr);

    // Prefer BV data for name/address when available
    const companyName = bv?.companyName || scb.name;
    if (!companyName) continue;

    const street     = bv?.street || scb.street || '';
    const city       = bv?.city   || scb.city   || '';
    const postalCode = bv?.zip    || scb.postal_code || '';

    try {
      const { rows } = await db.query(
        `INSERT INTO discovery_leads
           (org_nr, company_name, address, postal_code, city, nace_code, source)
         VALUES ($1, $2, $3, $4, $5, $6, 'bolagsverket')
         ON CONFLICT (org_nr) DO UPDATE SET
           nace_code = EXCLUDED.nace_code,
           updated_at = NOW()
         RETURNING id, (xmax = 0) AS is_new`,
        [orgNr, companyName, street, postalCode, city, scb.nace_code]
      );

      if (rows[0]?.is_new) {
        const lead = {
          org_nr: orgNr, company_name: companyName,
          nace_code: scb.nace_code, employee_range: null,
          email: null, linkedin_url: null, nis2_registered: false
        };
        const { score, label, breakdown } = computeScore(lead);
        await db.query(
          'UPDATE discovery_leads SET score=$1,score_label=$2,score_breakdown=$3 WHERE id=$4',
          [score, label, JSON.stringify(breakdown), rows[0].id]
        );
        inserted++;
      } else {
        enriched++;
      }

      if ((inserted + enriched) % 5000 === 0) {
        console.log(`[bv] Progress: ${inserted} inserted, ${enriched} updated...`);
      }
    } catch (err) {
      skipped++;
      if (skipped < 5) console.error(`[bv] Insert error ${orgNr}: ${err.message}`);
    }
  }

  console.log(`[bv] Import complete: ${inserted} new, ${enriched} updated, ${skipped} errors`);
  return { inserted, enriched, skipped, total: scbMap.size };
}

module.exports = { runBulkImport, normalizeOrgNr, TARGET_SNI_PREFIXES };
