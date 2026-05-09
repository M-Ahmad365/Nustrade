'use strict';

const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { redis } = require('../config/redis');

/**
 * Factory — build a rate limiter backed by Redis.
 * @param {object} opts
 * @param {number}   opts.windowMs  — window size in ms
 * @param {number}   opts.max       — max requests per window
 * @param {function} [opts.keyFn]   — custom key generator; defaults to IP
 */
const makeRateLimit = ({ windowMs, max, keyFn }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyFn || ((req) => ipKeyGenerator(req.ip)),
    store: new RedisStore({
      // rate-limit-redis v4 requires sendCommand
      sendCommand: (...args) => redis.call(...args),
    }),
    handler: (req, res) =>
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests — please slow down',
        },
      }),
  });

/** 5 req/15 min in prod; 100 req/min in dev — for login / signup / OTP endpoints */
const authLimiter = process.env.NODE_ENV === 'development'
  ? makeRateLimit({ windowMs: 60 * 1000, max: 100 })
  : makeRateLimit({ windowMs: 15 * 60 * 1000, max: 5 });

/** 60 requests per minute per authenticated user — for general POST endpoints */
const postLimiter = makeRateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyFn: (req) => `user:${req.user?.user_id ?? ipKeyGenerator(req.ip)}`,
});

/** 30 messages per minute per user — for chat send endpoint */
const chatLimiter = makeRateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyFn: (req) => `chat:${req.user?.user_id ?? ipKeyGenerator(req.ip)}`,
});

module.exports = { makeRateLimit, authLimiter, postLimiter, chatLimiter };
