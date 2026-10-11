-- Opinie rodzin o wycieczkach (decyzja JP 2026-10-11): ocena 1–5 + uwagi na końcu wycieczki.
-- Opinia z treścią → wątek miasta (reports-relay.mjs) → Hermes proponuje JP poprawkę. Bez danych osobowych.
-- Bezpieczne do powtórzenia.
BEGIN;
ALTER TABLE ops.ratings ADD COLUMN IF NOT EXISTS relayed_at timestamptz;
ALTER TABLE ops.ratings ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new';
CREATE INDEX IF NOT EXISTS ratings_client_day ON ops.ratings (client_id, updated_at);
-- opinie dotyczą wycieczek z public.cities (jak zgłoszenia) — zdejmujemy powiązanie z ops.cities
DO $d$ DECLARE r record; BEGIN
  FOR r IN SELECT conname FROM pg_constraint WHERE conrelid = 'ops.ratings'::regclass AND contype = 'f'
             AND confrelid = 'ops.cities'::regclass LOOP
    EXECUTE format('ALTER TABLE ops.ratings DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $d$;

-- jedna opinia o wycieczce z urządzenia; ponowne wysłanie ją poprawia
CREATE OR REPLACE FUNCTION public.rate_trip(p_city text, p_stars int, p_comment text DEFAULT NULL,
    p_lang text DEFAULT 'pl', p_client uuid DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, ops, pg_temp AS $f$
DECLARE v_c text := nullif(btrim(coalesce(p_comment, '')), '');
BEGIN
  IF p_client IS NULL THEN RAISE EXCEPTION 'Brak identyfikatora urządzenia'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cities WHERE slug = p_city AND status = 'published') THEN
    RAISE EXCEPTION 'Nieznana wycieczka';
  END IF;
  IF p_stars IS NULL OR p_stars < 1 OR p_stars > 5 THEN RAISE EXCEPTION 'Ocena: od 1 do 5'; END IF;
  IF char_length(v_c) > 500 THEN RAISE EXCEPTION 'Opinia: najwyżej 500 znaków'; END IF;
  IF v_c ~* '(https?://|www\.)' AND char_length(v_c) < 40 THEN RAISE EXCEPTION 'Opinia wygląda na link'; END IF;
  -- limity: 10 opinii dziennie z urządzenia, 60 na godzinę na wycieczkę
  IF (SELECT count(*) FROM ops.ratings WHERE client_id = p_client AND updated_at > now() - interval '1 day') >= 10 THEN
    RAISE EXCEPTION 'Dziękujemy — na dziś wystarczy';
  END IF;
  IF (SELECT count(*) FROM ops.ratings WHERE city_slug = p_city AND updated_at > now() - interval '1 hour') >= 60 THEN
    RAISE EXCEPTION 'Za dużo opinii naraz — spróbuj później';
  END IF;
  INSERT INTO ops.ratings (city_slug, stop_id, stars, comment, client_id, lang)
  VALUES (p_city, NULL, p_stars, v_c, p_client, left(coalesce(p_lang, 'pl'), 5))
  ON CONFLICT ON CONSTRAINT ratings_city_slug_stop_id_client_id_key DO UPDATE
    SET stars = EXCLUDED.stars, comment = EXCLUDED.comment, lang = EXCLUDED.lang, updated_at = now(),
        relayed_at = CASE WHEN ops.ratings.comment IS DISTINCT FROM EXCLUDED.comment THEN NULL ELSE ops.ratings.relayed_at END,
        status     = CASE WHEN ops.ratings.comment IS DISTINCT FROM EXCLUDED.comment THEN 'new' ELSE ops.ratings.status END;
  RETURN json_build_object('ok', true);
END $f$;
ALTER FUNCTION public.rate_trip(text, int, text, text, uuid) OWNER TO quolino;
REVOKE ALL ON FUNCTION public.rate_trip(text, int, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rate_trip(text, int, text, text, uuid) TO web_anon;

CREATE OR REPLACE VIEW admin.opinions AS
  SELECT id, updated_at, city_slug, stars, comment, lang, status, relayed_at FROM ops.ratings WHERE stop_id IS NULL;
ALTER VIEW admin.opinions OWNER TO quolino;
GRANT SELECT ON admin.opinions TO quolino_admin;

NOTIFY pgrst, 'reload schema';
COMMIT;
