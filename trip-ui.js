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
           'label.map', 'label.collected', 'btn.route_all', 'btn.zoom_in', 'btn.zoom_out', 'btn.zoom_fit'];
  var RAW = {
    pl: 'Trasa|Poprzedni|Następny|Idziemy dalej|Cała trasa|Cała trasa|Otwórz trasę w Mapach Google|Zaczynamy|Wróć do przystanku {n}|Start|Meta|Przystanek {n} z {t}|Mapa trasy|zdobyte|Cała trasa w Google Maps|Przybliż|Oddal|Pokaż całą trasę',
    en: 'Route|Previous|Next|Let\'s go on|Whole route|Whole route|Open the route in Google Maps|Let\'s start|Back to stop {n}|Start|Finish|Stop {n} of {t}|Route map|collected|Whole route in Google Maps|Zoom in|Zoom out|Show whole route',
    de: 'Route|Zurück|Weiter|Weiter geht\'s|Ganze Route|Ganze Route|Route in Google Maps öffnen|Los geht\'s|Zurück zu Stopp {n}|Start|Ziel|Stopp {n} von {t}|Routenkarte|gesammelt|Ganze Route in Google Maps|Vergrößern|Verkleinern|Ganze Route zeigen',
    it: 'Percorso|Precedente|Successiva|Andiamo avanti|Tutto il percorso|Tutto il percorso|Apri il percorso in Google Maps|Si parte|Torna alla tappa {n}|Partenza|Arrivo|Tappa {n} di {t}|Mappa del percorso|conquistata|Tutto il percorso su Google Maps|Ingrandisci|Riduci|Mostra tutto il percorso',
    cs: 'Trasa|Předchozí|Další|Jdeme dál|Celá trasa|Celá trasa|Otevřít trasu v Mapách Google|Jdeme na to|Zpět na zastávku {n}|Start|Cíl|Zastávka {n} z {t}|Mapa trasy|získáno|Celá trasa v Mapách Google|Přiblížit|Oddálit|Zobrazit celou trasu',
    da: 'Rute|Forrige|Næste|Videre|Hele ruten|Hele ruten|Åbn ruten i Google Maps|Lad os starte|Tilbage til stop {n}|Start|Mål|Stop {n} af {t}|Rutekort|samlet|Hele ruten i Google Maps|Zoom ind|Zoom ud|Vis hele ruten',
    es: 'Ruta|Anterior|Siguiente|¡Seguimos!|Toda la ruta|Toda la ruta|Abrir la ruta en Google Maps|¡Empezamos!|Volver a la parada {n}|Salida|Llegada|Parada {n} de {t}|Mapa de la ruta|conseguida|Toda la ruta en Google Maps|Acercar|Alejar|Ver toda la ruta',
    fr: 'Parcours|Précédent|Suivant|On continue|Tout le parcours|Tout le parcours|Ouvrir le parcours dans Google Maps|C\'est parti|Revenir à l\'étape {n}|Départ|Arrivée|Étape {n} sur {t}|Carte du parcours|gagnée|Tout le parcours dans Google Maps|Zoom avant|Zoom arrière|Voir tout le parcours',
    hr: 'Ruta|Prethodno|Sljedeće|Idemo dalje|Cijela ruta|Cijela ruta|Otvori rutu u Google kartama|Krećemo|Natrag na stajalište {n}|Start|Cilj|Stajalište {n} od {t}|Karta rute|osvojeno|Cijela ruta u Google kartama|Približi|Udalji|Prikaži cijelu rutu',
    hu: 'Útvonal|Előző|Következő|Menjünk tovább|Teljes útvonal|Teljes útvonal|Útvonal megnyitása a Google Térképben|Indulás|Vissza a(z) {n}. megállóhoz|Start|Cél|{n}. megálló / {t}|Útvonaltérkép|megszerezve|Teljes útvonal a Google Térképen|Nagyítás|Kicsinyítés|Teljes útvonal',
    nl: 'Route|Vorige|Volgende|We gaan verder|Hele route|Hele route|Route openen in Google Maps|We beginnen|Terug naar stop {n}|Start|Finish|Stop {n} van {t}|Routekaart|verzameld|Hele route in Google Maps|Inzoomen|Uitzoomen|Hele route tonen',
    no: 'Rute|Forrige|Neste|Videre|Hele ruten|Hele ruten|Åpne ruten i Google Maps|Vi starter|Tilbake til stopp {n}|Start|Mål|Stopp {n} av {t}|Rutekart|samlet|Hele ruten i Google Maps|Zoom inn|Zoom ut|Vis hele ruten',
    pt: 'Percurso|Anterior|Seguinte|Vamos em frente|Percurso completo|Percurso completo|Abrir o percurso no Google Maps|Vamos começar|Voltar à paragem {n}|Partida|Chegada|Paragem {n} de {t}|Mapa do percurso|conquistada|Percurso completo no Google Maps|Aproximar|Afastar|Ver todo o percurso',
    ro: 'Traseu|Înapoi|Următoarea|Mergem mai departe|Tot traseul|Tot traseul|Deschide traseul în Google Maps|Pornim|Înapoi la oprirea {n}|Start|Final|Oprirea {n} din {t}|Harta traseului|câștigată|Tot traseul în Google Maps|Mărește|Micșorează|Arată tot traseul',
    sk: 'Trasa|Predchádzajúca|Ďalšia|Ideme ďalej|Celá trasa|Celá trasa|Otvoriť trasu v Mapách Google|Ideme na to|Späť na zastávku {n}|Štart|Cieľ|Zastávka {n} z {t}|Mapa trasy|získané|Celá trasa v Mapách Google|Priblížiť|Oddialiť|Zobraziť celú trasu',
    sv: 'Rutt|Föregående|Nästa|Vi går vidare|Hela rutten|Hela rutten|Öppna rutten i Google Maps|Nu kör vi|Tillbaka till stopp {n}|Start|Mål|Stopp {n} av {t}|Ruttkarta|samlad|Hela rutten i Google Maps|Zooma in|Zooma ut|Visa hela rutten',
    uk: 'Маршрут|Попередня|Наступна|Ідемо далі|Увесь маршрут|Увесь маршрут|Відкрити маршрут у Google Картах|Починаємо|Назад до зупинки {n}|Старт|Фініш|Зупинка {n} з {t}|Карта маршруту|здобуто|Увесь маршрут у Google Картах|Наблизити|Віддалити|Показати весь маршрут'
  };
  var DICT = {};
  Object.keys(RAW).forEach(function (l) {
    var v = RAW[l].split('|'), d = {};
    K.forEach(function (k, i) { d[k] = v[i]; });
    DICT[l] = d;
  });

  var PIN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>';
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
    if (S.opts.locked) return '';   // Etap A: gość bez klucza nie dostaje trasy w Mapach Google
    var c = S.opts.city || {};
    if (c && /^https?:\/\//i.test(String(c.route_url || '').trim())) return String(c.route_url).trim();
    // zapytanie z bazy (maps_query) > współrzędne > nazwa przystanku + miasto — nazwa daje w Google punkt z nazwą, a nie adres ulicy
    var town = S.opts.cityName || '';
    var pts = points().map(function (s) {
      if (s.query) return s.query;   // nazwa miejsca: Google pokazuje POI, a nie adres ulicy przy współrzędnych
      if (s.lat != null && s.lon != null && isFinite(s.lat) && isFinite(s.lon)) return s.lat + ',' + s.lon;
      return s.name ? s.name + (town ? ', ' + town : '') : '';
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
    var gm = gmapsUrl();
    var html = '<div class="qc-ov__head"><h2 class="qc-section__title">' + esc(t('label.whole_route', 'Cała trasa')) + '</h2>';
    if (gm) html += '<a class="qc-btn qc-btn--sm qc-ov__gmaps" href="' + esc(gm) + '" target="_blank" rel="noopener">' + PIN + ' ' + esc(t('btn.open_gmaps', 'Otwórz trasę w Mapach Google')) + '</a>';
    html += '</div>';
    if (withGeo.length >= 2) {
      html += '<div class="qc-map" role="group" aria-label="' + esc(t('label.map', 'Mapa trasy')) + '"><div class="qc-map__tiles"></div>' +
              '<svg class="qc-map__line" aria-hidden="true"></svg><div class="qc-map__pins"></div>' +
              '<a class="qc-map__attr" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a></div>';
    }
    html += '<ol class="qc-ov__list">';
    pts.forEach(function (s, i) {
      var tag = i === 0 ? t('label.start', 'Start') : (s.dinner ? t('label.finish', 'Meta') : '');
      html += '<li><a class="qc-ov__item" href="#p' + esc(s.num) + '" data-go="' + esc(s.num) + '">' +
              '<span class="qc-ov__no">' + pad(s.num) + '</span>' +
              '<span class="qc-ov__txt"><span class="qc-ov__time">' + esc(s.time || '') + '</span>' +
              '<span class="qc-ov__name">' + esc(s.name || '') + '</span>' +
              (tag ? '<span class="qc-ov__tag' + (s.dinner ? ' is-finish' : '') + '">' + esc(tag) + '</span>' : '') + '</span>' +
              '<span class="qc-ov__check" aria-hidden="true">✓</span></a></li>';
    });
    html += '</ol>';
    html += '<div class="qc-ov__actions">';
    html += '<button type="button" class="qc-btn qc-btn--primary qc-ov__start" data-ov="start">' + esc(t('btn.start_route', 'Zaczynamy')) + ' <span aria-hidden="true">→</span></button>';
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
    // przycisk w nagłówku miasta: gdy strona nie ma ani route_url, ani maps_query startu (np. podgląd szkicu), dajemy „Cała trasa”
    var acts = $('.qc-intro__actions');
    if (gm && acts && !(S.opts.city || {}).route_url && !$('[data-qc-route]', acts)) {
      var a = document.createElement('a');
      a.className = 'qc-btn qc-btn--primary';
      a.setAttribute('data-qc-route', '');
      a.href = gm; a.target = '_blank'; a.rel = 'noopener';
      a.innerHTML = PIN + ' ' + esc(t('btn.route_all', 'Cała trasa w Google Maps'));
      $$('a', acts).forEach(function (x) { x.classList.remove('qc-btn--primary'); x.classList.add('qc-btn--ghost'); });
      acts.insertBefore(a, acts.firstChild);
    }
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

  // ── mapa: kafelki ułożone ręcznie (bez biblioteki), punkty i linia w SVG; przybliżanie i przesuwanie ──
  // Widok: z (może być ułamkowe w trakcie gestu), cx/cy = środek w pikselach świata przy z = 0 (0..256).
  // Na przeglądzie mapa nie łapie przewijania strony; po przybliżeniu staje się „aktywna” (jeden palec przesuwa).
  var TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';   // przed 1.06.2027: płatny dostawca (docs/PM.md §0)
  var MAXZ = 18, M = { z: 0, cx: 0, cy: 0, fit: null, W: 0, H: 0, tiles: {}, pts: [] };
  function proj(lat, lon, z) {
    var s = 256 * Math.pow(2, z), r = lat * Math.PI / 180;
    return [(lon + 180) / 360 * s, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * s];
  }
  function drawMap() {
    var map = $('.qc-map');
    if (!map) return;
    var W = map.clientWidth;
    if (!W) return;
    if (W === S.mapW && M.fit) { renderMap(); return; }
    S.mapW = W;
    var H = Math.round(isMobile() ? Math.min(Math.max(W * 1.05, 320), 520) : Math.min(Math.max(W * 0.6, 300), 440));
    map.style.height = H + 'px';
    M.W = W; M.H = H;
    M.pts = points().filter(function (s) { return s.lat != null && s.lon != null && isFinite(s.lat) && isFinite(s.lon); });
    M.base = M.pts.map(function (s) { return proj(+s.lat, +s.lon, 0); });
    var minx = Math.min.apply(null, M.base.map(function (p) { return p[0]; })), maxx = Math.max.apply(null, M.base.map(function (p) { return p[0]; }));
    var miny = Math.min.apply(null, M.base.map(function (p) { return p[1]; })), maxy = Math.max.apply(null, M.base.map(function (p) { return p[1]; }));
    var z;
    for (z = MAXZ; z > 3; z--) { var k = Math.pow(2, z); if ((maxx - minx) * k <= W - 60 && (maxy - miny) * k <= H - 60) break; }
    z = Math.min(z, 17);
    M.bbox = [minx, miny, maxx, maxy];
    M.fit = { z: z, cx: (minx + maxx) / 2, cy: (miny + maxy) / 2 };
    M.tiles = {}; $('.qc-map__tiles', map).innerHTML = '';
    if (!map.dataset.bound) bindMap(map);
    setView(M.fit.z, M.fit.cx, M.fit.cy);
  }
  function clampView(z, cx, cy) {
    z = Math.max(M.fit.z - 1, Math.min(MAXZ, z));
    var b = M.bbox, k = Math.pow(2, z), hw = M.W / 2 / k, hh = M.H / 2 / k;
    // środek nie może odjechać dalej niż pół ekranu poza trasę
    cx = Math.max(b[0] - hw, Math.min(b[2] + hw, cx));
    cy = Math.max(b[1] - hh, Math.min(b[3] + hh, cy));
    return [z, cx, cy];
  }
  function setView(z, cx, cy) {
    var v = clampView(z, cx, cy);
    M.z = v[0]; M.cx = v[1]; M.cy = v[2];
    renderMap();
  }
  function renderMap() {
    var map = $('.qc-map');
    if (!map || !M.fit) return;
    var W = M.W, H = M.H, tz = Math.max(0, Math.min(MAXZ, Math.round(M.z))), sc = Math.pow(2, M.z - tz), size = 256 * sc;
    var n = Math.pow(2, tz), CX = M.cx * n * sc, CY = M.cy * n * sc;
    var ox = CX - W / 2, oy = CY - H / 2, want = {}, layer = $('.qc-map__tiles', map);
    for (var tx = Math.floor(ox / size); tx <= Math.floor((ox + W) / size); tx++) {
      for (var ty = Math.floor(oy / size); ty <= Math.floor((oy + H) / size); ty++) {
        if (ty < 0 || ty >= n) continue;
        var wx = ((tx % n) + n) % n, key = tz + '/' + tx + '/' + ty, img = M.tiles[key];
        if (!img) {
          img = document.createElement('img');
          img.alt = ''; img.decoding = 'async'; img.width = 256; img.height = 256;
          img.onerror = function () { this.style.visibility = 'hidden'; };
          img.src = TILE_URL.replace('{z}', tz).replace('{x}', wx).replace('{y}', ty);
          layer.appendChild(img); M.tiles[key] = img;
        }
        img.style.left = Math.round(tx * size - ox) + 'px'; img.style.top = Math.round(ty * size - oy) + 'px';
        img.style.width = img.style.height = Math.ceil(size) + 'px';
        want[key] = 1;
      }
    }
    Object.keys(M.tiles).forEach(function (k) { if (!want[k]) { M.tiles[k].remove(); delete M.tiles[k]; } });
    var k = Math.pow(2, M.z);
    var xy = M.base.map(function (p) { return [Math.round(p[0] * k - M.cx * k + W / 2), Math.round(p[1] * k - M.cy * k + H / 2)]; });
    // punkty bliżej niż szerokość znacznika rozsuwamy po spirali (linia trasy zostaje w prawdziwych miejscach)
    var minD = isMobile() ? 30 : 34, placed = [];
    var at = xy.map(function (p) {
      var q = p.slice(), i = 0;
      var near = function (a) { return placed.some(function (b) { return Math.abs(a[0] - b[0]) < minD && Math.abs(a[1] - b[1]) < minD; }); };
      while (near(q) && i < 24) { i++; var ang = i * 2.4, r = minD * (0.8 + i * 0.12); q = [Math.round(p[0] + r * Math.cos(ang)), Math.round(p[1] + r * Math.sin(ang))]; }
      placed.push(q); return q;
    });
    var svg = $('.qc-map__line', map);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.innerHTML = '<polyline points="' + xy.map(function (p) { return p.join(','); }).join(' ') + '"/>';
    var pins = '';
    M.pts.forEach(function (s, i) {
      var p = at[i];
      if (p[0] < -30 || p[1] < -30 || p[0] > W + 30 || p[1] > H + 30) return;
      var kind = (i === 0 && s.cat === 'parking') ? ' is-start' : (s.dinner ? ' is-finish' : '');
      pins += '<a class="qc-pin' + kind + '" href="#p' + esc(s.num) + '" data-go="' + esc(s.num) + '" style="left:' + p[0] + 'px;top:' + p[1] + 'px" ' +
              'aria-label="' + esc(pad(s.num) + ' ' + (s.name || '')) + '"><span>' + (kind === ' is-start' ? 'P' : pad(s.num)) + '</span></a>';
    });
    $('.qc-map__pins', map).innerHTML = pins;
    var zoomed = M.z > M.fit.z + 0.01 || Math.abs(M.cx - M.fit.cx) * k > 2 || Math.abs(M.cy - M.fit.cy) * k > 2;
    map.classList.toggle('is-active', M.z > M.fit.z + 0.01);
    var fitBtn = $('[data-map="fit"]', map), inBtn = $('[data-map="in"]', map), outBtn = $('[data-map="out"]', map);
    if (fitBtn) fitBtn.hidden = !zoomed;
    if (inBtn) inBtn.disabled = M.z >= MAXZ - 0.01;
    if (outBtn) outBtn.disabled = M.z <= M.fit.z - 0.99;
    refreshCollected();
  }
  // przybliżenie wokół punktu ekranu (px, py)
  function zoomAt(nz, px, py) {
    var k0 = Math.pow(2, M.z), wx = M.cx + (px - M.W / 2) / k0, wy = M.cy + (py - M.H / 2) / k0;
    nz = Math.max(M.fit.z - 1, Math.min(MAXZ, nz));
    var k1 = Math.pow(2, nz);
    setView(nz, wx - (px - M.W / 2) / k1, wy - (py - M.H / 2) / k1);
  }
  function animateZoom(target, px, py) {
    var from = M.z, t0 = null, reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { zoomAt(target, px, py); return; }
    function step(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / 220), e = 1 - Math.pow(1 - p, 3);
      zoomAt(from + (target - from) * e, px, py);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function bindMap(map) {
    map.dataset.bound = '1';
    var ctl = document.createElement('div');
    ctl.className = 'qc-map__ctl';
    ctl.innerHTML = '<button type="button" data-map="in" aria-label="' + esc(t('btn.zoom_in', 'Przybliż')) + '" title="' + esc(t('btn.zoom_in', 'Przybliż')) + '">+</button>' +
      '<button type="button" data-map="out" aria-label="' + esc(t('btn.zoom_out', 'Oddal')) + '" title="' + esc(t('btn.zoom_out', 'Oddal')) + '">−</button>' +
      '<button type="button" data-map="fit" hidden aria-label="' + esc(t('btn.zoom_fit', 'Pokaż całą trasę')) + '" title="' + esc(t('btn.zoom_fit', 'Pokaż całą trasę')) + '">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>';
    map.appendChild(ctl);
    ctl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-map]'); if (!b || b.disabled) return;
      var a = b.getAttribute('data-map');
      if (a === 'fit') { animateFit(); return; }
      animateZoom(Math.round(M.z) + (a === 'in' ? 1 : -1), M.W / 2, M.H / 2);
    });
    map.tabIndex = 0;
    map.addEventListener('keydown', function (e) {
      if (e.target !== map) return;
      var step = 80 / Math.pow(2, M.z), h = true;
      if (e.key === '+' || e.key === '=') animateZoom(Math.round(M.z) + 1, M.W / 2, M.H / 2);
      else if (e.key === '-' || e.key === '_') animateZoom(Math.round(M.z) - 1, M.W / 2, M.H / 2);
      else if (e.key === 'ArrowLeft') setView(M.z, M.cx - step, M.cy);
      else if (e.key === 'ArrowRight') setView(M.z, M.cx + step, M.cy);
      else if (e.key === 'ArrowUp') setView(M.z, M.cx, M.cy - step);
      else if (e.key === 'ArrowDown') setView(M.z, M.cx, M.cy + step);
      else if (e.key === '0' || e.key === 'Home') animateFit();
      else h = false;
      if (h) e.preventDefault();
    });
    // wskaźniki: przeciąganie (gdy mapa aktywna albo mysz), szczypanie dwoma palcami
    var ptrs = {}, start = null, moved = 0;
    function rel(e) { var r = map.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    function snapshot() {
      var ids = Object.keys(ptrs), a = ptrs[ids[0]], b = ptrs[ids[1]];
      return { z: M.z, cx: M.cx, cy: M.cy, n: ids.length,
        mx: b ? (a[0] + b[0]) / 2 : a[0], my: b ? (a[1] + b[1]) / 2 : a[1], d: b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0 };
    }
    map.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.qc-map__ctl, .qc-map__attr')) return;
      var touchPassive = e.pointerType === 'touch' && !map.classList.contains('is-active') && Object.keys(ptrs).length === 0;
      ptrs[e.pointerId] = rel(e);
      if (touchPassive) { start = null; return; }                // jeden palec na przeglądzie = przewijanie strony
      try { map.setPointerCapture(e.pointerId); } catch (x) { /* stary Safari */ }
      start = snapshot(); moved = 0;
    });
    map.addEventListener('pointermove', function (e) {
      if (!ptrs[e.pointerId]) return;
      ptrs[e.pointerId] = rel(e);
      var ids = Object.keys(ptrs);
      if (!start || start.n !== ids.length) { if (ids.length >= 1 && (map.classList.contains('is-active') || ids.length === 2 || e.pointerType !== 'touch')) { start = snapshot(); } return; }
      var now = snapshot(), k0 = Math.pow(2, start.z);
      moved = Math.max(moved, Math.hypot(now.mx - start.mx, now.my - start.my), Math.abs(now.d - start.d));
      if (moved < 4) return;
      var nz = start.z;
      if (now.n === 2 && start.d > 10) nz = start.z + Math.log(now.d / start.d) / Math.LN2;
      nz = Math.max(M.fit.z - 1, Math.min(MAXZ, nz));
      // punkt świata pod środkiem palców na starcie ma zostać pod środkiem palców teraz
      var wx = start.cx + (start.mx - M.W / 2) / k0, wy = start.cy + (start.my - M.H / 2) / k0, k1 = Math.pow(2, nz);
      setView(nz, wx - (now.mx - M.W / 2) / k1, wy - (now.my - M.H / 2) / k1);
      e.preventDefault();
    });
    function end(e) {
      if (!ptrs[e.pointerId]) return;
      delete ptrs[e.pointerId];
      var left = Object.keys(ptrs).length;
      if (left === 0) {
        if (Math.abs(M.z - Math.round(M.z)) > 0.02) animateZoom(Math.round(M.z), M.W / 2, M.H / 2);
        if (moved >= 4) {  // po przeciągnięciu nie klikamy pinezki
          var stop = function (ev) { ev.preventDefault(); ev.stopPropagation(); };
          map.addEventListener('click', stop, true);
          setTimeout(function () { map.removeEventListener('click', stop, true); moved = 0; }, 300);
        }
        start = null;
      } else start = snapshot();
    }
    map.addEventListener('pointerup', end);
    map.addEventListener('pointercancel', end);
    map.addEventListener('dblclick', function (e) {
      if (e.target.closest('.qc-map__ctl, .qc-pin')) return;
      var p = rel(e); animateZoom(Math.round(M.z) + 1, p[0], p[1]); e.preventDefault();
    });
    // kółko myszy: tylko z Ctrl/⌘ albo gdy mapa jest już przybliżona (nie porywamy przewijania strony)
    map.addEventListener('wheel', function (e) {
      if (!(e.ctrlKey || e.metaKey || map.classList.contains('is-active'))) return;
      e.preventDefault();
      var p = rel(e); zoomAt(M.z - e.deltaY * 0.004, p[0], p[1]);
      clearTimeout(map._wt); map._wt = setTimeout(function () { animateZoom(Math.round(M.z), p[0], p[1]); }, 180);
    }, { passive: false });
  }
  function animateFit() {
    var f = M.fit, z0 = M.z, x0 = M.cx, y0 = M.cy, t0 = null;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { setView(f.z, f.cx, f.cy); return; }
    function step(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / 260), e = 1 - Math.pow(1 - p, 3);
      setView(z0 + (f.z - z0) * e, x0 + (f.cx - x0) * e, y0 + (f.cy - y0) * e);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
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
