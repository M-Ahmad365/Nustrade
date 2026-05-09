/**
 * admin.js — Admin dashboard controller.
 * Guard: requireAdmin() kicks unauthenticated or non-admin users to home.
 * Analytics cached 10 min in sessionStorage to avoid hammering the endpoint.
 */

// ── State ──────────────────────────────────────────────────────────

const ANALYTICS_CACHE_KEY = 'nm_admin_analytics';
const ANALYTICS_CACHE_TTL = 10 * 60 * 1000; // 10 min ms

let analyticsData = null;
let activePanel   = 'overview';

// Pagination state
const usersState    = { page: 1, limit: 20, search: '', total: 0 };
const listingsState = { page: 1, limit: 20, total: 0 };
const reportsState  = { page: 1, limit: 50, resolved: false };

// Chart instances — keep refs so we can destroy on re-render
let charts = {};

// ── Boot ──────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initRouter();
  requireAdmin();

  wireSidebar();
  wireLogout();
  wireBackup();

  showPanel('overview');
});

// ── Guards ────────────────────────────────────────────────────────

function requireAdmin() {
  const user = typeof auth !== 'undefined' ? auth.getUser() : null;
  if (!user) {
    navigate('login', { next: '/pages/admin.html' });
    return;
  }
  if (user.role !== 'admin') {
    navigate('home');
  }
}

// ── Sidebar navigation ────────────────────────────────────────────

function wireSidebar() {
  document.querySelectorAll('.admin-nav-link[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => showPanel(btn.dataset.panel));
  });
}

function showPanel(name) {
  activePanel = name;

  // Toggle sidebar active state
  document.querySelectorAll('.admin-nav-link[data-panel]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.panel === name);
  });

  // Toggle panel visibility
  ['overview', 'users', 'listings', 'reports', 'analytics'].forEach(id => {
    const el = document.getElementById(`panel${capitalize(id)}`);
    if (el) el.style.display = id === name ? '' : 'none';
  });

  // Load panel content on first show
  if (name === 'overview')  loadOverview();
  if (name === 'users')     loadUsers();
  if (name === 'listings')  loadAdminListings();
  if (name === 'reports')   loadReports();
  if (name === 'analytics') loadAnalytics();
}

// ── Overview ──────────────────────────────────────────────────────

async function loadOverview() {
  const data = await getAnalytics();
  if (!data) return;

  renderStatCards(data.summary);
  renderCharts(data);
}

function renderStatCards(s) {
  if (!s) return;
  const grid = document.getElementById('statsGrid');
  if (!grid) return;

  const cards = [
    { label: 'Total Users',        value: (s.total_users        ?? 0).toLocaleString() },
    { label: 'Total Listings',     value: (s.total_listings     ?? 0).toLocaleString() },
    { label: 'Total Transactions', value: (s.total_transactions ?? 0).toLocaleString() },
    { label: 'Total Value (PKR)',   value: formatPrice(s.total_value ?? 0, true) },
    { label: 'Active Listings',    value: (s.active_listings    ?? 0).toLocaleString() },
    { label: 'Unresolved Reports', value: (s.unresolved_reports ?? 0).toLocaleString() },
  ];

  grid.innerHTML = cards.map(c => `
    <div class="stat-card" style="background: var(--color-surface-alt);">
      <div class="stat-value" style="font-size:24px; font-weight:500;">${escapeHtml(String(c.value))}</div>
      <div class="stat-label">${escapeHtml(c.label)}</div>
    </div>
  `).join('');

  // Show reports badge in sidebar if unresolved > 0
  const badge = document.getElementById('reportsBadge');
  if (badge && s.unresolved_reports > 0) {
    badge.textContent = s.unresolved_reports > 99 ? '99+' : String(s.unresolved_reports);
    badge.style.display = '';
  }
}

// ── Charts ────────────────────────────────────────────────────────

