#!/usr/bin/env node
// Tłumaczenie ZATWIERDZONEJ wycieczki (umiejętność quolino-trip-translate).
//   node trip-translate.mjs <slug> [--langs en,de,it] [--job <id ops.jobs>] [--fresh] [--dry]
// Kolejność: PL → EN, potem EN → pozostałe włączone języki (PL jako odniesienie znaczeniowe).
// Każdy język: darmowy model (OpenRouter, dobrany do zadania) → kontrola mechaniczna
// (check_translation.py) → kontrola jakości Claude → zapis trip_apply_translation() + ocena w bazie.
//   EN: Claude czyta całość obok polskiego i nanosi poprawki (EN jest źródłem dla reszty).
//   Pozostałe: Claude ocenia próbkę (wstęp + 2 przystanki z questem) 1–5; < 4 → tłumaczenie od nowa
//   z uwagami, drugi raz < 4 → język nie trafia na stronę, uwagi idą do JP.
// Gotowe tłumaczenia są w work/translate/<slug>/<lang>.json — ponowne uruchomienie ich nie tłumaczy
// drugi raz (chyba że --fresh), tylko kończy kontrolę. Bez kontroli jakości nic nie trafia na stronę.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { SKILLS, run, claude, translator, currentModel, nextModel, env, extractJson, log, db } from './lib.mjs';

const argv = process.argv.slice(2);
const slug = argv[0];
const opt = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : undefined; };
const DRY = argv.includes('--dry');
const FRESH = argv.includes('--fresh');
const JOB = opt('--job');
const MIN_SCORE = 4;
if (!slug) { console.error('Użycie: trip-translate.mjs <slug> [--langs en,de] [--job id] [--fresh] [--dry]'); process.exit(2); }

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

// ── tłumaczenie w częściach: nagłówek (miasto + plan + punkty awaryjne) i przystanki po 3 ──
function parts(src) {
  const out = [{ ...src, stops: [] }];
  for (let i = 0; i < src.stops.length; i += 3) out.push({ city_slug: src.city_slug, lang: src.lang, stops: src.stops.slice(i, i + 3) });
  return out;
}
const keep = (src, dst, fields) => (dst ?? []).forEach((d, k) => { if (src?.[k]) for (const f of fields) d[f] = src[k][f]; });

async function translate(src, lang, ref, feedback, task) {
  const result = { ...src, lang, stops: [] };
  const notes = [];
  const used = new Set();
  const all = parts(src);
  for (const [i, part] of all.entries()) {
    const prompt = `Przetłumacz tę część wycieczki z języka "${src.lang}" na "${lang}" według umiejętności quolino-trip-translate.
Zwróć wyłącznie JSON w identycznym kształcie (te same klucze, ta sama kolejność), z "lang": "${lang}".
${feedback ? `\nPOPRZEDNIA PRÓBA ODRZUCONA — popraw dokładnie te problemy:\n${feedback}\n` : ''}
${ref ? `Odniesienie znaczeniowe (polski oryginał tej części, tylko do rozstrzygania wątpliwości):\n${JSON.stringify(ref(part))}\n` : ''}
Źródło do tłumaczenia:
${JSON.stringify(part)}`;
    let t;
    for (let a = 1; ; a++) {
      const { text, model } = await translator('quolino-trip-translate', prompt, task);
      try { t = extractJson(text); used.add(model); break; }
      catch (e) {
        log(`  ${lang}: ${model} zwrócił nieczytelny JSON (${e.message.slice(0, 60)})`);
        if (a >= 3) throw new Error(`${lang}: trzy razy nieczytelny JSON`);
        nextModel(task);
      }
    }
    if (Array.isArray(t._translator_notes)) notes.push(...t._translator_notes);
    // pola niezmienne przepisujemy ze źródła po pozycji — model ma tłumaczyć tekst, nie dane
    keep(part.stops, t.stops, ['stop_key', 'stop_number', 'category']);
    keep(part.day_plan, t.day_plan, ['sort_order', 'stop_key']);
    keep(part.emergency_points, t.emergency_points, ['sort_order', 'type', 'maps_query']);
    if (i === 0) { result.city = t.city; result.day_plan = t.day_plan ?? []; result.emergency_points = t.emergency_points ?? []; }
    else result.stops.push(...(t.stops ?? []));
    log(`  ${lang}: część ${i + 1}/${all.length}`);
  }
  return { result, notes, models: [...used] };
}

