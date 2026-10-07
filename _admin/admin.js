/* Quolino admin — kolejka szkiców wycieczek do zatwierdzenia.
 *
 * Działa wyłącznie przez tunel SSH do VPS (patrz _admin/README.md):
 *   http://localhost:8088/_admin/  →  nginx admina  →  /api/  →  PostgREST z rolą quolino_admin
 * Publicznie katalog _admin/ nie jest serwowany (nginx i GitHub Pages pomijają ścieżki od „_”).
 * ?demo=1 — dane testowe z demo.json, przyciski nic nie zapisują.
 */
(function () {
  'use strict';

  var API = '/api';
  var DEMO = /[?&]demo=1\b/.test(location.search);
  var ICONS = '../media/icons/';
  var QUE = { parking: 'parking', monument: 'monument', church: 'church', museum: 'museum', house: 'house',
    viewpoint: 'viewpoint-city', 'viewpoint-city': 'viewpoint-city', 'viewpoint-nature': 'viewpoint-nature',
    restaurant: 'restaurant', icecream: 'icecream', sweets: 'sweets', photo: 'photo', street: 'street',
    castle: 'castle', synagogue: 'synagogue' };
  var SRC = { manual: 'ręcznie', import: 'import', pipeline: 'Hermes', restore: 'przywrócenie', migration: 'migracja' };
  var DUR = { half_day: 'pół dnia', full_day: 'cały dzień' };

  // pola porównywane (etykiety po polsku, bo panel jest dla redakcji)
  var CITY_FIELDS = [['duration_type', 'Czas', durLabel], ['duration_hours', 'Godziny'], ['bandana_color', 'Kolor drużyny'],
    ['hero_image', 'Grafika hero'], ['route_url', 'Trasa (link)'], ['travel_mode', 'Tryb trasy'], ['region_slug', 'Region']];
  var CITY_TR = [['title', 'Tytuł'], ['subtitle', 'Podtytuł'], ['lead', 'Wstęp'], ['good_to_know', 'Dobrze wiedzieć'], ['local_food', 'Lokalne jedzenie']];
  var STOP_FIELDS = [['stop_number', 'Numer'], ['category', 'Kategoria'], ['time_label', 'Godzina'], ['visit_duration', 'Czas zwiedzania', minLabel],
    ['price', 'Cena'], ['year_built', 'Rok'], ['maps_query', 'Mapa'], ['optional', 'Opcjonalny', yesNo], ['sunset_spot', 'Na zachód słońca', yesNo]];
  var STOP_TR = [['name', 'Nazwa'], ['desc_paragraphs', 'Opis'], ['kids_box', 'Misja dla dzieci'], ['hint', 'Podpowiedź'], ['local_flavor', 'Ciekawostka']];

  var state = { queue: [], demo: null, current: null };
  var $q = document.getElementById('queue');
  var $d = document.getElementById('detail');
  var $count = document.getElementById('count');

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
    var load = state.demo ? Promise.resolve(state.demo) : fetch('demo.json').then(function (r) { return r.json(); }).then(function (d) { state.demo = d; return d; });
    return load.then(function (d) {
      if (path === '/admin_queue') return d.queue.slice();
      var m = path.match(/^\/admin_versions\?city_slug=eq\.([^&]+)&version=in\.\(([^)]*)\)/);
      if (m) {
        var vs = m[2].split(',').map(Number);
        return d.versions.filter(function (v) { return v.city_slug === m[1] && vs.indexOf(v.version) > -1; });
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
  function same(a, b) { return JSON.stringify(a == null || a === '' ? null : a) === JSON.stringify(b == null || b === '' ? null : b); }
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
  var CHEV = '<svg class="adm-chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';

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
        var delta = it.published_stops_count == null ? 'nowa wycieczka' : (it.stops_count - it.published_stops_count === 0 ? it.stops_count + ' przystanków' :
          it.published_stops_count + ' → ' + it.stops_count + ' przystanków');
        return '<button class="adm-item" type="button" data-i="' + i + '" style="--team:' + esc(it.bandana_color || '#0B4EA2') + '">' +
          '<span class="adm-item__team" aria-hidden="true"></span><span class="adm-item__body">' +
          '<span class="adm-item__top"><span class="adm-item__name">' + esc(it.city_name || it.city_slug) + '</span><span class="adm-item__ver">v' + it.version + '</span></span>' +
          (it.note ? '<span class="adm-item__note">' + esc(it.note) + '</span>' : '') +
          '<span class="adm-item__meta"><span class="adm-chip' + (it.source === 'pipeline' ? ' adm-chip--src-pipeline' : '') + '">' + esc(SRC[it.source] || it.source) + '</span>' +
          (it.published_version == null ? '<span class="adm-chip adm-chip--new">nowa</span>' : '') +
          '<span>' + esc(delta) + '</span><span>' + esc(when(it.created_at)) + '</span></span></span></button>';
      }).join('');
      if (selectFirst) open(0);
    }).catch(function (e) {
      $count.textContent = '!';
      $q.innerHTML = '<p class="adm-empty">Nie mogę połączyć się z API admina (' + esc(e.message) + ').<br><br>' +
        'Panel działa tylko przez tunel SSH — instrukcja w <code>_admin/README.md</code>. ' +
        'Podgląd na danych testowych: <a href="?demo=1">?demo=1</a>.</p>';
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
    [].forEach.call($q.querySelectorAll('.adm-item'), function (b) { b.setAttribute('aria-current', b.getAttribute('data-i') === String(i) ? 'true' : 'false'); });
    $d.innerHTML = '<div class="adm-placeholder"><p>Ładuję v' + it.version + ' · ' + esc(it.city_name || it.city_slug) + '…</p></div>';
    var vs = [it.version]; if (it.published_version != null) vs.push(it.published_version);
    api('/admin_versions?city_slug=eq.' + encodeURIComponent(it.city_slug) + '&version=in.(' + vs.join(',') + ')&select=city_slug,version,status,content')
      .then(function (rows) {
        var draft = null, pub = null;
        (rows || []).forEach(function (r) { if (r.version === it.version) draft = r.content; else pub = r.content; });
        if (!draft) throw new Error('brak treści szkicu');
        render(it, draft, pub);
        if (window.matchMedia('(max-width:900px)').matches) $d.scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
      .catch(function (e) { $d.innerHTML = '<div class="adm-placeholder"><p>Nie udało się wczytać szkicu: ' + esc(e.message) + '</p></div>'; });
  }

  function trOf(list, lang, key, id) {
    return (list || []).filter(function (t) { return t.lang === lang && (key == null || t[key] === id); })[0] || {};
  }
  function langsOf(list, key, id) {
    var s = {}; (list || []).forEach(function (t) { if (key == null || t[key] === id) s[t.lang] = 1; });
    return Object.keys(s).sort();
  }
  function stopKey(s) { return s.stop_key || ('id:' + s.id); }

  function fieldRows(defs, a, b) {
    var out = [];
    defs.forEach(function (f) {
      var o = a ? a[f[0]] : undefined, n = b ? b[f[0]] : undefined;
      if (a && same(o, n)) return;
      if (!a && (n == null || n === '' || (Array.isArray(n) && !n.length))) return;
      out.push('<div class="adm-field"><small>' + esc(f[1]) + '</small><div class="adm-field__vals">' +
        (a ? '<span class="adm-old">' + esc(show(o, f[2])) + '</span>' : '') +
        '<span class="adm-new">' + esc(show(n, f[2])) + '</span></div></div>');
    });
    return out;
  }

  function langChips(oldL, newL) {
    var all = {}; oldL.concat(newL).forEach(function (l) { all[l] = 1; });
    return '<div class="adm-langs">' + Object.keys(all).sort().map(function (l) {
      var cls = newL.indexOf(l) < 0 ? ' adm-lang--gone' : (oldL.indexOf(l) < 0 && oldL.length ? ' adm-lang--new' : '');
      return '<span class="adm-lang' + cls + '">' + esc(l) + '</span>';
    }).join('') + '</div>';
  }

  function render(it, draft, pub) {
    var c = draft.city || {}, pc = pub ? (pub.city || {}) : null;
    var ctr = trOf(draft.city_translations, 'pl'), pctr = pub ? trOf(pub.city_translations, 'pl') : null;
    var team = c.bandana_color || it.bandana_color || '#0B4EA2';

    // przystanki: dopasowanie po stop_key (albo id)
    var oldStops = pub ? (pub.stops || []) : [], newStops = draft.stops || [];
    var oldBy = {}; oldStops.forEach(function (s) { oldBy[stopKey(s)] = s; });
    var seen = {}, rows = [], cnt = { new: 0, chg: 0, del: 0 };
    newStops.slice().sort(function (a, b) { return a.stop_number - b.stop_number; }).forEach(function (s) {
      var k = stopKey(s), o = oldBy[k]; seen[k] = 1;
      var t = trOf(draft.stop_translations, 'pl', 'stop_id', s.id);
      var ot = o ? trOf(pub.stop_translations, 'pl', 'stop_id', o.id) : null;
      var f = fieldRows(STOP_FIELDS, o, s).concat(fieldRows(STOP_TR, ot, t));
      var nl = langsOf(draft.stop_translations, 'stop_id', s.id), ol = o ? langsOf(pub.stop_translations, 'stop_id', o.id) : [];
      var langChanged = o && nl.join() !== ol.join();
      var kind = !pub ? 'new' : !o ? 'new' : (f.length || langChanged) ? 'chg' : 'same';
      if (pub && kind !== 'same') cnt[kind]++;
      rows.push(stopHtml(kind, s, t, f, langChanged || !o ? langChips(ol, nl) : '', !pub));
    });
    oldStops.forEach(function (o) {
      if (seen[stopKey(o)]) return;
      cnt.del++;
      rows.push(stopHtml('del', o, trOf(pub.stop_translations, 'pl', 'stop_id', o.id), [], '', false));
    });

    var cityRows = fieldRows(CITY_FIELDS, pc, c).concat(fieldRows(CITY_TR, pctr, ctr));
    var cLangsNew = langsOf(draft.city_translations), cLangsOld = pub ? langsOf(pub.city_translations) : [];
    var sLangsNew = langsOf(draft.stop_translations), sLangsOld = pub ? langsOf(pub.stop_translations) : [];

    // ostrzeżenia, które warto zobaczyć przed publikacją
    var warn = [];
    if (!newStops.length) warn.push(['', 'Szkic nie ma żadnych przystanków — po publikacji strona miasta będzie pusta.']);
    var noPl = newStops.filter(function (s) { return !trOf(draft.stop_translations, 'pl', 'stop_id', s.id).name; }).length;
    if (noPl) warn.push(['', noPl + ' przyst. bez nazwy po polsku.']);
    var noEn = newStops.length && newStops.filter(function (s) { return !trOf(draft.stop_translations, 'en', 'stop_id', s.id).name; }).length;
    if (noEn) warn.push(['soft', noEn + ' z ' + newStops.length + ' przystanków bez tłumaczenia EN — inne języki zobaczą tekst zapasowy.']);
    if (!ctr.title) warn.push(['', 'Brak tytułu miasta po polsku.']);

    var title = ctr.title || it.city_name || it.city_slug;
    var html = '<article class="adm-sheet" style="--team:' + esc(team) + '">' +
      '<header class="adm-sheet__head' + (isLight(team) ? ' is-light' : '') + '"><div>' +
      '<p class="label" style="color:inherit;opacity:.8">' + esc(it.city_slug) + ' · szkic v' + it.version + (it.published_version != null ? ' zamiast v' + it.published_version : ' · pierwsza publikacja') + '</p>' +
      '<h2 class="adm-sheet__title">' + esc(title) + '</h2>' +
      (it.note ? '<p class="adm-sheet__sub">' + esc(it.note) + '</p>' : '') + '</div>' +
      '<span class="adm-chip">' + esc(SRC[it.source] || it.source) + ' · ' + esc(when(it.created_at)) + '</span></header>';

    html += '<section class="adm-sheet__sec"><h3>Podsumowanie</h3><div class="adm-sum">' +
      stat('Przystanki', newStops.length, pub ? oldStops.length : null) +
      stat('Czas', durLabel(c.duration_type), pc ? durLabel(pc.duration_type) : null) +
      (pub ? stat('Nowe', cnt.new) + stat('Zmienione', cnt.chg) + stat('Usunięte', cnt.del) : '') +
      stat('Języki', sLangsNew.length || cLangsNew.length, pub ? (sLangsOld.length || cLangsOld.length) : null) +
      '</div>' + warn.map(function (w) { return '<p class="adm-warn' + (w[0] ? ' adm-warn--' + w[0] : '') + '">' + esc(w[1]) + '</p>'; }).join('') + '</section>';

    if (cityRows.length || !pub) {
      html += '<section class="adm-sheet__sec"><h3>' + (pub ? 'Zmiany w opisie miasta' : 'Opis miasta') + '</h3><div class="adm-diff">' +
        (cityRows.length ? cityRows.join('') : '<p>Bez zmian.</p>') + '</div></section>';
    }
    html += '<section class="adm-sheet__sec"><h3>Języki</h3>' + langChips(sLangsOld.length ? sLangsOld : cLangsOld, sLangsNew.length ? sLangsNew : cLangsNew) + '</section>';
    html += '<section class="adm-sheet__sec"><h3>Przystanki' + (pub ? ' — zmienione można rozwinąć' : '') + '</h3><div class="adm-stops">' +
      (rows.length ? rows.join('') : '<p class="adm-empty">Brak przystanków.</p>') + '</div></section>';

    html += '<form class="adm-decide" id="decide" autocomplete="off">' +
      '<label for="note">Notatka do historii wersji (opcjonalnie)</label>' +
      '<textarea id="note" name="note" placeholder="np. poprawione godziny otwarcia"></textarea>' +
      '<div class="adm-decide__row">' +
      '<button type="button" class="qc-btn adm-btn-ok" data-act="approve"' + (newStops.length ? '' : ' disabled data-lock title="Szkic bez przystanków nie może trafić na stronę"') + '>Zatwierdź i opublikuj</button>' +
      '<button type="button" class="qc-btn adm-btn-no" data-act="reject">Odrzuć szkic</button>' +
      '<span class="adm-msg" id="msg" role="status"></span></div></form></article>';

    $d.innerHTML = html;
  }

  function stat(label, now, before) {
    var diff = before != null && String(before) !== String(now);
    return '<div class="adm-stat"><small>' + esc(label) + '</small>' + (diff ? '<s>' + esc(before) + '</s>' : '') + '<b>' + esc(now == null ? '—' : now) + '</b></div>';
  }

  function stopHtml(kind, s, t, fields, langs, firstPub) {
    var chip = { new: '<span class="adm-chip adm-chip--new">' + (firstPub ? 'przystanek' : 'nowy') + '</span>', chg: '<span class="adm-chip adm-chip--chg">zmieniony</span>',
      del: '<span class="adm-chip adm-chip--del">usunięty</span>', same: '<span class="adm-chip">bez zmian</span>' }[kind];
    var head = '<span class="adm-stop__no">' + num(s.stop_number) + '</span>' +
      '<img class="adm-stop__ic" src="' + icon(s.category) + '" alt="" width="56" height="56" loading="lazy">' +
      '<span class="adm-stop__name">' + esc(t.name || '(bez nazwy PL)') + '<small>' + esc([s.category, s.time_label, s.visit_duration ? minLabel(s.visit_duration) : ''].filter(Boolean).join(' · ')) + '</small></span>' +
      '<span style="display:flex;align-items:center;gap:8px">' + chip + (kind === 'same' || kind === 'del' ? '' : CHEV) + '</span>';
    if (kind === 'same' || kind === 'del') return '<div class="adm-stop" data-kind="' + kind + '"><summary>' + head + '</summary></div>';
    return '<details class="adm-stop" data-kind="' + kind + '"><summary>' + head + '</summary><div class="adm-stop__body">' +
      (langs ? '<div class="adm-field"><small>Języki</small><div class="adm-field__vals">' + langs + '</div></div>' : '') +
      '<div class="adm-diff">' + fields.join('') + '</div></div></details>';
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

  // ── start ────────────────────────────────────────────
  var env = document.getElementById('env');
  env.hidden = false;
  env.textContent = DEMO ? 'Dane testowe' : 'Baza na żywo';
  env.title = DEMO ? 'Przyciski nic nie zapisują' : 'Decyzje zmieniają stronę';
  if (!DEMO) env.className = 'adm-env adm-env--live';
  loadQueue(!window.matchMedia('(max-width:900px)').matches);
})();
