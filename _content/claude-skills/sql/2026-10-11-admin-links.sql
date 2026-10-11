-- Jednorazowe linki do panelu admina (decyzja JP 2026-10-11). Hermes zapisuje skrót tokenu, bramka (admin-gate) go zużywa.
BEGIN;
CREATE TABLE IF NOT EXISTS ops.admin_links (
  id           bigserial PRIMARY KEY,
  token_hash   text UNIQUE NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  used_at      timestamptz,
  used_ip      text,
  requested_by text
);
ALTER TABLE ops.admin_links OWNER TO quolino;
REVOKE ALL ON ops.admin_links FROM PUBLIC;

CREATE OR REPLACE FUNCTION admin.redeem_link(p_hash text, p_ip text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, pg_temp AS $f$
DECLARE n int;
BEGIN
  UPDATE ops.admin_links SET used_at = now(), used_ip = left(p_ip, 64)
   WHERE token_hash = p_hash AND used_at IS NULL AND expires_at > now();
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM ops.admin_links WHERE created_at < now() - interval '30 days';
  RETURN n = 1;
END $f$;
ALTER FUNCTION admin.redeem_link(text, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.redeem_link(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.redeem_link(text, text) TO quolino_admin;
NOTIFY pgrst, 'reload schema';
COMMIT;
