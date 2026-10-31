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

## Sortowanie po dacie + znacznik wytycznych (od v14, 2026-10-24)

- **Sortuj:** „Najnowsze zmiany” (domyślnie), „Najstarsze zmiany” — płaska lista po dacie najnowszej wersji (data i godzina na karcie);
  „Kraj, potem A–Z” — dawny układ w grupach krajów. Wybór zapamiętany w `adm.filters`.
- **Wytyczne:** karta ma znacznik „nowe wytyczne” tylko wtedy, gdy najnowsza wersja ma `content.workflow = 'v2'`.
  Ustawia go wyłącznie nowy proces (Gemini research → szkic PL z blokami i przypisami → kontrola Claude). Wszystko bez znacznika
  = „stare wytyczne (archiwum)” (decyzja JP 2026-10-20: wszystkie dotychczasowe treści do archiwum, bez wyjątków).
- SQL: `_content/claude-skills/sql/2026-10-24-admin-wytyczne.sql` (kolumna `workflow` w `admin.admin_trips`). Bez niego panel
  działa, a wszystkie trasy pokazuje jako stare.

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

### Referencja do ikony Quo (2026-10-30) — `docs/IKONY-MIEJSC.md` §6

- `GET ../media/icons/place-candidates/<trasa>.json` — kandydaci zdjęć z Commons (plik w repo, robi go `bin/place-candidates.mjs`).
- `GET /api/icon_refs?trip=eq.<trasa>` — wybór JP (`stop_key`, `mode` = `pick` | `auto`, `files`).
- `POST /api/rpc/admin_icon_refs_set` — `{ p_trip, p_stop_key, p_files }`: 1–2 tytuły `File:…` = wybór, `[]` = automat, `null` = brak decyzji.
  SQL: `_content/claude-skills/sql/2026-10-30-icon-refs.sql`. Tryb demo: przykładowi kandydaci z lokalnych obrazów.
- Od 2026-10-31 (`docs/IKONY-MIEJSC.md` §7) w `p_files` także adresy `https://…` (dowolna publiczna strona lub plik; łącznie z Commons najwyżej 2).
  Pole „Własny link do zdjęcia”: Commons/Wikipedia → `File:…`, inny https → adres. Podgląd tylko dla bezpośredniego pliku `.jpg/.png/.webp`
  (`referrerpolicy=no-referrer`). Bez SQL `2026-10-31-icon-refs-linki.sql` baza odrzuca adresy — panel prosi o zatwierdzenie w zakładce Decyzje.

## Skrzynka decyzji (od v36, 2026-10-30) — `#/decyzje`

Wszystko, co czeka na JP, w jednym miejscu; licznik przy „Decyzje” w nagłówku i na stronie startowej (odświeża się co minutę).
SQL: `_content/claude-skills/sql/2026-10-30-skrzynka-decyzji.sql` (ostatni plik zatwierdzany konsolą). Bez niego sekcje pokazują, czego brakuje.

| Sekcja | Odczyt | Decyzja |
|---|---|---|
| Wdrożenia (SQL, ops, cron, SSR, install.sh) | `GET /api/deploy_requests` (pliki, commity, diff) | `rpc/admin_deploy_decide {p_id, p_decision: approve\|reject\|cancel}` |
| Zgody na koszty + budżet miesiąca | `GET /api/cost_requests`, `GET /api/ai_budget` | `rpc/admin_cost_decide {p_id, p_decision: approve\|reject}`, `rpc/admin_setting_set {p_name: 'ai_budget_month_usd', p_value}` |
| Ustalenia strażników | `rpc/admin_watch_open {}` → `{ready, decide, rows}` (tabela `ops.watch_findings` z `2026-10-30-straznicy.sql`) | `rpc/admin_watch_decide {p_id, p_decision: accept\|reject\|recheck, p_note}` (funkcja z pliku strażników) |
| Szkice tras | `GET /api/decision_drafts` (czerwone flagi = `review.errors`) | w widoku trasy (link) |
| Zdjęcia do ikon | `media/icons/place-candidates/<trasa>.json` + `GET /api/icon_refs` | „Automat dla wszystkich” = `rpc/admin_icon_refs_set` z `[]`; wybór zdjęć w widoku trasy |

