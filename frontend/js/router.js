/**
 * router.js — Lightweight client-side page utilities.
 *
 * This project uses plain multi-page HTML (one file per route), so there is no
 * SPA router. This module provides:
 *  - Page map (logical name → file path) for programmatic navigation
 *  - navigate() helper
 *  - Active nav link highlighting based on current path
 *  - Mobile drawer toggle wired to .nav-menu-btn / .drawer
 */

const PAGES = {
  home:           '/index.html',
  login:          '/pages/login.html',
  signup:         '/pages/signup.html',
  verifyOtp:      '/pages/verify-otp.html',
  forgotPassword: '/pages/forgot-password.html',
  listingDetail:  '/pages/listing-detail.html',
  createListing:  '/pages/create-listing.html',
  editListing:    '/pages/edit-listing.html',
  profile:        '/pages/profile.html',
  myListings:     '/pages/my-listings.html',
  transactions:   '/pages/transactions.html',
  myOffers:       '/pages/my-offers.html',
  chat:           '/pages/chat.html',
  wishlist:       '/pages/wishlist.html',
  notifications:  '/pages/notifications.html',
  admin:          '/pages/admin.html',
};

/**
 * Navigate to a named page, optionally merging query params.
 * @param {string} name — key from PAGES
 * @param {object} [params] — query params to append
 */
function navigate(name, params) {
  const base = PAGES[name];
  if (!base) {
    console.error(`router: unknown page "${name}"`);
    return;
  }
  const safeParams = {};
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') safeParams[key] = value;
    });
  }
  const url = Object.keys(safeParams).length ? `${base}?${new URLSearchParams(safeParams)}` : base;
  window.location.href = url;
}

function initLogoutControls() {
  if (typeof auth === 'undefined' || !auth.isLoggedIn()) return;

  document.querySelectorAll('[data-logout], #logoutBtn').forEach((btn) => {
    if (btn.dataset.logoutWired === '1') return;
    btn.dataset.logoutWired = '1';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      auth.logout();
    });
  });

  const navRight = document.querySelector('.navbar-right');
  if (navRight && !document.getElementById('globalLogoutBtn')) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'globalLogoutBtn';
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = 'Logout';
    btn.dataset.logout = '1';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      auth.logout();
    });
    navRight.appendChild(btn);
  }

  const drawerNav = document.querySelector('.drawer-nav');
  if (drawerNav && !document.getElementById('drawerLogoutLink')) {
    const link = document.createElement('a');
    link.href = '/pages/login.html';
    link.id = 'drawerLogoutLink';
    link.dataset.logout = '1';
    link.textContent = 'Logout';
    link.addEventListener('click', (e) => {
      e.preventDefault();
      auth.logout();
    });
    drawerNav.appendChild(link);
  }
}

/**
 * Add .active class to the nav link whose href matches the current page path.
 * Works for both .navbar-links and .drawer-nav.
 */
function highlightActiveNav() {
  const current = window.location.pathname.replace(/\/$/, '') || '/index.html';

  document.querySelectorAll('.navbar-links a, .drawer-nav a').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href) return;

    // Normalize: resolve relative hrefs against origin
    const resolved = new URL(href, window.location.origin).pathname;
    link.classList.toggle('active', resolved === current);
  });
}

/**
 * Wire up mobile drawer open/close.
 * Expects: .nav-menu-btn (open trigger), .drawer, .drawer-backdrop, .drawer-close (inside drawer).
 */
function initMobileDrawer() {
  const menuBtn   = document.querySelector('.nav-menu-btn');
  const drawer    = document.querySelector('.drawer');
  const backdrop  = document.querySelector('.drawer-backdrop');
  const closeBtn  = document.querySelector('.drawer-close');

  if (!menuBtn || !drawer) return;

  function open() {
    drawer.classList.add('open');
    if (backdrop) backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
    menuBtn.setAttribute('aria-expanded', 'true');
  }

  function close() {
    drawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    document.body.style.overflow = '';
    menuBtn.setAttribute('aria-expanded', 'false');
  }

  menuBtn.addEventListener('click', open);
  if (closeBtn)   closeBtn.addEventListener('click', close);
  if (backdrop)   backdrop.addEventListener('click', close);

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) close();
  });
}

/**
 * Populate nav avatar initials from stored session and wire bell badge.
 * Called by initRouter on every page.
 */
function initNavUser() {
  const user = typeof auth !== 'undefined' ? auth.getUser() : null;
  if (!user) return;

  // Avatar initials
  const initialsEl = document.getElementById('navAvatarInitials');
  if (initialsEl) {
    if (user.profile_picture_url) {
      initialsEl.innerHTML = `<img src="${imgUrl(user.profile_picture_url)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
      initialsEl.textContent = initials(user.full_name || '?');
    }
  }

  // Bell unread badge — fetched once on page load
  const bellBtn = document.getElementById('navBellBtn');
  if (bellBtn && typeof api !== 'undefined') {
    api.notifications.unreadCount().then(data => {
      const count = data?.count ?? data?.unread_count ?? 0;
      if (count > 0) {
        const badge = document.createElement('span');
        badge.className   = 'unread-badge';
        badge.id          = 'navBellBadge';
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.style.cssText = 'position:absolute;top:-4px;right:-4px;font-size:10px;min-width:16px;height:16px;padding:0 4px;';
        bellBtn.appendChild(badge);
      }
    }).catch(() => { /* non-critical */ });
  }
}

/**
 * Initialize all router utilities.
 * Call once per page after DOMContentLoaded.
 */
function initRouter() {
  highlightActiveNav();
  initMobileDrawer();
  initNavbarScroll(); // defined in utils.js
  initNavUser();
  initLogoutControls();
  if (typeof initBrokenImageFallbacks === 'function') initBrokenImageFallbacks();
}
