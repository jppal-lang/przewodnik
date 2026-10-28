# Quo: Wyprawa — demo gry (Frasassi, Spello)

Platformówka 2D jako nagroda po wycieczce. Etapy: Jaskinie Frasassi i Spello, każdy w trzech poziomach trudności.
Etap wybiera adres `gra/?trasa=<slug>` (domyślnie `frasassi`) albo przycisk „Wybierz wyprawę” na ekranie startowym
(lista z `stages.json`; wybór przeładowuje stronę z `?trasa=`, inne parametry zostają).
Strona `gra/index.html` ma `noindex` i nie jest nigdzie podlinkowana.

### Tylko zatwierdzone wyprawy (decyzja JP 2026-10-27)

Grę wprowadzamy wyłącznie dla tras **ukończonych i zatwierdzonych przez JP**. Każdy etap w `stages.json` ma pole
`"approved"` (dziś `false` dla Frasassi i Spello — ich nowe wersje tras nie są jeszcze zatwierdzone).

- Wybór wyprawy i `?trasa=` pokazują tylko etapy z `"approved": true`.
- Etapy niezatwierdzone są dostępne tylko z `?test=1` (JP, testy, boty) — na ekranie startowym i przy przycisku wyprawy
  widać wtedy plakietkę „wersja testowa” (`page.game.html.test_badge`).
- Gdy żaden etap nie jest zatwierdzony (i nie ma `?test=1`), zamiast gry pokazuje się ekran „Gra jeszcze śpi”
  (`page.game.locked.title|text|home`) z linkiem na stronę główną. Brak `stages.json` bez `?test=1` = ten sam ekran.
- Zatwierdzenie etapu = zmiana `"approved": false` → `true` w `stages.json` (nic więcej).
- Boty testowe w `/root/pwt` otwierają grę z `?test=1`.

Czysty HTML/CSS/JS, canvas, `requestAnimationFrame` ze stałym krokiem 1/60 s. Zero bibliotek, zero build stepu.

## Pliki

| Plik | Co robi |
|------|---------|
| `index.html` | ekrany (start, pauza, quiz, koniec), HUD, przyciski dotykowe |
| `game.css` | wygląd (kolory z design systemu Quolino) |
| `game.js` | silnik: budowa poziomu, fizyka, rysowanie, szkielet Quo, świętowanie |
| `treasure.js` | Skarb Quo: zapis lokalny i odbiór na koncie rodzica |
| `icons/manifest.json` | lista własnych ikon miejsc (naklejek przystanków) — patrz „Ikony miejsc” |
| `stages.json` | lista etapów na ekranie startowym: slug, plik, ikona, napisy (klucze `page.game.*` + polski w `"i18n"`) |
| `frasassi.json` | dane etapu Frasassi (ręcznie): przystanki, misje, pytania quizu (ze źródłem) |
| `spello.json` | dane etapu Spello — szkielet z `tools/stage-from-trip.mjs`, pytania pisane ręcznie (ze źródłem) |
| `data/<slug>.trip.json` | opublikowana wersja trasy z bazy (`game-export.mjs` na serwerze) — źródło dla generatora |
| `tools/stage-from-trip.mjs` | generator etapu z eksportu trasy (node, bez zależności) |

## Jak grać

- Klawiatura: ← → lub A D — idź, spacja / ↑ / W — skok (krótko = niski, dłużej = wysoki), P / Esc — pauza.
- Telefon: przyciski ◀ ▶ i „Skok” na dole ekranu.
- Bramy z „?” zadają pytanie o przystanek. Brama z „♪” to gra pamięciowa („dźwięczące nacieki”).
- Na końcu przystanku stoi jego naklejka. Dojście do niej = świętowanie, naklejka w albumie i gwiazdki.
- Skrzynie otwiera się uderzeniem głową od dołu albo skokiem z góry. W środku: moc, kamyczki albo przebranie.

## Poziomy trudności (wybór na ekranie startowym, zapamiętany lokalnie)

Przyciski poziomów nie pokazują wieku (bez profilowania dziecka, JP 2026-10-29) — tylko nazwę i krótki opis
(`page.game.diff.<poziom>_desc`: „Bez pośpiechu” / „Więcej przeszkód” / „Najwięcej wyzwań”).

