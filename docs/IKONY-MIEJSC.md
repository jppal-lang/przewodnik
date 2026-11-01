# IKONY MIEJSC — ilustracje przystanków (JP 2026-10-27)

Jedna ilustracja na przystanek zwiedzania. Używana na stronie (naklejki w albumie, karty przystanków) i w grze „Quo: Wyprawa”.
Skrypt: `_content/claude-skills/bin/place-icons.mjs` (+ `place-icons-lib.mjs`, dane i wyjątki: `place-icons-data.mjs`).

## 1. Zasady (decyzje JP)

1. **Źródło prawdy to prawdziwe zdjęcia.** Dla każdego przystanku dwa zdjęcia z Wikimedia Commons pokazujące, jak obiekt naprawdę wygląda.
2. **NIGDY zdjęć z ludźmi** — ani jednej osoby, także w tle. I nigdy ludzi na ilustracji.
3. **Ilustracja jest NOWA** — zdjęcia mówią tylko o bryle, proporcjach, materiałach i kolorach. Kadru, światła ani niczego innego nie kopiujemy.
4. **Styl jak ilustracje hero Quolino** — ciepły, malarski rysunek, miękkie kontury. Obraz stylu: `media/tours/quolino-it-rimini-hero-1200.webp`.
5. **ZAWSZE złota godzina** — nisko stojące ciepłe słońce, długie miękkie cienie (bardzo ważne).
6. **Sam obiekt jak naklejka** — widok 3/4 lekko z góry, wyraźna sylwetka, przezroczyste tło. Bez Quo, bez ludzi, bez napisów, bez logo.
7. **Prawa i metadane**: „© Quolino (quolino.com)” w PNG/WebP (EXIF, XMP, znacznik AI IPTC), tak jak w ikonach Quo.
8. **Tylko trasy zatwierdzone przez JP** (status `published`, nowy proces `workflow v2`). Przystanki praktyczne (parking, restauracja, lody, słodycze) nie dostają ikon.

## 2. Jak to działa

1. **Zdjęcia (`refs`)**: kandydaci z elementu Wikidata przystanku (P18, kategoria Commons P373 i jej podkategorie) i z wyszukiwarki Commons („nazwa miasto”).
   Filtr w kodzie odrzuca pliki, których tytuł, opis albo kategorie mówią o ludziach (procesja, festa, infiorata, ślub, turyści, portret…),
   mapy, rysunki, noc i rusztowania, a przy obiektach oglądanych z zewnątrz — wnętrza. Ranking woli zdjęcie główne z Wikidata, duże, poziome, dzienne.
   Najlepsze miniatury (do 12) ogląda Claude i wybiera dwa — każde zdjęcie z widoczną osobą odpada. Wynik: `ref-1.jpg`, `ref-2.jpg`, `refs.json`.
2. **Generowanie (`gen`)**: Antigravity (Google AI Pro) dostaje 2 zdjęcia + obraz stylu i prompt (złota godzina, sam obiekt, płaskie tło magenta do wycięcia).
   Python wycina tło do przezroczystości i dopisuje metadane praw.
3. **Ocena**: na Discordzie w kanale **#ikony-miejsc** (kategoria „Grafiki”) JP dostaje trzy pliki: oba zdjęcia źródłowe i ikonę, z linkami do Commons, autorami i licencjami.
4. **Akceptacja (`ok`)**: WebP 64/128/256/512 → `media/icons/place-<trasa>-<stop_key>-<rozmiar>.webp`, wpis w `media/icons/place-sources.json`
   i (gdy plik jest w repo) klucz przystanku w `gra/icons/manifest.json` → `"media"`, z którego gra bierze własne naklejki przystanków.

## 3. Odpowiedzi JP w #ikony-miejsc

N = numer przystanku na trasie (jak na stronie).

