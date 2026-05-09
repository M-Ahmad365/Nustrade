/**
 * chat.js — Messaging page controller.
 *
 * Layout: two-column desktop (threads left, window right), single-column mobile
 * (threads shown first, back button to return from window).
 *
 * Polling: every 3 s when tab focused → GET /chat/threads/:id/messages?since=<ts>
 * Mark-read: POST /chat/threads/:id/read when user scrolls to bottom.
 * Nav unread badge: refreshed every 30 s from GET /notifications/unread-count.
 *
 * Rate-limit awareness: track send timestamps; if ≥ 30 in the last 60 s,
 * disable send briefly and show warning.
 */

// ── State ─────────────────────────────────────────────────────────
let threads        = [];          // cached thread list
let activeThreadId = null;        // currently open thread id
let messages       = [];          // messages for active thread
let lastMsgTime    = null;        // ISO timestamp of newest message seen (for polling)
let pollTimer      = null;        // setInterval id for message polling
let unreadTimer    = null;        // setInterval id for nav badge
let sendTimestamps = [];          // rolling window for rate-limit tracking
let isSending      = false;       // debounce double-submit
let activeContext   = {};          // listing/seller context from navigation params

const POLL_MS          = 3_000;
const UNREAD_POLL_MS   = 30_000;
const RATE_LIMIT_MAX   = 30;      // SPECS 3.8: 30/min
const RATE_LIMIT_WINDOW= 60_000;  // 60 s

// ── Boot ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (typeof initRouter === 'function') initRouter();
  if (!auth.requireAuth()) return;

  // Populate nav avatar
  const me = auth.getUser();
  const navInitials = document.getElementById('navAvatarInitials');
  if (navInitials && me) navInitials.textContent = initials(me.name || me.full_name || '?');

  wireBackButton();
  wireInput();
  wireImageUpload();
  wireThreadSearch();

  const params = new URLSearchParams(window.location.search);
  const initId = params.get('thread');
  const listingId = params.get('listingId');
  const sellerId = params.get('sellerId') || params.get('userId');
  console.log('[chat] params:', { thread: initId, listingId, sellerId });

  const hasChatParams = initId || listingId || sellerId;
  if (hasChatParams && (!listingId || !sellerId || listingId === 'undefined' || sellerId === 'undefined' || initId === 'undefined')) {
    showInvalidChatLink();
    return;
  }

  await loadThreads();

  if (listingId && sellerId) {
    await startChatFromParams(listingId, sellerId);
  } else if (initId) {
    openThread(initId, { listingId, sellerId });
  }

  // Auto-expand textarea
  const msgInput = document.getElementById('messageInput');
  if (msgInput) {
    msgInput.addEventListener('input', () => {
      msgInput.style.height = 'auto';
      msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
    });
  }

  // Wire scroll → mark read
  const msgContainer = document.getElementById('messagesContainer');
  if (msgContainer) {
    msgContainer.addEventListener('scroll', debounce(() => markReadIfAtBottom(), 500), { passive: true });
  }

  startUnreadPoll();

  // Pause polling when tab loses focus
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopPoll();
    else if (activeThreadId) startPoll();
  });
});

async function startChatFromParams(listingId, sellerId) {
  const me = auth.getUser();
  const buyerId = me?.user_id || me?.id;
  const expectedThreadId = buyerId ? makeThreadId(buyerId, sellerId, listingId) : null;
  activeContext = { listingId, sellerId };

  try {
    const data = await api.chat.start({ listing_id: listingId, seller_id: sellerId });
    const thread = data.thread || data;
    const threadId = thread.thread_id || thread.threadId || thread.id || expectedThreadId;
    if (!threadId) throw new Error('No thread id returned');
    const url = `/pages/chat.html?${new URLSearchParams({ thread: threadId, listingId, sellerId })}`;
    window.history.replaceState(null, '', url);
    await loadThreads();
    openThread(threadId, { listingId, sellerId });
  } catch (err) {
    const container = document.getElementById('messagesContainer');
    showInvalidChatLink(err.message || 'Invalid chat link');
    if (container) container.innerHTML = `<p style="color:var(--color-danger); text-align:center; padding: var(--space-8);">${escapeHtml(err.message || 'Invalid chat link')}</p>`;
  }
}

