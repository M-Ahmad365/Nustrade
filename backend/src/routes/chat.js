'use strict';

const { Router }          = require('express');
const { authenticate, requireVerified } = require('../middleware/auth');
const { chatLimiter }     = require('../middleware/rateLimit');
const { validate }        = require('../middleware/validate');
const { startChatSchema, sendMessageSchema } = require('../validators/chat');
const ctrl = require('../controllers/chat');

const router = Router();

// All chat routes require authentication + verified email (per SPECS 3.8 / CLAUDE.md rules)
router.use(authenticate, requireVerified);

/** POST /api/v1/chat/start — initiate thread from a listing page */
router.post('/start', validate(startChatSchema), ctrl.startChat);

/** GET /api/v1/chat/threads — list my threads */
router.get('/threads', ctrl.getMyThreads);

/** GET /api/v1/chat/threads/:threadId — thread detail */
router.get('/threads/:threadId', ctrl.getThread);

/** GET /api/v1/chat/threads/:threadId/messages — poll for new messages (?since=ISO) */
router.get('/threads/:threadId/messages', ctrl.getMessages);

/** POST /api/v1/chat/threads/:threadId/messages — send message; rate-limited */
router.post('/threads/:threadId/messages', chatLimiter, validate(sendMessageSchema), ctrl.sendMessage);

/** POST /api/v1/chat/threads/:threadId/read — mark all as read */
router.post('/threads/:threadId/read', ctrl.markRead);

module.exports = { router };
