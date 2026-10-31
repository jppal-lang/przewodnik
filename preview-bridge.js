/* ============================================================
   Mostek podglądu (JP 2026-10-31): strona miasta osadzona w panelu admina
   („telefon obok pól”). Działa WYŁĄCZNIE, gdy strona jest w ramce (iframe)
   otwartej z dozwolonego źródła — https://admin.quolino.com albo ta sama
   domena (podgląd w trybie demo). Na zwykłej stronie ten plik nic nie robi.

   Protokół (window.postMessage, każda wiadomość ma q:'quolino-preview', v:1):
     strona → panel:  qp:ready {slug, version, view}   gotowa, przystanki w DOM
                      qp:click {stop, num, field}      klik w przystanek / fragment
                      qp:view  {view}                  po zmianie widoku
     panel → strona:  qp:focus {stop, num, field, quote}  przewiń i podświetl 1,5 s
                      qp:view  {view: 'kid' | 'parent'}   przełącz widok
                      qp:ping                            odpowiedz qp:ready, jeśli gotowa
   Zero śledzenia, zero zapisu w przeglądarce. Nic nie zmienia treści strony.
   ============================================================ */
(function () {
  'use strict';
  if (window.parent === window) return;                 // nie w ramce
  var ALLOWED = ['https://admin.quolino.com'];
  var origin = (function () {
    try { if (window.parent.location.origin) return window.parent.location.origin; } catch (e) { /* inna domena */ }
    try { return new URL(document.referrer).origin; } catch (e) { return ''; }
  })();
  var self_ = (window.origin && window.origin !== 'null') ? window.origin : location.origin;   // srcdoc (demo) ma location.origin = "null", window.origin = domena panelu
  if (!origin || (ALLOWED.indexOf(origin) < 0 && origin !== self_)) return;

  var MARK = 'quolino-preview', HL_MS = 1500;
  // pole szkicu → miejsce na stronie (w karcie przystanku .qc-stop)
  var STOP_FIELD = {
    name: '.qc-stop__name', time_label: '.qc-stop__time', desc_paragraphs: '.qc-prose',
    kids_box: '.qc-task:not(.qc-task--photo)', hint: '.qc-task__hint', kids_choice: '.qk-choice', photo_task: '.qc-task--photo',
    practical_note: '.qc-note:not(.qc-note--hours):not(.qc-note--dress):not(.qc-note--flavor)',
    opening_hours: '.qc-note--hours', dress_code: '.qc-note--dress', local_flavor: '.qc-note--flavor',
    price: '.qc-stop__meta', year_built: '.qc-stop__meta', visit_duration: '.qc-stop__meta', maps_query: '.qc-stop__meta',
    category: '.qc-stop__head img, .qc-stop__head svg', hero_image: '.qc-stop__photo', website: '.qc-links', phone: '.qc-links',
    fun_fact: '.qc-funfact', legend: '.qc-block--legend', curiosity: '.qc-block--curiosity', pop_culture: '.qc-block--pop', sources: '.qc-block'
  };
  // pola miasta → miejsce na stronie (poza kartami przystanków)
  var CITY_FIELD = {
    title: '.qc-title', subtitle: '.qc-title ~ p, .qc-title + *', lead: '.qc-box:not(.qc-box--fest):not(.qc-box--qr)',
    good_to_know: '.qc-box .qc-box__label', local_food: '.qc-box--fest', hero_image: '.qc-hero', duration_type: '.qc-stat', duration_hours: '.qc-stat',
    emergency: '#awaryjne', day_plan: '.qc-stops'
  };
  var ready = false, hlTimer = null, hlEl = null;

  function send(msg) { msg.q = MARK; msg.v = 1; try { window.parent.postMessage(msg, origin); } catch (e) { /* cisza */ } }
  function root() { return document.getElementById('city'); }
  function view() { var r = root(); return r && r.dataset.view === 'kid' ? 'kid' : 'parent'; }
  function slug() { try { return new URLSearchParams(location.search).get('c') || (window.QDraft && window.QDraft.info && window.QDraft.info.city_slug) || ''; } catch (e) { return ''; }
  }
  function version() { return window.QDraft && window.QDraft.info ? window.QDraft.info.version : null; }

  function css() {
    if (document.getElementById('qpStyle')) return;
    var s = document.createElement('style'); s.id = 'qpStyle';
    s.textContent = '.qp-hl{outline:3px solid var(--sun,#FFC629)!important;outline-offset:3px;border-radius:8px;transition:outline-color .4s}' +
      '.qp-hl--off{outline-color:transparent!important}' +
      '::highlight(qp-quote){background:var(--sun,#FFC629);color:var(--sun-ink,#3B2A00)}';
    document.head.appendChild(s);
  }
  function clearHl() {
    clearTimeout(hlTimer);
    if (hlEl) { hlEl.classList.remove('qp-hl', 'qp-hl--off'); hlEl = null; }
    try { if (window.CSS && CSS.highlights) CSS.highlights.delete('qp-quote'); } catch (e) { /* brak API */ }
  }
  function highlight(el, quote) {
    clearHl(); css();
    hlEl = el; el.classList.add('qp-hl');
    if (quote && window.CSS && CSS.highlights && window.Highlight) {
      try {
        var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), n, q = String(quote), found = null;
        while ((n = w.nextNode())) { var i = n.nodeValue.indexOf(q); if (i >= 0) { found = [n, i]; break; } }
        if (found) { var r = new Range(); r.setStart(found[0], found[1]); r.setEnd(found[0], found[1] + q.length); CSS.highlights.set('qp-quote', new Highlight(r)); }
      } catch (e) { /* bez zaznaczenia cytatu */ }
    }
    hlTimer = setTimeout(function () { if (hlEl === el) el.classList.add('qp-hl--off'); setTimeout(clearHl, 450); }, HL_MS);
  }
  function visible(el) { return !!el && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); }
  function stopEl(m) {
    var el = m.stop ? document.querySelector('.qc-stop[data-stop-key="' + String(m.stop).replace(/["\\]/g, '') + '"]') : null;
    if (!el && m.num != null) el = document.querySelector('.qc-stop[data-stop-num="' + String(+m.num) + '"]');
    return el;
  }
  function pick(scope, sel) {
    if (!sel) return null;
    var list = scope.querySelectorAll(sel);
    for (var i = 0; i < list.length; i++) if (visible(list[i])) return list[i];
    return null;
  }
  function focus(m) {
    var el, target;
    if (m.stop && m.stop !== '_city') {
      el = stopEl(m); if (!el) return false;
      if (el.tagName === 'DETAILS' && !el.open) el.open = true;
      target = pick(el, STOP_FIELD[m.field]) || el;
    } else {
      target = pick(document, CITY_FIELD[m.field]) || document.querySelector('.qc-title') || document.getElementById('mainContent');
      if (target && target.classList && target.classList.contains('qc-box__label')) target = target.parentNode;
      if (!target) return false;
    }
    var box = target.closest && target.closest('.qc-note, .qc-task, .qc-block, .qc-prose, .qc-box, .qc-stop__head') || target;
    try { box.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' }); } catch (e) { box.scrollIntoView(); }
    highlight(box, m.quote);
    return true;
  }
  function setView(v) {
    var r = root(); if (!r) return;
    var want = v === 'kid' ? 'kid' : 'adult';
    if (r.dataset.view === want) return;
    var btn = document.getElementById('qcKidToggle');
    if (btn) btn.click(); else r.dataset.view = want;
    send({ type: 'qp:view', view: view() });
  }
  function fieldOf(el, stop) {
    var map = stop ? STOP_FIELD : CITY_FIELD, best = null;
    for (var k in map) { if (el.closest(map[k]) ) { best = k; break; } }
    return best;
  }
  function announce() {
    if (!document.querySelector('.qc-stop') && !document.querySelector('.qc-title')) return;
    ready = true;
    send({ type: 'qp:ready', slug: slug(), version: version(), view: view(), kind: window.QDraft ? 'draft' : 'public' });
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== origin || !e.data || e.data.q !== MARK || typeof e.data.type !== 'string') return;
    var m = e.data;
    if (m.type === 'qp:ping') { if (ready) announce(); return; }
    if (m.type === 'qp:view') { setView(m.view); return; }
    if (m.type === 'qp:focus') { focus(m); return; }
  });
  document.addEventListener('click', function (e) {
    var t = e.target; if (!t || !t.closest) return;
    var st = t.closest('.qc-stop');
    if (st) { send({ type: 'qp:click', stop: st.getAttribute('data-stop-key') || '', num: +st.getAttribute('data-stop-num') || null, field: fieldOf(t, true) }); return; }
    var main = document.getElementById('mainContent');
    if (main && main.contains(t)) send({ type: 'qp:click', stop: '_city', num: null, field: fieldOf(t, false) });
  }, true);

  var main = document.getElementById('mainContent');
  var mo = main && window.MutationObserver ? new MutationObserver(function () { if (document.querySelector('.qc-stop')) { mo.disconnect(); announce(); } }) : null;
  if (mo) mo.observe(main, { childList: true, subtree: true });
  if (document.querySelector('.qc-stop')) { if (mo) mo.disconnect(); announce(); }
  setTimeout(function () { if (!ready) announce(); }, 15000);   // np. błąd wczytania treści — panel i tak dostanie znak życia
})();
