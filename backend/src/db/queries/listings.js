'use strict';

const { query } = require('../../config/postgres');

// Look up a category by slug — used to resolve category_slug → category_id on create/filter
const getCategoryBySlug = async (slug) => {
  const { rows } = await query(
    'SELECT category_id, slug, name FROM categories WHERE slug = $1 AND is_active = TRUE',
    [slug]
  );
  return rows[0] ?? null;
};

// Insert a new listing record; search_vector populated automatically by DB trigger
const createListing = async ({
  sellerId, categoryId, title, description, price,
  isNegotiable, condition, locationHostel, isOffCampus, courseCode,
}) => {
  const { rows } = await query(
    `INSERT INTO listings
       (seller_id, category_id, title, description, price,
        is_negotiable, condition, location_hostel, is_off_campus, course_code)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING listing_id, seller_id, category_id, title, description, price,
               is_negotiable, condition, location_hostel, is_off_campus, course_code,
               status, view_count, posted_at, expires_at, created_at`,
    [
      sellerId, categoryId, title, description, price,
      isNegotiable ?? true, condition, locationHostel ?? null,
      isOffCampus ?? false, courseCode ?? null,
    ]
  );
  return rows[0];
};

// Hard delete — only called for rollback when image save fails immediately after createListing
const hardDeleteListing = async (listingId) => {
  await query('DELETE FROM listings WHERE listing_id = $1', [listingId]);
};

// Insert image URLs in order after existing images; returns inserted rows
const addImages = async (listingId, imageUrls) => {
  const { rows: [{ max_order }] } = await query(
    'SELECT COALESCE(MAX(display_order), -1) AS max_order FROM listing_images WHERE listing_id = $1',
    [listingId]
  );
  let order = max_order + 1;
  const inserted = [];
  for (const url of imageUrls) {
    const { rows } = await query(
      'INSERT INTO listing_images (listing_id, image_url, display_order) VALUES ($1, $2, $3) RETURNING *',
      [listingId, url, order++]
    );
    inserted.push(rows[0]);
  }
  return inserted;
};

// Delete an image row and return it (with image_url) so the controller can remove the file
const removeImage = async (listingId, imageId) => {
  const { rows } = await query(
    'DELETE FROM listing_images WHERE image_id = $1 AND listing_id = $2 RETURNING *',
    [imageId, listingId]
  );
  return rows[0] ?? null;
};

// Count images for a listing — enforces 1-image minimum on remove
const getImageCount = async (listingId) => {
  const { rows } = await query(
    'SELECT COUNT(*)::int AS count FROM listing_images WHERE listing_id = $1',
    [listingId]
  );
  return rows[0].count;
};

// Insert tags; ON CONFLICT DO NOTHING is safe for idempotent re-inserts
const addTags = async (listingId, tags) => {
  for (const tag of tags) {
    await query(
      'INSERT INTO listing_tags (listing_id, tag) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [listingId, tag]
    );
  }
};

// Full tag replacement: delete all then insert new set
const replaceTags = async (listingId, tags) => {
  await query('DELETE FROM listing_tags WHERE listing_id = $1', [listingId]);
  if (tags && tags.length > 0) await addTags(listingId, tags);
};

/*
 * Full listing detail — includes seller info, images array, and tags array.
 * deleted_by_user / removed_by_admin listings are excluded (404 for those).
 * reserved / sold / expired listings are still viewable.
 */
const getListingById = async (listingId) => {
  const { rows } = await query(
    `SELECT l.listing_id, l.seller_id, l.category_id, l.title, l.description, l.price,
            l.is_negotiable, l.condition, l.location_hostel, l.is_off_campus, l.course_code,
            l.status, l.view_count, l.posted_at, l.expires_at, l.last_boosted_at,
            l.sold_at, l.created_at, l.updated_at,
            c.slug AS category_slug, c.name AS category_name,
            u.full_name AS seller_name, u.profile_picture_url AS seller_picture_url,
            u.aggregate_rating AS seller_rating, u.total_sales AS seller_total_sales,
            u.hostel_name AS seller_hostel
     FROM listings l
     JOIN categories c ON c.category_id = l.category_id
     JOIN users u ON u.user_id = l.seller_id
     WHERE l.listing_id = $1
       AND l.status NOT IN ('deleted_by_user', 'removed_by_admin')`,
    [listingId]
  );
  if (!rows[0]) return null;
  const listing = rows[0];

  const { rows: images } = await query(
    'SELECT image_id, image_url, display_order FROM listing_images WHERE listing_id = $1 ORDER BY display_order ASC',
    [listingId]
  );
  const { rows: tagRows } = await query(
    'SELECT tag FROM listing_tags WHERE listing_id = $1',
    [listingId]
  );
  listing.images = images;
  listing.tags   = tagRows.map((t) => t.tag);
  return listing;
};

