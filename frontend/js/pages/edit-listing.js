/**
 * edit-listing.js — Edit listing controller.
 * Loads GET /listings/:id, prefills form, owner-guards.
 * Existing images: hover overlay → DELETE /listings/:id/images/:imgId.
 * New images: FileReader preview, uploaded via POST /listings/:id/images after PATCH.
 * Submit → PATCH /listings/:id (text fields only).
 * SPECS 3.3: title 5-100, desc 20-2000, price 0-10M integer, location required.
 * Cannot edit: category, images via PATCH.
 */

const EDIT_MAX_IMAGES    = 8;
const EDIT_MAX_FILE_BYTES = 5 * 1024 * 1024;
const EDIT_ALLOWED_MIME  = new Set(['image/jpeg', 'image/png', 'image/webp']);

const EDIT_CATS_FALLBACK = [
  { id: 1, name: 'Books & Notes' },
  { id: 2, name: 'Electronics' },
  { id: 3, name: 'Furniture' },
  { id: 4, name: 'Bikes & Cycles' },
  { id: 5, name: 'Clothing' },
  { id: 6, name: 'Stationery' },
  { id: 7, name: 'Hostel Essentials' },
  { id: 8, name: 'Sports' },
  { id: 9, name: 'Other' },
];

let listingId      = null;
/** @type {{ id: number, url: string }[]} */
let existingImages = [];
/** @type {File[]} */
let newFiles       = [];

// ── Boot ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initRouter();
  if (!auth.requireAuth()) return;

  const params = new URLSearchParams(window.location.search);
  listingId    = params.get('id');
  if (!listingId) { window.location.href = '/pages/my-listings.html'; return; }

  await Promise.all([loadCategories(), loadListing()]);
});

// ── Load + prefill ────────────────────────────────────────────────
async function loadListing() {
  try {
    const listing = await api.listings.get(listingId);

    // Owner guard
    const me       = auth.getUser();
    const sellerId = listing.seller?.id || listing.seller?.user_id || listing.user_id;
    if (me && String(me.id) !== String(sellerId)) {
      window.location.href = `/pages/listing-detail.html?id=${listingId}`;
      return;
    }

    prefill(listing);

    document.getElementById('loadingSkeleton').style.display = 'none';
    document.getElementById('editContent').style.display     = '';

    const viewLink = document.getElementById('viewListingLink');
    if (viewLink) viewLink.href = `/pages/listing-detail.html?id=${listingId}`;

    wireUpload();
    wireForm();
  } catch (err) {
    toast.fromError(err);
    setTimeout(() => { window.location.href = '/pages/my-listings.html'; }, 1500);
  }
}

function prefill(listing) {
  document.title = `Edit: ${listing.title} — NusTrade`;

  document.getElementById('title').value       = listing.title       || '';
  document.getElementById('description').value = listing.description || '';
  document.getElementById('price').value       = listing.price       ?? '';
  const locSel = document.getElementById('locationHostel');
  const locVal = listing.is_off_campus ? 'off_campus' : (listing.location_hostel || listing.location || '');
  if (locVal) locSel.value = locVal;
  document.getElementById('isNegotiable').checked = !!(listing.is_negotiable || listing.isNegotiable);

  // Condition
  const condSel = document.getElementById('condition');
  if (listing.condition) condSel.value = listing.condition;

  // Category — set after loadCategories resolves (called in parallel, both await Promise.all)
  // Store for retry after options populate
  const catSel = document.getElementById('category');
  const catId  = String(listing.category_id || listing.categoryId || '');
  // Try immediately, retry once options are in DOM (loadCategories appends them)
  catSel.value = catId;
  if (catSel.value !== catId) {
    // Options not ready yet — set via MutationObserver
    const obs = new MutationObserver(() => {
      catSel.value = catId;
      if (catSel.value === catId) obs.disconnect();
    });
    obs.observe(catSel, { childList: true });
  }

  // Existing images
  existingImages = listing.images || [];
  renderExisting();
}