- **Wdrożenie przyciskiem:** `ops/deploy.sh` (cron co 2 min) przy zmianach wymagających zgody wpisuje prośbę `pending` (jedną na zestaw
  zmian; nowe zmiany wymagające zgody → nowa prośba, stara `superseded`). „Zatwierdź i wdróż” (dwa kliknięcia) → `approved` → najbliższy
  przebieg robi to samo co `deploy.sh approve <hash>` i zapisuje wynik (`done`/`failed` + ostatnie linie, widać w „Ostatnie decyzje”).
  Zanim serwer zacznie, można „Cofnij zatwierdzenie”. Konsola zostaje drogą awaryjną.
- **Zgoda na koszt:** Claude dodaje `_content/jobs/<nazwa>.json` z `"needs_jp": true` (oraz `title`, `why`, `est_usd`, `est_limit`);
  `repo-jobs.mjs` wpisuje prośbę `pending` i czeka; po „Zgoda” wykonuje payload z bazy (to, co JP widział). `jp_ok` działa dalej awaryjnie.
- Tryb demo (`?demo=1`) ma przykładowe pozycje każdego rodzaju; decyzje zmieniają tylko dane w przeglądarce.

## Pulpit i nawigacja (od v43, 2026-10-31) — centrum dowodzenia

Decyzja JP 2026-10-31: panel ma być ładniejszym, nowoczesnym dashboardem do zarządzania całym projektem. Kontrakt z API bez zmian.

- **Nawigacja:** boczny pasek (desktop ≥ 900 px) — Pulpit `#/`, Trasy `#/trasy`, Decyzje `#/decyzje` (licznik), Strażnicy `#/straznicy`,
  Ikony `#/ikony`, Postęp prac, Zgłoszenia, Koszty AI, Baza wiedzy, Statystyki ↗; na telefonie dolny pasek + menu „Więcej”.
  Nagłówek z nazwą sekcji; w trasie okruszki Trasy › kraj › region › miasto. `#/straznicy` i `#/ikony` to sekcje skrzynki decyzji.
- **Pulpit:** liczby (do decyzji, szkice, w pracy, opublikowane) · „Czeka na Ciebie” (szkice z czerwonymi flagami, wdrożenia, koszty,
  strażnicy, zdjęcia ikon z terminem) · „Uwagi wysłane do poprawki” (`GET /api/draft_revision_requests?order=id.desc&limit=12`
  + `GET /api/draft_comments?select=*&request_id=not.is.null`: w kolejce / Hermes nanosi / naniesione w vN / nieudane;
  po SQL `2026-10-31-weryfikacja-uwag.sql`: `verify` prośby (jsonb: applied, total, ready, pending_ai, new_errors) albo `verify_status` uwag → „gotowa do akceptacji” / „x z y naniesionych”)
  · tabela tras z etapem szkic → kontrola → do akceptacji → opublikowana (z `pipeline_runs` i próśb o poprawkę), wersja, data, flagi
  (`decision_drafts.red_flags`), języki (gdy `admin_trips` ma kolumnę `langs text[]`) · Serwer · Strażnicy · Koszty AI (dziś / 7 dni
  z `ai_usage_daily?day=gte.…`, budżet z `ai_budget`) · Statystyki ↗.
- **Podgląd serwera:** panel próbuje raz `POST /api/rpc/ops_status {}`. Dziś funkcja jest tylko w schemacie `public` (gość API strony),
  więc w panelu jej nie ma — kafelek Serwer pokazuje wtedy ostatnie wdrożenie z `deploy_requests` i kolejkę z `pipeline_*`, bez crona,
  blokad i czasu przebiegów strażników. Włączenie: wrapper `admin.ops_status()` (SECURITY DEFINER, `GRANT EXECUTE … TO quolino_admin`).