function renderCharts(data) {
  renderLineChart('chartSignups',   data.signups_daily,  'Signups');
  renderLineChart('chartListings',  data.listings_daily, 'Listings');
  renderBarChart( 'chartCategory',  data.by_category,    'Listings');
  renderBarChart( 'chartHostel',    data.by_hostel,      'Listings');
  renderBarChart( 'chartTopSellers',data.top_sellers,    'Sales',    { indexAxis: 'y' });
}

function buildLineDataset(rows, labelKey = 'date', valueKey = 'count') {
  if (!rows?.length) return { labels: [], values: [] };
  const labels = rows.map(r => r[labelKey] ?? r.date ?? r.label ?? '');
  const values = rows.map(r => Number(r[valueKey] ?? r.count ?? r.value ?? 0));
  return { labels, values };
}

function buildBarDataset(rows, labelKey = 'label', valueKey = 'count') {
  if (!rows?.length) return { labels: [], values: [] };
  const labels = rows.map(r => r[labelKey] ?? r.name ?? r.category ?? r.hostel ?? r.seller_name ?? '');
  const values = rows.map(r => Number(r[valueKey] ?? r.count ?? r.value ?? r.total_sales ?? 0));
  return { labels, values };
}

const LINE_COLOR = 'rgb(79, 70, 229)';
const BAR_COLOR  = 'rgba(79, 70, 229, 0.75)';

function renderLineChart(canvasId, rows, label) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (charts[canvasId]) charts[canvasId].destroy();

  const { labels, values } = buildLineDataset(rows);

  charts[canvasId] = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label,
        data:            values,
        fill:            true,
        borderColor:     LINE_COLOR,
        backgroundColor: 'rgba(79,70,229,0.08)',
        borderWidth:     2,
        tension:         0.35,
        pointRadius:     3,
        pointHoverRadius:5,
      }],
    },
    options: chartOptions(),
  });
}

function renderBarChart(canvasId, rows, label, extra = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (charts[canvasId]) charts[canvasId].destroy();

  const { labels, values } = buildBarDataset(rows);

  charts[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label,
        data:            values,
        backgroundColor: BAR_COLOR,
        borderRadius:    4,
        borderSkipped:   false,
      }],
    },
    options: { ...chartOptions(), ...extra },
  });
}

function chartOptions() {
  return {
    responsive:          true,
    maintainAspectRatio: true,
    plugins: {
      legend: { display: false },
      tooltip: { mode: 'index', intersect: false },
    },
    scales: {
      x: {
        grid:   { display: false },
        ticks:  { font: { size: 11 }, color: '#94a3b8', maxRotation: 45 },
      },
      y: {
        grid:   { color: 'rgba(0,0,0,0.05)' },
        ticks:  { font: { size: 11 }, color: '#94a3b8' },
        beginAtZero: true,
      },
    },
  };
}

// ── Analytics panel ────────────────────────────────────────────────

async function loadAnalytics() {
  const data = await getAnalytics();
  if (!data) return;

  // Analytics panel uses 'A'-suffixed canvas IDs to avoid conflict with overview canvases
  renderLineChart('chartSignupsA',    data.signups_daily,  'Signups');
  renderLineChart('chartListingsA',   data.listings_daily, 'Listings');
  renderBarChart( 'chartCategoryA',   data.by_category,    'Listings');
  renderBarChart( 'chartHostelA',     data.by_hostel,      'Listings');
  renderBarChart( 'chartTopSellersA', data.top_sellers,    'Sales', { indexAxis: 'y' });
}

// ── Analytics cache ────────────────────────────────────────────────

