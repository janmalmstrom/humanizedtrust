/**
 * pitchGenerator.js — Simaroa Media outreach for US healthcare/wellness clinics
 *
 * Pitch angle: AI brand visibility — competitors showing up on ChatGPT/Perplexity/Claude,
 * appearing on NBC/CBS/Fox through content syndication. Clinic owners missing patients because
 * they're invisible in AI search. AmpiFire = solution.
 *
 * Sequence map (combined LinkedIn + email):
 *   email_1 → Email 1: AI visibility cold intro
 *   email_2 → Email 2: Competitor gap angle
 *   email_3 → Email 3: Social proof / breakup
 */

const Anthropic = require('@anthropic-ai/sdk');

const PITCH_ANGLE = `
PRODUCT: Simaroa Media helps local healthcare and wellness clinics appear on NBC, CBS, Fox, and 500+ news sites — and in AI search results (ChatGPT, Claude, Perplexity).

PAIN: Ketamine clinics, infusion centers, and wellness practices can't run paid ads (Google/Meta restrict the category). Organic content is the only scalable channel. Competitors who invest in content syndication appear when a patient asks ChatGPT "best ketamine clinic near me" — you don't.

OFFER: AmpiFire content syndication package — brand authority article published on NBC/ABC/CBS/Fox affiliates + 500 sites. Cost: $797 one-time. Result: Google News, AI search visibility, DA 70–90+ backlinks.

VALUE PROP: This is the playbook used by the top-ranked clinics in your market. Patients are asking AI before they Google. If you're not in AI search, you're losing them to whoever is.

CTA: One soft yes/no question — "Worth a quick look?" OR "Is this on your radar?" — never "book a call" or "schedule a demo".
`;

function buildPrompt(lead, options = {}) {
  const { stepIndex = 0, enrolledAt, steps } = options;

  const emailStepNumber = steps
    ? steps.slice(0, stepIndex).filter(s => s.channel === 'email').length
    : (stepIndex > 0 ? 1 : 0);

  const framework = getFramework(emailStepNumber);

  const contactName = lead.contact_name?.split(' ')[0] || null;
  const greeting = contactName ? `Hi ${contactName},` : 'Hi,';

  const leadCtx = `
Clinic: ${lead.company_name}
Contact: ${contactName ? contactName + ' (owner/decision-maker)' : 'unknown contact'}
Niche: ${lead.niche || 'healthcare/wellness'}
City: ${lead.city || ''}, ${lead.state || 'US'}
Website: ${lead.website || 'unknown'}
`;

  const commonRules = `
RULES (follow strictly):
- Write in English — direct, confident, peer-to-peer tone
- MAX 80 words in email body — shorter is better
- Subject line + email body
- Sign off with: "Jan Malmström\\nSimaroa Media"
- NEVER start with "Hope this email finds you well" or similar clichés
- CTA: end with a soft yes/no question — EXACTLY one of: "Worth a quick look?" OR "Is this on your radar?"
- NEVER say "book a call", "schedule a demo", "15 minutes"
- Generate 2 alternative subject lines, mark best with ★
- NEVER invent case studies, client names, or specific revenue numbers

FORMAT:
Subject: [best subject ★] | [alternative subject]

[email body starting with: ${greeting}]`;

  const frameworks = {
    email_1: `You are a B2B outreach specialist for Simaroa Media, a content syndication agency for healthcare clinics.

Write the FIRST cold email. Short, curiosity-driven, almost no pitch.
Tactic: One sentence about what ${lead.company_name} might be missing in AI search. One sentence about patients asking ChatGPT before Google. A soft yes/no CTA.

${PITCH_ANGLE}
${leadCtx}
${commonRules}`,

    email_2: `You are a B2B outreach specialist for Simaroa Media.

Write FOLLOW-UP EMAIL 2. It has been ${daysSince(enrolledAt)} days since the first email.
Tactic: "Wanted to circle back..." + one specific angle about competitors in their city/niche appearing on NBC/CBS/Fox while they're invisible. The AI search gap for ketamine/infusion clinics specifically. Soft yes/no CTA.

${PITCH_ANGLE}
${leadCtx}
${commonRules}`,

    email_3: `You are a B2B outreach specialist for Simaroa Media.

Write the FINAL email (breakup-style). It has been ${daysSince(enrolledAt)} days since the first email.
Tactic: "I'll stop reaching out after this..." + one last observation about the AI search blind spot for ad-restricted healthcare clinics. Leave the door open — no pressure. No hard CTA, just "let me know if the timing ever works."

${PITCH_ANGLE}
${leadCtx}
${commonRules}`,
  };

  return frameworks[framework] || frameworks.email_1;
}

function getFramework(emailStepNumber) {
  const map = ['email_1', 'email_2', 'email_3'];
  return map[emailStepNumber] || 'email_3';
}

function daysSince(dateStr) {
  if (!dateStr) return 'a few';
  const days = Math.round((Date.now() - new Date(dateStr).getTime()) / 86400000);
  return days > 0 ? days : 1;
}

function parseGenerated(text) {
  // Match "Subject:" line
  const subjectLine = text.match(/^\*{0,2}Subject:\*{0,2}\s*(.+)/mi)?.[1] || '';
  let subject = subjectLine;
  const starMatch = subjectLine.match(/([^|★]+)★/);
  const afterStar = subjectLine.match(/★([^|]+)/);
  if (starMatch) subject = starMatch[1].trim().replace(/[★|]/g, '').trim();
  else if (afterStar) subject = afterStar[1].trim();

  const body = text.replace(/^\*{0,2}Subject:\*{0,2}\s*.+\n\n?/mi, '').trim();
  return { subject, body, full: text };
}

async function generatePitch(lead, options = {}) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = buildPrompt(lead, options);

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 900,
    system: `You are an expert B2B copywriter specializing in outreach for healthcare and wellness businesses. You write concise, credible cold emails that feel human — not salesy. You understand that ketamine clinics, infusion centers, and wellness practices operate in an ad-restricted environment, making organic and AI search visibility their most critical marketing channel.`,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseGenerated(message.content[0].text);
}

module.exports = { generatePitch };
