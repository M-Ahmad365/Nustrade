-- 012_create_reports.sql
-- Reports table. Can target either a listing or a user (or both).
-- The CHECK constraint ensures at least one target is provided.
-- resolved_by_admin_id uses SET NULL so resolving admin's user record
-- can be deleted without losing the resolution record.

CREATE TABLE reports (
  report_id              SERIAL PRIMARY KEY,
  reporter_id            INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  listing_id             INTEGER REFERENCES listings(listing_id)    ON DELETE CASCADE,
  reported_user_id       INTEGER REFERENCES users(user_id)          ON DELETE CASCADE,
  reason                 report_reason_enum NOT NULL,
  details                VARCHAR(1000),
  resolved_by_admin_id   INTEGER REFERENCES users(user_id)          ON DELETE SET NULL,
  resolved_at            TIMESTAMPTZ,
  resolution_notes       VARCHAR(500),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Every report must target at least a listing or a user
  CONSTRAINT report_target CHECK (listing_id IS NOT NULL OR reported_user_id IS NOT NULL)
);

-- Partial index: admin queue only ever queries unresolved reports
CREATE INDEX idx_reports_unresolved ON reports(created_at) WHERE resolved_at IS NULL;
