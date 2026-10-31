/* ============================================================
   Panel admina — paleta poleceń Ctrl+K / Cmd+K (JP 2026-10-31)
   Wyszukiwanie rozmyte po trasach, przystankach bieżącej trasy, wersjach,
   flagach, decyzjach, strażnikach i sekcjach panelu + akcje kontekstowe.
   Indeks budowany z danych, które panel już ma (window.ADM.state, inbox) —
   bez dodatkowych zapytań. Akcje nieodwracalne (zatwierdź / odrzuć / wdrożenie)
   prowadzą do istniejącego potwierdzenia, nie wykonują się bezpośrednio.
   Ostatnio używane: sessionStorage `adm.recent` (docs/BACKEND.md §6.3).
   Motyw: sessionStorage `adm.theme` + atrybut data-theme na <body> (admin-palette.css).
   ============================================================ */
(function () {
  'use strict';
  var A = window.ADM; if (!A) return;
  var esc = A.esc, fold = A.fold;
  var RECENT = 'adm.recent', THEME = 'adm.theme', MAX_RECENT = 8;
  var SVG = function (d) { return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
  var IC = {
    search: SVG('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
    trip: SVG('<path d="M6 19a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/><path d="M8.5 16.5h7a3 3 0 0 0 0-6h-7a3 3 0 0 1 0-6H15"/>'),
    stop: SVG('<path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/>'),
    ver: SVG('<path d="M12 8v4l3 2"/><circle cx="12" cy="12" r="8.5"/>'),
    flag: SVG('<path d="M5 3v18M5 4h11l-2 4 2 4H5"/>'),
    dec: SVG('<path d="M4 13l3.5-8h9L20 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 13h4.5l1.5 2.5h4l1.5-2.5H20"/>'),
    watch: SVG('<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>'),
    sec: SVG('<rect x="3" y="3" width="7.5" height="9" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="5.5" rx="1.6"/><rect x="13.5" y="11.5" width="7.5" height="9.5" rx="1.6"/><rect x="3" y="15" width="7.5" height="6" rx="1.6"/>'),
    ok: SVG('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    no: SVG('<path d="M6 6l12 12M18 6L6 18"/>'),
    send: SVG('<path d="M4 12l16-8-6 16-2.5-6.5z"/>'),
    cmp: SVG('<path d="M12 3v18M4 7h5M4 12h5M4 17h5M15 7h5M15 12h5M15 17h5"/>'),
    ext: SVG('<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>'),
    phone: SVG('<rect x="6.5" y="2.5" width="11" height="19" rx="2.6"/><path d="M10.5 5.5h3M11 18.5h2"/>'),
    theme: SVG('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17A8.5 8.5 0 0 0 12 3.5z" fill="currentColor"/>'),
    clock: SVG('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>')
  };
  var ss = { get: function (k) { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* prywatne okno */ } } };

  // ── motyw: jasny / ciemny / systemowy (atrybut data-theme na body, tokeny w admin-palette.css) ──
  function themeNow() { var t = document.body.getAttribute('data-theme'); if (t) return t; return window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'; }
  function setTheme(t) { if (t) document.body.setAttribute('data-theme', t); else document.body.removeAttribute('data-theme'); ss.set(THEME, t || null); }
  var savedTheme = ss.get(THEME); if (savedTheme === 'dark' || savedTheme === 'light') setTheme(savedTheme);

  // ── wyszukiwanie rozmyte: każdy wyraz zapytania musi pasować (prefiks > wyraz > fragment > podciąg) ──
  function scoreOne(q, t) {
    if (!q) return 1;
    if (t.indexOf(q) === 0) return 100;
    var w = t.indexOf(' ' + q); if (w >= 0) return 80 - Math.min(w, 30) / 10;
    var i = t.indexOf(q); if (i >= 0) return 60 - Math.min(i, 40) / 10;
    if (q.length < 3) return 0;
    var words = t.split(' '), best = 0;   // podciąg w obrębie jednego wyrazu (np. „flg” → „flaga”), premia za zwartość
    for (var wi = 0; wi < words.length; wi++) {
      var w2 = words[wi], p = 0, first = -1, last = -1;
      for (var k = 0; k < w2.length && p < q.length; k++) if (w2.charAt(k) === q.charAt(p)) { if (first < 0) first = k; last = k; p++; }
      if (p === q.length) best = Math.max(best, Math.max(5, 30 - (last - first + 1 - q.length) * 4 - first));
    }
    return best;
  }
  function score(query, text) {
    var toks = fold(query).split(/\s+/).filter(Boolean), t = ' ' + fold(text) + ' ', s = 0;
    for (var i = 0; i < toks.length; i++) { var one = scoreOne(toks[i], t); if (!one) return 0; s += one; }
    return s;
  }

  // ── nawigacja pomocnicza ──
  function go(hash) { if (location.hash === hash) { try { window.dispatchEvent(new HashChangeEvent('hashchange')); } catch (e) { location.hash = ''; location.hash = hash; } } else location.hash = hash; }
  function fieldsView() { if ((A.state.tvView || 'fields') !== 'fields') { A.state.tvView = 'fields'; A.viewApply(); } }
  function scrollTo(id, focusSel) {
    var el = document.getElementById(id); if (!el) return;
    el.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' });
    var f = focusSel ? el.querySelector(focusSel) : null; (f || el).focus && (f || el).focus({ preventScroll: true });
  }
  function clickOnce(sel) { var b = document.querySelector(sel); if (b && !b.disabled) { b.scrollIntoView({ block: 'center' }); b.focus({ preventScroll: true }); b.click(); return true; } return false; }
  function afterRoute(hash, fn) {
    var tries = 0, t = setInterval(function () { if (fn() || ++tries > 40) clearInterval(t); }, 150);
    go(hash);
  }
  function decFocus(kind, id) {
    var el = document.querySelector('.dec-item[data-kind="' + kind + '"][data-id="' + id + '"]'); if (!el) return false;
    el.scrollIntoView({ block: 'start' });
    var b = el.querySelector('[data-dec]'); (b || el).focus({ preventScroll: true });
    el.classList.add('is-pal-target'); setTimeout(function () { el.classList.remove('is-pal-target'); }, 1500);
    return true;
  }
  function tripOpen() { return !!A.state.trip && !!A.state.current && /^#\/[^/]+(\/v\d+)?$/.test(location.hash) && !/^#\/(trasy|decyzje|straznicy|ikony|postep|pipeline|mapa|zgloszenia|koszty|baza-wiedzy|pulpit)$/.test(location.hash); }
  function unsentCount() { return (A.state.comments || []).filter(function (c) { return c.status === 'new' || c.status === 'local'; }).length; }

  // ── indeks: budowany przy każdym otwarciu z tego, co panel już ma ──
  function buildIndex() {
    var items = [], T = A.state.trip, it = A.state.current, inTrip = tripOpen();
    var add = function (o) { o.kw = fold([o.label, o.hint, o.kw].filter(Boolean).join(' ')); items.push(o); };
    // akcje kontekstowe (trasa)
    if (inTrip && it) {
      var ro = A.state.readOnly, vl = it.label || 'v' + it.version;
      if (!ro && document.querySelector('[data-act="approve"]:not([disabled])'))
        add({ id: 'act:approve', group: 'Akcje', icon: IC.ok, label: 'Zatwierdź i opublikuj ' + T.name + ' ' + vl, hint: 'prowadzi do potwierdzenia (drugie kliknięcie)', kw: 'publikuj akceptuj', danger: true,
          run: function () { clickOnce('[data-act="approve"]'); } });
      if (!ro) add({ id: 'act:reject', group: 'Akcje', icon: IC.no, label: 'Odrzuć szkic ' + vl, hint: 'prowadzi do potwierdzenia', kw: 'odrzuc', danger: true,
        run: function () { var m = document.querySelector('.tv-more'); if (m) m.open = true; setTimeout(function () { clickOnce('[data-act="reject"]'); }, 50); } });
      var n = unsentCount();
      if (!ro) add({ id: 'act:send', group: 'Akcje', icon: IC.send, label: 'Wyślij uwagi do poprawki (' + n + ')', hint: n ? 'wszystkie zapisane uwagi w jednej paczce' : 'nic nie czeka na wysłanie — otwiera „Twoje uwagi”', kw: 'wyslij uwagi hermes',
        run: function () { A.drawerOpen(); if (n) setTimeout(function () { clickOnce('#cmDrawer [data-send]'); }, 80); } });
      if (document.querySelector('[data-qa-recall]')) add({ id: 'act:recall', group: 'Akcje', icon: IC.ok, label: 'Przyjmij wszystkie rekomendacje', hint: 'otwiera listę do przejrzenia przed zapisem', kw: 'rekomendacje flagi',
        run: function () { A.recOpen(); } });
      if (document.querySelector('[data-walk]')) add({ id: 'act:walk', group: 'Akcje', icon: IC.flag, label: 'Przejdź przez flagi', hint: 'jedna flaga naraz · J/K', kw: 'flagi kontrola',
        run: function () { A.walkOpen(); } });
      (A.cmpOptions(it) || []).forEach(function (o) {
        add({ id: 'cmp:' + o[0], group: 'Akcje', icon: IC.cmp, label: 'Porównaj z ' + o[1], hint: 'nakładka różnic na pola', kw: 'porownaj porównaj ' + o[0] + (o[0] === 'pub' ? ' opublikowana' : o[0] === 'prev' ? ' poprzednia' : ''),
          run: function () { var s = document.getElementById('cmpSel'); if (s) { s.value = o[0]; s.dispatchEvent(new Event('change', { bubbles: true })); } } });
      });
      if (A.state.cmpSel) add({ id: 'cmp:off', group: 'Akcje', icon: IC.cmp, label: 'Zakończ porównanie', kw: 'porownaj', run: function () { A.state.cmpSel = ''; A.rerender(); } });
      if (T.published != null) add({ id: 'act:site', group: 'Akcje', icon: IC.ext, label: 'Otwórz na stronie (v' + T.published + ') ↗', hint: 'quolino.com, wersja opublikowana', kw: 'strona otworz',
        run: function () { window.open(A.SITE + '/city.html?c=' + encodeURIComponent(T.slug), '_blank', 'noopener'); } });
      if (window.AdmPreview) {
        add({ id: 'act:pv-parent', group: 'Akcje', icon: IC.phone, label: 'Podgląd na telefonie: rodzic', hint: 'wersja ' + vl + ' na żywo', kw: 'telefon podglad rodzic', run: function () { window.AdmPreview.open('parent'); } });
        add({ id: 'act:pv-kid', group: 'Akcje', icon: IC.phone, label: 'Podgląd na telefonie: dziecko', hint: 'wersja ' + vl + ' na żywo', kw: 'telefon podglad dziecko', run: function () { window.AdmPreview.open('kid'); } });
      }
      // przystanki bieżącej trasy
      (A.state.tvStops || []).forEach(function (x) {
        var no = x.key === '_city' ? '' : A.num(x.s.stop_number);
        add({ id: 'stop:' + x.key, group: 'Przystanki · ' + T.name, icon: IC.stop, label: (no ? no + ' · ' : '') + (x.t.name || x.key), hint: [x.s.category, x.kind === 'new' ? 'nowy' : x.kind === 'chg' ? 'zmieniony' : x.kind === 'del' ? 'usunięty' : ''].filter(Boolean).join(' · '),
          kw: 'przystanek ' + x.key, run: function () { fieldsView(); scrollTo('st-' + x.key); } });
      });
      add({ id: 'stop:_city', group: 'Przystanki · ' + T.name, icon: IC.stop, label: 'Opis miasta', kw: 'miasto tytul wstep', run: function () { fieldsView(); scrollTo('st-_city'); } });
      add({ id: 'stop:_sum', group: 'Przystanki · ' + T.name, icon: IC.stop, label: 'Trasa w skrócie i mapa', kw: 'mapa skrot', run: function () { fieldsView(); scrollTo('st-_sum'); } });
      // wersje
      (A.state.versions || []).slice().reverse().forEach(function (r) {
        add({ id: 'ver:' + r.version, group: 'Wersje · ' + T.name, icon: IC.ver, label: T.name + ' ' + A.vlab(r), hint: (A.VST[r.status] || r.status) + (r.created_at ? ' · ' + new Date(r.created_at).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }) : '') + (r.note ? ' · ' + r.note : ''),
          kw: 'wersja v' + r.version + ' ' + T.slug, run: function () { A.showTab(r.version); } });
      });
      // flagi z kontroli
      var ids = A.walk && A.walk.ids && A.walk.ids.length ? A.walk.ids : [].map.call(document.querySelectorAll('#tvFields .adm-q__it:not(.is-auto)'), function (li) { return li.getAttribute('data-qid'); });
      (A.state.qa ? A.state.qa.list : []).forEach(function (x) {
        if (x.auto) return;
        var qid = A.qaId(x), i = ids.indexOf(qid), done = (function () { var li = document.getElementById('q-' + qid); return !!li && li.classList.contains('is-done'); })();
        add({ id: 'flag:' + qid, group: 'Flagi · ' + T.name, icon: IC.flag, label: 'Flaga ' + x.n + ' · ' + (x.block ? 'blokująca' : 'ostrzeżenie') + (done ? ' · rozstrzygnięta' : ''), hint: x.where + (x.e && x.e.problem ? ' — ' + String(x.e.problem).slice(0, 90) : ''),
          kw: 'flaga ' + x.n + ' ' + T.slug + ' flagi ' + T.name, run: function () { A.walkOpen(); if (i >= 0) A.walkShow(i); } });
      });
    }
    // trasy
    (A.state.trips || []).forEach(function (t) {
      var st = { draft: 'szkic do akceptacji', published: 'opublikowana', rejected: 'odrzucona', archived: 'archiwum' }[t.status] || t.status;
      add({ id: 'trip:' + t.slug, group: 'Trasy', icon: IC.trip, label: t.name, hint: [A.countryName(t.country), t.region ? A.regionName(t.region) : '', st, t.latest ? 'v' + t.latest : ''].filter(Boolean).join(' · '),
        kw: t.slug + ' ' + t.country + ' ' + t.region, run: function () { go('#/' + encodeURIComponent(t.slug)); } });
      if (!inTrip || !T || T.slug !== t.slug) {
        add({ id: 'tripflags:' + t.slug, group: 'Trasy', icon: IC.flag, label: 'Flagi ' + t.name, hint: 'otwiera trasę i „Przejdź przez flagi”', kw: 'flagi ' + t.slug, hidden: true,
          run: function () { afterRoute('#/' + encodeURIComponent(t.slug), function () { if (!document.querySelector('[data-walk]')) return false; A.walkOpen(); return true; }); } });
        for (var v = 1; v <= (t.versions || 1); v++) (function (v) {
          add({ id: 'tripver:' + t.slug + ':' + v, group: 'Trasy', icon: IC.ver, label: t.name + ' v' + v, hint: 'otwiera tę wersję', kw: t.slug + ' v' + v + ' wersja', hidden: true,
            run: function () { go('#/' + encodeURIComponent(t.slug) + (v === t.latest ? '' : '/v' + v)); } });
        })(v);
      }
    });
    // decyzje i strażnicy (z tego, co skrzynka już pobrała)
    var D = A.inbox && A.inbox.data;
    if (D) {
      ((D.deploys && D.deploys.ok) || []).forEach(function (r) {
        if (r.status !== 'pending') return;
        var files = (r.files || []).map(function (f) { return String(f).replace(/^_content\/claude-skills\//, ''); });
        add({ id: 'dec:deploy:' + r.id, group: 'Decyzje', icon: IC.dec, label: 'Zatwierdź wdrożenie: ' + files.slice(0, 3).join(', ') + (files.length > 3 ? ' +' + (files.length - 3) : ''), hint: 'prowadzi do karty decyzji (dwa kliknięcia)', kw: 'wdrozenie deploy sql ops ' + files.join(' '), danger: true,
          run: function () { afterRoute('#/decyzje', function () { return decFocus('deploy', r.id); }); } });
      });
      ((D.costs && D.costs.ok) || []).forEach(function (r) {
        if (r.status !== 'pending') return;
        add({ id: 'dec:cost:' + r.id, group: 'Decyzje', icon: IC.dec, label: 'Zgoda na koszt: ' + (r.title || r.job_key), hint: (r.est_usd != null ? '~' + String(r.est_usd).replace('.', ',') + ' $ · ' : '') + 'prowadzi do karty decyzji', kw: 'koszt zgoda ' + (r.job_key || ''),
          run: function () { afterRoute('#/decyzje', function () { return decFocus('cost', r.id); }); } });
      });
      (((D.watch && D.watch.ok) || {}).rows || []).forEach(function (r) {
        add({ id: 'watch:' + r.id, group: 'Strażnicy', icon: IC.watch, label: r.title || 'Ustalenie strażnika', hint: [r.kind, r.city_slug ? A.titleCase(r.city_slug) : '', r.stop_key].filter(Boolean).join(' · '), kw: 'straznik ' + (r.kind || '') + ' ' + (r.city_slug || ''),
          run: function () { afterRoute('#/straznicy', function () { return decFocus('watch', r.id); }); } });
      });
    }
    // sekcje panelu — z bocznego paska (te same linki co na telefonie)
    [].forEach.call(document.querySelectorAll('#adNav a[data-nav], #adNav a[target]'), function (a) {
      var label = (a.querySelector('span') || a).textContent.trim(), href = a.getAttribute('href');
      add({ id: 'sec:' + (a.getAttribute('data-nav') || href), group: 'Sekcje', icon: a.target ? IC.ext : IC.sec, label: label + (a.target ? ' ↗' : ''), hint: a.target ? 'nowa karta' : href, kw: 'sekcja ' + href,
        run: function () { if (a.target) window.open(href, '_blank', 'noopener'); else go(href); } });
    });
    add({ id: 'theme', group: 'Sekcje', icon: IC.theme, label: themeNow() === 'dark' ? 'Jasny motyw' : 'Ciemny motyw', hint: 'zapamiętane na czas sesji', kw: 'motyw ciemny jasny dark light',
      run: function () { setTheme(themeNow() === 'dark' ? 'light' : 'dark'); } });
    return items;
  }

  // ── okno palety ──
  var pal = { el: null, q: null, list: null, items: [], shown: [], i: 0, opener: null, open: false };
  function build() {
    if (pal.el) return;
    var el = document.createElement('div'); el.className = 'pal-shade'; el.id = 'palShade'; el.hidden = true;
    el.innerHTML = '<div class="pal" role="dialog" aria-modal="true" aria-labelledby="palH"><h2 id="palH" class="adm-sr">Szukaj i polecenia</h2>' +
      '<div class="pal__in">' + IC.search + '<input id="palQ" type="text" role="combobox" aria-expanded="true" aria-controls="palList" aria-autocomplete="list" aria-activedescendant="" ' +
      'placeholder="Trasa, przystanek, wersja, flaga, decyzja… albo polecenie" autocomplete="off" spellcheck="false" autocapitalize="off"><kbd class="pal__esc">Esc</kbd></div>' +
      '<ol id="palList" class="pal__list" role="listbox" aria-label="Wyniki"></ol>' +
      '<p class="pal__foot"><kbd>↑</kbd><kbd>↓</kbd> wybór · <kbd>Enter</kbd> wykonaj · <kbd>Esc</kbd> zamknij</p></div>';
    document.body.appendChild(el);
    pal.el = el; pal.q = el.querySelector('#palQ'); pal.list = el.querySelector('#palList');
    pal.q.addEventListener('input', function () { pal.i = 0; render(); });
    pal.q.addEventListener('keydown', onKey);
    el.addEventListener('keydown', function (e) { if (e.key === 'Tab') { e.preventDefault(); move(e.shiftKey ? -1 : 1); } });
    el.addEventListener('click', function (e) {
      var li = e.target.closest('.pal__it[data-i]');
      if (li) { pal.i = +li.getAttribute('data-i'); run(); return; }
      if (e.target === el) close();
    });
    pal.list.addEventListener('mousemove', function (e) { var li = e.target.closest('.pal__it[data-i]'); if (li && +li.getAttribute('data-i') !== pal.i) { pal.i = +li.getAttribute('data-i'); paint(); } });
  }
  function recent() { return ss.get(RECENT) || []; }
  function remember(id) { var r = recent().filter(function (x) { return x !== id; }); r.unshift(id); ss.set(RECENT, r.slice(0, MAX_RECENT)); }
  function render() {
    var q = pal.q.value.trim(), by = {}, order = [], out = [], CAP = q ? 7 : 6;
    if (!q) {
      var rec = recent(), seen = {};
      rec.forEach(function (id) { var it = pal.items.filter(function (x) { return x.id === id; })[0]; if (it && !seen[id]) { seen[id] = 1; out.push({ g: 'Ostatnio używane', it: it }); } });
    }
    pal.items.forEach(function (it) {
      if (!q && it.hidden) return;
      var s = q ? score(q, it.kw) : 1; if (!s) return;
      if (!by[it.group]) { by[it.group] = []; order.push(it.group); }
      by[it.group].push({ it: it, s: s });
    });
    if (q) {   // grupy w kolejności najlepszego trafienia, w grupie od najlepszego
      order.forEach(function (g) { by[g].sort(function (a, b) { return b.s - a.s; }); });
      order.sort(function (a, b) { return by[b][0].s - by[a][0].s; });
    }
    order.forEach(function (g) { by[g].slice(0, CAP).forEach(function (x) { out.push({ g: g, it: x.it }); }); });
    pal.shown = out;
    if (pal.i >= out.length) pal.i = 0;
    var h = '', last = null;
    out.forEach(function (x, i) {
      if (x.g !== last) { h += '<li class="pal__g" role="presentation">' + esc(x.g) + '</li>'; last = x.g; }
      h += '<li class="pal__it' + (x.it.danger ? ' pal__it--danger' : '') + '" role="option" id="pal-opt-' + i + '" data-i="' + i + '" aria-selected="false"><span class="pal__ic">' + x.it.icon + '</span>' +
        '<span class="pal__t"><span class="pal__l">' + esc(x.it.label) + '</span>' + (x.it.hint ? '<span class="pal__h">' + esc(x.it.hint) + '</span>' : '') + '</span><kbd class="pal__k" aria-hidden="true">↵</kbd></li>';
    });
    pal.list.innerHTML = h || '<li class="pal__none" role="presentation">Nic nie pasuje do „' + esc(q) + '”.</li>';
    paint();
  }
  function paint() {
    var act = null;
    [].forEach.call(pal.list.querySelectorAll('.pal__it'), function (li) { var on = +li.getAttribute('data-i') === pal.i; li.setAttribute('aria-selected', String(on)); li.classList.toggle('is-on', on); if (on) act = li; });
    pal.q.setAttribute('aria-activedescendant', act ? act.id : '');
    if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
  }
  function move(d) { var n = pal.shown.length; if (!n) return; pal.i = (pal.i + d + n) % n; paint(); }
  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Home' && pal.shown.length) { e.preventDefault(); pal.i = 0; paint(); }
    else if (e.key === 'End' && pal.shown.length) { e.preventDefault(); pal.i = pal.shown.length - 1; paint(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  }
  function run() {
    var x = pal.shown[pal.i]; if (!x) return;
    remember(x.it.id);
    close();
    try { x.it.run(); } catch (err) { console.warn('[paleta]', err && err.message); }
  }
  function open(opener) {
    build();
    if (pal.open) { pal.q.focus(); pal.q.select(); return; }
    pal.opener = opener || document.activeElement;
    pal.items = buildIndex(); pal.i = 0;
    pal.el.hidden = false; pal.open = true; document.body.classList.add('has-pal');
    pal.q.value = ''; render(); pal.q.focus();
  }
  function close() {
    if (!pal.open) return;
    pal.el.hidden = true; pal.open = false; document.body.classList.remove('has-pal');
    var o = pal.opener; pal.opener = null;
    if (o && o.focus && document.contains(o)) o.focus({ preventScroll: true });
  }
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); pal.open ? close() : open(); return; }
    if (e.key === 'Escape' && pal.open) { e.preventDefault(); e.stopPropagation(); close(); }
  }, true);
  var btn = document.getElementById('palBtn');
  if (btn) btn.addEventListener('click', function () { open(btn); });
  window.AdmPalette = { open: open, close: close, setTheme: setTheme, theme: themeNow, index: buildIndex };
})();
