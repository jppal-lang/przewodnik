#!/usr/bin/env node
// Testy meldunku „Dziś” (today-brief.mjs) i stanu na żywo (live-status.mjs): node --test today-brief.test.mjs — bez sieci, bez bazy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { factsFrom, hashFacts, autoBrief, validateAi, mergeAi, statusLine, aiPrompt, MAX_ITEMS } from './today-brief.mjs';
import { createLive, tailOf, textFrom } from './live-status.mjs';

const NOW = Date.parse('2026-10-31T10:00:00Z');
const iso = (minAgo) => new Date(NOW - minAgo * 60000).toISOString();
const snap = () => ({
  versions: {
    rows: [
      { city_slug: 'frasassi', version: 5, status: 'draft', created_at: iso(20), errors: 3, warnings: 12, verdict: 'fix' },
      { city_slug: 'spello', version: 3, status: 'published', created_at: iso(3000), published_at: iso(90) },
      { city_slug: 'urbino', version: 2, status: 'published', created_at: iso(9000), published_at: iso(9000) }
    ],
    revisions: { requests: [
      { id: 12, city_slug: 'spello', city_version: 2, status: 'done', result_version: 3, comments: 4, verify: { ready: true, applied: 4, total: 4, checked_at: iso(100) }, updated_at: iso(100) },
      { id: 13, city_slug: 'gubbio', city_version: 1, status: 'new', comments: 2, created_at: iso(5), updated_at: iso(5) },
      { id: 11, city_slug: 'urbino', city_version: 1, status: 'failed', comments: 1, reply: 'Antigravity bez odpowiedzi', updated_at: iso(600) }
    ] }
  },
  queue: {
    open: [{ id: 9, city_slug: 'assisi', kind: 'translate', status: 'running', result: 'cs, hu gotowe', created_at: iso(22) }],
    failed_7d: [{ id: 8, city_slug: 'urbino', kind: 'translate', result: 'cs: tłumaczenie ucięte', finished_at: iso(300) }],
    recent: [{ id: 7, city_slug: 'todi', kind: 'draft', status: 'done', result: 'v1 · https://admin', finished_at: iso(200) }],
    pipeline: [{ run_id: 'r1', city_slug: 'gubbio', kind: 'draft', stage: 3, stop_k: 4, stops_n: 9, message: 'gubbio: ③ bloki 4 Palazzo dei Consoli', status: 'running', created_at: iso(2) }],
    usage_24h: [{ provider: 'gemini', billing: 'abonament', calls: 12, usd: 0, usd_equiv: 0.42 }, { provider: 'openrouter', billing: 'api', calls: 2, usd: 0.03, usd_equiv: 0.03 }],
    agyQuotaOut: null, agyWeekCalls: 61, agyAlert: { lvl: 0 }
  },
  jobs: { registry: [{ name: '2026-10-31-spello-watch-prices', status: 'done', result: 'prices: 6 ustaleń', finished_at: iso(150) }, { name: '2026-10-31-frasassi-pytania', status: 'later', result: 'Resets in 2h14m', finished_at: iso(90) }] },
  deploy: { last_message: '2026-10-31 08:10 UTC\n✅ zatwierdzone i wdrożone: d6933f0 Uwagi z panelu', last_message_at: iso(110), waiting_for_jp: false },
  watch: { open_by_kind: [{ kind: 'prices', open: 2, recheck: 0, to_apply: 1, apply_failed: 0 }, { kind: 'link', open: 1 }], newest: [{ updated_at: iso(140) }] }
});
const extra = () => ({ now: NOW, names: { frasassi: 'Frasassi', spello: 'Spello' }, deploys: [{ id: 3, files: ['_content/claude-skills/sql/2026-10-31-admin-ops-status.sql'], created_at: iso(30) }],
  costs: [{ id: 2, title: 'Tłumaczenie Gubbio na 16 języków', est_usd: 1.2, created_at: iso(40) }], icons: [{ trip: 'spello', stops: 3, deadline: iso(-600), generated_at: iso(2280) }] });

