#!/usr/bin/env node
// Pytanie z wyborem w misji (JP 2026-10-31): node --test kids-choice.test.mjs  (bez AI, bez bazy, bez sieci)
// Reguły w trzech miejscach muszą się zgadzać: bin/kids-choice-lib.mjs, scripts/validate_trip.py (choice_problems),
// strona kid-choice.js (QChoice.valid). Do tego: walidator na złotym wzorcu Frasassi z dobrym i złym pytaniem,
// check_translation.py (numer poprawnej bez zmian), source-check (odpowiedź sprzeczna → znika samo pytanie, misja zostaje).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import vm from 'node:vm';
import { choiceProblems, choiceOk, cleanChoices, choiceFact, CHOICE_RULE, CHOICE_MAX } from './kids-choice-lib.mjs';
import { sourceCheck } from './source-check.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const REPO = join(ROOT, '..', '..');
const VALIDATOR = join(ROOT, 'quolino-trip-writing', 'scripts', 'validate_trip.py');
const CHECK_TR = join(ROOT, 'quolino-trip-translate', 'scripts', 'check_translation.py');
const GOOD = { options: ['Oliwka', 'Figowiec', 'Kaktus', 'Palma'], correct: 1 };
const BAD = [
  [{ options: ['a', 'b', 'c'], correct: 0 }, /4 opcje/],
  [{ options: ['a', 'b', 'c', 'd', 'e'], correct: 0 }, /4 opcje/],
  [{ options: ['a', 'b', 'c', 'd'], correct: 4 }, /correct/],
  [{ options: ['a', 'b', 'c', 'd'], correct: -1 }, /correct/],
  [{ options: ['a', 'b', 'c', 'd'], correct: '1' }, /correct/],
  [{ options: ['a', 'b', 'c', 'd'], correct: 1.5 }, /correct/],
  [{ options: ['a', 'b', 'c', 'd'] }, /correct/],
  [{ options: ['a', '', 'c', 'd'], correct: 0 }, /pusta/],
  [{ options: ['a', '   ', 'c', 'd'], correct: 0 }, /pusta/],
  [{ options: ['a', 'b', 'c', 4], correct: 0 }, /nie jest tekstem/],
  [{ options: ['Lew', 'lew ', 'Wilk', 'Smok'], correct: 0 }, /powtarzają/],
  [{ options: ['Lew — król', 'Orzeł', 'Wilk', 'Smok'], correct: 0 }, /pauzę/],
  [{ options: ['Lew', 'Orzeł – ptak', 'Wilk', 'Smok'], correct: 0 }, /pauzę/],
  [{ options: ['x'.repeat(CHOICE_MAX + 1), 'b', 'c', 'd'], correct: 0 }, /znaków/],
  [['a', 'b', 'c', 'd'], /obiektem/],
  ['Lew', /obiektem/],
];

