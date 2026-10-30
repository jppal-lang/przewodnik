#!/usr/bin/env node
// Testy strażników (bez sieci, bez bazy): sztuczne strony przez wstrzykiwany fetch, magazyn w pamięci, sztuczne AI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as W from './watch-lib.mjs';

const NOW = Date.parse('2026-10-30T10:00:00Z');
const day = (iso) => Date.parse(iso + 'T10:00:00Z');

// ── sztuczna sieć ──────────────────────────────────────────────────────────────────────────────────
function net(pages) {
  const calls = [];
  const fetchFn = async (url, opt = {}) => {
    calls.push(`${opt.method ?? 'GET'} ${url}`);
    const p = typeof pages[url] === 'function' ? pages[url]() : pages[url];
    if (p === undefined) throw Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    const o = typeof p === 'string' ? { status: 200, body: p } : p;
    return { ok: o.status >= 200 && o.status < 300, status: o.status, url: o.final ?? url, headers: { get: () => o.type ?? 'text/html' }, text: async () => o.body ?? '' };
  };
  return { fetchFn, calls };
}
const html = (body) => `<html><head><title>T</title></head><body><nav>menu</nav><main>${body}</main></body></html>`;
function ctxFor({ pages, trips, store = W.memoryStore(), ai = null, now = NOW }) {
  const n = net(pages);
  return { trips, store, get: W.makeGetter(n.fetchFn), fetch: n.fetchFn, ai, aiMax: 3, now, deadline: Date.now() + 60_000, cursor: 0, log: () => {}, touched: new Set(), found: [], calls: n.calls };
}
const stop = (o) => ({ city_slug: 'spello', category: 'museum', sources: [], ...o });
const tripOf = (stops) => [{ city_slug: 'spello', title: 'Spello', stops }];

// ── daty ───────────────────────────────────────────────────────────────────────────────────────────
test('daty włoskie i angielskie, rok domyślny i zakresy', () => {
  const d = (t) => W.parseDates(t, NOW).map(x => x.iso);
  assert.deepEqual(d('Chiuso fino al 15 gennaio 2027.'), ['2027-01-15']);
  assert.deepEqual(d('dal 1° novembre al 31 marzo'), ['2026-11-01', '2027-03-31']);
  assert.deepEqual(d('Closed until March 31, 2027'), ['2027-03-31']);
  assert.deepEqual(d('until 2 Dec'), ['2026-12-02']);
  assert.deepEqual(d('riapertura il 03/02/2027'), ['2027-02-03']);
  assert.deepEqual(d('orario 9.30 - 18.00'), [], 'godziny to nie daty');
  assert.equal(W.endDateNear('Il museo resterà chiuso dal 2 novembre al 20 dicembre per lavori.', 10, NOW), '2026-12-20');
  assert.equal(W.endDateNear('Chiuso per restauro. Riapertura prevista il 1° aprile 2027.', 0, NOW), '2027-04-01');
  assert.equal(W.endDateNear('Chiuso dal 2 novembre per lavori.', 0, NOW), null, 'sama data początku to nie koniec');
});

// ── ceny ───────────────────────────────────────────────────────────────────────────────────────────
test('cena: zmiana z propozycją kodem (intero / ridotto), ta sama, brak danych', () => {
  const page = 'Biglietti: intero € 10,00; ridotto (6-14 anni) € 6,00. Gratuito sotto i 6 anni.';
  const r = W.comparePrice('8 € dorośli, 5 € dzieci 6-14 lat', page);
  assert.equal(r.status, 'changed');
  assert.equal(r.after, '10 € dorośli, 6 € dzieci 6-14 lat');
  assert.ok(r.quote.includes('intero'));
  assert.equal(W.comparePrice('10 € dorośli, 6 € dzieci', page).status, 'same');
  assert.equal(W.comparePrice('8 €', 'Benvenuti nel museo. Orari 9:00-18:00.').status, 'no_data');
  const amb = W.comparePrice('8 €', 'Biglietto: 12 euro per gruppi oltre 20 persone.');
  assert.equal(amb.status, 'changed'); assert.equal(amb.after, null, 'bez „intero” kod nie zgaduje nowej ceny');
});

