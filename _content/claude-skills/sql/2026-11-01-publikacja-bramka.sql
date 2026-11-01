-- 2026-11-01 (decyzja JP): „Tłumaczenia mają ruszyć po tym jak kliknę zatwierdź i opublikuj. Jak są nierozstrzygnięte flagi,
-- muszę mieć zablokowaną możliwość publikacji; jak już wyślę poprawki, to też jeszcze nie — dopiero jak wszystkie flagi będą
-- zielone. I najważniejsze: opublikowanie wyzwala następną trasę, kolejność wg najbardziej popularnych miejsc w danym regionie.”
--
-- Trzy rzeczy w jednym pliku (w całości albo wcale):
-- 1) BRAMKA PUBLIKACJI — admin.publish_gate(slug, wersja) → jsonb {ok, reasons[{k,t}], flags_open, errors, unsent, …, translation_est};
--    admin.admin_approve odmawia (RAISE „Publikacja zablokowana: …”), gdy nie ok. Twarda blokada: bez parametru awaryjnego (JP nie chce
--    „mimo to”). Te same reguły liczy panel — _admin/publish-gate.js (PublishGate.evaluate, test bin/publish-gate.test.mjs):
--      a) każda flaga kontroli w publikowanej wersji (city_versions.review errors/warnings bez `resolved`; stara uwaga zbiorcza
--         „Fakty bez źródła (K): a; b” → osobna flaga na fragment, jak ReviewWhere.splitAggregate) ma odpowiedź JP: wiersz draft_comments
--         tej wersji z field = 'review.<e|w>.N' (fragment: 'review.<e|w>.N.j'), w dowolnym statusie,
--      b) nic nie czeka na wysłanie (draft_comments new) ani na wskazanie przystanku (needs_jp) — całe miasto,
--      c) ostatnia prośba o poprawkę miasta: new/working → w toku; failed → blokada; done z verify.ready ≠ true (częściowo / nie
--         naniesione / nowe błędy / ocena wstępna) → blokada; done z result_version bez verify → blokada przez 2 h (weryfikacja rusza
--         zaraz po rundzie); starsze prośby bez weryfikacji (sprzed 2026-10-31) nie blokują,
--      d) błędy walidatora (review.errors bez `resolved`) — blokują, dopóki odpowiedź JP nie zostanie rozpatrzona przez Hermesa
--         (uwaga done / rejected); zwykle znikają same w nowej wersji po poprawce.
--    „Zielone” = a–d spełnione. Brak wyniku kontroli (stare szkice) nie blokuje — nie ma flag.
-- 2) TŁUMACZENIA = ZGODA JP — kliknięcie „Zatwierdź i opublikuj” jest zgodą na koszt tłumaczeń tej trasy: queue_translation jak dotąd
--    (ops.jobs kind translate; translate-queue.mjs: najpierw EN, potem reszta) + wpis ops.cost_requests status 'approved'
--    (kind 'translate', decided_by 'JP (publikacja)', est_usd: średnia z public.ai_usage, bez danych 0.50 USD = dzienny limit płatnych
--    modeli). Wpis jest zapisem decyzji (repo-jobs.mjs bierze tylko wiersze z job_key — tego nie wykona drugi raz).
--    Zaległe zlecenia Spello i Frasassi (opublikowane przed bramką) w kolejce → te same wpisy 'approved' (zgoda = publikacja).
-- 3) NASTĘPNA TRASA — ops.trip_plan (lista redakcyjna miast per region wg popularności; źródło i edycja: bin/trip-plan.mjs, `--sync`
--    wgrywa listę tutaj) + admin.trip_next(region) → pierwsze miasto regionu, które: nie jest opublikowane w nowym procesie
--    (content.workflow = 'v2' / wytyczne > v01), nie ma szkicu w toku i nie ma zadania draft/gemini w ops.jobs (queued/running/done/
--    failed — decyzja o powtórce należy do JP); region wyczerpany → następny w kolejności Umbria → Marche → Emilia-Romagna (region
--    musi istnieć w public.regions). Stara trasa (public.cities / city_versions) → fresh = true.
--    Wpięte w admin_approve PO publikacji, przez admin.admin_trip_enqueue (2026-11-01-nowa-trasa.sql) — ta sama ścieżka co „+ Nowa trasa”
--    i qdb job-add; błąd kolejkowania NIE cofa publikacji (zapisany w wyniku: next_error). gemini-queue.mjs i tak wstrzymuje nowe trasy
--    przy ≥ 90 % limitu Antigravity. Asyż zlecony ręcznie (ops.jobs queued) → plan go pomija (bez dublowania).
--
-- Wymaga: trip-translate.sql, 2026-10-31-ikony-przystankow.sql (admin_approve z ikonami — treść przeniesiona tu w całości),
--         2026-10-17-draft-send-kb-v2.sql, 2026-10-31-weryfikacja-uwag.sql, 2026-10-30-skrzynka-decyzji.sql (ops.cost_requests),
--         2026-11-01-nowa-trasa.sql (admin.admin_trip_enqueue, admin.regions). Bezpieczne do powtórzenia. Wykonuje root.
-- Zatwierdzenie: panel (#/decyzje) albo sh /root/quolino-web/ops/deploy.sh approve <hash>.
BEGIN;

CREATE SCHEMA IF NOT EXISTS ops;
CREATE SCHEMA IF NOT EXISTS admin;

-- polskie formy liczebnika: 1 flaga, 2–4 flagi (bez 12–14), 5+ flag — jak plural() w publish-gate.js
CREATE OR REPLACE FUNCTION admin.pl3(n int, one text, few text, many text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$
  SELECT n || ' ' || CASE WHEN n = 1 THEN one WHEN n % 10 BETWEEN 2 AND 4 AND (n % 100 < 12 OR n % 100 > 14) THEN few ELSE many END
$f$;
ALTER FUNCTION admin.pl3(int, text, text, text) OWNER TO quolino;

-- ── 1) bramka publikacji ──────────────────────────────────────────────────────────────────────────────────────────
-- Reguły 1:1 z _admin/publish-gate.js (PublishGate.evaluate; test bin/publish-gate.test.mjs). Zmiana reguły = oba miejsca.
CREATE OR REPLACE FUNCTION admin.publish_gate(p_slug text, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE d public.city_versions; rq public.draft_revision_requests; e jsonb; k text; i int; j int; np int; m text[]; fid text;
        n_flags int := 0; n_errors int := 0; n_unsent int := 0; n_place int := 0; reasons jsonb := '[]'::jsonb; vf jsonb; rq_txt text;
        rq_block boolean := false; answered boolean; processed boolean;
BEGIN
  SELECT * INTO d FROM public.city_versions WHERE city_slug = p_slug AND version = p_version;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reasons', jsonb_build_array(jsonb_build_object('k', 'missing', 't', 'Nie ma szkicu ' || p_slug || ' v' || p_version))); END IF;

  -- a) + d) flagi kontroli tej wersji (rozstrzygnięte automatycznie — z kluczem `resolved` — pomijamy)
  FOREACH k IN ARRAY ARRAY['e', 'w'] LOOP
    i := -1;
    FOR e IN SELECT x FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d.review -> CASE k WHEN 'e' THEN 'errors' ELSE 'warnings' END) = 'array'
                                                     THEN d.review -> CASE k WHEN 'e' THEN 'errors' ELSE 'warnings' END ELSE '[]'::jsonb END) x LOOP
      i := i + 1;
      IF jsonb_typeof(e) = 'object' AND coalesce(e -> 'resolved', 'null'::jsonb) NOT IN ('null'::jsonb, 'false'::jsonb, '""'::jsonb, '0'::jsonb) THEN CONTINUE; END IF;
      -- stara uwaga zbiorcza „Fakty bez źródła (K): a; b; c” → osobna flaga na każdy fragment (jak ReviewWhere.splitAggregate)
      m := CASE WHEN jsonb_typeof(e) = 'object' THEN regexp_match(coalesce(e ->> 'problem', ''), '^(\[[^\]]+\]\s*)?Fakty bez źródła \((\d+)\)[^:]*:\s*(.+)$') END;
      np := CASE WHEN m IS NULL THEN 0 ELSE (SELECT count(*) FROM regexp_split_to_table(m[3], ';\s+') pt(part) WHERE btrim(pt.part) <> '') END;
      FOR j IN 0 .. greatest(np, 1) - 1 LOOP
        fid := 'review.' || k || '.' || i || CASE WHEN np > 0 THEN '.' || j ELSE '' END;
        SELECT count(*) > 0, coalesce(bool_or(status IN ('done', 'rejected')), false) INTO answered, processed
          FROM public.draft_comments WHERE city_slug = p_slug AND city_version = p_version AND field = fid;
        IF NOT answered THEN n_flags := n_flags + 1; END IF;
        IF k = 'e' AND NOT processed THEN n_errors := n_errors + 1; END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  IF n_flags > 0 THEN reasons := reasons || jsonb_build_object('k', 'flags', 't', admin.pl3(n_flags, 'nierozstrzygnięta flaga', 'nierozstrzygnięte flagi', 'nierozstrzygniętych flag') || ' kontroli'); END IF;
  IF n_errors > 0 THEN reasons := reasons || jsonb_build_object('k', 'errors', 't', 'walidator: ' || admin.pl3(n_errors, 'błąd blokujący', 'błędy blokujące', 'błędów blokujących') || ' — popraw je (odpowiedź → wyślij do poprawki)'); END IF;

  -- b) uwagi niewysłane / bez przystanku (całe miasto — uwagi do starszej wersji też idą jedną paczką)
  SELECT count(*) FILTER (WHERE status = 'new'), count(*) FILTER (WHERE status = 'needs_jp') INTO n_unsent, n_place
    FROM public.draft_comments WHERE city_slug = p_slug;
  IF n_unsent > 0 THEN reasons := reasons || jsonb_build_object('k', 'unsent', 't', admin.pl3(n_unsent, 'niewysłana uwaga', 'niewysłane uwagi', 'niewysłanych uwag') || ' — wyślij je do poprawki'); END IF;
  IF n_place > 0 THEN reasons := reasons || jsonb_build_object('k', 'unplaced', 't', admin.pl3(n_place, 'uwaga czeka', 'uwagi czekają', 'uwag czeka') || ' na wskazanie przystanku'); END IF;

  -- c) ostatnia prośba o poprawkę miasta
  SELECT * INTO rq FROM public.draft_revision_requests WHERE city_slug = p_slug ORDER BY id DESC LIMIT 1;
  IF FOUND THEN
    vf := CASE WHEN jsonb_typeof(to_jsonb(rq) -> 'verify') = 'object' THEN to_jsonb(rq) -> 'verify' END;   -- kolumna verify z 2026-10-31-weryfikacja-uwag.sql
    IF rq.status IN ('new', 'working') THEN
      rq_txt := 'poprawka #' || rq.id || ' w toku (' || CASE rq.status WHEN 'new' THEN 'w kolejce' ELSE 'Hermes nanosi' END || ') — poczekaj na nową wersję i weryfikację';
    ELSIF rq.status = 'failed' THEN
      rq_txt := 'poprawka #' || rq.id || ' nieudana — wyślij uwagi ponownie';
    ELSIF rq.status = 'done' AND vf IS NOT NULL AND (vf -> 'ready') IS DISTINCT FROM 'true'::jsonb THEN
      rq_txt := 'weryfikacja poprawki #' || rq.id || ': ' || coalesce(vf ->> 'applied', '?') || ' z ' || coalesce(vf ->> 'total', '?') || ' naniesionych'
             || CASE WHEN coalesce(nullif(vf ->> 'new_errors', '')::numeric, 0) > 0 THEN ', ' || admin.pl3((vf ->> 'new_errors')::numeric::int, 'nowy błąd', 'nowe błędy', 'nowych błędów') ELSE '' END
             || CASE WHEN (vf -> 'pending_ai') = 'true'::jsonb THEN ' (ocena wstępna — pełna po odnowieniu limitu AI)' ELSE '' END || ' — nie wszystko zielone';
    ELSIF rq.status = 'done' AND vf IS NULL AND rq.result_version IS NOT NULL AND coalesce(rq.updated_at, rq.created_at) > now() - interval '2 hours' THEN
      rq_txt := 'poprawka #' || rq.id || ' naniesiona w v' || rq.result_version || ' — czeka na weryfikację (kilka minut)';
    END IF;
    IF rq_txt IS NOT NULL THEN rq_block := true; reasons := reasons || jsonb_build_object('k', 'request', 't', rq_txt); END IF;
  END IF;

  RETURN jsonb_build_object('ok', jsonb_array_length(reasons) = 0, 'reasons', reasons, 'flags_open', n_flags, 'errors', n_errors,
    'unsent', n_unsent, 'unplaced', n_place, 'request_id', rq.id, 'request_status', rq.status, 'request_blocks', rq_block,
    'translation_est', admin.translation_cost_estimate());