function makeThreadId(userA, userB, listingId) {
  const ids = [Number(userA), Number(userB)].sort((a, b) => a - b);
  return `${ids[0]}_${ids[1]}_${listingId}`;
}

function showInvalidChatLink(message = 'Invalid chat link') {
  const listEl = document.getElementById('threadList');
  const noChat = document.getElementById('noChatSelected');
  const chatWindow = document.getElementById('chatWindow');
  if (listEl) listEl.innerHTML = `<p style="padding: var(--space-4); color:var(--color-danger);">${escapeHtml(message)}</p>`;
  if (chatWindow) chatWindow.style.display = 'none';
  if (noChat) {
    noChat.style.display = 'flex';
    noChat.innerHTML = `
      <p class="empty-state-title">${escapeHtml(message)}</p>
      <p class="empty-state-desc">Go back to a listing and use the Chat button again.</p>
    `;
  }
}

// ── Thread list ───────────────────────────────────────────────────
async function loadThreads() {
  const listEl = document.getElementById('threadList');
  listEl.innerHTML = '<p style="padding: var(--space-4); color: var(--color-text-subtle);">Loading…</p>';

  try {
    const data = await api.chat.threads();
    threads    = Array.isArray(data) ? data : (data?.threads || []);
    renderThreadList(threads);
  } catch (err) {
    listEl.innerHTML = `<p style="padding: var(--space-4); color:var(--color-danger);">${escapeHtml(err.message)}</p>`;
  }
}

function renderThreadList(list) {
  const listEl = document.getElementById('threadList');
  if (!list.length) {
    listEl.innerHTML = '<p style="padding: var(--space-4); color: var(--color-text-subtle);">No conversations yet.</p>';
    return;
  }

  const me = auth.getUser();

  listEl.innerHTML = list.map(t => {
    const other     = getOtherParty(t, me);
    const listing   = t.listing || {};
    const thumb     = imgUrl(listing.thumbnail || listing.images?.[0]?.url || listing.image_url);
    const lastMsg   = t.last_message || t.lastMessage || {};
    const preview   = lastMsg.content
      ? (lastMsg.message_type === 'image' ? '📷 Photo' : truncate(lastMsg.content, 45))
      : (t.last_message_preview || 'No messages yet');
    const when      = lastMsg.created_at || lastMsg.createdAt
      ? timeAgo(lastMsg.created_at || lastMsg.createdAt)
      : '';
    const unread    = t.unread_count || t.unreadCount || 0;
    const threadId  = t.thread_id || t.threadId || t.id;
    const isActive  = String(threadId) === String(activeThreadId);

    return `
      <div class="chat-thread-item${isActive ? ' active' : ''}" data-thread-id="${escapeHtml(threadId)}" role="button" tabindex="0" aria-label="Conversation with ${escapeHtml(other.name || other.full_name || '?')}">
        <div style="position:relative; flex-shrink:0;">
          ${thumb
            ? `<img src="${escapeHtml(thumb)}" alt="" style="width:48px; height:48px; border-radius: var(--radius-md); object-fit:cover; background: var(--color-surface-muted);">`
            : `<div style="width:48px; height:48px; border-radius: var(--radius-md); background: var(--color-surface-muted); display:flex; align-items:center; justify-content:center; font-size:var(--text-xs); color:var(--color-text-subtle);">IMG</div>`}
        </div>
        <div class="chat-thread-info">
          <div style="display:flex; justify-content:space-between; align-items:baseline; gap: var(--space-2);">
            <span class="chat-thread-name${unread ? ' font-semibold' : ''}">${escapeHtml(other.name || other.full_name || '?')}</span>
            ${when ? `<span style="font-size:var(--text-xs); color:var(--color-text-subtle); white-space:nowrap; flex-shrink:0;">${escapeHtml(when)}</span>` : ''}
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; gap: var(--space-2); margin-top:2px;">
            <div class="chat-thread-preview${unread ? ' font-medium' : ''}" style="${unread ? 'color:var(--color-text);' : ''}">${escapeHtml(preview)}</div>
            ${unread ? `<span class="unread-badge" style="flex-shrink:0;">${unread > 99 ? '99+' : unread}</span>` : ''}
          </div>
          <div style="font-size:var(--text-xs); color:var(--color-text-subtle); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(listing.title || '')}</div>
        </div>
      </div>
    `;
  }).join('');

  // Wire click + keyboard
  listEl.querySelectorAll('.chat-thread-item').forEach(item => {
    const open = () => openThread(item.dataset.threadId);
    item.addEventListener('click', open);
    item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') open(); });
  });
}

