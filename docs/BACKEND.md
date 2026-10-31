# BACKEND.md — rola: Backend / dane / interakcje

Zakres: Supabase, oceny, zgłoszenia, tłumaczenia (dane), postęp użytkownika,
localStorage. Nie ruszasz: treści, CSS, marketingu.

---

## 1. ARCHITEKTURA — HYBRYDA

Treść = statyczne pliki na GitHub Pages. Interakcje = Supabase REST API przez
`fetch()`. Zero PHP, zero server-side renderingu.

Dlaczego: GitHub Pages darmowy + CDN; Supabase free tier (500 MB, 50k req/mies.);
treść to pliki, baza potrzebna WYŁĄCZNIE do interakcji między użytkownikami.

**Kiedy wdrożyć Supabase: NIE na starcie.** Faza 2, gdy są użytkownicy.

---

## 2. SUPABASE — SCHEMAT

> 2026-10-31: `stop_translations.kids_choice jsonb` (opcjonalne pytanie z wyborem: `{"options": [4], "correct": 0..3}`,
> CHECK `kids_choice_ok`). Szkic: `trip_draft_save` dopisuje pole po `import_city`; tłumaczenia: `trip_export` / `trip_apply_translation`
> (indeks poprawnej z PL); `trip_sample` na liście dozwolonych. SQL z samokontrolą migawki: `_content/claude-skills/sql/2026-10-31-misja-wybor.sql`.

```sql
CREATE TABLE ratings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  city TEXT NOT NULL,
  stop_id TEXT,
  stars SMALLINT CHECK (stars BETWEEN 1 AND 5),
  comment TEXT CHECK (char_length(comment) <= 500),
  fingerprint TEXT NOT NULL,      -- SHA-256: userAgent + resolution + timezone
  lang TEXT DEFAULT 'pl',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(city, stop_id, fingerprint)
);

CREATE TABLE reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  city TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  type TEXT NOT NULL,             -- wrong_price | closed | wrong_hours | wrong_address | other
  message TEXT CHECK (char_length(message) <= 1000),
  email TEXT,
  lang TEXT DEFAULT 'pl',
  status TEXT DEFAULT 'new',      -- new | reviewed | fixed | rejected
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE VIEW city_ratings AS
SELECT city, ROUND(AVG(stars)::numeric,1) AS avg_stars, COUNT(*) AS total_ratings
FROM ratings WHERE stop_id IS NULL GROUP BY city;
```

**RLS:** ratings INSERT+SELECT dla anonimowych; reports INSERT anonimowy,
SELECT tylko admin; zero UPDATE/DELETE dla anonimowych (edycja = UPSERT).

**Klient:** `supabase-client.js` — cienki wrapper na fetch(), klucz anon
publiczny w froncie (bezpieczny). Wzorzec funkcji: submitRating(city, stars,
comment), getCityRatings(city), getFingerprint() przez crypto.subtle.digest.

---

## 3. SYSTEM OCEN

- Faza 1: localStorage per urządzenie, średnie niewidoczne
- Faza 2: tabela ratings + fingerprint; po wystawieniu "Twoja ocena: ★★★★☆ [Edytuj]"
- Wyświetlanie: karta regionu "★ 4.3 (12 ocen)", hero miasta pełna średnia

## 4. ZGŁOSZENIA UWAG

- Faza 1: mailto z tematem `[Uwaga] Perugia > Przystanek 03 Fontana Maggiore`
- Faza 2: tabela reports + agent AI (czyta, sprawdza fakty, generuje PR lub
  taguje do review)

---

## 5. i18n — DANE

13 języków: pl (domyślny, P0), en, it, de (P0) · fr, es, cs, sk, ro, at (P1) ·
hr, el, no (P2). Pliki `lang/{kod}.json`, runtime `i18n.js`:
autodetekcja `navigator.language` → zapis `questini_lang` → DOM swap po
`data-i18n`. Nie tłumaczymy: cen, godzin, telefonów, linków, nazw własnych.

