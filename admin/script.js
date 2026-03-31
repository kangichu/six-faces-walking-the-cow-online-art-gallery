// ── auth storage ──────────────────────────────────────────────────────────────
// sessionStorage: cleared when tab closes, not persisted across sessions
const TOKEN_KEY  = 'sixfaces_token';
const getToken   = () => sessionStorage.getItem(TOKEN_KEY);
const setToken   = (t) => sessionStorage.setItem(TOKEN_KEY, t);
const clearToken = () => sessionStorage.removeItem(TOKEN_KEY);

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $  = (id)             => document.getElementById(id);
const qs = (sel, ctx = document) => ctx.querySelector(sel);

const loginScreen    = $('login-screen');
const dashboard      = $('dashboard');
const loginForm      = $('login-form');
const loginError     = $('login-error');
const mainGrid       = $('main-grid');
const poolGrid       = $('pool-grid');
const mainEmpty      = $('main-empty');
const poolEmpty      = $('pool-empty');
const mainCountEl    = $('main-count');
const poolCountEl    = $('pool-count');
const entryCount     = $('entry-count');
const btnAdd         = $('btn-add');
const btnLogout      = $('btn-logout');

const modalOverlay        = $('modal-overlay');
const modalTitle          = $('modal-title');
const btnCloseModal       = $('btn-close-modal');
const btnCancel           = $('btn-cancel');
const btnSave             = $('btn-save');
const modalError          = $('modal-error');

const dropzone            = $('dropzone');
const dropzonePlaceholder = $('dropzone-placeholder');
const imagePreview        = $('image-preview');
const imageInput          = $('image-input');

const fFaceName   = $('f-face-name');
const fAlign      = $('f-align');
const fTag        = $('f-tag');
const fHeading    = $('f-heading');
const fBody       = $('f-body');
const fImageUrl   = $('f-image-url');
const fTypeMain   = $('f-type-main');
const fTypeRandom = $('f-type-random');

const confirmOverlay   = $('confirm-overlay');
const confirmEntryName = $('confirm-entry-name');
const btnConfirmCancel = $('btn-confirm-cancel');
const btnConfirmDelete = $('btn-confirm-delete');

const settingsOverlay  = $('settings-overlay');
const btnSiteSettings  = $('btn-site-settings');
const btnCloseSettings = $('btn-close-settings');
const btnCancelSettings= $('btn-cancel-settings');
const btnSaveSettings  = $('btn-save-settings');
const sTitle           = $('s-title');
const sDescription     = $('s-description');
const sOgImage         = $('s-og-image');
const sCanonical       = $('s-canonical');
const sTwitterCard     = $('s-twitter-card');
const settingsError    = $('settings-error');
const settingsSuccess  = $('settings-success');

// ── constants ─────────────────────────────────────────────────────────────────
const MAX_MAIN = 6;

// ── app state ─────────────────────────────────────────────────────────────────
let entries        = [];
let editingId      = null;   // null = creating, string id = editing
let selectedFile   = null;   // File selected in this modal session
let selectedUrl    = null;   // External URL typed in this modal session
let pendingDeleteId = null;

// ── helpers ───────────────────────────────────────────────────────────────────
const escHtml = (str) =>
  String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// ── API fetch wrapper ─────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const token   = getToken();
  const headers = { ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, { ...opts, headers });

  if (res.status === 401) {
    clearToken();
    showLogin();
    throw new Error('Session expired — please sign in again.');
  }
  return res;
}

// ── auth ──────────────────────────────────────────────────────────────────────
function showLogin() {
  loginScreen.hidden = false;
  dashboard.hidden   = true;
}

function showDashboard() {
  loginScreen.hidden = true;
  dashboard.hidden   = false;
  loadEntries();
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  $('btn-login').disabled = true;

  const username = $('username').value.trim();
  const password = $('password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, password }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      loginError.textContent = data.error || 'Login failed.';
      loginError.hidden      = false;
      return;
    }

    setToken(data.access_token);
    loginForm.reset();
    showDashboard();
  } catch {
    loginError.textContent = 'Network error — is the server running?';
    loginError.hidden      = false;
  } finally {
    $('btn-login').disabled = false;
  }
});

btnLogout.addEventListener('click', () => {
  clearToken();
  showLogin();
});

