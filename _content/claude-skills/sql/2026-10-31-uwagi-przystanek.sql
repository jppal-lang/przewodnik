-- Uwaga JP do przystanku, którego nie ma w aktualnym szkicu (stary klucz „frasassi-01” z wcześniejszej wersji; przypadek #21 Frasassi,
-- JP 2026-10-31). Kod (bin/draft-comments.mjs, gemini-draft.mjs reviseMain, verify-revision.mjs) dopasowuje przystanek po nazwie /
-- numerze bez AI; gdy się nie da — uwaga NIE idzie do modelu i czeka na JP. Ten SQL daje:
--   1) status 'needs_jp' w public.draft_comments (= „wskaż przystanek”; przed migracją kod zapisuje 'rejected' z tym samym powodem),
--   2) verify_status 'unplaced' (= „bez przystanku”; nie liczy się jako „nie naniesiona”, nie uruchamia ponownej rundy),
--   3) admin.admin_comment_move(p_id, p_stop_key, p_field, p_field_label, p_version): JP w panelu wskazuje przystanek (albo opis
--      miasta — p_stop_key NULL) → uwaga wraca do 'new' i idzie zwykłą wysyłką (admin_send_comments). Panel ma na widoku tylko
--      SELECT + INSERT (bez UPDATE), dlatego RPC SECURITY DEFINER, a nie PATCH.
-- Bezpieczne do powtórzenia. W całości albo wcale (samokontrola na końcu). Wykonuje root po `deploy.sh approve`.
-- Wymaga: 2026-10-16-draft-comments.sql, 2026-10-17-draft-send-kb-v2.sql, 2026-10-31-weryfikacja-uwag.sql.
BEGIN;

ALTER TABLE public.draft_comments DROP CONSTRAINT IF EXISTS draft_comments_status_check;
ALTER TABLE public.draft_comments ADD CONSTRAINT draft_comments_status_check
  CHECK (status IN ('new', 'sent', 'seen', 'done', 'rejected', 'needs_jp'));
COMMENT ON COLUMN public.draft_comments.status IS
  'new = zapisana, sent = wysłana do poprawki, seen = Hermes poprawia, done = poprawione, rejected = odrzucona z powodem, needs_jp = przystanek uwagi nie istnieje w szkicu — JP wskazuje w panelu.';

ALTER TABLE public.draft_comments DROP CONSTRAINT IF EXISTS draft_comments_verify_status_check;
ALTER TABLE public.draft_comments ADD CONSTRAINT draft_comments_verify_status_check
  CHECK (verify_status IS NULL OR verify_status IN ('applied', 'partial', 'missing', 'stale', 'unplaced'));
COMMENT ON COLUMN public.draft_comments.verify_status IS
  'Weryfikacja po rundzie poprawek (verify-revision.mjs): applied = naniesiona, partial = częściowo, missing = nie naniesiona, stale = nie dotyczy już, unplaced = bez przystanku (JP wskazuje w panelu).';

