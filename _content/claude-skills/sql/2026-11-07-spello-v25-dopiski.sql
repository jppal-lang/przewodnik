-- Spello v25 (JP 2026-11-05: „bez błędów krytycznych zatwierdź”): kontrola poprawki zgłosiła 4 błędy walidatora — za krótkie opisy po
-- usunięciu zdań redakcyjnych i brak linku do sprawdzenia przy lodziarni. Jedna prośba o poprawkę z konkretnymi uwagami (tylko gdy v25 to nadal szkic).
DO $$
DECLARE ids bigint[] := '{}'; rid bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.city_versions WHERE city_slug = 'spello' AND version = 25 AND status = 'draft') THEN RAISE NOTICE 'spello v25 nie jest szkicem — pomijam'; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.draft_comments WHERE city_slug = 'spello' AND city_version = 25 AND field_label = 'kontrola poprawki (Claude)') THEN RETURN; END IF;
  INSERT INTO public.draft_comments (city_slug, city_version, stop_key, field, field_label, body, status)
  VALUES ('spello', 25, 'via-borgo-san-sisto', NULL, 'kontrola poprawki (Claude)',
          'Opis rodzica ma 108 słów, minimum to 2 akapity i 120 słów. Dopisz 1–2 zdania z researchu tej trasy (co widać w zaułku, skąd nazwa, historia), bez nowych faktów spoza źródeł i bez superlatywów.', 'sent')
  RETURNING id INTO rid; ids := ids || rid;
  INSERT INTO public.draft_comments (city_slug, city_version, stop_key, field, field_label, body, status)
  VALUES ('spello', 25, 'porta-venere-torri-di-properzio', NULL, 'kontrola poprawki (Claude)',
          'Opis rodzica: 153 słowa, minimum 3 akapity i 180 słów, a akapity 2–4 mają po 28–32 słowa (minimum 40 słów i 2 zdania). Połącz krótkie akapity albo rozbuduj je faktami z researchu (budowa bramy, wieże Properzia, co widać z miejsca), bez faktów spoza źródeł.', 'sent')
  RETURNING id INTO rid; ids := ids || rid;
  INSERT INTO public.draft_comments (city_slug, city_version, stop_key, field, field_label, body, status)
  VALUES ('spello', 25, 'gelateria-la-paola', NULL, 'kontrola poprawki (Claude)',
          'Brak verify_url. Wstaw link do własnej strony lodziarni (zasada: przy lokalach tylko ich własna strona). Jeśli lodziarnia nie ma własnej strony, ustaw verify_url na null i w practical_note napisz „godziny sprawdź na miejscu”.', 'sent')
  RETURNING id INTO rid; ids := ids || rid;
  INSERT INTO public.draft_revision_requests (city_slug, city_version, comment_ids) VALUES ('spello', 25, ids) RETURNING id INTO rid;
  UPDATE public.draft_comments SET request_id = rid WHERE id = ANY (ids);
END $$;
