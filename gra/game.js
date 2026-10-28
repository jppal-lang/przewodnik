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
     opts = liczba odpowiedzi; qPerGate = pytania na bramę; cpGates = punkt kontrolny za bramą;
     noTimer = bez celu czasu (Łatwy: bez stresu, trzecia gwiazdka za samo przejście — decyzja JP 2026-10-29).
     Poziomy nie mają wieku (bez profilowania dziecka). */
  var DIFF = {
    easy:   { key: 'easy', label: 'Łatwy', noTimer: true, sec: 170, hearts: 5, cap: 12, spd: 1, dens: 0, adv: false, opts: 3, qPerGate: 1, freeHint: true,
      cpGates: true, cpCeleb: true, crumbleT: .6, parMul: 1.9, wind: 0, organN: 3 },
    medium: { key: 'medium', label: 'Średni', sec: 250, hearts: 3, cap: 8, spd: 1.25, dens: 1, adv: true, opts: 4, qPerGate: 1, freeHint: false,
      cpGates: true, cpCeleb: true, crumbleT: .45, parMul: 1.45, wind: 80, doorT: 9, bridgeV: 135, boulderV: 160, organN: 4 },
    hard:   { key: 'hard', label: 'Trudny', sec: 290, hearts: 2, cap: 5, spd: 1.55, dens: 1.5, adv: true, opts: 4, qPerGate: 2, freeHint: false,
      cpGates: false, cpCeleb: false, crumbleT: .3, parMul: 1.35, wind: 100, doorT: 7, bridgeV: 160, boulderV: 178, organN: 5 }
  };
  var ICONS = '../media/icons/';
  var LS = 'quolino_game_';
  /* Etap (wycieczka): ?trasa=<slug> spośród gra/stages.json, domyślnie frasassi. */
  var TRIP_SLUG = (/[?&]trasa=([a-z0-9-]+)/.exec(location.search) || [0, ''])[1], STAGES = null, STAGE = null;
  /* Etapy tylko dla tras ukończonych i zatwierdzonych przez JP („approved” w stages.json). Pozostałe: wyłącznie z ?test=1. */
  var TEST = /[?&]test=1(&|$)/.test(location.search);
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var TERRAIN_BY_CATEGORY = {
    parking: 'valley', 'viewpoint-nature': 'valley', photo: 'valley',
    cave: 'cave', grotto: 'cave',
    church: 'stone', castle: 'stone', house: 'stone', street: 'stone', museum: 'stone',
    synagogue: 'stone', restaurant: 'stone', icecream: 'stone', sweets: 'stone',
    monument: 'cliff', 'viewpoint-city': 'cliff', viewpoint: 'cliff'
  };
  /* Tereny miasteczka na wzgórzu (Spello): wybiera je „game.terrain” przystanku w danych etapu (stage-from-trip.mjs).
     len = długość sekcji (× D.sec), atrakcje opisuje „game” — patrz gra/README.md. Frasassi (bez „game”) jak dawniej. */
  var SP_WEIGHTS = {
    easy: {
      olive: { flat: 3, step: 3, gap: 2, float: 1, ledges: 1.5, roller: 1.5 },
      villa: { flat: 2, step: 2, gap: 2, float: 1.5, ledges: 1.5, roller: 1.5 },
      gate: { flat: 2, step: 2, stairs: 2, gap: 1.5, ledges: 1.5, roller: 1.5, bat: 1 },
      fresco: { flat: 3, step: 1.5, ledges: 2, float: 1, bat: 2 },
      alley: { flat: 2, stairs: 3, step: 2, gap: 1, ledges: 1.5, bat: 1, roller: 1 },
      belvedere: { flat: 3, step: 2, gap: 2, float: 1.5, ledges: 1, roller: 1 },
      dusk: { flat: 3, step: 2, stairs: 1.5, ledges: 1 }
    },
    adv: {
      olive: { flat: 1, step: 2, runGap: 2, crumbleRow: 1, beetleLedge: 2, spiky: 1.5, roller: 1.5 },
      villa: { step: 1.5, runGap: 2, movingH: 2, crumbleRow: 2, beetleLedge: 1.5, spikes: 1.5, spiky: 1, roller: 1 },
      gate: { step: 2, stairs: 2, runGap: 1.5, climbWall: 1.5, beetleLedge: 1.5, spiky: 1.5, rockfall: 1, roller: 1.5, bats: 1 },
      fresco: { step: 1.5, ledges: 1, movingV: 1.5, crumbleRow: 1.5, beetleLedge: 1.5, bats: 2.5, spikes: 1, runGap: 1 },
      alley: { stairs: 3, step: 2, rockfall: 2.5, climbWall: 1.5, beetleLedge: 1.5, bats: 1.5, spiky: 1, runGap: 1 },
      belvedere: { step: 2, runGap: 2, wind: 2, movingH: 1.5, crumbleRow: 1, beetleLedge: 1.5, spiky: 1 },
      dusk: { step: 2, stairs: 2, runGap: 1.5, beetleLedge: 1.5, bats: 1 }
    }
  };
  var SP_MINI_W = { lever: 27, glide: 26, trench: 30, tower: 14, scaffold: 14 };
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
  /* Tłumaczenia (page-i18n.js w katalogu głównym): PT('page.game.…', 'tekst polski') — polski tekst stoi w kodzie
     (z niego ui-translate.mjs robi źródło), tłumaczenia przychodzą z bazy. Zmienne części: {n} podmieniane po PT. */
  function PT(k, pl) { return window.PT ? window.PT(k, pl) : pl; }
  function fill(s, o) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return o[k] != null ? o[k] : m; }); }
  var FONT = "'Archivo',system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans','Helvetica Neue',Arial,sans-serif";
  function font(px, w) { return (w || 900) + ' ' + px + 'px ' + FONT; }

  /* ---------- 2. Pamięć i postęp ---------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* prywatne okno */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* prywatne okno */ } }
  function lsJSON(k) { try { return JSON.parse(lsGet(k) || 'null'); } catch (e) { return null; } }

  /* Mapowanie punktów z wycieczki na grę:
     każda zaliczona misja = +1 serduszko, zadanie foto = moc w sekcji tego przystanku,
     wszystkie zadania przystanku = tajny skrót (trampolina + górna kładka z kryjówką). */
  function readProgress(trip, demo) {
    var legacy = (trip.progress.legacyKey && lsJSON(trip.progress.legacyKey)) || {};
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
    } else if (kind === 'crown') { // wianek z kwiatów (Spello, kwiatowy dywan)
      c.strokeStyle = '#2F6B34'; c.lineWidth = 3.2; c.beginPath(); c.ellipse(2, -24, 15.5, 5, -.06, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = '#5FA05A'; c.lineWidth = 1.4; c.beginPath(); c.ellipse(2, -24, 15.5, 5, -.06, 0, Math.PI * 2); c.stroke();
      var FC = ['#E8467C', '#FFC629', '#FFFFFF', '#C81E36', '#B07CE0', '#FF8A3D', '#E8467C'];
      for (var fi = 0; fi < 7; fi++) {
        var fa = Math.PI * (-.06 + fi * .185), fx = 2 + Math.cos(fa) * 15.5, fy = -24 + Math.sin(fa) * 5 - (fi % 2 ? 1.5 : 0);
        c.fillStyle = FC[fi]; c.beginPath();
        for (var pk = 0; pk < 5; pk++) { var pa = pk / 5 * Math.PI * 2; ell(c, fx + Math.cos(pa) * 2.6, fy + Math.sin(pa) * 2.6, 2.3, 2.3, 0); }
        c.fill(); c.lineWidth = .8; c.strokeStyle = 'rgba(94,50,20,.55)'; c.stroke();
        c.fillStyle = '#FFC629'; c.beginPath(); ell(c, fx, fy, 1.5, 1.5, 0); c.fill();
      }
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
      case 'climb': // wspinaczka: łapki na zmianę w górę
        b = o.phase || 0;
        P.armFront.a = -2.6 + s(b) * .5; P.armBack.a = -2.6 - s(b) * .5; P.legFront.a = s(b) * .5; P.legBack.a = -s(b) * .5; P.tail.a = -.3; P.head.a = -.1; P.blink = false; break;
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
      if (name === 'body' && pose.scarf) drawScarf(c, pose.scarf);
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
    genBackgroundsSp(R, arr, ridge);
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

  /* ---------- 4b. Miasteczko na wzgórzu (Spello): tereny, tła, kafle ----------
     Własna grafika rysowana kodem: różowo-biały kamień, strome uliczki ze schodami, rzymskie bramy i mury,
     kwiaty w donicach i na balkonach, gaje oliwne na zboczu, panorama doliny. Klucze terenów: olive, villa, gate,
     fresco (wnętrze kościoła z freskami), alley, belvedere, dusk (wieczór). sp: true = rysuje drawBgSp. */
  var SPT = {
    olive: { sp: true, fill: '#C9A47E', fillDk: '#A9845F', speck: '#B89069', top: '#6F9A47', topHi: '#A4C96B', plat: '#8E6B47', platDk: '#634A2F', grass: true, pillar: '#EAD9CF' },
    villa: { sp: true, fill: '#D8B898', fillDk: '#AD8A6B', alt: '#E9D6C0', speck: '#CDB08C', top: '#E8DDC9', topHi: '#F6F0E4', plat: '#8E6B47', platDk: '#634A2F', mosaic: true, ashlar: true, pillar: '#EFE4D6' },
    gate: { sp: true, fill: '#DDB6A7', fillDk: '#A97F70', alt: '#EBD5C9', speck: '#F8EFE9', top: '#BFA898', topHi: '#E6D8CC', plat: '#8C6A43', platDk: '#5E4529', ashlar: true, cobble: true, pillar: '#F2E4DA' },
    fresco: { sp: true, fill: '#DCCDB9', fillDk: '#B9A58D', alt: '#ECE2D3', speck: '#F1E8DB', top: '#B98E6E', topHi: '#E0BC97', plat: '#7A5A3A', platDk: '#523B25', ashlar: true, floor: true, pillar: '#ECE2D3', inside: true },
    alley: { sp: true, fill: '#DDB3A4', fillDk: '#A77C6D', alt: '#EDD6CA', speck: '#F8EEE8', top: '#B39C8C', topHi: '#DCCABD', plat: '#E7DBCF', platDk: '#9A8A7E', ashlar: true, cobble: true, balcony: true, windows: true, pillar: '#F2E4DA' },
    belvedere: { sp: true, fill: '#E6CDBF', fillDk: '#C5A797', alt: '#F3E7DE', speck: '#F8EEE8', top: '#719C4C', topHi: '#A6CC6F', plat: '#8E6B47', platDk: '#634A2F', grass: true, ashlar: true, pillar: '#F2E4DA' },
    dusk: { sp: true, fill: '#B39187', fillDk: '#8E6B61', alt: '#C4A49A', speck: '#CDB2A9', top: '#4F7148', topHi: '#6E9563', plat: '#6E5338', platDk: '#4A3622', grass: true, ashlar: true, pillar: '#D9C1B6' }
  };
  Object.keys(SPT).forEach(function (k) { TER[k] = SPT[k]; });
  var ROOF = ['#B5543A', '#C4674A', '#A84B34'], WALL = ['#F2DED4', '#EACBBE', '#F7EDE5', '#E2BFB1', '#F0D6CB'];
  function genBackgroundsSp(R, arr, ridge) {
    function houses(n, wMin, wMax, hMin, hMax) { var x = 0, a = []; while (x < PER && a.length < n) { var w = wMin + R() * (wMax - wMin); a.push({ x: x, w: w, h: hMin + R() * (hMax - hMin), tone: Math.floor(R() * WALL.length), roof: Math.floor(R() * 3), win: 1 + Math.floor(R() * 3), flow: R() < .65, arch: R() < .18 }); x += w + (R() < .2 ? 10 + R() * 30 : 0); } return a; }
    BG.town = arr(64, function (i) { var u = (R() + R() + R()) / 3 * 2 - 1; return { dx: u * 230, dep: R(), w: 16 + R() * 18, h: 12 + R() * 14, tone: Math.floor(R() * WALL.length), roof: Math.floor(R() * 3), tower: i === 7 || i === 30 || i === 51 }; });
    BG.town.forEach(function (hs) { hs.base = spHill(hs.dx) * (1 - hs.dep * .55) + hs.dep * 6; if (hs.tower) { hs.dep = .05; hs.base = spHill(hs.dx) + 4; } });
    BG.town.sort(function (a, b) { return a.base - b.base; });
    BG.grove = arr(60, function (i) { var row = i % 3; return { x: (i / 60) * PER + R() * 30, row: row, s: .5 + row * .22 + R() * .12 }; });
    BG.olive = { far: ridge(200, 120, 190), mid: ridge(150, 255, 300), trees: arr(13, function () { return { x: R() * PER, s: .7 + R() * .5, y: R() * 30 }; }), town: [820] };
    BG.villa = { far: ridge(170, 210, 260), mid: ridge(160, 286, 300), walls: arr(7, function (i) { return { x: i * PER / 7 + R() * 80, w: 60 + R() * 120, h: 18 + R() * 40 }; }),
      cols: arr(6, function () { return { x: R() * PER, h: 50 + R() * 70, broken: R() < .5 }; }), mos: arr(3, function (i) { return { x: 200 + i * 520 + R() * 120, w: 150 + R() * 80, seed: Math.floor(R() * 1000) }; }), town: [1250] };
    BG.gate = { far: ridge(180, 200, 250), cyp: arr(9, function () { return { x: R() * PER, h: 46 + R() * 40 }; }), gateX: 620, town: [1300] };
    BG.fresco = { panels: arr(4, function (i) { return { x: i * PER / 4 + 40, w: 230 + R() * 60, figs: 2 + Math.floor(R() * 2), c: Math.floor(R() * 4) }; }), cols: arr(5, function (i) { return { x: i * PER / 5 }; }) };
    BG.alley = { far: houses(30, 70, 120, 120, 190), mid: houses(14, 120, 200, 70, 130) };
    BG.belvedere = { hills: [ridge(140, 150, 205), ridge(110, 185, 225)], fields: arr(46, function (i) { return { x: R() * PER, y: R(), w: 40 + R() * 90, c: Math.floor(R() * 5) }; }),
      vill: arr(7, function () { return { x: R() * PER, y: R() }; }), cyp: arr(10, function () { return { x: R() * PER, h: 40 + R() * 36 }; }), olives: arr(8, function () { return { x: R() * PER, s: .7 + R() * .4, y: R() * 20 }; }) };
    BG.dusk = { stars: arr(40, function () { return { x: R() * PER, y: R() * 200, p: R() * 6 }; }), lights: arr(30, function () { return { x: R() * PER, y: R(), p: R() * 6 }; }) };
  }
  function spSky(c, w, h, top, bot) { var g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, top); g.addColorStop(1, bot); c.fillStyle = g; c.fillRect(0, 0, w, h); }
  function spOlive(c, x, y, s) { // drzewo oliwne: szary pień, srebrzysta korona
    c.fillStyle = '#6E5E4E'; c.beginPath(); c.moveTo(x - 3 * s, y); c.quadraticCurveTo(x - 1 * s, y - 14 * s, x - 5 * s, y - 22 * s); c.lineTo(x + 2 * s, y - 22 * s); c.quadraticCurveTo(x + 2 * s, y - 12 * s, x + 4 * s, y); c.fill();
    c.fillStyle = '#7F9A72'; c.beginPath(); ell(c, x - 8 * s, y - 28 * s, 14 * s, 9 * s, 0); ell(c, x + 7 * s, y - 30 * s, 13 * s, 9 * s, 0); ell(c, x, y - 37 * s, 13 * s, 8 * s, 0); c.fill();
    c.fillStyle = '#B4C7A6'; c.beginPath(); ell(c, x - 6 * s, y - 32 * s, 6 * s, 3 * s, 0); ell(c, x + 5 * s, y - 37 * s, 5 * s, 2.5 * s, 0); c.fill();
  }
  function spCypress(c, x, y, hgt, col) { c.fillStyle = col || '#3F6B4A'; c.beginPath(); c.moveTo(x, y - hgt); c.quadraticCurveTo(x + 9, y - hgt * .45, x + 5, y); c.lineTo(x - 5, y); c.quadraticCurveTo(x - 9, y - hgt * .45, x, y - hgt); c.fill(); }
  function spHill(dx) { return -128 * Math.exp(-Math.pow(dx / 200, 2)) - 10 * Math.exp(-Math.pow((dx - 120) / 90, 2)); } // profil wzgórza (y w górę ujemne)
  function spTown(c, x, y, s, lit, t) { // Spello na zboczu: wzgórze z gajami oliwnymi, gęsto ułożone domy z różowo-białego kamienia, dachówki, dzwonnice
    var d;
    c.fillStyle = lit ? '#3E4A55' : '#A3B287'; c.beginPath(); c.moveTo(x - 420 * s, y + 30 * s);
    for (d = -420; d <= 420; d += 20) c.lineTo(x + d * s, y + spHill(d) * s + 10 * s);
    c.lineTo(x + 420 * s, y + 30 * s); c.closePath(); c.fill();
    if (!lit) { c.fillStyle = '#8A9D74'; for (var r2 = 0; r2 < 4; r2++) for (d = -400 + r2 * 9; d <= 400; d += 18) { var hy = spHill(d); if (hy > -95 || Math.abs(d) > 230) { var yy = y + (hy + 10) * s + (8 + r2 * 9) * s; if (yy < y + 26 * s) c.fillRect(x + d * s, yy, 5 * s, 3.5 * s); } } }
    var H = BG.town;
    for (var i = 0; i < H.length; i++) {
      var hs = H[i], hx = x + hs.dx * s, base = y + hs.base * s + 12 * s, hw = hs.w * s, hh = hs.h * s;
      if (hs.tower) {
        var th = hh + 34 * s;
        c.fillStyle = lit ? '#6F625E' : '#F1E2D8'; c.fillRect(hx - 6 * s, base - th, 12 * s, th + 4 * s);
        c.fillStyle = lit ? '#3E3530' : '#A8573C'; c.beginPath(); c.moveTo(hx - 8 * s, base - th); c.lineTo(hx, base - th - 13 * s); c.lineTo(hx + 8 * s, base - th); c.fill();
        c.fillStyle = lit ? '#FFD27A' : 'rgba(60,40,30,.6)'; c.fillRect(hx - 3 * s, base - th + 4 * s, 6 * s, 7 * s);
        continue;
      }
      c.fillStyle = lit ? '#5F5454' : WALL[hs.tone]; c.fillRect(hx - hw / 2, base - hh, hw, hh + 8 * s);
      c.fillStyle = lit ? 'rgba(0,0,0,.18)' : 'rgba(150,100,85,.22)'; c.fillRect(hx + hw * .2, base - hh, hw * .3, hh + 8 * s);
      c.fillStyle = lit ? '#3A302C' : ROOF[hs.roof]; c.beginPath(); c.moveTo(hx - hw / 2 - 2 * s, base - hh + 1); c.lineTo(hx - hw / 2 + 3 * s, base - hh - 5 * s); c.lineTo(hx + hw / 2 + 1 * s, base - hh - 5 * s); c.lineTo(hx + hw / 2 + 2 * s, base - hh + 1); c.fill();
      if (lit) { if (Math.sin(t * 1.3 + i) > -.4) { c.fillStyle = '#FFCF6E'; c.fillRect(hx - 2 * s, base - hh * .55, 3 * s, 3 * s); } }
      else if (s > .7 && hw > 18 * s) { c.fillStyle = 'rgba(70,50,40,.45)'; c.fillRect(hx - hw * .3, base - hh * .55, 2.5 * s, 3.5 * s); c.fillRect(hx + hw * .1, base - hh * .55, 2.5 * s, 3.5 * s); }
    }
  }
  function spFacade(c, x, y, hs, sc, lit, t) { // dom w uliczce: kamień, okiennice, skrzynki z kwiatami, czasem łuk
    var w = hs.w * sc, hgt = hs.h * sc;
    c.fillStyle = lit ? '#6A5550' : WALL[hs.tone]; c.fillRect(x, y - hgt, w + 1, hgt + 400);
    c.fillStyle = lit ? 'rgba(0,0,0,.12)' : 'rgba(150,100,80,.13)'; for (var r = 0; r < hgt; r += 14 * sc) c.fillRect(x, y - hgt + r, w, 1.5);
    c.fillStyle = lit ? '#3A2D28' : ROOF[hs.roof]; c.fillRect(x - 3, y - hgt - 6 * sc, w + 7, 7 * sc);
    var nw = hs.win, gap = w / (nw + 1);
    for (var k = 1; k <= nw; k++) for (var fl = 0; fl < 2; fl++) {
      var wx = x + gap * k - 6 * sc, wy = y - hgt + (20 + fl * 46) * sc;
      if (wy > y - 30 * sc) continue;
      if (lit) { c.fillStyle = Math.sin(t * .7 + k * 3 + fl + hs.x) > -.2 ? '#FFC96A' : '#2A2230'; c.fillRect(wx, wy, 12 * sc, 18 * sc); continue; }
      c.fillStyle = '#4A3A33'; c.fillRect(wx, wy, 12 * sc, 18 * sc);
      c.fillStyle = '#3F7A55'; c.fillRect(wx - 6 * sc, wy, 5 * sc, 18 * sc); c.fillRect(wx + 13 * sc, wy, 5 * sc, 18 * sc);
      if (hs.flow) { c.fillStyle = '#9A5A3A'; c.fillRect(wx - 2 * sc, wy + 18 * sc, 16 * sc, 4 * sc); c.fillStyle = (k + fl) % 2 ? '#E8467C' : '#C81E36'; c.beginPath(); ell(c, wx + 2 * sc, wy + 16 * sc, 3 * sc, 3 * sc, 0); ell(c, wx + 7 * sc, wy + 15 * sc, 3 * sc, 3 * sc, 0); ell(c, wx + 12 * sc, wy + 16 * sc, 3 * sc, 3 * sc, 0); c.fill(); c.fillStyle = '#4F8A3F'; c.fillRect(wx - 1 * sc, wy + 17 * sc, 14 * sc, 2 * sc); }
    }
    if (hs.arch) { c.fillStyle = lit ? '#1E1820' : '#5E4A42'; c.beginPath(); c.moveTo(x + w * .25, y + 400); c.lineTo(x + w * .25, y - 22 * sc); c.arc(x + w * .5, y - 22 * sc, w * .25, Math.PI, 0); c.lineTo(x + w * .75, y + 400); c.fill(); }
  }
  function spMosaic(c, x, y, w, seed, k) { // fragment mozaiki na posadzce (perspektywa: spłaszczony)
    var cols = ['#E8DDC9', '#B5543A', '#2F5D8C', '#D9A441', '#3E3530', '#7E9F6A'], n = Math.floor(w / 10), rows = 4;
    c.fillStyle = '#8F7B66'; c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y); c.lineTo(x + w - 18, y - rows * 6); c.lineTo(x + 18, y - rows * 6); c.fill();
    for (var r = 0; r < rows; r++) for (var i = 0; i < n; i++) {
      var hsh = (seed * 31 + i * 17 + r * 7 + ((i ^ r) & 3)) % 23, ci = (i === 0 || i === n - 1 || r === 0) ? 1 : (hsh % 5 === 0 ? 2 : hsh % 7 === 0 ? 3 : 0);
      if (k && (i + r) % 4 === 0) ci = 4;
      var inset = 18 * (r + 1) / rows; c.fillStyle = cols[ci];
      c.fillRect(x + inset + i * (w - inset * 2) / n, y - (r + 1) * 6 + 1, (w - inset * 2) / n - 1, 5);
    }
  }
  function drawSolidSp(T, tk, x, y, top, h) { // kafel kamienny/ziemny (Spello); krawędzie i góra rysuje drawSolid
    if (T.ashlar) { // bloki różowego i białego kamienia z Subasio
      var r0 = ((Math.floor(y / TILE) % 2) + 2) % 2;
      ctx.fillStyle = T.alt;
      for (var r2 = 0; r2 < 2; r2++) {
        var oy = y + r2 * 16, jx = (r0 + r2) % 2 ? 16 : 0;
        if (jx) { if ((h >> r2) & 1) ctx.fillRect(x, oy, jx, 16); if ((h >> (r2 + 3)) & 1) ctx.fillRect(x + jx, oy, TILE - jx, 16); }
        else if ((h >> (r2 + 5)) & 1) ctx.fillRect(x, oy, TILE, 16);
      }
      ctx.fillStyle = T.fillDk; ctx.fillRect(x, y + 15, TILE, 2); ctx.fillRect(x, y + 31, TILE, 1);
      ctx.fillRect(x + (r0 ? 15 : 0), y, r0 ? 2 : 1, 15); ctx.fillRect(x + (r0 ? 0 : 15), y + 17, r0 ? 1 : 2, 14);
      if (T.windows && !top && y <= 9 * TILE && y >= 0 && h % 5 === 0) { // okno z okiennicami w ścianie domu
        ctx.fillStyle = '#4A3A33'; ctx.fillRect(x + 10, y + 6, 12, 18); ctx.fillStyle = '#3F7A55'; ctx.fillRect(x + 4, y + 6, 5, 18); ctx.fillRect(x + 23, y + 6, 5, 18);
        ctx.fillStyle = '#9A5A3A'; ctx.fillRect(x + 7, y + 24, 18, 4); ctx.fillStyle = h % 2 ? '#E8467C' : '#C81E36'; ctx.beginPath(); ell(ctx, x + 11, y + 22, 3, 3, 0); ell(ctx, x + 16, y + 21, 3, 3, 0); ell(ctx, x + 21, y + 22, 3, 3, 0); ctx.fill();
      }
    } else {
      ctx.fillStyle = T.speck;
      ctx.fillRect(x + (h % 24) + 2, y + ((h >> 5) % 22) + 4, 5, 4);
      ctx.fillRect(x + ((h >> 9) % 22) + 3, y + ((h >> 13) % 20) + 6, 3, 3);
      if (T.strata) { ctx.fillStyle = T.fillDk; ctx.fillRect(x, y + 10 + (h % 3), TILE, 2); ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x, y + 24, TILE, 2); }
    }
  }
  function drawTopSp(T, x, y, h) { // wierzch kafla: trawa, mozaika, bruk, posadzka
    if (T.grass) return false;
    if (T.mosaic) {
      ctx.fillStyle = '#3E3530'; ctx.fillRect(x, y, TILE, 10);
      var MC = ['#E8DDC9', '#B5543A', '#2F5D8C', '#D9A441', '#E8DDC9', '#7E9F6A'];
      for (var i = 0; i < 8; i++) { ctx.fillStyle = MC[(Math.floor(x / 4) + i + ((h >> i) & 1)) % 6]; ctx.fillRect(x + i * 4, y + 1, 3.5, 4); ctx.fillStyle = MC[(Math.floor(x / 4) + i + 3) % 6]; ctx.fillRect(x + i * 4, y + 5.5, 3.5, 4); }
    } else if (T.floor) {
      ctx.fillStyle = T.top; ctx.fillRect(x, y, TILE, 8); ctx.fillStyle = T.topHi; ctx.fillRect(x + ((x / TILE) % 2 ? 0 : 16), y, 16, 8); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x, y, TILE, 1.5);
    } else { // bruk
      ctx.fillStyle = T.top; ctx.fillRect(x, y, TILE, 8);
      ctx.fillStyle = T.topHi; for (var k = 0; k < 4; k++) { ctx.beginPath(); ell(ctx, x + 4 + k * 8, y + 3 + ((h >> k) & 1), 3.4, 2.3, 0); ctx.fill(); }
    }
    ctx.fillStyle = 'rgba(14,26,43,.45)'; ctx.fillRect(x, y - 1, TILE, 1.5);
    return true;
  }
  function drawPlatformSp(T, x, y, l, r) {
    if (T.balcony) { // balkon: kamienna płyta, wsporniki, donice z kwiatami na brzegach
      ctx.fillStyle = '#6E5F55'; ctx.fillRect(x, y + 9, TILE, 3);
      ctx.fillStyle = T.plat; ctx.fillRect(x, y, TILE, 9); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(x, y, TILE, 2);
      ctx.fillStyle = '#4A3E38'; ctx.fillRect(x + 6, y + 12, 4, 8); ctx.fillRect(x + 22, y + 12, 4, 8);
      ctx.strokeStyle = '#2E2A2C'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x, y + 26); ctx.lineTo(x + TILE, y + 26); for (var i = 2; i < TILE; i += 6) { ctx.moveTo(x + i, y + 12); ctx.lineTo(x + i, y + 26); } ctx.stroke();
      [[!l, x + 3], [!r, x + 19]].forEach(function (p) {
        if (!p[0]) return; var px = p[1];
        ctx.fillStyle = '#A4502F'; ctx.beginPath(); ctx.moveTo(px, y - 9); ctx.lineTo(px + 10, y - 9); ctx.lineTo(px + 8, y); ctx.lineTo(px + 2, y); ctx.fill();
        ctx.fillStyle = '#4F8A3F'; ctx.fillRect(px + 1, y - 12, 8, 3);
        ctx.fillStyle = px === x + 3 ? '#E8467C' : '#FFC629'; ctx.beginPath(); ell(ctx, px + 2, y - 13, 2.6, 2.6, 0); ell(ctx, px + 6, y - 15, 2.6, 2.6, 0); ell(ctx, px + 9, y - 12, 2.4, 2.4, 0); ctx.fill();
      });
      ctx.fillStyle = 'rgba(14,26,43,.4)'; if (!l) ctx.fillRect(x, y, 2, 9); if (!r) ctx.fillRect(x + TILE - 2, y, 2, 9);
      return;
    }
    ctx.fillStyle = T.plat; ctx.fillRect(x, y, TILE, 11);
    ctx.fillStyle = T.platDk; ctx.fillRect(x, y + 8, TILE, 3);
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(x, y, TILE, 2);
    ctx.fillStyle = T.platDk; ctx.fillRect(x + 10, y + 2, 1.5, 6); ctx.fillRect(x + 21, y + 2, 1.5, 6);
    ctx.fillStyle = 'rgba(14,26,43,.4)'; if (!l) ctx.fillRect(x, y, 2, 11); if (!r) ctx.fillRect(x + TILE - 2, y, 2, 11);
  }
  function drawPigeon(e) { // gołąb (w Spello zamiast nietoperza): szary, macha skrzydłami
    var flap = reduceMotion ? .5 : (Math.sin(e.t * (e.st === 1 ? 30 : 14)) * .5 + .5), f = (e.st === 2 ? (e.tx < e.x ? -1 : 1) : Math.cos(e.t * 1.3) >= 0 ? 1 : -1);
    ctx.save(); ctx.translate(e.x, e.y); ctx.scale(f, 1);
    ctx.fillStyle = '#7D8696'; ctx.beginPath(); ctx.moveTo(-2, -3); ctx.lineTo(-16, -6 - flap * 14); ctx.lineTo(-6, 1); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 3.6; ctx.lineJoin = 'round'; ctx.beginPath(); ell(ctx, 0, 0, 10, 7, 0); ell(ctx, 9, -7, 4.5, 4, 0); ctx.stroke();
    var pg = ctx.createRadialGradient(-2, -4, 1, 0, 0, 11); pg.addColorStop(0, '#C3CAD6'); pg.addColorStop(1, '#8C95A5'); ctx.fillStyle = pg; ctx.beginPath(); ell(ctx, 0, 0, 10, 7, 0); ctx.fill();
    ctx.fillStyle = '#6B7484'; ctx.beginPath(); ctx.moveTo(-9, -1); ctx.lineTo(-17, 4); ctx.lineTo(-8, 4); ctx.fill();
    ctx.fillStyle = '#5F8F87'; ctx.beginPath(); ell(ctx, 7, -3, 4.5, 4.5, 0); ctx.fill();
    ctx.fillStyle = '#9AA3B2'; ctx.beginPath(); ell(ctx, 9, -7, 4.5, 4, 0); ctx.fill();
    ctx.fillStyle = '#E8A04B'; ctx.beginPath(); ctx.moveTo(13, -7); ctx.lineTo(17, -6); ctx.lineTo(13, -5); ctx.fill();
    ctx.fillStyle = '#0E1A2B'; ctx.beginPath(); ell(ctx, 10.5, -8, 1.3, 1.3, 0); ctx.fill();
    ctx.fillStyle = '#7D8696'; ctx.beginPath(); ctx.moveTo(2, -3); ctx.lineTo(10 - flap * 4, -8 - flap * 12); ctx.lineTo(8, 0); ctx.fill();
    if (e.st === 1) { ctx.scale(f, 1); ctx.fillStyle = '#FFC629'; ctx.font = font(18); ctx.textAlign = 'center'; ctx.fillText('!', 0, -16); }
    ctx.restore();
  }
  function drawPot(r, ry, sh) { // spadająca donica z kwiatkiem (uliczki)
    ctx.save(); ctx.translate(r.x + sh, ry);
    ctx.fillStyle = '#5A2E1C'; ctx.beginPath(); ctx.moveTo(-12, -6); ctx.lineTo(12, -6); ctx.lineTo(9, 12); ctx.lineTo(-9, 12); ctx.fill();
    ctx.fillStyle = '#B9603A'; ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(10, -4); ctx.lineTo(7.5, 10); ctx.lineTo(-7.5, 10); ctx.fill();
    ctx.fillStyle = '#C9744A'; ctx.fillRect(-12, -9, 24, 5);
    ctx.fillStyle = '#4F8A3F'; ctx.fillRect(-1, -18, 2, 9);
    ctx.fillStyle = '#E8467C'; ctx.beginPath(); for (var k = 0; k < 5; k++) { var a = k / 5 * Math.PI * 2; ell(ctx, Math.cos(a) * 3.4, -20 + Math.sin(a) * 3.4, 2.6, 2.6, 0); } ctx.fill();
    ctx.fillStyle = '#FFC629'; ctx.beginPath(); ell(ctx, 0, -20, 1.8, 1.8, 0); ctx.fill();
    ctx.restore();
  }

  /* ---------- 4c. Oprawa tła: warstwy z pamięcią podręczną, pora dnia, chmury, ptaki, światło ----------
     Każdy teren = lista warstw parallax (od nieba do najbliższej). Statyczną część warstwy rysujemy RAZ do płótna
     poza ekranem (pas PER × wysokość widoku; dalekie warstwy w niższej rozdzielczości = naturalne rozmycie powietrza),
     a w każdej klatce tylko je kopiujemy. Ruch (chmury, cyprysy na wietrze, ptaki, gwiazdy, smugi światła, pyłki)
     rysujemy na bieżąco — to kilka kształtów. Mgła (atmospheric perspective): dalsze warstwy jaśniejsze i mniej
     nasycone, mocniej u dołu. Podmiana na grafiki: ART_SRC['<teren>.<nr warstwy>'] = 'plik.webp' (szer. PER px,
     wys. jak warstwa, przezroczysty PNG/WebP) — wtedy zamiast rysowania kodem kopiujemy obrazek (README, „Oprawa”). */
  var ART_SRC = {}, artImg = {};
  function hexRgb(h) {
    if (h.charAt(0) !== '#') { var m = h.match(/[\d.]+/g) || [0, 0, 0]; return [+m[0], +m[1], +m[2]]; }
    var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function mixHex(a, b, t) { var A = hexRgb(a), B = hexRgb(b); return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' + Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')'; }
  function rgba(h, a) { var A = hexRgb(h); return 'rgba(' + A[0] + ',' + A[1] + ',' + A[2] + ',' + a + ')'; }
  var LC = { map: {}, n: 0, k: 1, vh: 0 }; // pamięć warstw: klucz teren|nr → { cv, q, y0, y1, top, bot }
  function layerCache(kind, li, Ly, camYmin, camYmax) {
    var key = kind + '|' + li, e = LC.map[key];
    if (e && e.k === LC.k && e.vh === LC.vh) { e.use = ++LC.n; return e; }
    var q = Ly.far ? Math.min(LC.k, 1) : Math.min(LC.k, 1.5);
    var y0 = Math.min(Ly.y0 != null ? Ly.y0 : 0, Math.floor(camYmin * Ly.py) - 8), y1 = Math.ceil(view.h + 24 + Math.max(0, camYmax) * Ly.py);
    if (Ly.y1 != null) y1 = Math.min(y1, Ly.y1);
    var cv = document.createElement('canvas'); cv.width = Math.ceil(PER * q); cv.height = Math.max(2, Math.ceil((y1 - y0) * q));
    var c = cv.getContext('2d'), src = ART_SRC[kind + '.' + li], im = src && artImg[src];
    c.setTransform(q, 0, 0, q, 0, -y0 * q);
    if (im && im.complete && im.naturalWidth) c.drawImage(im, 0, y0, PER, y1 - y0);
    else { c.save(); c.beginPath(); c.rect(0, y0, PER, y1 - y0); c.clip(); Ly.draw(c, 0, 0, PER, y1 + 10); Ly.draw(c, -PER, 0, PER, y1 + 10); c.restore(); }
    if (Ly.haze) { // mgła: kolor nieba, mocniej u dołu
      c.globalCompositeOperation = 'source-atop';
      var g = c.createLinearGradient(0, Ly.hy0 != null ? Ly.hy0 : y0, 0, Ly.hy1 != null ? Ly.hy1 : y1);
      g.addColorStop(0, rgba(Ly.haze, Ly.ha0 != null ? Ly.ha0 : 0)); g.addColorStop(1, rgba(Ly.haze, Ly.ha1));
      c.fillStyle = g; c.fillRect(0, y0, PER, y1 - y0); c.globalCompositeOperation = 'source-over';
    }
    e = { cv: cv, q: q, y0: y0, y1: y1, k: LC.k, vh: LC.vh, use: ++LC.n, top: null, bot: null };
    try { // kolor do dopełnienia nad i pod pasem (np. sufit jaskini, dolina) — tylko dla warstw, które tego chcą
      if (Ly.fillTop) { var d = c.getImageData(Math.floor(cv.width / 2), 0, 1, 1).data; if (d[3] > 250) e.top = 'rgb(' + d[0] + ',' + d[1] + ',' + d[2] + ')'; }
      if (Ly.fillBot) { d = c.getImageData(Math.floor(cv.width / 3), cv.height - 1, 1, 1).data; if (d[3] > 250) e.bot = 'rgb(' + d[0] + ',' + d[1] + ',' + d[2] + ')'; }
    } catch (er) { /* bez dopełnienia */ }
    LC.map[key] = e;
    if (window.createImageBitmap) createImageBitmap(cv).then(function (bm) { e.bm = bm; }, function () {});
    var keys = Object.keys(LC.map); // najwyżej ~14 warstw w pamięci (2–3 tereny), najdawniej używane wylatują
    if (keys.length > 14) { keys.sort(function (a, b) { return LC.map[a].use - LC.map[b].use; }); for (var i = 0; i < keys.length - 14; i++) delete LC.map[keys[i]]; }
    return e;
  }
  function camYRange() { var bottomY = ROWS * TILE + view.reserve; return view.h >= bottomY ? [bottomY - view.h, bottomY - view.h] : [0, bottomY - view.h]; }
  /* LAYER_CACHE: true = warstwy jako gotowe obrazki (opłaca się przy płótnie na GPU i przy grafikach z ART_SRC),
     false = rysowane kodem w każdej klatce (szybsze przy programowym rysowaniu płótna — tak mierzy test CPU ×4). */
  var LAYER_CACHE = false, VW = PER;
  function vis(x, pad) { return x > -pad && x < VW + pad; } // czy element warstwy jest na ekranie (nie budujemy niewidocznych kształtów)
  function blitLayer(c, kind, li, camX, camY, w, h) {
    var Ly = BGL[kind][li], oy = -camY * Ly.py + (Ly.dy || 0);
    if (!LAYER_CACHE && !ART_SRC[kind + '.' + li]) { // dalsze warstwy wypełniamy tylko do „yb” (niżej i tak je zasłania bliższa)
      var bot = Ly.yb != null ? oy + Ly.yb : h + 10;
      VW = w; c.__far = !!Ly.far; eachRepeat(camX, Ly.par, w, function (ox) { if (Ly.draw) Ly.draw(c, ox, oy, w, bot); }); c.__far = false;
      if (Ly.live) eachRepeat(camX, Ly.par, w, function (ox) { Ly.live(c, ox, oy, w, h); });
      return;
    }
    VW = PER; var r = camYRange(), e = layerCache(kind, li, Ly, Math.min(r[0], camY), Math.max(r[1], camY));
    var off = -((camX * Ly.par) % PER); if (off > 0) off -= PER;
    var top = oy + e.y0, bot = oy + e.y1;
    if (e.top && top > 0) { c.fillStyle = e.top; c.fillRect(0, 0, w, top + 1); }
    for (var x = off; x < w; x += PER) {
      var a = Math.max(x, 0), b = Math.min(x + PER, w); if (b <= a) continue;
      c.drawImage(e.bm || e.cv, (a - x) * e.q, 0, (b - a) * e.q, e.cv.height, a, top, b - a, e.y1 - e.y0);
    }
    if (e.bot && bot < h) { c.fillStyle = e.bot; c.fillRect(0, bot - 1, w, h - bot + 1); }
    if (Ly.live) eachRepeat(camX, Ly.par, w, function (ox) { Ly.live(c, ox, oy, w, h); });
  }
  /* Pora dnia: pierwszy przystanek rano, ostatni o zmierzchu (0 → 1 wzdłuż wycieczki). */
  var TOD = 0;
  function todAt(px) { if (!L) return 0; var n = L.sections.length; return n > 1 ? L.sec[clamp(Math.floor(px / TILE), 0, L.W - 1)] / (n - 1) : 0; }
  /* Niebo rysujemy tylko do linii, poniżej której i tak zasłania je najbliższa pełna warstwa (oszczędność pikseli). */
  var SKYCUT = { valley: [.7, 300], stone: [.7, 312], cliff: [.7, 306], olive: [.7, 302], villa: [.7, 302], gate: [.7, 172], belvedere: [.45, 270], dusk: [.45, 270], fresco: [.45, -36] }, skyHc = 1e9;
  function skyGrad(c, w, h, stops) { var hc = Math.max(0, Math.min(h, skyHc)); if (hc <= 0) return; var g = c.createLinearGradient(0, 0, 0, h); stops.forEach(function (s) { g.addColorStop(s[0], s[1]); }); c.fillStyle = g; c.fillRect(0, 0, w, hc); }
  function outdoorSky(c, w, h, top, bot, camY) { // niebo z porą dnia: rano chłodniej, po południu złoto
    var tod = TOD, warm = clamp((tod - .45) / .55, 0, 1), cool = clamp(1 - tod / .4, 0, 1);
    var t2 = mixHex(top, '#5E86C8', warm * .35), b2 = mixHex(mixHex(bot, '#FFD7A0', warm * .75), '#EAF1F8', cool * .35);
    skyGrad(c, w, h, [[0, t2], [1, b2]]); // 2 przystanki gradientu: szybka ścieżka rysowania
  }
  function drawSun(c, w, h, camY, t) {
    var tod = TOD, sx = w * (.16 + .62 * tod), sy = -camY * .12 + 70 + 120 * tod * tod, R = 70 + 30 * tod;
    c.fillStyle = tod > .6 ? 'rgba(255,214,150,.2)' : 'rgba(255,250,228,.22)'; c.beginPath(); c.arc(sx, sy, R * .62, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(sx, sy, R * .36, 0, Math.PI * 2); c.fill();
    c.fillStyle = tod > .6 ? '#FFE2A8' : '#FFFBEA'; c.beginPath(); ell(c, sx, sy, 20, 20, 0); c.fill();
    if (reduceMotion || tod < .55) return;
    c.save(); c.translate(sx, sy); c.rotate(.5 + Math.sin(t * .07) * .05);
    for (var i = 0; i < 2; i++) { // smugi światła tylko o złotej godzinie
      var a = (i - 1) * .2 + Math.sin(t * .3 + i * 1.7) * .02, al = .05 + .025 * Math.sin(t * .5 + i);
      c.rotate(a); c.fillStyle = 'rgba(255,244,214,' + al.toFixed(3) + ')';
      c.beginPath(); c.moveTo(24, -3); c.lineTo(380, -22 - i * 4); c.lineTo(380, 22 + i * 4); c.lineTo(24, 3); c.fill(); c.rotate(-a);
    }
    c.restore();
  }
  var CLOUDS = [];
  function drawClouds(c, camX, camY, w, t, n, yTop, scale) { // chmury kodem: białe kłęby, cień od spodu, jasny wierzch
    var gold = TOD > .62, drift = reduceMotion ? 0 : t * 5, sh = gold ? 'rgba(240,190,160,.35)' : 'rgba(186,200,226,.38)';
    eachRepeat(camX + drift / .06, .06, w, function (ox) {
      for (var i = 0; i < n; i++) {
        var k = CLOUDS[i], s = k.s * (scale || 1), x = ox + k.x, y = -camY * .2 + yTop + k.y + 50 * s; if (x > w + 20 || x + 200 * s < -20) continue;
        var B = k.b; c.globalAlpha = k.a * (c.__ga || 1);
        c.fillStyle = '#FFFFFF'; c.beginPath(); for (var j = 0; j < B.length; j++) ell(c, x + B[j][0] * s, y + B[j][1] * s, B[j][2] * 1.15 * s, B[j][2] * s, 0); ell(c, x + 100 * s, y + 2 * s, 62 * s, 12 * s, 0); c.fill();
        c.fillStyle = sh; c.beginPath(); ell(c, x + 100 * s, y + 6 * s, 56 * s, 6.5 * s, 0); c.fill();
      }
    });
    c.globalAlpha = c.__ga || 1;
  }
  function drawBirds(c, w, camY, t, n, col) { // kilka ptaków w oddali (jaskółki): machają skrzydłami i przelatują
    c.strokeStyle = col || 'rgba(40,50,70,.55)'; c.lineWidth = 1.6; c.lineCap = 'round'; c.beginPath();
    for (var i = 0; i < n; i++) {
      var sp = 18 + (i % 3) * 7, x = ((i * 397 + t * sp) % (w + 240)) - 120, y = -camY * .25 + 70 + ((i * 53) % 90) + Math.sin(t * .8 + i * 2) * 8;
      var f = reduceMotion ? .5 : Math.sin(t * (7 + i % 3) + i) * .5 + .5, s = 4 + (i % 3) * 1.2;
      c.moveTo(x - s * 1.4, y - f * s * .9); c.quadraticCurveTo(x - s * .5, y - s * .2, x, y + s * .25); c.quadraticCurveTo(x + s * .5, y - s * .2, x + s * 1.4, y - f * s * .9);
    }
    c.stroke();
  }
  function swayCypress(c, x, y, hgt, col, t, seed) { // cyprys na wietrze: czubek kołysze się, lewa strona w świetle
    var dx = reduceMotion ? 0 : Math.sin(t * 1.1 + seed) * hgt * .035 + Math.sin(t * 2.3 + seed * 3) * hgt * .012;
    c.fillStyle = col || '#3F6B4A'; c.beginPath(); c.moveTo(x + dx, y - hgt); c.quadraticCurveTo(x + 10 + dx * .5, y - hgt * .45, x + 5.5, y); c.lineTo(x - 5.5, y); c.quadraticCurveTo(x - 10 + dx * .5, y - hgt * .45, x + dx, y - hgt); c.fill();
    c.fillStyle = 'rgba(255,240,200,.16)'; c.beginPath(); c.moveTo(x + dx, y - hgt); c.quadraticCurveTo(x - 9 + dx * .5, y - hgt * .45, x - 5, y); c.lineTo(x - 1, y); c.quadraticCurveTo(x - 3 + dx * .5, y - hgt * .45, x + dx, y - hgt); c.fill();
  }
  function ridgeFill(c, pts, ox, oy, bottom, top, bot, smooth) {
    var mn = 1e9; pts.forEach(function (p) { mn = Math.min(mn, p[1]); });
    // dwa płaskie tony zamiast gradientu (gradient na dużej powierzchni jest drogi przy rysowaniu programowym)
    c.fillStyle = top; (smooth ? smoothPath : jaggedPath)(c, pts, ox, oy, bottom); c.fill();
    // cień pod grzbietem: tylko wąski pas (mało pikseli), zamiast drugiej pełnej warstwy
    if (!c.__far) ridgeRim(c, pts, ox, oy + 4, bot, 5, smooth);
  }
  function ridgeRim(c, pts, ox, oy, col, lw, smooth) { // jasna krawędź grzbietu (tylko widoczny odcinek — obrys całego pasa jest drogi)
    c.strokeStyle = col; c.lineWidth = lw || 1.5; c.beginPath();
    var a = 0, z = pts.length - 1;
    while (a < z && ox + pts[a + 1][0] < -40) a++;
    while (z > a && ox + pts[z - 1][0] > VW + 40) z--;
    if (smooth) { c.moveTo(ox + pts[a][0], oy + pts[a][1]); for (var i = a + 1; i <= z; i++) { var mx = (pts[i - 1][0] + pts[i][0]) / 2, my = (pts[i - 1][1] + pts[i][1]) / 2; c.quadraticCurveTo(ox + pts[i - 1][0], oy + pts[i - 1][1], ox + mx, oy + my); } }
    else for (var j = a; j <= z; j++) { if (j === a) c.moveTo(ox + pts[j][0], oy + pts[j][1]); else c.lineTo(ox + pts[j][0], oy + pts[j][1]); }
    c.stroke();
  }
  function tree(c, x, y, s, dk, md, lt) { // drzewko liściaste: pień, dwa tony korony, światło z lewej
    c.fillStyle = '#6B5240'; c.fillRect(x - 1.6 * s, y - 9 * s, 3.2 * s, 9 * s);
    c.fillStyle = dk; c.beginPath(); ell(c, x, y - 15 * s, 12 * s, 13 * s, 0); ell(c, x + 6 * s, y - 10 * s, 7 * s, 6 * s, 0); c.fill();
    c.fillStyle = md; c.beginPath(); ell(c, x - 2 * s, y - 17 * s, 9.5 * s, 10 * s, 0); c.fill();
    c.fillStyle = lt; c.beginPath(); ell(c, x - 5 * s, y - 21 * s, 4.5 * s, 4 * s, 0); c.fill();
  }
  var B2 = {}; // dodatkowe dane warstw (osobne ziarno: dawne tła się nie zmieniają)
  function genArt() {
    var R = rng(9137);
    function arr(n, f) { var a = []; for (var i = 0; i < n; i++) a.push(f(i)); return a; }
    function ridge(step, y0, y1) { var p = []; for (var x = 0; x < PER; x += step) p.push([x, y0 + R() * (y1 - y0)]); p.push([PER, p[0][1]]); return p; }
    CLOUDS = arr(9, function () { var n = 4 + Math.floor(R() * 3), b = []; for (var i = 0; i < n; i++) { var r = 15 + R() * 16 * (1 - Math.abs(i - (n - 1) / 2) / n); b.push([40 + i * (120 / (n - 1)) + R() * 10, 2 - r * .55 - R() * 6, r]); } return { x: R() * PER, y: R() * 120, s: .55 + R() * .6, b: b, a: .82 + R() * .18 }; });
    B2.far2 = ridge(110, 150, 215); B2.near = ridge(90, 312, 334); B2.bush = arr(26, function () { return { x: R() * PER, s: .6 + R() * .5 }; });
    B2.tufts = arr(40, function () { return { x: R() * PER, h: 6 + R() * 8 }; });
    B2.crys = arr(9, function () { return { x: R() * PER, y: 250 + R() * 80, s: .6 + R() * .7, c: Math.floor(R() * 3) }; });
    B2.shafts = arr(4, function (i) { return { x: i * PER / 4 + R() * 200, w: 30 + R() * 40, p: R() * 6 }; });
    B2.cliffFar2 = ridge(70, 120, 200);
    B2.olivesN = arr(10, function () { return { x: R() * PER, s: .9 + R() * .4 }; });
    BGL = makeLayers();
  }
  var BGL = {};
  function makeLayers() {
    var V = BG.valley, C = BG.cave, S = BG.stone, K = BG.cliff;
    var far2 = function (col, col2) { return { par: .07, py: .35, far: true, yb: 300, haze: '#EAF1F8', ha0: .1, ha1: .55, draw: function (c, ox, oy, w, bottom) { ridgeFill(c, B2.far2, ox, oy, bottom, col, col2, true); } }; };
    return {
      valley: [
        { par: .18, py: .45, far: true, yb: 320, haze: '#E2EBF7', ha0: 0, ha1: .5, hy0: 120, hy1: 330, draw: function (c, ox, oy, w, bottom) {
          ridgeFill(c, V.far, ox, oy, bottom, '#C3D2E4', '#AFC1D6', false);
          c.strokeStyle = 'rgba(150,170,195,.55)'; c.lineWidth = 2; c.beginPath(); V.far.forEach(function (p, i) { if (i % 3 === 0) { c.moveTo(ox + p[0], oy + p[1] + 18); c.lineTo(ox + p[0] + 6, oy + p[1] + 70); } }); c.stroke();
          ridgeRim(c, V.far, ox, oy, 'rgba(255,255,255,.55)', 1.6, false);
        } },
        { par: .42, py: .7, haze: '#E2EBF7', ha0: 0, ha1: .18, draw: function (c, ox, oy, w, bottom) {
          ridgeFill(c, V.mid, ox, oy, bottom, '#A6CD9E', '#94C08F', true); ridgeRim(c, V.mid, ox, oy, 'rgba(225,245,210,.7)', 2, true);
          V.trees.forEach(function (tr) { if (vis(ox + tr.x, 30)) tree(c, ox + tr.x, oy + 266, tr.s, '#5E9468', '#73A877', '#9CCB94'); });
        } },
        { par: .62, py: .85, draw: function (c, ox, oy, w, bottom) { nearBushes(c, ox, oy, '#5C9A62', '#4A8854', '#8CC47A'); } }
      ],
      cave: [
        { par: .16, py: .45, far: true, y0: -460, fillTop: true, fillBot: true, draw: function (c, ox, oy, w, bottom) {
          c.fillStyle = '#14305A'; c.beginPath();
          C.tites.forEach(function (s) { if (!vis(ox + s.x, s.w)) return; c.moveTo(ox + s.x - s.w / 2, oy - 460); c.lineTo(ox + s.x - s.w / 2, oy + 10); c.quadraticCurveTo(ox + s.x - s.w * .12, oy + 10 + s.len * .6, ox + s.x, oy + 10 + s.len); c.quadraticCurveTo(ox + s.x + s.w * .12, oy + 10 + s.len * .6, ox + s.x + s.w / 2, oy + 10); c.lineTo(ox + s.x + s.w / 2, oy - 460); });
          c.fill(); c.fillStyle = '#0E2342'; c.fillRect(ox, oy - 460, PER, 474);
          c.fillStyle = 'rgba(150,200,255,.18)'; c.beginPath(); C.tites.forEach(function (s) { if (!vis(ox + s.x, s.w)) return; c.moveTo(ox + s.x - s.w * .3, oy + 12); c.quadraticCurveTo(ox + s.x - s.w * .12, oy + 10 + s.len * .5, ox + s.x - 1, oy + 6 + s.len); c.lineTo(ox + s.x - s.w * .18, oy + 12); }); c.fill();
          c.fillStyle = '#183863'; c.beginPath();
          C.mites.forEach(function (s) { if (!vis(ox + s.x, s.w)) return; c.moveTo(ox + s.x - s.w / 2, bottom); c.lineTo(ox + s.x - s.w / 2, oy + 330); c.quadraticCurveTo(ox + s.x - s.w * .1, oy + 330 - s.h * .7, ox + s.x, oy + 330 - s.h); c.quadraticCurveTo(ox + s.x + s.w * .1, oy + 330 - s.h * .7, ox + s.x + s.w / 2, oy + 330); c.lineTo(ox + s.x + s.w / 2, bottom); });
          c.fill(); c.fillStyle = '#122B4E'; c.fillRect(ox, oy + 328, PER, bottom - oy - 328);
          c.fillStyle = 'rgba(160,215,255,.22)'; c.beginPath(); C.mites.forEach(function (s) { if (!vis(ox + s.x, s.w)) return; c.moveTo(ox + s.x - s.w * .25, oy + 330); c.quadraticCurveTo(ox + s.x - s.w * .08, oy + 330 - s.h * .7, ox + s.x - 1, oy + 332 - s.h); c.lineTo(ox + s.x - s.w * .1, oy + 330); }); c.fill();
        } },
        { par: .4, py: .7, y0: -60, draw: function (c, ox, oy, w, bottom) {
          C.cols.forEach(function (k) { // kolumny naciekowe: walec z mokrym połyskiem
            var x = ox + k.x; if (!vis(x, k.w)) return;
            c.fillStyle = '#21467A'; c.beginPath(); c.moveTo(x - k.w / 2, oy - 60); c.quadraticCurveTo(x - k.w * .15, oy + 150, x - k.w / 2, bottom); c.lineTo(x + k.w / 2, bottom); c.quadraticCurveTo(x + k.w * .15, oy + 150, x + k.w / 2, oy - 60); c.fill();
            c.fillStyle = 'rgba(190,230,255,.28)'; c.fillRect(x - k.w * .12, oy - 60, k.w * .06, bottom - oy + 60);
            c.fillStyle = 'rgba(10,25,50,.35)'; c.beginPath(); for (var r = 40; r < 420; r += 46) ell(c, x, oy + r, k.w * .32, 3, 0); c.fill();
          });
          B2.crys.forEach(function (k) { // kryształy (blask dorysowuje się na bieżąco)
            var x = ox + k.x, y = oy + k.y, s = k.s, col = ['#7FD4FF', '#B49CFF', '#7FF0D0'][k.c]; if (!vis(x, 30)) return;
            for (var j = -1; j <= 1; j++) { c.fillStyle = col; c.beginPath(); c.moveTo(x + j * 7 * s - 3 * s, y); c.lineTo(x + j * 7 * s, y - (16 + (j === 0 ? 10 : 0)) * s); c.lineTo(x + j * 7 * s + 3 * s, y); c.fill(); c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.moveTo(x + j * 7 * s - 1, y); c.lineTo(x + j * 7 * s, y - (14 + (j === 0 ? 9 : 0)) * s); c.lineTo(x + j * 7 * s, y); c.fill(); }
          });
        }, live: function (c, ox, oy, w, h) {
          var t = gameT; c.save();
          B2.crys.forEach(function (k, i) { var x = ox + k.x, y = oy + k.y - 10 * k.s; if (x < -60 || x > w + 60) return; var a = .22 + (reduceMotion ? 0 : .12 * Math.sin(t * 2 + i));
            c.fillStyle = ['rgba(110,200,255,', 'rgba(170,140,255,', 'rgba(110,240,200,'][k.c] + (a * .5).toFixed(2) + ')'; c.beginPath(); c.arc(x, y, 22 * k.s, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(x, y, 12 * k.s, 0, Math.PI * 2); c.fill(); });
          B2.shafts.forEach(function (s) { var x = ox + s.x; if (x < -200 || x > w + 200) return; var a = .05 + (reduceMotion ? 0 : .025 * Math.sin(t * .6 + s.p));
            c.fillStyle = 'rgba(140,200,255,' + a.toFixed(3) + ')'; c.beginPath(); c.moveTo(x, oy - 40); c.lineTo(x + s.w * .5, oy - 40); c.lineTo(x + s.w * 1.1 + 50, oy + 300); c.lineTo(x + 40, oy + 300); c.fill(); });
          c.restore();
        } }
      ],
      stone: [
        { par: .15, py: .45, far: true, yb: 330, haze: '#F3F6FB', ha0: 0, ha1: .45, hy0: 180, hy1: 320, draw: function (c, ox, oy, w, bottom) {
          ridgeFill(c, S.far, ox, oy, bottom, '#C9D9C6', '#B2C6B0', true); ridgeRim(c, S.far, ox, oy, 'rgba(255,255,255,.5)', 1.5, true);
          S.abbey.forEach(function (ax) { if (vis(ox + ax, 100)) drawAbbeyArt(c, ox + ax, oy + 236); });
        } },
        { par: .4, py: .7, haze: '#F3F6FB', ha0: 0, ha1: .16, draw: function (c, ox, oy, w, bottom) {
          ridgeFill(c, S.mid, ox, oy, bottom, '#9CC496', '#8AB685', true); ridgeRim(c, S.mid, ox, oy, 'rgba(230,248,215,.7)', 2, true);
          S.olives.forEach(function (k) { if (vis(ox + k.x, 40)) tree(c, ox + k.x, oy + 300, k.r / 14, '#5C8C5F', '#6E9E6B', '#A2C995'); });
        }, live: function (c, ox, oy, w) { S.cyp.forEach(function (k, i) { var x = ox + k.x; if (x > -20 && x < w + 20) swayCypress(c, x, oy + 292, k.h, '#4A7A54', gameT, i); }); } },
        { par: .62, py: .85, draw: function (c, ox, oy, w, bottom) { nearBushes(c, ox, oy + 6, '#5E9660', '#4C8552', '#93C784'); } }
      ],
      cliff: [
        { par: .07, py: .35, far: true, yb: 290, haze: '#FFF0C4', ha0: .1, ha1: .5, draw: function (c, ox, oy, w, bottom) { ridgeFill(c, B2.cliffFar2, ox, oy + 20, bottom, '#D7CFC8', '#E9DCC8', false); } },
        { par: .18, py: .45, far: true, yb: 330, haze: '#FFF0C4', ha0: 0, ha1: .35, hy0: 100, hy1: 330, draw: function (c, ox, oy, w, bottom) {
          ridgeFill(c, K.far, ox, oy, bottom, '#D8CBB4', '#CDBFA7', false); ridgeRim(c, K.far, ox, oy, 'rgba(255,240,205,.85)', 2, false);
          c.strokeStyle = 'rgba(160,140,110,.35)'; c.lineWidth = 2; c.beginPath(); K.far.forEach(function (p, i) { if (i % 2 === 0) { c.moveTo(ox + p[0], oy + p[1] + 14); c.lineTo(ox + p[0] - 4, oy + p[1] + 60); } }); c.stroke();
          K.grotto.forEach(function (gx) { if (vis(ox + gx, 160)) drawGrotto(c, ox + gx, oy + 190); });
        } },
        { par: .42, py: .7, haze: '#FFF0C4', ha0: 0, ha1: .12, draw: function (c, ox, oy, w, bottom) {
          ridgeFill(c, K.mid, ox, oy, bottom, '#C1B39A', '#9A8C74', false); ridgeRim(c, K.mid, ox, oy, 'rgba(255,240,205,.8)', 2, false);
          c.strokeStyle = 'rgba(120,105,85,.5)'; c.lineWidth = 2; c.beginPath(); K.mid.forEach(function (p, i) { if (i % 2) { c.moveTo(ox + p[0] - 10, oy + p[1] + 16); c.lineTo(ox + p[0] + 14, oy + p[1] + 16); } }); c.stroke();
          c.fillStyle = '#7E8E5A'; B2.bush.forEach(function (b, i) { if (i % 2 || !vis(ox + b.x, 20)) return; var p = K.mid[Math.floor(b.x / 70) % K.mid.length]; c.beginPath(); ell(c, ox + b.x, oy + p[1] + 8, 9 * b.s, 6 * b.s, 0); c.fill(); });
        } }
      ],
      olive: [
        { par: .08, py: .45, far: true, yb: 330, haze: '#F6EAD3', ha0: .15, ha1: .55, draw: function (c, ox, oy, w, bottom) { ridgeFill(c, BG.olive.far, ox, oy + 30, bottom, '#AEB6D2', '#C9C6D6', true); } },
        { par: .15, py: .45, far: true, haze: '#F6EAD3', ha0: 0, ha1: .3, hy0: 120, hy1: 300, draw: function (c, ox, oy, w) { BG.olive.town.forEach(function (tx) { if (vis(ox + tx, 430)) spTown(c, ox + tx, oy + 250, 1, false, 0); }); } },
        { par: .42, py: .7, draw: function (c, ox, oy, w, bottom) {
          ridgeFill(c, BG.olive.mid, ox, oy, bottom, '#B2C08F', '#9AAE7E', true); ridgeRim(c, BG.olive.mid, ox, oy, 'rgba(250,245,215,.7)', 2, true);
          for (var k = 0; k < 3; k++) {
            var ty = oy + 286 + k * 24;
            c.fillStyle = k % 2 ? '#B3C190' : '#A3B482'; c.fillRect(ox, ty, PER, 30);
            c.fillStyle = 'rgba(232,214,184,.95)'; c.fillRect(ox, ty + 22, PER, 4); c.fillStyle = 'rgba(150,130,100,.35)'; c.fillRect(ox, ty + 26, PER, 2);
            BG.grove.forEach(function (tr) { if (tr.row !== k || !vis(ox + tr.x, 30)) return; spOlive(c, ox + tr.x, ty + 20, tr.s); });
          }
        } }
      ],
      villa: [
        { par: .1, py: .45, far: true, yb: 330, haze: '#F5EEE2', ha0: .1, ha1: .5, draw: function (c, ox, oy, w, bottom) { ridgeFill(c, BG.villa.far, ox, oy, bottom, '#BFCDB6', '#D4D8C6', true); } },
        { par: .15, py: .45, far: true, haze: '#F5EEE2', ha0: 0, ha1: .3, hy0: 120, hy1: 300, draw: function (c, ox, oy) { BG.villa.town.forEach(function (tx) { if (vis(ox + tx, 280)) spTown(c, ox + tx, oy + 238, .62, false, 0); }); } },
        { par: .4, py: .7, draw: function (c, ox, oy, w, bottom) { drawVillaMid(c, ox, oy, PER, bottom); } }
      ],
      gate: [
        { par: .1, py: .45, far: true, yb: 300, haze: '#FBF1E4', ha0: .15, ha1: .55, draw: function (c, ox, oy, w, bottom) { ridgeFill(c, BG.gate.far, ox, oy, bottom, '#C3D0BD', '#D9DDCF', true); } },
        { par: .14, py: .45, far: true, haze: '#FBF1E4', ha0: .05, ha1: .35, hy0: 120, hy1: 300, draw: function (c, ox, oy) { BG.gate.town.forEach(function (tx) { if (vis(ox + tx, 250)) spTown(c, ox + tx, oy + 226, .55, false, 0); }); } },
        { par: .38, py: .7, haze: '#FBF1E4', ha0: .22, ha1: .3, draw: function (c, ox, oy, w, bottom) { drawGateMid(c, ox, oy, PER, bottom); },
          live: function (c, ox, oy, w) { var B = BG.gate; B.cyp.forEach(function (k, i) { var x = ox + k.x; if (x > -20 && x < w + 20 && Math.abs(k.x - B.gateX) > 220) swayCypress(c, x, oy + 168 + 70, k.h + 50, '#46704F', gameT, i); }); } }
      ],
      fresco: [
        { par: .2, py: .45, y0: -40, draw: function (c, ox, oy, w, bottom) { drawFrescoWall(c, ox, oy, PER, bottom); } },
        { par: .45, py: .7, y0: -420, fillTop: true, draw: function (c, ox, oy, w, bottom) { drawFrescoCols(c, ox, oy, PER, bottom); },
          live: function (c, ox, oy, w, h) { // smugi światła z okien z drgającym pyłem
            var t = gameT; c.save();
            BG.fresco.cols.forEach(function (k, i) { if (i % 2) return; var x = ox + k.x + 60; if (x < -260 || x > w + 200) return;
              var a = .16 + (reduceMotion ? 0 : .05 * Math.sin(t * .5 + i));
              c.fillStyle = 'rgba(255,240,205,' + a.toFixed(3) + ')'; c.beginPath(); c.moveTo(x, oy + 80); c.lineTo(x + 40, oy + 80); c.lineTo(x + 170, h); c.lineTo(x + 70, h); c.fill();
              if (!reduceMotion) { c.fillStyle = 'rgba(255,240,200,.55)'; for (var m = 0; m < 7; m++) { var u = ((t * .05 + m * .137 + i * .31) % 1), px = x + 20 + u * 110 + Math.sin(t + m) * 6, py = oy + 80 + u * (h - oy - 80); c.fillRect(px, py, 1.6, 1.6); } }
            });
            c.restore();
          } }
      ],
      alley: [
        { par: .2, py: .45, far: true, haze: '#FBF1E6', ha0: .32, ha1: .5, draw: function (c, ox, oy, w, bottom) { BG.alley.far.forEach(function (hs) { if (vis(ox + hs.x + hs.w / 2, hs.w)) spFacade(c, ox + hs.x, oy + 250, hs, 1, false, 0); }); } },
        { par: .45, py: .7, haze: '#FFF6EC', ha0: .22, ha1: .36, draw: function (c, ox, oy, w, bottom) { BG.alley.mid.forEach(function (hs) { if (vis(ox + hs.x * 1.1 + hs.w * .7, hs.w * 1.4)) spFacade(c, ox + hs.x * 1.1, oy + 300, hs, 1.4, false, 0); });
          c.strokeStyle = 'rgba(80,60,50,.5)'; c.lineWidth = 1; // sznury z praniem między domami
          for (var i = 0; i < 5; i++) { var x0 = ox + i * 330 + 40, y0 = oy + 120 + (i % 2) * 30; if (!vis(x0 + 70, 80)) continue; c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(x0 + 70, y0 + 22, x0 + 140, y0); c.stroke();
            for (var j = 0; j < 4; j++) { var px = x0 + 22 + j * 28, py = y0 + 10 + Math.sin((j + .5) / 4 * Math.PI) * 9 - 6; c.fillStyle = ['#FFFFFF', '#F2C94C', '#7FB2E8', '#E8467C'][(i + j) % 4]; c.fillRect(px, py, 14, 12 + (j % 2) * 5); } }
        } }
      ],
      belvedere: belvLayers(false),
      dusk: belvLayers(true)
    };
  }
  function belvLayers(dusk) {
    var BB = BG.belvedere;
    return [
      { par: .04, py: .45, far: true, dy: 40, yb: 290, haze: dusk ? '#EE9A72' : '#FFDDB0', ha0: .1, ha1: .5, draw: function (c, ox, oy, w, bottom) { ridgeFill(c, BB.hills[0], ox, oy, bottom, dusk ? '#6E5E86' : '#B3B2D6', dusk ? '#7C6688' : '#C9BCD0', true); } },
      { par: .07, py: .45, far: true, dy: 46, yb: 300, haze: dusk ? '#EE9A72' : '#FFDDB0', ha0: 0, ha1: .35, draw: function (c, ox, oy, w, bottom) { ridgeFill(c, BB.hills[1], ox, oy, bottom, dusk ? '#5B5779' : '#9FAACB', dusk ? '#665A78' : '#B3B8CE', true); ridgeRim(c, BB.hills[1], ox, oy, dusk ? 'rgba(255,170,130,.5)' : 'rgba(255,240,220,.6)', 1.4, true); } },
      { par: .1, py: .45, far: true, haze: dusk ? '#EE9A72' : '#FFF0D7', ha0: .35, ha1: 0, hy0: 262, hy1: 360, fillBot: true, draw: function (c, ox, oy, w, bottom) {
        var vy = oy + 262;
        c.fillStyle = dusk ? '#4E5B47' : '#BCC88F'; c.fillRect(ox, vy, PER, bottom - vy);
        var FC = dusk ? ['#56634A', '#4A573F', '#5F6A48', '#4F5E52', '#625F45'] : ['#A9BD72', '#C9C27A', '#8FAE66', '#D6B871', '#B4C98A'];
        BB.fields.forEach(function (f) { var x = ox + f.x, y = vy + 4 + f.y * 70, fw = f.w * (.6 + f.y * .6); if (!vis(x + fw / 2, fw)) return; c.fillStyle = FC[f.c]; c.beginPath(); c.moveTo(x, y); c.lineTo(x + fw, y); c.lineTo(x + fw + 6, y + 8 + f.y * 8); c.lineTo(x - 6, y + 8 + f.y * 8); c.fill();
          c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(x, y, fw, 1.2); });
        c.fillStyle = dusk ? 'rgba(90,80,90,.9)' : 'rgba(250,246,238,.95)';
        BB.vill.forEach(function (v) { var x = ox + v.x, y = vy + 6 + v.y * 60; if (!vis(x, 30)) return; for (var k = 0; k < 4; k++) { c.fillRect(x + k * 5, y - (k % 2) * 3, 4, 4); } c.fillStyle = dusk ? 'rgba(60,40,40,.9)' : '#C4674A'; for (k = 0; k < 4; k++) c.fillRect(x + k * 5, y - (k % 2) * 3 - 1.5, 4, 1.5); c.fillStyle = dusk ? 'rgba(90,80,90,.9)' : 'rgba(250,246,238,.95)'; });
        c.strokeStyle = dusk ? 'rgba(180,160,140,.4)' : 'rgba(245,235,215,.8)'; c.lineWidth = 2; c.beginPath(); c.moveTo(ox, vy + 30); c.bezierCurveTo(ox + 500, vy + 10, ox + 900, vy + 60, ox + PER, vy + 30); c.stroke();
        c.fillStyle = dusk ? '#2C4234' : '#6F955A'; BB.cyp.forEach(function (k, i) { if (i % 2 || !vis(ox + (k.x * 1.7) % PER, 20)) return; spCypress(c, ox + (k.x * 1.7) % PER, vy + 26 + (i % 3) * 14, k.h * .35, dusk ? '#2E4436' : '#5E8752'); });
      }, live: dusk ? function (c, ox, oy, w) { var vy = oy + 262, t = gameT; c.fillStyle = 'rgba(255,214,120,.9)';
        BG.dusk.lights.forEach(function (l, i) { var x = ox + l.x; if (x < 0 || x > w) return; if (reduceMotion || Math.sin(t * 1.7 + l.p) > -.6) c.fillRect(x, vy + 6 + l.y * 70, 2.5, 2.5); });
        BB.vill.forEach(function (v) { var x = ox + v.x, y = vy + 6 + v.y * 60; if (x < -20 || x > w + 20) return; c.fillStyle = 'rgba(255,214,120,.9)'; c.fillRect(x + 2, y + 1, 2, 2); c.fillRect(x + 11, y, 2, 2); }); } : null },
      { par: .42, py: .7, draw: function (c, ox, oy, w, bottom) { BB.olives.forEach(function (o) { if (vis(ox + o.x, 40)) spOlive(c, ox + o.x, oy + 330 + o.y, o.s); }); },
        live: function (c, ox, oy, w) { BB.cyp.forEach(function (k, i) { var x = ox + k.x; if (x > -20 && x < w + 20) swayCypress(c, x, oy + 330, k.h, dusk ? '#22382C' : '#3F6B4A', gameT, i); }); } }
    ];
  }
  function nearBushes(c, ox, oy, col, dk, lt) { // pas krzaków na pierwszym planie (bez wypełniania do dołu ekranu)
    c.fillStyle = dk; c.beginPath(); B2.bush.forEach(function (b) { if (vis(ox + b.x, 40)) ell(c, ox + b.x, oy + 330, 26 * b.s, 16 * b.s, 0); }); c.fill();
    c.fillStyle = col; c.beginPath(); B2.bush.forEach(function (b) { if (!vis(ox + b.x, 40)) return; ell(c, ox + b.x - 3, oy + 326, 22 * b.s, 13 * b.s, 0); ell(c, ox + b.x + 14 * b.s, oy + 330, 13 * b.s, 9 * b.s, 0); }); c.fill();
    c.fillStyle = lt; c.beginPath(); B2.bush.forEach(function (b) { if (vis(ox + b.x, 40)) ell(c, ox + b.x - 9 * b.s, oy + 320 - 2 * b.s, 7 * b.s, 4 * b.s, 0); }); c.fill();
  }
  function drawAbbeyArt(c, x, y) { // opactwo w oddali: jasna fasada od słońca, cień z boku, dachy
    drawAbbey(c, x, y, '#B9C6B7');
    c.fillStyle = 'rgba(80,95,90,.18)'; c.fillRect(x + 20, y - 40, 50, 64); c.fillRect(x + 62, y - 96, 10, 60);
    c.fillStyle = '#A9806A'; c.beginPath(); c.moveTo(x - 78, y - 40); c.lineTo(x, y - 64); c.lineTo(x + 78, y - 40); c.lineTo(x + 72, y - 38); c.lineTo(x, y - 59); c.lineTo(x - 72, y - 38); c.fill();
  }
  function drawVillaMid(c, ox, oy, w, bottom) { // ruiny willi: wzgórek, mury, kolumny, mozaiki
    var B = BG.villa;
    ridgeFill(c, B.mid, ox, oy, bottom, '#CDB392', '#B89A78', true); ridgeRim(c, B.mid, ox, oy, 'rgba(255,245,225,.7)', 2, true);
    c.fillStyle = 'rgba(149,114,82,.45)'; c.fillRect(ox, oy + 318, PER, 3); c.fillRect(ox, oy + 340, PER, 2);
    B.mos.forEach(function (m) { if (vis(ox + m.x + m.w / 2, m.w)) spMosaic(c, ox + m.x, oy + 312, m.w, m.seed, false); });
    B.walls.forEach(function (wl) { var x = ox + wl.x; if (!vis(x + wl.w / 2, wl.w)) return; c.fillStyle = '#EFE2D2'; c.fillRect(x, oy + 300 - wl.h, wl.w, wl.h + 10); c.fillStyle = 'rgba(160,120,100,.25)'; c.fillRect(x + wl.w * .7, oy + 300 - wl.h, wl.w * .3, wl.h + 10); c.fillStyle = '#C9B39C'; c.fillRect(x, oy + 300 - wl.h, wl.w, 4); c.fillStyle = 'rgba(160,120,100,.3)'; for (var j = 8; j < wl.h; j += 9) c.fillRect(x, oy + 300 - wl.h + j, wl.w, 1.5);
      c.fillStyle = '#7E9F6A'; c.beginPath(); ell(c, x + 6, oy + 300 - wl.h, 7, 4, 0); ell(c, x + wl.w - 10, oy + 300 - wl.h + 1, 6, 3, 0); c.fill(); });
    B.cols.forEach(function (cl) { var x = ox + cl.x; if (!vis(x, 20)) return; c.fillStyle = '#EADFCF'; c.fillRect(x - 7, oy + 300 - cl.h, 14, cl.h); c.fillStyle = '#FFF8EE'; c.fillRect(x - 7, oy + 300 - cl.h, 4, cl.h); c.fillStyle = '#C9B8A2'; c.fillRect(x + 4, oy + 300 - cl.h, 3, cl.h); c.fillStyle = 'rgba(160,130,110,.35)'; c.fillRect(x - 3, oy + 300 - cl.h, 1.5, cl.h); c.fillRect(x + 2, oy + 300 - cl.h, 1.5, cl.h);
      if (!cl.broken) { c.fillStyle = '#E6DACB'; c.fillRect(x - 11, oy + 300 - cl.h - 6, 22, 7); } else { c.fillStyle = '#C7AC8A'; c.beginPath(); c.moveTo(x - 8, oy + 300 - cl.h); c.lineTo(x + 8, oy + 300 - cl.h + 9); c.lineTo(x + 8, oy + 300 - cl.h - 2); c.fill(); } });
  }
  function drawGateMid(c, ox, oy, w, bottom) { // rzymski mur z różowo-białego kamienia i brama z wieżami
    var B = BG.gate, top = oy + 168;
    c.fillStyle = '#E9CFC3'; c.fillRect(ox, top, PER, bottom - top);
    for (var r = 0, yy = top; yy < Math.min(bottom, top + 260); r++, yy += 22) {
      var off = r % 2 ? 23 : 0;
      for (var xx = Math.max(off - 46, Math.floor((-ox - 46) / 46) * 46 + off); xx < PER + 46 && ox + xx < VW + 46; xx += 46) { var hsh = hashXY(Math.floor(xx / 46) + 50, r); c.fillStyle = hsh % 3 === 0 ? '#F6ECE4' : hsh % 3 === 1 ? '#E3C2B4' : '#EDD8CD'; c.fillRect(ox + xx + 1, yy + 1, 44, 20); }
    }
    c.fillStyle = 'rgba(120,80,70,.25)'; c.fillRect(ox, top, PER, 4);
    for (var v = 0; v < 9; v++) { var vx = ox + (v * 191) % PER, n = 3 + v % 3; if (!vis(vx, 40)) continue; // bluszcz zwisający z korony muru
      for (var st = 0; st < n; st++) { var lx = vx + st * 6 - n * 3, ln = 14 + ((v * 7 + st * 13) % 22); c.strokeStyle = '#5E7F52'; c.lineWidth = 1; c.beginPath(); c.moveTo(lx, top); c.quadraticCurveTo(lx + 2, top + ln * .5, lx, top + ln); c.stroke();
        for (var lf = 2; lf < ln; lf += 4) { c.fillStyle = lf % 8 ? '#7E9F6A' : '#93B57C'; c.beginPath(); ell(c, lx + (lf % 8 ? 1.8 : -1.8), top + lf, 2.2, 1.6, 0); c.fill(); } }
      c.fillStyle = '#6E9160'; c.beginPath(); ell(c, vx, top + 1, n * 4 + 4, 4, 0); c.fill(); }
    var gx = ox + B.gateX; if (!vis(gx, 260)) return;
    [-150, 150].forEach(function (d) {
      var tx = gx + d;
      c.fillStyle = '#E8CFC3'; c.fillRect(tx - 34, top - 120, 68, bottom - top + 120); c.fillStyle = '#F5E2D8'; c.fillRect(tx - 34, top - 120, 14, bottom - top + 120); c.fillStyle = '#CDAE9F'; c.fillRect(tx + 20, top - 120, 14, bottom - top + 120);
      c.fillStyle = 'rgba(120,80,70,.16)'; for (var f = -34; f < 34; f += 11) c.fillRect(tx + f, top - 120, 2, bottom - top + 120);
      c.fillStyle = '#D9BDB0'; c.fillRect(tx - 38, top - 126, 76, 8); c.fillStyle = '#B5543A'; c.beginPath(); c.moveTo(tx - 40, top - 126); c.lineTo(tx, top - 146); c.lineTo(tx + 40, top - 126); c.fill();
      c.fillStyle = '#5B4840'; c.fillRect(tx - 5, top - 92, 10, 16); c.fillRect(tx - 5, top - 40, 10, 16);
    });
    c.fillStyle = '#F4E8DE'; c.fillRect(gx - 116, top - 30, 232, 30); c.fillStyle = 'rgba(120,80,70,.2)'; c.fillRect(gx - 116, top - 4, 232, 4);
    c.fillStyle = '#4E3D36'; [-70, 0, 70].forEach(function (d) { var aw = d ? 22 : 30; c.beginPath(); c.moveTo(gx + d - aw, bottom); c.lineTo(gx + d - aw, top + 46); c.arc(gx + d, top + 46, aw, Math.PI, 0); c.lineTo(gx + d + aw, bottom); c.fill(); });
    c.fillStyle = 'rgba(255,220,170,.18)'; [-70, 0, 70].forEach(function (d) { var aw = d ? 22 : 30; c.beginPath(); c.moveTo(gx + d - aw * .5, bottom); c.lineTo(gx + d - aw * .5, top + 60); c.arc(gx + d, top + 60, aw * .5, Math.PI, 0); c.lineTo(gx + d + aw * .5, bottom); c.fill(); });
    c.fillStyle = '#E3CABE'; [-35, 35].forEach(function (d) { c.fillRect(gx + d - 4, top + 6, 8, bottom - top); });
  }
  function drawFrescoWall(c, ox, oy, w, bottom) { // ściana nawy: tynk z cieniem, freski w złoconych ramach
    var B = BG.fresco;
    c.fillStyle = '#E6D4B8'; c.fillRect(ox, oy - 40, PER, bottom - oy + 40); c.fillStyle = '#EDDFC8'; c.fillRect(ox, oy + 30, PER, 50);
    c.fillStyle = 'rgba(90,60,40,.25)'; c.fillRect(ox, oy - 40, PER, 80);
    B.panels.forEach(function (p) {
      var x = ox + p.x, y = oy + 92, pw = p.w, ph = 150; if (!vis(x + pw / 2, pw / 2 + 20)) return;
      c.fillStyle = 'rgba(60,40,20,.25)'; c.fillRect(x - 4, y - 2, pw + 14, ph + 14);
      c.fillStyle = '#B8923F'; c.fillRect(x - 6, y - 6, pw + 12, ph + 12); c.fillStyle = '#E2C26A'; c.fillRect(x - 6, y - 6, pw + 12, 3); c.fillRect(x - 6, y - 6, 3, ph + 12); c.fillStyle = '#8E6C2A'; c.fillRect(x - 6, y + ph + 3, pw + 12, 3); c.fillRect(x + pw + 3, y - 6, 3, ph + 12);
      c.fillStyle = '#8FB0D2'; c.fillRect(x, y, pw, ph * .3); c.fillStyle = '#B5C9D8'; c.fillRect(x, y + ph * .3, pw, ph * .26); c.fillStyle = '#B09A6E'; c.fillRect(x, y + ph * .56, pw, ph * .44);
      c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); ell(c, x + pw * .25, y + 30, 26, 8, 0); c.fill();
      c.fillStyle = '#7E9F6A'; c.beginPath(); ell(c, x + pw * .4, y + ph * .56, 60, 10, 0); c.fill();
      c.fillStyle = '#EDE3D0'; c.fillRect(x + pw * .62, y + 40, 50, 46); c.fillStyle = '#B5543A'; c.beginPath(); c.moveTo(x + pw * .62 - 4, y + 40); c.lineTo(x + pw * .62 + 25, y + 26); c.lineTo(x + pw * .62 + 54, y + 40); c.fill();
      var RB = ['#B03A2E', '#2F5D8C', '#D9A441', '#6B8E4E'];
      for (var f = 0; f < p.figs; f++) {
        var fx = x + 40 + f * (pw - 70) / Math.max(1, p.figs - 1) * .9, fy = y + ph - 8;
        c.fillStyle = RB[(f + p.c) % 4]; c.beginPath(); c.moveTo(fx - 16, fy); c.lineTo(fx - 7, fy - 52); c.lineTo(fx + 7, fy - 52); c.lineTo(fx + 16, fy); c.fill();
        c.fillStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.moveTo(fx - 12, fy); c.lineTo(fx - 6, fy - 50); c.lineTo(fx - 2, fy - 50); c.lineTo(fx - 4, fy); c.fill();
        c.fillStyle = '#F2D27A'; c.beginPath(); ell(c, fx, fy - 62, 11, 11, 0); c.fill();
        c.fillStyle = '#F1C9A5'; c.beginPath(); ell(c, fx, fy - 61, 7, 8, 0); c.fill();
        c.fillStyle = '#5A3A26'; c.fillRect(fx - 7, fy - 69, 14, 4);
      }
      c.fillStyle = 'rgba(120,90,60,.12)'; for (var cr = 0; cr < 6; cr++) c.fillRect(x + (p.x * 7 + cr * 53) % pw, y + (cr * 37) % ph, 18, 1); // spękania tynku
    });
  }
  function drawFrescoCols(c, ox, oy, w, bottom) { // arkady i kolumny nawy
    BG.fresco.cols.forEach(function (k) {
      var x = ox + k.x; if (!vis(x + PER / 10, PER / 10 + 40)) return;
      c.fillStyle = 'rgba(70,45,30,.88)'; c.beginPath(); c.moveTo(x - 20, oy - 420); c.lineTo(x - 20, oy + 70); c.arc(x + PER / 10, oy + 70, PER / 10 - 20, Math.PI, 0, false); c.lineTo(x + PER / 5 - 20, oy - 420); c.fill();
      c.fillStyle = 'rgba(150,110,80,.5)'; c.beginPath(); c.arc(x + PER / 10, oy + 70, PER / 10 - 20, Math.PI, 0, false); c.arc(x + PER / 10, oy + 70, PER / 10 - 30, 0, Math.PI, true); c.fill();
      c.fillStyle = '#EADCC6'; c.fillRect(x - 16, oy + 40, 32, bottom - oy); c.fillStyle = '#FFF7EA'; c.fillRect(x - 16, oy + 40, 9, bottom - oy); c.fillStyle = '#C9B597'; c.fillRect(x + 9, oy + 40, 7, bottom - oy); c.fillStyle = 'rgba(150,120,95,.35)'; c.fillRect(x - 8, oy + 40, 3, bottom - oy); c.fillRect(x + 6, oy + 40, 3, bottom - oy);
      c.fillStyle = '#D8C6AC'; c.fillRect(x - 22, oy + 32, 44, 12); c.fillRect(x - 22, oy + 312, 44, 12); c.fillStyle = 'rgba(255,255,255,.45)'; c.fillRect(x - 22, oy + 32, 44, 2); c.fillRect(x - 22, oy + 312, 44, 2);
    });
  }
  function drawBackground(c, kind, camX, camY, w, h, t) {
    var Ls = BGL[kind]; if (!Ls) return;
    c.__ga = c.globalAlpha;
    var i = 0, out = !(kind === 'cave' || kind === 'fresco'), sc = SKYCUT[kind]; skyHc = sc ? -camY * sc[0] + sc[1] + 2 : 1e9;
    if (kind === 'cave') skyGrad(c, w, h, [[0, '#030B18'], [1, '#0D2647']]);
    else if (kind === 'fresco') skyGrad(c, w, h, [[0, '#4A3226'], [1, '#C9A783']]);
    else if (kind === 'belvedere' || kind === 'dusk') belvSky(c, kind === 'dusk', camX, camY, w, h, t);
    else { var T = TER[kind]; outdoorSky(c, w, h, T.skyTop || SKY_SP[kind][0], T.skyBot || SKY_SP[kind][1], camY); if (kind !== 'alley') drawSun(c, w, h, camY, t); }
    if (out && kind !== 'dusk') drawClouds(c, camX, camY, w, t, kind === 'alley' ? 3 : 5, kind === 'belvedere' ? 10 : 0, kind === 'belvedere' ? 1.2 : 1);
    if (out && kind !== 'dusk' && kind !== 'alley') drawBirds(c, w, camY, t, kind === 'belvedere' ? 6 : 4);
    for (; i < Ls.length; i++) blitLayer(c, kind, i, camX, camY, w, h);
    if (kind === 'belvedere' || kind === 'dusk') { // mgiełka nad doliną
      var vy = -camY * .45 + 262, hz = c.createLinearGradient(0, vy - 26, 0, vy + 26); hz.addColorStop(0, kind === 'dusk' ? 'rgba(238,154,114,0)' : 'rgba(255,221,176,0)'); hz.addColorStop(.5, kind === 'dusk' ? 'rgba(238,154,114,.35)' : 'rgba(255,240,215,.5)'); hz.addColorStop(1, 'rgba(255,240,215,0)');
      c.fillStyle = hz; c.fillRect(0, vy - 26, w, 52);
    }
    if (kind === 'alley' && !reduceMotion) drawPetals(c, w, h, t, 10, .7);
    c.globalAlpha = c.__ga;
  }
  var SKY_SP = { olive: ['#86B8E8', '#F6EAD3'], villa: ['#98C1EC', '#F5EEE2'], gate: ['#8FBDEB', '#FBF1E4'], alley: ['#9CC8F0', '#FBF1E6'] };
  function belvSky(c, dusk, camX, camY, w, h, t) {
    var yf = -camY * .45;
    if (dusk) skyGrad(c, w, h, [[0, '#26305C'], [1, '#EE9A72']]);
    else skyGrad(c, w, h, [[0, '#78A6DD'], [1, '#FFDDB0']]);
    if (dusk) { c.fillStyle = '#FFF4CF'; eachRepeat(camX, .02, w, function (ox) { BG.dusk.stars.forEach(function (st) { var a = reduceMotion ? .7 : .45 + .4 * Math.sin(t * 2 + st.p); c.globalAlpha = a * (c.__ga || 1); c.fillRect(ox + st.x, yf * .2 + st.y - 40, 2, 2); }); }); c.globalAlpha = c.__ga || 1; }
    var sx = w * .72, sy = yf * .3 + (dusk ? 236 : 150), R = dusk ? 100 : 130;
    c.fillStyle = dusk ? 'rgba(255,170,110,.2)' : 'rgba(255,240,200,.24)'; c.beginPath(); c.arc(sx, sy, R * .7, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(sx, sy, R * .42, 0, Math.PI * 2); c.fill();

    c.fillStyle = dusk ? '#FFB27A' : '#FFF4CF'; c.beginPath(); ell(c, sx, sy, dusk ? 20 : 24, dusk ? 20 : 24, 0); c.fill();
    if (!reduceMotion && !dusk) { c.save(); c.translate(sx, sy); // kilka smug słońca (płaski kolor — tanio)
      for (var i = 0; i < 3; i++) { var a = i / 3 * Math.PI * 2 + .4 + t * .03; c.fillStyle = 'rgba(255,240,205,' + (.08 + .03 * Math.sin(t * .4 + i)).toFixed(3) + ')'; c.beginPath(); c.moveTo(Math.cos(a) * 30, Math.sin(a) * 30); c.lineTo(Math.cos(a - .05) * 300, Math.sin(a - .05) * 300); c.lineTo(Math.cos(a + .05) * 300, Math.sin(a + .05) * 300); c.fill(); }
      c.restore(); }
  }
  function drawPetals(c, w, h, t, n, a) { // płatki w powietrzu (uliczki Spello) — pozycje z czasu, bez obiektów
    var PC = ['#F7B8C8', '#FFFFFF', '#F4A0B5', '#FFE08A'];
    for (var i = 0; i < n; i++) {
      var sp = 22 + (i % 4) * 6, y = ((i * 71 + t * sp) % (h + 60)) - 30, x = ((i * 137 + t * 14 + Math.sin(t * .9 + i) * 40) % (w + 60)) - 30, r = t * (1.5 + i % 3) + i;
      c.save(); c.translate(x, y); c.rotate(r); c.scale(1, .45 + .4 * Math.abs(Math.sin(r * 1.3)));
      c.globalAlpha = a * (c.__ga || 1); c.fillStyle = PC[i % 4]; c.beginPath(); ell(c, 0, 0, 3.6, 2.4, 0); c.fill(); c.restore();
    }
    c.globalAlpha = c.__ga || 1;
  }

  /* ---------- 5. Budowa poziomu z danych wycieczki ----------
     Typy kafli: 0 pusto, 1 skała, 2 kładka (wchodzi się od dołu), 3 woda,
     4 krucha półka (spada chwilę po wejściu), 5 mokra skała (ślisko),
     6 fałszywa ściana (wygląda jak skała, da się przejść — sekret), 7 kolce (na ziemi albo zwisające),
     8 skrzynia zamknięta (otwiera się uderzeniem od dołu albo skokiem z góry), 9 skrzynia otwarta. */
  /* 10 drabina, 11 lina/łańcuch, 12/13 ruchoma posadzka (w lewo/w prawo), 14/15 znikające mostki, 16 pęknięta ściana, 17 krata,
     20/21/22 drzwi czerwone/niebieskie/zielone — tylko w komnatach (sekcja 5b). */
  var SOLID =  [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0],
      ONEWAY = [0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0];
  var PU_KINDS = ['magnet', 'doublejump', 'glide', 'balloon'];
  /* Skarb Quo (decyzja JP 2026-10-26): ukryta komnata tylko na Trudnym, dostępna wyłącznie balonikiem.
     Budowana dopiero od startu płatności (1.06.2027) albo z ?skarb=1 w adresie (test JP). Wcześniej: ani komnaty, ani podpowiedzi. */
  var TREASURE_FROM = '2027-06-01', SKY_H = 22; // strefa nieba nad poziomem (tylko przy Skarbie Quo)
  function treasureOn() {
    var d = new Date(), today = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    return today >= TREASURE_FROM || /[?&]skarb=1(&|$)/.test(location.search);
  }

  /* Najkrótsza sekcja, w której zmieszczą się wszystkie atrakcje przystanku (Spello; na Łatwym D.sec × len bywa za mało). */
  function spNeed(s, D) {
    var G = s.game, ng = Math.min(G.maxGates != null ? G.maxGates : 2, Math.floor(s.quests.length / D.qPerGate)), mk = G.mini && (D.adv || G.miniAll) ? G.mini : null;
    return 26 + ng * 11 + (G.hidden != null ? G.hidden : 3) * 14 + (G.chests || 0) * 10 + (G.sky ? 18 : 0) + (G.mosaic ? 12 : 0) + (G.complex ? 18 : 0)
      + (G.carpet ? 12 : 0) + (G.climb ? 18 : 0) + (G.cart ? 11 : 0) + (mk ? SP_MINI_W[mk] : 0);
  }
  function buildLevel(trip, prog, playNo, D) {
    // długość sekcji: Frasassi — D.sec dla każdego przystanku; etapy z „game.len” — ułamek D.sec (krótkie łączniki)
    var n = trip.stops.length, SL = D.sec, SLs = trip.stops.map(function (s) { return s.game ? Math.max(Math.round(D.sec * (s.game.len || 1)), spNeed(s, D)) : SL; });
    var W = SLs.reduce(function (a, b) { return a + b; }, 0) + 18;
    var L = { W: W, SL: SL, grid: new Uint8Array(W * ROWS), sec: new Uint8Array(W), crumbleAt: new Int16Array(W * ROWS).fill(-1),
      sections: [], coins: [], enemies: [], drippers: [], gates: [], springs: [], chests: [], landmarks: [], movers: [], crumbles: [],
      winds: [], rocks: [], hidden: [], minis: [], zips: [], carts: [], items: [], chestList: [], chestAt: new Int16Array(W * ROWS).fill(-1),
      plaques: [], raftRocks: [], treasure: null, cx: [], cxDoors: [], stands: [], cxSet: trip.stops.some(function (s) { return s.game; }) ? CXS : CX };
    // Skarb Quo: pierwszy przystanek w wąwozie (inaczej pierwszy poza jaskinią)
    var tSec = -1;
    if (D.key === 'hard' && treasureOn() && trip.treasureStop) trip.stops.forEach(function (s, i) { if (s.qcKey === trip.treasureStop) tSec = i; });
    else if (D.key === 'hard' && treasureOn()) {
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

    var xAcc = 0;
    trip.stops.forEach(function (stop, si) {
      var SL = SLs[si], x0 = xAcc; xAcc += SL;
      var GM = stop.game || null; // atrakcje etapu z danych (Spello); Frasassi: null
      var terr = GM ? GM.terrain : TERRAIN_BY_CATEGORY[stop.category] || 'valley', R = rng(hash(trip.trip + ':' + stop.key + ':' + D.key));
      var pr = prog.stops[si] || {};
      var S = { i: si, x0: x0, x1: x0 + SL, terrain: terr, power: pr.photo ? stop.powerup : null, shortcut: !!pr.all, gates: [],
        time: 0, par: 0, hidden: 0, done: false, stars: 0, hidN: GM && GM.hidden != null ? GM.hidden : 3 };
      L.sections.push(S);
      for (var c = x0; c < x0 + SL; c++) L.sec[c] = si;
      var cave = terr === 'cave', spd = D.spd, ceilRow = cave ? 2 : 0;
      if (cave) for (c = x0; c < x0 + SL; c++) { set(c, 0, 1); set(c, 1, 1); }
      // pytania: rotacja po liście, na Trudnym 2 pytania na bramę
      var nq = stop.quests.length, ng = Math.min(GM && GM.maxGates != null ? GM.maxGates : 2, Math.floor(nq / D.qPerGate)), rot = nq ? (playNo * ng * D.qPerGate) % nq : 0;
      var gf = cave ? [.18, .8] : GM && GM.gateAt ? GM.gateAt : [.3, .6];
      var gateCols = ng === 2 ? [x0 + Math.round(SL * gf[0]), x0 + Math.round(SL * gf[1])] : ng === 1 ? [x0 + Math.round(SL * (GM && GM.gateAt ? GM.gateAt[0] : .5))] : [];
      var gateDefs = gateCols.map(function (c) { return { col: c, kind: 'quiz' }; });
      if (cave) { gateDefs.push({ col: x0 + Math.round(SL * (D.adv ? .45 : .5)), kind: 'organ' }); gateDefs.push({ col: x0 + Math.round(SL * (D.adv ? .68 : .64)), kind: 'rope' }); }
      if (terr === 'valley' || terr === 'cliff') gateDefs.push({ col: x0 + Math.round(SL * .45), kind: 'push' });
      if (GM && GM.cart) gateDefs.push({ col: x0 + Math.round(SL * (GM.cartAt || .5)), kind: 'cart' }); // wózek pod górę (szybkie ◀ ▶)
      gateDefs.sort(function (a, b) { return a.col - b.col; });
      var landX = x0 + SL - 9;
      var MINI_W = { valley: 38, cave: 32, stone: 32, cliff: 14 };
      var miniK = GM && GM.mini && (D.adv || GM.miniAll) ? GM.mini : null;
      var miniX = GM ? (miniK ? landX - SP_MINI_W[miniK] : landX - 3) : D.adv ? landX - MINI_W[terr] : landX - 3;
      var cxHere = (GM ? !!GM.complex : terr === 'stone') && !L.cx.length && !L.cxPlanned, nIn = cxHere ? L.cxSet[D.key].stickers : 0; // komnaty: pierwszy przystanek przy opactwie (Spello: przy willi)
      if (cxHere) L.cxPlanned = true;
      var hidOut = Math.max(0, S.hidN - nIn), HP = { 0: [], 1: [.06], 2: [.12, .56], 3: [.14, .44, .76] };
      var hpos = (GM ? HP[Math.min(3, hidOut)] : [.14, .44, .76].slice(0, 3 - nIn)).map(function (f) { return x0 + Math.round(f * (miniX - x0)); });
      var htypes = ['secret', 'tower', 'skygap']; for (var hi = 2; hi > 0; hi--) { var hj = Math.floor(R() * (hi + 1)); var tt = htypes[hi]; htypes[hi] = htypes[hj]; htypes[hj] = tt; }
      var g = GROUND, x = x0, gi = 0, hk = 0, fk = 0;
      var span = miniX - x0, forced = [];
      hpos.forEach(function (p, i) { forced.push({ at: p, name: htypes[i], hid: true }); });
      if (GM) { // Spello: atrakcje z „game” (łączniki: tylko naklejka do znalezienia)
        if (GM.chests) forced.push({ at: x0 + Math.round(.06 * span), name: 'chestPU' });
        if (si === tSec) forced.push({ at: x0 + Math.round(.18 * span), name: 'treasureIsland', pri: 1 });
        else if (GM.sky) forced.push({ at: x0 + Math.round(.18 * span), name: 'skyIsland', pri: 1 });
        if (GM.mosaic) forced.push({ at: x0 + Math.round(.2 * span), name: 'mosaic', pri: 1 });
        if (cxHere) forced.push({ at: x0 + Math.round(.4 * span), name: 'complex', pri: 1 });
        if (GM.carpet) forced.push({ at: x0 + Math.round(.08 * span), name: 'carpet', pri: 1 });
        if (GM.climb) forced.push({ at: x0 + Math.round(.3 * span), name: 'climbAlley', pri: 1 });
        if (GM.chests > 1) forced.push({ at: x0 + Math.round(.62 * span), name: 'chestPU' });
      } else {
      forced.push({ at: x0 + Math.round(.06 * span), name: 'chestPU' });
      forced.push(si === tSec ? { at: x0 + Math.round(.18 * span), name: 'treasureIsland', pri: 1 } : { at: x0 + Math.round(.18 * span), name: 'skyIsland' });
      if (terr === 'valley' || terr === 'cliff') forced.push({ at: x0 + Math.round(.5 * span), name: 'zipline' });
      if (terr === 'stone') forced.push({ at: x0 + Math.round(.2 * span), name: 'mosaic' });
      if (cxHere) forced.push({ at: x0 + Math.round(.4 * span), name: 'complex', pri: 1 });
      if (cave && D.adv) { forced.push({ at: x0 + Math.round(SL * .19), name: 'raft', pri: 1 }); forced.push({ at: x0 + Math.round(SL * .46), name: 'mine', pri: 1 }); }
      if (!cave) forced.push({ at: x0 + Math.round(.62 * span), name: 'chestPU' });
      forced.forEach(function (f) { if (f.name === 'zipline' || f.name === 'mosaic') f.pri = 1; });
      }
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
      var pit = function (tx) { if (terr === 'stone' || (cave && R() < .5) || (GM && GM.water)) water(tx); };
      function chest(cx, cy, content, locked) { set(cx, cy, 8); L.chestAt[cy * W + cx] = L.chestList.length; L.chestList.push({ x: cx, y: cy, content: content, open: false, locked: !!locked, sec: si }); return L.chestList.length - 1; }
      function puFor() { return cave ? pick(R, ['lantern', 'balloon', 'doublejump']) : pick(R, PU_KINDS); }
      var hatHere = GM ? GM.skyHat || null : terr === 'valley' ? 'explorer' : (cave && !D.adv) ? 'helmet' : null;

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
        treasureIsland: [30, function () { // Trudny + flaga: zwykła wyspa w chmurach, a wysoko NAD poziomem — niewidoczna komnata ze Skarbem Quo
          /* JP 2026-10-26: komnata leży w „strefie nieba” nad górną krawędzią poziomu (rzędy ujemne), poza zwykłym kadrem kamery.
             Tylko tu balonik nie zatrzymuje się na suficie poziomu: leci dalej w chmury, a kamera jedzie za nim w górę.
             Bez balonika najwyżej sięga się ok. 4,5 kafla ponad poziom (podwójny skok z wyspy), komnata ma podłogę 16 kafli nad nim. */
          g = GROUND; flat(4); x += 4;
          var w = 26, IR = 2, i, y, sx0 = x + 3, sx1 = x + 25, c0 = x + 16, c1 = x + 22, rf = -16, rc = -20;
          flat(w); chest(x + 2, g - 3, 'pu:balloon');
          for (i = 5; i <= 14; i++) { set(x + i, IR, 2); if (i % 2) coin(x + i, IR - 1); }
          if (hatHere) L.items.push({ type: 'hat', kind: hatHere, x: (x + 12) * TILE + 16, y: IR * TILE - 22, alive: true });
          L.skyH = SKY_H; L.skyX0 = sx0; L.skyX1 = sx1; L.sky = new Uint8Array(W * SKY_H);
          function sky(cx, cy, v) { if (cy < 0 && cy >= -SKY_H) L.sky[(cy + SKY_H) * W + cx] = v; }
          for (i = c0 - 3; i <= c1; i++) sky(i, rf, 1);        // ganek i podłoga komnaty
          for (i = c0; i <= c1; i++) sky(i, rc, 1);            // strop
          for (y = rc; y <= rf; y++) sky(c1, y, 1);           // tylna ściana; wejście od lewej
          for (i = x + 8; i <= x + 10; i++) sky(i, -8, 2);    // chmurki do odpoczynku (też tylko dla balonika)
          for (i = x + 12; i <= x + 13; i++) sky(i, -12, 2);
          [[x + 7, -4], [x + 9, -9], [x + 12, -13], [c0 - 2, rf - 1], [c0 - 1, rf - 1]].forEach(function (p) { coin(p[0], p[1]); });
          L.treasure = { x: (c1 - 2) * TILE + 16, y: rf * TILE, x0: c0 * TILE, x1: c1 * TILE, y0: (rc + 1) * TILE, y1: rf * TILE, sec: si,
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
        complex: [17, function () { // mur opactwa: drzwi do komnat, wyjście za murem (sekcja 5b)
          g = GROUND; flat(17);
          var zi = L.cx.length, Z = buildComplex(D, si, zi, L), i, y;
          L.cx.push(Z);
          for (i = 5; i <= 10; i++) for (y = 0; y < g; y++) set(x + i, y, 1);
          L.cxDoors.push({ x: (x + 3) * TILE + 16, y: g * TILE, zi: zi });
          Z.back = { x: (x + 13) * TILE + 16, y: g * TILE };
          coin(x + 1, g - 2); coin(x + 15, g - 2);
          S.par += CX[D.key].par;
          return 17;
        }],
        mosaic: [11, function () { // mozaika przy opactwie odblokowuje skrzynię
          var w = 10; flat(w);
          var ci = chest(x + 7, g - 3, GM ? 'pu:doublejump' : 'hat:hood', true);
          L.plaques.push({ x: (x + 3) * TILE + 16, y: g * TILE, sec: si, solved: false, closes: 0, chest: ci });
          return w;
        }],
        carpet: [11, function () { // Spello: kwiatowy dywan (układanka z płatków) odblokowuje skrzynię z wiankiem
          var w = 10; flat(w);
          var ci = chest(x + 7, g - 3, 'hat:crown', true); L.chestList[ci].lock = 'carpet';
          L.plaques.push({ kind: 'carpet', x: (x + 3) * TILE + 16, y: g * TILE, sec: si, solved: false, closes: 0, chest: ci });
          return w;
        }],
        stairs: [9, function () { // schodki stromej uliczki: 3 stopnie w górę albo w dół
          var lo = D.adv ? 7 : 8, dir = g >= 11 ? -1 : g <= lo ? 1 : (R() < .6 ? -1 : 1);
          for (var i = 0; i < 3; i++) { g = clamp(g + dir, lo, 12); flat(2); if (i === 1) coin(x + 1, g - 2); x += 2; }
          flat(3); return 3;
        }],
        climbAlley: [17, function () { // Spello: pionowa wspinaczka po balkonach z donicami na wysoki zaułek, potem zeskok
          g = GROUND; flat(3); x += 3;
          var top = D.adv ? 3 : 6, rows = [], r;
          for (r = g - 3; r > top + 1; r -= 3) rows.push(r);
          // balkony pod samą ścianą domu: pierwszy tuż przy ścianie, wyższy nad nim (szerszy, w lewo) — wspinaczka prosto w górę
          rows.forEach(function (rr, i) { var c0 = i ? x + 1 : x + 2, c1 = x + 3; for (var k = c0; k <= c1; k++) set(k, rr, 2); coin(i ? x + 1 : x + 2, rr - 1); });
          flat(4); x += 4;                                          // pod balkonami: uliczka
          var hb = 7;
          for (var i = 0; i < hb; i++) { ground(x + i, top); if (i % 2) coin(x + i, top - 1); }
          if (D.adv) rock(x + 4);                                   // donica spada z parapetu
          x += hb; g = GROUND; flat(3); return 3;
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
          if (!D.adv) set(x + 1, g, 2); // Łatwy: kładka w środku (dwa małe skoki zamiast jednego długiego; JP 2026-10-29)
          hide(x + w / 2, g - 4.25); x += w; flat(3); return 3;
        }]
      };
      var weights = GM ? (function (o) { var c = {}; for (var k in o) c[k] = o[k]; return c; })(SP_WEIGHTS[D.adv ? 'adv' : 'easy'][terr] || SP_WEIGHTS.easy.alley) : D.adv ? {
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
      if (cave || (GM && GM.fireflies)) for (var ff = 0; ff < 10; ff++) { // świetliki (jaskinia; Spello: wieczór)
        var fcx = x0 + 12 + Math.floor(ff * (SL - 30) / 10), fr = 2;
        while (fr < ROWS - 1 && !SOLID[get(fcx, fr)] && !ONEWAY[get(fcx, fr)]) fr++;
        if (fr > 4 && fr < ROWS - 1) L.items.push({ type: 'firefly', x: fcx * TILE + 16, y: (fr - 2) * TILE + 8, ph: ff, alive: true });
      }
      if (GM) { if (miniK) { x = buildMiniSp(L, D, miniK, si, miniX, landX, R, set, ground, coin, crumble, water, clearCol, dripper, rock, beetle); g = L.minis[L.minis.length - 1].endG || GROUND; } }
      else if (D.adv) { x = buildMini(L, D, terr, si, miniX, landX, R, set, ground, coin, crumble, water, clearCol, dripper, rock); g = L.minis[L.minis.length - 1].endG || GROUND; }
      for (; x < x0 + SL; x++) ground(x, g);
      L.landmarks.push({ x: (landX + 2) * TILE + 16, y: g * TILE, sec: si, done: false });

      if (S.shortcut) { // tajny skrót za komplet zadań przystanku
        var endC = Math.min((gateCols.length ? gateCols[0] : landX) - 5, x0 + 40), WR = 4;
        L.springs.push({ x: (x0 + 5) * TILE + 16, y: GROUND * TILE, squash: 0 });
        for (c = x0 + 7; c <= endC; c++) { if (get(c, WR) === 0) set(c, WR, 2); if (c % 2 === 0 && c < endC - 2) coin(c, WR - 1); }
        L.chests.push({ x: (endC - 1) * TILE + 16, y: WR * TILE, open: false });
      }
      S.checkpoint = { x: (x0 + 2) * TILE + 16, y: GROUND * TILE };
      S.par += Math.round(SL * TILE / RUN * D.parMul + 4); // + czas na komnaty (complex)
    });
    for (var x = xAcc; x < W; x++) { ground(x, GROUND); L.sec[x] = n - 1; }
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

  /* Mini-wyzwania Spello (przed naklejką przystanku). Zwraca kolumnę, od której dalej jest ziemia.
     lever    — rzymska brama: dźwignia otwiera ją na kilka sekund (wszystkie poziomy; to ten sam mechanizm co płyta w jaskini)
     glide    — balonik nad doliną: stojak z balonikami, szeroka przepaść, na Średnim/Trudnym podmuchy
     trench   — kładka nad wykopem przy willi (wali się falą, jak most nad Sentino)
     tower / scaffold — windy przy wieżach / rusztowanie w kaplicy na wysoką półkę z naklejką */
  function buildMiniSp(L, D, kind, si, x, landX, R, set, ground, coin, crumble, water, clearCol, dripper, rock, beetle) {
    var g = GROUND, i, y;
    if (kind === 'lever') {
      for (i = 0; i < 5; i++) ground(x + i, g);
      var px = x + 2; x += 5;
      ground(x, g - 1); ground(x + 1, g - 1); x += 2;
      for (i = 0; i < 4; i++) ground(x + i, g - 2); coin(x + 1, g - 4); coin(x + 2, g - 4);
      if (D.adv) beetle(x, x + 3, g - 2, D.key === 'hard');
      x += 4;
      var pw = D.adv ? 3 : 2;
      for (i = 0; i < pw; i++) clearCol(x + i, 0, 13);
      if (D.key === 'hard') crumble(x + 1, g - 2);
      x += pw;
      for (i = 0; i < 3; i++) ground(x + i, g - 1); x += 3;
      for (i = 0; i < 3; i++) ground(x + i, g); x += 3;
      var dc = x; ground(x, g); x++;
      for (; x < landX; x++) ground(x, g);
      L.minis.push({ type: 'door', lever: true, sec: si, plateX: px * TILE + 16, col: dc, x: dc * TILE, g: g, open: false, t: 0, T: D.doorT ? D.doorT + 1 : 13, lift: 0, done: false, on: false });
      return x;
    }
    if (kind === 'glide') {
      for (i = 0; i < 6; i++) ground(x + i, g);
      L.stands.push({ x: (x + 3) * TILE + 16, y: g * TILE, sec: si, told: false });
      x += 6;
      var gw = D.key === 'easy' ? 9 : D.key === 'medium' ? 12 : 14, gx0 = x;
      for (i = 0; i < gw; i++) clearCol(x + i, 0, 13);
      if (D.key === 'easy') { set(x + 4, g - 1, 2); set(x + 5, g - 1, 2); } // chmurka-półka do odpoczynku
      for (i = 1; i < gw; i += 2) coin(x + i, g - 3 - Math.sin(i / gw * Math.PI) * 2.5);
      if (D.wind) L.winds.push({ x0: gx0 * TILE, x1: (gx0 + gw) * TILE, f: D.wind * .55, per: 3.4, on: 1.5, ph: 0 });
      x += gw;
      for (; x < landX; x++) ground(x, g);
      L.minis.push({ type: 'glide', sec: si, x0: gx0 * TILE, x1: (gx0 + gw) * TILE });
      return x;
    }
    if (kind === 'trench') { // kładka nad wykopem (bez wody — upadek = serduszko)
      for (i = 0; i < 4; i++) ground(x + i, g); x += 4;
      var bx0 = x, bridge = [];
      for (i = 0; i < 22; i++) {
        clearCol(x + i, 0, 13);
        if (i === 7 || i === 8 || i === 15 || i === 16) continue;
        bridge.push(L.crumbles.length); crumble(x + i, g, true);
        if (i % 3 === 0) coin(x + i, g - 2);
      }
      x += 22;
      for (; x < landX; x++) ground(x, g);
      L.minis.push({ type: 'bridge', sec: si, x0: bx0 * TILE, x1: (bx0 + 22) * TILE, wave: -1, v: D.bridgeV, idx: bridge });
      return x;
    }
    // tower / scaffold: dwie windy na wysoką półkę (bez wiatru)
    for (i = 0; i < 6; i++) ground(x + i, g); x += 6;
    var hi = g - 7, wood = kind === 'scaffold';
    ground(x, g); ground(x + 1, g);
    var m1 = { x: x * TILE, y: 0, w: 64, ax: 'y', bx: x * TILE, by: 0, range: 0, w2: Math.PI * 2 / (3.0 / Math.sqrt(D.spd)), ph: 0, dx: 0, dy: 0, log: false, wood: wood, sec: si };
    m1.y0 = g * TILE - 12; m1.y1 = (g - 4) * TILE; m1.by = (m1.y0 + m1.y1) / 2; m1.range = (m1.y0 - m1.y1) / 2; m1.y = m1.by; L.movers.push(m1);
    x += 2; ground(x, g - 4); ground(x + 1, g - 4); x += 2;
    ground(x, g); ground(x + 1, g);
    var m2 = { x: x * TILE, y: 0, w: 64, ax: 'y', bx: x * TILE, by: 0, range: 0, w2: Math.PI * 2 / (3.4 / Math.sqrt(D.spd)), ph: 2, dx: 0, dy: 0, log: false, wood: wood, sec: si };
    m2.y0 = (g - 4) * TILE - 12; m2.y1 = hi * TILE; m2.by = (m2.y0 + m2.y1) / 2; m2.range = (m2.y0 - m2.y1) / 2; m2.y = m2.by; L.movers.push(m2);
    x += 2;
    var ps = x;
    for (; x < landX + 5; x++) ground(x, hi);
    if (!wood) { rock(ps + 4); }
    coin(ps + 1, hi - 2); coin(ps + 2, hi - 2);
    L.minis.push({ type: 'climb', sec: si, endG: hi });
    return x;
  }

  /* ---------- 5b. Komnaty pod opactwem (pokoje „flip-screen”, JP 2026-10-26) ----------
     Własny projekt w duchu klasycznych gier z pokojami: kompleks 3 (Łatwy), 7 (Średni) albo 9 (Trudny) komnat 16×11 kafli,
     połączonych w lewo/prawo i drabinami w górę/w dół. Wejście drzwiami w murze opactwa na trasie przystanku „stone”,
     wyjście drzwiami z ostatniej komnaty z powrotem na ścieżkę (mur dalej niż wejście — przejść trzeba przez komnaty).
     Mapa:  # skała  . pusto  - kładka  H drabina  | lina / łańcuch  < > ruchoma posadzka  = % znikające mostki (dwie grupy na zmianę)
            I krata (zamyka się i otwiera co kilka sekund)  X pęknięta ściana (kilof)  R U N drzwi czerwone / niebieskie / zielone
            ~ woda w dole przepaści  r u n klucze  T pochodnia  P kilof  C skrzynia (zawartość: chest)  S ukryta naklejka
            E wyjście  @ start  * kamyczek  o toczący się kamień  v nietoperz (odbija się)  s pająk na nitce
     Zasady uczciwości: klucze i przedmioty nie giną (upadek = powrót na wejście do komnaty z całym plecakiem), plecak mieści 4 rzeczy
     i układ nigdy nie wymaga więcej, krata nikogo nie rani (tylko odpycha), drzwi zostają otwarte, zrobiony kompleks na Trudnym
     po „drzemce” przepuszcza od razu do wyjścia. route = punkty dla bota testowego (dzieci go nie widzą). */
  var RW = 16, RH = 11, ITEM_NAME = {}, CX_NAME = {}, CX_NAME_SP = {};
  function cxName(Z) { return (Z.sp ? CX_NAME_SP : CX_NAME)[Z.key]; }
  var CX_TILE = { '#': 1, '.': 0, '-': 2, '~': 3, '^': 7, 'H': 10, '|': 11, '<': 12, '>': 13, '=': 14, '%': 15, 'X': 16, 'I': 17, 'R': 20, 'U': 21, 'N': 22 };
  var KEY_COL = { r: 'red', u: 'blue', n: 'green' }, DOOR_COL = { 20: 'red', 21: 'blue', 22: 'green' };
  var COL_RGB = { red: '#C81E36', blue: '#0B4EA2', green: '#1F7A48' };
  var CX = {
    easy: { gw: 3, gh: 1, stickers: 1, par: 40, bper: 3.4, bon: 2.3, conv: 60, barPer: 3.6, barOn: 1.6, spd: 1,
      route: [[0, 0, 6, 9], [0, 0, 7, 9], [0, 0, 7, 4], [0, 0, 10, 4], [0, 0, 13, 9], [1, 0, 2, 9], [1, 0, 14, 9], [2, 0, 2, 9], [2, 0, 6, 9], [2, 0, 7, 6], [2, 0, 4, 4], [2, 0, 10, 9], [2, 0, 12, 9]],
      rooms: [
      { at: [0, 0], theme: 'crypt', map: [
        '################',
        '#..............#',
        '#..............#',
        '#.........r....#',
        '#......H----...#',
        '#......H.......#',
        '#...*..H.......#',
        '#.@....H........',
        '#......H........',
        '################',
        '################'] },
      { at: [1, 0], theme: 'crypt', map: [
        '################',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#.....*........#',
        '#..........s...#',
        '...............R',
        '...............R',
        '#####>>>>>######',
        '################'] },
      { at: [2, 0], theme: 'crypt', map: [
        '################',
        '#..............#',
        '#..............#',
        '#...S..........#',
        '#..----........#',
        '#..............#',
        '#......--......#',
        '............E..#',
        '...............#',
        '#######..#######',
        '#######~~#######'] }] },
    medium: { gw: 3, gh: 3, stickers: 2, par: 80, bper: 3.2, bon: 2.0, conv: 75, barPer: 3.4, barOn: 1.7, spd: 1.2,
      route: [[0, 0, 5, 9], [0, 0, 11, 9], [0, 1, 11, 9], [0, 1, 10, 9], [0, 1, 1, 9], [0, 1, 12, 9], [1, 1, 2, 9], [1, 1, 11, 9], [1, 2, 11, 9], [1, 2, 10, 9], [1, 2, 2, 9], [1, 2, 10, 9], [1, 2, 11, 9], [1, 1, 11, 9], [1, 1, 4, 9], [1, 0, 4, 9], [1, 0, 14, 9], [2, 0, 2, 9], [2, 0, 5, 9], [2, 0, 4, 6], [2, 0, 2, 4], [2, 0, 9, 9], [2, 0, 12, 9], [2, 1, 12, 9], [2, 1, 6, 9]],
      rooms: [
      { at: [0, 0], theme: 'crypt', map: [
        '################',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..............#',
        '#....T..*.......',
        '#.@.............',
        '###########H####',
        '###########H####'] },
      { at: [1, 0], theme: 'crypt', map: [
        '################',
        '#......I.......#',
        '#......I.......#',
        '#......I.......#',
        '#......I.......#',
        '#......I.......#',
        '#......I.......#',
        '.......I.......R',
        '.......I.......R',
        '####H#<<<<<<####',
        '####H###########'] },
      { at: [2, 0], theme: 'crypt', map: [
        '################',
        '#..............#',
        '#..............#',
        '#.S............#',
        '#----..........#',
        '#..............#',
        '#...--.........#',
        '...........*...#',
        '...............#',
        '###==#%%####H###',
        '###~~#~~####H###'] },
      { at: [0, 1], theme: 'crypt', dark: true, map: [
        '###########H####',
        '#.....|....H...#',
        '#.....|....H...#',
        '#.....|....H...#',
        '#.....|....H...#',
        '#.....|....H...#',
        '#.....|....H...#',
        '#r.........H....',
        '#..........H....',
        '###.......######',
        '###~~~~~~~######'] },
      { at: [1, 1], theme: 'crypt', map: [
        '####H###########',
        '#...H..........#',
        '#...H....s.....#',
        '#...H..........#',
        '#...H..........#',
        '#...H..........#',
        '#...H..........#',
        '....H..........U',
        '....H..........U',
        '###########H####',
        '###########H####'] },
      { at: [2, 1], theme: 'crypt', map: [
        '############H###',
        '#...........H..#',
        '#...........H..#',
        '#...........H..#',
        '#...........H..#',
        '#...........H..#',
        '#...........H..#',
        '......E.....H..#',
        '.........o..H..#',
        '################',
        '################'] },
      { at: [1, 2], theme: 'cave', map: [
        '###########H####',
        '#..........H...#',
        '#..........H...#',
        '#..........H...#',
        '#....v.....H...#',
        '#..........H...#',
        '#..........H...#',
        '#.u..S.....H...#',
        '#..........H...#',
        '####==#%%#######',
        '####~~#~~#######'] }] },
    hard: { gw: 3, gh: 3, stickers: 2, par: 120, bper: 3.0, bon: 1.8, conv: 95, barPer: 3.0, barOn: 1.6, spd: 1.45,
      route: [[0, 0, 5, 9], [0, 0, 11, 9], [0, 1, 11, 9], [0, 1, 10, 9], [0, 1, 1, 9], [0, 1, 12, 9], [1, 1, 2, 9], [1, 1, 4, 9], [1, 0, 4, 9], [1, 0, 14, 9], [2, 0, 2, 9], [2, 0, 5, 9], [2, 0, 4, 6], [2, 0, 2, 3], [2, 0, 10, 9], [2, 0, 12, 9], [2, 1, 12, 9], [2, 1, 8, 9], [2, 1, 1, 9], [2, 1, 2, 6], [2, 1, 2, 3], [2, 1, 1, 9], [1, 1, 14, 9], [1, 1, 11, 9], [1, 2, 11, 9], [1, 2, 1, 9], [0, 2, 13, 9], [0, 2, 8, 6], [0, 2, 3, 4], [0, 2, 13, 9], [1, 2, 2, 9], [1, 2, 14, 9], [2, 2, 2, 9], [2, 2, 12, 9]],
      rooms: [
      { at: [0, 0], theme: 'crypt', map: [
        '################',
        '#..............#',
        '#..............#',
        '#..............#',
        '#..........v...#',
        '#..............#',
        '#..............#',
        '#....T..*.......',
        '#.@.............',
        '###########H####',
        '###########H####'] },
      { at: [1, 0], theme: 'crypt', map: [
        '################',
        '#.....I...I....#',
        '#.....I...I....#',
        '#.....I...I....#',
        '#.....I...I....#',
        '#.....I...I....#',
        '#.....I...I....#',
        '......I...I....R',
        '......I...I....R',
        '####H<<<<<<<<###',
        '####H###########'] },
      { at: [2, 0], theme: 'crypt', map: [
        '################',
        '#..............#',
        '#.S............#',
        '#---...........#',
        '#..............#',
        '#..........v...#',
        '#...--.........#',
        '.........n.....#',
        '...............#',
        '###==#%%#==#H###',
        '###~~#~~#~~#H###'] },
      { at: [0, 1], theme: 'cave', dark: true, map: [
        '###########H####',
        '#.....|....H...#',
        '#.....|....H...#',
        '#.....|....H.s.#',
        '#.....|....H...#',
        '#.....|....H...#',
        '#.....|....H...#',
        '#r.........H....',
        '#..........H....',
        '###.......######',
        '###~~~~~~~######'] },
      { at: [1, 1], theme: 'crypt', map: [
        '####H###########',
        '#...H..........#',
        '#...H....s.....#',
        '#...H..........#',
        '#...H..........#',
        '#...H..........#',
        '#...H..........#',
        '....H..........U',
        '....H.....o....U',
        '###########H####',
        '###########H####'] },
      { at: [2, 1], theme: 'cave', dark: true, chest: 'pickaxe', map: [
        '############H###',
        '#...........H..#',
        '#.u.........H..#',
        '#---........H..#',
        '#...........H..#',
        '#...|.......H..#',
        '#--.|.......H..#',
        '....|.......H..#',
        '....|...C...H..#',
        '###.....########',
        '###~~~~~########'] },
      { at: [0, 2], theme: 'cave', map: [
        '################',
        '#..............#',
        '#..............#',
        '#..S...........#',
        '#.----.........#',
        '#..............#',
        '#......--......#',
        '#.......v.......',
        '#...............',
        '################',
        '################'] },
      { at: [1, 2], theme: 'cave', map: [
        '###########H####',
        '#..........H...#',
        '#..........H...#',
        '#..........H...#',
        '#..........H...#',
        '#..........H...#',
        '#....s.....H...#',
        'X..........H...N',
        'X..........H...N',
        '####==##########',
        '####~~##########'] },
      { at: [2, 2], theme: 'cave', map: [
        '################',
        '#....I.........#',
        '#....I.........#',
        '#....I.........#',
        '#....I.........#',
        '#....I..s......#',
        '#....I.........#',
        '.....I....o.E..#',
        '.....I.........#',
        '################',
        '################'] }] }
  };
  /* Spello: „Wykopaliska pod willą” — te same sprawdzone układy komnat w lustrzanym odbiciu (lewo ↔ prawo, posadzki
     ruchome w drugą stronę), inne motywy: dig (rzymskie mury opus reticulatum, mozaiki) i cistern (ciemna cysterna). */
  function mirrorCX(C, themes) {
    var o = {}; for (var k in C) o[k] = C[k];
    o.route = C.route.map(function (p) { return [C.gw - 1 - p[0], p[1], RW - 1 - p[2], p[3]]; });
    o.rooms = C.rooms.map(function (r) {
      return { at: [C.gw - 1 - r.at[0], r.at[1]], theme: themes[r.theme] || r.theme, dark: r.dark, chest: r.chest,
        map: r.map.map(function (line) { return line.split('').reverse().map(function (ch) { return ch === '<' ? '>' : ch === '>' ? '<' : ch; }).join(''); }) };
    });
    o.sp = true;
    return o;
  }
  var CXS = { easy: mirrorCX(CX.easy, { crypt: 'dig', cave: 'cistern' }), medium: mirrorCX(CX.medium, { crypt: 'dig', cave: 'cistern' }), hard: mirrorCX(CX.hard, { crypt: 'dig', cave: 'cistern' }) };
  function buildComplex(D, si, zi, LV) {
    var C = LV.cxSet[D.key], W = C.gw * RW, H = C.gh * RH;
    var Z = { key: D.key, sp: !!C.sp, si: si, zi: zi, W: W, H: H, GW: C.gw, GH: C.gh, grid: new Uint8Array(W * H).fill(1), barAt: new Int16Array(W * H).fill(-1),
      bars: [], rooms: [], roomAt: [], items: [], coins: [], enemies: [], exit: null, start: null, back: null, done: false,
      bper: C.bper, bon: C.bon, conv: C.conv, route: [] };
    for (var i = 0; i < C.gw * C.gh; i++) Z.roomAt.push(-1);
    function floorY(gx, gy) { for (var y = gy; y < H; y++) { var v = Z.grid[y * W + gx]; if (v === 1 || v === 2 || v === 12 || v === 13) return y * TILE; } return H * TILE; }
    function ceilY(gx, gy) { for (var y = gy; y >= 0; y--) if (Z.grid[y * W + gx] === 1) return (y + 1) * TILE; return 0; }
    var marks = [];
    C.rooms.forEach(function (r, ri) {
      var rx = r.at[0], ry = r.at[1];
      Z.roomAt[ry * C.gw + rx] = ri;
      Z.rooms.push({ rx: rx, ry: ry, x0: rx * RW * TILE, y0: ry * RH * TILE, x1: (rx + 1) * RW * TILE, y1: (ry + 1) * RH * TILE, dark: !!r.dark, theme: r.theme, seen: false });
      r.map.forEach(function (line, row) {
        for (var col = 0; col < RW; col++) {
          var ch = line[col], gx = rx * RW + col, gy = ry * RH + row;
          var t = CX_TILE[ch]; Z.grid[gy * W + gx] = t != null ? t : 0;
          if (ch === 'I') { var bi = -1; for (var bk = 0; bk < Z.bars.length; bk++) if (Z.bars[bk].c === gx && Z.bars[bk].r1 === gy - 1) bi = bk;
            if (bi < 0) { Z.bars.push({ c: gx, r0: gy, r1: gy, per: C.barPer, on: C.barOn, ph: (gx * .9) % C.barPer, room: ri }); bi = Z.bars.length - 1; } else Z.bars[bi].r1 = gy;
            Z.barAt[gy * W + gx] = bi; }
          if (t == null && ch !== '.') marks.push({ ch: ch, gx: gx, gy: gy, room: ri, chest: r.chest });
        }
      });
    });
    var sp = C.spd, nst = 0;
    marks.forEach(function (m) {
      var cx = m.gx * TILE + 16, cy = m.gy * TILE + 16;
      if (KEY_COL[m.ch]) Z.items.push({ k: 'key:' + KEY_COL[m.ch], x: cx, y: cy, room: m.room, taken: false });
      else if (m.ch === 'T') Z.items.push({ k: 'torch', x: cx, y: cy, room: m.room, taken: false });
      else if (m.ch === 'P') Z.items.push({ k: 'pickaxe', x: cx, y: cy, room: m.room, taken: false });
      else if (m.ch === 'C') Z.items.push({ k: 'chest', content: m.chest || 'coins', x: cx, y: floorY(m.gx, m.gy), room: m.room, open: false, taken: false });
      else if (m.ch === 'S') { LV.hidden.push({ x: cx, y: cy, taken: false, sec: si, zone: zi }); nst++; }
      else if (m.ch === '*') Z.coins.push({ x: cx, y: cy, taken: false, ph: m.gx * .7 });
      else if (m.ch === 'E') Z.exit = { x: cx, y: floorY(m.gx, m.gy), room: m.room };
      else if (m.ch === '@') Z.start = { x: cx, y: floorY(m.gx, m.gy) };
      else if (m.ch === 'o') Z.enemies.push({ type: 'rstone', room: m.room, hx: cx, hy: cy, x: cx, y: cy, vx: -80 * sp, vy: 0, r: 14, rot: 0 });
      else if (m.ch === 'v') Z.enemies.push({ type: 'rbat', room: m.room, hx: cx, hy: cy, x: cx, y: cy, vx: 85 * sp, vy: 55 * sp, t: m.gx });
      else if (m.ch === 's') Z.enemies.push({ type: 'spider', room: m.room, x: cx, top: ceilY(m.gx, m.gy), y0: cy, y1: floorY(m.gx, m.gy) - 34, y: cy, t: m.gx * .4, per: 3.2 / sp });
    });
    Z.route = C.route.map(function (p) { return { x: (p[0] * RW + p[2]) * TILE + 16, y: (p[1] * RH + p[3]) * TILE }; });
    Z.stickers = nst;
    return Z;
  }
  function zoneTile(Z, x, y) {
    if (x < 0 || y < 0 || x >= Z.W || y >= Z.H) return 1;
    var i = y * Z.W + x, v = Z.grid[i];
    if (v === 14 || v === 15) return bridgeOn(Z, v) ? v : 0;
    if (v === 17) { var b = Z.bars[Z.barAt[i]]; return barClosed(b) ? 17 : 0; }
    return v;
  }
  function bridgeOn(Z, v) { return ((gameT + (v === 15 ? Z.bper / 2 : 0)) % Z.bper) < Z.bon; }
  function bridgeLeft(Z, v) { var t = (gameT + (v === 15 ? Z.bper / 2 : 0)) % Z.bper; return t < Z.bon ? Z.bon - t : -1; }
  function barClosed(b) { return ((gameT + b.ph) % b.per) < b.on; }
  function barLift(b) { // 0 = zamknięta, 1 = schowana w stropie (z płynnym przejściem)
    var t = (gameT + b.ph) % b.per;
    if (t < b.on) return t > b.on - .35 ? (t - (b.on - .35)) / .35 * .25 : 0;
    var o = t - b.on, open = b.per - b.on;
    return o < .3 ? .25 + o / .3 * .75 : o > open - .45 ? (open - o) / .45 : 1;
  }
  function curZone() { return P.zone >= 0 ? L.cx[P.zone] : null; }
  function roomOf(Z, x, y) {
    var rx = clamp(Math.floor(x / (RW * TILE)), 0, Z.GW - 1), ry = clamp(Math.floor(y / (RH * TILE)), 0, Z.GH - 1);
    return Z.roomAt[ry * Z.GW + rx];
  }
  function hasBag(k) { return P.bag.indexOf(k) >= 0; }
  var bagToastT = -9;
  function zoneToast(msg) { if (gameT - bagToastT > 2.2) { bagToastT = gameT; toast(msg); } }
  /* Kontakt z „ścianą” w komnacie: pęknięta ściana pęka od kilofa, drzwi otwiera klucz w tym samym kolorze. */
  function wallTouch(cx, cy) {
    var Z = curZone(); if (!Z) return;
    var v = Z.grid[cy * Z.W + cx];
    if (v === 16) {
      if (hasBag('pickaxe')) { openConnected(Z, cx, cy, 16); ev('wall'); sfx('pop'); toast(PT('page.game.cx.wall_broken', 'Trach! Kilof rozbił pękniętą ścianę.')); }
      else zoneToast(PT('page.game.cx.wall_need', 'Pęknięta ściana. Przydałby się kilof!'));
    } else if (DOOR_COL[v]) {
      var key = 'key:' + DOOR_COL[v];
      if (hasBag(key)) { P.bag.splice(P.bag.indexOf(key), 1); openConnected(Z, cx, cy, v); ev('door'); sfx('gate'); toast(PT('page.game.cx.door_open', 'Klucz pasuje — drzwi otwarte!')); }
      else zoneToast(fill(PT('page.game.cx.door_need', 'Zamknięte. Potrzebny: {key}.'), { key: ITEM_NAME[key] }));
    }
  }
  function openConnected(Z, cx, cy, v) {
    var st = [[cx, cy]];
    while (st.length) {
      var p = st.pop(), x = p[0], y = p[1];
      if (x < 0 || y < 0 || x >= Z.W || y >= Z.H || Z.grid[y * Z.W + x] !== v) continue;
      Z.grid[y * Z.W + x] = 0;
      if (!SIM) debris(x * TILE + 16, y * TILE + 8);
      st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }
  /* Drabiny i liny: trzymaj skok = w górę, puść = powoli w dół; ◀/▶ = zejdź w bok, ◀/▶ + skok = skok z liny.
     Stojąc na szczycie drabiny (bez ruchu chwilę) Quo sam zaczyna schodzić. */
  function climbTile(v) { return v === 10 || v === 11; }
  function ladderAt(px, py) { var v = tileAt(Math.floor(px / TILE), Math.floor(py / TILE)); return climbTile(v) ? v : 0; }
  function updateClimb(dt, ax) {
    if (P.climbCool > 0) P.climbCool -= dt;
    var col = Math.floor(P.x / TILE);
    if (!P.climb) {
      if (P.onGround && P.under === 10 && !ax && !input.jump && tileAt(col, Math.floor((P.y + 2) / TILE)) === 10) {
        P.ladT += dt; if (P.ladT > .3) { P.climb = true; P.ladT = 0; P.y += 3; P.onGround = false; }
      } else P.ladT = 0;
      if (!P.climb) {
        var lv = ladderAt(P.x, P.y - 8) || ladderAt(P.x, P.y - 30);
        if (!lv || P.climbCool > 0 || P.hurtT > 0 || P.nap > 0) return false;
        if (!(input.jump || (!P.onGround && P.vy > 40))) return false;
        P.climb = true; P.onGround = false; input.jumpPressed = false; P.jumpBuf = 0; ev('climb');
      }
    }
    var on = ladderAt(P.x, P.y - 30) || ladderAt(P.x, P.y - 8) || ladderAt(P.x, P.y + 2);
    if (!on) { P.climb = false; return false; }
    P.x += (col * TILE + 16 - P.x) * Math.min(1, dt * 14); P.vx = 0;
    if (input.jumpPressed && ax) { input.jumpPressed = false; P.climb = false; P.vy = -560; P.vx = ax * RUN; P.facing = ax; P.climbCool = .3; sfx('jump'); return false; }
    if (ax && !input.jump) { P.climb = false; P.vx = ax * 140; P.facing = ax; P.climbCool = .3; return false; }
    input.jumpPressed = false;
    var ft = Math.floor((P.y - 1) / TILE);
    if (input.jump && tileAt(col, ft) === 10 && !climbTile(tileAt(col, ft - 1)) && P.y - ft * TILE <= 3) { // szczyt drabiny
      P.y = ft * TILE; P.vy = 0; P.climb = false; P.onGround = true; P.under = 10; return true;
    }
    P.vy = input.jump ? -150 : (on === 11 ? 75 : 115);
    return true;
  }
  function enterZone(zi) {
    var Z = L.cx[zi];
    if (Z.done) { P.x = Z.back.x; P.y = Z.back.y; P.vx = P.vy = 0; ev('zoneskip'); toast(PT('page.game.cx.done', 'Komnaty już przeszedłeś — idziemy dalej!')); return; }
    P.zone = zi; P.x = Z.start.x; P.y = Z.start.y; P.vx = P.vy = 0; P.climb = false; P.ride = -1; P.onRaft = -1; P.room = -1;
    P.roomEntry = { x: Z.start.x, y: Z.start.y }; P.safe = { x: Z.start.x, y: Z.start.y };
    if (D.cpGates) P.checkpoint = { x: Z.start.x, y: Z.start.y, zone: zi };
    ev('zone'); sfx('gate');
    toast(cxName(Z) + ' · ' + PT('page.game.cx.enter', 'znajdź klucze i wyjście!'), 3600);
    cam.room = -1; updateCamera(1); startWipe(P.x, P.y - 24);
  }
  function leaveZone() {
    var Z = curZone(); Z.done = true;
    P.zone = -1; P.x = Z.back.x; P.y = Z.back.y; P.vx = P.vy = 0; P.climb = false; P.safe = { x: P.x, y: P.y };
    if (D.cpGates) P.checkpoint = { x: P.x, y: P.y };
    ev('exit'); sfx('fanfare'); addCoins(5, P.x, P.y - 40);
    toast(PT('page.game.cx.out', 'Wyjście z komnat! +5 kamyczków'));
    cam.room = -1; updateCamera(1); startWipe(P.x, P.y - 24);
    if (!SIM) { updateHUD(); $('hudStop').textContent = fill(PT('page.game.hud.stop', 'Przystanek {n} z {m}'), { n: curSec + 1, m: L.sections.length }) + ' · ' + stopName(curSec); }
  }
  function zoneSafeSpot() {
    var Z = curZone();
    if (!P.onGround || P.climb || P.ride >= 0 || (P.under !== 1 && P.under !== 2)) return false;
    if (!solidAt(P.x - P.w / 2 - 4, P.y + 4) || !solidAt(P.x + P.w / 2 + 4, P.y + 4)) return false;
    for (var i = 0; i < Z.enemies.length; i++) { var e = Z.enemies[i]; if (e.room === P.room && Math.abs(e.x - P.x) < 90 && Math.abs(e.y - P.y) < 140) return false; }
    for (var cc = -2; cc <= 2; cc++) { var v = tileAt(Math.floor(P.x / TILE) + cc, Math.floor(P.y / TILE) - 1); if (v === 7 || v === 17) return false; }
    return true;
  }
  function updateZone(dt) {
    var Z = curZone(), ri = roomOf(Z, P.x, P.y - 24);
    if (ri !== P.room && ri >= 0) {
      P.room = ri; P.roomPending = true; ev('room');
      if (!Z.rooms[ri].seen) { Z.rooms[ri].seen = true; }
      if (!SIM) zoneHUD();
    }
    if (P.roomPending && P.nap <= 0 && zoneSafeSpot()) {
      P.roomPending = false; P.roomEntry = { x: P.x, y: P.y };
      if (D.cpGates) P.checkpoint = { x: P.x, y: P.y, zone: P.zone };
    }
    var rm = Z.rooms[P.room];
    // kraty: zamykająca się krata odsuwa Quo na bok (bez obrażeń)
    Z.bars.forEach(function (b) {
      if (b.room !== P.room || !barClosed(b)) return;
      var bx = b.c * TILE, hw = P.w / 2;
      if (P.x + hw > bx && P.x - hw < bx + TILE && P.y > b.r0 * TILE && P.y - P.h < (b.r1 + 1) * TILE) P.x = P.x < bx + 16 ? bx - hw - .5 : bx + TILE + hw + .5;
    });
    // kamyczki, przedmioty, naklejki
    Z.coins.forEach(function (c) {
      if (c.taken || P.nap > 0) return;
      var dx = P.x - c.x, dy = (P.y - 24) - c.y;
      if (dx * dx + dy * dy < 26 * 26) { c.taken = true; stats.coins++; updateHUD(); sfx('coin'); sparkle(c.x, c.y); }
    });
    L.hidden.forEach(function (h) {
      if (h.zone !== P.zone || h.taken || P.nap > 0) return;
      var dx = P.x - h.x, dy = (P.y - 24) - h.y;
      if (dx * dx + dy * dy < 30 * 30) {
        h.taken = true; L.sections[h.sec].hidden++; stats.hiddenTotal++; ev('hidden'); updateHUD(); sfx('fanfare'); sparkle(h.x, h.y);
        hiddenToast(L.sections[h.sec]);
      }
    });
    for (var i = 0; i < Z.items.length; i++) {
      var it = Z.items[i];
      if (it.taken || it.room !== P.room || P.nap > 0) continue;
      if (it.life > 0) { it.life -= dt; if (it.life <= 0) { it.taken = true; continue; } }
      if (it.delay > 0) { it.delay -= dt; continue; }
      var dx = P.x - it.x, dy = (P.y - 24) - (it.k === 'chest' ? it.y - 16 : it.y);
      if (dx * dx + dy * dy > 30 * 30) continue;
      if (it.k === 'chest') {
        if (it.open) continue;
        it.open = true; ev('chest'); sfx('fanfare');
        if (it.content === 'coins') addCoins(6, it.x, it.y - 20);
        else if (P.bag.length < 4) { P.bag.push(it.content); ev('item'); sparkle(it.x, it.y - 30); toast(fill(PT('page.game.cx.chest', 'W skrzyni: {item}!'), { item: ITEM_NAME[it.content] })); }
        else Z.items.push({ k: it.content, x: it.x, y: it.y - 30, room: it.room, taken: false, delay: .35 });
        continue;
      }
      if (it.k === 'pu') { it.taken = true; setPower(it.kind, it.fly); sfx('fanfare'); continue; }
      if (P.bag.length >= 4) { zoneToast(PT('page.game.cx.bag_full', 'Plecak jest pełny (4 rzeczy).')); continue; }
      it.taken = true; P.bag.push(it.k); ev('item'); sfx('fanfare'); sparkle(it.x, it.y);
      toast(fill(PT('page.game.cx.got', 'Masz: {item}!'), { item: ITEM_NAME[it.k] }) + (it.k === 'torch' ? ' ' + PT('page.game.cx.torch_help', 'W ciemnych komnatach będzie jaśniej.') : ''));
    }
    // przeciwnicy w tej komnacie (pozostałe komnaty stoją)
    Z.enemies.forEach(function (e) {
      if (e.room !== P.room) return;
      var R0 = Z.rooms[e.room];
      if (e.type === 'rstone') {
        e.vy = Math.min(e.vy + G * dt, MAX_FALL); e.x += e.vx * dt; e.y += e.vy * dt; e.rot += e.vx * dt / e.r;
        var row = Math.floor((e.y + e.r) / TILE), tv = tileAt(Math.floor(e.x / TILE), row);
        if (SOLID[tv] || ONEWAY[tv] || tv === 10) { e.y = row * TILE - e.r; e.vy = 0; }
        var ahead = tileAt(Math.floor((e.x + Math.sign(e.vx) * e.r) / TILE), Math.floor(e.y / TILE));
        if (SOLID[ahead] || e.x < R0.x0 + TILE + e.r || e.x > R0.x1 - TILE - e.r) { e.vx = -e.vx; e.x = clamp(e.x, R0.x0 + TILE + e.r, R0.x1 - TILE - e.r); }
        if (tileAt(Math.floor(e.x / TILE), Math.floor(e.y / TILE)) === 3 || e.y > R0.y1) { e.x = e.hx; e.y = e.hy; e.vy = 0; }
        zoneHit(e, e.r, true);
      } else if (e.type === 'rbat') {
        e.t += dt;
        var nx = e.x + e.vx * dt, ny = e.y + e.vy * dt;
        if (SOLID[tileAt(Math.floor((nx + Math.sign(e.vx) * 12) / TILE), Math.floor(e.y / TILE))] || nx < R0.x0 + TILE + 12 || nx > R0.x1 - TILE - 12) e.vx = -e.vx; else e.x = nx;
        if (SOLID[tileAt(Math.floor(e.x / TILE), Math.floor((ny + Math.sign(e.vy) * 10) / TILE))] || ny < R0.y0 + TILE + 10 || ny > R0.y1 - 2 * TILE - 10) e.vy = -e.vy; else e.y = ny;
        zoneHit(e, 11, false);
      } else if (e.type === 'spider') {
        e.t += dt; e.y = e.y0 + (e.y1 - e.y0) * (.5 - .5 * Math.cos(e.t * Math.PI * 2 / e.per));
        zoneHit(e, 11, false);
      }
    });
    if (Z.exit && Z.exit.room === P.room && P.onGround && P.nap <= 0 && Math.abs(P.x - Z.exit.x) < 16 && Math.abs(P.y - Z.exit.y) < 12) leaveZone();
  }
  function zoneHit(e, r, hard) {
    if (P.nap > 0) return;
    var nx = clamp(e.x, P.x - P.w / 2, P.x + P.w / 2), ny = clamp(e.y, P.y - P.h, P.y), dx = e.x - nx, dy = e.y - ny;
    if (dx * dx + dy * dy > r * r) return;
    if (hard) { if (P.inv <= 0) { hurt(e.x); P.vy = -420; } }
    else { bump(e.x); if (e.type === 'rbat') { e.vx = (e.x < P.x ? -1 : 1) * Math.abs(e.vx); e.vy = -Math.abs(e.vy); } }
  }
  function zoneCamera(dt) {
    var Z = curZone(), ri = P.room >= 0 ? P.room : roomOf(Z, P.x, P.y - 24), rm = Z.rooms[ri];
    var rw = RW * TILE, rh = RH * TILE, vh = view.h - view.reserve, tx, ty;
    if (view.w >= rw) tx = rm.x0 - (view.w - rw) / 2; else tx = clamp(P.x - view.w / 2, rm.x0, rm.x1 - view.w);
    if (vh >= rh) ty = rm.y0 - (vh - rh) * .7; else ty = clamp(P.y - 24 - vh / 2, rm.y0, rm.y1 - vh);
    if (cam.room !== ri) { cam.x = tx; cam.y = ty; cam.room = ri; return; } // przeskok ekranu
    cam.x = lerp(cam.x, tx, Math.min(1, dt * 10)); cam.y = lerp(cam.y, ty, Math.min(1, dt * 10));
  }
  function zoneHUD() {
    var Z = curZone(); if (!Z) return;
    $('hudStop').textContent = cxName(Z) + ' · ' + fill(PT('page.game.cx.room', 'komnata {n} z {m}'), { n: P.room + 1, m: Z.rooms.length });
  }

  /* ---------- 6. Fizyka, gracz, przeciwnicy ---------- */
  var trip, prog, L, P, D, state = 'loading', prevState = 'play', playNo = 0, demo = false, diffKey = 'medium';
  var cam = { x: 0, y: 0 }, view = { w: 640, h: 384, s: 1, dpr: 1, cssW: 0, cssH: 0, reserve: 0 };
  var stats, particles = [], stopIcons = [], curSec = -1, celebration = null, gameT = 0, quizGate = null;
  var SIM = false, simEv = [], simStop = false, botMode = false;

  function tileAt(x, y) {
    if (P && P.zone >= 0) return zoneTile(L.cx[P.zone], x, y);
    if (x < 0 || x >= L.W) return 1;
    if (y < 0) return (L.sky && y >= -L.skyH) ? L.sky[(y + L.skyH) * L.W + x] : 0;
    if (y >= ROWS) return 0;
    return L.grid[y * L.W + x];
  }
  function inSkyCols(px) { var c = Math.floor(px / TILE); return !!L.sky && c >= L.skyX0 && c <= L.skyX1; }
  function solidAt(px, py) { return SOLID[tileAt(Math.floor(px / TILE), Math.floor(py / TILE))] === 1; }
  // P-7: zdarzenia gry → haptyka (QHaptic milknie bez API, przy reduced-motion i po wyłączeniu „Wibracji”)
  var HAPTIC_EV = { hurt: 'hit', fall: 'hit', bump: 'hit', hidden: 'gameSticker' };
  function ev(name) { if (SIM) { simEv.push(name); return; } if (HAPTIC_EV[name] && window.QHaptic) QHaptic.pulse(HAPTIC_EV[name]); }

  function newPlayer() {
    var hearts = clamp(D.hearts + prog.missions, D.hearts, D.cap);
    return { x: 3 * TILE, y: GROUND * TILE, vx: 0, vy: 0, w: 22, h: 48, onGround: false, facing: 1, coyote: 0, jumpBuf: 0, airJumps: 0,
      inv: 0, hurtT: 0, nap: 0, land: 0, phase: 0, t: 0, hearts: hearts, startHearts: hearts, safe: { x: 3 * TILE, y: GROUND * TILE }, safeT: 0,
      checkpoint: { x: 3 * TILE, y: GROUND * TILE }, ride: -1, under: 0, power: null, fly: 0, zip: -1, zv: 0, zipCool: 0, cart: -1, onRaft: -1, glow: 0,
      zone: -1, room: -1, roomPending: false, roomEntry: null, bag: [], climb: false, climbCool: 0, ladT: 0 };
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
    if (P.zone >= 0) updateZone(dt); else updateEntities(dt);
    if (!SIM) updateParticles(dt);
    updateCamera(dt);
    var si = P.zone >= 0 ? curSec : L.sec[clamp(Math.floor(P.x / TILE), 0, L.W - 1)];
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
          if (m.x >= m.endX) { m.x = m.endX; m.active = false; m.done = true; if (P.onRaft === i) P.onRaft = -1; toast(PT('page.game.t.raft_end', 'Brzeg! Wysiadamy.')); }
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
    var inZ = P.zone >= 0;
    for (var pi = 0; pi < (inZ ? 0 : L.plaques.length); pi++) {
      var pq = L.plaques[pi];
      if (!pq.solved && Math.abs(P.x - pq.x) < 26 && Math.abs(P.y - pq.y) < 10 && input.jumpPressed && !SIM && state === 'play') { input.jumpPressed = false; if (pq.kind === 'carpet') openCarpet(pq); else openMosaic(pq); return; }
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
    var climbing = inZ && updateClimb(dt, ax);
    if (P.climb) P.vx = 0;
    if (!climbing) {
    if (input.jumpPressed) { P.jumpBuf = .13; input.jumpPressed = false; }
    if (P.jumpBuf > 0) P.jumpBuf -= dt;
    if (P.onGround) { P.coyote = .1; P.airJumps = power === 'doublejump' ? 1 : 0; } else P.coyote -= dt;
    if (P.jumpBuf > 0 && P.hurtT <= 0) {
      if (P.coyote > 0) { P.vy = -JUMP_V; P.coyote = 0; P.jumpBuf = 0; P.onGround = false; P.ride = -1; sfx('jump'); }
      else if (P.airJumps > 0) { P.vy = -JUMP_V * .9; P.airJumps--; P.jumpBuf = 0; sfx('jump2'); puff(P.x, P.y, 6, '#fff'); }
    }
    if (power === 'balloon') { // balonik: trzymaj skok — w górę, puść — powoli w dół
      P.fly -= (P.zone < 0 && P.y < 0 && inSkyCols(P.x)) ? dt * .5 : dt; // w strefie nieba balonik trzyma dłużej (dzieci mają czas na lot do komnaty)
      if (P.fly <= 0) { setPower(null); toast(PT('page.game.t.balloon_gone', 'Balonik odleciał.')); }
      else if (!P.onGround || input.jump) { var tvy = input.jump ? -175 : 75; P.vy += (tvy - P.vy) * Math.min(1, dt * 4); var capY = (P.zone < 0 && inSkyCols(P.x)) ? -L.skyH * TILE + 8 : 8; if (P.zone < 0 && P.y - P.h < capY && P.vy < 0) P.vy = 0; }
    }
    if (power !== 'balloon' || P.fly <= 0) {
      if (!input.jump && P.vy < -260) P.vy = -260;
      P.vy += G * dt;
    }
    if (power === 'glide' && input.jump && P.vy > 90) P.vy = 90;
    }
    if (P.vy > MAX_FALL) P.vy = MAX_FALL;
    var wind = inZ ? (P.onGround && P.under === 12 ? -L.cx[P.zone].conv : P.onGround && P.under === 13 ? L.cx[P.zone].conv : 0) : windAt(P.x) * (P.onGround ? .5 : 1);

    // ruch w poziomie
    P.x += (P.vx + wind) * dt;
    var hw = P.w / 2, top = P.y - P.h, bot = P.y;
    var dir = P.vx + wind;
    if (dir > 0) {
      var cx = Math.floor((P.x + hw) / TILE);
      for (var ry = Math.floor((top + 2) / TILE); ry <= Math.floor((bot - 2) / TILE); ry++)
        if (SOLID[tileAt(cx, ry)]) { if (inZ) wallTouch(cx, ry); P.x = cx * TILE - hw - .01; P.vx = Math.min(P.vx, 0); break; }
    } else if (dir < 0) {
      cx = Math.floor((P.x - hw) / TILE);
      for (ry = Math.floor((top + 2) / TILE); ry <= Math.floor((bot - 2) / TILE); ry++)
        if (SOLID[tileAt(cx, ry)]) { if (inZ) wallTouch(cx, ry); P.x = (cx + 1) * TILE + hw + .01; P.vx = Math.max(P.vx, 0); break; }
    }
    // bramy z pytaniami i drzwi z płytą
    for (var i = 0; i < (inZ ? 0 : L.gates.length); i++) {
      var gt = L.gates[i];
      if (gt.open || Math.abs(gt.x - P.x) > 80) continue;
      if (P.x + hw > gt.x + 2 && P.x - hw < gt.x + 30) { P.x = gt.x + 2 - hw; P.vx = Math.min(P.vx, 0); }
      if (P.x + hw >= gt.x - 2 && P.x < gt.x && P.onGround && state === 'play') { openQuiz(gt); return; }
    }
    for (i = 0; i < (inZ ? 0 : L.minis.length); i++) {
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
        if (SOLID[tv] || (ONEWAY[tv] && prevBot <= rowTop + .5) || (tv === 10 && !P.climb && prevBot <= rowTop + .5 && !climbTile(tileAt(cc, row - 1)))) {
          if (!wasGround && P.vy > 300) { P.land = 1; if (P.vy > 500) puff(P.x, rowTop, 4, 'rgba(255,255,255,.8)'); }
          if (tv === 8 && !wasGround && P.vy > 150) openChest(cc, row);
          P.y = rowTop; P.vy = 0; P.onGround = true;
          P.under = tileAt(Math.floor(P.x / TILE), row) || tv;
          if (tv === 4) touchCrumble(cc, row);
          if (cc === c0 && tileAt(c1, row) === 4) touchCrumble(c1, row);
          break;
        }
      }
      if (!P.onGround && !inZ) for (var mi = 0; mi < L.movers.length; mi++) {
        var m = L.movers[mi];
        if (Math.abs(m.x - P.x) > 200) continue;
        if (P.x + hw - 2 > m.x && P.x - hw + 2 < m.x + m.w && prevBot <= m.y - m.dy + 1 && P.y >= m.y) {
          P.y = m.y; P.vy = 0; P.onGround = true; P.ride = mi; P.under = 1;
          if (m.ax === 'raft' && !m.done && P.onRaft < 0) { P.onRaft = mi; if (!m.active) { m.active = true; toast(PT('page.game.t.raft', 'Spływ! ← → steruje tratwą, skacz nad skałami')); ev('raft'); } }
          break;
        }
      }
      if (!inZ) L.springs.forEach(function (sp) {
        if (Math.abs(P.x - sp.x) < 20 && prevBot <= sp.y - 12 && P.y >= sp.y - 14) { P.y = sp.y - 14; P.vy = -SPRING_V; P.onGround = false; sp.squash = 1; sfx('spring'); }
      });
    } else {
      var rowT = Math.floor((P.y - P.h) / TILE);
      for (cc = c0; cc <= c1; cc++) if (SOLID[tileAt(cc, rowT)]) { if (tileAt(cc, rowT) === 8) openChest(cc, rowT); P.y = (rowT + 1) * TILE + P.h; P.vy = 0; break; }
    }
    if (P.climb && P.onGround) P.climb = false;
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
    if (P.zipCool <= 0 && !inZ) for (var zi = 0; zi < L.zips.length; zi++) {
      var z = L.zips[zi];
      if (P.x > z.x0 - 4 && P.x < z.x1 - 24 && (P.vy >= 0 || P.onGround)) {
        var cy = zipY(z, P.x), head = P.y - P.h;
        if (head - 10 <= cy && head + 16 >= cy) { P.zip = zi; P.zv = Math.max(170, Math.abs(P.vx)); P.ride = -1; sfx('spring'); ev('zip'); return; }
      }
    }
    // wagonik
    for (var ci = 0; ci < (inZ ? 0 : L.carts.length); ci++) {
      var ct = L.carts[ci];
      if (!ct.active && !ct.done && Math.abs(P.x - ct.x) < 24 && Math.abs(P.y - ct.y) < 30) {
        P.cart = ci; ct.active = true; ct.s = 0; P.vx = 0; ev('cart'); toast(PT('page.game.t.cart', 'Wagonik! Skok = zwrotnica na tajny tor')); sfx('gate'); return;
      }
    }

    // bezpieczne miejsce do powrotu po upadku
    P.safeT -= dt;
    if (P.onGround && P.ride < 0 && P.safeT <= 0 && solidAt(P.x - hw - 6, P.y + 4) && solidAt(P.x + hw + 6, P.y + 4) && !nearHazard()) { P.safe = { x: P.x, y: P.y }; P.safeT = .3; }
    var inWater = tileAt(Math.floor(P.x / TILE), Math.floor((P.y - 6) / TILE)) === 3;
    if (P.y > (inZ ? L.cx[P.zone].H : ROWS) * TILE + 50 || inWater) fallOut(inWater);
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
    if (c.locked) { toast(c.lock === 'carpet' ? PT('page.game.t.chest_carpet', 'Zamknięta. Ułóż kwiatowy dywan obok!') : PT('page.game.t.chest_locked', 'Zamknięta. Ułóż mozaikę na tablicy obok!')); return; }
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
    P.zone = P.checkpoint.zone != null ? P.checkpoint.zone : -1; P.climb = false; P.room = -1; cam.room = -1;
    if (P.zone >= 0) P.roomEntry = { x: P.checkpoint.x, y: P.checkpoint.y };
    P.x = P.checkpoint.x; P.y = P.checkpoint.y; P.vx = P.vy = 0; P.hearts = P.startHearts; P.inv = 2; P.ride = -1;
    P.safe = { x: P.x, y: P.y };
    resetMinis(); updateCamera(1); startWipe(P.x, P.y - 24);
    if (!SIM && P.zone < 0 && curSec >= 0) $('hudStop').textContent = fill(PT('page.game.hud.stop', 'Przystanek {n} z {m}'), { n: curSec + 1, m: L.sections.length }) + ' · ' + stopName(curSec);
    updateHUD(); toast(PT('page.game.t.rested', 'Quo odpoczął. Dasz radę!'));
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
    resetRaft(); P.climb = false;
    var back = P.zone >= 0 && P.roomEntry ? P.roomEntry : P.safe; // w komnatach: wejście do komnaty
    P.x = back.x; P.y = back.y; P.vx = P.vy = 0; P.inv = 1.6; P.ride = -1; startWipe(P.x, P.y - 24);
    toast(water ? PT('page.game.t.splash', 'Plusk! Woda jest zimna. Jeszcze raz!') : PT('page.game.t.oops', 'Ups! Spróbuj jeszcze raz.'));
  }
  function hurt(fromX, forward) {
    if (P.inv > 0 || P.nap > 0) return;
    P.hearts--; P.inv = 1.6; P.hurtT = .35; ev('hurt');
    if (P.power) { // moc wypada i miga przez 2 s — można ją złapać z powrotem
      if (P.zone >= 0) L.cx[P.zone].items.push({ k: 'pu', kind: P.power, fly: P.fly, x: P.x + (P.x < fromX ? -40 : 40), y: P.y - 30, room: P.room, taken: false, life: 2.2, delay: .45 });
      else L.items.push({ type: 'pu', kind: P.power, fly: P.fly, x: P.x, y: P.y - 30, vy: -320, vx: (P.x < fromX ? -1 : 1) * 90, alive: true, life: 2.2, delay: .45 });
      setPower(null); toast(PT('page.game.t.power_lost', 'Ojej, moc wypadła! Złap ją!'));
    }
    P.climb = false;
    P.vx = forward ? 280 : (P.x < fromX ? -1 : 1) * 260; P.vy = -320; P.onGround = false; P.ride = -1;
    sfx('hit'); updateHUD();
    if (P.hearts <= 0) startNap();
  }
  function spikeHit(fromX) { if (P.inv > 0) return; hurt(fromX); P.vy = -460; }
  function bump(fromX) {
    if (P.hurtT > 0) return;
    P.hurtT = .3; P.vx = (P.x < fromX ? -1 : 1) * 330; P.vy = -260; P.onGround = false; P.ride = -1; sfx('bump'); ev('bump');
  }
  function startNap() { P.nap = 1.4; P.vx = 0; P.vy = 0; ev('nap'); toast(PT('page.game.t.nap', 'Quo musi chwilę odpocząć…')); }

  function addCoins(n, x, y) {
    stats.coins += n; updateHUD();
    if (x != null && !SIM) { for (var i = 0; i < Math.min(n, 8); i++) particles.push({ x: x, y: y, vx: (Math.random() - .5) * 220, vy: -150 - Math.random() * 200, life: .7, max: .7, col: i % 2 ? '#FFC629' : '#FFE48A', size: 4.5, g: 900, kind: 'star' }); popText(x, y - 12, '+' + n); }
  }

  function hiddenToast(S) {
    if (S.hidN === 3) toast(fill(PT('page.game.t.hidden', 'Zagubiona naklejka! {n} z 3'), { n: S.hidden }));
    else toast(fill(PT('page.game.t.hidden_n', 'Zagubiona naklejka! {n} z {m}'), { n: S.hidden, m: S.hidN }));
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
      if (d < 26 && P.nap <= 0) { c.taken = true; stats.coins++; updateHUD(); sfx('coin'); sparkle(c.x, c.y); popText(c.x, c.y - 8, '+1'); }
    }
    // zagubione naklejki
    L.hidden.forEach(function (h) {
      if (h.taken || P.nap > 0 || h.zone != null) return;
      var dx = P.x - h.x, dy = (P.y - 24) - h.y;
      if (dx * dx + dy * dy < 30 * 30) {
        h.taken = true; L.sections[h.sec].hidden++; stats.hiddenTotal++; ev('hidden'); updateHUD(); sfx('fanfare'); sparkle(h.x, h.y); sparkle(h.x, h.y);
        hiddenToast(L.sections[h.sec]);
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
        if (it.type === 'pu') { setPower(it.kind, it.fly); sfx('fanfare'); toast(fill(PT('page.game.t.power', 'Moc: {name}'), { name: POWER[it.kind].name })); }
        else if (it.type === 'firefly') { P.glow = Math.min(P.glow + 70, 210); if (TER[secAt(it.x).terrain].sp) stats.coins++, updateHUD(); sfx('coin'); sparkle(it.x, it.y); }
        else if (it.type === 'hat') { collectHat(it.kind); }
      }
    });
    var TR = L.treasure;
    if (TR && P.nap <= 0 && Math.abs(P.x - TR.x) < 30 && Math.abs(P.y - TR.y) < 24) {
      if (!TR.open) { TR.open = true; ev('treasure'); if (!SIM) startTreasure(TR); }
      else if (!TR.seen && !SIM) { TR.seen = true; toast(PT('page.game.t.treasure_again', 'Skarb Quo już jest w albumie!')); }
    }
    if (P.glow > 0) P.glow = Math.max(0, P.glow - 5 * dt);
    L.stands.forEach(function (st) { // stojak z balonikami (Spello, belvedere): balonik dla każdego, kto stanie obok
      if (P.nap <= 0 && P.onGround && Math.abs(P.x - st.x) < 40 && Math.abs(P.y - st.y) < 8 && (P.power !== 'balloon' || P.fly < 6)) {
        setPower('balloon'); ev('stand'); sfx('fanfare');
        if (!st.told) { st.told = true; toast(PT('page.game.t.stand', 'Balonik! Trzymaj skok i leć nad doliną.'), 3400); }
      }
    });
    L.carts.forEach(function (c) { if (c.done && !c.active && P.onGround && Math.abs(P.x - c.sx) < 60 && P.cart < 0) { c.done = false; c.s = 0; c.branch = 0; c.x = c.sx; c.y = c.main[0][1]; } });
    L.chests.forEach(function (ch) {
      if (!ch.open && Math.abs(P.x - ch.x) < 24 && Math.abs(P.y - ch.y) < 30) { ch.open = true; addCoins(10, ch.x, ch.y - 16); sfx('fanfare'); toast(PT('page.game.t.stash', 'Tajna kryjówka! +10 kamyczków')); }
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
    for (var di = 0; di < L.cxDoors.length; di++) { // drzwi do komnat
      var dd = L.cxDoors[di];
      if (P.onGround && P.nap <= 0 && state === 'play' && Math.abs(P.x - dd.x) < 14 && Math.abs(P.y - dd.y) < 8) { enterZone(dd.zi); return; }
    }
  }

  function updateMinis(dt) {
    L.minis.forEach(function (m) {
      if (m.type === 'boulder') {
        if (m.done) return;
        if (!m.active) { if (P.x > m.trig && P.x < m.endX && P.nap <= 0) { m.active = true; m.x = P.x - 340; m.y = GROUND * TILE - m.r; toast(PT('page.game.t.boulder', 'Uciekaj przed głazem!')); sfx('gate'); ev('boulder'); } else return; }
        m.x += m.v * dt; m.rot += m.v * dt / m.r;
        var best = null;
        for (var cx = Math.floor((m.x - m.r * .5) / TILE); cx <= Math.floor((m.x + m.r * .5) / TILE); cx++)
          for (var r = 2; r < ROWS; r++) { var v = tileAt(cx, r); if (SOLID[v] || ONEWAY[v]) { if (best == null || r < best) best = r; break; } }
        if (best != null) m.y = lerp(m.y, best * TILE - m.r, Math.min(1, dt * 10));
        if (m.x + m.r >= m.endX) { m.done = true; m.active = false; addCoins(3, m.x, m.y); if (!SIM) puff(m.x, m.y, 14, '#A9B2BF'); sfx('pop'); toast(PT('page.game.t.boulder_end', 'Uff! Głaz rozbity.')); return; }
        var nx = clamp(m.x, P.x - P.w / 2, P.x + P.w / 2), ny = clamp(m.y, P.y - P.h, P.y);
        if ((m.x - nx) * (m.x - nx) + (m.y - ny) * (m.y - ny) < m.r * m.r && P.nap <= 0) {
          var had = P.inv <= 0; hurt(m.x, true); if (had) m.x = P.x - 300;
        }
      } else if (m.type === 'door') {
        var onPlate = P.onGround && Math.abs(P.x - m.plateX) < 22;
        if (onPlate && !m.on && !m.done) { m.open = true; m.t = m.T; sfx('gate'); ev('plate'); if (!m.toasted) { toast(PT('page.game.t.door_open', 'Brama otwarta! Zdążysz, zanim się zamknie?')); m.toasted = 1; } }
        m.on = onPlate;
        if (m.open && !m.done) {
          m.t -= dt;
          if (P.x - P.w / 2 > m.x + 34) { m.done = true; }
          else if (m.t <= 0) { m.open = false; sfx('no'); if (P.x + P.w / 2 > m.x && P.x - P.w / 2 < m.x + 32) P.x = m.x - P.w / 2 - 2; }
        }
        m.lift = clamp(m.lift + (m.open ? dt * 4 : -dt * 4), 0, 1);
      } else if (m.type === 'bridge') {
        var onBridge = P.onGround && P.x > m.x0 && P.x < m.x1 && P.y <= GROUND * TILE + 1;
        if (m.wave < 0 && onBridge) { m.wave = m.x0 - 40; ev('bridge'); toast(PT('page.game.t.bridge', 'Most się wali — biegnij!')); }
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

  function puff(x, y, n, col) { if (SIM) return; if (reduceMotion) n = Math.min(n, 3); for (var i = 0; i < n; i++) particles.push({ x: x, y: y, vx: (Math.random() - .5) * 160, vy: -Math.random() * 120, life: .5, max: .5, col: col, size: 5 + Math.random() * 4, g: 120, kind: 'dust' }); }
  function sparkle(x, y) { if (SIM) return; for (var i = 0; i < (reduceMotion ? 2 : 7); i++) { var a = i / 7 * Math.PI * 2; particles.push({ x: x, y: y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, life: .4, max: .4, col: i % 2 ? '#FFF4CF' : '#FFE48A', size: 4, g: 0, kind: 'star' }); } particles.push({ x: x, y: y, vx: 0, vy: 0, life: .3, max: .3, col: 'rgba(255,244,207,.9)', size: 5, g: 0, kind: 'ring' }); }
  function splash(x, y, col) { if (SIM) return; for (var i = 0; i < 7; i++) particles.push({ x: x, y: y, vx: (Math.random() - .5) * 200, vy: -100 - Math.random() * 180, life: .5, max: .5, col: col || '#8FD0E8', size: 3 + Math.random() * 2, g: 1100 }); sfx('drip'); }
  function debris(x, y) { for (var i = 0; i < 5; i++) particles.push({ x: x + (Math.random() - .5) * 28, y: y + 4, vx: (Math.random() - .5) * 60, vy: Math.random() * 60, life: .7, max: .7, col: '#8C6A43', size: 6, g: 1400 }); }
  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i]; p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    }
    if (particles.length > 180) particles.splice(0, particles.length - 180); // limit (telefony)
  }

  function updateCamera(dt) {
    if (P.zone >= 0) { zoneCamera(dt); return; }
    var tx = clamp(P.x - view.w * .38, 0, L.W * TILE - view.w);
    cam.x = lerp(cam.x, tx, Math.min(1, dt * 8));
    var levelH = ROWS * TILE, bottomY = levelH + view.reserve, ty;
    if (view.h >= bottomY) ty = bottomY - view.h;
    else ty = clamp(P.y - view.h * .64, 0, bottomY - view.h);
    // Strefa nieba (Skarb Quo): kamera jedzie w górę tylko za balonikiem nad sufitem poziomu albo gdy Quo już jest wysoko w chmurach
    // (tam bez balonika nie da się wejść), więc zwykła gra nigdy nie pokazuje komnaty.
    if (L.sky && inSkyCols(P.x) && ((P.power === 'balloon' && P.y < 2 * TILE) || P.y < -6 * TILE)) ty = Math.min(ty, P.y - view.h * .55);
    cam.y = lerp(cam.y, ty, Math.min(1, dt * 5));
  }

  /* ---------- 7. Rysowanie świata ---------- */
  var cv = $('game'), ctx = cv.getContext('2d'), shade = document.createElement('canvas'), sctx = shade.getContext('2d');

  function resize() {
    var w = window.innerWidth, h = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    shade.width = Math.round(w / 3); shade.height = Math.round(h / 3);
    var padOn = !$('pad').hidden || padWanted();
    // Poziomo z przyciskami: dół ekranu (pod lewymi przyciskami) zostaje na sam grunt — ścieżka Quo jest nad padem.
    var padL = padOn && w > h && h < 560 ? Math.round(h * .17) : 0;
    var s = padL ? Math.min((h - padL) / (12.5 * TILE), w / (10 * TILE)) : Math.min(h / ((w > h ? 13 : 12) * TILE), w / (10 * TILE));
    view.s = s; view.dpr = dpr; view.cssW = w; view.cssH = h;
    view.w = w / s; view.h = h / s; LC.k = s * dpr;
    view.reserve = (h > w && padOn) ? 150 / s : padL / s;
    LC.vh = Math.round(view.h * 10 + view.reserve * 1000);
    if (L && P) updateCamera(1);
  }
  function padWanted() { return ('ontouchstart' in window) || (window.matchMedia && matchMedia('(pointer: coarse)').matches) || window.innerWidth < 900; }

  function sectionBlend(px) {
    var i = L.sec[clamp(Math.floor(px / TILE), 0, L.W - 1)], S0 = L.sections[i], secPx = (S0.x1 - S0.x0) * TILE, d = px - S0.x0 * TILE, BL = 160;
    if (d < BL && i > 0) { var m = (d + BL) / (2 * BL); return { a: L.sections[i - 1].terrain, b: L.sections[i].terrain, m: m }; }
    if (d > secPx - BL && i < L.sections.length - 1) { m = (d - (secPx - BL)) / (2 * BL); return { a: L.sections[i].terrain, b: L.sections[i + 1].terrain, m: m }; }
    return { a: L.sections[i].terrain, b: null, m: 0 };
  }

  var RSX = 0, RSY = 0;
  function render() {
    if (P.zone >= 0 && state !== 'celebrate') { renderZone(); return; }
    var k = view.s * view.dpr, W = view.w, H = view.h;
    shakeStep(); cam.x += RSX; cam.y += RSY;
    try {
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.imageSmoothingEnabled = true;
      var bl = sectionBlend(cam.x + W / 2); TOD = todAt(cam.x + W / 2);
      drawBackground(ctx, bl.a, cam.x, cam.y, W, H, gameT);
      if (bl.b && bl.m > 0) { ctx.globalAlpha = bl.m; drawBackground(ctx, bl.b, cam.x, cam.y, W, H, gameT); ctx.globalAlpha = 1; }
      ctx.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k);
      drawSkyZone();
      drawCaveMouths();
      drawWind(true);
      drawTiles();
      drawTreasure();
      drawTracks();
      drawZips();
      drawMovers();
      drawLandmarks();
      drawCxDoors();
      drawGates();
      drawMinis();
      drawStands();
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
      drawPops();
      drawWind(false);
      var cw = caveWeight(P.x);
      if (cw > 0 && state !== 'celebrate') drawDarkness(cw);
      if (state !== 'celebrate') drawGrade(bl.b && bl.m > .5 ? bl.b : bl.a);
      if (state === 'celebrate') renderCelebration();
      drawWipe();
    } finally { cam.x -= RSX; cam.y -= RSY; }
  }
  function shakeStep() { // wstrząs ekranu (bez prefers-reduced-motion): przesunięcie tylko do rysowania
    RSX = RSY = 0; if (flash > 0) flash -= vDt;
    if (shake.t > 0) { shake.t -= vDt; var m = shake.m * Math.max(0, shake.t / shake.d); RSX = (Math.random() * 2 - 1) * m; RSY = (Math.random() * 2 - 1) * m; }
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
    L.hidden.forEach(function (c) { if (!c.taken && c.zone == null) hole(c.x, c.y, 34); });
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
    var k = view.s * view.dpr, warm = lantern || curHat === 'helmet', fl = reduceMotion ? 1 : 1 + Math.sin(gameT * 7) * .03 + Math.sin(gameT * 13) * .02;
    ctx.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k);
    if (warm) { ctx.globalCompositeOperation = 'lighter'; var R2 = R * .55 * fl;
    var gg = ctx.createRadialGradient(P.x, P.y - 24, 6, P.x, P.y - 24, R2);
    gg.addColorStop(0, 'rgba(255,205,130,.24)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(P.x, P.y - 24, R2, 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
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
  /* --- Kafle: statyczne kafle świata rysujemy raz do „kawałków” (8 kolumn × wysokość widoku) w rozdzielczości ekranu,
     potem tylko je kopiujemy. Na bieżąco: woda, kruche półki, skrzynie, połysk mokrej skały, chmurki strefy nieba.
     Kawałek odświeża się sam, gdy zmieni się układ jego kafli (podpis z siatki). */
  var INK = '#1B1630', DEPTH_A = {};
  var CHK = { map: {}, n: 0, W: 8 };
  function staticV(v) { return v === 1 || v === 5 || v === 6 || v === 2 || v === 7; }
  function chunkRows() { var r = camYRange(); return [Math.floor(Math.min(0, r[0]) / TILE) - 1, Math.ceil((Math.max(r[1], 0) + view.h) / TILE) + 1]; }
  function chunkSig(i) {
    var s = 7, x0 = Math.max(0, i * CHK.W - 2), x1 = Math.min(L.W - 1, i * CHK.W + CHK.W + 1);
    for (var y = 0; y < ROWS; y++) for (var x = x0; x <= x1; x++) { var v = L.grid[y * L.W + x]; s = (Math.imul(s, 31) + (staticV(v) ? v + 1 : 0)) | 0; }
    return s;
  }
  function getChunk(i, rr, build) {
    var e = CHK.map[i], k = LC.k;
    if (e && e.lv === L && e.k === k && e.q0 === rr[0] && e.r1 === rr[1] && e.sig === chunkSig(i)) { e.use = ++CHK.n; return e; }
    if (!build) return null;
    var PAD = 24, X0 = i * CHK.W * TILE, cv = (e && e.cv) || document.createElement('canvas');
    var q0 = rr[0], rTop = rr[1]; // kawałek obejmuje tylko wiersze z kaflami (nad nimi samo niebo — szkoda pikseli do kopiowania)
    for (var xx = Math.max(0, i * CHK.W - 1); xx <= Math.min(L.W - 1, (i + 1) * CHK.W); xx++) for (var yy = 0; yy < Math.min(rTop - rr[0] + 1, ROWS); yy++) if (staticV(L.grid[yy * L.W + xx])) { rTop = Math.min(rTop, yy === 0 ? rr[0] : yy - 1); break; }
    rr = [Math.max(rr[0], rTop), rr[1]];
    cv.width = Math.ceil((CHK.W * TILE + PAD * 2) * k); cv.height = Math.max(1, Math.ceil((rr[1] - rr[0] + 1) * TILE * k));
    var c = cv.getContext('2d'), save = ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
    c.setTransform(k, 0, 0, k, -(X0 - PAD) * k, -rr[0] * TILE * k); c.imageSmoothingEnabled = true;
    ctx = c;
    try { for (var x = Math.max(0, i * CHK.W - 1); x <= Math.min(L.W - 1, (i + 1) * CHK.W); x++) for (var y = rr[0]; y <= rr[1]; y++) { snapTile(c, x * TILE, y * TILE, X0 - PAD, rr[0] * TILE, k); tileCell(x, y, 1); } }
    finally { ctx = save; }
    // pasy wierszy z treścią: puste wiersze (samo powietrze) pomijamy przy kopiowaniu
    var has = function (r) { var rc = clamp(r, 0, ROWS - 1); for (var x2 = Math.max(0, i * CHK.W - 1); x2 <= Math.min(L.W - 1, (i + 1) * CHK.W); x2++) if (staticV(L.grid[rc * L.W + x2])) return true; return false; };
    var bands = [], cur = null;
    for (var r = rr[0]; r <= rr[1]; r++) { var on = has(r) || has(r + 1) || has(r - 1); if (on) { if (cur && cur[1] === r - 1) cur[1] = r; else bands.push(cur = [r, r]); } }
    bands = bands.map(function (b) { var a = Math.max(0, Math.floor((b[0] - rr[0]) * TILE * k) - 1), z = Math.min(cv.height, Math.ceil((b[1] - rr[0] + 1) * TILE * k) + 1); return [a, z]; });
    e = { cv: cv, lv: L, k: k, q0: q0, r0: rr[0], r1: rr[1], sig: chunkSig(i), use: ++CHK.n, X0: X0, PAD: PAD, bands: bands };
    CHK.map[i] = e;
    var keys = Object.keys(CHK.map), cap = Math.ceil(view.w / (CHK.W * TILE)) + 5;
    if (keys.length > cap) { keys.sort(function (a, b) { return CHK.map[a].use - CHK.map[b].use; }); for (var j = 0; j < keys.length - cap; j++) delete CHK.map[keys[j]]; }
    return e;
  }
  function drawTiles() {
    var c0 = Math.floor(cam.x / TILE) - 1, c1 = Math.ceil((cam.x + view.w) / TILE) + 1;
    var r0 = Math.floor(cam.y / TILE) - 1, r1 = Math.ceil((cam.y + view.h) / TILE) + 1, rr = chunkRows(), CW = CHK.W * TILE;
    var i0 = Math.max(0, Math.floor(cam.x / CW)), i1 = Math.min(Math.floor((L.W - 1) / CHK.W), Math.floor((cam.x + view.w) / CW));
    for (var i = i0; i <= i1; i++) {
      var e = getChunk(i, rr, true), k = e.k;
      var dx = Math.round((e.X0 - e.PAD - cam.x) * k), dy = Math.round((e.r0 * TILE - cam.y) * k); // 1:1, na całych pikselach
      ctx.setTransform(1, 0, 0, 1, 0, 0); var sx0 = Math.max(0, -dx), sx1 = Math.min(e.cv.width, cv_w() - dx), sy0 = Math.max(0, -dy), sy1 = Math.min(e.cv.height, cv_h() - dy);
      ctx.imageSmoothingEnabled = false; // kopia 1:1 bez filtrowania — najszybsza ścieżka
      if (sx1 > sx0) for (var bi = 0; bi < e.bands.length; bi++) { var ya = Math.max(sy0, e.bands[bi][0]), yz = Math.min(sy1, e.bands[bi][1]); if (yz > ya) ctx.drawImage(e.cv, sx0, ya, sx1 - sx0, yz - ya, dx + sx0, dy + ya, sx1 - sx0, yz - ya); }
      ctx.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k); ctx.imageSmoothingEnabled = true;
    }
    // z wyprzedzeniem: jeden kawałek na klatkę (w stronę ruchu), żeby wejście w nowy fragment nie szarpało
    var nx = P.vx < -20 ? i0 - 1 : i1 + 1; if (nx >= 0 && nx * CHK.W < L.W && !getChunk(nx, rr, false)) getChunk(nx, rr, true);
    wq = null;
    for (var x = Math.max(0, c0); x <= Math.min(L.W - 1, c1); x++) for (var y = r0; y <= r1; y++) tileCell(x, y, y < rr[0] || y > rr[1] ? 3 : 2);
  }
  function snapTile(c, px, py, ox, oy, k) { // kafel dokładnie na granicach pikseli: bez jasnych szwów między kaflami
    var X0 = Math.round((px - ox) * k), X1 = Math.round((px + TILE - ox) * k), Y0 = Math.round((py - oy) * k), Y1 = Math.round((py + TILE - oy) * k), sx = (X1 - X0) / TILE, sy = (Y1 - Y0) / TILE;
    c.setTransform(sx, 0, 0, sy, X0 - px * sx, Y0 - py * sy);
  }
  var wq = null; // gradient wody (jeden na klatkę)
  function sol(x, y) { var v = L.grid[y * L.W + x]; return v === 1 || v === 5 || v === 6; }
  /* mode 1 = statyczne (do kawałka, z cieniowaniem głębi i ozdobami), 2 = ruchome (na bieżąco), 3 = wszystko na bieżąco */
  function tileCell(x, y, mode) {
    var Wd = L.W, tk = L.sections[L.sec[x]].terrain, T = TER[tk];
    if (y < 0 && L.sky && y >= -L.skyH && x >= L.skyX0 && x <= L.skyX1) { if (mode !== 1) drawSkyTile(x, y, L.sky[(y + L.skyH) * Wd + x]); return; }
    var ty = y < 0 ? 0 : y >= ROWS ? ROWS - 1 : y, v = L.grid[ty * Wd + x], solidLike = v === 1 || v === 5 || v === 6;
    var px = x * TILE, py = y * TILE, st = mode & 1, dy = mode & 2;
    if ((v === 8 || v === 9) && y === ty) { if (dy) drawChest(px, py, v === 9, L.chestList[L.chestAt[ty * Wd + x]]); return; }
    if (y < 0 && !solidLike) return;
    if (solidLike) {
      var up = y <= 0 ? tk === 'cave' : (y > ROWS ? true : sol(x, Math.min(ROWS - 1, y - 1)));
      var dn = (y < 0 || y + 1 >= ROWS) ? true : sol(x, y + 1);
      var lf = x > 0 ? sol(x - 1, ty) : true, rt = x < Wd - 1 ? sol(x + 1, ty) : true;
      if (st) {
        var depth = 0; if (up) { depth = 1; for (var d = 2; d <= 4; d++) { var yy = y - d + 1; if (yy <= 0 ? tk === 'cave' : sol(x, Math.min(ROWS - 1, yy - 1))) depth = d; else break; } }
        var h = hashXY(x, y);
        drawSolid(T, tk, px, py, !up, !dn && y < ROWS, !lf, !rt, h, depth);
        if (v === 5 && !up) { ctx.fillStyle = 'rgba(160,220,255,.7)'; ctx.fillRect(px, py, TILE, 3); ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(px + (hashXY(x, 1) % 20), py + 1, 8, 1.6); ctx.fillStyle = 'rgba(160,220,255,.35)'; ctx.fillRect(px + 4 + h % 12, py + 4, 2, 9 + h % 6); }
        if (v === 6) { ctx.strokeStyle = 'rgba(14,26,43,.16)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px + 10, py + 6); ctx.lineTo(px + 16, py + 14); ctx.lineTo(px + 12, py + 22); ctx.stroke(); }
        if (!up && y >= 0 && y < ROWS && ty > 0 && L.grid[(ty - 1) * Wd + x] === 0) drawProp(T, tk, px, py, h, !lf, !rt);
      }
      if (dy && v === 5 && !up && !reduceMotion) { // przesuwający się błysk na mokrej skale
        var gp = ((gameT * 40 + x * 37) % 160); if (gp < TILE) { ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect(px + gp, py, 5, 1.6); }
      }
    } else if (v === 2 && y === ty) { if (st) drawPlatform(T, tk, px, py, L.grid[ty * Wd + x - 1] === 2, L.grid[ty * Wd + x + 1] === 2); }
    else if (v === 4 && y === ty) { if (dy) drawCrumble(px, py, L.crumbles[L.crumbleAt[ty * Wd + x]]); }
    else if (v === 3) { if (dy) drawWater(px, py, x, y === ty && (y === 0 || L.grid[(y - 1) * Wd + x] !== 3), tk); }
    else if (v === 7 && y === ty) { if (st) drawSpikes(px, py, ty > 0 && sol(x, ty - 1), tk); }
  }
  function drawCrumble(px, py, c) {
    var sh = c && c.s === 1 ? (Math.sin(gameT * 60) * 1.5) : 0;
    ctx.fillStyle = INK; roundRect(ctx, px + sh - .5, py - .5, TILE + 1, 13, 3); ctx.fill();
    var g = ctx.createLinearGradient(0, py, 0, py + 11); g.addColorStop(0, '#D2A56C'); g.addColorStop(1, '#9A7040'); ctx.fillStyle = g; roundRect(ctx, px + 1 + sh, py + 1, TILE - 2, 9, 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(px + 2 + sh, py + 1.5, TILE - 4, 1.5);
    ctx.strokeStyle = '#5A3E22'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(px + 9 + sh, py + 1); ctx.lineTo(px + 13 + sh, py + 6); ctx.lineTo(px + 11 + sh, py + 10); ctx.moveTo(px + 22 + sh, py + 1); ctx.lineTo(px + 19 + sh, py + 9); ctx.stroke();
  }
  function drawWater(px, py, x, surf, tk) {
    if (!wq) { wq = ctx.createLinearGradient(0, 8 * TILE, 0, ROWS * TILE + 40); wq.addColorStop(0, tk === 'cave' ? 'rgba(60,170,190,.85)' : 'rgba(70,165,170,.85)'); wq.addColorStop(1, 'rgba(14,60,96,.95)'); }
    ctx.fillStyle = wq; ctx.fillRect(px, py + (surf ? 8 : 0), TILE + .5, TILE - (surf ? 8 : 0));
    if (!surf) return;
    var t = reduceMotion ? 0 : gameT, wv = Math.sin(t * 3 + x) * 2, wv2 = Math.sin(t * 3 + x + 1) * 2;
    ctx.fillStyle = 'rgba(150,225,225,.95)'; ctx.beginPath(); ctx.moveTo(px, py + 7 + wv); ctx.quadraticCurveTo(px + 16, py + 5 + (wv + wv2) / 2, px + TILE + .5, py + 7 + wv2); ctx.lineTo(px + TILE + .5, py + 11); ctx.lineTo(px, py + 11); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; var s1 = (t * 18 + x * 11) % TILE; ctx.fillRect(px + s1, py + 14 + Math.sin(t * 2 + x) * 1.5, 7, 1.6);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; var s2 = (t * 11 + x * 23 + 13) % TILE; ctx.fillRect(px + s2, py + 21, 5, 1.4);
  }
  function drawSpikes(px, py, hang, tk) {
    var light = tk === 'cave' ? '#D6EEFF' : '#F1ECE2', mid = tk === 'cave' ? '#8DB7DC' : '#B8AE9C';
    ctx.fillStyle = INK; ctx.beginPath();
    for (var i = 0; i < 4; i++) { if (hang) { ctx.moveTo(px + i * 8 - .8, py); ctx.lineTo(px + i * 8 + 4, py + 23); ctx.lineTo(px + i * 8 + 8.8, py); } else { ctx.moveTo(px + i * 8 - .8, py + TILE); ctx.lineTo(px + i * 8 + 4, py + 9); ctx.lineTo(px + i * 8 + 8.8, py + TILE); } }
    ctx.fill();
    for (i = 0; i < 4; i++) {
      var g = ctx.createLinearGradient(px + i * 8, 0, px + i * 8 + 8, 0); g.addColorStop(0, light); g.addColorStop(.5, light); g.addColorStop(.51, mid); g.addColorStop(1, mid); ctx.fillStyle = g; ctx.beginPath();
      if (hang) { ctx.moveTo(px + i * 8 + 1.4, py); ctx.lineTo(px + i * 8 + 4, py + 19); ctx.lineTo(px + i * 8 + 6.6, py); } else { ctx.moveTo(px + i * 8 + 1.4, py + TILE); ctx.lineTo(px + i * 8 + 4, py + 12.5); ctx.lineTo(px + i * 8 + 6.6, py + TILE); }
      ctx.fill();
    }
  }
  /* Kafel skały/ziemi: dawny wzór terenu + zaokrąglone narożniki, faktura, cień głębi (im głębiej, tym ciemniej),
     światło z lewej, cień z prawej, ciemniej pod nawisem, trawa z kępkami. Rysowany raz do kawałka. */
  function drawSolid(T, tk, x, y, top, bottom, left, right, h, depth) {
    var rTL = top && left, rTR = top && right, rad = 6, clip = rTL || rTR;
    if (clip) { ctx.save(); ctx.beginPath(); ctx.moveTo(x + (rTL ? rad : 0), y); ctx.lineTo(x + TILE - (rTR ? rad : 0), y); if (rTR) ctx.quadraticCurveTo(x + TILE, y, x + TILE, y + rad); ctx.lineTo(x + TILE, y + TILE + 24); ctx.lineTo(x, y + TILE + 24); ctx.lineTo(x, y + (rTL ? rad : 0)); if (rTL) ctx.quadraticCurveTo(x, y, x + rad, y); ctx.closePath(); ctx.clip(); }
    ctx.fillStyle = T.fill; ctx.fillRect(x, y, TILE, TILE);
    if (T.sp) {
      drawSolidSp(T, tk, x, y, top, h);
    } else if (T.reti) { // opus reticulatum: kamyczki ułożone w ukośną siateczkę
      ctx.fillStyle = T.speck;
      for (var dy = 0; dy < 2; dy++) for (var dx = 0; dx < 2; dx++) { var cx2 = x + 8 + dx * 16, cy2 = y + 8 + dy * 16; ctx.beginPath(); ctx.moveTo(cx2, cy2 - 7); ctx.lineTo(cx2 + 7, cy2); ctx.lineTo(cx2, cy2 + 7); ctx.lineTo(cx2 - 7, cy2); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x + 6, y + 3, 4, 2); ctx.fillRect(x + 22, y + 19, 4, 2);
    } else if (tk === 'stone' || tk === 'crypt') {
      var off = (y / TILE) % 2 ? 0 : 16;
      ctx.fillStyle = 'rgba(255,255,255,.14)'; if ((h >> 3) & 1) ctx.fillRect(x + off + 2, y + 2, 14, 13); if ((h >> 5) & 1) ctx.fillRect(x + (off + 18) % 32, y + 19, 14, 12);
      ctx.fillStyle = 'rgba(0,0,0,.06)'; if ((h >> 7) & 1) ctx.fillRect(x + (off + 18) % 32, y + 2, 14, 13);
      ctx.fillStyle = T.fillDk;
      ctx.fillRect(x, y + 15, TILE, 2); ctx.fillRect(x + off, y, 2, 15); ctx.fillRect(x + (off + 16) % 32, y + 17, 2, 15);
      ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(x, y + 17, TILE, 1); ctx.fillRect(x + off + 2, y, 1, 15);
      ctx.fillStyle = T.speck; ctx.fillRect(x + 4, y + 3, 6, 2);
    } else if (tk === 'cliff') {
      ctx.fillStyle = T.speck; ctx.fillRect(x, y + 8, TILE, 3); ctx.fillRect(x, y + 22, TILE, 2);
      ctx.fillStyle = 'rgba(255,240,215,.18)'; ctx.fillRect(x, y + 11, TILE, 1.5);
      ctx.fillStyle = T.fillDk; ctx.fillRect(x + (h % 20), y + 14, 7, 3); ctx.fillRect(x + ((h >> 6) % 22), y + 26, 5, 2);
    } else {
      ctx.fillStyle = T.speck;
      ctx.fillRect(x + (h % 24) + 2, y + ((h >> 5) % 22) + 4, 5, 4);
      ctx.fillRect(x + ((h >> 9) % 22) + 3, y + ((h >> 13) % 20) + 6, 3, 3);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + (h % 24) + 2, y + ((h >> 5) % 22) + 4, 5, 1.2);
      if (tk === 'cave' && h % 7 === 0) { ctx.fillStyle = 'rgba(160,220,255,.6)'; ctx.fillRect(x + (h % 26) + 2, y + 10, 3, 3); }
    }
    for (var s = 0; s < 3; s++) { var hh = (h >> (s * 4 + 2)) & 1023; ctx.fillStyle = s % 2 ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.09)'; ctx.fillRect(x + hh % 29, y + (hh >> 5) % 29, 2 + s % 2, 2); }
    if (depth > 0 && !T.ashlar) { // cień głębi: płynnie ciemniej w dół (mury z ciosów — bez, są równo oświetlone)
      var a0 = Math.min(.15, (depth - .5) * .035);
      ctx.fillStyle = DEPTH_A[Math.round(a0 * 100)] || (DEPTH_A[Math.round(a0 * 100)] = 'rgba(24,16,34,' + a0.toFixed(2) + ')'); ctx.fillRect(x, y, TILE, TILE);
    }
    if (left) { ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(x + 2, y, 3, TILE); }
    if (right) { ctx.fillStyle = 'rgba(20,14,30,.1)'; ctx.fillRect(x + TILE - 9, y, 9, TILE); ctx.fillRect(x + TILE - 5, y, 5, TILE); }
    if (bottom) { ctx.fillStyle = 'rgba(20,14,30,.12)'; ctx.fillRect(x, y + TILE - 10, TILE, 10); ctx.fillRect(x, y + TILE - 5, TILE, 5); }
    var ink = 'rgba(14,26,43,.4)';
    if (left) { ctx.fillStyle = ink; ctx.fillRect(x, y, 2, TILE); }
    if (right) { ctx.fillStyle = ink; ctx.fillRect(x + TILE - 2, y, 2, TILE); }
    var grassy = false;
    if (top && T.sp && drawTopSp(T, x, y, h)) { /* wierzch Spello narysowany */ }
    else if (top) {
      if (tk === 'valley' || tk === 'stone' || T.grass) {
        grassy = true;
        ctx.fillStyle = 'rgba(20,14,30,.22)'; ctx.beginPath(); for (var i = 0; i < 5; i++) { var bx = x + i * 7 - 2; ctx.moveTo(bx, y + 9); ctx.lineTo(bx + 3.5, y + 16 + ((h >> i) & 3)); ctx.lineTo(bx + 7.5, y + 9); } ctx.rect(x, y + 8, TILE, 3); ctx.fill();
        ctx.fillStyle = T.top; ctx.fillRect(x, y, TILE, 10); ctx.fillStyle = T.topHi; ctx.fillRect(x, y, TILE, 3.5); ctx.fillStyle = T.top; ctx.beginPath();
        for (i = 0; i < 5; i++) { bx = x + i * 7 - 2; ctx.moveTo(bx, y + 9); ctx.lineTo(bx + 3.5, y + 13 + ((h >> i) & 3)); ctx.lineTo(bx + 7.5, y + 9); }
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(x, y + 1, TILE, 1.5);
      } else {
        ctx.fillStyle = T.top; ctx.fillRect(x, y, TILE, 7);
        ctx.fillStyle = T.topHi; ctx.fillRect(x, y, TILE, 2.5);
        ctx.fillStyle = 'rgba(20,14,30,.2)'; ctx.fillRect(x, y + 7, TILE, 2);
        if (tk === 'cave') { ctx.fillStyle = 'rgba(190,235,255,.55)'; ctx.fillRect(x + h % 24, y + 1, 6, 1.2); ctx.fillRect(x + (h >> 4) % 26, y + 4, 3, 1); }
        if (tk === 'cliff') { ctx.fillStyle = T.fillDk; ctx.beginPath(); ell(ctx, x + 6 + h % 18, y + 7, 2.5, 1.6, 0); ell(ctx, x + 4 + (h >> 5) % 22, y + 8, 1.8, 1.2, 0); ctx.fill(); }
      }
    }
    if (clip) ctx.restore();
    if (top) { // obrys górnej krawędzi (naklejkowy kontur), z zaokrągleniem narożników
      ctx.strokeStyle = 'rgba(14,26,43,.5)'; ctx.lineWidth = 1.6; ctx.beginPath();
      if (rTL) { ctx.moveTo(x + .8, y + rad + 2); ctx.quadraticCurveTo(x + .8, y + .3, x + rad, y + .3); } else ctx.moveTo(x, y + .3);
      if (rTR) { ctx.lineTo(x + TILE - rad, y + .3); ctx.quadraticCurveTo(x + TILE - .8, y + .3, x + TILE - .8, y + rad + 2); } else ctx.lineTo(x + TILE, y + .3);
      ctx.stroke();
      if (grassy) { // kępki trawy wystające nad krawędź
        ctx.fillStyle = T.top; ctx.beginPath();
        for (i = 0; i < 3; i++) { var hb = (h >> (i * 3 + 1)) & 7; if (hb > 4) continue; var gx = x + 4 + i * 10 + hb; ctx.moveTo(gx - 2, y + 1); ctx.lineTo(gx - .5 + (hb & 1 ? 1.5 : -1.5), y - 3 - hb * .8); ctx.lineTo(gx + 1, y + 1); }
        ctx.fill();
        ctx.fillStyle = T.topHi; ctx.beginPath(); for (i = 0; i < 2; i++) { hb = (h >> (i * 4 + 9)) & 7; if (hb > 3) continue; gx = x + 9 + i * 12 + hb; ctx.moveTo(gx - 1.5, y + 1); ctx.lineTo(gx + 1, y - 4 - hb); ctx.lineTo(gx + 1.5, y + 1); } ctx.fill();
      }
    }
    if (bottom && tk === 'cave') { // nacieki pod nawisem: gradient do jasnego, mokrego czubka
      ctx.fillStyle = T.fill; ctx.beginPath();
      ctx.moveTo(x, y + TILE - .5); ctx.quadraticCurveTo(x + 7, y + TILE + 2, x + 8, y + TILE + 6 + (h % 10)); ctx.quadraticCurveTo(x + 10, y + TILE + 2, x + 14, y + TILE - .5);
      ctx.moveTo(x + 16, y + TILE - .5); ctx.quadraticCurveTo(x + 22, y + TILE + 2, x + 23, y + TILE + 4 + ((h >> 4) % 14)); ctx.quadraticCurveTo(x + 25, y + TILE + 2, x + 30, y + TILE - .5); ctx.fill();
      ctx.fillStyle = 'rgba(200,235,255,.75)'; ctx.beginPath(); ell(ctx, x + 8, y + TILE + 6 + (h % 10), 1.2, 1.5, 0); ell(ctx, x + 23, y + TILE + 4 + ((h >> 4) % 14), 1.2, 1.5, 0); ctx.fill();
    }
  }
  /* Drobne ozdoby na wierzchu kafli — wybierane z ziarna kafla (zawsze te same, nigdy w równym rytmie). Bez wpływu na grę. */
  function drawProp(T, tk, x, y, h, lf, rt) {
    var r = (h >>> 3) % 23, c = ctx;
    var grass = tk === 'valley' || tk === 'stone' || T.grass;
    if (grass) {
      if (r === 0 || r === 9) { // kwiatki
        var FC = tk === 'olive' || tk === 'belvedere' ? ['#D7263D', '#D7263D', '#FFFFFF'] : tk === 'dusk' ? ['#C9B6FF', '#FFFFFF', '#FFD27A'] : ['#FFFFFF', '#FFD84D', '#F59AB8'];
        for (var i = 0; i < 3; i++) { var fx = x + 6 + i * 8 + ((h >> (i * 2)) & 3), fy = y - 3 - ((h >> (i + 5)) & 3);
          c.strokeStyle = '#3F7A3A'; c.lineWidth = 1; c.beginPath(); c.moveTo(fx, y + 2); c.lineTo(fx, fy); c.stroke();
          c.fillStyle = FC[(i + r) % 3]; c.beginPath(); for (var p = 0; p < 5; p++) { var a = p / 5 * Math.PI * 2; ell(c, fx + Math.cos(a) * 1.7, fy + Math.sin(a) * 1.7, 1.4, 1.4, 0); } c.fill();
          c.fillStyle = FC[(i + r) % 3] === '#D7263D' ? '#2A1A1A' : '#F2B33D'; c.beginPath(); ell(c, fx, fy, .9, .9, 0); c.fill(); }
      } else if (r === 3 || r === 14 || r === 19) { // wysoka kępa trawy
        c.fillStyle = mixHex(T.top, '#203A20', .25); c.beginPath(); var gx = x + 8 + (h % 14);
        for (i = -2; i <= 2; i++) { c.moveTo(gx + i * 2.2 - 1.2, y + 2); c.quadraticCurveTo(gx + i * 3, y - 5, gx + i * 4.2, y - 8 - (2 - Math.abs(i)) * 2); c.lineTo(gx + i * 2.2 + 1.2, y + 2); }
        c.fill();
      } else if (r === 6) { // kamyczek
        var kx = x + 10 + h % 12; c.fillStyle = INK; c.beginPath(); ell(c, kx, y + .5, 5.4, 3.6, 0); c.fill(); c.fillStyle = '#B9B3A6'; c.beginPath(); ell(c, kx, y, 4.4, 2.8, 0); c.fill(); c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); ell(c, kx - 1.5, y - 1, 1.6, .9, 0); c.fill();
      } else if (r === 11 && tk === 'valley') { // grzybek
        var mx = x + 12 + h % 8; c.fillStyle = INK; c.fillRect(mx - 2, y - 6, 4, 7); c.beginPath(); ell(c, mx, y - 6, 6, 4.2, 0); c.fill();
        c.fillStyle = '#FFF3DE'; c.fillRect(mx - 1.2, y - 5.5, 2.4, 6); c.fillStyle = '#D7263D'; c.beginPath(); c.ellipse(mx, y - 6, 5, 3.4, 0, Math.PI, 0); c.fill(); c.fillStyle = '#fff'; c.beginPath(); ell(c, mx - 2, y - 7.5, .9, .8, 0); ell(c, mx + 1.6, y - 8, .8, .7, 0); c.fill();
      } else if (r === 16) { // opadłe liście
        var LCC = tk === 'olive' ? ['#9DB08A', '#C6CFB5'] : ['#D9A441', '#B5683A'];
        for (i = 0; i < 3; i++) { c.save(); c.translate(x + 6 + i * 9 + (h >> i & 3), y + 1.5); c.rotate(((h >> (i * 3)) & 7) * .4); c.fillStyle = LCC[i % 2]; c.beginPath(); ell(c, 0, 0, 3.2, 1.4, 0); c.fill(); c.restore(); }
      }
    } else if (tk === 'cave') {
      if (r === 0 || r === 12) { // kryształki z poświatą
        var cx = x + 10 + h % 12, col = ['#7FD4FF', '#B49CFF', '#7FF0D0'][h % 3];
        var g = c.createRadialGradient(cx, y - 4, 1, cx, y - 4, 16); g.addColorStop(0, rgba(col, .45)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.fillRect(cx - 16, y - 20, 32, 24);
        for (i = -1; i <= 1; i++) { var hgt = i ? 6 : 10; c.fillStyle = INK; c.beginPath(); c.moveTo(cx + i * 4 - 2.6, y + 1); c.lineTo(cx + i * 4 + i * 1.5, y - hgt - 1); c.lineTo(cx + i * 4 + 2.6, y + 1); c.fill();
          c.fillStyle = col; c.beginPath(); c.moveTo(cx + i * 4 - 1.6, y + .5); c.lineTo(cx + i * 4 + i * 1.5, y - hgt); c.lineTo(cx + i * 4 + 1.6, y + .5); c.fill(); c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(cx + i * 4 - .6, y - hgt * .6, .9, hgt * .5); }
      } else if (r === 5 || r === 17) { // mały stalagmit
        var sx = x + 8 + h % 16; c.fillStyle = INK; c.beginPath(); c.moveTo(sx - 4.5, y + 1); c.lineTo(sx, y - 9); c.lineTo(sx + 4.5, y + 1); c.fill();
        c.fillStyle = '#6E86AE'; c.beginPath(); c.moveTo(sx - 3.4, y + .5); c.lineTo(sx, y - 7.5); c.lineTo(sx + 3.4, y + .5); c.fill(); c.fillStyle = 'rgba(200,235,255,.6)'; c.fillRect(sx - 1.2, y - 5, 1, 5);
      } else if (r === 8) { c.fillStyle = 'rgba(120,200,240,.45)'; c.beginPath(); ell(c, x + 16, y + 3.5, 9, 1.6, 0); c.fill(); c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(x + 12, y + 3, 4, .9); }
    } else if (tk === 'cliff') {
      if (r === 2 || r === 13) { c.fillStyle = '#8B9A55'; c.beginPath(); var bx = x + 10 + h % 12; for (i = -2; i <= 2; i++) { c.moveTo(bx + i * 2 - 1, y + 1); c.lineTo(bx + i * 3.5, y - 6 - (2 - Math.abs(i)) * 1.5); c.lineTo(bx + i * 2 + 1, y + 1); } c.fill(); }
      else if (r === 7) { c.fillStyle = '#FFD84D'; c.beginPath(); ell(c, x + 14, y - 4, 1.8, 1.8, 0); ell(c, x + 18, y - 3, 1.5, 1.5, 0); c.fill(); c.strokeStyle = '#6E7D3F'; c.lineWidth = 1; c.beginPath(); c.moveTo(x + 14, y + 1); c.lineTo(x + 14, y - 3); c.moveTo(x + 18, y + 1); c.lineTo(x + 18, y - 2); c.stroke(); }
      else if (r === 10 || r === 20) { c.fillStyle = INK; c.beginPath(); ell(c, x + 8 + h % 14, y + .5, 3.4, 2.4, 0); ell(c, x + 14 + h % 10, y + 1, 2.4, 1.8, 0); c.fill(); c.fillStyle = '#C9B99A'; c.beginPath(); ell(c, x + 8 + h % 14, y, 2.6, 1.7, 0); ell(c, x + 14 + h % 10, y + .5, 1.7, 1.2, 0); c.fill(); }
    } else if (T.sp) { // Spello: chwasty w szczelinach bruku, płatki, kawałki mozaiki
      if (r === 1 || r === 15) { c.fillStyle = '#6E9A4A'; c.beginPath(); var wx = x + 6 + h % 20; for (i = -1; i <= 1; i++) { c.moveTo(wx + i * 2 - 1, y + 1); c.lineTo(wx + i * 3, y - 4 - (i ? 0 : 2)); c.lineTo(wx + i * 2 + 1, y + 1); } c.fill(); if (r === 15 && !T.floor) { c.fillStyle = '#FFD84D'; c.beginPath(); ell(c, wx, y - 6, 1.6, 1.6, 0); c.fill(); } }
      else if ((r === 4 || r === 18) && (T.balcony || T.cobble)) { var PC = ['#F7B8C8', '#E8467C', '#FFFFFF']; for (i = 0; i < 4; i++) { c.fillStyle = PC[i % 3]; c.beginPath(); ell(c, x + 4 + ((h >> (i * 3)) % 26), y + 1, 1.8, 1, 0); c.fill(); } }
      else if (r === 7 && T.mosaic) { var MC = ['#B5543A', '#2F5D8C', '#D9A441']; for (i = 0; i < 3; i++) { c.fillStyle = MC[i]; c.fillRect(x + 6 + i * 7 + (h >> i & 3), y - 1.6, 3, 2.4); } }
      if (T.floor) { var fg = c.createLinearGradient(x, y, x + TILE, y + 8); fg.addColorStop(0, 'rgba(255,255,255,0)'); fg.addColorStop(.5, 'rgba(255,248,230,.22)'); fg.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = fg; c.fillRect(x, y, TILE, 8); }
    }
    if ((tk === 'gate' || tk === 'alley' || tk === 'stone' || tk === 'villa') && (lf || rt) && ((h >> 11) % 3 === 0)) { // bluszcz zwisający z krawędzi
      var ix = lf ? x + 3 : x + TILE - 3, len = 10 + (h >> 13) % 18;
      c.strokeStyle = '#3F6B3A'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(ix, y); c.quadraticCurveTo(ix + (lf ? -3 : 3), y + len * .5, ix, y + len); c.stroke();
      for (i = 0; i < len; i += 5) { c.fillStyle = i % 10 ? '#5E9A4E' : '#7DB565'; c.beginPath(); ell(c, ix + (i % 10 ? 2.2 : -2.2) + (lf ? -1 : 1), y + 2 + i, 2.6, 1.8, 0); c.fill(); }
    }
  }
  function drawPlatform(T, tk, x, y, l, r) { // deska/półka: kontur, słoje, gwoździe, cień pod spodem
    if (T.sp && T.balcony) { drawPlatformSp(T, x, y, l, r); return; }
    var c = ctx, x0 = x - (l ? .5 : 0), w = TILE + (l ? .5 : 0) + (r ? .5 : 0), h = hashXY(x, y);
    var sg = c.createLinearGradient(0, y + 11, 0, y + 19); sg.addColorStop(0, 'rgba(20,14,30,.22)'); sg.addColorStop(1, 'rgba(20,14,30,0)'); c.fillStyle = sg; c.fillRect(x0 + (l ? 0 : 3), y + 11, w - (l ? 0 : 3) - (r ? 0 : 3), 8);
    c.fillStyle = INK; if (!l || !r) { roundRect(c, x0 - (l ? 0 : .8), y - .8, w + (l ? 0 : .8) + (r ? 0 : .8), 12.6, 4); c.fill(); } else c.fillRect(x0, y - .8, w, 12.6);
    var g = c.createLinearGradient(0, y, 0, y + 11); g.addColorStop(0, mixHex(T.plat, '#FFFFFF', .18)); g.addColorStop(.7, T.plat); g.addColorStop(1, T.platDk);
    c.fillStyle = g; if (!l || !r) { roundRect(c, x0 + (l ? 0 : 1), y + .6, w - (l ? 0 : 1) - (r ? 0 : 1), 9.6, 3); c.fill(); } else c.fillRect(x0, y + .6, w, 9.6);
    c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x0 + (l ? 0 : 3), y + 1.4, w - (l ? 0 : 3) - (r ? 0 : 3), 1.4);
    c.strokeStyle = 'rgba(40,25,10,.28)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x + 2, y + 5 + (h & 1)); c.bezierCurveTo(x + 10, y + 3.5, x + 18, y + 7, x + 30, y + 5 + (h >> 1 & 1)); c.stroke();
    c.fillStyle = T.platDk; c.fillRect(x + 15, y + 1.5, 1.4, 8);
    c.fillStyle = 'rgba(255,240,200,.7)'; c.beginPath(); ell(c, x + 12.5, y + 4.5, .9, .9, 0); ell(c, x + 19, y + 4.5, .9, .9, 0); c.fill();
    if (tk === 'cave' || tk === 'cistern') { c.fillStyle = 'rgba(170,220,255,.35)'; c.fillRect(x0 + 2, y + 1, w - 4, 1); }
  }
  /* Skrzynia: drewno w złotych okuciach, kontur; otwarcie = wieko odskakuje, błysk i iskry (tylko obraz). */
  var chestFx = {}, chestLv = null;
  function drawChest(x, y, open, c) {
    if (chestLv !== L) { chestFx = {}; chestLv = L; }
    var key = x + ',' + y, f = chestFx[key];
    if (!f) f = chestFx[key] = { open: open, t: -9 };
    if (open && !f.open) { f.open = true; f.t = vT; if (!reduceMotion) { burst(x + 16, y + 6, 12, '#FFE48A'); addShake(2.5, .18); } }
    if (!open) f.open = false;
    var k = open ? clamp((vT - f.t) / .35, 0, 1) : 0, lidA = open ? -1.9 * (reduceMotion ? 1 : easeBack(k)) : 0, bob = !open && !reduceMotion ? Math.max(0, Math.sin(gameT * 2.2 + x)) * -1.2 : 0;
    var cx = ctx, locked = c && c.locked;
    if (open && k < 1 && !reduceMotion) { var gl = cx.createRadialGradient(x + 16, y + 4, 2, x + 16, y + 4, 60); gl.addColorStop(0, 'rgba(255,240,170,' + (.9 * (1 - k)).toFixed(2) + ')'); gl.addColorStop(1, 'rgba(255,240,170,0)'); cx.fillStyle = gl; cx.fillRect(x - 44, y - 56, 120, 120); }
    cx.fillStyle = 'rgba(20,14,30,.25)'; cx.beginPath(); ell(cx, x + 16, y + 32, 15, 2.6, 0); cx.fill();
    // skrzynia
    cx.fillStyle = INK; roundRect(cx, x + .5, y + 11 + bob, 31, 21.5 - bob, 3); cx.fill();
    var g = cx.createLinearGradient(0, y + 12, 0, y + 32); g.addColorStop(0, locked ? '#9A8670' : '#B07A3E'); g.addColorStop(1, locked ? '#6E5D4A' : '#7A4E25');
    cx.fillStyle = g; roundRect(cx, x + 2, y + 12.5 + bob, 28, 18.5 - bob, 2); cx.fill();
    cx.fillStyle = 'rgba(40,20,5,.3)'; cx.fillRect(x + 2, y + 21 + bob * .5, 28, 1.2);
    cx.fillStyle = '#F2B533'; cx.fillRect(x + 5, y + 12.5 + bob, 3, 18.5 - bob); cx.fillRect(x + 24, y + 12.5 + bob, 3, 18.5 - bob);
    cx.fillStyle = 'rgba(255,255,255,.45)'; cx.fillRect(x + 5, y + 12.5 + bob, 1, 18 - bob); cx.fillRect(x + 24, y + 12.5 + bob, 1, 18 - bob);
    // wieko
    cx.save(); cx.translate(x + 3, y + 12 + bob); cx.rotate(lidA);
    cx.fillStyle = INK; cx.beginPath(); cx.moveTo(-2.5, 1); cx.lineTo(-2.5, -6); cx.quadraticCurveTo(13, -15, 28.5, -6); cx.lineTo(28.5, 1); cx.closePath(); cx.fill();
    var lg = cx.createLinearGradient(0, -12, 0, 1); lg.addColorStop(0, open ? '#E9B84E' : '#FFD34D'); lg.addColorStop(1, open ? '#B8862A' : '#E5A421');
    cx.fillStyle = lg; cx.beginPath(); cx.moveTo(-1, -.2); cx.lineTo(-1, -5.5); cx.quadraticCurveTo(13, -13, 27, -5.5); cx.lineTo(27, -.2); cx.closePath(); cx.fill();
    cx.fillStyle = 'rgba(255,255,255,.55)'; cx.beginPath(); cx.moveTo(2, -6); cx.quadraticCurveTo(13, -11.5, 24, -6); cx.lineTo(24, -5); cx.quadraticCurveTo(13, -10, 2, -5); cx.fill();
    cx.restore();
    if (!open) { // zamek
      cx.fillStyle = INK; roundRect(cx, x + 12, y + 14 + bob, 8, 9, 2); cx.fill(); cx.fillStyle = locked ? '#B9C6D8' : '#FFE48A'; roundRect(cx, x + 13.2, y + 15.2 + bob, 5.6, 6.6, 1.4); cx.fill(); cx.fillStyle = INK; cx.fillRect(x + 15.4, y + 17 + bob, 1.4, 3);
      if (locked) { cx.strokeStyle = INK; cx.lineWidth = 2.2; cx.beginPath(); cx.arc(x + 16, y + 13 + bob, 4, Math.PI, 0); cx.stroke(); }
      if (!reduceMotion && Math.sin(gameT * 3 + x) > .75) star(cx, x + 26, y + 6 + bob, 3.2, 'rgba(255,250,220,.95)');
    } else { cx.fillStyle = 'rgba(255,230,140,.85)'; cx.fillRect(x + 4, y + 12, 24, 2); }
  }
  function easeBack(t) { t = clamp(t, 0, 1); var s = 1.7; return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); }
  function star(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r); c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r); c.fill(); }
  /* Kamyczki: gotowe klatki (złoty kamyk z konturem i przelatującym błyskiem). */
  var coinCv = [], coinK = 0;
  function coinFrame(f) {
    if (coinK !== LC.k) { coinCv = []; coinK = LC.k; }
    if (coinCv[f]) return coinCv[f];
    var q = Math.min(LC.k, 3), cv = document.createElement('canvas'); cv.width = Math.ceil(24 * q); cv.height = Math.ceil(20 * q);
    var c = cv.getContext('2d'); c.setTransform(q, 0, 0, q, 12 * q, 10 * q);
    c.fillStyle = '#3B2A00'; c.beginPath(); ell(c, 0, 0, 9.4, 7.8, 0); c.fill();
    var g = c.createRadialGradient(-3, -3, 1, 0, 0, 9); g.addColorStop(0, '#FFF0A8'); g.addColorStop(.45, '#FFC629'); g.addColorStop(1, '#D9940F');
    c.fillStyle = g; c.beginPath(); ell(c, 0, 0, 7.7, 6.2, 0); c.fill();
    c.fillStyle = 'rgba(160,90,0,.35)'; c.beginPath(); c.ellipse(0, .5, 7.7, 5.7, 0, .15, Math.PI - .15); c.ellipse(0, -1, 6.5, 3.6, 0, Math.PI - .2, .2, true); c.fill();
    c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); ell(c, -2.8, -2.4, 2.6, 1.5, 0); c.fill();
    if (f < 16) { c.save(); c.beginPath(); ell(c, 0, 0, 7.7, 6.2, 0); c.clip(); c.rotate(-.6); var bx = -12 + f * 1.6; c.fillStyle = 'rgba(255,255,255,.75)'; c.fillRect(bx, -12, 3, 24); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(bx + 4, -12, 1.5, 24); c.restore(); }
    coinCv[f] = { cv: cv }; toBmp(coinCv[f]); return coinCv[f];
  }
  /* Gotowe obrazki rysujemy jako ImageBitmap (niezmienne — przeglądarka wysyła je do GPU raz), do czasu ich przygotowania — płótno. */
  function toBmp(o) { if (window.createImageBitmap) createImageBitmap(o.cv).then(function (b) { o.bm = b; }, function () {}); return o; }
  function drawCoinAt(x, y, ph) {
    var f = reduceMotion ? 16 : Math.floor(((vT * .45 + ph * .13) % 1) * 44); if (f > 16) f = 16;
    var o = coinFrame(f); ctx.drawImage(o.bm || o.cv, x - 12, y - 10, 24, 20);
  }
  /* Naklejka: biały brzeg „wycinanki”, miękki cień, delikatny połysk, zagięty róg. sh = faza błysku (0–1) albo null. */
  function drawSticker(c, img, S, sh) {
    var r = S * .13;
    c.fillStyle = 'rgba(6,42,88,.14)'; roundRect(c, -S / 2 + S * .035, -S / 2 + S * .075, S, S, r); c.fill();
    c.fillStyle = 'rgba(6,42,88,.16)'; roundRect(c, -S / 2 + S * .015, -S / 2 + S * .035, S, S, r); c.fill();
    c.fillStyle = '#fff'; roundRect(c, -S / 2, -S / 2, S, S, r); c.fill();
    c.strokeStyle = 'rgba(14,26,43,.22)'; c.lineWidth = Math.max(.8, S * .012); c.stroke();
    var m = S * .06, g = c.createLinearGradient(0, -S / 2, 0, S / 2); g.addColorStop(0, '#FFFDF6'); g.addColorStop(1, '#F1EBDD');
    c.fillStyle = g; roundRect(c, -S / 2 + m, -S / 2 + m, S - 2 * m, S - 2 * m, r * .65); c.fill();
    if (img && img.complete && img.naturalWidth) c.drawImage(img, -S * .43, -S * .43, S * .86, S * .86);
    c.save(); roundRect(c, -S / 2, -S / 2, S, S, r); c.clip();
    var gl = c.createLinearGradient(-S / 2, -S / 2, S * .1, S * .1); gl.addColorStop(0, 'rgba(255,255,255,.5)'); gl.addColorStop(.45, 'rgba(255,255,255,.08)'); gl.addColorStop(.46, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gl; c.fillRect(-S / 2, -S / 2, S, S);
    if (sh != null && sh >= 0 && sh <= 1 && !reduceMotion) { var bx = -S + sh * S * 2; c.rotate(.5); c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(bx, -S, S * .12, S * 2); c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(bx + S * .16, -S, S * .05, S * 2); }
    c.restore();
    // zagięty róg (prawy dolny)
    var cr = S * .16, ex = S / 2, ey = S / 2;
    c.fillStyle = 'rgba(6,42,88,.22)'; c.beginPath(); c.moveTo(ex - cr, ey); c.lineTo(ex, ey - cr); c.lineTo(ex - cr * .85, ey - cr * .85); c.fill();
    var pg = c.createLinearGradient(ex - cr, ey - cr, ex, ey); pg.addColorStop(0, '#FFFFFF'); pg.addColorStop(1, '#D8DEE8');
    c.fillStyle = pg; c.beginPath(); c.moveTo(ex - cr, ey); c.quadraticCurveTo(ex - cr * .95, ey - cr * .95, ex, ey - cr); c.lineTo(ex - cr * .2, ey - cr * .2); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(14,26,43,.18)'; c.lineWidth = Math.max(.6, S * .008); c.stroke();
  }
  /* --- Efekty: cząsteczki, napisy +n, wstrząs ekranu, przejście „irys”, kolor i winieta --- */
  var vT = 0, vDt = 0, pops = [], shake = { t: 0, d: 1, m: 0 }, wipe = null, flash = 0;
  function addShake(m, d) { if (reduceMotion || SIM) return; if (m >= shake.m * (shake.t / shake.d || 0)) { shake.m = m; shake.d = d; shake.t = d; } }
  function popText(x, y, txt, col) { if (SIM) return; pops.push({ x: x, y: y, txt: txt, col: col || '#FFE48A', t: 0 }); if (pops.length > 14) pops.shift(); }
  function burst(x, y, n, col) { if (SIM) return; for (var i = 0; i < (reduceMotion ? 3 : n); i++) { var a = Math.random() * Math.PI * 2, s = 80 + Math.random() * 160; particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: .6, max: .6, col: col, size: 3 + Math.random() * 3, g: 300, kind: 'star' }); } }
  function startWipe(x, y) { if (SIM) return; wipe = { t: 0, x: x, y: y }; }
  function drawPops() {
    if (!pops.length) return;
    var min = 18 / view.s;
    for (var i = pops.length - 1; i >= 0; i--) {
      var p = pops[i]; p.t += vDt; if (p.t > .9) { pops.splice(i, 1); continue; }
      var k = p.t / .9, sc = p.t < .12 ? .6 + p.t / .12 * .55 : 1.15 - Math.min(.15, (p.t - .12) * .6), y = p.y - (reduceMotion ? 10 : 34 * ease(k));
      ctx.save(); ctx.globalAlpha = 1 - Math.max(0, k - .6) / .4; ctx.translate(p.x, y); ctx.scale(sc, sc);
      ctx.font = font(Math.max(min, 18)); ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = 4 / view.s + 2; ctx.strokeStyle = INK; ctx.strokeText(p.txt, 0, 0); ctx.fillStyle = p.col; ctx.fillText(p.txt, 0, 0);
      ctx.restore();
    }
  }
  var gradeCv = {}, vignCv = null;
  function gradeFor(kind) { // kolor (pora dnia + teren) i siła winiety
    var t = TOD;
    if (kind === 'cave') return ['#0A2850', .1, '#020814', .62];
    if (kind === 'fresco') return ['#FFC488', .07, '#2A160C', .42];
    if (kind === 'dusk') return ['#6A3C9A', .1, '#140A28', .55];
    if (kind === 'belvedere') return ['#FFB060', .09, '#3A1E10', .34];
    if (kind === 'crypt' || kind === 'dig' || kind === 'cistern') return ['#FFB070', .04, '#05070C', .6];
    if (t < .3) return ['#FFF0D8', .05 * (1 - t / .3), '#0E1A2B', .26];
    if (t > .55) return ['#FF9E48', .11 * (t - .55) / .45, '#2A140A', .3];
    return ['#FFFFFF', 0, '#0E1A2B', .24];
  }
  function drawGrade(kind) { // winieta i kolor pory dnia: tylko pasy przy górnej i dolnej krawędzi (tanio przy rysowaniu programowym)
    var g = gradeFor(kind), W = cv_w(), H = cv_h(), e = Math.round(H * .14), key = g.join('|');
    if (g[1] <= 0 && flash <= 0 && !(kind === 'crypt' || kind === 'dig' || kind === 'cistern')) return;
    if (!gradeCv[key]) {
      var top = ctx.createLinearGradient(0, 0, 0, e), bot = ctx.createLinearGradient(0, H - e, 0, H);
      top.addColorStop(0, rgba(g[2], (g[3] * .55).toFixed(3))); top.addColorStop(1, rgba(g[2], 0));
      bot.addColorStop(0, g[1] > 0 ? rgba(g[0], 0) : rgba(g[2], 0)); bot.addColorStop(1, g[1] > 0 ? rgba(g[0], (g[1] * 2.6).toFixed(3)) : rgba(g[2], (g[3] * .45).toFixed(3)));
      gradeCv[key] = { top: top, bot: bot, H: H };
    }
    var G2 = gradeCv[key]; if (G2.H !== H) { delete gradeCv[key]; return drawGrade(kind); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (kind !== 'cave' && g[1] <= 0) { ctx.fillStyle = G2.top; ctx.fillRect(0, 0, W, e); }
    if (kind !== 'cave' && (g[1] > 0 || g[3] > .3)) { ctx.fillStyle = G2.bot; ctx.fillRect(0, H - e, W, e); }
    if (flash > 0) { // błysk po uderzeniu: czerwone brzegi
      var a = clamp(flash / .35, 0, 1) * .55, s2 = Math.round(Math.min(W, H) * .12);
      ctx.fillStyle = 'rgba(200,30,54,' + a.toFixed(3) + ')'; ctx.fillRect(0, 0, W, s2 * .5); ctx.fillRect(0, H - s2 * .5, W, s2 * .5); ctx.fillRect(0, 0, s2 * .5, H); ctx.fillRect(W - s2 * .5, 0, s2 * .5, H);
    }
  }
  function cv_w() { return cv.width; } function cv_h() { return cv.height; }
  function drawWipe() {
    if (!wipe) return;
    wipe.t += vDt; var D2 = reduceMotion ? .25 : .55, k = wipe.t / D2; if (k >= 1) { wipe = null; return; }
    var W = cv.width, H = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (reduceMotion) { ctx.fillStyle = 'rgba(6,20,44,' + (1 - k).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); return; }
    var sk = view.s * view.dpr, sx = (wipe.x - cam.x) * sk, sy = (wipe.y - cam.y) * sk, R = Math.hypot(Math.max(sx, W - sx), Math.max(sy, H - sy)) * ease(k) + 1;
    ctx.fillStyle = '#061A36'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(sx, sy, R, 0, Math.PI * 2, true); ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(255,198,41,.8)'; ctx.lineWidth = 5 * view.dpr; ctx.beginPath(); ctx.arc(sx, sy, R, 0, Math.PI * 2); ctx.stroke();
  }
  /* Quo: dodatki rysowane kodem — cień zależny od wysokości, kurz spod łap, sprężyste opóźnienie ogona, chustka na wietrze. */
  var QA = { tail: 0, head: 0, dust: 0, gr: true, vy: 0, hurt: 0, scarf: 0 };
  function quoExtras(pose, kind) {
    var dt = Math.min(vDt, .05), tv = clamp(-P.vx * P.facing / 420 * .45 + P.vy / 900 * .35, -.6, .6);
    QA.tail += (tv - QA.tail) * Math.min(1, dt * 7); QA.head += (clamp(P.vy / 1400, -.12, .12) - QA.head) * Math.min(1, dt * 10);
    QA.scarf += (clamp(Math.abs(P.vx) / 200 + Math.abs(P.vy) / 600, 0, 1.4) - QA.scarf) * Math.min(1, dt * 5);
    if (!reduceMotion) { pose.tail.a += QA.tail; pose.head.a += QA.head; }
    if (!P.onGround && kind !== 'nap' && !P.climb && !reduceMotion) { var v = clamp(Math.abs(P.vy) / 900, 0, 1); pose.root.sy *= 1 + .08 * v; pose.root.sx *= 1 - .06 * v; }
    if (kind === 'idle' && !reduceMotion) { var b = Math.sin(P.t * 2.4) * .012; pose.root.sy *= 1 + b; pose.root.sx *= 1 - b * .5; }
    pose.scarf = { a: QA.scarf, t: P.t };
    // kurz spod łap przy biegu i lądowaniu
    if (P.onGround && kind === 'walk' && Math.abs(P.vx) > 140) { QA.dust -= dt; if (QA.dust <= 0) { QA.dust = .13 + Math.random() * .05; dust(P.x - P.facing * 8, P.y - 2, 1); } }
    if (P.onGround && !QA.gr && QA.vy > 420) { dust(P.x, P.y - 2, QA.vy > 700 ? 6 : 3); if (QA.vy > 760) addShake(3.2, .2); }
    if (P.hurtT > .3 && QA.hurt <= 0) { flash = .35; addShake(4.5, .25); }
    QA.hurt = P.hurtT; QA.gr = P.onGround; QA.vy = P.vy;
  }
  function dust(x, y, n) { if (SIM) return; for (var i = 0; i < n; i++) particles.push({ x: x + (Math.random() - .5) * 10, y: y, vx: (Math.random() - .5) * 70 - P.vx * .08, vy: -10 - Math.random() * 40, life: .5, max: .5, col: 'rgba(240,232,215,.75)', size: 4 + Math.random() * 3, g: -20, kind: 'dust' }); }
  function drawScarf(c, s) { // końce chustki za szyją (w układzie tułowia)
    var a = .5 + Math.min(.75, s.a * .55), fl = reduceMotion ? 0 : Math.sin(s.t * (8 + s.a * 9)) * (.06 + s.a * .14);
    [[.4, .8], [0, 1]].forEach(function (k) {
      c.save(); c.translate(-9.5, -19.5); c.rotate(a + k[0] + fl * (k[0] ? -1.3 : 1));
      c.fillStyle = QC.line; c.beginPath(); c.moveTo(-3.4, -1); c.quadraticCurveTo(-1.6, 4.5 * k[1], 0, 8 * k[1] + 1.4); c.quadraticCurveTo(2.4, 4.5 * k[1], 3.4, -1); c.fill();
      c.fillStyle = k[0] ? QC.bandDk : QC.band; c.beginPath(); c.moveTo(-2.2, 0); c.quadraticCurveTo(-.9, 4.5 * k[1], 0, 8 * k[1] - .2); c.quadraticCurveTo(1.5, 4.5 * k[1], 2.2, 0); c.fill();
      c.restore();
    });
  }
  /* Kontur naklejkowy dla przeciwników: wspólny styl. */
  function inkOn(c, w) { c.strokeStyle = INK; c.lineWidth = w || 1.8; c.lineJoin = 'round'; c.lineCap = 'round'; }
  function drawBat(e, purple) {
    var flap = reduceMotion ? .5 : (Math.sin(e.t * (e.st === 1 ? 40 : 18)) * .5 + .5), c = ctx, blink = !reduceMotion && (e.t * 1.3 + e.x * .01) % 3.2 < .12;
    c.save(); c.translate(e.x, e.y);
    var wc = purple ? '#5B3A70' : '#3A4166', bc = purple ? '#6E4A86' : '#4A5280';
    [-1, 1].forEach(function (s) { // skrzydła z błoną
      c.beginPath(); c.moveTo(s * 5, -3); c.quadraticCurveTo(s * 14, -14 + flap * 12, s * 22, -8 + flap * 14); c.lineTo(s * 18, -1 + flap * 6); c.quadraticCurveTo(s * 15, 3, s * 12, 1 + flap * 3); c.quadraticCurveTo(s * 10, 5, s * 6, 4); c.closePath();
      inkOn(c, 1.8); c.stroke(); c.fillStyle = wc; c.fill();
      c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 1; c.beginPath(); c.moveTo(s * 6, -2); c.lineTo(s * 18, -1 + flap * 6); c.moveTo(s * 7, -1); c.lineTo(s * 12, 1 + flap * 3); c.stroke();
    });
    c.beginPath(); ell(c, 0, 0, 9, 8.4, 0); c.moveTo(-6.5, -5); c.lineTo(-4.5, -13); c.lineTo(-1, -6.5); c.moveTo(6.5, -5); c.lineTo(4.5, -13); c.lineTo(1, -6.5);
    inkOn(c, 2); c.stroke(); var g = c.createRadialGradient(-3, -4, 1, 0, 0, 10); g.addColorStop(0, mixHex(bc, '#FFFFFF', .25)); g.addColorStop(1, bc); c.fillStyle = g; c.fill();
    c.fillStyle = '#F3A3A0'; c.beginPath(); c.moveTo(-5.4, -6); c.lineTo(-4.6, -10.5); c.lineTo(-2.6, -6.6); c.moveTo(5.4, -6); c.lineTo(4.6, -10.5); c.lineTo(2.6, -6.6); c.fill();
    if (blink) { c.strokeStyle = INK; c.lineWidth = 1.3; c.beginPath(); c.moveTo(-5, -1); c.lineTo(-1.5, -1); c.moveTo(1.5, -1); c.lineTo(5, -1); c.stroke(); }
    else { c.fillStyle = '#fff'; c.beginPath(); ell(c, -3, -1, 2.9, 3.1, 0); ell(c, 3, -1, 2.9, 3.1, 0); c.fill(); c.fillStyle = INK; c.beginPath(); ell(c, -2.4, -.5, 1.5, 1.8, 0); ell(c, 3.6, -.5, 1.5, 1.8, 0); c.fill(); c.fillStyle = '#fff'; c.fillRect(-2, -1.6, .9, .9); c.fillRect(4, -1.6, .9, .9); }
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(-1.6, 3); c.lineTo(-.9, 5); c.lineTo(-.2, 3); c.moveTo(.2, 3); c.lineTo(.9, 5); c.lineTo(1.6, 3); c.fill();
    c.fillStyle = 'rgba(240,120,140,.75)'; c.beginPath(); ell(c, -5.4, 2.6, 1.7, 1, 0); ell(c, 5.4, 2.6, 1.7, 1, 0); c.fill();
    if (e.st === 1) { c.fillStyle = '#FFC629'; c.font = font(18); c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = INK; c.strokeText('!', 0, -17); c.fillText('!', 0, -17); }
    c.restore();
  }
  function drawRollerE(x, y, r, rot, angry) { // toczący się kamień z buźką
    var c = ctx; c.save(); c.translate(x, y);
    c.fillStyle = 'rgba(20,14,30,.2)'; c.beginPath(); ell(c, 0, r + 1, r * .9, 2.5, 0); c.fill();
    c.beginPath(); ell(c, 0, 0, r, r, 0); inkOn(c, 2); c.stroke();
    var g = c.createRadialGradient(-r * .35, -r * .4, 1, 0, 0, r); g.addColorStop(0, '#D3D9E1'); g.addColorStop(.7, '#A2ABB9'); g.addColorStop(1, '#7D8796'); c.fillStyle = g; c.fill();
    c.save(); c.rotate(rot); c.strokeStyle = 'rgba(70,80,96,.6)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-r * .6, -r * .3); c.lineTo(-r * .1, r * .1); c.lineTo(r * .4, -r * .2); c.moveTo(-r * .2, r * .55); c.lineTo(r * .25, r * .4); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.25)'; c.beginPath(); ell(c, r * .3, r * .45, 2.2, 1.6, 0); c.fill(); c.restore();
    c.fillStyle = '#fff'; c.beginPath(); ell(c, -4, -2, 3.2, 3.6, 0); ell(c, 3.4, -2, 3.2, 3.6, 0); c.fill(); inkOn(c, 1); c.stroke();
    c.fillStyle = INK; c.beginPath(); ell(c, -4.6, -1.4, 1.7, 2.1, 0); ell(c, 2.8, -1.4, 1.7, 2.1, 0); c.fill();
    if (angry) { c.strokeStyle = INK; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-7, -6.5); c.lineTo(-2, -5); c.moveTo(6.4, -6.5); c.lineTo(1.4, -5); c.stroke(); }
    c.restore();
  }
  function drawSkyTile(x, y, v) { // komnata Skarbu Quo i chmurki w strefie nieba
    if (!v) return;
    var px = x * TILE, py = y * TILE;
    if (v === 2) {
      ctx.fillStyle = 'rgba(14,26,43,.18)'; ctx.beginPath(); ell(ctx, px + 16, py + 12, 20, 7, 0); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ell(ctx, px + 16, py + 6, 19, 8, 0); ell(ctx, px + 8, py + 2, 9, 7, 0); ell(ctx, px + 22, py, 10, 8, 0); ctx.fill();
      return;
    }
    var sk = function (cx, cy) { return cy < 0 && cy >= -L.skyH && L.sky[(cy + L.skyH) * L.W + cx] === 1; };
    drawSolid(TER.stone, 'stone', px, py, !sk(x, y - 1), !sk(x, y + 1), !sk(x - 1, y), !sk(x + 1, y), hashXY(x, y));
    if (!sk(x, y + 1) && (!L.treasure || py >= L.treasure.y1)) { ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ell(ctx, px + 16, py + TILE + 2, 22, 9, 0); ctx.fill(); }
  }
  function drawSkyZone() { // nad poziomem: coraz głębszy błękit i chmury — widać to tylko, gdy kamera pojedzie za balonikiem
    if (!L.sky || cam.y > -40) return;
    var x0 = L.skyX0 * TILE - 400, x1 = (L.skyX1 + 1) * TILE + 400, top = -L.skyH * TILE - 200;
    if (x1 < cam.x || x0 > cam.x + view.w) return;
    var g = ctx.createLinearGradient(0, top, 0, 0);
    g.addColorStop(0, 'rgba(46,104,190,.85)'); g.addColorStop(.6, 'rgba(120,170,230,.4)'); g.addColorStop(1, 'rgba(141,187,234,0)');
    ctx.fillStyle = g; ctx.fillRect(Math.max(cam.x, x0 - 600), Math.max(cam.y, top), view.w + 20, -Math.max(cam.y, top));
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    for (var i = 0; i < 14; i++) {
      var h = hashXY(i, 77), cx = L.skyX0 * TILE + (h % ((L.skyX1 - L.skyX0 + 1) * TILE)), cy = -(9 + (h >> 7) % 12) * TILE;
      if (cx < cam.x - 80 || cx > cam.x + view.w + 80 || cy < cam.y - 40 || cy > cam.y + view.h + 40) continue;
      var r = 14 + (h >> 3) % 16; ctx.beginPath(); ell(ctx, cx, cy, r * 1.7, r * .7, 0); ell(ctx, cx - r * .6, cy + 3, r * .8, r * .5, 0); ell(ctx, cx + r * .3, cy - r * .35, r * .8, r * .6, 0); ctx.fill();
    }
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
      } else if (m.wood) { // rusztowanie: drewniany pomost na linach
        ctx.strokeStyle = 'rgba(94,69,41,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(m.x + 6, m.y); ctx.lineTo(m.x + 6, m.y - 500); ctx.moveTo(m.x + m.w - 6, m.y); ctx.lineTo(m.x + m.w - 6, m.y - 500); ctx.stroke();
        ctx.fillStyle = '#4A2F17'; ctx.fillRect(m.x - 1, m.y - 1, m.w + 2, 13);
        ctx.fillStyle = '#B98A55'; ctx.fillRect(m.x, m.y, m.w, 9); ctx.fillStyle = '#8C5E2E'; for (var wi = 15; wi < m.w; wi += 16) ctx.fillRect(m.x + wi, m.y, 2, 9);
      } else {
        if (m.ax === 'y') { ctx.strokeStyle = 'rgba(14,26,43,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(m.x + 6, m.y); ctx.lineTo(m.x + 6, m.y - 500); ctx.moveTo(m.x + m.w - 6, m.y); ctx.lineTo(m.x + m.w - 6, m.y - 500); ctx.stroke(); }
        ctx.fillStyle = 'rgba(20,14,30,.18)'; ctx.fillRect(m.x + 3, m.y + 13, m.w - 6, 4);
        ctx.fillStyle = INK; roundRect(ctx, m.x - 1.2, m.y - 1.2, m.w + 2.4, 15, 4); ctx.fill();
        ctx.fillStyle = '#FFC629'; roundRect(ctx, m.x + .5, m.y + .3, m.w - 1, 9, 3); ctx.fill();
        ctx.fillStyle = '#FFE28A'; ctx.fillRect(m.x + 3, m.y + 1.2, m.w - 6, 2);
        ctx.fillStyle = '#0B4EA2'; ctx.fillRect(m.x + .5, m.y + 9.3, m.w - 1, 3.2);
        ctx.fillStyle = '#3B2A00'; for (var i = 8; i < m.w; i += 16) { ctx.beginPath(); ell(ctx, m.x + i + 3, m.y + 4.8, 2, 1.6, 0); ctx.fill(); }
      }
    });
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
    ctx.fillStyle = 'rgba(6,42,88,.25)'; ctx.beginPath(); ell(ctx, .8, 2, 14, 14, 0); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ell(ctx, 0, 0, 14.2, 14.2, 0); ctx.fill();
    var wg = ctx.createRadialGradient(-4, -5, 1, 0, 0, 13); wg.addColorStop(0, '#FFFFFF'); wg.addColorStop(1, '#E2EBF7'); ctx.fillStyle = wg; ctx.beginPath(); ell(ctx, 0, 0, 12.4, 12.4, 0); ctx.fill();
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
      } else if (it.type === 'pu') {
        var pg = ctx.createRadialGradient(it.x, it.y + b, 4, it.x, it.y + b, 32); pg.addColorStop(0, 'rgba(255,214,90,.55)'); pg.addColorStop(1, 'rgba(255,214,90,0)'); ctx.fillStyle = pg; ctx.fillRect(it.x - 32, it.y + b - 32, 64, 64);
        if (!reduceMotion) for (var si = 0; si < 2; si++) { var sa2 = gameT * 2.4 + si * Math.PI; star(ctx, it.x + Math.cos(sa2) * 22, it.y + b + Math.sin(sa2) * 22, 3, 'rgba(255,250,220,.95)'); }
        drawPuIcon(it.kind, it.x, it.y + b, 1.15);
      }
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
      if (P.zip < 0 && Math.abs(P.x - z.x0) < 200) { ctx.fillStyle = '#062A58'; label(PT('page.game.c.zip', 'tyrolka'), z.x0 + 10, z.y0 - 22, 160); }
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
      if (P.cart >= 0 && L.carts[P.cart] === c && c.s < c.jS) { ctx.fillStyle = '#FFC629'; label(PT('page.game.c.cart', 'Skok = tajny tor ↗'), j[0], j[1] - 92, 260); }
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
      if (q.kind === 'carpet') { // tablica z kwiatowym wzorem (Infiorate)
        ctx.fillStyle = '#6E614D'; ctx.fillRect(q.x - 3, q.y - 30, 6, 30);
        ctx.fillStyle = '#0E1A2B'; ctx.fillRect(q.x - 24, q.y - 72, 48, 44);
        ctx.fillStyle = '#5C8A45'; ctx.fillRect(q.x - 22, q.y - 70, 44, 40);
        var PC = ['#E8467C', '#FFC629', '#FFFFFF', '#C81E36'];
        for (var j = 0; j < 16; j++) { if (!q.solved && (j === 5 || j === 10 || j === 15)) continue; var cx = j % 4, cy = Math.floor(j / 4); ctx.fillStyle = PC[(Math.min(cx, 3 - cx) + Math.min(cy, 3 - cy)) % 4]; ctx.beginPath(); ell(ctx, q.x - 15 + cx * 10, q.y - 63 + cy * 9.5, 4.2, 4.2, 0); ctx.fill(); }
        if (!q.solved && Math.abs(P.x - q.x) < 160) { ctx.fillStyle = '#062A58'; label(PT('page.game.c.carpet', 'Skok przy tablicy = kwiatowy dywan'), q.x, q.y - 86, 320); }
        return;
      }
      ctx.fillStyle = '#6E614D'; ctx.fillRect(q.x - 3, q.y - 30, 6, 30);
      ctx.fillStyle = '#0E1A2B'; ctx.fillRect(q.x - 22, q.y - 70, 44, 42);
      ctx.fillStyle = '#E8DEC8'; ctx.fillRect(q.x - 20, q.y - 68, 40, 38);
      var cols = ['#0B4EA2', '#FFC629', '#1F7A48', '#C81E36', '#E8A04B', '#0B4EA2', '#1F7A48', '#FFC629'];
      for (var i = 0; i < 9; i++) { if (i === 8 && !q.solved) continue; ctx.fillStyle = cols[(i * (q.solved ? 1 : 5)) % 8]; ctx.fillRect(q.x - 18 + (i % 3) * 12.3, q.y - 66 + Math.floor(i / 3) * 11.6, 11, 10.5); }
      if (!q.solved && Math.abs(P.x - q.x) < 160) { ctx.fillStyle = '#062A58'; label(PT('page.game.c.mosaic', 'Skok przy tablicy = mozaika'), q.x, q.y - 84, 300); }
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
      drawCoinAt(c.x, c.y + (reduceMotion ? 0 : Math.sin(gameT * 3 + c.ph) * 2.5), c.ph);
    });
  }
  function drawHidden() {
    L.hidden.forEach(function (h) {
      if (h.taken || h.zone != null || h.x < cam.x - 40 || h.x > cam.x + view.w + 40) return;
      var b = reduceMotion ? 0 : Math.sin(gameT * 2.4 + h.x) * 3;
      ctx.save(); ctx.translate(h.x, h.y + b); ctx.rotate(.12);
      var gl = ctx.createRadialGradient(0, 0, 4, 0, 0, 30); gl.addColorStop(0, 'rgba(255,198,41,.6)'); gl.addColorStop(1, 'rgba(255,198,41,0)');
      ctx.fillStyle = gl; ctx.fillRect(-30, -30, 60, 60);
      drawSticker(ctx, stopIcons[h.sec], 34, ((vT * .32 + h.x * .0007) % 1) * 1.7 - .35);
      ctx.restore();
    });
  }
  function drawEnemies() {
    L.enemies.forEach(function (e) {
      if (!e.alive) return;
      var ex = e.x != null ? e.x : e.hx; if (ex < cam.x - 60 || ex > cam.x + view.w + 60) return;
      if (e.type === 'roller') drawRollerE(e.x, e.y, e.r, e.rot, false);
      else if (e.type === 'beetle') {
        var f = e.vx < 0 ? -1 : 1, st = reduceMotion ? 0 : Math.sin(gameT * 20) * 1.5, bb = reduceMotion ? 0 : -Math.abs(Math.sin(gameT * 10)) * .8, c = ctx;
        c.save(); c.translate(e.x, e.y); c.scale(f, 1);
        c.fillStyle = 'rgba(20,14,30,.2)'; c.beginPath(); ell(c, 0, 0, 13, 2.2, 0); c.fill();
        inkOn(c, 2); c.beginPath(); for (var i = -1; i <= 1; i++) { c.moveTo(i * 6, -4); c.lineTo(i * 6 + (i ? st : -st), 0); } c.stroke();
        c.translate(0, bb);
        c.beginPath(); ell(c, 11, -8, 5.4, 5, 0); inkOn(c, 1.8); c.stroke(); c.fillStyle = '#26324A'; c.fill();
        c.strokeStyle = INK; c.lineWidth = 1.2; c.beginPath(); c.moveTo(13, -12); c.quadraticCurveTo(16, -18, 19, -17); c.moveTo(10, -12); c.quadraticCurveTo(11, -19, 14, -19); c.stroke();
        c.fillStyle = '#FFC629'; c.beginPath(); ell(c, 19, -17, 1.4, 1.4, 0); ell(c, 14, -19, 1.4, 1.4, 0); c.fill();
        c.beginPath(); ell(c, 0, -9, 12, 8.6, 0); inkOn(c, 2); c.stroke();
        var g = c.createRadialGradient(-4, -13, 1, 0, -9, 13); g.addColorStop(0, '#6BD69A'); g.addColorStop(.5, '#2A9A5C'); g.addColorStop(1, '#155C36'); c.fillStyle = g; c.fill();
        c.strokeStyle = 'rgba(14,26,43,.6)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-.5, -17.4); c.lineTo(-.5, -.6); c.stroke();
        c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); ell(c, -5, -13, 3.6, 1.8, 0); ell(c, 4, -14, 2, 1.2, 0); c.fill();
        c.fillStyle = '#C81E36'; c.beginPath(); ell(c, -6, -7, 1.6, 1.6, 0); ell(c, 5, -6, 1.4, 1.4, 0); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); ell(c, 12.6, -9, 2.2, 2.5, 0); c.fill(); c.fillStyle = INK; c.beginPath(); ell(c, 13.2, -8.8, 1.1, 1.4, 0); c.fill();
        c.restore();
      } else if (e.type === 'spiky') { // kolczak (łupina kasztana) — nie wolno na niego skakać
        var c2 = ctx; c2.save(); c2.translate(e.x, e.y - 12);
        var rot = reduceMotion ? 0 : gameT * (e.vx > 0 ? 2 : -2), blink = !reduceMotion && (gameT * 1.1 + e.x * .003) % 2.8 < .12;
        c2.beginPath();
        for (var k = 0; k < 12; k++) { var a = rot + k / 12 * Math.PI * 2, a2 = a + Math.PI / 12; c2.lineTo(Math.cos(a) * 18, Math.sin(a) * 18); c2.lineTo(Math.cos(a2) * 10, Math.sin(a2) * 10); }
        c2.closePath(); inkOn(c2, 2.2); c2.stroke(); var sg = c2.createRadialGradient(-4, -5, 2, 0, 0, 18); sg.addColorStop(0, '#9A7A3A'); sg.addColorStop(1, '#5A4210'); c2.fillStyle = sg; c2.fill();
        c2.beginPath(); ell(c2, 0, 0, 10.5, 10.5, 0); inkOn(c2, 1.6); c2.stroke(); var rg = c2.createRadialGradient(-3, -4, 1, 0, 0, 11); rg.addColorStop(0, '#F0576A'); rg.addColorStop(1, '#A8172C'); c2.fillStyle = rg; c2.fill();
        c2.fillStyle = 'rgba(255,255,255,.4)'; c2.beginPath(); ell(c2, -4, -5.5, 3, 1.8, 0); c2.fill();
        if (blink) { c2.strokeStyle = INK; c2.lineWidth = 1.3; c2.beginPath(); c2.moveTo(-6, -1.5); c2.lineTo(-1.5, -1.5); c2.moveTo(1.5, -1.5); c2.lineTo(6, -1.5); c2.stroke(); }
        else { c2.fillStyle = '#fff'; c2.beginPath(); ell(c2, -3.5, -2, 2.8, 3.2, 0); ell(c2, 3.5, -2, 2.8, 3.2, 0); c2.fill(); c2.fillStyle = INK; c2.beginPath(); ell(c2, -3, -1.5, 1.4, 1.7, 0); ell(c2, 4, -1.5, 1.4, 1.7, 0); c2.fill(); }
        c2.strokeStyle = INK; c2.lineWidth = 1.5; c2.beginPath(); c2.moveTo(-6.5, -6.5); c2.lineTo(-1.5, -5); c2.moveTo(6.5, -6.5); c2.lineTo(1.5, -5); c2.stroke();
        c2.restore();
      } else if (TER[L.sections[e.sec].terrain].sp) { drawPigeon(e);
      } else drawBat(e, e.mode === 'swoop');
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
      if (TER[L.sections[r.sec].terrain].balcony) { drawPot(r, ry, sh); return; }
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
      } else if (m.type === 'door' && m.lever) { drawLeverGate(m);
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
          ctx.fillStyle = '#FFC629';
          var s = fill(PT('page.game.c.seconds', '{n} s'), { n: Math.ceil(m.t) });
          label(s, m.x + 16, base - H - 18, 120, 26); label(s, m.plateX, m.g * TILE - 64, 120, 26);
        } else if (!m.done) {
          ctx.fillStyle = '#FFC629';
          label(PT('page.game.c.plate', 'stań na płycie'), m.plateX, m.g * TILE - 60, 220);
        }
      }
    });
  }
  function drawLeverGate(m) { // Spello: rzymska brama z kratą i dźwignia, która otwiera ją na kilka sekund
    if (m.x < cam.x - 300 || m.plateX > cam.x + view.w + 300) return;
    var base = m.g * TILE, lx = m.plateX, on = m.open && !m.done;
    ctx.fillStyle = '#3B2A00'; ctx.fillRect(lx - 14, base - 8, 28, 8); ctx.fillStyle = '#6E5F55'; ctx.fillRect(lx - 12, base - 7, 24, 6);
    ctx.save(); ctx.translate(lx, base - 6); ctx.rotate(on || m.done ? .7 : -.7);
    ctx.fillStyle = '#2E2A2C'; ctx.fillRect(-2.5, -40, 5, 40);
    ctx.fillStyle = on || m.done ? '#1F7A48' : '#C81E36'; ctx.beginPath(); ell(ctx, 0, -42, 7, 7, 0); ctx.fill();
    ctx.restore();
    var H = 5 * TILE, x = m.x, lift = ease(m.lift) * (H - 22);
    ctx.fillStyle = '#E9D2C7'; ctx.fillRect(x - 26, base - H - 30, 84, 30);                     // nadproże z łukiem
    ctx.fillStyle = 'rgba(120,80,70,.25)'; ctx.fillRect(x - 26, base - H - 30, 84, 3);
    [x - 26, x + 34].forEach(function (px) { ctx.fillStyle = '#ECD4C9'; ctx.fillRect(px, base - H, 24, H); ctx.fillStyle = 'rgba(120,80,70,.18)'; for (var j = 1; j < 6; j++) ctx.fillRect(px, base - j * TILE, 24, 2); });
    ctx.fillStyle = '#4E3D36'; ctx.beginPath(); ctx.moveTo(x - 2, base); ctx.lineTo(x - 2, base - H + 18); ctx.arc(x + 16, base - H + 18, 18, Math.PI, 0); ctx.lineTo(x + 34, base); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.rect(x - 2, base - H, 36, H); ctx.clip();
    for (var i = 0; i < 4; i++) { ctx.fillStyle = '#1B140E'; ctx.fillRect(x + 1 + i * 8, base - H - lift, 6, H); ctx.fillStyle = '#7D8796'; ctx.fillRect(x + 2 + i * 8, base - H - lift, 4, H); }
    ctx.fillStyle = '#1B140E'; ctx.fillRect(x - 2, base - H * .45 - lift, 36, 4); ctx.fillRect(x - 2, base - 12 - lift, 36, 4);
    ctx.restore();
    ctx.fillStyle = '#FFC629';
    if (on) { var sl = fill(PT('page.game.c.seconds', '{n} s'), { n: Math.ceil(m.t) }); label(sl, x + 16, base - H - 40, 120, 26); label(sl, lx, base - 64, 120, 26); }
    else if (!m.done && Math.abs(P.x - lx) < 420) { ctx.fillStyle = '#062A58'; label(PT('page.game.c.lever', 'dźwignia otwiera bramę'), lx, base - 70, 240); }
  }
  function drawStands() { // stojak z balonikami nad doliną (belvedere)
    L.stands.forEach(function (st) {
      if (st.x < cam.x - 80 || st.x > cam.x + view.w + 80) return;
      var x = st.x, y = st.y, bob = reduceMotion ? 0 : Math.sin(gameT * 2) * 3;
      ctx.fillStyle = '#3B2A00'; ctx.fillRect(x - 3, y - 60, 6, 60); ctx.fillRect(x - 16, y - 4, 32, 4);
      var BC = ['#C81E36', '#0B4EA2', '#FFC629', '#1F7A48', '#E8467C'];
      ctx.strokeStyle = '#3B2A00'; ctx.lineWidth = 1.3;
      for (var i = 0; i < 5; i++) {
        var bx = x + (i - 2) * 13, by = y - 92 - (i % 2) * 14 + bob * (i % 2 ? 1 : -1);
        ctx.beginPath(); ctx.moveTo(x, y - 58); ctx.lineTo(bx, by + 14); ctx.stroke();
        ctx.fillStyle = BC[i]; ctx.beginPath(); ell(ctx, bx, by, 10, 12, 0); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ell(ctx, bx - 3, by - 4, 2.5, 4, 0); ctx.fill();
      }
      if (P.power !== 'balloon' && Math.abs(P.x - x) < 300) { ctx.fillStyle = '#062A58'; label(PT('page.game.c.stand', 'weź balonik'), x, y - 130, 200); }
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
      ctx.fillStyle = '#0B4EA2';
      label(PT('page.game.c.shortcut', 'skrót'), sp.x, sp.y - hgt - 10, 140);
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
      if (gt.kind === 'cart') { drawCartGate(gt, x, base); return; }
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
        ctx.fillStyle = T.pillar || (T.top === '#3E9A5C' || T.top === '#3F9358' ? '#D9CDB4' : T.topHi); ctx.fillRect(px, base - H, 12, H);
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
        if (!gt.open) { ctx.fillStyle = '#062A58'; label(PT('page.game.c.push', 'przepchnij!'), x + 16, base - 100, 200); }
        return;
      }
      if (gt.kind === 'rope') { // szyb z liną
        ctx.fillStyle = TER.cave.fillDk; ctx.fillRect(x - 6, 2 * TILE, 44, base - 2 * TILE);
        ctx.strokeStyle = '#C99A60'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + 16, 2 * TILE); ctx.lineTo(x + 16 + Math.sin(gameT * 2) * 3, base - 20); ctx.stroke();
        ctx.fillStyle = 'rgba(79,164,160,.8)'; ctx.fillRect(x - 6, base - 16, 44, 16);
        if (gt.open) return;
        ctx.fillStyle = '#FFC629'; label(PT('page.game.c.rope', 'lina w górę'), x + 16, base - 140, 200);
        return;
      }
      if (gt.kind === 'organ') { // dźwięczące nacieki nad bramą
        ['#0B4EA2', '#FFC629', '#1F7A48', '#C81E36'].forEach(function (col, k) {
          var px = x - 10 + k * 14, len = 40 + (k % 2) * 16, lit = gt.lit === k;
          ctx.fillStyle = '#0E1A2B'; ctx.beginPath(); ctx.moveTo(px - 6, base - H - 14); ctx.lineTo(px, base - H - 14 + len + 2); ctx.lineTo(px + 6, base - H - 14); ctx.fill();
          ctx.fillStyle = lit ? '#fff' : col; ctx.beginPath(); ctx.moveTo(px - 4.5, base - H - 14); ctx.lineTo(px, base - H - 14 + len - 2); ctx.lineTo(px + 4.5, base - H - 14); ctx.fill();
        });
      }
      var ok = gt.open, my = base - H - 30 + (reduceMotion || ok ? 0 : Math.sin(gameT * 2.4 + x) * 2);
      ctx.fillStyle = 'rgba(6,42,88,.25)'; ctx.beginPath(); ell(ctx, x + 17.5, my + 3, 21, 21, 0); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ell(ctx, x + 16, my, 21.5, 21.5, 0); ctx.fill();
      ctx.fillStyle = INK; ctx.beginPath(); ell(ctx, x + 16, my, 18.5, 18.5, 0); ctx.fill();
      ctx.fillStyle = ok ? '#1F7A48' : '#0B4EA2'; ctx.beginPath(); ell(ctx, x + 16, my, 17, 17, 0); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.beginPath(); ell(ctx, x + 10, my - 7, 7, 4.5, 0); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = font(24); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ok ? '✓' : gt.kind === 'organ' ? '♪' : '?', x + 16, my + 1);
      ctx.textBaseline = 'alphabetic';
    });
  }
  function drawCartGate(gt, x, base) { // wózek z kwiatami w poprzek stromej uliczki — po wepchnięciu odjeżdża w górę
    var cx = x + 16 + ease(gt.lift) * 160, cy = base - ease(gt.lift) * 40;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-ease(gt.lift) * .2);
    ctx.fillStyle = '#3B2A00'; ctx.fillRect(-40, -54, 80, 40);
    ctx.fillStyle = '#9A6A35'; ctx.fillRect(-38, -52, 76, 36); ctx.fillStyle = '#7A4E25'; ctx.fillRect(-38, -38, 76, 3); ctx.fillRect(-38, -26, 76, 3);
    var FL = ['#E8467C', '#FFC629', '#C81E36', '#FFFFFF', '#B07CE0', '#FF8A3D'];
    for (var fi = 0; fi < 9; fi++) { ctx.fillStyle = FL[fi % 6]; ctx.beginPath(); ell(ctx, -32 + fi * 8, -58 - (fi % 3) * 4, 6, 6, 0); ctx.fill(); }
    ctx.fillStyle = '#4F8A3F'; ctx.fillRect(-36, -56, 72, 4);
    ctx.fillStyle = '#0E1A2B'; ctx.beginPath(); ell(ctx, -24, -12, 12, 12, 0); ell(ctx, 24, -12, 12, 12, 0); ctx.fill();
    ctx.fillStyle = '#C99A60'; ctx.beginPath(); ell(ctx, -24, -12, 8, 8, 0); ell(ctx, 24, -12, 8, 8, 0); ctx.fill();
    ctx.fillStyle = '#3B2A00'; ctx.beginPath(); ell(ctx, -24, -12, 3, 3, 0); ell(ctx, 24, -12, 3, 3, 0); ctx.fill();
    ctx.restore();
    if (!gt.open) { ctx.fillStyle = '#062A58'; label(PT('page.game.c.cart_push', 'pchnij wózek!'), x + 16, base - 110, 220); }
  }
  function drawLandmarks() {
    L.landmarks.forEach(function (lm) {
      if (lm.x < cam.x - 160 || lm.x > cam.x + view.w + 160) return;
      var x = lm.x, y = lm.y, img = stopIcons[lm.sec];
      ctx.fillStyle = 'rgba(20,14,30,.22)'; ctx.beginPath(); ell(ctx, x, y - 1, 12, 2.6, 0); ctx.fill();
      ctx.fillStyle = INK; roundRect(ctx, x - 5, y - 74, 10, 74, 3); ctx.fill();
      var pg = ctx.createLinearGradient(x - 4, 0, x + 4, 0); pg.addColorStop(0, '#C79A62'); pg.addColorStop(1, '#7E5630'); ctx.fillStyle = pg; roundRect(ctx, x - 3.6, y - 72.6, 7.2, 72, 2.4); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(x - 2.6, y - 71, 1.2, 68);
      if (lm.done && (!celebration || celebration.lm !== lm)) {
        ctx.fillStyle = INK; ctx.beginPath(); ell(ctx, x, y - 84, 17.5, 17.5, 0); ctx.fill();
        var cg = ctx.createRadialGradient(x - 5, y - 90, 2, x, y - 84, 16); cg.addColorStop(0, '#46B576'); cg.addColorStop(1, '#1F7A48'); ctx.fillStyle = cg; ctx.beginPath(); ell(ctx, x, y - 84, 15.5, 15.5, 0); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ell(ctx, x - 5, y - 90, 5, 3, 0); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = font(20); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✓', x, y - 83); ctx.textBaseline = 'alphabetic';
        return;
      }
      var bob = reduceMotion ? 0 : Math.sin(gameT * 2) * 3, S = 104;
      var gl = ctx.createRadialGradient(x, y - 128, 10, x, y - 128, 110);
      gl.addColorStop(0, 'rgba(255,214,90,.55)'); gl.addColorStop(1, 'rgba(255,198,41,0)');
      ctx.fillStyle = gl; ctx.fillRect(x - 110, y - 238, 220, 220);
      if (!reduceMotion) { ctx.save(); ctx.translate(x, y - 128); ctx.rotate(gameT * .25); ctx.fillStyle = 'rgba(255,236,160,.16)'; for (var i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(100, -14); ctx.lineTo(100, 14); ctx.fill(); } ctx.restore();
        for (var j = 0; j < 3; j++) { var a = gameT * .9 + j * 2.1; star(ctx, x + Math.cos(a) * 70, y - 128 + Math.sin(a) * 58, 3.5 + Math.sin(gameT * 3 + j) * 1.2, 'rgba(255,250,220,.9)'); } }
      ctx.save(); ctx.translate(x, y - 128 + bob); ctx.rotate(-.06 + (reduceMotion ? 0 : Math.sin(gameT * 1.3) * .025));
      drawSticker(ctx, img, S, ((vT * .28) % 1) * 1.7 - .35);
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
  function drawPlayer() {
    if (P.inv > 0 && P.nap <= 0 && Math.floor(P.inv * 10) % 2 === 0) return;
    var kind;
    if (P.nap > 0) kind = 'nap';
    else if (P.hurtT > 0) kind = 'hurt';
    else if (!P.onGround) kind = (curPower() === 'glide' && input.jump && P.vy >= 80) ? 'glide' : P.vy < 0 ? 'jump' : 'fall';
    else kind = Math.abs(P.vx) > 15 ? 'walk' : 'idle';
    var pose = quoPose(kind, P.t, { phase: P.phase, land: P.land });
    var gy = groundBelow(P.x, P.y), hh = clamp((gy - P.y) / 170, 0, 1), sa = 1 - hh * .7; // cień: mniejszy i jaśniejszy, im wyżej
    if (gy - P.y < 400) { ctx.fillStyle = 'rgba(14,26,43,' + (.24 * sa).toFixed(3) + ')'; ctx.beginPath(); ell(ctx, P.x, gy - 1, 14 * sa + 2, 3.6 * sa + .8, 0); ctx.fill(); }
    if (P.zip >= 0) pose = quoPose('jump', P.t);
    if (P.cart >= 0) pose = quoPose('cheer', P.t);
    if (P.climb) pose = quoPose('climb', P.t, { phase: P.y / 9 });
    quoExtras(pose, kind);
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
    var inZ = P && P.zone >= 0, maxR = inZ ? L.cx[P.zone].H : ROWS, r0 = Math.max(Math.floor(y / TILE), inZ ? 0 : L.sky ? -L.skyH : 0);
    for (var r = r0; r < maxR; r++) { var v = tileAt(Math.floor(x / TILE), r); if (SOLID[v] || ONEWAY[v] || v === 10) return r * TILE; }
    return maxR * TILE + 200;
  }
  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i], a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      if (p.kind === 'dust') { ctx.globalAlpha = a * .7; ctx.fillStyle = p.col; ctx.beginPath(); ell(ctx, p.x, p.y, p.size * (1.5 - a * .6), p.size * (1.2 - a * .5), 0); ctx.fill(); }
      else if (p.kind === 'star') star(ctx, p.x, p.y, p.size * (.5 + a * .7), p.col);
      else if (p.kind === 'ring') { ctx.strokeStyle = p.col; ctx.lineWidth = 2.2 * a + .4; ctx.beginPath(); ctx.arc(p.x, p.y, p.size + (1 - a) * 22, 0, Math.PI * 2); ctx.stroke(); }
      else if (p.size <= 5) { ctx.fillStyle = p.col; ctx.beginPath(); ell(ctx, p.x, p.y, p.size / 2 + .3, p.size / 2 + .3, 0); ctx.fill(); }
      else { ctx.fillStyle = p.col; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    }
    ctx.globalAlpha = 1;
  }
  /* --- Rysowanie komnat --- */
  TER.crypt = { fill: '#8A7B66', fillDk: '#6E614D', speck: '#9C8E77', top: '#A39377', topHi: '#CDBFA2', plat: '#7A6A52', platDk: '#54473A', back: '#2E261F', backLn: '#3B3128' };
  TER.cave.back = '#0F1B30'; TER.cave.backLn = '#16263F';
  // Spello: wykopaliska pod willą (rzymski mur w siateczkę — opus reticulatum) i ciemna cysterna
  TER.dig = { fill: '#C49A74', fillDk: '#8E6A4F', speck: '#D8B48F', top: '#D8C2A2', topHi: '#EFE2CC', plat: '#7A5A3A', platDk: '#523B25', back: '#3A2A22', backLn: '#47352B', reti: true };
  TER.cistern = { fill: '#6F7C86', fillDk: '#525D66', speck: '#87949E', top: '#8E9BA4', topHi: '#B9C4CC', plat: '#5C4A3A', platDk: '#3E3126', back: '#121A22', backLn: '#1A2530' };
  function renderZone() { shakeStep(); cam.x += RSX; cam.y += RSY; try { renderZone0(); } finally { cam.x -= RSX; cam.y -= RSY; } }
  var RC = {};
  function roomStatic(v) { return !v || v === 1 || v === 16 || v === 2 || v === 10 || v === 7 || !!DOOR_COL[v]; }
  function roomCache(Z, ri, rm, T) { // tło komnaty + nieruchome kafle: rysowane raz, potem kopiowane
    var c0 = rm.x0 / TILE, r0 = rm.y0 / TILE, sig = 7, key = P.zone + '|' + ri;
    for (var r = r0 - 1; r <= r0 + RH; r++) for (var c = c0 - 1; c <= c0 + RW; c++) { var v = (r < 0 || c < 0 || r >= Z.H || c >= Z.W) ? 1 : Z.grid[r * Z.W + c]; sig = (Math.imul(sig, 31) + (roomStatic(v) ? v + 1 : 0)) | 0; }
    var e = RC[key]; if (e && e.sig === sig && e.k === LC.k && e.lv === L) return e;
    var k = LC.k, cv = (e && e.cv) || document.createElement('canvas'); cv.width = Math.ceil(RW * TILE * k); cv.height = Math.ceil(RH * TILE * k);
    var cx = cv.getContext('2d'), save = ctx; cx.setTransform(k, 0, 0, k, -rm.x0 * k, -rm.y0 * k); ctx = cx;
    try {
      var W = rm.x1 - rm.x0, H = rm.y1 - rm.y0;
      ctx.fillStyle = T.back; ctx.fillRect(rm.x0, rm.y0, W, H);
      for (var y = rm.y0, row = 0; y < rm.y1; y += 24, row++) for (var x = rm.x0 + (row % 2 ? 0 : 24) - 48; x < rm.x1; x += 48) { var h = hashXY(x + ri * 7, y); // cegły w różnych odcieniach
        ctx.fillStyle = h % 4 === 0 ? 'rgba(255,255,255,.05)' : h % 4 === 1 ? 'rgba(0,0,0,.08)' : h % 4 === 2 ? 'rgba(255,220,180,.04)' : 'rgba(0,0,0,0)'; ctx.fillRect(x + 2, y + 2, 46, 22);
        ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(x + 2, y + 2, 46, 1.5); }
      ctx.fillStyle = T.backLn;
      for (y = rm.y0; y < rm.y1; y += 24) { ctx.fillRect(rm.x0, y, W, 2); for (x = rm.x0 + ((y / 24) % 2 ? 0 : 24); x < rm.x1; x += 48) ctx.fillRect(x, y, 2, 24); }
      if (rm.theme === 'dig') {
        var mx = rm.x0 + TILE * (4 + (ri * 5) % 6), my = rm.y0 + TILE * 2.2, MC = ['#E8DDC9', '#B5543A', '#2F5D8C', '#D9A441', '#3E3530'];
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(mx - 4, my - 4, 5 * TILE + 8, 2 * TILE + 8);
        for (var mr = 0; mr < 8; mr++) for (var mc = 0; mc < 20; mc++) { var e2 = mr === 0 || mr === 7 || mc === 0 || mc === 19; ctx.fillStyle = e2 ? MC[1] : MC[((mc * 3 + mr * 5 + ri) % 11 === 0) ? 2 : ((mc + mr) % 7 === 0 ? 3 : 0)]; ctx.fillRect(mx + mc * 8, my + mr * 8, 7, 7); }
      }
      var vg = ctx.createRadialGradient(rm.x0 + W / 2, rm.y0 + H * .45, H * .2, rm.x0 + W / 2, rm.y0 + H / 2, W * .62); vg.addColorStop(0, 'rgba(255,220,170,.06)'); vg.addColorStop(1, 'rgba(0,0,0,.42)');
      ctx.fillStyle = vg; ctx.fillRect(rm.x0, rm.y0, W, H);
      for (r = r0; r < r0 + RH; r++) for (c = c0; c < c0 + RW; c++) { v = Z.grid[r * Z.W + c]; if (v && roomStatic(v)) { snapTile(cx, c * TILE, r * TILE, rm.x0, rm.y0, k); drawZoneTile(Z, T, rm.theme, c, r); } }
    } finally { ctx = save; }
    e = { cv: cv, sig: sig, k: k, lv: L }; RC[key] = e;
    var ks = Object.keys(RC); if (ks.length > 4) delete RC[ks[0] === key ? ks[1] : ks[0]];
    return e;
  }
  function renderZone0() {
    var Z = curZone(), k = view.s * view.dpr, ri = P.room >= 0 ? P.room : roomOf(Z, P.x, P.y - 24), rm = Z.rooms[ri], T = TER[rm.theme];
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = '#070C16'; ctx.fillRect(0, 0, view.w, view.h);
    ctx.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k);
    ctx.save(); ctx.beginPath(); ctx.rect(rm.x0, rm.y0, rm.x1 - rm.x0, rm.y1 - rm.y0); ctx.clip();
    var rc = roomCache(Z, ri, rm, T); ctx.drawImage(rc.cv, 0, 0, rc.cv.width, rc.cv.height, rm.x0, rm.y0, rm.x1 - rm.x0, rm.y1 - rm.y0);
    var c0z = rm.x0 / TILE, r0z = rm.y0 / TILE;
    for (var rz = r0z; rz < r0z + RH; rz++) for (var cz = c0z; cz < c0z + RW; cz++) if (!roomStatic(Z.grid[rz * Z.W + cz])) drawZoneTile(Z, T, rm.theme, cz, rz);
    drawZoneBars(Z, ri);
    if (Z.exit && Z.exit.room === ri) drawExitDoor(Z.exit.x, Z.exit.y, true);
    Z.coins.forEach(function (c) { if (!c.taken && roomOf(Z, c.x, c.y) === ri) drawCoin(c); });
    Z.items.forEach(function (it) { if (!it.taken && it.room === ri) drawZoneItem(it); });
    L.hidden.forEach(function (h) {
      if (h.zone !== P.zone || h.taken || roomOf(Z, h.x, h.y) !== ri) return;
      ctx.save(); ctx.translate(h.x, h.y + (reduceMotion ? 0 : Math.sin(gameT * 2.4 + h.x) * 3)); ctx.rotate(.12);
      var gl = ctx.createRadialGradient(0, 0, 4, 0, 0, 30); gl.addColorStop(0, 'rgba(255,198,41,.6)'); gl.addColorStop(1, 'rgba(255,198,41,0)');
      ctx.fillStyle = gl; ctx.fillRect(-30, -30, 60, 60); drawSticker(ctx, stopIcons[h.sec], 34, ((vT * .32 + h.x * .0007) % 1) * 1.7 - .35); ctx.restore();
    });
    Z.enemies.forEach(function (e) { if (e.room === ri) drawZoneEnemy(e); });
    drawPlayer();
    drawParticles();
    drawPops();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 2; ctx.strokeRect(rm.x0 - 1, rm.y0 - 1, rm.x1 - rm.x0 + 2, rm.y1 - rm.y0 + 2);
    if (rm.dark) drawZoneDark(Z, ri);
    drawGrade(rm.theme);
    drawWipe();
    drawZoneHUD(Z, ri);
  }
  function drawCoin(c) { drawCoinAt(c.x, c.y + (reduceMotion ? 0 : Math.sin(gameT * 3 + c.ph) * 2.5), c.ph); }
  function drawZoneTile(Z, T, theme, c, r) {
    var v = Z.grid[r * Z.W + c], px = c * TILE, py = r * TILE;
    if (!v) return;
    function sol(x, y) { if (x < 0 || y < 0 || x >= Z.W || y >= Z.H) return true; var w = Z.grid[y * Z.W + x]; return w === 1 || w === 16; }
    if (v === 1 || v === 16) {
      drawSolid(T, theme === 'cave' || theme === 'crypt' ? theme : theme === 'dig' || theme === 'cistern' ? theme : 'crypt', px, py, !sol(c, r - 1), !sol(c, r + 1), !sol(c - 1, r), !sol(c + 1, r), hashXY(c, r));
      if (v === 16) { // pęknięta ściana
        ctx.fillStyle = 'rgba(201,166,107,.45)'; ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
        ctx.strokeStyle = '#1B140E'; ctx.lineWidth = 2.5; ctx.beginPath();
        ctx.moveTo(px + 6, py + 2); ctx.lineTo(px + 14, py + 12); ctx.lineTo(px + 10, py + 20); ctx.lineTo(px + 20, py + 30);
        ctx.moveTo(px + 14, py + 12); ctx.lineTo(px + 26, py + 8); ctx.stroke();
        ctx.fillStyle = 'rgba(255,214,120,.35)'; ctx.fillRect(px + 12, py + 11, 3, 3);
      }
    } else if (v === 2) drawPlatform(T, theme, px, py, Z.grid[r * Z.W + c - 1] === 2, Z.grid[r * Z.W + c + 1] === 2);
    else if (v === 3) {
      var surf = r === 0 || Z.grid[(r - 1) * Z.W + c] !== 3;
      ctx.fillStyle = 'rgba(54,140,150,.85)'; ctx.fillRect(px, py + (surf ? 8 : 0), TILE, TILE - (surf ? 8 : 0));
      if (surf) { ctx.fillStyle = '#7CC8C4'; ctx.fillRect(px, py + 7 + (reduceMotion ? 0 : Math.sin(gameT * 3 + c) * 2), TILE, 3); }
    } else if (v === 10) { // drabina
      ctx.fillStyle = '#4A2F17'; ctx.fillRect(px + 5, py, 5, TILE); ctx.fillRect(px + 22, py, 5, TILE);
      ctx.fillStyle = '#A9763D'; ctx.fillRect(px + 6, py, 3, TILE); ctx.fillRect(px + 23, py, 3, TILE);
      for (var i = 4; i < TILE; i += 10) { ctx.fillStyle = '#4A2F17'; ctx.fillRect(px + 5, py + i, 22, 5); ctx.fillStyle = '#C99A60'; ctx.fillRect(px + 6, py + i + 1, 20, 2); }
    } else if (v === 11) { // lina (jaskinia) albo łańcuch (krypta)
      var sw = reduceMotion ? 0 : Math.sin(gameT * 1.6 + c) * 1.5;
      if (theme === 'cave') { ctx.fillStyle = '#6B4522'; ctx.fillRect(px + 14 + sw, py, 5, TILE); ctx.fillStyle = '#C99A60'; for (i = 0; i < TILE; i += 8) ctx.fillRect(px + 15 + sw, py + i, 3, 4); }
      else { ctx.strokeStyle = '#B9C6D8'; ctx.lineWidth = 2.5; for (i = 0; i < TILE; i += 10) { ctx.beginPath(); ctx.ellipse(px + 16 + sw, py + i + 5, i % 20 ? 2 : 4, 5, 0, 0, Math.PI * 2); ctx.stroke(); } }
    } else if (v === 12 || v === 13) { // ruchoma posadzka
      ctx.fillStyle = '#1E2C44'; ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = '#3F4756'; ctx.fillRect(px, py, TILE, 10);
      var dir = v === 13 ? 1 : -1, off = reduceMotion ? 0 : ((gameT * Z.conv * dir) % 16 + 16) % 16;
      ctx.fillStyle = '#FFC629';
      for (var k2 = -16; k2 < TILE; k2 += 16) { var ax = px + k2 + off; if (ax < px - 4 || ax > px + TILE - 8) continue; ctx.beginPath(); ctx.moveTo(ax + (dir > 0 ? 0 : 8), py + 2); ctx.lineTo(ax + (dir > 0 ? 8 : 0), py + 5); ctx.lineTo(ax + (dir > 0 ? 0 : 8), py + 8); ctx.fill(); }
      ctx.fillStyle = 'rgba(14,26,43,.5)'; ctx.fillRect(px, py + 10, TILE, 2);
    } else if (v === 14 || v === 15) { // znikające mostki
      var left = bridgeLeft(Z, v), on = left >= 0, warn = on && left < .5;
      if (!on) { ctx.strokeStyle = 'rgba(201,154,96,.35)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.strokeRect(px + 1, py + 1, TILE - 2, 10); ctx.setLineDash([]); }
      else if (!warn || reduceMotion || Math.floor(gameT * 10) % 2) {
        ctx.fillStyle = '#4A2F17'; ctx.fillRect(px, py, TILE, 12); ctx.fillStyle = v === 14 ? '#C99A60' : '#A9C7E8'; ctx.fillRect(px + 1, py + 1, TILE - 2, 8);
        ctx.fillStyle = '#4A2F17'; ctx.fillRect(px + 15, py + 1, 2, 8);
      }
    } else if (v === 7) {
      ctx.fillStyle = '#0E1A2B'; ctx.beginPath();
      for (i = 0; i < 4; i++) { ctx.moveTo(px + i * 8, py + TILE); ctx.lineTo(px + i * 8 + 4, py + 10); ctx.lineTo(px + i * 8 + 8, py + TILE); }
      ctx.fill();
    } else if (DOOR_COL[v]) { // drzwi na klucz
      var col = COL_RGB[DOOR_COL[v]], topD = Z.grid[(r - 1) * Z.W + c] !== v;
      ctx.fillStyle = '#3B2A00'; ctx.fillRect(px + 2, py, TILE - 4, TILE);
      ctx.fillStyle = '#8C5E2E'; ctx.fillRect(px + 4, py + (topD ? 3 : 0), TILE - 8, TILE - (topD ? 3 : 0));
      ctx.fillStyle = col; ctx.fillRect(px + 4, py + 12, TILE - 8, 7);
      if (Z.grid[(r + 1) * Z.W + c] !== v) { ctx.fillStyle = '#0E1A2B'; ctx.beginPath(); ell(ctx, px + 16, py + 6, 4, 4, 0); ctx.fill(); ctx.fillRect(px + 14, py + 8, 4, 8); }
    }
  }
  function drawZoneBars(Z, ri) {
    Z.bars.forEach(function (b) {
      if (b.room !== ri) return;
      var x = b.c * TILE, y0 = b.r0 * TILE, hgt = (b.r1 - b.r0 + 1) * TILE, lift = barLift(b) * (hgt - 10);
      ctx.save(); ctx.beginPath(); ctx.rect(x - 2, y0, TILE + 4, hgt); ctx.clip();
      for (var i = 0; i < 3; i++) { ctx.fillStyle = '#1B140E'; ctx.fillRect(x + 3 + i * 10, y0 - lift, 7, hgt); ctx.fillStyle = '#9C8E77'; ctx.fillRect(x + 4 + i * 10, y0 - lift, 4, hgt); }
      ctx.fillStyle = '#1B140E'; for (var yy = 20; yy < hgt; yy += 48) ctx.fillRect(x + 1, y0 - lift + yy, TILE - 2, 5);
      ctx.restore();
      ctx.fillStyle = '#54473A'; ctx.fillRect(x - 4, y0 - 6, TILE + 8, 8);
    });
  }
  function drawExitDoor(x, y, open) {
    ctx.fillStyle = '#3B2A00'; ctx.beginPath(); ctx.moveTo(x - 22, y); ctx.lineTo(x - 22, y - 46); ctx.arc(x, y - 46, 22, Math.PI, 0); ctx.lineTo(x + 22, y); ctx.fill();
    var g = ctx.createLinearGradient(0, y - 66, 0, y);
    g.addColorStop(0, open ? '#FFF4CF' : '#0E1A2B'); g.addColorStop(1, open ? '#7CC88A' : '#2B3D5A');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 17, y); ctx.lineTo(x - 17, y - 46); ctx.arc(x, y - 46, 17, Math.PI, 0); ctx.lineTo(x + 17, y); ctx.fill();
    if (open && !reduceMotion) { ctx.fillStyle = 'rgba(255,244,207,' + (.25 + .2 * Math.sin(gameT * 3)).toFixed(2) + ')'; ctx.beginPath(); ell(ctx, x, y - 34, 34, 40, 0); ctx.fill(); }
    ctx.fillStyle = '#FFC629'; ctx.beginPath(); ctx.moveTo(x, y - 82); ctx.lineTo(x + 9, y - 72); ctx.lineTo(x - 9, y - 72); ctx.fill();
  }
  function drawItemIcon(c, k, x, y, s) {
    c.save(); c.translate(x, y); c.scale(s, s);
    if (k.indexOf('key:') === 0) {
      var col = COL_RGB[k.slice(4)];
      c.fillStyle = '#0E1A2B'; c.beginPath(); ell(c, -6, 0, 8, 8, 0); c.fill(); c.fillRect(-2, -3, 16, 6); c.fillRect(8, 0, 3, 7); c.fillRect(12, 0, 3, 5);
      c.fillStyle = col; c.beginPath(); ell(c, -6, 0, 6, 6, 0); c.fill(); c.fillRect(-1, -1.5, 14, 3); c.fillRect(9, 0, 1.5, 5.5); c.fillRect(13, 0, 1.5, 3.5);
      c.fillStyle = '#0E1A2B'; c.beginPath(); ell(c, -6, 0, 2.2, 2.2, 0); c.fill();
    } else if (k === 'torch') {
      c.fillStyle = '#4A2F17'; c.fillRect(-3, -2, 6, 16); c.fillStyle = '#A9763D'; c.fillRect(-2, -2, 4, 15);
      c.fillStyle = '#E8A912'; c.beginPath(); c.moveTo(-6, -2); c.quadraticCurveTo(-7, -12, 0, -18); c.quadraticCurveTo(7, -12, 6, -2); c.fill();
      c.fillStyle = '#FFF4CF'; c.beginPath(); c.moveTo(-3, -2); c.quadraticCurveTo(-3, -9, 0, -12); c.quadraticCurveTo(3, -9, 3, -2); c.fill();
    } else if (k === 'pickaxe') {
      c.rotate(-.6); c.fillStyle = '#4A2F17'; c.fillRect(-2, -6, 4, 22); c.fillStyle = '#A9763D'; c.fillRect(-1, -6, 2, 21);
      c.fillStyle = '#3F4756'; c.beginPath(); c.moveTo(-14, -4); c.quadraticCurveTo(0, -14, 14, -4); c.lineTo(12, -2); c.quadraticCurveTo(0, -9, -12, -2); c.fill();
      c.fillStyle = '#B9C6D8'; c.fillRect(-3, -10, 6, 5);
    }
    c.restore();
  }
  function drawZoneItem(it) {
    var b = reduceMotion ? 0 : Math.sin(gameT * 3 + it.x) * 2;
    if (it.k === 'chest') { drawChest(it.x - 16, it.y - 32, it.open, null); return; }
    if (it.k === 'pu') { if (it.life > 0 && it.life < 1.6 && Math.floor(it.life * 8) % 2) return; drawPuIcon(it.kind, it.x, it.y + b, 1.15); return; }
    var gl = ctx.createRadialGradient(it.x, it.y, 2, it.x, it.y, 26); gl.addColorStop(0, 'rgba(255,230,140,.55)'); gl.addColorStop(1, 'rgba(255,230,140,0)');
    ctx.fillStyle = gl; ctx.fillRect(it.x - 26, it.y - 26, 52, 52);
    drawItemIcon(ctx, it.k, it.x, it.y + b, 1.25);
  }
  function drawZoneEnemy(e) {
    if (e.type === 'rbat') { drawBat(e, true); return; }
    if (e.type === 'rstone') {
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.rot);
      ctx.fillStyle = '#3F3529'; ctx.beginPath(); ell(ctx, 0, 0, e.r + 1.5, e.r + 1.5, 0); ctx.fill();
      ctx.fillStyle = '#9C8E77'; ctx.beginPath(); ell(ctx, 0, 0, e.r, e.r, 0); ctx.fill();
      ctx.fillStyle = '#7A6A52'; ctx.beginPath(); ell(ctx, -5, -4, 4, 3, 0); ell(ctx, 5, 5, 3, 2.5, 0); ctx.fill();
      ctx.restore();
    } else if (e.type === 'rbat') {
      var flap = reduceMotion ? .5 : Math.sin(e.t * 18) * .5 + .5;
      ctx.save(); ctx.translate(e.x, e.y); ctx.fillStyle = '#4A2E5A';
      ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(-20, -8 + flap * 14); ctx.lineTo(-14, 2); ctx.lineTo(-8, 4); ctx.closePath();
      ctx.moveTo(4, -2); ctx.lineTo(20, -8 + flap * 14); ctx.lineTo(14, 2); ctx.lineTo(8, 4); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ell(ctx, 0, 0, 8.5, 8, 0); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ell(ctx, -3, -1, 2.6, 2.8, 0); ell(ctx, 3, -1, 2.6, 2.8, 0); ctx.fill();
      ctx.fillStyle = '#0E1A2B'; ctx.beginPath(); ell(ctx, -2.6, -.6, 1.3, 1.6, 0); ell(ctx, 3.4, -.6, 1.3, 1.6, 0); ctx.fill();
      ctx.restore();
    } else if (e.type === 'spider') {
      ctx.strokeStyle = 'rgba(230,236,245,.75)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(e.x, e.top); ctx.lineTo(e.x, e.y - 8); ctx.stroke();
      ctx.save(); ctx.translate(e.x, e.y);
      ctx.strokeStyle = '#0E1A2B'; ctx.lineWidth = 2; ctx.beginPath();
      for (var i = 0; i < 4; i++) { var a = (i - 1.5) * .45; ctx.moveTo(0, 0); ctx.lineTo(-13, 4 + a * 10); ctx.lineTo(-16, 10 + a * 8); ctx.moveTo(0, 0); ctx.lineTo(13, 4 + a * 10); ctx.lineTo(16, 10 + a * 8); }
      ctx.stroke();
      ctx.beginPath(); ell(ctx, 0, 0, 9, 8, 0); inkOn(ctx, 2); ctx.stroke(); var spg = ctx.createRadialGradient(-3, -3, 1, 0, 0, 10); spg.addColorStop(0, '#5A6488'); spg.addColorStop(1, '#2A3050'); ctx.fillStyle = spg; ctx.fill();
      ctx.fillStyle = '#C81E36'; ctx.beginPath(); ell(ctx, 0, 4.5, 2.2, 1.6, 0); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ell(ctx, -3, -2, 2.6, 3, 0); ell(ctx, 3, -2, 2.6, 3, 0); ctx.fill();
      ctx.fillStyle = '#0E1A2B'; ctx.beginPath(); ell(ctx, -3, -1.4, 1.3, 1.6, 0); ell(ctx, 3, -1.4, 1.3, 1.6, 0); ctx.fill();
      ctx.restore();
    }
  }
  var shadeZ = document.createElement('canvas'), szctx = shadeZ.getContext('2d');
  function drawZoneDark(Z, ri) { // ciemność w niskiej rozdzielczości (1/4) — tanio na telefonach, i tak jest rozmyta
    var sctx = szctx, sw = Math.max(1, Math.round(view.cssW / 4)), sh = Math.max(1, Math.round(view.cssH / 4)), sc = sw / view.w;
    if (shadeZ.width !== sw || shadeZ.height !== sh) { shadeZ.width = sw; shadeZ.height = sh; }
    sctx.globalCompositeOperation = 'source-over'; sctx.clearRect(0, 0, sw, sh);
    sctx.fillStyle = 'rgba(2,6,16,.94)'; sctx.fillRect(0, 0, sw, sh);
    sctx.globalCompositeOperation = 'destination-out';
    function hole(x, y, r) {
      var sx = (x - cam.x) * sc, sy = (y - cam.y) * sc, rr = r * sc;
      var g = sctx.createRadialGradient(sx, sy, rr * .3, sx, sy, rr); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      sctx.fillStyle = g; sctx.beginPath(); sctx.arc(sx, sy, rr, 0, Math.PI * 2); sctx.fill();
    }
    var torch = hasBag('torch'), R = (torch ? 230 : 72) + (P.power === 'lantern' ? 90 : 0) + (curHat === 'helmet' ? 40 : 0) + (reduceMotion ? 0 : Math.sin(gameT * 9) * (torch ? 5 : 2));
    hole(P.x, P.y - 24, R);
    Z.items.forEach(function (it) { if (!it.taken && it.room === ri) hole(it.x, it.y, 34); });
    L.hidden.forEach(function (h) { if (h.zone === P.zone && !h.taken && roomOf(Z, h.x, h.y) === ri) hole(h.x, h.y, 34); });
    if (Z.exit && Z.exit.room === ri) hole(Z.exit.x, Z.exit.y - 40, 80);
    if (torch) { // ciepłe światło pochodni w tej samej małej warstwie
      sctx.globalCompositeOperation = 'source-over';
      var tx = (P.x - cam.x) * sc, ty = (P.y - 24 - cam.y) * sc, gg = sctx.createRadialGradient(tx, ty, 2, tx, ty, R * sc);
      gg.addColorStop(0, 'rgba(255,190,90,.2)'); gg.addColorStop(1, 'rgba(255,190,90,0)');
      sctx.fillStyle = gg; sctx.fillRect(tx - R * sc, ty - R * sc, R * sc * 2, R * sc * 2);
    }
    // tylko prostokąt komnaty (poza nią i tak jest prawie czarno): mniej pikseli do złożenia
    var rm = Z.rooms[ri], k = view.s * view.dpr, x0 = clamp(rm.x0 - cam.x, 0, view.w), y0 = clamp(rm.y0 - cam.y, 0, view.h), x1 = clamp(rm.x1 - cam.x, 0, view.w), y1 = clamp(rm.y1 - cam.y, 0, view.h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (x1 > x0 && y1 > y0) ctx.drawImage(shadeZ, x0 * sc, y0 * sc, (x1 - x0) * sc, (y1 - y0) * sc, x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k);
    if (!torch) { // podpowiedź tylko w ciemnej komnacie bez pochodni
      var k3 = view.s * view.dpr; ctx.setTransform(k3, 0, 0, k3, 0, 0); ctx.fillStyle = '#FFF4CF';
      label(PT('page.game.cx.dark', 'Ciemno! Pochodnia by się przydała.'), view.w / 2, view.h - view.reserve - 24, view.w - 40);
    }
  }
  function hudTop() { var h = $('hud'); return h && !h.hidden ? Math.max(60, h.getBoundingClientRect().bottom + 6) : 60; }
  function drawZoneHUD(Z, ri) {
    var d = view.dpr, cw = view.cssW, top = hudTop();
    ctx.setTransform(d, 0, 0, d, 0, 0);
    // plecak: 4 miejsca
    var s = 44, gx = 10;
    ctx.fillStyle = 'rgba(6,42,88,.72)'; roundRect(ctx, gx - 4, top - 4, 4 * (s + 6) + 2, s + 8, 12); ctx.fill();
    for (var i = 0; i < 4; i++) {
      var x = gx + i * (s + 6);
      ctx.fillStyle = 'rgba(255,255,255,.94)'; roundRect(ctx, x, top, s, s, 9); ctx.fill();
      if (P.bag[i]) drawItemIcon(ctx, P.bag[i], x + s / 2, top + s / 2 + (P.bag[i] === 'torch' ? 4 : 0), 1.15);
    }
    // mapka: odwiedzone komnaty
    var cwid = 26, ch = 20, gap = 3, mw = Z.GW * (cwid + gap) - gap, mx = cw - 10 - mw;
    ctx.fillStyle = 'rgba(6,42,88,.72)'; roundRect(ctx, mx - 6, top - 4, mw + 12, Z.GH * (ch + gap) - gap + 8, 10); ctx.fill();
    Z.rooms.forEach(function (rm, k) {
      if (!rm.seen && k !== ri) return;
      var x = mx + rm.rx * (cwid + gap), y = top + rm.ry * (ch + gap);
      ctx.fillStyle = k === ri ? '#FFC629' : rm.dark ? '#5D6B82' : '#E2EBF7'; roundRect(ctx, x, y, cwid, ch, 4); ctx.fill();
      if (Z.exit && Z.exit.room === k) { ctx.fillStyle = '#1F7A48'; ctx.beginPath(); ctx.moveTo(x + 8, y + ch - 3); ctx.lineTo(x + 8, y + 9); ctx.arc(x + 13, y + 9, 5, Math.PI, 0); ctx.lineTo(x + 18, y + ch - 3); ctx.fill(); }
    });
  }
  /* Wejście w murze opactwa (świat główny) */
  function drawCxDoors() {
    L.cxDoors.forEach(function (dd) {
      if (dd.x < cam.x - 200 || dd.x > cam.x + view.w + 400) return;
      var x = dd.x, y = dd.y, Z = L.cx[dd.zi];
      ctx.fillStyle = '#54473A'; ctx.fillRect(x - 30, y - 92, 60, 92);
      ctx.fillStyle = '#A48B67'; ctx.fillRect(x - 27, y - 89, 54, 89);
      ctx.fillStyle = Z.done ? '#2B3D5A' : '#0E1A2B'; ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.lineTo(x - 18, y - 52); ctx.arc(x, y - 52, 18, Math.PI, 0); ctx.lineTo(x + 18, y); ctx.fill();
      ctx.fillStyle = '#FFC629'; ctx.beginPath(); ell(ctx, x - 9, y - 40, 2.5, 2.5, 0); ell(ctx, x + 9, y - 40, 2.5, 2.5, 0); ctx.fill(); // oczy w ciemności :)
      if (Math.abs(P.x - x) < 260) { ctx.fillStyle = '#062A58'; label(cxName(Z), x, y - 104, 260); }
      drawExitDoor(Z.back.x, Z.back.y, Z.done);
    });
  }

  /* ---------- 8. Świętowanie przystanku ---------- */
  var CELEB_T = reduceMotion ? 2.6 : 3.8;
  function startCelebration(lm) {
    var S = L.sections[lm.sec];
    S.done = true;
    S.stars = 1 + (S.hidden >= S.hidN ? 1 : 0) + (D.noTimer || S.time <= S.par ? 1 : 0);
    if (D.cpCeleb) P.checkpoint = { x: lm.x + 40, y: lm.y };
    if (SIM) { ev('landmark'); simStop = true; return; }
    state = 'celebrate';
    input.left = input.right = false;
    var conf = makeConf(110, ['#FFC629', '#0B4EA2', '#C81E36', '#1F7A48', '#FFFFFF', '#E8467C']);
    celebration = { lm: lm, t: 0, conf: conf, dance: 'dance' + (lm.sec % 4), counted: false, fx: [] };
    var ct = $('celebrateText');
    ct.innerHTML = '<b>' + esc(PT('page.game.cel.bravo', 'Brawo!')) + ' ' + '★★★'.slice(0, S.stars) + '<i class="dim">' + '★★★'.slice(S.stars) + '</i></b><span>' + esc(fill(PT('page.game.cel.sticker', 'Naklejka: {name}'), { name: stopName(lm.sec) })) + '</span><small>' + esc(PT('page.game.cel.skip', 'Dotknij, aby pominąć')) + '</small>';
    ct.hidden = false; $('hudStop').style.visibility = 'hidden'; $('pad').style.visibility = 'hidden';
    sfx('fanfare');
  }
  var TREASURE_T = CELEB_T + 2.4; // dłużej: dziecko ma przeczytać, że skarb czeka u rodziców
  function startTreasure(T) {
    if (window.QuoTreasure) QuoTreasure.claim(trip.trip, D.key); // odpowiedzi serwera nie pokazujemy
    stats.treasure = true;
    state = 'celebrate'; input.left = input.right = input.jump = false; P.vx = 0;
    var conf = makeConf(130, ['#FFC629', '#FFD95A', '#E8A912', '#FFFFFF', '#0B4EA2']);
    celebration = { lm: null, treasure: T, t: 0, conf: conf, dance: 'dance1', counted: false, fx: [] };
    var ct = $('celebrateText');
    ct.innerHTML = '<b>' + esc(PT('page.game.treasure.found', 'Znalazłeś Skarb Quo!')) + '</b><span>' + esc(PT('page.game.treasure.show', 'Pokaż go rodzicom — czeka w ich panelu.')) + '</span><small>' + esc(PT('page.game.cel.next', 'Dotknij, aby iść dalej')) + '</small>';
    ct.hidden = false; $('hudStop').style.visibility = 'hidden'; $('pad').style.visibility = 'hidden';
    sfx('fanfare');
  }
  function updateCelebration(dt) {
    var C = celebration; C.t += dt;
    C.conf.forEach(function (p) { // konfetti: wystrzał z dwóch armatek, grawitacja, opór powietrza, trzepotanie
      if (C.t < p.d) return;
      p.vy = Math.min(p.vy + 1.5 * dt, .32); p.vx *= 1 - 1.4 * dt;
      p.x += (p.vx + Math.sin(C.t * p.fr + p.fl) * .05) * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.y > 1.1) { p.y = -.05; p.x = Math.random(); p.vx = (Math.random() - .5) * .1; p.vy = .12 + Math.random() * .12; }
    });
    var T = C.treasure ? TREASURE_T : CELEB_T;
    if (!C.counted && C.t >= T - .5) countSticker();
    if (C.t >= T) endCelebration();
  }
  function countSticker() {
    var C = celebration; if (C.counted) return; C.counted = true;
    if (!C.treasure) stats.stickers.push(C.lm.sec);
    if (window.QHaptic) QHaptic.pulse('gameSticker');
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
    writeSave(lm.sec);
    state = 'play';
  }
  function makeConf(n, cols) {
    var conf = []; if (reduceMotion) return conf;
    for (var i = 0; i < n; i++) { var side = i % 2, col = cols[i % cols.length];
      conf.push({ x: side ? 1.02 : -.02, y: .95 + Math.random() * .08, vx: (side ? -1 : 1) * (.25 + Math.random() * .6), vy: -(.95 + Math.random() * .8), rot: Math.random() * 6, vr: (Math.random() - .5) * 12,
        fl: Math.random() * 6, fr: 5 + Math.random() * 8, col: col, dk: mixHex(col, '#0E1A2B', .35), w: 7 + Math.random() * 6, d: Math.random() * .3, round: i % 7 === 0 }); }
    return conf;
  }
  function renderCelebration() {
    var C = celebration; if (!C) return;
    var k = view.s * view.dpr, W = view.w, H = view.h, t = C.t, dt = vDt;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    var sec = L.sections[C.treasure ? C.treasure.sec : C.lm.sec], TT = C.treasure ? TREASURE_T : CELEB_T;
    var fadeIn = reduceMotion ? 1 : ease(t / .35);
    ctx.globalAlpha = fadeIn;
    drawBackground(ctx, sec.terrain, cam.x - RSX, cam.y - RSY, W, H, gameT);
    var wash = ctx.createRadialGradient(W / 2, H * .5, 10, W / 2, H * .5, Math.max(W, H) * .7);
    wash.addColorStop(0, sec.terrain === 'cave' ? 'rgba(80,140,220,.35)' : 'rgba(255,255,255,.5)'); wash.addColorStop(1, 'rgba(6,42,88,.45)');
    ctx.fillStyle = wash; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(k, 0, 0, k, RSX * k, RSY * k);
    var wide = view.cssH < 520 && W > H * 1.3;
    var S = wide ? Math.min(W * .36, H * .56) : Math.min(W * .78, H * .48), cx = wide ? W * .32 : W / 2, cy = wide ? H * .6 : H * .46;
    // błysk światła za naklejką: obracające się promienie i poświata
    var glow = ctx.createRadialGradient(cx, cy, S * .1, cx, cy, S * 1.25); glow.addColorStop(0, 'rgba(255,250,225,.95)'); glow.addColorStop(.35, 'rgba(255,214,90,.45)'); glow.addColorStop(1, 'rgba(255,198,41,0)');
    if (!reduceMotion) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * .35);
      var rg = ctx.createRadialGradient(0, 0, S * .2, 0, 0, Math.max(W, H)); rg.addColorStop(0, 'rgba(255,224,120,.5)'); rg.addColorStop(1, 'rgba(255,224,120,0)');
      ctx.fillStyle = rg;
      for (var i = 0; i < 14; i++) { ctx.rotate(Math.PI / 7); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.max(W, H), -(i % 2 ? 40 : 80)); ctx.lineTo(Math.max(W, H), i % 2 ? 40 : 80); ctx.fill(); }
      ctx.restore();
    }
    ctx.fillStyle = glow; ctx.fillRect(cx - S * 1.3, cy - S * 1.3, S * 2.6, S * 2.6);
    // naklejka: „klaps” z góry, potem błysk połysku i lot do albumu
    var flyStart = TT - 1.3, f = reduceMotion ? 0 : clamp((t - flyStart) / .8, 0, 1);
    var tgt = albumTarget(), sl = clamp(t / .42, 0, 1);
    var pop = reduceMotion ? 1 : (t < .42 ? lerp(1.9, 1, sl * sl) : 1 + .07 * Math.sin((t - .42) * 22) * Math.exp(-(t - .42) * 7));
    if (!reduceMotion && t >= .42 && !C.slap) { C.slap = true; addShake(6, .3); C.fx.push({ x: cx, y: cy, r: S * .5, t: 0, ring: 1 }); for (var j = 0; j < 14; j++) { var a = j / 14 * Math.PI * 2; C.fx.push({ x: cx + Math.cos(a) * S * .5, y: cy + Math.sin(a) * S * .5, vx: Math.cos(a) * (120 + Math.random() * 120), vy: Math.sin(a) * (120 + Math.random() * 120), t: 0, life: .7, s: 6 + Math.random() * 6, col: j % 2 ? '#FFFFFF' : '#FFE48A' }); } }
    var sx = lerp(cx, tgt.x, ease(f)), sy = lerp(cy, tgt.y, ease(f)) - Math.sin(f * Math.PI) * H * .12, ss = lerp(S * pop, 28, ease(f));
    if (f > 0 && f < 1 && C.fx.length < 80) C.fx.push({ x: sx, y: sy, vx: (Math.random() - .5) * 40, vy: (Math.random() - .5) * 40, t: 0, life: .5, s: 4 + Math.random() * 4, col: '#FFF4CF' });
    if (f < 1) {
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(reduceMotion ? -.05 : lerp(-.32, -.05, ease(sl)) + f * .4);
      if (!reduceMotion && t < .42) ctx.globalAlpha = fadeIn * clamp(t / .14, 0, 1);
      if (C.treasure) drawTreasureSticker(ctx, ss, t); else drawSticker(ctx, stopIconsBig[C.lm.sec] || stopIcons[C.lm.sec], ss, (t - .75) / .6);
      ctx.restore(); ctx.globalAlpha = fadeIn;
    }
    var qScale = wide ? H * .6 / 66 : Math.min(H * .4, W * .55) / 66;
    var pose = reduceMotion ? quoPose('cheer', 0) : quoPose(C.dance, t);
    var qx = wide ? W * .66 : W / 2, qy = wide ? H * .95 : Math.min(H * .94, cy + S * .5 + qScale * 46);
    ctx.fillStyle = 'rgba(14,26,43,.14)'; ctx.beginPath(); ell(ctx, qx, qy, qScale * 21, qScale * 4.6, 0); ctx.fill();
    ctx.fillStyle = 'rgba(14,26,43,.2)'; ctx.beginPath(); ell(ctx, qx, qy, qScale * 14, qScale * 3, 0); ctx.fill();
    drawQuo(ctx, qx, qy, qScale, wide ? -1 : 1, pose);
    for (i = C.fx.length - 1; i >= 0; i--) { // błyski i pierścień uderzenia
      var p = C.fx[i]; p.t += dt;
      if (p.ring) { var rk = p.t / .45; if (rk >= 1) { C.fx.splice(i, 1); continue; } ctx.globalAlpha = fadeIn * (1 - rk); ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 8 * (1 - rk) + 1; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + rk * S * .6, 0, Math.PI * 2); ctx.stroke(); continue; }
      if (p.t >= p.life) { C.fx.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 2 * dt; p.vy *= 1 - 2 * dt; ctx.globalAlpha = fadeIn * (1 - p.t / p.life);
      star(ctx, p.x, p.y, p.s * (1 - p.t / p.life * .5), p.col);
    }
    ctx.globalAlpha = fadeIn;
    C.conf.forEach(function (p) {
      if (C.t < p.d) return;
      var fl = Math.cos(C.t * p.fr * .7 + p.fl);
      ctx.save(); ctx.translate(p.x * W, p.y * H); ctx.rotate(p.rot); ctx.scale(1, Math.abs(fl) < .15 ? .15 : fl);
      ctx.fillStyle = fl < 0 ? p.dk : p.col;
      if (p.round) { ctx.beginPath(); ell(ctx, 0, 0, p.w * .35, p.w * .35, 0); ctx.fill(); } else ctx.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2);
      ctx.restore();
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
  /* Treść wycieczki z frasassi.json: klucze page.game.<trip>.s<nr>.name i page.game.<trip>.<id pytania>.q / a0–a3 / hint
     (polski tekst + obiekt "i18n" w JSON — z niego ui-translate.mjs bierze źródło). */
  function stopName(i) { var s = trip.stops[i]; return PT('page.game.' + trip.trip + '.s' + s.key + '.name', s.name); }
  function qText(stop, q, f) {
    var pl = f === 'q' ? q.q : f === 'hint' ? q.hint : q.answers[+f.slice(1)];
    return q.id ? PT('page.game.' + trip.trip + '.' + q.id + '.' + f, pl) : pl;
  }
  function langTag() { var l = (window.PT && window.PT.lang) || 'pl'; return l === 'no' ? 'nb' : l; }
  // Napisy na płótnie: krój strony z zapasowymi (cyrylica, diakrytyki), min. 18 px na ekranie; za długie — mniejsze, potem w 2 linie.
  function wrapLines(c, t, maxW) {
    var words = String(t).split(' '), lines = [], cur = '';
    words.forEach(function (w) { var n = cur ? cur + ' ' + w : w; if (cur && c.measureText(n).width > maxW) { lines.push(cur); cur = w; } else cur = n; });
    if (cur) lines.push(cur);
    return lines;
  }
  function label(t, x, y, maxW, size) {
    var min = 18 / view.s, f = Math.max(size || 18, min);
    ctx.textAlign = 'center'; ctx.font = font(f);
    var w = ctx.measureText(t).width;
    if (w > maxW && f > min) { f = Math.max(min, f * maxW / w); ctx.font = font(f); w = ctx.measureText(t).width; }
    if (w <= maxW) { ctx.fillText(t, x, y); return; }
    var ls = wrapLines(ctx, t, maxW);
    for (var i = 0; i < ls.length; i++) ctx.fillText(ls[i], x, y - (ls.length - 1 - i) * f * 1.12);
  }
  function fitText(c, t, x, y, maxW, size, weight) {
    var f = size; c.font = font(f, weight);
    var w = c.measureText(t).width; if (w > maxW) { f = Math.max(size * .72, f * maxW / w); c.font = font(f, weight); }
    c.fillText(t, x, y, maxW);
  }
  // Tabele z napisami wypełniane po wczytaniu tłumaczeń (PT.ready)
  function i18nTables() {
    DIFF.easy.label = PT('page.game.diff.easy', 'Łatwy');
    DIFF.medium.label = PT('page.game.diff.medium', 'Średni');
    DIFF.hard.label = PT('page.game.diff.hard', 'Trudny');
    POWER.magnet.name = PT('page.game.pw.magnet', 'Magnes na kamyczki');
    POWER.lantern.name = PT('page.game.pw.lantern', 'Latarka');
    POWER.doublejump.name = PT('page.game.pw.doublejump', 'Podwójny skok');
    POWER.glide.name = PT('page.game.pw.glide', 'Szybowanie — trzymaj skok');
    POWER.balloon.name = PT('page.game.pw.balloon', 'Balonik — trzymaj skok, by lecieć');
    HATS.helmet = PT('page.game.hat.helmet', 'Kask z lampką');
    HATS.hood = PT('page.game.hat.hood', 'Kaptur mnicha');
    HATS.explorer = PT('page.game.hat.explorer', 'Kapelusz odkrywcy');
    HATS.crown = PT('page.game.hat.crown', 'Wianek z kwiatów');
    PETAL_NAME.pink = PT('page.game.carpet.pink', 'różowy płatek'); PETAL_NAME.yellow = PT('page.game.carpet.yellow', 'żółty płatek');
    PETAL_NAME.white = PT('page.game.carpet.white', 'biały płatek'); PETAL_NAME.red = PT('page.game.carpet.red', 'czerwony płatek');
    CX_NAME_SP.easy = PT('page.game.cx.sp_easy', 'Wykop pod willą');
    CX_NAME_SP.medium = PT('page.game.cx.sp_medium', 'Labirynt wykopalisk');
    CX_NAME_SP.hard = PT('page.game.cx.sp_hard', 'Komnaty pod willą');
    ITEM_NAME.torch = PT('page.game.item.torch', 'pochodnia');
    ITEM_NAME.pickaxe = PT('page.game.item.pickaxe', 'kilof');
    ITEM_NAME['key:red'] = PT('page.game.item.key_red', 'czerwony klucz');
    ITEM_NAME['key:blue'] = PT('page.game.item.key_blue', 'niebieski klucz');
    ITEM_NAME['key:green'] = PT('page.game.item.key_green', 'zielony klucz');
    CX_NAME.easy = PT('page.game.cx.easy', 'Piwnice opactwa');
    CX_NAME.medium = PT('page.game.cx.medium', 'Labirynt pod opactwem');
    CX_NAME.hard = PT('page.game.cx.hard', 'Komnaty jaskini');
  }
  var toastTimer = null;
  function toast(msg, ms) {
    if (SIM) return;
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 2600);
  }
  function setHud(id, v) { // liczba w pigułce HUD + krótkie „podskoczenie” przy zmianie
    var el = $(id), t = String(v); if (el.textContent === t) return; el.textContent = t;
    if (reduceMotion) return; var p = el.parentNode; p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump');
  }
  function updateHUD() {
    if (!P || SIM) return;
    setHud('hudHearts', Math.max(0, P.hearts));
    setHud('hudCoins', stats.coins);
    $('hudStickers').textContent = stats.stickers.length + '/' + L.sections.length;
    var S = L.sections[Math.max(0, curSec)];
    $('hudHidden').textContent = (S ? S.hidden : 0) + '/' + (S ? S.hidN : 3);
  }
  function enterSection(si) {
    curSec = si;
    var S = L.sections[si];
    P.checkpoint = { x: Math.max(P.checkpoint.x, S.checkpoint.x), y: GROUND * TILE };
    if (S.power && !S.given) { S.given = true; setPower(S.power); }
    if (SIM) return;
    var stop = trip.stops[si];
    $('hudStop').textContent = fill(PT('page.game.hud.stop', 'Przystanek {n} z {m}'), { n: si + 1, m: L.sections.length }) + ' · ' + stopName(si);
    powerHUD();
    var msg = stopName(si) + (D.noTimer ? '' : ' · ' + fill(PT('page.game.hud.par', 'cel czasu {t}'), { t: fmtT(S.par) }));
    if (S.power) msg += ' · ' + fill(PT('page.game.hud.photo_power', 'moc z zadania foto: {name}'), { name: POWER[S.power].name });
    else if (S.terrain === 'cave') msg += ' · ' + PT('page.game.hud.dark', 'ciemno! Zadanie foto dałoby latarkę');
    if (S.shortcut) msg += ' · ' + PT('page.game.hud.shortcut', 'szukaj trampoliny „skrót”!');
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
    $('organStatus').textContent = fill(PT('page.game.organ.listen', 'Słuchaj i patrz… Dźwięków: {n}'), { n: organ.seq.length });
    Array.prototype.forEach.call($('organPads').children, function (b) { b.disabled = true; });
    organ.seq.forEach(function (k, i) { setTimeout(function () { lightPad(k, 520); }, i * 700); });
    setTimeout(function () {
      if (!organ) return; organ.ready = true;
      $('organStatus').textContent = PT('page.game.organ.turn', 'Twoja kolej! Dotknij nacieków w tej samej kolejności.');
      Array.prototype.forEach.call($('organPads').children, function (b) { b.disabled = false; });
      $('organPads').children[0].focus({ preventScroll: true });
    }, organ.seq.length * 700 + 200);
  }
  function organPress(i) {
    if (!organ || !organ.ready) return;
    lightPad(i, 300);
    if (organ.seq[organ.pos] === i) {
      organ.pos++;
      if (organ.pos >= organ.seq.length) { organ.ready = false; $('organStatus').textContent = PT('page.game.organ.ok', 'Brawo! Brama się otwiera · +5 kamyczków'); addCoins(5); sfx('ok'); setTimeout(function () { closeOrgan(true); }, 900); }
    } else {
      organ.ready = false; organ.gate.fails++; sfx('no');
      $('organStatus').textContent = PT('page.game.organ.again', 'Prawie! Posłuchaj jeszcze raz.');
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
  MASH.cart = MASH.push; // Spello: wózek z kwiatami pod górę — tempo jak przy głazie
  var mash = null;
  function openMash(gate) {
    state = 'mash'; input.left = input.right = input.jump = false; P.vx = 0;
    var c = MASH[gate.kind][D.key], rope = gate.kind === 'rope';
    mash = { gate: gate, kind: gate.kind, n: c.n, T: c.T, dec: c.dec, p: 0, t: 0, last: '', running: false, done: false };
    var cart = gate.kind === 'cart';
    $('mashTitle').textContent = rope ? PT('page.game.mash.rope', 'Wspinaczka po linie') : cart ? PT('page.game.mash.cart', 'Wózek pod górę') : PT('page.game.mash.push', 'Głaz w poprzek ścieżki');
    $('mashStage').className = 'mash-stage ' + gate.kind;
    $('mashTap').hidden = !rope; $('mashL').hidden = rope; $('mashR').hidden = rope;
    $('mashThreatIcon').textContent = rope ? '' : cart ? '⏳' : '🦇';
    $('mashSkip').hidden = gate.fails < 2; $('mashRetry').hidden = true;
    $('mashStatus').textContent = rope ? PT('page.game.mash.rope_help', 'Stukaj w TAP! (albo spację), zanim woda w szybie podejdzie wyżej. Pierwsze stuknięcie startuje.')
      : cart ? PT('page.game.mash.cart_help', 'Na zmianę ◀ i ▶ (albo strzałki ← →) — wepchnij wózek z kwiatami pod górę, zanim skończy się czas. Pierwsze stuknięcie startuje.')
      : PT('page.game.mash.push_help', 'Na zmianę ◀ i ▶ (albo strzałki ← →) — zepchnij głaz, zanim przyleci nietoperz. Pierwsze stuknięcie startuje.');
    drawMash();
    $('mashScreen').hidden = false; setPad(false);
    setTimeout(function () { (rope ? $('mashTap') : $('mashL')).focus({ preventScroll: true }); }, 30);
  }
  function mashPress(side) {
    if (!mash || mash.done) return;
    if (mash.kind !== 'rope') { if (side === mash.last) return; mash.last = side; }
    if (!mash.running) { mash.running = true; mash.t = 0; }
    mash.p = Math.min(1, mash.p + 1 / mash.n);
    sfx('pop');
    if (!reduceMotion) { var st = $('mashStage'); st.classList.remove('bump'); void st.offsetWidth; st.classList.add('bump'); }
    if (mash.p >= 1) { mash.done = true; $('mashStatus').textContent = PT('page.game.mash.ok', 'Udało się! +8 kamyczków'); addCoins(8); sfx('ok'); drawMash(); setTimeout(function () { closeMash(true); }, 900); }
    drawMash();
  }
  function updateMash(dt) {
    if (!mash || !mash.running || mash.done) return;
    mash.t += dt;
    mash.p = Math.max(0, mash.p - mash.dec * dt);
    var lost = mash.kind === 'rope' ? (mash.t > .8 && waterLevel() >= mash.p) : mash.t >= mash.T;
    if (lost) {
      mash.done = true; mash.gate.fails++; sfx('no');
      $('mashStatus').textContent = mash.kind === 'rope' ? PT('page.game.mash.rope_lost', 'Quo zjechał powoli w dół. Spróbuj jeszcze raz — szybciej!') : mash.kind === 'cart' ? PT('page.game.mash.cart_lost', 'Wózek zjechał w dół. Spróbuj jeszcze raz!') : PT('page.game.mash.push_lost', 'Nietoperz przeleciał i głaz wrócił. Spróbuj jeszcze raz!');
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
  function retryMash() { if (!mash || mash.p >= 1 || !mash.done) return; mash.p = 0; mash.t = 0; mash.running = false; mash.done = false; mash.last = ''; $('mashRetry').hidden = true; $('mashStatus').textContent = PT('page.game.mash.retry', 'Jeszcze raz! Pierwsze stuknięcie startuje.'); drawMash(); }
  function closeMash(ok) {
    if (!mash) return;
    var gate = mash.gate, kind = mash.kind; mash = null;
    $('mashScreen').hidden = true; setPad(true);
    gate.open = true; stats.gates++;
    if (ok && kind === 'rope') { P.x = gate.x + 4 * TILE; P.y = gate.g * TILE; P.vx = P.vy = 0; addCoins(4); toast(PT('page.game.t.rope_short', 'Skrót z szybu! +4 kamyczki')); } // skrót
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
    var mk = $('mosaicScreen').querySelector('.kicker'); // Spello: mozaika jest w rzymskiej willi, nie w opactwie
    if (L.sections[pq.sec].terrain === 'villa') mk.textContent = PT('page.game.mosaic.kicker_villa', 'Mozaika w rzymskiej willi');
    else mk.textContent = PT('page.game.html.mosaic_kicker', 'Mozaika w opactwie');
    $('mosaicSkip').hidden = pq.closes < 2;
    $('mosaicStatus').textContent = PT('page.game.mosaic.help', 'Dotknij kafelka obok pustego pola.');
    renderMosaic();
    $('mosaicScreen').hidden = false; setPad(false);
  }
  function renderMosaic() {
    var g = $('mosaicGrid'), img = ICONS + 'icon-' + trip.stops[mosaic.pq.sec].icon + '-256.webp';
    g.innerHTML = '';
    mosaic.t.forEach(function (v, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'mtile' + (v === 8 ? ' empty' : '');
      b.setAttribute('aria-label', v === 8 ? PT('page.game.mosaic.empty', 'puste pole') : fill(PT('page.game.mosaic.tile', 'kafelek {n}'), { n: v + 1 }));
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
    if (mosaic.t.every(function (v, k) { return v === k; })) { $('mosaicStatus').textContent = PT('page.game.mosaic.ok', 'Brawo! Skrzynia otwarta.'); sfx('ok'); setTimeout(function () { closeMosaic(true); }, 900); }
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

  /* --- Kwiatowy dywan (Spello, uliczki): dokończ symetryczny wzór z płatków. Infiorate wspominają teksty trasy.
     Łatwy 4×4 i 2 kolory z podglądem, Średni 4×4 i 3 kolory z podglądem, Trudny 5×5 i 4 kolory bez podglądu (wzór jest
     symetryczny — brakujące pola odczytasz z lustrzanych). Zamknięcie bez ułożenia: po 2 razach „Pomiń”. --- */
  var PETALS = [{ c: '#E8467C', k: 'pink' }, { c: '#FFC629', k: 'yellow' }, { c: '#FFFFFF', k: 'white' }, { c: '#C81E36', k: 'red' }], carpet = null, PETAL_NAME = {};
  function openCarpet(pq) {
    state = 'carpet'; input.left = input.right = input.jump = false; P.vx = 0;
    var N = D.key === 'hard' ? 5 : 4, K = D.key === 'easy' ? 2 : D.key === 'medium' ? 3 : 4, miss = D.key === 'easy' ? 4 : D.key === 'medium' ? 6 : 8;
    var tgt = [], i, j, h = Math.floor(Math.random() * 1e6);
    for (i = 0; i < N; i++) for (j = 0; j < N; j++) { var a = Math.min(i, N - 1 - i), b = Math.min(j, N - 1 - j), q = Math.min(a, b) * 7 + Math.max(a, b) * 3; tgt.push((q + h) % K); }
    var cur = tgt.slice(), idx = []; for (i = 0; i < N * N; i++) idx.push(i);
    for (i = idx.length - 1; i > 0; i--) { j = Math.floor(Math.random() * (i + 1)); var t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    // brakujące pola: tylko takie, których lustrzane pole zostaje (na Trudnym da się je odczytać z symetrii)
    var gone = [];
    idx.forEach(function (k) { if (gone.length >= miss) return; var r = Math.floor(k / N), c = k % N, m = r * N + (N - 1 - c); if (m !== k && gone.indexOf(m) < 0) gone.push(k); });
    gone.forEach(function (k) { cur[k] = -1; });
    carpet = { pq: pq, N: N, K: K, tgt: tgt, cur: cur, sel: 0, preview: D.key !== 'hard' };
    $('carpetSkip').hidden = pq.closes < 2;
    $('carpetStatus').textContent = carpet.preview ? PT('page.game.carpet.help', 'Jak na Infiorate w Spello: wybierz płatek i dotknij pustego pola. Wzór jest obok.')
      : PT('page.game.carpet.help_hard', 'Jak na Infiorate w Spello: dywan jest symetryczny — lewa strona jak prawa. Uzupełnij puste pola.');
    renderCarpet();
    $('carpetScreen').hidden = false; setPad(false);
    setTimeout(function () { var b = $('carpetPetals').querySelector('button'); if (b) b.focus({ preventScroll: true }); }, 30);
  }
  function renderCarpet() {
    var C = carpet, g = $('carpetGrid'), tg = $('carpetTarget'), pe = $('carpetPetals');
    g.style.setProperty('--n', C.N); tg.style.setProperty('--n', C.N);
    g.innerHTML = ''; tg.innerHTML = ''; tg.hidden = !C.preview;
    C.cur.forEach(function (v, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'cell' + (v < 0 ? ' empty' : '') + (v >= 0 && v !== C.tgt[i] ? ' wrong' : '');
      if (v >= 0) b.style.setProperty('--c', PETALS[v].c);
      b.setAttribute('aria-label', v < 0 ? PT('page.game.carpet.empty', 'puste pole') : PETAL_NAME[PETALS[v].k]);
      b.addEventListener('click', function () { placePetal(i); });
      g.appendChild(b);
      if (C.preview) { var d = document.createElement('i'); d.style.setProperty('--c', PETALS[C.tgt[i]].c); tg.appendChild(d); }
    });
    pe.innerHTML = '';
    for (var k = 0; k < C.K; k++) (function (k) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'petal'; b.style.setProperty('--c', PETALS[k].c);
      b.setAttribute('aria-pressed', C.sel === k ? 'true' : 'false'); b.setAttribute('aria-label', PETAL_NAME[PETALS[k].k]);
      b.addEventListener('click', function () { C.sel = k; renderCarpet(); });
      pe.appendChild(b);
    })(k);
  }
  function placePetal(i) {
    if (!carpet || carpet.done) return;
    var C = carpet, isEmpty = C.cur[i] < 0, wrong = C.cur[i] >= 0 && C.cur[i] !== C.tgt[i];
    if (!isEmpty && !wrong) return; // dobre pola zostają
    C.cur[i] = C.sel; sfx(C.sel === C.tgt[i] ? 'pop' : 'no');
    renderCarpet();
    var left = C.cur.filter(function (v, k) { return v !== C.tgt[k]; }).length;
    if (!left) { C.done = true; $('carpetStatus').textContent = PT('page.game.carpet.ok', 'Piękny dywan! Skrzynia otwarta.'); sfx('ok'); setTimeout(function () { closeCarpet(true); }, 900); }
    else if (C.sel !== C.tgt[i]) $('carpetStatus').textContent = PT('page.game.carpet.wrong', 'Ten płatek nie pasuje do wzoru — spróbuj innego koloru.');
  }
  function closeCarpet(solved) {
    if (!carpet) return;
    var pq = carpet.pq; carpet = null;
    $('carpetScreen').hidden = true; setPad(true);
    if (solved) { pq.solved = true; var c = L.chestList[pq.chest]; c.locked = false; openChest(c.x, c.y); }
    else pq.closes++;
    input.jumpPressed = false; state = 'play';
  }

  /* --- Przebrania Quo (tylko wygląd, zapis lokalny) --- */
  var HATS = { helmet: 'Kask z lampką', hood: 'Kaptur mnicha', explorer: 'Kapelusz odkrywcy', crown: 'Wianek z kwiatów' }; // nazwy z PT w i18nTables()
  /* Przebrania są osobne dla każdej wycieczki: Frasassi — stare klucze quolino_game_hats / _hat, inne — quolino_game_hats_<slug> / _hat_<slug>. */
  function hatSuffix() { return trip && trip.trip !== 'frasassi' ? '_' + trip.trip : ''; }
  function tripHats() { return (trip && trip.hats) || ['helmet', 'hood', 'explorer']; }
  function ownedHats() { return lsJSON(LS + 'hats' + hatSuffix()) || []; }
  function collectHat(kind) {
    if (SIM) return;
    var h = ownedHats(); if (h.indexOf(kind) < 0) { h.push(kind); lsSet(LS + 'hats' + hatSuffix(), JSON.stringify(h)); }
    curHat = kind; lsSet(LS + 'hat' + hatSuffix(), kind);
    sfx('fanfare'); toast(fill(PT('page.game.t.hat', 'Nowe przebranie: {name}!'), { name: HATS[kind] }), 3200);
  }
  function renderHats() {
    var own = ownedHats(), el = $('hatPicker'), html = '<button type="button" class="hat-btn" data-hat="" aria-pressed="' + (!curHat) + '">' + esc(PT('page.game.hat.none', 'Bez przebrania')) + '</button>';
    tripHats().forEach(function (k) {
      var has = own.indexOf(k) >= 0;
      html += '<button type="button" class="hat-btn" data-hat="' + k + '" aria-pressed="' + (curHat === k) + '"' + (has ? '' : ' disabled') + '>' + esc(has ? HATS[k] : '🔒 ' + PT('page.game.hat.locked', 'ukryte')) + '</button>';
    });
    el.innerHTML = html;
    Array.prototype.forEach.call(el.children, function (b) { b.addEventListener('click', function () { curHat = b.dataset.hat || null; lsSet(LS + 'hat' + hatSuffix(), curHat || ''); renderHats(); }); });
  }

  /* --- Tryb foto: ramka z Quo i naklejką przystanku, zapis lokalny --- */
  function photoSec() {
    if (!L || !P || P.zone >= 0) return -1;
    if (state === 'celebrate' && celebration) return celebration.lm ? celebration.lm.sec : -1;
    for (var i = 0; i < L.landmarks.length; i++) { var lm = L.landmarks[i]; if (lm.done && Math.abs(P.x - lm.x) < 260) return lm.sec; }
    return -1;
  }
  function snapPhoto() {
    var si = photoSec(); if (si < 0) return;
    var c = document.createElement('canvas'); c.width = 480; c.height = 360;
    var x = c.getContext('2d'); x.setTransform(1.2, 0, 0, 1.2, 0, 0);
    drawBackground(x, L.sections[si].terrain, L.landmarks[si].x - 200, 40, 400, 300, gameT);
    x.save(); x.translate(130, 120); x.rotate(-.06); drawSticker(x, stopIconsBig[si] || stopIcons[si], 150, null); x.restore();
    x.fillStyle = 'rgba(14,26,43,.22)'; x.beginPath(); ell(x, 290, 262, 36, 8, 0); x.fill();
    drawQuo(x, 290, 262, 2.7, -1, quoPose('cheer', 0));
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.strokeStyle = '#fff'; x.lineWidth = 28; x.strokeRect(0, 0, 480, 360);
    x.fillStyle = '#fff'; x.fillRect(0, 300, 480, 60);
    x.fillStyle = '#062A58'; x.textAlign = 'center';
    fitText(x, stopName(si), 240, 330, 440, 22, 900);
    x.fillStyle = '#5D6B82'; fitText(x, PT('page.game.title', 'Quo: Wyprawa') + ' · ' + new Date().toLocaleDateString(langTag()), 240, 352, 440, 18, 700);
    var data = c.toDataURL('image/jpeg', .72), all = lsJSON(LS + 'photos') || {}, list = (all[trip.trip] || []).filter(function (p) { return p.sec !== si; });
    list.push({ sec: si, data: data }); list.sort(function (a, b) { return a.sec - b.sec; }); all[trip.trip] = list;
    try { localStorage.setItem(LS + 'photos', JSON.stringify(all)); toast('📸 ' + PT('page.game.t.photo', 'Zdjęcie w albumie!')); } catch (e) { toast(PT('page.game.t.photo_full', 'Brak miejsca na zdjęcie w pamięci telefonu.')); }
    sfx('ok');
    var fl = $('flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
  }

  function openQuiz(gate) {
    if (SIM) { ev(gate.kind === 'organ' ? 'organ' : 'gate'); simStop = true; P.vx = 0; return; }
    if (gate.kind === 'organ') { openOrgan(gate); sfx('gate'); return; }
    if (gate.kind === 'rope' || gate.kind === 'push' || gate.kind === 'cart') { openMash(gate); sfx('gate'); return; }
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
    $('quizStop').textContent = fill(PT('page.game.quiz.stop', 'Przystanek {n}'), { n: gate.sec + 1 }) + ' · ' + stopName(gate.sec) + (gate.qs.length > 1 ? ' · ' + fill(PT('page.game.quiz.count', 'pytanie {i} z {n}'), { i: gate.qn + 1, n: gate.qs.length }) : '');
    $('quizQ').textContent = qText(stop, q, 'q');
    var hint = $('quizHint'); hint.textContent = ''; hint.className = 'quiz-hint';
    var hb = $('quizHintBtn'); hb.hidden = !D.freeHint; hb.disabled = false;
    box.innerHTML = '';
    var a = q.answers.slice(0, D.opts).map(function (txt, i) { return { txt: qText(stop, q, 'a' + i), ok: i === q.correct }; });
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
      hint.className = 'quiz-hint good'; hint.textContent = PT('page.game.cel.bravo', 'Brawo!') + ' ' + (more ? PT('page.game.quiz.more', 'Jeszcze jedno pytanie') : PT('page.game.quiz.open', 'Brama się otwiera')) + (bonus ? ' · ' + fill(PT('page.game.quiz.bonus', '+{n} kamyczków'), { n: bonus }) : '');
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
      hint.textContent = fill(PT('page.game.quiz.almost', 'Prawie! Podpowiedź: {hint}'), { hint: qText(trip.stops[gate.sec], q, 'hint') }) + (D.freeHint ? '' : ' ' + PT('page.game.quiz.nobonus', '(bez premii)'));
      $('quizHintBtn').hidden = true;
      sfx('no');
    }
  }

  /* --- Zapis w trakcie wyprawy (decyzja JP 2026-10-29): po każdej naklejce przystanku, osobno dla trasy i poziomu.
     quolino_game_save_<slug> = { <poziom>: { v, n, sec, playNo, gameT, hearts, power, stats, secs: [[gwiazdki, czas, ukryte]…], hid } }.
     Poziom odbudowuje się z tego samego ziarna (playNo), Quo staje tuż za naklejką ostatniego przystanku. Koniec wyprawy kasuje zapis. --- */
  function saveKey() { return LS + 'save_' + trip.trip; }
  function loadSaves() { var o = lsJSON(saveKey()); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; }
  function getSave(dk) {
    var s = loadSaves()[dk];
    return s && s.v === 1 && s.n === trip.stops.length && s.sec >= 0 && s.sec < trip.stops.length - 1 && DIFF[dk] ? s : null;
  }
  function clearSave(dk) { var o = loadSaves(); if (!o[dk]) return; delete o[dk]; if (Object.keys(o).length) lsSet(saveKey(), JSON.stringify(o)); else lsDel(saveKey()); }
  function writeSave(sec) {
    if (SIM) return;
    var o = loadSaves();
    o[D.key] = { v: 1, n: trip.stops.length, sec: sec, playNo: playNo, gameT: Math.round(gameT), hearts: P.hearts, power: P.power || null,
      stats: { coins: stats.coins, stickers: stats.stickers.slice(), gates: stats.gates, firstTry: stats.firstTry, questions: stats.questions, hiddenTotal: stats.hiddenTotal, treasure: !!stats.treasure },
      secs: L.sections.slice(0, sec + 1).map(function (S) { return [S.stars, Math.round(S.time), S.hidden]; }),
      hid: L.hidden.map(function (h) { return h.taken ? '1' : '0'; }).join('') };
    lsSet(saveKey(), JSON.stringify(o));
  }
  function applySave(sv) {
    var lm = L.landmarks[sv.sec], i;
    for (i = 0; i <= sv.sec; i++) {
      var S = L.sections[i], a = sv.secs[i] || [1, 0, 0];
      S.done = true; S.given = true; S.stars = a[0] | 0; S.time = +a[1] || 0; S.hidden = a[2] | 0;
      L.landmarks[i].done = true;
      S.gates.forEach(function (k) { L.gates[k].open = true; L.gates[k].lift = 1; });
    }
    L.hidden.forEach(function (h, k) { if (sv.hid && sv.hid.charAt(k) === '1') h.taken = true; });
    L.coins.forEach(function (c) { if (c.x < lm.x) c.taken = true; }); // kamyczki za plecami już policzone w zapisie
    L.cxDoors.forEach(function (dd) { if (dd.x < lm.x) L.cx[dd.zi].done = true; });
    var st = sv.stats || {};
    stats = { coins: st.coins | 0, stickers: (st.stickers || []).slice(), gates: st.gates | 0, firstTry: st.firstTry | 0, questions: st.questions | 0, hiddenTotal: st.hiddenTotal | 0, treasure: !!st.treasure };
    gameT = +sv.gameT || 0;
    P.x = lm.x + 40; P.y = lm.y;
    P.checkpoint = { x: P.x, y: P.y }; P.safe = { x: P.x, y: P.y };
    P.hearts = clamp(sv.hearts | 0, 1, D.cap);
    if (sv.power && POWER[sv.power]) setPower(sv.power);
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
    $('endDiff').textContent = fill(PT('page.game.end.level_name', 'Poziom: {label}'), { label: D.label });
    $('albumGrid').innerHTML = L.sections.map(function (S, i) {
      var s = trip.stops[i];
      return '<div class="sticker"><img src="' + ICONS + 'icon-' + esc(s.icon) + '-128.webp" alt="" width="120" height="120"><p>' + esc(stopName(i)) + '</p>' +
        '<p class="stars" aria-label="' + esc(fill(PT('page.game.end.stars_aria', '{n} z 3 gwiazdek'), { n: S.stars })) + '">' + '★★★'.slice(0, S.stars) + '<span class="dim">' + '★★★'.slice(S.stars) + '</span></p>' +
        '<p class="meta">' + esc(D.noTimer ? fill(PT('page.game.end.meta_hidden', 'Ukryte: {h}/{m}'), { h: S.hidden, m: S.hidN }) : S.hidN === 3 ? fill(PT('page.game.end.meta', 'Ukryte: {h}/3 · czas {t} (cel {p})'), { h: S.hidden, t: fmtT(S.time), p: fmtT(S.par) })
          : fill(PT('page.game.end.meta_n', 'Ukryte: {h}/{m} · czas {t} (cel {p})'), { h: S.hidden, m: S.hidN, t: fmtT(S.time), p: fmtT(S.par) })) + '</p></div>';
    }).join('') + ((stats.treasure || (window.QuoTreasure && QuoTreasure.found(trip.trip))) ?
      '<div class="sticker sticker-gold"><svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true"><circle cx="60" cy="60" r="56" fill="#FFD95A" stroke="#0E1A2B" stroke-width="5"/>' +
      '<rect x="32" y="58" width="56" height="34" fill="#E8A912" stroke="#3B2A00" stroke-width="4"/><path d="M32 58 Q60 30 88 58 Z" fill="#FFC629" stroke="#3B2A00" stroke-width="4"/>' +
      '<rect x="55" y="54" width="10" height="14" fill="#C81E36" stroke="#3B2A00" stroke-width="3"/></svg>' +
      '<p>' + esc(PT('page.game.treasure.name', 'Skarb Quo')) + '</p><p class="meta">' + esc(PT('page.game.treasure.show', 'Pokaż go rodzicom — czeka w ich panelu.')) + '</p></div>' : '');
    $('totals').innerHTML =
      '<div><span>' + esc(PT('page.game.end.stars', 'Gwiazdki')) + '</span><b>' + total + ' / ' + L.sections.length * 3 + '</b></div>' +
      '<div><span>' + esc(PT('page.game.end.coins', 'Kamyczki')) + '</span><b>' + stats.coins + '</b></div>' +
      '<div><span>' + esc(PT('page.game.end.hidden', 'Zagubione naklejki')) + '</span><b>' + stats.hiddenTotal + ' / ' + L.hidden.length + '</b></div>' +
      '<div><span>' + esc(PT('page.game.end.first', 'Pytania za pierwszym razem')) + '</span><b>' + stats.firstTry + ' / ' + stats.questions + '</b></div>' +
      (D.noTimer ? '' : '<div><span>' + esc(PT('page.game.end.time', 'Czas wyprawy')) + '</span><b>' + fmtT(gameT) + '</b></div>') +
      '<div><span>' + esc(fill(PT('page.game.end.record', 'Rekord ({label})'), { label: D.label })) + '</span><b>' + esc(fill(PT('page.game.end.record_val', '{s} ★ · {c} kamyczków'), { s: b.stars.reduce(function (a, s) { return a + s; }, 0), c: b.coins })) + '</b></div>' +
      (total > prevTotal && prevTotal ? '<div class="new"><span>' + esc(PT('page.game.end.new', 'Nowy rekord gwiazdek!')) + '</span></div>' : '');
    var photos = ((lsJSON(LS + 'photos') || {})[trip.trip]) || [];
    $('photoGallery').innerHTML = photos.length ? '<p class="kicker">' + esc(PT('page.game.end.photos', 'Zdjęcia z wyprawy')) + '</p><div class="photos">' + photos.map(function (p) { return '<img src="' + p.data + '" alt="' + esc(fill(PT('page.game.end.photo_alt', 'Zdjęcie: Quo przy przystanku {n}'), { n: p.sec + 1 })) + '" width="240" height="180">'; }).join('') + '</div>' : '<p class="help">' + esc(PT('page.game.end.photo_help', 'Przy naklejce przystanku dotknij 📸, żeby zrobić zdjęcie do albumu.')) + '</p>';
    clearSave(D.key);
    $('endScreen').hidden = false;
    sfx('fanfare');
    setTimeout(function () { $('btnAgain').focus({ preventScroll: true }); }, 50);
  }

  function renderBonus() {
    var p = readProgress(trip, demo), el = $('bonusList');
    var powers = trip.stops.filter(function (s, i) { return p.stops[i].photo && s.powerup; }).map(function (s) { return POWER[s.powerup].name.split(' —')[0]; });
    var Dd = DIFF[diffKey], extra = Math.min(p.missions, Dd.cap - Dd.hearts);
    var html = '';
    if (!p.found && !demo) html += '<p>' + esc(PT('page.game.bonus.none', 'Na tym telefonie nie ma jeszcze punktów z wycieczki. Gra działa i bez nich — jest tylko trochę trudniej.')) + '</p>';
    else html += '<p>' + esc(PT('page.game.bonus.head', 'Punkty z waszej wycieczki:')) + '</p>';
    html += '<div class="row' + (p.missions ? '' : ' off') + '"><i>❤️</i>' + esc(fill(PT('page.game.bonus.missions', 'Misje: {m} z {t} → +{e} serduszek (start: {s})'), { m: p.missions, t: p.missionsTotal, e: extra, s: Dd.hearts + extra })) + '</div>';
    if (p.photosTotal) html += '<div class="row' + (p.photos ? '' : ' off') + '"><i>📷</i>' + esc(fill(PT('page.game.bonus.photos', 'Zadania foto: {p} z {t}'), { p: p.photos, t: p.photosTotal }) + (powers.length ? ' → ' + powers.join(', ') : ' → ' + PT('page.game.bonus.nopower', 'brak mocy'))) + '</div>';
    html += '<div class="row' + (p.full ? '' : ' off') + '"><i>⭐</i>' + esc(fill(PT('page.game.bonus.full', 'Całe przystanki: {f} z {n} → tajne skróty'), { f: p.full, n: trip.stops.length })) + '</div>';
    var rec = loadRecord(), b = rec.best[diffKey];
    if (b && b.stars) html += '<div class="row"><i>🏆</i>' + esc(fill(PT('page.game.bonus.record', 'Rekord na tym poziomie: {s} / {n} ★'), { s: b.stars.reduce(function (a, s) { return a + s; }, 0), n: trip.stops.length * 3 })) + '</div>';
    el.innerHTML = html;
    document.querySelectorAll('.diff-btn').forEach(function (bt) { bt.setAttribute('aria-pressed', bt.dataset.diff === diffKey ? 'true' : 'false'); });
    renderStartButtons();
  }
  function renderStartButtons() { // „Graj dalej” (zapis tej trasy i poziomu) + „Zacznij od nowa”, inaczej samo „Graj”
    var sv = getSave(diffKey), bc = $('btnContinue'), bs = $('btnStart');
    bc.hidden = !sv;
    if (sv) bc.innerHTML = esc(PT('page.game.html.resume', 'Graj dalej')) + '<small class="btn-sub">' + esc(fill(PT('page.game.html.resume_stop', 'przystanek {n} z {m}'), { n: Math.min(sv.sec + 2, sv.n), m: sv.n })) + '</small>';
    bs.textContent = sv ? PT('page.game.html.restart', 'Zacznij od nowa') : PT('page.game.html.play', 'Graj');
    bs.className = 'btn ' + (sv ? 'btn-ghost' : 'btn-primary');
  }

  function newGame(sv) { // sv = zapis z getSave() → „Graj dalej”; bez niego nowa wyprawa (stary zapis tego poziomu znika)
    D = DIFF[diffKey];
    if (!sv) clearSave(D.key);
    prog = readProgress(trip, demo);
    var rec = loadRecord();
    playNo = sv ? sv.playNo | 0 : rec.plays || 0;
    L = buildLevel(trip, prog, playNo, D);
    P = newPlayer();
    stats = { coins: 0, stickers: [], gates: 0, firstTry: 0, questions: 0, hiddenTotal: 0, treasure: false };
    particles = []; celebration = null; curSec = -1; gameT = 0;
    if (sv) applySave(sv);
    cam.x = 0; cam.y = 0; updateCamera(1); startWipe(P.x, P.y - 24); pops = []; chestFx = {};
    ['startScreen', 'endScreen', 'pauseScreen', 'quizScreen', 'organScreen', 'mosaicScreen', 'mashScreen', 'carpetScreen'].forEach(function (id) { $(id).hidden = true; });
    organ = null; mosaic = null; mash = null; carpet = null;
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
      if (mash.kind !== 'rope' && (e.code === 'ArrowLeft' || e.code === 'KeyA') && !e.repeat) { e.preventDefault(); mashPress('l'); return; }
      if (mash.kind !== 'rope' && (e.code === 'ArrowRight' || e.code === 'KeyD') && !e.repeat) { e.preventDefault(); mashPress('r'); return; }
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
    ['btnSound', 'btnSound2'].forEach(function (id) { $(id).textContent = on ? PT('page.game.sound.on', 'Dźwięk: włączony') : PT('page.game.sound.off', 'Dźwięk: wyłączony'); $(id).setAttribute('aria-pressed', on ? 'true' : 'false'); });
    if (on) sfx('coin');
  }

  /* ---------- 12. Pętla gry i start ---------- */
  var last = 0, acc = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    var t = ts / 1000, d = Math.min(.25, t - (last || t)); last = t; vDt = Math.min(d, .1); vT += vDt;
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
    i18nTables();
    genBackgrounds();
    genArt();
    demo = TEST && lsGet(LS + 'demo') === '1'; // „Tryb demo” tylko dla testów (?test=1) — dziecko go nie widzi
    $('demoToggle').parentNode.hidden = !TEST;
    var sd = lsGet(LS + 'diff'); if (DIFF[sd]) diffKey = sd;
    $('demoToggle').checked = demo;
    $('demoToggle').addEventListener('change', function (e) { demo = e.target.checked; lsSet(LS + 'demo', demo ? '1' : '0'); renderBonus(); });
    document.querySelectorAll('.diff-btn').forEach(function (bt) {
      bt.addEventListener('click', function () { diffKey = bt.dataset.diff; lsSet(LS + 'diff', diffKey); renderBonus(); });
    });
    $('btnStart').addEventListener('click', function () { if (soundOn) setSound(true); newGame(); });
    $('btnContinue').addEventListener('click', function () { if (soundOn) setSound(true); newGame(getSave(diffKey)); });
    $('btnSound').addEventListener('click', function () { setSound(!soundOn); });
    $('btnSound2').addEventListener('click', function () { setSound(!soundOn); });
    // P-7: przełącznik „Wibracje” tylko tam, gdzie telefon je obsługuje (Android); domyślnie włączone
    if (window.QHaptic && QHaptic.supported() && !QHaptic.reduced()) {
      var paintVibe = function () {
        var on = QHaptic.pref();
        ['btnVibe', 'btnVibe2'].forEach(function (id) { var b = $(id); if (!b) return; b.hidden = false; b.textContent = on ? PT('page.game.vibe.on', 'Wibracje: włączone') : PT('page.game.vibe.off', 'Wibracje: wyłączone'); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      };
      ['btnVibe', 'btnVibe2'].forEach(function (id) { var b = $(id); if (b) b.addEventListener('click', function () { QHaptic.set(!QHaptic.pref()); paintVibe(); QHaptic.pulse('mission'); }); });
      paintVibe();
    }
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
    $('carpetClose').addEventListener('click', function () { if (carpet) closeCarpet(false); });
    $('carpetSkip').addEventListener('click', function () { if (carpet) closeCarpet(true); });
    $('quizHintBtn').addEventListener('click', function () {
      if (!quizGate) return; var q = trip.stops[quizGate.sec].quests[quizGate.qs[quizGate.qn]];
      $('quizHint').textContent = fill(PT('page.game.quiz.hint', 'Podpowiedź: {hint}'), { hint: qText(trip.stops[quizGate.sec], q, 'hint') }); $('quizHintBtn').hidden = true;
    });
    window.addEventListener('resize', resize);
    resize();
    loadStage().then(function (data) {
      trip = data;
      stageTexts();
      curHat = lsGet(LS + 'hat' + hatSuffix()) || null; if (curHat && ownedHats().indexOf(curHat) < 0) curHat = null;
      renderHats();
      renderBonus();
      buildRig(function () {
        D = DIFF[diffKey];
        prog = readProgress(trip, demo); L = buildLevel(trip, prog, 0, D); P = newPlayer(); stats = { coins: 0, stickers: [], gates: 0, firstTry: 0, questions: 0, hiddenTotal: 0 };
        loadStopIcons();
        updateCamera(1);
        state = 'menu';
      });
    }).catch(function (e) { if (e && e.locked) { showLocked(); return; } toast(PT('page.game.t.load_err', 'Nie udało się wczytać danych wycieczki.'), 8000); });
    requestAnimationFrame(frame);
  }

  /* Ikony miejsc: własna naklejka przystanku, jeśli jest w gra/icons/manifest.json, inaczej ikona kategorii.
     manifest: { "<trasa>": ["<stop_key>", …] } → gra/icons/<trasa>/<stop_key>-256.webp i -512.webp;
     "media": { "<trasa>": [...] } → media/icons/place-<trasa>-<stop_key>-256.webp / -512.webp. stop_key = qcKey przystanku (albo key). */
  var stopIconsBig = [];
  function loadStopIcons() {
    function img(src, fb) { var im = new Image(); if (fb) im.onerror = function () { im.onerror = null; im.src = fb; }; im.src = src; return im; }
    function cat(s) { return ICONS + 'icon-' + s.icon + '-256.webp'; }
    stopIcons = trip.stops.map(function (s) { return img(cat(s)); }); stopIconsBig = stopIcons.slice();
    fetch('icons/manifest.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }).then(function (M) {
      var own = (M && M[trip.trip]) || [], med = (M && M.media && M.media[trip.trip]) || [];
      trip.stops.forEach(function (s, i) {
        var key = s.qcKey || s.key, base = own.indexOf(key) >= 0 ? 'icons/' + trip.trip + '/' + key : med.indexOf(key) >= 0 ? ICONS + 'place-' + trip.trip + '-' + key : null;
        if (!base) return;
        stopIcons[i] = img(base + '-256.webp', cat(s)); stopIconsBig[i] = img(base + '-512.webp', base + '-256.webp');
      });
    });
  }
  /* Etapy: gra/stages.json → plik etapu (?trasa=<slug>). Bez indeksu albo przy nieznanym slugu: Frasassi. */
  function loadStage() {
    function get(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(u); return r.json(); }); }
    var LOCKED = { locked: true };
    return get('stages.json').then(function (idx) {
      var list = idx.stages.filter(function (st) { return st.approved === true || TEST; });
      STAGES = { default: idx.default, stages: list };
      if (!list.length) throw LOCKED;
      STAGE = list.filter(function (st) { return st.slug === TRIP_SLUG; })[0] || list.filter(function (st) { return st.slug === idx.default; })[0] || list[0];
      return get(STAGE.file);
    }, function () { STAGES = null; STAGE = null; if (!TEST) throw LOCKED; return get('frasassi.json'); });
  }
  function showLocked() { // żaden zatwierdzony etap (i brak ?test=1): przyjazna informacja zamiast gry
    $('startScreen').hidden = true; $('lockedScreen').hidden = false; state = 'locked';
  }
  function stText(k) { return STAGE && STAGE[k] ? PT(STAGE[k][0], STAGE[k][1]) : null; }
  function stageTexts() { // napisy zależne od etapu + wybór wyprawy na ekranie startowym
    var lead = stText('lead'), album = stText('album'), canvas = stText('canvas'), name = stText('name');
    if (lead) $('stageLead').textContent = lead;
    if (album) $('stageAlbum').textContent = album;
    if (canvas) cv.setAttribute('aria-label', canvas);
    if (name) document.title = PT('page.game.title', 'Quo: Wyprawa') + ' — ' + name;
    $('testBadge').hidden = !(STAGE && STAGE.approved !== true);
    var el = $('tripPicker'); if (!el) return;
    if (!STAGES || STAGES.stages.length < 2) { el.hidden = true; $('tripLabel').hidden = true; return; }
    el.innerHTML = STAGES.stages.map(function (st) {
      var on = STAGE && st.slug === STAGE.slug;
      return '<button type="button" class="trip-btn" data-trasa="' + esc(st.slug) + '" aria-pressed="' + on + '"><img src="' + ICONS + 'icon-' + esc(st.icon) + '-128.webp" alt="" width="44" height="44"><span>' + esc(PT(st.name[0], st.name[1])) + (st.approved !== true ? '<small class="trip-test">' + esc(PT('page.game.html.test_badge', 'wersja testowa')) + '</small>' : '') + '</span></button>';
    }).join('');
    Array.prototype.forEach.call(el.children, function (b) {
      b.addEventListener('click', function () {
        if (STAGE && b.dataset.trasa === STAGE.slug) return;
        var q = new URLSearchParams(location.search); q.set('trasa', b.dataset.trasa);
        location.search = q.toString();
      });
    });
  }

  /* Dostęp dla testów automatycznych: podgląd stanu i symulacja (bot planujący ruchy).
     Nie zmienia zachowania gry dla dzieci. */
  function setIn(b, prev) { input.left = !!(b & 1); input.right = !!(b & 2); input.jump = !!(b & 4); input.jumpPressed = !!(b & 4) && !(prev & 4); }
  window.__quoGame = {
    get state() { return state; }, get player() { return P; }, get level() { return L; }, get stats() { return stats; }, get diff() { return D; },
    get cam() { return cam; }, get view() { return view; }, get trip() { return trip && trip.trip; },
    set botMode(v) { botMode = !!v; }, get botMode() { return botMode; },
    skipCelebration: function () { if (state === 'celebrate') endCelebration(); },
    tileAt: function (x, y) { return tileAt(x, y); },
    snapshot: function () { return structuredClone({ L: L, P: P, stats: stats, gameT: gameT, curSec: curSec, cx: cam.x, cy: cam.y, inp: input }); },
    restore: function (s) { var c = structuredClone(s); L = c.L; P = c.P; stats = c.stats; gameT = c.gameT; curSec = c.curSec; cam.x = c.cx; cam.y = c.cy; input.left = c.inp.left; input.right = c.inp.right; input.jump = c.inp.jump; input.jumpPressed = false; },
    simulate: function (prog, prev, tg) { // tg = {x, y}: najbliższe podejście do celu i pierwsza klatka „na miejscu” (bot w komnatach)
      SIM = true; simEv = []; simStop = false; var p = prev || 0, n = 0, minD = 1e9, hitAt = -1, z0 = P.zone;
      try { for (var i = 0; i < prog.length; i++) { setIn(prog[i], p); p = prog[i]; step(DT); n++;
        if (tg && P.zone === z0) { var dx = Math.abs(P.x - tg.x), dy = Math.abs(P.y - tg.y), dd = dx + 1.4 * dy; if (dd < minD) minD = dd; if (hitAt < 0 && dx < 18 && dy < 26 && (P.onGround || P.climb)) hitAt = i; }
        if (simStop || P.nap > 0) break; } }
      finally { SIM = false; }
      return { x: P.x, y: P.y, hearts: P.hearts, nap: P.nap > 0, ev: simEv.slice(), onGround: P.onGround, ride: P.cart >= 0 || P.zip >= 0 || P.onRaft >= 0, n: n, sec: curSec, zone: P.zone, climb: P.climb, bag: P.bag.length, minD: minD, hitAt: hitAt };
    },
    advance: function (prog, prev) {
      var p = prev || 0;
      for (var i = 0; i < prog.length; i++) { if (state !== 'play') break; setIn(prog[i], p); p = prog[i]; step(DT); }
      return p;
    },
    get mash() { return mash ? { kind: mash.kind, p: mash.p, done: mash.done, running: mash.running, fails: mash.gate.fails } : null; },
    get carpet() { return carpet ? { N: carpet.N, K: carpet.K, tgt: carpet.tgt.slice(), cur: carpet.cur.slice(), sel: carpet.sel, preview: carpet.preview } : null; },
    get organ() { return organ ? { seq: organ.seq.slice(), ready: organ.ready, fails: organ.gate.fails } : null; },
    teleport: function (x, y) { P.x = x; P.y = y; P.vx = P.vy = 0; cam.x = clamp(P.x - view.w * .38, 0, L.W * TILE - view.w); },
    get zone() { // komnaty: dla bota testowego (punkty trasy) i zrzutów
      if (P.zone < 0) return null; var Z = L.cx[P.zone];
      return { zi: P.zone, key: Z.key, room: P.room, rooms: Z.rooms.length, seen: Z.rooms.filter(function (r) { return r.seen; }).length, bag: P.bag.slice(), route: Z.route, dark: Z.rooms[P.room] ? Z.rooms[P.room].dark : false, climb: P.climb };
    },
    enterZone: function (zi) { enterZone(zi); }
  };
  // Najpierw tłumaczenia (page-i18n.js), potem pierwszy tekst gry. Bez sieci po 2,5 s gramy po polsku.
  var i18nReady = window.PT && window.PT.ready ? window.PT.ready : Promise.resolve();
  Promise.race([i18nReady, new Promise(function (r) { setTimeout(r, 2500); })]).then(boot, boot);
})();
