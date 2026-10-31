#!/usr/bin/env node
// Weryfikacja naniesienia uwag JP (verify-revision*.mjs, JP 2026-10-31): część deterministyczna, scalenie odpowiedzi AI, walidator,
// meldunek, wykrywanie braku kolumn (kod przed SQL), ponowna runda. Bez AI (atrapa ask), bez bazy (atrapa q), bez sieci:
//   node --test verify-revision.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import * as V from './verify-revision-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PY = join(HERE, '..', 'quolino-trip-writing', 'scripts', 'validate_trip.py');
const GOLD = (() => { const g = JSON.parse(readFileSync(join(HERE, '..', 'test', 'golden', 'frasassi.trip.json'), 'utf8')); delete g._golden; return g; })();
const clone = (o) => JSON.parse(JSON.stringify(o));
const K = 'grotte-frasassi', K2 = 'abbazia-san-vittore';
const row = (version, label, mut = null, review = null) => { const t = clone(GOLD); mut?.(t); return { version, trip: t, content: { label }, review }; };
const HINT = 'Nowa podpowiedź: szukajcie stalaktytu w kształcie organów.';

test('deterministycznie: pole bez zmian → nie naniesiona, zmienione → wstępnie naniesiona (do oceny AI), cytat po zmianie', () => {
  const b = row(3, 'v3f'), n = row(4, 'v3g', t => { t.content.stops[K].hint = HINT; });
  const Fb = V.fieldsOf(b), Fn = V.fieldsOf(n);
  const x1 = V.deterministic({ id: 1, stop_key: K, field: 'hint', body: 'Zmień podpowiedź' }, Fb, Fn, null);
  assert.equal(x1.status, 'applied'); assert.equal(x1.ai, true); assert.equal(x1.quote, HINT);
  assert.equal(x1.where, 'Grotte di Frasassi · Podpowiedź');
  const x2 = V.deterministic({ id: 2, stop_key: K, field: 'kids_box', body: 'Krótsza misja' }, Fb, Fn, null);
  assert.equal(x2.status, 'missing'); assert.equal(x2.ai, false); assert.match(x2.note, /Misja dla dzieci” bez zmian/);
  const x3 = V.deterministic({ id: 3, stop_key: null, field: 'lead', body: 'Wstęp za długi' }, Fb, Fn, null);
  assert.equal(x3.status, 'missing'); assert.equal(x3.where, 'miasto · Wstęp miasta');
  const x4 = V.deterministic({ id: 4, stop_key: null, field: null, body: 'Ogólnie: krócej' }, Fb, Fn, null);   // cała wycieczka
  assert.equal(x4.status, 'applied'); assert.equal(x4.ai, true);
});

test('deterministycznie: przystanek/pole usunięte → nie dotyczy już; „✗ Zostaw” → naniesiona', () => {
  const b = row(3, 'v3f'), n = row(4, 'v3g', t => { t.meta.stops = t.meta.stops.filter(s => s.stop_key !== K2); delete t.content.stops[K2]; delete t.meta.stops[0].price; });
  const Fb = V.fieldsOf(b), Fn = V.fieldsOf(n);
  assert.equal(V.deterministic({ id: 1, stop_key: K2, field: 'desc_paragraphs', body: 'Dopisz o krypcie' }, Fb, Fn, null).status, 'stale');
  const parking = b.trip.meta.stops[0];
  if ('price' in parking) assert.equal(V.deterministic({ id: 2, stop_key: parking.stop_key, field: 'price', body: 'Cena?' }, Fb, Fn, null).status, 'stale');
  const rv = { errors: [{ problem: 'Za długie', path: `content.stops.${K}.hint`, old: 'Stalaktyt wisi z sufitu', new: 'Stalaktyt zwisa' }] };
  const z = V.deterministic({ id: 3, field: 'review.e.0', body: '✗ Zostaw' }, Fb, Fn, rv);
  assert.equal(z.status, 'applied'); assert.match(z.note, /zostaw/);
});

