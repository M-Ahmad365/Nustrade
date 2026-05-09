'use strict';

const { Router }                     = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl                           = require('../controllers/admin');

const router = Router();

// All admin routes require a valid JWT AND admin role
router.use(authenticate, requireAdmin);

// ── Users ──────────────────────────────────────────────────────────────────
/** GET  /api/v1/admin/users             — paginated user list */
router.get('/users', ctrl.getUsers);

/** POST /api/v1/admin/users/:id/ban     — ban a user */
router.post('/users/:id/ban', ctrl.banUser);

/** POST /api/v1/admin/users/:id/unban   — unban a user */
router.post('/users/:id/unban', ctrl.unbanUser);

// ── Listings ───────────────────────────────────────────────────────────────
/** GET  /api/v1/admin/listings          — all listings with admin detail */
router.get('/listings', ctrl.getListings);

/** POST /api/v1/admin/listings/:id/remove — force-remove a listing */
router.post('/listings/:id/remove', ctrl.removeListing);

// ── Reports ────────────────────────────────────────────────────────────────
/** GET  /api/v1/admin/reports           — unresolved reports queue */
router.get('/reports', ctrl.getReports);

/** POST /api/v1/admin/reports/:id/resolve — mark a report resolved */
router.post('/reports/:id/resolve', ctrl.resolveReport);

// ── Analytics ──────────────────────────────────────────────────────────────
/** GET  /api/v1/admin/analytics         — full dashboard (Redis-cached) */
router.get('/analytics', ctrl.getAnalytics);

// ── Backup ─────────────────────────────────────────────────────────────────
/** POST /api/v1/admin/backup            — trigger pg_dump + mongodump */
router.post('/backup', ctrl.triggerBackup);

// ── Announcements ──────────────────────────────────────────────────────────
/** POST /api/v1/admin/announcement      — broadcast to all active users */
router.post('/announcement', ctrl.sendAnnouncement);

module.exports = { router };
