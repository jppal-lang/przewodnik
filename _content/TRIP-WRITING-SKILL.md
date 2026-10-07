# SKILL: WRITING-TRIP / QUESTINI-QUOLINO

## Cel
Twórz finalny TOUR/TRIP Questini/Quolino z zatwierdzonego researchu. Nie zastępuj researchu własnymi domysłami. Jeśli trzeba rozszerzyć lub zweryfikować dane, zrób to jako osobny etap i wyraźnie oddziel od materiału źródłowego.

## Proces nadrzędny
RESEARCH → REDAKCJA → ANALIZA → TRIP → WALIDACJA

### Twarda zasada questów
NIGDY nie twórz questu przed pełnym researchem.
Kolejność:
1. pełny research,
2. weryfikacja faktów,
3. analiza miejsca,
4. wybór konkretnego detalu/faktu/symbolu/dzieła/legendy,
5. quest,
6. wskazówka.

Quest ma wynikać z researchu, a nie research z questu.

## B — RODZIC: bez limitu długości
Nie istnieje limit 2–3 akapitów. Opis ma być tak długi, jak wymaga temat; dla dużego zabytku może mieć 5, 8, 10+ akapitów.

Uwzględniaj, gdy dotyczy:
- historię i datowanie,
- fundatorów, architektów i artystów,
- fazy budowy, przebudowy i restauracji,
- funkcję i znaczenie polityczne, religijne, społeczne, militarne i gospodarcze,
- architekturę i konkretne detale do oglądania,
- dzieła sztuki, symbole, inskrypcje i relikwie,
- osoby i wydarzenia,
- legendy i lokalne tradycje,
- niezwykłe historie,
- współczesne znaczenie,
- potwierdzone związki z kulturą popularną.

Nie skracaj wartościowego materiału tylko dlatego, że tekst jest długi.

## Zasada zagranicznego turysty
Każdy ważny element wyjaśnij od podstaw:
- święty: kim był, kiedy żył, dlaczego jest ważny i dlaczego lokalnie;
- bóstwo: kim było, w jakiej kulturze, za co odpowiadało i dlaczego ma związek z obiektem;
- artysta: kim był, dlaczego ważny i co stworzył;
- termin architektoniczny: co oznacza, jak go rozpoznać i gdzie go zobaczyć;
- symbol/herb/inskrypcja: co oznacza i dlaczego jest tutaj.

Nie zakładaj wiedzy lokalnej.

## Legendy
Jeśli istnieje legenda, opowiedz ją: bohaterowie, miejsce, przebieg, zakończenie i znaczenie lokalne. Wyraźnie oddziel FAKT HISTORYCZNY od LEGENDY/TRADYCJI. Nigdy nie przedstawiaj legendy jako faktu.

## Popkultura — obowiązkowy research
Jeżeli research potwierdza związek, wykorzystaj go. Szukaj:
- filmów i seriali,
- teledysków,
- piosenek wspominających miasto/miejsce,
- muzyków,
- artystów,
- pisarzy i książek,
- gier,
- fotografii, mody i reklam,
- znanych osób,
- niezwykłych wydarzeń.

Nie wystarczy nazwa filmu lub utworu. Wyjaśnij co, gdzie, kiedy, kto i dlaczego jest ciekawe dla zwiedzającego. Każdy taki fakt musi mieć źródło. Nie wymyślaj związków.

## Quest
Quest musi być wykonywany na miejscu i wynikać z researchu. Preferuj: znajdź, zauważ, wskaż, policz, porównaj, dopasuj, rozpoznaj, odtwórz, zinterpretuj, wykonaj zadanie zespołowe.

Nie twórz quizu encyklopedycznego. Quest ma być ciekawy dla 9-latka i nieinfantylny dla 15-latka. Parking i restauracja nie muszą mieć questu.

## D — WSKAZÓWKA
Ma pomagać rozwiązać quest, ale nie powtarzać go. Wskazuje gdzie patrzeć, czego szukać i jaki detal jest kluczowy.

## E — LOKALNY SMAK
Może zawierać legendę, zwyczaj, jedzenie, powiedzenie lub ciekawostkę. Nie twórz na siłę.

## Plan dnia
Plan zaczyna się na parkingu i kończy na ostatnim przystanku. Pokazuje tylko czas na miejscu. `time_label` = godzina dotarcia; `opening_hours` = godziny otwarcia. Nie mieszaj pól. Jeśli główna atrakcja ma konkretny slot, buduj trasę wokół niego. Nie zakładaj automatycznie startu o 10:00.

