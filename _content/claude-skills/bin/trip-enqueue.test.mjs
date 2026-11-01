// Testy nowej trasy do kolejki (JP 2026-11-01): slug z nazwy, argumenty, walidacja, kształt ops.jobs.request, idempotencja (atrapa bazy),
// biała lista repo-jobs.mjs i okno „Nowa trasa” w panelu (_admin/admin-newtrip.js — czyste funkcje w window.AdminNewTrip). Bez sieci i bazy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { slugify, parseArgs, validate, buildRequest, enqueue } from './trip-enqueue-lib.mjs';
import { isEnqueueArgs, ALLOWED, COSTLY, validateJob } from './repo-jobs.mjs';

test('slugify: polskie znaki i nazwy wielowyrazowe', () => {
  assert.equal(slugify('Asyż'), 'asyz');
  assert.equal(slugify('Rawenna'), 'rawenna');
  assert.equal(slugify('Città di Castello'), 'citta-di-castello');
  assert.equal(slugify('  Łódź  '), 'lodz');
  assert.equal(slugify('Spello'), 'spello');
  assert.equal(slugify('Frasassi (jaskinie)'), 'frasassi-jaskinie');
  assert.equal(slugify(''), '');
});

test('parseArgs: pełny zestaw i błędy', () => {
  const o = parseArgs(['asyz', '--name', 'Asyż', '--region', 'umbria', '--duration', 'full_day', '--brief', 'od zera', '--fresh']);
  assert.deepEqual(o, { slug: 'asyz', name: 'Asyż', region: 'umbria', country: 'it', duration: 'full_day', brief: 'od zera', fresh: true, dry: false });
  assert.throws(() => parseArgs(['asyz', '--name']), /brak wartości/);
  assert.throws(() => parseArgs(['asyz', '--exec', 'x']), /nieznana opcja/);
  assert.throws(() => parseArgs(['asyz', 'todi']), /nadmiarowy/);
});

test('validate: te same reguły co admin.admin_trip_enqueue', () => {
  const ok = { slug: 'asyz', name: 'Asyż', region: 'umbria', country: 'it', duration: 'full_day', brief: '' };
  assert.equal(validate(ok), null);
  assert.match(validate({ ...ok, slug: 'Asyż' }), /slug/);
  assert.match(validate({ ...ok, slug: 'a' }), /slug/);
  assert.match(validate({ ...ok, name: 'A' }), /nazwa/);
  assert.match(validate({ ...ok, name: 'Asyż "x"' }), /cudzysłow/);
  assert.match(validate({ ...ok, region: 'Umbria' }), /region/);
  assert.match(validate({ ...ok, country: 'ita' }), /kraj/);
  assert.match(validate({ ...ok, duration: 'weekend' }), /czas/);
  assert.match(validate({ ...ok, brief: 'x'.repeat(2001) }), /2000/);
});

test('buildRequest: dokładnie klucze gemini-queue.mjs', () => {
  assert.deepEqual(buildRequest({ slug: 'todi', name: ' Todi ', region: 'umbria', country: 'it', duration: 'half_day', brief: '  ', fresh: false }),
    { name: 'Todi', region: 'umbria', country: 'it', duration: 'half_day' });
  assert.deepEqual(buildRequest({ slug: 'asyz', name: 'Asyż', region: 'umbria', country: 'it', duration: 'full_day', brief: 'od zera', fresh: true }),
    { name: 'Asyż', region: 'umbria', country: 'it', duration: 'full_day', brief: 'od zera', fresh: true });
});

function fakeDb(regions = ['umbria', 'marche']) {
  const jobs = []; let id = 10;
  const q = async (sql, p) => {
    if (/FROM public\.regions/.test(sql)) return regions.includes(p[0]) ? [{ slug: p[0] }] : [];
    if (/FROM ops\.jobs WHERE city_slug/.test(sql)) return jobs.filter(j => j.city_slug === p[0] && ['queued', 'running'].includes(j.status)).slice(0, 1);
    if (/^INSERT INTO ops\.jobs/.test(sql)) { const j = { id: ++id, city_slug: p[0], kind: 'draft', worker: 'gemini', status: 'queued', request: p[1] }; jobs.push(j); return [{ id: j.id }]; }
    throw new Error('nieoczekiwane zapytanie: ' + sql);
  };
  return { jobs, q };
}

test('enqueue: wiersz jak z qdb job-add, bez duplikatu queued/running, po done znów można', async () => {
  const { jobs, q } = fakeDb();
  const o = { slug: 'asyz', name: 'Asyż', region: 'umbria', country: 'it', duration: 'full_day', brief: 'od zera', fresh: true };
  const r1 = await enqueue(o, q);
  assert.equal(r1.created, true); assert.equal(r1.id, 11);
  assert.deepEqual(jobs[0], { id: 11, city_slug: 'asyz', kind: 'draft', worker: 'gemini', status: 'queued', request: '{"name":"Asyż","region":"umbria","country":"it","duration":"full_day","brief":"od zera","fresh":true}' });
  const r2 = await enqueue(o, q);
  assert.deepEqual([r2.created, r2.id, jobs.length], [false, 11, 1]);
  jobs[0].status = 'running';
  assert.equal((await enqueue(o, q)).created, false);
  jobs[0].status = 'done';
  assert.equal((await enqueue(o, q)).created, true); assert.equal(jobs.length, 2);
  await assert.rejects(enqueue({ ...o, slug: 'gubbio', region: 'toskania' }, q), /nieznany region/);
  await assert.rejects(enqueue({ ...o, slug: 'Gubbio' }, q), /slug/);
  const dry = await enqueue({ ...o, slug: 'todi', dry: true }, q);
  assert.equal(dry.dry, true); assert.equal(jobs.length, 2);
});

