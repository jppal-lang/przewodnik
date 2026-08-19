# DESIGN BRIEF — Quolino

> Dokument do wklejenia w Claude Design. Wersja 1.1 — 19.08.2026.
> **Uwaga:** §4 (maskotka) został zastąpiony osobnym dokumentem
> `MASKOTKA-3D.md`. Tutaj zostaje tylko odsyłacz.

---

## 1. KONTEKST W JEDNYM AKAPICIE

Quolino to darmowy przewodnik, który zamienia zwiedzanie miast Europy w grę
terenową dla rodzin z dziećmi. **Jedna strona, dwa widoki.** Rodzic dostaje
plan dnia od parkingu po kolację — opisy, ceny, godziny, nawigacja. Dziecko
dostaje misje, zagadki i odznaki. Przełącznik w nagłówku.

**Problem, który rozwiązujemy:** dzieci nie chcą chodzić po miastach. Po
czterdziestu minutach mówią „nudzi mi się". Widok dziecka istnieje wyłącznie
po to, żeby to odwrócić — żeby to dziecko ciągnęło rodzica, nie odwrotnie.

**Kontekst użycia:** telefon, jedna ręka, w ruchu, często w słońcu, czasem
z dzieckiem ciągnącym za rękaw. Mobile-first bez wyjątków.

---

## 2. CO MA POWSTAĆ — PRIORYTETY

| # | Deliverable | Priorytet |
|---|-------------|-----------|
| 1 | Maskotka Quolino — 4 stany (patrz `MASKOTKA-3D.md`) | **P0** |
| 2 | Widok dziecka — ekran przystanku z misją | **P0** |
| 3 | Widok dziecka — ekran końcowy z punktami | **P0** |
| 4 | Widok rodzica — trzy warianty układu przystanków | P1 |
| 5 | Przełącznik widoku rodzic/dziecko | P1 |
| 6 | Pasek energii Quolina | P1 |
| 7 | Odznaki miast | P2 |
| 8 | Ikona aplikacji / favicon | P2 |

---

## 3. DESIGN SYSTEM — OBOWIĄZUJĄCY

Nie zmieniaj palety ani fontu. To jest ustalone i wdrożone.

### Kolory
| Token | Hex | Użycie |
|-------|-----|--------|
| `--parchment` | `#FFFCF5` | tło kart |
| `--ink` | `#383026` | tekst główny |
| `--ink2` | `#6E6154` | tekst wtórny |
| `--label` | `#8A7B68` | etykiety CAPS |
| `--line` | `#E7DBC6` | separatory |
| `--terra` | `#B4502E` | CTA, primary, akcent marki |
| `--olive` | `#5F6637` | chipy logistyczne, boks dzieci |
| `--sea` | `#23677A` | akcent, boks foto, focus |

Tło strony: `#FFFFFF` z trzema delikatnymi radial-gradientami (terra, olive,
sea) — efekt ciepłej mgły, nie gradientu tęczowego.

### Typografia
- **Figtree**, wagi 400–800
- Bazowy rozmiar **19 px**, absolutne minimum **18 px**
- Nazwa przystanku: 21 px / 600
- Etykiety: CAPS, letter-spacing, kolor `--label`
- Widok rodzica ma regulację A− / A / A+ → skala **17 / 19 / 22 px**.
  Layout musi znieść największy rozmiar bez łamania.

### Metryki
- Cele dotykowe: **min 44 × 44 px**, bez wyjątków
- Zaokrąglenia: 12 / 16 / 20 / 999
- Cienie: `sh1` (akordeon), `sh2` (karta), `sh-hover`
- Layout musi znosić **+30% dłuższy tekst** (niemiecki, grecki, norweski)

### Logo
`quolino` w wadze 800 + kropka w kolorze terra + `com` w wadze 600, ink2.

---

## 4. MASKOTKA

Pełna specyfikacja w osobnym dokumencie: **`MASKOTKA-3D.md`**.

W skrócie: Quolino to popielica, jedyny element 3D w całym serwisie, w czterech
stanach energii (śpiący → ciekawy → rozpędzony → uśmiech). Występuje wyłącznie
w widoku dziecka. Kanon zatwierdzony 19.08.2026.

---

## 5. WIDOK DZIECKA

### Ekran przystanku z misją
Elementy w kolejności ważności:

1. **Quolino** w aktualnym stanie energii — duży, u góry
2. **Pasek energii** — to nie progress bar, to poziom energii Quolina.
   Wypełnia się terra, tło line.
3. **Karta misji** — co znaleźć, policzyć, sfotografować. Duża ikona,
   krótkie zdanie, checkbox min 44 px.
