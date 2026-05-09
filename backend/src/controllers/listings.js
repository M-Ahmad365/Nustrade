'use strict';

const path = require('path');
const fs   = require('fs');
const { v4: uuidv4 }             = require('uuid');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { ok, created, noContent } = require('../utils/response');
const { redis }                  = require('../config/redis');
const { getDb }                  = require('../config/mongo');
const { logger }                 = require('../utils/logger');
const queries                    = require('../db/queries/listings');
const { getWishlistWatchers }    = require('../db/queries/wishlist');
const { notify }                 = require('../services/notify');

// Magic-bytes validation — same rules as upload middleware, duplicated here
// because listing images are saved after DB insert (we need the listing_id for the path)
const hasValidMagicBytes = (buffer) => {
  if (!buffer || buffer.length < 4) return false;
  const [b0, b1, b2, b3] = buffer;
  const isJpeg = b0 === 0xff && b1 === 0xd8 && b2 === 0xff;
  const isPng  = b0 === 0x89 && b1 === 0x50 && b2 === 0x4e && b3 === 0x47;
  const isGif  = b0 === 0x47 && b1 === 0x49 && b2 === 0x46;
  const isWebp = buffer.length >= 12
    && b0 === 0x52 && b1 === 0x49 && b2 === 0x46 && b3 === 0x46
    && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
  return isJpeg || isPng || isGif || isWebp;
};

// Write image files to /uploads/listings/{id}/ and return their URL paths
const writeImagesToDir = (files, listingId) => {
  const listingDir = path.join(process.cwd(), 'uploads', 'listings', String(listingId));
  fs.mkdirSync(listingDir, { recursive: true });
  return files.map((file) => {
    const ext      = path.extname(file.originalname).toLowerCase() || '.jpg';
    const filename = `${uuidv4()}${ext}`;
    fs.writeFileSync(path.join(listingDir, filename), file.buffer);
    return `/uploads/listings/${listingId}/${filename}`;
  });
};

// Log listing view to MongoDB — best-effort; failure does not block the response
const logView = (listingId, viewerId) => {
  try {
    const db = getDb();
    db.collection('listing_views').insertOne({
      listing_id: listingId,
      viewer_id:  viewerId,
      viewed_at:  new Date(),
    }).catch((err) => logger.warn('[listing] mongo view log failed', { error: err.message }));
  } catch (err) {
    logger.warn('[listing] mongo view log skipped — db not ready', { error: err.message });
  }
};

/**
 * GET /api/v1/listings — home feed with optional filters, sort, and pagination
 */
const getListings = asyncHandler(async (req, res) => {
  const {
    category, min_price, max_price, condition,
    hostel, department, course_code, is_off_campus,
    sort, page, limit,
  } = req.query;

  let category_id;
  if (category) {
    const cat = await queries.getCategoryBySlug(category);
    if (!cat) throw new AppError(400, 'INVALID_CATEGORY', `Unknown category: ${category}`);
    category_id = cat.category_id;
  }

  const listings = await queries.getListings({
    category_id, min_price, max_price, condition,
    hostel, department, course_code, is_off_campus,
    sort, page, limit,
  });
  return ok(res, { listings, page, limit });
});

/**
 * GET /api/v1/listings/trending — top 10 most-viewed in last 24h from Redis sorted set
 */
const getTrending = asyncHandler(async (req, res) => {
  const ids = await redis.zrevrange('trending:24h', 0, 9);
  if (ids.length === 0) {
    return ok(res, { listings: [] });
  }

  const numericIds = ids.map(Number);
  const rows       = await queries.getListingsByIds(numericIds);

  // Redis gives IDs in score order; Postgres doesn't — re-sort to match Redis ranking
  const byId    = Object.fromEntries(rows.map((l) => [l.listing_id, l]));
  const ordered = numericIds.map((id) => byId[id]).filter(Boolean);

  return ok(res, { listings: ordered });
});