// ── load + render entries ─────────────────────────────────────────────────────
async function loadEntries() {
  try {
    const res = await fetch('/api/entries');
    if (res.ok) {
      entries = await res.json();
      renderCards();
    }
  } catch (e) {
    console.error('[admin] Failed to load entries:', e);
  }
}

function renderCards() {
  const mainEntries = entries
    .filter(e => (e.type || 'main') === 'main')
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const poolEntries = entries.filter(e => e.type === 'random');

  mainGrid.innerHTML = '';
  poolGrid.innerHTML = '';
  mainEmpty.hidden   = mainEntries.length > 0;
  poolEmpty.hidden   = poolEntries.length > 0;

  mainCountEl.textContent = `${mainEntries.length} / ${MAX_MAIN}`;
  poolCountEl.textContent = poolEntries.length;
  entryCount.textContent  = `${mainEntries.length}/${MAX_MAIN}`;
  btnAdd.disabled = false;
  btnAdd.title    = '';

  mainEntries.forEach((entry, idx) =>
    mainGrid.appendChild(buildCard(entry, idx, true, idx === 0, idx === mainEntries.length - 1))
  );
  poolEntries.forEach((entry, idx) =>
    poolGrid.appendChild(buildCard(entry, idx, false, false, false))
  );
}

function buildCard(entry, idx, isMain, isFirst, isLast) {
  const card     = document.createElement('div');
  card.className = 'entry-card';

  const imgSrc  = entry.image_filename
    ? `/uploads/${entry.image_filename}`
    : (entry.image_url || null);
  const imgHtml = imgSrc
    ? `<img src="${escHtml(imgSrc)}" alt="${escHtml(entry.face_name)}" loading="lazy">`
    : `<span class="entry-card-thumb-ph">${String(idx + 1).padStart(2, '0')}</span>`;

  const moveHtml = isMain
    ? `<div class="move-btns">
        <button class="btn-icon move-btn" data-move="up"   title="Move up"   ${isFirst ? 'disabled' : ''}>&#8593;</button>
        <button class="btn-icon move-btn" data-move="down" title="Move down" ${isLast  ? 'disabled' : ''}>&#8595;</button>
      </div>`
    : '';

  card.innerHTML = `
    <div class="entry-card-thumb">${imgHtml}</div>
    <div class="entry-card-body">
      <div class="entry-card-order">
        <span class="type-badge type-badge--${isMain ? 'main' : 'pool'}">${isMain ? 'MAIN' : 'POOL'}</span>
        ${isMain ? `<span style="font-size:0.6rem;color:var(--muted);margin-inline-start:0.3rem">${String(idx + 1).padStart(2, '0')}</span>` : ''}
      </div>
      <div class="entry-card-face">${escHtml(entry.face_name || '\u2014')}</div>
      <div class="entry-card-tag">${escHtml(entry.tag || '')}</div>
    </div>
    <div class="entry-card-actions">
      ${moveHtml}
      <button class="btn-icon" data-edit title="Edit entry">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Edit
      </button>
      <button class="btn-icon danger" data-delete data-name="${escHtml(entry.face_name || 'this entry')}" title="Delete entry">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6M14 11v6"/>
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
        Delete
      </button>
    </div>`;

  // Fix broken URL images — fall back to number placeholder
  const cardImg = card.querySelector('.entry-card-thumb img');
  if (cardImg) {
    cardImg.addEventListener('error', () => {
      const ph = document.createElement('span');
      ph.className   = 'entry-card-thumb-ph';
      ph.textContent = String(idx + 1).padStart(2, '0');
      cardImg.replaceWith(ph);
    });
  }

  card.querySelector('[data-edit]').addEventListener('click', () => openModal(entry));
  card.querySelector('[data-delete]').addEventListener('click', (ev) =>
    openConfirm(entry.id, ev.currentTarget.dataset.name)
  );

  if (isMain) {
    card.querySelector('[data-move="up"]')  ?.addEventListener('click', () => moveEntry(entry.id, 'up'));
    card.querySelector('[data-move="down"]')?.addEventListener('click', () => moveEntry(entry.id, 'down'));
  }

  return card;
}