| Odpowiedź | Co się dzieje |
|-----------|---------------|
| `ok 3` / `3 ok` / samo `ok` (ostatnia albo ta, na którą odpowiadasz) | publikacja ikony, potem następny przystanek |
| `3 wieża wyższa, mniej drzew` / same uwagi | nowa wersja z uwagami (poprzednia wersja idzie jako obraz pomocniczy) |
| `3 inne zdjęcia` | nowe zdjęcia referencyjne (bez dotychczasowych) i nowa wersja |
| `następne` | kolejny przystanek |
| `spello 3 …` | to samo, gdy kilka tras czeka naraz |

Gdy limit Antigravity jest wyczerpany, poprawka zapisuje się i kolejka zrobi ją po odnowieniu.

## 4. Licencje

Zdjęcia z Commons służą wyłącznie jako informacja wizualna o wyglądzie obiektu; nie publikujemy ich i nie przerabiamy — ilustracja jest rysowana od nowa.
Dla każdej ikony zapisujemy mimo to źródła (tytuł pliku, URL, autor, licencja) w `media/icons/place-sources.json`, żeby zawsze dało się wykazać, z czego korzystał rysunek.

## 5. Komendy (serwer)

```
node place-icons.mjs refs <trasa> [--stop key] [--dry | --force | --again]
node place-icons.mjs gen <trasa> [--only key1,key2] [--next] [--force]
node place-icons.mjs fix <trasa> <N> "uwagi"
node place-icons.mjs ok <trasa> <N>
node place-icons.mjs status [trasa]
node place-icons.mjs watch          # cron co 2 min
node place-icons.mjs queue [--max 3] # cron co 30 min
```

`gen`, `fix` i `queue` nie startują przy wyczerpanym limicie Antigravity (`work/agy-quota.json`); `queue` przerabia najwyżej 3 przystanki na przebieg
i nie generuje, gdy na ocenę czeka już 6 ikon. Wyjątki (ręcznie wybrane pliki, kategoria Commons, wnętrze zamiast zewnętrza, pominięcie): `place-icons-data.mjs`.
Pliki robocze: `/opt/data/quolino/work/place-icons/<trasa>/<stop_key>/`.

## 6. Wybór zdjęć przez JP w panelu admina (JP 2026-10-30)

**Po co:** JP sam wskazuje, które zdjęcia zabytku mają być referencją do ilustracji z Quo. Domyślnie (bez kliknięcia) działa automat jak dotąd.

1. **Kandydaci** — `bin/place-candidates.mjs <trasa>` (serwer, ma dostęp do Commons; zlecenie z repo: `_content/jobs/*.json`,
   skrypt na białej liście `repo-jobs.mjs`, jedyny argument = slug). Ten sam dobór co `refs`: Wikidata P18, kategoria Commons i podkategorie,
   wyszukiwarka; filtr ludzi / map / nocy / wnętrz; **tylko wolne licencje** (`licenseOk`: CC0, PD, CC BY, CC BY-SA, GFDL, FAL…; NC/ND/nieznana odpadają).
   Do 4 zdjęć na przystanek zwiedzania (miniatura 320 px z upload.wikimedia.org, strona pliku, autor, licencja, wymiary).
   Przystanki: najnowsza opublikowana wersja + przystanki dodane w najnowszym szkicu.
   Wynik: `media/icons/place-candidates/<trasa>.json` w repo (Hermes: `repo.sh publish`; panel czyta ten sam checkout co strona)
   i kopia `work/place-icons/<trasa>/candidates.json`.
2. **Panel** — karta przystanku (wycieczka → zakładka wersji), pod numerem i nazwą: „Referencja do ikony Quo”. Klik w miniaturę = wybór
   (zielona ramka + ✓), najwyżej 2; „Automat” = generator wybiera sam; „Cofnij decyzję” = znowu brak wyboru; link „otwórz na Commons”.
   Każdy klik zapisuje się od razu: `rpc/admin_icon_refs_set {p_trip, p_stop_key, p_files}` → `ops.icon_refs`
   (SQL `_content/claude-skills/sql/2026-10-30-icon-refs.sql`, wymaga `deploy.sh approve`). Przystanki praktyczne — bez bloku.
