-- Panel admina: zapis uwagi do szkicu padał z „permission denied for sequence draft_comments_id_seq” (JP 2026-10-17).
-- Rola panelu (quolino_admin) wstawia uwagi przez widok admin.draft_comments, a domyślne id bierze nextval z sekwencji —
-- do tego potrzebuje USAGE na sekwencji. Przez ten brak WSZYSTKIE uwagi z panelu lądowały tylko w przeglądarce (adm.outbox).
-- Bezpieczne do powtórzenia. Wykonuje root po `deploy.sh approve`.
BEGIN;
GRANT USAGE ON SEQUENCE public.draft_comments_id_seq TO quolino_admin;
NOTIFY pgrst, 'reload schema';
COMMIT;
