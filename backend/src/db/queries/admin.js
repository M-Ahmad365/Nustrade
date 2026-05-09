'use strict';

const { query } = require('../../config/postgres');

/**
 * List users with optional search text and boolean filters.
 * Uses the $1::text IS NULL pattern so all filters work in a single
 * parameterized query without dynamic string building.
 */
const getUsers = async ({ search = null, isBanned = null, isVerified = null, role = null, limit = 20, offset = 0 } = {}) => {
  const { rows } = await query(`
    SELECT
      user_id, email, full_name, department::text, semester,
      role::text, email_verified, is_banned, is_active,
      aggregate_rating, total_reviews, total_sales, total_purchases,
      created_at
    FROM users
    WHERE ($1::text    IS NULL OR full_name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%')
      AND ($2::boolean IS NULL OR is_banned = $2)
      AND ($3::boolean IS NULL OR email_verified = $3)
      AND ($4::text    IS NULL OR role::text = $4)
    ORDER BY created_at DESC
    LIMIT $5 OFFSET $6
  `, [search, isBanned, isVerified, role, limit, offset]);
  return rows;
};

const getUserCount = async ({ search = null, isBanned = null, isVerified = null, role = null } = {}) => {
  const { rows } = await query(`
    SELECT COUNT(*)::int AS total
    FROM users
    WHERE ($1::text    IS NULL OR full_name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%')
      AND ($2::boolean IS NULL OR is_banned = $2)
      AND ($3::boolean IS NULL OR email_verified = $3)
      AND ($4::text    IS NULL OR role::text = $4)
  `, [search, isBanned, isVerified, role]);
  return rows[0].total;
};

const banUser = async (userId) => {
  const { rows } = await query(
    `UPDATE users SET is_banned = TRUE, updated_at = NOW()
     WHERE user_id = $1 AND role != 'admin'
     RETURNING user_id, email, is_banned`,
    [userId]
  );
  return rows[0] ?? null;
};

const unbanUser = async (userId) => {
  const { rows } = await query(
    `UPDATE users SET is_banned = FALSE, updated_at = NOW()
     WHERE user_id = $1
     RETURNING user_id, email, is_banned`,
    [userId]
  );
  return rows[0] ?? null;
};

/**
 * List all listings (any status) with seller name and category, for admin view.
 */
const getAdminListings = async ({ search = null, status = null, limit = 20, offset = 0 } = {}) => {
  const { rows } = await query(`
    SELECT
      l.listing_id, l.title, l.price, l.status::text, l.condition::text,
      l.posted_at, l.expires_at, l.view_count,
      c.slug  AS category_slug,
      c.name  AS category_name,
      u.user_id AS seller_id,
      u.full_name AS seller_name,
      u.email     AS seller_email
    FROM listings l
    JOIN categories c ON c.category_id = l.category_id
    JOIN users      u ON u.user_id      = l.seller_id
    WHERE ($1::text IS NULL OR l.title ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%')
      AND ($2::text IS NULL OR l.status::text = $2)
    ORDER BY l.posted_at DESC
    LIMIT $3 OFFSET $4
  `, [search, status, limit, offset]);
  return rows;
};

/**
 * Force-remove a listing — admin-only soft delete.
 * Cannot remove a listing in 'sold' status as that would orphan the transaction.
 */
const forceRemoveListing = async (listingId) => {
  const { rows } = await query(`
    UPDATE listings
    SET status = 'removed_by_admin', updated_at = NOW()
    WHERE listing_id = $1 AND status != 'sold'
    RETURNING listing_id, title, status::text
  `, [listingId]);
  return rows[0] ?? null;
};

/** Paginated unresolved reports with reporter, listing, and reported-user info. */
const getUnresolvedReports = async ({ limit = 20, offset = 0 } = {}) => {
  const { rows } = await query(`
    SELECT
      r.report_id, r.reason::text, r.details, r.created_at,
      r.listing_id, r.reported_user_id,
      rptr.user_id    AS reporter_id,
      rptr.email      AS reporter_email,
      rptr.full_name  AS reporter_name,
      l.title         AS listing_title,
      rptd.email      AS reported_user_email,
      rptd.full_name  AS reported_user_name
    FROM reports r
    JOIN users rptr ON rptr.user_id = r.reporter_id
    LEFT JOIN listings l ON l.listing_id = r.listing_id
    LEFT JOIN users rptd ON rptd.user_id = r.reported_user_id
    WHERE r.resolved_at IS NULL
    ORDER BY r.created_at ASC
    LIMIT $1 OFFSET $2
  `, [limit, offset]);
  return rows;
};

const resolveReport = async (reportId, adminId, resolutionNotes) => {
  const { rows } = await query(`
    UPDATE reports
    SET resolved_by_admin_id = $2,
        resolved_at          = NOW(),
        resolution_notes     = $3
    WHERE report_id = $1 AND resolved_at IS NULL
    RETURNING *
  `, [reportId, adminId, resolutionNotes]);
  return rows[0] ?? null;
};

/** Return all active, non-banned user IDs for broadcast announcement. */
const getActiveUserIds = async () => {
  const { rows } = await query(
    'SELECT user_id FROM users WHERE is_active = TRUE AND is_banned = FALSE'
  );
  return rows.map((r) => r.user_id);
};

module.exports = {
  getUsers,
  getUserCount,
  banUser,
  unbanUser,
  getAdminListings,
  forceRemoveListing,
  getUnresolvedReports,
  resolveReport,
  getActiveUserIds,
};
