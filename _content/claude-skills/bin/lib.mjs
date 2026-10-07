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
