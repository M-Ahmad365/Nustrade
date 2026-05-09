'use strict';

const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { ok }                     = require('../utils/response');
const { notify }                 = require('../services/notify');
const { logger }                 = require('../utils/logger');
const queries                    = require('../db/queries/transactions');

/**
 * GET /api/v1/transactions — all transactions where current user is buyer or seller
 */
const getMyTransactions = asyncHandler(async (req, res) => {
  const transactions = await queries.getMyTransactions(req.user.user_id);
  return ok(res, { transactions });
});

/**
 * GET /api/v1/transactions/:id — transaction detail; restricted to parties + admin
 */
const getTransactionById = asyncHandler(async (req, res) => {
  const txId = parseInt(req.params.id, 10);
  if (!Number.isInteger(txId)) throw new AppError(400, 'INVALID_ID', 'Invalid transaction ID');

  const transaction = await queries.getTransactionById(txId);
  if (!transaction) throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found');

  const { user_id, role } = req.user;
  if (transaction.buyer_id !== user_id && transaction.seller_id !== user_id && role !== 'admin') {
    throw new AppError(403, 'FORBIDDEN', 'You are not a party to this transaction');
  }

  return ok(res, { transaction });
});

/**
 * POST /api/v1/transactions/:id/confirm-buyer
 * Buyer marks item as received. If seller has already confirmed, invoke complete_transaction.
 */
const confirmBuyer = asyncHandler(async (req, res) => {
  const txId = parseInt(req.params.id, 10);
  if (!Number.isInteger(txId)) throw new AppError(400, 'INVALID_ID', 'Invalid transaction ID');

  const updated = await queries.confirmBuyer(txId, req.user.user_id);
  if (!updated) {
    throw new AppError(422, 'CANNOT_CONFIRM', 'Transaction not found, not yours, already confirmed, or not in pending state');
  }

  notify(updated.seller_id, 'transaction_confirmed_by_other', { transaction_id: txId }).catch(() => {});

  if (updated.seller_confirmed_at) {
    // Both sides confirmed — finalize via stored procedure
    await queries.callCompleteTransaction(txId).catch((err) => {
      logger.error('[transaction] complete_transaction failed', { txId, error: err.message });
    });
    const final = await queries.getTransactionById(txId);
    return ok(res, { transaction: final }, 'Transaction completed');
  }

  return ok(res, { transaction: updated }, 'Buyer confirmation recorded — awaiting seller');
});

/**
 * POST /api/v1/transactions/:id/confirm-seller
 * Seller marks item as handed over. If buyer has already confirmed, invoke complete_transaction.
 */
const confirmSeller = asyncHandler(async (req, res) => {
  const txId = parseInt(req.params.id, 10);
  if (!Number.isInteger(txId)) throw new AppError(400, 'INVALID_ID', 'Invalid transaction ID');

  const updated = await queries.confirmSeller(txId, req.user.user_id);
  if (!updated) {
    throw new AppError(422, 'CANNOT_CONFIRM', 'Transaction not found, not yours, already confirmed, or not in pending state');
  }

  notify(updated.buyer_id, 'transaction_confirmed_by_other', { transaction_id: txId }).catch(() => {});

  if (updated.buyer_confirmed_at) {
    await queries.callCompleteTransaction(txId).catch((err) => {
      logger.error('[transaction] complete_transaction failed', { txId, error: err.message });
    });
    const final = await queries.getTransactionById(txId);
    return ok(res, { transaction: final }, 'Transaction completed');
  }

  return ok(res, { transaction: updated }, 'Seller confirmation recorded — awaiting buyer');
});

/**
 * POST /api/v1/transactions/:id/cancel — either party can cancel while pending_completion
 */
const cancelTransaction = asyncHandler(async (req, res) => {
  const txId = parseInt(req.params.id, 10);
  if (!Number.isInteger(txId)) throw new AppError(400, 'INVALID_ID', 'Invalid transaction ID');

  const transaction = await queries.getTransactionById(txId);
  if (!transaction) throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found');

  const { user_id } = req.user;
  const isBuyer  = transaction.buyer_id  === user_id;
  const isSeller = transaction.seller_id === user_id;
  if (!isBuyer && !isSeller) throw new AppError(403, 'FORBIDDEN', 'You are not a party to this transaction');

  const { reason } = req.body;
  const cancelled = await queries.cancelTransaction(txId, isBuyer, reason);
  if (!cancelled) throw new AppError(422, 'CANNOT_CANCEL', 'Transaction cannot be cancelled in its current state');

  const otherId = isBuyer ? transaction.seller_id : transaction.buyer_id;
  notify(otherId, 'transaction_cancelled', { transaction_id: txId, cancelled_by: user_id }).catch(() => {});

  return ok(res, { transaction: cancelled }, 'Transaction cancelled — listing restored to active');
});

/**
 * POST /api/v1/transactions/:id/dispute — either party opens a dispute for admin review
 */
const disputeTransaction = asyncHandler(async (req, res) => {
  const txId = parseInt(req.params.id, 10);
  if (!Number.isInteger(txId)) throw new AppError(400, 'INVALID_ID', 'Invalid transaction ID');

  const disputed = await queries.disputeTransaction(txId, req.user.user_id);
  if (!disputed) {
    throw new AppError(422, 'CANNOT_DISPUTE', 'Transaction not found, not yours, or not in pending_completion state');
  }

  // Log for admin visibility — Phase 9 will route this to an admin notification
  logger.warn('[transaction] dispute opened', { transaction_id: txId, by: req.user.user_id });

  return ok(res, { transaction: disputed }, 'Dispute opened — an admin will review this transaction');
});

module.exports = {
  getMyTransactions,
  getTransactionById,
  confirmBuyer,
  confirmSeller,
  cancelTransaction,
  disputeTransaction,
};
