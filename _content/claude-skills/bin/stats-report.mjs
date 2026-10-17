#!/usr/bin/env node
// Statystyki do piątkowego podsumowania: Umami (ruch, kanały, miasta, zdarzenia) + Google Search Console (hasła, strony).
//   node stats-report.mjs [--days 7] [--dry] [--notify <kanał>]
// Dane zbiorcze, zero danych o osobach. Plan: docs/STATYSTYKI.md.
// Konfiguracja (/opt/data/.env, dopisuje ops/umami-init.sh — wartości nigdy nie trafiają do repo ani na Discord):
//   UMAMI_URL, UMAMI_SHARE_ID (token udostępnienia: tylko odczyt jednej witryny; ewentualnie UMAMI_USER + UMAMI_PASSWORD + UMAMI_WEBSITE_ID)
//   GSC_KEY_FILE (domyślnie /opt/data/secrets/gsc-reader.json), GSC_SITE (domyślnie sc-domain:quolino.com)
// Brak konfiguracji = cisza (kod 0), żeby cron nie hałasował przed wdrożeniem.
import { readFileSync, existsSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { env } from './lib.mjs';
import { notify } from './draft-lib.mjs';

const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : undefined; };
const DAYS = Math.min(31, Math.max(1, +(opt('--days') ?? 7)));
const CHANNEL = opt('--notify') ?? env('QUOLINO_STATS_CHANNEL') ?? '#statystyki';
const DRY = argv.includes('--dry');
const DAY = 86400_000;
const nf = (n) => new Intl.NumberFormat('pl-PL').format(Math.round(n ?? 0));
const delta = (a, b) => (b ? `${a >= b ? '+' : '−'}${Math.abs(Math.round((a - b) / b * 100))}%` : (a ? 'nowe' : '–'));
const safe = (s) => String(s ?? '').replace(/[`*_~|<>@#]/g, '').slice(0, 80);   // tekst z zewnątrz (referrery, hasła) tylko jako dane

// ── kanały (docs/STATYSTYKI.md §3) ──
const CH = [
  ['AI', /(^|\.)(chatgpt\.com|chat\.openai\.com|perplexity\.ai|gemini\.google\.com|copilot\.microsoft\.com|claude\.ai)$/],
  ['Wyszukiwarki', /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|ecosia\.org|yahoo\.[a-z.]+|brave\.com|startpage\.com|qwant\.com)$/],
  ['Social', /(^|\.)(facebook\.com|instagram\.com|tiktok\.com|youtube\.com|pinterest\.[a-z.]+|t\.co|x\.com|twitter\.com|reddit\.com|messenger\.com|wa\.me|whatsapp\.com)$/],
  ['Wewnętrzne', /(^|\.)quolino\.com$/],
];
const channelOf = (host) => !host ? 'Bezpośrednio / nieznane' : (CH.find(([, re]) => re.test(host))?.[0] ?? 'Inne strony (polecenia)');

// ── Umami ──
const U = { url: (env('UMAMI_URL') ?? '').replace(/\/$/, ''), user: env('UMAMI_USER'), pass: env('UMAMI_PASSWORD'), site: env('UMAMI_WEBSITE_ID'), share: env('UMAMI_SHARE_ID') };
async function jfetch(url, init = {}) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(25_000) });
  if (!r.ok) throw new Error(`${new URL(url).host}: HTTP ${r.status}`);
  return r.json();
}
async function umami() {
  // wolimy token udostępnienia (tylko odczyt jednej witryny); login tylko, gdy nie ma UMAMI_SHARE_ID
  let H;
  if (U.share) { const { token, websiteId } = await jfetch(`${U.url}/api/share/${encodeURIComponent(U.share)}`); U.site ||= websiteId; H = { 'x-umami-share-token': token }; }
  else { const { token } = await jfetch(`${U.url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: U.user, password: U.pass }) }); H = { Authorization: `Bearer ${token}` }; }
  const get = (p, q) => jfetch(`${U.url}/api/websites/${U.site}/${p}?${new URLSearchParams(q)}`, { headers: H });
  const end = Date.now(), start = end - DAYS * DAY, pEnd = start, pStart = start - DAYS * DAY;
  const win = (s, e) => ({ startAt: s, endAt: e });
  const stats = await get('stats', win(start, end)), prev = await get('stats', win(pStart, pEnd));
  const metric = async (types, extra = {}, s = start, e = end) => {
    for (const type of [].concat(types)) { try { return await get('metrics', { ...win(s, e), type, limit: 200, ...extra }); } catch { /* następny typ */ } }
    return null;
  };
  const refs = await metric('referrer'), prevRefs = await metric('referrer', {}, pStart, pEnd);
  const paths = await metric(['path', 'url']), events = await metric('event'), countries = await metric('country'), langs = await metric('language');
  return { stats, prev, refs, prevRefs, paths, events, countries, langs };
}
const sumBy = (rows, f) => (rows ?? []).reduce((m, r) => { const k = f(r); m[k] = (m[k] ?? 0) + (+r.y || 0); return m; }, {});
const top = (m, n) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);
const cityOf = (path) => { const m = String(path).match(/^\/[a-z]{2}(?:-[a-z]{2})?\/[a-z]{2}\/[a-z0-9-]+\/([a-z0-9-]+)\/?$/); return m?.[1] ?? null; };
const ev = (events, name) => (events ?? []).find(e => e.x === name)?.y ?? 0;

