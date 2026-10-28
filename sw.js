/* =====================================================================
   QUOLINO — service worker (JP 2026-10-28, A1 „trasa bez zasięgu”)
   Zakres: cała strona (/). Zero ciasteczek, zero trackingu.
   - HTML, JS, CSS, manifest: najpierw sieć (świeża wersja po wdrożeniu), z pamięci tylko bez sieci
     albo gdy sieć nie odpowiada 6 s i mamy zapisaną kopię.
   - Zdjęcia i ikony (/media/…, flagi, czcionki): najpierw z pamięci, w tle odświeżane z sieci.
   - API (api.quolino.com) NIE przechodzi przez SW: odpowiedzi RPC (POST) zapisuje strona w IndexedDB (offline.js).
   - Strona może poprosić o zapis listy adresów: postMessage({type:'cache', urls:[…]}) — tak trafiają do pamięci
     pliki pobrane przy pierwszym wejściu (zanim SW przejął stronę) i zdjęcia przystanków, których jeszcze nie widać.
   Nowe wydanie, które zmienia zasady zapisu: podbij V (stare pamięci znikają przy aktywacji).
   ===================================================================== */
'use strict';
var V = 'v1';
var STATIC = 'quolino-static-' + V;
var IMG = 'quolino-img-' + V;
var IMG_MAX = 500;                 // najwięcej zdjęć w pamięci (najstarsze wylatują)
var NET_TIMEOUT = 6000;            // słaby zasięg: po tylu ms bierzemy kopię, jeśli jest
var CDN = ['fonts.googleapis.com', 'fonts.gstatic.com', 'flagcdn.com'];

self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return /^quolino-/.test(k) && k !== STATIC && k !== IMG; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// ── co z czym robimy ──
function kind(url, req) {
  if (url.origin === self.location.origin) {
    var p = url.pathname;
    if (/^\/(_admin|auth-mail)\b/.test(p) || /[?&]draft=/.test(url.search)) return null;   // panel, podgląd szkicu
    if (p === '/sw.js') return null;
    if (req && req.mode === 'navigate') return 'page';
    if (/\.(html?)$/.test(p) || /\/$/.test(p)) return 'page';
    if (/\.(js|mjs|css|json|webmanifest)$/.test(p)) return 'static';
    if (/\.(webp|png|jpe?g|gif|svg|ico|avif|woff2?)$/.test(p)) return 'img';
    return null;                                                                            // film, inne
  }
  if (CDN.indexOf(url.hostname) > -1) return url.hostname === 'fonts.googleapis.com' ? 'static' : 'img';
  return null;
}
// strona: jeden wpis na ścieżkę (zapytanie ?c=/?view=/?kt= czyta skrypt strony, HTML jest ten sam; token nie trafia do pamięci)
function pageKey(url) { return url.origin + url.pathname; }

function putSafe(cacheName, key, res) {
  if (!res || res.redirected || !(res.ok || res.type === 'opaque')) return Promise.resolve();
  return caches.open(cacheName).then(function (c) {
    return c.put(key, res).then(function () { if (cacheName === IMG) return trim(c); });
  }).catch(function () { /* brak miejsca — trudno */ });
}
function trim(c) {
  return c.keys().then(function (keys) {
    var extra = keys.length - IMG_MAX;
    return extra > 0 ? Promise.all(keys.slice(0, extra).map(function (k) { return c.delete(k); })) : null;
  });
}
function fromCache(cacheName, key, loose) {
  return caches.open(cacheName).then(function (c) {
    return c.match(key).then(function (r) { return r || (loose ? c.match(key, { ignoreSearch: true }) : null); });
  });
}

// najpierw sieć; bez sieci albo przy zawieszonej sieci — kopia
function networkFirst(req, cacheName, key, loose) {
  return new Promise(function (resolve, reject) {
    var settled = false, timer = null;
    function done(r) { if (!settled && r) { settled = true; clearTimeout(timer); resolve(r); } }
    var cached = fromCache(cacheName, key, loose).catch(function () { return null; });
    timer = setTimeout(function () { cached.then(done); }, NET_TIMEOUT);
    fetch(req).then(function (res) {
      if ((res.ok || res.type === 'opaque') && !res.redirected) putSafe(cacheName, key, res.clone());
      // błąd serwera (5xx) przy dobrej kopii → kopia; 404 i przekierowania przekazujemy bez zmian
      if (res.status >= 500) return cached.then(function (c) { done(c || res); });
      done(res);
    }).catch(function (err) {
      cached.then(function (c) {
        if (c) done(c);
        else if (!settled) { settled = true; clearTimeout(timer); reject(err); }
      });
    });
  });
}

// najpierw pamięć, w tle odświeżenie
function cacheFirst(req, key) {
  return fromCache(IMG, key, false).then(function (c) {
    var net = fetch(req).then(function (res) { putSafe(IMG, key, res.clone()); return res; });
    if (c) { net.catch(function () {}); return c; }
    return net;
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  if (req.headers.get('range')) return;
  var url = new URL(req.url), k = kind(url, req);
  if (!k) return;
  if (k === 'page') e.respondWith(networkFirst(req, STATIC, pageKey(url), false));
  else if (k === 'static') e.respondWith(networkFirst(req, STATIC, req.url, true));
  else e.respondWith(cacheFirst(req, req.url));
});

// strona prosi o zapis adresów (pierwsze wejście, zdjęcia przystanków)
self.addEventListener('message', function (e) {
  var d = e.data || {};
  if (d.type !== 'cache' || !Array.isArray(d.urls)) return;
  var list = d.urls.slice(0, 300);
  e.waitUntil(Promise.all(list.map(function (u) {
    var url;
    try { url = new URL(u, self.location.origin); } catch (x) { return null; }
    var k = kind(url, null);
    if (!k) return null;
    var name = k === 'img' ? IMG : STATIC, key = k === 'page' ? pageKey(url) : url.href;
    return caches.open(name).then(function (c) { return c.match(key); }).then(function (hit) {
      if (hit && k === 'img') return null;                       // zdjęcie już jest
      var cross = url.origin !== self.location.origin;
      return fetch(url.href, cross ? { mode: 'no-cors', credentials: 'omit' } : { credentials: 'same-origin' })
        .then(function (res) { return putSafe(name, key, res); });
    }).catch(function () { return null; });
  })));
});
