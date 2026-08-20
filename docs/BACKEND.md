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
Do tego czasu zgłoszenia przez `mailto:kontakt@questini.com`.

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

| Klucz                          | Cel                    |
|--------------------------------|------------------------|
| `questini_lang`                | wybrany język          |
| `questini_view`                | rodzic / dziecko       |
| `questini_cookie_consent`      | zgoda na localStorage  |
| `album:{strona}:{przystanek}`  | zdjęcia użytkownika    |
| `questini_missions:{miasto}`   | ukończone misje        |

Punkty dziecka: `punkty = round((ukończone_misje / misje_w_planie) * 10)`, max 10.

**Zakaz:** tracking, GA, pixele, cookies śledzące, klucze spoza tabeli.
Dane nie opuszczają urządzenia (poza dobrowolnymi ocenami/zgłoszeniami w f. 2).

---

## 7. COOKIE POLICY

cookie-policy.html — wielojęzyczna, treść: "Zero trackerów, zero reklam
śledzących. Preferencje i zdjęcia zapisujemy lokalnie w przeglądarce."
Baner przy pierwszym wejściu, link w footerze każdej strony.
