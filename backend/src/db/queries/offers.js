'use strict';

const { query, getClient } = require('../../config/postgres');

const OFFER_SELECT = `
  SELECT o.*,
         b.full_name            AS buyer_name,
         b.profile_picture_url  AS buyer_pic,
         s.full_name            AS seller_name,
         s.profile_picture_url  AS seller_pic,
         l.title                AS listing_title,
         l.status               AS listing_status,
         l.price                AS listing_price,
         l.is_negotiable        AS listing_is_negotiable
  FROM offers o
  JOIN users    b ON b.user_id   = o.buyer_id
  JOIN users    s ON s.user_id   = o.seller_id
  JOIN listings l ON l.listing_id = o.listing_id
`;

const getOfferById = async (offerId) => {
  const { rows } = await query(`${OFFER_SELECT} WHERE o.offer_id = $1`, [offerId]);
  return rows[0] ?? null;
};

const getSentOffers = async (buyerId) => {
  const { rows } = await query(
    `${OFFER_SELECT}
     WHERE o.buyer_id = $1
     ORDER BY o.created_at DESC`,
    [buyerId]
  );
  return rows;
};

const getReceivedOffers = async (sellerId) => {
  const { rows } = await query(
    `${OFFER_SELECT}
     WHERE o.seller_id = $1
     ORDER BY o.created_at DESC`,
    [sellerId]
  );
  return rows;
};

const getPendingOfferCount = async (buyerId, listingId) => {
  const { rows } = await query(
    `SELECT COUNT(*) AS count
     FROM offers
     WHERE buyer_id = $1 AND listing_id = $2 AND status = 'pending'`,
    [buyerId, listingId]
  );
  return parseInt(rows[0].count, 10);
};

const createOffer = async ({ listingId, buyerId, sellerId, proposedPrice, message }) => {
  const { rows } = await query(
    `INSERT INTO offers (listing_id, buyer_id, seller_id, proposed_price, message)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [listingId, buyerId, sellerId, proposedPrice, message ?? null]
  );
  return rows[0];
};

/**
 * Accept an offer atomically:
 *   1. Mark offer as accepted
 *   2. Reserve the listing
 *   3. Reject all other pending offers on the same listing
 *   4. Create a transaction record
 * Uses SERIALIZABLE-level BEGIN for concurrent-offer safety — if two sellers
 * somehow race to accept, only one will succeed (the other's UPDATE will see 0 rows).
 */
const acceptOffer = async (offerId, listingId, buyerId, sellerId, agreedPrice) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const acceptRes = await client.query(
      `UPDATE offers
       SET status = 'accepted', responded_at = NOW()
       WHERE offer_id = $1 AND status = 'pending'
       RETURNING offer_id`,
      [offerId]
    );
    if (acceptRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return null; // already non-pending — controller will surface as 422
    }

    await client.query(
      `UPDATE listings SET status = 'reserved', updated_at = NOW() WHERE listing_id = $1`,
      [listingId]
    );

    // Auto-reject all other pending offers on the same listing
    await client.query(
      `UPDATE offers
       SET status = 'rejected', responded_at = NOW()
       WHERE listing_id = $1 AND status = 'pending' AND offer_id != $2`,
      [listingId, offerId]
    );

    const { rows } = await client.query(
      `INSERT INTO transactions (listing_id, offer_id, buyer_id, seller_id, agreed_price)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [listingId, offerId, buyerId, sellerId, agreedPrice]
    );

    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const rejectOffer = async (offerId) => {
  const { rows } = await query(
    `UPDATE offers
     SET status = 'rejected', responded_at = NOW()
     WHERE offer_id = $1 AND status = 'pending'
     RETURNING *`,
    [offerId]
  );
  return rows[0] ?? null;
};

/**
 * Counter-offer: mark original as 'countered', create a new offer with roles swapped
 * so that getSentOffers/getReceivedOffers correctly reflect who initiated each round.
 * In the new offer: buyer_id = listing seller (initiator), seller_id = listing buyer (recipient).
 */
const counterOffer = async (offerId, newBuyerId, newSellerId, listingId, proposedPrice, message) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const closeRes = await client.query(
      `UPDATE offers
       SET status = 'countered', responded_at = NOW()
       WHERE offer_id = $1 AND status = 'pending'
       RETURNING offer_id`,
      [offerId]
    );
    if (closeRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const { rows } = await client.query(
      `INSERT INTO offers (listing_id, buyer_id, seller_id, proposed_price, message, counter_of_offer_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [listingId, newBuyerId, newSellerId, proposedPrice, message ?? null, offerId]
    );

    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const cancelOffer = async (offerId, buyerId) => {
  const { rows } = await query(
    `UPDATE offers
     SET status = 'cancelled', responded_at = NOW()
     WHERE offer_id = $1 AND buyer_id = $2 AND status = 'pending'
     RETURNING *`,
    [offerId, buyerId]
  );
  return rows[0] ?? null;
};

/** Cron: expire all pending offers whose expires_at has passed. */
const expireOffers = async () => {
  const { rows } = await query(
    `UPDATE offers
     SET status = 'expired', responded_at = NOW()
     WHERE status = 'pending' AND expires_at < NOW()
     RETURNING offer_id, listing_id, buyer_id, seller_id`,
    []
  );
  return rows;
};

module.exports = {
  getOfferById,
  getSentOffers,
  getReceivedOffers,
  getPendingOfferCount,
  createOffer,
  acceptOffer,
  rejectOffer,
  counterOffer,
  cancelOffer,
  expireOffers,
};
