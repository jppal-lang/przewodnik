#!/usr/bin/env node
// Treść przystanków według standardu docs/TRESC-PRZYSTANKU.md (JP 2026-10-18) — Hermes, bez ręcznego pisania.
//   node stop-content.mjs <city_slug> [--stops 21,22] [--notify <kanał>] [--publish] [--dry] [--fresh] [--writer claude|gpt]
// Dla każdego przystanku miasta (public.stops + stop_translations pl, kolejność sort_order):
// a) RESEARCH  — Claude z siecią odpowiada na pytania §2 (legenda, ciekawostka, fun fact, popkultura) + historia/ludzie/co oglądać;
//               każda odpowiedź = fakt + URL albo „brak — sprawdzono: gdzie”. Plik: WORK/<slug>/stop-<id>-research.md
//               (istniejący plik jest używany ponownie; --fresh = nowy research).
// b) PISANIE   — GPT (OpenRouter, zadanie „draft”; bez klucza albo --writer claude: Claude) pisze rekord ops.stop_research:
//               {marked, state, sources} z przypisami [n]; wzorzec: references/stop-content-examples (22 i 20).
// c) WALIDATOR — mechaniczny (stop-content-lib.mjs → validateStop); błędy wracają do pisania (najwyżej 3 próby).
// d) KONTROLA  — Claude z siecią (§5): otwiera źródła, powtórzenia, sens i chronologia, legenda nie jako fakt;
//               przy „fix” najwyżej 2 rundy przepisania z błędami, potem ponowny walidator i kontrola.
// e) ZAPIS     — upsert do ops.stop_research (stop_blocks / stop_translations nietknięte). --publish: ops.stop_publish_pl
//               dla każdego przystanku i cities.content_v2 = true — tylko gdy wszystkie przystanki mają werdykt ok.
//               --dry: wszystko oprócz zapisu w bazie (rekordy na stdout).
// f) POWIADOMIENIE — podsumowanie miasta na Discordzie (--notify).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { claude, claudeJson, openrouterJson, JSON_QUOTE_RULE, env, log, db, spent, SKILLS } from './lib.mjs';
import { WORK, DEPTH_TEXT, loadResearch, notify } from './draft-lib.mjs';
import { loadRules, rulesText } from './quality-lib.mjs';
import { validateStop, normalizeRecord, blocksLine, PRACTICAL_CATS, BLOCK_PL } from './stop-content-lib.mjs';
export { validateStop } from './stop-content-lib.mjs';

const argv = process.argv.slice(2);
const slug = argv[0];
const opt = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : undefined; };
const flag = (n) => argv.includes(n);
const channel = opt('--notify'), DRY = flag('--dry'), PUBLISH = flag('--publish'), FRESH = flag('--fresh');
const only = opt('--stops') ? opt('--stops').split(',').map(x => +x.trim()).filter(Number.isInteger) : null;
const writer = opt('--writer') ?? (env('OPENROUTER_API_KEY') ? 'gpt' : 'claude');
if (!slug || !/^[a-z0-9-]+$/.test(slug) || (opt('--stops') && !only?.length) || !['gpt', 'claude'].includes(writer)) {
  console.error('Użycie: stop-content.mjs <city_slug> [--stops 21,22] [--notify kanał] [--publish] [--dry] [--fresh] [--writer claude|gpt]');
  process.exit(2);
}
if (DRY && PUBLISH) log('--dry wyłącza --publish: nic nie zapisuję w bazie');
const TODAY = new Date().toISOString().slice(0, 10);
const dir = join(WORK, slug); mkdirSync(dir, { recursive: true });
const EXAMPLES = `${SKILLS}/quolino-trip-writing/references/stop-content-examples`;
const SIGHT_QS = new Set(['monument', 'church', 'museum', 'castle', 'house', 'synagogue']);

