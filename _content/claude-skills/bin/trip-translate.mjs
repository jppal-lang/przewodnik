#!/usr/bin/env node
// Tłumaczenie ZATWIERDZONEJ wycieczki (umiejętność quolino-trip-translate).
//   node trip-translate.mjs <slug> [--langs en,de,it] [--job <id ops.jobs>] [--dry]
// Kolejność: PL → EN, potem EN → pozostałe włączone języki (PL jako odniesienie znaczeniowe).
// Każdy język: tłumaczenie w częściach → check_translation.py → zapis trip_apply_translation().
// Błąd EN zatrzymuje całość; błąd innego języka pomija tylko ten język.
import { writeFileSync, mkdirSync } from 'node:fs';
import { SKILLS, run, claude, extractJson, log, db } from './lib.mjs';

const argv = process.argv.slice(2);
const slug = argv[0];
const opt = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : undefined; };
const DRY = argv.includes('--dry');
const JOB = opt('--job');
if (!slug) { console.error('Użycie: trip-translate.mjs <slug> [--langs en,de] [--job id] [--dry]'); process.exit(2); }

const WORK = `/opt/data/quolino/work/translate/${slug}`;
mkdirSync(WORK, { recursive: true });
const c = await db();
const q = async (sql, p) => (await c.query(sql, p)).rows;

async function job(fields) {
  if (!JOB) return;
  const keys = Object.keys(fields);
  await q(`UPDATE ops.jobs SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`,
    [JOB, ...keys.map(k => fields[k])]).catch(() => {});
}

// części: nagłówek (miasto + plan + punkty awaryjne) i przystanki po 3
function parts(src) {
  const head = { ...src, stops: [] };
  const out = [head];
  for (let i = 0; i < src.stops.length; i += 3) out.push({ city_slug: src.city_slug, lang: src.lang, stops: src.stops.slice(i, i + 3) });
  return out;
}

async function translate(src, lang, ref, feedback) {
  const result = { ...src, lang, stops: [] };
  const notes = [];
  for (const [i, part] of parts(src).entries()) {
    const prompt = `Przetłumacz tę część wycieczki z języka "${src.lang}" na "${lang}" według umiejętności quolino-trip-translate.
Zwróć wyłącznie JSON w identycznym kształcie (te same klucze, ta sama kolejność), z "lang": "${lang}".
${feedback ? `\nPOPRZEDNIA PRÓBA ODRZUCONA przez kontrolę — popraw dokładnie te błędy:\n${feedback}\n` : ''}
${ref ? `Odniesienie znaczeniowe (polski oryginał tej części, tylko do rozstrzygania wątpliwości):\n${JSON.stringify(ref(part))}\n` : ''}
Źródło do tłumaczenia:
${JSON.stringify(part)}`;
    const t = extractJson(await claude('quolino-trip-translate', prompt));
    if (Array.isArray(t._translator_notes)) notes.push(...t._translator_notes);
    if (i === 0) { result.city = t.city; result.day_plan = t.day_plan ?? []; result.emergency_points = t.emergency_points ?? []; }
    else result.stops.push(...(t.stops ?? []));
    log(`  ${lang}: część ${i + 1}/${parts(src).length}`);
  }
  return { result, notes };
}

async function check(src, dst, lang) {
  const a = `${WORK}/${src.lang}.json`, b = `${WORK}/${lang}.json`;
  writeFileSync(a, JSON.stringify(src, null, 2));
  writeFileSync(b, JSON.stringify(dst, null, 2));
  const r = await run('python3', [`${SKILLS}/quolino-trip-translate/scripts/check_translation.py`, a, b, '--json']);
  try { return JSON.parse(r.out); } catch { return { ok: false, errors: [`kontrola nie zadziałała: ${r.err.slice(-300)}`] }; }
}

