/**
 * my-offers.js — Sent/Received offers controller.
 * Sent tab: offers I made with status badge, cancel if pending.
 * Received tab: offers on my listings, Accept/Reject/Counter per pending offer.
 * Counter opens modal → POST /offers/:id/counter.
 */

let activeTab     = 'sent';
let pendingOffer  = null; // offer id awaiting counter submit

// ── Boot ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initRouter();
  if (!auth.requireAuth()) return;

  wireTabs();
  wireCounterModal();
  await loadOffers('sent');
});

// ── Tab switching ─────────────────────────────────────────────────
function wireTabs() {
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.dataset.tab === activeTab) return;
      activeTab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn[data-tab]').forEach(b => {
        const isActive = b.dataset.tab === activeTab;
        b.style.color        = isActive ? 'var(--color-primary)' : 'var(--color-text-muted)';
        b.style.borderBottom = isActive ? '2px solid var(--color-primary)' : '2px solid transparent';
      });
      await loadOffers(activeTab);
    });
  });
}

// ── Load offers ───────────────────────────────────────────────────
async function loadOffers(tab) {
  const list = document.getElementById('offerList');
  list.innerHTML = '<p style="color:var(--color-text-subtle);">Loading…</p>';

  try {
    const data = tab === 'sent'
      ? await api.offers.sent()
      : await api.offers.received();

    const offers = Array.isArray(data) ? data : (data?.offers || []);

    if (!offers.length) {
      showEmptyState(list, {
        title: tab === 'sent' ? 'No offers sent yet' : 'No offers received yet',
        desc:  tab === 'sent' ? 'Make an offer on a listing to see it here.' : 'When buyers offer on your listings, they appear here.',
      });
      return;
    }

    list.innerHTML = offers.map(o => renderOfferItem(o, tab)).join('');
    wireOfferActions(offers, tab);
  } catch (err) {
    list.innerHTML = `<p style="color:var(--color-danger);">${escapeHtml(err.message)}</p>`;
  }
}

// ── Render offer row ──────────────────────────────────────────────
function renderOfferItem(offer, tab) {
  const listing   = offer.listing || {};
  const thumb     = imgUrl(listing.thumbnail || listing.images?.[0]?.url || listing.image_url);
  const title     = listing.title || 'Listing';
  const listingId = offer.listing_id || listing.id;
  const status    = offer.status || 'pending';

  const otherParty = tab === 'sent'
    ? (offer.seller || offer.listing?.seller || {})
    : (offer.buyer  || {});
  const partyName = otherParty.name || otherParty.full_name || '—';

  const badge = statusBadge(status);

  const actionButtons = buildActionButtons(offer, tab);

  return `
    <div class="offer-item" data-offer-id="${offer.id}">
      ${thumb
        ? `<img class="offer-thumb" src="${escapeHtml(thumb)}" alt="${escapeHtml(title)}" loading="lazy">`
        : `<div class="offer-thumb" style="background:var(--color-surface-muted);"></div>`}
      <div style="flex:1; min-width:0;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap: var(--space-2); flex-wrap:wrap;">
          <a href="/pages/listing-detail.html?id=${listingId}" style="font-weight:600; color:var(--color-text); text-decoration:none; font-size:var(--text-base); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:280px;" title="${escapeHtml(title)}">${escapeHtml(title)}</a>
          ${badge}
        </div>
        <div style="margin-top: var(--space-1); font-size:var(--text-sm); color:var(--color-text-muted);">
          ${tab === 'sent' ? 'Seller' : 'Buyer'}: <strong>${escapeHtml(partyName)}</strong>
        </div>
        <div style="margin-top: var(--space-1); font-size:var(--text-sm);">
          Offered: <strong style="color:var(--color-primary);">${formatPrice(offer.amount)}</strong>
          ${offer.listing_price ? ` <span style="color:var(--color-text-subtle);">(Listed: ${formatPrice(offer.listing_price)})</span>` : ''}
        </div>
        ${offer.message ? `<div style="margin-top: var(--space-1); font-size:var(--text-sm); color:var(--color-text-muted);">"${escapeHtml(offer.message)}"</div>` : ''}
        <div style="margin-top: var(--space-1); font-size:var(--text-xs); color:var(--color-text-subtle);">${timeAgo(offer.created_at || offer.createdAt)}</div>
        <div class="offer-actions">${actionButtons}</div>
      </div>
    </div>
  `;
}

