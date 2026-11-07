-- Tickety (JP 2026-11-07: „zgłoszenia wylądowały w panelu i tak zostały, nic z nimi nie da się zrobić”).
-- Każde zgłoszenie przy przystanku, opinia z treścią albo niską oceną i wiadomość z formularza = ticket z numerem nie po kolei
-- (Q-XXXX-XXXX, losowy, bez 0/O/1/I/L). Wątek: wiadomości klienta, odpowiedzi zespołu, notatki wewnętrzne (klient ich nie widzi).
-- Klient widzi WYŁĄCZNIE swoje tickety, w koncie rodzica, po sesji (sub z tokenu): numer z paska adresu bez sesji właściciela nic nie daje,
-- cudzy numer = ta sama odpowiedź co nieistniejący („not_found”). Przypisanie do konta:
--   • zgłoszenie/opinia: identyfikator urządzenia (quolino_client, losowy UUID w localStorage) — tickets_link przy wejściu do konta,
--   • formularz: potwierdzony e-mail konta = e-mail z formularza.
-- Odpowiedź zespołu z panelu idzie też e-mailem (kolejka ops.ticket_mail → ops/ticket-mail.sh, SMTP Brevo, root).
-- Wymaga: ops.sql, 2026-10-11-opinie.sql, 2026-10-25-kontakt-platnosci.sql, 2026-10-18-trip-member.sql (ops.jwt_claims). Bezpieczne do powtórzenia.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA ops;

CREATE TABLE IF NOT EXISTS ops.tickets (
  id             bigserial PRIMARY KEY,
  number         text NOT NULL UNIQUE,
  source         text NOT NULL CHECK (source IN ('report', 'rating', 'contact', 'account')),
  source_id      text,
  sub            uuid REFERENCES auth.users (id) ON DELETE CASCADE,   -- konto właściciela; usunięcie konta (RODO) kasuje jego tickety
  client_id      uuid,                       -- urządzenie (zgłoszenia i opinie)
  email          text,                       -- adres z formularza
  lang           text,
  subject        text NOT NULL,
  city_slug      text,
  stop           text,
  status         text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'open', 'waiting', 'resolved', 'closed', 'spam')),
  priority       smallint,
  category       text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  last_client_at timestamptz,
  last_team_at   timestamptz,
  client_seen_at timestamptz,
  UNIQUE (source, source_id)
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ops.tickets'::regclass AND contype = 'f') THEN
    ALTER TABLE ops.tickets ADD FOREIGN KEY (sub) REFERENCES auth.users (id) ON DELETE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS tickets_sub ON ops.tickets (sub, updated_at DESC);
CREATE INDEX IF NOT EXISTS tickets_client ON ops.tickets (client_id) WHERE sub IS NULL;
CREATE INDEX IF NOT EXISTS tickets_email ON ops.tickets (lower(email)) WHERE sub IS NULL;
CREATE INDEX IF NOT EXISTS tickets_status ON ops.tickets (status, updated_at DESC);
CREATE TABLE IF NOT EXISTS ops.ticket_messages (
  id         bigserial PRIMARY KEY,
  ticket_id  bigint NOT NULL REFERENCES ops.tickets (id) ON DELETE CASCADE,
  author     text NOT NULL CHECK (author IN ('client', 'team', 'note', 'system')),
  body       text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ticket_messages_t ON ops.ticket_messages (ticket_id, created_at);
CREATE TABLE IF NOT EXISTS ops.ticket_mail (
  id         bigserial PRIMARY KEY,
  ticket_id  bigint NOT NULL REFERENCES ops.tickets (id) ON DELETE CASCADE,
  to_email   text NOT NULL,
  subject    text NOT NULL,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at    timestamptz,
  tries      int NOT NULL DEFAULT 0,
  error      text
);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['ops.tickets', 'ops.ticket_messages', 'ops.ticket_mail'] LOOP
    EXECUTE format('ALTER TABLE %s OWNER TO quolino', t);
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
  END LOOP;
END $$;
ALTER SEQUENCE ops.tickets_id_seq OWNER TO quolino;
ALTER SEQUENCE ops.ticket_messages_id_seq OWNER TO quolino;
ALTER SEQUENCE ops.ticket_mail_id_seq OWNER TO quolino;

-- numer: Q- + 8 losowych znaków z 31 (≈ 8,5·10¹¹ kombinacji), nie po kolei, nie do zgadnięcia
CREATE OR REPLACE FUNCTION ops.ticket_number() RETURNS text LANGUAGE plpgsql VOLATILE SET search_path = pg_temp AS $f$
DECLARE a constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; b bytea; s text; i int;
BEGIN
  LOOP
    b := ops.gen_random_bytes(8); s := '';
    FOR i IN 0 .. 7 LOOP s := s || substr(a, (get_byte(b, i) % 31) + 1, 1); END LOOP;
    s := 'Q-' || substr(s, 1, 4) || '-' || substr(s, 5, 4);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM ops.tickets WHERE number = s);
  END LOOP;
  RETURN s;
