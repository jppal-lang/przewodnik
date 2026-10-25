-- 2026-10-25 (JP): wersje wytycznych. Wytyczne = standard treści (docs/TRESC-PRZYSTANKU.md, STANDARD w stop-content-lib.mjs)
-- + aktywne zasady redakcyjne JP (public.editorial_rules). Każda zmiana = nowa wersja (v01, v02, …), zakłada ją gemini-draft.mjs
-- automatycznie (hash treści wytycznych). Wersja szkicu po kontroli i poprawkach dostaje content.guidelines = 'vNN'
-- i content.guidelines_ok (werdykt końcowy). Za dwa lata: filtr „wytyczne starsze niż v51” → co uzupełnić.
-- Bezpieczne do powtórzenia. Wykonuje root (schemat admin).
BEGIN;
CREATE TABLE IF NOT EXISTS public.guideline_versions (
  version    int PRIMARY KEY,
  label      text NOT NULL UNIQUE,          -- v01, v02, …
  hash       text,                          -- skrót treści wytycznych (NULL = uzupełni pierwszy przebieg)
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.guideline_versions OWNER TO quolino;
REVOKE ALL ON public.guideline_versions FROM PUBLIC;
INSERT INTO public.guideline_versions (version, label, hash, note, created_at) VALUES
  (1, 'v01', 'stara-wersja', 'standard treści przystanku: bloki legenda / ciekawostka / popkultura / fun fact z przypisami (JP 2026-10-18)', '2026-10-18'),
  (2, 'v02', NULL, 'nowy proces (Gemini + kontrola Claude); ciekawostka i fun fact „z przymrużeniem oka” — jedno źródło (JP 2026-10-24)', '2026-10-24')
ON CONFLICT (version) DO NOTHING;

CREATE OR REPLACE VIEW admin.guideline_versions AS SELECT version, label, note, created_at FROM public.guideline_versions;
ALTER VIEW admin.guideline_versions OWNER TO quolino;
GRANT SELECT ON admin.guideline_versions TO quolino_admin;

-- lista wycieczek: wersja wytycznych najnowszej wersji (kolumny dopisane na końcu)
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
       l.content->>'workflow'                                                AS workflow,
       l.content->>'guidelines'                                              AS guidelines,
       (l.content->>'guidelines_ok')::boolean                                AS guidelines_ok
  FROM last l;
NOTIFY pgrst, 'reload schema';
COMMIT;