test('fakty: każdy ma id, zdanie, link do panelu i rodzaj; kolejność todo → warn → wait → done', () => {
  const F = factsFrom(snap(), extra());
  assert.ok(F.length >= 12, `za mało faktów: ${F.length}`);
  for (const f of F) {
    assert.match(f.id, /^[a-z]+:/); assert.match(f.href, /^#\//); assert.ok(['todo', 'warn', 'wait', 'done', 'info'].includes(f.kind), f.kind);
    assert.ok(f.text.length > 10 && f.text.length < 240, f.text); assert.ok(!/!/.test(f.text), 'bez wykrzykników');
  }
  const kinds = F.map(f => f.kind), order = { todo: 0, warn: 1, wait: 2, done: 3, info: 4 };
  for (let i = 1; i < kinds.length; i++) assert.ok(order[kinds[i]] >= order[kinds[i - 1]], `kolejność: ${kinds.join(',')}`);
  const by = Object.fromEntries(F.map(f => [f.id, f]));
  assert.equal(by['draft:frasassi:5'].kind, 'todo'); assert.equal(by['draft:frasassi:5'].href, '#/frasassi/v5'); assert.match(by['draft:frasassi:5'].text, /Frasassi v5 .*3 uwagi/);
  assert.equal(by['pub:spello:3'].kind, 'done'); assert.ok(!by['pub:urbino:2'], 'stara publikacja nie wchodzi');
  assert.equal(by['rev:12'].kind, 'todo'); assert.match(by['rev:12'].text, /gotowa do akceptacji \(4 z 4/); assert.equal(by['rev:12'].href, '#/spello/v3');
  assert.equal(by['rev:13'].kind, 'wait'); assert.match(by['rev:13'].text, /2 uwagi do Gubbio v1 czeka/);
  assert.equal(by['rev:11'].kind, 'warn');
  assert.equal(by['job:9'].kind, 'wait'); assert.equal(by['jobfail:8'].kind, 'warn'); assert.equal(by['jobdone:7'].href, '#/todi/v1');
  assert.match(by['run:r1'].text, /Hermes pisze Gubbio, przystanek 4 z 9/);
  assert.equal(by['repo:2026-10-31-frasassi-pytania'].kind, 'wait'); assert.match(by['repo:2026-10-31-frasassi-pytania'].text, /po odnowieniu limitu/);
  assert.match(by['deploy:3'].text, /2026-10-31-admin-ops-status.sql/); assert.equal(by['deploy:3'].href, '#/decyzje');
  assert.match(by['deploy:last'].text, /^Wdrożono: d6933f0/);
  assert.match(by['cost:2'].text, /1\.20 \$/);
  assert.match(by['watch:open'].text, /3 ustalenia strażników czekają .*ceny 2, linki 1/); assert.equal(by['watch:apply'].kind, 'wait');
  assert.equal(by['icon:spello'].kind, 'todo'); assert.match(by['icon:spello'].text, /3 przystanki czekają/);
});

test('hash zależy od faktów, nie od godziny; limit Antigravity zmienia fakty', () => {
  const a = hashFacts(factsFrom(snap(), extra())), b = hashFacts(factsFrom(snap(), { ...extra(), now: NOW + 5 * 60000 }));
  assert.equal(a, b);
  const s2 = snap(); s2.queue.agyQuotaOut = new Date(NOW + 3600000).toISOString();
  const F2 = factsFrom(s2, extra());
  assert.notEqual(hashFacts(F2), a); assert.ok(F2.some(f => f.id === 'agy:out' && f.kind === 'warn'));
});

test('tryb auto: zdania z szablonów, najwyżej MAX_ITEMS, powitanie i linia stanu', () => {
  const F = factsFrom(snap(), extra()), B = autoBrief(F, snap(), NOW);
  assert.equal(B.mode, 'auto'); assert.ok(B.items.length <= MAX_ITEMS && B.items.length >= 5);
  assert.match(B.greeting, /Janie/); assert.match(B.summary, /czeka/);
  assert.match(B.status, /^stan: Antigravity dostępny \(61 wywołań w 7 dni\) · koszty 24 h: 0\.03 \$ zapłacone, 0\.45 \$ ekwiwalentu\.$/);
  for (const it of B.items) assert.ok(F.some(f => f.id === it.id && f.href === it.href && f.text === it.text));
  const E = autoBrief([], {}, NOW); assert.equal(E.items.length, 0); assert.match(E.summary, /Spokojnie/);
  assert.match(statusLine({ queue: { agyQuotaOut: new Date(NOW + 7200000).toISOString() } }, NOW), /Antigravity wraca/);
});

test('odpowiedź AI: zdania bez pokrycia (obce id, liczby spoza faktu, linki) odpadają, reszta dostaje link i rodzaj z faktu', () => {
  const F = factsFrom(snap(), extra());
  const ai = { items: [
    { id: 'draft:frasassi:5', text: 'Frasassi v5 czeka na Ciebie, kontrola znalazła 3 uwagi!' },
    { id: 'draft:frasassi:5', text: 'duplikat' },
    { id: 'rev:12', text: 'Spello v3 po poprawkach jest gotowa, 4 z 4 uwag na miejscu' },
    { id: 'rev:13', text: 'Gubbio: 7 uwag w kolejce' },                     // 7 nie ma w fakcie
    { id: 'zmyslone:1', text: 'Perugia opublikowana' },
    { id: 'job:9', text: 'Szczegóły: https://example.org' },
    { id: 'cost:2', text: 'Za krótkie' }
  ], summary: 'Trzy sprawy czekają na Ciebie, jedna wymaga uwagi.' };
  const V = validateAi(ai, F);
  assert.deepEqual(V.items.map(i => i.id), ['draft:frasassi:5', 'rev:12']);
  assert.equal(V.items[0].text, 'Frasassi v5 czeka na Ciebie, kontrola znalazła 3 uwagi.');
  assert.equal(V.items[0].href, '#/frasassi/v5'); assert.equal(V.items[0].kind, 'todo');
  assert.equal(V.items[1].text, 'Spello v3 po poprawkach jest gotowa, 4 z 4 uwag na miejscu.');
  assert.equal(V.summary, 'Trzy sprawy czekają na Ciebie, jedna wymaga uwagi.');
  const M = mergeAi(V, F, snap(), NOW);
  assert.equal(M.mode, 'ai'); assert.ok(M.items.length >= 5); assert.equal(M.items.filter(i => i.id === 'draft:frasassi:5').length, 1);
  assert.ok(M.items.some(i => i.id === 'rev:13' && i.text === F.find(f => f.id === 'rev:13').text), 'odrzucone zdanie wraca jako szablon');
  assert.equal(mergeAi(validateAi({ items: [] }, F), F, snap(), NOW).mode, 'auto');
  assert.equal(validateAi({ items: [{ id: 'rev:13', text: 'ok' }], summary: 'Zrobione 99 rzeczy' }, F).summary, '');
  assert.match(aiPrompt(F), /nie dodawaj ŻADNYCH faktów/i); assert.ok(aiPrompt(F).includes('draft:frasassi:5 · todo ·'));
});

test('live: końcówka tekstu oczyszczona i bez sekretów; pole z odpowiedzi modelu; zapis co ≤ 10 s, zmiana etapu od razu, koniec = idle', async () => {
  const sc = tailOf('a\\nb   c\n\nd  Authorization: Bearer abc.def.ghi-123456 koniec'); assert.ok(sc.startsWith('a b c d ') && sc.includes('[ukryte]') && !sc.includes('abc.def'), sc);
  const long = tailOf('x'.repeat(50) + ' ' + 'słowo '.repeat(200), 100); assert.ok(long.length <= 100 && long.startsWith('słowo'));
  const t = textFrom({ marked: { desc_paragraphs: ['Pierwszy akapit opisu przystanku.', 'Drugi akapit z faktem [1].'], legend: { text: 'Legenda o smoku, który mieszkał w jaskini pod zamkiem.' } }, sources: [] });
  assert.equal(t.field, 'legend'); assert.equal(t.field_label_pl, 'Legenda'); assert.match(t.text_tail, /smoku/);
  assert.equal(textFrom({ meta: { stops: [{ stop_key: 'a' }] } }), null);
  let clock = 0, writes = [];
  const q = async (sql, p) => { writes.push(JSON.parse(p[0])); return []; };
  const L = createLive({ q, trip: 'gubbio', worker: 'Antigravity', every: 10000, now: () => clock });
  await L.set({ stage: 3, stop_total: 9 });                       // zmiana etapu: od razu
  assert.equal(writes.length, 1); assert.equal(writes[0].stage_label_pl, 'Bloki przystanków'); assert.equal(writes[0].status, 'running');
  clock = 2000; L.set({ message: 'krok' }); L.set({ message: 'krok 2' });   // w oknie 10 s: odłożone
  assert.equal(writes.length, 1); assert.equal(L.pending(), true);
  clock = 4000; await L.set({ stop_key: 'n-palazzo', stop_n: 4 });  // nowy przystanek: od razu
  assert.equal(writes.length, 2); assert.equal(writes[1].stop_key, 'n-palazzo'); assert.equal(writes[1].message, 'krok 2');
  await L.text({ marked: { desc_paragraphs: ['Pałac konsulów stoi przy placu od XIV wieku i góruje nad miastem.'] } });
  assert.equal(writes.length, 3); assert.equal(writes[2].field, 'desc_paragraphs'); assert.match(writes[2].text_tail, /konsulów/);
  await L.flags(2); await L.flags(1); assert.equal(L.state.flags_found, 3);
  await L.end({ status: 'done', version: 6, label: 'v6' });
  const last = writes[writes.length - 1];
  assert.equal(last.status, 'idle'); assert.equal(last.last.trip, 'gubbio'); assert.equal(last.last.version, 6); assert.equal(last.last.status, 'done');
  const n = writes.length; await L.set({ stage: 5 }); assert.equal(writes.length, n, 'po końcu nic nie pisze');
  const bad = createLive({ q: async () => { throw new Error('baza'); }, trip: 'x', now: () => 0 });
  await bad.set({ stage: 1 }); await bad.end();                   // błąd bazy nie wywraca przebiegu
});
