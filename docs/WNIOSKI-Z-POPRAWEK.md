# WNIOSKI-Z-POPRAWEK.md — analiza błędów poprawianych przez JP i zabezpieczenia

Polecenie JP (17.10.2026): przeanalizować poprawki i wyciągnąć wnioski, żeby te same błędy nie wracały.
Źródła: wątki Discord (Rimini, Rawenna, Asyż, Ancona), raport kontroli szkicu Rawenny v3 (12.10), poprawki z 17.10
(strona główna, Perugia, panel admina, serwer). Każdy wiersz ma **zabezpieczenie**, które działa bez pamięci JP.

Legenda zabezpieczeń: **W** — walidator (`quolino-trip-writing/scripts/validate_trip.py`, błąd blokuje szkic),
**S** — zasada w umiejętności pisania (`SKILL.md`, sekcja „Lekcje z poprawek JP”), **K** — punkt obowiązkowy kontroli Claude,
**P** — proces / serwer.

## 1. Treść wycieczek

| # | Błąd (gdzie) | Przyczyna | Zabezpieczenie |
|---|---|---|---|
| 1 | Odwołania do narodowości czytelnika: „dla Polaków kurort”, „jechaliście w Polsce” (Rimini 1, 8, zajawka) | autor pisał dla Polaka, a treść idzie na 17 języków | W (wzorce), S10, K — od 12.10 |
| 2 | Porównania do innych krajów („jak Holendrzy”, „włoska Szwajcaria”) | skrót myślowy zamiast opisu miejsca | W, S10, K — od 12.10 |
| 3 | „Nasze miasto”, „kolejny punkt naszej trasy” (Rawenna 1, Asyż 2/5/8) | autor zakłada serię wycieczek | S10, K |
| 4 | Ancona: „polski rozdział”, „bliska polskiemu sercu” | jw.; fakt o II Korpusie jest dobry, zły jest sposób podania | S10 (fakt neutralnie), reguła #2 w bazie wiedzy |
| 5 | Quest i wskazówka zdradzają odpowiedź (Rawenna: Neon, Galla Placydia; Domus — odpowiedź w nawiasie) | brak zasady „nie podawaj odpowiedzi” | **W (nowe)**, S1, K |
| 6 | Fałszywy superlatyw „najstarsze przedstawienie Trzech Mędrców” (Rawenna) | superlatyw bez źródła | **W (uwaga, nowe)**, S2, K (sprawdzenie w sieci) |
| 7 | Błąd rzeczowy: Jordan jako postać tylko w jednym baptysterium (Rawenna) | brak weryfikacji detalu ikonografii | K (fakty z Wikipedią kraju) |
| 8 | To samo zdanie dwa razy i sprzeczność w jednym opisie (Rawenna, San Vitale) | sklejanie akapitów z kilku przebiegów GPT | **W (nowe)**, S3 |
| 9 | Postacie bez wyjaśnienia: Justynian, Teodora, Teodoryk, św. Apolinary, Pan, etimasia (Rawenna) | zasada była, kontrola jej nie egzekwowała | S9, K = błąd |
| 10 | Konfabulacja: „piekarnia z chlebem z orzechów laskowych” bez nazwy (Rawenna) | model dopisał „lokalny koloryt” | S8, K = błąd |
| 11 | `maps_query` po angielsku (Rawenna: Mausoleum of…, Baptistery of Neon) | GPT pisał nazwy po angielsku | **W (nowe)**, S4 |
| 12 | Trasa w Mapach startuje z adresu ulicy, nie z parkingu (Rawenna) | `maps_query` parkingu = adres; trasa liczona ze współrzędnych | **W (uwaga, nowe)**, S4, P: trasa budowana z nazw (panel i strona, 17.10) |
| 13 | Zepsute linki: it.wikipedia z angielskim tytułem (Rawenna) | link „zgadnięty”, nie skopiowany | **W (nowe)**, S5; P: miesięczny `links-check` |
| 14 | „Płaska” ×3 w jednym akapicie (Rawenna, parking) | wypełniacz | **W (uwaga, nowe)**, S6 |
| 15 | Brak zadania foto na parkingu (Rawenna) | — | W (było) |
| 16 | Nazwa przystanku „Kolacja przy Corso Vannucci”, „Kolacja — Finał Dnia” (Perugia, Spello) | nazwa opisuje porę, nie miejsce; po przesunięciu godzin kłamie | **W (uwaga, nowe)**, S7 |
| 17 | Literówki (Rawenna) | kontrola traktowała je jako uwagi | S12, K = błąd |

## 2. Obietnice i produkt

| # | Błąd | Przyczyna | Zabezpieczenie |
|---|---|---|---|
| 18 | Strona główna obiecywała start po południu i kolację przy zachodzie, a 5 z 8 wycieczek startuje rano i kończy bez kolacji | tekst marketingowy pisany przed treścią, nikt go nie porównał z danymi | Tekst zmieniony na „Rodzic decyduje” (9d807b2). S11. Zasada: każde zdanie o „wszystkich wycieczkach” na stronie sprawdzamy na danych z bazy przed publikacją |
| 19 | Etykieta kategorii restauracji = „kolacja” (także dla obiadu o 13:00) | jw. | do zmiany na „jedzenie/restauracja” (decyzja JP) |
| 20 | Plakietka „Popołudnie” przy wycieczkach półdniowych startujących rano | jw. | „Pół dnia” (9d807b2) |

## 3. Proces i serwer

| # | Błąd | Przyczyna | Zabezpieczenie |
|---|---|---|---|
| 21 | Przystanki po polsku na stronach w innych językach (Perugia HU); tylko Spello ma 17 języków | zadania cykliczne roota (w tym kolejka tłumaczeń) nigdy nie zostały zainstalowane | `ops/cron-sync.sh` (2407a51); 6 miast w kolejce. Do dodania: alarm, gdy opublikowane miasto nie ma kompletu języków po 72 h |
| 22 | Uwagi JP do Rawenny utknęły w przeglądarce, przycisk „Wyślij” nie działał | SQL panelu padał przy approve (kolizja z istniejącą tabelą), nikt nie zobaczył alarmu | SQL v2 + obsługa próśb (575f21f). Zasada: po każdym approve sprawdzamy, że funkcje z nowego SQL istnieją |
| 23 | Plik Umami nie trafił na serwer; skrypt padł na bibliotece hasła; panel chwilę z domyślnym hasłem | brak testu na prawdziwym obrazie przed podaniem komend JP | install.sh kopiuje `*.yml`; hasło hashuje baza; skrypt zatrzymuje panel przy błędzie. Zasada: nowy kontener startuje zablokowany, dopóki hasło/bramka nie są ustawione |

## 4. Mechanizm na przyszłość (żeby wnioski powstawały same)

1. **Każda uwaga JP z panelu** → jedna nowa wersja szkicu → `trip-revise` zapisuje zasadę ogólną do bazy wiedzy redakcji
   (`editorial_rules`); JP widzi ją w panelu („Baza wiedzy redakcji”) i może wyłączyć albo poprawić.
2. **Po każdej rundzie poprawek miasta** Hermes pisze na #admin krótkie „Wnioski”: jakie kategorie błędów, które są już
   łapane (W/S/K), a które nie — i proponuje zmianę walidatora lub umiejętności (instrukcja Hermesa, `trips-section.md`).
3. **Raz w tygodniu** (piątek) w podsumowaniu: 3 najczęściej łamane reguły i liczba uwag JP na szkic — cel: spada z miesiąca na miesiąc.
4. Ten plik aktualizujemy przy każdej nowej kategorii błędu.
