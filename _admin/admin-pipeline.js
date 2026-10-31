/* Quolino admin — centrum dowodzenia pipeline'u (#/pipeline), JP 2026-10-31.
 *
 * Widok jak GitHub Actions / Vercel: każda trasa w pracy to poziomy rząd etapów
 *   research → szkic → kontrola źródeł → kontrola (walidator) → uwagi JP → tłumaczenia → publikacja
 * Etap ma stan (czeka / w toku / OK / błąd / pominięty), czas, koszt (USD albo „abonament”) i wykonawcę
 * (Antigravity / Claude / automat / JP). Klik etapu → panel boczny z logiem, danymi wersji i linkami.
 * Na górze: limit Antigravity (pierścień + odliczanie), zlecenia czekające na limit, koszty, cron.
 * Prawa kolumna: strumień zdarzeń (logi + zlecenia) odświeżany co 30 s różnicowo (bez migotania), pauza po najechaniu.
 *
 * Źródła (wszystkie „miękkie” — brak jednego nie wywraca widoku):
 *   admin.pipeline_runs / pipeline_events / pipeline_queue (SQL 2026-10-25-postep-prac.sql),
 *   admin.draft_revision_requests (uwagi JP → Hermes), admin.decision_drafts (czerwone flagi), admin.ai_usage_daily (koszty),
 *   rpc/ops_status (po zatwierdzeniu SQL 2026-10-31-admin-ops-status.sql): jobs.registry + jobs.logs (zlecenia z repo i końcówki logów),
 *   queue.open/recent/failed_7d (ops.jobs), queue.agyQuotaOut / agyWeekCalls (limit Antigravity), cron.last_run + blokady, versions.rows.
 *   Bez ops_status: etapy, uwagi, kolejka tras i koszty działają z widoków admin; limit Antigravity wnioskowany z komunikatów
 *   („Resets in 2h14m”, „czeka na odnowienie limitu”), zlecenia z repo i logi — niedostępne (panel mówi, czego brakuje).
 * Ponawianie: brak RPC kolejkowania z panelu → przycisk „Ponów” (tylko darmowe zlecenia) pokazuje gotowe zlecenie do pliku _content/jobs/.
 * Zlecenia płatne nigdy nie startują z tego ekranu.
 *
 * Plik ładuje się PRZED admin.js (rejestruje trasę w window.AdminExt.routes); z admin.js korzysta przez window.AdminHost dopiero
 * przy wywołaniu. W admin.js tylko haki: trasa w route(), link i mini-pasek w kafelku „Serwer” na pulpicie.
 */
