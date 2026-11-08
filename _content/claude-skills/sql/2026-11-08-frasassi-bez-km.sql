-- JP 2026-11-08 („resztę zrób”): Frasassi, parking La Cuna — usunięcie odległości w km (zasada: nigdy km), żeby tłumaczenia ruszyły.
-- Zamiana jednego zwrotu w polskim tekście: tabela tekstów przystanków + opublikowana wersja trasy.
DO $$
DECLARE a text := 'z których część jest oddalona do około 1 km od kas'; b text := 'z których część leży dalej od kas';
        t text; n int;
BEGIN
  SELECT format_type(atttypid, atttypmod) INTO t FROM pg_attribute WHERE attrelid = 'public.stop_translations'::regclass AND attname = 'desc_paragraphs';
  EXECUTE format('UPDATE public.stop_translations SET desc_paragraphs = replace(desc_paragraphs::text, %L, %L)::%s, updated_at = now()
                   WHERE lang = %L AND desc_paragraphs::text LIKE %L', a, b, t, 'pl', '%' || a || '%');
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'stop_translations: %', n;
  UPDATE public.city_versions SET trip = replace(trip::text, a, b)::jsonb
   WHERE city_slug = 'frasassi' AND trip IS NOT NULL AND trip::text LIKE '%' || a || '%';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'city_versions.trip: %', n;
  UPDATE public.city_versions SET content = replace(content::text, a, b)::jsonb
   WHERE city_slug = 'frasassi' AND content::text LIKE '%' || a || '%';
END $$;
