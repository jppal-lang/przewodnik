-- Pytanie z wyborem odpowiedzi w misji dziecka (decyzja JP 2026-10-31).
-- „Misja, podpowiedź i w niektórych pytaniach 4 opcje do wyboru — jeśli źle, wstrzymaj wybór na 3 s i pokaż Quo, który się zastanawia.”
--
-- Pole OPCJONALNE stop_translations.kids_choice = {"options": ["…", "…", "…", "…"], "correct": 0..3}
--   (dokładnie 4 różne niepuste opcje, poprawna = indeks w options). NULL = misja jak dotąd (wsteczna zgodność).
--   Strona (city.html + kid-choice.js) pokazuje przyciski tylko w widoku dziecka; kolejność tasuje przeglądarka.
--
-- Przepływ danych:
--   szkic (gemini-draft → trip_draft_save): content.stops.<klucz>.kids_choice → po import_city() dopisywane do wiersza PL
--     (import_city nie zna nowego pola — tu je uzupełniamy, zanim powstanie migawka city_snapshot);
--   zatwierdzenie (admin_approve → city_load_snapshot): migawka niesie całe wiersze stop_translations — SAMOKONTROLA poniżej
--     sprawdza na prawdziwej trasie, że kids_choice przechodzi migawkę w obie strony (inaczej transakcja się wycofuje);
--   strona: trip_full / trip_member / trip_kid (ops.trip_payload, to_jsonb wiersza) — bez zmian, pole przychodzi samo;
--     trip_sample (próbka dla gościa) ma listę dozwolonych kolumn — dopisujemy kids_choice;
--   tłumaczenia: trip_export oddaje kids_choice, trip_apply_translation zapisuje przetłumaczone opcje z indeksem poprawnej z PL.
--
-- Bez danych: istniejące trasy dostaną pytania przy następnej wersji. Bezpieczne do powtórzenia. W całości albo wcale.
-- Wymaga: trip-drafts.sql (trip_draft_save), 2026-10-11-stop-facts.sql (trip_export / trip_apply_translation),
--         2026-10-29-probka-przystanku-v2.sql (trip_sample).
BEGIN;

