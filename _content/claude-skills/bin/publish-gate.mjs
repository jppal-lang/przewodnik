/* Bramka publikacji (decyzja JP 2026-11-01): „Jak są nierozstrzygnięte flagi, muszę mieć zablokowaną możliwość publikacji; jak już
 * wyślę poprawki, to też jeszcze nie — dopiero jak wszystkie flagi będą zielone możesz odblokować przycisk opublikuj.”
 * Jeden kod dla panelu i testów: zwykły skrypt ustawiający globalThis.PublishGate (panel: <script>, Node: import './publish-gate.mjs').
 * KOPIA 1:1: _admin/publish-gate.js = _content/claude-skills/bin/publish-gate.mjs (pilnuje test publish-gate.test.mjs).
 * TE SAME REGUŁY liczy serwer: admin.publish_gate() w _content/claude-skills/sql/2026-11-01-publikacja-bramka.sql — admin_approve
 * odmawia publikacji, gdy bramka nie przepuszcza (twardo, bez „mimo to”). Zmiana reguły = zmiana w obu miejscach + test.
 *
 * „Zielone” = wszystkie spełnione:
 *  a) każda flaga kontroli tej wersji (review.errors / review.warnings bez `resolved`, stare uwagi zbiorcze „Fakty bez źródła (K)”
 *     rozbite jak w review-where.js) ma odpowiedź JP — uwagę tej wersji z field = 'review.<e|w>.<i>[.<j>]';
 *  b) nic nie czeka na wysłanie (uwagi new / local) ani na wskazanie przystanku (needs_jp) — w całym mieście;
 *  c) ostatnia prośba o poprawkę: nie w toku (new / working), nie nieudana, a po naniesieniu — weryfikacja verify.ready = true
 *     (częściowo / nie naniesione / nowe błędy / ocena wstępna blokują). Prośba „done” bez wyniku weryfikacji blokuje tylko przez
 *     VERIFY_WAIT_H godzin (verify-revision.mjs rusza zaraz po rundzie); starsze prośby sprzed weryfikacji nie blokują;
 *  d) zero błędów walidatora (review.errors bez `resolved`), chyba że JP odpowiedział i Hermes tę odpowiedź już rozpatrzył
 *     (uwaga done / rejected) — inaczej błąd „Zostaw bez zmian” blokowałby na zawsze.
 * Brak wyniku kontroli (stare szkice) nie blokuje — nie ma flag do rozstrzygnięcia. */
