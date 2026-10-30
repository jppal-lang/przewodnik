#!/usr/bin/env node
// Odczyt podglądu stanu serwera (JP 2026-10-30) — dla Claude-koordynatora, bez SSH i bez tajnych tokenów.
//   node _content/claude-skills/bin/ops-status-read.mjs [jobs|versions|queue|deploy|cron] [--raw]
//   (w piaskownicy z proxy: NODE_USE_ENV_PROXY=1 node …; bez tego fetch nie wychodzi)
// Klucz anon jest PUBLICZNY (ten sam, którego używa strona); skrypt pobiera go z https://quolino.com/page-i18n.js, niczego nie przechowuje.
// To samo curl-em (klucz = napis eyJ… z page-i18n.js albo gra/treasure.js):
//   curl -s -X POST https://api.quolino.com/rest/v1/rpc/ops_status -H "apikey: <klucz anon>" -H "Authorization: Bearer <klucz anon>" \
//        -H "Content-Type: application/json" -d '{}'
// Migawki zapisuje bin/ops-status.mjs w kontenerze Hermesa co ~10 min (gemini-queue.mjs) i po każdym zleceniu z _content/jobs.
const API = 'https://api.quolino.com/rest/v1/rpc/ops_status';
const args = process.argv.slice(2), raw = args.includes('--raw'), only = args.find(a => !a.startsWith('--'));

let key = null;
for (const src of ['https://quolino.com/page-i18n.js', 'https://quolino.com/gra/treasure.js']) {
  try { key = (await (await fetch(src)).text()).match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]; } catch { /* następne źródło */ }
  if (key) break;
}
const headers = { 'Content-Type': 'application/json', ...(key ? { apikey: key, Authorization: `Bearer ${key}` } : {}) };
const r = await fetch(API, { method: 'POST', headers, body: '{}' });
const text = await r.text();
if (!r.ok) { console.error(`ops_status: HTTP ${r.status} ${text.slice(0, 300)}`); process.exit(1); }
const j = JSON.parse(text);
if (raw) { console.log(JSON.stringify(only ? j.snapshots?.[only] : j, null, 1)); process.exit(0); }

const snaps = j.snapshots ?? {};
console.log(`stan z ${j.now}`);
for (const [k, s] of Object.entries(snaps)) {
  if (only && k !== only) continue;
  console.log(`\n=== ${k} (sprzed ${s.age_min} min) ===`);
  console.log(JSON.stringify(s.data, null, 1));
}