async function check(src, dst, lang) {
  const a = `${WORK}/${src.lang}.src.json`, b = `${WORK}/${lang}.json`;
  writeFileSync(a, JSON.stringify(src, null, 2));
  writeFileSync(b, JSON.stringify(dst, null, 2));
  const r = await run('python3', [`${SKILLS}/quolino-trip-translate/scripts/check_translation.py`, a, b, '--json']);
  try { return JSON.parse(r.out); } catch { return { ok: false, errors: [`kontrola nie zadziałała: ${r.err.slice(-300)}`] }; }
}

// ── kontrola jakości (Claude) ────────────────────────────────────────────────────────
function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (Array.isArray(o) && !/^\d+$/.test(k)) o = o.find(x => x.stop_key === k);   // stops.<stop_key>
    else o = o?.[/^\d+$/.test(k) ? +k : k];
    if (o == null) return false;
  }
  const last = keys.at(-1);
  const appendable = Array.isArray(o) && +last === o.length;   // brakujący akapit na końcu listy
  if (!appendable && typeof (Array.isArray(o) ? o[+last] : o[last]) !== 'string') return false;
  if (Array.isArray(o)) o[+last] = value; else o[last] = value;
  return true;
}

async function reviewFull(pl, en) {
  const prompt = `KONTROLA JAKOŚCI — tłumaczenie PL → EN (wersja kontrolna, z niej powstaje 15 kolejnych języków).
Porównaj każdy fragment z polskim oryginałem. Sprawdź: wierność sensu, legendy oznaczone jako legenda,
nazwy własne w oryginale, questy dla dzieci wykonalne i naturalne po angielsku, wskazówki pomocne,
brak dopisanych faktów, naturalny angielski. Popraw tylko to, co jest błędne lub nienaturalne.
Odpowiedz wyłącznie JSON-em:
{"score": 1-5 (ocena po Twoich poprawkach), "summary": "1–2 zdania po polsku",
 "fixes": [{"path": "city.lead" | "stops.<stop_key>.<pole>" | "stops.<stop_key>.desc_paragraphs.<n>" | "day_plan.<n>.description", "text": "poprawiony pełny tekst pola", "why": "krótko po polsku"}]}

POLSKI ORYGINAŁ:
${JSON.stringify(pl)}

TŁUMACZENIE EN:
${JSON.stringify(en)}`;
  return extractJson(await claude('quolino-trip-translate', prompt));
}

const MAX_FIXABLE = 6;
async function fixMechanical(src, dst, errors, lang) {
  const prompt = `POPRAWKA PO KONTROLI MECHANICZNEJ — tłumaczenie ${src.lang} → ${lang}.
Skrypt kontrolny zgłosił błędy. Popraw wyłącznie wskazane pola (brakujące liczby, nazwy, puste pola, znaczniki),
nie zmieniaj niczego innego. Brakujący akapit: przetłumacz go ze źródła i podaj ścieżkę z kolejnym numerem
(np. desc_paragraphs.2, gdy są 0 i 1); jeśli brakuje środkowego, podaj wszystkie akapity od miejsca braku.
Odpowiedz wyłącznie JSON-em:
{"fixes": [{"path": "city.<pole>" | "stops.<stop_key>.<pole>" | "stops.<stop_key>.desc_paragraphs.<n>" | "day_plan.<n>.<pole>", "text": "poprawiony pełny tekst pola"}]}

BŁĘDY:
${errors.join('\n')}

ŹRÓDŁO (${src.lang}):
${JSON.stringify(src)}

TŁUMACZENIE (${lang}):
${JSON.stringify(dst)}`;
  return extractJson(await claude('quolino-trip-translate', prompt));
}

