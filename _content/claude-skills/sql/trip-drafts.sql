-- Szkice wycieczek prowadzone w rozmowie (Hermes) + podgląd szkicu na stronie. 2026-10-10, pamięć redakcyjna i fakty 2026-10-11.
--   trip_draft_save()  — zapis szkicu z plików meta/pl.json jako nowej wersji (status draft),
--                        bez dotykania tabel „na żywo” (import w podtransakcji, wycofany po migawce)
--   draft_preview()    — podgląd dla strony (web_anon) wyłącznie z tajnym kluczem miasta
-- Strona na żywo nadal pokazuje tylko wersję opublikowaną.
BEGIN;

-- 1) Wersje szkicu pamiętają pliki źródłowe, listę zmian i werdykt Claude
ALTER TABLE public.city_versions ADD COLUMN IF NOT EXISTS trip    jsonb;   -- {"meta": …, "content": …} (format quolino-trip-writing)
ALTER TABLE public.city_versions ADD COLUMN IF NOT EXISTS changes jsonb;   -- [{"path","before","after","why"}] względem poprzedniej wersji
ALTER TABLE public.city_versions ADD COLUMN IF NOT EXISTS review  jsonb;   -- werdykt: {"verdict","summary","errors","warnings","facts"}
ALTER TABLE public.city_versions ADD COLUMN IF NOT EXISTS learned jsonb;   -- zasady zapisane z tej poprawki: [{"id","rule","scope","action"}]

-- 1b) Pamięć redakcyjna: zasady nauczone z poprawek JP (Claude rozstrzyga, co jest ogólne)
CREATE TABLE IF NOT EXISTS public.editorial_rules (
  id             serial PRIMARY KEY,
  scope          text NOT NULL DEFAULT 'inne',
  rule           text NOT NULL,
  bad            text,
  good           text,
  why            text,                       -- kontekst, który przesądził o zapisaniu
  origin_city    text,
  origin_version int,
  origin_say     text,                       -- polecenie JP, z którego wyszła
  active         boolean NOT NULL DEFAULT true,
  history        jsonb NOT NULL DEFAULT '[]',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.editorial_rules OWNER TO quolino;
REVOKE ALL ON public.editorial_rules FROM PUBLIC;
CREATE OR REPLACE VIEW admin.editorial_rules AS
  SELECT id, active, scope, rule, bad, good, why, origin_city, origin_version, origin_say, created_at, updated_at
    FROM public.editorial_rules;
ALTER VIEW admin.editorial_rules OWNER TO quolino;
GRANT SELECT ON admin.editorial_rules TO quolino_admin;
ALTER TABLE public.city_versions DROP CONSTRAINT IF EXISTS city_versions_source_check;
ALTER TABLE public.city_versions ADD CONSTRAINT city_versions_source_check
  CHECK (source IN ('manual', 'import', 'pipeline', 'restore', 'migration', 'draft', 'revise'));

-- 2) Klucz podglądu: jeden na miasto, stały dla wszystkich kolejnych szkiców (link w wątku się nie zmienia)
CREATE TABLE IF NOT EXISTS public.draft_previews (
  city_slug  text PRIMARY KEY,
  token      text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.draft_previews OWNER TO quolino;
REVOKE ALL ON public.draft_previews FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.draft_preview_token(p_slug text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE t text;
BEGIN
  INSERT INTO public.draft_previews (city_slug, token)
  VALUES (p_slug, replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  ON CONFLICT (city_slug) DO NOTHING;
  SELECT token INTO t FROM public.draft_previews WHERE city_slug = p_slug;
  RETURN t;
END $f$;

-- 3) Zapis szkicu. Import idzie przez istniejące import_city() w podtransakcji, z której zostaje
--    tylko migawka (zmienne plpgsql przeżywają wycofanie). Numery przystanków z sekwencji są
--    zarezerwowane na stałe, więc zatwierdzenie szkicu (city_load_snapshot) nie zderzy się z niczym.
CREATE OR REPLACE FUNCTION public.trip_draft_save(p_meta jsonb, p_content jsonb, p_note text DEFAULT NULL,
    p_source text DEFAULT 'draft', p_changes jsonb DEFAULT '[]', p_review jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE v_slug text := p_meta->'city'->>'slug'; snap jsonb; v int; v_prev int; tok text;
BEGIN
  IF v_slug IS NULL OR v_slug !~ '^[a-z0-9-]+$' THEN RAISE EXCEPTION 'Szkic: brak lub zły city.slug (%)', v_slug; END IF;
  IF coalesce(p_content->>'lang', 'pl') <> 'pl' THEN RAISE EXCEPTION 'Szkic powstaje po polsku (lang = pl)'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('city_versions:' || v_slug));

  BEGIN
    PERFORM public.import_city(p_meta, p_content);
    snap := public.city_snapshot(v_slug);
    RAISE EXCEPTION USING ERRCODE = 'QD001', MESSAGE = 'wycofanie importu szkicu';
  EXCEPTION WHEN SQLSTATE 'QD001' THEN
    NULL;   -- tabele na żywo wracają do stanu sprzed importu, migawka zostaje w zmiennej
  END;
  IF snap IS NULL OR jsonb_array_length(coalesce(snap->'stops', '[]')) = 0 THEN
    RAISE EXCEPTION 'Szkic % nie ma przystanków po imporcie', v_slug;
  END IF;

  SELECT max(version) INTO v_prev FROM public.city_versions WHERE city_slug = v_slug AND status = 'draft';
  UPDATE public.city_versions SET status = 'archived', review_note = coalesce(review_note, 'zastąpiony nowszym szkicem')
   WHERE city_slug = v_slug AND status = 'draft';
  SELECT coalesce(max(version), 0) + 1 INTO v FROM public.city_versions WHERE city_slug = v_slug;
  INSERT INTO public.city_versions (city_slug, version, status, source, note, content, trip, changes, review)
  VALUES (v_slug, v, 'draft', p_source, p_note, snap,
          jsonb_build_object('meta', p_meta, 'content', p_content), coalesce(p_changes, '[]'), p_review);
  tok := public.draft_preview_token(v_slug);
  RETURN jsonb_build_object('city_slug', v_slug, 'version', v, 'replaced', v_prev,
    'stops', jsonb_array_length(snap->'stops'), 'token', tok);
END $f$;

-- Ostatni szkic (albo wskazana wersja) w formacie plików — dla trip-revise
CREATE OR REPLACE FUNCTION public.trip_draft_get(p_slug text, p_version int DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE AS $f$
  SELECT jsonb_build_object('city_slug', city_slug, 'version', version, 'status', status, 'trip', trip, 'review', review)
    FROM public.city_versions
   WHERE city_slug = p_slug AND trip IS NOT NULL AND (p_version IS NULL OR version = p_version)
   ORDER BY (status = 'draft') DESC, version DESC
   LIMIT 1
$f$;

-- 4) Podgląd dla strony: tylko z kluczem. Bez źródeł redakcyjnych i bez plików roboczych.
CREATE OR REPLACE FUNCTION public.draft_preview(p_token text, p_version int DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE v_slug text; cv public.city_versions; pub int; hist jsonb; c jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) < 24 THEN RETURN NULL; END IF;
  SELECT city_slug INTO v_slug FROM public.draft_previews WHERE token = p_token;
  IF v_slug IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO cv FROM public.city_versions
   WHERE city_slug = v_slug AND (CASE WHEN p_version IS NULL THEN status = 'draft' ELSE version = p_version END)
   ORDER BY version DESC LIMIT 1;
  IF cv.id IS NULL THEN   -- brak szkicu w toku → ostatnia wersja z plikami szkicu
    SELECT * INTO cv FROM public.city_versions WHERE city_slug = v_slug AND trip IS NOT NULL ORDER BY version DESC LIMIT 1;
  END IF;
  IF cv.id IS NULL THEN RETURN NULL; END IF;
  SELECT version INTO pub FROM public.city_versions WHERE city_slug = v_slug AND status = 'published';

  c := cv.content;
  c := jsonb_set(c, '{stops}', coalesce((SELECT jsonb_agg(s - 'sources') FROM jsonb_array_elements(c->'stops') s), '[]'));

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'version', h.version, 'status', h.status, 'source', h.source, 'note', h.note,
           'created_at', h.created_at, 'stops', h.stops_count, 'review_note', h.review_note,
           'changes', coalesce(h.changes, '[]'), 'learned', coalesce(h.learned, '[]'),
           'verdict', h.review->>'verdict', 'summary', h.review->>'summary',
           'errors', coalesce(jsonb_array_length(h.review->'errors'), 0),
           'warnings', coalesce(jsonb_array_length(h.review->'warnings'), 0))
         ORDER BY h.version DESC), '[]')
    INTO hist
    FROM (SELECT * FROM public.city_versions WHERE city_slug = v_slug ORDER BY version DESC LIMIT 40) h;

  RETURN jsonb_build_object('city_slug', v_slug, 'version', cv.version, 'status', cv.status,
    'created_at', cv.created_at, 'note', cv.note, 'published_version', pub,
    'latest_draft', (SELECT max(version) FROM public.city_versions WHERE city_slug = v_slug AND status = 'draft'),
    'review', CASE WHEN cv.review IS NULL THEN NULL ELSE jsonb_build_object(
        'verdict', cv.review->'verdict', 'summary', cv.review->'summary',
        'errors', coalesce(cv.review->'errors', '[]'), 'warnings', coalesce(cv.review->'warnings', '[]'),
        'facts', cv.review->'facts') END,
    'content', c, 'history', hist);
