/**
 * QUOLINO — i18n.js
 * Ładuje statyczne JSON-y (UI + content per miasto) i podmienia DOM.
 * Fallback: PL (treść polska jest w HTML — SEO/SSR).
 *
 * Pliki:
 *   lang/pl.json, lang/en.json ...         — UI strings (przyciski, etykiety)
 *   lang/pl/perugia.json, lang/en/perugia.json — content per miasto
 *
 * Użycie w HTML:
 *   <span data-i18n="btn.navigate">Nawiguj</span>  — UI string
 *   <p class="caps" data-i18n="label.for_kids">Dla dzieci</p>
 *   <script src="../../i18n.js"></script>  — PRZED </body>
 *
 * Zero zależności. Vanilla JS. ES5-compatible.
 */
(function () {
  'use strict';

  // ── Konfiguracja ───────────────────────────────────────
  var FALLBACK_LANG = 'pl';
  var LANG_BASE = getLangBase();      // ścieżka do katalogu lang/
  var CITY_SLUG = getCitySlug();      // 'perugia', 'urbino' itp.

  // Cache załadowanych JSON-ów
  var cache = {};   // { 'en': { ui: {...}, city: {...} } }
  var currentLang = FALLBACK_LANG;

  // ── Ścieżki ────────────────────────────────────────────

  /** Wyznacz bazową ścieżkę do lang/ względem bieżącego HTML */
  function getLangBase() {
    // HTML: /wlochy/umbria/perugia.html → lang/ jest w /lang/
    // Liczymy ile katalogów jesteśmy poniżej roota (przewodnik/)
    var path = location.pathname;
    // Szukamy "wlochy/" w ścieżce — jeśli jest, to jesteśmy 2+ poziomy w głąb
    var parts = path.replace(/\/[^/]*\.html.*$/, '').split('/').filter(Boolean);
    // Bazę lang/ umieszczamy w katalogu root strony (obok styles.css)
    // Liczymy ile razy musimy wyjść w górę
    var depth = 0;
    for (var i = parts.length - 1; i >= 0; i--) {
      if (parts[i] === 'przewodnik') break;
      depth++;
    }
    var prefix = '';
    for (var j = 0; j < depth; j++) prefix += '../';
    return prefix + 'lang/';
  }

  /** Wyznacz slug miasta z URL lub atrybutu <body> */
  function getCitySlug() {
    // <body data-city="perugia"> albo z nazwy pliku
    var body = document.body || document.documentElement;
    if (body.dataset && body.dataset.city) return body.dataset.city;
    var file = location.pathname.split('/').pop() || '';
    return file.replace('.html', '').replace(/[?#].*/, '');
  }

  // ── Fetch z cache ──────────────────────────────────────

  function fetchJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(r.status + ' ' + url);
      return r.json();
    });
  }

  /**
   * Załaduj UI + city JSON dla danego języka.
   * Zwraca Promise<{ui, city}>.
   */
  function loadLang(lang) {
    if (cache[lang]) return Promise.resolve(cache[lang]);

    var uiUrl = LANG_BASE + lang + '.json';
    var cityUrl = LANG_BASE + lang + '/' + CITY_SLUG + '.json';

    return Promise.all([
      fetchJSON(uiUrl).catch(function () { return null; }),
      fetchJSON(cityUrl).catch(function () { return null; })
    ]).then(function (results) {
      cache[lang] = { ui: results[0], city: results[1] };
      return cache[lang];
    });
  }

  // ── DOM swap: UI strings ───────────────────────────────

  function applyUI(uiData) {
    if (!uiData) return;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (uiData[key] !== undefined) {
        el.textContent = uiData[key];
      }
    });
  }

  // ── DOM swap: City content ─────────────────────────────

  function applyCity(cityData) {
    if (!cityData) return;

    // Hero
    var hero = document.querySelector('.city-hero-body');
    if (hero) {
      var caps = hero.querySelector('.caps');
      var h1 = hero.querySelector('h1');
      var sub = hero.querySelector('.subtitle');
      if (caps && cityData.region_label) caps.textContent = cityData.region_label;
      if (h1 && cityData.title) h1.textContent = cityData.title;
      if (sub && cityData.subtitle) sub.textContent = cityData.subtitle;
    }

    // <title>
    if (cityData.title) {
      document.title = cityData.title + ' — Quolino';
    }

    // Przystanki
    if (cityData.stops) {
      cityData.stops.forEach(function (stop) {
        var num = String(stop.number).padStart(2, '0');
        var el = document.querySelector('.stop[data-id="' + num + '"]');
        if (!el) return;

        // Nazwa
        var nameEl = el.querySelector('.stop-name');
        if (nameEl && stop.name) nameEl.textContent = stop.name;

        // Opis (zamień istniejące p.stop-desc)
        if (stop.desc_paragraphs && stop.desc_paragraphs.length) {
          var body = el.querySelector('.stop-body');
          if (body) {
            var oldDescs = body.querySelectorAll('p.stop-desc');
            // Usuń stare
            oldDescs.forEach(function (p) { p.remove(); });
            // Wstaw nowe, po .stop-photo
            var after = body.querySelector('.stop-photo') || body.firstChild;
            stop.desc_paragraphs.forEach(function (text) {
              var p = document.createElement('p');
              p.className = 'stop-desc';
              p.textContent = text;
              if (after && after.nextSibling) {
                body.insertBefore(p, after.nextSibling);
                after = p;
              } else {
                body.appendChild(p);
              }
            });
          }
        }

        // Boks dla dzieci
        var kidsBox = el.querySelector('.box-kids');
        if (kidsBox && stop.kids_box) {
          var kidsP = kidsBox.querySelectorAll('p');
          if (kidsP.length > 1) kidsP[kidsP.length - 1].textContent = stop.kids_box;
        }

        // Boks foto
        var fotoBox = el.querySelector('.box-foto');
        if (fotoBox && stop.photo_task) {
          var fotoP = fotoBox.querySelectorAll('p');
          if (fotoP.length > 1) fotoP[fotoP.length - 1].textContent = stop.photo_task;
        }

        // Numer + czas w headerze (czas nie tłumaczony, ale nazwa-wiersz tak)
        var numSpan = el.querySelector('.stop-num');
        if (numSpan && stop.time) {
          numSpan.textContent = num + ' · ' + stop.time;
        }
      });
    }

    // Plan dnia
    if (cityData.day_plan && cityData.day_plan.length) {
      var planCard = document.querySelector('.plan-card');
      if (planCard) {
        planCard.innerHTML = '';
        cityData.day_plan.forEach(function (item) {
          var row = document.createElement('div');
          row.className = 'plan-row';
          var time = document.createElement('span');
          time.className = 'plan-time';
          time.textContent = item.time;
          var desc = document.createElement('span');
          desc.textContent = item.description;
          row.appendChild(time);
          row.appendChild(desc);
          planCard.appendChild(row);
        });
      }
    }

    // Punkty awaryjne
    if (cityData.emergency && cityData.emergency.length) {
      var emergSec = document.getElementById('punkty-awaryjne');
      if (emergSec) {
        var oldRows = emergSec.querySelectorAll('.info-row');
        var emergContainer = oldRows.length ? oldRows[0].parentNode : emergSec;
        oldRows.forEach(function (r) { r.remove(); });

        cityData.emergency.forEach(function (e) {
          var row = document.createElement('div');
          row.className = 'info-row';

          var text = document.createElement('div');
          text.className = 'info-row-text';
          text.innerHTML = '<strong>' + escHTML(e.label) + '</strong> ' + escHTML(e.description);

          row.appendChild(text);

          if (e.maps_query) {
            var nav = document.createElement('a');
            nav.className = 'info-nav';
            nav.href = 'https://maps.google.com/?q=' + encodeURIComponent(e.maps_query);
            nav.target = '_blank';
            nav.rel = 'noopener';
            nav.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/></svg><span>' + escHTML(getUIString('btn.navigate', 'Nawiguj')) + '</span>';
            row.appendChild(nav);
          }

          emergContainer.appendChild(row);
        });
      }
    }

    // Rozmówki
    if (cityData.phrases && cityData.phrases.length) {
      var phraseCard = document.querySelector('.phrase-card');
      if (phraseCard) {
        phraseCard.innerHTML = '';
        cityData.phrases.forEach(function (p) {
          var pair = document.createElement('div');
          pair.className = 'phrase-pair';
          var user = document.createElement('div');
          user.className = 'phrase-pl';   // klasa CSS zostaje ta sama
          user.textContent = p.user;
          var local = document.createElement('div');
          local.className = 'phrase-it';  // klasa CSS zostaje ta sama
          local.textContent = p.local;
          pair.appendChild(user);
          pair.appendChild(local);
          phraseCard.appendChild(pair);
        });
      }
    }
  }

  // ── Pomocnicze ─────────────────────────────────────────

  function escHTML(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function getUIString(key, fallback) {
    if (cache[currentLang] && cache[currentLang].ui && cache[currentLang].ui[key]) {
      return cache[currentLang].ui[key];
    }
    return fallback;
  }

  // ── Zapisz/czytaj preferencje ──────────────────────────

  function saveLangPref(lang) {
    try { localStorage.setItem('quolino_lang', lang); } catch (e) { /* ok */ }
  }

  function readLangPref() {
    try { return localStorage.getItem('quolino_lang') || FALLBACK_LANG; } catch (e) { return FALLBACK_LANG; }
  }

  // ── Przełącz język ─────────────────────────────────────

  function switchLang(lang) {
    if (lang === currentLang && lang !== FALLBACK_LANG) return;
    currentLang = lang;
    saveLangPref(lang);

    // Highlight aktywny przycisk
    document.querySelectorAll('.lang-sw button').forEach(function (b) {
      var btnLang = b.textContent.trim().toLowerCase();
      var isActive = btnLang === lang;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    // Fallback PL: treść jest już w HTML, nie trzeba ładować JSON-ów
    if (lang === FALLBACK_LANG) {
      // Przywróć oryginalny HTML — przeładuj stronę (najprostszy fallback)
      // Alternatywa: cache PL DOM snapshot — ale reload jest prostszy i 100% niezawodny
      location.reload();
      return;
    }

    loadLang(lang).then(function (data) {
      applyUI(data.ui);
      applyCity(data.city);
      document.documentElement.lang = lang;
    }).catch(function (err) {
      console.warn('[i18n] Błąd ładowania ' + lang + ':', err);
    });
  }

  // ── Inicjalizacja ──────────────────────────────────────

  function init() {
    // Podepnij lang switcher
    document.querySelectorAll('.lang-sw button').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        var lang = b.textContent.trim().toLowerCase();
        switchLang(lang);
      });
    });

    // Przy ładowaniu: sprawdź zapisane preferencje
    var saved = readLangPref();
    if (saved && saved !== FALLBACK_LANG) {
      switchLang(saved);
    }
  }

  // Start po DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
