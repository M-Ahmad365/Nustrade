-- 001_create_enums.sql
-- All custom ENUM types used across the schema.
-- Created before any table so tables can reference them without ordering issues.

CREATE TYPE department_enum AS ENUM (
  'SEECS', 'NBS', 'S3H', 'SMME', 'SCEE', 'SCME',
  'SNS', 'ASAB', 'IESE', 'NICE', 'NIT', 'MCS', 'EME', 'OTHER'
);

CREATE TYPE residence_enum AS ENUM ('hostellite', 'day_scholar');

CREATE TYPE role_enum AS ENUM ('student', 'admin');

CREATE TYPE condition_enum AS ENUM ('new', 'like_new', 'good', 'fair', 'poor');

CREATE TYPE listing_status_enum AS ENUM (
  'active', 'reserved', 'sold', 'expired', 'deleted_by_user', 'removed_by_admin'
);

CREATE TYPE offer_status_enum AS ENUM (
  'pending', 'accepted', 'rejected', 'expired', 'cancelled', 'countered'
);

CREATE TYPE transaction_status_enum AS ENUM (
  'pending_completion', 'completed',
  'cancelled_by_buyer', 'cancelled_by_seller', 'disputed'
);

CREATE TYPE report_reason_enum AS ENUM (
  'spam', 'scam', 'inappropriate', 'miscategorized', 'other'
);
