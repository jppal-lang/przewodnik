#!/usr/bin/env node
// Zapas szkiców (JP 2026-11-12: „za mało produkujemy tras, powinienem mieć 3 szkice do przodu gotowe”).
// Liczy trasy w drodze: szkice czekające na JP (city_versions.status = 'draft') + zadania draft/gemini queued/running.
// Gdy mniej niż ustawienie drafts_ahead (domyślnie 3, panel → Ustawienia), dokłada następne miasta z planu tras
// (admin.trip_next: te same reguły co po publikacji: pomija opublikowane w nowym procesie, szkice w toku i miasta z zadaniem).
// Koszt: kolejka pisze szkice na Antigravity z abonamentu (0 $); limit tygodniowy pilnuje gemini-queue.mjs (alerty 50/80/90 %).
//   node drafts-ahead.mjs [--dry]       (cron co godzinę)
import { db, log } from './lib.mjs';
import { enqueue } from './trip-enqueue-lib.mjs';

const DRY = process.argv.includes('--dry');

export async function topUp(q, { dry = false } = {}) {
  const target = Math.min(6, Math.max(0, +((await q(`SELECT value FROM ops.app_settings WHERE name = 'drafts_ahead'`).catch(() => []))[0]?.value ?? 3) || 0));
  const [{ n }] = await q(`
    SELECT count(*)::int AS n FROM (
      SELECT city_slug FROM public.city_versions WHERE status = 'draft'
      UNION
      SELECT city_slug FROM ops.jobs WHERE kind = 'draft' AND worker = 'gemini' AND status IN ('queued', 'running')) x`);
  const added = [];
  for (let have = n; have < target; have++) {
    // region ostatnio opublikowanej trasy — plan idzie regionami (Umbria → Marche → Emilia-Romania)
    const [last] = await q(`SELECT c.region_slug FROM public.city_versions v JOIN public.cities c ON c.slug = v.city_slug
                             WHERE v.published_at IS NOT NULL ORDER BY v.published_at DESC LIMIT 1`);
    const [{ nxt } = {}] = await q(`SELECT admin.trip_next($1, NULL) AS nxt`, [last?.region_slug ?? null]);
    if (!nxt) break;                                          // plan wyczerpany
    if (dry) { added.push(`${nxt.slug} (próba)`); break; }    // próba: bez zapisu następne wywołanie dałoby to samo miasto
    const r = await enqueue({ slug: nxt.slug, name: nxt.name, region: nxt.region, country: nxt.country, duration: nxt.duration, brief: '', fresh: !!nxt.fresh }, q);
    if (!r.created) break;                                    // to miasto ma już zadanie — nie kręcimy się w kółko
    added.push(`${nxt.slug} #${r.id}`);
  }
  return { target, in_progress: n, added };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const c = await db();
  try {
    const r = await topUp(async (sql, p) => (await c.query(sql, p)).rows, { dry: DRY });
    if (r.added.length) log(`drafts-ahead: w drodze ${r.in_progress}/${r.target}, dodane: ${r.added.join(', ')}`);
  } catch (e) { console.error(`drafts-ahead: ${e.message}`); process.exitCode = 1; }
  finally { await c.end(); }
}
