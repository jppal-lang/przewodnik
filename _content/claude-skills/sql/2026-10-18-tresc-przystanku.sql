-- Standard treści przystanku (docs/TRESC-PRZYSTANKU.md, decyzje JP 2026-10-18) — baza.
-- TYLKO DODAJE: nowe tabele, kolumny i funkcje; widoki publiczne i trip_full rozszerzone wstecznie zgodnie.
-- Miasta bez flagi content_v2 wyglądają na stronie dokładnie jak dziś (publicznie akapity 1–2).
--
-- Rozdział danych:
--   public.stop_blocks   — legenda, ciekawostka, popkultura, fun fact: CZYSTY tekst (bez przypisów), tłumaczony.
--                          Bez dostępu dla web_anon: tylko przez trip_full (zalogowany / klucz) i widok dziecka.
--   ops.stop_research    — wersja redakcyjna PL: wszystkie bloki z przypisami [n], stan bloków (found/none + gdzie
--                          sprawdzono), lista źródeł, wynik kontroli Claude. Tylko redaktor i AI — nigdy strona.
--   cities.access        — 'standard' | 'free' (trasa darmowa dla wszystkich: atrakcja sama w sobie, np. Frasassi).
--   cities.content_v2    — miasto przerobione na nowy standard: publicznie cały opis + nazwy bloków.
-- Bezpieczne do powtórzenia. Wykonuje się w całości albo wcale.
BEGIN;
GRANT USAGE ON SCHEMA ops TO quolino;

-- ── 1) Miasta: dostęp i stan przeróbki ─────────────────────────────────────────────────────────
ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS access     text    NOT NULL DEFAULT 'standard';
ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS content_v2 boolean NOT NULL DEFAULT false;
DO $$BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cities_access_check') THEN
    ALTER TABLE public.cities ADD CONSTRAINT cities_access_check CHECK (access IN ('standard', 'free'));
  END IF;
END$$;
-- trasy darmowe dla wszystkich (JP 2026-10-18): atrakcja sama w sobie; Energylandia i Wieliczka — gdy powstaną
UPDATE public.cities SET access = 'free' WHERE slug IN ('frasassi') AND access <> 'free';
COMMENT ON COLUMN public.cities.access IS
  'standard = odblokowanie zakupem/darmowym wyborem/kodem (od 06.2027); free = trasa otwarta dla wszystkich, nie zużywa darmowego wyboru konta';
COMMENT ON COLUMN public.cities.content_v2 IS
  'true = przystanki według docs/TRESC-PRZYSTANKU.md (bloki osobno, przypisy w ops.stop_research); publicznie cały opis';

