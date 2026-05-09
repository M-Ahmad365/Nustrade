'use strict';

const { Router }          = require('express');
const { authenticate }    = require('../middleware/auth');
const { requireVerified } = require('../middleware/auth');
const { validate }        = require('../middleware/validate');
const {
  createOfferSchema,
  counterOfferSchema,
} = require('../validators/offers');
const ctrl = require('../controllers/offers');

const router = Router();

// All offer routes require authentication
router.use(authenticate);

// Static sub-paths before /:id to avoid Express treating them as IDs
router.get('/sent',     ctrl.getSentOffers);
router.get('/received', ctrl.getReceivedOffers);

/** POST /api/v1/offers — create offer; requires verified email */
router.post('/', requireVerified, validate(createOfferSchema), ctrl.createOffer);

/** POST /api/v1/offers/:id/accept — seller accepts */
router.post('/:id/accept', ctrl.acceptOffer);

/** POST /api/v1/offers/:id/reject — seller rejects */
router.post('/:id/reject', ctrl.rejectOffer);

/** POST /api/v1/offers/:id/counter — seller counters with new price */
router.post('/:id/counter', validate(counterOfferSchema), ctrl.counterOffer);

/** POST /api/v1/offers/:id/cancel — buyer cancels own pending offer */
router.post('/:id/cancel', ctrl.cancelOffer);

module.exports = { router };
