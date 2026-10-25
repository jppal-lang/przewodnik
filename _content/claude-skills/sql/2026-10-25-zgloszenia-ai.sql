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
      EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS jp_category text', t);   -- korekta JP w panelu (przykłady do oceny trafności)
    END IF;
  END LOOP;
END $$;

-- panel admina „Zgłoszenia”: ostatnie 90 dni, bez identyfikatorów klienta i bez e-maili (tylko „jest e-mail”)
CREATE OR REPLACE VIEW admin.feedback_ai AS
  SELECT 'report'::text AS source, id::text AS id, created_at AS at, city_slug, coalesce(stop_name, stop_id::text) AS stop, type AS kind, NULL::int AS stars,
         left(message, 1500) AS body, lang, status, NULL::boolean AS has_email,
         coalesce(jp_category, ai_category) AS category, ai_category, jp_category, ai_priority, ai_confidence, classified_at
    FROM ops.reports WHERE created_at > now() - interval '90 days'
  UNION ALL
  SELECT 'rating', id::text, updated_at, city_slug, NULL, NULL, stars, left(comment, 1500), lang, status, NULL,
         coalesce(jp_category, ai_category), ai_category, jp_category, ai_priority, ai_confidence, classified_at
    FROM ops.ratings WHERE stop_id IS NULL AND (comment IS NOT NULL OR stars <= 2) AND updated_at > now() - interval '90 days'
  UNION ALL
  SELECT 'contact', id::text, created_at, NULL, NULL, topic, NULL, left(body, 1500), lang, status, email IS NOT NULL,
         coalesce(jp_category, ai_category), ai_category, jp_category, ai_priority, ai_confidence, classified_at
    FROM ops.contact_messages WHERE created_at > now() - interval '90 days';
ALTER VIEW admin.feedback_ai OWNER TO quolino;
GRANT SELECT ON admin.feedback_ai TO quolino_admin;

-- status i korekta kategorii z panelu
CREATE OR REPLACE FUNCTION admin.admin_feedback_set(p_source text, p_id text, p_status text DEFAULT NULL, p_category text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, pg_temp AS $f$
DECLARE n int;
BEGIN
  IF p_category IS NOT NULL AND p_category !~ '^[a-z_]{3,30}$' THEN RAISE EXCEPTION 'Zła kategoria.'; END IF;
  IF p_source IN ('report', 'rating') THEN
    IF p_status IS NOT NULL AND p_status NOT IN ('new', 'reviewed', 'noted', 'fixed', 'rejected') THEN RAISE EXCEPTION 'Zły status.'; END IF;
    EXECUTE format('UPDATE ops.%I SET status = coalesce($2, status), jp_category = coalesce($3, jp_category) WHERE id::text = $1',
                   CASE p_source WHEN 'report' THEN 'reports' ELSE 'ratings' END) USING p_id, p_status, p_category;
    GET DIAGNOSTICS n = ROW_COUNT;
  ELSIF p_source = 'contact' THEN
    IF p_status IS NOT NULL AND p_status NOT IN ('new', 'seen', 'answered', 'spam', 'done') THEN RAISE EXCEPTION 'Zły status.'; END IF;
    UPDATE ops.contact_messages SET status = coalesce(p_status, status), jp_category = coalesce(p_category, jp_category), handled_at = now() WHERE id::text = p_id;
    GET DIAGNOSTICS n = ROW_COUNT;
  ELSE RAISE EXCEPTION 'Złe źródło.'; END IF;
  RETURN json_build_object('updated', n);
END $f$;
ALTER FUNCTION admin.admin_feedback_set(text, text, text, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.admin_feedback_set(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.admin_feedback_set(text, text, text, text) TO quolino_admin;

NOTIFY pgrst, 'reload schema';
COMMIT;
