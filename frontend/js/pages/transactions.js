/**
 * transactions.js — Transactions page controller.
 * Tabs: Buying | Selling.
 * Each row: listing thumb, title, other party, agreed price, status badge, date.
 * Click row → modal with timeline + action buttons.
 * Actions:
 *   pending_completion: buyer → confirmBuyer ("Mark as received"), seller → confirmSeller ("Mark as handed over")
 *   completed, no review: "Leave review" → review sub-modal
 *   completed + review exists: show review inline
 *   cancellable: "Cancel" → reason input modal
 */

let activeRole   = 'buying';   // 'buying' | 'selling'
let currentPage  = 1;
const PAGE_SIZE  = 20;

let openTxId     = null;  // transaction currently open in modal
let reviewTxId   = null;  // transaction for review submission

// ── Boot ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initRouter();
  if (!auth.requireAuth()) return;

  wireTabs();
  wireModal();
  wireReviewModal();
  wireCancelModal();
  await loadTransactions();
});

// ── Tabs ──────────────────────────────────────────────────────────
function wireTabs() {
  document.querySelectorAll('.tab-btn[data-role]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.dataset.role === activeRole) return;
      activeRole  = btn.dataset.role;
      currentPage = 1;

      document.querySelectorAll('.tab-btn[data-role]').forEach(b => {
        const on = b.dataset.role === activeRole;
        b.style.color        = on ? 'var(--color-primary)' : 'var(--color-text-muted)';
        b.style.borderBottom = on ? '2px solid var(--color-primary)' : '2px solid transparent';
      });

      await loadTransactions();
    });
  });
}

// ── Load + render list ────────────────────────────────────────────
async function loadTransactions() {
  const list = document.getElementById('txList');
  list.innerHTML = '<p style="color:var(--color-text-subtle);">Loading…</p>';

  try {
    const data = await api.transactions.list({
      role:  activeRole,
      page:  currentPage,
      limit: PAGE_SIZE,
    });

    const txs   = Array.isArray(data) ? data : (data?.transactions || []);
    const total = data?.total ?? txs.length;

    if (!txs.length) {
      showEmptyState(list, {
        title: activeRole === 'buying' ? 'No purchases yet' : 'No sales yet',
        desc:  activeRole === 'buying' ? 'Accept an offer to start a transaction.' : 'When you accept an offer, it appears here.',
      });
      document.getElementById('paginationBar').innerHTML = '';
      return;
    }

    list.innerHTML = txs.map(tx => renderTxRow(tx)).join('');

    // Row click → open detail modal
    list.querySelectorAll('.tx-item[data-id]').forEach(row => {
      row.addEventListener('click', () => openTxModal(row.dataset.id, txs));
    });

    renderPagination(total);
  } catch (err) {
    list.innerHTML = `<p style="color:var(--color-danger); padding: var(--space-4);">${escapeHtml(err.message)}</p>`;
  }
}

function renderTxRow(tx) {
  const listing    = tx.listing || {};
  const thumb      = imgUrl(listing.thumbnail || listing.images?.[0]?.url || listing.image_url);
  const title      = listing.title || `Transaction #${tx.id}`;
  const otherParty = activeRole === 'buying' ? (tx.seller || {}) : (tx.buyer || {});
  const partyName  = otherParty.name || otherParty.full_name || '—';
  const price      = formatPrice(tx.agreed_price ?? tx.amount);
  const badge      = txStatusBadge(tx.status);
  const when       = timeAgo(tx.created_at || tx.createdAt);

  return `
    <div class="tx-item" data-id="${tx.id}">
      ${thumb
        ? `<img class="tx-thumb" src="${escapeHtml(thumb)}" alt="${escapeHtml(title)}" loading="lazy">`
        : `<div class="tx-thumb"></div>`}
      <div style="flex:1; min-width:0;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap: var(--space-2); flex-wrap:wrap;">
          <span style="font-weight:600; font-size:var(--text-base); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:280px;" title="${escapeHtml(title)}">${escapeHtml(truncate(title, 60))}</span>
          ${badge}
        </div>
        <div style="font-size:var(--text-sm); color:var(--color-text-muted); margin-top: var(--space-1);">
          ${activeRole === 'buying' ? 'Seller' : 'Buyer'}: <strong>${escapeHtml(partyName)}</strong>
        </div>
        <div style="font-size:var(--text-sm); margin-top: var(--space-1);">
          Agreed: <strong style="color:var(--color-primary);">${price}</strong>
        </div>
        <div style="font-size:var(--text-xs); color:var(--color-text-subtle); margin-top: var(--space-1);">${when}</div>
      </div>
      <svg style="flex-shrink:0; color:var(--color-text-subtle);" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </div>
  `;
}