// ── biblioteka ─────────────────────────────────────────────────────────────────────────────────
test('lib: dobre pytanie bez problemów, null = brak pytania (wsteczna zgodność)', () => {
  assert.deepEqual(choiceProblems(GOOD), []);
  assert.ok(choiceOk(GOOD));
  assert.deepEqual(choiceProblems(null), []);
  assert.deepEqual(choiceProblems(undefined), []);
  assert.equal(choiceOk(null), false);
  assert.deepEqual(choiceProblems({ options: ['x'.repeat(CHOICE_MAX), 'b', 'c', 'd'], correct: 3 }), [], 'dokładnie limit znaków przechodzi');
});
test('lib: złe pytania — każdy przypadek ma swój komunikat', () => {
  for (const [ch, re] of BAD) {
    const p = choiceProblems(ch);
    assert.ok(p.length, JSON.stringify(ch));
    assert.match(p.join(' | '), re, JSON.stringify(ch));
  }
});
test('lib: cleanChoices — złe i bez misji → null, dobre przycięte, praktyczny przystanek bez pytania', () => {
  const content = { stops: {
    a: { kids_box: 'Znajdź krzew', kids_choice: { options: [' Oliwka ', 'Figowiec', 'Kaktus', 'Palma  z  liśćmi'], correct: '1' } },
    b: { kids_box: 'Policz łuki', kids_choice: { options: ['1', '2', '3'], correct: 0 } },
    c: { kids_box: null, kids_choice: GOOD },
    d: { kids_box: 'Zgadnij', kids_choice: GOOD },
    e: { kids_box: 'Bez pytania' },
  } };
  const removed = cleanChoices(content, { stops: [{ stop_key: 'd', category: 'parking' }] });
  assert.deepEqual(content.stops.a.kids_choice, { options: ['Oliwka', 'Figowiec', 'Kaktus', 'Palma z liśćmi'], correct: 1 });
  assert.equal(content.stops.b.kids_choice, null);
  assert.equal(content.stops.c.kids_choice, null);
  assert.equal(content.stops.d.kids_choice, null);
  assert.ok(!('kids_choice' in content.stops.e), 'brak pola zostaje brakiem pola');
  assert.deepEqual(removed.map(r => r.stop_key).sort(), ['b', 'c', 'd']);
  assert.equal(content.stops.b.kids_box, 'Policz łuki', 'misja zostaje');
});
test('lib: choiceFact i reguła do promptu', () => {
  assert.deepEqual(choiceFact({ kids_box: 'Co rośnie na bramie?', kids_choice: GOOD }), { answer: 'Figowiec', wrong: ['Oliwka', 'Kaktus', 'Palma'], question: 'Co rośnie na bramie?' });
  assert.equal(choiceFact({ kids_box: 'x', kids_choice: { options: ['a'], correct: 0 } }), null);
  assert.match(CHOICE_RULE, /kids_choice/);
  assert.match(CHOICE_RULE, /null/);
  assert.match(CHOICE_RULE, /Nie wymyślaj faktów/);
});

// ── strona: QChoice.valid = te same reguły kształtu ─────────────────────────────────────────────
test('kid-choice.js: valid() zgodne z biblioteką (kształt; limit znaków pilnuje pipeline)', () => {
  const src = readFileSync(join(REPO, 'kid-choice.js'), 'utf8');
  const doc = { addEventListener() {}, querySelectorAll: () => [], querySelector: () => null };
  const ctx = { window: {}, document: doc, setTimeout, clearTimeout, setInterval, clearInterval };
  vm.runInNewContext(src, ctx);
  const valid = ctx.window.QChoice.valid;
  assert.equal(valid(GOOD), true);
  assert.equal(valid(null), false);
  for (const [ch, re] of BAD) if (!/pauzę|znaków/.test(String(re))) assert.equal(valid(ch), false, JSON.stringify(ch));
  assert.equal(ctx.window.QChoice.LOCK_MS, 3000, 'blokada po złej odpowiedzi: 3 s (decyzja JP)');
});

// ── walidator Python na złotym wzorcu ──────────────────────────────────────────────────────────
function validate(trip) {
  const base = mkdtempSync(join(tmpdir(), 'quolino-choice-'));
  try {
    const dir = join(base, 'frasassi');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'frasassi.meta.json'), JSON.stringify(trip.meta, null, 2));
    writeFileSync(join(dir, 'frasassi.pl.json'), JSON.stringify(trip.content, null, 2));
    const r = spawnSync('python3', [VALIDATOR, dir], { encoding: 'utf8' });
    if (r.error) throw r.error;
    const out = r.stdout + r.stderr;
    return { code: r.status, errors: out.split('\n').filter(l => l.includes('[BŁĄD]')), warnings: out.split('\n').filter(l => l.includes('[uwaga]')) };
  } finally { rmSync(base, { recursive: true, force: true }); }
}
const golden = () => { const t = JSON.parse(readFileSync(join(ROOT, 'test', 'golden', 'frasassi.trip.json'), 'utf8')); delete t._golden; return t; };
const sight = (t) => t.meta.stops.find(s => !['parking', 'restaurant', 'icecream', 'sweets'].includes(s.category) && t.content.stops[s.stop_key]?.kids_box).stop_key;

