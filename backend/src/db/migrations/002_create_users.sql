-- 002_create_users.sql
-- Users table, indexes, and the shared set_updated_at() trigger function.
-- set_updated_at() is defined here because every subsequent table uses it.

-- Shared trigger function — maintains updated_at on any table that has it
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE users (
  user_id              SERIAL PRIMARY KEY,
  email                VARCHAR(255) NOT NULL UNIQUE
                         CHECK (email ~* '^[a-zA-Z0-9._%+-]+@(nust\.edu\.pk|seecs\.nust\.edu\.pk|s3h\.nust\.edu\.pk|smme\.nust\.edu\.pk|scee\.nust\.edu\.pk|scme\.nust\.edu\.pk|sns\.nust\.edu\.pk|asab\.nust\.edu\.pk|iese\.nust\.edu\.pk|nice\.nust\.edu\.pk|nit\.nust\.edu\.pk|mcs\.nust\.edu\.pk|eme\.nust\.edu\.pk|nbs\.nust\.edu\.pk|seecs\.edu\.pk|nice\.edu\.pk|pnec\.edu\.pk)$'),
  password_hash        VARCHAR(255) NOT NULL,
  full_name            VARCHAR(100) NOT NULL CHECK (char_length(full_name) >= 3),
  department           department_enum NOT NULL,
  semester             SMALLINT NOT NULL CHECK (semester BETWEEN 1 AND 10),
  residence_type       residence_enum NOT NULL,
  hostel_name          VARCHAR(10),
  phone_number         VARCHAR(20),
  bio                  VARCHAR(300),
  profile_picture_url  VARCHAR(500),
  role                 role_enum NOT NULL DEFAULT 'student',
  email_verified       BOOLEAN NOT NULL DEFAULT FALSE,
  is_banned            BOOLEAN NOT NULL DEFAULT FALSE,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  aggregate_rating     NUMERIC(3,2) NOT NULL DEFAULT 0.00,
  total_reviews        INTEGER NOT NULL DEFAULT 0,
  total_sales          INTEGER NOT NULL DEFAULT 0,
  total_purchases      INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Hostellites must supply a hostel name; day scholars must not
  CONSTRAINT hostel_required CHECK (
    (residence_type = 'hostellite' AND hostel_name IS NOT NULL) OR
    (residence_type = 'day_scholar' AND hostel_name IS NULL)
  )
);

CREATE INDEX idx_users_email      ON users(email);
CREATE INDEX idx_users_department ON users(department);
-- Partial index — auth middleware only ever looks up active, non-banned users
CREATE INDEX idx_users_active     ON users(is_active, is_banned)
  WHERE is_active = TRUE AND is_banned = FALSE;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
