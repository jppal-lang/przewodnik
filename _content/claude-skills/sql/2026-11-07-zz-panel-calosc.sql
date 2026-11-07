-- Panel admina — całość (JP 2026-11-07: „trzeba to wszystko zbudować”).
--  1 liczniki w pasku (nav_counts)            2 „Dziś”: liczby (today_numbers)        3 karta klienta (customer)
--  4 karta trasy: zgłoszenia/opinie/ruch     5 wyszukiwarka (search)                  6 Ustawienia (settings_list / setting_save)
--  7 Kupony (coupons_list / coupon_issue / coupon_revoke)                             8 Tłumaczenia (translations_matrix / translation_request)
--  9 Wiadomości: newsletter na serwerze + kampanie do listy chętnych / newslettera (wysyłka po zatwierdzeniu, wypisanie linkiem)
-- 10 Partnerzy (etapy na ticketach współpracy)  11 Dziennik zdarzeń (ops.admin_audit, wyzwalacze)  14 Konta zespołu z rolami (TOTP na osobę)
-- Kto: bramka panelu dopisuje nagłówek X-Admin-Who (z sesji) do /api — dziennik czyta go z request.headers; bez nagłówka = „automat”.
-- Wymaga plików 2026-11-06/07 (Authenticator, użytkownicy, ruch, tickety). Bezpieczne do powtórzenia.
BEGIN;
SET LOCAL check_function_bodies = off;   -- funkcje odwołują się do tabel tworzonych niżej w tym pliku
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA ops;

-- ── 11) dziennik zdarzeń ──────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops.admin_audit (
  id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), who text NOT NULL, action text NOT NULL, target text, detail text
);
CREATE INDEX IF NOT EXISTS admin_audit_at ON ops.admin_audit (at DESC);
ALTER TABLE ops.admin_audit OWNER TO quolino; ALTER SEQUENCE ops.admin_audit_id_seq OWNER TO quolino;
REVOKE ALL ON ops.admin_audit FROM PUBLIC;
CREATE OR REPLACE FUNCTION ops.admin_who() RETURNS text LANGUAGE sql STABLE SET search_path = pg_temp AS $f$
  SELECT coalesce(nullif(left(current_setting('request.headers', true)::json ->> 'x-admin-who', 60), ''),
                  CASE WHEN current_setting('request.headers', true) IS NULL THEN 'automat' ELSE 'panel' END);
$f$;
CREATE OR REPLACE FUNCTION ops.audit(p_action text, p_target text DEFAULT NULL, p_detail text DEFAULT NULL) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_temp AS $f$
  INSERT INTO ops.admin_audit (who, action, target, detail) VALUES (ops.admin_who(), p_action, left(p_target, 200), left(p_detail, 500));
$f$;
ALTER FUNCTION ops.admin_who() OWNER TO quolino; ALTER FUNCTION ops.audit(text, text, text) OWNER TO quolino;

CREATE OR REPLACE FUNCTION ops.audit_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_temp AS $f$
DECLARE j jsonb := to_jsonb(NEW); o jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;
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
      PERFORM ops.audit(CASE WHEN o IS NULL THEN 'zespół: zaproszenie' WHEN (j ->> 'active') IS DISTINCT FROM (o ->> 'active') THEN 'zespół: ' || CASE WHEN (j ->> 'active')::boolean THEN 'włączone' ELSE 'wyłączone' END
                             WHEN j ->> 'secret' IS DISTINCT FROM o ->> 'secret' THEN 'zespół: Authenticator włączony' ELSE 'zespół: zmiana' END, j ->> 'name', j ->> 'role');
    WHEN 'jobs' THEN
      IF j ->> 'kind' = 'translate' AND o IS NULL AND ops.admin_who() <> 'automat' THEN PERFORM ops.audit('tłumaczenie: zlecone', j ->> 'city_slug', j ->> 'request'); END IF;
    ELSE NULL;
  END CASE;
  RETURN NEW;
END $f$;
ALTER FUNCTION ops.audit_trg() OWNER TO quolino;

-- ── 10) partnerzy: etap współpracy na tickecie ──
ALTER TABLE ops.tickets ADD COLUMN IF NOT EXISTS stage text;
ALTER TABLE ops.tickets DROP CONSTRAINT IF EXISTS tickets_stage_check;
ALTER TABLE ops.tickets ADD CONSTRAINT tickets_stage_check CHECK (stage IS NULL OR stage IN ('nowy', 'rozmowa', 'oferta', 'umowa', 'odrzucony'));
UPDATE ops.tickets SET stage = 'nowy' WHERE stage IS NULL AND (category = 'wspolpraca' OR category = 'partner');

-- ── 14) zespół: osobne konta z rolą, każdy z własnym Authenticatorem ──
CREATE TABLE IF NOT EXISTS ops.admin_team (
  id serial PRIMARY KEY, name text NOT NULL UNIQUE CHECK (length(name) BETWEEN 2 AND 40),
  role text NOT NULL CHECK (role IN ('support', 'editor')),
  secret bytea, pending bytea, last_step bigint NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), last_login_at timestamptz
);
ALTER TABLE ops.admin_team OWNER TO quolino; ALTER SEQUENCE ops.admin_team_id_seq OWNER TO quolino;
REVOKE ALL ON ops.admin_team FROM PUBLIC;
ALTER TABLE ops.admin_links DROP CONSTRAINT IF EXISTS admin_links_purpose_check;
ALTER TABLE ops.admin_links ADD CONSTRAINT admin_links_purpose_check CHECK (purpose IN ('admin', 'stats', 'totp', 'team'));

