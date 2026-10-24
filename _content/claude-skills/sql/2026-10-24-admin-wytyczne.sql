-- 2026-10-24 (JP): panel admina — sortowanie po dacie i znacznik „nowe / stare wytyczne”.
-- admin.admin_trips dostaje kolumnę workflow = content->>'workflow' najnowszej wersji.
-- Nowy proces (Gemini research → szkic PL z blokami i przypisami → kontrola) zapisuje wersję z content.workflow = 'v2'.
-- Wersje bez znacznika panel pokazuje jako „stare wytyczne (archiwum)”.
-- Kolumna dopisana na końcu (wymóg CREATE OR REPLACE VIEW). Bezpieczne do powtórzenia. Wykonuje root (schemat admin).
BEGIN;
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
       (SELECT count(*) FROM public.draft_comments c WHERE c.city_slug = l.city_slug AND c.status = 'new')::int    AS comments_unsent,
       l.content->>'workflow'                                                AS workflow
  FROM last l;
NOTIFY pgrst, 'reload schema';
COMMIT;