END $f$;
ALTER FUNCTION admin.publish_gate(text, int) OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.publish_gate(text, int) FROM PUBLIC;

-- POST /api/rpc/admin_publish_gate {p_slug, p_version} — panel pokazuje powód z serwera (ta sama funkcja, co w zatwierdzeniu)
CREATE OR REPLACE FUNCTION admin.admin_publish_gate(p_slug text, p_version int) RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $f$ SELECT admin.publish_gate(p_slug, p_version)::json $f$;
ALTER FUNCTION admin.admin_publish_gate(text, int) OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.admin_publish_gate(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.admin_publish_gate(text, int) TO quolino_admin;

-- ── 2) szacunek kosztu tłumaczeń (z dotychczasowych kosztów; brak danych → stała) ──────────────────────────────────
-- Tłumaczenia idą modelami darmowymi (OpenRouter: translate_en / translate_xx) z płatnym zapasem ograniczonym do QUOLINO_DAILY_USD
-- (domyślnie 0,50 USD dziennie) + kontrola Claude z abonamentu. Stała 0.50 USD = górna granica dnia płatnych modeli.
CREATE OR REPLACE FUNCTION admin.translation_cost_estimate() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE est numeric; n int;
BEGIN
  IF to_regclass('public.ai_usage') IS NOT NULL THEN
    SELECT round(avg(s), 2), count(*) INTO est, n FROM (
      SELECT city_slug, sum(usd) AS s FROM public.ai_usage
       WHERE city_slug IS NOT NULL AND at > now() - interval '180 days'
         AND (role ILIKE '%translat%' OR role ILIKE '%tłumacz%' OR role ILIKE '%tlumacz%')
       GROUP BY city_slug) x;
  END IF;
  IF est IS NULL THEN RETURN jsonb_build_object('usd', 0.50, 'source', 'stała (dzienny limit płatnych modeli)', 'cities', 0); END IF;
  RETURN jsonb_build_object('usd', est, 'source', 'średnia z ' || n || ' tras (ai_usage, 180 dni)', 'cities', n);
