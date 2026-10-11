-- Fakty przystanku w języku czytelnika (2026-10-11).
-- Rok/epoka, bilet, czas zwiedzania i godziny siedziały tylko w public.stops (po polsku),
-- więc każda wersja językowa pokazywała je po polsku. Teraz: polski zostaje w stops (źródło),
-- tłumaczenia w stop_translations; strona bierze tłumaczenie, a gdy go brak — polski.
BEGIN;

ALTER TABLE public.stop_translations
  ADD COLUMN IF NOT EXISTS year_built text,
  ADD COLUMN IF NOT EXISTS price text,
  ADD COLUMN IF NOT EXISTS visit_duration text,
  ADD COLUMN IF NOT EXISTS opening_hours text;

CREATE OR REPLACE FUNCTION public.trip_export(p_slug text, p_lang text) RETURNS jsonb LANGUAGE sql STABLE AS $f$
  SELECT jsonb_build_object(
    'city_slug', p_slug, 'lang', p_lang,
    'city', (SELECT jsonb_build_object('title', title, 'region_label', region_label, 'subtitle', subtitle, 'lead', lead,
                    'good_to_know', good_to_know, 'hero_note', hero_note, 'local_food', local_food)
               FROM public.city_translations WHERE city_slug = p_slug AND lang = p_lang),
    'stops', coalesce((SELECT jsonb_agg(jsonb_build_object('stop_key', s.stop_key, 'stop_number', s.stop_number,
                    'category', s.category, 'name', t.name, 'desc_paragraphs', to_jsonb(t.desc_paragraphs),
                    'kids_box', t.kids_box, 'photo_task', t.photo_task, 'hint', t.hint, 'local_flavor', t.local_flavor,
                    'dress_code', t.dress_code, 'practical_note', t.practical_note,
                    -- fakty przystanku: polski = kolumny stops, inne języki = stop_translations
                    'year_built', CASE WHEN p_lang = 'pl' THEN s.year_built ELSE t.year_built END,
                    'price', CASE WHEN p_lang = 'pl' THEN s.price ELSE t.price END,
                    'visit_duration', CASE WHEN p_lang = 'pl' THEN s.visit_duration ELSE t.visit_duration END,
                    'opening_hours', CASE WHEN p_lang = 'pl' THEN s.opening_hours ELSE t.opening_hours END) ORDER BY s.sort_order)
               FROM public.stops s JOIN public.stop_translations t ON t.stop_id = s.id AND t.lang = p_lang
              WHERE s.city_slug = p_slug), '[]'::jsonb),
    'day_plan', coalesce((SELECT jsonb_agg(jsonb_build_object('sort_order', sort_order, 'time_label', time_label,
                    'stop_key', stop_key, 'description', description) ORDER BY sort_order)
               FROM public.day_plan WHERE city_slug = p_slug AND lang = p_lang), '[]'::jsonb),
    'emergency_points', coalesce((SELECT jsonb_agg(jsonb_build_object('sort_order', sort_order, 'type', type,
                    'maps_query', maps_query, 'label', label, 'description', description) ORDER BY sort_order)
               FROM public.emergency_points WHERE city_slug = p_slug AND lang = p_lang), '[]'::jsonb))
$f$;

