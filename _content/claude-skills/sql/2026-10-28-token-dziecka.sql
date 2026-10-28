-- Token dziecka do kodu QR zalogowanego rodzica (K2, decyzja JP 2026-10-28; test B-1; docs/KONTO-RODZICA.md §3 trip_runs/kid_token).
-- Problem: QR z city.html niósł tylko klucz testera (k=). Zalogowany rodzic ma sesję, nie klucz, więc telefon dziecka
-- bez sesji dostawał ścianę logowania. Teraz:
--   • kid_token_create(p_slug, p_token) — rodzic (token sesji GoTrue w treści wywołania, jak w trip_member, bo Traefik
--     zdejmuje Authorization) dostaje losowy token dziecka: 192 bity, base64url, ważny do końca bieżącego dnia
--     w strefie Europe/Rome, tylko dla tej trasy. W bazie jest wyłącznie skrót SHA-256 tokenu.
--   • trip_kid(p_slug, p_lang, p_kid) — telefon dziecka (web_anon) pobiera tę samą treść co trip_member/trip_full
--     (ops.trip_payload), bez danych czysto rodzicielskich: telefony, plan dnia z godzinami, rozmówki, ceny, kontakty
--     do lokali i budżet biletów. Błędy rozpoznawalne dla strony: {"error": "kid_invalid" | "kid_expired" | "locked"
--     | "rate_limit" | "not_found"}.
-- Klucz testera (trip_full, k=) działa bez zmian — ten plik go nie dotyka.
-- Gość nie ma SELECT na tabelach bazowych (2026-10-28-zamkniecie-tresci.sql); nowa tabela leży w ops, bez żadnych
-- uprawnień dla web_anon/PUBLIC — tylko przez funkcje SECURITY DEFINER.
-- Wymaga 2026-10-18-trip-member.sql (ops.jwt_claims, ops.trip_payload, pgcrypto w schemacie ops).
-- Bezpieczne do powtórzenia (IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT). W całości albo wcale.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA ops;
GRANT USAGE ON SCHEMA ops TO quolino;

