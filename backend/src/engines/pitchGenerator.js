'use strict';
/**
 * pitchGenerator.js — Short-form cold email generator
 *
 * 7 email templates mapped to sequence position (emailStepNumber 0–6).
 * Each email: 60–90 words, one specific data point, single yes/no CTA.
 *
 * Template map (matches M365 NIS2 Security sequence):
 *   0 → Day 3:  Curiosity + one NIS2/M365 trigger
 *   1 → Day 7:  Follow-up + restate specific angle
 *   2 → Day 12: Cost of inaction + concrete consequence
 *   3 → Day 18: MSB industry observation (no invented case studies)
 *   4 → Day 26: ROI + scarcity
 *   5 → Day 33: Missed each other?
 *   6 → Day 41: Breakup
 */

const Anthropic = require('@anthropic-ai/sdk');

function getFramework(scoreLabel, stepIndex = 0, emailStepNumber = 0) {
  const templates = ['email_1','email_2','email_3','email_4','email_5','email_6','email_7'];
  return templates[Math.min(emailStepNumber, templates.length - 1)];
}

// NIS2 sector-specific compliance hooks by SNI prefix
const NIS2_HOOKS = {
  '86': 'Vårdsektorn (SNI 86) faller under NIS2 Bilaga I som "väsentlig entitet" — krav på incidentrapportering inom 24h, riskanalyser och leverantörssäkerhet. MSB granskar aktivt.',
  '87': 'Hemtjänst och äldreomsorg (SNI 87) klassas som samhällskritisk infrastruktur under NIS2 — incidentrapportering och kontinuitetsplaner är obligatoriska.',
  '88': 'Socialtjänst (SNI 88) hanterar känsliga personuppgifter och faller under NIS2 krav på tillgänglighet och dataskydd.',
  '64': 'Finanssektorn (SNI 64) har dubbel compliance-press: NIS2 + EBA-riktlinjer för ICT-risk. ECB testar aktivt banker med cyberstresstester 2025.',
  '65': 'Försäkringsbranschen (SNI 65) träffas av NIS2 + EIOPA-krav. Cyberincidenter måste rapporteras till Finansinspektionen inom 72h.',
  '66': 'Finansiella tjänster (SNI 66) inkl. fondbolag och clearinghus är väsentliga entiteter under NIS2 — supply chain-säkerhet och tredjepartsrisk i fokus.',
  '49': 'Landtransport (SNI 49) är NIS2 Bilaga I — operatörer av väsentliga tjänster måste ha incidentresponsplaner och testa dem. Trafikverket samordnar.',
  '50': 'Sjöfart (SNI 50) klassas som kritisk infrastruktur — NIS2 kräver OT/IT-segmentering ombord och i hamnar.',
  '51': 'Luftfart (SNI 51) är NIS2 Bilaga I — Transportstyrelsen ställer krav på cybersäkerhetscertifiering för operatörer.',
  '52': 'Logistik och lagerhållning (SNI 52) — supply chain-attacker ökar; NIS2 kräver att ni säkerställer era leverantörers säkerhetsnivå.',
  '53': 'Post och kurir (SNI 53) klassas som väsentlig tjänst — business continuity-planer och incidentrapportering obligatoriskt.',
  '62': 'IT och mjukvaruföretag (SNI 62) är "viktiga entiteter" under NIS2 — och ofta leverantörer till väsentliga sektorer, vilket ger utökat ansvar via supply chain-krav.',
  '63': 'Datatjänster och molntjänster (SNI 63) träffas hårt av NIS2 — molnleverantörer till väsentliga entiteter måste uppfylla NIS2-krav hos kunderna.',
  '61': 'Telekommunikation (SNI 61) är NIS2 Bilaga I väsentlig sektor — PTS tillsynar aktivt och bötestak är 10M EUR eller 2% av global omsättning.',
  '35': 'Energisektorn (SNI 35) är NIS2 Bilaga I prioritet — Svenska kraftnät och Energimarknadsinspektionen kräver OT-säkerhet och redundans.',
  '36': 'Vattenförsörjning (SNI 36) är samhällskritisk — NIS2 kräver segmentering av OT-system och incidentrapportering till MSB.',
  '37': 'Avloppshantering (SNI 37) faller under NIS2 som väsentlig entitet — operativa teknologisystem (OT) är ofta sårbaraste länken.',
  '38': 'Avfallshantering (SNI 38) klassas som viktig entitet — NIS2 kräver riskbedömning och leverantörsgranskning.',
  '72': 'FoU-verksamhet (SNI 72) är mål för statssponsrade aktörer — NIS2 kräver skydd av immateriella rättigheter och forskningsdata.',
  '84': 'Offentlig förvaltning (SNI 84) är NIS2 Bilaga I — MSB kräver att myndigheter genomför informationssäkerhetsanalyser och testar incidentrespons.',
  '25': 'Metallvarutillverkning (SNI 25) — industriell OT-säkerhet i fokus; NIS2 kräver segmentering av produktionsnät från affärssystem.',
  '28': 'Maskintillverkning (SNI 28) — OT/IT-konvergens ökar attackytan; NIS2 supply chain-krav påverkar era kunder i kritisk infrastruktur.',
  '20': 'Kemisk industri (SNI 20) är NIS2 Bilaga I — processsäkerhet och cybersäkerhet konvergerar; SEVESO-anläggningar har utökat ansvar.',
  '21': 'Läkemedelsindustri (SNI 21) — kombinerat NIS2 + GxP-krav; FDA och EMA ökar krav på cyberresiliens i produktionskedjor.',
};

