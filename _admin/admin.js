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
 * Skrzynka decyzji (2026-10-30, #/decyzje): wdrożenia, zgody na koszty z budżetem, strażnicy, szkice, zdjęcia do ikon — README §Skrzynka.
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

  // etykiety pól — jedna mapa dla panelu i kontroli: review-where.js (FIELD_PL, kopia w bin/review-where.cjs)
  var RW = window.ReviewWhere;
  function F_(k, fmt) { return fmt ? [k, RW.label(k), fmt] : [k, RW.label(k)]; }
  var CITY_FIELDS = [F_('duration_type', durLabel), F_('duration_hours'), F_('bandana_color'), F_('hero_image'), F_('route_url'), F_('travel_mode'), F_('region_slug')];
  var CITY_TR = [F_('title'), F_('subtitle'), F_('lead'), F_('good_to_know'), F_('local_food')];
  var STOP_TR = [F_('name'), F_('desc_paragraphs'), F_('kids_box'), F_('hint'), F_('local_flavor')];
  var STOP_FIELDS = [F_('category'), F_('time_label'), F_('visit_duration', minLabel), F_('price'), F_('year_built'), F_('maps_query'),
    F_('optional', yesNo), F_('sunset_spot', yesNo), F_('lat'), F_('lon')];
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
    if (/^\/pipeline_/.test(path)) return Promise.resolve(demoPipeline(path));
    var load = state.demo ? Promise.resolve(state.demo) : fetch('demo.json').then(function (r) { return r.json(); }).then(function (d) {
      d.comments = d.comments || [
        { id: 1, city_slug: 'spello', city_version: 1, stop_key: 'porta-consolare', field: 'kids_box', field_label: 'Misja dla dzieci', stop_version: 1,
          body: 'Misja za trudna dla 6-latka — uprość liczenie.', status: 'done', hermes_reply: 'Uproszczone w v2: liczymy tylko posągi nad bramą.', created_at: '2026-10-06T18:20:00Z' },
        { id: 2, city_slug: 'spello', city_version: 2, stop_key: 'belvedere-panoramico', field: 'time_label', field_label: 'Godzina', stop_version: 2,
          body: 'Zachód słońca w październiku ok. 18:30 — przesuń na 17:45.', status: 'seen', hermes_reply: null, created_at: '2026-10-16T09:02:00Z' }
      ];
      demoMore(d);
      d.iconRefs = d.iconRefs || [{ trip: 'spello', stop_key: 'porta-consolare', mode: 'pick', files: ['File:Porta Consolare (Spello) 2.jpg'], updated_at: '2026-10-30T09:00:00Z' }];
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
        .map(function (v) { return { city_slug: v.city_slug, version: v.version, status: v.status, source: v.source || 'manual', note: v.note || null, created_at: v.created_at || '2026-10-0' + v.version + 'T10:00:00Z', content: v.content, review: v.review || null, changes: v.changes || [] }; });
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
      if (/^\/icon_refs\?/.test(path)) {
        var tm = path.match(/trip=eq\.([^&]+)/);
        return (d.iconRefs || []).filter(function (r) { return !tm || r.trip === decodeURIComponent(tm[1]); });
      }
      if (path === '/rpc/admin_icon_refs_set') {
        var ib = opts.body; d.iconRefs = (d.iconRefs || []).filter(function (r) { return !(r.trip === ib.p_trip && r.stop_key === ib.p_stop_key); });
        var irow = ib.p_files == null ? { trip: ib.p_trip, stop_key: ib.p_stop_key, mode: null, files: [] }
          : { trip: ib.p_trip, stop_key: ib.p_stop_key, mode: ib.p_files.length ? 'pick' : 'auto', files: ib.p_files, updated_at: new Date().toISOString() };
        if (irow.mode) d.iconRefs.push(irow);
        return new Promise(function (res) { setTimeout(function () { res(irow); }, 200); });
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
      // uwagi z kontroli przy konkretnych polach (JP 2026-10-30): fakt bez źródła przy wstępie miasta i przy ciekawostce przystanku,
      // stara uwaga zbiorcza (rozbija się na flagi), pusty „lokalny smaczek” (flaga przy pierwszym przystanku z propozycji), automat
      (v3.content.city_translations || []).forEach(function (t) {
        if (t.lang === 'pl') t.lead = 'Spello jest zbudowane z biało-różowego wapienia z Monte Subasio, dlatego o zachodzie słońca całe miasteczko robi się różowe. Rzymianie nazywali je Hispellum.';
      });
      v3.content.stop_blocks_v2 = { 'porta-consolare': {
        marked: { curiosity: { text: 'Na szczycie bramy rośnie stary oliwny krzew — jego korzenie podobno trzymają kamienie od XVII wieku [1].' },
          legend: { text: 'Legenda mówi, że bramą wjechał do miasta cesarz Konstantyn.' }, pop_culture: null, fun_fact: { text: 'Brama ma trzy przejścia, ale używane jest tylko jedno [1].' } },
        state: { curiosity: { state: 'found' }, legend: { state: 'found' }, pop_culture: { state: 'none', checked: 'Wikipedia it, strona gminy' }, fun_fact: { state: 'found' } },
        sources: [{ n: 1, title: 'Porta Consolare (Spello) — Wikipedia', url: 'https://it.wikipedia.org/wiki/Porta_Consolare_(Spello)' }] } };
      v3.review = JSON.parse(JSON.stringify(v3.review || { errors: [], warnings: [] }));
      v3.review.warnings = (v3.review.warnings || []).concat([
        { stop_key: null, path: 'content.city.lead', quote: 'Spello jest zbudowane z biało-różowego wapienia z Monte Subasio',
          problem: '[nie blokuje] Fakt bez źródła — potrzebny link do Wikipedii albo strony lokalnej: Spello zbudowane z wapienia z Monte Subasio.' },
        { stop_key: 'porta-consolare', path: 'blocks.porta-consolare.curiosity', quote: 'jego korzenie podobno trzymają kamienie od XVII wieku',
          problem: '[nie blokuje] Fakt bez źródła — potrzebny link do Wikipedii albo strony lokalnej: wiek krzewu na bramie (XVII w.).' },
        { stop_key: null, problem: 'Fakty bez źródła (2) — potrzebny link do Wikipedii albo strony lokalnej: miasto robi się różowe o zachodzie słońca; Rzymianie nazywali Spello Hispellum' },
        { stop_key: null, problem: '[nie blokuje] local_flavor jest pusty w dwóch przystankach — dopisz tradycję albo święto, np. przy Belvedere (Infiorata w czerwcu).' },
        { stop_key: 'parking-villa-dei-mosaici', path: 'meta.stops.parking-villa-dei-mosaici.price', problem: '[nie blokuje] Zasada #10: cena parkingu bez źródła.',
          resolved: { action: 'cena zamieniona na „sprawdź na miejscu” (brak cennika na stronie gminy)', url: 'https://www.comune.spello.pg.it/', source_title: 'Comune di Spello' } }
      ]);
      // porównanie wersji (JP 2026-10-30): zmiany słów v2 → v3 i skąd się wzięły (changes[].why jak z gemini-draft / source-check)
      var tv3 = function (id) { return (v3.content.stop_translations || []).filter(function (t) { return t.lang === 'pl' && t.stop_id === id; })[0] || {}; };
      tv3(59).desc_paragraphs = [tv3(59).desc_paragraphs[0], 'Odsłonięta część rezydencji pokazuje, jak bogato mieszkano w rzymskim Hispellum — mozaiki zajmują kilkanaście pomieszczeń.'];
      tv3(65).kids_box = 'Rodzinna lornetka bez lornetki. Każdy wybiera jeden szczegół widoku — wzgórze, wieżę albo drogę — i opisuje go tak, żeby reszta go znalazła.';
      tv3(58).kids_box = 'Czy wiecie, że wielkie odkrycia bywają dziełem przypadku? Zanim wejdziemy do willi, zgadnijcie: co koparka odsłoniła jako pierwsze?';
      v3.changes = [
        { path: 'content.stops.villa-dei-mosaici.desc_paragraphs', before: 'Około 500 m² odsłoniętej części rezydencji', after: 'Odsłonięta część rezydencji', auto: true,
          why: 'source-check: złagodzone — „około 500 m²” bez potwierdzenia w źródle https://it.wikipedia.org/wiki/Villa_romana_di_Spello' },
        { path: 'content.stops.belvedere-panoramico.kids_box', why: '- [Misja dla dzieci] ✓ Popraw według propozycji' },
        { path: 'meta.stops.belvedere-panoramico.time_label', before: '18:15', after: '17:45', why: '- [Godzina] Zachód słońca w październiku ok. 18:30 — przesuń na 17:45.' },
        { path: 'content.city.lead', why: '- [Wstęp] Wstęp za długi — dwa zdania wystarczą.' },
        { before: 'największe odkrycia są czasem', after: 'wielkie odkrycia bywają', why: 'pytanie z kontroli: zgoda JP na propozycję', auto: true }
      ];
      v3.note = 'Poprawki JP (uwagi #2, #3) i source-check';
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
  // Wersje wytycznych (JP 2026-10-25): content.guidelines = 'v02', 'v03'… — wersja, z którą szkic przeszedł kontrolę i poprawki.
  // „old” = sprzed nowego procesu (archiwum). Filtr pokazuje wersje od najnowszej: za dwa lata „v51” vs starsze → co uzupełnić.
  function stdLabel(k) { return k === 'old' ? 'Stare (archiwum)' : 'Wytyczne ' + k; }
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
        flags: Array.isArray(s.flags) ? s.flags : [], std: Array.isArray(s.std) ? s.std.filter(function (k) { return k === 'old' || /^v\d{2}$/.test(k); }) : [], sort: SORTS[s.sort] ? s.sort : 'new', letter: typeof s.letter === 'string' ? s.letter : '', q: typeof s.q === 'string' ? s.q : '' };
    }
    return f;
  }
  function saveFilters() { lsSet(FILTERS, state.f); }

  function tripOf(r, box) {
    var t = { slug: r.city_slug, name: r.city_name || titleCase(r.city_slug), country: r.country ? String(r.country).toLowerCase() : '',
      region: r.region_slug || '', color: r.bandana_color || '#0B4EA2', latest: r.latest_version, latestStatus: r.latest_status,
      latestAt: r.latest_at, stops: r.stops_count, draft: r.draft_version, published: r.published_version,
      versions: r.versions_count || 1, std: r.guidelines || (r.workflow === 'v2' ? 'v02' : 'old'), glOk: r.guidelines_ok === true, working: r.comments_working || 0, unsent: (r.comments_unsent || 0) + (box[r.city_slug] || 0) };
    t.status = t.draft != null ? 'draft' : t.published != null ? 'published' : (t.latestStatus || 'archived');
    t.letter = letterOf(t.name);
    return t;
  }
  // bez widoku admin_trips: lista z kolejki szkiców + lekkich wierszy wszystkich wersji (ścieżki JSON w select, bez treści)
  function tripsFallback() {
    return Promise.all([
      api('/admin_queue'),
      api('/admin_versions?select=city_slug,version,status,created_at,country:content->city->>country,region:content->city->>region_slug,color:content->city->>bandana_color,workflow:content->>workflow,guidelines:content->>guidelines,glok:content->>guidelines_ok&order=version.asc'),
      api('/draft_comments?select=city_slug,city_version,status').catch(function () { return []; })
    ]).then(function (res) {
      var by = {}, names = {}, stops = {};
      (res[0] || []).forEach(function (q) { names[q.city_slug] = q.city_name; stops[q.city_slug] = q.stops_count; });
      (res[1] || []).forEach(function (v) {
        var r = by[v.city_slug] = by[v.city_slug] || { city_slug: v.city_slug, versions_count: 0, comments_working: 0, comments_unsent: 0 };
        r.versions_count++;
        if (r.latest_version == null || v.version > r.latest_version) {
          r.latest_version = v.version; r.latest_status = v.status; r.latest_at = v.created_at;
          r.country = v.country; r.region_slug = v.region; r.bandana_color = v.color; r.workflow = v.workflow; r.guidelines = v.guidelines; r.guidelines_ok = v.glok === 'true';
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
    var stdKeys = {}; T.forEach(function (t) { stdKeys[t.std] = 1; }); f.std.forEach(function (k) { stdKeys[k] = 1; });
    var stdOrder = Object.keys(stdKeys).sort(function (a, b) { return a === 'old' ? 1 : b === 'old' ? -1 : b.localeCompare(a, 'pl', { numeric: true }); });
    document.getElementById('fStd').innerHTML = facet('std', stdOrder, stdLabel, f);
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
      '<span class="adm-std adm-std--' + (t.std === 'old' ? 'old' : t.glOk ? 'v2' : 'fix') + '" title="wersja wytycznych, z którą szkic przeszedł kontrolę i poprawki">' +
        (t.std === 'old' ? 'stare wytyczne' : 'wytyczne ' + esc(t.std) + (t.glOk ? ' ✓' : ' · uwagi')) + '</span></span>' +
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
  // etykieta wersji: rundy poprawek to podwersje v5a, v5b… (content.label), reszta vN
  function vlab(r) { return (r && r.content && r.content.label) || 'v' + r.version; }
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
    document.body.classList.toggle('is-prog', h === '#/postep' || h === '#/koszty' || h === '#/zgloszenia' || h === '#/decyzje');
    if (h === '#/decyzje') { showDetail(); window.scrollTo(0, 0); openDecisions(); return; }
    if (h === '#/baza-wiedzy') { showDetail(); window.scrollTo(0, 0); openRules(); return; }
    if (h === '#/postep') { showDetail(); window.scrollTo(0, 0); openProgress(); return; }
    if (h === '#/koszty') { showDetail(); window.scrollTo(0, 0); openCosts(); return; }
    if (h === '#/zgloszenia') { showDetail(); window.scrollTo(0, 0); openFeedback(); return; }
    var m = /^#\/([^/]+)(?:\/v(\d+))?$/.exec(h);
    if (m) { openTrip(decodeURIComponent(m[1]), m[2] ? +m[2] : null); return; }
    showList();
  }
  window.addEventListener('hashchange', function () { var h = location.hash; if (!h || h === '#' || h.indexOf('#/') === 0) route(); });
  // kotwice w szkicu (#st-…, #send) przewijamy ręcznie — adres zostaje #/<miasto>, więc „wstecz” i odświeżenie działają
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#st-"], a[href^="#cmp-"], a[href="#send"]');
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
    var vq = '/admin_versions?city_slug=eq.' + encodeURIComponent(slug) + '&select=city_slug,version,status,source,note,created_at,content,review';
    Promise.all([
      // changes (skąd zmiana — porównanie wersji); gdyby widok nie miał tej kolumny, panel działa dalej bez niej
      api(vq + ',changes&order=version.asc').catch(function (e) { if (e && e.session) throw e; return api(vq + '&order=version.asc'); }),
      loadComments(slug),
      loadToken(slug),
      loadIconRefs(slug)
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
        ' aria-selected="' + cur + '" tabindex="' + (cur ? 0 : -1) + '"><span class="adm-tab__v">' + esc(vlab(r)) + ' · ' + esc(dayMonth(r.created_at)) + '</span>' +
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
    var it = { label: (row.content || {}).label || null, city_slug: T.slug, version: row.version, status: row.status, source: row.source, note: row.note, created_at: row.created_at, review: row.review || null,
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
  // ── Uwagi z kontroli jako FLAGI przy konkretnym fragmencie (JP 2026-10-30; wcześniej czerwone ramki przy przystanku, 2026-10-26).
  // Stała zasada JP: każda uwaga stoi PRZY KONKRETNEJ INFORMACJI — w polu, którego dotyczy. Cytowany fragment jest podświetlony
  // i ma małą czerwoną flagę; klik otwiera notatkę (popover przy fragmencie) z nazwą pola po polsku, treścią uwagi, kilkoma
  // możliwościami z rekomendacją i polem odpowiedzi. Uwaga bez cytatu → flaga przy nazwie pola; bez pola → przy „Cały przystanek” /
  // „Cała wycieczka”. Pole ustala review-where.js: path z kontroli → cytat → kluczowe słowa faktu → nazwa pola w uwadze (bez AI).
  // Uwagi zbiorcze ze starych kontroli („Fakty bez źródła (3)…”) są rozbite: każdy fakt to osobna flaga, odpowiedź w polu review.w.N.j.
  // Odpowiedź = zwykła uwaga (pole review.e.N / review.w.N[.j]) — idzie przyciskiem „Wyślij uwagi do poprawki”; serwer (gemini-draft reviseMain):
  // „✓” = podmiana stare → nowe, „✂” = usunięcie fragmentu (stare albo cytat po dwukropku), „✗” = bez zmian.
  // Uwaga z polem `resolved` (rozstrzygnięta automatycznie przed JP) = szara flaga do wglądu, bez odpowiedzi.
  var QA_YES = '✓ Popraw według propozycji', QA_CUT = '✂ Usuń fragment', QA_NO = '✗ Zostaw bez zmian';
  var QA_OPT = { fix: 'Popraw według propozycji', cut: 'Usuń fragment', keep: 'Zostaw bez zmian', own: 'Własna decyzja' };
  var QA_BODY = { fix: QA_YES, cut: QA_CUT, keep: QA_NO };
  var FLAG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 2.5a1 1 0 0 1 1 1V4h11.2a1 1 0 0 1 .8 1.6L15.6 9l2.4 3.4a1 1 0 0 1-.8 1.6H6v7a1 1 0 1 1-2 0V3.5a1 1 0 0 1 1-1z"/></svg>';
  function qaPlural(n) { var d = n % 10, t = n % 100; return n === 1 ? 'pytanie' : d >= 2 && d <= 4 && (t < 12 || t > 14) ? 'pytania' : 'pytań'; }
  function plForm(n, one, few, many) { var d = n % 10, t = n % 100; return n + ' ' + (n === 1 ? one : d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many); }
  function qaProblem(e) { return RW.humanize(String(e && e.problem || '').replace(/^\[(nie blokuje|drobiazg)\]\s*/i, '')); }
  function qaGroupKey(e) { var m = String(e && e.problem || '').replace(/^\[(nie blokuje|drobiazg)\]\s*/i, '').match(/^(Zasada #\d+|Walidator|[^:(—]{3,40}?)\s*[:(—]/); return m ? m[1].trim() : 'Inne'; }
  function qaHasOld(e) { return e != null && e.old != null && String(e.old) !== ''; }
  function qaHasNew(e) { return e != null && e['new'] != null && String(e['new']) !== ''; }
  function qaCutText(x) { return qaHasOld(x.e) ? String(x.e.old) : (x.quote || ''); }   // co usunie „✂”
  function qaId(x) { return x.id.replace(/\./g, '-'); }
  // rozstrzygnięcie automatyczne (inny krok procesu): tekst albo {action|what|summary|text, url|source_url|source, source_title}
  function qaAuto(e) {
    var r = e && e.resolved; if (!r) return null;
    if (typeof r !== 'object') return { what: r === true ? 'poprawione przed kontrolą JP' : String(r), url: null, title: null };
    var url = r.url || r.source_url || (/^https?:/.test(r.source || '') ? r.source : null);
    var ACT = { source_added: 'źródło dopisane', softened: 'zdanie złagodzone', removed: 'fragment usunięty (sprzeczny ze źródłem)', kept: 'zostawione bez zmian, brak źródła (notatka dla redakcji)', added: 'dopisane po potwierdzeniu', dropped: 'propozycja porzucona (brak źródła)' };
    return { what: r.what || r.summary || r.text || r.note || ACT[r.action] || r.action || 'poprawione przed kontrolą JP', url: url, title: r.source_title || r.title || null };
  }
  // Rekomendacja — deterministyczna, bez AI. Zwraca { opt: 'fix'|'cut'|'keep'|'own', why: krótki powód }.
  function qaRecommend(x) {
    var e = x.e, p = qaProblem(e), hasOld = !!qaCutText(x), hasNew = qaHasNew(e);
    if (x.block) {
      if (hasNew) return { opt: 'fix', why: 'błąd blokujący, poprawka gotowa' };
      if (hasOld && /sprzeczn|niezgodn|zdradza/i.test(p)) return { opt: 'cut', why: 'fakt niezgodny ze źródłem — bezpieczniej usunąć' };
      return { opt: 'own', why: 'kontrola nie podała gotowej poprawki' };
    }
    if (!hasNew && hasOld && /Zasada #10|nie ma w źródle|bez źródła/i.test(p)) return { opt: 'keep', why: 'fakt niesporny, tylko brak przypisu' };
    if (hasNew && /styl|powtórz|gramaty|literówk|interpunk/i.test(p)) return { opt: 'fix', why: 'drobna poprawka językowa, gotowa' };
    if (hasNew && /sprawdź na miejscu/i.test(String(e['new']))) return { opt: 'fix', why: 'ujednolicenie do „sprawdź na miejscu”' };
    return { opt: 'keep', why: 'ostrzeżenie nie blokuje publikacji' };
  }
  // lista uwag do wersji: najpierw błędy, potem ostrzeżenia wg grup; każda z miejscem (przystanek + pole + cytat)
  function qaItems(it, keys, draft) {
    var rv = it && it.review || {}, out = [], groups = {}, order = [], n = 0;
    var F = RW.fieldsFromContent(draft, function (s) { return stopKey(s, draft.stop_translations); });
    var all = RW.expand(rv).map(function (t) { return { k: t.k, i: t.i, j: t.j, e: t.e || {}, block: t.k === 'e', id: RW.itemId(t) }; });
    all.forEach(function (x) { if (x.block) { x.g = 'Blokujące'; x.n = ++n; out.push(x); } });
    all.forEach(function (x) {
      if (x.block) return;
      var g = qaGroupKey(x.e); x.g = g;
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(x);
    });
    if (order.indexOf('Inne') >= 0) { order.splice(order.indexOf('Inne'), 1); order.push('Inne'); }   // „Inne” zawsze na końcu
    order.forEach(function (g) { groups[g].forEach(function (x) { x.n = ++n; out.push(x); }); });
    out.forEach(function (x) {
      var w = RW.locate(x.e, F);
      x.box = w.stop && keys && keys[w.stop] != null ? w.stop : '_city';
      x.orphan = w.stop && x.box === '_city' ? w.stop : null;          // przystanek spoza szkicu → „Cała wycieczka”
      x.fkey = x.orphan ? null : w.field;
      x.field = x.fkey ? (x.box === '_city' ? 'city.' : 'stop.') + x.fkey : null;
      x.quote = x.orphan ? null : w.quote;
      x.path = w.path; x.auto = qaAuto(x.e);
      var sn = x.box === '_city' ? null : keys[x.box];
      x.where = x.orphan ? 'Przystanek „' + x.orphan + '” (nie ma go w szkicu)'
        : x.box === '_city' ? (x.fkey ? 'Opis miasta · ' + RW.label(x.fkey) : 'Cała wycieczka · ogólne')
        : 'Przystanek ' + (sn != null ? sn : '?') + ' · ' + (x.fkey ? RW.label(x.fkey) : 'cały przystanek');
    });
    return { list: out, order: order, groups: groups, F: F };
  }
  // uwagi do konkretnego pola (field null = pole ogólne „Cały przystanek” / „Cała wycieczka”)
  function qaFor(box, field) { return (state.qa ? state.qa.list : []).filter(function (x) { return x.box === box && x.field === (field || null); }); }
  // pola z flagą, których zwykły widok nie pokazuje (np. godziny otwarcia, zadanie foto, plan dnia) → dodatkowy wiersz
  function qaExtraRows(box, shown, ver) {
    var seen = {};
    return (state.qa ? state.qa.list : []).filter(function (x) {
      if (x.box !== box || !x.field || shown[x.field] || seen[x.field]) return false; seen[x.field] = 1; return true;
    }).map(function (x) {
      var f = state.qa.F.list.filter(function (y) { return y.path === x.path; })[0];
      return cell(RW.label(x.fkey), null, f && f.text ? f.text : '(puste)', null, false,
        commentBox(box === '_city' ? null : box, x.field, RW.label(x.fkey), ver), { box: box, field: x.field });
    }).join('');
  }
  function flagBtn(x) {
    return '<button type="button" class="adm-flag' + (x.auto ? ' adm-flag--auto' : x.block ? ' is-block' : '') + '" data-flag="' + qaId(x) + '" aria-expanded="false" aria-controls="q-' + qaId(x) + '"' +
      ' aria-label="' + esc((x.auto ? 'Rozstrzygnięte automatycznie' : 'Uwaga ' + x.n) + ': ' + x.where) + '" title="' + esc(x.where) + '">' + FLAG + '<span class="adm-flag__n">' + (x.auto ? '✓' : x.n) + '</span></button>';
  }
  // treść pola z podświetlonymi fragmentami i flagami; zwraca { html, rest: uwagi bez fragmentu w tekście }
  function qaHighlight(text, list) {
    var spans = [], rest = [];
    list.forEach(function (x) {
      var q = x.quote, i = q ? text.indexOf(q) : -1;
      if (q && i < 0) { var r = RW.exactIn(text, q); if (r) { q = r; i = text.indexOf(r); } }
      if (i < 0 || spans.some(function (s) { return i < s.b && i + q.length > s.a; })) { rest.push(x); return; }
      spans.push({ a: i, b: i + q.length, x: x });
    });
    spans.sort(function (p, q) { return p.a - q.a; });
    var h = '', at = 0;
    spans.forEach(function (s) {
      h += esc(text.slice(at, s.a)) + '<mark class="adm-fl' + (s.x.auto ? ' adm-fl--auto' : '') + '" data-flag="' + qaId(s.x) + '">' + esc(text.slice(s.a, s.b)) + '</mark>' + flagBtn(s.x);
      at = s.b;
    });
    return { html: h + esc(text.slice(at)), rest: rest };
  }
  function qaOptHtml(x, opt, rec, detail) {
    var on = rec.opt === opt;
    return '<button type="button" class="adm-qo' + (on ? ' is-rec' : '') + '" data-qa="' + opt + '">' +
      '<span class="adm-qo__radio" aria-hidden="true"></span><span class="adm-qo__main"><span class="adm-qo__t">' + esc(QA_OPT[opt]) + (opt === 'own' ? '…' : '') +
      (on ? ' <span class="adm-qo__rec">Rekomendacja</span>' : '') + '</span>' + (detail || '') +
      (on ? '<span class="adm-qo__why">' + esc(rec.why) + '</span>' : '') + '</span></button>';
  }
  // notatka (popover) jednej uwagi — w wierszu pola, otwierana flagą
  function qaItemHtml(x) {
    var e = x.e, cut = qaCutText(x), hasNew = qaHasNew(e), rec = qaRecommend(x);
    var head = '<p class="adm-pop__where">' + esc(x.where) + '</p><button type="button" class="adm-pop__x" data-pop-close aria-label="Zamknij notatkę">×</button>';
    if (x.auto) {
      return '<li class="adm-q__it adm-pop is-auto" id="q-' + qaId(x) + '" data-qid="' + qaId(x) + '" data-qk="' + esc(x.box) + '" role="dialog" aria-label="' + esc(x.where) + '">' + head +
        '<p class="adm-q__head"><span class="adm-q__tag adm-q__tag--auto">rozstrzygnięte automatycznie</span></p>' +
        '<p class="adm-q__txt">' + esc(qaProblem(e)) + '</p>' + (x.quote ? '<p class="adm-q__frag">Fragment: „' + esc(x.quote) + '”</p>' : '') +
        '<p class="adm-q__auto"><b>Rozstrzygnięte automatycznie:</b> ' + esc(RW.humanize(x.auto.what)) +
        (x.auto.url ? ' — <a href="' + esc(x.auto.url) + '" target="_blank" rel="noopener">' + esc(x.auto.title || 'źródło') + '</a>' : '') + '</p></li>';
    }
    var opts = '';
    if (!state.readOnly) {
      opts = '<div class="adm-qo__list" role="group" aria-label="Rozstrzygnięcie uwagi ' + x.n + '">' +
        (hasNew ? qaOptHtml(x, 'fix', rec, '<span class="adm-qo__d">' + (qaHasOld(e) ? '<del>' + esc(e.old) + '</del> → ' : '') + '<ins>' + esc(e['new']) + '</ins></span>') : '') +
        (cut ? qaOptHtml(x, 'cut', rec, '<span class="adm-qo__d"><del>' + esc(cut) + '</del></span>') : '') +
        qaOptHtml(x, 'keep', rec, '') +
        qaOptHtml(x, 'own', rec, '<span class="adm-qo__d">wpisz, co zrobić</span>') + '</div>';
    }
    var prop = state.readOnly && (qaHasOld(e) || hasNew) ? '<p class="adm-q__prop">Propozycja: ' + (qaHasOld(e) ? '<del>' + esc(e.old) + '</del>' : '') + (qaHasOld(e) && hasNew ? ' → ' : '') + (hasNew ? '<ins>' + esc(e['new']) + '</ins>' : '') + '</p>' : '';
    var fix = e.fix ? '<p class="adm-q__prop">Wskazówka kontroli: ' + esc(RW.humanize(e.fix)) + '</p>' : '';
    var frag = x.quote ? '<p class="adm-q__frag">Fragment: „' + esc(x.quote) + '”</p>' : '';
    var stop = x.box === '_city' ? (e.stop_key || null) : x.box;
    return '<li class="adm-q__it adm-pop' + (x.block ? ' is-block' : '') + '" id="q-' + qaId(x) + '" data-qid="' + qaId(x) + '" data-qk="' + esc(x.box) + '" data-qg="' + esc(x.g) + '" data-rec="' + rec.opt + '"' +
      (hasNew ? ' data-fixable' : '') + (cut ? ' data-cut="' + esc(cut) + '"' : '') + ' role="dialog" aria-label="' + esc('Uwaga ' + x.n + ': ' + x.where) + '">' + head +
      '<p class="adm-q__head"><b>' + x.n + '.</b> <span class="adm-q__tag' + (x.block ? '' : ' adm-q__tag--w') + '">' + (x.block ? 'blokuje' : 'ostrzeżenie') + '</span>' +
      '<span class="adm-q__done"><span class="adm-q__ok" aria-hidden="true">✓</span> Rozstrzygnięte: <b class="adm-q__ans"></b>' +
      (state.readOnly ? '' : ' <button type="button" class="adm-linkbtn" data-qa-change>Zmień</button>') + '</span></p>' +
      '<div class="adm-q__body"><p class="adm-q__txt">' + esc(qaProblem(e)) + '</p>' + frag + prop + fix + opts +
      '<div class="adm-q__own">' + commentBox(stop, x.id, 'Uwaga ' + x.n + ' · ' + x.where) + '</div></div>' +
      '<p class="adm-pop__next"><button type="button" class="adm-linkbtn" data-flag-next>Następna flaga →</button></p></li>';
  }
  // skrót na górze szkicu: pasek „Flagi: N — przejdź do następnej”, linki do przystanków, przyciski grupowe
  function questionsHtml(it) {
    var q = state.qa; if (!q || !q.list.length) return '';
    var byBox = {}, boxes = [], auto = 0;
    q.list.forEach(function (x) { if (x.auto) { auto++; return; } if (!byBox[x.box]) { byBox[x.box] = 0; boxes.push(x.box); } byBox[x.box]++; });
    var links = boxes.map(function (k) {
      var nm = k === '_city' ? 'Opis miasta' : (stopName(k) || k);
      return '<li><a href="#st-' + esc(k) + '" class="adm-qs__lnk" data-qlink="' + esc(k) + '"><span>' + esc(nm) + '</span> <b class="adm-n" data-qleft="' + esc(k) + '">' + byBox[k] + '</b></a></li>';
    }).join('');
    var grp = state.readOnly ? '' : q.order.map(function (g) {
      var list = q.groups[g].filter(function (x) { return !x.auto; }), fixable = list.some(function (x) { return qaHasNew(x.e); });
      if (!list.length) return '';
      return '<div class="adm-q__grp" data-g="' + esc(g) + '"><p class="adm-q__gh">' + esc(RW.humanize(g)) + ' · ' + list.length + ' ' + qaPlural(list.length) + ' <small class="adm-q__gsum"></small></p>' +
        '<div class="adm-q__bulk">' + (fixable ? '<button type="button" class="qc-btn qc-btn--sm" data-qa-all="fix">Popraw wszystkie wg propozycji</button>' : '') +
        '<button type="button" class="qc-btn qc-btn--sm qc-btn--ghost" data-qa-all="keep">Zostaw wszystkie</button>' +
        '<span class="adm-q__prog" role="status" aria-live="polite"></span></div></div>';
    }).join('');
    return '<div class="adm-flagbar"><span class="adm-flagbar__ic" aria-hidden="true">' + FLAG + '</span><h3>Flagi: <b data-qleft-all>0</b></h3>' +
      '<button type="button" class="qc-btn qc-btn--sm" data-flag-next>Przejdź do następnej</button>' +
      (state.readOnly ? '' : '<button type="button" class="qc-btn qc-btn--sm adm-flagbar__rec" data-qa-recall aria-haspopup="dialog">Przyjmij wszystkie rekomendacje</button>') +
      '<span class="adm-flagbar__sum" data-qsum></span></div>' +
      '<p class="adm-q__hint">Każda uwaga z kontroli stoi przy fragmencie, którego dotyczy — czerwona flaga w treści pola. Kliknij flagę, wybierz jedną z możliwości (rekomendacja jest zaznaczona); potem „Wyślij uwagi do poprawki”.' +
      (auto ? ' Szare flagi (' + auto + ') rozstrzygnięto automatycznie — tylko do wglądu.' : '') + '</p>' +
      '<ul class="adm-qs__stops">' + links + '</ul>' +
      (grp ? '<details class="adm-q__grps"><summary class="adm-q__gh">Całe grupy uwag naraz</summary>' + grp + '</details>' : '');
  }
  function qaLastBody(li) {
    var box = li.querySelector('.adm-cm'); if (!box) return null;
    var list = commentsFor(box.getAttribute('data-stop') || null, box.getAttribute('data-field') || null);
    return { n: list.length, body: list.length ? String(list[list.length - 1].body || '') : '' };
  }
  function qaAnsLabel(body) {
    if (body.indexOf('✓') === 0) return QA_OPT.fix;
    if (body.indexOf('✂') === 0) return QA_OPT.cut;
    if (body.indexOf('✗') === 0) return QA_OPT.keep;
    return QA_OPT.own + ': ' + (body.length > 80 ? body.slice(0, 80) + '…' : body);
  }
  // stan wszystkich uwag: rozstrzygnięta = jest odpowiedź do pola (nowsza niż moment kliknięcia „Zmień”)
  function qaRefresh() {
    var items = $d.querySelectorAll('.adm-q__it:not(.is-auto)');
    var left = {}, leftB = 0, leftW = 0, all = items.length, done = 0;
    [].forEach.call(items, function (li) {
      var c = qaLastBody(li); if (!c) return;
      var seen = +(li.getAttribute('data-seen') || 0), isDone = c.n > seen;
      if (li.classList.contains('is-pending')) isDone = true;
      li.classList.toggle('is-done', isDone);
      if (isDone && c.n > seen) { li.classList.remove('is-own'); li.querySelector('.adm-q__ans').textContent = qaAnsLabel(c.body); }
      [].forEach.call($d.querySelectorAll('[data-flag="' + li.getAttribute('data-qid') + '"]'), function (f) { f.classList.toggle('is-done', isDone); });
      if (isDone) { done++; return; }
      if (li.classList.contains('is-block')) leftB++; else leftW++;
      var k = li.getAttribute('data-qk') || '_city';
      left[k] = (left[k] || 0) + 1;
    });
    [].forEach.call(document.querySelectorAll('[data-qleft]'), function (el) {
      var n = left[el.getAttribute('data-qleft')] || 0;
      el.textContent = n; el.classList.toggle('is-zero', !n);
      if (el.classList.contains('adm-qdot')) { el.hidden = !n; el.title = n ? plForm(n, 'flaga', 'flagi', 'flag') + ' do rozstrzygnięcia' : ''; }
    });
    var allEl = document.querySelector('[data-qleft-all]'); if (allEl) allEl.textContent = leftB + leftW;
    [].forEach.call(document.querySelectorAll('.adm-flagbar [data-flag-next], .adm-flagbar [data-qa-recall]'), function (b) { b.disabled = !(leftB + leftW); });
    var sum = document.querySelector('[data-qsum]');
    if (sum) sum.textContent = (leftB || leftW ? plForm(leftB, 'blokująca', 'blokujące', 'blokujących') + ', ' + plForm(leftW, 'ostrzeżenie', 'ostrzeżenia', 'ostrzeżeń') : 'wszystko rozstrzygnięte ✓') +
      ' · rozstrzygnięte ' + done + ' z ' + all;
    var rq = document.getElementById('revQs');
    if (rq) rq.classList.toggle('is-clear', !leftB && !leftW);
    [].forEach.call(document.querySelectorAll('.adm-q__grp[data-g]'), function (g) {
      var key = g.getAttribute('data-g'), its = [].filter.call(items, function (li) { return li.getAttribute('data-qg') === key; });
      var d = its.filter(function (li) { return li.classList.contains('is-done'); }).length, gs = g.querySelector('.adm-q__gsum');
      if (gs) gs.textContent = d === its.length ? '✓ wszystkie rozstrzygnięte' : 'rozstrzygnięte ' + d + ' z ' + its.length;
      g.classList.toggle('is-done', d === its.length);
      if (!g.classList.contains('is-busy')) [].forEach.call(g.querySelectorAll('[data-qa-all]'), function (b) {
        b.disabled = !its.some(function (li) { return !li.classList.contains('is-done') && (b.getAttribute('data-qa-all') !== 'fix' || li.hasAttribute('data-fixable')); });
      });
    });
    if (state.popLi) popPlace(state.popLi);
  }
  // ── notatka przy fladze: popover w wierszu pola (nie modal); Esc / klik obok zamyka ──
  function flagAnchor(id) { return $d.querySelector('button.adm-flag[data-flag="' + id + '"]'); }
  function popPlace(li) {
    var row = li.closest('.adm-row'), fl = flagAnchor(li.getAttribute('data-qid')); if (!row || !fl) return;
    var rr = row.getBoundingClientRect(), fr = fl.getBoundingClientRect(), w = Math.min(600, rr.width);
    li.style.width = w + 'px';
    li.style.left = Math.max(0, Math.min(fr.left - rr.left - 20, rr.width - w)) + 'px';
    li.style.top = (fr.bottom - rr.top + 8) + 'px';
    li.style.setProperty('--tip', Math.max(16, Math.min(fr.left - rr.left - parseFloat(li.style.left) + fr.width / 2, w - 16)) + 'px');
  }
  function popClose(focusFlag) {
    var li = state.popLi; if (!li) return;
    li.classList.remove('is-open'); state.popLi = null;
    var row = li.closest('.adm-row'); if (row) row.classList.remove('has-pop');
    [].forEach.call($d.querySelectorAll('[data-flag="' + li.getAttribute('data-qid') + '"]'), function (f) { f.classList.remove('is-on'); if (f.tagName === 'BUTTON') f.setAttribute('aria-expanded', 'false'); });
    var fl = flagAnchor(li.getAttribute('data-qid')); if (focusFlag && fl) fl.focus();
  }
  function popOpen(id) {
    var li = document.getElementById('q-' + id); if (!li) return;
    if (state.popLi === li) { popClose(true); return; }
    popClose();
    state.popLi = li; li.classList.add('is-open');
    var row = li.closest('.adm-row'); if (row) row.classList.add('has-pop');
    [].forEach.call($d.querySelectorAll('[data-flag="' + id + '"]'), function (f) { f.classList.add('is-on'); if (f.tagName === 'BUTTON') f.setAttribute('aria-expanded', 'true'); });
    popPlace(li);
    var r = li.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 90 || r.top < 70) window.scrollBy({ top: r.top < 70 ? r.top - 120 : Math.min(r.bottom - window.innerHeight + 110, r.top - 120) });
    var first = li.querySelector('.adm-qo.is-rec') || li.querySelector('.adm-qo') || li.querySelector('[data-pop-close]');
    if (first) first.focus({ preventScroll: true });
  }
  function flagNext() {
    var flags = [].slice.call($d.querySelectorAll('button.adm-flag:not(.adm-flag--auto):not(.is-done)'));
    if (!flags.length) return;
    var cur = state.popLi ? flagAnchor(state.popLi.getAttribute('data-qid')) : null, i = cur ? flags.indexOf(cur) : -1, nx = null;
    if (cur && i < 0) nx = flags.filter(function (f) { return cur.compareDocumentPosition(f) & 4; })[0];
    else if (cur) nx = flags[i + 1];
    else nx = flags.filter(function (f) { return f.getBoundingClientRect().top > 80; })[0];
    nx = nx || flags[0];
    popClose();
    nx.scrollIntoView({ block: 'center' });
    popOpen(nx.getAttribute('data-flag'));
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.popLi) { e.preventDefault(); popClose(true); } });
  window.addEventListener('resize', function () { if (state.popLi) popPlace(state.popLi); });
  // zapis odpowiedzi — kolejka: jedna uwaga naraz, każda uwaga najwyżej raz (do kliknięcia „Zmień”)
  var qaQueue = Promise.resolve();
  function qaAnswer(li, opt) {
    if (!li || !QA_BODY[opt] || li.classList.contains('is-pending') || li.classList.contains('is-done')) return qaQueue;
    var form = li.querySelector('.adm-cm__form'); if (!form) return qaQueue;
    var body = QA_BODY[opt];
    // „✂” bez cytatu z kontroli (stare uwagi, fakty bez źródła): fragment po dwukropku — serwer usuwa dokładnie ten tekst
    if (opt === 'cut' && li.hasAttribute('data-cut') && !li.querySelector('.adm-qo[data-qa="fix"]')) body = QA_CUT + ': „' + li.getAttribute('data-cut') + '”';
    li.classList.add('is-pending', 'is-done'); li.classList.remove('is-own');
    li.querySelector('.adm-q__ans').textContent = QA_OPT[opt] + ' (zapisuję…)';
    qaRefresh();
    qaQueue = qaQueue.then(function () {
      form.querySelector('textarea').value = body;
      return sendComment(form);
    }).catch(function (e) { if (window.console) console.error('Uwaga z kontroli:', e); })
      .then(function () { li.classList.remove('is-pending'); qaRefresh(); });
    return qaQueue;
  }
  document.addEventListener('click', function (e) {
    var f = e.target.closest('[data-flag]');
    if (f) { e.preventDefault(); popOpen(f.getAttribute('data-flag')); return; }
    if (e.target.closest('[data-flag-next]')) { flagNext(); return; }
    if (e.target.closest('[data-pop-close]')) { popClose(true); return; }
    if (state.popLi && !e.target.closest('.adm-pop') && !e.target.closest('.adm-toast')) popClose();
    var b = e.target.closest('[data-qa]');
    if (b) {
      var li = b.closest('.adm-q__it'), opt = b.getAttribute('data-qa');
      if (opt === 'own') {
        li.classList.add('is-own');
        var ta = li.querySelector('.adm-cm__form textarea'); if (ta) ta.focus();
        return;
      }
      qaAnswer(li, opt); return;
    }
    b = e.target.closest('[data-qa-change]');
    if (b) {
      var it = b.closest('.adm-q__it'), c = qaLastBody(it);
      it.setAttribute('data-seen', c ? c.n : 0);     // nowa odpowiedź zastąpi poprzednią
      it.classList.remove('is-done'); qaRefresh();
      var first = it.querySelector('.adm-qo.is-rec') || it.querySelector('.adm-qo'); if (first) first.focus();
      return;
    }
    b = e.target.closest('[data-qa-all]'); if (!b || b.disabled) return;
    var g = b.closest('.adm-q__grp'); if (!g || g.classList.contains('is-busy')) return;
    var opt2 = b.getAttribute('data-qa-all'), key = g.getAttribute('data-g'), prog = g.querySelector('.adm-q__prog');
    var todo = [].filter.call($d.querySelectorAll('.adm-q__it:not(.is-done):not(.is-auto)'), function (li) {
      return li.getAttribute('data-qg') === key && (opt2 !== 'fix' || li.hasAttribute('data-fixable'));
    });
    if (!todo.length) return;
    g.classList.add('is-busy');
    [].forEach.call(g.querySelectorAll('[data-qa-all]'), function (x) { x.disabled = true; });
    if (prog) prog.textContent = 'Zapisuję ' + todo.length + '…';
    var last; todo.forEach(function (li) { last = qaAnswer(li, opt2); });
    last.then(function () {
      if (prog) prog.textContent = 'Zapisano ' + todo.length + '.';
      g.classList.remove('is-busy'); qaRefresh();
    });
  });
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
    qaRefresh();
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
    if (!body || !it) return Promise.resolve();
    var row = { city_slug: it.city_slug, city_version: it.version, stop_key: box.getAttribute('data-stop') || null,
      field: box.getAttribute('data-field') || null, field_label: box.getAttribute('data-label'),
      stop_version: box.hasAttribute('data-sv') ? +box.getAttribute('data-sv') : null, body: body };
    ta.value = ''; autosize(ta);
    form.classList.add('is-busy');
    return api('/draft_comments', { method: 'POST', body: row }).then(function (res) {
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
  // podgląd wersji na stronie w trzech widokach (JP 2026-10-24): niezalogowany (as=guest), zalogowany (domyślnie), dziecko (view=kid)
  function previewLinks(token, v) {
    var base = SITE + '/city.html?draft=' + encodeURIComponent(token) + '&v=' + v;
    var L = [['&as=guest', 'Niezalogowany'], ['', 'Zalogowany'], ['&view=kid', 'Dziecko']];
    return '<span class="adm-views"><span class="adm-views__l">Podgląd v' + esc(v) + ':</span>' + L.map(function (x) {
      return '<a class="qc-btn qc-btn--sm adm-preview" href="' + esc(base + x[0]) + '" target="_blank" rel="noopener">' + x[1] + '</a>';
    }).join('') + '</span>';
  }
  // fl = { box: klucz przystanku albo '_city', field: 'stop.<pole>' | 'city.<pole>' | null } — flagi uwag z kontroli przy tym polu
  function cell(label, oldV, newV, fmt, hasOld, cm, fl) {
    var changed = hasOld && !same(oldV, newV), qs = fl ? qaFor(fl.box, fl.field) : [];
    var hl = qs.length ? qaHighlight(show(newV, fmt), qs) : { html: esc(show(newV, fmt)), rest: [] };
    return '<div class="adm-row' + (changed ? ' is-chg' : '') + (qs.length ? ' has-flags' : '') + '"><small class="adm-row__k">' + esc(label) + (changed ? '<span class="adm-dot" title="zmienione"></span>' : '') +
      (hl.rest.length ? '<span class="adm-row__flags">' + hl.rest.map(flagBtn).join('') + '</span>' : '') + '</small>' +
      '<div class="adm-row__v">' + (changed ? '<span class="adm-old">' + esc(show(oldV, fmt)) + '</span>' : '') +
      '<span class="' + (changed ? 'adm-new' : 'adm-val') + '">' + hl.html + '</span></div>' + cm +
      (qs.length ? '<ol class="adm-pops">' + qs.map(qaItemHtml).join('') + '</ol>' : '') + '</div>';
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

    var qkeys = {}; stops.forEach(function (x) { qkeys[x.key] = x.s.stop_number; });
    state.popLi = null;
    state.qa = qaItems(it, qkeys, draft);     // uwagi z kontroli — flagi przy polach, których dotyczą
    var title = ctr.title || it.city_name || it.city_slug;
    var route = routeUrl(c, newStops, draft.stop_translations, title);
    var html = '<article class="adm-sheet" style="--team:' + esc(team) + '">' +
      '<header class="adm-sheet__head' + (isLight(team) ? ' is-light' : '') + '"><div>' +
      '<p class="label" style="color:inherit;opacity:.8">' + esc(it.city_slug) + ' · ' + esc(sheetLabel(it)) + '</p>' +
      '<h2 class="adm-sheet__title">' + esc(title) + '</h2>' +
      (it.note ? '<p class="adm-sheet__sub">' + esc(it.note) + '</p>' : '') + '</div>' +
      '<div class="adm-sheet__acts">' +
      (route ? '<a class="qc-btn qc-btn--sm adm-route" href="' + esc(route) + '" target="_blank" rel="noopener">' + PIN + ' Cała trasa w Google Maps</a>' : '') +
      (state.token ? previewLinks(state.token, it.version) : '') +
      '<span class="adm-chip">' + esc(SRC[it.source] || it.source) + ' · ' + esc(when(it.created_at)) + '</span></div></header>';

    if (state.readOnly) {
      var nw = state.trip ? state.trip.newest : null;
      html += '<p class="adm-ro">' + (it.isNewest
        ? 'Ta wycieczka nie ma szkicu w toku (najnowsza wersja: ' + esc(VST[it.status] || it.status) + ') — tylko podgląd. Uwagi wysyła się do szkicu.'
        : 'Wersja ' + esc(it.label || 'v' + it.version) + ' (' + esc(VST[it.status] || it.status) + ') — tylko podgląd. Uwagi wysyłasz w najnowszej wersji. ' +
          '<button type="button" class="adm-linkbtn" data-goto="' + esc(nw) + '">Przejdź do v' + esc(nw) + '</button>') + '</p>';
    }
    state.cmpIt = it;
    html += '<section class="adm-sheet__sec adm-cmp" id="cmpSec">' + cmpBarHtml(it) + '<div id="cmpView" class="adm-cmp__view" hidden></div></section>';
    html += '<section class="adm-sheet__sec adm-vc" id="verComments"></section>';
    html += '<section class="adm-sheet__sec adm-q" id="revQs" hidden></section>';

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
      '<div class="adm-rows">' + cell('Cała wycieczka', null, 'Uwaga ogólna do całego szkicu', null, false, commentBox(null, null, 'Cała wycieczka'), { box: '_city', field: null }) +
      CITY_TR.map(function (f) { return cell(f[1], pctr ? pctr[f[0]] : null, ctr[f[0]], f[2], !!pub, commentBox(null, 'city.' + f[0], f[1]), { box: '_city', field: 'city.' + f[0] }); }).join('') +
      CITY_FIELDS.map(function (f) { return cell(f[1], pc ? pc[f[0]] : null, c[f[0]], f[2], !!pub, commentBox(null, 'city.' + f[0], f[1]), { box: '_city', field: 'city.' + f[0] }); }).join('') +
      qaExtraRows('_city', shownSet('city.', CITY_TR.concat(CITY_FIELDS)), null) +
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
          '<span class="adm-toc__nm">' + esc(x.t.name || '(bez nazwy)') + '</span><b class="adm-qdot" data-qleft="' + esc(x.key) + '" hidden></b><b class="adm-n" data-count="' + esc(x.key) + '">0</b></a></li>';
      }).join('') + '</ol>' + (state.readOnly ? '' : '<div class="adm-toc__send"><button type="button" class="qc-btn adm-btn-send" data-send>Wyślij uwagi do poprawki</button>' +
      '<a href="#send" class="adm-toc__all">Lista uwag ↓</a></div>') + '</nav>';

    var $p = document.getElementById('tabPanel') || $d;
    $p.innerHTML = '<div class="adm-split">' + html + toc + '</div>';
    $p.setAttribute('aria-labelledby', 'tab-v' + it.version);
    var vc = document.getElementById('verComments');
    vc.innerHTML = verCommentsHtml(); vc.hidden = !vc.innerHTML;    // po wstawieniu menu: nazwy przystanków z menu
    var rq = document.getElementById('revQs');
    if (rq) { rq.innerHTML = questionsHtml(it); rq.hidden = !rq.innerHTML; qaRefresh(); }
    drawMap(newStops, draft.stop_translations);
    updateCounts();
    spy();
    cmpApply();
  }

  function sheetLabel(it) {
    if (it.isNewest && it.status === 'draft') return 'szkic ' + (it.label || 'v' + it.version) + (it.published_version != null ? (it.baseIsLive ? ' zamiast v' + it.published_version + ' (na stronie)' : ' · zmiany względem v' + it.published_version) : ' · pierwsza publikacja');
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
    var fl = function (f) { return { box: x.key, field: f }; };
    if (x.kind === 'del') return '<section class="adm-stopx adm-anchor" data-kind="del" id="st-' + esc(x.key) + '" data-spy="' + esc(x.key) + '">' + head +
      '<div class="adm-rows">' + cell('Przystanek', null, 'Usunięty w tym szkicu', null, false, commentBox(x.key, null, 'Cały przystanek', ver), fl(null)) + '</div></section>';
    head += iconRefHtml(x.key, s.category);
    var shown = shownSet('stop.', STOP_TR.concat(STOP_FIELDS, state.blocks && state.blocks[x.key] ? BLK.concat([['sources']]) : []));
    var rows = cell('Cały przystanek', null, 'Uwaga ogólna do przystanku', null, false, commentBox(x.key, null, 'Cały przystanek', ver), fl(null)) +
      STOP_TR.map(function (f) { return cell(f[1], x.ot ? x.ot[f[0]] : null, t[f[0]], f[2], hasOld, commentBox(x.key, 'stop.' + f[0], f[1], ver), fl('stop.' + f[0])); }).join('') +
      blockRows(x.key, ver) +
      STOP_FIELDS.map(function (f) { return cell(f[1], x.o ? x.o[f[0]] : null, s[f[0]], f[2], hasOld, commentBox(x.key, 'stop.' + f[0], f[1], ver), fl('stop.' + f[0])); }).join('') +
      qaExtraRows(x.key, shown, ver);
    return '<section class="adm-stopx adm-anchor" data-kind="' + x.kind + '" data-cat="' + esc(s.category || '') + '" id="st-' + esc(x.key) + '" data-spy="' + esc(x.key) + '">' + head +
      '<div class="adm-rows">' + rows + '</div></section>';
  }
  function shownSet(pre, defs) { var o = {}; defs.forEach(function (f) { o[pre + f[0]] = 1; }); return o;
  }

  // ── porównanie wersji (JP 2026-10-30) ─────────────────
  // Przełącznik „Pokaż zmiany względem: poprzednia / opublikowana / vN”. Pola z review-where.js (fieldsFromContent — te same,
  // przy których stoją flagi), różnice słów liczone tu (LCS na słowach, bez bibliotek). Skąd zmiana: city_versions.changes[].why
  // wersji z zakresu (gemini-draft / source-check / odpowiedzi JP) + rozstrzygnięcia automatyczne z review (resolved.url).
  // Treść wersji panel ma już z admin_versions (content, changes) — bez nowego SQL.
  function cmpTokens(s) { return String(s == null ? '' : s).match(/\s+|[^\s]+/g) || []; }
  function wordDiff(a, b) {
    var A = cmpTokens(a), B = cmpTokens(b), p = 0, ea = A.length, eb = B.length, raw = [];
    while (p < ea && p < eb && A[p] === B[p]) p++;
    while (ea > p && eb > p && A[ea - 1] === B[eb - 1]) { ea--; eb--; }
    var n = ea - p, m = eb - p, i, j;
    if (p) raw.push(['=', A.slice(0, p).join('')]);
    if (n * m > 4e6) { raw.push(['-', A.slice(p, ea).join('')], ['+', B.slice(p, eb).join('')]); }
    else if (n || m) {
      var W = m + 1, L = new Uint32Array((n + 1) * W);
      for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--)
        L[i * W + j] = A[p + i] === B[p + j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
      i = 0; j = 0;
      while (i < n && j < m) {
        if (A[p + i] === B[p + j]) { raw.push(['=', A[p + i]]); i++; j++; }
        else if (L[(i + 1) * W + j] >= L[i * W + j + 1]) raw.push(['-', A[p + i++]]);
        else raw.push(['+', B[p + j++]]);
      }
      while (i < n) raw.push(['-', A[p + i++]]);
      while (j < m) raw.push(['+', B[p + j++]]);
    }
    if (ea < A.length) raw.push(['=', A.slice(ea).join('')]);
    // sklejanie: ciąg zmian przerwany samą spacją = jedna zmiana (czytelniej niż „del ins del ins”)
    var out = [], k = 0;
    while (k < raw.length) {
      if (raw[k][0] === '=') { out.push(raw[k]); k++; continue; }
      var del = '', ins = '';
      while (k < raw.length) {
        var o = raw[k];
        if (o[0] === '-') del += o[1];
        else if (o[0] === '+') ins += o[1];
        else if (/^\s+$/.test(o[1]) && raw[k + 1] && raw[k + 1][0] !== '=') { del += o[1]; ins += o[1]; }
        else break;
        k++;
      }
      if (del) out.push(['-', del]);
      if (ins) out.push(['+', ins]);
    }
    return out;
  }
  function diffHtml2(ops) {
    return ops.map(function (o) {
      return o[0] === '=' ? esc(o[1]) : o[0] === '-' ? '<del class="adm-df__del">' + esc(o[1]) + '</del>' : '<ins class="adm-df__ins">' + esc(o[1]) + '</ins>';
    }).join('');
  }
  function cmpFields(content) { return RW.fieldsFromContent(content || {}, function (s) { return stopKey(s, (content || {}).stop_translations); }); }
  function cmpShow(field, t) { return field === 'duration_type' && DUR[t] ? DUR[t] : t === 'true' ? 'tak' : t === 'false' ? 'nie' : field === 'visit_duration' && /^\d+$/.test(t) ? t + ' min' : t; }
  // skąd zmiana: krótki opis + link do źródła (URL z treści why; „wg Wikidata Q…” → strona Wikidata)
  function cmpWhy(ch, vrow) {
    var w = String(ch && ch.why || '').trim(); if (!w) return null;
    var url = (w.match(/https?:\/\/[^\s)\]”"'<>]+/) || [])[0] || null;
    if (url) url = url.replace(/[.,;:]+$/, '');
    var q = !url && w.match(/\bWikidata (Q\d+)\b/); if (q) url = 'https://www.wikidata.org/wiki/' + q[1];
    var who = '', text = w;
    if (/^-\s*\[/.test(w)) {
      var lines = w.split('\n').map(function (l) { return l.replace(/^-\s*/, '').trim(); }).filter(Boolean);
      who = /[✓✂✗]|Pytanie z kontroli/.test(w) ? 'odpowiedź JP' : /JP/.test(String(vrow.note || '')) ? 'uwaga JP' : 'uwaga z kontroli';
      text = lines.join(' · ');
    } else if (/^pytanie z kontroli/i.test(w)) { who = 'odpowiedź JP'; text = w.replace(/^pytanie z kontroli:\s*/i, ''); }
    else if (/^source-check:/i.test(w)) { who = 'source-check'; text = w.replace(/^source-check:\s*/i, ''); }
    else if (/^poprawka ręczna/i.test(w)) who = 'poprawka ręczna';
    else if (/\(kod\)\s*$/.test(w)) { who = 'automat (kod)'; text = w.replace(/\s*\(kod\)\s*$/, ''); }
    else if (ch.auto) who = 'kontrola';
    if (url) text = text.replace(url, '').replace(/\s*(w źródle|źródło:?|wg)\s*$/i, '').trim();
    if (text.length > 240) text = text.slice(0, 240) + '…';
    return { v: vrow.version, who: who, text: RW.humanize(text), url: url && /^https?:\/\//.test(url) ? url : null };
  }
  function cmpWhyHtml(list) {
    if (!list || !list.length) return '';
    return '<ul class="adm-df__whys">' + list.map(function (w) {
      return '<li><span class="adm-df__wv">v' + esc(w.v) + '</span> ' + (w.who ? '<b>' + esc(w.who) + ':</b> ' : '') + esc(w.text) +
        (w.url ? ' <a href="' + esc(w.url) + '" target="_blank" rel="noopener noreferrer">źródło ↗</a>' : '') + '</li>';
    }).join('') + '</ul>';
  }
  // model różnic: grupy (opis miasta, przystanki w kolejności nowszej wersji, potem usunięte) z wierszami pól
  function cmpModel(curRow, baseRow) {
    var A = cmpFields(baseRow.content), B = cmpFields(curRow.content), byA = {}, byB = {};
    A.list.forEach(function (f) { byA[f.path] = f; });
    B.list.forEach(function (f) { byB[f.path] = f; });
    var keys = ['_city'].concat(B.stops, A.stops.filter(function (k) { return B.stops.indexOf(k) < 0; }));
    var G = {}, groups = keys.map(function (k) {
      var inA = k === '_city' || A.stops.indexOf(k) >= 0, inB = k === '_city' || B.stops.indexOf(k) >= 0;
      var paths = [], seen = {};
      B.list.concat(A.list).forEach(function (f) { if ((f.stop || '_city') === k && !seen[f.path]) { seen[f.path] = 1; paths.push(f.path); } });
      var rows = paths.map(function (pt) {
        var fa = byA[pt], fb = byB[pt], f = fb || fa, a = fa ? fa.text : '', b = fb ? fb.text : '';
        return { path: pt, field: f.field, label: RW.label(f.field), a: cmpShow(f.field, a), b: cmpShow(f.field, b), changed: a !== b, why: [] };
      }).filter(function (r) { return r.a || r.b; });
      var g = { key: k, name: k === '_city' ? 'Opis miasta' : (B.names[k] || A.names[k] || k), no: inB ? B.stops.indexOf(k) + 1 : null,
        kind: !inA ? 'new' : !inB ? 'del' : 'same', rows: rows, why: [] };
      g.n = rows.filter(function (r) { return r.changed; }).length;
      if (g.kind === 'same' && g.n) g.kind = 'chg';
      G[k] = g; return g;
    });
    // skąd: changes wersji między bazą a bieżącą (gdy baza jest nowsza — ten sam zakres w drugą stronę)
    var lo = Math.min(curRow.version, baseRow.version), hi = Math.max(curRow.version, baseRow.version), loose = [];
    (state.versions || []).filter(function (r) { return r.version > lo && r.version <= hi; }).forEach(function (vr) {
      (Array.isArray(vr.changes) ? vr.changes : []).forEach(function (ch) {
        var w = cmpWhy(ch, vr); if (!w) return;
        if (ch.op && ch.stop_key && G[ch.stop_key]) { pushWhy(G[ch.stop_key].why, w); return; }
        var pp = ch.path ? RW.parsePath(ch.path, B) : null, gk = pp ? (pp.stop || '_city') : null, g = gk && G[gk];
        if (ch.path && /(^|\.)_notes\b/.test(ch.path)) return;            // notatki redakcyjne — nie treść
        if (g) {
          var fs = pp.field ? String(pp.field).split('/') : [], hit = false;
          g.rows.forEach(function (r) { if (r.changed && fs.indexOf(r.field) >= 0) { pushWhy(r.why, w); hit = true; } });
          if (!hit && (g.n || g.kind !== 'same')) pushWhy(g.why, w);
          return;
        }
        // bez ścieżki (podmiany tekstu): pole, w którym jest nowy, a wcześniej stary fragment
        var af = String(ch.after == null ? '' : typeof ch.after === 'string' ? ch.after : ''), bf = String(typeof ch.before === 'string' ? ch.before : '');
        var row = null;
        groups.some(function (gg) { return gg.rows.some(function (r) { if (r.changed && ((af.length >= 4 && r.b.indexOf(af) >= 0) || (bf.length >= 4 && r.a.indexOf(bf) >= 0))) { row = r; return true; } return false; }); });
        if (row) pushWhy(row.why, w); else if (!ch.path) pushWhy(loose, w);
      });
    });
    // rozstrzygnięcia automatyczne z kontroli bieżącej wersji (szara flaga) — przy polu, którego dotyczą
    RW.expand(curRow.review || {}).forEach(function (t) {
      var au = qaAuto(t.e); if (!au) return;
      var loc = RW.locate(t.e, B), g = G[loc.stop || '_city']; if (!g || !loc.path) return;
      g.rows.forEach(function (r) { if (r.changed && r.path === loc.path) pushWhy(r.why, { v: curRow.version, who: 'rozstrzygnięte automatycznie', text: RW.humanize(au.what), url: au.url }); });
    });
    var total = 0, places = 0; groups.forEach(function (g) { total += g.n; if (g.n) places++; });
    return { groups: groups, total: total, places: places, loose: loose };
    function pushWhy(list, w) { if (!list.some(function (x) { return x.v === w.v && x.text === w.text; })) list.push(w); }
  }
  function cmpOptions(it) {
    var all = state.versions || [], T = state.trip, cur = it.version, opts = [];
    var prev = all.filter(function (r) { return r.version < cur; }).pop();
    var pubOk = T.published != null && T.published !== cur;
    if (prev) opts.push(['prev', 'poprzednia wersja (' + vlab(prev) + ')']);
    if (pubOk && (!prev || prev.version !== T.published)) opts.push(['pub', 'opublikowana (v' + T.published + ')']);
    else if (pubOk) opts[0][1] = 'poprzednia = opublikowana (' + vlab(prev) + ')';
    all.forEach(function (r) {
      if (r.version === cur || (prev && r.version === prev.version) || r.version === T.published) return;
      opts.push(['v' + r.version, vlab(r) + ' · ' + (VST[r.status] || r.status) + ' · ' + dayMonth(r.created_at)]);
    });
    return opts;
  }
  function cmpBaseRow(it, sel) {
    var all = state.versions || [], T = state.trip;
    if (sel === 'prev') return all.filter(function (r) { return r.version < it.version; }).pop() || null;
    if (sel === 'pub') return T.published != null ? all.filter(function (r) { return r.version === T.published; })[0] || null : null;
    var m = /^v(\d+)$/.exec(sel || ''); return m ? all.filter(function (r) { return r.version === +m[1]; })[0] || null : null;
  }
  function cmpBarHtml(it) {
    var opts = cmpOptions(it);
    if (!opts.length) return '<p class="adm-cmp__none">Pierwsza wersja tej wycieczki — nie ma z czym porównać.</p>';
    if (state.cmpSel && !opts.some(function (o) { return o[0] === state.cmpSel; })) state.cmpSel = '';
    return '<div class="adm-cmp__bar"><label for="cmpSel">Pokaż zmiany względem:</label>' +
      '<select id="cmpSel" class="adm-cmp__sel"><option value="">— bez porównania (zwykły widok) —</option>' +
      opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (state.cmpSel === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>' +
      '<span class="adm-cmp__leg" aria-hidden="true"><del class="adm-df__del">usunięte</del> <ins class="adm-df__ins">dodane</ins></span></div>';
  }
  function cmpViewHtml(it) {
    var cur = (state.versions || []).filter(function (r) { return r.version === it.version; })[0], base = cmpBaseRow(it, state.cmpSel);
    if (!cur || !base) return '';
    var M = cmpModel(cur, base), older = base.version < cur.version;
    var notes = (state.versions || []).filter(function (r) { return r.version > Math.min(cur.version, base.version) && r.version <= Math.max(cur.version, base.version) && r.note; });
    var h = '<p class="adm-cmp__sum"><b>' + esc(vlab(cur)) + '</b> względem <b>' + esc(vlab(base)) + '</b>' + (older ? '' : ' (nowszej)') + ': ' +
      (M.total ? plForm(M.total, 'zmienione pole', 'zmienione pola', 'zmienionych pól') + ' w ' + plForm(M.places, 'miejscu', 'miejscach', 'miejscach') : 'brak różnic w treści') + '.</p>' +
      (notes.length ? '<ul class="adm-cmp__notes">' + notes.map(function (r) { return '<li><span class="adm-df__wv">' + esc(vlab(r)) + '</span> ' + esc(r.note) + '</li>'; }).join('') + '</ul>' : '');
    h += '<nav class="adm-cmp__toc" aria-label="Spis zmian"><ol>' + M.groups.map(function (g) {
      var tag = g.kind === 'new' ? ' · nowy' : g.kind === 'del' ? ' · usunięty' : '';
      return '<li class="adm-cmp__ti is-' + g.kind + '"><a href="#cmp-' + esc(g.key) + '"><span class="adm-toc__no">' + (g.key === '_city' ? '★' : g.no ? num(g.no) : '–') + '</span>' +
        '<span class="adm-cmp__tn">' + esc(g.name) + esc(tag) + '</span><b class="adm-n' + (g.n ? '' : ' is-zero') + '" title="zmienione pola">' + g.n + '</b></a></li>';
    }).join('') + '</ol></nav>';
    if (M.loose.length) h += '<div class="adm-cmp__loose"><p class="adm-df__k">Zmiany bez wskazanego pola</p>' + cmpWhyHtml(M.loose) + '</div>';
    h += M.groups.map(function (g) {
      var ch = g.rows.filter(function (r) { return r.changed; }), same = g.rows.filter(function (r) { return !r.changed; });
      var chip = g.kind === 'new' ? '<span class="adm-chip adm-chip--new">nowy</span>' : g.kind === 'del' ? '<span class="adm-chip adm-chip--del">usunięty</span>' :
        g.n ? '<span class="adm-chip adm-chip--chg">' + plForm(g.n, 'zmiana', 'zmiany', 'zmian') + '</span>' : '<span class="adm-chip">bez zmian</span>';
      return '<section class="adm-cmp__grp is-' + g.kind + '" id="cmp-' + esc(g.key) + '"><h4 class="adm-cmp__gh"><span class="adm-stop__no">' + (g.key === '_city' ? '★' : g.no ? num(g.no) : '–') + '</span>' +
        '<span class="adm-cmp__gn">' + esc(g.name) + '</span>' + chip + '</h4>' + cmpWhyHtml(g.why) +
        ch.map(function (r) {
          return '<div class="adm-df"><p class="adm-df__k">' + esc(r.label) + '</p><div class="adm-df__v">' + (r.a || r.b ? diffHtml2(wordDiff(r.a, r.b)) : '') +
            (!r.b ? ' <small class="adm-df__empty">(pole usunięte)</small>' : !r.a ? ' <small class="adm-df__empty">(pole dodane)</small>' : '') + '</div>' + cmpWhyHtml(r.why) + '</div>';
        }).join('') +
        (same.length ? '<details class="adm-df__same"><summary>Bez zmian: ' + plForm(same.length, 'pole', 'pola', 'pól') + CHEV + '</summary><dl>' +
          same.map(function (r) { return '<dt>' + esc(r.label) + '</dt><dd>' + esc(r.b) + '</dd>'; }).join('') + '</dl></details>' : '') + '</section>';
    }).join('');
    return h;
  }
  function cmpApply() {
    var sheet = $d.querySelector('.adm-sheet'), split = $d.querySelector('.adm-split'), v = document.getElementById('cmpView'), it = state.cmpIt;
    if (!sheet || !v || !it) return;
    var on = !!state.cmpSel && !!cmpBaseRow(it, state.cmpSel);
    sheet.classList.toggle('is-cmp', on); if (split) split.classList.toggle('is-cmp', on);
    v.innerHTML = on ? cmpViewHtml(it) : ''; v.hidden = !on;
    if (state.popLi) popClose();
  }
  $d.addEventListener('change', function (e) {
    if (e.target.id !== 'cmpSel') return;
    state.cmpSel = e.target.value; cmpApply();
  });

  // ── „Przyjmij wszystkie rekomendacje” (JP 2026-10-30) ──
  // Okno z listą czerwonych flag (bez szarych — te rozstrzygnął automat) i rekomendacją przy każdej; „Zastosuj” zapisuje
  // odpowiedzi dokładnie tak jak klik w notatce (qaAnswer → uwaga do pola review.e.N / review.w.N[.j]), bez wysyłania.
  function qaAnswerText(li, text) {
    if (!li || !text || li.classList.contains('is-pending') || li.classList.contains('is-done')) return qaQueue;
    var form = li.querySelector('.adm-cm__form'); if (!form) return qaQueue;
    li.classList.add('is-pending', 'is-done'); li.classList.remove('is-own');
    li.querySelector('.adm-q__ans').textContent = QA_OPT.own + ' (zapisuję…)';
    qaRefresh();
    qaQueue = qaQueue.then(function () { form.querySelector('textarea').value = text; return sendComment(form); })
      .catch(function (e) { if (window.console) console.error('Uwaga z kontroli:', e); })
      .then(function () { li.classList.remove('is-pending'); qaRefresh(); });
    return qaQueue;
  }
  function recOpen() {
    var todo = (state.qa ? state.qa.list : []).filter(function (x) {
      var li = document.getElementById('q-' + qaId(x));
      return !x.auto && li && !li.classList.contains('is-done') && !li.classList.contains('is-pending');
    });
    var dlg = document.getElementById('recDlg');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'recDlg'; dlg.className = 'adm-dlg'; dlg.setAttribute('aria-labelledby', 'recDlgH'); document.body.appendChild(dlg); }
    var items = todo.map(function (x) {
      var e = x.e, rec = qaRecommend(x), cut = qaCutText(x), id = qaId(x), opts = [];
      if (qaHasNew(e)) opts.push(['fix', (qaHasOld(e) ? '<del>' + esc(e.old) + '</del> → ' : '') + '<ins>' + esc(e['new']) + '</ins>']);
      if (cut) opts.push(['cut', '<del>' + esc(cut) + '</del>']);
      opts.push(['keep', ''], ['own', '']);
      return '<li class="adm-rec__it' + (x.block ? ' is-block' : '') + '" data-rec-id="' + esc(id) + '">' +
        '<label class="adm-rec__ck"><input type="checkbox" checked data-rec-on> <span><b>' + x.n + '.</b> ' + esc(x.where) +
        ' <span class="adm-q__tag' + (x.block ? '' : ' adm-q__tag--w') + '">' + (x.block ? 'blokuje' : 'ostrzeżenie') + '</span></span></label>' +
        '<p class="adm-rec__p">' + esc(qaProblem(e)) + '</p>' +
        '<fieldset class="adm-rec__opts"><legend class="adm-sr">Odpowiedź na uwagę ' + x.n + '</legend>' + opts.map(function (o) {
          return '<label class="adm-rec__o' + (o[0] === rec.opt ? ' is-rec' : '') + '"><input type="radio" name="rec-' + esc(id) + '" value="' + o[0] + '"' + (o[0] === rec.opt ? ' checked' : '') + '>' +
            '<span><span class="adm-rec__ot">' + esc(QA_OPT[o[0]]) + (o[0] === rec.opt ? ' <span class="adm-qo__rec">Rekomendacja</span>' : '') + '</span>' +
            (o[1] ? '<span class="adm-qo__d">' + o[1] + '</span>' : '') + (o[0] === rec.opt ? '<span class="adm-qo__why">' + esc(rec.why) + '</span>' : '') + '</span></label>';
        }).join('') +
        '<textarea class="adm-rec__own" rows="2" placeholder="Co zrobić? Bez tekstu ta flaga zostanie pominięta."' + (rec.opt === 'own' ? '' : ' hidden') + ' aria-label="Własna decyzja do uwagi ' + x.n + '"></textarea></fieldset></li>';
    }).join('');
    dlg.innerHTML = '<form method="dialog" class="adm-dlg__f"><header class="adm-dlg__h"><h2 id="recDlgH">Przyjmij rekomendacje</h2>' +
      '<button type="button" class="adm-pop__x" data-rec-close aria-label="Zamknij">×</button></header>' +
      (todo.length ? '<p class="adm-dlg__sub">Przy każdej czerwonej fladze zaznaczona jest rekomendacja. Odznacz wyjątki albo zmień wybór. „Zastosuj” wypełni odpowiedzi tak, jak kliknięcia w notatkach — <b>nic nie zostanie wysłane</b>; wysyłasz potem przyciskiem „Wyślij uwagi do poprawki”.</p>' +
        '<p class="adm-dlg__all"><button type="button" class="adm-linkbtn" data-rec-all="1">Zaznacz wszystkie</button> · <button type="button" class="adm-linkbtn" data-rec-all="0">Odznacz wszystkie</button></p>' +
        '<ol class="adm-rec__list">' + items + '</ol>' : '<p class="adm-dlg__sub">Wszystkie czerwone flagi są już rozstrzygnięte.</p>') +
      '<footer class="adm-dlg__foot"><button type="button" class="qc-btn adm-dlg__apply" data-rec-apply' + (todo.length ? '' : ' disabled') + '>Zastosuj</button>' +
      '<button type="button" class="qc-btn qc-btn--ghost adm-dlg__cancel" data-rec-close>Anuluj</button><span class="adm-dlg__cnt" role="status" aria-live="polite"></span></footer></form>';
    recCount(dlg);
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    var f = dlg.querySelector('[data-rec-apply]:not([disabled])') || dlg.querySelector('[data-rec-close]'); if (f) f.focus();
  }
  function recPicks(dlg) {
    return [].map.call(dlg.querySelectorAll('.adm-rec__it'), function (li) {
      var on = li.querySelector('[data-rec-on]').checked, r = li.querySelector('input[type=radio]:checked'), ta = li.querySelector('.adm-rec__own');
      li.classList.toggle('is-off', !on);
      return { id: li.getAttribute('data-rec-id'), on: on, opt: r ? r.value : null, text: ta ? ta.value.trim() : '' };
    });
  }
  function recCount(dlg) {
    var p = recPicks(dlg), ok = p.filter(function (x) { return x.on && (x.opt !== 'own' || x.text); }).length, skip = p.filter(function (x) { return x.on && x.opt === 'own' && !x.text; }).length;
    var b = dlg.querySelector('[data-rec-apply]'); if (b && p.length) { b.textContent = 'Zastosuj (' + ok + ')'; b.disabled = !ok; }
    var c = dlg.querySelector('.adm-dlg__cnt'); if (c) c.textContent = p.length ? ok + ' z ' + p.length + (skip ? ' · ' + skip + ' bez treści własnej decyzji — pominięte' : '') : '';
  }
  function recClose() { var d = document.getElementById('recDlg'); if (!d) return; if (d.close) d.close(); else d.removeAttribute('open'); var b = $d.querySelector('[data-qa-recall]'); if (b) b.focus(); }
  function recApply() {
    var dlg = document.getElementById('recDlg'), picks = recPicks(dlg).filter(function (x) { return x.on && (x.opt !== 'own' || x.text); });
    recClose();
    var last = qaQueue, n = 0;
    picks.forEach(function (x) {
      var li = document.getElementById('q-' + x.id); if (!li) return;
      n++; last = x.opt === 'own' ? qaAnswerText(li, x.text) : qaAnswer(li, x.opt);
    });
    if (!n) return;
    last.then(function () { sendNote('Zapisano ' + plForm(n, 'odpowiedź', 'odpowiedzi', 'odpowiedzi') + ' do flag — jeszcze niewysłane. Sprawdź i kliknij „Wyślij uwagi do poprawki”.', true); });
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-qa-recall]')) { recOpen(); return; }
    var dlg = e.target.closest('#recDlg'); if (!dlg) return;
    if (e.target === dlg) { recClose(); return; }                       // klik w tło
    if (e.target.closest('[data-rec-close]')) { e.preventDefault(); recClose(); return; }
    if (e.target.closest('[data-rec-apply]')) { e.preventDefault(); recApply(); return; }
    var all = e.target.closest('[data-rec-all]');
    if (all) { [].forEach.call(dlg.querySelectorAll('[data-rec-on]'), function (c) { c.checked = all.getAttribute('data-rec-all') === '1'; }); recCount(dlg); }
  });
  document.addEventListener('change', function (e) {
    var dlg = e.target.closest && e.target.closest('#recDlg'); if (!dlg) return;
    if (e.target.type === 'radio') {
      var li = e.target.closest('.adm-rec__it'), ta = li.querySelector('.adm-rec__own');
      li.querySelector('[data-rec-on]').checked = true;
      ta.hidden = e.target.value !== 'own'; if (!ta.hidden) ta.focus();
    }
    recCount(dlg);
  });
  document.addEventListener('input', function (e) { if (e.target.classList && e.target.classList.contains('adm-rec__own')) recCount(e.target.closest('#recDlg')); });

  // ── referencja do ikony Quo (JP 2026-10-30) — docs/IKONY-MIEJSC.md §6 ──
  // Kandydaci: media/icons/place-candidates/<trasa>.json (place-candidates.mjs na serwerze, ten sam checkout repo co panel).
  // Wybór JP: admin.icon_refs / rpc admin_icon_refs_set (SQL 2026-10-30-icon-refs.sql): 1–2 pliki = wybór, [] = automat, null = brak decyzji.
  // Bez decyzji generator czeka na JP najwyżej wait_hours (48 h) od wygenerowania kandydatów, potem dobiera zdjęcia sam.
  // Treść pliku to dane z Commons (autorzy, tytuły): tylko esc(); adresy wyłącznie z upload/thumb.wikimedia.org / commons.wikimedia.org.
  var PRACTICAL = { parking: 1, restaurant: 1, icecream: 1, sweets: 1 };
  var IC_THUMB = /^https:\/\/(upload|thumb)\.wikimedia\.org\/wikipedia\/commons\//, IC_PAGE = /^https:\/\/commons\.wikimedia\.org\/wiki\/File(:|%3A)/i;
  function loadIconRefs(slug) {
    var ir = state.icref = { slug: slug, cand: null, sel: {}, selApi: false, msg: {} };
    var cand = DEMO ? api('/admin_queue').then(function () { return demoCandidates(slug); }) :
      fetch('../media/icons/place-candidates/' + encodeURIComponent(slug) + '.json?t=' + Date.now(), { credentials: 'same-origin', cache: 'no-store', redirect: 'manual' })
        .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    var sel = api('/icon_refs?trip=eq.' + encodeURIComponent(slug) + '&select=stop_key,mode,files,updated_at')
      .then(function (rows) { ir.selApi = true; return rows || []; }, function (e) { ir.selErr = e.message; return []; });
    return Promise.all([cand, sel]).then(function (res) {
      ir.cand = res[0] && res[0].stops ? res[0] : null;
      res[1].forEach(function (r) { ir.sel[r.stop_key] = { mode: r.mode, files: Array.isArray(r.files) ? r.files : [] }; });
    });
  }
  function icCands(key) {
    var c = state.icref && state.icref.cand, rec = c && c.stops[key];
    return (rec && Array.isArray(rec.candidates) ? rec.candidates : []).filter(function (x) {
      return x && typeof x.title === 'string' && (DEMO || (IC_THUMB.test(x.thumb || '') && IC_PAGE.test(x.page || '')));
    }).slice(0, 4);
  }
  function icDeadline() {
    var c = state.icref && state.icref.cand, t = c ? Date.parse(c.generated_at) : NaN;
    return isNaN(t) ? null : new Date(t + (+c.wait_hours || 48) * 3600000);
  }
  function icStatus(key, list) {
    var ir = state.icref, sel = ir.sel[key];
    if (ir.msg[key]) return ir.msg[key];
    if (sel && sel.mode === 'pick') return 'Wybrane: ' + sel.files.length + ' z 2 — generator narysuje Quo na podstawie ' + (sel.files.length === 1 ? 'tego zdjęcia.' : 'tych zdjęć.');
    if (sel && sel.mode === 'auto') return 'Automat — generator sam wybierze zdjęcia (jak dotąd).';
    if (!list.length) return '';
    var dl = icDeadline();
    return 'Brak wyboru — generowanie tej ikony czeka na Ciebie' + (dl ? ' do ' + when(dl.toISOString()) : '') + ', potem automat.';
  }
  function iconRefHtml(key, cat) {
    var ir = state.icref;
    if (!ir || PRACTICAL[cat]) return '';
    var list = icCands(key), sel = ir.sel[key] || null, files = sel && sel.mode === 'pick' ? sel.files : [];
    var h = '<div class="adm-icref" data-icref="' + esc(key) + '"><p class="adm-icref__h">Referencja do ikony Quo' +
      '<small>kliknij 1–2 zdjęcia zabytku (bez ludzi); domyślnie automat</small></p>';
    var off = !ir.selApi;
    if (!ir.cand || !list.length) {
      var own0 = files.length ? icOwnHtml(key, files, off) : '';
      return h + '<p class="adm-icref__st">' + (!ir.cand ? 'Kandydaci zdjęć jeszcze nie gotowi — serwer pobiera je z Wikimedia Commons.' : 'Commons nie dał zdjęć bez ludzi i z wolną licencją.') +
        (files.length ? '' : ' Bez Twojego linku ikona powstanie automatycznie.') + '</p>' + own0 + icLinkHtml(key, files, off) +
        (ir.msg[key] || files.length ? '<p class="adm-icref__st" role="status">' + esc(icStatus(key, list)) + '</p>' : '') +
        (sel ? '<div class="adm-icref__bar"><button type="button" class="adm-linkbtn" data-icref-clear="' + esc(key) + '"' + (off ? ' disabled' : '') + '>Cofnij decyzję</button></div>' : '') + '</div>';
    }
    h += '<ul class="adm-icref__list">' + list.map(function (c, i) {
      var on = files.indexOf(c.title) > -1, nm = c.title.replace(/^File:/, '');
      return '<li class="adm-icref__it' + (on ? ' is-on' : '') + '">' +
        '<button type="button" class="adm-icref__pick" data-icref-pick="' + esc(key) + '" data-file="' + esc(c.title) + '" aria-pressed="' + on + '"' + (off ? ' disabled' : '') +
        ' aria-label="Zdjęcie ' + (i + 1) + ': ' + esc(nm) + (on ? ' (wybrane)' : '') + '">' +
        '<img src="' + esc(c.thumb) + '" alt="" loading="lazy" decoding="async" width="320" height="' + (c.width && c.height ? Math.round(320 * c.height / c.width) : 240) + '">' +
        '<span class="adm-icref__ck" aria-hidden="true">✓</span></button>' +
        '<p class="adm-icref__meta" title="' + esc(nm) + '">' + esc(c.author || 'autor nieznany') + ' · ' + esc(c.license || 'licencja?') + '</p>' +
        '<a class="adm-icref__lnk" href="' + esc(c.page) + '" target="_blank" rel="noopener noreferrer">otwórz na Commons ↗</a></li>';
    }).join('') + '</ul>';
    var titles = list.map(function (c) { return c.title; });
    h += icOwnHtml(key, files.filter(function (f) { return titles.indexOf(f) < 0; }), off) + icLinkHtml(key, files, off);
    h += '<div class="adm-icref__bar"><button type="button" class="qc-btn qc-btn--sm adm-icref__auto' + (sel && sel.mode === 'auto' ? ' is-on' : '') + '" data-icref-auto="' + esc(key) + '"' +
      (off ? ' disabled' : '') + ' aria-pressed="' + !!(sel && sel.mode === 'auto') + '">Automat</button>' +
      (sel ? '<button type="button" class="adm-linkbtn" data-icref-clear="' + esc(key) + '"' + (off ? ' disabled' : '') + '>Cofnij decyzję</button>' : '') +
      '<span class="adm-icref__st" role="status">' + esc(off ? 'Zapis wyboru jeszcze niedostępny — baza czeka na SQL 2026-10-30-icon-refs.sql (deploy.sh approve).' : icStatus(key, list)) + '</span></div></div>';
    return h;
  }
  // Własny link (JP 2026-10-31): zdjęcie z Wikimedia Commons / Wikipedii → tytuł „File:…” (autor i licencja z Commons, jak u kandydatów).
  // Inne serwisy odrzucamy: generator pobiera tylko z Commons, a ikona musi mieć udokumentowane źródło z wolną licencją.
  function icFileFromUrl(u) {
    u = String(u || '').trim();
    if (/^File:/i.test(u)) return icNormTitle(u.slice(5));
    var m;
    try { m = new URL(u); } catch (e) { return null; }
    if (m.protocol !== 'https:' && m.protocol !== 'http:') return null;
    var host = m.hostname.toLowerCase(), path = m.pathname, hash = m.hash || '';
    var hm = hash.match(/^#\/media\/(?:File|Plik|Datei|Fichier|Archivo|Bestand|Soubor)(?::|%3A)(.+)$/i);
    if (hm && /(^|\.)(wikipedia|wikimedia|wikivoyage)\.org$/.test(host)) return icNormTitle(hm[1]);
    if (/^(commons\.(m\.)?wikimedia\.org)$/.test(host)) {
      var pm = path.match(/^\/wiki\/(?:File|Plik)(?::|%3A)(.+)$/i);
      return pm ? icNormTitle(pm[1]) : null;
    }
    if (/^(upload|thumb)\.wikimedia\.org$/.test(host)) {
      var um = path.match(/^\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/);
      return um ? icNormTitle(um[1]) : null;
    }
    return null;
  }
  function icNormTitle(t) {
    try { t = decodeURIComponent(t); } catch (e) {}
    t = t.replace(/_/g, ' ').trim();
    return /^[^|#<>[\]{}\n/]{1,240}\.(jpe?g|png|webp|tiff?)$/i.test(t) ? 'File:' + t : null;
  }
  function icOwnHtml(key, own, off) {
    if (!own.length) return '';
    return '<ul class="adm-icref__own">' + own.map(function (f) {
      var nm = f.replace(/^File:/, '');
      return '<li><a href="https://commons.wikimedia.org/wiki/' + encodeURIComponent(f.replace(/ /g, '_')).replace(/%3A/, ':') + '" target="_blank" rel="noopener noreferrer">Twój link: ' + esc(nm) + ' ↗</a>' +
        '<button type="button" class="adm-linkbtn" data-icref-pick="' + esc(key) + '" data-file="' + esc(f) + '"' + (off ? ' disabled' : '') + ' aria-label="Usuń zdjęcie ' + esc(nm) + '">usuń</button></li>';
    }).join('') + '</ul>';
  }
  function icLinkHtml(key, files, off) {
    if (files.length >= 2) return '';
    return '<form class="adm-icref__link" data-icref-link="' + esc(key) + '" novalidate>' +
      '<label for="icl-' + esc(key) + '">Własne zdjęcie — link z Wikimedia Commons lub Wikipedii</label>' +
      '<span class="adm-icref__linkrow"><input id="icl-' + esc(key) + '" type="url" inputmode="url" autocomplete="off" placeholder="https://commons.wikimedia.org/wiki/File:…"' + (off ? ' disabled' : '') + '>' +
      '<button type="submit" class="qc-btn qc-btn--sm"' + (off ? ' disabled' : '') + '>Dodaj</button></span></form>';
  }
  $d.addEventListener('submit', function (e) {
    var fm = e.target.closest && e.target.closest('[data-icref-link]');
    if (!fm || !state.icref) return;
    e.preventDefault();
    var ir = state.icref, key = fm.getAttribute('data-icref-link'), inp = fm.querySelector('input');
    var f = icFileFromUrl(inp && inp.value), sel = ir.sel[key], files = sel && sel.mode === 'pick' ? sel.files.slice() : [];
    var say = function (t) { ir.msg[key] = t; icRedraw(key); setTimeout(function () { if (ir.msg[key] === t) { delete ir.msg[key]; icRedraw(key); } }, 6000); };
    if (!f) return say('To nie jest link do zdjęcia z Wikimedia Commons ani z Wikipedii (otwórz zdjęcie i skopiuj adres, np. …/wiki/File:Nazwa.jpg). Inne serwisy nie podają licencji, więc generator ich nie użyje.');
    if (files.indexOf(f) > -1) return say('To zdjęcie już jest wybrane.');
    if (files.length >= 2) return say('Najwyżej 2 zdjęcia — najpierw odznacz jedno.');
    files.push(f);
    icSave(key, files);
  });
  function icRedraw(key) {
    var el = $d.querySelector('.adm-icref[data-icref="' + key.replace(/"/g, '') + '"]');
    if (!el) return;
    var sec = el.closest('.adm-stopx'), cat = sec ? sec.getAttribute('data-cat') : '';
    var f = document.activeElement && el.contains(document.activeElement) ? (document.activeElement.getAttribute('data-file') || document.activeElement.className) : null;
    var tmp = document.createElement('div'); tmp.innerHTML = iconRefHtml(key, cat);
    el.parentNode.replaceChild(tmp.firstChild, el);
    if (f) {
      var nel = $d.querySelector('.adm-icref[data-icref="' + key.replace(/"/g, '') + '"]');
      var b = [].filter.call(nel.querySelectorAll('button'), function (x) { return x.getAttribute('data-file') === f || x.className === f; })[0];
      if (b) b.focus();
    }
  }
  function icSave(key, files) {
    var ir = state.icref, prev = ir.sel[key];
    ir.msg[key] = 'Zapisuję…';
    ir.sel[key] = files == null ? undefined : { mode: files.length ? 'pick' : 'auto', files: files };
    if (files == null) delete ir.sel[key];
    icRedraw(key);
    return api('/rpc/admin_icon_refs_set', { method: 'POST', body: { p_trip: ir.slug, p_stop_key: key, p_files: files } }).then(function () {
      delete ir.msg[key]; icRedraw(key);
    }, function (e) {
      if (prev) ir.sel[key] = prev; else delete ir.sel[key];
      ir.msg[key] = 'Nie zapisano: ' + e.message; icRedraw(key);
    });
  }
  $d.addEventListener('click', function (e) {
    var b = e.target.closest('[data-icref-pick],[data-icref-auto],[data-icref-clear]');
    if (!b || b.disabled || !state.icref) return;
    var ir = state.icref, key = b.getAttribute('data-icref-pick') || b.getAttribute('data-icref-auto') || b.getAttribute('data-icref-clear');
    var sel = ir.sel[key], files = sel && sel.mode === 'pick' ? sel.files.slice() : [];
    if (b.hasAttribute('data-icref-auto')) { icSave(key, sel && sel.mode === 'auto' ? null : []); return; }
    if (b.hasAttribute('data-icref-clear')) { icSave(key, null); return; }
    var f = b.getAttribute('data-file'), i = files.indexOf(f);
    if (i > -1) files.splice(i, 1);
    else if (files.length >= 2) { ir.msg[key] = 'Najwyżej 2 zdjęcia — najpierw odznacz jedno.'; icRedraw(key); setTimeout(function () { delete ir.msg[key]; icRedraw(key); }, 4000); return; }
    else files.push(f);
    icSave(key, files.length ? files : null);
  });
  // tryb demo: przykładowi kandydaci (lokalne obrazy zamiast Commons)
  function demoCandidates(slug) {
    var v = (state.demo && state.demo.versions || []).filter(function (r) { return r.city_slug === slug; }).pop();
    if (!v) return null;
    var pics = ['assisi', 'perugia', 'ancona', 'frasassi'], out = { trip: slug, generated_at: new Date(Date.now() - 5 * 3600000).toISOString(), wait_hours: 48, stops: {} };
    (v.content.stops || []).forEach(function (s, i) {
      if (PRACTICAL[s.category] || !s.stop_key) return;
      out.stops[s.stop_key] = { n: s.stop_number, status: 'ok', candidates: [0, 1, 2].map(function (j) {
        var p = pics[(i + j) % pics.length];
        return { title: 'File:' + titleCase(s.stop_key) + ' (' + titleCase(slug) + ') ' + (j + 1) + '.jpg', thumb: '../media/tours/quolino-it-' + p + '-tile-384.webp',
          page: 'https://commons.wikimedia.org/wiki/File:Example.jpg', author: ['Rosa Rossi', 'Wikimedia user Umbro', 'Paolo M.'][j], license: ['CC BY-SA 4.0', 'CC BY 2.0', 'CC0'][j], width: 384, height: 384 };
      }) };
    });
    return out;
  }

  // bloki nowych wytycznych (docs/TRESC-PRZYSTANKU.md): wersja z przypisami [n], źródła i wynik kontroli — tylko dla redakcji
  var BLK = RW.BLOCKS.map(function (k) { return F_(k); });
  var blockText = RW.blockText;   // ten sam tekst, w którym kontrola szuka cytatu
  function blockRows(key, ver) {
    var b = state.blocks && state.blocks[key]; if (!b) return '';
    var m = b.marked || {}, st = b.state || {};
    var rows = BLK.map(function (f) {
      var s = st[f[0]] || {}, txt = s.state === 'found' ? blockText(f[0], m[f[0]]) : 'brak — sprawdzono: ' + (s.checked || '(nie podano)');
      return cell(f[1], null, txt, null, false, commentBox(key, 'stop.' + f[0], f[1], ver), { box: key, field: 'stop.' + f[0] });
    }).join('');
    var src = (b.sources || []).map(function (x) { return '[' + x.n + '] ' + (x.title || '') + ' — ' + x.url; }).join('\n');
    rows += cell('Źródła (przypisy [n])', null, src || 'brak źródeł', null, false, commentBox(key, 'stop.sources', 'Źródła', ver), { box: key, field: 'stop.sources' });
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

  // ── Postęp prac (JP 2026-10-25): etap każdej wycieczki, sygnatury czasu, tokeny ──
  // Źródło: admin.pipeline_runs / pipeline_events / pipeline_queue (SQL 2026-10-25-postep-prac.sql), zapisuje gemini-draft.mjs.
  var STAGES = ['Research', 'Szkic', 'Bloki przystanków', 'Kontrola przystanków', 'Kontrola całej trasy', 'Zapis', 'Gotowe'];
  var RUNST = { running: 'pracuje', done: 'gotowe', error: 'błąd', stalled: 'stoi ≥ 15 min', stopped: 'przerwane' };
  function demoPipeline(path) {
    var now = Date.now(), iso = function (m) { return new Date(now - m * 60000).toISOString(); };
    if (/pipeline_runs/.test(path)) return [
      { run_id: 'demo-3', city_slug: 'frasassi', kind: 'revise', stage: 5, last_message: '[v5b] frasassi: ④ kontrola Claude po poprawkach (Claude) — 2 Grotte di Frasassi', status: 'running', started_at: iso(50), last_at: iso(1), steps: 30, gemini_tokens: 197000, gemini_calls: 8, claude_tokens: 1290000, claude_calls: 9, seconds: 3000 },
      { run_id: 'demo-2', city_slug: 'frasassi', kind: 'revise', stage: 5, last_message: 'frasassi: poprawki — 3 Museo Speleo (7)', status: 'stopped', started_at: iso(60), last_at: iso(51), steps: 9, gemini_tokens: 97000, gemini_calls: 4, claude_tokens: 697000, claude_calls: 3, seconds: 600 },
      { run_id: 'demo-1', city_slug: 'gubbio', kind: 'draft', stage: 3, stop_k: 4, stops_n: 9, last_message: 'gubbio: ③ bloki 4 Palazzo dei Consoli', status: 'running', started_at: iso(30), last_at: iso(2), steps: 22, gemini_tokens: 255000, gemini_calls: 11, claude_tokens: 0, claude_calls: 0, seconds: 1800 }];
    if (/pipeline_queue/.test(path)) return [{ id: 7, city_slug: 'todi', status: 'queued', request: '{"name":"Todi","region":"umbria"}', result: null, created_at: iso(20), finished_at: null }];
    if (/demo-3/.test(path)) return [
      { id: 1, message: 'frasassi: ④ kontrola Claude — cała trasa (szkic v5)', created_at: iso(50), gemini_tokens: 0, claude_tokens: 300000 },
      { id: 2, message: '[v5a] frasassi: ④c poprawki po kontroli całej trasy — runda 1/3 (40 błędów)', created_at: iso(44), gemini_tokens: 0, claude_tokens: 300000 },
      { id: 3, message: '[v5a] frasassi: ⑤ zapis v5a (runda 1)', created_at: iso(20), gemini_tokens: 97000, claude_tokens: 900000 },
      { id: 4, message: '[v5b] frasassi: ④c poprawki po kontroli całej trasy — runda 2/3 (39 błędów)', created_at: iso(20), gemini_tokens: 97000, claude_tokens: 900000 },
      { id: 5, message: '[v5b] frasassi: ④ kontrola Claude po poprawkach (Claude) — 2 Grotte di Frasassi', created_at: iso(1), gemini_tokens: 197000, claude_tokens: 1290000 }];
    return [{ id: 1, message: 'gubbio: ① research', created_at: iso(30), gemini_tokens: 16000, claude_tokens: 0 },
            { id: 2, message: 'gubbio: ③ bloki 4 Palazzo dei Consoli', created_at: iso(2), gemini_tokens: 255000, claude_tokens: 0 }];
  }
  function tok(n) { n = +n || 0; return n >= 1e6 ? (n / 1e6).toFixed(2).replace('.', ',') + ' mln' : n >= 1e3 ? Math.round(n / 1e3) + ' tys.' : String(n); }
  function dur(sec) { sec = +sec || 0; var h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return h ? h + ' h ' + m + ' min' : m + ' min'; }
  function ago(iso) { var m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? 'przed chwilą' : m < 60 ? m + ' min temu' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min temu'; }
  // wersja, nad którą trwa praca: [v5b] na początku wpisu (nowe przebiegi) albo wyliczona z wpisów („zapis v5a” → v5b, „szkic v5” → v5a)
  function workLabel(r, ev) {
    var msgs = (ev || []).map(function (e) { return String(e.message || ''); }).concat([String(r.last_message || '')]);
    for (var i = msgs.length - 1; i >= 0; i--) { var m = msgs[i].match(/^\[(v\d+[a-z]?)\]/); if (m) return m[1]; }
    if (r.kind !== 'revise') { var g = msgs.join(' ').match(/szkic v(\d+)/g); return r.status === 'done' && g ? g.pop().replace('szkic ', '') : 'nowy szkic'; }
    var saved = null, base = null;
    msgs.forEach(function (s) { var a = s.match(/zapis (v\d+)([a-z])/); if (a) saved = [a[1], a[2]]; var b = s.match(/szkic (v\d+)\)/); if (b && !base) base = b[1]; });
    if (r.status === 'done' || r.status === 'stopped') return saved ? saved[0] + saved[1] : base || '';
    if (saved) return saved[0] + String.fromCharCode(saved[1].charCodeAt(0) + 1);
    return base ? base + 'a' : '';
  }
  function rounds(ev) {
    var out = [], max = 3, first = null;
    (ev || []).forEach(function (e) {
      var s = String(e.message || ''), m = s.match(/runda (\d+)\/(\d+) \((\d+) błęd/);
      if (m) { out[+m[1] - 1] = +m[3]; max = +m[2]; }
      var f = s.match(/kontroli całej trasy \((\d+) błęd/); if (f) first = +f[1];
    });
    return { errs: out, max: max, first: first };
  }
  function clean(s) { return String(s || '').replace(/^\[v\d+[a-z]?\]\s*/, '').replace(/^[a-z0-9-]+: /, '').replace(/[①②③④⑤]c?\s*/g, '').replace(/\s—\s/g, ' · '); }
  function progressBlock(r, ev, label) {
    if (r.kind === 'revise') {
      var R = rounds(ev), cur = R.errs.length, base = label.replace(/[a-z]$/, '');
      var cells = [];
      for (var i = 1; i <= R.max; i++) {
        var lab = base + String.fromCharCode(96 + i), st = i < cur || (i === cur && r.status === 'done') ? 'is-done' : i === cur && r.status !== 'stopped' ? 'is-now' : '';
        cells.push('<li class="' + st + '"><b>' + esc(lab) + '</b><span>' + (R.errs[i - 1] != null ? 'do poprawy: ' + R.errs[i - 1] : i === cur ? 'w toku' : 'czeka') + '</span></li>');
      }
      // etap wewnątrz bieżącej rundy — z ostatniego wpisu
      var last = clean(r.last_message), STEPS = ['Poprawki (Gemini)', 'Kontrola przystanków (Claude)', 'Kontrola całej trasy (Claude)', 'Zapis ' + label];
      var sn = /zapis/i.test(last) ? 4 : /cała trasa|całej trasy po|kontrola Claude · cała/i.test(last) && !/runda \d/.test(last) ? 3 : /kontrola Claude po poprawkach/i.test(last) ? 2 : 1;
      if (/szkic v\d+\)/.test(last) && !cur) sn = 3;
      var where = (last.match(/· (\d+ .+?)(?: \(\d+\))?$/) || [])[1] || '';
      var steps = r.status === 'running' || r.status === 'stalled' ? '<div class="pg-step"><p class="pg-step__now"><small>Etap ' + sn + ' z 4' + (cur ? ' · runda ' + cur + ' z ' + R.max : ' · kontrola wstępna') + '</small>' +
        '<b>' + esc(STEPS[sn - 1]) + '</b>' + (where && sn < 3 ? '<span>przystanek ' + esc(where) + '</span>' : '') + '</p>' +
        '<ol class="pg-stages pg-stages--4">' + STEPS.map(function (l, i) { return '<li class="' + (i + 1 < sn ? 'is-done' : i + 1 === sn ? 'is-now' : '') + '"><span>' + esc(l) + '</span></li>'; }).join('') + '</ol></div>' : '';
      return steps + '<ol class="pg-rounds" aria-label="Rundy poprawek">' + cells.join('') + '</ol>' +
        '<p class="pg-trend">Błędy w kontroli: <b>' + esc(R.errs.filter(function (x) { return x != null; }).join(' → ') || '—') + '</b></p>';
    }
    var st = Math.min(+r.stage || 0, 7);
    return (r.status === 'running' || r.status === 'stalled' ? '<div class="pg-step"><p class="pg-step__now"><small>Etap ' + st + ' z 7</small><b>' + esc(STAGES[st - 1] || 'start') + (st === 3 && r.stop_k && r.stops_n ? ' ' + r.stop_k + '/' + r.stops_n : '') + '</b></p></div>' : '') +
      '<ol class="pg-stages" aria-label="Etap ' + st + ' z 7">' + STAGES.map(function (l, i) {
      var n = i + 1, cls = n < st || (n === st && r.status === 'done') ? 'is-done' : n === st ? 'is-now' : '';
      var extra = n === 3 && n === st && r.stop_k && r.stops_n ? ' ' + r.stop_k + '/' + r.stops_n : '';
      return '<li class="' + cls + '"><span>' + esc(l + extra) + '</span></li>';
    }).join('') + '</ol>';
  }
  function openProgress() {
    state.current = null; state.trip = null; state.versions = null; state.tabVersion = null; clearInterval(state.poll);
    var openSteps = {};
    var draw = function () {
      return Promise.all([
        api('/pipeline_runs?order=last_at.desc&limit=60'),
        api('/pipeline_queue?status=in.(queued,running)&order=id.asc').catch(function () { return []; })
      ]).then(function (res) {
        var runs = res[0] || [], queue = res[1] || [];
        // jedna karta na wycieczkę: najnowszy przebieg; starsze w historii karty
        var by = {}, order = [];
        runs.forEach(function (r) { if (!by[r.city_slug]) { by[r.city_slug] = []; order.push(r.city_slug); } by[r.city_slug].push(r); });
        var mains = order.map(function (k) { return by[k][0]; });
        return Promise.all(mains.map(function (r) { return api('/pipeline_events?run_id=eq.' + encodeURIComponent(r.run_id) + '&order=id.asc').catch(function () { return []; }); }))
          .then(function (evs) { render(order, by, evs, queue, runs); });
      }).catch(function (e) {
        $d.innerHTML = '<div class="adm-trip__bar"><a class="qc-btn qc-btn--sm adm-back" href="#/">← Wszystkie wycieczki</a></div><p class="adm-empty">Postęp prac niedostępny: ' + esc(e.message) + '</p>';
      });
    };
    function render(order, by, evs, queue, runs) {
      var active = order.filter(function (k) { return by[k][0].status === 'running' || by[k][0].status === 'stalled'; }).length;
      var sumG = runs.reduce(function (s, r) { return s + (+r.gemini_tokens || 0); }, 0), sumC = runs.reduce(function (s, r) { return s + (+r.claude_tokens || 0); }, 0);
      var h = '<div class="adm-trip__bar"><a class="qc-btn qc-btn--sm adm-back" href="#/">← Wszystkie wycieczki</a>' +
        '<span class="adm-cm__meta">odświeża się co 30 s · ' + esc(new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })) + '</span></div>' +
        '<section class="pg"><header class="pg-head"><div><p class="label">Postęp prac</p><h2>Wycieczki w procesie</h2></div>' +
        '<dl class="pg-kpi"><div><dt>pracuje</dt><dd>' + active + '</dd></div><div><dt>w kolejce</dt><dd>' + queue.filter(function (j) { return j.status === 'queued'; }).length + '</dd></div>' +
        '<div><dt>Gemini</dt><dd>' + tok(sumG) + '</dd></div><div><dt>Claude</dt><dd>' + tok(sumC) + '</dd></div></dl></header>';
      if (queue.length) h += '<div class="pg-queue"><b>Kolejka:</b> ' + queue.map(function (j) {
        var req = {}; try { req = JSON.parse(j.request); } catch (e) { /* tekst */ }
        return '<span class="pg-qitem">' + esc(req.name || j.city_slug) + ' <small>' + (j.status === 'queued' ? 'czeka' : 'pracuje') + '</small></span>';
      }).join('') + '</div>';
      h += order.length ? order.map(function (k, i) {
        var r = by[k][0], ev = evs[i] || [], label = workLabel(r, ev), old = by[k].slice(1);
        var stCls = r.status === 'stalled' || r.status === 'error' ? 'bad' : r.status;
        var verb = r.status === 'running' ? 'Pracujemy nad' : r.status === 'stalled' ? 'Stoi przy' : r.status === 'done' ? 'Gotowe' : r.status === 'stopped' ? 'Przerwane przy' : 'Błąd przy';
        return '<article class="pg-card pg-card--' + esc(stCls) + '">' +
          '<header class="pg-card__head"><div class="pg-card__title"><a href="#/' + esc(k) + '">' + esc(titleCase(k)) + '</a>' +
          '<span class="pg-pill pg-pill--' + esc(stCls) + '">' + (r.status === 'running' ? '<i class="pg-dot" aria-hidden="true"></i>' : '') + esc(RUNST[r.status] || r.status) + '</span></div>' +
          '<div class="pg-ver"><small>' + esc(verb) + '</small><b>' + esc(label || '—') + '</b></div></header>' +
          progressBlock(r, ev, label) +
          '<p class="pg-now"><b>' + (r.status === 'done' ? 'Ostatni krok' : 'Teraz') + ':</b> ' + esc(clean(r.last_message)) + ' <span>' + esc(ago(r.last_at)) + '</span></p>' +
          '<dl class="pg-meta"><div><dt>start</dt><dd>' + esc(when(r.started_at)) + '</dd></div><div><dt>czas</dt><dd>' + esc(dur(r.seconds)) + '</dd></div>' +
          '<div><dt>Gemini</dt><dd>' + esc(tok(r.gemini_tokens)) + ' <small>· ' + esc(r.gemini_calls) + ' zap.</small></dd></div>' +
          '<div><dt>Claude</dt><dd>' + esc(tok(r.claude_tokens)) + ' <small>· ' + esc(r.claude_calls) + ' wyw.</small></dd></div></dl>' +
          '<details class="pg-steps" data-k="' + esc(k) + '"' + (openSteps[k] ? ' open' : '') + '><summary>Kroki z godzinami (' + ev.length + ')</summary><ol>' + ev.slice().reverse().map(function (e) {
            return '<li><time>' + esc(new Date(e.created_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })) + '</time><span>' + esc(clean(e.message)) + '</span></li>';
          }).join('') + '</ol></details>' +
          (old.length ? '<details class="pg-steps pg-old"><summary>Wcześniejsze przebiegi (' + old.length + ')</summary><ul>' + old.map(function (o) {
            return '<li><span class="pg-pill pg-pill--' + esc(o.status === 'stalled' ? 'bad' : o.status) + '">' + esc(RUNST[o.status] || o.status) + '</span> ' + esc(when(o.started_at)) + ' · ' + esc(dur(o.seconds)) + ' · ' + esc(clean(o.last_message)) + '</li>';
          }).join('') + '</ul></details>' : '') +
          '</article>';
      }).join('') : '<p class="adm-empty">Brak przebiegów — pojawią się przy pierwszej wycieczce w nowym procesie.</p>';
      $d.innerHTML = h + '</section>';
    }
    $d.onclick = null;
    $d.addEventListener('toggle', function (e) { var x = e.target; if (x.matches && x.matches('details[data-k]')) openSteps[x.getAttribute('data-k')] = x.open; }, true);
    $d.innerHTML = '<div class="adm-placeholder"><p>Ładuję postęp prac…</p></div>';
    draw(); state.poll = setInterval(function () { if (location.hash === '#/postep') draw(); }, 30000);
    document.title = 'Postęp prac · Quolino admin';
  }

  // ── Koszty AI (JP 2026-10-25): wszystkie modele, za co odpowiadają, tokeny i kwoty; tygodnie / miesiące ──
  // Źródło: admin.ai_usage_daily (SQL 2026-10-25-koszty-ai.sql), zasila ai-usage-import.mjs z work/costs.jsonl.
  var AI = {
    gemini: { name: 'Gemini', who: 'Google, abonament AI Pro (Antigravity); zapas: darmowy klucz API', does: 'research z wyszukiwarką Google, pisanie szkicu, bloki przystanków, poprawki' },
    claude: { name: 'Claude', who: 'Anthropic, Claude Code na serwerze', does: 'kontrola faktów przystanków i całej trasy, kontrola po poprawkach, zasady z uwag' },
    jev: { name: 'Jev', who: 'TypeSafe, System One (płatne API, 0,042 $ / 1 mln tokenów wejścia)', does: 'szybkie decyzje: rozdział błędów z kontroli na drobiazgi, podmiany i przepisanie' },
    openrouter: { name: 'OpenRouter', who: 'modele zewnętrzne przez OpenRouter (płatne i darmowe)', does: 'tłumaczenia, starsze skrypty treści, przegląd lokali' }
  };
  var BILL = { abonament: 'abonament', darmowe: 'darmowe', api: 'płatne API' };
  function demoCosts() {
    var out = [], d = new Date();
    for (var i = 0; i < 45; i++) {
      var day = new Date(d.getTime() - i * 864e5).toISOString().slice(0, 10);
      out.push({ day: day, provider: 'gemini', model: 'Antigravity (AI Pro)', role: i % 3 ? 'research z Google' : 'poprawki', billing: 'abonament', calls: 12, tokens_in: 380000, tokens_out: 52000, usd: 0, usd_equiv: 0 });
      out.push({ day: day, provider: 'claude', model: 'claude-opus', role: i % 2 ? 'kontrola faktów przystanków' : 'kontrola całej trasy', billing: 'abonament', calls: 9, tokens_in: 1100000, tokens_out: 40000, usd: 0, usd_equiv: 2.41 });
      if (i % 4 === 0) out.push({ day: day, provider: 'openrouter', model: 'deepseek/deepseek-v3.2', role: 'trip-translate', billing: 'api', calls: 30, tokens_in: 210000, tokens_out: 90000, usd: 0.12, usd_equiv: 0.12 });
    }
    return out;
  }
  function usd(n) { n = +n || 0; return n === 0 ? '0 $' : n < 0.01 ? '< 0,01 $' : n.toFixed(2).replace('.', ',') + ' $'; }
  function isoWeek(day) {
    var t = new Date(day + 'T12:00:00Z'), dn = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - dn + 3);
    var y = t.getUTCFullYear(), w1 = new Date(Date.UTC(y, 0, 4)), w = 1 + Math.round(((t - w1) / 864e5 - 3 + ((w1.getUTCDay() + 6) % 7)) / 7);
    var mon = new Date(day + 'T12:00:00Z'); mon.setUTCDate(mon.getUTCDate() - dn);
    return { key: y + '-T' + (w < 10 ? '0' : '') + w, label: 'tydzień ' + w + ' · od ' + mon.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }) };
  }
  var MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
  function periodOf(day, mode) { if (mode === 'w') return isoWeek(day); var y = day.slice(0, 4), m = +day.slice(5, 7); return { key: day.slice(0, 7), label: MONTHS[m - 1] + ' ' + y }; }
  function add(a, r) { a.calls += +r.calls || 0; a.tok += (+r.tokens_in || 0) + (+r.tokens_out || 0); a.usd += +r.usd || 0; a.eq += +r.usd_equiv || 0; return a; }
  function zero() { return { calls: 0, tok: 0, usd: 0, eq: 0 }; }
  function openCosts() {
    state.current = null; state.trip = null; clearInterval(state.poll);
    var mode = 'm'; try { mode = localStorage.getItem('adm.costMode') || 'm'; } catch (e) { /* brak */ }
    var rows = null, err = null;
    function draw() {
      var h = '<div class="adm-trip__bar"><a class="qc-btn qc-btn--sm adm-back" href="#/">← Wszystkie wycieczki</a><a class="qc-btn qc-btn--sm" href="#/postep">Postęp prac</a></div><section class="pg">';
      if (err) { $d.innerHTML = h + '<p class="adm-empty">Koszty AI niedostępne: ' + esc(err) + '<br>Potrzebny SQL 2026-10-25-koszty-ai.sql (zatwierdzenie wdrożenia).</p></section>'; return; }
      var per = {}, keys = [], prov = {}, roles = {};
      rows.forEach(function (r) {
        var p = periodOf(r.day, mode);
        if (!per[p.key]) { per[p.key] = { label: p.label, all: zero(), by: {} }; keys.push(p.key); }
        add(per[p.key].all, r); add(per[p.key].by[r.provider] = per[p.key].by[r.provider] || zero(), r);
        var pk = r.provider; prov[pk] = prov[pk] || { all: zero(), bills: {}, models: {} }; add(prov[pk].all, r); prov[pk].bills[r.billing] = 1; prov[pk].models[r.model] = 1;
        var rk = pk + '|' + r.role; roles[rk] = roles[rk] || { provider: pk, role: r.role, billing: r.billing, s: zero() }; add(roles[rk].s, r);
      });
      keys.sort().reverse();
      var cur = keys[0] ? per[keys[0]] : { label: '—', all: zero(), by: {} };
      var total = keys.reduce(function (a, k) { a.usd += per[k].all.usd; a.eq += per[k].all.eq; a.tok += per[k].all.tok; return a; }, zero());
      h += '<header class="pg-head"><div><p class="label">Koszty AI</p><h2>Modele, tokeny, kwoty</h2></div>' +
        '<div class="pg-seg" role="group" aria-label="Okres"><button type="button" data-mode="w" aria-pressed="' + (mode === 'w') + '">Tygodnie</button><button type="button" data-mode="m" aria-pressed="' + (mode === 'm') + '">Miesiące</button></div></header>';
      h += '<div class="pg-card pg-card--running"><p class="pg-step__now"><small>Bieżący okres · ' + esc(cur.label) + '</small></p><dl class="pg-big">' +
        '<div><dt>Zapłacone</dt><dd>' + usd(cur.all.usd) + '</dd><p>realne opłaty za płatne API</p></div>' +
        '<div><dt>Równowartość cennika API</dt><dd>' + usd(cur.all.eq) + '</dd><p>tyle kosztowałoby to bez abonamentów</p></div>' +
        '<div><dt>Tokeny</dt><dd>' + tok(cur.all.tok) + '</dd><p>' + esc(cur.all.calls) + ' zapytań</p></div></dl>' +
        '<p class="pg-trend">Od początku dziennika: zapłacone <b>' + usd(total.usd) + '</b> · równowartość <b>' + usd(total.eq) + '</b> · <b>' + tok(total.tok) + '</b> tokenów. Abonamenty (AI Pro, Claude) to stała opłata miesięczna, nie wliczona w „zapłacone”.</p></div>';
      h += '<h3 class="pg-h3">Kto za co odpowiada</h3><div class="pg-ai">' + Object.keys(prov).sort(function (a, b) { return prov[b].all.tok - prov[a].all.tok; }).map(function (pk) {
        var P = prov[pk], meta = AI[pk] || { name: pk, who: '', does: '' };
        var rs = Object.keys(roles).filter(function (k) { return roles[k].provider === pk; }).map(function (k) { return roles[k]; }).sort(function (a, b) { return b.s.tok - a.s.tok; });
        return '<article class="pg-card pg-ai__card pg-ai--' + esc(pk) + '"><header class="pg-card__head"><div><div class="pg-card__title"><span class="pg-ai__name">' + esc(meta.name) + '</span>' +
          Object.keys(P.bills).map(function (b) { return '<span class="pg-pill pg-pill--' + (b === 'api' ? 'bad' : b === 'abonament' ? 'running' : 'done') + '">' + esc(BILL[b] || b) + '</span>'; }).join('') + '</div>' +
          '<p class="pg-ai__who">' + esc(meta.who) + '</p><p class="pg-ai__does"><b>Odpowiada za:</b> ' + esc(meta.does) + '</p></div>' +
          '<dl class="pg-ai__sum"><div><dt>tokeny</dt><dd>' + tok(P.all.tok) + '</dd></div><div><dt>zapłacone</dt><dd>' + usd(P.all.usd) + '</dd></div><div><dt>równowartość</dt><dd>' + usd(P.all.eq) + '</dd></div></dl></header>' +
          '<table class="pg-tab"><thead><tr><th scope="col">Zadanie</th><th scope="col">Zapytania</th><th scope="col">Tokeny</th><th scope="col">Zapłacone</th><th scope="col">Równowartość</th></tr></thead><tbody>' +
          rs.map(function (x) { return '<tr><th scope="row">' + esc(x.role) + '</th><td>' + esc(x.s.calls) + '</td><td>' + tok(x.s.tok) + '</td><td>' + usd(x.s.usd) + '</td><td>' + usd(x.s.eq) + '</td></tr>'; }).join('') +
          '</tbody></table><p class="pg-ai__models">Modele: ' + esc(Object.keys(P.models).join(', ')) + '</p></article>';
      }).join('') + '</div>';
      var provs = Object.keys(prov);
      h += '<h3 class="pg-h3">' + (mode === 'w' ? 'Tygodnie' : 'Miesiące') + '</h3><div class="pg-card"><table class="pg-tab pg-tab--periods"><thead><tr><th scope="col">Okres</th>' +
        provs.map(function (p) { return '<th scope="col">' + esc((AI[p] || { name: p }).name) + '</th>'; }).join('') + '<th scope="col">Razem</th></tr></thead><tbody>' +
        keys.map(function (k) {
          var P = per[k];
          return '<tr><th scope="row">' + esc(P.label) + '</th>' + provs.map(function (p) { var x = P.by[p]; return '<td>' + (x ? tok(x.tok) + '<small>' + usd(x.usd) + (x.eq > x.usd ? ' · ekw. ' + usd(x.eq) : '') + '</small>' : '—') + '</td>'; }).join('') +
            '<td><b>' + tok(P.all.tok) + '</b><small>' + usd(P.all.usd) + (P.all.eq > P.all.usd ? ' · ekw. ' + usd(P.all.eq) : '') + '</small></td></tr>';
        }).join('') + '</tbody></table></div>';
      $d.innerHTML = h + '</section>';
    }
    $d.onclick = function (e) {
      var b = e.target.closest && e.target.closest('[data-mode]'); if (!b) return;
      mode = b.getAttribute('data-mode'); try { localStorage.setItem('adm.costMode', mode); } catch (x) { /* brak */ } draw();
    };
    $d.innerHTML = '<div class="adm-placeholder"><p>Ładuję koszty AI…</p></div>';
    (DEMO ? Promise.resolve(demoCosts()) : api('/ai_usage_daily?order=day.desc&limit=5000')).then(function (r) { rows = r || []; draw(); })
      .catch(function (e) { err = e.message; draw(); });
    document.title = 'Koszty AI · Quolino admin';
  }

  // ── Zgłoszenia (JP 2026-10-25): zgłoszenia przy przystankach, opinie, formularz — kategoria i priorytet od Jev ──
  // Źródło: admin.feedback_ai, zapis: rpc admin_feedback_set (SQL 2026-10-25-zgloszenia-ai.sql). Treść to dane od obcych: tylko esc().
  var FB_SRC = { report: 'Zgłoszenie', rating: 'Opinia', contact: 'Formularz' };
  var FB_KAT = { fakt_cena: 'cena', fakt_godziny: 'godziny', fakt_zamkniete: 'zamknięte', fakt_adres: 'adres', fakt_opis: 'opis / fakt', trasa_dojscie: 'trasa / dojście',
    misja_dziecko: 'misja dziecka', tlumaczenie: 'tłumaczenie', strona_blad: 'błąd strony', platnosc_dostep: 'płatność / dostęp', bezpieczenstwo: 'bezpieczeństwo', pochwala: 'pochwała', sugestia: 'sugestia',
    pytanie: 'pytanie', wspolpraca: 'współpraca', prywatnosc: 'prywatność', spam: 'spam' };
  var FB_ST = { 'new': 'nowe', seen: 'przeczytane', reviewed: 'przejrzane', noted: 'odnotowane', fixed: 'poprawione', rejected: 'odrzucone', answered: 'odpowiedziane', spam: 'spam', done: 'załatwione' };
  var FB_OPEN = { 'new': 1, seen: 1 };
  var FB_KIND = { closed: 'zamknięte', wrong_hours: 'godziny', wrong_price: 'cena', wrong_address: 'adres / dojście', other: 'inne', trip: 'pytanie o wycieczkę', bug: 'błąd na stronie', payment: 'płatność lub dostęp', partner: 'współpraca', privacy: 'prywatność', other_: 'inne' };
  function demoFeedback() {
    var now = Date.now(), iso = function (h) { return new Date(now - h * 3600000).toISOString(); };
    return [
      { source: 'report', id: 'a1b2c3d4-1', at: iso(2), city_slug: 'frasassi', stop: 'Grotte di Frasassi', kind: 'wrong_hours', body: 'Na stronie jest 9:30, a pierwsze wejście było o 10:00. W niedzielę kolejka.', lang: 'pl', status: 'new', category: 'fakt_godziny', ai_category: 'fakt_godziny', ai_priority: 2, ai_confidence: 0.91 },
      { source: 'report', id: 'b2c3d4e5-2', at: iso(5), city_slug: 'spello', stop: 'Parcheggio', kind: 'closed', body: 'Parking zamknięty, remont do wiosny.', lang: 'pl', status: 'new', category: 'fakt_zamkniete', ai_category: 'fakt_zamkniete', ai_priority: 1, ai_confidence: 0.88 },
      { source: 'rating', id: 'c3d4e5f6-3', at: iso(20), city_slug: 'gubbio', stars: 5, body: 'Dzieci zachwycone misjami, dziękujemy!', lang: 'pl', status: 'new', category: 'pochwala', ai_category: 'pochwala', ai_priority: 3, ai_confidence: 0.97 },
      { source: 'contact', id: '17', at: iso(30), kind: 'partner', body: 'Hotel w Asyżu, chcemy polecać wasze trasy gościom.', lang: 'pl', status: 'seen', has_email: true, category: 'wspolpraca', ai_category: 'wspolpraca', ai_priority: 3, ai_confidence: 0.64 }];
  }
  function openFeedback() {
    state.current = null; state.trip = null; clearInterval(state.poll);
    var f = { src: '', cat: '', pri: '', open: true }, rows = null, err = null;
    try { var sv = JSON.parse(localStorage.getItem('adm.fb') || '{}'); if (sv && typeof sv === 'object') { f.src = sv.src || ''; f.cat = sv.cat || ''; f.pri = sv.pri || ''; f.open = sv.open !== false; } } catch (e) { /* brak */ }
    function save() { try { localStorage.setItem('adm.fb', JSON.stringify(f)); } catch (e) { /* brak */ } }
    function load() {
      return (DEMO ? Promise.resolve(demoFeedback()) : api('/feedback_ai?order=at.desc&limit=500')).then(function (r) { rows = r || []; err = null; draw(); })
        .catch(function (e) { err = e.message; draw(); });
    }
    function draw() {
      var h = '<div class="adm-trip__bar"><a class="qc-btn qc-btn--sm adm-back" href="#/">← Wszystkie wycieczki</a></div><section class="pg">';
      if (err) { $d.innerHTML = h + '<p class="adm-empty">Zgłoszenia niedostępne: ' + esc(err) + '<br>Potrzebny SQL 2026-10-25-zgloszenia-ai.sql (zatwierdzenie wdrożenia).</p></section>'; return; }
      var open = rows.filter(function (r) { return FB_OPEN[r.status]; });
      var urgent = open.filter(function (r) { return r.ai_priority === 1 || r.category === 'bezpieczenstwo' || r.category === 'fakt_zamkniete'; });
      var unsure = open.filter(function (r) { return r.ai_confidence != null && r.ai_confidence < 0.7 && !r.jp_category; });
      var list = rows.filter(function (r) { return (!f.open || FB_OPEN[r.status]) && (!f.src || r.source === f.src) && (!f.cat || r.category === f.cat) && (!f.pri || String(r.ai_priority) === f.pri); });
      var cats = {}; open.forEach(function (r) { var k = r.category || 'bez kategorii'; cats[k] = (cats[k] || 0) + 1; });
      h += '<header class="pg-head"><div><p class="label">Zgłoszenia</p><h2>Od rodzin i z formularza</h2></div>' +
        '<dl class="pg-kpi"><div><dt>do załatwienia</dt><dd>' + open.length + '</dd></div><div><dt>pilne</dt><dd>' + urgent.length + '</dd></div><div><dt>niepewne</dt><dd>' + unsure.length + '</dd></div><div><dt>90 dni</dt><dd>' + rows.length + '</dd></div></dl></header>';
      h += '<div class="pg-card fb-filters"><label>Źródło <select data-f="src"><option value="">wszystkie</option>' + Object.keys(FB_SRC).map(function (k) { return '<option value="' + k + '"' + (f.src === k ? ' selected' : '') + '>' + FB_SRC[k] + '</option>'; }).join('') + '</select></label>' +
        '<label>Kategoria <select data-f="cat"><option value="">wszystkie</option>' + Object.keys(FB_KAT).map(function (k) { return '<option value="' + k + '"' + (f.cat === k ? ' selected' : '') + '>' + FB_KAT[k] + (cats[k] ? ' (' + cats[k] + ')' : '') + '</option>'; }).join('') + '</select></label>' +
        '<label>Priorytet <select data-f="pri"><option value="">wszystkie</option><option value="1"' + (f.pri === '1' ? ' selected' : '') + '>P1 pilne</option><option value="2"' + (f.pri === '2' ? ' selected' : '') + '>P2 błąd w treści</option><option value="3"' + (f.pri === '3' ? ' selected' : '') + '>P3 reszta</option></select></label>' +
        '<label class="fb-chk"><input type="checkbox" data-f="open"' + (f.open ? ' checked' : '') + '> tylko do załatwienia</label></div>';
      h += list.length ? list.map(function (r) {
        var pri = r.ai_priority, conf = r.ai_confidence != null ? Math.round(r.ai_confidence * 100) : null;
        var cls = pri === 1 || r.category === 'bezpieczenstwo' ? 'bad' : FB_OPEN[r.status] ? 'running' : 'done';
        var acts = r.source === 'contact' ? [['answered', 'Odpowiedziane'], ['done', 'Załatwione'], ['spam', 'Spam']] : [['fixed', 'Poprawione'], ['noted', 'Odnotowane'], ['rejected', 'Odrzucone']];
        return '<article class="pg-card pg-card--' + cls + ' fb-item" data-src="' + esc(r.source) + '" data-id="' + esc(r.id) + '"><header class="pg-card__head"><div class="pg-card__title">' +
          '<span class="pg-pill">' + esc(FB_SRC[r.source] || r.source) + '</span>' +
          (r.city_slug ? '<a href="#/' + esc(r.city_slug) + '">' + esc(titleCase(r.city_slug)) + '</a>' : '<span class="fb-none">bez wycieczki</span>') +
          (r.stop ? '<span class="fb-stop">· ' + esc(r.stop) + '</span>' : '') + '</div>' +
          '<div class="fb-ai">' + (r.category ? '<b>' + esc(FB_KAT[r.category] || r.category) + '</b>' : '<b>bez kategorii</b>') +
          '<span>' + (pri ? 'P' + pri : '') + (conf != null ? ' · Jev ' + conf + '%' + (r.jp_category ? ' · poprawione przez JP' : conf < 70 ? ' · niepewne' : '') : '') + '</span></div></header>' +
          '<p class="fb-meta">' + esc(when(r.at)) + (r.kind ? ' · wybrane: ' + esc(FB_KIND[r.kind] || r.kind) : '') + (r.stars ? ' · ' + '★'.repeat(r.stars) + '☆'.repeat(5 - r.stars) : '') +
          (r.lang ? ' · język ' + esc(r.lang) : '') + (r.has_email ? ' · e-mail do odpowiedzi: tak' : '') + ' · status: <b>' + esc(FB_ST[r.status] || r.status) + '</b></p>' +
          '<blockquote class="fb-body">' + esc(r.body || '(bez treści)') + '</blockquote>' +
          '<div class="fb-acts">' + acts.map(function (a) { return '<button type="button" class="qc-btn qc-btn--sm" data-st="' + a[0] + '"' + (r.status === a[0] ? ' aria-pressed="true"' : '') + '>' + a[1] + '</button>'; }).join('') +
          '<label class="fb-fix">Kategoria: <select data-cat>' + (r.category ? '' : '<option value="" selected>wybierz</option>') + Object.keys(FB_KAT).map(function (k) { return '<option value="' + k + '"' + (r.category === k ? ' selected' : '') + '>' + FB_KAT[k] + '</option>'; }).join('') + '</select></label></div></article>';
      }).join('') : '<p class="adm-empty">Nic tu nie ma przy tych filtrach.</p>';
      $d.innerHTML = h + '</section>';
    }
    function set(card, body) {
      var b = { p_source: card.getAttribute('data-src'), p_id: card.getAttribute('data-id'), p_status: body.status || null, p_category: body.category || null };
      if (DEMO) { rows.forEach(function (r) { if (r.source === b.p_source && r.id === b.p_id) { if (b.p_status) r.status = b.p_status; if (b.p_category) { r.category = r.jp_category = b.p_category; } } }); draw(); return; }
      api('/rpc/admin_feedback_set', { method: 'POST', body: b }).then(load).catch(function (e) { alertBox(e.message); });
    }
    function alertBox(m) { var p = document.createElement('p'); p.className = 'adm-empty'; p.textContent = 'Nie zapisano: ' + m; $d.prepend(p); }
    $d.onclick = function (e) {
      var b = e.target.closest && e.target.closest('[data-st]'); if (!b) return;
      set(b.closest('.fb-item'), { status: b.getAttribute('data-st') });
    };
    $d.onchange = function (e) {
      var t = e.target;
      if (t.hasAttribute('data-cat')) { if (t.value) set(t.closest('.fb-item'), { category: t.value }); return; }
      var k = t.getAttribute('data-f'); if (!k) return;
      f[k] = k === 'open' ? t.checked : t.value; save(); draw();
    };
    $d.innerHTML = '<div class="adm-placeholder"><p>Ładuję zgłoszenia…</p></div>';
    load(); state.poll = setInterval(function () { if (location.hash === '#/zgloszenia') load(); }, 60000);
    document.title = 'Zgłoszenia · Quolino admin';
  }

  // ── Skrzynka decyzji (JP 2026-10-30): wszystko, co czeka na JP, w jednym miejscu — koniec z konsolą ──
  // Źródła (SQL 2026-10-30-skrzynka-decyzji.sql): admin.deploy_requests (wdrożenia SQL/ops, zapisuje deploy.sh), admin.cost_requests
  // (zgody na koszty, zapisuje repo-jobs.mjs), admin.ai_budget (zużycie miesiąca + próg), admin.decision_drafts (szkice z czerwonymi
  // flagami), rpc admin_watch_open (ustalenia strażników; tabela z 2026-10-30-straznicy.sql), kandydaci zdjęć do ikon (pliki w repo)
  // + admin.icon_refs. Decyzje: rpc admin_deploy_decide / admin_cost_decide / admin_setting_set / admin_watch_decide / admin_icon_refs_set.
  // Treść commitów, diffów i ustaleń to dane — tylko esc(). Brak źródła (SQL jeszcze nie wdrożony) = komunikat w sekcji, reszta działa.
  var GH = 'https://github.com/jppal-lang/przewodnik';
  var DEC_SQL = 'baza czeka na SQL 2026-10-30-skrzynka-decyzji.sql (ostatni raz konsolą: deploy.sh approve).';
  var DST = { pending: 'czeka na zgodę', approved: 'zatwierdzone — serwer wdroży w ciągu 2 min', running: 'wdrażam…', done: 'wdrożone', failed: 'błąd', rejected: 'odrzucone', superseded: 'zastąpione nowszą prośbą' };
  var CSTS = { pending: 'czeka na zgodę', approved: 'zgoda — serwer uruchomi w ciągu 10 min', running: 'w toku', done: 'wykonane', failed: 'błąd', rejected: 'odrzucone' };
  var WKIND = { hours: 'godziny', price: 'cena', closed: 'zamknięte', link: 'link', source: 'źródło', fact: 'fakt', photo: 'zdjęcie', translation: 'tłumaczenie', closure: 'zamknięcie', reopen: 'otwarte ponownie', closure_overdue: 'termin zamknięcia minął', venue: 'lokal', season: 'zmiana sezonu', site: 'strona', cost: 'koszty AI' };
  var inbox = { n: null, data: null, loading: null };

  function demoInbox() {
    var now = Date.now(), iso = function (m) { return new Date(now - m * 60000).toISOString(); };
    var d = state.demoInbox;
    if (d) return d;
    d = state.demoInbox = {
      deploys: [{ id: 12, hash: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', base: '0f1e2d3c4b5a69788796a5b4c3d2e1f001234567',
        files: ['_content/claude-skills/sql/2026-10-30-skrzynka-decyzji.sql', '_content/claude-skills/ops/deploy.sh'],
        summary: 'a1b2c3d Skrzynka decyzji w panelu: wdrożenia i koszty przyciskiem\n9f8e7d6 deploy.sh: prośby o zgodę w ops.deploy_requests',
        diff: 'diff --git a/_content/claude-skills/sql/2026-10-30-skrzynka-decyzji.sql b/_content/claude-skills/sql/2026-10-30-skrzynka-decyzji.sql\n' +
          'new file mode 100644\n--- /dev/null\n+++ b/_content/claude-skills/sql/2026-10-30-skrzynka-decyzji.sql\n@@ -0,0 +1,6 @@\n' +
          '+-- 2026-10-30 (JP): SKRZYNKA DECYZJI w panelu admina\n+BEGIN;\n+CREATE TABLE IF NOT EXISTS ops.deploy_requests (id bigserial PRIMARY KEY, hash text NOT NULL UNIQUE);\n' +
          '+-- samokontrola: gość bez dostępu\n+COMMIT;\n' +
          'diff --git a/_content/claude-skills/ops/deploy.sh b/_content/claude-skills/ops/deploy.sh\n--- a/_content/claude-skills/ops/deploy.sh\n+++ b/_content/claude-skills/ops/deploy.sh\n@@ -8,2 +8,3 @@\n-#   sh deploy.sh approve <hash>\n+#   Zgoda JP: przycisk w panelu admina (#/decyzje)\n+#   awaryjnie: sh deploy.sh approve <hash>\n',
        status: 'pending', created_at: iso(14), decided_at: null, result: null }],
      history: [{ id: 11, hash: '5d5e84dc0000000000000000000000000000abcd', files: ['_content/claude-skills/sql/2026-10-30-icon-refs.sql'], summary: '5d5e84d Ikony: wybór zdjęć w panelu',
        status: 'done', decided_at: iso(300), finished_at: iso(298), result: 'install.sh: OK\nSQL OK: 2026-10-30-icon-refs.sql\n✅ zatwierdzone i wdrożone: 5d5e84d Ikony: wybór zdjęć w panelu' }],
      costs: [{ id: 4, job_key: '2026-10-30-rimini-tlumaczenie-2', kind: 'repo-job', title: 'Tłumaczenie Rimini na 7 języków', detail: 'Po poprawkach v4 tłumaczenia są nieaktualne; EN, DE, IT, FR, ES, CS, NL.',
        est_usd: 0.4, est_limit: '—', payload: { script: 'trip-translate.mjs', args: ['rimini', '--fresh'] }, status: 'pending', created_at: iso(40) },
        { id: 3, job_key: '2026-10-30-spello-recheck', kind: 'repo-job', title: 'Ponowna kontrola Spello v3f', detail: 'Kontrola faktów po łagodnym source-check.',
          est_usd: 0, est_limit: '~14 wywołań Antigravity (abonament)', payload: { script: 'gemini-draft.mjs', args: ['spello', '--recheck'] }, status: 'approved', decided_at: iso(3), created_at: iso(90) }],
      budget: { month_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(), usd_api: 3.12, usd_equiv_sub: 41.7, calls: 812, budget_usd: 10, pending_est_usd: 0.4 },
      watch: { ready: true, decide: true, rows: [
        { id: 31, kind: 'hours', city_slug: 'frasassi', stop_key: 'grotte-di-frasassi', title: 'Grotte di Frasassi: zimowe godziny od 4 listopada', detail: 'Strona jaskiń podaje od 4.11 wejścia o 10:00, 12:00, 15:00 (dotąd co godzinę).',
          proposal: { field: 'stop.price', old: 'wejścia co godzinę 9:30–18:00', 'new': 'zimą (od 4.11) wejścia o 10:00, 12:00 i 15:00 — sprawdź na miejscu', why: 'oficjalna strona, aktualizacja 28.10' }, url: 'https://www.frasassi.com/', created_at: iso(70) },
        { id: 30, kind: 'link', city_slug: 'spello', stop_key: null, title: 'Spello: link do parkingu nie działa (404)', detail: 'Strona gminy przeniosła cennik parkingów.',
          proposal: { 'new': 'https://www.comune.spello.pg.it/parcheggi' }, url: 'https://www.comune.spello.pg.it/', created_at: iso(200) }] }
    };
    return d;
  }

  // zbiera wszystkie źródła; każde osobno — brak jednego nie blokuje reszty
  function loadInbox() {
    if (inbox.loading) return inbox.loading;
    var soft = function (p) { return p.then(function (v) { return { ok: v }; }, function (e) { if (e && e.session) throw e; return { err: e.message }; }); };
    var D = DEMO ? demoInbox() : null;
    var deploys = DEMO ? Promise.resolve(D.deploys.filter(function (r) { return r.status === 'pending' || r.status === 'approved' || r.status === 'running'; }))
      : api('/deploy_requests?status=in.(pending,approved,running)&order=id.desc&limit=10');
    var hist = DEMO ? Promise.resolve(D.history.concat(D.deploys.filter(function (r) { return /done|failed|rejected|superseded/.test(r.status); })))
      : api('/deploy_requests?status=in.(done,failed,rejected,superseded)&order=id.desc&limit=8&select=id,hash,files,summary,status,decided_at,finished_at,result');
    var costs = DEMO ? Promise.resolve(D.costs) : api('/cost_requests?order=id.desc&limit=30');
    var budget = DEMO ? Promise.resolve([D.budget]) : api('/ai_budget');
    var watch = DEMO ? Promise.resolve(D.watch) : api('/rpc/admin_watch_open', { method: 'POST', body: {} });
    var drafts = DEMO ? api('/admin_queue').then(function (q) { return q.map(function (x, i) { return Object.assign({}, x, { red_flags: i === 0 ? 3 : 0, warnings: 5 - i }); }); })
      : api('/decision_drafts?order=created_at.desc').catch(function (e) {
        if (e.session) throw e;
        return api('/admin_queue').then(function (q) { return q.map(function (x) { return Object.assign({}, x, { red_flags: null }); }); });
      });
    var icons = loadIconInbox();
    inbox.loading = Promise.all([soft(deploys), soft(hist), soft(costs), soft(budget), soft(watch), soft(drafts), soft(icons)]).then(function (r) {
      var d = { deploys: r[0], hist: r[1], costs: r[2], budget: r[3], watch: r[4], drafts: r[5], icons: r[6] };
      var pend = function (x, f) { return x.ok ? x.ok.filter(f).length : 0; };
      d.count = {
        deploy: pend(d.deploys, function (x) { return x.status === 'pending'; }),
        cost: pend(d.costs, function (x) { return x.status === 'pending'; }),
        watch: d.watch.ok && d.watch.ok.ready ? (d.watch.ok.rows || []).length : 0,
        draft: d.drafts.ok ? d.drafts.ok.length : 0,
        icon: d.icons.ok ? d.icons.ok.length : 0
      };
      inbox.n = d.count.deploy + d.count.cost + d.count.watch + d.count.draft + d.count.icon;
      inbox.data = d; inbox.loading = null;
      paintInboxCount();
      return d;
    }, function (e) { inbox.loading = null; throw e; });
    return inbox.loading;
  }
  // przystanki z kandydatami zdjęć bez decyzji JP (ops.icon_refs) — jedna pozycja na trasę, z terminem automatu
  function loadIconInbox() {
    var slugs = (state.trips ? Promise.resolve(state.trips.map(function (t) { return t.slug; }))
      : api('/admin_trips?select=city_slug').then(function (rows) { return (rows || []).map(function (r) { return r.city_slug; }); }, function () { return []; }));
    return slugs.then(function (list) {
      list = list.filter(function (s) { return /^[a-z0-9][a-z0-9-]{0,62}$/.test(s); });
      var refs = api('/icon_refs?select=trip,stop_key,mode').catch(function () { return null; });
      var cands = Promise.all(list.map(function (s) {
        if (DEMO) return Promise.resolve(s === 'spello' ? demoCandidates(s) : null);
        return fetch('../media/icons/place-candidates/' + encodeURIComponent(s) + '.json', { credentials: 'same-origin', cache: 'no-cache', redirect: 'manual' })
          .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
      }));
      return Promise.all([refs, cands]).then(function (res) {
        if (res[0] == null) throw new Error('wybór zdjęć niedostępny (SQL 2026-10-30-icon-refs.sql)');
        var done = {}; res[0].forEach(function (r) { done[r.trip + '|' + r.stop_key] = 1; });
        var out = [];
        res[1].forEach(function (c, i) {
          if (!c || !c.stops) return;
          var slug = list[i], open = [];
          Object.keys(c.stops).forEach(function (k) {
            var st = c.stops[k];
            if (PRACTICAL[st.category] || done[slug + '|' + k]) return;
            if (!Array.isArray(st.candidates) || !st.candidates.length) return;
            open.push({ key: k, name: st.name || k });
          });
          if (!open.length) return;
          var t0 = Date.parse(c.generated_at), dl = isNaN(t0) ? null : new Date(t0 + (+c.wait_hours || 48) * 3600000).toISOString();
          out.push({ trip: slug, stops: open, deadline: dl });
        });
        return out;
      });
    });
  }
  function paintInboxCount() {
    var n = inbox.n;
    [['decNav', true], ['decCount', false]].forEach(function (x) {
      var el = document.getElementById(x[0]); if (!el) return;
      el.textContent = n == null ? '·' : n; el.classList.toggle('is-zero', !n);
      el.setAttribute('title', n == null ? 'ładuję' : n + ' do decyzji');
    });
    var box = document.getElementById('decStart');
    if (box) {
      box.classList.toggle('is-hot', !!n);
      var s = box.querySelector('.adm-decstart__txt');
      if (s) s.textContent = n == null ? 'Sprawdzam, co czeka…' : n ? plForm(n, 'sprawa czeka', 'sprawy czekają', 'spraw czeka') + ' na Twoją decyzję' : 'Nic nie czeka na Twoją decyzję';
    }
  }

  function usdPl(n) { n = +n || 0; return n.toFixed(2).replace('.', ',') + ' $'; }
  function deployFiles(r) { return (r.files || []).map(function (f) { return String(f); }); }
  function shortPath(f) { return f.replace(/^_content\/claude-skills\//, ''); }
  function addedLines(diff) { return String(diff || '').split('\n').filter(function (l) { return l.charAt(0) === '+' && l.indexOf('+++') !== 0; }).map(function (l) { return l.slice(1); }); }
  function recDeploy(r) {
    var add = addedLines(r.diff), code = add.filter(function (l) { return !/^\s*--/.test(l) && !/^\s*#/.test(l); }).join('\n');
    var files = deployFiles(r), sql = files.filter(function (f) { return /\.sql$/.test(f); });
    if (/\b(DROP\s+(TABLE|SCHEMA|DATABASE|COLUMN)|TRUNCATE)\b/i.test(code)) return { tone: 'bad', text: 'Najpierw obejrzyj podgląd: zmiana usuwa dane albo tabele (DROP/TRUNCATE). Zatwierdź tylko, jeśli o to prosiłeś.' };
    if (/\brm\s+-rf\b|\bcurl\b[^\n]*\|\s*(ba)?sh\b/.test(code)) return { tone: 'bad', text: 'Najpierw obejrzyj podgląd: skrypt usuwa pliki albo pobiera i uruchamia kod z sieci.' };
    if (!r.diff) return { tone: 'ok', text: 'Zatwierdź, jeśli opis commitów zgadza się z tym, o co prosiłeś (podgląd zmian niedostępny — pliki w GitHub).' };
    var all = String(r.diff);
    if (sql.length && sql.length === files.length && /samokontrol/i.test(all)) return { tone: 'ok', text: 'Zatwierdź. Każdy plik SQL wykonuje się w całości albo wcale i sam się sprawdza; przy błędzie baza zostaje bez zmian.' };
    return { tone: 'ok', text: 'Zatwierdź, jeśli opis commitów zgadza się z tym, o co prosiłeś. Podgląd zmian poniżej; serwer wykona dokładnie te pliki z repo.' };
  }
  function diffHtml(diff) {
    var lines = String(diff || '').split('\n');
    return lines.map(function (l) {
      var c = /^(\+\+\+|---|diff --git|index |new file|deleted file)/.test(l) ? 'dec-diff__f' : l.charAt(0) === '+' ? 'dec-diff__a' : l.charAt(0) === '-' ? 'dec-diff__d' : l.indexOf('@@') === 0 ? 'dec-diff__h' : '';
      return '<span' + (c ? ' class="' + c + '"' : '') + '>' + esc(l) + '</span>';
    }).join('\n');
  }
  function decBtn(act, label, cls, confirm) {
    return '<button type="button" class="qc-btn qc-btn--sm ' + (cls || '') + '" data-dec="' + act + '"' + (confirm ? ' data-confirm="1"' : '') + '>' + esc(label) + '</button>';
  }
  function decItem(kind, id, o) {
    return '<article class="pg-card dec-item dec-item--' + kind + (o.tone === 'bad' ? ' pg-card--bad' : o.done ? ' pg-card--done' : ' pg-card--running') + '" data-kind="' + kind + '" data-id="' + esc(id) + '">' +
      '<p class="dec-kind">' + esc(o.kind) + (o.when ? ' · <time>' + esc(when(o.when)) + '</time>' : '') + (o.pill ? ' <span class="pg-pill pg-pill--' + (o.pillTone || 'running') + '">' + esc(o.pill) + '</span>' : '') + '</p>' +
      '<h4 class="dec-title">' + o.title + '</h4>' + (o.desc ? '<div class="dec-desc">' + o.desc + '</div>' : '') +
      (o.rec ? '<p class="dec-rec dec-rec--' + (o.recTone || 'ok') + '"><b>Rekomendacja:</b> ' + esc(o.rec) + '</p>' : '') +
      (o.extra || '') + (o.acts ? '<div class="dec-acts">' + o.acts + '</div>' : '') + '<p class="adm-msg dec-msg" role="status"></p></article>';
  }
  function deployHtml(r) {
    var files = deployFiles(r), rec = recDeploy(r), lines = String(r.summary || '').trim().split('\n').filter(Boolean);
    var desc = '<p>Serwer czeka na Twoją zgodę, żeby wykonać pliki, które działają jako administrator serwera albo na bazie' +
      (files.some(function (f) { return /\.sql$/.test(f); }) ? ' (SQL wykona się raz)' : '') + '.</p>' +
      (lines.length ? '<ul class="dec-commits">' + lines.slice(0, 12).map(function (l) { var m = l.match(/^([0-9a-f]{7,12})\s+(.*)$/); return '<li>' + (m ? '<a href="' + GH + '/commit/' + esc(m[1]) + '" target="_blank" rel="noopener noreferrer"><code>' + esc(m[1]) + '</code></a> ' + esc(m[2]) : esc(l)) + '</li>'; }).join('') +
        (lines.length > 12 ? '<li>… i ' + (lines.length - 12) + ' więcej</li>' : '') + '</ul>' : '') +
      '<ul class="dec-files">' + files.map(function (f) { return '<li><a href="' + GH + '/blob/' + esc(r.hash) + '/' + esc(f) + '" target="_blank" rel="noopener noreferrer"><code>' + esc(shortPath(f)) + '</code> ↗</a></li>'; }).join('') + '</ul>';
    var extra = r.diff ? '<details class="dec-more"><summary>Podgląd zmian w plikach (' + addedLines(r.diff).length + ' linii dodanych)</summary><pre class="dec-diff">' + diffHtml(r.diff) + '</pre></details>' : '';
    var acts = r.status === 'pending' ? decBtn('approve', 'Zatwierdź i wdróż', 'adm-btn-ok', true) + decBtn('reject', 'Odrzuć', 'adm-btn-no', true)
      : r.status === 'approved' ? decBtn('cancel', 'Cofnij zatwierdzenie', '', false) : '';
    return decItem('deploy', r.id, { kind: 'Wdrożenie', when: r.created_at, pill: r.status !== 'pending' ? DST[r.status] : null, pillTone: r.status === 'running' ? 'running' : 'done',
      title: 'Wdrożenie czeka: ' + esc(files.map(shortPath).slice(0, 4).join(', ')) + (files.length > 4 ? ' i ' + (files.length - 4) + ' innych' : ''),
      desc: desc, rec: r.status === 'pending' ? rec.text : null, recTone: rec.tone, tone: r.status === 'pending' ? rec.tone : null, extra: extra, acts: acts });
  }
  function costHtml(r, b) {
    var p = r.payload || {}, est = r.est_usd != null ? +r.est_usd : null, left = b ? (+b.budget_usd || 0) - (+b.usd_api || 0) : null;
    var rec = est == null ? 'Brak szacunku kwoty — zgódź się, jeśli wiesz, ile to kosztuje, albo odrzuć i poproś o szacunek.'
      : left != null && est > left ? 'Uwaga: przekroczy próg miesięczny (zostało ' + usdPl(Math.max(left, 0)) + '). Zgoda tylko, jeśli to pilne.'
      : est === 0 ? 'Zgoda — nie kosztuje płatnego API' + (r.est_limit && r.est_limit !== '—' ? ', zużyje tylko limit abonamentu.' : '.')
      : 'Zgoda — mieści się w progu miesięcznym (zostanie ' + usdPl(left - est) + ').';
    var desc = (r.detail ? '<p>' + esc(r.detail) + '</p>' : '') +
      '<dl class="pg-meta dec-meta"><div><dt>szacunek</dt><dd>' + (est == null ? '—' : usdPl(est)) + '</dd></div>' +
      (r.est_limit ? '<div><dt>limit abonamentu</dt><dd>' + esc(r.est_limit) + '</dd></div>' : '') +
      '<div><dt>zlecenie</dt><dd><code>' + esc((p.script || '?') + ' ' + (Array.isArray(p.args) ? p.args.join(' ') : '')) + '</code></dd></div></dl>';
    var acts = r.status === 'pending' ? decBtn('approve', 'Zgoda', 'adm-btn-ok', true) + decBtn('reject', 'Odrzuć', 'adm-btn-no', false) : '';
    return decItem('cost', r.id, { kind: 'Zgoda na koszt', when: r.created_at, pill: r.status !== 'pending' ? CSTS[r.status] : null, pillTone: r.status === 'failed' ? 'bad' : r.status === 'done' ? 'done' : 'running',
      title: esc(r.title), desc: desc, rec: r.status === 'pending' ? rec : null, recTone: est != null && left != null && est > left ? 'bad' : 'ok',
      extra: r.job_key ? '<p class="dec-src">Plik zlecenia: <a href="' + GH + '/blob/main/_content/jobs/' + esc(r.job_key) + '.json" target="_blank" rel="noopener noreferrer"><code>_content/jobs/' + esc(r.job_key) + '.json</code> ↗</a></p>' : '', acts: acts });
  }
  function budgetHtml(b) {
    var used = +b.usd_api || 0, cap = +b.budget_usd || 0, pct = cap ? Math.min(100, Math.round(used / cap * 100)) : 0, pend = +b.pending_est_usd || 0;
    var tone = cap && used >= cap ? 'bad' : pct >= 70 ? 'warn' : 'ok';
    var m = new Date(b.month_start || Date.now());
    return '<div class="pg-card dec-budget"><p class="dec-kind">Budżet AI · ' + esc(MONTHS[m.getMonth()] + ' ' + m.getFullYear()) + '</p>' +
      '<p class="dec-budget__big"><b>' + usdPl(used) + '</b> z ' + usdPl(cap) + ' <small>płatne API w tym miesiącu</small></p>' +
      '<div class="dec-bar dec-bar--' + tone + '" role="img" aria-label="Zużyto ' + pct + '% progu miesięcznego"><span style="width:' + pct + '%"></span>' +
      (pend && cap ? '<i style="left:' + pct + '%;width:' + Math.min(100 - pct, Math.round(pend / cap * 100)) + '%"></i>' : '') + '</div>' +
      '<p class="dec-budget__eq">Ekwiwalent abonamentów (Claude, AI Pro): <b>' + usdPl(b.usd_equiv_sub) + '</b> — tyle kosztowałoby to w cenniku API; płacisz stały abonament.' +
      (pend ? ' Czeka na zgodę lub w toku: <b>' + usdPl(pend) + '</b>.' : '') + '</p>' +
      '<form class="dec-cap" data-cap><label for="decCap">Próg miesięczny (USD)</label><input id="decCap" type="text" inputmode="decimal" value="' + esc(String(cap).replace('.', ',')) + '" autocomplete="off">' +
      '<button type="submit" class="qc-btn qc-btn--sm">Zapisz próg</button><span class="adm-msg" role="status"></span></form></div>';
  }
  function proposalHtml(p) {
    if (p == null) return '';
    if (typeof p !== 'object') return '<p class="dec-prop"><b>Propozycja:</b> ' + esc(p) + '</p>';
    var h = '';
    if (p.field) h += '<p class="dec-prop"><b>Pole:</b> ' + esc(RW.label(String(p.field).replace(/^(stop|city)\./, '')) || p.field) + '</p>';
    if (p.old != null) h += '<p class="dec-prop"><b>Jest:</b> ' + esc(p.old) + '</p>';
    if (p['new'] != null) h += '<p class="dec-prop dec-prop--new"><b>Propozycja:</b> ' + esc(p['new']) + '</p>';
    if (p.text != null) h += '<p class="dec-prop dec-prop--new"><b>Propozycja:</b> ' + esc(p.text) + '</p>';
    var rest = {}; Object.keys(p).forEach(function (k) { if (!/^(field|old|new|text|why|recommendation)$/.test(k)) rest[k] = p[k]; });
    if (Object.keys(rest).length) h += '<details class="dec-more"><summary>Szczegóły propozycji</summary><pre class="dec-diff">' + esc(JSON.stringify(rest, null, 1).slice(0, 4000)) + '</pre></details>';
    return h;
  }
  function watchHtml(r, canDecide) {
    var p = r.proposal && typeof r.proposal === 'object' ? r.proposal : null;
    var place = r.city_slug ? '<a href="#/' + esc(encodeURIComponent(r.city_slug)) + '">' + esc(titleCase(r.city_slug)) + '</a>' + (r.stop_key ? ' · ' + esc(r.stop_key) : '') : '';
    var safeUrl = /^https?:\/\//i.test(String(r.url || '')) ? String(r.url) : null;
    var desc = (place ? '<p class="dec-place">' + place + '</p>' : '') + (r.detail ? '<p>' + esc(r.detail) + '</p>' : '') + proposalHtml(r.proposal) +
      (safeUrl ? '<p class="dec-src"><a href="' + esc(safeUrl) + '" target="_blank" rel="noopener noreferrer">Źródło ↗</a></p>' : '');
    var rec = p && (p.recommendation || p.why) ? String(p.recommendation || ('Przyjmij — ' + p.why)) : 'Przyjmij, jeśli źródło to potwierdza; „Sprawdź ponownie” zleca strażnikowi drugi odczyt.';
    var acts = canDecide ? decBtn('accept', 'Przyjmij propozycję', 'adm-btn-ok', false) + decBtn('reject', 'Odrzuć', 'adm-btn-no', false) + decBtn('recheck', 'Sprawdź ponownie', '', false) +
      '<span class="dec-note"><input type="text" maxlength="500" placeholder="notatka (opcjonalnie)" aria-label="Notatka do decyzji" data-note></span>' : '';
    return decItem('watch', r.id, { kind: 'Strażnik · ' + (WKIND[r.kind] || r.kind || 'ustalenie'), when: r.created_at, title: esc(r.title || 'Ustalenie'), desc: desc, rec: rec,
      extra: canDecide ? '' : '<p class="adm-cmwarn">Zapis decyzji jeszcze niedostępny (brak funkcji admin_watch_decide).</p>', acts: acts });
  }
  function draftHtml(r) {
    var red = r.red_flags, isNew = r.published_version == null && !r.published_stops_count;
    var rec = red == null ? 'Otwórz trasę i przejrzyj uwagi kontroli.' : red > 0 ? 'Jeszcze nie publikuj: ' + plForm(red, 'czerwona flaga', 'czerwone flagi', 'czerwonych flag') + ' do rozstrzygnięcia w widoku trasy.'
      : 'Przejrzyj i zatwierdź w widoku trasy — kontrola nie znalazła blokujących uwag' + (r.warnings ? ' (' + plForm(r.warnings, 'ostrzeżenie', 'ostrzeżenia', 'ostrzeżeń') + ').' : '.');
    var desc = '<p>' + (isNew ? 'Nowa trasa' : 'Zmiana opublikowanej' + (r.published_version ? ' v' + esc(r.published_version) : '')) + (r.stops_count ? ' · ' + plForm(+r.stops_count, 'przystanek', 'przystanki', 'przystanków') : '') +
      (r.note ? ' · ' + esc(r.note) : '') + '</p>';
    return decItem('draft', r.city_slug + ':' + r.version, { kind: 'Szkic trasy', when: r.created_at, pill: red == null ? null : red ? plForm(red, 'czerwona flaga', 'czerwone flagi', 'czerwonych flag') : 'bez czerwonych flag',
      pillTone: red ? 'bad' : 'done', title: esc(r.city_name || titleCase(r.city_slug)) + ' v' + esc(r.version), desc: desc, rec: rec, recTone: red ? 'bad' : 'ok', tone: red ? 'bad' : null,
      acts: '<a class="qc-btn qc-btn--sm adm-btn-ok" href="#/' + esc(encodeURIComponent(r.city_slug)) + '">Otwórz trasę →</a>' });
  }
  function iconHtml(r) {
    var late = r.deadline && Date.parse(r.deadline) < Date.now();
    var desc = '<p>' + plForm(r.stops.length, 'przystanek czeka', 'przystanki czekają', 'przystanków czeka') + ' na wybór zdjęć (1–2 na przystanek) do ikony Quo: ' +
      esc(r.stops.slice(0, 6).map(function (s) { return s.name; }).join(', ')) + (r.stops.length > 6 ? '…' : '') + '.</p>' +
      (r.deadline ? '<p class="dec-deadline' + (late ? ' is-late' : '') + '">' + (late ? 'Termin minął ' + esc(when(r.deadline)) + ' — generator może już dobierać zdjęcia sam.' : 'Bez decyzji automat ruszy ' + esc(when(r.deadline)) + '.') + '</p>' : '');
    return decItem('icon', r.trip, { kind: 'Zdjęcia do ikon', title: esc(titleCase(r.trip)) + ' — ' + plForm(r.stops.length, 'przystanek', 'przystanki', 'przystanków') + ' bez wyboru', desc: desc,
      rec: 'Bez preferencji kliknij „Automat dla wszystkich”; konkretne ujęcia wybierzesz w widoku trasy.', tone: late ? 'bad' : null,
      acts: '<a class="qc-btn qc-btn--sm" href="#/' + esc(encodeURIComponent(r.trip)) + '">Wybierz zdjęcia →</a>' + decBtn('auto', 'Automat dla wszystkich', '', false) });
  }
  function histHtml(d) {
    var rows = [];
    (d.hist.ok || []).forEach(function (r) { rows.push({ at: r.finished_at || r.decided_at, kind: 'Wdrożenie', title: deployFiles(r).map(shortPath).join(', '), st: DST[r.status] || r.status, bad: r.status === 'failed', result: r.result }); });
    (d.costs.ok || []).filter(function (r) { return /done|failed|rejected/.test(r.status); }).forEach(function (r) { rows.push({ at: r.finished_at || r.decided_at, kind: 'Koszt', title: r.title, st: CSTS[r.status] || r.status, bad: r.status === 'failed', result: r.result }); });
    if (!rows.length) return '';
    rows.sort(function (a, b) { return (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0); });
    return '<details class="pg-steps dec-hist"><summary>Ostatnie decyzje i wyniki (' + rows.length + ')</summary><ul>' + rows.slice(0, 12).map(function (x) {
      return '<li><span class="pg-pill pg-pill--' + (x.bad ? 'bad' : 'done') + '">' + esc(x.st) + '</span> <b>' + esc(x.kind) + '</b> · ' + esc(x.title) + (x.at ? ' · ' + esc(when(x.at)) : '') +
        (x.result ? '<pre class="dec-diff dec-result">' + esc(String(x.result).slice(-1500)) + '</pre>' : '') + '</li>';
    }).join('') + '</ul></details>';
  }
  function decSection(id, title, n, body) {
    return '<section class="dec-sec" id="dec-' + id + '" aria-labelledby="dech-' + id + '"><h3 class="pg-h3" id="dech-' + id + '">' + esc(title) + ' <b class="adm-n' + (n ? '' : ' is-zero') + '">' + n + '</b></h3>' + body + '</section>';
  }
  function openDecisions() {
    state.current = null; state.trip = null; state.versions = null; state.tabVersion = null; clearInterval(state.poll);
    function draw(d) {
      if (location.hash !== '#/decyzje') return;
      var keep = {}; [].forEach.call($d.querySelectorAll('details[data-k]'), function (x) { keep[x.getAttribute('data-k')] = x.open; });
      var C = d.count, none = function (t) { return '<p class="adm-empty dec-empty">' + esc(t) + '</p>'; };
      var errBox = function (src, what) { return '<p class="adm-cmwarn">' + esc(what) + ' niedostępne: ' + esc(src.err) + (/deploy_requests|cost_requests|ai_budget|admin_watch_open|decision_drafts|schema cache|does not exist|404/i.test(src.err) ? ' — ' + DEC_SQL : '') + '</p>'; };
      var h = '<div class="adm-trip__bar"><a class="qc-btn qc-btn--sm adm-back" href="#/">← Wszystkie wycieczki</a><span class="adm-cm__meta">odświeża się co 30 s · ' +
        esc(new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })) + '</span></div><section class="pg dec">' +
        '<header class="pg-head"><div><p class="label">Skrzynka decyzji</p><h2>' + (inbox.n ? 'Czeka na Ciebie: ' + inbox.n : 'Nic nie czeka') + '</h2></div>' +
        '<dl class="pg-kpi"><div><dt>wdrożenia</dt><dd>' + C.deploy + '</dd></div><div><dt>koszty</dt><dd>' + C.cost + '</dd></div><div><dt>strażnicy</dt><dd>' + C.watch + '</dd></div>' +
        '<div><dt>szkice</dt><dd>' + C.draft + '</dd></div><div><dt>ikony</dt><dd>' + C.icon + '</dd></div></dl></header>' +
        '<p class="dec-lead">Każdy przycisk zapisuje decyzję; serwer wykonuje ją sam — wdrożenia w ciągu 2 min, zlecenia w ciągu 10 min. Wynik zobaczysz tutaj.</p>';
      // wdrożenia
      var dep = d.deploys.err ? errBox(d.deploys, 'Wdrożenia') : d.deploys.ok.length ? d.deploys.ok.map(deployHtml).join('') : none('Nic nie czeka na wdrożenie.');
      h += decSection('wdrozenia', 'Wdrożenia (SQL i serwer)', C.deploy, dep);
      // koszty + budżet
      var b = d.budget.ok && d.budget.ok[0];
      var open = d.costs.ok ? d.costs.ok.filter(function (r) { return /pending|approved|running/.test(r.status); }) : [];
      h += decSection('koszty', 'Zgody na koszty', C.cost, (b ? budgetHtml(b) : d.budget.err ? errBox(d.budget, 'Budżet') : '') +
        (d.costs.err ? errBox(d.costs, 'Prośby o zgodę') : open.length ? open.map(function (r) { return costHtml(r, b); }).join('') : none('Nic nie czeka na zgodę na koszt.')));
      // strażnicy
      var w = d.watch.ok;
      h += decSection('straznicy', 'Ustalenia strażników', C.watch, d.watch.err ? (/admin_watch_open|404|schema cache|does not exist/i.test(d.watch.err) ? none('Strażnicy jeszcze nie działają (' + DEC_SQL + ')') : errBox(d.watch, 'Ustalenia'))
        : !w || !w.ready ? none('Strażnicy jeszcze nie działają — pojawią się po wdrożeniu SQL 2026-10-30-straznicy.sql.')
        : (w.rows || []).length ? w.rows.map(function (r) { return watchHtml(r, !!w.decide); }).join('') : none('Strażnicy nie mają otwartych ustaleń.'));
      // szkice
      h += decSection('szkice', 'Szkice tras do zatwierdzenia', C.draft, d.drafts.err ? errBox(d.drafts, 'Szkice') : d.drafts.ok.length ? d.drafts.ok.map(draftHtml).join('') : none('Żaden szkic nie czeka.'));
      // ikony
      h += decSection('ikony', 'Zdjęcia do ikon', C.icon, d.icons.err ? errBox(d.icons, 'Wybór zdjęć') : d.icons.ok.length ? d.icons.ok.map(iconHtml).join('') : none('Wszystkie przystanki z kandydatami mają decyzję.'));
      h += histHtml(d);
      $d.innerHTML = h + '</section>';
      [].forEach.call($d.querySelectorAll('details[data-k]'), function (x) { if (keep[x.getAttribute('data-k')]) x.open = true; });
    }
    function reload() {
      return loadInbox().then(draw).catch(function (e) {
        $d.innerHTML = '<div class="adm-trip__bar"><a class="qc-btn qc-btn--sm adm-back" href="#/">← Wszystkie wycieczki</a></div><p class="adm-empty">Skrzynka decyzji niedostępna: ' + esc(e.message) + '</p>';
      });
    }
    function say(card, msg, bad) { var m = card.querySelector('.dec-msg'); if (m) { m.className = 'adm-msg dec-msg' + (bad ? ' adm-msg--err' : ''); m.textContent = msg; } }
    function act(card, act, btn) {
      var kind = card.getAttribute('data-kind'), id = card.getAttribute('data-id'), note = card.querySelector('[data-note]');
      var all = card.querySelectorAll('button'); [].forEach.call(all, function (x) { x.disabled = true; });
      say(card, 'Zapisuję…');
      var p;
      if (DEMO) p = demoDecide(kind, id, act);
      else if (kind === 'deploy') p = api('/rpc/admin_deploy_decide', { method: 'POST', body: { p_id: +id, p_decision: act } });
      else if (kind === 'cost') p = api('/rpc/admin_cost_decide', { method: 'POST', body: { p_id: +id, p_decision: act } });
      else if (kind === 'watch') p = api('/rpc/admin_watch_decide', { method: 'POST', body: { p_id: /^\d+$/.test(id) ? +id : id, p_decision: act, p_note: note && note.value.trim() ? note.value.trim() : null } });
      else if (kind === 'icon') {
        var it = (inbox.data.icons.ok || []).filter(function (x) { return x.trip === id; })[0];
        p = it ? it.stops.reduce(function (pr, s) { return pr.then(function () { return api('/rpc/admin_icon_refs_set', { method: 'POST', body: { p_trip: id, p_stop_key: s.key, p_files: [] } }); }); }, Promise.resolve()) : Promise.resolve();
      }
      p.then(function () {
        say(card, kind === 'deploy' && act === 'approve' ? 'Zatwierdzone — serwer wdroży w ciągu 2 min.' : kind === 'cost' && act === 'approve' ? 'Zgoda zapisana — serwer uruchomi w ciągu 10 min.' : 'Zapisane.');
        setTimeout(reload, DEMO ? 600 : 900);
      }, function (e) {
        [].forEach.call(all, function (x) { x.disabled = false; });
        say(card, 'Nie zapisano: ' + e.message + (/admin_watch_decide|404|schema cache/i.test(e.message) && kind === 'watch' ? ' (strażnicy jeszcze nie działają)' : ''), true);
      });
    }
    var armed = null, armT = null;
    function disarm() { if (armed) { armed.classList.remove('is-armed'); armed.textContent = armed.getAttribute('data-label'); armed = null; } clearTimeout(armT); }
    $d.onclick = function (e) {
      var b = e.target.closest && e.target.closest('[data-dec]');
      if (!b || b.disabled) return;
      var card = b.closest('.dec-item'); if (!card) return;
      if (b.hasAttribute('data-confirm') && armed !== b) {
        disarm(); armed = b; b.setAttribute('data-label', b.textContent); b.classList.add('is-armed'); b.textContent = 'Kliknij jeszcze raz, aby potwierdzić';
        armT = setTimeout(disarm, 6000); return;
      }
      var a = b.getAttribute('data-dec'); disarm(); act(card, a, b);
    };
    $d.onsubmit = function (e) {
      var f = e.target.closest && e.target.closest('[data-cap]'); if (!f) return;
      e.preventDefault();
      var v = f.querySelector('input').value.trim(), m = f.querySelector('.adm-msg');
      m.className = 'adm-msg'; m.textContent = 'Zapisuję…';
      (DEMO ? Promise.resolve(demoInbox().budget.budget_usd = +v.replace(',', '.') || 0) : api('/rpc/admin_setting_set', { method: 'POST', body: { p_name: 'ai_budget_month_usd', p_value: v } }))
        .then(function () { m.textContent = 'Zapisane.'; setTimeout(reload, 400); }, function (err) { m.className = 'adm-msg adm-msg--err'; m.textContent = 'Nie zapisano: ' + err.message; });
    };
    $d.onchange = null;
    $d.innerHTML = '<div class="adm-placeholder"><p>Ładuję skrzynkę decyzji…</p></div>';
    reload(); state.poll = setInterval(function () { if (location.hash === '#/decyzje' && !document.hidden && !$d.querySelector('.is-armed') && !$d.contains(document.activeElement && document.activeElement.matches('input') ? document.activeElement : null)) reload(); }, 30000);
    document.title = 'Decyzje · Quolino admin';
  }
  function demoDecide(kind, id, act) {
    var D = demoInbox();
    if (kind === 'deploy') D.deploys.forEach(function (r) { if (String(r.id) === id) r.status = act === 'approve' ? 'approved' : act === 'cancel' ? 'pending' : 'rejected'; });
    if (kind === 'cost') D.costs.forEach(function (r) { if (String(r.id) === id) { r.status = act === 'approve' ? 'approved' : 'rejected'; r.decided_at = new Date().toISOString(); } });
    if (kind === 'watch') D.watch.rows = D.watch.rows.filter(function (r) { return String(r.id) !== id || act === 'recheck'; });
    if (kind === 'icon') {
      var it = (inbox.data.icons.ok || []).filter(function (x) { return x.trip === id; })[0];
      if (it) it.stops.forEach(function (s) { state.demo.iconRefs.push({ trip: id, stop_key: s.key, mode: 'auto', files: [] }); });
    }
    return new Promise(function (res) { setTimeout(res, 250); });
  }
  // licznik w nagłówku i na stronie startowej: przy starcie, co minutę i po powrocie do karty
  setInterval(function () { if (!document.hidden && location.hash !== '#/decyzje') loadInbox().catch(function () { /* licznik pomocniczy */ }); }, 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && location.hash !== '#/decyzje') loadInbox().catch(function () { /* jw. */ }); });

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
  var tripsReady = loadTrips();
  route();
  loadRules();
  if (location.hash !== '#/decyzje') (tripsReady && tripsReady.then ? tripsReady : Promise.resolve()).then(function () { return loadInbox(); }).catch(function () { /* licznik pomocniczy */ });
})();