async function getAnalytics() {
  if (analyticsData) return analyticsData;

  // Check sessionStorage cache
  try {
    const cached = sessionStorage.getItem(ANALYTICS_CACHE_KEY);
    if (cached) {
      const { ts, data } = JSON.parse(cached);
      if (Date.now() - ts < ANALYTICS_CACHE_TTL) {
        analyticsData = data;
        return data;
      }
    }
  } catch {}

  try {
    const data = await api.admin.analytics();
    analyticsData = data;
    sessionStorage.setItem(ANALYTICS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
    return data;
  } catch (err) {
    toast.error('Analytics error', err.message);
    return null;
  }
}

// ── Users panel ────────────────────────────────────────────────────

async function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--color-text-muted); padding:var(--space-8);">Loading…</td></tr>';

  // Wire search (once)
  const searchInput = document.getElementById('userSearch');
  if (searchInput && !searchInput._wired) {
    searchInput._wired = true;
    searchInput.addEventListener('input', debounce(() => {
      usersState.search = searchInput.value.trim();
      usersState.page   = 1;
      loadUsers();
    }, 300));
  }

  try {
    const params = { page: usersState.page, limit: usersState.limit };
    if (usersState.search) params.search = usersState.search;

    const data = await api.admin.users(params);
    const users = data.users ?? data.items ?? data ?? [];
    usersState.total = data.total ?? users.length;

    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--color-text-muted); padding:var(--space-8);">No users found.</td></tr>';
      return;
    }

    tbody.innerHTML = users.map(u => `
      <tr>
        <td>
          <div style="font-weight:500;">${escapeHtml(u.full_name || '—')}</div>
        </td>
        <td style="color:var(--color-text-muted);">${escapeHtml(u.email || '')}</td>
        <td style="color:var(--color-text-muted);">${u.created_at ? new Date(u.created_at).toLocaleDateString('en-PK') : '—'}</td>
        <td>${escapeHtml(String(u.listing_count ?? '—'))}</td>
        <td>
          <span style="
            display:inline-block; padding:2px 8px; border-radius:var(--radius-full); font-size:var(--text-xs); font-weight:500;
            background:${u.is_banned ? 'var(--color-danger-light)' : 'var(--color-success-light,#dcfce7)'};
            color:${u.is_banned ? 'var(--color-danger)' : 'var(--color-success,#16a34a)'};
          ">${u.is_banned ? 'Banned' : 'Active'}</span>
        </td>
        <td>
          <button
            class="btn btn-ghost btn-sm admin-ban-btn"
            data-user-id="${u.id}"
            data-banned="${u.is_banned ? '1' : '0'}"
            style="font-size:var(--text-xs); ${u.is_banned ? '' : 'color:var(--color-danger);'}"
          >${u.is_banned ? 'Unban' : 'Ban'}</button>
        </td>
      </tr>
    `).join('');

    // Event delegation for ban/unban
    tbody.querySelectorAll('.admin-ban-btn').forEach(btn => {
      btn.addEventListener('click', () => handleBanToggle(btn));
    });

    renderAdminPagination('usersPagination', usersState, loadUsers);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--color-danger); padding:var(--space-8);">${escapeHtml(err.message)}</td></tr>`;
  }
}

async function handleBanToggle(btn) {
  const userId = Number(btn.dataset.userId);
  const isBanned = btn.dataset.banned === '1';
  btn.disabled = true;

  try {
    if (isBanned) {
      await api.admin.unbanUser(userId);
      toast.success('User unbanned.');
    } else {
      await api.admin.banUser(userId);
      toast.success('User banned.');
    }
    loadUsers();
  } catch (err) {
    toast.fromError(err);
    btn.disabled = false;
  }
}

// ── Listings panel ─────────────────────────────────────────────────

