-- Migration 009: Gap Analysis Submissions
-- Stores results from nis2-gap-analys.html form submissions

CREATE TABLE IF NOT EXISTS gap_analysis_submissions (
  id           SERIAL PRIMARY KEY,
  lead_id      INT REFERENCES discovery_leads(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  company_name TEXT,
  contact_name TEXT,
  score        INT,          -- raw score 0-50
  score_pct    INT,          -- percentage 0-100
  risk_level   TEXT,         -- 'red' | 'amber' | 'green'
  critical_gaps INT,
  partial_gaps  INT,
  domains      JSONB,        -- { "Styrning & Ledning": 60, "Riskhantering": 40, ... }
  answers      JSONB         -- { "d0_q0": 2, "d0_q1": 0, ... }
);

CREATE INDEX IF NOT EXISTS idx_gap_submissions_lead_id
  ON gap_analysis_submissions(lead_id);
