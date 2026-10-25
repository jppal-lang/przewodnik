-- 2026-10-25 (JP): kategoryzacja zgłoszeń, opinii i wiadomości z formularza przez Jev (TypeSafe) — docs/ZGLOSZENIA-AI.md, etap 1–2.
-- reports-relay.mjs i contact-relay.mjs klasyfikują przed wysłaniem na Discord: kategoria, priorytet, pewność.
-- Spam z pewnością ≥ 0,9 nie idzie na Discord (liczony), P1 i bezpieczeństwo dodatkowo na #admin.
-- Bezpieczne do powtórzenia. Wykonuje root po `deploy.sh approve`.
BEGIN;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['ops.reports', 'ops.ratings', 'ops.contact_messages'] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS ai_category text', t);
      EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS ai_priority smallint', t);
      EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS ai_confidence real', t);
      EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS ai_model text', t);
      EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS classified_at timestamptz', t);
    END IF;
  END LOOP;
END $$;

-- panel admina (później zakładka „Zgłoszenia”): ostatnie 90 dni, bez identyfikatorów klienta i e-maili
CREATE OR REPLACE VIEW admin.feedback_ai AS
  SELECT 'zgłoszenie'::text AS source, id::text AS id, created_at, city_slug, stop_id::text AS stop, type AS kind, NULL::int AS stars,
         left(message, 500) AS body, lang, status, ai_category, ai_priority, ai_confidence, classified_at
    FROM ops.reports WHERE created_at > now() - interval '90 days'
  UNION ALL
  SELECT 'opinia', id::text, updated_at, city_slug, NULL, NULL, stars, left(comment, 500), lang, status, ai_category, ai_priority, ai_confidence, classified_at
    FROM ops.ratings WHERE stop_id IS NULL AND comment IS NOT NULL AND updated_at > now() - interval '90 days';
ALTER VIEW admin.feedback_ai OWNER TO quolino;
GRANT SELECT ON admin.feedback_ai TO quolino_admin;

NOTIFY pgrst, 'reload schema';
COMMIT;