// ── wspólny tekst standardu (pisanie, poprawki, kontrola) ───────────────────────────────────────
const STANDARD = `STANDARD TREŚCI PRZYSTANKU (docs/TRESC-PRZYSTANKU.md, JP 2026-10-18):
- Opis (desc_paragraphs, publiczny): hak, historia i ludzie, „Kim był/była…”, co oglądać z dokładnym miejscem. Legenda, ciekawostka
  i popkultura NIE wchodzą do opisu — mają własne bloki; w opisie najwyżej jedno zdanie-zapowiedź, a blok jest rozwinięciem (nie powtarza zdania).
- Legenda (legend: {text, trace?, history?}): text = opowieść z bohaterami, przebiegiem i zakończeniem, wyraźnie jako legenda („Legenda mówi…”,
  „Według tradycji…”); trace = ślad na miejscu (rzeźba, tablica, nazwa) i gdzie dokładnie; history = co mówi historia (fakt oddzielony od legendy).
- Ciekawostka (curiosity: {text}) dla RODZICA, 2–4 zdania, zgłębiona: co, dlaczego, w jakim kontekście, gdzie to widać dziś. Dwa niezależne
  źródła (różne domeny) albo blok none.
- Fun fact (fun_fact: {text}) dla DZIECKA: JEDNO zdanie zaczynające się od „Czy wiesz, że…”, zrozumiałe dla 9-latka; z liczbą — dwa niezależne
  źródła. Powstaje z researchu, nie z pamięci.
- W popkulturze (pop_culture: {items: [{title, year, text}]}): film/serial (która scena), książka, piosenka, gra, obraz, znana osoba — tylko ze źródłem.
- Każdy blok ma stan: {"state":"found"} (treść + przypisy) albo {"state":"none","checked":"gdzie szukano"} i wtedy treść = null.
- Przystanek praktyczny (parking, restaurant, icecream, sweets): legenda zawsze none, checked „przystanek praktyczny (…) — legenda nie dotyczy”;
  ciekawostka dozwolona, gdy jest naprawdę ciekawa i ma dwa źródła.
- Przypisy [n]: każdy fakt (data, liczba, nazwisko, zdarzenie, przypisanie dzieła) kończy się [n]; numeracja wspólna dla całego przystanku;
  sources = [{n, url, title, lang, accessed}] — źródło ZAWIERA ten fakt (nie „strona o mieście”). Każde [n] ma źródło, każde źródło jest użyte.
  Kolejność źródeł: oficjalne (zabytek, gmina, diecezja, muzeum) → Wikipedia w języku kraju → inne rzetelne. Przypisy są tylko dla redakcji.
- Superlatyw („najstarszy”, „jedyny”, „największy”) — dwa niezależne źródła albo konkretny fakt bez superlatywu.
- Bez powtórzeń między blokami: fakt stoi w jednym bloku.
- Twarde zasady: NIGDY czasów dojazdu, kilometrów, minut jazdy, godzin wyjazdu z bazy (czas zwiedzania na miejscu wolno); nie wymyślać faktów
  (brak źródła → „sprawdź na miejscu” albo usuń zdanie); bez porównań do innych krajów i nacji, bez odwołań do narodowości czytelnika;
  bez emoji; nazwy własne w oryginale.`;

const RECORD_FORMAT = `FORMAT ODPOWIEDZI — WYŁĄCZNIE JSON w dokładnie tym kształcie (rekord ops.stop_research):
{"marked": {"desc_paragraphs": ["… [1][2]", …],
            "legend": null | {"text": "… [n]", "trace": "… [n]" (opcjonalnie), "history": "… [n]" (opcjonalnie)},
            "curiosity": null | {"text": "… [n][m]"},
            "fun_fact": null | {"text": "Czy wiesz, że … [n][m]?"},
            "pop_culture": null | {"items": [{"title": "…", "year": "RRRR", "text": "… [n]"}]}},
 "state": {"legend": {"state": "found"} | {"state": "none", "checked": "gdzie szukano"}, "curiosity": …, "fun_fact": …, "pop_culture": …},
 "sources": [{"n": 1, "url": "https://…", "title": "…", "lang": "it", "accessed": "${TODAY}"}],
 "gap": null | "czego zabrakło w researchu"}
${JSON_QUOTE_RULE}`;