- **Trasa:** przyklejony pasek akcji pod nagłówkiem — wersja, „Porównaj z”, flagi (następna, „Przyjmij wszystkie rekomendacje”),
  „Wyślij uwagi do poprawki”, „Zatwierdź i opublikuj” / „Odrzuć szkic” (na telefonie zostaje dolny pasek decyzji). Spis przystanków z boku ≥ 1200 px.
- **Wygląd:** jasny i ciemny motyw (`prefers-color-scheme`), tokeny z `styles.css` przemapowane w `.adm`; statusy kolorem + słowem + ikoną.

## Widok trasy v2 (od v45, 2026-10-31) — miejsce pracy redaktora

JP: „menu fajne, ale przegląd wycieczki słaby”. Ten sam kontrakt API, ta sama logika flag/uwag/porównania/ikon/decyzji.
- **Jeden nagłówek** (przyklejony na desktopie): nazwa, kraj · region, status, menu „Wersja” (vN · data · status; zamiast zakładek) i „Porównaj z”,
  jedyny przycisk „Zatwierdź i opublikuj” (licznik nierozstrzygniętych flag; przy flagach potwierdzenie mówi, ile zostało) i menu ⋯:
  Odrzuć szkic, notatka do wersji, cała trasa w Google Maps, otwórz na stronie, podgląd wersji (gość / zalogowany / dziecko).
- **Gotowość do publikacji:** flagi x/y, walidator (`review.errors/warnings`), Twoje uwagi do wysłania, ostatnia paczka uwag z weryfikacją
  (`GET /api/draft_revision_requests?city_slug=eq.X`, `verify`), zdjęcia do ikon x/y, tłumaczenia. Każda pozycja prowadzi do miejsca.
- **Spis przystanków** z lewej (pełne nazwy, ikona, kropka: nowy/zmieniony/usunięty, liczniki flag i uwag); na telefonie zwinięty.
- **Widok:** Pola / Rodzic / Dziecko (uproszczony podgląd kolejności i treści z migawki wersji).
- **Przejdź przez flagi:** panel z jedną notatką naraz (ten sam węzeł co popover), „x z y”, Wstecz/Dalej, J/K, 1–4, Enter, Esc;
  na górze „Przyjmij wszystkie rekomendacje” i „Całe grupy uwag naraz”.
- **Twoje uwagi:** jedna szuflada — lista do wysłania, jeden „Wyślij uwagi do poprawki”, paczki z weryfikacją; przy uwadze
  `verify_status` (naniesiona / częściowo / nie naniesiona / nieaktualna). Pole uwagi przy polu to zwarte „＋ Uwaga do pola”.
- **Porównanie:** nakładka na te same karty — zmienione pola z różnicą słów i „skąd zmiana”, „Tylko zmiany”, „Zakończ porównanie”.

## Wygląd narzędzia analitycznego (od v47, 2026-10-31)

JP: „ma być bardziej jak Google Analytics — to narzędzie do pracy”. Tylko język wizualny (Material 3), bez zmian funkcji i API.
Jasnoszare tło, białe karty z ramką 1 px, jeden akcent niebieski, jasny pasek boczny z aktywną pozycją jako pigułka, statusy jako
chipy z ikoną i tekstem. Krój: **Inter** (OFL, lokalnie `media/fonts/inter-latin*-wght-normal.woff2`, licencja `OFL-Inter.txt`), wagi 400/500/600.
Pulpit: KPI z podpisem, wiersze zamiast kolorowych kafli, sortowanie tabeli tras (Trasa, Etap, Zmiana), wykres ekwiwalentu kosztów 7 dni.
Widok trasy: „Gotowość” jako lista wierszy z „Przejdź →”, pola jako „etykieta nad treścią”, panel flag dokowany (v46: przewija treść do pola).

## Telefon obok pól (od v48, 2026-10-31) — `admin-preview.js` / `admin-preview.css`

