-- Panel admina: sekcja „Użytkownicy” (+ przychody, niżej) (JP 2026-11-07: „nawet nie wiem ilu się zarejestrowało, ilu wpisało @, ale nie potwierdziło”).
-- admin.users_overview() → jeden JSON: liczniki (wszystkie konta, potwierdzone, niepotwierdzone, nowe 7/30 dni, logowania 7/30 dni,
-- konta, które uruchomiły trasę z dzieckiem) + rejestracje dzień po dniu (90 dni) + lista 300 ostatnich kont.
-- Konta żyją w GoTrue (auth.users); quolino dostaje tylko SELECT na potrzebnych kolumnach (bez haseł i tokenów).
-- Panel widzi to wyłącznie przez funkcję (SECURITY DEFINER), przez bramkę z sesją admina. Bezpieczne do powtórzenia.
BEGIN;
GRANT USAGE ON SCHEMA auth TO quolino;
GRANT SELECT (id, email, created_at, email_confirmed_at, confirmation_sent_at, last_sign_in_at, deleted_at, banned_until)
  ON auth.users TO quolino;

CREATE OR REPLACE FUNCTION admin.users_overview() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_temp AS $f$
WITH u AS (
  SELECT id, email, created_at, email_confirmed_at, confirmation_sent_at, last_sign_in_at, banned_until
    FROM auth.users WHERE deleted_at IS NULL
), runs AS (
  SELECT sub, count(*) AS n, max(created_at) AS last_run, count(DISTINCT city_slug) AS trips FROM ops.trip_runs GROUP BY sub
)
SELECT jsonb_build_object(
  'at', now(),
  'totals', (SELECT jsonb_build_object(
      'all',          count(*),
      'confirmed',    count(*) FILTER (WHERE email_confirmed_at IS NOT NULL),
      'unconfirmed',  count(*) FILTER (WHERE email_confirmed_at IS NULL),
      'unconfirmed_old', count(*) FILTER (WHERE email_confirmed_at IS NULL AND created_at < now() - interval '2 days'),
      'new_7d',       count(*) FILTER (WHERE created_at > now() - interval '7 days'),
      'new_30d',      count(*) FILTER (WHERE created_at > now() - interval '30 days'),
      'active_7d',    count(*) FILTER (WHERE last_sign_in_at > now() - interval '7 days'),
      'active_30d',   count(*) FILTER (WHERE last_sign_in_at > now() - interval '30 days'),
      'never_signed', count(*) FILTER (WHERE email_confirmed_at IS NOT NULL AND last_sign_in_at IS NULL),
      'with_trip',    (SELECT count(*) FROM runs JOIN u ON u.id = runs.sub)
    ) FROM u),
  'daily', (SELECT coalesce(jsonb_agg(jsonb_build_object('day', d, 'signups', s, 'confirmed', c) ORDER BY d), '[]')
      FROM (SELECT (created_at AT TIME ZONE 'Europe/Warsaw')::date AS d, count(*) AS s, count(email_confirmed_at) AS c
              FROM u WHERE created_at > now() - interval '90 days' GROUP BY 1) x),
  'users', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'email', u.email, 'created_at', u.created_at, 'confirmed_at', u.email_confirmed_at,
        'last_sign_in_at', u.last_sign_in_at, 'banned', u.banned_until > now(),
        'runs', coalesce(r.n, 0), 'trips', coalesce(r.trips, 0), 'last_run', r.last_run) ORDER BY u.created_at DESC), '[]')
      FROM (SELECT * FROM u ORDER BY created_at DESC LIMIT 300) u LEFT JOIN runs r ON r.sub = u.id)
);
$f$;
ALTER FUNCTION admin.users_overview() OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.users_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.users_overview() TO quolino_admin;
-- Przychody (JP 2026-11-07: „to samo w przyszłości: ile zarobiliśmy”). Płatności jeszcze nie ma (darmowo do 1.06.2027, potem 4 €),
-- więc funkcja oddaje pusty stan; kto zbuduje płatności, podmienia tylko jej ciało (kontrakt pól poniżej), panel już to pokazuje.
-- Kontrakt: {enabled, starts, currency, totals:{gross, refunds, net, orders, buyers, gross_30d, orders_30d}, monthly:[{month, gross, orders}]}
CREATE OR REPLACE FUNCTION admin.revenue_overview() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_temp AS $f$
  SELECT jsonb_build_object('enabled', false, 'starts', '2027-06-01', 'currency', 'EUR',
    'totals', jsonb_build_object('gross', 0, 'refunds', 0, 'net', 0, 'orders', 0, 'buyers', 0, 'gross_30d', 0, 'orders_30d', 0),
    'monthly', '[]'::jsonb);
$f$;
ALTER FUNCTION admin.revenue_overview() OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.revenue_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.revenue_overview() TO quolino_admin;
NOTIFY pgrst, 'reload schema';
COMMIT;