function example(file) {
  try { const j = JSON.parse(readFileSync(join(EXAMPLES, file), 'utf8')); return JSON.stringify({ marked: j.marked, state: j.state, sources: j.sources }); }
  catch { log(`brak wzorca ${file} w ${EXAMPLES} — piszę bez wzorca`); return null; }
}
const EX_SIGHT = example('22-san-vittore.json'), EX_PRACTICAL = example('20-parking.json');
const examplesText = () => [EX_SIGHT && `WZORZEC (zabytek, zaakceptowany przez JP — format i jakość, NIE treść do kopiowania):\n${EX_SIGHT}`,
  EX_PRACTICAL && `WZORZEC (parking — przystanek praktyczny):\n${EX_PRACTICAL}`].filter(Boolean).join('\n\n');

const c = await db();
const q = async (sql, p) => (await c.query(sql, p)).rows;

// ── a) research ─────────────────────────────────────────────────────────────────────────────────
function researchQuestions(cat) {
  if (PRACTICAL_CATS.has(cat)) return `To PRZYSTANEK PRAKTYCZNY (${cat}). Legendy nie szukaj — zapisz: „Legenda: brak — przystanek praktyczny (${cat})”.
Zbierz: fakty praktyczne ze źródłem (lokalizacja, zasady, koszt, godziny — z datą i źródłem albo „sprawdź na miejscu”).
Ciekawostka (dla rodzica) — tylko jeśli naprawdę jest: historia miejsca/lokalu, nietypowy detal; dwa niezależne źródła albo „brak — sprawdzono: …”.
Fun fact i popkultura — pytania jak niżej, ale krótko; brak = „brak — sprawdzono: …”.`;
  const short = !SIGHT_QS.has(cat);
  return `${short ? 'To ulica / punkt widokowy / park / miejsce na zdjęcie: odpowiedz na pytania 1–2 z każdej grupy.\n' : ''}PYTANIA §2 — odpowiedz na KAŻDE: fakt + przypis do źródła (URL) albo „brak — sprawdzono: <gdzie szukano>”.
LEGENDA
1. Czy z miejscem wiąże się legenda, cud, podanie ludowe? Kto, co się stało, jak się skończyło? (pełna opowieść)
2. Czy na miejscu jest jej ślad (rzeźba, tablica, odcisk, nazwa ulicy)? Gdzie dokładnie?
3. Co o tym samym mówi historia (fakt oddzielony od legendy)?
CIEKAWOSTKA (dla rodzica)
1. Co zaskoczy dorosłego: dawna funkcja, zmiana przeznaczenia, nietypowe wydarzenie?
2. Jaki detal turyści zwykle mijają, nie zauważając?
3. Co tu zniknęło, zostało przeniesione, odnalezione albo odkryte przypadkiem?
   Ciekawostka zgłębiona: co, dlaczego, w jakim kontekście, gdzie to widać dziś — i DWA niezależne źródła (różne domeny).
FUN FACT (dla dziecka)
1. Jaka liczba robi wrażenie (schody, wysokość, wiek, waga dzwonu)? — liczba z dwóch niezależnych źródeł
2. Co jest zabawne albo dziwne (zwierzę, przezwisko, zwyczaj)?
W POPKULTURZE
1. Film lub serial kręcony tutaj — tytuł, rok, która scena?
2. Książka, piosenka, gra, obraz, w których miejsce występuje?
3. Znana osoba związana z miejscem — urodziła się, mieszkała, występowała?`;
}

