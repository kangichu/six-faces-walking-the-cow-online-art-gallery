// ── constants ─────────────────────────────────────────────────────────────────
const SWAP_RADIUS = 3;

// ── mutable state (populated by init()) ──────────────────────────────────────
let IMAGE_SRCS   = [];
let FACE_NAMES   = [];
let N            = 0;
let STOPS        = [];
let sections     = [];
let sceneDots    = [];
let sectionTops  = [];
let faceImgIdx   = new Array(6).fill(-1);
let currentStop  = -1;
let lastFaceIdx  = -1;
let maxScroll    = 1;
let lastScrollH  = 0;
let lastInnerH   = 0;
let tgt          = 0;
let smooth       = 0;
let velocity     = 0;
let lastNow      = performance.now();
let anchorAnim   = null;

// ── static DOM refs ───────────────────────────────────────────────────────────
const dom = {
  cube:        document.getElementById('cube'),
  faces:       [...document.querySelectorAll('.face')],
  scrollEl:    document.getElementById('scroll_container'),
  strip:       document.getElementById('scene_strip'),
  hudPct:      document.getElementById('hud_pct'),
  progFill:    document.getElementById('prog_fill'),
  sceneName:   document.getElementById('scene_name'),
  captionNum:  document.getElementById('face_caption_num'),
  captionName: document.getElementById('face_caption_name'),
  themeToggle: document.getElementById('theme_toggle'),
};

// ── helpers ───────────────────────────────────────────────────────────────────
const escHtml = (str) =>
  String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// ── geometry ──────────────────────────────────────────────────────────────────
function buildStops(n) {
  const base = [
    { rx: 90,  ry: 0    },
    { rx: 0,   ry: 0    },
    { rx: 0,   ry: -90  },
    { rx: 0,   ry: -180 },
    { rx: 0,   ry: -270 },
    { rx: -90, ry: -360 },
  ];
  return base.slice(0, Math.min(n, 6));
}

function faceAtStop(i) {
  if (i < 6) return i;
  return 1 + ((i - 2) % 4);
}

const stopIndex = (s) => Math.min(N - 1, Math.floor(s * (N - 1)));

// ── image preloading ──────────────────────────────────────────────────────────
const imagePromises = new Map();

const preloadImage = (src) => {
  if (!src) return Promise.resolve(null);
  if (imagePromises.has(src)) return imagePromises.get(src);
  const p = (async () => {
    const img = new Image();
    img.src = src;
    await img.decode().catch(() => {});
    return img;
  })();
  imagePromises.set(src, p);
  return p;
};

async function setFaceImage(faceIdx, imgIdx, force = false) {
  if (!force && faceIdx === faceAtStop(currentStop)) return;
  if (!force && faceImgIdx[faceIdx] === imgIdx) return;
  faceImgIdx[faceIdx] = imgIdx;

  const src  = IMAGE_SRCS[imgIdx];
  const face = dom.faces[faceIdx];

  if (!src) {
    const existing = face.querySelector('img');
    if (existing) existing.remove();
    return;
  }

  await preloadImage(src);
  if (faceImgIdx[faceIdx] !== imgIdx) return; // stale

  let img = face.querySelector('img');
  if (!img) { img = new Image(); face.appendChild(img); }
  img.alt  = FACE_NAMES[imgIdx] ?? '';
  img.src  = src;
  img.style.objectFit = '';
}

function checkImageSwaps(s) {
  const base = stopIndex(s);
  for (let offset = -SWAP_RADIUS; offset <= SWAP_RADIUS; offset++) {
    if (offset === 0) continue;
    const si = base + offset;
    if (si < 0 || si >= N) continue;
    setFaceImage(faceAtStop(si), si);
  }
}

