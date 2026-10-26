#!/usr/bin/env node
// Tłumaczenia stron pomocniczych (kontakt, współpraca, logowanie, konto, prywatność) — JP 2026-10-25.
// Źródło: polski tekst w HTML repo (data-t="page.…">tekst<, data-t-ph/aria oraz PT('page.…', 'tekst') w skryptach).
// Skrypt zapisuje polski do public.ui_translations, a brakujące albo nieaktualne języki tłumaczy Gemini (Antigravity, AI Pro).
//   node ui-translate.mjs [--dry] [--lang de,en] [--force]      (cron co godzinę; cichy, gdy nic nowego)
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { db, log, aiUsage, extractJson, run, translator } from './lib.mjs';

const REPO = '/opt/data/repo/przewodnik';
const AGY = '/opt/data/home/.local/bin/agy';
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : null; };
const DRY = argv.includes('--dry'), FORCE = argv.includes('--force');

await run('sh', ['/opt/data/quolino/repo.sh', 'pull'], { timeout: 120_000 });   // najnowsze strony z repo
// 1) polskie teksty ze stron
const unesc = (t) => t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const PL = {};
for (const f of readdirSync(REPO).filter(x => x.endsWith('.html'))) {
  const h = readFileSync(`${REPO}/${f}`, 'utf8');
  for (const m of h.matchAll(/data-t="(page\.[a-z0-9_.-]+)"[^>]*>([^<]+)</g)) PL[m[1]] ??= unesc(m[2]);
  for (const m of h.matchAll(/data-t-(?:ph|aria)="(page\.[a-z0-9_.-]+)"[^>]*?(?:placeholder|aria-label)="([^"]+)"/g)) PL[m[1]] ??= unesc(m[2]);
  for (const m of h.matchAll(/<(p|li|h1|h2|h3|span|div)\b[^>]*data-t-html="(page\.[a-z0-9_.-]+)"[^>]*>([\s\S]*?)<\/\1>/g)) PL[m[2]] ??= m[3].replace(/\s+/g, ' ').trim();
  for (const m of h.matchAll(/PT\('(page\.[a-z0-9_.-]+)',\s*'((?:[^'\\]|\\.)*)'\)/g)) PL[m[1]] ??= unesc(m[2].replace(/\\'/g, "'"));
}
const keys = Object.keys(PL);
if (!keys.length) process.exit(0);

function agy(prompt) {
  return new Promise((resolve, reject) => {
    mkdirSync('/tmp/gq', { recursive: true });
    const env = { ...process.env, HOME: '/opt/data/home' }; delete env.GOOGLE_API_KEY; delete env.GEMINI_API_KEY;
    const p = spawn(AGY, ['-p', prompt, '--output-format', 'json', '--print-timeout', '600s', '--sandbox', '--mode', 'plan'], { cwd: '/tmp/gq', env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', done = false;
    const finish = (code) => {
      if (done) return;
      let j = null; try { j = JSON.parse(out.slice(out.indexOf('{'))); } catch {}
      if (!j && code === 'stream') return;
      done = true; clearTimeout(t); try { p.kill('SIGKILL'); } catch {}
      if (j?.status === 'SUCCESS' && j.response) { aiUsage({ provider: 'gemini', model: 'Antigravity (AI Pro)', role: 'tłumaczenie stron', billing: 'abonament', tin: j.usage?.total_tokens ?? 0 }); return resolve(String(j.response)); }
      reject(new Error(`Antigravity ${j?.status ?? 'kod ' + code}`));
    };
    const t = setTimeout(() => finish('timeout'), 6 * 60_000);
    p.stdout.on('data', d => { out += d; if (/\}\s*$/.test(out)) finish('stream'); });
    p.on('close', code => finish(code));
  });
}

const c = await db();
const q = async (s, p) => (await c.query(s, p)).rows;
try {
  const langs = (opt('--lang')?.split(',') ?? (await q(`SELECT code FROM public.languages WHERE enabled ORDER BY priority`)).map(r => r.code)).filter(l => l !== 'pl');
  const have = {};
  for (const r of await q(`SELECT key, lang, value, updated_at FROM public.ui_translations WHERE key LIKE 'page.%'`)) (have[r.lang] ??= {})[r.key] = r;
  // polski: nowy albo zmieniony tekst → zapis; zmieniony = inne języki do przetłumaczenia od nowa
  const changed = new Set();
  for (const k of keys) if (have.pl?.[k]?.value !== PL[k]) { changed.add(k); if (!DRY) await q(`INSERT INTO public.ui_translations (key, lang, value, updated_at) VALUES ($1, 'pl', $2, now()) ON CONFLICT (key, lang) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [k, PL[k]]); }
  for (const lang of langs) {
    const todo = keys.filter(k => FORCE || changed.has(k) || !have[lang]?.[k]);
    if (!todo.length) continue;
    log(`ui-translate: ${lang} — ${todo.length} napisów`);
    if (DRY) continue;
    for (let i = 0; i < todo.length; i += 60) {
      const part = Object.fromEntries(todo.slice(i, i + 60).map(k => [k, PL[k]]));
      const prompt = `Przetłumacz napisy interfejsu strony Quolino (rodzinne przewodniki po miastach Europy, gra terenowa dla dzieci; zwracamy się do rodzica na „ty”, ciepło i prosto) z polskiego na język o kodzie „${lang}”.
Zasady: naturalny język strony; znaczniki HTML (<code>, <strong>, <b>, <em>, <br>) zostaw dokładnie jak są, a tekstu w <code> nie tłumacz; nazwy firm, przepisów i serwisów zostaw;
naturalny, krótki język interfejsu jak w dobrych aplikacjach w tym języku; zachowaj sens, ton i interpunkcję; nazwy własne Quolino i Quo bez zmian; nie dodawaj nic od siebie; nie używaj długich myślników.
Odpowiedz wyłącznie JSON-em: {"klucz": "tłumaczenie", …} z tymi samymi kluczami.
${JSON.stringify(part, null, 1)}`;
      let out;
      // JP 2026-10-26: tłumaczenia NIE idą przez Antigravity (agent dokłada ~10 tys. tokenów na każde wywołanie i zjadł tygodniowy limit AI Pro).
      // Darmowe modele OpenRouter (jak tłumaczenia tras); Antigravity tylko awaryjnie z --agy.
      try { out = extractJson(argv.includes('--agy') ? await agy(prompt) : (await translator('quolino-trip-translate', prompt, 'translate_xx')).text); } catch (e) { log(`ui-translate ${lang}: ${e.message}`); break; }
      for (const [k, v] of Object.entries(out ?? {})) if (part[k] && typeof v === 'string' && v.trim())
        await q(`INSERT INTO public.ui_translations (key, lang, value, updated_at) VALUES ($1, $2, $3, now()) ON CONFLICT (key, lang) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [k, lang, v.trim()]);
    }
  }
} finally { await c.end(); }
