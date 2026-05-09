'use strict';

const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { ok, created }            = require('../utils/response');
const { redis }                  = require('../config/redis');
const { notify }                 = require('../services/notify');
const queries                    = require('../db/queries/offers');
const listingQueries             = require('../db/queries/listings');

/**
 * POST /api/v1/offers — submit an offer on an active listing
 */
const createOffer = asyncHandler(async (req, res) => {
  const { listing_id, proposed_price, message } = req.body;
  const buyerId = req.user.user_id;

  const listing = await listingQueries.getListingById(listing_id);
  if (!listing) throw new AppError(404, 'LISTING_NOT_FOUND', 'Listing not found');
  if (listing.status !== 'active') throw new AppError(422, 'LISTING_NOT_ACTIVE', 'Listing is not available for offers');
  if (listing.seller_id === buyerId) throw new AppError(400, 'SELF_OFFER', 'Cannot make an offer on your own listing');

  if (!listing.is_negotiable && proposed_price !== listing.price) {
    throw new AppError(422, 'NOT_NEGOTIABLE', 'This listing has a fixed price');
  }

  // Max 3 pending offers per user per listing to prevent spam
  const pendingCount = await queries.getPendingOfferCount(buyerId, listing_id);
  if (pendingCount >= 3) {
    throw new AppError(422, 'TOO_MANY_PENDING', 'You already have 3 pending offers on this listing');
  }

  // 20 new offers per user per calendar day — counter stored in Redis with 24h TTL
  const dateKey      = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const offerCountKey = `offer_count:${buyerId}:${dateKey}`;
  const dailyCount   = await redis.incr(offerCountKey);
  if (dailyCount === 1) await redis.expire(offerCountKey, 86400);
  if (dailyCount > 20) throw new AppError(429, 'OFFER_RATE_LIMIT', 'Maximum 20 new offers per day');

  const offer = await queries.createOffer({
    listingId:     listing_id,
    buyerId,
    sellerId:      listing.seller_id,
    proposedPrice: proposed_price,
    message,
  });

  notify(listing.seller_id, 'new_offer', {
    offer_id: offer.offer_id, listing_id, buyer_id: buyerId,
  }).catch(() => {});

  return created(res, { offer }, 'Offer submitted successfully');
});

/**
 * GET /api/v1/offers/sent — all offers the current user has made
 */
const getSentOffers = asyncHandler(async (req, res) => {
  const offers = await queries.getSentOffers(req.user.user_id);
  return ok(res, { offers });
});

/**
 * GET /api/v1/offers/received — all offers on the current user's listings
 */
const getReceivedOffers = asyncHandler(async (req, res) => {
  const offers = await queries.getReceivedOffers(req.user.user_id);
  return ok(res, { offers });
});

/**
 * POST /api/v1/offers/:id/accept — seller accepts offer (atomic multi-row update)
 */
const acceptOffer = asyncHandler(async (req, res) => {
  const offerId = parseInt(req.params.id, 10);
  if (!Number.isInteger(offerId)) throw new AppError(400, 'INVALID_ID', 'Invalid offer ID');

  const offer = await queries.getOfferById(offerId);
  if (!offer) throw new AppError(404, 'OFFER_NOT_FOUND', 'Offer not found');
  if (offer.seller_id !== req.user.user_id) throw new AppError(403, 'FORBIDDEN', 'Only the seller can accept this offer');
  if (offer.status !== 'pending') throw new AppError(422, 'OFFER_NOT_PENDING', `Offer is already ${offer.status}`);

  const transaction = await queries.acceptOffer(
    offerId, offer.listing_id, offer.buyer_id, offer.seller_id, offer.proposed_price
  );
  if (!transaction) throw new AppError(422, 'OFFER_NOT_PENDING', 'Offer could not be accepted — may have already changed state');

  notify(offer.buyer_id, 'offer_accepted', {
    offer_id: offerId, transaction_id: transaction.transaction_id, listing_id: offer.listing_id,
  }).catch(() => {});

  return ok(res, { transaction }, 'Offer accepted — transaction created');
});

