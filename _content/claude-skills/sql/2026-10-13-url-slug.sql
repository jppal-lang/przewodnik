-- Adresy stron: /{lang}/{kraj}/{region}/{miasto}/ (JP 2026-10-13).
-- url_slug = oryginalna nazwa lokalna, małe litery, bez znaków diakrytycznych, myślniki (alfabet nielaciński: nazwa angielska).
-- To TYLKO adres w URL: wewnętrzne slugi (cities.slug, regions.slug), wątki Discorda, pliki mediów i work/ zostają bez zmian.
-- Tylko dodaje: nowe kolumny, wypełnienie, ograniczenia. Bezpieczny do powtórzenia.

ALTER TABLE public.cities  ADD COLUMN IF NOT EXISTS url_slug text;
ALTER TABLE public.regions ADD COLUMN IF NOT EXISTS url_slug text;

-- wypełnienie istniejących: nazwa lokalna tam, gdzie wewnętrzny slug jest polski
UPDATE public.cities SET url_slug = CASE slug
    WHEN 'asyz'    THEN 'assisi'
    WHEN 'rawenna' THEN 'ravenna'
    ELSE slug END
  WHERE url_slug IS NULL;
UPDATE public.regions SET url_slug = CASE slug
    WHEN 'toskania' THEN 'toscana'
    ELSE slug END
  WHERE url_slug IS NULL;

-- format i unikalność (miasto w obrębie regionu, region w obrębie kraju)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cities_url_slug_format') THEN
    ALTER TABLE public.cities ADD CONSTRAINT cities_url_slug_format CHECK (url_slug IS NULL OR url_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'regions_url_slug_format') THEN
    ALTER TABLE public.regions ADD CONSTRAINT regions_url_slug_format CHECK (url_slug IS NULL OR url_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS cities_url_slug_uq  ON public.cities  (country, region_slug, url_slug);
CREATE UNIQUE INDEX IF NOT EXISTS regions_url_slug_uq ON public.regions (country_slug, url_slug);

-- odczyt: web_anon ma SELECT na całych tabelach cities i regions, więc nowa kolumna jest czytelna bez osobnego GRANT