test('pytania z kontroli: „✓” sprawdzane dosłownie (stare znika, nowe jest), „✂” — fragment nadal jest → nie naniesiona', () => {
  const old = 'Stalaktyt wisi z sufitu', neu = 'Stalaktyt zwisa ze sklepienia';
  const rv = { errors: [{ problem: 'Styl', path: `content.stops.${K}.hint`, old, new: neu }], warnings: [{ problem: 'Zbędne', path: `content.stops.${K}.hint`, quote: 'Patrzcie tam' }] };
  const b = row(3, 'v3f', null, rv);
  const ok = row(4, 'v3g', t => { t.content.stops[K].hint = t.content.stops[K].hint.replace(old, neu); });
  const Fb = V.fieldsOf(b), Fo = V.fieldsOf(ok);
  const a = V.deterministic({ id: 1, field: 'review.e.0', body: '✓ Popraw według propozycji' }, Fb, Fo, rv);
  assert.equal(a.status, 'applied'); assert.equal(a.ai, false); assert.equal(a.quote, neu);
  const m = V.deterministic({ id: 2, field: 'review.e.0', body: '✓ Popraw według propozycji' }, Fb, V.fieldsOf(row(4, 'v3g')), rv);
  assert.equal(m.status, 'missing');
  const cutOk = V.deterministic({ id: 3, field: 'review.w.0', body: '✂ Usuń fragment' }, Fb, Fo, rv);
  assert.equal(cutOk.status, 'missing'); assert.match(cutOk.note, /nadal jest/);
  const gone = row(5, 'v3h', t => { t.content.stops[K].hint = 'Stalaktyt wisi z sufitu, stalagmit rośnie z podłogi.'; });
  assert.equal(V.deterministic({ id: 4, field: 'review.w.0', body: '✂ Usuń fragment' }, Fb, V.fieldsOf(gone), rv).status, 'applied');
});

test('changeQuote: najwyżej 160 znaków, od miejsca zmiany', () => {
  const before = 'A'.repeat(300) + ' koniec.', after = 'A'.repeat(300) + ' zupełnie nowe zakończenie zdania, które JP chciał zobaczyć.';
  const q = V.changeQuote(before, after);
  assert.ok(q.length <= 160, q.length); assert.match(q, /zupełnie nowe/); assert.ok(q.startsWith('…'));
  assert.equal(V.changeQuote('x', ''), '');
});

test('mergeAi: werdykty po angielsku i po polsku, cytat tylko dosłowny z pola, brak odpowiedzi = zostaje wstępna', () => {
  const items = [{ id: 1, ai: true, status: 'applied', after: 'Nowy tekst o organach w grocie.', quote: 'q0', note: 'x' },
    { id: 2, ai: true, status: 'applied', after: 'Coś innego.', quote: 'q2', note: 'x' }, { id: 3, ai: false, status: 'missing', note: 'bez zmian' }];
  const out = V.mergeAi(items, { uwagi: [{ id: 1, verdict: 'częściowo', why: 'skrócone, ale bez organów', brakuje: 'wspomnieć organy', cytat: 'o organach w grocie' },
    { id: 3, verdict: 'applied', why: 'nie powinno nadpisać' }] });
  assert.equal(out[0].status, 'partial'); assert.equal(out[0].ai, false); assert.equal(out[0].quote, 'o organach w grocie'); assert.match(out[0].note, /brakuje: wspomnieć organy/);
  assert.equal(out[1].ai, true); assert.equal(out[1].quote, 'q2');
  assert.equal(out[2].status, 'missing');
  const fake = V.mergeAi([items[0]], [{ id: 1, verdict: 'applied', why: 'ok', cytat: 'tego nie ma w polu' }]);
  assert.equal(fake[0].quote, 'q0');
});

test('walidator: nowe błędy względem wersji wyjściowej (wielozbiór), „minut jazdy” w opisie = nowy błąd', { skip: !existsSync(PY) }, () => {
  const t = clone(GOLD);
  const base = V.runValidator(t, PY, 'frasassi');
  t.content.stops[K].desc_paragraphs = [...t.content.stops[K].desc_paragraphs, 'Do jaskini jest 20 minut jazdy z Montefelcino.'];
  const next = V.runValidator(t, PY, 'frasassi');
  const ne = V.newErrors(base.errors, next.errors);
  assert.ok(ne.length >= 1, JSON.stringify(next.errors));
  assert.deepEqual(V.newErrors(['[BŁĄD] a', '[BŁĄD] a'], ['[BŁĄD] a', '[BŁĄD] a', '[BŁĄD] a']), ['[BŁĄD] a']);
  assert.deepEqual(V.newErrors(['  [BŁĄD]  x: y'], ['[BŁĄD] x: y']), []);
});