---

## 6. POSTĘP UŻYTKOWNIKA / localStorage (jedyne dozwolone klucze)

Stan z kodu na **2026-10-30** (grep `localStorage` / `sessionStorage` / `indexedDB` w `*.js`, `*.html`, `gra/`, `offline.js`, `sw.js`;
porównane z `cookie-policy.html` li05–li59). Nowy klucz = wpis tutaj ORAZ na stronie `cookie-policy.html`.
Wszystko zostaje na urządzeniu; „usuwa” = kod sam czyści klucz, inaczej klucz żyje do wyczyszczenia danych przeglądarki.

### 6.1 localStorage — strona publiczna

| Klucz | Gdzie (zapis → odczyt) | Co trzyma | Kiedy usuwany |
|---|---|---|---|
| `quolino_lang` | `lang-pick.js`, `i18n-ui.js`, strony (`index`, `country`, `region`, `city`) | kod wybranego języka | nigdy (nadpisywany) |
| `qc.task.<klucz>` | `city.html` → `gra/game.js` (punkty z trasy) | `'1'`/`'0'` misja / zadanie foto odhaczone (`<qcKey>-mission`, `<qcKey>-photo`) | nigdy (odznaczenie zapisuje `'0'`) |
| `qc.pager.<slug>` | `trip-ui.js` | numer ostatniego przystanku w pagerze ≤767 px | nigdy (nadpisywany) |
| `qc.session` | `auth.js` (czyta też `gra/treasure.js`) | sesja rodzica: token, token odświeżania, `at` | wylogowanie / nieudane odświeżenie |
| `qc.access` | `i18n-ui.js` (`QAccess`) → `city.html` (RPC `trip_full`) | klucz dostępu z linku `?k=` | `QAccess.clear()` / pusty klucz |
| `qc.kid.avatar` | `kid-reward.js`, `kid-play.js` | awatar dziecka na dzień — kształt w §6.4 | nadpisywany następnego dnia (stary wpis ignorowany, gdy `date ≠ dziś`) |
| `qc.kid.nicks` | `kid-reward.js` → `konto.html` | lista ksywek, max 8 (bez imion i wieku) | nigdy (przycinana do 8) |
| `qc.kid.sound` | `kid-sound.js` | `'1'`/`'0'` dźwięki w widoku dziecka (domyślnie wyłączone) | nigdy |
| `qc.album` | `kid-reward.js` (`saveAlbum`), `trip-tools.js` (notatka „Przy kolacji”) → `konto.html` | zdobyte miasta — kształt w §6.4 | nigdy (wpisy nadpisywane per `slug`; szkic notatki usuwa wyczyszczenie notatki) |
| `qc.wakelock` | `trip-tools.js` (I-1) | `'1'`/`'0'` „Nie wygaszaj ekranu na trasie” | nigdy (nadpisywany) |
| `qc.daymode.<slug>` | `trip-tools.js` | `{m, d}` — tryb dnia „Upał”/„Deszcz” i data wyboru (ważny dziś i jutro) | powrót do trybu zwykłego usuwa klucz; po terminie ignorowany |
| `qc.parent.shared` | `konto.html` | lista slugów udostępnionych wycieczek (wyzwanie 5 → 5%) | nigdy |
| `qc.parent.codes` | `konto.html` | wpisane kody `QUO-XXXX-XXXX` (na razie podgląd) | nigdy |
| `qc.parent.news` | `konto.html` | zgoda na newsletter | odznaczenie |
| `quolino_client` | `opinion.js`, `report-issue.js` | losowy identyfikator przeglądarki przy ocenie (jeden głos z urządzenia) | nigdy |
| `quolino_rated_<miasto>` | `opinion.js` | wycieczka już oceniona (wartość = ocena) | nigdy |
| `quolino_nostats` | `stats.js` (`?nostats=1/0`) | `'1'` = statystyki wyłączone (JP, testerzy) | `?nostats=0` |
| `quolino_missions:<miasto>` | `kids-view.js` (stare strony `/wlochy/`) | ukończone misje | nigdy |
| `quolino_family`, `quolino_active_player` | `kids-view.js` (stare strony) | pseudonimy graczy i aktywny gracz (bez wieku i zdjęć) | nigdy |
| `quolino_album:<strona>:<nr>` | stare strony `/wlochy/` (`app.js`) | zdjęcia użytkownika | nigdy (tylko na urządzeniu) |
| `quolino_migrated`, `quolino_migration_expiry` | `migrate-storage.js` | jednorazowa migracja z `questini_*` | `quolino_migration_expiry` usuwany po terminie |