| | Łatwy | Średni | Trudny |
|---|---|---|---|
| Długość przystanku | 150 kafli | 230 kafli | 270 kafli |
| Serduszka na start / limit z misjami | 5 / 12 | 3 / 8 | 2 / 5 |
| Przeszkody | proste (dziury, kamienie, nietoperze) | ruchome i kruche półki, przepaście na rozbieg, wspinaczki, niski strop, śliska skała, rzeka z kłodami, wiatr, żuki, kolczaki, spadające kamienie | to samo, gęściej i ok. 1,55× szybciej |
| Mini-wyzwanie przed naklejką | — | głaz / brama na płytę / walący się most / winda pod świątynię | to samo, mniej czasu |
| Pytania | 3 odpowiedzi, przycisk „Podpowiedź” | 4 odpowiedzi, podpowiedź dopiero po błędzie (bez premii) | 4 odpowiedzi, 2 pytania na bramę |
| Punkty kontrolne | start przystanku, każda brama, naklejka | start przystanku, każda brama, naklejka | tylko start przystanku |
| Melodia | 3 dźwięki | 4 | 5 |
| Lina (stukanie TAP) | ok. 1,5 stuknięcia na s | ok. 2,5 na s | ok. 3,5 na s |
| Głaz (na zmianę ◀ ▶) | ok. 2 na s | ok. 4 na s | ok. 6–7 na s |

Upadek do dziury lub wody zabiera serduszko i wraca Quo w ostatnie bezpieczne miejsce. Gdy skończą się serduszka,
Quo „odpoczywa” i wraca na punkt kontrolny — bez ekranu przegranej.

## Gwiazdki i powtórki

Za każdy przystanek do 3 ★: ukończony / wszystkie 3 zagubione naklejki / czas poniżej celu. Cel czasu
widać na początku przystanku. **Łatwy nie ma celu czasu** (`noTimer`): bez „cel czasu” w dymku, bez czasu na ekranie końcowym,
trzecia gwiazdka za samo przejście przystanku. Na Łatwym przepaść z naklejką w powietrzu (`skygap`) ma kładkę w środku. Czasu pytań i mini-gier nie liczymy. Zagubione naklejki leżą w sekretach:
szopka z fałszywą ścianą, wysoka półka po małych kładkach, naklejka w powietrzu nad przepaścią
(skok z rozbiegu). Najlepszy wynik na poziom zapisuje się lokalnie. Pytania przy bramach zmieniają się
przy kolejnych grach.

## Atrakcje

- **Moce** (magnes, latarka, podwójny skok, szybowanie, balonik): z zadań foto na start przystanku albo ze skrzyń.
  Po uderzeniu moc wypada i miga 2 s — można ją złapać z powrotem.
- **Balonik**: ok. 8 s lotu (pierścień wokół balonu to licznik). Trzymaj skok — w górę, puść — powoli w dół.
  Każdy przystanek ma wyspę w chmurach, na którą da się dostać tylko balonikiem.
- **Tyrolka** nad wąwozem (wąwóz i przystanek 4): Quo łapie linę sam. Skok = puszczenie liny (można złapać ją znowu).
- **Tratwa** na podziemnej rzece (jaskinia, Średni/Trudny): płynie sama, ← → zwalnia/przyspiesza, skacz nad skałami, uważaj na zwisające nacieki.
- **Wagonik** z zwrotnicą (jaskinia, Średni/Trudny): skok przed zwrotnicą = tajny tor do skrzyni z kaskiem.
- **Dźwięczące nacieki**: Quo gra 3–5 dźwięków (kolor + ton), dziecko powtarza. Po 2 błędach pojawia się „Pomiń”.
  (Strona Frasassi nie wspomina o „organach”, więc ich nie nazywamy.)
- **Świetliki** w jaskini: każdy powiększa światło.
- **Mozaika** przy opactwie: przesuwanka 3×3 z naklejką przystanku (skok przy tablicy). Otwiera skrzynię z kapturem.
  Po 2 zamknięciach bez ułożenia — „Pomiń”.
- **Wspinaczka po linie** (jaskinia) i **głaz w poprzek ścieżki** (wąwóz, przystanek 4): szybkie stukanie,
  przy głazie na zmianę ◀ ▶. Przegrana = spokojna powtórka, po 2 próbach „Pomiń”. Wygrana z liny = skrót.
