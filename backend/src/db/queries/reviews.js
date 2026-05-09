'use strict';

const { query } = require('../../config/postgres');

/** Fetch a single review by PK. */
const getReviewById = async (reviewId) => {
  const { rows } = await query(
    `SELECT r.*, u.full_name AS reviewer_name
     FROM reviews r
     JOIN users u ON u.user_id = r.reviewer_id
     WHERE r.review_id = $1`,
    [reviewId]
  );
  return rows[0] ?? null;
};

/** All reviews for a transaction (up to 2 — one per party). */
const getReviewsByTransaction = async (transactionId) => {
  const { rows } = await query(
    `SELECT r.*, u.full_name AS reviewer_name
     FROM reviews r
     JOIN users u ON u.user_id = r.reviewer_id
     WHERE r.transaction_id = $1
     ORDER BY r.created_at ASC`,
    [transactionId]
  );
  return rows;
};

/**
 * Insert a new review. The DB trigger trg_reviews_recalc_rating fires automatically
 * and recalculates aggregate_rating + total_reviews on the reviewee's user row.
 * Throws on duplicate (23505) — handled in controller.
 */
const createReview = async ({ transactionId, reviewerId, revieweeId, rating, comment }) => {
  const { rows } = await query(
    `INSERT INTO reviews (transaction_id, reviewer_id, reviewee_id, rating, comment)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [transactionId, reviewerId, revieweeId, rating, comment ?? null]
  );
  return rows[0];
};

/**
 * Update a review — only if the reviewer owns it and it was created within 7 days.
 * Returns null when the window has passed or the review is not found/owned.
 */
const updateReview = async (reviewId, reviewerId, rating, comment) => {
  const fields = [];
  const vals   = [];
  let i = 1;

  if (rating  !== undefined) { fields.push(`rating = $${i++}`);  vals.push(rating); }
  if (comment !== undefined) { fields.push(`comment = $${i++}`); vals.push(comment); }

  if (fields.length === 0) return null;

  vals.push(reviewId, reviewerId);
  const { rows } = await query(
    `UPDATE reviews
     SET ${fields.join(', ')}
     WHERE review_id = $${i++}
       AND reviewer_id = $${i++}
       AND created_at > NOW() - INTERVAL '7 days'
     RETURNING *`,
    vals
  );
  return rows[0] ?? null;
};

module.exports = { getReviewById, getReviewsByTransaction, createReview, updateReview };
