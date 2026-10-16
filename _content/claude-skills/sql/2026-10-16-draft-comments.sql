-- Uwagi JP do szkiców → Hermes (panel admina v3, _admin/README.md §„Uwagi do szkiców → Hermes”).
-- Bezpieczne do powtórzenia. Wykonuje root po `deploy.sh approve` (schemat admin jest poza zasięgiem roli quolino).
BEGIN;
CREATE TABLE IF NOT EXISTS public.draft_comments (
  id bigserial PRIMARY KEY,
  city_slug text NOT NULL,
  city_version int NOT NULL,
  stop_key text,
  stop_version int,
  field text,
  field_label text,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'seen', 'done', 'rejected')),
  hermes_reply text,
  resolved_in_version int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS draft_comments_city ON public.draft_comments (city_slug, status);
ALTER TABLE public.draft_comments OWNER TO quolino;
-- uwagi redakcji nie są publiczne: anon (strona) nie ma do nich żadnego dostępu
REVOKE ALL ON public.draft_comments FROM PUBLIC, web_anon;
REVOKE ALL ON SEQUENCE public.draft_comments_id_seq FROM PUBLIC, web_anon;

CREATE OR REPLACE VIEW admin.draft_comments AS SELECT * FROM public.draft_comments;
ALTER VIEW admin.draft_comments OWNER TO quolino;
GRANT SELECT ON admin.draft_comments TO quolino_admin;
GRANT INSERT (city_slug, city_version, stop_key, stop_version, field, field_label, body) ON admin.draft_comments TO quolino_admin;

-- Hermes odpytuje co kilka minut status = 'new'; NOTIFY na zapas (LISTEN draft_comment)
CREATE OR REPLACE FUNCTION public.draft_comments_notify() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN PERFORM pg_notify('draft_comment', NEW.city_slug || ':' || NEW.id); RETURN NEW; END $f$;
DROP TRIGGER IF EXISTS draft_comments_notify ON public.draft_comments;
CREATE TRIGGER draft_comments_notify AFTER INSERT ON public.draft_comments
  FOR EACH ROW EXECUTE FUNCTION public.draft_comments_notify();
COMMIT;
