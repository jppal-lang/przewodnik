#!/usr/bin/env node
// Złoty test regresji wycieczki: node --test golden.test.mjs  (sam kod: bez AI, bez bazy, bez sieci)
// Wzorzec: test/golden/frasassi.trip.json ({meta, content} jak w gemini-draft.mjs) z treści starej strony wlochy/marche/frasassi.html
// oraz test/golden/frasassi.stop-ponte.json (rekord ops.stop_research z przypisami dla przystanku ponte-sentino).
// Sprawdza: walidator scripts/validate_trip.py (python3) na plikach w układzie writeTrip, validateStop/normalizeRecord/stripRefs/noDash,
// descProblems i repairJson — a także, że znane reguły odpalają na celowo zepsutych kopiach.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { validateStop, normalizeRecord, stripRefs, noDash } from './stop-content-lib.mjs';
import { descProblems } from './desc-rules.mjs';
import { repairJson } from './json-repair.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GOLDEN = join(ROOT, 'test', 'golden');
const VALIDATOR = join(ROOT, 'quolino-trip-writing', 'scripts', 'validate_trip.py');
const SLUG = 'frasassi';
const loadTrip = () => { const t = JSON.parse(readFileSync(join(GOLDEN, 'frasassi.trip.json'), 'utf8')); delete t._golden; return t; };
const loadRec = () => { const r = JSON.parse(readFileSync(join(GOLDEN, 'frasassi.stop-ponte.json'), 'utf8')); delete r._golden; return r; };
const catOf = (trip, key) => trip.meta.stops.find(s => s.stop_key === key)?.category;

