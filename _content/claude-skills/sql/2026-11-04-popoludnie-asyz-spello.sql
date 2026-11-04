-- JP 2026-11-04: Asyż i Spello mają być wycieczkami popołudniowymi — kolacja o zachodzie słońca, gwarne uliczki.
-- Uwaga JP do całej trasy (plan dnia) + prośba o poprawkę → draft-comments.mjs (cron) robi nową wersję szkicu.
-- Opublikowane Spello zostaje na stronie do czasu zatwierdzenia nowej wersji. Jednorazowe (NOT EXISTS).
DO $$
DECLARE s text; v int; cid bigint; rid bigint;
  body text := 'Przestaw trasę na popołudnie (JP 2026-11-04): to ma być włoskie popołudnie, nie zwiedzanie w samo południe. '
    || 'Parking ok. 14:30-15:30, muzea i wnętrza najpierw (sprawdź, czy zdążymy przed zamknięciem), potem spacer, lody albo aperitivo, '
    || 'punkt widokowy w złotej godzinie, finał = kolacja ok. 19:30-20:00 w klimacie zachodu słońca i gwarnych knajp. '
    || 'Bez obiadu w środku dnia. Popraw time_label, plan dnia i wszystkie zdania w tekstach, które wspominają porę dnia, upał w południe albo obiad. '
    || 'Kolejność przystanków zmień tylko, jeśli godziny otwarcia tego wymagają.';
BEGIN
  FOREACH s IN ARRAY ARRAY['asyz', 'spello'] LOOP
    IF EXISTS (SELECT 1 FROM public.draft_comments WHERE city_slug = s AND body LIKE 'Przestaw trasę na popołudnie (JP 2026-11-04)%') THEN CONTINUE; END IF;
    SELECT max(version) INTO v FROM public.city_versions WHERE city_slug = s AND trip IS NOT NULL;
    IF v IS NULL THEN RAISE NOTICE 'brak trasy %', s; CONTINUE; END IF;
    INSERT INTO public.draft_comments (city_slug, city_version, stop_key, field, field_label, body, status)
    VALUES (s, v, NULL, 'day_plan', 'Plan dnia', body, 'sent') RETURNING id INTO cid;
    INSERT INTO public.draft_revision_requests (city_slug, city_version, comment_ids)
    VALUES (s, v, ARRAY[cid]) RETURNING id INTO rid;
    UPDATE public.draft_comments SET request_id = rid WHERE id = cid;
    PERFORM pg_notify('draft_revision', s || ':' || rid);
  END LOOP;
END $$;