// ── DOM builders ──────────────────────────────────────────────────────────────
function buildSectionsDOM(entries) {
  // ── Populate s0 from first entry (or show empty state) ──────────────────
  const s0      = document.getElementById('s0');
  const s0enter = document.getElementById('s0_enter');
  if (s0) {
    const tagEl  = s0.querySelector('.tag');
    const headEl = s0.querySelector('h1');
    const bodyEl = s0.querySelector('.body-text');

    if (entries.length > 0) {
      const first = entries[0];
      if (tagEl  && first.tag)     tagEl.textContent = first.tag;
      if (headEl && first.heading) {
        headEl.innerHTML = first.heading
          .split('\n').map((l) => l.trim()).filter(Boolean).join('<br>');
      }
      if (bodyEl && first.body) bodyEl.textContent = first.body;
    } else {
      if (tagEl)  tagEl.textContent = 'No entries yet';
      if (headEl) headEl.innerHTML  = 'ADD<br>CONTENT<br>TO BEGIN';
      if (bodyEl) bodyEl.textContent =
        'Visit the admin panel to add cube entries and fill this gallery.';
    }

    if (s0enter) {
      s0enter.style.display = entries.length > 1 ? '' : 'none';
    }
  }

  // ── Build s1 … s(N-1) from entries[1]+ ──────────────────────────────────
  for (let i = 1; i < entries.length; i++) {
    const entry  = entries[i];
    const isLast = i === entries.length - 1;
    const align  = entry.align || 'left';
    const alignClass    = align === 'right' ? ' right' : align === 'center' ? ' center' : '';
    const ctaAlignStyle = align === 'right' ? ' style="justify-content:flex-end"' : '';

    const headingHtml = (entry.heading || '')
      .split('\n').map((l) => l.trim()).filter(Boolean).join('<br>');

    const sec = document.createElement('section');
    sec.id = `s${i}`;
    sec.innerHTML = `
      <div class="text-card${alignClass}">
        <div class="h-line"></div>
        <div class="tag">${escHtml(entry.tag || '')}</div>
        <h2>${headingHtml}</h2>
        <p class="body-text">${escHtml(entry.body || '')}</p>
        <div class="cta-row"${ctaAlignStyle}>
          <a class="cta-back" href="#s${i - 1}">
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M11 6H1M6 11L1 6l5-5" />
            </svg>
            Back
          </a>
          <a class="cta" href="${isLast ? '#s0' : '#s' + (i + 1)}">
            ${isLast ? 'Begin again' : 'Turn'}
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M1 6h10M6 1l5 5-5 5" />
            </svg>
          </a>
        </div>
      </div>`;
    dom.scrollEl.appendChild(sec);
  }
}

function rebuildDots(n) {
  dom.strip.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const a = document.createElement('a');
    a.href      = `#s${i}`;
    a.className = 'scene-dot' + (i === 0 ? ' active' : '');
    dom.strip.appendChild(a);
  }
  sceneDots = [...dom.strip.querySelectorAll('.scene-dot')];
}

// ── HUD / cube transform ──────────────────────────────────────────────────────
const easeIO = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

const setCubeTransform = (s) => {
  if (N < 2 || STOPS.length < 2) return;
  const t  = s * (N - 1);
  const i  = Math.min(Math.floor(t), N - 2);
  const f  = easeIO(t - i);
  const a  = STOPS[i];
  const b  = STOPS[i + 1];
  dom.cube.style.transform =
    `rotateX(${a.rx + (b.rx - a.rx) * f}deg) rotateY(${a.ry + (b.ry - a.ry) * f}deg)`;
};

const buildSectionTops = () => {
  sectionTops = sections.map((s) => s.getBoundingClientRect().top + window.scrollY);
};

const sectionIndexFromScroll = (y) => {
  const mid = y + innerHeight * 0.5;
  let idx = 0;
  for (let i = 0; i < sectionTops.length; i++) {
    if (mid >= sectionTops[i]) idx = i;
  }
  return Math.min(idx, Math.max(0, N - 1));
};

const updateHUD = (s) => {
  const p  = Math.round(s * 100);
  const si = sectionIndexFromScroll(scrollY);
  currentStop = si;
  dom.hudPct.textContent   = String(p).padStart(3, '0') + '%';
  dom.progFill.style.width = `${p}%`;
  if (si !== lastFaceIdx) {
    lastFaceIdx = si;
    const name = FACE_NAMES[si] ?? '';
    dom.sceneName.textContent   = name;
    dom.captionNum.textContent  = String(si + 1).padStart(2, '0');
    dom.captionName.textContent = name;
    sceneDots.forEach((d, i) => d.classList.toggle('active', i === si));
  }
};