-- włączenie Authenticatora: link „totp” = JP (właściciel), link „team” = osoba z zespołu (requested_by = 'team:<id>')
CREATE OR REPLACE FUNCTION admin.totp_setup(p_hash text, p_ip text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, pg_temp AS $f$
DECLARE l record; k bytea := ops.gen_random_bytes(20); who text := 'panel';
BEGIN
  UPDATE ops.admin_links SET used_at = now(), used_ip = left(p_ip, 64)
   WHERE token_hash = p_hash AND used_at IS NULL AND expires_at > now() AND purpose IN ('totp', 'team')
  RETURNING purpose, requested_by INTO l;
  IF l.purpose IS NULL THEN RETURN NULL; END IF;
  IF l.purpose = 'totp' THEN
    INSERT INTO ops.admin_totp (id, pending, updated_at) VALUES (1, k, now()) ON CONFLICT (id) DO UPDATE SET pending = EXCLUDED.pending, updated_at = now();
  ELSE
    UPDATE ops.admin_team SET pending = k WHERE id = substring(l.requested_by FROM '^team:(\d+)$')::int AND active
    RETURNING name INTO who;
    IF who IS NULL OR who = 'panel' THEN RETURN NULL; END IF;
  END IF;
  RETURN 'otpauth://totp/Quolino:' || replace(who, ' ', '%20') || '?secret=' || ops.b32(k) || '&issuer=Quolino&algorithm=SHA1&digits=6&period=30';
END $f$;

-- logowanie kodem: JP (właściciel) albo osoba z zespołu → {ok, who, role}; te same limity co totp_verify
CREATE OR REPLACE FUNCTION admin.totp_login(p_code text, p_ip text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, pg_temp AS $f$
DECLARE r record; now_step bigint := floor(extract(epoch FROM now()) / 30); st bigint; v_ip text := left(p_ip, 64);
BEGIN
  IF admin.totp_verify(p_code, p_ip) THEN RETURN jsonb_build_object('ok', true, 'who', 'JP', 'role', 'owner'); END IF;
  -- totp_verify już policzył błąd; zespół sprawdzamy dopiero, gdy kod ma format, i tylko w limicie
  IF coalesce(p_code, '') !~ '^[0-9]{6}$' THEN RETURN jsonb_build_object('ok', false); END IF;
  IF (SELECT count(*) FROM ops.admin_totp_fail WHERE at > now() - interval '15 minutes' AND admin_totp_fail.ip IS NOT DISTINCT FROM v_ip) > 5 THEN RETURN jsonb_build_object('ok', false); END IF;
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
CREATE OR REPLACE FUNCTION admin.totp_enabled() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ops, pg_temp AS $f$
  SELECT EXISTS (SELECT 1 FROM ops.admin_totp WHERE secret IS NOT NULL OR pending IS NOT NULL)
      OR EXISTS (SELECT 1 FROM ops.admin_team WHERE active AND (secret IS NOT NULL OR pending IS NOT NULL));
$f$;

-- tylko właściciel (bramka puszcza te funkcje wyłącznie roli owner)
CREATE OR REPLACE FUNCTION admin.team_list() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_temp AS $f$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'role', role, 'active', active, 'ready', secret IS NOT NULL,
    'created_at', created_at, 'last_login_at', last_login_at) ORDER BY active DESC, name), '[]') FROM ops.admin_team;