// jak writeTrip w draft-lib.mjs: <dir>/<slug>/<slug>.meta.json + <slug>.pl.json
function validate(trip) {
  const base = mkdtempSync(join(tmpdir(), 'quolino-golden-'));
  try {
    const dir = join(base, SLUG);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${SLUG}.meta.json`), JSON.stringify(trip.meta, null, 2));
    writeFileSync(join(dir, `${SLUG}.pl.json`), JSON.stringify(trip.content, null, 2));
    const r = spawnSync('python3', [VALIDATOR, dir], { encoding: 'utf8' });
    if (r.error) throw r.error;
    const out = r.stdout + r.stderr;
    return { code: r.status, out, errors: out.split('\n').filter(l => l.includes('[BŁĄD]')), warnings: out.split('\n').filter(l => l.includes('[uwaga]')) };
  } finally { rmSync(base, { recursive: true, force: true }); }
}
const ALL_TEXT = (o) => JSON.stringify(o);

// ── wzorzec jest spójny i czysty ────────────────────────────────────────────────────────────────
test('wzorzec: kształt {meta, content}, klucze przystanków zgodne, parking pierwszy', () => {
  const t = loadTrip();
  const keys = t.meta.stops.map(s => s.stop_key);
  assert.deepEqual(Object.keys(t.content.stops).sort(), [...keys].sort());
  assert.equal(t.meta.stops[0].category, 'parking');
  assert.deepEqual(t.meta.stops.map(s => s.stop_number), [1, 2, 3, 4, 5]);
  assert.deepEqual(keys, ['parking-san-vittore', 'grotte-frasassi', 'abbazia-san-vittore', 'ponte-sentino', 'tempio-valadier']);
  for (const s of t.meta.stops) {
    assert.match(s.time_label, /^\d{2}:\d{2}$/, s.stop_key);
    assert.equal(+s.visit_duration, s.duration_min, s.stop_key);
    assert.ok(Number.isFinite(s.lat) && Number.isFinite(s.lon), s.stop_key);
    assert.ok(t.content.day_plan[s.stop_key].startsWith(s.time_label), `day_plan ${s.stop_key}`);
  }
  for (const [k, st] of Object.entries(t.content.stops)) assert.ok(st.desc_paragraphs.length >= 1 && st.photo_task, k);
  assert.ok(Array.isArray(t.content._notes) && t.content._notes.every(n => 'abcdefg'.includes(n.field)));
});

test('validate_trip.py: wzorzec przechodzi bez błędów (kod 0)', () => {
  const r = validate(loadTrip());
  assert.equal(r.code, 0, r.out);
  assert.equal(r.errors.length, 0, r.out);
  assert.match(r.out, /Bez błędów/);
});

test('descProblems: każdy przystanek wzorca spełnia minimum swojej kategorii', () => {
  const t = loadTrip();
  for (const [k, st] of Object.entries(t.content.stops)) {
    const cat = catOf(t, k);
    // końcowy akapit „Praktycznie: …” nie podlega minimum 40 słów na akapit (tak liczy validateStop)
    const story = [...st.desc_paragraphs]; while (story.length > 1 && /^\s*Praktycznie\s*[:,]/.test(story.at(-1))) story.pop();
    assert.deepEqual(descProblems(cat, story).filter(p => /^akapity /.test(p)), [], `${k} (${cat})`);
    assert.deepEqual(descProblems(cat, st.desc_paragraphs).filter(p => !/^akapity /.test(p)), [], `${k} (${cat})`);
  }
});

test('descProblems: obcięty opis kościoła i punktu widokowego → problemy', () => {
  const t = loadTrip();
  const church = descProblems('church', t.content.stops['tempio-valadier'].desc_paragraphs.slice(0, 2));
  assert.ok(church.some(p => /minimum 4 akapity i 300 słów/.test(p)), church.join('\n'));
  assert.ok(descProblems('church', ['Jedno zdanie.', 'Drugie zdanie.', 'Trzecie.', 'Czwarte.']).some(p => /^akapity /.test(p)));
  const view = descProblems('viewpoint', t.content.stops['ponte-sentino'].desc_paragraphs.slice(0, 1));
  assert.ok(view.some(p => /minimum 2 akapity i 120 słów/.test(p)), view.join('\n'));
  assert.deepEqual(descProblems('parking', ['Krótko.']), []);
});

// ── reguły odpalają na zepsutych kopiach ────────────────────────────────────────────────────────
test('validate_trip.py: „20 minut jazdy” w opisie → błąd krytyczny (kod 1)', () => {
  const t = loadTrip();
  t.content.stops['abbazia-san-vittore'].desc_paragraphs[0] += ' Do Fabriano jest stąd 20 minut jazdy, więc zostaje czas na muzeum.';
  const r = validate(t);
  assert.equal(r.code, 1, r.out);
  assert.ok(r.errors.some(l => /abbazia-san-vittore\.desc\[0\]: KRYTYCZNE: czas dojazdu — „minut jazdy”/.test(l)), r.out);
});

test('validate_trip.py: kilometry i „wyjazd z” → błędy', () => {
  const t = loadTrip();
  t.content.stops['ponte-sentino'].practical_note = 'Wyjazd z Genga rano, potem 12 km do Fabriano.';
  const r = validate(t);
  assert.equal(r.code, 1);
  assert.ok(r.errors.some(l => /odległość w km/.test(l)), r.out);
  assert.ok(r.errors.some(l => /godzina wyjazdu z bazy/.test(l)), r.out);
});

test('validate_trip.py: opis poniżej minimum bez notatki → błąd', () => {
  const t = loadTrip();
  t.content.stops['ponte-sentino'].desc_paragraphs = t.content.stops['ponte-sentino'].desc_paragraphs.slice(0, 1);
  const r = validate(t);
  assert.equal(r.code, 1, r.out);
  assert.ok(r.errors.some(l => /ponte-sentino — opis rodzica poniżej minimum \(viewpoint: 1 akap\./.test(l)), r.out);
});

test('validate_trip.py: ten sam opis z _notes {field b, „ZA MAŁO MATERIAŁU”} → tylko uwaga (kod 0)', () => {
  const t = loadTrip();
  t.content.stops['ponte-sentino'].desc_paragraphs = t.content.stops['ponte-sentino'].desc_paragraphs.slice(0, 1);
  t.content._notes.push({ stop_key: 'ponte-sentino', field: 'b', note: 'ZA MAŁO MATERIAŁU: o mostku źródła mówią tylko tyle, że stoi przy opactwie' });
  const r = validate(t);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.errors.length, 0, r.out);
  assert.ok(r.warnings.some(l => /ponte-sentino — opis rodzica poniżej minimum/.test(l)), r.out);
});

test('validate_trip.py: kościół z krótkimi akapitami — błąd, a z notatką „za mało materiału” uwaga', () => {
  const t = loadTrip();
  t.content.stops['tempio-valadier'].desc_paragraphs = ['Świątynia stoi w grocie. Zbudowano ją w XIX wieku.', 'Obok jest pustelnia. Jest starsza.'];
  const bad = validate(t);
  assert.equal(bad.code, 1);
  assert.ok(bad.errors.some(l => /tempio-valadier — opis rodzica poniżej minimum \(church/.test(l)), bad.out);
  assert.ok(bad.errors.some(l => /tempio-valadier — akapity za krótkie/.test(l)), bad.out);
  t.content._notes.push({ stop_key: 'tempio-valadier', field: 'b', note: 'za mało materiału w researchu' });
  const ok = validate(t);
  assert.equal(ok.code, 0, ok.out);
  assert.ok(ok.warnings.some(l => /tempio-valadier — akapity za krótkie/.test(l)), ok.out);
});

test('validate_trip.py: notatka „za mało materiału” przy innym polu (c) nie łagodzi błędu', () => {
  const t = loadTrip();
  t.content.stops['ponte-sentino'].desc_paragraphs = t.content.stops['ponte-sentino'].desc_paragraphs.slice(0, 1);
  t.content._notes.push({ stop_key: 'ponte-sentino', field: 'c', note: 'ZA MAŁO MATERIAŁU: quest' });
  assert.equal(validate(t).code, 1);
});

test('validate_trip.py: time_label z tekstem, emoji, brak questu, quest zdradza odpowiedź → błędy', () => {
  const t = loadTrip();
  t.meta.stops[2].time_label = 'ok. 12:00';
  t.content.stops['grotte-frasassi'].name = 'Grotte di Frasassi 🦇';
  t.content.stops['ponte-sentino'].kids_box = null;
  t.content.stops['abbazia-san-vittore'].hint = 'Okien jest mało (odpowiedź: siedem).';
  const r = validate(t);
  assert.equal(r.code, 1);
  for (const re of [/time_label = 'ok\. 12:00'/, /emoji „🦇”/, /ponte-sentino — brak questu/, /abbazia-san-vittore\.hint — zdradza odpowiedź/])
    assert.ok(r.errors.some(l => re.test(l)), `${re}\n${r.out}`);
});

test('noDash: pauza i półpauza w tekstach → zwykły łącznik; wzorzec bez pauz zostaje bez zmian', () => {
  const t = loadTrip();
  assert.deepEqual(noDash(t.content), t.content);
  t.content.stops['grotte-frasassi'].desc_paragraphs[0] = 'Jaskinie odkryto w 1971 roku — przypadkiem. Trasa trwa 70–80 minut.';
  t.content.day_plan['grotte-frasassi'] = '10:00 — wejście';
  const fixed = noDash(t.content);
  assert.doesNotMatch(ALL_TEXT(fixed), /[—–]/);
  assert.equal(fixed.stops['grotte-frasassi'].desc_paragraphs[0], 'Jaskinie odkryto w 1971 roku - przypadkiem. Trasa trwa 70-80 minut.');
  assert.equal(fixed.day_plan['grotte-frasassi'], '10:00 - wejście');
});

// Pauza „—” jest dziś usuwana kodem (noDash) przy zapisie, ale validate_trip.py jej nie zgłasza — reguła JP 2026-10-25 nie ma
// strażnika w walidatorze. Test zostaje jako todo: gdy walidator dostanie regułę, zdejmij todo.
test('validate_trip.py: pauza „—” w opisie → błąd', { todo: 'validate_trip.py nie ma jeszcze reguły na pauzę/półpauzę' }, () => {
  const t = loadTrip();
  t.content.stops['abbazia-san-vittore'].desc_paragraphs[1] = t.content.stops['abbazia-san-vittore'].desc_paragraphs[1].replace(', czyli', ' — czyli');
  const r = validate(t);
  assert.equal(r.code, 1, r.out);
});

// ── rekord przystanku (ops.stop_research) ───────────────────────────────────────────────────────
test('validateStop: wzorcowy rekord ponte-sentino bez błędów i uwag', () => {
  const r = validateStop(loadRec(), { category: 'viewpoint' });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test('stripRefs: opis rekordu bez przypisów = opis przystanku w szkicu wycieczki', () => {
  const rec = loadRec(), t = loadTrip();
  const plain = rec.marked.desc_paragraphs.map(stripRefs);
  assert.ok(plain.every(p => !/\[\d+\]/.test(p)));
  assert.deepEqual(plain, t.content.stops['ponte-sentino'].desc_paragraphs);
});

test('normalizeRecord: wzorzec zachowany, braki uzupełnione, wynik nadal przechodzi', () => {
  const rec = loadRec();
  const n = normalizeRecord(rec, { category: 'viewpoint', today: '2026-10-26' });
  assert.deepEqual(n.marked.desc_paragraphs, rec.marked.desc_paragraphs);
  assert.deepEqual(n.sources.map(s => s.n), [1, 2]);
  assert.equal(validateStop(n, { category: 'viewpoint' }).errors.length, 0);
  // surowa odpowiedź modelu: bez stanu, bloki jako napisy/puste, źródła bez daty, nieposortowane
  const raw = { desc_paragraphs: [...rec.marked.desc_paragraphs, '  '], legend: '', curiosity: {}, fun_fact: null, pop_culture: [],
    sources: [{ n: '2', url: rec.sources[1].url, title: rec.sources[1].title, lang: 'it' }, { n: 1, url: rec.sources[0].url, title: rec.sources[0].title }] };
  const m = normalizeRecord(raw, { category: 'viewpoint', today: '2026-10-26' });
  assert.equal(m.marked.desc_paragraphs.length, 2);
  assert.deepEqual(m.sources.map(s => [s.n, s.accessed]), [[1, '2026-10-26'], [2, '2026-10-26']]);
  for (const b of ['legend', 'curiosity', 'fun_fact', 'pop_culture']) { assert.equal(m.marked[b], null); assert.equal(m.state[b].state, 'none'); }
  // bez „checked” walidator zgłasza brak — normalizacja niczego nie wymyśla
  assert.ok(validateStop(m, { category: 'viewpoint' }).errors.some(e => /bez pola checked/.test(e.problem)));
});

test('validateStop: czas dojazdu i km w opisie → błąd', () => {
  const rec = loadRec();
  rec.marked.desc_paragraphs[1] += ' Do Fabriano jest stąd 20 minut jazdy [1].';
  rec.marked.desc_paragraphs[0] += ' Parking jest 2 km dalej [1].';
  const r = validateStop(rec, { category: 'viewpoint' });
  assert.ok(r.errors.some(e => /czas dojazdu albo kilometry \(„minut jazdy”\)/.test(e.problem)), JSON.stringify(r.errors));
  assert.ok(r.errors.some(e => /czas dojazdu albo kilometry \(„km”\)/.test(e.problem)), JSON.stringify(r.errors));
});

test('validateStop: opis poniżej minimum → błąd, z notatką „za mało materiału” (thin) → uwaga', () => {
  const rec = loadRec();
  rec.marked.desc_paragraphs = rec.marked.desc_paragraphs.slice(0, 1);
  rec.sources = rec.sources.filter(s => s.n === 1);              // źródło [2] było tylko w drugim akapicie
  const bad = validateStop(rec, { category: 'viewpoint' });
  assert.ok(bad.errors.some(e => e.block === 'desc' && /minimum 2 akapity i 120 słów/.test(e.problem)));
  const thin = validateStop(rec, { category: 'viewpoint', thin: 'ZA MAŁO MATERIAŁU: o mostku źródła mówią mało' });
  assert.equal(thin.errors.length, 0, JSON.stringify(thin.errors));
  assert.ok(thin.warnings.some(e => /za mało materiału/.test(e.problem)));
});

test('validateStop: liczba bez przypisu i przypis bez źródła → błędy', () => {
  const rec = loadRec();
  rec.marked.desc_paragraphs[0] = rec.marked.desc_paragraphs[0].replace(' [1].', '. Most ma 3 łuki [7].');
  const r = validateStop(rec, { category: 'viewpoint' });
  assert.ok(r.errors.some(e => /przypis \[7\] nie ma źródła/.test(e.problem)), JSON.stringify(r.errors));
  assert.ok(r.errors.some(e => /źródło \[1\] nie jest użyte/.test(e.problem)), JSON.stringify(r.errors));
});

// ── naprawa JSON-a na całym szkicu ───────────────────────────────────────────────────────────────
test('repairJson: szkic z prostymi cudzysłowami, przecinkami na końcu, w płotku i z prozą → identyczny wzorzec', () => {
  const t = loadTrip();
  let broken = JSON.stringify(t, null, 2).replace(/[„”]/g, '"').replace(/\n(\s*)\}/g, ',\n$1}');
  broken = `Oto szkic wycieczki:\n\`\`\`json\n${broken}\n\`\`\`\nDaj znać, czy coś poprawić.`;
  assert.throws(() => JSON.parse(broken));
  assert.deepEqual(JSON.parse(repairJson(broken)), t);
});

test('repairJson: szkic ucięty w połowie ostatniego przystanku → meta i wcześniejsze przystanki całe', () => {
  const t = loadTrip();
  const full = JSON.stringify(t);
  const cut = full.slice(0, full.indexOf('Neoklasyczna'));          // urwane w tekście tempio-valadier
  const r = JSON.parse(repairJson(cut));
  assert.deepEqual(r.meta, t.meta);
  assert.deepEqual(r.content.stops['ponte-sentino'], t.content.stops['ponte-sentino']);
  assert.ok(r.content.stops['tempio-valadier'].desc_paragraphs[0].startsWith('Na końcu asfaltowej ścieżki'));
});
