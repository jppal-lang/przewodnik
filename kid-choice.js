/* =====================================================================
   QUOLINO — pytanie z wyborem odpowiedzi w misji dziecka (kid-choice.js), decyzja JP 2026-10-31
   „Misja, podpowiedź i w niektórych pytaniach 4 opcje do wyboru… jeśli źle — wstrzymaj wybór na 3 s,
    pokaż Quo, który się zastanawia, żeby dziecko nie klikało wszystkiego po kolei, tylko popatrzyło na odpowiedzi.”
   Dane: stop_translations.kids_choice = {"options": ["…" ×4], "correct": 0..3} (pole opcjonalne; brak = misja jak dotąd).
   city.html wstawia do karteczki misji <div class="qk-choice" data-task-key data-choice='{…}'>, ten skrypt robi z niego przyciski.
   • kolejność opcji tasowana raz na wejście na stronę (ta sama w widoku dziecka i w „Podaj dziecku”),
   • dobra odpowiedź → pochwała Quo i odhaczenie misji tym samym polem co „Zaliczone” (qc.task.<klucz>-mission → naklejka),
   • zła → ta opcja wyszarzona i przekreślona na stałe, WSZYSTKIE przyciski zablokowane na 3 s (aria-disabled),
     Quo się zastanawia, spokojny pasek i licznik sekund; każda kolejna zła odpowiedź = znów 3 s.
   Bez nowych kluczy localStorage: stan prób żyje w pamięci strony, zaliczenie — w istniejącym qc.task.*.
   Widok dziecka bez komercji. Teksty: PT('page.trip.kid.choice_…', 'polski') — tłumaczenia dopisuje ui-translate.
   Grafika: brak pozy „Quo myśli” — tymczasem pose-05 + „?” w CSS (kolejka: _content/claude-skills/bin/quo-icons-data.mjs nr 31).
   API: window.QChoice = { decorate(root), valid(choice), LOCK_MS }
   ===================================================================== */
