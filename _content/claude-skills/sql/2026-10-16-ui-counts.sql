-- Strona główna: liczba miast i lista regionów liczone z bazy (index.html → updateCounts), 2026-10-16.
-- Nowe klucze PL+EN; pozostałe 15 języków z EN zwykłym torem.
BEGIN;
INSERT INTO public.ui_translations (key, lang, value) VALUES
  ('home.badge_cities', 'pl', 'Miasta'),
  ('home.badge_cities', 'en', 'Towns'),
  ('home.avail_regions', 'pl', 'Dostępne regiony'),
  ('home.avail_regions', 'en', 'Available regions'),
  ('home.more_soon', 'pl', 'Kolejne miasta dochodzą na bieżąco.'),
  ('home.more_soon', 'en', 'New towns are added all the time.')
ON CONFLICT (key, lang) DO UPDATE SET value = EXCLUDED.value;
COMMIT;
