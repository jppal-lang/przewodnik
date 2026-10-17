-- Panel admina v4 (JP 2026-10-17): uwagi wysyłane do poprawki jednym przyciskiem + baza wiedzy redakcji.
-- Wymaga 2026-10-16-draft-comments.sql i trip-drafts.sql. Bezpieczne do powtórzenia. Wykonuje root po `deploy.sh approve`.
-- Kontrakt i przebieg: docs/BAZA-WIEDZY.md, _admin/README.md §„Wyślij uwagi do poprawki”.
-- Wersja 2 (17.10, nowa nazwa pliku, poprzedni plik usunięty): pierwsza wersja padała przy approve, bo public.editorial_rules już istnieje (trip-drafts.sql, kolumna active)
-- i CREATE TABLE IF NOT EXISTS jej nie zmieniał. Teraz rozszerzamy istniejącą tabelę; skrypty Hermesa (active) działają dalej.
BEGIN;

-- ── 1) Uwagi: „zapisana” (new) → „wysłana do poprawki” (sent) dopiero po przycisku ──────────────
-- Hermes NIE zaczyna już poprawek po 5 minutach ciszy — tylko z draft_revision_requests (bin/draft-comments.mjs).
ALTER TABLE public.draft_comments DROP CONSTRAINT IF EXISTS draft_comments_status_check;
ALTER TABLE public.draft_comments ADD CONSTRAINT draft_comments_status_check
  CHECK (status IN ('new', 'sent', 'seen', 'done', 'rejected'));
ALTER TABLE public.draft_comments ADD COLUMN IF NOT EXISTS request_id bigint;
ALTER TABLE public.draft_comments ADD COLUMN IF NOT EXISTS kb_rule_id bigint;   -- reguła, która powstała z tej uwagi
CREATE OR REPLACE VIEW admin.draft_comments AS SELECT * FROM public.draft_comments;

CREATE TABLE IF NOT EXISTS public.draft_revision_requests (
  id             bigserial PRIMARY KEY,
  city_slug      text   NOT NULL,
  city_version   int    NOT NULL,              -- wersja szkicu, na której JP kliknął „Wyślij”
  comment_ids    bigint[] NOT NULL,
  status         text   NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'working', 'done', 'failed')),
  result_version int,                          -- nowa wersja szkicu z poprawkami
  hermes_reply   text,
  attempts       int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.draft_revision_requests ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS draft_revision_requests_open ON public.draft_revision_requests (status, created_at);
ALTER TABLE public.draft_revision_requests OWNER TO quolino;
REVOKE ALL ON public.draft_revision_requests FROM PUBLIC, web_anon;
REVOKE ALL ON SEQUENCE public.draft_revision_requests_id_seq FROM PUBLIC, web_anon;
CREATE OR REPLACE VIEW admin.draft_revision_requests AS SELECT * FROM public.draft_revision_requests;
ALTER VIEW admin.draft_revision_requests OWNER TO quolino;
GRANT SELECT ON admin.draft_revision_requests TO quolino_admin;

-- Wysyła WSZYSTKIE zapisane uwagi miasta (status new) jedną prośbą. Uwagi „seen” z dawnego trybu (bez prośby) też idą,
-- żeby nic nie utknęło między trybami.
CREATE OR REPLACE FUNCTION admin.admin_send_comments(p_slug text, p_version int)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE ids bigint[]; v_id bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('draft_comments:' || p_slug));
  SELECT array_agg(id ORDER BY id) INTO ids FROM public.draft_comments
   WHERE city_slug = p_slug AND (status = 'new' OR (status = 'seen' AND request_id IS NULL));
  IF ids IS NULL THEN RAISE EXCEPTION 'Brak nowych uwag do wysłania (%).', p_slug; END IF;
  INSERT INTO public.draft_revision_requests (city_slug, city_version, comment_ids)
  VALUES (p_slug, p_version, ids) RETURNING id INTO v_id;
  UPDATE public.draft_comments SET status = 'sent', request_id = v_id, updated_at = now() WHERE id = ANY(ids);
  PERFORM pg_notify('draft_revision', p_slug || ':' || v_id);
  RETURN json_build_object('request_id', v_id, 'sent', cardinality(ids));