function getOtherParty(thread, me) {
  if (!me) return thread.other_user || {};
  const buyer  = thread.buyer  || {};
  const seller = thread.seller || {};
  const myId = me.id || me.user_id;
  const buyerId = buyer.id || buyer.user_id || thread.buyer_id;
  const sellerId = seller.id || seller.user_id || thread.seller_id;
  if (String(buyerId) === String(myId)) {
    return seller.id || seller.user_id ? seller : { user_id: sellerId, name: `User #${sellerId}` };
  }
  return buyer.id || buyer.user_id ? buyer : { user_id: buyerId, name: `User #${buyerId}` };
}

// ── Thread search filter ──────────────────────────────────────────
function wireThreadSearch() {
  document.getElementById('threadSearch').addEventListener('input', debounce(e => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) { renderThreadList(threads); return; }
    const me       = auth.getUser();
    const filtered = threads.filter(t => {
      const other   = getOtherParty(t, me);
      const name    = (other.name || other.full_name || '').toLowerCase();
      const listing = (t.listing?.title || '').toLowerCase();
      return name.includes(q) || listing.includes(q);
    });
    renderThreadList(filtered);
  }, 200));
}

// ── Open thread / chat window ─────────────────────────────────────
async function openThread(threadId, context = {}) {
  stopPoll();
  activeThreadId = String(threadId);
  activeContext = { ...activeContext, ...context };
  messages       = [];
  lastMsgTime    = null;

  const layout = document.getElementById('chatLayout');
  const window_ = document.getElementById('chatWindow');
  const noChat  = document.getElementById('noChatSelected');

  layout.classList.add('thread-open');  // mobile: hide threads col, show window
  window_.style.display = 'flex';
  noChat.style.display  = 'none';

  // Mark active in thread list
  document.querySelectorAll('.chat-thread-item').forEach(el => {
    el.classList.toggle('active', el.dataset.threadId === activeThreadId);
  });

  // Clear messages area + show loading
  const container = document.getElementById('messagesContainer');
  container.innerHTML = '<p style="color:var(--color-text-subtle); text-align:center; padding: var(--space-8);">Loading…</p>';

  // Populate header from cached thread data
  const thread = threads.find(t => String(t.thread_id || t.threadId || t.id) === String(threadId));
  if (thread) populateChatHeader(thread);

  // Load full thread data if header incomplete
  try {
    const data = await api.chat.getThread(threadId);
    const fullThread = data.thread || data;
    populateChatHeader(fullThread);

    // Load messages
    const msgData = await api.chat.messages(threadId, { limit: 50 });
    messages  = Array.isArray(msgData) ? msgData : (msgData?.messages || []);
    lastMsgTime = getNewestTimestamp(messages);

    renderMessages(messages, true);
    markReadIfAtBottom();

    // Update thread list to clear unread badge
    await loadThreads();
    // Re-mark active (loadThreads re-renders)
    document.querySelectorAll('.chat-thread-item').forEach(el => {
      el.classList.toggle('active', el.dataset.threadId === activeThreadId);
    });

    startPoll();
  } catch (err) {
    container.innerHTML = `<p style="color:var(--color-danger); text-align:center; padding: var(--space-8);">${escapeHtml(err.message)}</p>`;
  }
}

