#!/usr/bin/env node
// Decyzja JP w rozmowie: zatwierdzenie albo odrzucenie aktualnego szkicu.
//   node trip-approve.mjs <slug> [--version N] [--note "…"] [--no-social]   # publikacja + tłumaczenie + szkic postów
//   node trip-approve.mjs <slug> --reject "powód" [--version N]
// Te same funkcje co panel admina (admin_approve / admin_reject): wersja na żywo trafia do historii,
// szkic na stronę, tłumaczenie do kolejki (ops.jobs → trip-translate.mjs).
import { spawn } from 'node:child_process';
import { openSync, mkdirSync } from 'node:fs';
import { db } from './lib.mjs';
import { SITE } from './draft-lib.mjs';

const argv = process.argv.slice(2);
const slug = argv[0];
const opt = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : undefined; };
if (!slug) { console.error('Użycie: trip-approve.mjs <slug> [--version N] [--note "…"] | --reject "powód"'); process.exit(2); }
const c = await db();
const q = async (sql, p) => (await c.query(sql, p)).rows;
try {
  const v = opt('--version') ? +opt('--version')
    : (await q("SELECT max(version) AS v FROM public.city_versions WHERE city_slug = $1 AND status = 'draft'", [slug]))[0].v;
  if (!v) throw new Error(`${slug}: nie ma szkicu czekającego na decyzję`);
  const reject = opt('--reject');
  const [{ r }] = reject
    ? await q('SELECT admin.admin_reject($1, $2, $3) AS r', [slug, v, reject])
    : await q('SELECT admin.admin_approve($1, $2, $3) AS r', [slug, v, opt('--note') ?? 'zatwierdzone w rozmowie (Discord)']);
  console.log(JSON.stringify({ ...r, page: reject ? null : `${SITE}/city.html?c=${slug}` }, null, 2));
  // po publikacji: szkic postów do mediów społecznościowych na #social (w tle; publikuje JP)
  if (!reject && !argv.includes('--no-social')) {
    mkdirSync('/opt/data/quolino/work/social', { recursive: true });
    const logf = openSync(`/opt/data/quolino/work/social/${slug}.log`, 'a');
    spawn(process.execPath, [new URL('./social-draft.mjs', import.meta.url).pathname, slug],
      { detached: true, stdio: ['ignore', logf, logf], cwd: '/opt/data/quolino' }).unref();
    console.log('Posty do social media: przygotowuję w tle → #social');
  }
} catch (e) { console.error('BŁĄD:', e.message); process.exitCode = 1; }
finally { await c.end(); }
