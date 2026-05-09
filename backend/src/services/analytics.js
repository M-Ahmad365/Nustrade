'use strict';

const { query } = require('../config/postgres');
const { redis } = require('../config/redis');

const CACHE_TTL = 600; // 10 minutes

/**
 * Fetch from Redis cache, or compute and store if missing.
 * @param {string} key   cache key suffix (prefixed with cache:dashboard:)
 * @param {Function} fn  async fn that returns the metric
 */
const cached = async (key, fn) => {
  const raw = await redis.get(`cache:dashboard:${key}`);
  if (raw) return JSON.parse(raw);
  const result = await fn();
  await redis.set(`cache:dashboard:${key}`, JSON.stringify(result), 'EX', CACHE_TTL);
  return result;
};

/** Total users, verified users, banned users. */
const getTotalUsers = () => cached('total_users', async () => {
  const { rows } = await query(`
    SELECT
      COUNT(*)                                                      ::int AS total,
      COUNT(*) FILTER (WHERE is_active = TRUE)                      ::int AS active,
      COUNT(*) FILTER (WHERE email_verified = TRUE)                 ::int AS verified,
      COUNT(*) FILTER (WHERE is_banned = TRUE)                      ::int AS banned
    FROM users
  `);
  return rows[0];
});

/** Total listings broken down by status. */
const getTotalListings = () => cached('total_listings', async () => {
  const { rows } = await query(`
    SELECT
      COUNT(*)                                                       ::int AS total,
      COUNT(*) FILTER (WHERE status = 'active')                     ::int AS active,
      COUNT(*) FILTER (WHERE status = 'sold')                       ::int AS sold,
      COUNT(*) FILTER (WHERE status = 'expired')                    ::int AS expired,
      COUNT(*) FILTER (WHERE status = 'reserved')                   ::int AS reserved
    FROM listings
  `);
  return rows[0];
});

/** Transaction count and total PKR transacted for completed deals. */
const getTotalTransactions = () => cached('total_transactions', async () => {
  const { rows } = await query(`
    SELECT
      COUNT(*)                                                          ::int    AS total,
      COUNT(*) FILTER (WHERE status = 'completed')                     ::int    AS completed,
      COALESCE(
        SUM(agreed_price) FILTER (WHERE status = 'completed'), 0
      )                                                                 ::int    AS total_value_pkr
    FROM transactions
  `);
  return rows[0];
});

/** Listing count per category, all-time. */
const getListingsByCategory = () => cached('listings_by_category', async () => {
  const { rows } = await query(`
    SELECT c.slug, c.name, COUNT(l.listing_id)::int AS count
    FROM categories c
    LEFT JOIN listings l ON l.category_id = c.category_id
    GROUP BY c.category_id, c.slug, c.name
    ORDER BY count DESC
  `);
  return rows;
});

/** Listing count per hostel (location). */
const getListingsByHostel = () => cached('listings_by_hostel', async () => {
  const { rows } = await query(`
    SELECT
      COALESCE(location_hostel, 'off_campus') AS hostel,
      COUNT(*)::int AS count
    FROM listings
    WHERE status NOT IN ('deleted_by_user', 'removed_by_admin')
    GROUP BY location_hostel
    ORDER BY count DESC
  `);
  return rows;
});

/** Listing count per seller department. */
const getListingsByDepartment = () => cached('listings_by_department', async () => {
  const { rows } = await query(`
    SELECT u.department::text, COUNT(l.listing_id)::int AS count
    FROM listings l
    JOIN users u ON u.user_id = l.seller_id
    WHERE l.status NOT IN ('deleted_by_user', 'removed_by_admin')
    GROUP BY u.department
    ORDER BY count DESC
  `);
  return rows;
});

/** Average price per category for currently active listings. */
const getAvgPricePerCategory = () => cached('avg_price_per_category', async () => {
  const { rows } = await query(`
    SELECT
      c.slug,
      c.name,
      ROUND(AVG(l.price))::int AS avg_price,
      COUNT(l.listing_id)::int AS active_count
    FROM categories c
    LEFT JOIN listings l ON l.category_id = c.category_id AND l.status = 'active'
    GROUP BY c.category_id, c.slug, c.name
    ORDER BY avg_price DESC NULLS LAST
  `);
  return rows;
});

