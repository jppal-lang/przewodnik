/* Quolino admin — „hub” (JP 2026-11-07: „trzeba to wszystko zbudować”): spina panel w jedno narzędzie.
 *   liczniki w pasku (admin.nav_counts, co 60 s) · pasek liczb na „Dziś” (admin.today_numbers) · role z bramki (/_whoami)
 *   #/klient/<e-mail>   karta klienta (admin.customer) — konto, tickety, trasy, kupony, zgody; akcje: odpowiedz, eksport, usuń
 *   #/opinie/<trasa>    karta trasy: zgłoszenia, oceny, komentarze, ruch (admin.trip_feedback)
 *   #/ustawienia        ustawienia z białej listy (admin.settings_list / setting_save) + konta zespołu (właściciel)
 *   #/kupony            kupony (admin.coupons_list / coupon_issue / coupon_revoke)
 *   #/tlumaczenia       trasa × język (admin.translations_matrix) + „przetłumacz” (admin.translation_request, w dziennym limicie)
 *   #/wiadomosci        newsletter i lista chętnych: szkic → test → wysyłka (admin.campaign_*)
 *   #/partnerzy         współpraca: etapy (admin.partners_list / partner_stage)
 *   #/dziennik          kto, kiedy, co (admin.audit_list)
 *   AdminHub.csv(rows, cols, nazwa) — eksport CSV z każdej listy.
 * Plik ładuje się PRZED admin.js; z panelu korzysta przez window.AdminHost dopiero przy wywołaniu. Treść z bazy: tylko esc().
 */
