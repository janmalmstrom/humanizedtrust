-- HumanizedTrust — Initial Schema
-- Swedish B2B lead database for AI/NIS2 cybersecurity outreach

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discovery_leads (
  id SERIAL PRIMARY KEY,

  -- Swedish company identifiers
  org_nr VARCHAR(20) UNIQUE,           -- Swedish org number (XXXXXXXX-XXXX)
  company_name VARCHAR(255) NOT NULL,

  -- Contact
  website TEXT,
  email TEXT,
  email_status TEXT,                   -- 'verified', 'guessed', 'invalid'
  email_source TEXT,                   -- 'crawl', 'smtp_permutation', 'gravatar'
  phone TEXT,

  -- Address
  address TEXT,
  city TEXT,
  county TEXT,                         -- Län (Stockholm, Västra Götaland, etc.)
  postal_code TEXT,

  -- Swedish company data
  nace_code TEXT,                      -- SNI/NACE code (e.g. '6201', '8610')
  nace_description TEXT,
  employee_range TEXT,                 -- '1-9', '10-49', '50-249', '250-499', '500+'
  revenue_range TEXT,                  -- Annual turnover range (MSEK)
  founded_year INTEGER,

  -- NIS2 / Cybersäkerhetslagen
  nis2_registered BOOLEAN DEFAULT false,
  nis2_sector TEXT,                    -- 'energy','transport','health','digital_infra','finance','water','public_admin','space'

  -- Social
  linkedin_url TEXT,
  linkedin_url_source TEXT,
  facebook_url TEXT,
  facebook_url_source TEXT,

  -- Scoring
  score INTEGER,
  score_label TEXT,                    -- 'hot', 'warm', 'cold'
  score_breakdown JSONB,

  -- Workflow
  review_status TEXT DEFAULT 'new',   -- 'new', 'contacted', 'qualified', 'rejected', 'customer'
  contacted_at TIMESTAMPTZ,
  notes TEXT,
  outreach_angle TEXT,                 -- personalized pitch angle (AI-generated)

  -- Vibe/Explorium enrichment
  vibe_enriched_at TIMESTAMPTZ,
  vibe_revenue_range TEXT,
  vibe_employee_range TEXT,
  vibe_tech_stack JSONB,
  vibe_has_crm BOOLEAN,
  vibe_linkedin_profile TEXT,
  vibe_description TEXT,

  -- Metadata
  source TEXT DEFAULT 'allabolag',
  last_enriched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- NIS2 sector reference table (MSB-registered organizations)
CREATE TABLE IF NOT EXISTS nis2_organizations (
  id SERIAL PRIMARY KEY,
  org_nr VARCHAR(20) UNIQUE NOT NULL,
  company_name VARCHAR(255),
  sector TEXT,
  subsector TEXT,
  registered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Outreach log
CREATE TABLE IF NOT EXISTS outreach_log (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES discovery_leads(id),
  channel TEXT,                        -- 'email', 'linkedin', 'phone'
  message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  response TEXT,
  responded_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_score ON discovery_leads(score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_nace ON discovery_leads(nace_code);
CREATE INDEX IF NOT EXISTS idx_leads_county ON discovery_leads(county);
CREATE INDEX IF NOT EXISTS idx_leads_employees ON discovery_leads(employee_range);
CREATE INDEX IF NOT EXISTS idx_leads_nis2 ON discovery_leads(nis2_registered);
CREATE INDEX IF NOT EXISTS idx_leads_status ON discovery_leads(review_status);
CREATE INDEX IF NOT EXISTS idx_leads_email ON discovery_leads(email);
CREATE INDEX IF NOT EXISTS idx_nis2_orgs_orgnr ON nis2_organizations(org_nr);
