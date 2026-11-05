-- JP 2026-11-05: „przejrzyj uwagi, jeśli nie ma błędów krytycznych — zatwierdź”. Przegląd flag kontroli (Claude):
--   Asyż v14: 79/80 flag rozstrzygniętych wcześniej; ostatnia (misja w lodziarni zależna od dziennej oferty) → popraw wg propozycji.
--     Ta sama runda wyrówna godziny przystanków do planu dnia (gemini-draft: planTimesFromText).
--   Spello v22: błędy kontroli (35, zdania-wypełniacze „brak informacji…”, składnia, misje) → popraw wg propozycji;
--     ostrzeżenia: „Fakt bez źródła” (fakty z opublikowanej wersji) → zostaw; pozostałe (wskazówki, agregatory w źródłach lodziarni,
--     godziny lodziarni, reklama) → popraw wg propozycji. Jedna prośba na trasę; weryfikacja jak po kliknięciu w panelu.
DO $$
DECLARE s text; v int; rv jsonb; ids bigint[]; rid bigint; i int; e jsonb; b text;
BEGIN
  FOREACH s IN ARRAY ARRAY['asyz', 'spello'] LOOP
    SELECT version, review INTO v, rv FROM public.city_versions WHERE city_slug = s AND status = 'draft' ORDER BY version DESC LIMIT 1;
    IF v IS NULL OR (s = 'asyz' AND v <> 14) OR (s = 'spello' AND v <> 22) THEN RAISE NOTICE '% : inna wersja (%), pomijam', s, v; CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM public.draft_comments WHERE city_slug = s AND city_version = v AND field LIKE 'review.%') THEN CONTINUE; END IF;
    ids := '{}';
    FOR i IN 0 .. coalesce(jsonb_array_length(rv->'errors'), 0) - 1 LOOP
      e := rv->'errors'->i;
      IF coalesce((e->>'resolved')::boolean, false) THEN CONTINUE; END IF;
      INSERT INTO public.draft_comments (city_slug, city_version, stop_key, field, field_label, body, status)
      VALUES (s, v, e->>'stop_key', 'review.e.' || i, 'pytanie z kontroli', '✓ Popraw według propozycji', 'sent') RETURNING id INTO rid;
      ids := ids || rid;
    END LOOP;
    FOR i IN 0 .. coalesce(jsonb_array_length(rv->'warnings'), 0) - 1 LOOP
      e := rv->'warnings'->i;
      IF coalesce((e->>'resolved')::boolean, false) THEN CONTINUE; END IF;
      b := CASE WHEN e->>'problem' LIKE 'Fakt bez źródła%' THEN '✗ Zostaw bez zmian' ELSE '✓ Popraw według propozycji' END;
      INSERT INTO public.draft_comments (city_slug, city_version, stop_key, field, field_label, body, status)
      VALUES (s, v, e->>'stop_key', 'review.w.' || i, 'pytanie z kontroli', b, 'sent') RETURNING id INTO rid;
      ids := ids || rid;
    END LOOP;
    IF cardinality(ids) = 0 THEN CONTINUE; END IF;
    INSERT INTO public.draft_revision_requests (city_slug, city_version, comment_ids) VALUES (s, v, ids) RETURNING id INTO rid;
    UPDATE public.draft_comments SET request_id = rid WHERE id = ANY(ids);
    PERFORM pg_notify('draft_revision', s || ':' || rid);
    RAISE NOTICE '% v%: % odpowiedzi, prośba #%', s, v, cardinality(ids), rid;
  END LOOP;
END $$;
