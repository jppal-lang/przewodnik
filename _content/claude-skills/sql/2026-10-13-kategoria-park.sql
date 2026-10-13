-- Kategoria `park` (JP 2026-10-13): park, ogród, plac zabaw, zieleń do odpoczynku z dziećmi.
-- Szkice (np. Orti dei Tolomei w Sienie) dostawały `park`, którego nie było w stop_categories (klucz obcy stops_category_fkey).
-- Ikona SVG `park` jest już w city.html. Bezpieczne do powtórzenia.
BEGIN;
INSERT INTO public.stop_categories (slug, icon, sort_order, meaning, label_key)
SELECT 'park', '🌳', 78, 'Park, ogród, plac zabaw, zieleń do odpoczynku z dziećmi.', 'cat.park'
 WHERE NOT EXISTS (SELECT 1 FROM public.stop_categories WHERE slug = 'park');

INSERT INTO public.ui_translations (key, lang, value)
SELECT 'cat.park', v.lang, v.value
  FROM (VALUES ('pl','park'),('en','park'),('de','Park'),('it','parco'),('es','parque'),('fr','parc'),('nl','park'),
               ('cs','park'),('sk','park'),('uk','парк'),('hr','park'),('hu','park'),('ro','parc'),('pt','parque'),
               ('sv','park'),('da','park'),('no','park')) AS v(lang, value)
 WHERE NOT EXISTS (SELECT 1 FROM public.ui_translations t WHERE t.key = 'cat.park' AND t.lang = v.lang);
NOTIFY pgrst, 'reload schema';
COMMIT;
