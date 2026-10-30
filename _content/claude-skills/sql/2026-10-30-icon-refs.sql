-- 2026-10-30 (JP): wybór zdjęć referencyjnych do ikon miejsc w panelu admina — docs/IKONY-MIEJSC.md §6.
-- Kandydaci (3–4 zdjęcia z Wikimedia Commons na przystanek) leżą w repo: media/icons/place-candidates/<trasa>.json (place-candidates.mjs).
-- JP klika w karcie przystanku 1–2 zdjęcia („Referencja do ikony Quo”) albo „Automat”; wybór zapisuje admin.admin_icon_refs_set.
-- place-icons.mjs (Hermes, rola quolino) czyta ops.icon_refs: mode 'pick' → te pliki zamiast automatu (także przy --force),
-- mode 'auto' → automatyczny dobór jak dotąd. Brak wiersza = brak decyzji (generowanie czeka do 48 h od wygenerowania kandydatów).
-- Panel czyta przez widok admin.icon_refs. Gość (web_anon) nie widzi niczego.
-- Plik sam się sprawdza na końcu (błąd = wycofanie całości). Bezpieczne do powtórzenia. Wykonuje root po `deploy.sh approve`.
BEGIN;

CREATE SCHEMA IF NOT EXISTS ops;
GRANT USAGE ON SCHEMA ops TO quolino;   -- właściciel funkcji i Hermes (na produkcji już jest; tu dla pewności)

CREATE TABLE IF NOT EXISTS ops.icon_refs (
  trip       text NOT NULL,
  stop_key   text NOT NULL,
  mode       text NOT NULL,
  files      jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip, stop_key),
  CONSTRAINT icon_refs_trip CHECK (trip ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  CONSTRAINT icon_refs_stop CHECK (stop_key ~ '^[a-z0-9][a-z0-9-]{0,120}$'),
  CONSTRAINT icon_refs_mode CHECK (mode IN ('pick', 'auto')),
  CONSTRAINT icon_refs_files CHECK (jsonb_typeof(files) = 'array' AND jsonb_array_length(files) <= 2
                                    AND (mode = 'auto') = (jsonb_array_length(files) = 0))
);
ALTER TABLE ops.icon_refs OWNER TO quolino;
REVOKE ALL ON ops.icon_refs FROM PUBLIC;
REVOKE ALL ON ops.icon_refs FROM web_anon;

-- odczyt w panelu: GET /api/icon_refs?trip=eq.<trasa>
CREATE OR REPLACE VIEW admin.icon_refs AS
  SELECT trip, stop_key, mode, files, updated_at FROM ops.icon_refs;
ALTER VIEW admin.icon_refs OWNER TO quolino;
REVOKE ALL ON admin.icon_refs FROM PUBLIC;
GRANT SELECT ON admin.icon_refs TO quolino_admin;

-- zapis z panelu: POST /api/rpc/admin_icon_refs_set {p_trip, p_stop_key, p_files}
--   p_files = ["File:….jpg"] albo dwa pliki → wybór JP ('pick'); [] → „Automat” ('auto'); null → usuń decyzję (znowu „brak wyboru”)
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
    IF jsonb_typeof(f) <> 'string' OR (f #>> '{}') !~* '^File:[^|#<>\[\]{}\n]{1,240}\.(jpe?g|png|webp|tiff?)$' THEN
      RAISE EXCEPTION 'Zły plik: %', left(f::text, 80);
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

-- samokontrola: gość nie ma dostępu, admin czyta widok i woła funkcję, funkcja waliduje i zapisuje (próba wycofana savepointem)
DO $$
DECLARE r json;
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
  BEGIN
    r := admin.admin_icon_refs_set('test-samokontrola', 'stop-a', '["File:A b.jpg", "File:C.JPG"]'::jsonb);
    IF (SELECT mode FROM ops.icon_refs WHERE trip = 'test-samokontrola' AND stop_key = 'stop-a') <> 'pick' THEN RAISE EXCEPTION 'zapis wyboru nie działa'; END IF;
    r := admin.admin_icon_refs_set('test-samokontrola', 'stop-a', '[]'::jsonb);
    IF (SELECT mode FROM ops.icon_refs WHERE trip = 'test-samokontrola' AND stop_key = 'stop-a') <> 'auto' THEN RAISE EXCEPTION 'zapis automatu nie działa'; END IF;
    r := admin.admin_icon_refs_set('test-samokontrola', 'stop-a', NULL);
    IF EXISTS (SELECT 1 FROM ops.icon_refs WHERE trip = 'test-samokontrola') THEN RAISE EXCEPTION 'usuwanie decyzji nie działa'; END IF;
    BEGIN
      r := admin.admin_icon_refs_set('test-samokontrola', 'stop-a', '["File:a.jpg", "File:b.jpg", "File:c.jpg"]'::jsonb);
      RAISE EXCEPTION 'przyjęto 3 zdjęcia';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM = 'przyjęto 3 zdjęcia' THEN RAISE; END IF;
    END;
    BEGIN
      r := admin.admin_icon_refs_set('test-samokontrola', 'stop-a', '["<script>.jpg"]'::jsonb);
      RAISE EXCEPTION 'przyjęto zły plik';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM = 'przyjęto zły plik' THEN RAISE; END IF;
    END;
    DELETE FROM ops.icon_refs WHERE trip = 'test-samokontrola';
  END;
  RAISE NOTICE 'samokontrola OK: admin_icon_refs_set (wybór / automat / usunięcie / walidacja), web_anon bez dostępu';
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Cofnięcie: DROP FUNCTION admin.admin_icon_refs_set(text, text, jsonb); DROP VIEW admin.icon_refs; DROP TABLE ops.icon_refs;
