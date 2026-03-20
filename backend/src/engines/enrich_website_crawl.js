/**
 * Website Crawler Engine - Enhanced
 * Light, limited crawler for extracting contact information from business websites
 *
 * Enhanced features:
 * - More target pages (leadership, our-story, founders, etc.)
 * - Schema.org JSON-LD extraction
 * - Better name parsing patterns
 * - Context-aware extraction around Owner/Founder/CEO labels
 *
 * Safety limits:
 * - 10-second timeout per page
 * - Max 10 pages per domain
 * - User-Agent identification
 */

const { chromium } = require('playwright');
// serviceDetector not used in HumanizedTrust (cleaning-specific, not needed here)
const detectServices = () => [];
const mergeServices  = (a, b) => [...(a||[]), ...(b||[])];

// Decision maker titles for contact extraction
const DECISION_MAKER_PATTERNS = [
  /\b(?:owner|founder|ceo|chief executive officer|president)\b/i,
  /\b(?:coo|chief operating officer|cto|chief technology officer)\b/i,
  /\b(?:director|vp|vice president|manager|head of|general manager)\b/i,
  /\b(?:operations? manager|office manager)\b/i
];

// Email regex (RFC 5322 compliant, simplified)
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Swedish phone regex: +46XXXXXXXXX or 0XXXXXXXXX (mobile/landline)
const PHONE_REGEX = /(?:\+46|0)[\s\-]?(?:\d[\s\-]?){7,10}\d/g;

// Enhanced name patterns - more flexible matching
const NAME_PATTERNS = [
  /^([A-Z][a-z]+)\s+([A-Z][a-z]+)$/,           // John Smith
  /^([A-Z][a-z]+)\s+([A-Z]\.)\s+([A-Z][a-z]+)$/, // John A. Smith
  /^([A-Z][a-z]+)\s+(?:de|van|der|von|bin)\s+([A-Z][a-z]+)$/, // International
  /^([A-Z][a-z]+)\s+([A-Z][a-z]+)\s+([A-Z][a-z]+)$/, // John Middle Smith
];

/**
 * Check if email should be filtered out (false positive, placeholder, or non-functional)
 */
function shouldFilterEmail(email) {
  const emailLower = email.toLowerCase();

  // Placeholder domains
  if (emailLower.includes('@example.') ||
      emailLower.includes('@domain.') ||
      emailLower.includes('@placeholder.') ||
      emailLower.includes('@test.') ||
      emailLower.includes('@yourdomain.') ||
      emailLower.includes('@localhost.')) {
    return true;
  }

  // Technical/automated emails
  if (emailLower.startsWith('noreply@') ||
      emailLower.startsWith('no-reply@') ||
      emailLower.startsWith('donotreply@') ||
      emailLower.startsWith('do-not-reply@')) {
    return true;
  }

  // Generic role-based emails — keep admin@ but allow support@ (small businesses use it as main contact)
  if (emailLower.startsWith('admin@')) {
    return true;
  }

  // Franchise and corporate inquiry emails (not decision makers)
  if (emailLower.includes('franchise') ||
      emailLower.includes('franchising') ||
      emailLower.includes('development') ||
      emailLower.includes('opportunities') ||
      emailLower.includes('careers') ||
      emailLower.includes('jobs') ||
      emailLower.includes('hr@') ||
      emailLower.includes('recruiting')) {
    return true;
  }

  // Technical false positives
  if (emailLower.includes('@sentry.') ||
      emailLower.includes('@wixpress.') ||
      emailLower.match(/\.(png|jpg|jpeg|gif|svg|webp|bmp|ico|css|js|html|php|xml|json)$/i) ||
      emailLower.match(/@(2x|3x|4x|thumb|small|large|preview)\./i) ||
      emailLower.includes('.png@') ||
      emailLower.includes('.jpg@')) {
    return true;
  }

  // Image-related patterns (flags@2x.webp, etc.)
  if (emailLower.match(/^(flags|icon|img|image|thumb|preview|photo|pic)@/i)) {
    return true;
  }

  return false;
}

