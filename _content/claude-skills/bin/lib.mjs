// Wspólne narzędzia skryptów wycieczek (VPS, kontener Hermesa).
import { readFileSync, appendFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire('/opt/data/quolino/package.json');
export const { Client } = require('pg');

export const SKILLS = '/opt/data/home/.claude/skills';
export const env = (n) => process.env[n] ?? (() => {
  try { return readFileSync('/opt/data/.env', 'utf8').split('\n').find(l => l.startsWith(n + '='))?.slice(n.length + 1).trim(); }
  catch { return undefined; }
})();
export const log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a);

export function run(cmd, args, { input, timeout = 15 * 60_000 } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { env: { ...process.env, HOME: '/opt/data/home' } });
    let out = '', err = '';
    const t = setTimeout(() => { p.kill('SIGTERM'); err += '\n[przekroczony czas]'; }, timeout);
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    p.stdin.end(input ?? '');
    p.on('close', code => { clearTimeout(t); resolve({ code, out, err }); });
  });
}

// Claude Code w trybie nieinteraktywnym: umiejętność jako instrukcja systemowa, treść przez stdin.
// Bez narzędzi zapisu — Claude tylko odpowiada, zapis robi skrypt po kontroli.
export async function claude(skillName, prompt, { web = false } = {}) {
  const skill = readFileSync(`${SKILLS}/${skillName}/SKILL.md`, 'utf8');
  const args = ['-p', '--output-format', 'json', '--append-system-prompt', skill,
    '--disallowedTools', 'Bash,Edit,Write,MultiEdit,NotebookEdit' + (web ? '' : ',WebFetch,WebSearch')];
  if (web) args.push('--allowedTools', 'WebFetch,WebSearch,Read');
  const r = await run('claude', args, { input: prompt });
  let res;
  try { res = JSON.parse(r.out); } catch { throw new Error(`claude: nieczytelna odpowiedź (kod ${r.code}) ${r.err.slice(-400)}`); }
  if (res.is_error) throw new Error(`claude: ${res.result ?? res.subtype}`);
  return res.result;
}

export function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(raw);
}

export async function db() {
  const c = new Client({ connectionString: env('QUOLINO_DATABASE_URL') });
  await c.connect();
  return c;
}

// ── Dobór modeli do zadań (OpenRouter; decyzje JP 2026-10-08 i 2026-10-10) ──────────────────
// Kolejność = preferencja: najpierw darmowe (wzorce, tylko :free), potem płatne (dokładne id).
//  translate_en  PL → EN: tekst wersji kontrolnej — największy darmowy model z rozumowaniem
//  translate_xx  EN → pozostałe: Gemma (najmocniejsza wielojęzycznie) na czele
//  draft         szkic wycieczki z researchu
// Płatne zapasy (JP 2026-10-10): GPT-6 Luna PRZED DeepSeek, DeepSeek wyłącznie V3.2.
// Koszt wycieczki na 16 języków ≈ 1–3 zł; każde zapytanie płatne loguje swój faktyczny koszt.
// Claude (subskrypcja) zostaje do: Hermesa, oceny opisów (trip-review), kontroli jakości tłumaczeń.
// Wymuszenie modelu: QUOLINO_MODEL_<ZADANIE>=model (np. QUOLINO_MODEL_TRANSLATE_XX=openai/gpt-6-luna).
export const PAID = ['openai/gpt-6-luna', 'deepseek/deepseek-v3.2'];
export const TASKS = {
  translate_en: ['nemotron-3-ultra', 'qwen', 'gemma-4-31b', 'nemotron-3-super', 'gemma-4', ...PAID],
  translate_xx: ['gemma-4-31b', 'gemma-4', 'nemotron-3-ultra', 'qwen', 'nemotron-3-super', ...PAID],
  // szkic i poprawki wycieczek pisze GPT (decyzja JP 2026-10-10: GPT pisze, Claude sprawdza, JP zatwierdza)
  draft: [...PAID, 'nemotron-3-ultra', 'qwen', 'nemotron-3-super'],
};
// Ustawienia płatnych: tłumaczenie nie potrzebuje długiego rozumowania; najtańszy dostawca.
const PAID_OPTS = {
  'openai/gpt-6-luna': { reasoning: { effort: 'low' } },
  'deepseek/deepseek-v3.2': { reasoning: { enabled: false } },
};
// Inkling (thinkingmachines) odrzuca zapytania spoza „agentic harnesses” (403) — pomijamy.
// Darmowe DeepSeeki pomijamy: DeepSeek tylko jako płatny V3.2.
const SKIP = ['inkling', 'deepseek'];
let FREE;
const state = {};
const dead = new Set();          // modele niedostępne do końca uruchomienia (brak środków, limit dzienny, 403)
export const spent = { usd: 0, calls: 0, byModel: {} };
async function freeIds() {
  if (!FREE) FREE = (await (await fetch('https://openrouter.ai/api/v1/models')).json()).data
    .map(m => m.id).filter(id => id.endsWith(':free') && !SKIP.some(s => id.includes(s)));
  return FREE;
}
export async function modelsFor(task) {
  if (state[task]) return state[task].models;
  const ids = await freeIds();
  const out = [];
  const forced = env(`QUOLINO_MODEL_${task.toUpperCase()}`);
  if (forced) out.push(forced);
  for (const p of TASKS[task] ?? TASKS.translate_en) {
    if (p.includes('/')) { if (!out.includes(p)) out.push(p); continue; }       // dokładne id (płatny)
    for (const id of ids) if (id.includes(p) && !out.includes(id)) out.push(id);
  }
  if (!out.length) throw new Error('OpenRouter: brak modeli dla ' + task);
  state[task] = { models: out, i: 0 };
  return out;
}
const alive = (task) => state[task].models.filter(m => !dead.has(m));
export async function currentModel(task) {
  await modelsFor(task);
  const s = state[task];
  if (dead.has(s.models[s.i])) nextModel(task);
  return s.models[s.i];
}
export function nextModel(task) {
  const s = state[task];
  for (let k = 0; k < s.models.length; k++) {
    s.i = (s.i + 1) % s.models.length;
    if (!dead.has(s.models[s.i])) break;
  }
  return s.models[s.i];
}

