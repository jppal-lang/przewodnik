/* Quolino admin — ekran „Dziś” (#/dzis, domyślny start panelu), JP 2026-10-31 („efekt WOW”).
 *
 * Meldunek pisany po ludzku: powitanie wg pory dnia, data, 5–10 krótkich zdań w kolumnie — każde z ikoną rodzaju i w całości
 * klikalne (cały wiersz = link ≥ 44 px do miejsca w panelu), pogrupowane: „Zrobione od ostatniej wizyty” / „Czeka na Ciebie” /
 * „W toku” / „Uwaga”; pod spodem jedna linia stanu (Antigravity, koszty). Zdania pojawiają się jedno po drugim
 * (prefers-reduced-motion → bez animacji). „Odśwież meldunek” = ponowne pobranie, nic więcej.
 *
 * Źródło: rpc/ops_status → snapshots.brief (bin/today-brief.mjs: tryb 'ai' przez Antigravity albo 'auto' z szablonów).
 * Bez admin.ops_status (SQL 2026-10-31-admin-ops-status.sql jeszcze niezatwierdzony) panel składa wersję 'auto' sam,
 * z danych, które już ma: admin_trips, skrzynka decyzji (loadInbox), draft_revision_requests, pipeline_runs, pipeline_queue,
 * ai_usage_daily — te same szablony zdań, co na serwerze. ?demo=1 pokazuje przykładowy meldunek 'ai'.
 *
 * „Ostatnia wizyta”: localStorage `adm.seen_at` (docs/BACKEND.md §6) — znacznik czasu ostatniego otwarcia „Dziś”;
 * wartość sprzed tej wizyty trzymana w pamięci na czas strony, więc „Odśwież” nie chowa świeżo zrobionych rzeczy.
 *
 * Plik ładuje się PRZED admin.js (rejestruje trasę w window.AdminExt.routes); z admin.js korzysta przez window.AdminHost
 * dopiero przy wywołaniu. Haki w admin.js: #/ → ta trasa (gdy zarejestrowana), pulpit zostaje pod #/pulpit.
 */
