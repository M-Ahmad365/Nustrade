'use strict';

const { ZodError } = require('zod');

/**
 * Middleware factory: validate req[source] against a Zod schema.
 * Replaces req[source] with the parsed (coerced + stripped) value on success.
 * Passes a ZodError to next() on failure — errorHandler formats it as 400.
 *
 * @param {import('zod').ZodSchema} schema
 * @param {'body'|'query'|'params'} source
 */
const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[validate] FAILED on', req.method, req.path, JSON.stringify(result.error.errors));
    }
    return next(result.error);
  }
  if (source === 'body') {
    req[source] = result.data;
  } else {
    // Express 5 / Node 25+: req.query and req.params are getter-only on the prototype.
    // Shadow the getter with a writable own property so subsequent reads see coerced values.
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
  }
  next();
};

module.exports = { validate };