## Parking
Punkt 01 musi być parkingiem. Zachowaj nazwę, lokalizację, koszt, ZTL, godziny, Maps i dojście do centrum.

## Główny cel TRIP-a
Nie twórz listy atrakcji. Ustal logikę dnia: główny cel, punkty obowiązkowe, opcjonalne, przerwy, gastronomię i finał.

## Gastronomia
Lodziarnia/cukiernia może być nieponumerowaną przerwą. Restauracja jest finałem, nie zabytkiem. Dane operacyjne muszą być zweryfikowane.

## Struktura HTML
Każdy główny punkt:
A — DANE
B — 👨 RODZIC — OPIS
C — 🧒 DZIECKO — QUEST
D — 💡 WSKAZÓWKA
E — 🗝️ LOKALNY SMAK
F — 🔎 ŹRÓDŁA
G — 💬 UWAGA OGÓLNA

## Dane maszynowe
Nie mieszaj:
- `parking_cost` ≠ `price`
- `opening_hours` ≠ `time_label`
- `rating` ≠ kryterium redakcyjne
- `stop_key` ≠ `stop_number`

`stop_key` jest stabilną tożsamością punktu; `stop_number` jest tylko aktualną pozycją.

## JSON
Pole A rozbijaj na:
`year_built`, `location`, `parking_cost`, `price`, `opening_hours`, `time_label`, `visit_duration`, `dress_code`, `rating`, `reviews_count`, `sunset_spot`, `optional`, `maps_query`.

Nie przenoś emoji do JSON jako części wartości.

## Wieloakapitowość
`desc_paragraphs` musi zawierać wszystkie akapity. Nie bierz tylko pierwszego. HTML i JSON muszą być zgodne treściowo.

## Notatki redakcyjne
Niepotwierdzone informacje i odrzucone warianty trafiają do `_notes`, niewidocznych publicznie i nietłumaczonych:
`{"stop_key":"…","field":"a","note":"…"}`.
`field`: a dane, b opis, c quest, d wskazówka, e lokalny smak, f źródła, g uwaga.

## Brak danych
Nie wymyślaj. Używaj `null`, `unverified` lub notatki redakcyjnej.

## Nazwy własne
Nazwy zabytków, restauracji, ulic i placów zachowuj w oryginale.

## Tłumaczenia
Dopiero po zatwierdzeniu polskiego. Zachowaj te same `stop_key`, kolejność, liczbę akapitów i `null`. Nie tłumacz `_notes` ani nazw własnych, cen, godzin, dat, liczb, telefonów, linków i kodów.

## Walidacja
Przed oddaniem sprawdź:
- 01 = parking,
- unikalne `stop_key`,
- prawidłowa kolejność `stop_number`,
- czas planu = czas na miejscu,
- rozdzielenie godzin otwarcia i czasu dotarcia,
- rozdzielenie parkingu i ceny,
- zgodność HTML/JSON,
- zachowanie wszystkich akapitów,
- bogaty opis rodzica,
- wyjaśnienie postaci, świętych, bóstw i architektury,
- opowiedziane i oznaczone legendy,
- wykorzystane potwierdzone związki popkulturowe,
- questy wynikające z researchu,
- realne zadania na miejscu,
- pomocne wskazówki,
- brak konfabulacji,
- poprawne Maps,
- status `draft`, jeśli dokument nie jest zatwierdzony.

Jeżeli dostępny jest `validate.py`, uruchom go.

## Wersjonowanie HTML
Nazwa:
`PAŃSTWO-MIEJSCOWOŚĆ-vXX.html`

Przykład:
`IT-Orvieto-v03.html`

Nagłówek HTML musi mieć tę samą wersję co nazwa pliku.

## Sidebar
HTML ma zawierać latający/fixed DIV po lewej z klikalnym spisem treści i kotwicami prowadzącymi do rzeczywistych punktów.

## Zasada końcowa
Nie twórz TOUR-u z listy atrakcji. Stwórz opowieść o miejscu, którą można przeżyć pieszo.

Najpierw poznaj miejsce.
Potem napisz o nim.
Dopiero z tego, co naprawdę znaleziono, zbuduj quest.
Nie odwrotnie.
