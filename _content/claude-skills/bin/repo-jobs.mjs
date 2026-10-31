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
// - ZGODA NA KOSZT PRZYCISKIEM (JP 2026-10-30, skrzynka decyzji w panelu): kosztowne zlecenie z "needs_jp": true (bez jp_ok)
//   nie jest odrzucane — trafia do ops.cost_requests jako pending (tytuł, opis, szacunek "est_usd", "est_limit", payload {script, args})
//   i czeka. JP klika „Zgoda” w panelu (#/decyzje) → przy najbliższym przebiegu wykonuje się DOKŁADNIE payload z bazy (to, co JP
//   widział), ponownie sprawdzony białą listą; „Odrzuć” → zlecenie rejected. jp_ok zostaje drogą awaryjną (bez bazy).
//   Przykład: {"script":"trip-translate.mjs","args":["rimini"],"needs_jp":true,"title":"Tłumaczenie Rimini (7 języków)",
//              "why":"…","est_usd":0.4,"est_limit":"—","by":"Claude"}
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
  'gemini-draft.mjs': (a) => a.includes('--recheck') || a.includes('--revise') || isChoicesArgs(a),   // nowa trasa idzie przez kolejkę ops.jobs, nie tędy
  'show-review.mjs': () => true,
  'usage-summary.mjs': () => true,
  // ponowienie tłumaczenia opublikowanej trasy (te same kontrole jakości co w kolejce; bez --dry/--job z zewnątrz)
  // kandydaci zdjęć do ikon miejsc (tylko odczyt Commons + plik JSON w repo): dokładnie jeden argument — slug trasy
  'place-candidates.mjs': (a) => a.length === 1 && /^[a-z0-9][a-z0-9-]{0,62}$/.test(a[0]),
  // strażnicy aktualności tras (JP 2026-10-30): jeden strażnik na żądanie, zawsze bez AI (0 kosztów); opcjonalnie --city <slug> i --dry
  'watch.mjs': (a) => a.includes('--no-ai') && /^(prices|closures|track|recheck|links|venues|season|site|costs|apply)$/.test(a[0] ?? '') &&
    a.slice(1).every((x, i, r) => x === '--no-ai' || x === '--dry' || x === '--city' || (r[i - 1] === '--city' && /^[a-z0-9][a-z0-9-]{0,62}$/.test(x))),
  'trip-translate.mjs': (a) => /^[a-z0-9-]+$/.test(a[0] ?? '') && a.slice(1).every((x, i, r) => x === '--fresh' || x === '--langs' || (r[i - 1] === '--langs' && /^[a-z]{2}(,[a-z]{2})*$/.test(x))),
};
// przebieg „tylko misje” (JP 2026-10-31): <slug> --choices [--max-usd ≤0.5]; nic poza tym (żadnych --facts/--patch)
export function isChoicesArgs(a) {
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(a[0] ?? '') || a[1] !== '--choices') return false;
  const r = a.slice(2);
  if (!r.length) return true;
  return r.length === 2 && r[0] === '--max-usd' && /^\d+(\.\d+)?$/.test(r[1]) && +r[1] > 0 && +r[1] <= 0.5;
}
// Kod wyjścia 75 („spróbuj później”, gemini-draft --choices: limit Antigravity, otwarta prośba o poprawkę) — zlecenie wraca do kolejki
// (status „later”, kolejna próba przy następnym przebiegu crona), najwyżej LATER_MAX razy, potem failed.
export const EXIT_LATER = 75, LATER_MAX = 72;
export function afterExit(prev, code, tail, now = new Date().toISOString()) {
  if (code === EXIT_LATER) {
    const tries = (prev?.tries ?? 0) + 1;
    if (tries < LATER_MAX) return { ...prev, status: 'later', code, tries, result: tail, finished_at: now };
    return { ...prev, status: 'failed', code, tries, result: `odkładane ${tries} razy — koniec prób: ${tail}`.slice(0, 600), finished_at: now };
  }
  return { ...prev, status: code === 0 ? 'done' : 'failed', code, result: tail, finished_at: now };
}
// Skrypty, które wydają pieniądze albo limit AI (OpenRouter, Claude, Gemini). JP 2026-10-30: „dbaj o moje środki”.
// Zlecenie takiego skryptu musi nieść zgodę JP: pole jp_ok = { date: 'RRRR-MM-DD', quote: 'dosłowne słowa JP z czatu' },
// nie starszą niż 3 dni. Bez tego serwer odrzuca zlecenie (status rejected), zanim cokolwiek wyda.
export const COSTLY = new Set(['gemini-draft.mjs', 'trip-translate.mjs']);
export function jpOkError(job, now = Date.now()) {
  const ok = job?.jp_ok;
  if (!ok || typeof ok !== 'object' || typeof ok.quote !== 'string' || ok.quote.trim().length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(ok.date ?? '')) return 'brak zgody JP (jp_ok {date, quote}) dla zlecenia, które kosztuje';
  const age = (now - Date.parse(ok.date + 'T00:00:00Z')) / 86_400_000;
  if (!(age >= -1 && age <= 3)) return 'zgoda JP starsza niż 3 dni';
  return null;
}
export function validateJob(job, { costApproved = false } = {}) {
  if (!job || typeof job !== 'object') return 'zlecenie nie jest obiektem JSON';
  if (COSTLY.has(job.script) && !costApproved) { const e = jpOkError(job); if (e) return e; }
  if (!Object.hasOwn(ALLOWED, job.script)) return `skrypt spoza białej listy: ${job.script}`;
  if (!Array.isArray(job.args) || job.args.some(x => typeof x !== 'string' || x.length > 20_000 || /[\0\n\r]/.test(x))) return 'args: lista napisów bez znaków nowej linii';
  if (job.args.some(x => /^--(notify-all|exec|eval)$/.test(x))) return 'niedozwolony argument';
  if (!ALLOWED[job.script](job.args)) return `${job.script}: niedozwolone argumenty`;
  if (job.not_before && Date.parse(job.not_before) > Date.now()) return 'wait';
  return null;
}
// Czy zlecenie ma czekać na zgodę w panelu (kosztowne, needs_jp: true, bez ważnego jp_ok).
export const needsPanelOk = (job) => !!job && typeof job === 'object' && COSTLY.has(job.script) && job.needs_jp === true && !!jpOkError(job);
const num = (x) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x < 1e5 ? Math.round(x * 100) / 100 : null);
const txt = (x, n) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, n) : null);
// Bramka kosztów: q(sql, params) → wiersze (ops.cost_requests). Zwraca { wait } | { reject } | { run, id, job } (job = payload z bazy).
export async function costGate(job, name, q) {
  const [row] = await q('SELECT id, status, payload FROM ops.cost_requests WHERE job_key = $1', [name]);
  if (!row) {
    const pre = validateJob(job, { costApproved: true });          // nie pytamy JP o zlecenie, które i tak by nie przeszło
    if (pre === 'wait') return { wait: 'not_before' };
    if (pre) return { reject: pre };
    const payload = { script: job.script, args: job.args };
    await q(`INSERT INTO ops.cost_requests (job_key, kind, title, detail, est_usd, est_limit, payload)
             VALUES ($1, 'repo-job', $2, $3, $4, $5, $6::jsonb) ON CONFLICT (job_key) DO NOTHING`,
      [name, txt(job.title, 200) ?? `${job.script} ${job.args.join(' ')}`.slice(0, 200), txt(job.why, 2000), num(job.est_usd), txt(job.est_limit, 200), JSON.stringify(payload)]);
    return { wait: 'created' };
  }
  if (row.status === 'pending') return { wait: 'pending' };
  if (row.status === 'rejected') return { reject: 'JP odrzucił w panelu (zgoda na koszt)' };
  if (row.status !== 'approved') return { reject: `zgoda już wykorzystana (${row.status})` };
  const p = row.payload ?? {};
  const run = { ...job, script: p.script, args: p.args };
  const bad = validateJob(run, { costApproved: true });
  if (bad && bad !== 'wait') return { reject: `zgoda w panelu, ale zlecenie nie przechodzi kontroli: ${bad}` };
  return { run: true, id: row.id, job: run };
}
const readReg = () => { try { return JSON.parse(readFileSync(REG, 'utf8')); } catch { return {}; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

// Połączenie z bazą tylko gdy potrzebne (zlecenie z needs_jp); test podaje własne q.
async function defaultQ() {
  const { db } = await import('./lib.mjs');
  const c = await db();
  return { q: async (sql, p) => (await c.query(sql, p)).rows, end: () => c.end().catch(() => {}) };
}
function spawnJob(job, logF) {
  const fd = openSync(logF, 'a');
  return spawn('node', [join(dirname(new URL(import.meta.url).pathname), job.script), ...job.args], { cwd: BASE, stdio: ['ignore', fd, fd] });
}

export async function runRepoJobs({ log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a), dry = false, q = null, spawnFn = spawnJob } = {}) {
  if (!existsSync(join(REPO, '.git'))) return { skipped: 'brak klonu repo' };
  mkdirSync(join(WORK, 'jobs'), { recursive: true });
  if (existsSync(LOCK) && alive(+readFileSync(LOCK, 'utf8'))) return { skipped: 'trwa inne zlecenie' };
  writeFileSync(LOCK, String(process.pid));
  const git = (...a) => sh('git', ['-c', 'safe.directory=*', '-C', REPO, ...a], { env: { ...process.env, HOME: '/opt/data/home' }, maxBuffer: 20e6 });
  const done = [];
  let conn = null;
  const dbq = async (sql, p) => {
    if (q) return q(sql, p);
    if (!conn) conn = await defaultQ();
    return conn.q(sql, p);
  };
  try {
    await git('fetch', '-q', 'origin', 'main');
    const names = (await git('ls-tree', '--name-only', 'origin/main', `${JOBS_DIR}/`)).stdout.split('\n').map(x => x.trim()).filter(x => x.endsWith('.json')).sort();
    const reg = readReg();
    for (const [n, r] of Object.entries(reg)) if (r.status === 'running' && !alive(r.pid)) { reg[n] = { ...r, status: 'failed', result: 'przerwane (proces nie żyje)', finished_at: new Date().toISOString() }; }
    for (const path of names) {
      const name = path.split('/').pop().replace(/\.json$/, '');
      if (reg[name] && reg[name].status !== 'later') continue;   // „later” = odłożone (kod 75), próbujemy ponownie
      let job = null; try { job = JSON.parse((await git('show', `origin/main:${path}`)).stdout); } catch (e) { job = { _err: e.message }; }
      let costId = null;
      if (!job?._err && needsPanelOk(job)) {
        let g;
        try { g = await costGate(job, name, dbq); } catch (e) { log(`zlecenie ${name}: zgoda na koszt — baza niedostępna (${String(e.message).slice(0, 120)}), czekam`); continue; }
        if (g.wait) { if (g.wait === 'created') log(`zlecenie ${name}: kosztuje — czeka na zgodę JP w panelu (Decyzje)`); continue; }
        if (g.reject) { reg[name] = { status: 'rejected', result: g.reject, at: new Date().toISOString() }; log(`zlecenie ${name}: ${g.reject}`); writeFileSync(REG, JSON.stringify(reg, null, 1)); continue; }
        job = g.job; costId = g.id;
      }
      const bad = job?._err ? `niepoprawny JSON: ${job._err.slice(0, 120)}` : validateJob(job, { costApproved: costId != null });
      if (bad === 'wait') continue;
      if (bad) { reg[name] = { status: 'failed', result: bad, at: new Date().toISOString() }; log(`zlecenie ${name}: odrzucone — ${bad}`); writeFileSync(REG, JSON.stringify(reg, null, 1)); continue; }
      log(`zlecenie ${name}: ${job.script} ${job.args.join(' ').slice(0, 200)}${job.why ? ` — ${job.why.slice(0, 120)}` : ''}`);
      if (dry) { done.push({ name, dry: true }); continue; }
      const logF = join(WORK, 'jobs', `${name}.log`);
      if (costId != null) await dbq("UPDATE ops.cost_requests SET status = 'running', result = 'w toku' WHERE id = $1", [costId]).catch(() => {});
      const p = spawnFn(job, logF);
      reg[name] = { ...(reg[name]?.status === 'later' ? { tries: reg[name].tries ?? 0 } : {}), status: 'running', pid: p.pid, script: job.script, args: job.args, why: job.why ?? null, by: job.by ?? null, started_at: new Date().toISOString(), log: logF, ...(costId != null ? { cost_request: costId } : {}) };
      writeFileSync(REG, JSON.stringify(reg, null, 1));
      const code = await new Promise((res) => { const t = setTimeout(() => { try { p.kill('SIGTERM'); } catch {} }, (job.timeout_min ?? 180) * 60_000); p.on('close', (c) => { clearTimeout(t); res(c); }); });
      let tail = ''; try { tail = readFileSync(logF, 'utf8').trim().split('\n').slice(-3).join(' | ').slice(-400); } catch {}
      reg[name] = afterExit(reg[name], code, tail);
      writeFileSync(REG, JSON.stringify(reg, null, 1));
      if (costId != null) await dbq('UPDATE ops.cost_requests SET status = $2, result = $3, finished_at = now() WHERE id = $1', [costId, reg[name].status === 'later' ? 'approved' : reg[name].status, `kod ${code}: ${tail}`.slice(0, 2000)])
        .catch((e) => log(`zlecenie ${name}: wynik do panelu nie zapisany (${String(e.message).slice(0, 120)})`));
      log(`zlecenie ${name}: ${reg[name].status} (kod ${code})`);
      done.push({ name, status: reg[name].status });
      try { const { writeOpsStatus } = await import('./ops-status.mjs'); await writeOpsStatus({ trigger: `repo-job: ${name}`, log }); } catch { /* podgląd pomocniczy */ }
    }
    writeFileSync(REG, JSON.stringify(reg, null, 1));
  } catch (e) { log(`zlecenia z repo: ${String(e.message).slice(0, 200)}`); }
  finally { try { unlinkSync(LOCK); } catch {} if (conn) await conn.end(); }
  return { done };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--list')) { console.log(JSON.stringify(readReg(), null, 1)); process.exit(0); }
  console.log(JSON.stringify(await runRepoJobs({ dry: process.argv.includes('--dry-run') })));
}
