// Ikony miejsc — czyste funkcje (bez sieci, bazy i Discorda): node --test bin/place-icons.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from './place-icons-lib.mjs';

const cand = (title, extra = {}) => ({ title, source: 'cat', width: 4000, height: 3000, mime: 'image/jpeg', description: '', categories: '', date: '2018-06-01 18:30:00', ...extra });

test('filtr ludzi: tytuły, opisy i kategorie z ludźmi odpadają', () => {
  for (const t of ['File:Spello Infiorata 2019.jpg', 'File:Tourists at Porta Venere.jpg', 'File:Wedding in Spello.jpg', 'File:Processione del Corpus Domini.jpg',
    'File:Selfie Porta Consolare.jpg', 'File:Spello, folla in piazza.jpg', 'File:Spello portrait.jpg', 'File:Bambini a Spello.jpg']) {
    assert.match(L.classify(cand(t)).drop ?? '', /ludzie/, t);
  }
  assert.match(L.classify(cand('File:Porta Venere 01.jpg', { description: 'A group of people walking under the gate' })).drop, /ludzie/);
  assert.match(L.classify(cand('File:Porta Venere 01.jpg', { categories: 'Porta Venere (Spello) | People of Umbria' })).drop, /ludzie/);
});
test('filtr ludzi: bez fałszywych alarmów na słowach w środku wyrazów i w nazwie miejsca', () => {
  for (const t of ['File:Spello - Porta Venere.jpg', 'File:Romanesque portal Sant\'Andrea.jpg', 'File:Mantova facade.jpg', 'File:Germanic arch.jpg', 'File:Spello panorama dal belvedere.jpg']) {
    assert.equal(L.classify(cand(t)).drop, null, t);
  }
  // „Festa” w nazwie przystanku nie jest imprezą
  assert.equal(L.classify(cand('File:Piazza della Festa 1.jpg'), { names: ['Piazza della Festa'] }).drop, null);
  assert.equal(L.peopleHit('Piazza della Festa, Spello', ['Piazza della Festa']), null);
  assert.equal(L.peopleHit('crowd at the gate'), 'crowd');
});
test('kategorie techniczne Commons nie są sygnałem', () => {
  assert.deepEqual(L.contentCats('Porta Venere (Spello)|CC-BY-SA-4.0|Pages with maps|Taken with Canon EOS 5D|Files by User:Man of Spello|Self-published work'), ['Porta Venere (Spello)']);
  const pg = { title: 'File:PV.jpg', imageinfo: [{ width: 3000, height: 2000, mime: 'image/jpeg', url: 'https://u/PV.jpg', thumburl: 'https://u/960px-PV.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:PV.jpg',
    extmetadata: { Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:X">Jan &amp; Co</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' }, Categories: { value: 'Porta Venere|Pages with maps|Files by User:Man' } } }] };
  const c = L.normPage(pg, 'p18');
  assert.equal(c.author, 'Jan & Co'); assert.equal(c.license, 'CC BY-SA 4.0'); assert.equal(c.categories, 'Porta Venere'); assert.equal(c.thumb, 'https://u/960px-PV.jpg');
  assert.equal(L.classify(c).drop, null);
  assert.equal(L.normPage({ title: 'File:missing.jpg', missing: true }, 'cat'), null);
});
test('odrzucenia: mapy, noc, rusztowania, małe, svg, wnętrze przy zewnętrzu', () => {
  assert.match(L.classify(cand('File:Spello map.png', { mime: 'image/png' })).drop, /bryły/);
  assert.match(L.classify(cand('File:Porta Venere di notte.jpg')).drop, /bryły/);
  assert.match(L.classify(cand('File:Porta Venere scaffolding.jpg')).drop, /bryły/);
  assert.match(L.classify(cand('File:PV.jpg', { width: 800, height: 600 })).drop, /małe/);
  assert.match(L.classify(cand('File:PV.svg', { mime: 'image/svg+xml' })).drop, /format/);
  assert.match(L.classify(cand('File:Sant Andrea interno navata.jpg')).drop, /wnętrze/);
  assert.equal(L.classify(cand('File:Sant Andrea interno navata.jpg'), { view: 'interior' }).drop, null);
  // „Mosaici” w nazwie przystanku nie czyni każdego zdjęcia wnętrzem
  assert.equal(L.classify(cand('File:Villa dei Mosaici di Spello ingresso.jpg'), { names: ['Villa dei Mosaici di Spello'] }).drop, null);
});
test('ranking: P18 i duże poziome wyżej, detale i stare niżej, bez duplikatów i odrzuconych przez JP', () => {
  const list = [
    cand('File:A detail.jpg'),
    cand('File:B.jpg', { source: 'search', width: 2000, height: 3000 }),
    cand('File:C.jpg', { source: 'p18' }),
    cand('File:C.jpg', { source: 'search' }),
    cand('File:D old.jpg', { date: '1950' }),
    cand('File:E.jpg', { date: '2019-07-01 23:10:00' }),
    cand('File:F tourists.jpg'),
    cand('File:G.jpg'),
    cand('File:H.jpg'),
  ];
  const { kept, dropped } = L.rankCandidates(list, { exclude: ['File:G.jpg'] });
  assert.equal(kept[0].title, 'File:C.jpg');
  assert.equal(kept.filter(k => k.title === 'File:C.jpg').length, 1);
  assert.ok(!kept.some(k => k.title === 'File:G.jpg'));
  assert.ok(dropped.some(d => d.title === 'File:F tourists.jpg'));
  const pos = (t) => kept.findIndex(k => k.title === t);
  assert.ok(pos('File:A detail.jpg') > pos('File:H.jpg'));
  assert.ok(pos('File:B.jpg') > pos('File:H.jpg'));
  assert.ok(kept.find(k => k.title === 'File:D old.jpg').score < kept.find(k => k.title === 'File:C.jpg').score);
  assert.ok(kept.find(k => k.title === 'File:E.jpg').score < kept.find(k => k.title === 'File:C.jpg').score);
});
test('podkategorie: bez ludzi, map i wnętrz (przy zewnętrzu)', () => {
  assert.equal(L.subcatOk('Category:Infiorata di Spello'), false);
  assert.equal(L.subcatOk('Category:People in Spello'), false);
  assert.equal(L.subcatOk('Category:Interior of Sant\'Andrea (Spello)'), false);
  assert.equal(L.subcatOk('Category:Interior of Sant\'Andrea (Spello)', { view: 'interior' }), true);
  assert.equal(L.subcatOk('Category:Facade of Sant\'Andrea (Spello)'), true);
});
test('widok: kościół domyślnie z zewnątrz, wnętrze tylko przy tekście o wnętrzu, ręczne nadpisanie', () => {
  assert.equal(L.viewMode({ category: 'monument', texts: ['fresk fresk fresk mozaika'] }), 'exterior');
  assert.equal(L.viewMode({ category: 'church', texts: ['Fasada z portalem i dzwonnicą.'] }), 'exterior');
  assert.equal(L.viewMode({ category: 'museum', texts: ['Mozaiki na posadzce, mozaika z rybami, wnętrze willi, mozaiki geometryczne.'] }), 'interior');
  assert.equal(L.viewMode({ category: 'church', texts: [] , override: 'interior' }), 'interior');
});
test('odpowiedzi JP na Discordzie', () => {
  const T = ['spello', 'frasassi'];
  assert.deepEqual(L.parseReply('ok 3', T), { type: 'ok', n: 3, trip: null });
  assert.deepEqual(L.parseReply('OK3', T), { type: 'ok', n: 3, trip: null });
  assert.deepEqual(L.parseReply('3 ok', T), { type: 'ok', n: 3, trip: null });
  assert.deepEqual(L.parseReply('ok spello 3', T), { type: 'ok', n: 3, trip: 'spello' });
  assert.deepEqual(L.parseReply('spello 3 ok', T), { type: 'ok', n: 3, trip: 'spello' });
  assert.deepEqual(L.parseReply('ok', T), { type: 'ok-last' });
  assert.deepEqual(L.parseReply('następne', T), { type: 'next' });
  assert.deepEqual(L.parseReply('3: bez drzew, cieplej', T), { type: 'fix', n: 3, trip: null, notes: 'bez drzew, cieplej' });
  assert.deepEqual(L.parseReply('3 wieża wyższa', T), { type: 'fix', n: 3, trip: null, notes: 'wieża wyższa' });
  assert.deepEqual(L.parseReply('frasassi 5 mniej zieleni', T), { type: 'fix', n: 5, trip: 'frasassi', notes: 'mniej zieleni' });
  assert.deepEqual(L.parseReply('#4.jaśniej', T), { type: 'fix', n: 4, trip: null, notes: 'jaśniej' });
  assert.deepEqual(L.parseReply('3 inne zdjęcia', T), { type: 'refs', n: 3, trip: null });
  assert.deepEqual(L.parseReply('spello 3 nowe zdjęcia', T), { type: 'refs', n: 3, trip: 'spello' });
  assert.deepEqual(L.parseReply('inne zdjęcia', T), { type: 'refs-last' });
  assert.deepEqual(L.parseReply('za ciemne niebo', T), { type: 'fix-last', notes: 'za ciemne niebo' });
  assert.deepEqual(L.parseReply('ok rimini 3', T), { type: 'unknown-trip', word: 'rimini' });
  assert.equal(L.parseReply('  ', T), null);
});
test('rozstrzyganie trasy dla „ok N” bez nazwy trasy', () => {
  const states = {
    spello: { stops: { a: { n: 3, status: 'review', posted_at: '2026-11-01T10:00:00Z' }, b: { n: 4, status: 'ok' } } },
    frasassi: { stops: { c: { n: 4, status: 'review', posted_at: '2026-11-01T11:00:00Z' } } },
  };
  const last = L.lastPostedOf(states);
  assert.deepEqual(last, { trip: 'frasassi', key: 'c', n: 4, at: '2026-11-01T11:00:00Z' });
  assert.deepEqual(L.resolveTarget({ n: 3 }, states, last), { trip: 'spello', n: 3 });     // tylko Spello ma #3 do oceny
  assert.deepEqual(L.resolveTarget({ n: 4 }, states, last), { trip: 'frasassi', n: 4 });   // tylko Frasassi ma #4 do oceny
  assert.deepEqual(L.resolveTarget({ n: 4, trip: 'spello' }, states, last), { trip: 'spello', n: 4 });
  states.spello.stops.b.status = 'review';
  assert.deepEqual(L.resolveTarget({ n: 4 }, states, last), { trip: 'frasassi', n: 4 });   // obie → ostatnio wrzucona trasa
});
test('nazwy plików i ścieżki', () => {
  assert.equal(L.iconPath('spello', 'porta-venere', 256), 'media/icons/place-spello-porta-venere-256.webp');
  assert.equal(L.iconBase('/r', 'spello', 'porta-venere'), '/r/media/icons/place-spello-porta-venere');
  assert.equal(L.stopDir('/w', 'spello', 'porta-venere'), '/w/spello/porta-venere');
  assert.equal(L.outName(3), 'out-v3.png');
  assert.equal(L.agyName('spello', 'sant-andrea', 2), 'place_spello_sant_andrea_v2');
  assert.equal(L.agyName('spello', 'sant-andrea', 2, true), 'place_spello_sant_andrea_v2_r');
  assert.deepEqual(L.SIZES, [64, 128, 256, 512]);
  assert.equal(L.safeKey('porta-venere'), true);
  assert.equal(L.safeKey('../x'), false);
});
test('przystanki trasy: bez praktycznych, numer jak na stronie, nazwy pl/it/en', () => {
  const content = {
    city: { slug: 'spello' },
    city_translations: [{ lang: 'it', title: 'Spello' }],
    stops: [
      { id: 1, stop_key: 'parking-x', category: 'parking', stop_number: 1 },
      { id: 2, stop_key: 'porta-venere', category: 'monument', stop_number: 2, lat: 42.99, lon: 12.67, wiki_article: 'Porta Venere (Spello)' },
      { id: 3, stop_key: 'gelateria', category: 'icecream', stop_number: 3 },
      { id: 4, stop_key: 'sant-andrea', category: 'church', stop_number: 4 },
      { id: 5, stop_key: 'kolacja', category: 'restaurant', stop_number: 5 },
    ],
    stop_translations: [
      { stop_id: 2, lang: 'pl', name: 'Porta Venere', desc_paragraphs: ['Brama z dwiema wieżami.'] },
      { stop_id: 2, lang: 'it', name: 'Porta Venere', desc_paragraphs: ['Porta con due torri.'] },
      { stop_id: 2, lang: 'en', name: 'Venus Gate' },
      { stop_id: 4, lang: 'pl', name: 'Kościół Sant’Andrea' },
    ],
  };
  const s = L.stopsOf(content);
  assert.deepEqual(s.map(x => [x.n, x.key]), [[2, 'porta-venere'], [4, 'sant-andrea']]);
  assert.equal(s[0].name_en, 'Venus Gate'); assert.equal(s[0].city, 'Spello'); assert.equal(s[1].name, 'Kościół Sant’Andrea');
  assert.match(s[0].texts.join(' '), /wieżami/);
});
test('Claude: walidacja wyboru 2 zdjęć', () => {
  assert.deepEqual(L.validatePick({ seen: [1, 2, 3, 4], with_people: [3], pick: [1, 4], reasons: 'front i bok', people_in_picks: false }, 4), { ok: true, pick: [0, 3], reasons: 'front i bok' });
  assert.equal(L.validatePick({ seen: [1, 2, 3, 4], with_people: [4], pick: [1, 4], people_in_picks: false }, 4).ok, false);
  assert.equal(L.validatePick({ seen: [1, 2, 3, 4], pick: [1, 1], people_in_picks: false }, 4).ok, false);
  assert.equal(L.validatePick({ seen: [1, 2, 3, 4], pick: [1, 2], people_in_picks: true }, 4).ok, false);
  assert.equal(L.validatePick({ seen: [1], pick: [1, 2], people_in_picks: false }, 6).noRead, true);
  assert.equal(L.validatePick({ seen: [1, 2], pick: null, reasons: 'wszędzie ludzie' }, 2).none, true);
  const p = L.pickPrompt({ name: 'Porta Venere', name_it: 'Porta Venere', city: 'Spello' }, [{ path: '/w/c01.jpg', title: 'File:A.jpg' }, { path: '/w/c02.jpg', title: 'File:B.jpg' }], 'exterior');
  assert.match(p, /1\. \/w\/c01\.jpg/); assert.match(p, /choćby jedną osobę/);
});
test('prompt generatora: złota godzina, bez ludzi, płaskie tło, kolejność obrazów', () => {
  const st = { name: 'Porta Venere', name_en: 'Venus Gate', city: 'Spello' };
  const p = L.buildPrompt(st);
  assert.match(p, /golden hour/i); assert.match(p, /no shadow on the background/); assert.match(p, /#FF00FF/); assert.match(p, /people or human figures/);
  assert.match(p, /first two images are real photographs/); assert.match(p, /third image is the STYLE/);
  const f = L.buildPrompt(st, { notes: 'wyższe wieże', hasPrev: true });
  assert.match(f, /fourth image is the previous attempt/); assert.match(f, /wyższe wieże/);
  const one = L.buildPrompt(st, { hasPrev: true, photos: 1 });
  assert.match(one, /first image is a real photograph/); assert.match(one, /second image is the STYLE/); assert.match(one, /third image is the previous attempt/);
});
test('Discord: podpis z dwoma źródłami; rejestr źródeł', () => {
  const refs = [{ title: 'File:A.jpg', page: 'https://commons.wikimedia.org/wiki/File:A.jpg', url: 'https://upload/A.jpg', author: 'Jan', license: 'CC BY-SA 4.0', license_url: 'https://cc/4' },
    { title: 'File:B.jpg', page: 'https://commons.wikimedia.org/wiki/File:B.jpg', url: 'https://upload/B.jpg', author: 'Ola', license: 'CC0', license_url: null }];
  const stop = { n: 7, key: 'porta-venere', name: 'Porta Venere', city: 'Spello' };
  const c = L.caption(stop, 'spello', refs, { v: 2 });
  assert.match(c, /\*\*7\. Porta Venere\*\* \(spello\)/); assert.match(c, /File:A\.jpg> — Jan, CC BY-SA 4\.0/); assert.match(c, /ok 7/);
  assert.ok(c.length < 1900);
  const e = L.sourcesEntry({ trip: 'spello', stop, refs, v: 2, version: 5, at: '2026-11-01' });
  assert.equal(e.icons[256], 'media/icons/place-spello-porta-venere-256.webp');
  assert.equal(e.references.length, 2); assert.equal(e.references[1].license, 'CC0');
  const all = L.mergeSources({ 'zz/x': { a: 1 } }, e);
  assert.deepEqual(Object.keys(all), ['spello/porta-venere', 'zz/x']);
});
test('manifest gry: dopisanie klucza do "media" bez duplikatów', () => {
  const m0 = { note: 'x', spello: [], media: { frasassi: [], spello: ['a'] } };
  const m1 = L.addToGameManifest(m0, 'spello', 'porta-venere');
  assert.deepEqual(m1.media.spello, ['a', 'porta-venere']);
  assert.deepEqual(L.addToGameManifest(m1, 'spello', 'porta-venere').media.spello, ['a', 'porta-venere']);
  assert.deepEqual(L.addToGameManifest({}, 'frasassi', 'abbazia').media, { frasassi: ['abbazia'] });
  assert.deepEqual(m0.media.spello, ['a']);
});

// ── wybór referencji przez JP w panelu (2026-10-30) ──
test('licencje: wolne tak, NC/ND/nieznana nie', () => {
  for (const s of ['CC BY-SA 4.0', 'CC BY 2.0', 'CC-BY-SA-3.0', 'CC0', 'Public domain', 'PD-self', 'GFDL', 'FAL', 'Attribution']) assert.equal(L.licenseOk(s), true, s);
  for (const s of ['CC BY-NC 2.0', 'CC BY-NC-SA 4.0', 'CC BY-ND 3.0', 'nieznana', '', null, 'Fair use', 'All rights reserved']) assert.equal(L.licenseOk(s), false, String(s));
});
test('kandydat do panelu: tylko adresy z Commons, krótkie pola', () => {
  const ok = { title: 'File:PV.jpg', thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/PV.jpg/320px-PV.jpg', page: 'https://commons.wikimedia.org/wiki/File:PV.jpg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/PV.jpg', author: 'X'.repeat(300), license: 'CC BY-SA 4.0', width: 4000, height: 3000, score: 5.5 };
  const e = L.candidateEntry(ok);
  assert.equal(e.author.length, 160); assert.equal(e.thumb, ok.thumb); assert.equal(e.width, 4000);
  assert.equal(L.candidateEntry({ ...ok, thumb: 'https://evil.example/x.jpg' }), null);
  assert.ok(L.candidateEntry({ ...ok, thumb: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/PV.jpg/320px-PV.jpg', page: 'https://commons.wikimedia.org/wiki/File%3APV.jpg' }));
  assert.equal(L.candidateEntry({ ...ok, page: 'javascript:alert(1)' }), null);
});
test('wybór JP: tytuły plików znormalizowane, najwyżej 2', () => {
  assert.deepEqual(L.normFiles(['File:A.jpg', 'File:A.jpg', 'File:B.JPG', 'File:C.png']), ['File:A.jpg', 'File:B.JPG']);
  assert.deepEqual(L.normFiles(['A.jpg', 'File:x.svg', 'File:<b>.jpg', 7, null]), []);
  assert.deepEqual(L.normFiles(null), []);
});
test('bramka generowania: wybór JP, automat, czekanie maks. 48 h', () => {
  const t0 = Date.parse('2026-10-30T12:00:00Z');
  const cand = { generated_at: '2026-10-30T12:00:00Z', stops: { a: { candidates: [{ title: 'File:A.jpg' }] }, b: { candidates: [] } } };
  assert.deepEqual(L.iconGate({ sel: { mode: 'pick', files: ['File:A.jpg'] }, cand, key: 'a', now: t0 }), { use: 'pick', files: ['File:A.jpg'] });
  assert.equal(L.iconGate({ sel: { mode: 'auto', files: [] }, cand, key: 'a', now: t0 }).use, 'auto');
  const w = L.iconGate({ sel: null, cand, key: 'a', now: t0 + 3600_000 });
  assert.equal(w.wait, true); assert.equal(w.until, '2026-11-01T12:00:00.000Z');
  assert.equal(L.iconGate({ sel: null, cand, key: 'a', now: t0 + 48 * 3600_000 }).use, 'auto');            // po 48 h automat
  assert.equal(L.iconGate({ sel: null, cand, key: 'b', now: t0 }).use, 'auto');                             // brak kandydatów → automat
  assert.equal(L.iconGate({ sel: null, cand: null, key: 'a', now: t0 }).use, 'auto');                       // brak pliku → jak dotąd
  assert.equal(L.iconGate({ sel: { mode: 'pick', files: ['zly'] }, cand, key: 'a', now: t0 }).wait, true);  // zły wybór = brak wyboru
  assert.equal(L.sameFiles(['File:B.jpg', 'File:A.jpg'], ['File:A.jpg', 'File:B.jpg']), true);
});
test('zlecenie z repo: place-candidates.mjs tylko ze slugiem trasy', async () => {
  const { validateJob } = await import('./repo-jobs.mjs');
  assert.equal(validateJob({ script: 'place-candidates.mjs', args: ['spello'] }), null);
  assert.match(validateJob({ script: 'place-candidates.mjs', args: ['spello', '--dry'] }), /niedozwolone/);
  assert.match(validateJob({ script: 'place-candidates.mjs', args: ['../etc'] }), /niedozwolone/);
  assert.match(validateJob({ script: 'place-candidates.mjs', args: [] }), /niedozwolone/);
});