function statusBadge(status) {
  const map = {
    pending:   ['var(--color-warning, #d97706)',  'var(--color-warning-bg, #fffbeb)',  'Pending'],
    accepted:  ['var(--color-success, #16a34a)',  'var(--color-success-bg, #f0fdf4)',  'Accepted'],
    rejected:  ['var(--color-danger)',    'rgba(220,38,38,0.1)',               'Rejected'],
    cancelled: ['var(--color-text-subtle)',       'var(--color-surface-muted)',         'Cancelled'],
    countered: ['var(--color-primary)',           'var(--color-primary-light, rgba(20,184,166,0.12))', 'Countered'],
    expired:   ['var(--color-text-subtle)',       'var(--color-surface-muted)',         'Expired'],
  };
  const [color, bg, label] = map[status] || ['var(--color-text-subtle)', 'var(--color-surface-muted)', status];
  return `<span style="font-size:var(--text-xs); font-weight:600; padding: 2px 8px; border-radius: var(--radius-full); background:${bg}; color:${color}; white-space:nowrap;">${escapeHtml(label)}</span>`;
}

function buildActionButtons(offer, tab) {
  if (offer.status !== 'pending') return '';

  const btns = [];
  if (tab === 'sent') {
    btns.push(`<button class="btn btn-ghost btn-sm offer-cancel" data-id="${offer.id}">Cancel</button>`);
  } else {
    btns.push(`<button class="btn btn-primary btn-sm offer-accept" data-id="${offer.id}">Accept</button>`);
    btns.push(`<button class="btn btn-ghost btn-sm offer-reject" data-id="${offer.id}">Reject</button>`);
    btns.push(`<button class="btn btn-ghost btn-sm offer-counter" data-id="${offer.id}">Counter</button>`);
  }
  return btns.join('');
}

// ── Action wiring ─────────────────────────────────────────────────
// No { once: true } — list innerHTML is fully replaced on each loadOffers(),
// so the old node (and its listeners) is garbage-collected automatically.
// We wire directly on each button to avoid stale delegation.
function wireOfferActions(offers, tab) {
  const list = document.getElementById('offerList');

  list.querySelectorAll('.offer-accept').forEach(btn => {
    btn.addEventListener('click', () => handleAction(btn, 'accept'));
  });
  list.querySelectorAll('.offer-reject').forEach(btn => {
    btn.addEventListener('click', () => handleAction(btn, 'reject'));
  });
  list.querySelectorAll('.offer-cancel').forEach(btn => {
    btn.addEventListener('click', () => handleAction(btn, 'cancel'));
  });
  list.querySelectorAll('.offer-counter').forEach(btn => {
    btn.addEventListener('click', () => openCounterModal(btn.dataset.id));
  });
}

async function handleAction(btn, action) {
  const offerId = btn.dataset.id;
  btn.disabled = true;
  const orig   = btn.textContent;
  btn.textContent = '…';

  try {
    if (action === 'accept') await api.offers.accept(offerId);
    if (action === 'reject') await api.offers.reject(offerId);
    if (action === 'cancel') await api.offers.cancel(offerId);
    toast.success(action === 'accept' ? 'Offer accepted!' : action === 'reject' ? 'Offer rejected.' : 'Offer cancelled.');
    await loadOffers(activeTab);
  } catch (err) {
    btn.disabled    = false;
    btn.textContent = orig;
    toast.fromError(err);
  }
}

// ── Counter modal ─────────────────────────────────────────────────
function openCounterModal(offerId) {
  pendingOffer = offerId;
  document.getElementById('counterAmount').value = '';
  document.getElementById('counterError').style.display = 'none';
  document.getElementById('counterModal').style.display = '';
  document.getElementById('counterAmount').focus();
}

function closeCounterModal() {
  document.getElementById('counterModal').style.display = 'none';
  pendingOffer = null;
}

function wireCounterModal() {
  document.getElementById('closeCounterModal').addEventListener('click',  closeCounterModal);
  document.getElementById('counterCancelBtn').addEventListener('click',   closeCounterModal);
  document.getElementById('counterModal').addEventListener('click', e => {
    if (e.target === document.getElementById('counterModal')) closeCounterModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('counterModal').style.display !== 'none') closeCounterModal();
  });

  document.getElementById('counterSubmitBtn').addEventListener('click', async () => {
    const errEl  = document.getElementById('counterError');
    const amount = parseInt(document.getElementById('counterAmount').value, 10);

    if (isNaN(amount) || amount < 1) {
      errEl.textContent   = 'Enter a valid amount.';
      errEl.style.display = '';
      return;
    }
    errEl.style.display = 'none';

    const submitBtn      = document.getElementById('counterSubmitBtn');
    submitBtn.disabled   = true;
    submitBtn.textContent = '…';

    try {
      await api.offers.counter(pendingOffer, { amount });
      toast.success('Counter sent!');
      closeCounterModal();
      await loadOffers(activeTab);
    } catch (err) {
      errEl.textContent   = err.message || 'Failed to send counter.';
      errEl.style.display = '';
      submitBtn.disabled   = false;
      submitBtn.textContent = 'Send counter';
    }
  });
}
