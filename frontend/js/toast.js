/**
 * toast.js — Slide-in toast notification system.
 * Max 3 stacked. Auto-dismiss: 4s (errors: 6s). Click to dismiss.
 * Injects #toast-container into <body> on first use.
 */

const toast = (() => {
  let container = null;
  const MAX_TOASTS = 3;

  function getContainer() {
    if (!container) {
      container = document.getElementById('toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
      }
    }
    return container;
  }

  // SVG icons — inline so no external dep
  const ICONS = {
    success: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    error:   `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    info:    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    warning: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  };

  const CLOSE_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

  /**
   * Show a toast.
   * @param {'success'|'error'|'info'|'warning'} type
   * @param {string} title
   * @param {string} [message]
   * @param {number} [duration] ms — 0 to persist until clicked
   */
  function show(type, title, message = '', duration) {
    const c = getContainer();

    // Enforce max stacked toasts
    while (c.children.length >= MAX_TOASTS) {
      dismiss(c.firstElementChild);
    }

    const ms = duration !== undefined ? duration : (type === 'error' ? 6000 : 4000);

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

    el.innerHTML = `
      <span class="toast-icon">${ICONS[type] || ICONS.info}</span>
      <div class="toast-body">
        <div class="toast-title">${escapeHtml(title)}</div>
        ${message ? `<div class="toast-msg">${escapeHtml(message)}</div>` : ''}
      </div>
      <button class="toast-close" aria-label="Dismiss">${CLOSE_ICON}</button>
    `;

    el.querySelector('.toast-close').addEventListener('click', (e) => {
      e.stopPropagation();
      dismiss(el);
    });

    el.addEventListener('click', () => dismiss(el));

    c.appendChild(el);

    if (ms > 0) {
      setTimeout(() => dismiss(el), ms);
    }

    return el;
  }

  function dismiss(el) {
    if (!el || !el.parentNode) return;
    // Slide out
    el.style.transition = 'opacity 150ms ease, transform 150ms ease';
    el.style.opacity    = '0';
    el.style.transform  = 'translateX(calc(100% + 24px))';
    setTimeout(() => el.remove(), 160);
  }

  // escapeHtml defined here to avoid dep on utils.js load order
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  return {
    success: (title, msg, dur)   => show('success', title, msg, dur),
    error:   (title, msg, dur)   => show('error',   title, msg, dur),
    info:    (title, msg, dur)   => show('info',    title, msg, dur),
    warning: (title, msg, dur)   => show('warning', title, msg, dur),

    /** Show an ApiError nicely */
    fromError(err) {
      const msg = err?.message || 'Something went wrong.';
      return show('error', 'Error', msg);
    },
  };
})();
