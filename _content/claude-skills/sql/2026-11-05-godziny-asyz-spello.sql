-- JP 2026-11-05: „przejrzyj uwagi, jeśli nie ma błędów krytycznych — zatwierdź Asyż i Spello”.
-- Przegląd: Asyż v13 ma plan niewykonalny (14:30 start, a Foro Romano/Rocca zamykają 17:00, San Francesco 17:45) i time_label
-- niezgodne z planem dnia (10 błędów walidatora); poprawka Spello #16 padła na błędzie JSON (opublikowane Spello ma kolację
-- o 14:45 przy lokalu czynnym 13:00-14:30). Konkretne godziny policzone z godzin otwarcia w trasie → nowa prośba o poprawkę.
DO $$
DECLARE v int; cid bigint; rid bigint; b text;
BEGIN
  -- ASYŻ (cały dzień, 9 przystanków: start przed południem, finał kolacją; popołudnie/wieczór jako akcent dnia)
  IF NOT EXISTS (SELECT 1 FROM public.draft_comments WHERE city_slug = 'asyz' AND draft_comments.body LIKE 'Godziny wg otwarcia (JP 2026-11-05)%') THEN
    SELECT max(version) INTO v FROM public.city_versions WHERE city_slug = 'asyz' AND trip IS NOT NULL;
    b := 'Godziny wg otwarcia (JP 2026-11-05). Poprzednia poprawka zmieniła tylko tekst planu dnia, a meta.stops.*.time_label zostały 09:00-16:00, '
      || 'i start 14:30 jest niewykonalny (Foro Romano i Rocca Maggiore zamykają 17:00, San Francesco 17:45). To trasa całodniowa: '
      || 'ustaw DOKŁADNIE te godziny w meta.stops.<i>.time_label ORAZ na początku każdej linii content.day_plan: '
      || 'parking-mojano 10:30; basilica-di-santa-chiara 10:45 (zamyka 12:00); cattedrale-di-san-rufino 11:45 (zamyka 13:00); '
      || 'rocca-maggiore 13:00; tempio-di-minerva 14:35; foro-romano 15:05; basilica-di-san-francesco 16:00; '
      || 'gelateria-leccapaletta 18:00; trattoria-pallotta 19:30 (kuchnia od 19:00). meta.city.duration_hours = 10. '
      || 'Kolejność przystanków bez zmian. Popraw zdania, które mówią o starcie 14:30, braku obiadu albo zachodzie słońca przy kolacji '
      || '(zimą słońce zachodzi ok. 17:00; o zachodzie pisz tylko jako o porze roku, np. latem). Po Forum i przed lodami wieczorny spacer '
      || 'po Piazza del Comune. Nic poza tym nie zmieniaj.';
    INSERT INTO public.draft_comments (city_slug, city_version, stop_key, field, field_label, body, status)
    VALUES ('asyz', v, NULL, 'day_plan', 'Plan dnia', b, 'sent') RETURNING id INTO cid;
    INSERT INTO public.draft_revision_requests (city_slug, city_version, comment_ids) VALUES ('asyz', v, ARRAY[cid]) RETURNING id INTO rid;
    UPDATE public.draft_comments SET request_id = rid WHERE id = cid;
    PERFORM pg_notify('draft_revision', 'asyz:' || rid);
  END IF;
  -- SPELLO (popołudnie, kolejność bez zmian)
  IF NOT EXISTS (SELECT 1 FROM public.draft_comments WHERE city_slug = 'spello' AND draft_comments.body LIKE 'Godziny wg otwarcia (JP 2026-11-05)%') THEN
    SELECT max(version) INTO v FROM public.city_versions WHERE city_slug = 'spello' AND trip IS NOT NULL;
    b := 'Godziny wg otwarcia (JP 2026-11-05). Trasa popołudniowa z kolacją jako finałem (teraz kolacja jest o 14:45, a lokal ma kuchnię 13:00-14:30 i od 19:30). '
      || 'Ustaw DOKŁADNIE te godziny w meta.stops.<i>.time_label ORAZ na początku każdej linii content.day_plan: '
      || 'parking-via-della-liberazione 14:45; villa-dei-mosaici 15:00 (otwarte 15:00-17:00); porta-consolare 15:55; via-borgo-san-sisto 16:20; '
      || 'pinacoteca-civica-spello 16:45 (zamyka 17:30); gelateria-la-paola 17:35; porta-venere-torri-di-properzio 18:05; '
      || 'belvedere-arco-romano 18:30; ristorante-la-cantina-di-spello 19:30. meta.city.duration_hours = 6, meta.city.duration_type = half_day. '
      || 'Kolejność przystanków bez zmian. Popraw zdania, które mówią o porannym starcie, obiedzie albo południu. Belvedere: złota godzina latem, '
      || 'zimą o tej porze już ciemno; nie obiecuj zachodu słońca przy kolacji. Nic poza tym nie zmieniaj.';
    INSERT INTO public.draft_comments (city_slug, city_version, stop_key, field, field_label, body, status)
    VALUES ('spello', v, NULL, 'day_plan', 'Plan dnia', b, 'sent') RETURNING id INTO cid;
    INSERT INTO public.draft_revision_requests (city_slug, city_version, comment_ids) VALUES ('spello', v, ARRAY[cid]) RETURNING id INTO rid;
    UPDATE public.draft_comments SET request_id = rid WHERE id = cid;
    PERFORM pg_notify('draft_revision', 'spello:' || rid);
  END IF;
END $$;
