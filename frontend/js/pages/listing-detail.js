/**
 * listing-detail.js — Listing detail page controller.
 * GET /listings/:id → render gallery, seller card, buyer/owner actions.
 */

document.addEventListener('DOMContentLoaded', () => {
  if (typeof initRouter === 'function') initRouter();
  // Listing detail is public — auth checked per-action (chat, offer, save)
  initPage();
});

async function initPage() {
  const params = new URLSearchParams(window.location.search);
  const listingId = params.get('id');

  if (!listingId) { showError(); return; }

  renderNavAuth();
  injectMobileStickyBar();

  try {
    const data = await api.listings.get(listingId);
    const listing = data.listing || data;
    renderListing(listing);
    loadSimilar(listing.category_slug || listing.category || listing.category_id || listing.categoryId, listingId);
  } catch {
    showError();
  }
}

// ── Nav auth chip ────────────────────────────────────────────────────
function renderNavAuth() {
  const el = document.getElementById('navAuthActions');
  if (!el) return;
  const user = auth.getUser();
  if (user) {
    el.innerHTML = `<span style="font-size:var(--text-sm); color:var(--color-text-muted); font-weight:500;">${escapeHtml(user.full_name || user.name || '')}</span>`;
  } else {
    el.innerHTML = `<a href="/pages/login.html" class="btn btn-primary btn-sm">Sign in</a>`;
  }
}

// ── Mobile sticky CTA bar (only for buyer, only on mobile) ───────────
function injectMobileStickyBar() {
  const bar = document.createElement('div');
  bar.id = 'mobileStickyBar';
  bar.setAttribute('aria-hidden', 'true');
  bar.style.cssText = [
    'position:fixed', 'bottom:0', 'left:0', 'right:0',
    'background:var(--color-surface)',
    'border-top:1px solid var(--border-subtle)',
    'padding:var(--space-3) var(--space-4)',
    'padding-bottom:calc(var(--space-3) + env(safe-area-inset-bottom))',
    'display:none', 'gap:var(--space-3)', 'z-index:100',
  ].join(';');
  bar.innerHTML = `
    <button class="btn btn-primary" style="flex:1;" id="mobileChatBtn">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      Chat
    </button>
    <button class="btn btn-secondary" style="flex:1;" id="mobileOfferBtn">Make offer</button>
  `;
  document.body.appendChild(bar);

  const mq = window.matchMedia('(max-width: 767px)');
  const toggle = (e) => { bar.style.display = e.matches ? 'flex' : 'none'; };
  mq.addEventListener('change', toggle);
  toggle(mq);
}

