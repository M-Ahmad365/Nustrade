'use strict';

const path   = require('path');
const fs     = require('fs');
const { spawn } = require('child_process');

const { env }                    = require('../config/env');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { ok, created }            = require('../utils/response');
const { logger }                 = require('../utils/logger');
const { notify }                 = require('../services/notify');
const analytics                  = require('../services/analytics');
const adminDb                    = require('../db/queries/admin');

// ── Users ─────────────────────────────────────────────────────────────────────

/** GET /api/v1/admin/users — paginated user list with search + filters */
const getUsers = asyncHandler(async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const filters = {
    search:     req.query.search    || null,
    isBanned:   req.query.banned    !== undefined ? req.query.banned    === 'true' : null,
    isVerified: req.query.verified  !== undefined ? req.query.verified  === 'true' : null,
    role:       req.query.role      || null,
    limit,
    offset,
  };

  const [users, total] = await Promise.all([
    adminDb.getUsers(filters),
    adminDb.getUserCount(filters),
  ]);

  return ok(res, { users, page, limit, total });
});

/** POST /api/v1/admin/users/:id/ban — ban a student account */
const banUser = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (!userId) throw new AppError(400, 'INVALID_ID', 'Invalid user ID');
  if (userId === req.user.user_id) throw new AppError(400, 'CANNOT_BAN_SELF', 'Cannot ban yourself');

  const user = await adminDb.banUser(userId);
  if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found or user is an admin');

  logger.info(`[admin] user ${userId} banned by admin ${req.user.user_id}`);
  return ok(res, user, 'User banned');
});

/** POST /api/v1/admin/users/:id/unban — unban a user */
const unbanUser = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (!userId) throw new AppError(400, 'INVALID_ID', 'Invalid user ID');

  const user = await adminDb.unbanUser(userId);
  if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');

  logger.info(`[admin] user ${userId} unbanned by admin ${req.user.user_id}`);
  return ok(res, user, 'User unbanned');
});

// ── Listings ──────────────────────────────────────────────────────────────────

/** GET /api/v1/admin/listings — all listings with admin-level detail */
const getListings = asyncHandler(async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const listings = await adminDb.getAdminListings({
    search: req.query.search || null,
    status: req.query.status || null,
    limit,
    offset,
  });

  return ok(res, { listings, page, limit });
});

/** POST /api/v1/admin/listings/:id/remove — force-remove a listing */
const removeListing = asyncHandler(async (req, res) => {
  const listingId = parseInt(req.params.id, 10);
  if (!listingId) throw new AppError(400, 'INVALID_ID', 'Invalid listing ID');

  const listing = await adminDb.forceRemoveListing(listingId);
  if (!listing) throw new AppError(404, 'NOT_FOUND', 'Listing not found or already sold/removed');

  logger.info(`[admin] listing ${listingId} removed by admin ${req.user.user_id}`);
  return ok(res, listing, 'Listing removed');
});

// ── Reports ───────────────────────────────────────────────────────────────────

/** GET /api/v1/admin/reports — unresolved reports queue */
const getReports = asyncHandler(async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const reports = await adminDb.getUnresolvedReports({ limit, offset });
  return ok(res, { reports, page, limit });
});

/** POST /api/v1/admin/reports/:id/resolve — mark report resolved with notes */
const resolveReport = asyncHandler(async (req, res) => {
  const reportId = parseInt(req.params.id, 10);
  if (!reportId) throw new AppError(400, 'INVALID_ID', 'Invalid report ID');

  const { resolution_notes } = req.body;
  const report = await adminDb.resolveReport(reportId, req.user.user_id, resolution_notes || null);
  if (!report) throw new AppError(404, 'NOT_FOUND', 'Report not found or already resolved');

  logger.info(`[admin] report ${reportId} resolved by admin ${req.user.user_id}`);
  return ok(res, report, 'Report resolved');
});

// ── Analytics ─────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/analytics — full dashboard.
 * Optional ?course_code= to include price history for that course.
 * All base metrics are Redis-cached for 10 min; only price_history is live.
 */
const getAnalytics = asyncHandler(async (req, res) => {
  const dashboard = await analytics.getDashboard();

  if (req.query.course_code) {
    dashboard.price_history = await analytics.getPriceHistoryByCourseCode(req.query.course_code);
  }

  return ok(res, dashboard);
});

// ── Backup ────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/admin/backup — shell out to pg_dump + mongodump.
 * Writes to backups/{ISO-timestamp}/ relative to the repo root.
 * Uses spawn (not exec) with an explicit args array to prevent injection.
 */
const triggerBackup = asyncHandler(async (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const repoRoot  = path.join(__dirname, '..', '..', '..');
  const backupDir = path.join(repoRoot, 'backups', timestamp);

  fs.mkdirSync(path.join(backupDir, 'mongo'), { recursive: true });

  // pg_dump — password passed via env so it never appears in argv
  await new Promise((resolve, reject) => {
    const proc = spawn(
      'pg_dump',
      [
        '-h', env.PG_HOST,
        '-p', String(env.PG_PORT),
        '-U', env.PG_USER,
        '-d', env.PG_DB,
        '--format=custom',
        '-f', path.join(backupDir, 'postgres.dump'),
      ],
      { env: { ...process.env, PGPASSWORD: env.PG_PASSWORD || '' } }
    );
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`pg_dump exited with code ${code}`));
    });
  });

  // mongodump — URI contains credentials already
  await new Promise((resolve, reject) => {
    const proc = spawn(
      'mongodump',
      ['--uri', env.MONGO_URI, '--out', path.join(backupDir, 'mongo')]
    );
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`mongodump exited with code ${code}`));
    });
  });

  logger.info(`[admin] backup completed — dir: backups/${timestamp}, admin: ${req.user.user_id}`);
  return created(res, { backup_dir: `backups/${timestamp}`, timestamp }, 'Backup completed');
});

// ── Announcements ─────────────────────────────────────────────────────────────

/**
 * POST /api/v1/admin/announcement — broadcast admin_warning to all active users.
 * Body: { message: string }
 * Fire-and-forget per user; failures logged by notify() internally.
 */
const sendAnnouncement = asyncHandler(async (req, res) => {
  const { message } = req.body;
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'message is required');
  }
  if (message.length > 500) {
    throw new AppError(400, 'VALIDATION_ERROR', 'message must be 500 chars or fewer');
  }

  const userIds = await adminDb.getActiveUserIds();

  // Fire-and-forget in batches to avoid overwhelming the event loop
  const batchSize = 100;
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    await Promise.all(
      batch.map((uid) =>
        notify(uid, 'admin_warning', { message: message.trim(), sent_by: req.user.user_id }).catch(() => {})
      )
    );
  }

  logger.info(`[admin] announcement sent to ${userIds.length} users by admin ${req.user.user_id}`);
  return ok(res, { notified_count: userIds.length }, 'Announcement sent');
});

module.exports = {
  getUsers,
  banUser,
  unbanUser,
  getListings,
  removeListing,
  getReports,
  resolveReport,
  getAnalytics,
  triggerBackup,
  sendAnnouncement,
};