async function loadAdminListings() {
  const tbody = document.getElementById('listingsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--color-text-muted); padding:var(--space-8);">Loading…</td></tr>';

  try {
    const data    = await api.admin.listings({ page: listingsState.page, limit: listingsState.limit });
    const listings = data.listings ?? data.items ?? data ?? [];
    listingsState.total = data.total ?? listings.length;

    if (!listings.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--color-text-muted); padding:var(--space-8);">No listings found.</td></tr>';
      return;
    }

    tbody.innerHTML = listings.map(l => `
      <tr>
        <td>
          <a href="/pages/listing-detail.html?id=${l.id}" target="_blank" style="color:var(--color-primary); text-decoration:none; font-weight:500;">
            ${escapeHtml(truncate(l.title, 48))}
          </a>
        </td>
        <td style="color:var(--color-text-muted);">${escapeHtml(l.seller_name || l.seller?.full_name || '—')}</td>
        <td>${formatPrice(l.price)}</td>
        <td>
          <span style="
            display:inline-block; padding:2px 8px; border-radius:var(--radius-full); font-size:var(--text-xs); font-weight:500;
            background:${statusBg(l.status)}; color:${statusColor(l.status)};
          ">${escapeHtml(l.status || '—')}</span>
        </td>
        <td style="color:var(--color-text-muted);">${l.created_at ? timeAgo(l.created_at) : '—'}</td>
        <td>
          ${l.status !== 'removed' ? `
            <button
              class="btn btn-ghost btn-sm admin-remove-listing-btn"
              data-listing-id="${l.id}"
              style="color:var(--color-danger); font-size:var(--text-xs);"
            >Remove</button>
          ` : '<span style="color:var(--color-text-subtle); font-size:var(--text-xs);">Removed</span>'}
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.admin-remove-listing-btn').forEach(btn => {
      btn.addEventListener('click', () => handleRemoveListing(btn));
    });

    renderAdminPagination('listingsPagination', listingsState, loadAdminListings);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--color-danger); padding:var(--space-8);">${escapeHtml(err.message)}</td></tr>`;
  }
}

async function handleRemoveListing(btn) {
  if (!confirm('Remove this listing? It will be hidden from all users.')) return;
  const listingId = Number(btn.dataset.listingId);
  btn.disabled = true;

  try {
    await api.admin.removeListing(listingId);
    toast.success('Listing removed.');
    loadAdminListings();
  } catch (err) {
    toast.fromError(err);
    btn.disabled = false;
  }
}

// ── Reports panel ──────────────────────────────────────────────────

async function loadReports() {
  const list = document.getElementById('reportsList');
  if (!list) return;
  list.innerHTML = '<p style="color:var(--color-text-muted);">Loading…</p>';

  try {
    const data    = await api.admin.reports({ resolved: false, page: reportsState.page, limit: reportsState.limit });
    const reports = data.reports ?? data.items ?? data ?? [];

    if (!reports.length) {
      list.innerHTML = `
        <div class="empty-state">
          <p class="empty-state-title">No unresolved reports</p>
          <p class="empty-state-desc">All clear.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = reports.map(r => `
      <div style="
        background:var(--color-surface); border:1px solid var(--border-subtle);
        border-radius:var(--radius-lg); padding:var(--space-4);
      " data-report-id="${r.id}">
        <div style="display:flex; gap:var(--space-4); align-items:flex-start; flex-wrap:wrap;">
          <div style="flex:1; min-width:0;">
            <div style="font-weight:500; margin-bottom:var(--space-1);">
              <span style="color:var(--color-text-muted); font-size:var(--text-sm);">Reporter:</span>
              ${escapeHtml(r.reporter_name || r.reporter?.full_name || `User #${r.reporter_id}`)}
            </div>
            <div style="font-size:var(--text-sm); margin-bottom:var(--space-1);">
              <span style="color:var(--color-text-muted);">Target listing:</span>
              <a href="/pages/listing-detail.html?id=${r.listing_id}" target="_blank" style="color:var(--color-primary);">
                ${escapeHtml(truncate(r.listing_title || `#${r.listing_id}`, 60))}
              </a>
            </div>
            <div style="font-size:var(--text-sm); color:var(--color-text-muted); margin-bottom:var(--space-2);">
              <strong>Reason:</strong> ${escapeHtml(r.reason || '—')}
            </div>
            ${r.description ? `<p style="font-size:var(--text-sm); color:var(--color-text); margin-bottom:var(--space-2);">${escapeHtml(r.description)}</p>` : ''}
            <div style="font-size:var(--text-xs); color:var(--color-text-subtle);">${r.created_at ? timeAgo(r.created_at) : ''}</div>
          </div>
          <div style="display:flex; gap:var(--space-2); flex-shrink:0; flex-wrap:wrap;">
            <a href="/pages/listing-detail.html?id=${r.listing_id}" target="_blank" class="btn btn-ghost btn-sm">View</a>
            <button class="btn btn-primary btn-sm admin-resolve-btn" data-report-id="${r.id}">Resolve</button>
          </div>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.admin-resolve-btn').forEach(btn => {
      btn.addEventListener('click', () => handleResolveReport(btn));
    });
  } catch (err) {
    list.innerHTML = `<p style="color:var(--color-danger);">${escapeHtml(err.message)}</p>`;
  }
}