(function (root, factory) {
  var api = factory();
  root.PublishGate = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  var VERIFY_WAIT_H = 2;
  // ten sam podział uwag zbiorczych co ReviewWhere.splitAggregate (test pilnuje zgodności identyfikatorów)
  var RE_AGG = /^(\[[^\]]+\]\s*)?Fakty bez źródła \((\d+)\)[^:]*:\s*([\s\S]+)$/;

  function parts(e) {
    var m = String(e && e.problem || '').match(RE_AGG);
    if (!m) return null;
    return m[3].split(/;\s+/).map(function (c) { return c.trim(); }).filter(Boolean).length;
  }
  function isResolved(e) { return !!(e && typeof e === 'object' && e.resolved); }

  // flagi kontroli: [{ id, block }] — tylko te, które JP musi rozstrzygnąć (automatycznie rozstrzygnięte pomijamy)
  function flags(review) {
    var out = [];
    ['errors', 'warnings'].forEach(function (key) {
      var list = review && Array.isArray(review[key]) ? review[key] : [];
      list.forEach(function (e, i) {
        if (isResolved(e)) return;
        var k = key[0], n = parts(e);
        if (n) for (var j = 0; j < n; j++) out.push({ id: 'review.' + k + '.' + i + '.' + j, block: k === 'e' });
        else out.push({ id: 'review.' + k + '.' + i, block: k === 'e' });
      });
    });
    return out;
  }

  function plural(n, one, few, many) { var d = n % 10, t = n % 100; return n + ' ' + (n === 1 ? one : d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many); }

  // o = { version, review, comments: [{city_version, field, status}], request: najnowsza prośba miasta | null, now?: ms }
  // → { ok, reasons: [{ k, t }], flagsOpen, errors, unsent, unplaced, requestBlocks }
  function evaluate(o) {
    o = o || {};
    var v = +o.version, cms = Array.isArray(o.comments) ? o.comments : [], now = o.now != null ? +o.now : Date.now();
    var answers = {};
    cms.forEach(function (c) {
      if (+c.city_version !== v || !c.field || String(c.field).indexOf('review.') !== 0) return;
      (answers[c.field] = answers[c.field] || []).push(c.status);
    });
    var fl = flags(o.review), open = 0, errs = 0;
    fl.forEach(function (f) {
      var a = answers[f.id];
      if (!a) open++;
      if (f.block && !(a && a.some(function (s) { return s === 'done' || s === 'rejected'; }))) errs++;
    });
    var unsent = cms.filter(function (c) { return c.status === 'new' || c.status === 'local'; }).length;
    var unplaced = cms.filter(function (c) { return c.status === 'needs_jp'; }).length;
    var reasons = [];
    if (open) reasons.push({ k: 'flags', t: plural(open, 'nierozstrzygnięta flaga', 'nierozstrzygnięte flagi', 'nierozstrzygniętych flag') + ' kontroli' });
    if (errs) reasons.push({ k: 'errors', t: 'walidator: ' + plural(errs, 'błąd blokujący', 'błędy blokujące', 'błędów blokujących') + ' — popraw je (odpowiedź → wyślij do poprawki)' });
    if (unsent) reasons.push({ k: 'unsent', t: plural(unsent, 'niewysłana uwaga', 'niewysłane uwagi', 'niewysłanych uwag') + ' — wyślij je do poprawki' });
    if (unplaced) reasons.push({ k: 'unplaced', t: plural(unplaced, 'uwaga czeka', 'uwagi czekają', 'uwag czeka') + ' na wskazanie przystanku' });

    var rq = o.request, rqBlock = false;
    if (rq) {
      var vf = rq.verify && typeof rq.verify === 'object' ? rq.verify : null, t = null;
      if (rq.status === 'new' || rq.status === 'working') t = 'poprawka #' + rq.id + ' w toku (' + (rq.status === 'new' ? 'w kolejce' : 'Hermes nanosi') + ') — poczekaj na nową wersję i weryfikację';
      else if (rq.status === 'failed') t = 'poprawka #' + rq.id + ' nieudana — wyślij uwagi ponownie';
      else if (rq.status === 'done' && vf && vf.ready !== true) {
        t = 'weryfikacja poprawki #' + rq.id + ': ' + (vf.applied != null ? vf.applied : '?') + ' z ' + (vf.total != null ? vf.total : '?') + ' naniesionych' +
          (+vf.new_errors > 0 ? ', ' + plural(+vf.new_errors, 'nowy błąd', 'nowe błędy', 'nowych błędów') : '') +
          (vf.pending_ai ? ' (ocena wstępna — pełna po odnowieniu limitu AI)' : '') + ' — nie wszystko zielone';
      } else if (rq.status === 'done' && !vf && rq.result_version != null) {
        var at = Date.parse(rq.updated_at || rq.created_at || '');
        if (!isNaN(at) && now - at < VERIFY_WAIT_H * 3600e3) t = 'poprawka #' + rq.id + ' naniesiona w v' + rq.result_version + ' — czeka na weryfikację (kilka minut)';
      }
      if (t) { rqBlock = true; reasons.push({ k: 'request', t: t }); }
    }
    return { ok: !reasons.length, reasons: reasons, flagsOpen: open, errors: errs, unsent: unsent, unplaced: unplaced, requestBlocks: rqBlock };
  }

  return { evaluate: evaluate, flags: flags, VERIFY_WAIT_H: VERIFY_WAIT_H };
});