$f$;
-- zaproszenie: nowa osoba albo nowy telefon → jednorazowy link (24 h) do strony z kodem QR; JP przekazuje go tej osobie
CREATE OR REPLACE FUNCTION admin.team_invite(p_name text, p_role text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_temp AS $f$
DECLARE v_id int; t text := translate(rtrim(encode(ops.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
BEGIN
  IF p_role NOT IN ('support', 'editor') THEN RETURN jsonb_build_object('error', 'role'); END IF;
  IF btrim(coalesce(p_name, '')) !~ '^[A-Za-z0-9 ._-]{2,40}$' OR upper(btrim(p_name)) = 'JP' THEN RETURN jsonb_build_object('error', 'Imię: 2–40 znaków, litery bez polskich znaków, cyfry, spacja.'); END IF;
  INSERT INTO ops.admin_team (name, role) VALUES (btrim(p_name), p_role)
  ON CONFLICT (name) DO UPDATE SET role = EXCLUDED.role, active = true RETURNING id INTO v_id;
  INSERT INTO ops.admin_links (token_hash, expires_at, requested_by, purpose)
  VALUES (encode(ops.digest(t, 'sha256'), 'hex'), now() + interval '24 hours', 'team:' || v_id, 'team');
  RETURN jsonb_build_object('ok', true, 'link', 'https://admin.quolino.com/totp-setup?t=' || t);
END $f$;
CREATE OR REPLACE FUNCTION admin.team_set(p_id int, p_active boolean DEFAULT NULL, p_role text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_temp AS $f$
BEGIN
  IF p_role IS NOT NULL AND p_role NOT IN ('support', 'editor') THEN RETURN jsonb_build_object('error', 'role'); END IF;
  UPDATE ops.admin_team SET active = coalesce(p_active, active), role = coalesce(p_role, role) WHERE id = p_id;
  RETURN jsonb_build_object('ok', FOUND);
END $f$;

-- ── 1–2) liczniki i liczby na „Dziś” ──
CREATE OR REPLACE FUNCTION admin.nav_counts() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_temp AS $f$
  SELECT jsonb_build_object(
    'tickets_new', (SELECT count(*) FROM ops.tickets WHERE status = 'new'),
    'tickets_todo', (SELECT count(*) FROM ops.tickets WHERE status IN ('new', 'open')),
    'tickets_late', (SELECT count(*) FROM ops.tickets WHERE status IN ('new', 'open')
                       AND coalesce(last_client_at, created_at) < now() - make_interval(hours => coalesce((SELECT value::int FROM ops.app_settings WHERE name = 'ticket_sla_hours'), 24))),
    'users_new_24h', (SELECT count(*) FROM auth.users WHERE deleted_at IS NULL AND created_at > now() - interval '24 hours'),
    'partners_open', (SELECT count(*) FROM ops.tickets WHERE stage IN ('nowy', 'rozmowa', 'oferta') AND status <> 'spam'),
    'campaigns_draft', (SELECT count(*) FROM ops.campaigns WHERE status = 'draft'));
$f$;
CREATE OR REPLACE FUNCTION admin.today_numbers() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_temp AS $f$
  SELECT admin.nav_counts() || jsonb_build_object(
    'signups_7d', (SELECT count(*) FROM auth.users WHERE deleted_at IS NULL AND created_at > now() - interval '7 days'),
    'visitors_yesterday', (SELECT visitors FROM ops.site_daily WHERE dim = 'all' AND day = current_date - 1),
    'visitors_week', (SELECT sum(visitors) FROM ops.site_daily WHERE dim = 'all' AND day > current_date - 7),
    'trip_runs_7d', (SELECT count(*) FROM ops.trip_runs WHERE created_at > now() - interval '7 days'),
    'drafts_waiting', (SELECT count(DISTINCT city_slug) FROM public.city_versions v WHERE v.status = 'draft' AND v.trip IS NOT NULL),
    'rating_avg_30d', (SELECT round(avg(stars)::numeric, 1) FROM ops.ratings WHERE stop_id IS NULL AND updated_at > now() - interval '30 days'));
$f$;

-- ── 3) karta klienta ──
CREATE OR REPLACE FUNCTION admin.customer(p_email text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_temp AS $f$
DECLARE u record; mail text := lower(btrim(coalesce(p_email, '')));
BEGIN
  SELECT id, email, created_at, email_confirmed_at, last_sign_in_at, banned_until, raw_user_meta_data INTO u
    FROM auth.users WHERE lower(email) = mail AND deleted_at IS NULL;
  RETURN jsonb_build_object(
    'email', coalesce(u.email, mail), 'account', u.id IS NOT NULL,
    'created_at', u.created_at, 'confirmed_at', u.email_confirmed_at, 'last_sign_in_at', u.last_sign_in_at,
    'src', coalesce(u.raw_user_meta_data ->> 'src', (SELECT src FROM ops.account_meta WHERE sub = u.id)),
    'lang', coalesce(u.raw_user_meta_data ->> 'lang', (SELECT lang FROM ops.account_meta WHERE sub = u.id)),
    'waitlist', EXISTS (SELECT 1 FROM ops.paid_waitlist WHERE sub = u.id),
    'newsletter', EXISTS (SELECT 1 FROM ops.newsletter WHERE sub = u.id),
    'reminded_at', (SELECT sent_at FROM ops.signup_reminders WHERE user_id = u.id),
    'tickets', (SELECT coalesce(jsonb_agg(jsonb_build_object('number', number, 'subject', subject, 'status', status, 'updated_at', updated_at) ORDER BY updated_at DESC), '[]')
                  FROM ops.tickets WHERE sub = u.id OR (u.id IS NULL AND lower(email) = mail)),
    'runs', (SELECT coalesce(jsonb_agg(jsonb_build_object('trip', city_slug, 'at', created_at, 'opens', opens) ORDER BY created_at DESC), '[]') FROM ops.trip_runs WHERE sub = u.id),
    'opens', (SELECT coalesce(jsonb_agg(jsonb_build_object('trip', city_slug, 'n', n, 'last', l) ORDER BY l DESC), '[]')
                FROM (SELECT city_slug, count(*) AS n, max(used_at) AS l FROM ops.member_usage WHERE sub = u.id GROUP BY 1) x),
    'coupons', (SELECT coalesce(jsonb_agg(jsonb_build_object('code', code, 'percent', percent, 'source', source, 'trip', trip_slug, 'expires_at', expires_at, 'used_at', used_at) ORDER BY created_at DESC), '[]')
                  FROM public.coupons WHERE user_id = u.id));
END $f$;

-- ── 4) karta trasy ──
CREATE OR REPLACE FUNCTION admin.trip_feedback(p_slug text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_temp AS $f$
  SELECT jsonb_build_object(
    'slug', p_slug,
    'tickets', (SELECT coalesce(jsonb_agg(jsonb_build_object('number', number, 'subject', subject, 'status', status, 'source', source, 'stop', stop, 'updated_at', updated_at,
                  'preview', (SELECT left(body, 200) FROM ops.ticket_messages m WHERE m.ticket_id = t.id AND author = 'client' ORDER BY created_at DESC LIMIT 1)) ORDER BY updated_at DESC), '[]')
                  FROM ops.tickets t WHERE city_slug = p_slug),
    'ratings', (SELECT jsonb_build_object('avg', round(avg(stars)::numeric, 1), 'n', count(*),
                  'dist', jsonb_build_array(count(*) FILTER (WHERE stars = 1), count(*) FILTER (WHERE stars = 2), count(*) FILTER (WHERE stars = 3), count(*) FILTER (WHERE stars = 4), count(*) FILTER (WHERE stars = 5)))
                  FROM ops.ratings WHERE city_slug = p_slug AND stop_id IS NULL),
    'comments', (SELECT coalesce(jsonb_agg(jsonb_build_object('stars', stars, 'comment', comment, 'lang', lang, 'at', updated_at) ORDER BY updated_at DESC), '[]')
                   FROM (SELECT * FROM ops.ratings WHERE city_slug = p_slug AND stop_id IS NULL AND comment IS NOT NULL ORDER BY updated_at DESC LIMIT 30) r),
    'views_30d', (SELECT coalesce(sum(visitors), 0) FROM ops.site_daily WHERE dim = 'city' AND key = p_slug AND day > current_date - 30),
    'runs_30d', (SELECT count(*) FROM ops.trip_runs WHERE city_slug = p_slug AND created_at > now() - interval '30 days'),
    'opens_30d', (SELECT count(*) FROM ops.member_usage WHERE city_slug = p_slug AND used_at > now() - interval '30 days'));
$f$;

-- ── 5) wyszukiwarka (Ctrl K): tickety, klienci, przystanki ──
CREATE OR REPLACE FUNCTION admin.search(p_q text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_temp AS $f$
DECLARE q text := btrim(coalesce(p_q, '')); lk text;
BEGIN
  IF length(q) < 2 THEN RETURN '{"tickets":[],"users":[],"stops":[]}'::jsonb; END IF;
  lk := '%' || replace(replace(lower(q), '%', ''), '_', '') || '%';
  RETURN jsonb_build_object(
    'tickets', (SELECT coalesce(jsonb_agg(jsonb_build_object('number', number, 'subject', subject, 'status', status)), '[]') FROM (
       SELECT number, subject, status FROM ops.tickets WHERE lower(number) LIKE lk OR lower(subject) LIKE lk OR lower(coalesce(email, '')) LIKE lk ORDER BY updated_at DESC LIMIT 8) x),
    'users', (SELECT coalesce(jsonb_agg(jsonb_build_object('email', email, 'confirmed', email_confirmed_at IS NOT NULL)), '[]') FROM (
       SELECT email, email_confirmed_at FROM auth.users WHERE deleted_at IS NULL AND lower(email) LIKE lk ORDER BY created_at DESC LIMIT 8) y),
    'stops', (SELECT coalesce(jsonb_agg(jsonb_build_object('city_slug', city_slug, 'name', name, 'n', stop_number)), '[]') FROM (
       SELECT DISTINCT ON (s.id) s.city_slug, t.name, s.stop_number FROM public.stops s JOIN public.stop_translations t ON t.stop_id = s.id AND t.lang = 'pl'
        WHERE lower(t.name) LIKE lk LIMIT 8) z));
END $f$;

-- ── 6) ustawienia (biała lista z opisem i walidacją; limit płatnych modeli jest w .env — tylko podgląd) ──
CREATE OR REPLACE FUNCTION admin.settings_list() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_temp AS $f$
  SELECT coalesce(jsonb_agg(jsonb_build_object('name', d.name, 'label', d.label, 'help', d.help, 'kind', d.kind, 'def', d.def,
           'value', coalesce(s.value, d.def), 'updated_at', s.updated_at) ORDER BY d.ord), '[]')
    FROM (VALUES
      (1, 'ai_budget_month_usd', 'Miesięczny budżet płatnych modeli (USD)', 'Po przekroczeniu panel prosi o zgodę na kolejne płatne zadania.', 'num', '10'),
      (2, 'ai_alert_day_usd', 'Alarm dziennych kosztów (USD)', 'Strażnik kosztów zgłasza dzień droższy niż ta kwota.', 'num', '1'),
      (3, 'watch_enabled', 'Strażnicy treści', 'Codzienne sprawdzanie cen, godzin, linków i zamknięć.', 'onoff', 'on'),
      (4, 'watch_ai', 'Strażnicy: pomoc AI', 'AI czyta strony przy cenach i sezonie (w dziennym limicie płatnych modeli).', 'onoff', 'on'),
      (5, 'watch_ai_max_per_run', 'Strażnicy: najwyżej zapytań AI na przebieg', '0 = bez AI.', 'int', '6'),
      (6, 'watch_max_minutes', 'Strażnicy: najdłuższy przebieg (min)', 'Po tym czasie strażnik kończy i wraca w następnym przebiegu.', 'int', '5'),
      (7, 'ticket_sla_hours', 'Tickety: alarm po (godz.)', 'Nowy albo „w toku” ticket bez odpowiedzi dłużej niż tyle godzin jest oznaczony jako spóźniony.', 'int', '24'),
      (8, 'signup_reminder_hours', 'Przypomnienie o potwierdzeniu konta po (godz.)', 'Jeden drugi mail; konto bez potwierdzenia znika po 48 h.', 'int', '20'),
      (9, 'campaign_daily_max', 'Wiadomości: najwyżej maili dziennie', 'Limit dostawcy poczty (Brevo, plan darmowy: 300/dzień łącznie z logowaniem).', 'int', '200'),
      (10, 'treasure_from', 'Skarb Quo wydaje kupony od', 'Data startu płatności (kupony z gry).', 'date', '2027-06-01 00:00:00+02')
    ) d(ord, name, label, help, kind, def)
    LEFT JOIN ops.app_settings s ON s.name = d.name;
$f$;
CREATE OR REPLACE FUNCTION admin.setting_save(p_name text, p_value text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_temp AS $f$
DECLARE k text; v text := btrim(replace(coalesce(p_value, ''), ',', '.'));
BEGIN
  SELECT x ->> 'kind' INTO k FROM jsonb_array_elements(admin.settings_list()) x WHERE x ->> 'name' = p_name;
  IF k IS NULL THEN RETURN jsonb_build_object('error', 'unknown'); END IF;
  IF k = 'num' AND (v !~ '^\d{1,5}(\.\d{1,2})?$') THEN RETURN jsonb_build_object('error', 'Liczba, np. 10 albo 2.5'); END IF;
  IF k = 'int' AND (v !~ '^\d{1,4}$') THEN RETURN jsonb_build_object('error', 'Liczba całkowita'); END IF;
  IF k = 'onoff' AND v NOT IN ('on', 'off') THEN RETURN jsonb_build_object('error', 'on albo off'); END IF;
  IF k = 'date' THEN BEGIN PERFORM v::timestamptz; EXCEPTION WHEN others THEN RETURN jsonb_build_object('error', 'Data, np. 2027-06-01'); END; END IF;
  INSERT INTO ops.app_settings (name, value, note, updated_at) VALUES (p_name, v, 'ustawione w panelu', now())
  ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN jsonb_build_object('ok', true, 'value', v);
END $f$;
DROP TRIGGER IF EXISTS audit ON ops.app_settings;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OF value ON ops.app_settings FOR EACH ROW EXECUTE FUNCTION ops.audit_trg();

-- ── 7) kupony ──
ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_source_check;
ALTER TABLE public.coupons ADD CONSTRAINT coupons_source_check CHECK (source IN ('gra', 'panel'));
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS note text;
CREATE OR REPLACE FUNCTION admin.coupons_list() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_temp AS $f$
  SELECT jsonb_build_object(
    'totals', (SELECT jsonb_build_object('all', count(*), 'active', count(*) FILTER (WHERE used_at IS NULL AND expires_at > now()),
                 'used', count(*) FILTER (WHERE used_at IS NOT NULL), 'expired', count(*) FILTER (WHERE used_at IS NULL AND expires_at <= now())) FROM public.coupons),
    'coupons', (SELECT coalesce(jsonb_agg(jsonb_build_object('code', c.code, 'percent', c.percent, 'source', c.source, 'trip', c.trip_slug, 'note', c.note,
                 'created_at', c.created_at, 'expires_at', c.expires_at, 'used_at', c.used_at, 'email', u.email,
                 'state', CASE WHEN c.used_at IS NOT NULL THEN 'used' WHEN c.expires_at <= now() THEN 'expired' ELSE 'active' END) ORDER BY c.created_at DESC), '[]')
                 FROM (SELECT * FROM public.coupons ORDER BY created_at DESC LIMIT 500) c LEFT JOIN auth.users u ON u.id = c.user_id));
$f$;
CREATE OR REPLACE FUNCTION admin.coupon_issue(p_email text, p_percent int, p_days int DEFAULT 90, p_trip text DEFAULT NULL, p_note text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_temp AS $f$
DECLARE v_sub uuid; v_code text;
BEGIN
  SELECT id INTO v_sub FROM auth.users WHERE lower(email) = lower(btrim(p_email)) AND deleted_at IS NULL;
  IF v_sub IS NULL THEN RETURN jsonb_build_object('error', 'Nie ma konta z tym adresem — kupon trafia do konta.'); END IF;
  IF p_percent IS NULL OR p_percent NOT BETWEEN 1 AND 50 THEN RETURN jsonb_build_object('error', 'Rabat od 1 do 50%.'); END IF;
  IF p_days IS NULL OR p_days NOT BETWEEN 1 AND 730 THEN RETURN jsonb_build_object('error', 'Ważność od 1 do 730 dni.'); END IF;
  IF p_trip IS NOT NULL AND p_trip <> '' AND NOT EXISTS (SELECT 1 FROM public.cities WHERE slug = p_trip) THEN RETURN jsonb_build_object('error', 'Nie ma takiej trasy.'); END IF;
  LOOP v_code := ops.coupon_code(); EXIT WHEN NOT EXISTS (SELECT 1 FROM public.coupons WHERE code = v_code); END LOOP;
  INSERT INTO public.coupons (user_id, code, percent, source, trip_slug, expires_at, note)
  VALUES (v_sub, v_code, p_percent, 'panel', nullif(p_trip, ''), now() + make_interval(days => p_days), left(p_note, 200));
  RETURN jsonb_build_object('ok', true, 'code', v_code);
END $f$;
CREATE OR REPLACE FUNCTION admin.coupon_revoke(p_code text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_temp AS $f$
BEGIN
  UPDATE public.coupons SET expires_at = now() WHERE code = upper(btrim(p_code)) AND used_at IS NULL AND expires_at > now();
  RETURN jsonb_build_object('ok', FOUND);
END $f$;
DROP TRIGGER IF EXISTS audit ON public.coupons;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OF expires_at ON public.coupons FOR EACH ROW EXECUTE FUNCTION ops.audit_trg();

-- ── 8) tłumaczenia: trasa × język (aktualne / stare / brak) + ostatni błąd + zlecenie z panelu (w dziennym limicie) ──
CREATE OR REPLACE FUNCTION admin.translations_matrix() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_temp AS $f$
  WITH langs AS (SELECT code, priority FROM public.languages WHERE enabled AND code <> 'pl'),
  src AS (SELECT city_slug, max(coalesce(published_at, created_at)) AS at FROM public.city_versions
           WHERE status IN ('published', 'archived') AND published_at IS NOT NULL AND coalesce(note, '') NOT LIKE 'tłumaczenia%' GROUP BY 1),
  pub AS (SELECT slug FROM public.cities WHERE status = 'published'),
  fail AS (SELECT DISTINCT ON (city_slug) city_slug, finished_at, left(result, 400) AS result, status FROM ops.jobs WHERE kind = 'translate' ORDER BY city_slug, id DESC)
  SELECT jsonb_build_object(
    'langs', (SELECT coalesce(jsonb_agg(code ORDER BY priority, code), '[]') FROM langs),
    'trips', (SELECT coalesce(jsonb_agg(jsonb_build_object('slug', p.slug, 'source_at', s.at,
        'last_job', (SELECT jsonb_build_object('status', f.status, 'at', f.finished_at, 'result', f.result) FROM fail f WHERE f.city_slug = p.slug),
        'cells', (SELECT jsonb_object_agg(l.code, CASE WHEN t.lang IS NULL THEN 'none' WHEN s.at IS NOT NULL AND t.updated_at < s.at THEN 'stale' ELSE 'ok' END)
                    FROM langs l LEFT JOIN public.city_translations t ON t.city_slug = p.slug AND t.lang = l.code)) ORDER BY p.slug), '[]')
      FROM pub p LEFT JOIN src s ON s.city_slug = p.slug));
$f$;
CREATE OR REPLACE FUNCTION admin.translation_request(p_slug text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_temp AS $f$
DECLARE v_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cities WHERE slug = p_slug AND status = 'published') THEN RETURN jsonb_build_object('error', 'Tylko opublikowane trasy.'); END IF;
  IF EXISTS (SELECT 1 FROM ops.jobs WHERE kind = 'translate' AND city_slug = p_slug AND status IN ('queued', 'running')) THEN RETURN jsonb_build_object('error', 'Już w kolejce.'); END IF;
  INSERT INTO ops.jobs (city_slug, kind, worker, status, request)
  VALUES (p_slug, 'translate', 'claude', 'queued', 'translate ' || p_slug || ' — zlecone w panelu (JP); tylko brakujące i stare języki, w dziennym limicie')
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'job', v_id);
END $f$;

-- ── 9) wiadomości: newsletter na serwerze + kampanie (lista chętnych / newsletter), wypisanie jednym linkiem ──
CREATE TABLE IF NOT EXISTS ops.newsletter (
  sub uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE, email text NOT NULL, lang text,
  consent text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), unsub text NOT NULL UNIQUE DEFAULT encode(ops.gen_random_bytes(16), 'hex')
);
ALTER TABLE ops.newsletter OWNER TO quolino; REVOKE ALL ON ops.newsletter FROM PUBLIC;
ALTER TABLE ops.paid_waitlist ADD COLUMN IF NOT EXISTS unsub text UNIQUE DEFAULT encode(ops.gen_random_bytes(16), 'hex');
UPDATE ops.paid_waitlist SET unsub = encode(ops.gen_random_bytes(16), 'hex') WHERE unsub IS NULL;
CREATE TABLE IF NOT EXISTS ops.campaigns (
  id bigserial PRIMARY KEY, title text NOT NULL, audience text NOT NULL CHECK (audience IN ('waitlist', 'newsletter', 'test')),
  lang text, subject text NOT NULL, body text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'sent', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, recipients int
);
CREATE TABLE IF NOT EXISTS ops.campaign_mail (
  id bigserial PRIMARY KEY, campaign_id bigint NOT NULL REFERENCES ops.campaigns (id) ON DELETE CASCADE,
  to_email text NOT NULL, subject text NOT NULL, body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, tries int NOT NULL DEFAULT 0, error text,
  UNIQUE (campaign_id, to_email)
);
ALTER TABLE ops.campaigns OWNER TO quolino; ALTER TABLE ops.campaign_mail OWNER TO quolino;
ALTER SEQUENCE ops.campaigns_id_seq OWNER TO quolino; ALTER SEQUENCE ops.campaign_mail_id_seq OWNER TO quolino;
REVOKE ALL ON ops.campaigns, ops.campaign_mail FROM PUBLIC;

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
  INSERT INTO ops.newsletter (sub, email, lang, consent) VALUES (v_sub, v_mail, left(p_lang, 8),
    'Zgoda na newsletter Quolino (konto, ' || to_char(now(), 'YYYY-MM-DD') || ')') ON CONFLICT (sub) DO UPDATE SET lang = coalesce(EXCLUDED.lang, ops.newsletter.lang);
  RETURN jsonb_build_object('ok', true, 'on', true);
END $f$;
CREATE OR REPLACE FUNCTION public.newsletter_status(p_token text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE cl jsonb;
BEGIN
  cl := ops.jwt_claims(p_token);
  IF cl IS NULL THEN RETURN jsonb_build_object('error', 'invalid_session'); END IF;
  RETURN jsonb_build_object('on', EXISTS (SELECT 1 FROM ops.newsletter WHERE sub = (cl ->> 'sub')::uuid));
END $f$;
-- wypisanie z linku w mailu (bez logowania): token 128 bitów, jeden na adres i listę
CREATE OR REPLACE FUNCTION public.mail_unsubscribe(p_t text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE n int; m int;
BEGIN
  IF coalesce(p_t, '') !~ '^[0-9a-f]{32}$' THEN RETURN jsonb_build_object('ok', false); END IF;
  DELETE FROM ops.newsletter WHERE unsub = p_t; GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM ops.paid_waitlist WHERE unsub = p_t; GET DIAGNOSTICS m = ROW_COUNT;
  RETURN jsonb_build_object('ok', n + m > 0);
END $f$;

CREATE OR REPLACE FUNCTION admin.campaigns_list() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_temp AS $f$
  SELECT jsonb_build_object(
    'audiences', jsonb_build_object('waitlist', (SELECT count(*) FROM ops.paid_waitlist), 'newsletter', (SELECT count(*) FROM ops.newsletter)),
    'campaigns', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'audience', c.audience, 'lang', c.lang, 'subject', c.subject, 'body', c.body,
       'status', c.status, 'created_at', c.created_at, 'sent_at', c.sent_at, 'recipients', c.recipients,
       'sent', (SELECT count(*) FROM ops.campaign_mail m WHERE m.campaign_id = c.id AND m.sent_at IS NOT NULL),
       'failed', (SELECT count(*) FROM ops.campaign_mail m WHERE m.campaign_id = c.id AND m.sent_at IS NULL AND m.tries >= 5)) ORDER BY c.created_at DESC), '[]') FROM ops.campaigns c));
