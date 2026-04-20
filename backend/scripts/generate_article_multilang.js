'use strict';
/**
 * NIS2Klar Multilingual Article Generator
 *
 * Generates NIS2 articles in English (Ireland), Danish, Norwegian, and Italian.
 * Each article is country-specific — correct authority, law, penalties, timeline.
 *
 * Usage:
 *   node scripts/generate_article_multilang.js --lang=en           # next pending EN article
 *   node scripts/generate_article_multilang.js --lang=da --all     # all pending DA articles
 *   node scripts/generate_article_multilang.js --lang=no --slug=nis2-hva-er-nis2-direktivet
 *   node scripts/generate_article_multilang.js --lang=it --all     # all pending IT articles
 *   node scripts/generate_article_multilang.js --lang=en --list    # show queue status
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const FRONTEND_DIR = path.join(__dirname, '../../frontend');
const SV_ARTICLES_DIR = path.join(__dirname, '../../frontend/public/artiklar');

// ── Country contexts ────────────────────────────────────────────────────────

const COUNTRY = {
  en: {
    lang: 'en',
    country: 'Ireland',
    homeUrl: 'https://nis2klar.se/en/',
    articleDir: 'en/articles',
    indexFile: 'en/articles.html',
    indexTitle: 'NIS2 Articles — Guides for CEOs and Boards | NIS2Klar',
    indexDesc: 'NIS2 Directive articles for Irish CEOs and boards. Fines, personal liability, technical requirements, incident reporting and more.',
    heroH1: 'NIS2 Articles',
    heroP: 'Guides for CEOs and boards — without technical jargon. What NIS2 requires, what it costs to miss, and how to actually comply.',
    navCta: 'Book a review',
    navCorp: 'https://nis2klar.se/#kontakt',
    navBack: '← All Articles',
    navBackHref: 'https://nis2klar.se/en/articles.html',
    readMore: 'Read article →',
    newsletter: {
      badge: 'NIS2 UPDATES',
      heading: 'New NIS2 article every week — straight to your inbox',
      subtext: 'No sales pitch. Just practical guidance for CEOs and boards.',
      placeholder: 'your@company.ie',
      button: 'Subscribe free →',
      thanks: '✅ You\'re in! Next article coming to your inbox.',
      unsub: 'You can unsubscribe at any time. We never share your email.',
      source: 'article-en'
    },
    ctaHeading: 'Do you know where your organisation stands today?',
    ctaSubtext: 'A free gap analysis with a certified Microsoft partner shows exactly what you\'ve already covered — and what\'s missing.',
    ctaButton: 'Book free gap analysis →',
    ctaFine: 'Fines are up to <strong>€10 million</strong>. The gap analysis is free.',
    toolsLabel: '🔧 TOOLS & SOLUTIONS',
    disclaimer: 'Microsoft, Microsoft 365, Azure and related product names are trademarks of Microsoft Corporation. nis2klar.se is not affiliated with or endorsed by Microsoft Corporation.',
    langPromptIntro: `You are an NIS2 expert writing for nis2klar.se — a site helping Irish CEOs and boards understand and comply with the NIS2 Directive. Write in English.

COUNTRY CONTEXT — Ireland:
- Governing law: S.I. No. 322 of 2024 (NIS2 Regulations) — transposed into Irish law in October 2024
- Competent authority: NCSC Ireland (National Cyber Security Centre) as primary authority; sector regulators include CBI (financial services), ComReg (telecoms/digital infrastructure), CRU (energy)
- Penalties: up to €10 million or 2% of global annual turnover for essential entities; €7 million or 1.4% for important entities
- Incident reporting timeline: 24h early warning → 72h incident notification → 1 month final report (submitted to NCSC Ireland)
- Personal liability: management body members can be held personally liable for infringements (Regulation 32 of S.I. 322/2024)
- Sectors: same 18 EU NIS2 sectors — energy, transport, banking, financial market infrastructure, health, drinking water, wastewater, digital infrastructure, ICT service management, public administration, space, postal services, waste management, chemicals, food, manufacturing, digital providers, research
- Irish context: many EU HQ companies (Big Tech, pharma, financial services) have Irish registration — cross-border NIS2 implications are particularly relevant for Irish-registered essential entities
- Key authority contact: NCSC Ireland (ncsc.gov.ie), not MSB or CFCS
- Tone: professional, direct, slightly alarming but never panicking. StoryBrand: reader is the hero, NIS2 is the challenge, we are the guide.`,
    msToolsTable: `| NIS2 topic | Microsoft product to name |
|---|---|
| Risk analysis & policy | Microsoft Defender Secure Score + Compliance Manager |
| Incident management | Microsoft Sentinel (SIEM) + Microsoft Defender XDR |
| Backup & continuity | Microsoft 365 Backup + Azure Backup (Immutable Vault) |
| MFA & access control | Microsoft Entra ID Conditional Access + FIDO2 / Windows Hello for Business |
| Encryption | Microsoft Purview Sensitivity Labels + Azure Key Vault |
| Training & hygiene | Microsoft Defender for Office 365 Attack Simulation Training |
| Supplier security | Microsoft Entra GDAP (Granular Delegated Admin Privileges) |
| Supervision & audit | Microsoft Defender Compliance Manager |
| Board documentation | Microsoft Defender Secure Score (0–100 board KPI) |
| Technical measures (broad) | Microsoft 365 Business Premium (covers MFA, backup, EDR, compliance) |`
  },

  da: {
    lang: 'da',
    country: 'Denmark',
    homeUrl: 'https://nis2klar.se/da/',
    articleDir: 'da/artikler',
    indexFile: 'da/artikler.html',
    indexTitle: 'NIS2 Artikler — Vejledning for direktører og bestyrelser | NIS2Klar',
    indexDesc: 'NIS2-artikler for danske direktører og bestyrelser. Bøder, personligt ansvar, tekniske krav, hændelsesrapportering og mere.',
    heroH1: 'NIS2 Artikler',
    heroP: 'Vejledning for direktører og bestyrelser — uden teknisk jargon. Hvad NIS2 kræver, hvad det koster ikke at overholde, og hvordan du faktisk efterlever loven.',
    navCta: 'Book gennemgang',
    navCorp: 'https://nis2klar.se/#kontakt',
    navBack: '← Alle artikler',
    navBackHref: 'https://nis2klar.se/da/artikler.html',
    readMore: 'Læs artikel →',
    newsletter: {
      badge: 'NIS2-OPDATERINGER',
      heading: 'Ny NIS2-artikel hver uge — direkte i indbakken',
      subtext: 'Ingen salgspitch. Kun konkret vejledning for direktører og bestyrelser.',
      placeholder: 'din@virksomhed.dk',
      button: 'Tilmeld gratis →',
      thanks: '✅ Du er med! Næste artikel kommer direkte til din indbakke.',
      unsub: 'Du kan afmelde dig når som helst. Vi deler aldrig din e-mail.',
      source: 'artikel-da'
    },
    ctaHeading: 'Ved du, hvor din organisation står i dag?',
    ctaSubtext: 'En gratis gap-analyse med en certificeret Microsoft-partner viser præcist, hvad du allerede har dækket — og hvad der mangler.',
    ctaButton: 'Book gratis gap-analyse →',
    ctaFine: 'Bøderne er op til <strong>10 millioner euro</strong>. Gap-analysen er gratis.',
    toolsLabel: '🔧 VÆRKTØJER & LØSNINGER',
    disclaimer: 'Microsoft, Microsoft 365, Azure og tilhørende produktnavne er varemærker tilhørende Microsoft Corporation. nis2klar.se er ikke tilknyttet eller godkendt af Microsoft Corporation.',
    langPromptIntro: `Du er NIS2-ekspert og skriver for nis2klar.se — et website der hjælper danske direktører og bestyrelser med at forstå og overholde NIS2. Skriv på dansk.

LANDEKONTEXT — Danmark:
- Gældende lov: NIS2-loven (Lov nr. 1120 af 2023 om net- og informationssikkerhed) — trådt i kraft oktober 2024
- Tilsynsmyndighed: CFCS (Center for Cybersikkerhed) som primær myndighed; sektortilsyn for finans (Finanstilsynet), energi (Energistyrelsen), telekommunikation (Erhvervsstyrelsen)
- Bøder: op til 10 mio. EUR eller 2% af den globale omsætning for væsentlige enheder; 7 mio. EUR eller 1,4% for vigtige enheder
- Hændelsesrapportering: 24t tidlig advarsel → 72t hændelsesrapport → 1 måned endelig rapport (til CFCS)
- Personligt ansvar: ledelsesmedlemmer kan holdes personligt ansvarlige for overtrædelser
- Sektorer: 18 EU NIS2-sektorer gælder — energi, transport, bank, finansielle markedsinfrastrukturer, sundhed, drikkevand, spildevand, digital infrastruktur, IKT-serviceforvaltning, offentlig forvaltning, rumfart, post, affaldshåndtering, kemikalier, fødevarer, fremstilling, digitale udbydere, forskning
- Dansk særkende: CFCS kan udstede øjeblikkelige påbud og midlertidigt forbyde ledelsespersoner at varetage ledelseshverv
- Ton: professionel, direkte, lidt skræmmende men aldrig paniksående. StoryBrand: læseren er helten, NIS2 er udfordringen, vi er guiden.`,
    msToolsTable: `| NIS2-emne | Microsoft-produkt at nævne |
|---|---|
| Risikoanalyse & politik | Microsoft Defender Secure Score + Compliance Manager |
| Hændelseshåndtering | Microsoft Sentinel (SIEM) + Microsoft Defender XDR |
| Backup & driftskontinuitet | Microsoft 365 Backup + Azure Backup (Immutable Vault) |
| MFA & adgangskontrol | Microsoft Entra ID Conditional Access + FIDO2 / Windows Hello for Business |
| Kryptering | Microsoft Purview Sensitivity Labels + Azure Key Vault |
| Uddannelse & hygiejne | Microsoft Defender for Office 365 Attack Simulation Training |
| Leverandørsikkerhed | Microsoft Entra GDAP (Granular Delegated Admin Privileges) |
| Tilsyn & revision | Microsoft Defender Compliance Manager |
| Bestyrelsesdokumentation | Microsoft Defender Secure Score (0–100 bestyrelses-KPI) |
| Tekniske foranstaltninger (bred) | Microsoft 365 Business Premium (dækker MFA, backup, EDR, compliance) |`
  },

  no: {
    lang: 'no',
    country: 'Norway',
    homeUrl: 'https://nis2klar.se/no/',
    articleDir: 'no/artikler',
    indexFile: 'no/artikler.html',
    indexTitle: 'NIS2 Artikler — Veiledning for direktører og styrer | NIS2Klar',
    indexDesc: 'NIS2-artikler for norske direktører og styrer. Bøter, personlig ansvar, tekniske krav, hendelsesrapportering og mer.',
    heroH1: 'NIS2 Artikler',
    heroP: 'Veiledning for direktører og styrer — uten teknisk sjargong. Hva NIS2 krever, hva det koster å ikke etterleve, og hvordan du faktisk overholder regelverket.',
    navCta: 'Book gjennomgang',
    navCorp: 'https://nis2klar.se/#kontakt',
    navBack: '← Alle artikler',
    navBackHref: 'https://nis2klar.se/no/artikler.html',
    readMore: 'Les artikkel →',
    newsletter: {
      badge: 'NIS2-OPPDATERINGER',
      heading: 'Ny NIS2-artikkel hver uke — direkte til innboksen',
      subtext: 'Ingen salgspitch. Bare konkret veiledning for direktører og styrer.',
      placeholder: 'din@bedrift.no',
      button: 'Abonner gratis →',
      thanks: '✅ Du er med! Neste artikkel kommer direkte til innboksen din.',
      unsub: 'Du kan avslutte abonnementet når som helst. Vi deler aldri e-posten din.',
      source: 'artikkel-no'
    },
    ctaHeading: 'Vet du hvor organisasjonen din står i dag?',
    ctaSubtext: 'En gratis gap-analyse med en sertifisert Microsoft-partner viser nøyaktig hva dere allerede har dekket — og hva som mangler.',
    ctaButton: 'Book gratis gap-analyse →',
    ctaFine: 'Bøtene er opp til <strong>10 millioner euro</strong>. Gap-analysen er gratis.',
    toolsLabel: '🔧 VERKTØY & LØSNINGER',
    disclaimer: 'Microsoft, Microsoft 365, Azure og tilhørende produktnavn er varemerker som tilhører Microsoft Corporation. nis2klar.se er ikke tilknyttet eller godkjent av Microsoft Corporation.',
    langPromptIntro: `Du er NIS2-ekspert og skriver for nis2klar.se — et nettsted som hjelper norske direktører og styremedlemmer med å forstå og etterleve NIS2. Skriv på norsk (bokmål).

LANDEKONTEKST — Norge:
- Gjeldende regulering: NIS2-direktivet implementeres i Norge via EØS-avtalen. Norge er IKKE EU-medlem, men er EØS-tilknyttet og vil innlemme NIS2. Implementeringen er forventet fullført i løpet av 2025–2026. VIKTIG: presiser alltid at Norge er EØS-land, ikke EU-land — bruk formuleringer som "forventes", "vil trolig" og "når regelverket trer i kraft" der dette er relevant.
- Tilsynsmyndighet: NSM (Nasjonal sikkerhetsmyndighet) er primærmyndighet for cybersikkerhet i Norge; sektortilsyn for kraft (NVE), finans (Finanstilsynet), helse (Direktoratet for e-helse)
- Bøter: forventes opp til 10 mill. EUR eller 2% av global omsetning for vesentlige enheter; 7 mill. EUR eller 1,4% for viktige enheter (forventet etter EØS-implementering)
- Hendelsesrapportering: 24t tidlig varsel → 72t hendelsesrapport → 1 måned sluttrapport (til NSM og relevante sektormyndigheter)
- Personlig ansvar: ledelsesmedlemmer forventes å kunne holdes personlig ansvarlige
- Sektorer: tilsvarende EU NIS2s 18 sektorer vil gjelde — energi, transport, bank, finansmarkedsinfrastruktur, helse, drikkevann, avløp, digital infrastruktur, IKT-tjenesteforvaltning, offentlig forvaltning, romfart, post, avfallshåndtering, kjemikalier, mat, produksjon, digitale tilbydere, forskning
- Ton: profesjonell, direkte, litt skremmende men aldri panikkskapende. StoryBrand: leseren er helten, NIS2 er utfordringen, vi er guiden.`,
    msToolsTable: `| NIS2-tema | Microsoft-produkt å nevne |
|---|---|
| Risikoanalyse & policy | Microsoft Defender Secure Score + Compliance Manager |
| Hendelseshåndtering | Microsoft Sentinel (SIEM) + Microsoft Defender XDR |
| Sikkerhetskopiering & kontinuitet | Microsoft 365 Backup + Azure Backup (Immutable Vault) |
| MFA & tilgangskontroll | Microsoft Entra ID Conditional Access + FIDO2 / Windows Hello for Business |
| Kryptering | Microsoft Purview Sensitivity Labels + Azure Key Vault |
| Opplæring & hygiene | Microsoft Defender for Office 365 Attack Simulation Training |
| Leverandørsikkerhet | Microsoft Entra GDAP (Granular Delegated Admin Privileges) |
| Tilsyn & revisjon | Microsoft Defender Compliance Manager |
| Styredokumentasjon | Microsoft Defender Secure Score (0–100 styre-KPI) |
| Tekniske tiltak (bredt) | Microsoft 365 Business Premium (dekker MFA, backup, EDR, compliance) |`
  },

  it: {
    lang: 'it',
    country: 'Italy',
    homeUrl: 'https://nis2klar.se/it/',
    articleDir: 'it/articoli',
    indexFile: 'it/articoli.html',
    indexTitle: 'Articoli NIS2 — Guide per CEO e Consigli di Amministrazione | NIS2Klar',
    indexDesc: 'Articoli sulla Direttiva NIS2 per CEO e consigli di amministrazione italiani. Sanzioni, responsabilità personale, requisiti tecnici, notifica degli incidenti e altro.',
    heroH1: 'Articoli NIS2',
    heroP: 'Guide per CEO e consigli di amministrazione — senza gergo tecnico. Cosa richiede NIS2, cosa costa ignorarla, e come conformarsi davvero.',
    navCta: 'Prenota una consulenza',
    navCorp: 'https://nis2klar.se/#kontakt',
    navBack: '← Tutti gli articoli',
    navBackHref: 'https://nis2klar.se/it/articoli.html',
    readMore: 'Leggi l\'articolo →',
    newsletter: {
      badge: 'AGGIORNAMENTI NIS2',
      heading: 'Un nuovo articolo NIS2 ogni settimana — direttamente nella tua casella',
      subtext: 'Nessun pitch di vendita. Solo guida pratica per CEO e consigli di amministrazione.',
      placeholder: 'tuo@azienda.it',
      button: 'Iscriviti gratis →',
      thanks: '✅ Sei iscritto! Il prossimo articolo arriverà nella tua casella.',
      unsub: 'Puoi cancellarti in qualsiasi momento. Non condividiamo mai la tua email.',
      source: 'articolo-it'
    },
    ctaHeading: 'Sai dove si trova la tua organizzazione oggi?',
    ctaSubtext: 'Un\'analisi del gap gratuita con un partner Microsoft certificato mostra esattamente cosa hai già coperto — e cosa manca.',
    ctaButton: 'Prenota analisi gap gratuita →',
    ctaFine: 'Le sanzioni arrivano fino a <strong>10 milioni di euro</strong>. L\'analisi del gap è gratuita.',
    toolsLabel: '🔧 STRUMENTI & SOLUZIONI',
    disclaimer: 'Microsoft, Microsoft 365, Azure e i relativi nomi di prodotto sono marchi di Microsoft Corporation. nis2klar.se non è affiliata né approvata da Microsoft Corporation.',
    langPromptIntro: `Sei un esperto di NIS2 e scrivi per nis2klar.se — un sito che aiuta CEO e consigli di amministrazione di aziende italiane a comprendere e conformarsi alla Direttiva NIS2. Scrivi in italiano.

CONTESTO PAESE — Italia:
- Legge vigente: D.Lgs. 138/2024 (Decreto Legislativo di recepimento NIS2) — in vigore dal 16 ottobre 2024
- Autorità competente: ACN (Agenzia per la Cybersicurezza Nazionale) come autorità primaria; autorità di settore: Banca d'Italia (finanza), ARERA (energia), AGCOM (telecomunicazioni), Ministero della Salute (sanità)
- Sanzioni: fino a 10 milioni di EUR o il 2% del fatturato mondiale annuo per i soggetti essenziali; 7 milioni di EUR o l'1,4% per i soggetti importanti
- Notifica degli incidenti: allerta precoce entro 24h → notifica dell'incidente entro 72h → relazione finale entro 1 mese (all'ACN)
- Responsabilità personale: i membri dell'organo di amministrazione possono essere ritenuti personalmente responsabili delle violazioni (Art. 23 D.Lgs. 138/2024)
- Settori: gli stessi 18 settori EU NIS2 — energia, trasporti, banche, infrastrutture dei mercati finanziari, sanità, acqua potabile, acque reflue, infrastrutture digitali, gestione dei servizi TIC, pubblica amministrazione, spazio, servizi postali, gestione dei rifiuti, sostanze chimiche, produzione e distribuzione di alimenti, fabbricazione, fornitori digitali, ricerca
- Contesto italiano: l'Italia ha recepito NIS2 con D.Lgs. 138/2024; le aziende devono registrarsi sulla piattaforma ACN entro i termini stabiliti; l'ACN pubblica le liste dei soggetti essenziali e importanti
- Tono: professionale, diretto, leggermente allarmante ma mai catastrofico. StoryBrand: il lettore è l'eroe, NIS2 è la sfida, noi siamo la guida.`,
    msToolsTable: `| Argomento NIS2 | Prodotto Microsoft da citare |
|---|---|
| Analisi del rischio e policy | Microsoft Defender Secure Score + Compliance Manager |
| Gestione degli incidenti | Microsoft Sentinel (SIEM) + Microsoft Defender XDR |
| Backup e continuità operativa | Microsoft 365 Backup + Azure Backup (Immutable Vault) |
| MFA e controllo degli accessi | Microsoft Entra ID Conditional Access + FIDO2 / Windows Hello for Business |
| Crittografia | Microsoft Purview Sensitivity Labels + Azure Key Vault |
| Formazione e igiene informatica | Microsoft Defender for Office 365 Attack Simulation Training |
| Sicurezza dei fornitori | Microsoft Entra GDAP (Granular Delegated Admin Privileges) |
| Supervisione e audit | Microsoft Defender Compliance Manager |
| Documentazione per il CdA | Microsoft Defender Secure Score (KPI 0–100 per il consiglio) |
| Misure tecniche (ampio) | Microsoft 365 Business Premium (copre MFA, backup, EDR, compliance) |`
  }
};

// ── Topic list (31 published SV articles → EN/DA/NO/IT equivalents) ──────────

const TOPICS = [
  {
    sv: 'nis2-vad-ar-nis2-direktivet',
    en: { slug: 'what-is-nis2-directive', title: 'What Is the NIS2 Directive? A Guide for Irish Companies' },
    da: { slug: 'hvad-er-nis2-direktivet', title: 'Hvad er NIS2-direktivet? En guide for danske virksomheder' },
    no: { slug: 'hva-er-nis2-direktivet', title: 'Hva er NIS2-direktivet? En guide for norske virksomheter' },
    it: { slug: 'cos-e-la-direttiva-nis2', title: 'Cos\'è la Direttiva NIS2? Una guida per le aziende italiane' },
    angle: 'Intro article explaining NIS2 for a non-technical CEO or board member. Focus: why NIS2 exists, what it requires at a high level, and what happens if you ignore it. StoryBrand: reader is the hero who risks being unprepared.'
  },
  {
    sv: 'nis2-personligt-ansvar-styrelse',
    en: { slug: 'nis2-personal-liability-board', title: "NIS2 and the Board's Personal Liability — What No One Wants to Talk About" },
    da: { slug: 'nis2-personligt-ansvar-bestyrelse', title: 'NIS2 og bestyrelsens personlige ansvar — det ingen vil tale om' },
    no: { slug: 'nis2-personlig-ansvar-styre', title: 'NIS2 og styrets personlige ansvar — det ingen vil snakke om' },
    it: { slug: 'nis2-responsabilita-personale-cda', title: 'NIS2 e la Responsabilità Personale del CdA — Quello che Nessuno Vuole Dire' },
    angle: "Deep dive into the personal liability of CEOs and board members. Concrete scenarios: what does a supervisory case look like, can you be removed from your role, what is the difference vs GDPR liability. Alarming but factual."
  },
  {
    sv: 'nis2-vilka-foretag-omfattas',
    en: { slug: 'which-companies-must-comply-nis2', title: 'Which Companies Must Comply With NIS2? Check If Yours Qualifies' },
    da: { slug: 'hvilke-virksomheder-er-omfattet-nis2', title: 'Hvilke virksomheder skal overholde NIS2? Tjek om din er omfattet' },
    no: { slug: 'hvilke-virksomheter-omfattes-nis2', title: 'Hvilke virksomheter må overholde NIS2? Sjekk om din er omfattet' },
    it: { slug: 'quali-aziende-devono-conformarsi-nis2', title: 'Quali Aziende Devono Conformarsi a NIS2? Verifica se la Tua È Inclusa' },
    angle: 'Practical guide: Essential vs Important entities, thresholds, sectors. Include a simple yes/no test readers can use to self-assess whether they are in scope.'
  },
  {
    sv: 'nis2-incidentrapportering-24-timmar',
    en: { slug: 'nis2-incident-reporting-24-hours', title: '24 Hours to Report: How to Handle a NIS2 Incident Correctly' },
    da: { slug: 'nis2-haendelsesrapportering-24-timer', title: '24 timer: Sådan rapporterer du en NIS2-hændelse korrekt' },
    no: { slug: 'nis2-hendelsesrapportering-24-timer', title: '24 timer: Slik rapporterer du en NIS2-hendelse riktig' },
    it: { slug: 'nis2-notifica-incidente-24-ore', title: '24 Ore per Notificare: Come Gestire Correttamente un Incidente NIS2' },
    angle: 'Narrative format: a fictional company is hit by ransomware at 3am. What must be done within 24h, 72h, 30 days? Practical timeline with checkboxes. Focus on the supervisory authority notification process.'
  },
  {
    sv: 'nis2-tekniska-sakerhetsatgarder',
    en: { slug: 'nis2-technical-security-measures', title: 'NIS2 Technical Security Requirements — What the Law Actually Demands' },
    da: { slug: 'nis2-tekniske-sikkerhedsforanstaltninger', title: 'NIS2-krav til teknisk sikkerhed — hvad loven faktisk kræver' },
    no: { slug: 'nis2-tekniske-sikkerhetstiltak', title: 'NIS2-krav til teknisk sikkerhet — hva loven faktisk krever' },
    it: { slug: 'nis2-misure-sicurezza-tecniche', title: 'Requisiti di Sicurezza Tecnica NIS2 — Cosa Richiede Davvero la Legge' },
    angle: 'Clear breakdown of Article 21 technical requirements: MFA, encryption, backups, patch management, access control, logging. Written for CEOs who need to understand what to ask their IT team.'
  },
  {
    sv: 'nis2-incidentrapportering-72-timmar-sverige',
    en: { slug: 'nis2-incident-reporting-72-hours', title: 'NIS2 72-Hour Incident Notification: Complete Compliance Guide' },
    da: { slug: 'nis2-haendelsesrapportering-72-timer', title: 'NIS2 72-timers hændelsesrapportering: Komplet overholdelsesvejledning' },
    no: { slug: 'nis2-hendelsesrapportering-72-timer', title: 'NIS2 72-timers hendelsesrapportering: Komplett veiledning' },
    it: { slug: 'nis2-notifica-incidente-72-ore', title: 'NIS2 Notifica Incidente 72 Ore: Guida Completa alla Conformità' },
    angle: 'Detailed guide on the 72-hour notification requirement. What information must be included? What is a "significant incident"? What happens if you miss the deadline? Template structure for the notification.'
  },
  {
    sv: 'nis2-boten-sanktioner-sverige',
    en: { slug: 'nis2-fines-sanctions', title: 'NIS2 Fines and Sanctions: What Your Organisation Risks' },
    da: { slug: 'nis2-boeder-sanktioner', title: 'NIS2-bøder og sanktioner: Hvad din virksomhed risikerer' },
    no: { slug: 'nis2-boeter-sanksjoner', title: 'NIS2-bøter og sanksjoner: Hva organisasjonen din risikerer' },
    it: { slug: 'nis2-sanzioni-multe', title: 'Sanzioni e Multe NIS2: Cosa Rischia la Tua Organizzazione' },
    angle: 'Full breakdown of the sanction regime: administrative fines, temporary bans, supervisory orders. Real-world scenarios for a mid-size company. How are fines calculated? What triggers an investigation?'
  },
  {
    sv: 'nis2-boten-konsekvenser-sverige',
    en: { slug: 'nis2-fine-consequences', title: 'NIS2 Fine Consequences: Real-World Impact on Your Business' },
    da: { slug: 'nis2-boede-konsekvenser', title: 'NIS2-bødekonsekvenser: Reel indvirkning på din virksomhed' },
    no: { slug: 'nis2-boetekonsekvenser', title: 'NIS2-bøtekonsekvenser: Reell påvirkning på bedriften din' },
    it: { slug: 'nis2-conseguenze-sanzioni', title: 'Conseguenze delle Sanzioni NIS2: Impatto Reale sulla Tua Azienda' },
    angle: 'Beyond the fine itself: reputational damage, customer churn, director disqualification, insurance implications, share price impact. Case-based storytelling with fictional mid-market company scenarios.'
  },
  {
    sv: 'nis2-riskanalys-styrelsen-maste-godkanna',
    en: { slug: 'nis2-risk-analysis-board-approval', title: 'NIS2 Risk Analysis: What the Board Must Formally Approve' },
    da: { slug: 'nis2-risikoanalyse-bestyrelsen-skal-godkende', title: 'NIS2-risikoanalyse: Hvad bestyrelsen skal godkende formelt' },
    no: { slug: 'nis2-risikoanalyse-styret-maa-godkjenne', title: 'NIS2-risikoanalyse: Hva styret må godkjenne formelt' },
    it: { slug: 'nis2-analisi-rischio-approvazione-cda', title: 'Analisi del Rischio NIS2: Cosa Deve Approvare Formalmente il CdA' },
    angle: 'Article 21 requires management bodies to approve security measures. What does this mean in practice? What documents need board sign-off? How is this different from delegating to IT? Board meeting agenda template included.'
  },
  {
    sv: 'nis2-leverantorskedjan-risk',
    en: { slug: 'nis2-supply-chain-risk', title: 'NIS2 Supply Chain Risk: Vendor Security Requirements Explained' },
    da: { slug: 'nis2-forsyningskaede-risiko', title: 'NIS2 og forsyningskæderisiko: Krav til leverandørsikkerhed' },
    no: { slug: 'nis2-forsyningskjede-risiko', title: 'NIS2 og forsyningskjedefare: Krav til leverandørsikkerhet' },
    it: { slug: 'nis2-rischio-catena-fornitura', title: 'NIS2 e il Rischio nella Catena di Fornitura: Requisiti per i Fornitori' },
    angle: 'NIS2 Article 21(2)(d): supply chain security is mandatory. What does this require? How to assess vendors? What contractual clauses are needed? Fictional scenario: breach via a small IT vendor who had no MFA.'
  },
  {
    sv: 'nis2-compliance-checklista-sverige',
    en: { slug: 'nis2-compliance-checklist', title: 'NIS2 Compliance Checklist: Is Your Organisation Ready?' },
    da: { slug: 'nis2-compliance-tjekliste', title: 'NIS2 compliance-tjekliste: Er din virksomhed klar?' },
    no: { slug: 'nis2-compliance-sjekkliste', title: 'NIS2 compliance-sjekkliste: Er organisasjonen din klar?' },
    it: { slug: 'nis2-checklist-conformita', title: 'Checklist di Conformità NIS2: La Tua Organizzazione è Pronta?' },
    angle: 'Actionable checklist covering all Article 21 requirements: governance, risk management, incident handling, supply chain, access control, encryption, backups, training. Self-assessment scoring included.'
  },
  {
    sv: 'nis2-cyberstrategi-sverige-basta-praxis',
    en: { slug: 'nis2-cyber-strategy-best-practices', title: 'NIS2 Cyber Strategy: Best Practices for Boards and CEOs' },
    da: { slug: 'nis2-cyberstrategi-bedste-praksis', title: 'NIS2-cyberstrategi: Bedste praksis for bestyrelser og direktører' },
    no: { slug: 'nis2-cyberstrategi-beste-praksis', title: 'NIS2-cyberstrategi: Beste praksis for styrer og direktører' },
    it: { slug: 'nis2-strategia-cyber-migliori-pratiche', title: 'Strategia Cyber NIS2: Migliori Pratiche per CdA e CEO' },
    angle: 'How to build a board-level cybersecurity strategy that satisfies NIS2. Key components: risk appetite statement, security KPIs for the board, quarterly review cadence, escalation triggers. Not a technical guide — a governance guide.'
  },
  {
    sv: 'nis2-deadline-ar-din-organisation-redo',
    en: { slug: 'nis2-deadline-is-your-organisation-ready', title: 'NIS2 Is Already in Force: Is Your Organisation Ready?' },
    da: { slug: 'nis2-deadline-er-din-virksomhed-klar', title: 'NIS2 er allerede i kraft: Er din virksomhed klar?' },
    no: { slug: 'nis2-frist-er-organisasjonen-din-klar', title: 'NIS2 nærmer seg: Er organisasjonen din klar?' },
    it: { slug: 'nis2-scadenza-organizzazione-pronta', title: 'NIS2 è già in Vigore: La Tua Organizzazione è Pronta?' },
    angle: 'Urgency article. The law is in force (or approaching for Norway). What does "not ready" look like in practice? Three company profiles: fully ready, partially ready, not started. What are the immediate risks of delay?'
  },
  {
    sv: 'nis2-essential-vs-important-sverige',
    en: { slug: 'nis2-essential-vs-important-entities', title: 'NIS2 Essential vs Important Entities: Which Category Are You?' },
    da: { slug: 'nis2-vaesntlige-vs-vigtige-enheder', title: 'NIS2 væsentlige vs. vigtige enheder: Hvilken kategori er du?' },
    no: { slug: 'nis2-vesentlige-vs-viktige-enheter', title: 'NIS2 vesentlige vs. viktige enheter: Hvilken kategori tilhører du?' },
    it: { slug: 'nis2-soggetti-essenziali-vs-importanti', title: 'NIS2 Soggetti Essenziali vs Importanti: In Quale Categoria Rientri?' },
    angle: 'Clear comparison of Essential vs Important entity obligations: stricter proactive supervision for essential, reactive for important. Thresholds explained. How to register with the national authority. What the category means for your compliance burden.'
  },
  {
    sv: 'nis2-hotintelligens-standarder-sverige',
    en: { slug: 'nis2-threat-intelligence-standards', title: 'NIS2 Threat Intelligence: Standards and Requirements' },
    da: { slug: 'nis2-trusselsefterretning-standarder', title: 'NIS2-trusselsefterretning: Standarder og krav' },
    no: { slug: 'nis2-trusseletterretning-standarder', title: 'NIS2-trusseletterretning: Standarder og krav' },
    it: { slug: 'nis2-threat-intelligence-standard', title: 'NIS2 Threat Intelligence: Standard e Requisiti' },
    angle: 'What does NIS2 require on threat intelligence? How does threat sharing work between companies and the national authority? What standards apply (MITRE ATT&CK, STIX/TAXII)? Written for CEOs, not analysts — focus on what to budget for and what to ask vendors.'
  },
  {
    sv: 'nis2-implementeringstidslinje-sverige',
    en: { slug: 'nis2-implementation-timeline', title: 'NIS2 Implementation Timeline: Your Step-by-Step Plan' },
    da: { slug: 'nis2-implementeringstidslinje', title: 'NIS2-implementeringstidslinje: Din trin-for-trin plan' },
    no: { slug: 'nis2-implementeringstidslinje', title: 'NIS2-implementeringstidslinje: Din steg-for-steg-plan' },
    it: { slug: 'nis2-piano-implementazione', title: 'Piano di Implementazione NIS2: La Tua Roadmap Passo per Passo' },
    angle: '12-month implementation roadmap: Month 1–2 gap analysis, Month 3–4 governance setup, Month 5–7 technical controls, Month 8–9 supply chain review, Month 10–11 training, Month 12 mock audit. Realistic for a 50–500 employee company.'
  },
  {
    sv: 'nis2-leverantorssakerhet-krav-sverige',
    en: { slug: 'nis2-vendor-security-requirements', title: 'NIS2 Vendor Security Requirements: What to Demand from Suppliers' },
    da: { slug: 'nis2-leverandoersikkerhed-krav', title: 'NIS2-leverandørsikkerhed: Hvad du skal kræve af dine leverandører' },
    no: { slug: 'nis2-leverandoersikkerhet-krav', title: 'NIS2-leverandørsikkerhet: Hva du bør kreve av leverandørene' },
    it: { slug: 'nis2-requisiti-sicurezza-fornitori', title: 'Requisiti di Sicurezza NIS2 per i Fornitori: Cosa Esigere dai Tuoi Partner' },
    angle: 'Specific vendor security requirements under NIS2: contractual clauses, security questionnaire essentials, right-to-audit clauses, incident notification obligations for vendors. Template clause language included.'
  },
  {
    sv: 'nis2-revisionsfoerberedelse-sverige',
    en: { slug: 'nis2-audit-preparation', title: 'NIS2 Audit Preparation: How to Get Ready for Supervisory Review' },
    da: { slug: 'nis2-revisionsforberedelse', title: 'NIS2-revisionsforberedelse: Sådan forbereder du dig til tilsynsgennemgang' },
    no: { slug: 'nis2-revisjonsforberedelse', title: 'NIS2-revisjonsforberedelse: Slik forbereder du deg til tilsynsgjennomgang' },
    it: { slug: 'nis2-preparazione-audit', title: 'Preparazione all\'Audit NIS2: Come Prepararsi alla Verifica dell\'ACN' },
    angle: 'What happens during a NIS2 supervisory review? What documentation is requested? Who from the organisation must be available? Mock audit checklist. How to present security posture credibly to the authority.'
  },
  {
    sv: 'nis2-riskhantering-ramverk-sverige',
    en: { slug: 'nis2-risk-management-framework', title: 'NIS2 Risk Management Framework: A Board-Level Guide' },
    da: { slug: 'nis2-risikostyring-rammevaerk', title: 'NIS2-risikostyringsramme: En vejledning på bestyrelsesniveau' },
    no: { slug: 'nis2-risikostyring-rammeverk', title: 'NIS2-risikostyringsrammeverk: En veiledning på styrenivå' },
    it: { slug: 'nis2-framework-gestione-rischio', title: 'Framework di Gestione del Rischio NIS2: Una Guida per il CdA' },
    angle: 'How to build a NIS2-compliant risk management framework. ISO 27001 alignment, ENISA guidelines, risk register structure, residual risk acceptance. Written for boards who must approve the framework — not for the CISO who builds it.'
  },
  {
    sv: 'nis2-sakerhetsatgarder-obligatoriska-krav',
    en: { slug: 'nis2-mandatory-security-measures', title: 'NIS2 Mandatory Security Measures: The Complete Requirements List' },
    da: { slug: 'nis2-obligatoriske-sikkerhedsforanstaltninger', title: 'NIS2 obligatoriske sikkerhedsforanstaltninger: Den komplette kravliste' },
    no: { slug: 'nis2-obligatoriske-sikkerhetstiltak', title: 'NIS2 obligatoriske sikkerhetstiltak: Den komplette kravlisten' },
    it: { slug: 'nis2-misure-sicurezza-obbligatorie', title: 'Misure di Sicurezza Obbligatorie NIS2: L\'Elenco Completo dei Requisiti' },
    angle: 'Article 21 paragraph-by-paragraph breakdown: all 10 mandatory security measures explained in plain language. For each: what it means, what evidence the auditor will look for, what a minimum viable implementation looks like.'
  },
  {
    sv: 'nis2-tillsyn-ncsc-msb-sverige',
    en: { slug: 'nis2-supervision-ncsc-ireland', title: 'NIS2 Supervision in Ireland: How NCSC Ireland Enforces Compliance' },
    da: { slug: 'nis2-tilsyn-cfcs-danmark', title: 'NIS2-tilsyn i Danmark: Sådan håndhæver CFCS overholdelse' },
    no: { slug: 'nis2-tilsyn-nsm-norge', title: 'NIS2-tilsyn i Norge: Slik håndhever NSM etterlevelse' },
    it: { slug: 'nis2-supervisione-acn-italia', title: 'Supervisione NIS2 in Italia: Come l\'ACN Applica la Conformità' },
    angle: 'Deep dive on how the national supervisory authority works: proactive vs reactive supervision, what triggers an investigation, what powers the authority has, how enforcement escalates from warning to fine to temporary management ban.'
  },
  {
    sv: 'nis2-viktiga-tjanster-krav-sverige',
    en: { slug: 'nis2-essential-services-requirements', title: 'NIS2 Essential Services Requirements: What Operators Must Do' },
    da: { slug: 'nis2-vigtige-tjenester-krav', title: 'NIS2 krav til vigtige tjenester: Hvad operatører skal gøre' },
    no: { slug: 'nis2-viktige-tjenester-krav', title: 'NIS2-krav til viktige tjenester: Hva operatører må gjøre' },
    it: { slug: 'nis2-requisiti-servizi-essenziali', title: 'Requisiti NIS2 per i Servizi Essenziali: Cosa Devono Fare gli Operatori' },
    angle: 'Specific obligations for operators of essential services: registration, security requirements, incident reporting, supervisory cooperation. How this differs from general NIS2 compliance. What "essential service" means in the national context.'
  },
  {
    sv: 'nis2-vs-gdpr-skillnaden',
    en: { slug: 'nis2-vs-gdpr-differences', title: 'NIS2 vs GDPR: The Key Differences Every Board Must Know' },
    da: { slug: 'nis2-vs-gdpr-forskellene', title: 'NIS2 vs. GDPR: De vigtigste forskelle enhver bestyrelse skal kende' },
    no: { slug: 'nis2-vs-gdpr-forskjellene', title: 'NIS2 vs. GDPR: De viktigste forskjellene ethvert styre må kjenne til' },
    it: { slug: 'nis2-vs-gdpr-differenze', title: 'NIS2 vs GDPR: Le Differenze Chiave che Ogni CdA Deve Conoscere' },
    angle: 'Comparison table: scope, obligations, fines, enforcement body, personal liability. Key insight: NIS2 focuses on operational resilience while GDPR focuses on data protection — you can be GDPR-compliant and still fail NIS2. Dual obligation scenarios.'
  },
  {
    sv: 'microsoft-365-vs-google-workspace-sakerhet',
    en: { slug: 'microsoft-365-vs-google-workspace-security', title: 'Microsoft 365 vs Google Workspace: Security Comparison for NIS2' },
    da: { slug: 'microsoft-365-vs-google-workspace-sikkerhed', title: 'Microsoft 365 vs. Google Workspace: Sikkerhedssammenligning for NIS2' },
    no: { slug: 'microsoft-365-vs-google-workspace-sikkerhet', title: 'Microsoft 365 vs. Google Workspace: Sikkerhetssammenligning for NIS2' },
    it: { slug: 'microsoft-365-vs-google-workspace-sicurezza', title: 'Microsoft 365 vs Google Workspace: Confronto Sicurezza per NIS2' },
    angle: 'Objective comparison for the board who must decide which platform to standardise on. NIS2 compliance features: MFA, encryption, audit logging, DLP, incident response capabilities. Which covers more NIS2 Article 21 requirements out of the box?'
  },
  {
    sv: 'microsoft-azure-vs-aws-molnsakerhet',
    en: { slug: 'microsoft-azure-vs-aws-cloud-security', title: 'Microsoft Azure vs AWS: Cloud Security for NIS2 Compliance' },
    da: { slug: 'microsoft-azure-vs-aws-cloud-sikkerhed', title: 'Microsoft Azure vs. AWS: Cloud-sikkerhed til NIS2-overholdelse' },
    no: { slug: 'microsoft-azure-vs-aws-cloud-sikkerhet', title: 'Microsoft Azure vs. AWS: Skysikkerhet for NIS2-etterlevelse' },
    it: { slug: 'microsoft-azure-vs-aws-cloud-sicurezza', title: 'Microsoft Azure vs AWS: Sicurezza Cloud per la Conformità NIS2' },
    angle: 'Cloud platform comparison from a NIS2 perspective: data residency (EU/EEA), shared responsibility model, compliance certifications, incident response capabilities. Written for CEOs making cloud procurement decisions.'
  },
  {
    sv: 'microsoft-defender-vs-crowdstrike-endpoint',
    en: { slug: 'microsoft-defender-vs-crowdstrike-endpoint', title: 'Microsoft Defender vs CrowdStrike: Endpoint Security for NIS2' },
    da: { slug: 'microsoft-defender-vs-crowdstrike-endpoint', title: 'Microsoft Defender vs. CrowdStrike: Endpoint-sikkerhed til NIS2' },
    no: { slug: 'microsoft-defender-vs-crowdstrike-endpoint', title: 'Microsoft Defender vs. CrowdStrike: Endepunktsikkerhet for NIS2' },
    it: { slug: 'microsoft-defender-vs-crowdstrike-endpoint', title: 'Microsoft Defender vs CrowdStrike: Sicurezza Endpoint per NIS2' },
    angle: 'EDR/XDR comparison for NIS2 compliance: detection capabilities, incident response integration, reporting for audits, cost comparison. For the CEO who received two vendor quotes and needs to understand which is right for their size and sector.'
  },
  {
    sv: 'microsoft-intune-vs-vmware-workspace-mdm',
    en: { slug: 'microsoft-intune-vs-vmware-mdm', title: 'Microsoft Intune vs VMware Workspace ONE: MDM for NIS2 Compliance' },
    da: { slug: 'microsoft-intune-vs-vmware-mdm', title: 'Microsoft Intune vs. VMware Workspace ONE: MDM til NIS2-overholdelse' },
    no: { slug: 'microsoft-intune-vs-vmware-mdm', title: 'Microsoft Intune vs. VMware Workspace ONE: MDM for NIS2-etterlevelse' },
    it: { slug: 'microsoft-intune-vs-vmware-mdm', title: 'Microsoft Intune vs VMware Workspace ONE: MDM per la Conformità NIS2' },
    angle: 'Mobile device management comparison for NIS2 Article 21 device control requirements: compliance policies, Conditional Access integration, BYOD handling, audit reporting. Which solution fits a 50–500 person company better?'
  },
  {
    sv: 'microsoft-purview-vs-varonis-datastyrning',
    en: { slug: 'microsoft-purview-vs-varonis-data-governance', title: 'Microsoft Purview vs Varonis: Data Governance for NIS2 Compliance' },
    da: { slug: 'microsoft-purview-vs-varonis-datastyring', title: 'Microsoft Purview vs. Varonis: Datastyring til NIS2-overholdelse' },
    no: { slug: 'microsoft-purview-vs-varonis-datastyring', title: 'Microsoft Purview vs. Varonis: Datastyring for NIS2-etterlevelse' },
    it: { slug: 'microsoft-purview-vs-varonis-data-governance', title: 'Microsoft Purview vs Varonis: Data Governance per la Conformità NIS2' },
    angle: 'Data governance and DLP comparison under NIS2. Sensitivity labels, data classification, insider threat detection. Which tool gives more NIS2 compliance evidence? Trade-offs between depth and integration with existing Microsoft stack.'
  },
  {
    sv: 'microsoft-sentinel-vs-splunk-siem',
    en: { slug: 'microsoft-sentinel-vs-splunk-siem', title: 'Microsoft Sentinel vs Splunk: SIEM for NIS2 Compliance' },
    da: { slug: 'microsoft-sentinel-vs-splunk-siem', title: 'Microsoft Sentinel vs. Splunk: SIEM til NIS2-overholdelse' },
    no: { slug: 'microsoft-sentinel-vs-splunk-siem', title: 'Microsoft Sentinel vs. Splunk: SIEM for NIS2-etterlevelse' },
    it: { slug: 'microsoft-sentinel-vs-splunk-siem', title: 'Microsoft Sentinel vs Splunk: SIEM per la Conformità NIS2' },
    angle: 'SIEM comparison for NIS2 incident detection and logging requirements. Coverage, cost, integration, out-of-the-box NIS2 dashboards. For the CEO who must decide whether the €150k Splunk quote is justified vs a cloud-native alternative.'
  },
  {
    sv: 'microsoft-sharepoint-vs-box-dokumentsakerhet',
    en: { slug: 'microsoft-sharepoint-vs-box-document-security', title: 'Microsoft SharePoint vs Box: Document Security for NIS2' },
    da: { slug: 'microsoft-sharepoint-vs-box-dokumentsikkerhed', title: 'Microsoft SharePoint vs. Box: Dokumentsikkerhed til NIS2' },
    no: { slug: 'microsoft-sharepoint-vs-box-dokumentsikkerhet', title: 'Microsoft SharePoint vs. Box: Dokumentsikkerhet for NIS2' },
    it: { slug: 'microsoft-sharepoint-vs-box-sicurezza-documenti', title: 'Microsoft SharePoint vs Box: Sicurezza dei Documenti per NIS2' },
    angle: 'Document security platform comparison for NIS2: access control, encryption at rest/transit, audit logging, external sharing controls, data residency. Scenario: sensitive operational documentation that must be protected under NIS2.'
  },
  {
    sv: 'microsoft-teams-vs-slack-sakerhet',
    en: { slug: 'microsoft-teams-vs-slack-security', title: 'Microsoft Teams vs Slack: Communication Security Under NIS2' },
    da: { slug: 'microsoft-teams-vs-slack-sikkerhed', title: 'Microsoft Teams vs. Slack: Kommunikationssikkerhed under NIS2' },
    no: { slug: 'microsoft-teams-vs-slack-sikkerhet', title: 'Microsoft Teams vs. Slack: Kommunikasjonssikkerhet under NIS2' },
    it: { slug: 'microsoft-teams-vs-slack-sicurezza', title: 'Microsoft Teams vs Slack: Sicurezza delle Comunicazioni sotto NIS2' },
    angle: 'Collaboration platform comparison for NIS2: encryption, data residency, guest access controls, audit logging, integration with security stack. For the CEO who must choose or migrate platforms under NIS2 compliance pressure.'
  }
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function getArticleDir(c) {
  return path.join(FRONTEND_DIR, 'public', c.articleDir);
}

function getStyleGuide() {
  // Use Swedish reference article for HTML structure only
  const refFile = path.join(SV_ARTICLES_DIR, 'nis2-boten-sanktioner-sverige.html');
  return fs.existsSync(refFile) ? fs.readFileSync(refFile, 'utf-8') : '';
}

function slugVar(slug) {
  return slug.replace(/-/g, '_');
}

// ── Article generation ───────────────────────────────────────────────────────

async function generateArticle(topic, langKey) {
  const c = COUNTRY[langKey];
  const t = topic[langKey];
  const styleGuide = getStyleGuide();
  const today = new Date().toLocaleDateString(
    langKey === 'en' ? 'en-IE' : langKey === 'da' ? 'da-DK' : 'nb-NO',
    { year: 'numeric', month: 'long', day: 'numeric' }
  );
  const sv = slugVar(t.slug);

  // Language switcher HTML for nav
  const langSwitcher = `<div class="lang-switcher" style="display:flex;gap:8px;align-items:center;font-size:13px;font-family:'Poppins',sans-serif;">
  <a href="https://nis2klar.se/artiklar.html" style="color:#888;text-decoration:none;font-weight:600;padding:4px 8px;border-radius:3px;" title="Svenska">SV</a>
  <a href="https://nis2klar.se/en/articles.html" style="color:${langKey === 'en' ? '#f5c518' : '#888'};text-decoration:none;font-weight:600;padding:4px 8px;border-radius:3px;${langKey === 'en' ? 'background:rgba(245,197,24,0.1);' : ''}" title="English">EN</a>
  <a href="https://nis2klar.se/da/artikler.html" style="color:${langKey === 'da' ? '#f5c518' : '#888'};text-decoration:none;font-weight:600;padding:4px 8px;border-radius:3px;${langKey === 'da' ? 'background:rgba(245,197,24,0.1);' : ''}" title="Dansk">DA</a>
  <a href="https://nis2klar.se/no/artikler.html" style="color:${langKey === 'no' ? '#f5c518' : '#888'};text-decoration:none;font-weight:600;padding:4px 8px;border-radius:3px;${langKey === 'no' ? 'background:rgba(245,197,24,0.1);' : ''}" title="Norsk">NO</a>
  <a href="https://nis2klar.se/it/articoli.html" style="color:${langKey === 'it' ? '#f5c518' : '#888'};text-decoration:none;font-weight:600;padding:4px 8px;border-radius:3px;${langKey === 'it' ? 'background:rgba(245,197,24,0.1);' : ''}" title="Italiano">IT</a>
</div>`;

  const prompt = `${c.langPromptIntro}

ASSIGNMENT:
Write a complete HTML article with the title: "${t.title}"

ANGLE/FOCUS:
${topic.angle}

STYLE GUIDE — match this HTML structure and CSS exactly (copy the CSS section and nav structure verbatim, only change content and language):
${styleGuide}

REQUIREMENTS:
- Minimum 1200 words of body text (excluding HTML tags)
- Date: ${today}
- Target reader: CEO, board chair, board member — not a technical person
- Tone: professional, direct, slightly alarming but never panicking
- StoryBrand: reader is the hero, NIS2 is the challenge, we are the guide
- Personal liability must be mentioned concretely (not just in passing)
- Include at least: one .box-warning, one .box-info, and one .box-case
- Use country-specific authority names, law names, penalty amounts from the country context above — NOT Swedish authorities (not MSB, not NCSC-SE)
- lang attribute: <html lang="${langKey}">
- nav-logo: <a class="nav-logo" href="${c.homeUrl}">NIS2<span>Klar</span></a>
- nav-back: <a class="nav-back" href="${c.navBackHref}">${c.navBack}</a>
- After nav-back, add this language switcher in the nav: ${langSwitcher}
- Slug for this article: ${t.slug}

MICROSOFT TOOLS BOX (MANDATORY — place JUST BEFORE <div class="cta-section">):
Choose the right Microsoft product(s) based on the article topic:

${c.msToolsTable}

HTML for the box:
<div class="box-info" style="margin: 48px 0 32px;">
  <div style="font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color: var(--yellow); margin-bottom:10px;">${c.toolsLabel}</div>
  <p style="margin:0; font-size:17px; color: #ddd; line-height:1.7;">[Correct Microsoft product(s) from the table above + one sentence about certified Microsoft partner and free gap analysis]</p>
</div>

NEWSLETTER SECTION (place JUST BEFORE cta-section):
Replace all instances of SLUG below with: ${sv}

<div style="background:#111; border:1px solid rgba(255,255,255,0.1); border-left:3px solid #f5c518; border-radius:4px; padding:32px 36px; margin:40px 0 0; text-align:center; max-width:760px; margin-left:auto; margin-right:auto;">
  <div style="font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:#f5c518; margin-bottom:12px;">📬 ${c.newsletter.badge}</div>
  <h3 style="font-family:'Poppins',sans-serif; font-size:20px; font-weight:800; margin:0 0 8px; color:#f0f0f0;">${c.newsletter.heading}</h3>
  <p style="color:#888; font-size:15px; margin:0 0 20px;">${c.newsletter.subtext}</p>
  <form id="nlForm-SLUG" onsubmit="submitNewsletter_SLUG(event)" style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center; max-width:460px; margin:0 auto;">
    <input type="email" id="nlEmail-SLUG" placeholder="${c.newsletter.placeholder}" required style="flex:1; min-width:200px; padding:12px 16px; background:#1c1c1f; border:1px solid rgba(255,255,255,0.15); border-radius:4px; color:#f0f0f0; font-size:15px; outline:none;" />
    <button type="submit" id="nlSubmit-SLUG" style="padding:12px 22px; background:#f5c518; color:#141416; font-weight:700; font-size:15px; border:none; border-radius:4px; cursor:pointer; white-space:nowrap;">${c.newsletter.button}</button>
  </form>
  <p style="font-size:12px; color:#555; margin:12px 0 0;">${c.newsletter.unsub}</p>
  <div id="nlThanks-SLUG" style="display:none; color:#4ade80; font-size:16px; font-weight:600; margin-top:14px;">${c.newsletter.thanks}</div>
</div>

Also add this JS just before </body>:
<script>
  async function submitNewsletter_SLUG(e) {
    e.preventDefault();
    const btn = document.getElementById('nlSubmit-SLUG');
    btn.disabled = true; btn.textContent = '...';
    const email = document.getElementById('nlEmail-SLUG').value.trim();
    try {
      const res = await fetch('/api/newsletter/subscribe', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, source: '${c.newsletter.source}-SLUG' }) });
      const data = await res.json();
      if (data.success) { document.getElementById('nlForm-SLUG').style.display='none'; document.getElementById('nlThanks-SLUG').style.display='block'; }
      else { btn.disabled=false; btn.textContent='${c.newsletter.button}'; }
    } catch { btn.disabled=false; btn.textContent='${c.newsletter.button}'; }
  }
</script>

CTA SECTION (comes AFTER newsletter):
- Heading: "${c.ctaHeading}"
- Subtext: "${c.ctaSubtext}"
- Button: <a href="/nis2.html#boka" class="btn-primary">${c.ctaButton}</a>
- Fine print: "${c.ctaFine}"

FOOTER CONTACT (first line after copyright in <footer>):
<a href="mailto:support@trustedmarketing.se">support@trustedmarketing.se</a> · <a href="tel:+46470597003">+46 470 59 70 03</a>

FOOTER DISCLAIMER (last in <footer>):
<p style="margin-top:12px; font-size:11px; color: #555; line-height:1.5;">${c.disclaimer}</p>

ARTICLE BODY TEXT: Keep the body text vendor-neutral (say "a SIEM tool" not "Microsoft Sentinel" in body text). Microsoft product names belong ONLY in the Tools box above.

IMPORTANT: Return ONLY valid HTML from <!DOCTYPE html> to </html>. Nothing else.`;

  console.log(`\n[${langKey}] Generating: ${t.slug}`);
  console.log(`[${langKey}] Title: ${t.title}`);

  let message;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8000,
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
    throw new Error('Response does not look like HTML: ' + html.slice(0, 100));
  }

  const outDir = getArticleDir(c);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, `${t.slug}.html`);
  fs.writeFileSync(outPath, html, 'utf-8');
  console.log(`[${langKey}] Saved: ${outPath}`);
  return outPath;
}

// ── Index generation ─────────────────────────────────────────────────────────

function generateIndex(langKey) {
  const c = COUNTRY[langKey];
  const dir = getArticleDir(c);
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.html')).sort();

  const cards = files.map(file => {
    const html = fs.readFileSync(path.join(dir, file), 'utf-8');
    const slug = file.replace('.html', '');
    const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1]?.replace(/\s*\|.*$/, '').trim() || slug;
    const desc = (html.match(/name="description" content="([^"]*)"/) || [])[1] || '';
    const category = (html.match(/class="article-category"[^>]*>([^<]+)</) || [])[1]?.trim() || 'NIS2';
    return { slug, title, desc, category };
  });

  const langSwitcherNav = `<div class="lang-switcher" style="display:flex;gap:8px;align-items:center;font-size:13px;font-family:'Poppins',sans-serif;">
    <a href="https://nis2klar.se/artiklar.html" style="color:#888;text-decoration:none;font-weight:600;padding:4px 8px;border-radius:3px;" title="Svenska">SV</a>
    <a href="https://nis2klar.se/en/articles.html" style="color:${langKey === 'en' ? '#f5c518' : '#888'};text-decoration:none;font-weight:600;padding:4px 8px;border-radius:3px;${langKey === 'en' ? 'background:rgba(245,197,24,0.1);' : ''}" title="English">EN</a>
    <a href="https://nis2klar.se/da/artikler.html" style="color:${langKey === 'da' ? '#f5c518' : '#888'};text-decoration:none;font-weight:600;padding:4px 8px;border-radius:3px;${langKey === 'da' ? 'background:rgba(245,197,24,0.1);' : ''}" title="Dansk">DA</a>
    <a href="https://nis2klar.se/no/artikler.html" style="color:${langKey === 'no' ? '#f5c518' : '#888'};text-decoration:none;font-weight:600;padding:4px 8px;border-radius:3px;${langKey === 'no' ? 'background:rgba(245,197,24,0.1);' : ''}" title="Norsk">NO</a>
    <a href="https://nis2klar.se/it/articoli.html" style="color:${langKey === 'it' ? '#f5c518' : '#888'};text-decoration:none;font-weight:600;padding:4px 8px;border-radius:3px;${langKey === 'it' ? 'background:rgba(245,197,24,0.1);' : ''}" title="Italiano">IT</a>
  </div>`;

  const cardHtml = cards.map(({ slug, title, desc, category }) => `
    <a class="card" href="/${c.articleDir}/${slug}.html">
      <div class="card-category">${category}</div>
      <h2>${title}</h2>
      <p>${desc}</p>
      <div class="card-arrow">${c.readMore}</div>
    </a>`).join('\n');

  const indexHtml = `<!DOCTYPE html>
<html lang="${langKey}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${c.indexTitle}</title>
  <meta name="description" content="${c.indexDesc}">
  <link rel="canonical" href="https://nis2klar.se/${c.indexFile}">
  <link rel="alternate" hreflang="sv" href="https://nis2klar.se/artiklar.html">
  <link rel="alternate" hreflang="en" href="https://nis2klar.se/en/articles.html">
  <link rel="alternate" hreflang="da" href="https://nis2klar.se/da/artikler.html">
  <link rel="alternate" hreflang="no" href="https://nis2klar.se/no/artikler.html">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;900&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root { --bg: #141416; --card: #1c1c1f; --yellow: #f5c518; --white: #f0f0f0; --muted: #888; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--white); font-family: 'Barlow', sans-serif; font-size: 18px; line-height: 1.7; }
    nav { display: flex; justify-content: space-between; align-items: center; padding: 20px 40px; border-bottom: 1px solid rgba(255,255,255,0.07); max-width: 1100px; margin: 0 auto; }
    .nav-logo { font-family: 'Poppins', sans-serif; font-weight: 900; font-size: 20px; color: var(--yellow); text-decoration: none; }
    .nav-logo span { color: var(--white); }
    .nav-right { display: flex; align-items: center; gap: 20px; }
    .nav-cta { background: var(--yellow); color: #000; padding: 8px 18px; border-radius: 4px; text-decoration: none; font-weight: 700; font-size: 14px; font-family: 'Poppins', sans-serif; }
    .hero { max-width: 1100px; margin: 0 auto; padding: 60px 40px 40px; }
    .hero h1 { font-family: 'Poppins', sans-serif; font-size: clamp(28px, 4vw, 42px); font-weight: 900; margin-bottom: 12px; }
    .hero p { color: var(--muted); font-size: 18px; max-width: 600px; }
    .grid { max-width: 1100px; margin: 0 auto; padding: 20px 40px 80px; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; }
    .card { background: var(--card); border: 1px solid rgba(255,255,255,0.07); border-radius: 6px; padding: 28px; text-decoration: none; color: inherit; display: flex; flex-direction: column; transition: border-color 0.2s, transform 0.15s; }
    .card:hover { border-color: rgba(245,197,24,0.4); transform: translateY(-2px); }
    .card-category { font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--yellow); margin-bottom: 12px; }
    .card h2 { font-family: 'Poppins', sans-serif; font-size: 18px; font-weight: 700; line-height: 1.35; margin-bottom: 12px; color: var(--white); }
    .card p { font-size: 15px; color: var(--muted); line-height: 1.6; flex: 1; }
    .card-arrow { margin-top: 20px; font-size: 14px; color: var(--yellow); font-weight: 600; }
    @media (max-width: 600px) { nav { padding: 16px 20px; } .hero { padding: 40px 20px 24px; } .grid { padding: 16px 20px 60px; } }
  </style>
</head>
<body>
  <nav>
    <a class="nav-logo" href="${c.homeUrl}">NIS2<span>Klar</span></a>
    <div class="nav-right">
      ${langSwitcherNav}
      <a class="nav-cta" href="${c.navCorp}">${c.navCta}</a>
    </div>
  </nav>
  <div class="hero">
    <h1>${c.heroH1}</h1>
    <p>${c.heroP}</p>
  </div>
  <div class="grid">
${cardHtml}
  </div>
</body>
</html>`;

  const indexPath = path.join(FRONTEND_DIR, 'public', c.indexFile);
  fs.writeFileSync(indexPath, indexHtml, 'utf-8');
  console.log(`[${langKey}] Rebuilt index — ${cards.length} articles`);
}

// ── Frontend rebuild ─────────────────────────────────────────────────────────

function rebuildFrontend(langKey) {
  console.log('\n[build] Rebuilding frontend...');
  generateIndex(langKey);
  execSync('npm run build', { cwd: FRONTEND_DIR, stdio: 'inherit' });
  console.log('[build] Done.');
}

// ── Queue status ─────────────────────────────────────────────────────────────

function listStatus(langKey) {
  const c = COUNTRY[langKey];
  const dir = getArticleDir(c);
  console.log(`\nArticle queue status [${langKey.toUpperCase()} — ${c.country}]:`);
  console.log('─'.repeat(70));
  for (const topic of TOPICS) {
    const t = topic[langKey];
    const exists = fs.existsSync(path.join(dir, `${t.slug}.html`));
    console.log(`${exists ? '✅ published' : '⏳ pending '}  ${t.slug}`);
  }
  const done = TOPICS.filter(t => fs.existsSync(path.join(dir, `${t[langKey].slug}.html`))).length;
  console.log('─'.repeat(70));
  console.log(`${done}/${TOPICS.length} published`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  const langArg = args.find(a => a.startsWith('--lang='));
  if (!langArg) {
    console.error('Usage: node generate_article_multilang.js --lang=en|da|no [--slug=X|--all|--list]');
    process.exit(1);
  }
  const langKey = langArg.replace('--lang=', '');
  if (!COUNTRY[langKey]) {
    console.error(`Unknown language: ${langKey}. Use en, da, or no.`);
    process.exit(1);
  }

  const c = COUNTRY[langKey];
  const dir = getArticleDir(c);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Also ensure parent lang dir has an index redirect
  const langDir = path.join(FRONTEND_DIR, 'public', langKey);
  if (!fs.existsSync(langDir)) fs.mkdirSync(langDir, { recursive: true });

  if (args.includes('--list')) {
    listStatus(langKey);
    return;
  }

  const slugArg = args.find(a => a.startsWith('--slug='));
  if (slugArg) {
    const slug = slugArg.replace('--slug=', '');
    const topic = TOPICS.find(t => t[langKey].slug === slug);
    if (!topic) {
      console.error(`Unknown slug for ${langKey}: ${slug}`);
      console.log('Available slugs:');
      TOPICS.forEach(t => console.log(' ', t[langKey].slug));
      process.exit(1);
    }
    await generateArticle(topic, langKey);
    rebuildFrontend(langKey);
    return;
  }

  if (args.includes('--all')) {
    const pending = TOPICS.filter(t => !fs.existsSync(path.join(dir, `${t[langKey].slug}.html`)));
    console.log(`[${langKey}] Generating ${pending.length} pending articles...`);
    for (const topic of pending) {
      await generateArticle(topic, langKey);
      await new Promise(r => setTimeout(r, 8000));
    }
    rebuildFrontend(langKey);
    listStatus(langKey);
    return;
  }

  // Default: next pending
  const next = TOPICS.find(t => !fs.existsSync(path.join(dir, `${t[langKey].slug}.html`)));
  if (!next) {
    console.log(`[${langKey}] All articles published — nothing to do.`);
    listStatus(langKey);
    return;
  }
  await generateArticle(next, langKey);
  rebuildFrontend(langKey);
}

main().catch(err => {
  console.error('[multilang] Error:', err.message);
  process.exit(1);
});