### 6.2 localStorage — gra „Quo: Wyprawa” (`gra/`, prefiks `quolino_game_`)

| Klucz | Gdzie | Co trzyma | Kiedy usuwany |
|---|---|---|---|
| `quolino_game_<trasa>` | `game.js` (`loadRecord`) | rekordy i liczba rozgrywek per poziom, np. `quolino_game_frasassi` | nigdy |
| `quolino_game_save_<trasa>` | `game.js` (`saveKey`) | `{ <poziom>: { v, n, sec, playNo, gameT, hearts, power, stats, secs, hid } }` — zapis „Graj dalej” | ukończenie trasy / „Zacznij od nowa” (`clearSave`; pusty obiekt = klucz usunięty) |
| `quolino_game_diff` | `game.js` | ostatni poziom (`easy` / `medium` / `hard`) | nigdy |
| `quolino_game_demo` | `game.js` | `'1'`/`'0'` „Tryb demo” — czytany tylko z `?test=1` | nigdy |
| `quolino_game_hats[_<trasa>]`, `quolino_game_hat[_<trasa>]` | `game.js` (`hatSuffix`: bez przyrostka dla Frasassi) | zdobyte przebrania Quo i założone | nigdy |
| `quolino_game_photos` | `game.js` | zdjęcia z gry (JPEG ok. 30 KB, max 4 na trasę) | nadpisywane (limit) |
| `quolino_game_haptics` | `haptic.js` (P-7) | `'0'` = wibracje wyłączone (brak/`'1'` = włączone) | nigdy |
| `quolino_game_treasure` | `gra/treasure.js` | znalezione skarby `{<trasa>: {at, level}}` — jeden na wycieczkę | nigdy |
| `quolino_game_treasure_pending` | `gra/treasure.js` → `konto.html` | skarby czekające na kupon `[{trip, at}]` (brak sesji / serwer odmówił) | po `claim_game_treasure` w `konto.html`; zostają przy `not_yet`, limicie i błędzie sieci |

### 6.3 sessionStorage, IndexedDB, Cache API

| Klucz / magazyn | Gdzie | Co trzyma | Kiedy usuwany |
|---|---|---|---|
| sessionStorage `quolino_kidmode` | `kids-view.js` (stare strony) | widok dziecka na czas sesji | zamknięcie karty |
| sessionStorage `qc.pt` | `city.html` | `{slug, t}` — token planu z linku od drugiego rodzica (≤ 3 dni) | zamknięcie karty; od razu, gdy serwer odrzuci token |
| sessionStorage `qc.kt` | `city.html` | `{slug, t}` — token widoku dziecka z QR (odświeżenie strony dalej działa) | zamknięcie karty |
| IndexedDB `quolino-offline`, magazyn `trips` | `offline.js` (`QOffline.save/load`) | ostatnio otwarta wersja trasy (odpowiedź RPC), max 12 tras | najstarsze wypadają powyżej 12 |
| Cache API `quolino-static-<V>`, `quolino-img-<V>` | `sw.js` | pliki strony (HTML/JS/CSS) i obrazki (max 500) — tylko własna domena | przy nowym `V` w `sw.js` (aktywacja kasuje stare); obrazki ponad limit |