/**
 * Crawl website for contact information
 *
 * @param {string} website - Website URL
 * @returns {Promise<Object>} Extracted contact data
 */
async function crawlForContacts(website) {
  if (!website) {
    return {
      email: null,
      contact_first_name: null,
      confidence: 0,
      error: 'No website provided'
    };
  }

  // Normalize URL
  let baseUrl = website;
  if (!baseUrl.startsWith('http')) {
    baseUrl = 'https://' + baseUrl;
  }

  try {
    new URL(baseUrl); // Validate URL
  } catch {
    return {
      email: null,
      contact_first_name: null,
      confidence: 0,
      error: 'Invalid URL'
    };
  }

  console.log(`[Crawler] Crawling: ${baseUrl}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    userAgent: 'TrustLeads-Bot/1.0 (+https://trustleads.xyz/bot)',
    viewport: { width: 1920, height: 1080 }
  });

  const results = {
    emails: new Set(),
    phones: new Set(),
    contacts: [],
    services: [],
    pages_crawled: 0
  };

  try {
    // ENHANCED: More target pages for better coverage
    const paths = [
      '/',                // homepage
      '/contact',         // contact page
      '/contact-us',      // contact (alt)
      '/get-in-touch',    // contact (alt 2)
      '/about',           // about us
      '/about-us',        // about (alt)
      '/team',            // team page
      '/our-team',        // team (alt)
      '/staff',           // staff page
      '/leadership',      // NEW: leadership/executive page
      '/our-story',       // NEW: company story
      '/founders',        // NEW: founders page
      '/meet-the-team',   // NEW: meet the team
      '/management',      // NEW: management
      '/services',        // services (fallback)
      '/privacy-policy',  // often contains contact email
      '/privacy'          // alt privacy page
    ];

    for (const path of paths) {
      if (results.pages_crawled >= 10) break;  // ENHANCED: increased from 6 to 10

      const url = new URL(path, baseUrl).toString();

      try {
        const page = await context.newPage();
        page.setDefaultTimeout(10000); // 10-second timeout

        // Wait for network idle to catch JS-loaded content
        await page.goto(url, {
          waitUntil: 'networkidle',
          timeout: 10000
        });

        // ENHANCED: Extract schema.org JSON-LD first (has structured data)
        await extractStructuredData(page, results);

        // Extract emails and phones from multiple sources
        await extractEmailsFromPage(page, results);
        await extractPhonesFromPage(page, results);

        // Extract contact names
        await extractContacts(page, results);

        // Detect services offered (for campaign auto-routing)
        await extractServicesFromPage(page, results);

        results.pages_crawled++;

        await page.close();

        // Be nice: 1 second between requests
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (err) {
        console.log(`[Crawler] Failed to crawl ${url}: ${err.message}`);
        // Continue to next page
      }
    }

    // Select best email, phone and contact
    const bestEmail = selectBestEmail([...results.emails]);
    const bestPhone = selectBestPhone([...results.phones]);
    const bestContact = selectBestContact(results.contacts);

    const confidence = calculateCrawlConfidence(bestEmail, bestContact, results);

    const detectedServices = [...new Set(results.services)];
    console.log(`[Crawler] Found ${results.emails.size} emails, ${results.phones.size} phones, ${results.contacts.length} contacts`);

    return {
      email: bestEmail || null,
      phone: bestPhone || null,
      contact_first_name: bestContact?.firstName || null,
      confidence,
      emails_found: results.emails.size,
      contacts_found: results.contacts.length,
      pages_crawled: results.pages_crawled,
      detected_services: detectedServices
    };

  } finally {
    await browser.close();
  }
}

/**
 * ENHANCED: Extract structured data from schema.org JSON-LD
 */
async function extractStructuredData(page, results) {
  try {
    const scripts = await page.locator('script[type="application/ld+json"]').all();

    for (const script of scripts) {
      try {
        const content = await script.textContent();
        if (!content) continue;

        const data = JSON.parse(content);

        // Handle single object or array
        const items = Array.isArray(data) ? data : [data];

        for (const item of items) {
          // Look for Organization/Person data
          if (item['@type'] === 'Organization' || item['@type'] === 'Person') {
            // Extract email
            if (item.email) {
              const emails = String(item.email).match(EMAIL_REGEX) || [];
              emails.forEach(email => {
                if (!shouldFilterEmail(email)) {
                  results.emails.add(email.toLowerCase());
                }
              });
            }

            // Extract name for contacts
            if (item.name || item.founder || item.founders) {
              const nameToParse = item.founder || item.founders || item.name;
              if (typeof nameToParse === 'string') {
                const parsed = parseNameEnhanced(nameToParse);
                if (parsed) {
                  results.contacts.push({
                    ...parsed,
                    source: 'schema-org'
                  });
                }
              } else if (Array.isArray(nameToParse)) {
                nameToParse.forEach(name => {
                  if (typeof name === 'string' || name?.name) {
                    const parsed = parseNameEnhanced(typeof name === 'string' ? name : name.name);
                    if (parsed) {
                      results.contacts.push({
                        ...parsed,
                        source: 'schema-org'
                      });
                    }
                  }
                });
              }
            }

            // Extract from employee array
            if (item.employee) {
              const employees = Array.isArray(item.employee) ? item.employee : [item.employee];
              employees.forEach(emp => {
                if (emp.name) {
                  const parsed = parseNameEnhanced(emp.name);
                  if (parsed) {
                    results.contacts.push({
                      ...parsed,
                      source: 'schema-org-employee'
                    });
                  }
                }
              });
            }
          }
        }
      } catch {
        // Invalid JSON, continue
      }
    }
  } catch {
    // Structured data extraction failed, continue
  }
}

/**
 * Extract emails from page - multiple methods
 * 1. From mailto: links
 * 2. From plain text content
 */
async function extractEmailsFromPage(page, results) {
  try {
    // Method 1: Extract from mailto: links (most reliable)
    const mailtoLinks = await page.locator('a[href^="mailto:"]').all();
    for (const link of mailtoLinks) {
      try {
        const href = await link.getAttribute('href');
        if (href) {
          // Extract email from mailto:href (remove mailto: and query params)
          const emailMatch = href.replace('mailto:', '').split('?')[0].trim();
          if (EMAIL_REGEX.test(emailMatch) && !shouldFilterEmail(emailMatch)) {
            results.emails.add(emailMatch.toLowerCase());
          }
        }
      } catch {
        // Link extraction failed, continue
      }
    }

    // Method 2: Extract from page text (plain text emails)
    const content = await page.content();

    // Extract emails using regex
    const emails = content.match(EMAIL_REGEX) || [];
    emails.forEach(email => {
      if (!shouldFilterEmail(email)) {
        results.emails.add(email.toLowerCase());
      }
    });

    // Method 3: Look for email patterns in common contact elements
    const emailElements = await page.locator('[class*="email"], [id*="email"], [class*="contact"], [id*="contact"]').all();
    for (const element of emailElements) {
      try {
        const text = await element.textContent();
        if (text) {
          const elementEmails = text.match(EMAIL_REGEX) || [];
          elementEmails.forEach(email => {
            if (!shouldFilterEmail(email)) {
              results.emails.add(email.toLowerCase());
            }
          });
        }
      } catch {
        // Element extraction failed, continue
      }
    }

  } catch {
    // Email extraction failed, continue
  }
}

/**
 * Extract Swedish phone numbers from page
 */
async function extractPhonesFromPage(page, results) {
  try {
    // Method 1: tel: links (most reliable)
    const telLinks = await page.locator('a[href^="tel:"]').all();
    for (const link of telLinks) {
      try {
        const href = await link.getAttribute('href');
        if (href) {
          const digits = href.replace('tel:', '').replace(/[^\d+]/g, '');
          if (digits.length >= 8) results.phones.add(normalizePhone(digits));
        }
      } catch { /* continue */ }
    }

    // Method 2: regex scan of page HTML
    const content = await page.content();
    const matches = content.match(PHONE_REGEX) || [];
    matches.forEach(p => {
      const normalized = normalizePhone(p);
      if (normalized) results.phones.add(normalized);
    });

    // Method 3: contact elements
    const els = await page.locator('[class*="phone"], [class*="tel"], [itemprop="telephone"], [class*="contact"]').all();
    for (const el of els) {
      try {
        const text = await el.textContent();
        if (text) {
          const m = text.match(PHONE_REGEX) || [];
          m.forEach(p => { const n = normalizePhone(p); if (n) results.phones.add(n); });
        }
      } catch { /* continue */ }
    }
  } catch { /* continue */ }
}

function normalizePhone(raw) {
  const digits = String(raw).replace(/[^\d+]/g, '');
  if (digits.startsWith('+46') && digits.length >= 11) return digits;
  if (digits.startsWith('0') && digits.length >= 8) {
    return '+46' + digits.slice(1);
  }
  return null;
}

function selectBestPhone(phones) {
  if (!phones.length) return null;
  // Prefer mobile (+467X) over landline
  const mobile = phones.find(p => /^\+467/.test(p));
  return mobile || phones[0];
}

/**
 * ENHANCED: Extract contact names from page
 */
async function extractContacts(page, results) {
  try {
    // ENHANCED: More comprehensive selectors with context-aware patterns
    const contactPatterns = [
      // Team members
      { selector: '.team-member, .member, .person, [class*="team"], [class*="member"], [class*="staff"]', context: 'team' },
      // About page / founders
      { selector: '.about-founder, .founder, .ceo, [class*="about"], [class*="founder"], [class*="owner"]', context: 'about' },
      // Contact page
      { selector: '.contact-person, .staff, [class*="contact"], [id*="contact"]', context: 'contact' },
      // Management/executive
      { selector: '[class*="management"], [class*="executive"], [class*="leadership"]', context: 'leadership' },
      // ENHANCED: Additional patterns
      { selector: '[class*="profile"], [class*="bio"], [class*="card"][class*="team"]', context: 'profile' },
      { selector: 'article[class*="team"], article[class*="member"]', context: 'article' }
    ];

    for (const pattern of contactPatterns) {
      try {
        const elements = await page.locator(pattern.selector).all();

        for (const element of elements) {
          const text = await element.textContent();
          if (text && text.trim().length > 0 && text.trim().length < 500) {
            // ENHANCED: Use improved parsing
            const parsed = parseContactTextEnhanced(text.trim(), pattern.context);
            if (parsed) {
              // Avoid duplicates
              const isDuplicate = results.contacts.some(c =>
                c.firstName === parsed.firstName && c.lastName === parsed.lastName
              );
              if (!isDuplicate) {
                results.contacts.push({
                  ...parsed,
                  source: pattern.context
                });
              }
            }
          }
        }
      } catch {
        // Selector not found, continue
      }
    }

    // ENHANCED: Look for "Meet the [Title]" patterns in headings
    try {
      const headings = await page.locator('h1, h2, h3, h4, h5, h6').all();
      for (const heading of headings) {
        const text = await heading.textContent();
        if (text) {
          const lowerText = text.toLowerCase();
          // Check if heading contains decision maker keywords
          if (DECISION_MAKER_PATTERNS.some(p => p.test(lowerText))) {
            // Get the next sibling element (likely contains the name)
            try {
              const sibling = await heading.evaluateHandle(el => el.nextElementSibling);
              if (sibling) {
                const siblingText = await sibling.textContent();
                if (siblingText && siblingText.length < 200) {
                  const parsed = parseNameEnhanced(siblingText.trim());
                  if (parsed) {
                    const isDuplicate = results.contacts.some(c =>
                      c.firstName === parsed.firstName && c.lastName === parsed.lastName
                    );
                    if (!isDuplicate) {
                      results.contacts.push({
                        ...parsed,
                        source: 'heading-context'
                      });
                    }
                  }
                }
              }
            } catch {
              // Sibling extraction failed
            }
          }
        }
      }
    } catch {
      // Heading extraction failed
    }

  } catch {
    // Extraction failed, continue
  }
}

/**
 * ENHANCED: Parse name from text with multiple patterns
 */
function parseNameEnhanced(text) {
  if (!text || typeof text !== 'string') return null;

  // Clean up the text
  const cleanText = text.trim()
    .replace(/^["']|["']$/g, '')  // Remove quotes
    .replace(/\s+/g, ' ')          // Normalize whitespace
    .substring(0, 200);            // Limit length

  // Try each pattern
  for (const pattern of NAME_PATTERNS) {
    const match = cleanText.match(pattern);
    if (match) {
      // Different patterns have different capture groups
      if (match.length === 3) {
        // Pattern: First Last
        return { firstName: match[1], lastName: match[2] };
      } else if (match.length === 4) {
        // Pattern: First Middle Last or First A. Last
        return { firstName: match[1], lastName: match[3] };
      }
    }
  }

  // Fallback: Look for "Name: John Smith" pattern
  const nameLabelMatch = cleanText.match(/(?:name|founder|owner|ceo)[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+)/i);
  if (nameLabelMatch) {
    const parts = nameLabelMatch[1].trim().split(/\s+/);
    if (parts.length >= 2) {
      return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
    }
  }

  return null;
}

/**
 * ENHANCED: Parse contact text to extract name with context
 */
function parseContactTextEnhanced(text, context) {
  const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);

  if (lines.length < 1) return null;

  let firstName = null;
  let lastName = null;

  // First pass: Look for name near decision maker keywords
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this line has a decision maker keyword
    if (DECISION_MAKER_PATTERNS.some(p => p.test(line))) {
      // Check previous and next lines for names
      if (i > 0) {
        const parsed = parseNameEnhanced(lines[i - 1]);
        if (parsed) {
          firstName = parsed.firstName;
          lastName = parsed.lastName;
          break;
        }
      }
      if (i < lines.length - 1) {
        const parsed = parseNameEnhanced(lines[i + 1]);
        if (parsed) {
          firstName = parsed.firstName;
          lastName = parsed.lastName;
          break;
        }
      }
    }

    // Check for email:name pair on same line
    const emailMatch = line.match(EMAIL_REGEX);
    if (emailMatch) {
      const withoutEmail = line.replace(emailMatch[0], '').trim();
      const parsed = parseNameEnhanced(withoutEmail);
      if (parsed) {
        firstName = parsed.firstName;
        lastName = parsed.lastName;
      }
    }
  }

  // Second pass: Try to extract name from any line
  if (!firstName) {
    for (const line of lines) {
      const parsed = parseNameEnhanced(line);
      if (parsed) {
        firstName = parsed.firstName;
        lastName = parsed.lastName;
        break;
      }
    }
  }

  if (firstName) {
    return { firstName, lastName };
  }

  return null;
}

/**
 * Legacy parse function (kept for compatibility)
 */
function parseContactText(text) {
  return parseContactTextEnhanced(text, 'legacy');
}

/**
 * Select best email from extracted emails
 * Priority: generic < role-based < specific
 */
function selectBestEmail(emails) {
  if (emails.length === 0) return null;

  // Filter out least preferred role-based emails
  const leastPreferred = ['info', 'contact', 'sales', 'office', 'help', 'enquiries', 'hello'];
  const preferredEmails = emails.filter(email => {
    const prefix = email.split('@')[0].toLowerCase();
    return !leastPreferred.some(role => prefix.includes(role));
  });

  // Prefer more specific emails (not info@, contact@, etc.)
  if (preferredEmails.length > 0) {
    return preferredEmails[0];
  }

  // Fallback to first email
  return emails[0];
}

/**
 * ENHANCED: Select best contact from extracted contacts
 * Priority: owner/founder > decision makers > others
 */
function selectBestContact(contacts) {
  if (contacts.length === 0) return null;

  // First priority: Owner/Founder from schema-org or about page
  const owners = contacts.filter(c =>
    c.source === 'schema-org' || c.source === 'about' || c.source === 'schema-org-employee'
  );
  if (owners.length > 0) {
    return owners[0];
  }

  // Second priority: Contacts from team/leadership pages
  const leaders = contacts.filter(c =>
    c.source === 'team' || c.source === 'leadership'
  );
  if (leaders.length > 0) {
    return leaders[0];
  }

  return contacts[0];
}

/**
 * ENHANCED: Calculate confidence score for crawled data
 */
function calculateCrawlConfidence(email, contact, results) {
  let confidence = 0;

  if (email) confidence += 40;
  if (contact) {
    confidence += 30;
    // Bonus for structured data source
    if (contact.source === 'schema-org' || contact.source === 'schema-org-employee') {
      confidence += 20;
    }
  }

  // Pages successfully crawled
  confidence += Math.min(results.pages_crawled * 3, 10);

  return Math.min(100, confidence);
}

/**
 * Detect cleaning services offered on the page
 */
async function extractServicesFromPage(page, results) {
  try {
    const text = await page.evaluate(() => document.body ? document.body.innerText : '');
    const found = detectServices(text);
    found.forEach(s => results.services.push(s));
  } catch {
    // Page text extraction failed, continue
  }
}

/**
 * Crawl multiple websites in batch
 */
async function crawlBatch(leads) {
  const results = [];

  for (const lead of leads) {
    if (!lead.website) {
      results.push({
        lead_id: lead.id,
        email: null,
        contact_first_name: null,
        confidence: 0,
        error: 'No website'
      });
      continue;
    }

    const crawled = await crawlForContacts(lead.website);

    results.push({
      lead_id: lead.id,
      ...crawled
    });

    // Rate limiting: 2 seconds between crawls
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  return results;
}

/**
 * Update discovery_leads with crawled data
 */
async function updateCrawledData(db, leadId, crawledData) {
  const { email, contact_first_name, confidence, detected_services } = crawledData;

  const updates = [];
  const values = [];
  let paramIndex = 1;

  if (email) {
    updates.push(`email = $${paramIndex++}`);
    values.push(email);
  }

  if (contact_first_name) {
    updates.push(`first_name = $${paramIndex++}`);
    values.push(contact_first_name);
  }

  updates.push(`enrich_status = $${paramIndex++}`);
  values.push('enriched');

  updates.push(`crawled_at = NOW()`);

  // Merge crawl_confidence into existing score_breakdown (don't overwrite!)
  updates.push(`score_breakdown = COALESCE(score_breakdown, '{}'::jsonb) || jsonb_build_object('crawl_confidence', $${paramIndex}::text)`);
  values.push(JSON.stringify(confidence));
  paramIndex++;

  // Save detected services (merge with any existing)
  if (detected_services && detected_services.length > 0) {
    updates.push(`detected_services = array(SELECT DISTINCT unnest(COALESCE(detected_services, '{}') || $${paramIndex}::text[]))`);
    values.push(detected_services);
    paramIndex++;
  }

  values.push(leadId);

  const query = `
    UPDATE discovery_leads
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING id
  `;

  const { rows } = await db.query(query, values);
  return rows[0];
}

// Alias used by enrichLeads.js pipeline
const crawlForEmail = crawlForContacts;

module.exports = {
  crawlForContacts,
  crawlForEmail,
  crawlBatch,
  updateCrawledData,
  selectBestEmail,
  selectBestContact
};