-- ── 2) Przypisy: usuwanie znaczników [n] z tekstu dla strony ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.strip_refs(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $f$
  SELECT CASE WHEN t IS NULL THEN NULL ELSE btrim(regexp_replace(t, '\s*\[\d{1,3}\]', '', 'g')) END
$f$;
CREATE OR REPLACE FUNCTION public.strip_refs(a text[]) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $f$
  SELECT CASE WHEN a IS NULL THEN NULL
              ELSE ARRAY(SELECT public.strip_refs(x) FROM unnest(a) WITH ORDINALITY u(x, i) ORDER BY i) END
$f$;
-- jsonb: wszystkie napisy w strukturze (bloki: text, trace, history, items[].text …)
CREATE OR REPLACE FUNCTION public.strip_refs(j jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $f$
  SELECT CASE jsonb_typeof(j)
    WHEN 'string' THEN to_jsonb(public.strip_refs(j #>> '{}'))
    WHEN 'array'  THEN (SELECT coalesce(jsonb_agg(public.strip_refs(e) ORDER BY i), '[]'::jsonb)
                          FROM jsonb_array_elements(j) WITH ORDINALITY u(e, i))
    WHEN 'object' THEN (SELECT coalesce(jsonb_object_agg(k, public.strip_refs(v)), '{}'::jsonb)
                          FROM jsonb_each(j) u(k, v))
    ELSE j END
$f$;

-- ── 3) Bloki przystanku (czysty tekst, tłumaczony) ─────────────────────────────────────────────
-- NULL = bloku brak (stan „none” i miejsce sprawdzenia trzyma ops.stop_research).
-- Kształty:  legend      {"text": "...", "trace": "ślad na miejscu, gdzie dokładnie", "history": "co mówi historia"}
--            curiosity   {"text": "2–4 zdania dla rodzica"}
--            fun_fact    {"text": "jedno zdanie dla dziecka"}
--            pop_culture {"items": [{"title": "...", "kind": "film|serial|book|song|game|art|person|other",
--                                    "year": "1985", "text": "co, gdzie, kto"}]}
CREATE TABLE IF NOT EXISTS public.stop_blocks (
  stop_id     int         NOT NULL REFERENCES public.stops(id) ON DELETE CASCADE,
  lang        text        NOT NULL REFERENCES public.languages(code),
  legend      jsonb,
  curiosity   jsonb,
  fun_fact    jsonb,
  pop_culture jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (stop_id, lang),
  CONSTRAINT stop_blocks_legend_shape      CHECK (legend      IS NULL OR (jsonb_typeof(legend) = 'object'      AND legend      ? 'text')),
  CONSTRAINT stop_blocks_curiosity_shape   CHECK (curiosity   IS NULL OR (jsonb_typeof(curiosity) = 'object'   AND curiosity   ? 'text')),
  CONSTRAINT stop_blocks_fun_fact_shape    CHECK (fun_fact    IS NULL OR (jsonb_typeof(fun_fact) = 'object'    AND fun_fact    ? 'text')),
  CONSTRAINT stop_blocks_pop_culture_shape CHECK (pop_culture IS NULL OR jsonb_typeof(pop_culture -> 'items') = 'array'),
  -- przypisy nie mają prawa trafić do tekstu publikowanego
  CONSTRAINT stop_blocks_no_refs CHECK (coalesce(legend::text, '') || coalesce(curiosity::text, '') ||
                                        coalesce(fun_fact::text, '') || coalesce(pop_culture::text, '') !~ '\[\d{1,3}\]')
);
ALTER TABLE public.stop_blocks OWNER TO quolino;
REVOKE ALL ON public.stop_blocks FROM PUBLIC;
DO $$BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_anon') THEN EXECUTE 'REVOKE ALL ON public.stop_blocks FROM web_anon'; END IF;
END$$;

-- ── 4) Warstwa redakcyjna: przypisy, źródła, stan bloków, kontrola ─────────────────────────────
-- marked: wersja PL z przypisami [n] — {"desc_paragraphs": [...], "legend": {...}, "curiosity": {...},
--          "fun_fact": {...}, "pop_culture": {...}}  (te same kształty co stop_blocks)
-- state:  {"legend": {"state": "found|none", "checked": "gdzie szukano"}, "curiosity": {...}, "fun_fact": {...},
--          "pop_culture": {...}}
-- sources: [{"n": 1, "url": "https://...", "title": "...", "lang": "it", "accessed": "2026-10-18"}]
-- check:  ostatni wynik kontroli Claude (przypisy otwarte, powtórzenia, sens) — {"verdict": "ok|fix", "errors": [...], ...}
CREATE TABLE IF NOT EXISTS ops.stop_research (
  stop_id    int         PRIMARY KEY REFERENCES public.stops(id) ON DELETE CASCADE,
  marked     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  state      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  sources    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  check_result jsonb,
  checked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stop_research_sources_array CHECK (jsonb_typeof(sources) = 'array')
);
ALTER TABLE ops.stop_research OWNER TO quolino;
REVOKE ALL ON ops.stop_research FROM PUBLIC;

-- Stan przystanków dla redakcji i walidatora: co jest, czego brak, przypisy bez źródła, źródła bez przypisu.
CREATE OR REPLACE VIEW ops.stop_content_status AS
WITH r AS (
  SELECT s.id AS stop_id, s.city_slug, s.stop_key, s.stop_number, s.category, c.content_v2, c.access,
         sr.marked, sr.state, sr.sources, sr.check_result, sr.checked_at,
         ARRAY(SELECT DISTINCT (m[1])::int FROM regexp_matches(coalesce(sr.marked::text, ''), '\[(\d{1,3})\]', 'g') m) AS refs_used,
         ARRAY(SELECT (e ->> 'n')::int FROM jsonb_array_elements(coalesce(sr.sources, '[]')) e WHERE e ? 'n') AS refs_defined
    FROM public.stops s
    JOIN public.cities c ON c.slug = s.city_slug
    LEFT JOIN ops.stop_research sr ON sr.stop_id = s.id
)
SELECT stop_id, city_slug, stop_key, stop_number, category, content_v2, access,
       coalesce(state #>> '{legend,state}',      'missing') AS legend,
       coalesce(state #>> '{curiosity,state}',   'missing') AS curiosity,
       coalesce(state #>> '{fun_fact,state}',    'missing') AS fun_fact,
       coalesce(state #>> '{pop_culture,state}', 'missing') AS pop_culture,
       coalesce(jsonb_array_length(sources), 0)            AS sources_count,
       ARRAY(SELECT x FROM unnest(refs_used) x EXCEPT SELECT y FROM unnest(refs_defined) y ORDER BY 1) AS refs_without_source,
       ARRAY(SELECT y FROM unnest(refs_defined) y EXCEPT SELECT x FROM unnest(refs_used) x ORDER BY 1) AS sources_unused,
       check_result ->> 'verdict' AS check_verdict, checked_at
  FROM r;
ALTER VIEW ops.stop_content_status OWNER TO quolino;
REVOKE ALL ON ops.stop_content_status FROM PUBLIC;

-- ── 5) Widoki publiczne (gość, Google) ─────────────────────────────────────────────────────────
-- Kolumny dotychczasowe bez zmian; nowe na końcu (wymóg CREATE OR REPLACE VIEW).
CREATE OR REPLACE VIEW public.public_cities AS
SELECT c.slug, c.country, c.region, c.region_slug, c.sort_order, c.status,
       c.lat, c.lon, c.bandana_color, c.duration_type, c.duration_hours,
       c.hero_image, c.wiki_article, c.wiki_lang,
       (SELECT count(*) FROM public.stops s WHERE s.city_slug = c.slug)::int AS stops_count,
       (SELECT count(DISTINCT t.stop_id) FROM public.stop_translations t JOIN public.stops s ON s.id = t.stop_id
         WHERE s.city_slug = c.slug AND btrim(coalesce(t.kids_box, '')) <> '')::int AS missions_count,
       c.access, c.content_v2
  FROM public.cities c
 WHERE c.status = 'published';

-- Przystanek publicznie: miasto przerobione (content_v2) → cały opis bez przypisów + nazwy dostępnych bloków
-- (do pasa „Po zalogowaniu: …”); miasto stare → akapity 1–2 jak dotąd. Treści bloków tu nie ma.
CREATE OR REPLACE VIEW public.public_stops AS
SELECT s.id AS stop_id, s.city_slug, s.stop_number, s.sort_order, s.stop_key, s.category, s.icon,
       s.hero_image, s.wiki_article,
       t.lang, t.name,
       CASE WHEN c.content_v2 THEN public.strip_refs(t.desc_paragraphs)
            ELSE public.strip_refs(t.desc_paragraphs[1:2]) END AS desc_paragraphs,
       coalesce(cardinality(t.desc_paragraphs), 0)    AS paragraphs_total,
       (btrim(coalesce(t.kids_box, '')) <> '')        AS has_mission,
       array_remove(ARRAY[
         CASE WHEN b.legend      IS NOT NULL THEN 'legend'      END,
         CASE WHEN b.curiosity   IS NOT NULL THEN 'curiosity'   END,
         CASE WHEN b.pop_culture IS NOT NULL THEN 'pop_culture' END], NULL) AS blocks
  FROM public.stops s
  JOIN public.cities c ON c.slug = s.city_slug AND c.status = 'published'
  JOIN public.stop_translations t ON t.stop_id = s.id
  LEFT JOIN public.stop_blocks b ON b.stop_id = s.id AND b.lang = t.lang;

ALTER VIEW public.public_cities OWNER TO quolino;
ALTER VIEW public.public_stops  OWNER TO quolino;
GRANT SELECT ON public.public_cities, public.public_stops TO web_anon;

-- ── 6) Pełna wycieczka: bloki przystanku, bez przypisów i bez źródeł ───────────────────────────
-- Jak w 2026-10-13-dostep-krok1.sql, plus: stops[].stop_blocks; tekst przepuszczony przez strip_refs;
-- kolumna stops.sources (stare linki redakcyjne) usunięta z odpowiedzi.
CREATE OR REPLACE FUNCTION public.trip_full(p_slug text, p_lang text, p_key text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE k public.access_keys; c public.cities; langs text[]; used int;
BEGIN
  IF p_key IS NULL OR length(p_key) < 24 OR p_slug IS NULL THEN RETURN jsonb_build_object('error', 'invalid_key'); END IF;
  SELECT * INTO k FROM public.access_keys
   WHERE key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex') AND revoked_at IS NULL AND expires_at > now();
  IF k.id IS NULL THEN RETURN jsonb_build_object('error', 'invalid_key'); END IF;

  SELECT count(*) INTO used FROM public.access_key_usage WHERE key_id = k.id AND used_at > now() - interval '1 hour';
  IF used >= k.hourly_limit THEN RETURN jsonb_build_object('error', 'rate_limit'); END IF;

  SELECT * INTO c FROM public.cities WHERE slug = p_slug AND status = 'published';
  IF c.slug IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  INSERT INTO public.access_key_usage (key_id, city_slug, lang) VALUES (k.id, p_slug, left(coalesce(p_lang, ''), 8));
  langs := ARRAY(SELECT DISTINCT unnest(ARRAY[coalesce(p_lang, 'pl'), 'en', 'pl']));

  RETURN jsonb_build_object(
    'city', to_jsonb(c),
    'city_translations', coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM public.city_translations t
                                    WHERE t.city_slug = p_slug AND t.lang = ANY(langs)), '[]'),
    'stops', coalesce((SELECT jsonb_agg((to_jsonb(s) - 'sources') || jsonb_build_object(
                         'stop_translations',
                           coalesce((SELECT jsonb_agg(public.strip_refs(to_jsonb(t))) FROM public.stop_translations t
                                      WHERE t.stop_id = s.id AND t.lang = ANY(langs)), '[]'),
                         'stop_blocks',
                           coalesce((SELECT jsonb_agg(public.strip_refs(to_jsonb(b) - 'updated_at')) FROM public.stop_blocks b
                                      WHERE b.stop_id = s.id AND b.lang = ANY(langs)), '[]'))
                         ORDER BY s.sort_order)
                        FROM public.stops s WHERE s.city_slug = p_slug), '[]'),
    'emergency_points', coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.sort_order) FROM public.emergency_points e
                                   WHERE e.city_slug = p_slug AND e.lang = ANY(langs)), '[]'),
    'day_plan', coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.sort_order) FROM public.day_plan d
                           WHERE d.city_slug = p_slug AND d.lang = ANY(langs)), '[]'),
    'phrases', coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.sort_order) FROM public.phrases p
                          WHERE p.country = c.country AND p.lang = ANY(langs)), '[]'),
    'phone_numbers', coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.sort_order) FROM public.phone_numbers n
                                WHERE n.country_slug = c.country AND (n.city_slug IS NULL OR n.city_slug = p_slug)), '[]'),
    'route', (SELECT to_jsonb(r) FROM public.city_routes r WHERE r.city_slug = p_slug)
  );
