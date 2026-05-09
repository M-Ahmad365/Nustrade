'use strict';

const { query, getClient } = require('../../config/postgres');

const TX_SELECT = `
  SELECT t.*,
         b.full_name            AS buyer_name,
         b.profile_picture_url  AS buyer_pic,
         s.full_name            AS seller_name,
         s.profile_picture_url  AS seller_pic,
         l.title                AS listing_title,
         l.status               AS listing_status,
         (SELECT image_url FROM listing_images
          WHERE listing_id = t.listing_id
          ORDER BY display_order LIMIT 1) AS listing_thumbnail
  FROM transactions t
  JOIN users    b ON b.user_id    = t.buyer_id
  JOIN users    s ON s.user_id    = t.seller_id
  JOIN listings l ON l.listing_id = t.listing_id
`;

const getTransactionById = async (transactionId) => {
  const { rows } = await query(`${TX_SELECT} WHERE t.transaction_id = $1`, [transactionId]);
  return rows[0] ?? null;
};

const getMyTransactions = async (userId) => {
  const { rows } = await query(
    `${TX_SELECT}
     WHERE t.buyer_id = $1 OR t.seller_id = $1
     ORDER BY t.created_at DESC`,
    [userId]
  );
  return rows;
};

const confirmBuyer = async (transactionId, buyerId) => {
  const { rows } = await query(
    `UPDATE transactions
     SET buyer_confirmed_at = NOW()
     WHERE transaction_id = $1
       AND buyer_id = $2
       AND status = 'pending_completion'
       AND buyer_confirmed_at IS NULL
     RETURNING *`,
    [transactionId, buyerId]
  );
  return rows[0] ?? null;
};

const confirmSeller = async (transactionId, sellerId) => {
  const { rows } = await query(
    `UPDATE transactions
     SET seller_confirmed_at = NOW()
     WHERE transaction_id = $1
       AND seller_id = $2
       AND status = 'pending_completion'
       AND seller_confirmed_at IS NULL
     RETURNING *`,
    [transactionId, sellerId]
  );
  return rows[0] ?? null;
};

/**
 * Invoke the complete_transaction stored procedure inside a transaction block.
 * The procedure uses FOR UPDATE internally, so the outer BEGIN gives it a connection
 * with explicit transaction context rather than relying on autocommit.
 */
const callCompleteTransaction = async (transactionId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('CALL complete_transaction($1)', [transactionId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Cancel a transaction and restore the listing to active so it can receive new offers.
 * isBuyer flag determines the cancellation status value.
 */
const cancelTransaction = async (transactionId, isBuyer, reason) => {
  const statusVal = isBuyer ? 'cancelled_by_buyer' : 'cancelled_by_seller';
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE transactions
       SET status = $1::transaction_status_enum,
           cancelled_at = NOW(),
           cancellation_reason = $2
       WHERE transaction_id = $3 AND status = 'pending_completion'
       RETURNING *`,
      [statusVal, reason ?? null, transactionId]
    );
    const tx = rows[0];
    if (!tx) { await client.query('ROLLBACK'); return null; }

    // Restore listing to active so sellers can receive new offers
    await client.query(
      `UPDATE listings SET status = 'active', updated_at = NOW() WHERE listing_id = $1`,
      [tx.listing_id]
    );

    await client.query('COMMIT');
    return tx;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const disputeTransaction = async (transactionId, userId) => {
  const { rows } = await query(
    `UPDATE transactions
     SET status = 'disputed'
     WHERE transaction_id = $1
       AND status = 'pending_completion'
       AND (buyer_id = $2 OR seller_id = $2)
     RETURNING *`,
    [transactionId, userId]
  );
  return rows[0] ?? null;
};

module.exports = {
  getTransactionById,
  getMyTransactions,
  confirmBuyer,
  confirmSeller,
  callCompleteTransaction,
  cancelTransaction,
  disputeTransaction,
};
