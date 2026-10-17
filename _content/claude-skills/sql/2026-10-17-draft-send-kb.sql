-- Panel admina v4 (JP 2026-10-17): uwagi wysyłane do poprawki jednym przyciskiem + baza wiedzy redakcji.
-- Wymaga 2026-10-16-draft-comments.sql. Bezpieczne do powtórzenia. Wykonuje root po `deploy.sh approve`.
-- Kontrakt i przebieg: docs/BAZA-WIEDZY.md, _admin/README.md §„Wyślij uwagi do poprawki”.
BEGIN;

-- ── 1) Uwagi: „zapisana” (new) → „wysłana do poprawki” (sent) dopiero po przycisku ──────────────
-- Hermes NIE zaczyna już poprawek po 5 minutach ciszy — tylko z draft_revision_requests.
ALTER TABLE public.draft_comments DROP CONSTRAINT IF EXISTS draft_comments_status_check;
ALTER TABLE public.draft_comments ADD CONSTRAINT draft_comments_status_check
  CHECK (status IN ('new', 'sent', 'seen', 'done', 'rejected'));
ALTER TABLE public.draft_comments ADD COLUMN IF NOT EXISTS request_id bigint;
ALTER TABLE public.draft_comments ADD COLUMN IF NOT EXISTS kb_rule_id bigint;   -- reguła, która powstała z tej uwagi
CREATE OR REPLACE VIEW admin.draft_comments AS SELECT * FROM public.draft_comments;

CREATE TABLE IF NOT EXISTS public.draft_revision_requests (
  id            bigserial PRIMARY KEY,
  city_slug     text   NOT NULL,
  city_version  int    NOT NULL,              -- wersja szkicu, na której JP kliknął „Wyślij”
  comment_ids   bigint[] NOT NULL,
  status        text   NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'working', 'done', 'failed')),
  result_version int,                          -- nowa wersja szkicu z poprawkami
  hermes_reply  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS draft_revision_requests_open ON public.draft_revision_requests (status, created_at);
ALTER TABLE public.draft_revision_requests OWNER TO quolino;
REVOKE ALL ON public.draft_revision_requests FROM PUBLIC, web_anon;
REVOKE ALL ON SEQUENCE public.draft_revision_requests_id_seq FROM PUBLIC, web_anon;
CREATE OR REPLACE VIEW admin.draft_revision_requests AS SELECT * FROM public.draft_revision_requests;
ALTER VIEW admin.draft_revision_requests OWNER TO quolino;
GRANT SELECT ON admin.draft_revision_requests TO quolino_admin;

CREATE OR REPLACE FUNCTION admin.admin_send_comments(p_slug text, p_version int)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE ids bigint[]; v_id bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('draft_comments:' || p_slug));
  SELECT array_agg(id ORDER BY id) INTO ids FROM public.draft_comments WHERE city_slug = p_slug AND status = 'new';
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

-- ── 2) Baza wiedzy redakcji: reguły z uwag ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.editorial_rules (
  id                 bigserial PRIMARY KEY,
  rule               text NOT NULL CHECK (length(rule) BETWEEN 10 AND 600),   -- polecenie dla autora, jedno zdanie
  why                text,                                                    -- skąd: streszczenie uwag JP
  scope              text NOT NULL DEFAULT 'all'
                     CHECK (scope IN ('all', 'style', 'facts', 'mission', 'stop', 'city', 'translation')),
  field              text,          -- np. stop.kids_box, city.lead (NULL = każde pole w zakresie)
  category           text,          -- kategoria przystanku (restaurant, church…) albo NULL
  city_slug          text,          -- reguła tylko dla jednego miasta albo NULL
  example_bad        text,
  example_good       text,
  source_comment_ids bigint[] NOT NULL DEFAULT '{}',
  status             text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'active', 'retired')),
  proposed_by        text NOT NULL DEFAULT 'hermes' CHECK (proposed_by IN ('hermes', 'jp', 'claude')),
  decided_at         timestamptz,
  uses               int NOT NULL DEFAULT 0,       -- ile razy reguła trafiła do promptu / walidacji
  violations         int NOT NULL DEFAULT 0,       -- ile razy walidator złapał jej złamanie w szkicu
  last_used_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS editorial_rules_active ON public.editorial_rules (status, scope);
ALTER TABLE public.editorial_rules OWNER TO quolino;
REVOKE ALL ON public.editorial_rules FROM PUBLIC, web_anon;      -- wewnętrzna wiedza redakcji, nie dla strony
REVOKE ALL ON SEQUENCE public.editorial_rules_id_seq FROM PUBLIC, web_anon;
CREATE OR REPLACE VIEW admin.editorial_rules AS SELECT * FROM public.editorial_rules;
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
         decided_at = now(), updated_at = now()
   WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nie ma reguły %', p_id; END IF;
  RETURN json_build_object('id', p_id, 'status', p_status);
END $f$;

-- JP dopisuje regułę sam — od razu obowiązuje
CREATE OR REPLACE FUNCTION admin.admin_rule_add(p_rule text, p_scope text DEFAULT 'all', p_field text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE v_id bigint;
BEGIN
  INSERT INTO public.editorial_rules (rule, scope, field, status, proposed_by, decided_at)
  VALUES (btrim(p_rule), coalesce(p_scope, 'all'), p_field, 'active', 'jp', now()) RETURNING id INTO v_id;
  RETURN json_build_object('id', v_id, 'status', 'active');
END $f$;

ALTER FUNCTION admin.admin_rule_decide(bigint, text, text) OWNER TO quolino;
ALTER FUNCTION admin.admin_rule_add(text, text, text)      OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.admin_rule_decide(bigint, text, text), admin.admin_rule_add(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.admin_rule_decide(bigint, text, text), admin.admin_rule_add(text, text, text) TO quolino_admin;

NOTIFY pgrst, 'reload schema';
COMMIT;
