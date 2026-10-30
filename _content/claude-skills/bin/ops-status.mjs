#!/usr/bin/env node
// Podgląd stanu serwera dla Claude (JP 2026-10-30): migawki do ops.status_snapshot, czytelne anonimowo przez
//   curl -s -X POST https://api.quolino.com/rest/v1/rpc/ops_status -H "Content-Type: application/json" -d '{}'
// Wołany z gemini-queue.mjs (każdy przebieg crona, co ~10 min) i z repo-jobs.mjs (po każdym zleceniu). Ręcznie:
//   node ops-status.mjs            — zapis do bazy
//   node ops-status.mjs --print    — tylko wypisz (bez zapisu)
// Klucze: jobs (zlecenia z repo + końcówki logów), versions (wersje tras, bez treści), queue (ops.jobs, limit Antigravity, zużycie AI 24 h),
// deploy (ostatni komunikat deploy.sh z work/deployed.txt + HEAD repo), cron (kiedy przebiegła kolejka, blokady).
// Bezpieczeństwo: ŻADNYCH zmiennych środowiskowych; każdy napis przechodzi przez scrub() (tokeny, JWT, e-maile, IP, URL z hasłem,
// parametry ?token=…), każdy klucz ma limit rozmiaru (razem < 200 KB). Funkcje czyste są eksportowane i mają testy (ops-status.test.mjs).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const BASE = process.env.QUOLINO_BASE ?? '/opt/data/quolino';
const WORK = join(BASE, 'work');
const REPO = process.env.QUOLINO_REPO ?? '/opt/data/repo/przewodnik';