function populateChatHeader(thread) {
  const me      = auth.getUser();
  const other   = getOtherParty(thread, me);
  const listing = thread.listing || {};
  const thumb   = imgUrl(listing.thumbnail || listing.images?.[0]?.url || listing.image_url);

  const nameEl    = document.getElementById('chatOtherName');
  const titleEl   = document.getElementById('chatListingTitle');
  const priceEl   = document.getElementById('chatListingPrice');
  const thumbEl   = document.getElementById('chatListingThumb');

  if (nameEl)  nameEl.textContent  = other.name || other.full_name || '?';
  if (titleEl) titleEl.textContent = listing.title || (thread.listing_id ? `Listing #${thread.listing_id}` : '');
  if (priceEl) priceEl.textContent = listing.price ? formatPrice(listing.price) : '';

  if (thumbEl) {
    if (thumb) {
      thumbEl.src           = thumb;
      thumbEl.style.display = '';
    } else {
      thumbEl.style.display = 'none';
    }
  }

  // Make other-party name clickable → profile
  if (nameEl && (other.id || other.user_id)) {
    nameEl.style.cursor = 'pointer';
    nameEl.onclick = () => navigate('profile', { id: other.id || other.user_id });
  }
  // Make listing title clickable
  const listingId = listing.id || listing.listing_id || thread.listing_id || activeContext.listingId;
  if (titleEl && listingId) {
    titleEl.style.cursor = 'pointer';
    titleEl.onclick = () => navigate('listingDetail', { id: listingId });
  }
}

// ── Message rendering ─────────────────────────────────────────────
function renderMessages(msgs, scrollToBottom) {
  const me        = auth.getUser();
  const container = document.getElementById('messagesContainer');

  if (!msgs.length) {
    container.innerHTML = '<p style="color:var(--color-text-subtle); text-align:center; padding: var(--space-8);">No messages yet. Say hi!</p>';
    return;
  }

  // Group by date
  const groups = groupByDate(msgs);
  const html   = groups.map(({ label, msgs: groupMsgs }) => `
    <div style="display:flex; align-items:center; gap: var(--space-3); margin: var(--space-3) 0;">
      <div style="flex:1; height:1px; background:var(--border-subtle);"></div>
      <span style="font-size:var(--text-xs); color:var(--color-text-subtle); white-space:nowrap;">${escapeHtml(label)}</span>
      <div style="flex:1; height:1px; background:var(--border-subtle);"></div>
    </div>
    ${groupMsgs.map(m => renderBubble(m, me)).join('')}
  `).join('');

  container.innerHTML = html;

  // Wire image lightbox
  container.querySelectorAll('.msg-img').forEach(img => {
    img.addEventListener('click', () => openLightbox(img.src));
  });

  if (scrollToBottom) scrollBottom();
}

function renderBubble(msg, me) {
  const isSent    = String(msg.sender_id || msg.senderId) === String(me?.id || me?.user_id);
  const isImage   = msg.message_type === 'image' || msg.type === 'image';
  const timeStr   = msg.created_at || msg.createdAt
    ? new Date(msg.created_at || msg.createdAt).toLocaleTimeString('en-PK', { hour:'2-digit', minute:'2-digit' })
    : '';

  const bubbleContent = isImage
    ? `<img class="msg-img" src="${escapeHtml(imgUrl(msg.content || msg.image_url))}" alt="Photo" style="max-width:220px; max-height:220px; border-radius: var(--radius-md); display:block; cursor:pointer; object-fit:cover;">`
    : `<div class="bubble ${isSent ? 'sent' : 'received'}">${escapeHtml(msg.content || '')}</div>`;

  return `
    <div class="bubble-wrap ${isSent ? 'sent' : 'received'}">
      ${bubbleContent}
      ${timeStr ? `<div class="bubble-time">${timeStr}</div>` : ''}
    </div>
  `;
}

