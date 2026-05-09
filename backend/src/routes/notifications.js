'use strict';

const { Router }       = require('express');
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/notifications');

const router = Router();

router.use(authenticate);

// Static sub-paths before /:id to avoid Express treating 'mark-all-read' as an ID
/** GET /api/v1/notifications/unread-count — fast Redis read */
router.get('/unread-count', ctrl.getUnreadCount);

/** POST /api/v1/notifications/mark-all-read — zero out all unread */
router.post('/mark-all-read', ctrl.markAllRead);

/** GET /api/v1/notifications — paginated list */
router.get('/', ctrl.getNotifications);

/** POST /api/v1/notifications/:id/read — mark single notification as read */
router.post('/:id/read', ctrl.markOneRead);

module.exports = { router };