function sample(obj, keys) {
  return { city: { title: obj.city?.title, subtitle: obj.city?.subtitle, lead: obj.city?.lead },
    stops: obj.stops.filter(s => keys.includes(s.stop_key)).map(s => ({ stop_key: s.stop_key, name: s.name,
      desc_paragraphs: (s.desc_paragraphs ?? []).slice(0, 2), kids_box: s.kids_box, hint: s.hint })) };
}

async function reviewSample(pl, en, dst, lang) {
  const cand = en.stops.filter(s => !['parking', 'restaurant'].includes(s.category) && s.kids_box);
  const keys = cand.sort(() => Math.random() - 0.5).slice(0, 2).map(s => s.stop_key);
  const prompt = `KONTROLA JAKOŚCI — próbka tłumaczenia EN → ${lang}.
Oceń tłumaczenie względem angielskiego źródła (polski oryginał obok jako odniesienie): wierność sensu,
naturalność języka ${lang} (jak pisze rodzimy przewodnik, nie kalka), quest dla dziecka zrozumiały
i wykonalny, nazwy własne w oryginale, brak dopisków. Odpowiedz wyłącznie JSON-em:
{"score": 1-5, "summary": "1–2 zdania po polsku", "issues": [{"path": "…", "problem": "…", "suggestion": "…"}]}

POLSKI ORYGINAŁ (odniesienie):
${JSON.stringify(sample(pl, keys))}

ŹRÓDŁO EN:
${JSON.stringify(sample(en, keys))}

TŁUMACZENIE ${lang}:
${JSON.stringify(sample(dst, keys))}`;
  return extractJson(await claude('quolino-trip-translate', prompt));
}

async function saveQuality(lang, r, models) {
  if (DRY) return;
  await q(`INSERT INTO public.translation_quality (city_slug, lang, score, summary, issues, models, reviewer, checked_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'claude', now())
           ON CONFLICT (city_slug, lang) DO UPDATE SET score = EXCLUDED.score, summary = EXCLUDED.summary,
             issues = EXCLUDED.issues, models = EXCLUDED.models, checked_at = now()`,
    [slug, lang, r.score ?? null, r.summary ?? null, JSON.stringify(r.fixes ?? r.issues ?? []), models.join(', ')]);
}

