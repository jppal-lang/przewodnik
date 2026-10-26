#!/usr/bin/env node
// Testy naprawy JSON-a w kodzie: node --test json-repair.test.mjs  (bez sieci, bez bazy, bez AI)
// Próbki = typowe usterki odpowiedzi Gemini/Claude/OpenRouter przy polskich tekstach.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repairJson, parseModelJson } from './json-repair.mjs';

const fix = (t) => JSON.parse(repairJson(t));

test('poprawny JSON przechodzi bez zmian', () => {
  const o = { a: 1, b: ['x', { c: null, d: true }], e: 'tekst „cytat” i \\ ukośnik' };
  assert.deepEqual(fix(JSON.stringify(o)), o);
  assert.deepEqual(fix(JSON.stringify(o, null, 2)), o);
});

test('prosty " w środku polskiego tekstu → „…”', () => {
  const r = fix('{"name": "Grotta Grande del Vento", "lead": "Speleolodzy nazwali salę "Abisso Ancona" na cześć miasta."}');
  assert.equal(r.lead, 'Speleolodzy nazwali salę „Abisso Ancona” na cześć miasta.');
});

test('mieszane „cytat" (typograficzny otwierający, prosty zamykający)', () => {
  const r = fix('{"kids_box": "Znajdźcie „Gigantów" i policzcie je.", "hint": null}');
  assert.equal(r.kids_box, 'Znajdźcie „Gigantów” i policzcie je.');
  assert.equal(r.hint, null);
});

test('cytat zakończony przecinkiem w tekście nie zamyka wartości', () => {
  const r = fix('{"desc": "Mówią na nią "perła w muszli", bo stoi w grocie.", "x": 1}');
  assert.equal(r.desc, 'Mówią na nią „perła w muszli”, bo stoi w grocie.');
  assert.equal(r.x, 1);
});

test('cytat na końcu tekstu: ""Perła""', () => {
  const r = fix('{"a": "Mówią na nią "Perła"", "b": 2}');
  assert.equal(r.a, 'Mówią na nią „Perła”');
  assert.equal(r.b, 2);
});

test('zagnieżdżone cytaty w desc_paragraphs (tablica)', () => {
  const t = `{"stops": {"tempio": {"desc_paragraphs": [
    "Świątynię nazywa się "Tempio del Valadier", choć Valadier jej nie postawił.",
    "Napis "Ave Maria" i słowo "Pax" widać nad wejściem.",
    "Trzeci akapit bez cytatu."
  ]}}}`;
  const r = fix(t);
  assert.deepEqual(r.stops.tempio.desc_paragraphs, [
    'Świątynię nazywa się „Tempio del Valadier”, choć Valadier jej nie postawił.',
    'Napis „Ave Maria” i słowo „Pax” widać nad wejściem.',
    'Trzeci akapit bez cytatu.',
  ]);
});

test('przecinki przed } i ]', () => {
  assert.deepEqual(fix('{"a": [1, 2, 3,], "b": {"c": "d",},}'), { a: [1, 2, 3], b: { c: 'd' } });
});

test('ucięta tablica i obiekt (koniec tokenów) → domknięte', () => {
  const r = fix('{"stops": [{"stop_key": "parking", "stop_number": 1}, {"stop_key": "grotte", "stop_number": 2');
  assert.equal(r.stops.length, 2);
  assert.equal(r.stops[1].stop_number, 2);
});

test('ucięte w środku tekstu', () => {
  const r = fix('{"desc_paragraphs": ["Pierwszy akapit.", "Drugi akapit urwany w poł');
  assert.deepEqual(r.desc_paragraphs, ['Pierwszy akapit.', 'Drugi akapit urwany w poł']);
});

test('ucięte po kluczu i po dwukropku → null', () => {
  assert.deepEqual(fix('{"a": 1, "b":'), { a: 1, b: null });
  assert.deepEqual(fix('{"a": 1, "b"'), { a: 1, b: null });
  assert.deepEqual(fix('{"a": 1, "b": tru'), { a: 1, b: true });
});

test('blok w płotkach ```json … ```', () => {
  const r = fix('Oto szkic:\n```json\n{"verdict": "ok", "errors": [],}\n```\nDaj znać, gdyby…');
  assert.deepEqual(r, { verdict: 'ok', errors: [] });
});

test('płotek bez zamknięcia (ucięta odpowiedź)', () => {
  const r = fix('```json\n{"verdict": "fix", "errors": [{"stop": 2, "problem": "brak "źródła"');
  assert.equal(r.verdict, 'fix');
  assert.equal(r.errors[0].problem, 'brak „źródła');   // cudzysłów tuż przed końcem = zamknięcie wartości
});

