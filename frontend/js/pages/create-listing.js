/**
 * create-listing.js — Multi-step create listing controller.
 * Step 1: images (drag/drop, FileReader preview, max 8 × 5MB).
 * Step 2: title, desc, category, condition, price, negotiable, location, course_code, tags.
 * Step 3: review summary → POST /listings as FormData.
 */

const MAX_IMAGES    = 8;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME  = new Set(['image/jpeg', 'image/png', 'image/webp']);

const CATS_FALLBACK = [
  { slug: 'books', name: 'Books & Notes' },
  { slug: 'electronics', name: 'Electronics' },
  { slug: 'furniture', name: 'Furniture' },
  { slug: 'bikes', name: 'Bikes & Cycles' },
  { slug: 'clothing', name: 'Clothing' },
  { slug: 'stationery', name: 'Stationery' },
  { slug: 'hostel_essentials', name: 'Hostel Essentials' },
  { slug: 'sports', name: 'Sports' },
  { slug: 'other', name: 'Other' },
];

// ── State ─────────────────────────────────────────────────────────
/** @type {File[]} */
let selectedFiles = [];
/** @type {string[]} — tag strings */
let tags = [];
let currentStep = 1;

// ── Boot ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initRouter();
  if (!auth.requireAuth()) return;

  await loadCategories();
  wireStep1();
  wireStep2();
  wireStep3();
  wireTagInput();
});

