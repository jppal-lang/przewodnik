-- 2026-10-25 (JP): karta „Koszty AI” w panelu admina — wszystkie modele, za co odpowiadają, tokeny, kwoty; tygodnie i miesiące.
-- Dziennik: work/costs.jsonl (dopisują lib.mjs: Claude i OpenRouter, gemini-draft.mjs: Gemini/Antigravity).
-- ai-usage-import.mjs przenosi dziennik do public.ai_usage (klucz k = skrót wiersza, bez duplikatów)
-- i uzupełnia stare przebiegi bez wpisów w dzienniku z public.pipeline_events.
-- Bezpieczne do powtórzenia. Wykonuje root (schemat admin).
BEGIN;
CREATE TABLE IF NOT EXISTS public.ai_usage (
  k          text PRIMARY KEY,
  at         timestamptz NOT NULL,
  provider   text NOT NULL,            -- gemini | claude | openrouter
  model      text,
  role       text,                     -- za co odpowiada (research, szkic, kontrola faktów, tłumaczenie…)
  billing    text NOT NULL DEFAULT 'api',  -- abonament | darmowe | api
  city_slug  text,
  run_id     text,
  calls      int    NOT NULL DEFAULT 1,
  tokens_in  bigint NOT NULL DEFAULT 0,
  tokens_out bigint NOT NULL DEFAULT 0,
  usd        numeric(12,6) NOT NULL DEFAULT 0,   -- realnie zapłacone
  usd_equiv  numeric(12,6) NOT NULL DEFAULT 0    -- równowartość cennika API (przy abonamencie)
);
CREATE INDEX IF NOT EXISTS ai_usage_at ON public.ai_usage (at DESC);
ALTER TABLE public.ai_usage OWNER TO quolino;
REVOKE ALL ON public.ai_usage FROM PUBLIC;

CREATE OR REPLACE VIEW admin.ai_usage_daily AS
  SELECT (at AT TIME ZONE 'Europe/Warsaw')::date AS day, provider, coalesce(model, '?') AS model, coalesce(role, 'inne') AS role, billing,
         sum(calls)::int AS calls, sum(tokens_in)::bigint AS tokens_in, sum(tokens_out)::bigint AS tokens_out,
         round(sum(usd), 4) AS usd, round(sum(usd_equiv), 4) AS usd_equiv
    FROM public.ai_usage WHERE at > now() - interval '400 days'
   GROUP BY 1, 2, 3, 4, 5;
ALTER VIEW admin.ai_usage_daily OWNER TO quolino;
GRANT SELECT ON admin.ai_usage_daily TO quolino_admin;

NOTIFY pgrst, 'reload schema';
COMMIT;
