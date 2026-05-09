'use strict';

const { z } = require('zod');
const { DEPARTMENTS, HOSTELS } = require('./users');

const CONDITIONS     = ['new', 'like_new', 'good', 'fair', 'poor'];
const SORT_OPTIONS   = ['recommended', 'newest', 'price_asc', 'price_desc', 'most_viewed'];
const REPORT_REASONS = ['spam', 'scam', 'inappropriate', 'miscategorized', 'other'];

// Coerce "true"/"false" strings → boolean (multipart form fields come as strings)
const boolFromStr = z.preprocess(
  (v) => (v === 'true' ? true : v === 'false' ? false : v),
  z.boolean()
);

// Accept tags as a JSON string, comma-separated string, or array
const tagsField = z.preprocess(
  (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string' && v) {
      try { return JSON.parse(v); } catch { return v.split(',').map((s) => s.trim()).filter(Boolean); }
    }
    return v ?? [];
  },
  z.array(z.string().min(1).max(30)).max(10)
);

// POST /listings — multipart form-data; numeric/boolean fields arrive as strings
const createListingSchema = z
  .object({
    title:           z.string().min(5, 'Title must be at least 5 characters').max(100),
    description:     z.string().min(20, 'Description must be at least 20 characters').max(2000),
    category_slug:   z.string().min(1),
    condition:       z.enum(CONDITIONS),
    price:           z.coerce.number().int().min(0).max(10000000),
    is_negotiable:   boolFromStr.optional().default(true),
    location_hostel: z.string().nullable().optional(),
    is_off_campus:   boolFromStr.optional().default(false),
    course_code:     z.string().max(20).nullable().optional(),
    tags:            tagsField.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hostel    = data.location_hostel;
    const offCampus = data.is_off_campus;
    if (!hostel && !offCampus) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['location_hostel'], message: 'Provide location_hostel or set is_off_campus=true' });
    }
    if (hostel && offCampus) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['location_hostel'], message: 'Cannot set both location_hostel and is_off_campus=true' });
    }
    if (hostel && !HOSTELS.includes(hostel)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['location_hostel'], message: `Invalid hostel. Valid: ${HOSTELS.join(', ')}` });
    }
  });

// PATCH /listings/:id — JSON body; all fields optional; category/images not editable here
const updateListingSchema = z
  .object({
    title:           z.string().min(5).max(100).optional(),
    description:     z.string().min(20).max(2000).optional(),
    price:           z.number().int().min(0).max(10000000).optional(),
    is_negotiable:   z.boolean().optional(),
    condition:       z.enum(CONDITIONS).optional(),
    location_hostel: z.string().nullable().optional(),
    is_off_campus:   z.boolean().optional(),
    course_code:     z.string().max(20).nullable().optional(),
    tags:            z.array(z.string().min(1).max(30)).max(10).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.location_hostel && data.is_off_campus) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['location_hostel'], message: 'Cannot set both location_hostel and is_off_campus=true' });
    }
    if (data.location_hostel && !HOSTELS.includes(data.location_hostel)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['location_hostel'], message: `Invalid hostel. Valid: ${HOSTELS.join(', ')}` });
    }
  });

// GET /listings query params — no strict() to tolerate cache-busting params
const listingsQuerySchema = z.object({
  category:      z.string().optional(),
  min_price:     z.coerce.number().int().min(0).optional(),
  max_price:     z.coerce.number().int().min(0).optional(),
  condition:     z.enum(CONDITIONS).optional(),
  hostel:        z.string().optional(),
  department:    z.enum(DEPARTMENTS).optional(),
  course_code:   z.string().max(20).optional(),
  is_off_campus: z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean()).optional(),
  sort:          z.enum(SORT_OPTIONS).default('recommended').optional(),
  page:          z.coerce.number().int().min(1).default(1).optional(),
  limit:         z.coerce.number().int().min(1).max(50).default(20).optional(),
});

// GET /listings/search query params
const searchQuerySchema = z.object({
  q:           z.string().min(1, 'Query cannot be empty').max(200),
  category:    z.string().optional(),
  min_price:   z.coerce.number().int().min(0).optional(),
  max_price:   z.coerce.number().int().min(0).optional(),
  condition:   z.enum(CONDITIONS).optional(),
  sort:        z.enum(['relevance', ...SORT_OPTIONS]).default('relevance').optional(),
  page:        z.coerce.number().int().min(1).default(1).optional(),
  limit:       z.coerce.number().int().min(1).max(50).default(20).optional(),
});

// POST /listings/:id/report
const reportSchema = z
  .object({
    reason:  z.enum(REPORT_REASONS),
    details: z.string().max(1000).optional(),
  })
  .strict();

module.exports = {
  createListingSchema,
  updateListingSchema,
  listingsQuerySchema,
  searchQuerySchema,
  reportSchema,
  CONDITIONS,
};
