/* =====================================================================
   QUOLINO — trip-ui.js (strona miasta, city.html)
   1. Zakładki Trasa | Punkty awaryjne | QR — jeden panel naraz, adres #trasa/#awaryjne/#qr,
      „wstecz” w przeglądarce wraca do poprzedniej zakładki/przystanku.
   2. „Cała trasa” — pierwszy ekran zakładki Trasa: mapa OpenStreetMap (kafelki, bez biblioteki),
      lista przystanków z porami z planu dnia, link do Map Google (tryb pieszy).
      Bez minut i kilometrów (CLAUDE.md §3.2).
   3. Telefon (≤767 px): jeden przystanek na ekran, pasek „← Poprzedni · 3 / 8 · Następny →”,
      przesunięcie palcem, adres #pN, ostatni przystanek w localStorage (qc.pager.<slug>).
      Widok dziecka: po wklejeniu naklejki duży przycisk „Idziemy dalej →” (bez auto-przeskoku).
   4. Komputer: klik naklejki / pozycji listy rozwija przystanek i przewija do niego.
   Wywołanie: QTrip.init({...}) po każdym render() w city.html. Zero zależności.
   ===================================================================== */
(function () {
  'use strict';

  var MQ = window.matchMedia ? window.matchMedia('(max-width: 767px)') : null;
  var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var TABS = ['trasa', 'awaryjne', 'qr'];

  // ── teksty: Supabase/i18n-ui (przez ui() z city.html) > ten słownik [język] > en > pl ──
  var K = ['tab.route', 'btn.prev_stop', 'btn.next_stop', 'btn.go_next', 'btn.whole_route', 'label.whole_route',
           'btn.open_gmaps', 'btn.start_route', 'btn.resume_stop', 'label.start', 'label.finish', 'label.stop_of',
           'label.map', 'label.collected'];
  var RAW = {
    pl: 'Trasa|Poprzedni|Następny|Idziemy dalej|Cała trasa|Cała trasa|Otwórz trasę w Mapach Google|Zaczynamy|Wróć do przystanku {n}|Start|Meta|Przystanek {n} z {t}|Mapa trasy|zdobyte',
    en: 'Route|Previous|Next|Let\'s go on|Whole route|Whole route|Open the route in Google Maps|Let\'s start|Back to stop {n}|Start|Finish|Stop {n} of {t}|Route map|collected',
    de: 'Route|Zurück|Weiter|Weiter geht\'s|Ganze Route|Ganze Route|Route in Google Maps öffnen|Los geht\'s|Zurück zu Stopp {n}|Start|Ziel|Stopp {n} von {t}|Routenkarte|gesammelt',
    it: 'Percorso|Precedente|Successiva|Andiamo avanti|Tutto il percorso|Tutto il percorso|Apri il percorso in Google Maps|Si parte|Torna alla tappa {n}|Partenza|Arrivo|Tappa {n} di {t}|Mappa del percorso|conquistata',
    cs: 'Trasa|Předchozí|Další|Jdeme dál|Celá trasa|Celá trasa|Otevřít trasu v Mapách Google|Jdeme na to|Zpět na zastávku {n}|Start|Cíl|Zastávka {n} z {t}|Mapa trasy|získáno',
    da: 'Rute|Forrige|Næste|Videre|Hele ruten|Hele ruten|Åbn ruten i Google Maps|Lad os starte|Tilbage til stop {n}|Start|Mål|Stop {n} af {t}|Rutekort|samlet',
    es: 'Ruta|Anterior|Siguiente|¡Seguimos!|Toda la ruta|Toda la ruta|Abrir la ruta en Google Maps|¡Empezamos!|Volver a la parada {n}|Salida|Llegada|Parada {n} de {t}|Mapa de la ruta|conseguida',
    fr: 'Parcours|Précédent|Suivant|On continue|Tout le parcours|Tout le parcours|Ouvrir le parcours dans Google Maps|C\'est parti|Revenir à l\'étape {n}|Départ|Arrivée|Étape {n} sur {t}|Carte du parcours|gagnée',
    hr: 'Ruta|Prethodno|Sljedeće|Idemo dalje|Cijela ruta|Cijela ruta|Otvori rutu u Google kartama|Krećemo|Natrag na stajalište {n}|Start|Cilj|Stajalište {n} od {t}|Karta rute|osvojeno',
    hu: 'Útvonal|Előző|Következő|Menjünk tovább|Teljes útvonal|Teljes útvonal|Útvonal megnyitása a Google Térképben|Indulás|Vissza a(z) {n}. megállóhoz|Start|Cél|{n}. megálló / {t}|Útvonaltérkép|megszerezve',
    nl: 'Route|Vorige|Volgende|We gaan verder|Hele route|Hele route|Route openen in Google Maps|We beginnen|Terug naar stop {n}|Start|Finish|Stop {n} van {t}|Routekaart|verzameld',
    no: 'Rute|Forrige|Neste|Videre|Hele ruten|Hele ruten|Åpne ruten i Google Maps|Vi starter|Tilbake til stopp {n}|Start|Mål|Stopp {n} av {t}|Rutekart|samlet',
    pt: 'Percurso|Anterior|Seguinte|Vamos em frente|Percurso completo|Percurso completo|Abrir o percurso no Google Maps|Vamos começar|Voltar à paragem {n}|Partida|Chegada|Paragem {n} de {t}|Mapa do percurso|conquistada',
    ro: 'Traseu|Înapoi|Următoarea|Mergem mai departe|Tot traseul|Tot traseul|Deschide traseul în Google Maps|Pornim|Înapoi la oprirea {n}|Start|Final|Oprirea {n} din {t}|Harta traseului|câștigată',
    sk: 'Trasa|Predchádzajúca|Ďalšia|Ideme ďalej|Celá trasa|Celá trasa|Otvoriť trasu v Mapách Google|Ideme na to|Späť na zastávku {n}|Štart|Cieľ|Zastávka {n} z {t}|Mapa trasy|získané',
    sv: 'Rutt|Föregående|Nästa|Vi går vidare|Hela rutten|Hela rutten|Öppna rutten i Google Maps|Nu kör vi|Tillbaka till stopp {n}|Start|Mål|Stopp {n} av {t}|Ruttkarta|samlad',
    uk: 'Маршрут|Попередня|Наступна|Ідемо далі|Увесь маршрут|Увесь маршрут|Відкрити маршрут у Google Картах|Починаємо|Назад до зупинки {n}|Старт|Фініш|Зупинка {n} з {t}|Карта маршруту|здобуто'
  };
  var DICT = {};
  Object.keys(RAW).forEach(function (l) {
    var v = RAW[l].split('|'), d = {};
    K.forEach(function (k, i) { d[k] = v[i]; });
    DICT[l] = d;
  });

  var S = { opts: null, root: null, cur: null, bound: false, mapW: 0, bar: null, live: null };

  function t(key, fb, vars) {
    var MISS = '\u0000', v = MISS;
    if (S.opts && S.opts.ui) v = S.opts.ui(key, MISS);
    if (!v || v === MISS || v === key) {
      var l = S.opts && S.opts.lang;
      v = (DICT[l] && DICT[l][key]) || (DICT.en && DICT.en[key]) || (DICT.pl && DICT.pl[key]) || fb || key;
    }
    if (vars) Object.keys(vars).forEach(function (k) { v = v.replace('{' + k + '}', vars[k]); });
    return v;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function isMobile() { return !!(MQ && MQ.matches); }
  function isKid() { return S.root && S.root.dataset.view === 'kid'; }
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, String(v)); } catch (e) {} }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function keyPager() { return 'qc.pager.' + (S.opts.slug || 'x'); }

  // ── przystanki widoczne w trasie (dziecko: bez wyłączonych przez rodzica) ──
  function stopEls() {
    return $$('#trasa > .qc-stop').filter(function (el) {
      if (!isKid()) return true;
      return !el.classList.contains('qc-stop--disabled') && el.style.display !== 'none';
    });
  }
  function stopEl(n) { return $('#trasa > .qc-stop[data-stop-num="' + n + '"]'); }

  // ── wysokość przyklejonych pasków (menu + zakładki) ──
  function topOffset() {
    var h = 0, nav = $('.sticky-nav'), tabs = $('.qc-tabs');
    if (nav) h += nav.offsetHeight;
    if (tabs && getComputedStyle(tabs).display !== 'none') h += tabs.offsetHeight;
    return h + 8;
  }
  function scrollToEl(el) {
    if (!el) return;
    var y = el.getBoundingClientRect().top + window.pageYOffset - topOffset();
    window.scrollTo({ top: Math.max(0, y), behavior: REDUCED ? 'auto' : 'smooth' });
  }

  // ══════════ ZAKŁADKI ══════════
  function setTab(name) {
    if (TABS.indexOf(name) < 0) name = 'trasa';
    if (isKid()) name = 'trasa';
    S.root.dataset.tab = name;
    $$('.qc-tab[data-tab]').forEach(function (a) {
      var on = a.getAttribute('data-tab') === name;
      a.setAttribute('aria-selected', on ? 'true' : 'false');
      a.setAttribute('tabindex', on ? '0' : '-1');
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
  }

  // ══════════ ADRES (#trasa · #pN · #awaryjne · #qr) ══════════
  function parse(hash) {
    var h = (hash || '').replace(/^#/, '');
    var m = /^p(\d+)$/.exec(h);
    if (m) return { tab: 'trasa', stop: m[1] };
    if (h === 'awaryjne' || h === 'qr') return { tab: h, stop: null };
    return { tab: 'trasa', stop: null };
  }
  function go(hash, how) {
    var url = location.pathname + location.search + hash;
    if (how === 'replace') history.replaceState(null, '', url);
    else if (location.hash !== hash) history.pushState(null, '', url);
    apply(parse(hash), how || 'nav');
  }

  function apply(st, how) {
    setTab(st.tab);
    if (st.tab !== 'trasa') {
      showOverviewMode();
      if (how !== 'init') scrollToEl($('.qc-tabs'));
      return;
    }
    var el = st.stop ? stopEl(st.stop) : null;
    if (el && isKid() && stopEls().indexOf(el) < 0) el = null;   // ukryty przez rodzica
    if (isMobile()) {
      if (el) showStop(el, how);
      else { showOverviewMode(); drawMap(); if (how !== 'init') scrollToEl($('#trasa')); }
    } else {
      showOverviewMode();
      drawMap();
      if (el) {
        el.open = true;
        if (how !== 'init' || st.stop) setTimeout(function () { scrollToEl(el); }, 30);
      } else if (how !== 'init') scrollToEl($('#trasa'));
    }
  }

  // ══════════ PAGER (telefon) ══════════
  function showOverviewMode() {
    S.cur = null;
    S.root.classList.remove('qc-paged');
    $$('#trasa > .qc-stop.is-current').forEach(function (el) { el.classList.remove('is-current'); });
    if (S.bar) S.bar.hidden = true;
    document.body.classList.remove('qc-has-pager');
    refreshResume();
  }

  function showStop(el, how) {
    var list = stopEls(), i = list.indexOf(el);
    if (i < 0) return showOverviewMode();
    S.cur = el.getAttribute('data-stop-num');
    S.root.classList.add('qc-paged');
    $$('#trasa > .qc-stop.is-current').forEach(function (x) { if (x !== el) x.classList.remove('is-current'); });
    el.classList.add('is-current');
    el.open = true;
    store(keyPager(), S.cur);
    updateBar(list, i);
    document.body.classList.add('qc-has-pager');
    if (how !== 'init' || location.hash) {
      scrollToEl($('#trasa'));
      var name = $('.qc-stop__name', el);
      if (name) { name.setAttribute('tabindex', '-1'); try { name.focus({ preventScroll: true }); } catch (e) {} }
    }
    if (S.live) S.live.textContent = t('label.stop_of', 'Przystanek {n} z {t}', { n: i + 1, t: list.length }) +
      (el.querySelector('.qc-stop__name') ? ': ' + el.querySelector('.qc-stop__name').textContent : '');
  }

  function step(dir) {
    var list = stopEls();
    var i = list.indexOf(stopEl(S.cur));
    var j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    go('#p' + list[j].getAttribute('data-stop-num'));
  }

  function buildBar() {
    if (S.bar && S.bar.parentNode) S.bar.parentNode.removeChild(S.bar);   // nowy język = nowe napisy
    var bar = document.createElement('nav');
    bar.className = 'qc-pager';
    bar.hidden = true;
    bar.setAttribute('aria-label', t('tab.route', 'Trasa'));
    bar.innerHTML =
      '<button type="button" class="qc-pager__btn qc-pager__btn--prev" data-pg="prev" aria-label="' + esc(t('btn.prev_stop', 'Poprzedni')) + '"><span aria-hidden="true">←</span> <span class="qc-pager__lbl" aria-hidden="true">' + esc(t('btn.prev_stop', 'Poprzedni')) + '</span></button>' +
      '<div class="qc-pager__mid"><span class="qc-pager__count" aria-hidden="true"></span>' +
      '<button type="button" class="qc-pager__all" data-pg="all">' + esc(t('btn.whole_route', 'Cała trasa')) + '</button></div>' +
      '<button type="button" class="qc-pager__btn qc-pager__btn--next" data-pg="next"><span>' + esc(t('btn.next_stop', 'Następny')) + '</span> <span aria-hidden="true">→</span></button>';
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pg]');
      if (!b || b.disabled) return;
      var a = b.getAttribute('data-pg');
      if (a === 'prev') step(-1);
      else if (a === 'next') step(1);
      else go('#trasa');
    });
    document.body.appendChild(bar);
    S.bar = bar;
    if (!S.live || !document.body.contains(S.live)) {
      S.live = document.createElement('div');
      S.live.className = 'qc-sr';
      S.live.setAttribute('aria-live', 'polite');
      document.body.appendChild(S.live);
    }
  }

  function updateBar(list, i) {
    if (!S.bar) return;
    S.bar.hidden = false;
    $('.qc-pager__count', S.bar).textContent = (i + 1) + ' / ' + list.length;
    $('[data-pg="prev"]', S.bar).disabled = i <= 0;
    $('[data-pg="next"]', S.bar).disabled = i >= list.length - 1;
  }

  // przycisk „Idziemy dalej →” (widok dziecka, po wklejeniu naklejki)
  function addGoNext() {
    var list = $$('#trasa > .qc-stop');
    list.forEach(function (el, i) {
      var body = $('.qc-stop__body', el);
      if (!body || $('.qc-go-next', body)) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'qc-btn qc-btn--primary qc-go-next';
      b.innerHTML = esc(t('btn.go_next', 'Idziemy dalej')) + ' <span aria-hidden="true">→</span>';
      b.addEventListener('click', function () {
        var vis = stopEls(), k = vis.indexOf(el);
        if (k > -1 && k < vis.length - 1) step(1); else go('#trasa');
      });
      body.appendChild(b);
    });
    // ostatni widoczny przystanek: „Cała trasa” zamiast „Idziemy dalej”
    var vis = stopEls();
    $$('.qc-go-next').forEach(function (b) {
      var el = b.closest('.qc-stop');
      var last = vis.indexOf(el) === vis.length - 1;
      b.innerHTML = last ? esc(t('btn.whole_route', 'Cała trasa')) : esc(t('btn.go_next', 'Idziemy dalej')) + ' <span aria-hidden="true">→</span>';
    });
  }

  // przesunięcie palcem (tylko w trybie jednego przystanku)
  function bindSwipe() {
    var trasa = $('#trasa');
    if (!trasa || trasa.__qSwipe) return;
    trasa.__qSwipe = true;
    var x0 = null, y0 = 0, t0 = 0;
    trasa.addEventListener('touchstart', function (e) {
      if (!S.root.classList.contains('qc-paged') || e.touches.length !== 1) { x0 = null; return; }
      if (e.target.closest('input,textarea,select,label,.qc-map,.qc-stop-toggle,.qc-links')) { x0 = null; return; }
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
    }, { passive: true });
    trasa.addEventListener('touchend', function (e) {
      if (x0 == null) return;
      var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Date.now() - t0 > 800) return;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      step(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  // w trybie jednego przystanku nagłówek nie zwija przystanku
  function bindSummaries() {
    $$('#trasa > .qc-stop > summary').forEach(function (s) {
      if (s.__qSum) return;
      s.__qSum = true;
      s.addEventListener('click', function (e) {
        if (S.root.classList.contains('qc-paged') && !e.target.closest('a,button,label,input')) e.preventDefault();
      });
    });
  }

  // ══════════ CAŁA TRASA ══════════
  function points() {
    return (S.opts.stops || []).map(function (s) {
      return s;
    });
  }

  function gmapsUrl() {
    var c = S.opts.city || {};
    if (c.route_url) return c.route_url;
    var pts = points().map(function (s) {
      if (s.lat != null && s.lon != null) return s.lat + ',' + s.lon;
      return s.query || '';
    }).filter(Boolean);
    if (pts.length < 2) return pts.length ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(pts[0]) : '';
    var origin = pts[0], dest = pts[pts.length - 1], way = pts.slice(1, -1).slice(0, 9);
    return 'https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=' + encodeURIComponent(origin) +
      '&destination=' + encodeURIComponent(dest) + (way.length ? '&waypoints=' + encodeURIComponent(way.join('|')) : '');
  }

  function renderOverview() {
    var box = $('#qcOverview');
    if (!box) return;
    var pts = points();
    var withGeo = pts.filter(function (s) { return isFinite(s.lat) && isFinite(s.lon) && s.lat !== null && s.lon !== null; });
    var html = '<h2 class="qc-section__title">' + esc(t('label.whole_route', 'Cała trasa')) + '</h2>';
    if (withGeo.length >= 2) {
      html += '<div class="qc-map" role="img" aria-label="' + esc(t('label.map', 'Mapa trasy')) + '"><div class="qc-map__tiles"></div>' +
              '<svg class="qc-map__line" aria-hidden="true"></svg><div class="qc-map__pins"></div>' +
              '<a class="qc-map__attr" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a></div>';
    }
    html += '<ol class="qc-ov__list">';
    pts.forEach(function (s, i) {
      var tag = i === 0 && s.cat === 'parking' ? t('label.start', 'Start') : (s.dinner ? t('label.finish', 'Meta') : '');
      html += '<li><a class="qc-ov__item" href="#p' + esc(s.num) + '" data-go="' + esc(s.num) + '">' +
              '<span class="qc-ov__no">' + pad(s.num) + '</span>' +
              '<span class="qc-ov__txt"><span class="qc-ov__time">' + esc(s.time || '') + '</span>' +
              '<span class="qc-ov__name">' + esc(s.name || '') + '</span>' +
              (tag ? '<span class="qc-ov__tag' + (s.dinner ? ' is-finish' : '') + '">' + esc(tag) + '</span>' : '') + '</span>' +
              '<span class="qc-ov__check" aria-hidden="true">✓</span></a></li>';
    });
    html += '</ol>';
    var gm = gmapsUrl();
    html += '<div class="qc-ov__actions">';
    html += '<button type="button" class="qc-btn qc-btn--primary qc-ov__start" data-ov="start">' + esc(t('btn.start_route', 'Zaczynamy')) + ' <span aria-hidden="true">→</span></button>';
    if (gm) html += '<a class="qc-btn qc-ov__gmaps" href="' + esc(gm) + '" target="_blank" rel="noopener">' + esc(t('btn.open_gmaps', 'Otwórz trasę w Mapach Google')) + '</a>';
    html += '</div>';
    box.innerHTML = html;
    S.mapW = 0;

    box.addEventListener('click', function (e) {
      var a = e.target.closest('[data-go]');
      if (a) { e.preventDefault(); go('#p' + a.getAttribute('data-go')); return; }
      var b = e.target.closest('[data-ov="start"]');
      if (b) {
        var vis = stopEls();
        if (!vis.length) return;
        var saved = read(keyPager());
        var target = saved && stopEl(saved) && vis.indexOf(stopEl(saved)) > -1 ? saved : vis[0].getAttribute('data-stop-num');
        go('#p' + target);
      }
    });
    refreshResume();
    refreshCollected();
  }

  function refreshResume() {
    var b = $('[data-ov="start"]');
    if (!b || !S.opts) return;
    var saved = read(keyPager()), vis = stopEls();
    var first = vis.length ? vis[0].getAttribute('data-stop-num') : null;
    var label = saved && saved !== first && stopEl(saved) && vis.indexOf(stopEl(saved)) > -1
      ? t('btn.resume_stop', 'Wróć do przystanku {n}', { n: pad(saved) })
      : t('btn.start_route', 'Zaczynamy');
    b.innerHTML = esc(label) + ' <span aria-hidden="true">→</span>';
  }

  // stan albumu na liście i mapie (zdobyte ✓, następny pulsuje — w widoku dziecka)
  function refreshCollected() {
    var vis = stopEls(), next = null;
    $$('#trasa > .qc-stop').forEach(function (el) {
      var n = el.getAttribute('data-stop-num');
      var done = el.classList.contains('is-collected');
      var hidden = vis.indexOf(el) < 0;
      if (!done && !hidden && next === null && el.hasAttribute('data-collectable')) next = n;
      $$('[data-go="' + n + '"]').forEach(function (x) {
        x.classList.toggle('is-done', done);
        x.classList.toggle('is-off', hidden);
      });
    });
    $$('[data-go]').forEach(function (x) { x.classList.toggle('is-next', x.getAttribute('data-go') === next); });
  }

  // ── mapa: kafelki OSM ułożone ręcznie (bez biblioteki), punkty i linia w SVG ──
  function proj(lat, lon, z) {
    var s = 256 * Math.pow(2, z), r = lat * Math.PI / 180;
    return [(lon + 180) / 360 * s, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * s];
  }
  function drawMap() {
    var map = $('.qc-map');
    if (!map) return;
    var W = map.clientWidth;
    if (!W || W === S.mapW) return;
    S.mapW = W;
    var H = Math.round(isMobile() ? Math.min(Math.max(W * 1.05, 320), 520) : Math.min(Math.max(W * 0.6, 300), 440));
    map.style.height = H + 'px';
    var pts = points().filter(function (s) { return s.lat != null && s.lon != null && isFinite(s.lat) && isFinite(s.lon); });
    var padPx = 30, z, P, minx, maxx, miny, maxy;
    for (z = 18; z >= 3; z--) {
      P = pts.map(function (s) { return proj(+s.lat, +s.lon, z); });
      minx = Math.min.apply(null, P.map(function (p) { return p[0]; }));
      maxx = Math.max.apply(null, P.map(function (p) { return p[0]; }));
      miny = Math.min.apply(null, P.map(function (p) { return p[1]; }));
      maxy = Math.max.apply(null, P.map(function (p) { return p[1]; }));
      if (maxx - minx <= W - 2 * padPx && maxy - miny <= H - 2 * padPx) break;
    }
    if (z > 17) { z = 17; P = pts.map(function (s) { return proj(+s.lat, +s.lon, z); });
      minx = Math.min.apply(null, P.map(function (p) { return p[0]; })); maxx = Math.max.apply(null, P.map(function (p) { return p[0]; }));
      miny = Math.min.apply(null, P.map(function (p) { return p[1]; })); maxy = Math.max.apply(null, P.map(function (p) { return p[1]; })); }
    var ox = (minx + maxx) / 2 - W / 2, oy = (miny + maxy) / 2 - H / 2, n = Math.pow(2, z);
    var tiles = '';
    for (var tx = Math.floor(ox / 256); tx <= Math.floor((ox + W) / 256); tx++) {
      for (var ty = Math.floor(oy / 256); ty <= Math.floor((oy + H) / 256); ty++) {
        if (ty < 0 || ty >= n) continue;
        var wx = ((tx % n) + n) % n;
        tiles += '<img src="https://tile.openstreetmap.org/' + z + '/' + wx + '/' + ty + '.png" alt="" width="256" height="256" decoding="async" ' +
                 'style="left:' + Math.round(tx * 256 - ox) + 'px;top:' + Math.round(ty * 256 - oy) + 'px" onerror="this.style.visibility=\'hidden\'">';
      }
    }
    $('.qc-map__tiles', map).innerHTML = tiles;
    var xy = P.map(function (p) { return [Math.round(p[0] - ox), Math.round(p[1] - oy)]; });
    // punkty bliżej niż szerokość znacznika rozsuwamy po spirali (linia trasy zostaje w prawdziwych miejscach)
    var minD = isMobile() ? 30 : 34, placed = [];
    var at = xy.map(function (p) {
      var q = p.slice(), k = 0;
      var near = function (a) { return placed.some(function (b) { return Math.abs(a[0] - b[0]) < minD && Math.abs(a[1] - b[1]) < minD; }); };
      while (near(q) && k < 24) { k++; var ang = k * 2.4, r = minD * (0.8 + k * 0.12); q = [Math.round(p[0] + r * Math.cos(ang)), Math.round(p[1] + r * Math.sin(ang))]; }
      q[0] = Math.max(18, Math.min(W - 18, q[0])); q[1] = Math.max(18, Math.min(H - 18, q[1]));
      placed.push(q); return q;
    });
    var svg = $('.qc-map__line', map);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.innerHTML = '<polyline points="' + xy.map(function (p) { return p.join(','); }).join(' ') + '"/>';
    var pins = '';
    pts.forEach(function (s, i) {
      var kind = (i === 0 && s.cat === 'parking') ? ' is-start' : (s.dinner ? ' is-finish' : '');
      pins += '<a class="qc-pin' + kind + '" href="#p' + esc(s.num) + '" data-go="' + esc(s.num) + '" style="left:' + at[i][0] + 'px;top:' + at[i][1] + 'px" ' +
              'aria-label="' + esc(pad(s.num) + ' ' + (s.name || '')) + '"><span>' + (kind === ' is-start' ? 'P' : pad(s.num)) + '</span></a>';
    });
    $('.qc-map__pins', map).innerHTML = pins;
    refreshCollected();
  }

  // ══════════ INIT (po każdym render()) ══════════
  function init(opts) {
    S.opts = opts || {};
    S.root = document.getElementById('city');
    if (!S.root || !$('#trasa')) return;

    // zakładki: klik + strzałki (wzorzec tablist)
    $$('.qc-tab[data-tab]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); go('#' + a.getAttribute('data-tab')); });
      a.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        var all = $$('.qc-tab[data-tab]'), i = all.indexOf(a);
        var nx = all[(i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length];
        nx.focus(); go('#' + nx.getAttribute('data-tab'));
      });
    });
    // pasek naklejek
    $$('.qc-strip__stk').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); go('#p' + a.getAttribute('data-strip-num')); });
    });

    renderOverview();
    // motion.js chowa elementy do pierwszego pojawienia się w oknie (opacity 0 → animacja). W panelach i pagerze
    // to daje „lag” przy każdym przełączeniu, więc oznaczamy je jako już pokazane, zanim motion.js je złapie.
    $$('#trasa > .qc-stop, #qcOverview .qc-section__title, #awaryjne .qc-section__title, #awaryjne .qc-card, #qr').forEach(function (el) {
      el.setAttribute('data-rv', ''); el.classList.add('is-in', 'qc-no-rv');
    });
    buildBar();
    addGoNext();
    bindSwipe();
    bindSummaries();

    if (!S.bound) {
      S.bound = true;
      window.addEventListener('popstate', function () { apply(parse(location.hash), 'pop'); });
      if (MQ) {
        var onMq = function () { apply(parse(location.hash), 'resize'); };
        if (MQ.addEventListener) MQ.addEventListener('change', onMq); else if (MQ.addListener) MQ.addListener(onMq);
      }
      var rt = null;
      window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(drawMap, 150); });
      // naklejka wklejona / przystanek wyłączony przez rodzica → odśwież listę, mapę i przyciski
      document.addEventListener('change', function (e) {
        if (!e.target.matches || !e.target.matches('[data-qc-task],[data-toggle-stop]')) return;
        setTimeout(function () {
          refreshCollected(); addGoNext(); refreshResume();
          if (S.cur) { var list = stopEls(), el = stopEl(S.cur); if (list.indexOf(el) > -1) updateBar(list, list.indexOf(el)); }
        }, 30);
      });
    }
    apply(parse(location.hash), 'init');
  }

  window.QTrip = { init: init, go: go };
})();
