# FRONTEND.md — rola: Frontend / design strony

Zakres: HTML/CSS/JS, design system, widoki, dostępność, i18n w warstwie UI.
Nie ruszasz: treści merytorycznej (redakcja), schematu Supabase (backend), dokumentów strategii.

Pełny opis systemu wizualnego: `DESIGN.md` (+ `.impeccable/design.json`).
Prawda o produkcie: `PRODUCT.md`. Kontrakt kierunku: `.impeccable/surfaces/index-html.md`.

---

## 1. DESIGN SYSTEM — v4 „Album naklejek” (od 2026-10-06)

Każde miasto to strona albumu z naklejkami (tradycja Panini, Modena). Przystanki
to numerowane naklejki, rodzinny dzień to kompletowanie strony. Dziecko „wkleja”
naklejkę, gdy zaliczy misje przystanku.

### Pliki
| Plik | Rola |
|------|------|
| `styles.css` | JEDYNE źródło stylów dla index / country / region / city. Strony nie mają `<style>`. |
| `legacy.css` | stare statyczne strony `/wlochy/` (paleta przemapowana na v4) |
| `motion.js` | ruch: wklejanie przy przewijaniu, pauza filmu, łagodny tryb przy „ograniczonych animacjach” |
| `i18n-ui.js` | słownik interfejsu (17 języków) + łańcuch języków dla danych — patrz §5 |

### Tokeny (styles.css → :root)
| Token | Hex | Użycie |
|-------|-----|--------|
| --page | #EAF0F8 | tło strony (zadrukowana strona albumu, kropki 15px) |
| --card | #FFFFFF | naklejki, karty, panele |
| --ink / --ink2 / --muted | #0E1A2B / #3E4C63 / #5D6B82 | tekst główny / wtórny / etykiety |
| --rule / --slot | #D3DDEA / #A9BBD3 | linie / przerywane puste miejsca |
| --azzurro (-ink, -deep, -50) | #0B4EA2 … | okładka, pasy, numery, przyciski na białym |
| --sun | #FFC629 | główna akcja na azzurro, focus, zaznaczenie |
| --rosso / --verde | #C81E36 / #1F7A48 | alarm (telefony, ZTL) / misja zaliczona |
| --foil | gradient złota | naklejka-folia: Quo #00, kolacja |
| --team / --team-ink | z `cities.bandana_color` | kolor „drużyny” miasta (pas, pasek naklejki); jasny kolor → ciemny tekst |

- Font: **Archivo** (Google Fonts, oś szerokości): nazwy 62% / 900 wersalikami,
  numery 125% / 900, tekst 100% / 400, **bazowo 19px, min 18px** dla treści.
- Promienie: naklejka 12, przycisk 10, panel 16. Cienie: `--lift-1/2/3` (z offsetem i rozmyciem).
- Cele dotykowe: **min 44×44px**.
- Logo: tekstowe „QUOLINO • COM” w kapslu azzurro z żółtą kropką.

### Komponenty sygnaturowe
- `.sticker` — biały kartonik, numer w kapslu w rogu, pasek koloru drużyny, lekki obrót (`--tilt`).
- `.slot` — puste miejsce: przerywany obrys + duży blady numer („wkrótce”, niezebrane).
- `.band` — pełnoszeroki pas (okładka azzurro / pas miasta w kolorze drużyny).
- `.qc-strip` — rząd naklejek przystanków pod zdjęciem miasta.
- Kolacja = naklejka-folia; misje = karteczki z przerywaną ramką (oliwkowe po zaliczeniu).

### Ruch
- Okładka: film `media/hero.mp4` w naklejce #00 (autoplay, muted, loop, playsinline, poster, **przycisk pauzy**).
- Wklejanie naklejek na start i przy przewijaniu, odklejany róg na hover, wybuch gwiazdek
  i licznik w widoku dziecka.
- `prefers-reduced-motion`: zostaje łagodne pojawianie się i film z pauzą; znikają obroty i odbicia.

### Zakazy
- Zero frameworków JS/CSS, zero build stepu, zero `<style>` w HTML, zero kolorów spoza tokenów
- Zero etykiet-„eyebrow” nad nagłówkami, zero kart „ikona+tytuł+tekst” jako szkieletu strony
- Nie ukrywaj akcji wewnątrz akordeonu
- Layout musi znieść +30% dłuższy tekst (DE, NL, HU)

---

## 2. LANDING — OKŁADKA ALBUMU

- `.cover.band`: tytuł (wersaliki, wąski Archivo) + podtytuł + „Zaczynamy!” (sun) + „Jak to działa”.
- `.sheet`: naklejka-folia #00 z filmem Quo, pod nią 3 naklejki miast z ilustracją
  (renderowane z bazy w `buildHeroSheet`) i puste miejsce „Toskania · wkrótce”.