END $f$;
ALTER FUNCTION public.trip_full(text, text, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION public.trip_full(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trip_full(text, text, text) TO web_anon, quolino;

-- ── 7) Publikacja przystanku z wersji redakcyjnej ──────────────────────────────────────────────
-- Hermes/import: zapisuje wersję z przypisami do ops.stop_research, a ta funkcja kopiuje PL bez przypisów
-- do stop_translations.desc_paragraphs i stop_blocks. Tłumaczenia idą osobno (już bez przypisów).
CREATE OR REPLACE FUNCTION ops.stop_publish_pl(p_stop_id int) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, ops, pg_temp AS $f$
DECLARE m jsonb;
BEGIN
  SELECT marked INTO m FROM ops.stop_research WHERE stop_id = p_stop_id;
  IF m IS NULL THEN RAISE EXCEPTION 'brak wersji redakcyjnej dla przystanku %', p_stop_id; END IF;
  IF m ? 'desc_paragraphs' THEN
    UPDATE public.stop_translations
       SET desc_paragraphs = public.strip_refs(ARRAY(SELECT jsonb_array_elements_text(m -> 'desc_paragraphs'))),
           updated_at = now()
     WHERE stop_id = p_stop_id AND lang = 'pl';
  END IF;
  INSERT INTO public.stop_blocks (stop_id, lang, legend, curiosity, fun_fact, pop_culture, updated_at)
  VALUES (p_stop_id, 'pl',
          public.strip_refs(nullif(m -> 'legend', 'null')),   public.strip_refs(nullif(m -> 'curiosity', 'null')),
          public.strip_refs(nullif(m -> 'fun_fact', 'null')), public.strip_refs(nullif(m -> 'pop_culture', 'null')), now())
  ON CONFLICT (stop_id, lang) DO UPDATE SET legend = EXCLUDED.legend, curiosity = EXCLUDED.curiosity,
         fun_fact = EXCLUDED.fun_fact, pop_culture = EXCLUDED.pop_culture, updated_at = now();
END $f$;
ALTER FUNCTION ops.stop_publish_pl(int) OWNER TO quolino;
REVOKE ALL ON FUNCTION ops.stop_publish_pl(int) FROM PUBLIC;

NOTIFY pgrst, 'reload schema';
COMMIT;
