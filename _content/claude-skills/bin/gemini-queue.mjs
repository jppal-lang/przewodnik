#!/usr/bin/env node
// Kolejka nowych wycieczek (nowy proces, JP 2026-10-24): zadania ops.jobs z worker = 'gemini', kind = 'draft'.
//   Dodanie (Hermes w wątku miasta albo JP):  node qdb.mjs job-add <slug> draft gemini '{"name":"Gubbio","region":"umbria","duration":"full_day","brief":"…"}'
//   Uruchamiany z crona roota co 10 min. Jedno miasto naraz; cichy, gdy kolejka pusta.
//   --night: pracuje tylko w nocy (22:00–07:00 czasu polskiego) — tańszy, spokojny tryb na później.
// Zadanie: queued → running → done (wynik: wersja, link) albo failed (powód). Running starsze niż 3 h (padło) wraca do queued.
import { writeFileSync, existsSync, readFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { db, log } from './lib.mjs';
import { WORK, notify } from './draft-lib.mjs';
import { importUsage } from './ai-usage-import.mjs';

const sh = promisify(execFile);
const argv = process.argv.slice(2);
const ADMIN = '1558873867643134073';   // #admin, gdy miasto nie ma jeszcze wątku
const DIR = new URL('.', import.meta.url).pathname;
const LOCK = join(WORK, '..', 'gemini-queue.lock');

// karta „Koszty AI”: dziennik zużycia do bazy co 10 min, także gdy kolejka pracuje albo czeka na noc
{ const c0 = await db(); try { await importUsage(async (sql, p) => (await c0.query(sql, p)).rows); } catch (e) { log(`ai_usage: ${e.message.slice(0, 160)}`); } finally { await c0.end(); } }
if (argv.includes('--night')) {
  const h = +new Intl.DateTimeFormat('pl-PL', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Warsaw' }).format(new Date());
  if (h >= 7 && h < 22) process.exit(0);
}
mkdirSync(WORK, { recursive: true });
if (existsSync(LOCK)) {
  try { process.kill(+readFileSync(LOCK, 'utf8'), 0); process.exit(0); } catch { /* martwy PID — przejmujemy */ }
}
writeFileSync(LOCK, String(process.pid));
const c = await db();
const q = async (sql, p) => (await c.query(sql, p)).rows;

try {
  await q(`UPDATE jobs SET status = 'queued' WHERE status = 'running' AND worker = 'gemini' AND created_at < now() - interval '3 hours'
             AND (result IS NULL OR result NOT LIKE 'v%')`).catch(() => {});
  const [job] = await q(`SELECT id, city_slug, request FROM jobs WHERE status = 'queued' AND worker = 'gemini' AND kind = 'draft' ORDER BY id LIMIT 1`);
  if (job) {
    const slug = job.city_slug;
    let req;
    try { req = JSON.parse(job.request); } catch { req = null; }
    const [th] = await q('SELECT discord_thread_id FROM ops.cities WHERE slug = $1', [slug]).catch(() => []);
    const thread = th?.discord_thread_id ?? ADMIN;
    if (!req?.name || !req?.region) {
      await q(`UPDATE jobs SET status = 'failed', result = $2, finished_at = now() WHERE id = $1`, [job.id, 'zlecenie bez JSON {name, region, …}']);
      await notify(thread, `⚠️ Zadanie #${job.id} (${slug}): brak nazwy albo regionu w zleceniu — nie ruszam.`);
    } else {
      await q(`UPDATE jobs SET status = 'running' WHERE id = $1`, [job.id]);
      log(`kolejka: #${job.id} ${slug} — start`);
      const args = [join(DIR, 'gemini-draft.mjs'), slug, '--name', req.name, '--region', req.region, '--country', req.country ?? 'it',
        '--duration', req.duration ?? 'half_day', '--notify', thread].concat(req.brief ? ['--brief', req.brief] : []).concat(req.fresh ? ['--fresh'] : []);
      try {
        const { stdout } = await sh('node', args, { timeout: 4 * 60 * 60 * 1000, maxBuffer: 50e6 });
        const out = JSON.parse(stdout.slice(stdout.lastIndexOf('{\n')));
        await q(`UPDATE jobs SET status = 'done', result = $2, finished_at = now() WHERE id = $1`, [job.id, `v${out.version} · ${out.panel ?? ''}`]);
        log(`kolejka: #${job.id} ${slug} → v${out.version}`);
      } catch (e) {
        const why = String(e.stderr || e.message || e).split('\n').filter(l => /BŁĄD|Error/.test(l)).pop() ?? String(e.message).slice(0, 300);
        // dzienny limit / brak odpowiedzi → wraca do kolejki (postęp zapisany w work/drafts, wznowienie od miejsca przerwania)
        const back = /dzienny limit|bez odpowiedzi|timeout|ETIMEDOUT|429/i.test(why);
        await q(`UPDATE jobs SET status = $2, result = $3, finished_at = CASE WHEN $2 = 'failed' THEN now() END WHERE id = $1`,
          [job.id, back ? 'queued' : 'failed', why.slice(0, 500)]);
        log(`kolejka: #${job.id} ${slug} — ${back ? 'odłożone' : 'błąd'}: ${why.slice(0, 160)}`);
      }
    }
  }
} finally {
  await c.end();
  try { unlinkSync(LOCK); } catch { /* brak */ }
}
