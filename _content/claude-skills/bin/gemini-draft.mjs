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
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { claude, claudeUsage, claudeJson, extractJson, JSON_QUOTE_RULE, env, log as rawLog, db, DAILY_USD, aiUsage } from './lib.mjs';
import { WORK, DEPTH_TEXT, fullReview, saveDraft, previewUrl, notify, verdictLine } from './draft-lib.mjs';
import { loadRules, rulesText, learn } from './quality-lib.mjs';
import { triageErrors, gateErrors } from './jev.mjs';
import { stopWikidata, dist } from './wikidata.mjs';
import { validateStop, normalizeRecord, blocksLine, stripRefs, noDash, PRACTICAL_CATS, STANDARD, recordFormat, researchQuestions } from './stop-content-lib.mjs';

const argv = process.argv.slice(2);
const slug = argv[0];
const opt = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : undefined; };
// --revise --comments <plik.json> [--context <plik>]: poprawki JP z panelu do szkicu nowego procesu (wywołuje draft-comments.mjs)
const REVISE = argv.includes('--revise'), RECHECK = argv.includes('--recheck');
let name = opt('--name') ?? (REVISE || RECHECK ? slug : undefined);
const region = opt('--region') ?? (REVISE || RECHECK ? '-' : undefined), country = opt('--country') ?? 'it';
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
// ── postęp do bazy (dashboard „Postęp prac” w panelu admina, JP 2026-10-25): każdy krok = wiersz w public.pipeline_events
// z etapem, sygnaturą czasu i narastającym zużyciem tokenów (Gemini przez Antigravity, Claude przez Claude Code).
const RUN = `${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}-${process.pid}`;
// dziennik kosztów AI: za co odpowiada dane zapytanie (karta „Koszty AI”)
const CLAUDE_ROLE = { 1: 'research (zapas)', 2: 'kontrola szkicu', 3: 'kontrola przystanków', 4: 'kontrola faktów przystanków', 5: 'kontrola całej trasy', 6: 'kontrola całej trasy', 7: 'kontrola całej trasy' };
globalThis.__aiRun = RUN; globalThis.__aiCity = process.argv[2];
globalThis.__aiRole = () => CLAUDE_ROLE[STAGE] ?? 'kontrola';
const geminiRole = (label) => /research/i.test(label) ? 'research z Google' : /szkic|plan/i.test(label) ? 'pisanie szkicu' : /bloki/i.test(label) ? 'bloki przystanków'
  : /popraw|uwag/i.test(label) ? 'poprawki' : /json|napraw/i.test(label) ? 'naprawa JSON' : String(label).replace(/\d.*$/, '').trim().slice(0, 40) || 'inne';
