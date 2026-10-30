-- 2026-10-30 (JP): strażnicy aktualności tras — bin/watch.mjs (Hermes, rola quolino, wołany z gemini-queue.mjs co 10 min).
-- Strażnicy zapisują ustalenia do ops.watch_findings; skrzynka decyzji w panelu czyta je przez admin.admin_watch_open()
-- (plik 2026-10-30-skrzynka-decyzji.sql) i zapisuje decyzję przez admin.admin_watch_decide(p_id, p_decision, p_note):
--   accept  → status accepted; dla ceny, godzin, zamknięcia, otwarcia, przeterminowania i lokalu apply_state = pending:
--             watch.mjs w ciągu ~10 min robi z tego NOWĄ WERSJĘ SZKICU (kodem, bez AI) do zatwierdzenia przez JP;
--             gdy potrzebne AI (misja zastępcza, zamiennik lokalu) → prośba w ops.cost_requests, nie wykonanie.
--             Wybór opcji (zamknięcie: 1 dopisek, 2 ukryj, 3 fałszywy alarm): notatka „opcja 2”; bez notatki — rekomendacja strażnika.
--             Opcja oznaczona jako fałszywy alarm = odrzucenie.
--   reject  → status rejected (to samo ustalenie nie wraca co tydzień — deduplikacja po dedupe_key)
--   recheck → status recheck; strażnik sprawdza ponownie następnego dnia (problem jest → open, zniknął → resolved)
-- Ustawienia (ops.app_settings): ai_alert_day_usd (próg dziennych realnych kosztów AI), watch_enabled, watch_ai,
-- watch_ai_max_per_run, watch_max_minutes, watch_schedule (JSON nadpisujący harmonogram z watch-lib.mjs).
-- Gość (web_anon) nie widzi niczego. Plik sam się sprawdza na końcu (błąd = wycofanie całości). Bezpieczne do powtórzenia.
BEGIN;

CREATE SCHEMA IF NOT EXISTS ops;
GRANT USAGE ON SCHEMA ops TO quolino;

