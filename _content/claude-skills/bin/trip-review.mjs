#!/usr/bin/env node
// Sprawdzenie opisu wycieczki (umiejętność quolino-trip-writing, tryb B).
//   node trip-review.mjs <katalog miasta z *.meta.json i *.pl.json> [--no-ai]
// 1) walidator mechaniczny validate_trip.py, 2) ocena merytoryczna Claude (z dostępem do sieci
// do weryfikacji faktów), 3) raport review-<data>.json w katalogu miasta. Kod 1 = do poprawy.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SKILLS, run, claude, extractJson, log } from './lib.mjs';

const dir = resolve(process.argv[2] ?? '');
if (!process.argv[2]) { console.error('Użycie: trip-review.mjs <katalog miasta> [--no-ai]'); process.exit(2); }

const v = await run('python3', [`${SKILLS}/quolino-trip-writing/scripts/validate_trip.py`, dir]);
const validator = (v.out + v.err).trim();
log(`walidator: kod ${v.code}`);

let review = { verdict: v.code === 0 ? 'ok' : 'fix', summary: 'Tylko walidator mechaniczny.', errors: [], warnings: [], validator_exit: v.code };
if (!process.argv.includes('--no-ai')) {
  const files = readdirSync(dir).filter(f => /\.(meta|pl)\.json$|\.html$/.test(f));
  const body = files.map(f => `=== ${f} ===\n${readFileSync(join(dir, f), 'utf8')}`).join('\n\n');
  const prompt = `Tryb B — SPRAWDZANIE. Sprawdź tę wycieczkę według umiejętności quolino-trip-writing.
Wynik walidatora mechanicznego (kod ${v.code}) — każdy błąd przepisz do "errors":
${validator}

Pliki wycieczki:
${body}

Odpowiedz wyłącznie JSON-em werdyktu.`;
  review = extractJson(await claude('quolino-trip-writing', prompt, { web: true }));
  review.validator_exit = v.code;
  if (v.code !== 0) review.verdict = 'fix';
}
const out = join(dir, `review-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`);
writeFileSync(out, JSON.stringify(review, null, 2));
console.log(JSON.stringify({ verdict: review.verdict, errors: review.errors.length, warnings: review.warnings.length, report: out, summary: review.summary }, null, 2));
process.exit(review.verdict === 'ok' ? 0 : 1);
