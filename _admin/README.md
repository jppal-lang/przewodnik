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

### `GET /api/admin_versions?city_slug=eq.X&version=in.(N,M)&select=city_slug,version,status,content`

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
