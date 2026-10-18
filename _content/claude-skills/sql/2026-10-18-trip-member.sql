-- Pełna wycieczka dla ZALOGOWANEGO (docs/KONTO-RODZICA.md, docs/TRESC-PRZYSTANKU.md; JP 2026-10-18).
-- Traefik zdejmuje nagłówek Authorization przed PostgREST, więc — jak przy kluczu testera — strona przekazuje token
-- logowania (GoTrue, HS256) w treści wywołania, a baza sama sprawdza podpis, ważność i rolę.
-- Sekret JWT trafia do ops.app_secrets wyłącznie przez ops/auth-init.sh (z /root/quolino-web/.env), nigdy przez repo.
-- Zasady dostępu: do 31.05.2027 zalogowany widzi wszystkie opublikowane trasy; od 1.06.2027 tylko trasy darmowe
-- (cities.access = 'free') i odblokowane — do tego dnia musi powstać tabela uprawnień (entitlements), inaczej 'locked'.
-- Bezpieczne do powtórzenia. W całości albo wcale.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA ops;
GRANT USAGE ON SCHEMA ops TO quolino;

-- ── 1) Sekrety serwera (tylko właściciel) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops.app_secrets (
  name       text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ops.app_secrets OWNER TO quolino;
REVOKE ALL ON ops.app_secrets FROM PUBLIC;

-- ── 2) Weryfikacja tokenu GoTrue ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ops.b64url_decode(p text) RETURNS bytea
LANGUAGE sql IMMUTABLE AS $f$
  SELECT decode(rpad(translate(p, '-_', '+/'), ((length(p) + 3) / 4) * 4, '='), 'base64')
$f$;