END $f$;
ALTER FUNCTION admin.admin_send_comments(text, int) OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.admin_send_comments(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.admin_send_comments(text, int) TO quolino_admin;

-- ── 2) Baza wiedzy redakcji: istniejąca tabela reguł Hermesa + pola dla panelu ────────────────────
-- Zakresy (scope) zostają takie jak u Hermesa: quest, opis, praktyczne, plan-dnia, ton, struktura, fakty, inne.
-- status (proposed / active / retired) i active (bool, używany przez skrypty Hermesa) są zsynchronizowane wyzwalaczem.
ALTER TABLE public.editorial_rules ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.editorial_rules ADD COLUMN IF NOT EXISTS field text;
ALTER TABLE public.editorial_rules ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.editorial_rules ADD COLUMN IF NOT EXISTS city_slug text;
ALTER TABLE public.editorial_rules ADD COLUMN IF NOT EXISTS source_comment_ids bigint[] NOT NULL DEFAULT '{}';
ALTER TABLE public.editorial_rules ADD COLUMN IF NOT EXISTS proposed_by text NOT NULL DEFAULT 'hermes';
ALTER TABLE public.editorial_rules ADD COLUMN IF NOT EXISTS decided_at timestamptz;
ALTER TABLE public.editorial_rules ADD COLUMN IF NOT EXISTS uses int NOT NULL DEFAULT 0;
ALTER TABLE public.editorial_rules ADD COLUMN IF NOT EXISTS violations int NOT NULL DEFAULT 0;
ALTER TABLE public.editorial_rules ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
UPDATE public.editorial_rules SET status = CASE WHEN active THEN 'active' ELSE 'retired' END WHERE status IS NULL;
ALTER TABLE public.editorial_rules ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE public.editorial_rules ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.editorial_rules DROP CONSTRAINT IF EXISTS editorial_rules_status_check;
ALTER TABLE public.editorial_rules ADD CONSTRAINT editorial_rules_status_check CHECK (status IN ('proposed', 'active', 'retired'));
ALTER TABLE public.editorial_rules DROP CONSTRAINT IF EXISTS editorial_rules_proposed_by_check;
ALTER TABLE public.editorial_rules ADD CONSTRAINT editorial_rules_proposed_by_check CHECK (proposed_by IN ('hermes', 'jp', 'claude'));
CREATE INDEX IF NOT EXISTS editorial_rules_status ON public.editorial_rules (status, scope);

CREATE OR REPLACE FUNCTION public.editorial_rules_sync() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS NULL OR (NEW.status = 'active' AND NEW.active IS FALSE) THEN
      NEW.status := CASE WHEN NEW.active IS FALSE THEN 'retired' ELSE 'active' END;
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    NULL;                                              -- panel zmienił status → active liczymy niżej
  ELSIF NEW.active IS DISTINCT FROM OLD.active THEN
    NEW.status := CASE WHEN NEW.active THEN 'active' ELSE 'retired' END;   -- trip-rules.mjs on/off
  END IF;
  NEW.active := (NEW.status = 'active');
  RETURN NEW;
END $f$;
ALTER FUNCTION public.editorial_rules_sync() OWNER TO quolino;
DROP TRIGGER IF EXISTS editorial_rules_sync ON public.editorial_rules;
CREATE TRIGGER editorial_rules_sync BEFORE INSERT OR UPDATE ON public.editorial_rules
  FOR EACH ROW EXECUTE FUNCTION public.editorial_rules_sync();

-- widok dla panelu (nazwy pól jak w _admin/admin.js); kolumny zmieniają kolejność, więc DROP + CREATE
DROP VIEW IF EXISTS admin.editorial_rules;
CREATE VIEW admin.editorial_rules AS
  SELECT id, status, active, scope, rule, why, field, category, coalesce(city_slug, origin_city) AS city_slug,
         bad AS example_bad, good AS example_good, origin_city, origin_version, origin_say,
         source_comment_ids, proposed_by, decided_at, uses, violations, last_used_at, created_at, updated_at
    FROM public.editorial_rules;
ALTER VIEW admin.editorial_rules OWNER TO quolino;
GRANT SELECT ON admin.editorial_rules TO quolino_admin;

-- JP zatwierdza / odrzuca / wyłącza regułę (może poprawić jej treść przy zatwierdzaniu)
CREATE OR REPLACE FUNCTION admin.admin_rule_decide(p_id bigint, p_status text, p_rule text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
BEGIN
  IF p_status NOT IN ('active', 'retired') THEN RAISE EXCEPTION 'Nieznany status: %', p_status; END IF;
  UPDATE public.editorial_rules
     SET status = p_status,
         rule = CASE WHEN p_rule IS NOT NULL AND length(btrim(p_rule)) BETWEEN 10 AND 600 THEN btrim(p_rule) ELSE rule END,
         history = history || jsonb_build_array(jsonb_build_object('at', now(), 'by', 'jp', 'status', p_status)),
         decided_at = now(), updated_at = now()
   WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nie ma reguły %', p_id; END IF;
  RETURN json_build_object('id', p_id, 'status', p_status);
END $f$;

-- JP dopisuje regułę sam — od razu obowiązuje
CREATE OR REPLACE FUNCTION admin.admin_rule_add(p_rule text, p_scope text DEFAULT 'inne', p_field text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE v_id bigint;
BEGIN
  IF length(btrim(coalesce(p_rule, ''))) NOT BETWEEN 10 AND 600 THEN RAISE EXCEPTION 'Reguła: od 10 do 600 znaków.'; END IF;
  INSERT INTO public.editorial_rules (rule, scope, field, status, proposed_by, decided_at, why)
  VALUES (btrim(p_rule), coalesce(nullif(p_scope, ''), 'inne'), p_field, 'active', 'jp', now(), 'Dodana przez JP w panelu.')
  RETURNING id INTO v_id;
  RETURN json_build_object('id', v_id, 'status', 'active');
END $f$;

ALTER FUNCTION admin.admin_rule_decide(bigint, text, text) OWNER TO quolino;
ALTER FUNCTION admin.admin_rule_add(text, text, text)      OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.admin_rule_decide(bigint, text, text), admin.admin_rule_add(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.admin_rule_decide(bigint, text, text), admin.admin_rule_add(text, text, text) TO quolino_admin;

NOTIFY pgrst, 'reload schema';
COMMIT;
