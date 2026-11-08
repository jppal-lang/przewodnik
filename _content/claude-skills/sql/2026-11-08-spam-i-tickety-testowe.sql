-- JP 2026-11-08: „wszystkie zrobione przez agentów należy usunąć” + „TEST: cheap watches replica… lub reklamujące treści
-- niedozwolone należy traktować jak spam”.
-- 1) ops.is_spam(text) — reklama niedozwolonych treści / linki z zachętą → ticket od razu w „Spam” (bez czekania na Jev).
-- 2) Usunięcie 25 zgłoszeń testowych (11.10 i 25.10) razem z wierszami źródłowymi. Guard po numerach I źródłach.

CREATE OR REPLACE FUNCTION ops.is_spam(p text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $f$
  SELECT coalesce(
       p ~* '\m(replica|replika|viagra|cialis|casino|kasyno|porn\w*|xxx|escort|airdrop|forex|backlinks?|crypto|bitcoin|betting|bukmacher\w*|pills?|tabletki na)\M'
    OR (p ~* '(https?://|www\.)' AND p ~* '\m(best price|cheap|buy|click|visit|discount|promo|free money|tanio|kup teraz|kliknij|zarabiaj)\M')
    OR (SELECT count(*) FROM regexp_matches(p, '(https?://|www\.)', 'gi')) >= 3, false);
$f$;
ALTER FUNCTION ops.is_spam(text) OWNER TO quolino;

CREATE OR REPLACE FUNCTION ops.ticket_spam_check() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_temp AS $f$
BEGIN
  IF NEW.author = 'client' AND ops.is_spam(NEW.body) THEN
    UPDATE ops.tickets SET status = 'spam', updated_at = now() WHERE id = NEW.ticket_id AND status IN ('new', 'open');
  END IF;
  RETURN NEW;
END $f$;
ALTER FUNCTION ops.ticket_spam_check() OWNER TO quolino;
DROP TRIGGER IF EXISTS ticket_spam ON ops.ticket_messages;
CREATE TRIGGER ticket_spam AFTER INSERT ON ops.ticket_messages FOR EACH ROW EXECUTE FUNCTION ops.ticket_spam_check();

-- to, co już leży (prawdziwe tickety, jeśli kiedyś przyjdą przed wdrożeniem)
UPDATE ops.tickets t SET status = 'spam', updated_at = now()
 WHERE t.status IN ('new', 'open') AND EXISTS (SELECT 1 FROM ops.ticket_messages m WHERE m.ticket_id = t.id AND m.author = 'client' AND ops.is_spam(m.body));

-- zgłoszenia testowe
CREATE TEMP TABLE _test_t (number text, source text, source_id text);
INSERT INTO _test_t VALUES
 ('Q-3WVX-DR79','rating','411cee3f-8cd2-46c2-a6b4-e9de65b2f6d7'),
 ('Q-VAYZ-8FEQ','report','c7902dc9-caee-4876-a90f-adb999eb7ab3'), ('Q-H4ZA-U3C9','report','35380512-9567-4dd7-b4ff-99010d4ee984'),
 ('Q-Y4EZ-MDYF','report','ca1db518-0978-4b7f-925e-f4f8aa3f0f92'), ('Q-69WX-FE69','report','0608aa17-bde4-4a9d-a591-fa51c54802fd'),
 ('Q-PRT7-B7E4','report','0fcf5a11-e791-4e64-8ba9-a4d9a7fdd805'), ('Q-U4P2-9U42','report','5564e5c5-ff05-4eb9-94d9-e21fd47701a9'),
 ('Q-2PGQ-RN8U','report','5c3823a3-72b6-4458-b5b9-cb3bc155b0a9'),
 ('Q-WJZN-ANTS','rating','7c9c0828-0894-4f9e-8002-89fba98958ef'), ('Q-WVPE-SH2W','rating','ffe3b187-61d9-451f-9ccc-6ca65ea40d53'),
 ('Q-XD7P-QBMV','rating','74936ace-d693-4593-8fa4-d9e72c2f0b16'),
 ('Q-GJPX-P483','contact','1'), ('Q-4RAW-2GCR','contact','2'), ('Q-VAXQ-8ZX8','contact','3'), ('Q-FFTK-Z6GH','contact','4'),
 ('Q-VMFD-Q7AA','report','ca491981-2ff5-472f-a386-0931863fb9e6'), ('Q-K25T-TJXX','report','8b031c3e-5754-4a1a-86c4-98fd02c0d22c'),
 ('Q-NFMX-WRSV','report','067b2216-ec44-45c8-88da-be35605e8816'),
 ('Q-5ZBW-BJ32','rating','2c4a0adc-5628-4977-b136-dea4b6e7f6e6'), ('Q-QD79-WCER','rating','1ee2a23e-2f33-47bf-96b2-03fd419791f7'),
 ('Q-FPTB-EHTP','rating','3447f797-58cd-48a0-975e-dae0a5166e4e'),
 ('Q-MKYJ-BNFB','contact','6'), ('Q-GATQ-MYJW','contact','7'), ('Q-WCHR-6YMA','contact','5'), ('Q-5XD5-ADKM','contact','8');

-- tylko wiersze z datą testów (11.10 / 25.10) — gdyby id się kiedyś powtórzyło, nic prawdziwego nie zniknie
DELETE FROM ops.tickets t USING _test_t x
 WHERE t.number = x.number AND t.source = x.source AND t.source_id = x.source_id AND t.created_at < '2026-10-26';
DELETE FROM ops.reports r USING _test_t x WHERE x.source = 'report' AND r.id::text = x.source_id AND r.created_at < '2026-10-26';
DELETE FROM ops.ratings r USING _test_t x WHERE x.source = 'rating' AND r.id::text = x.source_id;
DELETE FROM ops.contact_messages c USING _test_t x WHERE x.source = 'contact' AND c.id::text = x.source_id AND c.created_at < '2026-10-26';
