'use strict';

const { getDb }  = require('../config/mongo');
const { redis }  = require('../config/redis');
const { logger } = require('../utils/logger');

/**
 * Insert a notification document into Mongo and increment the Redis unread counter.
 * Always fire-and-forget — callers must .catch(() => {}) to keep this non-blocking.
 *
 * @param {number} userId  Recipient user_id (Postgres integer)
 * @param {string} type    Notification type string (e.g. 'new_offer', 'offer_accepted')
 * @param {object} payload Extra context attached to the notification
 */
const notify = async (userId, type, payload = {}) => {
  try {
    const db = getDb();
    await db.collection('notifications').insertOne({
      user_id:   userId,
      type,
      payload,
      read_at:    null,
      created_at: new Date(),
    });
    await redis.incr(`notif:unread:${userId}`);
  } catch (err) {
    logger.warn('[notify] failed', { userId, type, error: err.message });
  }
};

module.exports = { notify };
