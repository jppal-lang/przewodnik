#!/usr/bin/env node
// Przebieg „tylko misje” (gemini-draft.mjs --choices, JP 2026-10-31): asercja „zmienia tylko kids_choice”, cele, propozycje,
// bramka prośby o poprawkę z panelu. Bez AI, bez bazy (atrapa q), bez sieci: node --test choices-pass.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { choiceOnlyDiff, choiceTargets, pickChoices, openRevisionRequests, EXIT_LATER } from './kids-choice-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLD = JSON.parse(readFileSync(join(HERE, '..', 'test', 'golden', 'frasassi.trip.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const GOOD = { options: ['Lew', 'Orzeł', 'Wilk', 'Smok'], correct: 1 };
const sightKey = GOLD.meta.stops.find(s => !['parking', 'restaurant', 'icecream', 'sweets'].includes(s.category) && GOLD.content.stops[s.stop_key]?.kids_box).stop_key;
const parkKey = GOLD.meta.stops.find(s => s.category === 'parking').stop_key;

test('choiceOnlyDiff: dopisane / zmienione / usunięte kids_choice → brak różnic', () => {
  const a = clone(GOLD), b = clone(GOLD);
  b.content.stops[sightKey].kids_choice = GOOD;
  assert.deepEqual(choiceOnlyDiff(a, b), []);
  a.content.stops[sightKey].kids_choice = { ...GOOD, correct: 2 };
  assert.deepEqual(choiceOnlyDiff(a, b), []);
  delete b.content.stops[sightKey].kids_choice;
  assert.deepEqual(choiceOnlyDiff(a, b), []);
});

test('choiceOnlyDiff: każda inna zmiana jest wykryta (misja, wskazówka, akapit, meta, plan dnia, nowy klucz, typ, kolejność)', () => {
  const cases = [
    (t) => { t.content.stops[sightKey].kids_box += ' '; },
    (t) => { t.content.stops[sightKey].hint = 'inna'; },
    (t) => { t.content.stops[sightKey].desc_paragraphs[0] = t.content.stops[sightKey].desc_paragraphs[0].replace(/.$/, '!'); },
    (t) => { t.content.stops[sightKey].desc_paragraphs.reverse(); },
    (t) => { t.meta.stops[1].lat = t.meta.stops[1].lat + 1e-9; },
    (t) => { t.meta.stops[1].visit_duration = String(t.meta.stops[1].visit_duration); t.meta.stops[1].visit_duration = 7; },
    (t) => { t.content.day_plan[sightKey] = 'x'; },
    (t) => { t.content.stops[sightKey].extra = null; },
    (t) => { t.content.city.lead = null; },
    (t) => { t.meta.stops.pop(); },
    (t) => { t.content.kids_choice = GOOD; },                                // kids_choice poza przystankiem — to nie jest pole pytania
    (t) => { t.meta.stops[1].kids_choice = GOOD; },
  ];
  cases.forEach((f, i) => { const b = clone(GOLD); f(b); assert.ok(choiceOnlyDiff(GOLD, b).length > 0, `przypadek ${i}`); });
  const b = clone(GOLD); b.content.stops[sightKey].kids_box = 'X'; b.content.stops[sightKey].kids_choice = GOOD;
  assert.deepEqual(choiceOnlyDiff(GOLD, b), [`content.stops.${sightKey}.kids_box`]);
});

test('choiceOnlyDiff: kolejność kluczy obiektu nie ma znaczenia (jsonb), wejście nie jest zmieniane', () => {
  const a = clone(GOLD), b = clone(GOLD);
  b.content.stops[sightKey] = Object.fromEntries(Object.entries(b.content.stops[sightKey]).reverse());
  b.content.stops[sightKey].kids_choice = GOOD;
  const before = JSON.stringify(b);
  assert.deepEqual(choiceOnlyDiff(a, b), []);
  assert.equal(JSON.stringify(b), before);
});