async function one(src, lang, ref) {
  let feedback = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { result, notes } = await translate(src, lang, ref, feedback);
    const k = await check(src, result, lang);
    if (k.ok) {
      if (!DRY) await q('SELECT public.trip_apply_translation($1, $2, $3::jsonb) AS r', [slug, lang, JSON.stringify(result)]);
      log(`✓ ${lang}${DRY ? ' (bez zapisu)' : ' zapisany'}${k.warnings?.length ? `, uwagi: ${k.warnings.length}` : ''}`);
      return { lang, ok: true, notes, warnings: k.warnings ?? [] };
    }
    feedback = k.errors.join('\n');
    log(`✗ ${lang} próba ${attempt}: ${k.errors.length} błędów`);
  }
  return { lang, ok: false, errors: feedback.split('\n') };
}

try {
  const [city] = await q('SELECT status FROM public.cities WHERE slug = $1', [slug]);
  if (!city) throw new Error(`nie ma miasta ${slug}`);
  if (city.status !== 'published') throw new Error(`${slug} ma status ${city.status} — tłumaczymy tylko wycieczki zatwierdzone (published)`);
  const pl = (await q('SELECT public.trip_export($1, $2) AS j', [slug, 'pl']))[0].j;
  if (!pl.stops?.length || !pl.city) throw new Error(`${slug}: brak polskiej treści do tłumaczenia`);

  const enabled = (await q("SELECT code FROM public.languages WHERE enabled AND code <> 'pl' ORDER BY priority")).map(r => r.code);
  const wanted = opt('--langs') ? opt('--langs').split(',') : enabled;
  const order = ['en', ...wanted.filter(l => l !== 'en' && enabled.includes(l))];
  await job({ status: 'running' });
  log(`${slug}: ${order.join(' → ')}`);

  const done = [];
  // EN tłumaczony zawsze, chyba że podano --langs bez en, a wersja EN już jest w bazie
  const enExists = (await q("SELECT 1 FROM public.city_translations WHERE city_slug = $1 AND lang = 'en'", [slug])).length > 0;
  if (!opt('--langs') || wanted.includes('en') || !enExists) {
    const en = await one(pl, 'en', null);
    done.push(en);
    if (!en.ok) throw new Error(`EN odrzucony przez kontrolę — pozostałe języki wstrzymane:\n${en.errors.join('\n')}`);
  } else log('EN: używam wersji z bazy jako źródła');
  const enSrc = DRY ? JSON.parse(JSON.stringify(pl)) : (await q('SELECT public.trip_export($1, $2) AS j', [slug, 'en']))[0].j;
  const plByKey = Object.fromEntries(pl.stops.map(s => [s.stop_key, s]));
  const ref = (part) => part.stops.length
    ? { stops: part.stops.map(s => plByKey[s.stop_key]) }
    : { city: pl.city, day_plan: pl.day_plan, emergency_points: pl.emergency_points };
  for (const lang of order.slice(1)) {
    try { done.push(await one(enSrc, lang, ref)); }
    catch (e) { done.push({ lang, ok: false, errors: [e.message] }); log(`✗ ${lang}: ${e.message}`); }
  }

  const okLangs = done.filter(d => d.ok).map(d => d.lang);
  const bad = done.filter(d => !d.ok);
  if (!DRY && okLangs.length) {
    await q("SELECT public.city_version_save($1, 'published', $2, 'pipeline')", [slug, `tłumaczenia: ${okLangs.join(', ')}`]);
  }
  const summary = { slug, ok: okLangs, failed: bad.map(b => ({ lang: b.lang, errors: b.errors.slice(0, 5) })),
    translator_notes: done.flatMap(d => (d.notes ?? []).map(n => `${d.lang}: ${n}`)) };
  writeFileSync(`${WORK}/summary.json`, JSON.stringify(summary, null, 2));
  await job({ status: bad.length ? 'failed' : 'done', result: JSON.stringify(summary).slice(0, 4000), finished_at: new Date() });
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = bad.length ? 1 : 0;
} catch (e) {
  await job({ status: 'failed', result: e.message.slice(0, 4000), finished_at: new Date() });
  console.error('BŁĄD:', e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
