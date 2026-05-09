/**
 * utils.js — Pure helper functions. No side effects, no DOM dependencies.
 */

/**
 * Format a number as Pakistani Rupees.
 * @param {number} amount
 * @param {boolean} [compact] — true → "Rs. 1.2L" style for large numbers
 * @returns {string}
 */
function formatPrice(amount, compact = false) {
  if (amount == null || isNaN(amount)) return '';

  const n = Number(amount);

  if (compact) {
    if (n >= 10_000_000) return `Rs. ${(n / 10_000_000).toFixed(1)}Cr`;
    if (n >= 100_000)    return `Rs. ${(n / 100_000).toFixed(1)}L`;
    if (n >= 1_000)      return `Rs. ${(n / 1_000).toFixed(0)}K`;
  }

  return 'Rs. ' + n.toLocaleString('en-PK');
}

/**
 * Convert an ISO date string / timestamp to a human-readable relative time.
 * e.g. "just now", "5 min ago", "3 days ago"
 * @param {string|number|Date} date
 * @returns {string}
 */
function timeAgo(date) {
  const now  = Date.now();
  const then = new Date(date).getTime();
  const sec  = Math.floor((now - then) / 1000);

  if (sec <  60)               return 'just now';
  if (sec < 3600)              return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400)             return `${Math.floor(sec / 3600)} hr ago`;
  if (sec < 86400 * 7)         return `${Math.floor(sec / 86400)} days ago`;
  if (sec < 86400 * 30)        return `${Math.floor(sec / (86400 * 7))} wk ago`;
  if (sec < 86400 * 365)       return `${Math.floor(sec / (86400 * 30))} mo ago`;
  return `${Math.floor(sec / (86400 * 365))} yr ago`;
}

/**
 * Debounce: delay fn execution until `ms` ms after last call.
 * @param {Function} fn
 * @param {number} ms
 * @returns {Function}
 */
function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

/**
 * Escape HTML special chars to prevent XSS when inserting user content into innerHTML.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Build an absolute URL for an uploaded image served by the backend.
 * Backend serves uploads at /uploads/<filename>.
 * @param {string|null} path — relative path from the API response
 * @param {string} [fallback] — URL to use when path is empty
 * @returns {string}
 */
function imgUrl(path, fallback = '') {
  if (!path) return fallback;
  if (path.startsWith('http')) return path;
  return `http://localhost:4000${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * Truncate a string to maxLen chars, appending ellipsis.
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen).trimEnd() + '…' : str;
}

/**
 * Clamp a number between min and max.
 */
function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

/**
 * Extract the `next` query param from the current URL (for post-login redirect).
 * @returns {string}
 */
function getNextParam() {
  const params = new URLSearchParams(window.location.search);
  const next   = params.get('next');
  // Only allow same-origin redirects
  if (next && next.startsWith('/')) return next;
  return '/index.html';
}

/**
 * Show skeleton cards while data loads.
 * @param {HTMLElement} container
 * @param {number} count
 */
function showSkeletons(container, count = 8) {
  container.innerHTML = Array.from({ length: count }).map(() => `
    <div class="skeleton-card">
      <div class="skeleton skeleton-img"></div>
      <div class="skeleton-body">
        <div class="skeleton skeleton-line skeleton-line-full"></div>
        <div class="skeleton skeleton-line skeleton-line-medium"></div>
        <div class="skeleton skeleton-price"></div>
        <div class="skeleton skeleton-line skeleton-line-short"></div>
      </div>
    </div>
  `).join('');
}

/**
 * Render an empty state into a container.
 * @param {HTMLElement} container
 * @param {object} opts
 */
function showEmptyState(container, { title, desc, cta } = {}) {
  container.innerHTML = `
    <div class="empty-state">
      <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
      <p class="empty-state-title">${escapeHtml(title || 'Nothing here yet')}</p>
      <p class="empty-state-desc">${escapeHtml(desc || '')}</p>
      ${cta ? `<a href="${escapeHtml(cta.href)}" class="btn btn-primary mt-4">${escapeHtml(cta.label)}</a>` : ''}
    </div>
  `;
}

/**
 * Wire onerror on all <img> elements (and future ones via MutationObserver)
 * so broken images show a warm placeholder instead of a broken icon.
 * Call once at page load.
 */
function initBrokenImageFallbacks() {
  function applyFallback(img) {
    if (img._fallbackWired) return;
    img._fallbackWired = true;
    img.addEventListener('error', () => {
      img.style.display = 'none';
      // Insert fallback sibling only if not already present
      if (img.nextSibling?.classList?.contains('img-broken-fallback')) return;
      const fb = document.createElement('div');
      fb.className = 'img-broken-fallback';
      fb.setAttribute('aria-hidden', 'true');
      fb.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
      img.parentNode.insertBefore(fb, img.nextSibling);
    }, { once: true });
  }
  document.querySelectorAll('img').forEach(applyFallback);
  // Watch for dynamically added images
  new MutationObserver(mutations => {
    mutations.forEach(m => m.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.tagName === 'IMG') applyFallback(node);
      node.querySelectorAll?.('img').forEach(applyFallback);
    }));
  }).observe(document.body, { childList: true, subtree: true });
}

/**
 * Attach navbar scroll shadow behavior.
 * Call once after DOM is ready.
 */
function initNavbarScroll() {
  const nav = document.querySelector('.navbar');
  if (!nav) return;
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 4);
  }, { passive: true });
}

/**
 * Render user initials into an `.avatar-placeholder` element.
 * @param {string} name
 * @returns {string} — 1-2 uppercase chars
 */
function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* Nav scroll shadow — adds .scrolled to .navbar when user scrolls down */
window.addEventListener('scroll', () => {
  document.querySelector('.navbar')?.classList.toggle('scrolled', window.scrollY > 10);
}, { passive: true });

/* Scroll-triggered reveal — observes .reveal elements and adds .visible when in view */
(function initRevealObserver() {
  if (typeof IntersectionObserver === 'undefined') return;
  const obs = new IntersectionObserver(
    (entries) => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } }),
    { threshold: 0.12 }
  );
  // observe existing + future .reveal elements via a MutationObserver
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
  new MutationObserver(muts => {
    muts.forEach(m => m.addedNodes.forEach(n => {
      if (n.nodeType !== 1) return;
      if (n.classList?.contains('reveal')) obs.observe(n);
      n.querySelectorAll?.('.reveal').forEach(el => obs.observe(el));
    }));
  }).observe(document.body, { childList: true, subtree: true });
})();