function txStatusBadge(status) {
  const map = {
    pending_completion: ['var(--color-warning, #d97706)',  'var(--color-warning-bg, #fffbeb)',  'In Progress'],
    completed:          ['var(--color-success, #16a34a)',  'var(--color-success-bg, #f0fdf4)',  'Completed'],
    cancelled:          ['var(--color-text-subtle)',       'var(--color-surface-muted)',         'Cancelled'],
    disputed:           ['var(--color-danger)',    'rgba(220,38,38,0.1)',               'Disputed'],
  };
  const [color, bg, label] = map[status] || ['var(--color-text-subtle)', 'var(--color-surface-muted)', status || '—'];
  return `<span style="font-size:var(--text-xs); font-weight:600; padding: 2px 8px; border-radius: var(--radius-full); background:${bg}; color:${color}; white-space:nowrap;">${escapeHtml(label)}</span>`;
}

// ── Transaction detail modal ──────────────────────────────────────
function wireModal() {
  document.getElementById('closeTxModal').addEventListener('click', closeTxModal);
  document.getElementById('txModal').addEventListener('click', e => {
    if (e.target === document.getElementById('txModal')) closeTxModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('txModal').style.display !== 'none') closeTxModal();
  });
}

function closeTxModal() {
  document.getElementById('txModal').style.display = 'none';
  openTxId = null;
}

async function openTxModal(txId, cachedTxs) {
  openTxId = txId;
  const modal = document.getElementById('txModal');
  const body  = document.getElementById('txModalBody');
  const foot  = document.getElementById('txModalFooter');

  body.innerHTML = '<p style="color:var(--color-text-subtle);">Loading…</p>';
  foot.innerHTML = '';
  modal.style.display = '';

  try {
    const tx = await api.transactions.get(txId);
    renderTxDetail(tx);
  } catch (err) {
    body.innerHTML = `<p style="color:var(--color-danger);">${escapeHtml(err.message)}</p>`;
  }
}

