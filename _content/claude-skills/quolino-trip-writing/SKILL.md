---
name: quolino-trip-writing
description: Zasady pisania i sprawdzania wycieczek (TOUR/TRIP) Questini/Quolino. Używaj ZAWSZE, gdy piszesz, poprawiasz albo oceniasz opis wycieczki, przystanku, questu, wskazówki lub plan dnia Quolino — także gdy dostajesz gotowy opis (pliki *.meta.json / *.pl.json, HTML wycieczki) do sprawdzenia.
---

# Wycieczki Quolino — pisanie i sprawdzanie

Źródło zasad: `_content/TRIP-WRITING-SKILL.md` (JP, 2026-10-07). Ta umiejętność ma dwa tryby:

- **Tryb A — PISANIE**: tworzysz lub poprawiasz wycieczkę → zasady z części „Zasady JP” + format z części „Format plików”.
- **Tryb B — SPRAWDZANIE**: dostajesz gotowy opis → procedura z części „Sprawdzanie”. Zawsze, gdy
  opis przychodzi od autora (ChatGPT, redaktor, import), najpierw go sprawdzasz, potem cokolwiek dalej.

Zasady JP mają pierwszeństwo przed starszymi dokumentami (`IMPORT.md`, `CHATGPT-PROJEKT.md`,
`REDAKCJA.md`). W szczególności **nie ma limitu 2–4 akapitów** opisu rodzica.

Twarde zasady projektu (zawsze): zero kilometrów i czasów dojazdu, zero godzin wyjazdu/powrotu
z bazy, punkt 01 = parking, nie wymyślać faktów (brak źródła → `null` / `unverified` / notatka),
Marche ≠ Umbria ≠ Emilia-Romania (regiony osobno), widok dziecka bez komercji.

---

## Zasady JP

### Proces nadrzędny
RESEARCH → REDAKCJA → ANALIZA → TRIP → WALIDACJA. Nie zastępuj researchu domysłami. Rozszerzenie
lub weryfikacja danych to osobny etap, wyraźnie oddzielony od materiału źródłowego.

### Questy — kolejność obowiązkowa
1. pełny research, 2. weryfikacja faktów, 3. analiza miejsca, 4. wybór konkretnego
detalu/faktu/symbolu/dzieła/legendy, 5. quest, 6. wskazówka.
**Quest wynika z researchu, nie research z questu. Nigdy questu przed pełnym researchem.**

### B — RODZIC: bez limitu długości
Opis tak długi, jak wymaga temat (duży zabytek: 5, 8, 10+ akapitów). Uwzględniaj, gdy dotyczy:
historię i datowanie; fundatorów, architektów, artystów; fazy budowy, przebudowy, restauracji;
funkcję i znaczenie (polityczne, religijne, społeczne, militarne, gospodarcze); architekturę
i konkretne detale do oglądania; dzieła sztuki, symbole, inskrypcje, relikwie; osoby i wydarzenia;
legendy i tradycje; niezwykłe historie; współczesne znaczenie; potwierdzone związki z popkulturą.
Nie skracaj wartościowego materiału tylko dlatego, że tekst jest długi.

### Zasada zagranicznego turysty
Wyjaśniaj od podstaw: **święty** (kim był, kiedy żył, dlaczego ważny, dlaczego tutaj),
**bóstwo** (kultura, za co odpowiadało, związek z obiektem), **artysta** (kim był, co stworzył),
**termin architektoniczny** (co znaczy, jak rozpoznać, gdzie zobaczyć), **symbol/herb/inskrypcja**
(co znaczy, dlaczego tutaj). Nie zakładaj wiedzy lokalnej.

### Legendy
Opowiedz w całości: bohaterowie, miejsce, przebieg, zakończenie, znaczenie lokalne.
Zawsze oddziel **FAKT HISTORYCZNY** od **LEGENDY/TRADYCJI**. Legenda nigdy jako fakt.