// ── theme ─────────────────────────────────────────────────────────────────────
const mq = window.matchMedia('(prefers-color-scheme: dark)');
const getSystemTheme = () => (mq.matches ? 'dark' : 'light');
const applyTheme = (theme) => {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
};

// ── resize ────────────────────────────────────────────────────────────────────
const resize = () => {
  const h  = document.documentElement.scrollHeight;
  const vh = innerHeight;
  if (h === lastScrollH && vh === lastInnerH) return;
  lastScrollH = h;
  lastInnerH  = vh;
  maxScroll   = Math.max(1, h - vh);
  buildSectionTops();
};

// ── reveal observer ───────────────────────────────────────────────────────────
const revealObserver = new IntersectionObserver(
  (entries) =>
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        revealObserver.unobserve(e.target);
      }
    }),
  { threshold: 0.1 }
);

// ── anchor scroll ─────────────────────────────────────────────────────────────
const mqSmall = window.matchMedia('(max-width: 56.25em)');

const stopAnchorAnim = () => {
  if (anchorAnim) { cancelAnimationFrame(anchorAnim); anchorAnim = null; }
};

const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const smoothScrollToY = (targetY, duration = 900) => {
  stopAnchorAnim();
  velocity = 0;
  const startY = window.scrollY;
  const diff   = targetY - startY;
  const start  = performance.now();
  const tick   = (now) => {
    const p = Math.min(1, (now - start) / duration);
    const y = startY + diff * easeInOutCubic(p);
    window.scrollTo(0, y);
    tgt    = maxScroll > 0 ? y / maxScroll : 0;
    smooth = tgt;
    anchorAnim = p < 1 ? requestAnimationFrame(tick) : null;
  };
  anchorAnim = requestAnimationFrame(tick);
};

// ── frame loop ────────────────────────────────────────────────────────────────
const dynamicFriction = (v) => (Math.abs(v) > 200 ? 0.8 : 0.9);

const frame = (now) => {
  requestAnimationFrame(frame);
  if (document.hidden) { lastNow = now; return; }

  const dt = Math.min((now - lastNow) / 1000, 0.05);
  lastNow  = now;

  velocity *= Math.pow(dynamicFriction(velocity), dt * 60);
  if (Math.abs(velocity) < 0.01) velocity = 0;

  if (Math.abs(velocity) > 0.2) {
    const next = Math.max(0, Math.min(scrollY + velocity * 0.1, maxScroll));
    window.scrollTo(0, next);
    tgt = maxScroll > 0 ? next / maxScroll : 0;
  }

  smooth += (tgt - smooth) * (1 - Math.exp(-dt * 8));
  smooth  = Math.max(0, Math.min(1, smooth));

  updateHUD(smooth);
  checkImageSwaps(smooth);
  setCubeTransform(smooth);
};

// ── site settings ─────────────────────────────────────────────────────────────
function applySiteSettings(s) {
  if (!s) return;
  const setMeta = (id, val) => {
    const el = document.getElementById(id);
    if (el && val) {
      // <link> uses href; <meta> uses content
      if ('href' in el) el.href    = val;
      else              el.content = val;
    }
  };
  if (s.site_title) {
    document.title = s.site_title;
    setMeta('og-title',      s.site_title);
    setMeta('twitter-title', s.site_title);
  }
  if (s.meta_description) {
    setMeta('meta-description',    s.meta_description);
    setMeta('og-description',      s.meta_description);
    setMeta('twitter-description', s.meta_description);
  }
  if (s.og_image) {
    setMeta('og-image',      s.og_image);
    setMeta('twitter-image', s.og_image);
  }
  if (s.canonical_url) {
    setMeta('canonical-url', s.canonical_url);
    setMeta('og-url',        s.canonical_url);
  }
  if (s.twitter_card) {
    setMeta('twitter-card', s.twitter_card);
  }
}

