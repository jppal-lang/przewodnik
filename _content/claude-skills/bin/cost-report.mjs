#!/usr/bin/env node
// Miesięczny raport kosztów (cron 1. dnia miesiąca, za poprzedni miesiąc).
//   node cost-report.mjs [--month 2026-10] [--dry] [--notify <kanał>]
// Źródła: dziennik zapytań do modeli (work/costs.jsonl, dopisuje lib.mjs), przegląd lokali (gastro_checks),
// wersje wycieczek (nowe szkice, publikacje). Google Places: tylko liczba zapytań — kwotę pokazuje konsola Google.
import { existsSync, readFileSync } from 'node:fs';
import { db, env } from './lib.mjs';
import { notify } from './draft-lib.mjs';

const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : undefined; };
const prev = new Date(); prev.setUTCDate(1); prev.setUTCMonth(prev.getUTCMonth() - 1);
const MONTH = opt('--month') ?? prev.toISOString().slice(0, 7);
const CHANNEL = opt('--notify') ?? env('QUOLINO_COST_CHANNEL') ?? '#lokale';
const F = '/opt/data/quolino/work/costs.jsonl';

const rows = existsSync(F) ? readFileSync(F, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } })
  .filter(r => r && r.at?.startsWith(MONTH)) : [];
const sum = (xs) => xs.reduce((a, r) => a + (+r.usd || 0), 0);
const group = (key) => Object.entries(rows.reduce((m, r) => { const k = r[key] ?? '?'; (m[k] ??= []).push(r); return m; }, {}))
  .map(([k, xs]) => ({ k, usd: sum(xs), n: xs.length })).sort((a, b) => b.usd - a.usd);

const c = await db();
const q = async (sql, p) => (await c.query(sql, p)).rows;
try {
  const [g] = await q(`SELECT count(*)::int AS n FROM public.gastro_checks WHERE to_char(checked_at, 'YYYY-MM') = $1`, [MONTH]).catch(() => [{ n: 0 }]);
  const [v] = await q(`SELECT count(*) FILTER (WHERE source = 'draft')::int AS drafts,
                              count(*) FILTER (WHERE source = 'revise')::int AS revisions,
                              count(DISTINCT city_slug) FILTER (WHERE status = 'published' AND to_char(published_at, 'YYYY-MM') = $1)::int AS published
                         FROM public.city_versions WHERE to_char(created_at, 'YYYY-MM') = $1`, [MONTH]);
  const total = sum(rows);
  const byCity = group('city').filter(x => x.k && x.k !== '?' && !x.k.startsWith('--'));
  const text = `💶 **Koszty ${MONTH}**\n` +
    `Modele (OpenRouter): **$${total.toFixed(2)}** w ${rows.length} zapytaniach płatnych i darmowych\n` +
    group('model').slice(0, 6).map(x => `• ${x.k}: $${x.usd.toFixed(3)} (${x.n})`).join('\n') + '\n' +
    `Według zadań: ${group('task').map(x => `${x.k} $${x.usd.toFixed(2)}`).join(' · ')}\n` +
    (byCity.length ? `Według miast: ${byCity.slice(0, 8).map(x => `${x.k} $${x.usd.toFixed(2)}`).join(' · ')}\n` : '') +
    `Google Places: ${g.n} zapytań (przegląd lokali)\n` +
    `Praca: ${v.drafts} nowych szkiców, ${v.revisions} poprawek, ${v.published} miast opublikowanych` +
    (v.published ? ` · średnio $${(total / v.published).toFixed(2)} na opublikowane miasto` : '');
  if (!argv.includes('--dry')) await notify(CHANNEL, text);
  console.log(text);
} catch (e) { console.error('BŁĄD:', e.message); process.exitCode = 1; }
finally { await c.end(); }
