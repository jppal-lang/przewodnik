-- Poprawki po testach agentów (JP 2026-11-07: „wykonaj test agentami”). Nadpisuje funkcje z plików 2026-11-06/07; bezpieczne do powtórzenia.
--  B1 limit prób kodu zespołu (5/IP, łącznie) · B2 przypinanie ticketów tylko do potwierdzonego konta i świeżych zgłoszeń, usunięcie konta
--  nie kasuje cudzych zgłoszeń · B3 nowy link do zespołu unieważnia stary telefon · B4 „kto” w dzienniku tylko z panelu (strona = „strona”)
--  B5 globalny limit 200 · B6/RODO eksport i usunięcie pełne (newsletter, źródło, formularz, kolejka maili, dziennik) · B7 jedna wiadomość
--  do listy chętnych · B8 ops.audit bez PUBLIC · e2e: formularz nie przypina ticketu do cudzego konta po e-mailu, wypisanie usuwa maile
--  z kolejki, test nie zjada wysyłki, nagłówek List-Unsubscribe (campaign_mail.unsub), anulowanie w trakcie = „cancelled”
--  F1 data · F2 test · F3 wyszukiwarka z _ i % · F4 lista ticketów · F5 priorytet · F6 notatka NULL · F7 odpowiedź bez kanału · F10 dziennik
BEGIN;
SET LOCAL check_function_bodies = off;
REVOKE ALL ON FUNCTION ops.audit(text, text, text) FROM PUBLIC;
ALTER TABLE ops.campaign_mail ADD COLUMN IF NOT EXISTS unsub text;
-- B2: usunięcie konta nie kasuje zgłoszeń z urządzenia (zostają anonimowe); konto-owe kasuje user_delete jawnie
DO $$ DECLARE c text; BEGIN
  SELECT conname INTO c FROM pg_constraint WHERE conrelid = 'ops.tickets'::regclass AND contype = 'f' LIMIT 1;
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE ops.tickets DROP CONSTRAINT %I', c); END IF;
  ALTER TABLE ops.tickets ADD CONSTRAINT tickets_sub_fkey FOREIGN KEY (sub) REFERENCES auth.users (id) ON DELETE SET NULL;
END $$;


CREATE OR REPLACE FUNCTION ops.admin_who() RETURNS text LANGUAGE sql STABLE SET search_path = pg_temp AS $f$
  SELECT CASE WHEN current_setting('role', true) = 'quolino_admin'
           THEN coalesce(nullif(left(nullif(current_setting('request.headers', true), '')::json ->> 'x-admin-who', 60), ''), 'panel')
         WHEN nullif(current_setting('request.headers', true), '') IS NULL THEN 'automat'
         ELSE 'strona' END;
$f$;

