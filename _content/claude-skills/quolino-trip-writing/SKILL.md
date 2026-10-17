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
Marche ≠ Umbria ≠ Emilia-Romagna (regiony osobno), widok dziecka bez komercji.
**Treść uniwersalna** (decyzja JP, 2026-10-12): wycieczki są tłumaczone na 17 języków, więc nigdy nie odwołujemy się do
narodowości czytelnika ani innych nacji („dla Polaków…, dla Włochów…”, „Niemcy…”) i nie zakładamy, skąd czytelnik przyjechał
(„w Polsce”, „spod naszego domu”). Każde zdanie ma być prawdziwe dla rodziny z dowolnego kraju.
**Bez porównań do innych krajów i nacji** (JP, 2026-10-12): zamiast „holenderski klimat”, „jak w Wenecji”, „włoska Szwajcaria”,
„jeżdżą rowerami jak Holendrzy” opisujemy miejsce samo w sobie („rowery są tu wszędzie — rodzice jeżdżą nimi do pracy, dzieci do szkoły”).
**Każda wycieczka stoi sama**: bez odwołań do serii, listy ani innych tras („nasze miasto”, „z całej listy”, „na tym wyjeździe”, „kolejny punkt naszej trasy”).

---

## Zasady JP

### Proces nadrzędny
RESEARCH → REDAKCJA → ANALIZA → TRIP → WALIDACJA. Nie zastępuj researchu domysłami. Rozszerzenie
lub weryfikacja danych to osobny etap, wyraźnie oddzielony od materiału źródłowego.

### Questy — kolejność obowiązkowa
1. pełny research, 2. weryfikacja faktów, 3. analiza miejsca, 4. wybór konkretnego
detalu/faktu/symbolu/dzieła/legendy, 5. quest, 6. wskazówka.
**Quest wynika z researchu, nie research z questu. Nigdy questu przed pełnym researchem.**

### B — RODZIC: minimum głębokości (JP, 2026-10-13)
Quolino jest dla całej rodziny: **rodzic ma się dowiedzieć czegoś, czego nie wiedział.** Opis nie ma górnego limitu
długości, ale ma **dolną granicę**. To minimum, nie cel — poniżej niego walidator zgłasza **błąd**, nie uwagę:

- zabytek, kościół, muzeum, zamek, synagoga, dom: **4 akapity i 300 słów** (zwykle 5–8 akapitów);
- ulica, punkt widokowy, miejsce na zdjęcie, park: **2 akapity i 120 słów**;
- parking i lokale (restauracja, lody, słodycze): 1 akapit.

**Akapit to akapit** (JP, 2026-10-13): przy zabytku każdy akapit ma **min. 40 słów i 2+ zdania**. Cięcie tekstu na jednozdaniowe
„akapity”, żeby zaliczyć próg liczby akapitów, to błąd walidatora. Opis zabytku powstaje **osobno dla każdego przystanku**
(jedno wywołanie na zabytek, z jego sekcją `research.md`), a nie razem z całą wycieczką w jednej odpowiedzi. Research ma być
**materiałem do opowieści, nie listą punktów**: przy dużym zabytku narracja ok. 500–800 słów (kto, po co, co się wydarzyło,
„kim był…”, pełna legenda z przebiegiem i zakończeniem, detale do oglądania z miejscem).

**Szkielet opisu zabytku** (każdy element = osobny akapit lub jego część; kolejność można dostosować do tematu):
1. **hak** — dlaczego warto tu stanąć;
2. **historia i ludzie** — fundatorzy, architekci, artyści, fazy budowy, znaczenie;
3. **„Kim był/była…”** — bohater miejsca wyjaśniony od podstaw (święty, władca, artysta);
4. **co oglądać** — konkretne detale z dokładnym miejscem („nad drzwiami po lewej”, „w drugiej kaplicy”);
5. **legenda** — wyraźnie oznaczona jako legenda (zob. „Legendy”);
6. **ciekawostka, popkultura albo znaczenie dziś** — tylko potwierdzone źródłem.

**Każdy akapit wnosi nową treść.** Bez zdań-wypełniaczy („zachwyca”, „warto zobaczyć”, „bogata historia”, „tętni życiem”):
zamiast przymiotnika podaj fakt (kto, kiedy, ile, gdzie). Wypełniacze zgłasza walidator jako uwagę.
Uwzględniaj też, gdy dotyczy: fazy budowy i restauracji, funkcję (polityczną, religijną, społeczną, militarną,
gospodarczą), dzieła sztuki, symbole, inskrypcje, relikwie, współczesne znaczenie, potwierdzone związki z popkulturą.
Rozbudowa opisu bierze fakty **wyłącznie z researchu** (`research.md`) — niczego nie zmyślamy; brakujący materiał
= notatka w `_notes`, nie wymyślony akapit.

