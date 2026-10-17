/* Quolino — statystyki (Umami, własny serwer, bez ciasteczek, bez identyfikatorów osób). Plan: docs/STATYSTYKI.md.
   – Skrypt Umami ładowany z NASZEJ domeny (/m.js → Traefik → Umami); zbieranie na /api/send tej samej domeny.
   – Zdarzenia z §4 planu: tylko miasto / numer / język / akcja, nigdy dane o osobie.
   – Wyłącznik (JP, testerzy): localStorage quolino_nostats = '1'. Włączenie: ?nostats=1, wyłączenie: ?nostats=0 w adresie.
   – Nic nie jest wysyłane z podglądów szkiców (?draft=), z hostów innych niż quolino.com ani przy włączonym „Do Not Track”.
   – Dopóki WEBSITE_ID jest pusty albo Umami nie odpowiada, strona działa jak dotąd (zero błędów, zero żądań).
   Użycie z innych skryptów: window.QStats && QStats.track('nazwa', { … }). Elementy: data-stat="pelna-wycieczka" data-stat-where="…". */
(function () {
  'use strict';
  var WEBSITE_ID = '8cf93dc3-4c4e-4218-a485-43a0c3d64c41';   // witryna „Quolino” w Umami (wiersz dodaje ops/umami-init.sh)
  var qs = new URLSearchParams(location.search);
  var off = false;
  try {
    if (qs.has('nostats')) { if (qs.get('nostats') === '0') localStorage.removeItem('quolino_nostats'); else localStorage.setItem('quolino_nostats', '1'); }
    off = localStorage.getItem('quolino_nostats') === '1';
  } catch (e) { off = qs.get('nostats') !== null && qs.get('nostats') !== '0'; }
  var prodHost = /(^|\.)quolino\.com$/.test(location.hostname);
  var enabled = !!WEBSITE_ID && !off && prodHost && !qs.has('draft');
  var q = [], loaded = false;
  var lang = function () { var S = window.QSSR; return String(window.currentLang || (S && S.lang) || document.documentElement.lang || 'pl').slice(0, 5); };

  function flush() {
    if (!window.umami || typeof window.umami.track !== 'function') return false;
    while (q.length) { var e = q.shift(); try { window.umami.track(e[0], e[1]); } catch (x) { /* statystyki nie mogą psuć strony */ } }
    return true;
  }
  function track(name, data) {
    if (!enabled) return;
    q.push([name, data || {}]);
    if (q.length > 50) q.shift();
    flush();
  }
  window.QStats = { track: track, enabled: enabled };
  if (!enabled) return;

  // skrypt Umami: z naszej domeny, bez hasha w adresie (pager używa #pN), z szacunkiem dla „Do Not Track”
  var s = document.createElement('script');
  s.src = '/m.js'; s.defer = true;
  s.setAttribute('data-website-id', WEBSITE_ID);
  s.setAttribute('data-exclude-hash', 'true');
  s.setAttribute('data-do-not-track', 'true');
  s.setAttribute('data-domains', location.hostname);
  s.setAttribute('data-tag', lang());                               // język strony (wybrany w Quolino), osobno od języka przeglądarki
  s.onload = function () { loaded = true; flush(); };
  s.onerror = function () { enabled = false; q.length = 0; };
  document.head.appendChild(s);
  var tries = 0, iv = setInterval(function () { if (flush() || ++tries > 40) clearInterval(iv); }, 250);

  // ── kontekst strony ────────────────────────────────────────────────────────────────────
  var city = function () { var S = window.QSSR; return (S && (S.uslug || S.slug)) || qs.get('c') || ''; };
  var kid = function () { var c = document.getElementById('city'); return c && c.dataset.view === 'kid'; };
  var view = function () { return kid() ? 'dziecko' : 'rodzic'; };
  var stopNum = function (el) { var st = el && el.closest && el.closest('.qc-stop'); return st ? +st.dataset.stopNum || null : null; };
  var onCity = function () { return !!document.getElementById('city'); };
  var lastTouch = 0;
  ['pointerdown', 'keydown'].forEach(function (t) { document.addEventListener(t, function () { lastTouch = Date.now(); }, true); });
  var recent = function (ms) { return Date.now() - lastTouch < (ms || 1500); };
  var once = {};
  function oncePer(key, fn) { if (once[key]) return; once[key] = 1; fn(); }

  // ── kliknięcia (delegacja) ───────────────────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    var t = e.target; if (!t || !t.closest) return;
    var el;
    if ((el = t.closest('[data-stat="pelna-wycieczka"]'))) track('pelna-wycieczka', { miasto: city(), miejsce: el.getAttribute('data-stat-where') || 'strona' });
    if (!onCity()) {
      // atlas, strona regionu, strona kraju: wybór celu
      if ((el = t.closest('a[href]'))) {
        var h = el.getAttribute('href') || '', m;
        if ((m = h.match(/region\.html\?r=([^&#]+)/))) track('atlas-region', { slug: decodeURIComponent(m[1]) });
        else if ((m = h.match(/^\/[a-z]{2}(?:-[a-z]{2})?\/[a-z]{2}\/[a-z0-9-]+\/([a-z0-9-]+)\/?$/)) || (m = h.match(/city\.html\?c=([^&#]+)/))) track('region-miasto', { slug: decodeURIComponent(m[1]) });
      }
      return;
    }
    if ((el = t.closest('.qc-tab'))) {
      var hh = (el.getAttribute('href') || '').replace(/^#/, '');
      track('zakladka', { nazwa: /^https?:/.test(hh) ? 'wesprzyj' : (hh || 'trasa') });
    }
    if ((el = t.closest('.qc-strip__stk'))) track('naklejka-klik', { miasto: city(), nr: +el.dataset.stripNum || null });
    if ((el = t.closest('a[href*="google.com/maps"], a[href*="maps.google.com"]'))) {
      var nr = stopNum(el);
      if (nr) track('nawiguj-przystanek', { miasto: city(), nr: nr });
      else track('nawiguj-start', { miasto: city() });
    }
    if (t.closest('#qcKidToggle') && !kid()) track('qr-dziecko', { miasto: city() });   // klik przed przełączeniem: wchodzimy w widok dziecka
  }, true);

  // ── język (tylko po kliknięciu w okno wyboru języka, nie przy samym ładowaniu strony) ─────
  var lastLang = lang(), langClick = 0;
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('#langGrid')) langClick = Date.now(); }, true);
  new MutationObserver(function () {
    var now = lang();
    if (now !== lastLang) { if (Date.now() - langClick < 4000) track('jezyk', { z: lastLang, na: now }); lastLang = now; }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  // strony bez wycieczki (index, region, kraj): tylko zdarzenia z kliknięć powyżej; piny atlasu nie są linkami — atlas.js woła QStats.track sam
  if (!onCity()) return;

  // ── strona wycieczki ────────────────────────────────────────────────────────────────
  // widok dziecka z QR: wejście z ?view=kid
  if (qs.get('view') === 'kid') track('qr-dziecko', { miasto: city() });

  // przystanek otwarty — tylko po geście użytkownika (domyślnie otwarte przystanki nie liczą się)
  document.addEventListener('toggle', function (e) {
    var d = e.target;
    if (!d || !d.matches || !d.matches('details.qc-stop') || !d.open || !recent(2000)) return;
    var nr = +d.dataset.stopNum || null;
    oncePer('open' + nr, function () { track('przystanek-otwarty', { miasto: city(), nr: nr, widok: view() }); });
  }, true);

  // misje i naklejki
  document.addEventListener('change', function (e) {
    var b = e.target;
    if (b && b.matches && b.matches('[data-qc-task]') && b.checked) track('misja', { miasto: city(), nr: stopNum(b), widok: view() });
  }, true);
  var moInit = false;
  new MutationObserver(function (list) {
    list.forEach(function (m) {
      var el = m.target;
      if (!el.classList || !el.classList.contains('qc-stop') || !el.classList.contains('just-collected')) return;
      if ((m.oldValue || '').split(' ').indexOf('just-collected') > -1) return;
      track('naklejka-wklejona', { miasto: city(), nr: +el.dataset.stopNum || null });
    });
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'], attributeOldValue: true, subtree: true });

  // czas czytania: liczymy tylko, gdy karta jest widoczna i aktywna
  var secs = 0, marks = [[30, 'czytanie-30s'], [120, 'czytanie-2m'], [300, 'czytanie-5m']];
  setInterval(function () {
    if (document.visibilityState !== 'visible' || (document.hasFocus && !document.hasFocus()) || !document.querySelector('.qc-stop')) return;
    secs++;
    marks.forEach(function (m) { if (secs === m[0]) track(m[1], { miasto: city(), jezyk: lang() }); });
  }, 1000);

  // głębokość: ostatni widoczny przystanek (1, 3, 5, ostatni)
  var tick = 0;
  function depth() {
    tick = 0;
    var stops = [].slice.call(document.querySelectorAll('#trasa .qc-stop'));
    if (!stops.length) return;
    var reached = 0, vh = window.innerHeight || 800;
    stops.forEach(function (s, i) { if (s.offsetParent !== null && s.getBoundingClientRect().top < vh * 0.85) reached = Math.max(reached, i + 1); });
    var cur = document.querySelector('.qc-stop--current');            // widok mobilny „jeden przystanek na ekran”
    if (cur) reached = Math.max(reached, stops.indexOf(cur) + 1);
    [[1, '1'], [3, '3'], [5, '5']].forEach(function (m) { if (reached >= m[0] && m[0] <= stops.length) oncePer('g' + m[1], function () { track('glebokosc', { miasto: city(), przystanek: m[1] }); }); });
    if (reached >= stops.length) oncePer('gostatni', function () { track('glebokosc', { miasto: city(), przystanek: 'ostatni' }); });
  }
  window.addEventListener('scroll', function () { if (!tick) tick = setTimeout(depth, 500); }, { passive: true });
})();
