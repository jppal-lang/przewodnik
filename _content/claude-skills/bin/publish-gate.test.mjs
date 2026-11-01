#!/usr/bin/env node
// Bramka publikacji (JP 2026-11-01): node --test publish-gate.test.mjs  (bez bazy, bez sieci)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import './review-where.mjs';
import './publish-gate.mjs';
const PG = globalThis.PublishGate, RW = globalThis.ReviewWhere;
const HERE = dirname(fileURLToPath(import.meta.url));
const NOW = Date.parse('2026-11-01T12:00:00Z');

const review = {
  errors: [{ problem: 'Godzina zamknięcia sprzeczna ze źródłem' }],
  warnings: [
    { problem: '[nie blokuje] Fakt bez źródła: wiek krzewu' },
    { problem: 'Fakty bez źródła (2) — potrzebny link: miasto różowe o zachodzie; Rzymianie nazywali je Hispellum' },
    { problem: '[nie blokuje] cena parkingu', resolved: { action: 'softened' } },
  ],
};
const ans = (field, status = 'sent', v = 3) => ({ city_version: v, field, status });
const allAnswers = (status) => ['review.e.0', 'review.w.0', 'review.w.1.0', 'review.w.1.1'].map(f => ans(f, status));

test('panel i testy mają ten sam kod (kopia 1:1)', () => {
  const panel = join(HERE, '..', '..', '..', '_admin', 'publish-gate.js');
  if (!existsSync(panel)) return;
  assert.equal(readFileSync(panel, 'utf8'), readFileSync(join(HERE, 'publish-gate.mjs'), 'utf8'));
});

test('flagi = te same identyfikatory co ReviewWhere (bez rozstrzygniętych automatycznie)', () => {
  const rw = RW.expand(review).filter(t => !(t.e && t.e.resolved)).map(RW.itemId);
  assert.deepEqual(PG.flags(review).map(f => f.id), rw);
  assert.deepEqual(rw, ['review.e.0', 'review.w.0', 'review.w.1.0', 'review.w.1.1']);
});

test('nierozstrzygnięte flagi blokują, z czytelnym powodem', () => {
  const g = PG.evaluate({ version: 3, review, comments: [ans('review.w.0')], now: NOW });
  assert.equal(g.ok, false);
  assert.equal(g.flagsOpen, 3);
  assert.match(g.reasons[0].t, /^3 nierozstrzygnięte flagi kontroli$/);
  assert.ok(g.reasons.some(r => r.k === 'errors' && /1 błąd blokujący/.test(r.t)));
});

test('odpowiedź do innej wersji nie rozstrzyga flagi', () => {
  const g = PG.evaluate({ version: 3, review, comments: allAnswers('sent').map(c => ({ ...c, city_version: 2 })), now: NOW });
  assert.equal(g.flagsOpen, 4);
});

test('wszystkie odpowiedzi zapisane, ale niewysłane → blokada „wyślij”', () => {
  const g = PG.evaluate({ version: 3, review, comments: allAnswers('new'), now: NOW });
  assert.equal(g.flagsOpen, 0);
  assert.equal(g.ok, false);
  assert.ok(g.reasons.some(r => r.k === 'unsent' && /4 niewysłane uwagi/.test(r.t)));
});

test('wysłane poprawki w toku → nadal zablokowane', () => {
  for (const status of ['new', 'working']) {
    const g = PG.evaluate({ version: 3, review: null, comments: [], request: { id: 9, status }, now: NOW });
    assert.equal(g.ok, false); assert.equal(g.requestBlocks, true);
    assert.match(g.reasons[0].t, /poprawka #9 w toku/);
  }
  assert.equal(PG.evaluate({ version: 3, review: null, comments: [], request: { id: 9, status: 'failed' }, now: NOW }).ok, false);
});

test('weryfikacja: częściowo / nowe błędy / ocena wstępna blokują; ready odblokowuje', () => {
  const base = { id: 9, status: 'done', result_version: 3, updated_at: '2026-11-01T11:00:00Z' };
  const g1 = PG.evaluate({ version: 3, review: null, comments: [], request: { ...base, verify: { applied: 3, total: 5, ready: false } }, now: NOW });
  assert.equal(g1.ok, false); assert.match(g1.reasons[0].t, /3 z 5 naniesionych/);
  const g2 = PG.evaluate({ version: 3, review: null, comments: [], request: { ...base, verify: { applied: 5, total: 5, new_errors: 2, ready: false } }, now: NOW });
  assert.match(g2.reasons[0].t, /2 nowe błędy/);
  const g3 = PG.evaluate({ version: 3, review: null, comments: [], request: { ...base, verify: { applied: 5, total: 5, pending_ai: true, ready: false } }, now: NOW });
  assert.match(g3.reasons[0].t, /ocena wstępna/);
  assert.equal(PG.evaluate({ version: 3, review: null, comments: [], request: { ...base, verify: { applied: 5, total: 5, ready: true } }, now: NOW }).ok, true);
});

test('prośba done bez weryfikacji: świeża czeka, stara nie blokuje', () => {
  const fresh = { id: 9, status: 'done', result_version: 3, updated_at: '2026-11-01T11:30:00Z' };
  assert.equal(PG.evaluate({ version: 3, review: null, comments: [], request: fresh, now: NOW }).ok, false);
  assert.equal(PG.evaluate({ version: 3, review: null, comments: [], request: { ...fresh, updated_at: '2026-10-20T10:00:00Z' }, now: NOW }).ok, true);
});

test('zielone: flagi rozstrzygnięte, wysłane, naniesione i zweryfikowane → odblokowane', () => {
  const g = PG.evaluate({ version: 3, review, comments: allAnswers('done'),
    request: { id: 9, status: 'done', result_version: 4, verify: { applied: 4, total: 4, ready: true } }, now: NOW });
  assert.deepEqual(g.reasons, []);
  assert.equal(g.ok, true);
});

test('błąd walidatora z odpowiedzią wysłaną, ale nierozpatrzoną blokuje; rozpatrzoną (rejected) — nie', () => {
  const sent = PG.evaluate({ version: 3, review: { errors: review.errors }, comments: [ans('review.e.0', 'sent')], now: NOW });
  assert.equal(sent.flagsOpen, 0); assert.equal(sent.errors, 1); assert.equal(sent.ok, false);
  const rej = PG.evaluate({ version: 3, review: { errors: review.errors }, comments: [ans('review.e.0', 'rejected')], now: NOW });
  assert.equal(rej.ok, true);
});

test('uwagi bez przystanku (needs_jp) blokują', () => {
  const g = PG.evaluate({ version: 3, review: null, comments: [{ city_version: 2, field: 'stop.name', status: 'needs_jp' }], now: NOW });
  assert.equal(g.ok, false); assert.equal(g.unplaced, 1);
});

test('stary szkic bez kontroli i bez uwag → nie blokuje', () => {
  assert.equal(PG.evaluate({ version: 1, review: null, comments: [] }).ok, true);
});

test('SQL bramki ma te same rodzaje powodów i bez obejścia „force”', () => {
  const sql = readFileSync(join(HERE, '..', 'sql', '2026-11-01-publikacja-bramka.sql'), 'utf8');
  for (const k of ['flags', 'errors', 'unsent', 'unplaced', 'request']) assert.match(sql, new RegExp(`'k', '${k}'`));
  assert.doesNotMatch(sql, /p_force|mimo to opublik/i);
  assert.match(sql, /RAISE EXCEPTION 'Publikacja zablokowana: %'/);
});