export async function openrouter(skillName, prompt, task = 'translate_en') {
  const key = env('OPENROUTER_API_KEY');
  if (!key) throw new Error('brak OPENROUTER_API_KEY');
  const skill = readFileSync(`${SKILLS}/${skillName}/SKILL.md`, 'utf8');
  const models = await modelsFor(task);
  let lastErr = '';
  for (let attempt = 0; attempt < models.length * 2 && alive(task).length; attempt++) {
    const model = await currentModel(task);
    const paid = !model.endsWith(':free');
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(10 * 60_000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Quolino' },
      body: JSON.stringify({ model, temperature: 0.2, usage: { include: true },
        ...(paid ? { provider: { sort: 'price' }, ...(PAID_OPTS[model] ?? {}),
          ...(task === 'draft' && model.includes('gpt-6-luna') ? { reasoning: { effort: 'medium' } } : {}) } : {}),
        messages: [{ role: 'system', content: skill }, { role: 'user', content: prompt }] }),
    }).catch(e => ({ ok: false, status: 0, json: async () => ({ error: { message: e.message } }) }));
    const j = await r.json().catch(() => ({}));
    const text = j.choices?.[0]?.message?.content;
    if (r.ok && text && !j.error) {
      const cost = +(j.usage?.cost ?? 0);
      spent.usd += cost; spent.calls++; spent.byModel[model] = (spent.byModel[model] ?? 0) + cost;
      if (paid) log(`  ${model}: $${cost.toFixed(4)} (${j.usage?.prompt_tokens ?? '?'} → ${j.usage?.completion_tokens ?? '?'} tok.)`);
      try {   // dziennik kosztów (raport miesięczny: cost-report.mjs)
        appendFileSync('/opt/data/quolino/work/costs.jsonl', JSON.stringify({ at: new Date().toISOString(), task, model, usd: cost,
          tin: j.usage?.prompt_tokens ?? null, tout: j.usage?.completion_tokens ?? null, script: process.argv[1]?.split('/').pop(),
          city: process.argv[2] ?? null }) + '\n');
      } catch {}
      return { text, model, cost };
    }
    const msg = JSON.stringify(j.error ?? j);
    lastErr = `${model} ${r.status}: ${msg.slice(0, 200)}`;
    log('OpenRouter:', lastErr);
    if (r.status === 401) throw new Error(lastErr);
    if (r.status === 402 || r.status === 403) { dead.add(model); log(`  ${model}: niedostępny do końca uruchomienia${r.status === 402 ? ' (brak środków na koncie)' : ''}`); }
    if (r.status === 429 && /free-models-per-day/.test(msg)) {
      for (const m of models) if (m.endsWith(':free')) dead.add(m);
      log('  dzienny limit darmowych modeli wyczerpany — dalej tylko płatne');
    }
    if (!alive(task).length) break;
    log('→ przełączam na', nextModel(task));
    if (!paid || r.status === 429) await new Promise(res => setTimeout(res, 15_000));
  }
  throw new Error(`OpenRouter: żaden model nie odpowiedział (${lastErr})`);
}

// Tłumacz: OpenRouter, gdy jest klucz; inaczej Claude (subskrypcja).
export async function translator(skillName, prompt, task) {
  if (env('OPENROUTER_API_KEY')) return openrouter(skillName, prompt, task);
  return { text: await claude(skillName, prompt), model: 'claude', cost: 0 };
}
