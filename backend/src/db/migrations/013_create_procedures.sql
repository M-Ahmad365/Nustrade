-- 013_create_procedures.sql
-- Stored procedures for complex multi-table atomic operations.

-- complete_transaction: finalizes a deal once both parties have confirmed.
-- Uses FOR UPDATE to lock the transaction row and prevent concurrent calls
-- from double-completing the same transaction (serialization safety).
-- Called from the Node.js service layer via CALL complete_transaction($1).
CREATE OR REPLACE PROCEDURE complete_transaction(p_transaction_id INTEGER) AS $$
DECLARE
  t_record transactions%ROWTYPE;
BEGIN
  SELECT * INTO t_record
  FROM transactions
  WHERE transaction_id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction % not found', p_transaction_id;
  END IF;

  IF t_record.status != 'pending_completion' THEN
    RAISE EXCEPTION 'Transaction % is not in pending_completion state (current: %)',
      p_transaction_id, t_record.status;
  END IF;

  -- Both confirmations are required before we can complete
  IF t_record.buyer_confirmed_at IS NULL OR t_record.seller_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Both parties must confirm before completion (transaction %)',
      p_transaction_id;
  END IF;

  UPDATE transactions
  SET status = 'completed', completed_at = NOW()
  WHERE transaction_id = p_transaction_id;

  UPDATE listings
  SET status = 'sold', sold_at = NOW()
  WHERE listing_id = t_record.listing_id;

  -- Increment counters atomically inside the same procedure call
  UPDATE users SET total_sales     = total_sales     + 1 WHERE user_id = t_record.seller_id;
  UPDATE users SET total_purchases = total_purchases + 1 WHERE user_id = t_record.buyer_id;
END;
$$ LANGUAGE plpgsql;
