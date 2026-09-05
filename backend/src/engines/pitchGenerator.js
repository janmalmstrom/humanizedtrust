/**
 * pitchGenerator.js — Modular outreach engine for Simaroa Media
 *
 * Emails are assembled from 3 independent components tracked separately:
 *   SBJ (subject line type) — what gets the email opened
 *   HOK (opening hook type) — what earns the reply
 *   CTA (call-to-action type) — what converts
 *
 * Every generated email carries a combo tag: KET_SBJ2_HOK4_CTA1
 * Track open rate by SBJ, reply rate by HOK, meeting rate by CTA.
 * After 200 sends you know which components win — not just which email won.
 *
 * Usage:
 *   const { subject, body, components, componentCodes } = await generatePitch(lead, options)
 *   // components = 'KET_SBJ2_HOK4_CTA1'  ← log this to DB per lead
 *   // componentCodes = { sbj: 'SBJ2', hok: 'HOK4', cta: 'CTA1' }
 *   // Pass componentCodes back in follow-up options to lock the same combo
 *
 * options.componentCodes = { sbj, hok, cta }  — lock specific codes (testing)
 * options.componentCodes = null               — random pick (exploration)
 */

const Anthropic = require('@anthropic-ai/sdk');

const LOOM_URL           = process.env.LOOM_URL            || '[YOUR_LOOM_URL_HERE]';
const PADDLE_CHECKOUT_URL = process.env.PADDLE_CHECKOUT_URL || 'https://app.simaroa.com/checkout';

// ─── Component Banks ─────────────────────────────────────────────────────────

// Subject line types — determines open rate
// 5 types × each tests a distinct psychological trigger
const SUBJECT_BANK = {
  SBJ1: { type: 'pain',      directive: 'Subject line angle — PAIN: clinic owner is losing patients right now because AI assistants don\'t know they exist. Make them feel the cost of invisibility.' },
  SBJ2: { type: 'contrast',  directive: 'Subject line angle — CONTRAST: competitors in their city/niche show up in AI search. This clinic doesn\'t. Make the gap feel concrete and urgent.' },
  SBJ3: { type: 'curiosity', directive: 'Subject line angle — CURIOSITY: tease that you\'ve already looked at what comes up when patients ask AI about clinics in their city. Don\'t reveal the answer.' },
  SBJ4: { type: 'proof',     directive: 'Subject line angle — PROOF: top clinics in their market are already investing in AI search visibility. Frame this as what the leaders are doing.' },
  SBJ5: { type: 'direct',    directive: 'Subject line angle — DIRECT: plain, low-pressure, specific to their clinic name or city. No cleverness — just a clear, honest reason to open.' },
};

// Opening hook types — determines reply rate
// 6 types each create a different belief shift in lines 1-2
const HOOK_BANK = {
  HOK1: { type: 'reframe',        directive: 'Opening hook — REFRAME: challenge their assumption that Google/SEO is still the main patient acquisition channel. The shift to AI-first search is already happening and ad-restricted categories like theirs are most exposed.' },
  HOK2: { type: 'mechanism',      directive: 'Opening hook — MECHANISM: explain exactly how AI assistants (ChatGPT, Claude, Perplexity) now answer "best ketamine clinic near me" before Google does — and that they cite specific clinics by name from published content.' },
  HOK3: { type: 'contrast',       directive: 'Opening hook — CONTRAST: reference that you looked at AI results for clinics in their city/niche. Name a type of competitor (not a specific clinic you\'d be inventing) that appears while they don\'t. Keep it plausible and honest.' },
  HOK4: { type: 'proof',          directive: 'Opening hook — PROOF: tease a finding — you ran AI searches for their niche in their city and found a clear pattern of who dominates AI results and who is invisible. Don\'t invent specific names or numbers.' },
  HOK5: { type: 'permission',     directive: 'Opening hook — PERMISSION: ultra-short, low-pressure. Just signal you found something relevant about their AI visibility and ask if you can share it. Give them an easy out. No pitch yet.' },
  HOK6: { type: 'gradualization', directive: 'Opening hook — GRADUALIZATION: validate that they\'re probably already aware AI search is changing things, then introduce the specific blind spot most clinics in their category miss: being invisible on the AI layer while competitors get cited.' },
};

// CTA types — determines meeting/response rate
// 2 types: logic (ROI framing) vs identity (status framing)
const CTA_BANK = {
  CTA1: { type: 'logic',    text: 'Worth a quick look?' },
  CTA2: { type: 'identity', text: 'Is this on your radar?' },
};

// ─── Component Picker ─────────────────────────────────────────────────────────

