/**
 * auth.js — JWT storage, user session helpers, and route guards.
 * Token key: 'nm_token'. User data key: 'nm_user'.
 */

const AUTH_TOKEN_KEY = 'nm_token';
const AUTH_USER_KEY  = 'nm_user';

const auth = {
  /** Store JWT + user object after successful login/verify-otp */
  setSession(token, user) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  },

  /** Retrieve the raw JWT string */
  getToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  },

  /** Retrieve the stored user object, or null */
  getUser() {
    try {
      const raw = localStorage.getItem(AUTH_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  /** True if a token exists (does not verify expiry — server validates) */
  isLoggedIn() {
    return !!localStorage.getItem(AUTH_TOKEN_KEY);
  },

  /** True if the stored user has role === 'admin' */
  isAdmin() {
    const user = auth.getUser();
    return user?.role === 'admin';
  },

  /** True if the stored user has email_verified === true */
  isVerified() {
    const user = auth.getUser();
    return user?.emailVerified === true || user?.email_verified === true;
  },

  /** Update local user object (e.g. after profile edit) */
  updateUser(patch) {
    const user = auth.getUser();
    if (user) {
      auth.setSession(auth.getToken(), { ...user, ...patch });
    }
  },

  /** Clear session. Call after /auth/logout or on 401 response. */
  clearSession() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
  },

  /**
   * Redirect to login if not logged in.
   * Call at the top of any protected page script.
   * @param {string} [redirectAfter] — path to go back to after login
   */
  requireAuth(redirectAfter) {
    console.log('[auth] token check');
    if (!auth.isLoggedIn()) {
      const dest = redirectAfter || window.location.pathname + window.location.search;
      window.location.href = `/pages/login.html?next=${encodeURIComponent(dest)}`;
      return false;
    }
    return true;
  },

  /**
   * Redirect to login if not admin.
   */
  requireAdmin() {
    if (!auth.isLoggedIn() || !auth.isAdmin()) {
      window.location.href = '/index.html';
      return false;
    }
    return true;
  },

  /**
   * Redirect away from auth pages if already logged in.
   * Use on login/signup pages.
   */
  redirectIfLoggedIn(dest = '/index.html') {
    if (auth.isLoggedIn()) {
      window.location.href = dest;
      return true;
    }
    return false;
  },

  /**
   * Handle 401 from api.js — clear session and redirect to login.
   * Wire up in a global error handler or per-page catch blocks.
   */
  handleUnauthorized() {
    auth.clearSession();
    const dest = window.location.pathname + window.location.search;
    window.location.href = `/pages/login.html?next=${encodeURIComponent(dest)}`;
  },

  async logout() {
    try {
      if (auth.getToken() && typeof api !== 'undefined') await api.auth.logout();
    } catch {
      // Local logout must always complete even if the server is unavailable.
    }
    auth.clearSession();
    window.location.href = '/pages/login.html';
  },
};