async function renderTxDetail(tx) {
  const me      = auth.getUser();
  const body    = document.getElementById('txModalBody');
  const foot    = document.getElementById('txModalFooter');
  const listing = tx.listing || {};
  const buyer   = tx.buyer   || {};
  const seller  = tx.seller  || {};
  const isBuyer = String(me?.id) === String(buyer.id || buyer.user_id);

  const thumb = imgUrl(listing.thumbnail || listing.images?.[0]?.url || listing.image_url);

  // Build review section
  let reviewSection = '';
  try {
    if (tx.status === 'completed') {
      const reviews = await api.reviews.forTransaction(tx.id);
      const myReview = Array.isArray(reviews)
        ? reviews.find(r => String(r.reviewer_id || r.reviewer?.id) === String(me?.id))
        : null;

      if (myReview) {
        reviewSection = `
          <div style="margin-top: var(--space-5); padding: var(--space-4); background: var(--color-surface-muted); border-radius: var(--radius-md);">
            <div style="font-weight:600; margin-bottom: var(--space-2);">Your review</div>
            <div style="color: var(--color-warning, #d97706); font-size: var(--text-lg);">${'★'.repeat(myReview.rating)}${'☆'.repeat(5 - myReview.rating)}</div>
            ${myReview.comment ? `<p style="margin-top: var(--space-2); font-size:var(--text-sm); color:var(--color-text-muted);">${escapeHtml(myReview.comment)}</p>` : ''}
          </div>
        `;
      }
    }
  } catch { /* no reviews endpoint or not completed */ }

  body.innerHTML = `
    <!-- Listing summary -->
    <div style="display:flex; gap: var(--space-4); margin-bottom: var(--space-5);">
      ${thumb ? `<img src="${escapeHtml(thumb)}" alt="${escapeHtml(listing.title || '')}" style="width:80px; height:80px; object-fit:cover; border-radius:var(--radius-md); flex-shrink:0;">` : ''}
      <div>
        <div style="font-weight:600;">${escapeHtml(listing.title || `Transaction #${tx.id}`)}</div>
        <div style="font-size:var(--text-sm); color:var(--color-text-muted); margin-top: var(--space-1);">Agreed price: <strong style="color:var(--color-primary);">${formatPrice(tx.agreed_price ?? tx.amount)}</strong></div>
      </div>
    </div>

    <!-- Parties -->
    <div style="display:grid; grid-template-columns:1fr 1fr; gap: var(--space-4); margin-bottom: var(--space-5);">
      <div style="padding: var(--space-3); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
        <div style="font-size:var(--text-xs); font-weight:600; color:var(--color-text-subtle); margin-bottom: var(--space-1);">BUYER</div>
        <div style="font-weight:500;">${escapeHtml(buyer.name || buyer.full_name || '—')}</div>
      </div>
      <div style="padding: var(--space-3); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
        <div style="font-size:var(--text-xs); font-weight:600; color:var(--color-text-subtle); margin-bottom: var(--space-1);">SELLER</div>
        <div style="font-weight:500;">${escapeHtml(seller.name || seller.full_name || '—')}</div>
      </div>
    </div>

    <!-- Timeline -->
    <div style="margin-bottom: var(--space-5);">
      <div style="font-size:var(--text-sm); font-weight:600; margin-bottom: var(--space-3);">Timeline</div>
      ${buildTimeline(tx)}
    </div>

    ${reviewSection}
  `;

  // Footer action buttons
  const footBtns = [];

  if (tx.status === 'pending_completion') {
    if (isBuyer && !tx.buyer_confirmed) {
      footBtns.push(`<button class="btn btn-primary" id="txConfirmBtn">Mark as received</button>`);
    } else if (!isBuyer && !tx.seller_confirmed) {
      footBtns.push(`<button class="btn btn-primary" id="txConfirmBtn">Mark as handed over</button>`);
    }
  }

  if (tx.status === 'completed') {
    // Only show "Leave review" if no review yet and we fetched reviewSection without a found review
    if (!reviewSection) {
      footBtns.push(`<button class="btn btn-primary" id="txReviewBtn">Leave review</button>`);
    }
  }

  const cancellable = tx.status === 'pending_completion';
  if (cancellable) {
    footBtns.push(`<button class="btn btn-ghost" id="txCancelBtn" style="color:var(--color-danger);">Cancel transaction</button>`);
  }

  footBtns.push(`<button class="btn btn-ghost" id="txCloseFooterBtn">Close</button>`);
  foot.innerHTML = footBtns.join('');

  // Wire footer buttons
  document.getElementById('txCloseFooterBtn')?.addEventListener('click', closeTxModal);

  document.getElementById('txConfirmBtn')?.addEventListener('click', async btn => {
    const el = document.getElementById('txConfirmBtn');
    el.disabled    = true;
    el.textContent = '…';
    try {
      if (isBuyer) await api.transactions.confirmBuyer(tx.id);
      else         await api.transactions.confirmSeller(tx.id);
      toast.success('Confirmed!');
      closeTxModal();
      await loadTransactions();
    } catch (err) {
      el.disabled    = false;
      el.textContent = isBuyer ? 'Mark as received' : 'Mark as handed over';
      toast.fromError(err);
    }
  });

  document.getElementById('txReviewBtn')?.addEventListener('click', () => {
    reviewTxId = tx.id;
    openReviewModal(tx);
  });

  document.getElementById('txCancelBtn')?.addEventListener('click', () => {
    openCancelModal(tx.id);
  });
}

function buildTimeline(tx) {
  const steps = [
    { label: 'Offer accepted',      done: true,                                      time: tx.created_at || tx.createdAt },
    { label: 'Buyer confirmed',     done: !!tx.buyer_confirmed,                      time: tx.buyer_confirmed_at },
    { label: 'Seller confirmed',    done: !!tx.seller_confirmed,                     time: tx.seller_confirmed_at },
    { label: 'Completed',           done: tx.status === 'completed',                 time: tx.completed_at },
  ];

  return `
    <div style="display:flex; flex-direction:column; gap: var(--space-2);">
      ${steps.map((s, i) => `
        <div style="display:flex; gap: var(--space-3); align-items:flex-start;">
          <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
            <div style="width:20px; height:20px; border-radius:50%; background:${s.done ? 'var(--color-success, #16a34a)' : 'var(--color-surface-muted)'}; border:2px solid ${s.done ? 'var(--color-success, #16a34a)' : 'var(--border-subtle)'}; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              ${s.done ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
            </div>
            ${i < steps.length - 1 ? `<div style="width:2px; height:20px; background:${s.done ? 'var(--color-success, #16a34a)' : 'var(--border-subtle)'};"></div>` : ''}
          </div>
          <div style="padding-bottom: var(--space-2);">
            <div style="font-size:var(--text-sm); font-weight:${s.done ? '500' : '400'}; color:${s.done ? 'var(--color-text)' : 'var(--color-text-subtle)'};">${escapeHtml(s.label)}</div>
            ${s.time ? `<div style="font-size:var(--text-xs); color:var(--color-text-subtle);">${timeAgo(s.time)}</div>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ── Review modal ──────────────────────────────────────────────────
function openReviewModal(tx) {
  const m = document.getElementById('reviewModal');
  document.getElementById('reviewStarError').style.display = 'none';
  document.getElementById('reviewComment').value = '';
  // Reset stars
  document.querySelectorAll('.star-btn').forEach(s => s.classList.remove('selected'));
  m.style.display = '';
  document.getElementById('reviewModal').dataset.txId = tx.id;
  // Figure out who is being reviewed
  const me   = auth.getUser();
  const isBuyer = String(me?.id) === String(tx.buyer?.id || tx.buyer?.user_id);
  const target  = isBuyer ? (tx.seller || {}) : (tx.buyer || {});
  document.getElementById('reviewTargetName').textContent = target.name || target.full_name || 'other party';
  document.getElementById('reviewModal').dataset.targetId = target.id || target.user_id || '';
}

function wireReviewModal() {
  // Build star buttons
  const starsEl = document.getElementById('reviewStars');
  starsEl.innerHTML = [1,2,3,4,5].map(n => `
    <button type="button" class="star-btn" data-val="${n}" style="font-size:28px; background:none; border:none; cursor:pointer; color:var(--color-text-subtle); padding: 0 2px; transition: color var(--duration-fast) var(--ease-out);">★</button>
  `).join('');

  let selectedRating = 0;

  starsEl.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('mouseover', () => {
      starsEl.querySelectorAll('.star-btn').forEach(b => {
        b.style.color = Number(b.dataset.val) <= Number(btn.dataset.val)
          ? 'var(--color-warning, #d97706)' : 'var(--color-text-subtle)';
      });
    });
    btn.addEventListener('mouseleave', () => {
      starsEl.querySelectorAll('.star-btn').forEach(b => {
        b.style.color = Number(b.dataset.val) <= selectedRating
          ? 'var(--color-warning, #d97706)' : 'var(--color-text-subtle)';
      });
    });
    btn.addEventListener('click', () => {
      selectedRating = Number(btn.dataset.val);
    });
  });

  document.getElementById('closeReviewModal').addEventListener('click', closeReviewModal);
  document.getElementById('reviewCancelBtn').addEventListener('click', closeReviewModal);
  document.getElementById('reviewModal').addEventListener('click', e => {
    if (e.target === document.getElementById('reviewModal')) closeReviewModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('reviewModal').style.display !== 'none') closeReviewModal();
  });

  document.getElementById('reviewSubmitBtn').addEventListener('click', async () => {
    const errEl = document.getElementById('reviewStarError');
    if (!selectedRating) {
      errEl.textContent   = 'Select a star rating.';
      errEl.style.display = '';
      return;
    }
    errEl.style.display = 'none';

    const modal    = document.getElementById('reviewModal');
    const txId     = modal.dataset.txId;
    const targetId = modal.dataset.targetId;
    const comment  = document.getElementById('reviewComment').value.trim();

    const submitBtn      = document.getElementById('reviewSubmitBtn');
    submitBtn.disabled   = true;
    submitBtn.textContent = '…';

    try {
      await api.reviews.create({
        transaction_id: txId,
        reviewee_id:    targetId,
        rating:         selectedRating,
        comment:        comment || undefined,
      });
      toast.success('Review submitted!');
      closeReviewModal();
      // Re-open tx detail with fresh data
      await openTxModal(txId, []);
    } catch (err) {
      errEl.textContent   = err.message || 'Failed to submit review.';
      errEl.style.display = '';
      submitBtn.disabled   = false;
      submitBtn.textContent = 'Submit review';
    }
  });
}

