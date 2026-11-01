// Akceptacja grafik w panelu admina (JP 2026-11-01: „temat akceptacji ikon, niech to będzie przez panel admina”).
// Wspólny moduł dla place-icons.mjs (ikony miejsc), quo-icons.mjs (pozy Quo) i game-art.mjs (paczki grafik gry):
//   1. po wygenerowaniu: publishPreview() wrzuca podgląd do repo (media/icons/_review/… albo gra/art/_review/…, commit przez repo.sh —
//      pliki strony są publiczne, nic poufnego), requestReview() wpisuje wiersz 'pending' do ops.art_requests
//      (SQL 2026-11-01-akceptacja-grafik.sql); Discord dostaje jedno zdanie z linkiem do panelu (notifyLine);
//   2. cron „watch” skryptu woła poll(kind, handlers): accepted → to, co dotąd „ok”; fix → to, co „fix <uwagi>” (nowa wersja = nowy
//      wiersz pending, stary → superseded); rejected → skrypt oznacza grafikę i nie generuje dalej bez nowego polecenia;
//   3. odpowiedź „ok” w wątku Discorda nadal działa — skrypt zamyka wtedy wiersz sam (closePending).
// Bez bazy (SQL jeszcze nie wdrożony) wszystko zwraca null i skrypty działają po staremu (pełny post na Discordzie, „odpisz ok”).
// Czyste funkcje (previewPath, actionFor, commonsThumb, notifyLine, inputsFromRefs) są w art-review-lib.mjs (testy: art-review.test.mjs).
import { existsSync, mkdirSync, copyFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { db, log, run } from './lib.mjs';
import { KINDS, safeKey, previewPath, runDecisions } from './art-review-lib.mjs';
export * from './art-review-lib.mjs';
const MAX_MORE_BYTES = 6e6;   // dodatkowe pliki (gif animacji) kopiowane 1:1 — większe pomijamy

// ── podgląd w repo ────────────────────────────────────────────────────────────────────────────
const PY = `
import sys, json
from PIL import Image
job = json.loads(sys.argv[1])
im = Image.open(job['src'])
alpha = im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info)
im = im.convert('RGBA' if alpha else 'RGB')
im.thumbnail((int(job.get('max', 1024)), int(job.get('max', 1024))), Image.LANCZOS)
im.save(job['dst'], 'WEBP', quality=int(job.get('q', 85)), method=6)
print(json.dumps({'w': im.size[0], 'h': im.size[1], 'alpha': alpha}))
`;
// src (png/jpg) → <repo>/<REVIEW_DIR>/<key>-vN.webp (+ more: pliki kopiowane 1:1, np. gif animacji) → repo.sh publish.
// Zwraca { preview, more } (ścieżki względem repo) albo null, gdy nie udało się opublikować (wtedy skrypt działa po staremu).
// sync = false: bez pull/publish (przeniesienie zaległych — jeden commit na wszystkie, publishRepo()).
// Bez tabeli ops.art_requests (SQL niewdrożony) nic nie trafia do repo — skrypt od razu działa po staremu.
export async function publishPreview({ repo, repoSh, src, kind, key, v, title, more = [], sync = true }) {
  try {
    if (!(await ready())) return null;
    const rel = previewPath(kind, key, v), dst = join(repo, rel);
    if (sync) {
      const pull = await run('sh', [repoSh, 'pull'], { timeout: 120_000 });
      if (pull.code !== 0) throw new Error(`repo pull: ${(pull.err || pull.out).slice(-200)}`);
    }
    mkdirSync(dirname(dst), { recursive: true });
    const r = await run('python3', ['-c', PY, JSON.stringify({ src, dst, max: kind === 'game_art' ? 1600 : 1024 })], { timeout: 120_000 });
    if (r.code !== 0) throw new Error(`WebP podglądu: ${r.err.slice(-200)}`);
    const extra = [];
    for (const [i, m] of more.entries()) {
      if (!existsSync(m) || statSync(m).size > MAX_MORE_BYTES) continue;
      const ext = (m.split('.').pop() || 'bin').toLowerCase();
      if (!/^(gif|png|jpe?g|webp)$/.test(ext)) continue;
      const mrel = previewPath(kind, key, v, `${i + 1}.${ext}`);
      copyFileSync(m, join(repo, mrel)); extra.push(mrel);
    }
    if (sync && !(await publishRepo(repoSh, `podgląd grafiki do akceptacji w panelu: ${String(title).slice(0, 120)} (v${v})`))) return null;
    return { preview: rel, more: extra };
  } catch (e) { log(`podgląd ${kind} ${key} v${v}: ${e.message} — bez panelu, po staremu`); return null; }
}
export async function pullRepo(repoSh) {
  const r = await run('sh', [repoSh, 'pull'], { timeout: 120_000 });
  if (r.code !== 0) { log(`repo pull: ${(r.err || r.out).slice(-200)}`); return false; }
  return true;
}
export async function publishRepo(repoSh, msg) {
  const pub = await run('sh', [repoSh, 'publish', msg], { timeout: 5 * 60_000 });
  if (pub.code !== 0 || /BŁĄD/.test(pub.out)) { log(`repo publish: ${(pub.err || pub.out).slice(-200)}`); return false; }
  return true;
}

// ── baza ──────────────────────────────────────────────────────────────────────────────────────
async function withDb(fn, what) {
  let c;
  try { c = await db(); return await fn(c); }
  catch (e) { log(`${what}: baza niedostępna (${String(e.message).slice(0, 160)})`); return null; }
  finally { try { await c?.end(); } catch { /* już zamknięte */ } }
}
// czy baza ma tabelę grafik (SQL 2026-11-01-akceptacja-grafik.sql wdrożony) — wynik zapamiętany na czas procesu
let readyCache = null;
export async function ready() {
  if (readyCache !== null) return readyCache;
  const r = await withDb(async (c) => !!(await c.query(`SELECT to_regclass('ops.art_requests') IS NOT NULL AS ok`)).rows[0].ok, 'ready');
  readyCache = r === true;
  if (!readyCache) log('panel grafik niedostępny (brak ops.art_requests — SQL 2026-11-01-akceptacja-grafik.sql) — po staremu, przez Discord');
  return readyCache;
}
// nowy wiersz 'pending' (poprzednie 'pending' tego samego klucza → 'superseded'); zwraca id albo null.
// onlyNew (przeniesienie zaległych): istniejący wiersz tej wersji zostaje jak jest (nie cofamy decyzji JP do 'pending').
export async function requestReview({ kind, key, title, version = 1, preview = null, inputs = [], more = [], meta = {}, onlyNew = false }) {
  if (!KINDS[kind] || !safeKey(key)) { log(`requestReview: zły rodzaj/klucz ${kind} ${key}`); return null; }
  return withDb(async (c) => {
    if (onlyNew) {
      const { rows: [ex] } = await c.query(`SELECT id FROM ops.art_requests WHERE kind = $1 AND key = $2 AND version = $3`, [kind, key, +version || 1]);
      if (ex) return ex.id;
    }
    await c.query(`UPDATE ops.art_requests SET status = 'superseded', handled_at = now(), result = 'zastąpiona wersją ' || $3
                    WHERE kind = $1 AND key = $2 AND status = 'pending'`, [kind, key, +version]);
    const { rows: [r] } = await c.query(
      `INSERT INTO ops.art_requests (kind, key, title, version, preview_urls, meta) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (kind, key, version) DO UPDATE SET title = EXCLUDED.title, preview_urls = EXCLUDED.preview_urls, meta = EXCLUDED.meta,
         status = 'pending', note = NULL, decided_at = NULL, decided_by = NULL, handled_at = NULL, result = NULL, created_at = now()
       RETURNING id`, [kind, key, String(title).slice(0, 200), +version || 1, JSON.stringify({ preview, inputs, more }), JSON.stringify(meta ?? {})]);
    log(`panel: grafika do akceptacji #${r.id} (${KINDS[kind]} ${key} v${version})`);
    return r.id;
  }, 'requestReview');
}
// JP odpowiedział na Discordzie („ok” / uwagi) — zamykamy wiersz, żeby nie wisiał w panelu
export async function closePending(kind, key, status, result) {
  if (!['accepted', 'fix', 'rejected', 'superseded'].includes(status)) return null;
  return withDb(async (c) => {
    const r = await c.query(`UPDATE ops.art_requests SET status = $3, decided_at = now(), decided_by = 'JP (Discord)', handled_at = now(), result = $4
                              WHERE kind = $1 AND key = $2 AND status = 'pending'`, [kind, key, status, String(result ?? '').slice(0, 300)]);
    return r.rowCount ?? 0;
  }, 'closePending');
}
export async function fetchDecided(kind) {
  return withDb(async (c) => (await c.query(`SELECT id, kind, key, title, version, status, note, meta, handled_at, decided_at FROM ops.art_requests
    WHERE kind = $1 AND status IN ('accepted', 'fix', 'rejected') AND handled_at IS NULL ORDER BY decided_at, id`, [kind])).rows, 'fetchDecided');
}
export async function markHandled(id, result, { done = true, tries = null } = {}) {
  return withDb(async (c) => {
    await c.query(`UPDATE ops.art_requests SET handled_at = CASE WHEN $2 THEN now() ELSE handled_at END, result = $3,
                     meta = meta || jsonb_build_object('handle_tries', $4::int) WHERE id = $1`, [id, !!done, String(result ?? '').slice(0, 500), tries ?? 0]);
    return true;
  }, 'markHandled');
}
export async function pendingCount(kind = null) {
  return withDb(async (c) => +(await c.query(`SELECT count(*)::int AS n FROM ops.art_requests WHERE status = 'pending' ${kind ? 'AND kind = $1' : ''}`, kind ? [kind] : [])).rows[0].n, 'pendingCount');
}
// ── jednorazowe przeniesienie zaległych (grafiki wygenerowane przed panelem, czekające na „ok” na Discordzie) ──
// Każdy skrypt ma komendę `to-panel` (place-icons / quo-icons / game-art): wiersze 'review' bez review_id → podgląd do repo
// (jeden commit) + wiersz pending (onlyNew). place-icons.mjs watch woła migrateOnce() przy każdym przebiegu, dopóki nie przejdzie
// wszystko (znacznik work/art-review/migrated-2026-11-01.json); bez bazy (SQL niewdrożony) czeka i próbuje dalej. Ręcznie:
//   node art-review.mjs migrate [--force]
const WORK_AR = '/opt/data/quolino/work/art-review', MIGRATE_F = join(WORK_AR, 'migrated-2026-11-01.json');
export const MIGRATE_SCRIPTS = ['place-icons.mjs', 'quo-icons.mjs', 'game-art.mjs'];
export async function migrateOnce({ force = false } = {}) {
  if (!force && existsSync(MIGRATE_F)) return { skipped: true };
  if (!(await ready())) return { waiting: true };
  const dir = new URL('.', import.meta.url).pathname, out = {};
  let ok = true;
  for (const s of MIGRATE_SCRIPTS) {
    if (!existsSync(join(dir, s))) continue;
    const r = await run('node', [join(dir, s), 'to-panel'], { timeout: 20 * 60_000 });
    out[s] = { code: r.code, out: String(r.out || r.err || '').trim().split('\n').slice(-3).join(' | ').slice(0, 300) };
    if (r.code !== 0) { ok = false; log(`przeniesienie do panelu (${s}): ${out[s].out}`); }
  }
  if (ok) { mkdirSync(WORK_AR, { recursive: true }); writeFileSync(MIGRATE_F, JSON.stringify({ at: new Date().toISOString(), out }, null, 1)); }
  return { ok, out };
}

// decyzje z panelu → runDecisions (art-review-lib.mjs): handlers.ok(row) / handlers.fix(row, notes) / handlers.reject(row, notes)
export async function poll(kind, handlers, { say = null } = {}) {
  const rows = await fetchDecided(kind);
  if (!rows?.length) return 0;
  return runDecisions(rows, handlers, { markHandled, say, log });
}

// CLI: node art-review.mjs migrate [--force] | pending
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const [cmd] = process.argv.slice(2);
  if (cmd === 'migrate') { const r = await migrateOnce({ force: process.argv.includes('--force') }); console.log(JSON.stringify(r)); process.exitCode = r.ok || r.skipped ? 0 : 75; }
  else if (cmd === 'pending') console.log(`czeka w panelu: ${await pendingCount()}`);
  else { console.error('komendy: migrate [--force] | pending'); process.exitCode = 2; }
}
