/* =====================================================================
   QUOLINO — stop-icon.js (JP 2026-10-31: „po akceptacji to musi lecieć automatem”)
   Jedna reguła wyboru obrazka przystanku dla strony, SSR i panelu:
     stops.icon = 'place-<trasa>-<stop_key>' (ustawia place-icons.mjs ok/sync po akceptacji ikony miejsca)
       → /media/icons/place-<trasa>-<stop_key>-<rozmiar>.webp (64/128/256/512, nazwy unikalne — bez ?v=)
     inaczej → ikona kategorii /media/icons/icon-<kategoria>-<rozmiar>.webp (jak dotąd)
   Gdy pliku ikony miejsca nie ma (np. stara kopia strony) — onerror cofa do ikony kategorii, potem usuwa obrazek.
   Czysta logika (bez DOM) jest testowana w Node: _content/claude-skills/bin/stop-icon.test.mjs.
   ===================================================================== */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  root.QStopIcon = m;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var DIR = '/media/icons/';
  var PLACE_RE = /^place-[a-z0-9]+(?:-[a-z0-9]+)+$/;   // place-<trasa>-<stop_key> (małe litery, cyfry, myślniki)
  var CATS = { parking: 'parking', monument: 'monument', church: 'church', museum: 'museum', house: 'house', viewpoint: 'viewpoint-city',
    restaurant: 'restaurant', icecream: 'icecream', sweets: 'sweets', photo: 'photo', street: 'street', castle: 'castle', synagogue: 'synagogue' };

  // nazwa ikony miejsca z wiersza przystanku albo null
  function placeName(stop) {
    var i = stop && stop.icon;
    return typeof i === 'string' && i.length <= 160 && PLACE_RE.test(i) ? i : null;
  }
  function catFile(cat) { return CATS[cat] || null; }
  var placeSrc = function (name, size) { return DIR + name + '-' + size + '.webp'; };
  var catSrc = function (file, size) { return DIR + 'icon-' + file + '-' + size + '.webp'; };

  // wybór: { kind: 'place'|'category'|'none', src, srcset, fallback: { src, srcset } | null }
  //   sizes = [1x, 2x] np. [128, 256]; ikona kategorii ma tylko 64/128/256 — 512 schodzi do 256
  function pick(stop, sizes) {
    var s1 = sizes[0], s2 = sizes[1] || sizes[0];
    var cat = (stop && stop.category) || 'monument', cf = catFile(cat);
    var catPick = cf ? { kind: 'category', src: catSrc(cf, Math.min(s1, 256)), srcset: catSrc(cf, Math.min(s1, 256)) + ' 1x, ' + catSrc(cf, Math.min(s2, 256)) + ' 2x', fallback: null } : { kind: 'none', src: null, srcset: null, fallback: null };
    var pn = placeName(stop);
    if (!pn) return catPick;
    return { kind: 'place', name: pn, src: placeSrc(pn, s1), srcset: placeSrc(pn, s1) + ' 1x, ' + placeSrc(pn, s2) + ' 2x', fallback: cf ? { src: catPick.src, srcset: catPick.srcset } : null };
  }
  function escAttr(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // atrybuty <img> (bez znacznika): src, srcset, data-fb/data-fbset (zapas), onerror
  //   extra — dodatkowe atrybuty jako napis (np. 'class="x" width="66" height="66" loading="lazy"'); onerror dopisujemy sami
  function imgAttrs(p, extra, onloadExtra) {
    if (!p || !p.src) return null;
    var a = 'src="' + escAttr(p.src) + '" srcset="' + escAttr(p.srcset) + '" alt="" decoding="async"' + (extra ? ' ' + extra : '');
    if (p.fallback) a += ' data-fb="' + escAttr(p.fallback.src) + '" data-fbset="' + escAttr(p.fallback.srcset) + '"';
    if (p.kind === 'place') a += ' data-place="' + escAttr(p.name) + '"';
    a += ' onerror="QStopIcon.fallback(this)"';
    if (onloadExtra) a += ' onload="' + onloadExtra + '"';
    return a;
  }
  function img(stop, sizes, extra, onloadExtra) { var a = imgAttrs(pick(stop, sizes), extra, onloadExtra); return a ? '<img ' + a + '>' : ''; }
  // onerror: najpierw ikona kategorii (data-fb), potem usunięcie obrazka (SVG w karcie zostaje)
  function fallback(el) {
    if (!el) return;
    var fb = el.getAttribute('data-fb');
    if (fb) {
      el.removeAttribute('data-fb'); el.removeAttribute('data-place');
      var set = el.getAttribute('data-fbset'); el.removeAttribute('data-fbset');
      if (set) el.setAttribute('srcset', set); else el.removeAttribute('srcset');
      el.src = fb;
      return;
    }
    if (el.parentNode) el.parentNode.removeChild(el);
  }
  return { placeName: placeName, catFile: catFile, pick: pick, img: img, imgAttrs: imgAttrs, fallback: fallback, DIR: DIR, CATS: CATS };
});