(function () {
  'use strict';
  var LOCK_MS = 3000;
  var QUO_THINK = '/media/icons/pose-05-curious-sitting-256.webp';   // zamiennik, dopóki nie ma quo-mysli-*.webp
  var QUO_YAY = '/media/icons/pose-13-celebration-jump-256.webp';
  var ST = {};       // klucz misji → { order: [indeksy], wrong: {indeks: 1}, until: ms, timer, tick }
  var uid = 0;

  function PT(k, pl) { return window.QKid && window.QKid.str ? window.QKid.str(k, pl) : pl; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  // dokładnie 4 różne, niepuste opcje i poprawna 0..3 — inaczej pytanie się nie pokazuje (misja zostaje jak dotąd)
  function valid(c) {
    if (!c || typeof c !== 'object' || !Array.isArray(c.options) || c.options.length !== 4) return false;
    var seen = {};
    for (var i = 0; i < 4; i++) {
      var o = c.options[i];
      if (typeof o !== 'string' || !o.trim()) return false;
      var k = o.trim().toLowerCase();
      if (seen[k]) return false;
      seen[k] = 1;
    }
    return c.correct === +c.correct && c.correct >= 0 && c.correct <= 3 && c.correct % 1 === 0;
  }
  function parse(box) {
    var c = null;
    try { c = JSON.parse(box.getAttribute('data-choice') || 'null'); } catch (e) { return null; }
    return valid(c) ? c : null;
  }
  function shuffled() {
    var a = [0, 1, 2, 3];
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function state(key) { return ST[key] || (ST[key] = { order: shuffled(), wrong: {}, until: 0, timer: null, tick: null }); }
  function input(key) {
    var all = $$('input[data-qc-task]');
    for (var i = 0; i < all.length; i++) if (all[i].getAttribute('data-qc-task') === key) return all[i];
    return null;
  }
  function solved(key) { var i = input(key); return !!(i && i.checked); }
  function left(s) { return Math.max(0, s.until - Date.now()); }

  function paint(box) {
    var c = parse(box), key = box.getAttribute('data-task-key');
    if (!c || !key) { box.hidden = true; return; }
    var s = state(key), done = solved(key), lock = !done && left(s) > 0, id = box.getAttribute('data-qid');
    if (!id) { id = 'qkc' + (++uid); box.setAttribute('data-qid', id); }
    var secs = Math.ceil(left(s) / 1000);
    box.classList.toggle('is-locked', lock);
    box.classList.toggle('is-done', done);
    box.hidden = false;
    var h = '<p class="qk-choice__q" id="' + id + 'q">' + esc(PT('page.trip.kid.choice_pick', 'Wybierz odpowiedź:')) + '</p>' +
      '<div class="qk-choice__opts" role="group" aria-labelledby="' + id + 'q">';
    s.order.forEach(function (i) {
      var right = done && i === c.correct, wrong = !!s.wrong[i], off = done || lock || wrong;
      h += '<button type="button" class="qk-choice__opt' + (right ? ' is-right' : '') + (wrong ? ' is-wrong' : '') + '" data-opt="' + i + '"' +
        ' aria-disabled="' + off + '"' +
        (wrong ? ' aria-label="' + esc(c.options[i] + ', ' + PT('page.trip.kid.choice_not', 'to nie to')) + '"' : '') +
        (right ? ' aria-label="' + esc(c.options[i] + ', ' + PT('page.trip.kid.choice_yes', 'dobra odpowiedź')) + '"' : '') +
        '><span>' + esc(c.options[i]) + '</span></button>';
    });
    h += '</div>';
    // Quo się zastanawia (blokada) albo cieszy (dobra odpowiedź); obrazki w DOM od początku — trafiają do pamięci offline
    h += '<div class="qk-choice__quo-box qk-choice__wait"' + (lock ? '' : ' hidden') + '>' +
        '<span class="qk-choice__quo" aria-hidden="true"><img src="' + QUO_THINK + '" alt="" width="96" height="96"><b class="qk-choice__think">?</b></span>' +
        '<div class="qk-choice__say"><p class="qk-choice__msg">' + esc(PT('page.trip.kid.choice_hmm', 'Hmm… Przyjrzyj się jeszcze raz.')) + '</p>' +
        '<div class="qk-choice__bar" aria-hidden="true"><i style="animation-duration:' + left(s) + 'ms"></i></div>' +
        '<p class="qk-choice__sec" aria-hidden="true">' + esc(PT('page.trip.kid.choice_wait', 'Za chwilę wybierzesz znowu')) + ' <b>' + secs + '</b></p></div></div>' +
      '<div class="qk-choice__quo-box qk-choice__yay"' + (done ? '' : ' hidden') + '>' +
        '<span class="qk-choice__quo" aria-hidden="true"><img src="' + QUO_YAY + '" alt="" width="96" height="96"></span>' +
        '<div class="qk-choice__say"><p class="qk-choice__msg">' + esc(PT('page.trip.kid.choice_ok', 'Brawo! Dobra odpowiedź.')) + '</p></div></div>' +
      '<p class="qk-choice__live" role="status" aria-live="polite"></p>';
    box.innerHTML = h;
  }
  function paintKey(key) { $$('.qk-choice[data-task-key]').forEach(function (b) { if (b.getAttribute('data-task-key') === key) paint(b); }); }
  function say(key, text) { $$('.qk-choice[data-task-key]').forEach(function (b) { if (b.getAttribute('data-task-key') === key) { var l = b.querySelector('.qk-choice__live'); if (l) l.textContent = text; } }); }
  function decorate(root) { $$('.qk-choice[data-choice]', root || document).forEach(paint); }

  // Quo pod przyciskami ma być widoczny (nie pod dolnym paskiem pagera na telefonie) — przewijamy najmniej, jak się da
  function reveal(box) {
    var w = box && box.querySelector('.qk-choice__wait');
    if (!w || !w.getBoundingClientRect) return;
    var r = w.getBoundingClientRect(), bar = document.querySelector('.qc-pager:not([hidden])'), hand = box.closest('.qk-hand');
    var bottom = (hand ? hand.getBoundingClientRect().bottom : window.innerHeight) - (!hand && bar ? bar.getBoundingClientRect().height : 0) - 12;
    var dy = r.bottom - bottom;
    if (dy <= 0) return;
    var rm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (hand) hand.scrollBy({ top: dy, behavior: rm ? 'auto' : 'smooth' });
    else window.scrollBy({ top: dy, behavior: rm ? 'auto' : 'smooth' });
  }
  function lockFor(key, box) {
    var s = state(key);
    clearTimeout(s.timer); clearInterval(s.tick);
    s.until = Date.now() + LOCK_MS;
    paintKey(key);
    reveal(box);
    say(key, PT('page.trip.kid.choice_hmm', 'Hmm… Przyjrzyj się jeszcze raz.') + ' ' + PT('page.trip.kid.choice_wait_sr', 'Poczekaj 3 sekundy.'));
    s.tick = setInterval(function () {
      var n = Math.ceil(left(s) / 1000);
      $$('.qk-choice[data-task-key]').forEach(function (b) {
        if (b.getAttribute('data-task-key') !== key) return;
        var e = b.querySelector('.qk-choice__sec b'); if (e) e.textContent = n;
      });
    }, 250);
    s.timer = setTimeout(function () {
      clearInterval(s.tick); s.until = 0;
      paintKey(key);
      say(key, PT('page.trip.kid.choice_again', 'Możesz wybrać znowu.'));
    }, LOCK_MS);
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.qk-choice__opt');
    if (!b) return;
    e.preventDefault();
    if (b.getAttribute('aria-disabled') === 'true') return;   // blokada, zła opcja albo misja już zaliczona
    var box = b.closest('.qk-choice'), key = box.getAttribute('data-task-key'), c = parse(box);
    if (!c) return;
    var i = +b.getAttribute('data-opt'), s = state(key);
    if (left(s) > 0 || solved(key)) return;
    if (i === c.correct) {
      clearTimeout(s.timer); clearInterval(s.tick); s.until = 0;
      if (window.QSound && window.QSound.squeak) window.QSound.squeak();
      var inp = input(key);
      if (inp && !inp.checked) inp.click();   // to samo co „Zaliczone”: zapis qc.task.*, naklejka, haptyka, obrazek-zagadka
      paintKey(key);
      say(key, PT('page.trip.kid.choice_ok', 'Brawo! Dobra odpowiedź.'));
      return;
    }
    s.wrong[i] = 1;
    lockFor(key, box);
  });
  // rodzic odznaczył misję (albo „Zaliczone” bez pytania) — pytanie odświeża się; po odznaczeniu znowu od początku
  document.addEventListener('change', function (e) {
    if (!e.target.matches || !e.target.matches('input[data-qc-task]')) return;
    var key = e.target.getAttribute('data-qc-task');
    if (!ST[key] && !document.querySelector('.qk-choice[data-task-key]')) return;
    if (!e.target.checked && ST[key]) { ST[key].wrong = {}; }
    setTimeout(function () { paintKey(key); }, 0);
  });

  window.QChoice = { decorate: decorate, valid: valid, LOCK_MS: LOCK_MS };
})();
