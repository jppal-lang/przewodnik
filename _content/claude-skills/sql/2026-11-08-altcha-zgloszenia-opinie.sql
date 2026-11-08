-- JP 2026-11-08 („czy działa mechanizm sprawdzenia, czy jest ktoś człowiekiem?” → „resztę zrób”):
-- zgłoszenia przy przystankach (report_issue) i opinie (rate_trip) wymagają niewidocznego sprawdzenia ALTCHA, jak formularz kontaktowy.
-- Przeglądarka liczy je sama w tle (qpow.js), bez klikania. Stare wersje funkcji (bez p_altcha) znikają, żeby nie dało się ich obejść.
-- Wymaga ops.pow_verify (2026-10-17-contact-altcha.sql). Strona: city.html → qpow.js?v=1, report-issue.js?v=6, opinion.js?v=5.
BEGIN;
DROP FUNCTION IF EXISTS public.report_issue(text, int, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.rate_trip(text, int, text, text, uuid);

CREATE OR REPLACE FUNCTION public.report_issue(p_city text, p_stop int, p_type text, p_message text,
    p_lang text DEFAULT 'pl', p_client uuid DEFAULT NULL, p_altcha text DEFAULT NULL)
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
  IF NOT ops.pow_verify(p_altcha) THEN RAISE EXCEPTION 'Nie udało się potwierdzić, że piszesz z przeglądarki — odśwież stronę i spróbuj jeszcze raz.'; END IF;
  SELECT t.name INTO v_name FROM public.stops s JOIN public.stop_translations t ON t.stop_id = s.id AND t.lang = 'pl'
   WHERE s.city_slug = p_city AND s.stop_number = p_stop LIMIT 1;
  INSERT INTO ops.reports (city_slug, stop_id, type, message, lang, client_id, stop_name)
  VALUES (p_city, coalesce(p_stop::text, '0'), p_type, v_msg, left(coalesce(p_lang, 'pl'), 5), p_client, v_name);
  RETURN json_build_object('ok', true);
END $f$;
ALTER FUNCTION public.report_issue(text, int, text, text, text, uuid, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION public.report_issue(text, int, text, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_issue(text, int, text, text, text, uuid, text) TO web_anon;

CREATE OR REPLACE FUNCTION public.rate_trip(p_city text, p_stars int, p_comment text DEFAULT NULL,
    p_lang text DEFAULT 'pl', p_client uuid DEFAULT NULL, p_altcha text DEFAULT NULL)
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
  IF NOT ops.pow_verify(p_altcha) THEN RAISE EXCEPTION 'Nie udało się potwierdzić, że piszesz z przeglądarki — odśwież stronę i spróbuj jeszcze raz.'; END IF;
  INSERT INTO ops.ratings (city_slug, stop_id, stars, comment, client_id, lang)
  VALUES (p_city, NULL, p_stars, v_c, p_client, left(coalesce(p_lang, 'pl'), 5))
  ON CONFLICT ON CONSTRAINT ratings_city_slug_stop_id_client_id_key DO UPDATE
    SET stars = EXCLUDED.stars, comment = EXCLUDED.comment, lang = EXCLUDED.lang, updated_at = now(),
        relayed_at = CASE WHEN ops.ratings.comment IS DISTINCT FROM EXCLUDED.comment THEN NULL ELSE ops.ratings.relayed_at END,
        status     = CASE WHEN ops.ratings.comment IS DISTINCT FROM EXCLUDED.comment THEN 'new' ELSE ops.ratings.status END;
  RETURN json_build_object('ok', true);
END $f$;
ALTER FUNCTION public.rate_trip(text, int, text, text, uuid, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION public.rate_trip(text, int, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rate_trip(text, int, text, text, uuid, text) TO web_anon;
COMMIT;
NOTIFY pgrst, 'reload schema';
