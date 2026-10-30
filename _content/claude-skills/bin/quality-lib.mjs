// Jakość szkiców: pamięć redakcyjna (zasady uczone z poprawek JP) + weryfikacja faktów z Wikipedią.
// Używają: trip-draft, trip-revise (przez draft-lib), trip-rules.
//
// ZASADY — Claude czyta poprawkę w kontekście (polecenie JP, rozmowa z wątku, zmiany „przed → po”, miasto)
//   i sam rozstrzyga: jednorazowa (fakt o tym mieście) czy ogólna preferencja JP. Ogólną zapisuje jako
//   zasadę z przykładem; JP może ją cofnąć („cofnij zasadę 7” → trip-rules.mjs off 7).
//   Aktywne zasady dostaje GPT przy pisaniu i każdej poprawce, a Claude sprawdza ich przestrzeganie.
// FAKTY — dla każdego przystanku (bez parkingów i lokali) artykuł z Wikipedii w języku kraju (Włochy: it,
//   Hiszpania: es…, potem en, pl) i strony lokalne/oficjalne ze źródeł przystanku. Claude porównuje
//   twierdzenia historyczne. Niezgodne = błąd (wraca do GPT z dowodem), bez źródła = uwaga.
//   Potwierdzające linki trafiają do meta.stops[].sources (zbieramy źródła).
//   Godzin, cen i zasad wejścia NIE weryfikujemy z Wikipedią. LOKALE (restauracje, lody, słodycze):
//   nie Wikipedia, tylko zasada „polecane przez Google” — ocena ≥ 4,1 i > 100 opinii.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { claude, extractJson, log } from './lib.mjs';

const WORK = '/opt/data/quolino/work/drafts';
const UA = 'QuolinoFactCheck/1.0 (https://quolino.com)';
const NO_WIKI = ['parking', 'restaurant', 'icecream', 'sweets'];   // Wikipedia ich nie opisuje (BACKLOG: wyjątek)
const sha = (o) => createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 16);

