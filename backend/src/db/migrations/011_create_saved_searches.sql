-- 011_create_saved_searches.sql
-- Saved searches table. filters_json stores the full filter state as JSONB
-- so we can store any combination of filters without schema changes.

CREATE TABLE saved_searches (
  saved_search_id SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  name            VARCHAR(50) NOT NULL,
  query_text      VARCHAR(200),
  filters_json    JSONB NOT NULL DEFAULT '{}',
  last_run_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_saved_searches_user ON saved_searches(user_id);
