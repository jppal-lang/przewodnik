/* =====================================================================
   QUOLINO — ruch w albumie (motion.js)
   1. Naklejki „wklejają się”, gdy wjeżdżają w ekran (IntersectionObserver).
      Treść jest widoczna bez JS — ukrywamy ją dopiero, gdy ten skrypt działa.
   2. Przycisk pauzy dla wideo na okładce (WCAG 2.2.2).
   3. prefers-reduced-motion: bez animacji, wideo zatrzymane.
   Zero zależności.
   ===================================================================== */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SEL = '.route-step,.why-row,.rules-text,.rules-box,.region-tile,.country-head,' +
            '.city-card,.other-region-tile,.qc-stop,.qc-strip__stk,.qc-section__title,' +
            '.qc-panel,.qc-card,.qc-tel,.qc-box,.album-head';

  // ── wideo na okładce ──
  function initVideo(btn) {
    var v = document.getElementById(btn.getAttribute('data-video-toggle'));
    if (!v) return;
    function sync() {
      var paused = v.paused;
      btn.setAttribute('aria-pressed', String(paused));
      btn.setAttribute('aria-label', paused ? 'Odtwórz animację' : 'Zatrzymaj animację');
      btn.classList.toggle('is-paused', paused);
    }
    if (reduce) { v.removeAttribute('autoplay'); v.pause(); }
    btn.addEventListener('click', function () {
      if (v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } else { v.pause(); }
    });
    v.addEventListener('play', sync);
    v.addEventListener('pause', sync);
    sync();
  }
  document.querySelectorAll('[data-video-toggle]').forEach(initVideo);

  if (reduce || !('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('motion');

  // ── wklejanie przy przewijaniu ──
  var queue = [], timer = null;
  function flush() {
    queue.forEach(function (el, i) {
      el.style.setProperty('--rv-delay', (i * 90) + 'ms');
      el.classList.add('is-in');
    });
    queue = []; timer = null;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      queue.push(e.target);
    });
    if (queue.length && !timer) timer = setTimeout(flush, 16);
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

  function watch(root) {
    var list = [];
    if (root.matches && root.matches(SEL)) list.push(root);
    if (root.querySelectorAll) list = list.concat(Array.prototype.slice.call(root.querySelectorAll(SEL)));
    list.forEach(function (el) {
      if (el.hasAttribute('data-rv')) return;
      el.setAttribute('data-rv', '');
      io.observe(el);
    });
  }
  watch(document.body);
  // treść miast/regionów wjeżdża z Supabase — łapiemy nowe węzły
  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      m.addedNodes.forEach(function (n) { if (n.nodeType === 1) watch(n); });
    });
  }).observe(document.body, { childList: true, subtree: true });
})();