function closeReviewModal() {
  document.getElementById('reviewModal').style.display = 'none';
}

// ── Cancel modal ──────────────────────────────────────────────────
function openCancelModal(txId) {
  document.getElementById('cancelReason').value       = '';
  document.getElementById('cancelError').style.display = 'none';
  document.getElementById('cancelModal').dataset.txId = txId;
  document.getElementById('cancelModal').style.display = '';
}

function wireCancelModal() {
  document.getElementById('closeCancelModal').addEventListener('click', closeCancelModal);
  document.getElementById('cancelBackBtn').addEventListener('click',  closeCancelModal);
  document.getElementById('cancelModal').addEventListener('click', e => {
    if (e.target === document.getElementById('cancelModal')) closeCancelModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('cancelModal').style.display !== 'none') closeCancelModal();
  });

  document.getElementById('cancelSubmitBtn').addEventListener('click', async () => {
    const reason = document.getElementById('cancelReason').value.trim();
    const errEl  = document.getElementById('cancelError');
    if (!reason) {
      errEl.textContent   = 'Please provide a reason.';
      errEl.style.display = '';
      return;
    }
    errEl.style.display = 'none';

    const txId      = document.getElementById('cancelModal').dataset.txId;
    const btn       = document.getElementById('cancelSubmitBtn');
    btn.disabled    = true;
    btn.textContent = '…';

    try {
      await api.transactions.cancel(txId, { reason });
      toast.success('Transaction cancelled.');
      closeCancelModal();
      closeTxModal();
      await loadTransactions();
    } catch (err) {
      errEl.textContent   = err.message || 'Failed to cancel.';
      errEl.style.display = '';
      btn.disabled    = false;
      btn.textContent = 'Confirm cancel';
    }
  });
}

function closeCancelModal() {
  document.getElementById('cancelModal').style.display = 'none';
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
      await loadTransactions();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}
