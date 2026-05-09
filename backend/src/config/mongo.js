'use strict';

const { MongoClient } = require('mongodb');
const { env } = require('./env');

let db = null;

const client = new MongoClient(env.MONGO_URI, {
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS:         5000,
});

/** Return the database handle. Throws if connect() was never called. */
const getDb = () => {
  if (!db) throw new Error('[mongo] database not initialized — call connect() first');
  return db;
};

/**
 * Create all collection indexes defined in SPECS.md section 4.3.
 * Called once after connect(). Creating an existing index is a no-op.
 */
const createIndexes = async (database) => {
  // chat_threads
  await database.collection('chat_threads').createIndexes([
    { key: { thread_id: 1 },        name: 'thread_id_unique', unique: true },
    { key: { buyer_id: 1 },         name: 'buyer_id' },
    { key: { seller_id: 1 },        name: 'seller_id' },
    { key: { last_message_at: -1 }, name: 'last_message_at_desc' },
  ]);

  // chat_messages — compound index on thread + time supports polling queries
  await database.collection('chat_messages').createIndexes([
    { key: { thread_id: 1, created_at: 1 }, name: 'thread_created_compound' },
    { key: { recipient_id: 1, read_by_recipient_at: 1 }, name: 'unread_messages' },
  ]);

  // notifications — sorted reads per user, and filtering on unread
  await database.collection('notifications').createIndexes([
    { key: { user_id: 1, created_at: -1 }, name: 'user_notifications' },
    { key: { user_id: 1, read_at: 1 },     name: 'user_unread_notifs' },
  ]);

  // listing_views — TTL of 90 days (7776000 seconds)
  await database.collection('listing_views').createIndexes([
    { key: { listing_id: 1, viewed_at: -1 }, name: 'listing_views_compound' },
    { key: { viewer_id: 1, viewed_at: -1 },  name: 'viewer_views' },
    { key: { viewed_at: 1 }, name: 'ttl_90d', expireAfterSeconds: 7776000 },
  ]);

  // activity_log — TTL of 180 days (15552000 seconds)
  await database.collection('activity_log').createIndexes([
    { key: { user_id: 1, created_at: -1 }, name: 'user_activity' },
    { key: { action: 1, created_at: -1 },  name: 'action_activity' },
    { key: { created_at: 1 }, name: 'ttl_180d', expireAfterSeconds: 15552000 },
  ]);

  console.log('[mongo] all collection indexes created/verified');
};

/**
 * Connect to MongoDB, create indexes, expose the db handle.
 * Exits the process if connection fails so the operator sees it immediately.
 */
const connect = async () => {
  try {
    await client.connect();
    const dbName = new URL(env.MONGO_URI).pathname.replace('/', '');
    db = client.db(dbName);
    await createIndexes(db);
    console.log(`[mongo] connected — db: ${dbName}`);
  } catch (err) {
    console.error('[mongo] FATAL — cannot connect:', err.message);
    process.exit(1);
  }
};

/** Graceful shutdown — call during SIGTERM handling. */
const disconnect = async () => {
  await client.close();
  console.log('[mongo] disconnected');
};

module.exports = { connect, getDb, disconnect };
