-- 2026-10-31 (JP): „wygenerowane grafiki i zaakceptowane punkty nie pojawiły się przy przystankach, po akceptacji to musi lecieć automatem”.
-- Ikona miejsca żyje w stops.icon = 'place-<trasa>-<stop_key>' (ustawia place-icons.mjs ok/sync; strona czyta przez public_stops / trip_full).
-- PROBLEM: zatwierdzenie szkicu (admin.admin_approve → city_load_snapshot) wgrywa przystanki z migawki szkicu, a migawka powstaje
-- z import_city() z plików szkicu, które nie znają pola icon → po każdej nowej wersji ikony miejsc znikałyby (do następnego sync).
-- ROZWIĄZANIE (dwa pasy bezpieczeństwa, oba przez stop_key):
--   1) trip_draft_save: po import_city przepisuje icon z przystanków na żywo (sprzed importu) do migawki szkicu — podgląd szkicu i panel widzą ikonę;
--   2) admin_approve: przed city_load_snapshot zapamiętuje ikony na żywo, po — przywraca tam, gdzie migawka ich nie ma (stare szkice).
-- Zasada: przystanek, który w nowej wersji MA inny icon w migawce (np. nowy 'place-…'), zachowuje ten z migawki; NULL = uzupełniamy.
-- Wymaga: trip-translate.sql (admin_approve, queue_translation), 2026-10-31-misja-wybor.sql (trip_draft_save z kids_choice).
-- Plik sam się sprawdza na końcu (na prawdziwej trasie, w wycofywanej podtransakcji; błąd = wycofanie całości). Bezpieczne do powtórzenia.
-- Wykonuje root po `deploy.sh approve`. Bez tego SQL ikony i tak wracają: place-icons.mjs sync (kolejka co 30 min) — ale z przerwą po zatwierdzeniu.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'stops' AND column_name = 'icon') THEN
    RAISE EXCEPTION 'brak kolumny public.stops.icon — wycofuję';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'stop_translations' AND column_name = 'kids_choice') THEN
    RAISE EXCEPTION 'najpierw 2026-10-31-misja-wybor.sql (stop_translations.kids_choice) — wycofuję';
  END IF;
END $$;

-- ── 1) pomocnicze: zapamiętaj / przywróć ikony miejsc trasy (po stop_key) ───────────────────────
-- {"<stop_key>": "place-…", …} — tylko ikony miejsc (inne wartości icon, gdyby się pojawiły, nie są ruszane)
CREATE OR REPLACE FUNCTION public.stops_icons_of(p_slug text) RETURNS jsonb LANGUAGE sql STABLE AS $f$
  SELECT coalesce(jsonb_object_agg(stop_key, icon), '{}'::jsonb)
    FROM public.stops WHERE city_slug = p_slug AND stop_key IS NOT NULL AND icon LIKE 'place-%'
$f$;
-- przywraca zapamiętane ikony tam, gdzie przystanek (ten sam stop_key) ma teraz icon IS NULL; zwraca liczbę uzupełnionych
CREATE OR REPLACE FUNCTION public.stops_icons_restore(p_slug text, p_saved jsonb) RETURNS int LANGUAGE plpgsql AS $f$
DECLARE n int;
BEGIN
  IF p_saved IS NULL OR jsonb_typeof(p_saved) <> 'object' THEN RETURN 0; END IF;
  UPDATE public.stops s SET icon = p_saved ->> s.stop_key
   WHERE s.city_slug = p_slug AND s.icon IS NULL AND s.stop_key IS NOT NULL AND p_saved ? s.stop_key
     AND (p_saved ->> s.stop_key) LIKE 'place-%';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $f$;
ALTER FUNCTION public.stops_icons_of(text) OWNER TO quolino;
ALTER FUNCTION public.stops_icons_restore(text, jsonb) OWNER TO quolino;
REVOKE ALL ON FUNCTION public.stops_icons_of(text), public.stops_icons_restore(text, jsonb) FROM PUBLIC;

