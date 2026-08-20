# FRONTEND.md — rola: Frontend / design strony

Zakres: HTML/CSS/JS, design system, widoki, dostępność, i18n w warstwie UI.
Nie ruszasz: treści merytorycznej (redakcja), Supabase (backend), dokumentów strategii.

---

## 1. DESIGN SYSTEM

### Paleta (tokeny w styles.css — jedno źródło prawdy)
| Token       | Hex     | Użycie                         |
|-------------|---------|--------------------------------|
| --parchment | #FFFCF5 | tło kart                       |
| --ink       | #383026 | tekst główny                   |
| --ink2      | #6E6154 | tekst wtórny                   |
| --label     | #8A7B68 | etykiety caps                  |
| --line      | #E7DBC6 | separatory                     |
| --terra     | #B4502E | CTA / primary                  |
| --olive     | #5F6637 | chipy logistyczne, boks dzieci |
| --sea       | #23677A | akcent, boks foto, focus       |

- Tło: `#FFFFFF` + trzy radial-gradient mgły (terra, olive, sea)
- Font: **Figtree** 400–800, bazowy **19px, min 18px**
- Cele dotykowe: **min 44×44px**
- Zaokrąglenia: 12 / 16 / 20 / 999
- Cienie: sh1 (akordeon), sh2 (karta), sh-hover
- Logo: `quolino-logo.svg`; tekstowe: nazwa 800 + `.` terra + domena 600 ink2

### Zakazy
- Zero frameworków JS/CSS, zero build stepu
- Nie ukrywaj akcji wewnątrz akordeonu
- Layout musi znieść +30% dłuższy tekst (DE, EL, NO)

---

## 2. ANATOMIA KARTY MIASTA (struktura HTML)

- **Hero:** zdjęcie full-bleed → ← wstecz + toggle widoku dziecka + lang switcher
  → H1 + lead + ewentualny chip charakteru dnia (BEZ km/czasów dojazdu — patrz
  zasada wspólna nr 2 w CLAUDE.md)
- **Przystanki:** akordeony, jeden otwarty naraz
  - Nagłówek widoczny bez rozwinięcia: `{num} · {time}` terra → nazwa 21px/600 → ▼
  - Chipy: rok (neutral) + cena (olive)
  - Akcje: Nawiguj (terra) / Napisz (outline) / WWW (outline)
  - Wnętrze: zdjęcie Wikimedia (`data-wiki`) → opis → boks dzieci (olive-bg)
    → boks foto (sea-bg) → album → zgłoś uwagę (tylko rodzic)
- **Stopka:** plan dnia, punkty awaryjne, rozmówki, telefony, oceń, BMC

---

## 3. DWA WIDOKI

- Przełącznik: toggle w nagłówku lub `?view=kid`; stan `localStorage('questini_view')`
- Widok dziecka: mapa przystanków, karty misji, checkboxy odznak, progress bar,
  ranking rodzinny, galeria — WIĘKSZE ikony, wyraźniejsze akcenty, gratulacje
- Dziecko NIE widzi: cen, godzin, historii, telefonów, ocen, partnerów, BMC
- Maskotka Quolino: TYLKO widok dziecka (zasady: docs/QUOLINO.md)
- Ten sam design system w obu widokach — jedna marka

---

## 4. i18n (warstwa UI)

- Przełącznik z flagami CSS w nagłówku (13 języków, lista w docs/BACKEND.md)
- Atrybuty `data-i18n` na tłumaczonych elementach
- Zmiana języka bez przeładowania (DOM swap przez i18n.js)
- Override URL: `?lang=it`

---

## 5. POZOSTAŁE ELEMENTY UI

- **Cookie banner:** pierwszo-wejściowy, tekst + OK → `questini_cookie_consent`
- **places.html:** hierarchia kraj → region → miejsce, karta z nazwą, leadem,
  średnią ocen, liczbą przystanków
- **Mapa Europy (faza 2):** SVG statyczny → Leaflet + OSM z pinezkami
- **Geolokalizacja na indeksach regionów:** sortowanie kart po odległości
  DOPIERO po kliknięciu użytkownika (live dystans z prefiksem ↑); domyślnie
  karty BEZ km
- **BMC widget:** floating, kolor #B4502E — tylko widok rodzica

---

## 6. CHECKLIST PRZED ODDANIEM

- [ ] Min 18px tekst, min 44×44px dotyk
- [ ] Zero km/czasów dojazdu w wyrenderowanym HTML
- [ ] Działa toggle rodzic/dziecko i nic komercyjnego nie przecieka do dziecka
- [ ] Zero zależności zewnętrznych poza Google Fonts (Figtree) i BMC widgetem
