'use strict';

const path = require('path');
const fs   = require('fs');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { ok, noContent }          = require('../utils/response');
const queries                    = require('../db/queries/users');

/**
 * GET /api/v1/users/me
 * Own full profile — includes email and phone number.
 */
const getMe = asyncHandler(async (req, res) => {
  const user = await queries.getOwnProfile(req.user.user_id);
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  return ok(res, { user });
});

/**
 * PATCH /api/v1/users/me
 * Partial profile update. Cross-field hostel/residence validation is handled here
 * (after merging incoming data with current DB state) rather than in the validator,
 * because partial updates may only include one of the two interdependent fields.
 */
const updateMe = asyncHandler(async (req, res) => {
  const { full_name, department, semester, residence_type, hostel_name, phone_number, bio } = req.body;

  // Fetch current profile to resolve cross-field constraints on partial updates
  const current = await queries.getOwnProfile(req.user.user_id);
  if (!current) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

  const effectiveResidenceType = residence_type ?? current.residence_type;
  // hasOwnProperty distinguishes "not sent" (undefined) from "explicitly null"
  const hostelInRequest  = Object.prototype.hasOwnProperty.call(req.body, 'hostel_name');
  const effectiveHostel  = hostelInRequest ? (hostel_name ?? null) : current.hostel_name;

  if (effectiveResidenceType === 'hostellite' && !effectiveHostel) {
    throw new AppError(400, 'VALIDATION_ERROR', 'hostel_name is required when residence_type is hostellite');
  }

  // Build update payload — only include keys that were actually sent
  const payload = {};
  if (full_name      !== undefined) payload.fullName      = full_name;
  if (department     !== undefined) payload.department    = department;
  if (semester       !== undefined) payload.semester      = semester;
  if (residence_type !== undefined) {
    payload.residenceType = residence_type;
    // Switching to day_scholar: clear hostel even if hostel_name not in request
    if (residence_type === 'day_scholar' && !hostelInRequest) {
      payload.hostelName = null;
    }
  }
  if (hostelInRequest)              payload.hostelName    = hostel_name ?? null;
  if (phone_number   !== undefined) payload.phoneNumber   = phone_number ?? null;
  if (bio            !== undefined) payload.bio           = bio ?? null;

  if (Object.keys(payload).length === 0) {
    throw new AppError(400, 'NO_CHANGES', 'No fields provided to update');
  }

  const updated = await queries.updateProfile(req.user.user_id, payload);
  return ok(res, { user: updated }, 'Profile updated successfully');
});

/**
 * DELETE /api/v1/users/me
 * Soft-delete: sets is_active=false and marks all active listings as deleted_by_user.
 * Historical transactions and reviews are preserved per spec 3.2.
 */
const deleteMe = asyncHandler(async (req, res) => {
  await queries.deactivateUser(req.user.user_id);
  return noContent(res);
});

/**
 * POST /api/v1/users/me/profile-picture
 * Upload a new avatar. Old file is deleted from disk on replacement.
 * File is processed by multer + validateAndSave before this handler runs.
 */
const uploadProfilePicture = asyncHandler(async (req, res) => {
  if (!req.file?.savedFilename) {
    throw new AppError(400, 'NO_FILE', 'No image file uploaded');
  }

  const imageUrl = `/uploads/avatars/${req.file.savedFilename}`;

  // Grab old URL before overwriting so we can clean up the old file
  const oldUrl = await queries.getProfilePictureUrl(req.user.user_id);
  await queries.updateProfilePicture(req.user.user_id, imageUrl);

  if (oldUrl) {
    // best-effort delete — if the file is already missing, that's fine
    const oldPath = path.join(process.cwd(), oldUrl.startsWith('/') ? oldUrl.slice(1) : oldUrl);
    fs.unlink(oldPath, () => {});
  }

  return ok(res, { profile_picture_url: imageUrl }, 'Profile picture updated successfully');
});

/**
 * GET /api/v1/users/:userId
 * Public profile — never leaks email, phone, or password_hash.
 * hostel_name only exposed for hostellites (via CASE in query).
 */
const getPublicProfile = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (!Number.isInteger(userId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid user ID');
  }
  const user = await queries.getPublicProfile(userId);
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  return ok(res, { user });
});

/**
 * GET /api/v1/users/:userId/listings
 * Active listings for any user. Paginated with page + limit query params.
 */
const getUserListings = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (!Number.isInteger(userId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid user ID');
  }
  const page   = Math.max(1, parseInt(req.query.page,  10) || 1);
  const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const VALID_STATUSES = ['active', 'sold', 'expired', 'deleted'];
  const status = VALID_STATUSES.includes(req.query.status) ? req.query.status : null;
  const listings = await queries.getUserListings(userId, page, limit, status);
  return ok(res, { listings, page, limit });
});

/**
 * GET /api/v1/users/:userId/reviews
 * Reviews received by a user, newest first. Includes reviewer's public info.
 */
const getUserReviews = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (!Number.isInteger(userId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid user ID');
  }
  const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const reviews = await queries.getUserReviews(userId, page, limit);
  return ok(res, { reviews, page, limit });
});

module.exports = { getMe, updateMe, deleteMe, uploadProfilePicture, getPublicProfile, getUserListings, getUserReviews };
