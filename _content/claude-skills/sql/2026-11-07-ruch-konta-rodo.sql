-- Panel admina: ruch, lejek, źródła, języki, ranking tras, przypomnienia o potwierdzeniu, RODO, lista chętnych (JP 2026-11-07: „zbuduj”).
--   ops.site_daily        — dzienne liczby z Umami (site-metrics.mjs, Hermes; tylko liczby zbiorcze, zero danych o osobach)
--   ops.account_events    — ślad po skasowanym koncie (auth-cleanup kasuje niepotwierdzone po 48 h): bez e-maila, tylko daty, źródło, język
--   ops.signup_reminders  — komu poszło przypomnienie o potwierdzeniu (signup-reminder.mjs; jedno na konto)
--   ops.paid_waitlist     — „powiadom mnie o płatnej wersji” (konto zalogowane, zgoda z datą)
--   ops.gdpr_log          — eksport / usunięcie konta z panelu (bez e-maila: skrót SHA-256)
-- Funkcje dla panelu (quolino_admin): users_overview (rozszerzona), traffic_overview, user_export, user_delete.
-- Dla strony (web_anon): waitlist_join / waitlist_status (token sesji w treści, jak trip_member).
-- Wymaga 2026-11-07-panel-uzytkownicy.sql (nazwa pliku po nim alfabetycznie — nadpisuje users_overview) i 2026-10-18-trip-member.sql. Bezpieczne do powtórzenia.
BEGIN;
GRANT USAGE ON SCHEMA auth TO quolino;
GRANT SELECT (id, email, created_at, email_confirmed_at, confirmation_sent_at, last_sign_in_at, deleted_at, banned_until, raw_user_meta_data)
  ON auth.users TO quolino;
GRANT DELETE ON auth.users TO quolino;   -- tylko admin.user_delete (RODO, klik JP w panelu z wpisanym adresem)

