-- 003_create_categories.sql
-- Categories lookup table. Rows are seeded in migration 014.

CREATE TABLE categories (
  category_id   SERIAL PRIMARY KEY,
  slug          VARCHAR(30) NOT NULL UNIQUE,
  name          VARCHAR(50) NOT NULL,
  description   TEXT,
  display_order SMALLINT NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
);