Zgoda JP 2026-10-31. W widoku trasy (`#/<miasto>[/vN]`) po prawej (≥ 1200 px) stoi ramka telefonu 390 × ~720 px z **prawdziwą stroną
miasta w wersji szkicu** — ten sam mechanizm co „Podgląd wersji” w menu ⋯: `https://quolino.com/city.html?draft=<klucz>&v=N`
(klucz z `rpc/admin_preview_token`, który panel i tak pobiera przy otwarciu trasy; bez funkcji w bazie ramka pokazuje komunikat i link).
Strona quolino.com nie wysyła `X-Frame-Options` ani CSP, więc osadzenie nie wymaga zmian w ops (sprawdzone `curl -sI` 2026-10-31).

- **Rodzic / Dziecko** nad telefonem: przełącza `#city[data-view]` na stronie bez przeładowania (ten sam przycisk co `#qcKidToggle`);
  gdy strona nie ma jeszcze mostka — przeładowanie z `&view=kid`.
- **Sprzężenie dwukierunkowe** (`postMessage`, źródła sprawdzane po obu stronach — tylko `https://admin.quolino.com` ↔ `https://quolino.com`,
  w demo ta sama domena): klik pola / spisu przystanków / krok „Przejdź przez flagi” → strona przewija do przystanku i pola (`data-stop-key`
  w `.qc-stop`, pola po klasach `city.html`) i podświetla 1,5 s (cytat flagi przez CSS Highlight API); klik w przystanek / fragment na telefonie →
  panel przewija do pola i podświetla. Odbiornik na stronie: `preview-bridge.js` (ładowany zawsze, **działa tylko w ramce z dozwolonego źródła**,
  nic nie zapisuje, nie zmienia treści). Protokół opisany w nagłówku tego pliku.
- Tryb demo (`?demo=1`): strona zastępcza składana z migawki wersji (`srcdoc`, klasy `city.html` + `styles.css`), działa bez sieci; mostek ten sam.
- Układ (zasada JP: telefon **nigdy nie leży na treści**): dok po prawej (spis przystanków zwija się do numerów). Z otwartym panelem flag:
  ≥ 1700 px telefon obok panelu; 1300–1699 px prawa kolumna `.tv-rcol` (panel flag u góry, telefon pod nim, kolumna przewijana — `#walk`
  i telefon przenoszone do pojemnika w `.tv`, bo `admin.js` nasłuchuje kliknięć w `#walk` na `#detail`; przenosiny = jedno przeładowanie ramki);
  < 1300 px pigułka „Podgląd” na dole szyny spisu otwiera telefon jako arkusz. Poniżej 1200 px przycisk „Podgląd” w pasku widoku → arkusz;
  ≤ 480 px pełny ekran z „← Wróć do pól”. Test: pole flagi w viewport i `elementFromPoint` w środku pola = element w polu (1300/1440/1750 px).
- Ograniczenia: panel otwarty tunelem na `http://localhost:8088` ma inne źródło niż `admin.quolino.com` — strona wczyta się, ale mostek milczy
  (notka pod ekranem telefonu). Klucz podglądu i tak jest w adresie ramki (jak w linkach „Podgląd vN”).

## Paleta poleceń Ctrl+K / Cmd+K (od v48, 2026-10-31) — `admin-palette.js` / `admin-palette.css`

Przycisk „Szukaj / polecenia” w górnym pasku albo Ctrl+K / Cmd+K. Wyszukiwanie rozmyte (każdy wyraz zapytania musi pasować: prefiks >
początek wyrazu > fragment > podciąg w wyrazie; grupy w kolejności najlepszego trafienia) po:
trasach (nazwa, slug, kraj, region, „spello v2”, „flagi spello”), przystankach bieżącej trasy, wersjach, flagach („flaga 13”), decyzjach
(wdrożenia, koszty), strażnikach, sekcjach panelu (z bocznego paska). Akcje kontekstowe w trasie: Zatwierdź i opublikuj, Odrzuć szkic,
Wyślij uwagi (n), Przyjmij wszystkie rekomendacje, Przejdź przez flagi, Porównaj z …, Zakończ porównanie, Otwórz na stronie, Podgląd na
telefonie rodzic/dziecko; globalnie: Ciemny/jasny motyw. **Akcje nieodwracalne** (zatwierdź, odrzuć, wdrożenie) tylko prowadzą do
istniejącego potwierdzenia (drugie kliknięcie / karta decyzji z fokusem), nie wykonują się z palety.