$f$;
CREATE OR REPLACE FUNCTION admin.campaign_save(p_id bigint, p_title text, p_audience text, p_subject text, p_body text, p_lang text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_temp AS $f$
DECLARE v bigint;
BEGIN
  IF p_audience NOT IN ('waitlist', 'newsletter') THEN RETURN jsonb_build_object('error', 'Wybierz listę.'); END IF;
  IF length(btrim(coalesce(p_subject, ''))) < 3 OR length(btrim(coalesce(p_body, ''))) < 10 THEN RETURN jsonb_build_object('error', 'Temat i treść.'); END IF;
  IF p_id IS NULL THEN
    INSERT INTO ops.campaigns (title, audience, lang, subject, body) VALUES (left(coalesce(nullif(btrim(p_title), ''), p_subject), 120), p_audience, nullif(p_lang, ''), left(btrim(p_subject), 150), left(p_body, 20000)) RETURNING id INTO v;
  ELSE
    UPDATE ops.campaigns SET title = left(coalesce(nullif(btrim(p_title), ''), p_subject), 120), audience = p_audience, lang = nullif(p_lang, ''),
           subject = left(btrim(p_subject), 150), body = left(p_body, 20000), updated_at = now() WHERE id = p_id AND status = 'draft' RETURNING id INTO v;
    IF v IS NULL THEN RETURN jsonb_build_object('error', 'Wysłanej wiadomości nie zmienia się.'); END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v);
