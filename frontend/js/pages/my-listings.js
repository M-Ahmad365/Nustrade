/**
 * my-listings.js — My Listings page controller.
 * Tabs: Active | Sold | Expired.
 * Each card: thumbnail, title, price, views, posted date, status badge.
 * Actions per listing: Edit, Delete (confirm), Boost (active only).
 */

let activeStatus  = 'active';
let currentPage   = 1;
const PAGE_SIZE   = 12;

// ── Boot ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initRouter();
  if (!auth.requireAuth()) return;

  wireTabs();
  await loadListings();
});

// ── Tab wiring ────────────────────────────────────────────────────
function wireTabs() {
  document.querySelectorAll('.tab-btn[data-status]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.dataset.status === activeStatus) return;
      activeStatus = btn.dataset.status;
      currentPage  = 1;

      document.querySelectorAll('.tab-btn[data-status]').forEach(b => {
        const on = b.dataset.status === activeStatus;
        b.style.color        = on ? 'var(--color-primary)' : 'var(--color-text-muted)';
        b.style.borderBottom = on ? '2px solid var(--color-primary)' : '2px solid transparent';
      });

      await loadListings();
    });
  });
}

// ── Load + render ─────────────────────────────────────────────────
async function loadListings() {
  const grid = document.getElementById('myListingsGrid');
  showSkeletons(grid, 6);

  try {
    const me   = auth.getUser();
    const data = await api.users.getUserListings(me.user_id, {
      status: activeStatus,
      page:   currentPage,
      limit:  PAGE_SIZE,
    });

    const listings = Array.isArray(data) ? data : (data?.listings || []);
    const total    = data?.total ?? listings.length;

    if (!listings.length) {
      showEmptyState(grid, {
        title: activeStatus === 'active' ? 'No active listings' : `No ${activeStatus} listings`,
        desc:  activeStatus === 'active' ? 'Post something to get started.' : '',
        cta:   activeStatus === 'active' ? { href: '/pages/create-listing.html', label: 'Post listing' } : null,
      });
      document.getElementById('paginationBar').innerHTML = '';
      return;
    }

    grid.innerHTML = listings.map(l => renderCard(l)).join('');
    wireCardActions(listings);
    renderPagination(total);
  } catch (err) {
    grid.innerHTML = `<p style="color:var(--color-danger); padding: var(--space-4);">${escapeHtml(err.message)}</p>`;
  }
}

// ── Render listing card ───────────────────────────────────────────
function renderCard(listing) {
  const id     = listing.listing_id || listing.id;
  const thumb  = imgUrl(listing.thumbnail_url || listing.thumbnail || listing.images?.[0]?.url || listing.image_url);
  const price  = formatPrice(listing.price);
  const views  = listing.view_count ?? listing.views ?? 0;
  const posted = timeAgo(listing.posted_at || listing.created_at || listing.createdAt);
  const status = listing.status || activeStatus;

  return `
    <article class="card" data-id="${escapeHtml(id)}">
      <a href="/pages/listing-detail.html?id=${encodeURIComponent(id)}" style="text-decoration:none; color:inherit;">
        <div class="card-img-wrap">
          ${thumb
            ? `<img class="card-image" src="${escapeHtml(thumb)}" alt="${escapeHtml(listing.title)}" loading="lazy">`
            : `<div class="card-img-fallback"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`}
          ${statusBadge(status)}
        </div>
        <div class="card-body">
          <h3 class="card-title">${escapeHtml(truncate(listing.title, 60))}</h3>
          <div class="card-price-row">
            <span class="card-price">${price}</span>
          </div>
          <div class="card-meta">
            <span>${views} view${views !== 1 ? 's' : ''}</span>
            <span class="card-meta-sep">·</span>
            <span>${posted}</span>
          </div>
        </div>
      </a>
      <div class="card-cta">
        ${status === 'active' ? `<button class="btn btn-ghost btn-sm listing-boost" data-id="${escapeHtml(id)}" title="Boost to top">Boost</button>` : ''}
        <a href="/pages/edit-listing.html?id=${encodeURIComponent(id)}" class="btn btn-ghost btn-sm">Edit</a>
        <button class="btn btn-ghost btn-sm listing-delete" data-id="${escapeHtml(id)}" style="color:var(--color-danger);">Delete</button>
      </div>
    </article>
  `;
}

function statusBadge(status) {
  if (status === 'active') return '';
  const map = {
    sold:    ['var(--color-success, #16a34a)', 'Sold'],
    expired: ['var(--color-text-subtle)',      'Expired'],
    pending: ['var(--color-warning, #d97706)', 'Pending'],
  };
  const [color, label] = map[status] || ['var(--color-text-subtle)', status];
  return `<span style="position:absolute; top: var(--space-2); left: var(--space-2); font-size:var(--text-xs); font-weight:600; padding: 2px 8px; border-radius: var(--radius-full); background:rgba(0,0,0,0.55); color:white;">${escapeHtml(label)}</span>`;
}

// ── Wire card buttons ─────────────────────────────────────────────
function wireCardActions(listings) {
  const grid = document.getElementById('myListingsGrid');

  grid.addEventListener('click', async e => {
    const deleteBtn = e.target.closest('.listing-delete');
    const boostBtn  = e.target.closest('.listing-boost');

    if (deleteBtn) {
      e.preventDefault();
      await handleDelete(deleteBtn.dataset.id);
    }
    if (boostBtn) {
      e.preventDefault();
      await handleBoost(boostBtn.dataset.id, boostBtn);
    }
  }, { once: true });
}

async function handleDelete(listingId) {
  if (!confirm('Delete this listing? This cannot be undone.')) return;

  try {
    await api.listings.delete(listingId);
    toast.success('Listing deleted.');
    await loadListings();
  } catch (err) {
    toast.fromError(err);
  }
}

async function handleBoost(listingId, btn) {
  btn.disabled    = true;
  btn.textContent = '…';
  try {
    await api.listings.boost(listingId);
    toast.success('Boosted!', 'Listing moved to top.');
    btn.textContent = 'Boosted';
  } catch (err) {
    btn.disabled    = false;
    btn.textContent = 'Boost';
    toast.fromError(err);
  }
}

// ── Pagination ────────────────────────────────────────────────────
function renderPagination(total) {
  const bar   = document.getElementById('paginationBar');
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) { bar.innerHTML = ''; return; }

  let html = '';
  if (currentPage > 1)    html += `<button class="btn btn-ghost btn-sm" data-pg="${currentPage - 1}">← Prev</button>`;
  html += `<span style="font-size:var(--text-sm); color:var(--color-text-muted);">Page ${currentPage} of ${pages}</span>`;
  if (currentPage < pages) html += `<button class="btn btn-ghost btn-sm" data-pg="${currentPage + 1}">Next →</button>`;

  bar.innerHTML = html;
  bar.querySelectorAll('[data-pg]').forEach(btn => {
    btn.addEventListener('click', async () => {
      currentPage = Number(btn.dataset.pg);
      await loadListings();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}