test('choiceTargets: tylko przystanki zwiedzania z misją i bez poprawnego pytania', () => {
  const t = clone(GOLD);
  const all = choiceTargets(t.content, t.meta);
  assert.ok(all.includes(sightKey)); assert.ok(!all.includes(parkKey));
  t.content.stops[sightKey].kids_choice = GOOD;
  assert.ok(!choiceTargets(t.content, t.meta).includes(sightKey), 'ma już pytanie');
  t.content.stops[sightKey].kids_choice = { options: ['a'], correct: 0 };
  assert.ok(choiceTargets(t.content, t.meta).includes(sightKey), 'złe pytanie można zastąpić');
  t.content.stops[sightKey].kids_box = '';
  assert.ok(!choiceTargets(t.content, t.meta).includes(sightKey), 'bez misji');
});

test('pickChoices: poza celami, zły kształt i ponad limit odpadają; „skad” nie trafia do pola', () => {
  const out = pickChoices({ [sightKey]: { ...GOOD, correct: '1', skad: 'cytat' }, [parkKey]: GOOD, x: GOOD, y: null }, [sightKey, 'y']);
  assert.deepEqual(out, { [sightKey]: GOOD });
  assert.deepEqual(pickChoices({ [sightKey]: { options: ['a', 'a', 'b', 'c'], correct: 0 } }, [sightKey]), {});
  const many = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`s${i}`, GOOD]));
  assert.equal(Object.keys(pickChoices(many, Object.keys(many), { max: 12 })).length, 12);
});

test('bramka prośby o poprawkę: new/working dla tej trasy blokuje, inne statusy i trasy nie; brak tabeli = brak próśb', async () => {
  const rows = [{ id: 3, city_slug: 'spello', status: 'new', city_version: 77 }, { id: 4, city_slug: 'frasassi', status: 'done', city_version: 9 }, { id: 5, city_slug: 'urbino', status: 'working', city_version: 2 }];
  const q = (exists = true) => async (sql, p) => {
    if (/to_regclass/.test(sql)) return [{ t: exists }];
    assert.match(sql, /status IN \('new', 'working'\)/);
    return rows.filter(r => r.city_slug === p[0] && ['new', 'working'].includes(r.status));
  };
  assert.deepEqual((await openRevisionRequests(q(), 'spello')).map(r => r.id), [3]);
  assert.deepEqual(await openRevisionRequests(q(), 'frasassi'), []);
  rows[1].status = 'working';
  assert.deepEqual((await openRevisionRequests(q(), 'frasassi')).map(r => r.id), [4]);
  assert.deepEqual(await openRevisionRequests(q(false), 'spello'), []);
  assert.equal(EXIT_LATER, 75);
});

test('gemini-draft.mjs: tryb --choices odkłada przy limicie/prośbie (kod 75), nie przełącza na Claude, asercja przed zapisem, zapis raw', () => {
  const src = readFileSync(join(HERE, 'gemini-draft.mjs'), 'utf8');
  const body = src.slice(src.indexOf('async function choicesMain'), src.indexOf('try { await (CHOICES'));
  assert.ok(body.length > 1000);
  assert.doesNotMatch(body, /\bclaude\(|claudeJson\(|await gemini\(|geminiJson\(/, 'tylko Antigravity');
  assert.match(body, /agyQuotaOut\(\)\) throw later/);
  assert.match(body, /openRevisionRequests\(q, slug\)[\s\S]*throw later/);
  const iAssert = body.indexOf('choiceOnlyDiff(orig, next)'), iSave = body.indexOf('await saveDraft(');
  assert.ok(iAssert > 0 && iSave > iAssert, 'asercja przed zapisem');
  assert.match(body, /raw: true/);
  assert.match(body, /pytania z wyborem \(tylko misje\)/);
  assert.match(body, /'pytania z wyborem odpowiedzi \(zgoda JP 2026-10-31\)'/);
  assert.match(src, /process\.exitCode = EXIT_LATER/);
});
