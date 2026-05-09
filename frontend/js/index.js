/**
 * index.js — Home / listings feed page controller.
 * Handles: nav auth state, category chips, trending section,
 * listings grid with infinite scroll, filter sidebar / mobile sheet.
 */

document.addEventListener('DOMContentLoaded', async () => {
  initRouter();
  // Home page is public — listings visible without login
  initNavState();
  await loadCategories();
  await Promise.all([loadTrending(), loadListings()]);
  initFilters();
  initSearch();
  initInfiniteScroll();
});

// ── Nav auth state ─────────────────────────────────────────────────

function initNavState() {
  const user        = auth.getUser();
  const postBtn     = document.getElementById('postBtn');
  const authActions = document.getElementById('navAuthActions');
  const avatarBtn   = document.getElementById('navAvatarBtn');
  const initElem    = document.getElementById('navAvatarInitials');

  if (user) {
    if (postBtn)     postBtn.style.display = 'flex';
    if (authActions) authActions.style.display = 'none';
    if (avatarBtn) {
      avatarBtn.style.display = 'flex';
      avatarBtn.addEventListener('click', () => navigate('profile'));
    }
    if (initElem) initElem.textContent = initials(user.fullName || user.full_name || '?');
    pollUnreadCounts();
  } else {
    // Logged out — show Login + Signup, hide post/avatar
    if (postBtn)     postBtn.style.display = 'none';
    if (avatarBtn)   avatarBtn.style.display = 'none';
    if (authActions) {
      authActions.innerHTML = `
        <a href="/pages/login.html" class="btn btn-ghost btn-sm">Login</a>
        <a href="/pages/signup.html" class="btn btn-primary btn-sm">Sign up</a>
      `;
      authActions.style.display = '';
    }
  }
}

// ── Category chips ─────────────────────────────────────────────────

let activeCategory = '';

// 9 hardcoded categories matching seed data — used as fallback if API fails
const CATEGORIES = [
  { slug: 'books',             name: 'Books & Notes' },
  { slug: 'electronics',       name: 'Electronics' },
  { slug: 'furniture',         name: 'Furniture' },
  { slug: 'bikes',             name: 'Bikes & Cycles' },
  { slug: 'clothing',          name: 'Clothing' },
  { slug: 'stationery',        name: 'Stationery' },
  { slug: 'hostel_essentials', name: 'Hostel Essentials' },
  { slug: 'sports',            name: 'Sports' },
  { slug: 'other',             name: 'Other' },
];

async function loadCategories() {
  const bar = document.getElementById('categoryBar');
  if (!bar) return;

  let cats = CATEGORIES;
  try {
    const data = await api.categories.list();
    if ((data.categories || data || []).length > 0) {
      cats = data.categories || data;
    }
  } catch {
    // Fall back to hardcoded list
  }

  cats.forEach(cat => {
    const btn = document.createElement('button');
    btn.className        = 'category-chip';
    btn.dataset.category = cat.slug || cat.id || cat.name;
    btn.textContent      = cat.name;
    bar.appendChild(btn);
  });

  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-category]');
    if (!btn) return;
    activeCategory = btn.dataset.category;
    bar.querySelectorAll('[data-category]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    resetFeed();
  });
}

// ── Trending ───────────────────────────────────────────────────────

async function loadTrending() {
  const grid = document.getElementById('trendingGrid');
  if (!grid) return;
  showSkeletons(grid, 4);

  try {
    const data     = await api.listings.trending();
    const listings = data.listings || data || [];
    if (listings.length === 0) {
      document.getElementById('trendingSection').style.display = 'none';
      return;
    }
    grid.innerHTML = listings.slice(0, 4).map(renderCard).join('');
    attachCardEvents(grid);
  } catch {
    document.getElementById('trendingSection').style.display = 'none';
  }
}

// ── Listings feed (infinite scroll) ────────────────────────────────

let currentPage  = 1;
let isLoading    = false;
let hasMore      = true;
const PAGE_SIZE  = 16;

