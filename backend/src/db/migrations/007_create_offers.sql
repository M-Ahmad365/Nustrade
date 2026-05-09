-- 007_create_offers.sql
-- Offers table. seller_id is denormalized here (also derivable via listings.seller_id)
-- for faster "offers on my listings" queries without an extra join.

CREATE TABLE offers (
  offer_id            SERIAL PRIMARY KEY,
  listing_id          INTEGER NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  buyer_id            INTEGER NOT NULL REFERENCES users(user_id)   ON DELETE CASCADE,
  seller_id           INTEGER NOT NULL REFERENCES users(user_id)   ON DELETE CASCADE,
  proposed_price      INTEGER NOT NULL CHECK (proposed_price >= 0),
  message             VARCHAR(500),
  status              offer_status_enum NOT NULL DEFAULT 'pending',
  -- If this offer is a seller counter-offer, links back to the original offer
  counter_of_offer_id INTEGER REFERENCES offers(offer_id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
  responded_at        TIMESTAMPTZ,

  CONSTRAINT no_self_offer CHECK (buyer_id != seller_id)
);

CREATE INDEX idx_offers_listing_status ON offers(listing_id, status);
CREATE INDEX idx_offers_buyer          ON offers(buyer_id);
CREATE INDEX idx_offers_seller         ON offers(seller_id);
-- Partial index: cron job only touches pending offers when checking expiry
CREATE INDEX idx_offers_expires        ON offers(expires_at) WHERE status = 'pending';

CREATE TRIGGER trg_offers_updated_at
  BEFORE UPDATE ON offers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
