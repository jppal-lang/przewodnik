-- 2026-10-30 (JP): SKRZYNKA DECYZJI w panelu admina (#/decyzje) — koniec z konsolą i wklejaniem komend.
-- Wszystko, co czeka na JP, w jednym miejscu: wdrożenia (SQL/ops), zgody na koszty AI, budżet miesięczny,
-- szkice tras z liczbą czerwonych flag i ustalenia strażników (tabela ops.watch_findings innego pliku — tu tylko odczyt).
--
-- 1) ops.deploy_requests — prośby o zgodę na wdrożenie. Wpisuje je ops/deploy.sh (root, cron co 2 min, przez docker exec psql)
--    przy każdej zmianie wymagającej zgody; JP klika w panelu „Zatwierdź i wdróż” (admin.admin_deploy_decide) → najbliższy
--    przebieg deploy.sh robi dokładnie to, co `deploy.sh approve <hash>`, i zapisuje wynik (done/failed + ostatnie linie).
--    Konsola zostaje drogą awaryjną: `deploy.sh approve <hash>` działa jak dotąd.
-- 2) ops.cost_requests — prośby o zgodę na zlecenia, które kosztują (repo-jobs.mjs: plik _content/jobs/*.json z "needs_jp": true).
--    JP klika „Zgoda” (admin.admin_cost_decide) → repo-jobs.mjs wykonuje przy najbliższym przebiegu (cron co 10 min).
-- 3) ops.app_settings 'ai_budget_month_usd' (domyślnie 10) — próg miesięczny ustawiany w panelu (admin.admin_setting_set);
--    admin.ai_budget — zużycie bieżącego miesiąca z public.ai_usage (USD API i ekwiwalent abonamentu osobno).
-- 4) admin.decision_drafts — szkice tras czekające na zatwierdzenie z liczbą czerwonych flag (review.errors).
-- 5) admin.admin_watch_open() — otwarte ustalenia strażników; gdy ops.watch_findings jeszcze nie istnieje: {"ready": false}.
--
-- Uprawnienia: panel = rola quolino_admin (tylko przez bramkę panelu z jednorazowym linkiem); czyta widoki admin.*,
-- decyzje zapisuje WYŁĄCZNIE funkcjami admin.* (SECURITY DEFINER, właściciel quolino). Gość (web_anon) nie ma niczego.
-- Plik sam się sprawdza na końcu (błąd = wycofanie całości). Bezpieczne do powtórzenia. Ostatni plik zatwierdzany konsolą:
--   sh /root/quolino-web/ops/deploy.sh approve <hash>
BEGIN;

CREATE SCHEMA IF NOT EXISTS ops;
CREATE SCHEMA IF NOT EXISTS admin;
GRANT USAGE ON SCHEMA ops TO quolino;

-- ── 1) Wdrożenia czekające na zgodę ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops.deploy_requests (
  id          bigserial PRIMARY KEY,
  hash        text NOT NULL UNIQUE,                 -- HEAD repo w chwili wykrycia (pełny SHA-1)
  base        text,                                 -- ostatni zatwierdzony commit (od czego liczony diff)
  files       text[] NOT NULL DEFAULT '{}',         -- ścieżki w repo wymagające zgody
  summary     text,                                 -- commity (hash + temat), po jednym w wierszu
  diff        text,                                 -- git diff base..hash tych plików (ucięty do ~200 KB)
  status      text NOT NULL DEFAULT 'pending',
  decided_by  text,
  decided_at  timestamptz,
  result      text,                                 -- ostatnie linie wdrożenia albo powód
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT deploy_requests_hash CHECK (hash ~ '^[0-9a-f]{40}$'),
  CONSTRAINT deploy_requests_base CHECK (base IS NULL OR base ~ '^[0-9a-f]{40}$'),
  CONSTRAINT deploy_requests_status CHECK (status IN ('pending', 'approved', 'running', 'done', 'failed', 'rejected', 'superseded'))
);
CREATE INDEX IF NOT EXISTS deploy_requests_status ON ops.deploy_requests (status, id DESC);
ALTER TABLE ops.deploy_requests OWNER TO quolino;
REVOKE ALL ON ops.deploy_requests FROM PUBLIC;
REVOKE ALL ON ops.deploy_requests FROM web_anon;

-- GET /api/deploy_requests?order=id.desc&limit=15  (diff tylko na żądanie: ?id=eq.N&select=diff)
CREATE OR REPLACE VIEW admin.deploy_requests AS
  SELECT id, hash, base, files, summary, diff, status, decided_by, decided_at, result, created_at, updated_at, finished_at
    FROM ops.deploy_requests;
ALTER VIEW admin.deploy_requests OWNER TO quolino;
REVOKE ALL ON admin.deploy_requests FROM PUBLIC;
GRANT SELECT ON admin.deploy_requests TO quolino_admin;

-- POST /api/rpc/admin_deploy_decide {p_id, p_decision}: 'approve' | 'reject' (z pending) albo 'cancel' (approved → pending, zanim serwer zacznie)
CREATE OR REPLACE FUNCTION admin.admin_deploy_decide(p_id bigint, p_decision text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, pg_temp AS $f$
DECLARE r ops.deploy_requests;
BEGIN
  IF p_decision NOT IN ('approve', 'reject', 'cancel') THEN RAISE EXCEPTION 'Decyzja: approve, reject albo cancel.'; END IF;
  SELECT * INTO r FROM ops.deploy_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nie ma takiego wdrożenia.'; END IF;
  IF p_decision = 'cancel' THEN
    IF r.status <> 'approved' THEN RAISE EXCEPTION 'Cofnąć można tylko zatwierdzenie, którego serwer jeszcze nie zaczął (status: %).', r.status; END IF;
    UPDATE ops.deploy_requests SET status = 'pending', decided_by = NULL, decided_at = NULL, updated_at = now() WHERE id = p_id;
    RETURN json_build_object('id', p_id, 'status', 'pending');
  END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'To wdrożenie nie czeka już na decyzję (status: %).', r.status; END IF;
  IF p_decision = 'approve' AND EXISTS (SELECT 1 FROM ops.deploy_requests WHERE status = 'pending' AND id > p_id) THEN
    RAISE EXCEPTION 'Jest nowsza prośba o wdrożenie — zatwierdź tamtą (obejmuje też tę).';
  END IF;
  UPDATE ops.deploy_requests
     SET status = CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END,
         decided_by = 'JP (panel)', decided_at = now(), updated_at = now(),
         result = CASE WHEN p_decision = 'approve' THEN 'zatwierdzone — serwer wdroży w ciągu 2 min' ELSE 'odrzucone w panelu' END
   WHERE id = p_id;
  RETURN json_build_object('id', p_id, 'status', CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END);
END $f$;
ALTER FUNCTION admin.admin_deploy_decide(bigint, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.admin_deploy_decide(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.admin_deploy_decide(bigint, text) TO quolino_admin;

-- ── 2) Zgody na koszty ───────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops.cost_requests (
  id          bigserial PRIMARY KEY,
  job_key     text UNIQUE,                          -- nazwa pliku zlecenia (_content/jobs/<job_key>.json); null dla innych rodzajów
  kind        text NOT NULL DEFAULT 'repo-job',
  title       text NOT NULL,
  detail      text,
  est_usd     numeric(10,2),                        -- szacunek w USD (płatne API)
  est_limit   text,                                 -- co zużyje z limitów abonamentu (np. „~12 wywołań Antigravity”)
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {script, args} — to i tylko to wykona repo-jobs.mjs po zgodzie
  status      text NOT NULL DEFAULT 'pending',
  decided_by  text,
  decided_at  timestamptz,
  result      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT cost_requests_status CHECK (status IN ('pending', 'approved', 'rejected', 'running', 'done', 'failed')),
  CONSTRAINT cost_requests_key CHECK (job_key IS NULL OR job_key ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$'),
  CONSTRAINT cost_requests_payload CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT cost_requests_est CHECK (est_usd IS NULL OR est_usd >= 0)
);
CREATE INDEX IF NOT EXISTS cost_requests_status ON ops.cost_requests (status, id DESC);
ALTER TABLE ops.cost_requests OWNER TO quolino;
REVOKE ALL ON ops.cost_requests FROM PUBLIC;
REVOKE ALL ON ops.cost_requests FROM web_anon;

CREATE OR REPLACE VIEW admin.cost_requests AS
  SELECT id, job_key, kind, title, detail, est_usd, est_limit, payload, status, decided_by, decided_at, result, created_at, finished_at
    FROM ops.cost_requests;
ALTER VIEW admin.cost_requests OWNER TO quolino;
REVOKE ALL ON admin.cost_requests FROM PUBLIC;
GRANT SELECT ON admin.cost_requests TO quolino_admin;

-- POST /api/rpc/admin_cost_decide {p_id, p_decision}: 'approve' | 'reject' (tylko z pending)
CREATE OR REPLACE FUNCTION admin.admin_cost_decide(p_id bigint, p_decision text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, pg_temp AS $f$
DECLARE st text;
BEGIN
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'Decyzja: approve albo reject.'; END IF;
  UPDATE ops.cost_requests
     SET status = CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END,
         decided_by = 'JP (panel)', decided_at = now()
   WHERE id = p_id AND status = 'pending'
  RETURNING status INTO st;
  IF st IS NULL THEN RAISE EXCEPTION 'Ta prośba nie czeka już na decyzję.'; END IF;
  RETURN json_build_object('id', p_id, 'status', st);
END $f$;
ALTER FUNCTION admin.admin_cost_decide(bigint, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.admin_cost_decide(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.admin_cost_decide(bigint, text) TO quolino_admin;

-- ── 3) Budżet miesięczny AI ──────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops.app_settings (   -- jak w 2026-10-26-skarb-kupony.sql (na produkcji już jest)
  name       text PRIMARY KEY,
  value      text NOT NULL,
  note       text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ops.app_settings OWNER TO quolino;
REVOKE ALL ON ops.app_settings FROM PUBLIC;
REVOKE ALL ON ops.app_settings FROM web_anon;
INSERT INTO ops.app_settings (name, value, note) VALUES
  ('ai_budget_month_usd', '10', 'Próg miesięczny wydatków AI w USD (płatne API) — pasek w Skrzynce decyzji panelu; zmiana w panelu.')
ON CONFLICT (name) DO NOTHING;

-- GET /api/ai_budget — jeden wiersz: bieżący miesiąc (czas polski). Wymaga public.ai_usage (2026-10-25-koszty-ai.sql).
CREATE OR REPLACE VIEW admin.ai_budget AS
  WITH m AS (SELECT (date_trunc('month', now() AT TIME ZONE 'Europe/Warsaw') AT TIME ZONE 'Europe/Warsaw') AS since)
  SELECT (SELECT since FROM m)                                                                AS month_start,
         round(coalesce(sum(u.usd), 0), 2)                                                    AS usd_api,
         round(coalesce(sum(u.usd_equiv) FILTER (WHERE u.billing = 'abonament'), 0), 2)       AS usd_equiv_sub,
         coalesce(sum(u.calls), 0)::int                                                       AS calls,
         (SELECT CASE WHEN value ~ '^\d{1,5}(\.\d{1,2})?$' THEN value::numeric ELSE 10 END
            FROM ops.app_settings WHERE name = 'ai_budget_month_usd')                         AS budget_usd,
         (SELECT round(coalesce(sum(est_usd), 0), 2) FROM ops.cost_requests WHERE status IN ('pending', 'approved', 'running')) AS pending_est_usd
    FROM public.ai_usage u
   WHERE u.at >= (SELECT since FROM m);
ALTER VIEW admin.ai_budget OWNER TO quolino;
REVOKE ALL ON admin.ai_budget FROM PUBLIC;
GRANT SELECT ON admin.ai_budget TO quolino_admin;

-- POST /api/rpc/admin_setting_set {p_name, p_value} — tylko ustawienia z białej listy
CREATE OR REPLACE FUNCTION admin.admin_setting_set(p_name text, p_value text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, pg_temp AS $f$
BEGIN
  IF p_name IS DISTINCT FROM 'ai_budget_month_usd' THEN RAISE EXCEPTION 'Tego ustawienia nie zmienia się w panelu.'; END IF;
  p_value := replace(trim(coalesce(p_value, '')), ',', '.');
  IF p_value !~ '^\d{1,5}(\.\d{1,2})?$' OR p_value::numeric > 10000 THEN RAISE EXCEPTION 'Próg: liczba od 0 do 10000 (USD).'; END IF;
  INSERT INTO ops.app_settings (name, value, note, updated_at) VALUES (p_name, p_value, 'ustawione w panelu', now())
  ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN json_build_object('name', p_name, 'value', p_value);
END $f$;
ALTER FUNCTION admin.admin_setting_set(text, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.admin_setting_set(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.admin_setting_set(text, text) TO quolino_admin;

-- ── 4) Szkice tras do zatwierdzenia z liczbą czerwonych flag ─────────────────────────────────────────────────────
CREATE OR REPLACE VIEW admin.decision_drafts AS
  SELECT d.city_slug, d.version, d.created_at, d.note, d.source, d.stops_count,
         coalesce((SELECT t->>'title' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d.content->'city_translations') = 'array'
                                                                      THEN d.content->'city_translations' ELSE '[]'::jsonb END) t
                    WHERE t->>'lang' = 'pl' LIMIT 1), d.city_slug)                                              AS city_name,
         CASE WHEN jsonb_typeof(d.review->'errors') = 'array' THEN jsonb_array_length(d.review->'errors') ELSE 0 END   AS red_flags,
         CASE WHEN jsonb_typeof(d.review->'warnings') = 'array' THEN jsonb_array_length(d.review->'warnings') ELSE 0 END AS warnings,
         d.review->>'verdict'                                                                                  AS verdict,
         (SELECT max(p.version) FROM public.city_versions p WHERE p.city_slug = d.city_slug AND p.status = 'published') AS published_version
    FROM public.city_versions d
   WHERE d.status = 'draft';
ALTER VIEW admin.decision_drafts OWNER TO quolino;
REVOKE ALL ON admin.decision_drafts FROM PUBLIC;
GRANT SELECT ON admin.decision_drafts TO quolino_admin;

-- ── 5) Ustalenia strażników (tabela i admin.admin_watch_decide: 2026-10-30-straznicy.sql, inny plik) ──────────────
-- POST /api/rpc/admin_watch_open {} → {"ready": false} albo {"ready": true, "decide": true|false, "rows": [...]}
CREATE OR REPLACE FUNCTION admin.admin_watch_open()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ops, pg_temp AS $f$
DECLARE r jsonb;
BEGIN
  IF to_regclass('ops.watch_findings') IS NULL THEN RETURN jsonb_build_object('ready', false); END IF;
  EXECUTE $q$
    SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
      FROM (SELECT id, kind, city_slug, stop_key, title, detail, proposal, url, created_at
              FROM ops.watch_findings WHERE status = 'open' ORDER BY created_at DESC LIMIT 200) x
  $q$ INTO r;
  RETURN jsonb_build_object('ready', true, 'rows', r,
    'decide', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                       WHERE n.nspname = 'admin' AND p.proname = 'admin_watch_decide'));
END $f$;
ALTER FUNCTION admin.admin_watch_open() OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.admin_watch_open() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.admin_watch_open() TO quolino_admin;

-- ── samokontrola ─────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r json; j jsonb; i bigint; t text;
BEGIN
  -- gość: zero dostępu
  FOREACH t IN ARRAY ARRAY['ops.deploy_requests', 'ops.cost_requests', 'ops.app_settings',
                           'admin.deploy_requests', 'admin.cost_requests', 'admin.ai_budget', 'admin.decision_drafts'] LOOP
    IF has_table_privilege('web_anon', t, 'SELECT') OR has_table_privilege('web_anon', t, 'INSERT') OR has_table_privilege('web_anon', t, 'UPDATE') THEN
      RAISE EXCEPTION 'web_anon ma dostęp do % — wycofuję', t;
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['admin.admin_deploy_decide(bigint, text)', 'admin.admin_cost_decide(bigint, text)',
                           'admin.admin_setting_set(text, text)', 'admin.admin_watch_open()'] LOOP
    IF has_function_privilege('web_anon', t, 'EXECUTE') THEN RAISE EXCEPTION 'web_anon może wywołać % — wycofuję', t; END IF;
    IF NOT has_function_privilege('quolino_admin', t, 'EXECUTE') THEN RAISE EXCEPTION 'quolino_admin nie może wywołać % — wycofuję', t; END IF;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = t::regprocedure) THEN RAISE EXCEPTION '% nie jest SECURITY DEFINER — wycofuję', t; END IF;
  END LOOP;
  -- admin: czyta widoki, ale tabel nie zmienia z pominięciem funkcji
  FOREACH t IN ARRAY ARRAY['admin.deploy_requests', 'admin.cost_requests', 'admin.ai_budget', 'admin.decision_drafts'] LOOP
    IF NOT has_table_privilege('quolino_admin', t, 'SELECT') THEN RAISE EXCEPTION 'quolino_admin nie czyta % — wycofuję', t; END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['ops.deploy_requests', 'ops.cost_requests', 'ops.app_settings', 'admin.deploy_requests', 'admin.cost_requests'] LOOP
    IF has_table_privilege('quolino_admin', t, 'INSERT') OR has_table_privilege('quolino_admin', t, 'UPDATE') OR has_table_privilege('quolino_admin', t, 'DELETE') THEN
      RAISE EXCEPTION 'quolino_admin pisze do % z pominięciem funkcji — wycofuję', t;
    END IF;
  END LOOP;

  -- wdrożenie: pending → approved → cancel → pending → reject; nowsza prośba blokuje zatwierdzenie starszej
  INSERT INTO ops.deploy_requests (hash, files, summary) VALUES (repeat('a', 40), '{x.sql}', 'test samokontroli') RETURNING id INTO i;
  r := admin.admin_deploy_decide(i, 'approve');
  IF (SELECT status FROM ops.deploy_requests WHERE id = i) <> 'approved' THEN RAISE EXCEPTION 'zatwierdzenie wdrożenia nie działa'; END IF;
  r := admin.admin_deploy_decide(i, 'cancel');
  IF (SELECT status FROM ops.deploy_requests WHERE id = i) <> 'pending' THEN RAISE EXCEPTION 'cofnięcie zatwierdzenia nie działa'; END IF;
  INSERT INTO ops.deploy_requests (hash, files) VALUES (repeat('b', 40), '{y.sql}');
  BEGIN
    r := admin.admin_deploy_decide(i, 'approve');
    RAISE EXCEPTION 'zatwierdzono starszą prośbę mimo nowszej';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'zatwierdzono starszą prośbę mimo nowszej' THEN RAISE; END IF;
  END;
  r := admin.admin_deploy_decide(i, 'reject');
  IF (SELECT status FROM ops.deploy_requests WHERE id = i) <> 'rejected' THEN RAISE EXCEPTION 'odrzucenie wdrożenia nie działa'; END IF;
  BEGIN
    r := admin.admin_deploy_decide(i, 'approve');
    RAISE EXCEPTION 'zatwierdzono odrzucone';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'zatwierdzono odrzucone' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO ops.deploy_requests (hash) VALUES ('abc; rm -rf /');
    RAISE EXCEPTION 'przyjęto zły hash';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  DELETE FROM ops.deploy_requests WHERE hash IN (repeat('a', 40), repeat('b', 40));

  -- koszt: pending → approved; drugi raz nie
  INSERT INTO ops.cost_requests (job_key, title, payload) VALUES ('test-samokontrola', 'test', '{"script":"x.mjs","args":[]}') RETURNING id INTO i;
  r := admin.admin_cost_decide(i, 'approve');
  IF (SELECT status FROM ops.cost_requests WHERE id = i) <> 'approved' THEN RAISE EXCEPTION 'zgoda na koszt nie działa'; END IF;
  BEGIN
    r := admin.admin_cost_decide(i, 'reject');
    RAISE EXCEPTION 'zmieniono decyzję po fakcie';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'zmieniono decyzję po fakcie' THEN RAISE; END IF;
  END;
  DELETE FROM ops.cost_requests WHERE job_key = 'test-samokontrola';

  -- ustawienia: tylko biała lista i liczby
  t := (SELECT value FROM ops.app_settings WHERE name = 'ai_budget_month_usd');
  r := admin.admin_setting_set('ai_budget_month_usd', '12,5');
  IF (SELECT value FROM ops.app_settings WHERE name = 'ai_budget_month_usd') <> '12.5' THEN RAISE EXCEPTION 'zapis progu nie działa'; END IF;
  UPDATE ops.app_settings SET value = t WHERE name = 'ai_budget_month_usd';
  BEGIN
    r := admin.admin_setting_set('treasure_from', '2020-01-01');
    RAISE EXCEPTION 'zmieniono ustawienie spoza listy';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'zmieniono ustawienie spoza listy' THEN RAISE; END IF;
  END;
  IF (SELECT budget_usd FROM admin.ai_budget) IS NULL THEN RAISE EXCEPTION 'admin.ai_budget bez progu'; END IF;

  j := admin.admin_watch_open();
  IF j IS NULL OR NOT (j ? 'ready') THEN RAISE EXCEPTION 'admin_watch_open zwraca zły kształt: %', j; END IF;
  RAISE NOTICE 'samokontrola OK: wdrożenia (zatwierdź/cofnij/odrzuć), zgody na koszty, próg budżetu, szkice, strażnicy (ready=%), web_anon bez dostępu', j->>'ready';
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Cofnięcie: DROP FUNCTION admin.admin_watch_open(), admin.admin_setting_set(text, text), admin.admin_cost_decide(bigint, text),
--   admin.admin_deploy_decide(bigint, text); DROP VIEW admin.decision_drafts, admin.ai_budget, admin.cost_requests, admin.deploy_requests;
--   DROP TABLE ops.cost_requests, ops.deploy_requests; DELETE FROM ops.app_settings WHERE name = 'ai_budget_month_usd';
