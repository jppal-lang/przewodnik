// Akceptacja grafik w panelu — czyste funkcje (bez bazy, sieci i Discorda): node --test bin/art-review.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from './art-review-lib.mjs';

test('previewPath: katalog wg rodzaju, klucz bez ukośników, wersja i rozszerzenie', () => {
  assert.equal(A.previewPath('place_icon', 'spello/porta-venere', 2), 'media/icons/_review/spello-porta-venere-v2.webp');
  assert.equal(A.previewPath('quo_pose', 'pose-31', 1), 'media/icons/_review/pose-31-v1.webp');
  assert.equal(A.previewPath('game_art', 'quo-run', 3, '1.gif'), 'gra/art/_review/quo-run-v3.1.gif');
  assert.throws(() => A.previewPath('poster', 'x', 1), /nieznany rodzaj/);
  assert.throws(() => A.previewPath('place_icon', '../etc/passwd', 1), /zły klucz/);
  assert.throws(() => A.previewPath('place_icon', 'Spello Porta', 1), /zły klucz/);
});

test('actionFor: status → działanie skryptu', () => {
  assert.deepEqual(A.actionFor({ status: 'accepted', note: null }), { act: 'ok', notes: null });
  assert.deepEqual(A.actionFor({ status: 'fix', note: ' wieża wyższa, mniej drzew ' }), { act: 'fix', notes: 'wieża wyższa, mniej drzew' });
  assert.deepEqual(A.actionFor({ status: 'rejected', note: 'nie ten styl' }), { act: 'reject', notes: 'nie ten styl' });
  assert.deepEqual(A.actionFor({ status: 'rejected', note: null }), { act: 'reject', notes: null });
  assert.equal(A.actionFor({ status: 'fix', note: '' }).act, null);          // poprawka bez uwag — nic nie generujemy
  assert.equal(A.actionFor({ status: 'pending' }).act, null);
  assert.equal(A.actionFor({ status: 'superseded' }).act, null);
  assert.equal(A.actionFor({ status: 'accepted', handled_at: '2026-11-01T10:00:00Z' }).act, null);   // już wykonane
  assert.equal(A.actionFor(null).act, null);
  assert.equal(A.actionFor({ status: 'fix', note: 'x'.repeat(1000) }).notes.length, 800);
});

test('commonsThumb i inputsFromRefs: Commons → Special:FilePath, link JP → ten sam adres', () => {
  assert.equal(A.commonsThumb({ title: 'File:Porta Venere (Spello) 01.jpg' }), 'https://commons.wikimedia.org/wiki/Special:FilePath/Porta_Venere_(Spello)_01.jpg?width=640');
  assert.equal(A.commonsThumb({ title: 'https://example.org/foto.jpg', link: true, url: 'https://example.org/foto.jpg' }), 'https://example.org/foto.jpg');
  assert.equal(A.commonsThumb({ title: '' }), null);
  const inputs = A.inputsFromRefs([
    { title: 'File:A.jpg', page: 'https://commons.wikimedia.org/wiki/File:A.jpg', author: 'Jan Kowalski', license: 'CC BY-SA 4.0' },
    { title: 'https://x.org/b.png', url: 'https://x.org/b.png', page: 'https://x.org/b.png', link: true, host: 'x.org' }]);
  assert.equal(inputs.length, 2);
  assert.match(inputs[0].url, /Special:FilePath\/A\.jpg/);
  assert.equal(inputs[0].label, 'zdjęcie 1: Jan Kowalski, CC BY-SA 4.0');
  assert.equal(inputs[1].url, 'https://x.org/b.png');
  assert.equal(inputs[1].label, 'zdjęcie 2: link JP (x.org)');
  assert.deepEqual(A.inputsFromRepo(['media/icons/pose-05-curious-sitting-512.webp'], ['Quo (wzorzec)']), [{ url: 'media/icons/pose-05-curious-sitting-512.webp', label: 'Quo (wzorzec)' }]);
});