/**
 * GET /api/v1/listings/search — full-text search via tsvector/tsquery + autocomplete tracking
 */
const searchListings = asyncHandler(async (req, res) => {
  const { q, category, min_price, max_price, condition, sort, page, limit } = req.query;

  let category_id;
  if (category) {
    const cat = await queries.getCategoryBySlug(category);
    if (!cat) throw new AppError(400, 'INVALID_CATEGORY', `Unknown category: ${category}`);
    category_id = cat.category_id;
  }

  const listings = await queries.searchListings(q, {
    category_id, min_price, max_price, condition, sort, page, limit,
  });

  // Track search term frequency in Redis for autocomplete — fire-and-forget
  redis.zincrby('search:autocomplete', 1, q.toLowerCase()).catch(() => {});

  return ok(res, { listings, query: q, page, limit });
});

/**
 * GET /api/v1/listings/:id — full detail + view tracking (Redis dedup, Postgres increment, Mongo log)
 */
const getListingById = asyncHandler(async (req, res) => {
  const listingId = parseInt(req.params.id, 10);
  if (!Number.isInteger(listingId)) throw new AppError(400, 'INVALID_ID', 'Invalid listing ID');

  const listing = await queries.getListingById(listingId);
  if (!listing) throw new AppError(404, 'LISTING_NOT_FOUND', 'Listing not found');

  // One view per user per listing per hour — dedup via Redis TTL key
  // req.user is undefined for unauthenticated requests (optionalAuth route)
  const userId  = req.user?.user_id ?? 'anon';
  const viewKey = `view:${listingId}:${userId}`;
  const already  = await redis.get(viewKey);
  if (!already) {
    await queries.incrementViewCount(listingId);
    await redis.setex(viewKey, 3600, '1');
    if (req.user) logView(listingId, req.user.user_id); // async, best-effort
  }

  return ok(res, { listing });
});

/**
 * POST /api/v1/listings — create listing with images (multipart/form-data)
 * Requires email_verified. Images must be validated before DB insert.
 */
const createListing = asyncHandler(async (req, res) => {
  const files = req.files ?? [];
  if (files.length === 0) throw new AppError(400, 'NO_IMAGES', 'At least 1 image is required');
  if (files.length > 8)   throw new AppError(400, 'TOO_MANY_IMAGES', 'Maximum 8 images allowed per listing');

  // Validate all images before any DB write — prevents orphaned listing records on bad files
  for (const file of files) {
    if (!hasValidMagicBytes(file.buffer)) {
      throw new AppError(400, 'INVALID_FILE_CONTENT', 'File content does not match a supported image format');
    }
  }

  const {
    title, description, category_slug, condition, price,
    is_negotiable, location_hostel, is_off_campus, course_code, tags,
  } = req.body;

  const category = await queries.getCategoryBySlug(category_slug);
  if (!category) throw new AppError(400, 'INVALID_CATEGORY', `Unknown category: ${category_slug}`);

  const listing = await queries.createListing({
    sellerId:       req.user.user_id,
    categoryId:     category.category_id,
    title, description, price,
    isNegotiable:   is_negotiable,
    condition,
    locationHostel: location_hostel ?? null,
    isOffCampus:    is_off_campus ?? false,
    courseCode:     course_code ?? null,
  });

  // Write images to disk now that we have the listing_id for the directory path
  let imageUrls;
  try {
    imageUrls = writeImagesToDir(files, listing.listing_id);
  } catch (err) {
    // Disk failure after successful DB insert — roll back to keep state consistent
    await queries.hardDeleteListing(listing.listing_id);
    throw new AppError(500, 'UPLOAD_FAILED', 'Failed to save uploaded images');
  }

  const images = await queries.addImages(listing.listing_id, imageUrls);
  if (tags && tags.length > 0) await queries.addTags(listing.listing_id, tags);

  listing.images        = images;
  listing.tags          = tags ?? [];
  listing.category_slug = category.slug;
  listing.category_name = category.name;

  return created(res, { listing }, 'Listing created successfully');
});

