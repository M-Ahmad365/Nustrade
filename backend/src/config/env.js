'use strict';

/**
 * Central env config. Fail fast if required variables are missing so
 * the operator sees the problem at startup, not buried in a request log.
 */
const required = [
  'PG_HOST', 'PG_PORT', 'PG_DB', 'PG_USER',
  'MONGO_URI',
  'REDIS_URL',
  'JWT_SECRET',
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`[env] FATAL — missing required env var: ${key}`);
    process.exit(1);
  }
}

const env = {
  NODE_ENV:        process.env.NODE_ENV || 'development',
  PORT:            parseInt(process.env.PORT || '4000', 10),

  PG_HOST:         process.env.PG_HOST,
  PG_PORT:         parseInt(process.env.PG_PORT, 10),
  PG_DB:           process.env.PG_DB,
  PG_USER:         process.env.PG_USER,
  PG_PASSWORD:     process.env.PG_PASSWORD || '',

  MONGO_URI:       process.env.MONGO_URI,

  REDIS_URL:       process.env.REDIS_URL,

  JWT_SECRET:      process.env.JWT_SECRET,
  JWT_EXPIRY:      process.env.JWT_EXPIRY || '7d',

  BCRYPT_ROUNDS:   parseInt(process.env.BCRYPT_ROUNDS || '12', 10),

  SMTP_HOST:       process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT:       parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER:       process.env.SMTP_USER || '',
  SMTP_PASSWORD:   process.env.SMTP_PASSWORD || '',
  SMTP_FROM:       process.env.SMTP_FROM || 'NusTrade <no-reply@example.com>',

  UPLOAD_DIR:      process.env.UPLOAD_DIR || './uploads',
  MAX_UPLOAD_SIZE: parseInt(process.env.MAX_UPLOAD_SIZE || '5242880', 10),

  CORS_ORIGIN:     process.env.CORS_ORIGIN || 'http://localhost:5500,http://localhost:5501,http://127.0.0.1:5500,http://127.0.0.1:5501',
};

module.exports = { env };
