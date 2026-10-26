/* =====================================================================
   Quo: Wyprawa — demo gry platformowej (Frasassi)
   Czysty JS, canvas, zero bibliotek. Poziom budowany automatycznie
   z danych wycieczki (gra/frasassi.json): przystanki = kolejne sekcje.

   Spis treści
   1. Stałe i narzędzia
   2. Pamięć (localStorage, tylko prefiks quolino_game_) + postęp z wycieczki
   3. Quo — szkielet „cut-out” (części, punkty obrotu, pozy, tańce)
   4. Tereny i tła (rysowane proceduralnie, wspólne dla wszystkich wycieczek)
   5. Budowa poziomu z danych wycieczki
   6. Fizyka, gracz, przeciwnicy
   7. Rysowanie świata
   8. Świętowanie przystanku (naklejka)
   9. Interfejs (HUD, quiz, ekrany)
   10. Sterowanie
   11. Dźwięk (WebAudio, domyślnie wyłączony)
   12. Pętla gry i start
   ===================================================================== */
(function () {
  'use strict';

  /* ---------- 1. Stałe i narzędzia ---------- */
  var TILE = 32, ROWS = 14, GROUND = 11, SEC = 104;
  var DT = 1 / 60;
  var G = 1900, JUMP_V = 660, RUN = 200, MAX_FALL = 900, SPRING_V = 1010;
  var BASE_HEARTS = 3, MAX_HEARTS = 12;
  var ICONS = '../media/icons/';
  var LS = 'quolino_game_';
  var DATA_URL = 'frasassi.json';
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var TERRAIN_BY_CATEGORY = {
    parking: 'valley', 'viewpoint-nature': 'valley', photo: 'valley',
    cave: 'cave', grotto: 'cave',
    church: 'stone', castle: 'stone', house: 'stone', street: 'stone', museum: 'stone',
    synagogue: 'stone', restaurant: 'stone', icecream: 'stone', sweets: 'stone',
    monument: 'cliff', 'viewpoint-city': 'cliff', viewpoint: 'cliff'
  };
  var POWER = {
    magnet: { name: 'Magnes na kamyczki', icon: '🧲' },
    lantern: { name: 'Latarka', icon: '🔦' },
    doublejump: { name: 'Podwójny skok', icon: '⤴' },
    glide: { name: 'Szybowanie — trzymaj skok', icon: '🍃' }
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function $(id) { return document.getElementById(id); }
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; }; }
  function pick(R, arr) { return arr[Math.floor(R() * arr.length)]; }
  function ease(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 3); }

  /* ---------- 2. Pamięć i postęp ---------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* prywatne okno */ } }
  function lsJSON(k) { try { return JSON.parse(lsGet(k) || 'null'); } catch (e) { return null; } }

  /* Mapowanie punktów z wycieczki na grę:
     każda zaliczona misja = +1 serduszko, zadanie foto = moc w sekcji tego przystanku,
     wszystkie zadania przystanku = tajny skrót (trampolina + górna kładka z kryjówką). */
  function readProgress(trip, demo) {
    var legacy = lsJSON(trip.progress.legacyKey) || {};
    var P = { missions: 0, missionsTotal: 0, photos: 0, photosTotal: 0, full: 0, stops: [], found: false };
    trip.stops.forEach(function (s) {
      var m = 0, ph = false;
      for (var i = 0; i < s.missions; i++) if (legacy[s.key + '-misja-' + i]) m++;
      if (legacy[s.key + '-foto']) ph = true;
      if (s.qcKey) {
        if (lsGet('qc.task.' + s.qcKey + '-mission') === '1') m = s.missions;
        if (lsGet('qc.task.' + s.qcKey + '-photo') === '1') ph = true;
      }
      if (m || ph) P.found = true;
      if (demo) { m = s.missions; ph = !!s.photo; }
      var all = m === s.missions && (ph || !s.photo);
      P.missions += m; P.missionsTotal += s.missions;
      if (s.photo) P.photosTotal++;
      if (ph) P.photos++;
      if (all) P.full++;
      P.stops.push({ missions: m, photo: ph, all: all });
    });
    return P;
  }

  /* ---------- 3. Quo — szkielet cut-out ----------
     Każda część to osobny przezroczysty obrazek. Dziś rysujemy je w canvasie
     (drawPart), docelowo wystarczy wpisać `src` (PNG/WebP) w QUO_RIG.parts.
     Jednostki: 1 j. = 1 px świata przy skali 1; Quo ma ok. 66 j. wysokości (z uszami).
     Początek układu (0,0) = punkt między stopami na ziemi, Quo patrzy w PRAWO.
       ax, ay — gdzie w szkielecie leży punkt obrotu części (staw)
       w, h   — rozmiar obrazka części w jednostkach (plik = w*res × h*res px)
       px, py — gdzie w obrazku jest punkt obrotu (w jednostkach od lewego-górnego rogu)
       parent — 'body' = część rusza się razem z tułowiem (głowa, ręce, ogon)
     Kąt 0 = część w pozycji spoczynkowej jak na rysunku (ręce i nogi zwisają w dół). */
  var QUO_RIG = {
    res: 6,
    parts: {
      tail:      { parent: 'body', ax: -8, ay: -15, w: 46, h: 56, px: 38, py: 46, src: null },
      legBack:   { parent: null,   ax: -4, ay: -11, w: 16, h: 18, px: 6,  py: 4,  src: null },
      armBack:   { parent: 'body', ax: -5, ay: -27, w: 14, h: 22, px: 7,  py: 4,  src: null },
      body:      { parent: null,   ax: 0,  ay: -11, w: 32, h: 34, px: 16, py: 28, src: null },
      legFront:  { parent: null,   ax: 4,  ay: -11, w: 16, h: 18, px: 6,  py: 4,  src: null },
      head:      { parent: 'body', ax: 1,  ay: -32, w: 46, h: 44, px: 20, py: 36, src: null },
      headBlink: { parent: 'body', ax: 1,  ay: -32, w: 46, h: 44, px: 20, py: 36, src: null },
      armFront:  { parent: 'body', ax: 5,  ay: -27, w: 14, h: 22, px: 7,  py: 4,  src: null }
    },
    order: ['tail', 'legBack', 'armBack', 'body', 'legFront', 'head', 'armFront']
  };
  var QC = { fur: '#E9A048', furLt: '#F6BE6E', furDk: '#C27A2C', back: '#B56E27', belly: '#FDE7C2', ear: '#F3A3A0',
    line: '#5E3214', eye: '#22140C', nose: '#7A3B2E', band: '#D9502A', bandDk: '#A5381B', blush: 'rgba(240,110,100,.45)' };

  function ell(c, x, y, rx, ry, g) { c.moveTo(x + rx + g, y); c.ellipse(x, y, rx + g, ry + g, 0, 0, Math.PI * 2); }
  function cap(c, x1, y1, x2, y2, r, g) { // kapsuła (kończyna)
    var a = Math.atan2(y2 - y1, x2 - x1), R = r + g;
    c.moveTo(x1 + Math.cos(a + Math.PI / 2) * R, y1 + Math.sin(a + Math.PI / 2) * R);
    c.arc(x1, y1, R, a + Math.PI / 2, a - Math.PI / 2);
    c.arc(x2, y2, R, a - Math.PI / 2, a + Math.PI / 2);
    c.closePath();
  }
  function outlined(c, shapes, fill, lw) {
    c.fillStyle = QC.line; c.beginPath(); shapes(c, lw == null ? 1.3 : lw); c.fill();
    c.fillStyle = fill; c.beginPath(); shapes(c, 0); c.fill();
  }

  var PART_DRAW = {
    body: function (c) {
      var gr = c.createRadialGradient(4, -16, 2, 0, -10, 16); gr.addColorStop(0, QC.furLt); gr.addColorStop(.6, QC.fur); gr.addColorStop(1, QC.furDk);
      outlined(c, function (c, g) { ell(c, 0, -10, 11.5, 13.5, g); }, gr);
      c.fillStyle = QC.belly; c.beginPath(); ell(c, 3.2, -7.5, 7, 9.5, 0); c.fill();
      // chustka
      outlined(c, function (c, g) {
        c.moveTo(-9 - g, -22 - g); c.lineTo(11 + g, -22 - g); c.lineTo(12 + g, -17 + g); c.lineTo(-10 - g, -17 + g); c.closePath();
        c.moveTo(1 - g, -19); c.lineTo(11 + g, -19); c.lineTo(5.5, -9 + g * 1.6); c.closePath();
      }, QC.band, 1.1);
      c.fillStyle = QC.bandDk; c.beginPath(); c.moveTo(3, -18); c.lineTo(8.5, -18); c.lineTo(5.6, -12.5); c.closePath(); c.fill();
    },
    head: function (c) { drawHead(c, false); },
    headBlink: function (c) { drawHead(c, true); },
    armFront: function (c) { drawLimb(c, QC.fur, 11, 2.9, true); },
    armBack: function (c) { drawLimb(c, QC.back, 11, 2.9, true); },
    legFront: function (c) { drawLeg(c, QC.fur); },
    legBack: function (c) { drawLeg(c, QC.back); },
    tail: function (c) {
      var pts = [];
      for (var i = 0; i <= 14; i++) {
        var t = i / 14, u = 1 - t;
        pts.push([u * u * 0 + 2 * u * t * -30 + t * t * -24, u * u * 0 + 2 * u * t * 8 + t * t * -30, 4 + t * 8.5 - t * t * 2.5]);
      }
      outlined(c, function (c, g) { pts.forEach(function (p) { ell(c, p[0], p[1], p[2], p[2], g); }); }, QC.furDk);
      c.fillStyle = QC.fur; c.beginPath(); pts.forEach(function (p) { ell(c, p[0] + 1, p[1] - 1, p[2] * .72, p[2] * .72, 0); }); c.fill();
      c.fillStyle = QC.furLt; c.beginPath(); pts.forEach(function (p, i) { if (i > 5) ell(c, p[0] + 2, p[1] - 2, p[2] * .32, p[2] * .32, 0); }); c.fill();
    }
  };
  function drawLimb(c, col, len, r) {
    outlined(c, function (c, g) { cap(c, 0, 0, 0, len, r, g); ell(c, .8, len + 1, 3.4, 3.1, g); }, col);
    c.fillStyle = QC.belly; c.beginPath(); ell(c, 1, len + 1.5, 2.2, 1.9, 0); c.fill();
  }
  function drawLeg(c, col) {
    outlined(c, function (c, g) { cap(c, 0, 0, 0, 7, 3.6, g); ell(c, 2.4, 9, 5.2, 2.7, g); }, col);
    c.fillStyle = QC.belly; c.beginPath(); ell(c, 3.4, 9.3, 3.4, 1.5, 0); c.fill();
  }
  function drawHead(c, blink) {
    var gr = c.createRadialGradient(6, -20, 2, 2, -13, 18); gr.addColorStop(0, QC.furLt); gr.addColorStop(.55, QC.fur); gr.addColorStop(1, QC.furDk);
    // uszy
    outlined(c, function (c, g) { ell(c, -7, -24, 6, 6.6, g); }, QC.furDk);
    c.fillStyle = QC.ear; c.beginPath(); ell(c, -6.4, -23.6, 3.4, 4, 0); c.fill();
    outlined(c, function (c, g) { ell(c, 7, -25.5, 6.4, 7, g); }, QC.fur);
    c.fillStyle = QC.ear; c.beginPath(); ell(c, 7.4, -25, 3.8, 4.4, 0); c.fill();
    // głowa
    outlined(c, function (c, g) { ell(c, 2, -13, 14.5, 12.8, g); }, gr);
    // grzywka
    c.fillStyle = QC.furLt; c.beginPath(); c.moveTo(-2, -25); c.quadraticCurveTo(3, -31, 5, -24.5); c.quadraticCurveTo(8, -29, 9, -23.5); c.closePath(); c.fill();
    // pyszczek
    c.fillStyle = QC.belly; c.beginPath(); ell(c, 9.5, -6.5, 8.6, 5.8, 0); ell(c, 15, -10, 3.6, 3.6, 0); c.fill();
    // rumieńce
    c.fillStyle = QC.blush; c.beginPath(); ell(c, -2, -7.5, 3, 2, 0); ell(c, 16.6, -8.5, 1.8, 1.6, 0); c.fill();
    // oczy
    if (blink) {
      c.strokeStyle = QC.eye; c.lineWidth = 1.5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(0.5, -14); c.quadraticCurveTo(3.3, -11.8, 6.1, -14); c.moveTo(9, -14); c.quadraticCurveTo(11.6, -11.8, 14.2, -14); c.stroke();
    } else {
      [[3.3, -14.2, 3.5, 4.4], [11.6, -14.2, 3.1, 4.1]].forEach(function (e) {
        c.fillStyle = '#fff'; c.beginPath(); ell(c, e[0], e[1], e[2], e[3], 0); c.fill();
        c.fillStyle = QC.eye; c.beginPath(); ell(c, e[0] + .7, e[1] + .3, e[2] * .8, e[3] * .84, 0); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); ell(c, e[0] + 1.6, e[1] - 1.4, 1.1, 1.2, 0); ell(c, e[0] - .2, e[1] + 1.5, .5, .5, 0); c.fill();
      });
    }
    // nos i uśmiech
    c.fillStyle = QC.nose; c.beginPath(); ell(c, 16.6, -9.6, 2.4, 1.8, 0); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); ell(c, 16.1, -10.2, .7, .5, 0); c.fill();
    c.fillStyle = '#7A2E22'; c.beginPath(); c.moveTo(9.5, -5.4); c.quadraticCurveTo(12.5, -0.6, 15.5, -5.6); c.quadraticCurveTo(12.5, -4.2, 9.5, -5.4); c.fill();
    c.fillStyle = '#F07A72'; c.beginPath(); ell(c, 12.6, -3.2, 1.8, 1, 0); c.fill();
  }

  var rigImg = {};
  function buildRig(done) {
    var names = Object.keys(QUO_RIG.parts), left = names.length;
    names.forEach(function (n) {
      var p = QUO_RIG.parts[n], cv = document.createElement('canvas');
      cv.width = Math.ceil(p.w * QUO_RIG.res); cv.height = Math.ceil(p.h * QUO_RIG.res);
      var c = cv.getContext('2d');
      function procedural() { c.setTransform(QUO_RIG.res, 0, 0, QUO_RIG.res, p.px * QUO_RIG.res, p.py * QUO_RIG.res); PART_DRAW[n](c); }
      if (p.src) {
        var im = new Image();
        im.onload = function () { c.drawImage(im, 0, 0, cv.width, cv.height); if (!--left) done(); };
        im.onerror = function () { procedural(); if (!--left) done(); };
        im.src = p.src;
      } else { procedural(); left--; }
      rigImg[n] = cv;
    });
    if (!left) done();
  }

  var Z = { a: 0, dx: 0, dy: 0 };
  function quoPose(kind, t, o) {
    o = o || {};
    var s = Math.sin, P = { root: { dx: 0, dy: 0, sx: 1, sy: 1, a: 0 }, body: { a: 0, dx: 0, dy: 0 }, head: { a: 0 }, tail: { a: 0 },
      armFront: { a: 0.15 }, armBack: { a: -0.1 }, legFront: { a: 0 }, legBack: { a: 0 }, blink: (t % 3.7) < 0.13, flip: false };
    var b;
    switch (kind) {
      case 'idle':
        P.body.dy = s(t * 2.4) * .6; P.head.a = s(t * 1.2) * .05; P.tail.a = s(t * 1.8) * .14; P.armFront.a = .15 + s(t * 2.4) * .05; break;
      case 'walk':
        b = o.phase || 0;
        P.legFront.a = s(b) * .8; P.legBack.a = -s(b) * .8; P.armFront.a = -s(b) * .75; P.armBack.a = s(b) * .75;
        P.body.dy = -Math.abs(s(b)) * 1.8; P.body.a = .07; P.head.a = -.04 + s(b * 2) * .03; P.tail.a = s(b) * .2 + .1; break;
      case 'jump':
        P.legFront.a = -.8; P.legBack.a = .55; P.armFront.a = -2.0; P.armBack.a = 2.3; P.root.sx = .93; P.root.sy = 1.08; P.tail.a = .35; P.head.a = -.08; P.blink = false; break;
      case 'fall':
        P.legFront.a = .3; P.legBack.a = -.35; P.armFront.a = -1.7; P.armBack.a = -1.25; P.tail.a = -.35; P.head.a = .06; break;
      case 'glide':
        P.legFront.a = .5; P.legBack.a = -.2; P.armFront.a = -1.55 + s(t * 14) * .12; P.armBack.a = -1.6 - s(t * 14) * .12; P.tail.a = -.7; P.body.a = .18; break;
      case 'hurt':
        P.body.a = -.28; P.head.a = -.2; P.armFront.a = -1.3; P.armBack.a = -1.7; P.legFront.a = .45; P.legBack.a = -.2; P.blink = true; break;
      case 'nap':
        P.root.a = -1.45; P.root.dy = -6; P.blink = true; P.tail.a = .4; P.armFront.a = .2; break;
      case 'cheer':
        P.armFront.a = -1.75; P.armBack.a = 2.45; P.legFront.a = -.25; P.legBack.a = .2; P.tail.a = .3; P.head.a = -.06; P.blink = false; break;
      case 'dance0': // machanie łapkami, krok w bok
        b = t * Math.PI * 2 * 1.6;
        P.root.dx = s(b / 2) * 5; P.root.dy = -Math.abs(s(b)) * 3;
        P.armFront.a = -1.45 + s(b * 2) * .55; P.armBack.a = 2.35 + s(b * 2) * .35;
        P.legFront.a = s(b) * .45; P.legBack.a = -s(b) * .45; P.tail.a = s(b) * .4; P.head.a = s(b) * .12; P.body.a = s(b / 2) * .09; break;
      case 'dance1': // podskok z obrotem
        b = t * Math.PI * 2 * 1.25;
        P.root.dy = -Math.abs(s(b)) * 14; P.flip = s(b / 2) < 0;
        P.root.sx = .9 + .1 * Math.abs(Math.cos(b)); P.root.sy = 1 + .06 * Math.abs(s(b));
        P.armFront.a = -1.5 - s(b) * .3; P.armBack.a = 1.9 + s(b) * .4; P.legFront.a = -.55 * Math.abs(s(b)); P.legBack.a = .4 * Math.abs(s(b)); P.tail.a = .25 + s(b * 2) * .25; break;
      case 'dance2': // ogon-wiatrak i tupanie
        b = t * 9;
        P.tail.a = s(b) * .95; P.head.a = s(b) * .14; P.body.dy = -Math.abs(s(b)) * 2.4; P.body.a = s(b) * .06;
        P.armFront.a = .75 + s(b) * .2; P.armBack.a = .65 - s(b) * .2; P.legFront.a = s(b) > 0 ? -.55 * s(b) : 0; P.legBack.a = s(b) < 0 ? .45 * s(b) : 0; break;
      case 'dance3': // disco
        b = t * Math.PI * 2 * 1.1;
        P.armFront.a = -1.0 - s(b) * .8; P.armBack.a = 1.3 + s(b) * 1.1; P.body.a = s(b) * .16; P.root.dx = s(b) * 4;
        P.legFront.a = -Math.max(0, s(b)) * .6; P.legBack.a = Math.max(0, -s(b)) * .5; P.head.a = s(b) * .13; P.tail.a = -s(b) * .45; break;
    }
    if (o.land) { P.root.sx *= 1 + .16 * o.land; P.root.sy *= 1 - .14 * o.land; }
    return P;
  }

  function drawQuo(c, x, y, scale, facing, pose, alpha) {
    var R = QUO_RIG, parts = R.parts, bp = pose.body || Z, f = facing * (pose.flip ? -1 : 1);
    c.save();
    if (alpha != null) c.globalAlpha = alpha;
    c.translate(x + pose.root.dx * scale * facing, y + pose.root.dy * scale);
    c.rotate(pose.root.a * facing);
    c.scale(scale * f * pose.root.sx, scale * pose.root.sy);
    for (var i = 0; i < R.order.length; i++) {
      var name = R.order[i];
      if (name === 'head' && pose.blink) name = 'headBlink';
      var p = parts[name], q = pose[R.order[i]] || Z, img = rigImg[name];
      if (!img) continue;
      c.save();
      if (p.parent === 'body') {
        var b = parts.body;
        c.translate(b.ax + (bp.dx || 0), b.ay + (bp.dy || 0)); c.rotate(bp.a || 0); c.translate(-b.ax, -b.ay);
      } else if (name === 'body') {
        c.translate(bp.dx || 0, bp.dy || 0);
      }
      c.translate(p.ax + (q.dx || 0), p.ay + (q.dy || 0));
      if (name === 'body') { c.rotate(bp.a || 0); } else c.rotate(q.a || 0);
      c.drawImage(img, -p.px, -p.py, p.w, p.h);
      c.restore();
    }
    c.restore();
  }

  /* ---------- 4. Tereny i tła ---------- */
  var TER = {
    valley: { skyTop: '#8DBBEA', skyBot: '#E2EBF7', far: '#C8D5E5', farLine: '#B3C4D8', mid: '#9CC49A', midDk: '#6FA477',
      top: '#3E9A5C', topHi: '#74C585', fill: '#C9AE84', fillDk: '#AD9068', speck: '#B79B71', plat: '#8C6A43', platDk: '#664A2C' },
    cave: { skyTop: '#040E1E', skyBot: '#0D2445', far: '#11284A', farLine: '#1A3560', mid: '#183660', midDk: '#214477',
      top: '#5C6F8E', topHi: '#9DB2D2', fill: '#2B3D5A', fillDk: '#1E2C44', speck: '#3A4F70', plat: '#4E6488', platDk: '#33456A', dark: true },
    stone: { skyTop: '#9CC4EE', skyBot: '#F3F6FB', far: '#C4D5C2', farLine: '#AFC3AD', mid: '#93BA8E', midDk: '#6E9B6B',
      top: '#3F9358', topHi: '#78C08A', fill: '#C8B693', fillDk: '#A39070', speck: '#D6C7A6', plat: '#A48B67', platDk: '#76603F', water: '#4FA4A0' },
    cliff: { skyTop: '#76AAE4', skyBot: '#FFF0C4', far: '#DCD3C3', farLine: '#C7BCA8', mid: '#B9AC94', midDk: '#9C8E75',
      top: '#A39377', topHi: '#D3C5A8', fill: '#8B7C64', fillDk: '#6E614D', speck: '#9F907A', plat: '#7A6A52', platDk: '#54473A' }
  };
  var PER = 1600, BG = {};
  function genBackgrounds() {
    var R = rng(4711);
    function arr(n, f) { var a = []; for (var i = 0; i < n; i++) a.push(f(i)); return a; }
    function ridge(step, y0, y1) { var p = []; for (var x = 0; x < PER; x += step) p.push([x, y0 + R() * (y1 - y0)]); p.push([PER, p[0][1]]); return p; }
    BG.valley = { clouds: arr(7, function () { return { x: R() * PER, y: 20 + R() * 110, r: 16 + R() * 20 }; }),
      far: ridge(46, 70, 200), mid: ridge(120, 236, 290), trees: arr(16, function () { return { x: R() * PER, s: .7 + R() * .6 }; }) };
    BG.cave = { tites: arr(26, function () { return { x: R() * PER, w: 20 + R() * 50, len: 40 + R() * 150 }; }),
      mites: arr(18, function () { return { x: R() * PER, w: 26 + R() * 60, h: 60 + R() * 150 }; }),
      cols: arr(5, function (i) { return { x: i * PER / 5 + R() * 150, w: 50 + R() * 50 }; }),
      sparks: arr(40, function () { return { x: R() * PER, y: 30 + R() * 300, p: R() * 6 }; }) };
    BG.stone = { far: ridge(160, 200, 250), mid: ridge(130, 270, 305), cyp: arr(10, function () { return { x: R() * PER, h: 50 + R() * 40 }; }),
      olives: arr(14, function () { return { x: R() * PER, r: 12 + R() * 10 }; }), abbey: [320, 1180] };
    BG.cliff = { far: ridge(38, 20, 170), mid: ridge(70, 250, 300), grotto: [880] };
  }
  function smoothPath(c, pts, ox, oy, bottom) {
    c.beginPath(); c.moveTo(ox + pts[0][0], bottom); c.lineTo(ox + pts[0][0], oy + pts[0][1]);
    for (var i = 1; i < pts.length; i++) {
      var mx = (pts[i - 1][0] + pts[i][0]) / 2, my = (pts[i - 1][1] + pts[i][1]) / 2;
      c.quadraticCurveTo(ox + pts[i - 1][0], oy + pts[i - 1][1], ox + mx, oy + my);
    }
    c.lineTo(ox + pts[pts.length - 1][0], oy + pts[pts.length - 1][1]); c.lineTo(ox + pts[pts.length - 1][0], bottom); c.closePath();
  }
  function jaggedPath(c, pts, ox, oy, bottom) {
    c.beginPath(); c.moveTo(ox + pts[0][0], bottom);
    pts.forEach(function (p) { c.lineTo(ox + p[0], oy + p[1]); });
    c.lineTo(ox + pts[pts.length - 1][0], bottom); c.closePath();
  }
  function eachRepeat(camX, par, w, fn) { // powtarzaj warstwę co PER px
    var off = -((camX * par) % PER); if (off > 0) off -= PER;
    for (var x = off; x < w; x += PER) fn(x);
  }
  function drawBackground(c, kind, camX, camY, w, h, t) {
    var T = TER[kind], B = BG[kind];
    var sky = c.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, T.skyTop); sky.addColorStop(1, T.skyBot);
    c.fillStyle = sky; c.fillRect(0, 0, w, h);
    var yf = -camY * .45, ym = -camY * .7, bottom = h + 10;
    if (kind === 'valley') {
      c.fillStyle = 'rgba(255,255,255,.9)';
      eachRepeat(camX + t * 8, .08, w, function (ox) { B.clouds.forEach(function (k) { c.beginPath(); ell(c, ox + k.x, yf + k.y, k.r * 1.6, k.r * .7, 0); ell(c, ox + k.x - k.r * .6, yf + k.y + 3, k.r * .8, k.r * .5, 0); ell(c, ox + k.x + k.r * .2, yf + k.y - k.r * .35, k.r * .8, k.r * .6, 0); c.fill(); }); });
      eachRepeat(camX, .18, w, function (ox) {
        c.fillStyle = T.far; jaggedPath(c, B.far, ox, yf, bottom); c.fill();
        c.strokeStyle = T.farLine; c.lineWidth = 2; c.beginPath();
        B.far.forEach(function (p, i) { if (i % 3 === 0) { c.moveTo(ox + p[0], yf + p[1] + 18); c.lineTo(ox + p[0] + 6, yf + p[1] + 70); } }); c.stroke();
      });
      eachRepeat(camX, .42, w, function (ox) {
        c.fillStyle = T.mid; smoothPath(c, B.mid, ox, ym, bottom); c.fill();
        c.fillStyle = T.midDk; B.trees.forEach(function (tr) { var ty = ym + 262; c.beginPath(); ell(c, ox + tr.x, ty - 14 * tr.s, 11 * tr.s, 14 * tr.s, 0); c.fill(); });
      });
    } else if (kind === 'cave') {
      eachRepeat(camX, .16, w, function (ox) {
        c.fillStyle = T.far; c.beginPath();
        B.tites.forEach(function (s) { c.moveTo(ox + s.x - s.w / 2, yf - 400); c.lineTo(ox + s.x - s.w / 2, yf + 10); c.lineTo(ox + s.x, yf + 10 + s.len); c.lineTo(ox + s.x + s.w / 2, yf + 10); c.lineTo(ox + s.x + s.w / 2, yf - 400); });
        c.fill(); c.fillRect(0, 0, w, yf + 14);
        c.beginPath();
        B.mites.forEach(function (s) { c.moveTo(ox + s.x - s.w / 2, bottom); c.lineTo(ox + s.x - s.w / 2, ym + 330); c.lineTo(ox + s.x, ym + 330 - s.h); c.lineTo(ox + s.x + s.w / 2, ym + 330); c.lineTo(ox + s.x + s.w / 2, bottom); });
        c.fill();
      });
      eachRepeat(camX, .4, w, function (ox) {
        B.cols.forEach(function (k) {
          var x = ox + k.x; c.fillStyle = T.mid;
          c.beginPath(); c.moveTo(x - k.w / 2, -10); c.quadraticCurveTo(x - k.w * .15, ym + 150, x - k.w / 2, bottom); c.lineTo(x + k.w / 2, bottom); c.quadraticCurveTo(x + k.w * .15, ym + 150, x + k.w / 2, -10); c.fill();
          c.fillStyle = T.midDk; c.fillRect(x - k.w * .12, -10, k.w * .1, h + 20);
        });
        B.sparks.forEach(function (s) {
          var a = .25 + .35 * (reduceMotion ? .5 : (.5 + .5 * Math.sin(t * 2 + s.p)));
          c.fillStyle = 'rgba(160,220,255,' + a.toFixed(2) + ')'; c.fillRect(ox + s.x, ym + s.y, 2.5, 2.5);
        });
      });
    } else if (kind === 'stone') {
      eachRepeat(camX, .15, w, function (ox) {
        c.fillStyle = T.far; smoothPath(c, B.far, ox, yf, bottom); c.fill();
        B.abbey.forEach(function (ax) { drawAbbey(c, ox + ax, yf + 236, '#A8B9AA'); });
      });
      eachRepeat(camX, .4, w, function (ox) {
        c.fillStyle = T.mid; smoothPath(c, B.mid, ox, ym, bottom); c.fill();
        c.fillStyle = '#4F7D58'; B.cyp.forEach(function (k) { c.beginPath(); ell(c, ox + k.x, ym + 290 - k.h / 2, 7, k.h / 2, 0); c.fill(); });
        c.fillStyle = T.midDk; B.olives.forEach(function (k) { c.beginPath(); ell(c, ox + k.x, ym + 300 - k.r, k.r * 1.3, k.r, 0); c.fill(); });
      });
    } else {
      eachRepeat(camX, .18, w, function (ox) {
        c.fillStyle = T.far; jaggedPath(c, B.far, ox, yf, bottom); c.fill();
        B.grotto.forEach(function (gx) { drawGrotto(c, ox + gx, yf + 190); });
      });
      eachRepeat(camX, .42, w, function (ox) {
        c.fillStyle = T.mid; jaggedPath(c, B.mid, ox, ym, bottom); c.fill();
        c.strokeStyle = T.midDk; c.lineWidth = 2; c.beginPath();
        B.mid.forEach(function (p, i) { if (i % 2) { c.moveTo(ox + p[0] - 10, ym + p[1] + 16); c.lineTo(ox + p[0] + 14, ym + p[1] + 16); } }); c.stroke();
      });
    }
  }
  function drawAbbey(c, x, y, col) { // romańskie opactwo: krzyż grecki w kwadracie, ośmioboczna kopuła
    c.fillStyle = col;
    c.fillRect(x - 70, y - 40, 140, 64);
    c.beginPath(); c.moveTo(x - 76, y - 40); c.lineTo(x, y - 62); c.lineTo(x + 76, y - 40); c.fill();
    c.fillRect(x - 18, y - 84, 36, 30);
    c.beginPath(); c.moveTo(x - 22, y - 84); c.lineTo(x, y - 100); c.lineTo(x + 22, y - 84); c.fill();
    c.fillRect(x + 50, y - 96, 22, 60);
    c.fillStyle = 'rgba(14,26,43,.18)';
    c.fillRect(x - 4, y - 20, 8, 14); c.fillRect(x - 40, y - 22, 5, 10); c.fillRect(x + 35, y - 22, 5, 10); c.fillRect(x + 58, y - 86, 6, 10);
  }
  function drawGrotto(c, x, y) { // skalna paszcza z białą ośmioboczną świątynią
    c.fillStyle = '#3E342A'; c.beginPath(); ell(c, x, y, 150, 118, 0); c.fill();
    c.fillStyle = '#2B241D'; c.beginPath(); ell(c, x, y + 10, 120, 92, 0); c.fill();
    c.fillStyle = '#F4EFE4';
    c.fillRect(x - 34, y + 16, 68, 52);
    c.beginPath(); c.moveTo(x - 40, y + 18); c.lineTo(x - 26, y - 4); c.lineTo(x + 26, y - 4); c.lineTo(x + 40, y + 18); c.fill();
    c.beginPath(); ell(c, x, y - 4, 20, 14, 0); c.fill();
    c.fillRect(x - 3, y - 26, 6, 10);
    c.fillStyle = 'rgba(14,26,43,.25)'; for (var i = -2; i <= 2; i++) c.fillRect(x + i * 13 - 2, y + 26, 4, 34);
  }

  /* ---------- 5. Budowa poziomu z danych wycieczki ---------- */
  function buildLevel(trip, prog, playNo) {
    var n = trip.stops.length, W = SEC * n + 18;
    var L = { W: W, grid: new Uint8Array(W * ROWS), sec: new Uint8Array(W), sections: [], coins: [], enemies: [], drippers: [],
      gates: [], springs: [], chests: [], landmarks: [] };
    function set(x, y, v) { if (x >= 0 && x < W && y >= 0 && y < ROWS) L.grid[y * W + x] = v; }
    function ground(x, g) { for (var y = g; y < ROWS; y++) set(x, y, 1); }
    function coin(tx, ty) { L.coins.push({ x: tx * TILE + 16, y: ty * TILE + 16, taken: false, ph: tx * .7 }); }

    trip.stops.forEach(function (stop, si) {
      var x0 = si * SEC, terr = TERRAIN_BY_CATEGORY[stop.category] || 'valley', R = rng(hash(trip.trip + ':' + stop.key));
      var pr = prog.stops[si] || {};
      var S = { i: si, x0: x0, x1: x0 + SEC, stop: stop, terrain: terr, power: pr.photo ? stop.powerup : null, shortcut: !!pr.all, gates: [] };
      L.sections.push(S);
      for (var c = x0; c < x0 + SEC; c++) L.sec[c] = si;
      var cave = terr === 'cave';
      if (cave) for (c = x0; c < x0 + SEC; c++) { set(c, 0, 1); set(c, 1, 1); }
      var nq = stop.quests.length, ng = Math.min(2, nq);
      var gateCols = ng === 2 ? [x0 + 42, x0 + 78] : ng === 1 ? [x0 + 60] : [];
      var landX = x0 + SEC - 9;
      var g = GROUND, x = x0, gi = 0;
      for (; x < x0 + 8; x++) ground(x, g);
      if (si === 0) { coin(x0 + 5, g - 2); coin(x0 + 6, g - 2); coin(x0 + 7, g - 2); }
      var hard = si * .06;

      function flat(w) { for (var i = 0; i < w; i++) ground(x + i, g); }
      var chunks = {
        flat: function () { var w = 4 + Math.floor(R() * 3); flat(w); if (R() < .6) for (var i = 1; i < w - 1; i++) coin(x + i, g - 2); return w; },
        step: function () {
          var d = pick(R, terr === 'cliff' ? [-1, -1, -2, 1] : [-1, 1, -2, 2]);
          g = clamp(g + d, 8, 12); var w = 4 + Math.floor(R() * 3); flat(w); coin(x + 1, g - 2); return w;
        },
        gap: function () {
          var g2 = clamp(g + pick(R, [-1, 0, 0, 1]), 9, 12);
          var w = g2 < g ? 2 : 2 + Math.floor(R() * 2); // pod górę tylko krótka przerwa
          if (terr === 'stone') for (var i = 0; i < w; i++) { set(x + i, 12, 3); set(x + i, 13, 3); }
          coin(x + Math.floor(w / 2), g - 3);
          x += w; g = g2; flat(2); return 2;
        },
        bridge: function () { // tylko kamienny teren: mostek nad Sentino
          var w = 6; for (var i = 0; i < w; i++) { set(x + i, g, 2); set(x + i, 12, 3); set(x + i, 13, 3); if (i % 2) coin(x + i, g - 2); }
          if (g < 12) for (i = 0; i < w; i++) for (var y = g + 1; y < 12; y++) set(x + i, y, 0);
          ground(x - 1, g); ground(x + w, g);
          return w;
        },
        float: function () {
          var w = 4; set(x + 1, g - 2, 2); set(x + 2, g - 2, 2); coin(x + 1, g - 3); coin(x + 2, g - 3);
          if (terr === 'stone') for (var i = 0; i < w; i++) { set(x + i, 12, 3); set(x + i, 13, 3); }
          x += w; flat(2); return 2;
        },
        ledges: function () {
          var w = 7; flat(w); for (var i = 2; i <= 4; i++) { set(x + i, g - 3, 2); coin(x + i, g - 4); } return w;
        },
        roller: function () {
          var w = 7; flat(w); L.enemies.push({ type: 'roller', x: (x + 6) * TILE + 16, y: g * TILE - 12, vx: 0, vy: 0, r: 12, rot: 0, alive: true, active: false, sec: si });
          coin(x + 2, g - 2); return w;
        },
        bat: function () {
          var w = 6; flat(w); L.enemies.push({ type: 'bat', hx: (x + 3) * TILE, hy: (g - 2.3) * TILE, x: (x + 3) * TILE, y: (g - 2.3) * TILE, t: R() * 6, alive: true, flee: 0, cool: 0, sec: si });
          return w;
        },
        drip: function () {
          var w = 7; flat(w);
          L.drippers.push({ x: (x + 2) * TILE + 16, y: 2 * TILE, period: 2.3 - hard, t: R() * 2, drop: null });
          L.drippers.push({ x: (x + 5) * TILE + 16, y: 2 * TILE, period: 2.6 - hard, t: R() * 2 + 1, drop: null });
          coin(x + 3, g - 2); coin(x + 4, g - 2); return w;
        },
        mite: function () { // stalagmit do przeskoczenia
          var w = 5; flat(w); var hgt = 1 + (R() < .4 ? 1 : 0); for (var k = 1; k <= hgt; k++) set(x + 2, g - k, 1); coin(x + 2, g - hgt - 2); return w;
        }
      };
      var weights = {
        valley: { flat: 3, step: 3, gap: 2, float: 1.5, ledges: 1.5, roller: 2.5 + hard * 10 },
        cave: { flat: 2, step: 2, gap: 1.5, float: 1, ledges: 1.5, bat: 2, drip: 3, mite: 2 },
        stone: { flat: 2, step: 2, gap: 1.5, bridge: 2, float: 1.5, ledges: 1, roller: 2, bat: 1 },
        cliff: { flat: 2, step: 3.5, gap: 2, float: 1, ledges: 1.5, roller: 3, bat: 1 }
      }[terr];
      var wsum = 0; for (var k in weights) wsum += weights[k];
      function chooseChunk() { var r = R() * wsum; for (var k in weights) { r -= weights[k]; if (r <= 0) return k; } return 'flat'; }

      while (x < landX - 3) {
        var gc = gi < gateCols.length ? gateCols[gi] : null;
        var limit = gc != null ? gc - 5 : landX - 3;
        if (x >= limit) {
          if (gc == null) break;
          g = GROUND; for (; x <= gc + 4; x++) ground(x, g);
          var q = stop.quests[(gi + playNo * ng) % nq];
          var gate = { x: gc * TILE, col: gc, g: g, open: false, lift: 0, quest: q, sec: si, tries: 0 };
          L.gates.push(gate); S.gates.push(gate); gi++;
          coin(gc + 2, g - 2); coin(gc + 3, g - 2);
          continue;
        }
        var room = limit - x;
        if (room < 7) { flat(room); x += room; continue; }
        var kind = chooseChunk(), adv = chunks[kind]();
        x += adv;
      }
      g = GROUND; for (; x < x0 + SEC; x++) ground(x, g);
      L.landmarks.push({ x: (landX + 2) * TILE + 16, y: GROUND * TILE, sec: si, done: false, stop: stop });

      // Tajny skrót: trampolina + kładka wysoko z kryjówką (wszystkie zadania przystanku zaliczone)
      if (S.shortcut) {
        var endC = (gateCols.length ? gateCols[0] : landX) - 5, WR = 4;
        L.springs.push({ x: (x0 + 5) * TILE + 16, y: GROUND * TILE, squash: 0 });
        for (c = x0 + 7; c <= endC; c++) { set(c, WR, 2); if (c % 2 === 0 && c < endC - 2) coin(c, WR - 1); }
        L.chests.push({ x: (endC - 1) * TILE + 16, y: WR * TILE, open: false });
      }
      S.checkpoint = { x: (x0 + 2) * TILE + 16, y: GROUND * TILE };
    });
    for (var x = SEC * n; x < W; x++) { ground(x, GROUND); L.sec[x] = n - 1; }
    for (var y = 0; y < ROWS; y++) set(W - 1, y, 1);
    return L;
  }

  /* ---------- 6. Fizyka, gracz, przeciwnicy ---------- */
  var trip, prog, L, P, state = 'loading', prevState = 'play', playNo = 0, demo = false;
  var cam = { x: 0, y: 0 }, view = { w: 640, h: 384, s: 1, dpr: 1, cssW: 0, cssH: 0, reserve: 0 };
  var stats, particles = [], stickerImgs = [], curSec = -1, celebration = null, gameT = 0, quizGate = null;

  function tileAt(x, y) {
    if (x < 0 || x >= L.W) return 1;
    if (y < 0) return 0;
    if (y >= ROWS) return 0;
    return L.grid[y * L.W + x];
  }
  function solidAt(px, py) { return tileAt(Math.floor(px / TILE), Math.floor(py / TILE)) === 1; }

  function newPlayer() {
    var hearts = clamp(BASE_HEARTS + prog.missions, BASE_HEARTS, MAX_HEARTS);
    return { x: 3 * TILE, y: GROUND * TILE, vx: 0, vy: 0, w: 22, h: 48, onGround: false, facing: 1, coyote: 0, jumpBuf: 0, airJumps: 0,
      inv: 0, hurtT: 0, nap: 0, land: 0, phase: 0, t: 0, hearts: hearts, maxHearts: hearts, safe: { x: 3 * TILE, y: GROUND * TILE }, safeT: 0, checkpoint: { x: 3 * TILE, y: GROUND * TILE } };
  }
  function secAt(px) { return L.sections[L.sec[clamp(Math.floor(px / TILE), 0, L.W - 1)]]; }
  function curPower() { var s = secAt(P.x); return s ? s.power : null; }

  var input = { left: false, right: false, jump: false, jumpPressed: false };

  function step(dt) {
    gameT += dt; P.t += dt;
    updatePlayer(dt);
    updateEntities(dt);
    updateParticles(dt);
    updateCamera(dt);
    var si = L.sec[clamp(Math.floor(P.x / TILE), 0, L.W - 1)];
    if (si !== curSec) enterSection(si);
  }

  function updatePlayer(dt) {
    if (P.nap > 0) {
      P.nap -= dt;
      if (P.nap <= 0) { P.x = P.checkpoint.x; P.y = P.checkpoint.y; P.vx = P.vy = 0; P.hearts = BASE_HEARTS; P.inv = 2; updateHUD(); toast('Quo odpoczął. Dasz radę!'); }
      return;
    }
    var power = curPower();
    var ax = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (P.hurtT > 0) { P.hurtT -= dt; ax = 0; }
    var target = ax * RUN;
    var k = P.onGround ? 16 : 7;
    P.vx += (target - P.vx) * Math.min(1, dt * k);
    if (Math.abs(P.vx) < 2 && !ax) P.vx = 0;
    if (ax) P.facing = ax;

    if (input.jumpPressed) { P.jumpBuf = .13; input.jumpPressed = false; }
    if (P.jumpBuf > 0) P.jumpBuf -= dt;
    if (P.onGround) { P.coyote = .1; P.airJumps = power === 'doublejump' ? 1 : 0; } else P.coyote -= dt;
    if (P.jumpBuf > 0 && P.hurtT <= 0) {
      if (P.coyote > 0) { P.vy = -JUMP_V; P.coyote = 0; P.jumpBuf = 0; P.onGround = false; sfx('jump'); }
      else if (P.airJumps > 0) { P.vy = -JUMP_V * .9; P.airJumps--; P.jumpBuf = 0; sfx('jump2'); puff(P.x, P.y, 6, '#fff'); }
    }
    if (!input.jump && P.vy < -260) P.vy = -260;
    P.vy += G * dt;
    if (power === 'glide' && input.jump && P.vy > 90) P.vy = 90;
    if (P.vy > MAX_FALL) P.vy = MAX_FALL;

    // ruch w poziomie
    P.x += P.vx * dt;
    var hw = P.w / 2, top = P.y - P.h, bot = P.y;
    if (P.vx > 0) {
      var cx = Math.floor((P.x + hw) / TILE);
      for (var ry = Math.floor((top + 2) / TILE); ry <= Math.floor((bot - 2) / TILE); ry++)
        if (tileAt(cx, ry) === 1) { P.x = cx * TILE - hw - .01; P.vx = 0; break; }
    } else if (P.vx < 0) {
      cx = Math.floor((P.x - hw) / TILE);
      for (ry = Math.floor((top + 2) / TILE); ry <= Math.floor((bot - 2) / TILE); ry++)
        if (tileAt(cx, ry) === 1) { P.x = (cx + 1) * TILE + hw + .01; P.vx = 0; break; }
    }
    // bramy z questami
    for (var i = 0; i < L.gates.length; i++) {
      var gt = L.gates[i];
      if (gt.open) continue;
      if (P.x + hw > gt.x + 2 && P.x - hw < gt.x + 30) { P.x = gt.x + 2 - hw; P.vx = Math.min(P.vx, 0); }
      if (P.x + hw >= gt.x - 2 && P.x < gt.x && P.onGround && state === 'play') { openQuiz(gt); return; }
    }

    // ruch w pionie
    var prevBot = P.y;
    P.y += P.vy * dt;
    var wasGround = P.onGround; P.onGround = false;
    var c0 = Math.floor((P.x - hw + 2) / TILE), c1 = Math.floor((P.x + hw - 2) / TILE);
    if (P.vy >= 0) {
      var row = Math.floor(P.y / TILE), rowTop = row * TILE;
      for (var cc = c0; cc <= c1; cc++) {
        var tv = tileAt(cc, row);
        if (tv === 1 || (tv === 2 && prevBot <= rowTop + .5)) {
          if (!wasGround && P.vy > 300) { P.land = 1; if (P.vy > 500) puff(P.x, rowTop, 4, 'rgba(255,255,255,.8)'); }
          P.y = rowTop; P.vy = 0; P.onGround = true; break;
        }
      }
      // trampoliny
      L.springs.forEach(function (sp) {
        if (Math.abs(P.x - sp.x) < 20 && prevBot <= sp.y - 12 && P.y >= sp.y - 14) { P.y = sp.y - 14; P.vy = -SPRING_V; P.onGround = false; sp.squash = 1; sfx('spring'); }
      });
    } else {
      var rowT = Math.floor((P.y - P.h) / TILE);
      for (cc = c0; cc <= c1; cc++) if (tileAt(cc, rowT) === 1) { P.y = (rowT + 1) * TILE + P.h; P.vy = 0; break; }
    }
    if (P.land > 0) P.land = Math.max(0, P.land - dt * 6);
    if (P.inv > 0) P.inv -= dt;

    // bezpieczne miejsce do powrotu po upadku
    P.safeT -= dt;
    if (P.onGround && P.safeT <= 0 && solidAt(P.x - hw - 6, P.y + 4) && solidAt(P.x + hw + 6, P.y + 4) && !nearHazard()) { P.safe = { x: P.x, y: P.y }; P.safeT = .3; }
    // woda i przepaść
    var inWater = tileAt(Math.floor(P.x / TILE), Math.floor((P.y - 6) / TILE)) === 3;
    if (P.y > ROWS * TILE + 50 || inWater) fallOut(inWater);
    if (P.x < 16) P.x = 16;

    // animacja
    if (P.onGround && Math.abs(P.vx) > 10) P.phase += dt * Math.abs(P.vx) / 13;
  }
  function nearHazard() {
    for (var i = 0; i < L.enemies.length; i++) { var e = L.enemies[i]; if (e.alive && Math.abs((e.x || e.hx) - P.x) < 70) return true; }
    return false;
  }
  function fallOut(water) {
    if (water) splash(P.x, Math.floor(P.y / TILE) * TILE);
    sfx('hit');
    P.hearts--;
    updateHUD();
    if (P.hearts <= 0) { startNap(); return; }
    P.x = P.safe.x; P.y = P.safe.y; P.vx = P.vy = 0; P.inv = 1.6;
    toast(water ? 'Plusk! Woda w Sentino jest zimna. Jeszcze raz!' : 'Ups! Spróbuj jeszcze raz.');
  }
  function hurt(fromX) {
    if (P.inv > 0 || P.nap > 0) return;
    P.hearts--; P.inv = 1.6; P.hurtT = .35;
    P.vx = (P.x < fromX ? -1 : 1) * 260; P.vy = -320; P.onGround = false;
    sfx('hit'); updateHUD();
    if (P.hearts <= 0) startNap();
  }
  function bump(fromX) {
    if (P.hurtT > 0) return;
    P.hurtT = .3; P.vx = (P.x < fromX ? -1 : 1) * 330; P.vy = -260; P.onGround = false; sfx('bump');
  }
  function startNap() { P.nap = 1.4; P.vx = 0; P.vy = 0; toast('Quo musi chwilę odpocząć…'); }

  function addCoins(n, x, y) {
    stats.coins += n; updateHUD();
    if (x != null) for (var i = 0; i < Math.min(n, 8); i++) particles.push({ x: x, y: y, vx: (Math.random() - .5) * 220, vy: -150 - Math.random() * 200, life: .7, max: .7, col: '#FFC629', size: 4, g: 900 });
  }

  function updateEntities(dt) {
    var left = cam.x - 260, right = cam.x + view.w + 260;
    var power = curPower();
    // kamyczki
    for (var i = 0; i < L.coins.length; i++) {
      var c = L.coins[i]; if (c.taken || c.x < left || c.x > right) continue;
      var dx = P.x - c.x, dy = (P.y - 20) - c.y, d = Math.sqrt(dx * dx + dy * dy);
      if (power === 'magnet' && d < 150 && P.nap <= 0) { c.x += dx / d * 420 * dt; c.y += dy / d * 420 * dt; }
      if (d < 24 && P.nap <= 0) { c.taken = true; stats.coins++; updateHUD(); sfx('coin'); sparkle(c.x, c.y); }
    }
    // skrzynki w kryjówkach
    L.chests.forEach(function (ch) {
      if (!ch.open && Math.abs(P.x - ch.x) < 24 && Math.abs(P.y - ch.y) < 30) { ch.open = true; addCoins(10, ch.x, ch.y - 16); sfx('fanfare'); toast('Tajna kryjówka! +10 kamyczków'); }
    });
    L.gates.forEach(function (gt) { if (gt.open && gt.lift < 1) gt.lift = Math.min(1, gt.lift + dt * 1.6); });
    L.springs.forEach(function (sp) { if (sp.squash > 0) sp.squash = Math.max(0, sp.squash - dt * 4); });
    // przeciwnicy
    L.enemies.forEach(function (e) {
      if (!e.alive) return;
      if (e.type === 'roller') {
        if (!e.active) { if (e.x < cam.x + view.w + 40) { e.active = true; e.vx = -(70 + e.sec * 8); } else return; }
        e.vy += G * dt; e.x += e.vx * dt; e.y += e.vy * dt; e.rot += e.vx * dt / e.r;
        var row = Math.floor((e.y + e.r) / TILE);
        if (tileAt(Math.floor(e.x / TILE), row) === 1 || tileAt(Math.floor(e.x / TILE), row) === 2) { e.y = row * TILE - e.r; e.vy = 0; }
        if (tileAt(Math.floor((e.x + Math.sign(e.vx) * e.r) / TILE), Math.floor(e.y / TILE)) === 1) e.vx = -e.vx;
        for (var gi = 0; gi < L.gates.length; gi++) { var gt = L.gates[gi]; if (!gt.open && Math.abs(e.x - (gt.x + 16)) < e.r + 16) e.vx = -Math.abs(e.vx) * Math.sign(gt.x + 16 - e.x); }
        if (e.y > ROWS * TILE + 40 || e.x < left - 400) { e.alive = false; return; }
        if (tileAt(Math.floor(e.x / TILE), Math.floor(e.y / TILE)) === 3) { splash(e.x, e.y); e.alive = false; return; }
        collideEnemy(e, e.r);
      } else if (e.type === 'bat') {
        e.t += dt;
        if (e.flee > 0) { e.flee -= dt; e.y -= 220 * dt; e.x += 60 * dt; if (e.flee <= 0) e.alive = false; return; }
        e.x = e.hx + Math.sin(e.t * 1.3) * 46; e.y = e.hy + Math.sin(e.t * 2.6) * 20;
        if (e.cool > 0) { e.cool -= dt; return; }
        collideEnemy(e, 11);
      }
    });
    // krople ze stalaktytów
    L.drippers.forEach(function (d) {
      if (d.x < left || d.x > right) return;
      d.t += dt;
      if (!d.drop && d.t >= d.period) { d.drop = { x: d.x, y: d.y + 10, vy: 0 }; d.t = 0; }
      if (d.drop) {
        var dr = d.drop; dr.vy += G * .6 * dt; dr.y += dr.vy * dt;
        if (tileAt(Math.floor(dr.x / TILE), Math.floor(dr.y / TILE)) === 1) { splash(dr.x, Math.floor(dr.y / TILE) * TILE, '#9FD3F5'); d.drop = null; return; }
        if (P.nap <= 0 && Math.abs(dr.x - P.x) < P.w / 2 + 4 && dr.y > P.y - P.h && dr.y < P.y) { hurt(dr.x); splash(dr.x, dr.y, '#9FD3F5'); d.drop = null; }
      }
    });
    // pomniki przystanków
    L.landmarks.forEach(function (lm) {
      if (!lm.done && P.x >= lm.x - 10 && P.nap <= 0) { lm.done = true; startCelebration(lm); }
    });
  }
  function collideEnemy(e, r) {
    if (P.nap > 0) return;
    var hw = P.w / 2;
    var nx = clamp(e.x, P.x - hw, P.x + hw), ny = clamp(e.y, P.y - P.h, P.y);
    var dx = e.x - nx, dy = e.y - ny;
    if (dx * dx + dy * dy > r * r) return;
    var stomp = P.vy > 60 && P.y - 6 < e.y;
    if (stomp) {
      P.vy = -470; P.y = Math.min(P.y, e.y - r);
      if (e.type === 'roller') { e.alive = false; addCoins(2, e.x, e.y); sfx('pop'); puff(e.x, e.y, 8, '#C9CED6'); }
      else { e.flee = 1.4; addCoins(1, e.x, e.y); sfx('pop'); }
    } else if (e.type === 'bat') { bump(e.x); e.cool = .8; }
    else hurt(e.x);
  }

  function puff(x, y, n, col) { if (reduceMotion) n = Math.min(n, 3); for (var i = 0; i < n; i++) particles.push({ x: x, y: y, vx: (Math.random() - .5) * 160, vy: -Math.random() * 120, life: .45, max: .45, col: col, size: 4 + Math.random() * 3, g: 200 }); }
  function sparkle(x, y) { for (var i = 0; i < (reduceMotion ? 2 : 6); i++) { var a = i / 6 * Math.PI * 2; particles.push({ x: x, y: y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, life: .35, max: .35, col: '#FFF4CF', size: 3, g: 0 }); } }
  function splash(x, y, col) { for (var i = 0; i < 7; i++) particles.push({ x: x, y: y, vx: (Math.random() - .5) * 200, vy: -100 - Math.random() * 180, life: .5, max: .5, col: col || '#8FD0E8', size: 3 + Math.random() * 2, g: 1100 }); sfx('drip'); }
  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i]; p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }

  function updateCamera(dt) {
    var tx = clamp(P.x - view.w * .38, 0, L.W * TILE - view.w);
    cam.x = lerp(cam.x, tx, Math.min(1, dt * 8));
    var levelH = ROWS * TILE, bottomY = levelH + view.reserve;
    var ty;
    if (view.h >= bottomY) ty = bottomY - view.h;
    else ty = clamp(P.y - view.h * .64, 0, bottomY - view.h);
    cam.y = lerp(cam.y, ty, Math.min(1, dt * 5));
  }

  /* ---------- 7. Rysowanie świata ---------- */
  var cv = $('game'), ctx = cv.getContext('2d'), shade = document.createElement('canvas'), sctx = shade.getContext('2d');
  var stopIcons = [];

  function resize() {
    var w = window.innerWidth, h = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    shade.width = Math.round(w / 2); shade.height = Math.round(h / 2);
    var s = Math.min(h / ((w > h ? 13 : 12) * TILE), w / (10 * TILE));
    view.s = s; view.dpr = dpr; view.cssW = w; view.cssH = h;
    view.w = w / s; view.h = h / s;
    var padOn = !$('pad').hidden || padWanted();
    view.reserve = (h > w && padOn) ? 150 / s : 0;
    if (L && P) { updateCamera(1); }
  }
  function padWanted() { return ('ontouchstart' in window) || (window.matchMedia && matchMedia('(pointer: coarse)').matches) || window.innerWidth < 900; }

  function sectionBlend(px) {
    var secPx = SEC * TILE, i = clamp(Math.floor(px / secPx), 0, L.sections.length - 1), d = px - i * secPx, BL = 160;
    if (d < BL && i > 0) { var m = (d + BL) / (2 * BL); return { a: L.sections[i - 1].terrain, b: L.sections[i].terrain, m: m }; }
    if (d > secPx - BL && i < L.sections.length - 1) { m = (d - (secPx - BL)) / (2 * BL); return { a: L.sections[i].terrain, b: L.sections[i + 1].terrain, m: m }; }
    return { a: L.sections[i].terrain, b: null, m: 0 };
  }

  function render() {
    var k = view.s * view.dpr, W = view.w, H = view.h;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = true;
    var cxw = cam.x + W / 2, bl = sectionBlend(cxw);
    drawBackground(ctx, bl.a, cam.x, cam.y, W, H, gameT);
    if (bl.b && bl.m > 0) { ctx.globalAlpha = bl.m; drawBackground(ctx, bl.b, cam.x, cam.y, W, H, gameT); ctx.globalAlpha = 1; }

    ctx.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k);
    drawCaveMouths();
    drawTiles();
    drawLandmarks();
    drawGates();
    drawSprings();
    drawCoins();
    drawEnemies();
    drawPlayer();
    drawParticles();

    // ciemność w jaskini (latarka z zadania foto rozświetla więcej)
    var cw = caveWeight(P.x);
    if (cw > 0 && state !== 'celebrate') drawDarkness(cw);
    if (state === 'celebrate') renderCelebration();
  }

  function caveWeight(px) {
    var bl = sectionBlend(px), w = 0;
    if (bl.a === 'cave') w += bl.b ? 1 - bl.m : 1;
    if (bl.b === 'cave') w += bl.m;
    return w;
  }
  function drawDarkness(w) {
    var sw = shade.width, sh = shade.height, sc = sw / view.w;
    sctx.globalCompositeOperation = 'source-over';
    sctx.clearRect(0, 0, sw, sh);
    sctx.fillStyle = 'rgba(2,8,22,' + (0.9 * w).toFixed(3) + ')';
    sctx.fillRect(0, 0, sw, sh);
    sctx.globalCompositeOperation = 'destination-out';
    var sec = secAt(P.x), lantern = sec && sec.terrain === 'cave' && sec.power === 'lantern';
    var R = (lantern ? 290 : 125) * (P.nap > 0 ? .8 : 1);
    function hole(x, y, r) {
      var sx = (x - cam.x) * sc, sy = (y - cam.y) * sc, rr = r * sc;
      if (sx < -rr || sx > sw + rr || sy < -rr || sy > sh + rr) return;
      var g = sctx.createRadialGradient(sx, sy, rr * .25, sx, sy, rr);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      sctx.fillStyle = g; sctx.beginPath(); sctx.arc(sx, sy, rr, 0, Math.PI * 2); sctx.fill();
    }
    hole(P.x, P.y - 22, R);
    L.gates.forEach(function (gt) { hole(gt.x + 16, gt.g * TILE - 120, 70); });
    L.landmarks.forEach(function (lm) { hole(lm.x, lm.y - 90, 110); });
    L.coins.forEach(function (c) { if (!c.taken) hole(c.x, c.y, 26); });
    L.drippers.forEach(function (d) { hole(d.x, d.y + 14, 30); if (d.drop) hole(d.drop.x, d.drop.y, 34); });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(shade, 0, 0, cv.width, cv.height);
    // ciepła poświata latarki
    if (lantern) {
      var k = view.s * view.dpr;
      ctx.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k);
      var g = ctx.createRadialGradient(P.x, P.y - 22, 10, P.x, P.y - 22, R);
      g.addColorStop(0, 'rgba(255,214,120,.16)'); g.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = g; ctx.fillRect(P.x - R, P.y - 22 - R, R * 2, R * 2);
    }
  }

  function drawCaveMouths() { // wejście do jaskini na granicy sekcji
    L.sections.forEach(function (S) {
      if (S.terrain !== 'cave' || !S.i) return;
      var bx = S.x0 * TILE, gy = GROUND * TILE;
      if (bx < cam.x - 300 || bx > cam.x + view.w + 300) return;
      var T = TER.cave;
      ctx.fillStyle = T.fillDk;
      ctx.beginPath(); ctx.moveTo(bx - 110, gy); ctx.quadraticCurveTo(bx - 120, 40, bx + 40, 2 * TILE); ctx.lineTo(bx + 40, cam.y - 20); ctx.lineTo(bx - 140, cam.y - 20); ctx.lineTo(bx - 140, gy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = T.fill;
      ctx.beginPath(); ctx.moveTo(bx - 90, gy); ctx.quadraticCurveTo(bx - 96, 70, bx + 40, 2 * TILE + 10); ctx.lineTo(bx + 40, 2 * TILE); ctx.quadraticCurveTo(bx - 110, 50, bx - 110, gy); ctx.closePath(); ctx.fill();
      var g = ctx.createLinearGradient(bx - 60, 0, bx + 200, 0); g.addColorStop(0, 'rgba(4,14,30,0)'); g.addColorStop(1, 'rgba(4,14,30,.55)');
      ctx.fillStyle = g; ctx.fillRect(bx - 60, 2 * TILE, 260, gy - 2 * TILE);
    });
  }
  function hashXY(x, y) { var h = (x * 374761393 + y * 668265263) >>> 0; h = (h ^ (h >>> 13)) * 1274126177 >>> 0; return h; }
  function drawTiles() {
    var c0 = Math.floor(cam.x / TILE) - 1, c1 = Math.ceil((cam.x + view.w) / TILE) + 1;
    var r0 = Math.floor(cam.y / TILE) - 1, r1 = Math.ceil((cam.y + view.h) / TILE) + 1;
    for (var x = Math.max(0, c0); x <= Math.min(L.W - 1, c1); x++) {
      var T = TER[L.sections[L.sec[x]].terrain], tk = L.sections[L.sec[x]].terrain;
      for (var y = r0; y <= r1; y++) {
        var ty = y < 0 ? 0 : y >= ROWS ? ROWS - 1 : y;
        var v = L.grid[ty * L.W + x];
        if (y < 0 && v !== 1) continue;
        var px = x * TILE, py = y * TILE;
        if (v === 1) {
          var up = y <= 0 ? (tk === 'cave' ? 1 : 0) : (y > ROWS ? 1 : (L.grid[(y - 1 >= ROWS ? ROWS - 1 : y - 1) * L.W + x]));
          var dn = (y < 0 || y + 1 >= ROWS) ? 1 : L.grid[(y + 1) * L.W + x];
          var lf = x > 0 ? L.grid[ty * L.W + x - 1] : 1, rt = x < L.W - 1 ? L.grid[ty * L.W + x + 1] : 1;
          drawSolid(T, tk, px, py, up !== 1, dn !== 1 && y < ROWS, lf !== 1, rt !== 1, hashXY(x, y));
        } else if (v === 2 && y === ty) {
          drawPlatform(T, tk, px, py, L.grid[ty * L.W + x - 1] === 2, L.grid[ty * L.W + x + 1] === 2);
        } else if (v === 3) {
          var surf = y === ty && (y === 0 || L.grid[(y - 1) * L.W + x] !== 3);
          ctx.fillStyle = 'rgba(54,140,150,.85)'; ctx.fillRect(px, py + (surf ? 8 : 0), TILE, TILE - (surf ? 8 : 0));
          if (surf) {
            ctx.fillStyle = '#7CC8C4'; var wv = reduceMotion ? 0 : Math.sin(gameT * 3 + x) * 2;
            ctx.fillRect(px, py + 7 + wv, TILE, 3);
            ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(px + 6 + (x % 3) * 6, py + 13, 8, 2);
          }
        }
      }
    }
  }
  function drawSolid(T, tk, x, y, top, bottom, left, right, h) {
    ctx.fillStyle = T.fill; ctx.fillRect(x, y, TILE, TILE);
    if (tk === 'stone') {
      ctx.fillStyle = T.fillDk; var off = (y / TILE) % 2 ? 0 : 16;
      ctx.fillRect(x, y + 15, TILE, 2); ctx.fillRect(x + off, y, 2, 15); ctx.fillRect(x + (off + 16) % 32, y + 17, 2, 15);
      ctx.fillStyle = T.speck; ctx.fillRect(x + 4, y + 3, 6, 2);
    } else if (tk === 'cliff') {
      ctx.fillStyle = T.speck; ctx.fillRect(x, y + 8, TILE, 3); ctx.fillRect(x, y + 22, TILE, 2);
      ctx.fillStyle = T.fillDk; ctx.fillRect(x + (h % 20), y + 14, 7, 3);
    } else {
      ctx.fillStyle = T.speck;
      ctx.fillRect(x + (h % 24) + 2, y + ((h >> 5) % 22) + 4, 5, 4);
      ctx.fillRect(x + ((h >> 9) % 22) + 3, y + ((h >> 13) % 20) + 6, 3, 3);
      if (tk === 'cave' && h % 7 === 0) { ctx.fillStyle = 'rgba(160,220,255,.55)'; ctx.fillRect(x + (h % 26) + 2, y + 10, 3, 3); }
    }
    var ink = 'rgba(14,26,43,.35)';
    if (left) { ctx.fillStyle = ink; ctx.fillRect(x, y, 2, TILE); }
    if (right) { ctx.fillStyle = ink; ctx.fillRect(x + TILE - 2, y, 2, TILE); }
    if (top) {
      if (tk === 'valley' || tk === 'stone') {
        ctx.fillStyle = T.top; ctx.fillRect(x, y, TILE, 9);
        ctx.fillStyle = T.topHi; ctx.fillRect(x, y, TILE, 3);
        ctx.fillStyle = T.top; ctx.beginPath();
        for (var i = 0; i < 4; i++) { ctx.moveTo(x + i * 8, y + 9); ctx.lineTo(x + i * 8 + 4, y + 13 + ((h >> i) & 3)); ctx.lineTo(x + i * 8 + 8, y + 9); }
        ctx.fill();
      } else {
        ctx.fillStyle = T.top; ctx.fillRect(x, y, TILE, 7);
        ctx.fillStyle = T.topHi; ctx.fillRect(x, y, TILE, 2);
      }
      ctx.fillStyle = 'rgba(14,26,43,.45)'; ctx.fillRect(x, y - 1, TILE, 1.5);
    }
    if (bottom && tk === 'cave') { // stalaktyty pod sufitem
      ctx.fillStyle = T.fill; ctx.beginPath();
      ctx.moveTo(x, y + TILE); ctx.lineTo(x + 8, y + TILE + 6 + (h % 10)); ctx.lineTo(x + 14, y + TILE);
      ctx.moveTo(x + 16, y + TILE); ctx.lineTo(x + 23, y + TILE + 4 + ((h >> 4) % 14)); ctx.lineTo(x + 30, y + TILE); ctx.fill();
    }
  }
  function drawPlatform(T, tk, x, y, l, r) {
    ctx.fillStyle = T.plat; ctx.fillRect(x, y, TILE, 11);
    ctx.fillStyle = T.platDk; ctx.fillRect(x, y + 8, TILE, 3);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x, y, TILE, 2);
    ctx.fillStyle = 'rgba(14,26,43,.4)';
    if (!l) ctx.fillRect(x, y, 2, 11);
    if (!r) ctx.fillRect(x + TILE - 2, y, 2, 11);
    if (tk === 'valley' || tk === 'cliff') { ctx.fillStyle = T.platDk; ctx.fillRect(x + 15, y + 2, 2, 6); }
  }

  function drawCoins() {
    L.coins.forEach(function (c) {
      if (c.taken || c.x < cam.x - 20 || c.x > cam.x + view.w + 20) return;
      var b = reduceMotion ? 0 : Math.sin(gameT * 3 + c.ph) * 2.5, y = c.y + b;
      ctx.fillStyle = '#3B2A00'; ctx.beginPath(); ell(ctx, c.x, y, 9, 7.5, 0); ctx.fill();
      ctx.fillStyle = '#FFC629'; ctx.beginPath(); ell(ctx, c.x, y, 7.5, 6, 0); ctx.fill();
      ctx.fillStyle = '#FFE48A'; ctx.beginPath(); ell(ctx, c.x - 2.5, y - 2, 3, 1.8, 0); ctx.fill();
    });
  }
  function drawEnemies() {
    L.enemies.forEach(function (e) {
      if (!e.alive) return;
      var ex = e.x || e.hx; if (ex < cam.x - 60 || ex > cam.x + view.w + 60) return;
      if (e.type === 'roller') {
        ctx.save(); ctx.translate(e.x, e.y);
        ctx.fillStyle = '#3F4756'; ctx.beginPath(); ell(ctx, 0, 0, e.r + 1.5, e.r + 1.5, 0); ctx.fill();
        ctx.fillStyle = '#A9B2BF'; ctx.beginPath(); ell(ctx, 0, 0, e.r, e.r, 0); ctx.fill();
        ctx.save(); ctx.rotate(e.rot); ctx.strokeStyle = '#7D8796'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(0, 1); ctx.lineTo(5, -2); ctx.moveTo(-2, 6); ctx.lineTo(3, 4); ctx.stroke(); ctx.restore();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ell(ctx, -4, -2, 3, 3.4, 0); ell(ctx, 3, -2, 3, 3.4, 0); ctx.fill();
        ctx.fillStyle = '#0E1A2B'; ctx.beginPath(); ell(ctx, -5, -1.5, 1.6, 2, 0); ell(ctx, 2, -1.5, 1.6, 2, 0); ctx.fill();
        ctx.restore();
      } else {
        var flap = reduceMotion ? .5 : (Math.sin(e.t * 18) * .5 + .5);
        ctx.save(); ctx.translate(e.x, e.y);
        ctx.fillStyle = '#2E3550';
        ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(-20, -8 + flap * 14); ctx.lineTo(-14, 2); ctx.lineTo(-8, 4); ctx.closePath();
        ctx.moveTo(4, -2); ctx.lineTo(20, -8 + flap * 14); ctx.lineTo(14, 2); ctx.lineTo(8, 4); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ell(ctx, 0, 0, 8.5, 8, 0); ctx.moveTo(-6, -5); ctx.lineTo(-4, -12); ctx.lineTo(-1, -6); ctx.moveTo(6, -5); ctx.lineTo(4, -12); ctx.lineTo(1, -6); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ell(ctx, -3, -1, 2.6, 2.8, 0); ell(ctx, 3, -1, 2.6, 2.8, 0); ctx.fill();
        ctx.fillStyle = '#0E1A2B'; ctx.beginPath(); ell(ctx, -2.6, -.6, 1.3, 1.6, 0); ell(ctx, 3.4, -.6, 1.3, 1.6, 0); ctx.fill();
        ctx.fillStyle = 'rgba(240,120,140,.7)'; ctx.beginPath(); ell(ctx, -5, 3, 1.6, 1, 0); ell(ctx, 5, 3, 1.6, 1, 0); ctx.fill();
        ctx.restore();
      }
    });
    L.drippers.forEach(function (d) {
      if (d.x < cam.x - 40 || d.x > cam.x + view.w + 40) return;
      ctx.fillStyle = '#6F84A8'; ctx.beginPath(); ctx.moveTo(d.x - 8, d.y - 1); ctx.lineTo(d.x, d.y + 16); ctx.lineTo(d.x + 8, d.y - 1); ctx.fill();
      var grow = d.drop ? 0 : clamp((d.t - (d.period - .8)) / .8, 0, 1);
      if (grow > 0) drawDrop(d.x, d.y + 16 + grow * 3, grow);
      if (d.drop) drawDrop(d.drop.x, d.drop.y, 1);
    });
  }
  function drawDrop(x, y, s) {
    ctx.fillStyle = '#9FD3F5'; ctx.strokeStyle = '#2C6E9C'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x, y - 8 * s); ctx.quadraticCurveTo(x + 5 * s, y, x, y + 4 * s); ctx.quadraticCurveTo(x - 5 * s, y, x, y - 8 * s); ctx.fill(); ctx.stroke();
  }
  function drawSprings() {
    L.springs.forEach(function (sp) {
      if (sp.x < cam.x - 40 || sp.x > cam.x + view.w + 40) return;
      var hgt = 14 - sp.squash * 7;
      ctx.strokeStyle = '#0B4EA2'; ctx.lineWidth = 3; ctx.beginPath();
      for (var i = 0; i <= 4; i++) { var yy = sp.y - i * hgt / 4; ctx.lineTo(sp.x + (i % 2 ? 9 : -9), yy); }
      ctx.stroke();
      ctx.fillStyle = '#3B2A00'; ctx.fillRect(sp.x - 17, sp.y - hgt - 5, 34, 7);
      ctx.fillStyle = '#FFC629'; ctx.fillRect(sp.x - 16, sp.y - hgt - 4, 32, 5);
      ctx.fillStyle = '#0B4EA2'; ctx.font = '900 15px system-ui,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('skrót', sp.x, sp.y - hgt - 10);
    });
    L.chests.forEach(function (ch) {
      if (ch.x < cam.x - 40 || ch.x > cam.x + view.w + 40) return;
      ctx.fillStyle = '#3B2A00'; ctx.fillRect(ch.x - 13, ch.y - 19, 26, 19);
      ctx.fillStyle = '#9A6A35'; ctx.fillRect(ch.x - 12, ch.y - 12, 24, 11);
      ctx.fillStyle = ch.open ? '#C99A2E' : '#FFC629';
      if (ch.open) ctx.fillRect(ch.x - 12, ch.y - 26, 24, 6); else ctx.fillRect(ch.x - 12, ch.y - 18, 24, 6);
      ctx.fillStyle = '#3B2A00'; ctx.fillRect(ch.x - 2, ch.y - 14, 4, 5);
    });
  }
  function drawGates() {
    L.gates.forEach(function (gt) {
      if (gt.x < cam.x - 80 || gt.x > cam.x + view.w + 80) return;
      var base = gt.g * TILE, H = 5.5 * TILE, x = gt.x, T = TER[L.sections[gt.sec].terrain];
      // kraty (podnoszą się po dobrej odpowiedzi)
      var lift = ease(gt.lift) * (H - 26);
      ctx.save(); ctx.beginPath(); ctx.rect(x - 4, base - H, 40, H); ctx.clip();
      for (var i = 0; i < 4; i++) {
        ctx.fillStyle = '#3B2A00'; ctx.fillRect(x + 1 + i * 8, base - H - lift, 6, H);
        ctx.fillStyle = '#C99A2E'; ctx.fillRect(x + 2 + i * 8, base - H - lift, 4, H);
      }
      ctx.fillStyle = '#3B2A00'; ctx.fillRect(x - 2, base - H * .35 - lift, 36, 5);
      ctx.restore();
      // filary
      [x - 12, x + 32].forEach(function (px) {
        ctx.fillStyle = 'rgba(14,26,43,.45)'; ctx.fillRect(px - 1, base - H - 1, 14, H + 1);
        ctx.fillStyle = T.top === '#3E9A5C' || T.top === '#3F9358' ? '#D9CDB4' : T.topHi; ctx.fillRect(px, base - H, 12, H);
        ctx.fillStyle = 'rgba(14,26,43,.12)'; for (var j = 1; j < 6; j++) ctx.fillRect(px, base - j * TILE, 12, 2);
      });
      ctx.fillStyle = 'rgba(14,26,43,.45)'; ctx.fillRect(x - 15, base - H - 14, 62, 16);
      ctx.fillStyle = '#E8DEC8'; ctx.fillRect(x - 14, base - H - 13, 60, 13);
      // medalion z pytajnikiem
      var my = base - H - 30, ok = gt.open;
      ctx.fillStyle = '#0E1A2B'; ctx.beginPath(); ell(ctx, x + 16, my, 19, 19, 0); ctx.fill();
      ctx.fillStyle = ok ? '#1F7A48' : '#0B4EA2'; ctx.beginPath(); ell(ctx, x + 16, my, 17, 17, 0); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '900 24px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ok ? '✓' : '?', x + 16, my + 1);
      ctx.textBaseline = 'alphabetic';
    });
  }
  function drawLandmarks() {
    L.landmarks.forEach(function (lm) {
      if (lm.x < cam.x - 160 || lm.x > cam.x + view.w + 160) return;
      var x = lm.x, y = lm.y, img = stopIcons[lm.sec];
      // słupek
      ctx.fillStyle = '#3B2A00'; ctx.fillRect(x - 4, y - 70, 8, 70);
      ctx.fillStyle = '#8C6A43'; ctx.fillRect(x - 3, y - 70, 6, 70);
      if (lm.done && (!celebration || celebration.lm !== lm)) {
        ctx.fillStyle = '#0E1A2B'; ctx.beginPath(); ell(ctx, x, y - 82, 17, 17, 0); ctx.fill();
        ctx.fillStyle = '#1F7A48'; ctx.beginPath(); ell(ctx, x, y - 82, 15, 15, 0); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '900 20px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✓', x, y - 81); ctx.textBaseline = 'alphabetic';
        return;
      }
      var bob = reduceMotion ? 0 : Math.sin(gameT * 2) * 3, S = 104;
      var gl = ctx.createRadialGradient(x, y - 128, 10, x, y - 128, 100);
      gl.addColorStop(0, 'rgba(255,198,41,.55)'); gl.addColorStop(1, 'rgba(255,198,41,0)');
      ctx.fillStyle = gl; ctx.fillRect(x - 100, y - 228, 200, 200);
      ctx.save(); ctx.translate(x, y - 128 + bob); ctx.rotate(-.06);
      drawSticker(ctx, img, S);
      ctx.restore();
    });
  }
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function drawSticker(c, img, S) {
    c.fillStyle = 'rgba(6,42,88,.3)'; roundRect(c, -S / 2 + 2, -S / 2 + 5, S, S, S * .12); c.fill();
    c.fillStyle = '#fff'; roundRect(c, -S / 2, -S / 2, S, S, S * .12); c.fill();
    c.strokeStyle = '#D3DDEA'; c.lineWidth = Math.max(1, S * .02); c.stroke();
    if (img && img.complete && img.naturalWidth) c.drawImage(img, -S * .44, -S * .44, S * .88, S * .88);
  }
  function drawPlayer() {
    if (P.inv > 0 && P.nap <= 0 && Math.floor(P.inv * 10) % 2 === 0) return;
    var kind;
    if (P.nap > 0) kind = 'nap';
    else if (P.hurtT > 0) kind = 'hurt';
    else if (!P.onGround) kind = (curPower() === 'glide' && input.jump && P.vy >= 80) ? 'glide' : P.vy < 0 ? 'jump' : 'fall';
    else kind = Math.abs(P.vx) > 15 ? 'walk' : 'idle';
    var pose = quoPose(kind, P.t, { phase: P.phase, land: P.land });
    // cień
    ctx.fillStyle = 'rgba(14,26,43,.18)'; ctx.beginPath(); ell(ctx, P.x, groundBelow(P.x, P.y) - 1, 12, 3, 0); ctx.fill();
    drawQuo(ctx, P.x, P.y, 1, P.facing, pose, P.nap > 0 ? clamp(P.nap / 1.4 + .3, 0, 1) : null);
  }
  function groundBelow(x, y) {
    for (var r = Math.floor(y / TILE); r < ROWS; r++) { var v = tileAt(Math.floor(x / TILE), r); if (v === 1 || v === 2) return r * TILE; }
    return ROWS * TILE + 200;
  }
  function drawParticles() {
    particles.forEach(function (p) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.col; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    });
    ctx.globalAlpha = 1;
  }

  /* ---------- 8. Świętowanie przystanku ---------- */
  var CELEB_T = reduceMotion ? 2.6 : 3.8;
  function startCelebration(lm) {
    state = 'celebrate';
    input.left = input.right = false;
    var conf = [];
    if (!reduceMotion) for (var i = 0; i < 90; i++) conf.push({ x: Math.random(), y: -Math.random() * .6, vx: (Math.random() - .5) * .15, vy: .18 + Math.random() * .25, rot: Math.random() * 6, vr: (Math.random() - .5) * 8, col: ['#FFC629', '#0B4EA2', '#C81E36', '#1F7A48', '#FFFFFF'][i % 5], w: 6 + Math.random() * 6 });
    celebration = { lm: lm, t: 0, conf: conf, dance: 'dance' + (lm.sec % 4), counted: false };
    var ct = $('celebrateText');
    ct.innerHTML = '<b>Brawo!</b><span>Naklejka: ' + esc(lm.stop.name) + '</span><small>Dotknij, aby pominąć</small>';
    ct.hidden = false; $('hudStop').style.visibility = 'hidden'; $('pad').style.visibility = 'hidden';
    sfx('fanfare');
  }
  function updateCelebration(dt) {
    var C = celebration; C.t += dt;
    C.conf.forEach(function (p) { p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; if (p.y > 1.1) { p.y = -.1; p.x = Math.random(); } });
    if (!C.counted && C.t >= CELEB_T - .5) countSticker();
    if (C.t >= CELEB_T) endCelebration();
  }
  function countSticker() {
    var C = celebration; if (C.counted) return; C.counted = true;
    stats.stickers.push(C.lm.sec); updateHUD();
    var a = $('hudAlbum'); a.classList.remove('pulse'); void a.offsetWidth; a.classList.add('pulse');
    sfx('coin');
  }
  function endCelebration() {
    if (!celebration) return;
    countSticker();
    var lm = celebration.lm; celebration = null;
    $('celebrateText').hidden = true; $('hudStop').style.visibility = ''; $('pad').style.visibility = '';
    addCoins(5);
    P.checkpoint = { x: lm.x + 40, y: GROUND * TILE };
    if (lm.sec >= L.sections.length - 1) { endGame(); return; }
    state = 'play';
  }
  function renderCelebration() {
    var C = celebration; if (!C) return;
    var k = view.s * view.dpr, W = view.w, H = view.h, t = C.t;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    var sec = L.sections[C.lm.sec];
    // 1) tło przystanku
    var fadeIn = reduceMotion ? 1 : ease(t / .35);
    ctx.globalAlpha = fadeIn;
    drawBackground(ctx, sec.terrain, cam.x, cam.y, W, H, gameT);
    var wash = ctx.createRadialGradient(W / 2, H * .5, 10, W / 2, H * .5, Math.max(W, H) * .7);
    wash.addColorStop(0, sec.terrain === 'cave' ? 'rgba(80,140,220,.35)' : 'rgba(255,255,255,.55)'); wash.addColorStop(1, 'rgba(6,42,88,.35)');
    ctx.fillStyle = wash; ctx.fillRect(0, 0, W, H);
    // promienie
    if (!reduceMotion) {
      ctx.save(); ctx.translate(W / 2, H * .5); ctx.rotate(t * .4);
      ctx.fillStyle = 'rgba(255,198,41,.22)';
      for (var i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.max(W, H), -60); ctx.lineTo(Math.max(W, H), 60); ctx.fill(); }
      ctx.restore();
    }
    // 2) duża ikona przystanku (naklejka) za Quo — na końcu odlatuje do albumu
    var wide = view.cssH < 520 && W > H * 1.3; // niski ekran poziomo: naklejka z lewej, Quo z prawej
    var S = wide ? Math.min(W * .36, H * .56) : Math.min(W * .78, H * .48), cx = wide ? W * .32 : W / 2, cy = wide ? H * .6 : H * .46;
    var flyStart = CELEB_T - 1.3, f = reduceMotion ? 0 : clamp((t - flyStart) / .8, 0, 1);
    var tgt = albumTarget();
    var pop = reduceMotion ? 1 : ease(t / .5) * (1 + .06 * Math.sin(Math.min(t, 1.2) * 10) * (1 - Math.min(t, 1.2) / 1.2));
    var sx = lerp(cx, tgt.x, ease(f)), sy = lerp(cy, tgt.y, ease(f)) - Math.sin(f * Math.PI) * H * .12, ss = lerp(S * pop, 28, ease(f));
    if (f < 1) { ctx.save(); ctx.translate(sx, sy); ctx.rotate(-.05 + f * .4); drawSticker(ctx, stopIcons[C.lm.sec], ss); ctx.restore(); }
    // 3) Quo tańczy z przodu
    var qScale = wide ? H * .6 / 66 : Math.min(H * .4, W * .55) / 66;
    var pose = reduceMotion ? quoPose('cheer', 0) : quoPose(C.dance, t);
    var qx = wide ? W * .66 : W / 2, qy = wide ? H * .95 : Math.min(H * .94, cy + S * .5 + qScale * 46);
    ctx.fillStyle = 'rgba(14,26,43,.22)'; ctx.beginPath(); ell(ctx, qx, qy, qScale * 16, qScale * 3.5, 0); ctx.fill();
    drawQuo(ctx, qx, qy, qScale, wide ? -1 : 1, pose);
    // 4) konfetti
    C.conf.forEach(function (p) {
      ctx.save(); ctx.translate(p.x * W, p.y * H); ctx.rotate(p.rot); ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2); ctx.restore();
    });
    ctx.globalAlpha = 1;
  }
  function albumTarget() {
    var r = $('hudAlbum').getBoundingClientRect();
    return { x: (r.left + 22) / view.s, y: (r.top + r.height / 2) / view.s };
  }

  /* ---------- 9. Interfejs ---------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var toastTimer = null;
  function toast(msg, ms) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 2600);
  }
  function updateHUD() {
    if (!P) return;
    $('hudHearts').textContent = Math.max(0, P.hearts);
    $('hudCoins').textContent = stats.coins;
    $('hudStickers').textContent = stats.stickers.length + '/' + L.sections.length;
  }
  function enterSection(si) {
    curSec = si;
    var S = L.sections[si];
    $('hudStop').textContent = 'Przystanek ' + (si + 1) + ' z ' + L.sections.length + ' · ' + S.stop.name;
    var hp = $('hudPower');
    if (S.power) { hp.hidden = false; hp.innerHTML = '<span aria-hidden="true">' + POWER[S.power].icon + '</span> <span class="pw-name">' + esc(POWER[S.power].name) + '</span>'; hp.title = POWER[S.power].name; }
    else hp.hidden = true;
    var msg = S.stop.name;
    if (S.power) msg += ' · moc z zadania foto: ' + POWER[S.power].name;
    else if (S.terrain === 'cave') msg += ' · ciemno! Zadanie foto dałoby latarkę';
    if (S.shortcut) msg += ' · szukaj trampoliny „skrót”!';
    toast(msg, 3600);
    P.checkpoint = { x: Math.max(P.checkpoint.x, S.checkpoint.x), y: GROUND * TILE };
  }

  function shuffledAnswers(q) {
    var a = q.answers.map(function (txt, i) { return { txt: txt, ok: i === q.correct }; });
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function openQuiz(gate) {
    state = 'quiz'; quizGate = gate;
    input.left = input.right = input.jump = false; P.vx = 0;
    var q = gate.quest, box = $('quizAnswers');
    $('quizStop').textContent = 'Przystanek ' + (gate.sec + 1) + ' · ' + L.sections[gate.sec].stop.name;
    $('quizQ').textContent = q.q;
    var hint = $('quizHint'); hint.textContent = ''; hint.className = 'quiz-hint';
    box.innerHTML = '';
    shuffledAnswers(q).forEach(function (a) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'answer'; b.textContent = a.txt;
      b.addEventListener('click', function () { answer(b, a.ok); });
      box.appendChild(b);
    });
    $('quizScreen').hidden = false;
    setPad(false);
    setTimeout(function () { var f = box.querySelector('button'); if (f) f.focus({ preventScroll: true }); }, 30);
    sfx('gate');
  }
  function answer(btn, ok) {
    if (btn.disabled || !quizGate) return;
    var gate = quizGate, hint = $('quizHint');
    if (ok) {
      var bonus = gate.tries ? 2 : 5;
      if (!gate.tries) stats.firstTry++;
      btn.classList.add('yes');
      Array.prototype.forEach.call($('quizAnswers').children, function (b) { b.disabled = true; });
      hint.className = 'quiz-hint good'; hint.textContent = 'Brawo! Brama się otwiera · +' + bonus + ' kamyczków';
      sfx('ok');
      quizGate = null;
      setTimeout(function () {
        $('quizScreen').hidden = true; setPad(true);
        gate.open = true; stats.gates++;
        addCoins(bonus, gate.x + 16, gate.g * TILE - 150);
        P.checkpoint = { x: gate.x + 56, y: gate.g * TILE };
        input.jumpPressed = false;
        state = 'play';
      }, reduceMotion ? 700 : 1100);
    } else {
      gate.tries++;
      btn.classList.add('no'); btn.disabled = true;
      hint.textContent = 'Prawie! Podpowiedź: ' + gate.quest.hint;
      sfx('no');
    }
  }

  function endGame() {
    state = 'end';
    setPad(false); $('hud').hidden = true;
    var mins = Math.floor(gameT / 60), secs = Math.floor(gameT % 60);
    var rec = lsJSON(LS + trip.trip) || { best: 0, plays: 0 };
    rec.plays = (rec.plays || 0) + 1; rec.best = Math.max(rec.best || 0, stats.coins);
    rec.stickers = L.sections.map(function (s) { return s.stop.key; });
    lsSet(LS + trip.trip, JSON.stringify(rec));
    $('albumGrid').innerHTML = L.sections.map(function (s) {
      return '<div class="sticker"><img src="' + ICONS + 'icon-' + esc(s.stop.icon) + '-128.webp" alt="" width="120" height="120"><p>' + esc(s.stop.name) + '</p></div>';
    }).join('');
    $('totals').innerHTML =
      '<div><span>Kamyczki</span><b>' + stats.coins + '</b></div>' +
      '<div><span>Bramy z pytaniami</span><b>' + stats.gates + ' / ' + L.gates.length + '</b></div>' +
      '<div><span>Za pierwszym razem</span><b>' + stats.firstTry + '</b></div>' +
      '<div><span>Czas wyprawy</span><b>' + mins + ':' + (secs < 10 ? '0' : '') + secs + '</b></div>' +
      '<div><span>Najlepszy wynik</span><b>' + rec.best + '</b></div>';
    $('endScreen').hidden = false;
    sfx('fanfare');
    setTimeout(function () { $('btnAgain').focus({ preventScroll: true }); }, 50);
  }

  function renderBonus() {
    var p = readProgress(trip, demo), el = $('bonusList');
    var powers = trip.stops.filter(function (s, i) { return p.stops[i].photo && s.powerup; }).map(function (s) { return POWER[s.powerup].name.split(' —')[0]; });
    var html = '';
    if (!p.found && !demo) html += '<p>Na tym telefonie nie ma jeszcze punktów z wycieczki. Gra działa i bez nich — jest tylko trochę trudniej.</p>';
    else html += '<p>Punkty z waszej wycieczki:</p>';
    html += '<div class="row' + (p.missions ? '' : ' off') + '"><i>❤️</i>Misje: ' + p.missions + ' z ' + p.missionsTotal + ' → +' + p.missions + ' serduszek</div>';
    html += '<div class="row' + (p.photos ? '' : ' off') + '"><i>📷</i>Zadania foto: ' + p.photos + ' z ' + p.photosTotal + (powers.length ? ' → ' + powers.join(', ') : ' → brak mocy') + '</div>';
    html += '<div class="row' + (p.full ? '' : ' off') + '"><i>⭐</i>Całe przystanki: ' + p.full + ' z ' + trip.stops.length + ' → tajne skróty</div>';
    el.innerHTML = html;
  }

  function newGame() {
    prog = readProgress(trip, demo);
    var rec = lsJSON(LS + trip.trip) || {};
    playNo = rec.plays || 0;
    L = buildLevel(trip, prog, playNo);
    P = newPlayer();
    stats = { coins: 0, stickers: [], gates: 0, firstTry: 0 };
    particles = []; celebration = null; curSec = -1; gameT = 0;
    cam.x = 0; cam.y = 0; updateCamera(1);
    stopIcons = trip.stops.map(function (s) { var im = new Image(); im.src = ICONS + 'icon-' + s.icon + '-256.webp'; return im; });
    ['startScreen', 'endScreen', 'pauseScreen', 'quizScreen'].forEach(function (id) { $(id).hidden = true; });
    $('celebrateText').hidden = true;
    $('hud').hidden = false; setPad(true);
    updateHUD();
    state = 'play';
  }

  function setPad(on) { $('pad').hidden = !(on && padWanted()); resize(); }
  function pause() {
    if (state !== 'play' && state !== 'celebrate') return;
    prevState = state; state = 'pause'; input.left = input.right = input.jump = false;
    $('pauseScreen').hidden = false; setPad(false);
    setTimeout(function () { $('btnResume').focus({ preventScroll: true }); }, 30);
  }
  function resume() { if (state !== 'pause') return; $('pauseScreen').hidden = true; setPad(true); state = prevState; }

  /* ---------- 10. Sterowanie ---------- */
  var KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'jump', ArrowUp: 'jump', KeyW: 'jump' };
  window.addEventListener('keydown', function (e) {
    if (state === 'celebrate' && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) { e.preventDefault(); endCelebration(); return; }
    if (e.code === 'KeyP' || e.code === 'Escape') { if (state === 'pause') resume(); else pause(); return; }
    var k = KEYS[e.code]; if (!k) return;
    if (state === 'play') e.preventDefault();
    if (k === 'jump' && !e.repeat && !input.jump) input.jumpPressed = true;
    input[k] = true;
  });
  window.addEventListener('keyup', function (e) { var k = KEYS[e.code]; if (k) input[k] = false; });
  window.addEventListener('blur', function () { input.left = input.right = input.jump = false; });
  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); });

  function bindPad(id, key) {
    var b = $(id);
    function down(e) { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (x) {} if (key === 'jump' && !input.jump) input.jumpPressed = true; input[key] = true; b.classList.add('on'); }
    function up() { input[key] = false; b.classList.remove('on'); }
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  bindPad('padLeft', 'left'); bindPad('padRight', 'right'); bindPad('padJump', 'jump');
  cv.addEventListener('pointerdown', function () { if (state === 'celebrate') endCelebration(); });
  $('celebrateText').addEventListener('pointerdown', function () { if (state === 'celebrate') endCelebration(); });

  /* ---------- 11. Dźwięk ---------- */
  var AC = null, soundOn = false; // dźwięk zawsze startuje wyłączony
  var SFX = {
    jump: [[520, .07], [780, .06]], jump2: [[700, .05], [1040, .06]], coin: [[988, .05], [1319, .09]], hit: [[260, .1], [196, .16]],
    bump: [[330, .06], [262, .08]], pop: [[660, .04], [880, .05]], ok: [[523, .1], [659, .1], [784, .18]], no: [[392, .12], [349, .16]],
    gate: [[392, .07], [523, .09]], fanfare: [[523, .11], [659, .11], [784, .11], [1047, .3]], spring: [[300, .05], [600, .05], [900, .08]], drip: [[1400, .03]]
  };
  function sfx(name) {
    if (!soundOn || !AC) return;
    var t = AC.currentTime;
    (SFX[name] || []).forEach(function (n) {
      var o = AC.createOscillator(), g = AC.createGain();
      o.type = 'triangle'; o.frequency.value = n[0];
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.14, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + n[1]);
      o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + n[1] + .02);
      t += n[1] * .9;
    });
  }
  function setSound(on) {
    soundOn = on;
    if (on && !AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
    if (AC && AC.state === 'suspended') AC.resume();
    ['btnSound', 'btnSound2'].forEach(function (id) { $(id).textContent = 'Dźwięk: ' + (on ? 'włączony' : 'wyłączony'); $(id).setAttribute('aria-pressed', on ? 'true' : 'false'); });
    if (on) sfx('coin');
  }

  /* ---------- 12. Pętla gry i start ---------- */
  var last = 0, acc = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    var t = ts / 1000, d = Math.min(.25, t - (last || t)); last = t;
    if (state === 'loading') return;
    if (state === 'play') { acc += d; while (acc >= DT) { step(DT); acc -= DT; if (state !== 'play') { acc = 0; break; } } }
    else if (state === 'celebrate') { acc += d; while (acc >= DT && state === 'celebrate') { updateCelebration(DT); updateParticles(DT); acc -= DT; } }
    else acc = 0;
    if (L && P) render();
  }

  function boot() {
    genBackgrounds();
    demo = lsGet(LS + 'demo') === '1';
    $('demoToggle').checked = demo;
    $('demoToggle').addEventListener('change', function (e) { demo = e.target.checked; lsSet(LS + 'demo', demo ? '1' : '0'); renderBonus(); });
    $('btnStart').addEventListener('click', function () { if (soundOn) setSound(true); newGame(); });
    $('btnSound').addEventListener('click', function () { setSound(!soundOn); });
    $('btnSound2').addEventListener('click', function () { setSound(!soundOn); });
    $('btnPause').addEventListener('click', pause);
    $('btnResume').addEventListener('click', resume);
    $('btnRestart').addEventListener('click', function () { newGame(); });
    $('btnAgain').addEventListener('click', function () { newGame(); });
    window.addEventListener('resize', resize);
    resize();
    fetch(DATA_URL).then(function (r) { return r.json(); }).then(function (data) {
      trip = data;
      renderBonus();
      buildRig(function () {
        // tło startowe: poziom w tle za kartą
        prog = readProgress(trip, demo); L = buildLevel(trip, prog, 0); P = newPlayer(); stats = { coins: 0, stickers: [], gates: 0, firstTry: 0 };
        stopIcons = trip.stops.map(function (s) { var im = new Image(); im.src = ICONS + 'icon-' + s.icon + '-256.webp'; return im; });
        updateCamera(1);
        state = 'menu';
      });
    }).catch(function () { toast('Nie udało się wczytać danych wycieczki.', 8000); });
    requestAnimationFrame(frame);
  }

  // Dostęp do stanu dla testów automatycznych (bez wpływu na grę)
  window.__quoGame = {
    get state() { return state; }, get player() { return P; }, get level() { return L; }, get stats() { return stats; },
    skipCelebration: function () { if (state === 'celebrate') endCelebration(); },
    tileAt: function (x, y) { return tileAt(x, y); }
  };
  boot();
})();
