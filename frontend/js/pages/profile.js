/**
 * profile.js — Own profile (edit) + public profile view.
 *
 * Own profile: /pages/profile.html (no ?id param, or ?id matches logged-in user)
 *   Tabs: Edit Profile | Security | Reviews
 *   Avatar upload, stats, edit form, change password, danger zone.
 *
 * Public profile: /pages/profile.html?id=<userId>
 *   Read-only. Name, bio, stats, active listings, reviews.
 *   No email / edit controls shown.
 */

const params      = new URLSearchParams(window.location.search);
const targetId    = params.get('id') ? Number(params.get('id')) : null;

let me            = null;
let isOwn         = false;
let profileUser   = null;
let activeTab     = 'edit';
let reviewPage    = 1;
let listingPage   = 1;
const PAGE_SIZE   = 12;

// ── Boot ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initRouter();
  if (!auth.requireAuth()) return;

  me    = auth.getUser();
  isOwn = !targetId || targetId === me.id;

  await loadProfile();
});

// ── Load profile data ─────────────────────────────────────────────
async function loadProfile() {
  try {
    profileUser = isOwn
      ? await api.users.me()
      : await api.users.getUser(targetId);
  } catch (e) {
    toast.error('Error', 'Could not load profile.');
    return;
  }

  renderHeader();

  if (isOwn) {
    document.title = 'Profile — NusTrade';
    renderOwnView();
  } else {
    document.title = `${profileUser.full_name || 'User'} — NusTrade`;
    renderPublicView();
  }
}

// ── Header (shared) ───────────────────────────────────────────────
function renderHeader() {
  const avatarEl = document.getElementById('profileAvatar');
  const nameEl   = document.getElementById('profileName');
  const emailEl  = document.getElementById('profileEmail');
  const countEl  = document.getElementById('profileListingCount');
  const ratingEl = document.getElementById('profileRating');
  const joinedEl = document.getElementById('profileJoined');

  if (!avatarEl) return;

  // Avatar: image or initials
  if (profileUser.profile_picture_url) {
    avatarEl.innerHTML = `<img src="${escapeHtml(imgUrl(profileUser.profile_picture_url))}" alt="Avatar" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
  } else {
    avatarEl.textContent = initials(profileUser.full_name || '?');
  }

  if (nameEl)   nameEl.textContent  = profileUser.full_name  || '—';
  if (emailEl)  emailEl.textContent = isOwn ? (profileUser.email || '') : '';

  if (countEl) countEl.textContent = `${profileUser.listing_count ?? 0} listings`;
  if (ratingEl) {
    const r = Number(profileUser.avg_rating);
    ratingEl.textContent = r ? `★ ${r.toFixed(1)} (${profileUser.review_count ?? 0} reviews)` : 'No reviews yet';
  }
  if (joinedEl) {
    const d = new Date(profileUser.created_at);
    joinedEl.textContent = `Member since ${d.toLocaleDateString('en-PK', { month: 'short', year: 'numeric' })}`;
  }

  // Hide avatar upload button on public view
  const changeBtn = document.getElementById('changeAvatarBtn');
  if (changeBtn) changeBtn.style.display = isOwn ? '' : 'none';

  // Avatar upload
  if (isOwn) wireAvatarUpload();
}

// ── Own profile view ──────────────────────────────────────────────
function renderOwnView() {
  wireTabs();
  prefillEditForm();
  wireEditForm();
  wirePasswordForm();
  wireDangerZone();
}

function wireTabs() {
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === activeTab) return;
      activeTab = btn.dataset.tab;
      switchTab(activeTab);
      if (activeTab === 'reviews') loadReviews(profileUser.id);
    });
  });
}

function switchTab(tab) {
  const tabs = { edit: 'tabEdit', security: 'tabSecurity', reviews: 'tabReviews' };

  document.querySelectorAll('.tab-btn[data-tab]').forEach(b => {
    const on = b.dataset.tab === tab;
    b.style.color        = on ? 'var(--color-primary)' : 'var(--color-text-muted)';
    b.style.borderBottom = on ? '2px solid var(--color-primary)' : '2px solid transparent';
  });

  Object.entries(tabs).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = key === tab ? '' : 'none';
  });
}

function prefillEditForm() {
  const f = document.getElementById('editProfileForm');
  if (!f) return;
  const setVal = (id, val) => { const el = f.querySelector(`#${id}`); if (el) el.value = val || ''; };
  setVal('fullName',  profileUser.full_name);
  setVal('bio',       profileUser.bio);
  setVal('whatsapp',  profileUser.whatsapp);
}

function wireEditForm() {
  const form    = document.getElementById('editProfileForm');
  const errEl   = document.getElementById('editProfileError');
  const saveBtn = document.getElementById('saveProfileBtn');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.style.display = 'none';
    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving…';

    const body = {
      full_name: form.fullName.value.trim(),
      bio:       form.bio.value.trim() || null,
      whatsapp:  form.whatsapp.value.trim() || null,
    };

    if (!body.full_name) {
      showFieldError(errEl, 'Name is required.');
      saveBtn.disabled    = false;
      saveBtn.textContent = 'Save changes';
      return;
    }

    try {
      const updated = await api.users.updateMe(body);
      auth.updateUser({ full_name: updated.full_name });
      profileUser = { ...profileUser, ...updated };
      renderHeader();
      toast.success('Saved', 'Profile updated.');
    } catch (err) {
      showFieldError(errEl, err.message);
    } finally {
      saveBtn.disabled    = false;
      saveBtn.textContent = 'Save changes';
    }
  });
}

