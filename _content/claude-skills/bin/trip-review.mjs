#!/usr/bin/env node
// Sprawdzenie opisu wycieczki (umiejętność quolino-trip-writing, tryb B).
//   node trip-review.mjs <katalog miasta z *.meta.json i *.pl.json> [--no-ai]
// 1) walidator mechaniczny validate_trip.py, 2) ocena merytoryczna Claude (z dostępem do sieci
// do weryfikacji faktów; gdy obok jest research.md — sprawdza też, czy opis go wykorzystał, w tym legendy), 3) raport review-<data>.json w katalogu miasta. Kod 1 = do poprawy.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { SKILLS, run, claudeJson, JSON_QUOTE_RULE, log } from './lib.mjs';

const dir = resolve(process.argv[2] ?? '');
if (!process.argv[2]) { console.error('Użycie: trip-review.mjs <katalog miasta> [--no-ai]'); process.exit(2); }

const v = await run('python3', [`${SKILLS}/quolino-trip-writing/scripts/validate_trip.py`, dir]);
const validator = (v.out + v.err).trim();
log(`walidator: kod ${v.code}`);

let review = { verdict: v.code === 0 ? 'ok' : 'fix', summary: 'Tylko walidator mechaniczny.', errors: [], warnings: [], validator_exit: v.code };
// ── kontrola przyrostowa (JP 2026-10-26, oszczędność limitów): Claude czyta ponownie tylko przystanki, które się zmieniły.
// Błędy przystanków bez zmian przechodzą z poprzedniej kontroli; plan dnia i trasa (meta) są sprawdzane zawsze. --full = całość.
const CACHE = join(dirname(dir), 'review-cache.json');
const sha = (x) => createHash('sha1').update(JSON.stringify(x ?? null)).digest('hex').slice(0, 16);
const metaF = readdirSync(dir).find(f => f.endsWith('.meta.json')), plF = readdirSync(dir).find(f => f.endsWith('.pl.json'));
const META = metaF ? JSON.parse(readFileSync(join(dir, metaF), 'utf8')) : {}, PLJ = plF ? JSON.parse(readFileSync(join(dir, plF), 'utf8')) : {};
const stopHash = {};
for (const st of META.stops ?? []) { const k = st.stop_key; if (k) stopHash[k] = sha([st, PLJ.stops?.[k], PLJ.day_plan?.[k]]); }
const prevC = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : null;
const allKeys = Object.keys(stopHash);
const changed = new Set(prevC && !process.argv.includes('--full') ? allKeys.filter(k => prevC.stops?.[k] !== stopHash[k]) : allKeys);
const incremental = !!prevC && !process.argv.includes('--full') && changed.size < allKeys.length * 0.6;
const cityHash = sha([PLJ.city, META.city, PLJ.emergency, allKeys]);
if (!process.argv.includes('--no-ai') && incremental && !changed.size && prevC.city === cityHash && prevC.validator === sha(validator)) {
  log('kontrola: bez zmian od poprzedniej — wynik z pamięci, bez wywołania Claude');
  review = { ...prevC.review, validator_exit: v.code }; if (v.code !== 0) review.verdict = 'fix';
} else if (!process.argv.includes('--no-ai')) {
  let body;
  if (incremental) {
    const part = { ...PLJ, stops: Object.fromEntries(Object.entries(PLJ.stops ?? {}).filter(([k]) => changed.has(k))) };
    log(`kontrola przyrostowa: ${changed.size} z ${allKeys.length} przystanków zmienionych (${[...changed].join(', ')})`);
    body = `KONTROLA PRZYROSTOWA: sprawdzasz TYLKO przystanki: ${[...changed].join(', ') || '(żaden — tylko plan dnia i dane trasy)'}.
Pozostałe przystanki sprawdzono wcześniej i się nie zmieniły — nie zgłaszaj do nich błędów. Sprawdź też plan dnia, kolejność i godziny całej trasy (meta).
=== ${metaF} ===\n${JSON.stringify(META, null, 1)}\n\n=== ${plF} (tylko zmienione przystanki) ===\n${JSON.stringify(part, null, 1)}`;
  } else {
    const files = readdirSync(dir).filter(f => /\.(meta|pl)\.json$|\.html$/.test(f));
    body = files.map(f => `=== ${f} ===\n${readFileSync(join(dir, f), 'utf8')}`).join('\n\n');
  }
  // research.md: w katalogu miasta albo piętro wyżej (szkice: work/drafts/<slug>/research.md)
  const rf = [join(dir, 'research.md'), join(dirname(dir), 'research.md')].find(existsSync);
  // research tylko przy pełnej kontroli (przyrostowa: fakty sprawdza extraCheck na źródłach przystanku)
  const research = rf && !incremental ? readFileSync(rf, 'utf8') : null;
  const prompt = `Tryb B — SPRAWDZANIE. Sprawdź tę wycieczkę według umiejętności quolino-trip-writing.
Wynik walidatora mechanicznego (kod ${v.code}) — każdy błąd przepisz do "errors":
${validator}

Sprawdź też minimum głębokości opisu rodzica (zabytek 4 akapity i 300 słów, mały obiekt — monument — 3 akapity i 180 słów; ulica/punkt widokowy/zdjęcie 2 akapity i 120 słów)
i szkielet opisu (hak, historia i ludzie, „Kim był…”, co oglądać, legenda, ciekawostka/popkultura/znaczenie dziś).
${research ? `Do wycieczki dołączony jest RESEARCH. Porównaj z nim opis każdego zabytku: czy wykorzystał ludzi, detale do oglądania, popkulturę
i LEGENDY. BŁĄD: legenda z researchu pominięta w opisie; legenda podana jako fakt; legenda bez oznaczenia („Legenda mówi…” /
„Według tradycji…”). UWAGA: zabytek bez linijki „Legendy: …” w researchu. Fakt w opisie, którego nie ma w researchu ani w źródłach
przystanku = błąd (nie wolno zmyślać przy rozbudowie).
=== research.md ===
${research}
` : 'Research nie jest dołączony — oceń legendy i głębokość wyłącznie na podstawie samego opisu i źródeł przystanków.\n'}
Pliki wycieczki:
${body}

Odpowiedz wyłącznie JSON-em werdyktu. ${JSON_QUOTE_RULE}`;
  try {
    review = await claudeJson('quolino-trip-writing', prompt, { web: !incremental, rawFile: join(dir, `review-raw-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.txt`) });
  } catch (e) { console.error(`BŁĄD kontroli: ${e.message}`); process.exit(3); }
  review.validator_exit = v.code;
  if (incremental && prevC?.review) {   // błędy przystanków bez zmian — z poprzedniej kontroli
    const keep = (e) => e?.stop_key && !changed.has(e.stop_key);
    const fresh = (e) => !e?.stop_key || changed.has(e.stop_key);
    review.errors = [...(prevC.review.errors ?? []).filter(keep), ...(review.errors ?? []).filter(fresh)];
    review.warnings = [...(prevC.review.warnings ?? []).filter(keep), ...(review.warnings ?? []).filter(fresh)];
    if (review.errors.length) review.verdict = 'fix';
  }
  if (v.code !== 0) review.verdict = 'fix';
  try { writeFileSync(CACHE, JSON.stringify({ stops: stopHash, city: cityHash, validator: sha(validator), review }, null, 1)); } catch { /* bez pamięci podręcznej */ }
}
const out = join(dir, `review-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`);
writeFileSync(out, JSON.stringify(review, null, 2));
console.log(JSON.stringify({ verdict: review.verdict, errors: review.errors.length, warnings: review.warnings.length, report: out, summary: review.summary }, null, 2));
process.exit(review.verdict === 'ok' ? 0 : 1);
