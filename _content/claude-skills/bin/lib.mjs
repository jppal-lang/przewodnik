// Wspólne narzędzia skryptów wycieczek (VPS, kontener Hermesa).
import { readFileSync, appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { parseModelJson } from './json-repair.mjs';
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
export const claudeUsage = { calls: 0, input: 0, output: 0 };
// Dziennik zużycia AI (karta „Koszty AI” w panelu, JP 2026-10-25): jeden wiersz na zapytanie w work/costs.jsonl,
// do bazy przenosi ai-usage-import.mjs. usd = realnie zapłacone (liczy się do dziennego limitu), usd_equiv = równowartość cennika API.
// Rola (za co odpowiada) i przebieg: globalThis.__aiRole() / __aiRun ustawia skrypt (np. gemini-draft.mjs).
export function aiUsage({ provider, model = null, role = null, billing = 'api', tin = 0, tout = 0, usd = 0, usd_equiv = null, city = null, run = null }) {
  try {
    appendFileSync('/opt/data/quolino/work/costs.jsonl', JSON.stringify({ at: new Date().toISOString(), provider, model,
      task: role ?? globalThis.__aiRole?.() ?? null, billing, tin, tout, usd, usd_equiv: usd_equiv ?? usd,
      script: process.argv[1]?.split('/').pop(), city: city ?? globalThis.__aiCity ?? process.argv[2] ?? null, run: run ?? globalThis.__aiRun ?? null }) + '\n');
  } catch { /* dziennik pomocniczy */ }
}
export async function claude(skillName, prompt, { web = false } = {}) {
  const skill = readFileSync(`${SKILLS}/${skillName}/SKILL.md`, 'utf8');
  const args = ['-p', '--output-format', 'json', '--append-system-prompt', skill,
    '--disallowedTools', 'Bash,Edit,Write,MultiEdit,NotebookEdit' + (web ? '' : ',WebFetch,WebSearch')];
  if (web) args.push('--allowedTools', 'WebFetch,WebSearch,Read');
  const r = await run('claude', args, { input: prompt });
  let res;
  try { res = JSON.parse(r.out); } catch { throw new Error(`claude: nieczytelna odpowiedź (kod ${r.code}) ${r.err.slice(-400)}`); }
  const u = res.usage ?? {};   // zużycie tokenów Claude w tym procesie (dashboard postępu w panelu admina)
  claudeUsage.calls++; claudeUsage.input += (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  claudeUsage.output += u.output_tokens ?? 0;
  // Claude Code na serwerze: z kluczem API płacimy realnie, bez klucza (logowanie kontem) to abonament — kwota tylko jako równowartość
  const api = !!process.env.ANTHROPIC_API_KEY, usd = +(res.total_cost_usd ?? 0);
  aiUsage({ provider: 'claude', model: Object.keys(res.modelUsage ?? {})[0] ?? 'claude', role: globalThis.__aiRole?.() ?? `${skillName}${web ? ' (z wyszukiwaniem)' : ''}`,
    billing: api ? 'api' : 'abonament', tin: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0), tout: u.output_tokens ?? 0,
    usd: api ? usd : 0, usd_equiv: usd });
  if (res.is_error) throw new Error(`claude: ${res.result ?? res.subtype}`);
  return res.result;
}

// Najpierw zwykłe parsowanie, potem naprawa w kodzie (json-repair.mjs) — dopiero gdy i ona zawiedzie, błąd (i ewentualna naprawa przez model).
export { repairJson } from './json-repair.mjs';
export function extractJson(text) {
  return parseModelJson(text, { onRepair: (e) => log(`naprawa JSON w kodzie (${String(e.message).slice(0, 100)})`) });
}

// Odpowiedź Claude jako JSON z jedną ponowną prośbą (Piza 2026-10-14: model wstawił prosty " w tekście i JSON.parse padł).
// 1) zwykłe parsowanie, 2) przy błędzie: jedna prośba o SAM poprawny JSON z tym samym werdyktem (bez nowego researchu),
// 3) gdy i to zawiedzie: surowa odpowiedź do pliku (rawFile) i czytelny błąd z jego ścieżką.
export const JSON_QUOTE_RULE = 'W tekstach wewnątrz JSON-a używaj wyłącznie typograficznych cudzysłowów „…” — nigdy prostego znaku ". Odpowiedz wyłącznie poprawnym JSON-em.';
export async function claudeJson(skillName, prompt, { web = false, rawFile = null } = {}) {
  const raw = await claude(skillName, prompt, { web });
  try { return extractJson(raw); } catch (e1) {
    log(`claudeJson: błąd parsowania także po naprawie w kodzie (${e1.message.slice(0, 120)}) — ponawiam prośbą o sam poprawny JSON`);
    let raw2 = '';
    try {
      raw2 = await claude(skillName, `Poniższa odpowiedź miała być JSON-em, ale nie da się jej sparsować (${e1.message.slice(0, 200)}). Zwróć TEN SAM werdykt ` +
        `(te same błędy, uwagi i podsumowanie, bez nowej oceny i bez zmian merytorycznych) jako poprawny JSON. ${JSON_QUOTE_RULE} Zamień każdy prosty " wewnątrz tekstu na „ lub ”.\n\n=== ODPOWIEDŹ ===\n${raw}`, { web: false });
      return extractJson(raw2);
    } catch (e2) {
      let where = '';
      if (rawFile) { try { writeFileSync(rawFile, `--- odpowiedź 1 (${e1.message}) ---\n${raw}\n\n--- odpowiedź 2 (${e2.message}) ---\n${raw2}\n`); where = ` Surowa odpowiedź: ${rawFile}`; } catch {} }
      throw new Error(`kontrola Claude zwróciła niepoprawny JSON także po ponownej prośbie (${e2.message.slice(0, 120)}).${where}`);
    }
  }
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
  // szkic, poprawki, posty: darmowe najpierw, płatne tylko awaryjnie (JP 2026-10-11)
  draft: ['nemotron-3-ultra', 'qwen', 'nemotron-3-super', 'gemma-4-31b', ...PAID],
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

// ── Dzienny limit płatnych zapytań (JP 2026-10-11) ────────────────────────────────────────
// Suma z work/costs.jsonl za dziś (UTC). Po przekroczeniu: płatne modele odcięte, jeden alert dziennie.
const COSTS = '/opt/data/quolino/work/costs.jsonl';
export const DAILY_USD = +(env('QUOLINO_DAILY_USD') ?? 0.5);
export function paidToday() {
  const day = new Date().toISOString().slice(0, 10);
  try {
    return readFileSync(COSTS, 'utf8').split('\n').reduce((sum, l) => {
      if (!l.includes(day)) return sum;
      try { const j = JSON.parse(l); return j.at?.startsWith(day) ? sum + (+j.usd || 0) : sum; } catch { return sum; }
    }, 0);
  } catch { return 0; }
}
async function budgetAlert(used) {
  const flag = `/opt/data/quolino/work/budget-${new Date().toISOString().slice(0, 10)}.flag`;
  if (existsSync(flag)) return;
  try { writeFileSync(flag, String(used)); } catch {}
  const msg = `💸 Dzienny limit płatnych modeli osiągnięty: $${used.toFixed(2)} / $${DAILY_USD.toFixed(2)}. Płatne zapytania wstrzymane do północy UTC (${process.argv[1]?.split('/').pop()} ${process.argv[2] ?? ''}). Limit: QUOLINO_DAILY_USD w /opt/data/.env.`;
  log(msg);
  const hook = env('ALERT_WEBHOOK');
  if (hook) await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: msg }) }).catch(() => {});
}
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
    if (paid) {
      const used = paidToday();
      if (used >= DAILY_USD) {
        for (const m of models) if (!m.endsWith(':free')) dead.add(m);
        await budgetAlert(used);
        lastErr = `dzienny limit płatnych $${DAILY_USD} osiągnięty`;
        if (!alive(task).length) break;
        nextModel(task); continue;
      }
    }
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(10 * 60_000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Quolino' },
      body: JSON.stringify({ model, temperature: 0.2, usage: { include: true },
        ...(paid ? { provider: { sort: 'price' }, ...(PAID_OPTS[model] ?? {}),
        } : {}),
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

// OpenRouter + JSON: gdy model zwróci uszkodzony JSON (częste przy długich szkicach na darmowych modelach),
// przełącz na następny model i spróbuj ponownie (JP 2026-10-12). Zwraca { text, model, cost, json }.
export async function openrouterJson(skillName, prompt, task = 'draft', tries = 5) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    const r = await openrouter(skillName, prompt, task);
    try { return { ...r, json: extractJson(r.text) }; }
    catch (e) {
      lastErr = e;
      log(`  ${r.model}: uszkodzony JSON (${String(e.message).slice(0, 80)}) — próba ${i + 1}/${tries}, następny model`);
      nextModel(task);
    }
  }
  throw new Error(`OpenRouter: ${tries} odpowiedzi bez poprawnego JSON (${lastErr?.message})`);
}

// Tłumacz: OpenRouter, gdy jest klucz; inaczej Claude (subskrypcja).
export async function translator(skillName, prompt, task) {
  if (env('OPENROUTER_API_KEY')) return openrouter(skillName, prompt, task);
  return { text: await claude(skillName, prompt), model: 'claude', cost: 0 };
}

// ── limit Antigravity (AI Pro) wspólny dla wszystkich skryptów (JP 2026-10-26) ──
// Po „Individual quota reached … Resets in 128h41m” zapisujemy godzinę odnowienia; do tego czasu nikt nie próbuje Antigravity
// (każda nieudana próba to minuta czekania), a kolejka wycieczek wie, kiedy wznowić.
const AGY_QUOTA_F = '/opt/data/quolino/work/agy-quota.json';
export function agyQuotaHit(message) {
  const m = String(message).match(/Resets in\s*(?:(\d+)h)?\s*(?:(\d+)m)?/i);
  const ms = m ? ((+(m[1] ?? 0)) * 60 + (+(m[2] ?? 0))) * 60_000 : 6 * 3600_000;
  try { writeFileSync(AGY_QUOTA_F, JSON.stringify({ resetAt: new Date(Date.now() + ms).toISOString(), at: new Date().toISOString() })); } catch { /* bez znacznika */ }
}
export function agyQuotaOut() {
  try { const j = JSON.parse(readFileSync(AGY_QUOTA_F, 'utf8')); return Date.parse(j.resetAt) > Date.now() ? j.resetAt : null; } catch { return null; }
}
// wywołania Antigravity w ostatnich 7 dniach (z dziennika kosztów) — do progu ostrzeżeń 50/80/90 %
export function agyWeekCalls() {
  try { const since = Date.now() - 7 * 86400_000; return readFileSync(COSTS, 'utf8').split('\n').reduce((n, l) => { try { const j = JSON.parse(l); return n + (j.provider === 'gemini' && j.billing === 'abonament' && Date.parse(j.at) > since ? 1 : 0); } catch { return n; } }, 0); } catch { return 0; }
}
