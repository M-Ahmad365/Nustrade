'use strict';

const { z } = require('zod');

const startChatSchema = z.object({
  listing_id: z.coerce.number().int().positive(),
  seller_id:  z.coerce.number().int().positive(),
}).strict();

const sendMessageSchema = z.object({
  content:   z.string().min(1).max(2000).optional(),
  image_url: z.string().url().optional(),
}).strict().refine(
  (data) => data.content !== undefined || data.image_url !== undefined,
  { message: 'At least one of content or image_url is required' }
);

module.exports = { startChatSchema, sendMessageSchema };
