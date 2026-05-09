'use strict';

require('dotenv').config();

const { app }                  = require('./src/app');
const { connect: mongoConnect } = require('./src/config/mongo');
const { verifyConnection: redisVerify } = require('./src/config/redis');
const { refresh: refreshTrending, startCron: startTrendingCron } = require('./src/services/trending');
const { expireListings }       = require('./src/db/queries/listings');
const { expireOffers }         = require('./src/db/queries/offers');
const { notify }               = require('./src/services/notify');
const { logger }               = require('./src/utils/logger');

const PORT = process.env.PORT || 4000;

// Hourly cron: expire pending offers whose 48-hour window has passed
const startOfferExpiryJob = () => {
  setInterval(async () => {
    try {
      const expired = await expireOffers();
      if (expired.length > 0) {
        logger.info(`[cron:offer-expiry] expired ${expired.length} offers`, { ids: expired.map((r) => r.offer_id) });
      }
    } catch (err) {
      logger.error('[cron:offer-expiry] failed', { error: err.message });
    }
  }, 60 * 60 * 1000);
  logger.info('[cron:offer-expiry] started — runs every hour');
};

// Hourly cron: expire active listings past their expires_at timestamp
const startExpiryJob = () => {
  setInterval(async () => {
    try {
      const expired = await expireListings();
      if (expired.length > 0) {
        logger.info(`[cron:expiry] expired ${expired.length} listings`, { ids: expired.map((r) => r.listing_id) });
        for (const row of expired) {
          notify(row.seller_id, 'listing_expired', { listing_id: row.listing_id }).catch(() => {});
        }
      }
    } catch (err) {
      logger.error('[cron:expiry] failed', { error: err.message });
    }
  }, 60 * 60 * 1000);
  logger.info('[cron:expiry] started — runs every hour');
};

(async () => {
  // Connect to databases before starting the server or cron jobs
  await mongoConnect();
  await redisVerify();

  // Seed trending cache immediately, then keep it warm every 15 min
  refreshTrending().catch((err) => logger.warn('[trending] initial refresh skipped', { error: err.message }));
  startTrendingCron();
  startExpiryJob();
  startOfferExpiryJob();

  app.listen(PORT, () => {
    logger.info(`NUST Markaz backend running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });
})();