async function research(stop, city) {
  const f = join(dir, `stop-${stop.id}-research.md`);
  if (existsSync(f) && !FRESH) { log(`  ${stop.id}: research z pliku ${f}`); return readFileSync(f, 'utf8'); }
  log(`  ${stop.id}: research (Claude + sieć)`);
  const prior = (loadResearch(slug) ?? '').slice(0, 40_000);
  const text = await claude('quolino-trip-writing', `RESEARCH PRZYSTANKU według docs/TRESC-PRZYSTANKU.md §2 (bez pisania tekstu dla rodziny).
Miasto/trasa: ${city.title} (${city.region_slug}, ${city.country}). Przystanek: ${stop.name} (kategoria ${stop.category}${stop.year_built ? `, ${stop.year_built}` : ''}).
${stop.maps_query ? `Lokalizacja: ${stop.maps_query}\n` : ''}${stop.wiki_article ? `Artykuł Wikipedii: ${stop.wiki_article}\n` : ''}${stop.website ? `Strona: ${stop.website}\n` : ''}
Szukaj w tej kolejności: strona oficjalna (zabytek, gmina, diecezja, muzeum, operator) → Wikipedia w języku kraju (${city.country === 'it' ? 'włoska' : 'lokalna'}), potem angielska → inne rzetelne
(prasa, instytucje naukowe, przewodniki). Każde źródło OTWÓRZ i podaj fakt tylko wtedy, gdy na tej stronie naprawdę jest. Nic nie zmyślaj.

${researchQuestions(stop.category)}

OPIS (materiał do desc_paragraphs): historia i ludzie (kto, kiedy, po co, fazy budowy), „kim był/była…” — bohater miejsca od podstaw,
terminy architektoniczne do wyjaśnienia, co oglądać z dokładnym miejscem („przy lewych drzwiach”, „na środku sali”). Każdy fakt z przypisem.
Sprzeczności między źródłami zapisz osobno (co mówi które źródło). Bez czasów dojazdu i kilometrów.

WYNIK: Markdown w tej kolejności:
## Źródła
1. <URL> — <tytuł> — <język> (numeracja [n] wspólna dla całego researchu)
## Opis
## Legenda
## Ciekawostka
## Fun fact
## W popkulturze
## Sprzeczności i luki
${stop.desc?.length ? `\nDOTYCHCZASOWY OPIS (materiał do sprawdzenia — fakty bez źródła potwierdź albo oznacz jako niepotwierdzone):\n${stop.desc.join('\n\n')}\n` : ''}${Array.isArray(stop.sources) && stop.sources.length ? `\nDOTYCHCZASOWE ŹRÓDŁA PRZYSTANKU: ${stop.sources.map(x => typeof x === 'string' ? x : x?.url ?? JSON.stringify(x)).join(' · ')}\n` : ''}${prior ? `\nWCZEŚNIEJSZY RESEARCH MIASTA (z trip-draft; użyj tego, co dotyczy przystanku, i sprawdź źródła):\n${prior}\n` : ''}`, { web: true });
  writeFileSync(f, text);
  return text;
}

// ── b) pisanie ─────────────────────────────────────────────────────────────────────────────────
async function write(stop, city, researchMd, { current = null, errors = [] } = {}) {
  const prompt = `PISANIE TREŚCI PRZYSTANKU — rekord redakcyjny z przypisami (ops.stop_research). Po polsku.
Trasa: ${city.title}. Przystanek: ${stop.name} (stop_id ${stop.id}, kategoria ${stop.category}${stop.year_built ? `, ${stop.year_built}` : ''}).
${errors.length ? `POPRAW KAŻDY BŁĄD (walidator i kontrola Claude) — reszta zostaje bez zmian:\n${errors.map(e => `- [${e.block ?? '?'}] ${e.problem}${e.fix ? ' → ' + e.fix : ''}`).join('\n')}\n` : ''}
${STANDARD}

${DEPTH_TEXT}
Progi liczą się bez przypisów [n]. Końcowy krótki akapit „Praktycznie: …” (ubiór, wózki) jest dozwolony.

${rulesText()}
Używaj WYŁĄCZNIE faktów z researchu poniżej i tylko ze źródłami, które research podaje (numery [n] możesz nadać od nowa, byle spójnie).
Fakt bez źródła — usuń albo napisz „sprawdź na miejscu”. Blok, dla którego research mówi „brak — sprawdzono: …”, ma stan none i to „checked”.

${examplesText()}

${RECORD_FORMAT}

${current ? `AKTUALNA WERSJA (do poprawy):\n${JSON.stringify(current)}\n\n` : ''}RESEARCH:\n${researchMd.slice(0, 80_000)}`;
  if (writer === 'gpt') {
    const { model, json } = await openrouterJson('quolino-trip-writing', prompt, 'draft');
    return { raw: json, model };
  }
  return { raw: await claudeJson('quolino-trip-writing', prompt, { rawFile: join(dir, `stop-${stop.id}-write-raw.txt`) }), model: 'claude' };
}

