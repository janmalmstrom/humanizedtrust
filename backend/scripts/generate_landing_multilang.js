'use strict';
/**
 * NIS2Klar Multilingual Landing Page Generator
 *
 * Generates localized versions of nis2.html for EN (Ireland), DA (Denmark), NO (Norway).
 * Each page has country-specific: authority names, law references, penalties, copy.
 *
 * Output:
 *   frontend/public/en/index.html  — English landing (Ireland)
 *   frontend/public/da/index.html  — Danish landing
 *   frontend/public/no/index.html  — Norwegian landing
 *
 * Usage:
 *   node scripts/generate_landing_multilang.js --lang=en
 *   node scripts/generate_landing_multilang.js --all
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const FRONTEND_DIR = path.join(__dirname, '../../frontend');
const SV_LANDING = path.join(FRONTEND_DIR, 'public', 'nis2.html');

// ── Language switcher snippet (injected into nav) ────────────────────────────

function langSwitcher(active) {
  const langs = [
    { key: 'sv', label: 'SV', href: 'https://nis2klar.se/nis2.html' },
    { key: 'en', label: 'EN', href: 'https://nis2klar.se/en/nis2.html' },
    { key: 'da', label: 'DA', href: 'https://nis2klar.se/da/nis2.html' },
    { key: 'no', label: 'NO', href: 'https://nis2klar.se/no/nis2.html' },
    { key: 'it', label: 'IT', href: 'https://nis2klar.se/it/nis2.html' },
  ];
  const links = langs.map(l =>
    `<a href="${l.href}" style="color:${l.key === active ? '#f5e642' : '#888'};text-decoration:none;font-weight:700;font-size:13px;padding:4px 8px;border-radius:3px;${l.key === active ? 'background:rgba(245,230,66,0.1);' : ''}" title="${l.label}">${l.label}</a>`
  ).join('');
  return `<div style="display:flex;gap:6px;align-items:center;">${links}</div>`;
}

// ── Country configurations ───────────────────────────────────────────────────

const CONFIGS = {
  en: {
    lang: 'en',
    outFile: 'en/nis2.html',
    articleIndex: 'https://nis2klar.se/en/articles.html',
    articleLabel: 'Read NIS2 articles →',
    gapAnalysis: 'https://nis2klar.se/nis2-gap-analys.html',
    langSwitcher: langSwitcher('en'),
    prompt: `You are adapting a Swedish NIS2 landing page (nis2.html) into English for an Irish audience.

COUNTRY CONTEXT — Ireland:
- Law: S.I. No. 322 of 2024 (NIS2 Regulations) — transposed October 2024
- Authority: NCSC Ireland (National Cyber Security Centre); sector regulators: CBI (finance), ComReg (telecoms), CRU (energy)
- Penalties: up to €10 million or 2% of global annual turnover (essential entities); €7 million or 1.4% (important entities)
- Incident reporting: 24h early warning → 72h notification → 1 month final report (to NCSC Ireland)
- Personal liability: Regulation 32 of S.I. 322/2024 — management body members can be held personally liable
- Key stat: "In force since October 2024" (not "Nu" / "Now")
- Topbar urgency text should reference Ireland and NCSC Ireland
- Hero must resonate with Irish CEOs and board members
- Villain section: acknowledge EU origin but emphasise Irish legal reality (NCSC Ireland enforces)
- Sectors: same 18 as EU NIS2 — use English sector names
- Stats bar: replace "Nu" (Now) with "Oct 2024" or "In Force"
- Microsoft section: reference Ireland specifically — many major tech companies HQ'd in Ireland, already using Microsoft 365
- All CTAs link to #boka (booking section) or the gap analysis page
- Navigation: add language switcher to nav (provided below), and "Read articles →" link to /en/articles.html
- Footer: keep contact details (support@trustedmarketing.se, +46 470 59 70 03)
- Language: English. Professional, direct, slightly alarming tone.`,
  },

  da: {
    lang: 'da',
    outFile: 'da/nis2.html',
    articleIndex: 'https://nis2klar.se/da/artikler.html',
    articleLabel: 'Læs NIS2-artikler →',
    gapAnalysis: 'https://nis2klar.se/nis2-gap-analys.html',
    langSwitcher: langSwitcher('da'),
    prompt: `Du tilpasser en svensk NIS2-landingsside (nis2.html) til dansk for en dansk målgruppe.

LANDEKONTEXT — Danmark:
- Lov: NIS2-loven (Lov nr. 1120 af 2023 om net- og informationssikkerhed) — trådt i kraft oktober 2024
- Myndighed: CFCS (Center for Cybersikkerhed) som primær tilsynsmyndighed; sektortilsyn: Finanstilsynet, Energistyrelsen, Erhvervsstyrelsen
- Bøder: op til 10 mio. EUR eller 2% af global omsætning (væsentlige enheder); 7 mio. EUR eller 1,4% (vigtige enheder)
- Hændelsesrapportering: 24t tidlig advarsel → 72t rapport → 1 måned endelig rapport (til CFCS)
- Personligt ansvar: ledelsesmedlemmer kan holdes personligt ansvarlige; CFCS kan udstede midlertidigt forbud mod at varetage ledelseshverv
- Statistikbar: erstat "Nu" med "I kraft" eller "Oktober 2024"
- Hero: resonér med danske direktører og bestyrelsesmedlemmer
- Villain-sektion: anerkend EU-oprindelse, men understreg dansk juridisk virkelighed (CFCS håndhæver)
- Sektorer: brug danske sektornavne
- Microsoft-sektion: tilpas til dansk kontekst — mange danske SMV'er bruger allerede Microsoft 365
- Navigation: tilføj sprogvælger til nav (nedenfor) og "Læs artikler →" link til /da/artikler.html
- Footer: behold kontaktoplysninger (support@trustedmarketing.se, +46 470 59 70 03)
- Sprog: dansk. Professionel, direkte, lidt skræmmende tone.`,
  },

  no: {
    lang: 'no',
    outFile: 'no/nis2.html',
    articleIndex: 'https://nis2klar.se/no/artikler.html',
    articleLabel: 'Les NIS2-artikler →',
    gapAnalysis: 'https://nis2klar.se/nis2-gap-analys.html',
    langSwitcher: langSwitcher('no'),
    prompt: `Du tilpasser en svensk NIS2-landingsside (nis2.html) til norsk (bokmål) for en norsk målgruppe.

LANDEKONTEKST — Norge:
- Regulering: NIS2-direktivet implementeres i Norge via EØS-avtalen. Norge er IKKE EU-medlem, men EØS-tilknyttet. Implementeringen forventes fullført 2025–2026. VIKTIG: presiser alltid at Norge er EØS-land — bruk "forventes", "vil trolig", "når regelverket trer i kraft" der det passer.
- Myndighet: NSM (Nasjonal sikkerhetsmyndighet) — primærmyndighet; sektortilsyn: NVE (energi), Finanstilsynet (finans), Direktoratet for e-helse (helse)
- Bøter: forventes opp til 10 mill. EUR eller 2% av global omsetning (vesentlige enheter); 7 mill. EUR eller 1,4% (viktige enheter)
- Hendelsesrapportering: 24t tidlig varsel → 72t rapport → 1 måned sluttrapport (til NSM)
- Personlig ansvar: ledelsesmedlemmer forventes å kunne holdes personlig ansvarlige
- Statistikbar: erstat "Nu" med "Kommer" eller "2025/2026" — tydelig at det er på vei, ikke i kraft ennå
- Hero: resonér med norske direktører og styremedlemmer — fremhev at det kommer og forberedelse er nøkkelen
- Villain-sektion: anerkjenn at Norge ikke er EU, men at EØS gjør NIS2 like relevant
- Sektorer: bruk norske sektornavn
- Microsoft-sektion: tilpass til norsk kontekst — mange norske bedrifter bruker Microsoft 365
- Navigation: legg til språkvelger i nav (nedenfor) og "Les artikler →" lenke til /no/artikler.html
- Footer: behold kontaktinformasjon (support@trustedmarketing.se, +46 470 59 70 03)
- Språk: norsk (bokmål). Profesjonell, direkte, litt skremmende tone.`,
  },

  it: {
    lang: 'it',
    outFile: 'it/nis2.html',
    articleIndex: 'https://nis2klar.se/it/articoli.html',
    articleLabel: 'Leggi gli articoli NIS2 →',
    gapAnalysis: 'https://nis2klar.se/nis2-gap-analys.html',
    langSwitcher: langSwitcher('it'),
    prompt: `Stai adattando una pagina di atterraggio NIS2 svedese (nis2.html) in italiano per un pubblico italiano.

CONTESTO PAESE — Italia:
- Legge: D.Lgs. 138/2024 (Decreto Legislativo di recepimento della Direttiva NIS2) — in vigore dal 16 ottobre 2024
- Autorità: ACN (Agenzia per la Cybersicurezza Nazionale) come autorità primaria; autorità di settore: Banca d'Italia (finanza), ARERA (energia), AGCOM (telecomunicazioni)
- Sanzioni: fino a 10 milioni di EUR o il 2% del fatturato mondiale per i soggetti essenziali; 7 milioni di EUR o l'1,4% per i soggetti importanti
- Notifica degli incidenti: allerta precoce 24h → notifica 72h → relazione finale 1 mese (all'ACN)
- Responsabilità personale: Art. 23 D.Lgs. 138/2024 — i membri del CdA possono essere ritenuti personalmente responsabili
- Barra delle statistiche: sostituisci "Nu" con "In vigore" o "Ottobre 2024"
- Hero: risuona con CEO e membri del CdA italiani — enfatizza responsabilità personale e sanzioni
- Sezione villain: riconosci l'origine UE ma sottolinea la realtà legale italiana (ACN applica la norma)
- Settori: usa i nomi italiani dei settori
- Sezione Microsoft: adatta al contesto italiano — molte PMI italiane usano già Microsoft 365
- Navigazione: aggiungi selettore lingua nel nav (sotto) e link "Leggi articoli →" a /it/articoli.html
- Footer: mantieni i dettagli di contatto (support@trustedmarketing.se, +46 470 59 70 03)
- Lingua: italiano. Tono professionale, diretto, leggermente allarmante ma mai catastrofico.`,
  },
};

// ── Generator ────────────────────────────────────────────────────────────────

async function generateLanding(langKey) {
  const cfg = CONFIGS[langKey];
  const svHtml = fs.readFileSync(SV_LANDING, 'utf-8');

  console.log(`\n[${langKey}] Generating landing page...`);

  const prompt = `${cfg.prompt}

LANGUAGE SWITCHER — inject this into the <nav>, between the logo and the CTA button:
${cfg.langSwitcher}

Also add this "Articles" nav link between language switcher and CTA button:
<a href="${cfg.articleIndex}" style="color:#ccc;text-decoration:none;font-size:14px;font-weight:600;font-family:'Poppins',sans-serif;">${cfg.articleLabel}</a>

NAV LOGO — link to localized landing page (NOT the Swedish nis2.html):
<a href="https://nis2klar.se/${cfg.outFile.replace('index.html', '')}" class="nav-logo">NIS2<span>Klar</span></a>

CTA BOOKING ANCHOR — keep as #boka (same anchor, different language copy on the button).

HREFLANG — add these in <head>:
<link rel="canonical" href="https://nis2klar.se/${cfg.outFile}">
<link rel="alternate" hreflang="sv" href="https://nis2klar.se/nis2.html">
<link rel="alternate" hreflang="en" href="https://nis2klar.se/en/nis2.html">
<link rel="alternate" hreflang="da" href="https://nis2klar.se/da/nis2.html">
<link rel="alternate" hreflang="no" href="https://nis2klar.se/no/nis2.html">
<link rel="alternate" hreflang="it" href="https://nis2klar.se/it/nis2.html">

HTML lang attribute: <html lang="${langKey}">

IMPORTANT RULES:
- Keep ALL CSS identical to the original — do not remove or change any styles
- Keep ALL HTML structure and class names identical
- Only translate/adapt the visible text content and country-specific references
- Keep the Google Analytics tag (G-BKF3QH9K01)
- Keep the booking form section (#boka) at the bottom with translated copy
- Keep the footer with contact details
- Replace MSB/NCSC-SE with the correct authority for this country
- Replace Swedish law references with country-specific law
- Replace SEK amounts with EUR where applicable
- Return ONLY valid HTML from <!DOCTYPE html> to </html>. Nothing else.

SOURCE PAGE TO ADAPT:
${svHtml}`;

  let message;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 16000,
        messages: [{ role: 'user', content: prompt }]
      });
      break;
    } catch (err) {
      if (err.status === 529 && attempt < 5) {
        const wait = attempt * 30000;
        console.log(`[${langKey}] API overloaded, retrying in ${wait / 1000}s... (${attempt}/5)`);
        await new Promise(r => setTimeout(r, wait));
      } else throw err;
    }
  }

  let html = message.content[0].text.trim();
  html = html.replace(/^```html?\s*/i, '').replace(/\s*```$/, '').trim();

  if (!html.startsWith('<!DOCTYPE') && !html.startsWith('<html')) {
    throw new Error(`[${langKey}] Response is not HTML: ` + html.slice(0, 100));
  }

  const outDir = path.join(FRONTEND_DIR, 'public', langKey);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(FRONTEND_DIR, 'public', cfg.outFile);
  fs.writeFileSync(outPath, html, 'utf-8');
  console.log(`[${langKey}] Saved: ${outPath}`);
  return outPath;
}

function rebuildFrontend() {
  console.log('\n[build] Rebuilding frontend...');
  execSync('npm run build', { cwd: FRONTEND_DIR, stdio: 'inherit' });
  console.log('[build] Done.');
}

async function main() {
  const args = process.argv.slice(2);

  const langArg = args.find(a => a.startsWith('--lang='));

  if (args.includes('--all')) {
    for (const langKey of ['en', 'da', 'no', 'it']) {
      await generateLanding(langKey);
      await new Promise(r => setTimeout(r, 5000));
    }
    rebuildFrontend();
    return;
  }

  if (langArg) {
    const langKey = langArg.replace('--lang=', '');
    if (!CONFIGS[langKey]) {
      console.error(`Unknown language: ${langKey}. Use en, da, or no.`);
      process.exit(1);
    }
    await generateLanding(langKey);
    rebuildFrontend();
    return;
  }

  console.error('Usage: node generate_landing_multilang.js --lang=en|da|no  OR  --all');
  process.exit(1);
}

main().catch(err => {
  console.error('[landing] Error:', err.message);
  process.exit(1);
});
