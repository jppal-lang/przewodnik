-- Strona główna: sekcja „Jak działa zwiedzanie z Quolino” (2026-10-16, rola Frontend → Backend).
-- PL i EN; pozostałe 15 języków: tłumaczenie z EN wg zwykłego toku (Hermes). Fallback strony: język → en → pl.
BEGIN;
INSERT INTO public.ui_translations (key, lang, value) VALUES
  ('home.how2_title', 'pl', 'Jak działa zwiedzanie z Quolino'),
  ('home.how2_title', 'en', 'How a day out with Quolino works'),
  ('home.how2_lead', 'pl', 'Dwa telefony, jedno zwiedzanie: rodzic ma plan dnia, dziecko ma misje.'),
  ('home.how2_lead', 'en', 'Two phones, one day out: the parent gets the day plan, the child gets the missions.'),
  ('home.how2_s1_t', 'pl', 'Wybierz miasto i trasę'),
  ('home.how2_s1_t', 'en', 'Pick a town and its route'),
  ('home.how2_s1_x', 'pl', 'Plan dnia od parkingu po kolację: przystanki po kolei, czas zwiedzania, godziny otwarcia i mapa trasy, którą przybliżysz palcami. Jeden przycisk otwiera całą trasę w Google Maps.'),
  ('home.how2_s1_x', 'en', 'A day plan from the car park to dinner: stops in order, visiting time, opening hours and a route map you can zoom with your fingers. One button opens the whole route in Google Maps.'),
  ('home.how2_s2_t', 'pl', 'Ustaw trasę i wyślij QR dziecku'),
  ('home.how2_s2_t', 'en', 'Set the route and send the QR code'),
  ('home.how2_s2_x', 'pl', 'Wyłącz przystanki, które dziś pomijacie. Dziecko skanuje kod drugim telefonem i dostaje własny widok: same misje, bez cen i reklam.'),
  ('home.how2_s2_x', 'en', 'Switch off the stops you are skipping today. Your child scans the code with a second phone and gets their own view: just missions, no prices, no ads.'),
  ('home.how2_s3_t', 'pl', 'Dziecko wybiera swojego Quo'),
  ('home.how2_s3_t', 'en', 'Your child picks their Quo'),
  ('home.how2_s3_x', 'pl', 'Osiem postaci do wyboru, kolor i wymyślona ksywka na ten dzień. Bez zakładania konta i bez prawdziwego imienia.'),
  ('home.how2_s3_x', 'en', 'Eight characters to choose from, a colour and a made-up nickname for the day. No account and no real name needed.'),
  ('home.how2_s4_t', 'pl', 'Zwiedzacie przystanek po przystanku'),
  ('home.how2_s4_t', 'en', 'Explore stop by stop'),
  ('home.how2_s4_x', 'pl', 'Rodzic ma historię i ciekawostki do opowiedzenia, dziecko misję, zagadkę i zadanie foto. Po misji przycisk „Idziemy dalej” prowadzi do następnego punktu.'),
  ('home.how2_s4_x', 'en', 'The parent has the history and fun facts to tell, the child has a mission, a riddle and a photo task. After each mission, a “Let’s go on” button leads to the next stop.'),
  ('home.how2_s5_t', 'pl', 'Każda misja odsłania kawałek obrazka'),
  ('home.how2_s5_t', 'en', 'Every mission uncovers a piece of the picture'),
  ('home.how2_s5_x', 'pl', 'Na starcie obrazek miasta jest zakryty: ile przystanków, tyle kawałków. Ostatnia misja odsłania całość, a obrazek można pobrać albo wydrukować jako kolorowankę.'),
  ('home.how2_s5_x', 'en', 'At the start, the town’s picture is covered: one piece for every stop. The last mission reveals the whole picture, which you can download or print as a colouring page.'),
  ('home.how2_s6_t', 'pl', 'Finał przy kolacji, miasto w albumie'),
  ('home.how2_s6_t', 'en', 'Finish at dinner, the town goes into your album'),
  ('home.how2_s6_x', 'pl', 'Ostatni przystanek to polecana restauracja. Zdobyte miasto trafia do albumu rodziny, gdzie zbieracie kolejne wyprawy.'),
  ('home.how2_s6_x', 'en', 'The last stop is a recommended restaurant. The conquered town goes into your family album, where you collect your trips.'),
  ('home.how2_sos', 'pl', 'A gdyby coś poszło nie tak, zakładka „Punkty awaryjne” pokaże najbliższą aptekę, toalety, cień i plac zabaw.'),
  ('home.how2_sos', 'en', 'And if something goes wrong, the “Emergency points” tab shows the nearest pharmacy, toilets, shade and playground.')
ON CONFLICT (key, lang) DO UPDATE SET value = EXCLUDED.value;
COMMIT;