// ── Main render ──────────────────────────────────────────────────────
function renderListing(listing) {
  document.getElementById('loadingSkeleton').style.display = 'none';
  document.getElementById('listingContent').style.display = '';

  const id = listing.id || listing.listing_id;

  // Build images array
  const images = listing.images || [];
  const thumb = listing.thumbnail_url || listing.image_url || '';
  const allImages = images.length > 0 ? images : (thumb ? [{ url: thumb }] : []);

  renderGallery(allImages, listing.title);

  // ── Title / price / chips ──────────────────────────────────────
  document.getElementById('listingTitle').textContent = listing.title || '';
  document.title = `${listing.title || 'Listing'} — NusTrade`;

  const priceText = formatPrice(listing.price);
  document.getElementById('listingPrice').textContent = priceText;
  document.getElementById('sidebarPrice').textContent = priceText;

  if (listing.is_negotiable || listing.isNegotiable) {
    document.getElementById('negotiableTag').style.display = '';
  }

  document.getElementById('conditionChip').textContent = condLabel(listing.condition);
  document.getElementById('categoryChip').textContent = listing.category_name || listing.categoryName || '';

  if (listing.is_boosted || listing.isBoosted) {
    document.getElementById('boostedBadge').style.display = '';
  }

  // ── Description / meta ─────────────────────────────────────────
  document.getElementById('listingDescription').textContent = listing.description || '';
  document.getElementById('listingLocation').querySelector('span').textContent =
    listing.location || listing.location_hostel || (listing.is_off_campus ? 'Off campus' : 'NUST Campus');
  document.getElementById('listingPosted').querySelector('span').textContent =
    timeAgo(listing.created_at || listing.createdAt);
  document.getElementById('listingViews').querySelector('span').textContent =
    listing.view_count || listing.viewCount || 0;

  // ── Seller card ────────────────────────────────────────────────
  const seller = listing.seller || listing.user || {
    id:                  listing.seller_id,
    user_id:             listing.seller_id,
    full_name:           listing.seller_name,
    profile_picture_url: listing.seller_picture_url,
    aggregate_rating:    listing.seller_rating,
    total_sales:         listing.seller_total_sales,
    hostel_name:         listing.seller_hostel,
  };
  const sellerId = seller.id || seller.user_id || listing.seller_id;

  const avatarEl = document.getElementById('sellerAvatar');
  const picUrl = seller.profile_picture_url || seller.profilePictureUrl;
  avatarEl.textContent = '';
  if (picUrl) {
    const img = document.createElement('img');
    img.src = imgUrl(picUrl);
    img.alt = seller.full_name || '';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
    avatarEl.appendChild(img);
  } else {
    avatarEl.textContent = initials(seller.full_name || seller.name || '?');
  }

  document.getElementById('sellerName').textContent = seller.full_name || seller.name || 'Unknown';
  const metaParts = [seller.department, seller.hostel_name || seller.hostelName].filter(Boolean);
  document.getElementById('sellerMeta').textContent = metaParts.join(' · ') || '';

  // Member since
  const memberEl = document.getElementById('sellerMemberSince');
  if (memberEl) {
    const joined = seller.created_at || seller.createdAt;
    memberEl.querySelector('span').textContent = joined
      ? 'Joined ' + new Date(joined).toLocaleDateString('en-PK', { month: 'short', year: 'numeric' })
      : 'Joined recently';
  }

  // Sales count
  const salesEl = document.getElementById('sellerSales');
  if (salesEl) {
    const count = seller.total_sales ?? seller.totalSales ?? seller.sales_count ?? 0;
    salesEl.querySelector('span').textContent = `${count} sale${count !== 1 ? 's' : ''}`;
  }

  // Seller rating
  const ratingEl = document.getElementById('sellerRating');
  if (ratingEl) {
    const r = Number(seller.aggregate_rating || seller.avg_rating || 0);
    const n = seller.review_count || seller.total_reviews || 0;
    if (r > 0) {
      ratingEl.textContent  = `★ ${r.toFixed(1)}${n ? ` (${n} review${n !== 1 ? 's' : ''})` : ''}`;
      ratingEl.style.display = 'flex';
    }
  }

  const viewSellerBtn = document.getElementById('viewSellerBtn');
  if (sellerId) viewSellerBtn.href = `/pages/profile.html?id=${sellerId}`;

  // ── Owner vs Buyer ─────────────────────────────────────────────
  const me = auth.getUser();
  const myId = me?.id || me?.user_id;
  const isOwner = !!myId && (myId === sellerId || String(myId) === String(sellerId));

  if (isOwner) {
    document.getElementById('buyerActions').style.display = 'none';
    document.getElementById('ownerActions').style.display = '';
    const bar = document.getElementById('mobileStickyBar');
    if (bar) bar.style.display = 'none';
    wireOwnerActions(id);
  } else {
    wireBuyerActions(id, listing, sellerId);
  }

  initOfferModal(id);
}

