/* ============================================================
   THE FOUNDER'S ARENA — js/main.js
   Phase 1 (scaffold): Lenis + GSAP wiring, header state,
   scroll progress hairline, anchor scrolling.
   ============================================================ */

/* ---------------- Shared helpers ---------------- */
const prefersReducedMotion =
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
/* smoothstep inside a progress window a..b (returns 0..1) */
const window01 = (p, a, b) => clamp((p - a) / (b - a), 0, 1);

/* ---------------- Lenis + ScrollTrigger wiring ---------------- */
let lenis = null;
let scrollToTarget = (target, opts = {}) => {
  const el = typeof target === 'string' ? $(target) : target;
  if (!el) return;
  if (lenis) {
    lenis.scrollTo(el, { offset: -72, ...opts });
  } else {
    const top =
      el.getBoundingClientRect().top + window.scrollY - 72;
    window.scrollTo({
      top,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }
};

if (!prefersReducedMotion) {
  lenis = new Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop(); // stopped until the preloader is hidden
  gsap.registerPlugin(ScrollTrigger);
} else {
  gsap.registerPlugin(ScrollTrigger);
}

/* ---------------- Anchor scrolling ---------------- */
$$('[data-scroll-to]').forEach((link) => {
  link.addEventListener('click', (e) => {
    const target = link.getAttribute('data-scroll-to');
    if (!target) return;
    e.preventDefault();
    if (target === '#hero' && link.closest('a[href="#hero"]')) {
      // header brand links go to very top
      if (lenis) lenis.scrollTo(0);
      else window.scrollTo({ top: 0 });
      return;
    }
    scrollToTarget(target);
    closeMobileMenu();
  });
});
const backTop = $('[data-scroll-to-top]');
if (backTop) {
  backTop.addEventListener('click', () => {
    if (lenis) lenis.scrollTo(0);
    else window.scrollTo({ top: 0 });
  });
}

/* ---------------- Header state + progress hairline ---------------- */
const header = $('#siteHeader');
const progressBar = $('.scroll-progress');

function onScrollState() {
  const y = window.scrollY;
  header.classList.toggle('is-scrolled', y > 80);
  const max = document.documentElement.scrollHeight - window.innerHeight;
  if (progressBar) {
    progressBar.style.transform = `scaleX(${max > 0 ? clamp(y / max, 0, 1) : 0})`;
  }
}
window.addEventListener('scroll', onScrollState, { passive: true });
onScrollState();

/* ---------------- Mobile menu ---------------- */
const menuBtn = $('#menuBtn');
const mobileMenu = $('#mobileMenu');
let menuOpen = false;

function openMobileMenu() {
  menuOpen = true;
  mobileMenu.hidden = false;
  menuBtn.setAttribute('aria-expanded', 'true');
  menuBtn.setAttribute('aria-label', 'Close menu');
  gsap.fromTo(
    '#mobileMenu',
    { opacity: 0 },
    { opacity: 1, duration: 0.35, ease: 'power2.out' }
  );
}
function closeMobileMenu(instant = false) {
  if (!menuOpen) return;
  menuOpen = false;
  menuBtn.setAttribute('aria-expanded', 'false');
  menuBtn.setAttribute('aria-label', 'Open menu');
  const close = () => {
    mobileMenu.hidden = true;
  };
  if (instant) return close();
  gsap.to('#mobileMenu', {
    opacity: 0,
    duration: 0.25,
    ease: 'power2.in',
    onComplete: close,
  });
}
menuBtn.addEventListener('click', () => {
  menuOpen ? closeMobileMenu() : openMobileMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMobileMenu();
});

/* ============================================================
   PHASE 2 — Hero frame sequence (canvas renderer, preloader,
   scroll scrub, overlay copy control)
   ============================================================ */

/* FRAME_COUNT is verified automatically at runtime by probing
   /frames with HEAD requests (exponential + binary search).
   This fallback matches the current /frames folder contents
   (frame_0001.jpg … frame_0240.jpg) and is used when probing is
   not possible (e.g. opened via file://). If you add or remove
   frames, update this number — or keep it in sync so it is
   correct even offline. */
const FRAME_COUNT_FALLBACK = 240;
let FRAME_COUNT = FRAME_COUNT_FALLBACK;
let framesAvailable = true; // false => solid-colour fallback canvas

const pad4 = (n) => String(n).padStart(4, '0');
const frameURL = (i) => `frames/frame_${pad4(i + 1)}.jpg`;

async function probeFrame(i) {
  try {
    const res = await fetch(frameURL(i), { method: 'HEAD' });
    return res.ok;
  } catch {
    return null; // probing unavailable
  }
}

async function detectFrameCount() {
  try {
    const first = await probeFrame(0);
    if (first === null) return -1; // cannot probe offline
    if (first === false) return 0; // /frames is empty
    let lo = 0,
      hi = 1;
    while (await probeFrame(hi)) {
      lo = hi;
      hi *= 2;
      if (hi > 4000) break;
    }
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (await probeFrame(mid)) lo = mid;
      else hi = mid;
    }
    return lo + 1; // highest probe hit is index lo (0-based)
  } catch {
    return -1;
  }
}

/* ---------------- Canvas renderer ---------------- */
const canvas = $('#frameCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let cw = 0,
  ch = 0,
  dpr = 1;

let imgMap = new Map(); // index -> Image (loaded only)
let STRIDE = window.innerWidth < 768 ? 2 : 1; // mobile: every 2nd frame
let lastDrawn = -2; // force first draw
let requestedFrame = 0;

function drawFill() {
  // solid-colour fallback when no frames exist
  ctx.fillStyle = '#0b0d10';
  ctx.fillRect(0, 0, cw, ch);
}

function drawCover(img) {
  const iw = img.naturalWidth,
    ih = img.naturalHeight;
  const scale = Math.max(cw / iw, ch / ih); // "cover" fit, centre-crop
  const w = iw * scale,
    h = ih * scale;
  ctx.fillStyle = '#0b0d10';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
}

function snapToLoaded(i) {
  if (imgMap.has(i)) return i;
  let j = i - (i % STRIDE); // stay on the stride grid
  while (j >= 0 && !imgMap.has(j)) j -= STRIDE;
  return j; // -1 => nothing loaded yet
}

function drawFrame(i, force = false) {
  if (!ctx) return;
  const j = snapToLoaded(i);
  if (!force && j === lastDrawn) return;
  lastDrawn = j;
  if (j < 0 || !framesAvailable) drawFill();
  else drawCover(imgMap.get(j));
}

function sizeCanvas() {
  if (!canvas) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cw = canvas.clientWidth || canvas.parentElement.clientWidth;
  ch = canvas.clientHeight || canvas.parentElement.clientHeight;
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawFrame(requestedFrame, true); // repaint, no jump/flicker on resize
}

/* Draw inside rAF, and only when the index actually changed */
let pendingFrame = null,
  rafScheduled = false;
function scheduleDraw(i) {
  requestedFrame = i;
  if (pendingFrame === i) return;
  pendingFrame = i;
  if (rafScheduled) return;
  rafScheduled = true;
  requestAnimationFrame(() => {
    rafScheduled = false;
    if (pendingFrame !== null) {
      drawFrame(pendingFrame);
      pendingFrame = null;
    }
  });
}

/* ---------------- Preloader + image loading ---------------- */
const loader = $('#loader');
const loaderBar = $('#loaderBar');
const loaderPct = $('#loaderPct');
let loaderHidden = false;
let loaderDone = false; // resolves once ≥ 95% loaded

function setLoaderProgress(ratio) {
  const pct = Math.round(ratio * 100);
  if (loaderBar) loaderBar.style.transform = `scaleX(${clamp(ratio, 0, 1)})`;
  if (loaderPct) loaderPct.textContent = `${pct}%`;
}

function hideLoader() {
  if (loaderHidden) return;
  loaderHidden = true;
  if (loader) {
    loader.classList.add('is-hidden');
    gsap.to(loader, {
      opacity: 0,
      duration: 0.4,
      ease: 'power2.out',
      onComplete: () => loader.remove(),
    });
  }
  if (lenis) lenis.start(); // release scrolling only now
  playHeroIntro();
  ScrollTrigger.refresh();
}

function loadHeroFrames() {
  if (!framesAvailable || FRAME_COUNT < 2) {
    // Empty /frames: build the page on a solid-colour canvas.
    setLoaderProgress(1);
    hideLoader();
    drawFill();
    return;
  }

  const indices = [];
  for (let i = 0; i < FRAME_COUNT; i += STRIDE) indices.push(i);
  const total = indices.length;
  let settled = 0,
    next = 0,
    released = false;

  const settle = (idx, img, ok) => {
    settled++;
    if (ok && img) imgMap.set(idx, img);
    const ratio = settled / total;
    setLoaderProgress(ratio);
    if (!released && ratio >= 0.95) {
      released = true;
      loaderDone = true;
      hideLoader(); // don't block the page on the last few frames
    }
  };

  /* 8-concurrent loader pool, frames in order */
  const CONCURRENCY = 8;
  let launched = 0;

  const launch = () => {
    while (launched < total && next - settled < CONCURRENCY) {
      const idx = indices[next++];
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => settle(idx, img, true);
      img.onerror = () => settle(idx, null, false);
      img.src = frameURL(idx);
      launched = next; // every cursor slot = one in-flight request
    }
  };

  const pump = setInterval(() => {
    if (next >= total) return clearInterval(pump);
    launch();
  }, 16);
  launch(); // start filling the pool immediately

  // Load frame 1 first and draw it immediately (no blank canvas).
  const first = new Image();
  first.decoding = 'async';
  first.onload = () => {
    imgMap.set(0, first);
    sizeCanvas();
    drawFrame(0, true);
  };
  first.onerror = () => {
    framesAvailable = false;
    setLoaderProgress(1);
    hideLoader();
    drawFill();
  };
  first.src = frameURL(0);

  // Wait for the very first frame before pumping the pool so the
  // preloader percentage starts meaningfully with frame 1 in place.
  const startWhenReady = () => {
    const t = setTimeout(startWhenReady, 30);
    if (imgMap.has(0) || !framesAvailable) {
      clearTimeout(t);
    }
  };
  startWhenReady();
}

/* ---------------- Hero scroll scrub ---------------- */
const heroSection = $('#hero');
const heroGroup1 = $('#heroGroup1');
const heroGroup2 = $('#heroGroup2');
const heroGroup3 = $('#heroGroup3');
const heroScrollIndicator = $('.hero-scroll');

function updateHeroOverlays(p) {
  if (!heroGroup1) return;
  // Group 1 (intro): visible at load, gone by 15%
  const g1 = 1 - window01(p, 0.08, 0.15);
  // Scroll indicator fades by 10%
  const ind = 1 - window01(p, 0.05, 0.1);
  // Group 2 (mid line): in 30–38%, out 48–55%
  const g2in = window01(p, 0.3, 0.38);
  const g2out = window01(p, 0.48, 0.55);
  const g2 = g2in * (1 - g2out);
  // Group 3 (chips): in 75–85%, holds to the end
  const g3 = window01(p, 0.75, 0.85);

  gsap.set(heroGroup1, { opacity: g1, y: 18 * (1 - g1) });
  if (heroScrollIndicator)
    gsap.set(heroScrollIndicator, { opacity: ind });
  if (heroGroup2) gsap.set(heroGroup2, {
    opacity: g2,
    y: 20 * (1 - g2),
  });
  if (heroGroup3) gsap.set(heroGroup3, {
    opacity: g3,
    y: 20 * (1 - g3),
  });
}

function initHeroScrub() {
  if (!framesAvailable || FRAME_COUNT < 2) return;

  if (prefersReducedMotion) {
    // Static middle frame, no scrubbing, no overlay animation.
    drawHeroStaticFrame();
    return;
  }

  const frameState = { frame: 0 };
  gsap.to(frameState, {
    frame: FRAME_COUNT - 1,
    ease: 'none',
    scrollTrigger: {
      trigger: '#hero',
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.6,
      invalidateOnRefresh: true,
    },
    onUpdate() {
      const i = Math.round(clamp(frameState.frame, 0, FRAME_COUNT - 1));
      scheduleDraw(i);
    },
  });

  ScrollTrigger.create({
    trigger: '#hero',
    start: 'top top',
    end: 'bottom bottom',
    onUpdate(self) {
      updateHeroOverlays(self.progress);
    },
  });
  updateHeroOverlays(0);
}

function drawHeroStaticFrame() {
  // prefers-reduced-motion: one static frame — the middle one.
  overlayStaticHeroCopy();
  if (!framesAvailable || FRAME_COUNT < 2) {
    drawFill();
    return;
  }
  const mid = Math.floor((FRAME_COUNT - 1) / 2);
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    imgMap.set(mid, img);
    sizeCanvas();
    drawFrame(mid, true);
  };
  img.onerror = () => drawFill();
  img.src = frameURL(mid);
}

/* Reduced motion: show hero copy statically, no reveal animation. */
function overlayStaticHeroCopy() {
  if (heroGroup1) {
    gsap.set(heroGroup1, { opacity: 1, y: 0 });
    const inner = heroGroup1.querySelectorAll('.w > i');
    inner.forEach((el) => gsap.set(el, { yPercent: 0 }));
  }
  if (heroScrollIndicator) gsap.set(heroScrollIndicator, { opacity: 1 });
  if (heroGroup2) gsap.set(heroGroup2, { opacity: 0 });
  if (heroGroup3) gsap.set(heroGroup3, { opacity: 0 });
}

/* ---------------- Hero title split + intro reveal ---------------- */
function splitWords(el) {
  if (!el || el.dataset.split === 'done') return;
  const words = el.textContent.trim().split(/\s+/);
  el.textContent = '';
  el.classList.add('split');
  el.setAttribute('aria-label', words.join(' '));
  words.forEach((word, idx) => {
    const w = document.createElement('span');
    w.className = 'w';
    const i = document.createElement('i');
    i.textContent = word;
    w.appendChild(i);
    el.appendChild(w);
    if (idx < words.length - 1) el.appendChild(document.createTextNode(' '));
  });
  el.dataset.split = 'done';
}

function playHeroIntro() {
  if (prefersReducedMotion) return;
  const items = $$('#heroTitle .w > i');
  gsap.fromTo(
    items,
    { yPercent: 110 },
    { yPercent: 0, duration: 0.8, ease: 'expo.out', stagger: 0.06 }
  );
  gsap.fromTo(
    ['.hero-eyebrow', '.hero-sub', '.hero-scroll'],
    { opacity: 0, y: 14 },
    { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.08, delay: 0.15 }
  );
}

/* ---------------- Resize ---------------- */
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    sizeCanvas();
    ScrollTrigger.refresh();
  }, 120);
});