async function moveEntry(id, direction) {
  const mainEntries = entries
    .filter(e => (e.type || 'main') === 'main')
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const idx     = mainEntries.findIndex(e => e.id === id);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= mainEntries.length) return;

  const ids = mainEntries.map(e => e.id);
  const [moved] = ids.splice(idx, 1);
  ids.splice(swapIdx, 0, moved);

  try {
    const res = await apiFetch('/api/entries/reorder', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error('Reorder failed');
    await loadEntries();
  } catch (e) {
    console.error('[admin] Move error:', e);
  }
}

// ── create / edit modal ───────────────────────────────────────────────────────
function openModal(entry = null) {
  editingId    = entry ? entry.id : null;
  selectedFile = null;
  selectedUrl  = null;
  modalError.hidden = true;

  modalTitle.textContent = entry ? 'Edit Entry' : 'Add Entry';
  fFaceName.value  = entry?.face_name || '';
  fAlign.value     = entry?.align     || 'left';
  fTag.value       = entry?.tag       || '';
  fHeading.value   = entry?.heading   || '';
  fBody.value      = entry?.body      || '';
  fImageUrl.value  = entry?.image_url || '';

  // Type radio
  const mainCount   = entries.filter(e => (e.type || 'main') === 'main').length;
  const entryIsMain = entry ? (entry.type || 'main') === 'main' : mainCount < MAX_MAIN;
  fTypeMain.checked   = entryIsMain;
  fTypeRandom.checked = !entryIsMain;
  // Disable main option when at capacity (unless editing an existing main entry)
  fTypeMain.disabled  = mainCount >= MAX_MAIN && !(entry && (entry.type || 'main') === 'main');

  // Image preview
  const existingImgSrc = entry?.image_filename
    ? `/uploads/${entry.image_filename}`
    : (entry?.image_url || null);

  if (existingImgSrc) {
    imagePreview.src           = existingImgSrc;
    imagePreview.hidden        = false;
    dropzonePlaceholder.hidden = true;
  } else {
    imagePreview.src           = '';
    imagePreview.hidden        = true;
    dropzonePlaceholder.hidden = false;
  }
  imageInput.value = '';

  modalOverlay.hidden = false;
  fFaceName.focus();
}

function closeModal() {
  modalOverlay.hidden = true;
  editingId           = null;
  selectedFile        = null;
  selectedUrl         = null;
}

btnAdd.addEventListener('click',         () => openModal(null));
btnCloseModal.addEventListener('click',  closeModal);
btnCancel.addEventListener('click',      closeModal);
modalOverlay.addEventListener('click',   (e) => { if (e.target === modalOverlay) closeModal(); });

// ── image dropzone ────────────────────────────────────────────────────────────
dropzone.addEventListener('click',   () => imageInput.click());
dropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') imageInput.click(); });

dropzone.addEventListener('dragover',  (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
dropzone.addEventListener('dragleave', ()  => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
});

imageInput.addEventListener('change', () => {
  if (imageInput.files[0]) handleFileSelect(imageInput.files[0]);
});

function handleFileSelect(file) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowed.includes(file.type)) {
    showModalError('Only JPG, PNG, WEBP, and GIF images are accepted.');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showModalError('File exceeds the 10 MB limit.');
    return;
  }
  selectedFile = file;
  selectedUrl  = null;      // file takes priority — clear any URL
  fImageUrl.value = '';
  const reader = new FileReader();
  reader.onload = (ev) => {
    imagePreview.src           = ev.target.result;
    imagePreview.hidden        = false;
    dropzonePlaceholder.hidden = true;
    modalError.hidden          = true;
  };
  reader.readAsDataURL(file);
}

// URL input — mutual exclusion with file
fImageUrl.addEventListener('input', () => {
  const url = fImageUrl.value.trim();
  if (!url) {
    // Restore previous preview state if no URL
    if (!selectedFile) {
      imagePreview.hidden        = true;
      dropzonePlaceholder.hidden = false;
    }
    selectedUrl = null;
    return;
  }
  selectedUrl  = url;
  selectedFile = null;     // URL takes priority — clear any file
  imageInput.value = '';
  imagePreview.src           = url;
  imagePreview.hidden        = false;
  dropzonePlaceholder.hidden = true;
});

fImageUrl.addEventListener('blur', () => {
  const url = fImageUrl.value.trim();
  if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
    showModalError('Image URL must start with http:// or https://');
    fImageUrl.value = '';
    selectedUrl = null;
  }
});

