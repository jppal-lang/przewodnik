-- Panel statystyk (Umami) tylko na żądanie, jak panel szkiców (JP 2026-10-17): JP pisze „stats” na #admin →
-- jednorazowy link w wiadomości prywatnej → bramka (stats-gate) przed stats.quolino.com → logowanie Umami (admin_jp + hasło).
-- Linki mają cel (purpose): link do panelu szkiców nie otwiera statystyk i odwrotnie.
-- Bezpieczne do powtórzenia. Wykonuje root po `deploy.sh approve`.
BEGIN;
ALTER TABLE ops.admin_links ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'admin';
ALTER TABLE ops.admin_links DROP CONSTRAINT IF EXISTS admin_links_purpose_check;
ALTER TABLE ops.admin_links ADD CONSTRAINT admin_links_purpose_check CHECK (purpose IN ('admin', 'stats'));
ALTER TABLE ops.admin_link_requests ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'admin';
ALTER TABLE ops.admin_link_requests DROP CONSTRAINT IF EXISTS admin_link_requests_purpose_check;
ALTER TABLE ops.admin_link_requests ADD CONSTRAINT admin_link_requests_purpose_check CHECK (purpose IN ('admin', 'stats'));

DROP FUNCTION IF EXISTS admin.redeem_link(text, text);
CREATE OR REPLACE FUNCTION admin.redeem_link(p_hash text, p_ip text DEFAULT NULL, p_purpose text DEFAULT 'admin')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, pg_temp AS $f$
DECLARE n int;
BEGIN
  UPDATE ops.admin_links SET used_at = now(), used_ip = left(p_ip, 64)
   WHERE token_hash = p_hash AND used_at IS NULL AND expires_at > now() AND purpose = coalesce(p_purpose, 'admin');
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM ops.admin_links WHERE created_at < now() - interval '30 days';
  RETURN n = 1;
END $f$;
ALTER FUNCTION admin.redeem_link(text, text, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.redeem_link(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.redeem_link(text, text, text) TO quolino_admin;
NOTIFY pgrst, 'reload schema';
COMMIT;
