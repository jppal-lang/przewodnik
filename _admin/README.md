# Panel admina — szkice wycieczek do zatwierdzenia

Widok dla JP: lista szkiców (`city_versions.status = 'draft'`), porównanie z wersją
opublikowaną, przyciski **Zatwierdź i opublikuj** / **Odrzuć szkic**.

- Front: `_admin/index.html`, `admin.js`, `admin.css` (rola Frontend).
- API, baza, kontenery: **rola Backend** — poniżej kontrakt i propozycja.
- Decyzja JP 2026-10-07: panel **tylko na VPS, bez publicznego adresu** (tunel SSH).

Katalog zaczyna się od `_`, więc publicznie go nie ma: nginx strony zwraca 404
dla ścieżek od `_`, GitHub Pages (Jekyll) też je pomija. Nawet gdyby ktoś
zobaczył kod — bez tunelu nie ma czym rozmawiać z bazą.

---

## Jak wejść (JP)

```bash
ssh -N -L 8088:127.0.0.1:8088 root@srv1984679.hstgr.cloud
```

Potem w przeglądarce: **http://localhost:8088/_admin/**

Podgląd na danych testowych (bez VPS, przyciski nic nie zapisują): dowolny
lokalny serwer w katalogu repo, np. `python -m http.server`, i adres
`http://localhost:8000/_admin/?demo=1`.

---

## Infrastruktura (Backend) — propozycja

Dwa dodatkowe kontenery w projekcie `quolino-web`, **bez etykiet Traefika**:

```yaml
  admin-api:
    image: postgrest/postgrest:v12.2.3
    environment:
      PGRST_DB_URI: postgres://quolino_admin:${ADMIN_DB_PASS}@postgresql-5bap:5432/quolino
      PGRST_DB_SCHEMAS: admin
      PGRST_DB_ANON_ROLE: quolino_admin
      PGRST_OPENAPI_MODE: disabled
    networks: [default]          # ta sama sieć co baza; bez portów na zewnątrz

  admin-web:
    image: nginx:alpine
    ports: ["127.0.0.1:8088:80"] # tylko localhost VPS → dostęp wyłącznie tunelem
    volumes:
      - ./site:/usr/share/nginx/html:ro      # ten sam checkout repo co strona
      - ./admin-nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on: [admin-api]
```

