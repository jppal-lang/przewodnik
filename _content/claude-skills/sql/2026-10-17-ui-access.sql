-- Etap A: teksty strony miasta dla gościa i pola na klucz dostępu (city.html, 2026-10-17, rola Frontend → Backend).
-- PL i EN; pozostałe 15 języków z EN zwykłym torem. Fallback strony: język → słownik → pl z kodu.
BEGIN;
INSERT INTO public.ui_translations (key, lang, value) VALUES
  ('access.full_title', 'pl', 'Pełna wycieczka'),
  ('access.full_title', 'en', 'The full trip'),
  ('access.full_text',  'pl', 'Plan dnia z godzinami, mapa trasy, parking, misje i zagadki dla dzieci, punkty awaryjne i dalsze akapity opisów są dostępne z kluczem dostępu.'),
  ('access.full_text',  'en', 'The day plan with times, the route map, parking, missions and riddles for children, emergency points and the rest of each description are available with an access key.'),
  ('access.more',       'pl', 'Dalsza część opisu i misja dla dziecka — w pełnej wycieczce'),
  ('access.more',       'en', 'The rest of the description and the child''s mission are in the full trip'),
  ('access.key_label',  'pl', 'Masz klucz albo link? Wklej go tutaj'),
  ('access.key_label',  'en', 'Have a key or a link? Paste it here'),
  ('access.key_btn',    'pl', 'Otwórz pełną wycieczkę'),
  ('access.key_btn',    'en', 'Open the full trip'),
  ('access.key_bad',    'pl', 'Ten klucz jest nieważny albo wygasł.'),
  ('access.key_bad',    'en', 'This key is not valid or has expired.'),
  ('access.key_limit',  'pl', 'Za dużo otwarć z tym kluczem w ostatniej godzinie. Spróbuj później.'),
  ('access.key_limit',  'en', 'This key has been used too often in the last hour. Please try again later.'),
  ('access.active',     'pl', 'Pełna wycieczka — klucz aktywny na tym urządzeniu.'),
  ('access.active',     'en', 'Full trip — the key is active on this device.'),
  ('access.forget',     'pl', 'Usuń klucz z tego urządzenia'),
  ('access.forget',     'en', 'Remove the key from this device')
ON CONFLICT (key, lang) DO UPDATE SET value = EXCLUDED.value;
COMMIT;
