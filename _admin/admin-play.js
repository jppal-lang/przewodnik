/* ============================================================
   Panel admina — „ZAGRAJ JAK DZIECKO” (JP 2026-10-31, „efekt WOW”)
   Symulator gry dla szkicu: JP przechodzi trasę tak, jak przejdzie ją 8-latek, zanim ją zatwierdzi.
   - Telefon: ta sama ramka co „Podgląd” (admin-preview.js: prawdziwa strona szkicu w widoku dziecka,
     w demo strona zastępcza z misjami, naklejkami i pytaniem z wyborem) — przeniesiona na scenę gry.
   - Postęp przychodzi z telefonu przez mostek (preview-bridge.js, qp:progress), polecenia idą qp:cmd.
   - HUD gracza (lewo): przystanki, misje, naklejki (grafiki ze strony), pytania, czas sesji.
   - Oko redaktora (prawo): bieżący przystanek i pole, liczba słów misji, trudność, „Oflaguj to”
     (istniejąca uwaga do pola — commentBox w karcie, bez wysyłania), „Następny przystanek”, „Resetuj postęp”
     (TYLKO ta ramka — nigdy konto rodziny).
   - Zero śledzenia, zero localStorage. Stan gry żyje w pamięci do zamknięcia (Esc / ×).
   ============================================================ */
