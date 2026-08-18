# CLAUDE.md — instrukcje projektu

## Czym jest ten projekt

Statyczny serwis z rodzinnymi przewodnikami wypadowymi po regionach Europy.
Użytkownik: rodzina z dziećmi, podróżująca autem, używa telefonu w jednej ręce
w pełnym słońcu. Start: region Marche & Umbria (Włochy). Docelowo: wiele regionów
Europy, wiele języków.

Hosting: GitHub Pages, repo `jppal-lang/przewodnik`, branch `main`, katalog `/`.
Brak backendu, baz danych, bundlerów — czysty HTML + CSS + vanilla JS.

## Struktura plików

```
/
├── index.html          # strona główna — lista miast regionu
├── perugia.html        # karta miasta (wzorcowa — pełny format wg handoffu)
├── asyz.html           # karta miasta
├── frasassi.html       # karta miasta
├── urbino.html         # karta miasta
├── rimini.html         # karta miasta
├── ancona.html         # karta miasta
├── rawenna.html        # karta miasta
├── styles.css          # wspólny design system — JEDNO źródło prawdy
├── app.js              # album zdjęć (localStorage) + Wikimedia images
├── README.md           # opis repo
└── CLAUDE.md           # ten plik
```

Docelowa struktura wielojęzyczna i wieloregionowa:

```
/
├── index.html                  # landing / wybór regionu
├── styles.css
├── app.js
├── i18n.js                     # runtime tłumaczeń
├── lang/
│   ├── pl.json                 # tłumaczenia UI + treści (domyślny)
│   ├── en.json
│   ├── it.json
│   └── de.json
├── marche-umbria/
│   ├── index.html              # lista miast regionu
│   ├── perugia.html
│   ├── asyz.html
│   └── ...
├── toskania/                   # przyszły region
│   ├── index.html
│   └── ...
└── CLAUDE.md
```

## Design system — tokeny (źródło prawdy: styles.css)

### Paleta
| Token               | Hex       | Użycie                                    |
|----------------------|-----------|-------------------------------------------|
| `--sand`             | `#F7F0E3` | tło strony                                |
| `--parchment`        | `#FFFCF5` | tło kart, akordeonów                      |
| `--ink`              | `#383026` | tekst główny                              |
| `--ink2`             | `#6E6154` | tekst wtórny, leady                       |
| `--label`            | `#8A7B68` | etykiety caps                             |
| `--line`             | `#E7DBC6` | obramowania, separatory                   |
| `--terra`            | `#B4502E` | primary / CTA (hover `--terra-h` `#8F3D1F`) |
| `--olive`            | `#5F6637` | chipy logistyczne (dystans, cena)         |
| `--olive-bg`         | `#EEF0E0` | tło chipów oliwkowych, boks „Dla dzieci"  |
| `--sea`              | `#23677A` | akcent kontekstowy, focus outline         |
| `--sea-bg`           | `#E4EEF0` | tło boksu „Zadanie foto", chip morski     |
| `--chip-bg`          | `#F1E6D2` | chip neutralny (rok budowy), filtry       |
| `--btn2-border`      | `#D9A88F` | obramowanie przycisków outline            |

### Typografia — JEDEN krój: Figtree (Google Fonts, wagi 400–800)
- H1: 32–34px mobile / 44px desktop, weight 800, ls −0.015em
- Nazwa miasta: 24px, weight 600
- Nazwa przystanku: 21px, weight 600
- Tekst podstawowy: 19–20px, weight 400 — **NIGDY poniżej 18px**
- Chip / przycisk: 15–16px, weight 600–700
- Etykieta caps: 13px, weight 700, uppercase, ls 0.11em, kolor `--label`
- Numer+godzina: 16px, weight 700, kolor `--terra`

### Spacing, zaokrąglenia, cienie
- Spacing: 4 · 8 · 12 · 16 · 24 · 32 · 48
- Radius: 12 (chip/przycisk) · 16 (boks/akordeon) · 20 (karta) · 999 (pill)
- Cień 1 (akordeon): `0 1px 2px rgba(60,42,20,.08)`
- Cień 2 (karta): `0 1px 2px rgba(60,42,20,.06), 0 8px 24px rgba(60,42,20,.08)`
- Hover karty: `0 2px 4px rgba(60,42,20,.08), 0 12px 32px rgba(60,42,20,.14)`
- Cele dotykowe: min 44×44px, odstęp min 8px

## Anatomia karty miasta (wzorzec: perugia.html)

### Hero
- Zdjęcie full-bleed 260px (mobile), `object-fit: cover`
- Nad zdjęciem (absolute): przycisk wstecz `←` 44×44 pill + przełącznik języka
- Pod zdjęciem: H1, lead (subtitle), chipy hero (dystans, czas, powrót)

### Przystanki (`.stops`)
Akordeony, jeden otwarty naraz. **Przystanek 01 to ZAWSZE parking.**

