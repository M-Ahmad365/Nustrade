-- 004_create_listings.sql
-- Listings table, all indexes, the full-text search_vector trigger,
-- and the updated_at trigger.

CREATE TABLE listings (
  listing_id      SERIAL PRIMARY KEY,
  seller_id       INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  category_id     INTEGER NOT NULL REFERENCES categories(category_id) ON DELETE RESTRICT,
  title           VARCHAR(100) NOT NULL CHECK (char_length(title) >= 5),
  description     TEXT NOT NULL CHECK (char_length(description) BETWEEN 20 AND 2000),
  price           INTEGER NOT NULL CHECK (price >= 0 AND price <= 10000000),
  is_negotiable   BOOLEAN NOT NULL DEFAULT TRUE,
  condition       condition_enum NOT NULL,
  location_hostel VARCHAR(10),          -- NULL means off-campus
  is_off_campus   BOOLEAN NOT NULL DEFAULT FALSE,
  course_code     VARCHAR(20),          -- e.g. 'CS-236', mainly for textbooks
  status          listing_status_enum NOT NULL DEFAULT 'active',
  view_count      INTEGER NOT NULL DEFAULT 0,
  posted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  last_boosted_at TIMESTAMPTZ,
  sold_at         TIMESTAMPTZ,
  search_vector   TSVECTOR,             -- maintained by trigger below
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Standard query patterns
CREATE INDEX idx_listings_status    ON listings(status);
CREATE INDEX idx_listings_seller    ON listings(seller_id);
CREATE INDEX idx_listings_expires   ON listings(expires_at) WHERE status = 'active';

-- Partial indexes — only active listings are queried in feeds/filters
CREATE INDEX idx_listings_category  ON listings(category_id) WHERE status = 'active';
CREATE INDEX idx_listings_posted_at ON listings(posted_at DESC) WHERE status = 'active';
CREATE INDEX idx_listings_price     ON listings(price)        WHERE status = 'active';

-- Partial index for textbook-style searches by course code
CREATE INDEX idx_listings_course_code ON listings(course_code)
  WHERE course_code IS NOT NULL;

-- GIN index for PostgreSQL full-text search (used by GET /listings/search)
CREATE INDEX idx_listings_search    ON listings USING GIN(search_vector);

-- Trigger: populate search_vector on insert or relevant column update.
-- Weights: title=A (most relevant), course_code=B, description=C.
CREATE OR REPLACE FUNCTION update_listing_search_vector() RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector =
    setweight(to_tsvector('english', COALESCE(NEW.title, '')),       'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.course_code, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_listings_search_vector
  BEFORE INSERT OR UPDATE OF title, description, course_code ON listings
  FOR EACH ROW EXECUTE FUNCTION update_listing_search_vector();

CREATE TRIGGER trg_listings_updated_at
  BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
