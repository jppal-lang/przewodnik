-- Prośby o link do panelu: Hermes tylko zapisuje prośbę, link wysyła proces z kontekstu serwera (cron co minutę),
-- który ma dostęp do tokena bota. Hermes nigdy nie dotyka tokena. Bezpieczne do powtórzenia.
BEGIN;
CREATE TABLE IF NOT EXISTS ops.admin_link_requests (
  id           bigserial PRIMARY KEY,
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by text,
  done_at      timestamptz,
  result       text
);
ALTER TABLE ops.admin_link_requests OWNER TO quolino;
REVOKE ALL ON ops.admin_link_requests FROM PUBLIC;
COMMIT;