test('validate_trip.py: dobre pytanie przechodzi, brak pola = jak dotąd', () => {
  const base = validate(golden());
  const t = golden(); t.content.stops[sight(t)].kids_choice = { options: ['Stalaktyty', 'Muszle', 'Kości smoka', 'Złote monety'], correct: 0 };
  const r = validate(t);
  assert.equal(r.code, base.code, r.errors.join('\n'));
  assert.equal(r.errors.filter(e => e.includes('kids_choice')).length, 0, r.errors.join('\n'));
});
test('validate_trip.py: złe pytania → błąd przy kids_choice', () => {
  const cases = [
    [{ options: ['a', 'b', 'c'], correct: 0 }, '4 opcje'],
    [{ options: ['Lew', 'Orzeł', 'Wilk', 'Smok'], correct: 7 }, 'correct'],
    [{ options: ['Lew', 'Orzeł', 'Wilk', 'Smok'], correct: true }, 'correct'],
    [{ options: ['Lew', 'lew', 'Wilk', 'Smok'], correct: 0 }, 'powtarzają'],
    [{ options: ['Lew — król', 'Orzeł', 'Wilk', 'Smok'], correct: 0 }, 'pauzę'],
    [{ options: ['x'.repeat(41), 'Orzeł', 'Wilk', 'Smok'], correct: 0 }, 'znaków'],
    [{ options: ['', 'Orzeł', 'Wilk', 'Smok'], correct: 0 }, 'pusta'],
  ];
  for (const [ch, word] of cases) {
    const t = golden(); const k = sight(t); t.content.stops[k].kids_choice = ch;
    const r = validate(t);
    assert.ok(r.errors.some(e => e.includes(`${k}.kids_choice`) && e.includes(word)), `${JSON.stringify(ch)}\n${r.errors.join('\n')}`);
    assert.equal(r.code, 1);
  }
});
test('validate_trip.py: pytanie przy parkingu i bez misji → błąd; odpowiedź w misji → uwaga', () => {
  let t = golden(); const park = t.meta.stops.find(s => s.category === 'parking').stop_key;
  t.content.stops[park].kids_choice = GOOD;
  assert.ok(validate(t).errors.some(e => e.includes(`${park}.kids_choice`) && /bez misji|praktyczny/.test(e)));
  t = golden(); const k = sight(t);
  t.content.stops[k].kids_box = t.content.stops[k].kids_box + ' Czy to stalaktyty?';
  t.content.stops[k].kids_choice = { options: ['Stalaktyty', 'Muszle', 'Kości smoka', 'Złote monety'], correct: 0 };
  assert.ok(validate(t).warnings.some(w => w.includes(`${k}.kids_choice`) && w.includes('zdradza')));
});

// ── kontrola tłumaczenia ───────────────────────────────────────────────────────────────────────
function checkTr(src, dst) {
  const base = mkdtempSync(join(tmpdir(), 'quolino-choice-tr-'));
  try {
    writeFileSync(join(base, 'a.json'), JSON.stringify(src)); writeFileSync(join(base, 'b.json'), JSON.stringify(dst));
    const r = spawnSync('python3', [CHECK_TR, join(base, 'a.json'), join(base, 'b.json'), '--json'], { encoding: 'utf8' });
    return JSON.parse(r.stdout);
  } finally { rmSync(base, { recursive: true, force: true }); }
}
const TR_SRC = { city_slug: 'x', lang: 'pl', city: { title: 'X', region_label: 'R', subtitle: 's', lead: 'l', good_to_know: null, hero_note: null, local_food: null },
  stops: [{ stop_key: 'a', stop_number: 2, category: 'monument', name: 'Brama', desc_paragraphs: ['Opis'], kids_box: 'Co rośnie na bramie?', kids_choice: GOOD,
    photo_task: 'Zdjęcie', hint: null, local_flavor: null, dress_code: null, practical_note: null }], day_plan: [], emergency_points: [] };
const trDst = (choice) => ({ ...JSON.parse(JSON.stringify(TR_SRC)), lang: 'en', stops: [{ ...TR_SRC.stops[0], name: 'Gate', kids_box: 'What grows on the gate?', photo_task: 'Photo', kids_choice: choice }] });
test('check_translation.py: opcje przetłumaczone, numer poprawnej bez zmian', () => {
  assert.equal(checkTr(TR_SRC, trDst({ options: ['Olive tree', 'Fig tree', 'Cactus', 'Palm'], correct: 1 })).ok, true);
  const bad = [[{ options: ['Olive tree', 'Fig tree', 'Cactus', 'Palm'], correct: 2 }, 'correct'], [{ options: ['Olive', 'Fig', 'Cactus'], correct: 1 }, '4 opcje'],
    [{ options: ['Fig', 'fig', 'Cactus', 'Palm'], correct: 1 }, 'powtarzają'], [null, 'kids_choice']];
  for (const [ch, word] of bad) { const r = checkTr(TR_SRC, trDst(ch)); assert.equal(r.ok, false); assert.ok(r.errors.some(e => e.includes(word)), r.errors.join('\n')); }
  const noSrc = JSON.parse(JSON.stringify(TR_SRC)); noSrc.stops[0].kids_choice = null;
  assert.equal(checkTr(noSrc, trDst(null)).ok, true, 'null zostaje null');
  assert.equal(checkTr(noSrc, trDst(GOOD)).ok, false, 'tłumacz nie dodaje pytania');
  const old = JSON.parse(JSON.stringify(TR_SRC)); delete old.stops[0].kids_choice;
  const d = trDst(null); delete d.stops[0].kids_choice;
  assert.equal(checkTr(old, d).ok, true, 'stare źródło bez pola');
});

