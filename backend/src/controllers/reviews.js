'use strict';

const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { ok, created }            = require('../utils/response');
const { notify }                 = require('../services/notify');
const queries                    = require('../db/queries/reviews');
const txQueries                  = require('../db/queries/transactions');

/**
 * POST /api/v1/reviews — create a review after a completed transaction.
 * Both buyer and seller may review each other; one review per person per transaction.
 */
const createReview = asyncHandler(async (req, res) => {
  const { transaction_id, reviewee_id, rating, comment } = req.body;
  const reviewerId = req.user.user_id;

  if (reviewerId === reviewee_id) {
    throw new AppError(422, 'NO_SELF_REVIEW', 'Cannot review yourself');
  }

  const transaction = await txQueries.getTransactionById(transaction_id);
  if (!transaction) throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found');

  const isBuyer  = transaction.buyer_id  === reviewerId;
  const isSeller = transaction.seller_id === reviewerId;
  if (!isBuyer && !isSeller) {
    throw new AppError(403, 'FORBIDDEN', 'You are not a party to this transaction');
  }

  // Verify reviewee_id is the other party (not some random user)
  const expectedRevieweeId = isBuyer ? transaction.seller_id : transaction.buyer_id;
  if (reviewee_id !== expectedRevieweeId) {
    throw new AppError(422, 'INVALID_REVIEWEE', 'reviewee_id must be the other party to this transaction');
  }

  if (transaction.status !== 'completed') {
    throw new AppError(422, 'TRANSACTION_NOT_COMPLETE', 'Reviews can only be submitted after the transaction is completed');
  }

  let review;
  try {
    review = await queries.createReview({ transactionId: transaction_id, reviewerId, revieweeId: reviewee_id, rating, comment });
  } catch (err) {
    if (err.code === '23505') {
      throw new AppError(409, 'REVIEW_EXISTS', 'You have already reviewed this transaction');
    }
    throw err;
  }

  notify(reviewee_id, 'review_received', { review_id: review.review_id, transaction_id, rating }).catch(() => {});

  return created(res, { review }, 'Review submitted');
});

/**
 * PATCH /api/v1/reviews/:id — edit own review within 7 days of creation.
 */
const updateReview = asyncHandler(async (req, res) => {
  const reviewId = parseInt(req.params.id, 10);
  if (!Number.isInteger(reviewId)) throw new AppError(400, 'INVALID_ID', 'Invalid review ID');

  const existing = await queries.getReviewById(reviewId);
  if (!existing) throw new AppError(404, 'REVIEW_NOT_FOUND', 'Review not found');
  if (existing.reviewer_id !== req.user.user_id) throw new AppError(403, 'FORBIDDEN', 'You did not write this review');

  // 7-day window check in JS to give a precise error (DB also enforces it)
  const ageMs = Date.now() - new Date(existing.created_at).getTime();
  if (ageMs > 7 * 24 * 60 * 60 * 1000) {
    throw new AppError(422, 'EDIT_WINDOW_CLOSED', 'Reviews can only be edited within 7 days of posting');
  }

  const { rating, comment } = req.body;
  const updated = await queries.updateReview(reviewId, req.user.user_id, rating, comment);
  if (!updated) throw new AppError(422, 'CANNOT_UPDATE', 'Review could not be updated');

  return ok(res, { review: updated }, 'Review updated');
});

/**
 * GET /api/v1/reviews/transaction/:txId — all reviews for a transaction; only parties may view.
 */
const getReviewsByTransaction = asyncHandler(async (req, res) => {
  const txId = parseInt(req.params.txId, 10);
  if (!Number.isInteger(txId)) throw new AppError(400, 'INVALID_ID', 'Invalid transaction ID');

  const transaction = await txQueries.getTransactionById(txId);
  if (!transaction) throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found');

  const { user_id, role } = req.user;
  if (transaction.buyer_id !== user_id && transaction.seller_id !== user_id && role !== 'admin') {
    throw new AppError(403, 'FORBIDDEN', 'You are not a party to this transaction');
  }

  const reviews = await queries.getReviewsByTransaction(txId);
  return ok(res, { reviews });
});

module.exports = { createReview, updateReview, getReviewsByTransaction };
