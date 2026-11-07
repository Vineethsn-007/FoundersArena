/* ============================================================
   THE FOUNDER'S ARENA - js/main.js
   config > Lenis > frames/hero > reveal helpers > sections > resize
   ============================================================ */
(() => {
  'use strict';

  /* ================= CONFIG ================= */
  const CONFIG = {
    frameStart: 32,
    frameEnd: 240,
    maxConcurrent: 8,
    headerOffset: 72,
    scrollDuration: 1.2,
    midFrame: 104,
  };
  const FRAME_COUNT = CONFIG.frameEnd - CONFIG.frameStart + 1;

  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  const hasGSAP = !!(gsap && ScrollTrigger);
  if (hasGSAP) gsap.registerPlugin(ScrollTrigger);

  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const prefersReduced = reducedQuery.matches;

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const window01 = (p, a, b) => clamp((p - a) / (b - a), 0, 1);

  /* ================= STATE ================= */
  const dom = {
    header: $('#siteHeader'),
    menu: $('#mobileMenu'),
    menuBtn: $('#menuBtn'),
    progress: $('.scroll-progress'),
    loader: $('#loader'),
    loaderBar: $('#loaderBar'),
    loaderPct: $('#loaderPct'),
    canvas: $('#frameCanvas'),
    hero: $('#hero'),
    heroGroup1: $('#heroGroup1'),
    heroGroup2: $('#heroGroup2'),
    heroGroup3: $('#heroGroup3'),
  };
  const frames = new Array(FRAME_COUNT);
  let frameLoaded = 0;
  let frameFailed = 0;
  let lastDrawn = -1;
  let drawScheduled = false;
  let pendingDraw = -1;
  let loaderHidden = false;
  let loadSafety = null;
  let lenis = null;
  let menuOpen = false;
  let lastFocused = null;
  let heroIntroPlayed = false;
  let resizeTimer = null;
  let ctx = null;
  let canvasW = 0;
  let canvasH = 0;

  /* ================= LENIS ================= */
  function initLenis() {
    if (prefersReduced || typeof window.Lenis === 'undefined' || !hasGSAP) return;
    lenis = new window.Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.4,
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
  }

  function scrollToTarget(target) {
    if (!target) return;
    if (target === '#hero' || target === '#top') {
      if (lenis) lenis.scrollTo(0, { duration: CONFIG.scrollDuration });
      else window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' });
      return;
    }
    const el = $(target);
    if (!el) return;
    if (lenis) {
      lenis.scrollTo(el, { offset: -CONFIG.headerOffset, duration: CONFIG.scrollDuration });
    } else {
      const top = el.getBoundingClientRect().top + window.scrollY - CONFIG.headerOffset;
      window.scrollTo({ top, behavior: prefersReduced ? 'auto' : 'smooth' });
    }
  }

  /* ================= CANVAS / FRAME LOADER ================= */
  function frameSrc(i) {
    return `frames/frame_${String(CONFIG.frameStart + i).padStart(4, '0')}.jpg`;
  }

  function setupCanvas() {
    if (!dom.canvas) return;
    const rect = dom.canvas.getBoundingClientRect();
    canvasW = Math.max(1, Math.round(rect.width));
    canvasH = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    dom.canvas.width = Math.round(canvasW * dpr);
    dom.canvas.height = Math.round(canvasH * dpr);
    ctx = dom.canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function frameReady(i) {
    const img = frames[i];
    return !!(img && img.complete && img.naturalWidth > 0);
  }

  function nearestFrame(index) {
    if (frameReady(index)) return frames[index];
    for (let d = 1; d < FRAME_COUNT; d += 1) {
      if (index - d >= 0 && frameReady(index - d)) return frames[index - d];
      if (index + d < FRAME_COUNT && frameReady(index + d)) return frames[index + d];
    }
    return null;
  }

  function drawFrame(index) {
    if (!ctx || !canvasW || !canvasH) return;
    const img = nearestFrame(clamp(index, 0, FRAME_COUNT - 1));
    if (!img) return;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    if (!iw || !ih) return;
    const scale = Math.max(canvasW / iw, canvasH / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.drawImage(img, (canvasW - dw) / 2, (canvasH - dh) / 2, dw, dh);
    lastDrawn = index;
  }

  function scheduleDraw(index) {
    pendingDraw = index;
    if (drawScheduled) return;
    drawScheduled = true;
    requestAnimationFrame(() => {
      drawScheduled = false;
      drawFrame(pendingDraw);
    });
  }

  function updateProgress() {
    const pct = Math.min(100, (frameLoaded / FRAME_COUNT) * 100);
    if (dom.loaderBar) {
      dom.loaderBar.style.transform = `scaleX(${pct / 100})`;
      dom.loaderBar.setAttribute('aria-valuenow', String(Math.round(pct)));
    }
    if (dom.loaderPct) dom.loaderPct.textContent = `${Math.round(pct)}%`;
    if (pct >= 95) finishLoading();
  }

  function loadFrame(i) {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        frameLoaded += 1;
        updateProgress();
        resolve(img);
      };
      img.onerror = () => {
        frameFailed += 1;
        frameLoaded += 1;
        updateProgress();
        resolve(null);
      };
      img.src = frameSrc(i);
      frames[i] = img;
    });
  }

  function initFrames() {
    setupCanvas();
    if (!dom.canvas || !ctx) {
      finishLoading();
      return;
    }
    loadSafety = window.setTimeout(finishLoading, 20000);
    const first = loadFrame(0).then((img) => {
      if (img) scheduleDraw(0);
    });
    let next = 1;
    const workers = [];
    const workerCount = Math.max(1, CONFIG.maxConcurrent - 1);
    for (let w = 0; w < workerCount; w += 1) {
      workers.push((async () => {
        while (next < FRAME_COUNT) {
          const i = next;
          next += 1;
          await loadFrame(i);
          if (prefersReduced && i === CONFIG.midFrame) scheduleDraw(i);
        }
      })());
    }
    Promise.all([first, ...workers]).then(() => {
      if (lastDrawn < 0) scheduleDraw(prefersReduced ? CONFIG.midFrame : 0);
    });
  }

  function finishLoading() {
    if (loaderHidden) return;
    loaderHidden = true;
    window.clearTimeout(loadSafety);
    if (prefersReduced) {
      drawFrame(CONFIG.midFrame);
    } else if (lastDrawn < 0) {
      drawFrame(0);
    }
    if (dom.loader) {
      dom.loader.classList.add('is-hidden');
      dom.loader.setAttribute('aria-hidden', 'true');
    }
    if (lenis) lenis.start();
    if (hasGSAP) ScrollTrigger.refresh();
    runHeroIntro();
  }

  /* ================= HERO SCRUB ================= */
  let heroUpdate = null;

  function initHeroScrub() {
    if (!hasGSAP || prefersReduced || !dom.hero || !dom.heroGroup1) return;
    const groups = [dom.heroGroup1, dom.heroGroup2, dom.heroGroup3];
    gsap.set([dom.heroGroup2, dom.heroGroup3], { autoAlpha: 0 });

    const update = (p) => {
      let index = Math.round(p * (FRAME_COUNT - 1));
      if (window.matchMedia('(max-width: 767px)').matches) {
        index = Math.round(index / 2) * 2;
      }
      index = clamp(index, 0, FRAME_COUNT - 1);
      if (index !== pendingDraw) scheduleDraw(index);

      const out1 = window01(p, 0.10, 0.22);
      const in2 = window01(p, 0.32, 0.42);
      const out2 = window01(p, 0.54, 0.64);
      const in3 = window01(p, 0.72, 0.82);

      gsap.set(groups[0], { autoAlpha: 1 - out1, y: -16 * out1 });
      gsap.set(groups[1], { autoAlpha: in2 * (1 - out2), y: 16 * (1 - in2) });
      gsap.set(groups[2], { autoAlpha: in3, y: 16 * (1 - in3) });
    };
    heroUpdate = update;

    const proxy = { p: 0 };
    gsap.to(proxy, {
      p: 1,
      ease: 'none',
      onUpdate: () => update(proxy.p),
      scrollTrigger: {
        trigger: '#hero',
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.6,
        invalidateOnRefresh: true,
        onRefresh: (self) => update(self.progress),
      },
    });
  }

  function splitWords(el) {
    const text = el.textContent.replace(/\s+/g, ' ').trim();
    el.textContent = '';
    const frag = document.createDocumentFragment();
    const words = text.split(' ');
    words.forEach((word, i) => {
      const wrap = document.createElement('span');
      wrap.className = 'w';
      const inner = document.createElement('i');
      inner.textContent = word;
      wrap.appendChild(inner);
      frag.appendChild(wrap);
      if (i < words.length - 1) frag.appendChild(document.createTextNode(' '));
    });
    el.appendChild(frag);
    return $$('.w > i', el);
  }

  function initHeroIntro() {
    if (!hasGSAP || prefersReduced) return;
    const title = $('.hero-title');
    if (title) splitWords(title);
    const words = $$('.hero-title .w > i');
    if (words.length) gsap.set(words, { yPercent: 110 });
    const fades = $$('[data-hero-fade]');
    if (fades.length) gsap.set(fades, { autoAlpha: 0, y: 16 });
  }

  function runHeroIntro() {
    if (!hasGSAP || prefersReduced || heroIntroPlayed) return;
    heroIntroPlayed = true;
    const words = $$('.hero-title .w > i');
    const fades = $$('[data-hero-fade]');
    const tl = gsap.timeline({ delay: 0.08 });
    if (words.length) {
      gsap.set(words, { willChange: 'transform' });
      tl.to(words, {
        yPercent: 0,
        duration: 0.85,
        ease: 'expo.out',
        stagger: 0.06,
        onComplete: () => gsap.set(words, { willChange: 'auto' }),
      });
    }
    if (fades.length) {
      tl.to(fades, {
        autoAlpha: 1,
        y: 0,
        duration: 0.7,
        ease: 'power3.out',
        stagger: 0.07,
      }, '-=0.55');
    }
  }

  /* ================= REVEALS / COUNTS / TIMELINES ================= */
  function initReveals() {
    if (!hasGSAP || prefersReduced) return;

    $$('[data-split]').forEach((el) => {
      if (el.closest('#hero')) return;
      const words = splitWords(el);
      if (!words.length) return;
      gsap.set(words, { yPercent: 110 });
      gsap.to(words, {
        yPercent: 0,
        duration: 0.8,
        ease: 'expo.out',
        stagger: 0.06,
        scrollTrigger: { trigger: el, start: 'top 85%', once: true },
        onStart: () => gsap.set(words, { willChange: 'transform' }),
        onComplete: () => gsap.set(words, { willChange: 'auto' }),
      });
    });

    $$('[data-reveal]').forEach((el) => {
      const y = el.classList.contains('eyebrow') ? 12 : 24;
      gsap.fromTo(el, { autoAlpha: 0, y }, {
        autoAlpha: 1,
        y: 0,
        duration: 0.7,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      });
    });

    $$('[data-reveal-stagger]').forEach((group) => {
      const children = Array.from(group.children);
      if (!children.length) return;
      gsap.fromTo(children, { autoAlpha: 0, y: 24 }, {
        autoAlpha: 1,
        y: 0,
        duration: 0.7,
        ease: 'power3.out',
        stagger: 0.08,
        scrollTrigger: { trigger: group, start: 'top 85%', once: true },
      });
    });
  }

  function initCounts() {
    $$('[data-count]').forEach((el) => {
      const end = parseInt(el.getAttribute('data-count'), 10);
      if (Number.isNaN(end)) return;
      if (!hasGSAP || prefersReduced) {
        el.textContent = String(end);
        return;
      }
      el.textContent = '0';
      const obj = { v: 0 };
      gsap.to(obj, {
        v: end,
        duration: 1.2,
        ease: 'power2.out',
        snap: { v: 1 },
        onUpdate: () => { el.textContent = String(Math.round(obj.v)); },
        scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      });
    });
  }

  function initTimelines() {
    $$('[data-timeline]').forEach((col) => {
      const timeline = $('.timeline', col);
      if (!timeline) return;
      const line = $('.timeline__line', timeline);
      const dots = $$('.timeline__dot i', timeline);
      if (!hasGSAP || prefersReduced) {
        if (hasGSAP) gsap.set(dots, { scale: 1 });
        return;
      }
      if (line) {
        gsap.set(line, { scaleY: 0, transformOrigin: 'top center' });
      }
      gsap.set(dots, { scale: 0 });
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: timeline,
          start: 'top 78%',
          end: 'bottom 62%',
          scrub: 0.5,
        },
      });
      if (line) tl.to(line, { scaleY: 1, ease: 'none', duration: 1 }, 0);
      dots.forEach((dot, i) => {
        const at = dots.length > 1 ? 0.06 + (i / dots.length) * 0.9 : 0.5;
        tl.to(dot, { scale: 1, duration: 0.12, ease: 'power1.out' }, at);
      });
    });
  }

  /* ================= HEADER / PROGRESS ================= */
  function initScrollUI() {
    if (!dom.header) return;
    if (!hasGSAP || prefersReduced) {
      const update = () => {
        dom.header.classList.toggle('is-scrolled', window.scrollY > 80);
      };
      window.addEventListener('scroll', update, { passive: true });
      update();
      return;
    }
    const syncHeader = (self) => {
      dom.header.classList.toggle('is-scrolled', self.scroll() > 80);
    };
    ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: syncHeader,
      onRefresh: syncHeader,
    });
    if (dom.progress) {
      gsap.to(dom.progress, {
        scaleX: 1,
        ease: 'none',
        scrollTrigger: { start: 0, end: 'max', scrub: 0.2 },
      });
    }
  }

  /* ================= MOBILE MENU ================= */
  function menuFocusables() {
    const links = dom.menu ? $$('a', dom.menu) : [];
    return [dom.menuBtn, ...links].filter((el) => el && el.offsetParent !== null);
  }

  function onMenuKey(e) {
    if (!menuOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusables = menuFocusables();
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function openMenu() {
    if (!dom.menu || !dom.menuBtn || menuOpen) return;
    menuOpen = true;
    lastFocused = document.activeElement;
    dom.menu.hidden = false;
    dom.menuBtn.setAttribute('aria-expanded', 'true');
    dom.menuBtn.setAttribute('aria-label', 'Close menu');
    document.body.classList.add('menu-open');
    $$('main, .site-footer').forEach((el) => { el.inert = true; });
    if (lenis) lenis.stop();
    document.addEventListener('keydown', onMenuKey);
    const focusables = menuFocusables();
    if (focusables.length) focusables[0].focus();
  }

  function closeMenu(opts = {}) {
    if (!dom.menu || !dom.menuBtn || !menuOpen) return;
    menuOpen = false;
    dom.menu.hidden = true;
    dom.menuBtn.setAttribute('aria-expanded', 'false');
    dom.menuBtn.setAttribute('aria-label', 'Open menu');
    document.body.classList.remove('menu-open');
    $$('main, .site-footer').forEach((el) => { el.inert = false; });
    if (lenis) lenis.start();
    document.removeEventListener('keydown', onMenuKey);
    if (opts.restoreFocus !== false) {
      const restore = lastFocused && document.contains(lastFocused) ? lastFocused : dom.menuBtn;
      restore.focus();
    }
  }

  function setupMenu() {
    if (!dom.menu || !dom.menuBtn) return;
    dom.menuBtn.addEventListener('click', () => {
      if (menuOpen) closeMenu();
      else openMenu();
    });
  }

  /* ================= ANCHORS ================= */
  function bindAnchors() {
    $$('[data-scroll-to], [data-scroll-to-top]').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = link.hasAttribute('data-scroll-to-top')
          ? '#hero'
          : link.getAttribute('data-scroll-to');
        if (menuOpen) closeMenu({ restoreFocus: false });
        scrollToTarget(target);
      });
    });
  }

  /* ================= RESIZE / FONTS ================= */
  function onResize() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      setupCanvas();
      if (prefersReduced) {
        drawFrame(CONFIG.midFrame);
      } else if (heroUpdate && hasGSAP) {
        ScrollTrigger.refresh();
      } else if (lastDrawn >= 0) {
        drawFrame(lastDrawn);
      }
      if (menuOpen && window.innerWidth > 900) closeMenu();
    }, 200);
  }

  /* ================= INIT ================= */
  function init() {
    initLenis();
    setupMenu();
    bindAnchors();
    initScrollUI();
    initFrames();
    if (hasGSAP) {
      initReveals();
      initCounts();
      initTimelines();
      if (!prefersReduced) {
        initHeroIntro();
        initHeroScrub();
      }
    }
    window.addEventListener('resize', onResize, { passive: true });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (hasGSAP) ScrollTrigger.refresh();
        if (prefersReduced) drawFrame(CONFIG.midFrame);
      });
    }
    window.addEventListener('load', () => {
      if (hasGSAP) ScrollTrigger.refresh();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
