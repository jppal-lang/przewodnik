-- Etap A, krok 3 (JP 2026-10-28, decyzja „1” po teście B-1): gość (web_anon) nie czyta już pełnej treści wycieczek.
-- Do dziś web_anon miał SELECT na tabelach bazowych (stops, stop_translations, day_plan, emergency_points, export_*),
-- więc „Pełna wycieczka po zalogowaniu” dało się obejść jednym GET-em z publicznym kluczem.
--
-- Zasada: lista dozwolonych. web_anon zachowuje odczyt TYLKO relacji z listy poniżej (to, co czyta strona i SSR);
-- wszystkim innym relacjom w schemacie public odbieramy SELECT. Funkcje (trip_full, trip_member, draft_preview,
-- rate_trip, report_issue, claim_game_treasure…) są SECURITY DEFINER i działają dalej bez zmian.
-- Widoki public_* należą do roli quolino, więc dalej czytają tabele bazowe.
--
-- Plik sam się sprawdza: na końcu web_anon musi mieć odczyt public_stops, cities, tłumaczeń i słownika,
-- a nie może mieć odczytu stops, stop_translations, day_plan, emergency_points ani export_*. Jeśli coś się nie zgadza, cała transakcja się wycofuje.
-- Bezpieczne do powtórzenia.
BEGIN;

DO $$
DECLARE
  allow text[] := ARRAY[
    'cities', 'city_translations', 'countries', 'country_translations', 'regions', 'region_translations',
    'languages', 'ui_translations',
    'public_cities', 'public_city_translations', 'public_stops'
  ];
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT c.relname, c.relkind
      FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'p', 'f')
       AND has_table_privilege('web_anon', c.oid, 'SELECT')
       AND NOT (c.relname = ANY (allow))
     ORDER BY c.relname
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM web_anon, PUBLIC', r.relname);
    RAISE NOTICE 'odebrano web_anon: %', r.relname;
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'razem odebrano: % relacji', n;
END $$;

-- nowe tabele w public nie dostają już automatycznie odczytu dla gościa (jeśli takie domyślne uprawnienie istniało)
ALTER DEFAULT PRIVILEGES FOR ROLE quolino IN SCHEMA public REVOKE SELECT ON TABLES FROM web_anon;

-- samokontrola uprawnień gościa (działa niezależnie od tego, jaką rolą uruchamia się deploy)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['public_stops', 'public_cities', 'cities', 'city_translations', 'ui_translations'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL AND NOT has_table_privilege('web_anon', 'public.' || t, 'SELECT') THEN
      RAISE EXCEPTION 'web_anon stracił odczyt %, a strona go potrzebuje — wycofuję', t;
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['stops', 'stop_translations', 'stop_blocks', 'day_plan', 'emergency_points', 'phrases', 'export_stops', 'export_city'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL AND has_table_privilege('web_anon', 'public.' || t, 'SELECT') THEN
      RAISE EXCEPTION '% nadal czytelne dla web_anon — wycofuję', t;
    END IF;
  END LOOP;
  RAISE NOTICE 'samokontrola OK: widoki publiczne dostępne, pełna treść zablokowana';
END $$;

COMMIT;

-- Cofnięcie (tylko gdyby strona przestała działać): GRANT SELECT ON public.<tabela> TO web_anon;
-- dla tabeli wskazanej w NOTICE „odebrano web_anon: …”.
