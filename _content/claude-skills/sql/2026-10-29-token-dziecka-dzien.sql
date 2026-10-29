-- Token dziecka ważny w DNIU TRASY (decyzja JP 2026-10-29).
-- Problem: kid_token_create(p_slug, p_token) z 2026-10-28-token-dziecka.sql daje token ważny do północy (Europe/Rome)
-- dnia wydania. QR wysłany wieczorem z opcją „Jutro — zapowiedź na wieczór” (karta QR w city.html, day= w linku)
-- rano już nie działał (kid_expired).
-- Teraz kid_token_create(p_slug, p_token, p_day date DEFAULT NULL):
--   • p_day = jutro (wg Europe/Rome) → token ważny od teraz do końca jutrzejszego dnia (Europe/Rome);
--   • p_day NULL, dziś albo inna data (wczoraj, pojutrze…) → obcięcie do dziś: ważny do końca bieżącego dnia, jak dotąd.
--   Odpowiedź: {"token", "expires_at", "day"} — "day" to dzień, na który token faktycznie wydano (po obcięciu).
-- Stara sygnatura (text, text) znika, ale wywołanie z dwoma parametrami działa dalej dzięki DEFAULT
-- (PostgREST dopasowuje funkcję po nazwach podanych parametrów; brakujący p_day bierze wartość domyślną).
-- Wymaga 2026-10-28-token-dziecka.sql (ops.trip_runs, ops.jwt_claims, pgcrypto w ops). trip_kid bez zmian —
-- i tak sprawdza tylko expires_at. Bezpieczne do powtórzenia (DROP IF EXISTS / CREATE OR REPLACE). W całości albo wcale.
BEGIN;

DROP FUNCTION IF EXISTS public.kid_token_create(text, text);

CREATE OR REPLACE FUNCTION public.kid_token_create(p_slug text, p_token text, p_day date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE cl jsonb; v_sub uuid; made int; c public.cities; tok text; v_exp timestamptz; v_today date; v_day date;
BEGIN
  -- weryfikacja rodzica jak w trip_member: podpis, ważność, rola 'authenticated'
  cl := ops.jwt_claims(p_token);
  IF cl IS NULL THEN RETURN jsonb_build_object('error', 'invalid_session'); END IF;
  v_sub := (cl ->> 'sub')::uuid;
  SELECT count(*) INTO made FROM ops.trip_runs WHERE sub = v_sub AND created_at > now() - interval '1 hour';
  IF made >= 60 THEN RETURN jsonb_build_object('error', 'rate_limit'); END IF;
  SELECT * INTO c FROM public.cities WHERE slug = p_slug AND status = 'published';
  IF c.slug IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  -- ta sama zasada dostępu co trip_member (docs/KONTO-RODZICA.md §4)
  IF now() >= timestamptz '2027-06-01 00:00:00+02' AND c.access <> 'free' THEN
    RETURN jsonb_build_object('error', 'locked');
  END IF;
  -- dzień trasy: tylko dziś albo jutro (Europe/Rome); wszystko inne obcinamy do dziś
  v_today := (now() AT TIME ZONE 'Europe/Rome')::date;
  v_day := CASE WHEN p_day = v_today + 1 THEN p_day ELSE v_today END;
  -- 24 losowe bajty = 192 bity → 32 znaki base64url bez dopełnienia
  tok := translate(rtrim(encode(ops.gen_random_bytes(24), 'base64'), '='), '+/', '-_');
  -- koniec dnia trasy w strefie Europe/Rome (północ po v_day)
  v_exp := ((v_day + 1)::timestamp) AT TIME ZONE 'Europe/Rome';
  INSERT INTO ops.trip_runs (sub, city_slug, kid_token_hash, expires_at)
  VALUES (v_sub, p_slug, encode(sha256(convert_to(tok, 'UTF8')), 'hex'), v_exp);
  DELETE FROM ops.trip_runs WHERE expires_at < now() - interval '7 days';
  RETURN jsonb_build_object('token', tok, 'expires_at', v_exp, 'day', v_day);
END $f$;
ALTER FUNCTION public.kid_token_create(text, text, date) OWNER TO quolino;
REVOKE ALL ON FUNCTION public.kid_token_create(text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kid_token_create(text, text, date) TO web_anon, quolino;

COMMENT ON COLUMN ops.trip_runs.expires_at IS 'koniec dnia trasy (Europe/Rome): dzień wydania albo jutro (p_day)';

-- samokontrola: jedna wersja funkcji, gość może ją wywołać, nie czyta tabeli tokenów; obcięcie dat działa
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND p.proname = 'kid_token_create';
  IF n <> 1 THEN RAISE EXCEPTION 'kid_token_create: % wersji zamiast 1 — wycofuję', n; END IF;
  IF NOT has_function_privilege('web_anon', 'public.kid_token_create(text, text, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'web_anon nie może wywołać kid_token_create — wycofuję';
  END IF;
  IF has_function_privilege('public', 'public.kid_token_create(text, text, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC może wywołać kid_token_create — wycofuję';
  END IF;
  IF has_table_privilege('web_anon', 'ops.trip_runs', 'SELECT') THEN
    RAISE EXCEPTION 'web_anon czyta ops.trip_runs — wycofuję';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.kid_token_create(text, text, date)'::regprocedure
                  AND prosecdef AND proconfig @> ARRAY['search_path=public, pg_temp']) THEN
    RAISE EXCEPTION 'kid_token_create bez SECURITY DEFINER / search_path — wycofuję';
  END IF;
  -- bez ważnej sesji funkcja odpowiada błędem, a nie wyjątkiem (oba warianty wywołania)
  IF public.kid_token_create('x', 'zly-token') ->> 'error' IS DISTINCT FROM 'invalid_session'
     OR public.kid_token_create('x', 'zly-token', current_date + 1) ->> 'error' IS DISTINCT FROM 'invalid_session' THEN
    RAISE EXCEPTION 'kid_token_create nie odrzuca złej sesji — wycofuję';
  END IF;
  RAISE NOTICE 'samokontrola OK: token dziecka do końca dnia trasy (dziś albo jutro)';
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
