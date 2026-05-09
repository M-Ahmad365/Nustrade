-- 015_fix_email_constraint.sql
-- Expand email CHECK to allow all NUST school/college subdomains, not just nust.edu.pk.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_check;

ALTER TABLE users ADD CONSTRAINT users_email_check
  CHECK (email ~* '^[a-zA-Z0-9._%+-]+@(nust\.edu\.pk|seecs\.nust\.edu\.pk|s3h\.nust\.edu\.pk|smme\.nust\.edu\.pk|scee\.nust\.edu\.pk|scme\.nust\.edu\.pk|sns\.nust\.edu\.pk|asab\.nust\.edu\.pk|iese\.nust\.edu\.pk|nice\.nust\.edu\.pk|nit\.nust\.edu\.pk|mcs\.nust\.edu\.pk|eme\.nust\.edu\.pk|nbs\.nust\.edu\.pk|seecs\.edu\.pk|nice\.edu\.pk|pnec\.edu\.pk)$');
