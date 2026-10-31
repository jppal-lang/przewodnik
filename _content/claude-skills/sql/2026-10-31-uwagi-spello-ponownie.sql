-- Uwagi JP z panelu do Spello (prośba #3, 14 uwag, szkic v9 = v3f, wysłane 2026-10-31 10:44 UTC) przepadły przez błąd serwera:
-- gemini-draft.mjs wymagał GOOGLE_API_KEY na starcie, choć poprawki idą przez Antigravity → „failed”, uwagi „rejected”.
-- Błąd poprawiony w kodzie (ten sam commit). Ten plik przywraca prośbę #3 do kolejki: prośba → new (0 prób), jej uwagi → sent.
-- draft-comments.mjs (cron Hermesa co 3 min) zrobi z nich jedną nową wersję szkicu i odpowie w wątku Spello.
-- Prośba #2 (8 uwag do v7 z 2026-10-26) NIE jest tu przywracana — czeka na decyzję JP.
-- Bezpieczne do powtórzenia: zmienia tylko prośbę #3, i tylko gdy nadal jest „failed” z tym błędem.
BEGIN;

UPDATE public.draft_comments c SET status = 'sent', hermes_reply = NULL, updated_at = now()
  FROM public.draft_revision_requests r
 WHERE r.id = 3 AND r.city_slug = 'spello' AND r.status = 'failed' AND r.hermes_reply LIKE '%Brak GOOGLE_API_KEY%'
   AND c.id = ANY (r.comment_ids) AND c.status = 'rejected';

UPDATE public.draft_revision_requests SET status = 'new', attempts = 0, hermes_reply = 'Przywrócone po naprawie błędu serwera (2026-10-31).', updated_at = now()
 WHERE id = 3 AND city_slug = 'spello' AND status = 'failed' AND hermes_reply LIKE '%Brak GOOGLE_API_KEY%';

-- samokontrola: prośba #3 jest w kolejce (albo już w pracy / zrobiona przy powtórnym uruchomieniu), a żadna jej uwaga nie jest „rejected”
DO $$
DECLARE st text; bad int;
BEGIN
  SELECT status INTO st FROM public.draft_revision_requests WHERE id = 3;
  IF st IS NULL OR st NOT IN ('new', 'working', 'done') THEN RAISE EXCEPTION 'prośba #3 ma status % — wycofuję', st; END IF;
  SELECT count(*) INTO bad FROM public.draft_comments c, public.draft_revision_requests r
   WHERE r.id = 3 AND c.id = ANY (r.comment_ids) AND c.status = 'rejected';
  IF bad > 0 THEN RAISE EXCEPTION '% uwag prośby #3 nadal odrzuconych — wycofuję', bad; END IF;
  RAISE NOTICE 'samokontrola OK: prośba #3 (Spello) w kolejce, status %', st;
END $$;

COMMIT;