- Telefon: arkusz z filmem otwiera stronę, miasta jako rząd 4 małych naklejek.
- Dalej: „Jak to działa” (trasa 4 naklejek), „Dlaczego Quolino”, regulamin albumu,
  indeks regionów (naklejki + puste miejsca), tylna okładka z CTA.
- Cache busting: `styles.css?v=N`, `motion.js?v=N`, `i18n-ui.js?v=N` — podbijać przy zmianach we wszystkich 4 stronach.

---

## 3. KARTA MIASTA (city.html, dane z Supabase)

- Pas w kolorze drużyny: okruszki, nazwa, lead, licznik „x/y naklejek”, fakty, przycisk trasy.
- Zdjęcie miasta jako duża naklejka nachodząca na pas, pod nim `.qc-strip`.
- Przystanki: `details.qc-stop` z naklejką-ikoną (numer), nazwą, „odwrotem” (ROK · BILET · CZAS),
  Nawiguj; w środku: uwagi, opis, misja i zadanie foto (checkboxy, localStorage `qc.task.*`).
- Przełącznik przy przystanku (rodzic) chowa go w widoku dziecka (`?view=kid&hide=…`).
- Sekcja pod trasą: tylko Punkty awaryjne — nagłówek karty to typ punktu w języku strony
  (`emerg.pharmacy/toilet/playground/hospital`), pod nim nazwa własna z bazy.
  Plan dnia i Telefony usunięte 2026-10-06 (decyzja JP: plan dublował trasę).
- Panel boczny: trasa, QR dla dziecka, jedzenie, warto wiedzieć, wsparcie.
- Bez km/czasów dojazdu (zasada nr 2).

---

## 4. DWA WIDOKI

- `?view=kid` (QR z karty miasta). Dziecko NIE widzi: cen, godzin, historii, telefonów,
  nawigacji, BMC (także w nagłówku), panelu bocznego — egzekwuje to CSS `.qc[data-view="kid"]`.
- Dziecko widzi: naklejki (puste → wklejone po zaliczeniu misji), misje, licznik.
- Quo może występować w obu widokach (decyzja JP 2026-10-06).

---

## 5. i18n (warstwa UI)

- Język: `?lang=xx` > `localStorage('quolino_lang')` > `pl`. Napisy z `ui_translations`
  (`data-ui` w HTML, `ui('klucz','fallback')` w JS).
- `i18n-ui.js` (w `<head>`, przed skryptami stron):
  1. słownik 60 napisów interfejsu × 17 języków — gdy klucza brak w bazie;
     kolejność: baza[język] > słownik[język] > baza/słownik[en] > pl;
  2. zapytania `*_translations`, `day_plan`, `emergency_points` z `lang=eq.X`
     pobierają X, en, pl i zostawiają najlepszą wersję (brak tłumaczenia ≠ slug ani „Dane wkrótce.”);
  3. ustawia `<html lang>` i tłumaczy `data-ui-aria` / `data-ui-local`.
- Nowy napis w UI: dodaj klucz do Supabase (wszystkie języki) ORAZ do słownika w `i18n-ui.js`.
- Znane braki poza frontendem (2026-10-06): fakty przystanków (`stops.year_built/price/
  time_label/opening_hours`) i `phone_numbers` nie mają wersji językowych; treści miast
  przetłumaczone głównie dla Spello; formy liczby mnogiej (cs/sk/hr/uk) — jedna forma.

---

## 6. POZOSTAŁE ELEMENTY UI

- **Cookie banner:** pierwszo-wejściowy, tekst + OK → `questini_cookie_consent`
- **Mapa Europy (faza 2):** SVG statyczny → Leaflet + OSM z pinezkami
- **Geolokalizacja na indeksach regionów:** sortowanie po odległości DOPIERO po kliknięciu; domyślnie bez km
- **BMC:** przycisk „Wesprzyj” (sun) w nagłówku i boks w panelu — tylko widok rodzica

---

## 7. CHECKLIST PRZED ODDANIEM

- [ ] Min 18px tekst treści, min 44×44px dotyk
- [ ] Zero km/czasów dojazdu w wyrenderowanym HTML (sprawdź też `ui_translations`)
- [ ] Toggle rodzic/dziecko działa i nic komercyjnego nie przecieka do dziecka
- [ ] Zero `<style>` w HTML; wersje `?v=` podbite na wszystkich stronach
- [ ] Nowe napisy w Supabase (17 języków) i w `i18n-ui.js`
- [ ] Sprawdzone co najmniej w `?lang=pl`, `?lang=en` i jednym języku bez treści (np. `?lang=cs`)
- [ ] Film na okładce: poster, `playsinline`, przycisk pauzy