-- ── 1) Przebiegi wycieczki z tokenem dziecka (kontrakt trip_runs; konto = sub z GoTrue) ─────────────────────────
CREATE TABLE IF NOT EXISTS ops.trip_runs (
  id             bigserial   PRIMARY KEY,
  sub            uuid        NOT NULL,                 -- konto rodzica (auth.users.id)
  city_slug      text        NOT NULL,
  kid_token_hash text        NOT NULL UNIQUE,          -- encode(sha256(token), 'hex'); samego tokenu nie przechowujemy
  expires_at     timestamptz NOT NULL,                 -- koniec dnia wydania (Europe/Rome)
  opens          int         NOT NULL DEFAULT 0,       -- ile razy telefon dziecka pobrał treść (limit nadużyć)
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trip_runs_sub_time ON ops.trip_runs (sub, created_at DESC);
CREATE INDEX IF NOT EXISTS trip_runs_expires  ON ops.trip_runs (expires_at);
ALTER TABLE ops.trip_runs OWNER TO quolino;
REVOKE ALL ON ops.trip_runs FROM PUBLIC, web_anon;
REVOKE ALL ON SEQUENCE ops.trip_runs_id_seq FROM PUBLIC, web_anon;

-- ── 2) Rodzic: utwórz token dziecka ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kid_token_create(p_slug text, p_token text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE cl jsonb; v_sub uuid; made int; c public.cities; tok text; v_exp timestamptz;
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
  -- 24 losowe bajty = 192 bity → 32 znaki base64url bez dopełnienia
  tok := translate(rtrim(encode(ops.gen_random_bytes(24), 'base64'), '='), '+/', '-_');
  -- koniec bieżącego dnia w strefie Europe/Rome
  v_exp := (date_trunc('day', now() AT TIME ZONE 'Europe/Rome') + interval '1 day') AT TIME ZONE 'Europe/Rome';
  INSERT INTO ops.trip_runs (sub, city_slug, kid_token_hash, expires_at)
  VALUES (v_sub, p_slug, encode(sha256(convert_to(tok, 'UTF8')), 'hex'), v_exp);
  DELETE FROM ops.trip_runs WHERE expires_at < now() - interval '7 days';
  RETURN jsonb_build_object('token', tok, 'expires_at', v_exp);
END $f$;
ALTER FUNCTION public.kid_token_create(text, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION public.kid_token_create(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kid_token_create(text, text) TO web_anon, quolino;

-- ── 3) Telefon dziecka: treść trasy po tokenie ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trip_kid(p_slug text, p_lang text, p_kid text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE r ops.trip_runs; c public.cities; payload jsonb; v_stops jsonb;
BEGIN
  IF p_kid IS NULL OR p_slug IS NULL OR length(p_kid) < 32 OR length(p_kid) > 64 THEN
    RETURN jsonb_build_object('error', 'kid_invalid');
  END IF;
  SELECT * INTO r FROM ops.trip_runs
   WHERE kid_token_hash = encode(sha256(convert_to(p_kid, 'UTF8')), 'hex') AND city_slug = p_slug;
  IF r.id IS NULL THEN RETURN jsonb_build_object('error', 'kid_invalid'); END IF;
  IF r.expires_at <= now() THEN RETURN jsonb_build_object('error', 'kid_expired'); END IF;
  IF r.opens >= 500 THEN RETURN jsonb_build_object('error', 'rate_limit'); END IF;
  SELECT * INTO c FROM public.cities WHERE slug = p_slug AND status = 'published';
  IF c.slug IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF now() >= timestamptz '2027-06-01 00:00:00+02' AND c.access <> 'free' THEN
    RETURN jsonb_build_object('error', 'locked');
  END IF;
  payload := ops.trip_payload(p_slug, p_lang);
  IF payload IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  UPDATE ops.trip_runs SET opens = opens + 1 WHERE id = r.id;

  -- widok dziecka bez komercji: z przystanków znikają ceny, kontakty i rezerwacje (brakujące klucze są pomijane)
  SELECT coalesce(jsonb_agg(
           (s - ARRAY['price', 'price_status', 'phone', 'whatsapp', 'website', 'verify_url', 'reservation'])
           || jsonb_build_object('stop_translations',
                coalesce((SELECT jsonb_agg(t - ARRAY['price']) FROM jsonb_array_elements(s -> 'stop_translations') t), '[]'))
           ORDER BY o), '[]')
    INTO v_stops
    FROM jsonb_array_elements(payload -> 'stops') WITH ORDINALITY AS x(s, o);

  RETURN (payload - ARRAY['phone_numbers', 'day_plan', 'phrases'])
         || jsonb_build_object(
              'city',  (payload -> 'city') - ARRAY['tickets_budget', 'parking_cost'],
              'stops', v_stops,
              'kid',   true);
END $f$;
ALTER FUNCTION public.trip_kid(text, text, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION public.trip_kid(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trip_kid(text, text, text) TO web_anon, quolino;

-- ── 4) Tekst ekranu dziecka (PL + EN; resztę języków dotłumaczy cogodzinny skrypt) ─────────────────────────────
INSERT INTO public.ui_translations (key, lang, value) VALUES
  ('kid.ask_parent', 'pl', 'Poproś rodzica, żeby otworzył Quolino i pokazał Ci kod QR.'),
  ('kid.ask_parent', 'en', 'Ask your parent to open Quolino and show you the QR code.')
ON CONFLICT (key, lang) DO UPDATE SET value = EXCLUDED.value;

-- samokontrola: gość nie czyta tabeli tokenów, a obie funkcje może wywołać
DO $$
BEGIN
  IF has_table_privilege('web_anon', 'ops.trip_runs', 'SELECT') THEN
    RAISE EXCEPTION 'web_anon czyta ops.trip_runs — wycofuję';
  END IF;
  IF NOT has_function_privilege('web_anon', 'public.kid_token_create(text, text)', 'EXECUTE')
     OR NOT has_function_privilege('web_anon', 'public.trip_kid(text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'web_anon nie może wywołać kid_token_create/trip_kid — wycofuję';
  END IF;
  RAISE NOTICE 'samokontrola OK: tokeny dziecka tylko przez funkcje';
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