function pickComponent(bank, forceCode = null) {
  if (forceCode && bank[forceCode]) return { code: forceCode, ...bank[forceCode] };
  const codes = Object.keys(bank);
  const code  = codes[Math.floor(Math.random() * codes.length)];
  return { code, ...bank[code] };
}

function buildTag(niche, sbj, hok, cta) {
  return `${niche}_${sbj.code}_${hok.code}_${cta.code}`;
}

// ─── Prompt Builders ──────────────────────────────────────────────────────────

const PRODUCT_CONTEXT = `
PRODUCT: Simaroa Media helps local healthcare and wellness clinics appear on NBC, CBS, Fox, and 500+ news sites — and in AI search results (ChatGPT, Claude, Perplexity).

PAIN: Ketamine clinics, infusion centers, and wellness practices can't run paid ads (Google/Meta restrict the category). Organic content is the only scalable channel. Competitors who invest in content syndication appear when a patient asks ChatGPT "best ketamine clinic near me" — the invisible clinic loses that patient.

OFFER: Content syndication package — brand authority article published on NBC/ABC/CBS/Fox affiliates + 500 sites. Result: Google News, AI search visibility, DA 70–90+ backlinks.

VALUE PROP: This is the playbook used by the top-ranked clinics in any market. Patients are asking AI before they Google. If you're not in AI search, you're losing them to whoever is.
`;

function leadContext(lead) {
  const name = lead.contact_name?.split(' ')[0] || null;
  return {
    firstName: name,
    greeting: name ? `Hi ${name},` : 'Hi,',
    block: `Clinic: ${lead.company_name}\nContact: ${name || 'unknown'}\nNiche: ${lead.niche || 'healthcare/wellness'}\nCity: ${lead.city || ''}, ${lead.state || 'US'}\nWebsite: ${lead.website || 'unknown'}`,
  };
}

function commonRules(greeting, ctaText, maxWords = 80) {
  return `
RULES (follow strictly):
- Write in English — direct, confident, peer-to-peer tone
- MAX ${maxWords} words in email body — shorter is better
- Sign off: "Jan Malmström\\nSimaroa Media"
- NEVER open with clichés ("Hope this finds you well", etc.)
- End with this exact CTA: "${ctaText}"
- NEVER say "book a call", "schedule a demo", "15 minutes"
- NEVER invent case studies, client names, or specific revenue/patient numbers
- Generate 2 alternative subject lines, mark recommended with ★

FORMAT:
Subject: [recommended ★] | [alternative]

[email body starting with: ${greeting}]`;
}

function buildEmail1Prompt(lead, sbj, hok, cta) {
  const { greeting, block } = leadContext(lead);
  return `You are a B2B outreach specialist for Simaroa Media, a content syndication agency for healthcare clinics.

Write the FIRST cold email. Short, almost no pitch — open a door, nothing more.

SUBJECT LINE DIRECTIVE:
${sbj.directive}

OPENING HOOK DIRECTIVE (lines 1-2 of email body):
${hok.directive}

After the hook: one sentence connecting to our offer. Then the CTA.

${PRODUCT_CONTEXT}
${block}
${commonRules(greeting, cta.text, 80)}`;
}

function buildEmail2Prompt(lead, sbj, hok, cta, enrolledAt) {
  const { greeting, block } = leadContext(lead);
  return `You are a B2B outreach specialist for Simaroa Media.

Write FOLLOW-UP EMAIL 2. It has been ${daysSince(enrolledAt)} days since the first email.
Open with a brief "circling back" — then go into the hook.

SUBJECT LINE DIRECTIVE:
${sbj.directive}

OPENING HOOK DIRECTIVE (lines 1-2 of email body):
${hok.directive}

After the hook: one specific angle about the AI search gap for ad-restricted clinics in their niche. Then the CTA.

${PRODUCT_CONTEXT}
${block}
${commonRules(greeting, cta.text, 80)}`;
}

function buildEmail3Prompt(lead, sbj, hok, cta, enrolledAt) {
  const { firstName, greeting, block } = leadContext(lead);
  return `You are a B2B outreach specialist for Simaroa Media.

Write the FINAL breakup email. It has been ${daysSince(enrolledAt)} days since the first email.
Open with "I'll stop reaching out after this" — then the hook — then leave the door open with the checkout link.

SUBJECT LINE DIRECTIVE:
${sbj.directive}

OPENING HOOK DIRECTIVE (lines 1-2 of email body):
${hok.directive}

Close with: "If you want to move forward on your own, no call needed — here's the link:" then ${PADDLE_CHECKOUT_URL} on its own line.

${PRODUCT_CONTEXT}
${block}

RULES (follow strictly):
- Write in English — direct, confident, peer-to-peer tone
- MAX 100 words in email body
- Sign off: "Jan Malmström\\nSimaroa Media"
- NO soft yes/no CTA — this is the breakup, just leave the door open
- Include checkout link once, on its own line
- NEVER invent case studies, client names, or specific revenue numbers
- Generate 2 alternative subject lines, mark recommended with ★

FORMAT:
Subject: [recommended ★] | [alternative]

[email body starting with: ${greeting}]`;
}