// ── zasady ──────────────────────────────────────────────────────────────────────────────────
let RULES = [];
export async function loadRules(q) {
  RULES = await q(`SELECT id, scope, rule, bad, good, origin_city FROM public.editorial_rules
                    WHERE active ORDER BY scope, id`).catch(() => []);
  return RULES;
}
export function rulesText(rules = RULES) {
  if (!rules.length) return '';
  return `ZASADY REDAKCYJNE JP (nauczone z wcześniejszych poprawek — obowiązują jak reguły umiejętności):
${rules.map(r => `#${r.id} [${r.scope}] ${r.rule}${r.bad ? `\n   Źle: ${r.bad}` : ''}${r.good ? `\n   Dobrze: ${r.good}` : ''}`).join('\n')}
`;
}

// Claude rozumie kontekst poprawki i decyduje, co z niej jest zasadą na przyszłość.
export async function learn(q, { slug, version, say, context, changes, trip }) {
  if (!changes?.length) return [];
  const all = await q('SELECT id, scope, rule, bad, good, active FROM public.editorial_rules ORDER BY id');
  const cityName = trip?.content?.city?.title ?? slug;
  const prompt = `PAMIĘĆ REDAKCYJNA — czego uczy ta poprawka?
JP poprawił szkic wycieczki „${cityName}”. Zrozum KONTEKST: dlaczego o to poprosił. Rozstrzygnij:
- JEDNORAZOWA: dotyczy tylko tego miasta albo faktu (godziny, nazwa lokalu, kolejność w tym mieście,
  konkretny błąd faktograficzny, jego osobisty wybór trasy). NIE tworzy zasady.
- OGÓLNA: wyraża stałą preferencję JP co do tego, JAK piszemy wycieczki (poziom trudności questów,
  ton, długość, struktura dnia, przerwy dla dzieci, sposób podawania informacji praktycznych…),
  i dotyczyłaby też innych miast. Tylko wtedy zapisz zasadę.
Zasada: jedno zdanie w trybie polecenia, ogólne (bez nazw z tego miasta), sprawdzalne przy kolejnym
szkicu. Do tego para przykładów Źle/Dobrze (mogą być z tej poprawki). Jeśli podobna zasada już istnieje,
zamiast nowej użyj "update" z jej id i doprecyzuj. Nie powielaj reguł, które umiejętność już zawiera.
Jeśli nic nie jest ogólne — pusta lista. Lepiej nie zapisać niż zapisać wątpliwą zasadę.
Odpowiedz wyłącznie JSON-em:
{"rules": [{"action": "add"|"update", "id": <tylko przy update>, "scope": "quest|opis|praktyczne|plan-dnia|ton|struktura|fakty|inne",
            "rule": "…", "bad": "…", "good": "…", "why": "1 zdanie: jaki kontekst o tym przesądził"}],
 "one_off": "1 zdanie: co było jednorazowe i dlaczego"}

POLECENIE JP: ${say}
${context ? `ROZMOWA Z WĄTKU (kontekst):\n${context}\n` : ''}
ZMIANY (przed → po, z uzasadnieniem):
${JSON.stringify(changes.slice(0, 40))}

ISTNIEJĄCE ZASADY:
${JSON.stringify(all)}`;
  let j;
  try { j = extractJson(await claude('quolino-trip-writing', prompt)); }
  catch (e) { log('pamięć redakcyjna: Claude niedostępny —', e.message.slice(0, 120)); return []; }
  const saved = [];
  for (const r of j.rules ?? []) {
    if (!r.rule || r.rule.length < 10) continue;
    if (r.action === 'update' && r.id) {
      const [u] = await q(`UPDATE public.editorial_rules SET rule = $2, bad = coalesce($3, bad), good = coalesce($4, good),
                             scope = coalesce($5, scope), active = true, updated_at = now(),
                             history = history || jsonb_build_array(jsonb_build_object('at', now(), 'city', $6::text, 'version', $7::int, 'say', $8::text))
                            WHERE id = $1 RETURNING id, scope, rule`, [r.id, r.rule, r.bad ?? null, r.good ?? null, r.scope ?? null, slug, version, say]);
      if (u) saved.push({ ...u, action: 'update', why: r.why });
    } else {
      const [n] = await q(`INSERT INTO public.editorial_rules (scope, rule, bad, good, origin_city, origin_version, origin_say, why)
                           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, scope, rule`,
        [r.scope ?? 'inne', r.rule, r.bad ?? null, r.good ?? null, slug, version, say, r.why ?? null]);
      saved.push({ ...n, action: 'add', why: r.why });
    }
  }
  if (saved.length) await q('UPDATE public.city_versions SET learned = $3::jsonb WHERE city_slug = $1 AND version = $2',
    [slug, version, JSON.stringify(saved.map(s => ({ id: s.id, rule: s.rule, scope: s.scope, action: s.action })))]);
  await loadRules(q);
  log(`pamięć redakcyjna: ${saved.length ? saved.map(s => `#${s.id} (${s.action})`).join(', ') : 'nic ogólnego'} — ${j.one_off ?? ''}`);
  return saved;
}

// Błędy znalezione przy kontroli (walidator + Claude) → czy wytyczne trzeba poprawić? (JP 2026-10-18:
// „jak robimy poprawki do miasta, Claude musi rozpatrzyć, czy nie poprawić wytycznych”).
// Claude patrzy, jakich błędów pisarz narobił przed poprawkami, i rozstrzyga: przypadek tego miejsca (nic)
// czy luka w wytycznych — wtedy zasada w editorial_rules (od razu trafia do pisania i kontroli; JP cofa: trip-rules.mjs off <id>).
export async function learnFromErrors(q, { slug, stop, errors, standard = '' }) {
  if (!errors?.length) return [];
  const all = await q('SELECT id, scope, rule, bad, good, active FROM public.editorial_rules ORDER BY id').catch(() => []);
  const prompt = `PRZEGLĄD WYTYCZNYCH PO POPRAWKACH — czy zasady pisania trzeba zmienić?
Trasa „${slug}”, przystanek „${stop}”. Pisarz (GPT/Claude) napisał treść według standardu i zasad, a kontrola znalazła błędy (poniżej).
Rozstrzygnij dla każdej grupy błędów:
- PRZYPADEK: błąd wynika z tego miejsca albo z jednorazowej pomyłki, a obecne wytyczne już go zabraniają jasno. Nic nie zmieniaj.
- LUKA W WYTYCZNYCH: wytyczne są niejasne, nie mówią tego wprost albo pisarz powtarza ten typ błędu mimo zasad (np. zdania z datą bez przypisu,
  źródła nieużyte, fakty spoza researchu, powtórzenia między blokami). Wtedy zaproponuj JEDNĄ zasadę: zdanie w trybie polecenia, ogólne
  (bez nazw z tego miejsca), sprawdzalne, z przykładem Źle/Dobrze. Jeśli podobna zasada już jest — "update" z jej id i doprecyzuj.
Lepiej nie zapisać niż zapisać wątpliwą zasadę. Nie powielaj tego, co standard już mówi jasno — chyba że pisarz go nie rozumie,
wtedy doprecyzuj sformułowanie.
Odpowiedz wyłącznie JSON-em:
{"rules": [{"action": "add"|"update", "id": <tylko przy update>, "scope": "tresc-przystanku|opis|fakty|ton|inne",
            "rule": "…", "bad": "…", "good": "…", "why": "1 zdanie: jakie błędy to pokazały"}],
 "standard_note": "1–2 zdania: czy coś w docs/TRESC-PRZYSTANKU.md warto przeredagować (dla JP), albo pusty tekst",
 "one_off": "1 zdanie: co było przypadkiem"}

STANDARD (skrót):
${standard.slice(0, 6000)}

BŁĘDY (przed poprawkami):
${JSON.stringify(errors.slice(0, 40))}

ISTNIEJĄCE ZASADY:
${JSON.stringify(all)}`;
  let j;
  try { j = extractJson(await claude('quolino-trip-writing', prompt)); }
  catch (e) { log('przegląd wytycznych: Claude niedostępny —', e.message.slice(0, 120)); return []; }
  const saved = [];
  for (const r of j.rules ?? []) {
    if (!r.rule || r.rule.length < 10) continue;
    if (r.action === 'update' && r.id) {
      const [u] = await q(`UPDATE public.editorial_rules SET rule = $2, bad = coalesce($3, bad), good = coalesce($4, good),
                             scope = coalesce($5, scope), active = true, updated_at = now(),
                             history = history || jsonb_build_array(jsonb_build_object('at', now(), 'city', $6::text, 'say', $7::text))
                            WHERE id = $1 RETURNING id, scope, rule`, [r.id, r.rule, r.bad ?? null, r.good ?? null, r.scope ?? null, slug, `kontrola: ${stop}`]);
      if (u) saved.push({ ...u, action: 'update', why: r.why });
    } else {
      const [n] = await q(`INSERT INTO public.editorial_rules (scope, rule, bad, good, origin_city, origin_version, origin_say, why)
                           VALUES ($1, $2, $3, $4, $5, NULL, $6, $7) RETURNING id, scope, rule`,
        [r.scope ?? 'tresc-przystanku', r.rule, r.bad ?? null, r.good ?? null, slug, `kontrola: ${stop}`, r.why ?? null]);
      saved.push({ ...n, action: 'add', why: r.why });
    }
  }
  if (saved.length) await loadRules(q);
  log(`przegląd wytycznych (${stop}): ${saved.length ? saved.map(x => `#${x.id} (${x.action})`).join(', ') : 'bez zmian'} — ${j.one_off ?? ''}`);
  return { saved, standard_note: j.standard_note ?? '' };
}

// ── źródła: Wikipedia w języku kraju + strony lokalne (oficjalne) ───────────────────────────
// Kolejność Wikipedii: język kraju wycieczki → angielski → polski (Włochy: it, Hiszpania: es, …).
const COUNTRY_LANG = { it: 'it', es: 'es', fr: 'fr', de: 'de', at: 'de', ch: 'de', pt: 'pt', hr: 'hr', si: 'sl', cz: 'cs',
  sk: 'sk', hu: 'hu', ro: 'ro', gr: 'el', nl: 'nl', be: 'nl', dk: 'da', se: 'sv', no: 'no', pl: 'pl', mt: 'en', gb: 'en', ie: 'en' };
export const wikiLangs = (country) => [...new Set([COUNTRY_LANG[String(country ?? 'it').toLowerCase()] ?? 'en', 'en', 'pl'])];

async function wget(lang, params) {
  const u = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
  return r?.ok ? r.json() : null;
}
async function cached(slug, key, fn) {
  const dir = join(WORK, slug, 'sources'); mkdirSync(dir, { recursive: true });
  const f = join(dir, `${sha(key)}.json`);
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  const out = await fn();
  writeFileSync(f, JSON.stringify(out));
  return out;
}
function article(slug, lang, query, title) {
  return cached(slug, ['wiki', lang, query, title], async () => {
    let t = title;
    if (!t) t = (await wget(lang, { action: 'query', list: 'search', srsearch: query, srlimit: '1' }))?.query?.search?.[0]?.title;
    if (!t) return null;
    const page = (await wget(lang, { action: 'query', prop: 'extracts', explaintext: '1', redirects: '1', titles: t }))?.query?.pages?.[0];
    if (!(page?.extract?.length > 300)) return null;
    return { kind: 'wikipedia', lang, title: page.title, text: page.extract.slice(0, 9000),
             url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}` };
  });
}
async function findWiki(slug, langs, stopName, city, wikiTitle, wikiLang) {
  if (wikiTitle) { const a = await article(slug, wikiLang || langs[0], null, wikiTitle); if (a) return a; }
  const first = String(stopName).toLowerCase().split(/[\s(,]/).find(w => w.length > 3) ?? String(stopName).toLowerCase();
  for (const lang of langs) {
    const a = await article(slug, lang, `${stopName} ${city}`.trim(), null);
    if (a && (!city || a.text.toLowerCase().includes(first))) return a;   // artykuł o tym obiekcie, nie o samym mieście
  }
  return null;
}
// strona lokalna/oficjalna z listy źródeł przystanku (z researchu) — tekst bez HTML
function localPage(slug, url) {
  return cached(slug, ['page', url], async () => {
    if (!/^https?:\/\//.test(url ?? '') || /wikipedia\.org|google\.|tripadvisor|facebook\.com|instagram\.com/.test(url)) return null;
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'it,en;q=0.8,pl;q=0.5' },
      signal: AbortSignal.timeout(30_000), redirect: 'follow' }).catch(() => null);
    if (!r?.ok || !/text\/html|text\/plain/.test(r.headers.get('content-type') ?? '')) return null;
    const html = (await r.text()).slice(0, 600_000);
    const title = (html.match(/<title[^>]*>([^<]{1,160})/i)?.[1] ?? url).trim();
    const text = html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#?\w+;/g, ' ').replace(/\s+/g, ' ').trim();
    return text.length > 300 ? { kind: 'local', title, url, text: text.slice(0, 6000) } : null;
  });
}