-- Zapis tłumaczenia. Struktura sprawdzana drugi raz po stronie bazy (pierwszy: check_translation.py).
CREATE OR REPLACE FUNCTION public.trip_apply_translation(p_slug text, p_lang text, j jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $f$
DECLARE s jsonb; v_id int; n_stops int := 0; pl_keys text[]; j_keys text[];
BEGIN
  IF p_lang = 'pl' THEN RAISE EXCEPTION 'Polski to źródło — nie nadpisuję go tłumaczeniem'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.languages WHERE code = p_lang) THEN RAISE EXCEPTION 'Nieznany język %', p_lang; END IF;
  IF (SELECT status FROM public.cities WHERE slug = p_slug) IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'Tłumaczymy tylko wycieczki zatwierdzone (published): %', p_slug;
  END IF;
  IF j ? '_notes' THEN RAISE EXCEPTION '_notes nie są tłumaczone'; END IF;
  SELECT array_agg(s2.stop_key ORDER BY s2.sort_order) INTO pl_keys FROM public.stops s2
    JOIN public.stop_translations t ON t.stop_id = s2.id AND t.lang = 'pl' WHERE s2.city_slug = p_slug;
  SELECT array_agg(x->>'stop_key' ORDER BY o) INTO j_keys FROM jsonb_array_elements(j->'stops') WITH ORDINALITY e(x, o);
  IF pl_keys IS DISTINCT FROM j_keys THEN
    RAISE EXCEPTION 'Przystanki tłumaczenia (%) ≠ przystanki wycieczki (%)', j_keys, pl_keys;
  END IF;

  INSERT INTO public.city_translations (city_slug, lang, title, region_label, subtitle, lead, good_to_know, hero_note, local_food, updated_at)
  VALUES (p_slug, p_lang, j->'city'->>'title', j->'city'->>'region_label', j->'city'->>'subtitle', j->'city'->>'lead',
          j->'city'->>'good_to_know', j->'city'->>'hero_note', j->'city'->>'local_food', now())
  ON CONFLICT (city_slug, lang) DO UPDATE SET title = EXCLUDED.title, region_label = EXCLUDED.region_label,
     subtitle = EXCLUDED.subtitle, lead = EXCLUDED.lead, good_to_know = EXCLUDED.good_to_know,
     hero_note = EXCLUDED.hero_note, local_food = EXCLUDED.local_food, updated_at = now();

  FOR s IN SELECT * FROM jsonb_array_elements(j->'stops') LOOP
    SELECT id INTO v_id FROM public.stops WHERE city_slug = p_slug AND stop_key = s->>'stop_key';
    IF jsonb_array_length(coalesce(s->'desc_paragraphs', '[]')) <>
       (SELECT coalesce(array_length(desc_paragraphs, 1), 0) FROM public.stop_translations WHERE stop_id = v_id AND lang = 'pl') THEN
      RAISE EXCEPTION 'Przystanek %: inna liczba akapitów niż w polskim', s->>'stop_key';
    END IF;
    INSERT INTO public.stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, photo_task, hint, local_flavor, dress_code, practical_note,
                                         year_built, price, visit_duration, opening_hours, updated_at)
    VALUES (v_id, p_lang, s->>'name', ARRAY(SELECT jsonb_array_elements_text(coalesce(s->'desc_paragraphs', '[]'))),
            s->>'kids_box', s->>'photo_task', s->>'hint', s->>'local_flavor', s->>'dress_code', s->>'practical_note',
            s->>'year_built', s->>'price', s->>'visit_duration', s->>'opening_hours', now())
    ON CONFLICT (stop_id, lang) DO UPDATE SET name = EXCLUDED.name, desc_paragraphs = EXCLUDED.desc_paragraphs,
       kids_box = EXCLUDED.kids_box, photo_task = EXCLUDED.photo_task, hint = EXCLUDED.hint,
       local_flavor = EXCLUDED.local_flavor, dress_code = EXCLUDED.dress_code,
       practical_note = EXCLUDED.practical_note,
       -- brak klucza w JSON (starsze tłumaczenie) = zostawiamy dotychczasowy fakt
       year_built = CASE WHEN s ? 'year_built' THEN EXCLUDED.year_built ELSE public.stop_translations.year_built END,
       price = CASE WHEN s ? 'price' THEN EXCLUDED.price ELSE public.stop_translations.price END,
       visit_duration = CASE WHEN s ? 'visit_duration' THEN EXCLUDED.visit_duration ELSE public.stop_translations.visit_duration END,
       opening_hours = CASE WHEN s ? 'opening_hours' THEN EXCLUDED.opening_hours ELSE public.stop_translations.opening_hours END,
       updated_at = now();
    n_stops := n_stops + 1;
  END LOOP;

  DELETE FROM public.day_plan WHERE city_slug = p_slug AND lang = p_lang;
  INSERT INTO public.day_plan (city_slug, lang, time_label, description, sort_order, stop_key)
  SELECT p_slug, p_lang, x->>'time_label', x->>'description', (x->>'sort_order')::smallint, x->>'stop_key'
    FROM jsonb_array_elements(coalesce(j->'day_plan', '[]')) x;

  DELETE FROM public.emergency_points WHERE city_slug = p_slug AND lang = p_lang;
  INSERT INTO public.emergency_points (city_slug, lang, type, label, description, maps_query, sort_order)
  SELECT p_slug, p_lang, x->>'type', x->>'label', x->>'description', x->>'maps_query', (x->>'sort_order')::smallint
    FROM jsonb_array_elements(coalesce(j->'emergency_points', '[]')) x;

  RETURN jsonb_build_object('city_slug', p_slug, 'lang', p_lang, 'stops', n_stops);
END $f$;


COMMIT;
NOTIFY pgrst, 'reload schema';