(function () {
  'use strict';
  var H = function () { return window.AdminHost; };
  window.AdminExt = window.AdminExt || { routes: {} };
  var R = window.AdminExt.routes;
  window.AdminExt.prefixes = window.AdminExt.prefixes || [];
  var esc = function (s) { return H().esc(s); };
  var tname = function (slug) { var h = H(), k = ((h.state && h.state.trips) || []).filter(function (x) { return x.slug === slug; })[0]; return k && k.name ? k.name : h.titleCase(slug); };
  var n = function (x) { return (+x || 0).toLocaleString('pl-PL'); };
  var day = function (iso) { return iso ? new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; };
  function rpc(fn, body) { return H().api('/rpc/' + fn, { method: 'POST', body: body || {} }); }
  // akcja z komunikatem: błąd sieci, odmowa roli albo {error} z bazy → widoczny komunikat zamiast cichej porażki (test agentów 2026-11-07)
  function act(p, ok, after) {
    return p.then(function (r) { if (r && r.error) throw new Error(r.error); if (r && r.ok === false) throw new Error('nic nie zmieniono'); flash(ok || 'Zapisane.'); if (after) after(r); return r; })
      .catch(function (er) { flash('Nie udało się: ' + (er && er.message || er), true); });
  }
  function flash(s, bad) {
    var el = document.getElementById('hubFlash');
    if (!el) { el = document.createElement('p'); el.id = 'hubFlash'; el.setAttribute('role', 'status'); el.style.cssText = 'position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:60;padding:12px 18px;border-radius:12px;font-size:16px;box-shadow:0 8px 24px rgba(0,0,0,.18);max-width:90vw'; document.body.appendChild(el); }
    el.textContent = s; el.style.background = bad ? 'var(--rosso-50)' : 'var(--card)'; el.style.color = bad ? 'var(--bad-ink)' : 'var(--ink)'; el.style.border = '1px solid ' + (bad ? 'var(--rosso)' : 'var(--rule)'); el.hidden = false;
    clearTimeout(flash.t); flash.t = setTimeout(function () { el.hidden = true; }, 5000);
  }
  function sec(title, sub) { return '<header class="pg-head"><div><p class="label">' + esc(title) + '</p><h2>' + esc(sub) + '</h2></div></header>'; }
  function errBox(e, sql) { return '<p class="adm-empty">Niedostępne: ' + esc(e && e.message || e) + (sql ? '<br>Potrzebny SQL ' + esc(sql) + '.' : '') + '</p>'; }
  var SQLF = '2026-11-07-zz-panel-calosc.sql';
  var INP = 'min-height:44px;font-size:18px;padding:6px 10px';

  // ── CSV ──
  function csv(rows, cols, name) {
    var q = function (v) { v = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[";\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var out = '﻿' + cols.map(function (c) { return q(c[1]); }).join(';') + '\r\n' + (rows || []).map(function (r) { return cols.map(function (c) { return q(typeof c[0] === 'function' ? c[0](r) : r[c[0]]); }).join(';'); }).join('\r\n');
    var url = URL.createObjectURL(new Blob([out], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a');
    a.href = url; a.download = (name || 'quolino') + '-' + new Date().toISOString().slice(0, 10) + '.csv'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
  }
  var csvBtn = function (key) { return '<button type="button" class="qc-btn qc-btn--sm" data-csv="' + key + '" style="min-height:44px">Pobierz CSV</button>'; };

  // ── rola (bramka) i liczniki w pasku ──
  var ROLE = { who: 'JP', role: 'owner' };
  var HIDE = { support: ['pulpit', 'decyzje', 'trasy', 'straznicy', 'ikony', 'grafiki', 'baza-wiedzy', 'mapa', 'ruch', 'uzytkownicy', 'pipeline', 'koszty', 'ustawienia', 'kupony', 'tlumaczenia', 'wiadomosci', 'dziennik'],
               editor: ['uzytkownicy', 'ustawienia', 'kupony', 'wiadomosci', 'dziennik', 'koszty', 'partnerzy'] };
  function applyRole() {
    document.body.setAttribute('data-role', ROLE.role);
    var hide = HIDE[ROLE.role] || [];
    [].forEach.call(document.querySelectorAll('[data-nav]'), function (a) { var k = a.getAttribute('data-nav'); if (hide.indexOf(k) >= 0) a.hidden = true; });
    [].forEach.call(document.querySelectorAll('[data-stats]'), function (a) { if (ROLE.role !== 'owner') a.hidden = true; });
    var w = document.getElementById('adWho'); if (w) w.textContent = ROLE.role === 'owner' ? '' : ROLE.who + ' · ' + (ROLE.role === 'support' ? 'obsługa klienta' : 'redakcja');
  }
  function badge(id, v, warn) { var b = document.getElementById(id); if (!b) return; b.textContent = v ? String(v) : '0'; b.classList.toggle('is-zero', !v); b.classList.toggle('is-warn', !!warn); }
  var counts = {};
  function loadCounts() {
    var h = H(); if (!h) return;
    (h.DEMO ? Promise.resolve({ tickets_new: 2, tickets_todo: 3, tickets_late: 1, users_new_24h: 4, partners_open: 1, campaigns_draft: 1 }) : rpc('nav_counts')).then(function (c) {
      counts = c || {};
      badge('tkCount', c.tickets_todo, c.tickets_late > 0); badge('tkTab', c.tickets_todo, c.tickets_late > 0);
      badge('usrCount', c.users_new_24h); badge('ptCount', c.partners_open); badge('msgCount', c.campaigns_draft);
    }, function () { /* SQL jeszcze nie wdrożony albo rola bez dostępu */ });
  }
  function boot() {
    var h = H(); if (!h) { setTimeout(boot, 200); return; }
    (h.DEMO ? Promise.resolve(null) : fetch('/_whoami', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }))
      .then(function (w) { if (w && w.role) ROLE = w; applyRole(); });
    loadCounts(); setInterval(function () { if (!document.hidden) loadCounts(); }, 60000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  // ── „Dziś”: pasek liczb nad meldunkiem ──
  function todayStrip($d) {
    var h = H(); if (!h || $d.querySelector('#hubToday')) return;
    var box = document.createElement('section'); box.id = 'hubToday'; box.className = 'ad-kpis'; box.setAttribute('aria-label', 'Liczby na dziś');
    $d.prepend(box);
    (h.DEMO ? Promise.resolve({ tickets_new: 2, tickets_todo: 3, tickets_late: 1, users_new_24h: 4, signups_7d: 11, visitors_yesterday: 87, visitors_week: 512, trip_runs_7d: 6, drafts_waiting: 2, rating_avg_30d: 4.6, partners_open: 1 }) : rpc('today_numbers')).then(function (c) {
      var k = function (href, l, v, cap, tone) { return '<a class="ad-kpi' + (tone ? ' ad-kpi--' + tone : '') + '" href="' + href + '"><span class="ad-kpi__l">' + esc(l) + '</span><b class="ad-kpi__v">' + v + '</b>' + (cap ? '<span class="ad-kpi__c">' + esc(cap) + '</span>' : '') + '</a>'; };
      box.innerHTML = k('#/zgloszenia', 'Zgłoszenia do załatwienia', n(c.tickets_todo), (c.tickets_new ? n(c.tickets_new) + ' nowe' : 'brak nowych') + (c.tickets_late ? ' · ' + n(c.tickets_late) + ' po terminie' : ''), c.tickets_late ? 'warn' : '') +
        (ROLE.role === 'support' ? '' :
        k('#/uzytkownicy', 'Nowe konta', n(c.users_new_24h), 'w 24 h · ' + n(c.signups_7d) + ' w 7 dni') +
        k('#/ruch', 'Odwiedzający wczoraj', c.visitors_yesterday == null ? '—' : n(c.visitors_yesterday), c.visitors_week == null ? 'dane po pierwszym pobraniu' : n(c.visitors_week) + ' w 7 dni') +
        k('#/ruch', 'Trasy z dzieckiem', n(c.trip_runs_7d), 'w 7 dni' + (c.rating_avg_30d ? ' · ocena ★ ' + String(c.rating_avg_30d).replace('.', ',') : '')) +
        k('#/trasy', 'Szkice do przejrzenia', n(c.drafts_waiting), 'trasy czekające na Ciebie', c.drafts_waiting ? 'warn' : ''));
    }, function () { box.remove(); });
  }

  // ── karta klienta ──
  window.AdminExt.prefixes.push(['#/klient/', function (rest) {
    var h = H(), mail = decodeURIComponent(rest || '');
    h.enter('uzytkownicy', 'Klient'); document.title = 'Klient · Quolino admin';
    h.$d.innerHTML = h.loadingHtml('Ładuję kartę klienta…');
    var demo = { email: mail, account: true, created_at: new Date().toISOString(), confirmed_at: new Date().toISOString(), last_sign_in_at: new Date().toISOString(), src: 'facebook', lang: 'pl', waitlist: true, newsletter: false,
      tickets: [{ number: 'Q-7KX4-92PM', subject: 'Złe godziny — Grotte di Frasassi', status: 'waiting', updated_at: new Date().toISOString() }], runs: [{ trip: 'asyz', at: new Date().toISOString(), opens: 4 }], opens: [], coupons: [] };
    (h.DEMO ? Promise.resolve(demo) : rpc('customer', { p_email: mail })).then(function (c) {
      var ST = { 'new': 'nowe', open: 'w toku', waiting: 'czeka na klienta', resolved: 'rozwiązane', closed: 'zamknięte', spam: 'spam' };
      var x = '<section class="pg">' + sec('Klient', c.email) +
        '<div class="pg-card"><dl class="pg-big"><div><dt>Konto</dt><dd>' + (c.account ? (c.confirmed_at ? 'potwierdzone' : 'niepotwierdzone') : 'brak konta') + '</dd><p>' + (c.account ? 'od ' + esc(day(c.created_at)) : 'tylko wiadomości z formularza') + '</p></div>' +
        '<div><dt>Ostatnie logowanie</dt><dd>' + esc(c.last_sign_in_at ? h.when(c.last_sign_in_at) : '—') + '</dd><p>skąd: ' + esc(c.src || '—') + ' · język: ' + esc(c.lang || '—') + '</p></div>' +
        '<div><dt>Zgody</dt><dd>' + (c.newsletter ? 'newsletter' : '—') + '</dd><p>' + (c.waitlist ? 'lista chętnych na pełną wersję' : 'bez listy chętnych') + '</p></div></dl></div>';
      x += '<h3 class="pg-h3">Zgłoszenia</h3><div class="pg-card">' + ((c.tickets || []).length ? '<table class="pg-tab"><tbody>' + c.tickets.map(function (t) {
        return '<tr><th scope="row"><a href="#/zgloszenia" data-open-ticket="' + esc(t.number) + '">' + esc(t.subject) + '</a><small>' + esc(t.number) + '</small></th><td>' + esc(ST[t.status] || t.status) + '</td><td>' + esc(h.when(t.updated_at)) + '</td></tr>'; }).join('') + '</tbody></table>' : '<p>Brak zgłoszeń.</p>') + '</div>';
      x += '<h3 class="pg-h3">Trasy</h3><div class="pg-card">' + ((c.runs || []).length || (c.opens || []).length ? '<table class="pg-tab"><tbody>' +
        (c.runs || []).map(function (r) { return '<tr><th scope="row"><a href="#/opinie/' + esc(r.trip) + '">' + esc(tname(r.trip)) + '</a></th><td>z dzieckiem (kod QR)</td><td>' + esc(h.when(r.at)) + '</td></tr>'; }).join('') +
        (c.opens || []).map(function (r) { return '<tr><th scope="row">' + esc(tname(r.trip)) + '</th><td>otwarcia pełnej trasy: ' + n(r.n) + '</td><td>' + esc(h.when(r.last)) + '</td></tr>'; }).join('') + '</tbody></table>' : '<p>Jeszcze nie ruszył w trasę.</p>') + '</div>';
      x += '<h3 class="pg-h3">Kupony</h3><div class="pg-card">' + ((c.coupons || []).length ? '<table class="pg-tab"><tbody>' + c.coupons.map(function (k) {
        return '<tr><th scope="row">' + esc(k.code) + '</th><td>' + n(k.percent) + '%</td><td>' + esc(k.used_at ? 'wykorzystany' : new Date(k.expires_at) < new Date() ? 'wygasł' : 'ważny do ' + day(k.expires_at)) + '</td></tr>'; }).join('') + '</tbody></table>' : '<p>Brak kuponów.</p>') +
        (c.account && ROLE.role === 'owner' ? '<p><a class="qc-btn" href="#/kupony" data-coupon-for="' + esc(c.email) + '" style="min-height:44px">Wydaj kupon temu klientowi</a></p>' : '') + '</div>';
      if (ROLE.role === 'owner' && c.account) x += '<h3 class="pg-h3">RODO</h3><div class="pg-card"><p>Eksport i usunięcie konta są w sekcji Użytkownicy (formularz RODO) — adres jest już wpisany.</p><p><a class="qc-btn" href="#/uzytkownicy" data-gdpr-for="' + esc(c.email) + '" style="min-height:44px">Przejdź do RODO</a></p></div>';
      h.$d.innerHTML = x + '</section>';
    }, function (e) { h.$d.innerHTML = errBox(e, SQLF); });
  }]);
  // przejścia z karty klienta: ticket / kupon / RODO z wpisanym adresem
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-open-ticket],[data-coupon-for],[data-gdpr-for]'); if (!a) return;
    try {
      if (a.hasAttribute('data-open-ticket')) sessionStorage.setItem('adm.openTicket', a.getAttribute('data-open-ticket'));
      if (a.hasAttribute('data-coupon-for')) sessionStorage.setItem('adm.couponFor', a.getAttribute('data-coupon-for'));
      if (a.hasAttribute('data-gdpr-for')) sessionStorage.setItem('adm.gdprFor', a.getAttribute('data-gdpr-for'));
    } catch (x) { /* prywatne okno */ }
  });

  // ── karta trasy: zgłoszenia, oceny, ruch ──
  window.AdminExt.prefixes.push(['#/opinie/', function (rest) {
    var h = H(), slug = decodeURIComponent(rest || '');
    h.enter('ruch', 'Opinie i zgłoszenia: ' + tname(slug)); document.title = 'Opinie · Quolino admin';
    h.$d.innerHTML = h.loadingHtml('Ładuję…');
    (h.DEMO ? Promise.resolve({ slug: slug, tickets: [{ number: 'Q-7KX4-92PM', subject: 'Zamknięte — Rocca', status: 'new', source: 'report', stop: 'Rocca Maggiore', updated_at: new Date().toISOString(), preview: 'Zamknięte w poniedziałek.' }],
      ratings: { avg: 4.5, n: 4, dist: [0, 0, 1, 0, 3] }, comments: [{ stars: 5, comment: 'Dzieci zachwycone!', lang: 'pl', at: new Date().toISOString() }], views_30d: 120, runs_30d: 5, opens_30d: 14 }) : rpc('trip_feedback', { p_slug: slug })).then(function (f) {
      var r = f.ratings || {}, mx = Math.max.apply(null, (r.dist || [0]).concat(1));
      var x = '<section class="pg">' + sec('Opinie i zgłoszenia', tname(slug)) +
        '<p><a class="qc-btn" href="#/' + esc(slug) + '" style="min-height:44px">Otwórz trasę</a></p>' +
        '<div class="pg-card"><dl class="pg-big"><div><dt>Ocena rodzin</dt><dd>' + (r.n ? '★ ' + String(r.avg).replace('.', ',') : '—') + '</dd><p>' + n(r.n) + ' ocen</p></div>' +
        '<div><dt>Wejścia na stronę</dt><dd>' + n(f.views_30d) + '</dd><p>30 dni</p></div><div><dt>Trasy z dzieckiem</dt><dd>' + n(f.runs_30d) + '</dd><p>30 dni · otwarcia pełnej trasy: ' + n(f.opens_30d) + '</p></div></dl>' +
        (r.n ? '<table class="pg-tab"><tbody>' + [5, 4, 3, 2, 1].map(function (s) { var v = (r.dist || [])[s - 1] || 0; return '<tr><th scope="row">' + '★'.repeat(s) + '</th><td>' + n(v) + '</td><td><span aria-hidden="true" style="display:inline-block;height:10px;border-radius:5px;background:currentColor;opacity:.45;width:' + Math.max(3, Math.round(160 * v / mx)) + 'px"></span></td></tr>'; }).join('') + '</tbody></table>' : '') + '</div>';
      x += '<h3 class="pg-h3">Zgłoszenia</h3><div class="pg-card">' + ((f.tickets || []).length ? '<table class="pg-tab"><tbody>' + f.tickets.map(function (t) {
        return '<tr><th scope="row"><a href="#/zgloszenia" data-open-ticket="' + esc(t.number) + '">' + esc(t.subject) + '</a><small>' + esc(t.number) + (t.stop ? ' · ' + esc(t.stop) : '') + '</small></th><td>' + esc(t.preview || '') + '</td><td>' + esc(h.when(t.updated_at)) + '</td></tr>'; }).join('') + '</tbody></table>' : '<p>Brak zgłoszeń.</p>') + '</div>';
      x += '<h3 class="pg-h3">Komentarze rodzin</h3><div class="pg-card">' + ((f.comments || []).length ? '<ul style="list-style:none;padding:0;display:grid;gap:10px">' + f.comments.map(function (c) {
        return '<li><b>' + '★'.repeat(c.stars) + '</b> <small>' + esc(h.when(c.at)) + ' · ' + esc(c.lang || '') + '</small><br>' + esc(c.comment) + '</li>'; }).join('') + '</ul>' : '<p>Brak komentarzy.</p>') + '</div>';
      h.$d.innerHTML = x + '</section>';
    }, function (e) { h.$d.innerHTML = errBox(e, SQLF); });
  }]);

  // ── Ustawienia (+ zespół) ──
  R['#/ustawienia'] = function () {
    var h = H(); h.enter('ustawienia', 'Ustawienia'); document.title = 'Ustawienia · Quolino admin';
    var S = null, T = null, msg = '', link = '';
    function draw() {
      if (!S) { h.$d.innerHTML = h.loadingHtml('Ładuję ustawienia…'); return; }
      if (S.error) { h.$d.innerHTML = errBox(S.error, SQLF); return; }
      var x = '<section class="pg">' + sec('Ustawienia', 'Limity, harmonogramy i zespół') + '<p id="setMsg" role="status">' + esc(msg) + '</p><div class="pg-card"><table class="pg-tab"><tbody>' + S.map(function (s) {
        var inp = s.kind === 'onoff' ? '<select data-set="' + esc(s.name) + '" aria-label="' + esc(s.label) + '" style="' + INP + '"><option value="on"' + (s.value === 'on' ? ' selected' : '') + '>włączone</option><option value="off"' + (s.value === 'off' ? ' selected' : '') + '>wyłączone</option></select>'
          : '<input data-set="' + esc(s.name) + '" aria-label="' + esc(s.label) + '" value="' + esc(s.value) + '" style="' + INP + ';width:' + (s.kind === 'date' ? '14em' : '7em') + '"' + (s.kind === 'date' ? '' : ' inputmode="decimal"') + '>';
        return '<tr><th scope="row">' + esc(s.label) + '<small>' + esc(s.help) + (s.updated_at ? ' · zmienione ' + esc(h.when(s.updated_at)) : '') + '</small></th><td>' + inp + ' <button type="button" class="qc-btn qc-btn--sm" data-setsave="' + esc(s.name) + '" style="min-height:44px">Zapisz</button></td></tr>';
      }).join('') + '<tr><th scope="row">Dzienny limit płatnych modeli (tłumaczenia, strażnicy)<small>Stała decyzja JP: $0,50 dziennie. Zmienia się w pliku .env na serwerze (QUOLINO_DAILY_USD), nie w panelu.</small></th><td>$0,50</td></tr></tbody></table></div>';
      x += '<h3 class="pg-h3">Zespół</h3><div class="pg-card"><p>Każda osoba loguje się własnym Authenticatorem. <b>Obsługa klienta</b> widzi tylko zgłoszenia, klientów i partnerów. <b>Redakcja</b> pracuje na trasach, bez kont, RODO, kosztów, wdrożeń, publikacji i ustawień. Uprawnienia sprawdza serwer.</p>' +
        (T && T.length ? '<table class="pg-tab"><tbody>' + T.map(function (m) {
          return '<tr><th scope="row">' + esc(m.name) + '<small>' + (m.role === 'support' ? 'obsługa klienta' : 'redakcja') + ' · ' + (m.ready ? 'Authenticator działa' : 'czeka na włączenie') + (m.last_login_at ? ' · ostatnio ' + esc(h.when(m.last_login_at)) : '') + '</small></th><td>' +
            (m.active ? '<button type="button" class="qc-btn qc-btn--sm" data-team-invite="' + esc(m.name) + '" data-role="' + esc(m.role) + '" style="min-height:44px">Nowy link (nowy telefon)</button> <button type="button" class="qc-btn qc-btn--sm adm-btn-no" data-team-off="' + m.id + '" style="min-height:44px">Wyłącz dostęp</button>'
              : '<button type="button" class="qc-btn qc-btn--sm" data-team-on="' + m.id + '" style="min-height:44px">Włącz</button>') + '</td></tr>'; }).join('') + '</tbody></table>' : '<p>Na razie tylko Ty.</p>') +
        '<form id="teamForm" style="display:flex;flex-wrap:wrap;gap:10px;align-items:end"><label>Imię (bez polskich znaków)<br><input id="teamName" maxlength="40" style="' + INP + '"></label>' +
        '<label>Rola<br><select id="teamRole" style="' + INP + '"><option value="support">obsługa klienta</option><option value="editor">redakcja</option></select></label>' +
        '<button type="submit" class="qc-btn qc-btn--primary" style="min-height:44px">Dodaj osobę</button></form>' +
        (link ? '<p class="pg-trend"><b>Link do włączenia Authenticatora (działa raz, 24 h) — przekaż go tej osobie:</b><br><code style="word-break:break-all">' + esc(link) + '</code></p>' : '') + '</div>';
      h.$d.innerHTML = x + '</section>';
    }
    function load() {
      if (h.DEMO) { S = [{ name: 'ticket_sla_hours', label: 'Tickety: alarm po (godz.)', help: 'demo', kind: 'int', value: '24' }, { name: 'watch_enabled', label: 'Strażnicy treści', help: 'demo', kind: 'onoff', value: 'on' }]; T = [{ id: 1, name: 'Ola', role: 'support', active: true, ready: true }]; draw(); return; }
      Promise.all([rpc('settings_list'), ROLE.role === 'owner' ? rpc('team_list').catch(function () { return []; }) : []]).then(function (v) { S = v[0] || []; T = v[1]; draw(); }, function (e) { S = { error: e }; draw(); });
    }
    h.$d.onclick = function (e) {
      var b = e.target.closest && e.target.closest('[data-setsave],[data-team-off],[data-team-on],[data-team-invite]'); if (!b) return;
      if (b.hasAttribute('data-setsave')) {
        var k = b.getAttribute('data-setsave'), el = h.$d.querySelector('[data-set="' + k + '"]');
        rpc('setting_save', { p_name: k, p_value: el.value }).then(function (r) { msg = r && r.ok ? 'Zapisane.' : 'Nie zapisano: ' + (r && r.error || ''); load(); }, function (er) { msg = er.message; draw(); });
      } else if (b.hasAttribute('data-team-off') || b.hasAttribute('data-team-on')) {
        var on = b.hasAttribute('data-team-on');
        if (!on && !window.confirm('Wyłączyć dostęp tej osobie? Zalogowana sesja wygaśnie najpóźniej po 30 minutach bez ruchu.')) return;
        act(rpc('team_set', { p_id: +(b.getAttribute('data-team-off') || b.getAttribute('data-team-on')), p_active: on }), on ? 'Dostęp włączony.' : 'Dostęp wyłączony.', load);
      } else {
        act(rpc('team_invite', { p_name: b.getAttribute('data-team-invite'), p_role: b.getAttribute('data-role') }), 'Nowy link gotowy — stary telefon stracił dostęp.', function (r) { link = r && r.link || ''; load(); });
      }
    };
    h.$d.onsubmit = function (e) {
      if (e.target.id !== 'teamForm') return; e.preventDefault();
      rpc('team_invite', { p_name: document.getElementById('teamName').value, p_role: document.getElementById('teamRole').value }).then(function (r) { link = r && r.link || ''; msg = r && r.error ? 'Nie dodano: ' + r.error : 'Dodane — przekaż link tej osobie.'; load(); }, function (er) { msg = er.message; draw(); });
    };
    draw(); load();
  };

  // ── Kupony ──
  R['#/kupony'] = function () {
    var h = H(); h.enter('kupony', 'Kupony'); document.title = 'Kupony · Quolino admin';
    var D = null, msg = '', pre = ''; try { pre = sessionStorage.getItem('adm.couponFor') || ''; sessionStorage.removeItem('adm.couponFor'); } catch (x) { /* brak */ }
    var STL = { active: 'ważny', used: 'wykorzystany', expired: 'wygasł' };
    function draw() {
      if (!D) { h.$d.innerHTML = h.loadingHtml('Ładuję kupony…'); return; }
      if (D.error) { h.$d.innerHTML = errBox(D.error, SQLF); return; }
      var t = D.totals || {}, L = D.coupons || [];
      var x = '<section class="pg">' + sec('Kupony', 'Rabaty z gry i wydane ręcznie') +
        '<dl class="pg-kpi"><div><dt>ważne</dt><dd>' + n(t.active) + '</dd></div><div><dt>wykorzystane</dt><dd>' + n(t.used) + '</dd></div><div><dt>wygasłe</dt><dd>' + n(t.expired) + '</dd></div></dl>' +
        '<div class="pg-card"><h3 class="pg-h3">Wydaj kupon</h3><form id="cpForm" style="display:flex;flex-wrap:wrap;gap:10px;align-items:end">' +
        '<label>E-mail konta<br><input id="cpMail" type="email" value="' + esc(pre) + '" style="' + INP + ';min-width:16em"></label>' +
        '<label>Rabat %<br><input id="cpPct" inputmode="numeric" value="10" style="' + INP + ';width:5em"></label>' +
        '<label>Ważny dni<br><input id="cpDays" inputmode="numeric" value="90" style="' + INP + ';width:5em"></label>' +
        '<label>Tylko trasa (opcjonalnie)<br><input id="cpTrip" placeholder="np. asyz" style="' + INP + ';width:9em"></label>' +
        '<label>Notatka<br><input id="cpNote" maxlength="200" placeholder="np. przeprosiny za błąd" style="' + INP + ';min-width:14em"></label>' +
        '<button type="submit" class="qc-btn qc-btn--primary" style="min-height:44px">Wydaj</button></form><p role="status">' + esc(msg) + '</p>' +
        '<p class="pg-trend">Kupon trafia do konta klienta (widzi go w „Plan i kody”). Rabaty działają od startu płatności.</p></div>' +
        '<div class="pg-card"><p>' + csvBtn('coupons') + '</p>' + (L.length ? '<table class="pg-tab"><thead><tr><th scope="col">Kod</th><th scope="col">Klient</th><th scope="col">Rabat</th><th scope="col">Skąd</th><th scope="col">Stan</th><th scope="col"></th></tr></thead><tbody>' + L.map(function (c) {
          return '<tr><th scope="row">' + esc(c.code) + (c.note ? '<small>' + esc(c.note) + '</small>' : '') + '</th><td>' + (c.email ? '<a href="#/klient/' + encodeURIComponent(c.email) + '">' + esc(c.email) + '</a>' : '—') + '</td><td>' + n(c.percent) + '%' + (c.trip ? '<small>' + esc(c.trip) + '</small>' : '') + '</td><td>' + (c.source === 'gra' ? 'gra' : 'panel') + '</td><td>' +
            esc(STL[c.state] || c.state) + '<small>' + esc(c.used_at ? h.when(c.used_at) : 'do ' + day(c.expires_at)) + '</small></td><td>' + (c.state === 'active' ? '<button type="button" class="qc-btn qc-btn--sm adm-btn-no" data-cp-revoke="' + esc(c.code) + '" style="min-height:44px">Unieważnij</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table>' : '<p>Brak kuponów.</p>') + '</div>';
      h.$d.innerHTML = x + '</section>';
    }
    function load() { (h.DEMO ? Promise.resolve({ totals: { active: 1, used: 0, expired: 0 }, coupons: [{ code: 'QUO-AB12-CD34', percent: 10, source: 'panel', state: 'active', email: 'anna@example.com', expires_at: new Date(Date.now() + 864e7).toISOString() }] }) : rpc('coupons_list')).then(function (r) { D = r || {}; draw(); }, function (e) { D = { error: e }; draw(); }); }
    h.$d.onsubmit = function (e) {
      if (e.target.id !== 'cpForm') return; e.preventDefault();
      var g = function (id) { return document.getElementById(id).value.trim(); };
      rpc('coupon_issue', { p_email: g('cpMail'), p_percent: +g('cpPct'), p_days: +g('cpDays'), p_trip: g('cpTrip') || null, p_note: g('cpNote') || null }).then(function (r) { msg = r && r.ok ? 'Wydany: ' + r.code : 'Nie wydano: ' + (r && r.error || ''); pre = ''; load(); }, function (er) { msg = er.message; draw(); });
    };
    h.$d.onclick = function (e) {
      var b = e.target.closest && e.target.closest('[data-cp-revoke],[data-csv]'); if (!b) return;
      if (b.hasAttribute('data-csv')) { csv(D.coupons, [['code', 'kod'], ['email', 'klient'], ['percent', 'rabat %'], ['trip', 'trasa'], ['source', 'skąd'], ['state', 'stan'], ['expires_at', 'ważny do'], ['used_at', 'wykorzystany'], ['note', 'notatka']], 'kupony'); return; }
      if (!window.confirm('Unieważnić kupon ' + b.getAttribute('data-cp-revoke') + '?')) return;
      act(rpc('coupon_revoke', { p_code: b.getAttribute('data-cp-revoke') }), 'Kupon unieważniony.', load);
    };
    draw(); load();
  };

  // ── Tłumaczenia ──
  R['#/tlumaczenia'] = function () {
    var h = H(); h.enter('tlumaczenia', 'Tłumaczenia'); document.title = 'Tłumaczenia · Quolino admin';
    var D = null, msg = '';
    var CELL = { ok: ['✓', 'aktualne', 'done'], stale: ['!', 'starsze niż treść', 'warn'], none: ['—', 'brak', 'bad'] };
    function draw() {
      if (!D) { h.$d.innerHTML = h.loadingHtml('Ładuję tłumaczenia…'); return; }
      if (D.error) { h.$d.innerHTML = errBox(D.error, SQLF); return; }
      var L = D.langs || [], T = D.trips || [];
      var x = '<section class="pg">' + sec('Tłumaczenia', 'Trasa × język') + '<p role="status">' + esc(msg) + '</p>' +
        '<p class="pg-trend">✓ aktualne · ! starsze niż polska treść · — brak. „Przetłumacz” dokłada brakujące i stare języki w dziennym limicie $0,50 (ok. 0,01–0,05 $ za trasę; ponad limit kolejka czeka do jutra).</p>' +
        '<div class="pg-card" style="overflow-x:auto"><table class="pg-tab"><thead><tr><th scope="col">Trasa</th>' + L.map(function (l) { return '<th scope="col">' + esc(l.toUpperCase()) + '</th>'; }).join('') + '<th scope="col">Ostatnie zlecenie</th><th scope="col"></th></tr></thead><tbody>' +
        T.map(function (t) {
          var c = t.cells || {}, miss = L.filter(function (l) { return c[l] !== 'ok'; }).length, j = t.last_job;
          return '<tr><th scope="row"><a href="#/' + esc(t.slug) + '">' + esc(tname(t.slug)) + '</a><small>' + (miss ? n(miss) + ' do zrobienia' : 'komplet') + '</small></th>' +
            L.map(function (l) { var v = CELL[c[l]] || CELL.none; return '<td title="' + esc(l + ': ' + v[1]) + '"><span class="pg-pill pg-pill--' + v[2] + '">' + v[0] + '</span></td>'; }).join('') +
            '<td>' + (j ? esc(j.status === 'failed' ? 'błąd: ' : j.status === 'done' ? 'zrobione ' : j.status + ' ') + '<small>' + esc((j.result || '').slice(0, 140)) + '</small>' : '—') + '</td>' +
            '<td>' + (miss && ROLE.role === 'owner' ? '<button type="button" class="qc-btn qc-btn--sm" data-tr="' + esc(t.slug) + '" style="min-height:44px">Przetłumacz</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      h.$d.innerHTML = x + '</section>';
    }
    function load() { (h.DEMO ? Promise.resolve({ langs: ['en', 'de', 'cs'], trips: [{ slug: 'asyz', cells: { en: 'ok', de: 'stale', cs: 'none' }, last_job: { status: 'failed', result: 'EN nie przeszedł kontroli' } }] }) : rpc('translations_matrix')).then(function (r) { D = r || {}; draw(); }, function (e) { D = { error: e }; draw(); }); }
    h.$d.onclick = function (e) {
      var b = e.target.closest && e.target.closest('[data-tr]'); if (!b) return;
      b.disabled = true;
      rpc('translation_request', { p_slug: b.getAttribute('data-tr') }).then(function (r) { msg = r && r.ok ? 'Zlecone — kolejka tłumaczeń ruszy w ciągu 20 minut.' : 'Nie zlecono: ' + (r && r.error || ''); load(); }, function (er) { msg = er.message; draw(); });
    };
    draw(); load();
  };

  // ── Wiadomości (newsletter, lista chętnych) ──
  R['#/wiadomosci'] = function () {
    var h = H(); h.enter('wiadomosci', 'Wiadomości'); document.title = 'Wiadomości · Quolino admin';
    var D = null, msg = '', ed = null;
    var AUD = { waitlist: 'lista chętnych na pełną wersję', newsletter: 'newsletter' }, STW = { draft: 'szkic', sending: 'wysyłanie', sent: 'wysłana', cancelled: 'anulowana' };
    function draw() {
      if (!D) { h.$d.innerHTML = h.loadingHtml('Ładuję wiadomości…'); return; }
      if (D.error) { h.$d.innerHTML = errBox(D.error, SQLF); return; }
      var A = D.audiences || {}, C = D.campaigns || [];
      var x = '<section class="pg">' + sec('Wiadomości', 'Maile do list (za zgodą)') + '<p role="status">' + esc(msg) + '</p>' +
        '<dl class="pg-kpi"><div><dt>lista chętnych</dt><dd>' + n(A.waitlist) + '</dd></div><div><dt>newsletter</dt><dd>' + n(A.newsletter) + '</dd></div></dl>' +
        '<div class="pg-card"><h3 class="pg-h3">' + (ed && ed.id ? 'Edycja szkicu' : 'Nowa wiadomość') + '</h3><form id="cmForm" style="display:grid;gap:8px">' +
        '<label>Do kogo<br><select id="cmAud" style="' + INP + '">' + Object.keys(AUD).map(function (k) { return '<option value="' + k + '"' + (ed && ed.audience === k ? ' selected' : '') + '>' + AUD[k] + ' (' + n(A[k]) + ')</option>'; }).join('') + '</select></label>' +
        '<label>Tylko język (opcjonalnie, np. pl)<br><input id="cmLang" maxlength="8" value="' + esc(ed && ed.lang || '') + '" style="' + INP + ';width:6em"></label>' +
        '<label>Temat maila<br><input id="cmSubj" maxlength="150" value="' + esc(ed && ed.subject || '') + '" style="' + INP + ';width:100%"></label>' +
        '<label>Treść (zwykły tekst; stopkę z wypisaniem dodamy sami)<br><textarea id="cmBody" rows="10" style="font-size:18px;width:100%;padding:10px">' + esc(ed && ed.body || '') + '</textarea></label>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap"><button type="submit" class="qc-btn qc-btn--primary" style="min-height:44px">Zapisz szkic</button>' + (ed ? '<button type="button" class="qc-btn" data-cm-new style="min-height:44px">Anuluj edycję</button>' : '') + '</div></form></div>' +
        '<div class="pg-card">' + (C.length ? '<table class="pg-tab"><thead><tr><th scope="col">Wiadomość</th><th scope="col">Do</th><th scope="col">Stan</th><th scope="col"></th></tr></thead><tbody>' + C.map(function (c) {
          return '<tr><th scope="row">' + esc(c.subject) + '<small>' + esc(h.when(c.created_at)) + '</small></th><td>' + esc(AUD[c.audience] || c.audience) + (c.lang ? ' · ' + esc(c.lang) : '') + '</td><td>' + esc(STW[c.status] || c.status) +
            (c.recipients != null ? '<small>' + n(c.sent) + ' / ' + n(c.recipients) + ' wysłanych' + (c.failed ? ' · błędy: ' + n(c.failed) : '') + '</small>' : '') + '</td><td>' +
            (c.status === 'draft' ? '<button type="button" class="qc-btn qc-btn--sm" data-cm-edit="' + c.id + '" style="min-height:44px">Edytuj</button> <button type="button" class="qc-btn qc-btn--sm" data-cm-test="' + c.id + '" style="min-height:44px">Wyślij test do mnie</button> <button type="button" class="qc-btn qc-btn--sm qc-btn--primary" data-cm-send="' + c.id + '" style="min-height:44px">Wyślij do listy</button> <button type="button" class="qc-btn qc-btn--sm adm-btn-no" data-cm-cancel="' + c.id + '" style="min-height:44px">Anuluj</button>'
              : c.status === 'sending' ? '<button type="button" class="qc-btn qc-btn--sm adm-btn-no" data-cm-cancel="' + c.id + '" style="min-height:44px">Zatrzymaj</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table>' : '<p>Brak wiadomości.</p>') +
        '<p class="pg-trend">Maile wysyła serwer (Brevo) w dziennym limicie z Ustawień. Każdy mail ma link do wypisania.</p></div>';
      h.$d.innerHTML = x + '</section>';
    }
    function load() { (h.DEMO ? Promise.resolve({ audiences: { waitlist: 12, newsletter: 30 }, campaigns: [{ id: 1, subject: 'Ruszamy!', audience: 'waitlist', status: 'draft', body: 'Treść', created_at: new Date().toISOString() }] }) : rpc('campaigns_list')).then(function (r) { D = r || {}; draw(); }, function (e) { D = { error: e }; draw(); }); }
    h.$d.onsubmit = function (e) {
      if (e.target.id !== 'cmForm') return; e.preventDefault();
      var g = function (id) { return document.getElementById(id).value; };
      rpc('campaign_save', { p_id: ed && ed.id || null, p_title: g('cmSubj'), p_audience: g('cmAud'), p_subject: g('cmSubj'), p_body: g('cmBody'), p_lang: g('cmLang').trim() || null })
        .then(function (r) { msg = r && r.ok ? 'Szkic zapisany. Wyślij test do siebie, potem do listy.' : 'Nie zapisano: ' + (r && r.error || ''); if (r && r.ok) ed = null; load(); }, function (er) { msg = er.message; draw(); });
    };
    h.$d.onclick = function (e) {
      var b = e.target.closest && e.target.closest('[data-cm-edit],[data-cm-test],[data-cm-send],[data-cm-cancel],[data-cm-new]'); if (!b) return;
      if (b.hasAttribute('data-cm-new')) { ed = null; draw(); return; }
      var id = +(b.getAttribute('data-cm-edit') || b.getAttribute('data-cm-test') || b.getAttribute('data-cm-send') || b.getAttribute('data-cm-cancel'));
      var c = (D.campaigns || []).filter(function (x) { return x.id === id; })[0];
      if (b.hasAttribute('data-cm-edit')) { ed = c; draw(); window.scrollTo(0, 0); return; }
      if (b.hasAttribute('data-cm-test')) {
        var to = window.prompt('Adres do testu:', ''); if (!to) return;
        act(rpc('campaign_send', { p_id: id, p_test_email: to }), 'Test w kolejce — przyjdzie w ciągu kilku minut.', load); return;
      }
      if (b.hasAttribute('data-cm-send')) {
        var cnt = (D.audiences || {})[c.audience] || 0;
        if (!window.confirm('Wysłać „' + c.subject + '” do ' + cnt + ' osób (' + AUD[c.audience] + ')? Tego nie da się cofnąć.')) return;
        act(rpc('campaign_send', { p_id: id }), 'Wysyłka ruszyła.', load); return;
      }
      if (!window.confirm('Anulować / zatrzymać tę wiadomość? Niewysłane maile zostaną usunięte z kolejki.')) return;
      act(rpc('campaign_cancel', { p_id: id }), 'Zatrzymane.', load);
    };
    draw(); load();
  };

  // ── Partnerzy ──
  R['#/partnerzy'] = function () {
    var h = H(); h.enter('partnerzy', 'Partnerzy'); document.title = 'Partnerzy · Quolino admin';
    var D = null, STG = ['nowy', 'rozmowa', 'oferta', 'umowa', 'odrzucony'];
    function draw() {
      if (!D) { h.$d.innerHTML = h.loadingHtml('Ładuję partnerów…'); return; }
      if (D.error) { h.$d.innerHTML = errBox(D.error, SQLF); return; }
      var x = '<section class="pg">' + sec('Partnerzy', 'Zapytania o współpracę') + '<p>' + csvBtn('partners') + '</p>' +
        '<div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">' + STG.map(function (s) {
          var L = D.filter(function (p) { return p.stage === s; });
          return '<div class="pg-card"><h3 class="pg-h3">' + esc(s) + ' (' + L.length + ')</h3>' + L.map(function (p) {
            return '<article style="border-top:1px solid var(--line,#e5e5e5);padding:10px 0"><b><a href="#/zgloszenia" data-open-ticket="' + esc(p.number) + '">' + esc(p.subject) + '</a></b><br><small>' + esc(p.number) + ' · ' + (p.email ? '<a href="#/klient/' + encodeURIComponent(p.email) + '">' + esc(p.email) + '</a>' : 'bez e-maila') + '</small>' +
              (p.preview ? '<p style="margin:6px 0">' + esc(p.preview) + '</p>' : '') +
              '<label>Etap <select data-pstage="' + esc(p.number) + '" style="' + INP + '">' + STG.map(function (o) { return '<option' + (o === s ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></label></article>'; }).join('') + '</div>';
        }).join('') + '</div>';
      h.$d.innerHTML = x + '</section>';
    }
    function load() { (h.DEMO ? Promise.resolve([{ number: 'Q-H3RT-6WQA', subject: 'Współpraca', stage: 'rozmowa', email: 'hotel@example.com', preview: 'Hotel w Asyżu, chcemy polecać wasze trasy gościom.' }]) : rpc('partners_list')).then(function (r) { D = r || []; draw(); }, function (e) { D = { error: e }; draw(); }); }
    h.$d.onchange = function (e) { var s = e.target; if (!s.hasAttribute('data-pstage')) return; act(rpc('partner_stage', { p_number: s.getAttribute('data-pstage'), p_stage: s.value }), 'Etap zmieniony.', load).then(function (r) { if (!r) load(); }); };
    h.$d.onclick = function (e) { if (e.target.closest && e.target.closest('[data-csv]')) csv(D, [['number', 'ticket'], ['subject', 'temat'], ['stage', 'etap'], ['email', 'e-mail'], ['created_at', 'od'], ['updated_at', 'zmiana'], ['preview', 'treść']], 'partnerzy'); };
    draw(); load();
  };

  // ── Dziennik ──
  R['#/dziennik'] = function () {
    var h = H(); h.enter('dziennik', 'Dziennik zdarzeń'); document.title = 'Dziennik · Quolino admin';
    var D = null, q = '';
    function draw() {
      if (!D) { h.$d.innerHTML = h.loadingHtml('Ładuję dziennik…'); return; }
      if (D.error) { h.$d.innerHTML = errBox(D.error, SQLF); return; }
      h.$d.innerHTML = '<section class="pg">' + sec('Dziennik zdarzeń', 'Kto, kiedy, co') +
        '<form id="auForm" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end"><label>Szukaj<br><input id="auQ" value="' + esc(q) + '" style="' + INP + '"></label><button type="submit" class="qc-btn" style="min-height:44px">Szukaj</button>' + csvBtn('audit') + '</form>' +
        '<div class="pg-card">' + (D.length ? '<table class="pg-tab"><thead><tr><th scope="col">Kiedy</th><th scope="col">Kto</th><th scope="col">Co</th><th scope="col">Czego dotyczy</th></tr></thead><tbody>' + D.map(function (a) {
          return '<tr><td>' + esc(h.when(a.at)) + '</td><td>' + esc(a.who) + '</td><th scope="row">' + esc(a.action) + '</th><td>' + esc(a.target || '') + (a.detail ? '<small>' + esc(a.detail) + '</small>' : '') + '</td></tr>'; }).join('') + '</tbody></table>' : '<p>Pusto.</p>') + '</div></section>';
    }
    function load() { (h.DEMO ? Promise.resolve([{ at: new Date().toISOString(), who: 'JP', action: 'ticket: odpowiedź', target: 'Q-7KX4-92PM', detail: 'Dziękujemy…' }]) : rpc('audit_list', { p_limit: 500, p_q: q || null })).then(function (r) { D = r || []; draw(); }, function (e) { D = { error: e }; draw(); }); }
    h.$d.onsubmit = function (e) { if (e.target.id !== 'auForm') return; e.preventDefault(); q = document.getElementById('auQ').value.trim(); load(); };
    h.$d.onclick = function (e) { if (e.target.closest && e.target.closest('[data-csv]')) csv(D, [['at', 'kiedy'], ['who', 'kto'], ['action', 'co'], ['target', 'czego dotyczy'], ['detail', 'szczegóły']], 'dziennik'); };
    draw(); load();
  };

  window.AdminHub = { csv: csv, todayStrip: todayStrip, role: function () { return ROLE; }, counts: function () { return counts; }, reloadCounts: loadCounts, search: function (q) { return rpc('search', { p_q: q }); } };
})();
