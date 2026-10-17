-- Formularz kontaktowy: weryfikacja „czy jesteś człowiekiem” — ALTCHA (proof-of-work, bez ciasteczek i bez firm trzecich).
-- JP 2026-10-17. Widżet: /vendor/altcha/altcha.min.js (wersja w vendor/altcha/VERSION, aktualizacja co tydzień przez Hermesa).
-- Protokół ALTCHA v2 (widżet 3.x), algorytm SHA-256, licznik uint32 big-endian:
--   klucz = sha256(salt || nonce || uint32_be(counter)); rozwiązanie = licznik, dla którego klucz (hex) zaczyna się od key_prefix.
-- Wyzwanie trzymamy w bazie (jednorazowe, ważne 10 minut), więc podpis HMAC nie jest potrzebny do weryfikacji —
-- pole signature wysyłamy tylko dlatego, że widżet go oczekuje.
-- Wymaga 2026-10-17-contact.sql. Bezpieczne do powtórzenia. Wykonuje root po `deploy.sh approve`.
BEGIN;

CREATE TABLE IF NOT EXISTS ops.pow_challenges (
  nonce      text PRIMARY KEY,
  salt       text NOT NULL,
  key_prefix text NOT NULL,
  ip_day     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);
CREATE INDEX IF NOT EXISTS pow_challenges_ip ON ops.pow_challenges (ip_day, created_at);
ALTER TABLE ops.pow_challenges OWNER TO quolino;
REVOKE ALL ON ops.pow_challenges FROM PUBLIC, web_anon;

-- skrót IP z datą (ten sam sposób co w contact_send)
CREATE OR REPLACE FUNCTION ops.ip_day() RETURNS text LANGUAGE plpgsql STABLE SET search_path = ops, pg_temp AS $f$
DECLARE h json; v text;
BEGIN
  BEGIN h := current_setting('request.headers', true)::json; EXCEPTION WHEN others THEN h := NULL; END;
  v := coalesce(h->>'x-real-ip', split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1), 'unknown');
  RETURN encode(sha256(convert_to(btrim(v) || '|' || current_date::text, 'UTF8')), 'hex');
END $f$;
ALTER FUNCTION ops.ip_day() OWNER TO quolino;
REVOKE ALL ON FUNCTION ops.ip_day() FROM PUBLIC;

-- nowe wyzwanie dla widżetu (POST /rpc/contact_challenge)
CREATE OR REPLACE FUNCTION public.contact_challenge() RETURNS json
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, ops, pg_temp AS $f$
DECLARE v_ipd text := ops.ip_day(); v_nonce text; v_salt text; v_prefix text := '0000'; v_exp timestamptz := now() + interval '10 minutes';
BEGIN
  DELETE FROM ops.pow_challenges WHERE created_at < now() - interval '1 day';
  IF (SELECT count(*) FROM ops.pow_challenges WHERE ip_day = v_ipd AND created_at > now() - interval '1 hour') >= 30 THEN
    RAISE EXCEPTION 'Za dużo prób. Spróbuj później.';
  END IF;
  v_nonce := replace(gen_random_uuid()::text, '-', '');   -- 16 losowych bajtów (hex)
  v_salt  := replace(gen_random_uuid()::text, '-', '');
  INSERT INTO ops.pow_challenges (nonce, salt, key_prefix, ip_day, expires_at) VALUES (v_nonce, v_salt, v_prefix, v_ipd, v_exp);
  RETURN json_build_object(
    'parameters', json_build_object('algorithm', 'SHA-256', 'cost', 1, 'expiresAt', floor(extract(epoch FROM v_exp))::bigint,
                                    'keyLength', 32, 'keyPrefix', v_prefix, 'nonce', v_nonce, 'salt', v_salt),
    'signature', encode(sha256(convert_to(v_nonce || v_salt, 'UTF8')), 'hex'));
END $f$;
ALTER FUNCTION public.contact_challenge() OWNER TO quolino;
REVOKE ALL ON FUNCTION public.contact_challenge() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contact_challenge() TO web_anon;