- **Skarb Quo** (tylko Trudny, od 1.06.2027 — start płatności; wcześniej tylko z `?skarb=1` w adresie): na pierwszym
  przystanku w wąwozie, nad zwykłą wyspą w chmurach, w ukrytej „strefie nieba” POWYŻEJ górnej krawędzi poziomu (podłoga komnaty
  16 kafli nad sufitem poziomu). Zwykła kamera tam nie sięga, więc komnaty nie widać. Tylko tu balonik (ze skrzyni przy wyspie)
  nie zatrzymuje się na suficie: trzymaj skok, leć w prawo i w górę — kamera jedzie za Quo w chmury, aż pokaże się komnata.
  Bez balonika najwyżej sięga się ok. 4,5 kafla nad poziom (podwójny skok z wyspy), a kamera rusza w górę dopiero z balonikiem.
  Otwarcie = świętowanie, napis „Znalazłeś Skarb Quo!
  Pokaż go rodzicom — czeka w ich panelu.” i złota naklejka w albumie. Dziecko nie widzi żadnych cen ani kodów.
  `treasure.js`: zalogowany rodzic na tym urządzeniu (`qc.session`) → `POST api.quolino.com/rest/v1/rpc/claim_game_treasure`
  z `{p_trip, p_level:'trudny', p_token}` (w nagłówkach klucz anon — Traefik zdejmuje Authorization); bez sesji, przy statusie ≠ 200
  albo `{error}` innym niż `level`/`not_found` → `{trip, at}` do `quolino_game_treasure_pending` (odbiera `konto.html`).
  Jeden skarb na wycieczkę na urządzeniu (`quolino_game_treasure`). Bez flagi: brak komnaty i żadnej podpowiedzi.
- **Komnaty** (pokoje z przeskokiem ekranu; własny projekt w duchu klasycznych gier z komnatami): na przystanku przy opactwie
  (teren `stone`) drogę zamyka mur. Drzwi w murze prowadzą do kompleksu komnat 16×11 kafli, wyjście z ostatniej komnaty wraca
  na ścieżkę za murem. Łatwy: „Piwnice opactwa” (3 komnaty, 1 klucz), Średni: „Labirynt pod opactwem” (7 komnat, 2 klucze,
  ciemna komnata), Trudny: „Komnaty jaskini” (9 komnat, 3 klucze, kilof i pęknięta ściana, 2 ciemne komnaty).
  W środku: drabiny i liny/łańcuchy (trzymaj skok = w górę, puść = powoli w dół, ◀/▶ = zejdź, ◀/▶ + skok = skok z liny;
  stojąc chwilę na szczycie drabiny Quo sam schodzi), ruchoma posadzka, znikające mostki (dwie grupy na zmianę, migają przed
  zniknięciem), kamienne kraty na zegar (nie ranią, tylko odsuwają), toczące się kamienie, nietoperze i pająki (odpychają),
  przepaście z wodą, kolorowe klucze i drzwi, skrzynie, pochodnia do ciemnych komnat, kilof na pękniętą ścianę.
  Plecak: 4 miejsca (pasek w lewym górnym rogu), mapka odwiedzonych komnat w prawym górnym rogu.
  Uczciwość: klucze i przedmioty nigdy nie przepadają; upadek = powrót do wejścia ostatniej komnaty z całym plecakiem; na Łatwym
  i Średnim każda komnata to punkt kontrolny; na Trudnym drzemka wraca na start przystanku, a ukończone komnaty potem przepuszczają
  od razu do wyjścia. Układ nigdy nie wymaga więcej niż 4 rzeczy naraz. 1–2 zagubione naklejki przystanku leżą w komnatach.
  Mapy komnat są tekstowe (`CX` w `game.js`, legenda w komentarzu sekcji 5b); `route` to punkty dla bota testowego.
- **Przebrania** (tylko wygląd, osobno dla każdej wycieczki): Frasassi — kask z lampką (świeci mocniej w jaskini),
  kaptur mnicha, kapelusz odkrywcy; Spello — wianek z kwiatów, kapelusz odkrywcy. Wybór na ekranie startowym.
- **Tryb foto** 📸: przy naklejce przystanku robi „zdjęcie” Quo z naklejką. Zdjęcia są w albumie na końcu.

## Tłumaczenia (17 języków)

Gra używa `page-i18n.js` z katalogu głównego (jak strony pomocnicze): język z `?lang=` albo `localStorage quolino_lang`,
tłumaczenia z tabeli `ui_translations` (klucze `page.game.*`), brak tłumaczenia → angielski → polski.

