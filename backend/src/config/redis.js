'use strict';

const Redis = require('ioredis');
const { env } = require('./env');

const redis = new Redis(env.REDIS_URL, {
  // Retry up to 10 times with exponential backoff capped at 5 seconds.
  retryStrategy: (times) => Math.min(times * 200, 5000),
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on('connect', () => console.log('[redis] connected to', env.REDIS_URL));
redis.on('error',   (err) => console.error('[redis] error:', err.message));
redis.on('close',   () => console.warn('[redis] connection closed — will retry'));

/**
 * Ping Redis on startup. The ioredis client will reconnect automatically
 * if Redis is briefly unavailable, but we want an immediate startup signal.
 */
const verifyConnection = async () => {
  try {
    const pong = await redis.ping();
    if (pong !== 'PONG') throw new Error(`unexpected ping response: ${pong}`);
    console.log('[redis] ping OK');
  } catch (err) {
    // Not fatal — ioredis will retry. Just warn loudly.
    console.warn('[redis] startup ping failed (will retry):', err.message);
  }
};

module.exports = { redis, verifyConnection };
