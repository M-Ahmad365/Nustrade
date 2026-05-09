'use strict';

const { z } = require('zod');

const NUST_EMAIL_RE = /^[a-zA-Z0-9._%+-]+@(nust\.edu\.pk|seecs\.nust\.edu\.pk|s3h\.nust\.edu\.pk|smme\.nust\.edu\.pk|scee\.nust\.edu\.pk|scme\.nust\.edu\.pk|sns\.nust\.edu\.pk|asab\.nust\.edu\.pk|iese\.nust\.edu\.pk|nice\.nust\.edu\.pk|nit\.nust\.edu\.pk|mcs\.nust\.edu\.pk|eme\.nust\.edu\.pk|nbs\.nust\.edu\.pk|seecs\.edu\.pk|nice\.edu\.pk|pnec\.edu\.pk)$/i;
// Min 8 chars, at least 1 uppercase letter, at least 1 digit
const PASSWORD_RE   = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
// Pakistani phone: +92XXXXXXXXXX or 0XXXXXXXXXX (10 digits after prefix)
const PHONE_RE      = /^(\+92|0)\d{10}$/;

const DEPARTMENTS = ['SEECS','NBS','S3H','SMME','SCEE','SCME','SNS','ASAB','IESE','NICE','NIT','MCS','EME','OTHER'];

const HOSTELS = [
  'Ghazali','Razi','Rahmat','Attar','Liaquat',
  'Hajveri','Zakria','Johar','Berouni','Rumi',
  'Fatima','Amna','Khadija',
];

const signupSchema = z
  .object({
    email:          z.string().email().regex(NUST_EMAIL_RE, 'Must be a valid NUST email address'),
    password:       z.string().regex(PASSWORD_RE, 'Password must be at least 8 characters with at least 1 uppercase letter and 1 digit'),
    full_name:      z.string().min(3, 'Full name must be at least 3 characters').max(100),
    department:     z.enum(DEPARTMENTS),
    semester:       z.number().int().min(1).max(8),
    residence_type: z.enum(['hostellite', 'day_scholar']),
    hostel_name:    z.string().optional(),
    phone_number:   z.string().regex(PHONE_RE, 'Must be a valid Pakistani phone number (+92 or 0 followed by 10 digits)').optional().nullable(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.residence_type === 'hostellite' && !data.hostel_name) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hostel_name'], message: 'hostel_name is required for hostellites' });
    }
    if (data.residence_type === 'day_scholar' && data.hostel_name) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hostel_name'], message: 'hostel_name must not be provided for day scholars' });
    }
    if (data.hostel_name && !HOSTELS.includes(data.hostel_name)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hostel_name'], message: `Invalid hostel. Valid options: ${HOSTELS.join(', ')}` });
    }
  });

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1, 'Password is required'),
}).strict();

const otpSchema = z.object({
  email: z.string().email(),
  otp:   z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
}).strict();

// Used by both /forgot-password and /resend-otp — both only need email
const forgotPasswordSchema = z.object({
  email: z.string().email(),
}).strict();

const resetPasswordSchema = z.object({
  email:        z.string().email(),
  otp:          z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
  new_password: z.string().regex(PASSWORD_RE, 'Password must be at least 8 characters with at least 1 uppercase letter and 1 digit'),
}).strict();

const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password:     z.string().regex(PASSWORD_RE, 'Password must be at least 8 characters with at least 1 uppercase letter and 1 digit'),
}).strict();

module.exports = {
  signupSchema,
  loginSchema,
  otpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
};
