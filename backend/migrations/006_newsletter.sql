-- Migration 006: Newsletter subscribers
-- Run: docker exec -i humanizedtrust_postgres psql -U ht_user -d humanizedtrust < backend/migrations/006_newsletter.sql

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id                SERIAL PRIMARY KEY,
  email             VARCHAR(255) NOT NULL UNIQUE,
  source            VARCHAR(255),
  unsubscribe_token VARCHAR(64) NOT NULL UNIQUE,
  subscribed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unsubscribed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_newsletter_email ON newsletter_subscribers(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_newsletter_token ON newsletter_subscribers(unsubscribe_token);
