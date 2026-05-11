/**
 * reviews.js — Standalone reviews page.
 * Tab 1 "Leave Review": completed transactions where logged-in user hasn't reviewed yet.
 * Tab 2 "Reviews Received": reviews left on logged-in user's profile.
 */

let activeTab      = 'pending';
let selectedRating = 0;
let pendingTxId    = null;
let pendingTargetId = null;

// ── Boot ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initRouter();
  if (!auth.requireAuth()) return;

  wireTabs();
  wireReviewModal();
  await loadPending();
});

// ── Tabs ──────────────────────────────────────────────────────────
function wireTabs() {
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.dataset.tab === activeTab) return;
      activeTab = btn.dataset.tab;

      document.querySelectorAll('.tab-btn[data-tab]').forEach(b => {
        const on = b.dataset.tab === activeTab;
        b.style.color        = on ? 'var(--primary)' : 'var(--steel)';
        b.style.borderBottom = on ? '2px solid var(--primary)' : '2px solid transparent';
      });

      document.getElementById('tabPending').style.display  = activeTab === 'pending'  ? '' : 'none';
      document.getElementById('tabReceived').style.display = activeTab === 'received' ? '' : 'none';

      if (activeTab === 'received') await loadReceived();
    });
  });
}

// ── Pending (Leave Review) ────────────────────────────────────────
async function loadPending() {
  const container = document.getElementById('pendingList');
  container.innerHTML = '<p style="color:var(--stone);">Loading…</p>';

  try {
    const me = auth.getUser();
    const data = await api.transactions.list({ role: 'buying', limit: 50 });
    const buying = Array.isArray(data) ? data : (data?.transactions || []);

    const dataSell = await api.transactions.list({ role: 'selling', limit: 50 });
    const selling = Array.isArray(dataSell) ? dataSell : (dataSell?.transactions || []);

    const all = [...buying, ...selling];
    const completed = all.filter(tx => tx.status === 'completed');

    if (!completed.length) {
      showEmptyState(container, { title: 'No completed transactions', desc: 'Complete a transaction to leave a review.' });
      return;
    }

    // Check each completed transaction for existing review from me
    const reviewable = [];
    for (const tx of completed) {
      try {
        const reviews = await api.reviews.forTransaction(tx.id);
        const myReview = Array.isArray(reviews)
          ? reviews.find(r => String(r.reviewer_id || r.reviewer?.id) === String(me?.id))
          : null;
        if (!myReview) reviewable.push(tx);
      } catch {
        reviewable.push(tx); // assume no review on error
      }
    }

    if (!reviewable.length) {
      showEmptyState(container, {
        title: 'All reviewed!',
        desc: 'You\'ve reviewed all your completed transactions.',
      });
      return;
    }

    container.innerHTML = reviewable.map(tx => renderPendingRow(tx, me)).join('');

    container.querySelectorAll('.leave-review-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const txId     = btn.dataset.txId;
        const targetId = btn.dataset.targetId;
        const name     = btn.dataset.targetName;
        openReviewModal(txId, targetId, name);
      });
    });

  } catch (err) {
    container.innerHTML = `<p style="color:var(--color-danger);">${escapeHtml(err.message)}</p>`;
  }
}

function renderPendingRow(tx, me) {
  const listing = tx.listing || {};
  const isBuyer = String(me?.id) === String(tx.buyer?.id || tx.buyer?.user_id);
  const target  = isBuyer ? (tx.seller || {}) : (tx.buyer || {});
  const targetName = target.full_name || target.name || 'Other party';
  const targetId   = target.id || target.user_id || '';
  const thumb      = imgUrl(listing.thumbnail || listing.images?.[0]?.url || listing.image_url);
  const title      = listing.title || `Transaction #${tx.id}`;
  const role       = isBuyer ? 'Bought from' : 'Sold to';

  return `
    <div style="display:flex; gap:var(--space-4); align-items:center; padding:var(--space-4) 0; border-bottom:1px solid var(--border-subtle);">
      ${thumb
        ? `<img src="${escapeHtml(thumb)}" alt="${escapeHtml(title)}" style="width:56px; height:56px; object-fit:cover; border-radius:var(--radius-md); flex-shrink:0;">`
        : `<div style="width:56px; height:56px; background:var(--color-surface-muted); border-radius:var(--radius-md); flex-shrink:0;"></div>`}
      <div style="flex:1; min-width:0;">
        <div style="font-weight:500; font-size:var(--text-sm); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(truncate(title, 50))}</div>
        <div style="font-size:var(--text-xs); color:var(--steel); margin-top:2px;">${escapeHtml(role)}: <strong>${escapeHtml(targetName)}</strong></div>
        <div style="font-size:var(--text-xs); color:var(--stone); margin-top:2px;">${timeAgo(tx.created_at)}</div>
      </div>
      <button
        class="btn btn-primary btn-sm leave-review-btn"
        data-tx-id="${escapeHtml(String(tx.id))}"
        data-target-id="${escapeHtml(String(targetId))}"
        data-target-name="${escapeHtml(targetName)}"
      >Leave review</button>
    </div>
  `;
}

