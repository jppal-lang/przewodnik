#!/usr/bin/env node
// Miesięczny przegląd linków opublikowanych wycieczek (cron 1. dnia miesiąca, po przeglądzie lokali).
//   node links-check.mjs [--city <slug>] [--dry] [--notify <kanał zbiorczy>]
// Sprawdza: verify_url, website i źródła przystanków (z ostatniej opublikowanej wersji).
//   • martwy (404/410, domena nie istnieje) dwa miesiące z rzędu → alarm w wątku miasta
//     (pierwszy raz tylko odnotowany — strony bywają chwilowo niedostępne)
//   • przekierowanie na stronę główną domeny → uwaga (podstrona zniknęła)
//   • godziny otwarcia „unverified” albo nietknięte > 6 miesięcy → przypomnienie
// Wynik w public.link_checks; podsumowanie na kanale zbiorczym (#lokale — wspólny kanał przeglądów).
import { db, env, log } from './lib.mjs';
import { notify } from './draft-lib.mjs';

const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : undefined; };
const DRY = argv.includes('--dry');
const CITY = opt('--city');
const SUMMARY = opt('--notify') ?? env('QUOLINO_REVIEW_CHANNEL') ?? '#lokale';
const UA = 'QuolinoLinkCheck/1.0 (https://questini.com)';

async function check(url) {
  const t0 = Date.now();
  for (const method of ['HEAD', 'GET']) {
    try {
      const r = await fetch(url, { method, redirect: 'follow', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25_000) });
      if (method === 'HEAD' && [403, 405, 501].includes(r.status)) continue;   // część serwerów nie lubi HEAD
      const final = r.url || url;
      const home = new URL(final).pathname.replace(/\/+$/, '') === '' && new URL(url).pathname.replace(/\/+$/, '') !== '';
      return { status: r.status, final, home, ms: Date.now() - t0 };
    } catch (e) {
      if (method === 'GET') return { status: 0, error: e.cause?.code ?? e.name ?? 'błąd', ms: Date.now() - t0 };
    }
  }
}

const c = await db();
const q = async (sql, p) => (await c.query(sql, p)).rows;
try {
  const rows = await q(`
    SELECT v.city_slug, s->>'stop_key' AS stop_key, s->>'category' AS category,
           s->>'verify_url' AS verify_url, s->>'website' AS website, s->'sources' AS sources,
           s->>'hours_status' AS hours_status, v.published_at, oc.discord_thread_id
      FROM public.city_versions v
      CROSS JOIN LATERAL jsonb_array_elements(v.content->'stops') s
      LEFT JOIN ops.cities oc ON oc.slug = v.city_slug
     WHERE v.status = 'published' AND ($1::text IS NULL OR v.city_slug = $1)`, [CITY ?? null]);
  const urls = new Map();   // url → [{city, stop}]
  for (const r of rows) {
    const list = [r.verify_url, r.website, ...(Array.isArray(r.sources) ? r.sources : [])].filter(u => /^https?:\/\//.test(u ?? ''));
    for (const u of new Set(list)) { if (!urls.has(u)) urls.set(u, []); urls.get(u).push(r); }
  }
  log(`linki: ${urls.size} adresów w ${new Set(rows.map(r => r.city_slug)).size} miastach`);

  const dead = [], moved = [];
  for (const [url, refs] of urls) {
    const res = await check(url);
    const bad = res.status === 0 || res.status === 404 || res.status === 410;
    if (!DRY) await q(`INSERT INTO public.link_checks (url, status, final_url, error, city_slugs) VALUES ($1,$2,$3,$4,$5)`,
      [url, res.status, res.final ?? null, res.error ?? null, [...new Set(refs.map(r => r.city_slug))]]);
    if (bad) {
      // drugi zły wynik z rzędu = alarm
      const [prev] = await q(`SELECT status FROM public.link_checks WHERE url = $1 ORDER BY checked_at DESC OFFSET 1 LIMIT 1`, [url]);
      const twice = prev && (prev.status === 0 || prev.status === 404 || prev.status === 410);
      if (twice || DRY) dead.push({ url, res, refs });
    } else if (res.home) moved.push({ url, res, refs });
    await new Promise(r => setTimeout(r, 250));
  }

  // przypomnienia o godzinach
  const stale = rows.filter(r => r.hours_status === 'unverified'
    || (r.published_at && Date.now() - new Date(r.published_at) > 183 * 864e5 && !['parking', 'viewpoint', 'street', 'photo'].includes(r.category)));

  const byCity = {};
  const add = (city, thread, line) => { (byCity[city] ??= { thread, lines: [] }).lines.push(line); };
  for (const d of dead) for (const r of d.refs) add(r.city_slug, r.discord_thread_id, `🔗 martwy link (${d.res.status || d.res.error}) przy ${r.stop_key}: ${d.url}`);
  for (const m of moved) for (const r of m.refs) add(r.city_slug, r.discord_thread_id, `↪️ podstrona zniknęła (przekierowanie na główną) przy ${r.stop_key}: ${m.url}`);
  for (const r of stale) add(r.city_slug, r.discord_thread_id, `🕒 ${r.stop_key}: godziny otwarcia ${r.hours_status === 'unverified' ? 'niepotwierdzone' : 'sprawdzane ponad pół roku temu'} — sprawdzić na stronie oficjalnej`);

  if (!DRY) for (const [city, x] of Object.entries(byCity))
    await notify(x.thread ?? SUMMARY, `🔎 **${city} — przegląd linków i godzin**\n${x.lines.slice(0, 20).join('\n')}` +
      (x.lines.length > 20 ? `\n… i ${x.lines.length - 20} więcej` : '') + `\nZaproponuj JP poprawki (nowe źródło, aktualne godziny).`);
  const summary = `🔎 Przegląd linków (${new Date().toISOString().slice(0, 10)}): ${urls.size} adresów, martwych ${dead.length}, ` +
    `zniknętych podstron ${moved.length}, godzin do sprawdzenia ${stale.length}.`;
  if (!DRY) await notify(SUMMARY, summary);
  console.log(summary);
} catch (e) {
  console.error('BŁĄD:', e.message);
  if (!DRY) await notify(SUMMARY, `⚠️ Przegląd linków: ${e.message.slice(0, 400)}`);
  process.exitCode = 1;
} finally { await c.end(); }
