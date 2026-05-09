'use strict';

const { Router }       = require('express');
const { authenticate } = require('../middleware/auth');
const { validate }     = require('../middleware/validate');
const { cancelTransactionSchema } = require('../validators/offers');
const ctrl = require('../controllers/transactions');

const router = Router();

// All transaction routes require authentication
router.use(authenticate);

/** GET /api/v1/transactions — list my transactions (buyer + seller) */
router.get('/', ctrl.getMyTransactions);

/** GET /api/v1/transactions/:id — detail; restricted to parties + admin */
router.get('/:id', ctrl.getTransactionById);

/** POST /api/v1/transactions/:id/confirm-buyer — buyer marks item received */
router.post('/:id/confirm-buyer', ctrl.confirmBuyer);

/** POST /api/v1/transactions/:id/confirm-seller — seller marks item handed over */
router.post('/:id/confirm-seller', ctrl.confirmSeller);

/** POST /api/v1/transactions/:id/cancel — either party cancels with optional reason */
router.post('/:id/cancel', validate(cancelTransactionSchema), ctrl.cancelTransaction);

/** POST /api/v1/transactions/:id/dispute — either party opens dispute for admin */
router.post('/:id/dispute', ctrl.disputeTransaction);

module.exports = { router };
