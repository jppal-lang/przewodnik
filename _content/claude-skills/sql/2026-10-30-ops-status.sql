-- 2026-10-30 (JP): podgląd stanu serwera dla Claude (koordynatora) — tylko do odczytu, bez SSH i bez sekretów.
-- Kontener Hermesa (bin/ops-status.mjs, wołany z gemini-queue.mjs co ~10 min i po każdym zleceniu z repo) zapisuje
-- gotowe, odfiltrowane migawki do ops.status_snapshot (klucze: jobs, versions, queue, deploy, cron).
-- Gość (web_anon) NIE czyta tabeli; widzi tylko wynik funkcji public.ops_status():
--   curl -s -X POST https://api.quolino.com/rest/v1/rpc/ops_status -H "Content-Type: application/json" -d '{}'
-- Sekrety (tokeny, e-maile, IP, zmienne środowiskowe) wycina skrypt przed zapisem; funkcja dodatkowo ucina wynik do ~256 KB.
-- Plik sam się sprawdza na końcu (błąd = wycofanie całości). Bezpieczne do powtórzenia.
BEGIN;

CREATE SCHEMA IF NOT EXISTS ops;

CREATE TABLE IF NOT EXISTS ops.status_snapshot (
  klucz      text PRIMARY KEY,
  dane       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT status_snapshot_klucz CHECK (klucz ~ '^[a-z][a-z0-9_]{0,31}$'),
  CONSTRAINT status_snapshot_rozmiar CHECK (pg_column_size(dane) < 262144)
);
ALTER TABLE ops.status_snapshot OWNER TO quolino;
REVOKE ALL ON ops.status_snapshot FROM PUBLIC;
REVOKE ALL ON ops.status_snapshot FROM web_anon;

CREATE OR REPLACE FUNCTION public.ops_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ops, pg_temp AS $f$
  SELECT jsonb_build_object(
    'now', now(),
    'snapshots', coalesce(jsonb_object_agg(s.klucz, jsonb_build_object(
        'updated_at', s.updated_at,
        'age_min', round(extract(epoch FROM now() - s.updated_at) / 60),
        'data', CASE WHEN octet_length(s.dane::text) > 262144
                     THEN jsonb_build_object('obcięte', true, 'bajty', octet_length(s.dane::text))
                     ELSE s.dane END)
      ORDER BY s.klucz), '{}'::jsonb))
  FROM (SELECT klucz, dane, updated_at FROM ops.status_snapshot ORDER BY klucz LIMIT 20) s
$f$;
ALTER FUNCTION public.ops_status() OWNER TO quolino;
REVOKE ALL ON FUNCTION public.ops_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ops_status() TO web_anon;

-- samokontrola: gość wywołuje funkcję, ale tabeli nie czyta ani nie zmienia
DO $$
DECLARE r jsonb;
BEGIN
  IF has_table_privilege('web_anon', 'ops.status_snapshot', 'SELECT')
     OR has_table_privilege('web_anon', 'ops.status_snapshot', 'INSERT')
     OR has_table_privilege('web_anon', 'ops.status_snapshot', 'UPDATE')
     OR has_table_privilege('web_anon', 'ops.status_snapshot', 'DELETE') THEN
    RAISE EXCEPTION 'web_anon ma bezpośredni dostęp do ops.status_snapshot — wycofuję';
  END IF;
  IF NOT has_function_privilege('web_anon', 'public.ops_status()', 'EXECUTE') THEN
    RAISE EXCEPTION 'web_anon nie może wywołać public.ops_status() — wycofuję';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.ops_status()'::regprocedure) THEN
    RAISE EXCEPTION 'public.ops_status() nie jest SECURITY DEFINER — wycofuję';
  END IF;
  r := public.ops_status();
  IF r IS NULL OR NOT (r ? 'snapshots') THEN
    RAISE EXCEPTION 'public.ops_status() zwraca zły kształt: % — wycofuję', r;
  END IF;
  RAISE NOTICE 'samokontrola OK: ops_status() dla gościa, tabela migawek zamknięta';
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Cofnięcie: DROP FUNCTION public.ops_status(); DROP TABLE ops.status_snapshot;