-- Zwraca claims tokenu albo NULL (zły podpis, wygasły, nie ta rola, brak sekretu, śmieci).
CREATE OR REPLACE FUNCTION ops.jwt_claims(p_token text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ops, pg_temp AS $f$
DECLARE secret text; parts text[]; hdr jsonb; claims jsonb; sig text;
BEGIN
  IF p_token IS NULL OR length(p_token) > 4096 THEN RETURN NULL; END IF;
  SELECT value INTO secret FROM ops.app_secrets WHERE name = 'gotrue_jwt';
  IF secret IS NULL THEN RETURN NULL; END IF;
  parts := string_to_array(p_token, '.');
  IF array_length(parts, 1) <> 3 THEN RETURN NULL; END IF;
  BEGIN
    hdr    := convert_from(ops.b64url_decode(parts[1]), 'UTF8')::jsonb;
    claims := convert_from(ops.b64url_decode(parts[2]), 'UTF8')::jsonb;
  EXCEPTION WHEN others THEN RETURN NULL;
  END;
  IF hdr ->> 'alg' IS DISTINCT FROM 'HS256' THEN RETURN NULL; END IF;
  sig := translate(rtrim(replace(encode(ops.hmac(convert_to(parts[1] || '.' || parts[2], 'UTF8'),
                                                 convert_to(secret, 'UTF8'), 'sha256'), 'base64'), E'\n', ''), '='), '+/', '-_');
  IF sig <> parts[3] THEN RETURN NULL; END IF;
  IF coalesce((claims ->> 'exp')::numeric, 0) < extract(epoch FROM now()) THEN RETURN NULL; END IF;
  IF claims ->> 'role' IS DISTINCT FROM 'authenticated' OR coalesce(claims ->> 'sub', '') = '' THEN RETURN NULL; END IF;
  RETURN claims;
END $f$;
ALTER FUNCTION ops.b64url_decode(text) OWNER TO quolino;
ALTER FUNCTION ops.jwt_claims(text)    OWNER TO quolino;
REVOKE ALL ON FUNCTION ops.jwt_claims(text) FROM PUBLIC;

-- ── 3) Treść pełnej wycieczki — jedno źródło dla trip_full (klucz testera) i trip_member (konto) ─
CREATE OR REPLACE FUNCTION ops.trip_payload(p_slug text, p_lang text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE c public.cities; langs text[];
BEGIN
  SELECT * INTO c FROM public.cities WHERE slug = p_slug AND status = 'published';
  IF c.slug IS NULL THEN RETURN NULL; END IF;
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
ALTER FUNCTION ops.trip_payload(text, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION ops.trip_payload(text, text) FROM PUBLIC;

-- klucz testera: bez zmian w zachowaniu, treść z ops.trip_payload
CREATE OR REPLACE FUNCTION public.trip_full(p_slug text, p_lang text, p_key text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE k public.access_keys; used int; payload jsonb;
BEGIN
  IF p_key IS NULL OR length(p_key) < 24 OR p_slug IS NULL THEN RETURN jsonb_build_object('error', 'invalid_key'); END IF;
  SELECT * INTO k FROM public.access_keys
   WHERE key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex') AND revoked_at IS NULL AND expires_at > now();
  IF k.id IS NULL THEN RETURN jsonb_build_object('error', 'invalid_key'); END IF;
  SELECT count(*) INTO used FROM public.access_key_usage WHERE key_id = k.id AND used_at > now() - interval '1 hour';
  IF used >= k.hourly_limit THEN RETURN jsonb_build_object('error', 'rate_limit'); END IF;
  payload := ops.trip_payload(p_slug, p_lang);
  IF payload IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  INSERT INTO public.access_key_usage (key_id, city_slug, lang) VALUES (k.id, p_slug, left(coalesce(p_lang, ''), 8));
  RETURN payload;
END $f$;
ALTER FUNCTION public.trip_full(text, text, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION public.trip_full(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trip_full(text, text, text) TO web_anon, quolino;

-- ── 4) Zalogowany ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops.member_usage (
  id        bigserial PRIMARY KEY,
  sub       uuid        NOT NULL,
  used_at   timestamptz NOT NULL DEFAULT now(),
  city_slug text,
  lang      text
);
CREATE INDEX IF NOT EXISTS member_usage_sub_time ON ops.member_usage (sub, used_at DESC);
ALTER TABLE ops.member_usage OWNER TO quolino;
REVOKE ALL ON ops.member_usage FROM PUBLIC;
REVOKE ALL ON SEQUENCE ops.member_usage_id_seq FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.trip_member(p_slug text, p_lang text, p_token text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE cl jsonb; v_sub uuid; used int; c public.cities; payload jsonb;
BEGIN
  cl := ops.jwt_claims(p_token);
  IF cl IS NULL THEN RETURN jsonb_build_object('error', 'invalid_session'); END IF;
  v_sub := (cl ->> 'sub')::uuid;
  SELECT count(*) INTO used FROM ops.member_usage WHERE sub = v_sub AND used_at > now() - interval '1 hour';
  IF used >= 300 THEN RETURN jsonb_build_object('error', 'rate_limit'); END IF;
  SELECT * INTO c FROM public.cities WHERE slug = p_slug AND status = 'published';
  IF c.slug IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  -- od startu płatności: tylko trasy darmowe, dopóki nie ma tabeli uprawnień (docs/KONTO-RODZICA.md §4)
  IF now() >= timestamptz '2027-06-01 00:00:00+02' AND c.access <> 'free' THEN
    RETURN jsonb_build_object('error', 'locked');
  END IF;
  payload := ops.trip_payload(p_slug, p_lang);
  INSERT INTO ops.member_usage (sub, city_slug, lang) VALUES (v_sub, p_slug, left(coalesce(p_lang, ''), 8));
  DELETE FROM ops.member_usage WHERE used_at < now() - interval '30 days';
  RETURN payload || jsonb_build_object('member', true);
END $f$;
ALTER FUNCTION public.trip_member(text, text, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION public.trip_member(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trip_member(text, text, text) TO web_anon, quolino;

-- ── 5) Teksty strony: konta już działają (PL + EN; reszta języków zwykłym torem tłumaczeń) ──────
INSERT INTO public.ui_translations (key, lang, value) VALUES
  ('access.full_text', 'pl', 'Po zalogowaniu zobaczysz plan dnia z godzinami, mapę trasy, parking, misje i zagadki dla dzieci, punkty awaryjne, pełne opisy przystanków oraz legendy, ciekawostki i popkulturę. Konto jest bezpłatne.'),
  ('access.full_text', 'en', 'After signing in you will see the day plan with times, the route map, parking, missions and riddles for children, emergency points, the full stop descriptions and the legends, curiosities and pop culture. The account is free.'),
  ('access.signup',    'pl', 'Załóż konto'),
  ('access.signup',    'en', 'Create an account'),
  ('access.signin',    'pl', 'Zaloguj się'),
  ('access.signin',    'en', 'Sign in'),
  ('access.session_bad', 'pl', 'Sesja wygasła. Zaloguj się ponownie.'),
  ('access.session_bad', 'en', 'Your session has expired. Please sign in again.'),
  ('access.blocks_after', 'pl', 'Po zalogowaniu'),
  ('access.blocks_after', 'en', 'After signing in'),
  ('block.legend',        'pl', 'legenda'),
  ('block.legend',        'en', 'legend'),
  ('block.curiosity',     'pl', 'ciekawostka'),
  ('block.curiosity',     'en', 'curiosity'),
  ('block.pop_culture',   'pl', 'w popkulturze'),
  ('block.pop_culture',   'en', 'in pop culture'),
  ('block.legend_title',  'pl', 'Legenda'),
  ('block.legend_title',  'en', 'Legend'),
  ('block.legend_trace',  'pl', 'Gdzie to zobaczyć'),
  ('block.legend_trace',  'en', 'Where to see it'),
  ('block.legend_history','pl', 'Co mówi historia'),
  ('block.legend_history','en', 'What history says'),
  ('block.curiosity_title','pl', 'Ciekawostka'),
  ('block.curiosity_title','en', 'Did you know'),
  ('block.pop_title',     'pl', 'W popkulturze'),
  ('block.pop_title',     'en', 'In pop culture')
ON CONFLICT (key, lang) DO UPDATE SET value = EXCLUDED.value;

NOTIFY pgrst, 'reload schema';
COMMIT;
