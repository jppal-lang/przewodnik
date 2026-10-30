#!/usr/bin/env node
// Uwagi z kontroli przy konkretnym polu (JP 2026-10-30): node --test review-where.test.mjs  (bez AI, bez bazy, bez sieci)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import './review-where.mjs';
const RW = globalThis.ReviewWhere;
const HERE = dirname(fileURLToPath(import.meta.url));

const trip = {
  meta: { city: { slug: 'spello', duration_type: 'half_day' }, stops: [
    { stop_key: 'parking', category: 'parking', price: 'wymaga weryfikacji' },
    { stop_key: 'porta-consolare', category: 'monument', year_built: 'I w. p.n.e.' },
    { stop_key: 'via-borgo-san-sisto', category: 'street' }] },
  content: {
    city: { title: 'Spello', lead: 'Spello jest zbudowane z biało-różowego wapienia z Monte Subasio. Rzymianie nazywali je Hispellum.' },
    stops: {
      parking: { name: 'Parking', desc_paragraphs: ['Płaski parking pod murami.'], local_flavor: 'Infiorata w czerwcu.' },
      'porta-consolare': { name: 'Porta Consolare', desc_paragraphs: ['Brama ma trzy marmurowe posągi z I w. p.n.e. i stary krzew oliwny na szczycie.'], kids_box: 'Policzcie posągi.', local_flavor: null },
      'via-borgo-san-sisto': { name: 'Via Borgo San Sisto', desc_paragraphs: ['Ulica z kwiatami.'], local_flavor: null } },
    day_plan: {} } };
const blocks = { 'porta-consolare': { marked: { curiosity: { text: 'Krzew oliwny rośnie na bramie od XVII wieku [1].' } } } };
const F = RW.fieldsFromTrip(trip, blocks);

test('panel i serwer mają ten sam kod (kopia 1:1)', () => {
  const panel = join(HERE, '..', '..', '..', '_admin', 'review-where.js');
  if (!existsSync(panel)) return;   // na serwerze Hermesa jest tylko bin/
  assert.equal(readFileSync(panel, 'utf8'), readFileSync(join(HERE, 'review-where.mjs'), 'utf8'));
});

test('path z kontroli wygrywa; cytat dokładny podświetla fragment', () => {
  const w = RW.locate({ path: 'content.city_translations.pl.lead', quote: 'z biało-różowego wapienia' }, F);
  assert.equal(w.stop, null); assert.equal(w.field, 'lead'); assert.equal(w.path, 'content.city.lead');
  assert.equal(w.quote, 'z biało-różowego wapienia'); assert.ok(w.exact);
  const b = RW.locate({ stop_key: 'porta-consolare', path: 'content.stops.porta-consolare.curiosity', quote: 'od XVII wieku' }, F);
  assert.equal(b.field, 'curiosity'); assert.equal(b.path, 'blocks.porta-consolare.curiosity');
  const m = RW.locate({ path: 'meta.stops.1.year_built' }, F);
  assert.equal(m.stop, 'porta-consolare'); assert.equal(m.field, 'year_built');
});

test('stara uwaga bez path: cytat → pole, słowa faktu → zdanie (bez AI)', () => {
  const q = RW.locate({ stop_key: 'parking', problem: 'Zasada #10: cena „wymaga weryfikacji” — w treści lepiej „sprawdź na miejscu”.' }, F);
  assert.equal(q.path, 'meta.stops.parking.price');
  const f = RW.locate({ stop_key: null, claim: 'Spello zbudowano z wapienia z Monte Subasio' }, F);
  assert.equal(f.path, 'content.city.lead');
  assert.match(f.quote, /^Spello jest zbudowane/);
  assert.doesNotMatch(f.quote, /Hispellum/);   // jedno zdanie, nie całe pole
});

test('puste pole „we wszystkich przystankach” → pierwszy przystanek z propozycji, polska nazwa w tekście', () => {
  const e = { stop_key: null, problem: 'local_flavor jest pusty we wszystkich przystankach — np. Via Borgo San Sisto (Infiorata).' };
  const w = RW.locate(e, F);
  assert.equal(w.stop, 'via-borgo-san-sisto'); assert.equal(w.field, 'local_flavor');
  assert.equal(RW.humanize(e.problem).startsWith('„Lokalny smaczek (tradycja, święto)” jest pusty'), true);
  assert.equal(RW.humanize('pole content.stops.x.kids_box i `desc_paragraphs`'), 'pole „Misja dla dzieci” i „Opis”');
  const nf = RW.locate({ stop_key: null, problem: 'local_flavor pusty w przystankach' }, F);
  assert.equal(nf.stop, 'porta-consolare');   // bez nazwy: pierwszy przystanek z pustym polem
});

test('uwaga zbiorcza „Fakty bez źródła (n)” → osobne uwagi, indeksy review.w.N.j', () => {
  const rv = { errors: [{ problem: 'Walidator: x' }], warnings: [{ problem: 'Inne' },
    { stop_key: null, problem: 'Fakty bez źródła (2) — potrzebny link do Wikipedii albo strony lokalnej: Spello z wapienia z Monte Subasio; Rzymianie nazywali je Hispellum' }] };
  const ex = RW.expand(rv);
  assert.deepEqual(ex.map(RW.itemId), ['review.e.0', 'review.w.0', 'review.w.1.0', 'review.w.1.1']);
  assert.match(ex[3].e.problem, /Hispellum/);
  const a = RW.annotate(JSON.parse(JSON.stringify(rv)), F);
  assert.equal(a.warnings.length, 3);
  assert.ok(a.warnings.slice(1).every(w => w.path === 'content.city.lead' && !('sub' in w)));
  assert.match(a.warnings[2].quote ?? '', /^$|Hispellum/);   // quote tylko dosłowny (exact) — streszczenie nie jest cytatem
});

test('dane z panelu (content wersji) dają te same ścieżki', () => {
  const content = { city: { duration_type: 'half_day' }, city_translations: [{ lang: 'pl', lead: trip.content.city.lead }],
    stops: [{ id: 1, stop_key: 'parking', stop_number: 1, price: 'wymaga weryfikacji' }],
    stop_translations: [{ stop_id: 1, lang: 'pl', name: 'Parking', local_flavor: 'Infiorata w czerwcu.' }] };
  const P = RW.fieldsFromContent(content);
  assert.equal(RW.locate({ quote: 'Infiorata w czerwcu' }, P).path, 'content.stops.parking.local_flavor');
  assert.equal(RW.locate({ old: 'wymaga weryfikacji' }, P).path, 'meta.stops.parking.price');
});