CREATE TABLE IF NOT EXISTS ops.site_daily (
  day date NOT NULL, dim text NOT NULL CHECK (dim IN ('all', 'lang', 'city', 'channel', 'country')), key text NOT NULL,
  visitors int NOT NULL DEFAULT 0, pageviews int NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, dim, key)
);
CREATE TABLE IF NOT EXISTS ops.account_events (
  id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), kind text NOT NULL,
  created_at timestamptz, confirmed boolean, src text, lang text
);
CREATE TABLE IF NOT EXISTS ops.signup_reminders (user_id uuid PRIMARY KEY, sent_at timestamptz NOT NULL DEFAULT now(), ok boolean NOT NULL DEFAULT true, note text);
CREATE TABLE IF NOT EXISTS ops.paid_waitlist (
  sub uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE, email text NOT NULL, lang text, src text,
  consent text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), notified_at timestamptz
);
CREATE TABLE IF NOT EXISTS ops.gdpr_log (id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), action text NOT NULL, email_sha text NOT NULL, note text);
-- źródło i język konta zapisane po zalogowaniu (logowanie kodem z maila zakłada konto bez metadanych) — auth.js, raz na urządzenie
CREATE TABLE IF NOT EXISTS ops.account_meta (sub uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE, src text, lang text, set_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE ops.account_meta OWNER TO quolino;
REVOKE ALL ON ops.account_meta FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.account_meta(p_token text, p_src text DEFAULT NULL, p_lang text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE cl jsonb; v_sub uuid;
BEGIN
  cl := ops.jwt_claims(p_token);
  IF cl IS NULL THEN RETURN jsonb_build_object('error', 'invalid_session'); END IF;
  v_sub := (cl ->> 'sub')::uuid;
  INSERT INTO ops.account_meta (sub, src, lang)
  VALUES (v_sub, nullif(left(regexp_replace(lower(coalesce(p_src, '')), '[^a-z0-9._/-]', '', 'g'), 60), ''), nullif(left(regexp_replace(lower(coalesce(p_lang, '')), '[^a-z-]', '', 'g'), 8), ''))
  ON CONFLICT (sub) DO NOTHING;   -- pierwsze źródło zostaje
  RETURN jsonb_build_object('ok', true);
END $f$;
ALTER FUNCTION public.account_meta(text, text, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION public.account_meta(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_meta(text, text, text) TO web_anon, quolino;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['ops.site_daily', 'ops.account_events', 'ops.signup_reminders', 'ops.paid_waitlist', 'ops.gdpr_log'] LOOP
    EXECUTE format('ALTER TABLE %s OWNER TO quolino', t);
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
  END LOOP;
END $$;
ALTER SEQUENCE ops.account_events_id_seq OWNER TO quolino;
ALTER SEQUENCE ops.gdpr_log_id_seq OWNER TO quolino;

-- ślad po skasowanym koncie (bez danych osobowych) — dla lejka „wpisali @, nie potwierdzili”
CREATE OR REPLACE FUNCTION ops.account_deleted() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_temp AS $f$
BEGIN
  INSERT INTO ops.account_events (kind, created_at, confirmed, src, lang)
  VALUES (CASE WHEN current_setting('quolino.gdpr_delete', true) = '1' THEN 'gdpr_deleted' WHEN OLD.email_confirmed_at IS NULL THEN 'expired_unconfirmed' ELSE 'deleted' END, OLD.created_at,
          OLD.email_confirmed_at IS NOT NULL, left(OLD.raw_user_meta_data ->> 'src', 60), left(OLD.raw_user_meta_data ->> 'lang', 8));
  RETURN OLD;
END $f$;
ALTER FUNCTION ops.account_deleted() OWNER TO quolino;
DROP TRIGGER IF EXISTS quolino_account_deleted ON auth.users;
CREATE TRIGGER quolino_account_deleted AFTER DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION ops.account_deleted();

-- ── konta (rozszerzone: źródło, język, przypomnienie, lista chętnych, skasowane niepotwierdzone) ──
CREATE OR REPLACE FUNCTION admin.users_overview() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_temp AS $f$
WITH u AS (
  SELECT id, email, created_at, email_confirmed_at, last_sign_in_at, banned_until,
         coalesce(nullif(left(raw_user_meta_data ->> 'src', 60), ''), (SELECT m.src FROM ops.account_meta m WHERE m.sub = auth.users.id)) AS src,
         coalesce(nullif(left(raw_user_meta_data ->> 'lang', 8), ''), (SELECT m.lang FROM ops.account_meta m WHERE m.sub = auth.users.id)) AS lang
    FROM auth.users WHERE deleted_at IS NULL
), runs AS (
  SELECT sub, count(*) AS n, max(created_at) AS last_run, count(DISTINCT city_slug) AS trips FROM ops.trip_runs GROUP BY sub
)
SELECT jsonb_build_object(
  'at', now(),
  'totals', (SELECT jsonb_build_object(
      'all', count(*), 'confirmed', count(*) FILTER (WHERE email_confirmed_at IS NOT NULL),
      'unconfirmed', count(*) FILTER (WHERE email_confirmed_at IS NULL),
      'new_7d', count(*) FILTER (WHERE created_at > now() - interval '7 days'),
      'new_30d', count(*) FILTER (WHERE created_at > now() - interval '30 days'),
      'active_7d', count(*) FILTER (WHERE last_sign_in_at > now() - interval '7 days'),
      'active_30d', count(*) FILTER (WHERE last_sign_in_at > now() - interval '30 days'),
      'with_trip', (SELECT count(*) FROM runs JOIN u ON u.id = runs.sub),
      'expired_30d', (SELECT count(*) FROM ops.account_events WHERE kind = 'expired_unconfirmed' AND at > now() - interval '30 days'),
      'expired_all', (SELECT count(*) FROM ops.account_events WHERE kind = 'expired_unconfirmed'),
      'reminded_30d', (SELECT count(*) FROM ops.signup_reminders WHERE sent_at > now() - interval '30 days' AND ok),
      'waitlist', (SELECT count(*) FROM ops.paid_waitlist)
    ) FROM u),
  'daily', (SELECT coalesce(jsonb_agg(jsonb_build_object('day', d, 'signups', s, 'confirmed', c) ORDER BY d), '[]')
      FROM (SELECT (created_at AT TIME ZONE 'Europe/Warsaw')::date AS d, count(*) AS s, count(email_confirmed_at) AS c
              FROM u WHERE created_at > now() - interval '90 days' GROUP BY 1) x),
  'users', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'email', u.email, 'created_at', u.created_at, 'confirmed_at', u.email_confirmed_at,
        'last_sign_in_at', u.last_sign_in_at, 'banned', u.banned_until > now(), 'src', u.src, 'lang', u.lang,
        'reminded_at', (SELECT sent_at FROM ops.signup_reminders s WHERE s.user_id = u.id),
        'waitlist', EXISTS (SELECT 1 FROM ops.paid_waitlist w WHERE w.sub = u.id),
        'runs', coalesce(r.n, 0), 'trips', coalesce(r.trips, 0), 'last_run', r.last_run) ORDER BY u.created_at DESC), '[]')
      FROM (SELECT * FROM u ORDER BY created_at DESC LIMIT 300) u LEFT JOIN runs r ON r.sub = u.id)
);
$f$;

