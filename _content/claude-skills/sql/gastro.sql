-- Punkty gastro: comiesięczny przegląd ocen Google (gastro-refresh.mjs, cron 1. dnia miesiąca). 2026-10-11.
BEGIN;
ALTER TABLE public.stops ADD COLUMN IF NOT EXISTS rating            numeric(2,1);
ALTER TABLE public.stops ADD COLUMN IF NOT EXISTS reviews_count     int;
ALTER TABLE public.stops ADD COLUMN IF NOT EXISTS google_place_id   text;
ALTER TABLE public.stops ADD COLUMN IF NOT EXISTS business_status   text;
ALTER TABLE public.stops ADD COLUMN IF NOT EXISTS rating_checked_at timestamptz;

CREATE TABLE IF NOT EXISTS public.gastro_checks (
  id              bigserial PRIMARY KEY,
  checked_at      timestamptz NOT NULL DEFAULT now(),
  stop_id         int,
  city_slug       text NOT NULL,
  stop_key        text,
  place_id        text,
  name_google     text,
  rating          numeric(2,1),
  reviews_count   int,
  business_status text,          -- OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY
  maps_url        text,
  error           text
);
CREATE INDEX IF NOT EXISTS gastro_checks_stop ON public.gastro_checks (stop_id, checked_at DESC);
ALTER TABLE public.gastro_checks OWNER TO quolino;
REVOKE ALL ON public.gastro_checks FROM PUBLIC;

-- panel admina: ostatni stan każdego lokalu
CREATE OR REPLACE VIEW admin.gastro_status AS
SELECT DISTINCT ON (g.stop_id) g.city_slug, g.stop_key, g.name_google, g.rating, g.reviews_count, g.business_status,
       g.maps_url, g.checked_at,
       (g.business_status IS DISTINCT FROM 'OPERATIONAL' OR g.rating < 4.1 OR coalesce(g.reviews_count, 0) <= 100) AS alarm
  FROM public.gastro_checks g ORDER BY g.stop_id, g.checked_at DESC;
ALTER VIEW admin.gastro_status OWNER TO quolino;
GRANT SELECT ON admin.gastro_status TO quolino_admin;
NOTIFY pgrst, 'reload schema';
COMMIT;
