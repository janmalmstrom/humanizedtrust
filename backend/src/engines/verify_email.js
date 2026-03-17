/**
 * Email Verification Engine
 * Verifies email format, domain existence, and MX records
 *
 * Progressive verification:
 * 1. Format validation (regex)
 * 2. Domain existence check
 * 3. MX record lookup
 */

const dns = require('dns').promises;
const { promisify } = require('util');
const net = require('net');

/**
 * Email format validation (RFC 5322 compliant, simplified)
 */
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Verify email format, domain, and MX record
 *
 * @param {string} email - Email address to verify
 * @returns {Promise<Object>} Verification result
 */
async function verifyEmail(email) {
  if (!email) {
    return {
      valid: false,
      status: 'format_error',
      error: 'No email provided'
    };
  }

  // Step 1: Format validation
  if (!EMAIL_REGEX.test(email)) {
    return {
      valid: false,
      status: 'format_error',
      error: 'Invalid email format'
    };
  }

  // Extract domain
  const domain = email.split('@')[1].toLowerCase();

  // Step 2: Domain existence check
  try {
    await dns.lookup(domain);
  } catch {
    return {
      valid: false,
      status: 'invalid',
      error: 'Domain does not exist'
    };
  }

  // Step 3: MX record lookup
  try {
    const mxRecords = await dns.resolveMx(domain);

    if (!mxRecords || mxRecords.length === 0) {
      return {
        valid: false,
        status: 'invalid',
        error: 'No MX records found'
      };
    }

    return {
      valid: true,
      status: 'mx_ok',
      mx_records: mxRecords.map(r => r.exchange),
      domain: domain
    };

  } catch {
    return {
      valid: false,
      status: 'invalid',
      error: 'MX lookup failed'
    };
  }
}

/**
 * Verify multiple emails in batch
 */
async function verifyBatch(emails) {
  const results = [];

  for (const email of emails) {
    const verified = await verifyEmail(email);

    results.push({
      email,
      ...verified
    });

    // Small delay to avoid overwhelming DNS
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return results;
}

/**
 * Update discovery_leads with verification status
 */
async function updateVerificationStatus(db, leadId, verificationResult) {
  const { valid, status, error } = verificationResult;

  const { rows } = await db.query(
    `UPDATE discovery_leads
     SET email_status = $1,
         enrich_status = CASE
           WHEN $2 = true THEN 'verified'
           ELSE enrich_status
         END
     WHERE id = $3
     RETURNING id`,
    [status, valid, leadId]
  );

  return rows[0];
}

/**
 * Check if email is disposable or temporary
 */
const DISPOSABLE_DOMAINS = new Set([
  'tempmail.com', 'guerrillamail.com', 'mailinator.com', '10minutemail.com',
  'throwaway.email', 'sharklasers.com', 'getnada.com', 'yopmail.com'
]);

function isDisposableEmail(email) {
  if (!email) return false;
  const domain = email.split('@')[1].toLowerCase();
  return DISPOSABLE_DOMAINS.has(domain);
}

/**
 * Check if email is role-based (info, contact, etc.)
 */
function isRoleBasedEmail(email) {
  if (!email) return false;
  const prefix = email.split('@')[0].toLowerCase();
  const rolePrefixes = ['info', 'contact', 'admin', 'support', 'sales', 'office', 'help', 'enquiries', 'jobs', 'hr'];
  return rolePrefixes.some(role => prefix === role);
}

/**
 * Check if email is from free provider
 */
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'mail.com', 'protonmail.com', 'yandex.com', 'gmx.com',
  'zoho.com', 'live.com', 'msn.com'
]);

function isFreeEmail(email) {
  if (!email) return false;
  const domain = email.split('@')[1].toLowerCase();
  return FREE_EMAIL_DOMAINS.has(domain);
}

/**
 * Get email classification
 */
function classifyEmail(email) {
  if (!email) return { type: 'none' };

  const classification = {
    type: 'unknown',
    isDisposable: false,
    isRoleBased: false,
    isFree: false
  };

  if (isDisposableEmail(email)) {
    classification.type = 'disposable';
    classification.isDisposable = true;
  } else if (isRoleBasedEmail(email)) {
    classification.type = 'role';
    classification.isRoleBased = true;
  } else if (isFreeEmail(email)) {
    classification.type = 'free';
    classification.isFree = true;
  } else {
    classification.type = 'business';
  }

  return classification;
}

module.exports = {
  verifyEmail,
  verifyBatch,
  updateVerificationStatus,
  isDisposableEmail,
  isRoleBasedEmail,
  isFreeEmail,
  classifyEmail
};