// ── save ──────────────────────────────────────────────────────────────────────
btnSave.addEventListener('click', saveEntry);

async function saveEntry() {
  modalError.hidden = true;
  btnSave.disabled  = true;

  try {
    if (editingId) {
      // ── update text fields + optional image_url ──
      const putBody = {
        face_name: fFaceName.value.trim(),
        tag:       fTag.value.trim(),
        heading:   fHeading.value.trim(),
        body:      fBody.value.trim(),
        align:     fAlign.value,
        type:      fTypeMain.checked ? 'main' : 'random',
      };
      // Include image_url if user typed one (and no file selected)
      if (selectedUrl && !selectedFile) {
        putBody.image_url = selectedUrl;
      } else if (!selectedFile && !selectedUrl && fImageUrl.value.trim() === '') {
        // User cleared the URL field — explicitly pass null to clear it server-side
        // (only do this if there was a URL before; harmless otherwise)
        putBody.image_url = null;
      }

      const putRes = await apiFetch(`/api/entries/${editingId}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(putBody),
      });
      if (!putRes.ok) {
        const d = await putRes.json().catch(() => ({}));
        throw new Error(d.error || 'Update failed.');
      }

      // ── replace image if a new file was picked ──
      if (selectedFile) {
        const fd = new FormData();
        fd.append('image', selectedFile);
        const imgRes = await apiFetch(`/api/entries/${editingId}/image`, { method: 'POST', body: fd });
        if (!imgRes.ok) {
          const d = await imgRes.json().catch(() => ({}));
          throw new Error(d.error || 'Image upload failed.');
        }
      }
    } else {
      // ── create via multipart ──
      const fd = new FormData();
      fd.append('face_name', fFaceName.value.trim());
      fd.append('tag',       fTag.value.trim());
      fd.append('heading',   fHeading.value.trim());
      fd.append('body',      fBody.value.trim());
      fd.append('align',     fAlign.value);
      fd.append('type',      fTypeMain.checked ? 'main' : 'random');
      if (selectedFile) {
        fd.append('image', selectedFile);
      } else if (selectedUrl) {
        fd.append('image_url', selectedUrl);
      }

      const postRes = await apiFetch('/api/entries', { method: 'POST', body: fd });
      if (!postRes.ok) {
        const d = await postRes.json().catch(() => ({}));
        throw new Error(d.error || 'Create failed.');
      }
    }

    closeModal();
    await loadEntries();
  } catch (err) {
    showModalError(err.message || 'Something went wrong.');
  } finally {
    btnSave.disabled = false;
  }
}

function showModalError(msg) {
  modalError.textContent = msg;
  modalError.hidden      = false;
}

// ── delete ────────────────────────────────────────────────────────────────────
function openConfirm(id, name) {
  pendingDeleteId               = id;
  confirmEntryName.textContent  = name;
  confirmOverlay.hidden         = false;
}

btnConfirmCancel.addEventListener('click', () => {
  confirmOverlay.hidden = true;
  pendingDeleteId       = null;
});

confirmOverlay.addEventListener('click', (e) => {
  if (e.target === confirmOverlay) {
    confirmOverlay.hidden = true;
    pendingDeleteId       = null;
  }
});

btnConfirmDelete.addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  btnConfirmDelete.disabled = true;

  try {
    const res = await apiFetch(`/api/entries/${pendingDeleteId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed.');
    confirmOverlay.hidden = true;
    pendingDeleteId       = null;
    await loadEntries();
  } catch (e) {
    console.error('[admin] Delete error:', e);
  } finally {
    btnConfirmDelete.disabled = false;
  }
});

// ── keyboard: close modals with Escape ───────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!modalOverlay.hidden)    closeModal();
  if (!confirmOverlay.hidden)  { confirmOverlay.hidden  = true; pendingDeleteId = null; }
  if (!pwOverlay.hidden)       closePwModal();
  if (!settingsOverlay.hidden) closeSettingsModal();
});