CREATE TABLE IF NOT EXISTS ops.watch_findings (
  id              bigserial PRIMARY KEY,
  kind            text NOT NULL,
  city_slug       text,
  stop_key        text,
  title           text NOT NULL,
  detail          text,
  proposal        jsonb NOT NULL DEFAULT '{}'::jsonb,
  url             text,
  quote           text,
  status          text NOT NULL DEFAULT 'open',
  recheck_at      timestamptz,
  ends_at         date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  decided_at      timestamptz,
  decision_note   text,
  decided_option  smallint,
  dedupe_key      text NOT NULL,
  seen_count      int NOT NULL DEFAULT 1,
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  apply_state     text NOT NULL DEFAULT 'none',
  apply_result    text,
  CONSTRAINT watch_findings_kind CHECK (kind IN ('price', 'hours', 'closure', 'reopen', 'closure_overdue', 'link', 'venue', 'season', 'site', 'cost')),
  CONSTRAINT watch_findings_status CHECK (status IN ('open', 'accepted', 'rejected', 'recheck', 'resolved')),
  CONSTRAINT watch_findings_apply CHECK (apply_state IN ('none', 'pending', 'done', 'failed', 'needs_ai')),
  CONSTRAINT watch_findings_proposal CHECK (jsonb_typeof(proposal) = 'object'),
  CONSTRAINT watch_findings_option CHECK (decided_option IS NULL OR decided_option BETWEEN 1 AND 9),
  CONSTRAINT watch_findings_sizes CHECK (char_length(title) <= 400 AND char_length(coalesce(detail, '')) <= 4000
                                         AND char_length(coalesce(quote, '')) <= 1000 AND char_length(dedupe_key) <= 600)
);
CREATE UNIQUE INDEX IF NOT EXISTS watch_findings_dedupe ON ops.watch_findings (dedupe_key);
CREATE INDEX IF NOT EXISTS watch_findings_open ON ops.watch_findings (status, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS watch_findings_apply ON ops.watch_findings (apply_state) WHERE apply_state = 'pending';
CREATE INDEX IF NOT EXISTS watch_findings_recheck ON ops.watch_findings (recheck_at) WHERE recheck_at IS NOT NULL;
ALTER TABLE ops.watch_findings OWNER TO quolino;
ALTER SEQUENCE IF EXISTS ops.watch_findings_id_seq OWNER TO quolino;
REVOKE ALL ON ops.watch_findings FROM PUBLIC;
REVOKE ALL ON ops.watch_findings FROM web_anon;

-- podgląd w panelu (wszystkie statusy, bez skracania): GET /api/watch_findings?status=eq.accepted
CREATE OR REPLACE VIEW admin.watch_findings AS
  SELECT id, kind, city_slug, stop_key, title, detail, proposal, url, quote, status, recheck_at, ends_at, created_at, updated_at,
         decided_at, decision_note, decided_option, seen_count, last_seen_at, last_checked_at, apply_state, apply_result
    FROM ops.watch_findings;
ALTER VIEW admin.watch_findings OWNER TO quolino;
REVOKE ALL ON admin.watch_findings FROM PUBLIC;
GRANT SELECT ON admin.watch_findings TO quolino_admin;

-- ustawienia (tabela jak w 2026-10-26-skarb-kupony.sql; DO NOTHING — nie nadpisuje zmienionych wartości)
CREATE TABLE IF NOT EXISTS ops.app_settings (
  name       text PRIMARY KEY,
  value      text NOT NULL,
  note       text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ops.app_settings OWNER TO quolino;
REVOKE ALL ON ops.app_settings FROM PUBLIC;
INSERT INTO ops.app_settings (name, value, note) VALUES
  ('ai_alert_day_usd', '1.00', 'Strażnik kosztów: alarm, gdy realnie zapłacone AI (API) w 24 h przekroczy tę kwotę w USD.'),
  ('watch_enabled', 'on', 'Strażnicy aktualności tras (watch.mjs): on | off.'),
  ('watch_ai', 'on', 'Strażnik cen/godzin może zadać jedno krótkie pytanie AI przy wykrytej zmianie (Antigravity, inaczej Claude): on | off.'),
  ('watch_ai_max_per_run', '4', 'Najwyżej tyle pytań AI na jeden przebieg strażnika.'),
  ('watch_max_minutes', '5', 'Limit czasu jednego przebiegu strażnika (minuty); przerwany przebieg dokańcza następny cron.'),
  ('watch_schedule', '{}', 'Nadpisanie harmonogramu strażników (JSON), np. {"site":{"off":true},"prices":{"weekday":3}}. Domyślny: watch-lib.mjs DEFAULT_SCHEDULE.')
ON CONFLICT (name) DO NOTHING;

-- decyzja JP z panelu: POST /api/rpc/admin_watch_decide {p_id, p_decision: accept|reject|recheck, p_note}
CREATE OR REPLACE FUNCTION admin.admin_watch_decide(p_id bigint, p_decision text, p_note text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, pg_temp AS $f$
DECLARE r ops.watch_findings; v_opt int; v_fa boolean; v_status text; v_apply text := 'none'; v_note text := nullif(btrim(left(coalesce(p_note, ''), 1000)), '');
BEGIN
  IF p_decision IS NULL OR p_decision NOT IN ('accept', 'reject', 'recheck') THEN RAISE EXCEPTION 'Decyzja: accept, reject albo recheck.'; END IF;
  SELECT * INTO r FROM ops.watch_findings WHERE id = p_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Nie ma takiego ustalenia.'; END IF;
  IF r.status NOT IN ('open', 'recheck') THEN RAISE EXCEPTION 'To ustalenie nie czeka już na decyzję (status: %).', r.status; END IF;
  IF p_decision = 'accept' THEN
    -- opcja z notatki („opcja 2”, „option 2”, „2”), inaczej rekomendacja strażnika, inaczej 1
    v_opt := coalesce(substring(coalesce(v_note, '') FROM '(?i)^\s*(?:opcj[aęi]|option|opt\.?)?\s*#?([1-9])\M')::int,
                      CASE WHEN (r.proposal->>'recommended') ~ '^[1-9]$' THEN (r.proposal->>'recommended')::int END, 1);
    IF jsonb_typeof(r.proposal->'options') = 'array' AND jsonb_array_length(r.proposal->'options') > 0
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r.proposal->'options') o WHERE (o->>'n') = v_opt::text) THEN
      RAISE EXCEPTION 'Nie ma opcji % w tej propozycji.', v_opt;
    END IF;
    SELECT coalesce(bool_or((o->>'false_alarm')::boolean), false) INTO v_fa
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.proposal->'options') = 'array' THEN r.proposal->'options' ELSE '[]'::jsonb END) o
     WHERE (o->>'n') = v_opt::text;
    IF v_fa THEN
      v_status := 'rejected';
    ELSE
      v_status := 'accepted';
      IF r.kind IN ('price', 'hours', 'closure', 'reopen', 'closure_overdue', 'venue') THEN v_apply := 'pending'; END IF;
    END IF;
    UPDATE ops.watch_findings SET status = v_status, decided_option = v_opt, apply_state = v_apply, apply_result = NULL,
           decided_at = now(), decision_note = v_note, updated_at = now() WHERE id = p_id;
  ELSIF p_decision = 'reject' THEN
    v_status := 'rejected';
    UPDATE ops.watch_findings SET status = v_status, decided_at = now(), decision_note = v_note, updated_at = now() WHERE id = p_id;
  ELSE
    v_status := 'recheck';
    UPDATE ops.watch_findings SET status = v_status, recheck_at = now() + interval '1 day', decided_at = now(), decision_note = v_note, updated_at = now() WHERE id = p_id;
  END IF;
  RETURN json_build_object('id', p_id, 'status', v_status, 'option', v_opt, 'apply_state', v_apply);
