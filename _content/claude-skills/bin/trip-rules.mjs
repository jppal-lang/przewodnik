#!/usr/bin/env node
// Pamięć redakcyjna — zasady nauczone z poprawek JP (patrz quality-lib.mjs).
//   node trip-rules.mjs list [--all]          # aktywne (albo wszystkie) zasady
//   node trip-rules.mjs show <id>             # zasada z pochodzeniem i historią doprecyzowań
//   node trip-rules.mjs off <id> [--why "…"]  # „cofnij zasadę 7” — przestaje obowiązywać (nie znika z historii)
//   node trip-rules.mjs on <id>
//   node trip-rules.mjs add --scope quest --rule "…" [--bad "…"] [--good "…"]   # JP dyktuje zasadę wprost
import { db } from './lib.mjs';

const argv = process.argv.slice(2);
const [cmd, arg] = argv;
const opt = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : undefined; };
const c = await db();
const q = async (sql, p) => (await c.query(sql, p)).rows;
try {
  if (cmd === 'list' || !cmd) {
    const rows = await q(`SELECT id, active, scope, rule, origin_city, created_at::date AS od FROM public.editorial_rules
                           ${argv.includes('--all') ? '' : 'WHERE active'} ORDER BY scope, id`);
    for (const r of rows) console.log(`#${r.id}${r.active ? '' : ' (wyłączona)'} [${r.scope}] ${r.rule}  — ${r.origin_city ?? 'JP'}, ${r.od.toISOString?.().slice(0, 10) ?? r.od}`);
    if (!rows.length) console.log('Brak zasad.');
  } else if (cmd === 'show') {
    const [r] = await q('SELECT * FROM public.editorial_rules WHERE id = $1', [+arg]);
    console.log(r ? JSON.stringify(r, null, 2) : `Nie ma zasady #${arg}`);
  } else if (cmd === 'off' || cmd === 'on') {
    const [r] = await q(`UPDATE public.editorial_rules SET active = $2, updated_at = now(),
                           history = history || jsonb_build_array(jsonb_build_object('at', now(), 'action', $3::text, 'why', $4::text))
                          WHERE id = $1 RETURNING id, rule`, [+arg, cmd === 'on', cmd, opt('--why') ?? null]);
    console.log(r ? `#${r.id} ${cmd === 'on' ? 'znowu obowiązuje' : 'wyłączona'}: ${r.rule}` : `Nie ma zasady #${arg}`);
  } else if (cmd === 'add') {
    if (!opt('--rule')) throw new Error('add wymaga --rule "…"');
    const [r] = await q(`INSERT INTO public.editorial_rules (scope, rule, bad, good, origin_say, why)
                         VALUES ($1, $2, $3, $4, $2, 'podyktowana przez JP') RETURNING id`,
      [opt('--scope') ?? 'inne', opt('--rule'), opt('--bad') ?? null, opt('--good') ?? null]);
    console.log(`Zapisano zasadę #${r.id}`);
  } else throw new Error(`nieznane polecenie ${cmd}`);
} catch (e) { console.error('BŁĄD:', e.message); process.exitCode = 1; }
finally { await c.end(); }