function groupByDate(msgs) {
  const groups = [];
  let lastLabel = null;

  for (const m of msgs) {
    const d     = new Date(m.created_at || m.createdAt || Date.now());
    const label = dateLabel(d);
    if (label !== lastLabel) {
      groups.push({ label, msgs: [] });
      lastLabel = label;
    }
    groups[groups.length - 1].msgs.push(m);
  }
  return groups;
}

function dateLabel(d) {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day   = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff  = Math.floor((today - day) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: diff > 180 ? 'numeric' : undefined });
}

function getNewestTimestamp(msgs) {
  if (!msgs.length) return null;
  return msgs.reduce((latest, m) => {
    const t = m.created_at || m.createdAt;
    return !latest || t > latest ? t : latest;
  }, null);
}

// ── Append new messages (polling result) ─────────────────────────
function appendNewMessages(newMsgs) {
  if (!newMsgs.length) return;

  const me        = auth.getUser();
  const container = document.getElementById('messagesContainer');

  // If first load was empty state, re-render properly
  if (!messages.length) {
    messages = newMsgs;
    renderMessages(messages, true);
    return;
  }

  const wasAtBottom = isAtBottom(container);

  // Remove any date-group separators then append
  newMsgs.forEach(m => {
    messages.push(m);
    container.insertAdjacentHTML('beforeend', renderBubble(m, me));
  });

  // Wire new image lightboxes
  container.querySelectorAll('.msg-img:not([data-lb])').forEach(img => {
    img.dataset.lb = '1';
    img.addEventListener('click', () => openLightbox(img.src));
  });

  if (wasAtBottom) scrollBottom();
}

// ── Polling ───────────────────────────────────────────────────────
function startPoll() {
  if (pollTimer) return;
  pollTimer = setInterval(pollMessages, POLL_MS);
}

function stopPoll() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function pollMessages() {
  if (!activeThreadId || document.hidden) return;

  try {
    const params  = lastMsgTime ? { since: lastMsgTime, limit: 50 } : { limit: 50 };
    const data    = await api.chat.messages(activeThreadId, params);
    const newMsgs = Array.isArray(data) ? data : (data?.messages || []);

    if (newMsgs.length) {
      lastMsgTime = getNewestTimestamp(newMsgs);
      appendNewMessages(newMsgs);
      markReadIfAtBottom();

      // Refresh thread list unread counts
      loadThreads().then(() => {
        document.querySelectorAll('.chat-thread-item').forEach(el => {
          el.classList.toggle('active', el.dataset.threadId === activeThreadId);
        });
      });
    }
  } catch { /* swallow poll errors */ }
}

// ── Mark read ─────────────────────────────────────────────────────
function markReadIfAtBottom() {
  const container = document.getElementById('messagesContainer');
  if (isAtBottom(container) && activeThreadId) {
    api.chat.markRead(activeThreadId).catch(() => {});
  }
}

function isAtBottom(el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
}

function scrollBottom() {
  const container = document.getElementById('messagesContainer');
  container.scrollTop = container.scrollHeight;
}

// scroll → mark read wired in boot block after DOM ready

// ── Send message ──────────────────────────────────────────────────
function wireInput() {
  const input   = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');

  sendBtn.addEventListener('click', () => sendText());
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
  });
}

async function sendText() {
  if (isSending || !activeThreadId) return;

  const input   = document.getElementById('messageInput');
  const content = input.value.trim();
  if (!content) return;

  if (!checkRateLimit()) return;

  isSending        = true;
  input.disabled   = true;
  document.getElementById('sendBtn').disabled = true;

  try {
    const data = await api.chat.send(activeThreadId, { content });
    input.value = '';
    recordSend();

    // Optimistic: append immediately
    const msg = data.message || data;
    const newMsg = msg || { content, sender_id: auth.getUser()?.user_id || auth.getUser()?.id, created_at: new Date().toISOString() };
    lastMsgTime = newMsg.created_at || newMsg.createdAt || lastMsgTime;
    appendNewMessages([newMsg]);
  } catch (err) {
    toast.fromError(err);
  } finally {
    isSending      = false;
    input.disabled = false;
    document.getElementById('sendBtn').disabled = false;
    input.focus();
  }
}