Panel admina (`_admin/`, nie strona publiczna, poza `cookie-policy.html`): `adm.outbox` (uwagi do szkiców, których API jeszcze nie przyjęło),
`adm.filters` (stan filtrów), `adm.fb` (filtry zgłoszeń: `src`, `cat`, `pri`, `open`), `adm.costMode` (widok kosztów).
Panel admina, **sessionStorage** (tylko na czas karty, `admin-palette.js`, 2026-10-31): `adm.recent` (ostatnio użyte polecenia palety Ctrl+K — lista id, max 8),
`adm.theme` (`dark` / `light` wybrane poleceniem „Ciemny/jasny motyw”; brak = za systemem). Mostek podglądu `preview-bridge.js` na stronie publicznej nic nie zapisuje.

### 6.4 Kształt `qc.kid.avatar` i `qc.album` (2026-10-30)

```js
// qc.kid.avatar — jeden obiekt, ważny w dniu `date` (kid-reward.js pick(); wieczorem można wybrać na jutro: date = jutro)
{ date: 'RRRR-MM-DD', pose: 0-7, color: 0-7, nick: '', small: false,       // pierwsze dziecko; small = „Tryb maluch”
  team: [ { pose, color, nick, small }, … ],                                 // tylko rodzeństwo na jednym telefonie (≥ 2 dzieci)
  turn: 0,                                                                   // indeks w team: „Teraz szuka” (kid-play.js)
  oaths: ['<slug>', …] }                                                     // I-8: trasy z „Obietnicą odkrywcy” złożoną tego dnia

// qc.album — tablica wpisów, jeden na slug
[ { slug, city, country, region, hero, pieces, date: 'RRRR-MM-DD', first: 'RRRR-MM-DD',   // zdobyte miasto (saveAlbum, po ostatniej misji)
    nick, pose, color,                                                       // awatar dziecka z dnia zdobycia
    oath: 'RRRR-MM-DD',                                                      // opcjonalnie: odznaka obietnicy (konto.html: złota plakietka „Odkrywca · data”)
    note: '…', note_date: 'RRRR-MM-DD' },                                    // opcjonalnie: notatka „Przy kolacji” (≤ 600 znaków)
  { slug, pending: true, note, note_date } ]                                 // szkic notatki przed ukończeniem trasy — konto.html go nie pokazuje;
                                                                             // saveAlbum przenosi notatkę do wpisu. Stare from:'dinner' = szkic.
```

Brakuje na `cookie-policy.html` (do dopisania przez rolę, która prowadzi tę stronę): `quolino_game_haptics`,
sessionStorage `qc.kt` i `quolino_kidmode`, przyrostek `_<trasa>` przy `quolino_game_hats` / `quolino_game_hat`.

Punkty dziecka: `punkty = round((ukończone_misje / misje_w_planie) * 10)`, max 10.

**Zakaz:** tracking osób, GA, piksele, cookies śledzące, klucze spoza tabeli.
Statystyki: wyłącznie Umami na własnym serwerze, bez ciasteczek (`docs/STATYSTYKI.md`).
Dane nie opuszczają urządzenia (poza dobrowolnymi ocenami/zgłoszeniami).

---

## 7. COOKIE POLICY

cookie-policy.html (PL; pozostałe języki później): zero trackerów i reklam, lista kluczy z §6, statystyki Umami bez ciasteczek
i bez zapisu IP; czcionki i flagi lokalnie (bez Google Fonts i flagcdn — od 2026-10-30 także w `sw.js`). Bez baneru zgody (nic, co wymagałoby zgody). Link w stopce stron.

---

## 8. ADRESY STRON MIAST (od 2026-10-13)