test('repo-jobs: trip-enqueue.mjs na białej liście jako kosztowny, argumenty pilnowane', () => {
  assert.ok(COSTLY.has('trip-enqueue.mjs'));
  assert.equal(typeof ALLOWED['trip-enqueue.mjs'], 'function');
  const good = ['asyz', '--name', 'Asyż', '--region', 'umbria', '--country', 'it', '--duration', 'full_day', '--fresh', '--brief', 'trasa od zera'];
  assert.equal(isEnqueueArgs(good), true);
  assert.equal(isEnqueueArgs(['asyz', '--name', 'Asyż', '--region', 'umbria']), true);
  assert.equal(isEnqueueArgs(['asyz', '--name', 'Asyż']), false);                              // bez regionu
  assert.equal(isEnqueueArgs(['Asyż', '--name', 'Asyż', '--region', 'umbria']), false);         // zły slug
  assert.equal(isEnqueueArgs(['asyz', '--name', 'Asyż', '--region', 'umbria', '--exec', 'x']), false);
  assert.equal(isEnqueueArgs(['asyz', '--name', 'Asyż', '--region', 'umbria', '--duration', 'weekend']), false);
  assert.equal(isEnqueueArgs(['asyz', '--name', 'Asyż', '--region', 'umbria', '--fresh', '--fresh']), false);
  assert.equal(isEnqueueArgs(['asyz', '--name', 'Asyż', '--region', 'umbria', '--brief']), false);
  const today = new Date().toISOString().slice(0, 10);
  assert.match(validateJob({ script: 'trip-enqueue.mjs', args: good }), /brak zgody JP/);
  assert.equal(validateJob({ script: 'trip-enqueue.mjs', args: good, jp_ok: { date: today, quote: 'Asyż' } }), null);
});

test('zlecenie Asyżu w _content/jobs przechodzi białą listę', () => {
  const job = JSON.parse(readFileSync(new URL('../../jobs/2026-11-01-asyz-nowa-trasa.json', import.meta.url), 'utf8'));
  assert.equal(job.script, 'trip-enqueue.mjs');
  assert.equal(validateJob(job, { costApproved: true }), null);   // jp_ok traci ważność po 3 dniach — tu liczy się biała lista i argumenty
  assert.deepEqual(Object.keys(job.jp_ok).sort(), ['date', 'quote']);
  const o = parseArgs(job.args);
  assert.equal(validate(o), null);
  assert.deepEqual([o.slug, o.region, o.fresh, o.duration], ['asyz', 'umbria', true, 'full_day']);
});

// panel: _admin/admin-newtrip.js uruchomiony w atrapie okna — tylko czyste funkcje (slug, walidacja, szacunek)
test('panel: AdminNewTrip.slugify / validate / estimate', () => {
  const src = readFileSync(new URL('../../../_admin/admin-newtrip.js', import.meta.url), 'utf8');
  const doc = { addEventListener() {}, getElementById: () => null, querySelector: () => null, createElement: () => ({ setAttribute() {}, appendChild() {} }), body: { appendChild() {} } };
  const win = { document: doc, location: { search: '', hash: '' }, addEventListener() {}, AdminHost: null };
  win.window = win;
  vm.runInNewContext(src, win);
  const N = win.AdminNewTrip;
  assert.ok(N, 'window.AdminNewTrip');
  assert.equal(N.slugify('Asyż'), 'asyz');
  assert.equal(N.slugify('Rawenna'), 'rawenna');
  assert.equal(N.slugify('Città di Castello'), 'citta-di-castello');
  assert.equal(N.validate({ slug: 'asyz', name: 'Asyż', country: 'it', region: 'umbria', duration: 'full_day', brief: '' }, [{ slug: 'umbria', country: 'it' }]), null);
  assert.match(N.validate({ slug: 'asyż', name: 'Asyż', country: 'it', region: 'umbria', duration: 'full_day', brief: '' }, [{ slug: 'umbria', country: 'it' }]), /slug/i);
  assert.match(N.validate({ slug: 'asyz', name: 'Asyż', country: 'it', region: 'marche', duration: 'full_day', brief: '' }, [{ slug: 'umbria', country: 'it' }]), /region/i);
  assert.match(N.validate({ slug: 'asyz', name: 'Asyż', country: 'it', region: 'umbria', duration: 'weekend', brief: '' }, [{ slug: 'umbria', country: 'it' }]), /czas/i);
  assert.match(N.validate({ slug: 'asyz', name: 'A', country: 'it', region: 'umbria', duration: 'full_day', brief: '' }, [{ slug: 'umbria', country: 'it' }]), /nazw/i);
  assert.match(N.estimate(null), /20–40 wywołań Antigravity/);
  assert.match(N.estimate({ agyWeekCalls: 90 }), /90 z 150/);
});