(function () {
  'use strict';

  var H = function () { return window.AdminHost; };
  var SEEN = 'adm.seen_at';
  var T = { hash: '#/dzis', brief: null, prevSeen: undefined, at: 0, loading: null };
  var ORDER = { todo: 0, warn: 1, wait: 2, done: 3, info: 4 };
  var KIND_PL = { translate: 'tłumaczenie', draft: 'nowa trasa', revise: 'poprawki', recheck: 'kontrola źródeł', choices: 'pytania z wyborem', icons: 'ikony' };
  var WKIND = { prices: 'ceny', hours: 'godziny', link: 'linki', links: 'linki', season: 'sezon', venues: 'lokale', site: 'strona', track: 'zamknięcia', costs: 'koszty', photos: 'zdjęcia' };
  var IC = {
    done: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/></svg>',
    todo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13l3.5-8h9L20 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 13h4.5l1.5 2.5h4l1.5-2.5H20"/></svg>',
    wait: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
    warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5L22 20H2z"/><path d="M12 10v4.5M12 17.2v.3"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.3"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/></svg>'
  };

  window.AdminExt = window.AdminExt || { routes: {} };
  window.AdminExt.routes[T.hash] = openToday;

  // ── pomocnicze ─────────────────────────────────────────
  function esc(s) { return H().esc(s); }
  function onToday() { var h = location.hash; return h === T.hash || !h || h === '#' || h === '#/'; }   // #/ = start panelu
  function t_(iso) { var t = Date.parse(iso || ''); return isNaN(t) ? 0 : t; }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* prywatne okno */ } }
  function soft(p) { return Promise.resolve(p).then(function (v) { return { ok: v }; }, function (e) { if (e && e.session) throw e; return { err: e && e.message || 'błąd' }; }); }
  function plForm(n, a, b, c) { return H().plForm(n, a, b, c); }
  function short(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function recent(iso, hours) { return t_(iso) > 0 && Date.now() - t_(iso) < hours * 3600000; }
  function clean(s) { return String(s || '').replace(/^\[v\d+[a-z]?\]\s*/, '').replace(/^[a-z0-9-]+: /, '').replace(/[①②③④⑤]c?\s*/g, '').replace(/\s—\s/g, ', ').trim(); }
  function hourPl() { return +new Intl.DateTimeFormat('pl-PL', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Warsaw' }).format(new Date()); }
  function greeting() { var h = hourPl(); return h < 5 ? 'Dobrej nocy, Janie.' : h < 18 ? 'Dzień dobry, Janie.' : 'Dobry wieczór, Janie.'; }
  function dateLine() {
    var d = new Date(), s = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Warsaw' }).format(d);
    return s.charAt(0).toUpperCase() + s.slice(1) + ' · ' + new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' }).format(d);
  }
  function dayHour(iso) {
    var t = t_(iso); if (!t) return '';
    var d = new Date(t), f = function (o) { return new Intl.DateTimeFormat('pl-PL', Object.assign({ timeZone: 'Europe/Warsaw' }, o)).format(d); };
    var today = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', day: 'numeric', month: 'numeric' }).format(new Date()), day = f({ day: 'numeric', month: 'numeric' });
    return (day === today ? 'dziś' : day) + ' o ' + f({ hour: '2-digit', minute: '2-digit' });
  }
  function when(iso) {
    var t = t_(iso); if (!t) return '';
    var m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'przed chwilą';
    if (m < 60) return m + ' min temu';
    if (m < 36 * 60) return Math.floor(m / 60) + ' h temu';
    return dayHour(iso);
  }

  // ── wersja 'auto' po stronie przeglądarki (bez admin.ops_status) — te same zdania, co w bin/today-brief.mjs ──
  function factsFromPanel(D) {
    var h = H(), names = {}, F = [];
    (D.trips || []).forEach(function (t) { names[t.slug] = t.name; });
    var nm = function (s) { return names[s] || h.titleCase(s); };
    var add = function (id, kind, text, href, at, trip) { if (!F.some(function (f) { return f.id === id; })) F.push({ id: id, kind: kind, text: text, href: href, when: at || null, trip: trip || null }); };
    var I = D.inbox.ok || null;
    (I && I.drafts.ok || []).forEach(function (x) {
      var ctrl = x.red_flags == null ? 'bez wyniku kontroli' : x.red_flags ? 'kontrola: ' + plForm(x.red_flags, 'czerwona flaga', 'czerwone flagi', 'czerwonych flag') : 'bez czerwonych flag';
      add('draft:' + x.city_slug + ':' + x.version, 'todo', 'Szkic ' + (x.city_name || nm(x.city_slug)) + ' v' + x.version + ' czeka na Twoje przejrzenie (' + ctrl + ').', '#/' + x.city_slug + '/v' + x.version, x.created_at, x.city_slug);
    });
    (D.trips || []).forEach(function (t) {
      if (t.status === 'published' && recent(t.latestAt, 48)) add('pub:' + t.slug + ':' + t.latest, 'done', t.name + ' v' + t.latest + ' jest opublikowana na stronie.', '#/' + t.slug + '/v' + t.latest, t.latestAt, t.slug);
    });
    (D.revs.ok || []).forEach(function (r) {
      var id = 'rev:' + r.id, n = plForm(Array.isArray(r.comment_ids) ? r.comment_ids.length : 0, 'uwaga', 'uwagi', 'uwag'), city = nm(r.city_slug), at = r.updated_at || r.created_at;
      if (r.status === 'new') add(id, 'wait', n + ' do ' + city + ' v' + r.city_version + ' czeka w kolejce Hermesa.', '#/' + r.city_slug, at, r.city_slug);
      else if (r.status === 'working') add(id, 'wait', 'Hermes nanosi ' + n + ' do ' + city + ' v' + r.city_version + '.', '#/' + r.city_slug, at, r.city_slug);
      else if (r.status === 'failed' && recent(at, 72)) add(id, 'warn', 'Poprawka ' + city + ' (prośba #' + r.id + ') nie udała się' + (r.hermes_reply ? ': ' + short(r.hermes_reply, 120) : '.'), '#/' + r.city_slug, at, r.city_slug);
      else if (r.status === 'done' && recent(at, 72)) {
        var v = r.verify && typeof r.verify === 'object' ? r.verify : null, href = r.result_version ? '#/' + r.city_slug + '/v' + r.result_version : '#/' + r.city_slug;
        if (v && v.ready === true) add(id, 'todo', city + ' v' + r.result_version + ' po poprawkach jest gotowa do akceptacji (' + (v.applied != null ? v.applied : '?') + ' z ' + (v.total != null ? v.total : '?') + ' uwag naniesionych).', href, v.checked_at || at, r.city_slug);
        else if (v && v.total != null) add(id, v.pending_ai ? 'wait' : 'warn', city + ' v' + r.result_version + ': naniesiono ' + (v.applied || 0) + ' z ' + v.total + ' uwag' + (v.pending_ai ? ', pełne sprawdzenie po odnowieniu limitu AI' : '') + (v.new_errors ? ', ' + plForm(v.new_errors, 'nowy błąd', 'nowe błędy', 'nowych błędów') + ' w kontroli' : '') + '.', href, v.checked_at || at, r.city_slug);
        else add(id, 'done', n + ' do ' + city + ' naniesione w v' + (r.result_version || '?') + '.', href, at, r.city_slug);
      }
    });
    (D.runs.ok || []).forEach(function (r) {
      var id = 'run:' + r.run_id, at = r.last_at;
      if (r.status === 'running' && recent(at, 3)) add(id, 'wait', 'Hermes ' + (r.kind === 'revise' ? 'poprawia' : 'pisze') + ' ' + nm(r.city_slug) + (r.stop_k && r.stops_n ? ', przystanek ' + r.stop_k + ' z ' + r.stops_n : '') + (r.last_message ? ': ' + short(clean(r.last_message), 90) : '.'), '#/pipeline', at, r.city_slug);
      else if (r.status === 'stalled' || (r.status === 'running' && recent(at, 24))) add(id, 'warn', 'Przebieg ' + nm(r.city_slug) + ' nie dał znaku życia od dłuższego czasu (ostatni krok: ' + short(clean(r.last_message), 80) + ').', '#/pipeline', at, r.city_slug);
      else if ((r.status === 'error' || r.status === 'stopped') && recent(at, 48)) add(id, 'warn', 'Przebieg ' + nm(r.city_slug) + ' ' + (r.status === 'error' ? 'zakończył się błędem' : 'został przerwany') + (r.last_message ? ': ' + short(clean(r.last_message), 100) : '.'), '#/pipeline', at, r.city_slug);
      else if (r.status === 'done' && recent(at, 24)) add(id, 'done', 'Hermes skończył ' + (r.kind === 'revise' ? 'poprawki ' : 'szkic ') + nm(r.city_slug) + (r.last_message ? ' (' + short(clean(r.last_message), 80) + ')' : '') + '.', '#/' + r.city_slug, at, r.city_slug);
    });
    (D.queue.ok || []).forEach(function (j) {
      var req = {}; try { req = JSON.parse(j.request); } catch (e) { /* tekst */ }
      var city = req.name || nm(j.city_slug);
      if (j.status === 'queued') add('job:' + j.id, 'wait', city + ': nowa trasa czeka w kolejce (zlecenie #' + j.id + ').', '#/pipeline', j.created_at, j.city_slug);
      else if (j.status === 'running') add('job:' + j.id, 'wait', city + ': nowa trasa w pracy (zlecenie #' + j.id + ').', '#/pipeline', j.created_at, j.city_slug);
      else if (j.status === 'failed' && recent(j.finished_at, 72)) add('jobfail:' + j.id, 'warn', city + ': nowa trasa (zlecenie #' + j.id + ') nie powiodła się' + (j.result ? ': ' + short(j.result, 100) : '.'), '#/pipeline', j.finished_at, j.city_slug);
      else if (j.status === 'done' && recent(j.finished_at, 24)) add('jobdone:' + j.id, 'done', city + ': nowa trasa zakończona' + (j.result ? ' (' + short(j.result, 80) + ')' : '') + '.', /^v\d+/.test(j.result || '') ? '#/' + j.city_slug + '/' + j.result.match(/^v\d+/)[0] : '#/pipeline', j.finished_at, j.city_slug);
    });
    if (I) {
      (I.deploys.ok || []).filter(function (x) { return x.status === 'pending'; }).forEach(function (d) {
        var files = (d.files || []).map(function (f) { return String(f).split('/').pop(); });
        add('deploy:' + d.id, 'todo', 'Wdrożenie czeka na Twoją zgodę' + (files.length ? ': ' + files.slice(0, 3).join(', ') + (files.length > 3 ? ' i ' + (files.length - 3) + ' innych' : '') : '') + '.', '#/decyzje', d.created_at);
      });
      (I.hist.ok || []).forEach(function (x) {
        var at = x.finished_at || x.decided_at; if (!recent(at, 24)) return;
        var files = (x.files || []).map(function (f) { return String(f).split('/').pop(); }).join(', ');
        if (x.status === 'done') add('deploy:last', 'done', 'Wdrożono: ' + short(files || x.summary || '', 110) + '.', '#/decyzje', at);
        else if (x.status === 'failed') add('deploy:last', 'warn', 'Ostatnie wdrożenie z błędem: ' + short(files || x.result || '', 110) + '.', '#/decyzje', at);
      });
      (I.costs.ok || []).filter(function (x) { return x.status === 'pending'; }).forEach(function (c) {
        add('cost:' + c.id, 'todo', 'Zgoda na koszt: ' + short(c.title, 80) + (c.est_usd != null ? ' (szacunek ' + (+c.est_usd).toFixed(2) + ' $)' : c.est_limit ? ' (' + short(c.est_limit, 50) + ')' : '') + '.', '#/decyzje', c.created_at);
      });
      var wr = (I.watch.ok && I.watch.ok.ready && I.watch.ok.rows) || [], wb = {}, newest = null;
      wr.forEach(function (r) { wb[r.kind] = (wb[r.kind] || 0) + 1; if (!newest || r.created_at > newest) newest = r.created_at; });
      if (wr.length) add('watch:open', 'todo', plForm(wr.length, 'ustalenie strażników czeka', 'ustalenia strażników czekają', 'ustaleń strażników czeka') + ' na decyzję (' + Object.keys(wb).map(function (k) { return (WKIND[k] || k) + ' ' + wb[k]; }).join(', ') + ').', '#/straznicy', newest);
      (I.icons.ok || []).forEach(function (ic) {
        var late = ic.deadline && t_(ic.deadline) < Date.now(), n = ic.stops.length;
        add('icon:' + ic.trip, late ? 'warn' : 'todo', nm(ic.trip) + ': ' + plForm(n, 'przystanek czeka', 'przystanki czekają', 'przystanków czeka') + ' na wybór zdjęcia do ikony' + (ic.deadline ? (late ? ', termin minął, automat wybierze sam' : ', automat ruszy ' + dayHour(ic.deadline)) : '') + '.', '#/ikony', null, ic.trip);
      });
    }
    var agy = D.agy; if (agy && t_(agy) > Date.now()) add('agy:out', 'warn', 'Limit Antigravity wyczerpany, wraca ' + dayHour(agy) + '; nowe trasy i poprawki czekają.', '#/pipeline', null);
    F.sort(function (a, b) { return ORDER[a.kind] - ORDER[b.kind] || t_(b.when) - t_(a.when); });
    return F.slice(0, 14);
  }
  function statusFromPanel(D) {
    var parts = [], agy = D.agy;
    parts.push(agy && t_(agy) > Date.now() ? 'Antigravity wraca ' + dayHour(agy) : 'Antigravity dostępny');
    var today = new Date().toISOString().slice(0, 10), usd = 0, eq = 0;
    (D.usage.ok || []).forEach(function (r) { if (r.day === today) { usd += +r.usd || 0; eq += +r.usd_equiv || 0; } });
    parts.push('koszty dziś: ' + usd.toFixed(2) + ' $ zapłacone, ' + eq.toFixed(2) + ' $ ekwiwalentu');
    return 'stan: ' + parts.join(' · ') + '.';
  }
  function autoFromPanel(D) {
    var F = factsFromPanel(D), n = function (k) { return F.filter(function (f) { return f.kind === k; }).length; };
    var sum = F.length ? [n('todo') ? plForm(n('todo'), 'rzecz czeka', 'rzeczy czekają', 'rzeczy czeka') + ' na Ciebie' : 'nic nie czeka na Twoją decyzję',
      n('warn') ? plForm(n('warn'), 'sprawa wymaga', 'sprawy wymagają', 'spraw wymaga') + ' uwagi' : '', n('wait') ? plForm(n('wait'), 'zadanie w toku', 'zadania w toku', 'zadań w toku') : ''].filter(Boolean).join(', ') + '.'
      : 'Spokojnie: nic nie czeka, nic się nie dzieje w tle.';
    return { generated_at: new Date().toISOString(), mode: 'auto', source: 'panel', items: F, summary: sum.charAt(0).toUpperCase() + sum.slice(1), status: statusFromPanel(D) };
  }
  // limit Antigravity bez ops_status: z komunikatów („Resets in 2h14m” w odpowiedzi Hermesa / wyniku zlecenia)
  function agyFromText(rows) {
    var best = null;
    (rows || []).forEach(function (x) {
      var txt = x.hermes_reply || x.result || '', at = x.updated_at || x.finished_at || x.created_at;
      var m = String(txt).match(/Resets in\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?/i) || String(txt).match(/odnowi się za\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*min)?/i);
      if (!m || (!m[1] && !m[2])) return;
      var t = (t_(at) || Date.now()) + ((+(m[1] || 0)) * 60 + (+(m[2] || 0))) * 60000;
      if (t > Date.now() && (!best || t > best)) best = t;
    });
    return best ? new Date(best).toISOString() : null;
  }

  // ── demo: przykładowy meldunek 'ai' z danych testowych ──
  function demoBrief() {
    var now = Date.now(), iso = function (m) { return new Date(now - m * 60000).toISOString(); };
    return { generated_at: iso(8), mode: 'ai', summary: 'Trzy sprawy czekają na Twoją decyzję, jedna poprawka nie wyszła, Gubbio i Frasassi są w pisaniu.',
      status: 'stan: Antigravity wraca ' + dayHour(new Date(now + 200 * 60000).toISOString()) + ' (159 wywołań w 7 dni) · koszty 24 h: 0.03 $ zapłacone, 0.42 $ ekwiwalentu.',
      items: [
        { id: 'pub:spello:1', kind: 'done', text: 'Spello v1 poszło na stronę, to pierwsza publikacja tej trasy.', href: '#/spello/v1', when: iso(35), trip: 'spello' },
        { id: 'deploy:last', kind: 'done', text: 'Wdrożenie ikon (wybór zdjęć w panelu) przeszło bez uwag.', href: '#/decyzje', when: iso(298) },
        { id: 'repo:2026-10-31-spello-watch-prices', kind: 'done', text: 'Strażnik cen przejrzał Spello i zostawił 6 ustaleń.', href: '#/pipeline', when: iso(198) },
        { id: 'draft:spello:2', kind: 'todo', text: 'Szkic Spello v2 czeka na Twoje przejrzenie, kontrola zostawiła 3 czerwone flagi.', href: '#/spello/v2', when: iso(60), trip: 'spello' },
        { id: 'deploy:12', kind: 'todo', text: 'Wdrożenie skrzynki decyzji czeka na Twoją zgodę: 2026-10-30-skrzynka-decyzji.sql i deploy.sh.', href: '#/decyzje', when: iso(14) },
        { id: 'cost:4', kind: 'todo', text: 'Tłumaczenie Rimini na 7 języków potrzebuje Twojej zgody na koszt, szacunek 0.40 $.', href: '#/decyzje', when: iso(40) },
        { id: 'watch:open', kind: 'todo', text: 'Strażnicy mają 2 ustalenia do decyzji: godziny jaskiń Frasassi i martwy link do parkingu w Spello.', href: '#/straznicy', when: iso(70) },
        { id: 'rev:6', kind: 'wait', text: 'Hermes nanosi 4 uwagi do Ancony v1, powinno być gotowe niedługo.', href: '#/ancona', when: iso(4), trip: 'ancona' },
        { id: 'run:demo-1', kind: 'wait', text: 'Gubbio powstaje: Hermes jest przy 4 z 9 przystanków, teraz Palazzo dei Consoli.', href: '#/pipeline', when: iso(2), trip: 'gubbio' },
        { id: 'rev:7', kind: 'wait', text: '3 uwagi do Wieliczki v1 czekają, aż wróci limit Antigravity.', href: '#/wieliczka', when: iso(12), trip: 'wieliczka' },
        { id: 'rev:5', kind: 'warn', text: 'Urbino v2: Hermes naniósł 3 z 5 uwag, dwie zostały bez źródła, zajrzyj zanim zatwierdzisz.', href: '#/urbino/v2', when: iso(520), trip: 'urbino' },
        { id: 'jobfail:8', kind: 'warn', text: 'Tłumaczenie Urbino na czeski urwało się w połowie, zlecenie #8 trzeba ponowić.', href: '#/pipeline', when: iso(3000), trip: 'urbino' }
      ] };
  }

  // ── wczytanie ──────────────────────────────────────────
  function load(force) {
    var h = H();
    if (h.DEMO) return Promise.resolve(demoBrief());
    if (force) h.ops.at = 0;
    return h.loadOps().catch(function () { return null; }).then(function (ops) {
      var b = ops && ops.snapshots && ops.snapshots.brief && ops.snapshots.brief.data;
      if (b && Array.isArray(b.items)) return Object.assign({ source: 'serwer' }, b);
      return loadPanel();
    });
  }
  function loadPanel() {
    var h = H(), api = h.api, since = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
    return Promise.all([
      Promise.resolve(h.state.tripsP).catch(function () { return null; }),
      soft(h.loadInbox()),
      soft(api('/draft_revision_requests?order=id.desc&limit=20')),
      soft(api('/pipeline_runs?order=last_at.desc&limit=30')),
      soft(api('/pipeline_queue?order=id.desc&limit=20')),
      soft(api('/ai_usage_daily?day=gte.' + since + '&order=day.desc&limit=500'))
    ]).then(function (r) {
      var D = { trips: h.state.trips || [], inbox: r[1], revs: r[2], runs: r[3], queue: r[4], usage: r[5] };
      D.agy = agyFromText((D.revs.ok || []).concat(D.queue.ok || []));
      return autoFromPanel(D);
    });
  }

  // ── rysowanie ──────────────────────────────────────────
  function groups(B) {
    var prev = T.prevSeen, items = (B.items || []).slice();
    var done = items.filter(function (i) { return i.kind === 'done' && (prev == null || t_(i.when) === 0 || t_(i.when) > prev); });
    return [
      { k: 'done', h: prev == null ? 'Zrobione ostatnio' : 'Zrobione od ostatniej wizyty', sub: prev == null ? '' : dayHour(new Date(prev).toISOString()), items: done, empty: 'Nic nowego od ostatniej wizyty.' },
      { k: 'todo', h: 'Czeka na Ciebie', items: items.filter(function (i) { return i.kind === 'todo'; }), empty: 'Nic nie czeka na Twoją decyzję.' },
      { k: 'wait', h: 'W toku', items: items.filter(function (i) { return i.kind === 'wait'; }), empty: 'Nic nie pracuje w tle.' },
      { k: 'warn', h: 'Uwaga', items: items.filter(function (i) { return i.kind === 'warn' || i.kind === 'info'; }), empty: null }
    ];
  }
  function itemHtml(it, i) {
    return '<li class="td-it td-it--' + esc(it.kind) + '" style="--i:' + i + '"><a class="td-a" href="' + esc(it.href) + '">' +
      '<span class="td-ic" aria-hidden="true">' + (IC[it.kind] || IC.info) + '</span><span class="td-t">' + esc(it.text) + '</span>' +
      (it.when ? '<time class="td-when" datetime="' + esc(it.when) + '">' + esc(when(it.when)) + '</time>' : '<span class="td-when"></span>') + '</a></li>';
  }
  function paint(B) {
    var h = H(), i = 0, G = groups(B), nItems = (B.items || []).length;
    var mode = B.mode === 'ai' ? 'meldunek napisany przez AI (Antigravity)' : B.source === 'panel' ? 'wersja szablonowa, złożona w przeglądarce' : 'wersja szablonowa';
    var html = '<div class="td" id="tdRoot"><header class="td-hero"><p class="td-date">' + esc(dateLine()) + '</p><h2 class="td-greet">' + esc(greeting()) + '</h2>' +
      '<p class="td-sum">' + esc(B.summary || '') + '</p>' +
      '<div class="td-tools"><button type="button" class="ad-btn ad-btn--ghost td-refresh" id="tdRefresh">' + IC.refresh + ' Odśwież meldunek</button>' +
      '<span class="td-mode">' + esc(mode) + (B.generated_at ? ' · ' + esc(when(B.generated_at)) : '') + '</span></div></header>';
    html += '<div class="td-live" id="tdLive"></div>';
    G.forEach(function (g) {
      if (!g.items.length && !g.empty) return;
      html += '<section class="td-grp td-grp--' + g.k + '" aria-labelledby="tdg-' + g.k + '"><h3 class="td-h" id="tdg-' + g.k + '">' + esc(g.h) + (g.sub ? ' <small>od ' + esc(g.sub) + '</small>' : '') +
        (g.items.length ? ' <b class="ad-badge">' + g.items.length + '</b>' : '') + '</h3>';
      html += g.items.length ? '<ol class="td-list">' + g.items.map(function (it) { return itemHtml(it, i++); }).join('') + '</ol>' : '<p class="td-empty" style="--i:' + (i++) + '">' + esc(g.empty) + '</p>';
      html += '</section>';
    });
    if (!nItems) html += '<p class="td-empty td-empty--all">Spokojnie: nic nie czeka, nic się nie dzieje w tle.</p>';
    html += '<p class="td-state" style="--i:' + i + '">' + esc(B.status || '') + '</p>';
    if (!h.DEMO && B.source === 'panel') html += '<p class="ad-note">Pełny meldunek (pisany przez AI, z zleceniami i strażnikami z serwera) pojawi się, gdy panel dostanie <code>ops_status</code> w schemacie admin.</p>';
    html += '</div>';
    h.$d.innerHTML = html;
    document.dispatchEvent(new CustomEvent('adm:today', { detail: { brief: B } }));
  }

  function openToday() {
    var h = H();
    h.enter('dzis', 'Dziś');
    document.title = 'Dziś · Quolino admin';
    document.body.classList.add('is-today');
    if (T.prevSeen === undefined) { var s = lsGet(SEEN); T.prevSeen = s && !isNaN(Date.parse(s)) ? Date.parse(s) : null; }
    lsSet(SEEN, new Date().toISOString());
    if (!h.$d.querySelector('#tdRoot')) h.$d.innerHTML = h.loadingHtml('Składam meldunek…');
    draw(false);
    h.setPoll(function () { if (onToday() && !document.hidden) draw(false); }, 120000);
  }
  function draw(force) {
    var h = H();
    if (T.loading) return T.loading;
    T.loading = load(force).then(function (B) {
      T.loading = null; if (!onToday()) return;
      T.brief = B; T.at = Date.now(); paint(B);
    }, function (e) {
      T.loading = null; if (!onToday()) return;
      h.$d.innerHTML = '<div class="adm-placeholder adm-placeholder--err" role="alert"><p>Meldunek niedostępny: ' + esc(e.message) + '</p></div>';
    });
    return T.loading;
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#tdRefresh');
    if (!b || !onToday()) return;
    b.disabled = true; b.classList.add('is-busy');
    draw(true).then(function () { var nb = document.getElementById('tdRefresh'); if (nb) nb.focus(); });
  });
  document.addEventListener('adm:route', function () { if (!onToday()) document.body.classList.remove('is-today'); });

  window.AdminToday = { open: openToday, factsFromPanel: factsFromPanel, greeting: greeting, hash: T.hash };
})();
