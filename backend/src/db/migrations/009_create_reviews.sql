-- 009_create_reviews.sql
-- Reviews table + the trigger that recalculates aggregate_rating/total_reviews
-- on the reviewee's user row after every insert, update, or delete.

CREATE TABLE reviews (
  review_id      SERIAL PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES transactions(transaction_id) ON DELETE CASCADE,
  reviewer_id    INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  reviewee_id    INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  rating         SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        VARCHAR(500),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One review per reviewer per transaction (buyer reviews seller, seller reviews buyer)
  UNIQUE (transaction_id, reviewer_id),
  CONSTRAINT no_self_review CHECK (reviewer_id != reviewee_id)
);

CREATE INDEX idx_reviews_reviewee ON reviews(reviewee_id);
CREATE INDEX idx_reviews_reviewer ON reviews(reviewer_id);

CREATE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- After any review change, recalculate the reviewee's aggregate rating and count.
-- COALESCE handles the DELETE case where NEW is NULL.
CREATE OR REPLACE FUNCTION recalculate_user_rating() RETURNS TRIGGER AS $$
DECLARE
  target_user_id INTEGER;
BEGIN
  target_user_id = COALESCE(NEW.reviewee_id, OLD.reviewee_id);

  UPDATE users
  SET
    aggregate_rating = COALESCE(
      (SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews WHERE reviewee_id = target_user_id),
      0.00
    ),
    total_reviews = (SELECT COUNT(*) FROM reviews WHERE reviewee_id = target_user_id)
  WHERE user_id = target_user_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reviews_recalc_rating
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION recalculate_user_rating();
