/* Quolino — menu globalne (hamburger) i tłumaczenie stopki na stronach rodzica (JP 2026-10-29).
   Strony: index, country, region, kontakt, współpraca, zaloguj, konto, prywatność, 404. NIE city.html i gra/ (własne menu).
   – Strona ma już szufladę #mobileDrawer (index, country, region) → dopisujemy w niej brakujące pozycje pod „Wybierz region”.
   – Strona bez szuflady (strony pomocnicze, 404) → dokładamy przycisk menu na pasku, szufladę i prosty wybór języka.
   Pozycje: Wybierz region, Jak to działa (/#jak), Co dostajesz (/#dostep), Kontakt, Zaloguj / Moje konto (QAuth), Zmień język.
   Teksty: PT('page.nav.…', 'polski') — skaner ui-translate.mjs czyta je z tego pliku; tłumaczenia z ui_translations (page.nav.*, page.footer.*).
   Strona z page-i18n.js → jego słownik (window.PT); bez niego → jedno zapytanie o page.nav.* i page.footer.* (język, en). Bez ciasteczek. */
(function () {
  'use strict';
  var API = 'https://api.quolino.com/rest/v1';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50d3BqY3VwZmZkb3pzdGJpamhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMzc5MTUsImV4cCI6MjEwMjgxMzkxNX0.OddjLt-gKKmj2H7wrEKJ14CXrsXu0L4UBO2GC9OiCGo';
  var SUPPORTED = (window.QLang && window.QLang.SUPPORTED) || ['pl', 'en', 'de', 'it', 'cs', 'da', 'es', 'fr', 'hr', 'hu', 'nl', 'no', 'pt', 'ro', 'sk', 'sv', 'uk'];
  var PAGE_PT = window.PT && window.PT.ready ? window.PT : null;   // page-i18n.js (strony pomocnicze)
  var DICT = {}, EN = {}, loaded = '';

  function lang() {
    var l = String(document.documentElement.lang || '').toLowerCase().split('-')[0];
    if (SUPPORTED.indexOf(l) < 0) l = window.QLang ? window.QLang.pick() : 'pl';
    return l;
  }
  function PT(key, pl) { return PAGE_PT ? PAGE_PT(key, pl) : (DICT[key] || EN[key] || pl); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // adres z językiem strony: strona główna i pomocnicze same wybierają język z ?lang=
  function withLang(href) {
    var l = lang(); if (!l || /^https?:/.test(href)) return href;
    var hash = '', i = href.indexOf('#'); if (i >= 0) { hash = href.slice(i); href = href.slice(0, i); }
    if (href === location.pathname && hash) return href + location.search + hash;   // ta sama strona: tylko przewinięcie
    return href + (href.indexOf('?') >= 0 ? '&' : '?') + 'lang=' + l + hash;
  }
  function signedIn() { try { return !!(window.QAuth && window.QAuth.current && window.QAuth.current()); } catch (e) { return false; } }

  var ICON = {
    menu: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="18" x2="20" y2="18"></line></svg>',
    close: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line></svg>'
  };
  var LOGO = '<span class="logo-name">quolino</span><span class="logo-dot">.</span><span class="logo-tld">com</span>';

  // pozycje menu (bez „Wybierz region” i języka, które szuflady stron już mają)
  function items() {
    var acc = signedIn();
    return [
      { href: '/#jak', text: PT('page.nav.how', 'Jak to działa') },
      { href: '/#dostep', text: PT('page.nav.access', 'Co dostajesz') },
      { href: '/kontakt.html', text: PT('page.nav.contact', 'Kontakt') },
      acc ? { href: '/konto.html', text: PT('page.nav.account', 'Moje konto'), acc: 1 }
          : { href: '/zaloguj.html', text: PT('page.nav.login', 'Zaloguj się'), acc: 1 }
    ];
  }
  function listHtml() {
    return items().map(function (it) {
      return '<li><a class="qnav-link' + (it.acc ? ' qnav-link--acc' : '') + '" href="' + esc(it.href) + '" data-qnav-href="' + esc(it.href) + '">' + esc(it.text) + '</a></li>';
    }).join('');
  }

  var drawer = null, list = null, own = false, opener = null;
  function open() {
    if (!drawer) return;
    paint();
    drawer.style.display = 'flex';
    var f = drawer.querySelector('a,button'); if (f) try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); }
  }
  function close() {
    if (!drawer) return;
    drawer.style.display = 'none';
    if (opener) try { opener.focus({ preventScroll: true }); } catch (e) { /* stara przeglądarka */ }
  }

  function build() {
    var bar = document.querySelector('.sticky-nav-inner');
    drawer = document.getElementById('mobileDrawer');
    if (!drawer) {
      // strona bez szuflady: przycisk na pasku + szuflada jak na stronie głównej
      own = true;
      if (!bar) return;
      var right = bar.querySelector('.nav-right');
      if (!right) { right = document.createElement('div'); right.className = 'nav-right'; bar.appendChild(right); }
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'nav-mobile qnav-btn';
      btn.setAttribute('aria-haspopup', 'dialog');
      btn.innerHTML = ICON.menu;
      right.appendChild(btn);
      drawer = document.createElement('div');
      drawer.id = 'mobileDrawer'; drawer.className = 'qnav-drawer'; drawer.style.display = 'none';
      drawer.innerHTML = '<div class="qnav-panel" role="dialog" aria-modal="true">' +
        '<div class="qnav-head"><a class="logo" href="/">' + LOGO + '</a><button type="button" class="qnav-x">' + ICON.close + '</button></div>' +
        '<a class="qnav-main" href="/#regiony" data-qnav-href="/#regiony"></a>' +
        '<ul class="qnav-list"></ul>' +
        '<button type="button" class="qnav-langbtn"></button></div>';
      document.body.appendChild(drawer);
      drawer.addEventListener('click', function (e) { if (e.target === drawer) close(); });
      drawer.querySelector('.qnav-x').addEventListener('click', close);
      drawer.querySelector('.qnav-langbtn').addEventListener('click', function () { close(); openLang(); });
      list = drawer.querySelector('.qnav-list');
    } else {
      // szuflada strony (index, country, region): lista pod pierwszym linkiem („Wybierz region”)
      var panel = drawer.firstElementChild;
      var first = panel && panel.querySelector('a[href]');
      list = document.createElement('ul'); list.className = 'qnav-list';
      if (first) first.insertAdjacentElement('afterend', list); else if (panel) panel.appendChild(list);
      if (first && /^\//.test(first.getAttribute('href') || '')) first.setAttribute('data-qnav-href', first.getAttribute('href'));
      var x = panel && panel.querySelector('button[data-ui-aria="nav.close"]');
      if (x) x.addEventListener('click', function () { if (opener) try { opener.focus({ preventScroll: true }); } catch (e) { /* */ } });
    }
    // przycisk menu widoczny na każdej szerokości (na komputerze też nie było drogi do kontaktu)
    document.querySelectorAll('.sticky-nav .nav-mobile').forEach(function (b) {
      b.classList.add('qnav-all');
      if (own) b.addEventListener('click', function () { opener = b; open(); });
      else b.addEventListener('click', function () { opener = b; paint(); });
    });
    list.addEventListener('click', function (e) { if (e.target.closest('a')) drawer.style.display = 'none'; });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (langBox && langBox.classList.contains('open')) { langBox.classList.remove('open'); return; }
      if (drawer && drawer.style.display !== 'none') close();
    });
    paint();
  }

  function paint() {
    if (!list) return;
    list.innerHTML = listHtml();
    if (own) {
      var main = drawer.querySelector('.qnav-main');
      main.textContent = PT('page.nav.regions', 'Wybierz region');
      drawer.querySelector('.qnav-langbtn').textContent = PT('page.nav.lang', 'Zmień język');
      drawer.querySelector('.qnav-x').setAttribute('aria-label', PT('page.nav.close', 'Zamknij'));
      drawer.querySelector('.qnav-panel').setAttribute('aria-label', PT('page.nav.menu', 'Menu'));
      document.querySelectorAll('.qnav-btn').forEach(function (b) { b.setAttribute('aria-label', PT('page.nav.menu', 'Menu')); });
    }
    // adresy z językiem strony (strona główna / kontakt pokażą ten sam język)
    drawer.querySelectorAll('a[data-qnav-href]').forEach(function (a) { a.href = withLang(a.getAttribute('data-qnav-href')); });
  }

  // ── wybór języka na stronach bez własnego okna (strony pomocnicze, 404) ──
  var langBox = null;
  function langName(l) {
    var n = '';
    try { n = new Intl.DisplayNames([l], { type: 'language' }).of(l); } catch (e) { /* */ }
    n = n && n !== l ? n : l.toUpperCase();
    return n.charAt(0).toUpperCase() + n.slice(1);
  }
  function openLang() {
    var page = document.getElementById('langPopup');
    if (page) { page.classList.add('open'); return; }
    if (!langBox) {
      langBox = document.createElement('div');
      langBox.className = 'lang-overlay';
      langBox.innerHTML = '<div class="lang-popup" role="dialog" aria-modal="true"><div class="qnav-head"><div class="qnav-langtitle"></div>' +
        '<button type="button" class="qnav-x">' + ICON.close + '</button></div><div class="lang-grid"></div></div>';
      document.body.appendChild(langBox);
      langBox.addEventListener('click', function (e) { if (e.target === langBox) langBox.classList.remove('open'); });
      langBox.querySelector('.qnav-x').addEventListener('click', function () { langBox.classList.remove('open'); });
      langBox.querySelector('.lang-grid').addEventListener('click', function (e) {
        var b = e.target.closest('button[data-l]'); if (!b) return;
        var l = b.getAttribute('data-l');
        if (window.QLang) window.QLang.save(l);
        try { var u = new URL(location.href); u.searchParams.set('lang', l); location.href = u.pathname + u.search + u.hash; } catch (err) { location.reload(); }
      });
    }
    var cur = lang();
    langBox.querySelector('.qnav-langtitle').textContent = PT('page.nav.lang_title', 'Wybierz język');
    langBox.querySelector('.qnav-x').setAttribute('aria-label', PT('page.nav.close', 'Zamknij'));
    langBox.querySelector('.lang-grid').innerHTML = SUPPORTED.map(function (l) {
      return '<button type="button" data-l="' + l + '" lang="' + l + '"' + (l === cur ? ' class="active" aria-current="true"' : '') + '>' + esc(langName(l)) + '</button>';
    }).join('');
    langBox.classList.add('open');
    var a = langBox.querySelector('button.active') || langBox.querySelector('button[data-l]'); if (a) a.focus();
  }

  // ── tłumaczenia (strony bez page-i18n.js: index, country, region) ──
  function applyFooter() {
    if (PAGE_PT) return;   // page-i18n.js sam tłumaczy [data-t]
    document.querySelectorAll('.footer [data-t], .footer [data-t-aria]').forEach(function (el) {
      var k = el.getAttribute('data-t'), ka = el.getAttribute('data-t-aria');
      if (k) { if (el.dataset.pl == null) el.dataset.pl = el.textContent; el.textContent = DICT[k] || EN[k] || el.dataset.pl; }
      if (ka) { if (el.dataset.plAria == null) el.dataset.plAria = el.getAttribute('aria-label') || ''; el.setAttribute('aria-label', DICT[ka] || EN[ka] || el.dataset.plAria); }
    });
  }
  function load() {
    if (PAGE_PT) { PAGE_PT.ready.then(paint); return; }
    var l = lang();
    if (l === loaded) return;
    loaded = l;
    if (l === 'pl') { DICT = {}; EN = {}; paint(); applyFooter(); return; }
    fetch(API + '/ui_translations?select=key,lang,value&or=(key.like.page.nav.*,key.like.page.footer.*)&lang=in.(' + l + ',en)',
      { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; })
      .then(function (rows) {
        if (l !== loaded) return;   // w międzyczasie zmieniono język
        DICT = {}; EN = {};
        (rows || []).forEach(function (r) { (r.lang === l ? DICT : EN)[r.key] = r.value; });
        paint(); applyFooter();
      });
  }

  function init() {
    build();
    load();
    // strona główna / kraj / region zmieniają język bez przeładowania (ustawiają <html lang>)
    if (!PAGE_PT && window.MutationObserver) new MutationObserver(load).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    document.addEventListener('qauth', paint);
    // linki stopki z językiem strony
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('.footer a[href^="/"]');
      if (a) a.href = withLang(a.getAttribute('href').replace(/[?&]lang=[a-z]{2}/, ''));
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
