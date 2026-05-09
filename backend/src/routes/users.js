'use strict';

const path    = require('path');
const { Router }    = require('express');
const { authenticate }       = require('../middleware/auth');
const { validate }            = require('../middleware/validate');
const { makeUpload }          = require('../middleware/upload');
const { updateProfileSchema } = require('../validators/users');
const ctrl                    = require('../controllers/users');

const router = Router();

const avatarDir = path.join(process.cwd(), 'uploads', 'avatars');
const { multerMiddleware, validateAndSave } = makeUpload({ maxCount: 1, field: 'avatar' });

// All user routes require a valid JWT
router.use(authenticate);

/** GET /api/v1/users/me — own full profile (includes email + phone) */
router.get('/me', ctrl.getMe);

/** PATCH /api/v1/users/me — update own profile */
router.patch('/me', validate(updateProfileSchema), ctrl.updateMe);

/** DELETE /api/v1/users/me — deactivate account + hide listings */
router.delete('/me', ctrl.deleteMe);

/** POST /api/v1/users/me/profile-picture — upload / replace avatar */
router.post(
  '/me/profile-picture',
  multerMiddleware,
  validateAndSave(avatarDir),
  ctrl.uploadProfilePicture
);

/** GET /api/v1/users/:userId — public profile (no email / phone) */
router.get('/:userId', ctrl.getPublicProfile);

/** GET /api/v1/users/:userId/listings — user's active listings */
router.get('/:userId/listings', ctrl.getUserListings);

/** GET /api/v1/users/:userId/reviews — reviews received by user */
router.get('/:userId/reviews', ctrl.getUserReviews);

module.exports = { router };