test('notifyLine: jedno zdanie z linkiem do panelu, bez instrukcji „odpisz ok”', () => {
  const s = A.notifyLine('Spello #7: Porta Venere', { v: 2, warn: 'tło się nie wycięło' });
  assert.match(s, /Nowa grafika do akceptacji: \*\*Spello #7: Porta Venere\*\* · wersja 2 → https:\/\/admin\.quolino\.com\/_admin\/#\/grafiki/);
  assert.match(s, /⚠️ tło się nie wycięło/);
  assert.doesNotMatch(s, /odpisz/i);
});

test('runDecisions: accepted → ok, fix → fix z uwagami, rejected → reject; wynik zapisany, błąd liczony do 3 prób', async () => {
  const marks = [], calls = [];
  const H = { ok: async (r) => { calls.push(['ok', r.key]); return 'opublikowana'; }, fix: async (r, n) => { calls.push(['fix', r.key, n]); return 'nowa wersja'; }, reject: async (r) => { calls.push(['reject', r.key]); return 'odrzucona'; } };
  const io = { markHandled: async (id, result, o) => { marks.push([id, result, o ?? null]); } };
  const rows = [
    { id: 1, key: 'spello/a', status: 'accepted', meta: {} },
    { id: 2, key: 'spello/b', status: 'fix', note: 'więcej światła', meta: {} },
    { id: 3, key: 'spello/c', status: 'rejected', meta: {} },
    { id: 4, key: 'spello/d', status: 'fix', note: '', meta: {} }];
  assert.equal(await runOk(rows, H, io), 3);
  assert.deepEqual(calls, [['ok', 'spello/a'], ['fix', 'spello/b', 'więcej światła'], ['reject', 'spello/c']]);
  assert.deepEqual(marks.map(m => [m[0], m[1]]), [[1, 'opublikowana'], [2, 'nowa wersja'], [3, 'odrzucona'], [4, 'poprawka bez uwag']]);
  // błąd: 1. i 2. próba nie zamykają wiersza (done: false), 3. zamyka i woła say()
  const said = [], marks2 = [];
  const io2 = { markHandled: async (id, result, o) => { marks2.push([result, o]); }, say: async (t) => said.push(t) };
  const bad = { ok: async () => { throw new Error('repo: konflikt'); } };
  await runOk([{ id: 9, key: 'x', title: 'X', status: 'accepted', meta: {} }], bad, io2);
  await runOk([{ id: 9, key: 'x', title: 'X', status: 'accepted', meta: { handle_tries: 1 } }], bad, io2);
  await runOk([{ id: 9, key: 'x', title: 'X', status: 'accepted', meta: { handle_tries: 2 } }], bad, io2);
  assert.deepEqual(marks2.map(m => [m[0], m[1].done, m[1].tries]), [['błąd: repo: konflikt', false, 1], ['błąd: repo: konflikt', false, 2], ['błąd: repo: konflikt', true, 3]]);
  assert.equal(said.length, 1);
  assert.match(said[0], /nie wykonała się po 3 próbach/);
  async function runOk(r, h, i) { return A.runDecisions(r, h, i); }
});

test('backlog: tylko wygenerowane, czekające na ocenę i jeszcze nie w panelu', () => {
  const st = { a: { status: 'review', v: 2 }, b: { status: 'review', v: 1, review_id: 31 }, c: { status: 'ok', v: 1 }, d: { status: 'review' }, e: { status: 'fix-pending', v: 3 }, f: { status: 'rejected', v: 1 }, g: null };
  assert.deepEqual(A.backlog(Object.entries(st)).map(([k]) => k), ['a']);
  assert.deepEqual(A.backlog(null), []);
  assert.match(A.migratedLine('ikon miejsc', 3), /^🖼️ 3 ikon miejsc .* https:\/\/admin\.quolino\.com\/_admin\/#\/grafiki/);
});
