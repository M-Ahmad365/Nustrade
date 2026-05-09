-- 010_create_wishlist.sql
-- Wishlist items table. Composite PK prevents duplicates.
-- Extra index on listing_id supports the "notify all wishlist owners on price drop" query.

CREATE TABLE wishlist_items (
  user_id    INTEGER NOT NULL REFERENCES users(user_id)    ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, listing_id)
);

-- Used to find all users who wishlisted a specific listing (price-drop notification)
CREATE INDEX idx_wishlist_listing ON wishlist_items(listing_id);
