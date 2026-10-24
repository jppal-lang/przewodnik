#!/usr/bin/env node
// Nowy proces treści (decyzja JP 2026-10-20/24) — wycieczka od zera, bez starych szkiców i wzorców.
//   node gemini-draft.mjs <slug> --name "Frasassi" --region marche [--country it] [--duration half_day|full_day]
//        [--brief "co JP chce"] [--notify <kanał>] [--fresh] [--no-check]
//
// ① CLAUDE (sieć, otwiera strony) — research miasta według docs/TRESC-PRZYSTANKU.md (fakty z dokładnymi linkami); --research gemini = Gemini
// ② GEMINI — szkic PL całej wycieczki (plan dnia, przystanki, misje dzieci)
// ③ CLAUDE research pytań §2 dla każdego przystanku → GEMINI pisze bloki legenda / ciekawostka / fun fact / popkultura z przypisami [n]
//    + walidator mechaniczny (stop-content-lib) i najwyżej jedna runda poprawek Gemini
// ④ CLAUDE — kontrola §5 każdego przystanku (otwiera źródła) + kontrola całej trasy (trip-review). Nic nie poprawia — wynik idzie do JP.
// ⑤ ZAPIS — nowa wersja „draft” ze znacznikiem content.workflow = 'v2' (panel: „nowe wytyczne”), bloki w content.stop_blocks_v2
// ⑥ JP — zatwierdza albo pisze uwagi w panelu; uwagi uczą zasad (editorial_rules). Tłumaczenia dopiero po akceptacji.
//
// Model: GEMINI_MODEL (domyślnie gemini-3-flash-preview), klucz GOOGLE_API_KEY. Budżet: QUOLINO_DAILY_USD (0,5 $) — szacunek z usageMetadata.
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { claude, claudeJson, extractJson, JSON_QUOTE_RULE, env, log as rawLog, db, DAILY_USD } from './lib.mjs';
import { WORK, DEPTH_TEXT, fullReview, saveDraft, previewUrl, notify, verdictLine } from './draft-lib.mjs';
import { loadRules, rulesText, learn } from './quality-lib.mjs';
import { validateStop, normalizeRecord, blocksLine, stripRefs, PRACTICAL_CATS, STANDARD, recordFormat, researchQuestions } from './stop-content-lib.mjs';

const argv = process.argv.slice(2);
const slug = argv[0];
const opt = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : undefined; };
// --revise --comments <plik.json> [--context <plik>]: poprawki JP z panelu do szkicu nowego procesu (wywołuje draft-comments.mjs)
const REVISE = argv.includes('--revise');
let name = opt('--name') ?? (REVISE ? slug : undefined);
const region = opt('--region') ?? (REVISE ? '-' : undefined), country = opt('--country') ?? 'it';
const duration = opt('--duration') ?? 'half_day', brief = opt('--brief') ?? '', channel = opt('--notify');
const FRESH = argv.includes('--fresh'), CHECK = !argv.includes('--no-check');
if (!slug || !/^[a-z0-9-]+$/.test(slug) || !name || !region || (REVISE && !opt('--comments'))) {
  console.error('Użycie: gemini-draft.mjs <slug> --revise --comments uwagi.json [--context plik] [--notify kanał]\n   albo: gemini-draft.mjs <slug> --name "Nazwa" --region <region_slug> [--country it] [--duration half_day|full_day] [--brief "…"] [--notify kanał] [--fresh] [--no-check]');
  process.exit(2);
}
const TODAY = new Date().toISOString().slice(0, 10);
// ── czujnik postępu (JP 2026-10-24: przebieg wisiał godzinę i nikt nie wiedział) ──
// każdy wpis w logu = postęp; brak postępu przez 15 min → wiadomość w wątku miasta (i co 15 min dalej)
let lastStep = Date.now(), lastMsg = 'start', stallSent = 0;
const log = (...a) => { lastStep = Date.now(); lastMsg = a.map(String).join(' ').slice(0, 200); rawLog(...a); };
setInterval(() => {
  const min = Math.round((Date.now() - lastStep) / 60_000);
  if (min >= 15 && Date.now() - stallSent > 15 * 60_000) {
    stallSent = Date.now();
    notify(channel, `⏳ ${name} (nowy proces): brak postępu od ${min} min. Ostatni krok: ${lastMsg}`).catch(() => {});
  }
}, 60_000).unref();
const MODEL = env('GEMINI_MODEL') || 'gemini-3-flash-preview';
const KEY = env('GOOGLE_API_KEY') || env('GEMINI_API_KEY');
if (!KEY) { console.error('Brak GOOGLE_API_KEY'); process.exit(2); }
// Koszt: klucz bez płatności (darmowy plan Google AI Studio) = 0 $ — Google nic nie nalicza, tylko limituje zapytania.
// Budżet QUOLINO_DAILY_USD liczy się dopiero przy GEMINI_BILLING=1 (włączone płatności); ceny: GEMINI_PRICE_IN / GEMINI_PRICE_OUT (USD / 1 mln tokenów).
const BILLING = env('GEMINI_BILLING') === '1';
const PRICE_IN = BILLING ? +(env('GEMINI_PRICE_IN') ?? 0.5) : 0, PRICE_OUT = BILLING ? +(env('GEMINI_PRICE_OUT') ?? 3) : 0;
const dir = join(WORK, slug); mkdirSync(dir, { recursive: true });
const cost = { usd: 0, calls: 0 };

