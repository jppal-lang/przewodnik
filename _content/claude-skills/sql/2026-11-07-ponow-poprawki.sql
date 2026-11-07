-- Ponowienie próśb o poprawkę, które padły przez błąd w kodzie (dayPlan0 w złej funkcji, naprawione a5ea3c1):
-- Asyż #19, Urbino #21; Spello #20 jeszcze raz (mógł paść z tego samego przebiegu). Jednorazowo, tylko gdy nadal „failed”.
BEGIN;
WITH r AS (
  UPDATE public.draft_revision_requests SET status = 'new', attempts = 0, hermes_reply = 'Ponowione po naprawie błędu w kodzie (2026-11-07).', updated_at = now()
   WHERE id IN (19, 20, 21) AND status = 'failed' AND updated_at < '2026-11-07 18:00+00'
  RETURNING comment_ids)
UPDATE public.draft_comments SET status = 'sent', hermes_reply = NULL, updated_at = now()
 WHERE id IN (SELECT unnest(comment_ids) FROM r) AND status IN ('rejected', 'needs_jp', 'new');
COMMIT;