// pisanie + walidator lokalny (najwyżej 3 próby)
async function writeValid(stop, city, researchMd, { current = null, errors = [] } = {}) {
  let feedback = errors, last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { raw, model } = await write(stop, city, researchMd, { current: last?.rec ?? current, errors: feedback });
    const rec = normalizeRecord(raw, { category: stop.category, today: TODAY });
    const v = validateStop(rec, { category: stop.category });
    last = { rec, v, model, gap: raw?.gap ?? null };
    if (!v.errors.length) return last;
    log(`  ${stop.id}: walidator — ${v.errors.length} błędów (próba ${attempt + 1}/3): ${v.errors.slice(0, 3).map(e => e.problem).join(' | ')}`);
    feedback = [...v.errors, ...errors];
  }
  return last;
}

// ── d) kontrola Claude (§5) ─────────────────────────────────────────────────────────────────────
async function check(stop, city, rec) {
  const r = await claudeJson('quolino-trip-writing', `KONTROLA TREŚCI PRZYSTANKU (docs/TRESC-PRZYSTANKU.md §5). Tryb B — sprawdzanie, nic nie piszesz od nowa.
Trasa: ${city.title}. Przystanek: ${stop.name} (kategoria ${stop.category}).
${STANDARD}

Sprawdź:
1. PRZYPISY — OTWÓRZ każde źródło z sources (WebFetch) i sprawdź, czy fakty oznaczone jego numerem naprawdę tam są. Brak faktu = błąd
   z poprawką (inne źródło albo usunięcie zdania). Martwy link (404, brak strony) = błąd. Gdy strona nie daje się otworzyć z powodu blokady
   (403, paywall), a fakt ma drugie źródło, które go potwierdza — uwaga, nie błąd.
2. POWTÓRZENIA — opis vs legenda vs ciekawostka vs popkultura vs fun fact: ten sam fakt w dwóch blokach = błąd (zostaje w jednym; w opisie
   najwyżej jedno zdanie-zapowiedź; fun fact może rozwijać ciekawostkę dla dziecka, byle nie tym samym zdaniem).
3. SENS — chronologia (daty, wiek postaci, kolejność), brak sprzeczności między blokami, legenda NIE podana jako fakt, ciekawostka naprawdę
   zaskakuje dorosłego i ma kontekst (co, dlaczego, gdzie widać dziś), fun fact zrozumiały dla 9-latka.
4. ZGŁĘBIENIE — ciekawostka zgłębiona, superlatywy z dwoma niezależnymi źródłami.
5. Zakazy: czasy dojazdu/kilometry, porównania do innych krajów i nacji, fakty bez źródła, literówki.
Quest i zadanie foto (kids_box, photo_task) tylko jako kontekst: uwagi o nich dawaj w warnings z block "quest" (ten skrypt ich nie pisze).
Zestaw stanów: blok none z „checked” jest poprawny, jeśli research naprawdę nic nie znalazł — nie żądaj wymyślania treści.

Odpowiedz WYŁĄCZNIE JSON-em:
{"verdict": "ok" | "fix", "summary": "1–2 zdania po polsku",
 "errors": [{"block": "desc|legend|curiosity|fun_fact|pop_culture|sources", "problem": "…", "fix": "co dokładnie zmienić"}],
 "warnings": [{"block": "…", "problem": "…"}],
 "sources_checked": [{"n": 1, "ok": true, "note": "co potwierdza / czego brak"}]}
"ok" tylko przy zerowej liczbie błędów. ${JSON_QUOTE_RULE}

QUEST (kontekst): ${stop.kids_box ?? 'brak'}
ZADANIE FOTO (kontekst): ${stop.photo_task ?? 'brak'}

REKORD:
${JSON.stringify(rec)}`, { web: true, rawFile: join(dir, `stop-${stop.id}-check-raw.txt`) });
  return { verdict: r?.verdict === 'ok' && !(r.errors ?? []).length ? 'ok' : 'fix', summary: r?.summary ?? '',
    errors: Array.isArray(r?.errors) ? r.errors : [], warnings: Array.isArray(r?.warnings) ? r.warnings : [],
    sources_checked: Array.isArray(r?.sources_checked) ? r.sources_checked : [] };
}

