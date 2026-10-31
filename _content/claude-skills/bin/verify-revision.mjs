#!/usr/bin/env node
// Weryfikacja wdrożenia uwag JP po rundzie poprawek + meldunek gotowości (decyzja JP 2026-10-31).
// Woła draft-comments.mjs po każdej udanej rundzie (prośba done z result_version). Ręcznie:
//   node verify-revision.mjs --request <id> [--no-notify] [--no-retry]   — sprawdź prośbę jeszcze raz
//   node verify-revision.mjs --pending                                   — dokończ oceny odłożone przez limit Antigravity
// Koszt ≈ 0: część deterministyczna (pola wersji wyjściowej i nowej, walidator validate_trip.py) + JEDNO wywołanie Antigravity
// (abonament AI Pro) na prośbę. NIGDY płatny model: bez limitu Antigravity tylko ocena wstępna i dokończenie później.
// Zapis: kolumny z SQL 2026-10-31-weryfikacja-uwag.sql (draft_comments.verify_*, draft_revision_requests.verify/retry_of),
// a przed jego zatwierdzeniem — tylko dopisek w hermes_reply i wiadomość. Zawsze także plik work/verify/<id>.json.
// Uwagi nie naniesione → automatycznie JEDNA ponowna runda (nowa prośba tylko z nimi), potem meldunek końcowy.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import * as V from './verify-revision-lib.mjs';
// lib.mjs ładowany leniwie (wymaga pg z /opt/data/quolino) — testy podają własne deps: { agyQuotaOut, agyQuotaHit, aiUsage, extractJson, SKILLS, ask }
const libDeps = async () => import('./lib.mjs');

export const ADMIN = '1558873867643134073';                 // #admin
export const VERIFY_DIR = process.env.QUOLINO_VERIFY_DIR ?? '/opt/data/quolino/work/verify';
const AGY = '/opt/data/home/.local/bin/agy';
const AI_TRIES = 3;
const QUOTA = /quota reached|upgrade your subscription|RESOURCE_EXHAUSTED/i;

const fileOf = (id) => join(VERIFY_DIR, `${id}.json`);
export function readState(id) { try { return JSON.parse(readFileSync(fileOf(id), 'utf8')); } catch { return null; } }
function writeState(id, st) { try { mkdirSync(VERIFY_DIR, { recursive: true }); writeFileSync(fileOf(id), JSON.stringify(st, null, 1)); } catch { /* pomocniczy */ } }

