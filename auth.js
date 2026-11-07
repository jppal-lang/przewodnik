/* Quolino — konto rodzica: sesja logowania (GoTrue na auth.quolino.com). Bez bibliotek, bez ciasteczek.
   Plan: docs/LOGOWANIE.md. Od 2026-10-18 (JP): rejestracja e-mail + hasło z linkiem potwierdzającym (przez bramkę z ALTCHA),
   logowanie e-mail + hasło, reset hasła linkiem. Google dojdzie bez zmian w tym pliku.
   – Po kliknięciu linku z e-maila (potwierdzenie, reset) GoTrue wraca z #access_token=…&type=… — zapisujemy sesję i czyścimy adres.
   – Sesja w localStorage pod kluczem „qc.session” (token dostępu 1 h + token odświeżania z rotacją). Wylogowanie unieważnia ją na serwerze.
   – Ikona konta na pasku: zalogowany → /konto.html (kolor), niezalogowany → /zaloguj.html.
   – Od 2026-10-29 (JP, D-1): logowanie KODEM Z MAILA (6 cyfr), hasło opcjonalne. Kod zakłada konto, jeśli go nie ma.
     .codeLogin() pyta bramkę (GET /otp), czy serwer ma to włączone → {on, length}; bez tego strona zostaje przy haśle.
     .sendCode(email, weryfikacja, next) → POST /otp przez bramkę (ALTCHA); .verifyCode(email, kod) → POST /verify type=email → sesja.
   Użycie: QAuth.signIn(email, hasło), .signUp(email, hasło, weryfikacja, next), .recover(email, weryfikacja), .setPassword(hasło),
   .resend(email, next), .codeLogin(), .sendCode(…), .verifyCode(…), .session(), .user(), .signOut(),
   .linkType() ('signup' | 'recovery' | 'magiclink' | ''), .ready (Promise), zdarzenie „qauth”. */
