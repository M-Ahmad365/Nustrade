'use strict';

const { Router }       = require('express');
const { authenticate } = require('../middleware/auth');
const { validate }     = require('../middleware/validate');
const { createReviewSchema, updateReviewSchema } = require('../validators/reviews');
const ctrl = require('../controllers/reviews');

const router = Router();

router.use(authenticate);

// Static sub-path before /:id to avoid Express treating it as an ID
/** GET /api/v1/reviews/transaction/:txId — reviews for a transaction (parties only) */
router.get('/transaction/:txId', ctrl.getReviewsByTransaction);

/** POST /api/v1/reviews — create review after completed transaction */
router.post('/', validate(createReviewSchema), ctrl.createReview);

/** PATCH /api/v1/reviews/:id — edit own review within 7-day window */
router.patch('/:id', validate(updateReviewSchema), ctrl.updateReview);

module.exports = { router };
