/* =====================================================================
   QUOLINO — haptyka (haptic.js), P-7
   Krótkie wibracje tam, gdzie coś się „wkleja” — tylko widok dziecka i gra.
   Progresywne ulepszenie: bez navigator.vibrate (iOS Safari) nic się nie dzieje.
   Wyłączone przy prefers-reduced-motion: reduce oraz gdy dziecko wyłączy
   „Wibracje” w grze (localStorage quolino_game_haptics = '0', prefiks gry).
   Każde wywołanie wysyła też zdarzenie window „qc:pulse” (nazwa w detail) — słucha go kid-sound.js.
   Zero zależności.
   ===================================================================== */
(function () {
  'use strict';
  var KEY = 'quolino_game_haptics';
  var P = {
    mission: 12,                    // misja odhaczona
    sticker: [10, 40, 18],          // naklejka przystanku wklejona
    city: [20, 60, 20, 60, 40],     // cała trasa w albumie
    hit: 8,                         // gra: przeszkoda
    gameSticker: [10, 30, 10]       // gra: naklejka zebrana
  };
  function supported() { return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'; }
  function reduced() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function pref() { try { return localStorage.getItem(KEY) !== '0'; } catch (e) { return true; } }
  function enabled() { return supported() && !reduced() && pref(); }
  function set(on) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* prywatne okno */ } }
  function pulse(name) {
    // 2026-10-29: zdarzenie dla dźwięków na żądanie (kid-sound.js) — niezależnie od wibracji i reduced-motion
    try { window.dispatchEvent(new CustomEvent('qc:pulse', { detail: name })); } catch (e) { /* stare przeglądarki */ }
    if (!enabled() || !P[name]) return false;
    try { return navigator.vibrate(P[name]); } catch (e) { return false; }
  }
  window.QHaptic = { pulse: pulse, enabled: enabled, supported: supported, reduced: reduced, pref: pref, set: set };
})();