### Popkultura — obowiązkowy research
Szukaj: filmy, seriale, teledyski, piosenki o mieście/miejscu, muzycy, artyści, pisarze i książki,
gry, fotografia, moda, reklamy, znane osoby, niezwykłe wydarzenia. Nie wystarczy tytuł —
wyjaśnij co, gdzie, kiedy, kto i dlaczego ciekawe dla zwiedzającego. **Każdy fakt ze źródłem.
Nie wymyślaj związków.**

### C — DZIECKO: quest
Wykonywany na miejscu, wynika z researchu. Preferuj: znajdź, zauważ, wskaż, policz, porównaj,
dopasuj, rozpoznaj, odtwórz, zinterpretuj, zadanie zespołowe. Nie quiz encyklopedyczny.
Ciekawy dla 9-latka, nieinfantylny dla 15-latka. Parking i restauracja nie muszą mieć questu.

### D — WSKAZÓWKA
Pomaga rozwiązać quest, nie powtarza go: gdzie patrzeć, czego szukać, który detal jest kluczowy.

### E — LOKALNY SMAK
Legenda, zwyczaj, jedzenie, powiedzenie lub ciekawostka. Nie na siłę.

### Plan dnia
Zaczyna się na parkingu, kończy na ostatnim przystanku. Tylko czas na miejscu.
`time_label` = godzina dotarcia; `opening_hours` = godziny otwarcia — nie mieszaj.
Główna atrakcja z konkretnym slotem → trasa budowana wokół niego. Nie zakładaj startu o 10:00.

### Parking
Punkt 01 = parking: nazwa, lokalizacja, koszt (`parking_cost`), ZTL, godziny, Maps, dojście do centrum.

### Logika dnia, nie lista atrakcji
Główny cel, punkty obowiązkowe, opcjonalne, przerwy, gastronomia, finał.
Lodziarnia/cukiernia może być nieponumerowaną przerwą. Restauracja = finał, nie zabytek.
Dane operacyjne lokali zweryfikowane.

### Struktura każdego głównego punktu (HTML)
A — DANE · B — 👨 RODZIC — OPIS · C — 🧒 DZIECKO — QUEST · D — 💡 WSKAZÓWKA ·
E — 🗝️ LOKALNY SMAK · F — 🔎 ŹRÓDŁA · G — 💬 UWAGA OGÓLNA

### Dane maszynowe — nie mieszaj
`parking_cost` ≠ `price` · `opening_hours` ≠ `time_label` · `rating` ≠ kryterium redakcyjne ·
`stop_key` (stała tożsamość) ≠ `stop_number` (bieżąca pozycja).
Pole A w JSON: `year_built`, `location`, `parking_cost`, `price`, `opening_hours`, `time_label`,
`visit_duration`, `dress_code`, `rating`, `reviews_count`, `sunset_spot`, `optional`, `maps_query`.
**Bez emoji w wartościach JSON.**

### Wieloakapitowość
`desc_paragraphs` zawiera **wszystkie** akapity. HTML i JSON zgodne treściowo.

### Notatki redakcyjne
Niepotwierdzone informacje i odrzucone warianty → `_notes` (niepubliczne, nietłumaczone):
`{"stop_key":"…","field":"a","note":"…"}`, `field` ∈ a dane, b opis, c quest, d wskazówka,
e lokalny smak, f źródła, g uwaga.

### Brak danych / nazwy własne
Nie wymyślaj: `null`, `unverified` albo notatka. Nazwy zabytków, restauracji, ulic, placów w oryginale.

### Tłumaczenia
Dopiero po zatwierdzeniu wersji polskiej — umiejętność `quolino-trip-translate`.

### Wersjonowanie HTML
Plik `PAŃSTWO-MIEJSCOWOŚĆ-vXX.html` (np. `IT-Orvieto-v03.html`); nagłówek HTML z tą samą wersją.
HTML ma stały (fixed) DIV po lewej z klikalnym spisem treści i kotwicami do punktów.
Status `draft`, dopóki JP nie zatwierdzi.

