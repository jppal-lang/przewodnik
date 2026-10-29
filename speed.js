/* Quolino — odczuwalna szybkość (I-9, JP 2026-10-29): prerender linków wewnętrznych i przejścia między stronami.
   Strony: index, region, country (w <head>, bez defer: słuchacz „pagereveal” musi być przed pierwszym malowaniem)
   oraz strony miast z serwera SSR (dopisuje ten sam <script> w <head>).
   – Speculation Rules: przeglądarka przygotowuje stronę w tle, gdy palec dotyka linku albo kursor zatrzyma się na nim
     (eagerness „moderate”), tylko dla stron serwisu: główna, kraj, region, miasto. Bez linków z ?nostats, szkiców (?draft=),
     widoku dziecka (?view=kid), logowania, konta, gry i panelu. Statystyki: stats.js liczy odsłonę dopiero po pokazaniu strony
     (document.prerendering → prerenderingchange). Przeglądarki bez wsparcia po prostu ładują stronę jak dotąd.
   – View Transitions: @view-transition w styles.css (blok „SEO, przejścia 2026-10-29”, wyłączone przy „ograniczonych animacjach”).
     Ten skrypt daje kaflowi miasta i zdjęciu na stronie miasta wspólną nazwę „qc-hero”, więc kafel „rośnie” w zdjęcie miasta
     (i wraca przy cofnięciu). Bez danych, bez zapisu, bez ciasteczek. */
(function () {
  'use strict';
  var NAME = 'qc-hero';

  // ── prerender ──────────────────────────────────────────────────────────────────────────
  try {
    if (window.HTMLScriptElement && HTMLScriptElement.supports && HTMLScriptElement.supports('speculationrules') &&
        !document.querySelector('script[type="speculationrules"]')) {
      var skip = ['a[href*="nostats"]', 'a[href*="draft="]', 'a[href*="view=kid"]', 'a[href*="/zaloguj"]', 'a[href*="/konto"]',
        'a[href*="/gra/"]', 'a[href*="/_admin"]', 'a[target]', 'a[download]', '[data-no-prerender]', '[data-no-prerender] a'].join(',');
      var rules = { prerender: [{ source: 'document', eagerness: 'moderate', where: { and: [
        { or: [{ href_matches: '/' }, { href_matches: '/\\?*' }, { href_matches: '/:lang([a-z]{2})/*' },
               { href_matches: '/region.html\\?*' }, { href_matches: '/country.html\\?*' }, { href_matches: '/city.html\\?*' }] },
        { not: { selector_matches: skip } }
      ] } }] };
      var s = document.createElement('script');
      s.type = 'speculationrules';
      s.textContent = JSON.stringify(rules);
      document.head.appendChild(s);
    }
  } catch (e) { /* tylko przyspieszenie — bez niego wszystko działa */ }

  // ── wspólna naklejka w przejściu: kafel miasta ↔ zdjęcie miasta ─────────────────────────
  var picked = null;   // ostatnio dotknięty kafel miasta (a[data-city])
  function tileImg(a) { return a && a.querySelector('.city-img, .rt-img, .sticker-art img, .atlas-region__art img'); }
  function samePath(a, b) {
    try { var x = new URL(a, location.href), y = new URL(b, location.href); return x.origin === y.origin && x.pathname === y.pathname; } catch (e) { return false; }
  }
  function mark(img, done) {
    if (!img) return;
    img.style.viewTransitionName = NAME;
    if (done && done.finished) done.finished.then(clear, clear);
    function clear() { img.style.viewTransitionName = ''; }
  }
  document.addEventListener('pointerdown', function (e) { picked = e.target && e.target.closest ? e.target.closest('a[data-city]') : null; }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter') picked = document.activeElement && document.activeElement.closest ? document.activeElement.closest('a[data-city]') : null; }, true);

  // stara strona: nazwę dostaje tylko kafel, w który kliknięto (nazwa musi być jedna na stronie)
  window.addEventListener('pageswap', function (e) {
    if (!e.viewTransition) return;
    var to = e.activation && e.activation.entry && e.activation.entry.url;
    if (picked && to && samePath(picked.href, to)) mark(tileImg(picked), e.viewTransition);
  });
  // nowa strona: po powrocie z miasta (wstecz albo okruszek) kafel tego miasta przejmuje zdjęcie
  window.addEventListener('pagereveal', function (e) {
    if (!e.viewTransition) return;
    var from = window.navigation && navigation.activation && navigation.activation.from && navigation.activation.from.url;
    if (!from || document.querySelector('.qc-hero img')) return;   // strona miasta: nazwę daje CSS (.qc-hero img)
    var tiles = document.querySelectorAll('a[data-city]');
    for (var i = 0; i < tiles.length; i++) if (samePath(tiles[i].href, from)) { mark(tileImg(tiles[i]), e.viewTransition); break; }
  });
})();
