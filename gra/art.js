/* Quo: Wyprawa — grafiki z gra/art/manifest.json (bin/game-art.mjs, akceptacja JP 2026-10-31).
   Czyste funkcje bez DOM: odczyt manifestu (tylko znane pola, tylko bezpieczne ścieżki w gra/art/), wybór klatki biegu i skoku,
   wybór rozmiaru pliku. Brak manifestu albo zły wpis = pusta paczka → gra rysuje jak dawniej (kodem i pozami z media/icons).
   Działa w przeglądarce (window.QuoArt) i w Node (testy: _content/claude-skills/bin/game-art.test.mjs). */
(function (root) {
  'use strict';
  var PATH = /^[a-z0-9][a-z0-9-]{0,40}\/[a-z0-9][a-z0-9.-]{0,60}\.webp$/;
  var NAME = /^[a-z0-9][a-z0-9-]{0,40}$/;
  function num(x, lo, hi) { return typeof x === 'number' && isFinite(x) && x >= lo && x <= hi; }
  function srcMap(o) { // { "256": "quo-run/run-256.webp", … } → { 256: path } (tylko poprawne)
    var out = {}, n = 0;
    if (!o || typeof o !== 'object') return null;
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k) && /^\d{2,4}$/.test(k) && typeof o[k] === 'string' && PATH.test(o[k])) { out[+k] = o[k]; n++; }
    return n ? out : null;
  }
  function pick(map, want) { // najmniejszy plik ≥ want, inaczej największy
    if (!map) return null;
    var ks = Object.keys(map).map(Number).sort(function (a, b) { return a - b; }), best = null;
    for (var i = 0; i < ks.length; i++) { best = ks[i]; if (ks[i] >= want) break; }
    return best == null ? null : map[best];
  }
  function frames(e) {
    var n = e.frames;
    if (!num(n, 1, 32) || n !== Math.round(n) || !num(e.fw, 16, 2048) || !num(e.fh, 16, 2048)) return null;
    var src = srcMap(e.src); if (!src) return null;
    var a = Array.isArray(e.anchor) && num(e.anchor[0], 0, e.fw) && num(e.anchor[1], 0, e.fh) ? [e.anchor[0], e.anchor[1]] : [e.fw / 2, Math.round(e.fh * .92)];
    var heads = [];
    for (var i = 0; i < n; i++) { var h = e.heads && e.heads[i]; heads.push(Array.isArray(h) && num(h[0], 0, e.fw) && num(h[1], 0, e.fh) ? [h[0], h[1]] : null); }
    var names = Array.isArray(e.names) ? e.names.slice(0, n).map(function (s) { return typeof s === 'string' ? s : ''; }) : [];
    return { frames: n, cols: num(e.cols, 1, 32) ? e.cols : n, fw: e.fw, fh: e.fh, anchor: a, quoH: num(e.quoH, 8, 2048) ? e.quoH : e.fh * .6, heads: heads, names: names, src: src, v: e.v || 1 };
  }
  function terrains(t) { return Array.isArray(t) ? t.filter(function (x) { return typeof x === 'string' && NAME.test(x); }) : []; }
  var TILE_ITEMS = ['top', 'mid', 'left', 'right', 'float', 'crumble'];
  function parse(M) {
    var A = { run: null, jump: null, sheets: {}, pz: {}, accRun: {}, pano: {}, tiles: {}, props: {}, any: false, ver: '' };
    var P = M && typeof M === 'object' && M.packs && typeof M.packs === 'object' ? M.packs : null;
    if (!P) return A;
    A.ver = typeof M.updated_at === 'string' ? M.updated_at.replace(/[^0-9TZ]/g, '').slice(0, 20) : ''; // do adresów plików: po nowej akceptacji przeglądarka nie bierze starej kopii
    for (var k in P) {
      if (!Object.prototype.hasOwnProperty.call(P, k) || !NAME.test(k)) continue;
      var e = P[k]; if (!e || typeof e !== 'object') continue;
      if (e.kind === 'frames' && (e.role === 'run' || e.role === 'jump')) { var f = frames(e); if (f) { A[e.role] = f; A.any = true; } }
      if (e.kind === 'frames' && NAME.test(e.role || '') && e.role !== 'run' && e.role !== 'jump') { // pozy v2 (JP 2026-11-03): każda klatka po nazwie
        var fz = frames(e);
        if (fz && fz.names.length) {
          A.sheets[k] = fz; A.any = true;
          var mr = /^acc-([a-z]+)-run$/.exec(e.role), ma = /^acc-([a-z]+)$/.exec(e.role);   // akcesoria: „latarka:idle_1”, bieg z latarką osobno
          if (mr) A.accRun[mr[1]] = k;
          else fz.names.forEach(function (nm, i) { if (nm && NAME.test(nm.replace(/_/g, '-'))) A.pz[(e.role === 'walk' ? 'walk:' : ma ? ma[1] + ':' : '') + nm] = { p: k, i: i }; });
        }
      }
      else if (e.kind === 'panorama' && NAME.test(e.place || '')) {
        var s = srcMap(e.src);
        if (s && num(e.w, 64, 8192) && num(e.h, 32, 8192)) { A.pano[e.place] = { src: s, w: e.w, h: e.h, ground: num(e.ground, .3, 1) ? e.ground : .86, terrains: terrains(e.terrains) }; A.any = true; }
      } else if (e.kind === 'tiles' && NAME.test(e.set || '') && e.tiles && typeof e.tiles === 'object') {
        var T = {}, ok = 0;
        for (var i = 0; i < TILE_ITEMS.length; i++) { var m = srcMap(e.tiles[TILE_ITEMS[i]]); if (m) { T[TILE_ITEMS[i]] = m; ok++; } }
        if (T.top && T.mid) { A.tiles[e.set] = { tiles: T, terrains: terrains(e.terrains) }; A.any = true; } // bez wierzchu i środka zestaw nic nie daje
      } else if (e.kind === 'props' && e.props && typeof e.props === 'object') {
        for (var p in e.props) if (Object.prototype.hasOwnProperty.call(e.props, p) && NAME.test(p)) { var pm = srcMap(e.props[p]); if (pm) { A.props[p] = pm; A.any = true; } }
      }
    }
    return A;
  }
  function tileSetFor(A, terrain) { // zestaw kafli dla terenu (pierwszy pasujący)
    if (!A || !A.tiles) return null;
    for (var k in A.tiles) if (A.tiles[k].terrains.indexOf(terrain) >= 0) return k;
    return null;
  }
  function panoFor(A, terrain) {
    if (!A || !A.pano) return null;
    for (var k in A.pano) if (A.pano[k].terrains.indexOf(terrain) >= 0) return k;
    return null;
  }
  function runFrame(phase, n) { // P.phase rośnie z prędkością (dt·|vx|/13): pełny cykl 2π = n klatek, szybciej biegnie — szybciej przebiera łapkami
    if (!(n > 0)) return 0;
    var i = Math.floor((phase || 0) / (Math.PI * 2) * n) % n;
    return i < 0 ? i + n : i;
  }
  function jumpFrame(kind, vy, names) { // takeoff/apex/fall/land z nazw klatek; bez nazw: kolejno 0..3
    var want = kind === 'land' ? 'land' : vy < -180 ? 'takeoff' : vy > 180 ? 'fall' : 'apex';
    var i = names ? names.indexOf(want) : -1;
    if (i >= 0) return i;
    return { takeoff: 0, apex: 1, fall: 2, land: 3 }[want];
  }
  function tileFor(top, left, right) { // który kafel: wierzch z krawędzią, wierzch, środek
    if (!top) return 'mid';
    if (left && !right) return 'left';
    if (right && !left) return 'right';
    return 'top';
  }
  var api = { parse: parse, pick: pick, runFrame: runFrame, jumpFrame: jumpFrame, tileFor: tileFor, tileSetFor: tileSetFor, panoFor: panoFor, PATH: PATH };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.QuoArt = api;
})(typeof window !== 'undefined' ? window : this);