END $f$;
ALTER FUNCTION ops.ticket_number() OWNER TO quolino;

CREATE OR REPLACE FUNCTION ops.ticket_open(p_source text, p_source_id text, p_subject text, p_body text, p_at timestamptz,
    p_client uuid, p_email text, p_lang text, p_city text, p_stop text, p_category text, p_priority smallint, p_status text DEFAULT 'new')
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_temp AS $f$
DECLARE v_id bigint; v_sub uuid;
BEGIN
  SELECT id INTO v_id FROM ops.tickets WHERE source = p_source AND source_id = p_source_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  IF p_email IS NOT NULL THEN
    SELECT id INTO v_sub FROM auth.users WHERE lower(email) = lower(p_email) AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL LIMIT 1;
  END IF;
  IF v_sub IS NULL AND p_client IS NOT NULL THEN
    SELECT sub INTO v_sub FROM ops.tickets WHERE client_id = p_client AND sub IS NOT NULL ORDER BY updated_at DESC LIMIT 1;
  END IF;
  INSERT INTO ops.tickets (number, source, source_id, sub, client_id, email, lang, subject, city_slug, stop, category, priority, status, created_at, updated_at, last_client_at)
  VALUES (ops.ticket_number(), p_source, p_source_id, v_sub, p_client, p_email, left(p_lang, 8), left(p_subject, 160), p_city, left(p_stop, 120),
          p_category, p_priority, p_status, coalesce(p_at, now()), coalesce(p_at, now()), coalesce(p_at, now()))
  RETURNING id INTO v_id;
  IF nullif(btrim(coalesce(p_body, '')), '') IS NOT NULL THEN
    INSERT INTO ops.ticket_messages (ticket_id, author, body, created_at) VALUES (v_id, 'client', left(p_body, 4000), coalesce(p_at, now()));
  END IF;
  RETURN v_id;
