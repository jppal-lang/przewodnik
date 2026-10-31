-- 2026-10-31 (JP): „poza zdjęciami z wiki musi być miejsce na mój własny link lub linki do generowania zdjęć” — docs/IKONY-MIEJSC.md §7.
-- ops.icon_refs.files przyjmuje teraz obok tytułów Commons 'File:….jpg' także adresy 'https://…' (dowolna publiczna strona lub plik:
-- Google Drive, Dropbox, Imgur, strona z og:image…). Nadal najwyżej 2 referencje na przystanek, bez powtórzeń.
-- Adres: tylko https, ≤ 2000 znaków, host z liter/cyfr/kropek/myślników (bez „login:hasło@”, bez [IPv6]), port opcjonalny,
-- bez spacji, znaków kontrolnych i < > " \ ` { } | ^. Prywatne adresy IP, przekierowania i typ pliku sprawdza dopiero generator
-- (place-icons-fetch.mjs — po rozwiązaniu DNS), bo baza nie wie, dokąd wskazuje nazwa hosta.
-- Ta sama walidacja w CHECK (funkcja ops.icon_ref_ok) i w admin.admin_icon_refs_set (ta sama sygnatura i uprawnienia co 2026-10-30).
-- Wymaga 2026-10-30-icon-refs.sql. Plik sam się sprawdza na końcu (błąd = wycofanie całości). Bezpieczne do powtórzenia.
-- Wykonuje root po `deploy.sh approve`.
BEGIN;

-- jedna referencja: tytuł pliku Commons albo publiczny adres https
CREATE OR REPLACE FUNCTION ops.icon_ref_ok(f text) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $f$
  SELECT f IS NOT NULL AND (
    f ~* '^File:[^|#<>\[\]{}\n]{1,240}\.(jpe?g|png|webp|tiff?)$'
    OR (length(f) <= 2000
        AND f ~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]{0,252}[A-Za-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:][:cntrl:]<>"\\`{}|^]*)?$')
  )