// Antigravity bez narzędzi (tryb plan), w pustym katalogu, bez kluczy API w środowisku — jak gemini-draft.mjs
function agyAsk(prompt, city, aiUsage) {
  return new Promise((resolve, reject) => {
    mkdirSync('/tmp/gq', { recursive: true });
    const env = { ...process.env, HOME: '/opt/data/home' }; delete env.GOOGLE_API_KEY; delete env.GEMINI_API_KEY;
    const p = spawn(AGY, ['-p', prompt + '\n\nNie używaj wyszukiwarki ani narzędzi. ODPOWIEDZ WYŁĄCZNIE POPRAWNYM JSON-em.', '--output-format', 'json', '--print-timeout', '600s', '--sandbox', '--mode', 'plan'],
      { cwd: '/tmp/gq', env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '', done = false;
    const finish = (code) => {
      if (done) return;
      let j = null; try { j = JSON.parse(out.slice(out.indexOf('{'))); } catch { /* niepełne */ }
      if (!j && code === 'stream') return;
      done = true; clearTimeout(t); try { p.kill('SIGKILL'); } catch { /* już zamknięty */ }
      if (j?.status === 'SUCCESS' && j.response) {
        aiUsage({ provider: 'gemini', model: 'Antigravity (AI Pro)', role: 'weryfikacja uwag', billing: 'abonament', city,
          tin: j.usage?.input_tokens ?? j.usage?.prompt_tokens ?? j.usage?.total_tokens ?? 0, tout: j.usage?.output_tokens ?? j.usage?.completion_tokens ?? 0 });
        return resolve(String(j.response));
      }
      reject(new Error(`Antigravity ${j?.status ?? 'kod ' + code} ${String(j?.error ?? err ?? out).slice(0, 300)}`));
    };
    const t = setTimeout(() => finish('timeout'), 6 * 60_000);
    p.stdout.on('data', d => { out += d; if (/\}\s*$/.test(out)) finish('stream'); });
    p.stderr.on('data', d => { err += d; });
    p.on('close', code => finish(code));
    p.on('error', e => { if (!done) { done = true; clearTimeout(t); reject(e); } });
  });
}

function validatorPath(SKILLS) {
  const host = `${SKILLS}/quolino-trip-writing/scripts/validate_trip.py`;
  return existsSync(host) ? host : new URL('../quolino-trip-writing/scripts/validate_trip.py', import.meta.url).pathname;
}

// ── jedna prośba ─────────────────────────────────────────────────────────────────────────────
// r: wiersz draft_revision_requests (status done, result_version). Zwraca { verify, retryId, message }.
export async function verifyRequest({ q, r, notify = async () => false, log = null, thread = null, send = true, allowRetry = true, deps = null }) {
  const D = deps ?? await libDeps();
  log ??= D.log ?? (() => {});
  const { agyQuotaOut, agyQuotaHit, extractJson } = D;
  const ask = D.ask ?? ((p, city) => agyAsk(p, city, D.aiUsage));
  const slug = r.city_slug;
  const cols = V.columnsFrom(await q(V.COLUMNS_SQL));
  const comments = await q('SELECT * FROM public.draft_comments WHERE id = ANY($1::bigint[]) ORDER BY id', [r.comment_ids]);
  const others = await q(`SELECT * FROM public.draft_revision_requests WHERE city_slug = $1 AND id <> $2`, [slug, r.id]);
  const parent = V.parentOf(r, others);
  const child = others.some(o => +o.id > +r.id && (+o.retry_of === +r.id || (o.comment_ids ?? []).some(id => (r.comment_ids ?? []).map(String).includes(String(id)))));
  const ver = async (v) => (await q('SELECT * FROM public.city_versions WHERE city_slug = $1 AND version = $2', [slug, v]))[0] ?? null;
  const base = await ver(r.city_version), next = await ver(r.result_version);
  if (!base || !next) throw new Error(`brak wersji ${!base ? r.city_version : r.result_version} w city_versions`);
  const Fb = V.fieldsOf(base), Fn = V.fieldsOf(next);
  const reviews = {};
  for (const v of new Set(comments.map(c => +(c.city_version ?? r.city_version))))
    reviews[v] = v === +base.version ? base.review : (await ver(v))?.review ?? null;
  let items = comments.map(c => V.deterministic(c, Fb, Fn, reviews[+(c.city_version ?? r.city_version)]));

  // ocena semantyczna — tylko Antigravity (abonament), jedno wywołanie na prośbę
  const st = readState(r.id) ?? { tries: 0 };
  let pendingAi = false, aiFailed = false;
  if (items.some(x => x.ai)) {
    const out = agyQuotaOut();
    if (out || (!D.ask && !existsSync(AGY))) { pendingAi = !!out || st.tries < AI_TRIES; aiFailed = !pendingAi; if (!out) st.tries++; }
    else {
      try { items = V.mergeAi(items, extractJson(await ask(V.aiPrompt(comments, items, V.titleOf(next, slug)), slug))); }
      catch (e) {
        if (QUOTA.test(e.message)) { agyQuotaHit(e.message); pendingAi = true; }
        else { st.tries++; pendingAi = st.tries < AI_TRIES; aiFailed = !pendingAi; }
        log(`weryfikacja #${r.id}: ${String(e.message).slice(0, 160)}`);
      }
      if (!pendingAi && !aiFailed && items.some(x => x.ai)) { st.tries++; pendingAi = st.tries < AI_TRIES; aiFailed = !pendingAi; }   // odpowiedź bez części uwag
    }
  }

  // walidator: nowe błędy względem wersji wyjściowej (dla drugiej rundy — względem wersji sprzed pierwszej)
  const pStateItems = parent ? (readState(parent.id)?.verify?.items ?? parent.verify?.items ?? []) : [];
  const valBase = parent?.city_version != null ? (await ver(parent.city_version)) ?? base : base;
  let newErrs = [], validatorOk = true;
  try {
    const py = D.validator ?? validatorPath(D.SKILLS);
    newErrs = V.newErrors(V.runValidator(V.tripOf(valBase).trip, py, slug).errors, V.runValidator(V.tripOf(next).trip, py, slug).errors);
  } catch (e) { validatorOk = false; log(`weryfikacja #${r.id}: ${e.message}`); }

  const all = parent ? V.combineItems(pStateItems, items) : items;
  const verify = V.summarize(all, { newErrs, validatorOk, pendingAi, aiFailed, label: V.labelOf(next), version: next.version,
    from: valBase.version, round: parent ? 2 : 1, retried: null });
  const title = V.titleOf(next, slug);

  // ponowna runda dla nie naniesionych (ostatecznie, nie wstępnie) — najwyżej raz
  const missing = items.filter(x => x.status === 'missing' && !x.ai);
  let retryId = null;
  if (allowRetry && !parent && !child && missing.length) {
    const ids = missing.map(x => x.id), why = `Ponowna runda (auto) po prośbie #${r.id}: ${ids.length} nie naniesionych w ${verify.label}.`;
    const [nr] = cols.retryOf
      ? await q(`INSERT INTO public.draft_revision_requests (city_slug, city_version, comment_ids, hermes_reply, retry_of) VALUES ($1, $2, $3::bigint[], $4, $5) RETURNING id`, [slug, next.version, ids, why, r.id])
      : await q(`INSERT INTO public.draft_revision_requests (city_slug, city_version, comment_ids, hermes_reply) VALUES ($1, $2, $3::bigint[], $4) RETURNING id`, [slug, next.version, ids, why]);
    retryId = +nr.id; verify.retried = retryId;
    await q(`UPDATE public.draft_comments SET status = 'sent', request_id = $2, updated_at = now() WHERE id = ANY($1::bigint[])`, [ids, retryId]);
  }

  // zapis: kolumny (po SQL) albo tylko hermes_reply
  for (const x of items) {
    const text = V.commentVerifyText(x, !cols.comments) + (retryId && x.status === 'missing' && !x.ai ? ` — ponowna runda #${retryId}` : '');
    if (cols.comments)
      await q(`UPDATE public.draft_comments SET verify_status = $2, verify_note = $3, verify_quote = nullif($4, ''), verified_in_version = $5, verified_at = now(),
                      hermes_reply = $6, updated_at = now() WHERE id = $1`,
        [x.id, x.status, x.note + (x.ai ? ' (wstępnie)' : ''), x.quote, next.version, V.withVerify(comments.find(c => +c.id === +x.id)?.hermes_reply, text)]);
    else await q(`UPDATE public.draft_comments SET hermes_reply = $2, updated_at = now() WHERE id = $1`, [x.id, V.withVerify(comments.find(c => +c.id === +x.id)?.hermes_reply, text)]);
  }
  const short = `${verify.ready ? 'gotowa' : verify.pending_ai ? 'wstępnie' : 'nie gotowa'} — ${verify.applied}/${verify.total} naniesionych, ${verify.partial} częściowo, ${verify.missing} nie naniesionych, walidator: ${verify.new_errors} nowych błędów${retryId ? `, ponowna runda #${retryId}` : ''}`;
  const [cur] = await q('SELECT hermes_reply FROM public.draft_revision_requests WHERE id = $1', [r.id]);
  if (cols.requests) await q(`UPDATE public.draft_revision_requests SET verify = $2::jsonb, hermes_reply = $3, updated_at = now() WHERE id = $1`, [r.id, JSON.stringify(verify), V.withVerify(cur?.hermes_reply, short)]);
  else await q(`UPDATE public.draft_revision_requests SET hermes_reply = $2, updated_at = now() WHERE id = $1`, [r.id, V.withVerify(cur?.hermes_reply, short)]);

  // meldunek
  let message = null;
  if (retryId) message = V.retryLine({ title, label: verify.label, missing });
  else if (child) message = null;                               // runda druga już ruszyła — meldunek końcowy da ona
  else if (pendingAi && st.pendingReported) message = null;     // wstępny meldunek już był
  else message = V.report({ title, slug, verify, quotaUntil: agyQuotaOut() });
  if (send && message) {
    await notify(thread ?? ADMIN, message);
    if (verify.ready && thread && thread !== ADMIN) await notify(ADMIN, V.adminLine({ title, slug, verify }));
  }
  writeState(r.id, { request_id: +r.id, slug, tries: st.tries, pending: pendingAi, pendingReported: pendingAi && (st.pendingReported || !!message), verify, at: new Date().toISOString() });
  log(`${slug}: weryfikacja prośby #${r.id} — ${short}`);
  return { verify, retryId, message };
}

// dokończ jedną ocenę odłożoną przez limit Antigravity (wołane z draft-comments.mjs przed nową prośbą)
export async function resumePending({ q, notify, log = null, threadOf, deps = null }) {
  const D = deps ?? await libDeps();
  if (D.agyQuotaOut()) return false;
  let files = []; try { files = readdirSync(VERIFY_DIR).filter(f => /^\d+\.json$/.test(f)); } catch { return false; }
  for (const f of files.sort((a, b) => parseInt(a) - parseInt(b))) {
    const st = readState(parseInt(f));
    if (!st?.pending) continue;
    const [r] = await q('SELECT * FROM public.draft_revision_requests WHERE id = $1', [st.request_id]);
    if (!r || r.status !== 'done' || r.result_version == null) { writeState(st.request_id, { ...st, pending: false }); continue; }
    await verifyRequest({ q, r, notify, log, deps: D, thread: threadOf ? await threadOf(r.city_slug) : null });
    return true;
  }
  return false;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2), opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const { db } = await import('./lib.mjs');
  const { notify } = await import('./draft-lib.mjs');
  const c = await db(), q = async (s, p) => (await c.query(s, p)).rows;
  const threadOf = async (slug) => (await q('SELECT discord_thread_id FROM ops.cities WHERE slug = $1', [slug]).catch(() => []))[0]?.discord_thread_id ?? ADMIN;
  try {
    if (argv.includes('--pending')) console.log(JSON.stringify({ resumed: await resumePending({ q, notify, threadOf }) }));
    else if (opt('--request')) {
      const [r] = await q('SELECT * FROM public.draft_revision_requests WHERE id = $1', [+opt('--request')]);
      if (!r || r.result_version == null) throw new Error('prośba nie istnieje albo nie ma jeszcze nowej wersji');
      const out = await verifyRequest({ q, r, notify, thread: await threadOf(r.city_slug), send: !argv.includes('--no-notify'), allowRetry: !argv.includes('--no-retry') });
      const { items, ...v } = out.verify;
      console.log(JSON.stringify({ ...v, retryId: out.retryId }, null, 1));
    } else console.error('Użycie: verify-revision.mjs --request <id> [--no-notify] [--no-retry] | --pending');
  } catch (e) { console.error('BŁĄD verify-revision:', e.message); process.exitCode = 1; }
  finally { await c.end(); }
}
