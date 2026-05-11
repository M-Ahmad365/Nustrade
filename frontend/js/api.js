/**
 * api.js — Fetch wrapper for NusTrade backend.
 * Base URL: http://localhost:4000/api/v1
 * Auth: Bearer JWT from localStorage (set by auth.js)
 * All responses follow { success, data, message } / { success, error } envelope.
 */

// In production set window.NUSTRADE_API_URL in /js/config.js (loaded before this file).
// Falls back to localhost for local development.
const API_BASE = (typeof window !== 'undefined' && window.NUSTRADE_API_URL)
  ? window.NUSTRADE_API_URL
  : 'http://localhost:4000/api/v1';

/**
 * Core fetch wrapper. Attaches auth header when token exists,
 * unwraps the response envelope, and throws on API or network errors.
 *
 * @param {string} path  — e.g. '/listings' (no base URL)
 * @param {object} opts  — fetch options (method, body, etc.)
 * @returns {Promise<any>} — the `data` field from the envelope
 */
async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem('nm_token');

  const headers = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Don't set Content-Type for FormData — browser sets it with boundary
  if (opts.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  let res;
  try {
    console.log('[api] request sent', opts.method || 'GET', `${API_BASE}${path}`);
    res = await fetch(`${API_BASE}${path}`, {
      ...opts,
      headers,
    });
  } catch (err) {
    throw new ApiError('NETWORK_ERROR', 'Could not reach server. Check your connection.', 0);
  }

  let json;
  try {
    json = await res.json();
  } catch {
    throw new ApiError('PARSE_ERROR', 'Unexpected server response.', res.status);
  }

  if (!res.ok || !json.success) {
    const err = json.error || {};
    if (res.status === 401 && typeof auth !== 'undefined') {
      auth.handleUnauthorized();
    }
    throw new ApiError(
      err.code    || 'API_ERROR',
      err.message || 'Something went wrong.',
      res.status,
      err.details || null,
    );
  }

  return json.data;
}

/** Structured API error with code + HTTP status */
class ApiError extends Error {
  constructor(code, message, status, details = null) {
    super(message);
    this.name    = 'ApiError';
    this.code    = code;
    this.status  = status;
    this.details = details;
  }
}

// ── Convenience methods ────────────────────────────────────────────

const api = {
  get(path, params) {
    const url = params ? `${path}?${new URLSearchParams(params)}` : path;
    return apiFetch(url, { method: 'GET' });
  },

  post(path, body) {
    const isFormData = body instanceof FormData;
    return apiFetch(path, {
      method: 'POST',
      body:   isFormData ? body : JSON.stringify(body),
    });
  },

  patch(path, body) {
    return apiFetch(path, {
      method: 'PATCH',
      body:   JSON.stringify(body),
    });
  },

  delete(path) {
    return apiFetch(path, { method: 'DELETE' });
  },
};

// ── Domain helpers — map 1:1 to SPECS.md §5 ───────────────────────

// Auth
api.auth = {
  signup:         (body) => api.post('/auth/signup', body),
  verifyOtp:      (body) => api.post('/auth/verify-otp', body),
  resendOtp:      (body) => api.post('/auth/resend-otp', body),
  login:          (body) => api.post('/auth/login', body),
  forgotPassword: (body) => api.post('/auth/forgot-password', body),
  resetPassword:  (body) => api.post('/auth/reset-password', body),
  changePassword: (body) => api.post('/auth/change-password', body),
  logout:         ()     => api.post('/auth/logout', {}),
};

// Users
api.users = {
  me:             ()           => api.get('/users/me'),
  updateMe:       (body)       => api.patch('/users/me', body),
  deleteMe:       ()           => api.delete('/users/me'),
  uploadAvatar:   (formData)   => api.post('/users/me/profile-picture', formData),
  getUser:        (id)         => api.get(`/users/${id}`),
  getUserListings:(id, p)      => api.get(`/users/${id}/listings`, p),
  getUserReviews: (id, p)      => api.get(`/users/${id}/reviews`, p),
};