/**
 * PATCH /api/v1/listings/:id — partial update by seller (category and images excluded)
 */
const updateListing = asyncHandler(async (req, res) => {
  const listingId = parseInt(req.params.id, 10);
  if (!Number.isInteger(listingId)) throw new AppError(400, 'INVALID_ID', 'Invalid listing ID');

  const { title, description, price, is_negotiable, condition, location_hostel, is_off_campus, course_code, tags } = req.body;

  const payload = {};
  if (title           !== undefined) payload.title          = title;
  if (description     !== undefined) payload.description    = description;
  if (price           !== undefined) payload.price          = price;
  if (is_negotiable   !== undefined) payload.isNegotiable   = is_negotiable;
  if (condition       !== undefined) payload.condition      = condition;
  if (location_hostel !== undefined) payload.locationHostel = location_hostel;
  if (is_off_campus   !== undefined) payload.isOffCampus    = is_off_campus;
  if (course_code     !== undefined) payload.courseCode     = course_code;

  if (Object.keys(payload).length === 0 && tags === undefined) {
    throw new AppError(400, 'NO_CHANGES', 'No fields provided to update');
  }

  // Capture old price before update so we can detect a price drop for wishlist notifications
  let oldPrice;
  if (price !== undefined) {
    const current = await queries.getListingById(listingId);
    if (!current) throw new AppError(404, 'LISTING_NOT_FOUND', 'Listing not found or already deleted');
    oldPrice = current.price;
  }

  if (Object.keys(payload).length > 0) {
    const updated = await queries.updateListing(listingId, payload);
    if (!updated) throw new AppError(404, 'LISTING_NOT_FOUND', 'Listing not found or already deleted');
  }

  if (tags !== undefined) await queries.replaceTags(listingId, tags);

  // Notify all wishlist watchers when price drops — fire-and-forget
  if (price !== undefined && price < oldPrice) {
    getWishlistWatchers(listingId)
      .then((watcherIds) => {
        for (const uid of watcherIds) {
          notify(uid, 'wishlist_price_drop', { listing_id: listingId, old_price: oldPrice, new_price: price }).catch(() => {});
        }
      })
      .catch(() => {});
  }

  const listing = await queries.getListingById(listingId);
  return ok(res, { listing }, 'Listing updated successfully');
});

/**
 * DELETE /api/v1/listings/:id — soft-delete; blocked if listing is currently reserved
 */
const deleteListing = asyncHandler(async (req, res) => {
  const listingId = parseInt(req.params.id, 10);
  if (!Number.isInteger(listingId)) throw new AppError(400, 'INVALID_ID', 'Invalid listing ID');

  const listing = await queries.getListingById(listingId);
  if (!listing) throw new AppError(404, 'LISTING_NOT_FOUND', 'Listing not found');

  if (listing.status === 'reserved') {
    throw new AppError(422, 'LISTING_RESERVED', 'Cannot delete — listing has an accepted offer. Cancel the offer first.');
  }

  const result = await queries.deleteListing(listingId);
  if (!result) throw new AppError(422, 'LISTING_NOT_ACTIVE', 'Only active listings can be deleted');

  // Best-effort removal of image files — failure does not block the response
  const listingDir = path.join(process.cwd(), 'uploads', 'listings', String(listingId));
  fs.rm(listingDir, { recursive: true, force: true }, () => {});

  return noContent(res);
});

/**
 * POST /api/v1/listings/:id/boost — rate-limited to once per 7 days per listing via Redis
 */
