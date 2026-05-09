'use strict';

const { getDb }  = require('../config/mongo');
const { redis }  = require('../config/redis');
const { logger } = require('../utils/logger');

const TRENDING_KEY  = 'trending:24h';
const TTL_SECONDS   = 15 * 60; // 15 min cache

/*
 * Aggregate listing_views in MongoDB for the last 24 hours, rank by view count,
 * and write the top 10 listing IDs into Redis sorted set `trending:24h`.
 * Called on startup and every 15 minutes by startCron().
 */
const refresh = async () => {
  const db    = getDb();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const top = await db.collection('listing_views').aggregate([
    { $match: { viewed_at: { $gte: since } } },
    { $group: { _id: '$listing_id', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]).toArray();

  if (top.length === 0) {
    logger.info('[trending] no views in last 24h — skipping Redis update');
    return;
  }

  // Atomic: clear old set, add new scores, set TTL
  const pipeline = redis.pipeline();
  pipeline.del(TRENDING_KEY);
  for (const { _id: listingId, count } of top) {
    pipeline.zadd(TRENDING_KEY, count, String(listingId));
  }
  pipeline.expire(TRENDING_KEY, TTL_SECONDS);
  await pipeline.exec();

  logger.info(`[trending] refreshed — ${top.length} listings cached`);
};

const startCron = () => {
  setInterval(() => {
    refresh().catch((err) => logger.error('[trending] cron refresh failed', { error: err.message }));
  }, TTL_SECONDS * 1000);
  logger.info('[trending] cron started — refresh every 15 min');
};

module.exports = { refresh, startCron };