-- JP przypisuje uwagę do przystanku bieżącego szkicu (albo do opisu miasta: p_stop_key NULL) i wraca nią do kolejki.
-- Dozwolone tylko dla uwag czekających na JP (needs_jp), odrzuconych albo jeszcze nie wysłanych (new). p_version = wersja szkicu,
-- w której JP wskazał przystanek (żeby uwaga stała przy polu w tej wersji); NULL = bez zmiany.
CREATE OR REPLACE FUNCTION admin.admin_comment_move(p_id bigint, p_stop_key text, p_field text DEFAULT NULL, p_field_label text DEFAULT NULL, p_version int DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE r public.draft_comments%ROWTYPE; v_from text;
BEGIN
  SELECT * INTO r FROM public.draft_comments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nie ma uwagi #%', p_id; END IF;
  IF r.status NOT IN ('needs_jp', 'rejected', 'new') THEN RAISE EXCEPTION 'Uwaga #% ma status % — przypisać można tylko uwagę czekającą na wskazanie przystanku, odrzuconą albo zapisaną.', p_id, r.status; END IF;
  IF p_stop_key IS NOT NULL AND length(btrim(p_stop_key)) = 0 THEN p_stop_key := NULL; END IF;
  IF p_stop_key IS NOT NULL AND p_stop_key !~ '^[a-z0-9][a-z0-9_-]{0,80}$' THEN RAISE EXCEPTION 'Zły klucz przystanku: %', p_stop_key; END IF;
  IF p_field IS NOT NULL AND p_field !~ '^[a-z_]+(\.[a-z_]+)?$' THEN RAISE EXCEPTION 'Złe pole: %', p_field; END IF;
  v_from := coalesce(r.stop_key, 'opis miasta');
  UPDATE public.draft_comments
     SET stop_key = p_stop_key,
         field = p_field,
         field_label = coalesce(nullif(btrim(p_field_label), ''), CASE WHEN p_field IS NULL THEN CASE WHEN p_stop_key IS NULL THEN 'Cała wycieczka' ELSE 'Cały przystanek' END ELSE field_label END),
         city_version = coalesce(p_version, city_version),
         status = 'new', request_id = NULL, resolved_in_version = NULL,
         hermes_reply = 'Przeniesiona przez JP z „' || v_from || '” na „' || coalesce(p_stop_key, 'opis miasta') || '”.',
         verify_status = NULL, verify_note = NULL, verify_quote = NULL, verified_in_version = NULL, verified_at = NULL,
         updated_at = now()
   WHERE id = p_id;
  RETURN json_build_object('id', p_id, 'stop_key', p_stop_key, 'field', p_field, 'status', 'new', 'from', v_from);
END $f$;
ALTER FUNCTION admin.admin_comment_move(bigint, text, text, text, int) OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.admin_comment_move(bigint, text, text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.admin_comment_move(bigint, text, text, text, int) TO quolino_admin;

-- widoki panelu bez zmian strukturalnych (SELECT *), odtworzone na wszelki wypadek
CREATE OR REPLACE VIEW admin.draft_comments AS SELECT * FROM public.draft_comments;
ALTER VIEW admin.draft_comments OWNER TO quolino;
REVOKE ALL ON public.draft_comments, admin.draft_comments FROM PUBLIC, web_anon;
GRANT SELECT ON admin.draft_comments TO quolino_admin;

-- samokontrola: CHECK przyjmuje nowe wartości i odrzuca złe; RPC działa dla quolino_admin, nie dla gościa; panel nadal bez UPDATE
DO $$
DECLARE v_id bigint; v_res json;
BEGIN
  INSERT INTO public.draft_comments (city_slug, city_version, stop_key, field, field_label, body, status, verify_status)
  VALUES ('test-samokontrola', 1, 'frasassi-01', 'stop.desc_paragraphs', 'Opis', 'test', 'needs_jp', 'unplaced') RETURNING id INTO v_id;
  BEGIN
    UPDATE public.draft_comments SET status = 'zle' WHERE id = v_id;
    RAISE EXCEPTION 'przyjęto zły status';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.draft_comments SET verify_status = 'zle' WHERE id = v_id;
    RAISE EXCEPTION 'przyjęto zły verify_status';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  v_res := admin.admin_comment_move(v_id, 'parking-la-cuna', 'stop.desc_paragraphs', 'Opis', 16);
  IF NOT EXISTS (SELECT 1 FROM public.draft_comments WHERE id = v_id AND stop_key = 'parking-la-cuna' AND status = 'new' AND city_version = 16 AND verify_status IS NULL AND request_id IS NULL) THEN
    RAISE EXCEPTION 'admin_comment_move nie przeniósł uwagi — wycofuję';
  END IF;
  v_res := admin.admin_comment_move(v_id, NULL, NULL, NULL, NULL);
  IF NOT EXISTS (SELECT 1 FROM public.draft_comments WHERE id = v_id AND stop_key IS NULL AND field IS NULL AND field_label = 'Cała wycieczka') THEN
    RAISE EXCEPTION 'admin_comment_move nie przeniósł uwagi na opis miasta — wycofuję';
  END IF;
  BEGIN
    v_res := admin.admin_comment_move(v_id, 'Zły Klucz!', NULL, NULL, NULL);
    RAISE EXCEPTION 'przyjęto zły klucz przystanku';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Zły klucz%' THEN RAISE; END IF;
  END;
  DELETE FROM public.draft_comments WHERE id = v_id;
  IF NOT has_function_privilege('quolino_admin', 'admin.admin_comment_move(bigint, text, text, text, int)', 'EXECUTE') THEN
    RAISE EXCEPTION 'quolino_admin nie może wołać admin_comment_move — wycofuję';
  END IF;
  IF has_function_privilege('web_anon', 'admin.admin_comment_move(bigint, text, text, text, int)', 'EXECUTE') THEN
    RAISE EXCEPTION 'web_anon może wołać admin_comment_move — wycofuję';
  END IF;
  IF has_table_privilege('quolino_admin', 'admin.draft_comments', 'UPDATE') THEN
    RAISE EXCEPTION 'quolino_admin pisze UPDATE do admin.draft_comments — wycofuję';
  END IF;
  IF has_table_privilege('web_anon', 'public.draft_comments', 'SELECT') OR has_table_privilege('web_anon', 'admin.draft_comments', 'SELECT') THEN
    RAISE EXCEPTION 'web_anon ma dostęp do uwag redakcji — wycofuję';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
