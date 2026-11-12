-- JP 2026-11-12: przed kodem z Google Authenticatora login i hasło. Dopuszczony tylko login admin_jp. Błędny login albo błędne
-- hasło = wpis w dzienniku (raport) i blokada adresu IP na 90 dni (IPv6: cała sieć /64). Blokada dotyczy całej bramki
-- (panel, statystyki, linki z Discorda). Hasło NIE jest w repo: w bazie tylko skrót bcrypt (pgcrypto, koszt 12), ustawia je
-- JP sam na stronie /haslo po zalogowaniu (bramka). Funkcje mają prefiks totp_, więc rola editor/support ich nie wywoła (bramka).
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA ops;

CREATE TABLE IF NOT EXISTS ops.admin_password (
  id     int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  hash   text NOT NULL,
  set_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ops.admin_password OWNER TO quolino;
REVOKE ALL ON ops.admin_password FROM PUBLIC;

CREATE TABLE IF NOT EXISTS ops.ip_blocks (
  net        text PRIMARY KEY,                 -- IPv4 adres, IPv6 sieć /64
  reason     text NOT NULL,
  login      text,                             -- wpisany login (ucięty), hasła nie zapisujemy nigdy
  created_at timestamptz NOT NULL DEFAULT now(),
  until      timestamptz NOT NULL,
  hits       int NOT NULL DEFAULT 0,           -- ile razy próbowano wejść już po blokadzie
  last_hit   timestamptz
);
ALTER TABLE ops.ip_blocks OWNER TO quolino;
REVOKE ALL ON ops.ip_blocks FROM PUBLIC;

-- adres → klucz blokady (IPv6 /64, bo jedna maszyna ma tam całą sieć); zły format → sam tekst (ucięty)
CREATE OR REPLACE FUNCTION ops.ip_net(p_ip text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = pg_temp AS $f$
DECLARE a inet;
BEGIN
  BEGIN a := btrim(coalesce(p_ip, ''))::inet; EXCEPTION WHEN others THEN RETURN left(coalesce(p_ip, '?'), 64); END;
  IF family(a) = 6 THEN
    IF host(a) LIKE '::ffff:%' THEN RETURN substr(host(a), 8); END IF;   -- IPv4 zapisany jako IPv6
    RETURN network(set_masklen(a, 64))::text;
  END IF;
  RETURN host(a);
END $f$;
ALTER FUNCTION ops.ip_net(text) OWNER TO quolino;

CREATE OR REPLACE FUNCTION admin.totp_ip_blocked(p_ip text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_temp AS $f$
BEGIN
  UPDATE ops.ip_blocks SET hits = hits + 1, last_hit = now() WHERE net = ops.ip_net(p_ip) AND until > now();
  RETURN FOUND;
END $f$;

CREATE OR REPLACE FUNCTION ops.ip_block(p_ip text, p_reason text, p_login text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_temp AS $f$
BEGIN
  INSERT INTO ops.ip_blocks (net, reason, login, until) VALUES (ops.ip_net(p_ip), p_reason, left(p_login, 40), now() + interval '90 days')
  ON CONFLICT (net) DO UPDATE SET reason = EXCLUDED.reason, login = EXCLUDED.login, created_at = now(), until = EXCLUDED.until;
  -- raport: dziennik zdarzeń panelu (Dziennik) — kto: bramka
  INSERT INTO ops.admin_audit (who, action, target, detail)
  VALUES ('bramka', 'blokada IP na 90 dni', ops.ip_net(p_ip), p_reason || coalesce(' · login: ' || left(p_login, 40), ''));
END $f$;
ALTER FUNCTION ops.ip_block(text, text, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION ops.ip_block(text, text, text) FROM PUBLIC;

-- logowanie: login + hasło + kod z Authenticatora. Wynik: {ok, need_password} | {blocked} | {ok:false} (zły kod — bez blokady IP,
-- jak dotąd: 5 błędnych kodów = 15 minut przerwy, bo kod łatwo przepisać źle). Bez ustawionego hasła: login + kod, potem /haslo.
CREATE OR REPLACE FUNCTION admin.totp_pass_login(p_login text, p_pass text, p_code text, p_ip text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_temp AS $f$
DECLARE h text;
BEGIN
  IF admin.totp_ip_blocked(p_ip) THEN RETURN jsonb_build_object('blocked', true); END IF;
  IF coalesce(p_login, '') <> 'admin_jp' THEN
    PERFORM ops.ip_block(p_ip, 'niedozwolony login', p_login);
    RETURN jsonb_build_object('blocked', true);
  END IF;
  SELECT hash INTO h FROM ops.admin_password WHERE id = 1;
  IF h IS NOT NULL AND (coalesce(p_pass, '') = '' OR ops.crypt(p_pass, h) <> h) THEN
    PERFORM ops.ip_block(p_ip, 'błędne hasło', p_login);
    RETURN jsonb_build_object('blocked', true);
  END IF;
  IF admin.totp_verify(p_code, p_ip) THEN
    INSERT INTO ops.admin_audit (who, action, target, detail) VALUES ('JP', 'logowanie do panelu', ops.ip_net(p_ip), CASE WHEN h IS NULL THEN 'bez hasła (do ustawienia)' END);
    RETURN jsonb_build_object('ok', true, 'need_password', h IS NULL);
  END IF;
  RETURN jsonb_build_object('ok', false);
END $f$;

-- ustawienie / zmiana hasła (bramka, tylko sesja JP): przy zmianie wymagane obecne hasło; nowe min. 16 znaków
CREATE OR REPLACE FUNCTION admin.totp_pass_set(p_new text, p_old text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_temp AS $f$
DECLARE h text;
BEGIN
  SELECT hash INTO h FROM ops.admin_password WHERE id = 1 FOR UPDATE;
  IF h IS NOT NULL AND (coalesce(p_old, '') = '' OR ops.crypt(p_old, h) <> h) THEN RETURN jsonb_build_object('error', 'Obecne hasło się nie zgadza.'); END IF;
  IF length(coalesce(p_new, '')) < 16 OR length(p_new) > 200 THEN RETURN jsonb_build_object('error', 'Hasło: od 16 do 200 znaków.'); END IF;
  INSERT INTO ops.admin_password (id, hash, set_at) VALUES (1, ops.crypt(p_new, ops.gen_salt('bf', 12)), now())
  ON CONFLICT (id) DO UPDATE SET hash = EXCLUDED.hash, set_at = now();
  INSERT INTO ops.admin_audit (who, action) VALUES ('JP', CASE WHEN h IS NULL THEN 'hasło panelu ustawione' ELSE 'hasło panelu zmienione' END);
  RETURN jsonb_build_object('ok', true);
END $f$;

CREATE OR REPLACE FUNCTION admin.totp_pass_isset() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_temp AS $f$
  SELECT EXISTS (SELECT 1 FROM ops.admin_password WHERE id = 1);
$f$;

-- lista i zdjęcie blokady (panel, tylko JP)
CREATE OR REPLACE FUNCTION admin.totp_ip_blocks() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_temp AS $f$
  SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.created_at DESC), '[]') FROM ops.ip_blocks b WHERE until > now();
$f$;
CREATE OR REPLACE FUNCTION admin.totp_ip_unblock(p_net text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_temp AS $f$
BEGIN
  DELETE FROM ops.ip_blocks WHERE net = p_net;
  IF FOUND THEN INSERT INTO ops.admin_audit (who, action, target) VALUES (ops.admin_who(), 'zdjęta blokada IP', p_net); END IF;
  RETURN FOUND;
END $f$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['admin.totp_ip_blocked(text)', 'admin.totp_pass_login(text, text, text, text)', 'admin.totp_pass_set(text, text)',
                           'admin.totp_pass_isset()', 'admin.totp_ip_blocks()', 'admin.totp_ip_unblock(text)'] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO quolino', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO quolino_admin', f);
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
