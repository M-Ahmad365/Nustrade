'use strict';

const { z } = require('zod');

const createReviewSchema = z.object({
  transaction_id: z.coerce.number().int().positive(),
  reviewee_id:    z.coerce.number().int().positive(),
  rating:         z.coerce.number().int().min(1).max(5),
  comment:        z.string().max(500).optional(),
}).strict();

const updateReviewSchema = z.object({
  rating:  z.coerce.number().int().min(1).max(5).optional(),
  comment: z.string().max(500).optional(),
}).strict().refine(
  (d) => d.rating !== undefined || d.comment !== undefined,
  { message: 'Provide at least rating or comment' }
);

module.exports = { createReviewSchema, updateReviewSchema };
