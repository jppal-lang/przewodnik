-- Teksty dla gościa: „po zalogowaniu” zamiast „z kluczem dostępu” (JP 2026-10-17). Pole na klucz zostaje dla testerów.
-- PL i EN; pozostałe języki z EN zwykłym torem.
BEGIN;
INSERT INTO public.ui_translations (key, lang, value) VALUES
  ('access.full_title', 'pl', 'Pełna wycieczka po zalogowaniu'),
  ('access.full_title', 'en', 'The full trip after signing in'),
  ('access.full_text',  'pl', 'Po zalogowaniu zobaczysz plan dnia z godzinami, mapę trasy, parking, misje i zagadki dla dzieci, punkty awaryjne i pełne opisy przystanków. Konta ruszają wkrótce.'),
  ('access.full_text',  'en', 'After signing in you will see the day plan with times, the route map, parking, missions and riddles for children, emergency points and the full stop descriptions. Accounts are coming soon.'),
  ('access.more',       'pl', 'Dalsza część opisu i misja dla dziecka — po zalogowaniu'),
  ('access.more',       'en', 'The rest of the description and the child''s mission — after signing in'),
  ('access.key_label',  'pl', 'Masz klucz testera? Wklej go tutaj'),
  ('access.key_label',  'en', 'Have a tester key? Paste it here')
ON CONFLICT (key, lang) DO UPDATE SET value = EXCLUDED.value;
COMMIT;
