'use strict';

const { verifyToken, isTokenRevoked, areUserSessionsRevoked } = require('../utils/jwt');
const { query } = require('../config/postgres');
const { AppError } = require('./errorHandler');

/**
 * authenticate — verify JWT, check revocation, check user is active + not banned.
 * Attaches full user row to req.user on success.
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return next(new AppError(401, 'MISSING_TOKEN', 'Authentication token required'));
    }

    const token = authHeader.slice(7);
    const payload = verifyToken(token);

    if (await isTokenRevoked(payload.jti)) {
      return next(new AppError(401, 'TOKEN_REVOKED', 'Token has been revoked'));
    }

    // Check if a password reset has invalidated all sessions issued before a timestamp
    if (await areUserSessionsRevoked(payload.user_id, payload.iat * 1000)) {
      return next(new AppError(401, 'TOKEN_REVOKED', 'Token has been revoked'));
    }

    const { rows } = await query(
      'SELECT user_id, email, full_name, role, email_verified, is_banned, is_active FROM users WHERE user_id = $1',
      [payload.user_id]
    );

    const user = rows[0];
    if (!user || !user.is_active) {
      return next(new AppError(401, 'USER_NOT_FOUND', 'User account not found or deactivated'));
    }
    if (user.is_banned) {
      return next(new AppError(403, 'USER_BANNED', 'Your account has been banned'));
    }

    req.user = user;
    next();
  } catch (err) {
    next(err); // JWT errors fall through to errorHandler's JWT handling
  }
};

/**
 * requireVerified — run after authenticate.
 * Blocks unverified users from creating listings, offers, or chats.
 */
const requireVerified = (req, res, next) => {
  if (!req.user.email_verified) {
    return next(new AppError(403, 'EMAIL_NOT_VERIFIED', 'Please verify your email before performing this action'));
  }
  next();
};

/** requireAdmin — run after authenticate. Blocks non-admin users. */
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return next(new AppError(403, 'FORBIDDEN', 'Admin access required'));
  }
  next();
};

/**
 * requireOwner — factory that verifies req.user owns the resource.
 * @param {(req: Request) => Promise<number>} getOwnerId
 *   Async fn that resolves the owner's user_id from req (e.g. by querying DB with req.params.id).
 *   Return null/undefined to trigger 404.
 */
const requireOwner = (getOwnerId) => async (req, res, next) => {
  try {
    const ownerId = await getOwnerId(req);
    if (ownerId == null) {
      return next(new AppError(404, 'NOT_FOUND', 'Resource not found'));
    }
    if (ownerId !== req.user.user_id && req.user.role !== 'admin') {
      return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to modify this resource'));
    }
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * optionalAuth — like authenticate, but passes through if no token present.
 * Use on public read routes that benefit from knowing the user (e.g. is_saved flag).
 */
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    // No token — continue as anonymous
    return next();
  }
  // Token present — validate it; errors also pass through rather than blocking
  try {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);

    if (await isTokenRevoked(payload.jti)) return next();
    if (await areUserSessionsRevoked(payload.user_id, payload.iat * 1000)) return next();

    const { rows } = await query(
      'SELECT user_id, email, full_name, role, email_verified, is_banned, is_active FROM users WHERE user_id = $1',
      [payload.user_id]
    );
    const user = rows[0];
    if (user && user.is_active && !user.is_banned) {
      req.user = user;
    }
  } catch {
    // Invalid token — continue as anonymous, don't block
  }
  next();
};

module.exports = { authenticate, optionalAuth, requireVerified, requireAdmin, requireOwner };
