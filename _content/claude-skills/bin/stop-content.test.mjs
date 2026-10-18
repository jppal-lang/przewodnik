#!/usr/bin/env node
// Testy walidatora treści przystanku: node --test stop-content.test.mjs  (bez sieci, bez bazy)
// Wzorce: quolino-trip-writing/references/stop-content-examples (Frasassi 20–23, zaakceptowane przez JP 2026-10-18).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { validateStop, normalizeRecord, domainOf, sentences, stripRefs, refsIn } from './stop-content-lib.mjs';

const EX = join(dirname(fileURLToPath(import.meta.url)), '..', 'quolino-trip-writing', 'references', 'stop-content-examples');
const load = (f) => JSON.parse(readFileSync(join(EX, f), 'utf8'));
// kategorie: jaskinie liczone jako zabytek (najostrzejsze progi), oba kościoły jako church
const REFS = [['20-parking.json', 'parking'], ['21-grotte.json', 'monument'], ['22-san-vittore.json', 'church'], ['23-valadier.json', 'church']];
const clone = (o) => structuredClone(o);
const problems = (r) => r.errors.map(e => `[${e.block}] ${e.problem}`).join('\n');
const has = (r, block, re) => r.errors.some(e => e.block === block && re.test(e.problem));

for (const [f, category] of REFS) {
  test(`wzorzec ${f} (${category}) przechodzi walidator`, () => {
    const r = validateStop(load(f), { category });
    assert.equal(r.errors.length, 0, problems(r));
  });
  test(`wzorzec ${f} po normalizacji nadal przechodzi i ma accessed`, () => {
    const n = normalizeRecord(load(f), { category, today: '2026-10-18' });
    assert.equal(validateStop(n, { category }).errors.length, 0);
    assert.ok(n.sources.every(s => s.accessed));
  });
}

test('przypis bez źródła → błąd', () => {
  const r = load('22-san-vittore.json');
  r.sources = r.sources.filter(s => s.n !== 5);              // [5] użyte w opisie
  const v = validateStop(r, { category: 'church' });
  assert.ok(has(v, 'desc', /przypis \[5\] nie ma źródła/), problems(v));
});

test('źródło nieużyte → błąd', () => {
  const r = load('23-valadier.json');
  r.sources.push({ n: 99, url: 'https://example.org/x', title: 'X', lang: 'en', accessed: '2026-10-18' });
  assert.ok(has(validateStop(r, { category: 'church' }), 'sources', /\[99\] nie jest użyte/));
});

test('blok none bez checked → błąd', () => {
  const r = load('22-san-vittore.json');
  delete r.state.pop_culture.checked;
  assert.ok(has(validateStop(r, { category: 'church' }), 'pop_culture', /bez pola checked/));
});

test('blok found bez treści i none z treścią → błędy', () => {
  const r = load('22-san-vittore.json');
  r.state.legend = { state: 'found' };
  r.state.curiosity = { state: 'none', checked: 'x' };
  const v = validateStop(r, { category: 'church' });
  assert.ok(has(v, 'legend', /found, ale marked.legend jest puste/), problems(v));
  assert.ok(has(v, 'curiosity', /none, ale marked.curiosity ma treść/), problems(v));
});

test('czas dojazdu w opisie → błąd', () => {
  const r = load('23-valadier.json');
  r.marked.desc_paragraphs[3] += ' Od parkingu to dziesięć minut autem [8].';
  assert.ok(has(validateStop(r, { category: 'church' }), 'desc', /czas dojazdu/));
});

test('kilometry w bloku → błąd', () => {
  const r = load('21-grotte.json');
  r.marked.curiosity.text += ' Najbliższe miasto jest 12 km dalej [11][26].';
  assert.ok(has(validateStop(r, { category: 'monument' }), 'curiosity', /kilometry/));
});

test('„kilometr” (długość ścieżki) nie jest czasem dojazdu', () => {
  const v = validateStop(load('23-valadier.json'), { category: 'church' });   // „Ścieżka do świątyni ma niecały kilometr”
  assert.ok(!v.errors.some(e => /czas dojazdu/.test(e.problem)));
});

test('fun fact bez „Czy wiesz” → błąd', () => {
  const r = load('23-valadier.json');
  r.marked.fun_fact.text = 'Nazwa Frasassi wzięła się od łacińskiego „infra saxa”, czyli „wśród skał” [2].';
  assert.ok(has(validateStop(r, { category: 'church' }), 'fun_fact', /Czy wiesz/));
});