- HTML: `data-t`, `data-t-aria`, `data-t-html` (jak na innych stronach).
- `game.js`: każdy napis to `PT('page.game.…', 'tekst polski')` — dosłownie, w pojedynczych cudzysłowach (z tego czyta serwer).
  Zmienne części jako `{n}`, `{name}` itd., podmieniane po tłumaczeniu (`fill()`). Napisy na płótnie: krój strony z zapasowymi,
  min. 18 px na ekranie, za długie zmniejszają się, potem łamią w 2 linie. Gra czeka na tłumaczenia (najdłużej 2,5 s).
- `stages.json`: nazwy etapów i napisy ekranu startowego/albumu (`page.game.stage.<slug>.*`; Frasassi — stare klucze `page.game.html.lead|album|canvas`).
- `spello.json` (i kolejne z generatora): `"i18n"` odświeża `node gra/tools/stage-from-trip.mjs <slug>`.
- `frasassi.json`: pytania mają stałe `id` (np. `s02q4`), a obiekt `"i18n"` trzyma klucze `page.game.frasassi.<id>.q|a0–a3|hint`
  i `page.game.frasassi.s<nr>.name` z polskim tekstem. Po zmianie treści przystanków odśwież go:
  `python3 -c "import json;f='gra/frasassi.json';d=json.load(open(f));d['i18n']={**{f\"page.game.{d['trip']}.s{s['key']}.name\":s['name'] for s in d['stops']},**{f\"page.game.{d['trip']}.{q['id']}.{k}\":v for s in d['stops'] for q in s['quests'] for k,v in [('q',q['q']),('hint',q['hint'])]+[(f'a{i}',a) for i,a in enumerate(q['answers'])]}};open(f,'w').write(json.dumps(d,indent=2,ensure_ascii=False)+'\n')"`
- Serwer (`_content/claude-skills/bin/ui-translate.mjs`, co godzinę) zbiera polskie teksty z `*.html` w katalogu głównym i w `gra/`,
  z wywołań `PT('page.…', '…')` w `*.js` (katalog główny i `gra/`) oraz z obiektów `"i18n"` w `gra/*.json`, i tłumaczy brakujące.

## Nowy etap z opublikowanej trasy

1. Na serwerze: `node game-export.mjs <slug>` → `gra/data/<slug>.trip.json` (opublikowana wersja trasy).
2. `node gra/tools/stage-from-trip.mjs <slug>` → `gra/<slug>.json`: przystanki w kolejności `sort_order`, polskie nazwy,
   ikony naklejek (mapa QUE z panelu admina + emoji przystanku, bez powtórek, jeśli jest zapasowa), klucze postępu
   (`qcKey` = `stop_key`; misja = jest `kids_box`, foto = jest `photo_task` — tak jak checkboxy w `city.html`),
   teren i atrakcje w `"game"`, obiekt `"i18n"`. Parking, lody/słodycze i posiłek to krótkie łączniki bez pytań
   (lokale dostają nazwę ogólną, np. „Przerwa na lody” — oryginał w `sourceName`; w widoku dziecka bez komercji).
3. Pytania (`quests`) dopisz ręcznie: tylko fakty z polskich tekstów trasy (opis, misja, podpowiedź, lokalny smak…),
   2–3 na przystanek zwiedzania, `source` = zdanie źródłowe dosłownie, poprawna odpowiedź pod indeksem `correct`
   (błędne mogą być wymyślone). Uruchom generator ponownie — zachowa pytania i pola z `"manual"` (np. `["name","game"]`)
   i odświeży `"i18n"`.
4. Dopisz etap do `stages.json` (slug, plik, ikona, napisy `name`/`lead`/`album`/`canvas` + polski w `"i18n"`).

### Spello (`spello.json`)

11 przystanków. Sekcja ma długość `game.len × D.sec`, ale nie mniej, niż potrzeba na jej atrakcje (`spNeed`).
Jedna brama z pytaniem na przystanek zwiedzania (Łatwy/Średni 1 pytanie, Trudny 2) — razem tyle pytań co we Frasassi;
pytania zmieniają się przy kolejnych grach. Zagubione naklejki: 3 przy willi (1–2 z nich w komnatach), 2 przy innych
przystankach, 1 na łączniku; gwiazdka za komplet.

