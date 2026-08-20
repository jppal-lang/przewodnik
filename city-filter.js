/**
 * QUOLINO — city-filter.js
 * Filtruje city-cards po czasie trwania wycieczki.
 * Vanilla JS, zero zależności.
 *
 * Atrybuty na .city-card:
 *   data-duration="half_day"  lub  data-duration="full_day"
 *   data-hours="5"           szacowany czas w godzinach
 *
 * Struktura HTML filtrów:
 *   <div class="duration-filters" id="durFilters">
 *     <button class="dur-chip active" data-filter="all">...</button>
 *     <button class="dur-chip" data-filter="half_day">...</button>
 *     <button class="dur-chip" data-filter="full_day">...</button>
 *   </div>
 */
(function () {
  'use strict';

  var ICON_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>';

  var ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';

  var ICON_HALF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/><path d="M16.5 17.5L19 20" opacity=".4"/></svg>';

  function init() {
    var container = document.getElementById('durFilters');
    if (!container) return;

    var chips = container.querySelectorAll('.dur-chip');
    var cards = document.querySelectorAll('.city-card[data-duration]');

    if (!cards.length) return;

    // Podepnij kliknięcia
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var filter = chip.getAttribute('data-filter');

        // Toggle active
        chips.forEach(function (c) { c.classList.remove('active'); });
        chip.classList.add('active');

        // Filtruj karty
        cards.forEach(function (card) {
          var dur = card.getAttribute('data-duration');
          if (filter === 'all' || dur === filter) {
            card.removeAttribute('data-dur-hidden');
          } else {
            card.setAttribute('data-dur-hidden', '');
          }
        });

        // Aktualizuj licznik (jeśli jest)
        updateCount();
      });
    });
  }

  function updateCount() {
    var visible = document.querySelectorAll('.city-card[data-duration]:not([data-dur-hidden])');
    var counter = document.getElementById('cityCount');
    if (counter) {
      counter.textContent = visible.length;
    }
  }

  // Start po DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
