'use strict';

const { Router } = require('express');
const { authLimiter } = require('../middleware/rateLimit');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  signupSchema,
  loginSchema,
  otpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} = require('../validators/auth');
const ctrl = require('../controllers/auth');

const router = Router();

// authLimiter: 5 requests per 15 minutes per IP — all auth endpoints are sensitive
router.use(authLimiter);

router.post('/signup',           validate(signupSchema),          ctrl.signup);
router.post('/verify-otp',       validate(otpSchema),             ctrl.verifyOtpHandler);
router.post('/resend-otp',       validate(forgotPasswordSchema),  ctrl.resendOtp);
router.post('/login',            validate(loginSchema),           ctrl.login);
router.post('/forgot-password',  validate(forgotPasswordSchema),  ctrl.forgotPassword);
router.post('/reset-password',   validate(resetPasswordSchema),   ctrl.resetPassword);
router.post('/change-password',  authenticate, validate(changePasswordSchema), ctrl.changePassword);
router.post('/logout',           authenticate,                    ctrl.logout);

module.exports = { router };
