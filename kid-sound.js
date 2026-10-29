/* =====================================================================
   QUOLINO — dźwięki widoku dziecka (kid-sound.js), I-6, 2026-10-29
   Trzy krótkie efekty generowane w Web Audio (bez plików, bez bibliotek):
     • „klap”   — naklejka przystanku wklejona,
     • „ćwir”   — misja odhaczona,
     • fanfara  — cały obrazek odsłonięty (ostatnia naklejka),
   oraz pisk Quo przy stuknięciu w Quo (akcja na żądanie — gra zawsze).
   Domyślnie WYŁĄCZONE (zasada: zero auto-play poza filmem okładki). Przełącznik w widoku dziecka,
   wybór w localStorage qc.kid.sound ('1' = włączone). Słucha zdarzenia „qc:pulse” z haptic.js.
   API: window.QSound = { on, set, play(name), squeak() }
   ===================================================================== */
(function () {
  'use strict';
  var KEY = 'qc.kid.sound';
  var ctx = null, master = null;

  function on() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function set(v) { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) { /* prywatne okno */ } if (v) { prime(); play('chirp', true); } }
  function audio() {
    if (ctx) { if (ctx.state === 'suspended' && ctx.resume) ctx.resume(); return ctx; }
    var A = window.AudioContext || window.webkitAudioContext;
    if (!A) return null;
    try { ctx = new A(); master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination); } catch (e) { ctx = null; }
    return ctx;
  }
  // iOS odblokowuje dźwięk tylko w geście użytkownika — tworzymy kontekst przy pierwszym dotknięciu przycisku
  function prime() { audio(); }

  function env(g, t0, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }
  function tone(type, f0, f1, t0, dur, peak) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    env(g, t0, peak, 0.008, dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  }
  var noiseBuf = null;
  function noise(t0, dur, freq, peak) {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.25), ctx.sampleRate);
      var d = noiseBuf.getChannelData(0), x = 12345;
      for (var i = 0; i < d.length; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; d[i] = x / 0x3fffffff - 1; }
    }
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.9;
    env(g, t0, peak, 0.002, dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t0); s.stop(t0 + dur + 0.05);
  }

  var FX = {
    // naklejka dociśnięta do kartki: krótki szum + głuche „tup”
    klap: function (t) { noise(t, 0.09, 1900, 0.9); tone('sine', 150, 60, t, 0.1, 0.6); },
    // ćwir: dwa szybkie ptasie wznoszące „ti-ti”
    chirp: function (t) { tone('sine', 1800, 3300, t, 0.07, 0.28); tone('sine', 2000, 3600, t + 0.11, 0.08, 0.24); },
    // pisk Quo: krótki, wysoki „iii” z załamaniem
    squeak: function (t) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(1300, t); o.frequency.exponentialRampToValueAtTime(2700, t + 0.08); o.frequency.exponentialRampToValueAtTime(1900, t + 0.2);
      env(g, t, 0.35, 0.01, 0.22);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.3);
    },
    // fanfara: C–E–G–C w górę
    fanfare: function (t) {
      [523.25, 659.25, 783.99].forEach(function (f, i) { tone('triangle', f, 0, t + i * 0.12, 0.14, 0.3); });
      tone('triangle', 1046.5, 0, t + 0.36, 0.5, 0.34); tone('sine', 523.25, 0, t + 0.36, 0.5, 0.18);
    }
  };

  function play(name, force) {
    if (!force && !on()) return false;
    if (!FX[name] || !audio()) return false;
    try { FX[name](ctx.currentTime + 0.01); return true; } catch (e) { return false; }
  }
  function squeak() { return play('squeak', true); }

  // momenty nagrody z haptic.js (city.html woła QHaptic.pulse tylko w widoku dziecka)
  window.addEventListener('qc:pulse', function (e) {
    var n = e && e.detail;
    if (n === 'mission') play('chirp');
    else if (n === 'sticker') play('klap');
    else if (n === 'city') { play('klap'); setTimeout(function () { play('fanfare'); }, 260); }
  });

  window.QSound = { on: on, set: set, play: play, squeak: squeak, prime: prime, supported: function () { return !!(window.AudioContext || window.webkitAudioContext); } };
})();
