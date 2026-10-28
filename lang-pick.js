/* Quolino — wybór języka strony (jedna funkcja dla wszystkich stron, JP 2026-10-28, K5).
   Kolejność: ?lang=xx → język z adresu (/de/italien/…, strony z serwera) → zapisany wybór (localStorage quolino_lang) → język przeglądarki (navigator.languages)
   dopasowany do 17 obsługiwanych → angielski. Bez przekierowań i ciasteczek: robot (Googlebot) dostaje „/” jak dotąd.
   Ładować w <head> PRZED i18n-ui.js / page-i18n.js.  API: QLang.pick(), QLang.save(l), QLang.match(tag), QLang.SUPPORTED. */
(function () {
  'use strict';
  var SUPPORTED = ['pl', 'en', 'de', 'it', 'cs', 'da', 'es', 'fr', 'hr', 'hu', 'nl', 'no', 'pt', 'ro', 'sk', 'sv', 'uk'];
  var ALIAS = { nb: 'no', nn: 'no' };   // norweski bokmål / nynorsk → no
  function match(tag) {
    var l = String(tag || '').toLowerCase().split(/[-_]/)[0];
    l = ALIAS[l] || l;
    return SUPPORTED.indexOf(l) >= 0 ? l : null;
  }
  function saved() { try { return localStorage.getItem('quolino_lang'); } catch (e) { return null; } }
  function save(l) { try { localStorage.setItem('quolino_lang', l); } catch (e) { /* prywatne okno */ } }
  function browser() {
    var list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language];
    for (var i = 0; i < list.length; i++) { var m = match(list[i]); if (m) return m; }
    return null;
  }
  function pick() {
    var q = null;
    try { q = new URLSearchParams(location.search).get('lang'); } catch (e) { /* stara przeglądarka */ }
    var p = /^\/([a-z]{2})\//.exec(location.pathname);
    return match(q) || (p && match(p[1])) || match(saved()) || browser() || 'en';
  }
  // Linki wewnętrzne niosą język strony od razu w adresie (JP 2026-10-29: „/#jak” w obcym języku był niespodzianką).
  // Dotyczy strony głównej i stron pomocniczych (one wybierają język z ?lang=); adresy /xx/… mają język w ścieżce.
  var LINKABLE = /^\/(?:$|[?#]|index\.html|kontakt\.html|konto\.html|zaloguj\.html|cookie-policy\.html|wspolpraca\.html|gra\/)/;
  function pageLang() { return match(document.documentElement.getAttribute('lang')) || pick(); }
  function link(href, l) {
    if (!href || !LINKABLE.test(href)) return href;
    l = l || pageLang();
    var hash = '', i = href.indexOf('#'); if (i >= 0) { hash = href.slice(i); href = href.slice(0, i); }
    var q = href.indexOf('?'), path = q >= 0 ? href.slice(0, q) : href, qs = q >= 0 ? href.slice(q + 1) : '';
    var parts = qs ? qs.split('&').filter(function (x) { return x && !/^lang=/.test(x); }) : [];
    parts.push('lang=' + l);
    return (path || '/') + '?' + parts.join('&') + hash;
  }
  function fixLinks(root) {
    var l = pageLang();
    (root || document).querySelectorAll('a[href^="/"]').forEach(function (a) {
      var h = a.getAttribute('href'), n = link(h, l);
      if (n !== h) a.setAttribute('href', n);
    });
  }
  function auto() {
    fixLinks();
    if (!window.MutationObserver) return;
    var busy = false;
    new MutationObserver(function () {
      if (busy) return; busy = true;
      setTimeout(function () { busy = false; fixLinks(); }, 50);
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['lang', 'href'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
  window.QLang = { SUPPORTED: SUPPORTED, match: match, pick: pick, save: save, browser: browser, link: link, fixLinks: fixLinks };
})();