- Indeks budowany przy każdym otwarciu z `window.ADM.state` i skrzynki decyzji (`ADM.inbox.data`) — zero dodatkowych zapytań.
- Wyniki pogrupowane, ikona, skrót `↵`, strzałki / Enter / Esc / Home / End, Tab krąży po wynikach (pułapka fokusu), fokus wraca do przycisku.
  `role=dialog aria-modal`, `combobox` + `aria-activedescendant`, wiersze ≥ 48 px, tekst 18 px.
- Ostatnio używane na górze (bez zapytania): sessionStorage `adm.recent`; motyw: sessionStorage `adm.theme` + `data-theme` na `<body>`
  (tokeny skopiowane do `admin-palette.css`, bo `prefers-color-scheme` nie da się przełączyć z JS). Oba klucze w `docs/BACKEND.md` §6.3.
- Haki w `admin.js`: `window.ADM` (stan + istniejące funkcje) i zdarzenia `adm:render`, `adm:walk`, `adm:route`.

## Pipeline — centrum dowodzenia (od v49, 2026-10-31) — `#/pipeline`

Zgoda JP 2026-10-31. Plik `admin-pipeline.js` (+ `admin-ext.css`), ładowany przed `admin.js`; w `admin.js` tylko haki
(`window.AdminExt.routes` w `route()`, `window.AdminHost` z narzędziami panelu, mini-pasek w kafelku „Serwer”). Zastępuje „Postęp prac” w menu
(stary widok `#/postep` zostaje jako „Kroki i tokeny przebiegów”).

- **Rząd etapów każdej trasy** (jak GitHub Actions): research → szkic → kontrola źródeł → kontrola (walidator) → uwagi JP → tłumaczenia → publikacja.
  Etap: stan (czeka / w toku / OK / błąd / uwaga / pominięty), czas, koszt („abonament · Gemini 255 tys.” albo USD), wykonawca (Antigravity / Claude / automat / JP).
  Klik → panel boczny: log (kroki `pipeline_events`, końcówki logów zleceń, odpowiedź Hermesa), dane wersji, linki do trasy / szkicu / wersji.
- **Źródła** (każde miękkie): `pipeline_runs` + `pipeline_events` (etapy 1–6 → kolumny 1–4; `kind=revise` → „uwagi JP”), `pipeline_queue`,
  `draft_revision_requests` (+ `verify`), `decision_drafts` (czerwone flagi → „kontrola” = uwaga), `admin_trips` (języki, publikacja, stare wytyczne = etapy 1–4 pominięte),
  `ai_usage_daily` (koszty dziś / 7 dni), `rpc/ops_status` **po zatwierdzeniu `2026-10-31-admin-ops-status.sql`**: `jobs.registry` + `jobs.logs`
  (zlecenia z repo, stany `later`/`failed`, końcówki logów), `queue.open/recent/failed_7d` (ops.jobs: tłumaczenia), `queue.agyQuotaOut/agyWeekCalls` (limit Antigravity), `cron`, `versions`.
- **Bez `admin.ops_status()`** działa: etapy z przebiegów, uwagi JP, kolejka Gemini, koszty, publikacja, języki. Nie ma: crona i blokad, zleceń z repo i ich logów, tłumaczeń z ops.jobs;
  limit Antigravity jest wtedy wnioskowany z komunikatów („Resets in 2h14m”, „czeka na odnowienie limitu”) — panel to zaznacza.
- **Góra:** pierścień Antigravity (zużycie tygodnia ~150 wywołań — ostrożna miara jak w `gemini-queue.mjs`; przy wyczerpaniu odliczanie „odnowi się za 2 h 14 min 05 s”),
  „Czeka na limit / kolejkę” (zlecenia `later`, prośby `new`, ops.jobs `queued`, kolejka Gemini — „ruszy samo”), koszty, cron „przebiegł x min temu” + blokady.
