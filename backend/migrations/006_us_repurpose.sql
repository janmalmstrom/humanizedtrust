-- Migration 006: Repurpose HumanizedTrust for US market (Simaroa Media outreach)
-- Clears Swedish NIS2 data, adds US-specific columns, inserts ketamine sequence

-- 1. Add US-specific columns
ALTER TABLE discovery_leads ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE discovery_leads ADD COLUMN IF NOT EXISTS niche TEXT;

-- 2. Drop Swedish-specific unique constraint on org_nr (US companies have no org nr)
ALTER TABLE discovery_leads DROP CONSTRAINT IF EXISTS discovery_leads_org_nr_key;

-- 3. Drop Swedish-specific indexes
DROP INDEX IF EXISTS idx_leads_nis2;
DROP INDEX IF EXISTS idx_leads_intent_signal;

-- 4. Clear all Swedish data (order matters for FK constraints)
DELETE FROM sequence_enrollments;
DELETE FROM outreach_log;
DELETE FROM activities;
DELETE FROM tasks;
DELETE FROM contacts;
DELETE FROM messages;
DELETE FROM gap_analysis_submissions;
DELETE FROM discovery_leads;

-- 5. Reset sequences
ALTER SEQUENCE discovery_leads_id_seq RESTART WITH 1;

-- 6. Clear NIS2-specific sequences
DELETE FROM sequences;

-- 7. Insert US ketamine clinic outreach sequence (LinkedIn + email combined)
INSERT INTO sequences (name, description, steps) VALUES (
  'Ketamine Clinic — Full Outreach',
  'Combined LinkedIn warm-up + email sequence for US ketamine/infusion therapy clinics. AI visibility angle: competitors getting on NBC/CBS/Fox, you should too.',
  '[
    {"day": 0,  "channel": "linkedin", "title": "LinkedIn: Follow clinic page"},
    {"day": 1,  "channel": "linkedin", "title": "LinkedIn: Comment on 1-2 recent posts"},
    {"day": 3,  "channel": "linkedin", "title": "LinkedIn: Connect with personalized note"},
    {"day": 7,  "channel": "email",    "title": "Email 1: AI visibility cold intro"},
    {"day": 10, "channel": "linkedin", "title": "LinkedIn: DM after connecting"},
    {"day": 14, "channel": "email",    "title": "Email 2: Competitor gap follow-up"},
    {"day": 21, "channel": "email",    "title": "Email 3: Last touch / breakup"}
  ]'::jsonb
);

INSERT INTO sequences (name, description, steps) VALUES (
  'Ketamine Clinic — Email Only',
  'Email-only sequence for clinics without LinkedIn presence.',
  '[
    {"day": 0,  "channel": "email", "title": "Email 1: AI visibility cold intro"},
    {"day": 5,  "channel": "email", "title": "Email 2: Competitor gap angle"},
    {"day": 12, "channel": "email", "title": "Email 3: Social proof + results"},
    {"day": 21, "channel": "email", "title": "Email 4: Last touch / breakup"}
  ]'::jsonb
);

-- 8. Add US-specific indexes
CREATE INDEX IF NOT EXISTS idx_leads_state ON discovery_leads(state);
CREATE INDEX IF NOT EXISTS idx_leads_niche ON discovery_leads(niche);
