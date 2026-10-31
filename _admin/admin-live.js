/* Quolino admin — praca AI na żywo (JP 2026-10-31, „efekt WOW”).
 *
 * Źródło: rpc/ops_status → snapshots.live (bin/live-status.mjs): { status: running|idle, trip, version_target, stage, stage_label_pl,
 * stop_n, stop_total, stop_key, field, field_label_pl, text_tail, flags_found, worker, last: { trip, version, label, status } }.
 * Polling co 5 s TYLKO gdy coś jest 'running' (inaczej co 60 s); karta w tle → pauza. Bez admin.ops_status: pipeline_runs
 * (running / stalled) co 5–60 s i same etapy, bez tekstu.
 *
 * Na Pulpicie, w „Dziś” i w Pipeline: pasek pod nagłówkiem „Hermes pisze Frasassi · Kontrola źródeł · przystanek 4 z 8” z pulsującą
 * kropką i linkiem do trasy. W widoku tej trasy: nad spisem baner „Hermes pracuje nad nową wersją (v6)…”, a w karcie bieżącego
 * przystanku pole, które właśnie powstaje — tekst pojawia się jak na maszynie do pisania (tylko nowe znaki od ostatniego odczytu;
 * prefers-reduced-motion → od razu); flagi z kontroli źródeł dopisują się do licznika. Po zakończeniu: toast „Gotowe: v6 — otwórz”,
 * widok nie przeładowuje się bez kliknięcia. ?demo=1: symulacja przebiegu (Spello v3) z treści demo.json — widać efekt bez serwera.
 *
 * Plik ładuje się PRZED admin.js; z admin.js korzysta przez window.AdminHost / window.ADM i zdarzenia adm:route, adm:render.
 */