3. **Generowanie** — `place-icons.mjs` przed `gen`/`queue`/`fix` sprawdza `ops.icon_refs`:
   - **wybór JP** (1–2 pliki) → te zdjęcia jako referencje (także przy `--force` i przy poprawkach); licencja i format nadal sprawdzane,
     autor i licencja idą do `refs.json` i przy akceptacji do `place-sources.json`. Jedno zdjęcie = prompt „the first image is a real photograph”.
     Gdy JP zmieni wybór dla ikony czekającej na ocenę, kolejka robi nową wersję z nowymi zdjęciami (zaakceptowanych nie rusza);
   - **automat** → dotychczasowy dobór (Claude ogląda miniatury i wybiera 2);
   - **brak decyzji** przy przystanku, który ma kandydatów → **bezpiecznik**: przystanek jest pomijany (log: „czeka na wybór zdjęć JP…”)
     najwyżej **48 h od wygenerowania kandydatów** (`generated_at` w pliku), potem automat. Brak pliku kandydatów albo brak kandydatów → automat od razu.
     `gen … --no-wait` wymusza automat od razu. „N inne zdjęcia” na Discordzie przy przystanku z wyborem JP → prośba o zmianę wyboru w panelu.
   - Gdy tabeli jeszcze nie ma (SQL niezatwierdzony) — liczy się jak „brak decyzji”.

## 7. Własny link do zdjęcia (JP 2026-10-31)

**Decyzja JP:** „poza zdjęciami z wiki musi być miejsce na mój własny link lub linki do generowania zdjęć”.

1. **Panel** — karta przystanku, pole „Własny link do zdjęcia (dowolna strona lub plik)”. Link z Wikimedia Commons / Wikipedii
   (`…/wiki/File:…`, `#/media/Plik:…`, `upload.wikimedia.org/…`) zapisuje się jak dotąd jako `File:…` (autor i licencja z Commons).
   **Każdy inny link `https://`** (zdjęcie z dowolnej strony, Dysk Google, Dropbox, Imgur, blog…) zapisuje się jako adres.
   Razem z kandydatami z Commons **najwyżej 2 referencje** (generator dostaje 2 zdjęcia + obraz stylu + ewentualnie poprzednią wersję;
   więcej obrazów Antigravity nie gwarantuje — `PLACE_ICONS_MAX_REFS`). Wybrane linki: lista z „usuń”; miniatura tylko przy bezpośrednim pliku
   `.jpg/.png/.webp` (bez referera), strona albo Dysk = sam link. Odrzucane od razu: `http://`, `javascript:`, login w adresie, strona Wikipedii bez pliku.
   Do zatwierdzenia SQL `_content/claude-skills/sql/2026-10-31-icon-refs-linki.sql` (zakładka Decyzje) baza odrzuca adresy — panel mówi, co zrobić.
2. **Baza** — `ops.icon_refs.files`: `File:….jpg` albo `https://…` (≤ 2000 znaków, host bez loginu, bez spacji i znaków kontrolnych);
   ta sama reguła w CHECK (`ops.icon_ref_ok`) i w `admin.admin_icon_refs_set`.
3. **Generator** (`place-icons-fetch.mjs`, testy `place-icons-fetch.test.mjs`):
   - Dysk Google `drive.google.com/file/d/ID/view` → `drive.google.com/uc?export=download&id=ID`; Dropbox `?dl=0` → `?raw=1`;
   - tylko https, port 443, bez loginu; host po rozwiązaniu DNS **nie może** być prywatny / loopback / link-local / metadane
     (127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, 100.64/10, 0/8, ::1, fc00::/7, fe80::/10, zmapowane IPv4…). Połączenie idzie dokładnie
     na sprawdzony adres IP (bez okna na podmianę DNS). Przekierowania ręcznie, najwyżej 3, każde sprawdzane tak samo;
   - limit 15 MB, 20 s na całość, tylko JPEG / PNG / WebP — `Content-Type` **i** sygnatura bajtów (Dysk/Dropbox z `octet-stream`: decyduje sygnatura);
   - odpowiedź HTML (strona, nie plik) → `og:image` / `twitter:image` / `<link rel=image_src>` i pobranie tego obrazu tą samą drogą (jeden krok);
   - zdjęcie → `ref-N.jpg` jak z Commons; w `refs.json`, poście na Discordzie i `place-sources.json`: URL i **„źródło: link JP”** zamiast autora i licencji.
