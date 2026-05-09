'use strict';

require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Direct pool — not through our app's pool — so migrate.js runs standalone
const pool = new Pool({
  host:     process.env.PG_HOST,
  port:     parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DB,
  user:     process.env.PG_USER,
  password: process.env.PG_PASSWORD || '',
});

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const ensureMigrationsTable = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      run_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
};

const getAppliedMigrations = async (client) => {
  const { rows } = await client.query('SELECT version FROM schema_migrations ORDER BY version');
  return new Set(rows.map((r) => r.version));
};

const run = async () => {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort(); // lexicographic sort keeps 001, 002 ... order

    let ranCount = 0;

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[migrate] skip  ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

      // Each migration runs in its own transaction so a failure rolls back
      // only that file, and the schema_migrations record is only written on success.
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`[migrate] applied ${file}`);
        ranCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[migrate] FAILED  ${file}:`, err.message);
        process.exit(1);
      }
    }

    if (ranCount === 0) {
      console.log('[migrate] database is up to date — no new migrations');
    } else {
      console.log(`[migrate] done — ${ranCount} migration(s) applied`);
    }
  } finally {
    client.release();
    await pool.end();
  }
};

run().catch((err) => {
  console.error('[migrate] unexpected error:', err.message || err.code || String(err));
  process.exit(1);
});