END $f$;
-- wysyłka: test (tylko na podany adres) albo do całej listy; stopka z linkiem do wypisania (osobny dla każdego adresu)
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
    RETURN jsonb_build_object('ok', true, 'test', true);
  END IF;
  IF c.status <> 'draft' THEN RETURN jsonb_build_object('error', 'Ta wiadomość już poszła.'); END IF;
  INSERT INTO ops.campaign_mail (campaign_id, to_email, subject, body)
  SELECT c.id, lower(x.email), c.subject, c.body || E'\n\n—\nQuolino · quolino.com\n' ||
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
  UPDATE ops.campaigns SET status = CASE WHEN status = 'draft' THEN 'cancelled' WHEN status = 'sending' THEN 'sent' ELSE status END, updated_at = now() WHERE id = p_id;
  RETURN jsonb_build_object('ok', FOUND);
END $f$;
DROP TRIGGER IF EXISTS audit ON ops.campaigns;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OF status ON ops.campaigns FOR EACH ROW EXECUTE FUNCTION ops.audit_trg();

-- ── 10) partnerzy ──
CREATE OR REPLACE FUNCTION admin.partners_list() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_temp AS $f$
  SELECT coalesce(jsonb_agg(jsonb_build_object('number', t.number, 'subject', t.subject, 'stage', coalesce(t.stage, 'nowy'), 'status', t.status,
    'email', coalesce(u.email, t.email), 'created_at', t.created_at, 'updated_at', t.updated_at,
    'preview', (SELECT left(body, 300) FROM ops.ticket_messages m WHERE m.ticket_id = t.id AND author = 'client' ORDER BY created_at LIMIT 1)) ORDER BY t.updated_at DESC), '[]')
    FROM ops.tickets t LEFT JOIN auth.users u ON u.id = t.sub
   WHERE (t.stage IS NOT NULL OR t.category IN ('wspolpraca', 'partner')) AND t.status <> 'spam';