(function () {
  'use strict';

  var H = function () { return window.AdminHost; };
  var L = { data: null, prev: null, timer: null, at: 0, shownTail: '', shownKey: '', typing: null, toastT: null, demo: null, lastFlags: 0, warned: false };
  var STAGE_PL = { 1: 'Research', 2: 'Szkic', 3: 'Bloki przystanków', 4: 'Kontrola źródeł', 5: 'Kontrola całej trasy', 6: 'Zapis wersji', 7: 'Gotowe', 8: 'Poprawki z uwag', 9: 'Weryfikacja uwag' };
  var BAR_ROUTES = /^(|#|#\/|#\/dzis|#\/pulpit|#\/pipeline)$/;
  var reduced = function () { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  function esc(s) { return H().esc(s); }
  function t_(iso) { var t = Date.parse(iso || ''); return isNaN(t) ? 0 : t; }
  function tripHash() { var m = /^#\/([^/]+)(?:\/v(\d+))?$/.exec(location.hash); return m && !/^(dzis|pulpit|trasy|decyzje|straznicy|ikony|pipeline|mapa|koszty|zgloszenia|baza-wiedzy|postep)$/.test(m[1]) ? decodeURIComponent(m[1]) : null; }
  function tripName(slug) { var t = ((H().state.trips) || []).filter(function (x) { return x.slug === slug; })[0]; return t ? t.name : H().titleCase(slug); }
  function running(d) { return !!(d && d.status === 'running' && d.trip); }
  function verb(d) { return d.stage === 8 ? 'poprawia' : d.stage === 9 ? 'sprawdza uwagi do' : d.stage === 4 ? 'sprawdza źródła' : 'pisze'; }
  function who(d) { return d.worker === 'automat' ? 'Automat' : 'Hermes'; }
  function where(d) {
    var parts = [];
    if (d.stage_label_pl || STAGE_PL[d.stage]) parts.push(d.stage_label_pl || STAGE_PL[d.stage]);
    if (d.stop_n && d.stop_total) parts.push('przystanek ' + d.stop_n + ' z ' + d.stop_total); else if (d.stop_n) parts.push('przystanek ' + d.stop_n);
    return parts.join(' · ');
  }

  // ── pobieranie ─────────────────────────────────────────
  function fetchLive() {
    var h = H();
    if (h.DEMO) return Promise.resolve(demoStep());
    if (h.ops.off) return h.api('/pipeline_runs?status=in.(running,stalled)&order=last_at.desc&limit=3').then(function (rows) {
      var r = (rows || [])[0];
      if (!r || !recent(r.last_at, 3 * 60)) return { status: 'idle', bare: true };
      return { status: 'running', bare: true, trip: r.city_slug, stage: r.kind === 'revise' ? 8 : +r.stage || 1, stop_n: r.stop_k || null, stop_total: r.stops_n || null,
        version_target: null, message: r.last_message, worker: 'Antigravity', started_at: r.started_at, updated_at: r.last_at, stalled: r.status === 'stalled' };
    }, function (e) { if (e && e.session) throw e; return null; });
    return h.api('/rpc/ops_status', { method: 'POST', body: {} }).then(function (r) {
      if (!r || !r.snapshots) { h.ops.off = true; return null; }
      h.ops.data = r; h.ops.at = Date.now();
      var s = r.snapshots.live && r.snapshots.live.data;
      if (s && s.status === 'running' && !recent(s.updated_at, 20 * 60)) return { status: 'idle', stale: s };   // przebieg padł bez „idle”
      return s || { status: 'idle' };
    }, function (e) { if (e && e.session) throw e; h.ops.off = true; return null; });
  }
  function recent(iso, min) { return t_(iso) > 0 && Date.now() - t_(iso) < min * 60000; }
  function tick() {
    clearTimeout(L.timer);
    if (document.hidden) { L.timer = setTimeout(tick, 15000); return; }
    fetchLive().then(function (d) {
      if (d !== null) { L.prev = L.data; L.data = d; L.at = Date.now(); render(); }
    }).catch(function () { /* sesja — admin.js już to pokaże */ }).then(function () {
      var run = running(L.data), ms = H().DEMO ? 1500 : run ? 5000 : 60000;
      L.timer = setTimeout(tick, ms);
    });
  }

  // ── pasek pod nagłówkiem (Pulpit, Dziś, Pipeline) ──
  function barEl() {
    var b = document.getElementById('lvBar');
    if (!b) { b = document.createElement('div'); b.id = 'lvBar'; b.className = 'lv-bar'; b.hidden = true; b.setAttribute('role', 'status'); b.setAttribute('aria-live', 'polite');
      var main = document.getElementById('adMain'); if (main && main.parentNode) main.parentNode.insertBefore(b, main); }
    return b;
  }
  function paintBar(d) {
    var b = barEl(), show = running(d) && BAR_ROUTES.test(location.hash);
    b.hidden = !show; document.body.classList.toggle('has-lvbar', show);
    if (!show) return;
    var html = '<span class="lv-dot' + (d.stalled ? ' lv-dot--bad' : '') + '" aria-hidden="true"></span>' +
      '<a class="lv-bar__a" href="#/' + encodeURIComponent(d.trip) + '"><b>' + esc(who(d) + ' ' + verb(d) + ' ' + tripName(d.trip)) + '</b>' + (where(d) ? ' · ' + esc(where(d)) : '') +
      (d.version_target ? ' · ' + esc(String(d.version_target).replace(/^v?/, 'v')) : '') + '</a>' +
      '<span class="lv-bar__m">' + (d.field_label_pl ? 'pole: ' + esc(d.field_label_pl) : d.message ? esc(clean(d.message)) : '') +
      (d.flags_found ? (d.field_label_pl || d.message ? ' · ' : '') + esc(H().plForm(d.flags_found, 'flaga', 'flagi', 'flag')) + ' z kontroli źródeł' : '') +
      (d.stalled ? ' · stoi ≥ 15 min' : '') + '</span>';
    if (b.getAttribute('data-sig') !== html) { b.innerHTML = html; b.setAttribute('data-sig', html); }
  }
  function clean(s) { return String(s || '').replace(/^\[v\d+[a-z]?\]\s*/, '').replace(/^[a-z0-9-]+: /, '').replace(/[①②③④⑤]c?\s*/g, '').replace(/\s—\s/g, ' · ').slice(0, 120); }

  // ── widok trasy: baner nad spisem + pole na żywo ──
  function paintTrip(d) {
    var slug = tripHash(), $d = H().$d, old = $d.querySelector('#lvBanner');
    var on = slug && running(d) && d.trip === slug;
    if (!on) { if (old) old.remove(); clearField(); return; }
    var body = $d.querySelector('.tv-body');
    if (!body) return;   // widok jeszcze się rysuje — adm:render wywoła nas ponownie
    var label = d.version_target ? String(d.version_target).replace(/^v?/, 'v') : null;
    var html = '<span class="lv-dot" aria-hidden="true"></span><div class="lv-banner__t"><b>' + esc(who(d) + (d.stage === 9 ? ' sprawdza, czy uwagi są naniesione' : ' pracuje nad nową wersją') + (label ? ' (' + label + ')' : '')) + '…</b>' +
      '<span>' + esc(where(d) || clean(d.message || '')) + (d.field_label_pl ? ' · pole ' + esc(d.field_label_pl) : '') + '</span></div>' +
      '<span class="lv-banner__f" id="lvFlags">' + (d.flags_found ? esc(H().plForm(d.flags_found, 'flaga', 'flagi', 'flag')) + ' z kontroli źródeł' : (d.stage === 4 ? 'kontrola źródeł: na razie bez flag' : '')) + '</span>';
    if (!old) { old = document.createElement('aside'); old.id = 'lvBanner'; old.className = 'lv-banner'; old.setAttribute('aria-live', 'polite'); body.parentNode.insertBefore(old, body); }
    if (old.getAttribute('data-sig') !== html) { old.innerHTML = html; old.setAttribute('data-sig', html); if (d.flags_found > L.lastFlags) { var f = old.querySelector('#lvFlags'); if (f) { f.classList.remove('is-bump'); void f.offsetWidth; f.classList.add('is-bump'); } } }
    L.lastFlags = d.flags_found || 0;
    paintField(d, old);
  }
  function fieldHost(d) {
    var $d = H().$d, card = d.stop_key ? $d.querySelector('#st-' + CSS.escape(d.stop_key)) : null;
    if (!card || !d.field) return null;
    var cm = card.querySelector('.adm-cm[data-field="stop.' + d.field + '"]'), row = cm && cm.closest('.adm-row');
    return row ? row.querySelector('.adm-row__v') || row : card.querySelector('.adm-rows') || card;
  }
  function paintField(d, banner) {
    var key = (d.stop_key || '') + '|' + (d.field || '');
    if (!d.field || !d.text_tail) { clearField(); return; }
    var host = fieldHost(d), box = document.getElementById('lvField');
    var wantParent = host || banner;
    if (box && box.parentNode !== wantParent && !(host && host.contains(box))) { box.remove(); box = null; }
    if (!box) {
      box = document.createElement('div'); box.id = 'lvField'; box.className = 'lv-field' + (host ? '' : ' lv-field--banner');
      box.innerHTML = '<p class="lv-field__h"><span class="lv-dot" aria-hidden="true"></span>Powstaje teraz · <b></b></p><p class="lv-tw" aria-live="off"><span class="lv-tw__t"></span><i class="lv-caret" aria-hidden="true"></i></p>';
      if (host) host.appendChild(box); else banner.appendChild(box);
      L.shownTail = ''; L.shownKey = '';
      if (host) { var card = host.closest('.adm-stopx'); if (card) card.classList.add('is-live'); }
    }
    box.querySelector('.lv-field__h b').textContent = (d.field_label_pl || d.field) + (d.stop_n ? ' · przystanek ' + d.stop_n : '');
    typeTo(box.querySelector('.lv-tw__t'), d.text_tail, key);
  }
  function clearField() {
    var box = document.getElementById('lvField'); if (box) box.remove();
    [].forEach.call(document.querySelectorAll('.adm-stopx.is-live'), function (c) { c.classList.remove('is-live'); });
    if (L.typing) { cancelAnimationFrame(L.typing); L.typing = null; }
    L.shownTail = ''; L.shownKey = '';
  }
  // maszyna do pisania: nowe znaki od ostatniego odczytu (końcówka 600 znaków może się nakładać na poprzednią)
  function typeTo(el, tail, key) {
    var shown = L.shownKey === key ? L.shownTail : '';
    var add;
    if (!shown) add = tail;
    else if (tail.indexOf(shown) === 0) add = tail.slice(shown.length);
    else {
      var probe = shown.slice(-60), at = probe ? tail.indexOf(probe) : -1;
      add = at >= 0 ? tail.slice(at + probe.length) : null;
    }
    L.shownKey = key;
    if (add === null) { shown = ''; add = tail; el.textContent = ''; }
    if (!add) return;
    L.shownTail = shown + add;
    if (L.typing) { cancelAnimationFrame(L.typing); L.typing = null; }
    if (reduced()) { el.textContent = L.shownTail; return; }
    var target = L.shownTail, i = el.textContent.length;
    if (i > target.length || target.indexOf(el.textContent) !== 0) { el.textContent = shown; i = shown.length; }
    var step = function () {
      var n = Math.max(1, Math.round((target.length - i) / 60));   // całość w ok. sekundę, niezależnie od długości
      i = Math.min(target.length, i + n);
      el.textContent = target.slice(0, i);
      if (i < target.length) L.typing = requestAnimationFrame(step); else L.typing = null;
    };
    L.typing = requestAnimationFrame(step);
  }

  // ── toast po zakończeniu ──
  function toast(last) {
    var t = document.getElementById('lvToast');
    if (!t) { t = document.createElement('div'); t.id = 'lvToast'; t.className = 'lv-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    var slug = last.trip, label = last.label || (last.version ? 'v' + last.version : null), ok = last.status === 'done';
    var href = '#/' + encodeURIComponent(slug) + (last.version ? '/v' + last.version : '');
    t.innerHTML = '<span class="lv-toast__ic ' + (ok ? 'is-ok' : 'is-bad') + '" aria-hidden="true">' + (ok ? H().IC.ok : H().IC.bad) + '</span><span class="lv-toast__t">' +
      (ok ? '<b>Gotowe: ' + esc(tripName(slug)) + (label ? ' ' + esc(label) : '') + '</b>' : '<b>' + esc(tripName(slug)) + ': przebieg ' + (last.status === 'stopped' ? 'przerwany' : 'z błędem') + '</b>') +
      (last.message && !ok ? '<small>' + esc(String(last.message).slice(0, 140)) + '</small>' : '') + '</span>' +
      '<a class="ad-btn lv-toast__a" href="' + esc(href) + '">otwórz</a><button type="button" class="lv-toast__x" aria-label="Zamknij">×</button>';
    t.hidden = false; t.classList.remove('is-in'); void t.offsetWidth; t.classList.add('is-in');
    clearTimeout(L.toastT); L.toastT = setTimeout(function () { t.hidden = true; }, 30000);
  }
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.lv-toast__x, .lv-toast__a')) { var t = document.getElementById('lvToast'); if (t) t.hidden = true; } });

  // ── rysowanie całości ──
  function render() {
    var d = L.data || { status: 'idle' }, p = L.prev;
    paintBar(d);
    paintTrip(d);
    if (p && running(p) && !running(d)) {
      var last = d.last && d.last.trip ? d.last : d.stale ? { trip: d.stale.trip, status: 'stopped', message: 'brak sygnału od 20 min' } : p.bare ? { trip: p.trip, status: 'done' } : null;
      if (last) toast(last);
    }
    document.dispatchEvent(new CustomEvent('adm:live', { detail: { live: d } }));
  }
  document.addEventListener('adm:route', function () { clearField(); L.lastFlags = 0; setTimeout(render, 0); });
  document.addEventListener('adm:render', function () { clearField(); setTimeout(render, 0); });
  document.addEventListener('adm:today', function () { setTimeout(render, 0); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });

  // ── demo: symulacja przebiegu „Spello v3” z treści demo.json ──
  function demoStep() {
    var S = L.demo;
    if (!S) {
      L.demo = S = { steps: null, i: 0, sub: 0, idleFrom: 0, started: new Date().toISOString() };
      fetch('demo.json').then(function (r) { return r.json(); }).then(function (d) {
        var v = d.versions.filter(function (x) { return x.city_slug === 'spello'; }).sort(function (a, b) { return b.version - a.version; })[0];
        var c = v.content, trs = c.stop_translations || [], stops = (c.stops || []).slice().sort(function (a, b) { return a.stop_number - b.stop_number; });
        var steps = [], tr = function (s) { return trs.filter(function (t) { return t.lang === 'pl' && String(t.stop_id) === String(s.id); })[0] || {}; };
        var txt = function (v2) { return Array.isArray(v2) ? v2.join(' ') : String(v2 || ''); };
        stops.slice(0, 4).forEach(function (s) {
          var t = tr(s), key = H().stopKey(s, trs);
          steps.push({ stage: 8, stop_key: key, stop_n: s.stop_number, field: 'desc_paragraphs', field_label_pl: 'Opis', text: txt(t.desc_paragraphs) });
          if (t.kids_box) steps.push({ stage: 8, stop_key: key, stop_n: s.stop_number, field: 'kids_box', field_label_pl: 'Misja dla dzieci', text: txt(t.kids_box) });
        });
        stops.slice(0, 4).forEach(function (s, i) { steps.push({ stage: 4, stop_key: H().stopKey(s, trs), stop_n: s.stop_number, field: null, text: '', flags: i % 2 ? 1 : 0 }); });
        steps.push({ stage: 5, stop_key: null, field: null, text: '' });
        steps.push({ stage: 6, stop_key: null, field: null, text: '' });
        S.steps = steps; S.total = stops.length; S.base = v.version; S.trip = 'spello';
      }).catch(function () { S.steps = []; });
      return { status: 'idle' };
    }
    if (!S.steps) return { status: 'idle' };
    var tl = ((H().state.trips) || []).filter(function (t) { return t.slug === S.trip; })[0];   // panel może mieć nowszą wersję demo niż demo.json
    S.version = Math.max(S.base, tl && +tl.latest || 0) + 1; S.target = 'v' + S.version;
    if (S.i >= S.steps.length) {
      if (!S.idleFrom) { S.idleFrom = Date.now(); S.flags = 0; return { status: 'idle', last: { trip: S.trip, version: S.version, label: S.target, status: 'done', finished_at: new Date().toISOString() } }; }
      if (Date.now() - S.idleFrom > 20000) { S.i = 0; S.sub = 0; S.idleFrom = 0; S.started = new Date().toISOString(); }
      return { status: 'idle' };
    }
    var st = S.steps[S.i], chunk = 110, shown = st.text ? st.text.slice(0, Math.min(st.text.length, (S.sub + 1) * chunk)) : '';
    var out = { status: 'running', trip: S.trip, version_target: S.target, stage: st.stage, stage_label_pl: STAGE_PL[st.stage], stop_n: st.stop_n || null, stop_total: S.total,
      stop_key: st.stop_key, field: st.field, field_label_pl: st.field_label_pl || null, text_tail: shown.slice(-600), flags_found: S.flags || 0, worker: 'Antigravity', started_at: S.started, updated_at: new Date().toISOString() };
    if (st.flags && S.sub === 0) { S.flags = (S.flags || 0) + st.flags; out.flags_found = S.flags; }
    var subs = st.text ? Math.ceil(st.text.length / chunk) + 1 : 2;
    if (++S.sub >= subs) { S.sub = 0; S.i++; }
    return out;
  }

  // start po załadowaniu admin.js (AdminHost powstaje na końcu admin.js)
  function boot() { if (!window.AdminHost) { setTimeout(boot, 50); return; } barEl(); tick(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.AdminLive = { state: L, render: render, tick: tick };
})();
