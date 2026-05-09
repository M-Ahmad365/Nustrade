'use strict';

const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { ok, created, noContent } = require('../utils/response');
const queries                    = require('../db/queries/wishlist');
const { getListingById }         = require('../db/queries/listings');

/**
 * GET /api/v1/wishlist — current user's wishlisted listings with listing details.
 */
const getWishlist = asyncHandler(async (req, res) => {
  const items = await queries.getWishlist(req.user.user_id);
  return ok(res, { wishlist: items });
});

/**
 * POST /api/v1/wishlist/:listingId — add a listing to wishlist.
 * Silently succeeds if already present (idempotent).
 */
const addToWishlist = asyncHandler(async (req, res) => {
  const listingId = parseInt(req.params.listingId, 10);
  if (!Number.isInteger(listingId)) throw new AppError(400, 'INVALID_ID', 'Invalid listing ID');

  const listing = await getListingById(listingId);
  if (!listing) throw new AppError(404, 'LISTING_NOT_FOUND', 'Listing not found');

  if (listing.seller_id === req.user.user_id) {
    throw new AppError(422, 'OWN_LISTING', 'Cannot wishlist your own listing');
  }

  await queries.addToWishlist(req.user.user_id, listingId);
  return created(res, null, 'Added to wishlist');
});

/**
 * DELETE /api/v1/wishlist/:listingId — remove from wishlist.
 */
const removeFromWishlist = asyncHandler(async (req, res) => {
  const listingId = parseInt(req.params.listingId, 10);
  if (!Number.isInteger(listingId)) throw new AppError(400, 'INVALID_ID', 'Invalid listing ID');

  const removed = await queries.removeFromWishlist(req.user.user_id, listingId);
  if (!removed) throw new AppError(404, 'NOT_IN_WISHLIST', 'Listing is not in your wishlist');

  return noContent(res);
});

module.exports = { getWishlist, addToWishlist, removeFromWishlist };