END $f$;
ALTER FUNCTION admin.admin_watch_decide(bigint, text, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.admin_watch_decide(bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.admin_watch_decide(bigint, text, text) TO quolino_admin;

-- samokontrola: gość bez dostępu, admin czyta widok i woła funkcję, logika decyzji (próbne wiersze usuwane na końcu)
DO $$
DECLARE i bigint; j json;
BEGIN
  IF has_table_privilege('web_anon', 'ops.watch_findings', 'SELECT') OR has_table_privilege('web_anon', 'ops.watch_findings', 'INSERT')
     OR has_table_privilege('web_anon', 'admin.watch_findings', 'SELECT')
     OR has_function_privilege('web_anon', 'admin.admin_watch_decide(bigint, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'web_anon ma dostęp do ustaleń strażników — wycofuję';
  END IF;
  IF NOT has_table_privilege('quolino_admin', 'admin.watch_findings', 'SELECT')
     OR NOT has_function_privilege('quolino_admin', 'admin.admin_watch_decide(bigint, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'quolino_admin nie czyta widoku albo nie woła funkcji — wycofuję';
  END IF;
  IF has_table_privilege('quolino_admin', 'ops.watch_findings', 'UPDATE') OR has_table_privilege('quolino_admin', 'ops.watch_findings', 'INSERT') THEN
    RAISE EXCEPTION 'quolino_admin pisze do tabeli z pominięciem funkcji — wycofuję';
  END IF;
  IF (SELECT tableowner FROM pg_tables WHERE schemaname = 'ops' AND tablename = 'watch_findings') <> 'quolino' THEN
    RAISE EXCEPTION 'ops.watch_findings nie należy do quolino — wycofuję';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'admin.admin_watch_decide(bigint, text, text)'::regprocedure) THEN
    RAISE EXCEPTION 'admin_watch_decide nie jest SECURITY DEFINER — wycofuję';
  END IF;

  INSERT INTO ops.watch_findings (kind, city_slug, stop_key, title, dedupe_key, proposal)
  VALUES ('closure', 'test-samokontrola', 'museo', 'test', 'test-samokontrola:1',
          '{"recommended": 1, "options": [{"n": 1, "label": "dopisek"}, {"n": 2, "label": "ukryj"}, {"n": 3, "label": "fałszywy alarm", "false_alarm": true}]}')
  RETURNING id INTO i;
  j := admin.admin_watch_decide(i, 'accept', 'opcja 2 — ukryj do otwarcia');
  IF (SELECT status || '/' || decided_option || '/' || apply_state FROM ops.watch_findings WHERE id = i) <> 'accepted/2/pending' THEN
    RAISE EXCEPTION 'accept z opcją 2 nie działa: %', j;
  END IF;
  BEGIN
    j := admin.admin_watch_decide(i, 'reject', NULL);
    RAISE EXCEPTION 'przyjęto drugą decyzję';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'przyjęto drugą decyzję' THEN RAISE; END IF;
  END;
  UPDATE ops.watch_findings SET status = 'open', decided_option = NULL, apply_state = 'none' WHERE id = i;
  j := admin.admin_watch_decide(i, 'accept', 'Option 3');
  IF (SELECT status FROM ops.watch_findings WHERE id = i) <> 'rejected' THEN RAISE EXCEPTION 'fałszywy alarm nie odrzuca: %', j; END IF;
  UPDATE ops.watch_findings SET status = 'open' WHERE id = i;
  j := admin.admin_watch_decide(i, 'accept', NULL);
  IF (SELECT decided_option FROM ops.watch_findings WHERE id = i) <> 1 THEN RAISE EXCEPTION 'bez notatki nie bierze rekomendacji: %', j; END IF;
  UPDATE ops.watch_findings SET status = 'open' WHERE id = i;
  j := admin.admin_watch_decide(i, 'recheck', 'jeszcze raz');
  IF (SELECT status FROM ops.watch_findings WHERE id = i) <> 'recheck' OR (SELECT recheck_at FROM ops.watch_findings WHERE id = i) IS NULL THEN
    RAISE EXCEPTION 'recheck nie działa: %', j;
  END IF;
  BEGIN
    j := admin.admin_watch_decide(i, 'accept', 'opcja 7');
    RAISE EXCEPTION 'przyjęto nieistniejącą opcję';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'przyjęto nieistniejącą opcję' THEN RAISE; END IF;
  END;
  DELETE FROM ops.watch_findings WHERE dedupe_key LIKE 'test-samokontrola:%';
  RAISE NOTICE 'samokontrola OK: ops.watch_findings (quolino), admin_watch_decide (opcje, fałszywy alarm, recheck), web_anon bez dostępu';
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Cofnięcie: DROP FUNCTION admin.admin_watch_decide(bigint, text, text); DROP VIEW admin.watch_findings; DROP TABLE ops.watch_findings;
--            DELETE FROM ops.app_settings WHERE name LIKE 'watch%' OR name = 'ai_alert_day_usd';
