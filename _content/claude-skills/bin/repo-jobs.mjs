#!/usr/bin/env node
// Zlecenia z repo dla Hermesa (JP 2026-10-30): Claude (albo JP) zleca jednorazowe zadanie bez konsoli VPS —
// plik _content/jobs/<nazwa>.json w repo GitHub. Uruchamiane przez gemini-queue.mjs (cron co 10 min) albo ręcznie: node repo-jobs.mjs [--dry-run]
//   {"script": "gemini-draft.mjs", "args": ["spello", "--recheck", …], "why": "po co", "by": "Claude"}
// Zasady:
// - czyta WYŁĄCZNIE gałąź origin/main (git fetch + git show w klonie /opt/data/repo/przewodnik) — niczego w klonie nie zmienia,
//   więc nie miesza się z pracą Hermesa w tym klonie; pliki poza repo (Discord, strony) nie są zleceniami;
// - tylko skrypty z białej listy (ALLOWED), argumenty jako lista (bez powłoki), każdy plik wykonuje się RAZ:
//   rejestr work/repo-jobs.json (nazwa → running/done/failed, wynik); zmiana treści pliku o tej samej nazwie nie uruchamia go ponownie;
// - zlecenie przerwane (proces padł) zostaje „failed”, nie powtarza się samo — nowa próba = nowy plik;
// - dziennik zadania: work/jobs/<nazwa>.log. Katalog _content/jobs/ leży poza _content/claude-skills, więc nie czeka na zgodę JP w deploy.sh.
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, openSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const sh = promisify(execFile);
export const REPO = process.env.QUOLINO_REPO ?? '/opt/data/repo/przewodnik';
export const JOBS_DIR = '_content/jobs';
const BASE = process.env.QUOLINO_BASE ?? '/opt/data/quolino';
const WORK = join(BASE, 'work');
const REG = join(WORK, 'repo-jobs.json'), LOCK = join(WORK, 'repo-jobs.lock');
// skrypt → kontrola argumentów (true = wolno). Tylko to, co nie wymaga zgody JP: poprawki szkiców (nowa wersja do zatwierdzenia w panelu) i odczyty.
export const ALLOWED = {
  'gemini-draft.mjs': (a) => a.includes('--recheck') || a.includes('--revise'),   // nowa trasa idzie przez kolejkę ops.jobs, nie tędy
  'show-review.mjs': () => true,
  'usage-summary.mjs': () => true,
  // ponowienie tłumaczenia opublikowanej trasy (te same kontrole jakości co w kolejce; bez --dry/--job z zewnątrz)
  // kandydaci zdjęć do ikon miejsc (tylko odczyt Commons + plik JSON w repo): dokładnie jeden argument — slug trasy
  'place-candidates.mjs': (a) => a.length === 1 && /^[a-z0-9][a-z0-9-]{0,62}$/.test(a[0]),
  'trip-translate.mjs': (a) => /^[a-z0-9-]+$/.test(a[0] ?? '') && a.slice(1).every((x, i, r) => x === '--fresh' || x === '--langs' || (r[i - 1] === '--langs' && /^[a-z]{2}(,[a-z]{2})*$/.test(x))),
};
export function validateJob(job) {
  if (!job || typeof job !== 'object') return 'zlecenie nie jest obiektem JSON';
  if (!Object.hasOwn(ALLOWED, job.script)) return `skrypt spoza białej listy: ${job.script}`;
  if (!Array.isArray(job.args) || job.args.some(x => typeof x !== 'string' || x.length > 20_000 || /[\0\n\r]/.test(x))) return 'args: lista napisów bez znaków nowej linii';
  if (job.args.some(x => /^--(notify-all|exec|eval)$/.test(x))) return 'niedozwolony argument';
  if (!ALLOWED[job.script](job.args)) return `${job.script}: niedozwolone argumenty`;
  if (job.not_before && Date.parse(job.not_before) > Date.now()) return 'wait';
  return null;
}
const readReg = () => { try { return JSON.parse(readFileSync(REG, 'utf8')); } catch { return {}; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

export async function runRepoJobs({ log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a), dry = false } = {}) {
  if (!existsSync(join(REPO, '.git'))) return { skipped: 'brak klonu repo' };
  mkdirSync(join(WORK, 'jobs'), { recursive: true });
  if (existsSync(LOCK) && alive(+readFileSync(LOCK, 'utf8'))) return { skipped: 'trwa inne zlecenie' };
  writeFileSync(LOCK, String(process.pid));
  const git = (...a) => sh('git', ['-c', 'safe.directory=*', '-C', REPO, ...a], { env: { ...process.env, HOME: '/opt/data/home' }, maxBuffer: 20e6 });
  const done = [];
  try {
    await git('fetch', '-q', 'origin', 'main');
    const names = (await git('ls-tree', '--name-only', 'origin/main', `${JOBS_DIR}/`)).stdout.split('\n').map(x => x.trim()).filter(x => x.endsWith('.json')).sort();
    const reg = readReg();
    for (const [n, r] of Object.entries(reg)) if (r.status === 'running' && !alive(r.pid)) { reg[n] = { ...r, status: 'failed', result: 'przerwane (proces nie żyje)', finished_at: new Date().toISOString() }; }
    for (const path of names) {
      const name = path.split('/').pop().replace(/\.json$/, '');
      if (reg[name]) continue;
      let job = null; try { job = JSON.parse((await git('show', `origin/main:${path}`)).stdout); } catch (e) { job = { _err: e.message }; }
      const bad = job?._err ? `niepoprawny JSON: ${job._err.slice(0, 120)}` : validateJob(job);
      if (bad === 'wait') continue;
      if (bad) { reg[name] = { status: 'failed', result: bad, at: new Date().toISOString() }; log(`zlecenie ${name}: odrzucone — ${bad}`); writeFileSync(REG, JSON.stringify(reg, null, 1)); continue; }
      log(`zlecenie ${name}: ${job.script} ${job.args.join(' ').slice(0, 200)}${job.why ? ` — ${job.why.slice(0, 120)}` : ''}`);
      if (dry) { done.push({ name, dry: true }); continue; }
      const logF = join(WORK, 'jobs', `${name}.log`), fd = openSync(logF, 'a');
      const p = spawn('node', [join(dirname(new URL(import.meta.url).pathname), job.script), ...job.args], { cwd: BASE, stdio: ['ignore', fd, fd] });
      reg[name] = { status: 'running', pid: p.pid, script: job.script, args: job.args, why: job.why ?? null, by: job.by ?? null, started_at: new Date().toISOString(), log: logF };
      writeFileSync(REG, JSON.stringify(reg, null, 1));
      const code = await new Promise((res) => { const t = setTimeout(() => { try { p.kill('SIGTERM'); } catch {} }, (job.timeout_min ?? 180) * 60_000); p.on('close', (c) => { clearTimeout(t); res(c); }); });
      let tail = ''; try { tail = readFileSync(logF, 'utf8').trim().split('\n').slice(-3).join(' | ').slice(-400); } catch {}
      reg[name] = { ...reg[name], status: code === 0 ? 'done' : 'failed', code, result: tail, finished_at: new Date().toISOString() };
      writeFileSync(REG, JSON.stringify(reg, null, 1));
      log(`zlecenie ${name}: ${reg[name].status} (kod ${code})`);
      done.push({ name, status: reg[name].status });
      try { const { writeOpsStatus } = await import('./ops-status.mjs'); await writeOpsStatus({ trigger: `repo-job: ${name}`, log }); } catch { /* podgląd pomocniczy */ }
    }
    writeFileSync(REG, JSON.stringify(reg, null, 1));
  } catch (e) { log(`zlecenia z repo: ${String(e.message).slice(0, 200)}`); }
  finally { try { unlinkSync(LOCK); } catch {} }
  return { done };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--list')) { console.log(JSON.stringify(readReg(), null, 1)); process.exit(0); }
  console.log(JSON.stringify(await runRepoJobs({ dry: process.argv.includes('--dry-run') })));
}