CREATE OR REPLACE FUNCTION admin.totp_verify(p_code text, p_ip text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, pg_temp AS $f$
DECLARE r ops.admin_totp; now_step bigint := floor(extract(epoch FROM now()) / 30); st bigint; v_ip text := left(p_ip, 64);
BEGIN
  DELETE FROM ops.admin_totp_fail WHERE at < now() - interval '1 day';
  IF (SELECT count(*) FROM ops.admin_totp_fail WHERE at > now() - interval '15 minutes' AND admin_totp_fail.ip IS NOT DISTINCT FROM v_ip) >= 5
     OR (SELECT count(*) FROM ops.admin_totp_fail WHERE at > now() - interval '15 minutes') >= 200 THEN RETURN false; END IF;
  SELECT * INTO r FROM ops.admin_totp WHERE id = 1 FOR UPDATE;
  IF r.id IS NULL OR coalesce(p_code, '') !~ '^[0-9]{6}$' THEN INSERT INTO ops.admin_totp_fail (ip) VALUES (v_ip); RETURN false; END IF;
  FOR st IN now_step - 1 .. now_step + 1 LOOP
    CONTINUE WHEN st <= r.last_step;
    IF r.pending IS NOT NULL AND ops.totp_code(r.pending, st) = p_code THEN
      UPDATE ops.admin_totp SET secret = pending, pending = NULL, last_step = st, confirmed_at = now(), updated_at = now() WHERE id = 1;
      RETURN true;
    END IF;
    IF r.secret IS NOT NULL AND ops.totp_code(r.secret, st) = p_code THEN
      UPDATE ops.admin_totp SET last_step = st, updated_at = now() WHERE id = 1;
      RETURN true;
    END IF;
  END LOOP;
  INSERT INTO ops.admin_totp_fail (ip) VALUES (v_ip);
  RETURN false;
END $f$;

CREATE OR REPLACE FUNCTION admin.totp_login(p_code text, p_ip text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, pg_temp AS $f$
DECLARE r record; now_step bigint := floor(extract(epoch FROM now()) / 30); st bigint; v_ip text := left(p_ip, 64);
BEGIN
  IF admin.totp_verify(p_code, p_ip) THEN RETURN jsonb_build_object('ok', true, 'who', 'JP', 'role', 'owner'); END IF;
  -- totp_verify już policzył błąd; zespół sprawdzamy dopiero, gdy kod ma format, i tylko w limicie
  IF coalesce(p_code, '') !~ '^[0-9]{6}$' THEN RETURN jsonb_build_object('ok', false); END IF;
  IF (SELECT count(*) FROM ops.admin_totp_fail WHERE at > now() - interval '15 minutes' AND admin_totp_fail.ip IS NOT DISTINCT FROM v_ip) > 5
     OR (SELECT count(*) FROM ops.admin_totp_fail WHERE at > now() - interval '15 minutes') > 200 THEN RETURN jsonb_build_object('ok', false); END IF;
  FOR r IN SELECT * FROM ops.admin_team WHERE active AND (secret IS NOT NULL OR pending IS NOT NULL) FOR UPDATE LOOP
    FOR st IN now_step - 1 .. now_step + 1 LOOP
      CONTINUE WHEN st <= r.last_step;
      IF r.pending IS NOT NULL AND ops.totp_code(r.pending, st) = p_code THEN
        UPDATE ops.admin_team SET secret = pending, pending = NULL, last_step = st, last_login_at = now() WHERE id = r.id;
        DELETE FROM ops.admin_totp_fail WHERE ctid = (SELECT ctid FROM ops.admin_totp_fail WHERE admin_totp_fail.ip IS NOT DISTINCT FROM v_ip ORDER BY at DESC LIMIT 1);
        RETURN jsonb_build_object('ok', true, 'who', r.name, 'role', r.role);
      END IF;
      IF r.secret IS NOT NULL AND ops.totp_code(r.secret, st) = p_code THEN
        UPDATE ops.admin_team SET last_step = st, last_login_at = now() WHERE id = r.id;
        DELETE FROM ops.admin_totp_fail WHERE ctid = (SELECT ctid FROM ops.admin_totp_fail WHERE admin_totp_fail.ip IS NOT DISTINCT FROM v_ip ORDER BY at DESC LIMIT 1);
        RETURN jsonb_build_object('ok', true, 'who', r.name, 'role', r.role);
      END IF;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('ok', false);
END $f$;

CREATE OR REPLACE FUNCTION admin.team_invite(p_name text, p_role text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_temp AS $f$
DECLARE v_id int; t text := translate(rtrim(encode(ops.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
BEGIN
  IF p_role NOT IN ('support', 'editor') THEN RETURN jsonb_build_object('error', 'role'); END IF;
  IF btrim(coalesce(p_name, '')) !~ '^[A-Za-z0-9 ._-]{2,40}$' OR upper(btrim(p_name)) = 'JP' THEN RETURN jsonb_build_object('error', 'Imię: 2–40 znaków, litery bez polskich znaków, cyfry, spacja.'); END IF;
  INSERT INTO ops.admin_team (name, role) VALUES (btrim(p_name), p_role)
  ON CONFLICT (name) DO UPDATE SET role = EXCLUDED.role, active = true, secret = NULL, pending = NULL, last_step = 0 RETURNING id INTO v_id;   -- stary telefon traci dostęp
  INSERT INTO ops.admin_links (token_hash, expires_at, requested_by, purpose)
  VALUES (encode(ops.digest(t, 'sha256'), 'hex'), now() + interval '24 hours', 'team:' || v_id, 'team');
  RETURN jsonb_build_object('ok', true, 'link', 'https://admin.quolino.com/totp-setup?t=' || t);
END $f$;

CREATE OR REPLACE FUNCTION ops.ticket_open(p_source text, p_source_id text, p_subject text, p_body text, p_at timestamptz,
    p_client uuid, p_email text, p_lang text, p_city text, p_stop text, p_category text, p_priority smallint, p_status text DEFAULT 'new')
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_temp AS $f$
DECLARE v_id bigint; v_sub uuid;
BEGIN
  SELECT id INTO v_id FROM ops.tickets WHERE source = p_source AND source_id = p_source_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  -- formularz: NIE przypinamy po e-mailu (każdy może wpisać cudzy adres → wiadomość w cudzym koncie); odpowiedź idzie e-mailem
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

CREATE OR REPLACE FUNCTION public.tickets_link(p_token text, p_client uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE cl jsonb; v_sub uuid; v_mail text; n int := 0; m int := 0;
BEGIN
  cl := ops.jwt_claims(p_token);
  IF cl IS NULL THEN RETURN jsonb_build_object('error', 'invalid_session'); END IF;
  v_sub := (cl ->> 'sub')::uuid;
  SELECT lower(email) INTO v_mail FROM auth.users WHERE id = v_sub AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL;
  IF v_mail IS NULL THEN RETURN jsonb_build_object('ok', true, 'linked', 0); END IF;   -- tylko potwierdzone konto
  IF p_client IS NOT NULL THEN
    UPDATE ops.tickets SET sub = v_sub WHERE client_id = p_client AND sub IS NULL AND created_at > now() - interval '30 days'; GET DIAGNOSTICS n = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('ok', true, 'linked', n + m);
END $f$;

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
     ORDER BY CASE t.status WHEN 'new' THEN 0 WHEN 'open' THEN 1 WHEN 'waiting' THEN 2 ELSE 3 END, t.updated_at DESC LIMIT 500) y));
$f$;

CREATE OR REPLACE FUNCTION admin.ticket_reply(p_number text, p_body text, p_note boolean DEFAULT false, p_status text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_temp AS $f$
DECLARE t ops.tickets; v_body text := btrim(coalesce(p_body, '')); v_mail text; v_st text; v_lang text; v_note boolean := coalesce(p_note, false); v_chan boolean;
BEGIN
  SELECT * INTO t FROM ops.tickets WHERE number = upper(btrim(p_number)) FOR UPDATE;
  IF t.id IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF length(v_body) < 1 OR length(v_body) > 4000 THEN RETURN jsonb_build_object('error', 'length'); END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('new', 'open', 'waiting', 'resolved', 'closed', 'spam') THEN RETURN jsonb_build_object('error', 'status'); END IF;
  INSERT INTO ops.ticket_messages (ticket_id, author, body) VALUES (t.id, CASE WHEN v_note THEN 'note' ELSE 'team' END, v_body);
  v_chan := t.sub IS NOT NULL OR t.email IS NOT NULL;   -- F7: bez konta i e-maila klient odpowiedzi nie zobaczy → „rozwiązane”, nie „czeka”
  v_st := coalesce(p_status, CASE WHEN v_note THEN CASE WHEN t.status = 'new' THEN 'open' ELSE t.status END WHEN v_chan THEN 'waiting' ELSE 'resolved' END);
  UPDATE ops.tickets SET status = v_st, updated_at = now(), last_team_at = CASE WHEN v_note THEN last_team_at ELSE now() END WHERE id = t.id;
  IF NOT v_note THEN
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
  IF NOT v_note AND t.source = 'contact' THEN UPDATE ops.contact_messages SET status = 'answered', handled_at = now() WHERE id::text = t.source_id AND status NOT IN ('spam', 'done'); END IF;
  RETURN jsonb_build_object('ok', true, 'status', v_st, 'mail', v_mail IS NOT NULL AND NOT v_note, 'no_channel', NOT v_chan AND NOT v_note);
END $f$;

CREATE OR REPLACE FUNCTION admin.ticket_set(p_number text, p_status text DEFAULT NULL, p_priority int DEFAULT NULL, p_category text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_temp AS $f$
DECLARE n int;
BEGIN
  IF p_status IS NOT NULL AND p_status NOT IN ('new', 'open', 'waiting', 'resolved', 'closed', 'spam') THEN RETURN jsonb_build_object('error', 'status'); END IF;
  IF p_category IS NOT NULL AND p_category !~ '^[a-z_]{3,30}$' THEN RETURN jsonb_build_object('error', 'category'); END IF;
  IF p_priority IS NOT NULL AND p_priority NOT BETWEEN 1 AND 4 THEN RETURN jsonb_build_object('error', 'priority'); END IF;
  UPDATE ops.tickets SET status = coalesce(p_status, status), priority = coalesce(p_priority::smallint, priority),
         category = coalesce(p_category, category), updated_at = now() WHERE number = upper(btrim(p_number));
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  -- stary status źródła, żeby Hermes/Discord nie widziały zamkniętego jako nowe
  UPDATE ops.contact_messages c SET status = CASE p_status WHEN 'spam' THEN 'spam' WHEN 'closed' THEN 'done' WHEN 'resolved' THEN 'answered' ELSE c.status END, handled_at = now()
    FROM ops.tickets t WHERE t.number = upper(btrim(p_number)) AND t.source = 'contact' AND c.id::text = t.source_id AND p_status IS NOT NULL;
  RETURN jsonb_build_object('ok', true);
END $f$;

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
  VALUES (ops.ticket_number(), 'account', gen_random_uuid()::text, v_sub, nullif(left(regexp_replace(lower(coalesce(p_lang, '')), '[^a-z-]', '', 'g'), 8), ''), left(v_subj, 120), p_city, now(), now())
  RETURNING id, number INTO v_id, v_no;
  INSERT INTO ops.ticket_messages (ticket_id, author, body) VALUES (v_id, 'client', v_body);
  PERFORM pg_notify('ticket_client', v_no);
  RETURN jsonb_build_object('ok', true, 'number', v_no);
END $f$;

CREATE OR REPLACE FUNCTION admin.user_export(p_email text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_temp AS $f$
DECLARE v record; out jsonb;   -- tylko kolumny z GRANT (SELECT * na auth.users jest zabroniony)
BEGIN
  SELECT id, email, created_at, email_confirmed_at, last_sign_in_at, raw_user_meta_data INTO v
    FROM auth.users WHERE lower(email) = lower(trim(p_email)) AND deleted_at IS NULL;
  IF v.id IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  out := jsonb_build_object(
    'exported_at', now(), 'service', 'Quolino (quolino.com)',
    'account', jsonb_build_object('email', v.email, 'created_at', v.created_at, 'email_confirmed_at', v.email_confirmed_at,
                                  'last_sign_in_at', v.last_sign_in_at, 'source', v.raw_user_meta_data ->> 'src', 'language', v.raw_user_meta_data ->> 'lang'),
    'trip_runs', (SELECT coalesce(jsonb_agg(jsonb_build_object('trip', city_slug, 'created_at', created_at, 'expires_at', expires_at, 'opens', opens) ORDER BY created_at), '[]') FROM ops.trip_runs WHERE sub = v.id),
    'trip_opens', (SELECT coalesce(jsonb_agg(jsonb_build_object('trip', city_slug, 'language', lang, 'at', used_at) ORDER BY used_at), '[]') FROM ops.member_usage WHERE sub = v.id),
    'plan_shares', (SELECT coalesce(jsonb_agg(jsonb_build_object('trip', city_slug, 'created_at', created_at, 'expires_at', expires_at, 'opens', opens) ORDER BY created_at), '[]') FROM ops.plan_shares WHERE sub = v.id),
    'coupons', (SELECT coalesce(jsonb_agg(jsonb_build_object('code', code, 'percent', percent, 'trip', trip_slug, 'created_at', created_at, 'expires_at', expires_at, 'used_at', used_at) ORDER BY created_at), '[]') FROM public.coupons WHERE user_id = v.id),
    'paid_waitlist', (SELECT jsonb_build_object('since', created_at, 'consent', consent) FROM ops.paid_waitlist WHERE sub = v.id),
    'signup_reminder', (SELECT sent_at FROM ops.signup_reminders WHERE user_id = v.id),
    'newsletter', (SELECT jsonb_build_object('since', created_at, 'consent', consent) FROM ops.newsletter WHERE sub = v.id),
    'source_after_login', (SELECT jsonb_build_object('source', src, 'language', lang, 'at', set_at) FROM ops.account_meta WHERE sub = v.id),
    'contact_messages', (SELECT coalesce(jsonb_agg(jsonb_build_object('at', created_at, 'topic', topic, 'message', body) ORDER BY created_at), '[]') FROM ops.contact_messages WHERE lower(email) = lower(v.email)));
  INSERT INTO ops.gdpr_log (action, email_sha) VALUES ('export', encode(ops.digest(lower(v.email), 'sha256'), 'hex'));
  RETURN out;
END $f$;

CREATE OR REPLACE FUNCTION admin.user_delete(p_email text, p_confirm text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_temp AS $f$
DECLARE v record;
BEGIN
  IF lower(trim(coalesce(p_confirm, ''))) <> lower(trim(coalesce(p_email, ''))) THEN RETURN jsonb_build_object('error', 'confirm_mismatch'); END IF;
  SELECT id, email INTO v FROM auth.users WHERE lower(email) = lower(trim(p_email)) AND deleted_at IS NULL;
  IF v.id IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF EXISTS (SELECT 1 FROM ops.member_admins WHERE sub = v.id) THEN RETURN jsonb_build_object('error', 'admin_account'); END IF;
  DELETE FROM ops.trip_runs WHERE sub = v.id;
  DELETE FROM ops.member_usage WHERE sub = v.id;
  DELETE FROM ops.plan_shares WHERE sub = v.id;
  DELETE FROM ops.signup_reminders WHERE user_id = v.id;
  -- tickety: z konta i z formularza (ten adres) — kasujemy; zgłoszenia przy przystankach zostają anonimowe (bez konta i urządzenia)
  UPDATE ops.admin_audit SET detail = NULL WHERE target IN (SELECT number FROM ops.tickets WHERE sub = v.id OR lower(email) = lower(v.email));
  DELETE FROM ops.tickets WHERE (sub = v.id AND source = 'account') OR lower(email) = lower(v.email);
  UPDATE ops.tickets SET sub = NULL, client_id = NULL WHERE sub = v.id;
  DELETE FROM ops.contact_messages WHERE lower(email) = lower(v.email);
  DELETE FROM ops.campaign_mail WHERE to_email = lower(v.email);
  PERFORM set_config('quolino.gdpr_delete', '1', true);
  DELETE FROM auth.users WHERE id = v.id;
  PERFORM set_config('quolino.gdpr_delete', '', true);
  INSERT INTO ops.gdpr_log (action, email_sha) VALUES ('delete', encode(ops.digest(lower(v.email), 'sha256'), 'hex'));
  RETURN jsonb_build_object('ok', true);
END $f$;

CREATE OR REPLACE FUNCTION admin.setting_save(p_name text, p_value text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_temp AS $f$
DECLARE k text; v text := btrim(replace(coalesce(p_value, ''), ',', '.'));
BEGIN
  SELECT x ->> 'kind' INTO k FROM jsonb_array_elements(admin.settings_list()) x WHERE x ->> 'name' = p_name;
  IF k IS NULL THEN RETURN jsonb_build_object('error', 'unknown'); END IF;
  IF k = 'num' AND (v !~ '^\d{1,5}(\.\d{1,2})?$') THEN RETURN jsonb_build_object('error', 'Liczba, np. 10 albo 2.5'); END IF;
  IF k = 'int' AND (v !~ '^\d{1,4}$') THEN RETURN jsonb_build_object('error', 'Liczba całkowita'); END IF;
  IF k = 'onoff' AND v NOT IN ('on', 'off') THEN RETURN jsonb_build_object('error', 'on albo off'); END IF;
  IF k = 'date' THEN
    IF v !~ '^\d{4}-\d{2}-\d{2}' THEN RETURN jsonb_build_object('error', 'Data, np. 2027-06-01'); END IF;
    BEGIN v := v::timestamptz::text; EXCEPTION WHEN others THEN RETURN jsonb_build_object('error', 'Data, np. 2027-06-01'); END;
  END IF;
  INSERT INTO ops.app_settings (name, value, note, updated_at) VALUES (p_name, v, 'ustawione w panelu', now())
  ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN jsonb_build_object('ok', true, 'value', v);
END $f$;

CREATE OR REPLACE FUNCTION admin.search(p_q text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_temp AS $f$
DECLARE q text := btrim(coalesce(p_q, '')); lk text;
BEGIN
  IF length(q) < 2 THEN RETURN '{"tickets":[],"users":[],"stops":[]}'::jsonb; END IF;
  lk := '%' || replace(replace(replace(lower(q), '\', '\\'), '%', '\%'), '_', '\_') || '%';   -- znaki _ i % szukane dosłownie
  RETURN jsonb_build_object(
    'tickets', (SELECT coalesce(jsonb_agg(jsonb_build_object('number', number, 'subject', subject, 'status', status)), '[]') FROM (
       SELECT number, subject, status FROM ops.tickets WHERE lower(number) LIKE lk OR lower(subject) LIKE lk OR lower(coalesce(email, '')) LIKE lk ORDER BY updated_at DESC LIMIT 8) x),
    'users', (SELECT coalesce(jsonb_agg(jsonb_build_object('email', email, 'confirmed', email_confirmed_at IS NOT NULL)), '[]') FROM (
       SELECT email, email_confirmed_at FROM auth.users WHERE deleted_at IS NULL AND lower(email) LIKE lk ORDER BY created_at DESC LIMIT 8) y),
    'stops', (SELECT coalesce(jsonb_agg(jsonb_build_object('city_slug', city_slug, 'name', name, 'n', stop_number)), '[]') FROM (
       SELECT DISTINCT ON (s.id) s.city_slug, t.name, s.stop_number FROM public.stops s JOIN public.stop_translations t ON t.stop_id = s.id AND t.lang = 'pl'
        WHERE lower(t.name) LIKE lk LIMIT 8) z));
END $f$;

CREATE OR REPLACE FUNCTION admin.campaign_send(p_id bigint, p_test_email text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_temp AS $f$
DECLARE c ops.campaigns; n int;
BEGIN
  SELECT * INTO c FROM ops.campaigns WHERE id = p_id FOR UPDATE;
  IF c.id IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF p_test_email IS NOT NULL THEN
    INSERT INTO ops.campaign_mail (campaign_id, to_email, subject, body) VALUES (c.id, lower(btrim(p_test_email)), '[TEST] ' || c.subject,
      c.body || E'\n\n—\nTo jest wiadomość testowa. Link do wypisania pojawi się w prawdziwej wysyłce.')
    ON CONFLICT (campaign_id, to_email) DO UPDATE SET sent_at = NULL, tries = 0, error = NULL, created_at = now();
    PERFORM ops.audit('wiadomość: test', c.title, lower(btrim(p_test_email)));
    RETURN jsonb_build_object('ok', true, 'test', true);
  END IF;
  IF c.status <> 'draft' THEN RETURN jsonb_build_object('error', 'Ta wiadomość już poszła.'); END IF;
  -- lista chętnych zgodziła się na JEDEN e-mail o starcie płatnej wersji
  IF c.audience = 'waitlist' AND EXISTS (SELECT 1 FROM ops.campaigns WHERE audience = 'waitlist' AND status IN ('sending', 'sent') AND id <> c.id) THEN
    RETURN jsonb_build_object('error', 'Do listy chętnych poszła już wiadomość — zgoda obejmuje jeden e-mail.');
  END IF;
  DELETE FROM ops.campaign_mail WHERE campaign_id = c.id AND subject LIKE '[TEST] %';   -- test nie blokuje prawdziwej wysyłki pod tym adresem
  INSERT INTO ops.campaign_mail (campaign_id, to_email, subject, unsub, body)
  SELECT c.id, lower(x.email), c.subject, x.unsub, c.body || E'\n\n—\nQuolino · quolino.com\n' ||
         CASE WHEN coalesce(x.lang, 'pl') LIKE 'pl%' THEN 'Nie chcesz takich wiadomości? Wypisz się: ' ELSE 'Unsubscribe: ' END ||
         'https://quolino.com/wypisz.html?t=' || x.unsub
    FROM (SELECT email, lang, unsub FROM ops.paid_waitlist WHERE c.audience = 'waitlist'
          UNION ALL SELECT email, lang, unsub FROM ops.newsletter WHERE c.audience = 'newsletter') x
   WHERE c.lang IS NULL OR coalesce(x.lang, 'pl') LIKE c.lang || '%'
  ON CONFLICT (campaign_id, to_email) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE ops.campaigns SET status = 'sending', sent_at = now(), recipients = n, updated_at = now() WHERE id = c.id;
  RETURN jsonb_build_object('ok', true, 'recipients', n);
END $f$;

CREATE OR REPLACE FUNCTION admin.campaign_cancel(p_id bigint) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_temp AS $f$
BEGIN
  DELETE FROM ops.campaign_mail WHERE campaign_id = p_id AND sent_at IS NULL;
  UPDATE ops.campaigns SET status = CASE WHEN status IN ('draft', 'sending') THEN 'cancelled' ELSE status END, updated_at = now() WHERE id = p_id;
  RETURN jsonb_build_object('ok', FOUND);
END $f$;

CREATE OR REPLACE FUNCTION public.mail_unsubscribe(p_t text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE n int; m int; v_mail text;
BEGIN
  IF coalesce(p_t, '') !~ '^[0-9a-f]{32}$' THEN RETURN jsonb_build_object('ok', false); END IF;
  DELETE FROM ops.newsletter WHERE unsub = p_t RETURNING email INTO v_mail; GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN DELETE FROM ops.campaign_mail WHERE sent_at IS NULL AND to_email = lower(v_mail) AND campaign_id IN (SELECT id FROM ops.campaigns WHERE audience = 'newsletter'); END IF;
  DELETE FROM ops.paid_waitlist WHERE unsub = p_t RETURNING email INTO v_mail; GET DIAGNOSTICS m = ROW_COUNT;
  IF m > 0 THEN DELETE FROM ops.campaign_mail WHERE sent_at IS NULL AND to_email = lower(v_mail) AND campaign_id IN (SELECT id FROM ops.campaigns WHERE audience = 'waitlist'); END IF;
  DELETE FROM ops.campaign_mail WHERE sent_at IS NULL AND unsub = p_t;
  RETURN jsonb_build_object('ok', n + m > 0);
END $f$;

CREATE OR REPLACE FUNCTION public.newsletter_set(p_token text, p_on boolean, p_lang text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE cl jsonb; v_sub uuid; v_mail text;
BEGIN
  cl := ops.jwt_claims(p_token);
  IF cl IS NULL THEN RETURN jsonb_build_object('error', 'invalid_session'); END IF;
  v_sub := (cl ->> 'sub')::uuid;
  SELECT email INTO v_mail FROM auth.users WHERE id = v_sub AND deleted_at IS NULL;
  IF v_mail IS NULL THEN RETURN jsonb_build_object('error', 'invalid_session'); END IF;
  IF p_on IS NOT TRUE THEN DELETE FROM ops.newsletter WHERE sub = v_sub; RETURN jsonb_build_object('ok', true, 'on', false); END IF;
  INSERT INTO ops.newsletter (sub, email, lang, consent) VALUES (v_sub, v_mail, nullif(left(regexp_replace(lower(coalesce(p_lang, '')), '[^a-z-]', '', 'g'), 8), ''),
    'Zgoda na newsletter Quolino (konto, ' || to_char(now(), 'YYYY-MM-DD') || ')') ON CONFLICT (sub) DO UPDATE SET lang = coalesce(EXCLUDED.lang, ops.newsletter.lang);
  RETURN jsonb_build_object('ok', true, 'on', true);
END $f$;

CREATE OR REPLACE FUNCTION public.waitlist_join(p_token text, p_lang text DEFAULT NULL, p_on boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE cl jsonb; v_sub uuid; v_mail text; v_src text;
BEGIN
  cl := ops.jwt_claims(p_token);
  IF cl IS NULL THEN RETURN jsonb_build_object('error', 'invalid_session'); END IF;
  v_sub := (cl ->> 'sub')::uuid;
  SELECT email, left(raw_user_meta_data ->> 'src', 60) INTO v_mail, v_src FROM auth.users WHERE id = v_sub AND deleted_at IS NULL;
  IF v_mail IS NULL THEN RETURN jsonb_build_object('error', 'invalid_session'); END IF;
  IF p_on IS FALSE THEN DELETE FROM ops.paid_waitlist WHERE sub = v_sub; RETURN jsonb_build_object('ok', true, 'on', false); END IF;
  INSERT INTO ops.paid_waitlist (sub, email, lang, src, consent)
  VALUES (v_sub, v_mail, nullif(left(regexp_replace(lower(coalesce(p_lang, '')), '[^a-z-]', '', 'g'), 8), ''), v_src, 'Zgoda na jeden e-mail o starcie płatnej wersji Quolino (konto, ' || to_char(now(), 'YYYY-MM-DD') || ')')
  ON CONFLICT (sub) DO UPDATE SET lang = coalesce(EXCLUDED.lang, ops.paid_waitlist.lang);
  RETURN jsonb_build_object('ok', true, 'on', true);
END $f$;

CREATE OR REPLACE FUNCTION ops.audit_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_temp AS $f$
DECLARE j jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END; o jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'ticket_messages' THEN
      IF j ->> 'author' IN ('team', 'note') THEN
        PERFORM ops.audit(CASE j ->> 'author' WHEN 'team' THEN 'ticket: odpowiedź' ELSE 'ticket: notatka' END,
                          (SELECT number FROM ops.tickets WHERE id = (j ->> 'ticket_id')::bigint), left(j ->> 'body', 120));
      END IF;
    WHEN 'tickets' THEN
      IF o IS NOT NULL AND (j ->> 'status' IS DISTINCT FROM o ->> 'status' OR j ->> 'priority' IS DISTINCT FROM o ->> 'priority'
                            OR j ->> 'category' IS DISTINCT FROM o ->> 'category' OR j ->> 'stage' IS DISTINCT FROM o ->> 'stage')
         AND ops.admin_who() <> 'automat' THEN
        PERFORM ops.audit('ticket: zmiana', j ->> 'number', concat_ws(' · ',
          CASE WHEN j ->> 'status' IS DISTINCT FROM o ->> 'status' THEN 'status ' || coalesce(o ->> 'status', '—') || ' → ' || (j ->> 'status') END,
          CASE WHEN j ->> 'priority' IS DISTINCT FROM o ->> 'priority' THEN 'priorytet P' || coalesce(j ->> 'priority', '—') END,
          CASE WHEN j ->> 'category' IS DISTINCT FROM o ->> 'category' THEN 'kategoria ' || coalesce(j ->> 'category', '—') END,
          CASE WHEN j ->> 'stage' IS DISTINCT FROM o ->> 'stage' THEN 'etap ' || coalesce(j ->> 'stage', '—') END));
      END IF;
    WHEN 'gdpr_log' THEN PERFORM ops.audit(CASE j ->> 'action' WHEN 'delete' THEN 'RODO: usunięcie konta' ELSE 'RODO: eksport danych' END, 'konto ' || left(j ->> 'email_sha', 10) || '…');
    WHEN 'app_settings' THEN PERFORM ops.audit('ustawienie', j ->> 'name', coalesce(o ->> 'value', '—') || ' → ' || (j ->> 'value'));
    WHEN 'coupons' THEN
      IF o IS NULL THEN PERFORM ops.audit('kupon: wydany', j ->> 'code', (j ->> 'percent') || '% · ' || (j ->> 'source'));
      ELSIF (j ->> 'expires_at') IS DISTINCT FROM (o ->> 'expires_at') THEN PERFORM ops.audit('kupon: zmiana ważności', j ->> 'code', j ->> 'expires_at'); END IF;
    WHEN 'deploy_requests' THEN
      IF j ->> 'status' IS DISTINCT FROM o ->> 'status' AND j ->> 'status' IN ('approved', 'rejected', 'done', 'failed') THEN
        PERFORM ops.audit('wdrożenie: ' || (j ->> 'status'), left(j ->> 'hash', 7), left(j ->> 'summary', 200)); END IF;
    WHEN 'cost_requests' THEN
      IF j ->> 'status' IS DISTINCT FROM o ->> 'status' AND j ->> 'status' IN ('approved', 'rejected') THEN
        PERFORM ops.audit('koszt: ' || (j ->> 'status'), j ->> 'title', j ->> 'est_usd'); END IF;
    WHEN 'city_versions' THEN
      IF j ->> 'status' IS DISTINCT FROM o ->> 'status' AND j ->> 'status' IN ('published', 'rejected') THEN
        PERFORM ops.audit(CASE j ->> 'status' WHEN 'published' THEN 'trasa: publikacja' ELSE 'trasa: odrzucenie' END, (j ->> 'city_slug') || ' v' || (j ->> 'version'), left(j ->> 'note', 200)); END IF;
    WHEN 'campaigns' THEN
      IF o IS NULL OR j ->> 'status' IS DISTINCT FROM o ->> 'status' THEN PERFORM ops.audit('wiadomość: ' || (j ->> 'status'), j ->> 'title', j ->> 'audience'); END IF;
    WHEN 'admin_team' THEN
      IF o IS NOT NULL AND (j - 'last_step' - 'last_login_at') = (o - 'last_step' - 'last_login_at') THEN RETURN NEW; END IF;   -- samo logowanie
      PERFORM ops.audit(CASE WHEN o IS NULL THEN 'zespół: zaproszenie' WHEN (j ->> 'active') IS DISTINCT FROM (o ->> 'active') THEN 'zespół: ' || CASE WHEN (j ->> 'active')::boolean THEN 'włączone' ELSE 'wyłączone' END
                             WHEN j ->> 'secret' IS DISTINCT FROM o ->> 'secret' THEN 'zespół: Authenticator włączony' ELSE 'zespół: zmiana' END, j ->> 'name', j ->> 'role');
    WHEN 'jobs' THEN
      IF j ->> 'kind' = 'translate' AND o IS NULL AND ops.admin_who() <> 'automat' THEN PERFORM ops.audit('tłumaczenie: zlecone', j ->> 'city_slug', j ->> 'request'); END IF;
    WHEN 'ticket_templates' THEN PERFORM ops.audit('szablon odpowiedzi: ' || lower(TG_OP), coalesce(j ->> 'title', (to_jsonb(OLD)) ->> 'title'));
    ELSE NULL;
  END CASE;
  RETURN NEW;
END $f$;

DROP TRIGGER IF EXISTS audit ON ops.ticket_templates;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON ops.ticket_templates FOR EACH ROW EXECUTE FUNCTION ops.audit_trg();
-- formularz: tickety już przypięte po e-mailu do kont (stara reguła) — odpinamy, chyba że to konto samo założyło ticket
UPDATE ops.tickets SET sub = NULL WHERE source = 'contact' AND sub IS NOT NULL;
-- e-mail z formularza w tickecie nie żyje dłużej niż sama wiadomość (Hermes czyści formularz po 90 dniach)
UPDATE ops.tickets SET email = NULL WHERE source = 'contact' AND email IS NOT NULL AND updated_at < now() - interval '90 days';
REVOKE ALL ON FUNCTION ops.audit(text, text, text) FROM PUBLIC;
NOTIFY pgrst, 'reload schema';
COMMIT;
