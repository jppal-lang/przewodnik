-- 2026-11-04 (JP): przy ikonie przystanku przycisk „Generuj” — prośba o nową wersję ikony (coś się zablokowało, JP chce poprawić
-- albo zmienił link źródłowy). Panel: POST /api/rpc/admin_icon_regen {p_trip, p_stop_key, p_note}; odczyt: GET /api/icon_regen?trip=eq.<trasa>.
-- place-icons.mjs queue (cron 2× na godzinę) bierze najpierw te prośby: nowa wersja ikony z bieżącymi zdjęciami JP (albo automatem),
-- uwaga JP idzie jako wskazówka do generatora. Jedna otwarta prośba na przystanek (ponowne kliknięcie odświeża uwagę).
BEGIN;
CREATE TABLE IF NOT EXISTS ops.icon_regen (
  trip         text NOT NULL CHECK (trip ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  stop_key     text NOT NULL CHECK (stop_key ~ '^[a-z0-9][a-z0-9-]{0,120}$'),
  note         text CHECK (note IS NULL OR length(note) <= 600),
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at   timestamptz,
  done_at      timestamptz,
  result       text,
  PRIMARY KEY (trip, stop_key)
);
ALTER TABLE ops.icon_regen OWNER TO quolino;
REVOKE ALL ON ops.icon_regen FROM PUBLIC;

CREATE OR REPLACE VIEW admin.icon_regen AS SELECT trip, stop_key, note, requested_at, started_at, done_at, result FROM ops.icon_regen;
ALTER VIEW admin.icon_regen OWNER TO quolino;
REVOKE ALL ON admin.icon_regen FROM PUBLIC;
GRANT SELECT ON admin.icon_regen TO quolino_admin;

CREATE OR REPLACE FUNCTION admin.admin_icon_regen(p_trip text, p_stop_key text, p_note text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, pg_temp AS $f$
BEGIN
  IF p_trip IS NULL OR p_trip !~ '^[a-z0-9][a-z0-9-]{0,62}$' THEN RAISE EXCEPTION 'Zła trasa.'; END IF;
  IF p_stop_key IS NULL OR p_stop_key !~ '^[a-z0-9][a-z0-9-]{0,120}$' THEN RAISE EXCEPTION 'Zły klucz przystanku.'; END IF;
  INSERT INTO ops.icon_regen (trip, stop_key, note) VALUES (p_trip, p_stop_key, nullif(btrim(left(coalesce(p_note, ''), 600)), ''))
  ON CONFLICT (trip, stop_key) DO UPDATE SET note = EXCLUDED.note, requested_at = now(), started_at = NULL, done_at = NULL, result = NULL;
  RETURN json_build_object('trip', p_trip, 'stop_key', p_stop_key, 'status', 'queued');
END $f$;
ALTER FUNCTION admin.admin_icon_regen(text, text, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.admin_icon_regen(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.admin_icon_regen(text, text, text) TO quolino_admin;
NOTIFY pgrst, 'reload schema';
COMMIT;
