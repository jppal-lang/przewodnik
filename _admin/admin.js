/* Quolino admin — kolejka szkiców wycieczek do zatwierdzenia.
 *
 * Dostęp: tunel SSH (http://localhost:8088/_admin/) albo jednorazowy link z kluczem — patrz _admin/README.md.
 *   panel → /api/ → PostgREST z rolą quolino_admin (schemat admin)
 * ?demo=1 — dane testowe z demo.json, nic nie trafia do bazy.
 *
 * v3 (2026-10-16): arkusz szkicu pokazuje WSZYSTKIE pola; przy każdym polu formularz uwag dla Hermesa
 * (tabela admin.draft_comments — kontrakt w README §Uwagi), wersje każdego przystanku liczone z historii
 * city_versions, przyklejone menu przystanków z liczbą otwartych uwag.
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

  var state = { queue: [], demo: null, current: null, comments: [], ctx: null, poll: null };
  var $q = document.getElementById('queue');
  var $d = document.getElementById('detail');
  var $count = document.getElementById('count');

  var DEMO_RULES = [
    { id: 1, rule: 'Misja dla dziecka zaczyna się od czasownika i da się ją wykonać bez kupowania biletu.', why: 'Uwaga JP do Perugii: misja wymagała wejścia do muzeum.', scope: 'quest', field: 'stop.kids_box', status: 'proposed', proposed_by: 'hermes', uses: 0, source_comment_ids: [3, 7], created_at: '2026-10-17T09:00:00Z' },
    { id: 2, rule: 'Nie podajemy cen ani godzin bez źródła — wtedy „sprawdź na miejscu”.', scope: 'fakty', status: 'active', proposed_by: 'jp', uses: 12, source_comment_ids: [], created_at: '2026-10-10T09:00:00Z' }
  ];

  // ── dane ─────────────────────────────────────────────
  function api(path, opts) {
    if (DEMO) return demo(path, opts);
    opts = opts || {};
    return fetch(API + path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Prefer': 'return=representation' },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null;
        try { j = t ? JSON.parse(t) : null; } catch (e) { throw new Error('API nie odpowiada (HTTP ' + r.status + ', brak JSON)'); }
        if (!r.ok) throw new Error((j && (j.message || j.hint)) || ('HTTP ' + r.status));
        return j;
      });
    });
  }

  function demo(path, opts) {
    var load = state.demo ? Promise.resolve(state.demo) : fetch('demo.json').then(function (r) { return r.json(); }).then(function (d) {
      d.comments = d.comments || [
        { id: 1, city_slug: 'spello', city_version: 1, stop_key: 'porta-consolare', field: 'kids_box', field_label: 'Misja dla dzieci', stop_version: 1,
          body: 'Misja za trudna dla 6-latka — uprość liczenie.', status: 'done', hermes_reply: 'Uproszczone w v2: liczymy tylko posągi nad bramą.', created_at: '2026-10-06T18:20:00Z' },
        { id: 2, city_slug: 'spello', city_version: 2, stop_key: 'belvedere-panoramico', field: 'time_label', field_label: 'Godzina', stop_version: 2,
          body: 'Zachód słońca w październiku ok. 18:30 — przesuń na 17:45.', status: 'seen', hermes_reply: null, created_at: '2026-10-16T09:02:00Z' }
      ];
      state.demo = d; return d;
    });
    return load.then(function (d) {
      if (path === '/admin_queue') return d.queue.slice();
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

  // ── kolejka ──────────────────────────────────────────
  function loadQueue(selectFirst) {
    return api('/admin_queue').then(function (rows) {
      state.queue = rows || [];
      $count.textContent = state.queue.length;
      if (!state.queue.length) {
        $q.innerHTML = '<p class="adm-empty">Nic nie czeka. Wszystkie szkice są rozpatrzone.</p>';
        return;
      }
      $q.innerHTML = state.queue.map(function (it, i) {
        var delta = it.published_stops_count == null ? it.stops_count + ' przyst.' : (it.stops_count === it.published_stops_count ? it.stops_count + ' przyst.' :
          it.published_stops_count + '→' + it.stops_count + ' przyst.');
        return '<button class="adm-item" type="button" data-i="' + i + '" style="--team:' + esc(it.bandana_color || '#0B4EA2') + '"' + (it.note ? ' title="' + esc(it.note) + '"' : '') + '>' +
          '<span class="adm-item__team" aria-hidden="true"></span><span class="adm-item__body">' +
          '<span class="adm-item__top"><span class="adm-item__name">' + esc(it.city_name || it.city_slug) + '</span><span class="adm-item__ver">v' + it.version + '</span></span>' +
          '<span class="adm-item__meta">' + (it.published_version == null ? '<span class="adm-chip adm-chip--new">nowa</span>' : '<span class="adm-chip adm-chip--chg">zmiana</span>') +
          '<span>' + esc(delta) + '</span><span>' + esc(when(it.created_at)) + '</span></span></span></button>';
      }).join('');
      if (selectFirst) open(0);
    }).catch(function (e) {
      $count.textContent = '!';
      $q.innerHTML = '<p class="adm-empty">Nie mogę połączyć się z API admina (' + esc(e.message) + ').<br><br>' +
        'Instrukcja wejścia w <code>_admin/README.md</code>. Podgląd na danych testowych: <a href="?demo=1">?demo=1</a>.</p>';
      $d.innerHTML = '';
    });
  }

  $q.addEventListener('click', function (e) {
    var b = e.target.closest('.adm-item');
    if (b) open(+b.getAttribute('data-i'));
  });

  // ── szczegóły ────────────────────────────────────────
  function open(i) {
    var it = state.queue[i];
    if (!it) return;
    state.current = it;
    clearInterval(state.poll);
    [].forEach.call($q.querySelectorAll('.adm-item'), function (b) { b.setAttribute('aria-current', b.getAttribute('data-i') === String(i) ? 'true' : 'false'); });
    $d.innerHTML = '<div class="adm-placeholder"><p>Ładuję v' + it.version + ' · ' + esc(it.city_name || it.city_slug) + '…</p></div>';
    var slugQ = encodeURIComponent(it.city_slug);
    Promise.all([
      api('/admin_versions?city_slug=eq.' + slugQ + '&select=city_slug,version,status,source,note,created_at,content&order=version.asc'),
      loadComments(it.city_slug)
    ]).then(function (res) {
      var all = (res[0] || []).slice().sort(function (a, b) { return a.version - b.version; });
      var draft = null, pub = null;
      all.forEach(function (r) { if (r.version === it.version) draft = r.content; if (r.version === it.published_version) pub = r.content; });
      if (!draft) throw new Error('brak treści szkicu');
      render(it, draft, pub, all);
      flushOutbox();
      state.poll = setInterval(function () { if (!document.hidden) refreshComments(); }, 30000);
      if (window.matchMedia('(max-width:900px)').matches) $d.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }).catch(function (e) { $d.innerHTML = '<div class="adm-placeholder"><p>Nie udało się wczytać szkicu: ' + esc(e.message) + '</p></div>'; });
  }

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
  function commentsFor(stop, field) {
    return state.comments.filter(function (c) { return ck(c.stop_key, c.field) === ck(stop, field); });
  }
  function isOpen(c) { return c.status === 'new' || c.status === 'sent' || c.status === 'seen' || c.status === 'local'; }
  function unsent() { return state.comments.filter(function (c) { return c.status === 'new' || c.status === 'local'; }); }

  function commentItem(c) {
    var cur = state.current, other = cur && c.city_version !== cur.version;
    return '<li class="adm-cm__it adm-cm__it--' + esc(c.status) + '"><p>' + esc(c.body) + '</p>' +
      '<span class="adm-cm__meta"><span class="adm-cm__st">' + esc(CST[c.status] || c.status) + '</span>' +
      (other ? '<span>do v' + esc(c.city_version) + '</span>' : '') + '<span>' + esc(when(c.created_at)) + '</span></span>' +
      (c.hermes_reply ? '<p class="adm-cm__reply"><b>Hermes:</b> ' + esc(c.hermes_reply) + (c.resolved_in_version ? ' <span class="adm-cm__meta">→ v' + esc(c.resolved_in_version) + '</span>' : '') + '</p>' : '') + '</li>';
  }
  function commentBox(stop, field, label, stopVer) {
    var list = commentsFor(stop, field);
    return '<div class="adm-cm" data-stop="' + esc(stop || '') + '" data-field="' + esc(field || '') + '" data-label="' + esc(label) + '"' + (stopVer ? ' data-sv="' + stopVer + '"' : '') + '>' +
      '<ul class="adm-cm__list">' + list.map(commentItem).join('') + '</ul>' +
      '<form class="adm-cm__form" autocomplete="off"><textarea rows="1" aria-label="Uwaga do pola ' + esc(label) + '" placeholder="Uwaga dla Hermesa…"></textarea>' +
      '<button type="submit" class="adm-cm__send" aria-label="Zapisz uwagę" title="Zapisz uwagę (Enter)">' + SEND + '</button></form></div>';
  }
  function updateCommentUi() {
    [].forEach.call($d.querySelectorAll('.adm-cm'), function (box) {
      var list = commentsFor(box.getAttribute('data-stop') || null, box.getAttribute('data-field') || null);
      box.querySelector('.adm-cm__list').innerHTML = list.map(commentItem).join('');
    });
    updateCounts();
  }
  function updateCounts() {
    var openBy = {}, doneBy = {}, total = 0;
    state.comments.forEach(function (c) {
      var k = c.stop_key || '_city';
      if (isOpen(c)) { openBy[k] = (openBy[k] || 0) + 1; total++; } else doneBy[k] = (doneBy[k] || 0) + 1;
    });
    [].forEach.call(document.querySelectorAll('[data-count]'), function (el) {
      var k = el.getAttribute('data-count'), n = k === '_all' ? total : (openBy[k] || 0), dn = doneBy[k] || 0;
      el.textContent = n;
      el.classList.toggle('is-zero', !n);
      el.title = n + ' otwartych uwag' + (dn ? ', ' + dn + ' załatwionych' : '');
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
      var where = (c.stop_key ? (stopName(c.stop_key) || c.stop_key) : 'Opis miasta') + ' · ' + (c.field_label || 'całość');
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
  function sendAll(btn) {
    var it = state.current, n = unsent().length;
    if (!it || !n) return;
    [].forEach.call(document.querySelectorAll('[data-send]'), function (b) { b.disabled = true; b.classList.add('is-busy'); b.textContent = 'Wysyłam…'; });
    var $m = document.getElementById('sendMsg');
    var NOT_READY = 'Uwagi są bezpieczne w tej przeglądarce, ale baza jeszcze ich nie przyjmuje (brak zatwierdzonego SQL). ' +
      'W konsoli: sh /root/quolino-web/ops/deploy.sh pending, potem approve z najnowszym hashem — i kliknij jeszcze raz.';
    flushOutbox().then(function (left) {
      if (left) { var e = new Error('not_ready'); e.notReady = true; throw e; }
      return api('/rpc/admin_send_comments', { method: 'POST', body: { p_slug: it.city_slug, p_version: it.version } });
    }).then(function (r) {
      if ($m) { $m.className = 'adm-msg adm-msg--ok'; $m.textContent = 'Wysłane: ' + plUwagi((r && r.sent) || n) + '. Hermes przygotuje nową wersję szkicu i odpisze przy polach.'; }
      return loadComments(it.city_slug);
    }).catch(function (e) {
      var nr = e.notReady || /admin_send_comments|draft_comments|does not exist|not find|schema cache/i.test(e.message);
      if ($m) { $m.className = 'adm-msg adm-msg--err'; $m.textContent = nr ? NOT_READY : 'Nie wysłano: ' + e.message; }
    }).then(function () {
      [].forEach.call(document.querySelectorAll('[data-send]'), function (b) { b.classList.remove('is-busy'); });
      updateCommentUi();
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
  function flushOutbox() {
    if (DEMO) return Promise.resolve(0);
    var box = lsGet(OUTBOX) || [];
    if (!box.length) return Promise.resolve(0);
    var keep = [], err = '';
    return box.reduce(function (p, c) {
      return p.then(function () {
        var body = Object.assign({}, c); delete body.local_id; delete body.created_at;
        return api('/draft_comments', { method: 'POST', body: body }).catch(function (e) { keep.push(c); err = e.message; });
      });
    }, Promise.resolve()).then(function () {
      lsSet(OUTBOX, keep);
      if (keep.length < box.length) return loadComments(state.current ? state.current.city_slug : '').then(function () { return keep.length; });
      state.outboxErr = err;
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
      '<p class="label" style="color:inherit;opacity:.8">' + esc(it.city_slug) + ' · szkic v' + it.version + (it.published_version != null ? ' zamiast v' + it.published_version : ' · pierwsza publikacja') + '</p>' +
      '<h2 class="adm-sheet__title">' + esc(title) + '</h2>' +
      (it.note ? '<p class="adm-sheet__sub">' + esc(it.note) + '</p>' : '') + '</div>' +
      '<div class="adm-sheet__acts">' +
      (route ? '<a class="qc-btn qc-btn--sm adm-route" href="' + esc(route) + '" target="_blank" rel="noopener">' + PIN + ' Cała trasa w Google Maps</a>' : '') +
      '<span class="adm-chip">' + esc(SRC[it.source] || it.source) + ' · ' + esc(when(it.created_at)) + '</span></div></header>';

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

    html += '<section class="adm-sheet__sec adm-send" id="send"><h3>Uwagi do wysłania</h3>' +
      '<p class="adm-send__sub">Uwagi zapisane przy polach. Hermes zaczyna poprawki dopiero po kliknięciu przycisku — wszystkie naraz, w jednej nowej wersji szkicu.</p>' +
      '<div id="sendList">' + sendList() + '</div>' +
      '<div class="adm-send__row"><button type="button" class="qc-btn adm-btn-send" data-send>Wyślij uwagi do poprawki</button>' +
      '<span class="adm-msg" id="sendMsg" role="status"></span></div><p class="adm-send__hint" id="sendHint"></p></section>';

    html += '<form class="adm-decide" id="decide" autocomplete="off">' +
      '<label for="note">Notatka do historii wersji (opcjonalnie)</label>' +
      '<textarea id="note" name="note" rows="1" placeholder="Notatka do wersji (opcjonalnie)"></textarea>' +
      '<div class="adm-decide__row">' +
      '<button type="button" class="qc-btn adm-btn-ok" data-act="approve"' + (newStops.length ? '' : ' disabled data-lock title="Szkic bez przystanków nie może trafić na stronę"') + '>Zatwierdź i opublikuj</button>' +
      '<button type="button" class="qc-btn adm-btn-no" data-act="reject">Odrzuć szkic</button>' +
      '<span class="adm-msg" id="msg" role="status"></span></div></form></article>';

    // przyklejone menu przystanków z licznikami uwag
    var toc = '<nav class="adm-toc" aria-label="Przystanki szkicu"><p class="adm-toc__h">Uwagi <b class="adm-n" data-count="_all">0</b></p><ol>' +
      '<li><a href="#st-_city" data-to="_city"><span class="adm-toc__no">★</span><span class="adm-toc__nm">Opis miasta</span><b class="adm-n" data-count="_city">0</b></a></li>' +
      stops.map(function (x) {
        return '<li class="adm-toc__' + x.kind + '"><a href="#st-' + esc(x.key) + '" data-to="' + esc(x.key) + '"><span class="adm-toc__no">' + num(x.s.stop_number) + '</span>' +
          '<span class="adm-toc__nm">' + esc(x.t.name || '(bez nazwy)') + '</span><b class="adm-n" data-count="' + esc(x.key) + '">0</b></a></li>';
      }).join('') + '</ol><div class="adm-toc__send"><button type="button" class="qc-btn adm-btn-send" data-send>Wyślij uwagi do poprawki</button>' +
      '<a href="#send" class="adm-toc__all">Lista uwag ↓</a></div></nav>';

    $d.innerHTML = '<div class="adm-split">' + html + toc + '</div>';
    drawMap(newStops, draft.stop_translations);
    updateCounts();
    spy();
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
      STOP_FIELDS.map(function (f) { return cell(f[1], x.o ? x.o[f[0]] : null, s[f[0]], f[2], hasOld, commentBox(x.key, 'stop.' + f[0], f[1], ver)); }).join('');
    return '<section class="adm-stopx adm-anchor" data-kind="' + x.kind + '" id="st-' + esc(x.key) + '" data-spy="' + esc(x.key) + '">' + head +
      '<div class="adm-rows">' + rows + '</div></section>';
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
        '</p></div></div>';
      loadQueue(false);
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
    state.current = null; clearInterval(state.poll);
    [].forEach.call($q.querySelectorAll('.adm-item'), function (b) { b.setAttribute('aria-current', 'false'); });
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
  if ($kb) $kb.addEventListener('click', openRules);
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
  loadQueue(!window.matchMedia('(max-width:900px)').matches);
  loadRules();
})();