// ── Existing images ───────────────────────────────────────────────
function renderExisting() {
  const grid = document.getElementById('existingImages');
  if (!existingImages.length) {
    grid.innerHTML = '<p style="color:var(--color-text-subtle); font-size:var(--text-sm);">No photos yet.</p>';
    return;
  }

  grid.innerHTML = existingImages.map(img => `
    <div class="existing-img-item" data-img-id="${img.id || img.image_id}">
      <img src="${imgUrl(img.url || img.image_url)}" alt="Photo" loading="lazy">
      <div class="img-remove-overlay">
        <button type="button" class="btn btn-danger btn-sm"
          style="font-size:var(--text-xs); padding: var(--space-1) var(--space-2);"
          data-remove="${img.id || img.image_id}">Remove</button>
      </div>
    </div>
  `).join('');

  grid.addEventListener('click', async e => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;

    const total = existingImages.length + newFiles.length;
    if (total <= 1) {
      toast.warning('Need at least 1 photo', 'Upload another before removing this one.');
      return;
    }

    const imgId = btn.dataset.remove;
    btn.disabled     = true;
    btn.textContent  = '…';

    try {
      await api.listings.removeImage(listingId, imgId);
      existingImages = existingImages.filter(i => String(i.id || i.image_id) !== String(imgId));
      renderExisting();
      toast.success('Photo removed');
    } catch (err) {
      btn.disabled    = false;
      btn.textContent = 'Remove';
      toast.fromError(err);
    }
  }, { once: false });
}

// ── New image upload ──────────────────────────────────────────────
function wireUpload() {
  const area  = document.getElementById('uploadArea');
  const input = document.getElementById('imageInput');

  area.addEventListener('click', () => input.click());
  area.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') input.click(); });

  input.addEventListener('change', () => { addNewFiles([...input.files]); input.value = ''; });

  area.addEventListener('dragover',  e => { e.preventDefault(); area.classList.add('drag-over'); });
  area.addEventListener('dragleave', () => area.classList.remove('drag-over'));
  area.addEventListener('drop', e => {
    e.preventDefault();
    area.classList.remove('drag-over');
    addNewFiles([...e.dataTransfer.files]);
  });
}

function addNewFiles(files) {
  for (const file of files) {
    if (existingImages.length + newFiles.length >= EDIT_MAX_IMAGES) {
      toast.warning(`Max ${EDIT_MAX_IMAGES} photos total.`); break;
    }
    if (!EDIT_ALLOWED_MIME.has(file.type)) {
      toast.warning(`${file.name}: JPG/PNG/WebP only.`); continue;
    }
    if (file.size > EDIT_MAX_FILE_BYTES) {
      toast.warning(`${file.name}: exceeds 5 MB.`); continue;
    }
    newFiles.push(file);
    appendNewPreview(file, newFiles.length - 1);
  }
}

function appendNewPreview(file, idx) {
  // Reuse or create new-files preview grid below upload area
  let grid = document.getElementById('newImagesGrid');
  if (!grid) {
    grid    = document.createElement('div');
    grid.id = 'newImagesGrid';
    grid.style.cssText = 'display:grid; grid-template-columns:repeat(4,1fr); gap:var(--space-3); margin-top:var(--space-3);';
    document.getElementById('uploadArea').insertAdjacentElement('afterend', grid);
  }

  const item = document.createElement('div');
  item.style.cssText   = 'aspect-ratio:1; border-radius:var(--radius-md); overflow:hidden; position:relative; background:var(--color-surface-muted);';
  item.dataset.newIdx  = String(idx);

  const img    = document.createElement('img');
  img.alt      = file.name;
  img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
  const reader = new FileReader();
  reader.onload = e => { img.src = e.target.result; };
  reader.readAsDataURL(file);

  const btn     = document.createElement('button');
  btn.type      = 'button';
  btn.title     = 'Remove';
  btn.innerHTML = '×';
  btn.style.cssText = 'position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,0.55);color:white;border:none;cursor:pointer;font-size:14px;line-height:1;display:flex;align-items:center;justify-content:center;';
  btn.addEventListener('click', e => { e.stopPropagation(); removeNewFile(idx); });

  item.appendChild(img);
  item.appendChild(btn);
  grid.appendChild(item);
}

