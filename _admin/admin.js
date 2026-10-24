/* Quolino admin — kolejka szkiców wycieczek do zatwierdzenia.
 *
 * Dostęp: tunel SSH (http://localhost:8088/_admin/) albo jednorazowy link z kluczem — patrz _admin/README.md.
 *   panel → /api/ → PostgREST z rolą quolino_admin (schemat admin)
 * ?demo=1 — dane testowe z demo.json, nic nie trafia do bazy.
 *
 * v3 (2026-10-16): arkusz szkicu pokazuje WSZYSTKIE pola; przy każdym polu formularz uwag dla Hermesa
 * (tabela admin.draft_comments — kontrakt w README §Uwagi), wersje każdego przystanku liczone z historii
 * city_versions, przyklejone menu przystanków z liczbą otwartych uwag.
 * v5 (2026-10-18): lista jak sklep z filtrami (kraj, status, uwagi, skorowidz A–Z, wyszukiwarka), grupy krajów bez regionów;
 * wycieczka w zakładkach — jedna zakładka na wersję (najnowsza pierwsza). Na zakładce wersji widać uwagi wysłane do TEJ wersji
 * (draft_comments.city_version); starsze wersje tylko do podglądu, uwagi wysyła się wyłącznie w najnowszym szkicu.
 */