4. **Nieudane pobranie** → post w #ikony-miejsc przy tej ikonie: „nie udało się pobrać Twojego zdjęcia z <host>: powód” (raz na dany wybór)
   i **żadnego automatu po cichu**: stan przystanku `link_fail = { sig, tries, msg }`; generator próbuje jeszcze przy kolejnych przebiegach
   kolejki (razem 3 próby — na wypadek chwilowej awarii serwisu), potem `iconGate` zwraca `{ wait: true, jp: true }` i przystanek czeka bez terminu
   (także przy `--no-wait`, `fix` i „następne”). Nowy wybór w panelu (inny link, Commons albo „Automat”) zeruje licznik.
   `status` pokazuje „link JP: …”. Zły plik z Commons (licencja, format) działa jak dotąd: odpada, a gdy nic nie zostanie — automat.

## 8. Po akceptacji ikona sama trafia na stronę (JP 2026-10-31)

**Decyzja JP:** „wygenerowane grafiki i zaakceptowane punkty nie pojawiły się przy przystankach, po akceptacji to musi lecieć automatem”.

1. **Baza** — `stops.icon = 'place-<trasa>-<stop_key>'` (kolumna istniała, była pusta). Ustawia ją `place-icons.mjs ok` zaraz po publikacji
   WebP (idempotentnie, log + wpis w #ikony-miejsc „🔗 ikona podpięta do przystanku”), a `place-icons.mjs sync` uzupełnia dla WSZYSTKICH
   wpisów z `media/icons/place-sources.json`, których pliki są w repo (bez AI, 0 kosztów; na białej liście `repo-jobs.mjs`, zlecenie
   `_content/jobs/2026-10-31-ikony-sync.json`; dodatkowo `queue` co 30 min woła `sync` przed generowaniem). Oba zapisują ten sam `icon`
   także w migawkach `city_versions.content` (wersja opublikowana i bieżący szkic), żeby panel widział status, a zatwierdzenie szkicu nie zgubiło ikony.
2. **Strona** — `stop-icon.js` (wspólny dla `city.html`, panelu i SSR): `stop.icon` zaczynające się od `place-` → `/media/icons/<icon>-<rozmiar>.webp`
   (karta 256/512, pasek naklejek 128/256, panel 64/128), srcset 1x/2x, lazy; brak pliku → `onerror` cofa do ikony kategorii, potem do SVG.
   `public_stops` i SSR pobierają kolumnę `icon` (`trip_full`/`trip_member`/`trip_kid` niosą ją same). Naklejki dziecka (kids-view/kid-play)
   używają tych samych elementów karty i paska — nic osobnego. SSR dodaje obrazek i `image` w schema.org przy ikonie miejsca.
   `sw.js` v3: pliki mają unikalne nazwy, więc cache-first obrazków wystarcza; lista (API) nie przechodzi przez SW. Offline: `cacheTripMedia`
   zbiera wszystkie `img` strony, więc ikony miejsc idą do pamięci razem z ikonami kategorii.
3. **Migawki wersji** — SQL `_content/claude-skills/sql/2026-10-31-ikony-przystankow.sql` (do zatwierdzenia w panelu, Decyzje):
   `trip_draft_save` przepisuje ikony z przystanków na żywo do migawki szkicu (import_city nie zna pola), `admin_approve` zapamiętuje ikony
   przed `city_load_snapshot` i przywraca tam, gdzie migawka ich nie ma (`stops_icons_of` / `stops_icons_restore`, po `stop_key`, NULL = uzupełnij,
   inna wartość = zostaje). Samokontrola na prawdziwej trasie w wycofywanej podtransakcji. Bez tego SQL ikony wracają po zatwierdzeniu
   przy najbliższym `sync` (do 30 min przerwy).
4. **Panel** — spis przystanków, karty i podgląd używają `stop.icon`; w karcie przystanku pod „Zdjęcie do ikony Quo” status
   „Ikona miejsca opublikowana · podpięta” / „gotowa, niepodpięta (sync)”; zakładka **Ikony** ma sekcję „Opublikowane ikony miejsc”
   (place-sources.json × `admin_versions.content->stops`); „Gotowe” liczy podpięte i czekające.
5. **Testy** — `bin/stop-icon.test.mjs` (wybór ikony, zapas, biała lista), przeglądarkowy `test/ikony-miejsca-pw.mjs` (Playwright, lokalna
   `city.html` z mockiem API: karta i pasek pokazują ikonę miejsca, inny przystanek ikonę kategorii, brak pliku → zapas).

## 9. Akceptacja w panelu admina (JP 2026-11-01)

„Temat akceptacji ikon, niech to będzie przez panel admina.” Dotyczy ikon miejsc (`place-icons.mjs`), póz Quo (`quo-icons.mjs`) i paczek grafik gry (`game-art.mjs`).

1. **Po wygenerowaniu** skrypt woła `bin/art-review.mjs`: podgląd → repo (`media/icons/_review/<klucz>-vN.webp`, gra: `gra/art/_review/…` + gif animacji),
   wiersz `pending` w `ops.art_requests` (obrazy wejściowe: miniatury Commons przez `Special:FilePath`, link JP, pliki referencyjne z repo).
   Poprzedni `pending` tego samego klucza → `superseded`. Discord dostaje tylko jedno zdanie z linkiem https://admin.quolino.com/_admin/#/grafiki.
2. **Panel → Grafiki** (`#/grafiki`, licznik w menu, „Czeka na Ciebie” na Pulpicie, „Dziś”): karta z podglądem na szachownicy i obrazami wejściowymi;
   **Akceptuj** / **Popraw** (uwagi obowiązkowe) / **Odrzuć** (drugie kliknięcie potwierdza) → RPC `admin.admin_art_decide`.
3. **Wykonanie**: `place-icons.mjs watch` (cron co 2 min, bez zmiany crontab) czyta decyzje (`AR.poll`) dla ikon miejsc, woła `game-art.mjs watch`
   i `quo-icons.mjs watch --panel-only`. accepted → to, co „ok” (publikacja, `stops.icon`, następna); fix → nowa wersja z uwagami (nowy wiersz);
   rejected → status `rejected`, nic więcej bez nowego polecenia. Błąd wykonania: 3 próby, potem wiersz z błędem i ostrzeżenie na Discordzie.
4. **Droga zapasowa**: „ok N” / uwagi na Discordzie działają dalej — skrypt zamyka wtedy wiersz w panelu (`closePending`).
5. **Zaległe sprzed panelu** (czekające na „ok” na Discordzie): `node art-review.mjs migrate` — robi to sam `place-icons.mjs watch`, raz, gdy baza ma
   tabelę (komendy `to-panel` trzech skryptów, jeden commit podglądów, znacznik `work/art-review/migrated-2026-11-01.json`).
6. **Bez SQL** (`sql/2026-11-01-akceptacja-grafik.sql` niezatwierdzony) wszystko działa po staremu przez Discord; podglądy nie trafiają do repo.
7. **Powiększanie** (JP 2026-11-01: „ikony miejsc w panelu muszą się dać powiększyć”): `_admin/admin-art.js` — każdy element z `data-zoom`
   (Grafiki, Ikony: opublikowane i kandydaci Commons, karta przystanku) otwiera podgląd 512 px na szachownicy; Esc, ←/→ w obrębie listy, „otwórz plik ↗”.
