-- Testy 2026-10-28 (K4): opisy pod nazwą miasta na stronie regionu i miasta.
-- Asyż: w subtitle stał tytuł SEO („Asyż z dziećmi — plan wycieczki”) — zamiast niego opis z faktów z leadu trasy.
-- Spello: lead PL był notatką redakcyjną („Zaakceptowana wersja redakcyjna v31…”) widoczną dla gości.
--   To łatka na czas do zatwierdzenia v3d (ta wersja ma już własny, poprawny lead i podmieni ten tekst).
BEGIN;
UPDATE public.city_translations SET subtitle = 'Miasto św. Franciszka i św. Klary na wzgórzach Umbrii: dwie wielkie bazyliki, rzymskie forum i średniowieczna twierdza.'
 WHERE city_slug = 'asyz' AND lang = 'pl' AND subtitle LIKE '%plan wycieczki%';
UPDATE public.city_translations SET subtitle = 'The town of St Francis and St Clare in the hills of Umbria: two great basilicas, a Roman forum and a medieval fortress.'
 WHERE city_slug = 'asyz' AND lang = 'en' AND subtitle LIKE '%itinerary%';
UPDATE public.city_translations SET lead = 'Spello najlepiej zwiedzać we własnym tempie: zatrzymajcie się przy mozaikach, wejdźcie do kościoła, zjedzcie po drodze lody albo pomińcie przystanek i idźcie dalej.'
 WHERE city_slug = 'spello' AND lang = 'pl' AND lead LIKE 'Zaakceptowana wersja redakcyjna%';
COMMIT;