function getNis2Hook(naceCode) {
  if (!naceCode) return null;
  const prefix = String(naceCode).substring(0, 2);
  return NIS2_HOOKS[prefix] || null;
}

function buildPrompt(lead, { stepIndex = 0, enrolledAt = null, steps = null } = {}) {
  // Count email steps that occur BEFORE the current stepIndex
  const emailStepNumber = steps
    ? steps.slice(0, stepIndex).filter(s => s.channel === 'email').length
    : (stepIndex > 0 ? 1 : 0); // fallback: assume first email if stepIndex=0
  const framework = getFramework(lead.score_label, stepIndex, emailStepNumber);

  const nis2Hook = getNis2Hook(lead.nace_code);
  const nis2HookCtx = nis2Hook ? `\nNIS2-specifik branschrisk: ${nis2Hook}` : '';

  const hasFinancials = lead.revenue_sek || lead.profit_sek;
  const financialCtx = hasFinancials
    ? `\n- Omsättning: ${lead.revenue_sek ? (lead.revenue_sek / 1000000).toFixed(1) + ' MSEK' : 'okänd'} (${lead.annual_report_year || 'senaste'})\n- Rörelseresultat: ${lead.profit_sek ? (lead.profit_sek / 1000000).toFixed(1) + ' MSEK' : 'okänt'}\n- Exakta anställda: ${lead.num_employees_exact ?? 'okänt'}\n- Vinstmarginal: ${(lead.revenue_sek && lead.profit_sek) ? ((lead.profit_sek / lead.revenue_sek) * 100).toFixed(1) + '%' : 'okänd'}`
    : '';

  // Microsoft 365 sweet-spot competitive context
  const isSweetSpot = lead.employee_range && (
    lead.employee_range.includes('50-') || lead.employee_range.includes('100-') ||
    lead.employee_range.includes('50–') || lead.employee_range.includes('100–')
  );
  const ms365Ctx = (lead.tech_stack === 'microsoft365' && isSweetSpot)
    ? `\nKänd tech-stack: Microsoft 365 (detekterad via MX-record)\nKONKURRENSVINKEL: M365 Business Premium täcker INTE NIS2-krav på incidentrapportering (24h-regel), oberoende riskanalyser eller leverantörssäkerhet. Nomad kan komplettera — inte ersätta — deras M365-investering. Nämn detta konkret utan att vara nedsättande om Microsoft.`
    : (lead.competitor_intel ? `\nKänd säkerhetsleverantör: ${lead.competitor_intel}\nAnpassa tonen — de har redan en partner, men troligtvis inte NIS2-specifik kompetens.` : '');

  const leadCtx = `Företag: ${lead.company_name}
Bransch (SNI/NACE): ${lead.nace_code} — ${lead.nace_description || ''}
Anställda: ${lead.employee_range || 'okänt'}
Stad: ${lead.city || 'Sverige'}
NIS2-registrerat: ${lead.nis2_registered ? 'JA — sektor: ' + lead.nis2_sector : 'Nej'}
Webbplats: ${lead.website || 'okänd'}${financialCtx}${nis2HookCtx}${ms365Ctx}`;

  const commonRules = `
REGLER (följ strikt):
- Skriv ENDAST på svenska — professionell men direkt B2B-ton
- MAX 80 ord i e-postbody — kortare är bättre
- Ämnesrad + e-postbody
- Avsluta alltid med "Jan Malmström\nNomad Cyber"
- ALDRIG börja med "Hoppas detta mejl når dig väl" eller liknande klichéer
- En mening = ett påstående. Inga långa meningar.
- CTA = EN enkel ja/nej-fråga i sista meningen
- Generera 2 alternativa ämnesrader, markera den bästa med ★
- ALDRIG hitta på case studies, kundnamn, specifika sparade belopp eller påhittade resultat
- Referera till ETT specifikt faktum om företaget (bransch, storlek, omsättning eller tech-stack) — inte fler
${hasFinancials ? `- Du får nämna deras omsättningsskala (${(lead.revenue_sek/1e6).toFixed(0)} MSEK) om det är relevant` : ''}

FORMAT:
Ämne: [ämnesrad ★] | [alternativ ämnesrad]

[e-postbody]`;

  const frameworks = {
    // Email 1 — Day 3: Curiosity + one specific NIS2/M365 trigger
    email_1: `Du är en B2B-säljutvecklare för Nomad Cyber, ett svenskt cybersäkerhetskonsultbolag specialiserat på NIS2-efterlevnad.

Skriv det FÖRSTA mejlet i sekvensen. Kort, nyfikenhetsdrivande, nästan ingen pitch.
Taktik: En mening om vad ${lead.company_name} riskerar att gå miste om. En mening om att du kan kartlägga det gratis på 15 min. En ja/nej-fråga.
Använd ETT av dessa faktaunderlag som krok (välj det mest relevanta):
${nis2HookCtx || ''}${ms365Ctx || ''}

${leadCtx}
${commonRules}`,

    // Email 2 — Day 7: Follow-up + restate one specific angle
    email_2: `Du är en B2B-säljutvecklare för Nomad Cyber.

Skriv UPPFÖLJNINGSMEJL 2. Det är ${daysSince(enrolledAt)} dagar sedan första mejlet.
Taktik: "Ville bara kolla om du såg mitt förra mail." + nämn EN specifik vinkel (M365-gap ELLER branschexponering) som förklarar varför det är relevant för just dem. Avsluta med en ja/nej-fråga.

${leadCtx}
${commonRules}`,

    // Email 3 — Day 12: Cost of inaction, concrete
    email_3: `Du är en B2B-säljutvecklare för Nomad Cyber.

Skriv UPPFÖLJNINGSMEJL 3. Det är ${daysSince(enrolledAt)} dagar sedan första mejlet.
Taktik: Öppna med "Vet inte om det stämmer för ${lead.company_name}..." + nämn en konkret konsekvens av att inte agera (förlorade upphandlingar, MSB-böter, 24h-rapporteringskrav) kopplat till deras bransch eller storlek. Ingen hård pitch. Mjuk ja/nej-fråga.

${leadCtx}
${commonRules}`,

    // Email 4 — Day 18: MSB industry observation (Option A — NO invented case studies)
    email_4: `Du är en B2B-säljutvecklare för Nomad Cyber.

Skriv UPPFÖLJNINGSMEJL 4. Det är ${daysSince(enrolledAt)} dagar sedan första mejlet.
Taktik: Öppna med en riktig MSB- eller NIS2-observation specifik för deras bransch eller storlek — inte ett påhittat case. Exempel: "MSB riktar just nu tillsyn specifikt mot [bransch] med [typ av system/exponering]." Avsluta med om de vill veta var de står. Ingen hård pitch.
Använd branschinformationen nedan för att göra observationen träffsäker:
${nis2HookCtx || '(Använd allmän NIS2 Bilaga I-information för deras sektorstorlek)'}

${leadCtx}
${commonRules}`,

    // Email 5 — Day 26: ROI + scarcity
    email_5: `Du är en B2B-säljutvecklare för Nomad Cyber.

Skriv UPPFÖLJNINGSMEJL 5. Det är ${daysSince(enrolledAt)} dagar sedan första mejlet.
Taktik: Konkret ROI-vinkel — kostnaden för NIS2-brist (böter upp till 10M EUR eller 2% av global omsättning för väsentliga entiteter) vs kostnaden för att strukturera det nu. Lägg till ett milt knapphetsbudskap ("håller på att avsluta några gratiskartläggningar"). En ja/nej-fråga.
${hasFinancials ? `Deras omsättning: ${(lead.revenue_sek/1e6).toFixed(0)} MSEK — använd detta för att sätta bötesrisken i proportion.` : ''}

${leadCtx}
${commonRules}`,

    // Email 6 — Day 33: Missed each other?
    email_6: `Du är en B2B-säljutvecklare för Nomad Cyber.

Skriv UPPFÖLJNINGSMEJL 6. Det är ${daysSince(enrolledAt)} dagar sedan första mejlet.
Taktik: Lättsamt och kort. "Vet inte om det här passar er just nu..." + en sista mjuk påminnelse om vad de riskerar att missa. Avsluta med en öppen ja/nej-fråga. Ingen desperation, ingen hård pitch.

${leadCtx}
${commonRules}`,

    // Email 7 — Day 41: Breakup, door open
    email_7: `Du är en B2B-säljutvecklare för Nomad Cyber.

Skriv BREAKUP-MEJLET (sista i sekvensen). Det är ${daysSince(enrolledAt)} dagar sedan första mejlet.
Taktik: "Hörde aldrig av er, så jag antar att tajmingen inte passade." + en mening om att de alltid är välkomna att höra av sig om [specifik NIS2-risk för deras bransch]. Avsluta med lycka till. Ingen CTA-fråga — bara öppen dörr.

${leadCtx}
${commonRules}`,
  };

  return frameworks[framework];
}

function daysSince(dateStr) {
  if (!dateStr) return 'några';
  const days = Math.round((Date.now() - new Date(dateStr).getTime()) / 86400000);
  return days > 0 ? days : 1;
}

function parseGenerated(text) {
  // Match "Ämne:" with optional markdown bold markers e.g. "**Ämne:**"
  const subjectLine = text.match(/^\*{0,2}Ämne:\*{0,2}\s*(.+)/m)?.[1] || '';
  let subject = subjectLine;
  const starMatch = subjectLine.match(/([^|★]+)★/);
  const afterStar = subjectLine.match(/★([^|]+)/);
  if (starMatch) subject = starMatch[1].trim().replace(/[★|]/g, '').trim();
  else if (afterStar) subject = afterStar[1].trim();

  const body = text.replace(/^\*{0,2}Ämne:\*{0,2}\s*.+\n\n?/m, '').trim();
  return { subject, body, full: text };
}

async function generatePitch(lead, options = {}) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = buildPrompt(lead, options);

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseGenerated(message.content[0].text);
}

module.exports = { generatePitch };