4. **Mapa przystanków** — wizualna, kropki na ścieżce, nie lista tekstu
5. **Galeria zdjęć** — dowody wykonania misji

Dziecko **nie widzi**: cen, godzin, historii, telefonów, rozmówek, ocen,
treści partnerskich, BMC.

### Ekran końcowy
- Quolino w stanie **uśmiech**, duży, centralnie
- **Punkty: X / 10** — duża liczba, waga 800, terra
- Krótka gratulacja
- Odznaka miasta („Obudziłeś Quolina w Perugii")

**Zasada twarda:** dziecko, które wykonało wszystkie misje z planu rodzica,
zawsze dostaje **10/10 i uśmiech**, nawet jeśli rodzic wyłączył część
przystanków z trasy. Projekt ekranu nie może sugerować, że można dostać mniej
niż maksimum przez decyzję dorosłego.

### Ton wizualny
Ten sam design system, ale większe ikony misji, wyraźniejsze akcenty, więcej
oddechu. **To ten sam serwis, nie osobna aplikacja** — dziecko i rodzic mają
czuć, że są w tym samym miejscu.

---

## 6. WIDOK RODZICA

### Kontekst
Rodzic czyta **w ruchu, jedną ręką, na słońcu**, często stojąc przed
zabytkiem z dzieckiem ciągnącym za rękaw. Każde dodatkowe kliknięcie to koszt.

### Zawartość przystanku
Nagłówek widoczny **bez rozwijania**:
1. `{numer} · {czas zwiedzania}` w terra → nazwa 21 px / 600
2. Chipy: rok budowy (neutral) + cena (olive)
3. Akcje: **Nawiguj** (terra, pełny) / **Napisz** (outline) / **WWW** (outline)
4. Checkbox edytora trasy — „w planie / pomijamy"

Wnętrze: zdjęcie → opis 2–3 akapity → boks „Dla dzieci" (olive) →
boks „Zadanie foto" (sea) → album → „Zgłoś uwagę"

### Zadanie projektowe: trzy warianty układu
Obecnie jest akordeon i **mamy wątpliwość, czy to dobry wybór** — ukrywa
treść, której rodzic potrzebuje natychmiast.

Zaprojektuj trzy warianty do porównania:

**A. Lista rozwinięta** — wszystkie przystanki otwarte, sticky spis
przystanków u góry do szybkiego skoku

**B. Karty pełnoekranowe** — jeden przystanek = jeden ekran, swipe w bok
między przystankami, licznik „3 / 8"

**C. Akordeon inteligentny** — domyślnie otwarty ten przystanek, który jest
geograficznie najbliżej użytkownika

Dla każdego wariantu: widok mobilny 390 × 844, stan spoczynku i stan
interakcji.

### Czego NIE projektujemy
**Nigdy nie pokazujemy czasu dojazdu ani godziny dotarcia na przystanek.**
Nie znamy punktu startu rodziny, korków ani tempa z dzieckiem — podana
godzina byłaby błędna, a rodzic by na niej poległ.

Pokazujemy wyłącznie: czas zwiedzania samego obiektu, godziny otwarcia
i kolejność. Plan dnia to **sekwencja, nie rozkład jazdy**.

---

## 7. ZASADY TWARDE — CZEGO NIGDY

- Tekst poniżej 18 px
- Cele dotykowe poniżej 44 × 44 px
- Maskotka w widoku rodzica
- Reklamy, treści partnerskie, BMC lub oceny w widoku dziecka
- Pop-upy, overlaye, auto-play
- Ukrywanie akcji („Nawiguj") wewnątrz zwiniętego elementu
- Kolory spoza palety z §3
- Inne fonty niż Figtree
- Ikonki z zewnętrznych bibliotek o obcym stylu — spójność z maskotką jest
  ważniejsza niż wygoda
- Estetyka „aplikacji SaaS" — to ma wyglądać jak ciepły papierowy przewodnik,
  nie jak dashboard

---

## 8. INSPIRACJA I TON

Papierowy przewodnik z lat 60., gouache i kredka, ciepły pergamin, ilustracja
zamiast fotografii stockowej. Bliżej włoskiej książki dla dzieci niż aplikacji
mobilnej. Spokojnie, ciepło, bez krzyku — ale z jednym mocnym akcentem terra
tam, gdzie trzeba kliknąć.

Wyjątek: maskotka jest 3D i to kontrast zamierzony (patrz `MASKOTKA-3D.md` §1).

---

## 9. FORMAT ODDANIA

- Ekrany: **390 × 844** (mobile), opcjonalnie 1440 dla desktopu
- Maskotka: WebP z alfą + wersja ikonowa SVG (szczegóły w `MASKOTKA-3D.md` §8)
- Odznaki: SVG, kwadrat, czytelne od 64 px