// ── jeden przystanek: research → pisanie → walidator → kontrola → (≤ 2 rundy poprawek) ─────────────
async function processStop(stop, city) {
  log(`${slug}: przystanek ${stop.id} ${stop.name} (${stop.category})`);
  const researchMd = await research(stop, city);
  let w = await writeValid(stop, city, researchMd);
  const models = new Set([w.model]);
  let ck = await check(stop, city, w.rec);
  log(`  ${stop.id}: kontrola Claude 1: ${ck.verdict}${ck.errors.length ? ` (${ck.errors.length} błędów)` : ''}; walidator: ${w.v.errors.length} błędów`);
  for (let round = 1; round <= 2 && (ck.verdict !== 'ok' || w.v.errors.length); round++) {
    w = await writeValid(stop, city, researchMd, { current: w.rec, errors: [...w.v.errors, ...ck.errors] });
    models.add(w.model);
    ck = await check(stop, city, w.rec);
    log(`  ${stop.id}: kontrola Claude ${round + 1}: ${ck.verdict}${ck.errors.length ? ` (${ck.errors.length} błędów)` : ''}; walidator: ${w.v.errors.length} błędów`);
  }
  const v = validateStop(w.rec, { category: stop.category });   // ponowny walidator na wersji końcowej
  const verdict = ck.verdict === 'ok' && !v.errors.length ? 'ok' : 'fix';
  const check_result = {
    verdict, by: 'stop-content.mjs', date: TODAY, writer, models: [...models], summary: ck.summary,
    claude: { verdict: ck.verdict, errors: ck.errors, warnings: ck.warnings, sources_checked: ck.sources_checked },
    validator: { errors: v.errors, warnings: v.warnings },
    errors: [...v.errors.map(e => ({ ...e, by: 'walidator' })), ...ck.errors.map(e => ({ ...e, by: 'Claude' }))],
    gap: w.gap,
  };
  return { stop, rec: w.rec, check_result };
}

async function save(r) {
  await q(`INSERT INTO ops.stop_research (stop_id, marked, state, sources, check_result, checked_at, updated_at)
           VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, now(), now())
           ON CONFLICT (stop_id) DO UPDATE SET marked = EXCLUDED.marked, state = EXCLUDED.state, sources = EXCLUDED.sources,
             check_result = EXCLUDED.check_result, checked_at = now(), updated_at = now()`,
    [r.stop.id, JSON.stringify(r.rec.marked), JSON.stringify(r.rec.state), JSON.stringify(r.rec.sources), JSON.stringify(r.check_result)]);
}

// --publish: wszystkie przetworzone przystanki ok → ops.stop_publish_pl; content_v2 dopiero, gdy CAŁE miasto ma werdykt ok w bazie
async function publish(results) {
  const bad = results.filter(r => r.check_result.verdict !== 'ok');
  if (bad.length) return `publikacja wstrzymana: werdykt „fix” przy ${bad.map(r => r.stop.id).join(', ')}`;
  await q('BEGIN');
  try {
    for (const r of results) await q('SELECT ops.stop_publish_pl($1)', [r.stop.id]);
    const [all = { n: 0, ok: 0 }] = await q(`SELECT count(*)::int AS n, count(*) FILTER (WHERE sr.check_result ->> 'verdict' = 'ok')::int AS ok
                             FROM public.stops s LEFT JOIN ops.stop_research sr ON sr.stop_id = s.id WHERE s.city_slug = $1`, [slug]);
    let v2 = false;
    if (all.n && all.ok === all.n) { await q('UPDATE public.cities SET content_v2 = true WHERE slug = $1', [slug]); v2 = true; }
    await q('COMMIT');
    return `opublikowane PL: ${results.length} przystanków${v2 ? ' · content_v2 = true' : ` · content_v2 bez zmian (ok ${all.ok}/${all.n} przystanków miasta)`}`;
  } catch (e) { await q('ROLLBACK').catch(() => {}); throw e; }
}

