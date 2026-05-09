'use strict';

const { Router }         = require('express');
const { authenticate, optionalAuth, requireVerified, requireOwner } = require('../middleware/auth');
const { validate }       = require('../middleware/validate');
const { makeUpload }     = require('../middleware/upload');
const { postLimiter }    = require('../middleware/rateLimit');
const {
  createListingSchema,
  updateListingSchema,
  listingsQuerySchema,
  searchQuerySchema,
  reportSchema,
} = require('../validators/listings');
const ctrl                  = require('../controllers/listings');
const { getListingOwnerId } = require('../db/queries/listings');

const router = Router();

// Multer instances — memory storage; magic-bytes check done in controller
const { multerMiddleware: listingImagesUpload } = makeUpload({ maxCount: 8,  field: 'images' });
const { multerMiddleware: singleImageUpload }   = makeUpload({ maxCount: 1,  field: 'image' });

// Ownership guard — resolves seller_id from DB and compares to req.user.user_id
const ownerCheck = requireOwner(async (req) => {
  const id = parseInt(req.params.id, 10);
  return Number.isInteger(id) ? getListingOwnerId(id) : null;
});

// ── Read routes — public, token optional (provides is_saved flag when logged in) ──
// Static sub-paths before /:id to prevent Express matching them as IDs

/** GET /api/v1/listings/trending — Redis-cached top 10 */
router.get('/trending', optionalAuth, ctrl.getTrending);

/** GET /api/v1/listings/search?q= — full-text search */
router.get('/search', optionalAuth, validate(searchQuerySchema, 'query'), ctrl.searchListings);

/** GET /api/v1/listings — home feed with filters */
router.get('/', optionalAuth, validate(listingsQuerySchema, 'query'), ctrl.getListings);

/** GET /api/v1/listings/:id — listing detail + view tracking */
router.get('/:id', optionalAuth, ctrl.getListingById);

// ── Write routes — require authentication ─────────────────────────────────────

/** POST /api/v1/listings — create listing; multipart/form-data with images */
router.post(
  '/',
  authenticate, requireVerified, postLimiter,
  listingImagesUpload, validate(createListingSchema),
  ctrl.createListing
);

/** PATCH /api/v1/listings/:id — partial update by owner */
router.patch('/:id', authenticate, ownerCheck, validate(updateListingSchema), ctrl.updateListing);

/** DELETE /api/v1/listings/:id — soft-delete by owner */
router.delete('/:id', authenticate, ownerCheck, ctrl.deleteListing);

/** POST /api/v1/listings/:id/boost — once per 7 days */
router.post('/:id/boost', authenticate, ownerCheck, ctrl.boostListing);

/** POST /api/v1/listings/:id/images — add image (max 8 total) */
router.post('/:id/images', authenticate, ownerCheck, requireVerified, singleImageUpload, ctrl.addImage);

/** DELETE /api/v1/listings/:id/images/:imageId — remove image (min 1 must remain) */
router.delete('/:id/images/:imageId', authenticate, ownerCheck, ctrl.removeImage);

/** POST /api/v1/listings/:id/report — any verified user can report */
router.post('/:id/report', authenticate, validate(reportSchema), ctrl.reportListing);

module.exports = { router };