function wirePasswordForm() {
  const form    = document.getElementById('changePasswordForm');
  const errEl   = document.getElementById('changePasswordError');
  const btn     = document.getElementById('changePasswordBtn');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.style.display = 'none';

    const cur  = form.currentPassword.value;
    const next = form.newPassword.value;
    const conf = form.confirmNewPassword.value;

    if (!cur || !next || !conf) {
      showFieldError(errEl, 'All fields are required.');
      return;
    }
    if (next !== conf) {
      showFieldError(errEl, 'New passwords do not match.');
      return;
    }
    if (next.length < 8) {
      showFieldError(errEl, 'Password must be at least 8 characters.');
      return;
    }

    btn.disabled    = true;
    btn.textContent = 'Changing…';

    try {
      await api.auth.changePassword({ currentPassword: cur, newPassword: next });
      form.reset();
      toast.success('Done', 'Password changed.');
    } catch (err) {
      showFieldError(errEl, err.message);
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Change password';
    }
  });
}

function wireDangerZone() {
  const btn = document.getElementById('deactivateBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!confirm('Deactivate your account? Your listings and profile will be hidden. You can reactivate by logging back in.')) return;
    try {
      await api.users.deleteMe();
      auth.clearSession();
      navigate('home');
    } catch (err) {
      toast.error('Error', err.message);
    }
  });
}

function wireAvatarUpload() {
  const changeBtn  = document.getElementById('changeAvatarBtn');
  const fileInput  = document.getElementById('avatarInput');
  const avatarEl   = document.getElementById('profileAvatar');
  if (!changeBtn || !fileInput) return;

  changeBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Invalid file', 'JPEG, PNG or WebP only.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Too large', 'Max 5 MB.');
      return;
    }

    const fd = new FormData();
    fd.append('image', file);

    changeBtn.disabled = true;
    try {
      const updated = await api.users.uploadAvatar(fd);
      profileUser.profile_picture_url = updated.profile_picture_url;
      auth.updateUser({ profile_picture_url: updated.profile_picture_url });
      renderHeader();
      toast.success('Updated', 'Profile picture saved.');
    } catch (err) {
      toast.error('Upload failed', err.message);
    } finally {
      changeBtn.disabled = false;
      fileInput.value    = '';
    }
  });
}

// ── Public profile view ───────────────────────────────────────────
function renderPublicView() {
  // Replace tab bar with listings + reviews only
  const tabBar = document.querySelector('[data-tab]')?.closest('div[style*="border-bottom"]');
  if (tabBar) tabBar.innerHTML = `
    <button class="tab-btn active" data-pub-tab="listings" style="padding: var(--space-3) var(--space-4); border:none; background:none; cursor:pointer; font-size: var(--text-base); font-weight:500; color: var(--color-primary); border-bottom: 2px solid var(--color-primary); margin-bottom:-1px;">Listings</button>
    <button class="tab-btn" data-pub-tab="reviews" style="padding: var(--space-3) var(--space-4); border:none; background:none; cursor:pointer; font-size: var(--text-base); font-weight:500; color: var(--color-text-muted); border-bottom: 2px solid transparent; margin-bottom:-1px;">Reviews</button>
  `;

  // Show only the reviews panel (reuse #tabReviews), use it for both
  const editPanel  = document.getElementById('tabEdit');
  const secPanel   = document.getElementById('tabSecurity');
  const revPanel   = document.getElementById('tabReviews');
  if (editPanel)  editPanel.style.display  = 'none';
  if (secPanel)   secPanel.style.display   = 'none';

  // Create listings panel dynamically
  const listingsPanel = document.createElement('div');
  listingsPanel.id    = 'tabListings';
  listingsPanel.innerHTML = `<div class="listings-grid" id="pubListingsGrid"></div>`;
  revPanel.parentNode.insertBefore(listingsPanel, revPanel);
  revPanel.style.display = 'none';

  wirePubTabs();
  loadPubListings();
}