const mk = (status, where, note, quote = '', ai = false) => ({ id: Math.random(), status, where, note, quote, ai });
test('meldunek: gotowa (z częściowymi), nie gotowa, wstępna bez AI, linia #admin, błąd prośby', () => {
  const items = [...Array.from({ length: 20 }, () => mk('applied', 'X · Opis', 'ok')),
    mk('partial', 'Porta Consolare · Opis', 'skrócone — brakuje: data budowy'), mk('partial', 'miasto · Wstęp miasta', 'brakuje: Hispellum')];
  const v = V.summarize(items, { label: 'v3g', version: 7, from: 6 });
  assert.equal(v.ready, true); assert.equal(v.applied, 20); assert.equal(v.partial, 2); assert.equal(v.total, 22);
  const msg = V.report({ title: 'Spello', slug: 'spello', verify: v });
  assert.ok(msg.startsWith('✅ Spello v3g gotowa do akceptacji: 20/22 uwag naniesionych, 2 częściowo, walidator: 0 nowych błędów.'), msg);
  assert.match(msg, /Porta Consolare · Opis → skrócone — brakuje: data budowy/);
  assert.match(msg, /Podgląd: https:\/\/admin\.quolino\.com\/_admin\/#\/spello\/v7$/);
  assert.equal(V.adminLine({ title: 'Spello', slug: 'spello', verify: v }),
    '✅ Spello v3g gotowa do akceptacji (20/22 naniesionych, 2 częściowo, walidator: 0 nowych błędów): https://admin.quolino.com/_admin/#/spello/v7');
  const bad = V.summarize([mk('applied', 'a', 'ok'), mk('missing', 'Parking · Cena', 'pole „Cena” bez zmian')], { newErrs: ['[BŁĄD] x: 20 minut jazdy'], label: 'v3h', version: 8 });
  assert.equal(bad.ready, false);
  const m2 = V.report({ title: 'Spello', slug: 'spello', verify: bad });
  assert.ok(m2.startsWith('⚠️ Spello v3h nie gotowa: 1 uwaga nie naniesiona, walidator: 1 nowy błąd'), m2);
  assert.match(m2, /Parking · Cena → pole „Cena” bez zmian/); assert.match(m2, /20 minut jazdy/);
  const pend = V.summarize([mk('applied', 'a', 'zmienione', '', true)], { pendingAi: true, label: 'v3g', version: 7 });
  assert.equal(pend.ready, false);
  assert.match(V.report({ title: 'Spello', slug: 'spello', verify: pend, quotaUntil: '2026-11-02T08:00:00Z' }), /^⏳ Spello v3g — ocena wstępna \(bez AI\).*2026-11-02 08:00 UTC/);
  assert.equal(pend.items[0].provisional, true);
  const f = V.failedLine({ slug: 'spello', requestId: 5, n: 12, why: 'Nie udało się poprawić automatycznie: brak szkicu.' });
  assert.ok(f.startsWith('❌ spello: prośba o poprawkę #5 (12 uwag) zakończona błędem — Nie udało się'), f);
  assert.match(V.retryLine({ title: 'Spello', label: 'v3g', missing: [mk('missing', 'Parking · Cena', 'bez zmian')] }), /^🔁 Spello v3g: 1 uwaga nie naniesiona — jedna ponowna runda/);
});

test('kolumny: brak SQL 2026-10-31 → zapis tylko w hermes_reply; dopisek weryfikacji się nie dubluje', () => {
  assert.deepEqual(V.columnsFrom([]), { comments: false, requests: false, retryOf: false });
  assert.deepEqual(V.columnsFrom([{ table_name: 'draft_comments', column_name: 'verify_status' }]), { comments: false, requests: false, retryOf: false });
  const all = ['verify_status', 'verify_note', 'verify_quote'].map(c => ({ table_name: 'draft_comments', column_name: c }))
    .concat([{ table_name: 'draft_revision_requests', column_name: 'verify' }, { table_name: 'draft_revision_requests', column_name: 'retry_of' }]);
  assert.deepEqual(V.columnsFrom(all), { comments: true, requests: true, retryOf: true });
  const r1 = V.withVerify('Poprawione w szkicu v7.', 'wstępnie');
  assert.equal(V.withVerify(r1, 'naniesiona'), 'Poprawione w szkicu v7. · Sprawdzone: naniesiona');
  assert.equal(V.withVerify(null, 'x'), 'Sprawdzone: x'); assert.equal(V.withVerify('Sprawdzone: x', 'y'), 'Sprawdzone: y');
});

test('parentOf: retry_of albo uwagi z wcześniejszej zakończonej prośby; świeża prośba nie ma rodzica', () => {
  const others = [{ id: 3, status: 'done', comment_ids: [10, 11, 12] }, { id: 4, status: 'failed', comment_ids: [20] }];
  assert.equal(V.parentOf({ id: 5, comment_ids: [11] }, others).id, 3);
  assert.equal(V.parentOf({ id: 5, comment_ids: [20] }, others), null);
  assert.equal(V.parentOf({ id: 5, comment_ids: [30] }, others), null);
  assert.equal(V.parentOf({ id: 5, comment_ids: [30], retry_of: 3 }, others).id, 3);
  assert.deepEqual(V.combineItems([{ id: 1, status: 'applied' }, { id: 2, status: 'missing' }], [{ id: 2, status: 'applied' }]).map(x => x.status), ['applied', 'applied']);
});

// ── przebieg z atrapą bazy: przed SQL (bez kolumn) i po SQL ─────────────────────────────────────
function fakeDb({ cols, comments, requests, versions }) {
  const log = [];
  const q = async (sql, p = []) => {
    log.push({ sql: sql.replace(/\s+/g, ' ').trim(), p });
    if (/information_schema\.columns/.test(sql)) return cols;
    if (/FROM public\.draft_comments WHERE id = ANY/.test(sql)) return comments.filter(c => p[0].map(Number).includes(+c.id));
    if (/SELECT \* FROM public\.draft_revision_requests WHERE city_slug/.test(sql)) return requests.filter(r => r.city_slug === p[0] && +r.id !== +p[1]);
    if (/FROM public\.city_versions WHERE city_slug = \$1 AND version = \$2/.test(sql)) return versions.filter(v => v.version === +p[1]);
    if (/INSERT INTO public\.draft_revision_requests/.test(sql)) { const id = 100 + requests.length; requests.push({ id, city_slug: p[0], city_version: p[1], comment_ids: p[2], status: 'new' }); return [{ id }]; }
    if (/SELECT hermes_reply FROM public\.draft_revision_requests/.test(sql)) return [{ hermes_reply: 'Poprawione w szkicu v4 (zmian: 1).' }];
    return [];
  };
  return { q, log };
}
const deps = (over = {}) => ({ agyQuotaOut: () => null, agyQuotaHit: () => {}, extractJson: (t) => JSON.parse(t), aiUsage: () => {}, SKILLS: '/nie-ma', validator: PY, log: () => {}, ...over });

test('przebieg przed SQL: brak kolumn → tylko hermes_reply; nie naniesiona → jedna ponowna runda; bez AI (limit) → ocena wstępna', { skip: !existsSync(PY) }, async () => {
  process.env.QUOLINO_VERIFY_DIR = mkdtempSync(join(tmpdir(), 'quolino-verify-test-'));
  const { verifyRequest } = await import('./verify-revision.mjs');
  const versions = [row(3, 'v3f'), row(4, 'v3g', t => { t.content.stops[K].hint = HINT; })];
  const comments = [{ id: 1, city_slug: 'frasassi', city_version: 3, stop_key: K, field: 'hint', body: 'Zmień podpowiedź', hermes_reply: 'Poprawione w szkicu v4.' },
    { id: 2, city_slug: 'frasassi', city_version: 3, stop_key: K, field: 'kids_box', body: 'Krótsza misja', hermes_reply: 'Poprawione w szkicu v4.' }];
  const requests = [];
  const db = fakeDb({ cols: [], comments, requests, versions });
  const sent = [];
  let asked = 0;
  const out = await verifyRequest({ q: db.q, r: { id: 7, city_slug: 'frasassi', city_version: 3, result_version: 4, comment_ids: [1, 2], status: 'done' },
    notify: async (ch, t) => { sent.push([ch, t]); return true; }, thread: 'T1',
    deps: deps({ agyQuotaOut: () => '2026-11-02T08:00:00Z', ask: async () => { asked++; return '{}'; } }) });
  assert.equal(asked, 0, 'przy wyczerpanym limicie nie pytamy AI (i nie przechodzimy na płatny model)');
  assert.equal(out.verify.pending_ai, true); assert.equal(out.verify.missing, 1);
  assert.equal(out.retryId, 100); assert.deepEqual(requests[0].comment_ids, [2]);
  assert.ok(!db.log.some(x => !/information_schema/.test(x.sql) && /verify_status|SET verify =|retry_of/.test(x.sql)), 'bez kolumn nie piszemy do nich');
  assert.ok(db.log.some(x => /UPDATE public\.draft_comments SET hermes_reply/.test(x.sql) && /Sprawdzone: nie naniesiona — pole „Misja dla dzieci” bez zmian — ponowna runda #100/.test(x.p[1])));
  assert.equal(sent.length, 1); assert.equal(sent[0][0], 'T1'); assert.match(sent[0][1], /^🔁 Jaskinie Frasassi v3g: 1 uwaga nie naniesiona — jedna ponowna runda tylko dla nich/);
});

test('przebieg po SQL: AI ocenia jednym wywołaniem, gotowa → wątek + jedna linia na #admin, wynik w kolumnach', { skip: !existsSync(PY) }, async () => {
  process.env.QUOLINO_VERIFY_DIR = mkdtempSync(join(tmpdir(), 'quolino-verify-test-'));
  const { verifyRequest, ADMIN } = await import('./verify-revision.mjs');
  const versions = [row(3, 'v3f'), row(4, 'v3g', t => { t.content.stops[K].hint = HINT; })];
  const comments = [{ id: 1, city_slug: 'frasassi', city_version: 3, stop_key: K, field: 'hint', body: 'Zmień podpowiedź na organy', hermes_reply: 'Poprawione.' }];
  const cols = ['verify_status', 'verify_note', 'verify_quote'].map(c => ({ table_name: 'draft_comments', column_name: c }))
    .concat([{ table_name: 'draft_revision_requests', column_name: 'verify' }, { table_name: 'draft_revision_requests', column_name: 'retry_of' }]);
  const db = fakeDb({ cols, comments, requests: [], versions });
  const sent = [], prompts = [];
  const out = await verifyRequest({ q: db.q, r: { id: 8, city_slug: 'frasassi', city_version: 3, result_version: 4, comment_ids: [1], status: 'done' },
    notify: async (ch, t) => { sent.push([ch, t]); return true; }, thread: 'T1',
    deps: deps({ ask: async (p) => { prompts.push(p); return JSON.stringify({ uwagi: [{ id: 1, verdict: 'applied', why: 'podpowiedź mówi o organach', cytat: 'stalaktytu w kształcie organów' }] }); } }) });
  assert.equal(prompts.length, 1); assert.match(prompts[0], /Zmień podpowiedź na organy/);
  assert.equal(out.verify.ready, true); assert.equal(out.verify.applied, 1);
  assert.deepEqual(sent.map(s => s[0]), ['T1', ADMIN]);
  assert.match(sent[0][1], /^✅ Jaskinie Frasassi v3g gotowa do akceptacji: 1\/1 uwag naniesionych, walidator: 0 nowych błędów\./);
  const upd = db.log.find(x => /SET verify_status/.test(x.sql));
  assert.deepEqual(upd.p.slice(0, 4), [1, 'applied', 'podpowiedź mówi o organach', 'stalaktytu w kształcie organów']);
  const rv = db.log.find(x => /SET verify = \$2::jsonb/.test(x.sql));
  assert.equal(JSON.parse(rv.p[1]).ready, true);
});

test('draft-comments.mjs: weryfikacja po sukcesie, meldunek błędu na #admin, ponowna runda oznaczona', () => {
  const src = readFileSync(join(HERE, 'draft-comments.mjs'), 'utf8');
  assert.match(src, /await verifyRequest\(\{ q, r: \{ \.\.\.r, status: 'done', result_version: out\.version \}/);
  assert.match(src, /async function reportFailed[\s\S]*notify\(ADMIN, msg\)/);
  assert.match(src, /resumePending\(/);
  const vr = readFileSync(join(HERE, 'verify-revision.mjs'), 'utf8');
  assert.doesNotMatch(vr, /openrouter|claude\(|claudeJson|generativelanguage/, 'weryfikacja nie może wołać płatnego modelu');
});