test('fun fact z dwóch zdań → błąd', () => {
  const r = load('23-valadier.json');
  r.marked.fun_fact.text = 'Czy wiesz, że nazwa Frasassi pochodzi od łaciny [2]? To znaczy „wśród skał” [2].';
  assert.ok(has(validateStop(r, { category: 'church' }), 'fun_fact', /jedno zdanie/));
});

test('fun fact z liczbą z jednego źródła → błąd', () => {
  const r = load('22-san-vittore.json');
  r.marked.fun_fact.text = 'Czy wiesz, że gad z muzeum miał około 3 metrów długości [12]?';
  assert.ok(has(validateStop(r, { category: 'church' }), 'fun_fact', /dwa niezależne źródła/));
});

test('ciekawostka z jednej domeny (it. i en. Wikipedia) → błąd', () => {
  const r = load('22-san-vittore.json');
  r.marked.curiosity.text = 'W 1976 roku znaleziono tu skamieniałego ichtiozaura [3]. Dopiero w 2017 roku opisano go jako nowy gatunek [12].';
  r.marked.fun_fact = null; r.state.fun_fact = { state: 'none', checked: 'test' };
  r.sources = r.sources.filter(s => [1, 2, 3, 5, 6, 7, 8, 11, 12, 14, 4].includes(s.n));
  const v = validateStop(r, { category: 'church' });
  assert.ok(has(v, 'curiosity', /dwa niezależne źródła.*wikipedia\.org/), problems(v));
});

test('tekst bloku powtórzony dosłownie w opisie → błąd', () => {
  const r = load('22-san-vittore.json');
  r.marked.desc_paragraphs[4] += ' ' + sentences(r.marked.curiosity.text)[1];   // „Szkielet wydobyto razem z płytą skalną…”
  assert.ok(has(validateStop(r, { category: 'church' }), 'curiosity', /powtórzone dosłownie z opisu|powtarza tekst opisu/));
});

test('akapit legendy w opisie → błąd', () => {
  const r = load('21-grotte.json');
  r.marked.desc_paragraphs.splice(4, 0, r.marked.legend.text.replace(/^Nad wąwozem/, 'Legenda mówi, że nad wąwozem'));
  const v = validateStop(r, { category: 'monument' });
  assert.ok(has(v, 'desc', /akapit legendy/), problems(v));
});

test('zdanie z datą bez przypisu → błąd', () => {
  const r = load('23-valadier.json');
  r.marked.desc_paragraphs[1] += ' Konsekrowano ją w 1830 roku.';
  assert.ok(has(validateStop(r, { category: 'church' }), 'desc', /bez przypisu/));
});

test('przystanek praktyczny z legendą → błąd', () => {
  const r = load('20-parking.json');
  r.marked.legend = { text: 'Legenda mówi, że parking zbudował smok [1].' };
  r.state.legend = { state: 'found' };
  assert.ok(has(validateStop(r, { category: 'parking' }), 'legend', /przystanek praktyczny/));
});

test('opis zabytku za krótki → błąd głębokości (descProblems)', () => {
  const r = load('22-san-vittore.json');
  r.marked.desc_paragraphs = r.marked.desc_paragraphs.slice(0, 2);
  const v = validateStop(r, { category: 'church' });
  assert.ok(has(v, 'desc', /minimum 4 akapity i 300 słów/), problems(v));
});

test('superlatyw w bloku z jednego źródła → błąd; w opisie → uwaga', () => {
  const r = load('23-valadier.json');
  r.marked.curiosity.text += ' To najstarsza świątynia w grocie w regionie [2].';
  const v = validateStop(r, { category: 'church' });
  assert.ok(has(v, 'curiosity', /superlatyw/), problems(v));
  const g = validateStop(load('21-grotte.json'), { category: 'monument' });   // „największego stalaktytu” [2] w opisie
  assert.ok(g.warnings.some(w => w.block === 'desc' && /superlatyw/.test(w.problem)));
});

test('pomocnicze: domeny, zdania, przypisy', () => {
  assert.equal(domainOf('https://it.wikipedia.org/wiki/X'), 'wikipedia.org');
  assert.equal(domainOf('https://www.cultura.gov.it/luogo'), 'cultura.gov.it');
  assert.notEqual(domainOf('https://cultura.gov.it/a'), domainOf('https://www.isprambiente.gov.it/b'));
  assert.equal(sentences('Budowa drogi S.S. 76 trwała długo [4]. Potem to odkryto [9].').length, 2);
  assert.deepEqual(refsIn('a [1][12] b [3]'), [1, 12, 3]);
  assert.equal(stripRefs('Tekst [1][2]. Dalej [3]'), 'Tekst. Dalej');
});