-- ── 1) kolumna i kształt ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kids_choice_ok(c jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $f$
  -- CASE pilnuje kolejności: funkcje tablicowe tylko na tablicy, liczba tylko na liczbie
  SELECT CASE
    WHEN c IS NULL OR c = 'null'::jsonb THEN true
    WHEN jsonb_typeof(c) <> 'object' OR jsonb_typeof(c -> 'options') IS DISTINCT FROM 'array'
         OR jsonb_typeof(c -> 'correct') IS DISTINCT FROM 'number' THEN false
    WHEN jsonb_array_length(c -> 'options') <> 4 OR (c ->> 'correct') !~ '^[0-3]$' THEN false
    ELSE (SELECT bool_and(jsonb_typeof(o) = 'string' AND btrim(o #>> '{}') <> '' AND length(o #>> '{}') <= 80)
                 AND count(DISTINCT lower(btrim(o #>> '{}'))) = 4
            FROM jsonb_array_elements(c -> 'options') o)
  END
$f$;
ALTER FUNCTION public.kids_choice_ok(jsonb) OWNER TO quolino;

ALTER TABLE public.stop_translations ADD COLUMN IF NOT EXISTS kids_choice jsonb;
DO $$BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stop_translations_kids_choice_shape') THEN
    ALTER TABLE public.stop_translations ADD CONSTRAINT stop_translations_kids_choice_shape CHECK (public.kids_choice_ok(kids_choice));
  END IF;
END$$;
COMMENT ON COLUMN public.stop_translations.kids_choice IS
  'Opcjonalne pytanie z wyborem do misji (JP 2026-10-31): {"options": [4 krótkie teksty], "correct": 0..3}. NULL = misja bez wyboru. '
  'Tylko pytania obserwacyjne z odpowiedzią w źródle/treści przystanku; tłumaczenie = te same opcje w języku, ten sam indeks.';

-- ── 2) szkic: kids_choice z plików szkicu do wiersza PL (po import_city, przed migawką) ────────────
CREATE OR REPLACE FUNCTION public.trip_draft_save(p_meta jsonb, p_content jsonb, p_note text DEFAULT NULL,
    p_source text DEFAULT 'draft', p_changes jsonb DEFAULT '[]', p_review jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE v_slug text := p_meta->'city'->>'slug'; snap jsonb; v int; v_prev int; tok text;
BEGIN
  IF v_slug IS NULL OR v_slug !~ '^[a-z0-9-]+$' THEN RAISE EXCEPTION 'Szkic: brak lub zły city.slug (%)', v_slug; END IF;
  IF coalesce(p_content->>'lang', 'pl') <> 'pl' THEN RAISE EXCEPTION 'Szkic powstaje po polsku (lang = pl)'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('city_versions:' || v_slug));

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

-- ── 3) tłumaczenia: eksport i zapis z kids_choice ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trip_export(p_slug text, p_lang text) RETURNS jsonb LANGUAGE sql STABLE AS $f$
  SELECT jsonb_build_object(
    'city_slug', p_slug, 'lang', p_lang,
    'city', (SELECT jsonb_build_object('title', title, 'region_label', region_label, 'subtitle', subtitle, 'lead', lead,
                    'good_to_know', good_to_know, 'hero_note', hero_note, 'local_food', local_food)
               FROM public.city_translations WHERE city_slug = p_slug AND lang = p_lang),
    'stops', coalesce((SELECT jsonb_agg(jsonb_build_object('stop_key', s.stop_key, 'stop_number', s.stop_number,
                    'category', s.category, 'name', t.name, 'desc_paragraphs', to_jsonb(t.desc_paragraphs),
                    'kids_box', t.kids_box, 'kids_choice', t.kids_choice, 'photo_task', t.photo_task, 'hint', t.hint, 'local_flavor', t.local_flavor,
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

-- przetłumaczone opcje + indeks poprawnej Z POLSKIEGO (tłumacz nie zmienia odpowiedzi); PL bez pytania = tłumaczenie bez pytania;
-- zły kształt tłumaczenia opcji = bez pytania w tym języku (misja zostaje), nie błąd całego tłumaczenia
CREATE OR REPLACE FUNCTION public.trip_apply_translation(p_slug text, p_lang text, j jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $f$
DECLARE s jsonb; v_id int; n_stops int := 0; pl_keys text[]; j_keys text[]; pl_choice jsonb; v_choice jsonb;
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
    SELECT kids_choice INTO pl_choice FROM public.stop_translations WHERE stop_id = v_id AND lang = 'pl';
    v_choice := CASE WHEN pl_choice IS NOT NULL AND jsonb_typeof(s->'kids_choice') = 'object'
                     THEN jsonb_build_object('options', s->'kids_choice'->'options', 'correct', pl_choice->'correct') END;
    IF NOT public.kids_choice_ok(v_choice) THEN v_choice := NULL; END IF;
    INSERT INTO public.stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, kids_choice, photo_task, hint, local_flavor, dress_code, practical_note,
                                         year_built, price, visit_duration, opening_hours, updated_at)
    VALUES (v_id, p_lang, s->>'name', ARRAY(SELECT jsonb_array_elements_text(coalesce(s->'desc_paragraphs', '[]'))),
            s->>'kids_box', v_choice, s->>'photo_task', s->>'hint', s->>'local_flavor', s->>'dress_code', s->>'practical_note',
            s->>'year_built', s->>'price', s->>'visit_duration', s->>'opening_hours', now())
    ON CONFLICT (stop_id, lang) DO UPDATE SET name = EXCLUDED.name, desc_paragraphs = EXCLUDED.desc_paragraphs,
       kids_box = EXCLUDED.kids_box, photo_task = EXCLUDED.photo_task, hint = EXCLUDED.hint,
       local_flavor = EXCLUDED.local_flavor, dress_code = EXCLUDED.dress_code,
       practical_note = EXCLUDED.practical_note,
       -- pytanie: brak klucza w JSON (tłumaczenie sprzed 2026-10-31) i PL nadal z pytaniem = zostawiamy, co było; PL bez pytania = bez
       kids_choice = CASE WHEN pl_choice IS NULL THEN NULL
                          WHEN s ? 'kids_choice' THEN EXCLUDED.kids_choice
                          ELSE public.stop_translations.kids_choice END,
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
ALTER FUNCTION public.trip_export(text, text) OWNER TO quolino;
ALTER FUNCTION public.trip_apply_translation(text, text, jsonb) OWNER TO quolino;
REVOKE ALL ON FUNCTION public.trip_export(text, text), public.trip_apply_translation(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trip_export(text, text), public.trip_apply_translation(text, text, jsonb) TO quolino;

-- ── 4) próbka przystanku dla gościa: lista dozwolonych kolumn + kids_choice (misja i tak jest w próbce) ──
CREATE OR REPLACE FUNCTION public.trip_sample(p_slug text, p_lang text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE
  c public.cities;
  s public.stops;
  langs text[];
  stop_keys text[] := ARRAY['id', 'city_slug', 'stop_number', 'sort_order', 'stop_key', 'slug', 'category', 'icon',
                            'hero_image', 'wiki_article', 'year_built', 'visit_duration', 'maps_query', 'lat', 'lon', 'variant'];
  tr_keys   text[] := ARRAY['lang', 'name', 'desc_paragraphs', 'kids_box', 'kids_choice', 'hint', 'photo_task', 'practical_note',
                            'dress_code', 'local_flavor', 'year_built', 'visit_duration'];
BEGIN
  IF p_slug IS NULL OR length(p_slug) > 120 THEN RETURN NULL; END IF;
  SELECT * INTO c FROM public.cities WHERE slug = p_slug AND status = 'published';
  IF c.slug IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO s FROM public.stops
   WHERE city_slug = p_slug
     AND coalesce(category, '') NOT IN ('parking', 'restaurant', 'icecream', 'sweets')
     -- trasa zawsze startuje z parkingu (JP 2026-10-29): pierwszy przystanek bez kategorii też pomijamy
     AND NOT (category IS NULL AND (sort_order, stop_number) = (SELECT min(sort_order), min(stop_number) FROM public.stops x WHERE x.city_slug = p_slug))
   ORDER BY sort_order, stop_number
   LIMIT 1;
  IF s.id IS NULL THEN RETURN NULL; END IF;

  langs := ARRAY(SELECT DISTINCT unnest(ARRAY[left(coalesce(p_lang, 'pl'), 8), 'en', 'pl']));

  RETURN jsonb_build_object('stop',
    (SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) FROM jsonb_each(to_jsonb(s)) e WHERE e.key = ANY (stop_keys))
    || jsonb_build_object(
      'stop_translations', coalesce((
        SELECT jsonb_agg(public.strip_refs(
                 (SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) FROM jsonb_each(to_jsonb(t)) e WHERE e.key = ANY (tr_keys))))
          FROM public.stop_translations t WHERE t.stop_id = s.id AND t.lang = ANY (langs)), '[]'::jsonb),
      'stop_blocks', coalesce((
        SELECT jsonb_agg(public.strip_refs(to_jsonb(b) - 'updated_at'))
          FROM public.stop_blocks b WHERE b.stop_id = s.id AND b.lang = ANY (langs)), '[]'::jsonb)));
END $f$;
ALTER FUNCTION public.trip_sample(text, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION public.trip_sample(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trip_sample(text, text) TO web_anon, quolino;

-- ── 5) samokontrola ───────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_slug text; st_id int; snap jsonb; got jsonb; ex jsonb; r jsonb;
  ok jsonb := '{"options": ["Oliwka", "Figowiec", "Kaktus", "Palma"], "correct": 1}';
BEGIN
  -- a) kształt: dobre przechodzi, złe nie
  IF NOT public.kids_choice_ok(ok) OR NOT public.kids_choice_ok(NULL) THEN RAISE EXCEPTION 'kids_choice_ok odrzuca poprawny kształt — wycofuję'; END IF;
  IF public.kids_choice_ok('{"options": ["a", "b", "c"], "correct": 0}')
     OR public.kids_choice_ok('{"options": ["a", "b", "c", "d"], "correct": 4}')
     OR public.kids_choice_ok('{"options": ["a", "b", "c", "d"], "correct": 1.5}')
     OR public.kids_choice_ok('{"options": ["a", "B", "b", "d"], "correct": 0}')
     OR public.kids_choice_ok('{"options": ["a", " ", "c", "d"], "correct": 0}')
     OR public.kids_choice_ok('{"options": ["a", "b", "c", 4], "correct": 0}') THEN
    RAISE EXCEPTION 'kids_choice_ok przepuszcza zły kształt — wycofuję';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stop_translations_kids_choice_shape') THEN
    RAISE EXCEPTION 'brak ograniczenia stop_translations_kids_choice_shape — wycofuję';
  END IF;

  -- b) na prawdziwej trasie (w podtransakcji, wycofywanej na końcu): kolumna → migawka → odtworzenie z migawki → trip_export / trip_sample
  SELECT c.slug INTO v_slug FROM public.cities c WHERE c.status = 'published'
     AND EXISTS (SELECT 1 FROM public.stops s JOIN public.stop_translations t ON t.stop_id = s.id AND t.lang = 'pl' WHERE s.city_slug = c.slug)
   ORDER BY c.slug LIMIT 1;
  IF v_slug IS NULL THEN RAISE NOTICE 'samokontrola: brak opublikowanej trasy — pominięta próba migawki'; RETURN; END IF;
  BEGIN
    SELECT t.stop_id INTO st_id FROM public.stops s JOIN public.stop_translations t ON t.stop_id = s.id AND t.lang = 'pl'
     WHERE s.city_slug = v_slug ORDER BY s.sort_order DESC LIMIT 1;
    UPDATE public.stop_translations SET kids_choice = ok WHERE stop_id = st_id AND lang = 'pl';
    snap := public.city_snapshot(v_slug);
    SELECT x -> 'kids_choice' INTO got FROM jsonb_array_elements(snap -> 'stop_translations') x
     WHERE (x ->> 'stop_id')::int = st_id AND x ->> 'lang' = 'pl';
    IF got IS DISTINCT FROM ok THEN
      RAISE EXCEPTION 'city_snapshot() nie zapisuje stop_translations.kids_choice — trzeba je dopisać, inaczej szkic zgubi pytania (wycofuję)';
    END IF;
    UPDATE public.stop_translations SET kids_choice = NULL WHERE stop_id = st_id AND lang = 'pl';
    PERFORM public.city_load_snapshot(v_slug, snap);
    SELECT t.kids_choice INTO got FROM public.stops s JOIN public.stop_translations t ON t.stop_id = s.id AND t.lang = 'pl'
     WHERE s.city_slug = v_slug AND t.kids_choice IS NOT NULL LIMIT 1;
    IF got IS DISTINCT FROM ok THEN
      RAISE EXCEPTION 'city_load_snapshot() nie odtwarza stop_translations.kids_choice — zatwierdzenie zgubiłoby pytania (wycofuję)';
    END IF;
    ex := public.trip_export(v_slug, 'pl');
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(ex -> 'stops') x WHERE x -> 'kids_choice' = ok) THEN
      RAISE EXCEPTION 'trip_export nie oddaje kids_choice — wycofuję';
    END IF;
    r := public.trip_sample(v_slug, 'pl');
    IF r IS NOT NULL AND (r -> 'stop') ?| ARRAY['phone', 'whatsapp', 'website', 'verify_url', 'price', 'reservation', 'time_label', 'opening_hours'] THEN
      RAISE EXCEPTION 'trip_sample zwraca kontakt/cenę/godziny — wycofuję';
    END IF;
    RAISE NOTICE 'samokontrola %: kids_choice przechodzi migawkę, odtworzenie i eksport tłumaczeń', v_slug;
    RAISE EXCEPTION USING ERRCODE = 'QC031', MESSAGE = 'wycofanie próby';
  EXCEPTION WHEN SQLSTATE 'QC031' THEN
    NULL;   -- próba na prawdziwej trasie wycofana, tabele bez zmian
  END;
  IF EXISTS (SELECT 1 FROM public.stop_translations WHERE kids_choice IS NOT NULL AND kids_choice = ok) THEN
    RAISE EXCEPTION 'próbne pytanie zostało w bazie — wycofuję';
  END IF;
  IF NOT has_function_privilege('web_anon', 'public.trip_sample(text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'web_anon nie może wywołać trip_sample — wycofuję';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Cofnięcie (dane pytań przepadną):
--   ALTER TABLE public.stop_translations DROP CONSTRAINT IF EXISTS stop_translations_kids_choice_shape;
--   ALTER TABLE public.stop_translations DROP COLUMN IF EXISTS kids_choice;   (+ funkcje z plików trip-drafts.sql, 2026-10-11-stop-facts.sql,
--   2026-10-29-probka-przystanku-v2.sql w poprzedniej postaci)
