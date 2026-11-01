#!/usr/bin/env node
// Nowa trasa do kolejki Gemini (JP 2026-11-01: „kiedy zaczynasz pracę nad kolejną wycieczką?” — start bez konsoli).
//   node trip-enqueue.mjs <slug> --name "Asyż" --region umbria [--country it] [--duration half_day|full_day] [--brief "…"] [--fresh] [--dry]
// Robi DOKŁADNIE to, co `node qdb.mjs job-add <slug> draft gemini '{"name","region","country","duration","brief","fresh"}'`:
// wiersz ops.jobs (kind 'draft', worker 'gemini', status 'queued', request = JSON), który gemini-queue.mjs (cron co 10 min)
// podejmie przy najbliższym przebiegu i uruchomi gemini-draft.mjs. Idempotentny: to samo miasto z zadaniem queued/running → nic nie
// dubluje (kod 0, wypisuje numer istniejącego zadania). Trzy drogi do tego samego wiersza: panel (admin.admin_trip_enqueue, SQL
// 2026-11-01-nowa-trasa.sql), zlecenie z repo (_content/jobs/*.json → repo-jobs.mjs; skrypt KOSZTOWNY: wymaga jp_ok) i qdb na serwerze.
// Sam skrypt nic nie wydaje — koszt (≈20–40 wywołań Antigravity z abonamentu, 0 $) ponosi dopiero kolejka, dlatego zgoda JP jest tu.
import { db, log } from './lib.mjs';
import { parseArgs, enqueue } from './trip-enqueue-lib.mjs';
export { slugify, parseArgs, validate, buildRequest, enqueue, SLUG_RE, DURATIONS } from './trip-enqueue-lib.mjs';

if (import.meta.url === `file://${process.argv[1]}`) {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`BŁĄD: ${e.message}`); process.exit(2); }
  if (!o.slug || !o.name || !o.region) {
    console.error('Użycie: trip-enqueue.mjs <slug> --name "Nazwa" --region <region_slug> [--country it] [--duration half_day|full_day] [--brief "…"] [--fresh] [--dry]');
    process.exit(2);
  }
  const c = await db();
  try {
    const r = await enqueue(o, async (sql, p) => (await c.query(sql, p)).rows);
    if (r.dry) log(`${o.slug}: (próba) zlecenie ${JSON.stringify(r.request)}`);
    else if (r.created) log(`${o.slug}: w kolejce jako #${r.id} — gemini-queue.mjs podejmie przy najbliższym przebiegu (cron co 10 min)`);
    else log(`${o.slug}: już ma zadanie #${r.id} (queued/running) — nie dubluję`);
    console.log(JSON.stringify({ city_slug: o.slug, ...r }));
  } catch (e) {
    // stary CHECK ops.jobs bez workera 'gemini' — czekamy na zatwierdzenie 2026-11-01-nowa-trasa.sql (repo-jobs ponowi, kod 75)
    if (/jobs_worker_check/.test(e.message)) { log(`${o.slug}: baza nie przyjmuje jeszcze workera 'gemini' — czeka na zatwierdzenie SQL 2026-11-01-nowa-trasa.sql (Decyzje)`); process.exitCode = 75; }
    else { console.error(`BŁĄD: ${e.message}`); process.exitCode = 1; }
  } finally { await c.end(); }
}
