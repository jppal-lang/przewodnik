#!/usr/bin/env node
// Strażnicy aktualności tras (JP 2026-10-30): sami pilnują cen, godzin, zamknięć, linków, lokali, strony i kosztów AI,
// a wyniki dają JP do decyzji w panelu (ops.watch_findings → skrzynka decyzji → admin.admin_watch_decide).
// Logika i testy: watch-lib.mjs, watch.test.mjs. Migracja: sql/2026-10-30-straznicy.sql.
//
// Uruchamiany z gemini-queue.mjs (cron co 10 min, kontener Hermesa): każdy przebieg
//   1) wykonuje przyjęte decyzje JP (nowa wersja szkicu kodem, bez AI; potrzebne AI → prośba o zgodę na koszt),
//   2) uruchamia NAJWYŻEJ JEDNEGO strażnika, którego termin minął (limit czasu: watch_max_minutes, domyślnie 5 min;
//      przerwany przebieg kończy następny cron od miejsca przerwania).
// Harmonogram (czas polski, nadpisanie: ops.app_settings 'watch_schedule' = JSON, np. {"site":{"off":true}}):
//   costs codziennie od 7:00 · track (zamknięcia: co tydzień, w dniu końca i dzień po) i recheck codziennie od 5:00 ·
//   season 1 marca i 1 października · prices pon. · closures wt. · links śr. · site czw. (od 3:00) · venues 2. dnia miesiąca.
// Stan przebiegów: work/watch-state.json. Kanał Discord: #straznicy (QUOLINO_WATCH_CHANNEL) — nigdy #admin.
// Ręcznie (w kontenerze):  node watch.mjs                  — jak z crona (decyzje + jeden zaległy strażnik)
//                          node watch.mjs prices --city spello --dry --no-ai   — jeden strażnik, bez zapisu
//                          node watch.mjs apply | status
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import * as W from './watch-lib.mjs';

const BASE = process.env.QUOLINO_BASE ?? '/opt/data/quolino';
const WORK = join(BASE, 'work');
const STATE_F = join(WORK, 'watch-state.json'), LOCK = join(WORK, 'watch.lock');
const SITE = (process.env.QUOLINO_SITE_URL || 'https://quolino.com').replace(/\/$/, '');
export const GUARDS = W.ORDER;