// ── site settings ───────────────────────────────────────────────────────────────────
async function openSettingsModal() {
  settingsError.hidden   = true;
  settingsSuccess.hidden = true;
  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const data = await res.json();
      sTitle.value             = data.site_title       || '';
      sDescription.value       = data.meta_description || '';
      sOgImage.value           = data.og_image         || '';
      sCanonical.value         = data.canonical_url    || '';
      sTwitterCard.value       = data.twitter_card     || 'summary_large_image';
    }
  } catch { /* leave fields empty */ }
  settingsOverlay.hidden = false;
  sTitle.focus();
}

function closeSettingsModal() {
  settingsOverlay.hidden = true;
}

btnSiteSettings.addEventListener('click',   openSettingsModal);
btnCloseSettings.addEventListener('click',  closeSettingsModal);
btnCancelSettings.addEventListener('click', closeSettingsModal);
settingsOverlay.addEventListener('click', (e) => { if (e.target === settingsOverlay) closeSettingsModal(); });

btnSaveSettings.addEventListener('click', async () => {
  settingsError.hidden   = true;
  settingsSuccess.hidden = true;

  const payload = {
    site_title:       sTitle.value.trim(),
    meta_description: sDescription.value.trim(),
    og_image:         sOgImage.value.trim(),
    canonical_url:    sCanonical.value.trim(),
    twitter_card:     sTwitterCard.value,
  };

  btnSaveSettings.disabled = true;
  try {
    const res = await apiFetch('/api/settings', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      settingsError.textContent = data.error || 'Failed to save settings.';
      settingsError.hidden = false;
      return;
    }
    settingsSuccess.hidden = false;
    setTimeout(closeSettingsModal, 1500);
  } catch (e) {
    settingsError.textContent = 'Network error.';
    settingsError.hidden = false;
  } finally {
    btnSaveSettings.disabled = false;
  }
});

// ── change password ───────────────────────────────────────────────────────────
const pwOverlay    = $('pw-overlay');
const pwCurrent    = $('pw-current');
const pwNew        = $('pw-new');
const pwConfirm    = $('pw-confirm');
const pwError      = $('pw-error');
const pwSuccess    = $('pw-success');
const btnChangePw  = $('btn-change-pw');
const btnClosePw   = $('btn-close-pw');
const btnCancelPw  = $('btn-cancel-pw');
const btnSavePw    = $('btn-save-pw');

function openPwModal() {
  pwCurrent.value = '';
  pwNew.value     = '';
  pwConfirm.value = '';
  pwError.hidden   = true;
  pwSuccess.hidden = true;
  pwOverlay.hidden = false;
  pwCurrent.focus();
}

function closePwModal() {
  pwOverlay.hidden = true;
}

btnChangePw.addEventListener('click',  openPwModal);
btnClosePw.addEventListener('click',   closePwModal);
btnCancelPw.addEventListener('click',  closePwModal);
pwOverlay.addEventListener('click', (e) => { if (e.target === pwOverlay) closePwModal(); });

btnSavePw.addEventListener('click', async () => {
  pwError.hidden   = true;
  pwSuccess.hidden = true;

  const current = pwCurrent.value;
  const newPw   = pwNew.value;
  const confirm = pwConfirm.value;

  if (!current || !newPw || !confirm) {
    pwError.textContent = 'All fields are required.';
    pwError.hidden = false;
    return;
  }
  if (newPw.length < 10) {
    pwError.textContent = 'New password must be at least 10 characters.';
    pwError.hidden = false;
    return;
  }
  if (newPw !== confirm) {
    pwError.textContent = 'New passwords do not match.';
    pwError.hidden = false;
    return;
  }

  btnSavePw.disabled = true;
  try {
    const res = await apiFetch('/api/auth/change-password', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ current_password: current, new_password: newPw }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      pwError.textContent = data.error || 'Failed to change password.';
      pwError.hidden = false;
      return;
    }
    pwSuccess.hidden = false;
    pwCurrent.value = '';
    pwNew.value     = '';
    pwConfirm.value = '';
    // Auto-close after 2 seconds
    setTimeout(closePwModal, 2000);
  } catch (e) {
    pwError.textContent = 'Network error.';
    pwError.hidden = false;
  } finally {
    btnSavePw.disabled = false;
  }
});

// ── init ──────────────────────────────────────────────────────────────────────
function checkAuth() {
  if (getToken()) {
    showDashboard();
  } else {
    showLogin();
  }
}

checkAuth();