async function loadListings(page = 1, append = false) {
  if (isLoading) return;
  isLoading = true;

  const grid = document.getElementById('listingsGrid');
  if (!grid) { isLoading = false; return; }

  if (!append) {
    showSkeletons(grid, 8);
    document.getElementById('infiniteEnd').style.display    = 'none';
    document.getElementById('infiniteSpinner').style.display = 'none';
  } else {
    document.getElementById('infiniteSpinner').style.display = '';
  }

  const params = buildFilterParams(page);

  try {
    const data     = await api.listings.list(params);
    const listings = data.listings || data || [];
    const total    = data.total || listings.length;

    if (!append) {
      if (listings.length === 0) {
        showEmptyState(grid, {
          title: 'No listings found',
          desc:  'Try adjusting your filters or search term.',
          cta:   { href: '/index.html', label: 'Clear filters' },
        });
        hasMore = false;
      } else {
        grid.innerHTML = listings.map(renderCard).join('');
        attachCardEvents(grid);
      }
    } else {
      if (listings.length > 0) {
        const frag = document.createElement('div');
        frag.innerHTML = listings.map(renderCard).join('');
        // stagger new cards entering via infinite scroll
        Array.from(frag.children).forEach((el, i) => {
          el.classList.add('card-enter');
          el.style.animationDelay = `${i * 40}ms`;
        });
        while (frag.firstChild) grid.appendChild(frag.firstChild);
        attachCardEvents(grid);
      }
    }

    currentPage = page;
    hasMore     = listings.length === PAGE_SIZE && (page * PAGE_SIZE) < total;

    document.getElementById('infiniteSpinner').style.display = 'none';
    if (!hasMore && grid.children.length > 0 && !grid.querySelector('.empty-state')) {
      document.getElementById('infiniteEnd').style.display = '';
    }
  } catch (err) {
    document.getElementById('infiniteSpinner').style.display = 'none';
    if (!append) grid.innerHTML = '';
    if (err.status === 401) auth.handleUnauthorized();
    else toast.fromError(err);
  }

  isLoading = false;
}

/** Reset feed: clear grid, reset page counter, reload from page 1 */
function resetFeed() {
  currentPage = 1;
  hasMore     = true;
  isLoading   = false;
  document.getElementById('infiniteEnd').style.display    = 'none';
  document.getElementById('infiniteSpinner').style.display = 'none';
  loadListings(1, false);
}

// ── Infinite scroll ────────────────────────────────────────────────

function initInfiniteScroll() {
  const sentinel = document.getElementById('infiniteAnchor');
  if (!sentinel || !('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver((entries) => {
    const entry = entries[0];
    if (entry.isIntersecting && hasMore && !isLoading) {
      loadListings(currentPage + 1, true);
    }
  }, { rootMargin: '200px' });

  observer.observe(sentinel);
}

// ── Filters ────────────────────────────────────────────────────────

function buildFilterParams(page = currentPage) {
  const minPrice   = document.getElementById('filterMinPrice')?.value || '';
  const maxPrice   = document.getElementById('filterMaxPrice')?.value || '';
  const sort       = document.getElementById('filterSortSelect')?.value || 'newest';
  const hostel     = document.getElementById('filterHostelSelect')?.value || '';
  const dept       = document.getElementById('filterDeptSelect')?.value || '';
  const conditions = [...document.querySelectorAll('#filterCondition input:checked')].map(i => i.value);

  const params = { page, limit: PAGE_SIZE, sort };
  if (activeCategory) params.category    = activeCategory;
  if (minPrice)       params.min_price   = minPrice;
  if (maxPrice)       params.max_price   = maxPrice;
  if (conditions.length) params.condition = conditions.join(',');
  if (hostel)         params.location_hostel = hostel;
  if (dept)           params.department  = dept;

  return params;
}

function initFilters() {
  document.getElementById('applyFiltersBtn')?.addEventListener('click', () => resetFeed());
  document.getElementById('clearFiltersBtn')?.addEventListener('click', clearFilters);

  // Mobile filter sheet
  const filterBtn   = document.getElementById('mobileFilterBtn');
  const filterSheet = document.getElementById('filterSheet');
  const filterBdrop = document.getElementById('filterBackdrop');
  const closeSheet  = document.getElementById('closeFilterSheet');

  filterBtn?.addEventListener('click', () => {
    filterSheet?.classList.add('open');
    filterBdrop?.classList.add('open');
    document.body.style.overflow = 'hidden';
  });

  function closeFilterSheet() {
    filterSheet?.classList.remove('open');
    filterBdrop?.classList.remove('open');
    document.body.style.overflow = '';
  }

  closeSheet?.addEventListener('click', closeFilterSheet);
  filterBdrop?.addEventListener('click', closeFilterSheet);

  document.getElementById('mApplyFiltersBtn')?.addEventListener('click', () => {
    syncMobileToDesktop();
    closeFilterSheet();
    resetFeed();
  });

  document.getElementById('mClearFiltersBtn')?.addEventListener('click', () => {
    closeFilterSheet();
    clearFilters();
  });

  // Accordion toggles
  document.querySelectorAll('.filters-section-header').forEach(header => {
    header.addEventListener('click', () => {
      const expanded = header.getAttribute('aria-expanded') === 'true';
      const body     = document.getElementById(header.getAttribute('aria-controls'));
      header.setAttribute('aria-expanded', String(!expanded));
      if (body) body.style.display = expanded ? 'none' : '';
    });
  });
}