`admin-nginx.conf`:

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  location = / { return 302 /_admin/; }
  location /api/ { proxy_pass http://admin-api:3000/; }
  location / { try_files $uri $uri/ =404; }
}
```

Front woła **`/api/...`** (ta sama domena — bez CORS, bez sekretów w kodzie).
Zabezpieczeniem jest port związany z `127.0.0.1` i SSH; rola `quolino_admin`
nie ma logowania z zewnątrz (hasło tylko w `.env` na VPS).

---

## Kontrakt API (to, czego używa `admin.js`)

### `GET /api/admin_queue`

Jeden wiersz na szkic czekający na decyzję, od najnowszego.

| pole | typ | uwagi |
|---|---|---|
| `city_slug` | text | |
| `version` | int | numer szkicu |
| `source` | text | `manual` / `import` / `pipeline` / `restore` / `migration` |
| `note` | text | opis z `city_versions.note` |
| `created_at` | timestamptz | |
| `stops_count` | int | przystanki w szkicu |
| `duration` | text | `half_day` / `full_day` ze szkicu |
| `city_name` | text | tytuł PL (z szkicu albo `cities`) |
| `bandana_color` | text | kolor drużyny ze szkicu |
| `published_version` | int / null | null = miasto jeszcze nieopublikowane |
| `published_stops_count` | int / null | |
| `published_duration` | text / null | |

### `GET /api/admin_versions?city_slug=eq.X&select=city_slug,version,status,source,note,created_at,content&order=version.asc`

Od v3 panel pobiera **wszystkie** wersje miasta — z nich liczy wersję każdego przystanku
(„punkt v3” = trzecia zmiana tego przystanku; klucz: `stop_key`, a bez niego nazwa PL).
Widok `admin.admin_versions` już ma te kolumny, nic do zmiany w bazie.

(starsza postać zapytania:)

Pełne migawki (`content` = `city_snapshot()`): szkic i wersja opublikowana do porównania.
Front porównuje przystanki po `stop_key` (gdy pusty — po `id`), teksty po `lang = 'pl'`,
języki po komplecie `stop_translations`.

### `POST /api/rpc/admin_approve` — `{ "p_slug", "p_version", "p_note" }`

1. Wersja musi istnieć i mieć status `draft` (inaczej błąd: „szkic już rozpatrzony”).
2. Odmowa, gdy szkic nie ma przystanków (front też blokuje przycisk).
3. Tabele na żywo ← treść szkicu (bieżący stan najpierw do historii jako `archived`).
4. `publish_city(slug, true)`.
5. Ten wiersz szkicu → `published` (`published_at`, `reviewed_at`, `review_note = p_note`);
   poprzedni `published` → `archived`. Bez dodatkowej kopii tej samej treści.
6. Zwraca `{ city_slug, version, status: 'published' }`.

### `POST /api/rpc/admin_reject` — `{ "p_slug", "p_version", "p_reason" }`

Szkic → `rejected` (`reviewed_at`, `review_note = p_reason`). Strona bez zmian.
Zwraca `{ city_slug, version, status: 'rejected' }`.

Błędy: zwykły format PostgREST (`message`) — front pokazuje go pod przyciskami.

---

---

## Lista z filtrami + wersje w zakładkach (od v5, 2026-10-18)

Lista jak w sklepie: kolumna filtrów (kraj, status, uwagi, wyszukiwarka; na telefonie zwinięta nad wynikami),
skorowidz A–Z, wyniki w grupach krajów, w kraju alfabetycznie — bez poziomu regionu (jak fora na Discordzie).
Stan filtrów: `localStorage` klucz `adm.filters` (tylko wygoda). `adm.outbox` bez zmian.

Wycieczka (`#/<miasto>`, starsza wersja `#/<miasto>/v<N>`): jedna zakładka na wersję, najnowsza pierwsza. Zakładka
pokazuje uwagi wysłane do tej wersji (`draft_comments.city_version`) i link „Podgląd vN na stronie”
(`city.html?draft=<klucz>&v=N`). Uwagi wpisuje się i wysyła tylko w najnowszej wersji, gdy jest szkicem; starsze — tylko podgląd.

- `GET /api/admin_trips?order=city_slug.asc` — jeden wiersz na miasto (`city_name`, `country`, `region_slug`, `latest_version`,
  `latest_status`, `draft_version`, `published_version`, `versions_count`, `comments_working`, `comments_unsent`).
  Bez widoku panel składa listę z `admin_queue` + `admin_versions` (nazwy miast bez szkicu wtedy ze sluga).
- `POST /api/rpc/admin_preview_token {p_slug}` → klucz podglądu albo `null`. Bez funkcji — brak linku do podglądu.
- SQL: `_content/claude-skills/sql/2026-10-18-admin-wersje.sql` (wymaga approve).

## Wyślij uwagi do poprawki + baza wiedzy (od v4, 2026-10-17)

Uwaga wpisana przy polu i zatwierdzona Enterem jest **zapisana** (`new`), ale Hermes jeszcze jej nie poprawia.
Pod listą uwag (sekcja „Uwagi do wysłania” na dole szkicu i w przyklejonym menu przystanków) jest przycisk
**„Wyślij uwagi do poprawki (N)”**. Wywołuje `POST /api/rpc/admin_send_comments {p_slug, p_version}`. Wszystkie
uwagi `new` miasta przechodzą w `sent` i trafiają do jednej prośby w `draft_revision_requests`. Hermes poprawia
je razem w jednej nowej wersji szkicu.

Po stronie Hermesa (`bin/draft-comments.mjs`, cron co 3 min): prośba `new` → `working` → nowa wersja szkicu przez
`trip-revise` (kontrola, link do podglądu w wątku miasta) → prośba `done` z `result_version`, uwagi `done` z odpowiedzią
przy polu. Panel pokazuje statusy: wysłana do poprawki → Hermes poprawia → poprawione (v N). Chwilowy błąd modelu =
prośba wraca do kolejki; trwały = uwagi „odrzucona” z powodem.

