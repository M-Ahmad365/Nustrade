'use strict';

const { getDb } = require('../config/mongo');
const { redis } = require('../config/redis');

/**
 * Deterministic thread ID: smaller user ID first, then larger, then listing.
 * Guarantees the same two users always produce the same key regardless of who calls first.
 */
const makeThreadId = (buyerId, sellerId, listingId) =>
  `${Math.min(buyerId, sellerId)}_${Math.max(buyerId, sellerId)}_${listingId}`;

/**
 * Fetch or create a chat thread for a (buyer, seller, listing) triple.
 * Thread ID is deterministic so concurrent calls are idempotent.
 */
const getOrCreateThread = async (buyerId, sellerId, listingId) => {
  const db = getDb();
  const threadId = makeThreadId(buyerId, sellerId, listingId);

  const existing = await db.collection('chat_threads').findOne({ thread_id: threadId });
  if (existing) return existing;

  const now = new Date();
  const doc = {
    thread_id:            threadId,
    buyer_id:             buyerId,
    seller_id:            sellerId,
    listing_id:           listingId,
    last_message_at:      null,
    last_message_preview: null,
    created_at:           now,
    updated_at:           now,
  };

  // upsert — race-safe: if two requests race, one gets the existing doc
  await db.collection('chat_threads').updateOne(
    { thread_id: threadId },
    { $setOnInsert: doc },
    { upsert: true }
  );

  return db.collection('chat_threads').findOne({ thread_id: threadId });
};

/** Return a single thread if userId is buyer or seller; null otherwise. */
const getThreadById = async (threadId, userId) => {
  const db = getDb();
  const thread = await db.collection('chat_threads').findOne({ thread_id: threadId });
  if (!thread) return null;
  if (thread.buyer_id !== userId && thread.seller_id !== userId) return null;
  return thread;
};

/** All threads where userId is buyer or seller, sorted by most recent message. */
const getThreadsByUser = async (userId) => {
  const db = getDb();
  return db.collection('chat_threads')
    .find({ $or: [{ buyer_id: userId }, { seller_id: userId }] })
    .sort({ last_message_at: -1 })
    .toArray();
};

/**
 * Insert a message and update the thread's last_message_* fields.
 * Increments Redis unread counters for the recipient.
 */
const sendMessage = async (threadId, senderId, recipientId, listingId, content, imageUrl = null) => {
  const db = getDb();
  const now = new Date();

  const message = {
    thread_id:           threadId,
    sender_id:           senderId,
    recipient_id:        recipientId,
    listing_id:          listingId,
    content:             content ?? null,
    image_url:           imageUrl,
    read_by_recipient_at: null,
    created_at:          now,
  };

  await db.collection('chat_messages').insertOne(message);

  const preview = content
    ? (content.length > 60 ? content.slice(0, 60) + '…' : content)
    : '📷 Image';

  await db.collection('chat_threads').updateOne(
    { thread_id: threadId },
    { $set: { last_message_at: now, last_message_preview: preview, updated_at: now } }
  );

  // Increment Redis unread counters for recipient; 30-day TTL keeps them alive
  await redis.incr(`chat:unread:${recipientId}:${threadId}`);
  await redis.expire(`chat:unread:${recipientId}:${threadId}`, 30 * 24 * 60 * 60);
  await redis.incr(`chat:unread_total:${recipientId}`);
  await redis.expire(`chat:unread_total:${recipientId}`, 30 * 24 * 60 * 60);

  return message;
};

/**
 * Fetch messages in a thread after an optional ISO timestamp.
 * Used by the polling endpoint — returns only new messages since last poll.
 */
const getMessages = async (threadId, since = null) => {
  const db = getDb();
  const filter = { thread_id: threadId };
  if (since) filter.created_at = { $gt: new Date(since) };
  return db.collection('chat_messages')
    .find(filter)
    .sort({ created_at: 1 })
    .toArray();
};

/**
 * Mark all unread messages (sent to userId) in a thread as read.
 * Resets Redis unread counters for this thread and decrements total.
 */
const markRead = async (threadId, userId) => {
  const db = getDb();
  const now = new Date();

  // Count unread before clearing so we can decrement total accurately
  const unreadCount = await db.collection('chat_messages').countDocuments({
    thread_id:           threadId,
    recipient_id:        userId,
    read_by_recipient_at: null,
  });

  if (unreadCount > 0) {
    await db.collection('chat_messages').updateMany(
      { thread_id: threadId, recipient_id: userId, read_by_recipient_at: null },
      { $set: { read_by_recipient_at: now } }
    );

    // Clear per-thread counter; decrement total by exact unread count
    await redis.set(`chat:unread:${userId}:${threadId}`, 0);
    await redis.decrby(`chat:unread_total:${userId}`, unreadCount);
  }

  return unreadCount;
};

module.exports = { makeThreadId, getOrCreateThread, getThreadById, getThreadsByUser, sendMessage, getMessages, markRead };