/** Copy mobile sheet values into desktop sidebar inputs before applying */
function syncMobileToDesktop() {
  const map = [
    ['mFilterMinPrice', 'filterMinPrice'],
    ['mFilterMaxPrice', 'filterMaxPrice'],
    ['mFilterSort',     'filterSortSelect'],
    ['mFilterHostel',   'filterHostelSelect'],
    ['mFilterDept',     'filterDeptSelect'],
  ];
  map.forEach(([mId, dId]) => {
    const mEl = document.getElementById(mId);
    const dEl = document.getElementById(dId);
    if (mEl && dEl) dEl.value = mEl.value;
  });

  // Condition checkboxes
  const mConditions = [...document.querySelectorAll('#filterSheet input[type="checkbox"]:checked')].map(i => i.value);
  document.querySelectorAll('#filterCondition input').forEach(cb => {
    cb.checked = mConditions.includes(cb.value);
  });
}

function clearFilters() {
  document.getElementById('filterMinPrice').value    = '';
  document.getElementById('filterMaxPrice').value    = '';
  document.getElementById('filterSortSelect').value  = 'newest';
  document.getElementById('filterHostelSelect').value = '';
  document.getElementById('filterDeptSelect').value  = '';
  document.querySelectorAll('#filterCondition input').forEach(i => { i.checked = false; });

  // Mirror to mobile
  ['mFilterMinPrice','mFilterMaxPrice'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const mSort = document.getElementById('mFilterSort');
  if (mSort) mSort.value = 'newest';
  const mHostel = document.getElementById('mFilterHostel');
  if (mHostel) mHostel.value = '';
  const mDept = document.getElementById('mFilterDept');
  if (mDept) mDept.value = '';
  document.querySelectorAll('#filterSheet input[type="checkbox"]').forEach(i => { i.checked = false; });

  activeCategory = '';
  document.querySelectorAll('#categoryBar .category-chip').forEach(b => b.classList.remove('active'));
  document.querySelector('#categoryBar [data-category=""]')?.classList.add('active');
  resetFeed();
}

// ── Search ─────────────────────────────────────────────────────────

function initSearch() {
  const input = document.getElementById('navSearch');
  if (!input) return;

  const doSearch = debounce(async (q) => {
    if (!q.trim()) {
      document.getElementById('listingsTitle').textContent = 'All Listings';
      resetFeed();
      return;
    }

    const grid = document.getElementById('listingsGrid');
    document.getElementById('listingsTitle').textContent = `Results for "${q}"`;
    hasMore = false; // disable infinite scroll during search results
    showSkeletons(grid, 8);

    try {
      const data     = await api.listings.search({ q, page: 1, limit: PAGE_SIZE });
      const listings = data.listings || data || [];
      if (listings.length) {
        grid.innerHTML = listings.map(renderCard).join('');
        attachCardEvents(grid);
      } else {
        showEmptyState(grid, { title: 'No results', desc: `Nothing matched "${q}".` });
      }
    } catch (err) {
      toast.fromError(err);
    }
  }, 400);

  input.addEventListener('input', (e) => {
    if (!e.target.value) document.getElementById('listingsTitle').textContent = 'All Listings';
    doSearch(e.target.value);
  });
}

// ── Card renderer ──────────────────────────────────────────────────

function renderCard(listing) {
  const id        = listing.id || listing.listing_id;
  const sellerId  = listing.seller_id || listing.user_id || listing.seller?.user_id || listing.seller?.id;
  const img       = imgUrl(listing.images?.[0]?.url || listing.thumbnail_url || listing.image_url, '');
  const price     = formatPrice(listing.price);
  const ago       = timeAgo(listing.created_at || listing.createdAt);
  const isSaved   = listing.is_saved   || false;
  const isBoosted = listing.is_boosted || false;

  return `
    <article class="card" data-id="${escapeHtml(id)}">
      <div class="card-img-wrap">
        ${img
          ? `<img class="card-image" src="${escapeHtml(img)}" alt="${escapeHtml(listing.title)}" loading="lazy">`
          : `<div class="card-img-fallback"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`
        }
        ${isBoosted ? `<div class="badge-boosted"><span class="boosted-dot"></span>Featured</div>` : ''}
        <button
          class="save-btn ${isSaved ? 'is-saved' : ''}"
          data-listing-id="${escapeHtml(id)}"
          data-saved="${isSaved}"
          aria-label="${isSaved ? 'Remove from saved' : 'Save listing'}"
          aria-pressed="${isSaved}"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="${isSaved ? 'var(--danger)' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
      </div>

      <div class="card-body">
        <h3 class="card-title">${escapeHtml(listing.title)}</h3>

        <div class="card-price-row">
          <span class="card-price">${price}</span>
          ${listing.is_negotiable ? '<span class="chip chip-accent" style="font-size:var(--text-xs);">Negotiable</span>' : ''}
        </div>

        <div class="card-chips">
          ${listing.category_name || listing.category_slug ? `<span class="chip chip-category">${escapeHtml(listing.category_name || listing.category_slug)}</span>` : ''}
          ${listing.condition ? `<span class="chip chip-condition">${escapeHtml(listing.condition.replace(/_/g, ' '))}</span>` : ''}
        </div>

        <div class="card-meta">
          ${listing.location || listing.hostel_name ? `<span>${escapeHtml(listing.location || listing.hostel_name)}</span><span class="card-meta-sep">·</span>` : ''}
          <span>${ago}</span>
        </div>
      </div>

      <div class="card-cta">
        <button class="btn btn-chat" data-action="chat" data-listing-id="${escapeHtml(id)}" data-seller-id="${escapeHtml(sellerId || '')}">
          Chat <span class="chat-arrow">→</span>
        </button>
        ${id
          ? `<a href="/pages/listing-detail.html?id=${encodeURIComponent(id)}" class="btn btn-view">View</a>`
          : `<button class="btn btn-view" type="button" disabled>View</button>`}
      </div>
    </article>
  `;
}

// ── Card events (save + chat) ──────────────────────────────────────

function attachCardEvents(container) {
  container.addEventListener('click', async (e) => {
    // Save toggle
    const saveBtn = e.target.closest('.save-btn');
    if (saveBtn) {
      e.preventDefault();
      e.stopPropagation();
      if (!auth.isLoggedIn()) { navigate('login'); return; }

      const listingId = saveBtn.dataset.listingId;
      const isSaved   = saveBtn.dataset.saved === 'true';

      // Optimistic animation
      saveBtn.classList.add('saved');
      setTimeout(() => saveBtn.classList.remove('saved'), 420);

      // Optimistic UI state update before API call
      const nextSaved = !isSaved;
      saveBtn.dataset.saved = String(nextSaved);
      saveBtn.classList.toggle('is-saved', nextSaved);
      saveBtn.setAttribute('aria-pressed', String(nextSaved));
      saveBtn.querySelector('path').setAttribute('fill', nextSaved ? 'var(--color-danger)' : 'none');

      try {
        if (isSaved) {
          await api.wishlist.remove(listingId);
        } else {
          await api.wishlist.add(listingId);
          toast.success('Saved', 'Added to your wishlist.');
        }
      } catch (err) {
        // Revert on failure
        saveBtn.dataset.saved = String(isSaved);
        saveBtn.classList.toggle('is-saved', isSaved);
        saveBtn.setAttribute('aria-pressed', String(isSaved));
        saveBtn.querySelector('path').setAttribute('fill', isSaved ? 'var(--color-danger)' : 'none');
        toast.fromError(err);
      }
      return;
    }

    // Chat button
    const chatBtn = e.target.closest('[data-action="chat"]');
    if (chatBtn) {
      e.preventDefault();
      if (!auth.isLoggedIn()) { navigate('login'); return; }
      const listingId = chatBtn.dataset.listingId;
      const sellerId  = chatBtn.dataset.sellerId;
      if (!listingId || !sellerId || listingId === 'undefined' || sellerId === 'undefined') {
        toast.error('Chat unavailable', 'This listing is missing seller information.');
        return;
      }
      console.log('[nav] redirecting to chat', { listingId, sellerId });
      try {
        const data = await api.chat.start({ listing_id: listingId, seller_id: sellerId });
        const thread = data.thread || data;
        const threadId = thread.thread_id || thread.threadId || thread.id;
        navigate('chat', { thread: threadId, listingId, sellerId });
      } catch (err) {
        toast.fromError(err);
      }
    }
  });
}

// ── Unread count polling ───────────────────────────────────────────

function pollUnreadCounts() {
  async function fetchCounts() {
    try {
      const data       = await api.notifications.unreadCount();
      const notifBadge = document.getElementById('notifBadge');
      const chatBadge  = document.getElementById('chatBadge');
      if (notifBadge) {
        const n = data.unread_count || data.count || 0;
        notifBadge.textContent    = n > 99 ? '99+' : n;
        notifBadge.style.display  = n > 0 ? 'flex' : 'none';
      }
      if (chatBadge && data.unread_messages != null) {
        const m = data.unread_messages || 0;
        chatBadge.textContent   = m > 99 ? '99+' : m;
        chatBadge.style.display = m > 0 ? 'flex' : 'none';
      }
    } catch {
      // Non-critical
    }
  }

  fetchCounts();
  setInterval(fetchCounts, 30_000);
}
