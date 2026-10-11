#!/usr/bin/env node
// Fakty przystanków w języku czytelnika (2026-10-11): rok/epoka, bilet, czas zwiedzania, godziny.
// Uzupełnia stop_translations.{year_built,price,visit_duration,opening_hours} we wszystkich gotowych
// tłumaczeniach opublikowanych wycieczek. Nowe tłumaczenia robi już trip-translate.mjs — ten skrypt
// nadrabia to, co przetłumaczono wcześniej.
//   node trip-facts.mjs [--city spello] [--langs ro,de] [--all] [--dry]
// Każdy język: unikalne teksty (te same „bezpłatnie” w wielu miastach = jedno tłumaczenie) → darmowy model
// → kontrola mechaniczna (liczby, puste, emoji) → kontrola Claude (poprawki) → zapis. Bez kontroli Claude
// język nie jest zapisywany (strona pokazuje wtedy polski, jak dotąd).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { claude, translator, nextModel, extractJson, log, db, spent } from './lib.mjs';

const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : undefined; };
const DRY = argv.includes('--dry'), ALL = argv.includes('--all');
const F = ['year_built', 'price', 'visit_duration', 'opening_hours'];
const BATCH = 50;

const c = await db();
const q = async (sql, p) => (await c.query(sql, p)).rows;