-- sprawdzenie rozwiązania (base64 z widżetu: {"challenge":{"parameters":{…}},"solution":{"counter":n,"derivedKey":"…"}})
CREATE OR REPLACE FUNCTION ops.pow_verify(p_payload text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SET search_path = ops, pg_temp AS $f$
DECLARE j json; v_nonce text; v_counter bigint; v_key text; c ops.pow_challenges; v_calc text;
BEGIN
  IF p_payload IS NULL OR length(p_payload) > 4000 THEN RETURN false; END IF;
  BEGIN
    j := convert_from(decode(p_payload, 'base64'), 'UTF8')::json;
    v_nonce := j->'challenge'->'parameters'->>'nonce';
    v_counter := (j->'solution'->>'counter')::bigint;
    v_key := lower(j->'solution'->>'derivedKey');
  EXCEPTION WHEN others THEN RETURN false; END;
  IF v_nonce IS NULL OR v_counter IS NULL OR v_counter < 0 OR v_counter > 4294967295 OR v_key !~ '^[0-9a-f]{64}$' THEN RETURN false; END IF;
  SELECT * INTO c FROM ops.pow_challenges WHERE nonce = v_nonce FOR UPDATE;
  IF c.nonce IS NULL OR c.used_at IS NOT NULL OR c.expires_at < now() THEN RETURN false; END IF;
  v_calc := encode(sha256(decode(c.salt, 'hex') || decode(c.nonce, 'hex') || substring(int8send(v_counter) FROM 5 FOR 4)), 'hex');
  IF v_calc <> v_key OR left(v_calc, length(c.key_prefix)) <> c.key_prefix THEN RETURN false; END IF;
  UPDATE ops.pow_challenges SET used_at = now() WHERE nonce = c.nonce;   -- jednorazowe
  RETURN true;
END $f$;
ALTER FUNCTION ops.pow_verify(text) OWNER TO quolino;
REVOKE ALL ON FUNCTION ops.pow_verify(text) FROM PUBLIC;

-- contact_send z obowiązkową weryfikacją (stara wersja bez p_altcha znika, żeby nie dało się jej obejść)
DROP FUNCTION IF EXISTS public.contact_send(text, text, text, text, int, text, text);
CREATE OR REPLACE FUNCTION public.contact_send(p_topic text, p_body text, p_altcha text, p_email text DEFAULT NULL, p_hp text DEFAULT NULL,
  p_ms int DEFAULT NULL, p_lang text DEFAULT 'pl', p_page text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, ops, pg_temp AS $f$
DECLARE v_body text := btrim(coalesce(p_body, '')); v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
        v_ipd text := ops.ip_day(); v_id bigint;
BEGIN
  IF coalesce(p_hp, '') <> '' OR coalesce(p_ms, 0) < 3000 THEN RETURN json_build_object('ok', true); END IF;
  IF NOT ops.pow_verify(p_altcha) THEN RAISE EXCEPTION 'Potwierdź, że nie jesteś robotem (zaznacz pole nad przyciskiem).'; END IF;

  IF p_topic IS NULL OR p_topic NOT IN ('trip', 'bug', 'partner', 'privacy', 'other') THEN RAISE EXCEPTION 'Wybierz temat.'; END IF;
  IF length(v_body) < 20 THEN RAISE EXCEPTION 'Napisz trochę więcej — co najmniej 20 znaków.'; END IF;
  IF length(v_body) > 2000 THEN RAISE EXCEPTION 'Wiadomość jest za długa (najwyżej 2000 znaków).'; END IF;
  IF (SELECT count(*) FROM regexp_matches(v_body, '(https?://|www\.)', 'gi')) > 2 THEN RAISE EXCEPTION 'Najwyżej dwa linki w wiadomości.'; END IF;
  IF v_body ~* '(<\s*a\s|<\s*script|\[url|\[link)' THEN RAISE EXCEPTION 'Wiadomość nie może zawierać kodu HTML.'; END IF;
  IF v_email IS NOT NULL AND (length(v_email) > 200 OR v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$') THEN
    RAISE EXCEPTION 'Sprawdź adres e-mail albo zostaw pole puste.';
  END IF;
  IF (SELECT count(*) FROM ops.contact_messages WHERE ip_day = v_ipd AND created_at > now() - interval '1 hour') >= 3
     OR (SELECT count(*) FROM ops.contact_messages WHERE ip_day = v_ipd AND created_at > now() - interval '1 day') >= 8 THEN
    RAISE EXCEPTION 'Za dużo wiadomości w krótkim czasie. Spróbuj później.';
  END IF;
  IF (SELECT count(*) FROM ops.contact_messages WHERE created_at > now() - interval '1 day') >= 200 THEN
    RAISE EXCEPTION 'Formularz jest chwilowo przeciążony. Spróbuj jutro.';
  END IF;
  IF EXISTS (SELECT 1 FROM ops.contact_messages WHERE md5(body) = md5(v_body) AND created_at > now() - interval '1 day') THEN
    RETURN json_build_object('ok', true);
  END IF;

  INSERT INTO ops.contact_messages (topic, body, email, lang, page, ip_day)
  VALUES (p_topic, v_body, v_email, left(coalesce(p_lang, 'pl'), 8), left(p_page, 300), v_ipd)
  RETURNING id INTO v_id;
  PERFORM pg_notify('contact_message', v_id::text);
  RETURN json_build_object('ok', true);
END $f$;
ALTER FUNCTION public.contact_send(text, text, text, text, text, int, text, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION public.contact_send(text, text, text, text, text, int, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contact_send(text, text, text, text, text, int, text, text) TO web_anon;

NOTIFY pgrst, 'reload schema';
COMMIT;