// ── Step navigation ───────────────────────────────────────────────
function goStep(n) {
  [1, 2, 3].forEach(i => {
    document.getElementById(`step${i}`).style.display = i === n ? '' : 'none';
  });
  updateStepIndicator(n);
  currentStep = n;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateStepIndicator(active) {
  [1, 2, 3].forEach(i => {
    const dot = document.getElementById(`dot${i}`);
    const lbl = document.getElementById(`lbl${i}`);
    const line = document.getElementById(`line${i}`);
    dot.className = 'step-dot' + (i < active ? ' done' : i === active ? ' active' : '');
    dot.textContent = i < active
      ? '✓'
      : String(i);
    lbl.className = 'step-label' + (i === active ? ' active' : '');
    if (line) line.className = 'step-line' + (i < active ? ' done' : '');
  });
}

// ── Step 1: Images ────────────────────────────────────────────────
function wireStep1() {
  const area  = document.getElementById('uploadArea');
  const input = document.getElementById('imageInput');

  area.addEventListener('click', () => input.click());
  area.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') input.click(); });

  input.addEventListener('change', () => { addFiles([...input.files]); input.value = ''; });

  area.addEventListener('dragover',  e => { e.preventDefault(); area.classList.add('drag-over'); });
  area.addEventListener('dragleave', () => area.classList.remove('drag-over'));
  area.addEventListener('drop', e => {
    e.preventDefault();
    area.classList.remove('drag-over');
    addFiles([...e.dataTransfer.files]);
  });

  document.getElementById('step1Next').addEventListener('click', () => {
    const errEl = document.getElementById('imagesError');
    if (selectedFiles.length === 0) {
      errEl.textContent   = 'Add at least 1 photo.';
      errEl.style.display = '';
      return;
    }
    errEl.style.display = 'none';
    goStep(2);
  });
}

function addFiles(files) {
  const errEl = document.getElementById('imagesError');
  errEl.style.display = 'none';

  for (const file of files) {
    if (selectedFiles.length >= MAX_IMAGES) {
      errEl.textContent   = `Max ${MAX_IMAGES} photos.`;
      errEl.style.display = '';
      break;
    }
    if (!ALLOWED_MIME.has(file.type)) {
      errEl.textContent   = `${file.name}: JPG/PNG/WebP only.`;
      errEl.style.display = '';
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      errEl.textContent   = `${file.name}: exceeds 5 MB.`;
      errEl.style.display = '';
      continue;
    }
    selectedFiles.push(file);
    appendPreview(file, selectedFiles.length - 1);
  }
}

function appendPreview(file, idx) {
  const grid = document.getElementById('imagePreviewGrid');
  const item = document.createElement('div');
  item.className       = 'image-preview-item';
  item.dataset.fileIdx = String(idx);

  const img    = document.createElement('img');
  img.alt      = file.name;
  const reader = new FileReader();
  reader.onload = e => { img.src = e.target.result; };
  reader.readAsDataURL(file);

  const btn       = document.createElement('button');
  btn.type        = 'button';
  btn.className   = 'image-remove-btn';
  btn.title       = 'Remove';
  btn.innerHTML   = '×';
  btn.addEventListener('click', e => { e.stopPropagation(); removeFile(idx); });

  item.appendChild(img);
  item.appendChild(btn);
  grid.appendChild(item);
}

function removeFile(idx) {
  selectedFiles.splice(idx, 1);
  // Rebuild grid — indices shifted
  const grid = document.getElementById('imagePreviewGrid');
  grid.innerHTML = '';
  selectedFiles.forEach((f, i) => appendPreview(f, i));
}

// ── Step 2: Details ───────────────────────────────────────────────
function wireStep2() {
  document.getElementById('step2Back').addEventListener('click', () => goStep(1));
  document.getElementById('step2Next').addEventListener('click', () => {
    if (validateDetails()) { buildReview(); goStep(3); }
  });
}

function validateDetails() {
  clearErrors();
  let ok = true;

  const title = document.getElementById('title').value.trim();
  if (!title) {
    fieldErr('titleError', 'Title is required.'); ok = false;
  } else if (title.length < 5) {
    fieldErr('titleError', 'Title must be at least 5 characters.'); ok = false;
  } else if (title.length > 100) {
    fieldErr('titleError', 'Title must be 100 characters or less.'); ok = false;
  }

  const desc = document.getElementById('description').value.trim();
  if (!desc) {
    fieldErr('descriptionError', 'Description is required.'); ok = false;
  } else if (desc.length < 20) {
    fieldErr('descriptionError', 'Description must be at least 20 characters.'); ok = false;
  } else if (desc.length > 2000) {
    fieldErr('descriptionError', 'Description must be 2000 characters or less.'); ok = false;
  }

  const price = parseInt(document.getElementById('price').value, 10);
  if (isNaN(price) || price < 0) {
    fieldErr('priceError', 'Enter a valid price (0 or more).'); ok = false;
  } else if (price > 10_000_000) {
    fieldErr('priceError', 'Price cannot exceed Rs. 10,000,000.'); ok = false;
  }

  if (!document.getElementById('category').value) {
    fieldErr('categoryError', 'Select a category.'); ok = false;
  }
  if (!document.getElementById('condition').value) {
    fieldErr('conditionError', 'Select a condition.'); ok = false;
  }

  if (!document.getElementById('location').value) {
    fieldErr('locationError', 'Select your location.'); ok = false;
  }

  return ok;
}

// ── Tags ──────────────────────────────────────────────────────────
function wireTagInput() {
  const wrap  = document.getElementById('tagsWrap');
  const input = document.getElementById('tagInput');

  function addTag(raw) {
    const val = raw.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
    if (!val || tags.includes(val)) return;
    if (tags.length >= 10) {
      fieldErr('tagsError', 'Max 10 tags.'); return;
    }
    tags.push(val);
    renderTags();
    document.getElementById('tagsHidden').value = tags.join(',');
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input.value);
      input.value = '';
    }
    if (e.key === 'Backspace' && !input.value && tags.length) {
      tags.pop();
      renderTags();
    }
  });

  input.addEventListener('blur', () => {
    if (input.value.trim()) { addTag(input.value); input.value = ''; }
  });

  // Click on wrap focuses input
  wrap.addEventListener('click', () => input.focus());

  function renderTags() {
    // Remove existing pills (keep input)
    [...wrap.querySelectorAll('.tag-pill')].forEach(p => p.remove());
    tags.forEach((t, i) => {
      const pill = document.createElement('span');
      pill.className = 'tag-pill';
      pill.innerHTML = `${escapeHtml(t)}<button type="button" aria-label="Remove tag ${t}">×</button>`;
      pill.querySelector('button').addEventListener('click', () => {
        tags.splice(i, 1);
        renderTags();
        document.getElementById('tagsHidden').value = tags.join(',');
      });
      wrap.insertBefore(pill, input);
    });
  }
}