| Teren (`game.terrain`) | wygląd | przystanki |
|---|---|---|
| `olive` | zbocze z gajem oliwnym, Spello na wzgórzu w tle | parking (łącznik) |
| `villa` | ruiny rzymskiej willi, kolumny, fragmenty mozaik, mozaikowy brzeg ścieżki | Villa dei Mosaici |
| `gate` | rzymskie mury i brama z trzema łukami i wieżami, cyprysy, bloki różowo-białego kamienia | Porta Consolare, Via Giulia, Porta Venere |
| `fresco` | wnętrze kościoła: kolumny, łuki, freski, smugi światła, posadzka | Sant'Andrea, Santa Maria Maggiore |
| `alley` | strome uliczki: domy z kamienia, zielone okiennice, kwiaty, balkony, schodki | Vicoli, przerwa na lody (łącznik) |
| `belvedere` | panorama doliny o zachodzie słońca: pola, wioski, cyprysy | Belvedere Panoramico |
| `dusk` | ta sama panorama wieczorem, światła w dolinie, świetliki | kolacja (łącznik, koniec) |

Atrakcje Spello (fakty w napisach tylko z tekstów trasy):
- **Villa dei Mosaici**: mozaika-przesuwanka 3×3 z naklejki przystanku (skrzynia z podwójnym skokiem) i komnaty
  „Wykop pod willą” / „Labirynt wykopalisk” / „Komnaty pod willą” (3 / 7 / 9 komnat) — te same, sprawdzone układy co pod
  opactwem, w lustrzanym odbiciu, z motywem rzymskiego muru (opus reticulatum), mozaik i ciemnej cysterny. Na Średnim
  i Trudnym przed naklejką: kładka nad wykopem, która wali się falą.
- **Porta Consolare**: rzymska brama z kratą — dźwignia otwiera ją na 13 / 10 / 8 s (wszystkie poziomy), po drodze
  schodki, przepaść, na Średnim/Trudnym żuk albo kolczak, na Trudnym krucha półka.
- **Kościoły**: gołębie zamiast nietoperzy; w Santa Maria Maggiore (Średni/Trudny) rusztowanie z dwiema windami na półkę z naklejką.
- **Porta Venere**: (Średni/Trudny) windy przy wieżach i spadające kamienie.
- **Vicoli**: „Kwiatowy dywan” (tablica, skok) — dokończ wzór z płatków jak na Infiorate (o nich mówią teksty trasy):
  Łatwy 4×4 i 2 kolory z podglądem, Średni 4×4 i 3 kolory z podglądem, Trudny 5×5 i 4 kolory bez podglądu (wzór
  symetryczny). Nagroda: przebranie **wianek z kwiatów**. Pionowa wspinaczka po balkonach z donicami na wysoki zaułek
  (na Średnim/Trudnym spada donica), schodki, wózek z kwiatami pod górę — szybkie ◀ ▶ jak przy głazie (raz na etap).
- **Belvedere**: stojak z balonikami i przelot nad doliną (wszystkie poziomy; Łatwy z chmurką-półką, Średni/Trudny
  szerzej i z podmuchami), wyspa w chmurach z kapeluszem odkrywcy. Skarb Quo (Trudny, flaga) — tu, nad wyspą,
  jak we Frasassi: tylko balonikiem, kamera bez balonika go nie pokazuje, `claim` z `p_trip:'spello'`.
- **Kolacja (wieczór)**: świetliki — każdy daje kamyczek. Ostatnia naklejka kończy wyprawę.

## Poziom z danych wycieczki

Każdy przystanek to kolejna sekcja. We Frasassi (bez `"game"`) teren wybiera `category`:

| category | teren |
|----------|-------|
| parking, viewpoint-nature, photo | `valley` (wąwóz, trawa) |
| cave | `cave` (ciemno, sufit, rzeka) |
| church, castle, house, street, museum… | `stone` (opactwo, Sentino) |
| monument, viewpoint-city | `cliff` (skalna paszcza ze świątynią, wiatr) |

Układ jest losowany z ziarna (wycieczka + przystanek + poziom), więc za każdym razem wygląda tak samo.
Tła i kafle są rysowane w kodzie per teren — nowa wycieczka nie potrzebuje grafik.
Ikona przystanku: własna ikona miejsca (jeśli jest — patrz niżej), inaczej `media/icons/icon-<icon>-256.webp` (nazwy jak w mapie QUE w panelu admina).

## Ikony miejsc (naklejka przystanku)

Naklejka przystanku (słupek na końcu przystanku, zagubione naklejki, świętowanie, album, zdjęcie) może mieć **własną ikonę
miejsca** zamiast ogólnej ikony kategorii. Gra nie zgaduje plików (żeby nie było błędów 404) — czyta listę z `gra/icons/manifest.json`:

