-- 006_create_listing_tags.sql
-- Free-text tags per listing. Stored as individual rows so we can index the tag column
-- and support future aggregation ("most popular tags").
-- Primary key prevents duplicate tags on the same listing.

CREATE TABLE listing_tags (
  listing_id INTEGER NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  tag        VARCHAR(30) NOT NULL,
  PRIMARY KEY (listing_id, tag)
);

-- Allows tag-based search across all listings without a full table scan
CREATE INDEX idx_listing_tags_tag ON listing_tags(tag);