$f$;
CREATE OR REPLACE FUNCTION admin.partner_stage(p_number text, p_stage text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_temp AS $f$
BEGIN
  IF p_stage NOT IN ('nowy', 'rozmowa', 'oferta', 'umowa', 'odrzucony') THEN RETURN jsonb_build_object('error', 'stage'); END IF;
  UPDATE ops.tickets SET stage = p_stage, updated_at = now(),
         status = CASE WHEN p_stage IN ('umowa', 'odrzucony') AND status NOT IN ('closed', 'spam') THEN 'resolved' ELSE status END
   WHERE number = upper(btrim(p_number));
  RETURN jsonb_build_object('ok', FOUND);
END $f$;
-- nowe tickety współpracy od razu na tablicy partnerów
CREATE OR REPLACE FUNCTION ops.ticket_partner_stage() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_temp AS $f$
BEGIN
  IF NEW.stage IS NULL AND NEW.category IN ('wspolpraca', 'partner') THEN NEW.stage := 'nowy'; END IF;
  RETURN NEW;
END $f$;
ALTER FUNCTION ops.ticket_partner_stage() OWNER TO quolino;
DROP TRIGGER IF EXISTS partner_stage ON ops.tickets;
CREATE TRIGGER partner_stage BEFORE INSERT OR UPDATE OF category ON ops.tickets FOR EACH ROW EXECUTE FUNCTION ops.ticket_partner_stage();

-- ── 11) dziennik: odczyt + wyzwalacze ──
CREATE OR REPLACE FUNCTION admin.audit_list(p_limit int DEFAULT 300, p_q text DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_temp AS $f$
  SELECT coalesce(jsonb_agg(jsonb_build_object('at', at, 'who', who, 'action', action, 'target', target, 'detail', detail) ORDER BY at DESC), '[]')
    FROM (SELECT * FROM ops.admin_audit
           WHERE p_q IS NULL OR p_q = '' OR lower(action || ' ' || coalesce(target, '') || ' ' || who) LIKE '%' || lower(p_q) || '%'
           ORDER BY at DESC LIMIT least(greatest(coalesce(p_limit, 300), 1), 2000)) x;
$f$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['ops.ticket_messages', 'ops.gdpr_log', 'ops.admin_team'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit ON %s', t);
    EXECUTE format('CREATE TRIGGER audit AFTER INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION ops.audit_trg()', t);
  END LOOP;
  DROP TRIGGER IF EXISTS audit ON ops.tickets;
  CREATE TRIGGER audit AFTER UPDATE OF status, priority, category, stage ON ops.tickets FOR EACH ROW EXECUTE FUNCTION ops.audit_trg();
  FOREACH t IN ARRAY ARRAY['ops.deploy_requests', 'ops.cost_requests', 'public.city_versions'] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit ON %s', t);
      EXECUTE format('CREATE TRIGGER audit AFTER UPDATE OF status ON %s FOR EACH ROW EXECUTE FUNCTION ops.audit_trg()', t);
    END IF;
  END LOOP;
  IF to_regclass('ops.jobs') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS audit ON ops.jobs;
    CREATE TRIGGER audit AFTER INSERT ON ops.jobs FOR EACH ROW EXECUTE FUNCTION ops.audit_trg();
  END IF;
END $$;

-- uprawnienia: panel (quolino_admin); strona (web_anon) tylko newsletter i wypisanie
DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['admin.totp_setup(text, text)', 'admin.totp_login(text, text)', 'admin.totp_enabled()', 'admin.team_list()', 'admin.team_invite(text, text)', 'admin.team_set(int, boolean, text)',
      'admin.nav_counts()', 'admin.today_numbers()', 'admin.customer(text)', 'admin.trip_feedback(text)', 'admin.search(text)', 'admin.settings_list()', 'admin.setting_save(text, text)',
      'admin.coupons_list()', 'admin.coupon_issue(text, int, int, text, text)', 'admin.coupon_revoke(text)', 'admin.translations_matrix()', 'admin.translation_request(text)',
      'admin.campaigns_list()', 'admin.campaign_save(bigint, text, text, text, text, text)', 'admin.campaign_send(bigint, text)', 'admin.campaign_cancel(bigint)',
      'admin.partners_list()', 'admin.partner_stage(text, text)', 'admin.audit_list(int, text)'] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO quolino', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO quolino_admin', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY['public.newsletter_set(text, boolean, text)', 'public.newsletter_status(text)', 'public.mail_unsubscribe(text)'] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO quolino', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO web_anon, quolino', f);
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
