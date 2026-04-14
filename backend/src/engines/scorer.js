/**
 * HumanizedTrust Lead Scorer — Swedish B2B / Nomad Cyber
 * Scores 0-100. Hot = 70+, Warm = 40-69, Cold = 0-39
 *
 * Signal priorities:
 * 1. NIS2 registration = compliance urgency = highest intent
 * 2. Employee size 50-249 = sweet spot (can afford, not too complex)
 * 3. Target NACE sectors: Manufacturing, Healthcare, Financial, IT
 * 4. Contact data (email, LinkedIn)
 * 5. Vibe enrichment signals
 */

// NACE codes that align with Nomad Cyber's target verticals
const HOT_NACE_PREFIXES = [
  '25','26','27','28','29','30','31','32','33', // Manufacturing
  '86','87','88',                               // Healthcare
  '64','65','66',                               // Financial services
  '35','36',                                   // Energy (NIS2 critical)
  '49','50','51','52','53'                      // Transport (NIS2 critical)
];

const WARM_NACE_PREFIXES = [
  '62','63',  // IT services (already tech-savvy, harder sell)
  '41','42','43', // Construction
  '55','56',  // Hospitality
  '68',       // Real estate
];

// NIS2 sectors from MSB's scope
const NIS2_SECTORS = ['energy','transport','health','digital_infra','finance','water','public_admin','space'];

function isTargetNACE(naceCode) {
  if (!naceCode) return false;
  const code = String(naceCode).replace(/\./g, '');
  return HOT_NACE_PREFIXES.some(prefix => code.startsWith(prefix));
}

function isWarmNACE(naceCode) {
  if (!naceCode) return false;
  const code = String(naceCode).replace(/\./g, '');
  return WARM_NACE_PREFIXES.some(prefix => code.startsWith(prefix));
}

function getEmployeeScore(employeeRange) {
  if (!employeeRange) return { score: 0, label: null };
  const r = employeeRange.toLowerCase().replace(/\s/g, '');

  // Sweet spot: 50-249 (can afford Nomad services, big enough to have compliance risk)
  if (r.includes('50-99') || r.includes('100-199') || r.includes('50-249') || r.includes('100-249')) {
    return { score: 30, label: 'sweet_spot' };
  }
  if (r.includes('200-499') || r.includes('250-499')) {
    return { score: 15, label: 'upper_mid' };
  }
  if (r.includes('10-49') || r.includes('20-49')) {
    return { score: 8, label: 'small' };
  }
  if (r.includes('500') || r.includes('1000') || r.includes('+')) {
    return { score: 5, label: 'enterprise' }; // Likely have internal security team
  }
  return { score: 0, label: null };
}

function computeScore(lead) {
  let totalScore = 0;
  const breakdown = {
    nis2: {},
    company_fit: {},
    contact: {},
    enrichment: {},
    penalties: {}
  };

  // ========== NIS2 SIGNALS (highest priority) ==========
  if (lead.nis2_registered === true) {
    breakdown.nis2.registered = 30;
    totalScore += 30;
  }
  if (lead.nis2_sector && NIS2_SECTORS.includes(lead.nis2_sector)) {
    breakdown.nis2.critical_sector = 10;
    totalScore += 10;
  }

  // ========== COMPANY FIT ==========
  // Employee range
  const empScore = getEmployeeScore(lead.employee_range);
  if (empScore.score > 0) {
    breakdown.company_fit[`employees_${empScore.label}`] = empScore.score;
    totalScore += empScore.score;
  }

  // NACE sector
  if (isTargetNACE(lead.nace_code)) {
    breakdown.company_fit.target_nace = 20;
    totalScore += 20;
  } else if (isWarmNACE(lead.nace_code)) {
    breakdown.company_fit.warm_nace = 5;
    totalScore += 5;
  }

  // Has website (professional presence)
  if (lead.website) {
    breakdown.company_fit.has_website = 5;
    totalScore += 5;
  }

  // ========== CONTACT DATA ==========
  if (lead.email) {
    breakdown.contact.has_email = 15;
    totalScore += 15;
    if (lead.email_status === 'verified') {
      breakdown.contact.email_verified = 5;
      totalScore += 5;
    }
  }
  if (lead.linkedin_url) {
    breakdown.contact.has_linkedin = 5;
    totalScore += 5;
  }
  if (lead.phone) {
    breakdown.contact.has_phone = 3;
    totalScore += 3;
  }

  // ========== BOARD CONTACTS (NIS2 liability targets) ==========
  // Having named board members = can reach the personally liable decision makers
  if (lead.board_contacts_count > 0) {
    breakdown.contact.has_board_contacts = 10;
    totalScore += 10;
  }

  // ========== MICROSOFT 365 SWEET-SPOT BONUS ==========
  // M365 leads in sweet spot: known stack → tailored pitch → higher conversion
  if (lead.tech_stack === 'microsoft365') {
    const isSweetSpot = empScore.label === 'sweet_spot';
    breakdown.enrichment.microsoft365 = isSweetSpot ? 15 : 8;
    totalScore += isSweetSpot ? 15 : 8;
  }

  // ========== VIBE ENRICHMENT SIGNALS ==========
  if (lead.vibe_has_crm === false) {
    // No CRM = no current management software = greenfield for Nomad services
    breakdown.enrichment.no_crm = 10;
    totalScore += 10;
  }
  if (lead.vibe_has_crm === true) {
    // Has some software infrastructure (neutral for cybersecurity, slight positive)
    breakdown.enrichment.has_tech = 3;
    totalScore += 3;
  }
  if (lead.vibe_linkedin_profile) {
    breakdown.enrichment.vibe_linkedin = 3;
    totalScore += 3;
  }

  // ========== PENALTIES ==========
  // IT companies already have internal expertise
  if (lead.nace_code && String(lead.nace_code).startsWith('62')) {
    breakdown.penalties.it_company = -10;
    totalScore -= 10;
  }
  // Very large companies (500+) likely have dedicated security teams
  if (lead.employee_range && (lead.employee_range.includes('500') || lead.employee_range.includes('1000'))) {
    const alreadyPenalized = breakdown.company_fit.employees_enterprise;
    if (!alreadyPenalized) {
      breakdown.penalties.too_large = -10;
      totalScore -= 10;
    }
  }

  totalScore = Math.max(0, Math.min(100, totalScore));

  let label = 'cold';
  if (totalScore >= 70) label = 'hot';
  else if (totalScore >= 40) label = 'warm';

  return { score: totalScore, label, breakdown };
}

async function scoreLead(leadId, db) {
  const { rows } = await db.query('SELECT * FROM discovery_leads WHERE id = $1', [leadId]);
  if (!rows[0]) return null;

  const { score, label, breakdown } = computeScore(rows[0]);
  await db.query(
    'UPDATE discovery_leads SET score = $1, score_label = $2, score_breakdown = $3, updated_at = NOW() WHERE id = $4',
    [score, label, JSON.stringify(breakdown), leadId]
  );
  return { score, label, breakdown };
}

async function rescoreAll(db) {
  const { rows } = await db.query('SELECT * FROM discovery_leads');
  let updated = 0;
  for (const lead of rows) {
    const { score, label, breakdown } = computeScore(lead);
    await db.query(
      'UPDATE discovery_leads SET score = $1, score_label = $2, score_breakdown = $3, updated_at = NOW() WHERE id = $4',
      [score, label, JSON.stringify(breakdown), lead.id]
    );
    updated++;
  }
  return updated;
}

module.exports = { computeScore, scoreLead, rescoreAll, isTargetNACE, HOT_NACE_PREFIXES };
