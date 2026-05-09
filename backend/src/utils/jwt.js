'use strict';

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { redis } = require('../config/redis');
const { env } = require('../config/env');

/**
 * Sign a JWT with a unique jti so individual tokens can be revoked.
 * @param {object} payload  — must include user_id and role at minimum
 */
const signToken = (payload) => {
  const jti = uuidv4();
  return {
    token: jwt.sign({ ...payload, jti }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRY }),
    jti,
  };
};

/** Verify and decode a JWT. Throws on invalid or expired token. */
const verifyToken = (token) => jwt.verify(token, env.JWT_SECRET);

/**
 * Add a jti to the Redis revocation set.
 * TTL matches the remaining lifetime of the token so the key auto-expires.
 * @param {string} jti       — JWT ID from the token payload
 * @param {number} expiryMs  — absolute expiry epoch in milliseconds (from exp * 1000)
 */
const revokeToken = (jti, expiryMs) => {
  const ttlSeconds = Math.max(1, Math.ceil((expiryMs - Date.now()) / 1000));
  // SET with EX — key auto-deletes when the token would have expired anyway
  return redis.set(`session:jwt_revoked:${jti}`, '1', 'EX', ttlSeconds);
};

/** Check if a jti is in the revocation set. */
const isTokenRevoked = async (jti) => {
  const val = await redis.get(`session:jwt_revoked:${jti}`);
  return val !== null;
};

/**
 * Revoke ALL tokens for a user issued before this moment.
 * Stores the current timestamp so authenticate can compare against token iat.
 * Called on password reset to invalidate every active session.
 * TTL matches the max token lifetime so the key auto-expires.
 */
const revokeAllUserSessions = (userId) => {
  const ttlSeconds = parseJwtExpiry(env.JWT_EXPIRY);
  return redis.set(`revoked_sessions:${userId}`, Date.now().toString(), 'EX', ttlSeconds);
};

/**
 * Returns true if this token was issued before the user's mass-revocation timestamp.
 * @param {number} userId
 * @param {number} tokenIssuedAtMs — payload.iat * 1000
 */
const areUserSessionsRevoked = async (userId, tokenIssuedAtMs) => {
  const revokedAt = await redis.get(`revoked_sessions:${userId}`);
  return revokedAt !== null && tokenIssuedAtMs < parseInt(revokedAt, 10);
};

// Parse a JWT expiry string ('7d', '24h', '3600s') into seconds.
function parseJwtExpiry(str) {
  const m = String(str).match(/^(\d+)([smhd])$/);
  if (!m) return 7 * 24 * 3600; // default 7 days
  return parseInt(m[1], 10) * { s: 1, m: 60, h: 3600, d: 86400 }[m[2]];
}

module.exports = { signToken, verifyToken, revokeToken, isTokenRevoked, revokeAllUserSessions, areUserSessionsRevoked };
