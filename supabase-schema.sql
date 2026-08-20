-- ============================================================
-- QUOLINO — Hybrydowy system tłumaczeń
-- Supabase jako CMS → eksport do statycznych JSON → GitHub Pages
-- ============================================================

-- 1. JĘZYKI
CREATE TABLE languages (
  code TEXT PRIMARY KEY,            -- 'pl', 'en', 'it', 'de'...
  name_native TEXT NOT NULL,        -- 'Polski', 'English', 'Italiano'
  name_en TEXT NOT NULL,            -- 'Polish', 'English', 'Italian'
  priority SMALLINT NOT NULL DEFAULT 9, -- P0=0, P1=1, P2=2 (sortowanie)
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO languages (code, name_native, name_en, priority) VALUES
  ('pl', 'Polski',    'Polish',     0),
  ('en', 'English',   'English',    0),
  ('it', 'Italiano',  'Italian',    0),
  ('de', 'Deutsch',   'German',     0),
  ('fr', 'Français',  'French',     1),
  ('es', 'Español',   'Spanish',    1),
  ('cs', 'Čeština',   'Czech',      1),
  ('sk', 'Slovenčina','Slovak',     1),
  ('ro', 'Română',    'Romanian',   1),
  ('at', 'Deutsch (AT)','German (AT)',1),
  ('hr', 'Hrvatski',  'Croatian',   2),
  ('el', 'Ελληνικά',  'Greek',      2),
  ('no', 'Norsk',     'Norwegian',  2);

-- 2. TŁUMACZENIA UI (przyciski, etykiety, nawigacja)
CREATE TABLE ui_translations (
  key TEXT NOT NULL,                -- 'btn.navigate', 'btn.write', 'label.for_kids'
  lang TEXT NOT NULL REFERENCES languages(code),
  value TEXT NOT NULL,              -- 'Navigate', 'Nawiguj', 'Navigare'
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (key, lang)
);

-- Przykładowe klucze UI
INSERT INTO ui_translations (key, lang, value) VALUES
  -- Przyciski akcji
  ('btn.navigate',    'pl', 'Nawiguj'),
  ('btn.navigate',    'en', 'Navigate'),
  ('btn.navigate',    'it', 'Naviga'),
  ('btn.navigate',    'de', 'Navigation'),
  ('btn.drive',       'pl', 'Prowadź'),
  ('btn.drive',       'en', 'Drive'),
  ('btn.drive',       'it', 'Guida'),
  ('btn.drive',       'de', 'Route'),
  ('btn.write',       'pl', 'Napisz'),
  ('btn.write',       'en', 'Message'),
  ('btn.write',       'it', 'Scrivi'),
  ('btn.write',       'de', 'Nachricht'),
  ('btn.www',         'pl', 'WWW'),
  ('btn.www',         'en', 'Website'),
  ('btn.www',         'it', 'Sito'),
  ('btn.www',         'de', 'Webseite'),
  -- Etykiety
  ('label.for_kids',  'pl', 'Dla dzieci'),
  ('label.for_kids',  'en', 'For kids'),
  ('label.for_kids',  'it', 'Per bambini'),
  ('label.for_kids',  'de', 'Für Kinder'),
  ('label.photo_task','pl', 'Zadanie foto'),
  ('label.photo_task','en', 'Photo challenge'),
  ('label.photo_task','it', 'Sfida foto'),
  ('label.photo_task','de', 'Foto-Aufgabe'),
  ('label.day_plan',  'pl', 'Plan dnia'),
  ('label.day_plan',  'en', 'Day plan'),
  ('label.day_plan',  'it', 'Piano del giorno'),
  ('label.day_plan',  'de', 'Tagesplan'),
  ('label.emergency', 'pl', 'Punkty awaryjne'),
  ('label.emergency', 'en', 'Emergency points'),
  ('label.emergency', 'it', 'Punti di emergenza'),
  ('label.emergency', 'de', 'Notfallpunkte'),
  ('label.phrases',   'pl', 'Rozmówki'),
  ('label.phrases',   'en', 'Useful phrases'),
  ('label.phrases',   'it', 'Frasi utili'),
  ('label.phrases',   'de', 'Redewendungen'),
  ('label.phones',    'pl', 'Telefony'),
  ('label.phones',    'en', 'Phone numbers'),
  ('label.phones',    'it', 'Numeri utili'),
  ('label.phones',    'de', 'Telefonnummern'),
  ('label.qr_kid',    'pl', 'QR dla dziecka'),
  ('label.qr_kid',    'en', 'QR for kid'),
  ('label.qr_kid',    'it', 'QR per bambino'),
  ('label.qr_kid',    'de', 'QR für Kind'),
  ('label.free',      'pl', 'bezpłatnie'),
  ('label.free',      'en', 'free'),
  ('label.free',      'it', 'gratuito'),
  ('label.free',      'de', 'kostenlos'),
  -- Widok dziecka
  ('btn.kid_view',    'pl', 'Widok dziecka'),
  ('btn.kid_view',    'en', 'Kid view'),
  ('btn.kid_view',    'it', 'Vista bambino'),
  ('btn.kid_view',    'de', 'Kinderansicht'),
  ('btn.add_photo',   'pl', 'Dodaj zdjęcie z galerii'),
  ('btn.add_photo',   'en', 'Add photo from gallery'),
  ('btn.add_photo',   'it', 'Aggiungi foto dalla galleria'),
  ('btn.add_photo',   'de', 'Foto aus Galerie hinzufügen'),
  -- Nawigacja
  ('nav.back',        'pl', 'Wróć'),
  ('nav.back',        'en', 'Back'),
  ('nav.back',        'it', 'Indietro'),
  ('nav.back',        'de', 'Zurück'),
  -- QR
  ('qr.scan_text',    'pl', 'Zeskanuj telefonem dziecka — otworzy się ten sam przewodnik od razu w widoku dziecka: misje, checkboxy, bez cen i historii.'),
  ('qr.scan_text',    'en', 'Scan with your kid''s phone — it opens the same guide in kid view: missions, checkboxes, no prices or history.'),
  ('qr.scan_text',    'it', 'Scansiona con il telefono del bambino — si apre la stessa guida in vista bambino: missioni, checkbox, senza prezzi e storia.'),
  ('qr.scan_text',    'de', 'Mit dem Kinderhandy scannen — der Stadtführer öffnet sich in der Kinderansicht: Missionen, Checkboxen, ohne Preise und Geschichte.');


-- 3. MIASTA (dane strukturalne, język-niezależne)
CREATE TABLE cities (
  slug TEXT PRIMARY KEY,            -- 'perugia', 'urbino', 'ancona'
  country TEXT NOT NULL,            -- 'it', 'pl', 'hr'
  region TEXT NOT NULL,             -- 'umbria', 'marche', 'malopolska'
  lat NUMERIC(8,5),
  lon NUMERIC(8,5),
  bandana_color TEXT,               -- '#B7282E' (kolor heraldyczny)
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO cities (slug, country, region, lat, lon, bandana_color) VALUES
  ('perugia',  'it', 'umbria', 43.11030, 12.38960, '#B7282E'),
  ('asyz',     'it', 'umbria', 43.07090, 12.61670, NULL),
  ('urbino',   'it', 'marche', 43.72260, 12.63570, '#FFD700'),
  ('ancona',   'it', 'marche', 43.61580, 13.51840, NULL),
  ('frasassi', 'it', 'marche', 43.40090, 12.96540, NULL),
  ('rimini',   'it', 'marche', 44.05940, 12.56570, NULL),
  ('rawenna',  'it', 'marche', 44.41840, 12.20350, NULL);


-- 4. TŁUMACZENIA MIAST (hero, lead, plan dnia)
CREATE TABLE city_translations (
  city_slug TEXT NOT NULL REFERENCES cities(slug),
  lang TEXT NOT NULL REFERENCES languages(code),
  title TEXT NOT NULL,               -- 'Perugia'
  region_label TEXT,                 -- 'Umbria · popołudnie i wieczór'
  subtitle TEXT NOT NULL,            -- 'Podziemne miasto, ruchome schody...'
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (city_slug, lang)
);

INSERT INTO city_translations (city_slug, lang, title, region_label, subtitle) VALUES
  ('perugia', 'pl', 'Perugia', 'Umbria · popołudnie i wieczór', 'Podziemne miasto, ruchome schody i najlepsza czekolada Umbrii.'),
  ('perugia', 'en', 'Perugia', 'Umbria · afternoon & evening', 'Underground city, escalators, and the best chocolate in Umbria.');


-- 5. PRZYSTANKI (dane strukturalne)
CREATE TABLE stops (
  id SERIAL PRIMARY KEY,
  city_slug TEXT NOT NULL REFERENCES cities(slug),
  stop_number SMALLINT NOT NULL,    -- 01, 02, 03...
  time_label TEXT,                   -- '16:15' (nie tłumaczone)
  price TEXT,                        -- '~8 €/doba' (nie tłumaczone)
  year_built TEXT,                   -- '1278 r.' (nie tłumaczone)
  wiki_article TEXT,                 -- 'Fontana Maggiore' (dla zdjęcia Wikimedia)
  maps_query TEXT,                   -- 'Fontana+Maggiore,+Perugia'
  whatsapp TEXT,                     -- numer WhatsApp
  website TEXT,                      -- URL strony
  UNIQUE(city_slug, stop_number)
);

INSERT INTO stops (city_slug, stop_number, time_label, price, year_built, wiki_article, maps_query, whatsapp, website) VALUES
  ('perugia', 1, '16:15', '~8 €/doba', NULL, 'Perugia', 'Piazza+Partigiani,+Perugia', '+390755721010', 'https://www.sipaonline.it'),
  ('perugia', 2, '16:30', NULL, '1540 r.', 'Rocca Paolina', 'Rocca+Paolina,+Perugia', NULL, 'https://turismo.comune.perugia.it'),
  ('perugia', 3, '17:10', NULL, '1278 r.', 'Fontana Maggiore', 'Fontana+Maggiore,+Perugia', NULL, NULL),
  ('perugia', 4, '17:30', '8 € / dorosły', '1345 r.', 'Cattedrale di San Lorenzo (Perugia)', 'Cattedrale+San+Lorenzo,+Perugia', NULL, 'https://www.cattedrale.perugia.it'),
  ('perugia', 5, '18:00', '8 € / dorosły', '1293 r.', 'Palazzo dei Priori (Perugia)', 'Palazzo+dei+Priori,+Perugia', '+390755721009', 'https://gallerianazionaledellumbria.it'),
  ('perugia', 6, '18:50', NULL, 'XIII w.', NULL, 'Via+dell''Acquedotto,+Perugia', NULL, NULL),
  ('perugia', 7, '19:30', '~15 €/os.', NULL, NULL, 'Corso+Vannucci,+Perugia', '+390755736161', NULL);


-- 6. TŁUMACZENIA PRZYSTANKÓW (nazwa, opisy, boksy)
CREATE TABLE stop_translations (
  stop_id INT NOT NULL REFERENCES stops(id),
  lang TEXT NOT NULL REFERENCES languages(code),
  name TEXT NOT NULL,                -- 'Parking Piazza Partigiani'
  desc_paragraphs TEXT[] NOT NULL,   -- tablica akapitów opisu
  kids_box TEXT,                     -- treść boksu "Dla dzieci"
  photo_task TEXT,                   -- treść boksu "Zadanie foto"
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (stop_id, lang)
);

-- Przykład: Perugia przystanek 01 (PL + EN)
INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, photo_task) VALUES
  (1, 'pl', 'Parking Piazza Partigiani',
   ARRAY[
     'Wielopoziomowy parking wykuty w zboczu wzgórza, tuż pod południowymi murami starówki — stąd nie ma pieszo pod górę ani metra. Otwarto go w 1983 roku razem z całym systemem scale mobili (ruchomych schodów), które budowniczowie przeprowadzili prosto przez wnętrze XVI-wiecznej twierdzy Rocca Paolina: osiem odcinków, około ośmiu minut jazdy, po drodze mijacie sklepione korytarze i place dawnej fortecy, zanim wyjdziecie na dzienne światło przy Piazza Italia.',
     'To nietypowe wejście do miasta — same schody są już pierwszą atrakcją dnia, coś jak metro przez ruiny. Warto zapamiętać poziom, na którym zostawiacie auto: wieczorem wraca się tą samą drogą, przez wnętrze twierdzy, a kolejne poziomy wyglądają bardzo podobnie.'
   ],
   'Ruchome schody jadą przez prawdziwe podziemne miasto! Policzcie, ile odcinków schodów minie, zanim zobaczycie niebo.',
   'Rodzinne zdjęcie przy wejściu do scale mobili — to start trasy.'),

  (1, 'en', 'Piazza Partigiani Parking',
   ARRAY[
     'A multi-level parking garage carved into the hillside, just below the southern walls of the old town — no walking uphill, no shuttle needed. It opened in 1983 together with the scale mobili (escalator) system, which the builders routed straight through the interior of a 16th-century fortress, Rocca Paolina: eight sections, about eight minutes of riding, passing through vaulted corridors and squares of the former citadel before emerging into daylight at Piazza Italia.',
     'It''s an unusual entrance to a city — the escalators themselves are the first attraction of the day, something like a metro through ruins. Remember which level you parked on: in the evening you''ll return the same way, through the fortress interior, and each level looks very similar.'
   ],
   'The escalators ride through a real underground city! Count how many escalator sections you pass before you see the sky.',
   'Family photo at the entrance to the scale mobili — this is the starting point of your route.');


-- 7. PLAN DNIA (per miasto, per język)
CREATE TABLE day_plan (
  city_slug TEXT NOT NULL REFERENCES cities(slug),
  lang TEXT NOT NULL REFERENCES languages(code),
  time_label TEXT NOT NULL,          -- '16:15'
  description TEXT NOT NULL,         -- 'Parking Piazza Partigiani → scale mobili'
  sort_order SMALLINT NOT NULL,
  PRIMARY KEY (city_slug, lang, sort_order)
);

INSERT INTO day_plan (city_slug, lang, time_label, description, sort_order) VALUES
  ('perugia', 'pl', '16:15', 'Parking Piazza Partigiani → scale mobili', 1),
  ('perugia', 'pl', '16:30', 'Rocca Paolina — podziemne miasto', 2),
  ('perugia', 'pl', '17:10', 'Fontana Maggiore i katedra', 3),
  ('perugia', 'pl', '18:00', 'Palazzo dei Priori (galeria, 40 min)', 4),
  ('perugia', 'pl', '18:50', 'Spacer akweduktem', 5),
  ('perugia', 'pl', '19:30', 'Kolacja + gelato, zachód słońca', 6),
  ('perugia', 'en', '16:15', 'Piazza Partigiani Parking → escalators', 1),
  ('perugia', 'en', '16:30', 'Rocca Paolina — underground city', 2),
  ('perugia', 'en', '17:10', 'Fontana Maggiore & Cathedral', 3),
  ('perugia', 'en', '18:00', 'Palazzo dei Priori (gallery, 40 min)', 4),
  ('perugia', 'en', '18:50', 'Aqueduct walk', 5),
  ('perugia', 'en', '19:30', 'Dinner + gelato, sunset', 6);


-- 8. PUNKTY AWARYJNE (per miasto, per język)
CREATE TABLE emergency_points (
  city_slug TEXT NOT NULL REFERENCES cities(slug),
  lang TEXT NOT NULL REFERENCES languages(code),
  type TEXT NOT NULL,                -- 'pharmacy', 'toilet', 'playground', 'hospital'
  label TEXT NOT NULL,               -- 'Apteka'
  description TEXT NOT NULL,         -- 'Farmacia San Martino, Corso Vannucci 46 (do 20:00)'
  maps_query TEXT,
  sort_order SMALLINT NOT NULL,
  PRIMARY KEY (city_slug, lang, sort_order)
);


-- 9. ROZMÓWKI (per kraj, per język)
CREATE TABLE phrases (
  country TEXT NOT NULL,             -- 'it', 'pl' — kraj docelowy
  lang TEXT NOT NULL REFERENCES languages(code),  -- język interfejsu użytkownika
  phrase_local TEXT NOT NULL,        -- 'Buongiorno / arrivederci' (w języku kraju)
  phrase_user TEXT NOT NULL,         -- 'Dzień dobry / do widzenia' (w języku UI)
  sort_order SMALLINT NOT NULL,
  PRIMARY KEY (country, lang, sort_order)
);


-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
-- Wszystkie tabele tłumaczeniowe: SELECT publiczny (anon),
-- INSERT/UPDATE/DELETE tylko dla authenticated z rolą 'editor'
-- ============================================================

ALTER TABLE languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ui_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE city_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE stop_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE phrases ENABLE ROW LEVEL SECURITY;

-- Publiczny odczyt
CREATE POLICY "Public read" ON languages FOR SELECT USING (true);
CREATE POLICY "Public read" ON ui_translations FOR SELECT USING (true);
CREATE POLICY "Public read" ON cities FOR SELECT USING (true);
CREATE POLICY "Public read" ON city_translations FOR SELECT USING (true);
CREATE POLICY "Public read" ON stops FOR SELECT USING (true);
CREATE POLICY "Public read" ON stop_translations FOR SELECT USING (true);
CREATE POLICY "Public read" ON day_plan FOR SELECT USING (true);
CREATE POLICY "Public read" ON emergency_points FOR SELECT USING (true);
CREATE POLICY "Public read" ON phrases FOR SELECT USING (true);

-- Edycja tylko dla zalogowanych
CREATE POLICY "Editor write" ON ui_translations FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Editor write" ON city_translations FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Editor write" ON stop_translations FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Editor write" ON day_plan FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Editor write" ON emergency_points FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Editor write" ON phrases FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');


-- ============================================================
-- VIEW: eksport miasta (dla skryptu export)
-- ============================================================
CREATE VIEW export_city AS
SELECT
  c.slug,
  c.country,
  c.region,
  ct.lang,
  ct.title,
  ct.region_label,
  ct.subtitle
FROM cities c
JOIN city_translations ct ON ct.city_slug = c.slug;

CREATE VIEW export_stops AS
SELECT
  s.city_slug,
  s.stop_number,
  s.time_label,
  s.price,
  s.year_built,
  s.wiki_article,
  s.maps_query,
  s.whatsapp,
  s.website,
  st.lang,
  st.name,
  st.desc_paragraphs,
  st.kids_box,
  st.photo_task
FROM stops s
JOIN stop_translations st ON st.stop_id = s.id
ORDER BY s.city_slug, s.stop_number;
