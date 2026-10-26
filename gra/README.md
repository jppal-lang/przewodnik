# Quo: Wyprawa — demo gry (Frasassi)

Platformówka 2D jako nagroda po wycieczce. Demo: jeden etap — Jaskinie Frasassi.
Strona `gra/index.html` ma `noindex` i nie jest nigdzie podlinkowana.

Czysty HTML/CSS/JS, canvas, `requestAnimationFrame` ze stałym krokiem 1/60 s. Zero bibliotek, zero build stepu.

## Pliki

| Plik | Co robi |
|------|---------|
| `index.html` | ekrany (start, pauza, quiz, koniec), HUD, przyciski dotykowe |
| `game.css` | wygląd (kolory z design systemu Quolino) |
| `game.js` | silnik: budowa poziomu, fizyka, rysowanie, szkielet Quo, świętowanie |
| `frasassi.json` | dane etapu: przystanki, misje, pytania quizu (ze źródłem) |

## Jak grać

- Klawiatura: ← → lub A D — idź, spacja / ↑ / W — skok (krótko = niski, dłużej = wysoki), P / Esc — pauza.
- Telefon: przyciski ◀ ▶ i „Skok” na dole ekranu.
- Bramy z „?” zatrzymują Quo i zadają pytanie o przystanek. Zła odpowiedź = podpowiedź i kolejna próba.
- Na końcu każdego przystanku stoi jego naklejka. Dojście do niej = świętowanie i naklejka w albumie.
- Kamyczki zbierasz po drodze. Na toczące się kamienie i nietoperze można wskoczyć z góry.

## Poziom z danych wycieczki

Każdy przystanek z `frasassi.json` to kolejna sekcja (104 kafle). `category` wybiera teren:

| category | teren | przeszkody |
|----------|-------|------------|
| parking, viewpoint-nature, photo | `valley` (wąwóz, trawa) | toczące się kamienie, dziury |
| cave | `cave` (ciemno, sufit) | krople ze stalaktytów, nietoperze, stalagmity |
| church, castle, house, street, museum… | `stone` (opactwo, rzeka) | woda Sentino, mostki, kamienie |
| monument, viewpoint-city | `cliff` (skalna paszcza ze świątynią) | strome stopnie, kamienie z góry |

Układ jest losowany z ziarna (nazwa wycieczki + numer przystanku), więc za każdym razem wygląda tak samo.
Bramy z pytaniami: do 2 na przystanek. Przy kolejnej grze pytania się zmieniają (rotacja po liście `quests`).
Tła i kafle są rysowane w kodzie per teren — nowa wycieczka nie potrzebuje grafik.

Ikona przystanku: `media/icons/icon-<icon>-256.webp` (nazwy jak w mapie QUE w panelu admina).

## Punkty z wycieczki → gra

Gra tylko CZYTA postęp wycieczki z tego urządzenia:

- `quolino_missions:frasassi` (stara strona, `kids-view.js`): klucze `<nr>-misja-<i>` i `<nr>-foto`,
- `qc.task.<qcKey>-mission` / `-photo` (nowe `city.html`) — gdy w JSON przystanek ma `qcKey` (dziś `null`, bo Frasassi nie ma jeszcze `stop_key`).

| Z wycieczki | W grze |
|-------------|--------|
| każda zaliczona misja | +1 serduszko (start: 3, max 12) |
| zadanie foto przystanku | moc w sekcji tego przystanku: magnes na kamyczki / latarka w jaskini / podwójny skok / szybowanie |
| wszystkie zadania przystanku | tajny skrót: trampolina „skrót” → kładka wysoko z kryjówką (+10) |

Brak punktów niczego nie blokuje — gra jest tylko trudniejsza (np. ciemniej w jaskini).
Na ekranie startowym jest przełącznik „Tryb demo: symuluj punkty z trasy”.

Zapis gry (tylko `localStorage`, prefiks `quolino_game_`):
`quolino_game_demo` (przełącznik demo), `quolino_game_frasassi` (`{best, plays, stickers}`).
Przed publikacją: dopisać oba klucze w `docs/BACKEND.md` §6 i w `cookie-policy.html`.

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
Do testów automatycznych strona wystawia `window.__quoGame` (stan, gracz, poziom) — bez wpływu na grę.
