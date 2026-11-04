-- 2026-11-04 (JP): martwy link nie może trafić do rodziny, a JP nie dostaje o niego pytań.
--   • ops.link_fixes: zastępczy adres znaleziony automatem na stronie głównej (muzeum zmieniło /cennik na /oferta) albo NULL;
--   • public.dead_links (dla strony, web_anon): adresy, których ostatnie sprawdzenie dało 404/410, przekierowanie podstrony na
--     stronę główną albo brak odpowiedzi dwa razy z rzędu — z zastępczym adresem, jeśli jest. Link, który znów działa, znika z listy sam.
-- Link zostaje w treści trasy jako archiwalny (na moment pisania działał); strona po prostu go nie pokazuje albo podmienia.
BEGIN;
CREATE TABLE IF NOT EXISTS ops.link_fixes (
  url       text PRIMARY KEY,
  new_url   text CHECK (new_url IS NULL OR new_url ~ '^https?://'),
  how       text,                           -- 'home-page-match' | 'home' | 'none'
  found_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ops.link_fixes OWNER TO quolino;
REVOKE ALL ON ops.link_fixes FROM PUBLIC;

CREATE OR REPLACE VIEW public.dead_links AS
WITH last AS (
  SELECT url, status, final_url, checked_at,
         row_number() OVER (PARTITION BY url ORDER BY checked_at DESC) AS rn
    FROM public.link_checks
), cur AS (
  SELECT a.url, a.status, a.final_url, b.status AS prev_status
    FROM last a LEFT JOIN last b ON b.url = a.url AND b.rn = 2
   WHERE a.rn = 1
)
SELECT c.url, f.new_url, c.status
  FROM cur c LEFT JOIN ops.link_fixes f ON f.url = c.url
 WHERE c.status IN (404, 410)
    OR ((coalesce(c.status, 0) = 0 OR c.status >= 500) AND c.prev_status IS NOT NULL AND (c.prev_status = 0 OR c.prev_status >= 500 OR c.prev_status IN (404, 410)))
    OR (c.status < 400 AND c.final_url ~ '^https?://[^/]+/?$' AND c.url !~ '^https?://[^/]+/?$');
ALTER VIEW public.dead_links OWNER TO quolino;
REVOKE ALL ON public.dead_links FROM PUBLIC;
GRANT SELECT ON public.dead_links TO web_anon;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'quolino_admin') THEN EXECUTE 'GRANT SELECT ON public.dead_links TO quolino_admin'; END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