// ── jeden język: (cache | tłumaczenie) → kontrola mechaniczna → kontrola jakości → zapis ──
async function one(src, lang, ref, pl) {
  const task = lang === 'en' ? 'translate_en' : 'translate_xx';
  const cacheFile = `${WORK}/${lang}.json`;
  let feedback = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    let result, notes = [], models = [];
    if (attempt === 1 && !FRESH && existsSync(cacheFile)) {
      result = JSON.parse(readFileSync(cacheFile, 'utf8'));
      models = ['(gotowe tłumaczenie z poprzedniego uruchomienia)'];
      log(`  ${lang}: używam gotowego tłumaczenia`);
    } else {
      log(`  ${lang}: tłumaczy ${await currentModel(task)}`);
      ({ result, notes, models } = await translate(src, lang, ref, feedback, task));
    }
    let k = await check(src, result, lang);
    // Kilka drobnych błędów → poprawia Claude (tanio), zamiast tłumaczyć całość od nowa (limit darmowych modeli)
    if (!k.ok && k.errors.length <= MAX_FIXABLE) {
      try {
        const fx = await fixMechanical(src, result, k.errors, lang);
        const applied = (fx.fixes ?? []).filter(f => setPath(result, f.path, f.text)).length;
        log(`  ${lang}: Claude poprawił ${applied}/${(fx.fixes ?? []).length} błędów kontroli mechanicznej`);
        k = await check(src, result, lang);
      } catch (e) { log(`  ${lang}: poprawka Claude niedostępna (${e.message.slice(0, 100)})`); }
    }
    if (!k.ok) {
      feedback = k.errors.join('\n');
      log(`✗ ${lang} kontrola mechaniczna, próba ${attempt}: ${k.errors.length} błędów`);
      nextModel(task);
      continue;
    }
    let review;
    try {
      review = lang === 'en' ? await reviewFull(pl, result) : await reviewSample(pl, src, result, lang);
    } catch (e) {
      return { lang, ok: false, errors: [`kontrola jakości niedostępna (${e.message.slice(0, 120)}) — tłumaczenie czeka w ${cacheFile}, uruchom ponownie później`] };
    }
    if (lang === 'en' && Array.isArray(review.fixes) && review.fixes.length) {
      const applied = review.fixes.filter(f => setPath(result, f.path, f.text)).length;
      log(`  en: Claude naniósł ${applied}/${review.fixes.length} poprawek`);
      const k2 = await check(src, result, lang);
      if (!k2.ok) { feedback = k2.errors.join('\n'); log('✗ en: poprawki zepsuły strukturę — tłumaczę od nowa'); continue; }
    }
    log(`  ${lang}: ocena jakości ${review.score}/5 — ${review.summary ?? ''}`);
    await saveQuality(lang, review, models);
    if ((review.score ?? 0) < MIN_SCORE && lang !== 'en') {
      feedback = (review.issues ?? []).map(i => `${i.path}: ${i.problem} → ${i.suggestion}`).join('\n') || review.summary;
      log(`✗ ${lang}: ocena ${review.score} < ${MIN_SCORE}, próba ${attempt}`);
      nextModel(task);
      continue;
    }
    if (!DRY) await q('SELECT public.trip_apply_translation($1, $2, $3::jsonb) AS r', [slug, lang, JSON.stringify(result)]);
    writeFileSync(cacheFile, JSON.stringify(result, null, 2));
    log(`✓ ${lang}${DRY ? ' (bez zapisu)' : ' na stronie'} · ocena ${review.score}/5 · ${models.join(', ')}`);
    return { lang, ok: true, score: review.score, notes, models };
  }
  return { lang, ok: false, errors: feedback.split('\n').slice(0, 10) };
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
  log(`${slug}: ${order.join(' → ')} · modele: EN ${await currentModel('translate_en')}, pozostałe ${await currentModel('translate_xx')}`);

  const done = [];
  const enExists = (await q("SELECT 1 FROM public.city_translations WHERE city_slug = $1 AND lang = 'en'", [slug])).length > 0;
  if (!opt('--langs') || wanted.includes('en') || !enExists) {
    const en = await one(pl, 'en', null, pl);
    done.push(en);
    if (!en.ok) throw new Error(`EN nie przeszedł kontroli — pozostałe języki wstrzymane:\n${en.errors.join('\n')}`);
  } else log('EN: używam wersji z bazy jako źródła');
  const enSrc = (await q('SELECT public.trip_export($1, $2) AS j', [slug, 'en']))[0].j;
  const plByKey = Object.fromEntries(pl.stops.map(s => [s.stop_key, s]));
  const ref = (part) => part.stops.length
    ? { stops: part.stops.map(s => plByKey[s.stop_key]) }
    : { city: pl.city, day_plan: pl.day_plan, emergency_points: pl.emergency_points };
  for (const lang of order.slice(1)) {
    try { done.push(await one(enSrc, lang, ref, pl)); }
    catch (e) { done.push({ lang, ok: false, errors: [e.message] }); log(`✗ ${lang}: ${e.message}`); }
  }

  const okLangs = done.filter(d => d.ok).map(d => d.lang);
  const bad = done.filter(d => !d.ok);
  if (!DRY && okLangs.length) {
    await q("SELECT public.city_version_save($1, 'published', $2, 'pipeline')", [slug, `tłumaczenia: ${okLangs.join(', ')}`]);
  }
  const summary = { slug, ok: done.filter(d => d.ok).map(d => `${d.lang} ${d.score}/5`),
    failed: bad.map(b => ({ lang: b.lang, errors: b.errors.slice(0, 5) })),
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
