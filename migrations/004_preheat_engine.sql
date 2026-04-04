-- ============================================================
-- 004_preheat_engine.sql
-- Preheating Engine: warm signal tracking + preheat sequences
-- ============================================================

-- Layer 3: warm signal tracking columns
ALTER TABLE discovery_leads
  ADD COLUMN IF NOT EXISTS warm_signal BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS warm_signal_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS warm_signal_source TEXT,
  ADD COLUMN IF NOT EXISTS outreach_tier TEXT DEFAULT 'cold',
  ADD COLUMN IF NOT EXISTS sequence_token VARCHAR(64);

-- Generate unique token for every existing lead (batch to avoid lock contention)
DO $$
DECLARE
  i INT := 0;
BEGIN
  LOOP
    UPDATE discovery_leads
    SET sequence_token = md5(random()::text || id::text || clock_timestamp()::text)
    WHERE id IN (
      SELECT id FROM discovery_leads
      WHERE sequence_token IS NULL
      LIMIT 5000
      FOR UPDATE SKIP LOCKED
    );
    GET DIAGNOSTICS i = ROW_COUNT;
    EXIT WHEN i = 0;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_discovery_leads_sequence_token ON discovery_leads(sequence_token);
CREATE INDEX IF NOT EXISTS idx_discovery_leads_outreach_tier ON discovery_leads(outreach_tier);
CREATE INDEX IF NOT EXISTS idx_discovery_leads_warm_signal ON discovery_leads(warm_signal);

-- Compute initial outreach_tier from existing signals
UPDATE discovery_leads
SET outreach_tier = CASE
  WHEN intent_signal IS NOT NULL THEN 'hot'
  WHEN score_label IN ('hot', 'warm') THEN 'warm'
  ELSE 'cold'
END;

-- Layer 4: insert the 3 preheat sequences
INSERT INTO sequences (name, description, steps) VALUES
(
  'Preheat — Hot (Intent Signal)',
  'For leads with hiring_security intent signal or warm_signal=true. LinkedIn warm-up before personalised email.',
  '[
    {"day": 0,  "channel": "linkedin", "title": "Follow VD/styrelseledamot on LinkedIn"},
    {"day": 2,  "channel": "linkedin", "title": "Like or comment on a recent post"},
    {"day": 5,  "channel": "email",    "title": "First email — reference NIS2 hiring signal"},
    {"day": 9,  "channel": "linkedin", "title": "Send LinkedIn DM — brief, value-first"},
    {"day": 14, "channel": "email",    "title": "Follow-up — personal liability + board angle"}
  ]'::jsonb
),
(
  'Preheat — Warm (Site Visit or Score 60+)',
  'For leads that visited NIS2 pages or scored 60+. Shorter warm-up then email.',
  '[
    {"day": 0,  "channel": "linkedin", "title": "Follow VD/styrelseledamot on LinkedIn"},
    {"day": 3,  "channel": "email",    "title": "First email — NIS2 compliance angle"},
    {"day": 8,  "channel": "email",    "title": "Follow-up — board liability framing"},
    {"day": 13, "channel": "linkedin", "title": "LinkedIn DM — reference email thread"},
    {"day": 20, "channel": "email",    "title": "Final email — breakup with resource offer"}
  ]'::jsonb
),
(
  'Preheat — Cold (Standard)',
  'For low-score or unqualified leads. Longer warm-up, awareness-first messaging.',
  '[
    {"day": 0,  "channel": "linkedin", "title": "Follow VD/styrelseledamot on LinkedIn"},
    {"day": 7,  "channel": "email",    "title": "First email — NIS2 awareness angle"},
    {"day": 13, "channel": "email",    "title": "Follow-up — sector-specific risk"},
    {"day": 19, "channel": "linkedin", "title": "LinkedIn connection request with note"},
    {"day": 26, "channel": "email",    "title": "Final email — FOMO, peers are preparing"}
  ]'::jsonb
)
ON CONFLICT DO NOTHING;