function buildLoomPrompt(lead, enrolledAt) {
  const { greeting } = leadContext(lead);
  return `You are a B2B outreach specialist for Simaroa Media.

Write a SHORT email (max 60 words) sending a Loom video link to the prospect.
The video shows their clinic's AI visibility score vs competitors in their city.

One sentence framing the video ("Made you a 2-minute video showing..."). Include the Loom URL on its own line. One sentence on what they'll see. No pitch, no CTA — just deliver the video.

LOOM URL: ${LOOM_URL}

Clinic: ${lead.company_name}
City: ${lead.city || ''}, ${lead.state || 'US'}
Days since first email: ${daysSince(enrolledAt)}

RULES:
- MAX 60 words in email body
- Sign off: "Jan Malmström\\nSimaroa Media"
- Put Loom URL on its own line
- NO hard CTA
- Generate 2 subject lines, mark recommended with ★

FORMAT:
Subject: [recommended ★] | [alternative]

[email body starting with: ${greeting}]`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysSince(dateStr) {
  if (!dateStr) return 'a few';
  const days = Math.round((Date.now() - new Date(dateStr).getTime()) / 86400000);
  return days > 0 ? days : 1;
}

function parseGenerated(text) {
  const subjectLine = text.match(/^\*{0,2}Subject:\*{0,2}\s*(.+)/mi)?.[1] || '';
  let subject = subjectLine;
  const starMatch  = subjectLine.match(/([^|★]+)★/);
  const afterStar  = subjectLine.match(/★([^|]+)/);
  if (starMatch)      subject = starMatch[1].trim().replace(/[★|]/g, '').trim();
  else if (afterStar) subject = afterStar[1].trim();
  const body = text.replace(/^\*{0,2}Subject:\*{0,2}\s*.+\n\n?/mi, '').trim();
  return { subject, body, full: text };
}

function getEmailStep(options) {
  const { stepIndex = 0, stepChannel, steps } = options;
  if (stepChannel === 'loom') return 'loom';
  const emailStepNumber = steps
    ? steps.slice(0, stepIndex).filter(s => s.channel === 'email').length
    : (stepIndex > 0 ? 1 : 0);
  return ['email_1', 'email_2', 'email_3'][emailStepNumber] || 'email_3';
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function generatePitch(lead, options = {}) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

  const { componentCodes, enrolledAt } = options;
  const step = getEmailStep(options);

  // Loom step bypasses component system
  if (step === 'loom') {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: 'You write concise, human B2B cold emails for healthcare clinic outreach.',
      messages: [{ role: 'user', content: buildLoomPrompt(lead, enrolledAt) }],
    });
    return { ...parseGenerated(msg.content[0].text), components: 'LOOM', componentCodes: null };
  }

  // Pick components (locked if componentCodes provided, random otherwise)
  const sbj = pickComponent(SUBJECT_BANK, componentCodes?.sbj);
  const hok = pickComponent(HOOK_BANK,    componentCodes?.hok);
  const cta = pickComponent(CTA_BANK,     componentCodes?.cta);
  const tag = buildTag('KET', sbj, hok, cta);

  const prompts = {
    email_1: () => buildEmail1Prompt(lead, sbj, hok, cta),
    email_2: () => buildEmail2Prompt(lead, sbj, hok, cta, enrolledAt),
    email_3: () => buildEmail3Prompt(lead, sbj, hok, cta, enrolledAt),
  };

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 900,
    system: 'You are an expert B2B copywriter for healthcare outreach. You write concise, credible cold emails that feel human — not salesy. You follow component directives exactly while keeping the email natural.',
    messages: [{ role: 'user', content: prompts[step]() }],
  });

  return {
    ...parseGenerated(msg.content[0].text),
    components:     tag,                                          // 'KET_SBJ2_HOK4_CTA1'
    componentCodes: { sbj: sbj.code, hok: hok.code, cta: cta.code }, // pass to follow-ups
    step,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  generatePitch,
  SUBJECT_BANK,
  HOOK_BANK,
  CTA_BANK,
};
