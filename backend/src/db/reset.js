'use strict';

require('dotenv').config();

const { Pool } = require('pg');

if (process.env.NODE_ENV === 'production') {
  console.error('[reset] REFUSED — reset is disabled in production');
  process.exit(1);
}

const dbName = process.env.PG_DB;

// Connect to the default 'postgres' database so we can drop/create our target db
const pool = new Pool({
  host:     process.env.PG_HOST,
  port:     parseInt(process.env.PG_PORT || '5432', 10),
  database: 'postgres',
  user:     process.env.PG_USER,
  password: process.env.PG_PASSWORD || '',
});

const run = async () => {
  const client = await pool.connect();
  try {
    // Terminate all existing connections to the target DB before dropping it
    await client.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = $1 AND pid <> pg_backend_pid()
    `, [dbName]);

    await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    console.log(`[reset] dropped database: ${dbName}`);

    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log(`[reset] created database: ${dbName}`);

    console.log('[reset] done — run "npm run db:migrate" to rebuild schema');
  } finally {
    client.release();
    await pool.end();
  }
};

run().catch((err) => {
  console.error('[reset] error:', err.message);
  process.exit(1);
});
