/* Quolino — tłumaczenia stron pomocniczych (kontakt, współpraca, logowanie, konto, prywatność). JP 2026-10-25.
   Tekst polski stoi w HTML (fallback i źródło), tłumaczenia w bazie: public.ui_translations (klucze page.*),
   uzupełnia je serwer (ui-translate.mjs, Gemini). Język: ?lang= albo wybór z innych stron (localStorage quolino_lang).
   Oznaczenia w HTML:  data-t="klucz" (tekst) · data-t-ph="klucz" (placeholder) · data-t-aria="klucz" (aria-label)
                       data-t-html="klucz" (tekst z <code>/<strong>/<b>/<em>/<br>, np. polityka prywatności)
   W skryptach:        PT('klucz', 'tekst polski')  · PT.ready (Promise) · zdarzenie „pt:ready”.
   Brak tłumaczenia w danym języku → angielski → polski. Bez bibliotek, bez ciasteczek. */
(function () {
  'use strict';
  var API = 'https://api.quolino.com/rest/v1';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50d3BqY3VwZmZkb3pzdGJpamhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMzc5MTUsImV4cCI6MjEwMjgxMzkxNX0.OddjLt-gKKmj2H7wrEKJ14CXrsXu0L4UBO2GC9OiCGo';
  function pick() {
    var q = new URLSearchParams(location.search).get('lang'), p = null;
    try { p = localStorage.getItem('quolino_lang'); } catch (e) { /* prywatne okno */ }
    return String(q || p || 'pl').toLowerCase().replace(/[^a-z-]/g, '').slice(0, 8) || 'pl';
  }
  var LANG = pick(), DICT = {}, EN = {};
  function PT(key, pl) { return DICT[key] || EN[key] || pl || key; }
  function safe(h) {
    return String(h).replace(/&(?!(?:amp|lt|gt|quot|#39|nbsp);)/g, '&amp;').replace(/<(?!\/?(code|strong|b|em|br)\s*\/?>)/gi, '&lt;');
  }
  function apply(root) {
    if (LANG === 'pl') return;
    (root || document).querySelectorAll('[data-t]').forEach(function (el) { var v = DICT[el.getAttribute('data-t')] || EN[el.getAttribute('data-t')]; if (v) el.textContent = v; });
    (root || document).querySelectorAll('[data-t-ph]').forEach(function (el) { var v = DICT[el.getAttribute('data-t-ph')] || EN[el.getAttribute('data-t-ph')]; if (v) el.setAttribute('placeholder', v); });
    (root || document).querySelectorAll('[data-t-aria]').forEach(function (el) { var v = DICT[el.getAttribute('data-t-aria')] || EN[el.getAttribute('data-t-aria')]; if (v) el.setAttribute('aria-label', v); });
    // dłuższe teksty z prostym formatowaniem (polityka prywatności): dozwolone tylko <code>, <strong>, <b>, <em>, <br>
    (root || document).querySelectorAll('[data-t-html]').forEach(function (el) { var v = DICT[el.getAttribute('data-t-html')] || EN[el.getAttribute('data-t-html')]; if (v) el.innerHTML = safe(v); });
    var t = document.querySelector('meta[name="pt-title"]'); if (t && DICT[t.content]) document.title = DICT[t.content] + ' — Quolino';
  }
  document.documentElement.lang = LANG;
  PT.lang = LANG;
  PT.apply = apply;
  PT.ready = LANG === 'pl' ? Promise.resolve() : fetch(API + '/ui_translations?select=key,lang,value&key=like.page.*&lang=in.(' + LANG + ',en)',
    { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (rows) { (rows || []).forEach(function (r) { (r.lang === LANG ? DICT : EN)[r.key] = r.value; }); })
    .catch(function () { /* bez sieci: zostaje polski */ })
    .then(function () {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { apply(); });
      else apply();
      try { document.dispatchEvent(new CustomEvent('pt:ready')); } catch (e) { /* stare przeglądarki */ }
    });
  window.PT = PT;
})();