const NUM = /\d+(?:[.,:]\d+)*/g;
const nums = (s) => (String(s ?? '').replace(/(?<=\d)[\s  .,'](?=\d{3}(?!\d))/g, '').match(NUM) ?? []).map(n => n.replace(/[.,]/g, ''));
function mechanical(src, dst) {
  if (typeof dst !== 'string' || !dst.trim()) return 'puste';
  const have = nums(dst);
  for (const n of nums(src)) { const i = have.indexOf(n); if (i < 0) return `brak liczby ${n}`; have.splice(i, 1); }
  if (/[\u{1F000}-\u{1FAFF}]/u.test(dst)) return 'emoji';
  if (dst.length > Math.max(80, src.length * 3)) return 'za długie';
  return null;
}

async function translateList(list, lang, ref) {
  const task = lang === 'en' ? 'translate_en' : 'translate_xx';
  const out = {};
  let todo = list;
  for (let attempt = 1; attempt <= 2 && todo.length; attempt++) {
    for (let i = 0; i < todo.length; i += BATCH) {
      const part = todo.slice(i, i + BATCH);
      const prompt = `Przetłumacz krótkie etykiety z przewodnika rodzinnego po włoskich miastach z polskiego na "${lang}".
To fakty przy zabytku: rok/epoka budowy, cena biletu, czas zwiedzania, godziny otwarcia.
Zasady: krótko, w formie etykiety; liczby, waluty, godziny, zakresy i nazwy własne bez zmian; wieki zapisz tak,
jak przyjęto w języku "${lang}" (np. „XIII w.” → „13th century” po angielsku); „do weryfikacji / do sprawdzenia”
= „do zweryfikowania na miejscu”; nic nie dopisuj.
Odpowiedz wyłącznie JSON-em: {"<polski tekst dokładnie jak w źródle>": "tłumaczenie", …} — wszystkie pozycje.
${ref ? `Odniesienie (tłumaczenie angielskie tych samych tekstów): ${JSON.stringify(Object.fromEntries(part.map(s => [s, ref[s] ?? null])))}\n` : ''}
TEKSTY:
${JSON.stringify(part)}`;
      try {
        const { text } = await translator('quolino-trip-translate', prompt, task);
        const m = extractJson(text);
        for (const s of part) if (!mechanical(s, m[s])) out[s] = m[s].trim();
      } catch (e) { log(`  ${lang}: część ${i / BATCH + 1} — ${e.message.slice(0, 100)}`); }
    }
    todo = todo.filter(s => !(s in out));
    if (todo.length && attempt === 1) { log(`  ${lang}: ${todo.length} do poprawy — drugi model`); nextModel(task); }
  }
  return { out, failed: todo };
}

async function review(pairs, lang) {
  const prompt = `KONTROLA JAKOŚCI — krótkie fakty przy zabytkach (rok/epoka, bilet, czas zwiedzania, godziny), PL → ${lang}.
Sprawdź każdą parę: wierność, naturalny zapis w języku ${lang}, liczby i waluty bez zmian, wieki zapisane poprawnie.
Popraw tylko błędne. Odpowiedz wyłącznie JSON-em:
{"score": 1-5, "summary": "1 zdanie po polsku", "fixes": {"<polski tekst>": "poprawione tłumaczenie"}}

PARY: ${JSON.stringify(pairs)}`;
  return extractJson(await claude('quolino-trip-translate', prompt));
}

try {
  const langs = (opt('--langs')?.split(',')) ?? (await q("SELECT code FROM public.languages WHERE enabled AND code <> 'pl' ORDER BY code = 'en' DESC, priority")).map(r => r.code);
  const cities = opt('--city') ? [opt('--city')] : (await q("SELECT slug FROM public.cities WHERE status = 'published' ORDER BY slug")).map(r => r.slug);
  log(`fakty przystanków: ${cities.join(', ')} · języki: ${langs.join(', ')}`);
  const report = { ok: [], failed: [] };
  let en = {};
  for (const lang of langs) {
    const rows = await q(`SELECT t.stop_id, s.city_slug, s.stop_key, ${F.map(f => `s.${f} AS pl_${f}, t.${f} AS tr_${f}`).join(', ')}
        FROM public.stop_translations t JOIN public.stops s ON s.id = t.stop_id
       WHERE t.lang = $1 AND s.city_slug = ANY($2)`, [lang, cities]);
    const need = new Set();
    for (const r of rows) for (const f of F) if (r[`pl_${f}`] && (ALL || !r[`tr_${f}`])) need.add(r[`pl_${f}`]);
    if (!need.size) { log(`  ${lang}: nic do zrobienia`); continue; }
    log(`  ${lang}: ${need.size} unikalnych tekstów z ${rows.length} przystanków`);
    const { out, failed } = await translateList([...need], lang, lang === 'en' ? null : en);
    let rv;
    try { rv = await review(Object.entries(out).map(([pl, tr]) => ({ pl, tr })), lang); }
    catch (e) { report.failed.push({ lang, why: `kontrola Claude niedostępna: ${e.message.slice(0, 80)}` }); log(`✗ ${lang}: bez kontroli — pomijam`); continue; }
    for (const [pl, tr] of Object.entries(rv.fixes ?? {})) if (pl in out && !mechanical(pl, tr)) out[pl] = tr.trim();
    log(`  ${lang}: ocena ${rv.score}/5 · poprawek ${Object.keys(rv.fixes ?? {}).length} · ${rv.summary ?? ''}`);
    if ((rv.score ?? 0) < 4) { report.failed.push({ lang, why: `ocena ${rv.score}: ${rv.summary}` }); continue; }
    if (lang === 'en') en = out;
    let n = 0;
    for (const r of rows) {
      const set = F.filter(f => r[`pl_${f}`] && (ALL || !r[`tr_${f}`]) && out[r[`pl_${f}`]]);
      if (!set.length) continue;
      if (!DRY) await q(`UPDATE public.stop_translations SET ${set.map((f, i) => `${f} = $${i + 3}`).join(', ')}, updated_at = now()
                          WHERE stop_id = $1 AND lang = $2`, [r.stop_id, lang, ...set.map(f => out[r[`pl_${f}`]])]);
      n++;
      // pliki robocze trip-translate: tłumaczenie i jego źródło znają już fakty → następne uruchomienie nie tłumaczy ich drugi raz
      const dir = `/opt/data/quolino/work/translate/${r.city_slug}`;
      for (const [file, val] of [[`${dir}/${lang}.json`, (f) => out[r[`pl_${f}`]]],
                                 [`${dir}/${lang}.base.json`, (f) => lang === 'en' ? r[`pl_${f}`] : en[r[`pl_${f}`]]]]) {
        if (DRY || !existsSync(file)) continue;
        try {
          const j = JSON.parse(readFileSync(file, 'utf8'));
          const st = (j.stops ?? []).find(x => x.stop_key === r.stop_key);
          if (st) { for (const f of set) if (val(f)) st[f] = val(f); writeFileSync(file, file.endsWith('.base.json') ? JSON.stringify(j) : JSON.stringify(j, null, 2)); }
        } catch {}
      }
    }
    report.ok.push(`${lang} ${n} przystanków (${rv.score}/5${failed.length ? `, bez tłumaczenia ${failed.length}` : ''})`);
    log(`✓ ${lang}: ${n} przystanków${DRY ? ' (bez zapisu)' : ''}`);
  }
  if (!DRY && report.ok.length) for (const slug of cities)
    await q("SELECT public.city_version_save($1, 'published', 'tłumaczenia: fakty przystanków (rok, bilet, czas, godziny)', 'pipeline')", [slug]);
  log(`koszt modeli płatnych: $${spent.usd.toFixed(4)} (${spent.calls} zapytań)`);
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  console.error('BŁĄD:', e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
