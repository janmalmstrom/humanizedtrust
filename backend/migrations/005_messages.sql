-- Migration 005: Messages inbox
-- Stores inbound (lead → Jan) and outbound (Jan → lead) emails

CREATE TABLE IF NOT EXISTS messages (
  id                 SERIAL PRIMARY KEY,
  lead_id            INTEGER REFERENCES discovery_leads(id) ON DELETE CASCADE,
  direction          VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_email         VARCHAR(255),
  to_email           VARCHAR(255),
  subject            VARCHAR(500),
  body_text          TEXT,
  body_html          TEXT,
  resend_message_id  VARCHAR(255),
  read_at            TIMESTAMP,
  created_at         TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_lead_id    ON messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread
  ON messages(lead_id) WHERE direction = 'inbound' AND read_at IS NULL;