Reguły w bazie wiedzy to istniejąca tabela Hermesa `public.editorial_rules` (zakresy: quest, opis, fakty, praktyczne,
plan-dnia, ton, struktura, inne). Reguły, które Hermes zapamiętuje z poprawek, od razu obowiązują (tak działał od 11.10);
w panelu można je wyłączyć albo poprawić. `status` i `active` są zsynchronizowane wyzwalaczem.

Przycisk **„Baza wiedzy redakcji”** pod kolejką pokazuje reguły z uwag (`GET /api/editorial_rules`):
- reguły do zatwierdzenia można poprawić i zatwierdzić (`rpc/admin_rule_decide`);
- obowiązujące reguły można wyłączyć;
- własną regułę dodaje się przez `rpc/admin_rule_add`.

Opis całości: `docs/BAZA-WIEDZY.md`. SQL: `_content/claude-skills/sql/2026-10-17-draft-send-kb-v2.sql`.

## Uwagi do szkiców → Hermes (od v3, 2026-10-16)

Przy każdym polu szkicu (opis miasta, każde pole każdego przystanku, „cały przystanek”, „cała
wycieczka”) JP wpisuje uwagę i wysyła ją Enterem. Uwaga trafia do tabeli, z której Hermes ją odbiera,
poprawia szkic i odpisuje. Panel odświeża uwagi co 30 s i pokazuje odpowiedź Hermesa przy polu.
Przyklejone menu przystanków liczy otwarte uwagi (`new`, `seen`) per przystanek.

Gdy tabeli jeszcze nie ma, panel zapisuje uwagi w przeglądarce (`localStorage` klucz `adm.outbox`)
i wysyła je sam przy następnym otwarciu szkicu, kiedy API zacznie je przyjmować.

### `GET /api/draft_comments?city_slug=eq.X&order=created_at.asc`
### `POST /api/draft_comments` — `{ city_slug, city_version, stop_key, stop_version, field, field_label, body }`

| Pole | Znaczenie |
|---|---|
| `city_version` | wersja szkicu, przy której JP napisał uwagę |
| `stop_key` | przystanek (`null` = miasto / cała wycieczka) |
| `stop_version` | „punkt vN” w chwili pisania uwagi |
| `field` | `city.<kolumna>`, `stop.<kolumna>` albo `null` (uwaga ogólna) |
| `status` | `new` → `seen` (Hermes czyta) → `done` (poprawione) albo `rejected` (z powodem w `hermes_reply`) |
| `hermes_reply`, `resolved_in_version` | odpowiedź Hermesa i wersja szkicu z poprawką |

### SQL (rola Backend, wdraża Hermes po `approve` JP)

```sql
BEGIN;
CREATE TABLE IF NOT EXISTS public.draft_comments (
  id bigserial PRIMARY KEY,
  city_slug text NOT NULL,
  city_version int NOT NULL,
  stop_key text,
  stop_version int,
  field text,
  field_label text,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'seen', 'done', 'rejected')),
  hermes_reply text,
  resolved_in_version int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS draft_comments_city ON public.draft_comments (city_slug, status);
ALTER TABLE public.draft_comments OWNER TO quolino;

CREATE OR REPLACE VIEW admin.draft_comments AS SELECT * FROM public.draft_comments;
ALTER VIEW admin.draft_comments OWNER TO quolino;
GRANT SELECT ON admin.draft_comments TO quolino_admin;
GRANT INSERT (city_slug, city_version, stop_key, stop_version, field, field_label, body) ON admin.draft_comments TO quolino_admin;

-- Hermes nasłuchuje (LISTEN draft_comment) albo odpytuje co minutę status = 'new'
CREATE OR REPLACE FUNCTION public.draft_comments_notify() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN PERFORM pg_notify('draft_comment', NEW.city_slug || ':' || NEW.id); RETURN NEW; END $f$;
DROP TRIGGER IF EXISTS draft_comments_notify ON public.draft_comments;
CREATE TRIGGER draft_comments_notify AFTER INSERT ON public.draft_comments FOR EACH ROW EXECUTE FUNCTION public.draft_comments_notify();
COMMIT;
```

### Jak Hermes obsługuje uwagi