-- ── 2) szkic: ikony z przystanków na żywo przechodzą do migawki szkicu (treść jak w 2026-10-31-misja-wybor.sql + ikony) ──
CREATE OR REPLACE FUNCTION public.trip_draft_save(p_meta jsonb, p_content jsonb, p_note text DEFAULT NULL,
    p_source text DEFAULT 'draft', p_changes jsonb DEFAULT '[]', p_review jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE v_slug text := p_meta->'city'->>'slug'; snap jsonb; v int; v_prev int; tok text; icons jsonb;
BEGIN
  IF v_slug IS NULL OR v_slug !~ '^[a-z0-9-]+$' THEN RAISE EXCEPTION 'Szkic: brak lub zły city.slug (%)', v_slug; END IF;
  IF coalesce(p_content->>'lang', 'pl') <> 'pl' THEN RAISE EXCEPTION 'Szkic powstaje po polsku (lang = pl)'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('city_versions:' || v_slug));
  icons := public.stops_icons_of(v_slug);   -- ikony miejsc sprzed importu (2026-10-31)

  BEGIN
    PERFORM public.import_city(p_meta, p_content);
    -- pytanie z wyborem (2026-10-31): import_city nie zna pola; zły kształt = bez pytania (misja zostaje), nie błąd szkicu
    UPDATE public.stop_translations t
       SET kids_choice = CASE WHEN public.kids_choice_ok(p_content -> 'stops' -> s.stop_key -> 'kids_choice')
                              THEN nullif(p_content -> 'stops' -> s.stop_key -> 'kids_choice', 'null'::jsonb) END
      FROM public.stops s
     WHERE s.id = t.stop_id AND s.city_slug = v_slug AND t.lang = 'pl'
       AND t.kids_choice IS DISTINCT FROM (CASE WHEN public.kids_choice_ok(p_content -> 'stops' -> s.stop_key -> 'kids_choice')
                                                THEN nullif(p_content -> 'stops' -> s.stop_key -> 'kids_choice', 'null'::jsonb) END);
    -- ikony miejsc (2026-10-31): import_city nie zna pola icon — przepisujemy z przystanków sprzed importu (ten sam stop_key)
    PERFORM public.stops_icons_restore(v_slug, icons);
    snap := public.city_snapshot(v_slug);
    RAISE EXCEPTION USING ERRCODE = 'QD001', MESSAGE = 'wycofanie importu szkicu';
  EXCEPTION WHEN SQLSTATE 'QD001' THEN
    NULL;   -- tabele na żywo wracają do stanu sprzed importu, migawka zostaje w zmiennej
  END;
  IF snap IS NULL OR jsonb_array_length(coalesce(snap->'stops', '[]')) = 0 THEN
    RAISE EXCEPTION 'Szkic % nie ma przystanków po imporcie', v_slug;
  END IF;

  SELECT max(version) INTO v_prev FROM public.city_versions WHERE city_slug = v_slug AND status = 'draft';
  UPDATE public.city_versions SET status = 'archived', review_note = coalesce(review_note, 'zastąpiony nowszym szkicem')
   WHERE city_slug = v_slug AND status = 'draft';
  SELECT coalesce(max(version), 0) + 1 INTO v FROM public.city_versions WHERE city_slug = v_slug;
  INSERT INTO public.city_versions (city_slug, version, status, source, note, content, trip, changes, review)
  VALUES (v_slug, v, 'draft', p_source, p_note, snap,
          jsonb_build_object('meta', p_meta, 'content', p_content), coalesce(p_changes, '[]'), p_review);
  tok := public.draft_preview_token(v_slug);
  RETURN jsonb_build_object('city_slug', v_slug, 'version', v, 'replaced', v_prev,
    'stops', jsonb_array_length(snap->'stops'), 'token', tok);
END $f$;
ALTER FUNCTION public.trip_draft_save(jsonb, jsonb, text, text, jsonb, jsonb) OWNER TO quolino;

-- ── 3) zatwierdzenie: ikony na żywo przeżywają wgranie migawki (treść jak w trip-translate.sql + ikony) ──
CREATE OR REPLACE FUNCTION admin.admin_approve(p_slug text, p_version int, p_note text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE d public.city_versions; pub public.city_versions; v_job bigint; icons jsonb; kept int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('city_versions:' || p_slug));
  SELECT * INTO d FROM public.city_versions WHERE city_slug = p_slug AND version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nie ma szkicu % v%', p_slug, p_version; END IF;
  IF d.status <> 'draft' THEN RAISE EXCEPTION 'Szkic % v% już rozpatrzony (status: %)', p_slug, p_version, d.status; END IF;
  IF d.stops_count = 0 THEN RAISE EXCEPTION 'Szkic % v% nie ma przystanków — nie można go opublikować', p_slug, p_version; END IF;
  SELECT * INTO pub FROM public.city_versions WHERE city_slug = p_slug AND status = 'published';
  IF EXISTS (SELECT 1 FROM public.cities WHERE slug = p_slug)
     AND (pub.id IS NULL OR public.city_snapshot(p_slug) IS DISTINCT FROM pub.content) THEN
    PERFORM public.city_version_save(p_slug, 'archived', 'stan na żywo przed zatwierdzeniem v' || p_version, 'manual');
  END IF;
  icons := public.stops_icons_of(p_slug);                 -- ikony miejsc sprzed wgrania migawki (2026-10-31)
  PERFORM public.city_load_snapshot(p_slug, d.content);
  kept := public.stops_icons_restore(p_slug, icons);     -- szkic bez ikon (stary) → przywracamy po stop_key
  PERFORM public.publish_city(p_slug, true);
  UPDATE public.city_versions SET status = 'archived' WHERE city_slug = p_slug AND status = 'published';
  UPDATE public.city_versions SET status = 'published', published_at = now(), reviewed_at = now(), review_note = p_note
   WHERE id = d.id;
  v_job := public.queue_translation(p_slug, p_version);
  RETURN json_build_object('city_slug', p_slug, 'version', p_version, 'status', 'published', 'translation_job', v_job, 'icons_kept', kept);
