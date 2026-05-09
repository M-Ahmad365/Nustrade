'use strict';

const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { ok, created }            = require('../utils/response');
const chatService                = require('../services/chat');
const { getListingById }         = require('../db/queries/listings');
const { notify }                 = require('../services/notify');

/**
 * POST /api/v1/chat/start — create or retrieve thread for (buyer, currentUser) + listing.
 * Buyer = req.user; seller = seller_id from body. Validates listing is active and not self-chat.
 */
const startChat = asyncHandler(async (req, res) => {
  const { listing_id, seller_id } = req.body;
  const buyerId = req.user.user_id;

  if (buyerId === seller_id) throw new AppError(422, 'NO_SELF_CHAT', 'Cannot start a chat with yourself');

  const listing = await getListingById(listing_id);
  if (!listing) throw new AppError(404, 'LISTING_NOT_FOUND', 'Listing not found');
  if (listing.seller_id !== seller_id) throw new AppError(422, 'SELLER_MISMATCH', 'seller_id does not match listing owner');
  if (listing.status !== 'active') throw new AppError(422, 'LISTING_NOT_ACTIVE', 'Can only start chat on an active listing');

  const thread = await chatService.getOrCreateThread(buyerId, seller_id, listing_id);
  return created(res, { thread });
});

/**
 * GET /api/v1/chat/threads — all threads where current user is buyer or seller, newest first.
 */
const getMyThreads = asyncHandler(async (req, res) => {
  const threads = await chatService.getThreadsByUser(req.user.user_id);
  return ok(res, { threads });
});

/**
 * GET /api/v1/chat/threads/:threadId — thread detail; only parties may access.
 */
const getThread = asyncHandler(async (req, res) => {
  const thread = await chatService.getThreadById(req.params.threadId, req.user.user_id);
  if (!thread) throw new AppError(404, 'THREAD_NOT_FOUND', 'Thread not found or you are not a party');
  return ok(res, { thread });
});

/**
 * GET /api/v1/chat/threads/:threadId/messages — poll for new messages.
 * Accepts ?since=<ISO timestamp> to return only messages after that point.
 */
const getMessages = asyncHandler(async (req, res) => {
  const thread = await chatService.getThreadById(req.params.threadId, req.user.user_id);
  if (!thread) throw new AppError(404, 'THREAD_NOT_FOUND', 'Thread not found or you are not a party');

  const { since } = req.query;
  if (since && isNaN(Date.parse(since))) throw new AppError(400, 'INVALID_SINCE', 'since must be a valid ISO timestamp');

  const messages = await chatService.getMessages(req.params.threadId, since ?? null);
  return ok(res, { messages });
});

/**
 * POST /api/v1/chat/threads/:threadId/messages — send a text and/or image message.
 * Rate-limited to 30/min per user via chatLimiter in the router.
 */
const sendMessage = asyncHandler(async (req, res) => {
  const { user_id } = req.user;
  const thread = await chatService.getThreadById(req.params.threadId, user_id);
  if (!thread) throw new AppError(404, 'THREAD_NOT_FOUND', 'Thread not found or you are not a party');

  const recipientId = thread.buyer_id === user_id ? thread.seller_id : thread.buyer_id;
  const { content, image_url } = req.body;

  const message = await chatService.sendMessage(
    thread.thread_id,
    user_id,
    recipientId,
    thread.listing_id,
    content ?? null,
    image_url ?? null
  );

  // Notify recipient — fire-and-forget
  notify(recipientId, 'new_message', {
    thread_id:  thread.thread_id,
    listing_id: thread.listing_id,
    preview:    content ? content.slice(0, 60) : '📷 Image',
  }).catch(() => {});

  return created(res, { message });
});

/**
 * POST /api/v1/chat/threads/:threadId/read — mark all unread messages in thread as read.
 */
const markRead = asyncHandler(async (req, res) => {
  const thread = await chatService.getThreadById(req.params.threadId, req.user.user_id);
  if (!thread) throw new AppError(404, 'THREAD_NOT_FOUND', 'Thread not found or you are not a party');

  const count = await chatService.markRead(req.params.threadId, req.user.user_id);
  return ok(res, { marked_read: count });
});

module.exports = { startChat, getMyThreads, getThread, getMessages, sendMessage, markRead };