$f$;
-- lista referencji: tablica 0–2 napisów, każdy poprawny, bez powtórzeń
CREATE OR REPLACE FUNCTION ops.icon_refs_files_ok(files jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $f$
  SELECT jsonb_typeof(files) = 'array' AND jsonb_array_length(files) <= 2
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(files) e WHERE jsonb_typeof(e) <> 'string' OR NOT ops.icon_ref_ok(e #>> '{}'))
     AND (SELECT count(DISTINCT e) FROM jsonb_array_elements_text(files) e) = jsonb_array_length(files)
$f$;
ALTER FUNCTION ops.icon_ref_ok(text) OWNER TO quolino;
ALTER FUNCTION ops.icon_refs_files_ok(jsonb) OWNER TO quolino;
REVOKE ALL ON FUNCTION ops.icon_ref_ok(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.icon_refs_files_ok(jsonb) FROM PUBLIC;

ALTER TABLE ops.icon_refs DROP CONSTRAINT IF EXISTS icon_refs_files;
ALTER TABLE ops.icon_refs ADD CONSTRAINT icon_refs_files CHECK (ops.icon_refs_files_ok(files) AND (mode = 'auto') = (jsonb_array_length(files) = 0));

-- zapis z panelu: POST /api/rpc/admin_icon_refs_set {p_trip, p_stop_key, p_files}
--   p_files = ["File:….jpg" | "https://…"] (1–2) → wybór JP ('pick'); [] → „Automat” ('auto'); null → usuń decyzję
CREATE OR REPLACE FUNCTION admin.admin_icon_refs_set(p_trip text, p_stop_key text, p_files jsonb)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, pg_temp AS $f$
DECLARE f jsonb; n int;
BEGIN
  IF p_trip IS NULL OR p_trip !~ '^[a-z0-9][a-z0-9-]{0,62}$' THEN RAISE EXCEPTION 'Zła trasa.'; END IF;
  IF p_stop_key IS NULL OR p_stop_key !~ '^[a-z0-9][a-z0-9-]{0,120}$' THEN RAISE EXCEPTION 'Zły klucz przystanku.'; END IF;
  IF p_files IS NULL OR jsonb_typeof(p_files) = 'null' THEN
    DELETE FROM ops.icon_refs WHERE trip = p_trip AND stop_key = p_stop_key;
    RETURN json_build_object('trip', p_trip, 'stop_key', p_stop_key, 'mode', NULL, 'files', '[]'::json);
  END IF;
  IF jsonb_typeof(p_files) <> 'array' THEN RAISE EXCEPTION 'p_files: lista plików.'; END IF;
  n := jsonb_array_length(p_files);
  IF n > 2 THEN RAISE EXCEPTION 'Najwyżej 2 zdjęcia.'; END IF;
  FOR f IN SELECT * FROM jsonb_array_elements(p_files) LOOP
    IF jsonb_typeof(f) <> 'string' OR NOT ops.icon_ref_ok(f #>> '{}') THEN
      RAISE EXCEPTION 'Zły plik albo link (tylko File:… z Commons albo https://…): %', left(f::text, 80);
    END IF;
  END LOOP;
  IF n = 2 AND p_files->>0 = p_files->>1 THEN RAISE EXCEPTION 'To samo zdjęcie dwa razy.'; END IF;
  INSERT INTO ops.icon_refs (trip, stop_key, mode, files, updated_at)
       VALUES (p_trip, p_stop_key, CASE WHEN n = 0 THEN 'auto' ELSE 'pick' END, p_files, now())
  ON CONFLICT (trip, stop_key) DO UPDATE SET mode = EXCLUDED.mode, files = EXCLUDED.files, updated_at = now();
  RETURN json_build_object('trip', p_trip, 'stop_key', p_stop_key, 'mode', CASE WHEN n = 0 THEN 'auto' ELSE 'pick' END, 'files', p_files);
END $f$;
ALTER FUNCTION admin.admin_icon_refs_set(text, text, jsonb) OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.admin_icon_refs_set(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.admin_icon_refs_set(text, text, jsonb) TO quolino_admin;

-- samokontrola: uprawnienia jak w 2026-10-30, walidacja linków (próby w podbloku — zapis testowy usuwany)
DO $$
DECLARE r json; bad text;
BEGIN
  IF has_table_privilege('web_anon', 'ops.icon_refs', 'SELECT') OR has_table_privilege('web_anon', 'ops.icon_refs', 'INSERT')
     OR has_table_privilege('web_anon', 'admin.icon_refs', 'SELECT')
     OR has_function_privilege('web_anon', 'admin.admin_icon_refs_set(text, text, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'web_anon ma dostęp do wyboru zdjęć — wycofuję';
  END IF;
  IF NOT has_table_privilege('quolino_admin', 'admin.icon_refs', 'SELECT')
     OR NOT has_function_privilege('quolino_admin', 'admin.admin_icon_refs_set(text, text, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'quolino_admin nie czyta widoku albo nie woła funkcji — wycofuję';
  END IF;
  IF has_table_privilege('quolino_admin', 'ops.icon_refs', 'INSERT') OR has_table_privilege('quolino_admin', 'ops.icon_refs', 'DELETE') THEN
    RAISE EXCEPTION 'quolino_admin pisze do tabeli z pominięciem funkcji — wycofuję';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'admin.admin_icon_refs_set(text, text, jsonb)'::regprocedure) THEN
    RAISE EXCEPTION 'admin_icon_refs_set nie jest SECURITY DEFINER — wycofuję';
  END IF;
  -- wzorzec: dobre przechodzą, złe nie
  IF NOT (ops.icon_ref_ok('https://example.com/a.jpg') AND ops.icon_ref_ok('File:A b.jpg')
          AND ops.icon_ref_ok('https://drive.google.com/file/d/1AbC_x-9/view?usp=sharing')
          AND ops.icon_ref_ok('https://www.dropbox.com/s/abc/x.jpg?dl=0') AND ops.icon_ref_ok('https://example.com')) THEN
    RAISE EXCEPTION 'poprawny link odrzucony — wycofuję';
  END IF;
  FOREACH bad IN ARRAY ARRAY['javascript:alert(1)', 'http://example.com/a.jpg', 'https://user:pw@example.com/a.jpg', 'https://example.com/a b.jpg',
      'https://example.com/a' || chr(10) || '.jpg', 'https://[::1]/a.jpg', 'https://example.com/"><script>', 'data:image/png;base64,AAAA',
      'https://example.com/' || repeat('a', 2000), 'ftp://example.com/a.jpg', 'https:///a.jpg', '<script>.jpg'] LOOP
    IF ops.icon_ref_ok(bad) THEN RAISE EXCEPTION 'przyjęto zły link: % — wycofuję', left(bad, 60); END IF;
  END LOOP;
  IF ops.icon_refs_files_ok('["https://example.com/a.jpg", "https://example.com/a.jpg"]') OR ops.icon_refs_files_ok('[1]')
     OR ops.icon_refs_files_ok('["File:a.jpg", "File:b.jpg", "File:c.jpg"]') OR NOT ops.icon_refs_files_ok('[]') THEN
    RAISE EXCEPTION 'icon_refs_files_ok liczy źle — wycofuję';
  END IF;
  -- przez funkcję panelu
  BEGIN
    r := admin.admin_icon_refs_set('test-samokontrola', 'stop-a', '["https://example.com/a.jpg", "File:C.JPG"]'::jsonb);
    IF (SELECT files->>0 FROM ops.icon_refs WHERE trip = 'test-samokontrola' AND stop_key = 'stop-a') <> 'https://example.com/a.jpg' THEN
      RAISE EXCEPTION 'zapis linku nie działa';
    END IF;
    FOREACH bad IN ARRAY ARRAY['javascript:alert(1)', 'http://example.com/a.jpg'] LOOP
      BEGIN
        r := admin.admin_icon_refs_set('test-samokontrola', 'stop-a', jsonb_build_array(bad));
        RAISE EXCEPTION 'funkcja przyjęła zły link';
      EXCEPTION WHEN raise_exception THEN
        IF SQLERRM = 'funkcja przyjęła zły link' THEN RAISE; END IF;
      END;
    END LOOP;
    BEGIN   -- CHECK chroni tabelę także z pominięciem funkcji
      INSERT INTO ops.icon_refs (trip, stop_key, mode, files) VALUES ('test-samokontrola', 'stop-b', 'pick', '["javascript:alert(1)"]');
      RAISE EXCEPTION 'CHECK przepuścił zły link';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    DELETE FROM ops.icon_refs WHERE trip = 'test-samokontrola';
  END;
  RAISE NOTICE 'samokontrola OK: linki https w icon_refs (CHECK + admin_icon_refs_set), javascript:/http:/login w adresie odrzucone, web_anon bez dostępu';
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Cofnięcie (najpierw usuń wiersze z linkami: DELETE FROM ops.icon_refs WHERE files::text LIKE '%https://%';):
--   ALTER TABLE ops.icon_refs DROP CONSTRAINT icon_refs_files;
--   ALTER TABLE ops.icon_refs ADD CONSTRAINT icon_refs_files CHECK (jsonb_typeof(files) = 'array' AND jsonb_array_length(files) <= 2 AND (mode = 'auto') = (jsonb_array_length(files) = 0));
--   potem ponownie 2026-10-30-icon-refs.sql (funkcja tylko z File:…); DROP FUNCTION ops.icon_refs_files_ok(jsonb), ops.icon_ref_ok(text);