/**
 * Top 10 sellers by revenue (sum of agreed_price on completed transactions).
 * CTE isolates the aggregation for readability.
 *
 * EXPLAIN ANALYZE (2 users, 0 transactions — dev seed):
 *   Limit (cost=24.33..24.35 rows=10) (actual time=0.300..0.301 rows=2 loops=1)
 *     -> Sort  Sort Key: revenue DESC, total_sales DESC
 *        -> HashAggregate  Group Key: u.user_id  Memory: 24kB
 *           -> Hash Right Join  Hash Cond: t.seller_id = u.user_id
 *              -> Seq Scan on transactions t  (0 rows)
 *              -> Seq Scan on users u  (2 rows)
 *   Planning Time: 3.140 ms  Execution Time: 0.346 ms
 *
 * With real data: idx_transactions_seller (btree) used for the join instead of Seq Scan.
 * HashAggregate scales linearly with distinct sellers — acceptable for admin dashboard.
 */
const getTopSellers = () => cached('top_sellers', async () => {
  const { rows } = await query(`
    WITH seller_stats AS (
      SELECT
        u.user_id,
        u.full_name,
        u.department::text,
        u.aggregate_rating,
        u.total_sales,
        COALESCE(SUM(t.agreed_price) FILTER (WHERE t.status = 'completed'), 0)::int AS revenue
      FROM users u
      LEFT JOIN transactions t ON t.seller_id = u.user_id
      GROUP BY u.user_id, u.full_name, u.department, u.aggregate_rating, u.total_sales
    )
    SELECT *
    FROM seller_stats
    ORDER BY revenue DESC, total_sales DESC
    LIMIT 10
  `);
  return rows;
});

/**
 * Daily signup count for last 90 days.
 *
 * EXPLAIN ANALYZE (2 users — dev seed):
 *   Sort  Sort Key: date  (actual time=0.053..0.054 rows=1 loops=1)
 *     -> HashAggregate  Group Key: date_trunc('day', created_at)  Memory: 24kB
 *        -> Seq Scan on users  Filter: created_at > (now() - '90 days')
 *   Planning Time: 0.476 ms  Execution Time: 0.096 ms
 *
 * With real data: Seq Scan is acceptable for this admin-only analytics query since
 * it always touches the full 90-day window regardless of an index. An index on
 * created_at would only help if we narrowed to a short range (e.g., last 7 days).
 */
const getSignupTrend = () => cached('signup_trend', async () => {
  const { rows } = await query(`
    SELECT
      DATE_TRUNC('day', created_at)::date AS date,
      COUNT(*)::int                        AS count
    FROM users
    WHERE created_at > NOW() - INTERVAL '90 days'
    GROUP BY DATE_TRUNC('day', created_at)
    ORDER BY date ASC
  `);
  return rows;
});

/** Daily listing post count for last 90 days. */
const getListingPostTrend = () => cached('listing_post_trend', async () => {
  const { rows } = await query(`
    SELECT
      DATE_TRUNC('day', posted_at)::date AS date,
      COUNT(*)::int                       AS count
    FROM listings
    WHERE posted_at > NOW() - INTERVAL '90 days'
    GROUP BY DATE_TRUNC('day', posted_at)
    ORDER BY date ASC
  `);
  return rows;
});

/** Percentage of transactions that reach 'completed' status. */
const getCompletionRate = () => cached('completion_rate', async () => {
  const { rows } = await query(`
    SELECT
      COUNT(*)::int                                                  AS total,
      COUNT(*) FILTER (WHERE status = 'completed')::int             AS completed,
      ROUND(
        COUNT(*) FILTER (WHERE status = 'completed') * 100.0
        / NULLIF(COUNT(*), 0),
      2) AS completion_rate_pct
    FROM transactions
  `);
  return rows[0];
});

/** Average hours and days from listing post to sale. */
const getAvgTimeToSale = () => cached('avg_time_to_sale', async () => {
  const { rows } = await query(`
    SELECT
      ROUND(AVG(EXTRACT(EPOCH FROM (sold_at - posted_at)) / 3600))::int  AS avg_hours,
      ROUND(AVG(EXTRACT(EPOCH FROM (sold_at - posted_at)) / 86400))::int AS avg_days,
      MIN(EXTRACT(EPOCH FROM (sold_at - posted_at)) / 86400)::int        AS min_days,
      MAX(EXTRACT(EPOCH FROM (sold_at - posted_at)) / 86400)::int        AS max_days
    FROM listings
    WHERE status = 'sold' AND sold_at IS NOT NULL
  `);
  return rows[0];
});