async function handleResolveReport(btn) {
  const reportId = Number(btn.dataset.reportId);
  btn.disabled = true;

  try {
    await api.admin.resolveReport(reportId, { action: 'resolved' });
    toast.success('Report resolved.');
    // Remove card from DOM
    const card = btn.closest('[data-report-id]');
    if (card) card.remove();
    // Update sidebar badge
    const badge = document.getElementById('reportsBadge');
    if (badge) {
      const cur = parseInt(badge.textContent) || 0;
      const next = cur - 1;
      if (next <= 0) { badge.style.display = 'none'; }
      else { badge.textContent = next > 99 ? '99+' : String(next); }
    }
  } catch (err) {
    toast.fromError(err);
    btn.disabled = false;
  }
}

// ── Backup ─────────────────────────────────────────────────────────

function wireBackup() {
  const btn = document.getElementById('triggerBackupBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!confirm('Trigger a manual backup now?')) return;
    btn.disabled = true;
    btn.textContent = 'Running…';

    try {
      await api.admin.backup();
      toast.success('Backup triggered successfully.');
    } catch (err) {
      toast.error('Backup failed', err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Run Backup
      `;
    }
  });
}

// ── Logout ─────────────────────────────────────────────────────────

function wireLogout() {
  const btn = document.getElementById('logoutBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    try { await api.auth.logout(); } catch {}
    auth.clearSession();
    navigate('home');
  });
}

// ── Pagination helper ──────────────────────────────────────────────

function renderAdminPagination(barId, state, loadFn) {
  const bar = document.getElementById(barId);
  if (!bar) return;
  const totalPages = Math.ceil(state.total / state.limit) || 1;
  if (totalPages <= 1) { bar.innerHTML = ''; return; }

  bar.innerHTML = `
    <button class="btn btn-ghost btn-sm" ${state.page <= 1 ? 'disabled' : ''} id="${barId}Prev">← Prev</button>
    <span style="font-size:var(--text-sm); color:var(--color-text-muted); padding:0 var(--space-3);">
      Page ${state.page} of ${totalPages}
    </span>
    <button class="btn btn-ghost btn-sm" ${state.page >= totalPages ? 'disabled' : ''} id="${barId}Next">Next →</button>
  `;

  bar.querySelector(`#${barId}Prev`)?.addEventListener('click', () => {
    if (state.page > 1) { state.page--; loadFn(); }
  });
  bar.querySelector(`#${barId}Next`)?.addEventListener('click', () => {
    if (state.page < totalPages) { state.page++; loadFn(); }
  });
}

// ── Misc helpers ───────────────────────────────────────────────────

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function statusBg(status) {
  const map = { active: '#dcfce7', sold: '#dbeafe', expired: '#f1f5f9', removed: '#fee2e2' };
  return map[status] || '#f1f5f9';
}

function statusColor(status) {
  const map = { active: '#16a34a', sold: '#2563eb', expired: '#64748b', removed: '#dc2626' };
  return map[status] || '#64748b';
}
