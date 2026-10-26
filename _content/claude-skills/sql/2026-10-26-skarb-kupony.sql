-- Skarb Quo → kupon dla rodzica (decyzje JP 2026-10-26; docs/KONTO-RODZICA.md §6, docs/BACKEND.md §9).
-- W grze (gra/, nagroda za wycieczkę) na poziomie „trudny” jest ukryta skrzynia „Skarb Quo”. Dziecko nie widzi nic
-- handlowego — gra zapisuje tylko slug wycieczki w localStorage `quolino_game_treasure_pending`. Panel rodzica (konto.html)
-- po zalogowaniu wywołuje claim_game_treasure i pokazuje kupon:
--   −30% na następną wycieczkę · ważny 7 dni od wydania · jednorazowy · jeden kupon na konto na wycieczkę (source 'gra') ·
--   kupony NIE łączą się (najwyżej jeden kupon na zamówienie) · skarby działają od startu płatności (ops.app_settings
--   'treasure_from', domyślnie 2027-06-01); wcześniej RPC odmawia, chyba że wywołuje admin (ops.member_admins, do testów).
-- Traefik zdejmuje nagłówek Authorization przed PostgREST, więc — jak w trip_member — token logowania (GoTrue, HS256) idzie
-- w treści wywołania (p_token), a baza sama sprawdza podpis, ważność i rolę (ops.jwt_claims). Bez ważnego tokenu: odmowa.
-- Wymaga 2026-10-18-trip-member.sql (ops.jwt_claims, pgcrypto w schemacie ops) i schematu auth (GoTrue).
-- Bezpieczne do powtórzenia (IF NOT EXISTS / CREATE OR REPLACE). W całości albo wcale. Wykonuje root po `deploy.sh approve`.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA ops;
GRANT USAGE ON SCHEMA ops TO quolino;
GRANT USAGE ON SCHEMA auth TO quolino;
GRANT REFERENCES ON auth.users TO quolino;

