-- 2026-11-03: 2026-11-01-nowa-trasa.sql nie wszedł (cała transakcja wycofana, baza bez zmian) — prawdopodobnie samokontrola
-- z testowym wierszem ops.jobs. Ta wersja robi to samo bez ryzykownych kroków:
--   • CHECK workera w ops.jobs przyjmuje 'gemini' (kolejka nowych tras; dotąd tylko hermes/claude/codex),
--   • admin.regions (lista regionów dla okna „Nowa trasa”) — z nazwą PL, gdy jest tabela tłumaczeń, inaczej slug,
--   • admin.admin_trip_enqueue jak w pliku z 2026-11-01,
--   • sprawdzenia uprawnień jako NOTICE (informacja), bez testowego wstawiania.
BEGIN;
CREATE SCHEMA IF NOT EXISTS admin;

ALTER TABLE ops.jobs DROP CONSTRAINT IF EXISTS jobs_worker_check;
ALTER TABLE ops.jobs ADD CONSTRAINT jobs_worker_check CHECK (worker = ANY (ARRAY['hermes', 'claude', 'codex', 'gemini']));

DO $v$
DECLARE col text; tr boolean;
BEGIN
  SELECT column_name INTO col FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'regions' AND column_name IN ('country_slug', 'country_code', 'country')
   ORDER BY CASE column_name WHEN 'country_slug' THEN 1 WHEN 'country_code' THEN 2 ELSE 3 END LIMIT 1;
  tr := to_regclass('public.region_translations') IS NOT NULL;
  EXECUTE format($q$
    CREATE OR REPLACE VIEW admin.regions AS
      SELECT r.slug, %s AS country, %s AS name_pl FROM public.regions r
  $q$, CASE WHEN col IS NULL THEN 'NULL::text' ELSE format('lower(r.%I::text)', col) END,
       CASE WHEN tr THEN 'coalesce((SELECT t.name FROM public.region_translations t WHERE t.region_slug = r.slug AND t.lang = ''pl'' LIMIT 1), r.slug)' ELSE 'r.slug' END);
END $v$;
ALTER VIEW admin.regions OWNER TO quolino;
REVOKE ALL ON admin.regions FROM PUBLIC;
GRANT SELECT ON admin.regions TO quolino_admin;

-- ── zlecenie nowej trasy ────────────────────────────────────────────────────────────────────────────────────────
-- POST /api/rpc/admin_trip_enqueue {p_slug, p_name, p_country, p_region, p_duration, p_brief, p_fresh}
CREATE OR REPLACE FUNCTION admin.admin_trip_enqueue(p_slug text, p_name text, p_country text, p_region text,
                                                    p_duration text, p_brief text, p_fresh boolean)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, pg_temp AS $f$
DECLARE v_slug text := lower(btrim(coalesce(p_slug, ''))); v_name text := btrim(coalesce(p_name, ''));
        v_country text := lower(btrim(coalesce(p_country, 'it'))); v_region text := lower(btrim(coalesce(p_region, '')));
        v_dur text := coalesce(nullif(btrim(p_duration), ''), 'half_day'); v_brief text := btrim(coalesce(p_brief, ''));
        v_rc text; v_req jsonb; v_id bigint; v_dup bigint;
BEGIN
  IF v_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' THEN RAISE EXCEPTION 'Slug: małe litery, cyfry i myślniki, 2–63 znaki (np. asyz).'; END IF;
  IF char_length(v_name) < 2 OR char_length(v_name) > 80 THEN RAISE EXCEPTION 'Nazwa miasta: od 2 do 80 znaków.'; END IF;
  IF v_name ~ '[\n\r"]' THEN RAISE EXCEPTION 'Nazwa bez cudzysłowów i nowych linii.'; END IF;
  IF v_country !~ '^[a-z]{2}$' THEN RAISE EXCEPTION 'Kraj: dwuliterowy kod (np. it).'; END IF;
  IF v_region !~ '^[a-z0-9][a-z0-9-]{1,62}$' THEN RAISE EXCEPTION 'Region: slug z public.regions (np. umbria, marche).'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.regions WHERE slug = v_region) THEN RAISE EXCEPTION 'Nieznany region „%” — nie ma go w public.regions.', v_region; END IF;
  SELECT country INTO v_rc FROM admin.regions WHERE slug = v_region;
  IF v_rc IS NOT NULL AND v_rc <> v_country THEN RAISE EXCEPTION 'Region „%” należy do kraju „%”, nie „%”.', v_region, v_rc, v_country; END IF;
  IF v_dur NOT IN ('half_day', 'full_day') THEN RAISE EXCEPTION 'Czas: half_day albo full_day.'; END IF;
  IF char_length(v_brief) > 2000 THEN RAISE EXCEPTION 'Życzenia do trasy: najwyżej 2000 znaków.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('trip_enqueue:' || v_slug));
  SELECT id INTO v_dup FROM ops.jobs
   WHERE city_slug = v_slug AND kind = 'draft' AND worker = 'gemini' AND status IN ('queued', 'running') ORDER BY id LIMIT 1;
  IF v_dup IS NOT NULL THEN RAISE EXCEPTION 'Miasto „%” ma już zadanie #% w kolejce (queued/running) — nie dubluję.', v_slug, v_dup; END IF;

  v_req := jsonb_build_object('name', v_name, 'region', v_region, 'country', v_country, 'duration', v_dur);
  IF v_brief <> '' THEN v_req := v_req || jsonb_build_object('brief', v_brief); END IF;
  IF coalesce(p_fresh, false) THEN v_req := v_req || jsonb_build_object('fresh', true); END IF;

  INSERT INTO ops.jobs (city_slug, kind, worker, status, request)
  VALUES (v_slug, 'draft', 'gemini', 'queued', v_req::text)
  RETURNING id INTO v_id;
  RETURN json_build_object('id', v_id, 'city_slug', v_slug, 'status', 'queued', 'request', v_req);
END $f$;
ALTER FUNCTION admin.admin_trip_enqueue(text, text, text, text, text, text, boolean) OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.admin_trip_enqueue(text, text, text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.admin_trip_enqueue(text, text, text, text, text, text, boolean) TO quolino_admin;

DO $$
DECLARE t text := 'admin.admin_trip_enqueue(text, text, text, text, text, text, boolean)';
BEGIN
  IF has_function_privilege('web_anon', t, 'EXECUTE') THEN RAISE EXCEPTION 'web_anon może wywołać % — wycofuję', t; END IF;
  RAISE NOTICE 'nowa trasa: CHECK workera z gemini, admin.regions (% regionów), admin_trip_enqueue gotowe', (SELECT count(*) FROM admin.regions);
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
