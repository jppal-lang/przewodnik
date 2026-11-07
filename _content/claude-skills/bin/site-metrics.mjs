#!/usr/bin/env node
// Ruch na stronie do panelu (JP 2026-11-07: lejek, języki, ranking tras, kanały): Umami → ops.site_daily, dzień po dniu.
//   node site-metrics.mjs [--days 3]     (cron co 3 h; ostatnie dni nadpisywane, bo Umami dolicza z opóźnieniem)
// Tylko liczby zbiorcze (odwiedzający, odsłony) wg: całość, język przeglądarki, miasto (adres strony trasy), kanał, kraj.
// Zero danych o osobach. Konfiguracja jak stats-report.mjs: UMAMI_URL + UMAMI_SHARE_ID (albo UMAMI_USER/PASSWORD/WEBSITE_ID).
// Brak konfiguracji = cisza (kod 0).
import { db, env, log } from './lib.mjs';

const argv = process.argv.slice(2);
const i = argv.indexOf('--days');
let DAYS = Math.min(31, Math.max(1, +(i > -1 ? argv[i + 1] : 3) || 3));
const U = { url: (env('UMAMI_URL') ?? '').replace(/\/$/, ''), user: env('UMAMI_USER'), pass: env('UMAMI_PASSWORD'), site: env('UMAMI_WEBSITE_ID'), share: env('UMAMI_SHARE_ID') };
if (!U.url || !(U.share || (U.user && U.pass && U.site))) process.exit(0);

// kanały — te same reguły co piątkowe podsumowanie (stats-report.mjs, docs/STATYSTYKI.md §3)
const CH = [
  ['AI', /(^|\.)(chatgpt\.com|chat\.openai\.com|perplexity\.ai|gemini\.google\.com|copilot\.microsoft\.com|claude\.ai)$/],
  ['Wyszukiwarki', /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|ecosia\.org|yahoo\.[a-z.]+|brave\.com|startpage\.com|qwant\.com)$/],
  ['Social', /(^|\.)(facebook\.com|instagram\.com|tiktok\.com|youtube\.com|pinterest\.[a-z.]+|t\.co|x\.com|twitter\.com|reddit\.com|messenger\.com|wa\.me|whatsapp\.com)$/],
  ['Wewnętrzne', /(^|\.)quolino\.com$/],
];
export const channelOf = (host) => !host ? 'Bezpośrednio / nieznane' : (CH.find(([, re]) => re.test(host))?.[0] ?? 'Inne strony (polecenia)');

async function jfetch(url, init = {}) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(25_000) });
  if (!r.ok) throw new Error(`${new URL(url).host}: HTTP ${r.status}`);
  return r.json();
}

async function main() {
  let H;
  if (U.share) { const { token, websiteId } = await jfetch(`${U.url}/api/share/${encodeURIComponent(U.share)}`); U.site ||= websiteId; H = { 'x-umami-share-token': token }; }
  else { const { token } = await jfetch(`${U.url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: U.user, password: U.pass }) }); H = { Authorization: `Bearer ${token}` }; }
  const get = (p, q) => jfetch(`${U.url}/api/websites/${U.site}/${p}?${new URLSearchParams(q)}`, { headers: H });
  const metric = async (types, w) => { for (const type of [].concat(types)) { try { return await get('metrics', { ...w, type, limit: 500 }); } catch { /* następny typ */ } } throw new Error(`Umami: brak metryki ${[].concat(types).join('/')}`); };   // błąd = dzień zostaje nietknięty (nie kasujemy rozbicia)

  const c = await db();
  try {
    // adres strony trasy → slug miasta: mapa adresów z SSR (/pl/paths/ = /paths.json: { miasto: { lang: adres } }), adresy we wszystkich językach
    const norm = (p) => { try { p = new URL(p, 'https://quolino.com').pathname; } catch { p = String(p); } return p.replace(/\/+$/, '').toLowerCase(); };
    const byPath = {};
    try {
      const paths = await jfetch(`${env('QUOLINO_SITE_URL') || 'https://quolino.com'}/pl/paths/`);
      for (const [slug, m] of Object.entries(paths ?? {})) for (const u of Object.values(m ?? {})) byPath[norm(u)] = slug;
    } catch (e) { log(`site-metrics: mapa adresów niedostępna (${e.message}) — bez rankingu miast`); }
    const mapOk = Object.keys(byPath).length > 0;
    const cityKey = (p) => byPath[norm(p)] ?? null;

    // pierwszy przebieg: miesiąc wstecz, żeby panel od razu miał lejek i ranking
    if (i < 0 && !(await c.query(`SELECT 1 FROM ops.site_daily LIMIT 1`)).rows.length) DAYS = 31;
    let rows = 0;
    for (let d = DAYS - 1; d >= 0; d--) {
      const start = new Date(); start.setUTCHours(0, 0, 0, 0); start.setUTCDate(start.getUTCDate() - d);
      const w = { startAt: start.getTime(), endAt: Math.min(Date.now(), start.getTime() + 86400_000 - 1) };
      const day = start.toISOString().slice(0, 10);
      const st = await get('stats', w);
      const v = (k) => +(st[k]?.value ?? st[k] ?? 0) || 0;
      const out = [['all', 'all', v('visitors'), v('pageviews')]];
      const add = (dim, list, keyOf) => {
        const m = {};
        for (const r of list ?? []) { const k = keyOf(r.x); if (k) m[k] = (m[k] ?? 0) + (+r.y || 0); }
        for (const [k, n] of Object.entries(m)) out.push([dim, k.slice(0, 60), n, dim === 'city' ? n : 0]);
      };
      add('lang', await metric('language', w), (x) => String(x ?? '').toLowerCase() || null);
      add('country', await metric('country', w), (x) => String(x ?? '').toUpperCase() || null);
      add('city', await metric(['path', 'url'], w), cityKey);
      const refs = await metric('referrer', w);
      add('channel', refs, (x) => channelOf(String(x ?? '').replace(/^www\./, '')));
      const counted = out.filter(r => r[0] === 'channel').reduce((a, r) => a + r[2], 0);
      const direct = Math.max(0, v('visits') - counted);
      if (direct) { const r = out.find(r => r[0] === 'channel' && r[1] === 'Bezpośrednio / nieznane'); if (r) r[2] += direct; else out.push(['channel', 'Bezpośrednio / nieznane', direct, 0]); }
      await c.query('BEGIN');
      await c.query(`DELETE FROM ops.site_daily WHERE day = $1 AND ($2 OR dim <> 'city')`, [day, mapOk]);   // bez mapy adresów zostaje stary ranking miast
      for (const [dim, key, vis, pv] of out)
        await c.query(`INSERT INTO ops.site_daily (day, dim, key, visitors, pageviews) VALUES ($1, $2, $3, $4, $5)
                       ON CONFLICT (day, dim, key) DO UPDATE SET visitors = EXCLUDED.visitors, pageviews = EXCLUDED.pageviews, updated_at = now()`, [day, dim, key, vis, pv]);
      await c.query('COMMIT');
      rows += out.length;
    }
    log(`site-metrics: ${DAYS} dni, ${rows} wierszy`);
  } finally { await c.end(); }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(`site-metrics: ${e.message}`); process.exit(1); });
