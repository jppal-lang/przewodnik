-- Weryfikacja naniesienia uwag JP po rundzie poprawek + meldunek gotowości (decyzja JP 2026-10-31:
-- „jak poprawki zostaną wdrożone, później agent powinien sprawdzić ich wdrożenie i zameldować gotowość”).
-- Pisze bin/verify-revision.mjs (wołany z draft-comments.mjs). Kod działa też PRZED tym SQL — wtedy wynik ląduje tylko
-- w hermes_reply i w wiadomości na Discordzie; po zatwierdzeniu dodatkowo w kolumnach poniżej (panel czyta je przez admin.*).
--
-- public.draft_comments (per uwaga, dla wersji verified_in_version):
--   verify_status  applied | partial | missing | stale   (naniesiona / częściowo / nie naniesiona / nie dotyczy już)
--   verify_note    krótkie uzasadnienie po polsku (≤ 200 znaków; „(wstępnie)” = ocena bez AI, pełna po odnowieniu limitu)
--   verify_quote   fragment pola PO zmianie (≤ 160 znaków)
--   verified_in_version, verified_at
-- public.draft_revision_requests (per prośba):
--   verify   jsonb {ok, applied, partial, missing, stale, total, new_errors, new_error_lines[], validator_ok, pending_ai, ai_failed,
--                   ready, label, version, from_version, round, retried, checked_at, items[{id, status, where, note, quote, provisional}]}
--   retry_of bigint — automatyczna ponowna runda (najwyżej jedna) dla uwag nie naniesionych w prośbie retry_of
-- Widoki admin.draft_comments / admin.draft_revision_requests (SELECT *) odtworzone, żeby panel widział nowe kolumny.
-- Panel tylko CZYTA te kolumny (quolino_admin bez INSERT/UPDATE na nich); web_anon bez żadnego dostępu.
-- Bezpieczne do powtórzenia. W całości albo wcale (samokontrola na końcu). Wykonuje root po `deploy.sh approve`.
-- Wymaga: 2026-10-16-draft-comments.sql, 2026-10-17-draft-send-kb-v2.sql.
BEGIN;

ALTER TABLE public.draft_comments ADD COLUMN IF NOT EXISTS verify_status text;
ALTER TABLE public.draft_comments ADD COLUMN IF NOT EXISTS verify_note text;
ALTER TABLE public.draft_comments ADD COLUMN IF NOT EXISTS verify_quote text;
ALTER TABLE public.draft_comments ADD COLUMN IF NOT EXISTS verified_in_version int;
ALTER TABLE public.draft_comments ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE public.draft_comments DROP CONSTRAINT IF EXISTS draft_comments_verify_status_check;
ALTER TABLE public.draft_comments ADD CONSTRAINT draft_comments_verify_status_check
  CHECK (verify_status IS NULL OR verify_status IN ('applied', 'partial', 'missing', 'stale'));
COMMENT ON COLUMN public.draft_comments.verify_status IS
  'Weryfikacja po rundzie poprawek (verify-revision.mjs): applied = naniesiona, partial = częściowo, missing = nie naniesiona, stale = nie dotyczy już.';

ALTER TABLE public.draft_revision_requests ADD COLUMN IF NOT EXISTS verify jsonb;
ALTER TABLE public.draft_revision_requests ADD COLUMN IF NOT EXISTS retry_of bigint;
CREATE INDEX IF NOT EXISTS draft_revision_requests_retry_of ON public.draft_revision_requests (retry_of) WHERE retry_of IS NOT NULL;
COMMENT ON COLUMN public.draft_revision_requests.verify IS
  'Wynik weryfikacji naniesienia uwag (verify-revision.mjs): {applied, partial, missing, stale, total, new_errors, ready, pending_ai, label, version, round, retried, checked_at, items[]}.';
COMMENT ON COLUMN public.draft_revision_requests.retry_of IS 'Ponowna runda (automatyczna, najwyżej jedna) dla uwag nie naniesionych w prośbie retry_of.';

-- widoki panelu: SELECT * rozwija się przy tworzeniu — odtworzenie dopisuje nowe kolumny na końcu (stare zostają w tej samej kolejności)
CREATE OR REPLACE VIEW admin.draft_comments AS SELECT * FROM public.draft_comments;
ALTER VIEW admin.draft_comments OWNER TO quolino;
CREATE OR REPLACE VIEW admin.draft_revision_requests AS SELECT * FROM public.draft_revision_requests;
ALTER VIEW admin.draft_revision_requests OWNER TO quolino;
REVOKE ALL ON public.draft_comments, public.draft_revision_requests, admin.draft_comments, admin.draft_revision_requests FROM PUBLIC, web_anon;
GRANT SELECT ON admin.draft_comments, admin.draft_revision_requests TO quolino_admin;

-- samokontrola: kolumny są w tabelach i widokach, panel je czyta, ale nie pisze; gość nie ma dostępu; CHECK działa
DO $$
DECLARE col text;
BEGIN
  FOREACH col IN ARRAY ARRAY['verify_status', 'verify_note', 'verify_quote', 'verified_in_version', 'verified_at'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'admin' AND table_name = 'draft_comments' AND column_name = col) THEN
      RAISE EXCEPTION 'admin.draft_comments bez kolumny % — wycofuję', col;
    END IF;
    IF NOT has_column_privilege('quolino_admin', 'admin.draft_comments', col, 'SELECT') THEN
      RAISE EXCEPTION 'quolino_admin nie czyta admin.draft_comments.% — wycofuję', col;
    END IF;
    IF has_column_privilege('quolino_admin', 'admin.draft_comments', col, 'INSERT') OR has_column_privilege('quolino_admin', 'admin.draft_comments', col, 'UPDATE') THEN
      RAISE EXCEPTION 'quolino_admin może pisać admin.draft_comments.% — wycofuję', col;
    END IF;
  END LOOP;
  FOREACH col IN ARRAY ARRAY['verify', 'retry_of'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'admin' AND table_name = 'draft_revision_requests' AND column_name = col) THEN
      RAISE EXCEPTION 'admin.draft_revision_requests bez kolumny % — wycofuję', col;
    END IF;
    IF NOT has_column_privilege('quolino_admin', 'admin.draft_revision_requests', col, 'SELECT') THEN
      RAISE EXCEPTION 'quolino_admin nie czyta admin.draft_revision_requests.% — wycofuję', col;
    END IF;
  END LOOP;
  IF has_table_privilege('quolino_admin', 'admin.draft_revision_requests', 'UPDATE') OR has_table_privilege('quolino_admin', 'admin.draft_revision_requests', 'INSERT') THEN
    RAISE EXCEPTION 'quolino_admin pisze do admin.draft_revision_requests — wycofuję';
  END IF;
  IF has_table_privilege('web_anon', 'public.draft_comments', 'SELECT') OR has_table_privilege('web_anon', 'admin.draft_comments', 'SELECT')
     OR has_table_privilege('web_anon', 'public.draft_revision_requests', 'SELECT') OR has_table_privilege('web_anon', 'admin.draft_revision_requests', 'SELECT') THEN
    RAISE EXCEPTION 'web_anon ma dostęp do uwag redakcji — wycofuję';
  END IF;
  -- CHECK: zły status odrzucony (próba w podtransakcji, nic nie zostaje)
  BEGIN
    INSERT INTO public.draft_comments (city_slug, city_version, body, verify_status) VALUES ('test-samokontrola', 1, 'test', 'zle');
    RAISE EXCEPTION 'przyjęto zły verify_status';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
