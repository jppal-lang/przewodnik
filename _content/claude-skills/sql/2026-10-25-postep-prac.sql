-- 2026-10-25 (JP): dashboard „Postęp prac” w panelu admina — etap każdej wycieczki, sygnatury czasu, zużyte tokeny.
-- gemini-draft.mjs zapisuje każdy krok do public.pipeline_events (narastające tokeny Gemini/Claude w ramach przebiegu).
-- Panel czyta admin.pipeline_runs (przebiegi), admin.pipeline_events (kroki), admin.pipeline_queue (kolejka ops.jobs).
-- Bezpieczne do powtórzenia. Wykonuje root (schemat admin).
BEGIN;
CREATE TABLE IF NOT EXISTS public.pipeline_events (
  id            bigserial PRIMARY KEY,
  run_id        text NOT NULL,
  city_slug     text NOT NULL,
  kind          text NOT NULL DEFAULT 'draft',      -- draft | revise
  stage         int  NOT NULL DEFAULT 0,            -- 1 research, 2 szkic, 3 bloki, 4 kontrola przystanków, 5 kontrola trasy, 6 zapis, 7 gotowe, 8 poprawki JP
  stop_k        int,
  stops_n       int,
  message       text,
  status        text NOT NULL DEFAULT 'running',    -- running | done | error
  gemini_tokens bigint NOT NULL DEFAULT 0,          -- narastająco w przebiegu
  gemini_calls  int    NOT NULL DEFAULT 0,
  claude_tokens bigint NOT NULL DEFAULT 0,
  claude_calls  int    NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pipeline_events_run ON public.pipeline_events (run_id, id);
CREATE INDEX IF NOT EXISTS pipeline_events_time ON public.pipeline_events (created_at DESC);
ALTER TABLE public.pipeline_events OWNER TO quolino;
REVOKE ALL ON public.pipeline_events FROM PUBLIC;

CREATE OR REPLACE VIEW admin.pipeline_runs AS
WITH last AS (
  SELECT DISTINCT ON (run_id) run_id, city_slug, kind, stage, stop_k, stops_n, message, status, created_at
    FROM public.pipeline_events ORDER BY run_id, id DESC
), agg AS (
  SELECT run_id, min(created_at) AS started_at, max(created_at) AS last_at, count(*)::int AS steps,
         max(gemini_tokens) AS gemini_tokens, max(gemini_calls) AS gemini_calls,
         max(claude_tokens) AS claude_tokens, max(claude_calls) AS claude_calls, max(stage) AS max_stage
    FROM public.pipeline_events GROUP BY run_id
)
SELECT l.run_id, l.city_slug, l.kind, a.max_stage AS stage, l.stop_k, l.stops_n, l.message AS last_message,
       CASE WHEN l.status = 'running' AND a.last_at < now() - interval '15 minutes' THEN 'stalled' ELSE l.status END AS status,
       a.started_at, a.last_at, a.steps, a.gemini_tokens, a.gemini_calls, a.claude_tokens, a.claude_calls,
       extract(epoch FROM (a.last_at - a.started_at))::int AS seconds
  FROM last l JOIN agg a USING (run_id);
ALTER VIEW admin.pipeline_runs OWNER TO quolino;
GRANT SELECT ON admin.pipeline_runs TO quolino_admin;

CREATE OR REPLACE VIEW admin.pipeline_events AS
  SELECT id, run_id, city_slug, stage, stop_k, stops_n, message, status, gemini_tokens, claude_tokens, created_at
    FROM public.pipeline_events WHERE created_at > now() - interval '60 days';
ALTER VIEW admin.pipeline_events OWNER TO quolino;
GRANT SELECT ON admin.pipeline_events TO quolino_admin;

CREATE OR REPLACE VIEW admin.pipeline_queue AS
  SELECT id, city_slug, status, left(request, 300) AS request, result, created_at, finished_at
    FROM ops.jobs WHERE worker = 'gemini' AND created_at > now() - interval '60 days';
ALTER VIEW admin.pipeline_queue OWNER TO quolino;
GRANT SELECT ON admin.pipeline_queue TO quolino_admin;

NOTIFY pgrst, 'reload schema';
COMMIT;