async function main() {
  await loadRules(q);
  const [city] = await q(`SELECT c.slug, c.country, c.region_slug, c.content_v2,
      coalesce((SELECT title FROM public.city_translations WHERE city_slug = c.slug AND lang = 'pl'), c.slug) AS title
    FROM public.cities c WHERE c.slug = $1`, [slug]);
  if (!city) throw new Error(`nie ma miasta „${slug}” w bazie`);
  let stops = await q(`SELECT s.id, s.stop_key, s.stop_number, s.sort_order, s.category, s.year_built, s.wiki_article, s.maps_query,
      s.website, s.sources, t.name, t.desc_paragraphs AS desc, t.kids_box, t.photo_task
    FROM public.stops s JOIN public.stop_translations t ON t.stop_id = s.id AND t.lang = 'pl'
    WHERE s.city_slug = $1 ORDER BY s.sort_order, s.stop_number`, [slug]);
  if (only) {
    const miss = only.filter(id => !stops.some(s => s.id === id));
    if (miss.length) throw new Error(`przystanki ${miss.join(', ')} nie należą do ${slug} (albo nie mają wersji pl)`);
    stops = stops.filter(s => only.includes(s.id));
  }
  if (!stops.length) throw new Error(`${slug}: brak przystanków z wersją pl`);
  log(`${slug}: ${stops.length} przystanków · pisze ${writer === 'gpt' ? 'GPT (OpenRouter)' : 'Claude'}${DRY ? ' · --dry (bez zapisu)' : ''}${PUBLISH && !DRY ? ' · --publish' : ''}`);
  await notify(channel, `🔎 ${city.title}: treść przystanków według standardu (${stops.length} przystanków) — research, pisanie, kontrola Claude. Dam znać tutaj.`);

  const results = [];
  for (const stop of stops) {
    try {
      const r = await processStop(stop, city);
      writeFileSync(join(dir, `stop-${stop.id}.json`), JSON.stringify({ stop_id: stop.id, stop_key: stop.stop_key, ...r.rec, check_result: r.check_result }, null, 2));
      if (!DRY) await save(r);
      results.push(r);
    } catch (e) {
      log(`  ${stop.id}: BŁĄD ${e.message}`);
      results.push({ stop, rec: null, check_result: { verdict: 'fix', errors: [{ block: 'skrypt', problem: e.message.slice(0, 300), by: 'skrypt' }] } });
    }
  }

  let pub = '';
  if (PUBLISH && !DRY) pub = await publish(results);
  else if (PUBLISH) pub = 'publikacja pominięta (--dry)';
  const ok = results.filter(r => r.check_result.verdict === 'ok').length;
  const lines = results.map(r => {
    const errs = r.check_result.errors ?? [];
    return `• ${r.stop.stop_number}. ${r.stop.name} (id ${r.stop.id}): ${r.rec ? blocksLine(r.rec) : 'brak rekordu'} · **${r.check_result.verdict}**` +
      (errs.length ? `\n${errs.slice(0, 3).map(e => `   – ${BLOCK_PL[e.block] ?? e.block ?? ''}: ${e.problem}`).join('\n')}${errs.length > 3 ? `\n   – … i ${errs.length - 3} więcej` : ''}` : '');
  });
  const msg = `📚 **${city.title} — treść przystanków** · ok ${ok}/${results.length}${DRY ? ' · próba (--dry), nic nie zapisane' : ' · zapisane w ops.stop_research'}\n` +
    `${lines.join('\n')}\n${pub ? pub + '\n' : ''}koszt modeli płatnych: $${spent.usd.toFixed(4)}` +
    (!PUBLISH && !DRY && ok === results.length ? `\nWszystko ok — po akceptacji JP: node stop-content.mjs ${slug} --publish (albo ops.stop_publish_pl per przystanek).` : '');
  await notify(channel, msg);
  const out = { slug, dry: DRY, writer, ok, total: results.length, published: pub || null, cost_usd: +spent.usd.toFixed(4),
    stops: results.map(r => ({ stop_id: r.stop.id, stop_key: r.stop.stop_key, name: r.stop.name, verdict: r.check_result.verdict,
      state: r.rec?.state ?? null, errors: r.check_result.errors ?? [], ...(DRY ? { record: r.rec } : {}) })) };
  writeFileSync(join(dir, 'stop-content-last.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  if (ok < results.length) process.exitCode = 1;
}

try { await main(); }
catch (e) { console.error('BŁĄD:', e.message); await notify(channel, `⚠️ Treść przystanków ${slug}: ${e.message.slice(0, 500)}`); process.exitCode = 1; }
finally { await c.end(); }
