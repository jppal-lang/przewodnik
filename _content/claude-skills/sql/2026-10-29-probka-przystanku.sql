-- B1 (JP 2026-10-28): próbka przystanku dla gościa.
-- Pierwszy przystanek trasy, który NIE jest praktyczny (category nie w: parking, restaurant, icecream, sweets;
-- brak kategorii = zwiedzanie), gość (web_anon) widzi w całości: pełny opis rodzica, misja i zadanie foto dziecka,
-- legenda / ciekawostka / popkultura, zdjęcie, zapytanie do Map Google (przycisk „Prowadź w Mapach”).
-- Bez telefonów, WhatsAppa, stron WWW, cen, rezerwacji i godzin planu dnia — funkcja wypisuje WYŁĄCZNIE kolumny
-- z listy dozwolonych (nowa kolumna w stops/stop_translations nie wycieknie sama).
-- Strona (city.html → guestData) łączy wynik z public_stops po stop_id; bez tej funkcji działa po staremu.
-- Bezpieczne do powtórzenia. W całości albo wcale.
BEGIN;

CREATE OR REPLACE FUNCTION public.trip_sample(p_slug text, p_lang text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE
  c public.cities;
  s public.stops;
  langs text[];
  stop_keys text[] := ARRAY['id', 'city_slug', 'stop_number', 'sort_order', 'stop_key', 'slug', 'category', 'icon',
                            'hero_image', 'wiki_article', 'year_built', 'visit_duration', 'maps_query', 'lat', 'lon', 'variant'];
  tr_keys   text[] := ARRAY['lang', 'name', 'desc_paragraphs', 'kids_box', 'hint', 'photo_task', 'practical_note',
                            'dress_code', 'local_flavor', 'year_built', 'visit_duration'];
BEGIN
  IF p_slug IS NULL OR length(p_slug) > 120 THEN RETURN NULL; END IF;
  SELECT * INTO c FROM public.cities WHERE slug = p_slug AND status = 'published';
  IF c.slug IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO s FROM public.stops
   WHERE city_slug = p_slug
     AND coalesce(category, '') NOT IN ('parking', 'restaurant', 'icecream', 'sweets')
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

-- samokontrola: gość może wywołać funkcję, a wynik nie zawiera kontaktów ani cen
DO $$
DECLARE r jsonb; slug text;
BEGIN
  IF NOT has_function_privilege('web_anon', 'public.trip_sample(text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'web_anon nie może wywołać trip_sample — wycofuję';
  END IF;
  SELECT c.slug INTO slug FROM public.cities c WHERE c.status = 'published' ORDER BY c.slug LIMIT 1;
  IF slug IS NOT NULL THEN
    r := public.trip_sample(slug, 'pl');
    IF r IS NOT NULL AND (r -> 'stop') ?| ARRAY['phone', 'whatsapp', 'website', 'verify_url', 'price', 'reservation', 'time_label', 'opening_hours'] THEN
      RAISE EXCEPTION 'trip_sample zwraca kontakt/cenę/godziny — wycofuję';
    END IF;
    RAISE NOTICE 'trip_sample(%): przystanek %', slug, coalesce(r -> 'stop' ->> 'stop_number', 'brak');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Cofnięcie: DROP FUNCTION IF EXISTS public.trip_sample(text, text);  (strona wraca do samych public_stops)
