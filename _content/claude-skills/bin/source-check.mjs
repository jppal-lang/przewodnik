// source-check (JP 2026-10-30): pipeline SAM rozstrzyga uwagi, które da się rozstrzygnąć źródłem, ZANIM trafią do JP.
// „Dlaczego ja mam szukać i wpisywać na twoje zalecenie — to powinno wydarzyć się wcześniej.” Do JP idą tylko decyzje redakcyjne.
//
// Wejście: wynik kontroli (rv z fullReview / trip-review + extraCheck, albo kontrola wersji wyjściowej przy --no-review),
// szkic {meta, content}, bloki przystanków i katalog roboczy work/drafts/<slug>/. Wpięcie: gemini-draft.mjs (main, --recheck, --revise)
// po kontroli całej trasy i PRZED zapisem wersji. Wyłączenie: --no-source-check.
//
// 1. Uwagi „fakt bez źródła / do potwierdzenia / nie ma w źródle” rozbijane kodem na pojedyncze fakty (lista po „;”, cytaty „…”,
//    pełna lista not_in_source z facts.json). „Dodaj po potwierdzeniu” (np. Infiorata do lokalnego smaku) = osobny rodzaj.
// 2. Źródła po kolei, od najtańszego: (a) Wikipedia it/en/pl (artykuł przystanku i miasta, wyszukiwanie po nazwach własnych)
//    + Wikidata przystanku (wikidata.mjs); (b) to, co trasa już zebrała: strony z sources/ (cache quality-lib), research-v2.md
//    i v2-stop-N-research.md (URL-e przy pasujących akapitach), verify_url / sources / website przystanku — pobierane i czytane;
//    (c) na końcu JEDNO krótkie zapytanie do AI (paczka wszystkich faktów) z wycinkami pobranych stron: „czy ten tekst potwierdza fakt?”.
//    Nigdy „z pamięci”: cytat z odpowiedzi musi stać dosłownie w pobranym wycinku, inaczej fakt = niepotwierdzony.
// 3. Wynik: potwierdzone → URL w meta.stops[].sources + notatka redakcyjna _notes (pole f: źródło z cytatem), uwaga resolved source_added;
//    niepotwierdzone → złagodzenie (usunięcie tylko faktu sprzecznego ze źródłem, JP 2026-10-30) (podmiana {quote, replace} kodem), resolved softened/removed;
//    „dodaj po potwierdzeniu” → jedno zdanie w polu (bez „—”), resolved added; bez źródła → propozycja porzucona (resolved dropped).
//    Do JP zostaje tylko fakt kluczowy, którego nie da się ani potwierdzić, ani bezpiecznie złagodzić — z opcjami i rekomendacją.
//    Rozstrzygnięte uwagi zostają w ostrzeżeniach z polem `resolved` (panel: szara flaga do wglądu, bez pytania; błąd → ostrzeżenie), licznik w rv.source_check.
// 4. AI: Antigravity (Gemini, AI Pro), gdy limit nie jest wyczerpany (agyQuotaOut), inaczej Claude CLI. Każde wywołanie w dzienniku
//    kosztów (aiUsage → ai_usage, usage-summary.mjs), rola „source-check”. Najwyżej 2 wywołania na przebieg (po 12 faktów).
// Testy: source-check.test.mjs (sztuczne dane, wstrzykiwany fetch i AI, bez sieci).
import { readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { noDash } from './stop-content-lib.mjs';

// ── rozpoznanie uwag ─────────────────────────────────────────────────────────────────────────────
const ADD_RE = /dodaj\p{L}*[^.]{0,40}po potwierdzeniu|po potwierdzeniu w źródle|dopisz\p{L}*[^.]{0,40}po potwierdzeniu/iu;
const UNSOURCED_RE = /bez źródła|bez potwierdzenia|do potwierdzenia|niepotwierdzon|nie ma w źródle|nie stoi w źródle|nie stoją w źródle|brak źródła|potrzebny link|nie ma (żadnego )?oparcia w źródł/iu;
export function issueKind(e) {
  if (e?.resolved) return null;                              // już rozstrzygnięte (poprzedni przebieg)
  const t = `${e?.problem ?? ''} ${e?.fix ?? ''}`;
  if (/Niezgodne ze źródłem/i.test(t)) return null;          // sprzeczność ze źródłem to inny tor (poprawka z dowodem)
  if (ADD_RE.test(t)) return 'add';
  if (UNSOURCED_RE.test(t)) return 'unsourced';
  return null;
}

// pojedyncze fakty z uwagi: pole facts (gdy kontrola zwraca osobno), lista po „:” i „;”, cytaty „…”, a na końcu cała uwaga
export function splitFacts(e) {
  if (Array.isArray(e?.facts) && e.facts.length) return e.facts.map(String).filter(Boolean);
  const p = String(e?.problem ?? '').replace(/^\[[^\]]*\]\s*/, '');
  const m = p.match(/(?:bez źródła|do potwierdzenia|bez potwierdzenia)[^:]{0,120}:\s*([\s\S]+)$/i);
  if (m) return m[1].split(/;\s+/).map(s => s.trim().replace(/[.\s]+$/, '')).filter(s => s.length > 3);
  const q = [...p.matchAll(/[„"]([^”"]{12,400})[”"]/g)].map(x => x[1].trim());
  if (q.length) return q;
  if (issueKind(e) === 'add') {   // „pole lokalny smaczek puste, Spello słynie z Infioraty — dodaj po potwierdzeniu w źródle”
    const parts = p.split(/\s*(?:[,;—–]|\s-\s)\s*/).filter(x => x && !/dodaj|dopisz|pole |puste|potwierdzen/i.test(x));
    const best = parts.sort((a, b) => anchors(b).strong.length - anchors(a).strong.length)[0];
    if (best) return [best.trim()];
  }
  return [p.trim()].filter(Boolean);
}

// pole do uzupełnienia przy „dodaj po potwierdzeniu”
const FIELD_WORDS = [[/lokaln\p{L}* sma/iu, 'local_flavor'], [/wskazówk/iu, 'hint'], [/praktyczn/iu, 'practical_note'],
  [/dobrze wiedzieć|good_to_know/iu, 'good_to_know'], [/kuchni|jedzeni|local_food/iu, 'local_food']];
export function addField(e) {
  const f = String(e?.field ?? '').replace(/^(content\.)?(stops\.[^.]+\.|city\.)?/, '').replace(/^stop\./, '');
  if (/^(local_flavor|hint|practical_note|good_to_know|local_food)$/.test(f)) return f;
  return FIELD_WORDS.find(([re]) => re.test(`${e?.problem ?? ''} ${e?.fix ?? ''}`))?.[1] ?? 'local_flavor';
}

// ── dopasowanie słów kluczowych (kod, bez AI) ──────────────────────────────────────────────────
const STOP_CAP = new Set(['ten', 'ta', 'to', 'tu', 'tam', 'na', 'w', 'we', 'z', 'za', 'po', 'od', 'do', 'przy', 'kim', 'jak', 'gdy', 'jego', 'jej', 'ich',
  'legenda', 'według', 'fakty', 'pole', 'brak', 'opis', 'misja', 'dziś', 'dzisiaj', 'kościół', 'kościele', 'kaplica', 'kaplicy', 'brama', 'bramie', 'święty', 'święta']);
export const stem = (w) => { const s = String(w).toLowerCase(); return s.length <= 5 ? s : s.slice(0, Math.max(5, Math.min(s.length - 2, 10))); };
const norm = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[„”"«»“]/g, '"').replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim();
// strong = liczby i nazwy własne (działają między językami: 2005, Pinturicchio, Baglioni); weak = dłuższe słowa (tylko do wyboru pól)
export function anchors(text, { city = '' } = {}) {
  const t = String(text ?? ''), cityS = city ? stem(norm(city)) : null;
  const nums = [...new Set(t.match(/\b\d{3,4}\b|\b\d+(?=\s*(?:m²|m2|metr|lat|wiek|r\.))/g) ?? [])];
  const caps = [];
  for (const m of t.matchAll(/(^|[^\p{L}])(\p{Lu}[\p{L}'’-]{3,})/gu)) {
    const w = m[2].replace(/['’-]+$/, ''); const lw = w.toLowerCase();
    if (STOP_CAP.has(lw)) continue;
    const s = stem(norm(w)); if (s === cityS) continue;
    if (!caps.includes(s)) caps.push(s);
  }
  const quoted = [...t.matchAll(/[„"]([^”"]{3,80})[”"]/g)].flatMap(x => x[1].split(/\s+/)).filter(w => w.length >= 6).map(w => stem(norm(w)));
  const strong = [...new Set([...nums, ...caps, ...quoted])];
  const weak = [...new Set((norm(t).match(/\p{L}{6,}/gu) ?? []).map(stem))].filter(s => !strong.includes(s) && s !== cityS);
  return { strong, weak, nums };
}
const has = (txt, a) => norm(txt).includes(a);
// najlepsze wycinki tekstu (okno 2 zdań, do 600 znaków) wg liczby trafionych kotwic
export function snippets(text, anc, { max = 3, win = 600 } = {}) {
  const sents = String(text ?? '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[\p{Lu}\d„"(])/u);
  const out = [];
  for (let i = 0; i < sents.length; i++) {
    const w = (sents[i] + (sents[i + 1] && sents[i].length < win / 2 ? ' ' + sents[i + 1] : '')).slice(0, win);
    const hits = anc.filter(a => has(w, a)).length;
    if (hits) out.push({ text: w, hits });
  }
  return out.sort((a, b) => b.hits - a.hits).slice(0, max);
}
// potwierdzenie samym kodem — tylko gdy bardzo pewne: w jednym wycinku wszystkie liczby i ≥ 2 kotwice, najwyżej jedna kotwica bez trafienia
// (pierwsze słowo zdania po polsku, np. „Willa”, też jest pisane wielką literą i nie trafi w tekst włoski)
export function codeConfirm(anc, sn) {
  const top = sn[0]; if (!top || !anc.nums.length || !anc.nums.every(n => has(top.text, n))) return false;
  const hit = anc.strong.filter(a => has(top.text, a)).length;
  return hit >= 2 && anc.strong.length - hit <= (anc.strong.length >= 3 ? 1 : 0);
}

// ── podmiana fragmentu (luźne dopasowanie: cudzysłowy, spacje, przypisy [n]) ─────────────────────
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function looseRe(old) {
  const n = String(old).replace(/[„”"«»“]/g, '"').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
  const ch = (c) => c === '"' ? '[„”"«»“]' : c === "'" ? "['’‘]" : /[.,;:!?]/.test(c) ? '(?:\\s*\\[\\d+\\])*' + esc(c) : esc(c);
  return new RegExp(n.split(' ').map(w => [...w].map(ch).join('')).join('(?:\\s+|\\s*\\[\\d+\\]\\s*)'));
}
const tidy = (t) => t.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').replace(/\.\s*\./g, '.').replace(/^\s*[,;]\s*/, '').trim();
export const PRACTICAL = /€|\beuro\b|\bzł\b|\bcen[aęy]\b|bilet|parking|\bZTL\b|godzin[ay]? otwarcia|otwart[ey]|zamknięt|\b\d{1,2}[:.]\d{2}\b|telefon|\+\d{2}|rezerwac|wstęp|opłat|price|opening_hours|phone|ticket/i;
export const HEDGE = /\bpodobno\b|\bponoć\b|mówi się|według tradycji|\bprawdopodobnie\b|\bchyba\b/i;
export function applyQuote(targets, quote, replace) {
  if (typeof quote !== 'string' || quote.trim().length < 6 || typeof replace !== 'string') return 0;
  const re = looseRe(quote); let n = 0;
  const walk = (o) => { if (typeof o === 'string') { if (!re.test(o)) return o; n++; return tidy(o.replace(re, noDash(replace))); }
    if (Array.isArray(o)) return o.map(walk).filter(x => x !== ''); if (o && typeof o === 'object') { for (const k of Object.keys(o)) o[k] = walk(o[k]); } return o; };
  for (const [obj, key] of targets) if (obj?.[key] != null) obj[key] = walk(obj[key]);
  return n;
}

// ── sieć (wstrzykiwalna) ──────────────────────────────────────────────────────────────────────────
const UA = { 'User-Agent': 'QuolinoBot/1.0 (quolino.com)' };
const SKIP_URL = /google\.[a-z.]+\/maps|maps\.google|tripadvisor|facebook\.com|instagram\.com|restaurantguru|booking\.com/i;
export const plainHtml = (h) => String(h).replace(/<(script|style|noscript|svg|nav|footer)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/&#?\w+;/g, ' ').replace(/\s+/g, ' ').trim();
export function makeNet(fetchFn = globalThis.fetch) {
  const cache = new Map();
  const get = async (url, json) => {
    const k = `${json ? 'j' : 'h'} ${url}`; if (cache.has(k)) return cache.get(k);
    let v = null;
    try {
      const r = await fetchFn(url, { headers: json ? UA : { ...UA, 'User-Agent': 'Mozilla/5.0 (QuolinoBot; quolino.com)', 'Accept-Language': 'it,en;q=0.8,pl;q=0.5' },
        redirect: 'follow', signal: AbortSignal.timeout(20_000) });
      if (r?.ok) v = json ? await r.json() : (/text\/html|text\/plain/.test(r.headers?.get?.('content-type') ?? 'text/html') ? await r.text() : null);
    } catch { v = null; }
    cache.set(k, v); return v;
  };
  return {
    async wiki(lang, title) {
      if (!title) return null;
      const t = decodeURIComponent(String(title).replace(/^https?:\/\/[a-z-]+\.wikipedia\.org\/wiki\//, '')).replace(/_/g, ' ');
      const j = await get(`https://${lang}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&prop=extracts&explaintext=1&titles=${encodeURIComponent(t)}`, true);
      const pg = j?.query?.pages?.[0];
      if (!pg?.extract || pg.missing) return null;
      return { kind: 'wikipedia', lang, title: `${pg.title} — Wikipedia (${lang})`, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(pg.title.replace(/ /g, '_'))}`, text: pg.extract.slice(0, 60_000) };
    },
    async wikiSearch(lang, query, n = 2) {
      const j = await get(`https://${lang}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&list=search&srlimit=${n}&srsearch=${encodeURIComponent(query)}`, true);
      return (j?.query?.search ?? []).map(x => x.title);
    },
    async page(url) {
      if (!/^https?:\/\//.test(url ?? '') || SKIP_URL.test(url)) return null;
      const h = await get(url, false); if (!h) return null;
      const text = plainHtml(h);
      return text.length > 200 ? { kind: 'local', title: (String(h).match(/<title[^>]*>([^<]{1,160})/i)?.[1] ?? url).trim(), url, text: text.slice(0, 60_000) } : null;
    },
  };
}

// ── AI: jedno krótkie zapytanie (Antigravity przy dostępnym limicie, inaczej Claude CLI) ─────────────────────
const AGY = '/opt/data/home/.local/bin/agy';
function agyAsk(prompt, lib) {
  return new Promise((resolve, reject) => {
    mkdirSync('/tmp/gq', { recursive: true });
    const env = { ...process.env, HOME: '/opt/data/home' }; delete env.GOOGLE_API_KEY; delete env.GEMINI_API_KEY;
    const p = spawn(AGY, ['-p', prompt, '--output-format', 'json', '--print-timeout', '300s', '--sandbox', '--mode', 'plan'], { cwd: '/tmp/gq', env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', done = false;
    const fin = () => { if (done) return; let j = null; try { j = JSON.parse(out.slice(out.indexOf('{'))); } catch { return; }
      done = true; clearTimeout(t); try { p.kill('SIGKILL'); } catch {}
      if (j?.status === 'SUCCESS' && j.response) { lib.aiUsage({ provider: 'gemini', model: 'Antigravity (AI Pro)', role: 'source-check', billing: 'abonament', tin: j.usage?.input_tokens ?? j.usage?.total_tokens ?? 0, tout: j.usage?.output_tokens ?? 0 }); resolve(String(j.response)); }
      else reject(new Error(`Antigravity ${j?.status} ${String(j?.error ?? '').slice(0, 200)}`)); };
    const t = setTimeout(() => { if (!done) { done = true; try { p.kill('SIGKILL'); } catch {} reject(new Error('Antigravity bez odpowiedzi 5 min')); } }, 5 * 60_000);
    p.stdout.on('data', d => { out += d; if (/\}\s*$/.test(out)) fin(); });
    p.on('close', () => { fin(); if (!done) { done = true; clearTimeout(t); reject(new Error('Antigravity: brak odpowiedzi')); } });
  });
}
export async function defaultAi(prompt) {
  const lib = await import('./lib.mjs');
  const role = globalThis.__aiRole; globalThis.__aiRole = () => 'source-check (potwierdzenie faktów)';
  try {
    if (existsSync(AGY) && !lib.agyQuotaOut() && process.env.QUOLINO_SOURCE_CHECK_AGY !== '0') {
      try { return await agyAsk(prompt, lib); }
      catch (e) { if (/quota reached|upgrade your subscription|RESOURCE_EXHAUSTED/i.test(e.message)) lib.agyQuotaHit(e.message); lib.log(`source-check: ${e.message.slice(0, 120)} — pyta Claude`); }
    }
    return await lib.claude(null, prompt);
  } finally { globalThis.__aiRole = role; }
}
export function parseJson(text) {
  const t = String(text ?? ''); const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('brak JSON');
  return JSON.parse(t.slice(a, b + 1));
}

// ── teksty trasy ──────────────────────────────────────────────────────────────────────────────────
const TEXT_FIELDS = ['name', 'desc_paragraphs', 'kids_box', 'hint', 'local_flavor', 'practical_note', 'photo_task'];
const CITY_FIELDS = ['lead', 'subtitle', 'good_to_know', 'hero_note', 'local_food'];
function textsOf(trip, blocks, sk) {
  const out = {};
  const put = (path, v) => { if (typeof v === 'string' && v.trim()) out[path] = v; else if (Array.isArray(v)) v.forEach((x, i) => put(`${path}[${i}]`, x)); };
  if (sk) { const st = trip.content?.stops?.[sk] ?? {}; for (const f of TEXT_FIELDS) put(`content.stops.${sk}.${f}`, st[f]);
    const mk = blocks?.[sk]?.marked; if (mk && typeof mk === 'object') for (const [k, v] of Object.entries(mk)) if (k !== 'desc_paragraphs') put(`blocks.${sk}.${k}`, typeof v === 'object' && v && !Array.isArray(v) ? Object.values(v).filter(x => typeof x === 'string').join(' ') : v); }
  else { const c = trip.content?.city ?? {}; for (const f of CITY_FIELDS) put(`content.city.${f}`, c[f]); }
  return out;
}
const targetsOf = (trip, blocks, sk) => sk ? [[trip.content.stops, sk], [blocks?.[sk] ?? {}, 'marked']] : [[trip.content, 'city']];
// przystanek po kluczu albo nazwie (bez diakrytyków), a bez wskazania — ten, którego tekst najlepiej pasuje do faktu
export function locateStop(trip, blocks, { stop = null, city = false, fact = '' } = {}) {
  if (city) return null;
  const stops = trip.content?.stops ?? {};
  if (stop) {
    if (stops[stop]) return stop;
    const n = norm(stop);
    const hit = Object.entries(stops).find(([k, v]) => norm(v?.name).includes(n) || n.includes(norm(v?.name)) || norm(k.replace(/-/g, ' ')).includes(n));
    if (hit) return hit[0];
  }
  const a = anchors(fact, { city: trip.content?.city?.title ?? '' }); const keys = [...a.strong, ...a.weak];
  const score = (sk) => { const t = Object.values(textsOf(trip, blocks, sk)).join(' '); return keys.filter(k => has(t, k)).length + a.strong.filter(k => has(t, k)).length; };
  let best = null, bs = 0;
  for (const sk of [null, ...Object.keys(stops)]) { const s = score(sk); if (s > bs) { bs = s; best = sk; } }
  return best;
}

// ── zbieranie źródeł dla jednego faktu: (a) Wikipedia/Wikidata → (b) to, co trasa już ma → hinty z polecenia ──
async function gather(fact, ctx, deps, net) {
  const { trip, sk, workDir, hintUrls = [], note = '' } = ctx;
  const city = trip.content?.city?.title ?? trip.meta?.city?.slug ?? '';
  const anc = anchors(`${fact} ${note}`, { city });
  const keys = anc.strong.length ? anc.strong : anc.weak.slice(0, 6);
  const langs = [...new Set([String(trip.meta?.city?.country ?? 'it').toLowerCase() === 'it' ? 'it' : 'en', 'en', 'pl'])];
  const m = sk ? (trip.meta?.stops ?? []).find(x => x.stop_key === sk) : null;
  const found = [], seen = new Set();
  const take = (src) => { if (!src?.text || seen.has(src.url)) return false; seen.add(src.url); const sn = snippets(src.text, keys); found.push({ ...src, sn });
    return codeConfirm(anc, sn); };
  const enough = () => found.filter(s => s.sn.length && s.sn[0].hits >= Math.min(2, keys.length)).length >= 2;
  // hinty (URL-e wskazane w poleceniu / uwadze) — najpierw, bo to konkretne strony
  for (const u of hintUrls) { const s = /wikipedia\.org\/wiki\//.test(u) ? await net.wiki(u.match(/\/\/([a-z-]+)\.wikipedia/)[1], u) : await net.page(u); if (take(s)) return { anc, keys, found, code: found.at(-1) }; }
  // (a) Wikipedia: artykuł przystanku, artykuł miasta, wyszukiwanie po nazwach własnych; Wikidata przystanku
  if (m?.wiki_article && take(await net.wiki(m.wiki_lang || langs[0], m.wiki_article))) return { anc, keys, found, code: found.at(-1) };
  if (trip.meta?.city?.wiki_article && take(await net.wiki(trip.meta.city.wiki_lang || langs[0], trip.meta.city.wiki_article))) return { anc, keys, found, code: found.at(-1) };
  if (anc.strong.length && !enough()) {
    const q = [...anc.strong.filter(a => !/^\d+$/.test(a)).slice(0, 3).map(a => a.length > 5 ? `${a}*` : a), city].join(' ').trim();
    for (const lang of langs) { for (const title of await net.wikiSearch(lang, q, 2)) if (take(await net.wiki(lang, title))) return { anc, keys, found, code: found.at(-1) }; if (enough()) break; }
  }
  if (m && deps.stopWikidata) try {
    const wd = await deps.stopWikidata(m, { lang: m.wiki_lang || langs[0] });
    if (wd?.lines?.length && take({ kind: 'wikidata', title: `Wikidata ${wd.qid}`, url: wd.url, text: wd.lines.map(l => l.replace(/ — źródło: .*$/, '.')).join(' ') })) return { anc, keys, found, code: found.at(-1) };
  } catch { /* Wikidata niedostępna */ }
  // (b) materiał trasy: strony już pobrane przez kontrolę faktów (sources/*.json), URL-e z researchu przy pasujących akapitach, verify_url/sources
  if (workDir && existsSync(join(workDir, 'sources'))) for (const f of readdirSync(join(workDir, 'sources')).filter(x => x.endsWith('.json')).slice(0, 200)) {
    let s = null; try { s = JSON.parse(readFileSync(join(workDir, 'sources', f), 'utf8')); } catch {}
    if (s?.text && keys.some(k => has(s.text, k)) && take(s)) return { anc, keys, found, code: found.at(-1) };
  }
  const urls = [];
  const rf = [join(workDir ?? '', 'research-v2.md'), join(workDir ?? '', 'research.md'), m ? join(workDir ?? '', `v2-stop-${m.stop_number}-research.md`) : null].filter(f => f && workDir && existsSync(f));
  for (const f of rf) for (const para of readFileSync(f, 'utf8').split(/\n\s*\n|\n(?=[-*#])/)) if (keys.some(k => has(para, k))) urls.push(...(para.match(/https?:\/\/[^\s)\]>„”"]+/g) ?? []));
  urls.push(...[m?.verify_url, m?.website, ...(m?.sources ?? [])].filter(Boolean));
  for (const u of [...new Set(urls.map(x => x.replace(/[.,;]+$/, '').replace(/&amp;/g, '&')))].slice(0, 8)) {
    if (enough()) break;
    if (take(/wikipedia\.org\/wiki\//.test(u) ? await net.wiki(u.match(/\/\/([a-z-]+)\.wikipedia/)[1], u) : await net.page(u))) return { anc, keys, found, code: found.at(-1) };
  }
  return { anc, keys, found, code: null };
}

// ── krok główny ───────────────────────────────────────────────────────────────────────────────────
// facts (z polecenia, np. zlecenie z repo): [{fact, stop?, city?, kind?: 'verify'|'add'|'soften', field?, urls?, note?}]
export async function sourceCheck({ trip, blocks = {}, review, workDir = null, facts = [], log = () => {}, deps = {} }) {
  const net = deps.net ?? makeNet(deps.fetch);
  const ai = deps.ai ?? defaultAi;
  const stats = { issues: 0, facts: 0, confirmed: 0, by_code: 0, softened: 0, removed: 0, added: 0, dropped: 0, to_jp: 0, ai_calls: 0 };
  const changes = [], resolvedOut = [];
  const rv = review ?? { errors: [], warnings: [] };
  const city = trip.content?.city?.title ?? '';
  // facts.json (kontrola faktów, quality-lib): pełna lista twierdzeń „not_in_source” (uwaga pokazuje tylko 3 pierwsze)
  let factsCache = {}; try { if (workDir && existsSync(join(workDir, 'facts.json'))) factsCache = JSON.parse(readFileSync(join(workDir, 'facts.json'), 'utf8')); } catch {}

  // 1) uwagi z kontroli → pozycje (jedna na fakt)
  const items = [];
  for (const list of ['errors', 'warnings']) (rv[list] ?? []).forEach((e, idx) => {
    const kind = issueKind(e); if (!kind) return;
    stats.issues++;
    let fs = splitFacts(e);
    const n = +(String(e.problem).match(/Fakty bez źródła \((\d+)\)/)?.[1] ?? 0);
    if (n > fs.length) { const cl = (factsCache[e.stop_key ?? '_city']?.result?.claims ?? []).filter(c => c.status === 'not_in_source').map(c => c.claim); if (cl.length >= fs.length) fs = cl; }
    let sk = e.stop_key ?? (e.path ? (String(e.path).match(/stops\.([^.[\]]+)/)?.[1] ?? null) : null);
    if (!sk && kind === 'add') sk = locateStop(trip, blocks, { fact: fs.join(' ') });
    if (sk && !trip.content?.stops?.[sk]) sk = null;
    for (const f of fs) items.push({ kind: kind === 'add' ? 'add' : 'verify', fact: f, sk,
      field: kind === 'add' ? addField(e) : null, quote: e.quote ?? null, hintUrls: (`${e.problem} ${e.fix ?? ''}`.match(/https?:\/\/[^\s)\]„”"]+/g) ?? []), from: { list, idx } });
  });
  for (const f of facts ?? []) {
    const sk = locateStop(trip, blocks, { stop: f.stop ?? null, city: !!f.city, fact: f.fact });
    items.push({ kind: f.kind ?? 'verify', fact: f.fact, note: f.note ?? '', sk, field: f.kind === 'add' ? (f.field ?? 'local_flavor') : null, hintUrls: f.urls ?? [], quote: f.quote ?? null, from: null, explicit: true });
  }
  if (!items.length) return { changes, stats, review: rv };
  stats.facts = items.length;
  log(`source-check: ${items.length} faktów z ${stats.issues} uwag${facts?.length ? ` + ${facts.length} z polecenia` : ''} — szukam źródeł (Wikipedia, Wikidata, materiał trasy)`);

  // 2) źródła kodem; potwierdzenie samym kodem tylko przy bardzo pewnym dopasowaniu
  for (const it of items) {
    const g = await gather(it.fact, { trip, sk: it.sk, workDir, hintUrls: it.hintUrls, note: it.note }, deps, net);
    it.g = g;
    if (g.code && it.kind === 'verify') { it.res = { potwierdza: true, src: g.code, cytat: g.code.sn[0].text.slice(0, 200), byCode: true }; stats.by_code++; }
  }
  // 3) jedno krótkie zapytanie AI dla reszty (paczki po 12) — tylko wycinki pobranych stron
  const ask = items.filter(it => !it.res);
  for (let i = 0; i < ask.length && i < 24; i += 12) {
    const part = ask.slice(i, i + 12);
    const payload = part.map((it, j) => {
      const srcs = it.g.found.filter(s => s.sn.length).sort((a, b) => b.sn[0].hits - a.sn[0].hits).slice(0, 4);
      if (!srcs.length) srcs.push(...it.g.found.filter(s => s.kind === 'wikipedia').slice(0, 1).map(s => ({ ...s, sn: [{ text: s.text.slice(0, 900) }] })));
      it.srcs = srcs;
      const texts = textsOf(trip, blocks, it.sk), kw = [...it.g.keys, ...anchors(it.fact).weak];
      const rel = Object.fromEntries(Object.entries(texts).filter(([, v]) => kw.some(k => has(v, k))).slice(0, 6).map(([k, v]) => [k, v.slice(0, 1500)]));
      return { id: j, rodzaj: it.kind === 'add' ? 'dodaj' : it.kind === 'soften' ? 'zlagodz' : 'sprawdz', fakt: it.fact, ...(it.note ? { uwaga: it.note } : {}),
        ...(it.kind === 'add' ? { pole: it.field, obecna_tresc_pola: (it.sk ? trip.content.stops?.[it.sk]?.[it.field] : trip.content.city?.[it.field]) ?? null }
          : { tekst_trasy: Object.keys(rel).length ? rel : Object.fromEntries(Object.entries(texts).slice(0, 6).map(([k, v]) => [k, v.slice(0, 1500)])) }),
        zrodla: srcs.map((s, n) => ({ n, url: s.url, fragmenty: s.sn.map(x => x.text) })) };
    });
    const prompt = `Sprawdzasz fakty rodzinnego przewodnika Quolino WYŁĄCZNIE na podstawie fragmentów źródeł podanych przy każdej pozycji. Nie korzystaj z pamięci ani wyszukiwarki.
Dla każdej pozycji:
- "potwierdza": true tylko wtedy, gdy fragment źródła mówi to samo co fakt (inny język i inne słowa są w porządku). Wtedy "zrodlo" = numer źródła, "cytat" = dosłowny fragment tego źródła (do 200 znaków), skopiowany znak w znak.
- rodzaj "dodaj" i potwierdzone: "zdanie" = jedno krótkie zdanie po polsku do pola (styl rodzinny, prosto, tylko fakt ze źródła, bez długich myślników „—” i „–”, bez przymiotników-wypełniaczy). Jeśli pole ma już treść, zdanie ma ją uzupełniać, nie powtarzać.
- FAKTY PRAKTYCZNE (cena, bilet, parking, ZTL, godziny otwarcia, dni zamknięcia, telefon, adres, rezerwacja, długość zwiedzania) NIGDY nie łagodzimy słowami „podobno”, „mówi się”, „według tradycji”. Bez potwierdzenia: "replace" = to samo miejsce bez konkretnej liczby/danej, z odesłaniem „sprawdź na miejscu” albo „aktualne ceny/godziny na stronie atrakcji” (np. „Parking jest płatny, aktualną cenę sprawdź na miejscu.”). Ostrożne słowa wolno tylko w historii, legendach i ciekawostkach.
- "sprzeczne": true tylko wtedy, gdy fragment źródła mówi co innego niż fakt (np. inna data, inna osoba). Brak informacji w źródle to NIE sprzeczność.
- rodzaj "sprawdz" bez potwierdzenia albo rodzaj "zlagodz": "quote" = fragment TEKSTU TRASY (z pola tekst_trasy) skopiowany znak w znak, który zawiera fakt; "replace" = to samo miejsce złagodzone: ogólniej i PRAWDZIWIE według fragmentów źródeł (wtedy "zrodlo" = numer źródła) albo z ostrożnym słowem („według tradycji”, „podobno”, „mówi się, że”), albo skrócone do części pewnej. "replace" = "" (usunięcie) WYŁĄCZNIE gdy "sprzeczne": true. Zmieniaj najmniej, jak się da; zdanie po zmianie ma być poprawne po polsku. "kluczowy": true tylko, gdy bez tego faktu przystanek traci sens (np. główna atrakcja).
Odpowiedz wyłącznie JSON-em: {"items": [{"id": 0, "potwierdza": false, "sprzeczne": false, "zrodlo": null, "cytat": "", "zdanie": "", "quote": "", "replace": "…", "kluczowy": false}]}. W tekstach używaj cudzysłowów „…”, nigdy prostego ".

POZYCJE:
${JSON.stringify(payload)}`;
    let out = null;
    try { stats.ai_calls++; out = parseJson(await ai(prompt)); } catch (e) { log(`source-check: AI bez poprawnej odpowiedzi (${String(e.message).slice(0, 120)})`); }
    for (const a of out?.items ?? []) { const it = part[a?.id]; if (it && !it.res) it.res = a; }
  }

  // 4) wyniki → zmiany w trasie i rozstrzygnięcia uwag
  const addedTo = new Set();
  const notes = (trip.content._notes = Array.isArray(trip.content._notes) ? trip.content._notes : []);
  for (const it of items) {
    const r = it.res ?? {}; const src = r.byCode ? r.src : it.srcs?.[r.zrodlo];
    // cytat musi stać dosłownie w pobranym wycinku — inaczej to „pamięć” modelu, nie źródło
    const quoteOk = !!(src && r.cytat && String(r.cytat).split(/…|\.\.\./).map(norm).filter(x => x.length >= 12).every(x => norm(src.sn.map(s => s.text).join(' ')).includes(x)) && norm(r.cytat).length >= 12);
    const confirmed = r.potwierdza === true && quoteOk && it.kind !== 'soften';
    const label = it.sk ? `stops.${it.sk}` : 'city';
    if (confirmed && it.kind === 'add' && addedTo.has(`${it.sk}|${it.field}`)) { it.resolved = { action: 'dropped', why: 'to pole uzupełniono już w tym przebiegu (ta sama propozycja z kontroli i z polecenia)' }; stats.dropped++; continue; }
    if (confirmed && it.kind === 'add') {
      const zd = noDash(String(r.zdanie ?? '').trim());
      const tgt = it.sk ? trip.content.stops?.[it.sk] : trip.content.city;
      if (zd.length > 10 && tgt) {
        const before = tgt[it.field] ?? null;
        addedTo.add(`${it.sk}|${it.field}`);
        tgt[it.field] = before && String(before).trim() ? `${String(before).trim().replace(/([^.!?])$/, '$1.')} ${zd}` : zd;
        addSource(trip, it.sk, src.url); notes.push({ stop_key: it.sk, field: 'f', note: `Źródło (${it.field}): ${src.url} — „${String(r.cytat).slice(0, 200)}”` });
        changes.push({ path: `content.${label}.${it.field}`, before, after: tgt[it.field], why: `source-check: dodane po potwierdzeniu w źródle ${src.url}`, auto: true });
        it.resolved = { action: 'added', field: it.field, text: zd, url: src.url, quote: String(r.cytat).slice(0, 200) }; stats.added++; continue;
      }
    }
    if (confirmed) {
      addSource(trip, it.sk, src.url); notes.push({ stop_key: it.sk, field: 'f', note: `Źródło: „${String(it.fact).slice(0, 160)}” — ${src.url} („${String(r.cytat).slice(0, 200)}”)` });
      if (rv.facts && typeof rv.facts === 'object') (rv.facts.sources ??= []).push({ stop_key: it.sk, kind: src.kind, title: src.title, url: src.url });
      changes.push({ path: it.sk ? `meta.stops.${it.sk}.sources` : 'content._notes', before: null, after: src.url, why: `source-check: źródło faktu „${String(it.fact).slice(0, 120)}”`, auto: true });
      it.resolved = { action: 'source_added', url: src.url, quote: String(r.cytat).slice(0, 200), ...(r.byCode ? { by: 'kod' } : {}) }; stats.confirmed++; continue;
    }
    if (it.kind === 'add') { it.resolved = { action: 'dropped', why: 'brak potwierdzenia w źródłach — propozycja porzucona', checked: (it.g?.found ?? []).map(s => s.url).slice(0, 6) }; stats.dropped++; continue; }
    // niepotwierdzone → złagodzenie albo usunięcie fragmentu (podmiana kodem)
    const q = typeof r.quote === 'string' && r.quote.trim().length >= 6 ? r.quote : it.quote;
    let rep = typeof r.replace === 'string' ? r.replace.trim() : null;
    // JP 2026-10-30: usuwamy tylko fakt sprzeczny ze źródłem; brak źródła = łagodzimy, a gdy AI nie dało złagodzenia, zostawiamy bez zmian
    if (rep === '' && r.sprzeczne !== true) {
      notes.push({ stop_key: it.sk, field: 'f', note: `Bez źródła (zostawione, do weryfikacji redakcji): „${String(it.fact).slice(0, 160)}”` });
      it.resolved = { action: 'kept', why: 'nie znaleziono źródła ani sprzeczności — tekst bez zmian, notatka redakcyjna', checked: (it.g?.found ?? []).map(s => s.url).slice(0, 6) }; stats.kept = (stats.kept ?? 0) + 1; continue;
    }
    // fakty praktyczne: nigdy „podobno/mówi się” — tylko potwierdzone albo „sprawdź na miejscu” (JP 2026-10-30)
    if (rep && PRACTICAL.test(`${it.fact} ${q ?? ''} ${it.field ?? ''}`) && HEDGE.test(rep)) {
      notes.push({ stop_key: it.sk, field: 'f', note: `Fakt praktyczny bez źródła (zostawione, do weryfikacji redakcji): „${String(it.fact).slice(0, 160)}”` });
      it.resolved = { action: 'kept', why: 'fakt praktyczny bez źródła — nie łagodzimy słowem „podobno”; tekst bez zmian, notatka redakcyjna' }; stats.kept = (stats.kept ?? 0) + 1; continue;
    }
    if (q && rep != null) {
      const n = applyQuote(targetsOf(trip, blocks, it.sk), q, rep);
      if (n) {
        const url = rep && src ? src.url : null;
        if (url) addSource(trip, it.sk, url);
        changes.push({ path: `content.${label}`, before: q, after: noDash(rep), why: `source-check: brak potwierdzenia „${String(it.fact).slice(0, 120)}” — ${rep ? 'złagodzone' : 'usunięte'}`, auto: true });
        it.resolved = { action: rep ? 'softened' : 'removed', before: q, after: noDash(rep), ...(url ? { url } : {}) }; stats[rep ? 'softened' : 'removed']++; continue;
      }
    }
    if (r.kluczowy === true || it.explicit) {
      it.toJp = { stop_key: it.sk, problem: `Fakt kluczowy bez źródła: „${String(it.fact).slice(0, 200)}”. Sprawdzono: ${(it.g?.found ?? []).map(s => s.url).slice(0, 5).join(', ') || 'Wikipedia it/en/pl, research trasy'} — żadne nie potwierdza, a fragmentu nie dało się bezpiecznie złagodzić.`,
        options: ['Usuń zdanie z faktem', 'Zostaw z dopiskiem „sprawdź na miejscu”', 'Wskaż źródło (link) — wtedy zostaje'], recommend: 'Usuń zdanie z faktem (bez źródła nie publikujemy)', source_check: true };
      stats.to_jp++; continue;
    }
    // drobny fakt, którego nie da się zlokalizować w tekście: nic nie zmieniamy, uwaga nie idzie do JP
    it.resolved = { action: 'dropped', why: 'drobny fakt bez źródła, fragmentu nie znaleziono w tekście — bez zmian', checked: (it.g?.found ?? []).map(s => s.url).slice(0, 6) }; stats.dropped++;
  }

  // 5) uwagi: rozstrzygnięte zostają na liście ostrzeżeń z polem `resolved` (panel: szara flaga „rozstrzygnięte automatycznie”, bez pytania),
  //    rozstrzygnięty błąd przechodzi do ostrzeżeń (nie blokuje); fakt kluczowy bez źródła zostaje pytaniem z opcjami i rekomendacją
  const WHAT = { source_added: 'źródło dopisane', added: 'dodane po potwierdzeniu w źródle', softened: 'złagodzone według źródła', removed: 'usunięte (sprzeczne ze źródłem)', kept: 'zostawione bez zmian (brak źródła, notatka dla redakcji)', dropped: 'porzucone (brak źródła)', multi: 'rozstrzygnięte automatycznie' };
  const withWhat = (r) => ({ ...r, what: `${WHAT[r.action] ?? r.action}${r.action === 'multi' ? `: ${r.items.map(x => WHAT[x.action] ?? x.action).join(', ')}` : ''}` });
  const byIssue = new Map();
  for (const it of items) if (it.from) { const k = `${it.from.list}:${it.from.idx}`; if (!byIssue.has(k)) byIssue.set(k, []); byIssue.get(k).push(it); }
  const moved = new Set(), add = [];
  for (const [k, its] of byIssue) {
    const [list, idx] = k.split(':'); const e = rv[list][+idx];
    const res = its.filter(x => x.resolved).map(x => ({ fact: x.fact, ...x.resolved }));
    const jp = its.filter(x => x.toJp);
    if (!jp.length) {
      const r = withWhat(res.length === 1 ? res[0] : { action: 'multi', items: res, url: res.find(x => x.url)?.url ?? null });
      if (list === 'errors') { moved.add(+idx); add.push({ ...e, resolved: r }); } else rv[list][+idx] = { ...e, resolved: r };
      resolvedOut.push({ stop_key: e.stop_key ?? null, problem: e.problem, resolved: r });
      continue;
    }
    rv[list][+idx] = { ...e, problem: jp.map(x => x.toJp.problem).join(' · '), options: jp[0].toJp.options, recommend: jp[0].toJp.recommend, source_check: true,
      ...(res.length ? { resolved_part: res.map(withWhat) } : {}) };
  }
  if (moved.size) rv.errors = rv.errors.filter((_, i) => !moved.has(i));
  rv.warnings = [...(rv.warnings ?? []), ...add];
  for (const it of items) if (!it.from) {
    if (it.toJp) (rv.warnings ??= []).push(it.toJp);
    else { const w = { stop_key: it.sk, problem: `Do sprawdzenia: ${String(it.fact).slice(0, 200)}`, resolved: withWhat(it.resolved) }; rv.warnings.push(w); resolvedOut.push(w); }
  }
  rv.source_check = { at: new Date().toISOString(), ...stats };
  if (rv.verdict && !(rv.errors ?? []).length) rv.verdict = 'ok';
  log(`source-check: potwierdzone ${stats.confirmed} (kodem ${stats.by_code}), złagodzone ${stats.softened}, usunięte ${stats.removed}, dodane ${stats.added}, porzucone ${stats.dropped}, zostawione ${stats.kept ?? 0}, do JP ${stats.to_jp} · AI: ${stats.ai_calls}`);
  return { changes, stats, review: rv, resolved: resolvedOut };
}
function addSource(trip, sk, url) {
  if (!sk || !url) return;
  const m = (trip.meta?.stops ?? []).find(x => x.stop_key === sk); if (!m) return;
  m.sources = Array.isArray(m.sources) ? m.sources : [];
  if (!m.sources.includes(url)) m.sources.push(url);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.error('source-check działa jako krok gemini-draft.mjs (po kontroli trasy, przed zapisem wersji). Ręcznie na istniejącej wersji:\n' +
    '  node gemini-draft.mjs <slug> --recheck --from v3d --no-review --rounds 0 [--facts \'[{"fact":"…","stop":"…","kind":"verify|add|soften","urls":["…"]}]\']');
  process.exit(2);
}