// ── godziny ────────────────────────────────────────────────────────────────────────────────────────
test('godziny: dzień zamknięcia, zestaw godzin, okres sezonowy z datą powrotu', () => {
  const page = 'Orari di apertura: orario invernale (fino al 31 marzo) 10:00-17:00. Chiuso il lunedì.';
  const r = W.compareHours('9:30-18:00, wtorek zamknięte', page, NOW);
  assert.equal(r.status, 'changed');
  assert.ok(r.days_diff && r.times_diff);
  assert.deepEqual(r.page_closed, [1]);
  assert.equal(r.season.until, '2027-03-31');
  assert.equal(W.compareHours('10:00-17:00, w poniedziałki zamknięte', page, NOW).status, 'same');
  assert.deepEqual(W.closedDaysTrip('pon. zamknięte; nieczynne w niedziele'), [0, 1]);
  assert.deepEqual(W.closedDaysPage('Giorno di chiusura: martedì. Closed on Sundays.'), [0, 2]);
});

// ── zamknięcia ─────────────────────────────────────────────────────────────────────────────────────
test('zamknięcie: trafienie z datą, zamknięcie tygodniowe i święto to nie zamknięcie, ponowne otwarcie', () => {
  const a = W.detectClosure('Avviso. Il museo è chiuso per lavori di restauro fino al 15 gennaio 2027. Ci scusiamo.', NOW);
  assert.equal(a.hit, true); assert.equal(a.strength, 'strong'); assert.equal(a.ends_at, '2027-01-15');
  assert.ok(a.quote.startsWith('Il museo è chiuso per lavori'));
  assert.equal(W.detectClosure('Orari 9-18, chiuso il lunedì.', NOW).hit, false);
  assert.equal(W.detectClosure('Il museo sarà chiuso il 25 dicembre e il 1° gennaio.', NOW).hit, false);
  const r = W.detectClosure('Buone notizie: il museo ha riaperto al pubblico!', NOW);
  assert.equal(r.reopen, true); assert.equal(r.hit, false);
  const past = W.detectClosure('Il museo riaprirà il 2 ottobre 2026 dopo i lavori.', NOW);
  assert.equal(past.reopen, true, '„riapre” z datą w przeszłości = już otwarte');
  // strona gminy: zamknięcie innego miejsca nie dotyczy przystanku
  assert.equal(W.detectClosure('La biblioteca comunale è temporaneamente chiusa.', NOW, { names: ['Villa dei Mosaici'] }).hit, false);
  assert.equal(W.detectClosure('Villa dei Mosaici: chiusura temporanea per manutenzione.', NOW, { names: ['Villa dei Mosaici'] }).hit, true);
  assert.equal(W.detectVenueDead('Trattoria da Mario - chiuso definitivamente dal 2026').hit, true);
});

// ── strażnik cen: znalezisko, deduplikacja, AI potwierdza / odrzuca ───────────────────────────────
test('strażnik cen: jedno znalezisko, drugi przebieg tylko aktualizuje wiersz', async () => {
  const pages = { 'https://villa.example/biglietti': html('<p>Tariffe: biglietto intero € 10, ridotto € 6.</p><p>Orari 10:00-18:00</p>') };
  const trips = tripOf([stop({ stop_key: 'villa', name: 'Villa dei Mosaici', verify_url: 'https://villa.example/biglietti', price: '8 € dorośli, 5 € dzieci', opening_hours: '10:00-18:00' })]);
  const store = W.memoryStore();
  const c1 = ctxFor({ pages, trips, store }); await W.guardPrices(c1);
  assert.equal(store.rows.length, 1);
  const f = store.rows[0];
  assert.equal(f.kind, 'price'); assert.equal(f.status, 'open');
  assert.equal(f.proposal.after, '10 € dorośli, 6 € dzieci');
  assert.equal(f.proposal.url, 'https://villa.example/biglietti');
  assert.equal(c1.found.length, 1);
  const c2 = ctxFor({ pages, trips, store }); await W.guardPrices(c2);
  assert.equal(store.rows.length, 1, 'ten sam problem — bez nowego wiersza');
  assert.equal(store.rows[0].seen_count, 2);
  assert.equal(c2.found.length, 0, 'bez ponownego powiadomienia');
});

