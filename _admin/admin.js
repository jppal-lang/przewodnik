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
  // kids_choice (JP 2026-10-31): opcje jedna pod drugą, poprawna z „✓” — tekst z review-where (flagi kontroli wskazują ten sam fragment)
  var STOP_TR = [F_('name'), F_('desc_paragraphs'), F_('kids_box'), F_('kids_choice', function (v) { return RW.choiceText(v); }), F_('hint'), F_('local_flavor')];
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
      demoRevs(d);
      d.iconRefs = d.iconRefs || [{ trip: 'spello', stop_key: 'porta-consolare', mode: 'pick', files: ['File:Porta Consolare (Spello) 2.jpg'], updated_at: '2026-10-30T09:00:00Z' }];
      state.demo = d; return d;
    });
    return load.then(function (d) {
      if (/^\/admin_trips/.test(path)) return demoTrips(d);
      if (/^\/translation_quality/.test(path)) return [{ city_slug: 'spello', lang: 'en', score: 4 }, { city_slug: 'spello', lang: 'de', score: 5 }, { city_slug: 'spello', lang: 'cs', score: 3 },
        { city_slug: 'urbino', lang: 'en', score: 4 }, { city_slug: 'urbino', lang: 'fr', score: 4 }, { city_slug: 'urbino', lang: 'it', score: 5 }, { city_slug: 'urbino', lang: 'de', score: 4 }];
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
      if (/^\/draft_revision_requests/.test(path)) return demoRevs(d);
      if (/^\/draft_comments\?select=\*/.test(path)) return d.comments.slice().reverse();
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
      tv3(58).kids_choice = { options: ['Złote monety', 'Kolorowe mozaiki', 'Rzymski miecz', 'Marmurowy posąg'], correct: 1 };   // pytanie z wyborem (demo)
      v3.review.warnings.push({ stop_key: 'parking-villa-dei-mosaici', path: 'content.stops.parking-villa-dei-mosaici.kids_choice', quote: 'Rzymski miecz',
        problem: '[nie blokuje] Odpowiedzi do wyboru: „Rzymski miecz” — sprawdź, czy w willi nie znaleziono też broni (dystraktor ma być jednoznacznie błędny).' });
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
  // prośby o poprawkę (draft_revision_requests) — w tym opcjonalne kolumny verify_* (sprawdzenie naniesienia uwag)
  function demoRevs(d) {
    if (d.revs) return d.revs;
    var now = Date.now(), iso = function (m) { return new Date(now - m * 60000).toISOString(); };
    d.comments.forEach(function (c) {
      if (c.city_slug === 'spello' && c.city_version === 2) { c.request_id = 3; c.verify_status = c.id === 3 ? 'partial' : 'applied'; c.verified_in_version = 3;
        c.verify_note = c.id === 3 ? 'Wstęp ma trzy zdania zamiast dwóch.' : 'Godzina 17:45 jest w polu.'; }
    });
    d.revs = [
      { id: 7, city_slug: 'wieliczka', city_version: 1, comment_ids: [21, 22, 23], status: 'new', result_version: null, hermes_reply: 'Czeka na odnowienie limitu Antigravity — ruszy samo.', attempts: 0, created_at: iso(40), updated_at: iso(12) },
      { id: 6, city_slug: 'ancona', city_version: 1, comment_ids: [17, 18, 19, 20], status: 'working', result_version: null, hermes_reply: null, attempts: 1, created_at: iso(30), updated_at: iso(4) },
      { id: 5, city_slug: 'urbino', city_version: 1, comment_ids: [12, 13, 14, 15, 16], status: 'done', result_version: 2, hermes_reply: 'Poprawione opisy i misje; dwie uwagi bez źródła — zostawione.', attempts: 1,
        created_at: iso(600), updated_at: iso(520), verify: { applied: 3, partial: 1, missing: 1, stale: 0, total: 5, new_errors: 0, ready: false, pending_ai: false, version: 2 } },
      { id: 3, city_slug: 'spello', city_version: 2, comment_ids: [2, 3], status: 'done', result_version: 3, hermes_reply: 'Przesunięte na 17:45, wstęp skrócony do dwóch zdań.', attempts: 1,
        created_at: '2026-10-16T09:10:00Z', updated_at: '2026-10-18T07:40:00Z', verify: { applied: 2, partial: 0, missing: 0, stale: 0, total: 2, new_errors: 0, ready: true, pending_ai: false, version: 3 } }
    ];
    return d.revs;
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
        langs: langsOf(l.content.stop_translations).length ? langsOf(l.content.stop_translations) : langsOf(l.content.city_translations),
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
      versions: r.versions_count || 1, langs: Array.isArray(r.langs) ? r.langs : null, std: r.guidelines || (r.workflow === 'v2' ? 'v02' : 'old'), glOk: r.guidelines_ok === true, working: r.comments_working || 0, unsent: (r.comments_unsent || 0) + (box[r.city_slug] || 0) };
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
  // Gotowe języki (JP 2026-10-31: „nie widać, ile języków jest gotowych”): wynik kontroli jakości tłumaczeń (admin.translation_quality:
  // miasto, język, ocena 0–5) — język liczy się jako gotowy od 4/5, słabszy jako „do poprawy”; polski zawsze. Liczba języków
  // docelowych z publicznej tabeli languages (enabled). Bez tych danych lista pokazuje tylko to, co jest.
  function loadLangs() {
    var q = api('/translation_quality?select=city_slug,lang,score').catch(function () { return []; });
    var pub = function (u) { return fetch('https://api.quolino.com/' + u, { headers: { Accept: 'application/json' } }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }); };
    var all = pub('languages?select=code&enabled=eq.true');
    var live = DEMO ? Promise.resolve([]) : pub('public_stops?select=city_slug,lang');   // języki faktycznie opublikowane na stronie (bez oceny → liczone jako gotowe)
    return Promise.all([q, all, live]).then(function (r) {
      var by = {};
      (Array.isArray(r[2]) ? r[2] : []).forEach(function (x) {
        if (!x || !x.city_slug || !x.lang || x.lang === 'pl') return;
        var o = by[x.city_slug] = by[x.city_slug] || { ok: [], weak: [] };
        if (o.ok.indexOf(x.lang) < 0) o.ok.push(x.lang);
      });
      (Array.isArray(r[0]) ? r[0] : []).forEach(function (x) {
        if (!x || !x.city_slug || !x.lang || x.lang === 'pl') return;
        var o = by[x.city_slug] = by[x.city_slug] || { ok: [], weak: [] };
        var sc = +x.score;
        if (sc >= 4) { if (o.ok.indexOf(x.lang) < 0) o.ok.push(x.lang); } else if (o.weak.indexOf(x.lang) < 0) o.weak.push(x.lang);
      });
      Object.keys(by).forEach(function (k) { by[k].weak = by[k].weak.filter(function (l) { return by[k].ok.indexOf(l) < 0; }); by[k].ok.sort(); by[k].weak.sort(); });
      var codes = (Array.isArray(r[1]) ? r[1] : []).map(function (x) { return x && x.code; }).filter(function (c) { return c && c !== 'pl'; });
      state.langsBy = by; state.langsTotal = codes.length || null;
      return by;
    });
  }
  function langsInfo(t) {
    var l = state.langsBy && state.langsBy[t.slug];
    var ok = l ? l.ok : (Array.isArray(t.langs) ? t.langs.filter(function (x) { return x !== 'pl'; }) : []);
    var tot = state.langsTotal, weak = l ? l.weak : [];
    if (!l && !ok.length) return tot && t.status === 'published' ? { ok: [], weak: [], total: tot, text: 'tylko PL', full: false, title: 'Brak tłumaczeń · docelowo ' + tot + ' języków poza PL' } : null;
    return { ok: ok, weak: weak, total: tot, text: ok.length + (tot ? '/' + tot : '') + ' jęz.', full: tot && ok.length >= tot,
      title: 'Gotowe: PL' + (ok.length ? ', ' + ok.join(', ').toUpperCase() : '') + (weak.length ? ' · do poprawy: ' + weak.join(', ').toUpperCase() : '') + (tot ? ' · docelowo ' + tot + ' języków poza PL' : '') };
  }
  function loadTrips() {
    return state.tripsP = Promise.all([api('/admin_trips?order=city_slug.asc').then(function (rows) { state.tripsApi = true; return rows; },
      function (e) { if (e.session) throw e; state.tripsApi = false; return tripsFallback(); }), loadLangs()])
      .then(function (both) {
        var rows = both[0], box = outboxBy();
        state.trips = (rows || []).map(function (r) { var t = tripOf(r, box); var li = langsInfo(t); if (li) t.langs = ['pl'].concat(li.ok); return t; });
        var f = filters(), have = {};
        state.trips.forEach(function (t) { have['c:' + t.country] = 1; have['s:' + t.status] = 1; });
        f.countries = f.countries.filter(function (c) { return have['c:' + c]; });     // kraj, którego już nie ma, nie chowa wszystkiego
        if (f.statuses.length && !f.statuses.some(function (s) { return have['s:' + s]; })) f.statuses = [];
        var nd = state.trips.filter(function (t) { return t.status === 'draft'; }).length;
        $count.textContent = nd; $count.classList.toggle('is-zero', !nd);
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
      (function () { var li = langsInfo(t); return li ? '<span class="adm-langs' + (li.full ? ' is-full' : li.weak.length ? ' is-weak' : '') + '" title="' + esc(li.title) + '">' + esc(li.text) + (li.weak.length ? ' · ' + li.weak.length + ' do poprawy' : '') + '</span>' : ''; })() +
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

  // ── nawigacja (v43, JP 2026-10-31: panel = centrum dowodzenia) ──
  // #/ pulpit · #/trasy lista · #/<miasto> najnowsza wersja · #/<miasto>/v<N> starsza · #/decyzje · #/straznicy · #/ikony
  // #/postep · #/koszty · #/zgloszenia · #/baza-wiedzy. Boczny pasek (desktop) i dolny pasek (telefon) — index.html.
  var SECTIONS = { pulpit: 'Pulpit', trasy: 'Trasy', decyzje: 'Decyzje', straznicy: 'Strażnicy', ikony: 'Ikony', postep: 'Postęp prac',
    koszty: 'Koszty AI', zgloszenia: 'Zgłoszenia', 'baza-wiedzy': 'Baza wiedzy redakcji' };
  var $title = document.getElementById('secTitle'), $crumbs = document.getElementById('crumbs');
  // nagłówek: nazwa sekcji + okruszki (trasa: Trasy › kraj › miasto); aktywny link w obu paskach
  function setHead(key, title, crumbs) {
    if ($title) $title.textContent = title || SECTIONS[key] || '';
    if ($crumbs) {
      $crumbs.hidden = !(crumbs && crumbs.length);
      $crumbs.innerHTML = crumbs && crumbs.length ? '<ol>' + crumbs.map(function (c, i) {
        return '<li>' + (c[1] ? '<a href="' + esc(c[1]) + '">' + esc(c[0]) + '</a>' : '<span>' + esc(c[0]) + '</span>') + (i < crumbs.length - 1 ? '<span class="ad-crumbs__sep" aria-hidden="true">›</span>' : '') + '</li>';
      }).join('') + '</ol>' : '';
    }
    [].forEach.call(document.querySelectorAll('[data-nav]'), function (a) {
      if (a.getAttribute('data-nav') === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  function showList() {
    clearInterval(state.poll);
    state.current = null; state.trip = null; state.versions = null;
    $d.hidden = true; $d.innerHTML = '';
    setHead('trasy');
    if ($browse.hidden) { $browse.hidden = false; window.scrollTo(0, listScroll); if (state.trips) loadTrips(); }   // liczniki uwag mogły się zmienić
    document.title = 'Trasy · Quolino admin';
  }
  function showDetail() {
    if (!$browse.hidden) listScroll = window.scrollY || 0;
    $browse.hidden = true; $d.hidden = false;
  }
  function route() {
    var h = location.hash;
    moreClose();
    emit('adm:route', { hash: h });
    document.body.classList.toggle('is-prog', /^#\/(postep|koszty|zgloszenia|decyzje|straznicy|ikony|pipeline|mapa)$/.test(h));
    document.body.classList.toggle('is-dash', !h || h === '#' || h === '#/' || h === '#/pulpit');
    document.body.classList.remove('is-trip');
    if (!h || h === '#' || h === '#/' || h === '#/pulpit') { setHead('pulpit'); showDetail(); window.scrollTo(0, 0); openDashboard(); return; }
    if (h === '#/trasy') { showList(); return; }
    if (h === '#/decyzje' || h === '#/straznicy' || h === '#/ikony') { var only = h.slice(2); setHead(only); showDetail(); window.scrollTo(0, 0); openDecisions(only === 'decyzje' ? null : only); return; }
    if (h === '#/baza-wiedzy') { setHead('baza-wiedzy'); showDetail(); window.scrollTo(0, 0); openRules(); return; }
    if (h === '#/postep') { setHead('postep'); showDetail(); window.scrollTo(0, 0); openProgress(); return; }
    if (h === '#/koszty') { setHead('koszty'); showDetail(); window.scrollTo(0, 0); openCosts(); return; }
    if (h === '#/zgloszenia') { setHead('zgloszenia'); showDetail(); window.scrollTo(0, 0); openFeedback(); return; }
    var ext = window.AdminExt && window.AdminExt.routes && window.AdminExt.routes[h];   // #/pipeline (admin-pipeline.js), #/mapa (admin-map.js)
    if (ext) { ext(); return; }
    var m = /^#\/([^/]+)(?:\/v(\d+))?$/.exec(h);
    if (m) { var known = (state.trips || []).filter(function (t) { return t.slug === decodeURIComponent(m[1]); })[0];
      document.body.classList.add('is-trip');
      tripHead(known ? known.name : titleCase(decodeURIComponent(m[1])), known ? known.country : '', known ? known.region : '');
      openTrip(decodeURIComponent(m[1]), m[2] ? +m[2] : null); return; }
    showList();
  }
  function tripHead(name, country, region) {
    setHead('trasy', name, [['Trasy', '#/trasy']].concat(country ? [[countryName(country), null]] : []).concat(region ? [[regionName(region), null]] : []));
  }
  // telefon: menu „Więcej” nad dolnym paskiem
  var $more = document.getElementById('moreMenu'), $moreBtn = document.getElementById('moreBtn');
  function moreClose(focus) { if (!$more || $more.hidden) return; $more.hidden = true; $moreBtn.setAttribute('aria-expanded', 'false'); if (focus) $moreBtn.focus(); }
  if ($moreBtn) $moreBtn.addEventListener('click', function () {
    if (!$more.hidden) { moreClose(); return; }
    $more.hidden = false; $moreBtn.setAttribute('aria-expanded', 'true');
    var a = $more.querySelector('a'); if (a) a.focus();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $more && !$more.hidden) moreClose(true); });
  document.addEventListener('click', function (e) { if ($more && !$more.hidden && !e.target.closest('#moreMenu, #moreBtn')) moreClose(); });
  if ($more) $more.addEventListener('click', function (e) { if (e.target.closest('a')) moreClose(); });
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
      loadIconRefs(slug),
      loadRevs(slug)
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
      tripHead(name, state.trip.country, state.trip.region);
      $d.innerHTML = '<div class="adm-trip"><div id="tabPanel" tabindex="-1"></div></div>';
      showTab(ver);
      flushOutbox();
      state.poll = setInterval(refreshComments, 30000);   // także w tle: zapytanie co 30 s podtrzymuje sesję panelu (30 min bez ruchu = wylogowanie)
    }).catch(function (e) {
      $d.innerHTML = '<div class="adm-placeholder adm-placeholder--err" role="alert"><p>Nie udało się wczytać wycieczki: ' + esc(e.message) + '</p>' +
        '<p class="adm-done__acts"><a class="qc-btn qc-btn--sm" href="#/trasy">← Trasy</a></p></div>';
      state.versions = null;
    });
  }
  function verComments(v) { return state.comments.filter(function (c) { return +c.city_version === +v; }); }
  function isSent(c) { return c.status !== 'new' && c.status !== 'local'; }
  // wersje (v44): jedno menu „vN · data · status” zamiast zakładek; obok „Porównaj z”
  function tabsHtml() {
    return state.versions.slice().reverse().map(function (r) {
      var sent = verComments(r.version).filter(isSent).length, newest = r.version === state.trip.newest;
      return '<option value="' + r.version + '"' + (r.version === state.tabVersion ? ' selected' : '') + '>' + esc(vlab(r) + ' · ' + dayMonth(r.created_at) + ' · ' + (VST[r.status] || r.status) +
        (newest ? ' ★' : '') + (sent ? ' · ' + plForm(sent, 'uwaga', 'uwagi', 'uwag') : '')) + '</option>';
    }).join('');
  }
  function refreshTabs() {
    var t = document.getElementById('vTabs');
    if (!t || !state.versions || t === document.activeElement) return;
    t.innerHTML = tabsHtml();
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
    // porównanie (v44): nakładka na te same karty — baza z „Porównaj z”, pola z różnicą słów
    state.cmpM = null;
    if (state.cmpSel && !cmpOptions(it).some(function (o) { return o[0] === state.cmpSel; })) state.cmpSel = '';
    var cb = state.cmpSel ? cmpBaseRow(it, state.cmpSel) : null;
    if (cb) {
      var M = state.cmpM = cmpModel(row, cb); M.base = cb; M.by = {};
      M.groups.forEach(function (g) { var rows = {}; g.rows.forEach(function (r) { rows[r.field] = r; }); M.by[g.key] = { g: g, rows: rows }; });
      base = cb; it.published_version = cb.version; it.baseIsLive = false;
    }
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

  var VERST = { applied: ['ok', 'naniesiona'], partial: ['warn', 'częściowo'], missing: ['bad', 'nie naniesiona'], stale: ['wait', 'nieaktualna'] };
  function commentItem(c) {
    var other = state.tabVersion != null && +c.city_version !== +state.tabVersion;
    return '<li class="adm-cm__it adm-cm__it--' + esc(c.status) + '"><p>' + esc(c.body) + '</p>' +
      '<span class="adm-cm__meta"><span class="adm-cm__st">' + esc(CST[c.status] || c.status) + '</span>' +
      (other ? '<span>do v' + esc(c.city_version) + '</span>' : '') + '<span>' + esc(when(c.created_at)) + '</span></span>' +
      (c.hermes_reply ? '<p class="adm-cm__reply"><b>Hermes:</b> ' + esc(c.hermes_reply) + (c.resolved_in_version ? ' <span class="adm-cm__meta">→ v' + esc(c.resolved_in_version) + '</span>' : '') + '</p>' : '') +
      (VERST[c.verify_status] ? '<p class="adm-cm__ver">' + stChip(VERST[c.verify_status][0], 'sprawdzenie: ' + VERST[c.verify_status][1] + (c.verified_in_version ? ' w v' + c.verified_in_version : '')) +
        (c.verify_note ? ' <span>' + esc(c.verify_note) + '</span>' : '') + '</p>' : '') + '</li>';
  }
  function commentBox(stop, field, label, stopVer) {
    var list = commentsFor(stop, field);
    return '<div class="adm-cm" data-stop="' + esc(stop || '') + '" data-field="' + esc(field || '') + '" data-label="' + esc(label) + '"' + (stopVer ? ' data-sv="' + stopVer + '"' : '') + '>' +
      '<ul class="adm-cm__list">' + list.map(commentItem).join('') + '</ul>' +
      (state.readOnly ? '' : '<form class="adm-cm__form" autocomplete="off"><textarea rows="1" aria-label="Uwaga do pola ' + esc(label) + '" placeholder="＋ Uwaga do pola"></textarea>' +
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
  // grupy uwag z kontroli (przyciski „dla całej grupy”) — w trybie „Przejdź przez flagi”
  function questionsHtml(it) {
    var q = state.qa; if (!q || !q.list.length || state.readOnly) return '';
    return q.order.map(function (g) {
      var list = q.groups[g].filter(function (x) { return !x.auto; }), fixable = list.some(function (x) { return qaHasNew(x.e); });
      if (!list.length) return '';
      return '<div class="adm-q__grp" data-g="' + esc(g) + '"><p class="adm-q__gh">' + esc(RW.humanize(g)) + ' · ' + list.length + ' ' + qaPlural(list.length) + ' <small class="adm-q__gsum"></small></p>' +
        '<div class="adm-q__bulk">' + (fixable ? '<button type="button" class="qc-btn qc-btn--sm" data-qa-all="fix">Popraw wszystkie wg propozycji</button>' : '') +
        '<button type="button" class="qc-btn qc-btn--sm qc-btn--ghost" data-qa-all="keep">Zostaw wszystkie</button>' +
        '<span class="adm-q__prog" role="status" aria-live="polite"></span></div></div>';
    }).join('');
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
    state.qaLeft = { b: leftB, w: leftW, done: done, all: all };
    if (state.popLi) popPlace(state.popLi);
    walkPaint(); readyRefresh();
  }
  // ── notatka przy fladze: popover w wierszu pola (nie modal); Esc / klik obok zamyka ──
  function flagAnchor(id) { return $d.querySelector('button.adm-flag[data-flag="' + id + '"]'); }
  function popPlace(li) {
    var row = li.closest('.adm-row'), fl = flagAnchor(li.getAttribute('data-qid')); if (!row || !fl) return;
    // notatka stoi POD całym polem, w zwykłym przepływie (rozsuwa treść zamiast ją zasłaniać — JP 2026-10-31: „popup czasem zasłania opis”)
    var rr = row.getBoundingClientRect(), w = Math.min(600, rr.width);
    li.style.width = w + 'px'; li.style.left = ''; li.style.top = ''; li.style.removeProperty('--tip');
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
    // przewijanie: najpierw ma być widoczne POLE (treść nad notatką), dopiero potem jak najwięcej notatki — nigdy nie chowamy pola nad krawędzią
    var r = li.getBoundingClientRect(), rt = (row || li).getBoundingClientRect();
    var st = stickyTop();
    if (rt.top < st + 12) window.scrollBy({ top: rt.top - st - 16 });
    else if (r.bottom > window.innerHeight - 24) window.scrollBy({ top: Math.max(0, Math.min(r.bottom - window.innerHeight + 24, rt.top - st - 16)) });
    var first = li.querySelector('.adm-qo.is-rec') || li.querySelector('.adm-qo') || li.querySelector('[data-pop-close]');
    if (first) first.focus({ preventScroll: true });
  }
  // wysokość przyklejonego nagłówka + paska akcji (pasek przykleja się tylko na szerokim ekranie)
  function stickyTop() {
    var t = document.querySelector('.ad-top'), a = document.getElementById('actBar'), h = t ? t.getBoundingClientRect().height : 0;
    if (a && getComputedStyle(a).position === 'sticky') h += a.getBoundingClientRect().height;
    return h;
  }
  function fitActbar() {
    var a = document.getElementById('actBar');
    document.body.style.setProperty('--ad-act-h', a && getComputedStyle(a).position === 'sticky' ? Math.ceil(a.getBoundingClientRect().height) + 'px' : '0px');
  }
  window.addEventListener('resize', fitActbar);
  function flagNext() {
    var flags = [].slice.call($d.querySelectorAll('button.adm-flag:not(.adm-flag--auto):not(.is-done)'));
    if (!flags.length) return;
    var cur = state.popLi ? flagAnchor(state.popLi.getAttribute('data-qid')) : null, i = cur ? flags.indexOf(cur) : -1, nx = null;
    if (cur && i < 0) nx = flags.filter(function (f) { return cur.compareDocumentPosition(f) & 4; })[0];
    else if (cur) nx = flags[i + 1];
    else nx = flags.filter(function (f) { return f.getBoundingClientRect().top > stickyTop() + 10; })[0];
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
    if (e.target.closest('[data-flag-next]')) { if (walk.on) walkStep(1); else flagNext(); return; }
    if (e.target.closest('[data-pop-close]')) { if (walk.on) walkClose(); else popClose(true); return; }
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
    var cn = document.getElementById('cmN'); if (cn) { cn.textContent = n; cn.classList.toggle('is-zero', !n); }
    readyRefresh();
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
    loadRevs(state.current.city_slug).then(revBoxPaint);
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
  $d.addEventListener('input', function (e) { if (e.target.matches('.adm-cm__form textarea')) { autosize(e.target); e.target.parentNode.classList.toggle('has-text', !!e.target.value); } });

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
    var M = state.cmpM, dr = null;
    if (M && fl && fl.field) { var gb = M.by[fl.box]; dr = gb ? gb.rows[String(fl.field).replace(/^(stop|city)\./, '')] || null : null; }
    var diff = !!M && (dr ? dr.changed : changed);
    var hl = fl && fl.html ? { html: fl.html, rest: qs } : qs.length && !(diff && dr) ? qaHighlight(show(newV, fmt), qs) : { html: esc(show(newV, fmt)), rest: diff && dr ? qs : [] };
    if (!(fl && fl.html)) hl.html = hl.html.replace(/\[(\d{1,2})\]/g, '<sup class="adm-fn">[$1]</sup>');   // przypisy [n] małe, jak w druku (JP 2026-10-31)
    var val = diff && dr ? '<span class="adm-val adm-diff">' + diffHtml2(wordDiff(dr.a, dr.b)) + '</span>' + cmpWhyHtml(dr.why)
      : diff ? '<span class="adm-old">' + esc(show(oldV, fmt)) + '</span><span class="adm-new">' + hl.html + '</span>'
      : '<span class="adm-val">' + hl.html + '</span>';
    return '<div class="adm-row' + (diff ? ' is-chg' : changed ? ' is-mod' : '') + (qs.length ? ' has-flags' : '') + '"><small class="adm-row__k">' + esc(label) +
      (changed && !M ? '<span class="adm-dot" title="zmienione względem v' + esc(state.tvBaseV) + '"></span><span class="adm-sr">(zmienione)</span>' : '') +
      (hl.rest.length ? '<span class="adm-row__flags">' + hl.rest.map(flagBtn).join('') + '</span>' : '') + '</small>' +
      '<div class="adm-row__v">' + val + '</div>' + cm +
      (qs.length ? '<ol class="adm-pops">' + qs.map(qaItemHtml).join('') + '</ol>' : '') + '</div>';
  }

  function render(it, draft, pub, all) {
    walkClose(true); drawerClose(true);
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
    var route = routeUrl(c, newStops, draft.stop_translations, title), T = state.trip;
    state.tvDraft = draft; state.tvStops = stops; state.tvIt = it; state.tvBaseV = it.published_version;
    var nFlags = state.qa ? state.qa.list.filter(function (x) { return !x.auto; }).length : 0;
    var stx = it.status === 'draft' ? (it.isNewest ? ['warn', 'szkic · do akceptacji'] : ['wait', 'szkic (starszy)']) : it.status === 'published' ? ['ok', 'opublikowana'] : it.status === 'rejected' ? ['bad', 'odrzucona'] : ['wait', VST[it.status] || it.status];

    // ─ nagłówek trasy: jeden — nazwa, status, wersja + porównanie, decyzja ─
    var more = '<details class="tv-more"><summary class="ad-btn ad-btn--ghost tv-more__s"><span aria-hidden="true">⋯</span><span class="adm-sr">Więcej akcji</span></summary><div class="tv-more__p">' +
      (route ? '<a class="tv-more__a" href="' + esc(route) + '" target="_blank" rel="noopener">' + PIN + ' Cała trasa w Google Maps ↗</a>' : '') +
      (T.published != null ? '<a class="tv-more__a" href="' + SITE + '/city.html?c=' + encodeURIComponent(T.slug) + '" target="_blank" rel="noopener">Otwórz na stronie (v' + esc(T.published) + ') ↗</a>' : '') +
      (state.token ? '<p class="tv-more__l">Podgląd ' + esc(it.label || 'v' + it.version) + ' na stronie</p>' + previewLinks(state.token, it.version) : '') +
      (state.readOnly ? '' : '<label class="tv-more__l" for="note">Notatka do wersji (opcjonalnie)</label><textarea id="note" name="note" rows="2" placeholder="trafi do historii wersji"></textarea>' +
        '<button type="button" class="qc-btn qc-btn--sm adm-btn-no" data-act="reject">Odrzuć szkic</button>') +
      '<p class="tv-more__src">Źródło: ' + esc(SRC[it.source] || it.source || '—') + ' · ' + esc(when(it.created_at)) + '</p></div></details>';
    var html = '<div class="tv' + (state.cmpOnly && state.cmpM ? ' is-only' : '') + '" style="--team:' + esc(team) + '">' +
      '<header class="tv-head" id="actBar"><div class="tv-head__id"><h2 class="tv-name">' + esc(title) + '</h2>' +
      '<p class="tv-where">' + esc([countryName(T.country), T.region ? regionName(T.region) : ''].filter(Boolean).join(' · ')) + ' ' + stChip(stx[0], stx[1]) + '</p></div>' +
      '<div class="tv-ver"><span class="tv-ver__f"><label for="vTabs">Wersja</label><select id="vTabs" class="adm-cmp__sel">' + tabsHtml() + '</select></span>' +
      '<span class="tv-ver__f">' + cmpBarHtml(it) + '</span></div>' +
      '<div class="tv-dec">' + (state.readOnly ? '' : '<button type="button" class="qc-btn adm-btn-ok tv-approve" data-act="approve"' +
        (newStops.length ? '' : ' disabled data-lock title="Szkic bez przystanków nie może trafić na stronę"') + '>Zatwierdź i opublikuj</button>') + more +
      '<span class="adm-msg tv-msg" id="msg" role="status"></span></div></header>';
    if (state.readOnly) {
      html += '<p class="adm-ro">' + (it.isNewest
        ? 'Ta wycieczka nie ma szkicu w toku (najnowsza wersja: ' + esc(VST[it.status] || it.status) + ') — tylko podgląd. Uwagi wysyła się do szkicu.'
        : 'Wersja ' + esc(it.label || 'v' + it.version) + ' (' + esc(VST[it.status] || it.status) + ') — tylko podgląd. Uwagi wysyłasz w najnowszej wersji. ' +
          '<button type="button" class="adm-linkbtn" data-goto="' + esc(T.newest) + '">Przejdź do v' + esc(T.newest) + '</button>') + '</p>';
    }
    state.cmpIt = it;
    if (state.cmpM) html += cmpSumHtml(it);
    html += '<section class="tv-ready" id="tvReady" aria-labelledby="tvReadyH"></section>';

    // ─ spis przystanków (lewa kolumna) ─
    var KIND = { first: ['same', 'pierwsza wersja'], same: ['same', 'bez zmian'], 'new': ['new', 'nowy'], chg: ['chg', 'zmieniony'], del: ['del', 'usunięty'] };
    var tocLi = function (key, no, name, cat, kind) {
      var k = KIND[kind] || KIND.same;
      return '<li class="tv-toc__it is-' + k[0] + '"><a href="#st-' + esc(key) + '" data-to="' + esc(key) + '"><span class="tv-toc__no">' + no + '</span>' +
        (cat ? '<img class="tv-toc__ic" src="' + icon(cat) + '" alt="" width="32" height="32" loading="lazy">' : '<span class="tv-toc__ic tv-toc__ic--star" aria-hidden="true">' + (key === '_sum' ? PIN : '★') + '</span>') +
        '<span class="tv-toc__t"><span class="adm-toc__nm">' + esc(name) + '</span><span class="tv-toc__k"><i class="tv-dot tv-dot--' + k[0] + '" aria-hidden="true"></i>' + esc(k[1]) + '</span></span>' +
        '<span class="tv-toc__c"><b class="adm-qdot" data-qleft="' + esc(key) + '" hidden></b><b class="adm-n is-zero" data-count="' + esc(key) + '">0</b></span></a></li>';
    };
    var toc = '<nav class="tv-toc" aria-label="Przystanki"><details class="tv-toc__d" id="tocD" open><summary class="tv-toc__s">Przystanki <b>' + stops.filter(function (x) { return x.kind !== 'del'; }).length + '</b>' +
      '<span class="tv-toc__all">uwagi <b class="adm-n is-zero" data-count="_all">0</b></span>' + CHEV + '</summary><ol>' +
      tocLi('_sum', '', 'Trasa w skrócie i mapa', null, 'same').replace(/<span class="tv-toc__c">[\s\S]*?<\/span><\/a>/, '</a>').replace(/<span class="tv-toc__k">[\s\S]*?<\/span><\/span>/, '</span>') +
      tocLi('_city', '', 'Opis miasta', null, 'same') +
      stops.map(function (x) { return tocLi(x.key, num(x.s.stop_number), x.t.name || '(bez nazwy)', x.s.category, x.kind); }).join('') + '</ol></details></nav>';

    // ─ główna kolumna ─
    var tools = '<div class="tv-tools"><span class="tv-tools__l" aria-hidden="true">Widok</span><div class="tv-seg" role="group" aria-label="Widok treści">' +
      [['fields', 'Pola', 'Pola do redakcji'], ['parent', 'Rodzic', 'Jak widzi rodzic'], ['kid', 'Dziecko', 'Jak widzi dziecko']].map(function (v) {
        return '<button type="button" data-view="' + v[0] + '" aria-pressed="' + ((state.tvView || 'fields') === v[0]) + '" title="' + v[2] + '"><span class="adm-sr">' + (v[0] === 'fields' ? '' : 'Jak widzi ') + '</span>' + v[1] + '</button>';
      }).join('') + '</div><span class="tv-tools__r">' +
      (nFlags ? '<button type="button" class="qc-btn qc-btn--sm tv-walkbtn" data-walk aria-controls="walk" aria-expanded="false">' + FLAG + ' Przejdź przez flagi <b class="adm-n" data-qleft-all>0</b></button>' : '') +
      '<button type="button" class="qc-btn qc-btn--sm" data-drawer aria-controls="cmDrawer" aria-expanded="false">Twoje uwagi <b class="adm-n is-zero" id="cmN">0</b></button></span></div>';
    var sum = '<section class="tv-card adm-anchor" id="st-_sum" data-spy="_sum"><h3 class="tv-card__h">Trasa w skrócie</h3><div class="adm-sum">' +
      stat('Przystanki', newStops.length, pub ? oldStops.length : null) +
      stat('Czas', durLabel(c.duration_type), pc ? durLabel(pc.duration_type) : null) +
      (pub ? stat('Nowe', cnt.new) + stat('Zmienione', cnt.chg) + stat('Usunięte', cnt.del) : '') +
      stat('Języki', sLangsNew.length || cLangsNew.length, pub ? (sLangsOld.length || cLangsOld.length) : null) +
      '</div>' + warn.map(function (w) { return '<p class="adm-warn' + (w[0] ? ' adm-warn--' + w[0] : '') + '">' + esc(w[1]) + '</p>'; }).join('') +
      langChips(sLangsOld.length ? sLangsOld : cLangsOld, sLangsNew.length ? sLangsNew : cLangsNew) + '<div id="admMap" class="tv-map"></div></section>';
    var city = '<section class="adm-stopx tv-city adm-anchor" data-kind="same" id="st-_city" data-spy="_city"><header class="adm-stopx__head"><span class="adm-stop__no">★</span><span class="adm-stop__name">Opis miasta<small>' + esc(title) + '</small></span></header>' +
      '<div class="adm-rows">' +
      CITY_TR.map(function (f) { return cell(f[1], pctr ? pctr[f[0]] : null, ctr[f[0]], f[2], !!pub, commentBox(null, 'city.' + f[0], f[1]), { box: '_city', field: 'city.' + f[0] }); }).join('') +
      CITY_FIELDS.map(function (f) { return cell(f[1], pc ? pc[f[0]] : null, c[f[0]], f[2], !!pub, commentBox(null, 'city.' + f[0], f[1]), { box: '_city', field: 'city.' + f[0] }); }).join('') +
      qaExtraRows('_city', shownSet('city.', CITY_TR.concat(CITY_FIELDS)), null) +
      cell('Cała wycieczka', null, 'Uwaga ogólna do całego szkicu', null, false, commentBox(null, null, 'Cała wycieczka'), { box: '_city', field: null }).replace('class="adm-row', 'class="adm-row adm-row--all') +
      '</div></section>';
    html += '<div class="tv-body">' + toc + '<div class="tv-main">' + tools +
      '<p class="adm-cmwarn" id="cmWarn" hidden>Baza nie przyjmuje jeszcze uwag (brak tabeli <code>admin.draft_comments</code>). Uwagi zapisują się w tej przeglądarce i wyślą się same, gdy Hermes ją doda.</p>' +
      '<div id="tvFields" class="tv-fields">' + sum + city +
      (stops.length ? stops.map(function (x) { return stopHtml(x, it, pub); }).join('') : '<p class="adm-empty">Brak przystanków.</p>') + '</div>' +
      '<div id="tvPreview" class="tv-prev" hidden></div></div></div>';

    // ─ szuflada „Twoje uwagi” ─
    html += '<aside class="tv-drawer" id="cmDrawer" hidden aria-labelledby="cmDH"><header class="tv-drawer__h"><h2 id="cmDH">Twoje uwagi</h2>' +
      '<button type="button" class="adm-pop__x" data-drawer-close aria-label="Zamknij uwagi">×</button></header><div class="tv-drawer__b">' +
      (state.readOnly ? '' : '<section class="tv-dsec adm-send" id="send"><h3>Do wysłania</h3><p class="adm-send__sub">Uwagi zapisane przy polach. Hermes poprawia je dopiero po wysłaniu — wszystkie naraz, w jednej nowej wersji szkicu.</p>' +
        '<div id="sendList">' + sendList() + '</div><div class="adm-send__row"><button type="button" class="qc-btn adm-btn-send" data-send>Wyślij uwagi do poprawki</button></div>' +
        '<p class="adm-msg" id="sendMsg" role="status"></p><p class="adm-send__hint" id="sendHint"></p></section>') +
      '<section class="tv-dsec" id="revBox"></section><section class="tv-dsec adm-vc" id="verComments"></section></div></aside>';

    // ─ tryb „Przejdź przez flagi” ─
    var grp = questionsHtml(it);
    html += '<aside class="tv-walk" id="walk" hidden aria-labelledby="walkH"><header class="tv-drawer__h"><h2 id="walkH">Flagi z kontroli</h2><span class="tv-walk__pos" id="walkPos" aria-live="polite"></span>' +
      '<button type="button" class="adm-pop__x" data-walk-close aria-label="Zamknij przechodzenie przez flagi">×</button></header>' +
      '<div class="tv-walk__bar" aria-hidden="true"><span id="walkBar"></span></div><div class="tv-drawer__b">' +
      '<div class="tv-walk__intro adm-flagbar">' + (state.readOnly ? '' : '<button type="button" class="qc-btn qc-btn--sm adm-flagbar__rec" data-qa-recall aria-haspopup="dialog">Przyjmij wszystkie rekomendacje</button>') +
      '<span class="adm-flagbar__sum" data-qsum></span></div>' + (grp ? '<details class="adm-q__grps"><summary class="adm-q__gh">Całe grupy uwag naraz</summary>' + grp + '</details>' : '') +
      '<div class="tv-walk__ctx" id="walkCtx" aria-live="polite"></div><ol class="tv-walk__slot" id="walkSlot"></ol><p class="tv-walk__fin" id="walkFin" hidden>Wszystkie flagi rozstrzygnięte ✓ — teraz „Twoje uwagi” → „Wyślij uwagi do poprawki”.</p></div>' +
      '<footer class="tv-walk__nav"><button type="button" class="qc-btn qc-btn--sm" data-walk-step="-1">← Wstecz</button>' +
      '<button type="button" class="adm-linkbtn" data-walk-show>Przewiń jeszcze raz</button>' +
      '<button type="button" class="qc-btn qc-btn--sm qc-btn--primary" data-walk-step="1">Dalej →</button></footer>' +
      '<p class="tv-walk__keys">Skróty: <kbd>J</kbd>/<kbd>K</kbd> następna / poprzednia · <kbd>1</kbd>–<kbd>4</kbd> wybór · <kbd>Enter</kbd> zatwierdź · <kbd>Esc</kbd> zamknij</p></aside></div>';

    var $p = document.getElementById('tabPanel') || $d;
    $p.innerHTML = html;
    var vc = document.getElementById('verComments');
    vc.innerHTML = verCommentsHtml(); vc.hidden = !vc.innerHTML;
    revBoxPaint();
    fitToc();
    drawMap(newStops, draft.stop_translations);
    if (window.AdminMap) window.AdminMap.tripMap(stops, draft.stop_translations, c, title);   // „Mapa przystanków” (admin-map.js)
    updateCounts();
    qaRefresh();
    spy();
    viewApply();
    fitActbar();
    emit('adm:render', { it: it });
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
    var gw = state.cmpM && state.cmpM.by[x.key] ? state.cmpM.by[x.key].g.why : [];
    if (gw.length) head += '<div class="tv-why">' + cmpWhyHtml(gw) + '</div>';
    head += iconRefHtml(x.key, s.category);
    var shown = shownSet('stop.', STOP_TR.concat(STOP_FIELDS, state.blocks && state.blocks[x.key] ? BLK.concat([['sources']]) : []));
    var rows = STOP_TR.map(function (f) { return cell(f[1], x.ot ? x.ot[f[0]] : null, t[f[0]], f[2], hasOld, commentBox(x.key, 'stop.' + f[0], f[1], ver), fl('stop.' + f[0])); }).join('') +
      blockRows(x.key, ver) +
      STOP_FIELDS.map(function (f) { return cell(f[1], x.o ? x.o[f[0]] : null, s[f[0]], f[2], hasOld, commentBox(x.key, 'stop.' + f[0], f[1], ver), fl('stop.' + f[0])); }).join('') +
      qaExtraRows(x.key, shown, ver) +
      cell('Cały przystanek', null, 'Uwaga ogólna do przystanku', null, false, commentBox(x.key, null, 'Cały przystanek', ver), fl(null)).replace('class="adm-row', 'class="adm-row adm-row--all');
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
    if (!opts.length) return '<span class="adm-cmp__none">Porównanie: brak wcześniejszej wersji</span>';
    if (state.cmpSel && !opts.some(function (o) { return o[0] === state.cmpSel; })) state.cmpSel = '';
    return '<label for="cmpSel">Porównaj z</label>' +
      '<select id="cmpSel" class="adm-cmp__sel"><option value="">— bez porównania —</option>' +
      opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (state.cmpSel === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
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
    var sec = document.getElementById('cmpSec'); if (sec) sec.hidden = !on;
    v.innerHTML = on ? cmpViewHtml(it) : ''; v.hidden = !on;
    fitActbar();
    if (state.popLi) popClose();
  }
  function cmpApply() { /* v44: porównanie jest nakładką w render() (state.cmpM) */ }
  function rerender() { var y = window.scrollY; showTab(state.tabVersion); window.scrollTo(0, y); }
  $d.addEventListener('change', function (e) {
    if (e.target.id === 'cmpSel') { state.cmpSel = e.target.value; rerender(); return; }
    if (e.target.id === 'vTabs') { showTab(+e.target.value); var v = document.getElementById('vTabs'); if (v) v.focus(); }
  });
  $d.addEventListener('click', function (e) {
    if (e.target.closest('[data-cmp-off]')) { state.cmpSel = ''; rerender(); return; }
    var o = e.target.closest('[data-cmp-only]');
    if (o) { state.cmpOnly = !state.cmpOnly; o.setAttribute('aria-pressed', String(state.cmpOnly)); var tv = $d.querySelector('.tv'); if (tv) tv.classList.toggle('is-only', state.cmpOnly); }
  });
  function cmpSumHtml(it) {
    var M = state.cmpM, cur = (state.versions || []).filter(function (r) { return r.version === it.version; })[0], base = M.base;
    var notes = (state.versions || []).filter(function (r) { return r.version > Math.min(cur.version, base.version) && r.version <= Math.max(cur.version, base.version) && r.note; });
    return '<section class="tv-cmp" aria-label="Porównanie wersji"><p class="tv-cmp__t"><b>' + esc(vlab(cur)) + '</b> względem <b>' + esc(vlab(base)) + '</b>: ' +
      (M.total ? plForm(M.total, 'zmienione pole', 'zmienione pola', 'zmienionych pól') + ' w ' + plForm(M.places, 'miejscu', 'miejscach', 'miejscach') : 'brak różnic w treści') + '.</p>' +
      '<span class="adm-cmp__leg" aria-hidden="true"><del class="adm-df__del">usunięte</del> <ins class="adm-df__ins">dodane</ins></span>' +
      '<button type="button" class="qc-btn qc-btn--sm" data-cmp-only aria-pressed="' + !!state.cmpOnly + '">Tylko zmiany</button>' +
      '<button type="button" class="adm-linkbtn" data-cmp-off>Zakończ porównanie</button>' +
      (notes.length ? '<ul class="adm-cmp__notes">' + notes.map(function (r) { return '<li><span class="adm-df__wv">' + esc(vlab(r)) + '</span> ' + esc(r.note) + '</li>'; }).join('') + '</ul>' : '') +
      (M.loose.length ? '<div class="adm-cmp__loose"><p class="adm-df__k">Zmiany bez wskazanego pola</p>' + cmpWhyHtml(M.loose) + '</div>' : '') + '</section>';
  }

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
    var h = '<div class="adm-icref" data-icref="' + esc(key) + '"><p class="adm-icref__h">Zdjęcie do ikony Quo' +
      '<small>1–2 zdjęcia zabytku bez ludzi; bez wyboru — automat</small></p>';
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
  // Każdy inny link https (dowolna strona lub plik: Google Drive, Dropbox, Imgur, blog…) → zapisany jako adres; generator pobiera go
  // bezpiecznie (place-icons-fetch.mjs: bez sieci prywatnej, ≤ 15 MB, JPEG/PNG/WebP, ze strony bierze og:image). SQL 2026-10-31-icon-refs-linki.sql.
  // Ta sama reguła adresu co ops.icon_ref_ok w SQL: https, host bez loginu, bez spacji/znaków kontrolnych, ≤ 2000 znaków.
  var IC_LINK = /^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]{0,252}[A-Za-z0-9])?(?::\d{1,5})?(?:[/?#][^\s\x00-\x1f\x7f<>"\\`{}|^]*)?$/;
  var IC_SQL = '2026-10-31-icon-refs-linki.sql';
  function icIsLink(f) { return typeof f === 'string' && f.length <= 2000 && IC_LINK.test(f); }
  // tekst z pola → { ref: 'File:…' | 'https://…' } albo { err: komunikat }
  function icRefFromInput(u) {
    u = String(u || '').trim();
    if (!u) return { err: 'Wklej link do zdjęcia.' };
    var f = icFileFromUrl(u);
    if (f) return { ref: f };
    if (/^File:/i.test(u)) return { err: 'To nie jest poprawny plik z Commons (potrzebny .jpg, .png albo .webp).' };
    var m; try { m = new URL(u); } catch (e) { return { err: 'To nie jest link — skopiuj pełny adres zaczynający się od https://' }; }
    if (m.protocol === 'http:') return { err: 'Link musi zaczynać się od https:// (bezpieczne połączenie).' };
    if (m.protocol !== 'https:') return { err: 'Dozwolone są tylko linki https://' };
    if (m.username || m.password) return { err: 'Link nie może zawierać loginu ani hasła.' };
    if (/(^|\.)(wikipedia|wikimedia|wikivoyage)\.org$/i.test(m.hostname)) return { err: 'To link do strony Wikipedii, nie do zdjęcia — kliknij zdjęcie i skopiuj adres z „/media/Plik:…” albo „/wiki/File:…”.' };
    var href = m.href;
    if (!icIsLink(href)) return { err: href.length > 2000 ? 'Link jest za długi (ponad 2000 znaków).' : 'Ten link ma niedozwolone znaki — skopiuj go jeszcze raz z paska adresu.' };
    return { ref: href };
  }
  // podgląd tylko dla bezpośredniego pliku obrazu (rozszerzenie w ścieżce) — stron i Dysku Google nie ładujemy
  function icDirectImg(u) { try { return /\.(jpe?g|png|webp)$/i.test(new URL(u).pathname); } catch (e) { return false; } }
  function icHost(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return 'link'; } }
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
      if (icIsLink(f)) {
        var host = icHost(f);
        return '<li class="adm-icref__url">' + (icDirectImg(f) ? '<img class="adm-icref__prev" src="' + esc(f) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="96" height="72" data-icref-prev>' : '') +
          '<a href="' + esc(f) + '" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" title="' + esc(f) + '">Twój link: ' + esc(host) + ' ↗</a>' +
          '<button type="button" class="adm-linkbtn" data-icref-pick="' + esc(key) + '" data-file="' + esc(f) + '"' + (off ? ' disabled' : '') + ' aria-label="Usuń link ' + esc(host) + '">usuń</button></li>';
      }
      var nm = f.replace(/^File:/, '');
      return '<li><a href="https://commons.wikimedia.org/wiki/' + encodeURIComponent(f.replace(/ /g, '_')).replace(/%3A/, ':') + '" target="_blank" rel="noopener noreferrer">Twój link: ' + esc(nm) + ' ↗</a>' +
        '<button type="button" class="adm-linkbtn" data-icref-pick="' + esc(key) + '" data-file="' + esc(f) + '"' + (off ? ' disabled' : '') + ' aria-label="Usuń zdjęcie ' + esc(nm) + '">usuń</button></li>';
    }).join('') + '</ul>';
  }
  function icLinkHtml(key, files, off) {
    if (files.length >= 2) return '';
    return '<details class="adm-icref__more"><summary>Własny link do zdjęcia</summary><form class="adm-icref__link" data-icref-link="' + esc(key) + '" novalidate>' +
      '<label for="icl-' + esc(key) + '">Własny link do zdjęcia (dowolna strona lub plik)</label>' +
      '<span class="adm-icref__linkrow"><input id="icl-' + esc(key) + '" type="url" inputmode="url" autocomplete="off" spellcheck="false" maxlength="2000" placeholder="https://…" aria-describedby="iclh-' + esc(key) + '"' + (off ? ' disabled' : '') + '>' +
      '<button type="submit" class="qc-btn qc-btn--sm"' + (off ? ' disabled' : '') + '>Dodaj</button></span>' +
      '<small class="adm-icref__hint" id="iclh-' + esc(key) + '">Generator pobierze zdjęcie z tego linku. Strona musi być publiczna (bez logowania). ' +
      'Link z Wikimedia Commons lub Wikipedii zapisze się jako plik Commons (z autorem i licencją). Dysk Google: „Udostępnij → każdy, kto ma link”.</small></form></details>';
  }
  $d.addEventListener('submit', function (e) {
    var fm = e.target.closest && e.target.closest('[data-icref-link]');
    if (!fm || !state.icref) return;
    e.preventDefault();
    var ir = state.icref, key = fm.getAttribute('data-icref-link'), inp = fm.querySelector('input');
    var got = icRefFromInput(inp && inp.value), f = got.ref, sel = ir.sel[key], files = sel && sel.mode === 'pick' ? sel.files.slice() : [];
    var say = function (t) { ir.msg[key] = t; icRedraw(key); setTimeout(function () { if (ir.msg[key] === t) { delete ir.msg[key]; icRedraw(key); } }, 8000); };
    if (!f) return say(got.err);
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
    readyRefresh();
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
      // baza bez SQL 2026-10-31 odrzuca adresy spoza Commons (stara walidacja „Zły plik: …” albo CHECK icon_refs_files)
      var sqlOld = (files || []).some(icIsLink) && /Zły plik(?! albo link)|icon_refs_files|check constraint/i.test(e.message || '');
      ir.msg[key] = sqlOld ? 'Najpierw zatwierdź zmianę w zakładce Decyzje (' + IC_SQL + ') — wtedy zapiszą się linki spoza Wikimedia Commons.' : 'Nie zapisano: ' + e.message;
      icRedraw(key);
    });
  }
  // podgląd linku się nie załadował (strona, a nie plik; blokada serwisu) → sam link, bez pustej ramki
  $d.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && t.hasAttribute('data-icref-prev')) t.parentNode.removeChild(t);
  }, true);
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
      var s = st[f[0]] || {};
      if (s.state === 'found') return cell(f[1], null, blockText(f[0], m[f[0]]), null, false, commentBox(key, 'stop.' + f[0], f[1], ver), { box: key, field: 'stop.' + f[0] });
      // blok pusty: „Brak” wprost, a ślad sprawdzenia małym drugorzędnym tekstem (JP 2026-10-31) — adresy skrócone do domeny, długi ślad zwinięty
      var chk = String(s.checked || '').replace(/https?:\/\/([^\s/,;)]+)[^\s,;)]*/g, '$1').replace(/\s+/g, ' ').trim();
      var html = '<span class="adm-blk-none">Brak</span>' + (chk ? ' <span class="adm-blk-chk">· ' + (chk.length > 90 ? '<details><summary>sprawdzono: ' + esc(chk.slice(0, 70)) + '…</summary>' + esc(chk) + '</details>' : 'sprawdzono: ' + esc(chk)) + '</span>' : '');
      return cell(f[1], null, 'brak — sprawdzono: ' + (s.checked || '(nie podano)'), null, false, commentBox(key, 'stop.' + f[0], f[1], ver), { box: key, field: 'stop.' + f[0], html: html });
    }).join('');
    // źródła: mała lista jak przypisy w druku — numer, tytuł jako link, sama domena zamiast pełnego adresu (JP 2026-10-31: „linki do źródeł mniejsze”)
    var srcTxt = (b.sources || []).map(function (x) { return '[' + x.n + '] ' + (x.title || '') + ' — ' + x.url; }).join('\n');
    var srcHtml = (b.sources || []).length ? '<ol class="adm-src">' + b.sources.map(function (x) {
      var u = /^https?:\/\//i.test(String(x.url || '')) ? String(x.url) : null, host = '';
      try { host = u ? new URL(u).hostname.replace(/^www\./, '') : ''; } catch (e) {}
      var t = esc(x.title || host || u || 'źródło');
      return '<li><span class="adm-src__n">[' + esc(x.n) + ']</span> ' + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + t + '</a>' : t) +
        (host && x.title ? ' <span class="adm-src__host">' + esc(host) + '</span>' : '') + '</li>';
    }).join('') + '</ol>' : '<span class="adm-val adm-src__none">brak źródeł</span>';
    rows += cell('Źródła', null, srcTxt || 'brak źródeł', null, false, commentBox(key, 'stop.sources', 'Źródła', ver), { box: key, field: 'stop.sources', html: srcHtml });
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
        [].forEach.call(document.querySelectorAll('.tv-toc a'), function (a) {
          var on = a.getAttribute('data-to') === k;
          a.classList.toggle('is-on', on);
          if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
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
    if (armed !== b) {
      disarm();
      var left = state.qaLeft ? state.qaLeft.b + state.qaLeft.w : 0;
      armed = b; b.classList.add('is-armed');
      b.textContent = act === 'approve' ? (left ? 'Zostało ' + plForm(left, 'nierozstrzygnięta flaga', 'nierozstrzygnięte flagi', 'nierozstrzygniętych flag') + ' — kliknij, by mimo to opublikować' : 'Na pewno? Kliknij jeszcze raz')
        : 'Odrzucić? Kliknij jeszcze raz';
      armTimer = setTimeout(disarm, left ? 7000 : 4000);
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
        '</p><p class="adm-done__acts"><a class="qc-btn qc-btn--sm adm-back" href="#/trasy">← Trasy</a><a class="qc-btn qc-btn--sm" href="#/">Pulpit</a>' +
        '<button type="button" class="qc-btn qc-btn--sm" data-reopen="' + esc(it.city_slug) + '">Wersje tej wycieczki</button></p></div></div>';
      state.trip = null; state.versions = null; state.current = null;
      loadTrips();
    }).catch(function (err) {
      [].forEach.call($d.querySelectorAll('[data-act]'), function (x) { x.disabled = x.hasAttribute('data-lock'); });
      actLabels();
      $msg.className = 'adm-msg adm-msg--err'; $msg.textContent = 'Nie zapisano: ' + err.message;
    });
  });
  function disarm() {
    clearTimeout(armTimer);
    if (armed) armed.classList.remove('is-armed');
    armed = null;
    actLabels();
  }
  function actLabels() {
    var left = state.qaLeft ? state.qaLeft.b + state.qaLeft.w : 0;
    [].forEach.call($d.querySelectorAll('[data-act]'), function (x) {
      if (x === armed) return;
      if (x.getAttribute('data-act') === 'reject') { x.textContent = 'Odrzuć szkic'; return; }
      x.innerHTML = 'Zatwierdź i opublikuj' + (left ? ' <b class="tv-flagn" title="nierozstrzygnięte flagi">' + left + '<span class="adm-sr"> nierozstrzygniętych flag</span></b>' : '');
    });
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
        $d.innerHTML = '<p class="adm-empty">Postęp prac niedostępny: ' + esc(e.message) + '</p>';
      });
    };
    function render(order, by, evs, queue, runs) {
      var active = order.filter(function (k) { return by[k][0].status === 'running' || by[k][0].status === 'stalled'; }).length;
      var sumG = runs.reduce(function (s, r) { return s + (+r.gemini_tokens || 0); }, 0), sumC = runs.reduce(function (s, r) { return s + (+r.claude_tokens || 0); }, 0);
      var h = '<div class="adm-trip__bar">' +
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
      var h = '<section class="pg">';
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
      var h = '<section class="pg">';
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
    var C = inbox.data ? inbox.data.count : {};
    [['decNav', n, ' do decyzji'], ['decTab', n, ' do decyzji'], ['decCount', n, ' do decyzji'], ['watchNav', C.watch, ' ustaleń strażników'],
      ['iconNav', C.icon, ' tras ze zdjęciami do wyboru'], ['iconMore', C.icon, ' tras ze zdjęciami do wyboru']].forEach(function (x) {
      var el = document.getElementById(x[0]); if (!el) return;
      var v = n == null ? null : x[1];
      el.textContent = v == null ? '·' : v; el.classList.toggle('is-zero', !v);
      el.setAttribute('title', v == null ? 'ładuję' : v + x[2]);
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
  // only: null = cała skrzynka (#/decyzje); 'straznicy' / 'ikony' = jedna sekcja z własnej pozycji w nawigacji
  function openDecisions(only) {
    state.current = null; state.trip = null; state.versions = null; state.tabVersion = null; clearInterval(state.poll);
    var myHash = location.hash;
    function draw(d) {
      if (location.hash !== myHash) return;
      var keep = {}; [].forEach.call($d.querySelectorAll('details[data-k]'), function (x) { keep[x.getAttribute('data-k')] = x.open; });
      var C = d.count, none = function (t) { return '<p class="adm-empty dec-empty">' + esc(t) + '</p>'; };
      var errBox = function (src, what) { return '<p class="adm-cmwarn">' + esc(what) + ' niedostępne: ' + esc(src.err) + (/deploy_requests|cost_requests|ai_budget|admin_watch_open|decision_drafts|schema cache|does not exist|404/i.test(src.err) ? ' — ' + DEC_SQL : '') + '</p>'; };
      var h = '<div class="adm-trip__bar"><span class="adm-cm__meta">odświeża się co 30 s · ' +
        esc(new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })) + '</span></div><section class="pg dec">' +
        (only ? '' : '<header class="pg-head"><div><h2>' + (inbox.n ? 'Czeka na Ciebie: ' + inbox.n : 'Nic nie czeka') + '</h2></div>' +
        '<dl class="pg-kpi"><div><dt>wdrożenia</dt><dd>' + C.deploy + '</dd></div><div><dt>koszty</dt><dd>' + C.cost + '</dd></div><div><dt>strażnicy</dt><dd>' + C.watch + '</dd></div>' +
        '<div><dt>szkice</dt><dd>' + C.draft + '</dd></div><div><dt>ikony</dt><dd>' + C.icon + '</dd></div></dl></header>') +
        '<p class="dec-lead">' + (only === 'straznicy' ? 'Strażnicy co dzień sprawdzają godziny, ceny, linki, lokale i zmiany sezonu na trasach. Każde ustalenie czeka tu na Twoją decyzję.'
          : only === 'ikony' ? 'Do każdego zabytku możesz wybrać 1–2 zdjęcia referencyjne do ikony Quo. Bez decyzji po terminie generator wybierze sam.'
          : 'Każdy przycisk zapisuje decyzję; serwer wykonuje ją sam — wdrożenia w ciągu 2 min, zlecenia w ciągu 10 min. Wynik zobaczysz tutaj.') + '</p>';
      if (only === 'straznicy') h += watchRunsHtml(d);
      // wdrożenia
      var dep = d.deploys.err ? errBox(d.deploys, 'Wdrożenia') : d.deploys.ok.length ? d.deploys.ok.map(deployHtml).join('') : none('Nic nie czeka na wdrożenie.');
      if (!only) h += decSection('wdrozenia', 'Wdrożenia (SQL i serwer)', C.deploy, dep);
      // koszty + budżet
      var b = d.budget.ok && d.budget.ok[0];
      var open = d.costs.ok ? d.costs.ok.filter(function (r) { return /pending|approved|running/.test(r.status); }) : [];
      if (!only) h += decSection('koszty', 'Zgody na koszty', C.cost, (b ? budgetHtml(b) : d.budget.err ? errBox(d.budget, 'Budżet') : '') +
        (d.costs.err ? errBox(d.costs, 'Prośby o zgodę') : open.length ? open.map(function (r) { return costHtml(r, b); }).join('') : none('Nic nie czeka na zgodę na koszt.')));
      // strażnicy
      var w = d.watch.ok;
      if (!only || only === 'straznicy') h += decSection('straznicy', 'Ustalenia strażników', C.watch, d.watch.err ? (/admin_watch_open|404|schema cache|does not exist/i.test(d.watch.err) ? none('Strażnicy jeszcze nie działają (' + DEC_SQL + ')') : errBox(d.watch, 'Ustalenia'))
        : !w || !w.ready ? none('Strażnicy jeszcze nie działają — pojawią się po wdrożeniu SQL 2026-10-30-straznicy.sql.')
        : (w.rows || []).length ? w.rows.map(function (r) { return watchHtml(r, !!w.decide); }).join('') : none('Strażnicy nie mają otwartych ustaleń.'));
      // szkice
      if (!only) h += decSection('szkice', 'Szkice tras do zatwierdzenia', C.draft, d.drafts.err ? errBox(d.drafts, 'Szkice') : d.drafts.ok.length ? d.drafts.ok.map(draftHtml).join('') : none('Żaden szkic nie czeka.'));
      // ikony
      if (!only || only === 'ikony') h += decSection('ikony', 'Zdjęcia do ikon', C.icon, d.icons.err ? errBox(d.icons, 'Wybór zdjęć') : d.icons.ok.length ? d.icons.ok.map(iconHtml).join('') : none('Wszystkie przystanki z kandydatami mają decyzję.'));
      if (!only) h += histHtml(d);
      $d.innerHTML = h + '</section>';
      [].forEach.call($d.querySelectorAll('details[data-k]'), function (x) { if (keep[x.getAttribute('data-k')]) x.open = true; });
    }
    function reload() {
      return Promise.all([loadInbox(), only === 'straznicy' ? loadOps().catch(function () { return null; }) : null]).then(function (r) { draw(r[0]); }).catch(function (e) {
        $d.innerHTML = '<p class="adm-empty">Skrzynka decyzji niedostępna: ' + esc(e.message) + '</p>';
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
    $d.innerHTML = loadingHtml(only === 'straznicy' ? 'Ładuję ustalenia strażników…' : only === 'ikony' ? 'Ładuję zdjęcia do ikon…' : 'Ładuję skrzynkę decyzji…');
    reload(); state.poll = setInterval(function () { if (location.hash === myHash && !document.hidden && !$d.querySelector('.is-armed') && !$d.contains(document.activeElement && document.activeElement.matches('input') ? document.activeElement : null)) reload(); }, 30000);
    document.title = (only ? SECTIONS[only] : 'Decyzje') + ' · Quolino admin';
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

  // ── Widok trasy v44 (JP 2026-10-31: „przegląd wycieczki słaby”) — miejsce pracy redaktora ──
  // Jeden nagłówek z decyzją, „Gotowość do publikacji”, spis przystanków z lewej, karty pól, podgląd rodzic/dziecko,
  // tryb „Przejdź przez flagi” (te same notatki co popover — węzeł przenoszony do panelu, logika odpowiedzi bez zmian),
  // szuflada „Twoje uwagi” z jednym przyciskiem wysyłki i wynikiem weryfikacji (draft_revision_requests.verify, draft_comments.verify_status).
  function loadRevs(slug) {
    return api('/draft_revision_requests?city_slug=eq.' + encodeURIComponent(slug) + '&order=id.desc&limit=6')
      .then(function (r) { state.revs = (r || []).filter(function (x) { return x.city_slug === slug; }); }, function (e) { if (e && e.session) throw e; state.revs = null; });
  }
  function revBoxPaint() {
    var el = document.getElementById('revBox'); if (!el) return;
    var L = state.revs || [], nm = {}; nm[state.trip.slug] = 'Paczka #';
    el.innerHTML = L.length ? '<h3>Wysłane paczki uwag</h3><ul class="ad-todos">' + L.map(function (r) {
      return revRow(r, state.comments, {}).replace(/>[^<]*— uwagi wysłane do poprawki</, '>Paczka #' + esc(r.id) + ' — ' + plForm(Array.isArray(r.comment_ids) ? r.comment_ids.length : 0, 'uwaga', 'uwagi', 'uwag') + '<');
    }).join('') + '</ul>' : '';
    el.hidden = !L.length;
    readyRefresh();
  }
  function readyRefresh() {
    var box = document.getElementById('tvReady'), it = state.tvIt; if (!box || !it) return;
    var q = state.qaLeft || { b: 0, w: 0, done: 0, all: 0 }, items = [];
    items.push(q.all ? { k: 'walk', tone: q.b ? 'bad' : q.w ? 'warn' : 'ok', t: 'Flagi z kontroli', v: q.done + ' z ' + q.all + ' rozstrzygniętych' + (q.b ? ' · ' + plForm(q.b, 'blokująca otwarta', 'blokujące otwarte', 'blokujących otwartych') : ''), pct: q.done / q.all }
      : { tone: 'ok', t: 'Flagi z kontroli', v: 'brak flag' });
    var rv = it.review;
    if (rv) {
      var ne = Array.isArray(rv.errors) ? rv.errors.length : 0, nw = Array.isArray(rv.warnings) ? rv.warnings.length : 0;
      items.push({ k: q.all ? 'walk' : null, tone: ne ? 'bad' : 'ok', t: 'Kontrola (walidator)', v: (rv.verdict ? rv.verdict + ' · ' : '') + plForm(ne, 'błąd', 'błędy', 'błędów') + ', ' + plForm(nw, 'ostrzeżenie', 'ostrzeżenia', 'ostrzeżeń') });
    } else items.push({ tone: 'wait', t: 'Kontrola (walidator)', v: 'brak wyniku kontroli dla tej wersji' });
    if (!state.readOnly) { var un = unsent().length; items.push({ k: 'drawer', tone: un ? 'warn' : 'ok', t: 'Twoje uwagi', v: un ? plForm(un, 'uwaga czeka', 'uwagi czekają', 'uwag czeka') + ' na wysłanie' : 'nic nie czeka na wysłanie' }); }
    var rq = (state.revs || [])[0];
    if (rq) {
      var st = REQST[rq.status] || ['wait', rq.status], vf = verifyOf(rq, state.comments.filter(function (c) { return +c.request_id === +rq.id; }));
      var tone = st[0], txt = 'paczka #' + rq.id + ': ' + (rq.status === 'done' && rq.result_version ? 'naniesione w v' + rq.result_version : st[1]);
      if (vf) { if (vf.ready) { tone = 'ok'; txt += ' · gotowa do akceptacji'; } else if (vf.applied != null) { tone = vf.bad ? 'bad' : 'wait'; txt += ' · ' + vf.applied + ' z ' + vf.total + ' naniesionych'; } }
      items.push({ k: 'drawer', tone: tone, t: 'Poprawki Hermesa', v: txt });
    }
    var ir = state.icref;
    if (ir && ir.cand) {
      var tot = 0, ch = 0, first = null;
      (state.tvStops || []).forEach(function (x) {
        if (x.kind === 'del' || PRACTICAL[x.s.category] || !icCands(x.key).length) return;
        tot++; if (ir.sel[x.key] && ir.sel[x.key].mode) ch++; else if (!first) first = x.key;
      });
      if (tot) items.push({ k: 'icon', key: first, tone: ch < tot ? 'warn' : 'ok', t: 'Zdjęcia do ikon', v: ch + ' z ' + tot + ' przystanków z decyzją' });
    }
    var D = state.tvDraft, S = (D && D.stops) || [], L = langsOf(D && D.stop_translations);
    if (S.length) {
      var noEn = S.filter(function (x) { return !trOf(D.stop_translations, 'en', 'stop_id', x.id).name; }).length;
      items.push({ k: 'sum', tone: noEn ? 'warn' : 'ok', t: 'Tłumaczenia', v: plForm(L.length, 'język', 'języki', 'języków') + (L.length ? ' (' + L.join(', ').toUpperCase() + ')' : '') + (noEn ? ' · EN brak w ' + noEn : '') });
    }
    var ok = items.filter(function (x) { return x.tone === 'ok'; }).length, pct = Math.round(ok / items.length * 100);
    var od = document.getElementById('readyD'), isOpen = od ? od.open : tocWide.matches;
    box.innerHTML = '<details class="tv-ready__d" id="readyD"' + (isOpen ? ' open' : '') + '><summary class="tv-ready__h"><h3 id="tvReadyH">Gotowość do publikacji</h3><span class="tv-ready__n">' + ok + ' z ' + items.length + ' gotowe</span>' +
      '<span class="tv-ready__bar" role="img" aria-label="Gotowe ' + pct + '%"><span style="width:' + pct + '%"></span></span>' + CHEV + '</summary><ul class="tv-ready__list">' + items.map(function (x) {
        var inner = '<span class="tv-ready__ic tv-ready__ic--' + x.tone + '">' + (x.tone === 'ok' ? IC.ok : x.tone === 'bad' ? IC.bad : IC.wait) + '</span>' +
          '<span class="tv-ready__t"><b>' + esc(x.t) + '</b><span>' + esc(x.v) + '</span>' + (x.pct != null ? '<i class="tv-ready__p"><i style="width:' + Math.round(x.pct * 100) + '%"></i></i>' : '') + '</span>' +
          (x.k ? '<span class="tv-ready__go" aria-hidden="true">Przejdź →</span>' : '<span></span>') +
          '<span class="adm-sr">' + ({ ok: 'gotowe', bad: 'do zrobienia', warn: 'do zrobienia', wait: 'w toku' }[x.tone]) + '</span>';
        return '<li>' + (x.k ? '<button type="button" class="tv-ready__it" data-ready="' + x.k + '"' + (x.key ? ' data-key="' + esc(x.key) + '"' : '') + '>' + inner + '</button>' : '<div class="tv-ready__it">' + inner + '</div>') + '</li>';
      }).join('') + '</ul></details>';
    if (!armed) actLabels();
  }
  // podgląd: uproszczona kolejność i treść tak, jak zobaczy rodzic / dziecko
  function paras(v) { return (Array.isArray(v) ? v : String(v || '').split(/\n{2,}/)).filter(Boolean).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join(''); }
  function previewHtml(mode) {
    var D = state.tvDraft || {}, c = D.city || {}, ct = trOf(D.city_translations, 'pl'), kid = mode === 'kid';
    var S = (D.stops || []).slice().sort(function (a, b) { return a.stop_number - b.stop_number; });
    var h = '<article class="tv-pv' + (kid ? ' tv-pv--kid' : '') + '"><header class="tv-pv__h"><p class="tv-pv__k">' + (kid ? 'Widok dziecka' : 'Widok rodzica') + ' · uproszczony podgląd treści</p>' +
      '<h2>' + esc(ct.title || '') + '</h2>' + (!kid && ct.subtitle ? '<p class="tv-pv__sub">' + esc(ct.subtitle) + '</p>' : '') + (!kid && ct.lead ? paras(ct.lead) : '') +
      (!kid ? '<p class="tv-pv__meta">' + esc([durLabel(c.duration_type), S.length + ' przystanków'].filter(Boolean).join(' · ')) + '</p>' : '') + '</header><ol class="tv-pv__list">';
    S.forEach(function (s) {
      var t = trOf(D.stop_translations, 'pl', 'stop_id', s.id);
      h += '<li class="tv-pv__stop"><span class="adm-stop__no">' + num(s.stop_number) + '</span><img class="adm-stop__ic" src="' + icon(s.category) + '" alt="" width="48" height="48" loading="lazy"><div class="tv-pv__b">' +
        '<h3>' + esc(t.name || '') + '</h3>';
      if (kid) {
        h += (t.kids_box ? '<div class="tv-pv__mission"><b>Misja</b>' + paras(t.kids_box) + '</div>' : '') +
          (t.kids_choice && Array.isArray(t.kids_choice.options) ? '<ol class="tv-pv__opts" type="A">' + t.kids_choice.options.map(function (o) { return '<li>' + esc(o) + '</li>'; }).join('') + '</ol>' : '') +
          (t.hint ? '<p class="tv-pv__hint"><b>Podpowiedź:</b> ' + esc(t.hint) + '</p>' : '');
      } else {
        var meta = [s.time_label, s.visit_duration ? minLabel(s.visit_duration) : '', s.price].filter(Boolean).join(' · ');
        h += (meta ? '<p class="tv-pv__meta">' + esc(meta) + '</p>' : '') + paras(t.desc_paragraphs) +
          (t.local_flavor ? '<p class="tv-pv__flav"><b>Lokalny smaczek:</b> ' + esc(t.local_flavor) + '</p>' : '') +
          (t.kids_box ? '<p class="tv-pv__kid"><b>Dla dziecka:</b> misja na tym przystanku</p>' : '');
      }
      h += '</div></li>';
    });
    h += '</ol>' + (!kid && (ct.good_to_know || ct.local_food) ? '<footer class="tv-pv__f">' + (ct.good_to_know ? '<h3>Warto wiedzieć</h3>' + paras(ct.good_to_know) : '') +
      (ct.local_food ? '<h3>Lokalna kuchnia</h3>' + paras(ct.local_food) : '') + '</footer>' : '') + '</article>';
    return h;
  }
  function viewApply() {
    var v = state.tvView || 'fields', F = document.getElementById('tvFields'), P = document.getElementById('tvPreview');
    if (!F || !P) return;
    F.hidden = v !== 'fields'; P.hidden = v === 'fields';
    P.innerHTML = v === 'fields' ? '' : previewHtml(v);
    [].forEach.call($d.querySelectorAll('[data-view]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-view') === v)); });
  }
  // spis przystanków: na szerokim ekranie zawsze otwarty, na telefonie zwinięty nad treścią
  var tocWide = window.matchMedia('(min-width:1100px)');
  function fitToc() { var d = document.getElementById('tocD'); if (d) d.open = tocWide.matches; }
  if (tocWide.addEventListener) tocWide.addEventListener('change', fitToc);
  $d.addEventListener('toggle', function (e) { if ((e.target.id === 'tocD' || e.target.id === 'readyD') && tocWide.matches && !e.target.open) e.target.open = true; }, true);

  // szuflada „Twoje uwagi”
  function drawerOpen() {
    var d = document.getElementById('cmDrawer'); if (!d) return;
    walkClose(true); popClose();
    d.hidden = false; document.body.classList.add('has-panel');
    [].forEach.call($d.querySelectorAll('[data-drawer]'), function (b) { b.setAttribute('aria-expanded', 'true'); });
    var f = d.querySelector('[data-send]:not([disabled])') || d.querySelector('[data-drawer-close]'); if (f) f.focus();
  }
  function drawerClose(silent) {
    var d = document.getElementById('cmDrawer'); if (!d || d.hidden) return;
    d.hidden = true; document.body.classList.remove('has-panel');
    [].forEach.call($d.querySelectorAll('[data-drawer]'), function (b) { b.setAttribute('aria-expanded', 'false'); if (!silent) b.focus(); });
  }

  // tryb „Przejdź przez flagi”: jedna notatka naraz w panelu; węzeł <li> wraca na miejsce po zamknięciu
  var walk = { on: false, ids: [], i: 0, li: null, ph: null };
  function walkPut() {
    if (walk.li && walk.ph && walk.ph.parentNode) { walk.ph.parentNode.insertBefore(walk.li, walk.ph); walk.ph.parentNode.removeChild(walk.ph); }
    if (walk.li) walk.li.classList.remove('is-walk');
    walk.li = null; walk.ph = null;
  }
  function walkDone(id) { var li = document.getElementById('q-' + id); return !li || li.classList.contains('is-done'); }
  function walkOpen() {
    var w = document.getElementById('walk'); if (!w) return;
    popClose(); drawerClose(true);
    walk.ids = [].map.call($d.querySelectorAll('#tvFields .adm-q__it:not(.is-auto)'), function (li) { return li.getAttribute('data-qid'); });
    if (!walk.ids.length) return;
    if ((state.tvView || 'fields') !== 'fields') { state.tvView = 'fields'; viewApply(); }
    if (state.cmpOnly) { state.cmpOnly = false; var tv = $d.querySelector('.tv'); if (tv) tv.classList.remove('is-only'); }
    walk.on = true; w.hidden = false; document.body.classList.add('has-panel', 'has-walk'); fitActbar();
    [].forEach.call($d.querySelectorAll('[data-walk]'), function (b) { b.setAttribute('aria-expanded', 'true'); });
    var i = 0; while (i < walk.ids.length && walkDone(walk.ids[i])) i++;
    walkShow(i < walk.ids.length ? i : 0);
  }
  function walkShow(i) {
    walkPut();
    walk.i = Math.max(0, Math.min(i, walk.ids.length - 1));
    var li = document.getElementById('q-' + walk.ids[walk.i]), slot = document.getElementById('walkSlot');
    if (!li || !slot) return;
    walk.ph = document.createComment('flaga'); li.parentNode.insertBefore(walk.ph, li);
    slot.appendChild(li); li.classList.add('is-walk'); walk.li = li;
    walkMark(walk.ids[walk.i]);
    walkCtx(walk.ids[walk.i]);
    walkPaint();
    walkScroll();
    emit('adm:walk', { id: walk.ids[walk.i], i: walk.i });
    var f = li.querySelector('.adm-qo.is-rec') || li.querySelector('.adm-qo') || li.querySelector('[data-qa-change]'); if (f) f.focus({ preventScroll: true });
    var cx = document.getElementById('walkCtx'), bd = cx && cx.parentNode; if (bd && bd.scrollTo) bd.scrollTo({ top: Math.max(0, cx.offsetTop - bd.offsetTop - 8) });
  }
  // pole, którego dotyczy flaga: wiersz w treści (miejsce po przeniesionej notatce), obramowanie + zaznaczony fragment
  function walkRow() { return walk.ph && walk.ph.parentNode ? walk.ph.parentNode.closest('.adm-row') : null; }
  function walkMark(id) {
    [].forEach.call($d.querySelectorAll('.is-walk-target, .is-walk-on'), function (el) { el.classList.remove('is-walk-target', 'is-walk-on'); });
    if (!id) return;
    var row = walkRow(); if (row) row.classList.add('is-walk-target');
    var card = row && row.closest('.adm-stopx'); if (card) card.classList.add('is-walk-target');
    [].forEach.call($d.querySelectorAll('#tvFields [data-flag="' + id + '"]'), function (f) { f.classList.add('is-walk-on'); });
  }
  // przewinięcie treści do pola flagi — w wolnym obszarze: pod przyklejonym nagłówkiem, nad dolnym arkuszem
  function walkCover() {
    var w = document.getElementById('walk'); if (!w || w.hidden) return 0;
    var r = w.getBoundingClientRect();
    return r.left < 40 ? Math.max(0, window.innerHeight - r.top) : 0;   // dolny arkusz (telefon) zasłania dół ekranu
  }
  function walkScroll() {
    var row = walkRow(); if (!row) return;
    var target = row.querySelector('.is-walk-on') || row, r = row.getBoundingClientRect(), tr = target.getBoundingClientRect();
    var top = stickyTop() + 10, bottom = window.innerHeight - walkCover() - 10, area = bottom - top;
    var y = r.height <= area ? r.top - top - (area - r.height) / 2 : (tr.top - r.top < area - 60 ? r.top - top : tr.top - top - 40);
    var card = row.closest('.adm-stopx');
    if (card) { var cr = card.getBoundingClientRect(); if (cr.height <= area && cr.top - y < top) y = cr.top - top; }   // cała karta, gdy się mieści
    window.scrollBy({ top: Math.round(y), behavior: window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' });
  }
  // kontekst w panelu: przystanek · pole, cytat z jednym zdaniem przed i po, fragment zaznaczony
  function walkCtx(id) {
    var el = document.getElementById('walkCtx'); if (!el) return;
    var x = (state.qa ? state.qa.list : []).filter(function (y) { return qaId(y) === id; })[0], row = walkRow();
    var val = row ? row.querySelector('.adm-row__v') : null, text = '';
    if (val) { var cl = val.cloneNode(true); [].forEach.call(cl.querySelectorAll('.adm-flag, .adm-row__flags, .adm-df__whys'), function (n) { n.parentNode.removeChild(n); }); text = cl.textContent.replace(/[ \t]+\n/g, '\n').replace(/ +([,.;:!?])/g, '$1').trim(); }
    var where = x ? x.where : '', q = x && x.quote ? String(x.quote) : '', body;
    if (!x || (x.field == null && !q)) {
      body = '<p class="tv-walk__all">' + (x && x.box !== '_city' ? 'Uwaga do całego przystanku — bez wskazanego pola.' : 'Uwaga do całej trasy — bez wskazanego pola. Treść: opis miasta i „Trasa w skrócie”.') + '</p>';
    } else {
      var i = q ? text.indexOf(q) : -1;
      if (i < 0 && q) { var lo = text.toLowerCase(); i = lo.indexOf(q.toLowerCase()); }
      if (i < 0) body = '<p class="tv-walk__txt">' + esc(text.length > 320 ? text.slice(0, 320) + '…' : text || '— puste —') + '</p>' + (q ? '<p class="tv-walk__q">Fragment: „' + esc(q) + '”</p>' : '');
      else {
        var st = sentStart(text, i), a = st > 0 ? sentStart(text, st - 2) : 0, e0 = sentEnd(text, i + q.length), b = e0 < text.length ? sentEnd(text, e0 + 1) : e0;
        body = '<p class="tv-walk__txt">' + (a > 0 ? '… ' : '') + esc(text.slice(a, i)) + '<mark class="adm-fl is-walk-on">' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length, b)) + (b < text.length ? ' …' : '') + '</p>';
      }
    }
    el.innerHTML = '<p class="tv-walk__where">' + esc(where) + '</p>' + body;
  }
  function sentStart(t, p) { for (var k = Math.min(p, t.length) - 1; k > 0; k--) if (/[.!?…\n]/.test(t.charAt(k - 1)) && /\s/.test(t.charAt(k))) return k + 1; return 0; }
  function sentEnd(t, p) { for (var k = Math.max(p, 0); k < t.length; k++) if (/[.!?…]/.test(t.charAt(k)) && (k + 1 >= t.length || /\s/.test(t.charAt(k + 1)))) return k + 1; return t.length; }
  function walkPaint() {
    if (!walk.on) return;
    var n = walk.ids.length, d = walk.ids.filter(walkDone).length, pos = document.getElementById('walkPos'), bar = document.getElementById('walkBar'), fin = document.getElementById('walkFin');
    if (pos) pos.textContent = (walk.i + 1) + ' z ' + n + ' · rozstrzygnięte ' + d;
    if (bar) bar.style.width = (n ? Math.round(d / n * 100) : 0) + '%';
    if (fin) fin.hidden = d < n;
    [].forEach.call($d.querySelectorAll('[data-walk-step]'), function (b) { var s = +b.getAttribute('data-walk-step'); b.disabled = s < 0 ? walk.i <= 0 : walk.i >= n - 1; });
  }
  function walkStep(d) { if (walk.on) walkShow(walk.i + d); }
  function walkNextOpen() {
    if (!walk.on) return;
    for (var k = 1; k <= walk.ids.length; k++) { var j = (walk.i + k) % walk.ids.length; if (!walkDone(walk.ids[j])) { walkShow(j); return; } }
    walkPaint();
  }
  function walkClose(silent) {
    var w = document.getElementById('walk');
    walkPut();
    if (!walk.on) return;
    walkMark(null);
    walk.on = false; if (w) w.hidden = true; document.body.classList.remove('has-panel', 'has-walk'); fitActbar();
    [].forEach.call($d.querySelectorAll('[data-walk]'), function (b) { b.setAttribute('aria-expanded', 'false'); if (!silent) b.focus(); });
  }
  $d.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest('[data-walk]')) { walk.on ? walkClose() : walkOpen(); return; }
    if (t.closest('[data-walk-close]')) { walkClose(); return; }
    var st = t.closest('[data-walk-step]'); if (st) { walkStep(+st.getAttribute('data-walk-step')); return; }
    if (t.closest('[data-walk-show]')) { walkScroll(); return; }
    var q = t.closest('#walkSlot [data-qa]');
    if (q && q.getAttribute('data-qa') !== 'own') { setTimeout(walkNextOpen, 450); return; }
    if (t.closest('[data-drawer]')) { var dd = document.getElementById('cmDrawer'); dd && !dd.hidden ? drawerClose() : drawerOpen(); return; }
    if (t.closest('[data-drawer-close]')) { drawerClose(); return; }
    if (t.closest('#cmDrawer a[href^="#st-"]') && !tocWide.matches) { drawerClose(true); return; }
    var v = t.closest('[data-view]'); if (v) { state.tvView = v.getAttribute('data-view'); viewApply(); return; }
    var r = t.closest('[data-ready]');
    if (r) {
      var k = r.getAttribute('data-ready');
      if (k === 'walk') walkOpen(); else if (k === 'drawer') drawerOpen();
      else {
        if ((state.tvView || 'fields') !== 'fields') { state.tvView = 'fields'; viewApply(); }
        var el = document.getElementById(k === 'icon' ? 'st-' + (r.getAttribute('data-key') || '') : 'st-_sum');
        if (el) { el.scrollIntoView({ block: 'start' }); var ic = el.querySelector('.adm-icref__pick, .adm-icref button'); if (ic && k === 'icon') ic.focus({ preventScroll: true }); }
      }
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (walk.on) { e.preventDefault(); walkClose(); return; } var dd = document.getElementById('cmDrawer'); if (dd && !dd.hidden) { e.preventDefault(); drawerClose(); } return; }
    if (!walk.on || e.ctrlKey || e.metaKey || e.altKey || /^(TEXTAREA|INPUT|SELECT)$/.test((e.target || {}).tagName || '')) return;
    var k = e.key.toLowerCase();
    if (k === 'j') { e.preventDefault(); walkStep(1); }
    else if (k === 'k') { e.preventDefault(); walkStep(-1); }
    else if (/^[1-4]$/.test(k) && walk.li) { var o = walk.li.querySelectorAll('.adm-qo')[+k - 1]; if (o) { e.preventDefault(); o.focus(); } }
  });

  // ── Pulpit (JP 2026-10-31): cały projekt na jednym ekranie ──
  // Tylko istniejące źródła: admin_trips, skrzynka decyzji (loadInbox), draft_revision_requests + draft_comments (stan uwag),
  // pipeline_runs / pipeline_queue (praca w tle), ai_usage_daily (koszty), opcjonalnie rpc/ops_status (podgląd serwera:
  // cron, blokady, ostatni komunikat deploy.sh, przebiegi strażników). Bez ops_status kafelek serwera pokazuje tylko to, co jest w admin.
  // Kolumny verify_* (sprawdzenie naniesienia uwag, bin/draft-comments.mjs) obsługiwane opcjonalnie — gdy ich nie ma, nic nie znika.
  function loadingHtml(t) { return '<div class="ad-loading" role="status"><span class="ad-spin" aria-hidden="true"></span><p>' + esc(t) + '</p></div>'; }
  var ops = { data: null, at: 0, off: false, p: null };
  function loadOps() {
    if (DEMO) { ops.data = demoOps(); return Promise.resolve(ops.data); }
    if (ops.off) return Promise.resolve(null);
    if (ops.data && Date.now() - ops.at < 60000) return Promise.resolve(ops.data);
    if (ops.p) return ops.p;
    ops.p = api('/rpc/ops_status', { method: 'POST', body: {} }).then(function (r) {
      ops.data = r && r.snapshots ? r : null; ops.at = Date.now(); if (!ops.data) ops.off = true; return ops.data;
    }, function (e) { if (e && e.session) throw e; ops.off = true; return null; })
      .then(function (v) { ops.p = null; return v; }, function (e) { ops.p = null; throw e; });
    return ops.p;
  }
  function snap(k) { var s = ops.data && ops.data.snapshots && ops.data.snapshots[k]; return s && s.data && typeof s.data === 'object' ? s.data : null; }
  function demoOps() {
    var now = Date.now(), iso = function (m) { return new Date(now - m * 60000).toISOString(); };
    return { now: iso(0), snapshots: {
      deploy: { data: { last_message: iso(25).slice(0, 16).replace('T', ' ') + ' UTC\n✅ zatwierdzone i wdrożone: d6933f0 Uwagi z panelu: prośby wracają do kolejki same', last_message_at: iso(25), waiting_for_jp: false, repo_head: 'd6933f0 Uwagi z panelu' } },
      cron: { data: { last_run: iso(3), trigger: 'gemini-queue', gemini_queue_lock: null, repo_jobs_lock: null, watch_lock: null } },
      queue: { data: { open: [], failed_7d: [{ id: 8, city_slug: 'urbino', kind: 'translate', result: 'cs: tłumaczenie ucięte', finished_at: iso(3000) }],
        usage_24h: [], agyQuotaOut: new Date(now + 200 * 60000).toISOString(), agyWeekCalls: 159 } },
      watch: { data: { ready: true, open_by_kind: [{ kind: 'hours', open: 1 }, { kind: 'link', open: 1 }],
        state: { last: { prices: { at: iso(140), found: 6, ai: 4 }, links: { at: iso(120), found: 1, ai: 0 }, season: { at: iso(150), found: 2, ai: 1 },
          venues: { at: iso(160), found: 0, ai: 0 }, site: { at: iso(110), found: 0, ai: 0 }, track: { at: iso(170), found: 0, ai: 0 }, costs: { at: iso(180), found: 0, ai: 0 } } } } }
    } };
  }
  var WRUN = { prices: 'ceny i godziny', links: 'linki', site: 'strona', costs: 'koszty AI', track: 'zamknięcia', season: 'sezon', venues: 'lokale', hours: 'godziny', photos: 'zdjęcia' };
  function watchRunsHtml(d) {
    var w = snap('watch'), last = w && w.state && w.state.last, rows = (d && d.watch.ok && d.watch.ok.rows) || [], by = {};
    rows.forEach(function (r) { by[r.kind] = (by[r.kind] || 0) + 1; });
    var kinds = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; });
    var h = '<section class="dec-sec" aria-labelledby="wrH"><h3 class="pg-h3" id="wrH">Stan strażników</h3><div class="pg-card ad-wruns">';
    h += kinds.length ? '<p class="ad-wruns__sum">Otwarte ustalenia: ' + kinds.map(function (k) { return '<span class="ad-chip">' + esc(WKIND[k] || k) + ' <b>' + by[k] + '</b></span>'; }).join(' ') + '</p>'
      : '<p class="ad-wruns__sum">Brak otwartych ustaleń.</p>';
    if (last && Object.keys(last).length) {
      h += '<ul class="ad-wruns__list">' + Object.keys(last).sort().map(function (k) {
        var x = last[k] || {};
        return '<li><b>' + esc(WRUN[k] || k) + '</b><span>' + (x.at ? esc(ago(x.at)) : '—') + '</span><span>' + plForm(+x.found || 0, 'ustalenie', 'ustalenia', 'ustaleń') + '</span></li>';
      }).join('') + '</ul>';
    } else h += '<p class="ad-note">Czas ostatnich przebiegów pojawi się, gdy panel dostanie podgląd serwera (funkcja <code>ops_status</code> w schemacie admin).</p>';
    return h + '</div></section>';
  }

  var IC = {
    draft: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>',
    deploy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 15v5h16v-5"/></svg>',
    cost: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M14.8 9.2c-.5-.9-1.5-1.4-2.8-1.4-1.6 0-2.8.8-2.8 2.1 0 3 5.8 1.6 5.8 4.4 0 1.3-1.2 2.1-3 2.1-1.4 0-2.5-.6-3-1.6M12 6v1.8M12 16.4V18"/></svg>',
    watch: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z"/></svg>',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8.5 8.5"/></svg>',
    rev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>',
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/></svg>',
    bad: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5L22 20H2z"/><path d="M12 10v4.5M12 17.2v.3"/></svg>',
    wait: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
    ext: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></svg>'
  };
  // status = kolor + słowo + kształt ikony (nie sam kolor)
  function stChip(tone, txt) { var i = tone === 'bad' ? IC.bad : tone === 'ok' ? IC.ok : IC.wait; return '<span class="ad-st ad-st--' + tone + '">' + i + '<span>' + esc(txt) + '</span></span>'; }
  function todoRow(kind, href, title, meta, tone, status, ext) {
    return '<li class="ad-todo ad-todo--' + tone + '"><span class="ad-todo__ic ad-todo__ic--' + kind + '">' + IC[kind] + '</span>' +
      '<div class="ad-todo__b"><a class="ad-todo__t" href="' + esc(href) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + title + '</a>' + (meta ? '<p class="ad-todo__m">' + meta + '</p>' : '') + '</div>' +
      (status ? stChip(tone, status) : '') + '</li>';
  }
  var REQST = { 'new': ['wait', 'w kolejce'], working: ['wait', 'Hermes nanosi'], done: ['ok', 'naniesione'], failed: ['bad', 'nieudane'] };
  function n_(v) { return v == null || v === '' || isNaN(+v) ? null : +v; }
  // weryfikacja naniesienia (SQL 2026-10-31-weryfikacja-uwag.sql, bin/verify-revision.mjs): prośba.verify (jsonb:
  // applied, total, ready, label, pending_ai, new_errors…) i uwaga.verify_status (applied | partial | missing | stale).
  // Przed tym SQL kolumn nie ma — wtedy null i pulpit pokazuje sam stan prośby.
  function verifyOf(r, cms) {
    var v = r.verify && typeof r.verify === 'object' ? r.verify : null;
    if (v) {
      var tot = n_(v.total), ap = n_(v.applied), st = (+v.missing || +v.partial) ? 'partial' : 'ok';
      return { ready: v.ready === true, applied: ap, total: tot, pending: !!v.pending_ai, newErr: n_(v.new_errors), label: v.label || null, bad: v.ready === false && !v.pending_ai, st: st };
    }
    var own = cms.filter(function (c) { return c.verify_status; });
    if (!own.length) return null;
    var stale = own.filter(function (c) { return c.verify_status === 'stale'; }).length, ok = own.filter(function (c) { return c.verify_status === 'applied'; }).length;
    var total = own.length - stale;
    return { ready: total > 0 && ok >= total, applied: ok, total: total, pending: false, newErr: null, label: null, bad: ok < total };
  }
  function revRow(r, cms, names) {
    var mine = cms.filter(function (c) { return +c.request_id === +r.id; });
    var n = Array.isArray(r.comment_ids) ? r.comment_ids.length : mine.length;
    var st = REQST[r.status] || ['wait', r.status], tone = st[0], label = st[1];
    var nm = names[r.city_slug] || titleCase(r.city_slug), meta = [];
    meta.push(plForm(n, 'uwaga', 'uwagi', 'uwag') + ' do v' + esc(r.city_version));
    if (r.status === 'done' && r.result_version) label = 'naniesione w v' + r.result_version;
    if (r.status === 'done' && mine.length) {
      var ok = mine.filter(function (c) { return c.status === 'done'; }).length, rej = mine.filter(function (c) { return c.status === 'rejected'; }).length;
      meta.push('Hermes: ' + ok + ' z ' + mine.length + ' poprawione' + (rej ? ', ' + rej + ' odrzucone z powodem' : ''));
    }
    var v = verifyOf(r, mine);
    if (v) {
      if (v.ready) { tone = 'ok'; label = 'gotowa do akceptacji'; }
      else if (v.applied != null && v.total != null) { tone = v.bad ? 'bad' : 'wait'; label = v.applied + ' z ' + v.total + ' naniesionych'; }
      if (v.pending) meta.push('sprawdzenie wstępne — pełne po odnowieniu limitu AI');
      if (v.newErr) meta.push(plForm(v.newErr, 'nowy błąd', 'nowe błędy', 'nowych błędów') + ' w kontroli');
      if (v.label) meta.push(esc(v.label));
      if (r.retry_of) meta.push('ponowna runda po prośbie #' + esc(r.retry_of));
    }
    if (r.hermes_reply) meta.push('„' + esc(String(r.hermes_reply).slice(0, 140)) + (String(r.hermes_reply).length > 140 ? '…' : '') + '”');
    meta.push(esc(when(r.updated_at || r.created_at)));
    return todoRow('rev', '#/' + encodeURIComponent(r.city_slug), esc(nm) + ' — uwagi wysłane do poprawki', meta.join(' · '), tone, label);
  }

  var STAGE4 = ['szkic', 'kontrola', 'do akceptacji', 'opublikowana'];
  function stageOf(t, runs, reqs) {
    var run = runs.filter(function (r) { return r.city_slug === t.slug && (r.status === 'running' || r.status === 'stalled'); })[0];
    if (run) {
      var early = run.kind !== 'revise' && (+run.stage || 0) < 4;
      return { i: early ? 0 : 1, tone: run.status === 'stalled' ? 'bad' : 'wait', sub: run.status === 'stalled' ? 'stoi ≥ 15 min' : early ? 'Hermes pisze' : run.kind === 'revise' ? 'poprawki w toku' : 'kontrola w toku' };
    }
    var rq = reqs.filter(function (r) { return r.city_slug === t.slug && (r.status === 'new' || r.status === 'working'); })[0];
    if (rq) return { i: 1, tone: 'wait', sub: rq.status === 'working' ? 'Hermes nanosi uwagi' : 'uwagi w kolejce' };
    if (t.status === 'draft') return { i: 2, tone: 'warn', sub: t.published != null ? 'zmiana opublikowanej v' + t.published : 'nowa trasa' };
    if (t.status === 'published') return { i: 3, tone: 'ok', sub: '' };
    return { i: -1, tone: 'off', sub: VST[t.status] || t.status };
  }
  function stageHtml(s) {
    var label = s.i < 0 ? s.sub : STAGE4[s.i];
    return '<span class="ad-stage ad-stage--' + s.tone + '"><span class="ad-stage__bars" aria-hidden="true">' + STAGE4.map(function (x, i) {
      return '<i class="' + (i < s.i || (i === s.i && s.i === 3) ? 'is-done' : i === s.i ? 'is-now' : '') + '"></i>';
    }).join('') + '</span><span class="ad-stage__t"><b>' + esc(label) + '</b>' + (s.sub && s.i >= 0 ? '<small>' + esc(s.sub) + '</small>' : '') + '</span>' +
      '<span class="adm-sr">' + (s.i >= 0 ? 'etap ' + (s.i + 1) + ' z 4' : '') + '</span></span>';
  }

  function openDashboard() {
    state.current = null; state.trip = null; state.versions = null; state.tabVersion = null; clearInterval(state.poll);
    $d.onclick = null; $d.onsubmit = null; $d.onchange = null;
    document.title = 'Pulpit · Quolino admin';
    if (!$d.querySelector('.ad-dash')) $d.innerHTML = loadingHtml('Ładuję pulpit…');
    var soft = function (p) { return Promise.resolve(p).then(function (v) { return { ok: v }; }, function (e) { if (e && e.session) throw e; return { err: e && e.message || 'błąd' }; }); };
    var since = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
    Promise.all([
      Promise.resolve(state.tripsP).catch(function () { return null; }),
      soft(loadInbox()),
      soft(api('/draft_revision_requests?order=id.desc&limit=12')),
      soft(api('/draft_comments?select=*&request_id=not.is.null&order=id.desc&limit=400')),
      soft(api('/pipeline_runs?order=last_at.desc&limit=40')),
      soft(api('/pipeline_queue?status=in.(queued,running)&order=id.asc')),
      soft(DEMO ? Promise.resolve(demoCosts().filter(function (r) { return r.day >= since; })) : api('/ai_usage_daily?day=gte.' + since + '&order=day.desc&limit=2000')),
      loadOps().catch(function () { return null; })
    ]).then(function (r) {
      if (location.hash && location.hash !== '#/' && location.hash !== '#/pulpit' && location.hash !== '#') return;
      drawDash({ inbox: r[1], revs: r[2], cms: r[3], runs: r[4], queue: r[5], usage: r[6] });
    }).catch(function (e) {
      $d.innerHTML = '<div class="adm-placeholder adm-placeholder--err" role="alert"><p>Pulpit niedostępny: ' + esc(e.message) + '</p></div>';
    });
    state.poll = setInterval(function () { if ((!location.hash || location.hash === '#/' || location.hash === '#/pulpit') && !document.hidden) openDashboard(); }, 60000);
  }

  function drawDash(D) {
    var T = state.trips || [], I = D.inbox.ok || null, C = I ? I.count : null;
    var names = {}; T.forEach(function (t) { names[t.slug] = t.name; });
    var runs = D.runs.ok || [], reqs = D.revs.ok || [], cms = D.cms.ok || [], queue = D.queue.ok || [];
    var redBy = {}; if (I && I.drafts.ok) I.drafts.ok.forEach(function (x) { redBy[x.city_slug] = x; });

    // ─ Czeka na Ciebie ─
    var todo = [];
    if (I) {
      (I.drafts.ok || []).forEach(function (x) {
        var red = x.red_flags;
        todo.push(todoRow('draft', '#/' + encodeURIComponent(x.city_slug), esc(x.city_name || titleCase(x.city_slug)) + ' v' + esc(x.version) + ' — szkic do akceptacji',
          esc([x.published_version == null ? 'nowa trasa' : 'zmiana opublikowanej v' + x.published_version, x.stops_count ? plForm(+x.stops_count, 'przystanek', 'przystanki', 'przystanków') : '', when(x.created_at)].filter(Boolean).join(' · ')),
          red ? 'bad' : 'warn', red == null ? 'do przejrzenia' : red ? plForm(red, 'czerwona flaga', 'czerwone flagi', 'czerwonych flag') : 'bez czerwonych flag'));
      });
      (I.deploys.ok || []).filter(function (x) { return x.status === 'pending'; }).forEach(function (x) {
        var f = deployFiles(x).map(shortPath);
        todo.push(todoRow('deploy', '#/decyzje', 'Wdrożenie czeka na zgodę', esc(f.slice(0, 3).join(', ') + (f.length > 3 ? ' i ' + (f.length - 3) + ' innych' : '')) + ' · ' + esc(when(x.created_at)), 'warn', 'zgoda'));
      });
      (I.costs.ok || []).filter(function (x) { return x.status === 'pending'; }).forEach(function (x) {
        todo.push(todoRow('cost', '#/decyzje', esc(x.title || 'Zgoda na koszt'), (x.est_usd != null ? 'szacunek ' + esc(usdPl(x.est_usd)) + ' · ' : '') + esc(when(x.created_at)), 'warn', 'zgoda na koszt'));
      });
      var wr = (I.watch.ok && I.watch.ok.ready && I.watch.ok.rows) || [];
      if (wr.length) {
        var wb = {}; wr.forEach(function (r) { wb[r.kind] = (wb[r.kind] || 0) + 1; });
        todo.push(todoRow('watch', '#/straznicy', plForm(wr.length, 'ustalenie strażników', 'ustalenia strażników', 'ustaleń strażników'),
          esc(Object.keys(wb).map(function (k) { return (WKIND[k] || k) + ': ' + wb[k]; }).join(' · ')), 'warn', 'do decyzji'));
      }
      (I.icons.ok || []).forEach(function (x) {
        var late = x.deadline && Date.parse(x.deadline) < Date.now();
        todo.push(todoRow('icon', '#/' + encodeURIComponent(x.trip), esc(names[x.trip] || titleCase(x.trip)) + ' — zdjęcia do ikon',
          esc(plForm(x.stops.length, 'przystanek', 'przystanki', 'przystanków') + ' bez wyboru') + (x.deadline ? ' · ' + (late ? 'termin minął ' : 'automat ruszy ') + esc(when(x.deadline)) : ''),
          late ? 'bad' : 'warn', late ? 'po terminie' : 'termin ' + dayMonth(x.deadline)));
      });
    }
    var revOpen = reqs.filter(function (r) { return r.status !== 'done'; }), revDone = reqs.filter(function (r) { return r.status === 'done'; }).slice(0, Math.max(0, 4 - revOpen.length));
    var revRows = revOpen.concat(revDone).map(function (r) { return revRow(r, cms, names); });
    var errs = I ? ['deploys', 'costs', 'watch', 'drafts', 'icons'].filter(function (k) { return I[k].err; }) : [];

    var h = '<div class="ad-dash">';
    // KPI
    var pub = T.filter(function (t) { return t.published != null; }).length, drafts = T.filter(function (t) { return t.status === 'draft'; }).length;
    var busy = runs.filter(function (r) { return r.status === 'running' || r.status === 'stalled'; }).length + reqs.filter(function (r) { return r.status === 'new' || r.status === 'working'; }).length;
    h += '<section class="ad-kpis" aria-label="Stan projektu">' +
      kpi('#/decyzje', 'Czeka na decyzję', inbox.n == null ? '—' : inbox.n, inbox.n ? 'hot' : '', C ? [C.deploy + ' wdroż.', C.cost + ' koszty', C.watch + ' strażn.', C.icon + ' ikony'].join(' · ') : '') +
      kpi('#/trasy', 'Szkice do akceptacji', drafts, '', T.filter(function (t) { return t.status === 'draft' && t.published == null; }).length + ' nowych tras') +
      kpi('#/pipeline', 'W pracy (Hermes)', busy, '', 'przebiegi i paczki uwag') +
      kpi('#/trasy', 'Trasy opublikowane', pub + '<small> z ' + T.length + '</small>', '', 'na quolino.com') + '</section>';

    h += '<div class="ad-grid">';
    h += '<section class="ad-card ad-card--todo" aria-labelledby="todoH"><header class="ad-card__h"><h2 id="todoH">Czeka na Ciebie</h2>' +
      (todo.length ? '<b class="ad-badge ad-badge--hot">' + todo.length + '</b>' : '') + '<a class="ad-card__more" href="#/decyzje">Wszystkie decyzje →</a></header>';
    if (!I) h += '<p class="ad-note ad-note--err" role="alert">Skrzynka decyzji niedostępna: ' + esc(D.inbox.err) + '</p>';
    else if (todo.length) h += '<ul class="ad-todos">' + todo.join('') + '</ul>';
    else h += '<div class="ad-empty">' + IC.ok + '<p><b>Nic nie czeka na Twoją decyzję.</b> Szkice, wdrożenia, koszty, strażnicy i zdjęcia do ikon — wszystko rozstrzygnięte.</p></div>';
    if (errs.length) h += '<p class="ad-note">Niedostępne źródła: ' + esc(errs.map(function (k) { return { deploys: 'wdrożenia', costs: 'koszty', watch: 'strażnicy', drafts: 'szkice', icons: 'ikony' }[k]; }).join(', ')) + ' — szczegóły w Decyzjach.</p>';
    h += '<h3 class="ad-sub">Uwagi wysłane do poprawki</h3>';
    if (D.revs.err) h += '<p class="ad-note">Stan uwag niedostępny (' + esc(D.revs.err) + ').</p>';
    else h += revRows.length ? '<ul class="ad-todos">' + revRows.join('') + '</ul>' : '<p class="ad-note">Brak wysłanych uwag.</p>';
    h += '</section>';

    // ─ Zdrowie ─
    h += '<div class="ad-health">' + serverCard(I, runs, queue) + watchCard(I) + costCard(D.usage, I) +
      '<a class="ad-card ad-card--link" href="https://stats.quolino.com/" target="_blank" rel="noopener"><span class="ad-card--link__ic">' + IC.ext + '</span>' +
      '<span><b>Statystyki odwiedzin</b><small>stats.quolino.com — otwiera nową kartę</small></span></a></div>';
    h += '</div>';

    // ─ Trasy ─
    var withLangs = T.some(function (t) { return t.langs && t.langs.length; });
    var rows = T.map(function (t) { return { t: t, s: stageOf(t, runs, reqs) }; });
    var ord = { 2: 0, 1: 1, 0: 2, 3: 3, '-1': 4 }, ds = state.dashSort || { k: 'stage', dir: 1 };
    var byDate = function (a, b) { return (Date.parse(b.t.latestAt) || 0) - (Date.parse(a.t.latestAt) || 0); };
    rows.sort(function (a, b) {
      var r = ds.k === 'name' ? a.t.name.localeCompare(b.t.name, 'pl') : ds.k === 'date' ? -byDate(a, b) : ord[a.s.i] - ord[b.s.i];
      return ds.dir * r || byDate(a, b);
    });
    state.dashD = D;
    h += '<section class="ad-card ad-card--trips" aria-labelledby="tripsH"><header class="ad-card__h"><h2 id="tripsH">Trasy</h2><b class="ad-badge">' + T.length + '</b>' +
      '<a class="ad-card__more" href="#/trasy">Lista z filtrami →</a></header>';
    if (!state.trips) h += '<p class="ad-note ad-note--err" role="alert">Nie mogę wczytać tras z API admina. Podgląd na danych testowych: <a href="?demo=1">?demo=1</a>.</p>';
    else if (!T.length) h += '<p class="ad-note">Brak tras w bazie.</p>';
    else {
      h += '<div class="ad-table' + (withLangs ? ' ad-table--langs' : '') + '" role="table" aria-label="Trasy i ich etap"><div class="ad-tr ad-tr--h" role="row">' +
        ['Trasa', 'Etap', 'Wersja', 'Zmiana', 'Flagi i uwagi'].concat(withLangs ? ['Języki'] : []).concat(['Akcje']).map(function (x) {
          var k = { Trasa: 'name', Etap: 'stage', Zmiana: 'date' }[x], on = k && ds.k === k;
          return '<span role="columnheader"' + (on ? ' aria-sort="' + (ds.dir > 0 ? 'ascending' : 'descending') + '"' : '') + (x === 'Zmiana' ? ' class="ad-td--date"' : '') + '>' +
            (k ? '<button type="button" class="ad-sort" data-dsort="' + k + '">' + x + (on ? (ds.dir > 0 ? ' ↑' : ' ↓') : '') + '</button>' : x) + '</span>';
        }).join('') + '</div>' +
        rows.map(function (x) { return tripRow(x.t, x.s, redBy[x.t.slug], withLangs); }).join('') + '</div>';
    }
    h += '</section></div>';
    $d.innerHTML = h;
  }
  $d.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-dsort]'); if (!b || !state.dashD) return;
    var k = b.getAttribute('data-dsort'), ds = state.dashSort || { k: 'stage', dir: 1 };
    state.dashSort = { k: k, dir: ds.k === k ? -ds.dir : 1 };
    drawDash(state.dashD);
    var nb = $d.querySelector('[data-dsort="' + k + '"]'); if (nb) nb.focus();
  });
  function kpi(href, label, val, tone, cap) {
    return '<a class="ad-kpi' + (tone ? ' ad-kpi--' + tone : '') + '" href="' + href + '"><span class="ad-kpi__l">' + esc(label) + '</span><b class="ad-kpi__v">' + val + '</b>' +
      (cap ? '<span class="ad-kpi__c">' + esc(cap) + '</span>' : '') + '</a>';
  }
  function tripRow(t, s, dr, withLangs) {
    var flags = [];
    if (dr && dr.red_flags) flags.push('<span class="ad-flag ad-flag--bad">' + IC.bad + plForm(dr.red_flags, 'czerwona', 'czerwone', 'czerwonych') + '</span>');
    else if (dr && dr.red_flags === 0) flags.push('<span class="ad-flag ad-flag--ok">' + IC.ok + 'bez czerwonych</span>');
    if (dr && dr.warnings) flags.push('<span class="ad-flag">' + plForm(+dr.warnings, 'ostrzeżenie', 'ostrzeżenia', 'ostrzeżeń') + '</span>');
    if (t.working) flags.push('<span class="ad-flag ad-flag--info">Hermes poprawia: ' + t.working + '</span>');
    if (t.unsent) flags.push('<span class="ad-flag ad-flag--warn">niewysłane: ' + t.unsent + '</span>');
    var ver = t.draft != null ? 'v' + t.draft + (t.published != null ? ' <small>na stronie v' + esc(t.published) + '</small>' : '') : 'v' + esc(t.latest);
    return '<div class="ad-tr" role="row"><span role="cell" class="ad-td ad-td--name"><span class="ad-team" style="--team:' + esc(t.color) + '" aria-hidden="true"></span>' +
      '<a href="#/' + encodeURIComponent(t.slug) + '"><b>' + esc(t.name) + '</b></a><small>' + esc([countryName(t.country), t.region ? regionName(t.region) : ''].filter(Boolean).join(' · ')) + '</small></span>' +
      '<span role="cell" class="ad-td" data-l="Etap">' + stageHtml(s) + '</span>' +
      '<span role="cell" class="ad-td ad-td--ver" data-l="Wersja">' + ver + '</span>' +
      '<span role="cell" class="ad-td ad-td--date" data-l="Zmiana">' + esc(when(t.latestAt)) + '</span>' +
      '<span role="cell" class="ad-td ad-td--flags' + (flags.length ? '' : ' is-empty') + '" data-l="Flagi i uwagi">' + (flags.length ? flags.join('') : '<span class="ad-muted">—</span>') + '</span>' +
      (withLangs ? '<span role="cell" class="ad-td ad-td--langs" data-l="Języki">' + (t.langs && t.langs.length ? '<span title="' + esc(t.langs.join(', ')) + '">' + t.langs.length + ' · ' + esc(t.langs.slice(0, 5).join(' ')) + (t.langs.length > 5 ? '…' : '') + '</span>' : '—') + '</span>' : '') +
      '<span role="cell" class="ad-td ad-td--acts"><a class="ad-btn" href="#/' + encodeURIComponent(t.slug) + '">' + (s.i === 2 ? 'Przejrzyj' : 'Otwórz') + '<span class="adm-sr"> ' + esc(t.name) + '</span></a>' +
      (t.published != null ? '<a class="ad-btn ad-btn--ghost ad-btn--ic" href="' + SITE + '/city.html?c=' + encodeURIComponent(t.slug) + '" target="_blank" rel="noopener" title="Na stronie (nowa karta)">' + IC.ext + '<span class="adm-sr">' + esc(t.name) + ' na stronie (nowa karta)</span></a>' : '') + '</span></div>';
  }
  function hRow(label, val, tone) { return '<li class="ad-hrow"><span class="ad-hrow__l">' + esc(label) + '</span><span class="ad-hrow__v">' + (tone ? stChip(tone, val) : esc(val)) + '</span></li>'; }
  function serverCard(I, runs, queue) {
    var dep = snap('deploy'), cron = snap('cron'), q = snap('queue'), rows = [];
    var lastDep = null;
    if (dep && dep.last_message) {
      var msg = String(dep.last_message).split('\n').filter(function (l) { return l && !/^\d{4}-\d\d-\d\d \d/.test(l); })[0] || '';
      lastDep = { at: dep.last_message_at, bad: /❌|błąd|failed/i.test(msg), txt: msg.replace(/^[✅❌⏳]\s*/, '').slice(0, 120) };
    } else if (I && I.hist.ok && I.hist.ok.length) {
      var x = I.hist.ok.filter(function (r) { return r.status === 'done' || r.status === 'failed'; })[0];
      if (x) lastDep = { at: x.finished_at || x.decided_at, bad: x.status === 'failed', txt: deployFiles(x).map(shortPath).join(', ') };
    }
    rows.push(lastDep ? hRow('Ostatnie wdrożenie', (lastDep.bad ? 'błąd · ' : '') + ago(lastDep.at), lastDep.bad ? 'bad' : 'ok') : hRow('Ostatnie wdrożenie', '—'));
    if (I && I.count) rows.push(hRow('Wdrożenia czekające na zgodę', String(I.count.deploy), I.count.deploy ? 'warn' : 'ok'));
    var act = runs.filter(function (r) { return r.status === 'running'; }).length, stl = runs.filter(function (r) { return r.status === 'stalled'; }).length;
    var qd = queue.filter(function (j) { return j.status === 'queued'; }).length + (q && Array.isArray(q.open) ? q.open.length : 0);
    rows.push(hRow('Kolejka tras', (act ? act + ' w pracy' : 'nic nie pracuje') + (qd ? ' · ' + qd + ' czeka' : ''), stl ? 'bad' : act ? 'wait' : 'ok'));
    if (stl) rows.push(hRow('Zatrzymane przebiegi', plForm(stl, 'stoi', 'stoją', 'stoi') + ' ≥ 15 min', 'bad'));
    if (cron) {
      var age = cron.last_run ? (Date.now() - Date.parse(cron.last_run)) / 60000 : null;
      rows.push(hRow('Cron (kolejka)', cron.last_run ? 'przebiegł ' + ago(cron.last_run) : '—', age == null ? null : age > 30 ? 'bad' : 'ok'));
      var locks = ['gemini_queue_lock', 'repo_jobs_lock', 'watch_lock'].filter(function (k) { return cron[k]; });
      if (locks.length) rows.push(hRow('Blokady', locks.map(function (k) { return k.replace(/_lock$/, '').replace(/_/g, ' '); }).join(', '), 'wait'));
    }
    if (q) {
      if (Array.isArray(q.failed_7d) && q.failed_7d.length) rows.push(hRow('Zlecenia z błędem (7 dni)', String(q.failed_7d.length), 'bad'));
      if (q.agyQuotaOut && Date.parse(q.agyQuotaOut) > Date.now()) rows.push(hRow('Limit Antigravity', 'wyczerpany do ' + when(q.agyQuotaOut), 'warn'));
    }
    return '<section class="ad-card ad-card--h" aria-labelledby="srvH"><header class="ad-card__h"><h2 id="srvH">Serwer</h2><a class="ad-card__more" href="#/pipeline">Pipeline →</a></header>' +
      '<ul class="ad-hrows">' + rows.join('') + '</ul>' +
      (window.AdminPipeline ? window.AdminPipeline.miniHtml(runs, queue, state.trips, state.dashD && state.dashD.revs && state.dashD.revs.ok) : '') +
      (lastDep && lastDep.txt ? '<p class="ad-note">' + esc(lastDep.txt) + '</p>' : '') +
      (cron ? '' : '<p class="ad-note">Cron i blokady pojawią się, gdy panel dostanie podgląd serwera (<code>ops_status</code> w schemacie admin).</p>') + '</section>';
  }
  function watchCard(I) {
    var w = I && I.watch.ok, rows = [], body;
    if (!I || I.watch.err) body = '<p class="ad-note">Strażnicy niedostępni' + (I && I.watch.err ? ' (' + esc(I.watch.err) + ')' : '') + '.</p>';
    else if (!w || !w.ready) body = '<p class="ad-note">Strażnicy jeszcze nie działają (SQL 2026-10-30-straznicy.sql).</p>';
    else {
      var by = {}; (w.rows || []).forEach(function (r) { by[r.kind] = (by[r.kind] || 0) + 1; });
      var ks = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; });
      rows.push(hRow('Otwarte ustalenia', String((w.rows || []).length), (w.rows || []).length ? 'warn' : 'ok'));
      ks.forEach(function (k) { rows.push(hRow(WKIND[k] || k, String(by[k]))); });
      var st = snap('watch'), last = st && st.state && st.state.last, newest = null;
      if (last) Object.keys(last).forEach(function (k) { var a = last[k] && last[k].at; if (a && (!newest || a > newest)) newest = a; });
      if (newest) rows.push(hRow('Ostatni przebieg', ago(newest), (Date.now() - Date.parse(newest)) / 3600000 > 30 ? 'bad' : 'ok'));
      body = '<ul class="ad-hrows">' + rows.join('') + '</ul>';
    }
    return '<section class="ad-card ad-card--h" aria-labelledby="wH"><header class="ad-card__h"><h2 id="wH">Strażnicy</h2><a class="ad-card__more" href="#/straznicy">Ustalenia →</a></header>' + body + '</section>';
  }
  function costCard(U, I) {
    var body = '';
    if (U.err) body += '<p class="ad-note">Dziennik kosztów niedostępny (' + esc(U.err) + ').</p>';
    else {
      var today = new Date().toISOString().slice(0, 10), d = zero(), w = zero();
      (U.ok || []).forEach(function (r) { add(w, r); if (r.day === today) add(d, r); });
      var days = [], per = {}, mx = 0, DN = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];
      for (var di = 6; di >= 0; di--) days.push(new Date(Date.now() - di * 864e5).toISOString().slice(0, 10));
      (U.ok || []).forEach(function (r) { per[r.day] = (per[r.day] || 0) + (+r.usd_equiv || 0) + (+r.usd || 0) * 0; });
      days.forEach(function (x) { mx = Math.max(mx, per[x] || 0); });
      body += '<p class="ad-sub" style="margin-top:0">Ekwiwalent cennika API, ostatnie 7 dni</p><div class="ad-chart" role="img" aria-label="' + esc(days.map(function (x) { return x.slice(5) + ': ' + usd(per[x] || 0); }).join(', ')) + '">' +
        days.map(function (x) { return '<span style="height:' + (mx ? Math.max(2, Math.round((per[x] || 0) / mx * 100)) : 2) + '%" title="' + esc(x + ': ' + usd(per[x] || 0)) + '"></span>'; }).join('') + '</div>' +
        '<div class="ad-chart__x" aria-hidden="true">' + days.map(function (x) { return '<span>' + DN[new Date(x + 'T12:00:00').getDay()] + '</span>'; }).join('') + '</div>';
      body += '<dl class="ad-cost"><div><dt>Dziś</dt><dd>' + usd(d.usd) + '</dd><p>ekw. ' + usd(d.eq) + ' · ' + tok(d.tok) + ' tok.</p></div>' +
        '<div><dt>7 dni</dt><dd>' + usd(w.usd) + '</dd><p>ekw. ' + usd(w.eq) + ' · ' + tok(w.tok) + ' tok.</p></div></dl>';
    }
    var b = I && I.budget.ok && I.budget.ok[0];
    if (b) {
      var used = +b.usd_api || 0, cap = +b.budget_usd || 0, pct = cap ? Math.min(100, Math.round(used / cap * 100)) : 0;
      var tone = cap && used >= cap ? 'bad' : pct >= 70 ? 'warn' : 'ok';
      body += '<p class="ad-budget__t">Budżet miesiąca: <b>' + usdPl(used) + '</b> z ' + usdPl(cap) + ' (' + pct + '%)</p>' +
        '<div class="dec-bar dec-bar--' + tone + '" role="img" aria-label="Zużyto ' + pct + '% progu miesięcznego"><span style="width:' + pct + '%"></span></div>';
    }
    body += '<p class="ad-note">„Zapłacone” to płatne API; abonamenty (Claude, AI Pro) liczą się jako ekwiwalent.</p>';
    return '<section class="ad-card ad-card--h" aria-labelledby="cH"><header class="ad-card__h"><h2 id="cH">Koszty AI</h2><a class="ad-card__more" href="#/koszty">Szczegóły →</a></header>' + body + '</section>';
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
      var html = '<article class="adm-sheet adm-kb"><header class="adm-sheet__head"><div><p class="label" style="color:inherit;opacity:.8">Baza wiedzy redakcji</p>' +
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

  // ── rozszerzenia (admin-pipeline.js, admin-map.js — ładowane przed tym plikiem): wspólne narzędzia panelu, bez kopiowania kodu ──
  window.AdminHost = { api: api, state: state, DEMO: DEMO, SITE: SITE, $d: $d, esc: esc, when: when, ago: ago, dur: dur, tok: tok, usd: usd, plForm: plForm, num: num,
    titleCase: titleCase, countryName: countryName, regionName: regionName, icon: icon, trOf: trOf, stopKey: stopKey, routeUrl: routeUrl, setHead: setHead, showDetail: showDetail,
    loadingHtml: loadingHtml, stChip: stChip, IC: IC, loadOps: loadOps, ops: ops, demoCosts: demoCosts, loadInbox: loadInbox, route: route,
    enter: function (key, title) { state.current = null; state.trip = null; state.versions = null; state.tabVersion = null; clearInterval(state.poll); $d.onclick = null; $d.onsubmit = null; $d.onchange = null; setHead(key, title); showDetail(); window.scrollTo(0, 0); },
    setPoll: function (fn, ms) { clearInterval(state.poll); state.poll = setInterval(fn, ms); } };

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
  // ── haki dla modułów panelu (admin-preview.js, admin-palette.js; JP 2026-10-31): odczyt stanu i istniejące funkcje, nic więcej ──
  function emit(name, detail) { try { document.dispatchEvent(new CustomEvent(name, { detail: detail || {} })); } catch (e) { /* stare przeglądarki */ } }
  window.ADM = { state: state, inbox: inbox, DEMO: DEMO, SITE: SITE, api: api, esc: esc, fold: fold, countryName: countryName, regionName: regionName, titleCase: titleCase,
    VST: VST, vlab: vlab, num: num, qaId: qaId, cmpOptions: cmpOptions, showTab: showTab, rerender: rerender, walk: walk, walkOpen: walkOpen, walkClose: walkClose, walkShow: walkShow,
    drawerOpen: drawerOpen, viewApply: viewApply, recOpen: recOpen, loadInbox: loadInbox, loadTrips: loadTrips };
  var tripsReady = loadTrips();
  route();
  loadRules();
  if (location.hash !== '#/decyzje') (tripsReady && tripsReady.then ? tripsReady : Promise.resolve()).then(function () { return loadInbox(); }).catch(function () { /* licznik pomocniczy */ });
})();
