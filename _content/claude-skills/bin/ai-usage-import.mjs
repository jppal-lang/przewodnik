#!/usr/bin/env node
// Dziennik zużycia AI → public.ai_usage (karta „Koszty AI” w panelu, JP 2026-10-25).
// Źródła: work/costs.jsonl (każde zapytanie: Claude, Gemini, OpenRouter) oraz — dla przebiegów sprzed dziennika —
// narastające tokeny z public.pipeline_events (jeden wiersz na przebieg i model). Klucz k = skrót wiersza: bez duplikatów.
// Uruchamiany przez gemini-queue.mjs co 10 min i na końcu gemini-draft.mjs. Cichy.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { db } from './lib.mjs';

const F = '/opt/data/quolino/work/costs.jsonl';
export async function importUsage(q) {
  const rows = [];
  if (existsSync(F)) for (const line of readFileSync(F, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let j; try { j = JSON.parse(line); } catch { continue; }
    if (!j.at) continue;
    const usd = +j.usd || 0;
    rows.push([createHash('sha1').update(line).digest('hex'), j.at, j.provider ?? 'openrouter', j.model ?? null, j.task ?? j.script ?? null,
      j.billing ?? (usd > 0 ? 'api' : 'darmowe'), j.city ?? null, j.run ?? null, +j.tin || 0, +j.tout || 0, usd, j.usd_equiv != null ? +j.usd_equiv || 0 : usd]);
  }
  let n = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const part = rows.slice(i, i + 500);
    const vals = part.map((_, r) => `(${Array.from({ length: 12 }, (_, c) => `$${r * 12 + c + 1}`).join(',')})`).join(',');
    const res = await q(`INSERT INTO public.ai_usage (k, at, provider, model, role, billing, city_slug, run_id, tokens_in, tokens_out, usd, usd_equiv)
      VALUES ${vals} ON CONFLICT (k) DO NOTHING RETURNING k`, part.flat());
    n += res.length;
  }
  // przebiegi bez wpisów w dzienniku (stary kod): tokeny z pipeline_events, aktualizowane, dopóki przebieg trwa
  await q(`INSERT INTO public.ai_usage (k, at, provider, model, role, billing, city_slug, run_id, calls, tokens_in)
    SELECT 'ev:' || e.run_id || ':' || p.provider, max(e.created_at), p.provider, p.model, 'proces wycieczki (przed dziennikiem)', 'abonament', min(e.city_slug), e.run_id,
           CASE p.provider WHEN 'gemini' THEN max(e.gemini_calls) ELSE max(e.claude_calls) END,
           CASE p.provider WHEN 'gemini' THEN max(e.gemini_tokens) ELSE max(e.claude_tokens) END
      FROM public.pipeline_events e CROSS JOIN (VALUES ('gemini', 'Antigravity (AI Pro)'), ('claude', 'Claude Code')) p(provider, model)
     WHERE NOT EXISTS (SELECT 1 FROM public.ai_usage u WHERE u.run_id = e.run_id AND u.k NOT LIKE 'ev:%')
     GROUP BY e.run_id, p.provider, p.model
    HAVING CASE p.provider WHEN 'gemini' THEN max(e.gemini_tokens) ELSE max(e.claude_tokens) END > 0
    ON CONFLICT (k) DO UPDATE SET at = EXCLUDED.at, calls = EXCLUDED.calls, tokens_in = EXCLUDED.tokens_in`);
  // przebieg, który ma już wpisy z dziennika, nie liczy się podwójnie
  await q(`DELETE FROM public.ai_usage u WHERE u.k LIKE 'ev:%' AND EXISTS (SELECT 1 FROM public.ai_usage d WHERE d.run_id = u.run_id AND d.k NOT LIKE 'ev:%')`);
  return n;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const c = await db();
  try { const n = await importUsage(async (s, p) => (await c.query(s, p)).rows); if (process.argv.includes('-v')) console.log(`ai_usage: +${n}`); }
  finally { await c.end(); }
}
