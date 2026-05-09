'use strict';

const { z } = require('zod');

const createSavedSearchSchema = z.object({
  name:         z.string().min(1).max(50),
  query_text:   z.string().max(200).optional(),
  filters_json: z.record(z.unknown()).optional(),
}).strict();

module.exports = { createSavedSearchSchema };