-- ── 1) Ustawienia serwera (tylko właściciel; zmiana: UPDATE ops.app_settings SET value = … WHERE name = …) ─────────────
CREATE TABLE IF NOT EXISTS ops.app_settings (
  name       text PRIMARY KEY,
  value      text NOT NULL,
  note       text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ops.app_settings OWNER TO quolino;
REVOKE ALL ON ops.app_settings FROM PUBLIC;
-- DO NOTHING: ponowne uruchomienie pliku nie nadpisze zmienionej wartości
INSERT INTO ops.app_settings (name, value, note) VALUES
  ('treasure_from', '2027-06-01 00:00:00+02', 'Od kiedy Skarb Quo z gry wydaje kupony (start płatności, docs/PM.md §0). Wcześniej tylko admin.')
ON CONFLICT (name) DO NOTHING;

-- ── 2) Admini wśród kont rodziców (testy przed startem). Dopisanie: ─────────────────────────────────────────────────
--   INSERT INTO ops.member_admins (sub, note) SELECT id, 'JP' FROM auth.users WHERE email = '…' ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS ops.member_admins (
  sub        uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ops.member_admins OWNER TO quolino;
REVOKE ALL ON ops.member_admins FROM PUBLIC;

CREATE OR REPLACE FUNCTION ops.is_member_admin(p_sub uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ops, pg_temp AS $f$
  SELECT EXISTS (SELECT 1 FROM ops.member_admins WHERE sub = p_sub)
$f$;
ALTER FUNCTION ops.is_member_admin(uuid) OWNER TO quolino;
REVOKE ALL ON FUNCTION ops.is_member_admin(uuid) FROM PUBLIC;

-- ── 3) Kupony ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- ZASADA „KUPONY SIĘ NIE ŁĄCZĄ” (JP 2026-10-26): do jednego zamówienia najwyżej JEDEN kupon.
-- Przyszła funkcja płatności (checkout) musi: (a) przyjąć co najwyżej jeden kod, (b) w jednej transakcji
--   UPDATE public.coupons SET used_at = now(), order_ref = <id zamówienia>
--    WHERE code = <kod> AND user_id = <konto> AND used_at IS NULL AND expires_at > now();
--   i sprawdzić ROW_COUNT = 1, (c) nie łączyć kuponu z kodem rabatowym z promo_codes (gdy powstanie) — też jeden na zamówienie.
-- Tabeli zamówień jeszcze nie ma; zanim powstanie, regułę pilnuje indeks coupons_one_per_order (jedno order_ref = jeden kupon).
-- Gdy powstanie public.orders: dodać FK order_ref → orders i ewentualnie orders.coupon_code UNIQUE.
CREATE TABLE IF NOT EXISTS public.coupons (
  id         bigserial PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  code       text        NOT NULL UNIQUE CHECK (code ~ '^QUO-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'),
  percent    int         NOT NULL CHECK (percent BETWEEN 1 AND 50),
  source     text        NOT NULL CHECK (source IN ('gra')),
  trip_slug  text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  order_ref  text,
  CONSTRAINT coupons_one_per_trip UNIQUE (user_id, source, trip_slug),
  CONSTRAINT coupons_gra_trip     CHECK (source <> 'gra' OR trip_slug IS NOT NULL),
  CONSTRAINT coupons_expiry       CHECK (expires_at > created_at),
  CONSTRAINT coupons_used_order   CHECK ((used_at IS NULL) = (order_ref IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS coupons_one_per_order ON public.coupons (order_ref) WHERE order_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS coupons_user_time ON public.coupons (user_id, created_at DESC);
ALTER TABLE public.coupons OWNER TO quolino;
-- Nikt poza właścicielem nie czyta ani nie pisze bezpośrednio; strona korzysta tylko z RPC poniżej.
REVOKE ALL ON public.coupons FROM PUBLIC, web_anon;
REVOKE ALL ON SEQUENCE public.coupons_id_seq FROM PUBLIC, web_anon;
-- RLS jako druga linia obrony: gdyby kiedyś rola z tokenem logowania dostała SELECT, zobaczy tylko swoje wiersze;
-- polityk INSERT/UPDATE/DELETE nie ma, więc bezpośredni zapis jest zablokowany. Właściciel (funkcje SECURITY DEFINER) omija RLS.
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coupons_select_own ON public.coupons;
CREATE POLICY coupons_select_own ON public.coupons FOR SELECT
  USING (user_id = nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid);
COMMENT ON TABLE public.coupons IS
  'Kupony rodzica (Skarb Quo z gry: −30%, 7 dni, jednorazowy). NIE łączą się: jeden kupon na zamówienie (indeks coupons_one_per_order; egzekwować w RPC płatności).';

-- Kod QUO-XXXX-XXXX: 8 znaków z 32-znakowego alfabetu bez 0/O/1/I (40 bitów losowości; 256 % 32 = 0, więc bez przekrzywienia).
-- Ten sam format co kody z docs/KONTO-RODZICA.md §2 — przyszła tabela promo_codes musi sprawdzać unikalność także tutaj.
CREATE OR REPLACE FUNCTION ops.coupon_code() RETURNS text
LANGUAGE plpgsql VOLATILE SET search_path = ops, pg_temp AS $f$
DECLARE a constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea := ops.gen_random_bytes(8); s text := ''; i int;
BEGIN
  FOR i IN 0..7 LOOP s := s || substr(a, get_byte(b, i) % 32 + 1, 1); END LOOP;
  RETURN 'QUO-' || substr(s, 1, 4) || '-' || substr(s, 5, 4);
END $f$;
ALTER FUNCTION ops.coupon_code() OWNER TO quolino;
REVOKE ALL ON FUNCTION ops.coupon_code() FROM PUBLIC;

-- ── 4) RPC: odbiór skarbu ─────────────────────────────────────────────────────────────────────────────────────────
-- POST /rpc/claim_game_treasure {"p_trip":"frasassi","p_level":"trudny","p_token":"<access token>"}
-- → {"code":"QUO-…","percent":30,"expires_at":"…","trip_slug":"frasassi","new":true|false}
--   albo {"error":"invalid_session|not_yet|level|not_found|rate_limit"} (not_yet zwraca też "from").
-- Ten sam skarb drugi raz → ten sam kupon (new=false), nowy się nie tworzy. Limit: 5 nowych kuponów z gry na konto na dobę.
CREATE OR REPLACE FUNCTION public.claim_game_treasure(p_trip text, p_level text, p_token text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE cl jsonb; v_sub uuid; v_from timestamptz; v_trip text := lower(btrim(coalesce(p_trip, ''))); c public.coupons; n int; tries int := 0;
BEGIN
  cl := ops.jwt_claims(p_token);
  IF cl IS NULL THEN RETURN jsonb_build_object('error', 'invalid_session'); END IF;
  v_sub := (cl ->> 'sub')::uuid;

  SELECT value::timestamptz INTO v_from FROM ops.app_settings WHERE name = 'treasure_from';
  v_from := coalesce(v_from, timestamptz '2027-06-01 00:00:00+02');
  IF now() < v_from AND NOT ops.is_member_admin(v_sub) THEN
    RETURN jsonb_build_object('error', 'not_yet', 'from', v_from);
  END IF;
  IF p_level IS DISTINCT FROM 'trudny' THEN RETURN jsonb_build_object('error', 'level'); END IF;
  IF length(v_trip) > 80 OR NOT EXISTS (SELECT 1 FROM public.cities WHERE slug = v_trip AND status = 'published') THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  -- jedno konto naraz (dwie karty, podwójne kliknięcie): limit i „już odebrany” liczone bez wyścigu
  PERFORM pg_advisory_xact_lock(hashtext('coupon:' || v_sub::text));

  SELECT * INTO c FROM public.coupons WHERE user_id = v_sub AND source = 'gra' AND trip_slug = v_trip;
  IF c.id IS NOT NULL THEN
    RETURN jsonb_build_object('code', c.code, 'percent', c.percent, 'expires_at', c.expires_at, 'trip_slug', c.trip_slug, 'new', false);
  END IF;

  SELECT count(*) INTO n FROM public.coupons WHERE user_id = v_sub AND source = 'gra' AND created_at > now() - interval '1 day';
  IF n >= 5 THEN RETURN jsonb_build_object('error', 'rate_limit'); END IF;

  LOOP
    BEGIN
      INSERT INTO public.coupons (user_id, code, percent, source, trip_slug, expires_at)
      VALUES (v_sub, ops.coupon_code(), 30, 'gra', v_trip, now() + interval '7 days')
      ON CONFLICT (user_id, source, trip_slug) DO NOTHING
      RETURNING * INTO c;
      EXIT;
    EXCEPTION WHEN unique_violation THEN          -- kolizja kodu (40 bitów — praktycznie nigdy): losujemy jeszcze raz
      tries := tries + 1;
      IF tries >= 5 THEN RAISE; END IF;
    END;
  END LOOP;
  IF c.id IS NULL THEN
    SELECT * INTO c FROM public.coupons WHERE user_id = v_sub AND source = 'gra' AND trip_slug = v_trip;
    RETURN jsonb_build_object('code', c.code, 'percent', c.percent, 'expires_at', c.expires_at, 'trip_slug', c.trip_slug, 'new', false);
  END IF;
  RETURN jsonb_build_object('code', c.code, 'percent', c.percent, 'expires_at', c.expires_at, 'trip_slug', c.trip_slug, 'new', true);
END $f$;
ALTER FUNCTION public.claim_game_treasure(text, text, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION public.claim_game_treasure(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_game_treasure(text, text, text) TO web_anon, quolino;

-- ── 5) RPC: moje kupony ───────────────────────────────────────────────────────────────────────────────────────────
-- POST /rpc/my_coupons {"p_token":"<access token>","p_lang":"pl"}
-- → {"coupons":[{code, percent, source, trip_slug, trip_title, created_at, expires_at, used_at, state: active|expired|used}]}
--   albo {"error":"invalid_session"}. Kolejność: aktywne, potem od najnowszych.
CREATE OR REPLACE FUNCTION public.my_coupons(p_token text, p_lang text DEFAULT 'pl') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE cl jsonb; v_sub uuid; v_lang text := left(lower(coalesce(p_lang, 'pl')), 8);
BEGIN
  cl := ops.jwt_claims(p_token);
  IF cl IS NULL THEN RETURN jsonb_build_object('error', 'invalid_session'); END IF;
  v_sub := (cl ->> 'sub')::uuid;
  RETURN jsonb_build_object('coupons', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'code', k.code, 'percent', k.percent, 'source', k.source, 'trip_slug', k.trip_slug,
             'trip_title', (SELECT t.title FROM public.city_translations t
                             WHERE t.city_slug = k.trip_slug AND t.lang IN (v_lang, 'en', 'pl')
                             ORDER BY t.lang = v_lang DESC, t.lang = 'en' DESC LIMIT 1),
             'created_at', k.created_at, 'expires_at', k.expires_at, 'used_at', k.used_at, 'state', k.state)
           ORDER BY k.state = 'active' DESC, k.created_at DESC)
      FROM (SELECT c.*, CASE WHEN c.used_at IS NOT NULL THEN 'used' WHEN c.expires_at <= now() THEN 'expired' ELSE 'active' END AS state
              FROM public.coupons c WHERE c.user_id = v_sub) k), '[]'::jsonb));
END $f$;
ALTER FUNCTION public.my_coupons(text, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION public.my_coupons(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_coupons(text, text) TO web_anon, quolino;

NOTIFY pgrst, 'reload schema';
COMMIT;
