'use strict';

const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { created, ok } = require('../utils/response');
const { hashPassword, verifyPassword } = require('../utils/password');
const { generateOtp, storeOtp, verifyOtp } = require('../utils/otp');
const { signToken, revokeToken, revokeAllUserSessions, verifyToken } = require('../utils/jwt');
const { sendOtpEmail, sendPasswordResetEmail } = require('../utils/email');
const { redis } = require('../config/redis');
const queries = require('../db/queries/auth');

const publicUser = (user) => ({
  user_id:        user.user_id,
  email:          user.email,
  full_name:      user.full_name,
  role:           user.role,
  email_verified: user.email_verified,
});

/**
 * POST /api/v1/auth/signup
 * Validate input, hash password, create user, send OTP.
 */
const signup = asyncHandler(async (req, res) => {
  const { email, password, full_name, department, semester, residence_type, hostel_name, phone_number } = req.body;
  console.log('=== SIGNUP START ===', email);

  const existing = await queries.findUserByEmail(email);
  if (existing) {
    throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
  }

  const passwordHash = await hashPassword(password);
  const user = await queries.createUser({
    email, passwordHash,
    fullName:      full_name,
    department,
    semester,
    residenceType: residence_type,
    hostelName:    hostel_name,
    phoneNumber:   phone_number,
  });

  const otp = generateOtp();
  console.log('========= DEV OTP:', otp, '=========');
  await storeOtp(`otp:signup:${email}`, otp);
  await sendOtpEmail(email, otp);

  return created(res, { user_id: user.user_id, email: user.email }, 'Account created. Check your email for the verification code.');
});

/**
 * POST /api/v1/auth/verify-otp
 * Verify signup OTP, mark email as verified, return JWT.
 */
const verifyOtpHandler = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  const user = await queries.findUserByEmail(email);
  if (!user || !user.is_active) {
    throw new AppError(400, 'INVALID_OTP', 'Invalid or expired verification code');
  }
  if (user.email_verified) {
    throw new AppError(400, 'ALREADY_VERIFIED', 'This email is already verified — please log in');
  }

  const valid = await verifyOtp(`otp:signup:${email}`, otp);
  if (!valid) {
    throw new AppError(400, 'INVALID_OTP', 'Invalid or expired verification code');
  }

  await queries.verifyEmail(user.user_id);
  const verifiedUser = await queries.findUserById(user.user_id);
  const { token } = signToken({ user_id: verifiedUser.user_id, role: verifiedUser.role });

  return ok(res, { token, user: publicUser(verifiedUser) }, 'Email verified successfully. Welcome to NusTrade!');
});

/**
 * POST /api/v1/auth/resend-otp
 * Resend signup OTP. Rate-limited to once per minute per email via Redis lock.
 */
const resendOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;

  // Per-email rate limit tighter than the IP authLimiter: 1 resend per minute
  const lockKey = `otp:resend_lock:${email}`;
  if (await redis.get(lockKey)) {
    throw new AppError(429, 'RESEND_LIMIT', 'Please wait at least 1 minute before requesting another code');
  }

  const user = await queries.findUserByEmail(email);
  if (user && !user.email_verified && user.is_active) {
    const otp = generateOtp();
    await storeOtp(`otp:signup:${email}`, otp);
    await sendOtpEmail(email, otp);
  }

  // Set lock regardless of whether user existed — prevents timing-based enumeration
  await redis.set(lockKey, '1', 'EX', 60);
  return ok(res, null, 'If the account exists and is unverified, a new code has been sent');
});

/**
 * POST /api/v1/auth/login
 * Authenticate user. Returns JWT on success.
 * Returns 403 EMAIL_NOT_VERIFIED if email hasn't been confirmed yet
 * so the frontend can redirect to the OTP page.
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await queries.findUserByEmail(email);
  if (!user || !user.is_active) {
    // Consistent message — don't reveal which field is wrong
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  if (user.is_banned) {
    throw new AppError(403, 'USER_BANNED', 'Your account has been banned. Contact support if you believe this is an error.');
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  if (!user.email_verified) {
    throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Please verify your email before logging in');
  }

  const { token } = signToken({ user_id: user.user_id, role: user.role });
  return ok(res, { token, user: publicUser(user) }, 'Login successful');
});

/**
 * POST /api/v1/auth/forgot-password
 * Request a password reset OTP.
 * Always returns success to prevent email enumeration.
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await queries.findUserByEmail(email);
  if (user && user.email_verified && user.is_active) {
    const otp = generateOtp();
    await storeOtp(`otp:reset:${email}`, otp);
    await sendPasswordResetEmail(email, otp);
  }

  // Generic response regardless — do not leak whether the account exists
  return ok(res, null, 'If an active verified account exists for this email, a reset code has been sent');
});

/**
 * POST /api/v1/auth/reset-password
 * Reset password with OTP. Invalidates ALL existing sessions for this user
 * so a compromised token cannot be reused after a password reset.
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, new_password } = req.body;

  const user = await queries.findUserByEmail(email);
  if (!user || !user.is_active) {
    throw new AppError(400, 'INVALID_OTP', 'Invalid or expired reset code');
  }

  const valid = await verifyOtp(`otp:reset:${email}`, otp);
  if (!valid) {
    throw new AppError(400, 'INVALID_OTP', 'Invalid or expired reset code');
  }

  const passwordHash = await hashPassword(new_password);
  await queries.updatePassword(user.user_id, passwordHash);
  // Revoke all existing sessions — anyone holding an old token gets a 401
  await revokeAllUserSessions(user.user_id);

  return ok(res, null, 'Password reset successfully. Please log in with your new password.');
});

/**
 * POST /api/v1/auth/change-password
 * Change password for an authenticated user. Requires current password to prevent
 * session-hijacking attacks where an attacker changes the password without knowing it.
 */
const changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;

  // Re-fetch with password_hash — req.user doesn't include it
  const user = await queries.findUserByEmail(req.user.email);
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

  const valid = await verifyPassword(current_password, user.password_hash);
  if (!valid) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect');
  }

  const passwordHash = await hashPassword(new_password);
  await queries.updatePassword(req.user.user_id, passwordHash);

  return ok(res, null, 'Password changed successfully');
});

/**
 * POST /api/v1/auth/logout
 * Revoke the current JWT by jti so it cannot be reused even before expiry.
 */
const logout = asyncHandler(async (req, res) => {
  // authenticate already verified the token; safe to parse again for jti + exp
  const token = req.headers.authorization.slice(7);
  const payload = verifyToken(token);
  await revokeToken(payload.jti, payload.exp * 1000);
  return ok(res, null, 'Logged out successfully');
});

module.exports = { signup, verifyOtpHandler, resendOtp, login, forgotPassword, resetPassword, changePassword, logout };
