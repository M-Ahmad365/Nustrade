'use strict';

const { z } = require('zod');

const createOfferSchema = z.object({
  listing_id:     z.coerce.number().int().positive(),
  proposed_price: z.coerce.number().int().min(0).max(10000000),
  message:        z.string().max(500).optional(),
}).strict();

const counterOfferSchema = z.object({
  proposed_price: z.coerce.number().int().min(0).max(10000000),
  message:        z.string().max(500).optional(),
}).strict();

// Used by POST /transactions/:id/cancel
const cancelTransactionSchema = z.object({
  reason: z.string().max(500).optional(),
}).strict();

module.exports = { createOfferSchema, counterOfferSchema, cancelTransactionSchema };
