// Wspólne narzędzia skryptów wycieczek (VPS, kontener Hermesa).
import { readFileSync } from 'node:fs';
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

// ── Dobór modeli do zadań (darmowe modele OpenRouter, decyzja JP 2026-10-08) ──────────────
// Kolejność = preferencja; przeciążony / limit / zły wynik → następny model z listy zadania.
//  translate_en  PL → EN: tekst wersji kontrolnej — największy model z rozumowaniem
//  translate_xx  EN → pozostałe: modele najmocniejsze wielojęzycznie (Gemma od Google na czele)
//  draft         szkic wycieczki z researchu: długi kontekst + rozumowanie
// Claude (subskrypcja) zostaje do: Hermesa, oceny opisów (trip-review), kontroli jakości tłumaczeń.
// Wymuszenie modelu: QUOLINO_MODEL_<ZADANIE>=model (np. QUOLINO_MODEL_TRANSLATE_XX=google/gemma-4-31b-it:free).
export const TASKS = {
  translate_en: ['nemotron-3-ultra', 'deepseek', 'qwen', 'gemma-4-31b', 'nemotron-3-super', 'gemma-4'],
  translate_xx: ['gemma-4-31b', 'gemma-4', 'nemotron-3-ultra', 'qwen', 'deepseek', 'nemotron-3-super'],
  draft: ['nemotron-3-ultra', 'deepseek', 'qwen', 'nemotron-3-super'],
};
// Inkling (thinkingmachines) odrzuca zapytania spoza „agentic harnesses” (403) — pomijamy
const SKIP = ['inkling'];
let FREE;
const state = {};
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
  for (const p of TASKS[task] ?? TASKS.translate_en) for (const id of ids) if (id.includes(p) && !out.includes(id)) out.push(id);
  if (!out.length) throw new Error('OpenRouter: brak darmowych modeli dla ' + task);
  state[task] = { models: out, i: 0 };
  return out;
}
export async function currentModel(task) { await modelsFor(task); return state[task].models[state[task].i]; }
export function nextModel(task) { const s = state[task]; s.i = (s.i + 1) % s.models.length; return s.models[s.i]; }

export async function openrouter(skillName, prompt, task = 'translate_en') {
  const key = env('OPENROUTER_API_KEY');
  if (!key) throw new Error('brak OPENROUTER_API_KEY');
  const skill = readFileSync(`${SKILLS}/${skillName}/SKILL.md`, 'utf8');
  const models = await modelsFor(task);
  let lastErr = '';
  for (let attempt = 0; attempt < models.length * 2; attempt++) {
    const model = await currentModel(task);
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(10 * 60_000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Quolino' },
      body: JSON.stringify({ model, temperature: 0.2,
        messages: [{ role: 'system', content: skill }, { role: 'user', content: prompt }] }),
    }).catch(e => ({ ok: false, status: 0, json: async () => ({ error: { message: e.message } }) }));
    const j = await r.json().catch(() => ({}));
    const text = j.choices?.[0]?.message?.content;
    if (r.ok && text && !j.error) return { text, model };
    lastErr = `${model} ${r.status}: ${JSON.stringify(j.error ?? j).slice(0, 200)}`;
    log('OpenRouter:', lastErr);
    if (r.status === 401 || r.status === 402) throw new Error(lastErr);
    log('→ przełączam na', nextModel(task));
    await new Promise(res => setTimeout(res, 15_000));
  }
  throw new Error(`OpenRouter: żaden darmowy model nie odpowiedział (${lastErr})`);
}

// Tłumacz: OpenRouter, gdy jest klucz; inaczej Claude (subskrypcja).
export async function translator(skillName, prompt, task) {
  if (env('OPENROUTER_API_KEY')) return openrouter(skillName, prompt, task);
  return { text: await claude(skillName, prompt), model: 'claude' };
}