// ── filtr sekretów ─────────────────────────────────────────────────────────────
const R = '[ukryte]';
const RULES = [
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@"']+:[^\s/@"']+@/gi, (m) => m.replace(/\/\/.*@/, `//${R}@`)],   // postgres://user:hasło@
  [/https?:\/\/(?:[a-z0-9-]+\.)?discord(?:app)?\.com\/api\/webhooks\/\S+/gi, R],
  [/\beyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+){0,2}/g, R],                                       // JWT
  [/\b(?:sk|pk|rk)[-_](?:ant-|or-|proj-|live_|test_)?[A-Za-z0-9_-]{12,}/g, R],                  // OpenAI/Anthropic/OpenRouter/Stripe
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g, R], [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, R],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, R], [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, R], [/\bya29\.[A-Za-z0-9_-]{20,}/g, R],
  [/\bBearer\s+[A-Za-z0-9._~+\/=-]{8,}/gi, `Bearer ${R}`],
  [/\b(authorization|proxy-authorization)(\s*[:=]\s*)[^\n"]+/gi, (m, k, sep) => k + sep + R],
  [/([?&#](?:token|access_token|t|k|key|apikey|api_key|code|secret|sig|signature|auth|password|pass)=)[^&\s"'<>]+/gi, (m, p) => p + R],
  [/\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PASS|WEBHOOK|DATABASE_URL|DSN|COOKIE|SESSION))\s*[=:]\s*("[^"]*"|'[^']*'|\S+)/g, (m, k) => `${k}=${R}`],
  [/\b(apikey|api_key|password|passwd|secret|token|cookie)("?\s*[:=]\s*"?)[^\s",}]{6,}/gi, (m, k, sep) => k + sep + R],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[e-mail]'],
  [/\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g, '[IP]'],
  [/(?<![\w:])(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}(?![\w:])|(?<![\w:])(?:[0-9a-f]{1,4}:){1,6}:(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,5})?(?![\w:])/gi,
    (m) => (/[a-f]/i.test(m) || m.split(':').length > 4 ? '[IP]' : m)],
  // długie losowe ciągi (klucze bez znanego prefiksu): ≥ 32 znaki, wielkie i małe litery oraz cyfry, częste przeskoki między nimi
  [/[A-Za-z0-9_+\/-]{32,}={0,2}/g, (m) => (looksRandom(m) ? R : m)],
];
export function looksRandom(m) {
  // słowa rozdzielone _ - / + (nazwy zleceń, slugi) nie są kluczem; losowy ciąg ma długi odcinek z częstymi przeskokami A/a/0
  const cls = (ch) => (/[A-Z]/.test(ch) ? 'U' : /[a-z]/.test(ch) ? 'l' : 'd');
  return m.split(/[_+\/-]+/).some(seg => {
    if (seg.length < 20 || !(/[A-Z]/.test(seg) && /[a-z]/.test(seg) && /\d/.test(seg))) return false;
    let jumps = 0; for (let i = 1; i < seg.length; i++) if (cls(seg[i]) !== cls(seg[i - 1])) jumps++;
    return jumps >= seg.length / 4;
  });
}
export function scrub(s) {
  if (typeof s !== 'string') return s;
  let out = s;
  for (const [re, rep] of RULES) out = out.replace(re, rep);
  return out;
}
export function scrubDeep(v, depth = 0) {
  if (depth > 12) return '[za głęboko]';
  if (typeof v === 'string') return scrub(v.length > 4000 ? v.slice(0, 4000) + '…' : v);
  if (Array.isArray(v)) return v.map(x => scrubDeep(x, depth + 1));
  if (v instanceof Date) return v.toISOString();
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [scrub(k), scrubDeep(x, depth + 1)]));
  if (typeof v === 'bigint') return Number(v);
  return v;
}
// Limit rozmiaru: dopóki JSON > max, skracaj najdłuższą tablicę (od końca) albo najdłuższy napis.
export function fit(obj, maxBytes) {
  const size = (o) => Buffer.byteLength(JSON.stringify(o));
  let o = structuredClone(obj), guard = 0;
  while (size(o) > maxBytes && guard++ < 500) {
    let best = null;
    const walk = (x, parent, key) => {
      if (Array.isArray(x)) { if (x.length && (!best || size(x) > best.n)) best = { x, n: size(x), arr: true }; x.forEach((y, i) => walk(y, x, i)); }
      else if (x && typeof x === 'object') Object.entries(x).forEach(([k, y]) => walk(y, x, k));
      else if (typeof x === 'string' && x.length > 200 && (!best || x.length > best.n)) best = { parent, key, n: x.length, arr: false };
    };
    walk(o, null, null);
    if (!best) return { obcięte: true, bajty: size(o) };
    if (best.arr) {   // tablica napisów (linie logu) traci najstarsze linie z początku, inne — najstarsze pozycje z końca
      const cut = Math.max(1, Math.floor(best.x.length / 2));
      if (best.x.every(y => typeof y === 'string')) best.x.splice(0, cut); else best.x.splice(best.x.length - cut);
    } else best.parent[best.key] = '…' + best.parent[best.key].slice(-Math.floor(best.n / 2));
  }
  return o;
}
export const LIMITS = { jobs: 80_000, versions: 30_000, queue: 50_000, deploy: 15_000, cron: 10_000 };   // razem < 200 KB

// ── zbieranie ─────────────────────────────────────────────────────────────────
const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const tail = (f, n) => { try { return readFileSync(f, 'utf8').split('\n').filter(Boolean).slice(-n).map(l => l.slice(0, 500)); } catch { return []; } };
const mtime = (f) => { try { return statSync(f).mtime.toISOString(); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const lockInfo = (f) => { if (!existsSync(f)) return null; const pid = +readFileSync(f, 'utf8'); return { since: mtime(f), alive: pid > 0 && alive(pid) }; };

export function jobsSnapshot(work = WORK) {
  const reg = readJson(join(work, 'repo-jobs.json')) ?? {};
  const list = Object.entries(reg).map(([name, r]) => ({
    name, status: r.status, code: r.code ?? null, script: r.script ?? null, args: (r.args ?? []).join(' ').slice(0, 300),
    why: r.why?.slice(0, 200) ?? null, by: r.by ?? null, started_at: r.started_at ?? r.at ?? null, finished_at: r.finished_at ?? null,
    result: String(r.result ?? '').slice(0, 400),
  })).sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
  let logs = [];
  try {
    const dir = join(work, 'jobs');
    logs = readdirSync(dir).filter(f => f.endsWith('.log')).map(f => ({ f, t: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t).slice(0, 5).map(({ f, t }) => ({ name: f.replace(/\.log$/, ''), mtime: new Date(t).toISOString(), tail: tail(join(dir, f), 30) }));
  } catch { /* brak katalogu */ }
  return { registry: list.slice(0, 40), logs };
}

async function versionsSnapshot(q) {
  return { rows: await q(`SELECT to_jsonb(v)->'id' AS id, v.city_slug, v.version, v.status, left(v.note, 80) AS note, v.created_at, v.published_at,
      CASE WHEN jsonb_typeof(v.review->'errors') = 'array' THEN jsonb_array_length(v.review->'errors') END AS errors,
      CASE WHEN jsonb_typeof(v.review->'warnings') = 'array' THEN jsonb_array_length(v.review->'warnings') END AS warnings,
      v.review->>'verdict' AS verdict
    FROM public.city_versions v ORDER BY v.created_at DESC NULLS LAST LIMIT 20`) };
}

async function queueSnapshot(q, lib) {
  const safe = async (sql) => { try { return await q(sql); } catch (e) { return { błąd: String(e.message).slice(0, 200) }; } };
  return {
    open: await safe(`SELECT id, city_slug, kind, worker, status, left(coalesce(result, ''), 300) AS result, created_at
                        FROM ops.jobs WHERE status IN ('queued', 'running') ORDER BY id LIMIT 50`),
    recent: await safe(`SELECT id, city_slug, kind, worker, status, left(coalesce(result, ''), 300) AS result, created_at, finished_at
                          FROM ops.jobs WHERE status NOT IN ('queued', 'running') ORDER BY coalesce(finished_at, created_at) DESC LIMIT 15`),
    failed_7d: await safe(`SELECT id, city_slug, kind, worker, left(coalesce(result, ''), 300) AS result, finished_at
                             FROM ops.jobs WHERE status = 'failed' AND coalesce(finished_at, created_at) > now() - interval '7 days' ORDER BY id DESC LIMIT 10`),
    pipeline: await safe(`SELECT DISTINCT ON (run_id) run_id, city_slug, kind, stage, stop_k, stops_n, left(coalesce(message, ''), 200) AS message, status, created_at
                            FROM public.pipeline_events WHERE created_at > now() - interval '2 days' ORDER BY run_id, id DESC`),
    usage_24h: await safe(`SELECT provider, billing, sum(calls)::int AS calls, sum(tokens_in)::bigint AS tokens_in, sum(tokens_out)::bigint AS tokens_out,
                                  round(sum(usd), 4) AS usd, round(sum(usd_equiv), 4) AS usd_equiv
                             FROM public.ai_usage WHERE at > now() - interval '24 hours' GROUP BY 1, 2 ORDER BY 3 DESC`),
    agyQuotaOut: lib?.agyQuotaOut?.() ?? null,
    agyWeekCalls: lib?.agyWeekCalls?.() ?? null,
    agyAlert: readJson(join(WORK, '..', 'agy-alert.json')),
  };
}

async function deploySnapshot() {
  const txt = (() => { try { return readFileSync(join(WORK, 'deployed.txt'), 'utf8').trim(); } catch { return null; } })();
  let head = null, sql = null;
  if (existsSync(join(REPO, '.git'))) {
    const git = (...a) => promisify(execFile)('git', ['-c', 'safe.directory=*', '-C', REPO, ...a], { env: { PATH: process.env.PATH, HOME: '/opt/data/home' }, maxBuffer: 5e6 });
    try { head = (await git('log', '-1', '--format=%h %cI %s', 'origin/main')).stdout.trim(); } catch {}
    try { sql = (await git('ls-tree', '--name-only', 'origin/main', '_content/claude-skills/sql/')).stdout.split('\n').filter(Boolean).map(x => x.split('/').pop()).filter(x => /^\d{4}-/.test(x)).sort().slice(-8); } catch {}
  }
  return {
    last_message: txt, last_message_at: mtime(join(WORK, 'deployed.txt')),
    waiting_for_jp: txt ? /czeka na zgodę/.test(txt) : null,
    repo_head: head, newest_sql_in_repo: sql,
    note: 'Rejestr wykonanych SQL (.sql-applied) i stan zatwierdzeń leżą na hoście, poza kontenerem — tu tylko ostatni komunikat deploy.sh.',
  };
}

function cronSnapshot(extra = {}) {
  return {
    last_run: new Date().toISOString(), trigger: extra.trigger ?? 'manual',
    gemini_queue_lock: lockInfo(join(WORK, 'gemini-queue.lock')), repo_jobs_lock: lockInfo(join(WORK, 'repo-jobs.lock')),
    files: { costs_jsonl: mtime(join(WORK, 'costs.jsonl')), repo_jobs_json: mtime(join(WORK, 'repo-jobs.json')), agy_quota: mtime(join(WORK, 'agy-quota.json')) },
  };
}

export async function collect({ q, lib, trigger } = {}) {
  const safe = async (fn) => { try { return await fn(); } catch (e) { return { błąd: String(e.message).slice(0, 200) }; } };
  const raw = {
    jobs: await safe(() => jobsSnapshot()),
    versions: q ? await safe(() => versionsSnapshot(q)) : { błąd: 'brak bazy' },
    queue: q ? await safe(() => queueSnapshot(q, lib)) : { błąd: 'brak bazy' },
    deploy: await safe(() => deploySnapshot()),
    cron: cronSnapshot({ trigger }),
  };
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, fit(scrubDeep(v), LIMITS[k])]));
}

// Zapis: jedno połączenie, upsert każdego klucza. Nigdy nie rzuca — kolejka nie może paść przez podgląd.
export async function writeOpsStatus({ trigger = 'manual', log = () => {} } = {}) {
  let c;
  try {
    const lib = await import('./lib.mjs');
    c = await lib.db();
    const q = async (sql, p) => (await c.query(sql, p)).rows;
    const snap = await collect({ q, lib, trigger });
    for (const [k, v] of Object.entries(snap))
      await q(`INSERT INTO ops.status_snapshot (klucz, dane, updated_at) VALUES ($1, $2::jsonb, now())
               ON CONFLICT (klucz) DO UPDATE SET dane = EXCLUDED.dane, updated_at = now()`, [k, JSON.stringify(v)]);
    return { ok: true, bytes: Buffer.byteLength(JSON.stringify(snap)) };
  } catch (e) { log(`ops-status: ${String(e.message).slice(0, 160)}`); return { ok: false }; }
  finally { try { await c?.end(); } catch {} }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--print')) {
    let lib = null, c = null;
    try { lib = await import('./lib.mjs'); c = await lib.db(); } catch { /* bez bazy */ }
    const snap = await collect({ q: c ? async (s, p) => (await c.query(s, p)).rows : null, lib, trigger: 'print' });
    await c?.end();
    console.log(JSON.stringify(snap, null, 1));
  } else console.log(JSON.stringify(await writeOpsStatus({ trigger: 'manual', log: console.error })));
}