/* ---------------- Boot ---------------- */
function prepHero() {
  splitWords($('#heroTitle'));
  sizeCanvas();
  if (prefersReducedMotion) {
    if (loader) loader.remove();
    drawHeroStaticFrame(); // shows the single middle frame, no scrub
    ScrollTrigger.refresh();
    return;
  }
  if (lenis) lenis.stop();
  (async () => {
    const detected = await detectFrameCount();
    if (detected === 0) {
      framesAvailable = false; // /frames empty → solid fallback canvas
    } else if (detected > 0) {
      FRAME_COUNT = detected;
    } else {
      FRAME_COUNT = FRAME_COUNT_FALLBACK; // offline probe → known count
    }
    loadHeroFrames();
    initHeroScrub();
  })();
}

prepHero();

/* Refresh ScrollTrigger once fonts are settled too. */
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => ScrollTrigger.refresh());
}

/* ============================================================
   PHASE 4 — Content animations (split-text, fade-up, count-up,
   timeline draw). Reveals play once, 0.6–0.9s, power3/expo out,
   start at "top 85%". Nothing else animates.
   ============================================================ */

function initContentAnimations() {
  if (prefersReducedMotion) {
    // Show everything at final state; no reveal animations at all.
    $$('.split-target').forEach(splitWords);
    $$('[data-count]').forEach((el) => (el.textContent = el.dataset.count));
    $$('.timeline__dot').forEach((d) => d.classList.add('is-filled'));
    return;
  }

  /* ---- 1. Split-text headings: words rise from below, once ---- */
  $$('.split-target').forEach((heading) => {
    splitWords(heading);
    heading.classList.add('split');
    const words = $$('.w > i', heading);
    if (!words.length) return;
    gsap.set(words, { yPercent: 110 });
    gsap.to(words, {
      yPercent: 0,
      duration: 0.7,
      ease: 'power3.out',
      stagger: 0.06,
      scrollTrigger: {
        trigger: heading,
        start: 'top 85%',
        once: true,
      },
    });
  });

  /* ---- 2. Fade-up blocks (optionally staggered groups) ---- */
  $$('[data-reveal-stagger]').forEach((group) => {
    const children = Array.from(group.children);
    gsap.set(children, { opacity: 0, y: 24 });
    gsap.to(children, {
      opacity: 1,
      y: 0,
      duration: 0.7,
      ease: 'power3.out',
      stagger: 0.08,
      scrollTrigger: {
        trigger: group,
        start: 'top 85%',
        once: true,
      },
    });
  });

  $$('[data-reveal]:not([data-reveal-stagger] > *)').forEach((el) => {
    // skip plain reveals that live inside a stagger group (those are covered)
    if (el.closest('[data-reveal-stagger]')) return;
    gsap.set(el, { opacity: 0, y: 24 });
    gsap.to(el, {
      opacity: 1,
      y: 0,
      duration: 0.7,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: el,
        start: 'top 85%',
        once: true,
      },
    });
  });

  /* ---- 3. One count-up on the stats row ---- */
  $$('[data-count]').forEach((el) => {
    const target = parseInt(el.dataset.count, 10) || 0;
    const obj = { v: 0 };
    gsap.to(obj, {
      v: target,
      duration: 1.2,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: el,
        start: 'top 85%',
        once: true,
      },
      onUpdate() {
        el.textContent = String(Math.round(obj.v));
      },
    });
  });

  /* ---- 4. Timeline lines draw with scroll; dots fill as reached ---- */
  $$('.schedule-col').forEach((col) => {
    const line = $('.timeline__line', col);
    const dots = $$('.timeline__dot', col);
    if (!line || !dots.length) return;
    gsap.set(line, { scaleY: 0 });
    ScrollTrigger.create({
      trigger: col,
      start: 'top 78%',
      end: 'bottom 55%',
      scrub: true,
      onUpdate(self) {
        gsap.set(line, { scaleY: self.progress });
        dots.forEach((dot, i) => {
          const threshold = (i + 0.5) / dots.length;
          dot.classList.toggle('is-filled', self.progress >= threshold);
        });
      },
    });
  });

  ScrollTrigger.refresh();
}

/* Run after DOM + hero prep are in place. */
window.addEventListener('load', () => {
  initContentAnimations();
  ScrollTrigger.refresh();
});
