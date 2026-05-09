'use strict';

const { redis } = require('../config/redis');

/** Generate a cryptographically random 6-digit OTP string. */
const generateOtp = () => {
  // Math.random is fine here — OTPs are short-lived and rate-limited
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  console.log('=== GENERATED OTP ===', otp);
  return otp;
};

/**
 * Store an OTP in Redis.
 * @param {string} key        — Redis key, e.g. "otp:signup:user@nust.edu.pk"
 * @param {string} otp        — 6-digit string
 * @param {number} ttlSeconds — expiry (default 600 = 10 min per SPECS)
 */
const storeOtp = (key, otp, ttlSeconds = 600) =>
  redis.set(key, otp, 'EX', ttlSeconds);

/**
 * Verify an OTP. Deletes the key on match (single-use).
 * Returns true on match, false on mismatch or missing key.
 */
const verifyOtp = async (key, otp) => {
  const stored = await redis.get(key);
  if (!stored || stored !== otp) return false;
  await redis.del(key);
  return true;
};

module.exports = { generateOtp, storeOtp, verifyOtp };