// ── init ──────────────────────────────────────────────────────────────────────
async function init() {
  // 1. Fetch gallery entries and site settings in parallel
  const [galleryResult, settingsResult] = await Promise.allSettled([
    fetch('/api/gallery').then((r) => (r.ok ? r.json() : [])),
    fetch('/api/settings').then((r) => (r.ok ? r.json() : {})),
  ]);

  const entries  = galleryResult.status  === 'fulfilled' ? galleryResult.value  : [];
  const settings = settingsResult.status === 'fulfilled' ? settingsResult.value : {};

  if (galleryResult.status === 'rejected') {
    console.warn('[six-faces] Could not load entries:', galleryResult.reason);
  }

  // 1b. Apply settings to <title>, meta, OG, Twitter tags
  applySiteSettings(settings);

  N          = entries.length;
  IMAGE_SRCS = entries.map((e) =>
    e.image_filename
      ? `/uploads/${e.image_filename}`
      : (e.image_url || null)
  );
  FACE_NAMES = entries.map((e) => (e.face_name || '').toUpperCase());
  STOPS      = buildStops(N);

  // 2. Build gallery sections + nav dots
  buildSectionsDOM(entries);
  rebuildDots(N);

  // 3. Collect section elements after DOM build
  sections = [...document.querySelectorAll('#scroll_container section')];

  // 4. Preload images and assign to cube faces
  faceImgIdx = new Array(6).fill(-1);
  IMAGE_SRCS.forEach(preloadImage);
  for (let i = 0; i < Math.min(N, 6); i++) {
    if (IMAGE_SRCS[i]) setFaceImage(i, i, true);
  }

  // 5. Observe reveal elements (including dynamically built ones)
  document.querySelectorAll('.tag, h1, h2, .body-text, .stat-row, .cta, .cta-back, .h-line')
    .forEach((el) => revealObserver.observe(el));

  // 6. Theme
  applyTheme(getSystemTheme());
  mq.addEventListener('change', (e) => applyTheme(e.matches ? 'dark' : 'light'));
  dom.themeToggle.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || getSystemTheme();
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  });

  // 7. Resize + scroll listeners
  resize();
  tgt    = maxScroll > 0 ? scrollY / maxScroll : 0;
  smooth = tgt;

  window.addEventListener('resize', () => {
    resize();
    tgt    = maxScroll > 0 ? scrollY / maxScroll : 0;
    smooth = tgt;
  });

  let resizePending = false;
  const ro = new ResizeObserver(() => {
    if (resizePending) return;
    resizePending = true;
    requestAnimationFrame(() => {
      resize();
      tgt    = maxScroll > 0 ? scrollY / maxScroll : 0;
      smooth = tgt;
      resizePending = false;
    });
  });
  ro.observe(document.documentElement);

  window.addEventListener('scroll', () => {
    tgt = maxScroll > 0 ? scrollY / maxScroll : 0;
    tgt = Math.max(0, Math.min(1, tgt));
  }, { passive: true });

  window.addEventListener('wheel', (e) => {
    e.preventDefault();
    const linePx = 16;
    const pagePx = innerHeight * 0.9;
    const delta  =
      e.deltaMode === 1 ? e.deltaY * linePx :
      e.deltaMode === 2 ? e.deltaY * pagePx : e.deltaY;
    if (Math.abs(delta) < 5) return;
    stopAnchorAnim();
    velocity += delta;
    velocity = Math.max(-600, Math.min(600, velocity));
  }, { passive: false });

  // 8. Anchor-link smooth scroll
  window.addEventListener('touchstart', stopAnchorAnim, { passive: true });
  window.addEventListener('mousedown',  stopAnchorAnim, { passive: true });
  window.addEventListener('keydown',    stopAnchorAnim);

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#s"]');
    if (!a) return;
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    const isHero      = a.getAttribute('href') === '#s0';
    const idx         = sections.indexOf(target);
    const baseY       = idx >= 0
      ? sectionTops[idx]
      : target.getBoundingClientRect().top + window.scrollY;
    const extraOffset = mqSmall.matches && !isHero
      ? Math.max(0, target.offsetHeight - innerHeight)
      : 0;
    smoothScrollToY(Math.max(0, baseY + extraOffset));
  });

  // 9. Start animation loop
  lastNow = performance.now();
  requestAnimationFrame(frame);
}

// ── credit modal ──────────────────────────────────────────────────────────────
(function () {
  const overlay  = document.getElementById('credit-overlay');
  const btnOpen  = document.getElementById('btn-credit');
  const btnClose = document.getElementById('btn-credit-close');

  const open  = () => { overlay.hidden = false; };
  const close = () => { overlay.hidden = true;  };

  btnOpen.addEventListener('click',  open);
  btnClose.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) close(); });
})();

init();
