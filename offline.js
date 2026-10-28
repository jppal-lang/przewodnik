/* =====================================================================
   QUOLINO — offline.js (JP 2026-10-28, A1 + A3)
   1. Rejestruje service worker /sw.js (zakres /). Po przejęciu strony prosi go o zapis plików, które
      przeglądarka pobrała, zanim SW zaczął działać (pierwsze wejście), oraz bieżącej strony.
   2. window.QOffline — zapis ostatnio otwartej wersji trasy w telefonie (IndexedDB „quolino-offline”,
      magazyn „trips”), bo odpowiedzi RPC (POST) nie trafiają do Cache API:
        QOffline.save(klucz, dane) · QOffline.load(klucz) → Promise(dane | null) · QOffline.cacheUrls([adresy])
   Bez ciasteczek, bez banerów instalacji (zasada: zero pop-upów). Podgląd szkicu i panel admina — bez SW.
   ===================================================================== */
(function () {
  'use strict';
  var DB = 'quolino-offline', STORE = 'trips', MAX_TRIPS = 12;
  var SKIP = /[?&]draft=/.test(location.search) || /^\/_admin\b/.test(location.pathname);
  var hasSW = 'serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname));

  // ── IndexedDB ──
  var dbP = null;
  function open() {
    if (dbP) return dbP;
    dbP = new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('brak IndexedDB'));
      var r;
      try { r = indexedDB.open(DB, 1); } catch (e) { return rej(e); }
      r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
      r.onblocked = function () { rej(new Error('blocked')); };
    });
    dbP.catch(function () { dbP = null; });
    return dbP;
  }
  function tx(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(STORE, mode), st = t.objectStore(STORE), out = fn(st);
        t.oncomplete = function () { res(out && 'result' in out ? out.result : undefined); };
        t.onerror = t.onabort = function () { rej(t.error); };
      });
    });
  }
  function load(key) {
    return tx('readonly', function (st) { return st.get(key); }).then(function (v) { return v || null; }, function () { return null; });
  }
  function save(key, data) {
    var rec = { t: Date.now(), d: data };
    return tx('readwrite', function (st) { st.put(rec, key); })
      .then(prune)
      .catch(function (e) { console.warn('[offline] zapis trasy:', e && e.message); });
  }
  // najwyżej MAX_TRIPS ostatnich zapisów (każdy język i widok osobno)
  function prune() {
    return tx('readonly', function (st) { return st.getAllKeys ? st.getAllKeys() : null; }).then(function (keys) {
      if (!keys || keys.length <= MAX_TRIPS) return;
      return Promise.all(keys.map(function (k) { return load(k).then(function (v) { return { k: k, t: v ? v.t : 0 }; }); }))
        .then(function (all) {
          all.sort(function (a, b) { return a.t - b.t; });
          var drop = all.slice(0, all.length - MAX_TRIPS);
          return tx('readwrite', function (st) { drop.forEach(function (x) { st.delete(x.k); }); });
        });
    }).catch(function () {});
  }

  // ── Service worker ──
  var regP = null;
  function worker() {
    if (!hasSW || SKIP) return Promise.resolve(null);
    if (!regP) regP = navigator.serviceWorker.ready.then(function (reg) { return reg.active || null; }).catch(function () { return null; });
    return regP;
  }
  function cacheUrls(urls) {
    var list = (urls || []).filter(function (u, i, a) { return u && a.indexOf(u) === i && !/^(data|blob):/.test(u); });
    if (!list.length) return Promise.resolve();
    return worker().then(function (w) { if (w) w.postMessage({ type: 'cache', urls: list }); });
  }
  function selfCache() {
    var urls = [location.href];
    try {
      (performance.getEntriesByType('resource') || []).forEach(function (e) {
        if (e.initiatorType === 'fetch' || e.initiatorType === 'xmlhttprequest' || e.initiatorType === 'beacon') return;
        urls.push(e.name);
      });
    } catch (e) {}
    cacheUrls(urls);
  }
  if (hasSW && !SKIP) {
    var reg = function () {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(function () {
        // przy pierwszym wejściu pliki strony przyszły z sieci przed SW — dopisujemy je do pamięci
        setTimeout(selfCache, 1500);
      }).catch(function (e) { console.warn('[offline] SW:', e && e.message); });
    };
    if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg);
  }

  window.QOffline = { save: save, load: load, cacheUrls: cacheUrls, enabled: !SKIP };
})();
