#!/usr/bin/env node
// Uwagi JP z panelu admina do szkiców → poprawka szkicu (od 2026-10-16; _admin/README.md §„Uwagi do szkiców → Hermes”).
//   node draft-comments.mjs [--dry-run] [--wait-min 5]
// Uruchamiany cyklicznie (cron Hermesa, no_agent). Cichy, gdy nie ma nic do roboty.
//   1. status 'new'  → 'seen' + jedna wiadomość w wątku miasta (przystanek, pole, treść)
//   2. gdy od ostatniej uwagi do miasta minęło --wait-min minut (JP pisze kilka naraz) → JEDNA poprawka szkicu
//      przez trip-revise (zbiera wszystkie otwarte uwagi miasta), potem 'done' + hermes_reply + resolved_in_version
//   3. gdy poprawka nic nie zmieniła / odrzuciła uwagę → 'rejected' z powodem; limit sesji Claude → uwagi czekają dalej
// Zasady ogólne z uwag zapisuje trip-revise (learn → editorial_rules), tak jak przy poprawkach z rozmowy.
import { writeFileSync, existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { db, log } from './lib.mjs';
import { WORK, notify } from './draft-lib.mjs';

const sh = promisify(execFile);
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const wi = argv.indexOf('--wait-min');
const WAIT_MIN = wi > -1 ? +argv[wi + 1] : 5;
const ADMIN = '1558873867643134073';          // #admin: gdy miasto nie ma jeszcze wątku
const LOCK = join(WORK, '..', 'draft-comments.lock');
const DIR = new URL('.', import.meta.url).pathname;

if (existsSync(LOCK)) {
  try { process.kill(+readFileSync(LOCK, 'utf8'), 0); process.exit(0); } catch { /* martwy PID — przejmujemy */ }
}
if (!DRY) writeFileSync(LOCK, String(process.pid));
const c = await db();
const q = async (sql, p) => (await c.query(sql, p)).rows;
const short = (s, n = 160) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);
const where = (r) => `${r.stop_key ?? 'cała wycieczka'} · ${r.field_label ?? 'całość'}`;

async function threadOf(slug) {
  const [r] = await q('SELECT discord_thread_id FROM ops.cities WHERE slug = $1', [slug]).catch(() => []);
  return r?.discord_thread_id ?? ADMIN;
}

async function main() {
  const [{ t }] = await q("SELECT to_regclass('public.draft_comments') AS t");
  if (!t) return;                                   // tabela jeszcze nie wdrożona (czeka na approve)

  // 1) nowe → seen + informacja w wątku
  const fresh = await q("SELECT * FROM public.draft_comments WHERE status = 'new' ORDER BY created_at");
  const byCity = {};
  fresh.forEach(r => (byCity[r.city_slug] ??= []).push(r));
  for (const [slug, rows] of Object.entries(byCity)) {
    log(`${slug}: ${rows.length} nowych uwag`);
    if (DRY) continue;
    await q("UPDATE public.draft_comments SET status = 'seen', updated_at = now() WHERE id = ANY($1::bigint[])", [rows.map(r => r.id)]);
    await notify(await threadOf(slug),
      `📝 **${slug}**: ${rows.length} ${rows.length === 1 ? 'uwaga' : 'uwag'} z panelu do szkicu v${rows[0].city_version}. Poprawię po ${WAIT_MIN} min ciszy, jedną nową wersją.\n` +
      rows.slice(0, 10).map(r => `• ${where(r)}: ${short(r.body, 140)}`).join('\n') + (rows.length > 10 ? `\n… i ${rows.length - 10} więcej` : ''));
  }

  // 2) miasta z otwartymi uwagami, w których JP przestał pisać
  const ready = await q(`SELECT city_slug FROM public.draft_comments WHERE status = 'seen'
                          GROUP BY city_slug HAVING max(created_at) < now() - ($1 || ' minutes')::interval`, [String(WAIT_MIN)]);
  for (const { city_slug: slug } of ready) {
    const rows = await q("SELECT * FROM public.draft_comments WHERE city_slug = $1 AND status = 'seen' ORDER BY created_at", [slug]);
    const say = 'Uwagi JP z panelu admina do szkicu. Popraw TYLKO wskazane miejsca, resztę zostaw bez zmian:\n' +
      rows.map(r => `#${r.id} [${where(r)}] ${r.body}`).join('\n');
    const ctxFile = join(WORK, slug, 'comments-ctx.txt');
    log(`${slug}: poprawka według ${rows.length} uwag`);
    if (DRY) { console.log(say); continue; }
    writeFileSync(ctxFile, rows.map(r => `JP (panel, ${r.field_label ?? 'całość'}${r.stop_key ? ', ' + r.stop_key : ''}): ${r.body}`).join('\n'));
    const ids = rows.map(r => r.id);
    try {
      const env = { ...process.env, PATH: `/opt/data/.local/bin:${process.env.PATH}` };
      const { stdout } = await sh('node', [join(DIR, 'trip-revise.mjs'), slug, '--say', say, '--context', ctxFile, '--notify', await threadOf(slug)],
        { env, timeout: 40 * 60 * 1000, maxBuffer: 20e6 });
      const out = JSON.parse(stdout.slice(stdout.indexOf('{')));
      const reply = `${out.summary ? short(out.summary, 300) + ' ' : ''}Zmian w szkicu: ${out.changes}.${out.verdict === 'ok' ? '' : ' Kontrola jeszcze coś zgłasza — zobacz w wątku.'}`;
      await q("UPDATE public.draft_comments SET status = 'done', hermes_reply = $2, resolved_in_version = $3, updated_at = now() WHERE id = ANY($1::bigint[])",
        [ids, reply, out.version]);
    } catch (e) {
      const msg = `${e.stderr ?? ''}${e.stdout ?? ''}${e.message ?? ''}`;
      if (/session limit|ETIMEDOUT|ENOENT|429|timeout/i.test(msg)) {         // przejściowe — uwagi czekają na następny przebieg
        log(`${slug}: poprawka odłożona (${short(msg, 120)})`);
        continue;
      }
      const why = /nie zaproponował/.test(msg) ? 'Nie wprowadziłem zmiany: z uwagi nie wynika konkretna poprawka — doprecyzuj, co i gdzie.' : `Nie udało się poprawić automatycznie: ${short(msg.replace(/BŁĄD:\s*/, ''), 200)}`;
      await q("UPDATE public.draft_comments SET status = 'rejected', hermes_reply = $2, updated_at = now() WHERE id = ANY($1::bigint[])", [ids, why]);
      await notify(await threadOf(slug), `⚠️ **${slug}**: ${why}`);
    } finally { try { unlinkSync(ctxFile); } catch { /* brak pliku */ } }
  }
}

try { await main(); }
catch (e) { console.error('BŁĄD draft-comments:', e.message); process.exitCode = 1; }
finally { await c.end(); try { unlinkSync(LOCK); } catch { /* ok */ } }