// ── Reviews Received ──────────────────────────────────────────────
async function loadReceived() {
  const container = document.getElementById('receivedList');
  container.innerHTML = '<p style="color:var(--stone);">Loading…</p>';

  try {
    const me = auth.getUser();
    const data = await api.users.getUserReviews(me.id, { page: 1, limit: 50 });
    const reviews = Array.isArray(data) ? data : (data?.reviews || []);

    if (!reviews.length) {
      showEmptyState(container, { title: 'No reviews yet', desc: 'Reviews from buyers and sellers will appear here.' });
      return;
    }

    container.innerHTML = reviews.map(r => renderReceivedReview(r)).join('');
  } catch (err) {
    container.innerHTML = `<p style="color:var(--color-danger);">${escapeHtml(err.message)}</p>`;
  }
}

function renderReceivedReview(r) {
  const stars = renderStars(r.rating);
  return `
    <div style="padding:var(--space-4) 0; border-bottom:1px solid var(--border-subtle);">
      <div style="display:flex; align-items:center; gap:var(--space-3); margin-bottom:var(--space-2);">
        <div class="avatar-placeholder avatar-sm" style="font-size:var(--text-xs);">${escapeHtml(initials(r.reviewer_name || '?'))}</div>
        <div>
          <div style="font-weight:500; font-size:var(--text-sm);">${escapeHtml(r.reviewer_name || 'Anonymous')}</div>
          <div style="font-size:var(--text-xs); color:var(--stone);">${timeAgo(r.created_at)}</div>
        </div>
        <span style="margin-left:auto; color:#fa520f; font-size:var(--text-base);" title="${r.rating}/5">${stars}</span>
      </div>
      ${r.comment ? `<p style="font-size:var(--text-sm); color:var(--steel); line-height:1.5;">${escapeHtml(r.comment)}</p>` : ''}
    </div>
  `;
}

// ── Star renderer (display only) ──────────────────────────────────
function renderStars(rating, max = 5) {
  let html = '';
  for (let i = 1; i <= max; i++) {
    html += `<span style="color:${i <= rating ? '#fa520f' : 'var(--border-subtle)'};">★</span>`;
  }
  return html;
}

// ── Review modal ──────────────────────────────────────────────────
function openReviewModal(txId, targetId, targetName) {
  pendingTxId     = txId;
  pendingTargetId = targetId;
  selectedRating  = 0;

  document.getElementById('reviewTargetName').textContent = targetName;
  document.getElementById('reviewComment').value          = '';
  document.getElementById('reviewStarError').style.display = 'none';

  // Reset star display
  document.querySelectorAll('.star-btn').forEach(s => {
    s.style.color = 'var(--stone)';
  });

  document.getElementById('reviewModal').style.display = 'flex';
}

function closeReviewModal() {
  document.getElementById('reviewModal').style.display = 'none';
  pendingTxId     = null;
  pendingTargetId = null;
  selectedRating  = 0;
}

function wireReviewModal() {
  const starsEl = document.getElementById('reviewStars');

  starsEl.innerHTML = [1,2,3,4,5].map(n => `
    <button type="button" class="star-btn" data-val="${n}" style="font-size:32px; background:none; border:none; cursor:pointer; color:var(--stone); padding:0 2px; line-height:1; transition:color 0.1s;">★</button>
  `).join('');

  starsEl.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('mouseover', () => {
      starsEl.querySelectorAll('.star-btn').forEach(b => {
        b.style.color = Number(b.dataset.val) <= Number(btn.dataset.val) ? '#fa520f' : 'var(--stone)';
      });
    });
    btn.addEventListener('mouseleave', () => {
      starsEl.querySelectorAll('.star-btn').forEach(b => {
        b.style.color = Number(b.dataset.val) <= selectedRating ? '#fa520f' : 'var(--stone)';
      });
    });
    btn.addEventListener('click', () => {
      selectedRating = Number(btn.dataset.val);
      starsEl.querySelectorAll('.star-btn').forEach(b => {
        b.style.color = Number(b.dataset.val) <= selectedRating ? '#fa520f' : 'var(--stone)';
      });
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

    const comment   = document.getElementById('reviewComment').value.trim();
    const submitBtn = document.getElementById('reviewSubmitBtn');
    submitBtn.disabled    = true;
    submitBtn.textContent = '…';

    try {
      await api.reviews.create({
        transaction_id: pendingTxId,
        reviewee_id:    pendingTargetId,
        rating:         selectedRating,
        comment:        comment || undefined,
      });
      toast.success('Review submitted!');
      closeReviewModal();
      await loadPending(); // refresh list to remove reviewed item
    } catch (err) {
      errEl.textContent   = err.message || 'Failed to submit review.';
      errEl.style.display = '';
    } finally {
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Submit review';
    }
  });
}