function umamiText(d) {
  const v = (k) => d.stats[k]?.value ?? d.stats[k] ?? 0, p = (k) => d.prev[k]?.value ?? d.prev[k] ?? 0;
  const L = [`**Umami** (ostatnie ${DAYS} dni, w nawiasie zmiana do poprzednich ${DAYS})`,
    `• odwiedzający: **${nf(v('visitors'))}** (${delta(v('visitors'), p('visitors'))}) · wizyty: ${nf(v('visits'))} (${delta(v('visits'), p('visits'))}) · odsłony: ${nf(v('pageviews'))} (${delta(v('pageviews'), p('pageviews'))})`];
  const ch = sumBy(d.refs, r => channelOf(String(r.x ?? '').replace(/^www\./, '')));
  const pch = sumBy(d.prevRefs, r => channelOf(String(r.x ?? '').replace(/^www\./, '')));
  const direct = Math.max(0, v('visits') - Object.values(ch).reduce((a, b) => a + b, 0));
  if (direct) ch['Bezpośrednio / nieznane'] = (ch['Bezpośrednio / nieznane'] ?? 0) + direct;
  const pdirect = Math.max(0, p('visits') - Object.values(pch).reduce((a, b) => a + b, 0));
  if (pdirect) pch['Bezpośrednio / nieznane'] = (pch['Bezpośrednio / nieznane'] ?? 0) + pdirect;
  const tot = Object.values(ch).reduce((a, b) => a + b, 0) || 1;
  if (d.refs) L.push('• kanały: ' + top(ch, 7).filter(([k]) => k !== 'Wewnętrzne').map(([k, n]) => `${k} ${Math.round(n / tot * 100)}% (${nf(n)}, ${delta(n, pch[k] ?? 0)})`).join(' · '));
  if (d.refs) {
    const dom = top(sumBy(d.refs.filter(r => r.x && channelOf(String(r.x).replace(/^www\./, '')) === 'Inne strony (polecenia)'), r => safe(String(r.x).replace(/^www\./, ''))), 8);
    L.push('• domeny polecające: ' + (dom.length ? dom.map(([k, n]) => `${k} ${nf(n)}`).join(' · ') : 'brak'));
  }
  const cities = top(sumBy((d.paths ?? []).filter(r => cityOf(r.x)), r => cityOf(r.x)), 10);
  if (cities.length) L.push('• miasta (odsłony): ' + cities.map(([k, n]) => `${k} ${nf(n)}`).join(' · '));
  const e = d.events;
  if (e) L.push(`• lejek: czytanie ≥ 2 min **${nf(ev(e, 'czytanie-2m'))}** → „Pełna wycieczka” **${nf(ev(e, 'pelna-wycieczka'))}** · widok dziecka ${nf(ev(e, 'qr-dziecko'))} · nawigacja do startu ${nf(ev(e, 'nawiguj-start'))} · misje ${nf(ev(e, 'misja'))} · naklejki ${nf(ev(e, 'naklejka-wklejona'))}`);
  if (d.countries?.length) L.push('• kraje: ' + d.countries.slice(0, 6).map(r => `${safe(r.x)} ${nf(r.y)}`).join(' · '));
  if (d.langs?.length) L.push('• języki przeglądarek: ' + d.langs.slice(0, 6).map(r => `${safe(r.x)} ${nf(r.y)}`).join(' · '));
  return L.join('\n');
}