// ── source-check: odpowiedź = fakt ─────────────────────────────────────────────────────────────
const SC_TRIP = () => ({ meta: { city: { slug: 'spello', country: 'it' }, stops: [{ stop_key: 'porta', stop_number: 2, category: 'monument', verify_url: 'https://example.org/porta' }] },
  content: { city: { title: 'Spello' }, stops: { porta: { name: 'Porta Consolare', kids_box: 'Co rośnie na szczycie bramy?', hint: 'Patrz w górę.',
    kids_choice: { options: ['Oliwka', 'Figowiec', 'Kaktus', 'Palma'], correct: 1 } } } } });
const PAGE = '<html><body><p>Sulla sommità della Porta Consolare di Spello cresce un antico olivo, le cui radici tengono insieme le pietre della porta da secoli.</p></body></html>';
const net = { wiki: async () => null, wikiSearch: async () => [], page: async (u) => ({ kind: 'page', title: 'Porta', url: u, text: PAGE.replace(/<[^>]+>/g, ' ') }) };
test('source-check: odpowiedź sprzeczna ze źródłem → znika samo pytanie, misja zostaje', async () => {
  const trip = SC_TRIP();
  const ai = async (prompt) => {
    assert.match(prompt, /"rodzaj":"odpowiedz"/);
    assert.match(prompt, /bledne_opcje/);
    return JSON.stringify({ items: [{ id: 0, potwierdza: false, sprzeczne: true, zrodlo: 0, cytat: '' }] });
  };
  const r = await sourceCheck({ trip, review: { errors: [], warnings: [] }, deps: { net, ai } });
  assert.equal(trip.content.stops.porta.kids_choice, null);
  assert.equal(trip.content.stops.porta.kids_box, 'Co rośnie na szczycie bramy?');
  assert.ok(r.changes.some(c => c.path === 'content.stops.porta.kids_choice' && c.after === null));
  const w = r.review.warnings.find(x => x.path === 'content.stops.porta.kids_choice');
  assert.equal(w?.resolved?.action, 'choice_removed');
});
test('source-check: potwierdzona odpowiedź → źródło, pytanie zostaje, bez flagi; brak źródła → zostaje z notatką', async () => {
  let trip = SC_TRIP();
  const quote = 'Sulla sommità della Porta Consolare di Spello cresce un antico olivo';
  trip.content.stops.porta.kids_choice = { options: ['Oliwka', 'Figowiec', 'Kaktus', 'Palma'], correct: 0 };
  let r = await sourceCheck({ trip, review: { errors: [], warnings: [] }, deps: { net, ai: async () => JSON.stringify({ items: [{ id: 0, potwierdza: true, sprzeczne: false, zrodlo: 0, cytat: quote }] }) } });
  assert.ok(trip.content.stops.porta.kids_choice);
  assert.ok(trip.meta.stops[0].sources?.length, 'źródło dopisane');
  assert.equal((r.review.warnings ?? []).filter(x => x.path?.endsWith('kids_choice')).length, 0);
  trip = SC_TRIP();
  r = await sourceCheck({ trip, review: { errors: [], warnings: [] }, deps: { net, ai: async () => JSON.stringify({ items: [{ id: 0, potwierdza: false, sprzeczne: false }] }) } });
  assert.ok(trip.content.stops.porta.kids_choice, 'bez sprzeczności pytanie zostaje');
  assert.equal(r.review.warnings.find(x => x.path?.endsWith('kids_choice'))?.resolved?.action, 'kept');
  assert.ok(trip.content._notes.some(n => /Pytanie z wyborem/.test(n.note)));
});