const boostListing = asyncHandler(async (req, res) => {
  const listingId = parseInt(req.params.id, 10);
  if (!Number.isInteger(listingId)) throw new AppError(400, 'INVALID_ID', 'Invalid listing ID');

  const boostKey = `boost:${listingId}`;
  const existing = await redis.get(boostKey);
  if (existing) {
    const ttl = await redis.ttl(boostKey);
    const hoursLeft = ttl > 0 ? Math.ceil(ttl / 3600) : 168;
    throw new AppError(429, 'BOOST_COOLDOWN', `Already boosted — can boost again in ${hoursLeft} hour(s)`);
  }

  const result = await queries.boostListing(listingId);
  if (!result) throw new AppError(422, 'LISTING_NOT_ACTIVE', 'Can only boost active listings');

  await redis.setex(boostKey, 7 * 24 * 3600, '1');

  return ok(res, { listing_id: result.listing_id, last_boosted_at: result.last_boosted_at }, 'Listing boosted successfully');
});

/**
 * POST /api/v1/listings/:id/images — add an image; max 8 per listing
 */
const addImage = asyncHandler(async (req, res) => {
  const listingId = parseInt(req.params.id, 10);
  if (!Number.isInteger(listingId)) throw new AppError(400, 'INVALID_ID', 'Invalid listing ID');

  const file = req.file;
  if (!file) throw new AppError(400, 'NO_FILE', 'No image file uploaded');

  if (!hasValidMagicBytes(file.buffer)) {
    throw new AppError(400, 'INVALID_FILE_CONTENT', 'File content does not match a supported image format');
  }

  const count = await queries.getImageCount(listingId);
  if (count >= 8) throw new AppError(400, 'MAX_IMAGES_REACHED', 'Maximum 8 images allowed per listing');

  const listingDir = path.join(process.cwd(), 'uploads', 'listings', String(listingId));
  fs.mkdirSync(listingDir, { recursive: true });

  const ext      = path.extname(file.originalname).toLowerCase() || '.jpg';
  const filename = `${uuidv4()}${ext}`;
  fs.writeFileSync(path.join(listingDir, filename), file.buffer);

  const imageUrl = `/uploads/listings/${listingId}/${filename}`;
  const [image]  = await queries.addImages(listingId, [imageUrl]);

  return created(res, { image }, 'Image added successfully');
});

/**
 * DELETE /api/v1/listings/:id/images/:imageId — remove image; blocked if it's the last one
 */
const removeImage = asyncHandler(async (req, res) => {
  const listingId = parseInt(req.params.id, 10);
  const imageId   = parseInt(req.params.imageId, 10);
  if (!Number.isInteger(listingId) || !Number.isInteger(imageId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid listing or image ID');
  }

  const count = await queries.getImageCount(listingId);
  if (count <= 1) throw new AppError(400, 'MIN_IMAGES_REQUIRED', 'Listing must retain at least 1 image');

  const deleted = await queries.removeImage(listingId, imageId);
  if (!deleted) throw new AppError(404, 'IMAGE_NOT_FOUND', 'Image not found on this listing');

  const filePath = path.join(
    process.cwd(),
    deleted.image_url.startsWith('/') ? deleted.image_url.slice(1) : deleted.image_url
  );
  fs.unlink(filePath, () => {});

  return noContent(res);
});

/**
 * POST /api/v1/listings/:id/report — submit a moderation report for a listing
 */
const reportListing = asyncHandler(async (req, res) => {
  const listingId = parseInt(req.params.id, 10);
  if (!Number.isInteger(listingId)) throw new AppError(400, 'INVALID_ID', 'Invalid listing ID');

  const listing = await queries.getListingById(listingId);
  if (!listing) throw new AppError(404, 'LISTING_NOT_FOUND', 'Listing not found');

  if (listing.seller_id === req.user.user_id) {
    throw new AppError(400, 'CANNOT_REPORT_OWN', 'Cannot report your own listing');
  }

  const { reason, details } = req.body;
  const report = await queries.addReport({
    listingId,
    reporterId: req.user.user_id,
    reason,
    details,
  });

  return created(res, { report_id: report.report_id }, 'Report submitted successfully');
});

module.exports = {
  getListings,
  getTrending,
  searchListings,
  getListingById,
  createListing,
  updateListing,
  deleteListing,
  boostListing,
  addImage,
  removeImage,
  reportListing,
};
