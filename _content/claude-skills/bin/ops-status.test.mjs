#!/usr/bin/env node
// Testy filtra sekretów i limitu rozmiaru podglądu stanu: node --test ops-status.test.mjs (bez sieci, bez bazy)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scrub, scrubDeep, fit, jobsSnapshot, verifySummary } from './ops-status.mjs';

const hidden = (s, secret) => { const o = scrub(s); assert.ok(!o.includes(secret), `wyciekło „${secret}” w: ${o}`); return o; };

test('tokeny dostawców i JWT są wycinane', () => {
  hidden('klucz sk-ant-api03-AbCdEf1234567890xyzXYZ w logu', 'AbCdEf1234567890xyzXYZ');
  hidden('OPENROUTER sk-or-v1-0123456789abcdef0123456789abcdef', '0123456789abcdef0123456789abcdef');
  hidden('anon eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoid2ViX2Fub24ifQ.c2lnbmF0dXJl', 'eyJyb2xlIjoid2ViX2Fub24ifQ');
  hidden('git push https://ghp_ABCDEFGHIJKLMNOPQRSTuvwxyz0123456789@github.com', 'ghp_ABCDEFGHIJ');
  hidden('github_pat_11ABCDEFG0123456789_abcdefghijklmnop', 'github_pat_11ABCDEFG');
  hidden('Google AIzaSyD-0123456789abcdefghijklmnopqrstu', 'AIzaSyD-0123456789');
  hidden('curl -H "Authorization: Bearer abc.def.ghi-123456"', 'abc.def.ghi-123456');
  hidden('Authorization: Basic dXNlcjpwYXNzd29yZA==', 'dXNlcjpwYXNzd29yZA');
});

test('zmienne środowiskowe, hasła w URL, webhooki, parametry token=', () => {
  hidden('CLAUDE_CODE_OAUTH_TOKEN=sk-xyz-123 dalej', 'sk-xyz-123');
  hidden('ALERT_WEBHOOK: https://example.org/hook/abc', 'example.org/hook/abc');
  hidden('QUOLINO_DATABASE_URL=postgres://quolino:tajne@db:5432/quolino', 'tajne');
  hidden('łączę z postgres://quolino:SuperTajne1@postgresql:5432/quolino', 'SuperTajne1');
  hidden('wysłano na https://discord.com/api/webhooks/123/AbCdEf', 'AbCdEf');
  hidden('link https://admin.quolino.com/?token=a1b2c3d4e5&city=spello', 'a1b2c3d4e5');
  hidden('{"password": "hunter2hunter2"}', 'hunter2hunter2');
  hidden('losowy klucz Zx9Qw3Er7Ty1Ui5Op2As8Df4Gh6Jk0Lz', 'Zx9Qw3Er7Ty1Ui5Op2As8Df4Gh6Jk0Lz');
});

test('e-maile i adresy IP', () => {
  assert.equal(scrub('zgłosił jan.kowalski+test@example.com wczoraj'), 'zgłosił [e-mail] wczoraj');
  assert.equal(scrub('połączenie z 192.168.1.20 odrzucone'), 'połączenie z [IP] odrzucone');
  hidden('ipv6 2001:db8:85a3::8a2e:370:7334 tu', '2001:db8');
  hidden('ipv6 fe80::1ff:fe23:4567:890a tu', 'fe80::1ff');
});

test('zwykły tekst operacyjny zostaje bez zmian', () => {
  for (const s of [
    '12:34:56 kolejka: #42 spello → v7',
    'zlecenie 2026-10-30-spello-v3f-source-check-lagodnie: done (kod 0)',
    'gemini-draft.mjs spello --recheck --notify 1558873867643134073',
    'c86e3d3 source-check: fakty praktyczne (ceny, parking, godziny, telefony)',
    'commit 3f2a9c1e0b7d4a6f8e5c2b1a0d9e8f7c6b5a4d3e',
    'Token limit reached, Resets in 128h41m',
    'tokens_in: 120034, wersja 1.2.3 nie, 2026-10-30T10:11:12.000Z',
    'pipeline_events_run Spello_v3e_source_check_lagodnie_2026',
  ]) assert.equal(scrub(s), s);
});

test('scrubDeep: zagnieżdżone obiekty, klucze, Date, bigint; ucina bardzo długie napisy', () => {
  const o = scrubDeep({ a: ['x sk-ant-AAAAAAAAAAAAAAAA1'], 'jan@example.com': 1, d: new Date('2026-10-30T00:00:00Z'), b: 5n, long: 'z'.repeat(9000) });
  assert.ok(!JSON.stringify(o).includes('sk-ant-AAAA'));
  assert.ok(o['[e-mail]'] === 1);
  assert.equal(o.d, '2026-10-30T00:00:00.000Z');
  assert.equal(o.b, 5);
  assert.ok(o.long.length <= 4001);
});

test('fit: wynik mieści się w limicie, linie logu tracą najstarsze', () => {
  const big = { registry: Array.from({ length: 300 }, (_, i) => ({ name: `job-${i}`, result: 'r'.repeat(300) })),
    logs: [{ name: 'x', tail: Array.from({ length: 30 }, (_, i) => `linia ${i} ` + 'l'.repeat(400)) }] };
  const out = fit(big, 20_000);
  assert.ok(Buffer.byteLength(JSON.stringify(out)) <= 20_000);
  assert.equal(out.registry[0].name, 'job-0');
  const t = out.logs[0]?.tail; if (t?.length) assert.match(t[t.length - 1], /^(…)?(linia 29|l+)/);
  assert.deepEqual(fit({ a: 1 }, 1000), { a: 1 });
});

test('jobsSnapshot czyta rejestr i 5 najnowszych logów (po 30 linii)', () => {
  const w = mkdtempSync(join(tmpdir(), 'ops-status-')); mkdirSync(join(w, 'jobs'));
  writeFileSync(join(w, 'repo-jobs.json'), JSON.stringify({ a: { status: 'done', code: 0, script: 'show-review.mjs', args: ['spello'], started_at: '2026-10-30T10:00:00Z', result: 'ok' } }));
  for (let i = 0; i < 7; i++) writeFileSync(join(w, 'jobs', `j${i}.log`), Array.from({ length: 50 }, (_, k) => `j${i} linia ${k}`).join('\n'));
  const s = jobsSnapshot(w);
  assert.equal(s.registry[0].name, 'a'); assert.equal(s.registry[0].args, 'spello');
  assert.equal(s.logs.length, 5); assert.equal(s.logs[0].tail.length, 30); assert.match(s.logs[0].tail[29], /linia 49$/);
});

test('revisions.verify: same liczniki weryfikacji, bez listy uwag i linii walidatora', () => {
  const v = { ok: true, ready: false, applied: 20, partial: 1, missing: 1, stale: 0, total: 22, new_errors: 1, pending_ai: false, label: 'v3g', version: 7, round: 1, retried: 12,
    checked_at: '2026-10-31T12:00:00Z', items: [{ id: 1, note: 'treść uwagi', quote: 'cytat' }], new_error_lines: ['[BŁĄD] x'] };
  const s = verifySummary(v);
  assert.equal(s.ready, false); assert.equal(s.applied, 20); assert.equal(s.retried, 12); assert.equal(s.label, 'v3g');
  assert.ok(!('items' in s) && !('new_error_lines' in s));
  assert.equal(verifySummary(null), null);
});
