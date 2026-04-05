'use strict';
/**
 * NIS2Klar Article Generator
 *
 * Generates Swedish NIS2 articles in StoryBrand style with personal liability framing.
 * Saves to frontend/public/artiklar/ and rebuilds frontend.
 *
 * Usage:
 *   node scripts/generate_article.js           # generates next unpublished article
 *   node scripts/generate_article.js --all     # generates all 10 (for initial batch)
 *   node scripts/generate_article.js --list    # shows topic queue status
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ARTICLES_DIR = path.join(__dirname, '../../frontend/public/artiklar');
const FRONTEND_DIR = path.join(__dirname, '../../frontend');

// Topic queue — slug, title, angle
const TOPICS = [
  // ── Batch 1: Published ──
  {
    slug: 'nis2-vad-ar-nis2-direktivet',
    title: 'Vad är NIS2-direktivet? En guide för svenska företag',
    angle: 'Intro-artikel som förklarar NIS2 för en icke-teknisk VD eller styrelseledamot. Fokus: varför NIS2 finns, vad det kräver på hög nivå, och vad som händer om man ignorerar det. StoryBrand: läsaren är hjälten som riskerar att vara oförberedd.'
  },
  {
    slug: 'nis2-personligt-ansvar-styrelse',
    title: 'NIS2 och styrelsens personliga ansvar — det ingen vill prata om',
    angle: 'Djupdykning i det personliga ansvaret för VD och styrelseledamöter. Konkreta scenarier: hur ser ett tillsynsärende ut, kan man bli av med sitt uppdrag, vad är skillnaden mot GDPR-ansvar. Skrämmande men sakligt.'
  },
  {
    slug: 'nis2-vilka-foretag-omfattas',
    title: 'Vilka företag måste följa NIS2? Kolla om ditt faller inom lagen',
    angle: 'Praktisk guide: Essential vs Important entities, tröskelvärdena, sektorer. Inkludera ett enkelt test i form av frågor läsaren kan svara ja/nej på.'
  },
  {
    slug: 'nis2-incidentrapportering-24-timmar',
    title: '24 timmar på sig: Så rapporterar du en NIS2-incident rätt',
    angle: 'Berättelseformat: ett fiktivt företag drabbas av ransomware kl 03:00. Vad måste göras inom 24h, 72h, 30 dagar? Praktisk tidslinje med checkboxar.'
  },
  {
    slug: 'nis2-tekniska-sakerhetsatgarder',
    title: 'NIS2-kraven på teknisk säkerhet — vad lagen faktiskt kräver',
    angle: 'Bryt ner Article 21 i NIS2 till svenska för en styrelseledamot som ska förstå vad IT-chefen gör (eller inte gör).'
  },
  {
    slug: 'nis2-leverantorskedjan-risk',
    title: 'Din leverantör kan fälla dig: NIS2 och leverantörskedjans säkerhet',
    angle: 'Fokus på supply chain-ansvar. Du ansvarar för dina leverantörers säkerhet. Vad måste du kräva? SolarWinds, Kaseya som exempel.'
  },
  {
    slug: 'nis2-vs-gdpr-skillnaden',
    title: 'NIS2 vs GDPR: Det här är skillnaden (och varför du inte kan välja)',
    angle: 'Jämförelseartiklar presterar bra SEO. GDPR = persondata, NIS2 = kritisk infrastruktur. De överlappar. Du måste följa båda. Tabellformat.'
  },
  {
    slug: 'nis2-tillsyn-ncsc-msb-sverige',
    title: 'NIS2-tillsyn i Sverige: NCSC, MSB och vem som kontrollerar dig',
    angle: 'Vem granskar vad? NCSC, MSB, sektorsspecifika tillsynsmyndigheter. Hur ser en granskning ut?'
  },
  {
    slug: 'nis2-riskanalys-styrelsen-maste-godkanna',
    title: 'Riskanalysen styrelsen måste godkänna — och förstå',
    angle: 'NIS2 kräver att styrelsen aktivt godkänner riskhantering. Vad ingår? Hur presenteras den? Vad händer om styrelsen inte förstår vad de skriver under?'
  },
  {
    slug: 'nis2-deadline-ar-din-organisation-redo',
    title: 'NIS2-deadline: Är din organisation redo — eller köper du tid?',
    angle: 'Urgency-artikel. Direktivet gäller nu. Hur lång tid tar implementering? Vad kostar det att börja för sent? Tre konkreta första steg.'
  },
  // ── Batch 2+: Mixed NIS2 / Microsoft (3:2 pattern) ──
  {
    slug: 'nis2-compliance-checklista-sverige',
    title: 'NIS2 Compliance-checklista för Sverige: Komplett guide för viktiga tjänster',
    angle: 'Praktisk checklista för svenska organisationer som måste följa NIS2. Täck de viktigaste efterlevnadskraven: registrering, riskanalys, säkerhetsåtgärder, incidentrapportering, leverantörsgranskning. Format: checkboxar med förklaring. Riktat till VD/styrelseledamot. Personligt ansvar löper som röd tråd.'
  },
  {
    slug: 'nis2-viktiga-tjanster-krav-sverige',
    title: 'Viktiga tjänster under NIS2: Fullständiga krav för svenska verksamheter',
    angle: 'Fokus på \'important entities\' i Sverige — skilj dem från \'essential entities\'. Vad är skillnaden i tillsynsnivå och sanktioner? Vilka svenska sektorer klassas som viktiga tjänster? Fiktivt scenario: medelstort logistikbolag som inte visste att de var klassade som viktig entitet.'
  },
  {
    slug: 'nis2-incidentrapportering-72-timmar-sverige',
    title: 'NIS2-incidentrapportering i Sverige: 72-timmarsregeln steg för steg',
    angle: 'Djupdykning i 72-timmarsrapporteringen specifikt för Sverige. Till vilken myndighet? Vad ska rapporten innehålla? Skillnaden mellan 24h tidig varning och 72h rapport. Vad händer om ni missar fristen?'
  },
  {
    slug: 'microsoft-365-vs-google-workspace-säkerhet',
    title: 'Microsoft 365 vs Google Workspace: Vilket är bättre för NIS2-säkerhet?',
    angle: 'Jämförelse av säkerhetsfunktioner ur NIS2-perspektiv. Loggning, DLP, MFA, åtkomstkontroll. Vad täcker Microsoft 365 E5 som G Suite inte gör? Vad är relevant för en organisation som ska uppfylla NIS2? Köpguide utan teknisk jargong för en VD/CFO som ska fatta beslut.'
  },
  {
    slug: 'microsoft-defender-vs-crowdstrike-endpoint',
    title: 'Microsoft Defender vs CrowdStrike: Endpoint-skydd för NIS2-efterlevnad',
    angle: 'Jämförelse av Microsoft Defender for Endpoint och CrowdStrike Falcon ur NIS2-perspektiv. Täckning, detekteringsförmåga, MSSP-integration. Vad är relevant för en organisation under NIS2? Kostnadsanalys. Vilken vinner för en medelstort svensk organisation?'
  },
  {
    slug: 'nis2-riskhantering-ramverk-sverige',
    title: 'NIS2 Riskhanteringsramverk för Sverige: Implementeringssteg för styrelsen',
    angle: 'Steg-för-steg guide för att bygga ett NIS2-kompatibelt riskhanteringsramverk. Vad kräver Artikel 21? Hur dokumenteras riskbedömningar? Rollfördelning: styrelse vs VD vs CISO vs IT. Svenska tillsynsmyndigheters förväntningar.'
  },
  {
    slug: 'nis2-sakerhetsatgarder-obligatoriska-krav',
    title: 'NIS2 Säkerhetsåtgärder i Sverige: Obligatoriska tekniska och organisatoriska krav',
    angle: 'Bryt ner Artikel 21:s åtta obligatoriska säkerhetsåtgärdsområden för en svensk styrelse. Frågor styrelsen ska kunna ställa till IT-chefen för varje område. MSB:s vägledning.'
  },
  {
    slug: 'nis2-cyberstrategi-sverige-basta-praxis',
    title: 'Cybersäkerhetsstrategi under NIS2: Bästa praxis för svenska organisationer',
    angle: 'Hur bygger en svensk organisation en hållbar cybersäkerhetsstrategi som uppfyller NIS2? Skillnaden mellan teknisk säkerhet och strategisk efterlevnad. Vad en NIS2-strategi faktiskt innehåller.'
  },
  {
    slug: 'microsoft-sentinel-vs-splunk-siem',
    title: 'Microsoft Sentinel vs Splunk: SIEM-plattformar för NIS2-loggning',
    angle: 'NIS2 kräver logghantering och incidentdetektering. Sentinel vs Splunk — vad är skillnaden? Kostnader, komplexitet, integrationsmöjligheter. Vad passar en organisation med 100–1000 anställda? Vad kräver en tillsynsmyndighet av er SIEM-lösning?'
  },
  {
    slug: 'microsoft-purview-vs-varonis-datastyrning',
    title: 'Microsoft Purview vs Varonis: Datastyrning och NIS2-dataskydd',
    angle: 'Datastyrning är en del av NIS2:s krav på informationssäkerhet. Microsoft Purview vs Varonis — vad täcker vardera? Klassificering av känsliga data, åtkomstkontroll, DLP. Vad är relevant för NIS2 och vad är överkurs?'
  },
  {
    slug: 'nis2-revisionsfoerberedelse-sverige',
    title: 'Förbered er för NIS2-tillsyn i Sverige: Nödvändiga steg inför granskning',
    angle: 'Vad ska finnas på plats när tillsynsmyndigheten hör av sig? \'Revision-ready checklista\' med 12 punkter. Fiktivt scenario: organisation som fick 21 dagars frist och vad de lyckades och misslyckades leverera.'
  },
  {
    slug: 'nis2-boten-konsekvenser-sverige',
    title: 'NIS2-böter i Sverige: Vad kostar bristande efterlevnad egentligen?',
    angle: 'Sanktionsnivåerna: 10 MEUR för essential entities, 7 MEUR för important entities. Hur beräknas böterna i Sverige? Vilken myndighet beslutar? Faktorer som påverkar bötesnivån. Totalkostnaden är långt mer än bara böterna.'
  },
  {
    slug: 'nis2-implementeringstidslinje-sverige',
    title: 'NIS2-implementering i Sverige: Realistisk tidslinje och vad som gäller nu',
    angle: 'NIS2-lagen gäller nu. Hur lång tid tar en realistisk implementering? Varför \'vi börjar nästa kvartal\' är riskabelt. Tidslinje med fem faser. Personligt ansvar ökar för varje månad utan dokumenterade åtgärder.'
  },
  {
    slug: 'microsoft-intune-vs-vmware-workspace-mdm',
    title: 'Microsoft Intune vs VMware Workspace ONE: MDM och NIS2-enhetskontroll',
    angle: 'NIS2 kräver kontroll över enheter som ansluter till era system. MDM (Mobile Device Management) är en del av lösningen. Intune vs Workspace ONE — för- och nackdelar. Vad är miniminivå för NIS2? Bring Your Own Device (BYOD) och NIS2-risker.'
  },
  {
    slug: 'microsoft-azure-vs-aws-molnsäkerhet',
    title: 'Microsoft Azure vs AWS: Molnsäkerhet och NIS2-efterlevnad i molnet',
    angle: 'För en organisation som väljer molninfrastruktur: Azure vs AWS ur NIS2-perspektiv. Datalokaliseringsregler (EU-data i EU?), certifieringar (ISO 27001, SOC 2), shared responsibility. Vad skiljer dem ur ett tillsynsperspektiv?'
  },
  {
    slug: 'nis2-essential-vs-important-sverige',
    title: 'Essential vs Important Entities under NIS2: Vilket är ditt svenska företag?',
    angle: 'Tydlig guide med konkreta tröskelvärden. Gå igenom alla 18 sektorer. Inkludera ett självtest: \'Är vi essential eller important?\' med fem ja/nej-frågor.'
  },
  {
    slug: 'nis2-leverantorssakerhet-krav-sverige',
    title: 'Leverantörskedjans säkerhet under NIS2 i Sverige: Krav och leverantörsbedömning',
    angle: 'Sverige-specifik guide för leverantörskrav. Vilka leverantörer måste bedömas? MSB:s riktlinjer. Fiktivt scenario: ett vanligt SaaS-verktyg drabbas av intrång — vad är ert ansvar?'
  },
  {
    slug: 'nis2-hotintelligens-standarder-sverige',
    title: 'Cyber Threat Intelligence och NIS2 i Sverige: Vad lagen kräver av er hotbevakning',
    angle: 'Vad innebär proaktiv hothantering för en svensk organisation utan dedikerat SOC? Minimum: hotbevakning, patchningscykel, sårbarhetsskanning. MSB:s hotrapporter som startpunkt.'
  },
  {
    slug: 'microsoft-teams-vs-slack-säkerhet',
    title: 'Microsoft Teams vs Slack: Enterprise-säkerhet och NIS2-efterlevnad',
    angle: 'Kommunikationsplattformar hanterar känslig information. Teams vs Slack ur NIS2-perspektiv: kryptering, loggning, åtkomstkontroll, datalagring. Vad kräver NIS2 av er kommunikationsplattform? Vad är skillnaden i säkerhetsnivå?'
  },
  {
    slug: 'microsoft-sharepoint-vs-box-dokumentsäkerhet',
    title: 'Microsoft SharePoint vs Box: Dokumenthantering och NIS2-informationssäkerhet',
    angle: 'Dokument och filer innehåller ofta känslig information. SharePoint vs Box ur NIS2-perspektiv. Åtkomstkontroll, versionshistorik, extern delning, DLP. Vad är relevant för NIS2? Vad kräver en tillsynsmyndighet av er dokumenthantering?'
  },
  {
    slug: 'nis2-driftskontinuitet-sverige',
    title: 'Driftskontinuitet och NIS2 i Sverige: Ramverk för backup och återhämtning',
    angle: 'Artikel 21 kräver business continuity och disaster recovery. RTO och RPO. Fiktivt scenario: backup finns men testas aldrig, återhämtning tar 9 dagar istället för planerade 24 timmar.'
  },
  {
    slug: 'nis2-utbildningskrav-anstallda-certifiering',
    title: 'NIS2-utbildning i Sverige: Vad krävs av anställda och ledning — och vad räknas?',
    angle: 'Artikel 20 kräver att ledningsorganet genomgår utbildning. Vad räknas? En halvdag, en heldagskurs? Vad dokumenteras? Vanliga misstag: generisk IT-säkerhetsutbildning som inte är NIS2-specifik.'
  },
  {
    slug: 'nis2-dokumentationskrav-mallar-sverige',
    title: 'NIS2-dokumentation i Sverige: Vad som krävs och vilka mallar som hjälper',
    angle: 'Sju nyckelkategorier av dokumentation. Hur arkiveras och uppdateras dokumentationen? Tillsynsmyndighetens vanligaste dokumentationsbegäran. Enkel mallstruktur att anpassa.'
  },
  {
    slug: 'microsoft-entra-id-vs-okta-identitetshantering',
    title: 'Microsoft Entra ID vs Okta: Identitetshantering för NIS2-åtkomstkontroll',
    angle: 'Identitetshantering är kärnan i NIS2:s åtkomstkontrollkrav. Entra ID (tidigare Azure AD) vs Okta. MFA, SSO, conditional access. Vad täcker vardera? Vad är relevant för NIS2? Migrationsöverväganden för organisation med befintlig Microsoft-miljö.'
  },
  {
    slug: 'microsoft-defender-vs-symantec-dlp',
    title: 'Microsoft Defender vs Symantec: Dataskydd och DLP under NIS2',
    angle: 'Dataförlustskydd (DLP) är relevant under NIS2 för att förhindra att känslig data lämnar organisationen. Defender Information Protection vs Symantec DLP. Vad täcker vardera? Integrationsmöjligheter med befintlig Microsoft-miljö.'
  },
  {
    slug: 'nis2-cyberstyrning-styrelseansvar-sverige',
    title: 'Cyberstyrning under NIS2 i Sverige: Styrelsens konkreta ansvar',
    angle: 'Artikel 20 i detalj: godkänna, utbilda, övervaka. Vad innebär \'aktivt ledningsansvar\' i praktiken? Konkreta styrelsebeslut som måste fattas och protokollföras.'
  },
  {
    slug: 'nis2-tredjepartsrisk-leverantorsbedömning-sverige',
    title: 'NIS2 och tredjepartsrisk i Sverige: Guide för leverantörsbedömning',
    angle: 'Steg 1–5: identifiera kritiska leverantörer, riskklassificera, skicka säkerhetsfrågeformulär, verifiera svar, uppdatera avtal. Fiktivt scenario: leverantör drabbas av ransomware som sprider sig till er.'
  },
  {
    slug: 'nis2-natverkssäkerhet-overvakning-krav',
    title: 'Nätverkssäkerhet och övervakning under NIS2 i Sverige: Vad är minimikravet?',
    angle: 'Segmentering, åtkomstkontroll, logghantering — vad måste finnas? Frågor VD/styrelse ska ställa till IT-chefen. Hur länge ska loggar sparas?'
  },
  {
    slug: 'microsoft-defender-vs-netskope-molnsäkerhet',
    title: 'Microsoft Defender vs Netskope: Cloud Security för NIS2',
    angle: 'Molnsäkerhet och CASB-funktionalitet. Defender for Cloud Apps vs Netskope. Insyn i SaaS-användning, DLP i molnet, hotskydd. Vad är relevant för NIS2? Guide för organisation med hybrid molnmiljö.'
  },
  {
    slug: 'servicenow-vs-microsoft-compliance-grc',
    title: 'ServiceNow vs Microsoft Compliance Manager: GRC-plattformar för NIS2',
    angle: 'GRC-verktyg för att hantera NIS2-efterlevnad. ServiceNow GRC vs Microsoft Compliance Manager. Vad är skillnaden? Vad automatiserar de? Kostnader. Vad passar en organisation med 200–2000 anställda som vill strukturera sin NIS2-dokumentation?'
  },
  {
    slug: 'nis2-kritisk-infrastruktur-skydd-sektorer',
    title: 'Kritisk infrastruktur och NIS2 i Sverige: Vilka sektorer omfattas och varför',
    angle: 'Genomgång av alla 18 NIS2-sektorer med fokus på de mest kritiska för Sverige: energi, transport, vatten, hälsovård, bank/finans. Vilka specifika tillsynsmyndigheter ansvarar?'
  },
  {
    slug: 'nis2-krishantering-responseforfaranden-sverige',
    title: 'NIS2-krishantering i Sverige: Vem gör vad under en cyberincident?',
    angle: 'Rollkarta: CISO, VD, kommunikationsansvarig, juridik, styrelse. Parallella spår: teknisk återhämtning + MSB-rapportering + kundkommunikation. Fiktivt scenario med 72-timmars tidslinje.'
  },
  {
    slug: 'nis2-compliance-checklista-essential-entity',
    title: 'NIS2 Compliance-checklista med krav för Essential Entities',
    angle: 'Specifikt för essential entities. Skärpta krav jämfört med viktiga entiteter. Checklista med 20 punkter. Fiktivt scenario: essentiell entitet i energisektorn under tillsyn — vilka punkter klarade de inte?'
  },
  {
    slug: 'rapid7-vs-microsoft-sårbarhetsbedömning',
    title: 'Rapid7 vs Microsoft Security Center: Sårbarhetsbedömning under NIS2',
    angle: 'NIS2 kräver att ni identifierar och hanterar sårbarheter. Rapid7 InsightVM vs Microsoft Defender Vulnerability Management. Skanning, prioritering, rapportering. Vad är miniminivå? Vad kräver tillsynsmyndigheten av er sårbarhethanteringsprocess?'
  },
  {
    slug: 'knowbe4-vs-microsoft-viva-säkerhetsutbildning',
    title: 'KnowBe4 vs Microsoft Viva: Säkerhetsutbildning och NIS2 Artikel 20',
    angle: 'NIS2 Artikel 20 kräver utbildning. KnowBe4 (phishing-simulering + utbildning) vs Microsoft Viva Learning. Vad räknas för NIS2? Dokumentationsmöjligheter. Vilken passar en organisation som vill uppfylla Artikel 20 och kunna bevisa det vid tillsyn?'
  },
  {
    slug: 'nis2-riskbedömning-implementeringsguide',
    title: 'NIS2 Riskbedömning: Ramverk och implementeringsguide för styrelsen',
    angle: 'Fem steg för NIS2-kompatibel riskbedömning. Vad ska styrelsen formellt godkänna? Hur ofta uppdateras riskbedömningen? Vad händer om styrelsen godkänner utan att förstå?'
  },
  {
    slug: 'nis2-leverantorskedjans-cybersäkerhet',
    title: 'NIS2 Leverantörskedjans cybersäkerhet: Riskhantering steg för steg',
    angle: 'SolarWinds och Kaseya som verkliga exempel. Steg-för-steg leverantörsbedömning. Vad kräver NIS2 av era leverantörsavtal? Vad händer om en leverantör vägrar uppfylla era krav?'
  },
  {
    slug: 'nis2-styrelseovervakning-cyberstyrning',
    title: 'NIS2 Styrelsens cyberstyrning: Vad Artikel 20 faktiskt kräver av dig',
    angle: 'Tre pelare: godkänna säkerhetsåtgärder, genomgå utbildning, övervaka genomförande. Hur ser ett styrelsemöte med korrekt NIS2-hantering ut — dagordning, underlag, protokollformuleringar?'
  },
  {
    slug: 'microsoft-power-bi-vs-tableau-säkerhetsrapportering',
    title: 'Microsoft Power BI vs Tableau: Säkerhetsrapportering och NIS2-styrelserapporter',
    angle: 'Styrelsen behöver löpande rapportering om cybersäkerhetsstatus under NIS2. Power BI vs Tableau för att visualisera säkerhetsdata och KPI:er till styrelseledamöter. Vad är relevant? Integrationer med SIEM och GRC-system.'
  },
  {
    slug: 'microsoft-365-e5-pris-säkerhetsfunktioner',
    title: 'Microsoft 365 E5-licens: Vad kostar det och vad täcker det för NIS2?',
    angle: 'Microsoft 365 E5 innehåller ett brett säkerhetspaket: Defender, Purview, Sentinel (begränsat), Entra ID P2, Intune. Vad täcker det av NIS2-kraven? Vad ingår INTE? Prisanalys: E3 vs E5 — är prisskillnaden motiverad ur NIS2-perspektiv? Guide för CFO/IT-chef.'
  },
  {
    slug: 'nis2-sanktioner-konsekvenser-efterlevnad',
    title: 'NIS2-sanktioner och konsekvenser: Vad kostar bristande efterlevnad?',
    angle: 'Böter, förelägganden, yrkesförbud, offentliggörande av bristerna. Hur beräknas och beslutas böterna? Utöver böterna: skadeståndsanspråk, avtalsbrott, varumärkesskada.'
  },
  {
    slug: 'iso27001-vs-nis2-efterlevnad',
    title: 'ISO 27001 vs NIS2: Täcker ISO-certifieringen NIS2-kraven?',
    angle: '\'Vi är ISO 27001-certifierade, täcker det NIS2?\' Svar: delvis, men inte fullt. Matristabell. Vad täcker ISO 27001 som NIS2 inte kräver? Vad kräver NIS2 som ISO 27001 inte täcker?'
  },
  {
    slug: 'nis2-tredjepartsrisk-leverantorsbedömning',
    title: 'NIS2 Tredjepartsrisk: Komplett guide för leverantörsbedömning',
    angle: 'Varför leverantörsrisk är en av de tre viktigaste frågorna under NIS2. Säkerhetsfrågeformulär — vad ska det innehålla? Hur hanterar ni en leverantör som inte klarar kraven men är operativt kritisk?'
  },
  {
    slug: 'microsoft-defender-business-priser',
    title: 'Microsoft Defender for Business: Priser och vad som räcker för NIS2',
    angle: 'Defender for Business är Microsofts SME-erbjudande. Vad ingår? Vad täcker det av NIS2:s krav på endpoint-skydd? Jämförelse med Defender for Endpoint Plan 1 och Plan 2. Priser. Vad saknas för att uppfylla NIS2 fullt ut?'
  },
  {
    slug: 'microsoft-sentinel-kostnadskalkyl',
    title: 'Microsoft Sentinel: Kostnadskalkyl och vad ni faktiskt betalar',
    angle: 'Sentinel prissätts per gigabyte ingesterat data — kostnaderna kan eskalera snabbt. Hur beräknar ni er kostnad? Vad är rimlig datavolym för en organisation med 200–500 anställda? Kostnadsoptimering: vad måste loggas och vad kan uteslutas? Jämförelse med alternativa SIEM-lösningar.'
  },
  {
    slug: 'nis2-driftskontinuitet-katastrofaterhämtning',
    title: 'NIS2 Business Continuity och Disaster Recovery: Vad lagen faktiskt kräver',
    angle: 'Skillnaden mellan backup och bevisad återhämtningsförmåga. RTO, RPO — rimliga mål. Fiktivt scenario: återhämtning tar 9 dagar istället för planerade 24 timmar.'
  },
  {
    slug: 'nis2-medarbetarutbildning-sakhetsmedvetenhet',
    title: 'NIS2 Medarbetarutbildning: Säkerhetsmedvetenhet och vad som faktiskt räknas',
    angle: 'Utbildning på två nivåer: ledningen (Artikel 20) och anställda. Vad räknas för tillsynsmyndigheten? Hur mäter man effekt? Phishing-simuleringar som komplement.'
  },
  {
    slug: 'nis2-nätverksövervakning-soc-krav',
    title: 'NIS2 och nätverksövervakning: Behöver ni ett SOC?',
    angle: 'Behöver alla organisationer ett SOC? Vad är miniminivån? Skillnad mellan in-house SOC, managed SOC och grundläggande logghantering. Kostnadsanalys för SME.'
  },
  {
    slug: 'microsoft-purview-priser-datastyrning',
    title: 'Microsoft Purview: Priser och vad som krävs för NIS2-dataskydd',
    angle: 'Purview ingår delvis i M365-licenser men de avancerade funktionerna kräver tillägg. Vad ingår i E3, E5, och Purview add-ons? Vad behöver ni för NIS2? Kostnadsanalys för en organisation som vill uppfylla NIS2:s dataskyddskrav med Microsoft-stack.'
  },
  {
    slug: 'microsoft-intune-priser-enhetshantering',
    title: 'Microsoft Intune: Licenser, priser och vad som räcker för NIS2',
    angle: 'Intune ingår i M365 Business Premium och E3/E5. Vad täcker grundlicensen? Vad kräver tillägg? Vad är miniminivå för NIS2-kompatibel enhetshantering? Kostnadsanalys för organisation med mix av Windows, Mac och mobila enheter.'
  },
  {
    slug: 'nis2-dataskydd-gdpr-integration',
    title: 'NIS2 Dataskydd och GDPR: Hur de hänger ihop och var de skiljer sig',
    angle: 'Var är överlappen? Var skiljer de sig? Kan ett GDPR-team leda NIS2-arbetet? Varning mot att behandla NIS2 som \'GDPR fast med cybersäkerhet\'.'
  },
  {
    slug: 'nis2-kritisk-tillgangsidentifiering',
    title: 'NIS2 Kritisk tillgångsinventering: Steg-för-steg klassificeringsguide',
    angle: 'Kategorisering: kritiska system, känsliga data, kritiska processer, leverantörer. Vad händer om en kritisk tillgång saknas i inventeringen och sedan utnyttjas i ett angrepp?'
  },
  {
    slug: 'nis2-cyberförsäkring-täckning',
    title: 'NIS2 och cyberförsäkring: Täcker er försäkring det ni tror?',
    angle: 'NIS2-böter täcks ofta INTE av cyberförsäkringar. Vad täcker en typisk cyberförsäkring? Hur påverkar bristande NIS2-efterlevnad er försäkringsrätt? Frågor till er försäkringsmäklare.'
  },
  {
    slug: 'microsoft-azure-security-center-priser',
    title: 'Microsoft Azure Security Center: Priser och NIS2-skydd i molnet',
    angle: 'Microsoft Defender for Cloud (tidigare Security Center) prissätts per resurs per månad. Vad skyddar det? Vad täcker det av NIS2:s krav för molninfrastruktur? Kostnadsanalys för organisation med Azure-workloads. Vad är miniminivå och vad är överkurs?'
  },
  {
    slug: 'microsoft-security-compliance-checklista',
    title: 'Microsoft Security Compliance: Komplett checklista för NIS2-kontroller',
    angle: 'Vilka Microsoft-säkerhetskontroller måste vara aktiverade för NIS2-efterlevnad? Praktisk checklista: MFA (Entra ID), Conditional Access, Defender for Endpoint, Purview DLP, Sentinel loggning, Intune MDM. Vad aktiveras standardmässigt och vad kräver manuell konfiguration?'
  },
  {
    slug: 'nis2-digital-resiliens-testning',
    title: 'NIS2 Digital motståndskraft: Testning och validering av era säkerhetsåtgärder',
    angle: 'Penetrationstester, backup-tester, tabletop-övningar, DR-drills. Hur ofta? Vad dokumenteras? Personligt ansvar: intrång via känd sårbarhet som aldrig testades efter ett pentest.'
  },
  {
    slug: 'nis2-molntjänster-due-diligence',
    title: 'NIS2 och molntjänster: Vem ansvarar när datan ligger i molnet?',
    angle: 'Shared responsibility i molnet. Datalokaliseringsregler. Due diligence-checklista för molntjänstbedömning under NIS2.'
  },
  {
    slug: 'nis2-äldre-system-modernisering',
    title: 'NIS2 och äldre IT-system: Vad gör du med legacy-system som inte kan patchas?',
    angle: 'Kompensatoriska kontroller, nätverkssegmentering, migration. Vad är tillsynsmyndighetens inställning? Riskbedömning och dokumentation som nödvändigt skyddsnät.'
  },
  {
    slug: 'microsoft-365-säkerhet-implementeringstidslinje',
    title: 'Microsoft 365 Säkerhet: Implementeringstidslinje för NIS2-efterlevnad',
    angle: 'Steg-för-steg tidslinje för att konfigurera Microsoft 365 säkerhetsfunktioner i NIS2-syfte. Fas 1 (vecka 1-2): MFA och Conditional Access. Fas 2 (vecka 3-4): Defender aktivering. Fas 3 (månad 2): Purview och DLP. Fas 4 (månad 3): Sentinel integration och loggning. Vad gör varje fas?'
  },
  {
    slug: 'microsoft-defender-incident-response-playbook',
    title: 'Microsoft Defender: Incident Response-playbook för NIS2-rapportering',
    angle: 'Hur integrerar man Microsoft Defenders incidenthantering med NIS2:s rapporteringskrav? Steg: detektera i Defender → eskalera till CISO → tidig varning till MSB (24h) → rapport (72h) → slutrapport (30 dagar). Dokumentationsmallar. Hur konfigureras Defender-varningar för NIS2-relevanta incidenter?'
  },
  {
    slug: 'nis2-gränsöverskridande-informationsdelning',
    title: 'NIS2 och gränsöverskridande incidenter: Rapportering och koordination i EU',
    angle: 'När måste ni rapportera till fler än MSB? Vilka EU-samarbetsstrukturer finns? Vad innebär det att er molnleverantör är baserad i ett annat EU-land?'
  },
  {
    slug: 'nis2-mognadsbedömning-cybersäkerhetsberedskap',
    title: 'NIS2 Mognadsbedömning: Var befinner sig er organisation på skalan?',
    angle: 'Fem mognadsnivåer från \'reaktiv\' till \'optimerande\'. Självbedömningsverktyg med 15 frågor. Vad kostar det att gå från nivå 2 till nivå 3?'
  },
  {
    slug: 'nis2-efterlevnad-krav-sverige',
    title: 'NIS2-efterlevnad i Sverige: Komplett implementeringsguide',
    angle: 'Övergripande Sverige-guide: lagstiftningsstatus, tillsynsmyndigheter per sektor, MSB:s roll, rapporteringsvägar. Vad skiljer den svenska implementeringen från andra EU-länder?'
  },
  {
    slug: 'microsoft-purview-dataklassificering',
    title: 'Microsoft Purview Dataklassificering: Implementationsguide för NIS2',
    angle: 'NIS2 kräver identifiering av kritiska tillgångar — inklusive känsliga data. Microsoft Purview dataklassificering steg för steg: skapa känslighetsetiketter, definiera klassificeringspolicyer, konfigurera automatisk klassificering. Vad är relevant för NIS2 och vad är överkurs?'
  },
  {
    slug: 'microsoft-sentinel-loggpolicyer',
    title: 'Microsoft Sentinel: Loggpolicyer och konfiguration för NIS2-spårbarhet',
    angle: 'NIS2 kräver att ni kan rekonstruera en incident. Sentinel-konfiguration för NIS2: vilka datakällor ska kopplas in? Hur länge ska loggar sparas? Kostnadsoptimering: vad måste loggas och vad kan uteslutas? Alert-regler för NIS2-relevanta incidenter.'
  },
  {
    slug: 'nis2-konsulter-stockholm',
    title: 'NIS2-konsulter i Stockholm: Vad du ska kräva av din rådgivare',
    angle: 'Vad ska en seriös NIS2-konsult kunna leverera? Red flags att se upp för. Skillnaden mellan gap-analys, implementationskonsult och revisionsförberedelse. Positionera NIS2Klar som alternativet med styrelseperspektiv.'
  },
  {
    slug: 'nis2-rådgivare-göteborg',
    title: 'NIS2-rådgivning i Göteborg: Guide för VD:ar och styrelser i Västsverige',
    angle: 'Sektorer extra representerade i Göteborgsregionen: fordon, logistik, energi, hamn. Specifika NIS2-utmaningar för dessa sektorer.'
  },
  {
    slug: 'nis2-implementeringsstöd-malmö',
    title: 'NIS2-implementering i Malmö: Vad Öresundsregionens företag behöver veta',
    angle: 'Malmö och Öresundsregionen: gränsöverskridande verksamheter, logistik, life science. Gränsöverskridande incidentrapportering — till Sverige eller Danmark?'
  },
  {
    slug: 'microsoft-intune-mdm-konfiguration',
    title: 'Microsoft Intune: MDM-konfiguration för NIS2-enhetskontroll',
    angle: 'Enhetskontroll är en del av NIS2:s krav på åtkomstkontroll. Intune-konfiguration steg för steg: compliance policies (krav på uppdaterat OS, disk-kryptering, låsskärm), Conditional Access-integration, BYOD-hantering. Vad är miniminivå för NIS2?'
  },
  {
    slug: 'microsoft-security-stack-arkitektur',
    title: 'Microsoft Security Stack: Arkitekturguide för NIS2-kompatibel miljö',
    angle: 'Helhetsbild av Microsoft-säkerhetsstacken ur NIS2-perspektiv: Entra ID (identitet) → Intune (enheter) → Defender (endpoint/e-post/moln) → Purview (data) → Sentinel (SIEM). Hur hänger de ihop? Vilka integrationer är kritiska? Vad saknas i Microsoft-stacken för fullständig NIS2-täckning?'
  },
  {
    slug: 'nis2-revisorer-stockholm',
    title: 'NIS2-revision i Stockholm: Vad tillsynsgranskningen faktiskt innebär',
    angle: 'Vad händer under en NIS2-tillsynsgranskning i Stockholmsregionen? Hur initieras den? Vilken dokumentation begärs? Guide för revisionsförberedda organisationer.'
  },
  {
    slug: 'nis2-certifieringsprogram-göteborg',
    title: 'NIS2-utbildning och certifiering i Göteborg: Vad räknas och vad räcker?',
    angle: 'Vilka utbildningsleverantörer finns lokalt? Certifieringar vs workshops vs in-house. Hur dokumenteras utbildningen för tillsynsmyndigheten?'
  },
  {
    slug: 'nis2-utbildning-certifiering-malmö',
    title: 'NIS2-utbildning i Malmö: Guide för organisationer som behöver uppfylla Artikel 20',
    angle: 'Lokalt perspektiv. Skillnaden mellan utbildning för styrelseledamöter (Artikel 20) och generell medarbetarutbildning. NIS2Klar:s erbjudande.'
  },
  {
    slug: 'microsoft-365-riskbedömning-mallar',
    title: 'Microsoft 365 Riskbedömning: Mallar och checklista för NIS2-dokumentation',
    angle: 'Microsoft Compliance Manager innehåller riskbedömningsmallar. Hur använder ni dem för NIS2? Vilka bedömningar är relevanta? Hur exporteras och presenteras resultaten för styrelsen? Vad täcker Compliance Manager och vad måste ni komplettera manuellt?'
  },
  {
    slug: 'microsoft-azure-nätverkssegmentering',
    title: 'Microsoft Azure Nätverkssegmentering: Konfigurationsguide för NIS2',
    angle: 'NIS2 kräver nätverkssäkerhet. Azure-nätverkssegmentering: Virtual Networks, Network Security Groups, Azure Firewall, Private Endpoints. Vad är miniminivå? Vad skyddar mot lateral movement vid ett intrång? Guide för organisation med Azure-workloads.'
  },
  {
    slug: 'nis2-providers-göteborg',
    title: 'NIS2-leverantörer i Göteborg: Hur du väljer rätt partner för compliance',
    angle: 'Tre typer av leverantörer: tekniska, compliance-konsulter, utbildning. Frågor att ställa vid upphandling. Varning för leverantörer som säljer teknik utan styrelseperspektiv.'
  },
  {
    slug: 'nis2-traning-providers-malmö',
    title: 'NIS2-träning och kompetensutveckling i Malmö med certifieringsprogram',
    angle: 'Vad kräver Artikel 20 av ledningens kompetens? Skillnaden mellan teknisk NIS2-certifiering och styrelseutbildning. NIS2Klar:s modell.'
  },
  {
    slug: 'siem-vs-soar-incident-response',
    title: 'SIEM vs SOAR: Vilken lösning behöver din organisation under NIS2?',
    angle: 'NIS2 kräver förmåga att detektera och hantera säkerhetshändelser. Skillnaden mellan SIEM och SOAR. Behöver ni båda? Vad är miniminivå för en viktig entitet utan eget SOC?'
  },
  {
    slug: 'microsoft-entra-mfa-konfiguration',
    title: 'Microsoft Entra ID: MFA-konfiguration och Conditional Access för NIS2',
    angle: 'MFA är obligatorisk under NIS2. Entra ID-konfiguration: aktivera MFA för alla användare, Conditional Access-policyer (kräv MFA från externa IP, blockera legacy-protokoll), privilegierade konton (PAM). Vanliga misstag: MFA aktiveras men undantag skapar luckor.'
  },
  {
    slug: 'microsoft-information-protection-etiketter',
    title: 'Microsoft Information Protection: Känslighetsetiketter för NIS2-dataskydd',
    angle: 'Känslighetsetiketter i Microsoft 365 hjälper er klassificera och skydda känsliga dokument. Konfiguration steg för steg. Vad är relevant för NIS2? Automatisk vs manuell klassificering. Kryptering baserad på etikett. Hur rapporterar ni etikettstatus till styrelsen?'
  },
  {
    slug: 'cloud-security-vs-on-premise-jämförelse',
    title: 'Molnsäkerhet vs lokal säkerhet: Vad passar NIS2-kompatibla organisationer?',
    angle: 'Shared responsibility i molnet. Datalokaliseringsregler under NIS2. Vad händer om molnleverantören är utanför EU? Guide för beslutsfattare.'
  },
  {
    slug: 'mdr-vs-mssp-managed-security',
    title: 'MDR vs MSSP: Vilken typ av managed security-tjänst behöver du för NIS2?',
    angle: 'Skillnaden mellan MDR och MSSP. Vad täcker de i förhållande till NIS2-kraven? Köpguide: vilka frågor ska ni ställa leverantörerna?'
  },
  {
    slug: 'edr-vs-xdr-endpoint-skydd',
    title: 'EDR vs XDR: Endpoint-skydd och hotdetektering under NIS2',
    angle: 'Skillnaden och vad som räcker för NIS2. Guide för en VD som fått en kostnadsoffert på XDR och undrar om det är nödvändigt.'
  },
  {
    slug: 'microsoft-compliance-manager-bedömning',
    title: 'Microsoft Compliance Manager: NIS2-bedömning och hur man använder den',
    angle: 'Compliance Manager har en NIS2-mall. Hur aktiverar man den? Hur tolkar man poängen? Vad är \'Compliance Score\' och vad mäter den faktiskt? Vad täcker Compliance Manager och vad måste kompletteras manuellt? Guide för compliance-ansvarig.'
  },
  {
    slug: 'microsoft-security-score-förbättring',
    title: 'Microsoft Secure Score: Förbättringsguide för NIS2-säkerhetsnivå',
    angle: 'Microsoft Secure Score mäter er säkerhetskonfiguration. Hur tolkar man poängen ur NIS2-perspektiv? Vilka förbättringsåtgärder ger störst NIS2-värde? Kan Secure Score användas som bevis gentemot tillsynsmyndigheten? Varning: hög Secure Score ≠ NIS2-efterlevnad.'
  },
  {
    slug: 'iam-vs-pam-åtkomstkontroll',
    title: 'IAM vs PAM: Identitets- och åtkomsthantering som NIS2 faktiskt kräver',
    angle: 'Behöver ni båda? Vad är miniminivå? Fiktivt scenario: intrång via IT-adminkonto utan MFA och loggning.'
  },
  {
    slug: 'grc-vs-itsm-riskhantering',
    title: 'GRC vs ITSM: Vilket verktyg behöver din organisation för NIS2-efterlevnad?',
    angle: 'GRC för regelefterlevnad vs ITSM för IT-processer. Behöver ni ett GRC-verktyg för NIS2? Alternativ för SME.'
  },
  {
    slug: 'ngfw-vs-waf-nätverksskydd',
    title: 'NGFW vs WAF: Brandväggar och webbskydd under NIS2',
    angle: 'Vad är skillnaden och vilket behövs? Fiktivt scenario: intrång via ej patchad webbapplikation utan WAF.'
  },
  {
    slug: 'microsoft-viva-säkerhetsutbildning',
    title: 'Microsoft Viva Learning: Säkerhetsutbildning och NIS2 Artikel 20-dokumentation',
    angle: 'Hur kan Microsoft Viva Learning användas för NIS2-utbildning? Vilka moduler är relevanta? Hur dokumenteras genomförd utbildning? Kan Viva-rapporter visas för tillsynsmyndigheten? Vad saknas i Viva för Artikel 20-efterlevnad?'
  },
  {
    slug: 'microsoft-power-automate-säkerhetsflöden',
    title: 'Microsoft Power Automate: Säkerhetsarbetsflöden för NIS2-automatisering',
    angle: 'Power Automate kan automatisera delar av NIS2-efterlevnadsarbetet: automatisk incident-eskalering, påminnelser om policyuppdateringar, leverantörsbedömningsflöden. Konkreta exempel på automatiseringar. Vad kan automatiseras och vad kräver mänskligt beslut under NIS2?'
  },
  {
    slug: 'backup-vs-bcdr-driftskontinuitet',
    title: 'Backup vs BCDR: Skillnaden som avgör om ni klarar en NIS2-granskning',
    angle: 'Backup utan testad återhämtningsplan håller inte vid tillsyn. Miniminivå för 50–500 anställda.'
  },
  {
    slug: 'e-postsäkerhet-vs-webbgateway-skydd',
    title: 'E-postsäkerhet vs webbgateway: Vilket skydd täcker NIS2-kraven?',
    angle: 'E-post och webb är de vanligaste angreppsvektorerna. SPF, DKIM, DMARC, phishing-filter. Vad är minimum och vad ska dokumenteras?'
  },
  {
    slug: 'sårbarhetssanning-vs-penetrationstest',
    title: 'Sårbarhetsskanning vs penetrationstest: Vad NIS2 kräver och vad som räcker',
    angle: 'Automatisk skanning vs manuellt pentest. Är penetrationstest obligatoriskt? Styrelseansvar: kritiskt fynd ignoreras och sedan utnyttjas.'
  },
  {
    slug: 'microsoft-graph-api-säkerhetsrapportering',
    title: 'Microsoft Graph API: Säkerhetsrapportering och NIS2-automation',
    angle: 'Microsoft Graph API ger programmatisk åtkomst till säkerhetsdata i Microsoft 365. Vad kan hämtas? Incident-data, inloggningsloggar, DLP-varningar. Hur bygger man automatiserade NIS2-rapporter till styrelsen? Guide för teknisk person som ska ta fram styrelserapporter.'
  },
  {
    slug: 'microsoft-zero-trust-implementeringsplan',
    title: 'Microsoft Zero Trust: Implementeringsplan och NIS2-koppling',
    angle: 'Microsoft Zero Trust-ramverket (Identitet, Enheter, Nätverk, Applikationer, Data, Infrastruktur) och hur det mappas mot NIS2-kraven. Implementeringsplan i tre faser. Vad ger störst NIS2-värde per investerad krona? Guide för organisation som börjar sin Zero Trust-resa.'
  },
  {
    slug: 'säkerhetsmedvetenhet-vs-phishing-simulering',
    title: 'Säkerhetsutbildning vs phishing-simulering: Vad fungerar bättre under NIS2?',
    angle: 'Traditionell utbildning vs löpande phishing-simuleringar. Vad räknas för tillsynsmyndigheten? Kan simuleringar ersätta formell utbildning?'
  },
  {
    slug: 'logghantering-vs-säkerhetsanalys',
    title: 'Logghantering vs säkerhetsanalys: Vad NIS2 kräver för incidentspårbarhet',
    angle: 'NIS2 kräver att ni kan rekonstruera en incident. Vad ska loggas? Hur länge sparas loggar? Miniminivå för SME.'
  },
  {
    slug: 'kryptering-vs-tokenisering-dataskydd',
    title: 'Kryptering vs tokenisering: Vilken metod uppfyller NIS2:s dataskyddskrav?',
    angle: 'Skillnaden förklarad utan teknisk jargong. Vad ska styrelsen fråga IT-chefen? Vanliga brister: data krypteras i transit men inte i vila.'
  },
  {
    slug: 'microsoft-copilot-security-hotjakt',
    title: 'Microsoft Security Copilot: AI-driven hotjakt och NIS2-incidentrespons',
    angle: 'Security Copilot använder AI för att analysera hotdata och stötta incidentrespons. Vad kan den faktiskt göra? Vad kan den inte göra? Är det relevant för NIS2? Kostnader och förutsättningar. Guide för CISO/IT-chef som ska presentera AI-säkerhetsinvestering för styrelsen.'
  },
  {
    slug: 'microsoft-entra-behörighetshantering',
    title: 'Microsoft Entra Permissions Management: Identitetsbaserad åtkomstkontroll för NIS2',
    angle: 'Entra Permissions Management (CIEM) ger insyn i och kontroll över behörigheter i multicloud-miljöer (Azure, AWS, GCP). Vad är relevant för NIS2? Principen om lägsta privilegium implementerad praktiskt. Guide för organisation med komplexa molnmiljöer.'
  },
  {
    slug: 'dlp-vs-ueba-dataskydd',
    title: 'DLP vs UEBA: Insiderhot och dataförlust under NIS2',
    angle: 'Behöver alla NIS2-reglerade organisationer DLP? Fiktivt scenario: anställd kopierar kunddata till privat molnstorage.'
  },
  {
    slug: 'casb-vs-swg-molnåtkomst',
    title: 'CASB vs SWG: Molnåtkomst och webbsäkerhet under NIS2',
    angle: 'Insyn i och kontroll över molntjänstanvändning. Behöver ni båda? Guide för organisation med många SaaS-verktyg.'
  },
  {
    slug: 'microsoft-defender-attack-surface-management',
    title: 'Microsoft Defender Attack Surface Management: Synlighet för NIS2-sårbarhetskontroll',
    angle: 'Attack Surface Management (EASM) ger insyn i er externa attackyta — vad ser en angripare? Hur används det för NIS2-efterlevnad? Integrering med sårbarhethanteringsprocessen. Vad är relevant för en organisation under NIS2 och vad är avancerade funktioner för specifika behov?'
  }
];

const STYLE_GUIDE = fs.readFileSync(
  path.join(ARTICLES_DIR, 'nis2-boten-sanktioner-sverige.html'),
  'utf-8'
);

async function generateArticle(topic) {
  console.log(`\n[article] Generating: ${topic.slug}`);
  console.log(`[article] Title: ${topic.title}`);

  const today = new Date().toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' });

  const prompt = `Du är en expert på NIS2 och skriver för nis2klar.se — en svensk sajt som hjälper VD:ar och styrelser att förstå och följa NIS2-direktivet.

UPPDRAG:
Skriv en komplett HTML-artikel med titeln: "${topic.title}"

VINKEL/FOKUS:
${topic.angle}

STILGUIDE — matcha exakt denna HTML-struktur och CSS (kopiera CSS-sektionen och nav-strukturen ordagrant, byt bara innehåll):
${STYLE_GUIDE}

KRAV:
- Minst 1200 ord löptext (exkl. HTML-taggar)
- Datum: ${today}
- Läsare: VD, styrelseordförande, styrelseledamot — inte tekniker
- Ton: professionell, direkt, lite skrämmande men aldrig panikskapande
- StoryBrand: läsaren är hjälten, NIS2 är utmaningen, vi är guiden
- Personligt ansvar ska nämnas konkret (inte bara i förbigående)
- Avsluta med CTA-sektion: länk till https://nis2klar.se/#kontakt med texten "Boka en kostnadsfri NIS2-genomgång"
- Inkludera minst: en .box-warning, en .box-info, och en .box-case
- nav-logo ska vara: <a class="nav-logo" href="https://nis2klar.se/">NIS2<span>Klar</span></a>
- nav-back: <a class="nav-back" href="https://nis2klar.se/artiklar.html">← Alla artiklar</a>
- Slug för denna artikel: ${topic.slug}

VIKTIGT: Returnera ENBART giltig HTML från <!DOCTYPE html> till </html>. Inget annat.`;

  let message;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }]
      });
      break;
    } catch (err) {
      if ((err.status === 529 || err.status === 529) && attempt < 5) {
        const wait = attempt * 30000;
        console.log(`[article] API overloaded, retrying in ${wait/1000}s... (${attempt}/5)`);
        await new Promise(r => setTimeout(r, wait));
      } else throw err;
    }
  }

  let html = message.content[0].text.trim();
  // Strip markdown code fences if model wrapped response
  html = html.replace(/^```html?\s*/i, '').replace(/\s*```$/, '').trim();

  // Validate it looks like HTML
  if (!html.startsWith('<!DOCTYPE') && !html.startsWith('<html')) {
    throw new Error('Response does not look like HTML: ' + html.slice(0, 100));
  }

  const outPath = path.join(ARTICLES_DIR, `${topic.slug}.html`);
  fs.writeFileSync(outPath, html, 'utf-8');
  console.log(`[article] Saved: ${outPath}`);
  return outPath;
}

function generateIndex() {
  const files = fs.readdirSync(ARTICLES_DIR)
    .filter(f => f.endsWith('.html'))
    .sort();

  const cards = files.map(file => {
    const html = fs.readFileSync(path.join(ARTICLES_DIR, file), 'utf-8');
    const slug = file.replace('.html', '');
    const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1]?.replace(/\s*\|.*$/, '').trim() || slug;
    const desc = (html.match(/name="description" content="([^"]*)"/) || [])[1] || '';
    const category = (html.match(/class="article-category"[^>]*>([^<]+)</) || [])[1]?.trim() || 'NIS2';
    return { slug, title, desc, category };
  });

  const cardHtml = cards.map(({ slug, title, desc, category }) => `
    <a class="card" href="/artiklar/${slug}.html">
      <div class="card-category">${category}</div>
      <h2>${title}</h2>
      <p>${desc}</p>
      <div class="card-arrow">Läs artikel →</div>
    </a>`).join('\n');

  const indexHtml = `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NIS2 Artiklar — Guider för VD och styrelse | NIS2Klar</title>
  <meta name="description" content="Samling av artiklar om NIS2-direktivet för svenska VD:ar och styrelser. Böter, personligt ansvar, tekniska krav, incidentrapportering och mer.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;900&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root { --bg: #141416; --card: #1c1c1f; --yellow: #f5c518; --white: #f0f0f0; --muted: #888; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--white); font-family: 'Barlow', sans-serif; font-size: 18px; line-height: 1.7; }
    nav { display: flex; justify-content: space-between; align-items: center; padding: 20px 40px; border-bottom: 1px solid rgba(255,255,255,0.07); max-width: 1000px; margin: 0 auto; }
    .nav-logo { font-family: 'Poppins', sans-serif; font-weight: 900; font-size: 20px; color: var(--yellow); text-decoration: none; }
    .nav-logo span { color: var(--white); }
    .nav-cta { background: var(--yellow); color: #000; padding: 8px 18px; border-radius: 4px; text-decoration: none; font-weight: 700; font-size: 14px; font-family: 'Poppins', sans-serif; }
    .hero { max-width: 1000px; margin: 0 auto; padding: 60px 40px 40px; }
    .hero h1 { font-family: 'Poppins', sans-serif; font-size: clamp(28px, 4vw, 42px); font-weight: 900; margin-bottom: 12px; }
    .hero p { color: var(--muted); font-size: 18px; max-width: 560px; }
    .grid { max-width: 1000px; margin: 0 auto; padding: 20px 40px 80px; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; }
    .card { background: var(--card); border: 1px solid rgba(255,255,255,0.07); border-radius: 6px; padding: 28px; text-decoration: none; color: inherit; display: flex; flex-direction: column; transition: border-color 0.2s, transform 0.15s; }
    .card:hover { border-color: rgba(245,197,24,0.4); transform: translateY(-2px); }
    .card-category { font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--yellow); margin-bottom: 12px; }
    .card h2 { font-family: 'Poppins', sans-serif; font-size: 18px; font-weight: 700; line-height: 1.35; margin-bottom: 12px; color: var(--white); }
    .card p { font-size: 15px; color: var(--muted); line-height: 1.6; flex: 1; }
    .card-arrow { margin-top: 20px; font-size: 14px; color: var(--yellow); font-weight: 600; }
  </style>
</head>
<body>
  <nav>
    <a class="nav-logo" href="https://nis2klar.se/">NIS2<span>Klar</span></a>
    <a class="nav-cta" href="https://nis2klar.se/#kontakt">Boka genomgång</a>
  </nav>
  <div class="hero">
    <h1>NIS2 Artiklar</h1>
    <p>Guider för VD:ar och styrelser — utan teknisk jargong. Vad NIS2 kräver, vad det kostar att missa, och hur du faktiskt följer lagen.</p>
  </div>
  <div class="grid">
${cardHtml}
  </div>
</body>
</html>`;

  const indexPath = path.join(FRONTEND_DIR, 'public', 'artiklar.html');
  fs.writeFileSync(indexPath, indexHtml, 'utf-8');
  console.log(`[index] Rebuilt artiklar.html — ${cards.length} articles`);
}

function rebuildFrontend() {
  console.log('\n[build] Rebuilding frontend...');
  generateIndex();
  execSync('npm run build', { cwd: FRONTEND_DIR, stdio: 'inherit' });
  console.log('[build] Done.');
}

function listStatus() {
  console.log('\nArticle queue status:');
  console.log('─'.repeat(70));
  for (const topic of TOPICS) {
    const exists = fs.existsSync(path.join(ARTICLES_DIR, `${topic.slug}.html`));
    const status = exists ? '✅ published' : '⏳ pending';
    console.log(`${status}  ${topic.slug}`);
  }
  const done = TOPICS.filter(t => fs.existsSync(path.join(ARTICLES_DIR, `${t.slug}.html`))).length;
  console.log('─'.repeat(70));
  console.log(`${done}/${TOPICS.length} published`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    listStatus();
    return;
  }

  if (args.includes('--all')) {
    // Generate all pending topics
    const pending = TOPICS.filter(t => !fs.existsSync(path.join(ARTICLES_DIR, `${t.slug}.html`)));
    console.log(`[article] Generating ${pending.length} pending articles...`);
    for (const topic of pending) {
      await generateArticle(topic);
      // Delay between requests to avoid overload
      await new Promise(r => setTimeout(r, 8000));
    }
    rebuildFrontend();
    listStatus();
    return;
  }

  // Default: generate next pending article (for daily cron)
  const next = TOPICS.find(t => !fs.existsSync(path.join(ARTICLES_DIR, `${t.slug}.html`)));
  if (!next) {
    console.log('[article] All articles published — nothing to do.');
    listStatus();
    return;
  }
  await generateArticle(next);
  rebuildFrontend();
}

main().catch(err => {
  console.error('[article] Error:', err.message);
  process.exit(1);
});
