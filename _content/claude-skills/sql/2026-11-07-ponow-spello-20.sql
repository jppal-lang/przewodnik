-- Spello #20: 85 odpowiedzi na flagi odrzucone, bo trasa bez znacznika workflow szła starym torem (naprawione 2f7a7a3) — jeszcze raz.
BEGIN;
WITH r AS (
  UPDATE public.draft_revision_requests SET status = 'new', attempts = 0, hermes_reply = 'Ponowione po naprawie toru poprawek (2026-11-07).', updated_at = now()
   WHERE id = 20 AND status = 'failed' AND updated_at < '2026-11-07 20:30+00'
  RETURNING comment_ids)
UPDATE public.draft_comments SET status = 'sent', hermes_reply = NULL, updated_at = now()
 WHERE id IN (SELECT unnest(comment_ids) FROM r) AND status IN ('rejected', 'needs_jp', 'new');
COMMIT;
