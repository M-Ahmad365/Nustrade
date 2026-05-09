/**
 * notifications.js — Notifications list page controller.
 * Groups by Today / Yesterday / Last week / Older.
 * Click → mark read + navigate to linked resource.
 * "Mark all read" button clears all unread dots.
 */

let notifications = [];
let isLoading     = false;
let page          = 1;
const PAGE_SIZE   = 50;

// ── Boot ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initRouter();
  if (!auth.requireAuth()) return;

  document.getElementById('markAllReadBtn')?.addEventListener('click', handleMarkAllRead);
  await loadNotifications();
});

// ── Load ──────────────────────────────────────────────────────────
async function loadNotifications() {
  if (isLoading) return;
  isLoading = true;

  const container = document.getElementById('notificationsList');
  container.innerHTML = '<p style="color: var(--color-text-subtle); padding: var(--space-6) 0;">Loading…</p>';

  try {
    const data     = await api.notifications.list({ page, limit: PAGE_SIZE });
    notifications  = Array.isArray(data) ? data : (data?.notifications || []);
    renderList();
  } catch (err) {
    container.innerHTML = `<p style="color:var(--color-text-muted); padding: var(--space-6) 0;">${escapeHtml(err.message || 'Could not load notifications.')}</p>`;
  } finally {
    isLoading = false;
  }
}

// ── Render ────────────────────────────────────────────────────────
function renderList() {
  const container = document.getElementById('notificationsList');
  const markBtn   = document.getElementById('markAllReadBtn');

  if (!notifications.length) {
    showEmptyState(container, {
      title: 'All caught up',
      desc:  'No notifications yet. Activity on your listings will appear here.',
    });
    if (markBtn) markBtn.style.display = 'none';
    return;
  }

  const hasUnread = notifications.some(n => !n.read_at && !n.is_read);
  if (markBtn) markBtn.style.display = hasUnread ? '' : 'none';

  const groups  = groupByDay(notifications);
  const html    = Object.entries(groups).map(([label, items]) => `
    <div style="margin-bottom: var(--space-6);">
      <p style="font-size: var(--text-sm); font-weight:600; color: var(--color-text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom: var(--space-3);">${escapeHtml(label)}</p>
      <div style="display:flex; flex-direction:column; gap: var(--space-1);">
        ${items.map(renderItem).join('')}
      </div>
    </div>
  `).join('');

  container.innerHTML = html;

  // Event delegation for click → mark read + navigate
  container.addEventListener('click', async (e) => {
    const item = e.target.closest('.notif-item[data-id]');
    if (!item) return;

    const notifId  = item.dataset.id;
    const navTarget = item.dataset.nav;
    const navParams = item.dataset.params ? JSON.parse(item.dataset.params) : undefined;

    // Mark unread dot gone immediately
    item.querySelector('.notif-unread-dot')?.remove();
    item.style.background = '';

    try {
      await api.notifications.markRead(notifId);
      const n = notifications.find(n => String(n.id) === String(notifId));
      if (n) n.is_read = true;
    } catch { /* non-critical */ }

    if (navTarget) navigate(navTarget, navParams);
  });
}

function renderItem(n) {
  const isUnread = !n.is_read && !n.read_at;
  const nav      = buildNavTarget(n);

  return `
    <div
      class="notif-item"
      data-id="${n.id}"
      ${nav.page ? `data-nav="${escapeHtml(nav.page)}"` : ''}
      ${nav.params ? `data-params='${JSON.stringify(nav.params)}'` : ''}
      style="
        display:flex; align-items:center; gap: var(--space-4);
        padding: var(--space-4);
        background: ${isUnread ? 'var(--color-primary-light)' : 'var(--color-surface)'};
        border: 1px solid ${isUnread ? 'var(--border-primary)' : 'var(--border-subtle)'};
        border-radius: var(--radius-lg);
        cursor: ${nav.page ? 'pointer' : 'default'};
        transition: box-shadow var(--duration-base) var(--ease-out);
      "
      onmouseenter="if(this.dataset.nav) this.style.boxShadow='var(--shadow-raised)'"
      onmouseleave="this.style.boxShadow=''"
    >
      <div style="width:40px; height:40px; border-radius:50%; background: var(--color-surface-muted); display:flex; align-items:center; justify-content:center; flex-shrink:0; color: var(--color-primary);">
        ${notifIcon(n.type)}
      </div>
      <div style="flex:1; min-width:0;">
        <p style="font-size: var(--text-sm); font-weight:${isUnread ? '600' : '400'}; color: var(--color-text); line-height:1.4; margin-bottom:2px;">
          ${escapeHtml(n.message || n.body || '')}
        </p>
        <p style="font-size: var(--text-xs); color: var(--color-text-subtle);">${timeAgo(n.created_at)}</p>
      </div>
      ${isUnread ? '<div class="notif-unread-dot" style="width:8px; height:8px; border-radius:50%; background: var(--color-primary); flex-shrink:0;"></div>' : ''}
    </div>
  `;
}

// ── Mark all read ─────────────────────────────────────────────────
async function handleMarkAllRead() {
  const btn = document.getElementById('markAllReadBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Marking…'; }

  try {
    await api.notifications.markAllRead();
    notifications.forEach(n => { n.is_read = true; });
    renderList();
    toast.success('Done', 'All notifications marked as read.');
  } catch (err) {
    toast.error('Error', err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Mark all read'; }
  }
}

// ── Group by day ──────────────────────────────────────────────────
function groupByDay(items) {
  const now       = Date.now();
  const DAY       = 86400_000;
  const groups    = {};

  items.forEach(n => {
    const diff  = now - new Date(n.created_at).getTime();
    let label;
    if (diff < DAY)          label = 'Today';
    else if (diff < 2 * DAY) label = 'Yesterday';
    else if (diff < 7 * DAY) label = 'Last week';
    else                     label = 'Older';

    if (!groups[label]) groups[label] = [];
    groups[label].push(n);
  });

  // Maintain natural display order
  const ORDER = ['Today', 'Yesterday', 'Last week', 'Older'];
  const sorted = {};
  ORDER.forEach(k => { if (groups[k]) sorted[k] = groups[k]; });
  return sorted;
}

// ── Navigation targets per notification type ──────────────────────
function buildNavTarget(n) {
  const meta = n.meta || n.metadata || {};
  switch (n.type) {
    case 'new_offer':
    case 'offer_accepted':
    case 'offer_rejected':
    case 'offer_countered':
      return { page: 'myOffers' };

    case 'new_message':
      return meta.thread_id
        ? { page: 'chat', params: { thread: meta.thread_id } }
        : { page: 'chat' };

    case 'transaction_confirmed':
    case 'transaction_cancelled':
    case 'review_received':
      return { page: 'transactions' };

    case 'listing_boosted':
    case 'listing_expired':
      return meta.listing_id
        ? { page: 'listingDetail', params: { id: meta.listing_id } }
        : { page: 'myListings' };

    default:
      return {};
  }
}

// ── Icons per notification type ───────────────────────────────────
function notifIcon(type) {
  switch (type) {
    case 'new_offer':
    case 'offer_accepted':
    case 'offer_rejected':
    case 'offer_countered':
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M12 6v6l4 2"/></svg>`;

    case 'new_message':
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

    case 'transaction_confirmed':
    case 'transaction_cancelled':
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

    case 'review_received':
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

    case 'listing_boosted':
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`;

    default:
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
  }
}
