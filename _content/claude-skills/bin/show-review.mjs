#!/usr/bin/env node
// Podgląd błędów kontroli szkicu w konsoli (Claude/JP): node show-review.mjs <slug> [--v N] [--grep "tekst"] [--from K]
import { db } from './lib.mjs';
const a = process.argv.slice(2), slug = a[0], opt = (n) => { const i = a.indexOf(n); return i < 0 ? null : a[i + 1]; };
const c = await db();
if (a.includes('--info')) {   // wątek Discorda miasta i lista wersji
  const t = await c.query('SELECT slug, discord_thread_id FROM ops.cities WHERE slug = $1', [slug]).catch(e => ({ rows: [{ err: e.message }] }));
  const v = await c.query(`SELECT version, status, content->>'label' AS label, content->>'workflow' AS wf, jsonb_array_length(coalesce(review->'errors','[]')) AS err, created_at::date AS d FROM public.city_versions WHERE city_slug = $1 ORDER BY version`, [slug]);
  console.log(JSON.stringify(t.rows)); v.rows.forEach(x => console.log(JSON.stringify(x))); await c.end(); process.exit(0);
}
const { rows: [r] } = await c.query(opt('--v') ? `SELECT version, content->>'label' AS label, review, trip FROM public.city_versions WHERE city_slug=$1 AND version=$2`
  : `SELECT version, content->>'label' AS label, review, trip FROM public.city_versions WHERE city_slug=$1 ORDER BY version DESC LIMIT 1`, opt('--v') ? [slug, +opt('--v')] : [slug]);
await c.end();
const one = (s, n) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);
if (opt('--grep')) {
  const g = opt('--grep'), seen = new Set();
  const walk = (o, p) => { if (typeof o === 'string') { let i = o.indexOf(g); if (i >= 0 && !seen.has(p)) { seen.add(p); console.log(`${p}: …${one(o.slice(Math.max(0, i - 120), i + g.length + 160), 300)}…`); } }
    else if (o && typeof o === 'object') for (const k of Object.keys(o)) walk(o[k], `${p}.${k}`); };
  walk(r.trip, ''); process.exit(0);
}
if (opt('--stop')) {   // wszystkie pola przystanku (ścieżka: wartość), pełne teksty
  const k = opt('--stop');
  const walk = (o, p, hit) => { if (o == null) return; if (typeof o !== 'object') { if (hit && !/marked|stop_blocks/.test(p)) console.log(`${p}: ${o}${typeof o === 'string' && /desc/.test(p) ? ` (${o.split(/\s+/).length} sł.)` : ''}`); return; }
    for (const [kk, v] of Object.entries(o)) walk(v, `${p}.${kk}`, hit || kk === k || v?.key === k || v?.slug === k); };
  walk(r.trip, '', false); process.exit(0);
}
if (a.includes('--meta')) { const m = r.trip.meta ?? {}; const st = (m.stops ?? []).map(x => ({ key: x.key, t: x.time_label, d: x.duration_min ?? x.duration })); console.log(one(JSON.stringify({ ...m, stops: st }), 1800)); process.exit(0); }
const rv = r.review ?? {}, from = +(opt('--from') ?? 0);
console.log(`${slug} v${r.version} ${r.label} · błędy ${rv.errors?.length ?? 0} · ostrzeżenia ${rv.warnings?.length ?? 0}`);
(rv.errors ?? []).slice(from, from + 12).forEach((e, i) => console.log(`#${from + i} [${e.path ?? e.stop_key ?? 'trasa'}] ${one(e.problem, 260)}${e.quote ? `\n   CYTAT: ${one(e.quote, 150)}` : ''}${e.old ? `\n   OLD: ${one(e.old, 150)}` : ''}${e.new ? `\n   NEW: ${one(e.new, 150)}` : ''}`));
