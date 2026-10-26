# Quo: Wyprawa — demo gry (Frasassi)

Platformówka 2D jako nagroda po wycieczce. Demo: jeden etap — Jaskinie Frasassi, trzy poziomy trudności.
Strona `gra/index.html` ma `noindex` i nie jest nigdzie podlinkowana.

Czysty HTML/CSS/JS, canvas, `requestAnimationFrame` ze stałym krokiem 1/60 s. Zero bibliotek, zero build stepu.

## Pliki

| Plik | Co robi |
|------|---------|
| `index.html` | ekrany (start, pauza, quiz, koniec), HUD, przyciski dotykowe |
| `game.css` | wygląd (kolory z design systemu Quolino) |
| `game.js` | silnik: budowa poziomu, fizyka, rysowanie, szkielet Quo, świętowanie |
| `treasure.js` | Skarb Quo: zapis lokalny i odbiór na koncie rodzica |
| `frasassi.json` | dane etapu: przystanki, misje, pytania quizu (ze źródłem) |

## Jak grać

- Klawiatura: ← → lub A D — idź, spacja / ↑ / W — skok (krótko = niski, dłużej = wysoki), P / Esc — pauza.
- Telefon: przyciski ◀ ▶ i „Skok” na dole ekranu.
- Bramy z „?” zadają pytanie o przystanek. Brama z „♪” to gra pamięciowa („dźwięczące nacieki”).
- Na końcu przystanku stoi jego naklejka. Dojście do niej = świętowanie, naklejka w albumie i gwiazdki.
- Skrzynie otwiera się uderzeniem głową od dołu albo skokiem z góry. W środku: moc, kamyczki albo przebranie.

## Poziomy trudności (wybór na ekranie startowym, zapamiętany lokalnie)

| | Łatwy (5–7 lat) | Średni (8–10) | Trudny (11+) |
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
widać na początku przystanku. Czasu pytań i mini-gier nie liczymy. Zagubione naklejki leżą w sekretach:
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
- **Przebrania** (tylko wygląd): kask z lampką (świeci mocniej w jaskini), kaptur mnicha, kapelusz odkrywcy.
  Wybór na ekranie startowym.
- **Tryb foto** 📸: przy naklejce przystanku robi „zdjęcie” Quo z naklejką. Zdjęcia są w albumie na końcu.

## Tłumaczenia (17 języków)

Gra używa `page-i18n.js` z katalogu głównego (jak strony pomocnicze): język z `?lang=` albo `localStorage quolino_lang`,
tłumaczenia z tabeli `ui_translations` (klucze `page.game.*`), brak tłumaczenia → angielski → polski.

- HTML: `data-t`, `data-t-aria`, `data-t-html` (jak na innych stronach).
- `game.js`: każdy napis to `PT('page.game.…', 'tekst polski')` — dosłownie, w pojedynczych cudzysłowach (z tego czyta serwer).
  Zmienne części jako `{n}`, `{name}` itd., podmieniane po tłumaczeniu (`fill()`). Napisy na płótnie: krój strony z zapasowymi,
  min. 18 px na ekranie, za długie zmniejszają się, potem łamią w 2 linie. Gra czeka na tłumaczenia (najdłużej 2,5 s).
- `frasassi.json`: pytania mają stałe `id` (np. `s02q4`), a obiekt `"i18n"` trzyma klucze `page.game.frasassi.<id>.q|a0–a3|hint`
  i `page.game.frasassi.s<nr>.name` z polskim tekstem. Po zmianie treści przystanków odśwież go:
  `python3 -c "import json;f='gra/frasassi.json';d=json.load(open(f));d['i18n']={**{f\"page.game.{d['trip']}.s{s['key']}.name\":s['name'] for s in d['stops']},**{f\"page.game.{d['trip']}.{q['id']}.{k}\":v for s in d['stops'] for q in s['quests'] for k,v in [('q',q['q']),('hint',q['hint'])]+[(f'a{i}',a) for i,a in enumerate(q['answers'])]}};open(f,'w').write(json.dumps(d,indent=2,ensure_ascii=False)+'\n')"`
- Serwer (`_content/claude-skills/bin/ui-translate.mjs`, co godzinę) zbiera polskie teksty z `*.html` w katalogu głównym i w `gra/`,
  z wywołań `PT('page.…', '…')` w `*.js` (katalog główny i `gra/`) oraz z obiektów `"i18n"` w `gra/*.json`, i tłumaczy brakujące.

## Poziom z danych wycieczki

Każdy przystanek z `frasassi.json` to kolejna sekcja. `category` wybiera teren:

| category | teren |
|----------|-------|
| parking, viewpoint-nature, photo | `valley` (wąwóz, trawa) |
| cave | `cave` (ciemno, sufit, rzeka) |
| church, castle, house, street, museum… | `stone` (opactwo, Sentino) |
| monument, viewpoint-city | `cliff` (skalna paszcza ze świątynią, wiatr) |

Układ jest losowany z ziarna (wycieczka + przystanek + poziom), więc za każdym razem wygląda tak samo.
Tła i kafle są rysowane w kodzie per teren — nowa wycieczka nie potrzebuje grafik.
Ikona przystanku: `media/icons/icon-<icon>-256.webp` (nazwy jak w mapie QUE w panelu admina).

## Punkty z wycieczki → gra

Gra tylko CZYTA postęp wycieczki z tego urządzenia:
`quolino_missions:frasassi` (klucze `<nr>-misja-<i>`, `<nr>-foto`) i `qc.task.<qcKey>-mission/-photo` (gdy JSON ma `qcKey`).

| Z wycieczki | W grze |
|-------------|--------|
| każda zaliczona misja | +1 serduszko (do limitu poziomu) |
| zadanie foto przystanku | moc na start tego przystanku (można ją stracić) |
| wszystkie zadania przystanku | trampolina „skrót” → kładka wysoko z kryjówką |

Przełącznik „Tryb demo: symuluj punkty z trasy” na ekranie startowym.

Klucze gry (tylko `localStorage`, prefiks `quolino_game_`): `demo`, `diff`, `frasassi` (rekordy per poziom),
`hats`, `hat`, `photos` (zdjęcia JPEG ok. 30 KB każde, max 4 na wycieczkę), `treasure`, `treasure_pending`.
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
- Zastępcze: Quo w grze rysowany kodem (do podmiany na części), tła i kafle rysowane kodem, dźwięki to proste
  „piknięcia” WebAudio (domyślnie wyłączone).
- Jaskinia nie ma własnej ikony — używa `icon-viewpoint-nature`; świątynia Valadiera używa `icon-church`
  (`icon-monument` to Big Ben i Koloseum). Warto dorysować `icon-cave`.

## Test

Z katalogu repo: `python3 -m http.server`, potem `http://localhost:8000/gra/`.
Do testów automatycznych strona wystawia `window.__quoGame`: stan, `snapshot()/restore()`, `simulate(wejścia)`
(deterministyczna symulacja bez efektów ubocznych) i `advance(wejścia)`. Bot planujący sprawdza nimi,
że każdy poziom da się przejść; dzieci tego nie widzą.

Czapki rysuje `drawHat()` w układzie głowy — tak samo da się je kiedyś podmienić na pliki.
