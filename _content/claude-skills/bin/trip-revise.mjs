#!/usr/bin/env node
// Poprawki szkicu według rozmowy z JP (Hermes przekazuje uzgodnione polecenie).
//   node trip-revise.mjs <slug> --say "w Palazzo dei Consoli quest prostszy dla 9-latka; lody przed kolejką" [--notify <kanał>]
//   node trip-revise.mjs <slug> --restore <wersja> [--notify <kanał>]     # „wróć do v2” jako nowy szkic
//   node trip-revise.mjs <slug> --show                                    # stan szkicu: wersja, werdykt, przystanki
// Każda poprawka: GPT (operacje tylko na wskazanych polach) → walidator + Claude → nowa wersja w historii
// z listą zmian „przed → po”. Błędy kontroli wracają do GPT, najwyżej 2 rundy.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { log, db, spent } from './lib.mjs';
import { WORK, writeTrip, review, gptOps, applyOps, mergeChanges, saveDraft, previewUrl, notify, verdictLine } from './draft-lib.mjs';

const argv = process.argv.slice(2);
const slug = argv[0];
const opt = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : undefined; };
const say = opt('--say'), restore = opt('--restore'), channel = opt('--notify');
if (!slug || (!say && !restore && !argv.includes('--show'))) {
  console.error('Użycie: trip-revise.mjs <slug> --say "polecenie" | --restore <wersja> | --show  [--notify kanał]');
  process.exit(2);
}
const c = await db();
const q = async (sql, p) => (await c.query(sql, p)).rows;

async function main() {
  const [{ j: cur }] = await q('SELECT public.trip_draft_get($1) AS j', [slug]);
  if (!cur && !restore) throw new Error(`${slug}: nie ma szkicu — najpierw trip-draft.mjs`);
  const [tk] = await q('SELECT token FROM public.draft_previews WHERE city_slug = $1', [slug]);

  if (argv.includes('--show')) {
    const t = cur.trip;
    console.log(JSON.stringify({ slug, version: cur.version, status: cur.status, verdict: cur.review?.verdict,
      errors: cur.review?.errors ?? [], preview: tk ? previewUrl(tk.token) : null,
      stops: t.meta.stops.map(s => ({ n: s.stop_number, stop_key: s.stop_key, category: s.category, name: t.content.stops[s.stop_key]?.name })) }, null, 2));
    return;
  }

  if (restore) {
    const [{ j: old }] = await q('SELECT public.trip_draft_get($1, $2) AS j', [slug, +restore]);
    if (!old?.trip) throw new Error(`${slug}: wersja ${restore} nie ma plików szkicu — nie da się jej przywrócić jako szkicu`);
    const saved = await saveDraft(q, old.trip, { note: `przywrócono v${restore}`, source: 'restore', changes: [], review: old.review });
    const url = previewUrl(saved.token);
    await notify(channel, `↩️ ${slug}: przywróciłem v${restore} jako szkic v${saved.version}. Podgląd: ${url}`);
    console.log(JSON.stringify({ slug, version: saved.version, restored_from: +restore, preview: url }, null, 2));
    return;
  }

  // poprawka według polecenia
  let trip = cur.trip;
  const all = [];
  const models = new Set();
  log(`${slug}: poprawka v${cur.version} → „${say.slice(0, 120)}”`);
  const first = await gptOps(trip, say);
  models.add(first.model);
  let a = applyOps(trip, first.ops);
  if (!a.changes.length) throw new Error(`GPT nie zaproponował żadnej zmiany${a.skipped.length ? ' (odrzucone: ' + a.skipped.join(' | ') + ')' : ''} — doprecyzuj polecenie`);
  trip = a.trip; all.push(...a.changes);
  const skipped = [...a.skipped];

  let rv;
  for (let round = 0; ; round++) {
    rv = await review(writeTrip(slug, trip));
    log(`${slug}: kontrola ${round + 1}: ${verdictLine(rv)}`);
    if (rv.verdict === 'ok' || round >= 2) break;
    const fx = await gptOps(trip, `Poprzednie polecenie JP: ${say}`, { reviewErrors: rv.errors });
    models.add(fx.model);
    a = applyOps(trip, fx.ops);
    skipped.push(...a.skipped);
    if (!a.changes.length) break;
    trip = a.trip; all.push(...a.changes);
  }

  const changes = mergeChanges(all);
  const saved = await saveDraft(q, trip, { note: say.slice(0, 300), source: 'revise', changes, review: rv });
  const url = previewUrl(saved.token);
  const out = { slug, version: saved.version, from: cur.version, summary: first.summary, changes: changes.length, verdict: rv.verdict,
    errors: rv.errors, warnings: rv.warnings.length, skipped, preview: url, models: [...models], cost_usd: +spent.usd.toFixed(4) };
  writeFileSync(join(WORK, slug, 'last.json'), JSON.stringify(out, null, 2));
  const pretty = changes.slice(0, 8).map(ch => ch.op ? `• ${ch.op === 'add_stop' ? 'nowy przystanek' : ch.op === 'remove_stop' ? 'usunięty' : 'przeniesiony'}: ${ch.name ?? ch.stop_key}`
    : `• ${ch.path.replace(/^(content|meta)\./, '')}`).join('\n');
  await notify(channel, `✏️ **${slug} — szkic v${saved.version}** (z v${cur.version}) · ${verdictLine(rv)}\n${first.summary ? first.summary + '\n' : ''}${pretty}` +
    (changes.length > 8 ? `\n… i ${changes.length - 8} więcej` : '') +
    (rv.errors?.length ? `\nDo poprawy:\n${rv.errors.slice(0, 5).map(e => `• ${e.stop_key ?? 'miasto'}: ${e.problem}`).join('\n')}` : '') +
    `\nPodgląd: ${url} (historia: dodaj &historia)`);
  console.log(JSON.stringify(out, null, 2));
}

try { await main(); }
catch (e) { console.error('BŁĄD:', e.message); await notify(channel, `⚠️ ${slug}: ${e.message.slice(0, 500)}`); process.exitCode = 1; }
finally { await c.end(); }