// Listings
api.listings = {
  list:          (params)      => api.get('/listings', params),
  trending:      ()            => api.get('/listings/trending'),
  search:        (params)      => api.get('/listings/search', params),
  get:           (id)          => api.get(`/listings/${id}`),
  create:        (formData)    => api.post('/listings', formData),
  update:        (id, body)    => api.patch(`/listings/${id}`, body),
  delete:        (id)          => api.delete(`/listings/${id}`),
  boost:         (id)          => api.post(`/listings/${id}/boost`, {}),
  addImage:      (id, fd)      => api.post(`/listings/${id}/images`, fd),
  removeImage:   (id, imgId)   => api.delete(`/listings/${id}/images/${imgId}`),
  report:        (id, body)    => api.post(`/listings/${id}/report`, body),
};

// Offers
api.offers = {
  create:        (body)        => api.post('/offers', body),
  sent:          (p)           => api.get('/offers/sent', p),
  received:      (p)           => api.get('/offers/received', p),
  accept:        (id)          => api.post(`/offers/${id}/accept`, {}),
  reject:        (id)          => api.post(`/offers/${id}/reject`, {}),
  counter:       (id, body)    => api.post(`/offers/${id}/counter`, body),
  cancel:        (id)          => api.post(`/offers/${id}/cancel`, {}),
};

// Transactions
api.transactions = {
  list:          (p)           => api.get('/transactions', p),
  get:           (id)          => api.get(`/transactions/${id}`),
  confirmBuyer:  (id)          => api.post(`/transactions/${id}/confirm-buyer`, {}),
  confirmSeller: (id)          => api.post(`/transactions/${id}/confirm-seller`, {}),
  cancel:        (id, body)    => api.post(`/transactions/${id}/cancel`, body),
  dispute:       (id, body)    => api.post(`/transactions/${id}/dispute`, body),
};

// Chat
api.chat = {
  threads:       (p)           => api.get('/chat/threads', p),
  getThread:     (id)          => api.get(`/chat/threads/${id}`),
  messages:      (id, p)       => api.get(`/chat/threads/${id}/messages`, p),
  send:          (id, body)    => api.post(`/chat/threads/${id}/messages`, body),
  markRead:      (id)          => api.post(`/chat/threads/${id}/read`, {}),
  start:         (body)        => api.post('/chat/start', body),
};

// Reviews
api.reviews = {
  create:        (body)        => api.post('/reviews', body),
  update:        (id, body)    => api.patch(`/reviews/${id}`, body),
  forTransaction:(txId)        => api.get(`/reviews/transaction/${txId}`),
};

// Wishlist
api.wishlist = {
  list:          ()            => api.get('/wishlist'),
  add:           (listingId)   => api.post(`/wishlist/${listingId}`, {}),
  remove:        (listingId)   => api.delete(`/wishlist/${listingId}`),
};

// Saved searches
api.savedSearches = {
  list:          ()            => api.get('/saved-searches'),
  create:        (body)        => api.post('/saved-searches', body),
  delete:        (id)          => api.delete(`/saved-searches/${id}`),
};

// Notifications
api.notifications = {
  list:          (p)           => api.get('/notifications', p),
  unreadCount:   ()            => api.get('/notifications/unread-count'),
  markRead:      (id)          => api.post(`/notifications/${id}/read`, {}),
  markAllRead:   ()            => api.post('/notifications/mark-all-read', {}),
};

// Categories
api.categories = {
  list:          ()            => api.get('/categories'),
};

// Admin
api.admin = {
  users:         (p)           => api.get('/admin/users', p),
  banUser:       (id)          => api.post(`/admin/users/${id}/ban`, {}),
  unbanUser:     (id)          => api.post(`/admin/users/${id}/unban`, {}),
  listings:      (p)           => api.get('/admin/listings', p),
  removeListing: (id)          => api.post(`/admin/listings/${id}/remove`, {}),
  reports:       (p)           => api.get('/admin/reports', p),
  resolveReport: (id, body)    => api.post(`/admin/reports/${id}/resolve`, body),
  analytics:     ()            => api.get('/admin/analytics'),
  backup:        ()            => api.post('/admin/backup', {}),
  announce:      (body)        => api.post('/admin/announcement', body),
};
