/* Quo: Wyprawa — Skarb Quo (ukryta komnata na poziomie Trudnym).
   Gra woła QuoTreasure.claim(trip, poziom) po otwarciu złotej skrzyni. Dziecko nie widzi żadnej odpowiedzi serwera.
   – Zalogowany rodzic na tym urządzeniu (sesja auth.js w localStorage „qc.session”, pole „at”, ważny token):
     POST https://api.quolino.com/rest/v1/rpc/claim_game_treasure {p_trip, p_level, p_token}; apikey i Authorization = klucz anon.
     Kodu z odpowiedzi nigdy nie pokazujemy — sprawdzamy tylko, czy jest {error}.
   – Brak sesji, wygasły token, status ≠ 200 albo {error} inny niż 'level'/'not_found': dopisujemy {trip, at} do „quolino_game_treasure_pending”
     — konto.html odbierze skarb po zalogowaniu.
   – Jeden skarb na wycieczkę na urządzeniu: „quolino_game_treasure” = { <trip>: { at, level } }. */
(function () {
  'use strict';
  var API = 'https://api.quolino.com/rest/v1';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50d3BqY3VwZmZkb3pzdGJpamhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMzc5MTUsImV4cCI6MjEwMjgxMzkxNX0.OddjLt-gKKmj2H7wrEKJ14CXrsXu0L4UBO2GC9OiCGo';
  var FOUND = 'quolino_game_treasure', PENDING = 'quolino_game_treasure_pending', SESSION = 'qc.session';
  var LEVEL = { easy: 'latwy', medium: 'sredni', hard: 'trudny' };

  function read(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* prywatne okno */ } }

  function found(trip) { var f = read(FOUND); return !!(f && f[trip]); }
  function session() {
    var s = read(SESSION);
    return s && s.at && (!s.exp || s.exp > Date.now() + 30000) ? s : null;
  }
  function addPending(trip, at) {
    var list = read(PENDING); if (!Array.isArray(list)) list = [];
    if (!list.some(function (p) { return p && p.trip === trip; })) list.push({ trip: trip, at: at });
    write(PENDING, list);
  }
  function claim(trip, level) {
    if (found(trip)) return false;
    var at = new Date().toISOString(), lv = LEVEL[level] || level;
    var f = read(FOUND) || {}; f[trip] = { at: at, level: lv }; write(FOUND, f);
    var s = session();
    if (!s || typeof fetch !== 'function') { addPending(trip, at); return true; }
    try {
      // Traefik zdejmuje nagłówek Authorization przed PostgREST: w nagłówkach klucz anon, token rodzica w treści (p_token).
      fetch(API + '/rpc/claim_game_treasure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + ANON },
        body: JSON.stringify({ p_trip: trip, p_level: lv, p_token: s.at })
      }).then(function (r) {
        if (r.status !== 200) { addPending(trip, at); return; }
        return r.json().then(function (b) {
          // {code} = odebrany; {error}: 'level' / 'not_found' nie da się poprawić — reszta (sesja, termin, limit) czeka na konto.html
          if (b && b.error && b.error !== 'level' && b.error !== 'not_found') addPending(trip, at);
        }, function () { addPending(trip, at); });
      }, function () { addPending(trip, at); });
    } catch (e) { addPending(trip, at); }
    return true;
  }
  window.QuoTreasure = { found: found, claim: claim };
})();
