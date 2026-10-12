#!/usr/bin/env node
// Kolejka tłumaczeń (decyzja JP 2026-10-12): po zatwierdzeniu wycieczki trip-approve wrzuca zlecenie
// do ops.jobs (kind translate, status queued) — ten skrypt (cron co 20 min) bierze najstarsze i tłumaczy.
//   node translate-queue.mjs [--dry]
// • jedno tłumaczenie naraz (blokada pliku + sprawdzenie zleceń „running”),
// • kilka zleceń dla tego samego miasta = jedno uruchomienie (pozostałe oznaczone „połączone”),
// • tłumaczy tylko to, co się zmieniło (trip-translate liczy różnicę względem poprzedniej wersji),
// • dzienny limit płatnych modeli wyczerpany → zlecenie wraca do kolejki na następny przebieg,
// • wynik w wątku miasta, błąd także na kanale alarmów (ALERT_WEBHOOK).
import { openSync, closeSync, existsSync, statSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { db, env, log, run, paidToday, DAILY_USD } from './lib.mjs';
import { notify } from './draft-lib.mjs';

const DRY = process.argv.includes('--dry');
const WORK = '/opt/data/quolino/work/translate';
const LOCK = `${WORK}/.queue.lock`;
const STALE_H = 6;                         // „running” starsze niż 6 h = przerwane (restart kontenera)

mkdirSync(WORK, { recursive: true });
if (existsSync(LOCK) && Date.now() - statSync(LOCK).mtimeMs < STALE_H * 3600e3) { log('tłumaczenie w toku — czekam'); process.exit(0); }
let fd;
try { fd = openSync(LOCK, 'wx'); } catch { try { unlinkSync(LOCK); fd = openSync(LOCK, 'wx'); } catch { process.exit(0); } }
writeFileSync(LOCK, String(process.pid));

const alert = async (msg) => {
  const hook = env('ALERT_WEBHOOK');
  if (hook) await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: msg.slice(0, 1900) }) }).catch(() => {});
};

const c = await db();
const q = async (sql, p) => (await c.query(sql, p)).rows;
async function main() {
  // przerwane wcześniej (np. restart) → z powrotem do kolejki
  await q(`UPDATE ops.jobs SET status = 'queued' WHERE kind = 'translate' AND status = 'running'
             AND coalesce(started_at, created_at) < now() - interval '${STALE_H} hours'`).catch(() => {});
  const [running] = await q(`SELECT id FROM ops.jobs WHERE kind = 'translate' AND status = 'running' LIMIT 1`);
  if (running) { log(`zlecenie ${running.id} w toku — czekam`); return; }

  const [jobRow] = await q(`SELECT j.id, j.city_slug, c.discord_thread_id AS thread
      FROM ops.jobs j LEFT JOIN ops.cities c ON c.slug = j.city_slug
     WHERE j.kind = 'translate' AND j.status = 'queued' AND j.city_slug IS NOT NULL
     ORDER BY j.created_at, j.id LIMIT 1`);
  if (!jobRow) return;

  const used = paidToday();
  if (used >= DAILY_USD) { log(`dzienny limit płatnych modeli ($${used.toFixed(2)}) — tłumaczenie ${jobRow.city_slug} poczeka`); return; }

  // pozostałe zlecenia tego miasta połącz z tym (jedno tłumaczenie obejmie najnowszą wersję)
  const dup = await q(`SELECT id FROM ops.jobs WHERE kind = 'translate' AND status = 'queued' AND city_slug = $1 AND id <> $2`, [jobRow.city_slug, jobRow.id]);
  if (DRY) { console.log(`[dry] przetłumaczyłbym ${jobRow.city_slug} (zlecenie ${jobRow.id}${dup.length ? `, połączone: ${dup.map(d => d.id).join(', ')}` : ''})`); return; }
  if (dup.length) await q(`UPDATE ops.jobs SET status = 'done', result = $2, finished_at = now() WHERE id = ANY($1::bigint[])`,
    [dup.map(d => d.id), `połączone ze zleceniem ${jobRow.id}`]).catch(() => {});
  await q(`UPDATE ops.jobs SET started_at = now() WHERE id = $1`, [jobRow.id]).catch(() => {});

  log(`tłumaczę ${jobRow.city_slug} (zlecenie ${jobRow.id})`);
  if (jobRow.thread) await notify(jobRow.thread, `🌍 Tłumaczę zatwierdzoną wersję ${jobRow.city_slug} na pozostałe języki (tylko zmienione pola). Dam znać, gdy skończę.`);
  const t0 = Date.now();
  const r = await run(process.execPath, [new URL('./trip-translate.mjs', import.meta.url).pathname, jobRow.city_slug, '--job', String(jobRow.id)], { timeout: 5 * 3600e3 });
  const out = (r.out + '\n' + r.err).trim();
  const [after] = await q(`SELECT status, result FROM ops.jobs WHERE id = $1`, [jobRow.id]);
  const min = Math.round((Date.now() - t0) / 60e3);

  if (/dzienny limit płatnych/.test(out) && after?.status !== 'done') {
    await q(`UPDATE ops.jobs SET status = 'queued' WHERE id = $1`, [jobRow.id]);
    if (jobRow.thread) await notify(jobRow.thread, `⏸ Tłumaczenie ${jobRow.city_slug} wstrzymane: dzienny limit płatnych modeli. Dokończę jutro automatycznie.`);
  } else if (r.code === 0 && after?.status === 'done') {
    let s = after.result; try { s = JSON.parse(after.result); } catch {}
    const txt = typeof s === 'object' && s ? Object.entries(s).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ') : String(s ?? '');
    if (jobRow.thread) await notify(jobRow.thread, `✅ ${jobRow.city_slug}: tłumaczenia gotowe (${min} min). ${txt.slice(0, 1500)}`);
  } else {
    const why = (after?.result || out).slice(-800);
    if (jobRow.thread) await notify(jobRow.thread, `⚠️ ${jobRow.city_slug}: tłumaczenie nieudane (${min} min). ${why}`);
    await alert(`⚠️ Quolino: tłumaczenie ${jobRow.city_slug} (zlecenie ${jobRow.id}) nieudane: ${why}`);
  }
}
try { await main(); } catch (e) {
  log('kolejka tłumaczeń:', e.message);
  await alert(`⚠️ Quolino: kolejka tłumaczeń — ${e.message}`);
} finally {
  await c.end().catch(() => {});
  try { closeSync(fd); unlinkSync(LOCK); } catch {}
}
