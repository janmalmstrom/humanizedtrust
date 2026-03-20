'use strict';
/**
 * pitchGenerator.js — Tiered AI cold email generator
 *
 * Three frameworks based on lead score tier:
 *   Hot  (≥70): Direct Value Prop — specific, assumes they know the problem, pushes urgency
 *   Warm (40–69): Problem-Agitate-Solve — surface the pain, amplify it, present solution
 *   Cold (<40): Social Proof / FOMO — others in their sector are preparing, don't get left behind
 *
 * Sequence-aware: step > 0 = follow-up, references prior contact
 */

const Anthropic = require('@anthropic-ai/sdk');

function getFramework(scoreLabel, stepIndex = 0) {
  if (stepIndex > 0) return 'followup';
  if (scoreLabel === 'hot')  return 'direct';
  if (scoreLabel === 'warm') return 'pas';
  return 'social_proof';
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

function buildPrompt(lead, { stepIndex = 0, stepTitle = null, enrolledAt = null } = {}) {
  const framework = getFramework(lead.score_label, stepIndex);

  const nis2Hook = getNis2Hook(lead.nace_code);
  const nis2HookCtx = nis2Hook ? `\nNIS2-specifik branschrisk: ${nis2Hook}` : '';

  const hasFinancials = lead.revenue_sek || lead.profit_sek;
  const financialCtx = hasFinancials
    ? `\n- Omsättning: ${lead.revenue_sek ? (lead.revenue_sek / 1000000).toFixed(1) + ' MSEK' : 'okänd'} (${lead.annual_report_year || 'senaste'})\n- Rörelseresultat: ${lead.profit_sek ? (lead.profit_sek / 1000000).toFixed(1) + ' MSEK' : 'okänt'}\n- Exakta anställda: ${lead.num_employees_exact ?? 'okänt'}\n- Vinstmarginal: ${(lead.revenue_sek && lead.profit_sek) ? ((lead.profit_sek / lead.revenue_sek) * 100).toFixed(1) + '%' : 'okänd'}`
    : '';

  const leadCtx = `Företag: ${lead.company_name}
Bransch (SNI/NACE): ${lead.nace_code} — ${lead.nace_description || ''}
Anställda: ${lead.employee_range || 'okänt'}
Stad: ${lead.city || 'Sverige'}
NIS2-registrerat: ${lead.nis2_registered ? 'JA — sektor: ' + lead.nis2_sector : 'Nej'}
Webbplats: ${lead.website || 'okänd'}${financialCtx}${nis2HookCtx}`;

  const commonRules = `
REGLER (följ strikt):
- Skriv ENDAST på svenska — professionell B2B-ton
- 150–200 ord i e-postbody
- Ämnesrad + e-postbody
- Avsluta alltid med "Jan Malmström, Nomad Cyber"
- ALDRIG börja med "Hoppas detta mejl når dig väl" eller liknande klichéer
- CTA: erbjud ett 15 minuter kort samtal
- Generera 2 alternativa ämnesrader, markera den bästa med ★
${hasFinancials ? '- Referera till deras omsättningsskala när du pratar om compliance-investering' : ''}

FORMAT:
Ämne: [ämnesrad ★] | [alternativ ämnesrad]

[e-postbody]`;

  const frameworks = {
    direct: `Du är en B2B-säljutvecklare för Nomad Cyber, ett svenskt cybersäkerhetskonsultbolag specialiserat på NIS2-efterlevnad, Microsoft Copilot-styrning och AI-säkerhet.

Skriv ett DIREKT VALUE PROP-mail. Ledtråden är varm (hög poäng) — de vet troligtvis redan om problemet.
Taktik: Gå rakt på sak med det specifika värdet. Inga långa introduktioner. Referera till ett konkret affärsresultat.

${leadCtx}
${commonRules}`,

    pas: `Du är en B2B-säljutvecklare för Nomad Cyber, ett svenskt cybersäkerhetskonsultbolag specialiserat på NIS2-efterlevnad, Microsoft Copilot-styrning och AI-säkerhet.

Skriv ett PROBLEM-AGITATE-SOLVE-mail. Ledtråden är varm men inte het — de känner kanske inte till risken.
Taktik: (1) Nämn ett specifikt problem för deras bransch, (2) Förstärk konsekvenserna om det ignoreras, (3) Presentera Nomad Cyber som lösningen.

${leadCtx}
${commonRules}`,

    social_proof: `Du är en B2B-säljutvecklare för Nomad Cyber, ett svenskt cybersäkerhetskonsultbolag specialiserat på NIS2-efterlevnad, Microsoft Copilot-styrning och AI-säkerhet.

Skriv ett SOCIAL PROOF/FOMO-mail. Ledtråden är kall — de är troligtvis inte medvetna om brådska.
Taktik: Öppna med att andra företag i deras sektor redan förbereder sig. Skapa FOMO kring NIS2-deadlines eller branschtrender. Mjuk CTA.

${leadCtx}
${commonRules}`,

    followup: `Du är en B2B-säljutvecklare för Nomad Cyber, ett svenskt cybersäkerhetskonsultbolag specialiserat på NIS2-efterlevnad, Microsoft Copilot-styrning och AI-säkerhet.

Skriv ett UPPFÖLJNINGSMAIL (steg ${stepIndex + 1} i sekvensen). Det är ${daysSince(enrolledAt)} dagar sedan det första mejlet skickades.
Steg-titel: "${stepTitle || 'Uppföljning'}"

Taktik: Referera kortfattat till det förra mejlet ("följer upp mitt förra meddelande"), lägg till ett nytt perspektiv eller en ny insikt — upprepa inte samma budskap. Kortare än det första mejlet (100–150 ord). Håll tonen lättsam men professionell.

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
  // Extract subject — prefer the ★ marked one
  const subjectLine = text.match(/^Ämne:\s*(.+)/m)?.[1] || '';
  let subject = subjectLine;
  const starMatch = subjectLine.match(/([^|★]+)★/);
  const afterStar = subjectLine.match(/★([^|]+)/);
  if (starMatch) subject = starMatch[1].trim().replace(/[★|]/g, '').trim();
  else if (afterStar) subject = afterStar[1].trim();

  const body = text.replace(/^Ämne:\s*.+\n\n?/m, '').trim();
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