1. Nowe uwagi → `status='seen'`, krótka informacja w wątku miasta na Discordzie (przystanek, pole, treść).
2. Czeka ok. 5 min od ostatniej uwagi JP do tego miasta (JP zwykle pisze kilka naraz), potem robi
   **jedną** nową wersję szkicu z poprawkami wszystkich uwag (`city_version_save(..., 'draft', 'uwagi #12, #13', 'pipeline')`).
   Poprzedni szkic tego miasta odrzuca z notatką „zastąpiony przez vN”.
3. Każdą uwagę zamyka: `status='done'`, `hermes_reply` (co zmienił, jednym zdaniem), `resolved_in_version`.
   Gdy się nie zgadza albo nie może poprawić (np. brak źródła) — `status='rejected'` i powód w `hermes_reply`.
4. Uwaga, która dotyczy zasady, a nie jednego miejsca (np. „misje za trudne dla 6-latka”), trafia też jako
   reguła do TRIP-WRITING-SKILL, żeby błąd nie wracał w kolejnych wycieczkach.

## SQL — szkic dla roli Backend (nie uruchamiać bez przeglądu)

```sql
BEGIN;
-- status „odrzucony” i ślad decyzji
ALTER TABLE public.city_versions DROP CONSTRAINT IF EXISTS city_versions_status_check;
ALTER TABLE public.city_versions ADD CONSTRAINT city_versions_status_check
  CHECK (status IN ('draft','published','archived','rejected'));
ALTER TABLE public.city_versions ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE public.city_versions ADD COLUMN IF NOT EXISTS review_note text;

CREATE SCHEMA IF NOT EXISTS admin;
-- CREATE ROLE quolino_admin LOGIN PASSWORD '…';   -- hasło z .env
GRANT USAGE ON SCHEMA admin TO quolino_admin;

CREATE OR REPLACE VIEW admin.admin_queue AS
SELECT d.city_slug, d.version, d.source, d.note, d.created_at, d.stops_count,
       d.content->'city'->>'duration_type' AS duration,
       coalesce((SELECT t->>'title' FROM jsonb_array_elements(d.content->'city_translations') t
                  WHERE t->>'lang' = 'pl' LIMIT 1), d.city_slug) AS city_name,
       d.content->'city'->>'bandana_color' AS bandana_color,
       p.version AS published_version, p.stops_count AS published_stops_count,
       p.content->'city'->>'duration_type' AS published_duration
  FROM public.city_versions d
  LEFT JOIN public.city_versions p ON p.city_slug = d.city_slug AND p.status = 'published'
 WHERE d.status = 'draft'
 ORDER BY d.created_at DESC;

CREATE OR REPLACE VIEW admin.admin_versions AS
SELECT city_slug, version, status, content FROM public.city_versions;

CREATE OR REPLACE FUNCTION admin.admin_reject(p_slug text, p_version int, p_reason text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  UPDATE city_versions SET status = 'rejected', reviewed_at = now(), review_note = p_reason
   WHERE city_slug = p_slug AND version = p_version AND status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'Szkic % v% nie czeka na decyzję', p_slug, p_version; END IF;
  RETURN json_build_object('city_slug', p_slug, 'version', p_version, 'status', 'rejected');
END $f$;

-- admin.admin_approve(p_slug text, p_version int, p_note text DEFAULT NULL) RETURNS json
--   SECURITY DEFINER, wg kroków 1–6 powyżej. Krok 3 to dziś treść city_version_restore()
--   bez końcowego city_version_save() — najlepiej wydzielić ją do wspólnej funkcji
--   (np. city_load_snapshot(slug, jsonb)), żeby restore i approve jej używały.

GRANT SELECT ON admin.admin_queue, admin.admin_versions TO quolino_admin;
GRANT EXECUTE ON FUNCTION admin.admin_reject(text, int, text) TO quolino_admin;
-- GRANT EXECUTE ON FUNCTION admin.admin_approve(text, int, text) TO quolino_admin;
COMMIT;
```

Do ustalenia przez Backend: pipeline Hermesa i `import_city` mają zapisywać wyniki
jako `draft` (to już jest na liście w `docs/BACKEND.md`) — wtedy trafiają do tej kolejki
same.