// Fetch multiple listings by ID — used to hydrate trending results from Redis
const getListingsByIds = async (ids) => {
  if (ids.length === 0) return [];
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await query(
    `SELECT l.listing_id, l.title, l.price, l.is_negotiable, l.condition, l.status,
            l.location_hostel, l.is_off_campus, l.view_count, l.posted_at, l.last_boosted_at,
            c.slug AS category_slug, c.name AS category_name,
            u.user_id AS seller_id, u.full_name AS seller_name,
            u.aggregate_rating AS seller_rating,
            (SELECT img.image_url FROM listing_images img
             WHERE img.listing_id = l.listing_id
             ORDER BY img.display_order ASC LIMIT 1) AS thumbnail_url
     FROM listings l
     JOIN categories c ON c.category_id = l.category_id
     JOIN users u ON u.user_id = l.seller_id
     WHERE l.listing_id IN (${placeholders}) AND l.status = 'active'`,
    ids
  );
  return rows;
};

/*
 * Home feed — dynamic WHERE clause built from whitelisted filter keys.
 * ORDER BY clause is a whitelisted string literal; no user input reaches it directly.
 * Parameterized values prevent SQL injection on all filter values.
 *
 * EXPLAIN ANALYZE (no filters, default sort, 2 users / 0 listings — dev seed):
 *   Limit (cost=25.06..25.06 rows=1 width=254) (actual time=0.617..0.618 rows=0 loops=1)
 *     -> Sort  Sort Key: l.last_boosted_at DESC NULLS LAST, u.aggregate_rating DESC, l.posted_at DESC
 *        -> Nested Loop
 *           -> Index Scan using idx_listings_category on listings l   <-- partial idx WHERE status='active'
 *           -> Index Only Scan using categories_pkey on categories c
 *           -> Index Scan using users_pkey on users u
 *   Planning Time: 5.970 ms  Execution Time: 1.362 ms
 *
 * With real data (1k+ listings): planner switches to idx_listings_posted_at (partial, status='active'),
 * which is a covering index for the default sort. Bitmap Heap Scan for filtered queries (price/category).
 * The correlated subquery for thumbnail_url uses idx_listing_images_listing (listing_id, display_order).
 */
const getListings = async (filters = {}) => {
  const {
    category_id, min_price, max_price, condition,
    hostel, department, course_code, is_off_campus,
    sort = 'recommended', page = 1, limit = 20,
  } = filters;

  const conditions = [`l.status = 'active'`];
  const vals       = [];
  let i = 1;

  if (category_id   !== undefined) { conditions.push(`l.category_id = $${i++}`);       vals.push(category_id); }
  if (min_price     !== undefined) { conditions.push(`l.price >= $${i++}`);             vals.push(min_price); }
  if (max_price     !== undefined) { conditions.push(`l.price <= $${i++}`);             vals.push(max_price); }
  if (condition     !== undefined) { conditions.push(`l.condition = $${i++}`);          vals.push(condition); }
  if (hostel        !== undefined) { conditions.push(`u.hostel_name = $${i++}`);        vals.push(hostel); }
  if (department    !== undefined) { conditions.push(`u.department = $${i++}`);         vals.push(department); }
  if (course_code   !== undefined) { conditions.push(`l.course_code ILIKE $${i++}`);    vals.push(`%${course_code}%`); }
  if (is_off_campus !== undefined) { conditions.push(`l.is_off_campus = $${i++}`);      vals.push(is_off_campus); }

  // Whitelisted sort map — user-supplied sort key resolves to a fixed SQL fragment
  const ORDER_MAP = {
    recommended: 'l.last_boosted_at DESC NULLS LAST, u.aggregate_rating DESC, l.posted_at DESC',
    newest:      'l.posted_at DESC',
    price_asc:   'l.price ASC',
    price_desc:  'l.price DESC',
    most_viewed: 'l.view_count DESC',
  };
  const orderClause = ORDER_MAP[sort] ?? ORDER_MAP.recommended;

  const offset = (page - 1) * limit;
  vals.push(limit, offset);
  const limitP  = `$${i++}`;
  const offsetP = `$${i}`;

  const { rows } = await query(
    `SELECT l.listing_id, l.title, l.price, l.is_negotiable, l.condition, l.status,
            l.location_hostel, l.is_off_campus, l.course_code, l.view_count,
            l.posted_at, l.expires_at, l.last_boosted_at,
            c.slug AS category_slug, c.name AS category_name,
            u.user_id AS seller_id, u.full_name AS seller_name,
            u.profile_picture_url AS seller_picture_url,
            u.aggregate_rating AS seller_rating,
            (SELECT img.image_url FROM listing_images img
             WHERE img.listing_id = l.listing_id
             ORDER BY img.display_order ASC LIMIT 1) AS thumbnail_url
     FROM listings l
     JOIN categories c ON c.category_id = l.category_id
     JOIN users u ON u.user_id = l.seller_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY ${orderClause}
     LIMIT ${limitP} OFFSET ${offsetP}`,
    vals
  );
  return rows;
};

