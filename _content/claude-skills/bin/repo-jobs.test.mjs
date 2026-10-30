// Testy zleceń z repo: zgoda na koszt przyciskiem w panelu (needs_jp → ops.cost_requests pending → approved → wykonanie).
// Bez sieci i bez bazy: baza to atrapa q() w pamięci, repo to lokalny git (origin = katalog bare), proces to atrapa spawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';

const tmp = mkdtempSync(join(tmpdir(), 'repo-jobs-'));
const origin = join(tmp, 'origin.git'), clone = join(tmp, 'clone'), work = join(tmp, 'work'), base = join(tmp, 'base');
const git = (cwd, ...a) => execFileSync('git', ['-c', 'safe.directory=*', '-C', cwd, ...a], { stdio: 'pipe' }).toString();
execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
execFileSync('git', ['init', '-q', '-b', 'main', work]);
git(work, 'config', 'user.email', 't@t'); git(work, 'config', 'user.name', 't');
mkdirSync(join(work, '_content/jobs'), { recursive: true });
const addJob = (name, job) => {
  writeFileSync(join(work, '_content/jobs', name + '.json'), JSON.stringify(job));
  git(work, 'add', '-A'); git(work, 'commit', '-qm', name); git(work, 'push', '-q', origin, 'main');
};
addJob('start', { script: 'show-review.mjs', args: ['spello'] });
execFileSync('git', ['clone', '-q', origin, clone]);
process.env.QUOLINO_REPO = clone;
process.env.QUOLINO_BASE = base;
const RJ = await import('./repo-jobs.mjs');

// atrapa ops.cost_requests
function fakeDb() {
  const rows = []; let id = 0;
  const q = async (sql, p) => {
    if (/^SELECT id, status, payload FROM ops\.cost_requests WHERE job_key/.test(sql)) return rows.filter(r => r.job_key === p[0]).map(r => ({ ...r }));
    if (/^INSERT INTO ops\.cost_requests/.test(sql)) {
      if (!rows.some(r => r.job_key === p[0])) rows.push({ id: ++id, job_key: p[0], title: p[1], detail: p[2], est_usd: p[3], est_limit: p[4], payload: JSON.parse(p[5]), status: 'pending' });
      return [];
    }
    if (/^UPDATE ops\.cost_requests SET status = 'running'/.test(sql)) { rows.find(r => r.id === p[0]).status = 'running'; return []; }
    if (/^UPDATE ops\.cost_requests SET status = \$2/.test(sql)) { Object.assign(rows.find(r => r.id === p[0]), { status: p[1], result: p[2] }); return []; }
    throw new Error('nieoczekiwane zapytanie: ' + sql);
  };
  return { rows, q };
}
function fakeSpawn(calls, code = 0) {
  return (job, logF) => {
    calls.push({ script: job.script, args: job.args });
    writeFileSync(logF, `uruchomiono ${job.script}\n`, { flag: 'a' });
    const p = new EventEmitter(); p.pid = 999999; setTimeout(() => p.emit('close', code), 5); return p;
  };
}
const quiet = () => {};

test('needsPanelOk: tylko kosztowne, z needs_jp i bez ważnego jp_ok', () => {
  assert.equal(RJ.needsPanelOk({ script: 'trip-translate.mjs', args: ['rimini'], needs_jp: true }), true);
  assert.equal(RJ.needsPanelOk({ script: 'trip-translate.mjs', args: ['rimini'] }), false);
  assert.equal(RJ.needsPanelOk({ script: 'show-review.mjs', args: [], needs_jp: true }), false);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(RJ.needsPanelOk({ script: 'trip-translate.mjs', args: ['rimini'], needs_jp: true, jp_ok: { date: today, quote: 'ok' } }), false);
});

test('validateJob: kosztowne bez zgody odrzucone, z costApproved przechodzi', () => {
  const j = { script: 'trip-translate.mjs', args: ['rimini'] };
  assert.match(RJ.validateJob(j), /brak zgody JP/);
  assert.equal(RJ.validateJob(j, { costApproved: true }), null);
  assert.match(RJ.validateJob({ script: 'rm.mjs', args: [] }, { costApproved: true }), /białej listy/);
});

