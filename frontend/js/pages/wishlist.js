/**
 * wishlist.js — Saved listings grid page controller.
 * Loads the user's wishlist and renders the same card component used on the home page.
 * "Remove" button on each card via event delegation.
 */

let currentPage = 1;
const PAGE_SIZE = 20;
let totalItems  = 0;

// ── Boot ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initRouter();
  if (!auth.requireAuth()) return;
  await loadWishlist();
});

// ── Load + render ─────────────────────────────────────────────────
async function loadWishlist() {
  const grid    = document.getElementById('wishlistGrid');
  const pagBar  = document.getElementById('paginationBar');
  showSkeletons(grid, 8);

  try {
    const data     = await api.wishlist.list();
    const items    = Array.isArray(data) ? data : (data?.items || data?.listings || []);
    totalItems     = data?.total ?? items.length;

    if (!items.length) {
      showEmptyState(grid, {
        title: 'No saved listings',
        desc:  'Tap the heart icon on any listing to save it here.',
        cta:   { href: '/index.html', label: 'Browse listings' },
      });
      if (pagBar) pagBar.innerHTML = '';
      return;
    }

    grid.innerHTML = items.map(renderCard).join('');
    wireCardActions(items);
    if (pagBar) renderPagination(pagBar, totalItems);
  } catch (err) {
    grid.innerHTML = '';
    toast.error('Error', err.message || 'Could not load saved listings.');
  }
}

// ── Card ──────────────────────────────────────────────────────────
function renderCard(item) {
  // API may return { listing: {...} } or the listing directly
  const l     = item.listing || item;
  const thumb = imgUrl(l.images?.[0]?.url || l.image_url);

  return `
    <div class="card" style="cursor:pointer; position:relative;" data-listing-id="${l.id}">
      <div class="card-img-wrap">
        ${thumb
          ? `<img class="card-image" src="${escapeHtml(thumb)}" alt="${escapeHtml(l.title)}" loading="lazy">`
          : `<div class="card-img-fallback"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`
        }
        <button class="save-btn is-saved wishlist-remove" data-listing-id="${l.id}" title="Remove from saved" aria-label="Remove from saved">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.8"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
      </div>
      <div class="card-body">
        <div class="card-title">${escapeHtml(l.title)}</div>
        <div class="card-price-row">
          <span class="card-price">${formatPrice(l.price)}</span>
          ${l.is_negotiable ? '<span class="tag-negotiable">· Negotiable</span>' : ''}
        </div>
        <div class="card-meta">
          <span>${escapeHtml(l.condition || '')}</span>
          ${l.condition ? '<span class="card-meta-sep">·</span>' : ''}
          <span>${timeAgo(l.created_at)}</span>
        </div>
      </div>
    </div>
  `;
}

// ── Actions ───────────────────────────────────────────────────────
function wireCardActions(items) {
  const grid = document.getElementById('wishlistGrid');
  if (!grid) return;

  // Navigate to listing on card click (except remove button)
  grid.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.wishlist-remove');
    if (removeBtn) {
      e.stopPropagation();
      handleRemove(removeBtn);
      return;
    }
    const card = e.target.closest('.card[data-listing-id]');
    if (card) navigate('listingDetail', { id: card.dataset.listingId });
  });
}

async function handleRemove(btn) {
  const listingId = btn.dataset.listingId;
  btn.disabled    = true;

  try {
    await api.wishlist.remove(listingId);
    toast.success('Removed', 'Listing removed from saved.');
    // Remove card from DOM directly — no full reload
    const card = document.querySelector(`.card[data-listing-id="${listingId}"]`);
    if (card) {
      card.style.opacity    = '0';
      card.style.transition = 'opacity 0.2s';
      setTimeout(() => {
        card.remove();
        totalItems--;
        // Show empty state if nothing left
        const grid = document.getElementById('wishlistGrid');
        if (grid && !grid.querySelector('.card')) {
          showEmptyState(grid, {
            title: 'No saved listings',
            desc:  'Tap the heart icon on any listing to save it here.',
            cta:   { href: '/index.html', label: 'Browse listings' },
          });
        }
      }, 220);
    }
  } catch (err) {
    btn.disabled = false;
    toast.error('Error', err.message || 'Could not remove listing.');
  }
}

// ── Pagination ────────────────────────────────────────────────────
function renderPagination(bar, total) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) { bar.innerHTML = ''; return; }

  bar.innerHTML = `
    <button class="pagination-btn" id="prevPage" ${currentPage === 1 ? 'disabled' : ''}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    <span style="font-size: var(--text-sm); color: var(--color-text-muted);">Page ${currentPage} of ${pages}</span>
    <button class="pagination-btn" id="nextPage" ${currentPage >= pages ? 'disabled' : ''}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
  `;

  bar.querySelector('#prevPage')?.addEventListener('click', async () => {
    if (currentPage > 1) { currentPage--; await loadWishlist(); }
  });
  bar.querySelector('#nextPage')?.addEventListener('click', async () => {
    if (currentPage < pages) { currentPage++; await loadWishlist(); }
  });
}