// ── Search Console ──
const b64u = (b) => Buffer.from(b).toString('base64url');
async function gsc() {
  const keyFile = env('GSC_KEY_FILE') ?? '/opt/data/secrets/gsc-reader.json';
  if (!existsSync(keyFile)) return { missing: 'brak pliku klucza GSC' };
  const key = JSON.parse(readFileSync(keyFile, 'utf8'));
  const tokenUrl = env('GSC_TOKEN_URL') ?? 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly', aud: tokenUrl, iat: now, exp: now + 3000 }));
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(key.private_key, 'base64url');
  const tok = await jfetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${sig}` }) });
  const site = env('GSC_SITE') ?? 'sc-domain:quolino.com';
  const api = env('GSC_API') ?? 'https://searchconsole.googleapis.com';
  const q = (dimensions, s, e, rowLimit = 10) => jfetch(`${api}/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate: s, endDate: e, dimensions, rowLimit }) });
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const endT = Date.now() - 3 * DAY, startT = endT - (DAYS - 1) * DAY, pEndT = startT - DAY, pStartT = pEndT - (DAYS - 1) * DAY;   // GSC opóźnia dane o ok. 2–3 dni
  const [tot, ptot, queries, pages, pqueries] = await Promise.all([q([], iso(startT), iso(endT), 1), q([], iso(pStartT), iso(pEndT), 1),
    q(['query'], iso(startT), iso(endT), 200), q(['page'], iso(startT), iso(endT), 10), q(['query'], iso(pStartT), iso(pEndT), 200)]);
  return { range: `${iso(startT)} – ${iso(endT)}`, tot: tot.rows?.[0], ptot: ptot.rows?.[0], queries: queries.rows ?? [], pages: pages.rows ?? [], pqueries: pqueries.rows ?? [] };
}
function gscText(g) {
  if (g.missing) return `**Search Console**: ${g.missing}`;
  const t = g.tot ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 }, p = g.ptot ?? {};
  const L = [`**Search Console** (${g.range}; dane Google opóźnione o ok. 3 dni)`,
    `• kliknięcia: **${nf(t.clicks)}** (${delta(t.clicks, p.clicks)}) · wyświetlenia: ${nf(t.impressions)} (${delta(t.impressions, p.impressions)}) · CTR ${(t.ctr * 100).toFixed(1)}% · średnia pozycja ${t.position ? t.position.toFixed(1) : '–'}`];
  if (g.queries.length) L.push('• hasła (kliknięcia / wyświetlenia / pozycja): ' + g.queries.slice(0, 8).map(r => `${safe(r.keys[0])} ${nf(r.clicks)}/${nf(r.impressions)}/${r.position.toFixed(1)}`).join(' · '));
  const pos = new Map(g.pqueries.map(r => [r.keys[0], r.position]));
  const mv = g.queries.filter(r => pos.has(r.keys[0]) && r.impressions >= 10).map(r => [safe(r.keys[0]), pos.get(r.keys[0]) - r.position]).filter(([, d]) => Math.abs(d) >= 2).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 5);
  if (mv.length) L.push('• największe zmiany pozycji: ' + mv.map(([k, d]) => `${k} ${d > 0 ? '▲' : '▼'}${Math.abs(d).toFixed(1)}`).join(' · '));
  const low = g.queries.filter(r => r.impressions >= 50 && r.ctr < 0.02).slice(0, 4);
  if (low.length) L.push('• dużo wyświetleń, mało kliknięć (do poprawy tytułu/opisu): ' + low.map(r => `${safe(r.keys[0])} (${nf(r.impressions)})`).join(' · '));
  if (g.pages.length) L.push('• strony: ' + g.pages.slice(0, 5).map(r => `${safe(r.keys[0].replace(/^https?:\/\/[^/]+/, '') || '/')} ${nf(r.clicks)}`).join(' · '));
  return L.join('\n');
}

// ── całość ──
if (!U.url || !((U.user && U.pass) || U.share) || !(U.site || U.share)) { console.error('stats-report: brak konfiguracji Umami (UMAMI_*) — pomijam'); process.exit(0); }
const parts = [];
let failed = 0;
try { parts.push(umamiText(await umami())); } catch (e) { failed++; parts.push(`**Umami**: błąd pobierania (${e.message})`); }
try { parts.push(gscText(await gsc())); } catch (e) { failed++; parts.push(`**Search Console**: błąd pobierania (${e.message})`); }
const text = `📊 **Statystyki Quolino — podsumowanie tygodnia**\n` + parts.join('\n\n');
console.log(text);
if (!DRY) await notify(CHANNEL, text);
process.exitCode = failed === 2 ? 1 : 0;
