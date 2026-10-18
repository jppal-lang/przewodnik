-- Konta: ochrona rejestracji i resetu hasła przed botami (JP 2026-10-18: „zakładanie konta odporne na boty”).
-- Bramka auth-gate (gate/auth-gate.mjs) przed GoTrue woła tę funkcję przed każdym POST /signup i /recover:
--   ALTCHA (proof-of-work, ten sam mechanizm i te same wyzwania co formularz kontaktowy: ops.pow_challenges, ops.pow_verify),
--   pułapka na boty (ukryte pole), minimalny czas wypełnienia, limity na skrót IP (dzienny, bez zapisu samego IP) i limit dzienny całości.
-- Wymaga 2026-10-17-contact-altcha.sql. Bezpieczne do powtórzenia. Wykonuje root po `deploy.sh approve`.
BEGIN;

CREATE TABLE IF NOT EXISTS ops.auth_gate_log (
  id         bigserial PRIMARY KEY,
  kind       text NOT NULL CHECK (kind IN ('signup', 'recover')),
  ip_day     text NOT NULL,
  ok         boolean NOT NULL,
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_gate_log_ip ON ops.auth_gate_log (ip_day, kind, created_at);
ALTER TABLE ops.auth_gate_log OWNER TO quolino;
REVOKE ALL ON ops.auth_gate_log FROM PUBLIC, web_anon;

-- POST /rpc/auth_gate_check {"p_kind":"signup","p_altcha":"…","p_hp":"","p_ms":5400}
-- → {"ok":true} albo {"ok":false,"code":"captcha|bot|ip_limit|busy","message":"…"}
CREATE OR REPLACE FUNCTION public.auth_gate_check(p_kind text, p_altcha text, p_hp text DEFAULT NULL, p_ms int DEFAULT NULL)
RETURNS json LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, ops, pg_temp AS $f$
DECLARE v_ipd text := ops.ip_day(); v_code text; v_msg text;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('signup', 'recover') THEN RETURN json_build_object('ok', false, 'code', 'kind'); END IF;
  DELETE FROM ops.auth_gate_log WHERE created_at < now() - interval '30 days';

  IF coalesce(p_hp, '') <> '' OR coalesce(p_ms, 0) < 2500 THEN
    v_code := 'bot'; v_msg := 'Spróbuj jeszcze raz, spokojnie wypełniając formularz.';
  ELSIF (SELECT count(*) FROM ops.auth_gate_log WHERE ip_day = v_ipd AND kind = p_kind AND ok AND created_at > now() - interval '1 hour') >= 5
     OR (SELECT count(*) FROM ops.auth_gate_log WHERE ip_day = v_ipd AND kind = p_kind AND created_at > now() - interval '1 day') >= 30 THEN
    v_code := 'ip_limit'; v_msg := 'Za dużo prób z tej sieci. Spróbuj za godzinę.';
  ELSIF (SELECT count(*) FROM ops.auth_gate_log WHERE kind = p_kind AND ok AND created_at > now() - interval '1 day') >= 300 THEN
    v_code := 'busy'; v_msg := 'Rejestracja jest chwilowo przeciążona. Spróbuj jutro.';
  ELSIF NOT ops.pow_verify(p_altcha) THEN
    v_code := 'captcha'; v_msg := 'Zaznacz „Nie jestem robotem” i poczekaj na zielony znaczek.';
  END IF;

  INSERT INTO ops.auth_gate_log (kind, ip_day, ok, reason) VALUES (p_kind, v_ipd, v_code IS NULL, v_code);
  IF v_code IS NULL THEN RETURN json_build_object('ok', true); END IF;
  RETURN json_build_object('ok', false, 'code', v_code, 'message', v_msg);
END $f$;
ALTER FUNCTION public.auth_gate_check(text, text, text, int) OWNER TO quolino;
REVOKE ALL ON FUNCTION public.auth_gate_check(text, text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_gate_check(text, text, text, int) TO web_anon;

NOTIFY pgrst, 'reload schema';
COMMIT;
