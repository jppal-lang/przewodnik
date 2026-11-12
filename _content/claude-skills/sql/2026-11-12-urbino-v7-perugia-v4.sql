-- JP 2026-11-12: „tak, i przejdźmy do kolejnej trasy” (na: Spello zatwierdzić, Urbino jedna krótka poprawka, potem Perugia).
-- 1) Urbino v7: 4 konkretne uwagi (link Google Maps przy lodziarni, lokal Il Buco bez źródła, quest na parkingu, porfir w zadaniu foto).
-- 2) Perugia v4: odpowiedzi na flagi kontroli jak przy Asyżu/Spello (2026-11-05-flagi-asyz-spello-b.sql):
--    błędy → popraw według propozycji; ostrzeżenia „Fakt bez źródła” → zostaw; pozostałe ostrzeżenia → popraw według propozycji.
DO $$
DECLARE ids bigint[] := '{}'; rid bigint; v int; rv jsonb; i int; e jsonb; b text;
BEGIN
  -- 1) Urbino v7
  IF EXISTS (SELECT 1 FROM public.city_versions WHERE city_slug = 'urbino' AND version = 7 AND status = 'draft')
     AND NOT EXISTS (SELECT 1 FROM public.draft_comments WHERE city_slug = 'urbino' AND city_version = 7 AND field_label = 'kontrola przed zatwierdzeniem (Claude)') THEN
    INSERT INTO public.draft_comments (city_slug, city_version, stop_key, field, field_label, body, status) VALUES
      ('urbino', 7, 'sorbetto-del-duca', NULL, 'kontrola przed zatwierdzeniem (Claude)',
       'Usuń link do Google Maps z website i verify_url (zasada: przy lokalach tylko ich własna strona, inaczej bez linku). Jeśli źródła nie podają własnej strony lodziarni, ustaw oba pola na null, a w practical_note: „godziny sprawdź na miejscu”.', 'sent')
      RETURNING id INTO rid; ids := ids || rid;
    INSERT INTO public.draft_comments (city_slug, city_version, stop_key, field, field_label, body, status) VALUES
      ('urbino', 7, 'duomo-di-urbino', NULL, 'kontrola przed zatwierdzeniem (Claude)',
       'Usuń lokal „Il Buco” z practical_note i z planu dnia: nie ma go w źródłach, nie ma telefonu ani strony. Obiad zostaje tylko w zweryfikowanym przystanku Taverna degli Artisti.', 'sent')
      RETURNING id INTO rid; ids := ids || rid;
    INSERT INTO public.draft_comments (city_slug, city_version, stop_key, field, field_label, body, status) VALUES
      ('urbino', 7, 'parking-borgo-mercatale', NULL, 'kontrola przed zatwierdzeniem (Claude)',
       'Zasada JP: na parkingu nie ma questu. Usuń kids_box, kids_choice, hint i photo_task tego przystanku (parking nie jest wyjątkowym miejscem).', 'sent')
      RETURNING id INTO rid; ids := ids || rid;
    INSERT INTO public.draft_comments (city_slug, city_version, stop_key, field, field_label, body, status) VALUES
      ('urbino', 7, 'casa-natale-di-raffaello', NULL, 'kontrola przed zatwierdzeniem (Claude)',
       'Zadanie foto wymaga porfiru, którego nie ma w opisie ani w lokalnym smaczku, więc dziecko go nie rozpozna. Przepisz zadanie tak, żeby szukało tego, co opis wprost pokazuje (kamień do rozcierania barwników), bez słowa „porfir”, chyba że źródło je podaje i dopiszesz je do opisu.', 'sent')
      RETURNING id INTO rid; ids := ids || rid;
    INSERT INTO public.draft_revision_requests (city_slug, city_version, comment_ids) VALUES ('urbino', 7, ids) RETURNING id INTO rid;
    UPDATE public.draft_comments SET request_id = rid WHERE id = ANY (ids);
    PERFORM pg_notify('draft_revision', 'urbino:' || rid);
    RAISE NOTICE 'urbino v7: prośba #%', rid;
  END IF;

  -- 2) Perugia v4
  SELECT version, review INTO v, rv FROM public.city_versions WHERE city_slug = 'perugia' AND status = 'draft' ORDER BY version DESC LIMIT 1;
  IF v = 4 AND NOT EXISTS (SELECT 1 FROM public.draft_comments WHERE city_slug = 'perugia' AND city_version = 4 AND field LIKE 'review.%') THEN
    ids := '{}';
    FOR i IN 0 .. coalesce(jsonb_array_length(rv->'errors'), 0) - 1 LOOP
      e := rv->'errors'->i;
      IF coalesce(e->'resolved', 'null'::jsonb) NOT IN ('null'::jsonb, 'false'::jsonb) THEN CONTINUE; END IF;
      INSERT INTO public.draft_comments (city_slug, city_version, stop_key, field, field_label, body, status)
      VALUES ('perugia', 4, e->>'stop_key', 'review.e.' || i, 'pytanie z kontroli', '✓ Popraw według propozycji', 'sent') RETURNING id INTO rid;
      ids := ids || rid;
    END LOOP;
    FOR i IN 0 .. coalesce(jsonb_array_length(rv->'warnings'), 0) - 1 LOOP
      e := rv->'warnings'->i;
      IF coalesce(e->'resolved', 'null'::jsonb) NOT IN ('null'::jsonb, 'false'::jsonb) THEN CONTINUE; END IF;
      b := CASE WHEN e->>'problem' LIKE 'Fakt bez źródła%' THEN '✗ Zostaw bez zmian' ELSE '✓ Popraw według propozycji' END;
      INSERT INTO public.draft_comments (city_slug, city_version, stop_key, field, field_label, body, status)
      VALUES ('perugia', 4, e->>'stop_key', 'review.w.' || i, 'pytanie z kontroli', b, 'sent') RETURNING id INTO rid;
      ids := ids || rid;
    END LOOP;
    IF cardinality(ids) > 0 THEN
      INSERT INTO public.draft_revision_requests (city_slug, city_version, comment_ids) VALUES ('perugia', 4, ids) RETURNING id INTO rid;
      UPDATE public.draft_comments SET request_id = rid WHERE id = ANY (ids);
      PERFORM pg_notify('draft_revision', 'perugia:' || rid);
      RAISE NOTICE 'perugia v4: % odpowiedzi, prośba #%', cardinality(ids), rid;
    END IF;
  ELSE RAISE NOTICE 'perugia: wersja % lub odpowiedzi już są — pomijam', v;
  END IF;
END $$;
