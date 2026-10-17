-- Formularz kontaktowy (JP 2026-10-17): nigdzie nie podajemy adresu e-mail — kontakt tylko przez kontakt.html.
-- Ochrona przed spamem po stronie bazy (strona też sprawdza, ale bot może wołać API bezpośrednio):
--   pułapka (p_hp), minimalny czas wypełnienia, długość, liczba linków, znaczniki HTML/BBCode,
--   limit z jednego adresu IP (skrót z dzienną zmianą — samego IP nie zapisujemy), limit globalny, duplikaty.
-- Odrzucone przez pułapkę/czas/duplikat: odpowiedź „ok” bez zapisu (bot nie uczy się, co go zatrzymało).
-- E-mail nadawcy (opcjonalny) tylko do odpowiedzi; Hermes czyści go po 90 dniach.
-- Bezpieczne do powtórzenia. Wykonuje root po `deploy.sh approve`.
BEGIN;

CREATE TABLE IF NOT EXISTS ops.contact_messages (
  id          bigserial PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  topic       text NOT NULL CHECK (topic IN ('trip', 'bug', 'partner', 'privacy', 'other')),
  body        text NOT NULL CHECK (length(body) BETWEEN 20 AND 2000),
  email       text CHECK (email IS NULL OR length(email) <= 200),
  lang        text,
  page        text,
  ip_day      text NOT NULL,                       -- sha256(ip | data): pozwala liczyć limit, nie da się z niego odtworzyć adresu po dniu
  status      text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'seen', 'answered', 'spam', 'done')),
  ai_category text,
  handled_at  timestamptz
);
CREATE INDEX IF NOT EXISTS contact_messages_ip ON ops.contact_messages (ip_day, created_at);
CREATE INDEX IF NOT EXISTS contact_messages_new ON ops.contact_messages (status, created_at);
ALTER TABLE ops.contact_messages OWNER TO quolino;
REVOKE ALL ON ops.contact_messages FROM PUBLIC, web_anon;
REVOKE ALL ON SEQUENCE ops.contact_messages_id_seq FROM PUBLIC, web_anon;

CREATE OR REPLACE FUNCTION public.contact_send(p_topic text, p_body text, p_email text DEFAULT NULL, p_hp text DEFAULT NULL,
  p_ms int DEFAULT NULL, p_lang text DEFAULT 'pl', p_page text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, ops, pg_temp AS $f$
DECLARE v_body text := btrim(coalesce(p_body, '')); v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
        v_ip text; v_ipd text; v_id bigint; h json;
BEGIN
  -- pułapka i zbyt szybkie wypełnienie (człowiek potrzebuje kilku sekund): udajemy sukces, nic nie zapisujemy
  IF coalesce(p_hp, '') <> '' OR coalesce(p_ms, 0) < 3000 THEN RETURN json_build_object('ok', true); END IF;

  IF p_topic IS NULL OR p_topic NOT IN ('trip', 'bug', 'partner', 'privacy', 'other') THEN RAISE EXCEPTION 'Wybierz temat.'; END IF;
  IF length(v_body) < 20 THEN RAISE EXCEPTION 'Napisz trochę więcej — co najmniej 20 znaków.'; END IF;
  IF length(v_body) > 2000 THEN RAISE EXCEPTION 'Wiadomość jest za długa (najwyżej 2000 znaków).'; END IF;
  IF (SELECT count(*) FROM regexp_matches(v_body, '(https?://|www\.)', 'gi')) > 2 THEN RAISE EXCEPTION 'Najwyżej dwa linki w wiadomości.'; END IF;
  IF v_body ~* '(<\s*a\s|<\s*script|\[url|\[link)' THEN RAISE EXCEPTION 'Wiadomość nie może zawierać kodu HTML.'; END IF;
  IF v_email IS NOT NULL AND (length(v_email) > 200 OR v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$') THEN
    RAISE EXCEPTION 'Sprawdź adres e-mail albo zostaw pole puste.';
  END IF;

  -- adres IP z nagłówków od Traefika; zapisujemy tylko skrót z datą (zmienia się co dzień)
  BEGIN h := current_setting('request.headers', true)::json; EXCEPTION WHEN others THEN h := NULL; END;
  v_ip := coalesce(h->>'x-real-ip', split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1), 'unknown');
  v_ipd := encode(sha256(convert_to(btrim(v_ip) || '|' || current_date::text, 'UTF8')), 'hex');

  IF (SELECT count(*) FROM ops.contact_messages WHERE ip_day = v_ipd AND created_at > now() - interval '1 hour') >= 3
     OR (SELECT count(*) FROM ops.contact_messages WHERE ip_day = v_ipd AND created_at > now() - interval '1 day') >= 8 THEN
    RAISE EXCEPTION 'Za dużo wiadomości w krótkim czasie. Spróbuj później.';
  END IF;
  IF (SELECT count(*) FROM ops.contact_messages WHERE created_at > now() - interval '1 day') >= 200 THEN
    RAISE EXCEPTION 'Formularz jest chwilowo przeciążony. Spróbuj jutro.';
  END IF;
  -- duplikat tej samej treści w ciągu doby: udajemy sukces
  IF EXISTS (SELECT 1 FROM ops.contact_messages WHERE md5(body) = md5(v_body) AND created_at > now() - interval '1 day') THEN
    RETURN json_build_object('ok', true);
  END IF;

  INSERT INTO ops.contact_messages (topic, body, email, lang, page, ip_day)
  VALUES (p_topic, v_body, v_email, left(coalesce(p_lang, 'pl'), 8), left(p_page, 300), v_ipd)
  RETURNING id INTO v_id;
  PERFORM pg_notify('contact_message', v_id::text);
  RETURN json_build_object('ok', true);
END $f$;
ALTER FUNCTION public.contact_send(text, text, text, text, int, text, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION public.contact_send(text, text, text, text, int, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contact_send(text, text, text, text, int, text, text) TO web_anon;

NOTIFY pgrst, 'reload schema';
COMMIT;
