-- Oceny jakości tłumaczeń (Claude) — niepubliczne; widoczne w panelu admina. 2026-10-08.
BEGIN;
CREATE TABLE IF NOT EXISTS public.translation_quality (
  city_slug  text NOT NULL REFERENCES public.cities(slug) ON UPDATE CASCADE ON DELETE CASCADE,
  lang       text NOT NULL REFERENCES public.languages(code),
  score      smallint CHECK (score BETWEEN 1 AND 5),
  summary    text,
  issues     jsonb NOT NULL DEFAULT '[]',
  models     text,
  reviewer   text NOT NULL DEFAULT 'claude',
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (city_slug, lang)
);
ALTER TABLE public.translation_quality OWNER TO quolino;
REVOKE ALL ON public.translation_quality FROM PUBLIC;
CREATE OR REPLACE VIEW admin.translation_quality AS
  SELECT city_slug, lang, score, summary, issues, models, reviewer, checked_at FROM public.translation_quality;
ALTER VIEW admin.translation_quality OWNER TO quolino;
GRANT SELECT ON admin.translation_quality TO quolino_admin;
NOTIFY pgrst, 'reload schema';
COMMIT;
