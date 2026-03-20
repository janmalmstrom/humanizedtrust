-- Migration 003: Contacts + Sequences
CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES discovery_leads(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  title VARCHAR(255),
  email TEXT,
  phone TEXT,
  linkedin_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contacts_lead ON contacts(lead_id);

CREATE TABLE IF NOT EXISTS sequences (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  steps JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sequence_enrollments (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES discovery_leads(id) ON DELETE CASCADE,
  sequence_id INTEGER REFERENCES sequences(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'active',
  current_step INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_enrollments_lead ON sequence_enrollments(lead_id);

-- Seed default sequences
INSERT INTO sequences (name, description, steps) VALUES
('NIS2 Fast Track', '3-step sequence for NIS2-registered companies', '[
  {"day":0,"channel":"email","title":"Initial NIS2 compliance email"},
  {"day":3,"channel":"linkedin","title":"LinkedIn connection request"},
  {"day":7,"channel":"email","title":"Follow-up: Readiness Assessment offer"}
]'),
('Cold Outreach 5-step', 'Standard cold outreach sequence', '[
  {"day":0,"channel":"email","title":"Cold intro email"},
  {"day":2,"channel":"linkedin","title":"LinkedIn connect"},
  {"day":5,"channel":"email","title":"Value-add follow-up"},
  {"day":9,"channel":"call","title":"Discovery call attempt"},
  {"day":14,"channel":"email","title":"Break-up email"}
]')
ON CONFLICT DO NOTHING;
