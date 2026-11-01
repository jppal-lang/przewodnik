-- 2026-11-01 (JP: „kiedy zaczynasz pracę nad kolejną wycieczką?” — chce startować trasy bez konsoli).
-- NOWA TRASA Z PANELU: admin.admin_trip_enqueue(...) wstawia do ops.jobs dokładnie takie zadanie, jakie dotąd dodawało
-- tylko `node qdb.mjs job-add <slug> draft gemini '{"name","region","country","duration","brief","fresh"}'` na serwerze:
--   kind = 'draft', worker = 'gemini', status = 'queued', request = JSON {name, region, country, duration, brief, fresh}
-- (request jest kolumną tekstową — gemini-queue.mjs robi JSON.parse(job.request); jsonb zbudowany w funkcji trafia tam jako ::text).
-- gemini-queue.mjs (cron co 10 min) bierze jedno miasto naraz i uruchamia gemini-draft.mjs <slug> --name … --region … [--fresh].
--
-- Walidacja: slug ^[a-z0-9][a-z0-9-]{1,62}$; region musi istnieć w public.regions (gdy region ma zapisany kraj, musi się zgadzać
-- z p_country); kraj ^[a-z]{2}$; duration in ('half_day','full_day'); brief do 2000 znaków; to samo miasto z zadaniem queued/running
-- → odmowa (zwraca numer istniejącego zadania). Blokada doradcza na slug — dwa kliknięcia naraz nie zrobią dwóch zadań.
-- Zwraca json {id, city_slug, status, request} — id to numer zadania w ops.jobs (widoczny w panelu: Pipeline / pipeline_queue).
--
-- Do tego: admin.regions (lista regionów z krajem do listy w oknie „Nowa trasa”) — kolumna kraju w public.regions nazywa się
-- country_slug (2026-10-13-url-slug.sql); gdyby na tej bazie była inna (country_code), widok powstaje z niej.
--
-- Uprawnienia jak w 2026-10-30-skrzynka-decyzji.sql: quolino_admin EXECUTE (SECURITY DEFINER, właściciel quolino), web_anon nic.
-- Samokontrola na końcu: wstawia testowe zadanie w SAVEPOINT i wycofuje go (po pliku w ops.jobs nic nie zostaje).
-- Bezpieczne do powtórzenia. Zatwierdzenie: panel (#/decyzje) albo sh /root/quolino-web/ops/deploy.sh approve <hash>.
BEGIN;

CREATE SCHEMA IF NOT EXISTS ops;
CREATE SCHEMA IF NOT EXISTS admin;

-- ── worker 'gemini' w ops.jobs ───────────────────────────────────────────────────────────────────────────────────
-- 2026-11-01: zlecenie Asyżu padło na „jobs_worker_check” — stary CHECK nie zna workera 'gemini' (kolejka nowych tras).
-- Zamiast listy (której pełnej treści repo nie zna) — nazwa workera jako prosty identyfikator; obecne wiersze (claude, hermes) przechodzą.
ALTER TABLE ops.jobs DROP CONSTRAINT IF EXISTS jobs_worker_check;
ALTER TABLE ops.jobs ADD CONSTRAINT jobs_worker_check CHECK (worker ~ '^[a-z][a-z0-9_-]{1,30}$');

-- ── lista regionów dla panelu ───────────────────────────────────────────────────────────────────────────────────
DO $v$
DECLARE col text;
BEGIN
  SELECT column_name INTO col FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'regions' AND column_name IN ('country_slug', 'country_code', 'country')
   ORDER BY CASE column_name WHEN 'country_slug' THEN 1 WHEN 'country_code' THEN 2 ELSE 3 END LIMIT 1;
  IF col IS NULL THEN RAISE EXCEPTION 'public.regions bez kolumny kraju (country_slug) — wycofuję'; END IF;
  EXECUTE format($q$
    CREATE OR REPLACE VIEW admin.regions AS
      SELECT r.slug, lower(r.%I::text) AS country,
             coalesce((SELECT t.name FROM public.region_translations t WHERE t.region_slug = r.slug AND t.lang = 'pl' LIMIT 1), r.slug) AS name_pl
        FROM public.regions r
  $q$, col);
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

-- ── samokontrola ─────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r json; t text := 'admin.admin_trip_enqueue(text, text, text, text, text, text, boolean)'; reg text; cty text; n int;
BEGIN
  IF has_function_privilege('web_anon', t, 'EXECUTE') THEN RAISE EXCEPTION 'web_anon może wywołać % — wycofuję', t; END IF;
  IF NOT has_function_privilege('quolino_admin', t, 'EXECUTE') THEN RAISE EXCEPTION 'quolino_admin nie może wywołać % — wycofuję', t; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = t::regprocedure) THEN RAISE EXCEPTION '% nie jest SECURITY DEFINER — wycofuję', t; END IF;
  IF has_table_privilege('web_anon', 'admin.regions', 'SELECT') THEN RAISE EXCEPTION 'web_anon czyta admin.regions — wycofuję'; END IF;
  IF NOT has_table_privilege('quolino_admin', 'admin.regions', 'SELECT') THEN RAISE EXCEPTION 'quolino_admin nie czyta admin.regions — wycofuję'; END IF;
  IF has_table_privilege('quolino_admin', 'ops.jobs', 'INSERT') THEN RAISE EXCEPTION 'quolino_admin pisze do ops.jobs z pominięciem funkcji — wycofuję'; END IF;

  SELECT slug, country INTO reg, cty FROM admin.regions ORDER BY (slug = 'umbria') DESC, slug LIMIT 1;
  IF reg IS NULL THEN RAISE EXCEPTION 'admin.regions pusty — nie ma na czym sprawdzić funkcji'; END IF;

  -- walidacja: zły slug, zły czas, nieznany region
  BEGIN r := admin.admin_trip_enqueue('Asyż', 'Asyż', coalesce(cty, 'it'), reg, 'full_day', '', false); RAISE EXCEPTION 'przyjęto slug z polskimi znakami';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'przyjęto slug z polskimi znakami' THEN RAISE; END IF; END;
  BEGIN r := admin.admin_trip_enqueue('zz-samokontrola', 'Test', coalesce(cty, 'it'), reg, 'weekend', '', false); RAISE EXCEPTION 'przyjęto zły czas';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'przyjęto zły czas' THEN RAISE; END IF; END;
  BEGIN r := admin.admin_trip_enqueue('zz-samokontrola', 'Test', coalesce(cty, 'it'), 'nie-ma-takiego-regionu', 'half_day', '', false); RAISE EXCEPTION 'przyjęto nieznany region';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'przyjęto nieznany region' THEN RAISE; END IF; END;

  -- wstawienie testowe w SAVEPOINT (blok BEGIN…EXCEPTION w plpgsql = savepoint): sprawdzamy kształt wiersza i blokadę duplikatu, potem wycofujemy
  BEGIN
    r := admin.admin_trip_enqueue('zz-samokontrola', 'Test samokontroli', coalesce(cty, 'it'), reg, 'full_day', 'życzenia „testowe”', true);
    IF (r->>'id') IS NULL THEN RAISE EXCEPTION 'funkcja nie zwróciła id'; END IF;
    SELECT count(*) INTO n FROM ops.jobs j WHERE j.id = (r->>'id')::bigint AND j.city_slug = 'zz-samokontrola' AND j.kind = 'draft'
       AND j.worker = 'gemini' AND j.status = 'queued'
       AND j.request::jsonb->>'name' = 'Test samokontroli' AND j.request::jsonb->>'region' = reg
       AND j.request::jsonb->>'duration' = 'full_day' AND (j.request::jsonb->>'fresh')::boolean AND j.request::jsonb->>'brief' = 'życzenia „testowe”';
    IF n <> 1 THEN RAISE EXCEPTION 'wiersz ops.jobs nie ma kształtu, którego oczekuje gemini-queue.mjs'; END IF;
    BEGIN r := admin.admin_trip_enqueue('zz-samokontrola', 'Test', coalesce(cty, 'it'), reg, 'half_day', '', false); RAISE EXCEPTION 'zdublowano zadanie';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'zdublowano zadanie' THEN RAISE; END IF; END;
    RAISE EXCEPTION USING ERRCODE = 'P0999', MESSAGE = 'samokontrola: wycofanie testowego wiersza';
  EXCEPTION WHEN SQLSTATE 'P0999' THEN NULL;   -- savepoint wycofany: testowy wiersz zniknął
  END;
  DELETE FROM ops.jobs WHERE city_slug = 'zz-samokontrola';   -- pas i szelki (po wycofaniu i tak nic nie ma)
  IF EXISTS (SELECT 1 FROM ops.jobs WHERE city_slug = 'zz-samokontrola') THEN RAISE EXCEPTION 'testowy wiersz został w ops.jobs — wycofuję'; END IF;
  RAISE NOTICE 'samokontrola OK: admin_trip_enqueue (walidacja, kształt ops.jobs, duplikat), admin.regions (%: region % / kraj %), web_anon bez dostępu',
    (SELECT count(*) FROM admin.regions), reg, cty;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Cofnięcie: DROP FUNCTION admin.admin_trip_enqueue(text, text, text, text, text, text, boolean); DROP VIEW admin.regions;
