-- Panel admina: logowanie kodem z Google Authenticator (TOTP, RFC 6238) zamiast linku z Discorda (JP 2026-11-06: „tak zrób”).
-- Sekret żyje tylko w bazie (ops.admin_totp): bramka (gate/admin-gate.mjs) przekazuje 6 cyfr, baza liczy kod i odpowiada tak/nie.
-- Włączenie: jednorazowy link „totp” w wiadomości prywatnej do JP (admin-link.mjs; prośbę dodaje install.sh po wdrożeniu bramki) → strona z kodem QR,
-- przyciskiem „Dodaj do Authenticatora” i kluczem → pierwszy poprawny kod zatwierdza sekret. Link z Discorda zostaje jako zapas.
-- Statystyki (JP 2026-11-06: „dostęp z panelu automatyczny”): admin.stats_link() wydaje zalogowanemu panelowi jednorazowy
-- link do stats.quolino.com ważny 1 minutę; panel otwiera go sam. Osobny link „stats” z Discorda przestaje być potrzebny.
-- Bezpieczne do powtórzenia.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA ops;

CREATE TABLE IF NOT EXISTS ops.admin_totp (
  id           int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  secret       bytea,                 -- zatwierdzony (działa przy logowaniu)
  pending      bytea,                 -- nowy, czeka na pierwszy poprawny kod
  last_step    bigint NOT NULL DEFAULT 0,   -- ostatni użyty krok 30 s (kod działa raz)
  confirmed_at timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ops.admin_totp OWNER TO quolino;
REVOKE ALL ON ops.admin_totp FROM PUBLIC;
CREATE TABLE IF NOT EXISTS ops.admin_totp_fail (at timestamptz NOT NULL DEFAULT now(), ip text);
ALTER TABLE ops.admin_totp_fail OWNER TO quolino;
REVOKE ALL ON ops.admin_totp_fail FROM PUBLIC;

ALTER TABLE ops.admin_links DROP CONSTRAINT IF EXISTS admin_links_purpose_check;
ALTER TABLE ops.admin_links ADD CONSTRAINT admin_links_purpose_check CHECK (purpose IN ('admin', 'stats', 'totp'));
ALTER TABLE ops.admin_link_requests DROP CONSTRAINT IF EXISTS admin_link_requests_purpose_check;
ALTER TABLE ops.admin_link_requests ADD CONSTRAINT admin_link_requests_purpose_check CHECK (purpose IN ('admin', 'stats', 'totp'));

-- base32 (RFC 4648, bez „=”) — klucz do aplikacji
CREATE OR REPLACE FUNCTION ops.b32(b bytea) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE a constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; o text := ''; buf int := 0; bits int := 0; i int;
BEGIN
  FOR i IN 0 .. length(b) - 1 LOOP
    buf := ((buf << 8) | get_byte(b, i)) & 65535; bits := bits + 8;
    WHILE bits >= 5 LOOP o := o || substr(a, ((buf >> (bits - 5)) & 31) + 1, 1); bits := bits - 5; END LOOP;
  END LOOP;
  IF bits > 0 THEN o := o || substr(a, ((buf << (5 - bits)) & 31) + 1, 1); END IF;
  RETURN o;
END $f$;

-- kod TOTP (SHA1, 6 cyfr, krok 30 s) dla danego kroku
CREATE OR REPLACE FUNCTION ops.totp_code(k bytea, step bigint) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE h bytea := ops.hmac(int8send(step), k, 'sha1'); o int; n bigint;
BEGIN
  o := get_byte(h, 19) & 15;
  n := ((get_byte(h, o) & 127)::bigint << 24) | (get_byte(h, o + 1) << 16) | (get_byte(h, o + 2) << 8) | get_byte(h, o + 3);
  RETURN lpad((n % 1000000)::text, 6, '0');
END $f$;

-- czy logowanie kodem jest włączone (bramka pokazuje formularz tylko wtedy)
CREATE OR REPLACE FUNCTION admin.totp_enabled() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ops, pg_temp AS $f$
  SELECT EXISTS (SELECT 1 FROM ops.admin_totp WHERE secret IS NOT NULL OR pending IS NOT NULL);
$f$;

-- strona włączenia: zużywa jednorazowy link „totp”, tworzy nowy sekret (pending) i zwraca adres otpauth:// (klucz w środku)
CREATE OR REPLACE FUNCTION admin.totp_setup(p_hash text, p_ip text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, pg_temp AS $f$
DECLARE n int; k bytea := ops.gen_random_bytes(20);
BEGIN
  UPDATE ops.admin_links SET used_at = now(), used_ip = left(p_ip, 64)
   WHERE token_hash = p_hash AND used_at IS NULL AND expires_at > now() AND purpose = 'totp';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RETURN NULL; END IF;
  INSERT INTO ops.admin_totp (id, pending, updated_at) VALUES (1, k, now())
  ON CONFLICT (id) DO UPDATE SET pending = EXCLUDED.pending, updated_at = now();
  RETURN 'otpauth://totp/Quolino:panel?secret=' || ops.b32(k) || '&issuer=Quolino&algorithm=SHA1&digits=6&period=30';
END $f$;

-- logowanie: 6 cyfr → tak/nie. Okno ±1 krok (zegar telefonu), każdy kod działa raz, limit: 5 błędów z adresu / 20 łącznie na 15 min.
-- Poprawny kod z nowego sekretu (pending) zatwierdza go i zastępuje stary.
CREATE OR REPLACE FUNCTION admin.totp_verify(p_code text, p_ip text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, pg_temp AS $f$
DECLARE r ops.admin_totp; now_step bigint := floor(extract(epoch FROM now()) / 30); st bigint; v_ip text := left(p_ip, 64);
BEGIN
  DELETE FROM ops.admin_totp_fail WHERE at < now() - interval '1 day';
  IF (SELECT count(*) FROM ops.admin_totp_fail WHERE at > now() - interval '15 minutes' AND admin_totp_fail.ip IS NOT DISTINCT FROM v_ip) >= 5
     OR (SELECT count(*) FROM ops.admin_totp_fail WHERE at > now() - interval '15 minutes') >= 20 THEN RETURN false; END IF;
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

-- statystyki z panelu: jednorazowy link do stats.quolino.com (1 min). Wywołuje tylko panel przez bramkę (sesja admina).
CREATE OR REPLACE FUNCTION admin.stats_link() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, pg_temp AS $f$
DECLARE t text := translate(rtrim(encode(ops.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
BEGIN
  IF (SELECT count(*) FROM ops.admin_links WHERE purpose = 'stats' AND requested_by = 'panel' AND created_at > now() - interval '10 minutes') >= 10 THEN
    RAISE EXCEPTION 'za dużo otwarć statystyk w 10 minut';
  END IF;
  INSERT INTO ops.admin_links (token_hash, expires_at, requested_by, purpose)
  VALUES (encode(ops.digest(t, 'sha256'), 'hex'), now() + interval '1 minute', 'panel', 'stats');
  RETURN t;
END $f$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['admin.totp_enabled()', 'admin.totp_setup(text, text)', 'admin.totp_verify(text, text)', 'admin.stats_link()'] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO quolino', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO quolino_admin', f);
  END LOOP;
END $$;

-- samokontrola: wektor testowy RFC 6238 (SHA1, klucz „12345678901234567890”, t = 59 s → 94287082 → 6 cyfr 287082)
DO $$ BEGIN
  IF ops.totp_code(convert_to('12345678901234567890', 'UTF8'), 1) <> '287082' THEN RAISE EXCEPTION 'TOTP: zły wynik wektora RFC 6238'; END IF;
  IF ops.b32(convert_to('foobar', 'UTF8')) <> 'MZXW6YTBOI' THEN RAISE EXCEPTION 'base32: zły wynik'; END IF;
END $$;

-- prośbę o link „totp” do JP dodaje install.sh po wdrożeniu nowej bramki (link przed bramką by nie zadziałał)
NOTIFY pgrst, 'reload schema';
COMMIT;