test('AI: potwierdza tylko z cytatem z wycinka; „bez zmiany” wstrzymuje znalezisko; limit wywołań', async () => {
  const pages = { 'https://a.example/': html('<p>Biglietto 12 euro per gruppi oltre 20 persone. Singoli 8 euro.</p>') };
  const trips = tripOf([stop({ stop_key: 'a', name: 'A', website: 'https://a.example/', price: '9 €' })]);
  const fake = (resp) => { const calls = []; const f = async (p) => { calls.push(p); return resp; }; f.calls = calls; return f; };
  const good = fake('{"changed": true, "after": "8 €", "quote": "Singoli 8 euro", "seasonal_until": null}');
  const c1 = ctxFor({ pages, trips, ai: good }); await W.guardPrices(c1);
  assert.equal(c1.store.rows[0].proposal.after, '8 €'); assert.equal(c1.store.rows[0].proposal.ai, true);
  const liar = fake('{"changed": true, "after": "7 €", "quote": "Singoli 7 euro", "seasonal_until": null}');
  const c2 = ctxFor({ pages, trips, ai: liar }); await W.guardPrices(c2);
  assert.equal(c2.store.rows[0].proposal.after, null, 'cytat spoza strony — odpowiedź AI ignorowana');
  const no = fake('{"changed": false, "after": null, "quote": "", "seasonal_until": null}');
  const c3 = ctxFor({ pages, trips, ai: no }); await W.guardPrices(c3);
  assert.equal(c3.store.rows.length, 0);
  const c4 = ctxFor({ pages, trips: tripOf([1, 2, 3, 4, 5].map(i => stop({ stop_key: `s${i}`, name: `S${i}`, website: 'https://a.example/', price: '9 €' }))), ai: good });
  c4.aiMax = 2; await W.guardPrices(c4);
  assert.equal(good.calls.length, 1 + 2, 'najwyżej aiMax pytań na przebieg');
  assert.ok(good.calls[0].length < 2500, 'krótkie pytanie');
});

test('godziny sezonowe: recheck_at dzień po końcu okresu', async () => {
  const pages = { 'https://m.example/orari': html('Orari: orario invernale fino al 31 marzo 10:00-16:00, chiuso il lunedì.') };
  const trips = tripOf([stop({ stop_key: 'm', name: 'Museo', verify_url: 'https://m.example/orari', opening_hours: '9:00-19:00' })]);
  const c = ctxFor({ pages, trips }); await W.guardPrices(c);
  const f = c.store.rows.find(r => r.kind === 'hours');
  assert.ok(f); assert.equal(f.recheck_at, '2027-04-01T06:00:00Z'); assert.match(f.title, /sezonowe/);
});

