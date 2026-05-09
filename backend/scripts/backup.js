#!/usr/bin/env node
'use strict';

/**
 * Standalone backup script — run directly with Node or via npm script.
 * Usage:  node scripts/backup.js
 *
 * Writes to: backups/{ISO-timestamp}/
 *   postgres.dump  — pg_dump custom format (restore with pg_restore)
 *   mongo/         — mongodump output directory
 *
 * Requires pg_dump and mongodump on PATH.
 * Credentials are read from .env (same variables used by the server).
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path   = require('path');
const fs     = require('fs');
const { spawn } = require('child_process');

const {
  PG_HOST     = 'localhost',
  PG_PORT     = '5432',
  PG_DB,
  PG_USER,
  PG_PASSWORD = '',
  MONGO_URI,
} = process.env;

if (!PG_DB || !PG_USER) {
  console.error('[backup] FATAL — PG_DB and PG_USER must be set in .env');
  process.exit(1);
}
if (!MONGO_URI) {
  console.error('[backup] FATAL — MONGO_URI must be set in .env');
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const repoRoot  = path.join(__dirname, '..', '..');
const backupDir = path.join(repoRoot, 'backups', timestamp);
const pgDump    = path.join(backupDir, 'postgres.dump');
const mongoOut  = path.join(backupDir, 'mongo');

fs.mkdirSync(mongoOut, { recursive: true });
console.log(`[backup] writing to backups/${timestamp}/`);

// ── pg_dump ────────────────────────────────────────────────────────────────────
// Password via PGPASSWORD env var — never in argv (visible in ps output)
const runPgDump = () => new Promise((resolve, reject) => {
  console.log('[backup] running pg_dump …');
  const proc = spawn(
    'pg_dump',
    [
      '-h', PG_HOST,
      '-p', String(PG_PORT),
      '-U', PG_USER,
      '-d', PG_DB,
      '--format=custom',
      '-f', pgDump,
    ],
    { env: { ...process.env, PGPASSWORD: PG_PASSWORD } }
  );

  proc.stderr.on('data', (d) => process.stderr.write(d));
  proc.on('error', (err) => reject(new Error(`pg_dump not found: ${err.message}`)));
  proc.on('close', (code) => {
    if (code === 0) {
      const size = (fs.statSync(pgDump).size / 1024).toFixed(1);
      console.log(`[backup] pg_dump done — postgres.dump (${size} KB)`);
      resolve();
    } else {
      reject(new Error(`pg_dump exited with code ${code}`));
    }
  });
});

// ── mongodump ──────────────────────────────────────────────────────────────────
const runMongoDump = () => new Promise((resolve, reject) => {
  console.log('[backup] running mongodump …');
  const proc = spawn('mongodump', ['--uri', MONGO_URI, '--out', mongoOut]);

  proc.stderr.on('data', (d) => process.stderr.write(d));
  proc.on('error', (err) => reject(new Error(`mongodump not found: ${err.message}`)));
  proc.on('close', (code) => {
    if (code === 0) {
      console.log('[backup] mongodump done — mongo/');
      resolve();
    } else {
      reject(new Error(`mongodump exited with code ${code}`));
    }
  });
});

(async () => {
  try {
    await runPgDump();
    await runMongoDump();
    console.log(`[backup] complete — backups/${timestamp}/`);
  } catch (err) {
    console.error('[backup] FAILED:', err.message);
    process.exit(1);
  }
})();
