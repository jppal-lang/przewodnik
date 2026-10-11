-- Przeglądy i zgłoszenia (decyzja JP 2026-10-11): linki, zgłoszenia od rodzin.
BEGIN;

-- 1) przegląd linków (links-check.mjs, co miesiąc)
CREATE TABLE IF NOT EXISTS public.link_checks (
  id         bigserial PRIMARY KEY,
  checked_at timestamptz NOT NULL DEFAULT now(),
  url        text NOT NULL,
  status     int,
  final_url  text,
  error      text,
  city_slugs text[]
);
CREATE INDEX IF NOT EXISTS link_checks_url ON public.link_checks (url, checked_at DESC);
ALTER TABLE public.link_checks OWNER TO quolino;
REVOKE ALL ON public.link_checks FROM PUBLIC;

-- 2) zgłoszenia od rodzin: przycisk „Zgłoś błąd” przy przystanku → ops.reports → wątek miasta (reports-relay.mjs)
ALTER TABLE ops.reports ADD COLUMN IF NOT EXISTS client_id  uuid;
ALTER TABLE ops.reports ADD COLUMN IF NOT EXISTS stop_name  text;
ALTER TABLE ops.reports ADD COLUMN IF NOT EXISTS relayed_at timestamptz;
CREATE INDEX IF NOT EXISTS reports_client_day ON ops.reports (client_id, created_at);
-- zgłoszenia dotyczą wycieczek z public.cities; ops.cities nie musi znać każdego miasta (Spello i nowsze)
DO $d$ DECLARE r record; BEGIN
  FOR r IN SELECT conname FROM pg_constraint WHERE conrelid = 'ops.reports'::regclass AND contype = 'f'
             AND confrelid = 'ops.cities'::regclass LOOP
    EXECUTE format('ALTER TABLE ops.reports DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $d$;

CREATE OR REPLACE FUNCTION public.report_issue(p_city text, p_stop int, p_type text, p_message text,
    p_lang text DEFAULT 'pl', p_client uuid DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, ops, pg_temp AS $f$
DECLARE v_name text; v_msg text := btrim(coalesce(p_message, ''));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cities WHERE slug = p_city AND status = 'published') THEN
    RAISE EXCEPTION 'Nieznana wycieczka';
  END IF;
  IF p_type NOT IN ('wrong_price','closed','wrong_hours','wrong_address','other') THEN p_type := 'other'; END IF;
  IF char_length(v_msg) < 5 OR char_length(v_msg) > 1000 THEN RAISE EXCEPTION 'Opis: od 5 do 1000 znaków'; END IF;
  IF v_msg ~* '(https?://|www\.)' AND char_length(v_msg) < 40 THEN RAISE EXCEPTION 'Opis wygląda na link — napisz, co się nie zgadza'; END IF;
  -- limity: 5 zgłoszeń dziennie z jednego urządzenia, 40 na godzinę na całą wycieczkę
  IF p_client IS NOT NULL AND (SELECT count(*) FROM ops.reports WHERE client_id = p_client AND created_at > now() - interval '1 day') >= 5 THEN
    RAISE EXCEPTION 'Dziękujemy — na dziś to już wystarczy zgłoszeń z tego urządzenia';
  END IF;
  IF (SELECT count(*) FROM ops.reports WHERE city_slug = p_city AND created_at > now() - interval '1 hour') >= 40 THEN
    RAISE EXCEPTION 'Za dużo zgłoszeń naraz — spróbuj później';
  END IF;
  SELECT t.name INTO v_name FROM public.stops s JOIN public.stop_translations t ON t.stop_id = s.id AND t.lang = 'pl'
   WHERE s.city_slug = p_city AND s.stop_number = p_stop LIMIT 1;
  INSERT INTO ops.reports (city_slug, stop_id, type, message, lang, client_id, stop_name)
  VALUES (p_city, coalesce(p_stop::text, '0'), p_type, v_msg, left(coalesce(p_lang, 'pl'), 5), p_client, v_name);
  RETURN json_build_object('ok', true);
END $f$;
ALTER FUNCTION public.report_issue(text, int, text, text, text, uuid) OWNER TO quolino;
REVOKE ALL ON FUNCTION public.report_issue(text, int, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_issue(text, int, text, text, text, uuid) TO web_anon;

CREATE OR REPLACE VIEW admin.reports AS
  SELECT id, created_at, city_slug, stop_id, stop_name, type, message, lang, status, relayed_at FROM ops.reports;
ALTER VIEW admin.reports OWNER TO quolino;
GRANT SELECT ON admin.reports TO quolino_admin;

NOTIFY pgrst, 'reload schema';
COMMIT;