```json
{ "frasassi": ["01", "02"], "spello": ["villa-dei-mosaici"], "media": { "spello": ["porta-venere"] } }
```

- `"<trasa>": [stop_key, …]` → pliki `gra/icons/<trasa>/<stop_key>-256.webp` i `gra/icons/<trasa>/<stop_key>-512.webp`.
- `"media": { "<trasa>": [...] }` → pliki `media/icons/place-<trasa>-<stop_key>-256.webp` i `-512.webp` (wspólne ze stroną).
- `stop_key` = `qcKey` przystanku w JSON etapu (Spello: `stop_key` z bazy, np. `villa-dei-mosaici`); Frasassi nie ma `qcKey` — wtedy `key` (`01`–`04`).
- Plik: **przezroczysty WebP**, kwadrat **256×256** (słupek, album, zagubione naklejki) i **512×512** (świętowanie i zdjęcie),
  styl naklejki: motyw miejsca + Quo, bez białego brzegu (biały brzeg, cień, połysk i zagięty róg dorysowuje gra), ok. 6% marginesu.
- Brak pliku 512 → gra bierze 256; brak 256 → ikona kategorii. Bez wpisu w manifeście — zawsze ikona kategorii.

## Oprawa graficzna (warstwa „art”)

Wszystko rysuje kod (bez plików graficznych), w stylu „Album naklejek”: ciemny kontur (#1B1630) postaci i znajdziek, białe brzegi naklejek,
płaskie kolory z tokenów Quolino. Rozgrywka, fizyka i kolizje są nietknięte — oprawa tylko czyta stan gry.

- **Tła** (`makeLayers()` w sekcji 4c `game.js`): 3–4 warstwy parallax na teren + niebo, mgła i jaśniejsze, mniej nasycone dalekie warstwy,
  jasna krawędź grzbietów. **Pora dnia** wzdłuż wycieczki: pierwszy przystanek rano (chłodne niebo, słońce po lewej), ostatni o zmierzchu
  (złote niebo, słońce niżej, smugi światła); Spello ma osobne niebo belvedere/zmierzchu. Ruch: dryfujące chmury, ptaki, cyprysy na wietrze,
  gwiazdy, światła w dolinie, płatki w uliczkach, smugi światła i pył w kościołach, poświata kryształów i smugi światła w jaskini.
- **Kafle**: zaokrąglone narożniki, faktura, cień głębi (bez murów z ciosów), światło z lewej, cień z prawej i pod nawisem, trawa z kępkami,
  nacieki z mokrym czubkiem. **Ozdoby** (kwiatki, kępy, kamyczki, grzybki, liście, kryształki, stalagmity, kałuże, chwasty w bruku, płatki,
  tesery, bluszcz) wybiera ziarno kafla (`hashXY`) — zawsze te same, nigdy w równym rytmie, bez wpływu na grę.
  Nieruchome kafle rysują się raz do „kawałków” (8 kolumn) w rozdzielczości ekranu i są kopiowane 1:1 (puste wiersze pomijane);
  kawałek odświeża się sam, gdy zmieni się układ jego kafli. Komnaty: tło + nieruchome kafle komnaty też raz (`roomCache`).
- **Quo**: cień zależny od wysokości, rozciąganie w locie i spłaszczenie przy lądowaniu, sprężyste opóźnienie ogona i głowy, końce chustki
  na wietrze (`drawScarf`), oddech, mruganie, kurz spod łap i przy lądowaniu.
- **Przeciwnicy** z konturem, oczami z błyskiem, mruganiem (nietoperz, żuk, kolczak, toczący się kamień z buźką, gołąb, pająk).
- **Znajdźki i UI**: kamyczki z przelatującym błyskiem (gotowe klatki), gwiazdki i „+1” przy zbieraniu, skrzynie z otwieranym wiekiem i błyskiem,
  naklejki z białym brzegiem, cieniem, połyskiem i zagiętym rogiem, moce z poświatą, HUD jako pigułki-naklejki (podskok przy zmianie liczby).
- **Przejścia i świętowanie**: irys przy wejściu/wyjściu z komnat, po upadku i na starcie; świętowanie: promienie i poświata, naklejka „klaps”
  z pierścieniem i iskrami, połysk, lot do albumu ze śladem, konfetti z dwóch armatek (grawitacja, opór, trzepotanie, dwustronne).
- **Światło**: ciemność jaskini/komnat w niskiej rozdzielczości (1/3), ciepła poświata latarki/kasku, winieta i kolor pory dnia jako wąskie pasy.
- **Wstrząs ekranu** przy mocnym lądowaniu, uderzeniu i „klapsie” naklejki; czerwony błysk brzegów przy utracie serduszka.
- **prefers-reduced-motion**: bez wstrząsów, irysa (krótkie wygaszenie), konfetti, promieni, płatków, kołysania; chmury i gwiazdy stoją.

Wydajność (cel: ~60 fps na średnim telefonie): duże gradienty są drogie przy programowym rysowaniu płótna, więc tła używają płaskich kolorów
(gradient tylko 2-punktowy dla nieba, a niebo kończy się tam, gdzie zasłania je pełna warstwa), dalsze warstwy nie są wypełniane do dołu
ekranu, elementy warstw poza ekranem są pomijane, kafle kopiowane 1:1 bez filtrowania, cząsteczek najwyżej 180, DPR najwyżej 2.

**Podmiana na prawdziwe grafiki** (po wygenerowaniu): części Quo — `QUO_RIG.parts[*].src` (niżej); warstwy tła — `ART_SRC['<teren>.<nr warstwy>'] = 'plik.webp'`
(szer. `PER` = 1600 px na okres powtarzania, przezroczysty WebP; nr warstwy = kolejność w `makeLayers()`), wtedy warstwa jest kopiowana
z obrazka zamiast rysowana kodem; `LAYER_CACHE = true` przełącza wszystkie warstwy na gotowe obrazki (opłaca się, gdy płótno rysuje GPU).
Kafle, ozdoby i przeciwnicy to osobne funkcje (`drawSolid`, `drawProp`, `drawPlatform`, `drawBat`, …) — każdą można zastąpić rysowaniem obrazka.

## Punkty z wycieczki → gra

Gra tylko CZYTA postęp wycieczki z tego urządzenia:
`quolino_missions:frasassi` (klucze `<nr>-misja-<i>`, `<nr>-foto`) i `qc.task.<qcKey>-mission/-photo` (gdy JSON ma `qcKey`;
Spello: `qcKey` = `stop_key`, np. `qc.task.villa-dei-mosaici-mission` — tak zapisuje `city.html`).

| Z wycieczki | W grze |
|-------------|--------|
| każda zaliczona misja | +1 serduszko (do limitu poziomu) |
| zadanie foto przystanku | moc na start tego przystanku (można ją stracić) |
| wszystkie zadania przystanku | trampolina „skrót” → kładka wysoko z kryjówką |

Przełącznik „Tryb demo: symuluj punkty z trasy” na ekranie startowym — **tylko z `?test=1`** (bez niego ukryty i wyłączony).

## Zapis w trakcie wyprawy („Graj dalej”)

Po każdej naklejce przystanku gra zapisuje postęp w `quolino_game_save_<slug>` (obiekt `{ <poziom>: {...} }`, osobno dla trasy
i poziomu): numer przystanku, ziarno pytań (`playNo`), kamyczki, naklejki, gwiazdki/czasy/ukryte naklejki przystanków, serduszka, moc.
Ekran startowy pokazuje wtedy „Graj dalej · przystanek N z M” i „Zacznij od nowa” (kasuje zapis tego poziomu). Poziom odbudowuje się
z tego samego ziarna, Quo staje tuż za ostatnią zdobytą naklejką. Ukończenie wyprawy kasuje zapis.

Poziomo (telefon) z przyciskami dół ekranu jest zarezerwowany na grunt (`view.reserve`) — ścieżka Quo leży nad lewymi przyciskami.

Klucze gry (tylko `localStorage`, prefiks `quolino_game_`): `demo`, `diff`, `<slug>` (rekordy per poziom: `frasassi`,
`spello`), przebrania per wycieczka — `hats`/`hat` (Frasassi) i `hats_<slug>`/`hat_<slug>` (np. `hats_spello`, `hat_spello`),
`photos` (obiekt `{<slug>: [...]}`, zdjęcia JPEG ok. 30 KB każde, po jednym na przystanek), `treasure` (`{<slug>: …}`), `treasure_pending`,
`save_<slug>` (zapis „Graj dalej”, np. `quolino_game_save_spello`).
Przed publikacją: dopisać je w `docs/BACKEND.md` §6 i w `cookie-policy.html`.

## Quo — szkielet cut-out

Quo składa się z osobnych części animowanych w kodzie (obroty, podskoki, ściśnięcia).
Dziś części rysuje kod (`PART_DRAW` w `game.js`). Żeby podmienić je na grafiki, wystarczy wpisać
ścieżkę w `src` w `QUO_RIG.parts` — reszta (pivoty, animacje) zostaje.

Zasady dla plików części:

- przezroczysty PNG lub WebP, Quo patrzy **w prawo**, poza spoczynkowa (ręce i nogi zwisają w dół),
- rozdzielczość = `w × res` na `h × res` px (`res = 6`),
- punkt obrotu (staw) leży w pikselu `(px × res, py × res)` od lewego górnego rogu,
- jednostki: 1 j. = 1 px świata; Quo ma ok. 66 j. wysokości (z uszami), początek (0,0) = między stopami na ziemi.

| Część | Plik (propozycja) | w × h (j.) | px, py — staw w obrazku | ax, ay — staw w szkielecie | rodzic |
|-------|-------------------|-----------|--------------------------|---------------------------|--------|
| ogon | `quo-part-tail.webp` | 46 × 56 → 276×336 px | 38, 46 (nasada ogona) | −8, −15 | tułów |
| noga tylna | `quo-part-leg-back.webp` | 16 × 18 → 96×108 px | 6, 4 (biodro) | −4, −11 | — |
| ręka tylna | `quo-part-arm-back.webp` | 14 × 22 → 84×132 px | 7, 4 (bark) | −5, −27 | tułów |
| tułów + chustka | `quo-part-body.webp` | 32 × 34 → 192×204 px | 16, 28 (biodra) | 0, −11 | — |
| noga przednia | `quo-part-leg-front.webp` | 16 × 18 → 96×108 px | 6, 4 (biodro) | 4, −11 | — |
| głowa (oczy otwarte) | `quo-part-head.webp` | 46 × 44 → 276×264 px | 20, 36 (szyja) | 1, −32 | tułów |
| głowa (mrugnięcie) | `quo-part-head-blink.webp` | jak głowa | jak głowa | jak głowa | tułów |
| ręka przednia | `quo-part-arm-front.webp` | 14 × 22 → 84×132 px | 7, 4 (bark) | 5, −27 | tułów |

Kolejność rysowania (od tyłu): ogon, noga tylna, ręka tylna, tułów, noga przednia, głowa, ręka przednia.
Tylna ręka i noga mogą być tymi samymi grafikami co przednie, tylko o ton ciemniejsze.

Animacje w `quoPose()`: `idle`, `walk`, `jump`, `fall`, `glide`, `hurt`, `nap`, `cheer` (statyczna dla
`prefers-reduced-motion`) i 4 tańce: `dance0` machanie, `dance1` podskok z obrotem, `dance2` ogon-wiatrak,
`dance3` disco. Tańce zmieniają się po kolei przy każdym przystanku.

## Co jest prawdziwe, a co zastępcze

- Prawdziwe: dane przystanków, misje i zadania foto ze strony `wlochy/marche/frasassi.html`; ikony przystanków
  i grafiki Quo na ekranach (start, quiz, koniec) z `media/icons/`.
- Zastępcze: Quo w grze rysowany kodem (do podmiany na części), tła i kafle rysowane kodem (oprawa jw.), ikony miejsc —
  ikony kategorii do czasu własnych plików (manifest), dźwięki to proste „piknięcia” WebAudio (domyślnie wyłączone).
- Jaskinia nie ma własnej ikony — używa `icon-viewpoint-nature`; świątynia Valadiera używa `icon-church`
  (`icon-monument` to Big Ben i Koloseum). Warto dorysować `icon-cave`.

## Test

Z katalogu repo: `python3 -m http.server`, potem `http://localhost:8000/gra/?test=1` (dopóki etapy nie są zatwierdzone). Spello: `http://localhost:8000/gra/?test=1&trasa=spello` (Skarb Quo do testu: `&skarb=1`, poziom Trudny).
Do testów automatycznych strona wystawia `window.__quoGame`: stan, `snapshot()/restore()`, `simulate(wejścia)`
(deterministyczna symulacja bez efektów ubocznych) i `advance(wejścia)`. Bot planujący sprawdza nimi,
że każdy poziom da się przejść; dzieci tego nie widzą.

Czapki rysuje `drawHat()` w układzie głowy — tak samo da się je kiedyś podmienić na pliki.