test('costGate: needs_jp → pending (raz), approved → payload z bazy, rejected → odmowa', async () => {
  const { rows, q } = fakeDb();
  const job = { script: 'trip-translate.mjs', args: ['rimini'], needs_jp: true, title: 'Tłumaczenie Rimini', why: 'po poprawkach', est_usd: 0.4, est_limit: '—' };
  assert.deepEqual(await RJ.costGate(job, 'j1', q), { wait: 'created' });
  assert.deepEqual(await RJ.costGate(job, 'j1', q), { wait: 'pending' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'pending'); assert.equal(rows[0].est_usd, 0.4); assert.deepEqual(rows[0].payload, { script: 'trip-translate.mjs', args: ['rimini'] });
  rows[0].status = 'approved';
  const changed = { ...job, args: ['urbino', '--fresh'] };                 // plik zmieniony po zgodzie — liczy się to, co JP widział
  const g = await RJ.costGate(changed, 'j1', q);
  assert.equal(g.run, true); assert.equal(g.id, 1); assert.deepEqual(g.job.args, ['rimini']);
  rows[0].status = 'rejected';
  assert.match((await RJ.costGate(job, 'j1', q)).reject, /odrzucił/);
  rows[0].status = 'done';
  assert.match((await RJ.costGate(job, 'j1', q)).reject, /wykorzystana/);
  // zlecenie, które i tak nie przejdzie kontroli, nie trafia do JP
  assert.match((await RJ.costGate({ script: 'trip-translate.mjs', args: ['Rimini; rm'], needs_jp: true }, 'j2', q)).reject, /niedozwolone/);
  assert.equal(rows.length, 1);
});

test('runRepoJobs: needs_jp czeka na zgodę, po „Zgoda” wykonuje się raz; bez needs_jp i jp_ok — odrzucone jak dotąd', async () => {
  const { rows, q } = fakeDb(), calls = [];
  addJob('2026-10-30-rimini-zgoda', { script: 'trip-translate.mjs', args: ['rimini'], needs_jp: true, title: 'Tłumaczenie Rimini', est_usd: 0.3 });
  addJob('2026-10-30-bez-zgody', { script: 'trip-translate.mjs', args: ['urbino'] });
  await RJ.runRepoJobs({ q, spawnFn: fakeSpawn(calls), log: quiet });
  assert.equal(rows.length, 1); assert.equal(rows[0].status, 'pending');
  const runs = calls.filter(c => c.script === 'trip-translate.mjs');
  assert.equal(runs.length, 0, 'kosztowne nie ruszyło bez zgody');
  let reg = JSON.parse(readFileSync(join(base, 'work/repo-jobs.json'), 'utf8'));
  assert.equal(reg['2026-10-30-rimini-zgoda'], undefined, 'czekające nie trafia do rejestru');
  assert.equal(reg['2026-10-30-bez-zgody'].status, 'failed');

  await RJ.runRepoJobs({ q, spawnFn: fakeSpawn(calls), log: quiet });   // nadal pending — nic
  assert.equal(calls.filter(c => c.script === 'trip-translate.mjs').length, 0);

  rows[0].status = 'approved';                                          // JP kliknął „Zgoda”
  await RJ.runRepoJobs({ q, spawnFn: fakeSpawn(calls), log: quiet });
  assert.deepEqual(calls.filter(c => c.script === 'trip-translate.mjs'), [{ script: 'trip-translate.mjs', args: ['rimini'] }]);
  assert.equal(rows[0].status, 'done'); assert.match(rows[0].result, /^kod 0/);
  reg = JSON.parse(readFileSync(join(base, 'work/repo-jobs.json'), 'utf8'));
  assert.equal(reg['2026-10-30-rimini-zgoda'].status, 'done'); assert.equal(reg['2026-10-30-rimini-zgoda'].cost_request, 1);

  await RJ.runRepoJobs({ q, spawnFn: fakeSpawn(calls), log: quiet });   // drugi raz się nie wykonuje
  assert.equal(calls.filter(c => c.script === 'trip-translate.mjs').length, 1);
});

test('runRepoJobs: odrzucone w panelu → rejected, bez uruchomienia; baza niedostępna → czeka', async () => {
  const { rows, q } = fakeDb(), calls = [];
  addJob('2026-10-30-odrzucone', { script: 'trip-translate.mjs', args: ['spello'], needs_jp: true });
  await RJ.runRepoJobs({ q: async () => { throw new Error('brak tabeli'); }, spawnFn: fakeSpawn(calls), log: quiet });
  let reg = JSON.parse(readFileSync(join(base, 'work/repo-jobs.json'), 'utf8'));
  assert.equal(reg['2026-10-30-odrzucone'], undefined);
  await RJ.runRepoJobs({ q, spawnFn: fakeSpawn(calls), log: quiet });
  rows.find(r => r.job_key === '2026-10-30-odrzucone').status = 'rejected';
  await RJ.runRepoJobs({ q, spawnFn: fakeSpawn(calls), log: quiet });
  reg = JSON.parse(readFileSync(join(base, 'work/repo-jobs.json'), 'utf8'));
  assert.equal(reg['2026-10-30-odrzucone'].status, 'rejected');
  assert.equal(calls.filter(c => c.args[0] === 'spello').length, 0);
});
