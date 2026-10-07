-- Tłumaczenia wycieczek: eksport/zapis w formacie umiejętności quolino-trip-translate
-- oraz zlecenie tłumaczenia tworzone automatycznie przy akceptacji w panelu admina. 2026-10-07.
BEGIN;

CREATE OR REPLACE FUNCTION public.trip_export(p_slug text, p_lang text) RETURNS jsonb LANGUAGE sql STABLE AS $f$
  SELECT jsonb_build_object(
    'city_slug', p_slug, 'lang', p_lang,
    'city', (SELECT jsonb_build_object('title', title, 'region_label', region_label, 'subtitle', subtitle, 'lead', lead,
                    'good_to_know', good_to_know, 'hero_note', hero_note, 'local_food', local_food)
               FROM public.city_translations WHERE city_slug = p_slug AND lang = p_lang),
    'stops', coalesce((SELECT jsonb_agg(jsonb_build_object('stop_key', s.stop_key, 'stop_number', s.stop_number,
                    'category', s.category, 'name', t.name, 'desc_paragraphs', to_jsonb(t.desc_paragraphs),
                    'kids_box', t.kids_box, 'photo_task', t.photo_task, 'hint', t.hint, 'local_flavor', t.local_flavor,
                    'dress_code', t.dress_code, 'practical_note', t.practical_note) ORDER BY s.sort_order)
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
    INSERT INTO public.stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, photo_task, hint, local_flavor, dress_code, practical_note, updated_at)
    VALUES (v_id, p_lang, s->>'name', ARRAY(SELECT jsonb_array_elements_text(coalesce(s->'desc_paragraphs', '[]'))),
            s->>'kids_box', s->>'photo_task', s->>'hint', s->>'local_flavor', s->>'dress_code', s->>'practical_note', now())
    ON CONFLICT (stop_id, lang) DO UPDATE SET name = EXCLUDED.name, desc_paragraphs = EXCLUDED.desc_paragraphs,
       kids_box = EXCLUDED.kids_box, photo_task = EXCLUDED.photo_task, hint = EXCLUDED.hint,
       local_flavor = EXCLUDED.local_flavor, dress_code = EXCLUDED.dress_code,
       practical_note = EXCLUDED.practical_note, updated_at = now();
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

ALTER FUNCTION public.trip_export(text, text) OWNER TO quolino;
ALTER FUNCTION public.trip_apply_translation(text, text, jsonb) OWNER TO quolino;
REVOKE ALL ON FUNCTION public.trip_export(text, text), public.trip_apply_translation(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trip_export(text, text), public.trip_apply_translation(text, text, jsonb) TO quolino;

-- Akceptacja w panelu → zlecenie tłumaczenia w kolejce Hermesa (ops.jobs, worker claude)
CREATE OR REPLACE FUNCTION public.queue_translation(p_slug text, p_version int) RETURNS bigint
LANGUAGE plpgsql AS $f$
DECLARE v_id bigint;
BEGIN
  INSERT INTO ops.jobs (city_slug, kind, worker, request)
  VALUES ((SELECT slug FROM ops.cities WHERE slug = p_slug), 'translate', 'claude',
          'translate ' || p_slug || ' v' || p_version || ' — zatwierdzona; pl → en → pozostałe (trip-translate.mjs)')
  RETURNING id INTO v_id;
  RETURN v_id;
END $f$;
ALTER FUNCTION public.queue_translation(text, int) OWNER TO quolino;
REVOKE ALL ON FUNCTION public.queue_translation(text, int) FROM PUBLIC;

CREATE OR REPLACE FUNCTION admin.admin_approve(p_slug text, p_version int, p_note text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE d public.city_versions; pub public.city_versions; v_job bigint;
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
  PERFORM public.city_load_snapshot(p_slug, d.content);
  PERFORM public.publish_city(p_slug, true);
  UPDATE public.city_versions SET status = 'archived' WHERE city_slug = p_slug AND status = 'published';
  UPDATE public.city_versions SET status = 'published', published_at = now(), reviewed_at = now(), review_note = p_note
   WHERE id = d.id;
  v_job := public.queue_translation(p_slug, p_version);
  RETURN json_build_object('city_slug', p_slug, 'version', p_version, 'status', 'published', 'translation_job', v_job);
END $f$;
COMMIT;
