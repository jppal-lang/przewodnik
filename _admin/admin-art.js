/* Lightbox panelu admina (JP 2026-11-01: „ikony miejsc w panelu muszą się dać powiększyć”). Zero zależności.
 * Hak globalny: dowolny element z data-zoom="<src pełnego rozmiaru>" (obrazek albo jego opakowanie) — klik / Enter / spacja otwiera
 * pełnoekranowy podgląd na szachownicy przezroczystości. Opcjonalnie: data-zoom-caption="trasa · przystanek · wersja",
 * data-zoom-group="nazwa" (strzałki ←/→ chodzą po elementach tej samej grupy; bez grupy — po najbliższej liście: ul/ol/.art-list/.pg-card).
 * Zamknięcie: przycisk ≥ 44 px, Esc, klik w tło. Link „otwórz plik ↗” prowadzi do src. Fokus wraca na element, który otworzył podgląd.
 * API: window.AdminZoom.open(el) / .close(). Elementy mogą być wstawiane dynamicznie (nasłuch na document). */
(function () {
  'use strict';
  var box = null, items = [], idx = -1, opener = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safe(u) { u = String(u || '').trim(); return /^(https?:\/\/|\.{0,2}\/|[a-z0-9_])/i.test(u) && !/^javascript:/i.test(u) && !/[\s"'<>]/.test(u) ? u : null; }
  function build() {
    if (box) return box;
    box = document.createElement('div');
    box.className = 'az'; box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Powiększony podgląd grafiki');
    box.innerHTML = '<div class="az__bar"><p class="az__cap" id="azCap"></p><span class="az__n" id="azN"></span>' +
      '<button type="button" class="az__btn az__close" aria-label="Zamknij podgląd (Esc)">✕</button></div>' +
      '<div class="az__stage"><img id="azImg" alt=""></div>' +
      '<button type="button" class="az__btn az__nav az__nav--prev" aria-label="Poprzednia grafika (←)">←</button>' +
      '<button type="button" class="az__btn az__nav az__nav--next" aria-label="Następna grafika (→)">→</button>';
    document.body.appendChild(box);
    box.addEventListener('click', function (e) {
      if (e.target.closest('.az__close')) close();
      else if (e.target.closest('.az__nav--prev')) step(-1);
      else if (e.target.closest('.az__nav--next')) step(1);
      else if (e.target === box || e.target.classList.contains('az__stage')) close();
    });
    return box;
  }
  function groupOf(el) {
    var g = el.getAttribute('data-zoom-group');
    if (g) return [].slice.call(document.querySelectorAll('[data-zoom][data-zoom-group="' + g.replace(/"/g, '') + '"]'));
    var root = el.closest('ul, ol, .art-list, .pg-card, .adm-icref, main') || document;
    return [].slice.call(root.querySelectorAll('[data-zoom]:not([data-zoom-group])'));
  }
  function show(i) {
    var el = items[i]; if (!el) return;
    idx = i;
    var src = safe(el.getAttribute('data-zoom')) || safe(el.getAttribute('src')), cap = el.getAttribute('data-zoom-caption') || (el.tagName === 'IMG' ? el.alt : el.querySelector('img') && el.querySelector('img').alt) || '';
    var img = box.querySelector('#azImg');
    img.src = src || ''; img.alt = cap || 'podgląd';
    box.querySelector('#azCap').innerHTML = esc(cap) + (src ? (cap ? ' · ' : '') + '<a href="' + esc(src) + '" target="_blank" rel="noopener noreferrer">otwórz plik ↗</a>' : '');
    box.querySelector('#azN').textContent = items.length > 1 ? (i + 1) + ' / ' + items.length : '';
    box.querySelector('.az__nav--prev').disabled = i <= 0;
    box.querySelector('.az__nav--next').disabled = i >= items.length - 1;
    [].forEach.call(box.querySelectorAll('.az__nav'), function (b) { b.hidden = items.length < 2; });
  }
  function step(d) { if (items[idx + d]) show(idx + d); }
  function open(el) {
    if (!el || !el.hasAttribute('data-zoom')) return;
    build();
    opener = el; items = groupOf(el); if (items.indexOf(el) < 0) items = [el];
    show(items.indexOf(el));
    box.hidden = false; document.body.classList.add('az-open');
    box.querySelector('.az__close').focus();
  }
  function close() {
    if (!box || box.hidden) return;
    box.hidden = true; document.body.classList.remove('az-open');
    box.querySelector('#azImg').src = '';
    if (opener && document.contains(opener)) { if (opener.tabIndex < 0) opener.tabIndex = 0; opener.focus(); }
    opener = null; items = []; idx = -1;
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-zoom]');
    if (!el || (box && !box.hidden && box.contains(el))) return;
    if (e.target.closest('a, button') && !e.target.closest('a, button').hasAttribute('data-zoom')) return;   // link obok obrazka działa normalnie
    e.preventDefault(); open(el);
  });
  document.addEventListener('keydown', function (e) {
    if (box && !box.hidden) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'Tab') {   // fokus zostaje w oknie
        var f = [].filter.call(box.querySelectorAll('button:not([disabled]):not([hidden]), a[href]'), function (x) { return x.offsetParent !== null; });
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.hasAttribute && e.target.hasAttribute('data-zoom')) { e.preventDefault(); open(e.target); }
  });
  // elementy z data-zoom mają być osiągalne klawiaturą — dopisujemy tabindex i rolę, także tym wstawianym później
  function arm(root) {
    [].forEach.call((root.querySelectorAll ? root : document).querySelectorAll('[data-zoom]'), function (el) {
      if (!el.hasAttribute('tabindex') && !/^(A|BUTTON)$/.test(el.tagName)) el.tabIndex = 0;
      if (!el.hasAttribute('role') && !/^(A|BUTTON)$/.test(el.tagName)) el.setAttribute('role', 'button');
      if (!el.hasAttribute('aria-label') && !el.getAttribute('alt')) el.setAttribute('aria-label', 'Powiększ: ' + (el.getAttribute('data-zoom-caption') || 'grafika'));
    });
  }
  if (window.MutationObserver) new MutationObserver(function (m) { for (var i = 0; i < m.length; i++) if (m[i].addedNodes.length) { arm(document); break; } }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState !== 'loading') arm(document); else document.addEventListener('DOMContentLoaded', function () { arm(document); });
  window.AdminZoom = { open: open, close: close };
})();