### Zasada zagranicznego turysty
Wyjaśniaj od podstaw: **święty** (kim był, kiedy żył, dlaczego ważny, dlaczego tutaj),
**bóstwo** (kultura, za co odpowiadało, związek z obiektem), **artysta** (kim był, co stworzył),
**termin architektoniczny** (co znaczy, jak rozpoznać, gdzie zobaczyć), **symbol/herb/inskrypcja**
(co znaczy, dlaczego tutaj). Nie zakładaj wiedzy lokalnej.

### Legendy
**Research (obowiązkowo):** przy każdym zabytku (monument, church, museum, castle, house, synagogue) w researchu stoi
linijka **„Legendy: …”** ze źródłem (URL) albo **„Legendy: brak — sprawdzono: …”** (gdzie szukano: Wikipedia w języku kraju,
strona gminy/diecezji/muzeum, lokalne przewodniki). Bez tej linijki research jest niekompletny.

**Opis:** legenda znaleziona w researchu **musi trafić do opisu**. Opowiedz ją w całości (bohaterowie, miejsce, przebieg,
zakończenie, znaczenie lokalne). Akapit zaczyna się od **„Legenda mówi…”** albo **„Według tradycji…”**, a kończy tym, co
wiadomo historycznie (FAKT oddzielony od LEGENDY). Legenda nigdy nie jest podana jako fakt.

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
**Nigdy nie podaje odpowiedzi** — ani wskazówka, ani quest (żadnych „(odpowiedź: …)”, „rozwiązanie to…”). Dziecko ma ją znaleźć na miejscu.

### E — LOKALNY SMAK
Legenda, zwyczaj, jedzenie, powiedzenie lub ciekawostka. Nie na siłę.

### Plan dnia
Zaczyna się na parkingu, kończy na ostatnim przystanku. Tylko czas na miejscu.
`time_label` = godzina dotarcia; `opening_hours` = godziny otwarcia — nie mieszaj.
`time_label` to **wyłącznie godzina** `HH:MM` (np. `16:40`) — bez słów, nawiasów, „ok.”, „~”, „orientacyjnie”,
„po kolacji”, „w trakcie spaceru”. To pole nie jest tłumaczone i widać je w każdym języku. Nie znasz godziny →
policz ją z planu (poprzedni przystanek + czas zwiedzania + przejście) albo zostaw `null`. Komentarz o kolejności,
opcjonalności czy dniu tygodnia idzie do `practical_note` (lub `optional: true`), nie do godziny.
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

### Lekcje z poprawek JP (Rimini, Rawenna, Asyż, Ancona, Perugia — 12–17.10.2026)
Każdy z tych błędów JP już raz poprawiał. Pełna analiza: `docs/WNIOSKI-Z-POPRAWEK.md`. Walidator łapie oznaczone ⚙️.
1. ⚙️ **Quest i wskazówka nie zdradzają odpowiedzi** (Rawenna: Neon, Galla Placydia, Domus — odpowiedź w nawiasie).
2. ⚙️ **Superlatyw tylko ze źródłem** — „najstarszy”, „jedyny w Europie”, „pierwszy na świecie” musi stać w researchu z linkiem;
   bez źródła piszemy konkretny fakt bez superlatywu (Rawenna: „najstarsze przedstawienie Trzech Mędrców” — fałsz).
3. ⚙️ **Ten sam fakt raz, bez sprzeczności** — zdanie nie wraca w kolejnym akapicie, a dwa akapity nie mówią różnych rzeczy
   o tym samym (Rawenna, San Vitale: męczeństwo Witalisa dwa razy i w dwóch wersjach).
4. ⚙️ **`maps_query` w języku kraju**: oryginalna nazwa + miasto + kraj („Mausoleo di Galla Placidia, Ravenna, Italia”), nie angielska.
   Parking: nazwa parkingu, nie adres ulicy — od niego Mapy liczą trasę (Rawenna: trasa startowała z „Via Mura di San Vitale 9”).
5. ⚙️ **Linki źródeł działają**: Wikipedia w danym języku z tytułem w tym języku (Rawenna: it.wikipedia…/Mausoleum_of_… — nie istnieje).
6. ⚙️ **Bez powtórzeń w akapicie** — to samo słowo trzeci raz to wypełniacz (Rawenna, parking: „płaska” ×3).
7. ⚙️ **Nazwa przystanku = nazwa miejsca** (lokalu, zabytku), nie posiłek ani pora („Kolacja przy Corso Vannucci”, „Kolacja — Finał Dnia”).
8. **Bez konfabulacji lokali** — piekarnia, lodziarnia, danie „u kogoś” tylko z nazwą i źródłem; inaczej nie piszemy (Rawenna: „piekarnia
   z chlebem z orzechów laskowych” bez nazwy).