END $f$;

-- 5) Uprawnienia: zapis tylko quolino (Hermes), podgląd publicznie przez RPC z kluczem
ALTER FUNCTION public.draft_preview_token(text) OWNER TO quolino;
ALTER FUNCTION public.trip_draft_save(jsonb, jsonb, text, text, jsonb, jsonb) OWNER TO quolino;
ALTER FUNCTION public.trip_draft_get(text, int) OWNER TO quolino;
ALTER FUNCTION public.draft_preview(text, int) OWNER TO quolino;
REVOKE ALL ON FUNCTION public.draft_preview_token(text), public.trip_draft_save(jsonb, jsonb, text, text, jsonb, jsonb),
  public.trip_draft_get(text, int), public.draft_preview(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.draft_preview_token(text), public.trip_draft_save(jsonb, jsonb, text, text, jsonb, jsonb),
  public.trip_draft_get(text, int) TO quolino;
GRANT EXECUTE ON FUNCTION public.draft_preview(text, int) TO web_anon;

-- panel admina widzi też zmiany i werdykt
CREATE OR REPLACE VIEW admin.admin_versions AS
SELECT city_slug, version, status, source, note, created_at, published_at, reviewed_at, review_note, content, changes, review
  FROM public.city_versions;
ALTER VIEW admin.admin_versions OWNER TO quolino;
GRANT SELECT ON admin.admin_versions TO quolino_admin;

NOTIFY pgrst, 'reload schema';
COMMIT;