- **Zdarzenia na żywo:** jedna oś czasu (kroki przebiegów, prośby o poprawkę, zlecenia, linie logów); odświeżanie co 30 s różnicowo (nowe `<li>` wchodzą, reszta nietknięta), pauza, gdy kursor/fokus jest nad listą.
- **Zlecenia z błędem:** czerwone z powodem. „Ponów” tylko dla darmowych (`place-candidates.mjs`, `watch.mjs --no-ai`, `ui-translate.mjs`, odczyty) — panel **nie ma RPC kolejkowania**,
  więc pokazuje gotowy JSON do `_content/jobs/<data>-<nazwa>-ponow.json` (repo-jobs.mjs). Płatne (`gemini-draft`, `trip-translate`) — tylko przez zgodę w Decyzjach; ten ekran nic nie zapisuje.
- Tryb demo: `demoPipeline` z admin.js + własne dane (zlecenia, logi, ops.jobs) w `admin-pipeline.js`.

## Mapa projektu (od v50, 2026-10-31) — `#/mapa` + „Mapa przystanków” w trasie

Zgoda JP 2026-10-31. Plik `admin-map.js` (style w `admin-ext.css`); w `admin.js` jeden hak po `drawMap()` w widoku trasy.

- **Europa** z `media/map/europe.js` (te same kształty i rzut co `atlas.js`; `europe.js` doładowywany przy pierwszym wejściu), kolorystyka narzędzia: szare lądy, kraje z trasami ciemniejsze, bez ozdobników.
  Pinezka trasy w kolorze etapu: opublikowana (zielona) / do akceptacji (żółta) / w pracy (niebieska: aktywny przebieg albo otwarta prośba o poprawkę) / odrzucona · archiwum (czerwona); podpis miasta;
  klaster (ciemne kółko z liczbą), gdy pinezki bliżej niż 22 px — klik przybliża. Najechanie/fokus → karta (nazwa, etap, wersja, flagi z `decision_drafts`, języki); klik / Enter → `#/<miasto>`.
- **Filtry** etap + kraj (z licznikami, `localStorage` klucz `adm.mapFilters` — tylko wygoda), lista tras z boku (klik centruje), przyciski + / − / ⤢, Ctrl + kółko, przeciąganie, szczypanie na dotyku,
  klawisze + − strzałki 0.
- **Współrzędne:** `GET /api/admin_versions?select=city_slug,version,lat:content->city->>lat,lon:content->city->>lon,stops:content->stops&order=version.desc` → najnowsza wersja miasta;
  brak `city.lat/lon` → środek przystanków z `lat/lon`; brak w ogóle → lista „Bez współrzędnych” (nic nie zgadujemy). `admin_trips` nie ma lat/lon — gdyby doszło, wystarczy zamienić źródło w `loadCoords()`.
- **Nowe miasto klikiem:** brak RPC/formularza nowej trasy → klik w pustą mapę pokazuje tylko lat/lon (odwrotność rzutu) i podpowiedź (wątek na Discordzie). Zero zapisu.
- **Mapa przystanków** (w karcie „Trasa w skrócie”, pod dotychczasową mapą OSM): przystanki w kolejności, linia przerywana, numery, ikona kategorii z `media/icons`,
  parking = kwadrat, lokale = romb; klik → karta przystanku (godzina, czas na miejscu, cena, rok, współrzędne) z linkiem „Przejdź do pól przystanku”. Bez km i czasów dojazdu.
  Podkład: biała siatka (bez kafli, bez CDN); „Otwórz w Google Maps” dla całej trasy (ten sam link co w menu ⋯). Gdy < 2 przystanki mają współrzędne — schemat kolejności z wyraźną informacją.
- Tryb demo: współrzędne miast i przystanków Spello w `admin-map.js` (`DEMO_CITY`, `DEMO_STOPS`); Zakopane celowo bez współrzędnych.
