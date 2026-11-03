-- 2026-11-03 (JP: „dlaczego spello jest zablokowany? dałem decyzje dla poprawek”): bramka publikacji nie bierze pod uwagę
-- zakończonej prośby o poprawkę, której wynik został już opublikowany. Reszta bramki bez zmian (2026-11-01-publikacja-bramka.sql).
BEGIN;
CREATE OR REPLACE FUNCTION admin.publish_gate(p_slug text, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE d public.city_versions; rq public.draft_revision_requests; e jsonb; k text; i int; j int; np int; m text[]; fid text;
        n_flags int := 0; n_errors int := 0; n_unsent int := 0; n_place int := 0; reasons jsonb := '[]'::jsonb; vf jsonb; rq_txt text;
        rq_block boolean := false; answered boolean; processed boolean;
BEGIN
  SELECT * INTO d FROM public.city_versions WHERE city_slug = p_slug AND version = p_version;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reasons', jsonb_build_array(jsonb_build_object('k', 'missing', 't', 'Nie ma szkicu ' || p_slug || ' v' || p_version))); END IF;

  -- a) + d) flagi kontroli tej wersji (rozstrzygnięte automatycznie — z kluczem `resolved` — pomijamy)
  FOREACH k IN ARRAY ARRAY['e', 'w'] LOOP
    i := -1;
    FOR e IN SELECT x FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d.review -> CASE k WHEN 'e' THEN 'errors' ELSE 'warnings' END) = 'array'
                                                     THEN d.review -> CASE k WHEN 'e' THEN 'errors' ELSE 'warnings' END ELSE '[]'::jsonb END) x LOOP
      i := i + 1;
      IF jsonb_typeof(e) = 'object' AND coalesce(e -> 'resolved', 'null'::jsonb) NOT IN ('null'::jsonb, 'false'::jsonb, '""'::jsonb, '0'::jsonb) THEN CONTINUE; END IF;
      -- stara uwaga zbiorcza „Fakty bez źródła (K): a; b; c” → osobna flaga na każdy fragment (jak ReviewWhere.splitAggregate)
      m := CASE WHEN jsonb_typeof(e) = 'object' THEN regexp_match(coalesce(e ->> 'problem', ''), '^(\[[^\]]+\]\s*)?Fakty bez źródła \((\d+)\)[^:]*:\s*(.+)$') END;
      np := CASE WHEN m IS NULL THEN 0 ELSE (SELECT count(*) FROM regexp_split_to_table(m[3], ';\s+') pt(part) WHERE btrim(pt.part) <> '') END;
      FOR j IN 0 .. greatest(np, 1) - 1 LOOP
        fid := 'review.' || k || '.' || i || CASE WHEN np > 0 THEN '.' || j ELSE '' END;
        SELECT count(*) > 0, coalesce(bool_or(status IN ('done', 'rejected')), false) INTO answered, processed
          FROM public.draft_comments WHERE city_slug = p_slug AND city_version = p_version AND field = fid;
        IF NOT answered THEN n_flags := n_flags + 1; END IF;
        IF k = 'e' AND NOT processed THEN n_errors := n_errors + 1; END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  IF n_flags > 0 THEN reasons := reasons || jsonb_build_object('k', 'flags', 't', admin.pl3(n_flags, 'nierozstrzygnięta flaga', 'nierozstrzygnięte flagi', 'nierozstrzygniętych flag') || ' kontroli'); END IF;
  IF n_errors > 0 THEN reasons := reasons || jsonb_build_object('k', 'errors', 't', 'walidator: ' || admin.pl3(n_errors, 'błąd blokujący', 'błędy blokujące', 'błędów blokujących') || ' — popraw je (odpowiedź → wyślij do poprawki)'); END IF;

  -- b) uwagi niewysłane / bez przystanku (całe miasto — uwagi do starszej wersji też idą jedną paczką)
  SELECT count(*) FILTER (WHERE status = 'new'), count(*) FILTER (WHERE status = 'needs_jp') INTO n_unsent, n_place
    FROM public.draft_comments WHERE city_slug = p_slug;
  IF n_unsent > 0 THEN reasons := reasons || jsonb_build_object('k', 'unsent', 't', admin.pl3(n_unsent, 'niewysłana uwaga', 'niewysłane uwagi', 'niewysłanych uwag') || ' — wyślij je do poprawki'); END IF;
  IF n_place > 0 THEN reasons := reasons || jsonb_build_object('k', 'unplaced', 't', admin.pl3(n_place, 'uwaga czeka', 'uwagi czekają', 'uwag czeka') || ' na wskazanie przystanku'); END IF;

  -- c) ostatnia prośba o poprawkę miasta
  SELECT * INTO rq FROM public.draft_revision_requests WHERE city_slug = p_slug ORDER BY id DESC LIMIT 1;
  IF FOUND THEN
    vf := CASE WHEN jsonb_typeof(to_jsonb(rq) -> 'verify') = 'object' THEN to_jsonb(rq) -> 'verify' END;   -- kolumna verify z 2026-10-31-weryfikacja-uwag.sql
    -- 2026-11-03: prośba zakończona (done/failed), po której była już publikacja tej trasy, nie blokuje — JP opublikował jej wynik
    -- (Spello: #7 „9 z 10” z 31.10 blokowała v19 strażników, choć v17 z tej poprawki JP opublikował tego samego wieczoru)
    IF rq.status IN ('done', 'failed') AND EXISTS (SELECT 1 FROM public.city_versions v WHERE v.city_slug = p_slug AND v.published_at IS NOT NULL
         AND v.published_at > coalesce(rq.updated_at, rq.created_at) AND v.version >= coalesce(rq.result_version, rq.city_version, 0)) THEN
      NULL;
    ELSIF rq.status IN ('new', 'working') THEN
      rq_txt := 'poprawka #' || rq.id || ' w toku (' || CASE rq.status WHEN 'new' THEN 'w kolejce' ELSE 'Hermes nanosi' END || ') — poczekaj na nową wersję i weryfikację';
    ELSIF rq.status = 'failed' THEN
      rq_txt := 'poprawka #' || rq.id || ' nieudana — wyślij uwagi ponownie';
    ELSIF rq.status = 'done' AND vf IS NOT NULL AND (vf -> 'ready') IS DISTINCT FROM 'true'::jsonb THEN
      rq_txt := 'weryfikacja poprawki #' || rq.id || ': ' || coalesce(vf ->> 'applied', '?') || ' z ' || coalesce(vf ->> 'total', '?') || ' naniesionych'
             || CASE WHEN coalesce(nullif(vf ->> 'new_errors', '')::numeric, 0) > 0 THEN ', ' || admin.pl3((vf ->> 'new_errors')::numeric::int, 'nowy błąd', 'nowe błędy', 'nowych błędów') ELSE '' END
             || CASE WHEN (vf -> 'pending_ai') = 'true'::jsonb THEN ' (ocena wstępna — pełna po odnowieniu limitu AI)' ELSE '' END || ' — nie wszystko zielone';
    ELSIF rq.status = 'done' AND vf IS NULL AND rq.result_version IS NOT NULL AND coalesce(rq.updated_at, rq.created_at) > now() - interval '2 hours' THEN
      rq_txt := 'poprawka #' || rq.id || ' naniesiona w v' || rq.result_version || ' — czeka na weryfikację (kilka minut)';
    END IF;
    IF rq_txt IS NOT NULL THEN rq_block := true; reasons := reasons || jsonb_build_object('k', 'request', 't', rq_txt); END IF;
  END IF;

  RETURN jsonb_build_object('ok', jsonb_array_length(reasons) = 0, 'reasons', reasons, 'flags_open', n_flags, 'errors', n_errors,
    'unsent', n_unsent, 'unplaced', n_place, 'request_id', rq.id, 'request_status', rq.status, 'request_blocks', rq_block,
    'translation_est', admin.translation_cost_estimate());
END $f$;
ALTER FUNCTION admin.publish_gate(text, int) OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.publish_gate(text, int) FROM PUBLIC;
COMMIT;