-- ── ruch: lejek, kanały, źródła rejestracji, języki, kraje, ranking tras (p_days: 7–365) ──
CREATE OR REPLACE FUNCTION admin.traffic_overview(p_days int DEFAULT 30) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_temp AS $f$
WITH p AS (SELECT greatest(7, least(365, coalesce(p_days, 30))) AS d),
since AS (SELECT (now() - make_interval(days => (SELECT d FROM p))) AS t, (current_date - (SELECT d FROM p)) AS dd),
u AS (SELECT id, created_at, email_confirmed_at, coalesce(nullif(left(raw_user_meta_data ->> 'src', 60), ''), (SELECT m.src FROM ops.account_meta m WHERE m.sub = auth.users.id)) AS src,
         coalesce(nullif(left(raw_user_meta_data ->> 'lang', 8), ''), (SELECT m.lang FROM ops.account_meta m WHERE m.sub = auth.users.id)) AS lang
        FROM auth.users WHERE deleted_at IS NULL AND created_at > (SELECT t FROM since)),
gone AS (SELECT * FROM ops.account_events WHERE created_at > (SELECT t FROM since)),
sd AS (SELECT * FROM ops.site_daily WHERE day > (SELECT dd FROM since)),
dim AS (SELECT dim, key, sum(visitors)::int AS visitors, sum(pageviews)::int AS pageviews FROM sd WHERE dim <> 'all' GROUP BY 1, 2),
ratings AS (SELECT city_slug, round(avg(stars)::numeric, 1) AS avg, count(*) AS n FROM ops.ratings WHERE stop_id IS NULL GROUP BY 1),
runs AS (SELECT city_slug, count(*) AS runs, count(DISTINCT sub) AS parents FROM ops.trip_runs WHERE created_at > (SELECT t FROM since) GROUP BY 1),
uses AS (SELECT city_slug, count(*) AS opens, count(DISTINCT sub) AS members FROM ops.member_usage WHERE used_at > (SELECT t FROM since) AND city_slug IS NOT NULL GROUP BY 1),
mlang AS (SELECT lang AS key, count(DISTINCT sub) AS members FROM ops.member_usage WHERE used_at > (SELECT t FROM since) AND lang IS NOT NULL GROUP BY 1)
SELECT jsonb_build_object(
  'days', (SELECT d FROM p),
  'site_data_from', (SELECT min(day) FROM ops.site_daily),
  'funnel', jsonb_build_object(
     'visitors', (SELECT coalesce(sum(visitors), 0) FROM sd WHERE dim = 'all'),
     'signups', (SELECT count(*) FROM u) + (SELECT count(*) FROM gone),
     'confirmed', (SELECT count(*) FROM u WHERE email_confirmed_at IS NOT NULL) + (SELECT count(*) FROM gone WHERE confirmed),
     'expired', (SELECT count(*) FROM gone WHERE kind = 'expired_unconfirmed'),
     'first_trip', (SELECT count(DISTINCT r.sub) FROM ops.trip_runs r JOIN u ON u.id = r.sub)),
  'daily', (SELECT coalesce(jsonb_agg(jsonb_build_object('day', day, 'visitors', visitors, 'pageviews', pageviews) ORDER BY day), '[]') FROM sd WHERE dim = 'all'),
  'channels', (SELECT coalesce(jsonb_agg(jsonb_build_object('key', key, 'visitors', visitors) ORDER BY visitors DESC), '[]') FROM dim WHERE dim = 'channel'),
  'countries', (SELECT coalesce(jsonb_agg(x ORDER BY (x ->> 'visitors')::int DESC), '[]') FROM (SELECT jsonb_build_object('key', key, 'visitors', visitors) AS x FROM dim WHERE dim = 'country' ORDER BY visitors DESC LIMIT 15) y),
  'sources', (SELECT coalesce(jsonb_agg(jsonb_build_object('key', k, 'signups', s, 'confirmed', c) ORDER BY s DESC), '[]')
      FROM (SELECT coalesce(src, 'nieznane') AS k, count(*) AS s, count(*) FILTER (WHERE c) AS c
              FROM (SELECT src, email_confirmed_at IS NOT NULL AS c FROM u UNION ALL SELECT src, confirmed FROM gone) z GROUP BY 1) x),
  'langs', (SELECT coalesce(jsonb_agg(jsonb_build_object('key', k, 'visitors', v, 'signups', s, 'members', m) ORDER BY v DESC, s DESC), '[]')
      FROM (SELECT k, coalesce(max(v), 0) AS v, coalesce(max(s), 0) AS s, coalesce(max(m), 0) AS m FROM (
              SELECT lower(split_part(key, '-', 1)) AS k, sum(visitors) AS v, NULL::bigint AS s, NULL::bigint AS m FROM dim WHERE dim = 'lang' GROUP BY 1
              UNION ALL SELECT lower(lang), NULL, count(*), NULL FROM u WHERE lang IS NOT NULL GROUP BY 1
              UNION ALL SELECT lower(key), NULL, NULL, members FROM mlang) z GROUP BY 1) x),
  'trips', (SELECT coalesce(jsonb_agg(jsonb_build_object('slug', c.slug, 'views', coalesce(dv.visitors, 0), 'opens', coalesce(us.opens, 0),
        'members', coalesce(us.members, 0), 'runs', coalesce(rn.runs, 0), 'parents', coalesce(rn.parents, 0), 'rating', rt.avg, 'ratings', coalesce(rt.n, 0))
        ORDER BY coalesce(rn.runs, 0) DESC, coalesce(us.opens, 0) DESC, coalesce(dv.visitors, 0) DESC), '[]')
      FROM public.cities c
      LEFT JOIN dim dv ON dv.dim = 'city' AND dv.key = c.slug
      LEFT JOIN uses us ON us.city_slug = c.slug
      LEFT JOIN runs rn ON rn.city_slug = c.slug
      LEFT JOIN ratings rt ON rt.city_slug = c.slug
     WHERE c.status = 'published')
);
$f$;

