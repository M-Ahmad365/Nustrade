'use strict';

const { Pool } = require('pg');
const { env } = require('./env');

// Railway injects DATABASE_URL; fall back to individual vars for local dev.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString:        process.env.DATABASE_URL,
      ssl:                     { rejectUnauthorized: false },
      max:                     20,
      idleTimeoutMillis:       30000,
      connectionTimeoutMillis: 5000,
    })
  : new Pool({
      host:                    env.PG_HOST,
      port:                    env.PG_PORT,
      database:                env.PG_DB,
      user:                    env.PG_USER,
      password:                env.PG_PASSWORD,
      max:                     20,
      idleTimeoutMillis:       30000,
      connectionTimeoutMillis: 5000,
    });

pool.on('error', (err) => {
  console.error('[postgres] unexpected pool error:', err.message);
});

/**
 * Run a parameterized query against the shared pool.
 * @param {string} text   SQL with $1, $2 ... placeholders
 * @param {any[]}  params parameter values
 */
const query = (text, params) => pool.query(text, params);

/**
 * Acquire a dedicated client for multi-statement transactions.
 * Caller MUST release the client in a finally block.
 */
const getClient = () => pool.connect();

/**
 * Verify connectivity on startup. Exits process on failure so the
 * operator sees the problem immediately rather than in silent errors later.
 */
const verifyConnection = async () => {
  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    console.log(`[postgres] connected — db: ${env.PG_DB}, host: ${env.PG_HOST}`);
  } catch (err) {
    console.error('[postgres] FATAL — cannot connect:', err.message);
    process.exit(1);
  } finally {
    if (client) client.release();
  }
};

module.exports = { query, getClient, verifyConnection, pool };