END $f$;

-- ── 4) samokontrola (prawdziwa trasa, podtransakcja wycofana na końcu) ────────────────────────────
DO $$
DECLARE v_slug text; k text; snap jsonb; got text; n int; probe text := 'place-samokontrola-ikony';
BEGIN
  SELECT s.city_slug, s.stop_key INTO v_slug, k FROM public.stops s JOIN public.cities c ON c.slug = s.city_slug
   WHERE c.status = 'published' AND s.stop_key IS NOT NULL ORDER BY s.city_slug, s.sort_order DESC LIMIT 1;
  IF v_slug IS NULL THEN RAISE NOTICE 'samokontrola: brak opublikowanej trasy z przystankami — pominięta'; RETURN; END IF;
  BEGIN
    UPDATE public.stops SET icon = probe WHERE city_slug = v_slug AND stop_key = k;
    IF (public.stops_icons_of(v_slug) ->> k) IS DISTINCT FROM probe THEN RAISE EXCEPTION 'stops_icons_of nie widzi ikony — wycofuję'; END IF;
    -- migawka z ikoną: city_snapshot musi ją nieść (inaczej panel i szkic nie zobaczą ikony)
    snap := public.city_snapshot(v_slug);
    SELECT x ->> 'icon' INTO got FROM jsonb_array_elements(snap -> 'stops') x WHERE x ->> 'stop_key' = k;
    IF got IS DISTINCT FROM probe THEN RAISE EXCEPTION 'city_snapshot() nie zapisuje stops.icon — wycofuję'; END IF;
    -- migawka BEZ ikony (jak stary szkic) wgrana przez city_load_snapshot → ikona ginie → stops_icons_restore ją przywraca
    snap := jsonb_set(snap, '{stops}', (SELECT jsonb_agg(x - 'icon' ORDER BY o) FROM jsonb_array_elements(snap -> 'stops') WITH ORDINALITY t(x, o)));
    PERFORM public.city_load_snapshot(v_slug, snap);
    SELECT icon INTO got FROM public.stops WHERE city_slug = v_slug AND stop_key = k;
    IF got IS NOT NULL THEN RAISE NOTICE 'samokontrola: city_load_snapshot zachował icon sam (%); przywracanie i tak nie szkodzi', got; END IF;
    n := public.stops_icons_restore(v_slug, jsonb_build_object(k, probe));
    SELECT icon INTO got FROM public.stops WHERE city_slug = v_slug AND stop_key = k;
    IF got IS DISTINCT FROM probe THEN RAISE EXCEPTION 'stops_icons_restore nie przywrócił ikony po wgraniu migawki — wycofuję'; END IF;
    -- migawka Z INNĄ ikoną wygrywa (nowa wersja może zmienić ikonę): restore nie nadpisuje nie-NULL
    UPDATE public.stops SET icon = 'place-inna-ikona' WHERE city_slug = v_slug AND stop_key = k;
    n := public.stops_icons_restore(v_slug, jsonb_build_object(k, probe));
    SELECT icon INTO got FROM public.stops WHERE city_slug = v_slug AND stop_key = k;
    IF n <> 0 OR got <> 'place-inna-ikona' THEN RAISE EXCEPTION 'stops_icons_restore nadpisuje istniejącą ikonę — wycofuję'; END IF;
    RAISE NOTICE 'samokontrola %/%: ikona miejsca przeżywa migawkę i jej wgranie', v_slug, k;
    RAISE EXCEPTION USING ERRCODE = 'QC032', MESSAGE = 'wycofanie próby';
  EXCEPTION WHEN SQLSTATE 'QC032' THEN
    NULL;   -- próba wycofana, tabele bez zmian
  END;
  IF EXISTS (SELECT 1 FROM public.stops WHERE icon IN (probe, 'place-inna-ikona')) THEN RAISE EXCEPTION 'próbna ikona została w bazie — wycofuję'; END IF;
  IF NOT has_function_privilege('quolino', 'public.trip_draft_save(jsonb, jsonb, text, text, jsonb, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'quolino nie może wywołać trip_draft_save — wycofuję';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Cofnięcie: przywrócić admin.admin_approve z trip-translate.sql i public.trip_draft_save z 2026-10-31-misja-wybor.sql;
--   DROP FUNCTION public.stops_icons_restore(text, jsonb); DROP FUNCTION public.stops_icons_of(text);
