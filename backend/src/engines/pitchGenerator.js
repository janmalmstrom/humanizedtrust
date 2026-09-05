/**
 * pitchGenerator.js — Modular outreach engine for Simaroa Media
 *
 * Emails are assembled from 3 independent components tracked separately:
 *   SBJ (subject line type) — what gets the email opened
 *   HOK (opening hook type) — what earns the reply
 *   CTA (call-to-action type) — what drives self-serve purchase (no call, no meeting)
 *
 * Every generated email carries a combo tag: KET_SBJ2_HOK4_CTA1
 * Track open rate by SBJ, reply rate by HOK, checkout clicks by CTA.
 * Goal: prospect reads email → clicks Paddle link → buys. No meeting required.
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
  // Outcome-framed hooks — lead with what happens to THEIR business, not how the technology works
  HOK1: { type: 'reframe',        directive: 'Opening hook — REFRAME (outcome): The clinics getting new patients from AI search aren\'t doing more marketing — they made one positioning move that made them the recommended answer. Land on the OUTCOME (patients they\'re getting) not the mechanism (how AI works).' },
  HOK2: { type: 'mechanism',      directive: 'Opening hook — MECHANISM (outcome): Patients in their city are already asking AI assistants which clinic to choose — and getting a specific answer. Some clinics are being recommended. Others don\'t exist in that conversation. Focus on what it means for their patient pipeline, not the technology itself.' },
  HOK3: { type: 'contrast',       directive: 'Opening hook — CONTRAST (outcome): A competitor type in their market is already being recommended by AI when patients search. That clinic is getting patients this clinic doesn\'t know it\'s losing. Make the lost patient outcome feel real and specific, without inventing names or numbers.' },
  HOK4: { type: 'proof',          directive: 'Opening hook — PROOF (outcome): You looked at what AI recommends for their niche in their city. There\'s a clear winner in that conversation — and it\'s not them yet. Frame it as patients actively choosing elsewhere, not as a technical SEO problem.' },
  HOK5: { type: 'permission',     directive: 'Opening hook — PERMISSION (outcome): Ultra-short. Signal you found something about which clinics patients are being sent to by AI in their area — and ask if it\'s worth a look. One sentence. No pitch. Make the outcome (patient referrals) the carrot, not the process.' },
  HOK6: { type: 'loss',           directive: 'Opening hook — LOSS AVERSION (outcome): Every week a patient asks AI for a ketamine clinic in their city and gets sent somewhere else, that\'s a patient they\'ll never get back. The window to be the recommended clinic in their market is still open — but it closes as competitors move first. Land on the cost of waiting, not the features of the solution.' },
};

// CTA types — determines self-serve conversion rate (reply → clicks checkout link → buys)
// Goal: customer buys via Paddle checkout without ever needing a call or meeting
// Outcome-framed: CTAs tie back to what they get, not what we do
const CTA_BANK = {
  CTA1: { type: 'outcome_logic',    text: 'Worth seeing if your market is still open?' },
  CTA2: { type: 'outcome_identity', text: 'Is being the recommended clinic in your city something you\'re working toward?' },
  CTA3: { type: 'loss_aversion',    text: 'Want to see what patients are being told when they ask AI about clinics in your city?' },
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
OUTCOME: Simaroa Media makes a clinic the AI-recommended answer when patients in their city search for ketamine therapy, infusion treatment, or wellness services. The clinic becomes the name ChatGPT, Claude, and Perplexity cite by name — before a patient ever opens Google.

PAIN: Ketamine clinics can't run paid ads. Every patient who asks an AI assistant "best ketamine clinic near me" gets sent to whoever shows up in AI results. If that's not this clinic, it's a competitor. That's happening right now, every day, with zero visibility into how many patients are being redirected.

HOW IT WORKS (internal context only — do NOT describe the mechanism in the email): A brand authority article is published on NBC/ABC/CBS/Fox affiliates and 500+ news sites. AI assistants are trained on published news. When a patient searches, the clinic with published authority gets cited. One article. One-time $797. The clinic becomes findable in AI search.

FRAMING RULE: Never lead with "we publish articles" or "content syndication." Always lead with the patient outcome — patients finding the clinic through AI, patients being recommended by ChatGPT, being the name that comes up. The article is the mechanism, not the value.
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

Close with one sentence about the cost of waiting (the market position is being taken by someone — if not them, then a competitor). Then: "If you want to claim it, no call needed:" then ${PADDLE_CHECKOUT_URL} on its own line.

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
