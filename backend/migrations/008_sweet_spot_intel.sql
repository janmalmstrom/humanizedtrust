-- Migration 008: Sweet-spot competitive intelligence fields
-- Adds tech_stack (detected email provider) and competitor_intel (known security vendor)

ALTER TABLE discovery_leads
  ADD COLUMN IF NOT EXISTS tech_stack        TEXT,         -- 'microsoft365', 'google_workspace', 'other'
  ADD COLUMN IF NOT EXISTS competitor_intel  TEXT,         -- free text: known security vendor/partner
  ADD COLUMN IF NOT EXISTS ms365_detected_at TIMESTAMP;    -- when MX detection last ran

CREATE INDEX IF NOT EXISTS idx_leads_tech_stack ON discovery_leads(tech_stack);

-- New sequence: Microsoft 365 NIS2 Security (insert only if not exists)
INSERT INTO sequences (name, steps, created_at)
SELECT
  'Microsoft 365 NIS2 Security',
  '[
    {"day": 0,  "title": "Email — M365 compliance gap: vad Defender inte täcker under NIS2", "channel": "email"},
    {"day": 2,  "title": "LinkedIn — follow VD/IT-ansvarig", "channel": "linkedin"},
    {"day": 5,  "title": "Email — konkret: 3 NIS2-krav som M365 Business Premium inte uppfyller", "channel": "email"},
    {"day": 9,  "title": "LinkedIn DM — erbjud gratis M365 Secure Score-analys", "channel": "linkedin"},
    {"day": 14, "title": "Email — case: tillverkningsbolag 120 anst. klarade NIS2-revision på 6v med Nomad", "channel": "email"}
  ]'::jsonb,
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM sequences WHERE name = 'Microsoft 365 NIS2 Security');