function wirePubTabs() {
  document.querySelectorAll('.tab-btn[data-pub-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn[data-pub-tab]').forEach(b => {
        const on = b.dataset.pubTab === btn.dataset.pubTab;
        b.style.color        = on ? 'var(--color-primary)' : 'var(--color-text-muted)';
        b.style.borderBottom = on ? '2px solid var(--color-primary)' : '2px solid transparent';
        b.classList.toggle('active', on);
      });
      const tab = btn.dataset.pubTab;
      document.getElementById('tabListings').style.display = tab === 'listings' ? '' : 'none';
      document.getElementById('tabReviews').style.display  = tab === 'reviews'  ? '' : 'none';
      if (tab === 'reviews') loadReviews(profileUser.id);
    });
  });
}

async function loadPubListings() {
  const grid = document.getElementById('pubListingsGrid');
  if (!grid) return;
  showSkeletons(grid, 6);

  try {
    const data     = await api.users.getUserListings(profileUser.id, { status: 'active', page: listingPage, limit: PAGE_SIZE });
    const listings = Array.isArray(data) ? data : (data?.listings || []);

    if (!listings.length) {
      showEmptyState(grid, { title: 'No active listings', desc: 'This user has no active listings.' });
      return;
    }
    grid.innerHTML = listings.map(renderListingCard).join('');
    wireListingCardLinks(grid);
  } catch {
    showEmptyState(grid, { title: 'Could not load listings' });
  }
}

// ── Reviews (shared) ──────────────────────────────────────────────
async function loadReviews(userId) {
  const container = document.getElementById('reviewsList');
  if (!container) return;
  container.innerHTML = '<p style="color: var(--color-text-subtle); padding: var(--space-4) 0;">Loading…</p>';

  try {
    const data    = await api.users.getUserReviews(userId, { page: reviewPage, limit: 20 });
    const reviews = Array.isArray(data) ? data : (data?.reviews || []);

    if (!reviews.length) {
      container.innerHTML = '<p style="color: var(--color-text-subtle); padding: var(--space-4) 0;">No reviews yet.</p>';
      return;
    }
    container.innerHTML = reviews.map(renderReview).join('');
  } catch {
    container.innerHTML = '<p style="color: var(--color-text-muted);">Could not load reviews.</p>';
  }
}

function renderReview(r) {
  const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
  return `
    <div style="padding: var(--space-4) 0; border-bottom: 1px solid var(--border-subtle);">
      <div style="display:flex; align-items:center; gap: var(--space-3); margin-bottom: var(--space-2);">
        <div class="avatar-placeholder avatar-sm" style="font-size: var(--text-xs);">${escapeHtml(initials(r.reviewer_name || '?'))}</div>
        <div>
          <div style="font-weight:500; font-size: var(--text-sm);">${escapeHtml(r.reviewer_name || 'Anonymous')}</div>
          <div style="font-size: var(--text-xs); color: var(--color-text-subtle);">${timeAgo(r.created_at)}</div>
        </div>
        <span style="margin-left:auto; color: var(--color-accent); font-size: var(--text-base);" title="${r.rating}/5">${stars}</span>
      </div>
      ${r.comment ? `<p style="font-size: var(--text-sm); color: var(--color-text-muted); line-height:1.5;">${escapeHtml(r.comment)}</p>` : ''}
    </div>
  `;
}

// ── Listing card (for public profile tab) ─────────────────────────
function renderListingCard(l) {
  const thumb = imgUrl(l.images?.[0]?.url || l.image_url);
  return `
    <div class="card" style="cursor:pointer;" data-listing-id="${l.id}">
      <div class="card-img-wrap">
        ${thumb
          ? `<img class="card-image" src="${escapeHtml(thumb)}" alt="${escapeHtml(l.title)}" loading="lazy">`
          : `<div class="card-img-fallback"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`
        }
      </div>
      <div class="card-body">
        <div class="card-title">${escapeHtml(l.title)}</div>
        <div class="card-price-row">
          <span class="card-price">${formatPrice(l.price)}</span>
          ${l.is_negotiable ? '<span class="tag-negotiable">· Negotiable</span>' : ''}
        </div>
        <div class="card-meta">
          <span>${escapeHtml(l.condition || '')}</span>
          <span class="card-meta-sep">·</span>
          <span>${timeAgo(l.created_at)}</span>
        </div>
      </div>
    </div>
  `;
}

function wireListingCardLinks(container) {
  container.querySelectorAll('.card[data-listing-id]').forEach(card => {
    card.addEventListener('click', () => navigate('listingDetail', { id: card.dataset.listingId }));
  });
}

// ── Helper ────────────────────────────────────────────────────────
function showFieldError(el, msg) {
  el.textContent    = msg;
  el.style.display  = 'block';
}