9. **Postacie i pojęcia wyjaśnione** przy pierwszym użyciu: kim był, kiedy, dlaczego tutaj (Rawenna: Justynian, Teodora, Teodoryk,
   św. Apolinary, Pan, etimasia bez wyjaśnienia).
10. ⚙️ **Treść uniwersalna** — bez narodowości czytelnika, porównań do innych krajów i „naszego miasta/naszej trasy” (Rimini, Asyż,
   Ancona, Rawenna). Fakt historyczny o narodzie podany neutralnie jako zdarzenie jest dozwolony („II Korpus wyzwolił miasto w 1944”).
11. **Tekst nie obiecuje tego, czego plan nie daje** — „kolacja przy zachodzie słońca”, „omijamy upał” tylko gdy godziny w planie dnia
   to potwierdzają (strona główna obiecywała to, czego 5 z 8 wycieczek nie miało).
12. **Literówki** — kontrola czyta każde pole jak korektor; literówka to błąd, nie uwaga.

## Sprawdzanie (Tryb B)

1. **Walidator mechaniczny** — uruchom i przepisz wszystkie błędy do raportu:
   ```bash
   python3 ~/.claude/skills/quolino-trip-writing/scripts/validate_trip.py <katalog miasta>
   ```
   Kod wyjścia 1 = błędy formatu. Walidator sprawdza m.in. minimum głębokości opisu (akapity i słowa wg kategorii — poniżej = błąd), wypełniacze (uwaga), parking 01, unikalne `stop_key`,
   kolejność `stop_number`, komplet kluczy, emoji w JSON, `time_label` jako godzinę, rozdzielenie
   parkingu i ceny, strukturę `_notes`, kilometry i czasy dojazdu, quest/wskazówkę przy zabytkach.
2. **Ocena merytoryczna** — przejdź przez listę i przy każdym punkcie zapisz, co nie spełnia zasad:
   - opis rodzica spełnia minimum głębokości (4 akapity i 300 słów dla zabytku; 2 akapity i 120 słów dla ulicy,
     punktu widokowego, zdjęcia), ma elementy szkieletu (hak, historia i ludzie, „Kim był…”, co oglądać z miejscem,
     legenda, ciekawostka/popkultura/znaczenie dziś), a każdy akapit wnosi nową treść,
   - **research.md** (gdy jest dołączony): czy opis wykorzystał jego materiał — ludzi, detale do oglądania, popkulturę
     i **legendy**. Zgłoś jako **BŁĄD**: legendę z researchu pominiętą w opisie, legendę podaną jako fakt, legendę bez
     oznaczenia „Legenda mówi…”/„Według tradycji…”. Brak linijki „Legendy:” przy zabytku w researchu = uwaga.
     Rozbudowa opisu może brać fakty wyłącznie z researchu; fakt spoza researchu bez źródła = błąd,
   - wyjaśnieni święci, bóstwa, artyści, terminy architektoniczne, symbole (zasada turysty),
   - legendy opowiedziane i oznaczone jako legenda, nie fakt,
   - popkultura wykorzystana, gdy potwierdzona — i tylko ze źródłem,
   - quest wynika z konkretnego detalu z researchu, jest wykonalny na miejscu, nie jest quizem,
   - wskazówka pomaga, nie powtarza questu,
   - plan dnia = tylko czas na miejscu, od parkingu do ostatniego punktu,
   - **BŁĄD KRYTYCZNY: czas dojazdu** („dziesięć minut autem”, „kwadrans jazdy”) w jakimkolwiek polu — zawsze `verdict: fix`,
   - **BŁĄD: porównanie do innego kraju lub nacji** albo odwołanie do narodowości czytelnika („holenderski klimat”, „jak w Wenecji”,
     „włoska Szwajcaria”, „jak Holendrzy”) oraz odwołanie do serii/innych tras („nasze miasto”, „z całej listy”) — zgłoś jako błąd z poprawką,
   - brak konfabulacji: fakty, ceny, godziny, telefony mają źródło albo są `null`/`unverified`;
     sprawdź w sieci fakty, które budzą wątpliwość, i podaj, co znalazłeś,
   - poprawne `maps_query` (oryginalna nazwa w języku kraju + miasto, kraj; parking = nazwa parkingu), lat/lon w mieście,
   - **lekcje z poprawek JP** (sekcja wyżej, punkty 1–12): każdy złamany punkt = **BŁĄD** z poprawką. Superlatywy i fakty
     „sporne” sprawdź w sieci; quest/wskazówka zdradzające odpowiedź, powtórzone lub sprzeczne zdania, lokal bez nazwy i źródła,
     niewyjaśniona postać, obietnica bez pokrycia w planie dnia, literówki,
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
