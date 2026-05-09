'use strict';

const { ZodError } = require('zod');
const { logger } = require('../utils/logger');

/**
 * AppError — structured error with HTTP status, machine-readable code, and optional details.
 * Throw this anywhere in route/service code; the central handler below formats the response.
 */
class AppError extends Error {
  constructor(statusCode, code, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true; // distinguishes expected errors from bugs
  }
}

/**
 * Wrap an async route handler so it forwards thrown errors to Express error middleware.
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Central Express error handler. Must be mounted LAST in app.js.
 * Never sends raw stack traces or DB internals to the client.
 */
const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  // Zod validation error → 400 with field-level details
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Input validation failed',
        // Zod v4 uses .issues (v3 used .errors)
        details: (err.issues ?? err.errors ?? []).map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      },
    });
  }

  // Known operational error thrown by app code
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details && { details: err.details }),
      },
    });
  }

  // PostgreSQL unique violation → 409
  if (err.code === '23505') {
    return res.status(409).json({
      success: false,
      error: { code: 'DUPLICATE_RESOURCE', message: 'Resource already exists' },
    });
  }

  // PostgreSQL foreign key violation → 400
  if (err.code === '23503') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_REFERENCE', message: 'Referenced resource does not exist' },
    });
  }

  // JWT errors → 401
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' },
    });
  }

  // Unexpected error — log full context, return generic 500
  logger.error('Unhandled error', {
    method: req.method,
    path: req.path,
    userId: req.user?.user_id ?? null,
    error: err.message,
    stack: err.stack,
  });

  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
};

module.exports = { AppError, asyncHandler, errorHandler };