// ── Image send ────────────────────────────────────────────────────
function wireImageUpload() {
  const fileInput = document.getElementById('imgUploadChat');
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file || !activeThreadId) { fileInput.value = ''; return; }

    toast.warning('Image chat is not enabled yet.', 'Send a text message for now.');
    fileInput.value = '';
  });
}

// ── Rate limit ────────────────────────────────────────────────────
function checkRateLimit() {
  const now    = Date.now();
  sendTimestamps = sendTimestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
  if (sendTimestamps.length >= RATE_LIMIT_MAX) {
    toast.warning('Slow down', 'You\'re sending messages too fast. Wait a moment.');
    // Disable send briefly
    const sendBtn = document.getElementById('sendBtn');
    sendBtn.disabled = true;
    setTimeout(() => { sendBtn.disabled = false; }, 5000);
    return false;
  }
  return true;
}

function recordSend() {
  sendTimestamps.push(Date.now());
}

// ── Nav unread badge ──────────────────────────────────────────────
function startUnreadPoll() {
  updateUnreadBadge();
  unreadTimer = setInterval(updateUnreadBadge, UNREAD_POLL_MS);
}

async function updateUnreadBadge() {
  try {
    const data  = await api.notifications.unreadCount();
    const count = data?.count ?? data?.unread_count ?? (typeof data === 'number' ? data : 0);
    setUnreadBadge(count);
  } catch { /* non-critical */ }
}

function setUnreadBadge(count) {
  // Find or create badge on chat nav link
  let badge = document.getElementById('navUnreadBadge');
  const chatNavLinks = document.querySelectorAll('a[href*="chat.html"]');
  if (!chatNavLinks.length) return;

  if (!badge) {
    badge    = document.createElement('span');
    badge.id = 'navUnreadBadge';
    badge.className = 'unread-badge';
    badge.style.cssText = 'margin-left: 4px; vertical-align: middle;';
    chatNavLinks[0].appendChild(badge);
  }

  if (count > 0) {
    badge.textContent   = count > 99 ? '99+' : String(count);
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

// ── Back button (mobile) ──────────────────────────────────────────
function wireBackButton() {
  const backBtn = document.getElementById('backToThreads');
  if (!backBtn) return;

  // Show back button on mobile
  const mq = window.matchMedia('(max-width: 768px)');
  function updateBackBtn() {
    backBtn.style.display = mq.matches ? '' : 'none';
  }
  updateBackBtn();
  mq.addEventListener('change', updateBackBtn);

  backBtn.addEventListener('click', () => {
    stopPoll();
    activeThreadId = null;
    document.getElementById('chatLayout').classList.remove('thread-open');
    document.getElementById('chatWindow').style.display = 'none';
    document.getElementById('noChatSelected').style.display = '';
    document.querySelectorAll('.chat-thread-item').forEach(el => el.classList.remove('active'));
    // Reload threads to refresh unread counts
    loadThreads();
  });
}

// ── Lightbox ──────────────────────────────────────────────────────
function openLightbox(src) {
  const lb = document.createElement('div');
  lb.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.88); z-index:2000; display:flex; align-items:center; justify-content:center; cursor:zoom-out;';

  const img      = document.createElement('img');
  img.src        = src;
  img.alt        = 'Photo';
  img.style.cssText = 'max-width:90vw; max-height:90vh; border-radius: var(--radius-lg); object-fit:contain; box-shadow: var(--shadow-modal);';

  lb.appendChild(img);
  document.body.appendChild(lb);

  const close = () => lb.remove();
  lb.addEventListener('click', close);
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
  });
}
