-- 2026-11-04 (JP: „strażnik, który trafia na 404, ma po prostu nie podawać tych linków użytkownikowi — nie będę klikać 5000 razy”):
-- otwarte ustalenia o martwych linkach i niedziałających stronach lokali zamykamy automatycznie. Strona i tak ich nie pokazuje
-- (public.dead_links, 2026-11-04-martwe-linki.sql); nowe takie ustalenia strażnik już nie zakłada (watch-lib.mjs).
BEGIN;
UPDATE ops.watch_findings
   SET status = 'resolved', decided_at = now(), updated_at = now(),
       decision_note = 'automat: martwy link ukryty na stronie (archiwalny), bez decyzji JP'
 WHERE status IN ('open', 'recheck')
   AND (kind = 'link' OR (kind = 'venue' AND coalesce(proposal->>'signal', '') = 'site'));
COMMIT;