const readState = () => { try { return JSON.parse(readFileSync(STATE_F, 'utf8')); } catch { return { last: {}, cursor: {} }; } };
const writeState = (s) => { try { mkdirSync(WORK, { recursive: true }); writeFileSync(STATE_F, JSON.stringify(s, null, 1)); } catch { /* stan pomocniczy */ } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

// ── magazyn w bazie (ten sam interfejs co memoryStore; scalanie wierszy: W.mergeFinding) ──────────
const SEL = `id::int AS id, kind, city_slug, stop_key, title, detail, proposal, url, quote, status, recheck_at, ends_at::text AS ends_at, created_at, updated_at,
  decided_at, decision_note, decided_option, dedupe_key, seen_count, last_seen_at, last_checked_at, apply_state, apply_result`;
const COLS = ['kind', 'city_slug', 'stop_key', 'title', 'detail', 'proposal', 'url', 'quote', 'status', 'recheck_at', 'ends_at', 'decided_at', 'decision_note',
  'decided_option', 'dedupe_key', 'seen_count', 'last_seen_at', 'last_checked_at', 'apply_state', 'apply_result', 'updated_at'];
const val = (k, v) => k === 'proposal' ? JSON.stringify(v ?? {}) : v instanceof Date ? v.toISOString() : v ?? null;
export function pgStore(q) {
  return {
    async upsert(f) {
      const [ex] = await q(`SELECT ${SEL} FROM ops.watch_findings WHERE dedupe_key = $1`, [f.dedupe_key]);
      const { row, inserted, reopened } = W.mergeFinding(ex, { ...f, title: String(f.title).slice(0, 300), detail: f.detail ? String(f.detail).slice(0, 2000) : null,
        quote: f.quote ? String(f.quote).slice(0, 600) : null }, new Date().toISOString());
      if (inserted) {
        const cs = COLS.filter(k => row[k] !== undefined);
        const [r] = await q(`INSERT INTO ops.watch_findings (${cs.join(', ')}) VALUES (${cs.map((k, i) => k === 'proposal' ? `$${i + 1}::jsonb` : `$${i + 1}`).join(', ')})
                             ON CONFLICT (dedupe_key) DO UPDATE SET updated_at = now() RETURNING id::int AS id`, cs.map(k => val(k, row[k])));
        return { id: r.id, inserted: true, status: row.status };
      }
      await this.update(ex.id, Object.fromEntries(COLS.filter(k => k !== 'dedupe_key' && row[k] !== undefined).map(k => [k, row[k]])));
      return { id: ex.id, inserted: false, reopened, status: row.status };
    },
    async tracked(kinds, statuses = ['open', 'accepted', 'recheck']) { return q(`SELECT ${SEL} FROM ops.watch_findings WHERE kind = ANY($1) AND status = ANY($2) ORDER BY id`, [kinds, statuses]); },
    async get(id) { return (await q(`SELECT ${SEL} FROM ops.watch_findings WHERE id = $1`, [id]))[0] ?? null; },
    async update(id, patch) {
      const ks = Object.keys(patch).filter(k => COLS.includes(k) && k !== 'updated_at');
      if (!ks.length) return null;
      await q(`UPDATE ops.watch_findings SET ${ks.map((k, i) => `${k} = $${i + 2}${k === 'proposal' ? '::jsonb' : ''}`).join(', ')}, updated_at = now() WHERE id = $1`, [id, ...ks.map(k => val(k, patch[k]))]);
      return true;
    },
    async dueRechecks() {
      return q(`SELECT ${SEL} FROM ops.watch_findings WHERE (status = 'recheck' AND (recheck_at IS NULL OR recheck_at <= now()))
                  OR (recheck_at <= now() AND status IN ('open', 'accepted', 'resolved')) ORDER BY id LIMIT 200`);
    },
    async pendingApply() { return q(`SELECT ${SEL} FROM ops.watch_findings WHERE status = 'accepted' AND apply_state = 'pending' ORDER BY id`); },
    async supersede(kind, city, stop, keepKey) {
      await q(`UPDATE ops.watch_findings SET status = 'resolved', decision_note = 'zastąpione nowszym odczytem strony', updated_at = now()
                WHERE kind = $1 AND city_slug = $2 AND stop_key = $3 AND dedupe_key <> $4 AND status = 'open'`, [kind, city, stop, keepKey]);
    },
  };
}

export async function loadSettings(q) {
  const s = { ai_alert_day_usd: 1, watch_ai: 'on', watch_ai_max_per_run: 4, watch_max_minutes: 5, watch_enabled: 'on', watch_schedule: {} };
  try {
    for (const r of await q(`SELECT name, value FROM ops.app_settings WHERE name LIKE 'watch%' OR name = 'ai_alert_day_usd'`)) {
      if (r.name === 'watch_schedule') { try { s.watch_schedule = JSON.parse(r.value); } catch { /* zły JSON — domyślny */ } }
      else s[r.name] = /^-?\d+(\.\d+)?$/.test(r.value) ? +r.value : r.value;
    }
  } catch { /* brak tabeli — domyślne */ }
  return s;
}

export async function loadTrips(q, city = null) {
  const rows = await q(`SELECT DISTINCT ON (v.city_slug) v.city_slug, v.version, v.trip, v.content
                          FROM public.city_versions v WHERE v.status = 'published' AND ($1::text IS NULL OR v.city_slug = $1)
                         ORDER BY v.city_slug, v.version DESC`, [city]);
  return rows.map(r => ({ city_slug: r.city_slug, version: r.version, title: r.trip?.content?.city?.title ?? r.content?.city?.title ?? r.city_slug, stops: W.stopsOf(r) }));
}

// Przeglądarka (Playwright z /opt/node-tools, jak og-images.mjs) — gdy jest, strażnik strony łapie też błędy JS; gdy nie ma, wersja bez przeglądarki.
function browserCheck(log) {
  let chromium;
  try { ({ chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright')); } catch { return null; }
  return async (urls) => {
    const b = await chromium.launch(), out = [];
    try {
      for (const url of urls) {
        const page = await b.newPage(), errs = [];
        page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
        page.on('pageerror', e => errs.push(String(e.message)));
        try { await page.goto(url, { waitUntil: 'load', timeout: 45_000 }); await page.waitForTimeout(2500); } catch (e) { errs.push(`ładowanie: ${e.message}`); }
        await page.close();
        if (errs.length) out.push({ url, type: 'js', msg: `${new URL(url).pathname}: błędy JS w przeglądarce (${errs.length}): ${errs.slice(0, 2).join(' | ').slice(0, 300)}` });
      }
    } finally { await b.close().catch(() => {}); }
    log?.(`strażnik strony: przeglądarka sprawdziła ${urls.length} stron`);
    return out;
  };
}

// Prośba o zgodę na koszt AI: tabela ops.cost_requests (skrzynka decyzji, równoległa migracja) — kolumny dobierane z tego, co tabela ma.
async function costRequest(q, { city_slug, finding_id, title }) {
  const cols = (await q(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'ops' AND table_name = 'cost_requests'`)).map(r => r.column_name);
  if (!cols.length) return false;
  const cand = { source: 'straznicy', kind: 'watch', city_slug, title: `Strażnik #${finding_id}: ${title}`, detail: `Przyjęta propozycja strażnika #${finding_id} wymaga AI: ${title}.`,
    reason: `strażnik #${finding_id}: ${title}`, payload: JSON.stringify({ finding_id, task: title }), request: JSON.stringify({ finding_id, task: title }) };
  const ks = Object.keys(cand).filter(k => cols.includes(k));
  if (!ks.length) return false;
  await q(`INSERT INTO ops.cost_requests (${ks.join(', ')}) VALUES (${ks.map((k, i) => `$${i + 1}`).join(', ')})`, ks.map(k => cand[k]));
  return true;
}

async function usage(q) {
  const [a] = await q(`SELECT coalesce(sum(usd), 0)::float AS usd24, coalesce(sum(usd_equiv), 0)::float AS equiv24 FROM public.ai_usage WHERE at > now() - interval '24 hours'`);
  const days = await q(`SELECT d, coalesce((SELECT sum(usd_equiv) FROM public.ai_usage WHERE at > now() - (d + 1) * interval '1 day' AND at <= now() - d * interval '1 day'), 0)::float AS s
                          FROM generate_series(1, 7) d`);
  const [top] = await q(`SELECT coalesce(role, 'inne') AS role, round(sum(usd_equiv), 2)::float AS s FROM public.ai_usage WHERE at > now() - interval '24 hours' GROUP BY 1 ORDER BY 2 DESC LIMIT 1`);
  return { usd24: a.usd24, equiv24: a.equiv24, equivDays: days.map(r => r.s), top: top ? `${top.role} ($${top.s})` : null };
}

const SUMMARY_EMOJI = { prices: '💶', closures: '🚧', track: '🚧', links: '🔗', venues: '🍝', season: '🗓️', site: '🌐', costs: '💸', recheck: '🔁' };
export function summary(name, found) {
  if (!found.length) return null;
  const lines = found.slice(0, 12).map(f => `• #${f.id} ${f.title}`);
  return `${SUMMARY_EMOJI[name] ?? '🛡️'} **Strażnik ${name}: ${found.length} do decyzji**\n${lines.join('\n')}${found.length > 12 ? `\n… i ${found.length - 12} więcej` : ''}\nSkrzynka decyzji: https://admin.quolino.com/_admin/`;
}

export async function runWatch({ log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a), only = null, dry = false, city = null, noAi = false } = {}) {
  mkdirSync(WORK, { recursive: true });
  if (existsSync(LOCK) && alive(+readFileSync(LOCK, 'utf8'))) return { skipped: 'trwa inny przebieg strażników' };
  writeFileSync(LOCK, String(process.pid));
  const lib = await import('./lib.mjs');
  const c = await lib.db();
  const q = async (sql, p) => (await c.query(sql, p)).rows;
  const state = readState(); state.last ??= {}; state.cursor ??= {};
  const res = {};
  try {
    const [{ t } = {}] = await q(`SELECT to_regclass('ops.watch_findings') IS NOT NULL AS t`);
    if (!t) return { skipped: 'brak ops.watch_findings — czeka na sql/2026-10-30-straznicy.sql (deploy.sh approve)' };
    const settings = await loadSettings(q);
    if (settings.watch_enabled === 'off' && !only) return { skipped: 'watch_enabled = off' };
    const store = pgStore(q);
    const draft = await import('./draft-lib.mjs');
    const channel = process.env.QUOLINO_WATCH_CHANNEL || lib.env('QUOLINO_WATCH_CHANNEL') || '#straznicy';
    const notify = async (text) => {
      if (dry) { log(`[dry] ${text.split('\n')[0]}`); return true; }
      const ok = await draft.notify(channel, text).catch(() => false);
      state.channel_missing = !ok;
      if (!ok) log(`strażnicy: kanał ${channel} niedostępny — wyniki tylko w bazie (ops.watch_findings) i w podglądzie stanu`);
      return ok;
    };

    // 1) decyzje JP → nowa wersja szkicu
    if (!only || only === 'apply') {
      const applied = await W.applyPending({ store, dry, log,
        loadBase: async (slug) => (await q(`SELECT version, status, trip, review, content FROM public.city_versions WHERE city_slug = $1 AND trip IS NOT NULL
                                             AND status IN ('draft', 'published') ORDER BY (status = 'draft') DESC, version DESC LIMIT 1`, [slug]))[0],
        saveDraft: async (slug, trip, { note, changes, base }) => {
          const saved = await draft.saveDraft(q, trip, { note, source: 'revise', changes, review: base.review ?? null });
          // etykieta podwersji jak w gemini-draft (v5 → v5a, v5b…) i bloki przystanków z wersji bazowej
          const bn = String(base.content?.label ?? `v${base.version}`).match(/^v(\d+)/)?.[1] ?? String(base.version);
          const [n] = await q(`SELECT count(*)::int AS n FROM public.city_versions WHERE city_slug = $1 AND content->>'label' ~ $2`, [slug, `^v${bn}[a-z]$`]);
          await q(`UPDATE public.city_versions n SET content = n.content || coalesce((SELECT jsonb_strip_nulls(jsonb_build_object('workflow', b.content->'workflow', 'workflow_model', b.content->'workflow_model',
                       'stop_blocks_v2', b.content->'stop_blocks_v2', 'guidelines', b.content->'guidelines', 'guidelines_ok', b.content->'guidelines_ok'))
                       FROM public.city_versions b WHERE b.city_slug = $1 AND b.version = $3), '{}'::jsonb) || jsonb_build_object('label', $4::text, 'watch', true),
                     trip = n.trip || coalesce((SELECT jsonb_strip_nulls(jsonb_build_object('stop_blocks_v2', b.trip->'stop_blocks_v2')) FROM public.city_versions b WHERE b.city_slug = $1 AND b.version = $3), '{}'::jsonb)
                   WHERE n.city_slug = $1 AND n.version = $2`, [slug, saved.version, base.version, `v${bn}${String.fromCharCode(97 + Math.min(25, n.n))}`]).catch(e => log(`strażnicy: etykieta szkicu — ${e.message.slice(0, 120)}`));
          return saved;
        },
        costRequest: (x) => costRequest(q, x).catch(() => false),
      });
      for (const a of applied.filter(a => !a.dry))
        await notify(`📝 **Strażnicy: nowa wersja szkicu ${a.city} (v${a.version})** po decyzjach JP (${a.n}):\n${a.titles.slice(0, 8).map(t => `• ${t}`).join('\n')}\nDo zatwierdzenia w panelu: https://admin.quolino.com/_admin/#/${a.city}`);
      res.applied = applied;
      if (only === 'apply') return res;
    }

    // 2) jeden strażnik
    const name = only ?? W.dueGuards(state, settings.watch_schedule, Date.now())[0];
    if (!name) return { ...res, guard: null };
    if (!GUARDS.includes(name)) throw new Error(`nieznany strażnik: ${name} (${GUARDS.join(', ')})`);
    const deadline = Date.now() + (+settings.watch_max_minutes || 5) * 60_000;
    let ai = null;
    if (!noAi && settings.watch_ai !== 'off' && ['prices', 'season', 'recheck'].includes(name) && lib.paidToday() < lib.DAILY_USD) {
      const sc = await import('./source-check.mjs');
      ai = async (prompt) => { const r0 = globalThis.__aiRole; globalThis.__aiRole = () => 'strażnik cen i godzin'; try { return await sc.defaultAi(prompt); } finally { globalThis.__aiRole = r0; } };
    }
    const ctx = { trips: await loadTrips(q, city), store, get: W.makeGetter(fetch), fetch, ai, aiMax: +settings.watch_ai_max_per_run || 0, now: Date.now(), deadline,
      cursor: only ? 0 : state.cursor[name] ?? 0, log, sleep: (ms) => new Promise(r => setTimeout(r, ms)), touched: new Set(), found: [], notify: dry ? null : notify,
      prevLinkBad: async (url) => { const [r] = await q(`SELECT status FROM public.link_checks WHERE url = $1 ORDER BY checked_at DESC LIMIT 1`, [url]).catch(() => []); return !!r && (r.status === 0 || r.status === 404 || r.status === 410 || r.status >= 500); },
      recordLink: dry ? null : async (url, r, cities) => q(`INSERT INTO public.link_checks (url, status, final_url, error, city_slugs) VALUES ($1, $2, $3, $4, $5)`, [url, r.status, r.final ?? null, r.error ?? null, cities]).catch(() => {}),
      gastroStatus: async (cs, sk) => (await q(`SELECT business_status FROM public.gastro_checks WHERE city_slug = $1 AND stop_key = $2 ORDER BY checked_at DESC LIMIT 1`, [cs, sk]).catch(() => []))[0]?.business_status ?? null,
      usage: () => usage(q) };
    if (dry) ctx.store = { ...W.memoryStore(), tracked: store.tracked, get: store.get, dueRechecks: store.dueRechecks };
    log(`strażnik ${name}: start (${ctx.trips.length} tras${city ? `, ${city}` : ''}${ai ? `, AI ≤ ${ctx.aiMax}` : ', bez AI'})`);
    const L = W.localParts(Date.now()), cfg = { ...W.DEFAULT_SCHEDULE[name], ...(settings.watch_schedule?.[name] ?? {}) };
    let out;
    if (name === 'prices') out = await W.guardPrices(ctx);
    else if (name === 'closures') out = await W.guardClosures(ctx);
    else if (name === 'track') out = await W.guardTrack(ctx);
    else if (name === 'recheck') out = await W.guardRecheck(ctx);
    else if (name === 'links') out = await W.guardLinks(ctx);
    else if (name === 'venues') out = await W.guardVenues(ctx);
    else if (name === 'season') out = await W.guardSeason(ctx, { period: W.periodOf(cfg, L) });
    else if (name === 'site') { const browser = browserCheck(log); state.chromium = !!browser; out = await W.guardSite(ctx, { site: SITE, browser }); }
    else if (name === 'costs') out = await W.guardCosts(ctx, { threshold: +settings.ai_alert_day_usd || 1 });
    const partial = ctx.partial != null;
    if (!dry && !only) {
      if (partial) state.cursor[name] = ctx.partial; else { delete state.cursor[name]; state.last[name] = { period: W.periodOf(cfg, L), at: new Date().toISOString(), found: ctx.found.length, ai: ctx.aiUsed ?? 0 }; }
    }
    const msg = name === 'costs' ? null : summary(name, ctx.found);   // koszty wysyłają alarm same, od razu
    if (msg) await notify(msg);
    log(`strażnik ${name}: ${partial ? `przerwany po ${ctx.partial} (dokończy następny przebieg)` : 'koniec'} · nowe ${ctx.found.length} · AI ${ctx.aiUsed ?? 0}`);
    return { ...res, guard: name, ...out, found: ctx.found.map(f => ({ id: f.id, kind: f.kind, title: f.title })), partial, ai: ctx.aiUsed ?? 0 };
  } finally {
    if (!dry) writeState(state);
    await c.end().catch(() => {});
    try { unlinkSync(LOCK); } catch { /* brak */ }
  }
}

export const watchState = readState;

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2), opt = (n) => { const i = a.indexOf(n); return i > -1 ? a[i + 1] : null; };
  const cmd = a.find(x => !x.startsWith('--') && x !== opt('--city'));
  if (cmd === 'status') { console.log(JSON.stringify({ state: readState(), due: W.dueGuards(readState(), {}, Date.now()) }, null, 1)); process.exit(0); }
  try { console.log(JSON.stringify(await runWatch({ only: cmd ?? null, dry: a.includes('--dry'), city: opt('--city'), noAi: a.includes('--no-ai') }), null, 1)); }
  catch (e) { console.error('BŁĄD:', e.message); process.exitCode = 1; }
}
