-- SZKIC DO ZATWIERDZENIA JP — NIE WDROŻONY. I-12 „Plan dla drugiego rodzica” (decyzja JP 2026-10-29, raport pomysłów).
-- Problem: drugi rodzic dostaje link do trasy i trafia na ścianę logowania. Teraz zalogowany rodzic wysyła link z tokenem
-- planu, który przez 72 h otwiera pełny widok rodzica tej jednej trasy bez zakładania konta.
--   • plan_token_create(p_slug, p_token) — rodzic (token sesji GoTrue w treści wywołania, jak w kid_token_create)
--     dostaje losowy token: 192 bity, base64url, ważny 72 h, tylko dla tej trasy. W bazie wyłącznie skrót SHA-256.
--   • trip_plan(p_slug, p_lang, p_pt) — telefon drugiego rodzica (web_anon) pobiera tę samą treść co trip_member
--     (ops.trip_payload). Błędy rozpoznawalne dla strony: {"error": "plan_invalid" | "plan_expired" | "locked"
--     | "rate_limit" | "not_found"}; city.html przy plan_invalid/plan_expired pokazuje „Link do planu wygasł…”.
-- Frontend (city.html, trip-tools.js) już woła obie funkcje; bez nich link działa jak zwykły link gościa.
-- Wymaga 2026-10-18-trip-member.sql (ops.jwt_claims, ops.trip_payload) i pgcrypto w ops (2026-10-28-token-dziecka.sql).
-- Bezpieczne do powtórzenia (IF NOT EXISTS / CREATE OR REPLACE). W całości albo wcale.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA ops;

CREATE TABLE IF NOT EXISTS ops.plan_shares (
  id          bigserial   PRIMARY KEY,
  sub         uuid        NOT NULL,                 -- konto rodzica, który wysłał plan
  city_slug   text        NOT NULL,
  token_hash  text        NOT NULL UNIQUE,          -- encode(sha256(token), 'hex')
  expires_at  timestamptz NOT NULL,                 -- now() + 72 h
  opens       int         NOT NULL DEFAULT 0,       -- limit nadużyć (link wysłany dalej niż do drugiego rodzica)
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plan_shares_sub_time ON ops.plan_shares (sub, created_at DESC);
CREATE INDEX IF NOT EXISTS plan_shares_expires  ON ops.plan_shares (expires_at);
ALTER TABLE ops.plan_shares OWNER TO quolino;
REVOKE ALL ON ops.plan_shares FROM PUBLIC, web_anon;
REVOKE ALL ON SEQUENCE ops.plan_shares_id_seq FROM PUBLIC, web_anon;

CREATE OR REPLACE FUNCTION public.plan_token_create(p_slug text, p_token text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE cl jsonb; v_sub uuid; made int; c public.cities; tok text; v_exp timestamptz;
BEGIN
  cl := ops.jwt_claims(p_token);
  IF cl IS NULL THEN RETURN jsonb_build_object('error', 'invalid_session'); END IF;
  v_sub := (cl ->> 'sub')::uuid;
  SELECT count(*) INTO made FROM ops.plan_shares WHERE sub = v_sub AND created_at > now() - interval '1 hour';
  IF made >= 20 THEN RETURN jsonb_build_object('error', 'rate_limit'); END IF;
  SELECT * INTO c FROM public.cities WHERE slug = p_slug AND status = 'published';
  IF c.slug IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF now() >= timestamptz '2027-06-01 00:00:00+02' AND c.access <> 'free' THEN
    RETURN jsonb_build_object('error', 'locked');   -- po starcie płatności: decyzja JP (jedna licencja na rodzinę)
  END IF;
  tok := translate(rtrim(encode(ops.gen_random_bytes(24), 'base64'), '='), '+/', '-_');
  v_exp := now() + interval '72 hours';
  INSERT INTO ops.plan_shares (sub, city_slug, token_hash, expires_at)
  VALUES (v_sub, p_slug, encode(sha256(convert_to(tok, 'UTF8')), 'hex'), v_exp);
  DELETE FROM ops.plan_shares WHERE expires_at < now() - interval '7 days';
  RETURN jsonb_build_object('token', tok, 'expires_at', v_exp);
END $f$;
ALTER FUNCTION public.plan_token_create(text, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION public.plan_token_create(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.plan_token_create(text, text) TO web_anon, quolino;

CREATE OR REPLACE FUNCTION public.trip_plan(p_slug text, p_lang text, p_pt text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE r ops.plan_shares; c public.cities; payload jsonb;
BEGIN
  IF p_pt IS NULL OR p_slug IS NULL OR length(p_pt) < 32 OR length(p_pt) > 64 THEN
    RETURN jsonb_build_object('error', 'plan_invalid');
  END IF;
  SELECT * INTO r FROM ops.plan_shares
   WHERE token_hash = encode(sha256(convert_to(p_pt, 'UTF8')), 'hex') AND city_slug = p_slug;
  IF r.id IS NULL THEN RETURN jsonb_build_object('error', 'plan_invalid'); END IF;
  IF r.expires_at <= now() THEN RETURN jsonb_build_object('error', 'plan_expired'); END IF;
  IF r.opens >= 200 THEN RETURN jsonb_build_object('error', 'rate_limit'); END IF;
  SELECT * INTO c FROM public.cities WHERE slug = p_slug AND status = 'published';
  IF c.slug IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF now() >= timestamptz '2027-06-01 00:00:00+02' AND c.access <> 'free' THEN
    RETURN jsonb_build_object('error', 'locked');
  END IF;
  payload := ops.trip_payload(p_slug, p_lang);
  IF payload IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  UPDATE ops.plan_shares SET opens = opens + 1 WHERE id = r.id;
  RETURN payload || jsonb_build_object('plan', true);   -- bez 'member': drugi rodzic nie tworzy tokenów dziecka
END $f$;
ALTER FUNCTION public.trip_plan(text, text, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION public.trip_plan(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trip_plan(text, text, text) TO web_anon, quolino;

DO $$
BEGIN
  IF has_table_privilege('web_anon', 'ops.plan_shares', 'SELECT') THEN
    RAISE EXCEPTION 'web_anon czyta ops.plan_shares — wycofuję';
  END IF;
  RAISE NOTICE 'samokontrola OK: tokeny planu tylko przez funkcje';
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