/**
 * Price history for completed sales of a specific course-code book.
 * Uses a 3-row moving average window function to smooth the trend line.
 * @param {string} courseCode  e.g. 'CS-236'
 */
const getPriceHistoryByCourseCode = async (courseCode) => {
  // Not cached here — depends on a param; called directly by the controller
  const { rows } = await query(`
    SELECT
      t.completed_at::date                     AS date,
      t.agreed_price,
      AVG(t.agreed_price) OVER (
        ORDER BY t.completed_at
        ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
      )::int                                   AS moving_avg_price,
      l.title
    FROM transactions t
    JOIN listings l ON l.listing_id = t.listing_id
    WHERE l.course_code = $1
      AND t.status = 'completed'
    ORDER BY t.completed_at ASC
  `, [courseCode]);
  return rows;
};

/**
 * Compare listing volume during semester-end months (May, Jun, Nov, Dec) vs
 * regular months, using a window function for the overall average baseline.
 */
const getSemesterEndSurge = () => cached('semester_end_surge', async () => {
  const { rows } = await query(`
    WITH monthly AS (
      SELECT
        DATE_TRUNC('month', posted_at)        AS month,
        EXTRACT(MONTH FROM posted_at)::int    AS month_num,
        COUNT(*)::int                         AS listing_count
      FROM listings
      WHERE posted_at > NOW() - INTERVAL '2 years'
      GROUP BY DATE_TRUNC('month', posted_at),
               EXTRACT(MONTH FROM posted_at)
    ),
    annotated AS (
      SELECT *,
        CASE
          WHEN month_num IN (5, 6, 11, 12) THEN 'semester_end'
          ELSE 'regular'
        END                                   AS season,
        ROUND(AVG(listing_count) OVER ())::int AS overall_monthly_avg
      FROM monthly
    )
    SELECT
      month::date,
      month_num,
      listing_count,
      season,
      overall_monthly_avg,
      ROUND(
        (listing_count - overall_monthly_avg) * 100.0
        / NULLIF(overall_monthly_avg, 0),
      1) AS pct_above_avg
    FROM annotated
    ORDER BY month ASC
  `);
  return rows;
});

/**
 * Aggregate all cached metrics into one dashboard response.
 * Each metric is fetched independently so one slow query cannot block others.
 */
const getDashboard = async () => {
  const [
    totalUsers,
    totalListings,
    totalTransactions,
    listingsByCategory,
    listingsByHostel,
    listingsByDepartment,
    avgPricePerCategory,
    topSellers,
    signupTrend,
    listingPostTrend,
    completionRate,
    avgTimeToSale,
    semesterEndSurge,
  ] = await Promise.all([
    getTotalUsers(),
    getTotalListings(),
    getTotalTransactions(),
    getListingsByCategory(),
    getListingsByHostel(),
    getListingsByDepartment(),
    getAvgPricePerCategory(),
    getTopSellers(),
    getSignupTrend(),
    getListingPostTrend(),
    getCompletionRate(),
    getAvgTimeToSale(),
    getSemesterEndSurge(),
  ]);

  return {
    total_users:            totalUsers,
    total_listings:         totalListings,
    total_transactions:     totalTransactions,
    listings_by_category:   listingsByCategory,
    listings_by_hostel:     listingsByHostel,
    listings_by_department: listingsByDepartment,
    avg_price_per_category: avgPricePerCategory,
    top_sellers:            topSellers,
    signup_trend:           signupTrend,
    listing_post_trend:     listingPostTrend,
    completion_rate:        completionRate,
    avg_time_to_sale:       avgTimeToSale,
    semester_end_surge:     semesterEndSurge,
  };
};

module.exports = {
  getDashboard,
  getTotalUsers,
  getTotalListings,
  getTotalTransactions,
  getListingsByCategory,
  getListingsByHostel,
  getListingsByDepartment,
  getAvgPricePerCategory,
  getTopSellers,
  getSignupTrend,
  getListingPostTrend,
  getCompletionRate,
  getAvgTimeToSale,
  getPriceHistoryByCourseCode,
  getSemesterEndSurge,
};