(function () {
  'use strict';
  var API = 'https://auth.quolino.com/auth/v1';
  var KEY = 'qc.session';
  var lastError = '', linkType = '';

  function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function save(s) { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch (e) { /* prywatne okno */ } }
  function claims(jwt) {
    try { return JSON.parse(decodeURIComponent(escape(atob(String(jwt).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))))); } catch (e) { return {}; }
  }
  function fromTokens(at, rt, expiresIn) {
    var c = claims(at);
    return { at: at, rt: rt, exp: Date.now() + (Number(expiresIn) || 3600) * 1000, email: c.email || '', sub: c.sub || '' };
  }
  function emit() { try { document.dispatchEvent(new CustomEvent('qauth', { detail: { session: load() } })); } catch (e) { /* stare przeglądarki */ } }

  // 1. powrót z linku w e-mailu: #access_token=… albo #error=…
  (function readHash() {
    var h = location.hash || '';
    if (!/access_token=|error=|error_code=/.test(h)) return;
    var p = new URLSearchParams(h.slice(1));
    if (p.get('access_token') && p.get('refresh_token')) { save(fromTokens(p.get('access_token'), p.get('refresh_token'), p.get('expires_in'))); linkType = p.get('type') || ''; }
    else {
      lastError = p.get('error_code') || p.get('error') || 'error';
      // link wygasły / użyty: komunikat pokazuje strona logowania
      if (!/\/zaloguj(\.html)?$/.test(location.pathname)) { location.replace('/zaloguj.html#error_code=' + encodeURIComponent(lastError)); return; }
    }
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; }
  })();

  async function call(path, opts) {
    var r = await fetch(API + path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {}));
    var body = null; try { body = await r.json(); } catch (e) { /* pusta odpowiedź */ }
    return { ok: r.ok, status: r.status, body: body || {} };
  }

  var refreshing = null;
  async function refresh() {
    var s = load(); if (!s || !s.rt) return null;
    if (refreshing) return refreshing;
    refreshing = (async function () {
      try {
        var r = await call('/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: s.rt }) });
        if (r.ok && r.body.access_token) { var n = fromTokens(r.body.access_token, r.body.refresh_token, r.body.expires_in); save(n); return n; }
        if (r.status === 400 || r.status === 401) { save(null); emit(); }   // token unieważniony albo wygasły
        return null;
      } catch (e) { return load(); }                                        // brak sieci: nie wylogowujemy
      finally { refreshing = null; }
    })();
    return refreshing;
  }
  async function session() {
    var s = load(); if (!s) return null;
    if (s.exp - Date.now() < 5 * 60 * 1000) s = await refresh();
    return s;
  }
  async function user() {
    var s = await session(); if (!s) return null;
    try {
      var r = await call('/user', { headers: { Authorization: 'Bearer ' + s.at } });
      if (r.ok) return r.body;
      if (r.status === 401) { s = await refresh(); if (!s) return null; r = await call('/user', { headers: { Authorization: 'Bearer ' + s.at } }); return r.ok ? r.body : null; }
    } catch (e) { /* brak sieci */ }
    return { email: s.email, id: s.sub, offline: true };
  }
  function back(next, fallback) {
    return 'https://quolino.com' + (next && /^\/[a-z0-9._\-\/]*(\?[^#]*)?$/i.test(next) ? next : fallback);
  }
  function result(r) { return { ok: r.ok, status: r.status, code: r.body.error_code || r.body.code || '', msg: r.body.msg || r.body.message || '', body: r.body }; }
  async function safe(fn) { try { return await fn(); } catch (e) { return { ok: false, status: 0, code: 'network', msg: '' }; } }
  // logowanie hasłem
  function signIn(email, password) {
    return safe(async function () {
      var r = await call('/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: String(email || '').trim(), password: password }) });
      if (r.ok && r.body.access_token) { save(fromTokens(r.body.access_token, r.body.refresh_token, r.body.expires_in)); paintNav(); emit(); }
      return result(r);
    });
  }
  // skąd przyszła rodzina (JP 2026-11-07: „skąd przyszli”): pierwsze wejście z ?utm_source / ?ref / obcego referrera zapisujemy
  // w localStorage „qc.src” (tylko nazwa źródła, kampania i data; bez identyfikatorów) i dołączamy do rejestracji jako metadane konta.
  var SRC = 'qc.src';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50d3BqY3VwZmZkb3pzdGJpamhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMzc5MTUsImV4cCI6MjEwMjgxMzkxNX0.OddjLt-gKKmj2H7wrEKJ14CXrsXu0L4UBO2GC9OiCGo';   // klucz publiczny (jak na stronach)
  (function firstTouch() {
    try {
      if (localStorage.getItem(SRC)) return;
      var q = new URLSearchParams(location.search), ref = '';
      try { ref = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''; } catch (e) { ref = ''; }
      if (/(^|\.)(quolino|questini)\.com$/.test(ref)) ref = '';
      var s = q.get('utm_source') || q.get('ref') || ref;
      var clean = function (v) { return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9._-]/g, '').slice(0, 40); };
      if (!clean(s)) return;
      localStorage.setItem(SRC, JSON.stringify({ s: clean(s), m: clean(q.get('utm_medium')), c: clean(q.get('utm_campaign')), t: new Date().toISOString().slice(0, 10) }));
    } catch (e) { /* prywatne okno */ }
  })();
  function signupMeta() {
    var m = {}, v = null;
    try { v = JSON.parse(localStorage.getItem(SRC) || 'null'); } catch (e) { v = null; }
    if (v && v.s) m.src = [v.s, v.m, v.c].filter(Boolean).join('/').slice(0, 60);
    var l = (document.documentElement.lang || '').toLowerCase().slice(0, 8); if (l) m.lang = l;
    return m;
  }
  // rejestracja: bramka sprawdza „Nie jestem robotem” (altcha), pułapkę (hp) i czas wypełnienia (ms); GoTrue wysyła link potwierdzający
  function signUp(email, password, check, next) {
    return safe(async function () {
      var c = check || {};
      return result(await call('/signup?redirect_to=' + encodeURIComponent(back(next, '/konto.html')), { method: 'POST',
        body: JSON.stringify({ email: String(email || '').trim(), password: password, data: signupMeta(), altcha: c.altcha, hp: c.hp || '', ms: c.ms || 0 }) }));
    });
  }
  // reset hasła: link prowadzi na /zaloguj.html (tam formularz „nowe hasło”)
  function recover(email, check) {
    return safe(async function () {
      var c = check || {};
      return result(await call('/recover?redirect_to=' + encodeURIComponent(back('/zaloguj.html', '/zaloguj.html')), { method: 'POST',
        body: JSON.stringify({ email: String(email || '').trim(), altcha: c.altcha, hp: c.hp || '', ms: c.ms || 0 }) }));
    });
  }
  function resend(email, next) {
    return safe(async function () {
      return result(await call('/resend?redirect_to=' + encodeURIComponent(back(next, '/konto.html')), { method: 'POST',
        body: JSON.stringify({ type: 'signup', email: String(email || '').trim() }) }));
    });
  }
  // logowanie kodem z maila: czy serwer to obsługuje (bramka odpowiada na GET /otp dopiero po włączeniu, OTP_LOGIN=1)
  var codeProbe = null;
  function codeLogin() {
    if (codeProbe) return codeProbe;
    codeProbe = (async function () {
      var ctl = typeof AbortController === 'function' ? new AbortController() : null;
      var t = ctl ? setTimeout(function () { ctl.abort(); }, 3000) : null;
      try {
        var r = await fetch(API + '/otp', { method: 'GET', cache: 'no-store', signal: ctl ? ctl.signal : undefined });
        var b = r.ok ? await r.json() : null;
        var n = b && Number(b.length);
        return b && b.otp === true ? { on: true, length: n >= 6 && n <= 10 ? n : 6 } : { on: false, length: 6 };
      } catch (e) { return { on: false, length: 6 }; }                        // dziś: Traefik zwraca 403 bez CORS → hasło
      finally { if (t) clearTimeout(t); }
    })();
    return codeProbe;
  }
  // wysłanie kodu: bramka sprawdza „Nie jestem robotem” (altcha), pułapkę (hp) i czas (ms); GoTrue wysyła e-mail z kodem
  // (nowe konto: zakłada je; link z tego samego maila wraca na next)
  function sendCode(email, check, next) {
    return safe(async function () {
      var c = check || {};
      return result(await call('/otp?redirect_to=' + encodeURIComponent(back(next, '/konto.html')), { method: 'POST',
        body: JSON.stringify({ email: String(email || '').trim(), create_user: true, altcha: c.altcha, hp: c.hp || '', ms: c.ms || 0 }) }));
    });
  }
  // sprawdzenie kodu: GoTrue zwraca sesję jak przy haśle
  function verifyCode(email, code) {
    return safe(async function () {
      var r = await call('/verify', { method: 'POST',
        body: JSON.stringify({ type: 'email', email: String(email || '').trim(), token: String(code || '').replace(/\D/g, '') }) });
      if (r.ok && r.body.access_token) { save(fromTokens(r.body.access_token, r.body.refresh_token, r.body.expires_in)); paintNav(); emit(); }
      else if (r.ok) r = { ok: false, status: r.status, body: { error_code: 'no_session' } };
      return result(r);
    });
  }
  function setPassword(password) {
    return safe(async function () {
      var s = await session(); if (!s) return { ok: false, status: 401, code: 'no_session', msg: '' };
      return result(await call('/user', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.at }, body: JSON.stringify({ password: password }) }));
    });
  }
  async function signOut() {
    var s = load(); save(null); emit(); paintNav();
    if (s && s.at) { try { await call('/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + s.at } }); } catch (e) { /* i tak lokalnie wylogowany */ } }
  }

  // 2. ikona konta na pasku
  function paintNav() {
    var s = load();
    document.querySelectorAll('.nav-acc').forEach(function (a) {
      a.classList.toggle('is-in', !!s);
      a.setAttribute('href', s ? '/konto.html' : '/zaloguj.html');
      var label = s ? 'Twoje konto' + (s.email ? ': ' + s.email : '') : 'Zaloguj się lub załóż konto';
      a.setAttribute('aria-label', label); a.setAttribute('title', label);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paintNav); else paintNav();
  window.addEventListener('storage', function (e) { if (e.key === KEY) { paintNav(); emit(); } });

  window.QAuth = { api: API, session: session, user: user, signIn: signIn, signUp: signUp, recover: recover, resend: resend,
    codeLogin: codeLogin, sendCode: sendCode, verifyCode: verifyCode, setPassword: setPassword, signOut: signOut, refresh: refresh, current: load,
    lastError: function () { return lastError; }, linkType: function () { return linkType; } };
  window.QAuth.ready = session().then(function () { paintNav(); emit(); });
  // źródło i język przy koncie także dla logowania kodem z maila (tam rejestracja idzie bez metadanych): raz na urządzenie,
  // serwer zapisuje tylko, gdy konto nie ma jeszcze źródła (RPC account_meta, token sesji w treści jak trip_member)
  window.QAuth.ready.then(function () {
    var s = load(), v = null; if (!s || !s.at) return;
    try { v = JSON.parse(localStorage.getItem(SRC) || 'null'); } catch (e) { return; }
    if (!v || !v.s || v.sent === s.sub) return;
    var m = signupMeta();
    fetch('https://api.quolino.com/rest/v1/rpc/account_meta', { method: 'POST', headers: { 'Content-Type': 'application/json',
      apikey: ANON, Authorization: 'Bearer ' + ANON }, body: JSON.stringify({ p_token: s.at, p_src: m.src || null, p_lang: m.lang || null }) })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && !j.error) { v.sent = s.sub; try { localStorage.setItem(SRC, JSON.stringify(v)); } catch (e) { /* prywatne okno */ } } }, function () { /* następnym razem */ });
  });
})();
