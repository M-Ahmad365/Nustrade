'use strict';

const { ObjectId }               = require('mongodb');
const { getDb }                  = require('../config/mongo');
const { redis }                  = require('../config/redis');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { ok }                     = require('../utils/response');

/**
 * GET /api/v1/notifications — paginated list, newest first.
 * Accepts ?page=<n>&limit=<n> (default page 1, limit 20).
 */
const getNotifications = asyncHandler(async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip  = (page - 1) * limit;

  const db = getDb();
  const notifications = await db.collection('notifications')
    .find({ user_id: req.user.user_id })
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();

  return ok(res, { notifications, page, limit });
});

/**
 * GET /api/v1/notifications/unread-count — fast read from Redis counter.
 */
const getUnreadCount = asyncHandler(async (req, res) => {
  const raw   = await redis.get(`notif:unread:${req.user.user_id}`);
  const count = Math.max(0, parseInt(raw, 10) || 0);
  return ok(res, { unread_count: count });
});

/**
 * POST /api/v1/notifications/:id/read — mark a single notification as read.
 * Decrements Redis counter only if the notification was actually unread.
 */
const markOneRead = asyncHandler(async (req, res) => {
  let oid;
  try {
    oid = new ObjectId(req.params.id);
  } catch {
    throw new AppError(400, 'INVALID_ID', 'Invalid notification ID');
  }

  const db  = getDb();
  const now = new Date();

  const result = await db.collection('notifications').findOneAndUpdate(
    { _id: oid, user_id: req.user.user_id },
    { $set: { read_at: now } },
    { returnDocument: 'before' }
  );

  if (!result) throw new AppError(404, 'NOT_FOUND', 'Notification not found');

  // Decrement only if it was unread — prevents counter going negative on double-read
  if (result.read_at === null) {
    await redis.decr(`notif:unread:${req.user.user_id}`);
  }

  return ok(res, null, 'Notification marked as read');
});

/**
 * POST /api/v1/notifications/mark-all-read — mark every unread notification as read.
 * Resets the Redis counter to 0.
 */
const markAllRead = asyncHandler(async (req, res) => {
  const db  = getDb();
  const now = new Date();

  const result = await db.collection('notifications').updateMany(
    { user_id: req.user.user_id, read_at: null },
    { $set: { read_at: now } }
  );

  // Zero the counter regardless of modifiedCount — keeps Redis in sync even after restarts
  await redis.set(`notif:unread:${req.user.user_id}`, 0);

  return ok(res, { marked_read: result.modifiedCount });
});

module.exports = { getNotifications, getUnreadCount, markOneRead, markAllRead };
