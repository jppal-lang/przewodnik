-- Konta: logowanie kodem z maila (JP 2026-10-29, D-1). Bramka auth-gate woła auth_gate_check także przed POST /otp
-- (wysłanie 6-cyfrowego kodu; kod zakłada konto, jeśli go nie ma). Ta sama ochrona co przy rejestracji: ALTCHA, pułapka,
-- minimalny czas wypełnienia, limity na skrót IP. Limity dla „otp” są wyższe, bo to codzienne logowanie, nie jednorazowa rejestracja:
--   10 udanych wysyłek na godzinę z jednej sieci, 60 prób dziennie, 2000 wysyłek dziennie łącznie.
-- Wymaga 2026-10-18-auth-gate.sql. Bezpieczne do powtórzenia. Wykonuje root po `deploy.sh approve`.
-- Cofnięcie niepotrzebne: rodzaj „otp” bez bramki na /otp po prostu nie jest używany.
BEGIN;

ALTER TABLE ops.auth_gate_log DROP CONSTRAINT IF EXISTS auth_gate_log_kind_check;
ALTER TABLE ops.auth_gate_log ADD CONSTRAINT auth_gate_log_kind_check CHECK (kind IN ('signup', 'recover', 'otp'));

CREATE OR REPLACE FUNCTION public.auth_gate_check(p_kind text, p_altcha text, p_hp text DEFAULT NULL, p_ms int DEFAULT NULL)
RETURNS json LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, ops, pg_temp AS $f$
DECLARE
  v_ipd text := ops.ip_day(); v_code text; v_msg text;
  v_hour int := CASE WHEN p_kind = 'otp' THEN 10 ELSE 5 END;
  v_day int := CASE WHEN p_kind = 'otp' THEN 60 ELSE 30 END;
  v_all int := CASE WHEN p_kind = 'otp' THEN 2000 ELSE 300 END;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('signup', 'recover', 'otp') THEN RETURN json_build_object('ok', false, 'code', 'kind'); END IF;
  DELETE FROM ops.auth_gate_log WHERE created_at < now() - interval '30 days';

  IF coalesce(p_hp, '') <> '' OR coalesce(p_ms, 0) < 2500 THEN
    v_code := 'bot'; v_msg := 'Spróbuj jeszcze raz, spokojnie wypełniając formularz.';
  ELSIF (SELECT count(*) FROM ops.auth_gate_log WHERE ip_day = v_ipd AND kind = p_kind AND ok AND created_at > now() - interval '1 hour') >= v_hour
     OR (SELECT count(*) FROM ops.auth_gate_log WHERE ip_day = v_ipd AND kind = p_kind AND created_at > now() - interval '1 day') >= v_day THEN
    v_code := 'ip_limit'; v_msg := 'Za dużo prób z tej sieci. Spróbuj za godzinę.';
  ELSIF (SELECT count(*) FROM ops.auth_gate_log WHERE kind = p_kind AND ok AND created_at > now() - interval '1 day') >= v_all THEN
    v_code := 'busy'; v_msg := CASE WHEN p_kind = 'otp' THEN 'Logowanie jest chwilowo przeciążone. Spróbuj za godzinę albo zaloguj się hasłem.'
                                    ELSE 'Rejestracja jest chwilowo przeciążona. Spróbuj jutro.' END;
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