// ── Gallery ──────────────────────────────────────────────────────────
function renderGallery(images, altTitle) {
  const mainImg = document.getElementById('mainImage');
  const thumbsEl = document.getElementById('galleryThumbs');
  let activeIdx = 0;

  if (!images.length) {
    mainImg.style.background = 'var(--color-surface-muted)';
    thumbsEl.style.display = 'none';
    return;
  }

  function getImgSrc(img) {
    return imgUrl(img.url || img.image_url || img.thumbnail_url || '');
  }

  function setActive(idx) {
    activeIdx = idx;
    mainImg.src = getImgSrc(images[idx]);
    mainImg.alt = escapeHtml(altTitle || '');
    document.querySelectorAll('.gallery-thumb').forEach((t, i) => {
      t.classList.toggle('active', i === idx);
    });
  }

  mainImg.src = getImgSrc(images[0]);
  mainImg.alt = escapeHtml(altTitle || '');

  if (images.length > 1) {
    thumbsEl.innerHTML = images.map((img, i) => `
      <div class="gallery-thumb${i === 0 ? ' active' : ''}" data-idx="${i}" tabindex="0" role="button" aria-label="Photo ${i + 1}">
        <img src="${escapeHtml(getImgSrc(img))}" alt="Photo ${i + 1}" loading="lazy">
      </div>
    `).join('');

    thumbsEl.addEventListener('click', (e) => {
      const t = e.target.closest('.gallery-thumb');
      if (t) setActive(Number(t.dataset.idx));
    });
    thumbsEl.addEventListener('keydown', (e) => {
      const t = e.target.closest('.gallery-thumb');
      if (t && (e.key === 'Enter' || e.key === ' ')) setActive(Number(t.dataset.idx));
    });
  } else {
    thumbsEl.style.display = 'none';
  }

  // Arrow key navigation when gallery is focused / in view
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft')  setActive(Math.max(0, activeIdx - 1));
    if (e.key === 'ArrowRight') setActive(Math.min(images.length - 1, activeIdx + 1));
  });
}

// ── Owner controls ───────────────────────────────────────────────────
function wireOwnerActions(id) {
  document.getElementById('editListingBtn').href = `/pages/edit-listing.html?id=${id}`;

  document.getElementById('boostListingBtn').addEventListener('click', async () => {
    try {
      await api.listings.boost(id);
      toast.success('Listing boosted!', 'It will appear at the top of results.');
    } catch (err) { toast.fromError(err); }
  });

  document.getElementById('deleteListingBtn').addEventListener('click', async () => {
    if (!confirm('Delete this listing? Cannot be undone.')) return;
    try {
      await api.listings.delete(id);
      toast.success('Deleted');
      setTimeout(() => navigate('myListings'), 1200);
    } catch (err) { toast.fromError(err); }
  });
}

// ── Buyer controls ───────────────────────────────────────────────────
function wireBuyerActions(id, listing, sellerId) {
  // Save / wishlist (optimistic)
  const saveBtn = document.getElementById('saveListingBtn');
  let saved = listing.is_saved || listing.isSaved || false;

  function renderSaveBtn(s) {
    const heart = s
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="var(--color-primary)" stroke="var(--color-primary)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
    saveBtn.innerHTML = `${heart} ${s ? 'Saved' : 'Save listing'}`;
  }

  renderSaveBtn(saved);

  saveBtn.addEventListener('click', async () => {
    if (!auth.isLoggedIn()) {
      navigate('login', { next: window.location.pathname + window.location.search });
      return;
    }
    const prev = saved;
    saved = !prev;
    renderSaveBtn(saved);
    try {
      if (saved) await api.wishlist.add(id);
      else       await api.wishlist.remove(id);
    } catch (err) {
      saved = prev;
      renderSaveBtn(saved);
      toast.fromError(err);
    }
  });

  // Chat
  function startChat() {
    if (!auth.isLoggedIn()) {
      navigate('login', { next: window.location.pathname + window.location.search });
      return;
    }
    if (!id || !sellerId || id === 'undefined' || sellerId === 'undefined') {
      toast.error('Chat unavailable', 'This listing is missing seller information.');
      return;
    }
    console.log('[nav] redirecting to chat', { listingId: id, sellerId });
    navigate('chat', { listingId: id, sellerId });
  }
  document.getElementById('chatBtn').addEventListener('click', startChat);
  const mobileChat = document.getElementById('mobileChatBtn');
  if (mobileChat) mobileChat.addEventListener('click', startChat);

  // Make offer
  function openOffer() {
    if (!auth.isLoggedIn()) {
      navigate('login', { next: window.location.pathname + window.location.search });
      return;
    }
    document.getElementById('offerModal').style.display = 'flex';
  }
  document.getElementById('makeOfferBtn').addEventListener('click', openOffer);
  const mobileOffer = document.getElementById('mobileOfferBtn');
  if (mobileOffer) mobileOffer.addEventListener('click', openOffer);

  // Report
  document.getElementById('reportListingBtn').addEventListener('click', async () => {
    if (!auth.isLoggedIn()) { navigate('login'); return; }
    const reason = prompt('Reason for report (e.g. spam, misleading, inappropriate):');
    if (!reason?.trim()) return;
    try {
      await api.listings.report(id, { reason: reason.trim() });
      toast.success('Report submitted', 'Our team will review this listing.');
    } catch (err) { toast.fromError(err); }
  });
}