Nagłówek przystanku (widoczny BEZ rozwinięcia!):
1. Rząd: `{num} · {time}` (terrakota) → nazwa (21px/600) → strzałka ▼
2. Rząd chipów: rok budowy (neutral) + cena (oliwka)
3. Rząd akcji (min-h 44px):
   - **Nawiguj** (terrakota wypełniony, ikona pinezki) — Google Maps; parking: „Prowadź" + `maps/dir` z lokalizacji
   - **Napisz** (outline, ikona dymka) — WhatsApp `wa.me/{numer}` — ZAMIAST telefonu (bariera językowa)
   - **WWW** (outline, ikona globusa) — strona obiektu

Wnętrze przystanku:
- Zdjęcie 200px radius 14 (Wikimedia lub slot)
- Opis 19px/1.55
- Boks „Dla dzieci" (oliwka)
- Boks „Zadanie foto" (morski)
- Album zdjęć użytkownika (miniatury 72×72 + „Dodaj zdjęcie z galerii")

### Stopka miasta
Sekcje z etykietą caps:
- **Plan dnia**: karta, grid 72px+1fr, godziny bold terrakota
- **Punkty awaryjne**: apteka, toalety, plac zabaw, szpital
- **Rozmówki**: pary PL/język lokalny
- **Telefony**: klikalne `tel:`, numer bold terrakota

## Strona główna (index.html)

- Nagłówek: caps „Wypady z bazy", H1 region, podtytuł, przełącznik języka
- Filtry: Państwo / Region / Miasto (overflow-x scroll, rozszerzalne o „Dzielnicę")
- Karty miast: thumb 150px + nazwa + chip dystansu + lead; jedno miasto „DZIŚ" (badge terrakota)
- Geolokalizacja: przycisk „Zlokalizuj mnie" → sortowanie od najbliższego (haversine)
- Desktop: grid `repeat(3, 1fr)`, gap 24, hover uniesienie −3px

## Wielojęzyczność (i18n) — strategia wdrożenia

### Zasada
Interfejs (UI labels, przyciski, etykiety sekcji) i treść (opisy przystanków,
ciekawostki, leady miast) są tłumaczone na 4 języki: **PL** (domyślny), **EN**, **IT**, **DE**.

### Implementacja (docelowa)
1. Pliki `lang/{kod}.json` zawierają WSZYSTKIE stringi — UI i treść.
2. Plik `i18n.js` ładuje JSON wybranego języka i wstrzykuje treść przez `data-i18n` atrybuty.
3. HTML zawiera `data-i18n="klucz"` zamiast tekstu; tekst PL jako fallback w innerHTML.
4. Przełącznik języka zmienia `lang` na `<html>`, ładuje JSON, podmienia treści bez przeładowania.
5. Wybrany język zapisywany w `localStorage('lang')`.

### Struktura klucza i18n
```
{
  "ui.back": "Wróć",
  "ui.navigate": "Nawiguj",
  "ui.drive": "Prowadź",
  "ui.write": "Napisz",
  "ui.kids": "Dla dzieci",
  "ui.photo_task": "Zadanie foto",
  "ui.add_photo": "Dodaj zdjęcie z galerii",
  "ui.day_plan": "Plan dnia",
  "ui.emergency": "Punkty awaryjne",
  "ui.phrases": "Rozmówki",
  "ui.phones": "Telefony",
  "ui.locate": "Zlokalizuj mnie",
  "ui.today": "DZIŚ",
  "ui.free": "bezpłatnie",
  "ui.return_by": "powrót do {time}",
  "ui.filter.country": "Państwo",
  "ui.filter.region": "Region",
  "ui.filter.city": "Miasto",

  "region.marche.title": "Marche & Umbria",
  "region.marche.subtitle": "7 miast · sortowane od najbliższego",

  "city.perugia.name": "Perugia",
  "city.perugia.lead": "Podziemne miasto, ruchome schody i najlepsza czekolada Umbrii.",
  "city.perugia.stop.01.name": "Parking Piazza Partigiani",
  "city.perugia.stop.01.desc": "Wielopoziomowy parking tuż pod murami...",
  "city.perugia.stop.01.kids": "Ruchome schody jadą przez prawdziwe podziemne miasto!...",
  "city.perugia.stop.01.foto": "Rodzinne zdjęcie przy wejściu do scale mobili..."
}
```

### Reguły tłumaczeniowe
- Tekst DE bywa +30% dłuższy niż PL — layout MUSI to znosić (flex + wrap, chipy nowrap)
- Nazwy własne zabytków: w IT/DE zostawić oryginał włoski, w EN/PL tłumaczyć jeśli jest ustalony polski/angielski odpowiednik (np. „Katedra San Lorenzo" / „Cathedral of San Lorenzo")
- Rozmówki w stopce: zawsze para język_przewodnika ↔ język_lokalny (np. EN↔IT, DE↔IT)
- Ceny, godziny, numery telefonów, linki Maps/WhatsApp — NIE podlegają tłumaczeniu

## Zdjęcia

### Wikimedia Commons (zabytki)
- Ładowane dynamicznie z API Wikipedii (`it.wikipedia.org/api/rest_v1/page/summary/`)
- Atrybut `data-wiki="Tytuł_artykułu"` na elemencie `.stop` lub `.stop-photo`
- Licencja CC BY-SA wymaga atrybucji — link „Foto: Wikimedia Commons" pod zdjęciem
- Wymagają internetu; offline = puste sloty (graceful degradation)

### Album użytkownika (app.js)
- Zdjęcia z galerii telefonu, kompresowane do JPEG 72% / max 1000px
- Zapisywane w `localStorage` pod kluczem `album:{strona}:{indeks_przystanku}`
- Usuwanie: tap na miniaturę → confirm
- Limit: pojemność localStorage (~5–10 MB zależnie od przeglądarki)

## Konwencje kodowania

### HTML
- Semantyczny: `<header>`, `<main>`, `<nav>`, `<article>` (w kartach miast)
- Akordeony: `<div class="stop">` z `<button class="stop-header">`, NIE `<details>` (wymagana kontrola „jeden otwarty")
- Akcje w nagłówku: `onclick="event.stopPropagation()"` — klik na Nawiguj/Napisz/WWW nie przełącza akordeonu
- Atrybuty `data-*`: `data-id` (stop), `data-wiki` (artykuł Wikipedia), `data-lat`/`data-lng` (koordynaty), `data-i18n` (klucz tłumaczenia)

### CSS
- Jeden plik `styles.css`, zmienne CSS (custom properties) w `:root`
- Mobile-first, breakpoint desktop: `@media (min-width: 800px)`
- Klasy BEM-light: `.stop-header`, `.stop-body`, `.city-card`, `.chip-olive`
- Focus widoczny zawsze: `outline: 3px solid var(--sea); outline-offset: 2px`

### JS
- Vanilla, zero zależności, zero bundlera
- `app.js`: album zdjęć + ładowanie Wikimedia — oba jako IIFE
- `i18n.js` (do zbudowania): ładowanie JSON, podmiana `data-i18n`, zapis `localStorage('lang')`
- Geolokalizacja: w `index.html` inline (haversine + sort)

## Dodawanie nowego miasta

1. Skopiuj `perugia.html` jako szablon
2. Zamień: H1, lead, chipy hero, przystanki (dane), stopkę (plan/awaryjne/rozmówki/telefony)
3. Przystanek 01 = parking z przyciskiem „Prowadź" (`maps/dir`)
4. Każdy zabytek: chip z rokiem budowy + `data-wiki="Tytuł_artykułu"` do zdjęcia
5. Dodaj kartę w `index.html` z `data-lat`/`data-lng` i leadem
6. Dodaj klucze tłumaczeń w `lang/*.json`

## Dodawanie nowego regionu

1. Utwórz katalog `/nazwa-regionu/`
2. Skopiuj `index.html` regionu jako szablon listy miast
3. Dodaj kartę regionu na landing page `/index.html`
4. Dodaj klucze `region.{slug}.*` w `lang/*.json`

## Czego NIGDY nie robić

- Tekst poniżej 18px
- Cele dotykowe poniżej 44×44px
- Ukrywanie przycisków akcji przystanku wewnątrz rozwiniętego akordeonu
- Hardkodowanie bazy noclegowej (odległości dynamiczne z geolokalizacji)
- Dodawanie elementów komercyjnych (koszyk, logowanie, cennik) bez jawnej decyzji
- Wymyślanie dat budowy, cen biletów, numerów telefonów — jeśli brak źródła, napisz „sprawdź na miejscu"
- Używanie `localStorage` do czegokolwiek poza albumem zdjęć i wyborem języka
- Import frameworków JS / CSS (React, Tailwind, Bootstrap) — projekt jest celowo zero-dependency

## Git workflow

- Branch: `main` (jedyny, bezpośredni push)
- Commit message: po polsku, opisowy, z zakresem zmian
- Push wymaga PAT (Personal Access Token) — token jednorazowy, usuwany z remote URL po pushu
- GitHub Pages buduje automatycznie po każdym pushu (1–2 min)

## Kontakt z API

- Wikimedia REST API: `it.wikipedia.org/api/rest_v1/page/summary/{tytuł}` — publiczne, bez klucza
- Google Maps linki: `maps.google.com/?q=` (nawiguj) lub `maps/dir/?api=1&destination=` (prowadź) — bez API key
- WhatsApp: `wa.me/{numer}` — bez API

## Status wdrożenia

| Element                    | Status        |
|---------------------------|---------------|
| Design tokens w CSS        | ✅ gotowe     |
| Strona główna (index)      | ✅ gotowe     |
| Perugia (wzorzec)          | ✅ pełna wg handoffu |
| Asyż, Frasassi, Urbino     | ⚠️ treść pełna, format do migracji na nowy szablon |
| Rimini, Ancona, Rawenna    | ⚠️ treść pełna, format do migracji na nowy szablon |
| i18n runtime               | 🔲 do zbudowania |
| Tłumaczenia EN/IT/DE       | 🔲 do zbudowania |
| Zdjęcia miast na kartach   | 🔲 sloty gotowe, brak plików |
| Struktura wieloregionowa   | 🔲 architektura opisana, do wdrożenia |