// ── lokale: polecane przez Google (ocena ≥ 4,1 i > 100 opinii), nie Wikipedia ────────────────
const FOOD = ['restaurant', 'icecream', 'sweets'];
function foodCheck(stop, name) {
  const out = { errors: [], warnings: [] };
  const rating = stop.rating == null ? null : +String(stop.rating).replace(',', '.');
  const n = stop.reviews_count == null ? null : +String(stop.reviews_count).replace(/\D/g, '');
  if (rating == null || n == null) out.warnings.push({ stop_key: stop.stop_key, field: 'rating',
    problem: `${name}: brak oceny Google (ocena i liczba opinii) — lokal musi być polecany przez Google` });
  else if (rating < 4.1 || n <= 100) out.errors.push({ stop_key: stop.stop_key, field: 'rating',
    problem: `${name}: ocena Google ${rating} przy ${n} opiniach — poniżej progu (≥ 4,1 i > 100 opinii)`,
    fix: 'wybierz lokal polecany przez Google: ocena ≥ 4,1 i ponad 100 opinii' });
  return out;
}

// ── kontrola dodatkowa: fakty (Wikipedia + strony lokalne) + zasady redakcyjne + lokale ───────
// Wyniki per przystanek w pamięci podręcznej po skrócie treści — przy poprawkach Claude czyta tylko zmienione.
// Potwierdzające źródła trafiają do meta.stops[].sources (zbieramy źródła faktów historycznych).
export async function extraCheck(slug, trip) {
  const cacheF = join(WORK, slug, 'facts.json');
  const cache = existsSync(cacheF) ? JSON.parse(readFileSync(cacheF, 'utf8')) : {};
  const city = trip.content?.city?.title ?? slug;
  const langs = wikiLangs(trip.meta?.city?.country);
  const rulesKey = sha(RULES.map(r => [r.id, r.rule]));
  const units = [];
  const cityTxt = trip.content?.city ?? {};
  units.push({ key: '_city', name: city, category: 'city', wiki: trip.meta?.city?.wiki_article, wikiLang: trip.meta?.city?.wiki_lang,
               links: [], text: { lead: cityTxt.lead, good_to_know: cityTxt.good_to_know, hero_note: cityTxt.hero_note } });
  for (const s of trip.meta?.stops ?? []) {
    if (NO_WIKI.includes(s.category)) continue;   // przystanki praktyczne: bez sprawdzania faktów przez Claude (JP 2026-10-26) — godziny i ceny sprawdza kod
    const pl = trip.content?.stops?.[s.stop_key] ?? {};
    units.push({ key: s.stop_key, stop: s, name: pl.name ?? s.stop_key, category: s.category, wiki: s.wiki_article,
      links: [s.verify_url, s.website, ...(s.sources ?? [])].filter(Boolean),
      text: { desc_paragraphs: pl.desc_paragraphs, kids_box: pl.kids_box, hint: pl.hint, local_flavor: pl.local_flavor,
              photo_task: pl.photo_task, year_built: s.year_built } });
  }
  const todo = [];
  for (const u of units) {
    u.hash = sha([u.text, u.links, rulesKey, langs]);
    if (cache[u.key]?.hash === u.hash) { u.result = cache[u.key].result; continue; }
    u.sources = [];
    if (!NO_WIKI.includes(u.category)) {
      const w = await (u.key === '_city' ? findWiki(slug, langs, city, '', u.wiki, u.wikiLang)
                                         : findWiki(slug, langs, u.name, city, u.wiki, u.wikiLang));
      if (w) u.sources.push(w);
      for (const link of [...new Set(u.links)].slice(0, 4)) {
        if (u.sources.filter(x => x.kind === 'local').length >= 2) break;
        const p = await localPage(slug, link); if (p) u.sources.push(p);
      }
    }
    todo.push(u);
  }
  if (todo.length) {
    log(`${slug}: weryfikacja faktów i zasad — ${todo.length} fragmentów, Wikipedia ${langs.join('→')}, ` +
        `${todo.filter(u => u.sources.length).length} ze źródłami`);
    const prompt = `KONTROLA DODATKOWA szkicu „${city}”: (1) fakty względem źródeł, (2) zasady redakcyjne JP.
(1) Dla każdego fragmentu wypisz twierdzenia faktograficzne: daty, liczby, osoby, autorstwo dzieł, wydarzenia,
rekordy, pochodzenie nazw. Porównaj z tekstami źródeł (sources: Wikipedia w języku kraju i strony lokalne/oficjalne,
numerowane od 0). Status:
  "confirmed" — źródło to potwierdza (podaj numer źródła w "source");
  "contradicted" — źródło mówi co innego (podaj numer i co dokładnie mówi);
  "not_in_source" — żadne źródło o tym nie mówi.
Gdy Wikipedia i strona oficjalna różnią się, napisz to w "evidence" i oznacz "contradicted" tylko wtedy,
gdy tekst przeczy obu. Legendy oznaczone jako legenda i questy (polecenia dla dziecka) to nie twierdzenia — pomiń.
Godzin, cen, zasad wejścia i opinii o lokalach NIE oceniasz. Różnica zaokrąglenia, pisowni albo poziomu
szczegółu to nie sprzeczność.
Każde twierdzenie osobno: jedno pole ("field") i jeden dosłowny cytat ("quote") — nigdy kilka faktów w jednym wpisie.
(2) Sprawdź, czy fragment łamie którąś z zasad redakcyjnych (podaj jej numer).
${rulesText() || '(brak zasad redakcyjnych)'}
Odpowiedz wyłącznie JSON-em:
{"units": [{"key": "…", "claims": [{"field": "nazwa pola z FRAGMENTY.text, np. lead, desc_paragraphs, local_flavor", "claim": "…", "status": "confirmed|contradicted|not_in_source",
            "source": 0, "evidence": "co mówi źródło (krótko, własnymi słowami)",
            "quote": "przy contradicted i not_in_source: fragment twierdzenia skopiowany z tekstu pola znak w znak (kilka–kilkanaście słów)", "fix": "przy contradicted: ten fragment poprawiony zgodnie ze źródłem (bez nowych faktów) albo \"\" = usuń"}],
            "rules": [{"rule_id": 0, "field": "…", "problem": "…", "quote": "fragment z tekstu znak w znak", "fix": "poprawiony fragment albo \"\""}]}]}

FRAGMENTY:
${JSON.stringify(todo.map(u => ({ key: u.key, name: u.name, category: u.category, text: u.text,
  sources: u.sources.map(x => ({ kind: x.kind, title: x.title, url: x.url, text: x.text })) })))}`;
    let j;
    try { j = extractJson(await claude('quolino-trip-writing', prompt)); }
    catch (e) { log('kontrola dodatkowa: Claude niedostępny —', e.message.slice(0, 120)); return { unavailable: true }; }
    for (const u of todo) {
      const r = (j.units ?? []).find(x => x.key === u.key) ?? { claims: [], rules: [] };
      const src = u.sources.map(x => ({ kind: x.kind, title: x.title, url: x.url, lang: x.lang ?? null }));
      const claims = (r.claims ?? []).map(c => {
        const s = Number.isInteger(c.source) ? src[c.source] : null;
        if (!s && c.status !== 'not_in_source') c.status = 'not_in_source';   // bez źródła nie ma czym potwierdzić ani obalić
        return { ...c, url: s?.url ?? null, source_title: s?.title ?? null };
      });
      u.result = { sources: src, claims, rules: r.rules ?? [] };
      cache[u.key] = { hash: u.hash, result: u.result };
    }
    writeFileSync(cacheF, JSON.stringify(cache, null, 2));
  }

  const errors = [], warnings = [];
  const facts = { confirmed: 0, contradicted: 0, unverified: 0, langs, sources: [], issues: [], added_sources: 0 };
  for (const u of units) {
    const r = u.result ?? { claims: [], rules: [], sources: [] };
    const sk = u.key === '_city' ? null : u.key;
    const used = new Set();
    for (const c of r.claims ?? []) {
      if (c.status === 'confirmed') { facts.confirmed++; if (c.url) used.add(c.url); }
      else if (c.status === 'contradicted') {
        facts.contradicted++;
        facts.issues.push({ stop_key: sk, claim: c.claim, evidence: c.evidence, url: c.url });
        errors.push({ stop_key: sk, field: c.field, ...(c.field ? { path: claimPath(u, c.field) } : {}), problem: `Niezgodne ze źródłem (${c.source_title ?? '?'}): „${c.claim}” — źródło: ${c.evidence}`, fix: c.fix ?? null,
          ...(c.quote ? { old: c.quote, new: c.fix ?? '' } : {}) });
      } else facts.unverified++;
    }
    for (const s of r.sources ?? []) if (used.has(s.url)) facts.sources.push({ stop_key: sk, kind: s.kind, title: s.title, url: s.url });
    // zbieramy źródła: potwierdzające linki dopisujemy do przystanku
    if (u.stop && used.size) {
      const have = new Set(u.stop.sources ?? []);
      for (const url of used) if (!have.has(url)) { (u.stop.sources ??= []).push(url); facts.added_sources++; }
    }
    // fakt bez źródła = osobna uwaga przy polu i cytacie (JP 2026-10-30: żadnych uwag zbiorczych „Fakty bez źródła (3)”)
    const unv = (r.claims ?? []).filter(c => c.status === 'not_in_source');
    if (!NO_WIKI.includes(u.category)) for (const c of unv)
      warnings.push({ stop_key: sk, field: c.field ?? null, ...(c.field ? { path: claimPath(u, c.field) } : {}), ...(c.quote ? { quote: c.quote } : {}), claim: c.claim,
        problem: `Fakt bez źródła — potrzebny link do Wikipedii albo strony lokalnej: „${c.claim}”` });
    for (const v of r.rules ?? [])
      errors.push({ stop_key: sk, field: v.field, ...(v.field ? { path: claimPath(u, v.field) } : {}), problem: `Zasada #${v.rule_id}: ${v.problem}`, fix: v.fix ?? null, rule_id: v.rule_id,
        ...(v.quote ? { old: v.quote, new: v.fix ?? '' } : {}) });
    if (u.stop && FOOD.includes(u.category)) { const f = foodCheck(u.stop, u.name); errors.push(...f.errors); warnings.push(...f.warnings); }
  }
  return { errors, warnings, facts };
}

// ścieżka pola fragmentu (review-where.cjs): miasto → content.city.<pole>, przystanek → content.stops.<k>.<pole> / meta.stops.<k>.year_built
function claimPath(u, field) {
  const f = String(field).replace(/\[\d+\]|\.\d+$/g, '');
  if (u.key === '_city') return `content.city.${f}`;
  return f === 'year_built' ? `meta.stops.${u.key}.${f}` : `content.stops.${u.key}.${f}`;
}

// Wynik trip-review + kontrola dodatkowa w jednym werdykcie
export function mergeReview(rv, extra) {
  if (!extra || extra.unavailable) return { ...rv, facts: rv.facts ?? null, extra: 'niedostępna' };
  const errors = [...(rv.errors ?? []), ...extra.errors];
  return { ...rv, verdict: errors.length ? 'fix' : rv.verdict, errors, warnings: [...(rv.warnings ?? []), ...extra.warnings],
    facts: extra.facts };
}