// ── cykl zamknięcie → decyzja → szkic → otwarcie / przeterminowane ────────────────────────────────
const SITE = 'https://museo.example/';
const baseTrip = () => ({
  meta: { city: { slug: 'spello' }, stops: [{ stop_key: 'parking', stop_number: 1, category: 'parking' }, { stop_key: 'museo', stop_number: 2, category: 'museum', verify_url: SITE, sources: [] }, { stop_key: 'gelato', stop_number: 3, category: 'icecream' }],
    day_plan: [{ stop_key: 'parking' }, { stop_key: 'museo' }, { stop_key: 'gelato' }] },
  content: { lang: 'pl', city: { title: 'Spello' }, stops: { parking: { name: 'Parking' }, museo: { name: 'Museo', practical_note: 'Bilety w kasie.' }, gelato: { name: 'Gelato' } }, day_plan: { parking: 'a', museo: 'b', gelato: 'c' } },
});
function decide(store, id, decision, option = null) {   // to samo, co admin.admin_watch_decide (SQL)
  const r = store.rows.find(x => x.id === id);
  const opt = option ?? r.proposal?.recommended ?? 1;
  const fa = (r.proposal?.options ?? []).find(o => o.n === opt)?.false_alarm;
  Object.assign(r, decision === 'accept' && !fa ? { status: 'accepted', decided_option: opt, apply_state: W.PATCH_KINDS.has(r.kind) ? 'pending' : 'none' }
    : decision === 'recheck' ? { status: 'recheck', recheck_at: null } : { status: 'rejected' });
}
function applier(store, trip) {
  const saved = [];
  return { saved, ctx: { store, log: () => {}, loadBase: async () => ({ version: saved.length + 5, trip: saved.at(-1)?.trip ?? trip, review: null }),
    saveDraft: async (city, t, meta) => { saved.push({ trip: t, ...meta }); return { version: saved.length + 5 }; }, costRequest: async () => true } };
}

test('cykl: zamknięcie (dopisek) → szkic → strona mówi „riaperto” → propozycja przywrócenia → szkic bez dopisku', async () => {
  let body = html('<p>Il museo è chiuso per lavori di restauro fino al 15 gennaio 2027.</p>');
  const pages = { [SITE]: () => body };
  const trips = [{ city_slug: 'spello', title: 'Spello', stops: W.stopsOf({ city_slug: 'spello', trip: baseTrip() }) }];
  const store = W.memoryStore();
  await W.guardClosures(ctxFor({ pages, trips, store }));
  const cl = store.rows.find(r => r.kind === 'closure');
  assert.ok(cl); assert.equal(cl.ends_at, '2027-01-15'); assert.equal(cl.proposal.confidence, 'high'); assert.equal(cl.proposal.recommended, 1);
  assert.equal(cl.proposal.options.length, 3);
  decide(store, cl.id, 'accept');
  const A = applier(store, baseTrip());
  const out = await W.applyPending(A.ctx);
  assert.equal(out[0].version, 6);
  const t1 = A.saved[0].trip;
  assert.equal(t1.content.stops.museo.practical_note, 'Tymczasowo zamknięte do 15.01.2027 - sprawdź na miejscu. Bilety w kasie.');
  assert.ok(!/—/.test(t1.content.stops.museo.practical_note), 'bez „—” w tekście dla czytelnika');
  assert.equal(cl.apply_state, 'done'); assert.match(cl.apply_result, /v6.*misja zastępcza/);
  assert.equal(A.saved[0].changes[0].path, 'content.stops.museo.practical_note');
  // tydzień później: wciąż zamknięte — bez nowego znaleziska
  await W.guardTrack(ctxFor({ pages, trips, store, now: day('2026-11-07') }));
  assert.equal(store.rows.length, 1);
  // strona: otwarte ponownie
  body = html('<p>Il museo ha riaperto al pubblico con nuovi orari.</p>');
  const c = ctxFor({ pages, trips, store, now: day('2026-11-15') });
  await W.guardTrack(c);
  const ro = store.rows.find(r => r.kind === 'reopen');
  assert.ok(ro); assert.match(ro.title, /przywrócić przystanek/i); assert.equal(ro.proposal.closure_id, cl.id);
  decide(store, ro.id, 'accept');
  await W.applyPending(A.ctx);
  assert.equal(A.saved[1].trip.content.stops.museo.practical_note, 'Bilety w kasie.');
  assert.equal(cl.status, 'resolved', 'zamknięcie zamknięte po przywróceniu');
});