(function () {
  'use strict';

  var H = function () { return window.AdminHost; };
  var STAGES = [
    { k: 'research', l: 'Research', who: 'Antigravity' },
    { k: 'draft', l: 'Szkic', who: 'Antigravity' },
    { k: 'sources', l: 'Kontrola źródeł', who: 'Claude' },
    { k: 'check', l: 'Kontrola', sub: 'walidator', who: 'automat' },
    { k: 'jp', l: 'Uwagi JP', who: 'Claude' },
    { k: 'i18n', l: 'Tłumaczenia', who: 'automat' },
    { k: 'publish', l: 'Publikacja', who: 'JP' }
  ];
  var ST_LABEL = { wait: 'czeka', run: 'w toku', ok: 'OK', err: 'błąd', skip: 'pominięty', warn: 'uwaga' };
  var FREE = { 'place-candidates.mjs': true, 'ui-translate.mjs': true, 'watch.mjs': true, 'show-review.mjs': true, 'usage-summary.mjs': true };
  var AGY_BUDGET = 150;   // ostrożna miara tygodniowa (gemini-queue.mjs, QUOLINO_AGY_WEEKLY_CALLS)
  var P = { data: null, open: null, feedPaused: false, feedPending: null, tick: null, poll: null, hash: '#/pipeline', retryOpen: null };

  window.AdminExt = window.AdminExt || { routes: {} };
  window.AdminExt.routes['#/pipeline'] = openPipeline;

  // ── pomocnicze ─────────────────────────────────────────
  function esc(s) { return H().esc(s); }
  function soft(p) { return Promise.resolve(p).then(function (v) { return { ok: v }; }, function (e) { if (e && e.session) throw e; return { err: e && e.message || 'błąd' }; }); }
  function t_(iso) { var t = Date.parse(iso); return isNaN(t) ? 0 : t; }
  function hm(ms) {
    if (ms == null || isNaN(ms)) return '—';
    var s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h) return h + ' h ' + (m < 10 ? '0' : '') + m + ' min';
    if (m) return m + ' min ' + (sec < 10 ? '0' : '') + sec + ' s';
    return sec + ' s';
  }
  function durShort(ms) { if (ms == null || isNaN(ms) || ms < 0) return ''; var s = Math.round(ms / 1000); return s < 60 ? s + ' s' : s < 3600 ? Math.round(s / 60) + ' min' : Math.floor(s / 3600) + ' h ' + Math.round((s % 3600) / 60) + ' min'; }
  function clock(iso) { return iso ? new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : ''; }
  function tokCost(g, c) {
    var parts = [];
    if (g) parts.push('Gemini ' + H().tok(g));
    if (c) parts.push('Claude ' + H().tok(c));
    return parts.length ? 'abonament · ' + parts.join(' · ') : null;
  }
  // „Resets in 128h41m” / „odnowi się za 2 h 14 min” w komunikacie z sygnaturą czasu → ISO godziny odnowienia
  function resetFromText(txt, at) {
    var m = String(txt || '').match(/Resets in\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?/i) || String(txt || '').match(/odnowi się za\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*min)?/i);
    if (!m || (!m[1] && !m[2])) return null;
    var ms = ((+(m[1] || 0)) * 60 + (+(m[2] || 0))) * 60000, base = t_(at) || Date.now();
    return base + ms > Date.now() ? new Date(base + ms).toISOString() : null;
  }
  function stage(st, label, sub, extra) { return Object.assign({ st: st, label: label || ST_LABEL[st], sub: sub || '', dur: null, cost: null, who: null, log: [], links: [] }, extra || {}); }

  // ── dane demo (uzupełnienie demoOps z admin.js: zlecenia z repo, logi, ops.jobs) ──
  function demoExtra(now) {
    var iso = function (m) { return new Date(now - m * 60000).toISOString(); };
    return {
      jobs: { registry: [
        { name: '2026-10-31-frasassi-pytania-wybor', status: 'later', code: 75, script: 'gemini-draft.mjs', args: 'frasassi --choices --max-usd 0.3', why: 'pytania z wyborem do misji (JP 2026-10-31)', by: 'Claude', started_at: iso(95), finished_at: iso(94), tries: 3, result: 'Antigravity: Individual quota reached. Resets in 2h14m — odkładam (kod 75)' },
        { name: '2026-10-31-wieliczka-kandydaci-ikon', status: 'failed', code: 1, script: 'place-candidates.mjs', args: 'wieliczka', why: 'kandydaci zdjęć z Commons do ikon', by: 'Claude', started_at: iso(130), finished_at: iso(129), result: 'Commons: HTTP 429 Too Many Requests (po 3 próbach)' },
        { name: '2026-10-31-rimini-tlumaczenie', status: 'failed', code: 2, script: 'trip-translate.mjs', args: 'rimini --langs cs', why: 'ponowne tłumaczenie po korekcie', by: 'Claude', started_at: iso(400), finished_at: iso(390), result: 'cs: tłumaczenie ucięte w połowie — JSON niepełny' },
        { name: '2026-10-31-spello-watch-prices', status: 'done', code: 0, script: 'watch.mjs', args: 'prices --no-ai --city spello', why: 'strażnik cen na żądanie', by: 'Claude', started_at: iso(200), finished_at: iso(198), result: 'prices: 6 ustaleń (0 z AI)' },
        { name: '2026-10-31-gubbio-source-check', status: 'running', script: 'gemini-draft.mjs', args: 'gubbio --recheck', why: 'kontrola źródeł po szkicu', by: 'automat', started_at: iso(6), result: '' }
      ], logs: [
        { name: '2026-10-31-gubbio-source-check', mtime: iso(1), tail: ['[v1] gubbio: ④ kontrola Claude — 3 Fontana dei Matti', 'źródło: it.wikipedia.org/wiki/Fontana_dei_Matti ✓', '[v1] gubbio: ④ kontrola Claude — 4 Palazzo dei Consoli', 'fakt bez źródła: „najwyższy pałac w Umbrii” → łagodzę'] },
        { name: '2026-10-31-frasassi-pytania-wybor', mtime: iso(94), tail: ['frasassi: ① pytania z wyborem — 1 Grotte di Frasassi', 'Antigravity: Individual quota reached. Resets in 2h14m', 'odkładam zlecenie (kod 75), próba 3'] }
      ] },
      queue: { open: [{ id: 9, city_slug: 'assisi', kind: 'translate', worker: 'claude', status: 'running', result: 'cs, hu gotowe; de w toku', created_at: iso(22) },
                      { id: 10, city_slug: 'todi', kind: 'draft', worker: 'gemini', status: 'queued', result: '', created_at: iso(20) }],
               recent: [{ id: 8, city_slug: 'urbino', kind: 'translate', worker: 'claude', status: 'failed', result: 'cs: tłumaczenie ucięte', created_at: iso(3100), finished_at: iso(3000) },
                        { id: 6, city_slug: 'spello', kind: 'translate', worker: 'claude', status: 'done', result: '16 języków', created_at: iso(2900), finished_at: iso(2800) }] },
      versions: { rows: [{ city_slug: 'frasassi', version: 5, status: 'draft', note: 'runda 2 poprawek', created_at: iso(20), errors: 39, warnings: 12, verdict: 'fix' },
                         { city_slug: 'spello', version: 3, status: 'draft', note: 'Poprawki JP (uwagi #2, #3) i source-check', created_at: iso(3000), errors: 0, warnings: 6, verdict: 'ok' }] }
    };
  }

  // ── wczytanie ─────────────────────────────────────────
  function load() {
    var h = H(), api = h.api, since = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
    return Promise.all([
      Promise.resolve(h.state.tripsP).catch(function () { return null; }),
      soft(api('/pipeline_runs?order=last_at.desc&limit=80')),
      soft(api('/pipeline_queue?order=id.desc&limit=30')),
      soft(api('/draft_revision_requests?order=id.desc&limit=40')),
      soft(h.DEMO ? Promise.resolve(h.demoCosts().filter(function (r) { return r.day >= since; })) : api('/ai_usage_daily?day=gte.' + since + '&order=day.desc&limit=2000')),
      soft(h.loadInbox()),
      h.loadOps().catch(function () { return null; })
    ]).then(function (r) {
      var runs = r[1].ok || [];
      // kroki przebiegów: tylko najnowszy przebieg każdej trasy z ostatnich 7 dni (najwyżej 12 zapytań)
      var seen = {}, want = [];
      runs.forEach(function (x) { if (!seen[x.city_slug] && Date.now() - t_(x.last_at) < 7 * 864e5 && want.length < 12) { seen[x.city_slug] = 1; want.push(x); } });
      return Promise.all(want.map(function (x) { return api('/pipeline_events?run_id=eq.' + encodeURIComponent(x.run_id) + '&order=id.asc').catch(function () { return []; }); }))
        .then(function (evs) {
          var byRun = {}; want.forEach(function (x, i) { byRun[x.run_id] = evs[i] || []; });
          var ops = h.ops && h.ops.data;
          if (h.DEMO && ops) { var ex = demoExtra(Date.now()); ops = JSON.parse(JSON.stringify(ops)); ['jobs', 'versions'].forEach(function (k) { ops.snapshots[k] = { data: ex[k] }; }); ops.snapshots.queue.data = Object.assign({}, ops.snapshots.queue.data, ex.queue); }
          return build({ trips: h.state.trips || [], runs: runs, events: byRun, queue: r[2], revs: r[3], usage: r[4], inbox: r[5], ops: ops, at: Date.now() });
        });
    });
  }
  function snapOf(ops, k) { var s = ops && ops.snapshots && ops.snapshots[k]; return s && s.data && typeof s.data === 'object' && !s.data['błąd'] ? s.data : null; }

  // ── model: wiersze tras z 7 etapami ───────────────────
  function build(D) {
    var h = H(), runs = D.runs, revs = D.revs.ok || [], queue = D.queue.ok || [], I = D.inbox.ok || null;
    var jobsS = snapOf(D.ops, 'jobs') || { registry: [], logs: [] }, qS = snapOf(D.ops, 'queue') || {}, cronS = snapOf(D.ops, 'cron'), verS = snapOf(D.ops, 'versions');
    var redBy = {}; if (I && I.drafts.ok) I.drafts.ok.forEach(function (x) { redBy[x.city_slug] = x; });
    var names = {}; D.trips.forEach(function (t) { names[t.slug] = t.name; });
    var jobsOpen = Array.isArray(qS.open) ? qS.open : [], jobsRecent = (Array.isArray(qS.recent) ? qS.recent : []).concat(Array.isArray(qS.failed_7d) ? qS.failed_7d : []);
    var reg = Array.isArray(jobsS.registry) ? jobsS.registry : [], logs = Array.isArray(jobsS.logs) ? jobsS.logs : [];
    var logByName = {}; logs.forEach(function (l) { logByName[l.name] = l; });
    var regCity = function (j) { var m = String(j.args || '').match(/^([a-z0-9][a-z0-9-]{0,62})\b/); return m ? m[1] : (String(j.name || '').match(/^\d{4}-\d\d-\d\d-([a-z0-9]+)/) || [])[1]; };

    var rows = {}, order = [];
    function row(slug, name) {
      if (!rows[slug]) { rows[slug] = { slug: slug, name: name || names[slug] || h.titleCase(slug), st: STAGES.map(function (s) { return stage('wait'); }), active: false, trip: null, events: [] }; order.push(slug); }
      return rows[slug];
    }
    D.trips.forEach(function (t) { row(t.slug, t.name).trip = t; });
    // miasta tylko w kolejce (jeszcze bez wersji)
    queue.forEach(function (j) { var req = {}; try { req = JSON.parse(j.request); } catch (e) { /* tekst */ } if (j.city_slug) row(j.city_slug, req.name || null); });
    // trasy z przebiegów ostatnich 7 dni, których nie ma na liście (np. nowa trasa jeszcze bez wersji)
    runs.forEach(function (r) { if (r.city_slug && Date.now() - t_(r.last_at) < 7 * 864e5) row(r.city_slug); });

    // 1) przebiegi gemini-draft: szkic (kind draft) i poprawki (kind revise)
    var latestDraft = {}, latestRevise = {};
    runs.forEach(function (r) { var m = r.kind === 'revise' ? latestRevise : latestDraft; if (!m[r.city_slug]) m[r.city_slug] = r; });
    Object.keys(rows).forEach(function (slug) {
      var R = rows[slug], t = R.trip, r = latestDraft[slug], ev = r ? (D.events[r.run_id] || []) : [];
      if (t && t.std === 'old' && !r) { for (var i = 0; i < 4; i++) R.st[i] = stage('skip', 'pominięty', 'stare wytyczne — poza pipeline\'em'); }
      else if (!r && t) { for (var k = 0; k < 4; k++) R.st[k] = stage('ok', 'OK', 'bez zapisu przebiegu'); }
      if (r) {
        var cur = Math.min(+r.stage || 1, 7), live = r.status === 'running' || r.status === 'stalled';
        var col = function (s) { return s <= 1 ? 0 : s <= 3 ? 1 : s === 4 ? 2 : 3; };
        var curCol = cur >= 7 ? 4 : col(cur);
        var perStage = stageSpans(ev);
        for (var c = 0; c < 4; c++) {
          var span = spanFor(perStage, c), base = { dur: span.dur, cost: tokCost(span.g, span.cl), who: STAGES[c].who, log: span.log, links: [{ t: 'Kroki przebiegu →', h: '#/postep' }], runId: r.run_id, started: span.from, ended: span.to };
          if (c < curCol) R.st[c] = stage('ok', 'OK', span.sub, base);
          else if (c === curCol && cur < 7) {
            var st = r.status === 'error' ? 'err' : r.status === 'stopped' ? 'err' : r.status === 'stalled' ? 'err' : r.status === 'done' ? 'ok' : 'run';
            var sub = r.status === 'stalled' ? 'stoi ≥ 15 min' : r.status === 'stopped' ? 'przerwane' : r.status === 'error' ? 'błąd przebiegu' : '';
            if (st === 'run' && c === 1 && r.stop_k && r.stops_n) sub = 'przystanek ' + r.stop_k + ' z ' + r.stops_n;
            if (st === 'run') { base.dur = span.from ? D.at - t_(span.from) : null; base.ended = null; }
            R.st[c] = stage(st, st === 'err' ? (r.status === 'stalled' ? 'stoi' : r.status === 'stopped' ? 'przerwane' : 'błąd') : null, sub || cleanMsg(r.last_message), base);
            R.active = R.active || live;
          } else if (cur >= 7) R.st[c] = stage('ok', 'OK', span.sub, base);
        }
        if (cur >= 7 && r.status === 'done') R.st[3].sub = R.st[3].sub || 'gotowe';
        R.events = R.events.concat(ev.map(function (e) { return { at: e.created_at, slug: slug, stage: STAGES[col(evStage(e))].l, msg: cleanMsg(e.message), id: 'ev' + e.id }; }));
        if (live) R.active = true;
      }
      // czerwone flagi walidatora (decision_drafts) nakładają się na kolumnę „kontrola”
      var red = redBy[slug];
      if (red && red.red_flags && (R.st[3].st === 'ok' || R.st[3].st === 'wait')) R.st[3] = Object.assign({}, R.st[3], { st: 'warn', label: 'uwaga', sub: h.plForm(red.red_flags, 'czerwona flaga', 'czerwone flagi', 'czerwonych flag'), who: 'automat', links: [{ t: 'Flagi w trasie →', h: '#/' + encodeURIComponent(slug) }] });
      else if (red && red.red_flags === 0 && R.st[3].st === 'ok') R.st[3].sub = R.st[3].sub || 'bez czerwonych flag';

      // 2) uwagi JP → Hermes (draft_revision_requests) + przebiegi revise
      var rq = revs.filter(function (x) { return x.city_slug === slug; })[0], rr = latestRevise[slug], rev = rr ? (D.events[rr.run_id] || []) : [];
      var jp = R.st[4];
      if (rq) {
        var reply = rq.hermes_reply ? String(rq.hermes_reply) : '', n = Array.isArray(rq.comment_ids) ? rq.comment_ids.length : null, nTxt = n != null ? h.plForm(n, 'uwaga', 'uwagi', 'uwag') : 'uwagi';
        var lim = /limit/i.test(reply);
        var J = { who: 'Claude', dur: rq.status === 'done' ? t_(rq.updated_at) - t_(rq.created_at) : rq.status === 'working' ? D.at - t_(rq.created_at) : null,
          cost: rr ? tokCost(rr.gemini_tokens, rr.claude_tokens) : (rq.status === 'done' || rq.status === 'working' ? 'abonament' : null), log: rev.map(function (e) { return clock(e.created_at) + '  ' + cleanMsg(e.message); }).concat(reply ? ['Hermes: ' + reply] : []),
          links: [{ t: 'Uwagi w trasie →', h: '#/' + encodeURIComponent(slug) }], reqId: rq.id, started: rq.created_at, ended: rq.status === 'done' ? rq.updated_at : null };
        if (rq.status === 'new') { jp = stage('wait', lim ? 'czeka na limit' : 'w kolejce', nTxt + ' do v' + rq.city_version + (lim ? ' · ruszy samo po odnowieniu' : ''), J); R.active = true; R.waitLimit = lim; }
        else if (rq.status === 'working') { jp = stage('run', 'w toku', 'Hermes nanosi ' + nTxt, J); R.active = true; }
        else if (rq.status === 'done') {
          var v = rq.verify && typeof rq.verify === 'object' ? rq.verify : null;
          jp = stage(v && v.ready === false && !v.pending_ai ? 'warn' : 'ok', v && v.ready ? 'OK' : v && v.applied != null ? v.applied + ' z ' + v.total : 'OK', 'naniesione w v' + (rq.result_version || '?') + (v && v.ready ? ' · gotowa do akceptacji' : v && v.applied != null && !v.ready ? ' naniesionych' : ''), J);
        } else if (rq.status === 'failed') { jp = stage('err', 'błąd', reply.slice(0, 120) || 'nieudane', J); R.active = true; }
      } else if (rr && (rr.status === 'running' || rr.status === 'stalled')) {
        jp = stage(rr.status === 'stalled' ? 'err' : 'run', rr.status === 'stalled' ? 'stoi' : 'w toku', cleanMsg(rr.last_message), { who: 'Claude', dur: D.at - t_(rr.started_at), cost: tokCost(rr.gemini_tokens, rr.claude_tokens), log: rev.map(function (e) { return clock(e.created_at) + '  ' + cleanMsg(e.message); }), links: [{ t: 'Kroki przebiegu →', h: '#/postep' }], started: rr.started_at });
        R.active = true;
      } else if (t && t.status === 'draft') jp = stage('wait', 'czeka na JP', t.published != null ? 'szkic v' + t.draft + ' do akceptacji' : 'nowa trasa do akceptacji', { who: 'JP', links: [{ t: 'Przejrzyj szkic →', h: '#/' + encodeURIComponent(slug) }] });
      else if (t && t.status === 'published') jp = stage('ok', 'OK', 'bez otwartych uwag', { who: 'JP' });
      else if (t && t.status === 'rejected') jp = stage('err', 'odrzucona', 'szkic odrzucony', { who: 'JP', links: [{ t: 'Trasa →', h: '#/' + encodeURIComponent(slug) }] });
      if (rr) R.events = R.events.concat(rev.map(function (e) { return { at: e.created_at, slug: slug, stage: 'Uwagi JP', msg: cleanMsg(e.message), id: 'ev' + e.id }; }));
      if (rq) R.events.push({ at: rq.updated_at || rq.created_at, slug: slug, stage: 'Uwagi JP', msg: ({ 'new': 'uwagi wysłane do poprawki', working: 'Hermes nanosi uwagi', done: 'uwagi naniesione w v' + (rq.result_version || '?'), failed: 'poprawka nieudana' })[rq.status] || rq.status, id: 'rq' + rq.id + rq.status });
      R.st[4] = jp;

      // 3) tłumaczenia: ops.jobs kind translate (z ops_status), potem języki trasy
      var tj = jobsOpen.filter(function (j) { return j.city_slug === slug && j.kind === 'translate'; })[0] || jobsRecent.filter(function (j) { return j.city_slug === slug && j.kind === 'translate'; })[0];
      var langs = t && t.langs ? t.langs.length : null;
      var who = tj ? (tj.worker === 'claude' ? 'Claude' : tj.worker === 'openrouter' ? 'OpenRouter' : 'automat') : 'automat';
      if (tj && (tj.status === 'queued' || tj.status === 'running')) { R.st[5] = stage(tj.status === 'running' ? 'run' : 'wait', tj.status === 'running' ? 'w toku' : 'w kolejce', tj.result || 'zlecenie #' + tj.id, { who: who, dur: tj.status === 'running' ? D.at - t_(tj.created_at) : null, cost: who === 'OpenRouter' ? 'USD (OpenRouter)' : 'abonament', log: tj.result ? [tj.result] : [], jobId: tj.id, started: tj.created_at }); R.active = true; }
      else if (tj && tj.status === 'failed') { R.st[5] = stage('err', 'błąd', String(tj.result || '').slice(0, 120), { who: who, dur: t_(tj.finished_at) - t_(tj.created_at), cost: who === 'OpenRouter' ? 'USD (OpenRouter)' : 'abonament', log: tj.result ? [tj.result] : [], jobId: tj.id, started: tj.created_at, ended: tj.finished_at, retry: { paid: true, what: 'trip-translate.mjs ' + slug } }); R.active = true; }
      else if (tj && tj.status === 'done') R.st[5] = stage('ok', 'OK', tj.result || (langs ? langs + ' jęz.' : ''), { who: who, dur: t_(tj.finished_at) - t_(tj.created_at), cost: who === 'OpenRouter' ? 'USD (OpenRouter)' : 'abonament', log: tj.result ? [tj.result] : [], jobId: tj.id, started: tj.created_at, ended: tj.finished_at });
      else if (langs && langs > 1) R.st[5] = stage('ok', 'OK', h.plForm(langs, 'język', 'języki', 'języków'), { who: 'automat', cost: 'abonament' });
      else if (t && t.status === 'published') R.st[5] = stage('wait', 'czeka', langs === 1 ? 'tylko PL' : 'brak danych o językach', { who: 'automat' });
      else R.st[5] = stage('wait', 'czeka', 'po publikacji', { who: 'automat' });
      if (tj) R.events.push({ at: tj.finished_at || tj.created_at, slug: slug, stage: 'Tłumaczenia', msg: 'zlecenie #' + tj.id + ' ' + ({ queued: 'w kolejce', running: 'w toku', done: 'gotowe', failed: 'błąd' })[tj.status] + (tj.result ? ' · ' + String(tj.result).slice(0, 100) : ''), id: 'job' + tj.id + tj.status });

      // 4) publikacja
      if (t && t.published != null) R.st[6] = stage('ok', 'v' + t.published, t.status === 'draft' ? 'na stronie; szkic v' + t.draft + ' czeka' : 'na quolino.com', { who: 'JP', links: [{ t: 'Na stronie ↗', h: h.SITE + '/city.html?c=' + encodeURIComponent(slug), ext: true }] });
      else if (t && t.status === 'rejected') R.st[6] = stage('skip', 'pominięty', 'szkic odrzucony', { who: 'JP' });
      else R.st[6] = stage('wait', 'czeka', t && t.status === 'draft' ? 'po akceptacji szkicu' : 'brak wersji', { who: 'JP' });
      if (t && t.status === 'draft') R.active = true;

      // 5) zlecenia z repo (ops_status jobs.registry) dotyczące trasy: kontrola źródeł (--recheck / source-check), kandydaci ikon, strażnicy
      reg.filter(function (j) { return regCity(j) === slug; }).forEach(function (j) {
        var lg = logByName[j.name], tail = lg ? lg.tail : [];
        if (/--recheck|source-check/.test(j.args + ' ' + j.name)) {
          var S = { who: 'Claude', dur: j.finished_at ? t_(j.finished_at) - t_(j.started_at) : j.status === 'running' ? D.at - t_(j.started_at) : null, cost: 'abonament', log: tail.concat(j.result ? ['wynik: ' + j.result] : []), jobName: j.name, started: j.started_at, ended: j.finished_at };
          if (j.status === 'running') { R.st[2] = stage('run', 'w toku', 'zlecenie ' + j.name, S); R.active = true; }
          else if (j.status === 'failed') { R.st[2] = stage('err', 'błąd', String(j.result || '').slice(0, 120), S); R.active = true; }
          else if (j.status === 'later') { R.st[2] = stage('wait', 'czeka na limit', 'ruszy samo po odnowieniu', S); R.active = true; R.waitLimit = true; }
          else if (j.status === 'done' && R.st[2].st !== 'run') R.st[2] = stage('ok', 'OK', 'kontrola źródeł: ' + String(j.result || 'gotowe').slice(0, 80), S);
        }
        R.events.push({ at: j.finished_at || j.started_at, slug: slug, stage: 'zlecenie', msg: j.name + ' · ' + j.status + (j.result ? ' · ' + String(j.result).slice(0, 100) : ''), id: 'reg' + j.name + j.status });
      });
      // kolejka nowych tras (pipeline_queue / ops.jobs draft)
      var qj = queue.filter(function (j) { return j.city_slug === slug && (j.status === 'queued' || j.status === 'running'); })[0];
      if (qj && !r) { R.st[0] = stage(qj.status === 'running' ? 'run' : 'wait', qj.status === 'running' ? 'w toku' : 'w kolejce', 'zlecenie #' + qj.id + (qj.status === 'queued' ? ' czeka na cron' : ''), { who: 'Antigravity', cost: 'abonament', started: qj.created_at, jobId: qj.id }); R.active = true; }
      var qf = queue.filter(function (j) { return j.city_slug === slug && j.status === 'failed'; })[0];
      if (qf && !r) { R.st[0] = stage('err', 'błąd', String(qf.result || '').slice(0, 120), { who: 'Antigravity', log: qf.result ? [qf.result] : [], jobId: qf.id, started: qf.created_at, ended: qf.finished_at, retry: { paid: true, what: 'gemini-draft ' + slug } }); R.active = true; }
      R.cur = currentCol(R);
    });

    // ── limit Antigravity ──
    var agy = { out: qS.agyQuotaOut && t_(qS.agyQuotaOut) > D.at ? qS.agyQuotaOut : null, calls: qS.agyWeekCalls != null ? +qS.agyWeekCalls : null, src: D.ops ? 'ops_status' : null };
    if (!agy.out) {   // bez ops_status (albo bez znacznika): wnioskowanie z komunikatów
      var cands = [];
      reg.forEach(function (j) { var x = resetFromText(j.result, j.finished_at || j.started_at); if (x) cands.push(x); });
      revs.forEach(function (x) { var y = resetFromText(x.hermes_reply, x.updated_at); if (y) cands.push(y); });
      queue.forEach(function (j) { var z = resetFromText(j.result, j.finished_at || j.created_at); if (z) cands.push(z); });
      (logs || []).forEach(function (l) { (l.tail || []).forEach(function (line) { var w = resetFromText(line, l.mtime); if (w) cands.push(w); }); });
      if (cands.length) { cands.sort(); agy.out = cands[cands.length - 1]; agy.src = agy.src || 'komunikaty'; }
      else if (reg.some(function (j) { return j.status === 'later' && /limit|quota/i.test(j.result); }) || revs.some(function (x) { return x.status === 'new' && /limit/i.test(x.hermes_reply); })) agy.exhausted = true;
    }
    // ── czeka na limit / ruszy samo ──
    var waiting = [];
    reg.filter(function (j) { return j.status === 'later'; }).forEach(function (j) { waiting.push({ what: j.name, why: 'odłożone (kod 75), próba ' + (j.tries || 1), slug: regCity(j) }); });
    revs.filter(function (x) { return x.status === 'new'; }).forEach(function (x) { waiting.push({ what: (names[x.city_slug] || h.titleCase(x.city_slug)) + ' — uwagi do v' + x.city_version, why: /limit/i.test(x.hermes_reply) ? 'czeka na odnowienie limitu' : 'w kolejce Hermesa (cron co 3 min)', slug: x.city_slug }); });
    jobsOpen.filter(function (j) { return j.status === 'queued'; }).forEach(function (j) { waiting.push({ what: (names[j.city_slug] || h.titleCase(j.city_slug)) + ' — ' + (j.kind === 'translate' ? 'tłumaczenie' : j.kind), why: 'ops.jobs #' + j.id + ' w kolejce', slug: j.city_slug }); });
    queue.filter(function (j) { return j.status === 'queued' && !jobsOpen.some(function (o) { return o.id === j.id; }); }).forEach(function (j) { var req = {}; try { req = JSON.parse(j.request); } catch (e) { /* */ } waiting.push({ what: (req.name || names[j.city_slug] || h.titleCase(j.city_slug)) + ' — nowa trasa', why: 'kolejka Gemini #' + j.id, slug: j.city_slug }); });

    // ── zlecenia z błędem ──
    var failed = [];
    reg.filter(function (j) { return j.status === 'failed'; }).forEach(function (j) {
      var free = !!FREE[j.script] && !(j.script === 'watch.mjs' && !/--no-ai/.test(j.args));
      failed.push({ id: 'reg:' + j.name, name: j.name, slug: regCity(j), why: j.result || ('kod ' + j.code), at: j.finished_at, free: free, script: j.script, args: String(j.args || '').split(' ').filter(Boolean), by: j.by, reason: j.why });
    });
    jobsRecent.filter(function (j) { return j.status === 'failed'; }).forEach(function (j) { failed.push({ id: 'job:' + j.id, name: (names[j.city_slug] || h.titleCase(j.city_slug)) + ' — ' + (j.kind === 'translate' ? 'tłumaczenie' : j.kind) + ' #' + j.id, slug: j.city_slug, why: j.result || 'błąd', at: j.finished_at, free: false, paidWhat: j.kind === 'translate' ? 'trip-translate.mjs (płatne / limit)' : 'gemini-draft.mjs (limit Antigravity)' }); });
    queue.filter(function (j) { return j.status === 'failed' && !failed.some(function (f) { return f.id === 'job:' + j.id; }); }).forEach(function (j) { failed.push({ id: 'job:' + j.id, name: (names[j.city_slug] || h.titleCase(j.city_slug)) + ' — nowa trasa #' + j.id, slug: j.city_slug, why: j.result || 'błąd', at: j.finished_at, free: false, paidWhat: 'gemini-draft.mjs (limit Antigravity)' }); });
    revs.filter(function (x) { return x.status === 'failed'; }).forEach(function (x) { failed.push({ id: 'rq:' + x.id, name: (names[x.city_slug] || h.titleCase(x.city_slug)) + ' — poprawka z uwag #' + x.id, slug: x.city_slug, why: x.hermes_reply || 'nieudane', at: x.updated_at, free: false, paidWhat: 'gemini-draft.mjs --revise (limit Antigravity)' }); });
    failed.sort(function (a, b) { return t_(b.at) - t_(a.at); });

    // ── koszty ──
    var today = new Date().toISOString().slice(0, 10), cost = { d: 0, dEq: 0, w: 0, wEq: 0, err: D.usage.err };
    (D.usage.ok || []).forEach(function (u) { cost.w += +u.usd || 0; cost.wEq += +u.usd_equiv || 0; if (u.day === today) { cost.d += +u.usd || 0; cost.dEq += +u.usd_equiv || 0; } });

    // ── strumień zdarzeń ──
    var feed = [];
    order.forEach(function (s) { feed = feed.concat(rows[s].events); });
    logs.forEach(function (l) { (l.tail || []).slice(-4).forEach(function (line, i) { feed.push({ at: l.mtime, slug: regCity({ name: l.name, args: '' }) || '', stage: 'log', msg: line, id: 'log' + l.name + i, sub: l.name }); }); });
    feed = feed.filter(function (e) { return e.at && e.msg; }).sort(function (a, b) { return t_(b.at) - t_(a.at); }).slice(0, 80);

    var active = order.filter(function (s) { return rows[s].active; }), rest = order.filter(function (s) { return !rows[s].active; });
    var sortBy = function (a, b) { var A = rows[a], B = rows[b]; var ra = A.st.some(function (x) { return x.st === 'run'; }) ? 0 : A.st.some(function (x) { return x.st === 'err'; }) ? 1 : 2, rb = B.st.some(function (x) { return x.st === 'run'; }) ? 0 : B.st.some(function (x) { return x.st === 'err'; }) ? 1 : 2; return ra - rb || A.name.localeCompare(B.name, 'pl'); };
    active.sort(sortBy); rest.sort(function (a, b) { return rows[a].name.localeCompare(rows[b].name, 'pl'); });
    return { rows: rows, active: active, rest: rest, agy: agy, waiting: waiting, failed: failed, cost: cost, cron: cronS, ops: D.ops, versions: verS, at: D.at, feed: feed, errs: [D.runs.err && 'przebiegi', D.queue.err && 'kolejka', D.revs.err && 'uwagi', D.usage.err && 'koszty'].filter(Boolean), names: names };
  }
  function cleanMsg(s) { return String(s || '').replace(/^\[v\d+[a-z]?\]\s*/, '').replace(/^[a-z0-9-]+: /, '').replace(/[①②③④⑤]c?\s*/g, '').replace(/\s—\s/g, ' · '); }
  // kroki przebiegu pogrupowane w kolumny: [research, szkic, źródła, kontrola] → zakres czasu, przyrost tokenów, linie logu
  // etap kroku: kolumna stage z admin.pipeline_events, a gdy jej brak — symbol ①…⑤ z treści wpisu
  function evStage(e) { if (e.stage != null && +e.stage > 0) return +e.stage; var m = String(e.message || '').match(/[①②③④⑤]/); return m ? '①②③④⑤'.indexOf(m[0]) + 1 : 1; }
  function stageSpans(ev) {
    var col = function (s) { return s <= 1 ? 0 : s <= 3 ? 1 : s === 4 ? 2 : 3; }, out = [[], [], [], []];
    ev.forEach(function (e) { out[col(evStage(e))].push(e); });
    return out.map(function (list, i) {
      if (!list.length) return null;
      var prev = null; for (var k = i - 1; k >= 0 && !prev; k--) if (out[k].length) prev = out[k][out[k].length - 1];
      var g0 = prev ? +prev.gemini_tokens || 0 : 0, c0 = prev ? +prev.claude_tokens || 0 : 0, last = list[list.length - 1];
      var next = null; for (var n = i + 1; n < 4 && !next; n++) if (out[n].length) next = out[n][0];
      return { from: list[0].created_at, to: next ? next.created_at : last.created_at, g: (+last.gemini_tokens || 0) - g0, cl: (+last.claude_tokens || 0) - c0, log: list.map(function (e) { return clock(e.created_at) + '  ' + cleanMsg(e.message); }), lastMsg: cleanMsg(last.message) };
    });
  }
  function spanFor(per, c) { var s = per[c]; return s ? { dur: t_(s.to) - t_(s.from), g: s.g, cl: s.cl, log: s.log, sub: s.lastMsg, from: s.from, to: s.to } : { dur: null, g: 0, cl: 0, log: [], sub: '', from: null, to: null }; }
  function currentCol(R) { for (var i = 0; i < R.st.length; i++) if (R.st[i].st === 'run' || R.st[i].st === 'err' || R.st[i].st === 'warn') return i; for (var k = 0; k < R.st.length; k++) if (R.st[k].st === 'wait') return k; return 6; }

  // ── widok ─────────────────────────────────────────────
  var SVG = {
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/></svg>',
    err: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
    warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5L22 20H2z"/><path d="M12 10v4.5M12 17.2v.3"/></svg>',
    wait: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
    skip: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>',
    run: '<span class="pl-spin" aria-hidden="true"></span>'
  };
  function cell(R, i) {
    var s = R.st[i], S = STAGES[i], meta = [s.dur != null && s.dur > 0 ? durShort(s.dur) : '', s.cost || '', s.who || S.who].filter(Boolean);
    return '<button type="button" class="pl-st pl-st--' + s.st + (R.cur === i ? ' is-cur' : '') + '" data-st="' + esc(R.slug) + '|' + i + '" aria-expanded="' + (P.open === R.slug + '|' + i) + '" title="' + esc(S.l + ': ' + s.label + (s.sub ? ' — ' + s.sub : '')) + '">' +
      '<span class="pl-st__ic">' + SVG[s.st] + '</span><span class="pl-st__t"><b>' + esc(S.l) + '</b><span class="pl-st__s">' + esc(s.label) + (s.sub ? ' · ' + s.sub : '') + '</span><small>' + esc(meta.join(' · ')) + '</small></span>' +
      '<span class="adm-sr">, ' + esc(s.label) + '</span></button>';
  }
  function rowHtml(R) {
    var t = R.trip, where = t ? [H().countryName(t.country), t.region ? H().regionName(t.region) : ''].filter(Boolean).join(' · ') : 'jeszcze bez wersji w bazie';
    var ver = t ? (t.draft != null ? 'szkic v' + t.draft + (t.published != null ? ' · na stronie v' + t.published : '') : t.published != null ? 'v' + t.published : 'v' + t.latest) : '—';
    return '<article class="pl-row" data-row="' + esc(R.slug) + '"><header class="pl-row__h"><span class="ad-team" style="--team:' + esc(t ? t.color : '#5F6368') + '" aria-hidden="true"></span>' +
      '<a class="pl-row__n" href="#/' + encodeURIComponent(R.slug) + '">' + esc(R.name) + '</a><small>' + esc(where) + ' · ' + esc(ver) + '</small>' + (R.waitLimit ? '<span class="ad-st ad-st--warn">' + SVG.wait + '<span>czeka na limit</span></span>' : '') + '</header>' +
      '<div class="pl-stages" role="list">' + STAGES.map(function (S, i) { return '<div role="listitem" class="pl-cell">' + cell(R, i) + (i < 6 ? '<i class="pl-link' + (R.st[i].st === 'ok' || R.st[i].st === 'skip' ? ' is-done' : '') + '" aria-hidden="true"></i>' : '') + '</div>'; }).join('') + '</div></article>';
  }
  function ring(M) {
    var A = M.agy, pct = A.calls != null ? Math.min(100, Math.round(A.calls / AGY_BUDGET * 100)) : null, tone = A.out || A.exhausted ? 'bad' : pct == null ? 'off' : pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : 'ok';
    var r = 34, C = 2 * Math.PI * r, dash = pct == null ? 0 : C * pct / 100;
    var center = A.out ? '<b id="agyLeft" data-until="' + esc(A.out) + '">…</b><small>odnowienie</small>' : pct != null ? '<b>' + pct + '%</b><small>tygodnia</small>' : A.exhausted ? '<b>!</b><small>wyczerpany</small>' : '<b>—</b><small>brak danych</small>';
    var txt = A.out ? 'Limit wyczerpany — <span id="agyTxt">odnowi się za …</span>' : A.exhausted ? 'Limit wyczerpany — czas odnowienia nieznany (pojawi się z <code>ops_status</code>).' : pct != null ? A.calls + ' z ~' + AGY_BUDGET + ' wywołań w 7 dniach (ostrożna miara, próg planu nie jest publikowany).' : 'Zużycie limitu pojawi się po zatwierdzeniu <code>admin.ops_status()</code>.';
    return '<section class="pl-kpi pl-kpi--agy" aria-labelledby="agyH"><h2 id="agyH">Antigravity (Gemini)</h2><div class="pl-ring pl-ring--' + tone + '"><svg viewBox="0 0 80 80" aria-hidden="true"><circle class="pl-ring__bg" cx="40" cy="40" r="' + r + '"/><circle class="pl-ring__v" cx="40" cy="40" r="' + r + '" stroke-dasharray="' + dash.toFixed(1) + ' ' + C.toFixed(1) + '"/></svg><div class="pl-ring__c">' + center + '</div></div>' +
      '<p class="pl-kpi__t">' + txt + '</p>' + (A.src === 'komunikaty' ? '<p class="ad-note">Godzina odnowienia odczytana z komunikatów („Resets in …”), nie z serwera.</p>' : '') + '</section>';
  }
  function topHtml(M) {
    var h = H(), W = M.waiting, cron = M.cron;
    var wait = '<section class="pl-kpi" aria-labelledby="wH"><h2 id="wH">Czeka na limit / kolejkę <b class="ad-badge' + (W.length ? '' : ' is-zero') + '">' + W.length + '</b></h2>' +
      (W.length ? '<p class="pl-kpi__t">Ruszy samo po odnowieniu lub w następnym przebiegu crona:</p><ul class="pl-wait">' + W.slice(0, 8).map(function (w) { return '<li>' + (w.slug ? '<a href="#/' + encodeURIComponent(w.slug) + '">' + esc(w.what) + '</a>' : esc(w.what)) + '<small>' + esc(w.why) + '</small></li>'; }).join('') + (W.length > 8 ? '<li><small>… i ' + (W.length - 8) + ' innych</small></li>' : '') + '</ul>'
        : '<div class="ad-empty">' + SVG.ok + '<p>Nic nie czeka na limit ani w kolejce.</p></div>') + '</section>';
    var c = M.cost, costH = '<section class="pl-kpi" aria-labelledby="cH"><h2 id="cH">Koszty AI</h2>' + (c.err ? '<p class="ad-note">Dziennik kosztów niedostępny (' + esc(c.err) + ').</p>' :
      '<dl class="pl-cost"><div><dt>Dziś</dt><dd>' + h.usd(c.d) + '</dd><small>ekw. ' + h.usd(c.dEq) + '</small></div><div><dt>7 dni</dt><dd>' + h.usd(c.w) + '</dd><small>ekw. ' + h.usd(c.wEq) + '</small></div></dl><p class="ad-note">Zapłacone = płatne API; abonamenty (Claude, AI Pro) jako ekwiwalent. <a href="#/koszty">Szczegóły →</a></p>') + '</section>';
    var cr = '<section class="pl-kpi" aria-labelledby="crH"><h2 id="crH">Cron i serwer</h2>';
    if (cron) {
      var age = cron.last_run ? (M.at - t_(cron.last_run)) / 60000 : null, locks = ['gemini_queue_lock', 'repo_jobs_lock', 'watch_lock'].filter(function (k) { return cron[k]; });
      cr += '<ul class="ad-hrows"><li class="ad-hrow"><span class="ad-hrow__l">Ostatni przebieg</span><span class="ad-hrow__v">' + h.stChip(age == null ? 'wait' : age > 30 ? 'bad' : 'ok', cron.last_run ? h.ago(cron.last_run) : '—') + '</span></li>' +
        '<li class="ad-hrow"><span class="ad-hrow__l">Wyzwalacz</span><span class="ad-hrow__v">' + esc(cron.trigger || '—') + '</span></li>' +
        '<li class="ad-hrow"><span class="ad-hrow__l">Blokady</span><span class="ad-hrow__v">' + (locks.length ? h.stChip('wait', locks.map(function (k) { return k.replace(/_lock$/, '').replace(/_/g, ' '); }).join(', ')) : h.stChip('ok', 'brak')) + '</span></li></ul>';
    } else cr += '<p class="ad-note">Cron, blokady, zlecenia z repo i końcówki logów pojawią się po zatwierdzeniu SQL <code>2026-10-31-admin-ops-status.sql</code> (funkcja <code>admin.ops_status()</code>) w <a href="#/decyzje">Decyzjach</a>. Etapy tras, uwagi JP, kolejka i koszty działają już teraz.</p>';
    cr += '<p class="ad-note">Odświeżanie co 30 s · <span id="plAt">' + esc(clock(new Date(M.at).toISOString())) + '</span> · <a href="#/postep">Kroki i tokeny przebiegów →</a></p></section>';
    return '<div class="pl-top">' + ring(M) + wait + costH + cr + '</div>';
  }
  function failedHtml(M) {
    if (!M.failed.length) return '';
    return '<section class="pl-failed" aria-labelledby="fH"><h2 id="fH" class="pl-h2">Zlecenia z błędem <b class="ad-badge ad-badge--hot">' + M.failed.length + '</b></h2><ul class="pl-flist">' + M.failed.slice(0, 10).map(function (f) {
      return '<li class="pl-fail" data-fail="' + esc(f.id) + '"><div class="pl-fail__b"><b>' + (f.slug ? '<a href="#/' + encodeURIComponent(f.slug) + '">' + esc(f.name) + '</a>' : esc(f.name)) + '</b><p class="pl-fail__why">' + esc(String(f.why).slice(0, 220)) + '</p><small>' + esc(f.at ? H().when(f.at) : '') + (f.by ? ' · zlecił: ' + esc(f.by) : '') + '</small></div>' +
        (f.free ? '<button type="button" class="ad-btn ad-btn--ghost" data-retry="' + esc(f.id) + '" aria-expanded="false">Ponów</button>' : '<span class="ad-st ad-st--bad" title="zlecenie płatne — tylko za zgodą w Decyzjach">' + SVG.warn + '<span>płatne · zgoda w Decyzjach</span></span>') +
        '<div class="pl-retry" hidden></div></li>';
    }).join('') + '</ul></section>';
  }
  function retryHtml(f) {
    var job = { script: f.script, args: f.args, why: 'ponowienie po błędzie: ' + String(f.why).slice(0, 120), by: 'JP (panel)' };
    var name = new Date().toISOString().slice(0, 10) + '-' + String(f.name).replace(/^\d{4}-\d\d-\d\d-/, '') + '-ponow.json';
    return '<p>Panel nie ma jeszcze RPC do kolejkowania zleceń — żaden zapis nie wyszedł z tego ekranu. Zlecenie darmowe (<code>' + esc(f.script) + '</code>) ponowisz, dodając w repo plik <code>_content/jobs/' + esc(name) + '</code> (serwer: <code>repo-jobs.mjs</code>, cron co 2 min):</p>' +
      '<pre class="pl-pre" tabindex="0">' + esc(JSON.stringify(job, null, 1)) + '</pre><p class="ad-note">Albo napisz na #admin: „ponów ' + esc(f.name) + '”.</p>';
  }
  function feedLi(e) {
    return '<li class="pl-ev" data-ev="' + esc(e.id) + '"><time datetime="' + esc(e.at) + '" title="' + esc(H().when(e.at)) + '">' + esc(clock(e.at)) + '</time><span class="pl-ev__b">' + (e.slug ? '<a href="#/' + encodeURIComponent(e.slug) + '">' + esc(M_().names[e.slug] || H().titleCase(e.slug)) + '</a> ' : '') + '<em>' + esc(e.stage) + '</em> ' + esc(e.msg) + (e.sub ? '<small>' + esc(e.sub) + '</small>' : '') + '</span></li>';
  }
  function M_() { return P.data; }
  function feedPaint(M) {
    var ul = document.getElementById('plFeed'); if (!ul) return;
    var have = {}; [].forEach.call(ul.children, function (li) { have[li.getAttribute('data-ev')] = li; });
    var frag = [], ids = {};
    M.feed.forEach(function (e) { ids[e.id] = 1; });
    // różnicowo: usuń te, których nie ma; wstaw nowe na właściwe miejsce; istniejących nie dotykamy (bez migotania)
    Object.keys(have).forEach(function (id) { if (!ids[id]) ul.removeChild(have[id]); });
    var prev = null;
    M.feed.forEach(function (e) {
      var li = have[e.id];
      if (!li) { var tmp = document.createElement('ul'); tmp.innerHTML = feedLi(e); li = tmp.firstChild; li.classList.add('is-new'); if (prev) prev.insertAdjacentElement('afterend', li); else ul.insertAdjacentElement('afterbegin', li); frag.push(li); }
      prev = li;
    });
    if (!M.feed.length && !ul.children.length) ul.innerHTML = '<li class="pl-ev pl-ev--none" data-ev="_none">Brak zdarzeń — pojawią się przy pierwszym przebiegu.</li>';
    var st = document.getElementById('plFeedSt'); if (st) st.textContent = P.feedPaused ? 'wstrzymane (kursor nad listą)' : 'odświeżono ' + clock(new Date().toISOString());
  }
  function sideHtml(key) {
    var M = P.data, p = key.split('|'), R = M.rows[p[0]], i = +p[1]; if (!R) return '';
    var s = R.st[i], S = STAGES[i], t = R.trip, h = H();
    var vers = (M.versions && Array.isArray(M.versions.rows) ? M.versions.rows : []).filter(function (v) { return v.city_slug === R.slug; }).slice(0, 4);
    var ver = t ? [['Najnowsza wersja', 'v' + t.latest + ' · ' + (t.latestStatus || '') + (t.latestAt ? ' · ' + h.when(t.latestAt) : '')], t.draft != null ? ['Szkic', 'v' + t.draft] : null, t.published != null ? ['Na stronie', 'v' + t.published] : null, t.langs ? ['Języki', t.langs.join(', ')] : null, ['Wytyczne', t.std === 'old' ? 'stare' : t.std]].filter(Boolean) : [];
    var log = (s.log || []).slice(-40);
    return '<header class="pl-side__h"><div><p class="pl-side__k">' + esc(R.name) + ' · etap ' + (i + 1) + ' z 7</p><h2>' + esc(S.l) + (S.sub ? ' <small>(' + esc(S.sub) + ')</small>' : '') + '</h2></div><button type="button" class="adm-pop__x" data-side-close aria-label="Zamknij panel etapu">×</button></header>' +
      '<div class="pl-side__b"><p class="pl-side__st">' + h.stChip(s.st === 'ok' ? 'ok' : s.st === 'err' ? 'bad' : s.st === 'warn' ? 'warn' : 'wait', s.label) + (s.sub ? ' <span>' + esc(s.sub) + '</span>' : '') + '</p>' +
      '<dl class="pl-side__meta"><div><dt>Wykonawca</dt><dd>' + esc(s.who || S.who) + '</dd></div><div><dt>Czas</dt><dd>' + esc(s.dur != null && s.dur > 0 ? hm(s.dur) : s.st === 'wait' ? 'jeszcze nie ruszył' : '—') + '</dd></div><div><dt>Koszt</dt><dd>' + esc(s.cost || (s.who === 'JP' || S.who === 'JP' ? 'bez kosztu' : '—')) + '</dd></div>' +
      (s.started ? '<div><dt>Start</dt><dd>' + esc(h.when(s.started)) + '</dd></div>' : '') + (s.ended ? '<div><dt>Koniec</dt><dd>' + esc(h.when(s.ended)) + '</dd></div>' : '') + '</dl>' +
      '<h3 class="ad-sub">Log</h3>' + (log.length ? '<pre class="pl-pre pl-pre--log" tabindex="0">' + esc(log.join('\n')) + '</pre>' : '<p class="ad-note">' + (M.ops ? 'Brak wpisów logu dla tego etapu.' : 'Końcówki logów zleceń pojawią się po zatwierdzeniu <code>admin.ops_status()</code>; kroki przebiegów gemini-draft są już w logu, gdy etap należy do przebiegu.') + '</p>') +
      (ver.length ? '<h3 class="ad-sub">Wersja</h3><ul class="ad-hrows">' + ver.map(function (x) { return '<li class="ad-hrow"><span class="ad-hrow__l">' + esc(x[0]) + '</span><span class="ad-hrow__v">' + esc(x[1]) + '</span></li>'; }).join('') + '</ul>' : '') +
      (vers.length ? '<h3 class="ad-sub">Ostatnie wersje (serwer)</h3><ul class="ad-hrows">' + vers.map(function (v) { return '<li class="ad-hrow"><span class="ad-hrow__l"><a href="#/' + encodeURIComponent(R.slug) + '/v' + esc(v.version) + '">v' + esc(v.version) + '</a> · ' + esc(v.status) + '</span><span class="ad-hrow__v">' + esc((v.errors != null ? v.errors + ' bł. · ' : '') + (v.warnings != null ? v.warnings + ' ostrz. · ' : '') + h.when(v.created_at)) + '</span></li>'; }).join('') + '</ul>' : '') +
      '<p class="pl-side__links"><a class="ad-btn" href="#/' + encodeURIComponent(R.slug) + '">Otwórz trasę</a>' + (t && t.draft != null ? '<a class="ad-btn ad-btn--ghost" href="#/' + encodeURIComponent(R.slug) + '/v' + esc(t.draft) + '">Szkic v' + esc(t.draft) + '</a>' : '') +
      (s.links || []).map(function (l) { return '<a class="ad-btn ad-btn--ghost" href="' + esc(l.h) + '"' + (l.ext ? ' target="_blank" rel="noopener"' : '') + '>' + esc(l.t) + '</a>'; }).join('') + '</p>' +
      (s.retry && s.retry.paid ? '<p class="ad-note">Ponowienie (<code>' + esc(s.retry.what) + '</code>) kosztuje — startuje tylko po zgodzie w <a href="#/decyzje">Decyzjach</a>.</p>' : '') + '</div>';
  }

  function paint(M, full) {
    var h = H(), $d = h.$d, box = document.getElementById('plRoot');
    if (!box || full) {
      $d.innerHTML = '<div class="pl" id="plRoot">' + topHtml(M) + '<div class="pl-grid"><div class="pl-main">' +
        '<h2 class="pl-h2">Trasy w pracy <b class="ad-badge">' + M.active.length + '</b></h2><div id="plRows">' + (M.active.length ? M.active.map(function (s) { return rowHtml(M.rows[s]); }).join('') : '<div class="ad-empty">' + SVG.ok + '<p>Nic nie jest w pracy. Nowe trasy ruszają z kolejki Gemini, poprawki — po wysłaniu uwag.</p></div>') + '</div>' +
        failedHtml(M) +
        (M.rest.length ? '<details class="pl-rest"><summary class="pl-h2">Ukończone i pozostałe <b class="ad-badge">' + M.rest.length + '</b></summary><div id="plRest">' + M.rest.map(function (s) { return rowHtml(M.rows[s]); }).join('') + '</div></details>' : '') +
        (M.errs.length ? '<p class="ad-note">Niedostępne źródła: ' + esc(M.errs.join(', ')) + '.</p>' : '') + '</div>' +
        '<aside class="pl-feed" id="plFeedBox" aria-labelledby="feedH"><header class="pl-feed__h"><h2 id="feedH">Zdarzenia na żywo</h2><small id="plFeedSt" aria-live="polite"></small></header><ul class="pl-evs" id="plFeed"></ul></aside></div>' +
        '<aside class="pl-side" id="plSide" hidden aria-labelledby="plSideH"></aside></div>';
      feedPaint(M);
    } else {
      // odświeżenie: góra + wiersze (innerHTML tylko części), strumień różnicowo
      var top = box.querySelector('.pl-top'); if (top) top.outerHTML = topHtml(M);
      var rows = document.getElementById('plRows'); if (rows) rows.innerHTML = M.active.length ? M.active.map(function (s) { return rowHtml(M.rows[s]); }).join('') : '<div class="ad-empty">' + SVG.ok + '<p>Nic nie jest w pracy.</p></div>';
      var rest = document.getElementById('plRest'); if (rest) rest.innerHTML = M.rest.map(function (s) { return rowHtml(M.rows[s]); }).join('');
      var old = box.querySelector('.pl-failed'), nf = failedHtml(M); if (old) { if (nf) old.outerHTML = nf; else old.remove(); } else if (nf) { var fr = document.createElement('div'); fr.innerHTML = nf; rows.insertAdjacentElement('afterend', fr.firstChild); }
      if (P.feedPaused) P.feedPending = M; else feedPaint(M);
      if (P.open) openSide(P.open, true);
    }
    tickStart();
  }
  function openSide(key, keep) {
    var side = document.getElementById('plSide'); if (!side) return;
    if (!keep && P.open === key) { closeSide(); return; }
    P.open = key;
    side.innerHTML = sideHtml(key); side.hidden = false; document.body.classList.add('has-plside');
    [].forEach.call(document.querySelectorAll('[data-st]'), function (b) { b.setAttribute('aria-expanded', b.getAttribute('data-st') === key ? 'true' : 'false'); });
    if (!keep) { var x = side.querySelector('h2'); if (x) { x.setAttribute('tabindex', '-1'); x.id = 'plSideH'; x.focus({ preventScroll: true }); } }
  }
  function closeSide() {
    var side = document.getElementById('plSide'), key = P.open; P.open = null;
    if (side) { side.hidden = true; side.innerHTML = ''; }
    document.body.classList.remove('has-plside');
    if (key) { var b = document.querySelector('[data-st="' + key.replace(/"/g, '') + '"]'); if (b) { b.setAttribute('aria-expanded', 'false'); b.focus(); } }
  }
  function tick() {
    var el = document.getElementById('agyLeft'), tx = document.getElementById('agyTxt'); if (!el) return;
    var left = t_(el.getAttribute('data-until')) - Date.now();
    if (left <= 0) { el.textContent = '0 s'; if (tx) tx.textContent = 'limit powinien być już odnowiony — kolejny przebieg crona ruszy zlecenia'; return; }
    var s = Math.round(left / 1000), hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    el.textContent = hh ? hh + ' h ' + (mm < 10 ? '0' : '') + mm + ' min' : mm + ' min ' + (ss < 10 ? '0' : '') + ss + ' s';
    if (tx) tx.textContent = 'odnowi się za ' + (hh ? hh + ' h ' + (mm < 10 ? '0' : '') + mm + ' min ' : mm + ' min ') + (ss < 10 ? '0' : '') + ss + ' s';
  }
  function tickStart() { clearInterval(P.tick); tick(); P.tick = setInterval(function () { if (location.hash !== P.hash) { clearInterval(P.tick); return; } tick(); }, 1000); }

  function openPipeline() {
    var h = H();
    h.enter('pipeline', 'Pipeline');
    document.title = 'Pipeline · Quolino admin';
    P.open = null; P.feedPaused = false; P.feedPending = null;
    h.$d.innerHTML = h.loadingHtml('Ładuję pipeline…');
    var draw = function (full) {
      return load().then(function (M) {
        if (location.hash !== P.hash) return;
        P.data = M; paint(M, full);
      }).catch(function (e) { if (full) h.$d.innerHTML = '<div class="adm-placeholder adm-placeholder--err" role="alert"><p>Pipeline niedostępny: ' + esc(e.message) + '</p></div>'; });
    };
    draw(true);
    h.setPoll(function () { if (location.hash === P.hash && !document.hidden) draw(false); }, 30000);
  }

  // ── zdarzenia ─────────────────────────────────────────
  document.addEventListener('click', function (e) {
    if (location.hash !== P.hash || !P.data) return;
    var b = e.target.closest('[data-st]'); if (b) { openSide(b.getAttribute('data-st')); return; }
    if (e.target.closest('[data-side-close]')) { closeSide(); return; }
    var r = e.target.closest('[data-retry]');
    if (r) {
      var li = r.closest('.pl-fail'), box = li.querySelector('.pl-retry'), f = P.data.failed.filter(function (x) { return x.id === r.getAttribute('data-retry'); })[0];
      var open = box.hidden; box.hidden = !open; r.setAttribute('aria-expanded', String(open)); if (open && f) box.innerHTML = retryHtml(f);
    }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && P.open && location.hash === P.hash) closeSide(); });
  document.addEventListener('mouseover', function (e) { if (location.hash === P.hash && e.target.closest && e.target.closest('#plFeedBox')) P.feedPaused = true; });
  document.addEventListener('mouseout', function (e) {
    if (location.hash !== P.hash || !P.feedPaused) return;
    var box = document.getElementById('plFeedBox'); if (!box || (e.relatedTarget && box.contains(e.relatedTarget))) return;
    P.feedPaused = false; if (P.feedPending) { feedPaint(P.feedPending); P.feedPending = null; } else { var st = document.getElementById('plFeedSt'); if (st) st.textContent = 'na żywo'; }
  });
  document.addEventListener('focusin', function (e) { if (location.hash === P.hash && e.target.closest && e.target.closest('#plFeedBox')) P.feedPaused = true; });
  document.addEventListener('focusout', function (e) { if (location.hash === P.hash && P.feedPaused && e.target.closest && e.target.closest('#plFeedBox') && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('#plFeedBox'))) { P.feedPaused = false; if (P.feedPending) { feedPaint(P.feedPending); P.feedPending = null; } } });

  // ── mini-pasek etapów dla kafelka „Serwer” na pulpicie ──
  function miniHtml(runs, queue, trips, reqs) {
    var h = H(), by = {};
    (runs || []).forEach(function (r) { if ((r.status === 'running' || r.status === 'stalled') && !by[r.city_slug]) by[r.city_slug] = { slug: r.city_slug, col: r.kind === 'revise' ? 4 : (+r.stage || 1) <= 1 ? 0 : (+r.stage || 1) <= 3 ? 1 : (+r.stage || 1) === 4 ? 2 : 3, bad: r.status === 'stalled' }; });
    (reqs || []).forEach(function (r) { if ((r.status === 'new' || r.status === 'working') && !by[r.city_slug]) by[r.city_slug] = { slug: r.city_slug, col: 4, bad: false, wait: r.status === 'new' }; });
    (queue || []).forEach(function (j) { if (j.status === 'queued' && !by[j.city_slug]) by[j.city_slug] = { slug: j.city_slug, col: 0, wait: true }; });
    var names = {}; (trips || []).forEach(function (t) { names[t.slug] = t.name; });
    var keys = Object.keys(by).slice(0, 5);
    if (!keys.length) return '<p class="ad-note">Żadna trasa nie jest teraz w pipeline\'ie. <a href="#/pipeline">Pipeline →</a></p>';
    return '<ul class="pl-mini" aria-label="Trasy w pipeline\'ie">' + keys.map(function (k) {
      var x = by[k];
      return '<li><a href="#/pipeline"><span class="pl-mini__n">' + esc(names[k] || h.titleCase(k)) + '</span><span class="pl-mini__bar" aria-hidden="true">' + STAGES.map(function (S, i) { return '<i class="' + (i < x.col ? 'is-done' : i === x.col ? (x.bad ? 'is-bad' : x.wait ? 'is-wait' : 'is-now') : '') + '" title="' + esc(S.l) + '"></i>'; }).join('') + '</span><small>' + esc(STAGES[x.col].l) + (x.bad ? ' · stoi' : x.wait ? ' · czeka' : '') + '</small></a></li>';
    }).join('') + '</ul>';
  }

  window.AdminPipeline = { miniHtml: miniHtml, STAGES: STAGES, open: openPipeline };
})();