/**
 * POST /api/v1/offers/:id/reject — seller rejects offer
 */
const rejectOffer = asyncHandler(async (req, res) => {
  const offerId = parseInt(req.params.id, 10);
  if (!Number.isInteger(offerId)) throw new AppError(400, 'INVALID_ID', 'Invalid offer ID');

  const offer = await queries.getOfferById(offerId);
  if (!offer) throw new AppError(404, 'OFFER_NOT_FOUND', 'Offer not found');
  if (offer.seller_id !== req.user.user_id) throw new AppError(403, 'FORBIDDEN', 'Only the seller can reject this offer');
  if (offer.status !== 'pending') throw new AppError(422, 'OFFER_NOT_PENDING', `Offer is already ${offer.status}`);

  const updated = await queries.rejectOffer(offerId);
  if (!updated) throw new AppError(422, 'OFFER_NOT_PENDING', 'Offer cannot be rejected in its current state');

  notify(offer.buyer_id, 'offer_rejected', {
    offer_id: offerId, listing_id: offer.listing_id,
  }).catch(() => {});

  return ok(res, { offer: updated }, 'Offer rejected');
});

/**
 * POST /api/v1/offers/:id/counter — seller sends a counter-offer
 * Original offer is closed as 'countered'; new offer is created with buyer/seller roles
 * swapped so that getSentOffers/getReceivedOffers correctly reflect the new round's initiator.
 */
const counterOffer = asyncHandler(async (req, res) => {
  const offerId = parseInt(req.params.id, 10);
  if (!Number.isInteger(offerId)) throw new AppError(400, 'INVALID_ID', 'Invalid offer ID');

  const offer = await queries.getOfferById(offerId);
  if (!offer) throw new AppError(404, 'OFFER_NOT_FOUND', 'Offer not found');
  if (offer.seller_id !== req.user.user_id) throw new AppError(403, 'FORBIDDEN', 'Only the seller can counter this offer');
  if (offer.status !== 'pending') throw new AppError(422, 'OFFER_NOT_PENDING', `Offer is already ${offer.status}`);

  const { proposed_price, message } = req.body;

  // Swap roles: listing seller becomes the initiator (buyer_id), original buyer becomes recipient
  const counterRecord = await queries.counterOffer(
    offerId,
    offer.seller_id, // newBuyerId  (listing seller initiates counter)
    offer.buyer_id,  // newSellerId (original buyer receives it)
    offer.listing_id,
    proposed_price,
    message
  );
  if (!counterRecord) throw new AppError(422, 'OFFER_NOT_PENDING', 'Offer could not be countered — may have already changed state');

  notify(offer.buyer_id, 'offer_countered', {
    offer_id:         offerId,
    counter_offer_id: counterRecord.offer_id,
    listing_id:       offer.listing_id,
  }).catch(() => {});

  return created(res, { offer: counterRecord }, 'Counter-offer sent');
});

/**
 * POST /api/v1/offers/:id/cancel — buyer cancels their own pending offer
 */
const cancelOffer = asyncHandler(async (req, res) => {
  const offerId = parseInt(req.params.id, 10);
  if (!Number.isInteger(offerId)) throw new AppError(400, 'INVALID_ID', 'Invalid offer ID');

  const cancelled = await queries.cancelOffer(offerId, req.user.user_id);
  if (!cancelled) throw new AppError(422, 'CANNOT_CANCEL', 'Offer not found, not pending, or you are not the buyer');

  notify(cancelled.seller_id, 'offer_cancelled', {
    offer_id: offerId, listing_id: cancelled.listing_id,
  }).catch(() => {});

  return ok(res, { offer: cancelled }, 'Offer cancelled');
});

module.exports = { createOffer, getSentOffers, getReceivedOffers, acceptOffer, rejectOffer, counterOffer, cancelOffer };