END $f$;
ALTER FUNCTION admin.translation_cost_estimate() OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.translation_cost_estimate() FROM PUBLIC;

-- zgoda na koszt tłumaczeń zapisana jako decyzja (ops.cost_requests, status approved). Brak tabeli → nic (NULL), publikacja idzie dalej.
CREATE OR REPLACE FUNCTION admin.translation_consent(p_slug text, p_version int, p_job bigint, p_note text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, public, pg_temp AS $f$
DECLARE est jsonb; v_id bigint;
BEGIN
  IF to_regclass('ops.cost_requests') IS NULL THEN RETURN NULL; END IF;
  est := admin.translation_cost_estimate();
  INSERT INTO ops.cost_requests (kind, title, detail, est_usd, est_limit, payload, status, decided_by, decided_at)
  VALUES ('translate', 'Tłumaczenia ' || p_slug || ' v' || p_version || ' (EN, potem pozostałe języki)',
          p_note || ' · szacunek: ' || (est ->> 'usd') || ' USD (' || (est ->> 'source') || ')',
          (est ->> 'usd')::numeric, 'kontrola tłumaczeń: abonament Claude',
          jsonb_build_object('city_slug', p_slug, 'version', p_version, 'job', p_job, 'consent', 'publikacja'),
          'approved', 'JP (publikacja)', now())
  RETURNING id INTO v_id;
  RETURN v_id;
END $f$;
ALTER FUNCTION admin.translation_consent(text, int, bigint, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.translation_consent(text, int, bigint, text) FROM PUBLIC;

-- ── 3) plan tras: lista redakcyjna miast per region (kolejność = popularność turystyczna, orientacyjnie) ──────────
-- ŹRÓDŁO LISTY I UZASADNIENIE: _content/claude-skills/bin/trip-plan.mjs (tam komentarze z liczbami odwiedzin / rankingami).
-- Lista jest redakcyjna i edytowalna: zmiana w trip-plan.mjs → `node trip-plan.mjs --sync` wgrywa ją tu (upsert + usunięcie wykreślonych).
CREATE TABLE IF NOT EXISTS ops.trip_plan (
  region     text NOT NULL,
  rank       int  NOT NULL,
  slug       text NOT NULL,
  name       text NOT NULL,
  country    text NOT NULL DEFAULT 'it',
  duration   text NOT NULL DEFAULT 'half_day',
  note       text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (region, slug),
  CONSTRAINT trip_plan_slug CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  CONSTRAINT trip_plan_duration CHECK (duration IN ('half_day', 'full_day'))
);
ALTER TABLE ops.trip_plan OWNER TO quolino;
REVOKE ALL ON ops.trip_plan FROM PUBLIC, web_anon;

CREATE TABLE IF NOT EXISTS ops.trip_plan_regions (region text PRIMARY KEY, rank int NOT NULL);
ALTER TABLE ops.trip_plan_regions OWNER TO quolino;
REVOKE ALL ON ops.trip_plan_regions FROM PUBLIC, web_anon;
INSERT INTO ops.trip_plan_regions (region, rank) VALUES ('umbria', 1), ('marche', 2), ('emilia-romagna', 3)
ON CONFLICT (region) DO UPDATE SET rank = EXCLUDED.rank;

INSERT INTO ops.trip_plan (region, rank, slug, name, duration, note) VALUES
  ('umbria', 1,  'asyz',                'Asyż',                 'full_day', 'UNESCO, bazylika św. Franciszka — najczęściej odwiedzane miasto Umbrii'),
  ('umbria', 2,  'perugia',             'Perugia',              'full_day', 'stolica regionu, Eurochocolate, Umbria Jazz'),
  ('umbria', 3,  'orvieto',             'Orvieto',              'full_day', 'katedra, studnia św. Patryka, kolejka linowa'),
  ('umbria', 4,  'spello',              'Spello',               'half_day', 'Infiorata, mozaiki — już w nowym procesie (pominięte automatycznie)'),
  ('umbria', 5,  'gubbio',              'Gubbio',               'full_day', 'kolejka na Monte Ingino, Festa dei Ceri'),
  ('umbria', 6,  'spoleto',             'Spoleto',              'full_day', 'Ponte delle Torri, Festival dei Due Mondi'),
  ('umbria', 7,  'todi',                'Todi',                 'half_day', 'Piazza del Popolo, Tempio della Consolazione'),
  ('umbria', 8,  'norcia',              'Norcia',               'half_day', 'św. Benedykt, Piano Grande (Castelluccio)'),
  ('umbria', 9,  'narni',               'Narni',                'half_day', 'Narni Sotterranea — Narnia dla dzieci'),
  ('umbria', 10, 'castiglione-del-lago','Castiglione del Lago', 'half_day', 'Trasimeno, zamek Rocca del Leone, plaże'),
  ('marche', 1,  'urbino',              'Urbino',               'full_day', 'UNESCO, Palazzo Ducale, Rafael'),
  ('marche', 2,  'ancona',              'Ancona i Riviera del Conero', 'full_day', 'port, Conero, plaże'),
  ('marche', 3,  'frasassi',            'Frasassi',             'full_day', 'jaskinie — już w nowym procesie (pominięte automatycznie)'),
  ('marche', 4,  'loreto',              'Loreto',               'half_day', 'sanktuarium Świętego Domku'),
  ('marche', 5,  'ascoli-piceno',       'Ascoli Piceno',        'full_day', 'Piazza del Popolo, olive ascolane'),
  ('marche', 6,  'recanati',            'Recanati',             'half_day', 'Leopardi, Gigli'),
  ('marche', 7,  'fermo',               'Fermo',                'half_day', 'cysterny rzymskie, teatr'),
  ('marche', 8,  'pesaro',              'Pesaro',               'half_day', 'Rossini, plaża, rower'),
  ('marche', 9,  'macerata',            'Macerata',             'half_day', 'Sferisterio'),
  ('marche', 10, 'san-leo',             'San Leo',              'half_day', 'twierdza na skale, Cagliostro'),
  ('emilia-romagna', 1, 'bolonia',      'Bolonia',              'full_day', 'wieże, portyki (UNESCO), kuchnia'),
  ('emilia-romagna', 2, 'rimini',       'Rimini',               'full_day', 'plaża, Fellini, most Tyberiusza'),
  ('emilia-romagna', 3, 'rawenna',      'Rawenna',              'full_day', 'mozaiki UNESCO'),
  ('emilia-romagna', 4, 'ferrara',      'Ferrara',              'full_day', 'zamek Estense, rowery, UNESCO'),
  ('emilia-romagna', 5, 'modena',       'Modena',               'half_day', 'katedra UNESCO, Ferrari, ocet balsamiczny'),
  ('emilia-romagna', 6, 'parma',        'Parma',                'half_day', 'baptysterium, szynka i parmezan')
ON CONFLICT (region, slug) DO UPDATE SET rank = EXCLUDED.rank, name = EXCLUDED.name, duration = EXCLUDED.duration, note = EXCLUDED.note, updated_at = now();

CREATE OR REPLACE VIEW admin.trip_plan AS
  SELECT p.region, r.rank AS region_rank, p.rank, p.slug, p.name, p.country, p.duration, p.note,
         -- nowy proces opublikowany: wersja published (albo dawniej opublikowana → archived z published_at) z content.workflow = 'v2'
         -- lub wytycznymi nowszymi niż v01 (gemini-draft.mjs stampGuidelines)
         EXISTS (SELECT 1 FROM public.city_versions v WHERE v.city_slug = p.slug AND (v.status = 'published' OR v.published_at IS NOT NULL)
                    AND (v.content ->> 'workflow' = 'v2' OR coalesce(v.content ->> 'guidelines', 'v01') > 'v01')) AS done_v2,
         EXISTS (SELECT 1 FROM public.city_versions v WHERE v.city_slug = p.slug AND v.status = 'draft') AS has_draft,
         (SELECT j.status FROM ops.jobs j WHERE j.city_slug = p.slug AND j.kind = 'draft' AND j.worker = 'gemini' ORDER BY j.id DESC LIMIT 1) AS job_status,
         (EXISTS (SELECT 1 FROM public.cities c WHERE c.slug = p.slug) OR EXISTS (SELECT 1 FROM public.city_versions v WHERE v.city_slug = p.slug)) AS has_old
    FROM ops.trip_plan p LEFT JOIN ops.trip_plan_regions r ON r.region = p.region;
ALTER VIEW admin.trip_plan OWNER TO quolino;
REVOKE ALL ON admin.trip_plan FROM PUBLIC, web_anon;
GRANT SELECT ON admin.trip_plan TO quolino_admin;

-- następne miasto po publikacji trasy w regionie p_region: w tym regionie, a gdy wyczerpany — w kolejnych wg trip_plan_regions.
-- Pomija (te same reguły co pickNext() w bin/trip-plan.mjs): opublikowane w nowym procesie (done_v2), miasta z szkicem w toku
-- (has_draft) i z jakimkolwiek zadaniem draft/gemini w ops.jobs (queued/running = w kolejce; done/failed = JP decyduje o powtórce
-- ręcznie, „+ Nowa trasa”). NULL = plan wyczerpany.
CREATE OR REPLACE FUNCTION admin.trip_next(p_region text, p_skip text DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ops, public, pg_temp AS $f$
  SELECT jsonb_build_object('slug', slug, 'name', name, 'region', region, 'country', country, 'duration', duration, 'fresh', has_old)
    FROM admin.trip_plan
   WHERE NOT done_v2 AND NOT has_draft AND job_status IS NULL
     AND slug IS DISTINCT FROM p_skip                                                     -- właśnie opublikowana (stara) trasa nie zleca samej siebie
     AND EXISTS (SELECT 1 FROM public.regions g WHERE g.slug = admin.trip_plan.region)   -- region jeszcze nie założony → pomijamy (enqueue by odmówił)
   ORDER BY (region = lower(coalesce(p_region, ''))) DESC,
            CASE WHEN region_rank IS NULL THEN 99 WHEN region_rank <= coalesce((SELECT rank FROM ops.trip_plan_regions WHERE region = lower(coalesce(p_region, ''))), 0) THEN region_rank + 100 ELSE region_rank END,
            rank
   LIMIT 1
$f$;
ALTER FUNCTION admin.trip_next(text, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.trip_next(text, text) FROM PUBLIC;

-- POST /api/rpc/admin_trip_next {p_region} — podgląd dla panelu („co będzie następne”)
CREATE OR REPLACE FUNCTION admin.admin_trip_next(p_region text) RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $f$ SELECT coalesce(admin.trip_next(p_region), 'null'::jsonb)::json $f$;
ALTER FUNCTION admin.admin_trip_next(text) OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.admin_trip_next(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.admin_trip_next(text) TO quolino_admin;

-- ── 4) zatwierdzenie z bramką, zgodą na tłumaczenia i następną trasą (treść jak 2026-10-31-ikony-przystankow.sql + nowe kroki) ──
CREATE OR REPLACE FUNCTION admin.admin_approve(p_slug text, p_version int, p_note text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE d public.city_versions; pub public.city_versions; v_job bigint; icons jsonb; kept int; gate jsonb; v_region text;
        v_consent bigint; v_est jsonb; nxt jsonb; nxt_job json; nxt_err text; v_nxt_fresh boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('city_versions:' || p_slug));
  SELECT * INTO d FROM public.city_versions WHERE city_slug = p_slug AND version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nie ma szkicu % v%', p_slug, p_version; END IF;
  IF d.status <> 'draft' THEN RAISE EXCEPTION 'Szkic % v% już rozpatrzony (status: %)', p_slug, p_version, d.status; END IF;
  IF d.stops_count = 0 THEN RAISE EXCEPTION 'Szkic % v% nie ma przystanków — nie można go opublikować', p_slug, p_version; END IF;
  -- bramka (JP 2026-11-01): twarda, bez obejścia
  gate := admin.publish_gate(p_slug, p_version);
  IF (gate ->> 'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Publikacja zablokowana: %', (SELECT string_agg(x ->> 't', '; ') FROM jsonb_array_elements(gate -> 'reasons') x);
  END IF;

  SELECT * INTO pub FROM public.city_versions WHERE city_slug = p_slug AND status = 'published';
  IF EXISTS (SELECT 1 FROM public.cities WHERE slug = p_slug)
     AND (pub.id IS NULL OR public.city_snapshot(p_slug) IS DISTINCT FROM pub.content) THEN
    PERFORM public.city_version_save(p_slug, 'archived', 'stan na żywo przed zatwierdzeniem v' || p_version, 'manual');
  END IF;
  icons := public.stops_icons_of(p_slug);                 -- ikony miejsc sprzed wgrania migawki (2026-10-31)
  PERFORM public.city_load_snapshot(p_slug, d.content);
  kept := public.stops_icons_restore(p_slug, icons);     -- szkic bez ikon (stary) → przywracamy po stop_key
  PERFORM public.publish_city(p_slug, true);
  UPDATE public.city_versions SET status = 'archived' WHERE city_slug = p_slug AND status = 'published';
  UPDATE public.city_versions SET status = 'published', published_at = now(), reviewed_at = now(), review_note = p_note
   WHERE id = d.id;

  -- tłumaczenia: kolejka jak dotąd + zgoda JP zapisana (kliknięcie „Zatwierdź i opublikuj” = zgoda na koszt)
  v_job := public.queue_translation(p_slug, p_version);
  v_est := admin.translation_cost_estimate();
  BEGIN
    v_consent := admin.translation_consent(p_slug, p_version, v_job, 'zgoda = publikacja v' || p_version || ' w panelu');
  EXCEPTION WHEN OTHERS THEN v_consent := NULL;          -- wpis zgody jest pomocniczy; publikacja i kolejka tłumaczeń nie zależą od niego
  END;

  -- następna trasa z planu regionu (ta sama ścieżka co „+ Nowa trasa”); błąd nie cofa publikacji
  v_region := coalesce(d.content -> 'city' ->> 'region_slug', d.content -> 'city' ->> 'region', (SELECT region_slug FROM public.cities WHERE slug = p_slug));
  nxt := admin.trip_next(v_region, p_slug);
  IF nxt IS NOT NULL THEN
    BEGIN
      v_nxt_fresh := coalesce((nxt ->> 'fresh')::boolean, false);
      -- brief pusty: pole „życzenia do trasy” trafia do modelu jako polecenie redakcyjne — nie wpisujemy tam informacji technicznych
      nxt_job := admin.admin_trip_enqueue(nxt ->> 'slug', nxt ->> 'name', nxt ->> 'country', nxt ->> 'region', nxt ->> 'duration', '', v_nxt_fresh);
    EXCEPTION WHEN OTHERS THEN nxt_err := SQLERRM; nxt_job := NULL;
    END;
  END IF;

  RETURN json_build_object('city_slug', p_slug, 'version', p_version, 'status', 'published', 'translation_job', v_job, 'icons_kept', kept,
    'translation_consent', v_consent, 'translation_est', v_est,
    'next_trip', CASE WHEN nxt IS NULL THEN NULL ELSE (nxt || jsonb_build_object('job', (nxt_job ->> 'id')::bigint))::json END,
    'next_error', nxt_err, 'next_region', v_region);
END $f$;
ALTER FUNCTION admin.admin_approve(text, int, text) OWNER TO quolino;
REVOKE ALL ON FUNCTION admin.admin_approve(text, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.admin_approve(text, int, text) TO quolino_admin;

-- ── 5) zaległe zlecenia tłumaczeń Spello i Frasassi — zgoda = publikacja (JP opublikował obie trasy) ────────────────
DO $$
DECLARE j record; n int := 0;
BEGIN
  IF to_regclass('ops.cost_requests') IS NULL OR to_regclass('ops.jobs') IS NULL THEN RETURN; END IF;
  FOR j IN SELECT id, coalesce(city_slug, substring(request FROM '^translate ([a-z0-9-]+) ')) AS city_slug, city_slug IS NULL AS no_slug
             FROM ops.jobs
            WHERE kind = 'translate' AND status = 'queued'
              AND (city_slug IN ('spello', 'frasassi') OR (city_slug IS NULL AND request ~ '^translate (spello|frasassi) '))
            ORDER BY id LOOP
    IF j.no_slug THEN RAISE NOTICE 'zlecenie #% (%) bez city_slug — translate-queue.mjs go nie podejmie; sprawdź ops.cities', j.id, j.city_slug; END IF;
    IF NOT EXISTS (SELECT 1 FROM ops.cost_requests WHERE kind = 'translate' AND payload ->> 'job' = j.id::text) THEN
      PERFORM admin.translation_consent(j.city_slug,
        coalesce((SELECT max(version) FROM public.city_versions WHERE city_slug = j.city_slug AND status = 'published'), 0),
        j.id, 'zgoda = publikacja (zaległe zlecenie #' || j.id || ', JP opublikował trasę przed bramką 2026-11-01)');
      n := n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'tłumaczenia Spello/Frasassi: % zaległych zleceń oznaczonych jako zatwierdzone (zgoda = publikacja)', n;
END $$;

-- ── 6) samokontrola (w SAVEPOINT; nic nie zostaje) ───────────────────────────────────────────────────────────────────
DO $$
DECLARE t text; g jsonb; nx jsonb; d record; probe text := 'zz-bramka-samokontrola'; cnt int;
BEGIN
  FOREACH t IN ARRAY ARRAY['admin.admin_approve(text, int, text)', 'admin.admin_publish_gate(text, int)', 'admin.admin_trip_next(text)'] LOOP
    IF has_function_privilege('web_anon', t, 'EXECUTE') THEN RAISE EXCEPTION 'web_anon może wywołać % — wycofuję', t; END IF;
    IF NOT has_function_privilege('quolino_admin', t, 'EXECUTE') THEN RAISE EXCEPTION 'quolino_admin nie może wywołać % — wycofuję', t; END IF;
  END LOOP;
  IF has_table_privilege('web_anon', 'ops.trip_plan', 'SELECT') THEN RAISE EXCEPTION 'web_anon czyta ops.trip_plan — wycofuję'; END IF;
  IF has_table_privilege('quolino_admin', 'ops.trip_plan', 'INSERT') THEN RAISE EXCEPTION 'quolino_admin pisze do ops.trip_plan z pominięciem skryptu — wycofuję'; END IF;
  IF (SELECT count(*) FROM ops.trip_plan) < 26 THEN RAISE EXCEPTION 'plan tras niepełny — wycofuję'; END IF;

  -- plan: następne miasto Umbrii nie może być zrobione ani w kolejce; wyczerpany region → kolejny; nieznany region → pierwszy z planu
  nx := admin.trip_next('umbria');
  IF nx IS NOT NULL AND EXISTS (SELECT 1 FROM admin.trip_plan WHERE slug = nx ->> 'slug' AND (done_v2 OR has_draft OR job_status IS NOT NULL)) THEN
    RAISE EXCEPTION 'trip_next wskazał miasto zrobione albo w kolejce (%) — wycofuję', nx ->> 'slug';
  END IF;
  IF nx IS NOT NULL AND (nx ->> 'region') <> 'umbria' AND EXISTS (SELECT 1 FROM admin.trip_plan WHERE region = 'umbria' AND NOT done_v2 AND NOT has_draft AND job_status IS NULL) THEN
    RAISE EXCEPTION 'trip_next pominął wolne miasto Umbrii — wycofuję';
  END IF;
  nx := admin.trip_next('nie-ma-takiego-regionu');
  IF nx IS NOT NULL AND (nx ->> 'region') NOT IN ('umbria', 'marche', 'emilia-romagna') THEN RAISE EXCEPTION 'trip_next: zły region zapasowy — wycofuję'; END IF;
  RAISE NOTICE 'samokontrola: następna trasa po Umbrii → % (%), po nieznanym regionie → %', (admin.trip_next('umbria')) ->> 'name', (admin.trip_next('umbria')) ->> 'region', nx ->> 'name';

  -- bramka na prawdziwym szkicu z otwartymi uwagami kontroli (jeśli jest): musi blokować; po wstawieniu odpowiedzi (savepoint) flagi znikają
  SELECT city_slug, version INTO d FROM public.city_versions
   WHERE status = 'draft' AND ((jsonb_typeof(review -> 'warnings') = 'array' AND jsonb_array_length(review -> 'warnings') > 0)
                            OR (jsonb_typeof(review -> 'errors') = 'array' AND jsonb_array_length(review -> 'errors') > 0))
   ORDER BY id DESC LIMIT 1;
  IF d.city_slug IS NOT NULL THEN
    g := admin.publish_gate(d.city_slug, d.version);
    RAISE NOTICE 'samokontrola: bramka %/v% → ok=% flagi=% błędy=% niewysłane=% prośba=%', d.city_slug, d.version, g ->> 'ok', g ->> 'flags_open', g ->> 'errors', g ->> 'unsent', g ->> 'request_status';
    IF jsonb_typeof(g -> 'reasons') <> 'array' THEN RAISE EXCEPTION 'publish_gate bez listy powodów — wycofuję'; END IF;
    BEGIN
      -- odpowiedź JP do każdej otwartej flagi (status new → bramka nadal blokuje przez „niewysłane”, ale flagi = 0)
      INSERT INTO public.draft_comments (city_slug, city_version, field, field_label, body, status)
      SELECT d.city_slug, d.version, 'review.' || k || '.' || (o - 1), probe, '✗ Zostaw bez zmian', 'sent'
        FROM (SELECT 'e' AS k, o FROM jsonb_array_elements((SELECT CASE WHEN jsonb_typeof(review -> 'errors') = 'array' THEN review -> 'errors' ELSE '[]'::jsonb END FROM public.city_versions WHERE city_slug = d.city_slug AND version = d.version)) WITH ORDINALITY t(x, o)
              UNION ALL
              SELECT 'w', o FROM jsonb_array_elements((SELECT CASE WHEN jsonb_typeof(review -> 'warnings') = 'array' THEN review -> 'warnings' ELSE '[]'::jsonb END FROM public.city_versions WHERE city_slug = d.city_slug AND version = d.version)) WITH ORDINALITY t(x, o)) s;
      -- uwagi zbiorcze: jedna odpowiedź na każdy fragment (review.<k>.N.j) — podział jak w bramce i w ReviewWhere.splitAggregate
      INSERT INTO public.draft_comments (city_slug, city_version, field, field_label, body, status)
      SELECT d.city_slug, d.version, 'review.' || s.k || '.' || (s.o - 1) || '.' || gs, probe, '✗ Zostaw bez zmian', 'sent'
        FROM (SELECT 'e' AS k, x, o FROM jsonb_array_elements((SELECT CASE WHEN jsonb_typeof(review -> 'errors') = 'array' THEN review -> 'errors' ELSE '[]'::jsonb END FROM public.city_versions WHERE city_slug = d.city_slug AND version = d.version)) WITH ORDINALITY t(x, o)
              UNION ALL
              SELECT 'w', x, o FROM jsonb_array_elements((SELECT CASE WHEN jsonb_typeof(review -> 'warnings') = 'array' THEN review -> 'warnings' ELSE '[]'::jsonb END FROM public.city_versions WHERE city_slug = d.city_slug AND version = d.version)) WITH ORDINALITY t(x, o)) s,
             LATERAL (SELECT regexp_match(CASE WHEN jsonb_typeof(s.x) = 'object' THEN coalesce(s.x ->> 'problem', '') ELSE '' END,
                                          '^(\[[^\]]+\]\s*)?Fakty bez źródła \((\d+)\)[^:]*:\s*(.+)$') AS m) a,
             LATERAL (SELECT count(*)::int AS np FROM regexp_split_to_table(a.m[3], ';\s+') pt(part) WHERE btrim(pt.part) <> '') b,
             LATERAL generate_series(0, b.np - 1) gs
       WHERE a.m IS NOT NULL;
      g := admin.publish_gate(d.city_slug, d.version);
      IF (g ->> 'flags_open')::int <> 0 THEN RAISE EXCEPTION 'po odpowiedziach na wszystkie flagi bramka wciąż liczy % flag — wycofuję', g ->> 'flags_open'; END IF;
      RAISE EXCEPTION USING ERRCODE = 'P0998', MESSAGE = 'samokontrola: wycofanie testowych odpowiedzi';
    EXCEPTION WHEN SQLSTATE 'P0998' THEN NULL;
    END;
    SELECT count(*) INTO cnt FROM public.draft_comments WHERE field_label = probe;
    IF cnt <> 0 THEN RAISE EXCEPTION 'testowe odpowiedzi zostały w draft_comments — wycofuję'; END IF;
  ELSE
    RAISE NOTICE 'samokontrola: brak szkicu z uwagami kontroli — bramka sprawdzona tylko na nieistniejącym szkicu';
    g := admin.publish_gate('nie-ma-takiego-miasta', 1);
    IF (g ->> 'ok')::boolean THEN RAISE EXCEPTION 'publish_gate przepuszcza nieistniejący szkic — wycofuję'; END IF;
  END IF;
  -- zatwierdzenie szkicu z otwartymi flagami musi się nie udać (nic nie publikujemy: wyjątek cofa savepoint)
  IF d.city_slug IS NOT NULL AND (admin.publish_gate(d.city_slug, d.version) ->> 'ok')::boolean IS NOT TRUE THEN
    BEGIN
      PERFORM admin.admin_approve(d.city_slug, d.version, 'samokontrola');
      RAISE EXCEPTION 'admin_approve opublikował szkic mimo blokady — wycofuję';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'Publikacja zablokowana:%' THEN RAISE; END IF;
    END;
    IF (SELECT status FROM public.city_versions WHERE city_slug = d.city_slug AND version = d.version) <> 'draft' THEN RAISE EXCEPTION 'szkic zmienił status — wycofuję'; END IF;
  END IF;
  IF (admin.translation_cost_estimate() ->> 'usd')::numeric < 0 THEN RAISE EXCEPTION 'szacunek kosztu ujemny — wycofuję'; END IF;
  RAISE NOTICE 'samokontrola OK: bramka publikacji, zgoda na tłumaczenia (%), plan tras (% miast), następna trasa po publikacji',
    admin.translation_cost_estimate() ->> 'source', (SELECT count(*) FROM ops.trip_plan);
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Cofnięcie: przywrócić admin.admin_approve z 2026-10-31-ikony-przystankow.sql; DROP FUNCTION admin.admin_publish_gate(text, int),
--   admin.publish_gate(text, int), admin.admin_trip_next(text), admin.trip_next(text, text), admin.pl3(int, text, text, text), admin.translation_consent(text, int, bigint, text),
--   admin.translation_cost_estimate(); DROP VIEW admin.trip_plan; DROP TABLE ops.trip_plan, ops.trip_plan_regions;
--   DELETE FROM ops.cost_requests WHERE kind = 'translate';
