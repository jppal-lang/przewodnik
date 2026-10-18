-- Panel admina v5 (JP 2026-10-18): szkice jak sklep z filtrami (kraj, status, skorowidz A–Z) + wersje wycieczki w zakładkach.
--   admin.admin_trips              — jedna wycieczka (miasto) = jeden wiersz: nazwa PL, kraj, region, najnowsza wersja,
--                                    szkic / wersja opublikowana, liczba wersji, uwagi w poprawce i niewysłane.
--                                    Bez tego widoku panel też działa (składa listę z admin_queue i admin_versions),
--                                    ale nazwy miast bez szkicu pokazuje wtedy ze sluga.
--   admin.admin_preview_token(slug) — klucz podglądu szkicu (ten sam, który Hermes podaje w wątku miasta), żeby zakładka
--                                    wersji mogła otworzyć city.html?draft=<klucz>&v=N. Niczego nie tworzy — zwraca NULL,
--                                    gdy miasto nie ma jeszcze klucza.
-- Uwagi do wersji panel bierze z istniejącego admin.draft_comments (kolumna city_version = wersja, przy której JP je napisał).
-- Wymaga trip-drafts.sql, 2026-10-16-draft-comments.sql, 2026-10-17-draft-send-kb-v2.sql. Bezpieczne do powtórzenia.
-- Wykonuje root po `deploy.sh approve` (schemat admin jest poza zasięgiem roli quolino).
BEGIN;

-- ── 1) Lista wycieczek dla panelu ────────────────────────────────────────────
CREATE OR REPLACE VIEW admin.admin_trips AS
WITH last AS (
  SELECT DISTINCT ON (city_slug) city_slug, version, status, created_at, stops_count, content
    FROM public.city_versions
   ORDER BY city_slug, version DESC
)
SELECT l.city_slug,
       coalesce((SELECT t->>'title' FROM jsonb_array_elements(l.content->'city_translations') t
                  WHERE t->>'lang' = 'pl' LIMIT 1), l.city_slug)             AS city_name,
       lower(l.content->'city'->>'country')                                  AS country,
       l.content->'city'->>'region_slug'                                     AS region_slug,
       l.content->'city'->>'bandana_color'                                   AS bandana_color,
       l.version                                                             AS latest_version,
       l.status                                                              AS latest_status,
       l.created_at                                                          AS latest_at,
       l.stops_count,
       (SELECT max(d.version) FROM public.city_versions d WHERE d.city_slug = l.city_slug AND d.status = 'draft')     AS draft_version,
       (SELECT max(p.version) FROM public.city_versions p WHERE p.city_slug = l.city_slug AND p.status = 'published') AS published_version,
       (SELECT count(*) FROM public.city_versions a WHERE a.city_slug = l.city_slug)::int                           AS versions_count,
       (SELECT count(*) FROM public.draft_comments c WHERE c.city_slug = l.city_slug AND c.status IN ('sent', 'seen'))::int AS comments_working,
       (SELECT count(*) FROM public.draft_comments c WHERE c.city_slug = l.city_slug AND c.status = 'new')::int    AS comments_unsent
  FROM last l;
ALTER VIEW admin.admin_trips OWNER TO quolino;
REVOKE ALL ON admin.admin_trips FROM PUBLIC;
GRANT SELECT ON admin.admin_trips TO quolino_admin;

-- ── 2) Klucz podglądu szkicu (tylko odczyt) ─────────────────────────────────
CREATE OR REPLACE FUNCTION admin.admin_preview_token(p_slug text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
  SELECT token FROM public.draft_previews WHERE city_slug = p_slug
$f$;
ALTER FUNCTION admin.admin_preview_token(text) OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.admin_preview_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.admin_preview_token(text) TO quolino_admin;

NOTIFY pgrst, 'reload schema';
COMMIT;
