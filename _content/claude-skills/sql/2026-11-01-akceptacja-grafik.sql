-- 2026-11-01 (JP): AKCEPTACJA GRAFIK W PANELU ADMINA (#/grafiki) — „temat akceptacji ikon, niech to będzie przez panel admina”.
-- Każda wygenerowana grafika (ikona miejsca z place-icons.mjs, poza Quo z quo-icons.mjs, paczka grafik gry z game-art.mjs)
-- trafia tu jako wiersz 'pending' z podglądem (plik w repo, np. media/icons/_review/<key>-vN.webp — publiczny jak cała strona,
-- nic poufnego) i obrazami wejściowymi (referencje: miniatury Commons / pliki w repo). JP klika w panelu:
--   „Akceptuj” → status accepted → skrypt (cron watch) robi dokładnie to, co dotąd „ok” (WebP do repo, stops.icon, commit);
--   „Popraw” + uwagi → status fix → skrypt robi to, co „fix <uwagi>” (nowa wersja = NOWY wiersz pending, stary → superseded);
--   „Odrzuć” → status rejected → skrypt oznacza grafikę i nie generuje dalej bez nowego polecenia.
-- Discord zostaje powiadomieniem z linkiem do panelu; odpowiedź „ok” w wątku nadal działa (skrypt zamyka wtedy wiersz sam).
--
-- Tabela: ops.art_requests. Panel czyta widok admin.art_requests (rola quolino_admin, tylko przez bramkę panelu),
-- decyzję zapisuje WYŁĄCZNIE admin.admin_art_decide (SECURITY DEFINER, właściciel quolino). Skrypty (rola quolino) wpisują
-- wiersze i oznaczają wykonanie (handled_at, result) bezpośrednio w ops.art_requests. Gość (web_anon) nie ma niczego.
-- Plik sam się sprawdza na końcu (błąd = wycofanie całości). Bezpieczny do powtórzenia. Zatwierdzenie: panel → Decyzje → Wdrożenia.
BEGIN;

CREATE SCHEMA IF NOT EXISTS ops;
CREATE SCHEMA IF NOT EXISTS admin;
GRANT USAGE ON SCHEMA ops TO quolino;

CREATE TABLE IF NOT EXISTS ops.art_requests (
  id           bigserial PRIMARY KEY,
  kind         text NOT NULL,                              -- 'place_icon' | 'quo_pose' | 'game_art'
  key          text NOT NULL,                              -- 'spello/porta-venere' | 'pose-31' | 'quo-run'
  title        text NOT NULL,                              -- „Spello #7: Porta Venere”, „Quo #31: Mapa”, „Bieg Quo (quo-run)”
  preview_urls jsonb NOT NULL DEFAULT '{}'::jsonb,         -- {"preview": "media/icons/_review/…webp", "inputs": [{"url": "…", "label": "…"}], "more": ["…gif"]}
  version      int  NOT NULL DEFAULT 1,
  status       text NOT NULL DEFAULT 'pending',
  note         text,                                       -- uwagi JP przy „Popraw” (albo notatka przy odrzuceniu)
  created_at   timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz,
  decided_by   text,
  handled_at   timestamptz,                                -- kiedy skrypt wykonał decyzję (publikacja / nowa wersja / oznaczenie)
  result       text,                                       -- co skrypt zrobił (albo błąd)
  meta         jsonb NOT NULL DEFAULT '{}'::jsonb,         -- trip, stop_key, n, pack, prompt_notes, warn, źródła…
  CONSTRAINT art_requests_kind    CHECK (kind IN ('place_icon', 'quo_pose', 'game_art')),
  CONSTRAINT art_requests_key     CHECK (key ~ '^[a-z0-9][a-z0-9/_.-]{0,160}$'),
  CONSTRAINT art_requests_status  CHECK (status IN ('pending', 'accepted', 'fix', 'rejected', 'superseded')),
  CONSTRAINT art_requests_version CHECK (version >= 1),
  CONSTRAINT art_requests_preview CHECK (jsonb_typeof(preview_urls) = 'object'),
  CONSTRAINT art_requests_meta    CHECK (jsonb_typeof(meta) = 'object'),
  CONSTRAINT art_requests_uniq    UNIQUE (kind, key, version)
);
CREATE INDEX IF NOT EXISTS art_requests_status ON ops.art_requests (status, id DESC);
CREATE INDEX IF NOT EXISTS art_requests_todo   ON ops.art_requests (handled_at) WHERE status IN ('accepted', 'fix', 'rejected') AND handled_at IS NULL;
ALTER TABLE ops.art_requests OWNER TO quolino;
REVOKE ALL ON ops.art_requests FROM PUBLIC;
REVOKE ALL ON ops.art_requests FROM web_anon;

-- GET /api/art_requests?status=eq.pending&order=id.desc  ·  ?status=in.(accepted,fix,rejected)&order=decided_at.desc&limit=20
CREATE OR REPLACE VIEW admin.art_requests AS
  SELECT id, kind, key, title, preview_urls, version, status, note, created_at, decided_at, decided_by, handled_at, result, meta
    FROM ops.art_requests;
ALTER VIEW admin.art_requests OWNER TO quolino;
REVOKE ALL ON admin.art_requests FROM PUBLIC;
GRANT SELECT ON admin.art_requests TO quolino_admin;

-- POST /api/rpc/admin_art_decide {p_id, p_decision, p_note}: 'accept' | 'fix' (uwagi obowiązkowe) | 'reject' — tylko z pending
CREATE OR REPLACE FUNCTION admin.admin_art_decide(p_id bigint, p_decision text, p_note text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, pg_temp AS $f$
DECLARE r ops.art_requests; st text;
BEGIN
  IF p_decision NOT IN ('accept', 'fix', 'reject') THEN RAISE EXCEPTION 'Decyzja: accept, fix albo reject.'; END IF;
  p_note := nullif(left(regexp_replace(coalesce(p_note, ''), '[[:cntrl:]]+', ' ', 'g'), 800), '');
  IF p_decision = 'fix' AND (p_note IS NULL OR length(trim(p_note)) < 3) THEN RAISE EXCEPTION 'Napisz, co poprawić (uwagi do nowej wersji).'; END IF;
  SELECT * INTO r FROM ops.art_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nie ma takiej grafiki.'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Ta grafika nie czeka już na decyzję (status: %).', r.status; END IF;
  st := CASE p_decision WHEN 'accept' THEN 'accepted' WHEN 'fix' THEN 'fix' ELSE 'rejected' END;
  UPDATE ops.art_requests SET status = st, note = p_note, decided_at = now(), decided_by = 'JP (panel)' WHERE id = p_id;
  RETURN json_build_object('id', p_id, 'status', st, 'kind', r.kind, 'key', r.key, 'version', r.version);
END $f$;
ALTER FUNCTION admin.admin_art_decide(bigint, text, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.admin_art_decide(bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.admin_art_decide(bigint, text, text) TO quolino_admin;

-- ── samokontrola ─────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r json; i bigint; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ops.art_requests', 'admin.art_requests'] LOOP
    IF has_table_privilege('web_anon', t, 'SELECT') OR has_table_privilege('web_anon', t, 'INSERT') OR has_table_privilege('web_anon', t, 'UPDATE') THEN
      RAISE EXCEPTION 'web_anon ma dostęp do % — wycofuję', t;
    END IF;
  END LOOP;
  t := 'admin.admin_art_decide(bigint, text, text)';
  IF has_function_privilege('web_anon', t, 'EXECUTE') THEN RAISE EXCEPTION 'web_anon może wywołać % — wycofuję', t; END IF;
  IF NOT has_function_privilege('quolino_admin', t, 'EXECUTE') THEN RAISE EXCEPTION 'quolino_admin nie może wywołać % — wycofuję', t; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = t::regprocedure) THEN RAISE EXCEPTION '% nie jest SECURITY DEFINER — wycofuję', t; END IF;
  IF NOT has_table_privilege('quolino_admin', 'admin.art_requests', 'SELECT') THEN RAISE EXCEPTION 'quolino_admin nie czyta admin.art_requests — wycofuję'; END IF;
  FOREACH t IN ARRAY ARRAY['ops.art_requests', 'admin.art_requests'] LOOP
    IF has_table_privilege('quolino_admin', t, 'INSERT') OR has_table_privilege('quolino_admin', t, 'UPDATE') OR has_table_privilege('quolino_admin', t, 'DELETE') THEN
      RAISE EXCEPTION 'quolino_admin pisze do % z pominięciem funkcji — wycofuję', t;
    END IF;
  END LOOP;

  -- pending → accepted; drugi raz nie
  INSERT INTO ops.art_requests (kind, key, title, version, preview_urls) VALUES ('place_icon', 'test/samokontrola', 'test', 1, '{"preview":"media/icons/_review/x.webp"}') RETURNING id INTO i;
  r := admin.admin_art_decide(i, 'accept', NULL);
  IF (SELECT status FROM ops.art_requests WHERE id = i) <> 'accepted' THEN RAISE EXCEPTION 'akceptacja nie działa'; END IF;
  IF (SELECT handled_at FROM ops.art_requests WHERE id = i) IS NOT NULL THEN RAISE EXCEPTION 'handled_at ustawione bez skryptu'; END IF;
  BEGIN
    r := admin.admin_art_decide(i, 'reject', NULL);
    RAISE EXCEPTION 'zmieniono decyzję po fakcie';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'zmieniono decyzję po fakcie' THEN RAISE; END IF;
  END;
  -- fix bez uwag odpada, z uwagami przechodzi (uwagi przycięte do 800 znaków, bez znaków sterujących)
  INSERT INTO ops.art_requests (kind, key, title, version) VALUES ('place_icon', 'test/samokontrola', 'test', 2) RETURNING id INTO i;
  BEGIN
    r := admin.admin_art_decide(i, 'fix', '  ');
    RAISE EXCEPTION 'poprawka bez uwag przeszła';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'poprawka bez uwag przeszła' THEN RAISE; END IF;
  END;
  r := admin.admin_art_decide(i, 'fix', E'wieża wyższa,\x01 mniej drzew');
  IF (SELECT status FROM ops.art_requests WHERE id = i) <> 'fix' OR (SELECT note FROM ops.art_requests WHERE id = i) !~ '^wieża wyższa, +mniej drzew$' THEN RAISE EXCEPTION 'poprawka z uwagami nie działa'; END IF;
  -- reject
  INSERT INTO ops.art_requests (kind, key, title, version) VALUES ('game_art', 'test-samokontrola', 'test', 1) RETURNING id INTO i;
  r := admin.admin_art_decide(i, 'reject', 'nie ten styl');
  IF (SELECT status FROM ops.art_requests WHERE id = i) <> 'rejected' THEN RAISE EXCEPTION 'odrzucenie nie działa'; END IF;
  -- zły rodzaj / klucz / status odpadają
  BEGIN
    INSERT INTO ops.art_requests (kind, key, title) VALUES ('poster', 'x', 'x');
    RAISE EXCEPTION 'przyjęto zły rodzaj';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO ops.art_requests (kind, key, title) VALUES ('quo_pose', 'Pose 1; DROP', 'x');
    RAISE EXCEPTION 'przyjęto zły klucz';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    r := admin.admin_art_decide(i, 'maybe', NULL);
    RAISE EXCEPTION 'przyjęto złą decyzję';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'przyjęto złą decyzję' THEN RAISE; END IF;
  END;
  DELETE FROM ops.art_requests WHERE key IN ('test/samokontrola', 'test-samokontrola');
  RAISE NOTICE 'samokontrola OK: grafiki (akceptuj/popraw/odrzuć), web_anon bez dostępu, quolino_admin tylko przez funkcję';
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Cofnięcie: DROP FUNCTION admin.admin_art_decide(bigint, text, text); DROP VIEW admin.art_requests; DROP TABLE ops.art_requests;