Strona miasta: `https://quolino.com/{lang}/{kraj}/{region}/{miasto}/`, np. `/pl/it/umbria/assisi/`.
- `{kraj}` = kod ISO 3166-1 alfa-2 małymi literami (`cities.country`), `{region}` = `regions.url_slug`, `{miasto}` = `cities.url_slug`.
- `url_slug` = oryginalna nazwa lokalna, małe litery, bez znaków diakrytycznych, myślniki (`assisi`, `san-gimignano`, `toscana`);
  alfabet nielaciński → nazwa angielska. Ten sam adres we wszystkich językach, język tylko w pierwszym segmencie.
- Wewnętrzne slugi (`cities.slug`, `regions.slug`), wątki Discorda, pliki mediów i `work/` zostają bez zmian.
- Stare adresy dają 301 (jeden skok, z zachowaniem `?k=` i innych parametrów): `/{lang}/{region}/{miasto}/`, `city.html?c=…[&lang=…]`,
  `/wlochy/<region>/<miasto>.html`. `city.html?draft=…` (podgląd szkicu) działa bez zmian. Regiony i kraje zostają pod `region.html?r=`, `country.html?k=`.
- Router, sitemap, canonical, hreflang, og:url i JSON-LD (TouristTrip, BreadcrumbList): `ssr/server.mjs`. Reguła Traefika: `ssr/compose-ssr.yml`.

---

## 9. KUPONY RODZICA — SKARB QUO Z GRY (JP 2026-10-26)

SQL: `_content/claude-skills/sql/2026-10-26-skarb-kupony.sql` (po `deploy.sh approve`). Zasady produktu: `docs/KONTO-RODZICA.md` §6.

- **`public.coupons`** `(id, user_id → auth.users ON DELETE CASCADE, code UNIQUE 'QUO-XXXX-XXXX', percent 1–50, source 'gra',
  trip_slug, created_at, expires_at, used_at, order_ref)`; `UNIQUE (user_id, source, trip_slug)` = jeden kupon z gry na konto na wycieczkę.
  Brak uprawnień dla `web_anon` — tylko przez RPC. RLS: SELECT tylko własnych wierszy (po `sub` z `request.jwt.claims`), bez polityk zapisu.
- **Kupony się nie łączą:** najwyżej jeden kupon na zamówienie. Indeks `coupons_one_per_order` (unikalne `order_ref`) pilnuje tego już dziś;
  przyszłe RPC płatności przyjmuje co najwyżej jeden kod i zużywa go w tej samej transakcji
  (`UPDATE … SET used_at, order_ref WHERE code AND user_id AND used_at IS NULL AND expires_at > now()`, ROW_COUNT = 1). Nie łączy go z kodami `promo_codes`.
- **`POST /rpc/claim_game_treasure {p_trip, p_level, p_token}`** → `{code, percent, expires_at, trip_slug, new}` albo `{error}`:
  `invalid_session` (zły/wygasły token), `not_yet` (przed `ops.app_settings.treasure_from` = 2027-06-01; admin z `ops.member_admins` przechodzi),
  `level` (tylko `trudny`), `not_found` (wycieczka nieopublikowana), `rate_limit` (5 nowych kuponów z gry na konto na dobę).
  Kupon: −30%, ważny 7 dni od wydania, jednorazowy. Ten sam skarb drugi raz zwraca istniejący kupon (`new: false`).
- **`POST /rpc/my_coupons {p_token, p_lang}`** → `{coupons: [{code, percent, source, trip_slug, trip_title, created_at, expires_at, used_at, state}]}`,
  `state` = `active | used | expired`; aktywne pierwsze.
- **Token w treści, nie w nagłówku:** Traefik zdejmuje `Authorization` przed PostgREST, więc jak w `trip_member` strona wysyła
  `Authorization: Bearer <klucz anon>` i `p_token: <token logowania>` w treści; baza sprawdza podpis (`ops.jwt_claims`).
- **Ustawienia i admini:** `ops.app_settings` (`treasure_from`), `ops.member_admins (sub)` — dopisanie JP do testów:
  `INSERT INTO ops.member_admins (sub, note) SELECT id, 'JP' FROM auth.users WHERE email = '…';`

