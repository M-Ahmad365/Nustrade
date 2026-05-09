-- 005_create_listing_images.sql
-- Listing images table. Images are stored on disk; this table stores the URLs.
-- Cascades on listing delete so we don't orphan rows (controller deletes files separately).

CREATE TABLE listing_images (
  image_id      SERIAL PRIMARY KEY,
  listing_id    INTEGER NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  image_url     VARCHAR(500) NOT NULL,
  display_order SMALLINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compound index: ordered image fetch for a listing is the only access pattern
CREATE INDEX idx_listing_images_listing ON listing_images(listing_id, display_order);
