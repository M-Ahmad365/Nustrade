'use strict';

const { z } = require('zod');

const PHONE_RE    = /^(\+92|0)\d{10}$/;
const DEPARTMENTS = ['SEECS','NBS','S3H','SMME','SCEE','SCME','SNS','ASAB','IESE','NICE','NIT','MCS','EME','OTHER'];
const HOSTELS     = [
  'Ghazali','Razi','Rahmat','Attar','Liaquat',
  'Hajveri','Zakria','Johar','Berouni','Rumi',
  'Fatima','Amna','Khadija',
];

/**
 * PATCH /api/v1/users/me — all fields optional.
 * Zod only validates fields that are present; cross-field hostel consistency
 * for partial updates (e.g. only residence_type sent) is handled in the controller
 * after merging with the current DB state.
 */
const updateProfileSchema = z
  .object({
    full_name:      z.string().min(3, 'Full name must be at least 3 characters').max(100).optional(),
    department:     z.enum(DEPARTMENTS).optional(),
    semester:       z.number().int().min(1).max(8).optional(),
    residence_type: z.enum(['hostellite', 'day_scholar']).optional(),
    hostel_name:    z.string().nullable().optional(),
    phone_number:   z.string().regex(PHONE_RE, 'Must be a valid Pakistani phone number (+92 or 0 followed by 10 digits)').nullable().optional(),
    bio:            z.string().max(300, 'Bio must be at most 300 characters').nullable().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    // Only validate hostel consistency when BOTH fields are in the same request
    if (data.residence_type === 'hostellite' && data.hostel_name !== undefined && !data.hostel_name) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hostel_name'], message: 'hostel_name is required for hostellites' });
    }
    if (data.residence_type === 'day_scholar' && data.hostel_name) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hostel_name'], message: 'hostel_name must not be provided for day scholars' });
    }
    if (data.hostel_name && !HOSTELS.includes(data.hostel_name)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hostel_name'], message: `Invalid hostel. Valid options: ${HOSTELS.join(', ')}` });
    }
  });

module.exports = { updateProfileSchema, DEPARTMENTS, HOSTELS };
