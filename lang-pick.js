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
  window.QLang = { SUPPORTED: SUPPORTED, match: match, pick: pick, save: save, browser: browser };
})();
