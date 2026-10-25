#!/usr/bin/env node
// Sprawdzenie opisu wycieczki (umiejętność quolino-trip-writing, tryb B).
//   node trip-review.mjs <katalog miasta z *.meta.json i *.pl.json> [--no-ai]
// 1) walidator mechaniczny validate_trip.py, 2) ocena merytoryczna Claude (z dostępem do sieci
// do weryfikacji faktów; gdy obok jest research.md — sprawdza też, czy opis go wykorzystał, w tym legendy), 3) raport review-<data>.json w katalogu miasta. Kod 1 = do poprawy.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { SKILLS, run, claudeJson, JSON_QUOTE_RULE, log } from './lib.mjs';

const dir = resolve(process.argv[2] ?? '');
if (!process.argv[2]) { console.error('Użycie: trip-review.mjs <katalog miasta> [--no-ai]'); process.exit(2); }

const v = await run('python3', [`${SKILLS}/quolino-trip-writing/scripts/validate_trip.py`, dir]);
const validator = (v.out + v.err).trim();
log(`walidator: kod ${v.code}`);

let review = { verdict: v.code === 0 ? 'ok' : 'fix', summary: 'Tylko walidator mechaniczny.', errors: [], warnings: [], validator_exit: v.code };
if (!process.argv.includes('--no-ai')) {
  const files = readdirSync(dir).filter(f => /\.(meta|pl)\.json$|\.html$/.test(f));
  const body = files.map(f => `=== ${f} ===\n${readFileSync(join(dir, f), 'utf8')}`).join('\n\n');
  // research.md: w katalogu miasta albo piętro wyżej (szkice: work/drafts/<slug>/research.md)
  const rf = [join(dir, 'research.md'), join(dirname(dir), 'research.md')].find(existsSync);
  const research = rf ? readFileSync(rf, 'utf8') : null;
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
    review = await claudeJson('quolino-trip-writing', prompt, { web: true, rawFile: join(dir, `review-raw-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.txt`) });
  } catch (e) { console.error(`BŁĄD kontroli: ${e.message}`); process.exit(3); }
  review.validator_exit = v.code;
  if (v.code !== 0) review.verdict = 'fix';
}
const out = join(dir, `review-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`);
writeFileSync(out, JSON.stringify(review, null, 2));
console.log(JSON.stringify({ verdict: review.verdict, errors: review.errors.length, warnings: review.warnings.length, report: out, summary: review.summary }, null, 2));
process.exit(review.verdict === 'ok' ? 0 : 1);
