-- Pulpit panelu admina (JP 2026-10-31): kafelek „Serwer” czyta podgląd stanu (cron, blokady, przebiegi strażników) przez /api/rpc/ops_status.
-- API panelu widzi tylko schemat admin, więc dodajemy cienkie opakowanie public.ops_status() (ten sam, oczyszczony podgląd co dla Claude).
-- Bezpieczne do powtórzenia.
BEGIN;

CREATE OR REPLACE FUNCTION admin.ops_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
  SELECT public.ops_status()
$f$;
ALTER FUNCTION admin.ops_status() OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.ops_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.ops_status() TO quolino_admin;

DO $$
BEGIN
  IF NOT has_function_privilege('quolino_admin', 'admin.ops_status()', 'EXECUTE') THEN
    RAISE EXCEPTION 'quolino_admin nie może wywołać admin.ops_status() — wycofuję';
  END IF;
  IF has_function_privilege('web_anon', 'admin.ops_status()', 'EXECUTE') THEN
    RAISE EXCEPTION 'web_anon może wywołać admin.ops_status() — wycofuję';
  END IF;
  PERFORM admin.ops_status();
  RAISE NOTICE 'samokontrola OK: admin.ops_status() dla panelu';
END $$;

COMMIT;
-- Cofnięcie: DROP FUNCTION admin.ops_status();
