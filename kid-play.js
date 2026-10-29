/* =====================================================================
   QUOLINO — zabawa w widoku dziecka (kid-play.js), 2026-10-29
   Pomysły z raportu „co jeszcze dopieścić” (decyzje JP 2026-10-29):
     I-3  dziecko bez kodu: ekran „Pokaż ten ekran rodzicowi” z instrukcją dla rodzica, „Skanuj kod” i podglądem 8 Quo (bez zapisu)
     I-7  rodzeństwo na jednym telefonie: „Teraz szuka: …” nad misją, po zaliczeniu kolejka przechodzi dalej
     I-8  „Obietnica odkrywcy”: przytrzymaj 1 s → odznaka na dziś (qc.kid.avatar.oaths), w albumie pole oath
     I-10 „Podaj dziecku”: misja przystanku na pełnym ekranie telefonu rodzica, powrót przytrzymaniem 1 s
     I-14 wieczór przed: QR z dniem wyprawy (day=) → zapowiedź „Jutro: …!” z rozgrzewką ogólną
     I-15 tryb maluch: większe przyciski, pierwszy akapit misji, „Mam to!”, „Pomóż mi”, czytanie na głos na żądanie
   Widok dziecka bez komercji: żadnych cen, partnerów, ocen, kont. Bez wieku i prawdziwych imion.
   Teksty: PT('page.trip.kid.…', 'polski') — tłumaczenia dopisuje ui-translate do ui_translations.
   Zależności: kid-reward.js (QReward), opcjonalnie kid-sound.js (QSound), haptic.js (QHaptic).
   API: window.QKid = { init, ask, preview, previewDay, qrParams, qrExpiry, str }
   ===================================================================== */