// ── Step 3: Review ────────────────────────────────────────────────
function buildReview() {
  // Thumbnail strip
  const reviewImages = document.getElementById('reviewImages');
  reviewImages.innerHTML = selectedFiles.length === 0
    ? '<span style="color:var(--color-text-subtle); font-size:var(--text-sm);">No photos</span>'
    : '';

  selectedFiles.forEach(file => {
    const img    = document.createElement('img');
    img.alt      = file.name;
    img.style.cssText = 'width:80px; height:80px; object-fit:cover; border-radius:var(--radius-md);';
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; };
    reader.readAsDataURL(file);
    reviewImages.appendChild(img);
  });

  const catSelect = document.getElementById('category');
  const catName   = catSelect.options[catSelect.selectedIndex]?.text || '—';
  const condSelect = document.getElementById('condition');
  const condName   = condSelect.options[condSelect.selectedIndex]?.text || '—';

  const rows = [
    ['Title',       document.getElementById('title').value.trim()],
    ['Price',       `Rs. ${parseFloat(document.getElementById('price').value).toLocaleString('en-PK')}${document.getElementById('isNegotiable').checked ? ' (Negotiable)' : ''}`],
    ['Category',    catName],
    ['Condition',   condName],
    ['Location',    document.getElementById('location').value || '—'],
    ['Course code', document.getElementById('courseCode').value.trim() || '—'],
    ['Tags',        tags.length ? tags.join(', ') : '—'],
    ['Description', document.getElementById('description').value.trim()],
  ];

  document.getElementById('reviewRows').innerHTML = rows.map(([label, val]) => `
    <div class="review-row">
      <div class="review-label">${escapeHtml(label)}</div>
      <div class="review-value">${escapeHtml(String(val))}</div>
    </div>
  `).join('');
}

// ── Step 3 → submit ───────────────────────────────────────────────
let isSubmitting = false;

function wireStep3() {
  document.getElementById('step3Back').addEventListener('click', () => goStep(2));
  document.getElementById('createListingForm').addEventListener('submit', handleSubmit);
}

async function handleSubmit(e) {
  e.preventDefault();
  if (isSubmitting) return;
  isSubmitting = true;

  const submitBtn = document.getElementById('submitBtn');
  const formErr   = document.getElementById('formError');

  formErr.style.display  = 'none';
  submitBtn.disabled     = true;
  submitBtn.textContent  = 'Posting…';

  try {
    const loc = document.getElementById('location').value;
    const isOffCampus = loc === 'off_campus';

    const fd = new FormData();
    fd.append('title',         document.getElementById('title').value.trim());
    fd.append('description',   document.getElementById('description').value.trim());
    fd.append('price',         document.getElementById('price').value);
    fd.append('category_slug', document.getElementById('category').value);
    fd.append('condition',     document.getElementById('condition').value);
    fd.append('is_negotiable', document.getElementById('isNegotiable').checked ? 'true' : 'false');
    fd.append('is_off_campus', isOffCampus ? 'true' : 'false');
    if (!isOffCampus) fd.append('location_hostel', loc);

    const cc = document.getElementById('courseCode').value.trim();
    if (cc) fd.append('course_code', cc);

    if (tags.length) fd.append('tags', JSON.stringify(tags));

    selectedFiles.forEach(f => fd.append('images', f));

    console.log('[listing] submitting FormData');
    const data  = await api.listings.create(fd);
    console.log('[listing] created:', data);
    const newId = data?.id || data?.listing_id || data?.listing?.id || data?.listing?.listing_id;

    toast.success('Listed!', 'Your listing is live.');
    setTimeout(() => {
      if (newId) navigate('listingDetail', { id: newId });
      else       navigate('myListings');
    }, 800);
  } catch (err) {
    console.error('[listing] create error:', err);
    formErr.textContent   = err.message || 'Post failed. Please try again.';
    formErr.style.display = '';
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Post listing';
  } finally {
    isSubmitting = false;
  }
}

// ── Categories ────────────────────────────────────────────────────
async function loadCategories() {
  const select = document.getElementById('category');
  let cats = CATS_FALLBACK;
  try {
    const data = await api.categories.list();
    const arr  = Array.isArray(data) ? data : data?.categories;
    if (arr?.length) cats = arr;
  } catch { /* use fallback */ }

  cats.forEach(c => {
    const opt = document.createElement('option');
    opt.value       = c.slug || c.id;
    opt.textContent = c.name;
    select.appendChild(opt);
  });
}

// ── Error helpers ─────────────────────────────────────────────────
function fieldErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent   = msg;
  el.style.display = '';
}

function clearErrors() {
  document.querySelectorAll('.form-error').forEach(el => {
    el.textContent   = '';
    el.style.display = 'none';
  });
}
