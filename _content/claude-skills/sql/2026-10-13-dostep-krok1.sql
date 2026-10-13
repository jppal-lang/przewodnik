-- Etap A, krok 1 (JP 2026-10-13): publicznie tylko opowieść, pełna wycieczka tylko z kluczem dostępu.
-- Ten plik TYLKO DODAJE: widoki publiczne, tabele kluczy, funkcje trip_full / access_key_check.
-- Nic nie odbiera — istniejąca strona działa dalej. Odbieranie uprawnień to krok 3 (osobny plik).
-- Bezpieczne do powtórzenia (IF NOT EXISTS / CREATE OR REPLACE). Wykonuje się w całości albo wcale.
BEGIN;

-- ── 1) Widoki publiczne (gość i Google) ─────────────────────────────────────────────────────────
-- Tylko opublikowane miasta. Widoki działają z prawami właściciela (quolino), więc po kroku 3
-- (odebranie web_anon dostępu do tabel) nadal działają.

-- miasto: tytuł, region, lead (w tłumaczeniach), zdjęcie; liczba przystanków i misji
CREATE OR REPLACE VIEW public.public_cities AS
SELECT c.slug, c.country, c.region, c.region_slug, c.sort_order, c.status,
       c.lat, c.lon, c.bandana_color, c.duration_type, c.duration_hours,
       c.hero_image, c.wiki_article, c.wiki_lang,
       (SELECT count(*) FROM public.stops s WHERE s.city_slug = c.slug)::int AS stops_count,
       (SELECT count(DISTINCT t.stop_id) FROM public.stop_translations t JOIN public.stops s ON s.id = t.stop_id
         WHERE s.city_slug = c.slug AND btrim(coalesce(t.kids_box, '')) <> '')::int AS missions_count
  FROM public.cities c
 WHERE c.status = 'published';

CREATE OR REPLACE VIEW public.public_city_translations AS
SELECT t.city_slug, t.lang, t.title, t.region_label, t.lead
  FROM public.city_translations t
  JOIN public.cities c ON c.slug = t.city_slug AND c.status = 'published';

-- przystanek: nazwa, kategoria, zdjęcie, pierwsze 2 akapity opisu (jeden wiersz = przystanek × język)
CREATE OR REPLACE VIEW public.public_stops AS
SELECT s.id AS stop_id, s.city_slug, s.stop_number, s.sort_order, s.stop_key, s.category, s.icon,
       s.hero_image, s.wiki_article,
       t.lang, t.name,
       t.desc_paragraphs[1:2]                         AS desc_paragraphs,
       coalesce(cardinality(t.desc_paragraphs), 0)    AS paragraphs_total,
       (btrim(coalesce(t.kids_box, '')) <> '')        AS has_mission
  FROM public.stops s
  JOIN public.cities c ON c.slug = s.city_slug AND c.status = 'published'
  JOIN public.stop_translations t ON t.stop_id = s.id;

ALTER VIEW public.public_cities             OWNER TO quolino;
ALTER VIEW public.public_city_translations  OWNER TO quolino;
ALTER VIEW public.public_stops              OWNER TO quolino;
GRANT SELECT ON public.public_cities, public.public_city_translations, public.public_stops TO web_anon;

-- ── 2) Klucze dostępu ──────────────────────────────────────────────────────────────────────────
-- W bazie leży wyłącznie skrót SHA-256 klucza; sam klucz widzi tylko osoba, która dostaje link.
CREATE TABLE IF NOT EXISTS public.access_keys (
  id           bigserial PRIMARY KEY,
  key_hash     text        NOT NULL UNIQUE,
  label        text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  created_by   text,
  hourly_limit int         NOT NULL DEFAULT 300
);
CREATE TABLE IF NOT EXISTS public.access_key_usage (
  id         bigserial PRIMARY KEY,
  key_id     bigint      NOT NULL REFERENCES public.access_keys(id) ON DELETE CASCADE,
  used_at    timestamptz NOT NULL DEFAULT now(),
  city_slug  text,
  lang       text
);
CREATE INDEX IF NOT EXISTS access_key_usage_key_time ON public.access_key_usage (key_id, used_at DESC);
ALTER TABLE public.access_keys      OWNER TO quolino;
ALTER TABLE public.access_key_usage OWNER TO quolino;
REVOKE ALL ON public.access_keys, public.access_key_usage FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.access_keys_id_seq, public.access_key_usage_id_seq FROM PUBLIC;

-- Prośby o link testowy: Hermes tylko zapisuje prośbę, klucz i wiadomość prywatną robi proces z kontekstu serwera
-- (cron, jak przy admin-link) — Hermes nigdy nie widzi klucza ani tokena bota.
CREATE TABLE IF NOT EXISTS ops.access_link_requests (
  id           bigserial PRIMARY KEY,
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by text,
  label        text NOT NULL,
  days         int  NOT NULL DEFAULT 60,
  done_at      timestamptz,
  result       text
);
ALTER TABLE ops.access_link_requests OWNER TO quolino;
REVOKE ALL ON ops.access_link_requests FROM PUBLIC;

-- ── 3) Funkcje dla strony (web_anon) ───────────────────────────────────────────────────────────
-- Czy klucz jest ważny (strona pokazuje po tym stan „zalogowany”). Nie zwraca treści.
CREATE OR REPLACE FUNCTION public.access_key_check(p_key text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
  SELECT CASE WHEN k.id IS NULL THEN jsonb_build_object('valid', false)
              ELSE jsonb_build_object('valid', true, 'label', k.label, 'expires_at', k.expires_at) END
    FROM (SELECT 1) x
    LEFT JOIN public.access_keys k
      ON k.key_hash = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex')
     AND k.revoked_at IS NULL AND k.expires_at > now()
     AND length(coalesce(p_key, '')) >= 24
$f$;

-- Pełna wycieczka: tylko z ważnym kluczem. Limit wywołań na klucz na godzinę (hourly_limit), log użycia.
-- Kształt odpowiedzi odpowiada dotychczasowym zapytaniom strony (stops z osadzonymi stop_translations itd.).
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
    'stops', coalesce((SELECT jsonb_agg(to_jsonb(s) || jsonb_build_object('stop_translations',
                         coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM public.stop_translations t
                                    WHERE t.stop_id = s.id AND t.lang = ANY(langs)), '[]')) ORDER BY s.sort_order)
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

ALTER FUNCTION public.access_key_check(text)          OWNER TO quolino;
ALTER FUNCTION public.trip_full(text, text, text)     OWNER TO quolino;
REVOKE ALL ON FUNCTION public.access_key_check(text), public.trip_full(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.access_key_check(text), public.trip_full(text, text, text) TO web_anon, quolino;

NOTIFY pgrst, 'reload schema';
COMMIT;
