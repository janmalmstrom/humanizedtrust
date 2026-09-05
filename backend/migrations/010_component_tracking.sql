-- Migration 010: Modular component tracking on sequence_enrollments
-- Enables A/B testing at the component level (SBJ / HOK / CTA)
-- Every enrollment gets a tag like KET_SBJ2_HOK4_CTA1
-- Track open rate by SBJ, reply rate by HOK, conversion rate by CTA

ALTER TABLE sequence_enrollments
  ADD COLUMN IF NOT EXISTS pitch_components  TEXT,          -- 'KET_SBJ2_HOK4_CTA1'
  ADD COLUMN IF NOT EXISTS component_codes   JSONB,         -- {"sbj":"SBJ2","hok":"HOK4","cta":"CTA1"}
  ADD COLUMN IF NOT EXISTS opened_at         TIMESTAMPTZ,   -- first email opened
  ADD COLUMN IF NOT EXISTS converted_at      TIMESTAMPTZ;   -- purchased via Paddle

-- Index for component-level queries
CREATE INDEX IF NOT EXISTS idx_enrollments_components ON sequence_enrollments (pitch_components);
CREATE INDEX IF NOT EXISTS idx_enrollments_opened     ON sequence_enrollments (opened_at) WHERE opened_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enrollments_converted  ON sequence_enrollments (converted_at) WHERE converted_at IS NOT NULL;

-- ─── Tracking queries (run manually or via /api/sequences/component-stats) ───
--
-- Full funnel by component combo:
--   SELECT
--     pitch_components,
--     COUNT(*)                                                            AS sends,
--     COUNT(opened_at)                                                    AS opens,
--     ROUND(COUNT(opened_at)::numeric    / COUNT(*) * 100, 1)            AS open_pct,
--     COUNT(replied_at)                                                   AS replies,
--     ROUND(COUNT(replied_at)::numeric   / NULLIF(COUNT(opened_at),0) * 100, 1) AS reply_pct,
--     COUNT(converted_at)                                                 AS conversions,
--     ROUND(COUNT(converted_at)::numeric / NULLIF(COUNT(replied_at),0) * 100, 1) AS conv_pct
--   FROM sequence_enrollments
--   WHERE pitch_components IS NOT NULL
--   GROUP BY pitch_components
--   ORDER BY sends DESC;
--
-- By SBJ only (which subject type gets most opens):
--   SELECT component_codes->>'sbj' AS sbj, COUNT(*) AS sends,
--     ROUND(COUNT(opened_at)::numeric / COUNT(*) * 100, 1) AS open_pct
--   FROM sequence_enrollments WHERE pitch_components IS NOT NULL
--   GROUP BY sbj ORDER BY open_pct DESC;
--
-- By HOK only (which hook earns most replies):
--   SELECT component_codes->>'hok' AS hok, COUNT(opened_at) AS openers,
--     ROUND(COUNT(replied_at)::numeric / NULLIF(COUNT(opened_at),0) * 100, 1) AS reply_pct
--   FROM sequence_enrollments WHERE pitch_components IS NOT NULL
--   GROUP BY hok ORDER BY reply_pct DESC;
--
-- By CTA only (which CTA drives most purchases):
--   SELECT component_codes->>'cta' AS cta, COUNT(replied_at) AS repliers,
--     ROUND(COUNT(converted_at)::numeric / NULLIF(COUNT(replied_at),0) * 100, 1) AS conv_pct
--   FROM sequence_enrollments WHERE pitch_components IS NOT NULL
--   GROUP BY cta ORDER BY conv_pct DESC;