/*
 * Full-text search using Postgres tsvector + tsquery (GIN index on search_vector).
 * search_vector is maintained by trigger trg_listings_search_vector on title/description/course_code.
 * ts_rank weights: title (A) > course_code (B) > description (C).
 * When sort=relevance, ORDER BY uses ts_rank with the same $1 param — no extra cost.
 *
 * EXPLAIN ANALYZE (query='calculus', no listings in dev seed):
 *   Limit (cost=25.06..25.07 rows=1 width=238) (actual time=0.028..0.029 rows=0 loops=1)
 *     -> Sort  Sort Key: ts_rank DESC, l.posted_at DESC
 *        -> Nested Loop
 *           -> Index Scan using idx_listings_category on listings l
 *                Filter: (search_vector @@ 'calculus'::tsquery)
 *           -> Index Only Scan using categories_pkey on categories c
 *   Planning Time: 10.408 ms  Execution Time: 0.091 ms
 *
 * With real data (1k+ listings): planner uses Bitmap Index Scan on idx_listings_search (GIN),
 * then Bitmap Heap Scan on listings — GIN index makes tsvector lookups O(log n).
 * The status='active' filter is pushed into idx_listings_category (partial) when combined.
 */
const searchListings = async (queryText, filters = {}) => {
  const {
    category_id, min_price, max_price, condition,
    sort = 'relevance', page = 1, limit = 20,
  } = filters;

  const conditions = [
    `l.status = 'active'`,
    `l.search_vector @@ plainto_tsquery('english', $1)`,
  ];
  const vals = [queryText];
  let i = 2;

  if (category_id !== undefined) { conditions.push(`l.category_id = $${i++}`); vals.push(category_id); }
  if (min_price   !== undefined) { conditions.push(`l.price >= $${i++}`);      vals.push(min_price); }
  if (max_price   !== undefined) { conditions.push(`l.price <= $${i++}`);      vals.push(max_price); }
  if (condition   !== undefined) { conditions.push(`l.condition = $${i++}`);   vals.push(condition); }

  const ORDER_MAP = {
    relevance:   `ts_rank(l.search_vector, plainto_tsquery('english', $1)) DESC, l.posted_at DESC`,
    newest:      'l.posted_at DESC',
    price_asc:   'l.price ASC',
    price_desc:  'l.price DESC',
    most_viewed: 'l.view_count DESC',
  };
  const orderClause = ORDER_MAP[sort] ?? ORDER_MAP.relevance;

  const offset = (page - 1) * limit;
  vals.push(limit, offset);
  const limitP  = `$${i++}`;
  const offsetP = `$${i}`;

  const { rows } = await query(
    `SELECT l.listing_id, l.title, l.price, l.is_negotiable, l.condition, l.status,
            l.location_hostel, l.is_off_campus, l.course_code, l.view_count,
            l.posted_at, l.expires_at,
            ts_rank(l.search_vector, plainto_tsquery('english', $1)) AS rank,
            c.slug AS category_slug, c.name AS category_name,
            u.user_id AS seller_id, u.full_name AS seller_name,
            u.aggregate_rating AS seller_rating,
            (SELECT img.image_url FROM listing_images img
             WHERE img.listing_id = l.listing_id
             ORDER BY img.display_order ASC LIMIT 1) AS thumbnail_url
     FROM listings l
     JOIN categories c ON c.category_id = l.category_id
     JOIN users u ON u.user_id = l.seller_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY ${orderClause}
     LIMIT ${limitP} OFFSET ${offsetP}`,
    vals
  );
  return rows;
};

