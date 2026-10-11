#!/usr/bin/env node
// Zgłoszenia od rodzin („Zgłoś błąd” na stronie) → wątek miasta na Discordzie. Cron co 10 minut.
//   node reports-relay.mjs [--dry]
// Hermes w wątku: oceń zgłoszenie (sprawdź na stronie oficjalnej / w Google), zaproponuj JP poprawkę
// (trip-revise), a po decyzji oznacz: UPDATE ops.reports SET status = 'fixed'|'rejected' WHERE id = …
import { db, env, log } from './lib.mjs';
import { notify } from './draft-lib.mjs';

const DRY = process.argv.includes('--dry');
const FALLBACK = env('QUOLINO_REPORTS_CHANNEL') ?? '#lokale';
const TYPE = { closed: 'zamknięte', wrong_hours: 'godziny', wrong_price: 'cena', wrong_address: 'adres / dojście', other: 'inne' };

const c = await db();
const q = async (sql, p) => (await c.query(sql, p)).rows;
try {
  // „zamknij zgłoszenie”: node reports-relay.mjs --close <pierwsze 8 znaków id> fixed|rejected
  const ci = process.argv.indexOf('--close');
  if (ci > -1) {
    const [id8, st] = process.argv.slice(ci + 1);
    if (!/^[0-9a-f]{6,}$/.test(id8 ?? '') || !['fixed', 'rejected', 'reviewed'].includes(st)) throw new Error('--close <id8> fixed|rejected|reviewed');
    const hit = await q(`SELECT id FROM ops.reports WHERE id::text LIKE $1 || '%'`, [id8]);
    if (hit.length !== 1) { console.log(`Znaleziono ${hit.length} zgłoszeń — podaj dłuższy początek id`); process.exit(1); }
    const [r] = await q(`UPDATE ops.reports SET status = $2 WHERE id = $1 RETURNING id, city_slug`, [hit[0].id, st]);
    console.log(`Zgłoszenie ${r.id} (${r.city_slug}): ${st}`);
    process.exit(0);
  }
  const rows = await q(`
    SELECT r.id, r.city_slug, r.stop_id, r.stop_name, r.type, r.message, r.lang, r.created_at, oc.discord_thread_id,
           (SELECT count(*) FROM ops.reports x WHERE x.city_slug = r.city_slug AND x.stop_id = r.stop_id
              AND x.created_at > now() - interval '90 days') AS same_stop
      FROM ops.reports r LEFT JOIN ops.cities oc ON oc.slug = r.city_slug
     WHERE r.relayed_at IS NULL AND r.status = 'new'
     ORDER BY r.created_at LIMIT 30`);
  for (const r of rows) {
    const text = `📣 **Zgłoszenie od rodziny** — ${r.city_slug}, przystanek ${r.stop_id}${r.stop_name ? ` (${r.stop_name})` : ''}\n` +
      `Rodzaj: ${TYPE[r.type] ?? r.type} · język strony: ${r.lang}${r.same_stop > 1 ? ` · to ${r.same_stop}. zgłoszenie tego przystanku w 90 dni` : ''}\n` +
      `> ${String(r.message).replace(/\n+/g, ' ').slice(0, 900)}\n` +
      `Sprawdź (strona oficjalna / Google) i zaproponuj JP poprawkę. Zgłoszenie #${r.id.slice(0, 8)}.`;
    if (DRY) { console.log(text); continue; }
    const ok = await notify(r.discord_thread_id ?? FALLBACK, text);
    if (ok) await q('UPDATE ops.reports SET relayed_at = now() WHERE id = $1', [r.id]);
  }
  if (rows.length) log(`zgłoszenia: przekazane ${rows.length}`);
} catch (e) { console.error('BŁĄD:', e.message); process.exitCode = 1; }
finally { await c.end(); }
