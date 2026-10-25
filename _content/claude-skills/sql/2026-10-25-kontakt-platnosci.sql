-- 2026-10-25 (JP): nowy temat formularza „Płatność lub dostęp” (payment) — problemy z zakupem, kodem, odblokowaniem wycieczki.
-- Jev kategoryzuje to jako platnosc_dostep → kanał #zgl-platnosci. Reszta funkcji bez zmian (kopia z 2026-10-17-contact-altcha.sql).
-- Bezpieczne do powtórzenia. Wykonuje root po `deploy.sh approve`.
BEGIN;
ALTER TABLE ops.contact_messages DROP CONSTRAINT IF EXISTS contact_messages_topic_check;
ALTER TABLE ops.contact_messages ADD CONSTRAINT contact_messages_topic_check CHECK (topic IN ('trip', 'bug', 'payment', 'partner', 'privacy', 'other'));

CREATE OR REPLACE FUNCTION public.contact_send(p_topic text, p_body text, p_altcha text, p_email text DEFAULT NULL, p_hp text DEFAULT NULL,
  p_ms int DEFAULT NULL, p_lang text DEFAULT 'pl', p_page text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, ops, pg_temp AS $f$
DECLARE v_body text := btrim(coalesce(p_body, '')); v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
        v_ipd text := ops.ip_day(); v_id bigint;
BEGIN
  IF coalesce(p_hp, '') <> '' OR coalesce(p_ms, 0) < 3000 THEN RETURN json_build_object('ok', true); END IF;
  IF NOT ops.pow_verify(p_altcha) THEN RAISE EXCEPTION 'Potwierdź, że nie jesteś robotem (zaznacz pole nad przyciskiem).'; END IF;

  IF p_topic IS NULL OR p_topic NOT IN ('trip', 'bug', 'payment', 'partner', 'privacy', 'other') THEN RAISE EXCEPTION 'Wybierz temat.'; END IF;
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