test('cykl: ukryty przystanek wraca na swoje miejsce po otwarciu', async () => {
  let body = html('<p>Museo temporaneamente chiuso: struttura inagibile.</p>');
  const pages = { [SITE]: () => body };
  const trips = [{ city_slug: 'spello', title: 'Spello', stops: W.stopsOf({ city_slug: 'spello', trip: baseTrip() }) }];
  const store = W.memoryStore();
  await W.guardClosures(ctxFor({ pages, trips, store }));
  const cl = store.rows[0];
  assert.equal(cl.proposal.recommended, 2, 'inagibile bez daty → rekomendacja: ukryj');
  decide(store, cl.id, 'accept');
  const A = applier(store, baseTrip());
  await W.applyPending(A.ctx);
  assert.deepEqual(A.saved[0].trip.meta.stops.map(s => s.stop_key), ['parking', 'gelato']);
  assert.equal(A.saved[0].trip.meta.stops[1].stop_number, 2);
  assert.ok(cl.proposal.snapshot, 'przystanek zapisany do przywrócenia');
  body = html('<p>Orari 9:00-18:00.</p>');   // strona nie mówi już o zamknięciu
  await W.guardTrack(ctxFor({ pages, trips, store, now: day('2026-11-07') }));
  const ro = store.rows.find(r => r.kind === 'reopen');
  decide(store, ro.id, 'accept');
  await W.applyPending(A.ctx);
  const t = A.saved[1].trip;
  assert.deepEqual(t.meta.stops.map(s => s.stop_key), ['parking', 'museo', 'gelato']);
  assert.equal(t.content.stops.museo.name, 'Museo'); assert.equal(t.content.day_plan.museo, 'b');
  assert.deepEqual(t.meta.day_plan.map(d => d.stop_key), ['parking', 'museo', 'gelato']);
});

test('cykl: data końca minęła bez potwierdzenia → closure_overdue, który nie znika sam; sprawdzenie w dniu końca i dzień po', async () => {
  const body = html('<p>Il museo è chiuso per lavori fino al 15 novembre 2026.</p>');
  const pages = { [SITE]: () => body };
  const trips = [{ city_slug: 'spello', title: 'Spello', stops: W.stopsOf({ city_slug: 'spello', trip: baseTrip() }) }];
  const store = W.memoryStore();
  await W.guardClosures(ctxFor({ pages, trips, store }));
  const cl = store.rows[0]; decide(store, cl.id, 'accept'); await W.applyPending(applier(store, baseTrip()).ctx);
  cl.last_checked_at = '2026-11-14T10:00:00Z';
  assert.equal(W.closureDue(cl, day('2026-11-15')), true, 'dzień końca');
  assert.equal(W.closureDue({ ...cl, last_checked_at: '2026-11-15T10:00:00Z' }, day('2026-11-16')), true, 'dzień po');
  assert.equal(W.closureDue({ ...cl, last_checked_at: '2026-11-16T10:00:00Z' }, day('2026-11-18')), false, 'potem znowu co tydzień');
  await W.guardTrack(ctxFor({ pages, trips, store, now: day('2026-11-15') }));
  assert.equal(store.rows.filter(r => r.kind === 'closure_overdue').length, 0, 'w dniu końca jeszcze nie przeterminowane');
  await W.guardTrack(ctxFor({ pages, trips, store, now: day('2026-11-16') }));
  const od = store.rows.filter(r => r.kind === 'closure_overdue');
  assert.equal(od.length, 1); assert.equal(od[0].status, 'open'); assert.match(od[0].title, /minęła data końca/);
  // kolejne sprawdzenia: ten sam wiersz, wciąż otwarty — nawet gdy strona potem mówi o otwarciu
  await W.guardTrack(ctxFor({ pages, trips, store, now: day('2026-11-23') }));
  pages[SITE] = () => html('<p>Il museo ha riaperto.</p>');
  await W.guardTrack(ctxFor({ pages, trips, store, now: day('2026-11-30') }));
  const od2 = store.rows.filter(r => r.kind === 'closure_overdue');
  assert.equal(od2.length, 1); assert.equal(od2[0].status, 'open', 'przeterminowane nie znika samo'); assert.ok(od2[0].seen_count >= 2);
  assert.ok(store.rows.some(r => r.kind === 'reopen'), 'otwarcie zgłoszone osobno');
});