(function () {
  'use strict';
  var S = { pt: null, lang: 'pl', slug: '', city: '', hero: '', root: null, regen: null, qrDay: '', qrTab: '' };
  var K_AVATAR = 'qc.kid.avatar';
  var QUO = '/media/icons/pose-07-ready-to-spring-256.webp';

  function PT(k, pl) { return S.pt ? S.pt(k, pl) : pl; }
  function fmt(s, v) { Object.keys(v || {}).forEach(function (k) { s = s.split('{' + k + '}').join(v[k]); }); return s; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ymd(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function today() { return ymd(new Date()); }
  function addDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return ymd(d); }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function R() { return window.QReward || null; }
  function kidView() { return !!(S.root && S.root.dataset.view === 'kid'); }
  function kidDevice() { return /[?&]view=kid\b/.test(location.search); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function squeak() { if (window.QSound) window.QSound.squeak(); }
  function seed(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function setOpts(o) {
    o = o || {};
    if (o.pt) S.pt = o.pt;
    if (o.lang) S.lang = o.lang;
    if (o.slug) S.slug = o.slug;
    if (o.cityName) S.city = o.cityName;
    if (o.hero != null) S.hero = o.hero;
    if (o.regenQR) S.regen = o.regenQR;
    if (o.qrTab) S.qrTab = o.qrTab;
    S.root = document.getElementById('city');
  }

  var SND_ON = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
  var SND_OFF = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
  function sndBtn(attr) {
    if (!window.QSound || !window.QSound.supported()) return '';
    var on = window.QSound.on();
    return '<button type="button" class="qk-snd" ' + attr + ' aria-pressed="' + on + '" aria-label="' + esc(PT('page.trip.kid.sound', 'Dźwięk')) + '">' + (on ? SND_ON : SND_OFF) + '</button>';
  }

  // ── przytrzymaj, żeby potwierdzić (obietnica, „Oddaj rodzicowi”) ──
  function holdable(btn, ms, done, tipEl) {
    var timer = null;
    btn.style.setProperty('--hold', ms + 'ms');
    function begin(e) {
      if (timer || btn.classList.contains('is-held')) return;
      if (e.type === 'keydown') { if (e.key !== ' ' && e.key !== 'Enter') return; e.preventDefault(); if (e.repeat) return; }
      btn.classList.add('is-holding');
      timer = setTimeout(function () { timer = null; btn.classList.remove('is-holding'); btn.classList.add('is-held'); done(); }, ms);
    }
    function end() {
      if (!timer) return;
      clearTimeout(timer); timer = null; btn.classList.remove('is-holding');
      if (tipEl) { tipEl.hidden = false; tipEl.classList.remove('is-nudge'); void tipEl.offsetWidth; tipEl.classList.add('is-nudge'); }
    }
    btn.addEventListener('pointerdown', begin);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { btn.addEventListener(ev, end); });
    btn.addEventListener('keydown', begin);
    btn.addEventListener('keyup', end);
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    btn.addEventListener('click', function (e) { e.preventDefault(); });
  }

  // ── drużyna rodzeństwa (I-7) i tryb maluch (I-15) ─────
  function avatarNow() { return R() ? R().avatar() : null; }
  function teamNow() { var a = avatarNow(); return a && R() ? R().kids(a) : []; }
  function currentKid() {
    var a = avatarNow(); if (!a) return null;
    var k = R().kids(a);
    return k[a.team ? (a.turn || 0) % k.length : 0] || null;
  }
  function nextTurn() {
    var a = avatarNow();
    if (!a || !a.team || a.team.length < 2) return;
    a.turn = ((a.turn || 0) + 1) % a.team.length;
    R().saveAvatar(a);
    refresh();
  }
  function turnHtml() {
    var kids = teamNow();
    if (kids.length < 2) return '';
    var k = currentKid(), name = k.nick || (R() && R().poseName(k.pose)) || '';
    return '<div class="qk-turn"><button type="button" class="qk-turn__btn" data-kid-turn aria-label="' +
      esc(fmt(PT('page.trip.kid.turn_aria', 'Teraz szuka: {name}. Dotknij, żeby oddać kolejkę następnej osobie.'), { name: name })) + '">' +
      R().avatarHtml(k, 'qk-ava--sm') + '<span class="qk-turn__txt"><small>' + esc(PT('page.trip.kid.turn', 'Teraz szuka')) + '</small><b>' + esc(name) + '</b></span>' +
      '<span class="qk-turn__next" aria-hidden="true">↻</span></button></div>';
  }
  function paintTurns() {
    $$('.qk-turn').forEach(function (el) { el.remove(); });
    var h = turnHtml();
    if (!h) return;
    $$('#trasa .qc-stop[data-collectable] .qc-tasks').forEach(function (box) { box.insertAdjacentHTML('afterbegin', h); });
    var hand = document.querySelector('.qk-hand [data-hand-turn]');
    if (hand) hand.innerHTML = h;
  }
  function small() { var k = currentKid(); return !!(k && k.small); }
  function applySmall() {
    if (S.root) S.root.classList.toggle('qk-small', kidView() && small());
    var hand = document.querySelector('.qk-hand');
    if (hand) hand.classList.toggle('qk-small', small());
  }

  // przyciski malucha i „Zaliczone” dopisane do karteczki misji (tekst zadania zostaje bez zmian)
  var canSpeak = !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
  function tinyHtml(key, checked) {
    return '<div class="qk-tiny" data-task-key="' + esc(key) + '">' +
      '<button type="button" class="qk-tiny__done' + (checked ? ' is-done' : '') + '" data-tiny="done" aria-pressed="' + !!checked + '">' + esc(doneLabel(checked)) + '</button>' +
      '<span class="qk-tiny__row">' +
        (canSpeak ? '<button type="button" class="qk-tiny__btn" data-tiny="read">🔊 ' + esc(PT('page.trip.kid.read', 'Przeczytaj')) + '</button>' : '') +
        '<button type="button" class="qk-tiny__btn" data-tiny="help">🙋 ' + esc(PT('page.trip.kid.help', 'Pomóż mi')) + '</button>' +
        '<button type="button" class="qk-tiny__btn" data-tiny="more" hidden>' + esc(PT('page.trip.kid.more', 'Czytaj dalej')) + '</button>' +
      '</span><p class="qk-tiny__ask" hidden>' + esc(PT('page.trip.kid.help_parent', 'Poproś rodzica o podpowiedź. Szukajcie razem!')) + '</p></div>';
  }
  function doneLabel(on) {
    if (on) return '✓ ' + PT('page.trip.kid.done', 'Zrobione!');
    return small() || document.querySelector('.qk-hand.qk-small') ? PT('page.trip.kid.got_it', 'Mam to!') + ' ✋' : PT('page.trip.kid.mark_done', 'Zaliczone') + ' ✓';
  }
  function taskParas(task) { return $$(':scope > p:not(.qc-task__hint)', task); }
  function decorateTasks() {
    $$('#trasa .qc-stop[data-collectable] .qc-task').forEach(function (task) {
      if (task.querySelector('.qk-tiny')) return;
      var inp = task.querySelector('input[data-qc-task]');
      if (!inp) return;
      task.insertAdjacentHTML('beforeend', tinyHtml(inp.getAttribute('data-qc-task'), inp.checked));
      if (taskParas(task).length > 1) task.querySelector('[data-tiny="more"]').hidden = false;
    });
  }
  function syncDone() {
    $$('[data-tiny="done"]').forEach(function (b) {
      var key = b.closest('[data-task-key]').getAttribute('data-task-key');
      var inp = realInput(key), on = !!(inp && inp.checked);
      b.classList.toggle('is-done', on); b.setAttribute('aria-pressed', String(on)); b.textContent = doneLabel(on);
    });
  }
  function realInput(key) {
    var all = $$('#trasa input[data-qc-task]');
    for (var i = 0; i < all.length; i++) if (all[i].getAttribute('data-qc-task') === key) return all[i];
    return null;
  }
  function speak(task, btn) {
    var sy = window.speechSynthesis;
    if (sy.speaking) { sy.cancel(); btn.classList.remove('is-on'); return; }
    var parts = [];
    var lbl = task.querySelector('.qc-task__label, .qk-hand__label'); if (lbl) parts.push(lbl.textContent.trim());
    taskParas(task).forEach(function (p, i) { if (i === 0 || task.classList.contains('is-more')) parts.push(p.textContent.trim()); });
    var hint = task.querySelector('.qc-task__hint'); if (hint && task.classList.contains('is-help')) parts.push(hint.textContent.trim());
    var u = new SpeechSynthesisUtterance(parts.join('. '));
    u.lang = S.lang; u.rate = 0.92; u.pitch = 1.05;
    u.onend = u.onerror = function () { btn.classList.remove('is-on'); };
    btn.classList.add('is-on');
    sy.speak(u);
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-tiny]');
    if (b) {
      var box = b.closest('[data-task-key]'), task = b.closest('.qc-task'), kind = b.getAttribute('data-tiny');
      if (kind === 'done') { var inp = realInput(box.getAttribute('data-task-key')); if (inp) inp.click(); }
      else if (kind === 'read' && canSpeak) speak(task, b);
      else if (kind === 'more') { task.classList.add('is-more'); b.hidden = true; }
      else if (kind === 'help') {
        task.classList.add('is-help');
        if (!task.querySelector('.qc-task__hint')) box.querySelector('.qk-tiny__ask').hidden = false;
        b.hidden = true;
      }
      return;
    }
    if (e.target.closest('[data-kid-turn]')) { squeak(); nextTurn(); return; }
    var hb = e.target.closest('[data-hand-open]');
    if (hb) { openHand(hb.closest('.qc-stop'), hb); return; }
    var qd = e.target.closest('[data-qrday]');
    if (qd) { setQrDay(qd.getAttribute('data-qrday') === '1'); return; }
  });
  document.addEventListener('change', function (e) {
    if (!e.target.matches || !e.target.matches('input[data-qc-task]')) return;
    setTimeout(function () {
      syncDone();
      if (H.el) paintHandState();
      // kolejka rodzeństwa: po zaliczeniu zadania szuka następna osoba
      if (e.target.checked && kidView() && teamNow().length > 1) setTimeout(nextTurn, 700);
    }, 30);
  });
  document.addEventListener('qc:kid', function (e) {
    var d = e.detail || {};
    if (d.type !== 'picked') return;
    refresh();
    if (S.preview) { paintPreviewMe(); return; }
    if (d.date === today()) setTimeout(maybeOath, 250);
  });
  function refresh() { paintTurns(); applySmall(); syncDone(); if (H.el) paintHand(); }

  // ── I-8: Obietnica odkrywcy ───────────────────────────
  var oathAsked = false;
  function oathed(a) { return !!(a && a.oaths && a.oaths.indexOf(S.slug) > -1); }
  function maybeOath() {
    var a = avatarNow();
    if (!R() || !kidView() || !a || oathed(a) || oathAsked || document.querySelector('.qk-sheet')) return;
    oathAsked = true;
    var dlg = R().sheet('qk-vowsheet', '<img class="qk-oath__quo" src="' + QUO + '" alt="" width="160" height="160">' +
      '<h2 class="qk-sheet__title" id="qkOathT">' + esc(PT('page.trip.kid.oath_title', 'Obietnica odkrywcy')) + '</h2>' +
      '<p class="qk-sheet__sub">' + esc(PT('page.trip.kid.oath_sub', 'Przytrzymaj przycisk i obiecaj:')) + '</p>' +
      '<blockquote class="qk-oath__vow">' + esc(PT('page.trip.kid.oath_vow', 'Będę patrzeć uważnie, słuchać Quo i trzymać się blisko rodzica.')) + '</blockquote>' +
      '<button type="button" class="qk-vow" data-vow><svg class="qk-vow__ring" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54"/><circle class="qk-vow__fill" cx="60" cy="60" r="54"/></svg>' +
        '<span class="qk-vow__txt">' + esc(PT('page.trip.kid.oath_btn', 'Obiecuję!')) + '</span></button>' +
      '<p class="qk-oath__tip" hidden>' + esc(PT('page.trip.kid.oath_tip', 'Trzymaj dłużej, aż kółko się zamknie.')) + '</p>', 'qkOathT');
    var btn = dlg.querySelector('[data-vow]');
    holdable(btn, 1000, function () {
      var cur = avatarNow(); if (!cur) return;
      cur.oaths = (cur.oaths || []).filter(function (s) { return s !== S.slug; }).concat(S.slug);
      R().saveAvatar(cur);
      if (window.QHaptic) window.QHaptic.pulse('sticker');   // wibracja + „klap” (gdy dźwięk włączony)
      var box = dlg.querySelector('.qk-sheet__box');
      box.innerHTML = '<button type="button" class="qk-x" aria-label="' + esc(PT('page.trip.kid.close', 'Zamknij')) + '">×</button>' +
        '<div class="qk-stamp" role="status"><span aria-hidden="true">★</span><b>' + esc(fmt(PT('page.trip.kid.oath_badge', 'Odkrywca {city}'), { city: S.city })) + '</b>' +
        '<small>' + esc(new Date().toLocaleDateString(S.lang, { day: '2-digit', month: '2-digit' })) + '</small></div>' +
        '<p class="qk-sheet__sub qk-oath__ok">' + esc(PT('page.trip.kid.oath_ok', 'Odznaka jest Twoja na cały dzień. Ruszamy!')) + '</p>' +
        '<button type="button" class="qc-btn qc-btn--primary qk-go" data-oath-go>' + esc(PT('page.trip.kid.oath_go', 'Do dzieła!')) + '</button>';
      box.querySelector('[data-oath-go]').addEventListener('click', function () { R().close(dlg); });
      box.querySelector('[data-oath-go]').focus();
    }, dlg.querySelector('.qk-oath__tip'));
  }

  // ── I-10: Podaj dziecku (jeden telefon) ──────────────
  var H = { el: null, stop: null, prevView: '', y: 0, from: null };
  function addHandButtons() {
    $$('#trasa .qc-stop[data-collectable] .qc-tasks').forEach(function (box) {
      if (box.querySelector('[data-hand-open]')) return;
      box.insertAdjacentHTML('afterbegin', '<button type="button" class="qc-btn qk-handbtn" data-hand-open>📱 ' + esc(PT('page.trip.kid.hand', 'Podaj dziecku')) + '</button>');
    });
  }
  function openHand(stop, from) {
    if (!stop || H.el || !S.root) return;
    H.stop = stop; H.from = from; H.prevView = S.root.dataset.view || 'adult'; H.y = window.scrollY || 0;
    S.root.dataset.view = 'kid';      // CSS widoku dziecka, haptyka, obrazek-zagadka (kid-reward) — jak na telefonie dziecka
    var el = document.createElement('div');
    el.className = 'qk-hand';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'qkHandT'); el.tabIndex = -1;
    document.body.appendChild(el);
    document.documentElement.classList.add('qk-hand-on');
    H.el = el;
    paintHand();
    applySmall();
    el.focus();
  }
  function closeHand() {
    if (!H.el) return;
    if (window.speechSynthesis && window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    H.el.remove(); H.el = null;
    document.documentElement.classList.remove('qk-hand-on');
    if (S.root) S.root.dataset.view = H.prevView;
    applySmall(); syncDone();
    window.scrollTo(0, H.y);
    if (H.from && H.from.focus) H.from.focus({ preventScroll: true });
  }
  function paintHand() {
    var st = H.stop, el = H.el;
    var num = st.getAttribute('data-stop-num') || '';
    var name = (st.querySelector('.qc-stop__name') || {}).textContent || '';
    var photo = st.querySelector('.qc-stop__photo img');
    var fun = st.querySelector('.qc-funfact');
    var a = avatarNow(), k = currentKid();
    var h = '<div class="qk-hand__top">' +
      '<button type="button" class="qk-hand__quo" data-hand="quo" aria-label="Quo">' +
        (k && R() ? R().avatarHtml(k) : '<img src="' + QUO + '" alt="" width="64" height="64">') + '</button>' +
      '<div class="qk-hand__title"><small>' + esc(fmt(PT('page.trip.kid.stop_no', 'Przystanek {n}'), { n: ('0' + num).slice(-2) })) + '</small>' +
        '<h2 id="qkHandT">' + esc(name) + '</h2></div>' + sndBtn('data-hand="snd"') + '</div>' +
      '<div data-hand-turn>' + turnHtml() + '</div>' +
      (!a && R() ? '<button type="button" class="qc-btn qk-hand__pick" data-hand="pick">' + esc(PT('page.trip.kid.pick', 'Kim dziś jesteś? Wybierz swojego Quo')) + '</button>' : '') +
      (photo ? '<figure class="qk-hand__photo"><img src="' + esc(photo.currentSrc || photo.src) + '" alt="' + esc(name) + '"></figure>' : '') +
      (fun ? '<p class="qc-funfact">' + esc(fun.textContent) + '</p>' : '') +
      '<div class="qk-hand__tasks">';
    $$('.qc-task', st).forEach(function (task) {
      var inp = task.querySelector('input[data-qc-task]');
      if (!inp) return;
      var lbl = (task.querySelector('.qc-task__label') || {}).textContent || '';
      var hint = task.querySelector('.qc-task__hint');
      var paras = taskParas(task);
      h += '<div class="qc-task qk-hand__task' + (task.classList.contains('qc-task--photo') ? ' qc-task--photo' : '') + '">' +
        '<div class="qk-hand__label">' + esc(lbl.trim()) + '</div>' +
        paras.map(function (p) { return '<p>' + esc(p.textContent) + '</p>'; }).join('') +
        (hint ? '<p class="qc-task__hint">' + esc(hint.textContent) + '</p>' : '') +
        tinyHtml(inp.getAttribute('data-qc-task'), inp.checked) + '</div>';
    });
    h += '</div><p class="qk-hand__state" data-hand-state role="status" aria-live="polite"></p>' +
      (R() && R().progress().total ? '<button type="button" class="qc-btn qk-hand__pz" data-hand="pz"></button>' : '') +
      '<div class="qk-hand__back"><button type="button" class="qk-hold" data-hand-back><span>' + esc(PT('page.trip.kid.give_back', 'Oddaj rodzicowi')) + '</span></button>' +
      '<p class="qk-hand__tip">' + esc(PT('page.trip.kid.give_back_tip', 'Przytrzymaj przycisk, żeby wrócić do rodzica.')) + '</p></div>';
    el.innerHTML = h;
    $$('.qk-hand__task', el).forEach(function (task) { if (taskParas(task).length > 1) task.querySelector('[data-tiny="more"]').hidden = false; });
    holdable(el.querySelector('[data-hand-back]'), 1000, closeHand, el.querySelector('.qk-hand__tip'));
    el.onclick = function (e) {
      var b = e.target.closest('[data-hand]'); if (!b) return;
      var k2 = b.getAttribute('data-hand');
      if (k2 === 'quo') squeak();
      else if (k2 === 'snd' && window.QSound) { window.QSound.set(!window.QSound.on()); paintHand(); var s = H.el.querySelector('[data-hand="snd"]'); if (s) s.focus(); }
      else if (k2 === 'pick' && R()) R().pick();
      else if (k2 === 'pz' && R()) R().puzzle();
    };
    applySmall();
    paintHandState();
  }
  function paintHandState() {
    if (!H.el) return;
    var p = H.el.querySelector('[data-hand-state]');
    if (p) p.textContent = H.stop.classList.contains('is-collected') ? '🎉 ' + PT('page.trip.kid.sticker_done', 'Naklejka wklejona! Brawo!') : '';
    var pz = H.el.querySelector('[data-hand="pz"]');
    if (pz && R()) { var g = R().progress(); pz.textContent = '🧩 ' + fmt(PT('page.trip.kid.picture_n', 'Twój obrazek: {n} z {t}'), { n: Math.min(g.got, g.total), t: g.total }); }
    H.el.classList.toggle('is-collected', H.stop.classList.contains('is-collected'));
  }

  // ── karta QR rodzica: dopisek o jednym telefonie (I-10) i „wieczór przed” (I-14) ──
  function decorateQr() {
    var qr = document.getElementById('qr');
    if (!qr || qr.querySelector('.qk-qr-one')) return;
    var copy = qr.querySelector('.qc-copy-row');
    var one = document.createElement('p');
    one.className = 'qk-qr-one';
    one.innerHTML = esc(PT('page.trip.kid.qr_one', 'Nie macie drugiego telefonu? Użyj {btn} na każdym przystanku.')).split('{btn}').join('<b>' + esc(PT('page.trip.kid.hand', 'Podaj dziecku')) + '</b>');
    var day = document.createElement('div');
    day.className = 'qk-qrday';
    day.innerHTML = '<p class="qk-qrday__q" id="qkQrDayQ">' + esc(PT('page.trip.kid.qr_when', 'Kiedy dziecko zaczyna?')) + '</p>' +
      '<div class="qk-qrday__opts" role="group" aria-labelledby="qkQrDayQ">' +
      '<button type="button" data-qrday="0" aria-pressed="' + !S.qrDay + '">' + esc(PT('page.trip.kid.qr_today', 'Dziś')) + '</button>' +
      '<button type="button" data-qrday="1" aria-pressed="' + !!S.qrDay + '">' + esc(PT('page.trip.kid.qr_tomorrow', 'Jutro — zapowiedź na wieczór')) + '</button></div>' +
      '<p class="qk-qrday__note"' + (S.qrDay ? '' : ' hidden') + '>' + esc(PT('page.trip.kid.qr_tomorrow_eve', 'Dziś wieczorem dziecko zobaczy zapowiedź trasy i wybierze swojego Quo.')) +
      '<span class="qk-qrday__again"' + (S.qrStale ? '' : ' hidden') + '> ' + esc(PT('page.trip.kid.qr_again', 'Ten kod działa tylko do północy — rano pokażcie dziecku kod jeszcze raz.')) + '</span></p>';
    if (copy) { copy.parentNode.insertBefore(day, copy); copy.parentNode.insertBefore(one, day); }
    else { qr.appendChild(one); qr.appendChild(day); }
  }
  function setQrDay(tomorrow) {
    S.qrDay = tomorrow ? addDays(1) : '';
    $$('[data-qrday]').forEach(function (b) { b.setAttribute('aria-pressed', String((b.getAttribute('data-qrday') === '1') === tomorrow)); });
    var n = document.querySelector('.qk-qrday__note'); if (n) n.hidden = !tomorrow;
    if (S.regen) S.regen();
  }
  function qrParams(params) { if (S.qrDay && S.qrDay > today()) params.set('day', S.qrDay); }
  // city.html po utworzeniu tokenu dziecka: exp (ms) = expires_at; dopisek „rano jeszcze raz” tylko, gdy token
  // wygasa przed dniem trasy (SQL bez p_day). 0 = bez tokenu (klucz testera, gość) — dopisku nie ma.
  function qrExpiry(exp) {
    var start = S.qrDay ? new Date(S.qrDay + 'T12:00:00').getTime() : 0;
    S.qrStale = !!(S.qrDay && exp && exp < start);
    var a = document.querySelector('.qk-qrday__again'); if (a) a.hidden = !S.qrStale;
  }

  // ── I-14: zapowiedź wieczorem ─────────────────────────
  function previewDay() {
    var d = new URLSearchParams(location.search).get('day') || '';
    return /^\d{4}-\d{2}-\d{2}$/.test(d) && d > today() ? d : '';
  }
  var WARM = function () {
    return [
      PT('page.trip.kid.warm1', 'Policz wszystkie wieże, które zobaczysz po drodze. Ile ich było?'),
      PT('page.trip.kid.warm2', 'Wymyśl trzy rzeczy, które Quo zabierze jutro do plecaka.'),
      PT('page.trip.kid.warm3', 'Narysuj, jak Twoim zdaniem wygląda to miejsce. Jutro sprawdzisz, co się zgadza!'),
      PT('page.trip.kid.warm4', 'Znajdź w domu coś okrągłego, coś czerwonego i coś bardzo małego. To rozgrzewka dla oczu odkrywcy.'),
      PT('page.trip.kid.warm5', 'Poćwicz ciche kroki odkrywcy: przejdź przez pokój tak, żeby nikt Cię nie usłyszał.')
    ];
  };
  function dayAvatar(day) { var a = lsGet(K_AVATAR); return a && a.date === day ? a : null; }
  function preview(box, o) {
    setOpts(o);
    var day = previewDay();
    S.preview = day;
    if (!box || !day) return;
    var tomorrow = day === addDays(1);
    var cells = '';
    for (var i = 0; i < 12; i++) cells += '<span class="qk-cell"><b>?</b></span>';
    var warm = WARM(), w = warm[seed(day + ':' + S.slug) % warm.length];
    box.innerHTML = '<section class="qk-eve">' +
      '<button type="button" class="qk-eve__quo" data-eve="quo" aria-label="Quo"><img src="' + QUO + '" alt="" width="180" height="180"></button>' +
      '<h1 class="qk-eve__title">' + esc(fmt(tomorrow ? PT('page.trip.kid.eve_title', 'Jutro: {city}!') : PT('page.trip.kid.eve_soon', 'Już niedługo: {city}!'), { city: S.city })) + '</h1>' +
      '<p class="qk-eve__lead">' + esc(PT('page.trip.kid.eve_lead', 'Quo już pakuje plecak.')) + '</p>' +
      (S.hero ? '<div class="qk-puzzle qk-eve__pz" style="--cols:4;--rows:3"><img src="' + esc(S.hero) + '-hero-800.webp" alt="" width="1200" height="800" decoding="async">' +
        '<div class="qk-cover" aria-hidden="true">' + cells + '</div></div>' : '') +
      '<p class="qk-eve__pzt">' + esc(tomorrow ? PT('page.trip.kid.eve_picture', 'Jutro odsłonisz ten obrazek kawałek po kawałku.') : PT('page.trip.kid.eve_picture_soon', 'Na wyprawie odsłonisz ten obrazek kawałek po kawałku.')) + '</p>' +
      '<div class="qk-eve__warm"><h2>' + esc(PT('page.trip.kid.warm_title', 'Rozgrzewka odkrywcy')) + '</h2><p>' + esc(w) + '</p></div>' +
      '<div class="qk-eve__me" data-eve-me></div></section>';
    box.onclick = function (e) {
      var b = e.target.closest('[data-eve]'); if (!b) return;
      var k = b.getAttribute('data-eve');
      if (k === 'quo') squeak();
      else if (k === 'pick' && R()) R().pick({ date: day, lang: S.lang });
    };
    paintPreviewMe();
  }
  function paintPreviewMe() {
    var me = document.querySelector('[data-eve-me]');
    if (!me || !R()) return;
    var a = dayAvatar(S.preview);
    if (a) {
      var kids = R().kids(a), names = kids.map(function (k) { return k.nick || R().poseName(k.pose); }).join(', ');
      me.innerHTML = '<div class="qk-eve__team">' + kids.map(function (k) { return R().avatarHtml(k); }).join('') + '</div>' +
        '<p class="qk-eve__bye">' + esc(fmt(PT('page.trip.kid.eve_bye', 'Do zobaczenia na wyprawie, {name}!'), { name: names })) + '</p>' +
        '<button type="button" class="qc-btn" data-eve="pick">' + esc(PT('page.trip.kid.eve_change', 'Zmień Quo')) + '</button>';
    } else {
      me.innerHTML = '<button type="button" class="qc-btn qc-btn--primary qk-eve__pick" data-eve="pick">' + esc(PT('page.trip.kid.eve_pick', 'Wybierz swojego Quo na wyprawę')) + '</button>';
    }
  }

  // ── I-3: dziecko bez kodu (ekran „Pokaż rodzicowi”) ──
  function ask(sec, o) {
    setOpts(o);
    if (!sec) return;
    var scan = 'BarcodeDetector' in window;
    var poses = R() ? R().poses : 8, ph = '';
    for (var i = 0; i < poses; i++) {
      ph += '<button type="button" class="qk-ask__pose" data-ask-pose="' + i + '" aria-pressed="false" aria-label="' + esc(R() ? R().poseName(i) : 'Quo') + '">' +
        '<img src="' + (R() ? R().avatarUrl(i, 128) : QUO) + '" alt="" width="64" height="64" loading="lazy"></button>';
    }
    sec.classList.add('qk-ask');
    sec.removeAttribute('role');   // ekran ma teraz przyciski — bez ogłaszania całości jako komunikatu
    sec.innerHTML = '<img src="/media/icons/quo-qr-256.webp" srcset="/media/icons/quo-qr-256.webp 1x, /media/icons/quo-qr-512.webp 2x" width="160" height="160" alt="" decoding="async">' +
      '<h1 class="qc-kidask__text">' + esc(PT('page.trip.kid.ask_title', 'Pokaż ten ekran rodzicowi')) + ' <span aria-hidden="true">👇</span></h1>' +
      (S.city ? '<p class="qk-ask__lead">' + esc(fmt(PT('page.trip.kid.ask_lead', 'Quo czeka na Ciebie z misjami: {city}.'), { city: S.city })) + '</p>' : '') +
      '<div class="qk-ask__parent"><h2>' + esc(PT('page.trip.kid.ask_parent_h', 'Dla rodzica')) + '</h2><ol class="qk-ask__steps">' +
        '<li>' + esc(PT('page.trip.kid.ask_step1', 'Otwórz tę trasę w Quolino na swoim telefonie.')) + '</li>' +
        '<li>' + esc(fmt(PT('page.trip.kid.ask_step2', 'Dotknij zakładki „{tab}”.'), { tab: S.qrTab || 'QR dla dziecka' })) + '</li>' +
        '<li>' + esc(PT('page.trip.kid.ask_step3', 'Zeskanuj kod tym telefonem.')) + '</li></ol>' +
        (scan ? '<button type="button" class="qc-btn qc-btn--primary qk-ask__scan" data-ask-scan>📷 ' + esc(PT('page.trip.kid.ask_scan', 'Skanuj kod')) + '</button>' +
          '<input type="file" accept="image/*" capture="environment" hidden data-ask-file>'
          : '<p class="qk-ask__tip">' + esc(PT('page.trip.kid.ask_camera', 'Otwórz aparat w telefonie i skieruj go na kod. Telefon sam pokaże link.')) + '</p>') +
        '<p class="qk-ask__msg" role="status" aria-live="polite"></p>' +
        '<p class="qk-ask__one">' + esc(PT('page.trip.kid.ask_one', 'Nie macie drugiego telefonu? Na każdym przystanku jest przycisk {btn}.')).split('{btn}').join('<b>' + esc(PT('page.trip.kid.hand', 'Podaj dziecku')) + '</b>') + '</p>' +
      '</div>' +
      '<div class="qk-ask__peek"><p>' + esc(fmt(PT('page.trip.kid.ask_peek', 'Czeka na Ciebie {n} Quo do wyboru i obrazek do odsłonięcia.'), { n: poses })) + '</p>' +
        '<div class="qk-ask__poses">' + ph + '</div><p class="qk-ask__picked" aria-live="polite"></p></div>';
    sec.onclick = function (e) {
      var p = e.target.closest('[data-ask-pose]');
      if (p) {
        squeak();
        $$('[data-ask-pose]', sec).forEach(function (b) { b.setAttribute('aria-pressed', String(b === p)); });
        sec.querySelector('.qk-ask__picked').textContent = PT('page.trip.kid.ask_picked', 'Dobry wybór! Naprawdę wybierzesz go, gdy rodzic pokaże Ci kod.');
        return;
      }
      if (e.target.closest('[data-ask-scan]')) sec.querySelector('[data-ask-file]').click();
    };
    var file = sec.querySelector('[data-ask-file]');
    if (file) file.addEventListener('change', function () {
      var f = file.files && file.files[0], msg = sec.querySelector('.qk-ask__msg');
      if (!f) return;
      msg.textContent = PT('page.trip.kid.ask_reading', 'Szukam kodu na zdjęciu…');
      var det;
      try { det = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (er) { det = null; }
      if (!det || !window.createImageBitmap) { msg.textContent = PT('page.trip.kid.ask_camera', 'Otwórz aparat w telefonie i skieruj go na kod. Telefon sam pokaże link.'); return; }
      createImageBitmap(f).then(function (img) { return det.detect(img); }).then(function (codes) {
        var url = null;
        (codes || []).some(function (c) {
          try { var u = new URL(c.rawValue, location.href); if ((u.host === location.host || /(^|\.)quolino\.com$/.test(u.hostname)) && u.searchParams.get('view') === 'kid') { url = u.href; return true; } } catch (er) { /* nie adres */ }
          return false;
        });
        if (url) { msg.textContent = PT('page.trip.kid.ask_found', 'Mam kod! Otwieram trasę…'); location.href = url; }
        else msg.textContent = PT('page.trip.kid.ask_none', 'Nie widzę kodu Quolino na zdjęciu. Zrób zdjęcie jeszcze raz, z bliska.');
      }).catch(function () { msg.textContent = PT('page.trip.kid.ask_none', 'Nie widzę kodu Quolino na zdjęciu. Zrób zdjęcie jeszcze raz, z bliska.'); })
        .then(function () { file.value = ''; });
    });
  }

  // ── start na stronie trasy (po render(), także po zmianie języka) ──
  function init(o) {
    setOpts(o);
    S.preview = '';
    addHandButtons();
    decorateTasks();
    decorateQr();
    paintTurns();
    applySmall();
    // kod pokazany rano po zapowiedzi albo powrót na stronę: obietnica, gdy Quo już wybrany, a przysięgi dziś jeszcze nie było
    if (kidDevice() && avatarNow() && !oathed(avatarNow())) setTimeout(maybeOath, 600);
  }

  window.QKid = { init: init, ask: ask, preview: preview, previewDay: previewDay, qrParams: qrParams, qrExpiry: qrExpiry, str: PT };
})();
