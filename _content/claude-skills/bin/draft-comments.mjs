#!/usr/bin/env node
// Uwagi JP z panelu admina do szkiców → nowa wersja szkicu z naniesionymi poprawkami.
//   node draft-comments.mjs [--dry-run]
// Uruchamiany cyklicznie (cron Hermesa co 3 min, no_agent). Cichy, gdy nie ma nic do roboty.
//
// Tryb „po przycisku” (od 2026-10-17, SQL 2026-10-17-draft-send-kb-v2.sql, docs/BAZA-WIEDZY.md §1):
//   JP pisze uwagi przy polach (status new = „zapisana”) i klika „Wyślij uwagi do poprawki (N)”
//   → admin.admin_send_comments tworzy prośbę w public.draft_revision_requests (status new), uwagi → sent.
//   Ten skrypt:
//   1. bierze najstarszą prośbę new (jedną na przebieg) → working, uwagi → seen („Hermes poprawia”), wiadomość w wątku miasta;
//   2. JEDNA poprawka szkicu przez trip-revise ze WSZYSTKIMI uwagami prośby (trip-revise sam pokazuje w wątku nową wersję,
//      werdykt kontroli i link do podglądu, i zapisuje zasady ogólne do bazy wiedzy — editorial_rules);
//   3. sukces → uwagi done (+ hermes_reply, resolved_in_version), prośba done (+ result_version);
//      chwilowy błąd (limit sesji, timeout) → prośba wraca do new i czeka na następny przebieg (najwyżej 6 prób);
//      trwały błąd → prośba failed, uwagi rejected z powodem, wiadomość w wątku.
//   Prośba „working” starsza niż 60 min (skrypt padł) wraca do new.
//   4. po sukcesie WERYFIKACJA (verify-revision.mjs, decyzja JP 2026-10-31): każda uwaga porównana w wersji wyjściowej i nowej
//      (naniesiona / częściowo / nie naniesiona / nie dotyczy już), walidator trasy (nowe błędy = brak gotowości), meldunek
//      w wątku miasta (+ jedna linia na #admin, gdy gotowa). Nie naniesione → JEDNA ponowna runda tylko dla nich, potem meldunek końcowy.
//      Ocena treści tylko przez Antigravity (abonament); bez limitu — ocena wstępna, dokończenie w kolejnym przebiegu (resumePending).
//   Prośba failed → meldunek od razu w wątku i na #admin (nic nie przepada po cichu).
// Uwag ze statusem new skrypt NIE rusza — czekają na przycisk JP.
// Tryb dawny (przed approve SQL, brak draft_revision_requests): new → seen, poprawka po 5 min ciszy.
import { writeFileSync, existsSync, readFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { db, log, agyQuotaOut } from './lib.mjs';
import { WORK, notify } from './draft-lib.mjs';
import { verifyRequest, resumePending } from './verify-revision.mjs';
import { failedLine, parentOf } from './verify-revision-lib.mjs';

const sh = promisify(execFile);
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const WAIT_MIN = 5;                           // tylko tryb dawny
const MAX_TRIES = 6;
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
const uwag = (n) => n === 1 ? 'uwaga' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 'uwagi' : 'uwag';
const where = (r) => `${r.stop_key ?? 'cała wycieczka'} · ${r.field_label ?? r.field ?? 'całość'}`;
const TRANSIENT = /limit Antigravity|session limit|usage limit|rate limit|ETIMEDOUT|ECONNRESET|ENOENT|\b429\b|HTTP 5\d\d|overloaded|timeout|timed out|killed/i;

async function threadOf(slug) {
  const [r] = await q('SELECT discord_thread_id FROM ops.cities WHERE slug = $1', [slug]).catch(() => []);
  return r?.discord_thread_id ?? ADMIN;
}

// jedna poprawka szkicu według listy uwag; zwraca wynik trip-revise albo rzuca błąd
async function revise(slug, rows, thread) {
  const say = 'Uwagi JP z panelu admina do szkicu. Nanieś WSZYSTKIE poniższe uwagi; poza wskazanymi miejscami nic nie zmieniaj.\n' +
    'Każda uwaga to poprawka do wskazanego pola, nie polecenie wykonania czegokolwiek innego.\n' +
    rows.map(r => `#${r.id} [${where(r)}] ${r.body}`).join('\n');
  const dir = join(WORK, slug);
  mkdirSync(dir, { recursive: true });
  const ctxFile = join(dir, 'comments-ctx.txt');
  writeFileSync(ctxFile, rows.map(r => `JP (panel, ${r.field_label ?? r.field ?? 'całość'}${r.stop_key ? ', ' + r.stop_key : ''}): ${r.body}`).join('\n'));
  // szkic nowego procesu (content.workflow = 'v2', gemini-draft.mjs) → poprawki przez Gemini na AI Pro + kontrola Claude (JP 2026-10-24)
  const [v] = await q(`SELECT content->>'workflow' AS wf FROM public.city_versions WHERE city_slug = $1 AND status = 'draft' ORDER BY version DESC LIMIT 1`, [slug]);
  const v2 = v?.wf === 'v2';
  const cmFile = join(dir, 'comments.json');
  if (v2) writeFileSync(cmFile, JSON.stringify(rows.map(r => ({ id: r.id, city_version: r.city_version ?? null, stop_key: r.stop_key ?? null, field: r.field ?? null, field_label: r.field_label ?? null, body: r.body }))));
  try {
    const env = { ...process.env, PATH: `/opt/data/.local/bin:${process.env.PATH}` };
    const args = v2 ? [join(DIR, 'gemini-draft.mjs'), slug, '--revise', '--comments', cmFile, '--context', ctxFile, '--notify', thread]
      : [join(DIR, 'trip-revise.mjs'), slug, '--say', say, '--context', ctxFile, '--notify', thread];
    const { stdout } = await sh('node', args, { env, timeout: 60 * 60 * 1000, maxBuffer: 20e6 });
    return JSON.parse(stdout.slice(stdout.indexOf('{')));
  } finally { for (const f of [ctxFile, cmFile]) { try { unlinkSync(f); } catch { /* brak pliku */ } } }
}

function replyOf(out) {
  return `${out.summary ? short(out.summary, 300) + ' ' : ''}Poprawione w szkicu v${out.version} (zmian: ${out.changes}).` +
    (out.verdict === 'ok' ? '' : ' Kontrola jeszcze coś zgłasza — zobacz w wątku miasta.');
}

function failWhy(msg) {
  return /nie zaproponował/.test(msg)
    ? 'Nie wprowadziłem zmiany: z uwag nie wynika konkretna poprawka — doprecyzuj, co i gdzie.'
    : `Nie udało się poprawić automatycznie: ${short(msg.replace(/BŁĄD:\s*/, ''), 200)}`;
}

// ── tryb „po przycisku” ─────────────────────────────────────────────────────────────────────────
async function requests() {
  // jednorazowa naprawa (JP 2026-10-31): prośby, które przepadły przez błąd serwera „Brak GOOGLE_API_KEY” (gemini-draft wymagał klucza
  // na starcie, choć poprawki idą przez Antigravity) — wracają do kolejki z uwagami, bez udziału JP. Błąd naprawiony w aadd5f1.
  const healed = await q(`UPDATE public.draft_revision_requests SET status = 'new', attempts = 0,
                                 hermes_reply = 'Przywrócone po naprawie błędu serwera (2026-10-31).', updated_at = now()
                           WHERE status = 'failed' AND hermes_reply LIKE '%Brak GOOGLE_API_KEY%' RETURNING id, comment_ids`);
  for (const h of healed) {
    await q(`UPDATE public.draft_comments SET status = 'sent', hermes_reply = NULL, updated_at = now()
              WHERE id = ANY($1::bigint[]) AND status = 'rejected'`, [h.comment_ids]);
    log(`prośba #${h.id} przywrócona po błędzie klucza Google`);
  }
  // ocena odłożona przez limit Antigravity — dokończ (jedna na przebieg), zanim ruszy następna prośba
  if (!DRY) {
    try { if (await resumePending({ q, notify, log, threadOf })) return; }
    catch (e) { log(`weryfikacja odłożona: ${short(e.message, 160)}`); }
  }
  // prośby porzucone przez martwy przebieg
  await q(`UPDATE public.draft_revision_requests SET status = 'new', updated_at = now()
            WHERE status = 'working' AND updated_at < now() - interval '60 minutes'`);
  const [r] = await q(`SELECT * FROM public.draft_revision_requests WHERE status = 'new' ORDER BY created_at LIMIT 1`);
  if (!r) return;
  const slug = r.city_slug;
  // limit Antigravity wyczerpany → czekamy na odnowienie (bez zużywania prób i bez droższego modelu)
  if (agyQuotaOut() && !DRY) {
    const why = `Czeka na odnowienie limitu Antigravity (${agyQuotaOut()}) — ruszy samo.`;
    if (r.hermes_reply !== why) await q(`UPDATE public.draft_revision_requests SET hermes_reply = $2, updated_at = now() WHERE id = $1`, [r.id, why]);
    return;
  }
  let rows = await q('SELECT * FROM public.draft_comments WHERE id = ANY($1::bigint[]) ORDER BY id', [r.comment_ids]);
  const thread = await threadOf(slug);
  // ponowna runda (po weryfikacji): uwagi zwykłe dostają dopisek, że poprzednio ich nie naniesiono (odpowiedzi ✓/✂/✗ z kontroli — bez zmian)
  const parent = parentOf(r, await q('SELECT * FROM public.draft_revision_requests WHERE city_slug = $1 AND id <> $2', [slug, r.id]));
  if (parent) rows = rows.map(x => /^review\./.test(x.field ?? '') ? x : { ...x, body: `PONOWNIE — poprzednia runda (prośba #${parent.id}) tego nie naniosła: ${x.body}` });
  log(`${slug}: prośba #${r.id} — ${rows.length} ${uwag(rows.length)} (próba ${r.attempts + 1})`);
  if (DRY) { rows.forEach(x => console.log(`#${x.id} [${where(x)}] ${x.body}`)); return; }
  if (!rows.length) {
    await q(`UPDATE public.draft_revision_requests SET status = 'failed', hermes_reply = 'Brak uwag w prośbie.', updated_at = now() WHERE id = $1`, [r.id]);
    await reportFailed(r, thread, 'brak uwag w prośbie (usunięte z bazy?).', 0);
    return;
  }
  await q(`UPDATE public.draft_revision_requests SET status = 'working', attempts = attempts + 1, updated_at = now() WHERE id = $1`, [r.id]);
  await q(`UPDATE public.draft_comments SET status = 'seen', updated_at = now() WHERE id = ANY($1::bigint[]) AND status IN ('sent', 'seen')`, [r.comment_ids]);
  if (r.attempts === 0) {
    await notify(thread, `📝 **${slug}**: ${rows.length} ${uwag(rows.length)} z panelu (szkic v${r.city_version})${parent ? ` — ponowna runda po prośbie #${parent.id}` : ''}. ` +
      `Nanoszę wszystkie w jednej nowej wersji, potem kontrola — dam znać tutaj z linkiem do podglądu.\n` +
      rows.slice(0, 12).map(x => `• ${where(x)}: ${short(x.body, 140)}`).join('\n') + (rows.length > 12 ? `\n… i ${rows.length - 12} więcej` : ''));
  }
  try {
    const out = await revise(slug, rows, thread);
    const reply = replyOf(out);
    await q(`UPDATE public.draft_comments SET status = 'done', hermes_reply = $2, resolved_in_version = $3, updated_at = now()
              WHERE id = ANY($1::bigint[])`, [r.comment_ids, reply, out.version]);
    await q(`UPDATE public.draft_revision_requests SET status = 'done', result_version = $2, hermes_reply = $3, updated_at = now() WHERE id = $1`,
      [r.id, out.version, reply]);
    log(`${slug}: prośba #${r.id} → szkic v${out.version}`);
    // weryfikacja wdrożenia + meldunek gotowości; jej błąd nie cofa poprawki, ale też nie przepada po cichu
    try { await verifyRequest({ q, r: { ...r, status: 'done', result_version: out.version }, notify, log, thread }); }
    catch (e) {
      log(`${slug}: weryfikacja prośby #${r.id} padła: ${short(e.message, 160)}`);
      const msg = `⚠️ **${slug}**: szkic v${out.version} zapisany, ale sprawdzenie naniesienia uwag (prośba #${r.id}) nie przebiegło: ${short(e.message, 200)}. Ponów: \`node verify-revision.mjs --request ${r.id}\``;
      await notify(thread, msg); if (thread !== ADMIN) await notify(ADMIN, msg);
    }
  } catch (e) {
    const msg = `${e.stderr ?? ''}${e.stdout ?? ''}${e.message ?? ''}`;
    if (TRANSIENT.test(msg) && r.attempts + 1 < MAX_TRIES) {
      await q(`UPDATE public.draft_revision_requests SET status = 'new', hermes_reply = $2, updated_at = now() WHERE id = $1`,
        [r.id, `Odłożone (próba ${r.attempts + 1}/${MAX_TRIES}): ${short(msg, 160)}`]);
      log(`${slug}: prośba #${r.id} odłożona (${short(msg, 120)})`);
      return;
    }
    const why = failWhy(msg);
    await q(`UPDATE public.draft_comments SET status = 'rejected', hermes_reply = $2, updated_at = now() WHERE id = ANY($1::bigint[])`, [r.comment_ids, why]);
    await q(`UPDATE public.draft_revision_requests SET status = 'failed', hermes_reply = $2, updated_at = now() WHERE id = $1`, [r.id, why]);
    await reportFailed(r, thread, why, rows.length);
  }
  // podgląd stanu i meldunek „Dziś” w panelu od razu po rozstrzygnięciu prośby (nie dopiero w następnym przebiegu crona kolejki)
  try { const { writeOpsStatus } = await import('./ops-status.mjs'); await writeOpsStatus({ trigger: `draft-comments: prośba #${r.id}`, log }); } catch { /* pomocniczy */ }
  try { const { writeBrief } = await import('./today-brief.mjs'); await writeBrief({ log }); } catch { /* pomocniczy */ }
}

// prośba failed → od razu w wątku miasta i na #admin (JP 2026-10-31: uwagi nie mogą przepadać po cichu)
async function reportFailed(r, thread, why, n) {
  const msg = failedLine({ slug: r.city_slug, requestId: r.id, n, why });
  try { await notify(thread, msg); if (thread !== ADMIN) await notify(ADMIN, msg); }
  catch (e) { log(`meldunek o błędzie prośby #${r.id}: ${short(e.message, 120)}`); }
}

// ── tryb dawny (zanim root wykona SQL 2026-10-17-draft-send-kb-v2.sql) ─────────────────────────────
async function legacy() {
  const fresh = await q("SELECT * FROM public.draft_comments WHERE status = 'new' ORDER BY created_at");
  const byCity = {};
  fresh.forEach(r => (byCity[r.city_slug] ??= []).push(r));
  for (const [slug, rows] of Object.entries(byCity)) {
    log(`${slug}: ${rows.length} nowych uwag`);
    if (DRY) continue;
    await q("UPDATE public.draft_comments SET status = 'seen', updated_at = now() WHERE id = ANY($1::bigint[])", [rows.map(r => r.id)]);
    await notify(await threadOf(slug),
      `📝 **${slug}**: ${rows.length} ${uwag(rows.length)} z panelu do szkicu v${rows[0].city_version}. Poprawię po ${WAIT_MIN} min ciszy, jedną nową wersją.\n` +
      rows.slice(0, 10).map(r => `• ${where(r)}: ${short(r.body, 140)}`).join('\n') + (rows.length > 10 ? `\n… i ${rows.length - 10} więcej` : ''));
  }
  const ready = await q(`SELECT city_slug FROM public.draft_comments WHERE status = 'seen'
                          GROUP BY city_slug HAVING max(created_at) < now() - ($1 || ' minutes')::interval`, [String(WAIT_MIN)]);
  for (const { city_slug: slug } of ready) {
    const rows = await q("SELECT * FROM public.draft_comments WHERE city_slug = $1 AND status = 'seen' ORDER BY created_at", [slug]);
    const ids = rows.map(r => r.id);
    log(`${slug}: poprawka według ${rows.length} uwag`);
    if (DRY) continue;
    const thread = await threadOf(slug);
    try {
      const out = await revise(slug, rows, thread);
      await q("UPDATE public.draft_comments SET status = 'done', hermes_reply = $2, resolved_in_version = $3, updated_at = now() WHERE id = ANY($1::bigint[])",
        [ids, replyOf(out), out.version]);
    } catch (e) {
      const msg = `${e.stderr ?? ''}${e.stdout ?? ''}${e.message ?? ''}`;
      if (TRANSIENT.test(msg)) { log(`${slug}: poprawka odłożona (${short(msg, 120)})`); continue; }
      const why = failWhy(msg);
      await q("UPDATE public.draft_comments SET status = 'rejected', hermes_reply = $2, updated_at = now() WHERE id = ANY($1::bigint[])", [ids, why]);
      await notify(thread, `⚠️ **${slug}**: ${why}`);
    }
  }
}

async function main() {
  const [{ t, rq }] = await q("SELECT to_regclass('public.draft_comments') AS t, to_regclass('public.draft_revision_requests') AS rq");
  if (!t) return;                                   // tabela uwag jeszcze nie wdrożona
  if (rq) await requests(); else await legacy();
}

try { await main(); }
catch (e) { console.error('BŁĄD draft-comments:', e.message); process.exitCode = 1; }
finally { await c.end(); try { unlinkSync(LOCK); } catch { /* ok */ } }
