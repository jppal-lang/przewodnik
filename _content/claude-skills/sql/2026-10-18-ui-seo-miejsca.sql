-- Tytuły stron krajów i regionów pod ładnymi adresami (JP 2026-10-18): „Marche z dziećmi — gotowe plany wycieczek | Quolino”.
BEGIN;
INSERT INTO public.ui_translations (key, lang, value) VALUES
  ('seo.trip_plans', 'pl', 'gotowe plany wycieczek'),
  ('seo.trip_plans', 'en', 'ready-made day trip plans'),
  ('seo.trip_plans', 'de', 'fertige Ausflugspläne'),
  ('seo.trip_plans', 'it', 'gite pronte'),
  ('seo.trip_plans', 'cs', 'hotové plány výletů'),
  ('seo.trip_plans', 'da', 'færdige udflugtsplaner'),
  ('seo.trip_plans', 'es', 'planes de excursión listos'),
  ('seo.trip_plans', 'fr', 'programmes d''excursion prêts'),
  ('seo.trip_plans', 'hr', 'gotovi planovi izleta'),
  ('seo.trip_plans', 'hu', 'kész kirándulási tervek'),
  ('seo.trip_plans', 'nl', 'kant-en-klare dagtripplannen'),
  ('seo.trip_plans', 'no', 'ferdige turplaner'),
  ('seo.trip_plans', 'pt', 'planos de passeio prontos'),
  ('seo.trip_plans', 'ro', 'planuri de excursie gata făcute'),
  ('seo.trip_plans', 'sk', 'hotové plány výletov'),
  ('seo.trip_plans', 'sv', 'färdiga utflyktsplaner'),
  ('seo.trip_plans', 'uk', 'готові плани поїздок')
ON CONFLICT (key, lang) DO UPDATE SET value = EXCLUDED.value;
COMMIT;
