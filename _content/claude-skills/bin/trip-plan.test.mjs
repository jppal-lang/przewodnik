#!/usr/bin/env node
// Plan tras i wybór następnego miasta (JP 2026-11-01): node --test trip-plan.test.mjs  (bez bazy)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { PLAN, REGIONS, rows, pickNext } from './trip-plan.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));

// stan na 2026-11-01: Spello i Frasassi w nowym procesie, Asyż zlecony dziś (queued)
const ST = { spello: { doneV2: true, hasOld: true }, frasassi: { doneV2: true, hasOld: true }, asyz: { job: 'queued', hasOld: true },
  perugia: { hasOld: true }, urbino: { hasOld: true }, ancona: { hasOld: true }, rimini: { hasOld: true }, rawenna: { hasOld: true } };

test('kolejność redakcyjna i regiony zgodne z decyzją JP', () => {
  assert.deepEqual(REGIONS, ['umbria', 'marche', 'emilia-romagna']);
  assert.deepEqual(PLAN.umbria.map(x => x[0]), ['asyz', 'perugia', 'orvieto', 'spello', 'gubbio', 'spoleto', 'todi', 'norcia', 'narni', 'castiglione-del-lago']);
  assert.deepEqual(PLAN.marche.map(x => x[0]), ['urbino', 'ancona', 'frasassi', 'loreto', 'ascoli-piceno', 'recanati', 'fermo', 'pesaro', 'macerata', 'san-leo']);
  assert.deepEqual(PLAN['emilia-romagna'].map(x => x[0]), ['bolonia', 'rimini', 'rawenna', 'ferrara', 'modena', 'parma']);
});

test('po Umbrii: Asyż w kolejce pominięty (bez dublowania) → Perugia, stara trasa od zera', () => {
  assert.deepEqual(pickNext('umbria', ST), { slug: 'perugia', name: 'Perugia', region: 'umbria', country: 'it', duration: 'full_day', fresh: true });
});

test('pomija opublikowane w nowym procesie, szkic w toku i każde zadanie (także failed / done)', () => {
  const st = { ...ST, perugia: { hasDraft: true }, orvieto: { job: 'failed' }, gubbio: { job: 'done' } };
  assert.equal(pickNext('umbria', st).slug, 'spoleto');
  assert.equal(pickNext('umbria', st).fresh, false);
});

test('publikacja starej trasy nie zleca jej samej (skip)', () => {
  assert.equal(pickNext('umbria', ST, { skip: 'perugia' }).slug, 'orvieto');
});

test('po Marche: Frasassi pominięte, Urbino pierwsze', () => {
  assert.equal(pickNext('marche', ST).slug, 'urbino');
  assert.equal(pickNext('marche', { ...ST, urbino: { doneV2: true }, ancona: { job: 'queued' } }).slug, 'loreto');
});

test('wyczerpany region → następny w kolejności, potem wcześniejsze', () => {
  const full = Object.fromEntries(PLAN.umbria.map(x => [x[0], { doneV2: true }]));
  assert.equal(pickNext('umbria', full).region, 'marche');
  const er = Object.fromEntries(PLAN['emilia-romagna'].map(x => [x[0], { doneV2: true }]));
  assert.equal(pickNext('emilia-romagna', { ...ST, ...er }).slug, 'perugia');   // po ER wracamy do Umbrii
  const all = Object.fromEntries(rows().map(x => [x.slug, { doneV2: true }]));
  assert.equal(pickNext('marche', all), null);
});

test('region spoza public.regions pomijany; nieznany region publikacji → od początku planu', () => {
  const full = Object.fromEntries([...PLAN.umbria, ...PLAN.marche].map(x => [x[0], { doneV2: true }]));
  assert.equal(pickNext('marche', full, { regionsOk: ['umbria', 'marche'] }), null);
  assert.equal(pickNext('toskania', ST).slug, 'perugia');
  assert.equal(pickNext('UMBRIA', ST).slug, 'perugia');
});

test('lista w SQL = lista w trip-plan.mjs (kolejność, nazwy, czas)', () => {
  const sql = readFileSync(join(HERE, '..', 'sql', '2026-11-01-publikacja-bramka.sql'), 'utf8');
  const blk = sql.slice(sql.indexOf('INSERT INTO ops.trip_plan (region, rank, slug, name, duration, note) VALUES'));
  const got = [...blk.slice(0, blk.indexOf('ON CONFLICT')).matchAll(/\('([a-z-]+)',\s*(\d+),\s*'([a-z-]+)',\s*'([^']+)',\s*'(half_day|full_day)'/g)]
    .map(m => ({ region: m[1], rank: +m[2], slug: m[3], name: m[4], duration: m[5] }));
  assert.deepEqual(got, rows().map(({ region, rank, slug, name, duration }) => ({ region, rank, slug, name, duration })));
  assert.match(sql, /\('umbria', 1\), \('marche', 2\), \('emilia-romagna', 3\)/);
});
