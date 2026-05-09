'use strict';

const { Router }       = require('express');
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/wishlist');

const router = Router();

router.use(authenticate);

/** GET /api/v1/wishlist — my wishlist */
router.get('/', ctrl.getWishlist);

/** POST /api/v1/wishlist/:listingId — add to wishlist */
router.post('/:listingId', ctrl.addToWishlist);

/** DELETE /api/v1/wishlist/:listingId — remove from wishlist */
router.delete('/:listingId', ctrl.removeFromWishlist);

module.exports = { router };