function removeNewFile(idx) {
  newFiles.splice(idx, 1);
  const grid = document.getElementById('newImagesGrid');
  if (grid) grid.innerHTML = '';
  newFiles.forEach((f, i) => appendNewPreview(f, i));
}

// ── Form validation ───────────────────────────────────────────────
function validateEdit() {
  clearEditErrors();
  let ok = true;

  const title = document.getElementById('title').value.trim();
  if (!title) {
    editFieldErr('titleError', 'Title is required.'); ok = false;
  } else if (title.length < 5) {
    editFieldErr('titleError', 'At least 5 characters.'); ok = false;
  } else if (title.length > 100) {
    editFieldErr('titleError', '100 characters max.'); ok = false;
  }

  const desc = document.getElementById('description').value.trim();
  if (!desc) {
    editFieldErr('descriptionError', 'Description is required.'); ok = false;
  } else if (desc.length < 20) {
    editFieldErr('descriptionError', 'At least 20 characters.'); ok = false;
  } else if (desc.length > 2000) {
    editFieldErr('descriptionError', '2000 characters max.'); ok = false;
  }

  const price = parseInt(document.getElementById('price').value, 10);
  if (isNaN(price) || price < 0) {
    editFieldErr('priceError', 'Enter a valid price (0 or more).'); ok = false;
  } else if (price > 10_000_000) {
    editFieldErr('priceError', 'Max Rs. 10,000,000.'); ok = false;
  }

  const loc = document.getElementById('locationHostel').value;
  if (!loc) {
    editFieldErr('locationError', 'Location is required.'); ok = false;
  }

  return ok;
}

// ── Submit ────────────────────────────────────────────────────────
function wireForm() {
  document.getElementById('editListingForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!validateEdit()) return;

    const submitBtn = document.getElementById('submitBtn');
    const formErr   = document.getElementById('formError');
    formErr.style.display = 'none';
    submitBtn.disabled    = true;
    submitBtn.textContent = 'Saving…';

    try {
      // 1. PATCH text fields (cannot patch category per SPECS 3.3)
      await api.listings.update(listingId, {
        title:          document.getElementById('title').value.trim(),
        description:    document.getElementById('description').value.trim(),
        price:          parseInt(document.getElementById('price').value, 10),
        condition:      document.getElementById('condition').value,
        is_negotiable:  document.getElementById('isNegotiable').checked,
        ...(() => {
          const v = document.getElementById('locationHostel').value;
          const off = v === 'off_campus';
          return { is_off_campus: off, location_hostel: off ? null : v };
        })(),
      });

      // 2. Upload new images one-by-one
      for (const file of newFiles) {
        const fd = new FormData();
        fd.append('image', file);
        await api.listings.addImage(listingId, fd);
      }

      toast.success('Saved!', 'Listing updated.');
      setTimeout(() => navigate('listingDetail', { id: listingId }), 800);
    } catch (err) {
      formErr.textContent   = err.message || 'Save failed. Try again.';
      formErr.style.display = '';
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Save changes';
    }
  });
}

// ── Categories ────────────────────────────────────────────────────
async function loadCategories() {
  const select = document.getElementById('category');
  let cats = EDIT_CATS_FALLBACK;
  try {
    const data = await api.categories.list();
    const arr  = Array.isArray(data) ? data : data?.categories;
    if (arr?.length) cats = arr;
  } catch { /* use fallback */ }

  cats.forEach(c => {
    const opt       = document.createElement('option');
    opt.value       = c.slug || c.id;
    opt.textContent = c.name;
    select.appendChild(opt);
  });
}

// ── Error helpers ─────────────────────────────────────────────────
function editFieldErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent   = msg;
  el.style.display = '';
}

function clearEditErrors() {
  document.querySelectorAll('#editListingForm .form-error').forEach(el => {
    el.textContent   = '';
    el.style.display = 'none';
  });
}