// ── Gemini ───────────────────────────────────────────────────────────────────────────────────
// ── Antigravity CLI (agy) na koncie Google AI Pro JP (JP 2026-10-24): Gemini z wyszukiwarką Google, limity planu Pro zamiast 20 zapytań/dobę.
// Uruchamiany w pustym katalogu /tmp/gq (agent nie widzi plików Quolino ani .env), bez kluczy API w środowisku, --sandbox.
const AGY = '/opt/data/home/.local/bin/agy';
let USE_AGY = !argv.includes('--no-agy') && existsSync(AGY);
function agy(prompt, label, { tools = true } = {}) {
  if (prompt.length > 120_000) prompt = prompt.slice(0, 120_000) + '\n\n[materiał skrócony do limitu]';
  return new Promise((resolve, reject) => {
    mkdirSync('/tmp/gq', { recursive: true });
    const env = { ...process.env, HOME: '/opt/data/home' }; delete env.GOOGLE_API_KEY; delete env.GEMINI_API_KEY;
    // pisanie bez narzędzi: tryb plan (agent nie tworzy plików i nie czeka na zgodę) — inaczej potrafił wisieć godzinę (Frasassi 2026-10-24)
    const args = ['-p', prompt, '--output-format', 'json', '--print-timeout', '600s', '--sandbox'].concat(tools ? [] : ['--mode', 'plan']);
    const p = spawn(AGY, args, { cwd: '/tmp/gq', env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '', done = false;
    // Antigravity potrafi skończyć odpowiedź i nie zakończyć procesu (Frasassi 2026-10-24: odpowiedź po 1,5 min, proces wisiał) —
    // bierzemy odpowiedź, gdy tylko przyjdzie kompletny JSON z „status”, i zamykamy proces sami
    const finish = (code) => {
      if (done) return;
      let j = null; try { j = JSON.parse(out.slice(out.indexOf('{'))); } catch {}
      if (!j && code === 'stream') return;
      done = true; clearTimeout(t);
      try { p.kill('SIGKILL'); } catch {}
      if (j?.status === 'SUCCESS' && j.response) { cost.calls++; cost.tokens = (cost.tokens ?? 0) + (j.usage?.total_tokens ?? 0); return resolve({ text: String(j.response).trim(), web: [] }); }
      reject(new Error(`${label}: Antigravity ${j?.status ?? 'kod ' + code} ${(j?.error ?? err ?? out).toString().slice(0, 300)}`));
    };
    const t = setTimeout(() => { log(`${label}: Antigravity bez odpowiedzi 6 min — przerywam`); finish('timeout'); }, 6 * 60_000);
    p.stdout.on('data', d => { out += d; if (/\}\s*$/.test(out)) finish('stream'); });
    p.stderr.on('data', d => err += d);
    p.on('close', code => finish(code));
  });
}
let SEARCH = !argv.includes('--no-search');   // darmowy klucz: wyszukiwarka Google ma limit 0 → źródła pobiera skrypt (Wikipedia + strony oficjalne)
async function gemini(prompt, { search = false, json = false, label = 'gemini' } = {}) {
  if (USE_AGY) {
    const ask = `${prompt}${json ? '\n\nODPOWIEDZ WYŁĄCZNIE POPRAWNYM JSON-em, bez komentarzy i bez bloków ```.' : ''}${search ? '' : '\n\nNie używaj wyszukiwarki ani narzędzi — pracuj tylko na materiale powyżej.'}`;
    for (let i = 1; i <= 2; i++) {   // druga próba po zawieszeniu — zwykle odpowiada w 1–3 min
      try { return await agy(ask, label + (i > 1 ? ' (ponownie)' : ''), { tools: !!search }); }
      catch (e) { log(`${label}: Antigravity nie odpowiedział (${e.message.slice(0, 160)})${i < 2 ? ' — ponawiam' : ' — zapas: klucz API'}`); }
    }
  }
  if (search && !SEARCH) throw Object.assign(new Error('wyszukiwarka niedostępna'), { noSearch: true });
  if (cost.usd >= DAILY_USD) throw new Error(`budżet ${DAILY_USD} $ wyczerpany (${cost.usd.toFixed(3)} $) — przerwane przed: ${label}`);
  const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 65536 } };
  if (search) body.tools = [{ google_search: {} }];
  if (json && !search) body.generationConfig.responseMimeType = 'application/json';
  for (let i = 1; ; i++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(e => ({ ok: false, status: 0, text: async () => e.message }));
    if (r.ok) {
      const j = await r.json();
      const u = j.usageMetadata ?? {};
      cost.calls++; cost.tokens = (cost.tokens ?? 0) + (u.totalTokenCount ?? 0); cost.usd += ((u.promptTokenCount ?? 0) * PRICE_IN + ((u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0)) * PRICE_OUT) / 1e6;
      const cand = j.candidates?.[0];
      const text = (cand?.content?.parts ?? []).map(p => p.text ?? '').join('').trim();
      if (!text) throw new Error(`${label}: pusta odpowiedź (${cand?.finishReason ?? 'brak kandydata'})`);
      // źródła z wyszukiwarki (adresy pośrednie Google) — tylko do wglądu redakcji, przypisy mają mieć adresy stron
      const web = (cand?.groundingMetadata?.groundingChunks ?? []).map(g => g.web).filter(Boolean);
      return { text, web };
    }
    const full = await r.text(), msg = full.slice(0, 300) + (/PerDay/.test(full) ? ' PerDay' : '');
    if (search && [400, 403, 429].includes(r.status)) {   // limit wyszukiwarki (free tier = 0) — nie czekamy, przechodzimy na źródła pobrane przez skrypt
      SEARCH = false; log(`${label}: wyszukiwarka Gemini niedostępna (${r.status}) — dalej źródła pobiera skrypt`);
      throw Object.assign(new Error('wyszukiwarka niedostępna'), { noSearch: true });
    }
    if (r.status === 429 && /PerDay|per_day|RequestsPerDay/i.test(msg + (r.headers?.get?.('x-quota') ?? '')))
      throw new Error(`dzienny limit darmowego Gemini wyczerpany (${MODEL}: 20 zapytań na dobę) — postęp zapisany, wznowienie od tego miejsca po odnowieniu limitu (ok. 9:00)`);
    if (i >= 3 || ![0, 429, 500, 503].includes(r.status)) throw new Error(`${label}: Gemini ${r.status} ${msg}`);
    log(`${label}: Gemini ${r.status} — ponawiam ${i + 1}/3 za ${20 * i} s`);
    await new Promise(res => setTimeout(res, 20_000 * i));
  }
}
// ── źródła pobierane przez skrypt (gdy brak wyszukiwarki): Gemini wskazuje artykuły i strony, skrypt je pobiera, Gemini pisze tylko z nich ──
const WLANG = country === 'it' ? 'it' : country === 'pl' ? 'pl' : 'en';
const plainHtml = (h) => String(h).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<footer[\s\S]*?<\/footer>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#039;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
async function wikiText(lang, title) {
  const u = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=extracts&explaintext=1&titles=${encodeURIComponent(title)}`;
  const j = await (await fetch(u, { headers: { 'User-Agent': 'QuolinoBot/1.0 (quolino.com)' } })).json().catch(() => null);
  const pg = Object.values(j?.query?.pages ?? {})[0];
  if (!pg || pg.missing !== undefined || !pg.extract) return null;
  return { url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(pg.title.replace(/ /g, '_'))}`, title: `${pg.title} — Wikipedia (${lang})`, text: pg.extract };
}
async function pageText(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (QuolinoBot; quolino.com)' }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    if (!r.ok || !/text\/html|text\/plain/.test(r.headers.get('content-type') ?? '')) return null;
    const h = await r.text(); const t = (h.match(/<title[^>]*>([^<]*)/i)?.[1] ?? url).trim();
    const text = plainHtml(h); return text.length > 300 ? { url: r.url || url, title: t, text } : null;
  } catch { return null; }
}
async function sourcesPack(topic, label, limit = 60_000) {
  const want = (await geminiJson(`Wskaż źródła do researchu: ${topic}. Kraj: ${country}.
Podaj tytuły artykułów Wikipedii (dokładne tytuły w języku ${WLANG} i po angielsku), które istnieją i opisują te miejsca, oraz adresy oficjalnych stron
(zabytek, park, gmina, diecezja, muzeum, konsorcjum, biuro turystyczne), które na pewno istnieją. Nie zgaduj adresów podstron — tylko strony główne
albo adresy, których jesteś pewien. JSON: {"wiki": [{"lang": "${WLANG}", "title": "…"}, {"lang": "en", "title": "…"}], "urls": ["https://…"]}`, `źródła ${label}`)) ?? {};
  const got = [], seen = new Set();
  for (const w of (want.wiki ?? []).slice(0, 10)) { const x = await wikiText(w.lang || WLANG, w.title); if (x && !seen.has(x.url)) { seen.add(x.url); got.push(x); } }
  for (const u of (want.urls ?? []).slice(0, 8)) { if (!/^https?:\/\//.test(u)) continue; const x = await pageText(u); if (x && !seen.has(x.url)) { seen.add(x.url); got.push(x); } }
  let left = limit;
  const body = got.map((x, i) => { const t = x.text.slice(0, Math.max(0, Math.min(left, 15_000))); left -= t.length; return t ? `=== ŹRÓDŁO ${i + 1}: ${x.title}\nURL: ${x.url}\n${t}` : ''; }).filter(Boolean).join('\n\n');
  log(`${label}: pobrane źródła ${got.length} (${got.map(x => x.url.replace(/^https?:\/\//, '').slice(0, 50)).join(', ')})`);
  writeFileSync(join(dir, `v2-sources-${label.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.txt`), body);
  return { body, list: got.map(x => ({ url: x.url, title: x.title })) };
}
// research z wyszukiwarką, a bez niej — z pakietu źródeł pobranych przez skrypt (te same pytania, przypisy tylko do tych URL)
// Research (decyzja JP 2026-10-24, wariant 1): robi CLAUDE na serwerze — szuka w sieci i OTWIERA strony, podaje tylko fakty, które na nich są.
// Gemini pisze potem tekst wyłącznie z tego materiału. --research gemini = dawna droga (wyszukiwarka Gemini albo pakiet źródeł).
const RESEARCHER = opt('--research') ?? (existsSync(AGY) && !argv.includes('--no-agy') ? 'agy' : 'claude');
async function researchCall(prompt, topic, label) {
  if (RESEARCHER === 'agy') {
    log(`${label}: research — Gemini z Google (Antigravity, AI Pro)`);
    try {
      const r = await agy(`${prompt}

ZASADY RESEARCHU (twarde):
- Szukaj w Google. Stronę, z której bierzesz fakt, OTWÓRZ i przeczytaj (nie opieraj się na samym opisie z wyników wyszukiwania).
- Przy każdym fakcie podaj DOKŁADNY URL strony, na której ten fakt jest napisany — nie stronę ogólną, nie adres wyszukiwarki.
- Tylko fakty przeczytane na stronach. Niczego nie dopisuj z pamięci. Czego nie znalazłeś — „brak — sprawdzono: <gdzie>”.
- Przy faktach ze słabszych źródeł (blog, przewodnik, tradycja lokalna) zaznacz to: „(źródło: blog)”.
- Na końcu „## Źródła” — lista URL, każdy z jednym zdaniem, co potwierdza.
- Nie twórz żadnych plików, nie uruchamiaj poleceń — odpowiedz samym tekstem (Markdown).`, label);
      if (r.text.length >= 200) return r;
      log(`${label}: Antigravity zwrócił za krótki research — zapas: Claude`);
    } catch (e) { log(`${label}: ${e.message.slice(0, 200)} — zapas: Claude`); }
  }
  if (RESEARCHER === 'agy' || RESEARCHER === 'claude') {
    log(`${label}: research — Claude (sieć, otwiera strony)`);
    const text = await claude('quolino-trip-writing', `${prompt}

ZASADY RESEARCHU (twarde):
- Szukaj w sieci (WebSearch), a KAŻDĄ stronę, z której bierzesz fakt, OTWÓRZ (WebFetch) i przeczytaj.
- Przy każdym fakcie podaj DOKŁADNY URL strony, na której ten fakt jest napisany — nie stronę ogólną o mieście, nie stronę z wyszukiwarki.
- Tylko fakty, które przeczytałeś na otwartej stronie. Niczego nie dopisuj z pamięci. Czego nie znalazłeś — „brak — sprawdzono: <gdzie>”.
- Przy faktach ze słabszych źródeł (blog, przewodnik, tradycja lokalna) zaznacz to: „(źródło: blog)”.
- Na końcu „## Źródła” — lista URL, które otworzyłeś, każdy z jednym zdaniem, co potwierdza.`, { web: true });
    if (!text || text.length < 200) throw new Error(`${label}: Claude zwrócił pusty research`);
    return { text, web: [] };
  }
  if (SEARCH) { try { return await gemini(prompt, { search: true, label }); } catch (e) { if (!e.noSearch) throw e; } }
  const pack = await sourcesPack(topic, label);
  if (!pack.list.length) throw new Error(`${label}: nie udało się pobrać żadnego źródła`);
  return gemini(`${prompt}

BEZ WYSZUKIWARKI: korzystaj WYŁĄCZNIE z tekstów źródeł poniżej. Każdy fakt przypisz do URL źródła, w którym jest (dokładnie ten URL).
Czego nie ma w tych źródłach — „brak w źródłach” (nie uzupełniaj z pamięci).

${pack.body}`, { label });
}

// research przystanku z pliku tylko, gdy zrobił go ten sam badacz (po zmianie na Claude stare pliki Gemini nie wracają)
const STOP_RESEARCH_OK = { has: (f) => { try { return readFileSync(f + '.by', 'utf8').trim() === RESEARCHER; } catch { return false; } } };
const asJson = (t) => { try { return JSON.parse(t); } catch { return extractJson(t); } };
// JSON od Gemini z naprawą: przy błędzie parsowania (np. prosty " w tekście) Gemini dostaje błąd i zwraca ten sam JSON poprawiony (najwyżej 2 razy)
async function geminiJson(prompt, label) {
  let { text } = await gemini(prompt, { json: true, label });
  for (let i = 0; ; i++) {
    try { return asJson(text); } catch (e) {
      writeFileSync(join(dir, `v2-bad-json-${label.replace(/[^a-z0-9]+/gi, '-')}-${i}.txt`), text);
      if (i >= 2) throw new Error(`${label}: niepoprawny JSON po 2 naprawach (${e.message})`);
      log(`${label}: niepoprawny JSON (${e.message}) — naprawa ${i + 1}/2`);
      ({ text } = await gemini(`Poniższy JSON nie parsuje się: ${e.message}. Zwróć DOKŁADNIE tę samą treść jako poprawny JSON — bez zmian merytorycznych,
bez skracania. Wewnątrz tekstów zamień każdy prosty cudzysłów " na „ albo ”, usuń przecinki przed } i ], domknij nawiasy.

${text}`, { json: true, label: `${label} (naprawa JSON)` }));
    }
  }
}

const RULES = `TWARDE ZASADY QUOLINO: rodzinna wycieczka piesza dla rodziców z dziećmi. NIGDY czasów dojazdu, kilometrów, minut jazdy ani godzin
wyjazdu z bazy — tylko czas zwiedzania na miejscu, godziny otwarcia, kolejność przystanków. Nie wymyślaj faktów: ceny, godziny, telefony
tylko ze źródłem, inaczej „sprawdź na miejscu”. Bez porównań do innych krajów i nacji, bez odwołań do narodowości czytelnika, bez emoji,
bez wypełniaczy („zachwyca”, „warto zobaczyć”) — zamiast przymiotnika fakt. Nazwy własne w oryginale. Przystanek 01 = parking.`;

// ── ① research miasta ─────────────────────────────────────────────────────────────────────────
async function researchCity() {
  const f = join(dir, 'research-v2.md');
  if (existsSync(f) && !FRESH && STOP_RESEARCH_OK.has(f)) { log(`${slug}: research z pliku ${f}`); return readFileSync(f, 'utf8'); }
  log(`${slug}: ① research (Gemini + Google)`);
  const { text, web } = await researchCall(`Jesteś redaktorem-researcherem Quolino. Zbierz materiał do rodzinnej wycieczki pieszej (${duration === 'full_day' ? 'cały dzień' : 'pół dnia'}):
${name} (region ${region}, kraj ${country}). Życzenia JP: ${brief || 'brak szczególnych'}.
${RULES}
Szukaj w sieci. Źródła w kolejności: oficjalne (zabytek, gmina, diecezja, muzeum, park) → Wikipedia w języku kraju → inne rzetelne.
Dla każdego kandydata na przystanek (6–10; pierwszy = parking): nazwa oryginalna, kategoria (parking, monument, museum, church, castle,
viewpoint, street, house, photo, park, icecream, sweets, restaurant), współrzędne, godziny i ceny (z datą i źródłem albo „niepotwierdzone”),
historia i ludzie („kim był/była…”), detale do oglądania z dokładnym miejscem (materiał na misję dziecka), zasady zwiedzania (bilety, wiek,
temperatura, obuwie, rezerwacja). Restauracja na finał: ocena Google ≥ 4,1 i ponad 100 opinii, telefon i strona. Punkty awaryjne: apteka,
toaleta, plac zabaw. Logika dnia: kolejność, przerwy, finał.
Legend, ciekawostek i popkultury NIE zbieraj tutaj — każdy przystanek dostanie osobny research bloków.
Każdy fakt z adresem strony (pełny URL strony, na której fakt jest). Czego nie znajdziesz — napisz „brak w źródłach”.
Wynik: Markdown, sekcja na przystanek („### nazwa”), na końcu „## Źródła” z listą URL.`, `${name} (${region}): miejsce, zabytki i atrakcje w okolicy, parking, zasady zwiedzania`, 'research miasta');
  const out = `${text}\n\n## Wyszukiwarka (adresy pośrednie Google, do wglądu)\n${(web ?? []).map(w => `- ${w.title ?? ''} ${w.uri}`).join('\n')}\n`;
  writeFileSync(f, out); writeFileSync(f + '.by', RESEARCHER);
  return out;
}

// ── ② szkic wycieczki ───────────────────────────────────────────────────────────────────────────
const SKELETON = () => `FORMAT: jeden JSON {"meta": …, "content": …}. Każdy klucz obecny; brak danych = null.
meta = {
 "doc": {"version": "v1", "generated_at": "<ISO>"},
 "city": {"slug": "${slug}", "country": "${country}", "region_slug": "${region}", "url_slug": "<nazwa lokalna, małe litery, bez diakrytyków, myślniki>", "lat": 0, "lon": 0,
          "duration_type": "${duration}", "duration_hours": 0, "bandana_color": "#RRGGBB", "wiki_article": "…", "wiki_lang": "${country === 'it' ? 'it' : 'en'}", "sort_order": 1, "status": "draft"},
 "stops": [ {"stop_key": "parking-…", "stop_number": 1, "category": "parking", "optional": false, "sunset_spot": false,
          "lat": 0, "lon": 0, "time_label": "HH:MM", "visit_duration": "<minuty>", "price": null, "price_status": "confirmed|unverified",
          "opening_hours": null, "hours_status": "confirmed|unverified", "ztl": null, "year_built": null, "wiki_article": null,
          "maps_query": "Nazwa, Miejscowość, Italia", "verify_url": "https://…", "whatsapp": null, "website": null, "phone": null,
          "rating": null, "reviews_count": null, "reservation": null, "parking_cost": null, "sources": ["https://…"]}, … ],
 "emergency": [ {"type": "pharmacy|hospital|toilet|playground", "maps_query": "…"} ]
}
content = {
 "lang": "pl",
 "city": {"title": "…", "region_label": "<sama nazwa regionu>", "subtitle": "…", "lead": "1–2 zdania z pazurem", "good_to_know": "…", "hero_note": null, "local_food": "…"},
 "stops": { "<stop_key>": {"name": "…", "desc_paragraphs": ["…", "…"], "kids_box": "misja dla dziecka: zaczyna się od czasownika, wykonalna na miejscu bez kupowania biletu",
            "hint": "podpowiedź do misji", "local_flavor": null, "practical_note": null, "dress_code": null, "photo_task": "zadanie foto"}, … },
 "day_plan": { "<stop_key>": "HH:MM — co się dzieje na miejscu", … },
 "emergency": { "1": {"label": "…", "description": "…"}, … },
 "_notes": [ {"stop_key": "…", "field": "a|b|c|d|e|f|g", "note": "czego zabrakło w researchu"} ]   (field: a dane, b opis, c misja, d wskazówka, e lokalny smak, f źródła, g uwaga)
}
stop_key: krótki, stały, małe litery i myślniki (parking-…, nazwa-zabytku). 6–10 przystanków.`;

async function writeTrip(research) {
  log(`${slug}: ② szkic wycieczki (Gemini)`);
  const trip = await geminiJson(`Napisz po polsku szkic wycieczki Quolino na podstawie researchu poniżej — WYŁĄCZNIE z faktów z researchu.
${name}, ${duration === 'full_day' ? 'cały dzień' : 'pół dnia'}. Życzenia JP: ${brief || 'brak szczególnych'}.
Rodzic dostaje plan dnia od parkingu po finał, dziecko — misję i zadanie foto na każdym przystanku.
${RULES}
${DEPTH_TEXT}
Legenda, ciekawostka, popkultura i fun fact NIE wchodzą do desc_paragraphs — powstaną w następnym kroku jako osobne bloki.
${rulesText()}
${SKELETON()}
Odpowiedz wyłącznie poprawnym JSON-em. ${JSON_QUOTE_RULE}

RESEARCH:
${research}`, 'szkic');
  if (!trip?.meta?.stops?.length || !trip?.content?.stops) throw new Error('Gemini: szkic bez przystanków albo w złym formacie');
  Object.assign(trip.meta.city, { slug, region_slug: region, country, status: 'draft' });
  trip.content.lang = 'pl';
  return trip;
}

// ── ③ bloki przystanku ───────────────────────────────────────────────────────────────────────────
async function stopBlocks(meta, pl, cityTitle) {
  const cat = meta.category;
  const tag = `${meta.stop_number} ${pl.name}`;
  const fRes = join(dir, `v2-stop-${meta.stop_number}-research.md`);
  const r = !FRESH && existsSync(fRes) && STOP_RESEARCH_OK.has(fRes) ? { text: readFileSync(fRes, 'utf8') } : await (async () => {
  log(`${slug}: ③ przystanek ${tag} (${cat}) — research bloków`);
  return researchCall(`Research bloków przystanku Quolino. Miejsce: ${pl.name} (${cat}), trasa: ${cityTitle}, ${name}, ${region}, ${country}.
Szukaj w sieci (oficjalne → Wikipedia w języku kraju → inne rzetelne). Każdy fakt z PEŁNYM URL strony, na której jest.
${researchQuestions(cat)}
Wynik: Markdown, pytanie → odpowiedź + URL albo „brak — sprawdzono: …”.`, `${pl.name} (${name}, ${region}) — historia, legendy, ciekawostki, popkultura`, `research ${tag}`); })();
  writeFileSync(fRes, r.text);
  writeFileSync(fRes + '.by', RESEARCHER);
  const write = async (fix) => {
    const raw = await geminiJson(`Napisz treść przystanku Quolino po polsku według standardu — WYŁĄCZNIE z faktów z researchu poniżej.
Przystanek: ${pl.name} (kategoria ${cat}). Trasa: ${cityTitle}.
${STANDARD}
${DEPTH_TEXT}
Opis (desc_paragraphs) przepisz z przypisami [n] na bazie obecnego opisu szkicu i researchu; legendy, ciekawostki i popkultury w opisie nie opowiadaj.
${fix ? `POPRAW BŁĘDY WALIDATORA (zmień tylko to, co trzeba):\n${fix.errors.map(e => `- ${e.block ?? ''}: ${e.problem}${e.fix ? ' → ' + e.fix : ''}`).join('\n')}\nOBECNY REKORD:\n${JSON.stringify(fix.rec)}\n` : ''}
${recordFormat(TODAY, JSON_QUOTE_RULE)}

OBECNY OPIS SZKICU:
${(pl.desc_paragraphs ?? []).join('\n\n')}

RESEARCH PRZYSTANKU:
${r.text}`, `bloki ${tag}`);
    return { rec: normalizeRecord(raw, { category: cat, today: TODAY }), gap: raw?.gap ?? null };
  };
  let w = await write(null), v = validateStop(w.rec, { category: cat });
  if (v.errors.length) {
    log(`  ${tag}: walidator ${v.errors.length} błędów — runda poprawek Gemini`);
    w = await write({ errors: v.errors, rec: w.rec }); v = validateStop(w.rec, { category: cat });
  }
  return { rec: w.rec, gap: w.gap, validator: v };
}

// ── ④b runda poprawek po kontroli Claude: Gemini usuwa albo przepisuje zdania, których źródła nie potwierdzają ──
// Nie dodaje faktów spoza researchu. Zdanie z błędnym przypisem: przypis do źródła, które ten fakt ma, albo zdanie znika.
async function fixAfterCheck(meta, pl, cityTitle, b) {
  const cat = meta.category, tag = `${meta.stop_number} ${pl.name}`;
  const fr = join(dir, `v2-stop-${meta.stop_number}-research.md`);
  const research = existsSync(fr) ? readFileSync(fr, 'utf8') : '';
  // JP 2026-10-24: ciekawostka i fun fact „z przymrużeniem oka” — błędy „brak drugiego źródła” w tych blokach pomijamy (kontrole sprzed zmiany zasady)
  const twoSrc = (e) => ['curiosity', 'fun_fact'].includes(e.block) && /dw(a|óch) niezależn|drugi\p{L}* źród|jedn\p{L}* (źródł|domen)/iu.test(`${e.problem} ${e.fix ?? ''}`);
  const errs = [...(b.check?.errors ?? []).map(e => ({ ...e, by: 'Claude' })), ...(b.validator?.errors ?? []).map(e => ({ ...e, by: 'walidator' }))].filter(e => !twoSrc(e));
  const srcNotes = (b.check?.sources_checked ?? []).map(x => `[${x.n}] ${x.ok ? 'OK' : 'NIE POTWIERDZA'}: ${x.note ?? ''}`).join('\n');
  log(`${slug}: ④b poprawki po kontroli — ${tag} (${errs.length} błędów)`);
  const raw = await geminiJson(`POPRAW treść przystanku Quolino po kontroli faktów (Claude otworzył każde źródło). Przystanek: ${pl.name} (${cat}). Trasa: ${cityTitle}.
${STANDARD}
${DEPTH_TEXT}
ZASADY POPRAWKI:
- Zdanie z faktem, którego źródło NIE potwierdza: daj przypis do innego źródła z listy, które ten fakt NAPRAWDĘ zawiera (sprawdź w researchu), albo USUŃ zdanie.
- NIE dodawaj żadnych nowych faktów spoza researchu. Lepiej krótszy tekst niż fakt bez źródła.
- Opis ma mówić o TYM miejscu (parking — o parkingu, most — o moście). Treści o innych miejscach usuń z opisu.
- Blok, z którego nic nie zostaje: null + state none z „checked” (gdzie szukano).
- Powtórzenia między blokami: fakt zostaje w jednym bloku.
- Źródła: zostaw tylko użyte, numeracja ciągła od 1.
BŁĘDY DO POPRAWY:
${errs.map(e => `- [${e.by}] ${e.block ?? ''}: ${e.problem}${e.fix ? ' → ' + e.fix : ''}`).join('\n')}
CO POTWIERDZAJĄ ŹRÓDŁA (wynik kontroli):
${srcNotes || 'brak listy'}
${recordFormat(TODAY, JSON_QUOTE_RULE)}

OBECNY REKORD:
${JSON.stringify({ marked: b.marked, state: b.state, sources: b.sources })}

RESEARCH PRZYSTANKU:
${research}`, `poprawki ${tag}`);
  const rec = normalizeRecord(raw, { category: cat, today: TODAY });
  return { rec, gap: raw?.gap ?? b.gap ?? null, validator: validateStop(rec, { category: cat }) };
}

// ── ④ kontrola Claude §5 (nic nie pisze) ───────────────────────────────────────────────────────
async function check(pl, cat, cityTitle, rec) {
  const r = await claudeJson('quolino-trip-writing', `KONTROLA TREŚCI PRZYSTANKU (docs/TRESC-PRZYSTANKU.md §5) — tylko sprawdzasz, nic nie piszesz od nowa.
Treść napisał Gemini w nowym procesie. Trasa: ${cityTitle}. Przystanek: ${pl.name} (kategoria ${cat}).
${STANDARD}
Sprawdź:
1. PRZYPISY — OTWÓRZ każde źródło (WebFetch) i sprawdź, czy fakty z jego numerem naprawdę tam są. Brak faktu = błąd. Martwy link = błąd.
   Blokada (403, paywall) przy fakcie z drugim źródłem — uwaga, nie błąd.
2. POWTÓRZENIA — ten sam fakt w dwóch blokach = błąd.
3. SENS — chronologia, sprzeczności, legenda nie jako fakt, ciekawostka zaskakuje i ma kontekst, fun fact dla 9-latka.
4. ZGŁĘBIENIE — superlatywy w opisie i legendzie z dwoma niezależnymi źródłami. Ciekawostka i fun fact „z przymrużeniem oka”: jedno źródło wystarczy (JP 2026-10-24) — brak drugiego źródła to NIE błąd.
5. Zakazy: czasy dojazdu/kilometry, porównania do krajów i nacji, fakty bez źródła, literówki.
Misja i zadanie foto — tylko uwagi (warnings, block "quest").
Odpowiedz WYŁĄCZNIE JSON-em: {"verdict": "ok"|"fix", "summary": "1–2 zdania", "errors": [{"block": "…", "problem": "…", "fix": "…"}],
 "warnings": [{"block": "…", "problem": "…"}], "sources_checked": [{"n": 1, "ok": true, "note": "…"}]}
"ok" tylko bez błędów. ${JSON_QUOTE_RULE}

MISJA: ${pl.kids_box ?? 'brak'}
ZADANIE FOTO: ${pl.photo_task ?? 'brak'}
REKORD:
${JSON.stringify(rec)}`, { web: true, rawFile: join(dir, `v2-check-${slug}-${Date.now()}.txt`) });
  return { verdict: r?.verdict === 'ok' && !(r.errors ?? []).length ? 'ok' : 'fix', summary: r?.summary ?? '',
    errors: Array.isArray(r?.errors) ? r.errors : [], warnings: Array.isArray(r?.warnings) ? r.warnings : [],
    sources_checked: Array.isArray(r?.sources_checked) ? r.sources_checked : [] };
}

// ── przebieg ─────────────────────────────────────────────────────────────────────────────────────
const c = await db();
const q = async (sql, p) => (await c.query(sql, p)).rows;
async function main() {
  const [reg] = await q('SELECT slug FROM public.regions WHERE slug = $1', [region]);
  if (!reg) throw new Error(`nie ma regionu ${region} w bazie`);
  await loadRules(q);
  await notify(channel, `🔎 ${name} — nowy proces: research i szkic pisze Gemini, fakty sprawdza Claude. Dam znać tutaj.`);

  const research = await researchCity();
  // wznowienie: przerwany przebieg (limit, błąd) zaczyna od miejsca przerwania — szkic i gotowe przystanki z plików; --fresh = od zera
  const fTrip = join(dir, 'v2-trip-gemini.json'), fBlocks = join(dir, 'v2-blocks.json');
  const resume = !FRESH && existsSync(fTrip);
  let trip = resume ? JSON.parse(readFileSync(fTrip, 'utf8')) : await writeTrip(research);
  if (resume) log(`${slug}: wznowienie — szkic z pliku, gotowe przystanki zostają`);
  writeFileSync(fTrip, JSON.stringify(trip, null, 2));
  if (!resume) await notify(channel, `✍️ ${name}: research i szkic gotowe (${trip.meta.stops.length} przystanków). Teraz bloki przystanków po kolei, potem kontrola faktów.`);
  const cityTitle = trip.content.city?.title ?? name;

  const blocks = resume && existsSync(fBlocks) ? JSON.parse(readFileSync(fBlocks, 'utf8')) : {};
  for (const m of trip.meta.stops) {
    const pl = trip.content.stops[m.stop_key];
    if (!pl) { log(`  ${m.stop_key}: brak treści PL — pomijam`); continue; }
    if (blocks[m.stop_key]) { log(`  ${m.stop_number} ${pl.name}: bloki gotowe (wznowienie)`); continue; }
    const b = await stopBlocks(m, pl, cityTitle);
    blocks[m.stop_key] = { ...b.rec, gap: b.gap, validator: b.validator };
    writeFileSync(fBlocks, JSON.stringify(blocks, null, 2));
  }
  for (const m of trip.meta.stops) {   // strona: opis bez przypisów (także dla przystanków ze wznowienia)
    const pl = trip.content.stops[m.stop_key], b = blocks[m.stop_key];
    if (pl && b?.marked?.desc_paragraphs?.length) pl.desc_paragraphs = b.marked.desc_paragraphs.map(stripRefs);
  }

  let rv = null;
  if (CHECK) {
    for (const m of trip.meta.stops) {
      const b = blocks[m.stop_key]; if (!b) continue;
      if (b.check && !FRESH) continue;   // wznowienie: kontrola już jest
      if (PRACTICAL_CATS.has(m.category) && !b.sources.length) { b.check = { verdict: 'ok', summary: 'przystanek praktyczny bez faktów do sprawdzenia', errors: [], warnings: [] }; continue; }
      log(`${slug}: ④ kontrola Claude — ${m.stop_number} ${trip.content.stops[m.stop_key].name}`);
      try { b.check = await check(trip.content.stops[m.stop_key], m.category, cityTitle, { marked: b.marked, state: b.state, sources: b.sources }); }
      catch (e) { b.check = { verdict: 'fix', summary: `kontrola nie przeszła: ${e.message.slice(0, 200)}`, errors: [], warnings: [] }; }
      writeFileSync(join(dir, 'v2-blocks.json'), JSON.stringify(blocks, null, 2));
    }
    // ④b jedna runda poprawek dla przystanków z werdyktem „fix”, potem ponowna kontrola Claude (JP 2026-10-24: do JP trafia tekst po poprawkach)
    let fixed = 0;
    for (const m of trip.meta.stops) {
      const b = blocks[m.stop_key], pl = trip.content.stops[m.stop_key];
      if (!b || !pl || b.fixRound || b.check?.verdict !== 'fix' || !(b.check.errors?.length || b.validator?.errors?.length)) continue;
      const before = { verdict: b.check.verdict, errors: (b.check.errors ?? []).length };
      try {
        const f = await fixAfterCheck(m, pl, cityTitle, b);
        Object.assign(b, f.rec, { gap: f.gap, validator: f.validator, fixRound: { before, at: new Date().toISOString() } });
        log(`${slug}: ④ kontrola Claude po poprawkach — ${m.stop_number} ${pl.name}`);
        try { b.check = await check(pl, m.category, cityTitle, { marked: b.marked, state: b.state, sources: b.sources }); }
        catch (e) { b.check = { verdict: 'fix', summary: `kontrola nie przeszła: ${e.message.slice(0, 200)}`, errors: [], warnings: [] }; }
        fixed++;
      } catch (e) { log(`  ${m.stop_number}: poprawki nie przeszły (${e.message.slice(0, 160)}) — zostaje wersja sprzed poprawek`); if (/dzienny limit/.test(e.message)) throw e; }
      writeFileSync(fBlocks, JSON.stringify(blocks, null, 2));
    }
    for (const m of trip.meta.stops) {   // opisy po poprawkach na stronę (bez przypisów)
      const pl = trip.content.stops[m.stop_key], b = blocks[m.stop_key];
      if (pl && b?.marked?.desc_paragraphs?.length) pl.desc_paragraphs = b.marked.desc_paragraphs.map(stripRefs);
    }
    const fRv = join(dir, 'v2-review.json');
    if (fixed && existsSync(fRv)) writeFileSync(fRv + '.przed-poprawkami', readFileSync(fRv)), writeFileSync(fRv, '');
    if (resume && existsSync(fRv) && readFileSync(fRv, 'utf8').trim()) { rv = JSON.parse(readFileSync(fRv, 'utf8')); log(`${slug}: kontrola trasy z pliku (wznowienie)`); }
    else {
      log(`${slug}: ④ kontrola Claude — cała trasa`);
      try { rv = await fullReview(slug, trip); writeFileSync(fRv, JSON.stringify(rv, null, 2)); }
      catch (e) { rv = { verdict: 'fix', summary: `kontrola trasy nie przeszła: ${e.message.slice(0, 200)}`, errors: [], warnings: [] }; }
    }
  }

  log(`${slug}: ⑤ zapis wersji`);
  // _notes.field: baza przyjmuje tylko a–g (a dane, b opis, c misja, d wskazówka, e lokalny smak, f źródła, g uwaga) — Gemini podaje nazwy pól
  const NOTE_FIELD = { desc_paragraphs: 'b', desc: 'b', kids_box: 'c', quest: 'c', photo_task: 'c', hint: 'd', local_flavor: 'e', sources: 'f', source: 'f' };
  trip.content._notes = (Array.isArray(trip.content._notes) ? trip.content._notes : []).filter(n => n && n.note).map(n => ({
    stop_key: n.stop_key ?? null, note: String(n.note),
    field: /^[a-g]$/.test(n.field) ? n.field : NOTE_FIELD[n.field] ?? (/hour|price|cost|ztl|phone|website|time|rating|reserv|lat|lon|maps/i.test(n.field ?? '') ? 'a' : 'g') }));
  const saved = await saveDraft(q, trip, { note: `nowe wytyczne (Gemini ${MODEL})${brief ? ': ' + brief.slice(0, 120) : ''}`, source: 'draft', changes: [], review: rv });
  await q(`UPDATE public.city_versions SET content = content || jsonb_build_object('workflow', 'v2', 'workflow_model', $3::text, 'stop_blocks_v2', $4::jsonb),
             trip = trip || jsonb_build_object('stop_blocks_v2', $4::jsonb) WHERE city_slug = $1 AND version = $2`,
    [slug, saved.version, MODEL, JSON.stringify(blocks)]);

  const lines = trip.meta.stops.map(m => {
    const b = blocks[m.stop_key]; const ck = b?.check;
    return `• ${String(m.stop_number).padStart(2, '0')} ${trip.content.stops[m.stop_key]?.name ?? m.stop_key} — ${b ? blocksLine(b) : 'brak bloków'}` +
      (ck ? ` · Claude: ${ck.verdict}${ck.errors.length ? ` (${ck.errors.length} błędów)` : ''}` : '') +
      (b?.validator?.errors?.length ? ` · walidator: ${b.validator.errors.length}` : '');
  });
  const out = { slug, version: saved.version, stops: saved.stops, model: MODEL, review: rv?.verdict ?? null, cost_usd: +cost.usd.toFixed(4), calls: cost.calls,
    preview: previewUrl(saved.token), panel: `https://admin.quolino.com/_admin/#/${slug}` };
  writeFileSync(join(dir, 'v2-last.json'), JSON.stringify(out, null, 2));
  await notify(channel, `📝 **${name} — szkic v${saved.version} · nowe wytyczne** (${saved.stops} przystanków, Gemini ${MODEL}, ${USE_AGY ? 'Antigravity / AI Pro' : BILLING ? `~${out.cost_usd} $` : 'darmowy plan, 0 $'}, ${cost.calls} zapytań)\n` +
    `${lines.join('\n')}\n${rv ? verdictLine(rv) + (rv.summary ? ` — ${rv.summary}` : '') + '\n' : ''}` +
    `Panel: ${out.panel}\nPodgląd: ${out.preview}\nUwagi w panelu albo „zatwierdzam”. Tłumaczenia dopiero po akceptacji.`);
  console.log(JSON.stringify(out, null, 2));
}

// ── poprawki JP z panelu (nowy proces) ─────────────────────────────────────────────────────────
// Uwagi pogrupowane po przystankach; Gemini poprawia tylko wskazane pola (i bloki z przypisami), Claude sprawdza zmienione przystanki,
// zapis jako nowa wersja (source revise, workflow v2), a Claude rozstrzyga, czy poprawka uczy zasady na przyszłość (editorial_rules).
async function reviseMain() {
  const comments = JSON.parse(readFileSync(opt('--comments'), 'utf8'));
  const context = opt('--context') && existsSync(opt('--context')) ? readFileSync(opt('--context'), 'utf8') : '';
  const [cur] = await q(`SELECT version, trip, content FROM public.city_versions WHERE city_slug = $1 AND status = 'draft' ORDER BY version DESC LIMIT 1`, [slug]);
  if (!cur?.trip?.meta) throw new Error(`${slug}: brak szkicu do poprawy`);
  const trip = { meta: cur.trip.meta, content: cur.trip.content };
  const blocks = cur.content?.stop_blocks_v2 ?? cur.trip.stop_blocks_v2 ?? {};
  const cityTitle = trip.content.city?.title ?? slug; name = cityTitle;
  await loadRules(q);
  const by = {};
  for (const cm of comments) (by[cm.stop_key ?? '_city'] ??= []).push(cm);
  const changes = [], summaries = [];
  const list = (cs) => cs.map(x => `- [${x.field_label ?? x.field ?? 'całość'}] ${x.body}`).join('\n');
  for (const [key, cs] of Object.entries(by)) {
    if (key === '_city') {
      log(`${slug}: poprawki — opis miasta (${cs.length})`);
      const out = await geminiJson(`Popraw opis wycieczki Quolino według uwag JP. Zmieniaj TYLKO to, czego dotyczą uwagi; resztę zostaw słowo w słowo.
${RULES}
${rulesText()}
UWAGI JP:
${list(cs)}
OBECNY OPIS MIASTA I PLAN DNIA:
${JSON.stringify({ city: trip.content.city, day_plan: trip.content.day_plan, meta_city: trip.meta.city })}
Odpowiedz JSON-em: {"city": {…tylko zmienione pola…}, "day_plan": {…tylko zmienione…}, "meta_city": {…tylko zmienione…}, "summary": "1 zdanie po polsku, co zmieniłeś"}. ${JSON_QUOTE_RULE}`, 'poprawki miasta');
      for (const [k, v] of Object.entries(out.city ?? {})) { changes.push({ path: `content.city.${k}`, before: trip.content.city[k] ?? null, after: v, why: list(cs) }); trip.content.city[k] = v; }
      for (const [k, v] of Object.entries(out.day_plan ?? {})) { changes.push({ path: `content.day_plan.${k}`, before: trip.content.day_plan?.[k] ?? null, after: v, why: list(cs) }); (trip.content.day_plan ??= {})[k] = v; }
      for (const [k, v] of Object.entries(out.meta_city ?? {})) if (!['slug', 'country', 'region_slug', 'status'].includes(k)) { changes.push({ path: `meta.city.${k}`, before: trip.meta.city[k] ?? null, after: v, why: list(cs) }); trip.meta.city[k] = v; }
      if (out.summary) summaries.push(out.summary);
      continue;
    }
    const m = trip.meta.stops.find(x => x.stop_key === key), pl = trip.content.stops[key];
    if (!m || !pl) { summaries.push(`${key}: nie ma takiego przystanku w szkicu — uwagi pominięte`); continue; }
    const b = blocks[key];
    const fr = join(dir, `v2-stop-${m.stop_number}-research.md`);
    log(`${slug}: poprawki — ${m.stop_number} ${pl.name} (${cs.length})`);
    const out = await geminiJson(`Popraw przystanek wycieczki Quolino według uwag JP. Zmieniaj TYLKO to, czego dotyczą uwagi; resztę zostaw słowo w słowo.
Uwaga do opisu, legendy, ciekawostki, popkultury albo fun factu = popraw rekord bloków (z przypisami [n], źródła z listy). Nowe fakty tylko z researchu poniżej
albo — jeśli JP sam podał fakt w uwadze — z uwagi JP (wtedy bez przypisu, opisz to w "summary").
${STANDARD}
${DEPTH_TEXT}
${RULES}
${rulesText()}
UWAGI JP:
${list(cs)}
OBECNY PRZYSTANEK:
${JSON.stringify({ meta: m, pl, record: b ? { marked: b.marked, state: b.state, sources: b.sources } : null })}
${existsSync(fr) ? `RESEARCH PRZYSTANKU:\n${readFileSync(fr, 'utf8')}` : ''}
Odpowiedz JSON-em: {"meta": {…tylko zmienione pola…}, "pl": {…tylko zmienione pola (bez desc_paragraphs, jeśli zmieniasz rekord)…},
 "record": null | {"marked": …, "state": …, "sources": …} (cały rekord, gdy zmieniasz opis albo bloki), "summary": "1 zdanie po polsku, co zmieniłeś"}. ${JSON_QUOTE_RULE}`, `poprawki ${m.stop_number}`);
    for (const [k, v] of Object.entries(out.meta ?? {})) if (k !== 'stop_key') { changes.push({ path: `meta.stops.${key}.${k}`, before: m[k] ?? null, after: v, why: list(cs) }); m[k] = v; }
    for (const [k, v] of Object.entries(out.pl ?? {})) { changes.push({ path: `content.stops.${key}.${k}`, before: pl[k] ?? null, after: v, why: list(cs) }); pl[k] = v; }
    if (out.record) {
      const rec = normalizeRecord(out.record, { category: m.category, today: TODAY });
      changes.push({ path: `blocks.${key}`, before: b ? { marked: b.marked } : null, after: { marked: rec.marked }, why: list(cs) });
      blocks[key] = { ...(b ?? {}), ...rec, validator: validateStop(rec, { category: m.category }), revisedBy: 'JP', fixRound: b?.fixRound };
      if (rec.marked.desc_paragraphs.length) pl.desc_paragraphs = rec.marked.desc_paragraphs.map(stripRefs);
      if (CHECK) {
        log(`${slug}: ④ kontrola Claude po poprawkach JP — ${m.stop_number} ${pl.name}`);
        try { blocks[key].check = await check(pl, m.category, cityTitle, rec); }
        catch (e) { blocks[key].check = { verdict: 'fix', summary: `kontrola nie przeszła: ${e.message.slice(0, 200)}`, errors: [], warnings: [] }; }
      }
    }
    if (out.summary) summaries.push(`${pl.name}: ${out.summary}`);
  }
  if (!changes.length) throw new Error('Gemini nie zaproponował żadnej zmiany — uwagi nie wskazują konkretnej poprawki');
  const fails = Object.values(blocks).filter(x => x?.check?.verdict === 'fix').length;
  const rv = { verdict: fails ? 'fix' : 'ok', summary: summaries.join(' · ').slice(0, 900), errors: [], warnings: [] };
  const saved = await saveDraft(q, trip, { note: `poprawki JP (${comments.length} uwag, nowy proces)`, source: 'revise', changes, review: rv });
  await q(`UPDATE public.city_versions SET content = content || jsonb_build_object('workflow', 'v2', 'workflow_model', $3::text, 'stop_blocks_v2', $4::jsonb),
             trip = trip || jsonb_build_object('stop_blocks_v2', $4::jsonb) WHERE city_slug = $1 AND version = $2`, [slug, saved.version, MODEL, JSON.stringify(blocks)]);
  let learned = [];
  try { learned = await learn(q, { slug, version: saved.version, say: comments.map(x => x.body).join('\n'), context, changes, trip }); }
  catch (e) { log(`zasady: ${e.message.slice(0, 160)}`); }
  const out = { slug, version: saved.version, from: cur.version, changes: changes.length, summary: rv.summary, verdict: rv.verdict, learned, preview: previewUrl(saved.token) };
  await notify(channel, `✅ **${cityTitle} — szkic v${saved.version}** po Twoich poprawkach (${changes.length} zmian${fails ? `, kontrola Claude zgłasza uwagi przy ${fails} przystankach` : ''}).\n` +
    `${rv.summary}\n${learned?.length ? `Zapamiętane zasady: ${learned.length}\n` : ''}Panel: https://admin.quolino.com/_admin/#/${slug}`);
  console.log(JSON.stringify(out, null, 2));
}

try { await (REVISE ? reviseMain() : main()); }
catch (e) { console.error('BŁĄD:', e.message); await notify(channel, `⚠️ ${name} (nowy proces): ${e.message.slice(0, 500)}`); process.exitCode = 1; }
finally { await c.end(); }