// ── Offer modal ──────────────────────────────────────────────────────
function initOfferModal(listingId) {
  const modal    = document.getElementById('offerModal');
  const amtInput = document.getElementById('offerAmount');
  const msgInput = document.getElementById('offerMessage');
  const amtErr   = document.getElementById('offerAmountError');
  const submitBtn = document.getElementById('submitOfferBtn');

  function close() {
    modal.style.display = 'none';
    amtInput.value = '';
    msgInput.value = '';
    amtErr.style.display = 'none';
  }

  document.getElementById('closeOfferModal').addEventListener('click', close);
  document.getElementById('cancelOfferModal').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display !== 'none') close();
  });

  submitBtn.addEventListener('click', async () => {
    const amount = Number(amtInput.value);
    if (!amount || amount <= 0) {
      amtErr.textContent = 'Enter a valid offer amount.';
      amtErr.style.display = '';
      amtInput.focus();
      return;
    }
    amtErr.style.display = 'none';

    const message = msgInput.value.trim();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    try {
      await api.offers.create({ listing_id: listingId, amount, message });
      close();
      toast.success('Offer sent!', 'The seller will respond soon.');
    } catch (err) {
      toast.fromError(err);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send offer';
    }
  });
}

// ── Similar listings ─────────────────────────────────────────────────
async function loadSimilar(category, excludeId) {
  if (!category) return;

  const section = document.getElementById('similarSection');
  const grid = document.getElementById('similarGrid');
  section.style.display = '';
  showSkeletons(grid, 4);

  try {
    const data = await api.listings.list({ category, limit: 8, page: 1 });
    const all = data.listings || data || [];
    const similar = all
      .filter(l => String(l.id || l.listing_id) !== String(excludeId))
      .slice(0, 4);

    if (!similar.length) { section.style.display = 'none'; return; }
    grid.innerHTML = similar.map(buildCard).join('');
  } catch {
    section.style.display = 'none';
  }
}

function buildCard(l) {
  const id = l.id || l.listing_id;
  const thumb = imgUrl(l.thumbnail_url || l.image_url || '');
  return `
    <a href="/pages/listing-detail.html?id=${id}" class="card" style="text-decoration:none; display:block;">
      <div class="card-img-wrap">
        ${thumb
          ? `<img src="${escapeHtml(thumb)}" alt="${escapeHtml(l.title || '')}" loading="lazy">`
          : `<div style="width:100%;height:100%;background:var(--color-surface-muted);"></div>`}
        ${(l.is_boosted || l.isBoosted)
          ? `<span class="badge-boosted" style="position:absolute;top:8px;left:8px;"><span class="boosted-dot"></span>Featured</span>`
          : ''}
      </div>
      <div class="card-body">
        <div class="card-title">${escapeHtml(truncate(l.title || '', 60))}</div>
        <div class="card-price">${escapeHtml(formatPrice(l.price, true))}</div>
        <div class="card-meta">${escapeHtml(timeAgo(l.created_at || l.createdAt))}</div>
      </div>
    </a>
  `;
}

// ── Helpers ──────────────────────────────────────────────────────────
function condLabel(cond) {
  return { new: 'New', like_new: 'Like New', good: 'Good', fair: 'Fair' }[cond] || cond || '';
}

function showError() {
  document.getElementById('loadingSkeleton').style.display = 'none';
  document.getElementById('listingContent').style.display = 'none';
  document.getElementById('errorState').style.display = '';
}