-- ── RODO: eksport i usunięcie konta (tylko panel; e-mail wpisany przez JP) ──
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
    'signup_reminder', (SELECT sent_at FROM ops.signup_reminders WHERE user_id = v.id));
  INSERT INTO ops.gdpr_log (action, email_sha) VALUES ('export', encode(ops.digest(lower(v.email), 'sha256'), 'hex'));
  RETURN out;
END $f$;

-- usunięcie: trwałe (kaskada: tożsamości, sesje, kupony, lista chętnych); dane bez klucza do konta (trip_runs, member_usage, plan_shares) też
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
  PERFORM set_config('quolino.gdpr_delete', '1', true);
  DELETE FROM auth.users WHERE id = v.id;
  PERFORM set_config('quolino.gdpr_delete', '', true);
  INSERT INTO ops.gdpr_log (action, email_sha) VALUES ('delete', encode(ops.digest(lower(v.email), 'sha256'), 'hex'));
  RETURN jsonb_build_object('ok', true);
END $f$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['admin.users_overview()', 'admin.traffic_overview(int)', 'admin.user_export(text)', 'admin.user_delete(text, text)'] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO quolino', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO quolino_admin', f);
  END LOOP;
END $$;

-- ── lista chętnych na płatną wersję (strona, zalogowany rodzic; token sesji w treści jak trip_member) ──
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
  VALUES (v_sub, v_mail, left(p_lang, 8), v_src, 'Zgoda na jeden e-mail o starcie płatnej wersji Quolino (konto, ' || to_char(now(), 'YYYY-MM-DD') || ')')
  ON CONFLICT (sub) DO UPDATE SET lang = coalesce(EXCLUDED.lang, ops.paid_waitlist.lang);
  RETURN jsonb_build_object('ok', true, 'on', true);
END $f$;
CREATE OR REPLACE FUNCTION public.waitlist_status(p_token text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE cl jsonb;
BEGIN
  cl := ops.jwt_claims(p_token);
  IF cl IS NULL THEN RETURN jsonb_build_object('error', 'invalid_session'); END IF;
  RETURN jsonb_build_object('on', EXISTS (SELECT 1 FROM ops.paid_waitlist WHERE sub = (cl ->> 'sub')::uuid));
END $f$;
DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['public.waitlist_join(text, text, boolean)', 'public.waitlist_status(text)'] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO quolino', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO web_anon, quolino', f);
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;

