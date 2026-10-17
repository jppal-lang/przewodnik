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

Stan z kodu na 2026-10-13. Nowy klucz = wpis tutaj ORAZ na stronie `cookie-policy.html`.

| Klucz                             | Cel                                                         |
|-----------------------------------|-------------------------------------------------------------|
| `quolino_lang`                    | wybrany język                                               |
| `qc.task.<klucz zadania>`         | odhaczone misje i zadania foto (album naklejek, `city.html`)|
| `quolino_missions:<miasto>`       | ukończone misje (starsze strony, `kids-view.js`)            |
| `quolino_family`, `quolino_active_player` | pseudonimy graczy (starsze strony, bez wieku i zdjęć) |
| `quolino_album:<strona>:<nr>`     | zdjęcia użytkownika, tylko na urządzeniu                    |
| `quolino_client`                  | losowy numer przeglądarki przy wysyłaniu oceny (`opinion.js`)|
| `quolino_rated_<miasto>`          | wycieczka już oceniona                                      |
| `quolino_nostats`                 | `1` = statystyki wyłączone (JP, testerzy); `?nostats=1/0` w adresie przełącza |
| `quolino_migrated`, `quolino_migration_expiry` | jednorazowa migracja z `questini_*` (`migrate-storage.js`) |
| `qc.pager.<slug>`                 | ostatni przystanek w widoku mobilnym wycieczki (pager ≤767 px, `trip-ui.js`) |
| `qc.kid.avatar`                   | awatar dziecka na dziś `{date,pose,color,nick}` (`kid-reward.js`) |
| `qc.kid.nicks`                    | zapisane nicki dzieci, max 8 (bez imion i wieku)            |
| `qc.album`                        | zdobyte miejsca na tym urządzeniu (zapis po ostatniej misji; czyta `konto.html`) |
| `qc.parent.shared`                | lista slugów udostępnionych wycieczek (wyzwanie 5 → 5%, `konto.html`) |
| `qc.parent.codes`                 | wpisane kody `QUO-XXXX-XXXX` (na razie tylko podgląd, `konto.html`) |
| `qc.parent.news`                  | zgoda na newsletter (`konto.html`)                          |
| `qc.access`                       | klucz dostępu do pełnych wycieczek z linku `?k=` (`i18n-ui.js`; zapis i usunięcie z adresu; czyta `city.html` → RPC `trip_full`) |
| `adm.outbox`                      | panel admina: uwagi do szkiców, których API jeszcze nie przyjęło (`_admin/`, nie strona publiczna) |
| sessionStorage `quolino_kidmode`  | widok dziecka na czas sesji                                 |

Punkty dziecka: `punkty = round((ukończone_misje / misje_w_planie) * 10)`, max 10.

**Zakaz:** tracking osób, GA, piksele, cookies śledzące, klucze spoza tabeli.
Statystyki: wyłącznie Umami na własnym serwerze, bez ciasteczek (`docs/STATYSTYKI.md`).
Dane nie opuszczają urządzenia (poza dobrowolnymi ocenami/zgłoszeniami).

---

## 7. COOKIE POLICY

cookie-policy.html (PL; pozostałe języki później): zero trackerów i reklam, lista kluczy z §6, statystyki Umami bez ciasteczek
i bez zapisu IP, zewnętrzne zasoby (Google Fonts, flagcdn). Bez baneru zgody (nic, co wymagałoby zgody). Link w stopce stron.

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