let STOPS_N = null, STAGE = 0;
const STAGE_OF = (m) => /⑤ zapis/.test(m) ? 6 : /④c|cała trasa/.test(m) ? 5 : /④/.test(m) ? 4 : /③|bloki /.test(m) ? 3 : /②/.test(m) ? 2 : /①|research miasta/.test(m) ? 1 : /poprawki — /.test(m) && REVISE ? 8 : null;
let WORK_LABEL = null;   // wersja, nad którą trwa praca (v5b) — dashboard pokazuje ją na karcie
function event(msg, { stage = null, status = 'running' } = {}) {
  if (WORK_LABEL && !/^\[v\d/.test(msg)) msg = `[${WORK_LABEL}] ${msg}`;
  const st = stage ?? STAGE_OF(msg); if (st) STAGE = Math.max(STAGE, st);
  const k = +(msg.match(/(?:przystanek|kontrola Claude(?: po poprawkach[^—]*)? —|poprawki(?: po kontroli)? —) (\d+)/)?.[1] ?? 0) || null;
  const q2 = globalThis.__q; if (!q2) return;
  q2(`INSERT INTO public.pipeline_events (run_id, city_slug, kind, stage, stop_k, stops_n, message, status, gemini_tokens, gemini_calls, claude_tokens, claude_calls)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [RUN, slug, REVISE || RECHECK ? 'revise' : 'draft', st ?? STAGE, k, STOPS_N, msg.slice(0, 400), status, cost.tokens ?? 0, cost.calls,
     claudeUsage.input + claudeUsage.output, claudeUsage.calls]).catch(() => {});
}
const log = (...a) => { lastStep = Date.now(); lastMsg = a.map(String).join(' ').slice(0, 200); rawLog(...a); event(lastMsg); };
// zatrzymanie procesu (kill, restart) = wpis „przerwane” na dashboardzie, zamiast wiszącego „stoi ≥ 15 min” (JP 2026-10-25)
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { event('przerwane: proces zatrzymany', { status: 'stopped' }); setTimeout(() => process.exit(143), 1500); });
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
let USE_AGY = !argv.includes('--no-agy') && existsSync(AGY), AGY_QUOTA = argv.includes('--claude-writes');
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
      if (j?.status === 'SUCCESS' && j.response) { cost.calls++; cost.tokens = (cost.tokens ?? 0) + (j.usage?.total_tokens ?? 0);
        aiUsage({ provider: 'gemini', model: 'Antigravity (AI Pro)', role: geminiRole(label), billing: 'abonament', tin: j.usage?.input_tokens ?? j.usage?.prompt_tokens ?? j.usage?.total_tokens ?? 0, tout: j.usage?.output_tokens ?? j.usage?.completion_tokens ?? 0 });
        return resolve({ text: String(j.response).trim(), web: [] }); }
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
      catch (e) {
        // limit AI Pro wyczerpany (JP 2026-10-26): bez ponawiania, do końca przebiegu pisze Claude (abonament), a nie darmowy klucz (20 zapytań/dobę)
        if (/quota reached|upgrade your subscription|RESOURCE_EXHAUSTED/i.test(e.message)) { USE_AGY = false; AGY_QUOTA = true; log(`${label}: limit Antigravity (AI Pro) wyczerpany — dalej pisze Claude`); break; }
        log(`${label}: Antigravity nie odpowiedział (${e.message.slice(0, 160)})${i < 2 ? ' — ponawiam' : ' — zapas: klucz API'}`);
      }
    }
  }
  if (AGY_QUOTA && !search && env('QUOLINO_CLAUDE_FALLBACK') !== '0') {
    const text = await claude('quolino-trip-writing', `${prompt}${json ? '\n\nODPOWIEDZ WYŁĄCZNIE POPRAWNYM JSON-em, bez komentarzy i bez bloków ```.' : ''}\n\nNie używaj wyszukiwarki — pracuj tylko na materiale powyżej.`);
    return { text: String(text ?? '').trim(), web: [] };
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
      const usd1 = ((u.promptTokenCount ?? 0) * PRICE_IN + ((u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0)) * PRICE_OUT) / 1e6;
      cost.calls++; cost.tokens = (cost.tokens ?? 0) + (u.totalTokenCount ?? 0); cost.usd += usd1;
      aiUsage({ provider: 'gemini', model: `${MODEL} (klucz API)`, role: geminiRole(label), billing: BILLING ? 'api' : 'darmowe', tin: u.promptTokenCount ?? 0, tout: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0), usd: usd1 });
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
bez wypełniaczy („zachwyca”, „warto zobaczyć”) — zamiast przymiotnika fakt. Nazwy własne w oryginale. Przystanek 01 = parking.
Tekst ma brzmieć naturalnie, jak pisany przez człowieka: NIE używaj długiej pauzy „—” ani półpauzy „–”; zamiast nich zwykły łącznik „-”,
przecinek albo nowe zdanie.`;

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
  // twarde dane z Wikidata (bez AI): daty, autorzy, patron, styl, ochrona, strona oficjalna — pewne fakty z URL (JP 2026-10-26)
  if (!/## Pewne dane \(Wikidata\)/.test(r.text)) try {
    const wd = await stopWikidata(meta, { lang: meta.wiki_lang || (country === 'it' ? 'it' : 'en'), name: pl.name, near: meta.lat && meta.lon ? { lat: +meta.lat, lon: +meta.lon } : null });
    if (wd?.lines?.length) { r.text = `## Pewne dane (Wikidata ${wd.qid}: ${wd.label})\n${wd.lines.join('\n')}\n\n${r.text}`; log(`${slug}: ${tag} — Wikidata ${wd.qid}: ${wd.lines.length} pewnych danych`); }
  } catch (e) { log(`${tag}: Wikidata niedostępna (${e.message.slice(0, 80)})`); }
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
  let w = await write(null), v = validateStop(w.rec, { category: cat, thin: w.gap });
  if (v.errors.length) {
    log(`  ${tag}: walidator ${v.errors.length} błędów — runda poprawek Gemini`);
    w = await write({ errors: v.errors, rec: w.rec }); v = validateStop(w.rec, { category: cat, thin: w.gap });
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
  return { rec, gap: raw?.gap ?? b.gap ?? null, validator: validateStop(rec, { category: cat, thin: raw?.gap ?? b.gap }) };
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
globalThis.__q = q;
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
  STOPS_N = trip.meta.stops.length;
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
      try { await pinCheck(trip).catch(() => {}); fixSchedule(trip); rv = await fullReview(slug, trip); writeFileSync(fRv, JSON.stringify(rv, null, 2)); }
      catch (e) { rv = { verdict: 'fix', summary: `kontrola trasy nie przeszła: ${e.message.slice(0, 200)}`, errors: [], warnings: [] }; }
    }
    // ④c pętla: poprawki po kontroli CAŁEJ trasy → ponowna kontrola, najwyżej 3 rundy (JP 2026-10-25) — do JP trafia tekst po poprawkach
    const fRv2 = join(dir, 'v2-review-po-poprawkach.json');
    if (resume && existsSync(fRv2)) { rv = JSON.parse(readFileSync(fRv2, 'utf8')); log(`${slug}: kontrola po poprawkach z pliku (wznowienie)`); }
    else rv = await fixLoop(trip, blocks, cityTitle, rv, () => { writeFileSync(fBlocks, JSON.stringify(blocks, null, 2)); writeFileSync(fTrip, JSON.stringify(trip, null, 2)); });
    writeFileSync(fRv2, JSON.stringify(rv, null, 2));
  }

  log(`${slug}: ⑤ zapis wersji`);
  // _notes.field: baza przyjmuje tylko a–g (a dane, b opis, c misja, d wskazówka, e lokalny smak, f źródła, g uwaga) — Gemini podaje nazwy pól
  const NOTE_FIELD = { desc_paragraphs: 'b', desc: 'b', kids_box: 'c', quest: 'c', photo_task: 'c', hint: 'd', local_flavor: 'e', sources: 'f', source: 'f' };
  // luki z bloków przystanków (gap) → notatka redakcyjna „ZA MAŁO MATERIAŁU” (niewidoczna dla użytkownika; walidator wtedy nie blokuje krótszego opisu)
  trip.content._notes = Array.isArray(trip.content._notes) ? trip.content._notes : [];
  for (const [k, b] of Object.entries(blocks)) if (b?.gap && !trip.content._notes.some(n => n?.stop_key === k && /ZA MAŁO MATERIAŁU/.test(n.note ?? '')))
    trip.content._notes.push({ stop_key: k, field: 'b', note: `ZA MAŁO MATERIAŁU: ${String(b.gap).slice(0, 400)}` });
  trip.content._notes = trip.content._notes.filter(n => n && n.note).map(n => ({
    stop_key: n.stop_key ?? null, note: String(n.note),
    field: /^[a-g]$/.test(n.field) ? n.field : NOTE_FIELD[n.field] ?? (/hour|price|cost|ztl|phone|website|time|rating|reserv|lat|lon|maps/i.test(n.field ?? '') ? 'a' : 'g') }));
  // bez „—” i „–” (JP 2026-10-25) — mechanicznie, w całej treści i w blokach
  trip.content = noDash(trip.content); for (const k of Object.keys(blocks)) if (blocks[k]?.marked) blocks[k].marked = noDash(blocks[k].marked);
  const saved = await saveDraft(q, trip, { note: `nowe wytyczne (Gemini ${MODEL})${brief ? ': ' + brief.slice(0, 120) : ''}`, source: 'draft', changes: [], review: rv });
  await q(`UPDATE public.city_versions SET content = content || jsonb_build_object('workflow', 'v2', 'workflow_model', $3::text, 'stop_blocks_v2', $4::jsonb),
             trip = trip || jsonb_build_object('stop_blocks_v2', $4::jsonb) WHERE city_slug = $1 AND version = $2`,
    [slug, saved.version, MODEL, JSON.stringify(blocks)]);
  const gl = await guidelinesVersion();
  await stampGuidelines(saved.version, gl, rv?.verdict === 'ok');

  const lines = trip.meta.stops.map(m => {
    const b = blocks[m.stop_key]; const ck = b?.check;
    return `• ${String(m.stop_number).padStart(2, '0')} ${trip.content.stops[m.stop_key]?.name ?? m.stop_key} — ${b ? blocksLine(b) : 'brak bloków'}` +
      (ck ? ` · Claude: ${ck.verdict}${ck.errors.length ? ` (${ck.errors.length} błędów)` : ''}` : '') +
      (b?.validator?.errors?.length ? ` · walidator: ${b.validator.errors.length}` : '');
  });
  const out = { slug, version: saved.version, stops: saved.stops, model: MODEL, review: rv?.verdict ?? null, cost_usd: +cost.usd.toFixed(4), calls: cost.calls,
    preview: previewUrl(saved.token), panel: `https://admin.quolino.com/_admin/#/${slug}` };
  writeFileSync(join(dir, 'v2-last.json'), JSON.stringify(out, null, 2));
  event(`gotowe: szkic v${saved.version} · wytyczne ${gl ?? '?'} · ${rv?.verdict === 'ok' ? 'kontrola bez uwag' : `kontrola: ${rv?.errors?.length ?? 0} uwag`}`, { stage: 7, status: 'done' });
  await notify(channel, `📝 **${name} — szkic v${saved.version} · wytyczne ${gl ?? '?'}${rv?.verdict === 'ok' ? ' ✓' : ' (kontrola zgłasza uwagi)'}**`
    + (rv?.before ? ` · błędy całej trasy: ${rv.before.errors} → ${rv.errors?.length ?? 0} po poprawkach` : '') + ` \n(${saved.stops} przystanków, Gemini ${MODEL}, ${USE_AGY ? 'Antigravity / AI Pro' : BILLING ? `~${out.cost_usd} $` : 'darmowy plan, 0 $'}, ${cost.calls} zapytań)\n` +
    `${lines.join('\n')}\n${rv ? verdictLine(rv) + (rv.summary ? ` — ${rv.summary}` : '') + '\n' : ''}` +
    `Panel: ${out.panel}\nPodgląd: ${out.preview}\nUwagi w panelu albo „zatwierdzam”. Tłumaczenia dopiero po akceptacji.`);
  console.log(JSON.stringify(out, null, 2));
}

// ── wersje wytycznych (JP 2026-10-24) ─────────────────────────────────────────────────────────
// Wytyczne = standard treści (STANDARD, głębokość opisu, twarde zasady) + aktywne zasady redakcyjne JP (editorial_rules).
// Każda zmiana któregokolwiek z nich = nowa wersja (v01, v02, …) w public.guideline_versions. Wersja szkicu, która przeszła kontrolę
// i poprawki, dostaje content.guidelines = 'vNN' (+ guidelines_ok = werdykt końcowy) — za dwa lata filtr „starsze niż v51” pokaże,
// które wycieczki uzupełnić.
async function guidelinesVersion() {
  const hash = createHash('sha1').update([STANDARD, DEPTH_TEXT, RULES, rulesText()].join('\n---\n')).digest('hex').slice(0, 16);
  try {
    const [last] = await q('SELECT version, label, hash FROM public.guideline_versions ORDER BY version DESC LIMIT 1');
    if (last && (last.hash == null || last.hash === hash)) {
      if (last.hash == null) await q('UPDATE public.guideline_versions SET hash = $2 WHERE version = $1', [last.version, hash]);
      return last.label;
    }
    const v = (last?.version ?? 0) + 1, label = 'v' + String(v).padStart(2, '0');
    await q(`INSERT INTO public.guideline_versions (version, label, hash, note) VALUES ($1, $2, $3, $4)`,
      [v, label, hash, 'automatycznie: zmiana standardu treści albo zasad redakcyjnych JP']);
    log(`wytyczne: nowa wersja ${label}`);
    return label;
  } catch (e) { log(`wytyczne: brak tabeli guideline_versions (${e.message.slice(0, 80)}) — bez oznaczenia`); return null; }
}
const stampGuidelines = async (version, label, ok) => label && q(`UPDATE public.city_versions SET content = content || jsonb_build_object('guidelines', $3::text, 'guidelines_ok', $4::boolean)
  WHERE city_slug = $1 AND version = $2`, [slug, version, label, !!ok]);

// ── podmiany wskazane przez kontrolę Claude: {old, new} w tekście przystanku (albo opisu miasta) i w jego blokach ──
// Dopasowanie dosłowne, potem bez różnic w spacjach i cudzysłowach; w blokach z przypisami [n] także z pominięciem przypisów.
const MIN_DESC_WORDS = 300;
function applyReplacements(trip, blocks, errors) {
  const done = new Set(), changes = [];
  const norm = (t) => t.replace(/[„”"«»]/g, '"').replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ch = (c) => c === '"' ? '[„”"«»]' : c === "'" ? "['’‘]" : /[.,;:!?]/.test(c) ? '(?:\\s*\\[\\d+\\])*' + esc(c) : esc(c);
  const loose = (old) => new RegExp(norm(old).trim().split(' ').map(w => [...w].map(ch).join('')).join('(?:\\s+|\\s*\\[\\d+\\]\\s*)'));
  const tidy = (t) => t.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').replace(/\.\s*\./g, '.').trim();
  const walk = (o, fn) => { if (typeof o === 'string') return fn(o); if (Array.isArray(o)) return o.map(x => walk(x, fn)).filter(x => x !== ''); if (o && typeof o === 'object') { for (const k of Object.keys(o)) o[k] = walk(o[k], fn); return o; } return o; };
  errors.forEach((e, i) => {
    if (typeof e.old !== 'string' || e.old.trim().length < 6 || typeof e.new !== 'string') return;
    const sk = e.stop_key ?? null, re = loose(e.old);
    const targets = sk ? [[trip.content.stops, sk], [blocks?.[sk] ?? {}, 'marked']] : [[trip.content, 'city']];
    let hit = false;
    const snap = targets.map(([obj, key]) => obj?.[key] != null ? JSON.stringify(obj[key]) : null);
    const words = () => (sk ? trip.content.stops?.[sk]?.desc_paragraphs ?? [] : []).join(' ').split(/\s+/).filter(Boolean).length;
    const w0 = words();
    for (const [obj, key] of targets) if (obj?.[key] != null) obj[key] = walk(obj[key], (t) => {
      if (!re.test(t)) return t;
      hit = true; return tidy(t.replace(re, e.new));
    });
    // opis zabytku nie może przez wycięcie spaść poniżej minimum walidatora (Frasassi v5d, JP 2026-10-25) — wtedy cofamy i oddajemy do przepisania
    const cat = sk ? trip.meta?.stops?.find(x => x.stop_key === sk)?.category : null;
    if (hit && sk && !PRACTICAL_CATS.has(cat) && words() < w0 && words() < MIN_DESC_WORDS) {
      targets.forEach(([obj, key], j) => { if (snap[j] != null) obj[key] = JSON.parse(snap[j]); });
      hit = false;
    }
    if (hit) { done.add(i); changes.push({ path: sk ? `stops.${sk}` : 'city', before: e.old, after: e.new, why: String(e.problem).slice(0, 200), auto: true }); }
  });
  return { done, changes };
}

// ── plan dnia poprawiany kodem (JP 2026-10-26): godziny dotarcia rosną, starcza czasu na przejście, day_plan = time_label,
// duration_hours/duration_type z planu. Te same progi co walidator (pieszo 3 km/h, >2 km auto 40 km/h + 10 min). Bez AI.
function fixSchedule(trip) {
  const mins = (t) => { const m = String(t ?? '').match(/^(\d{1,2}):(\d{2})$/); return m ? +m[1] * 60 + +m[2] : null; };
  const hhmm = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  const visit = (s) => +(String(s.visit_duration ?? '').match(/\d+/)?.[0] ?? NaN);
  const km = (a, b) => (a.lat == null || b.lat == null) ? 0 : dist({ lat: +a.lat, lon: +a.lon }, { lat: +b.lat, lon: +b.lon }) / 1000 * 1.3;
  const st = (trip.meta.stops ?? []).filter(s => !s.optional), changes = [];
  for (let i = 1; i < st.length; i++) {
    const a = st[i - 1], b = st[i], ta = mins(a.time_label), tb = mins(b.time_label), va = visit(a);
    if (ta == null || tb == null || !Number.isFinite(va)) continue;
    const d = km(a, b), need = d <= 2 ? Math.round(d / 3 * 60) : Math.round(d / 40 * 60) + 10;
    if (tb - (ta + va) < need - 5) { const nt = Math.ceil((ta + va + need) / 5) * 5; changes.push({ path: `meta.stops.${b.stop_key}.time_label`, before: b.time_label, after: hhmm(nt), why: 'plan dnia: za mało czasu na przejście (kod)', auto: true }); b.time_label = hhmm(nt); }
  }
  const dp = trip.content.day_plan;
  if (dp && typeof dp === 'object') for (const s of st) {
    const line = dp[s.stop_key]; const m = String(line ?? '').match(/^\s*(\d{1,2}:\d{2})/);
    if (m && s.time_label && mins(m[1]) !== mins(s.time_label)) { dp[s.stop_key] = String(line).replace(m[1], s.time_label); changes.push({ path: `content.day_plan.${s.stop_key}`, before: m[1], after: s.time_label, why: 'plan dnia = godzina dotarcia (kod)', auto: true }); }
  }
  const ts = st.map(s => [mins(s.time_label), visit(s)]).filter(([t]) => t != null);
  if (ts.length && trip.meta.city) {
    const span = (ts.at(-1)[0] + (Number.isFinite(ts.at(-1)[1]) ? ts.at(-1)[1] : 0) - ts[0][0]) / 60, want = Math.round(span * 2) / 2;
    if (typeof trip.meta.city.duration_hours === 'number' && Math.abs(trip.meta.city.duration_hours - span) > 0.75) { changes.push({ path: 'meta.city.duration_hours', before: String(trip.meta.city.duration_hours), after: String(want), why: 'czas trasy z planu (kod)', auto: true }); trip.meta.city.duration_hours = want; }
    const type = span <= 5 ? 'half_day' : 'full_day';
    if (trip.meta.city.duration_type && trip.meta.city.duration_type !== type) { changes.push({ path: 'meta.city.duration_type', before: trip.meta.city.duration_type, after: type, why: 'rodzaj trasy z planu (kod)', auto: true }); trip.meta.city.duration_type = type; }
  }
  if (changes.length) log(`${slug}: plan dnia poprawiony kodem: ${changes.length} zmian`);
  return changes;
}

// ── pinezki: współrzędne przystanków porównane z Wikidata (kod, bez AI); różnica > 300 m → poprawka automatyczna ──
async function pinCheck(trip) {
  const changes = [];
  for (const m of trip.meta.stops ?? []) {
    if (!m.wiki_article || m.lat == null || m.lon == null) continue;
    const wd = await stopWikidata(m, { lang: m.wiki_lang || (country === 'it' ? 'it' : 'en') }).catch(() => null);
    if (!wd?.coord) continue;
    const d = dist({ lat: +m.lat, lon: +m.lon }, wd.coord);
    if (d > 300) { changes.push({ path: `meta.stops.${m.stop_key}.lat/lon`, before: `${m.lat}, ${m.lon}`, after: `${wd.coord.lat.toFixed(5)}, ${wd.coord.lon.toFixed(5)}`, why: `pinezka ${Math.round(d)} m od miejsca wg Wikidata ${wd.qid}`, auto: true });
      m.lat = +wd.coord.lat.toFixed(5); m.lon = +wd.coord.lon.toFixed(5); }
  }
  if (changes.length) log(`${slug}: pinezki poprawione wg Wikidata: ${changes.length}`);
  return changes;
}

// ── dopytanie (JP 2026-10-26): „krótkie zapytanie, krótka odpowiedź” zamiast przepisywania przystanku ──
// Model dostaje TYLKO teksty pól, których dotyczą uwagi, uwagę i (gdy trzeba faktu) wycinek researchu tego przystanku.
// Zwraca dosłowny fragment + zamiennik (najwyżej 2 zdania) albo ustawienie pola liczbowego; podmianę robi kod (applyReplacements).
// Jedno wywołanie na całą rundę. Czego nie da się poprawić bez nowego faktu spoza materiału — zostaje do decyzji JP.
const META_SET = /^meta\.(stops\.\d+\.(time_label|visit_duration|lat|lon|opening_hours)|city\.(duration_hours|duration_type))$/;
function stopTexts(trip, sk) {
  const out = [];
  const add = (path, v) => { if (typeof v === 'string' && v.trim()) out.push({ path, text: v }); else if (Array.isArray(v)) v.forEach((x, i) => add(`${path}[${i}]`, x)); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) add(`${path}.${k}`, x); };
  if (sk) { add(`content.stops.${sk}`, trip.content.stops?.[sk]); add(`content.day_plan.${sk}`, trip.content.day_plan?.[sk]);
    const i = trip.meta.stops.findIndex(x => x.stop_key === sk); if (i >= 0) { const m = trip.meta.stops[i]; out.push({ path: `meta.stops.${i}`, text: JSON.stringify({ time_label: m.time_label, visit_duration: m.visit_duration, lat: m.lat, lon: m.lon, opening_hours: m.opening_hours }) }); } }
  else { add('content.city', trip.content.city); out.push({ path: 'meta.city', text: JSON.stringify({ duration_hours: trip.meta.city?.duration_hours, duration_type: trip.meta.city?.duration_type }) });
    out.push({ path: 'meta.stops', text: JSON.stringify(trip.meta.stops.map((m, i) => ({ i, key: m.stop_key, time_label: m.time_label, visit_duration: m.visit_duration }))) }); add('content.day_plan', trip.content.day_plan); }
  return out;
}
function researchSnippet(trip, sk, problem) {
  const m = sk ? trip.meta.stops.find(x => x.stop_key === sk) : null;
  const f = m ? join(dir, `v2-stop-${m.stop_number}-research.md`) : join(dir, 'research.md');
  if (!existsSync(f)) return '';
  const words = [...new Set(String(problem).toLowerCase().match(/\p{L}{5,}/gu) ?? [])];
  const paras = readFileSync(f, 'utf8').split(/\n\s*\n/).map(t => ({ t, n: words.filter(w => t.toLowerCase().includes(w)).length })).filter(x => x.n).sort((a, b) => b.n - a.n);
  return paras.slice(0, 3).map(x => x.t.slice(0, 700)).join('\n\n');
}
async function microFix(trip, blocks, errors) {
  if (!errors.length) return { done: new Set(), changes: [] };
  const items = errors.map((e, id) => ({ id, stop_key: e.stop_key ?? null, problem: String(e.problem).slice(0, 400), hint: e.fix ? String(e.fix).slice(0, 300) : undefined,
    material: researchSnippet(trip, e.stop_key ?? null, e.problem) || undefined }));
  // teksty raz na przystanek (kilka uwag do jednego przystanku nie powtarza jego treści)
  const TEXTS = {}; for (const it of items) TEXTS[it.stop_key ?? 'trasa'] ??= stopTexts(trip, it.stop_key).map(t => ({ path: t.path, text: t.text.slice(0, 1500) })).slice(0, 30);
  log(`${slug}: dopytanie — ${items.length} krótkich poprawek w jednym zapytaniu`);
  const out = await geminiJson(`Krótkie poprawki tekstu wycieczki Quolino (rodzinny przewodnik). Dla KAŻDEJ uwagi podaj jedną z odpowiedzi:
A) {"id": N, "quote": "fragment skopiowany ZNAK W ZNAK z jednego z tekstów", "replace": "poprawiony fragment, najwyżej 2 zdania; \"\" = usuń"}
B) dla pól liczbowych i godzin w meta: {"id": N, "path": "meta.stops.<i>.time_label" albo "meta.city.duration_hours" itp., "value": nowa wartość}
C) {"id": N, "skip": "dlaczego nie da się poprawić bez nowego faktu"} — gdy poprawka wymaga faktu, którego nie ma w MATERIALE ani w tekstach.
Zasady: zmieniaj najmniej, jak się da (fragment = zdanie albo jego część). Nowe fakty WYŁĄCZNIE z pola "material". Bez długich myślników „—” i „–”.
Polszczyzna naturalna. Nie przepisuj całych akapitów. Odpowiedz wyłącznie JSON-em: {"fixes": [ … ]}. ${JSON_QUOTE_RULE}
TEKSTY (wg przystanku; „trasa” = opis i plan całej trasy):
${JSON.stringify(TEXTS)}
UWAGI:
${JSON.stringify(items)}`, 'dopytanie');
  const fixes = Array.isArray(out?.fixes) ? out.fixes : [];
  const done = new Set(), changes = [], subs = [];
  for (const f of fixes) {
    const e = errors[f.id]; if (!e) continue;
    if (f.path && META_SET.test(f.path) && f.value != null) {
      const ks = f.path.split('.'), last = ks.pop(); let o = trip; for (const k of ks) o = o?.[/^\d+$/.test(k) ? +k : k];
      if (o && last in o) { changes.push({ path: f.path, before: String(o[last]), after: String(f.value), why: String(e.problem).slice(0, 200), auto: true }); o[last] = f.value; done.add(f.id); }
    } else if (typeof f.quote === 'string' && typeof f.replace === 'string') subs.push({ i: f.id, err: { ...e, old: f.quote, new: f.replace } });
  }
  const r2 = applyReplacements(trip, blocks, subs.map(x => x.err));
  [...r2.done].forEach(j => done.add(subs[j].i));
  changes.push(...r2.changes);
  log(`${slug}: dopytanie — poprawione ${done.size} z ${errors.length}, bez materiału ${fixes.filter(f => f.skip).length}`);
  return { done, changes };
}

// ── ④c pętla poprawek po kontroli całej trasy: poprawki → kontrola, dopóki są błędy i ich liczba spada (najwyżej MAX_ROUNDS) ──
const MAX_ROUNDS = +(opt('--rounds') ?? 1);   // JP 2026-10-25: jedna runda poprawek, potem próg i do JP
async function fixLoop(trip, blocks, cityTitle, rv, persist, onRound, labelOf) {
  const first = rv, history = [{ round: 0, errors: rv?.errors?.length ?? 0, facts: rv?.facts ?? null }];
  for (let round = 1; round <= MAX_ROUNDS && rv?.errors?.length; round++) {
    if (labelOf) WORK_LABEL = labelOf(round);
    log(`${slug}: ④c poprawki po kontroli całej trasy — runda ${round}/${MAX_ROUNDS} (${rv.errors.length} błędów)`);
    if (round === 1) await notify(channel, `🔧 ${name}: kontrola całej trasy — ${rv.errors.length} błędów. Poprawiam i sprawdzam w rundach (najwyżej ${MAX_ROUNDS}), zanim trafi do Ciebie.`);
    // 1) podmiany wskazane przez kontrolę (old → new): skrypt, zero tokenów; 2) reszta przez Gemini (tylko to, czego nie da się podmienić)
    const before = rv.errors.length;
    // 0) Jev rozdziela: drobiazg → ostrzeżenie (nie poprawiamy), podmiana → skrypt, przepisanie → Gemini
    // próg NA POCZĄTKU (JP 2026-10-26): nie wydajemy tokenów na poprawianie drobiazgów — od razu do ostrzeżeń dla JP
    { const g0 = await gateErrors(rv.errors); if (g0.soft.length) { rv.warnings = [...(rv.warnings ?? []), ...g0.soft.map(e => ({ ...e, problem: `[nie blokuje] ${e.problem}` }))]; rv.errors = g0.block; log(`${slug}: próg przed poprawkami — ${g0.block.length} blokuje, ${g0.soft.length} do ostrzeżeń`); } }
    if (!rv.errors.length) break;
    const tri = await triageErrors(rv.errors);
    const minor = tri ? rv.errors.filter((_, i) => tri[i] === 'drobiazg') : [];
    if (minor.length) { rv.warnings = [...(rv.warnings ?? []), ...minor.map(e => ({ ...e, problem: `[drobiazg] ${e.problem}` }))];
      rv.errors = rv.errors.filter((_, i) => tri[i] !== 'drobiazg'); }
    const mech = applyReplacements(trip, blocks, rv.errors);
    const rest = rv.errors.filter((_, i) => !mech.done.has(i));
    log(`${slug}: ${tri ? `Jev: drobiazgi ${minor.length} (do ostrzeżeń) · ` : ''}poprawki bez modelu: ${mech.done.size} · do Gemini: ${rest.length}`);
    // reszta: dopytanie (krótko), nie przepisywanie przystanku (JP 2026-10-26)
    let mf = { done: new Set(), changes: [] };
    try { mf = await microFix(trip, blocks, rest); } catch (e) { log(`${slug}: dopytanie nie wyszło (${e.message.slice(0, 160)}) — błędy zostają do decyzji JP`); }
    const ap = { changes: [...mech.changes, ...mf.changes], summaries: [] };
    persist?.();
    log(`${slug}: ④ kontrola Claude — cała trasa po rundzie ${round} (${ap.changes.length} zmian)`);
    let next;
    try { await pinCheck(trip).catch(() => {}); fixSchedule(trip); next = await fullReview(slug, trip); } catch (e) { next = { verdict: 'fix', summary: `kontrola trasy nie przeszła: ${e.message.slice(0, 200)}`, errors: rv.errors, warnings: [] }; }
    history.push({ round, errors: next.errors?.length ?? 0, facts: next.facts ?? null, changes: ap.changes.length });
    const better = (next.errors?.length ?? 0) < before;
    rv = next;
    if (onRound) { next.before = { errors: first?.errors?.length ?? 0, warnings: (first?.warnings ?? []).length, facts: first?.facts ?? null }; next.rounds = history.slice(); await onRound(round, next, ap); }
    if (!better) { log(`${slug}: runda ${round} nie zmniejszyła liczby błędów — koniec pętli`); break; }
  }
  rv.before = { errors: first?.errors?.length ?? 0, warnings: (first?.warnings ?? []).length, facts: first?.facts ?? null };
  rv.rounds = history;
  // próg: zostają tylko błędy blokujące, reszta → ostrzeżenia (nie zatrzymują wersji)
  const g = await gateErrors(rv.errors ?? []);
  if (g.soft.length) log(`${slug}: próg — ${g.block.length} blokuje, ${g.soft.length} do ostrzeżeń`);
  rv.warnings = [...(rv.warnings ?? []), ...g.soft.map(e => ({ ...e, problem: `[nie blokuje] ${e.problem}` }))];
  rv.errors = g.block; rv.verdict = g.block.length ? 'fix' : 'ok';
  if (history.length) history[history.length - 1].blocking = g.block.length;
  return rv;
}

// ── ponowna kontrola i poprawki istniejącego szkicu nowego procesu (--recheck), np. po zmianie wytycznych ──
async function recheckMain() {
  const from = opt('--from') ? +String(opt('--from')).replace(/\D/g, '') : null;   // --from 8: start od wskazanej wersji (np. najlepszej v5c)
  const [cur] = from ? await q(`SELECT version, trip, content, review FROM public.city_versions WHERE city_slug = $1 AND version = $2`, [slug, from])
    : await q(`SELECT version, trip, content, review FROM public.city_versions WHERE city_slug = $1 AND status = 'draft' ORDER BY version DESC LIMIT 1`, [slug]);
  if (!cur?.trip?.meta) throw new Error(`${slug}: brak szkicu`);
  const trip = { meta: cur.trip.meta, content: cur.trip.content };
  const blocks = cur.content?.stop_blocks_v2 ?? cur.trip.stop_blocks_v2 ?? {};
  const cityTitle = trip.content.city?.title ?? slug; name = cityTitle; STOPS_N = trip.meta.stops.length;
  await loadRules(q);
  // --patch '[{"find":"…","replace":"…"}]': ręczne poprawki dosłowne (JP/Claude) przed kontrolą — w treści, meta i blokach (JP 2026-10-25)
  const PATCH = opt('--patch') ? JSON.parse(opt('--patch')) : null, patchChanges = [];
  if (PATCH) {
    const walk = (o) => { if (typeof o === 'string') { let t = o; for (const p of PATCH) if (t.includes(p.find)) { t = t.split(p.find).join(p.replace); patchChanges.push({ before: p.find, after: p.replace, why: 'poprawka ręczna', auto: true }); } return t.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1'); }
      if (Array.isArray(o)) return o.map(walk); if (o && typeof o === 'object') { for (const k of Object.keys(o)) o[k] = walk(o[k]); } return o; };
    trip.content = walk(trip.content); trip.meta = walk(trip.meta); for (const k of Object.keys(blocks)) blocks[k] = walk(blocks[k]);
    log(`${slug}: poprawki ręczne: ${patchChanges.length} podmian z ${PATCH.length}`);
  }
  // --set '[{"path":"meta.duration_hours","value":6}]': ręczne ustawienie pola (liczby, godziny) — ścieżka od korzenia {meta, content}
  for (const st of (opt('--set') ? JSON.parse(opt('--set')) : [])) {
    const ks = st.path.split('.'), last = ks.pop(); let o = trip;
    for (const k of ks) o = o?.[/^\d+$/.test(k) ? +k : k];
    if (o && last in o) { patchChanges.push({ before: String(o[last]), after: String(st.value), why: `poprawka ręczna (${st.path})`, auto: true }); o[last] = st.value; log(`${slug}: ustawiono ${st.path} = ${st.value}`); }
    else log(`${slug}: UWAGA brak pola ${st.path}`);
  }
  // klucze z wartością null spoza formatu (np. „notes”) — walidator ich nie przyjmuje
  const dropNull = (o) => { if (o && typeof o === 'object') for (const k of Object.keys(o)) { if ((k === 'notes' || k === '_notes') && o[k] == null) delete o[k]; else dropNull(o[k]); } };
  dropNull(trip.content);
  log(`${slug}: ④ kontrola Claude — cała trasa (szkic v${cur.version})`);
  let rv;
  // --no-review --resolved 0,2,5 --soft 4: bez nowej pełnej kontroli (każda kolejna znajduje „nowe” drobiazgi i proces się nie zbiega).
  // Bierze kontrolę wersji wyjściowej: błędy poprawione ręcznie znikają, --soft przenosi do ostrzeżeń, reszta zostaje (JP 2026-10-25).
  if (argv.includes('--no-review') && cur.review) {
    const idx = (n) => new Set(String(opt(n) ?? '').split(',').filter(Boolean).map(Number));
    const res = idx('--resolved'), soft = idx('--soft'), prev = cur.review;
    rv = { ...prev, rounds: [], warnings: [...(prev.warnings ?? []), ...(prev.errors ?? []).filter((_, i) => soft.has(i)).map(e => ({ ...e, problem: `[nie blokuje] ${e.problem}` }))],
      errors: (prev.errors ?? []).filter((_, i) => !res.has(i) && !soft.has(i)) };
    rv.verdict = rv.errors.length ? 'fix' : 'ok';
    log(`${slug}: bez nowej kontroli — poprawione ${res.size}, do ostrzeżeń ${soft.size}, zostaje ${rv.errors.length}`);
  } else try { await pinCheck(trip).catch(() => {}); fixSchedule(trip); rv = await fullReview(slug, trip); } catch (e) { throw new Error(`kontrola trasy nie przeszła: ${e.message.slice(0, 200)}`); }
  // każda runda = podwersja szkicu: v5 → v5a, v5b, v5c (JP 2026-10-25). Numer w bazie rośnie jak zwykle, etykieta w content.label.
  const base = String(cur.content?.label ?? `v${cur.version}`).match(/^v(\d+)/)[1];
  const gl = await guidelinesVersion();
  let saved = null, label = null;
  const saveRound = async (round, rvr, ap) => {
    const [n] = await q(`SELECT count(*)::int AS n FROM public.city_versions WHERE city_slug = $1 AND content->>'label' ~ $2`, [slug, `^v${base}[a-z]$`]);
    label = `v${base}${String.fromCharCode(97 + n.n)}`;
    log(`${slug}: ⑤ zapis ${label} (runda ${round})`);
    const t = { meta: trip.meta, content: noDash(trip.content) };
    for (const k of Object.keys(blocks)) if (blocks[k]?.marked) blocks[k].marked = noDash(blocks[k].marked);
    saved = await saveDraft(q, t, { note: round === 0 ? `${label}: poprawki ręczne i kontrola całej trasy (błędy ${rvr.errors?.length ?? 0})` : `${label}: poprawki po kontroli całej trasy, runda ${round} (błędy ${rvr.rounds.map(x => x.errors).join(' → ')})`, source: 'revise', changes: ap.changes ?? [], review: rvr });
    await q(`UPDATE public.city_versions SET content = content || jsonb_build_object('workflow', 'v2', 'workflow_model', $3::text, 'stop_blocks_v2', $4::jsonb, 'label', $5::text),
               trip = trip || jsonb_build_object('stop_blocks_v2', $4::jsonb) WHERE city_slug = $1 AND version = $2`, [slug, saved.version, MODEL, JSON.stringify(blocks), label]);
    await stampGuidelines(saved.version, gl, rvr.verdict === 'ok');
  };
  const [c0] = await q(`SELECT count(*)::int AS n FROM public.city_versions WHERE city_slug = $1 AND content->>'label' ~ $2`, [slug, `^v${base}[a-z]$`]);
  rv = await fixLoop(trip, blocks, cityTitle, rv, null, saveRound, (round) => `v${base}${String.fromCharCode(96 + c0.n + round)}`);
  if (!saved && (PATCH || opt('--set'))) await saveRound(0, rv, { changes: patchChanges });   // same poprawki ręczne, bez rund
  if (!saved) { await notify(channel, `✅ ${cityTitle}: kontrola całej trasy v${base} bez błędów — nic do poprawy.`); return; }
  const path = rv.rounds.map(x => x.errors).join(' → ');
  event(`gotowe: szkic ${label} · wytyczne ${gl ?? '?'} · błędy ${path}`, { stage: 7, status: 'done' });
  await notify(channel, `📝 **${cityTitle} — szkic ${label} · wytyczne ${gl ?? '?'}${rv.verdict === 'ok' ? ' ✓' : ''}** po kontroli całej trasy i poprawkach.\n` +
    `Błędy w kolejnych rundach: ${path}${rv.facts ? ` · fakty: ✓ ${rv.facts.confirmed} · ✗ ${rv.facts.contradicted} · bez źródła ${rv.facts.unverified}` : ''}\n` +
    `${rv.errors?.length ? `Zostało do decyzji JP:\n${rv.errors.slice(0, 8).map(e => `• ${e.stop_key ?? 'trasa'}: ${String(e.problem).slice(0, 140)}`).join('\n')}\n` : ''}` +
    `Panel: https://admin.quolino.com/_admin/#/${slug}`);
  console.log(JSON.stringify({ slug, version: saved.version, verdict: rv.verdict, rounds: rv.rounds }, null, 2));
}

// ── naniesienie uwag (JP z panelu albo Claude z kontroli całej trasy) na szkic: Gemini poprawia wskazane pola, Claude sprawdza zmienione przystanki ──
async function applyComments(trip, blocks, comments, cityTitle, who) {
  const by = {};
  for (const cm of comments) (by[cm.stop_key ?? '_city'] ??= []).push(cm);
  const changes = [], summaries = [];
  const kto = who === 'JP' ? 'uwag JP' : 'uwag z kontroli Claude (sprawdził źródła i całą trasę)';
  const list = (cs) => cs.map(x => `- [${x.field_label ?? x.field ?? 'całość'}] ${x.body}`).join('\n');
  for (const [key, cs] of Object.entries(by)) {
    if (key === '_city') {
      log(`${slug}: poprawki — opis miasta (${cs.length})`);
      const out = await geminiJson(`Popraw opis wycieczki Quolino według ${kto}. Zmieniaj TYLKO to, czego dotyczą uwagi; resztę zostaw słowo w słowo.
${RULES}
${rulesText()}
UWAGI (${who}):
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
    const out = await geminiJson(`Popraw przystanek wycieczki Quolino według ${kto}. Zmieniaj TYLKO to, czego dotyczą uwagi; resztę zostaw słowo w słowo.
${who === 'Claude' ? 'POPRAWKI Z KONTROLI: NIE dodawaj żadnych nowych faktów, liczb, dat ani nazw. Poprawka = usuń zdanie, przepisz je bez błędu albo przenieś. Fakt bez potwierdzenia w źródle = usuń zdanie. Spójność godzin: time_label i day_plan muszą się zgadzać.\n' : ''}Uwaga do opisu, legendy, ciekawostki, popkultury albo fun factu = popraw rekord bloków (z przypisami [n], źródła z listy). Nowe fakty tylko z researchu poniżej
albo — jeśli JP sam podał fakt w uwadze — z uwagi JP (wtedy bez przypisu, opisz to w "summary").
${STANDARD}
${DEPTH_TEXT}
${RULES}
${rulesText()}
UWAGI (${who}):
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
      blocks[key] = { ...(b ?? {}), ...rec, validator: validateStop(rec, { category: m.category, thin: b?.gap }), revisedBy: who, fixRound: b?.fixRound };
      if (rec.marked.desc_paragraphs.length) pl.desc_paragraphs = rec.marked.desc_paragraphs.map(stripRefs);
      if (CHECK) {
        log(`${slug}: ④ kontrola Claude po poprawkach (${who}) — ${m.stop_number} ${pl.name}`);
        try { blocks[key].check = await check(pl, m.category, cityTitle, rec); }
        catch (e) { blocks[key].check = { verdict: 'fix', summary: `kontrola nie przeszła: ${e.message.slice(0, 200)}`, errors: [], warnings: [] }; }
      }
    }
    if (out.summary) summaries.push(`${pl.name}: ${out.summary}`);
  }
  return { changes, summaries };
}

// ── poprawki JP z panelu (nowy proces) ─────────────────────────────────────────────────────────
// Uwagi pogrupowane po przystankach; Gemini poprawia tylko wskazane pola (i bloki z przypisami), Claude sprawdza zmienione przystanki,
// zapis jako nowa wersja (source revise, workflow v2), a Claude rozstrzyga, czy poprawka uczy zasady na przyszłość (editorial_rules).
async function reviseMain() {
  const comments = JSON.parse(readFileSync(opt('--comments'), 'utf8'));
  const context = opt('--context') && existsSync(opt('--context')) ? readFileSync(opt('--context'), 'utf8') : '';
  const [cur] = await q(`SELECT version, trip, content, review FROM public.city_versions WHERE city_slug = $1 AND status = 'draft' ORDER BY version DESC LIMIT 1`, [slug]);
  if (!cur?.trip?.meta) throw new Error(`${slug}: brak szkicu do poprawy`);
  const trip = { meta: cur.trip.meta, content: cur.trip.content };
  const blocks = cur.content?.stop_blocks_v2 ?? cur.trip.stop_blocks_v2 ?? {};
  const cityTitle = trip.content.city?.title ?? slug; name = cityTitle;
  await loadRules(q);
  // Odpowiedzi JP na „Pytania z kontroli” (pole review.e.N / review.w.N, panel JP 2026-10-26):
  //   „✓ Popraw według propozycji” → dosłowna podmiana stare → nowe z kontroli (bez AI), „✗ Zostaw” → bez zmian,
  //   własny tekst → zwykła uwaga dla Gemini z treścią pytania. Pytania z odpowiedzią znikają z listy w nowej wersji.
  const isQ = (c) => /^review\.[ew]\.\d+$/.test(c.field ?? '');
  const revs = {};
  for (const v of new Set(comments.filter(isQ).map(c => +(c.city_version ?? cur.version)))) {
    const [row] = v === cur.version ? [cur] : await q(`SELECT review FROM public.city_versions WHERE city_slug = $1 AND version = $2`, [slug, v]);
    revs[v] = row?.review ?? {};
  }
  const itemOf = (c) => { const [, k, i] = c.field.split('.'); const rvv = revs[+(c.city_version ?? cur.version)] ?? {}; return (k === 'e' ? rvv.errors : rvv.warnings)?.[+i] ?? null; };
  const lit = [], ask = [], answered = new Set();
  for (const c of comments) {
    if (!isQ(c)) { ask.push(c); continue; }
    const it = itemOf(c); if (it) answered.add(`${it.stop_key ?? ''}|${it.problem}`);
    if (/^✓/.test(c.body.trim()) && it?.old) lit.push({ find: it.old, replace: it.new ?? '' });
    else if (/^✗/.test(c.body.trim())) continue;
    else ask.push({ ...c, field: null, field_label: 'pytanie z kontroli', body: `Pytanie z kontroli: ${it?.problem ?? c.field_label}${it?.old ? ` (fragment: „${it.old}”)` : ''}. Decyzja JP: ${c.body}` });
  }
  const litChanges = [];
  if (lit.length) {
    const walk = (o) => { if (typeof o === 'string') { let t = o; for (const p of lit) if (p.find && t.includes(p.find)) { t = t.split(p.find).join(p.replace); litChanges.push({ before: p.find, after: p.replace, why: 'pytanie z kontroli: zgoda JP na propozycję', auto: true }); } return t.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1'); }
      if (Array.isArray(o)) return o.map(walk); if (o && typeof o === 'object') { for (const k of Object.keys(o)) o[k] = walk(o[k]); } return o; };
    trip.content = walk(trip.content); trip.meta = walk(trip.meta); for (const k of Object.keys(blocks)) blocks[k] = walk(blocks[k]);
    log(`${slug}: pytania z kontroli — ${lit.length} zgód, ${litChanges.length} podmian`);
  }
  const ap = ask.length ? await applyComments(trip, blocks, ask, cityTitle, argv.includes('--no-learn') ? 'Claude' : 'JP') : { changes: [], summaries: [] };
  const changes = [...litChanges, ...ap.changes], summaries = [...(lit.length ? [`pytania z kontroli: ${lit.length} poprawek wg propozycji`] : []), ...ap.summaries];
  if (!changes.length && !answered.size) throw new Error('Gemini nie zaproponował żadnej zmiany — uwagi nie wskazują konkretnej poprawki');
  const fails = Object.values(blocks).filter(x => x?.check?.verdict === 'fix').length;
  // poprzednia kontrola przechodzi dalej bez pytań, na które JP już odpowiedział (każda nowa pełna kontrola znajdowała „nowe” drobiazgi)
  const prev = cur.review ?? {}, open = (e) => !answered.has(`${e.stop_key ?? ''}|${e.problem}`);
  const left = (prev.errors ?? []).filter(open);
  const rv = { ...prev, verdict: left.length || fails ? 'fix' : 'ok', summary: summaries.join(' · ').slice(0, 900), errors: left, warnings: (prev.warnings ?? []).filter(open), rounds: [] };
  trip.content = noDash(trip.content); for (const k of Object.keys(blocks)) if (blocks[k]?.marked) blocks[k].marked = noDash(blocks[k].marked);
  const base = String(cur.content?.label ?? `v${cur.version}`).match(/^v(\d+)/)?.[1] ?? String(cur.version);
  const [nl] = await q(`SELECT count(*)::int AS n FROM public.city_versions WHERE city_slug = $1 AND content->>'label' ~ $2`, [slug, `^v${base}[a-z]$`]);
  const label = `v${base}${String.fromCharCode(97 + nl.n)}`;
  const saved = await saveDraft(q, trip, { note: `${label}: poprawki JP (${comments.length} uwag${answered.size ? `, w tym ${answered.size} odpowiedzi na pytania z kontroli` : ''})`, source: 'revise', changes, review: rv });
  await q(`UPDATE public.city_versions SET content = content || jsonb_build_object('workflow', 'v2', 'workflow_model', $3::text, 'stop_blocks_v2', $4::jsonb, 'label', $5::text),
             trip = trip || jsonb_build_object('stop_blocks_v2', $4::jsonb) WHERE city_slug = $1 AND version = $2`, [slug, saved.version, MODEL, JSON.stringify(blocks), label]);
  const gl = await guidelinesVersion();
  await stampGuidelines(saved.version, gl, rv.verdict === 'ok');
  let learned = [];
  if (!argv.includes('--no-learn') && ask.some(x => !/^Pytanie z kontroli/.test(x.body))) try { learned = await learn(q, { slug, version: saved.version, say: ask.filter(x => !/^Pytanie z kontroli/.test(x.body)).map(x => x.body).join('\n'), context, changes, trip }); }
  catch (e) { log(`zasady: ${e.message.slice(0, 160)}`); }
  event(`gotowe: szkic v${saved.version} po poprawkach (${changes.length} zmian) · wytyczne ${gl ?? '?'}`, { stage: 7, status: 'done' });
  const out = { slug, version: saved.version, from: cur.version, changes: changes.length, summary: rv.summary, verdict: rv.verdict, learned, preview: previewUrl(saved.token) };
  await notify(channel, `✅ **${cityTitle} — szkic v${saved.version} · wytyczne ${gl ?? '?'}** po ${argv.includes('--no-learn') ? 'poprawkach z kontroli Claude' : 'Twoich poprawkach'} (${changes.length} zmian${fails ? `, kontrola Claude zgłasza uwagi przy ${fails} przystankach` : ''}).\n` +
    `${rv.summary}\n${learned?.length ? `Zapamiętane zasady: ${learned.length}\n` : ''}Panel: https://admin.quolino.com/_admin/#/${slug}`);
  console.log(JSON.stringify(out, null, 2));
}

try { await (RECHECK ? recheckMain() : REVISE ? reviseMain() : main()); }
catch (e) { console.error('BŁĄD:', e.message); event(`błąd: ${e.message}`, { status: 'error' }); await new Promise(r => setTimeout(r, 500)); await notify(channel, `⚠️ ${name} (nowy proces): ${e.message.slice(0, 500)}`); process.exitCode = 1; }
finally { await c.end(); }
