'use strict';

const { query } = require('../../config/postgres');

/** My wishlist with listing details. */
const getWishlist = async (userId) => {
  const { rows } = await query(
    `SELECT w.created_at AS wishlisted_at,
            l.listing_id, l.title, l.price, l.status, l.condition,
            (SELECT img.image_url FROM listing_images img
             WHERE img.listing_id = l.listing_id
             ORDER BY img.display_order ASC LIMIT 1) AS thumbnail_url,
            u.full_name AS seller_name, u.aggregate_rating AS seller_rating
     FROM wishlist_items w
     JOIN listings l ON l.listing_id = w.listing_id
     JOIN users    u ON u.user_id    = l.seller_id
     WHERE w.user_id = $1
     ORDER BY w.created_at DESC`,
    [userId]
  );
  return rows;
};

/**
 * Add listing to wishlist. Idempotent — ON CONFLICT DO NOTHING means re-adding is safe.
 * Returns true if newly inserted, false if already present.
 */
const addToWishlist = async (userId, listingId) => {
  const { rowCount } = await query(
    `INSERT INTO wishlist_items (user_id, listing_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, listing_id) DO NOTHING`,
    [userId, listingId]
  );
  return rowCount > 0;
};

/** Remove from wishlist. Returns true if the row existed and was deleted. */
const removeFromWishlist = async (userId, listingId) => {
  const { rowCount } = await query(
    'DELETE FROM wishlist_items WHERE user_id = $1 AND listing_id = $2',
    [userId, listingId]
  );
  return rowCount > 0;
};

/** All user IDs who have this listing wishlisted — used for price-drop notifications. */
const getWishlistWatchers = async (listingId) => {
  const { rows } = await query(
    'SELECT user_id FROM wishlist_items WHERE listing_id = $1',
    [listingId]
  );
  return rows.map((r) => r.user_id);
};

module.exports = { getWishlist, addToWishlist, removeFromWishlist, getWishlistWatchers };