test('zamknięcie bez decyzji JP: strona już nie mówi o zamknięciu → samo się rozwiązuje (bez szumu)', async () => {
  let body = html('<p>Temporarily closed for renovation until 20 November 2026.</p>');
  const pages = { [SITE]: () => body };
  const trips = [{ city_slug: 'spello', title: 'Spello', stops: W.stopsOf({ city_slug: 'spello', trip: baseTrip() }) }];
  const store = W.memoryStore();
  await W.guardClosures(ctxFor({ pages, trips, store }));
  body = html('<p>Opening hours 9:00-18:00.</p>');
  await W.guardTrack(ctxFor({ pages, trips, store, now: day('2026-11-07') }));
  assert.equal(store.rows[0].status, 'resolved'); assert.equal(store.rows.length, 1);
});

test('fałszywy alarm (opcja 3) = odrzucenie, ponowne trafienie nie otwiera wiersza', async () => {
  const pages = { [SITE]: html('<p>Il museo è chiuso per lavori fino al 15 gennaio 2027.</p>') };
  const trips = [{ city_slug: 'spello', title: 'Spello', stops: W.stopsOf({ city_slug: 'spello', trip: baseTrip() }) }];
  const store = W.memoryStore();
  await W.guardClosures(ctxFor({ pages, trips, store }));
  decide(store, 1, 'accept', 3);
  assert.equal(store.rows[0].status, 'rejected');
  const c = ctxFor({ pages, trips, store }); await W.guardClosures(c);
  assert.equal(store.rows[0].status, 'rejected'); assert.equal(c.found.length, 0);
});

