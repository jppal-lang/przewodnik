/* ============================================================
   Panel admina — „telefon obok pól” (JP 2026-10-31)
   Podgląd na żywo wersji trasy w ramce telefonu obok pól szkicu.
   - Strona: PRAWDZIWA strona miasta w wersji szkicu — ten sam mechanizm co
     „Podgląd wersji” w menu ⋯: quolino.com/city.html?draft=<klucz>&v=N
     (klucz z rpc/admin_preview_token, który panel i tak pobiera przy otwarciu trasy).
   - Tryb demo (?demo=1): zamiast strony z sieci — strona zastępcza składana
     z migawki wersji (srcdoc, te same klasy co city.html, styles.css), działa offline.
   - Sprzężenie przez postMessage z preview-bridge.js (na stronie), źródła sprawdzane
     po obu stronach: tylko https://quolino.com ↔ panel (albo ta sama domena w demo).
   - Zero śledzenia, zero localStorage.
   ============================================================ */
(function () {
  'use strict';
  var A = window.ADM; if (!A) return;
  var MARK = 'quolino-preview';
  var SITE = A.SITE, SITE_ORIGIN = '';
  try { SITE_ORIGIN = new URL(SITE).origin; } catch (e) { SITE_ORIGIN = ''; }
  var WIDE = window.matchMedia('(min-width:1200px)');
  var esc = A.esc;
  var P = { el: null, frame: null, msg: null, note: null, view: 'parent', ready: false, loaded: false, key: '', url: '', srcdoc: '', demo: false,
    on: true, sheet: false, pending: null, loadT: null, bridgeT: null, flashT: null, it: null, lastFocus: null, lastFocusAt: 0 };
  var TRIP_RE = /^#\/([^/]+)(?:\/v(\d+))?$/, SECTIONS = /^#\/(trasy|decyzje|straznicy|ikony|postep|zgloszenia|koszty|baza-wiedzy|pulpit)$/;
  var ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.6"/><path d="M10.5 5.5h3M11 18.5h2"/></svg>';

  // ── ramka telefonu (jeden węzeł na całe życie panelu — przetrwa przerysowanie pól) ──
  function build() {
    if (P.el) return;
    var el = document.createElement('aside');
    el.className = 'tv-phone'; el.id = 'tvPhone'; el.hidden = true; el.setAttribute('aria-label', 'Podgląd na telefonie');
    el.innerHTML = '<div class="tv-phone__bar">' +
      '<button type="button" class="adm-linkbtn tv-phone__back" data-pv-close>← Wróć do pól</button>' +
      '<div class="tv-seg tv-phone__seg" role="group" aria-label="Widok na telefonie">' +
      '<button type="button" data-pv-view="parent" aria-pressed="true">Rodzic</button><button type="button" data-pv-view="kid" aria-pressed="false">Dziecko</button></div>' +
      '<span class="tv-phone__v" id="tvPhoneV"></span>' +
      '<a class="adm-linkbtn tv-phone__open" id="tvPhoneOpen" target="_blank" rel="noopener" hidden title="Otwórz ten podgląd w nowej karcie">↗<span class="adm-sr"> Otwórz w nowej karcie</span></a>' +
      '<button type="button" class="adm-pop__x tv-phone__x" data-pv-close aria-label="Zamknij podgląd">×</button></div>' +
      '<div class="tv-phone__dev"><div class="tv-phone__screen">' +
      '<iframe id="tvPhoneFrame" title="Podgląd strony miasta w wersji szkicu" referrerpolicy="strict-origin" loading="eager"></iframe>' +
      '<div class="tv-phone__msg" id="tvPhoneMsg" role="status" hidden></div></div>' +
      '<p class="tv-phone__note" id="tvPhoneNote" hidden></p></div>';
    document.body.appendChild(el);
    P.el = el; P.frame = el.querySelector('#tvPhoneFrame'); P.msg = el.querySelector('#tvPhoneMsg'); P.note = el.querySelector('#tvPhoneNote');
    P.frame.addEventListener('load', onLoad);
    el.addEventListener('click', function (e) {
      var v = e.target.closest('[data-pv-view]'); if (v) { setView(v.getAttribute('data-pv-view')); return; }
      if (e.target.closest('[data-pv-close]')) { P.sheet ? sheetClose() : dockHide(); return; }
      if (e.target.closest('[data-pv-retry]')) { load(true); }
    });
  }

  // ── adres podglądu: jak previewLinks() w admin.js (klucz z admin_preview_token) ──
  function liveUrl(it, view) {
    var tok = A.state.token;
    if (!tok || !it) return '';
    return SITE + '/city.html?draft=' + encodeURIComponent(tok) + '&v=' + it.version + (view === 'kid' ? '&view=kid' : '');
  }
  function publicUrl() { var T = A.state.trip; return T && T.published != null ? SITE + '/city.html?c=' + encodeURIComponent(T.slug) : ''; }
  function targetOrigin() { return P.demo ? location.origin : SITE_ORIGIN; }

  // ── strona zastępcza w demo: migawka wersji w klasach city.html (działa bez sieci) ──
  function paras(v) { return (Array.isArray(v) ? v : String(v || '').split(/\n{2,}/)).filter(Boolean).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join(''); }
  function trOf(list, lang, key, id) { return (list || []).filter(function (t) { return t.lang === lang && (!key || t[key] === id); })[0] || {}; }
  function demoDoc(it) {
    var D = A.state.tvDraft || {}, c = D.city || {}, ct = trOf(D.city_translations, 'pl');
    var S = (D.stops || []).slice().sort(function (a, b) { return a.stop_number - b.stop_number; });
    var h = '<!DOCTYPE html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">' +
      '<title>Podgląd demo · ' + esc(ct.title || '') + '</title><link rel="stylesheet" href="../styles.css?v=41"><script src="../preview-bridge.js?v=1" defer></script></head>' +
      '<body><main class="qc" id="city" data-view="adult"><div class="qc-wrap" id="mainContent">' +
      '<p class="qc-stat" style="margin:12px 0 0;font-size:14px;color:#5D6B82">Strona zastępcza (demo, bez sieci) · ' + esc(it.label || 'v' + it.version) + '</p>' +
      '<h1 class="qc-title">' + esc(ct.title || '') + '</h1>' + (ct.subtitle ? '<p class="qc-sub">' + esc(ct.subtitle) + '</p>' : '') +
      '<p><button type="button" class="qc-btn qc-btn--sm" id="qcKidToggle" aria-pressed="false">👁 Widok dziecka</button></p>' +
      (ct.lead ? '<div class="qc-box">' + paras(ct.lead) + '</div>' : '') +
      (ct.local_food ? '<div class="qc-box qc-box--fest"><p class="qc-box__title">Lokalne jedzenie</p><p>' + esc(ct.local_food) + '</p></div>' : '') +
      (ct.good_to_know ? '<div class="qc-box"><p class="qc-box__label">Warto wiedzieć</p><p>' + esc(ct.good_to_know) + '</p></div>' : '') +
      '<section class="qc-stops" id="trasa">';
    S.forEach(function (s, i) {
      var t = trOf(D.stop_translations, 'pl', 'stop_id', s.id), f = function (k) { return t[k] || s[k]; };
      h += '<details class="qc-stop" id="p' + s.stop_number + '" data-stop-num="' + s.stop_number + '"' + (s.stop_key ? ' data-stop-key="' + esc(s.stop_key) + '"' : '') + (i === 0 ? ' open' : '') + '>' +
        '<summary class="qc-stop__head"><span class="qc-stop__title"><span class="qc-stop__time">' + A.num(s.stop_number) + (s.time_label ? ' · ' + esc(s.time_label) : '') + '</span>' +
        '<span class="qc-stop__name">' + esc(t.name || 'Przystanek') + '</span></span><span class="qc-stop__meta">' +
        (f('price') ? '<span class="qc-pill"><small>Bilet</small>' + esc(f('price')) + '</span>' : '') +
        (f('visit_duration') ? '<span class="qc-pill"><small>Czas</small>' + esc(f('visit_duration')) + '</span>' : '') + '</span><span class="qc-chev" aria-hidden="true">&#x25BC;</span></summary>' +
        '<div class="qc-stop__body">' +
        (t.practical_note ? '<p class="qc-note"><b>Praktycznie</b><span>' + esc(t.practical_note) + '</span></p>' : '') +
        (t.desc_paragraphs && t.desc_paragraphs.length ? '<div class="qc-prose">' + paras(t.desc_paragraphs) + '</div>' : '') +
        (f('opening_hours') ? '<p class="qc-note qc-note--hours"><b>Godziny</b><span>' + esc(f('opening_hours')) + '</span></p>' : '') +
        (t.dress_code ? '<p class="qc-note qc-note--dress"><b>Strój</b><span>' + esc(t.dress_code) + '</span></p>' : '') +
        (t.local_flavor ? '<p class="qc-note qc-note--flavor"><b>Lokalny smak</b><span>' + esc(t.local_flavor) + '</span></p>' : '') +
        (t.kids_box || t.photo_task ? '<div class="qc-tasks">' +
          (t.kids_box ? '<div class="qc-task"><label class="qc-task__label"><input type="checkbox">Misja</label>' + paras(t.kids_box) + (t.hint ? '<p class="qc-task__hint">Wskazówka: ' + esc(t.hint) + '</p>' : '') + '</div>' : '') +
          (t.photo_task ? '<div class="qc-task qc-task--photo"><label class="qc-task__label"><input type="checkbox">Zadanie foto</label><p>' + esc(t.photo_task) + '</p></div>' : '') + '</div>' : '') +
        '</div></details>';
    });
    h += '</section></div></main><script>document.addEventListener("click",function(e){var b=e.target.closest("#qcKidToggle");if(!b)return;var r=document.getElementById("city"),k=r.dataset.view==="kid";' +
      'r.dataset.view=k?"adult":"kid";b.setAttribute("aria-pressed",String(!k));b.textContent=k?"👁 Widok dziecka":"👁 Widok rodzica";});</script></body></html>';
    return h;
  }

  // ── wczytanie ──
  function showMsg(html) { P.msg.innerHTML = html; P.msg.hidden = false; }
  function hideMsg() { P.msg.hidden = true; P.msg.innerHTML = ''; }
  function setNote(t) { P.note.textContent = t || ''; P.note.hidden = !t; }
  function linkOut() { var u = P.url || publicUrl(); return u ? '<p><a class="qc-btn qc-btn--sm" href="' + esc(u) + '" target="_blank" rel="noopener">Otwórz stronę w nowej karcie ↗</a></p>' : ''; }
  function load(force) {
    var it = P.it; if (!it) return;
    P.demo = !!A.DEMO;
    var url = P.demo ? '' : liveUrl(it, P.view), key = (A.state.trip ? A.state.trip.slug : '') + '|' + it.version + '|' + (P.demo ? 'demo' : url ? 'live' : 'none');
    if (key === P.key && !force) return;
    P.key = key; P.url = url; P.ready = false; P.loaded = false; P.pending = null;
    clearTimeout(P.loadT); clearTimeout(P.bridgeT); setNote('');
    var open = P.el.querySelector('#tvPhoneOpen');
    open.hidden = !url; if (url) open.href = url;
    if (!P.demo && !url) {
      P.frame.removeAttribute('srcdoc'); P.frame.src = 'about:blank';
      showMsg('<p><b>Brak podglądu tej wersji na stronie.</b></p><p>Baza nie zwróciła klucza podglądu (<code>admin_preview_token</code>) — podgląd działa dopiero po jego wdrożeniu.</p>' + linkOut());
      return;
    }
    showMsg('<p class="tv-phone__load"><span class="ad-spin" aria-hidden="true"></span> Ładuję podgląd…</p>');
    if (P.demo) { P.frame.removeAttribute('src'); P.frame.srcdoc = demoDoc(it); }
    else { P.frame.removeAttribute('srcdoc'); P.frame.src = url; }
    P.loadT = setTimeout(function () {
      if (P.loaded) return;
      showMsg('<p><b>Nie udało się wczytać strony.</b></p><p>Sprawdź, czy quolino.com odpowiada, albo otwórz podgląd w nowej karcie.</p>' + linkOut() +
        '<p><button type="button" class="adm-linkbtn" data-pv-retry>Spróbuj ponownie</button></p>');
    }, 12000);
  }
  function onLoad() {
    if (!P.key) return;
    P.loaded = true; clearTimeout(P.loadT);
    post({ type: 'qp:ping' });
    P.bridgeT = setTimeout(function () {
      if (P.ready) return;
      hideMsg();
      setNote('Strona wczytana bez mostka podglądu — kliknięcie w pole nie przewinie telefonu (preview-bridge.js nie jest jeszcze na stronie).');
    }, 4000);
  }
  function post(msg) {
    if (!P.frame || !P.frame.contentWindow) return;
    msg.q = MARK; msg.v = 1;
    try { P.frame.contentWindow.postMessage(msg, targetOrigin()); } catch (e) { /* ramka w trakcie zmiany */ }
  }
  window.addEventListener('message', function (e) {
    if (!P.frame || e.source !== P.frame.contentWindow || !e.data || e.data.q !== MARK) return;
    if (e.origin !== targetOrigin()) return;
    var m = e.data;
    if (m.type === 'qp:ready') {
      P.ready = true; clearTimeout(P.bridgeT); hideMsg(); setNote('');
      if (m.view && m.view !== P.view) post({ type: 'qp:view', view: P.view });
      if (P.pending) { post(P.pending); P.pending = null; }
      return;
    }
    if (m.type === 'qp:view') { paintView(m.view === 'kid' ? 'kid' : 'parent'); return; }
    if (m.type === 'qp:click') { panelFocus(m); return; }
  });

  // ── widok rodzic / dziecko ──
  function paintView(v) {
    P.view = v;
    [].forEach.call(P.el.querySelectorAll('[data-pv-view]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-pv-view') === v)); });
  }
  function setView(v) {
    paintView(v === 'kid' ? 'kid' : 'parent');
    if (P.ready) post({ type: 'qp:view', view: P.view });
    else if (!P.demo && P.it) { P.key = ''; load(); }   // bez mostka: przeładuj z ?view=kid
    var open = P.el.querySelector('#tvPhoneOpen'); if (!P.demo && P.it) { P.url = liveUrl(P.it, P.view); if (P.url) open.href = P.url; }
  }

  // ── panel → telefon: pole szkicu → przystanek / fragment na stronie ──
  function stopNum(key) { var x = (A.state.tvStops || []).filter(function (s) { return s.key === key; })[0]; return x ? x.s.stop_number : null; }
  function rowMsg(row, quote) {
    var sec = row.closest('.adm-stopx, .tv-card'), key = sec ? sec.getAttribute('data-spy') : '_city';
    if (!key || key === '_sum') key = '_city';
    var cm = row.querySelector('.adm-cm'), f = cm ? String(cm.getAttribute('data-field') || '').replace(/^(stop|city)\./, '') : '';
    return { type: 'qp:focus', stop: key, num: key === '_city' ? null : stopNum(key), field: f || null, quote: quote || null };
  }
  function focusFrom(row, quote) {
    if (!row || !P.el || P.el.hidden) return;
    var m = rowMsg(row, quote), sig = m.stop + '|' + m.field + '|' + (m.quote || '');
    if (sig === P.lastFocus && Date.now() - P.lastFocusAt < 600) return;   // click + focusin tego samego pola
    P.lastFocus = sig; P.lastFocusAt = Date.now();
    if (P.ready) post(m); else P.pending = m;
  }
  var $d = document.getElementById('detail');
  $d.addEventListener('click', function (e) {
    if (e.target.closest('a[href], .adm-flag, .adm-pop, .adm-q__it, [data-qa], .adm-cm__send')) {
      var to = e.target.closest('[data-to]');
      if (to) { var k = to.getAttribute('data-to'), sec = document.getElementById('st-' + k); if (sec) focusFrom(sec.querySelector('.adm-row') || sec); }
      return;
    }
    var row = e.target.closest('#tvFields .adm-row'); if (row) focusFrom(row);
    var pv = e.target.closest('[data-pv-toggle]'); if (pv) toggle(pv);
  });
  $d.addEventListener('focusin', function (e) { var row = e.target.closest && e.target.closest('#tvFields .adm-row'); if (row && e.target.matches('textarea')) focusFrom(row); });
  document.addEventListener('adm:walk', function (e) {
    var row = document.querySelector('#tvFields .adm-row.is-walk-target'); if (!row) return;
    var id = e.detail && e.detail.id, x = (A.state.qa ? A.state.qa.list : []).filter(function (y) { return A.qaId(y) === id; })[0];
    focusFrom(row, x && x.quote ? String(x.quote) : null);
  });

  // ── telefon → panel: klik w przystanek / fragment → pole w panelu ──
  function panelFocus(m) {
    if ((A.state.tvView || 'fields') !== 'fields') { A.state.tvView = 'fields'; A.viewApply(); }
    var key = m.stop && m.stop !== '_city' ? m.stop : null;
    if (!key && m.num != null) { var x = (A.state.tvStops || []).filter(function (s) { return s.s.stop_number === +m.num; })[0]; key = x ? x.key : null; }
    var sec = document.getElementById('st-' + (key || '_city')); if (!sec) return;
    var row = null;
    if (m.field) { var cm = sec.querySelector('.adm-cm[data-field="' + (key ? 'stop.' : 'city.') + String(m.field).replace(/["\\]/g, '') + '"]'); row = cm ? cm.closest('.adm-row') : null; }
    var target = row || sec;
    target.scrollIntoView({ block: row ? 'center' : 'start', behavior: window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' });
    [].forEach.call(document.querySelectorAll('.is-pv-target'), function (n) { n.classList.remove('is-pv-target'); });
    target.classList.add('is-pv-target'); sec.classList.add('is-pv-target');
    clearTimeout(P.flashT); P.flashT = setTimeout(function () { target.classList.remove('is-pv-target'); sec.classList.remove('is-pv-target'); }, 1500);
  }

  // ── układ: dok (≥1200 px) / arkusz (mniejsze ekrany) ──
  function tripOpen() { return TRIP_RE.test(location.hash) && !SECTIONS.test(location.hash) && !!A.state.trip; }
  function paintToggle() {
    [].forEach.call(document.querySelectorAll('[data-pv-toggle]'), function (b) { b.setAttribute('aria-pressed', String(!P.el.hidden)); });
  }
  function apply() {
    if (!P.el) return;
    if (!tripOpen() || !P.it) { P.el.hidden = true; P.el.classList.remove('is-sheet'); document.body.classList.remove('has-phone', 'has-phone-sheet'); return; }
    if (P.sheet) { P.el.hidden = false; P.el.classList.add('is-sheet'); document.body.classList.add('has-phone-sheet'); document.body.classList.remove('has-phone'); }
    else if (WIDE.matches && P.on) { P.el.hidden = false; P.el.classList.remove('is-sheet'); document.body.classList.add('has-phone'); document.body.classList.remove('has-phone-sheet'); }
    else { P.el.hidden = true; P.el.classList.remove('is-sheet'); document.body.classList.remove('has-phone', 'has-phone-sheet'); }
    paintToggle();
  }
  function dockHide() { P.on = false; apply(); var b = document.querySelector('[data-pv-toggle]'); if (b) b.focus(); }
  function sheetOpen() { P.sheet = true; apply(); load(); var x = P.el.querySelector('.tv-phone__x'); if (x) x.focus(); }
  function sheetClose() { P.sheet = false; apply(); var b = document.querySelector('[data-pv-toggle]'); if (b) b.focus(); }
  function toggle(btn) {
    if (WIDE.matches) { P.on = !P.on; apply(); if (P.on) load(); }
    else { P.sheet ? sheetClose() : sheetOpen(); }
  }
  function ensureButton() {
    var r = document.querySelector('#detail .tv-tools__r'); if (!r || r.querySelector('[data-pv-toggle]')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'qc-btn qc-btn--sm tv-pvbtn'; b.setAttribute('data-pv-toggle', ''); b.setAttribute('aria-controls', 'tvPhone'); b.setAttribute('aria-pressed', 'false');
    b.title = 'Podgląd wersji na telefonie obok pól';
    b.innerHTML = ICON + ' Podgląd';
    r.insertBefore(b, r.firstChild);
  }
  document.addEventListener('adm:render', function (e) {
    build();
    P.it = e.detail && e.detail.it || A.state.current || null;
    var v = P.el.querySelector('#tvPhoneV'); if (v && P.it) v.textContent = (P.it.label || 'v' + P.it.version) + ' · ' + (A.VST[P.it.status] || P.it.status);
    ensureButton();
    apply();
    if (!P.el.hidden) load();
  });
  document.addEventListener('adm:route', function () {
    if (tripOpen()) return;
    P.it = null; P.key = ''; P.sheet = false;
    if (P.frame) { P.frame.removeAttribute('srcdoc'); P.frame.src = 'about:blank'; }
    apply();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && P.sheet) { e.preventDefault(); sheetClose(); } });
  if (WIDE.addEventListener) WIDE.addEventListener('change', function () { apply(); if (!P.el.hidden) load(); });

  window.AdmPreview = {
    open: function (view) {
      build(); if (view) paintView(view === 'kid' ? 'kid' : 'parent');
      if (WIDE.matches) { P.on = true; P.sheet = false; apply(); load(); } else sheetOpen();
      if (view && P.ready) post({ type: 'qp:view', view: P.view });
    },
    setView: setView, isOpen: function () { return !!P.el && !P.el.hidden; }, view: function () { return P.view; }
  };
})();
