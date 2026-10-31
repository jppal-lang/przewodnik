#!/usr/bin/env node
// Przebieg „tylko misje” (gemini-draft.mjs --choices, JP 2026-10-31): asercja „zmienia tylko kids_choice”, cele, propozycje,
// bramka prośby o poprawkę z panelu. Bez AI, bez bazy (atrapa q), bez sieci: node --test choices-pass.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { choiceOnlyDiff, choiceTargets, pickChoices, openRevisionRequests, EXIT_LATER, canonJson, sameJson, choicesLost, BASE_VERSION_SQL } from './kids-choice-lib.mjs';

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

// jsonb oddaje klucze obiektu posortowane (długość, potem bajty) — tak wróciło z bazy Spello v3k (2026-10-31)
const jsonbLike = (v) => Array.isArray(v) ? v.map(jsonbLike) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)).map(k => [k, jsonbLike(v[k])])) : v;

test('wpadka Spello v3k: pytanie zapisane {options, correct} wraca z bazy jako {correct, options} — to NIE jest utrata pytania', () => {
  const keep = { 'porta-consolare': GOOD, 'porta-venere-torri-di-properzio': { options: ['2', '3', '4', '5'], correct: 2 } };
  const saved = clone(GOLD);
  for (const [k, ch] of Object.entries(keep)) saved.content.stops[k] = { ...(saved.content.stops[sightKey]), kids_choice: ch };
  const fromDb = jsonbLike(saved);
  assert.equal(Object.keys(fromDb.content.stops['porta-consolare'].kids_choice).join(','), 'correct,options', 'atrapa jsonb przestawia klucze');
  assert.notEqual(JSON.stringify(fromDb.content.stops['porta-consolare'].kids_choice), JSON.stringify(GOOD), 'stare porównanie (JSON.stringify) widziało tu różnicę');
  assert.deepEqual(choicesLost(keep, fromDb.content.stops), []);
  assert.deepEqual(choiceOnlyDiff(saved, fromDb), []);
  // prawdziwa utrata: pytanie zniknęło, jest null, inna opcja, inny indeks, przystanek bez wiersza
  const bad = clone(fromDb.content.stops);
  delete bad['porta-consolare'].kids_choice;
  assert.deepEqual(choicesLost(keep, bad), ['porta-consolare']);
  bad['porta-consolare'].kids_choice = null;
  assert.deepEqual(choicesLost(keep, bad), ['porta-consolare']);
  bad['porta-consolare'].kids_choice = jsonbLike({ ...GOOD, options: [...GOOD.options.slice(0, 3), 'Byk'] });
  assert.deepEqual(choicesLost(keep, bad), ['porta-consolare']);
  bad['porta-consolare'].kids_choice = jsonbLike({ ...GOOD, correct: 0 });
  assert.deepEqual(choicesLost(keep, bad), ['porta-consolare']);
  assert.deepEqual(choicesLost(keep, {}), ['porta-consolare', 'porta-venere-torri-di-properzio']);
});

test('canonJson / sameJson: kolejność kluczy nieistotna, kolejność tablic istotna, typy istotne', () => {
  assert.equal(canonJson({ b: [1, { d: 1, c: 2 }], a: null }), '{"a":null,"b":[1,{"c":2,"d":1}]}');
  assert.ok(sameJson({ options: ['a'], correct: 1 }, { correct: 1, options: ['a'] }));
  assert.ok(!sameJson({ correct: 1 }, { correct: '1' }));
  assert.ok(!sameJson(['a', 'b'], ['b', 'a']));
  assert.ok(sameJson(undefined, null));
});

test('Frasassi bez szkicu: wersja wyjściowa = najnowsza opublikowana z plikami szkicu, szkic ma pierwszeństwo', () => {
  assert.match(BASE_VERSION_SQL, /status = 'draft' OR \(status = 'published' AND trip IS NOT NULL\)/);
  assert.match(BASE_VERSION_SQL, /ORDER BY \(status = 'draft'\) DESC, version DESC LIMIT 1/);
  assert.match(BASE_VERSION_SQL, /SELECT id, version, status, trip, content, review/);
  const src = readFileSync(join(HERE, 'gemini-draft.mjs'), 'utf8');
  const body = src.slice(src.indexOf('async function choicesMain'), src.indexOf('try { await (CHOICES'));
  assert.match(body, /await q\(BASE_VERSION_SQL, \[slug\]\)/);
  assert.match(body, /const fromPublished = cur\.status !== 'draft'/);
  assert.match(body, /if \(!fromPublished\) await q\(`UPDATE public\.city_versions SET status = 'draft' WHERE id = \$1`/, 'opublikowanej wersji wycofanie nie zmienia w szkic');
  assert.doesNotMatch(body, /status = 'published'/, 'przebieg niczego nie publikuje');
  assert.match(body, /choicesLost\(keep, row\?\.trip\?\.content\?\.stops\)/, 'porównanie po zapisie bez kolejności kluczy');
  assert.doesNotMatch(body, /JSON\.stringify\(row\?\.trip/, 'bez porównania JSON.stringify z wierszem z bazy');
  assert.match(body, /review_note = \$3/);
  assert.match(body, /`wycofane: po zapisie \$\{label\} różni się od/, 'notatka wersji archiwalnej mówi wprost „wycofane: …powód”');
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