END $f$;
ALTER FUNCTION ops.ticket_open(text, text, text, text, timestamptz, uuid, text, text, text, text, text, smallint, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION ops.ticket_open(text, text, text, text, timestamptz, uuid, text, text, text, text, text, smallint, text) FROM PUBLIC;

-- tematy po polsku (panel); klient widzi temat w swoim koncie
CREATE OR REPLACE FUNCTION ops.ticket_report_subject(p_type text, p_stop text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE p_type WHEN 'wrong_price' THEN 'Zła cena' WHEN 'closed' THEN 'Zamknięte' WHEN 'wrong_hours' THEN 'Złe godziny'
                     WHEN 'wrong_address' THEN 'Zły adres' ELSE 'Zgłoszenie' END || coalesce(' — ' || p_stop, '');
$f$;
CREATE OR REPLACE FUNCTION ops.ticket_contact_subject(p_topic text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE p_topic WHEN 'trip' THEN 'Pytanie o wycieczkę' WHEN 'bug' THEN 'Błąd na stronie' WHEN 'payment' THEN 'Płatność lub dostęp'
                      WHEN 'partner' THEN 'Współpraca' WHEN 'privacy' THEN 'Prywatność i dane' ELSE 'Wiadomość' END;
$f$;

-- wyzwalacze: nowe zgłoszenie / opinia / wiadomość → ticket
CREATE OR REPLACE FUNCTION ops.ticket_from_report() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_temp AS $f$
BEGIN
  PERFORM ops.ticket_open('report', NEW.id::text, ops.ticket_report_subject(NEW.type, NEW.stop_name), NEW.message, NEW.created_at,
                          NEW.client_id, NULL, NEW.lang, NEW.city_slug, NEW.stop_name, NULL, NULL);
  RETURN NEW;
END $f$;
CREATE OR REPLACE FUNCTION ops.ticket_from_rating() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_temp AS $f$
DECLARE v_id bigint;
BEGIN
  IF NEW.stop_id IS NOT NULL OR (NEW.comment IS NULL AND NEW.stars > 2) THEN RETURN NEW; END IF;
  SELECT id INTO v_id FROM ops.tickets WHERE source = 'rating' AND source_id = NEW.id::text;
  IF v_id IS NULL THEN
    PERFORM ops.ticket_open('rating', NEW.id::text, 'Opinia o wycieczce: ' || NEW.stars || '/5', NEW.comment, NEW.updated_at,
                            NEW.client_id, NULL, NEW.lang, NEW.city_slug, NULL, NULL, NULL);
  ELSIF TG_OP = 'UPDATE' AND NEW.comment IS DISTINCT FROM OLD.comment AND NEW.comment IS NOT NULL THEN
    INSERT INTO ops.ticket_messages (ticket_id, author, body) VALUES (v_id, 'client', '(' || NEW.stars || '/5) ' || NEW.comment);
    UPDATE ops.tickets SET status = CASE WHEN status IN ('resolved', 'closed', 'waiting') THEN 'open' ELSE status END,
                           subject = 'Opinia o wycieczce: ' || NEW.stars || '/5', updated_at = now(), last_client_at = now() WHERE id = v_id;
  END IF;
  RETURN NEW;
END $f$;
CREATE OR REPLACE FUNCTION ops.ticket_from_contact() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_temp AS $f$
BEGIN
  PERFORM ops.ticket_open('contact', NEW.id::text, ops.ticket_contact_subject(NEW.topic), NEW.body, NEW.created_at,
                          NULL, NEW.email, NEW.lang, NULL, NULL, NEW.topic, NULL, CASE WHEN NEW.status = 'spam' THEN 'spam' ELSE 'new' END);
  RETURN NEW;
END $f$;
-- kategoria i priorytet od Jev (klasyfikacja przychodzi UPDATE-em po kilku minutach)
CREATE OR REPLACE FUNCTION ops.ticket_ai_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_temp AS $f$
BEGIN
  UPDATE ops.tickets SET category = coalesce(NEW.jp_category, NEW.ai_category, category), priority = coalesce(NEW.ai_priority, priority),
         status = CASE WHEN coalesce(NEW.jp_category, NEW.ai_category) = 'spam' AND coalesce(NEW.ai_confidence, 0) >= 0.9 AND status = 'new' THEN 'spam' ELSE status END
   WHERE source = TG_ARGV[0] AND source_id = NEW.id::text;
  RETURN NEW;
END $f$;
DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['ops.ticket_from_report()', 'ops.ticket_from_rating()', 'ops.ticket_from_contact()', 'ops.ticket_ai_sync()',
                           'ops.ticket_report_subject(text, text)', 'ops.ticket_contact_subject(text)'] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO quolino', f);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS ticket_new ON ops.reports;
CREATE TRIGGER ticket_new AFTER INSERT ON ops.reports FOR EACH ROW EXECUTE FUNCTION ops.ticket_from_report();
DROP TRIGGER IF EXISTS ticket_new ON ops.ratings;
CREATE TRIGGER ticket_new AFTER INSERT OR UPDATE OF comment, stars ON ops.ratings FOR EACH ROW EXECUTE FUNCTION ops.ticket_from_rating();
DROP TRIGGER IF EXISTS ticket_new ON ops.contact_messages;
CREATE TRIGGER ticket_new AFTER INSERT ON ops.contact_messages FOR EACH ROW EXECUTE FUNCTION ops.ticket_from_contact();
DROP TRIGGER IF EXISTS ticket_ai ON ops.reports;
CREATE TRIGGER ticket_ai AFTER UPDATE OF ai_category, jp_category, ai_priority ON ops.reports FOR EACH ROW EXECUTE FUNCTION ops.ticket_ai_sync('report');
DROP TRIGGER IF EXISTS ticket_ai ON ops.ratings;
CREATE TRIGGER ticket_ai AFTER UPDATE OF ai_category, jp_category, ai_priority ON ops.ratings FOR EACH ROW EXECUTE FUNCTION ops.ticket_ai_sync('rating');
DROP TRIGGER IF EXISTS ticket_ai ON ops.contact_messages;
CREATE TRIGGER ticket_ai AFTER UPDATE OF ai_category, jp_category, ai_priority ON ops.contact_messages FOR EACH ROW EXECUTE FUNCTION ops.ticket_ai_sync('contact');

-- to, co już leży (90 dni): tickety ze statusem przeniesionym ze starego panelu
DO $$ DECLARE r record; v bigint; BEGIN
  FOR r IN SELECT * FROM ops.reports WHERE created_at > now() - interval '90 days' ORDER BY created_at LOOP
    v := ops.ticket_open('report', r.id::text, ops.ticket_report_subject(r.type, r.stop_name), r.message, r.created_at, r.client_id, NULL, r.lang,
                         r.city_slug, r.stop_name, coalesce(r.jp_category, r.ai_category), r.ai_priority,
                         CASE r.status WHEN 'fixed' THEN 'resolved' WHEN 'rejected' THEN 'closed' WHEN 'noted' THEN 'resolved' WHEN 'reviewed' THEN 'open' ELSE 'new' END);
  END LOOP;
  FOR r IN SELECT * FROM ops.ratings WHERE stop_id IS NULL AND (comment IS NOT NULL OR stars <= 2) AND updated_at > now() - interval '90 days' ORDER BY updated_at LOOP
    v := ops.ticket_open('rating', r.id::text, 'Opinia o wycieczce: ' || r.stars || '/5', r.comment, r.updated_at, r.client_id, NULL, r.lang,
                         r.city_slug, NULL, coalesce(r.jp_category, r.ai_category), r.ai_priority,
                         CASE r.status WHEN 'fixed' THEN 'resolved' WHEN 'rejected' THEN 'closed' WHEN 'noted' THEN 'resolved' WHEN 'reviewed' THEN 'open' ELSE 'new' END);
  END LOOP;
  FOR r IN SELECT * FROM ops.contact_messages WHERE created_at > now() - interval '90 days' ORDER BY created_at LOOP
    v := ops.ticket_open('contact', r.id::text, ops.ticket_contact_subject(r.topic), r.body, r.created_at, NULL, r.email, r.lang, NULL, NULL,
                         coalesce(r.jp_category, r.ai_category, r.topic), r.ai_priority,
                         CASE r.status WHEN 'spam' THEN 'spam' WHEN 'done' THEN 'closed' WHEN 'answered' THEN 'resolved' WHEN 'seen' THEN 'open' ELSE 'new' END);
  END LOOP;
END $$;

-- ── klient (strona, token sesji w treści jak trip_member) ──
-- przypięcie do konta: tickety z tego urządzenia i z potwierdzonego e-maila konta
CREATE OR REPLACE FUNCTION public.tickets_link(p_token text, p_client uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE cl jsonb; v_sub uuid; v_mail text; n int := 0; m int := 0;
BEGIN
  cl := ops.jwt_claims(p_token);
  IF cl IS NULL THEN RETURN jsonb_build_object('error', 'invalid_session'); END IF;
  v_sub := (cl ->> 'sub')::uuid;
  SELECT lower(email) INTO v_mail FROM auth.users WHERE id = v_sub AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL;
  IF p_client IS NOT NULL THEN
    UPDATE ops.tickets SET sub = v_sub WHERE client_id = p_client AND sub IS NULL; GET DIAGNOSTICS n = ROW_COUNT;
  END IF;
  IF v_mail IS NOT NULL THEN
    UPDATE ops.tickets SET sub = v_sub WHERE lower(email) = v_mail AND sub IS NULL; GET DIAGNOSTICS m = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('ok', true, 'linked', n + m);
END $f$;

CREATE OR REPLACE FUNCTION public.my_tickets(p_token text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE cl jsonb; v_sub uuid;
BEGIN
  cl := ops.jwt_claims(p_token);
  IF cl IS NULL THEN RETURN jsonb_build_object('error', 'invalid_session'); END IF;
  v_sub := (cl ->> 'sub')::uuid;
  RETURN jsonb_build_object('tickets', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'number', t.number, 'subject', t.subject, 'city_slug', t.city_slug, 'status', CASE t.status WHEN 'spam' THEN 'closed' ELSE t.status END,
      'created_at', t.created_at, 'updated_at', t.updated_at,
      'unread', t.last_team_at IS NOT NULL AND (t.client_seen_at IS NULL OR t.client_seen_at < t.last_team_at)) ORDER BY t.updated_at DESC), '[]')
    FROM ops.tickets t WHERE t.sub = v_sub));
END $f$;

-- jeden ticket: tylko właściciel; cudzy i nieistniejący numer → ta sama odpowiedź
CREATE OR REPLACE FUNCTION public.my_ticket(p_token text, p_number text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE cl jsonb; t ops.tickets;
BEGIN
  cl := ops.jwt_claims(p_token);
  IF cl IS NULL THEN RETURN jsonb_build_object('error', 'invalid_session'); END IF;
  SELECT * INTO t FROM ops.tickets WHERE number = upper(btrim(coalesce(p_number, ''))) AND sub = (cl ->> 'sub')::uuid;
  IF t.id IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  UPDATE ops.tickets SET client_seen_at = now() WHERE id = t.id;
  RETURN jsonb_build_object('number', t.number, 'subject', t.subject, 'city_slug', t.city_slug, 'stop', t.stop,
    'status', CASE t.status WHEN 'spam' THEN 'closed' ELSE t.status END, 'created_at', t.created_at, 'updated_at', t.updated_at,
    'messages', (SELECT coalesce(jsonb_agg(jsonb_build_object('author', author, 'body', body, 'at', created_at) ORDER BY created_at, id), '[]')
                   FROM ops.ticket_messages WHERE ticket_id = t.id AND author IN ('client', 'team', 'system')));
END $f$;

CREATE OR REPLACE FUNCTION public.ticket_reply(p_token text, p_number text, p_body text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE cl jsonb; t ops.tickets; v_body text := btrim(coalesce(p_body, ''));
BEGIN
  cl := ops.jwt_claims(p_token);
  IF cl IS NULL THEN RETURN jsonb_build_object('error', 'invalid_session'); END IF;
  SELECT * INTO t FROM ops.tickets WHERE number = upper(btrim(coalesce(p_number, ''))) AND sub = (cl ->> 'sub')::uuid;
  IF t.id IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF length(v_body) < 2 OR length(v_body) > 2000 THEN RETURN jsonb_build_object('error', 'length'); END IF;
  IF v_body ~* '(<\s*a\s|<\s*script|\[url|\[link)' THEN RETURN jsonb_build_object('error', 'html'); END IF;
  IF (SELECT count(*) FROM ops.ticket_messages m JOIN ops.tickets x ON x.id = m.ticket_id
       WHERE x.sub = t.sub AND m.author = 'client' AND m.created_at > now() - interval '1 hour') >= 10 THEN
    RETURN jsonb_build_object('error', 'rate_limit');
  END IF;
  INSERT INTO ops.ticket_messages (ticket_id, author, body) VALUES (t.id, 'client', v_body);
  UPDATE ops.tickets SET status = CASE WHEN status = 'spam' THEN 'spam' WHEN status = 'new' THEN 'new' ELSE 'open' END,
         updated_at = now(), last_client_at = now(), client_seen_at = now() WHERE id = t.id;
  PERFORM pg_notify('ticket_client', t.number);
  RETURN jsonb_build_object('ok', true);
END $f$;
DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['public.tickets_link(text, uuid)', 'public.my_tickets(text)', 'public.my_ticket(text, text)', 'public.ticket_reply(text, text, text)'] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO quolino', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO web_anon, quolino', f);
  END LOOP;
END $$;

-- ── panel ──
CREATE OR REPLACE FUNCTION admin.tickets_list(p_status text DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_temp AS $f$
  SELECT jsonb_build_object(
    'counts', (SELECT jsonb_object_agg(status, n) FROM (SELECT status, count(*) AS n FROM ops.tickets GROUP BY 1) c),
    'tickets', (SELECT coalesce(jsonb_agg(x ORDER BY (x ->> 'sort')::int, x ->> 'updated_at' DESC), '[]') FROM (
      SELECT jsonb_build_object('number', t.number, 'source', t.source, 'subject', t.subject, 'city_slug', t.city_slug, 'stop', t.stop,
        'status', t.status, 'priority', t.priority, 'category', t.category, 'lang', t.lang, 'created_at', t.created_at, 'updated_at', t.updated_at,
        'has_account', t.sub IS NOT NULL, 'has_email', t.email IS NOT NULL OR t.sub IS NOT NULL,
        'waiting_us', t.status IN ('new', 'open'),
        'messages', (SELECT count(*) FROM ops.ticket_messages m WHERE m.ticket_id = t.id AND m.author <> 'note'),
        'preview', (SELECT left(body, 220) FROM ops.ticket_messages m WHERE m.ticket_id = t.id AND m.author = 'client' ORDER BY created_at DESC, id DESC LIMIT 1),
        'sort', CASE t.status WHEN 'new' THEN 0 WHEN 'open' THEN 1 WHEN 'waiting' THEN 2 ELSE 3 END) AS x
      FROM ops.tickets t
     WHERE (p_status IS NULL AND t.status NOT IN ('closed', 'spam') OR t.status = p_status OR p_status = 'all')
     ORDER BY t.updated_at DESC LIMIT 500) y));
$f$;

CREATE OR REPLACE FUNCTION admin.ticket_get(p_number text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_temp AS $f$
DECLARE t ops.tickets; v_mail text;
BEGIN
  SELECT * INTO t FROM ops.tickets WHERE number = upper(btrim(p_number));
  IF t.id IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  SELECT email INTO v_mail FROM auth.users WHERE id = t.sub;
  RETURN jsonb_build_object('number', t.number, 'source', t.source, 'subject', t.subject, 'city_slug', t.city_slug, 'stop', t.stop,
    'status', t.status, 'priority', t.priority, 'category', t.category, 'lang', t.lang, 'created_at', t.created_at, 'updated_at', t.updated_at,
    'email', coalesce(v_mail, t.email), 'has_account', t.sub IS NOT NULL,
    'messages', (SELECT coalesce(jsonb_agg(jsonb_build_object('author', author, 'body', body, 'at', created_at) ORDER BY created_at, id), '[]')
                   FROM ops.ticket_messages WHERE ticket_id = t.id),
    'mails', (SELECT coalesce(jsonb_agg(jsonb_build_object('at', created_at, 'sent_at', sent_at, 'error', error) ORDER BY created_at), '[]')
                FROM ops.ticket_mail WHERE ticket_id = t.id));
END $f$;

-- odpowiedź z panelu: widoczna w koncie klienta + e-mail (gdy znamy adres); p_note = notatka wewnętrzna (bez e-maila, klient nie widzi)
CREATE OR REPLACE FUNCTION admin.ticket_reply(p_number text, p_body text, p_note boolean DEFAULT false, p_status text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_temp AS $f$
DECLARE t ops.tickets; v_body text := btrim(coalesce(p_body, '')); v_mail text; v_st text; v_lang text;
BEGIN
  SELECT * INTO t FROM ops.tickets WHERE number = upper(btrim(p_number)) FOR UPDATE;
  IF t.id IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF length(v_body) < 1 OR length(v_body) > 4000 THEN RETURN jsonb_build_object('error', 'length'); END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('new', 'open', 'waiting', 'resolved', 'closed', 'spam') THEN RETURN jsonb_build_object('error', 'status'); END IF;
  INSERT INTO ops.ticket_messages (ticket_id, author, body) VALUES (t.id, CASE WHEN p_note THEN 'note' ELSE 'team' END, v_body);
  v_st := coalesce(p_status, CASE WHEN p_note THEN CASE WHEN t.status = 'new' THEN 'open' ELSE t.status END ELSE 'waiting' END);
  UPDATE ops.tickets SET status = v_st, updated_at = now(), last_team_at = CASE WHEN p_note THEN last_team_at ELSE now() END WHERE id = t.id;
  IF NOT p_note THEN
    SELECT email INTO v_mail FROM auth.users WHERE id = t.sub AND deleted_at IS NULL;
    v_mail := coalesce(v_mail, t.email);
    v_lang := coalesce(t.lang, 'pl');
    IF v_mail IS NOT NULL THEN
      INSERT INTO ops.ticket_mail (ticket_id, to_email, subject, body) VALUES (t.id, v_mail,
        CASE WHEN v_lang LIKE 'pl%' THEN 'Odpowiedź na Twoje zgłoszenie ' ELSE 'Reply to your request ' END || t.number || ' — Quolino',
        CASE WHEN v_lang LIKE 'pl%' THEN 'Dzień dobry,' || E'\n\n' || 'odpowiadamy na zgłoszenie ' || t.number || ' („' || t.subject || '”):'
             ELSE 'Hello,' || E'\n\n' || 'here is our reply to your request ' || t.number || ' ("' || t.subject || '"):' END
        || E'\n\n' || v_body || E'\n\n' ||
        CASE WHEN t.sub IS NOT NULL THEN CASE WHEN v_lang LIKE 'pl%' THEN 'Cała rozmowa i odpowiedź: https://quolino.com/konto.html#zgloszenia'
                                              ELSE 'Full conversation and reply: https://quolino.com/konto.html#zgloszenia' END
             ELSE CASE WHEN v_lang LIKE 'pl%' THEN 'Możesz odpisać na tę wiadomość przez formularz: https://quolino.com/kontakt.html (podaj numer ' || t.number || ').'
                       ELSE 'You can reply through our form: https://quolino.com/kontakt.html (please include ' || t.number || ').' END END
        || E'\n\n' || 'Quolino');
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'status', v_st, 'mail', v_mail IS NOT NULL AND NOT p_note);
END $f$;

CREATE OR REPLACE FUNCTION admin.ticket_set(p_number text, p_status text DEFAULT NULL, p_priority int DEFAULT NULL, p_category text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_temp AS $f$
DECLARE n int;
BEGIN
  IF p_status IS NOT NULL AND p_status NOT IN ('new', 'open', 'waiting', 'resolved', 'closed', 'spam') THEN RETURN jsonb_build_object('error', 'status'); END IF;
  IF p_category IS NOT NULL AND p_category !~ '^[a-z_]{3,30}$' THEN RETURN jsonb_build_object('error', 'category'); END IF;
  UPDATE ops.tickets SET status = coalesce(p_status, status), priority = coalesce(p_priority::smallint, priority),
         category = coalesce(p_category, category), updated_at = now() WHERE number = upper(btrim(p_number));
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  -- stary status źródła, żeby Hermes/Discord nie widziały zamkniętego jako nowe
  UPDATE ops.contact_messages c SET status = CASE p_status WHEN 'spam' THEN 'spam' WHEN 'closed' THEN 'done' WHEN 'resolved' THEN 'answered' ELSE c.status END, handled_at = now()
    FROM ops.tickets t WHERE t.number = upper(btrim(p_number)) AND t.source = 'contact' AND c.id::text = t.source_id AND p_status IS NOT NULL;
  RETURN jsonb_build_object('ok', true);
END $f$;
DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['admin.tickets_list(text)', 'admin.ticket_get(text)', 'admin.ticket_reply(text, text, boolean, text)', 'admin.ticket_set(text, text, int, text)'] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO quolino', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO quolino_admin', f);
  END LOOP;
END $$;
-- eksport RODO obejmuje tickety konta
CREATE OR REPLACE FUNCTION admin.user_tickets(p_sub uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_temp AS $f$
  SELECT coalesce(jsonb_agg(jsonb_build_object('number', t.number, 'subject', t.subject, 'created_at', t.created_at,
    'messages', (SELECT jsonb_agg(jsonb_build_object('author', author, 'body', body, 'at', created_at) ORDER BY created_at)
                   FROM ops.ticket_messages m WHERE m.ticket_id = t.id AND author <> 'note'))), '[]') FROM ops.tickets t WHERE t.sub = p_sub;
$f$;
ALTER FUNCTION admin.user_tickets(uuid) OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.user_tickets(uuid) FROM PUBLIC;

-- ── gotowe odpowiedzi do ticketów (JP: „coś w stylu CMS do kontaktu w temacie zgłoszeń”) ──
CREATE TABLE IF NOT EXISTS ops.ticket_templates (
  id bigserial PRIMARY KEY, title text NOT NULL CHECK (length(title) BETWEEN 2 AND 80), body text NOT NULL CHECK (length(body) BETWEEN 2 AND 4000),
  lang text NOT NULL DEFAULT 'pl', sort int NOT NULL DEFAULT 100, updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ops.ticket_templates OWNER TO quolino;
ALTER SEQUENCE ops.ticket_templates_id_seq OWNER TO quolino;
REVOKE ALL ON ops.ticket_templates FROM PUBLIC;
INSERT INTO ops.ticket_templates (title, body, lang, sort)
SELECT * FROM (VALUES
  ('Dziękujemy — poprawione', 'Dziękujemy za zgłoszenie! Sprawdziliśmy i poprawiliśmy to w trasie. Zmiana jest już widoczna na stronie.', 'pl', 10),
  ('Dziękujemy — sprawdzamy', 'Dziękujemy za wiadomość. Sprawdzamy to na miejscu i odezwiemy się, gdy będziemy wiedzieć więcej.', 'pl', 20),
  ('Potrzebujemy szczegółów', 'Dziękujemy! Żeby to poprawić, potrzebujemy trochę więcej szczegółów: którego dnia i o której godzinie to było i co dokładnie się nie zgadzało?', 'pl', 30),
  ('Thanks — fixed', 'Thank you for letting us know! We checked and fixed it in the route. The change is already live.', 'en', 40)
) v(title, body, lang, sort)
WHERE NOT EXISTS (SELECT 1 FROM ops.ticket_templates);

CREATE OR REPLACE FUNCTION admin.ticket_templates() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_temp AS $f$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'body', body, 'lang', lang, 'sort', sort) ORDER BY sort, id), '[]') FROM ops.ticket_templates;
$f$;
CREATE OR REPLACE FUNCTION admin.ticket_template_save(p_id bigint, p_title text, p_body text, p_lang text DEFAULT 'pl', p_delete boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_temp AS $f$
DECLARE v bigint;
BEGIN
  IF p_delete THEN DELETE FROM ops.ticket_templates WHERE id = p_id; RETURN jsonb_build_object('ok', true); END IF;
  IF length(btrim(coalesce(p_title, ''))) < 2 OR length(btrim(coalesce(p_body, ''))) < 2 THEN RETURN jsonb_build_object('error', 'length'); END IF;
  IF p_id IS NULL THEN
    INSERT INTO ops.ticket_templates (title, body, lang, sort) VALUES (left(btrim(p_title), 80), left(btrim(p_body), 4000), left(coalesce(p_lang, 'pl'), 8),
      coalesce((SELECT max(sort) + 10 FROM ops.ticket_templates), 10)) RETURNING id INTO v;
  ELSE
    UPDATE ops.ticket_templates SET title = left(btrim(p_title), 80), body = left(btrim(p_body), 4000), lang = left(coalesce(p_lang, 'pl'), 8), updated_at = now()
     WHERE id = p_id RETURNING id INTO v;
  END IF;
  RETURN jsonb_build_object('ok', v IS NOT NULL, 'id', v);
END $f$;
DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['admin.ticket_templates()', 'admin.ticket_template_save(bigint, text, text, text, boolean)'] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO quolino', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO quolino_admin', f);
  END LOOP;
END $$;

-- ── konto rodzica jak w sklepie: nowe zgłoszenie z konta, moje dane (eksport), usunięcie konta ──
CREATE OR REPLACE FUNCTION public.ticket_new(p_token text, p_subject text, p_body text, p_city text DEFAULT NULL, p_lang text DEFAULT 'pl') RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE cl jsonb; v_sub uuid; v_id bigint; v_no text; v_body text := btrim(coalesce(p_body, '')); v_subj text := btrim(coalesce(p_subject, ''));
BEGIN
  cl := ops.jwt_claims(p_token);
  IF cl IS NULL THEN RETURN jsonb_build_object('error', 'invalid_session'); END IF;
  v_sub := (cl ->> 'sub')::uuid;
  IF length(v_subj) < 3 OR length(v_subj) > 120 OR length(v_body) < 10 OR length(v_body) > 2000 THEN RETURN jsonb_build_object('error', 'length'); END IF;
  IF v_body ~* '(<\s*a\s|<\s*script|\[url|\[link)' THEN RETURN jsonb_build_object('error', 'html'); END IF;
  IF (SELECT count(*) FROM ops.tickets WHERE sub = v_sub AND source = 'account' AND created_at > now() - interval '1 day') >= 5 THEN
    RETURN jsonb_build_object('error', 'rate_limit');
  END IF;
  IF p_city IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.cities WHERE slug = p_city AND status = 'published') THEN p_city := NULL; END IF;
  INSERT INTO ops.tickets (number, source, source_id, sub, lang, subject, city_slug, last_client_at, client_seen_at)
  VALUES (ops.ticket_number(), 'account', gen_random_uuid()::text, v_sub, left(p_lang, 8), left(v_subj, 120), p_city, now(), now())
  RETURNING id, number INTO v_id, v_no;
  INSERT INTO ops.ticket_messages (ticket_id, author, body) VALUES (v_id, 'client', v_body);
  PERFORM pg_notify('ticket_client', v_no);
  RETURN jsonb_build_object('ok', true, 'number', v_no);
END $f$;

CREATE OR REPLACE FUNCTION public.my_data(p_token text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE cl jsonb; v_sub uuid; v_mail text;
BEGIN
  cl := ops.jwt_claims(p_token);
  IF cl IS NULL THEN RETURN jsonb_build_object('error', 'invalid_session'); END IF;
  v_sub := (cl ->> 'sub')::uuid;
  SELECT email INTO v_mail FROM auth.users WHERE id = v_sub AND deleted_at IS NULL;
  IF v_mail IS NULL THEN RETURN jsonb_build_object('error', 'invalid_session'); END IF;
  RETURN admin.user_export(v_mail) - 'error' || jsonb_build_object('tickets', admin.user_tickets(v_sub));
END $f$;

CREATE OR REPLACE FUNCTION public.delete_my_account(p_token text, p_confirm text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE cl jsonb; v_sub uuid; v_mail text;
BEGIN
  cl := ops.jwt_claims(p_token);
  IF cl IS NULL THEN RETURN jsonb_build_object('error', 'invalid_session'); END IF;
  v_sub := (cl ->> 'sub')::uuid;
  SELECT email INTO v_mail FROM auth.users WHERE id = v_sub AND deleted_at IS NULL;
  IF v_mail IS NULL THEN RETURN jsonb_build_object('error', 'invalid_session'); END IF;
  RETURN admin.user_delete(v_mail, p_confirm);   -- sprawdza potwierdzenie; tickety znikają kaskadą (ops.tickets.sub)
END $f$;
DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['public.ticket_new(text, text, text, text, text)', 'public.my_data(text)', 'public.delete_my_account(text, text)'] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO quolino', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO web_anon, quolino', f);
  END LOOP;
END $$;
-- eksport RODO z panelu też z ticketami
CREATE OR REPLACE FUNCTION admin.user_export_full(p_email text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_temp AS $f$
DECLARE r jsonb := admin.user_export(p_email); v_sub uuid;
BEGIN
  IF r ? 'error' THEN RETURN r; END IF;
  SELECT id INTO v_sub FROM auth.users WHERE lower(email) = lower(trim(p_email)) AND deleted_at IS NULL;
  RETURN r || jsonb_build_object('tickets', admin.user_tickets(v_sub));
END $f$;
ALTER FUNCTION admin.user_export_full(text) OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.user_export_full(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.user_export_full(text) TO quolino_admin;
NOTIFY pgrst, 'reload schema';
COMMIT;