test('proza przed i po JSON-ie (z nawiasami w prozie po)', () => {
  const r = fix('Jasne, poniżej poprawiony przystanek:\n{"name": "San Vittore alle Chiuse", "optional": false}\nUwaga: {to nie JSON}');
  assert.deepEqual(r, { name: 'San Vittore alle Chiuse', optional: false });
});

test('tablica na najwyższym poziomie, proza z [ wcześniej nie psuje', () => {
  const r = fix('Lista [3 pozycje]:\n[{"n": 1}, {"n": 2}, {"n": 3},]');
  assert.deepEqual(r, [{ n: 1 }, { n: 2 }, { n: 3 }]);
});

test('typograficzne cudzysłowy jako ograniczniki JSON-a', () => {
  const r = fix('{“name”: “Ponte sul Sentino”, “optional”: true, “note”: “mostek „romański” nad rzeką”}');
  assert.deepEqual(r, { name: 'Ponte sul Sentino', optional: true, note: 'mostek „romański” nad rzeką' });
});

test('surowe nowe linie i tabulatory w tekście', () => {
  const r = fix('{"lead": "Pierwsza linia\nDruga\tlinia", "x": 1}');
  assert.equal(r.lead, 'Pierwsza linia\nDruga\tlinia');
});

test('komentarze // i /* */ poza tekstami; URL w tekście nietknięty', () => {
  const r = fix(`{
    // źródło oficjalne
    "verify_url": "https://www.frasassi.com/orari/", /* sprawdzone */
    "maps_query": "Grotte di Frasassi, Genga, Italia"
  }`);
  assert.equal(r.verify_url, 'https://www.frasassi.com/orari/');
  assert.equal(r.maps_query, 'Grotte di Frasassi, Genga, Italia');
});

test('błędny escape \\x i pojedynczy ukośnik', () => {
  const r = fix('{"path": "C:\\dane\\xyz", "ok": "a\\"b"}');   // \d i \x to nie są escape'y JSON-a
  assert.equal(r.path, 'C:\\dane\\xyz');
  assert.equal(r.ok, 'a"b');
});

test('„Uwaga": w środku wartości nie zamyka tekstu', () => {
  const r = fix('{"practical_note": "Napis "Uwaga": śliskie schody.", "dress_code": null}');
  assert.equal(r.practical_note, 'Napis „Uwaga”: śliskie schody.');
});

test('Python-owe True/None i podwójne przecinki', () => {
  assert.deepEqual(fix('{"a": True, "b": None,, "c": [1,,2]}'), { a: true, b: null, c: [1, 2] });
});

test('pełny szkic wycieczki z kilkoma usterkami naraz', () => {
  const t = `Oto szkic wycieczki:
\`\`\`json
{
  "meta": {"city": {"slug": "frasassi", "status": "draft",}, "stops": [
    {"stop_key": "parking-san-vittore", "stop_number": 1, "category": "parking"},
    {"stop_key": "grotte", "stop_number": 2, "category": "monument",},
  ]},
  "content": {"lang": "pl", "stops": {
    "grotte": {"name": "Grotte di Frasassi", "desc_paragraphs": ["Salę nazwano "Abisso Ancona".", "Druga linia
z nową linią"], "kids_box": "Znajdźcie „Gigantów"."}
  }, "_notes": [{"stop_key": "grotte", "field": "b", "note": "ZA MAŁO MATERIAŁU: brak "popkultury"`;
  const r = fix(t);
  assert.equal(r.meta.stops.length, 2);
  assert.equal(r.content.stops.grotte.desc_paragraphs[0], 'Salę nazwano „Abisso Ancona”.');
  assert.equal(r.content.stops.grotte.desc_paragraphs[1], 'Druga linia\nz nową linią');
  assert.equal(r.content.stops.grotte.kids_box, 'Znajdźcie „Gigantów”.');
  assert.equal(r.content._notes[0].note, 'ZA MAŁO MATERIAŁU: brak „popkultury');
});

test('parseModelJson: poprawny JSON bez naprawy, uszkodzony z naprawą (onRepair)', () => {
  let repaired = 0;
  assert.deepEqual(parseModelJson('```json\n{"a": 1}\n```', { onRepair: () => repaired++ }), { a: 1 });
  assert.equal(repaired, 0);
  assert.deepEqual(parseModelJson('{"a": "x "y" z",}', { onRepair: () => repaired++ }), { a: 'x „y” z' });
  assert.equal(repaired, 1);
  assert.deepEqual(parseModelJson('[1, 2]'), [1, 2]);
});

test('parseModelJson: tekst bez JSON-a → błąd jak dotąd', () => {
  assert.throws(() => parseModelJson('Nie mogę tego zrobić.'));
});
