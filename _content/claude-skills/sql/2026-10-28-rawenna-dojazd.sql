-- Rawenna, przystanek 7 (Mauzoleum Teodoryka): zamiast „dziesięć minut autem” — „kilka do kilkunastu minut autem”
-- (decyzja JP 2026-10-28 po teście; zasada: bez dokładnych czasów dojazdu). Tylko wersja polska — innych języków ta trasa nie ma.
BEGIN;
UPDATE public.stop_translations t
   SET desc_paragraphs[1] = replace(t.desc_paragraphs[1], 'dziesięć minut autem', 'kilka do kilkunastu minut autem')
  FROM public.stops s
 WHERE s.id = t.stop_id AND s.city_slug = 'rawenna' AND s.stop_key = 'rawenna-07' AND t.lang = 'pl'
   AND t.desc_paragraphs[1] LIKE '%dziesięć minut autem%';
COMMIT;