// ── cena przyjęta → szkic ──────────────────────────────────────────────────────────────────────────
test('przyjęta cena: podmiana kodem + źródło; bez nowej wartości → usunięcie i „sprawdź na miejscu”', () => {
  const t = { meta: { stops: [{ stop_key: 'm', price: '8 €', price_status: 'confirmed', sources: [] }] }, content: { stops: { m: { name: 'M' } } } };
  const f = { id: 7, kind: 'price', stop_key: 'm', title: 'x', url: 'https://m.example/', quote: 'intero € 10', proposal: { after: '10 €', recommended: 1 } };
  const r = W.applyFinding(t, f);
  assert.equal(r.trip.meta.stops[0].price, '10 €'); assert.deepEqual(r.trip.meta.stops[0].sources, ['https://m.example/']);
  assert.equal(r.changes[0].before, '8 €'); assert.match(r.changes[0].why, /strażnik #7/);
  assert.equal(t.meta.stops[0].price, '8 €', 'wejście bez zmian');
  const r2 = W.applyFinding(t, { ...f, proposal: { after: null } });
  assert.equal(r2.trip.meta.stops[0].price, null); assert.equal(r2.trip.meta.stops[0].price_status, 'unverified');
});

// ── linki ──────────────────────────────────────────────────────────────────────────────────────────
test('linki: 404, przekierowanie na inną domenę, podstrona → główna; chwilowy błąd dopiero drugi raz', async () => {
  const pages = {
    'https://ok.example/a': 'ok',
    'https://dead.example/x': { status: 404 },
    'https://old.example/page': { status: 200, final: 'https://parking-domain.example/' },
    'https://site.example/sub/page': { status: 200, final: 'https://site.example/' },
    'https://www.same.example/p': { status: 200, final: 'https://same.example/p' },
  };
  const trips = tripOf([stop({ stop_key: 's', name: 'S', verify_url: 'https://ok.example/a', website: 'https://dead.example/x',
    sources: ['https://old.example/page', 'https://site.example/sub/page', 'https://www.same.example/p', 'https://down.example/'] })]);
  const recorded = [];
  const c = ctxFor({ pages, trips }); c.recordLink = async (u, r) => recorded.push([u, r.status]); c.prevLinkBad = async (u) => false;
  await W.guardLinks(c);
  const types = c.store.rows.map(r => r.proposal.type).sort();
  assert.deepEqual(types, ['dead', 'home', 'moved']);
  assert.equal(recorded.length, 6, 'wynik w link_checks');
  const c2 = ctxFor({ pages, trips, store: c.store }); c2.prevLinkBad = async (u) => u === 'https://down.example/';
  await W.guardLinks(c2);
  assert.ok(c.store.rows.some(r => r.proposal.type === 'down'));
  assert.equal(c.store.rows.length, 4);
});

// ── lokale ─────────────────────────────────────────────────────────────────────────────────────────
test('lokale: „chiuso definitivamente” i status Google; przyjęcie usuwa lokal i prosi o zgodę na AI (zamiennik)', async () => {
  const pages = { 'https://trattoria.example/': html('<p>Dopo 40 anni la trattoria ha chiuso i battenti. Cessata attività.</p>') };
  const trips = tripOf([stop({ stop_key: 'trattoria', name: 'Trattoria', category: 'restaurant', website: 'https://trattoria.example/' }),
    stop({ stop_key: 'bar', name: 'Bar', category: 'cafe', website: 'https://bar.example/' })]);
  const c = ctxFor({ pages, trips }); c.gastroStatus = async () => null;
  await W.guardVenues(c);
  const v = c.store.rows.find(r => r.stop_key === 'trattoria');
  assert.equal(v.kind, 'venue'); assert.equal(v.proposal.recommended, 1);
  assert.equal(c.store.rows.find(r => r.stop_key === 'bar').proposal.recommended, 2, 'sama niedziałająca strona — słaby sygnał');
  const t = { meta: { stops: [{ stop_key: 'p' }, { stop_key: 'trattoria' }] }, content: { stops: { p: {}, trattoria: { name: 'T' } } } };
  const r = W.applyFinding(t, { ...v, decided_option: 1 });
  assert.deepEqual(r.trip.meta.stops.map(s => s.stop_key), ['p']); assert.match(r.needsAi, /zamiennik/);
});

// ── sezon, ponowne sprawdzenie ─────────────────────────────────────────────────────────────────────
test('sezon: znalezisko dla tras z godzinami sezonowymi + strażnik cen dla tych przystanków', async () => {
  const pages = { 'https://r.example/': html('Orari: 10:00-17:00, chiuso il lunedì.') };
  const trips = tripOf([stop({ stop_key: 'r', name: 'Rocca', verify_url: 'https://r.example/', opening_hours: 'latem 10:00-19:00, zimą 10:00-17:00' }),
    stop({ stop_key: 'x', name: 'X', verify_url: 'https://x.example/', opening_hours: '9:00-18:00' })]);
  const c = ctxFor({ pages, trips }); await W.guardSeason(c, { period: '2027-03' });
  const s = c.store.rows.find(r => r.kind === 'season');
  assert.ok(s); assert.deepEqual(s.proposal.stops, ['r']);
  assert.ok(c.calls.some(u => u.includes('r.example')) && !c.calls.some(u => u.includes('x.example')), 'ceny tylko dla sezonowych');
  assert.ok(c.store.rows.some(r => r.kind === 'hours' && r.stop_key === 'r'));
});

test('ponowne sprawdzenie (decyzja JP): problem zniknął → resolved; nadal jest → open', async () => {
  let body = html('<p>Tariffe: intero € 10.</p>');
  const pages = { 'https://p.example/': () => body };
  const trips = tripOf([stop({ stop_key: 'p', name: 'P', verify_url: 'https://p.example/', price: '8 €' })]);
  const store = W.memoryStore();
  await W.guardPrices(ctxFor({ pages, trips, store }));
  decide(store, 1, 'recheck');
  await W.guardRecheck(ctxFor({ pages, trips, store }));
  assert.equal(store.rows[0].status, 'open');
  decide(store, 1, 'recheck');
  body = html('<p>Tariffe: intero € 8.</p>');
  await W.guardRecheck(ctxFor({ pages, trips, store }));
  assert.equal(store.rows[0].status, 'resolved');
});

// ── strona ─────────────────────────────────────────────────────────────────────────────────────────
test('strona: sitemap, błąd SSR, strona miasta bez listy, zły adres zwraca 200', async () => {
  const S = 'https://q.example';
  const ok = '<html><head><title>Q</title></head><body><h1>x</h1><ol class="ssr-stops"></ol></body></html>';
  const pages = new Proxy({
    [`${S}/sitemap.xml`]: { status: 200, type: 'application/xml', body: `<urlset><url><loc>${S}/pl/it/umbria/spello/</loc></url><url><loc>${S}/en/it/umbria/assisi/</loc></url></urlset>` },
    [`${S}/pl/it/umbria/spello/`]: ok,
    [`${S}/en/it/umbria/assisi/`]: { status: 200, body: '<html><title>A</title><p>Chwilowy problem — spróbuj za moment.</p></html>' },
    [`${S}/`]: ok, [`${S}/konto.html`]: ok, [`${S}/zaloguj.html`]: ok, [`${S}/kontakt.html`]: ok, [`${S}/gra/`]: { status: 500, body: '' },
  }, { get: (o, k) => k in o ? o[k] : String(k).includes('nie-ma-takiej-strony') ? ok : undefined });
  const c = ctxFor({ pages, trips: [] });
  const r = await W.guardSite(c, { site: S });
  const types = c.store.rows.map(x => x.proposal.type).sort();
  assert.deepEqual(types, ['404', 'city', 'ssr', 'status']);
  assert.equal(r.problems, 4);
});

// ── koszty ─────────────────────────────────────────────────────────────────────────────────────────
test('koszty: próg dzienny USD i skok 3× średniej; powiadomienie raz', async () => {
  const sent = [];
  const c = ctxFor({ pages: {}, trips: [] });
  c.usage = async () => ({ usd24: 1.4, equiv24: 9, equivDays: [1, 2, 1.5, 2, 1, 2, 1.5], top: 'trip-review ($6)' });
  c.notify = async (t) => sent.push(t);
  await W.guardCosts(c, { threshold: 1 });
  assert.deepEqual(c.store.rows.map(r => r.proposal.type).sort(), ['equiv', 'usd']);
  assert.equal(sent.length, 2);
  await W.guardCosts(c, { threshold: 1 });
  assert.equal(sent.length, 2, 'ten sam dzień — bez drugiego alarmu');
  const c2 = ctxFor({ pages: {}, trips: [] }); c2.usage = async () => ({ usd24: 0.2, equiv24: 0.3, equivDays: [0, 0, 0, 0, 0, 0, 0.05] });
  await W.guardCosts(c2, { threshold: 1 });
  assert.equal(c2.store.rows.length, 0);
});

// ── harmonogram ────────────────────────────────────────────────────────────────────────────────────
test('harmonogram: jeden okres = jeden przebieg, dzień tygodnia i godzina, przerwany przebieg ma pierwszeństwo', () => {
  const mon4 = Date.parse('2026-11-02T03:30:00Z');   // pon. 4:30 czasu polskiego
  const due = W.dueGuards({ last: {} }, {}, mon4);
  assert.deepEqual(due, ['season', 'prices', 'venues'], 'koszty od 7:00, track/recheck od 5:00, closures we wtorek; lokale 2. dnia miesiąca');
  const L = W.localParts(mon4);
  const st = { last: { season: { period: W.periodOf({ every: 'season' }, L) }, prices: { period: W.periodOf({ every: 'week' }, L) }, venues: { period: W.periodOf({ every: 'month' }, L) } } };
  assert.deepEqual(W.dueGuards(st, {}, mon4), []);
  assert.deepEqual(W.dueGuards({ ...st, cursor: { links: 12 } }, {}, mon4), ['links']);
  assert.deepEqual(W.dueGuards({ last: {} }, { prices: { off: true }, season: { off: true }, venues: { off: true } }, mon4), []);
  assert.equal(W.periodOf({ every: 'season' }, W.localParts(Date.parse('2027-02-10T12:00:00Z'))), '2026-10');
  assert.equal(W.periodOf({ every: 'week' }, W.localParts(Date.parse('2026-11-05T12:00:00Z'))), 'w2026-11-02');
});