// Atomic view count increment — called after Redis dedup confirms this is a new view
const incrementViewCount = async (listingId) => {
  await query(
    'UPDATE listings SET view_count = view_count + 1 WHERE listing_id = $1',
    [listingId]
  );
};

/*
 * Partial update — only columns present in payload are changed.
 * Category is intentionally excluded (per SPECS 3.3 — analytics integrity).
 * Images are managed via separate endpoints.
 */
const updateListing = async (listingId, payload) => {
  const { title, description, price, isNegotiable, condition, locationHostel, isOffCampus, courseCode } = payload;

  const cols = [];
  const vals = [];
  let i = 1;

  if (title          !== undefined) { cols.push(`title = $${i++}`);           vals.push(title); }
  if (description    !== undefined) { cols.push(`description = $${i++}`);     vals.push(description); }
  if (price          !== undefined) { cols.push(`price = $${i++}`);           vals.push(price); }
  if (isNegotiable   !== undefined) { cols.push(`is_negotiable = $${i++}`);   vals.push(isNegotiable); }
  if (condition      !== undefined) { cols.push(`condition = $${i++}`);       vals.push(condition); }
  if (locationHostel !== undefined) { cols.push(`location_hostel = $${i++}`); vals.push(locationHostel); }
  if (isOffCampus    !== undefined) { cols.push(`is_off_campus = $${i++}`);   vals.push(isOffCampus); }
  if (courseCode     !== undefined) { cols.push(`course_code = $${i++}`);     vals.push(courseCode); }

  if (cols.length === 0) return null;

  vals.push(listingId);
  const { rows } = await query(
    `UPDATE listings SET ${cols.join(', ')}
     WHERE listing_id = $${i} AND status NOT IN ('deleted_by_user', 'removed_by_admin')
     RETURNING listing_id`,
    vals
  );
  return rows[0] ?? null;
};

// Soft delete — only works on active listings; reserved listings must cancel offer first
const deleteListing = async (listingId) => {
  const { rows } = await query(
    `UPDATE listings SET status = 'deleted_by_user'
     WHERE listing_id = $1 AND status = 'active'
     RETURNING listing_id`,
    [listingId]
  );
  return rows[0] ?? null;
};

// Set last_boosted_at; 7-day Redis rate limit is enforced in the controller before this runs
const boostListing = async (listingId) => {
  const { rows } = await query(
    `UPDATE listings SET last_boosted_at = NOW()
     WHERE listing_id = $1 AND status = 'active'
     RETURNING listing_id, last_boosted_at`,
    [listingId]
  );
  return rows[0] ?? null;
};

// Return seller_id for ownership checks in requireOwner middleware
const getListingOwnerId = async (listingId) => {
  const { rows } = await query(
    'SELECT seller_id FROM listings WHERE listing_id = $1',
    [listingId]
  );
  return rows[0]?.seller_id ?? null;
};

// Hourly cron: expire all active listings past their expires_at timestamp
const expireListings = async () => {
  const { rows } = await query(
    `UPDATE listings SET status = 'expired'
     WHERE status = 'active' AND expires_at < NOW()
     RETURNING listing_id, seller_id, title`
  );
  return rows;
};

// Insert a moderation report for a listing
const addReport = async ({ listingId, reporterId, reason, details }) => {
  const { rows } = await query(
    'INSERT INTO reports (reporter_id, listing_id, reason, details) VALUES ($1, $2, $3, $4) RETURNING report_id',
    [reporterId, listingId, reason, details ?? null]
  );
  return rows[0];
};

module.exports = {
  getCategoryBySlug,
  createListing,
  hardDeleteListing,
  addImages,
  removeImage,
  getImageCount,
  addTags,
  replaceTags,
  getListingById,
  getListingsByIds,
  getListings,
  searchListings,
  incrementViewCount,
  updateListing,
  deleteListing,
  boostListing,
  getListingOwnerId,
  expireListings,
  addReport,
};