(function () {
  'use strict';
  var A = window.ADM; if (!A) return;
  var MARK = 'quolino-preview', esc = A.esc;
  var G = { on: false, el: null, phoneHome: null, phonePh: null, start: 0, tick: null, st: null, cur: null, curField: null, lock: 0, lockT: null,
    right: 0, wrong: 0, flagsAt: 0, flags: 0, stickers: {}, missions: {}, lastFocus: null, ended: false, hudOpen: false };
  var ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3l14 9-14 9z"/></svg>';
  var FLAG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 2.5a1 1 0 0 1 1 1V4h11.2a1 1 0 0 1 .8 1.6L15.6 9l2.4 3.4a1 1 0 0 1-.8 1.6H6v7a1 1 0 1 1-2 0V3.5a1 1 0 0 1 1-1z"/></svg>';
  var FIELD_PL = { kids_box: 'Misja dla dzieci', kids_choice: 'Odpowiedzi do wyboru', hint: 'Podpowiedź', desc_paragraphs: 'Opis', photo_task: 'Zadanie foto', fun_fact: 'Fun fact', name: 'Nazwa', legend: 'Legenda', curiosity: 'Ciekawostka',
    time_label: 'Godzina', practical_note: 'Praktycznie', opening_hours: 'Godziny', dress_code: 'Strój', local_flavor: 'Lokalny smak', price: 'Bilet', visit_duration: 'Czas', category: 'Ikona', hero_image: 'Zdjęcie', pop_culture: 'Popkultura', sources: 'Źródła' };
  function tripOpen() { return /^#\/[^/]+(\/v\d+)?$/.test(location.hash) && !/^#\/(trasy|decyzje|straznicy|ikony|postep|pipeline|mapa|zgloszenia|koszty|baza-wiedzy|pulpit)$/.test(location.hash) && !!A.state.trip; }
  function plForm(n, one, few, many) { var d = n % 10, t = n % 100; return n + ' ' + (n === 1 ? one : d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many); }
  function mmss(ms) { var s = Math.round(ms / 1000), m = Math.floor(s / 60); return m + ':' + ('0' + (s % 60)).slice(-2); }
  function minLabel(ms) { var m = Math.max(1, Math.round(ms / 60000)); return plForm(m, 'minuta', 'minuty', 'minut'); }
  function stopKeyOf(num) { var S = (A.state.tvStops || []).filter(function (x) { return x.s && x.s.stop_number === num; })[0]; return S ? S.key : null; }
  function stopName(num) { var S = (A.state.tvStops || []).filter(function (x) { return x.s && x.s.stop_number === num; })[0]; return S && S.t && S.t.name || ('Przystanek ' + num); }
  // trudność misji: słowa + liczby + pytanie z wyborem (orientacyjnie, dla 8-latka)
  function difficulty(stop) {
    if (!stop) return ['—', ''];
    var w = stop.words || 0, lvl = w <= 25 ? 1 : w <= 45 ? 2 : 3;
    if (stop.choice) lvl = Math.min(3, lvl + 1);
    return [['łatwa', 'średnia', 'trudna'][lvl - 1], lvl];
  }

  // ── scena ──
  function build() {
    if (G.el) return G.el;
    var el = document.createElement('div');
    el.className = 'play'; el.id = 'play'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'playTitle');
    el.innerHTML = '<header class="play__top"><h2 id="playTitle" class="play__title">' + ICON + ' Zagraj jak dziecko <span class="play__trip" id="playTrip"></span></h2>' +
      '<span class="play__clock" id="playClock" aria-live="off">0:00</span>' +
      '<button type="button" class="play__hudbtn" id="playHudBtn" aria-expanded="false" aria-controls="playHud">HUD</button>' +
      '<button type="button" class="adm-pop__x play__x" data-play-close aria-label="Zamknij symulator (Esc)">×</button></header>' +
      '<div class="play__body">' +
      '<aside class="play__hud" id="playHud" aria-label="Gracz"><h3>Gracz</h3>' +
        '<section class="play__sec"><p class="play__l">Przystanki</p><ol class="play__dots" id="playDots"></ol><p class="play__v" id="playStops">—</p></section>' +
        '<section class="play__sec"><p class="play__l">Misje</p><p class="play__big" id="playMissions">0 / 0</p></section>' +
        '<section class="play__sec"><p class="play__l">Naklejki</p><ul class="play__stk" id="playStickers"></ul></section>' +
        '<section class="play__sec"><p class="play__l">Pytania z wyborem</p><p class="play__v"><b id="playRight">0</b> trafione · <b id="playWrong">0</b> pomyłki</p>' +
          '<p class="play__lock" id="playLock" role="status" aria-live="polite" hidden>⏳ Zła odpowiedź — czas namysłu <b>3</b> s</p></section>' +
      '</aside>' +
      '<div class="play__stage" id="playStage"><div class="play__slot" id="playSlot"></div></div>' +
      '<aside class="play__eye" id="playEye" aria-label="Oko redaktora"><h3>Oko redaktora</h3>' +
        '<section class="play__sec"><p class="play__l">Dziecko jest przy</p><p class="play__v play__cur" id="playCur">—</p><p class="play__v play__field" id="playField"></p></section>' +
        '<section class="play__sec"><dl class="play__meta"><div><dt>Słów w misji</dt><dd id="playWords">—</dd></div><div><dt>Trudność</dt><dd id="playDiff">—</dd></div><div><dt>Pytanie z wyborem</dt><dd id="playChoice">—</dd></div></dl></section>' +
        '<section class="play__sec play__acts">' +
          '<button type="button" class="qc-btn qc-btn--sm play__flag" data-play-flag>' + FLAG + ' Oflaguj to</button>' +
          '<button type="button" class="qc-btn qc-btn--sm" data-play-next>Następny przystanek →</button>' +
          '<button type="button" class="adm-linkbtn play__reset" data-play-reset>Resetuj postęp (tylko ta ramka)</button>' +
          '<p class="play__note">Reset czyści misje tylko w tym podglądzie — nic nie zmienia na koncie rodziny.</p>' +
          '<p class="play__v" id="playFlags">Flagi dodane w trakcie: <b>0</b></p></section>' +
      '</aside></div>' +
      '<div class="play__end" id="playEnd" hidden role="status"></div>';
    document.body.appendChild(el);
    G.el = el;
    el.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-play-close]')) { close(); return; }
      if (t.closest('[data-play-next]')) { next(); return; }
      if (t.closest('[data-play-reset]')) { reset(); return; }
      if (t.closest('[data-play-flag]')) { flagIt(); return; }
      if (t.closest('[data-play-again]')) { reset(); hideEnd(); return; }
      if (t.closest('#playHudBtn')) { G.hudOpen = !G.hudOpen; el.classList.toggle('is-hud', G.hudOpen); document.getElementById('playHudBtn').setAttribute('aria-expanded', String(G.hudOpen)); return; }
    });
    return el;
  }
  function phone() { return document.getElementById('tvPhone'); }

  // ── start / koniec ──
  function open() {
    if (!tripOpen() || !window.AdmPreview) return;
    build();
    var ph = phone();
    G.pvWas = !!(window.AdmPreview.isOpen && window.AdmPreview.isOpen());   // szuflada „Podgląd” otwarta przed grą → po grze wraca
    if (!ph) { window.AdmPreview.open('kid'); ph = phone(); }
    if (!ph) return;
    G.lastFocus = document.activeElement;
    // sesja gry trwa, dopóki JP nie zresetuje albo nie zmieni wersji — „Oflaguj to” zamyka scenę i wraca, więc liczniki i czas zostają
    var sameSession = G.sess && A.state.current && G.sess === (A.state.trip.slug + '|' + A.state.current.version);
    if (!sameSession) { G.sess = A.state.trip.slug + '|' + (A.state.current ? A.state.current.version : ''); G.start = Date.now(); G.right = 0; G.wrong = 0; G.flagsAt = unsent(); G.flags = 0; G.stickers = {}; G.missions = {}; G.pause = 0; }
    else if (G.pausedAt) { G.start += Date.now() - G.pausedAt; }
    G.pausedAt = 0; G.on = true; G.ended = false; G.st = null; G.cur = null; G.curField = null;
    hideEnd();
    // telefon na scenę (jeden węzeł; wraca na miejsce przy zamknięciu)
    G.phoneHome = ph.parentNode; G.phonePh = document.createComment('phone'); ph.parentNode.insertBefore(G.phonePh, ph);
    document.getElementById('playSlot').appendChild(ph);
    ph.hidden = false; ph.classList.add('is-play'); ph.classList.remove('is-sheet');
    document.body.classList.add('has-play');
    G.el.hidden = false;
    fitNarrow();
    var T = A.state.trip, it = A.state.current;
    document.getElementById('playTrip').textContent = (T ? T.name : '') + (it ? ' · ' + (it.label || 'v' + it.version) : '');
    window.AdmPreview.open('kid');
    cmd({ cmd: 'view', view: 'kid' }); cmd({ cmd: 'state' });
    clearInterval(G.tick); G.tick = setInterval(function () { var c = document.getElementById('playClock'); if (c) c.textContent = mmss(Date.now() - G.start); }, 1000);
    paint();
    var x = G.el.querySelector('[data-play-close]'); if (x) x.focus();
    [].forEach.call(document.querySelectorAll('[data-play-open]'), function (b) { b.setAttribute('aria-pressed', 'true'); });
  }
  function close() {
    if (!G.on) return;
    G.on = false; G.pausedAt = Date.now(); clearInterval(G.tick); clearTimeout(G.lockT);
    var ph = phone();
    if (ph) { ph.classList.remove('is-play'); if (G.phonePh && G.phonePh.parentNode) { G.phonePh.parentNode.insertBefore(ph, G.phonePh); G.phonePh.parentNode.removeChild(G.phonePh); } }
    G.phonePh = null;
    G.el.hidden = true; document.body.classList.remove('has-play');
    if (!G.pvWas && window.AdmPreview && window.AdmPreview.isOpen && window.AdmPreview.isOpen()) { var xb = ph && ph.querySelector('[data-pv-close]:not(.tv-phone__back)'); if (xb) xb.click(); }
    else if (G.pvWas && window.AdmPreview && !(window.AdmPreview.isOpen && window.AdmPreview.isOpen())) { window.AdmPreview.open(); }
    [].forEach.call(document.querySelectorAll('[data-play-open]'), function (b) { b.setAttribute('aria-pressed', 'false'); });
    if (G.lastFocus && G.lastFocus.focus) G.lastFocus.focus();
  }
  function cmd(m) {
    var f = document.getElementById('tvPhoneFrame'); if (!f || !f.contentWindow) return;
    m.q = MARK; m.v = 1; m.type = 'qp:cmd';
    try { f.contentWindow.postMessage(m, frameOrigin()); } catch (e) { /* cisza */ }
  }
  function unsent() { return (A.state.comments || []).filter(function (c) { return c.status === 'new' || c.status === 'local'; }).length; }

  // ── postęp z telefonu ──
  function frameOrigin() { return A.DEMO ? location.origin : (function () { try { return new URL(A.SITE).origin; } catch (x) { return ''; } })(); }
  window.addEventListener('message', function (e) {
    if (!G.on || !e.data || e.data.q !== MARK) return;
    var f = document.getElementById('tvPhoneFrame');
    if (!f || e.source !== f.contentWindow || e.origin !== frameOrigin()) return;   // tylko telefon na scenie, tylko dozwolone źródło
    var m = e.data;
    if (m.type === 'qp:ready') { cmd({ cmd: 'view', view: 'kid' }); cmd({ cmd: 'state' }); return; }
    if (m.type === 'qp:click') { if (m.num) { G.cur = m.num; G.curField = m.field || null; } else if (!m.stop || m.stop === '_city') { G.curField = null; } paint(); return; }
    if (m.type !== 'qp:progress') return;
    if (m.kind === 'state') { G.st = m; if (!G.cur && m.stops && m.stops[0]) G.cur = m.stops[0].num; paint(); checkEnd(); return; }
    if (m.num) G.cur = m.num;
    if (m.kind === 'task') { G.curField = 'kids_box'; G.missions[m.key] = !!m.ok; }
    else if (m.kind === 'sticker') { G.stickers[m.stop || m.num] = 1; }
    else if (m.kind === 'choice') { G.curField = 'kids_choice'; if (m.ok) G.right++; else G.wrong++; }
    else if (m.kind === 'lock') { lock(m.ok ? (m.ms || 3000) : 0); }
    else if (m.kind === 'stop') { G.curField = null; }
    cmd({ cmd: 'state' });
    paint();
  });
  function lock(ms) {
    var el = document.getElementById('playLock'); if (!el) return;
    clearTimeout(G.lockT);
    if (!ms) { el.hidden = true; G.lock = 0; G.el.classList.remove('is-locked'); return; }
    G.lock = Date.now() + ms; el.hidden = false; G.el.classList.add('is-locked');
    var tick = function () { var l = Math.max(0, G.lock - Date.now()); el.querySelector('b').textContent = Math.ceil(l / 1000); if (l > 0) G.lockT = setTimeout(tick, 250); else { el.hidden = true; G.el.classList.remove('is-locked'); } };
    tick();
  }

  // ── HUD + oko ──
  function paint() {
    if (!G.on) return;
    var S = G.st, stops = S ? S.stops : [], total = stops.length;
    var doneStops = stops.filter(function (s) { return s.tasks ? s.done >= s.tasks : s.sticker; }).length;
    document.getElementById('playDots').innerHTML = stops.map(function (s) {
      var cls = s.num === G.cur ? ' is-cur' : '', st = s.tasks ? (s.done >= s.tasks ? ' is-done' : s.done ? ' is-part' : '') : (s.sticker ? ' is-done' : ' is-free');
      return '<li class="play__dot' + cls + st + '" title="' + esc(s.name) + '"><span class="adm-sr">' + esc(s.name + (s.done >= s.tasks && s.tasks ? ' — misja wykonana' : '')) + '</span></li>';
    }).join('');
    document.getElementById('playStops').textContent = total ? doneStops + ' z ' + total + ' przystanków zaliczonych' : 'czekam na telefon…';
    document.getElementById('playMissions').textContent = (S ? S.tasksDone : 0) + ' / ' + (S ? S.tasksTotal : 0);
    document.getElementById('playStickers').innerHTML = stops.filter(function (s) { return s.collectable; }).map(function (s) {
      return '<li class="play__stkit' + (s.sticker ? ' is-got' : '') + '" title="' + esc(s.name) + '">' + (s.icon ? '<img src="' + esc(s.icon) + '" alt="" width="40" height="40">' : '<span class="play__stkno">' + s.num + '</span>') +
        '<span class="adm-sr">' + esc(s.name + (s.sticker ? ' — zdobyta' : ' — jeszcze nie')) + '</span></li>';
    }).join('');
    document.getElementById('playRight').textContent = G.right; document.getElementById('playWrong').textContent = G.wrong;
    var cur = stops.filter(function (s) { return s.num === G.cur; })[0];
    document.getElementById('playCur').textContent = cur ? ('0' + cur.num).slice(-2) + ' · ' + cur.name : '—';
    document.getElementById('playField').textContent = G.curField ? 'pole: ' + (FIELD_PL[G.curField] || G.curField) : '';
    document.getElementById('playWords').textContent = cur ? (cur.words || 0) : '—';
    var d = difficulty(cur); document.getElementById('playDiff').innerHTML = cur ? '<span class="play__diff play__diff--' + d[1] + '">' + d[0] + '</span>' : '—';
    document.getElementById('playChoice').textContent = cur ? (cur.choice ? 'tak' : 'nie') : '—';
    G.flags = Math.max(0, unsent() - G.flagsAt);
    document.getElementById('playFlags').innerHTML = 'Flagi dodane w trakcie: <b>' + G.flags + '</b>';
    var nb = G.el.querySelector('[data-play-next]'), last = !!cur && !stops.some(function (s) { return s.num > cur.num; });
    if (nb) { nb.disabled = !cur; nb.textContent = last ? 'Zakończ trasę ✓' : 'Następny przystanek →'; nb.classList.toggle('qc-btn--primary', last); }
  }
  function next() {
    var S = G.st; if (!S) return;
    var nx = S.stops.filter(function (s) { return G.cur == null || s.num > G.cur; })[0];
    if (!nx) { if (!G.ended) showEnd(); return; }   // ostatni przystanek: „Zakończ trasę” — podsumowanie także bez kompletu misji (np. 6/7)
    G.cur = nx.num; G.curField = null; cmd({ cmd: 'goto', num: nx.num }); paint();
  }
  function reset() { G.right = 0; G.wrong = 0; G.stickers = {}; G.missions = {}; G.start = Date.now(); G.flagsAt = unsent(); G.ended = false; cmd({ cmd: 'reset' }); lock(0); hideEnd(); paint(); }
  // „Oflaguj to”: uwaga do pola, przy którym jest dziecko — istniejące pole uwagi w karcie przystanku (bez wysyłania)
  function flagIt() {
    var key = G.cur != null ? stopKeyOf(G.cur) : null, field = G.curField || 'kids_box';
    if (!key) return;
    close();
    if ((A.state.tvView || 'fields') !== 'fields') { A.state.tvView = 'fields'; A.viewApply(); }
    var sel = '#tvFields .adm-cm[data-stop="' + key.replace(/"/g, '') + '"][data-field="stop.' + field + '"]';
    var box = document.querySelector(sel) || document.querySelector('#tvFields .adm-cm[data-stop="' + key.replace(/"/g, '') + '"][data-field="stop.kids_box"]') || document.querySelector('#tvFields .adm-cm[data-stop="' + key.replace(/"/g, '') + '"]');
    if (!box) return;
    var acc = box.closest('details.adm-acc'); if (acc) acc.open = true;
    var row = box.closest('.adm-row') || box; row.scrollIntoView({ block: 'center' });
    var ta = box.querySelector('textarea'); if (ta) { ta.focus(); if (!ta.value) ta.value = 'Z gry: '; ta.dispatchEvent(new Event('input', { bubbles: true })); ta.setSelectionRange(ta.value.length, ta.value.length); }
    [].forEach.call(document.querySelectorAll('.is-play-flag'), function (x) { x.classList.remove('is-play-flag'); });
    row.classList.add('is-play-flag'); setTimeout(function () { row.classList.remove('is-play-flag'); }, 2500);
  }
  function checkEnd() {
    var S = G.st; if (!S || G.ended || !S.tasksTotal) return;
    if (S.tasksDone >= S.tasksTotal) showEnd();
  }
  function showEnd() {
    var S = G.st; if (!S) return;
    G.ended = true; clearInterval(G.tick);
    var T = A.state.trip, got = S.stops.filter(function (s) { return s.sticker; }).length, ms = Date.now() - G.start;
    var e = document.getElementById('playEnd');
    e.innerHTML = '<div class="play__endbox"><p class="play__endk">Koniec trasy</p><h3>Przeszedłeś ' + esc(T ? T.name : 'trasę') + ' jak dziecko</h3>' +
      '<ul class="play__endlist"><li><b>' + S.tasksDone + '/' + S.tasksTotal + '</b> misji</li><li><b>' + got + '</b> ' + (got === 1 ? 'naklejka' : got >= 2 && got <= 4 ? 'naklejki' : 'naklejek') + '</li>' +
      '<li><b>' + G.wrong + '</b> ' + (G.wrong === 1 ? 'pomyłka' : G.wrong >= 2 && G.wrong <= 4 ? 'pomyłki' : 'pomyłek') + ' w pytaniach</li><li><b>' + minLabel(ms) + '</b> (' + mmss(ms) + ')</li></ul>' +
      '<p class="play__v">Flagi dodane w trakcie: <b>' + Math.max(0, unsent() - G.flagsAt) + '</b></p>' +
      '<p class="play__endacts"><button type="button" class="qc-btn qc-btn--primary" data-play-close>Wróć do trasy</button><button type="button" class="qc-btn qc-btn--sm" data-play-again>Zagraj jeszcze raz</button></p></div>';
    e.hidden = false; var b = e.querySelector('[data-play-close]'); if (b) b.focus();
  }
  function hideEnd() { var e = document.getElementById('playEnd'); if (e) { e.hidden = true; e.innerHTML = ''; } }

  // telefon (< 900 px): oko redaktora wędruje do arkusza HUD (jeden rozwijany pasek u dołu)
  var narrow = window.matchMedia('(max-width:899px)');
  function fitNarrow() {
    if (!G.el) return;
    var hud = document.getElementById('playHud'), eye = document.getElementById('playEye'), body = G.el.querySelector('.play__body');
    if (narrow.matches) { if (eye.parentNode !== hud) hud.insertBefore(eye, hud.firstChild); }
    else { if (eye.parentNode !== body) body.appendChild(eye); G.hudOpen = false; G.el.classList.remove('is-hud'); }
  }
  if (narrow.addEventListener) narrow.addEventListener('change', fitNarrow);
  // ── przycisk w pasku akcji + paleta + Esc ──
  function ensureButton() {
    var r = document.querySelector('#detail .tv-tools__r'); if (!r || r.querySelector('[data-play-open]')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'qc-btn qc-btn--sm play__btn'; b.setAttribute('data-play-open', ''); b.setAttribute('aria-pressed', 'false');
    b.title = 'Symulator: przejdź szkic tak, jak przejdzie go dziecko';
    b.innerHTML = ICON + ' Zagraj jak dziecko';
    r.appendChild(b);
  }
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-play-open]')) { G.on ? close() : open(); } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && G.on) { e.preventDefault(); e.stopPropagation(); close(); } }, true);
  document.addEventListener('adm:render', ensureButton);
  document.addEventListener('adm:route', function () { if (!tripOpen() && G.on) close(); });
  window.AdmPlay = { open: open, close: close, isOn: function () { return G.on; }, state: function () { return G; } };
})();
