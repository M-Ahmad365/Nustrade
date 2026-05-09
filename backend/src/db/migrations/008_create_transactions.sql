-- 008_create_transactions.sql
-- Transactions table. Uses RESTRICT on all foreign keys so historical records
-- are never silently destroyed when a user or listing is deleted.
-- offer_id is UNIQUE — one accepted offer produces exactly one transaction.

CREATE TABLE transactions (
  transaction_id      SERIAL PRIMARY KEY,
  listing_id          INTEGER NOT NULL REFERENCES listings(listing_id)  ON DELETE RESTRICT,
  offer_id            INTEGER NOT NULL UNIQUE REFERENCES offers(offer_id) ON DELETE RESTRICT,
  buyer_id            INTEGER NOT NULL REFERENCES users(user_id)         ON DELETE RESTRICT,
  seller_id           INTEGER NOT NULL REFERENCES users(user_id)         ON DELETE RESTRICT,
  agreed_price        INTEGER NOT NULL,
  status              transaction_status_enum NOT NULL DEFAULT 'pending_completion',
  buyer_confirmed_at  TIMESTAMPTZ,
  seller_confirmed_at TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  cancellation_reason VARCHAR(500),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_buyer   ON transactions(buyer_id);
CREATE INDEX idx_transactions_seller  ON transactions(seller_id);
CREATE INDEX idx_transactions_listing ON transactions(listing_id);
CREATE INDEX idx_transactions_status  ON transactions(status);

CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
