'use strict';

const { query, getClient } = require('../../config/postgres');

/**
 * Full profile for the authenticated user — includes sensitive fields.
 * Never send this response to another user.
 */
const getOwnProfile = async (userId) => {
  const { rows } = await query(
    `SELECT user_id, email, full_name, department, semester, residence_type, hostel_name,
            phone_number, bio, profile_picture_url, role, email_verified,
            aggregate_rating, total_reviews, total_sales, total_purchases,
            created_at, updated_at
     FROM users
     WHERE user_id = $1 AND is_active = TRUE`,
    [userId]
  );
  return rows[0] ?? null;
};

/**
 * Public-safe profile — strips email, phone, password_hash, is_banned, total_purchases.
 * hostel_name only returned when residence_type = 'hostellite' (CASE in SELECT).
 */
const getPublicProfile = async (userId) => {
  const { rows } = await query(
    `SELECT user_id, full_name, department, semester,
            CASE WHEN residence_type = 'hostellite' THEN hostel_name ELSE NULL END AS hostel_name,
            bio, profile_picture_url, aggregate_rating, total_reviews, total_sales, created_at
     FROM users
     WHERE user_id = $1 AND is_active = TRUE AND is_banned = FALSE`,
    [userId]
  );
  return rows[0] ?? null;
};

/**
 * Partial update — only columns explicitly provided in the payload are changed.
 * Builds a dynamic SET clause; caller must pass undefined for fields to skip.
 */
const updateProfile = async (userId, { fullName, department, semester, residenceType, hostelName, phoneNumber, bio }) => {
  const cols = [];
  const vals = [];
  let i = 1;

  if (fullName      !== undefined) { cols.push(`full_name = $${i++}`);      vals.push(fullName); }
  if (department    !== undefined) { cols.push(`department = $${i++}`);     vals.push(department); }
  if (semester      !== undefined) { cols.push(`semester = $${i++}`);       vals.push(semester); }
  if (residenceType !== undefined) { cols.push(`residence_type = $${i++}`); vals.push(residenceType); }
  if (hostelName    !== undefined) { cols.push(`hostel_name = $${i++}`);    vals.push(hostelName); }
  if (phoneNumber   !== undefined) { cols.push(`phone_number = $${i++}`);   vals.push(phoneNumber); }
  if (bio           !== undefined) { cols.push(`bio = $${i++}`);            vals.push(bio); }

  if (cols.length === 0) return null;

  vals.push(userId);
  const { rows } = await query(
    `UPDATE users
     SET ${cols.join(', ')}
     WHERE user_id = $${i} AND is_active = TRUE
     RETURNING user_id, email, full_name, department, semester, residence_type, hostel_name,
               phone_number, bio, profile_picture_url, aggregate_rating, total_reviews,
               created_at, updated_at`,
    vals
  );
  return rows[0] ?? null;
};

/** Return current profile_picture_url so the controller can delete the old file. */
const getProfilePictureUrl = async (userId) => {
  const { rows } = await query(
    'SELECT profile_picture_url FROM users WHERE user_id = $1',
    [userId]
  );
  return rows[0]?.profile_picture_url ?? null;
};

/** Overwrite profile_picture_url and return the new value. */
const updateProfilePicture = async (userId, url) => {
  const { rows } = await query(
    `UPDATE users SET profile_picture_url = $1
     WHERE user_id = $2 AND is_active = TRUE
     RETURNING profile_picture_url`,
    [url, userId]
  );
  return rows[0] ?? null;
};

/**
 * Deactivate user and hide all their active listings — must be atomic.
 * Does NOT delete historical transactions or reviews per spec 3.2.
 */
const deactivateUser = async (userId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE users SET is_active = FALSE WHERE user_id = $1',
      [userId]
    );
    await client.query(
      `UPDATE listings SET status = 'deleted_by_user'
       WHERE seller_id = $1 AND status = 'active'`,
      [userId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Active listings for a given seller — used by both own profile and public profile pages.
 * Includes first image thumbnail and category info.
 */
const getUserListings = async (userId, page = 1, limit = 20, status = null) => {
  const offset = (page - 1) * limit;
  // status=null returns all statuses (owner viewing own listings dashboard)
  const whereStatus = status ? `AND l.status = $4` : '';
  const params = status ? [userId, limit, offset, status] : [userId, limit, offset];
  const { rows } = await query(
    `SELECT l.listing_id, l.title, l.price, l.is_negotiable, l.condition, l.status,
            l.location_hostel, l.is_off_campus, l.course_code, l.view_count,
            l.posted_at, l.expires_at, l.last_boosted_at,
            c.slug AS category_slug, c.name AS category_name,
            (SELECT i.image_url FROM listing_images i
             WHERE i.listing_id = l.listing_id
             ORDER BY i.display_order ASC LIMIT 1) AS thumbnail_url
     FROM listings l
     JOIN categories c ON c.category_id = l.category_id
     WHERE l.seller_id = $1 ${whereStatus}
     ORDER BY l.last_boosted_at DESC NULLS LAST, l.posted_at DESC
     LIMIT $2 OFFSET $3`,
    params
  );
  return rows;
};

/** Reviews received by a user, newest first, with reviewer's public info. */
const getUserReviews = async (userId, page = 1, limit = 20) => {
  const offset = (page - 1) * limit;
  const { rows } = await query(
    `SELECT r.review_id, r.rating, r.comment, r.created_at,
            u.user_id AS reviewer_id, u.full_name AS reviewer_name,
            u.profile_picture_url AS reviewer_picture_url
     FROM reviews r
     JOIN users u ON u.user_id = r.reviewer_id
     WHERE r.reviewee_id = $1
     ORDER BY r.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return rows;
};

module.exports = {
  getOwnProfile,
  getPublicProfile,
  updateProfile,
  getProfilePictureUrl,
  updateProfilePicture,
  deactivateUser,
  getUserListings,
  getUserReviews,
};
