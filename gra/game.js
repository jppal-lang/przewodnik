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
  var TILE = 32, ROWS = 14, GROUND = 11;
  var DT = 1 / 60;
  var G = 1900, JUMP_V = 660, RUN = 200, MAX_FALL = 900, SPRING_V = 1010;
  /* Poziomy trudności. sec = długość przystanku w kaflach; hearts/cap = serduszka na start / limit z misjami;
     spd = szybkość przeciwników; dens > 1 = więcej przeszkód; adv = zaawansowane klocki + mini-wyzwania;
     opts = liczba odpowiedzi; qPerGate = pytania na bramę; cpGates = punkt kontrolny za bramą. */
  var DIFF = {
    easy:   { key: 'easy', label: 'Łatwy', ages: '5–7 lat', sec: 170, hearts: 5, cap: 12, spd: 1, dens: 0, adv: false, opts: 3, qPerGate: 1, freeHint: true,
      cpGates: true, cpCeleb: true, crumbleT: .6, parMul: 1.9, wind: 0, organN: 3 },
    medium: { key: 'medium', label: 'Średni', ages: '8–10 lat', sec: 250, hearts: 3, cap: 8, spd: 1.25, dens: 1, adv: true, opts: 4, qPerGate: 1, freeHint: false,
      cpGates: true, cpCeleb: true, crumbleT: .45, parMul: 1.45, wind: 80, doorT: 9, bridgeV: 135, boulderV: 160, organN: 4 },
    hard:   { key: 'hard', label: 'Trudny', ages: '11+', sec: 290, hearts: 2, cap: 5, spd: 1.55, dens: 1.5, adv: true, opts: 4, qPerGate: 2, freeHint: false,
      cpGates: false, cpCeleb: false, crumbleT: .3, parMul: 1.35, wind: 100, doorT: 7, bridgeV: 160, boulderV: 178, organN: 5 }
  };
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
    glide: { name: 'Szybowanie — trzymaj skok', icon: '🍃' },
    balloon: { name: 'Balonik — trzymaj skok, by lecieć', icon: '🎈' }
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

  var rigImg = {}, curHat = null;
  /* Czapki Quo (tylko wygląd). Rysowane w układzie głowy (staw szyi = 0,0), jak część „head”. */
  function drawHat(c, kind) {
    c.lineWidth = 1.3; c.strokeStyle = QC.line;
    if (kind === 'helmet') {
      c.fillStyle = '#FFC629'; c.beginPath(); c.ellipse(2, -22, 15, 11, 0, Math.PI, 0); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#C99A2E'; c.fillRect(-14, -23, 32, 3.5); c.strokeRect(-14, -23, 32, 3.5);
      c.fillStyle = '#fff'; c.beginPath(); c.arc(14, -27, 3.6, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,240,170,.5)'; c.beginPath(); c.moveTo(17, -29); c.lineTo(32, -36); c.lineTo(32, -20); c.closePath(); c.fill();
    } else if (kind === 'hood') {
      c.fillStyle = '#6B4A2E';
      c.beginPath(); c.arc(1, -14, 17.5, Math.PI * .92, Math.PI * 1.9); c.arc(4, -12, 12.5, Math.PI * 1.85, Math.PI * .95, true); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.ellipse(-11, -5, 6, 10, .2, 0, Math.PI * 2); c.fill(); c.stroke();
    } else if (kind === 'explorer') {
      c.fillStyle = '#C9A66B'; c.beginPath(); c.ellipse(2, -24, 20, 4, -.05, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-8, -24); c.lineTo(-7, -35); c.quadraticCurveTo(2, -39, 11, -35); c.lineTo(12, -24); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#C81E36'; c.fillRect(-8, -29, 20, 3.5);
    }
  }
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
      if (curHat && (name === 'head' || name === 'headBlink')) drawHat(c, curHat);
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

  /* ---------- 5. Budowa poziomu z danych wycieczki ----------
     Typy kafli: 0 pusto, 1 skała, 2 kładka (wchodzi się od dołu), 3 woda,
     4 krucha półka (spada chwilę po wejściu), 5 mokra skała (ślisko),
     6 fałszywa ściana (wygląda jak skała, da się przejść — sekret), 7 kolce (na ziemi albo zwisające),
     8 skrzynia zamknięta (otwiera się uderzeniem od dołu albo skokiem z góry), 9 skrzynia otwarta. */
  var SOLID = [0, 1, 0, 0, 0, 1, 0, 0, 1, 1], ONEWAY = [0, 0, 1, 0, 1, 0, 0, 0, 0, 0];
  var PU_KINDS = ['magnet', 'doublejump', 'glide', 'balloon'];
  /* Skarb Quo (decyzja JP 2026-10-26): ukryta komnata tylko na Trudnym, dostępna wyłącznie balonikiem.
     Budowana dopiero od startu płatności (1.06.2027) albo z ?skarb=1 w adresie (test JP). Wcześniej: ani komnaty, ani podpowiedzi. */
  var TREASURE_FROM = '2027-06-01';
  function treasureOn() {
    var d = new Date(), today = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    return today >= TREASURE_FROM || /[?&]skarb=1(&|$)/.test(location.search);
  }

  function buildLevel(trip, prog, playNo, D) {
    var n = trip.stops.length, SL = D.sec, W = SL * n + 18;
    var L = { W: W, SL: SL, grid: new Uint8Array(W * ROWS), sec: new Uint8Array(W), crumbleAt: new Int16Array(W * ROWS).fill(-1),
      sections: [], coins: [], enemies: [], drippers: [], gates: [], springs: [], chests: [], landmarks: [], movers: [], crumbles: [],
      winds: [], rocks: [], hidden: [], minis: [], zips: [], carts: [], items: [], chestList: [], chestAt: new Int16Array(W * ROWS).fill(-1),
      plaques: [], raftRocks: [], treasure: null };
    // Skarb Quo: pierwszy przystanek w wąwozie (inaczej pierwszy poza jaskinią)
    var tSec = -1;
    if (D.key === 'hard' && treasureOn()) {
      trip.stops.forEach(function (s, i) { if (tSec < 0 && TERRAIN_BY_CATEGORY[s.category] === 'valley') tSec = i; });
      if (tSec < 0) trip.stops.forEach(function (s, i) { if (tSec < 0 && TERRAIN_BY_CATEGORY[s.category] !== 'cave') tSec = i; });
    }
    function set(x, y, v) { if (x >= 0 && x < W && y >= 0 && y < ROWS) L.grid[y * W + x] = v; }
    function get(x, y) { return (x >= 0 && x < W && y >= 0 && y < ROWS) ? L.grid[y * W + x] : 0; }
    function ground(x, g, top) { for (var y = 0; y < ROWS; y++) if (y >= g) set(x, y, y === g && top ? top : 1); }
    function clearCol(x, from, to) { for (var y = from; y <= to; y++) set(x, y, 0); }
    function coin(tx, ty) { L.coins.push({ x: tx * TILE + 16, y: ty * TILE + 16, taken: false, ph: tx * .7 }); }
    function crumble(x, y, fast) { set(x, y, 4); L.crumbleAt[y * W + x] = L.crumbles.length; L.crumbles.push({ x: x, y: y, s: 0, t: 0, fast: !!fast, keep: !!fast }); }
    function water(x) { set(x, 12, 3); set(x, 13, 3); }

    trip.stops.forEach(function (stop, si) {
      var x0 = si * SL, terr = TERRAIN_BY_CATEGORY[stop.category] || 'valley', R = rng(hash(trip.trip + ':' + stop.key + ':' + D.key));
      var pr = prog.stops[si] || {};
      var S = { i: si, x0: x0, x1: x0 + SL, terrain: terr, power: pr.photo ? stop.powerup : null, shortcut: !!pr.all, gates: [],
        time: 0, par: 0, hidden: 0, done: false, stars: 0 };
      L.sections.push(S);
      for (var c = x0; c < x0 + SL; c++) L.sec[c] = si;
      var cave = terr === 'cave', spd = D.spd, ceilRow = cave ? 2 : 0;
      if (cave) for (c = x0; c < x0 + SL; c++) { set(c, 0, 1); set(c, 1, 1); }
      // pytania: rotacja po liście, na Trudnym 2 pytania na bramę
      var nq = stop.quests.length, ng = Math.min(2, Math.floor(nq / D.qPerGate)), rot = (playNo * ng * D.qPerGate) % nq;
      var gf = cave ? [.18, .8] : [.3, .6];
      var gateCols = ng === 2 ? [x0 + Math.round(SL * gf[0]), x0 + Math.round(SL * gf[1])] : ng === 1 ? [x0 + Math.round(SL * .5)] : [];
      var gateDefs = gateCols.map(function (c) { return { col: c, kind: 'quiz' }; });
      if (cave) { gateDefs.push({ col: x0 + Math.round(SL * (D.adv ? .45 : .5)), kind: 'organ' }); gateDefs.push({ col: x0 + Math.round(SL * (D.adv ? .68 : .64)), kind: 'rope' }); }
      if (terr === 'valley' || terr === 'cliff') gateDefs.push({ col: x0 + Math.round(SL * .45), kind: 'push' });
      gateDefs.sort(function (a, b) { return a.col - b.col; });
      var landX = x0 + SL - 9;
      var MINI_W = { valley: 38, cave: 32, stone: 32, cliff: 14 };
      var miniX = D.adv ? landX - MINI_W[terr] : landX - 3;
      var hpos = [.14, .44, .76].map(function (f) { return x0 + Math.round(f * (miniX - x0)); });
      var htypes = ['secret', 'tower', 'skygap']; for (var hi = 2; hi > 0; hi--) { var hj = Math.floor(R() * (hi + 1)); var tt = htypes[hi]; htypes[hi] = htypes[hj]; htypes[hj] = tt; }
      var g = GROUND, x = x0, gi = 0, hk = 0, fk = 0;
      var span = miniX - x0, forced = [];
      hpos.forEach(function (p, i) { forced.push({ at: p, name: htypes[i], hid: true }); });
      forced.push({ at: x0 + Math.round(.06 * span), name: 'chestPU' });
      forced.push(si === tSec ? { at: x0 + Math.round(.18 * span), name: 'treasureIsland', pri: 1 } : { at: x0 + Math.round(.18 * span), name: 'skyIsland' });
      if (terr === 'valley' || terr === 'cliff') forced.push({ at: x0 + Math.round(.5 * span), name: 'zipline' });
      if (terr === 'stone') forced.push({ at: x0 + Math.round(.2 * span), name: 'mosaic' });
      if (cave && D.adv) { forced.push({ at: x0 + Math.round(SL * .19), name: 'raft', pri: 1 }); forced.push({ at: x0 + Math.round(SL * .46), name: 'mine', pri: 1 }); }
      if (!cave) forced.push({ at: x0 + Math.round(.62 * span), name: 'chestPU' });
      forced.forEach(function (f) { if (f.name === 'zipline' || f.name === 'mosaic') f.pri = 1; });
      forced.sort(function (a, b) { return a.at - b.at; });
      for (; x < x0 + 8; x++) ground(x, g);
      if (si === 0) { coin(x0 + 5, g - 2); coin(x0 + 6, g - 2); coin(x0 + 7, g - 2); }

      function flat(w, top) { for (var i = 0; i < w; i++) ground(x + i, g, top); }
      function hide(tx, ty) { L.hidden.push({ x: tx * TILE + 16, y: ty * TILE + 16, taken: false, sec: si }); }
      function enemy(o) { o.sec = si; o.alive = true; L.enemies.push(o); return o; }
      function beetle(cx0, cx1, row, spiky) { return enemy({ type: spiky ? 'spiky' : 'beetle', x: (cx0 + 1) * TILE, y: row * TILE, x0: cx0 * TILE + 12, x1: (cx1 + 1) * TILE - 12, vx: (spiky ? 38 : 55) * spd }); }
      function bat(cx, row, swoop) { return enemy({ type: 'bat', mode: swoop ? 'swoop' : 'sine', hx: cx * TILE, hy: row * TILE, x: cx * TILE, y: row * TILE, t: R() * 6, flee: 0, cool: 0, st: 0, st_t: 0, tx: 0, ty: 0 }); }
      function rock(cx) { L.rocks.push({ x: cx * TILE + 16, y0: cave ? 2 * TILE + 14 : -24, y: 0, vy: 0, s: 0, t: 0, sec: si, warn: .75 / Math.sqrt(spd) }); }
      function dripper(cx, row, per) { L.drippers.push({ x: cx * TILE + 16, y: row * TILE, period: per / spd, t: R() * 2, drop: null }); }
      function mover(px, py, w, axis, range, period) {
        L.movers.push({ x: px, y: py, w: w, ax: axis, bx: px, by: py, range: range, w2: Math.PI * 2 / (period / Math.sqrt(spd)), ph: R() * 6, dx: 0, dy: 0, log: false, sec: si });
        return L.movers[L.movers.length - 1];
      }
      var pit = function (tx) { if (terr === 'stone' || (cave && R() < .5)) water(tx); };
      function chest(cx, cy, content, locked) { set(cx, cy, 8); L.chestAt[cy * W + cx] = L.chestList.length; L.chestList.push({ x: cx, y: cy, content: content, open: false, locked: !!locked, sec: si }); return L.chestList.length - 1; }
      function puFor() { return cave ? pick(R, ['lantern', 'balloon', 'doublejump']) : pick(R, PU_KINDS); }
      var hatHere = terr === 'valley' ? 'explorer' : (cave && !D.adv) ? 'helmet' : null;

      /* --- klocki poziomu --- */
      var CH = {
        flat: [6, function () { var w = 3 + Math.floor(R() * 3); flat(w); if (R() < .6) for (var i = 1; i < w - 1; i++) coin(x + i, g - 2); return w; }],
        step: [6, function () {
          var d = pick(R, terr === 'cliff' ? [-1, -1, -2, 1] : [-1, 1, -2, 2]);
          g = clamp(g + d, D.adv ? 7 : 8, 12); var w = 4 + Math.floor(R() * 2); flat(w); coin(x + 1, g - 2); return w;
        }],
        gap: [6, function () {
          var g2 = clamp(g + pick(R, [-1, 0, 0, 1]), 8, 12), w = g2 < g ? 2 : 2 + Math.floor(R() * 2);
          for (var i = 0; i < w; i++) pit(x + i);
          coin(x + Math.floor(w / 2), g - 3); x += w; g = g2; flat(2); return 2;
        }],
        runGap: [9, function () { // przepaść na rozbieg: 4 kafle
          var g2 = Math.max(g, clamp(g + pick(R, [0, 0, 1]), 8, 12));
          flat(3); x += 3; for (var i = 0; i < 4; i++) pit(x + i);
          coin(x + 1, g - 3); coin(x + 2, g - 3); x += 4; g = g2; flat(2); return 2;
        }],
        bridge: [7, function () {
          var w = 6; for (var i = 0; i < w; i++) { clearCol(x + i, g, 13); set(x + i, g, 2); water(x + i); if (i % 2) coin(x + i, g - 2); }
          return w;
        }],
        float: [7, function () {
          var w = 4; set(x + 1, g - 2, 2); set(x + 2, g - 2, 2); coin(x + 1, g - 3); coin(x + 2, g - 3);
          for (var i = 0; i < w; i++) pit(x + i);
          x += w; flat(2); return 2;
        }],
        ledges: [8, function () { var w = 7; flat(w); for (var i = 2; i <= 4; i++) { set(x + i, g - 3, 2); coin(x + i, g - 4); } return w; }],
        roller: [8, function () {
          var w = 7; flat(w); enemy({ type: 'roller', x: (x + 6) * TILE + 16, y: g * TILE - 12, vx: 0, vy: 0, r: 12, rot: 0, active: false });
          if (D.dens > 1) enemy({ type: 'roller', x: (x + 9) * TILE + 16, y: g * TILE - 12, vx: 0, vy: 0, r: 12, rot: 0, active: false, delay: .8 });
          coin(x + 2, g - 2); return w;
        }],
        bat: [7, function () { var w = 6; flat(w); bat(x + 3, g - 2.3, false); return w; }],
        drip: [8, function () { var w = 7; flat(w); dripper(x + 2, 2, 2.3); dripper(x + 5, 2, 2.6); coin(x + 3, g - 2); coin(x + 4, g - 2); return w; }],
        mite: [6, function () { var w = 5; flat(w); var h = 1 + (R() < .4 ? 1 : 0); for (var k = 1; k <= h; k++) set(x + 2, g - k, 1); coin(x + 2, g - h - 2); return w; }],
        // --- zaawansowane ---
        movingH: [11, function () { // ruchoma kładka nad przepaścią lub rzeką
          flat(2); x += 2; var span = 7;
          for (var i = 0; i < span; i++) { clearCol(x + i, 0 + (cave ? 2 : 0), 13); if (terr === 'stone' || cave) water(x + i); }
          var m = mover(x * TILE + 64, g * TILE, 96, 'x', 64, 3.4); m.log = terr === 'stone' || cave;
          coin(x + 3, g - 3); x += span; flat(2); return 2;
        }],
        movingV: [12, function () { // winda w górę na wysoką półkę
          var h = clamp(g - 6, 3, 5); flat(2); x += 2;
          ground(x, g); ground(x + 1, g);
          mover(x * TILE, g * TILE - 12, 64, 'y', 0, 3.2); var m = L.movers[L.movers.length - 1];
          m.y0 = g * TILE - 12; m.y1 = (g - h) * TILE; m.by = (m.y0 + m.y1) / 2; m.range = (m.y0 - m.y1) / 2; m.y = m.by;
          g -= h; x += 2; flat(5); for (var i = 1; i < 4; i++) coin(x + i, g - 2); return 5;
        }],
        climbWall: [12, function () { // pionowa wspinaczka po półkach
          var h = Math.min(6, g - (cave ? 5 : 3)); if (h < 4) { flat(5); return 5; }
          flat(4); set(x + 2, g - 3, 2); set(x + 3, g - 3, 2); set(x + 2, g - h, 2); set(x + 3, g - h, 2);
          coin(x + 2, g - 4); g -= h; x += 4; flat(5); coin(x + 2, g - 2); coin(x + 3, g - 2); return 5;
        }],
        crumbleRow: [10, function () { // kruche półki nad przepaścią
          flat(2); x += 2; var span = 6;
          for (var i = 0; i < span; i++) { clearCol(x + i, cave ? 2 : 0, 13); pit(x + i); }
          crumble(x + 1, g); crumble(x + 2, g); crumble(x + 4, g - 1);
          coin(x + 4, g - 2); x += span; flat(2); return 2;
        }],
        beetleLedge: [9, function () {
          var w = 8; flat(w); for (var i = 2; i <= 6; i++) { set(x + i, g - 3, 2); coin(x + i, g - 4); }
          beetle(x + 2, x + 6, g - 3, false); beetle(x + 1, x + 7, g, D.dens > 1 && R() < .5); return w;
        }],
        spikes: [8, function () {
          var w = 7; flat(w); var k = D.dens > 1 ? 2 + (R() < .5 ? 1 : 0) : 1 + (R() < .5 ? 1 : 0);
          for (var i = 0; i < k; i++) set(x + 3 + i, g - 1, 7);
          coin(x + 3, g - 3); return w;
        }],
        spiky: [9, function () { var w = 8; flat(w); beetle(x + 2, x + 6, g, true); coin(x + 4, g - 3); return w; }],
        bats: [8, function () { var w = 7; flat(w); bat(x + 4, g - 4, true); if (D.dens > 1) bat(x + 6, g - 3, false); return w; }],
        rockfall: [8, function () { var w = 7; flat(w); rock(x + 3); if (D.dens > 1) rock(x + 5); coin(x + 4, g - 2); return w; }],
        drips: [9, function () { var w = 8; flat(w); dripper(x + 2, 2, 2.2); dripper(x + 4, 2, 1.9); dripper(x + 6, 2, 2.4); coin(x + 4, g - 2); return w; }],
        lowCeil: [11, function () { // niski strop w jaskini
          var w = 10; if (g - 6 < 2) { flat(5); return 5; }
          flat(w); for (var i = 0; i < w; i++) for (var y = 2; y <= g - 6; y++) set(x + i, y, 1);
          set(x + 6, g - 1, 7); // jeden kolec — pod niskim stropem dwa byłyby nie do przeskoczenia
          dripper(x + 3, g - 5, 2.2); coin(x + 2, g - 2); coin(x + 8, g - 2); return w;
        }],
        wet: [13, function () { // śliska mokra skała i dziura
          flat(6, 5); x += 6; for (var i = 0; i < 3; i++) { clearCol(x + i, 2, 13); pit(x + i); }
          coin(x + 1, g - 3); x += 3; flat(3, 5); return 3;
        }],
        river: [13, function () { // podziemna rzeka: kamienie i pływające kłody
          flat(1); x += 1; var span = 10;
          for (var i = 0; i < span; i++) { clearCol(x + i, cave ? 2 : 0, 13); water(x + i); }
          if (R() < .5) { [2, 5, 8].forEach(function (k) { for (var y = g; y < 12; y++) set(x + k, y, 1); set(x + k, g, cave ? 5 : 1); coin(x + k, g - 2); }); }
          else {
            var m1 = mover((x + 1) * TILE + 32, 12 * TILE - 12, 64, 'x', 40, 3.0); m1.log = true;
            var m2 = mover((x + 6) * TILE + 32, 12 * TILE - 12, 64, 'x', 40, 2.6); m2.log = true; m2.ph = m1.ph + 2;
            coin(x + 3, 10); coin(x + 7, 10);
          }
          x += span; flat(2); return 2;
        }],
        wind: [19, function () { // podmuchy w wąwozie
          var sx = x, f = D.wind;
          flat(4); x += 4; for (var i = 0; i < 3; i++) pit(x + i); x += 3; flat(4); coin(x + 2, g - 2); x += 4;
          for (i = 0; i < 3; i++) pit(x + i); x += 3; flat(4);
          L.winds.push({ x0: sx * TILE, x1: (x + 4) * TILE, f: f, per: 3.4, on: 1.8, ph: R() * 3 });
          return 4;
        }],
        chestPU: [9, function () { // skrzynia z mocą (uderz od dołu albo wskocz z góry)
          var w = 7; flat(w); chest(x + 3, g - 3, 'pu:' + puFor()); coin(x + 1, g - 2); coin(x + 5, g - 2); return w;
        }],
        skyIsland: [17, function () { // balonik w skrzyni → wyspa w chmurach (sekret, nieobowiązkowy)
          if (cave && g < 9) g = 9;
          var w = 16, IR = cave ? 4 : 2; flat(w); chest(x + 2, g - 3, 'pu:balloon');
          for (var i = 5; i <= 14; i++) { set(x + i, IR, 2); if (i % 2 && IR - 1 >= (cave ? 2 : 0)) coin(x + i, IR - 1); }
          if (hatHere) L.items.push({ type: 'hat', kind: hatHere, x: (x + 13) * TILE + 16, y: IR * TILE - 22, alive: true });
          else { coin(x + 12, IR - 1); coin(x + 13, IR - 1); coin(x + 14, IR - 1); }
          return w;
        }],
        treasureIsland: [40, function () { // Trudny + flaga: wyspa w chmurach, a za nią komnata ze Skarbem Quo
          // Komnata wisi 8 kafli nad ziemią (podwójny skok sięga ok. 6,5), teren dookoła płaski i niski — wejść da się tylko balonikiem.
          g = GROUND; flat(4); x += 4;
          var w = 35, IR = 2, rf = 3, c0 = x + 17, c1 = x + 23, i, y;
          flat(w); chest(x + 2, g - 3, 'pu:balloon');
          for (i = 5; i <= 14; i++) { set(x + i, IR, 2); if (i % 2) coin(x + i, IR - 1); }
          if (hatHere) L.items.push({ type: 'hat', kind: hatHere, x: (x + 12) * TILE + 16, y: IR * TILE - 22, alive: true });
          for (i = x + 15; i <= c1; i++) set(i, rf, 1);      // ganek i podłoga komnaty
          for (i = c0; i <= c1; i++) set(i, 0, 1);           // strop
          for (y = 0; y <= rf; y++) set(c1, y, 1);           // tylna ściana; wejście od lewej (rzędy 1–2)
          coin(x + 15, rf - 1); coin(x + 16, rf - 1);
          L.treasure = { x: (c1 - 2) * TILE + 16, y: rf * TILE, x0: c0 * TILE, x1: c1 * TILE, y0: TILE, y1: rf * TILE, sec: si,
            open: !!(window.QuoTreasure && QuoTreasure.found(trip.trip)), seen: false };
          return w;
        }],
        zipline: [20, function () { // tyrolka nad wąwozem
          flat(3); var zx = x;
          for (var i = 3; i < 15; i++) { clearCol(x + i, 0, 13); pit(x + i); }
          x += 15; flat(4);
          L.zips.push({ x0: zx * TILE + 40, y0: g * TILE - 50, x1: (zx + 16) * TILE, y1: g * TILE - 34 });
          for (i = 0; i < 6; i++) coin(zx + 5 + i * 1.6, g - 3.4 - Math.sin(i / 5 * Math.PI) * 1.4);
          return 4;
        }],
        mosaic: [11, function () { // mozaika przy opactwie odblokowuje skrzynię
          var w = 10; flat(w);
          var ci = chest(x + 7, g - 3, 'hat:hood', true);
          L.plaques.push({ x: (x + 3) * TILE + 16, y: g * TILE, sec: si, solved: false, closes: 0, chest: ci });
          return w;
        }],
        raft: [41, function () { // spływ tratwą podziemną rzeką
          g = GROUND; flat(3); x += 3; var rx = x, n = 32;
          for (var i = 0; i < n; i++) { clearCol(x + i, 2, 13); water(x + i); }
          [8, 19, 27].forEach(function (k) { for (var y = 2; y <= GROUND - 5; y++) set(x + k, y, 1); set(x + k, GROUND - 4, 7); set(x + k + 1, 2, 1); });
          [4, 13, 23, 30].forEach(function (k) { L.raftRocks.push({ x: (x + k) * TILE + 16, top: GROUND * TILE - 24, sec: si }); coin(x + k, GROUND - 3); });
          dripper(x + 16, 2, 2.4); dripper(x + 25, 2, 2.1);
          L.movers.push({ x: rx * TILE, y: GROUND * TILE, w: 96, ax: 'raft', bx: rx * TILE, by: GROUND * TILE, range: 0, w2: 0, ph: 0, dx: 0, dy: 0, log: true,
            sec: si, v0: 125, endX: (rx + n) * TILE - 96, active: false, done: false });
          x += n; flat(4); return 4;
        }],
        mine: [30, function () { // wagonik kopalniany ze zwrotnicą
          g = GROUND; flat(5); var mx = x, ty = g * TILE - 4;
          for (var i = 5; i < 22; i++) { clearCol(mx + i, 2, 13); water(mx + i); }
          var hi = g - 5;
          for (i = 16; i <= 23; i++) set(mx + i, hi, 2);
          chest(mx + 20, hi - 1, D.adv ? 'hat:helmet' : 'coins');
          var main = [[mx * TILE + 16, ty], [(mx + 5) * TILE, ty], [(mx + 10) * TILE, ty + 22], [(mx + 16) * TILE, ty + 22], [(mx + 21) * TILE, ty], [(mx + 24) * TILE + 16, ty]];
          var up = [[mx * TILE + 16, ty], [(mx + 5) * TILE, ty], [(mx + 9) * TILE, ty - 70], [(mx + 13) * TILE, hi * TILE - 4], [(mx + 18) * TILE, hi * TILE - 4]];
          L.carts.push({ main: main, up: up, jS: 5 * TILE - 16, s: 0, v: 210, branch: 0, active: false, done: false, x: main[0][0], y: ty, sx: main[0][0], sec: si });
          x = mx + 22; flat(6); return 6;
        }]
      };
      /* --- sekretne miejsca z zagubionymi naklejkami (3 na przystanek) --- */
      var HID = {
        secret: [9, function () { // szopka: fałszywa ściana, w środku naklejka
          if (g < 9) { g = clamp(g + 2, 9, 12); }
          flat(8); var r1 = g - 1, r2 = g - 2;
          set(x + 2, r1, 6); set(x + 2, r2, 6); set(x + 5, r1, 1); set(x + 5, r2, 1);
          for (var i = 2; i <= 5; i++) set(x + i, g - 3, 2);
          hide(x + 3.5, g - 1.6); return 8;
        }],
        tower: [9, function () { // wysoka półka: wspinaczka po małych kładkach
          flat(8); var top = cave ? 3 : 1, rows = [g - 3, g - 6, g - 9].filter(function (r) { return r >= top; });
          var cols = [x + 1, x + 4, x + 1];
          rows.forEach(function (r, i) { set(cols[i], r, 2); set(cols[i] + 1, r, 2); });
          var lr = rows[rows.length - 1], lc = cols[rows.length - 1];
          hide(lc + 1, lr - 1.2); return 8;
        }],
        skygap: [11, function () { // naklejka w powietrzu nad przepaścią — trzeba skoczyć z rozbiegu
          flat(4); x += 4; var w = D.adv ? 4 : 3;
          for (var i = 0; i < w; i++) { clearCol(x + i, cave ? 2 : 0, 13); pit(x + i); }
          hide(x + w / 2, g - 4.25); x += w; flat(3); return 3;
        }]
      };
      var weights = D.adv ? {
        valley: { flat: 1, step: 2, runGap: 2, movingH: 1.5, crumbleRow: 1.5, climbWall: 1, beetleLedge: 2, spikes: 1.5, spiky: 1.5, rockfall: 1.5, roller: 1.5 },
        cave: { step: 1.5, runGap: 1, movingV: 1, crumbleRow: 1.5, beetleLedge: 1.5, spikes: 1.5, bats: 2, drips: 2.5, lowCeil: 2, wet: 2, river: 2, mite: 1 },
        stone: { step: 1.5, runGap: 2, movingH: 2, crumbleRow: 1.5, beetleLedge: 1.5, spiky: 1.5, bats: 1, river: 2.5, roller: 1, climbWall: 1, spikes: 1 },
        cliff: { step: 3, runGap: 2, movingV: 2, climbWall: 2, wind: 2.5, rockfall: 2.5, spiky: 1.5, bats: 1, crumbleRow: 1 }
      }[terr] : {
        valley: { flat: 3, step: 3, gap: 2, float: 1.5, ledges: 1.5, roller: 2 },
        cave: { flat: 2, step: 2, gap: 1.5, float: 1, ledges: 1.5, bat: 2, drip: 3, mite: 2 },
        stone: { flat: 2, step: 2, gap: 1.5, bridge: 2, float: 1.5, ledges: 1, roller: 2, bat: 1 },
        cliff: { flat: 2, step: 3.5, gap: 2, float: 1, ledges: 1.5, roller: 2, bat: 1 }
      }[terr];
      if (D.adv && D.dens <= 1) weights.flat = (weights.flat || 0) + 1.5;
      var wsum = 0; for (var k in weights) wsum += weights[k];
      function chooseChunk() { var r = R() * wsum; for (var k in weights) { r -= weights[k]; if (r <= 0) return k; } return 'step'; }

      while (x < miniX - 1) {
        var gd = gi < gateDefs.length ? gateDefs[gi] : null, gc = gd ? gd.col : null;
        var limit = gc != null ? gc - 5 : miniX - 1;
        if (x >= limit) {
          if (gc == null) break;
          g = GROUND; for (; x <= gc + 4; x++) ground(x, g);
          var qs = [], qg = S.gates.filter(function (k) { return L.gates[k].kind === 'quiz'; }).length;
          if (gd.kind === 'quiz') for (var qj = 0; qj < D.qPerGate; qj++) qs.push((qg * D.qPerGate + qj + rot) % nq);
          var gate = { x: gc * TILE, col: gc, g: g, open: false, lift: 0, qs: qs, qn: 0, sec: si, tries: 0, kind: gd.kind, fails: 0 };
          L.gates.push(gate); S.gates.push(L.gates.length - 1); gi++;
          coin(gc + 2, g - 2); coin(gc + 3, g - 2);
          continue;
        }
        var room = limit - x, fc = null, fi = -1;
        // obowiązkowe klocki (atrakcje, sekrety): pierwszy pasujący, atrakcje mają pierwszeństwo
        for (var pass = 0; pass < 2 && !fc; pass++) for (var q = 0; q < forced.length; q++) {
          var f = forced[q]; if (f.used || f.at > x || (pass === 0 && !f.pri)) continue;
          var dw = (HID[f.name] || CH[f.name])[0];
          if (dw + 1 <= room) { fc = f; fi = q; break; }
        }
        var waiting = forced.some(function (f) { return !f.used && f.at <= x; });
        var name = fc ? fc.name : chooseChunk(), def = HID[name] || CH[name];
        if (!fc && waiting && room >= 9) { name = 'flat'; def = CH.flat; } // czekamy na miejsce dla atrakcji
        if (room < def[0] + 1) { flat(room); x += room; continue; }
        var pickF = !!fc; if (fc) { fc.used = true; if (fc.hid) hk++; }
        var bx = x, adv = def[1](); x += adv; // klocek może sam przesunąć x — dodajemy dopiero po wywołaniu
        if (window.__genLog) window.__genLog.push(si + ':' + name + '@' + bx + '-' + x);
      }
      forced.forEach(function (f) { if (!f.used && f.hid) { flat(3); hide(x + 1, g - 3.5); x += 3; hk++; } }); // awaryjnie: gdyby zabrakło miejsca
      if (window.__genLog) forced.forEach(function (f) { if (!f.used) window.__genLog.push(si + ':MISSING ' + f.name); });
      for (; x < miniX; x++) ground(x, g);
      g = GROUND;
      if (cave) for (var ff = 0; ff < 10; ff++) { // świetliki
        var fcx = x0 + 12 + Math.floor(ff * (SL - 30) / 10), fr = 2;
        while (fr < ROWS - 1 && !SOLID[get(fcx, fr)] && !ONEWAY[get(fcx, fr)]) fr++;
        if (fr > 4 && fr < ROWS - 1) L.items.push({ type: 'firefly', x: fcx * TILE + 16, y: (fr - 2) * TILE + 8, ph: ff, alive: true });
      }
      if (D.adv) { x = buildMini(L, D, terr, si, miniX, landX, R, set, ground, coin, crumble, water, clearCol, dripper, rock); g = L.minis[L.minis.length - 1].endG || GROUND; }
      for (; x < x0 + SL; x++) ground(x, g);
      L.landmarks.push({ x: (landX + 2) * TILE + 16, y: g * TILE, sec: si, done: false });

      if (S.shortcut) { // tajny skrót za komplet zadań przystanku
        var endC = Math.min((gateCols.length ? gateCols[0] : landX) - 5, x0 + 40), WR = 4;
        L.springs.push({ x: (x0 + 5) * TILE + 16, y: GROUND * TILE, squash: 0 });
        for (c = x0 + 7; c <= endC; c++) { if (get(c, WR) === 0) set(c, WR, 2); if (c % 2 === 0 && c < endC - 2) coin(c, WR - 1); }
        L.chests.push({ x: (endC - 1) * TILE + 16, y: WR * TILE, open: false });
      }
      S.checkpoint = { x: (x0 + 2) * TILE + 16, y: GROUND * TILE };
      S.par = Math.round(SL * TILE / RUN * D.parMul + 4);
    });
    for (var x = SL * n; x < W; x++) { ground(x, GROUND); L.sec[x] = n - 1; }
    for (var y = 0; y < ROWS; y++) set(W - 1, y, 1);
    return L;
  }

  /* Mini-wyzwanie na końcu przystanku (Średni/Trudny). Zwraca kolumnę, od której dalej jest ziemia. */
  function buildMini(L, D, terr, si, x, landX, R, set, ground, coin, crumble, water, clearCol, dripper, rock) {
    var g = GROUND, i, y;
    if (terr === 'valley') { // ucieczka przed toczącym się głazem
      var sx = x;
      for (i = 0; i < 8; i++) ground(x + i, g); x += 8;
      x += 2; ground(x, g); ground(x + 1, g); ground(x + 2, g); ground(x + 3, g); ground(x + 4, g); x += 5;
      for (i = 0; i < 4; i++) ground(x + i, g - 1); x += 4;
      x += 2; for (i = 0; i < 5; i++) ground(x + i, g - 1); x += 5;
      for (i = 0; i < 4; i++) ground(x + i, g); set(x + 2, g - 1, 7); x += 4;
      for (; x < landX; x++) ground(x, g);
      for (i = 0; i < 12; i++) coin(sx + 8 + i * 2, g - 3);
      L.minis.push({ type: 'boulder', sec: si, trig: (sx + 4) * TILE, endX: (landX - 1) * TILE, x: 0, y: 0, r: 44, v: D.boulderV, rot: 0, active: false, done: false });
    } else if (terr === 'cave') { // płyta otwiera bramę na kilka sekund
      var px = x + 3;
      for (i = 0; i < 6; i++) ground(x + i, g); x += 6;
      for (i = 0; i < 5; i++) ground(x + i, g, 5); x += 5;
      for (i = 0; i < 3; i++) { clearCol(x + i, 2, 13); water(x + i); } x += 3;
      for (i = 0; i < 7; i++) { ground(x + i, g); for (y = 2; y <= g - 5; y++) set(x + i, y, 1); }
      set(x + 3, g - 1, 7); dripper(x + 5, g - 4, 2.0); x += 7;
      clearCol(x, 2, 13); clearCol(x + 1, 2, 13); water(x); water(x + 1); crumble(x, g); crumble(x + 1, g); x += 2;
      for (i = 0; i < 3; i++) ground(x + i, g); x += 3;
      var dc = x; ground(x, g); x++;
      for (; x < landX; x++) ground(x, g);
      L.minis.push({ type: 'door', sec: si, plateX: px * TILE + 16, col: dc, x: dc * TILE, g: g, open: false, t: 0, T: D.doorT, lift: 0, done: false, on: false });
    } else if (terr === 'stone') { // walący się most nad Sentino
      for (i = 0; i < 4; i++) ground(x + i, g); x += 4;
      var bx0 = x, bridge = [];
      for (i = 0; i < 22; i++) {
        clearCol(x + i, 0, 13); water(x + i);
        if (i === 7 || i === 8 || i === 15 || i === 16) continue;
        bridge.push(L.crumbles.length); crumble(x + i, g, true);
        if (i % 3 === 0) coin(x + i, g - 2);
      }
      x += 22;
      for (; x < landX; x++) ground(x, g);
      L.minis.push({ type: 'bridge', sec: si, x0: bx0 * TILE, x1: (bx0 + 22) * TILE, wave: -1, v: D.bridgeV, idx: bridge });
    } else { // cliff: winda na płaskowyż pod świątynią, spadające kamienie
      for (i = 0; i < 6; i++) ground(x + i, g); x += 6;
      var hi = g - 7;
      ground(x, g); ground(x + 1, g);
      var m1 = { x: x * TILE, y: 0, w: 64, ax: 'y', bx: x * TILE, by: 0, range: 0, w2: Math.PI * 2 / (3.0 / Math.sqrt(D.spd)), ph: 0, dx: 0, dy: 0, log: false, sec: si };
      m1.y0 = g * TILE - 12; m1.y1 = (g - 4) * TILE; m1.by = (m1.y0 + m1.y1) / 2; m1.range = (m1.y0 - m1.y1) / 2; m1.y = m1.by; L.movers.push(m1);
      x += 2; ground(x, g - 4); ground(x + 1, g - 4); x += 2;
      ground(x, g); ground(x + 1, g);
      var m2 = { x: x * TILE, y: 0, w: 64, ax: 'y', bx: x * TILE, by: 0, range: 0, w2: Math.PI * 2 / (3.4 / Math.sqrt(D.spd)), ph: 2, dx: 0, dy: 0, log: false, sec: si };
      m2.y0 = (g - 4) * TILE - 12; m2.y1 = hi * TILE; m2.by = (m2.y0 + m2.y1) / 2; m2.range = (m2.y0 - m2.y1) / 2; m2.y = m2.by; L.movers.push(m2);
      x += 2;
      var ps = x;
      for (; x < landX + 5; x++) ground(x, hi);
      rock(ps + 3); rock(ps + 7);
      if (D.wind) L.winds.push({ x0: ps * TILE, x1: (ps + 10) * TILE, f: D.wind * .8, per: 3.2, on: 1.6, ph: 1 });
      coin(ps + 1, hi - 2); coin(ps + 2, hi - 2);
      L.minis.push({ type: 'climb', sec: si, endG: hi });
      return x;
    }
    return x;
  }

  /* ---------- 6. Fizyka, gracz, przeciwnicy ---------- */
  var trip, prog, L, P, D, state = 'loading', prevState = 'play', playNo = 0, demo = false, diffKey = 'medium';
  var cam = { x: 0, y: 0 }, view = { w: 640, h: 384, s: 1, dpr: 1, cssW: 0, cssH: 0, reserve: 0 };
  var stats, particles = [], stopIcons = [], curSec = -1, celebration = null, gameT = 0, quizGate = null;
  var SIM = false, simEv = [], simStop = false, botMode = false;

  function tileAt(x, y) {
    if (x < 0 || x >= L.W) return 1;
    if (y < 0 || y >= ROWS) return 0;
    return L.grid[y * L.W + x];
  }
  function solidAt(px, py) { return SOLID[tileAt(Math.floor(px / TILE), Math.floor(py / TILE))] === 1; }
  function ev(name) { if (SIM) simEv.push(name); }

  function newPlayer() {
    var hearts = clamp(D.hearts + prog.missions, D.hearts, D.cap);
    return { x: 3 * TILE, y: GROUND * TILE, vx: 0, vy: 0, w: 22, h: 48, onGround: false, facing: 1, coyote: 0, jumpBuf: 0, airJumps: 0,
      inv: 0, hurtT: 0, nap: 0, land: 0, phase: 0, t: 0, hearts: hearts, startHearts: hearts, safe: { x: 3 * TILE, y: GROUND * TILE }, safeT: 0,
      checkpoint: { x: 3 * TILE, y: GROUND * TILE }, ride: -1, under: 0, power: null, fly: 0, zip: -1, zv: 0, zipCool: 0, cart: -1, onRaft: -1, glow: 0 };
  }
  function secAt(px) { return L.sections[L.sec[clamp(Math.floor(px / TILE), 0, L.W - 1)]]; }
  function curPower() { return P.power; }
  function setPower(k, fly) { P.power = k; P.fly = k === 'balloon' ? (fly || 8) : 0; if (!SIM) powerHUD(); }

  var input = { left: false, right: false, jump: false, jumpPressed: false };

  function step(dt) {
    gameT += dt; P.t += dt;
    updateMovers(dt);
    updatePlayer(dt);
    if (SIM && simStop) return;
    updateEntities(dt);
    if (!SIM) updateParticles(dt);
    updateCamera(dt);
    var si = L.sec[clamp(Math.floor(P.x / TILE), 0, L.W - 1)];
    if (si !== curSec) enterSection(si);
    var S = L.sections[curSec]; if (S && !S.done && P.nap <= 0) S.time += dt;
  }

  function updateMovers(dt) {
    for (var i = 0; i < L.movers.length; i++) {
      var m = L.movers[i], ox = m.x, oy = m.y, s = Math.sin(gameT * m.w2 + m.ph);
      if (m.ax === 'raft') { // tratwa płynie sama; ← → przyspiesza/zwalnia
        if (m.active) {
          var steer = P.onRaft === i ? ((input.right ? 1 : 0) - (input.left ? 1 : 0)) : 0;
          m.x += (m.v0 + steer * 55) * dt;
          if (m.x >= m.endX) { m.x = m.endX; m.active = false; m.done = true; if (P.onRaft === i) P.onRaft = -1; toast('Brzeg! Wysiadamy.'); }
        }
        m.dx = m.x - ox; m.dy = 0; continue;
      }
      if (m.ax === 'x') { m.x = m.bx + s * m.range; if (m.log) m.y = m.by + Math.sin(gameT * 3 + m.ph) * 2; }
      else m.y = m.by + s * m.range;
      m.dx = m.x - ox; m.dy = m.y - oy;
    }
  }
  function windAt(x) {
    for (var i = 0; i < L.winds.length; i++) { var w = L.winds[i]; if (x >= w.x0 && x <= w.x1 && ((gameT + w.ph) % w.per) < w.on) return -w.f; }
    return 0;
  }

  function updatePlayer(dt) {
    if (P.nap > 0) {
      P.nap -= dt;
      if (P.nap <= 0) { respawnCheckpoint(); }
      return;
    }
    if (P.zipCool > 0) P.zipCool -= dt;
    if (P.inv > 0 && (P.zip >= 0 || P.cart >= 0)) P.inv -= dt;
    if (P.zip >= 0) { updateZip(dt); return; }
    if (P.cart >= 0) { updateCartRide(dt); return; }
    for (var pi = 0; pi < L.plaques.length; pi++) {
      var pq = L.plaques[pi];
      if (!pq.solved && Math.abs(P.x - pq.x) < 26 && Math.abs(P.y - pq.y) < 10 && input.jumpPressed && !SIM && state === 'play') { input.jumpPressed = false; openMosaic(pq); return; }
    }
    var power = curPower();
    var ax = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (P.hurtT > 0) { P.hurtT -= dt; ax = 0; }
    if (P.onRaft >= 0) { P.x += L.movers[P.onRaft].dx; ax = 0; P.vx = 0; }
    else if (P.ride >= 0) { var rm = L.movers[P.ride]; P.x += rm.dx; P.y += rm.dy; }
    var slippery = P.onGround && P.under === 5;
    var target = ax * RUN;
    var k = P.onGround ? (slippery ? 1.6 : 16) : 7;
    P.vx += (target - P.vx) * Math.min(1, dt * k);
    if (!slippery && Math.abs(P.vx) < 2 && !ax) P.vx = 0;
    if (ax) P.facing = ax;

    if (input.jumpPressed) { P.jumpBuf = .13; input.jumpPressed = false; }
    if (P.jumpBuf > 0) P.jumpBuf -= dt;
    if (P.onGround) { P.coyote = .1; P.airJumps = power === 'doublejump' ? 1 : 0; } else P.coyote -= dt;
    if (P.jumpBuf > 0 && P.hurtT <= 0) {
      if (P.coyote > 0) { P.vy = -JUMP_V; P.coyote = 0; P.jumpBuf = 0; P.onGround = false; P.ride = -1; sfx('jump'); }
      else if (P.airJumps > 0) { P.vy = -JUMP_V * .9; P.airJumps--; P.jumpBuf = 0; sfx('jump2'); puff(P.x, P.y, 6, '#fff'); }
    }
    if (power === 'balloon') { // balonik: trzymaj skok — w górę, puść — powoli w dół
      P.fly -= dt;
      if (P.fly <= 0) { setPower(null); toast('Balonik odleciał.'); }
      else if (!P.onGround || input.jump) { var tvy = input.jump ? -175 : 75; P.vy += (tvy - P.vy) * Math.min(1, dt * 4); if (P.y - P.h < 8 && P.vy < 0) P.vy = 0; }
    }
    if (power !== 'balloon' || P.fly <= 0) {
      if (!input.jump && P.vy < -260) P.vy = -260;
      P.vy += G * dt;
    }
    if (power === 'glide' && input.jump && P.vy > 90) P.vy = 90;
    if (P.vy > MAX_FALL) P.vy = MAX_FALL;
    var wind = windAt(P.x) * (P.onGround ? .5 : 1);

    // ruch w poziomie
    P.x += (P.vx + wind) * dt;
    var hw = P.w / 2, top = P.y - P.h, bot = P.y;
    var dir = P.vx + wind;
    if (dir > 0) {
      var cx = Math.floor((P.x + hw) / TILE);
      for (var ry = Math.floor((top + 2) / TILE); ry <= Math.floor((bot - 2) / TILE); ry++)
        if (SOLID[tileAt(cx, ry)]) { P.x = cx * TILE - hw - .01; P.vx = Math.min(P.vx, 0); break; }
    } else if (dir < 0) {
      cx = Math.floor((P.x - hw) / TILE);
      for (ry = Math.floor((top + 2) / TILE); ry <= Math.floor((bot - 2) / TILE); ry++)
        if (SOLID[tileAt(cx, ry)]) { P.x = (cx + 1) * TILE + hw + .01; P.vx = Math.max(P.vx, 0); break; }
    }
    // bramy z pytaniami i drzwi z płytą
    for (var i = 0; i < L.gates.length; i++) {
      var gt = L.gates[i];
      if (gt.open || Math.abs(gt.x - P.x) > 80) continue;
      if (P.x + hw > gt.x + 2 && P.x - hw < gt.x + 30) { P.x = gt.x + 2 - hw; P.vx = Math.min(P.vx, 0); }
      if (P.x + hw >= gt.x - 2 && P.x < gt.x && P.onGround && state === 'play') { openQuiz(gt); return; }
    }
    for (i = 0; i < L.minis.length; i++) {
      var dm = L.minis[i];
      if (dm.type === 'door' && !dm.open && Math.abs(dm.x - P.x) < 80 && P.x + hw > dm.x + 2 && P.x - hw < dm.x + 30) { P.x = dm.x + 2 - hw; P.vx = Math.min(P.vx, 0); }
    }

    // ruch w pionie
    var prevBot = P.y;
    P.y += P.vy * dt;
    var wasGround = P.onGround; P.onGround = false; P.ride = -1;
    var c0 = Math.floor((P.x - hw + 2) / TILE), c1 = Math.floor((P.x + hw - 2) / TILE);
    if (P.vy >= 0) {
      var row = Math.floor(P.y / TILE), rowTop = row * TILE;
      for (var cc = c0; cc <= c1; cc++) {
        var tv = tileAt(cc, row);
        if (SOLID[tv] || (ONEWAY[tv] && prevBot <= rowTop + .5)) {
          if (!wasGround && P.vy > 300) { P.land = 1; if (P.vy > 500) puff(P.x, rowTop, 4, 'rgba(255,255,255,.8)'); }
          if (tv === 8 && !wasGround && P.vy > 150) openChest(cc, row);
          P.y = rowTop; P.vy = 0; P.onGround = true;
          P.under = tileAt(Math.floor(P.x / TILE), row) || tv;
          if (tv === 4) touchCrumble(cc, row);
          if (cc === c0 && tileAt(c1, row) === 4) touchCrumble(c1, row);
          break;
        }
      }
      if (!P.onGround) for (var mi = 0; mi < L.movers.length; mi++) {
        var m = L.movers[mi];
        if (Math.abs(m.x - P.x) > 200) continue;
        if (P.x + hw - 2 > m.x && P.x - hw + 2 < m.x + m.w && prevBot <= m.y - m.dy + 1 && P.y >= m.y) {
          P.y = m.y; P.vy = 0; P.onGround = true; P.ride = mi; P.under = 1;
          if (m.ax === 'raft' && !m.done && P.onRaft < 0) { P.onRaft = mi; if (!m.active) { m.active = true; toast('Spływ! ← → steruje tratwą, skacz nad skałami'); ev('raft'); } }
          break;
        }
      }
      L.springs.forEach(function (sp) {
        if (Math.abs(P.x - sp.x) < 20 && prevBot <= sp.y - 12 && P.y >= sp.y - 14) { P.y = sp.y - 14; P.vy = -SPRING_V; P.onGround = false; sp.squash = 1; sfx('spring'); }
      });
    } else {
      var rowT = Math.floor((P.y - P.h) / TILE);
      for (cc = c0; cc <= c1; cc++) if (SOLID[tileAt(cc, rowT)]) { if (tileAt(cc, rowT) === 8) openChest(cc, rowT); P.y = (rowT + 1) * TILE + P.h; P.vy = 0; break; }
    }
    if (P.land > 0) P.land = Math.max(0, P.land - dt * 6);
    if (P.inv > 0) P.inv -= dt;

    // kolce
    var rb = Math.floor((P.y - 4) / TILE), rt = Math.floor((P.y - P.h + 4) / TILE);
    for (cc = c0; cc <= c1; cc++) for (var rr = rt; rr <= rb; rr++) if (tileAt(cc, rr) === 7) {
      var hang = SOLID[tileAt(cc, rr - 1)];
      if (hang ? (P.y - P.h < rr * TILE + 18) : (P.y > rr * TILE + 14)) { spikeHit(cc * TILE + 16); cc = c1 + 1; break; }
    }
    if (P.onRaft >= 0) L.raftRocks.forEach(function (rk) { if (Math.abs(rk.x - P.x) < 10 + hw && P.y > rk.top + 4) hurt(rk.x); });
    // tyrolka: złap linę rękami
    if (P.zipCool <= 0) for (var zi = 0; zi < L.zips.length; zi++) {
      var z = L.zips[zi];
      if (P.x > z.x0 - 4 && P.x < z.x1 - 24 && (P.vy >= 0 || P.onGround)) {
        var cy = zipY(z, P.x), head = P.y - P.h;
        if (head - 10 <= cy && head + 16 >= cy) { P.zip = zi; P.zv = Math.max(170, Math.abs(P.vx)); P.ride = -1; sfx('spring'); ev('zip'); return; }
      }
    }
    // wagonik
    for (var ci = 0; ci < L.carts.length; ci++) {
      var ct = L.carts[ci];
      if (!ct.active && !ct.done && Math.abs(P.x - ct.x) < 24 && Math.abs(P.y - ct.y) < 30) {
        P.cart = ci; ct.active = true; ct.s = 0; P.vx = 0; ev('cart'); toast('Wagonik! Skok = zwrotnica na tajny tor'); sfx('gate'); return;
      }
    }

    // bezpieczne miejsce do powrotu po upadku
    P.safeT -= dt;
    if (P.onGround && P.ride < 0 && P.safeT <= 0 && solidAt(P.x - hw - 6, P.y + 4) && solidAt(P.x + hw + 6, P.y + 4) && !nearHazard()) { P.safe = { x: P.x, y: P.y }; P.safeT = .3; }
    var inWater = tileAt(Math.floor(P.x / TILE), Math.floor((P.y - 6) / TILE)) === 3;
    if (P.y > ROWS * TILE + 50 || inWater) fallOut(inWater);
    if (P.x < 16) P.x = 16;
    if (P.onGround && Math.abs(P.vx) > 10) P.phase += dt * Math.abs(P.vx) / 13;
  }
  function zipY(z, x) { return z.y0 + (z.y1 - z.y0) * (x - z.x0) / (z.x1 - z.x0); }
  function updateZip(dt) {
    var z = L.zips[P.zip];
    P.zv = Math.min(330, P.zv + 260 * dt); P.x += P.zv * dt; P.facing = 1; P.onGround = false; P.vy = 0; P.vx = P.zv;
    if (input.jumpPressed) { input.jumpPressed = false; P.zip = -1; P.vy = -JUMP_V * .85; P.zipCool = .25; sfx('jump'); return; }
    if (P.x >= z.x1) { P.zip = -1; P.vx = 150; P.zipCool = .4; return; }
    P.y = zipY(z, P.x) + P.h + 6;
  }
  function cartPos(c) {
    var pts = c.branch ? c.up : c.main, s = c.s;
    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], l = Math.sqrt(dx * dx + dy * dy);
      if (s <= l) return { x: pts[i - 1][0] + dx * s / l, y: pts[i - 1][1] + dy * s / l, end: false };
      s -= l;
    }
    var e = pts[pts.length - 1]; return { x: e[0], y: e[1], end: true };
  }
  function updateCartRide(dt) {
    var c = L.carts[P.cart];
    if (input.jumpPressed) { input.jumpPressed = false; if (c.s < c.jS) { c.branch = 1 - c.branch; sfx('gate'); ev('switch'); } }
    c.s += c.v * dt;
    var p = cartPos(c); c.x = p.x; c.y = p.y;
    P.x = c.x; P.y = c.y - 4; P.vx = c.v; P.vy = 0; P.onGround = false; P.facing = 1; P.phase = 0;
    if (p.end) { c.active = false; c.done = true; P.cart = -1; P.vy = -380; P.vx = 120; P.y = c.y - 8; sfx('jump'); }
  }
  function openChest(cx, cy) {
    var ci = L.chestAt[cy * L.W + cx]; if (ci < 0) return;
    var c = L.chestList[ci]; if (c.open) return;
    if (c.locked) { toast('Zamknięta. Ułóż mozaikę na tablicy obok!'); return; }
    c.open = true; L.grid[cy * L.W + cx] = 9; ev('chest'); sfx('fanfare');
    var parts = c.content.split(':');
    if (parts[0] === 'coins') addCoins(6, cx * TILE + 16, cy * TILE);
    else L.items.push({ type: parts[0] === 'hat' ? 'hat' : 'pu', kind: parts[1], x: cx * TILE + 16, y: cy * TILE - 6, vy: -300, alive: true, life: -1, delay: .3 });
  }
  function touchCrumble(cx, row) {
    var ci = L.crumbleAt[row * L.W + cx]; if (ci < 0) return;
    var c = L.crumbles[ci]; if (c.s === 0) { c.s = 1; c.t = c.fast ? .22 : D.crumbleT; }
  }
  function nearHazard() {
    for (var i = 0; i < L.enemies.length; i++) { var e = L.enemies[i]; if (e.alive && Math.abs((e.x || e.hx) - P.x) < 70) return true; }
    for (i = 0; i < L.minis.length; i++) { var m = L.minis[i]; if (m.type === 'bridge' && P.x > m.x0 - 40 && P.x < m.x1 + 20) return true; }
    for (var cc = -2; cc <= 2; cc++) { var v = tileAt(Math.floor(P.x / TILE) + cc, Math.floor(P.y / TILE) - 1); if (v === 7) return true; }
    return P.under === 5;
  }
  function respawnCheckpoint() {
    resetRaft(); P.zip = -1; P.cart = -1;
    L.carts.forEach(function (c) { if (c.done || c.active) { c.done = false; c.active = false; c.s = 0; c.branch = 0; c.x = c.sx; c.y = c.main[0][1]; } });
    P.x = P.checkpoint.x; P.y = P.checkpoint.y; P.vx = P.vy = 0; P.hearts = P.startHearts; P.inv = 2; P.ride = -1;
    P.safe = { x: P.x, y: P.y };
    resetMinis();
    updateHUD(); toast('Quo odpoczął. Dasz radę!');
  }
  function resetMinis() {
    L.minis.forEach(function (m) {
      if (m.type === 'boulder' && !m.done) { m.active = false; }
      if (m.type === 'bridge') resetBridge(m);
      if (m.type === 'door' && !m.done) { m.open = false; m.t = 0; }
    });
  }
  function resetBridge(m) {
    m.wave = -1;
    m.idx.forEach(function (ci) { var c = L.crumbles[ci]; c.s = 0; c.t = 0; L.grid[c.y * L.W + c.x] = 4; });
  }
  function resetRaft() {
    P.onRaft = -1;
    L.movers.forEach(function (m) { if (m.ax === 'raft' && !m.done) { m.x = m.bx; m.active = false; } });
  }
  function fallOut(water) {
    if (water) splash(P.x, Math.floor(P.y / TILE) * TILE);
    sfx('hit'); ev('fall');
    P.hearts--;
    updateHUD();
    if (P.hearts <= 0) { startNap(); return; }
    resetRaft();
    P.x = P.safe.x; P.y = P.safe.y; P.vx = P.vy = 0; P.inv = 1.6; P.ride = -1;
    toast(water ? 'Plusk! Woda jest zimna. Jeszcze raz!' : 'Ups! Spróbuj jeszcze raz.');
  }
  function hurt(fromX, forward) {
    if (P.inv > 0 || P.nap > 0) return;
    P.hearts--; P.inv = 1.6; P.hurtT = .35; ev('hurt');
    if (P.power) { // moc wypada i miga przez 2 s — można ją złapać z powrotem
      L.items.push({ type: 'pu', kind: P.power, fly: P.fly, x: P.x, y: P.y - 30, vy: -320, vx: (P.x < fromX ? -1 : 1) * 90, alive: true, life: 2.2, delay: .45 });
      setPower(null); toast('Ojej, moc wypadła! Złap ją!');
    }
    if (P.onRaft >= 0) { /* zostaje na tratwie */ }
    P.vx = forward ? 280 : (P.x < fromX ? -1 : 1) * 260; P.vy = -320; P.onGround = false; P.ride = -1;
    sfx('hit'); updateHUD();
    if (P.hearts <= 0) startNap();
  }
  function spikeHit(fromX) { if (P.inv > 0) return; hurt(fromX); P.vy = -460; }
  function bump(fromX) {
    if (P.hurtT > 0) return;
    P.hurtT = .3; P.vx = (P.x < fromX ? -1 : 1) * 330; P.vy = -260; P.onGround = false; P.ride = -1; sfx('bump'); ev('bump');
  }
  function startNap() { P.nap = 1.4; P.vx = 0; P.vy = 0; ev('nap'); toast('Quo musi chwilę odpocząć…'); }

  function addCoins(n, x, y) {
    stats.coins += n; updateHUD();
    if (x != null && !SIM) for (var i = 0; i < Math.min(n, 8); i++) particles.push({ x: x, y: y, vx: (Math.random() - .5) * 220, vy: -150 - Math.random() * 200, life: .7, max: .7, col: '#FFC629', size: 4, g: 900 });
  }

  function updateEntities(dt) {
    var left = cam.x - 300, right = cam.x + view.w + 300;
    if (SIM) { left = P.x - 900; right = P.x + 900; }
    var power = curPower(), spd = D.spd;
    L.gates.forEach(function (gt) { if (gt.open && gt.lift < 1) gt.lift = Math.min(1, gt.lift + dt * 1.6); });
    // kamyczki
    for (var i = 0; i < L.coins.length; i++) {
      var c = L.coins[i]; if (c.taken || c.x < left || c.x > right) continue;
      var dx = P.x - c.x, dy = (P.y - 24) - c.y, d = Math.sqrt(dx * dx + dy * dy);
      if (power === 'magnet' && d < 150 && P.nap <= 0) { c.x += dx / d * 420 * dt; c.y += dy / d * 420 * dt; }
      if (d < 26 && P.nap <= 0) { c.taken = true; stats.coins++; updateHUD(); sfx('coin'); sparkle(c.x, c.y); }
    }
    // zagubione naklejki
    L.hidden.forEach(function (h) {
      if (h.taken || P.nap > 0) return;
      var dx = P.x - h.x, dy = (P.y - 24) - h.y;
      if (dx * dx + dy * dy < 30 * 30) {
        h.taken = true; L.sections[h.sec].hidden++; stats.hiddenTotal++; ev('hidden'); updateHUD(); sfx('fanfare'); sparkle(h.x, h.y); sparkle(h.x, h.y);
        toast('Zagubiona naklejka! ' + L.sections[h.sec].hidden + ' z 3');
      }
    });
    L.items.forEach(function (it) {
      if (!it.alive || it.x < left || it.x > right) return;
      if (it.type === 'firefly') { it.dy = Math.sin(gameT * 2 + it.ph) * 6; }
      else if (it.vy != null) {
        it.vy = Math.min(it.vy + G * .5 * dt, 300); it.y += it.vy * dt; it.x += (it.vx || 0) * dt;
        var tv = tileAt(Math.floor(it.x / TILE), Math.floor((it.y + 12) / TILE));
        if ((SOLID[tv] || ONEWAY[tv]) && it.vy > 0) { it.y = Math.floor((it.y + 12) / TILE) * TILE - 12; it.vy = 0; it.vx = 0; }
        if (it.y > ROWS * TILE + 40) it.alive = false;
      }
      if (it.life > 0) { it.life -= dt; if (it.life <= 0) { it.alive = false; return; } }
      if (it.delay > 0) { it.delay -= dt; return; }
      if (P.nap > 0) return;
      var dx = P.x - it.x, dy = (P.y - 24) - (it.y + (it.dy || 0));
      if (dx * dx + dy * dy < 28 * 28) {
        it.alive = false; ev('item');
        if (it.type === 'pu') { setPower(it.kind, it.fly); sfx('fanfare'); toast('Moc: ' + POWER[it.kind].name); }
        else if (it.type === 'firefly') { P.glow = Math.min(P.glow + 70, 210); sfx('coin'); sparkle(it.x, it.y); }
        else if (it.type === 'hat') { collectHat(it.kind); }
      }
    });
    var TR = L.treasure;
    if (TR && P.nap <= 0 && Math.abs(P.x - TR.x) < 30 && Math.abs(P.y - TR.y) < 24) {
      if (!TR.open) { TR.open = true; ev('treasure'); if (!SIM) startTreasure(TR); }
      else if (!TR.seen && !SIM) { TR.seen = true; toast('Skarb Quo już jest w albumie!'); }
    }
    if (P.glow > 0) P.glow = Math.max(0, P.glow - 5 * dt);
    L.carts.forEach(function (c) { if (c.done && !c.active && P.onGround && Math.abs(P.x - c.sx) < 60 && P.cart < 0) { c.done = false; c.s = 0; c.branch = 0; c.x = c.sx; c.y = c.main[0][1]; } });
    L.chests.forEach(function (ch) {
      if (!ch.open && Math.abs(P.x - ch.x) < 24 && Math.abs(P.y - ch.y) < 30) { ch.open = true; addCoins(10, ch.x, ch.y - 16); sfx('fanfare'); toast('Tajna kryjówka! +10 kamyczków'); }
    });
    L.springs.forEach(function (sp) { if (sp.squash > 0) sp.squash = Math.max(0, sp.squash - dt * 4); });
    // kruche półki
    L.crumbles.forEach(function (c) {
      if (c.s === 1) { c.t -= dt; if (c.t <= 0) { c.s = 2; c.t = 4; L.grid[c.y * L.W + c.x] = 0; if (!SIM) debris(c.x * TILE + 16, c.y * TILE); } }
      else if (c.s === 2 && !c.keep) { c.t -= dt; if (c.t <= 0 && !(Math.abs(P.x - (c.x * TILE + 16)) < 30 && Math.abs(P.y - c.y * TILE) < 60)) { c.s = 0; L.grid[c.y * L.W + c.x] = 4; } }
    });
    // przeciwnicy
    L.enemies.forEach(function (e) {
      if (!e.alive) return;
      var ex = e.x != null ? e.x : e.hx; if (ex < left || ex > right) return;
      if (e.type === 'roller') {
        if (!e.active) { if (e.x < (SIM ? P.x + 600 : cam.x + view.w + 40)) { e.delay = (e.delay || 0) - dt; if (e.delay <= 0) { e.active = true; e.vx = -(70 + e.sec * 8) * spd; } } else return; }
        e.vy += G * dt; e.x += e.vx * dt; e.y += e.vy * dt; e.rot += e.vx * dt / e.r;
        var row = Math.floor((e.y + e.r) / TILE), tv = tileAt(Math.floor(e.x / TILE), row);
        if (SOLID[tv] || ONEWAY[tv]) { e.y = row * TILE - e.r; e.vy = 0; }
        if (SOLID[tileAt(Math.floor((e.x + Math.sign(e.vx) * e.r) / TILE), Math.floor(e.y / TILE))]) e.vx = -e.vx;
        if (e.y > ROWS * TILE + 40 || e.x < left - 300) { e.alive = false; return; }
        if (tileAt(Math.floor(e.x / TILE), Math.floor(e.y / TILE)) === 3) { splash(e.x, e.y); e.alive = false; return; }
        collideEnemy(e, e.r);
      } else if (e.type === 'beetle' || e.type === 'spiky') {
        e.x += e.vx * dt;
        if (e.x < e.x0) { e.x = e.x0; e.vx = Math.abs(e.vx); }
        if (e.x > e.x1) { e.x = e.x1; e.vx = -Math.abs(e.vx); }
        e.cy = e.y - 10;
        collideEnemy({ type: e.type, x: e.x, y: e.y - 10, ref: e }, 12);
      } else if (e.type === 'bat') {
        e.t += dt;
        if (e.flee > 0) { e.flee -= dt; e.y -= 220 * dt; e.x += 60 * dt; if (e.flee <= 0) e.alive = false; return; }
        if (e.mode === 'swoop') {
          if (e.st === 0) { e.x = e.hx + Math.sin(e.t * 1.6) * 18; e.y = e.hy + Math.sin(e.t * 3) * 6; if (Math.abs(P.x - e.hx) < 170 && P.y > e.hy && P.nap <= 0) { e.st = 1; e.st_t = .5 / Math.sqrt(spd); } }
          else if (e.st === 1) { e.st_t -= dt; e.x = e.hx + Math.sin(e.t * 40) * 2; if (e.st_t <= 0) { e.st = 2; e.tx = P.x; e.ty = P.y - 20; e.st_t = 1.1; } }
          else if (e.st === 2) { var ddx = e.tx - e.x, ddy = e.ty - e.y, dd = Math.sqrt(ddx * ddx + ddy * ddy) || 1, v = 250 * spd * dt; e.st_t -= dt; if (dd < v || e.st_t <= 0) { e.st = 3; } else { e.x += ddx / dd * v; e.y += ddy / dd * v; } }
          else { var rx = e.hx - e.x, ryy = e.hy - e.y, rd = Math.sqrt(rx * rx + ryy * ryy) || 1, rv = 140 * dt; if (rd < rv) { e.x = e.hx; e.y = e.hy; e.st = 0; e.cool = 1.2; } else { e.x += rx / rd * rv; e.y += ryy / rd * rv; } }
          if (e.st === 0 && e.cool > 0) { e.cool -= dt; e.st = e.cool > 0 ? 0 : 0; if (e.cool > 0 && Math.abs(P.x - e.hx) < 170) { /* czeka */ } }
        } else { e.x = e.hx + Math.sin(e.t * 1.3 * spd) * 46; e.y = e.hy + Math.sin(e.t * 2.6 * spd) * 20; }
        if (e.cool > 0 && e.mode !== 'swoop') { e.cool -= dt; return; }
        collideEnemy(e, 11);
      }
    });
    // spadające kamienie
    L.rocks.forEach(function (r) {
      if (r.x < left || r.x > right) return;
      if (r.s === 0) { if (P.x > r.x - 150 && P.x < r.x + 30 && P.nap <= 0) { r.s = 1; r.t = r.warn; r.y = r.y0; } }
      else if (r.s === 1) { r.t -= dt; if (r.t <= 0) { r.s = 2; r.vy = 0; } }
      else if (r.s === 2) {
        r.vy += G * .8 * dt; r.y += r.vy * dt;
        var tr = tileAt(Math.floor(r.x / TILE), Math.floor((r.y + 12) / TILE));
        if (SOLID[tr] || ONEWAY[tr] || r.y > ROWS * TILE) { r.s = 3; r.t = 2.2; if (!SIM) puff(r.x, r.y + 10, 8, '#B9AC94'); sfx('pop'); return; }
        if (P.nap <= 0 && Math.abs(r.x - P.x) < P.w / 2 + 10 && r.y + 12 > P.y - P.h && r.y - 12 < P.y) { hurt(r.x); r.s = 3; r.t = 2.2; }
      } else { r.t -= dt; if (r.t <= 0) r.s = 0; }
    });
    // krople ze stalaktytów
    L.drippers.forEach(function (d) {
      if (d.x < left || d.x > right) return;
      d.t += dt;
      if (!d.drop && d.t >= d.period) { d.drop = { x: d.x, y: d.y + 10, vy: 0 }; d.t = 0; }
      if (d.drop) {
        var dr = d.drop; dr.vy += G * .6 * dt; dr.y += dr.vy * dt;
        var tv = tileAt(Math.floor(dr.x / TILE), Math.floor(dr.y / TILE));
        if (SOLID[tv] || tv === 3 || dr.y > ROWS * TILE) { splash(dr.x, Math.floor(dr.y / TILE) * TILE, '#9FD3F5'); d.drop = null; return; }
        if (P.nap <= 0 && Math.abs(dr.x - P.x) < P.w / 2 + 4 && dr.y > P.y - P.h && dr.y < P.y) { hurt(dr.x); splash(dr.x, dr.y, '#9FD3F5'); d.drop = null; }
      }
    });
    updateMinis(dt);
    L.landmarks.forEach(function (lm) {
      if (!lm.done && P.x >= lm.x - 10 && P.nap <= 0 && Math.abs(P.y - lm.y) < 80) { lm.done = true; startCelebration(lm); }
    });
  }

  function updateMinis(dt) {
    L.minis.forEach(function (m) {
      if (m.type === 'boulder') {
        if (m.done) return;
        if (!m.active) { if (P.x > m.trig && P.x < m.endX && P.nap <= 0) { m.active = true; m.x = P.x - 340; m.y = GROUND * TILE - m.r; toast('Uciekaj przed głazem!'); sfx('gate'); ev('boulder'); } else return; }
        m.x += m.v * dt; m.rot += m.v * dt / m.r;
        var best = null;
        for (var cx = Math.floor((m.x - m.r * .5) / TILE); cx <= Math.floor((m.x + m.r * .5) / TILE); cx++)
          for (var r = 2; r < ROWS; r++) { var v = tileAt(cx, r); if (SOLID[v] || ONEWAY[v]) { if (best == null || r < best) best = r; break; } }
        if (best != null) m.y = lerp(m.y, best * TILE - m.r, Math.min(1, dt * 10));
        if (m.x + m.r >= m.endX) { m.done = true; m.active = false; addCoins(3, m.x, m.y); if (!SIM) puff(m.x, m.y, 14, '#A9B2BF'); sfx('pop'); toast('Uff! Głaz rozbity.'); return; }
        var nx = clamp(m.x, P.x - P.w / 2, P.x + P.w / 2), ny = clamp(m.y, P.y - P.h, P.y);
        if ((m.x - nx) * (m.x - nx) + (m.y - ny) * (m.y - ny) < m.r * m.r && P.nap <= 0) {
          var had = P.inv <= 0; hurt(m.x, true); if (had) m.x = P.x - 300;
        }
      } else if (m.type === 'door') {
        var onPlate = P.onGround && Math.abs(P.x - m.plateX) < 22;
        if (onPlate && !m.on && !m.done) { m.open = true; m.t = m.T; sfx('gate'); ev('plate'); if (!m.toasted) { toast('Brama otwarta! Zdążysz, zanim się zamknie?'); m.toasted = 1; } }
        m.on = onPlate;
        if (m.open && !m.done) {
          m.t -= dt;
          if (P.x - P.w / 2 > m.x + 34) { m.done = true; }
          else if (m.t <= 0) { m.open = false; sfx('no'); if (P.x + P.w / 2 > m.x && P.x - P.w / 2 < m.x + 32) P.x = m.x - P.w / 2 - 2; }
        }
        m.lift = clamp(m.lift + (m.open ? dt * 4 : -dt * 4), 0, 1);
      } else if (m.type === 'bridge') {
        var onBridge = P.onGround && P.x > m.x0 && P.x < m.x1 && P.y <= GROUND * TILE + 1;
        if (m.wave < 0 && onBridge) { m.wave = m.x0 - 40; ev('bridge'); toast('Most się wali — biegnij!'); }
        if (m.wave >= m.x0 - 40) {
          m.wave += m.v * dt;
          m.idx.forEach(function (ci) { var c = L.crumbles[ci]; if (c.s === 0 && c.x * TILE + 16 < m.wave) { c.s = 1; c.t = .12; } });
          if (P.onGround && P.x < m.x0 - 20 && L.crumbles[m.idx[0]].s === 2) resetBridge(m);
        }
      }
    });
  }

  function collideEnemy(e, r) {
    if (P.nap > 0) return;
    var hw = P.w / 2, ref = e.ref || e;
    var nx = clamp(e.x, P.x - hw, P.x + hw), ny = clamp(e.y, P.y - P.h, P.y);
    var dx = e.x - nx, dy = e.y - ny;
    if (dx * dx + dy * dy > r * r) return;
    var stomp = P.vy > 60 && P.y - 6 < e.y;
    if (stomp && e.type !== 'spiky') {
      P.vy = -470; P.y = Math.min(P.y, e.y - r);
      if (e.type === 'roller' || e.type === 'beetle') { ref.alive = false; addCoins(e.type === 'beetle' ? 1 : 2, e.x, e.y); sfx('pop'); puff(e.x, e.y, 8, '#C9CED6'); ev('stomp'); }
      else { ref.flee = 1.4; addCoins(1, e.x, e.y); sfx('pop'); ev('stomp'); }
    } else if (e.type === 'bat') { bump(e.x); if (ref.mode === 'swoop') ref.st = 3; else ref.cool = .8; }
    else { hurt(e.x); if (e.type === 'spiky' && stomp) P.vy = -420; }
  }

  function puff(x, y, n, col) { if (SIM) return; if (reduceMotion) n = Math.min(n, 3); for (var i = 0; i < n; i++) particles.push({ x: x, y: y, vx: (Math.random() - .5) * 160, vy: -Math.random() * 120, life: .45, max: .45, col: col, size: 4 + Math.random() * 3, g: 200 }); }
  function sparkle(x, y) { if (SIM) return; for (var i = 0; i < (reduceMotion ? 2 : 6); i++) { var a = i / 6 * Math.PI * 2; particles.push({ x: x, y: y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, life: .35, max: .35, col: '#FFF4CF', size: 3, g: 0 }); } }
  function splash(x, y, col) { if (SIM) return; for (var i = 0; i < 7; i++) particles.push({ x: x, y: y, vx: (Math.random() - .5) * 200, vy: -100 - Math.random() * 180, life: .5, max: .5, col: col || '#8FD0E8', size: 3 + Math.random() * 2, g: 1100 }); sfx('drip'); }
  function debris(x, y) { for (var i = 0; i < 5; i++) particles.push({ x: x + (Math.random() - .5) * 28, y: y + 4, vx: (Math.random() - .5) * 60, vy: Math.random() * 60, life: .7, max: .7, col: '#8C6A43', size: 6, g: 1400 }); }
  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i]; p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }

  function updateCamera(dt) {
    var tx = clamp(P.x - view.w * .38, 0, L.W * TILE - view.w);
    cam.x = lerp(cam.x, tx, Math.min(1, dt * 8));
    var levelH = ROWS * TILE, bottomY = levelH + view.reserve, ty;
    if (view.h >= bottomY) ty = bottomY - view.h;
    else ty = clamp(P.y - view.h * .64, 0, bottomY - view.h);
    cam.y = lerp(cam.y, ty, Math.min(1, dt * 5));
  }

  /* ---------- 7. Rysowanie świata ---------- */
  var cv = $('game'), ctx = cv.getContext('2d'), shade = document.createElement('canvas'), sctx = shade.getContext('2d');

  function resize() {
    var w = window.innerWidth, h = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    shade.width = Math.round(w / 2); shade.height = Math.round(h / 2);
    var s = Math.min(h / ((w > h ? 13 : 12) * TILE), w / (10 * TILE));
    view.s = s; view.dpr = dpr; view.cssW = w; view.cssH = h;
    view.w = w / s; view.h = h / s;
    var padOn = !$('pad').hidden || padWanted();
    view.reserve = (h > w && padOn) ? 150 / s : 0;
    if (L && P) updateCamera(1);
  }
  function padWanted() { return ('ontouchstart' in window) || (window.matchMedia && matchMedia('(pointer: coarse)').matches) || window.innerWidth < 900; }

  function sectionBlend(px) {
    var secPx = L.SL * TILE, i = clamp(Math.floor(px / secPx), 0, L.sections.length - 1), d = px - i * secPx, BL = 160;
    if (d < BL && i > 0) { var m = (d + BL) / (2 * BL); return { a: L.sections[i - 1].terrain, b: L.sections[i].terrain, m: m }; }
    if (d > secPx - BL && i < L.sections.length - 1) { m = (d - (secPx - BL)) / (2 * BL); return { a: L.sections[i].terrain, b: L.sections[i + 1].terrain, m: m }; }
    return { a: L.sections[i].terrain, b: null, m: 0 };
  }

  function render() {
    var k = view.s * view.dpr, W = view.w, H = view.h;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = true;
    var bl = sectionBlend(cam.x + W / 2);
    drawBackground(ctx, bl.a, cam.x, cam.y, W, H, gameT);
    if (bl.b && bl.m > 0) { ctx.globalAlpha = bl.m; drawBackground(ctx, bl.b, cam.x, cam.y, W, H, gameT); ctx.globalAlpha = 1; }
    ctx.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k);
    drawCaveMouths();
    drawWind(true);
    drawTiles();
    drawTreasure();
    drawTracks();
    drawZips();
    drawMovers();
    drawLandmarks();
    drawGates();
    drawMinis();
    drawPlaques();
    drawSprings();
    drawCoins();
    drawHidden();
    drawItems();
    drawEnemies();
    drawPlayer();
    drawCarts();
    drawRocks();
    drawParticles();
    drawWind(false);
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
    sctx.fillStyle = 'rgba(2,8,22,' + (0.88 * w).toFixed(3) + ')';
    sctx.fillRect(0, 0, sw, sh);
    sctx.globalCompositeOperation = 'destination-out';
    var lantern = P.power === 'lantern';
    var R = ((lantern ? 290 : 135) + P.glow + (curHat === 'helmet' ? 55 : 0)) * (P.nap > 0 ? .8 : 1);
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
    L.coins.forEach(function (c) { if (!c.taken) hole(c.x, c.y, 24); });
    L.hidden.forEach(function (c) { if (!c.taken) hole(c.x, c.y, 34); });
    L.drippers.forEach(function (d) { hole(d.x, d.y + 14, 30); if (d.drop) hole(d.drop.x, d.drop.y, 34); });
    L.items.forEach(function (it) { if (it.alive) hole(it.x, it.y + (it.dy || 0), it.type === 'firefly' ? 46 : 36); });
    L.chestList.forEach(function (c) { if (!c.open) hole(c.x * TILE + 16, c.y * TILE + 16, 40); });
    L.carts.forEach(function (c) { hole(c.x, c.y - 10, 70); });
    L.raftRocks.forEach(function (r) { hole(r.x, r.top, 40); });
    L.plaques.forEach(function (q) { hole(q.x, q.y - 30, 60); });
    L.movers.forEach(function (m) { hole(m.x + m.w / 2, m.y, 60); });
    L.enemies.forEach(function (e) { if (e.alive) hole(e.x != null ? e.x : e.hx, (e.y != null ? e.y : e.hy) - 8, 40); });
    L.minis.forEach(function (m) { if (m.type === 'door') { hole(m.plateX, m.g * TILE, 60); hole(m.x + 16, m.g * TILE - 90, 90); } });
    for (var cx = Math.floor(cam.x / TILE); cx < (cam.x + view.w) / TILE; cx++) for (var ry = 0; ry < ROWS; ry++) if (tileAt(cx, ry) === 7) hole(cx * TILE + 16, ry * TILE + 16, 30);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(shade, 0, 0, cv.width, cv.height);
    if (lantern) {
      var k = view.s * view.dpr;
      ctx.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k);
      var gg = ctx.createRadialGradient(P.x, P.y - 22, 10, P.x, P.y - 22, R);
      gg.addColorStop(0, 'rgba(255,214,120,.16)'); gg.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = gg; ctx.fillRect(P.x - R, P.y - 22 - R, R * 2, R * 2);
    }
  }

  function drawCaveMouths() {
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
    var Wd = L.W;
    function sol(x, y) { var v = L.grid[y * Wd + x]; return v === 1 || v === 5 || v === 6; }
    for (var x = Math.max(0, c0); x <= Math.min(Wd - 1, c1); x++) {
      var tk = L.sections[L.sec[x]].terrain, T = TER[tk];
      for (var y = r0; y <= r1; y++) {
        var ty = y < 0 ? 0 : y >= ROWS ? ROWS - 1 : y;
        var v = L.grid[ty * Wd + x];
        var solidLike = v === 1 || v === 5 || v === 6;
        if ((v === 8 || v === 9) && y === ty) { drawChest(x * TILE, y * TILE, v === 9, L.chestList[L.chestAt[ty * Wd + x]]); continue; }
        if (y < 0 && !solidLike) continue;
        var px = x * TILE, py = y * TILE;
        if (solidLike) {
          var up = y <= 0 ? (tk === 'cave' ? true : false) : (y > ROWS ? true : sol(x, Math.min(ROWS - 1, y - 1)));
          var dn = (y < 0 || y + 1 >= ROWS) ? true : sol(x, y + 1);
          var lf = x > 0 ? sol(x - 1, ty) : true, rt = x < Wd - 1 ? sol(x + 1, ty) : true;
          drawSolid(T, tk, px, py, !up, !dn && y < ROWS, !lf, !rt, hashXY(x, y));
          if (v === 5 && !up) { ctx.fillStyle = 'rgba(160,220,255,.65)'; ctx.fillRect(px, py, TILE, 3); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(px + (hashXY(x, 1) % 20), py + 1, 8, 2); }
          if (v === 6) { ctx.strokeStyle = 'rgba(14,26,43,.18)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px + 10, py + 6); ctx.lineTo(px + 16, py + 14); ctx.lineTo(px + 12, py + 22); ctx.stroke(); }
        } else if (v === 2 && y === ty) {
          drawPlatform(T, tk, px, py, L.grid[ty * Wd + x - 1] === 2, L.grid[ty * Wd + x + 1] === 2);
        } else if (v === 4 && y === ty) {
          var c = L.crumbles[L.crumbleAt[ty * Wd + x]], sh = c && c.s === 1 ? (Math.sin(gameT * 60) * 1.5) : 0;
          ctx.fillStyle = '#5A3E22'; ctx.fillRect(px + sh, py, TILE, 12);
          ctx.fillStyle = '#B58A55'; ctx.fillRect(px + 1 + sh, py + 1, TILE - 2, 8);
          ctx.strokeStyle = '#5A3E22'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px + 9 + sh, py + 1); ctx.lineTo(px + 13 + sh, py + 9); ctx.moveTo(px + 22 + sh, py + 1); ctx.lineTo(px + 19 + sh, py + 9); ctx.stroke();
        } else if (v === 3) {
          var surf = y === ty && (y === 0 || L.grid[(y - 1) * Wd + x] !== 3);
          ctx.fillStyle = 'rgba(54,140,150,.85)'; ctx.fillRect(px, py + (surf ? 8 : 0), TILE, TILE - (surf ? 8 : 0));
          if (surf) {
            ctx.fillStyle = '#7CC8C4'; var wv = reduceMotion ? 0 : Math.sin(gameT * 3 + x) * 2;
            ctx.fillRect(px, py + 7 + wv, TILE, 3);
            ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(px + 6 + (x % 3) * 6, py + 13, 8, 2);
          }
        } else if (v === 7 && y === ty && ty > 0 && sol(x, ty - 1)) { // zwisające kolce (nacieki)
          ctx.fillStyle = '#0E1A2B'; ctx.beginPath();
          for (var i2 = 0; i2 < 4; i2++) { ctx.moveTo(px + i2 * 8, py); ctx.lineTo(px + i2 * 8 + 4, py + 22); ctx.lineTo(px + i2 * 8 + 8, py); }
          ctx.fill(); ctx.fillStyle = '#C9E6FF'; ctx.beginPath();
          for (i2 = 0; i2 < 4; i2++) { ctx.moveTo(px + i2 * 8 + 1.5, py); ctx.lineTo(px + i2 * 8 + 4, py + 18); ctx.lineTo(px + i2 * 8 + 6.5, py); }
          ctx.fill();
        } else if (v === 7 && y === ty) { // kolce
          ctx.fillStyle = '#0E1A2B'; ctx.beginPath();
          for (var i = 0; i < 4; i++) { ctx.moveTo(px + i * 8, py + TILE); ctx.lineTo(px + i * 8 + 4, py + 10); ctx.lineTo(px + i * 8 + 8, py + TILE); }
          ctx.fill();
          ctx.fillStyle = tk === 'cave' ? '#C9E6FF' : '#E8E2D6'; ctx.beginPath();
          for (i = 0; i < 4; i++) { ctx.moveTo(px + i * 8 + 1.5, py + TILE); ctx.lineTo(px + i * 8 + 4, py + 13); ctx.lineTo(px + i * 8 + 6.5, py + TILE); }
          ctx.fill();
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
    if (bottom && tk === 'cave') {
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
  function drawMovers() {
    L.movers.forEach(function (m) {
      if (m.x + m.w < cam.x - 20 || m.x > cam.x + view.w + 20) return;
      if (m.ax === 'raft') {
        for (var li = 0; li < 3; li++) { ctx.fillStyle = '#4A2F17'; roundRect(ctx, m.x - 1, m.y + li * 9 - 1, m.w + 2, 11, 5); ctx.fill(); ctx.fillStyle = li % 2 ? '#8C5E2E' : '#A9763D'; roundRect(ctx, m.x, m.y + li * 9, m.w, 9, 4.5); ctx.fill(); }
        ctx.fillStyle = '#C81E36'; ctx.fillRect(m.x + 8, m.y - 30, 3, 30); ctx.beginPath(); ctx.moveTo(m.x + 11, m.y - 30); ctx.lineTo(m.x + 28, m.y - 24); ctx.lineTo(m.x + 11, m.y - 18); ctx.fill();
        return;
      }
      if (m.log) {
        ctx.fillStyle = '#4A2F17'; roundRect(ctx, m.x - 1, m.y - 1, m.w + 2, 16, 8); ctx.fill();
        ctx.fillStyle = '#9A6A35'; roundRect(ctx, m.x, m.y, m.w, 14, 7); ctx.fill();
        ctx.fillStyle = '#C99A60'; ctx.beginPath(); ell(ctx, m.x + m.w - 6, m.y + 7, 4, 5, 0); ctx.fill();
        ctx.strokeStyle = '#6B4522'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(m.x + 8, m.y + 5); ctx.lineTo(m.x + m.w - 18, m.y + 5); ctx.stroke();
      } else {
        if (m.ax === 'y') { ctx.strokeStyle = 'rgba(14,26,43,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(m.x + 6, m.y); ctx.lineTo(m.x + 6, m.y - 500); ctx.moveTo(m.x + m.w - 6, m.y); ctx.lineTo(m.x + m.w - 6, m.y - 500); ctx.stroke(); }
        ctx.fillStyle = '#062A58'; ctx.fillRect(m.x - 1, m.y - 1, m.w + 2, 14);
        ctx.fillStyle = '#FFC629'; ctx.fillRect(m.x, m.y, m.w, 9);
        ctx.fillStyle = '#0B4EA2'; ctx.fillRect(m.x, m.y + 9, m.w, 3);
        ctx.fillStyle = '#3B2A00'; for (var i = 8; i < m.w; i += 16) ctx.fillRect(m.x + i, m.y + 3, 6, 3);
      }
    });
  }
  function drawChest(x, y, open, c) {
    ctx.fillStyle = '#3B2A00'; ctx.fillRect(x + 1, y + 6, 30, 26);
    ctx.fillStyle = c && c.locked ? '#7D6A55' : '#9A6A35'; ctx.fillRect(x + 3, y + 14, 26, 16);
    ctx.fillStyle = '#3B2A00'; if (open) ctx.fillRect(x + 1, y - 4, 30, 8); 
    ctx.fillStyle = open ? '#C99A2E' : '#FFC629'; if (open) ctx.fillRect(x + 2, y - 3, 28, 6); else ctx.fillRect(x + 3, y + 8, 26, 6);
    ctx.fillStyle = '#3B2A00'; ctx.fillRect(x + 13, y + 12, 6, 7);
    if (c && c.locked) { ctx.strokeStyle = '#0E1A2B'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x + 16, y + 12, 4, Math.PI, 0); ctx.stroke(); }
    if (!open && !reduceMotion && Math.sin(gameT * 3 + x) > .7) { ctx.fillStyle = 'rgba(255,244,207,.9)'; ctx.fillRect(x + 24, y + 4, 3, 3); }
  }
  function drawGoldChest(c, x, y, s, open, t) { // złota skrzynia: (x, y) = środek dna
    c.save(); c.translate(x, y); c.scale(s, s);
    if (!reduceMotion || open) {
      var gl = c.createRadialGradient(0, -14, 2, 0, -14, open ? 44 : 30);
      gl.addColorStop(0, 'rgba(255,230,140,' + (open ? .85 : .55 + .2 * Math.sin(t * 3)) + ')'); gl.addColorStop(1, 'rgba(255,230,140,0)');
      c.fillStyle = gl; c.fillRect(-46, -60, 92, 80);
    }
    c.fillStyle = '#3B2A00'; c.fillRect(-17, -22, 34, 22);
    c.fillStyle = '#E8A912'; c.fillRect(-15, -20, 30, 18);
    c.fillStyle = '#FFD95A'; c.fillRect(-15, -20, 30, 4);
    c.fillStyle = '#3B2A00'; c.fillRect(-11, -20, 3, 18); c.fillRect(8, -20, 3, 18);
    if (open) {
      c.fillStyle = '#3B2A00'; c.fillRect(-17, -34, 34, 10);
      c.fillStyle = '#FFC629'; c.fillRect(-15, -32, 30, 6);
      c.fillStyle = '#FFF4CF'; for (var i = 0; i < 4; i++) { c.beginPath(); ell(c, -9 + i * 6, -23, 3, 3, 0); c.fill(); }
    } else {
      c.fillStyle = '#3B2A00'; c.beginPath(); c.moveTo(-17, -22); c.quadraticCurveTo(0, -38, 17, -22); c.fill();
      c.fillStyle = '#FFC629'; c.beginPath(); c.moveTo(-15, -23); c.quadraticCurveTo(0, -35, 15, -23); c.fill();
      c.fillStyle = '#C81E36'; c.fillRect(-3, -25, 6, 8);
      if (!reduceMotion && Math.sin(t * 4) > .6) { c.fillStyle = '#FFF4CF'; c.fillRect(10, -32, 3, 3); c.fillRect(-14, -28, 2, 2); }
    }
    c.restore();
  }
  function drawTreasure() {
    var T = L.treasure; if (!T || T.x1 < cam.x - 80 || T.x0 > cam.x + view.w + 80) return;
    var g = ctx.createLinearGradient(0, T.y0, 0, T.y1);
    g.addColorStop(0, 'rgba(59,42,0,.55)'); g.addColorStop(1, 'rgba(120,80,10,.45)');
    ctx.fillStyle = g; ctx.fillRect(T.x0, T.y0, T.x1 - T.x0, T.y1 - T.y0);
    ctx.fillStyle = 'rgba(255,198,41,.35)'; for (var i = 0; i < 4; i++) ctx.fillRect(T.x0 + 44 + i * 36, T.y0 + 10, 4, 4);
    drawGoldChest(ctx, T.x, T.y, 1, T.open, gameT);
  }
  function drawPuIcon(kind, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = '#0E1A2B'; ctx.beginPath(); ell(ctx, 0, 0, 14, 14, 0); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ell(ctx, 0, 0, 12.5, 12.5, 0); ctx.fill();
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    if (kind === 'magnet') { ctx.strokeStyle = '#C81E36'; ctx.beginPath(); ctx.arc(0, -1, 5.5, Math.PI, 0, true); ctx.moveTo(-5.5, -1); ctx.lineTo(-5.5, -6); ctx.moveTo(5.5, -1); ctx.lineTo(5.5, -6); ctx.stroke(); }
    else if (kind === 'lantern') { ctx.fillStyle = '#FFC629'; ctx.fillRect(-4, -5, 8, 10); ctx.strokeStyle = '#3B2A00'; ctx.lineWidth = 2; ctx.strokeRect(-4, -5, 8, 10); ctx.beginPath(); ctx.arc(0, -6, 3, Math.PI, 0); ctx.stroke(); }
    else if (kind === 'doublejump') { ctx.strokeStyle = '#0B4EA2'; ctx.beginPath(); ctx.moveTo(-5, 1); ctx.lineTo(0, -4); ctx.lineTo(5, 1); ctx.moveTo(-5, 6); ctx.lineTo(0, 1); ctx.lineTo(5, 6); ctx.stroke(); }
    else if (kind === 'glide') { ctx.fillStyle = '#1F7A48'; ctx.beginPath(); ctx.moveTo(-7, 4); ctx.quadraticCurveTo(-4, -8, 7, -5); ctx.quadraticCurveTo(4, 6, -7, 4); ctx.fill(); }
    else if (kind === 'balloon') { ctx.fillStyle = '#C81E36'; ctx.beginPath(); ell(ctx, 0, -2, 5.5, 6.5, 0); ctx.fill(); ctx.strokeStyle = '#3B2A00'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 4.5); ctx.lineTo(0, 9); ctx.stroke(); }
    ctx.restore();
  }
  function drawItems() {
    L.items.forEach(function (it) {
      if (!it.alive || it.x < cam.x - 40 || it.x > cam.x + view.w + 40) return;
      if (it.life > 0 && it.life < 1.6 && Math.floor(it.life * 8) % 2) return; // miga
      var b = reduceMotion ? 0 : Math.sin(gameT * 3 + it.x) * 2;
      if (it.type === 'firefly') {
        var y = it.y + (it.dy || 0), gl = ctx.createRadialGradient(it.x, y, 1, it.x, y, 16);
        gl.addColorStop(0, 'rgba(230,255,140,.95)'); gl.addColorStop(1, 'rgba(230,255,140,0)');
        ctx.fillStyle = gl; ctx.fillRect(it.x - 16, y - 16, 32, 32);
        ctx.fillStyle = '#F6FF9E'; ctx.beginPath(); ell(ctx, it.x, y, 3, 3, 0); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ell(ctx, it.x - 4, y - 3, 3, 1.6, 0); ell(ctx, it.x + 4, y - 3, 3, 1.6, 0); ctx.fill();
      } else if (it.type === 'pu') drawPuIcon(it.kind, it.x, it.y + b, 1.15);
      else if (it.type === 'hat') {
        var gl2 = ctx.createRadialGradient(it.x, it.y, 2, it.x, it.y, 28); gl2.addColorStop(0, 'rgba(255,198,41,.6)'); gl2.addColorStop(1, 'rgba(255,198,41,0)');
        ctx.fillStyle = gl2; ctx.fillRect(it.x - 28, it.y - 28, 56, 56);
        ctx.save(); ctx.translate(it.x - 2, it.y + 26 + b); ctx.scale(1.4, 1.4); drawHat(ctx, it.kind); ctx.restore();
      }
    });
  }
  function drawZips() {
    L.zips.forEach(function (z) {
      if (z.x1 < cam.x - 40 || z.x0 > cam.x + view.w + 40) return;
      [[z.x0 - 10, z.y0], [z.x1 + 6, z.y1]].forEach(function (pt) { var gy = groundBelow(pt[0], pt[1]); ctx.fillStyle = '#3B2A00'; ctx.fillRect(pt[0] - 5, pt[1] - 14, 10, gy - pt[1] + 14); ctx.fillStyle = '#8C6A43'; ctx.fillRect(pt[0] - 4, pt[1] - 13, 8, gy - pt[1] + 13); });
      ctx.strokeStyle = '#0E1A2B'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(z.x0 - 10, z.y0); ctx.lineTo(z.x1 + 6, z.y1); ctx.stroke();
      var hx = P.zip >= 0 && L.zips[P.zip] === z ? P.x : z.x0 + 12, hy = zipY(z, hx);
      ctx.fillStyle = '#0B4EA2'; ctx.beginPath(); ell(ctx, hx, hy, 6, 6, 0); ctx.fill();
      ctx.fillStyle = '#FFC629'; ctx.fillRect(hx - 12, hy + 6, 24, 4);
      ctx.strokeStyle = '#0B4EA2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx, hy + 6); ctx.stroke();
      if (P.zip < 0 && Math.abs(P.x - z.x0) < 200) { ctx.fillStyle = '#062A58'; ctx.font = '900 18px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('tyrolka', z.x0 + 10, z.y0 - 22); }
    });
  }
  function drawTracks() {
    L.carts.forEach(function (c) {
      if (c.main[c.main.length - 1][0] < cam.x - 60 || c.main[0][0] > cam.x + view.w + 60) return;
      [c.main, c.up].forEach(function (pts, k) {
        ctx.strokeStyle = '#3B2A00'; ctx.lineWidth = 2;
        for (var i = 1; i < pts.length; i++) {
          var a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
          for (var d = 0; d < l; d += 64) { var px = a[0] + (b[0] - a[0]) * d / l, py = a[1] + (b[1] - a[1]) * d / l + 4, gy = groundBelow(px, py + 2); ctx.fillStyle = '#4A2F17'; ctx.fillRect(px - 2, py, 4, Math.min(gy, ROWS * TILE) - py); }
          ctx.fillStyle = '#6B4522'; for (d = 0; d < l; d += 12) ctx.fillRect(a[0] + (b[0] - a[0]) * d / l - 1, a[1] + (b[1] - a[1]) * d / l, 3, 6);
          ctx.strokeStyle = k ? '#B9C6D8' : '#D3DDEA'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        }
      });
      var j = c.main[1];
      ctx.fillStyle = '#3B2A00'; ctx.fillRect(j[0] - 30, j[1] - 60, 5, 60);
      ctx.fillStyle = '#FFC629'; ctx.beginPath(); ell(ctx, j[0] - 28, j[1] - 66, 13, 13, 0); ctx.fill();
      ctx.strokeStyle = '#0E1A2B'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.beginPath();
      if (c.branch) { ctx.moveTo(j[0] - 34, j[1] - 60); ctx.lineTo(j[0] - 22, j[1] - 72); ctx.lineTo(j[0] - 30, j[1] - 72); ctx.moveTo(j[0] - 22, j[1] - 72); ctx.lineTo(j[0] - 22, j[1] - 64); }
      else { ctx.moveTo(j[0] - 36, j[1] - 66); ctx.lineTo(j[0] - 20, j[1] - 66); ctx.lineTo(j[0] - 26, j[1] - 71); ctx.moveTo(j[0] - 20, j[1] - 66); ctx.lineTo(j[0] - 26, j[1] - 61); }
      ctx.stroke();
      if (P.cart >= 0 && L.carts[P.cart] === c && c.s < c.jS) { ctx.fillStyle = '#FFC629'; ctx.font = '900 18px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Skok = tajny tor ↗', j[0], j[1] - 92); }
    });
  }
  function drawCarts() {
    L.carts.forEach(function (c) {
      if (c.x < cam.x - 60 || c.x > cam.x + view.w + 60) return;
      ctx.fillStyle = '#0E1A2B'; ctx.beginPath(); ell(ctx, c.x - 11, c.y - 2, 5, 5, 0); ell(ctx, c.x + 11, c.y - 2, 5, 5, 0); ctx.fill();
      ctx.fillStyle = '#062A58'; ctx.beginPath(); ctx.moveTo(c.x - 21, c.y - 26); ctx.lineTo(c.x + 21, c.y - 26); ctx.lineTo(c.x + 17, c.y - 5); ctx.lineTo(c.x - 17, c.y - 5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#0B4EA2'; ctx.fillRect(c.x - 18, c.y - 23, 36, 14);
      ctx.fillStyle = '#FFC629'; ctx.fillRect(c.x - 21, c.y - 27, 42, 4);
    });
    L.raftRocks.forEach(function (r) {
      if (r.x < cam.x - 40 || r.x > cam.x + view.w + 40) return;
      ctx.fillStyle = '#1E2C44'; ctx.beginPath(); ctx.moveTo(r.x - 15, r.top + 46); ctx.lineTo(r.x - 8, r.top); ctx.lineTo(r.x + 5, r.top - 4); ctx.lineTo(r.x + 15, r.top + 46); ctx.fill();
      ctx.fillStyle = '#5C6F8E'; ctx.beginPath(); ctx.moveTo(r.x - 11, r.top + 44); ctx.lineTo(r.x - 6, r.top + 3); ctx.lineTo(r.x + 4, r.top); ctx.lineTo(r.x + 11, r.top + 44); ctx.fill();
    });
  }
  function drawPlaques() {
    L.plaques.forEach(function (q) {
      if (q.x < cam.x - 60 || q.x > cam.x + view.w + 60) return;
      ctx.fillStyle = '#6E614D'; ctx.fillRect(q.x - 3, q.y - 30, 6, 30);
      ctx.fillStyle = '#0E1A2B'; ctx.fillRect(q.x - 22, q.y - 70, 44, 42);
      ctx.fillStyle = '#E8DEC8'; ctx.fillRect(q.x - 20, q.y - 68, 40, 38);
      var cols = ['#0B4EA2', '#FFC629', '#1F7A48', '#C81E36', '#E8A04B', '#0B4EA2', '#1F7A48', '#FFC629'];
      for (var i = 0; i < 9; i++) { if (i === 8 && !q.solved) continue; ctx.fillStyle = cols[(i * (q.solved ? 1 : 5)) % 8]; ctx.fillRect(q.x - 18 + (i % 3) * 12.3, q.y - 66 + Math.floor(i / 3) * 11.6, 11, 10.5); }
      if (!q.solved && Math.abs(P.x - q.x) < 160) { ctx.fillStyle = '#062A58'; ctx.font = '900 18px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Skok przy tablicy = mozaika', q.x, q.y - 84); }
    });
  }
  function drawWind(back) {
    L.winds.forEach(function (w) {
      if (w.x1 < cam.x || w.x0 > cam.x + view.w) return;
      var ph = (gameT + w.ph) % w.per, active = ph < w.on, soon = !active && ph > w.per - .7;
      var a = active ? .55 : soon ? .25 : .08;
      ctx.strokeStyle = 'rgba(255,255,255,' + (back ? a * .5 : a) + ')'; ctx.lineWidth = back ? 2 : 3; ctx.lineCap = 'round';
      ctx.beginPath();
      for (var i = 0; i < (back ? 10 : 7); i++) {
        var yy = 60 + ((i * 97 + (back ? 31 : 0)) % 300), sp = reduceMotion ? 0 : (gameT * (active ? 520 : 120) + i * 211) % (w.x1 - w.x0 + 200);
        var xx = w.x1 + 100 - sp;
        if (xx < w.x0 - 60) continue;
        ctx.moveTo(xx, yy); ctx.quadraticCurveTo(xx - 20, yy - 6, xx - (back ? 30 : 46), yy);
      }
      ctx.stroke();
    });
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
  function drawHidden() {
    L.hidden.forEach(function (h) {
      if (h.taken || h.x < cam.x - 40 || h.x > cam.x + view.w + 40) return;
      var b = reduceMotion ? 0 : Math.sin(gameT * 2.4 + h.x) * 3;
      ctx.save(); ctx.translate(h.x, h.y + b); ctx.rotate(.12);
      var gl = ctx.createRadialGradient(0, 0, 4, 0, 0, 30); gl.addColorStop(0, 'rgba(255,198,41,.6)'); gl.addColorStop(1, 'rgba(255,198,41,0)');
      ctx.fillStyle = gl; ctx.fillRect(-30, -30, 60, 60);
      drawSticker(ctx, stopIcons[h.sec], 34);
      ctx.restore();
    });
  }
  function drawEnemies() {
    L.enemies.forEach(function (e) {
      if (!e.alive) return;
      var ex = e.x != null ? e.x : e.hx; if (ex < cam.x - 60 || ex > cam.x + view.w + 60) return;
      if (e.type === 'roller') {
        ctx.save(); ctx.translate(e.x, e.y);
        ctx.fillStyle = '#3F4756'; ctx.beginPath(); ell(ctx, 0, 0, e.r + 1.5, e.r + 1.5, 0); ctx.fill();
        ctx.fillStyle = '#A9B2BF'; ctx.beginPath(); ell(ctx, 0, 0, e.r, e.r, 0); ctx.fill();
        ctx.save(); ctx.rotate(e.rot); ctx.strokeStyle = '#7D8796'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(0, 1); ctx.lineTo(5, -2); ctx.moveTo(-2, 6); ctx.lineTo(3, 4); ctx.stroke(); ctx.restore();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ell(ctx, -4, -2, 3, 3.4, 0); ell(ctx, 3, -2, 3, 3.4, 0); ctx.fill();
        ctx.fillStyle = '#0E1A2B'; ctx.beginPath(); ell(ctx, -5, -1.5, 1.6, 2, 0); ell(ctx, 2, -1.5, 1.6, 2, 0); ctx.fill();
        ctx.restore();
      } else if (e.type === 'beetle') {
        var f = e.vx < 0 ? -1 : 1, st = Math.sin(gameT * 20) * 1.5;
        ctx.save(); ctx.translate(e.x, e.y); ctx.scale(f, 1);
        ctx.strokeStyle = '#0E1A2B'; ctx.lineWidth = 2; ctx.beginPath();
        for (var i = -1; i <= 1; i++) { ctx.moveTo(i * 6, -4); ctx.lineTo(i * 6 + (i ? st : -st), 0); } ctx.stroke();
        ctx.fillStyle = '#0E1A2B'; ctx.beginPath(); ell(ctx, 0, -9, 13, 9, 0); ctx.fill();
        ctx.fillStyle = '#1F7A48'; ctx.beginPath(); ell(ctx, -1, -10, 11, 7.5, 0); ctx.fill();
        ctx.fillStyle = '#5FBF83'; ctx.beginPath(); ell(ctx, -4, -13, 4, 2, 0); ctx.fill();
        ctx.fillStyle = '#0E1A2B'; ctx.fillRect(-1, -17, 1.5, 15);
        ctx.beginPath(); ell(ctx, 11, -8, 5, 5, 0); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ell(ctx, 12.5, -9, 2, 2.2, 0); ctx.fill();
        ctx.restore();
      } else if (e.type === 'spiky') { // kolczak (łupina kasztana) — nie wolno na niego skakać
        ctx.save(); ctx.translate(e.x, e.y - 12);
        var rot = reduceMotion ? 0 : gameT * (e.vx > 0 ? 2 : -2);
        ctx.fillStyle = '#3B2A00'; ctx.beginPath();
        for (i = 0; i < 12; i++) { var a = rot + i / 12 * Math.PI * 2, a2 = a + Math.PI / 12; ctx.lineTo(Math.cos(a) * 18, Math.sin(a) * 18); ctx.lineTo(Math.cos(a2) * 10, Math.sin(a2) * 10); }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#C81E36'; ctx.beginPath(); ell(ctx, 0, 0, 10.5, 10.5, 0); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ell(ctx, -3.5, -2, 2.6, 3, 0); ell(ctx, 3.5, -2, 2.6, 3, 0); ctx.fill();
        ctx.fillStyle = '#0E1A2B'; ctx.beginPath(); ell(ctx, -3, -1.5, 1.3, 1.6, 0); ell(ctx, 4, -1.5, 1.3, 1.6, 0); ctx.fill();
        ctx.restore();
      } else {
        var flap = reduceMotion ? .5 : (Math.sin(e.t * (e.st === 1 ? 40 : 18)) * .5 + .5);
        ctx.save(); ctx.translate(e.x, e.y);
        ctx.fillStyle = e.mode === 'swoop' ? '#4A2E5A' : '#2E3550';
        ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(-20, -8 + flap * 14); ctx.lineTo(-14, 2); ctx.lineTo(-8, 4); ctx.closePath();
        ctx.moveTo(4, -2); ctx.lineTo(20, -8 + flap * 14); ctx.lineTo(14, 2); ctx.lineTo(8, 4); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ell(ctx, 0, 0, 8.5, 8, 0); ctx.moveTo(-6, -5); ctx.lineTo(-4, -12); ctx.lineTo(-1, -6); ctx.moveTo(6, -5); ctx.lineTo(4, -12); ctx.lineTo(1, -6); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ell(ctx, -3, -1, 2.6, 2.8, 0); ell(ctx, 3, -1, 2.6, 2.8, 0); ctx.fill();
        ctx.fillStyle = '#0E1A2B'; ctx.beginPath(); ell(ctx, -2.6, -.6, 1.3, 1.6, 0); ell(ctx, 3.4, -.6, 1.3, 1.6, 0); ctx.fill();
        ctx.fillStyle = 'rgba(240,120,140,.7)'; ctx.beginPath(); ell(ctx, -5, 3, 1.6, 1, 0); ell(ctx, 5, 3, 1.6, 1, 0); ctx.fill();
        if (e.st === 1) { ctx.fillStyle = '#FFC629'; ctx.font = '900 18px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', 0, -16); }
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
  function drawRocks() {
    L.rocks.forEach(function (r) {
      if (r.x < cam.x - 40 || r.x > cam.x + view.w + 40 || r.s === 0 || r.s === 3) return;
      var gy = groundBelow(r.x, Math.max(r.y, 0) + 14);
      var k = r.s === 1 ? 1 - r.t / r.warn : 1;
      ctx.fillStyle = 'rgba(14,26,43,' + (.15 + .25 * k).toFixed(2) + ')'; ctx.beginPath(); ell(ctx, r.x, gy - 2, 8 + 10 * k, 3 + 2 * k, 0); ctx.fill();
      var ry = r.s === 1 ? Math.max(r.y0, cam.y + 6) : r.y, sh = r.s === 1 ? Math.sin(gameT * 50) * 2 : 0;
      if (r.s === 1 && !reduceMotion && Math.random() < .3) particles.push({ x: r.x + (Math.random() - .5) * 20, y: ry + 10, vx: 0, vy: 60, life: .4, max: .4, col: '#B9AC94', size: 3, g: 500 });
      ctx.save(); ctx.translate(r.x + sh, ry);
      ctx.fillStyle = '#3F3529'; ctx.beginPath(); ctx.moveTo(-14, 2); ctx.lineTo(-10, -11); ctx.lineTo(4, -14); ctx.lineTo(14, -4); ctx.lineTo(11, 11); ctx.lineTo(-6, 13); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#9C8E77'; ctx.beginPath(); ctx.moveTo(-11, 1); ctx.lineTo(-8, -9); ctx.lineTo(3, -11); ctx.lineTo(11, -3); ctx.lineTo(9, 9); ctx.lineTo(-5, 10); ctx.closePath(); ctx.fill();
      ctx.restore();
    });
  }
  function drawMinis() {
    L.minis.forEach(function (m) {
      if (m.type === 'boulder' && m.active) {
        ctx.save(); ctx.translate(m.x, m.y);
        ctx.fillStyle = 'rgba(14,26,43,.2)'; ctx.beginPath(); ell(ctx, 0, m.r - 2, m.r, 6, 0); ctx.fill();
        ctx.rotate(m.rot);
        ctx.fillStyle = '#3F4756'; ctx.beginPath(); ell(ctx, 0, 0, m.r + 2, m.r + 2, 0); ctx.fill();
        ctx.fillStyle = '#9AA3AF'; ctx.beginPath(); ell(ctx, 0, 0, m.r, m.r, 0); ctx.fill();
        ctx.fillStyle = '#7D8796'; ctx.beginPath(); ell(ctx, -12, -10, 9, 6, 0); ell(ctx, 14, 12, 7, 5, 0); ell(ctx, 10, -18, 5, 4, 0); ctx.fill();
        ctx.restore();
      } else if (m.type === 'door') {
        if (m.x < cam.x - 300 || m.plateX > cam.x + view.w + 300) return;
        // płyta
        ctx.fillStyle = '#062A58'; ctx.fillRect(m.plateX - 20, m.g * TILE - (m.on ? 3 : 7), 40, m.on ? 3 : 7);
        ctx.fillStyle = m.open && !m.done ? '#1F7A48' : '#FFC629'; ctx.fillRect(m.plateX - 18, m.g * TILE - (m.on ? 3 : 6), 36, m.on ? 2 : 4);
        // brama
        var base = m.g * TILE, H = 4 * TILE, lift = ease(m.lift) * (H - 20);
        ctx.save(); ctx.beginPath(); ctx.rect(m.x - 4, base - H, 40, H); ctx.clip();
        for (var i = 0; i < 4; i++) { ctx.fillStyle = '#0E1A2B'; ctx.fillRect(m.x + 1 + i * 8, base - H - lift, 6, H); ctx.fillStyle = '#5C6F8E'; ctx.fillRect(m.x + 2 + i * 8, base - H - lift, 4, H); }
        ctx.restore();
        ctx.fillStyle = '#2B3D5A'; ctx.fillRect(m.x - 10, base - H - 10, 52, 12);
        if (m.open && !m.done) {
          ctx.fillStyle = '#FFC629'; ctx.font = '900 26px system-ui,sans-serif'; ctx.textAlign = 'center';
          var s = Math.ceil(m.t);
          ctx.fillText(s + ' s', m.x + 16, base - H - 18); ctx.fillText(s + ' s', m.plateX, m.g * TILE - 64);
        } else if (!m.done) {
          ctx.fillStyle = '#FFC629'; ctx.font = '900 18px system-ui,sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('stań na płycie', m.plateX, m.g * TILE - 60);
        }
      }
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
      var lift = ease(gt.lift) * (H - 26);
      ctx.save(); ctx.beginPath(); ctx.rect(x - 4, base - H, 40, H); ctx.clip();
      for (var i = 0; i < 4; i++) {
        ctx.fillStyle = '#3B2A00'; ctx.fillRect(x + 1 + i * 8, base - H - lift, 6, H);
        ctx.fillStyle = '#C99A2E'; ctx.fillRect(x + 2 + i * 8, base - H - lift, 4, H);
      }
      ctx.fillStyle = '#3B2A00'; ctx.fillRect(x - 2, base - H * .35 - lift, 36, 5);
      ctx.restore();
      [x - 12, x + 32].forEach(function (px) {
        ctx.fillStyle = 'rgba(14,26,43,.45)'; ctx.fillRect(px - 1, base - H - 1, 14, H + 1);
        ctx.fillStyle = T.top === '#3E9A5C' || T.top === '#3F9358' ? '#D9CDB4' : T.topHi; ctx.fillRect(px, base - H, 12, H);
        ctx.fillStyle = 'rgba(14,26,43,.12)'; for (var j = 1; j < 6; j++) ctx.fillRect(px, base - j * TILE, 12, 2);
      });
      ctx.fillStyle = 'rgba(14,26,43,.45)'; ctx.fillRect(x - 15, base - H - 14, 62, 16);
      ctx.fillStyle = '#E8DEC8'; ctx.fillRect(x - 14, base - H - 13, 60, 13);
      if (gt.kind === 'push') { // głaz zamiast krat
        var gx = x + 16 + ease(gt.lift) * 140, rot = gt.lift * 4;
        ctx.save(); ctx.translate(gx, base - 42); ctx.rotate(rot);
        ctx.fillStyle = '#3F4756'; ctx.beginPath(); ell(ctx, 0, 0, 44, 44, 0); ctx.fill();
        ctx.fillStyle = '#9AA3AF'; ctx.beginPath(); ell(ctx, 0, 0, 42, 42, 0); ctx.fill();
        ctx.fillStyle = '#7D8796'; ctx.beginPath(); ell(ctx, -14, -12, 10, 7, 0); ell(ctx, 16, 14, 8, 6, 0); ctx.fill();
        ctx.restore();
        if (!gt.open) { ctx.fillStyle = '#062A58'; ctx.font = '900 18px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('przepchnij!', x + 16, base - 100); }
        return;
      }
      if (gt.kind === 'rope') { // szyb z liną
        ctx.fillStyle = TER.cave.fillDk; ctx.fillRect(x - 6, 2 * TILE, 44, base - 2 * TILE);
        ctx.strokeStyle = '#C99A60'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + 16, 2 * TILE); ctx.lineTo(x + 16 + Math.sin(gameT * 2) * 3, base - 20); ctx.stroke();
        ctx.fillStyle = 'rgba(79,164,160,.8)'; ctx.fillRect(x - 6, base - 16, 44, 16);
        if (gt.open) return;
        ctx.fillStyle = '#FFC629'; ctx.font = '900 18px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('lina w górę', x + 16, base - 140);
        return;
      }
      if (gt.kind === 'organ') { // dźwięczące nacieki nad bramą
        ['#0B4EA2', '#FFC629', '#1F7A48', '#C81E36'].forEach(function (col, k) {
          var px = x - 10 + k * 14, len = 40 + (k % 2) * 16, lit = gt.lit === k;
          ctx.fillStyle = '#0E1A2B'; ctx.beginPath(); ctx.moveTo(px - 6, base - H - 14); ctx.lineTo(px, base - H - 14 + len + 2); ctx.lineTo(px + 6, base - H - 14); ctx.fill();
          ctx.fillStyle = lit ? '#fff' : col; ctx.beginPath(); ctx.moveTo(px - 4.5, base - H - 14); ctx.lineTo(px, base - H - 14 + len - 2); ctx.lineTo(px + 4.5, base - H - 14); ctx.fill();
        });
      }
      var my = base - H - 30, ok = gt.open;
      ctx.fillStyle = '#0E1A2B'; ctx.beginPath(); ell(ctx, x + 16, my, 19, 19, 0); ctx.fill();
      ctx.fillStyle = ok ? '#1F7A48' : '#0B4EA2'; ctx.beginPath(); ell(ctx, x + 16, my, 17, 17, 0); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '900 24px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ok ? '✓' : gt.kind === 'organ' ? '♪' : '?', x + 16, my + 1);
      ctx.textBaseline = 'alphabetic';
    });
  }
  function drawLandmarks() {
    L.landmarks.forEach(function (lm) {
      if (lm.x < cam.x - 160 || lm.x > cam.x + view.w + 160) return;
      var x = lm.x, y = lm.y, img = stopIcons[lm.sec];
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
  function drawTreasureSticker(c, S, t) { // naklejka „Skarb Quo”: złote koło ze skrzynią
    c.fillStyle = '#0E1A2B'; c.beginPath(); ell(c, 0, 0, S / 2 + 3, S / 2 + 3, 0); c.fill();
    var g = c.createRadialGradient(0, -S * .15, 2, 0, 0, S / 2);
    g.addColorStop(0, '#FFF4CF'); g.addColorStop(.6, '#FFD95A'); g.addColorStop(1, '#E8A912');
    c.fillStyle = g; c.beginPath(); ell(c, 0, 0, S / 2, S / 2, 0); c.fill();
    drawGoldChest(c, 0, S * .2, S / 70, true, t);
  }
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
    ctx.fillStyle = 'rgba(14,26,43,.18)'; ctx.beginPath(); ell(ctx, P.x, groundBelow(P.x, P.y) - 1, 12, 3, 0); ctx.fill();
    if (P.zip >= 0) pose = quoPose('jump', P.t);
    if (P.cart >= 0) pose = quoPose('cheer', P.t);
    if (P.power === 'balloon') {
      var bx = P.x + 8 * P.facing, by = P.y - 100 + (reduceMotion ? 0 : Math.sin(P.t * 3) * 3);
      ctx.strokeStyle = '#3B2A00'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(P.x + 6 * P.facing, P.y - 40); ctx.quadraticCurveTo(bx - 4 * P.facing, by + 40, bx, by + 20); ctx.stroke();
      ctx.fillStyle = '#7A1020'; ctx.beginPath(); ell(ctx, bx, by, 17, 20, 0); ctx.fill();
      ctx.fillStyle = '#C81E36'; ctx.beginPath(); ell(ctx, bx, by, 15.5, 18.5, 0); ctx.fill();
      ctx.fillStyle = '#FFC629'; ctx.fillRect(bx - 15, by - 2, 30, 5);
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ell(ctx, bx - 6, by - 8, 4, 6, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(bx, by, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(P.fly / 8, 0, 1)); ctx.stroke();
      ctx.strokeStyle = '#FFC629'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(bx, by, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(P.fly / 8, 0, 1)); ctx.stroke();
    }
    drawQuo(ctx, P.x, P.y, 1, P.facing, pose, P.nap > 0 ? clamp(P.nap / 1.4 + .3, 0, 1) : null);
  }
  function groundBelow(x, y) {
    for (var r = Math.max(0, Math.floor(y / TILE)); r < ROWS; r++) { var v = tileAt(Math.floor(x / TILE), r); if (SOLID[v] || ONEWAY[v]) return r * TILE; }
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
    var S = L.sections[lm.sec];
    S.done = true;
    S.stars = 1 + (S.hidden >= 3 ? 1 : 0) + (S.time <= S.par ? 1 : 0);
    if (D.cpCeleb) P.checkpoint = { x: lm.x + 40, y: lm.y };
    if (SIM) { ev('landmark'); simStop = true; return; }
    state = 'celebrate';
    input.left = input.right = false;
    var conf = [];
    if (!reduceMotion) for (var i = 0; i < 90; i++) conf.push({ x: Math.random(), y: -Math.random() * .6, vx: (Math.random() - .5) * .15, vy: .18 + Math.random() * .25, rot: Math.random() * 6, vr: (Math.random() - .5) * 8, col: ['#FFC629', '#0B4EA2', '#C81E36', '#1F7A48', '#FFFFFF'][i % 5], w: 6 + Math.random() * 6 });
    celebration = { lm: lm, t: 0, conf: conf, dance: 'dance' + (lm.sec % 4), counted: false };
    var ct = $('celebrateText');
    ct.innerHTML = '<b>Brawo! ' + '★★★'.slice(0, S.stars) + '<i class="dim">' + '★★★'.slice(S.stars) + '</i></b><span>Naklejka: ' + esc(trip.stops[lm.sec].name) + '</span><small>Dotknij, aby pominąć</small>';
    ct.hidden = false; $('hudStop').style.visibility = 'hidden'; $('pad').style.visibility = 'hidden';
    sfx('fanfare');
  }
  var TREASURE_T = CELEB_T + 2.4; // dłużej: dziecko ma przeczytać, że skarb czeka u rodziców
  function startTreasure(T) {
    if (window.QuoTreasure) QuoTreasure.claim(trip.trip, D.key); // odpowiedzi serwera nie pokazujemy
    stats.treasure = true;
    state = 'celebrate'; input.left = input.right = input.jump = false; P.vx = 0;
    var conf = [];
    if (!reduceMotion) for (var i = 0; i < 120; i++) conf.push({ x: Math.random(), y: -Math.random() * .6, vx: (Math.random() - .5) * .15, vy: .18 + Math.random() * .25, rot: Math.random() * 6, vr: (Math.random() - .5) * 8, col: ['#FFC629', '#FFD95A', '#E8A912', '#FFFFFF', '#0B4EA2'][i % 5], w: 6 + Math.random() * 6 });
    celebration = { lm: null, treasure: T, t: 0, conf: conf, dance: 'dance1', counted: false };
    var ct = $('celebrateText');
    ct.innerHTML = '<b>Znalazłeś Skarb Quo!</b><span>Pokaż go rodzicom — czeka w ich panelu.</span><small>Dotknij, aby iść dalej</small>';
    ct.hidden = false; $('hudStop').style.visibility = 'hidden'; $('pad').style.visibility = 'hidden';
    sfx('fanfare');
  }
  function updateCelebration(dt) {
    var C = celebration; C.t += dt;
    C.conf.forEach(function (p) { p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; if (p.y > 1.1) { p.y = -.1; p.x = Math.random(); } });
    var T = C.treasure ? TREASURE_T : CELEB_T;
    if (!C.counted && C.t >= T - .5) countSticker();
    if (C.t >= T) endCelebration();
  }
  function countSticker() {
    var C = celebration; if (C.counted) return; C.counted = true;
    if (!C.treasure) stats.stickers.push(C.lm.sec);
    updateHUD();
    var a = $('hudAlbum'); a.classList.remove('pulse'); void a.offsetWidth; a.classList.add('pulse');
    sfx('coin');
  }
  function endCelebration(tap) {
    if (!celebration) return;
    if (tap && celebration.treasure && celebration.t < 1.5) return; // skarbu nie przeklikujemy od razu
    countSticker();
    var lm = celebration.lm, tr = celebration.treasure; celebration = null;
    $('celebrateText').hidden = true; $('hudStop').style.visibility = ''; $('pad').style.visibility = '';
    if (tr) { state = 'play'; return; }
    addCoins(5);
    if (lm.sec >= L.sections.length - 1) { endGame(); return; }
    state = 'play';
  }
  function renderCelebration() {
    var C = celebration; if (!C) return;
    var k = view.s * view.dpr, W = view.w, H = view.h, t = C.t;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    var sec = L.sections[C.treasure ? C.treasure.sec : C.lm.sec], TT = C.treasure ? TREASURE_T : CELEB_T;
    var fadeIn = reduceMotion ? 1 : ease(t / .35);
    ctx.globalAlpha = fadeIn;
    drawBackground(ctx, sec.terrain, cam.x, cam.y, W, H, gameT);
    var wash = ctx.createRadialGradient(W / 2, H * .5, 10, W / 2, H * .5, Math.max(W, H) * .7);
    wash.addColorStop(0, sec.terrain === 'cave' ? 'rgba(80,140,220,.35)' : 'rgba(255,255,255,.55)'); wash.addColorStop(1, 'rgba(6,42,88,.35)');
    ctx.fillStyle = wash; ctx.fillRect(0, 0, W, H);
    if (!reduceMotion) {
      ctx.save(); ctx.translate(W / 2, H * .5); ctx.rotate(t * .4);
      ctx.fillStyle = 'rgba(255,198,41,.22)';
      for (var i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.max(W, H), -60); ctx.lineTo(Math.max(W, H), 60); ctx.fill(); }
      ctx.restore();
    }
    var wide = view.cssH < 520 && W > H * 1.3;
    var S = wide ? Math.min(W * .36, H * .56) : Math.min(W * .78, H * .48), cx = wide ? W * .32 : W / 2, cy = wide ? H * .6 : H * .46;
    var flyStart = TT - 1.3, f = reduceMotion ? 0 : clamp((t - flyStart) / .8, 0, 1);
    var tgt = albumTarget();
    var pop = reduceMotion ? 1 : ease(t / .5) * (1 + .06 * Math.sin(Math.min(t, 1.2) * 10) * (1 - Math.min(t, 1.2) / 1.2));
    var sx = lerp(cx, tgt.x, ease(f)), sy = lerp(cy, tgt.y, ease(f)) - Math.sin(f * Math.PI) * H * .12, ss = lerp(S * pop, 28, ease(f));
    if (f < 1) {
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(-.05 + f * .4);
      if (C.treasure) drawTreasureSticker(ctx, ss, t); else drawSticker(ctx, stopIcons[C.lm.sec], ss);
      ctx.restore();
    }
    var qScale = wide ? H * .6 / 66 : Math.min(H * .4, W * .55) / 66;
    var pose = reduceMotion ? quoPose('cheer', 0) : quoPose(C.dance, t);
    var qx = wide ? W * .66 : W / 2, qy = wide ? H * .95 : Math.min(H * .94, cy + S * .5 + qScale * 46);
    ctx.fillStyle = 'rgba(14,26,43,.22)'; ctx.beginPath(); ell(ctx, qx, qy, qScale * 16, qScale * 3.5, 0); ctx.fill();
    drawQuo(ctx, qx, qy, qScale, wide ? -1 : 1, pose);
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
  function fmtT(s) { s = Math.round(s); return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
  var toastTimer = null;
  function toast(msg, ms) {
    if (SIM) return;
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 2600);
  }
  function updateHUD() {
    if (!P || SIM) return;
    $('hudHearts').textContent = Math.max(0, P.hearts);
    $('hudCoins').textContent = stats.coins;
    $('hudStickers').textContent = stats.stickers.length + '/' + L.sections.length;
    var S = L.sections[Math.max(0, curSec)];
    $('hudHidden').textContent = (S ? S.hidden : 0) + '/3';
  }
  function enterSection(si) {
    curSec = si;
    var S = L.sections[si];
    P.checkpoint = { x: Math.max(P.checkpoint.x, S.checkpoint.x), y: GROUND * TILE };
    if (S.power && !S.given) { S.given = true; setPower(S.power); }
    if (SIM) return;
    var stop = trip.stops[si];
    $('hudStop').textContent = 'Przystanek ' + (si + 1) + ' z ' + L.sections.length + ' · ' + stop.name;
    powerHUD();
    var msg = stop.name + ' · cel czasu ' + fmtT(S.par);
    if (S.power) msg += ' · moc z zadania foto: ' + POWER[S.power].name;
    else if (S.terrain === 'cave') msg += ' · ciemno! Zadanie foto dałoby latarkę';
    if (S.shortcut) msg += ' · szukaj trampoliny „skrót”!';
    toast(msg, 3800);
    updateHUD();
  }

  function powerHUD() {
    var hp = $('hudPower'), k = P && P.power;
    if (k) { hp.hidden = false; hp.innerHTML = '<span aria-hidden="true">' + POWER[k].icon + '</span> <span class="pw-name">' + esc(POWER[k].name) + '</span>'; hp.title = POWER[k].name; }
    else hp.hidden = true;
  }

  /* --- Dźwięczące nacieki: Quo gra melodię, dziecko powtarza --- */
  var ORGAN_F = [392, 494, 587, 698], organ = null;
  function tone(f, d) { if (!soundOn || !AC) return; var t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.2, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + d); o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + d + .05); }
  function openOrgan(gate) {
    state = 'organ'; input.left = input.right = input.jump = false; P.vx = 0;
    var n = D.organN, seq = []; for (var i = 0; i < n; i++) seq.push(Math.floor(Math.random() * 4));
    organ = { gate: gate, seq: seq, pos: 0, ready: false };
    $('organSkip').hidden = gate.fails < 2;
    $('organScreen').hidden = false; setPad(false);
    setTimeout(playOrgan, 500);
  }
  function lightPad(i, ms) {
    var b = $('organPads').children[i]; b.classList.add('lit'); tone(ORGAN_F[i], ms / 1000);
    if (organ) organ.gate.lit = i;
    setTimeout(function () { b.classList.remove('lit'); if (organ) organ.gate.lit = -1; }, ms * .8);
  }
  function playOrgan() {
    if (!organ) return;
    organ.ready = false; organ.pos = 0;
    $('organStatus').textContent = 'Słuchaj i patrz… (' + organ.seq.length + ' dźwięki)';
    Array.prototype.forEach.call($('organPads').children, function (b) { b.disabled = true; });
    organ.seq.forEach(function (k, i) { setTimeout(function () { lightPad(k, 520); }, i * 700); });
    setTimeout(function () {
      if (!organ) return; organ.ready = true;
      $('organStatus').textContent = 'Twoja kolej! Dotknij nacieków w tej samej kolejności.';
      Array.prototype.forEach.call($('organPads').children, function (b) { b.disabled = false; });
      $('organPads').children[0].focus({ preventScroll: true });
    }, organ.seq.length * 700 + 200);
  }
  function organPress(i) {
    if (!organ || !organ.ready) return;
    lightPad(i, 300);
    if (organ.seq[organ.pos] === i) {
      organ.pos++;
      if (organ.pos >= organ.seq.length) { organ.ready = false; $('organStatus').textContent = 'Brawo! Brama się otwiera · +5 kamyczków'; addCoins(5); sfx('ok'); setTimeout(function () { closeOrgan(true); }, 900); }
    } else {
      organ.ready = false; organ.gate.fails++; sfx('no');
      $('organStatus').textContent = 'Prawie! Posłuchaj jeszcze raz.';
      if (organ.gate.fails >= 2) $('organSkip').hidden = false;
      setTimeout(playOrgan, 1100);
    }
  }
  function closeOrgan(ok) {
    if (!organ) return;
    var gate = organ.gate; organ = null;
    $('organScreen').hidden = true; setPad(true);
    gate.open = true; gate.lit = -1; stats.gates++;
    if (D.cpGates) P.checkpoint = { x: gate.x + 56, y: gate.g * TILE };
    input.jumpPressed = false; state = 'play';
  }

  /* --- Szybkie stukanie: wspinaczka po linie (TAP) i przepychanie głazu (na zmianę ◀ ▶) ---
     n = ile stuknięć trzeba, T = czas (s), dec = ile postępu ucieka na sekundę.
     Wymagane tempo ≈ n × (1/T + dec). Lina (woda dochodzi do szczytu po T s): Łatwy ~1,5/s, Średni ~2,5/s, Trudny ~3,5/s
     (JP 2026-10-26: wcześniej było za trudno). Głaz bez zmian: ~1,9 / ~4 / ~6,8 na s. */
  var MASH = { rope: { easy: { n: 11, T: 10, dec: .04 }, medium: { n: 17, T: 9.5, dec: .04 }, hard: { n: 23, T: 9, dec: .04 } },
               push: { easy: { n: 12, T: 8, dec: .03 }, medium: { n: 22, T: 6.5, dec: .03 }, hard: { n: 32, T: 5.5, dec: .03 } } };
  var mash = null;
  function openMash(gate) {
    state = 'mash'; input.left = input.right = input.jump = false; P.vx = 0;
    var c = MASH[gate.kind][D.key], rope = gate.kind === 'rope';
    mash = { gate: gate, kind: gate.kind, n: c.n, T: c.T, dec: c.dec, p: 0, t: 0, last: '', running: false, done: false };
    $('mashTitle').textContent = rope ? 'Wspinaczka po linie' : 'Głaz w poprzek ścieżki';
    $('mashStage').className = 'mash-stage ' + gate.kind;
    $('mashTap').hidden = !rope; $('mashL').hidden = rope; $('mashR').hidden = rope;
    $('mashThreatIcon').textContent = rope ? '' : '🦇';
    $('mashSkip').hidden = gate.fails < 2; $('mashRetry').hidden = true;
    $('mashStatus').textContent = rope ? 'Stukaj w TAP! (albo spację), zanim woda w szybie podejdzie wyżej. Pierwsze stuknięcie startuje.'
      : 'Na zmianę ◀ i ▶ (albo strzałki ← →) — zepchnij głaz, zanim przyleci nietoperz. Pierwsze stuknięcie startuje.';
    drawMash();
    $('mashScreen').hidden = false; setPad(false);
    setTimeout(function () { (rope ? $('mashTap') : $('mashL')).focus({ preventScroll: true }); }, 30);
  }
  function mashPress(side) {
    if (!mash || mash.done) return;
    if (mash.kind === 'push') { if (side === mash.last) return; mash.last = side; }
    if (!mash.running) { mash.running = true; mash.t = 0; }
    mash.p = Math.min(1, mash.p + 1 / mash.n);
    sfx('pop');
    if (!reduceMotion) { var st = $('mashStage'); st.classList.remove('bump'); void st.offsetWidth; st.classList.add('bump'); }
    if (mash.p >= 1) { mash.done = true; $('mashStatus').textContent = 'Udało się! +8 kamyczków'; addCoins(8); sfx('ok'); drawMash(); setTimeout(function () { closeMash(true); }, 900); }
    drawMash();
  }
  function updateMash(dt) {
    if (!mash || !mash.running || mash.done) return;
    mash.t += dt;
    mash.p = Math.max(0, mash.p - mash.dec * dt);
    var lost = mash.kind === 'rope' ? (mash.t > .8 && waterLevel() >= mash.p) : mash.t >= mash.T;
    if (lost) {
      mash.done = true; mash.gate.fails++; sfx('no');
      $('mashStatus').textContent = mash.kind === 'rope' ? 'Quo zjechał powoli w dół. Spróbuj jeszcze raz — szybciej!' : 'Nietoperz przeleciał i głaz wrócił. Spróbuj jeszcze raz!';
      $('mashRetry').hidden = false; if (mash.gate.fails >= 2) $('mashSkip').hidden = false;
      setTimeout(function () { $('mashRetry').focus({ preventScroll: true }); }, 30);
    }
    drawMash();
  }
  function waterLevel() { return mash.running ? -0.12 + 1.12 * mash.t / mash.T : -0.12; }
  function drawMash() {
    if (!mash) return;
    var q = $('mashQuo'), w = $('mashWater'), th = $('mashThreat'), b = $('mashBar');
    b.style.width = Math.round(mash.p * 100) + '%';
    if (mash.kind === 'rope') {
      q.style.bottom = (mash.p * 78) + '%'; q.style.left = ''; w.style.height = Math.max(0, waterLevel() * 82) + '%'; th.style.left = '';
    } else {
      q.style.bottom = ''; q.style.left = (4 + mash.p * 50) + '%'; w.style.height = '0';
      document.querySelector('.mash-rock').style.left = (4 + mash.p * 50 + 8) + '%';
      th.style.left = (92 - (mash.running ? mash.t / mash.T : 0) * 30) + '%';
    }
  }
  function retryMash() { if (!mash || mash.p >= 1 || !mash.done) return; mash.p = 0; mash.t = 0; mash.running = false; mash.done = false; mash.last = ''; $('mashRetry').hidden = true; $('mashStatus').textContent = 'Jeszcze raz! Pierwsze stuknięcie startuje.'; drawMash(); }
  function closeMash(ok) {
    if (!mash) return;
    var gate = mash.gate, kind = mash.kind; mash = null;
    $('mashScreen').hidden = true; setPad(true);
    gate.open = true; stats.gates++;
    if (ok && kind === 'rope') { P.x = gate.x + 4 * TILE; P.y = gate.g * TILE; P.vx = P.vy = 0; addCoins(4); toast('Skrót z szybu! +4 kamyczki'); } // skrót
    if (D.cpGates) P.checkpoint = { x: Math.max(P.x, gate.x + 56), y: P.y };
    input.jumpPressed = false; state = 'play';
  }

  /* --- Mozaika w opactwie: przesuwanka 3×3 z naklejką przystanku --- */
  var mosaic = null;
  function openMosaic(pq) {
    state = 'mosaic'; input.left = input.right = input.jump = false; P.vx = 0;
    var t = [0, 1, 2, 3, 4, 5, 6, 7, 8], e = 8, last = -1, moves = D.key === 'easy' ? 12 : D.key === 'medium' ? 28 : 50;
    for (var m = 0; m < moves; m++) {
      var nb = [e - 3, e + 3, e % 3 ? e - 1 : -1, e % 3 < 2 ? e + 1 : -1].filter(function (k) { return k >= 0 && k < 9 && k !== last; });
      var k = nb[Math.floor(Math.random() * nb.length)]; t[e] = t[k]; t[k] = 8; last = e; e = k;
    }
    mosaic = { pq: pq, t: t };
    $('mosaicSkip').hidden = pq.closes < 2;
    $('mosaicStatus').textContent = 'Dotknij kafelka obok pustego pola.';
    renderMosaic();
    $('mosaicScreen').hidden = false; setPad(false);
  }
  function renderMosaic() {
    var g = $('mosaicGrid'), img = ICONS + 'icon-' + trip.stops[mosaic.pq.sec].icon + '-256.webp';
    g.innerHTML = '';
    mosaic.t.forEach(function (v, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'mtile' + (v === 8 ? ' empty' : '');
      b.setAttribute('aria-label', v === 8 ? 'puste pole' : 'kafelek ' + (v + 1));
      if (v !== 8) { b.style.backgroundImage = 'url(' + img + ')'; b.style.backgroundPosition = (v % 3) * 50 + '% ' + Math.floor(v / 3) * 50 + '%'; }
      b.addEventListener('click', function () { slideTile(i); });
      g.appendChild(b);
    });
  }
  function slideTile(i) {
    if (!mosaic) return;
    var e = mosaic.t.indexOf(8), adj = (Math.abs(i - e) === 3) || (Math.abs(i - e) === 1 && Math.floor(i / 3) === Math.floor(e / 3));
    if (!adj) return;
    mosaic.t[e] = mosaic.t[i]; mosaic.t[i] = 8; sfx('pop'); renderMosaic();
    if (mosaic.t.every(function (v, k) { return v === k; })) { $('mosaicStatus').textContent = 'Brawo! Skrzynia otwarta.'; sfx('ok'); setTimeout(function () { closeMosaic(true); }, 900); }
  }
  function closeMosaic(solved) {
    if (!mosaic) return;
    var pq = mosaic.pq; mosaic = null;
    $('mosaicScreen').hidden = true; setPad(true);
    if (solved) {
      pq.solved = true; var c = L.chestList[pq.chest]; c.locked = false; openChest(c.x, c.y);
    } else pq.closes++;
    input.jumpPressed = false; state = 'play';
  }

  /* --- Przebrania Quo (tylko wygląd, zapis lokalny) --- */
  var HATS = { helmet: 'Kask z lampką', hood: 'Kaptur mnicha', explorer: 'Kapelusz odkrywcy' };
  function ownedHats() { return lsJSON(LS + 'hats') || []; }
  function collectHat(kind) {
    if (SIM) return;
    var h = ownedHats(); if (h.indexOf(kind) < 0) { h.push(kind); lsSet(LS + 'hats', JSON.stringify(h)); }
    curHat = kind; lsSet(LS + 'hat', kind);
    sfx('fanfare'); toast('Nowe przebranie: ' + HATS[kind] + '!', 3200);
  }
  function renderHats() {
    var own = ownedHats(), el = $('hatPicker'), html = '<button type="button" class="hat-btn" data-hat="" aria-pressed="' + (!curHat) + '">Bez przebrania</button>';
    Object.keys(HATS).forEach(function (k) {
      var has = own.indexOf(k) >= 0;
      html += '<button type="button" class="hat-btn" data-hat="' + k + '" aria-pressed="' + (curHat === k) + '"' + (has ? '' : ' disabled') + '>' + (has ? HATS[k] : '🔒 ukryte') + '</button>';
    });
    el.innerHTML = html;
    Array.prototype.forEach.call(el.children, function (b) { b.addEventListener('click', function () { curHat = b.dataset.hat || null; lsSet(LS + 'hat', curHat || ''); renderHats(); }); });
  }

  /* --- Tryb foto: ramka z Quo i naklejką przystanku, zapis lokalny --- */
  function photoSec() {
    if (!L || !P) return -1;
    if (state === 'celebrate' && celebration) return celebration.lm ? celebration.lm.sec : -1;
    for (var i = 0; i < L.landmarks.length; i++) { var lm = L.landmarks[i]; if (lm.done && Math.abs(P.x - lm.x) < 260) return lm.sec; }
    return -1;
  }
  function snapPhoto() {
    var si = photoSec(); if (si < 0) return;
    var c = document.createElement('canvas'); c.width = 480; c.height = 360;
    var x = c.getContext('2d'); x.setTransform(1.2, 0, 0, 1.2, 0, 0);
    drawBackground(x, L.sections[si].terrain, L.landmarks[si].x - 200, 40, 400, 300, gameT);
    x.save(); x.translate(130, 120); x.rotate(-.06); drawSticker(x, stopIcons[si], 150); x.restore();
    x.fillStyle = 'rgba(14,26,43,.22)'; x.beginPath(); ell(x, 290, 262, 36, 8, 0); x.fill();
    drawQuo(x, 290, 262, 2.7, -1, quoPose('cheer', 0));
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.strokeStyle = '#fff'; x.lineWidth = 28; x.strokeRect(0, 0, 480, 360);
    x.fillStyle = '#fff'; x.fillRect(0, 300, 480, 60);
    x.fillStyle = '#062A58'; x.font = '900 22px system-ui,sans-serif'; x.textAlign = 'center';
    var nm = trip.stops[si].name; x.fillText(nm.length > 34 ? nm.slice(0, 33) + '…' : nm, 240, 330);
    x.font = '700 18px system-ui,sans-serif'; x.fillStyle = '#5D6B82'; x.fillText('Quo: Wyprawa · ' + new Date().toLocaleDateString('pl-PL'), 240, 352);
    var data = c.toDataURL('image/jpeg', .72), all = lsJSON(LS + 'photos') || {}, list = (all[trip.trip] || []).filter(function (p) { return p.sec !== si; });
    list.push({ sec: si, data: data }); list.sort(function (a, b) { return a.sec - b.sec; }); all[trip.trip] = list;
    try { localStorage.setItem(LS + 'photos', JSON.stringify(all)); toast('📸 Zdjęcie w albumie!'); } catch (e) { toast('Brak miejsca na zdjęcie w pamięci telefonu.'); }
    sfx('ok');
    var fl = $('flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
  }

  function openQuiz(gate) {
    if (SIM) { ev(gate.kind === 'organ' ? 'organ' : 'gate'); simStop = true; P.vx = 0; return; }
    if (gate.kind === 'organ') { openOrgan(gate); sfx('gate'); return; }
    if (gate.kind === 'rope' || gate.kind === 'push') { openMash(gate); sfx('gate'); return; }
    state = 'quiz'; quizGate = gate;
    input.left = input.right = input.jump = false; P.vx = 0;
    showQuestion();
    $('quizScreen').hidden = false;
    setPad(false);
    sfx('gate');
  }
  function showQuestion() {
    var gate = quizGate, stop = trip.stops[gate.sec], q = stop.quests[gate.qs[gate.qn]], box = $('quizAnswers');
    gate.tries = 0;
    $('quizStop').textContent = 'Przystanek ' + (gate.sec + 1) + ' · ' + stop.name + (gate.qs.length > 1 ? ' · pytanie ' + (gate.qn + 1) + ' z ' + gate.qs.length : '');
    $('quizQ').textContent = q.q;
    var hint = $('quizHint'); hint.textContent = ''; hint.className = 'quiz-hint';
    var hb = $('quizHintBtn'); hb.hidden = !D.freeHint; hb.disabled = false;
    box.innerHTML = '';
    var a = q.answers.slice(0, D.opts).map(function (txt, i) { return { txt: txt, ok: i === q.correct }; });
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    a.forEach(function (o) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'answer'; b.textContent = o.txt;
      b.addEventListener('click', function () { answer(b, o.ok); });
      box.appendChild(b);
    });
    setTimeout(function () { var f = box.querySelector('button'); if (f) f.focus({ preventScroll: true }); }, 30);
  }
  function answer(btn, ok) {
    if (btn.disabled || !quizGate) return;
    var gate = quizGate, hint = $('quizHint'), q = trip.stops[gate.sec].quests[gate.qs[gate.qn]];
    if (ok) {
      var bonus = gate.tries ? (D.freeHint ? 2 : 0) : 5;
      if (!gate.tries) stats.firstTry++;
      stats.questions++;
      btn.classList.add('yes');
      Array.prototype.forEach.call($('quizAnswers').children, function (b) { b.disabled = true; });
      $('quizHintBtn').hidden = true;
      var more = gate.qn < gate.qs.length - 1;
      hint.className = 'quiz-hint good'; hint.textContent = 'Brawo! ' + (more ? 'Jeszcze jedno pytanie' : 'Brama się otwiera') + (bonus ? ' · +' + bonus + ' kamyczków' : '');
      sfx('ok');
      if (bonus) addCoins(bonus);
      if (more) { setTimeout(function () { gate.qn++; showQuestion(); }, reduceMotion ? 600 : 900); return; }
      quizGate = null;
      setTimeout(function () {
        $('quizScreen').hidden = true; setPad(true);
        gate.open = true; stats.gates++;
        if (D.cpGates) P.checkpoint = { x: gate.x + 56, y: gate.g * TILE };
        input.jumpPressed = false;
        state = 'play';
      }, reduceMotion ? 700 : 1100);
    } else {
      gate.tries++;
      btn.classList.add('no'); btn.disabled = true;
      hint.textContent = 'Prawie! Podpowiedź: ' + q.hint + (D.freeHint ? '' : ' (bez premii)');
      $('quizHintBtn').hidden = true;
      sfx('no');
    }
  }

  function loadRecord() { var r = lsJSON(LS + trip.trip); if (!r || typeof r.best !== 'object') r = { plays: (r && r.plays) || 0, best: {} }; return r; }
  function endGame() {
    state = 'end';
    setPad(false); $('hud').hidden = true;
    var rec = loadRecord(), b = rec.best[D.key] || { coins: 0, stars: [], time: 0 };
    rec.plays = (rec.plays || 0) + 1;
    var stars = L.sections.map(function (S) { return S.stars; }), total = stars.reduce(function (a, s) { return a + s; }, 0);
    var prevTotal = (b.stars || []).reduce(function (a, s) { return a + s; }, 0);
    b.coins = Math.max(b.coins || 0, stats.coins);
    b.stars = L.sections.map(function (S, i) { return Math.max(S.stars, (b.stars || [])[i] || 0); });
    rec.best[D.key] = b;
    lsSet(LS + trip.trip, JSON.stringify(rec));
    $('endDiff').textContent = 'Poziom: ' + D.label + ' (' + D.ages + ')';
    $('albumGrid').innerHTML = L.sections.map(function (S, i) {
      var s = trip.stops[i];
      return '<div class="sticker"><img src="' + ICONS + 'icon-' + esc(s.icon) + '-128.webp" alt="" width="120" height="120"><p>' + esc(s.name) + '</p>' +
        '<p class="stars" aria-label="' + S.stars + ' z 3 gwiazdek">' + '★★★'.slice(0, S.stars) + '<span class="dim">' + '★★★'.slice(S.stars) + '</span></p>' +
        '<p class="meta">Ukryte: ' + S.hidden + '/3 · czas ' + fmtT(S.time) + ' (cel ' + fmtT(S.par) + ')</p></div>';
    }).join('') + ((stats.treasure || (window.QuoTreasure && QuoTreasure.found(trip.trip))) ?
      '<div class="sticker sticker-gold"><svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true"><circle cx="60" cy="60" r="56" fill="#FFD95A" stroke="#0E1A2B" stroke-width="5"/>' +
      '<rect x="32" y="58" width="56" height="34" fill="#E8A912" stroke="#3B2A00" stroke-width="4"/><path d="M32 58 Q60 30 88 58 Z" fill="#FFC629" stroke="#3B2A00" stroke-width="4"/>' +
      '<rect x="55" y="54" width="10" height="14" fill="#C81E36" stroke="#3B2A00" stroke-width="3"/></svg>' +
      '<p>Skarb Quo</p><p class="meta">Pokaż go rodzicom — czeka w ich panelu.</p></div>' : '');
    $('totals').innerHTML =
      '<div><span>Gwiazdki</span><b>' + total + ' / ' + L.sections.length * 3 + '</b></div>' +
      '<div><span>Kamyczki</span><b>' + stats.coins + '</b></div>' +
      '<div><span>Zagubione naklejki</span><b>' + stats.hiddenTotal + ' / ' + L.hidden.length + '</b></div>' +
      '<div><span>Pytania za pierwszym razem</span><b>' + stats.firstTry + ' / ' + stats.questions + '</b></div>' +
      '<div><span>Czas wyprawy</span><b>' + fmtT(gameT) + '</b></div>' +
      '<div><span>Rekord (' + D.label + ')</span><b>' + b.stars.reduce(function (a, s) { return a + s; }, 0) + ' ★ · ' + b.coins + ' kamyczków</b></div>' +
      (total > prevTotal && prevTotal ? '<div class="new"><span>Nowy rekord gwiazdek!</span></div>' : '');
    var photos = ((lsJSON(LS + 'photos') || {})[trip.trip]) || [];
    $('photoGallery').innerHTML = photos.length ? '<p class="kicker">Zdjęcia z wyprawy</p><div class="photos">' + photos.map(function (p) { return '<img src="' + p.data + '" alt="Zdjęcie: Quo przy przystanku ' + (p.sec + 1) + '" width="240" height="180">'; }).join('') + '</div>' : '<p class="help">Przy naklejce przystanku dotknij 📸, żeby zrobić zdjęcie do albumu.</p>';
    $('endScreen').hidden = false;
    sfx('fanfare');
    setTimeout(function () { $('btnAgain').focus({ preventScroll: true }); }, 50);
  }

  function renderBonus() {
    var p = readProgress(trip, demo), el = $('bonusList');
    var powers = trip.stops.filter(function (s, i) { return p.stops[i].photo && s.powerup; }).map(function (s) { return POWER[s.powerup].name.split(' —')[0]; });
    var Dd = DIFF[diffKey], extra = Math.min(p.missions, Dd.cap - Dd.hearts);
    var html = '';
    if (!p.found && !demo) html += '<p>Na tym telefonie nie ma jeszcze punktów z wycieczki. Gra działa i bez nich — jest tylko trochę trudniej.</p>';
    else html += '<p>Punkty z waszej wycieczki:</p>';
    html += '<div class="row' + (p.missions ? '' : ' off') + '"><i>❤️</i>Misje: ' + p.missions + ' z ' + p.missionsTotal + ' → +' + extra + ' serduszek (start: ' + (Dd.hearts + extra) + ')</div>';
    html += '<div class="row' + (p.photos ? '' : ' off') + '"><i>📷</i>Zadania foto: ' + p.photos + ' z ' + p.photosTotal + (powers.length ? ' → ' + powers.join(', ') : ' → brak mocy') + '</div>';
    html += '<div class="row' + (p.full ? '' : ' off') + '"><i>⭐</i>Całe przystanki: ' + p.full + ' z ' + trip.stops.length + ' → tajne skróty</div>';
    var rec = loadRecord(), b = rec.best[diffKey];
    if (b && b.stars) html += '<div class="row"><i>🏆</i>Rekord na tym poziomie: ' + b.stars.reduce(function (a, s) { return a + s; }, 0) + ' / 12 ★</div>';
    el.innerHTML = html;
    document.querySelectorAll('.diff-btn').forEach(function (bt) { bt.setAttribute('aria-pressed', bt.dataset.diff === diffKey ? 'true' : 'false'); });
  }

  function newGame() {
    D = DIFF[diffKey];
    prog = readProgress(trip, demo);
    var rec = loadRecord();
    playNo = rec.plays || 0;
    L = buildLevel(trip, prog, playNo, D);
    P = newPlayer();
    stats = { coins: 0, stickers: [], gates: 0, firstTry: 0, questions: 0, hiddenTotal: 0, treasure: false };
    particles = []; celebration = null; curSec = -1; gameT = 0;
    cam.x = 0; cam.y = 0; updateCamera(1);
    ['startScreen', 'endScreen', 'pauseScreen', 'quizScreen', 'organScreen', 'mosaicScreen', 'mashScreen'].forEach(function (id) { $(id).hidden = true; });
    organ = null; mosaic = null; mash = null;
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
    if (state === 'mash' && mash) {
      if (mash.kind === 'rope' && (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') && !e.repeat) { e.preventDefault(); mashPress('t'); return; }
      if (mash.kind === 'push' && (e.code === 'ArrowLeft' || e.code === 'KeyA') && !e.repeat) { e.preventDefault(); mashPress('l'); return; }
      if (mash.kind === 'push' && (e.code === 'ArrowRight' || e.code === 'KeyD') && !e.repeat) { e.preventDefault(); mashPress('r'); return; }
    }
    if (state === 'celebrate' && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) { e.preventDefault(); endCelebration(true); return; }
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
  cv.addEventListener('pointerdown', function () { if (state === 'celebrate') endCelebration(true); });
  $('celebrateText').addEventListener('pointerdown', function () { if (state === 'celebrate') endCelebration(true); });

  /* ---------- 11. Dźwięk ---------- */
  var AC = null, soundOn = false; // dźwięk zawsze startuje wyłączony
  var SFX = {
    jump: [[520, .07], [780, .06]], jump2: [[700, .05], [1040, .06]], coin: [[988, .05], [1319, .09]], hit: [[260, .1], [196, .16]],
    bump: [[330, .06], [262, .08]], pop: [[660, .04], [880, .05]], ok: [[523, .1], [659, .1], [784, .18]], no: [[392, .12], [349, .16]],
    gate: [[392, .07], [523, .09]], fanfare: [[523, .11], [659, .11], [784, .11], [1047, .3]], spring: [[300, .05], [600, .05], [900, .08]], drip: [[1400, .03]]
  };
  function sfx(name) {
    if (SIM || !soundOn || !AC) return;
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
    if (state === 'play' && !botMode) { acc += d; while (acc >= DT) { step(DT); acc -= DT; if (state !== 'play') { acc = 0; break; } } }
    else if (state === 'mash') { updateMash(d); acc = 0; }
    else if (state === 'celebrate') { acc += d; while (acc >= DT && state === 'celebrate') { updateCelebration(DT); updateParticles(DT); acc -= DT; } }
    else acc = 0;
    if (botMode && state === 'play') updateParticles(d);
    if (L && P) render();
    var ph = photoSec() >= 0 && (state === 'play' || state === 'celebrate'); if ($('btnPhoto').hidden === ph) $('btnPhoto').hidden = !ph;
  }

  function boot() {
    genBackgrounds();
    demo = lsGet(LS + 'demo') === '1';
    var sd = lsGet(LS + 'diff'); if (DIFF[sd]) diffKey = sd;
    $('demoToggle').checked = demo;
    $('demoToggle').addEventListener('change', function (e) { demo = e.target.checked; lsSet(LS + 'demo', demo ? '1' : '0'); renderBonus(); });
    document.querySelectorAll('.diff-btn').forEach(function (bt) {
      bt.addEventListener('click', function () { diffKey = bt.dataset.diff; lsSet(LS + 'diff', diffKey); renderBonus(); });
    });
    $('btnStart').addEventListener('click', function () { if (soundOn) setSound(true); newGame(); });
    $('btnSound').addEventListener('click', function () { setSound(!soundOn); });
    $('btnSound2').addEventListener('click', function () { setSound(!soundOn); });
    $('btnPause').addEventListener('click', pause);
    $('btnResume').addEventListener('click', resume);
    $('btnRestart').addEventListener('click', function () { newGame(); });
    $('btnAgain').addEventListener('click', function () { newGame(); });
    $('btnMenu').addEventListener('click', function () { $('endScreen').hidden = true; renderBonus(); renderHats(); $('startScreen').hidden = false; state = 'menu'; });
    $('btnPhoto').addEventListener('click', function (e) { e.stopPropagation(); snapPhoto(); });
    $('btnPhoto').addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    Array.prototype.forEach.call($('organPads').children, function (b, i) { b.addEventListener('click', function () { organPress(i); }); });
    $('organReplay').addEventListener('click', function () { if (organ && organ.ready) playOrgan(); });
    $('organSkip').addEventListener('click', function () { if (organ) closeOrgan(false); });
    [['mashTap', 't'], ['mashL', 'l'], ['mashR', 'r']].forEach(function (a) {
      var b = $(a[0]);
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); mashPress(a[1]); });
      b.addEventListener('click', function (e) { if (e.detail === 0) mashPress(a[1]); }); // klawiatura/czytnik (Enter)
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });
    $('mashRetry').addEventListener('click', retryMash);
    $('mashSkip').addEventListener('click', function () { if (mash) closeMash(false); });
    $('mosaicClose').addEventListener('click', function () { if (mosaic) closeMosaic(false); });
    $('mosaicSkip').addEventListener('click', function () { if (mosaic) closeMosaic(true); });
    curHat = lsGet(LS + 'hat') || null; if (curHat && ownedHats().indexOf(curHat) < 0) curHat = null;
    renderHats();
    $('quizHintBtn').addEventListener('click', function () {
      if (!quizGate) return; var q = trip.stops[quizGate.sec].quests[quizGate.qs[quizGate.qn]];
      $('quizHint').textContent = 'Podpowiedź: ' + q.hint; $('quizHintBtn').hidden = true;
    });
    window.addEventListener('resize', resize);
    resize();
    fetch(DATA_URL).then(function (r) { return r.json(); }).then(function (data) {
      trip = data;
      renderBonus();
      buildRig(function () {
        D = DIFF[diffKey];
        prog = readProgress(trip, demo); L = buildLevel(trip, prog, 0, D); P = newPlayer(); stats = { coins: 0, stickers: [], gates: 0, firstTry: 0, questions: 0, hiddenTotal: 0 };
        stopIcons = trip.stops.map(function (s) { var im = new Image(); im.src = ICONS + 'icon-' + s.icon + '-256.webp'; return im; });
        updateCamera(1);
        state = 'menu';
      });
    }).catch(function () { toast('Nie udało się wczytać danych wycieczki.', 8000); });
    requestAnimationFrame(frame);
  }

  /* Dostęp dla testów automatycznych: podgląd stanu i symulacja (bot planujący ruchy).
     Nie zmienia zachowania gry dla dzieci. */
  function setIn(b, prev) { input.left = !!(b & 1); input.right = !!(b & 2); input.jump = !!(b & 4); input.jumpPressed = !!(b & 4) && !(prev & 4); }
  window.__quoGame = {
    get state() { return state; }, get player() { return P; }, get level() { return L; }, get stats() { return stats; }, get diff() { return D; },
    get cam() { return cam; }, get view() { return view; },
    set botMode(v) { botMode = !!v; }, get botMode() { return botMode; },
    skipCelebration: function () { if (state === 'celebrate') endCelebration(); },
    tileAt: function (x, y) { return tileAt(x, y); },
    snapshot: function () { return structuredClone({ L: L, P: P, stats: stats, gameT: gameT, curSec: curSec, cx: cam.x, cy: cam.y, inp: input }); },
    restore: function (s) { var c = structuredClone(s); L = c.L; P = c.P; stats = c.stats; gameT = c.gameT; curSec = c.curSec; cam.x = c.cx; cam.y = c.cy; input.left = c.inp.left; input.right = c.inp.right; input.jump = c.inp.jump; input.jumpPressed = false; },
    simulate: function (prog, prev) {
      SIM = true; simEv = []; simStop = false; var p = prev || 0, n = 0;
      try { for (var i = 0; i < prog.length; i++) { setIn(prog[i], p); p = prog[i]; step(DT); n++; if (simStop || P.nap > 0) break; } }
      finally { SIM = false; }
      return { x: P.x, y: P.y, hearts: P.hearts, nap: P.nap > 0, ev: simEv.slice(), onGround: P.onGround, n: n, sec: curSec };
    },
    advance: function (prog, prev) {
      var p = prev || 0;
      for (var i = 0; i < prog.length; i++) { if (state !== 'play') break; setIn(prog[i], p); p = prog[i]; step(DT); }
      return p;
    },
    get mash() { return mash ? { kind: mash.kind, p: mash.p, done: mash.done, running: mash.running, fails: mash.gate.fails } : null; },
    get organ() { return organ ? { seq: organ.seq.slice(), ready: organ.ready, fails: organ.gate.fails } : null; },
    teleport: function (x, y) { P.x = x; P.y = y; P.vx = P.vy = 0; cam.x = clamp(P.x - view.w * .38, 0, L.W * TILE - view.w); }
  };
  boot();
})();