### Zasada końcowa
Nie twórz TOUR-u z listy atrakcji. Stwórz opowieść o miejscu, którą można przeżyć pieszo.
Najpierw poznaj miejsce. Potem napisz o nim. Dopiero z tego, co naprawdę znaleziono, zbuduj quest.

---

## Format plików (Tryb A)

Kontrakt wymiany: `_content/IMPORT.md`. Nowe miasto = katalog `_content/cities/<region>/<slug>/`:

- `<slug>.meta.json` — dane maszynowe: `city{…}`, `stops[]` (kolejność = kolejność trasy, bez
  `sort_order`), `emergency[]`, opcjonalnie `route{url,source,verified_at}`.
- `<slug>.pl.json` — proza: `lang:"pl"`, `city{title, region_label, subtitle, lead, good_to_know,
  hero_note, local_food}`, `stops{<stop_key>:{name, desc_paragraphs[], kids_box, hint, local_flavor,
  practical_note, dress_code, photo_task}}`, `day_plan`, `emergency`, `_notes[]`.

Każdy klucz obecny (nieużywany = `null`). `stop_key`: małe litery, cyfry, myślniki; nadany raz,
nigdy nie zmieniany. Slug miasta bez polskich znaków według nazwy polskiej (`Asyż → asyz`).
Kategorie wyłącznie z listy w `IMPORT.md §2a`.

---

## Sprawdzanie (Tryb B)

1. **Walidator mechaniczny** — uruchom i przepisz wszystkie błędy do raportu:
   ```bash
   python3 ~/.claude/skills/quolino-trip-writing/scripts/validate_trip.py <katalog miasta>
   ```
   Kod wyjścia 1 = błędy formatu. Walidator sprawdza m.in. parking 01, unikalne `stop_key`,
   kolejność `stop_number`, komplet kluczy, emoji w JSON, `time_label` jako godzinę, rozdzielenie
   parkingu i ceny, strukturę `_notes`, kilometry i czasy dojazdu, quest/wskazówkę przy zabytkach.
2. **Ocena merytoryczna** — przejdź przez listę i przy każdym punkcie zapisz, co nie spełnia zasad:
   - bogaty opis rodzica (nie skrócony; historia, ludzie, detale do oglądania),
   - wyjaśnieni święci, bóstwa, artyści, terminy architektoniczne, symbole (zasada turysty),
   - legendy opowiedziane i oznaczone jako legenda, nie fakt,
   - popkultura wykorzystana, gdy potwierdzona — i tylko ze źródłem,
   - quest wynika z konkretnego detalu z researchu, jest wykonalny na miejscu, nie jest quizem,
   - wskazówka pomaga, nie powtarza questu,
   - plan dnia = tylko czas na miejscu, od parkingu do ostatniego punktu,
   - brak konfabulacji: fakty, ceny, godziny, telefony mają źródło albo są `null`/`unverified`;
     sprawdź w sieci fakty, które budzą wątpliwość, i podaj, co znalazłeś,
   - poprawne `maps_query` (nazwa + miasto, kraj), lat/lon w mieście,
   - zgodność HTML ↔ JSON (liczba akapitów, komplet punktów, kolejność), gdy jest HTML.
3. **Werdykt** — odpowiedz WYŁĄCZNIE JSON-em:
   ```json
   {"verdict": "ok" | "fix",
    "summary": "2–3 zdania po polsku",
    "errors":   [{"stop_key": "…|null", "field": "a|b|c|d|e|f|g|meta|plan", "problem": "…", "fix": "co dokładnie poprawić"}],
    "warnings": [{"stop_key": "…|null", "field": "…", "problem": "…"}],
    "validator_exit": 0}
   ```
   `ok` tylko przy zerowej liczbie błędów walidatora i błędów merytorycznych. Uwagi (`warnings`)
   nie blokują. Każdy błąd ma konkretną instrukcję poprawki — autor ma ją wykonać bez zgadywania.