(function () {
  'use strict';

  var API = '/api';
  var DEMO = /[?&]demo=1\b/.test(location.search);
  var ICONS = '../media/icons/';
  var OUTBOX = 'adm.outbox';          // uwagi, których API nie przyjęło (wyślemy przy następnym wczytaniu)
  var QUE = { parking: 'parking', monument: 'monument', church: 'church', museum: 'museum', house: 'house',
    viewpoint: 'viewpoint-city', 'viewpoint-city': 'viewpoint-city', 'viewpoint-nature': 'viewpoint-nature',
    restaurant: 'restaurant', icecream: 'icecream', sweets: 'sweets', photo: 'photo', street: 'street',
    castle: 'castle', synagogue: 'synagogue' };
  var SRC = { manual: 'ręcznie', import: 'import', pipeline: 'Hermes', restore: 'przywrócenie', migration: 'migracja' };
  var VST = { draft: 'szkic', published: 'opublikowana', archived: 'archiwum', rejected: 'odrzucona' };
  var CST = { 'new': 'zapisana — do wysłania', sent: 'wysłana do poprawki', seen: 'Hermes poprawia', done: 'poprawione', rejected: 'odrzucona', local: 'czeka na połączenie' };
  var RST = { proposed: 'do zatwierdzenia', active: 'obowiązuje', retired: 'wyłączona' };
  var RSCOPE = { quest: 'misje dzieci', opis: 'opisy', fakty: 'fakty', praktyczne: 'informacje praktyczne', 'plan-dnia': 'plan dnia', ton: 'ton i styl', struktura: 'struktura wycieczki', inne: 'inne' };
  var DUR = { half_day: 'pół dnia', full_day: 'cały dzień' };

  var CITY_FIELDS = [['duration_type', 'Czas', durLabel], ['duration_hours', 'Godziny'], ['bandana_color', 'Kolor drużyny'],
    ['hero_image', 'Grafika hero'], ['route_url', 'Trasa (link)'], ['travel_mode', 'Tryb trasy'], ['region_slug', 'Region']];
  var CITY_TR = [['title', 'Tytuł'], ['subtitle', 'Podtytuł'], ['lead', 'Wstęp'], ['good_to_know', 'Dobrze wiedzieć'], ['local_food', 'Lokalne jedzenie']];
  var STOP_TR = [['name', 'Nazwa'], ['desc_paragraphs', 'Opis'], ['kids_box', 'Misja dla dzieci'], ['hint', 'Podpowiedź'], ['local_flavor', 'Ciekawostka']];
  var STOP_FIELDS = [['category', 'Kategoria'], ['time_label', 'Godzina'], ['visit_duration', 'Czas zwiedzania', minLabel],
    ['price', 'Cena'], ['year_built', 'Rok'], ['maps_query', 'Mapa'], ['optional', 'Opcjonalny', yesNo], ['sunset_spot', 'Na zachód słońca', yesNo], ['lat', 'Szerokość geogr.'], ['lon', 'Długość geogr.']];
  var VER_FIELDS = [['stop_number', 'Numer']].concat(STOP_FIELDS);   // do liczenia wersji punktu liczy się też numer

  var SITE = 'https://quolino.com';   // podgląd szkicu na stronie: city.html?draft=<klucz>&v=N (jak draft-lib.mjs previewUrl)
  var state = { trips: null, demo: null, current: null, comments: [], poll: null, trip: null, versions: null, tabVersion: null, readOnly: false, drafts: {} };
  var $d = document.getElementById('detail');
  var $count = document.getElementById('count');

  var DEMO_RULES = [
    { id: 1, rule: 'Misja dla dziecka zaczyna się od czasownika i da się ją wykonać bez kupowania biletu.', why: 'Uwaga JP do Perugii: misja wymagała wejścia do muzeum.', scope: 'quest', field: 'stop.kids_box', status: 'proposed', proposed_by: 'hermes', uses: 0, source_comment_ids: [3, 7], created_at: '2026-10-17T09:00:00Z' },
    { id: 2, rule: 'Nie podajemy cen ani godzin bez źródła — wtedy „sprawdź na miejscu”.', scope: 'fakty', status: 'active', proposed_by: 'jp', uses: 12, source_comment_ids: [], created_at: '2026-10-10T09:00:00Z' }
  ];

  // ── dane ─────────────────────────────────────────────
  // Sesja panelu (bramka admin-gate) wygasa po 30 min bez ruchu albo 2 h od wejścia — wtedy bramka odsyła przekierowanie.
  // Wykrywamy to od razu (redirect: 'manual'), zamiast czekać na błąd sieci; każde zapytanie ma limit czasu.
  var SESSION_MSG = 'Sesja panelu wygasła (30 min bez ruchu albo 2 h od wejścia). Uwagi są bezpieczne w tej przeglądarce. ' +
    'Napisz „link” na #admin, wejdź z nowego linku w tej samej przeglądarce i kliknij jeszcze raz.';
  function api(path, opts) {
    if (DEMO) return demo(path, opts);
    opts = opts || {};
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, opts.timeout || 20000) : null;
    return fetch(API + path, {
      method: opts.method || 'GET',
      redirect: 'manual',
      credentials: 'same-origin',
      signal: ctl ? ctl.signal : undefined,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Prefer': 'return=representation' },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      if (r.type === 'opaqueredirect' || (r.status >= 300 && r.status < 400)) { var se = new Error(SESSION_MSG); se.session = true; throw se; }
      return r.text().then(function (t) {
        var j = null;
        try { j = t ? JSON.parse(t) : null; } catch (e) {
          if (/<html|<!doctype/i.test(t)) { var se2 = new Error(SESSION_MSG); se2.session = true; throw se2; }
          throw new Error('API nie odpowiada (HTTP ' + r.status + ', brak JSON)');
        }
        if (!r.ok) throw new Error((j && (j.message || j.hint)) || ('HTTP ' + r.status));
        return j;
      });
    }, function (e) {
      if (e && e.name === 'AbortError') throw new Error('Serwer nie odpowiedział w 20 s. Uwagi są bezpieczne — spróbuj za chwilę.');
      throw new Error('Brak połączenia z panelem (' + (e && e.message || 'sieć') + '). Uwagi są bezpieczne — sprawdź internet i kliknij jeszcze raz.');
    }).then(function (v) { if (timer) clearTimeout(timer); return v; }, function (e) { if (timer) clearTimeout(timer); throw e; });
  }

  function demo(path, opts) {
    var load = state.demo ? Promise.resolve(state.demo) : fetch('demo.json').then(function (r) { return r.json(); }).then(function (d) {
      d.comments = d.comments || [
        { id: 1, city_slug: 'spello', city_version: 1, stop_key: 'porta-consolare', field: 'kids_box', field_label: 'Misja dla dzieci', stop_version: 1,
          body: 'Misja za trudna dla 6-latka — uprość liczenie.', status: 'done', hermes_reply: 'Uproszczone w v2: liczymy tylko posągi nad bramą.', created_at: '2026-10-06T18:20:00Z' },
        { id: 2, city_slug: 'spello', city_version: 2, stop_key: 'belvedere-panoramico', field: 'time_label', field_label: 'Godzina', stop_version: 2,
          body: 'Zachód słońca w październiku ok. 18:30 — przesuń na 17:45.', status: 'seen', hermes_reply: null, created_at: '2026-10-16T09:02:00Z' }
      ];
      demoMore(d);
      state.demo = d; return d;
    });
    return load.then(function (d) {
      if (/^\/admin_trips/.test(path)) return demoTrips(d);
      if (path === '/rpc/admin_preview_token') return null;
      if (path === '/admin_queue') return d.queue.slice();
      if (/^\/admin_versions\?status=eq\.draft/.test(path)) return d.versions.filter(function (v) { return v.status === 'draft'; })
        .map(function (v) { return { city_slug: v.city_slug, version: v.version, region: ((v.content || {}).city || {}).region_slug || null }; });
      var m = path.match(/^\/admin_versions\?city_slug=eq\.([^&]+)/);
      if (m) return d.versions.filter(function (v) { return v.city_slug === decodeURIComponent(m[1]); })
        .map(function (v) { return { city_slug: v.city_slug, version: v.version, status: v.status, source: v.source || 'manual', note: v.note || null, created_at: v.created_at || '2026-10-0' + v.version + 'T10:00:00Z', content: v.content }; });
      m = path.match(/^\/draft_comments\?city_slug=eq\.([^&]+)/);
      if (m && (!opts || !opts.method)) return d.comments.filter(function (c) { return c.city_slug === decodeURIComponent(m[1]); });
      if (path === '/draft_comments' && opts && opts.method === 'POST') {
        var row = Object.assign({ id: Date.now(), status: 'new', hermes_reply: null, created_at: new Date().toISOString() }, opts.body);
        d.comments.push(row);
        return new Promise(function (res) { setTimeout(function () { res([row]); }, 250); });
      }
      if (path === '/rpc/admin_send_comments') {
        var n = 0;
        d.comments.forEach(function (c) { if (c.city_slug === opts.body.p_slug && c.status === 'new') { c.status = 'sent'; n++; } });
        return new Promise(function (res) { setTimeout(function () { res({ request_id: Date.now(), sent: n }); }, 300); });
      }
      if (/^\/editorial_rules/.test(path)) { d.rules = d.rules || DEMO_RULES; return d.rules; }
      if (/^\/rpc\/admin_rule_(decide|add)$/.test(path)) {
        d.rules = d.rules || DEMO_RULES;
        var rb = opts.body;
        if (/add$/.test(path)) d.rules.push({ id: Date.now(), rule: rb.p_rule, scope: rb.p_scope || 'all', status: 'active', proposed_by: 'jp', uses: 0, source_comment_ids: [], created_at: new Date().toISOString() });
        else d.rules.forEach(function (r) { if (r.id === rb.p_id) { r.status = rb.p_status; if (rb.p_rule) r.rule = rb.p_rule; } });
        return Promise.resolve({ ok: true });
      }
      if (/^\/rpc\/admin_(approve|reject)$/.test(path)) {
        var b = opts.body;
        d.queue = d.queue.filter(function (q) { return !(q.city_slug === b.p_slug && q.version === b.p_version); });
        return new Promise(function (res) { setTimeout(function () { res({ city_slug: b.p_slug, version: b.p_version, status: /approve/.test(path) ? 'published' : 'rejected' }); }, 500); });
      }
      throw new Error('demo: brak ' + path);
    });
  }

  // dane testowe v5: Spello z trzema wersjami (uwagi wysłane do v2, poprawione w v3) i kilka miast z innych krajów
  function demoMore(d) {
    var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
    var sp = d.versions.filter(function (v) { return v.city_slug === 'spello'; });
    if (sp.length === 2) {
      var v2 = sp[1], v3 = clone(v2);
      v2.status = 'archived'; v2.note = 'Cały dzień zamiast pół, Belvedere na zachód słońca'; v2.source = 'manual'; v2.created_at = '2026-10-16T08:12:00Z';
      v3.version = 3; v3.status = 'draft'; v3.source = 'revise'; v3.note = 'Poprawki z uwag #2, #3'; v3.created_at = '2026-10-18T07:40:00Z';
      (v3.content.stops || []).forEach(function (s) { if (s.stop_key === 'belvedere-panoramico') s.time_label = '17:45'; });
      d.versions.push(v3);
      d.queue.forEach(function (q) { if (q.city_slug === 'spello') { q.version = 3; q.note = v3.note; q.created_at = v3.created_at; } });
      d.comments.forEach(function (c) { if (c.stop_key && c.field && c.field.indexOf('.') < 0) c.field = 'stop.' + c.field; });   // jak w bazie: stop.<kolumna>
      d.comments[0].resolved_in_version = 2;
      d.comments[1].status = 'done'; d.comments[1].hermes_reply = 'Przesunięte na 17:45.'; d.comments[1].resolved_in_version = 3;
      d.comments.push({ id: 3, city_slug: 'spello', city_version: 2, stop_key: null, field: 'city.lead', field_label: 'Wstęp', stop_version: null,
        body: 'Wstęp za długi — dwa zdania wystarczą.', status: 'done', hermes_reply: 'Skrócone do dwóch zdań.', resolved_in_version: 3, created_at: '2026-10-16T09:05:00Z' });
    }
    var base = sp[0];
    [['assisi', 'Asyż', 'it', 'umbria', 'published'], ['urbino', 'Urbino', 'it', 'marche', 'published'], ['ancona', 'Ancona', 'it', 'marche', 'draft'],
      ['krakow', 'Kraków', 'pl', 'malopolska', 'published'], ['wieliczka', 'Wieliczka', 'pl', 'malopolska', 'draft'],
      ['zakopane', 'Zakopane', 'pl', 'malopolska', 'rejected'], ['rovinj', 'Rovinj', 'hr', 'istria', 'published']].forEach(function (x, i) {
      if (!base || d.versions.some(function (v) { return v.city_slug === x[0]; })) return;
      var v = clone(base);
      v.city_slug = x[0]; v.version = 1; v.status = x[4]; v.source = 'import'; v.note = null; v.created_at = '2026-10-1' + i + 'T10:00:00Z';
      v.content.city.slug = x[0]; v.content.city.country = x[2]; v.content.city.region_slug = x[3]; v.content.city.region = x[3];
      (v.content.city_translations || []).forEach(function (t) { if (t.lang === 'pl') t.title = x[1]; });
      d.versions.push(v);
      if (x[4] === 'draft') d.queue.push({ city_slug: x[0], version: 1, source: 'import', note: 'Nowa wycieczka', created_at: v.created_at,
        stops_count: (v.content.stops || []).length, duration: 'half_day', city_name: x[1], bandana_color: v.content.city.bandana_color,
        published_version: null, published_stops_count: null, published_duration: null });
    });
  }
  function demoTrips(d) {
    var by = {};
    d.versions.forEach(function (v) { (by[v.city_slug] = by[v.city_slug] || []).push(v); });
    return Object.keys(by).map(function (k) {
      var vs = by[k].sort(function (a, b) { return a.version - b.version; }), l = vs[vs.length - 1], c = l.content.city || {};
      var pick = function (st) { var r = vs.filter(function (v) { return v.status === st; }).pop(); return r ? r.version : null; };
      var cm = d.comments.filter(function (x) { return x.city_slug === k; });
      return { city_slug: k, city_name: trOf(l.content.city_translations, 'pl').title || k, country: c.country, region_slug: c.region_slug,
        bandana_color: c.bandana_color, latest_version: l.version, latest_status: l.status, latest_at: l.created_at || '2026-10-0' + l.version + 'T10:00:00Z',
        stops_count: (l.content.stops || []).length, draft_version: pick('draft'), published_version: pick('published'), versions_count: vs.length,
        comments_working: cm.filter(function (x) { return x.status === 'sent' || x.status === 'seen'; }).length,
        comments_unsent: cm.filter(function (x) { return x.status === 'new'; }).length };
    });
  }

  // ── pomocnicze ───────────────────────────────────────
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function durLabel(v) { return DUR[v] || v; }
  function minLabel(v) { return /^\d+$/.test(String(v)) ? v + ' min' : v; }
  function yesNo(v) { return v === true ? 'tak' : v === false ? 'nie' : v; }
  function show(v, fmt) {
    if (v == null || v === '') return '';
    if (Array.isArray(v)) return v.join('\n\n');
    return String(fmt ? fmt(v) : v);
  }
  function norm(v) { return v == null || v === '' || (Array.isArray(v) && !v.length) ? null : v; }
  function same(a, b) { return JSON.stringify(norm(a)) === JSON.stringify(norm(b)); }
  function when(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  }
  function isLight(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return false;
    var n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 165;
  }
  function icon(cat) { var f = QUE[cat || 'monument'] || 'monument'; return ICONS + 'icon-' + f + '-128.webp'; }
  function num(n) { return n < 10 ? '0' + n : String(n); }
  function slug(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* prywatne okno */ } }
  var CHEV = '<svg class="adm-chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
  var SEND = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z"/></svg>';
  var PIN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>';

  function trOf(list, lang, key, id) {
    return (list || []).filter(function (t) { return t.lang === lang && (key == null || t[key] === id); })[0] || {};
  }
  function langsOf(list, key, id) {
    var s = {}; (list || []).forEach(function (t) { if (key == null || t[key] === id) s[t.lang] = 1; });
    return Object.keys(s).sort();
  }
  // klucz przystanku stały między wersjami: stop_key, a gdy go brak — nazwa PL (id zmienia się przy przeładowaniu)
  function stopKey(s, trs) {
    if (s.stop_key) return s.stop_key;
    var n = trOf(trs, 'pl', 'stop_id', s.id).name;
    return n ? 'n-' + slug(n) : 'id-' + s.id;
  }

  // ── lista wycieczek: filtry jak w sklepie (JP 2026-10-18) ──
  // Kraj (jak fora na Discordzie: jedno forum = jeden kraj, bez poziomu regionu), status, uwagi, skorowidz A–Z i wyszukiwarka.
  // Wyniki: grupy krajów, w kraju alfabetycznie. Źródło: admin.admin_trips (SQL 2026-10-18-admin-wersje.sql);
  // bez tego widoku lista składa się z admin_queue + admin_versions (nazwy miast bez szkicu wtedy ze sluga).
  var FILTERS = 'adm.filters';          // stan filtrów (tylko wygoda; nowy klucz, adm.outbox bez zmian)
  var COUNTRY_PL = { it: 'Włochy', pl: 'Polska', hr: 'Chorwacja', fr: 'Francja', de: 'Niemcy', at: 'Austria', es: 'Hiszpania',
    pt: 'Portugalia', si: 'Słowenia', cz: 'Czechy', sk: 'Słowacja', gr: 'Grecja', ch: 'Szwajcaria', sm: 'San Marino', va: 'Watykan', mt: 'Malta' };
  var TST = { draft: 'Do zatwierdzenia', published: 'Opublikowane', rejected: 'Odrzucone', archived: 'Archiwum' };
  var TST_ORDER = ['draft', 'published', 'rejected', 'archived'];
  var FLAGS = { working: 'Hermes poprawia', unsent: 'Niewysłane uwagi' };
  // Wytyczne (JP 2026-10-24): „nowe” = najnowsza wersja powstała w nowym procesie (Gemini research → szkic → kontrola),
  // znacznik content.workflow = 'v2' ustawia pipeline przy zapisie wersji. Wszystko bez znacznika = stare wytyczne (archiwum).
  var STD = { v2: 'Nowe wytyczne', old: 'Stare wytyczne (archiwum)' };
  var STD_ORDER = ['v2', 'old'];
  var SORTS = { new: 'Najnowsze zmiany', old: 'Najstarsze zmiany', az: 'Kraj, potem A–Z' };
  var ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  var $browse = document.getElementById('browse');
  var $res = document.getElementById('results');
  var $abc = document.getElementById('abc');
  var $fq = document.getElementById('fq');
  var $fBox = document.getElementById('fBox');
  var listScroll = 0;

  function fold(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l'); }
  function countryName(c) {
    if (!c) return 'Bez kraju';
    if (COUNTRY_PL[c]) return COUNTRY_PL[c];
    try { var n = new Intl.DisplayNames(['pl'], { type: 'region' }).of(c.toUpperCase()); if (n && n !== c.toUpperCase()) return n; } catch (e) { /* stara przeglądarka */ }
    return c.toUpperCase();
  }
  function titleCase(s) { return String(s || '').split('-').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' '); }
  function letterOf(name) { var ch = fold(name).charAt(0).toUpperCase(); return /[A-Z]/.test(ch) ? ch : '#'; }
  function dayMonth(iso) { if (!iso) return ''; var d = new Date(iso); return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2); }
  function plWyc(n) { var d = n % 10, t = n % 100; return n + (n === 1 ? ' wycieczka' : (d >= 2 && d <= 4 && (t < 12 || t > 14)) ? ' wycieczki' : ' wycieczek'); }
  function plWer(n) { var d = n % 10, t = n % 100; return n + (n === 1 ? ' wersja' : (d >= 2 && d <= 4 && (t < 12 || t > 14)) ? ' wersje' : ' wersji'); }
  function outboxBy() { var m = {}; (lsGet(OUTBOX) || []).forEach(function (c) { m[c.city_slug] = (m[c.city_slug] || 0) + 1; }); return m; }

  function filters() {
    var f = state.f;
    if (!f) {
      var s = lsGet(FILTERS) || {};
      f = state.f = { countries: Array.isArray(s.countries) ? s.countries : [], statuses: Array.isArray(s.statuses) ? s.statuses : ['draft'],
        flags: Array.isArray(s.flags) ? s.flags : [], std: Array.isArray(s.std) ? s.std : [], sort: SORTS[s.sort] ? s.sort : 'new', letter: typeof s.letter === 'string' ? s.letter : '', q: typeof s.q === 'string' ? s.q : '' };
    }
    return f;
  }
  function saveFilters() { lsSet(FILTERS, state.f); }

  function tripOf(r, box) {
    var t = { slug: r.city_slug, name: r.city_name || titleCase(r.city_slug), country: r.country ? String(r.country).toLowerCase() : '',
      region: r.region_slug || '', color: r.bandana_color || '#0B4EA2', latest: r.latest_version, latestStatus: r.latest_status,
      latestAt: r.latest_at, stops: r.stops_count, draft: r.draft_version, published: r.published_version,
      versions: r.versions_count || 1, std: r.workflow === 'v2' ? 'v2' : 'old', working: r.comments_working || 0, unsent: (r.comments_unsent || 0) + (box[r.city_slug] || 0) };
    t.status = t.draft != null ? 'draft' : t.published != null ? 'published' : (t.latestStatus || 'archived');
    t.letter = letterOf(t.name);
    return t;
  }
  // bez widoku admin_trips: lista z kolejki szkiców + lekkich wierszy wszystkich wersji (ścieżki JSON w select, bez treści)
  function tripsFallback() {
    return Promise.all([
      api('/admin_queue'),
      api('/admin_versions?select=city_slug,version,status,created_at,country:content->city->>country,region:content->city->>region_slug,color:content->city->>bandana_color,workflow:content->>workflow&order=version.asc'),
      api('/draft_comments?select=city_slug,city_version,status').catch(function () { return []; })
    ]).then(function (res) {
      var by = {}, names = {}, stops = {};
      (res[0] || []).forEach(function (q) { names[q.city_slug] = q.city_name; stops[q.city_slug] = q.stops_count; });
      (res[1] || []).forEach(function (v) {
        var r = by[v.city_slug] = by[v.city_slug] || { city_slug: v.city_slug, versions_count: 0, comments_working: 0, comments_unsent: 0 };
        r.versions_count++;
        if (r.latest_version == null || v.version > r.latest_version) {
          r.latest_version = v.version; r.latest_status = v.status; r.latest_at = v.created_at;
          r.country = v.country; r.region_slug = v.region; r.bandana_color = v.color; r.workflow = v.workflow;
        }
        if (v.status === 'draft' && (r.draft_version == null || v.version > r.draft_version)) r.draft_version = v.version;
        if (v.status === 'published') r.published_version = v.version;
      });
      (res[2] || []).forEach(function (c) {
        var r = by[c.city_slug]; if (!r) return;
        if (c.status === 'sent' || c.status === 'seen') r.comments_working++;
        else if (c.status === 'new') r.comments_unsent++;
      });
      return Object.keys(by).map(function (k) { var r = by[k]; r.city_name = names[k] || null; r.stops_count = stops[k] != null ? stops[k] : null; return r; });
    });
  }
  function loadTrips() {
    return api('/admin_trips?order=city_slug.asc').then(function (rows) { state.tripsApi = true; return rows; },
      function (e) { if (e.session) throw e; state.tripsApi = false; return tripsFallback(); })
      .then(function (rows) {
        var box = outboxBy();
        state.trips = (rows || []).map(function (r) { return tripOf(r, box); });
        var f = filters(), have = {};
        state.trips.forEach(function (t) { have['c:' + t.country] = 1; have['s:' + t.status] = 1; });
        f.countries = f.countries.filter(function (c) { return have['c:' + c]; });     // kraj, którego już nie ma, nie chowa wszystkiego
        if (f.statuses.length && !f.statuses.some(function (s) { return have['s:' + s]; })) f.statuses = [];
        $count.textContent = state.trips.filter(function (t) { return t.status === 'draft'; }).length;
        renderList();
      }).catch(function (e) {
        $count.textContent = '!';
        $res.innerHTML = '<p class="adm-empty">Nie mogę połączyć się z API admina (' + esc(e.message) + ').<br><br>' +
          'Instrukcja wejścia w <code>_admin/README.md</code>. Podgląd na danych testowych: <a href="?demo=1">?demo=1</a>.</p>';
      });
  }

  function match(t, f, skip) {
    if (skip !== 'countries' && f.countries.length && f.countries.indexOf(t.country) < 0) return false;
    if (skip !== 'statuses' && f.statuses.length && f.statuses.indexOf(t.status) < 0) return false;
    if (skip !== 'std' && f.std.length && f.std.indexOf(t.std) < 0) return false;
    if (skip !== 'flags' && f.flags.length && !f.flags.some(function (k) { return t[k] > 0; })) return false;
    if (skip !== 'letter' && f.letter && t.letter !== f.letter) return false;
    if (skip !== 'q' && f.q && fold(t.name + ' ' + t.slug).indexOf(fold(f.q.trim())) < 0) return false;
    return true;
  }
  function facet(group, keys, label, f) {
    var cnt = {};
    state.trips.forEach(function (t) {
      if (!match(t, f, group)) return;
      if (group === 'flags') keys.forEach(function (k) { if (t[k] > 0) cnt[k] = (cnt[k] || 0) + 1; });
      else { var k = group === 'countries' ? t.country : group === 'std' ? t.std : t.status; cnt[k] = (cnt[k] || 0) + 1; }
    });
    return keys.map(function (k) {
      var on = f[group].indexOf(k) > -1, n = cnt[k] || 0;
      return '<label class="adm-check' + (n || on ? '' : ' is-empty') + '"><input type="checkbox" data-fg="' + group + '" value="' + esc(k) + '"' + (on ? ' checked' : '') + '>' +
        '<span class="adm-check__t">' + esc(label(k)) + '</span><span class="adm-check__n">' + n + '</span></label>';
    }).join('');
  }
  function renderList() {
    var f = filters(), T = state.trips || [];
    var countries = {}; T.forEach(function (t) { countries[t.country] = 1; });
    var ck = Object.keys(countries).sort(function (a, b) { return !a ? 1 : !b ? -1 : countryName(a).localeCompare(countryName(b), 'pl'); });
    var sk = TST_ORDER.filter(function (s) { return T.some(function (t) { return t.status === s; }); });
    T.forEach(function (t) { if (sk.indexOf(t.status) < 0) sk.push(t.status); });
    var fk = Object.keys(FLAGS).filter(function (k) { return T.some(function (t) { return t[k] > 0; }) || f.flags.indexOf(k) > -1; });
    document.getElementById('fCountry').innerHTML = facet('countries', ck, countryName, f);
    document.getElementById('fStatus').innerHTML = facet('statuses', sk, function (s) { return TST[s] || VST[s] || s; }, f);
    document.getElementById('fStd').innerHTML = facet('std', STD_ORDER, function (k) { return STD[k]; }, f);
    var $so = document.getElementById('fSort'); if ($so.value !== f.sort) $so.value = f.sort;
    document.getElementById('fFlags').innerHTML = facet('flags', fk, function (k) { return FLAGS[k]; }, f);
    document.getElementById('fFlagsBox').hidden = !fk.length;
    if ($fq.value !== f.q) $fq.value = f.q;

    // skorowidz: litera bez miejscowości (przy pozostałych filtrach) jest wyłączona
    var lc = {}; T.forEach(function (t) { if (match(t, f, 'letter')) lc[t.letter] = (lc[t.letter] || 0) + 1; });
    var letters = ABC.slice(); T.forEach(function (t) { if (letters.indexOf(t.letter) < 0) letters.push(t.letter); });
    $abc.innerHTML = '<button type="button" class="adm-abc__b adm-abc__all" data-letter="" aria-pressed="' + (!f.letter) + '">Wszystkie</button>' +
      letters.map(function (L) {
        var n = lc[L] || 0, on = f.letter === L;
        return '<button type="button" class="adm-abc__b" data-letter="' + esc(L) + '" aria-pressed="' + on + '"' + (n || on ? '' : ' disabled') +
          ' aria-label="' + esc(L) + ': ' + plWyc(n) + '">' + esc(L) + '</button>';
      }).join('');

    var act = f.countries.length + f.statuses.length + f.std.length + f.flags.length + (f.letter ? 1 : 0) + (f.q.trim() ? 1 : 0);
    var $a = document.getElementById('fActive'); $a.textContent = act; $a.classList.toggle('is-zero', !act);
    document.getElementById('fClear').hidden = !act;

    var shown = T.filter(function (t) { return match(t, f); });
    document.getElementById('rCount').textContent = plWyc(shown.length) + (shown.length !== T.length ? ' z ' + T.length : '');
    if (!T.length) { $res.innerHTML = '<p class="adm-empty">Brak wycieczek w bazie.</p>'; return; }
    if (!shown.length) { $res.innerHTML = '<p class="adm-empty">Żadna wycieczka nie pasuje do filtrów. <button type="button" class="adm-linkbtn" data-fclear>Wyczyść filtry</button></p>'; return; }
    if (f.sort !== 'az') {
      var dir = f.sort === 'old' ? 1 : -1;
      shown.sort(function (a, b) { return dir * ((Date.parse(a.latestAt) || 0) - (Date.parse(b.latestAt) || 0)) || a.name.localeCompare(b.name, 'pl'); });
      $res.innerHTML = '<div class="adm-cards">' + shown.map(function (t) { return cardHtml(t, true); }).join('') + '</div>';
      return;
    }
    var groups = {};
    shown.forEach(function (t) { (groups[t.country] = groups[t.country] || []).push(t); });
    $res.innerHTML = ck.filter(function (c) { return groups[c]; }).map(function (c) {
      var list = groups[c].sort(function (a, b) { return a.name.localeCompare(b.name, 'pl'); });
      return '<section class="adm-cgroup" aria-label="' + esc(countryName(c)) + '"><h3 class="adm-cgroup__h">' + esc(countryName(c)) +
        ' <b class="adm-n">' + list.length + '</b></h3><div class="adm-cards">' + list.map(function (t) { return cardHtml(t, false); }).join('') + '</div></section>';
    }).join('');
  }
  function cardHtml(t, byDate) {
    var chip = t.status === 'draft'
      ? '<span class="adm-chip ' + (t.published == null ? 'adm-chip--new">nowa · szkic v' : 'adm-chip--chg">zmiana · szkic v') + esc(t.draft) + '</span>'
      : t.status === 'published' ? '<span class="adm-chip adm-chip--new">na stronie v' + esc(t.published) + '</span>'
      : '<span class="adm-chip' + (t.status === 'rejected' ? ' adm-chip--del' : '') + '">' + esc(VST[t.status] || t.status) + '</span>';
    var extra = (t.working ? '<span class="adm-tc__flag">Hermes poprawia: ' + t.working + '</span>' : '') +
      (t.unsent ? '<span class="adm-tc__flag adm-tc__flag--unsent">Niewysłane: ' + t.unsent + '</span>' : '');
    return '<a class="adm-tc" href="#/' + encodeURIComponent(t.slug) + '" style="--team:' + esc(t.color) + '">' +
      '<span class="adm-item__team" aria-hidden="true"></span><span class="adm-tc__body">' +
      '<span class="adm-tc__top"><span class="adm-tc__name">' + esc(t.name) + '</span><span class="adm-tc__ver">v' + esc(t.latest) + '</span></span>' +
      '<span class="adm-tc__meta">' + chip + (byDate ? '<span>' + esc(countryName(t.country)) + '</span>' : '') +
      (t.region ? '<span>' + esc(regionName(t.region)) + '</span>' : '') +
      '<span>' + plWer(t.versions) + '</span><span title="ostatnia wersja">' + esc(byDate ? when(t.latestAt) : dayMonth(t.latestAt)) + '</span>' +
      '<span class="adm-std adm-std--' + t.std + '">' + (t.std === 'v2' ? 'nowe wytyczne' : 'stare wytyczne') + '</span></span>' +
      (extra ? '<span class="adm-tc__flags">' + extra + '</span>' : '') + '</span></a>';
  }
  var REGION_PL = { umbria: 'Umbria', marche: 'Marche', 'emilia-romagna': 'Emilia-Romania', toscana: 'Toskania', lazio: 'Lacjum',
    veneto: 'Wenecja Euganejska', lombardia: 'Lombardia', liguria: 'Liguria', piemonte: 'Piemont', campania: 'Kampania', sicilia: 'Sycylia' };
  function regionName(slug) { return REGION_PL[slug] || titleCase(slug).replace(/ /g, '-'); }

  document.getElementById('fBox').addEventListener('change', function (e) {
    var cb = e.target.closest('input[data-fg]'); if (!cb) return;
    var f = filters(), g = cb.getAttribute('data-fg'), i = f[g].indexOf(cb.value);
    if (cb.checked && i < 0) f[g].push(cb.value); else if (!cb.checked && i > -1) f[g].splice(i, 1);
    saveFilters(); renderList();
  });
  document.getElementById('fSort').addEventListener('change', function (e) { filters().sort = e.target.value; saveFilters(); renderList(); });
  $fq.addEventListener('input', function () { filters().q = $fq.value; saveFilters(); renderList(); });
  $abc.addEventListener('click', function (e) {
    var b = e.target.closest('[data-letter]'); if (!b || b.disabled) return;
    var f = filters(), L = b.getAttribute('data-letter');
    f.letter = f.letter === L ? '' : L;                 // druga litera tego samego = wyłącz
    saveFilters(); renderList();
    var h = document.getElementById('rh'); if (h && h.getBoundingClientRect().top < 0) h.scrollIntoView({ block: 'start' });
  });
  function clearFilters() { state.f = { countries: [], statuses: [], std: [], flags: [], letter: '', q: '', sort: filters().sort }; saveFilters(); renderList(); }
  document.getElementById('fClear').addEventListener('click', clearFilters);
  $res.addEventListener('click', function (e) { if (e.target.closest('[data-fclear]')) clearFilters(); });

  // ── nawigacja: #/ lista, #/<miasto> najnowsza wersja, #/<miasto>/v<N> starsza wersja, #/baza-wiedzy ──
  function showList() {
    clearInterval(state.poll);
    state.current = null; state.trip = null; state.versions = null;
    $d.hidden = true; $d.innerHTML = '';
    if ($browse.hidden) { $browse.hidden = false; window.scrollTo(0, listScroll); if (state.trips) loadTrips(); }   // liczniki uwag mogły się zmienić
    document.title = 'Do zatwierdzenia · Quolino admin';
  }
  function showDetail() {
    if (!$browse.hidden) listScroll = window.scrollY || 0;
    $browse.hidden = true; $d.hidden = false;
  }
  function route() {
    var h = location.hash;
    if (h === '#/baza-wiedzy') { showDetail(); window.scrollTo(0, 0); openRules(); return; }
    var m = /^#\/([^/]+)(?:\/v(\d+))?$/.exec(h);
    if (m) { openTrip(decodeURIComponent(m[1]), m[2] ? +m[2] : null); return; }
    showList();
  }
  window.addEventListener('hashchange', function () { var h = location.hash; if (!h || h === '#' || h.indexOf('#/') === 0) route(); });
  // kotwice w szkicu (#st-…, #send) przewijamy ręcznie — adres zostaje #/<miasto>, więc „wstecz” i odświeżenie działają
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#st-"], a[href="#send"]');
    if (!a) return;
    var el = document.getElementById(a.getAttribute('href').slice(1));
    e.preventDefault();
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ── wycieczka: zakładki wersji (najnowsza pierwsza) ──
  function loadToken(slug) {
    if (DEMO) return Promise.resolve(null);
    return api('/rpc/admin_preview_token', { method: 'POST', body: { p_slug: slug } })
      .then(function (t) { return typeof t === 'string' && t.length >= 24 ? t : null; }, function () { return null; });   // bez SQL: brak linku
  }
  function openTrip(slug, ver) {
    if (state.trip && state.trip.slug === slug && state.versions) { showDetail(); showTab(ver); return; }
    showDetail(); window.scrollTo(0, 0);
    clearInterval(state.poll);
    state.trip = { slug: slug }; state.versions = null; state.current = null; state.drafts = {};
    var known = (state.trips || []).filter(function (t) { return t.slug === slug; })[0];
    $d.innerHTML = '<div class="adm-placeholder"><p>Ładuję ' + esc(known ? known.name : slug) + '…</p></div>';
    Promise.all([
      api('/admin_versions?city_slug=eq.' + encodeURIComponent(slug) + '&select=city_slug,version,status,source,note,created_at,content&order=version.asc'),
      loadComments(slug),
      loadToken(slug)
    ]).then(function (res) {
      if (!state.trip || state.trip.slug !== slug) return;            // JP zdążył przejść gdzie indziej
      var all = (res[0] || []).filter(function (r) { return r.content; }).sort(function (a, b) { return a.version - b.version; });
      if (!all.length) throw new Error('brak wersji tej wycieczki');
      var newest = all[all.length - 1], pub = all.filter(function (r) { return r.status === 'published'; }).pop() || null;
      var c = newest.content.city || {};
      var name = trOf(newest.content.city_translations, 'pl').title || (known && known.name) || titleCase(slug);
      state.versions = all; state.token = res[2];
      state.trip = { slug: slug, name: name, country: String(c.country || (known && known.country) || '').toLowerCase(), region: c.region_slug || '',
        newest: newest.version, published: pub ? pub.version : null };
      state.current = { city_slug: slug, version: newest.version, status: newest.status, city_name: name,
        published_version: pub ? pub.version : null, bandana_color: c.bandana_color };
      document.title = name + ' · Quolino admin';
      $d.innerHTML = '<div class="adm-trip">' +
        '<div class="adm-trip__bar"><a class="qc-btn qc-btn--sm adm-back" href="#/">← Wszystkie wycieczki</a>' +
        '<p class="adm-trip__where">' + esc([countryName(state.trip.country), state.trip.region ? regionName(state.trip.region) : ''].filter(Boolean).join(' · ')) + '</p></div>' +
        '<div class="adm-tabs" role="tablist" aria-label="Wersje wycieczki ' + esc(name) + '" id="vTabs">' + tabsHtml() + '</div>' +
        '<div id="tabPanel" role="tabpanel" tabindex="-1"></div></div>';
      showTab(ver);
      flushOutbox();
      state.poll = setInterval(refreshComments, 30000);   // także w tle: zapytanie co 30 s podtrzymuje sesję panelu (30 min bez ruchu = wylogowanie)
    }).catch(function (e) {
      $d.innerHTML = '<div class="adm-trip__bar"><a class="qc-btn qc-btn--sm adm-back" href="#/">← Wszystkie wycieczki</a></div>' +
        '<div class="adm-placeholder"><p>Nie udało się wczytać wycieczki: ' + esc(e.message) + '</p></div>';
      state.versions = null;
    });
  }
  function verComments(v) { return state.comments.filter(function (c) { return +c.city_version === +v; }); }
  function isSent(c) { return c.status !== 'new' && c.status !== 'local'; }
  function tabsHtml() {
    return state.versions.slice().reverse().map(function (r) {
      var sent = verComments(r.version).filter(isSent).length, cur = r.version === state.tabVersion, newest = r.version === state.trip.newest;
      return '<button type="button" role="tab" class="adm-tab adm-tab--' + esc(r.status) + '" id="tab-v' + r.version + '" data-ver="' + r.version + '" aria-controls="tabPanel"' +
        ' aria-selected="' + cur + '" tabindex="' + (cur ? 0 : -1) + '"><span class="adm-tab__v">v' + r.version + ' · ' + esc(dayMonth(r.created_at)) + '</span>' +
        '<span class="adm-tab__s">' + esc(VST[r.status] || r.status) + (newest ? ' · najnowsza' : '') + '</span>' +
        (sent ? '<b class="adm-n adm-tab__n" title="uwagi wysłane do tej wersji">' + sent + '</b>' : '') + '</button>';
    }).join('');
  }
  function refreshTabs() {
    var t = document.getElementById('vTabs');
    if (!t || !state.versions) return;
    var had = t.contains(document.activeElement);
    t.innerHTML = tabsHtml();
    if (had) { var b = t.querySelector('[aria-selected="true"]'); if (b) b.focus(); }
  }
  // tekst wpisany (bez Entera) w najnowszej wersji nie ginie przy zmianie zakładki
  function keepDrafts() {
    if (state.tabVersion !== (state.trip && state.trip.newest)) return;
    [].forEach.call($d.querySelectorAll('.adm-cm'), function (box) {
      var ta = box.querySelector('textarea'); if (!ta) return;
      var k = ck(box.getAttribute('data-stop') || null, box.getAttribute('data-field') || null);
      if (ta.value) state.drafts[k] = ta.value; else delete state.drafts[k];
    });
  }
  function restoreDrafts() {
    [].forEach.call($d.querySelectorAll('.adm-cm'), function (box) {
      var ta = box.querySelector('textarea'), v = state.drafts[ck(box.getAttribute('data-stop') || null, box.getAttribute('data-field') || null)];
      if (ta && v) { ta.value = v; autosize(ta); }
    });
  }
  function showTab(ver) {
    var all = state.versions, T = state.trip;
    if (!all) return;
    var row = all.filter(function (r) { return r.version === ver; })[0] || all[all.length - 1];
    keepDrafts();
    state.tabVersion = row.version;
    var isNewest = row.version === T.newest;
    try { history.replaceState(null, '', '#/' + encodeURIComponent(T.slug) + (isNewest ? '' : '/v' + row.version)); } catch (e) { /* file:// */ }
    // porównanie: najnowszy szkic → z wersją na stronie (co się zmieni po zatwierdzeniu); pozostałe → z poprzednią wersją
    var base = null;
    if (isNewest && row.status === 'draft' && T.published != null && T.published !== row.version) base = all.filter(function (r) { return r.version === T.published; })[0];
    else base = all.filter(function (r) { return r.version < row.version; }).pop() || null;
    var c = row.content.city || {};
    var it = { city_slug: T.slug, version: row.version, status: row.status, source: row.source, note: row.note, created_at: row.created_at,
      city_name: T.name, bandana_color: c.bandana_color, published_version: base ? base.version : null,
      baseIsLive: !!(base && base.version === T.published && isNewest), isNewest: isNewest };
    state.readOnly = !(isNewest && row.status === 'draft');
    refreshTabs();
    render(it, row.content, base ? base.content : null, all);
    if (!state.readOnly) restoreDrafts();
  }
  $d.addEventListener('click', function (e) {
    var b = e.target.closest('.adm-tab'); if (b) { showTab(+b.getAttribute('data-ver')); return; }
    var g = e.target.closest('[data-goto]'); if (g) { showTab(+g.getAttribute('data-goto')); var t = document.getElementById('vTabs'); if (t) t.scrollIntoView({ block: 'start' }); }
  });
  $d.addEventListener('keydown', function (e) {
    var b = e.target.closest && e.target.closest('.adm-tab');
    if (!b || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End')) return;
    var tabs = [].slice.call(document.querySelectorAll('.adm-tab')), i = tabs.indexOf(b);
    i = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    e.preventDefault();
    showTab(+tabs[i].getAttribute('data-ver'));
    var n = document.getElementById('tab-v' + tabs[i].getAttribute('data-ver')); if (n) n.focus();
  });

  // ── wersje punktów: kiedy dany przystanek zmienił się w historii miasta ──
  function stopSig(s, content) {
    var t = trOf(content.stop_translations, 'pl', 'stop_id', s.id), o = {};
    VER_FIELDS.forEach(function (f) { o[f[0]] = norm(s[f[0]]); });
    STOP_TR.forEach(function (f) { o['t.' + f[0]] = norm(t[f[0]]); });
    o.langs = langsOf(content.stop_translations, 'stop_id', s.id).join();
    return o;
  }
  function stopHistory(all, uptoVersion) {
    var hist = {}, last = {};
    all.forEach(function (v) {
      if (v.version > uptoVersion || !v.content) return;
      (v.content.stops || []).forEach(function (s) {
        var k = stopKey(s, v.content.stop_translations), sig = stopSig(s, v.content), prev = last[k];
        var changed = [];
        if (prev) {
          VER_FIELDS.forEach(function (f) { if (!same(prev[f[0]], sig[f[0]])) changed.push(f[1]); });
          STOP_TR.forEach(function (f) { if (!same(prev['t.' + f[0]], sig['t.' + f[0]])) changed.push(f[1]); });
          if (prev.langs !== sig.langs) changed.push('Języki');
        }
        if (!prev || changed.length) (hist[k] = hist[k] || []).push({ version: v.version, status: v.status, created_at: v.created_at, isNew: !prev, changed: changed });
        last[k] = sig;
      });
    });
    return hist;
  }

  // ── uwagi ────────────────────────────────────────────
  function loadComments(citySlug) {
    return api('/draft_comments?city_slug=eq.' + encodeURIComponent(citySlug) + '&order=created_at.asc')
      .then(function (rows) { state.comments = rows || []; state.commentsApi = true; })
      .catch(function (e) { state.comments = []; state.commentsApi = false; state.commentsErr = e.message; })
      .then(function () {
        var box = (lsGet(OUTBOX) || []).filter(function (c) { return c.city_slug === citySlug; });
        state.comments = state.comments.concat(box.map(function (c) { return Object.assign({}, c, { status: 'local' }); }));
      });
  }
  function ck(stop, field) { return (stop || '_city') + '|' + (field || '_all'); }
  // przy polach tylko uwagi napisane do wersji z otwartej zakładki
  function commentsFor(stop, field) {
    return state.comments.filter(function (c) { return +c.city_version === +state.tabVersion && ck(c.stop_key, c.field) === ck(stop, field); });
  }
  function isOpen(c) { return c.status === 'new' || c.status === 'sent' || c.status === 'seen' || c.status === 'local'; }
  function unsent() { return state.comments.filter(function (c) { return c.status === 'new' || c.status === 'local'; }); }

  function commentItem(c) {
    var other = state.tabVersion != null && +c.city_version !== +state.tabVersion;
    return '<li class="adm-cm__it adm-cm__it--' + esc(c.status) + '"><p>' + esc(c.body) + '</p>' +
      '<span class="adm-cm__meta"><span class="adm-cm__st">' + esc(CST[c.status] || c.status) + '</span>' +
      (other ? '<span>do v' + esc(c.city_version) + '</span>' : '') + '<span>' + esc(when(c.created_at)) + '</span></span>' +
      (c.hermes_reply ? '<p class="adm-cm__reply"><b>Hermes:</b> ' + esc(c.hermes_reply) + (c.resolved_in_version ? ' <span class="adm-cm__meta">→ v' + esc(c.resolved_in_version) + '</span>' : '') + '</p>' : '') + '</li>';
  }
  function commentBox(stop, field, label, stopVer) {
    var list = commentsFor(stop, field);
    return '<div class="adm-cm" data-stop="' + esc(stop || '') + '" data-field="' + esc(field || '') + '" data-label="' + esc(label) + '"' + (stopVer ? ' data-sv="' + stopVer + '"' : '') + '>' +
      '<ul class="adm-cm__list">' + list.map(commentItem).join('') + '</ul>' +
      (state.readOnly ? '' : '<form class="adm-cm__form" autocomplete="off"><textarea rows="1" aria-label="Uwaga do pola ' + esc(label) + '" placeholder="Uwaga dla Hermesa…"></textarea>' +
      '<button type="submit" class="adm-cm__send" aria-label="Zapisz uwagę" title="Zapisz uwagę (Enter)">' + SEND + '</button></form>') + '</div>';
  }
  // wszystkie uwagi do wersji z zakładki, w jednym miejscu (także te do przystanków, których w tej wersji już nie ma)
  function verCommentsHtml() {
    var list = verComments(state.tabVersion), sent = list.filter(isSent);
    if (!state.readOnly && !sent.length) return '';
    var h = '<h3>Uwagi wysłane do v' + esc(state.tabVersion) + ' <b class="adm-n' + (sent.length ? '' : ' is-zero') + '">' + sent.length + '</b></h3>';
    if (!list.length) return h + '<p class="adm-vc__none">Do tej wersji nie wysyłano uwag.</p>';
    var res = {}; sent.forEach(function (c) { if (c.resolved_in_version) res[c.resolved_in_version] = 1; });
    var fixed = Object.keys(res).map(Number).sort(function (a, b) { return a - b; });
    return h + (fixed.length ? '<p class="adm-vc__sum">Poprawki z tych uwag: ' + fixed.map(function (v) {
      return '<button type="button" class="adm-linkbtn" data-goto="' + v + '">v' + v + '</button>'; }).join(', ') + '</p>' : '') +
      '<ol class="adm-vc__list">' + list.map(function (c) {
        var where = (c.stop_key ? (stopName(c.stop_key) || c.stop_key) : 'Opis miasta') + ' · ' + (c.field_label || 'całość');
        return '<li class="adm-cm__it adm-cm__it--' + esc(c.status) + '"><span class="adm-send__where">' + esc(where) + '</span>' + commentItem(c).replace(/^<li[^>]*>|<\/li>$/g, '') + '</li>';
      }).join('') + '</ol>';
  }
  function updateCommentUi() {
    [].forEach.call($d.querySelectorAll('.adm-cm'), function (box) {
      var list = commentsFor(box.getAttribute('data-stop') || null, box.getAttribute('data-field') || null);
      box.querySelector('.adm-cm__list').innerHTML = list.map(commentItem).join('');
    });
    var vc = document.getElementById('verComments');
    if (vc) { vc.innerHTML = verCommentsHtml(); vc.hidden = !vc.innerHTML; }
    refreshTabs();
    updateCounts();
  }
  function updateCounts() {
    // najnowszy szkic: otwarte uwagi; starsza wersja (tylko podgląd): wszystkie uwagi tej wersji
    var openBy = {}, doneBy = {}, total = 0;
    verComments(state.tabVersion).forEach(function (c) {
      var k = c.stop_key || '_city';
      if (state.readOnly || isOpen(c)) { openBy[k] = (openBy[k] || 0) + 1; total++; } else doneBy[k] = (doneBy[k] || 0) + 1;
    });
    [].forEach.call(document.querySelectorAll('[data-count]'), function (el) {
      var k = el.getAttribute('data-count'), n = k === '_all' ? total : (openBy[k] || 0), dn = doneBy[k] || 0;
      el.textContent = n;
      el.classList.toggle('is-zero', !n);
      el.title = state.readOnly ? n + ' uwag do tej wersji' : n + ' otwartych uwag' + (dn ? ', ' + dn + ' załatwionych' : '');
    });
    var warn = document.getElementById('cmWarn');
    if (warn) warn.hidden = state.commentsApi !== false;
    renderSendBox();
  }

  // ── „Wyślij uwagi do poprawki” — lista zapisanych uwag i jeden przycisk (JP 2026-10-17) ──
  function sendList() {
    var list = unsent();
    if (!list.length) return '<p class="adm-empty">Brak nowych uwag. Wpisz uwagę przy polu i naciśnij Enter — zapisze się tutaj.</p>';
    return '<ol class="adm-send__list">' + list.map(function (c) {
      var where = (c.stop_key ? (stopName(c.stop_key) || c.stop_key) : 'Opis miasta') + ' · ' + (c.field_label || 'całość') +
        (state.current && +c.city_version !== +state.current.version ? ' · napisana do v' + c.city_version : '');
      return '<li><a href="#st-' + esc(c.stop_key || '_city') + '" class="adm-send__where">' + esc(where) + '</a><p>' + esc(c.body) + '</p></li>';
    }).join('') + '</ol>';
  }
  function stopName(key) { var a = $d.querySelector('[data-to="' + key.replace(/"/g, '') + '"] .adm-toc__nm'); return a ? a.textContent : ''; }
  function renderSendBox() {
    var n = unsent().length, local = state.comments.filter(function (c) { return c.status === 'local'; }).length;
    var box = document.getElementById('sendList');
    if (box && !box.contains(document.activeElement)) box.innerHTML = sendList();
    [].forEach.call(document.querySelectorAll('[data-send]'), function (b) {
      if (b.classList.contains('is-busy')) return;
      b.disabled = !n;
      b.textContent = n ? 'Wyślij uwagi do poprawki (' + n + ')' : 'Brak uwag do wysłania';
    });
    var hint = document.getElementById('sendHint');
    if (hint) hint.textContent = local ? 'Tylko w tej przeglądarce: ' + plUwagi(local) + '. Przycisk najpierw przeniesie je do bazy.' : '';
  }
  function plUwagi(n) { var d = n % 10, t = n % 100; return n + (n === 1 ? ' uwaga' : (d >= 2 && d <= 4 && (t < 12 || t > 14)) ? ' uwagi' : ' uwag'); }
  // komunikat widoczny zawsze — pod przyciskiem i w pływającej ramce (przycisk w menu przystanków nie ma pola komunikatu)
  function sendNote(text, ok) {
    var $m = document.getElementById('sendMsg');
    if ($m) { $m.className = 'adm-msg ' + (ok ? 'adm-msg--ok' : 'adm-msg--err'); $m.textContent = text; }
    var t = document.getElementById('admToast');
    if (!t) { t = document.createElement('div'); t.id = 'admToast'; t.className = 'adm-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.className = 'adm-toast ' + (ok ? 'adm-toast--ok' : 'adm-toast--err');
    t.innerHTML = '<p>' + esc(text) + '</p><button type="button" class="qc-btn qc-btn--sm" data-toast-close>Zamknij</button>';
    t.hidden = false;
    if (ok) setTimeout(function () { t.hidden = true; }, 12000);
  }
  document.addEventListener('click', function (e) { if (e.target.closest('[data-toast-close]')) document.getElementById('admToast').hidden = true; });
  function setSendLabel(txt) { [].forEach.call(document.querySelectorAll('[data-send]'), function (b) { b.textContent = txt; }); }
  function sendAll(btn) {
    var it = state.current, n = unsent().length;
    if (!it || !n) return;
    [].forEach.call(document.querySelectorAll('[data-send]'), function (b) { b.disabled = true; b.classList.add('is-busy'); });
    setSendLabel('Wysyłam…');
    var box = lsGet(OUTBOX) || [], total = box.length, done = 0;
    var step = total ? flushOutbox(function () { done++; setSendLabel('Przenoszę uwagi do bazy ' + done + '/' + total + '…'); }) : Promise.resolve(0);
    step.then(function (left) {
      if (left) {
        throw new Error(state.outboxSession ? SESSION_MSG : 'Baza nie przyjęła ' + plUwagi(left) + ' (' + (state.outboxErr || 'brak odpowiedzi') +
          '). Są bezpieczne w tej przeglądarce — kliknij jeszcze raz za chwilę.');
      }
      setSendLabel('Zlecam poprawkę…');
      return api('/rpc/admin_send_comments', { method: 'POST', body: { p_slug: it.city_slug, p_version: it.version } });
    }).then(function (r) {
      sendNote('Wysłane: ' + plUwagi((r && r.sent) || n) + '. Hermes zrobi nową wersję szkicu (zwykle 5–15 min), napisze w wątku miasta i odpowie przy każdej uwadze.', true);
      return loadComments(it.city_slug);
    }).catch(function (e) {
      sendNote('Nie wysłano. ' + (e && e.message || 'Nieznany błąd') , false);
      if (window.console) console.error('Wyślij uwagi:', e);
    }).then(function () {
      [].forEach.call(document.querySelectorAll('[data-send]'), function (b) { b.classList.remove('is-busy'); });
      try { updateCommentUi(); } catch (e2) { if (window.console) console.error(e2); renderSendBox(); }
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-send]');
    if (b && !b.disabled) sendAll(b);
  });
  function refreshComments() {
    if (!state.current) return;
    var focused = document.activeElement && document.activeElement.closest && document.activeElement.closest('.adm-cm');
    loadComments(state.current.city_slug).then(function () { if (!focused || !focused.querySelector('textarea').value) updateCommentUi(); else updateCounts(); });
  }

  function sendComment(form) {
    var box = form.closest('.adm-cm'), ta = form.querySelector('textarea'), body = ta.value.trim(), it = state.current;
    if (!body || !it) return;
    var row = { city_slug: it.city_slug, city_version: it.version, stop_key: box.getAttribute('data-stop') || null,
      field: box.getAttribute('data-field') || null, field_label: box.getAttribute('data-label'),
      stop_version: box.hasAttribute('data-sv') ? +box.getAttribute('data-sv') : null, body: body };
    ta.value = ''; autosize(ta);
    form.classList.add('is-busy');
    api('/draft_comments', { method: 'POST', body: row }).then(function (res) {
      var saved = (res && res[0]) || Object.assign({ status: 'new', created_at: new Date().toISOString() }, row);
      if (!DEMO) state.comments.push(saved); else state.comments = state.demo.comments.filter(function (c) { return c.city_slug === it.city_slug; });
    }).catch(function () {
      var local = Object.assign({ created_at: new Date().toISOString(), local_id: Date.now() }, row);
      var box2 = lsGet(OUTBOX) || []; box2.push(local); lsSet(OUTBOX, box2);
      state.comments.push(Object.assign({}, local, { status: 'local' }));
      state.commentsApi = false;
    }).then(function () { form.classList.remove('is-busy'); updateCommentUi(); });
  }
  // jedno przenoszenie naraz: otwarcie szkicu i przycisk nie mogą wysłać tych samych uwag dwa razy (duplikaty w bazie)
  var flushing = null;
  function flushOutbox(onEach) {
    if (DEMO) return Promise.resolve(0);
    if (flushing) return flushing;
    flushing = flushOnce(onEach).then(function (v) { flushing = null; return v; }, function (e) { flushing = null; throw e; });
    return flushing;
  }
  function flushOnce(onEach) {
    var box = lsGet(OUTBOX) || [];
    if (!box.length) return Promise.resolve(0);
    var keep = [], err = '', session = false;
    return box.reduce(function (p, c) {
      return p.then(function () {
        if (session) { keep.push(c); return; }            // sesja wygasła — nie męczymy bramki kolejnymi próbami
        var body = Object.assign({}, c); delete body.local_id; delete body.created_at; delete body.status;
        return api('/draft_comments', { method: 'POST', body: body })
          .then(function () { if (onEach) onEach(); })
          .catch(function (e) { keep.push(c); err = e.message; if (e.session) session = true; });
      });
    }, Promise.resolve()).then(function () {
      var ids = box.map(function (c) { return c.local_id; });
      var added = (lsGet(OUTBOX) || []).filter(function (c) { return ids.indexOf(c.local_id) < 0; });   // dopisane w trakcie
      lsSet(OUTBOX, keep.concat(added));                 // w przeglądarce zostaje tylko to, czego baza nie przyjęła
      state.outboxErr = err; state.outboxSession = session;
      if (keep.length < box.length) return loadComments(state.current ? state.current.city_slug : '').then(function () { return keep.length; });
      return keep.length;
    });
  }
  function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 240) + 'px'; }

  $d.addEventListener('submit', function (e) {
    var f = e.target.closest('.adm-cm__form');
    if (f) { e.preventDefault(); sendComment(f); }
  });
  $d.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && e.target.matches('.adm-cm__form textarea')) { e.preventDefault(); sendComment(e.target.form); }
  });
  $d.addEventListener('input', function (e) { if (e.target.matches('.adm-cm__form textarea')) autosize(e.target); });

  // ── arkusz szkicu ────────────────────────────────────
  function cell(label, oldV, newV, fmt, hasOld, cm) {
    var changed = hasOld && !same(oldV, newV);
    return '<div class="adm-row' + (changed ? ' is-chg' : '') + '"><small class="adm-row__k">' + esc(label) + (changed ? '<span class="adm-dot" title="zmienione"></span>' : '') + '</small>' +
      '<div class="adm-row__v">' + (changed ? '<span class="adm-old">' + esc(show(oldV, fmt)) + '</span>' : '') +
      '<span class="' + (changed ? 'adm-new' : 'adm-val') + '">' + esc(show(newV, fmt)) + '</span></div>' + cm + '</div>';
  }

  function render(it, draft, pub, all) {
    state.blocks = (draft && draft.stop_blocks_v2) || null;   // nowe wytyczne: bloki z przypisami (gemini-draft.mjs)
    var c = draft.city || {}, pc = pub ? (pub.city || {}) : null;
    var ctr = trOf(draft.city_translations, 'pl'), pctr = pub ? trOf(pub.city_translations, 'pl') : null;
    var team = c.bandana_color || it.bandana_color || '#0B4EA2';
    var hist = stopHistory(all, it.version);

    var oldStops = pub ? (pub.stops || []) : [], newStops = (draft.stops || []).slice().sort(function (a, b) { return a.stop_number - b.stop_number; });
    var oldBy = {}; oldStops.forEach(function (s) { oldBy[stopKey(s, pub.stop_translations)] = s; });
    var seen = {}, stops = [], cnt = { new: 0, chg: 0, del: 0 };
    newStops.forEach(function (s) {
      var k = stopKey(s, draft.stop_translations), o = oldBy[k]; seen[k] = 1;
      var h = hist[k] || [], last = h[h.length - 1];
      var kind = !pub ? 'first' : !o ? 'new' : (last && last.version > it.published_version ? 'chg' : 'same');
      if (kind === 'new' || kind === 'chg') cnt[kind]++;
      stops.push({ key: k, s: s, o: o, kind: kind, hist: h, t: trOf(draft.stop_translations, 'pl', 'stop_id', s.id),
        ot: o ? trOf(pub.stop_translations, 'pl', 'stop_id', o.id) : null });
    });
    oldStops.forEach(function (o) {
      var k = stopKey(o, pub.stop_translations);
      if (seen[k]) return;
      cnt.del++;
      stops.push({ key: k, s: o, o: o, kind: 'del', hist: hist[k] || [], t: trOf(pub.stop_translations, 'pl', 'stop_id', o.id), ot: null });
    });

    var sLangsNew = langsOf(draft.stop_translations), sLangsOld = pub ? langsOf(pub.stop_translations) : [];
    var cLangsNew = langsOf(draft.city_translations), cLangsOld = pub ? langsOf(pub.city_translations) : [];

    var warn = [];
    if (!newStops.length) warn.push(['', 'Szkic nie ma żadnych przystanków — po publikacji strona miasta będzie pusta.']);
    var noPl = newStops.filter(function (s) { return !trOf(draft.stop_translations, 'pl', 'stop_id', s.id).name; }).length;
    if (noPl) warn.push(['', noPl + ' przyst. bez nazwy po polsku.']);
    var noEn = newStops.length && newStops.filter(function (s) { return !trOf(draft.stop_translations, 'en', 'stop_id', s.id).name; }).length;
    if (noEn) warn.push(['soft', noEn + ' z ' + newStops.length + ' przystanków bez tłumaczenia EN — inne języki zobaczą tekst zapasowy.']);
    if (!ctr.title) warn.push(['', 'Brak tytułu miasta po polsku.']);

    var title = ctr.title || it.city_name || it.city_slug;
    var route = routeUrl(c, newStops, draft.stop_translations, title);
    var html = '<article class="adm-sheet" style="--team:' + esc(team) + '">' +
      '<header class="adm-sheet__head' + (isLight(team) ? ' is-light' : '') + '"><div>' +
      '<p class="label" style="color:inherit;opacity:.8">' + esc(it.city_slug) + ' · ' + esc(sheetLabel(it)) + '</p>' +
      '<h2 class="adm-sheet__title">' + esc(title) + '</h2>' +
      (it.note ? '<p class="adm-sheet__sub">' + esc(it.note) + '</p>' : '') + '</div>' +
      '<div class="adm-sheet__acts">' +
      (route ? '<a class="qc-btn qc-btn--sm adm-route" href="' + esc(route) + '" target="_blank" rel="noopener">' + PIN + ' Cała trasa w Google Maps</a>' : '') +
      (state.token ? '<a class="qc-btn qc-btn--sm adm-preview" href="' + esc(SITE + '/city.html?draft=' + encodeURIComponent(state.token) + '&v=' + it.version) +
        '" target="_blank" rel="noopener">Podgląd v' + esc(it.version) + ' na stronie</a>' : '') +
      '<span class="adm-chip">' + esc(SRC[it.source] || it.source) + ' · ' + esc(when(it.created_at)) + '</span></div></header>';

    if (state.readOnly) {
      var nw = state.trip ? state.trip.newest : null;
      html += '<p class="adm-ro">' + (it.isNewest
        ? 'Ta wycieczka nie ma szkicu w toku (najnowsza wersja: ' + esc(VST[it.status] || it.status) + ') — tylko podgląd. Uwagi wysyła się do szkicu.'
        : 'Wersja v' + esc(it.version) + ' (' + esc(VST[it.status] || it.status) + ') — tylko podgląd. Uwagi wysyłasz w najnowszej wersji. ' +
          '<button type="button" class="adm-linkbtn" data-goto="' + esc(nw) + '">Przejdź do v' + esc(nw) + '</button>') + '</p>';
    }
    html += '<section class="adm-sheet__sec adm-vc" id="verComments"></section>';

    html += '<p class="adm-cmwarn" id="cmWarn" hidden>Baza nie przyjmuje jeszcze uwag (brak tabeli <code>admin.draft_comments</code>). Uwagi zapisują się w tej przeglądarce i wyślą się same, gdy Hermes ją doda.</p>';

    html += '<section class="adm-sheet__sec"><h3>Podsumowanie</h3><div class="adm-sum">' +
      stat('Przystanki', newStops.length, pub ? oldStops.length : null) +
      stat('Czas', durLabel(c.duration_type), pc ? durLabel(pc.duration_type) : null) +
      (pub ? stat('Nowe', cnt.new) + stat('Zmienione', cnt.chg) + stat('Usunięte', cnt.del) : '') +
      stat('Języki', sLangsNew.length || cLangsNew.length, pub ? (sLangsOld.length || cLangsOld.length) : null) +
      '</div>' + warn.map(function (w) { return '<p class="adm-warn' + (w[0] ? ' adm-warn--' + w[0] : '') + '">' + esc(w[1]) + '</p>'; }).join('') +
      langChips(sLangsOld.length ? sLangsOld : cLangsOld, sLangsNew.length ? sLangsNew : cLangsNew) + '</section>';

    html += '<section class="adm-sheet__sec"><h3>Mapa trasy (OpenStreetMap)</h3><div id="admMap"></div></section>';

    // opis miasta — każde pole z uwagami
    html += '<section class="adm-sheet__sec adm-anchor" id="st-_city" data-spy="_city"><h3>Opis miasta</h3>' +
      '<div class="adm-rows">' + cell('Cała wycieczka', null, 'Uwaga ogólna do całego szkicu', null, false, commentBox(null, null, 'Cała wycieczka')) +
      CITY_TR.map(function (f) { return cell(f[1], pctr ? pctr[f[0]] : null, ctr[f[0]], f[2], !!pub, commentBox(null, 'city.' + f[0], f[1])); }).join('') +
      CITY_FIELDS.map(function (f) { return cell(f[1], pc ? pc[f[0]] : null, c[f[0]], f[2], !!pub, commentBox(null, 'city.' + f[0], f[1])); }).join('') +
      '</div></section>';

    html += '<section class="adm-sheet__sec"><h3>Przystanki</h3><div class="adm-stops">' +
      (stops.length ? stops.map(function (x) { return stopHtml(x, it, pub); }).join('') : '<p class="adm-empty">Brak przystanków.</p>') + '</div></section>';

    if (!state.readOnly) html += '<section class="adm-sheet__sec adm-send" id="send"><h3>Uwagi do wysłania</h3>' +
      '<p class="adm-send__sub">Uwagi zapisane przy polach. Hermes zaczyna poprawki dopiero po kliknięciu przycisku — wszystkie naraz, w jednej nowej wersji szkicu.</p>' +
      '<div id="sendList">' + sendList() + '</div>' +
      '<div class="adm-send__row"><button type="button" class="qc-btn adm-btn-send" data-send>Wyślij uwagi do poprawki</button>' +
      '<span class="adm-msg" id="sendMsg" role="status"></span></div><p class="adm-send__hint" id="sendHint"></p></section>';

    if (!state.readOnly) html += '<form class="adm-decide" id="decide" autocomplete="off">' +
      '<label for="note">Notatka do historii wersji (opcjonalnie)</label>' +
      '<textarea id="note" name="note" rows="1" placeholder="Notatka do wersji (opcjonalnie)"></textarea>' +
      '<div class="adm-decide__row">' +
      '<button type="button" class="qc-btn adm-btn-ok" data-act="approve"' + (newStops.length ? '' : ' disabled data-lock title="Szkic bez przystanków nie może trafić na stronę"') + '>Zatwierdź i opublikuj</button>' +
      '<button type="button" class="qc-btn adm-btn-no" data-act="reject">Odrzuć szkic</button>' +
      '<span class="adm-msg" id="msg" role="status"></span></div></form>';
    html += '</article>';

    // przyklejone menu przystanków z licznikami uwag
    var toc = '<nav class="adm-toc" aria-label="Przystanki szkicu"><p class="adm-toc__h">Uwagi <b class="adm-n" data-count="_all">0</b></p><ol>' +
      '<li><a href="#st-_city" data-to="_city"><span class="adm-toc__no">★</span><span class="adm-toc__nm">Opis miasta</span><b class="adm-n" data-count="_city">0</b></a></li>' +
      stops.map(function (x) {
        return '<li class="adm-toc__' + x.kind + '"><a href="#st-' + esc(x.key) + '" data-to="' + esc(x.key) + '"><span class="adm-toc__no">' + num(x.s.stop_number) + '</span>' +
          '<span class="adm-toc__nm">' + esc(x.t.name || '(bez nazwy)') + '</span><b class="adm-n" data-count="' + esc(x.key) + '">0</b></a></li>';
      }).join('') + '</ol>' + (state.readOnly ? '' : '<div class="adm-toc__send"><button type="button" class="qc-btn adm-btn-send" data-send>Wyślij uwagi do poprawki</button>' +
      '<a href="#send" class="adm-toc__all">Lista uwag ↓</a></div>') + '</nav>';

    var $p = document.getElementById('tabPanel') || $d;
    $p.innerHTML = '<div class="adm-split">' + html + toc + '</div>';
    $p.setAttribute('aria-labelledby', 'tab-v' + it.version);
    var vc = document.getElementById('verComments');
    vc.innerHTML = verCommentsHtml(); vc.hidden = !vc.innerHTML;    // po wstawieniu menu: nazwy przystanków z menu
    drawMap(newStops, draft.stop_translations);
    updateCounts();
    spy();
  }

  function sheetLabel(it) {
    if (it.isNewest && it.status === 'draft') return 'szkic v' + it.version + (it.published_version != null ? (it.baseIsLive ? ' zamiast v' + it.published_version + ' (na stronie)' : ' · zmiany względem v' + it.published_version) : ' · pierwsza publikacja');
    return (VST[it.status] || it.status) + ' v' + it.version + (it.published_version != null ? ' · zmiany względem v' + it.published_version : ' · pierwsza wersja');
  }
  function stopHtml(x, it, pub) {
    var s = x.s, t = x.t, ver = x.hist.length || 1;
    var chip = { first: '', new: '<span class="adm-chip adm-chip--new">nowy</span>', chg: '<span class="adm-chip adm-chip--chg">zmieniony</span>',
      del: '<span class="adm-chip adm-chip--del">usunięty</span>', same: '<span class="adm-chip">bez zmian</span>' }[x.kind];
    var hasOld = !!pub && !!x.ot && x.kind !== 'del';
    var histHtml = '<details class="adm-hist"><summary><span class="adm-pv" title="wersja tego przystanku">punkt v' + ver + '</span>' + CHEV + '</summary><ol>' +
      x.hist.slice().reverse().map(function (h) {
        return '<li><b>v' + h.version + '</b> <span class="adm-cm__meta">' + esc(VST[h.status] || h.status) + ' · ' + esc(when(h.created_at)) + '</span><br>' +
          esc(h.isNew ? 'dodany' : 'zmieniono: ' + h.changed.join(', ')) + '</li>';
      }).join('') + '</ol></details>';
    var head = '<header class="adm-stopx__head"><span class="adm-stop__no">' + num(s.stop_number) + '</span>' +
      '<img class="adm-stop__ic" src="' + icon(s.category) + '" alt="" width="48" height="48" loading="lazy">' +
      '<span class="adm-stop__name">' + esc(t.name || '(bez nazwy PL)') + '<small>' + esc([s.category, s.time_label, s.visit_duration ? minLabel(s.visit_duration) : ''].filter(Boolean).join(' · ')) + '</small></span>' +
      '<span class="adm-stopx__tags">' + chip + histHtml + '</span></header>';
    if (x.kind === 'del') return '<section class="adm-stopx adm-anchor" data-kind="del" id="st-' + esc(x.key) + '" data-spy="' + esc(x.key) + '">' + head +
      '<div class="adm-rows">' + cell('Przystanek', null, 'Usunięty w tym szkicu', null, false, commentBox(x.key, null, 'Cały przystanek', ver)) + '</div></section>';
    var rows = cell('Cały przystanek', null, 'Uwaga ogólna do przystanku', null, false, commentBox(x.key, null, 'Cały przystanek', ver)) +
      STOP_TR.map(function (f) { return cell(f[1], x.ot ? x.ot[f[0]] : null, t[f[0]], f[2], hasOld, commentBox(x.key, 'stop.' + f[0], f[1], ver)); }).join('') +
      blockRows(x.key, ver) +
      STOP_FIELDS.map(function (f) { return cell(f[1], x.o ? x.o[f[0]] : null, s[f[0]], f[2], hasOld, commentBox(x.key, 'stop.' + f[0], f[1], ver)); }).join('');
    return '<section class="adm-stopx adm-anchor" data-kind="' + x.kind + '" id="st-' + esc(x.key) + '" data-spy="' + esc(x.key) + '">' + head +
      '<div class="adm-rows">' + rows + '</div></section>';
  }

  // bloki nowych wytycznych (docs/TRESC-PRZYSTANKU.md): wersja z przypisami [n], źródła i wynik kontroli — tylko dla redakcji
  var BLK = [['legend', 'Legenda'], ['curiosity', 'Ciekawostka'], ['pop_culture', 'W popkulturze'], ['fun_fact', 'Fun fact (dziecko)']];
  function blockText(k, v) {
    if (!v) return '';
    if (k === 'legend') return [v.text, v.trace ? 'Ślad na miejscu: ' + v.trace : '', v.history ? 'Historia: ' + v.history : ''].filter(Boolean).join('\n\n');
    if (k === 'pop_culture') return (v.items || []).map(function (i) { return [i.title, i.year].filter(Boolean).join(' (') + (i.year ? ')' : '') + ' — ' + (i.text || ''); }).join('\n\n');
    return v.text || '';
  }
  function blockRows(key, ver) {
    var b = state.blocks && state.blocks[key]; if (!b) return '';
    var m = b.marked || {}, st = b.state || {};
    var rows = BLK.map(function (f) {
      var s = st[f[0]] || {}, txt = s.state === 'found' ? blockText(f[0], m[f[0]]) : 'brak — sprawdzono: ' + (s.checked || '(nie podano)');
      return cell(f[1], null, txt, null, false, commentBox(key, 'stop.' + f[0], f[1], ver));
    }).join('');
    var src = (b.sources || []).map(function (x) { return '[' + x.n + '] ' + (x.title || '') + ' — ' + x.url; }).join('\n');
    rows += cell('Źródła (przypisy [n])', null, src || 'brak źródeł', null, false, commentBox(key, 'stop.sources', 'Źródła', ver));
    var ck = b.check, va = b.validator, out = [];
    if (ck) out.push('Claude: ' + (ck.verdict === 'ok' ? 'ok' : 'do poprawy') + (ck.summary ? ' — ' + ck.summary : '') +
      (ck.errors || []).map(function (e) { return '\n• ' + (e.block ? e.block + ': ' : '') + e.problem + (e.fix ? ' → ' + e.fix : ''); }).join(''));
    if (va && va.errors && va.errors.length) out.push('Walidator: ' + va.errors.map(function (e) { return '\n• ' + (e.block ? e.block + ': ' : '') + e.problem; }).join(''));
    if (b.gap) out.push('Luka w researchu: ' + b.gap);
    if (out.length) rows += cell('Kontrola', null, out.join('\n\n'), null, false, '');
    return rows;
  }

  // podświetlenie bieżącego przystanku w menu
  var spyObs = null;
  function spy() {
    if (spyObs) spyObs.disconnect();
    if (!('IntersectionObserver' in window)) return;
    spyObs = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var k = e.target.getAttribute('data-spy');
        [].forEach.call(document.querySelectorAll('.adm-toc a'), function (a) {
          var on = a.getAttribute('data-to') === k;
          a.classList.toggle('is-on', on);
          if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
          if (on && a.scrollIntoView && window.matchMedia('(max-width:1199px)').matches) {
            var bar = a.closest('ol'); if (bar) bar.scrollLeft = a.parentNode.offsetLeft - bar.offsetLeft - 8;
          }
        });
      });
    }, { rootMargin: '-35% 0px -60% 0px' });
    [].forEach.call($d.querySelectorAll('[data-spy]'), function (el) { spyObs.observe(el); });
  }

  // link do całej trasy w Mapach Google (pieszo): route_url > współrzędne > maps_query > nazwa PL + miasto
  function routeUrl(c, stops, trs, town) {
    if (c && /^https?:\/\//i.test(String(c.route_url || '').trim())) return String(c.route_url).trim();
    var pts = (stops || []).slice().sort(function (a, b) { return a.stop_number - b.stop_number; }).map(function (s) {
      // nazwa miejsca przed współrzędnymi: Google pokazuje wtedy „Largo Giustiniano”, a nie adres ulicy (JP 2026-10-17)
      if (s.maps_query) return s.maps_query;
      if (s.lat != null && s.lon != null && s.lat !== '' && s.lon !== '') return s.lat + ',' + s.lon;
      var n = trOf(trs, 'pl', 'stop_id', s.id).name;
      return n ? n + (town ? ', ' + town : '') : '';
    }).filter(Boolean);
    if (!pts.length) return '';
    if (pts.length === 1) return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(pts[0]);
    var way = pts.slice(1, -1).slice(0, 9);
    return 'https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=' + encodeURIComponent(pts[0]) +
      '&destination=' + encodeURIComponent(pts[pts.length - 1]) + (way.length ? '&waypoints=' + encodeURIComponent(way.join('|')) : '');
  }

  // ── mapa szkicu: kafelki OSM + pinezki z lat/lon (podgląd dla JP, bez przybliżania) ──
  var TILE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  function proj(lat, lon, z) {
    var sc = 256 * Math.pow(2, z), r = lat * Math.PI / 180;
    return [(lon + 180) / 360 * sc, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * sc];
  }
  var AM = null;   // stan mapy szkicu: punkty, zoom, środek (piksele świata przy z)
  function drawMap(stops, trs) {
    var box = document.getElementById('admMap');
    if (!box) return;
    var pts = [], miss = [];
    stops.forEach(function (s) {
      var la = parseFloat(s.lat), lo = parseFloat(s.lon), nm = trOf(trs, 'pl', 'stop_id', s.id).name || '';
      if (isFinite(la) && isFinite(lo)) pts.push({ n: s.stop_number, la: la, lo: lo, nm: nm });
      else miss.push(num(s.stop_number) + (nm ? ' ' + nm : ''));
    });
    var note = miss.length ? '<p class="adm-warn adm-warn--soft">Bez współrzędnych (brak pinezki): ' + esc(miss.join(', ')) + '</p>' : '';
    if (!pts.length) { AM = null; box.innerHTML = '<p class="adm-empty">Żaden przystanek nie ma współrzędnych — mapa pojawi się po ich dodaniu.</p>' + note; return; }
    var W = Math.max(280, box.clientWidth || 640), H = Math.round(Math.min(460, Math.max(280, W * 0.6)));
    box.innerHTML = '<div class="qc-map adm-map" style="height:' + H + 'px" tabindex="0" aria-label="Mapa trasy — plus i minus przybliżają, strzałki przesuwają">' +
      '<div class="qc-map__tiles"></div><svg class="qc-map__line" aria-hidden="true"><polyline points=""/></svg><div class="adm-map__pins"></div>' +
      '<div class="qc-map__ctl"><button type="button" data-z="in" aria-label="Przybliż">+</button><button type="button" data-z="out" aria-label="Oddal">−</button>' +
      '<button type="button" data-z="fit" aria-label="Cała trasa" title="Cała trasa">⤢</button></div>' +
      '<a class="qc-map__attr" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a></div>' +
      '<p class="adm-send__hint">Przybliżanie: + / −, podwójne kliknięcie albo Ctrl + kółko myszy; przesuwanie: przeciągnij mapę. Kliknij pinezkę, żeby otworzyć miejsce w OpenStreetMap. ' +
      'Zielona = start, złota = meta, linia = kolejność przystanków (nie droga piesza).</p>' + note;
    AM = { el: box.querySelector('.adm-map'), pts: pts, W: W, H: H, z: 17, cx: 0, cy: 0 };
    fitMap(); paintMap(); wireMap(AM.el);
  }
  function fitMap() {
    var pad = 44, z = 18, P;
    for (; z > 3; z--) {
      P = AM.pts.map(function (p) { return proj(p.la, p.lo, z); });
      var xs = P.map(function (q) { return q[0]; }), ys = P.map(function (q) { return q[1]; });
      if (Math.max.apply(0, xs) - Math.min.apply(0, xs) <= AM.W - 2 * pad && Math.max.apply(0, ys) - Math.min.apply(0, ys) <= AM.H - 2 * pad) break;
    }
    P = AM.pts.map(function (p) { return proj(p.la, p.lo, z); });
    var X = P.map(function (q) { return q[0]; }), Y = P.map(function (q) { return q[1]; });
    AM.z = z; AM.cx = (Math.min.apply(0, X) + Math.max.apply(0, X)) / 2; AM.cy = (Math.min.apply(0, Y) + Math.max.apply(0, Y)) / 2;
  }
  function zoomMap(dz, fx, fy) {   // fx, fy: punkt na mapie, który zostaje w miejscu (domyślnie środek)
    var nz = Math.max(3, Math.min(19, AM.z + dz));
    if (nz === AM.z) return;
    var k = Math.pow(2, nz - AM.z);
    fx = fx == null ? AM.W / 2 : fx; fy = fy == null ? AM.H / 2 : fy;
    var wx = AM.cx - AM.W / 2 + fx, wy = AM.cy - AM.H / 2 + fy;
    AM.cx = wx * k - fx + AM.W / 2; AM.cy = wy * k - fy + AM.H / 2; AM.z = nz;
    paintMap();
  }
  function paintMap() {
    var z = AM.z, n = Math.pow(2, z), ox = AM.cx - AM.W / 2, oy = AM.cy - AM.H / 2, tiles = '';
    for (var tx = Math.floor(ox / 256); tx <= Math.floor((ox + AM.W) / 256); tx++)
      for (var ty = Math.floor(oy / 256); ty <= Math.floor((oy + AM.H) / 256); ty++) {
        if (ty < 0 || ty >= n) continue;
        tiles += '<img alt="" draggable="false" style="left:' + Math.round(tx * 256 - ox) + 'px;top:' + Math.round(ty * 256 - oy) + 'px" src="' +
          TILE.replace('{z}', z).replace('{x}', ((tx % n) + n) % n).replace('{y}', ty) + '">';
      }
    var P = AM.pts.map(function (p) { var q = proj(p.la, p.lo, z); return [q[0] - ox, q[1] - oy]; });
    AM.el.querySelector('.qc-map__tiles').innerHTML = tiles;
    AM.el.querySelector('polyline').setAttribute('points', P.map(function (q) { return Math.round(q[0]) + ',' + Math.round(q[1]); }).join(' '));
    AM.el.querySelector('.adm-map__pins').innerHTML = AM.pts.map(function (p, i) {
      var cls = i === 0 ? ' is-start' : (i === AM.pts.length - 1 ? ' is-finish' : '');
      return '<a class="qc-pin' + cls + '" draggable="false" style="left:' + Math.round(P[i][0]) + 'px;top:' + Math.round(P[i][1]) + 'px" target="_blank" rel="noopener" title="' +
        esc(num(p.n) + ' ' + p.nm + ' (' + p.la.toFixed(5) + ', ' + p.lo.toFixed(5) + ')') + '" href="https://www.openstreetmap.org/?mlat=' + p.la + '&mlon=' + p.lo + '#map=18/' + p.la + '/' + p.lo + '"><span>' + esc(num(p.n)) + '</span></a>';
    }).join('');
    AM.el.querySelector('[data-z="in"]').disabled = z >= 19;
    AM.el.querySelector('[data-z="out"]').disabled = z <= 3;
  }
  function wireMap(el) {
    var drag = null, moved = false;
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-z]');
      if (b) { var a = b.getAttribute('data-z'); if (a === 'fit') { fitMap(); paintMap(); } else zoomMap(a === 'in' ? 1 : -1); return; }
      if (moved && e.target.closest('.qc-pin')) { e.preventDefault(); }
    });
    el.addEventListener('dblclick', function (e) {
      if (e.target.closest('.qc-map__ctl,.qc-pin')) return;
      var r = el.getBoundingClientRect(); zoomMap(1, e.clientX - r.left, e.clientY - r.top);
    });
    el.addEventListener('wheel', function (e) {
      if (!e.ctrlKey && !e.metaKey) return;   // zwykłe kółko przewija stronę szkicu
      e.preventDefault();
      var r = el.getBoundingClientRect(); zoomMap(e.deltaY < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    el.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.qc-map__ctl') || e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, cx: AM.cx, cy: AM.cy }; moved = false;
    });
    window.addEventListener('pointermove', function (e) {
      if (!drag || !AM || AM.el !== el) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 5) return;
      moved = true; el.classList.add('is-drag');
      AM.cx = drag.cx - dx; AM.cy = drag.cy - dy; paintMap();
    });
    window.addEventListener('pointerup', function () { drag = null; el.classList.remove('is-drag'); setTimeout(function () { moved = false; }, 0); });
    el.addEventListener('keydown', function (e) {
      var k = e.key, st = 80;
      if (k === '+' || k === '=') zoomMap(1); else if (k === '-') zoomMap(-1);
      else if (k === 'ArrowLeft') { AM.cx -= st; paintMap(); } else if (k === 'ArrowRight') { AM.cx += st; paintMap(); }
      else if (k === 'ArrowUp') { AM.cy -= st; paintMap(); } else if (k === 'ArrowDown') { AM.cy += st; paintMap(); }
      else return;
      e.preventDefault();
    });
  }

  function stat(label, now, before) {
    var diff = before != null && String(before) !== String(now);
    return '<div class="adm-stat"><small>' + esc(label) + '</small>' + (diff ? '<s>' + esc(before) + '</s>' : '') + '<b>' + esc(now == null ? '—' : now) + '</b></div>';
  }
  function langChips(oldL, newL) {
    var all = {}; oldL.concat(newL).forEach(function (l) { all[l] = 1; });
    return '<div class="adm-langs">' + Object.keys(all).sort().map(function (l) {
      var cls = newL.indexOf(l) < 0 ? ' adm-lang--gone' : (oldL.indexOf(l) < 0 && oldL.length ? ' adm-lang--new' : '');
      return '<span class="adm-lang' + cls + '">' + esc(l) + '</span>';
    }).join('') + '</div>';
  }

  // ── decyzja: dwa kliknięcia zamiast okienka potwierdzenia ──
  var armed = null, armTimer = null;
  $d.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b || b.disabled || !state.current) return;
    var act = b.getAttribute('data-act');
    var label = { approve: 'Zatwierdź i opublikuj', reject: 'Odrzuć szkic' };
    if (armed !== b) {
      disarm();
      armed = b; b.classList.add('is-armed');
      b.textContent = act === 'approve' ? 'Na pewno? Kliknij jeszcze raz' : 'Odrzucić? Kliknij jeszcze raz';
      armTimer = setTimeout(disarm, 4000);
      return;
    }
    disarm();
    var it = state.current, note = (document.getElementById('note') || {}).value || null;
    var $msg = document.getElementById('msg');
    [].forEach.call($d.querySelectorAll('[data-act]'), function (x) { x.disabled = true; });
    $msg.className = 'adm-msg'; $msg.textContent = act === 'approve' ? 'Publikuję…' : 'Odrzucam…';
    var body = act === 'approve' ? { p_slug: it.city_slug, p_version: it.version, p_note: note } : { p_slug: it.city_slug, p_version: it.version, p_reason: note };
    api('/rpc/admin_' + act, { method: 'POST', body: body }).then(function () {
      clearInterval(state.poll);
      $d.innerHTML = '<div class="adm-sheet"><div class="adm-done"><h3>' + (act === 'approve' ? 'Opublikowane' : 'Odrzucone') + '</h3><p>' +
        esc(it.city_name || it.city_slug) + ' v' + it.version + (act === 'approve' ? ' jest teraz wersją na stronie. Poprzednia trafiła do historii.' : ' trafił do historii jako odrzucony.') +
        (act === 'approve' ? '</p><p style="margin-top:14px"><a href="../city.html?c=' + encodeURIComponent(it.city_slug) + '" target="_blank" rel="noopener">Otwórz stronę miasta</a>' : '') +
        '</p><p class="adm-done__acts"><a class="qc-btn qc-btn--sm adm-back" href="#/">← Wszystkie wycieczki</a>' +
        '<button type="button" class="qc-btn qc-btn--sm" data-reopen="' + esc(it.city_slug) + '">Wersje tej wycieczki</button></p></div></div>';
      state.trip = null; state.versions = null; state.current = null;
      loadTrips();
    }).catch(function (err) {
      [].forEach.call($d.querySelectorAll('[data-act]'), function (x) { x.disabled = x.hasAttribute('data-lock'); x.textContent = label[x.getAttribute('data-act')]; });
      $msg.className = 'adm-msg adm-msg--err'; $msg.textContent = 'Nie zapisano: ' + err.message;
    });
  });
  function disarm() {
    clearTimeout(armTimer);
    if (armed) {
      armed.classList.remove('is-armed');
      armed.textContent = armed.getAttribute('data-act') === 'approve' ? 'Zatwierdź i opublikuj' : 'Odrzuć szkic';
    }
    armed = null;
  }

  // ── baza wiedzy redakcji: reguły z uwag (JP 2026-10-17, docs/BAZA-WIEDZY.md) ──
  var $kb = document.getElementById('kbOpen');
  function loadRules() {
    return api('/editorial_rules?order=id.desc').then(function (rows) { state.rules = rows || []; state.rulesApi = true; })
      .catch(function (e) { state.rules = []; state.rulesApi = false; state.rulesErr = e.message; })
      .then(function () {
        var n = state.rules.filter(function (r) { return r.status === 'proposed'; }).length;
        var c = document.getElementById('kbCount');
        if (c) { c.textContent = n; c.classList.toggle('is-zero', !n); }
      });
  }
  function ruleHtml(r) {
    var meta = [RSCOPE[r.scope] || r.scope, r.field, r.category, r.city_slug].filter(Boolean).join(' · ');
    var src = (r.source_comment_ids || []).length ? ' · z ' + r.source_comment_ids.length + ' uwag' : (r.proposed_by === 'jp' ? ' · dodana przez JP' : '');
    var h = '<li class="adm-rule adm-rule--' + esc(r.status) + '" data-rule="' + esc(r.id) + '">' +
      '<div class="adm-rule__top"><span class="adm-chip' + (r.status === 'active' ? ' adm-chip--new' : r.status === 'proposed' ? ' adm-chip--chg' : '') + '">' + esc(RST[r.status] || r.status) + '</span>' +
      '<span class="adm-cm__meta">' + esc(meta + src) + (r.uses ? ' · użyta ' + esc(r.uses) + '×' : '') + '</span></div>';
    if (r.status === 'proposed') h += '<textarea class="adm-rule__edit" rows="2" aria-label="Treść reguły">' + esc(r.rule) + '</textarea>';
    else h += '<p class="adm-rule__txt">' + esc(r.rule) + '</p>';
    if (r.why) h += '<p class="adm-rule__why">Skąd: ' + esc(r.why) + '</p>';
    if (r.example_bad || r.example_good) h += '<p class="adm-rule__why">' + (r.example_bad ? 'Źle: „' + esc(r.example_bad) + '”' : '') + (r.example_good ? ' Dobrze: „' + esc(r.example_good) + '”' : '') + '</p>';
    h += '<div class="adm-rule__acts">' + (r.status === 'proposed'
      ? '<button type="button" class="qc-btn qc-btn--sm adm-btn-ok" data-rule-act="active">Zatwierdź regułę</button><button type="button" class="qc-btn qc-btn--sm adm-btn-no" data-rule-act="retired">Odrzuć</button>'
      : r.status === 'active' ? '<button type="button" class="qc-btn qc-btn--sm" data-rule-act="retired">Wyłącz</button>'
      : '<button type="button" class="qc-btn qc-btn--sm" data-rule-act="active">Włącz ponownie</button>') + '</div></li>';
    return h;
  }
  function openRules() {
    state.current = null; state.trip = null; state.versions = null; state.tabVersion = null; clearInterval(state.poll);
    $d.innerHTML = '<div class="adm-placeholder"><p>Ładuję bazę wiedzy…</p></div>';
    loadRules().then(function () {
      var R = state.rules, by = function (st) { return R.filter(function (r) { return r.status === st; }); };
      var html = '<div class="adm-trip__bar"><a class="qc-btn qc-btn--sm adm-back" href="#/">← Wszystkie wycieczki</a></div><article class="adm-sheet adm-kb"><header class="adm-sheet__head"><div><p class="label" style="color:inherit;opacity:.8">Baza wiedzy redakcji</p>' +
        '<h2 class="adm-sheet__title">Reguły z uwag</h2><p class="adm-sheet__sub">Hermes zamienia powtarzalne uwagi w reguły. Zatwierdzone reguły dostaje każde pisanie, poprawka, tłumaczenie i walidacja wycieczek — ten sam błąd nie wraca w kolejnych miastach.</p></div></header>';
      if (state.rulesApi === false) html += '<p class="adm-cmwarn">Baza nie ma jeszcze tabeli reguł (' + esc(state.rulesErr || '') + '). Pojawi się po approve SQL 2026-10-17-draft-send-kb-v2.sql.</p>';
      [['proposed', 'Do zatwierdzenia'], ['active', 'Obowiązują'], ['retired', 'Wyłączone']].forEach(function (g) {
        var list = by(g[0]);
        if (!list.length && g[0] === 'retired') return;
        html += '<section class="adm-sheet__sec"><h3>' + g[1] + ' <b class="adm-n' + (list.length ? '' : ' is-zero') + '">' + list.length + '</b></h3>' +
          (list.length ? '<ol class="adm-rules">' + list.map(ruleHtml).join('') + '</ol>' : '<p class="adm-empty">' + (g[0] === 'proposed' ? 'Nic nie czeka.' : 'Brak.') + '</p>') + '</section>';
      });
      html += '<section class="adm-sheet__sec"><h3>Dodaj regułę</h3><form class="adm-rule-add" id="ruleAdd" autocomplete="off">' +
        '<label for="ruleTxt">Treść (jedno zdanie, jak polecenie dla autora)</label><textarea id="ruleTxt" rows="2" maxlength="600" required></textarea>' +
        '<label for="ruleScope">Dotyczy</label><select id="ruleScope">' + Object.keys(RSCOPE).map(function (k) { return '<option value="' + k + '">' + esc(RSCOPE[k]) + '</option>'; }).join('') + '</select>' +
        '<div class="adm-send__row"><button type="submit" class="qc-btn adm-btn-ok">Dodaj jako obowiązującą</button><span class="adm-msg" id="ruleMsg" role="status"></span></div></form></section></article>';
      $d.innerHTML = html;
    });
  }
  if ($kb) $kb.addEventListener('click', function () { if (location.hash === '#/baza-wiedzy') route(); else location.hash = '#/baza-wiedzy'; });
  $d.addEventListener('click', function (e) { var b = e.target.closest('[data-reopen]'); if (b) openTrip(b.getAttribute('data-reopen'), null); });
  $d.addEventListener('click', function (e) {
    var b = e.target.closest('[data-rule-act]');
    if (!b) return;
    var li = b.closest('[data-rule]'), id = +li.getAttribute('data-rule'), ta = li.querySelector('.adm-rule__edit');
    b.disabled = true;
    api('/rpc/admin_rule_decide', { method: 'POST', body: { p_id: id, p_status: b.getAttribute('data-rule-act'), p_rule: ta ? ta.value.trim() : null } })
      .then(openRules).catch(function (err) { b.disabled = false; alertRow(li, err.message); });
  });
  $d.addEventListener('submit', function (e) {
    if (e.target.id !== 'ruleAdd') return;
    e.preventDefault();
    var t = document.getElementById('ruleTxt').value.trim(), sc = document.getElementById('ruleScope').value, m = document.getElementById('ruleMsg');
    if (t.length < 10) { m.className = 'adm-msg adm-msg--err'; m.textContent = 'Za krótka reguła.'; return; }
    api('/rpc/admin_rule_add', { method: 'POST', body: { p_rule: t, p_scope: sc } }).then(openRules)
      .catch(function (err) { m.className = 'adm-msg adm-msg--err'; m.textContent = 'Nie zapisano: ' + err.message; });
  });
  function alertRow(li, msg) { var p = document.createElement('p'); p.className = 'adm-msg adm-msg--err'; p.textContent = 'Nie zapisano: ' + msg; li.appendChild(p); }

  // ── start ────────────────────────────────────────────
  var env = document.getElementById('env');
  env.hidden = false;
  env.textContent = DEMO ? 'Dane testowe' : 'Baza na żywo';
  env.title = DEMO ? 'Nic nie trafia do bazy' : 'Decyzje zmieniają stronę';
  if (!DEMO) env.className = 'adm-env adm-env--live';
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshComments(); });
  // filtry: na komputerze zawsze rozwinięte (kolumna po lewej), na telefonie zwinięte nad wynikami
  var wide = window.matchMedia('(min-width:901px)');
  function fitFilters() { if (wide.matches) $fBox.open = true; }
  if (!wide.matches) $fBox.open = false;
  fitFilters();
  if (wide.addEventListener) wide.addEventListener('change', fitFilters);
  $fBox.addEventListener('toggle', function () { if (wide.matches && !$fBox.open) $fBox.open = true; });
  loadTrips();
  route();
  loadRules();
})();
