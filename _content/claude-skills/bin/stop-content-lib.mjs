// Standard treści przystanku (docs/TRESC-PRZYSTANKU.md, JP 2026-10-18) — czyste funkcje bez bazy i sieci.
// Używa: stop-content.mjs (walidator mechaniczny §5.5 + normalizacja odpowiedzi modelu); testy: stop-content.test.mjs.
// Rekord = to, co trzyma ops.stop_research:
//   { marked: {desc_paragraphs[], legend, curiosity, fun_fact, pop_culture}, state: {<blok>: {state, checked?}}, sources: [{n,url,title,lang,accessed}] }
import { descProblems, SIGHT_CATS } from './desc-rules.mjs';

export const BLOCKS = ['legend', 'curiosity', 'fun_fact', 'pop_culture'];
export const BLOCK_PL = { legend: 'legenda', curiosity: 'ciekawostka', fun_fact: 'fun fact', pop_culture: 'w popkulturze', desc: 'opis', sources: 'źródła' };
// przystanki praktyczne: bez legendy (stan none, „przystanek praktyczny…”), ciekawostka dozwolona (JP 2026-10-18)
export const PRACTICAL_CATS = new Set(['parking', 'restaurant', 'icecream', 'sweets']);
export const PRACTICAL_CHECKED = (cat) => `przystanek praktyczny (${cat}) — legenda nie dotyczy`;

const REF = /\[(\d{1,3})\]/g;
export const refsIn = (s) => [...String(s ?? '').matchAll(REF)].map(m => +m[1]);
export const stripRefs = (s) => String(s ?? '').replace(/\s*\[\d{1,3}\]/g, '').replace(/\s+([.,;:!?…])/g, '$1').trim();
const norm = (s) => stripRefs(s).toLowerCase().replace(/[„”"«»()'’]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const words = (s) => norm(s).split(' ').filter(Boolean);

// zdania: podział po . ! ? … (także po przypisach „[2].”), tylko gdy dalej zaczyna się wielka litera lub cudzysłów —
// „S.S. 76”, „ok. 3 metry”, „1 września” się nie rozpadają
export function sentences(text) {
  return String(text ?? '').split(/(?<=[.!?…](?:[”"»)]*))\s+(?=[\p{Lu}„"«(])/u).map(s => s.trim()).filter(Boolean);
}

// domena „niezależnego” źródła: it.wikipedia.org i en.wikipedia.org to ta sama domena; cultura.gov.it ≠ isprambiente.gov.it
export function domainOf(url) {
  let h;
  try { h = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; }
  const p = h.split('.');
  if (p.length >= 3 && p.at(-1).length === 2 && ['gov', 'co', 'com', 'org', 'ac', 'edu', 'net'].includes(p.at(-2))) return p.slice(-3).join('.');
  return p.slice(-2).join('.');
}

// teksty bloku: [{where, text}]
export function blockTexts(block, value) {
  if (value == null) return [];
  if (block === 'legend') return ['text', 'trace', 'history'].filter(k => typeof value[k] === 'string' && value[k].trim()).map(k => ({ where: `legend.${k}`, text: value[k] }));
  if (block === 'pop_culture') return (Array.isArray(value.items) ? value.items : []).map((it, i) => ({ where: `pop_culture.items[${i}]`, text: it?.text ?? '' }));
  return typeof value.text === 'string' ? [{ where: `${block}.text`, text: value.text }] : [];
}

// ── wzorce ───────────────────────────────────────────────────────────────────────────────────
// czasy dojazdu i kilometry (CLAUDE.md zasada 2) — „kilometr” (długość ścieżki) jest dozwolony, „km” nie
export const TRAVEL_PATTERNS = [
  /(?<![\p{L}])km(?![\p{L}])/iu,
  /\bmin(?:ut[ayę]?)?\.?\s+(?:autem|jazdy|samochodem|drogi|pociągiem|autobusem|busem)\b/iu,
  /\b(?:godzin[ayę]?|godzinę|kwadrans|pół godziny)\s+(?:jazdy|drogi|autem|samochodem)\b/iu,
  /\b(?:czas(?:u)? dojazdu|dojazd(?:u)? z|wyjazd(?:u)? z|powrót do bazy)\b/iu,
];
// superlatywy (§3 i lekcja 2 z WNIOSKI-Z-POPRAWEK): w blokach wymagają dwóch niezależnych źródeł
export const SUPERLATIVE = /(?<![\p{L}])(?:naj(?:starsz|większ|wyższ|dłuższ|mniejsz|głębsz|ważniejsz|cenniejsz|słynniejsz|bogatsz|piękniejsz|lepiej zachowan)\p{L}*|jedyn(?:y|a|e|ym|ą|ej|ego)(?![\p{L}])|pierwsz\p{L}* na świecie)/iu;
const NUMBER = /\d|(?<![\p{L}])(?:dw[aóie]|trz[yech]|czter|pięć|sześć|siedem|osiem|dziewięć|dziesięć|sto|stu|tysi[ąę]c|milion|miliard)\p{L}*/iu;
const LEGEND_PARA = /^\s*(?:Legenda (?:mówi|głosi)|Według (?:tradycji|legendy|podania)|Ciekawostka:|W popkulturze:)/iu;
const PRACTICAL_PARA = /^\s*Praktycznie\s*[:,—–-]/iu;
const LEGEND_MENTION = /legend|według tradycji|podani[ea]/iu;
const ABBR = /\b(?:np|m\.in|ok|tzw|św|r|w|wg|ul|pl|cm|m|tj|ds|dr|prof|im)\./giu;

const MIN_SHARED_WORDS = 10;   // tyle kolejnych słów wspólnych = powtórzony tekst
function ngrams(ws, n) { const out = new Set(); for (let i = 0; i + n <= ws.length; i++) out.add(ws.slice(i, i + n).join(' ')); return out; }

// ── walidator mechaniczny (§5.5 + reguły CLAUDE.md) ─────────────────────────────────────────────
// validateStop(rec, {category}) → {errors: [{block, problem}], warnings: [{block, problem}]}
export function validateStop(rec, { category = null } = {}) {
  const errors = [], warnings = [];
  const E = (block, problem) => errors.push({ block, problem });
  const W = (block, problem) => warnings.push({ block, problem });
  const m = rec?.marked, st = rec?.state, src = rec?.sources;
  if (!m || typeof m !== 'object') { E('desc', 'brak obiektu marked'); return { errors, warnings }; }
  if (!st || typeof st !== 'object') E('sources', 'brak obiektu state');
  if (!Array.isArray(src)) E('sources', 'sources musi być tablicą');
  const sources = Array.isArray(src) ? src : [];
  const desc = Array.isArray(m.desc_paragraphs) ? m.desc_paragraphs : null;
  if (!desc || !desc.length || desc.some(p => typeof p !== 'string' || !p.trim())) E('desc', 'desc_paragraphs musi być niepustą listą akapitów (tekst)');

  // źródła
  const byN = new Map();
  for (const s of sources) {
    if (!Number.isInteger(s?.n) || s.n < 1) { E('sources', `źródło bez poprawnego numeru n: ${JSON.stringify(s).slice(0, 120)}`); continue; }
    if (byN.has(s.n)) E('sources', `numer źródła [${s.n}] występuje dwa razy`);
    byN.set(s.n, s);
    if (!/^https?:\/\/\S+$/i.test(s.url ?? '') || !domainOf(s.url)) E('sources', `źródło [${s.n}]: brak poprawnego adresu URL`);
    if (!String(s.title ?? '').trim()) E('sources', `źródło [${s.n}]: brak tytułu`);
    if (!String(s.lang ?? '').trim()) W('sources', `źródło [${s.n}]: brak języka (lang)`);
  }
  const noDate = sources.filter(s => Number.isInteger(s?.n) && !String(s.accessed ?? '').trim()).map(s => s.n);
  if (noDate.length) W('sources', `źródła bez daty dostępu (accessed): ${noDate.map(n => `[${n}]`).join('')}`);

  // wszystkie teksty z miejscem
  const texts = [];
  (desc ?? []).forEach((p, i) => texts.push({ block: 'desc', where: `desc_paragraphs[${i}]`, text: String(p ?? '') }));
  for (const b of BLOCKS) for (const t of blockTexts(b, m[b])) texts.push({ block: b, ...t });

  // przypisy ↔ źródła
  const used = new Set();
  for (const t of texts) for (const n of refsIn(t.text)) {
    used.add(n);
    if (!byN.has(n)) E(t.block, `${t.where}: przypis [${n}] nie ma źródła w sources`);
  }
  for (const n of byN.keys()) if (!used.has(n)) E('sources', `źródło [${n}] nie jest użyte w żadnym przypisie — usuń je albo dodaj przypis`);

  // stan bloków: treść + found albo null + none + checked
  for (const b of BLOCKS) {
    const v = m[b], s = st?.[b];
    if (!(b in m)) E(b, `marked.${b}: brak klucza (ma być treść albo null)`);
    if (!s || typeof s !== 'object') { E(b, `state.${b}: brak stanu (found / none + checked)`); continue; }
    if (s.state === 'found') {
      if (v == null) { E(b, `state.${b} = found, ale marked.${b} jest puste`); continue; }
      const tx = blockTexts(b, v);
      if (b === 'pop_culture') {
        const items = Array.isArray(v.items) ? v.items : [];
        if (!items.length) E(b, 'pop_culture.items: pusta lista przy stanie found');
        items.forEach((it, i) => {
          if (!String(it?.title ?? '').trim()) E(b, `pop_culture.items[${i}]: brak tytułu`);
          if (it?.year == null || !String(it.year).trim()) W(b, `pop_culture.items[${i}]: brak roku`);
          if (!String(it?.text ?? '').trim()) E(b, `pop_culture.items[${i}]: brak tekstu`);
        });
      } else if (!tx.length || !String(v.text ?? '').trim()) E(b, `marked.${b}.text: brak tekstu przy stanie found`);
      for (const t of tx) if (t.text.trim() && !refsIn(t.text).length) E(b, `${t.where}: fakt bez przypisu [n] — każdy blok ma źródło`);
    } else if (s.state === 'none') {
      if (v != null) E(b, `state.${b} = none, ale marked.${b} ma treść — ustaw found albo usuń treść`);
      if (!String(s.checked ?? '').trim()) E(b, `state.${b} = none bez pola checked (gdzie szukano) — błąd standardu §1`);
    } else E(b, `state.${b}.state musi być found albo none (jest: ${JSON.stringify(s.state)})`);
  }

  // przystanki praktyczne: bez legendy
  if (PRACTICAL_CATS.has(category)) {
    if (m.legend != null || st?.legend?.state === 'found') E('legend', `przystanek praktyczny (${category}) nie ma legendy — stan none, checked „przystanek praktyczny…”`);
    else if (st?.legend && !/przystanek praktyczny/i.test(st.legend.checked ?? '')) E('legend', `przystanek praktyczny (${category}): state.legend.checked ma zaczynać się od „przystanek praktyczny…”`);
  }

  // fun fact: „Czy wiesz, że…”, jedno zdanie, dla 9-latka
  const ff = m.fun_fact?.text;
  if (typeof ff === 'string' && ff.trim()) {
    const plain = stripRefs(ff).replace(/^[„"«\s]+/, '');
    if (!/^Czy wiesz/u.test(plain)) E('fun_fact', 'fun fact ma zaczynać się od „Czy wiesz, że…”');
    const ends = (plain.replace(ABBR, ' ').match(/[.!?…]+(?=\s|$)/g) ?? []).length;
    if (ends > 1) E('fun_fact', `fun fact to jedno zdanie (jest ${ends})`);
    if (words(plain).length > 40) W('fun_fact', `fun fact ma ${words(plain).length} słów — dla 9-latka krócej`);
  }

  // dwa niezależne źródła (§3): ciekawostka zawsze, fun fact z liczbą, superlatyw w bloku; superlatyw w opisie = uwaga
  const domains = (ns) => new Set(ns.map(n => byN.get(n)?.url).filter(Boolean).map(domainOf).filter(Boolean));
  const two = (block, where, text, why, soft = false) => {
    const d = domains(refsIn(text));
    if (d.size < 2) (soft ? W : E)(block, `${where}: ${why} — potrzebne dwa niezależne źródła (różne domeny), jest ${d.size}${d.size ? ` (${[...d].join(', ')})` : ''}`);
  };
  if (m.curiosity?.text) two('curiosity', 'ciekawostka', m.curiosity.text, 'ciekawostka');
  if (ff && NUMBER.test(stripRefs(ff).replace(/^Czy wiesz, że/u, ''))) two('fun_fact', 'fun fact', ff, 'fun fact z liczbą');
  for (const t of texts) for (const s of sentences(t.text)) if (SUPERLATIVE.test(stripRefs(s))) {
    const hit = stripRefs(s).match(SUPERLATIVE)[0];
    two(t.block, `${t.where} („${hit}”)`, s, 'superlatyw', t.block === 'desc');
  }

  // zdanie z liczbą/datą bez przypisu (§5.5)
  for (const t of texts) for (const s of sentences(t.text)) {
    const plain = stripRefs(s);
    if (/\d/.test(plain) && !refsIn(s).length) E(t.block, `${t.where}: zdanie z liczbą/datą bez przypisu — „${plain.slice(0, 90)}”`);
  }

  // czasy dojazdu / km (CLAUDE.md zasada 2) — wszędzie
  for (const t of texts) for (const re of TRAVEL_PATTERNS) {
    const hit = stripRefs(t.text).match(re);
    if (hit) E(t.block, `${t.where}: czas dojazdu albo kilometry („${hit[0]}”) — zakazane; pokazujemy tylko czas na miejscu`);
  }

  // opis: głębokość (bez przypisów w liczeniu słów), bez akapitów legendy/ciekawostki/popkultury
  if (desc?.length) {
    const plainDesc = desc.map(stripRefs);
    // progi liczone bez przypisów [n]; końcowy akapit „Praktycznie: …” (ubiór, wózki) liczy się do sumy słów,
    // ale nie podlega minimum 40 słów na akapit — wzorzec Frasassi 21 zaakceptowany przez JP 2026-10-18
    const story = [...plainDesc]; while (story.length > 1 && PRACTICAL_PARA.test(story.at(-1))) story.pop();
    const perPara = (x) => /^akapity /.test(x);
    for (const p of [...descProblems(category, plainDesc).filter(x => !perPara(x)), ...descProblems(category, story).filter(perPara)]) E('desc', `opis: ${p}`);
    desc.forEach((p, i) => { if (LEGEND_PARA.test(stripRefs(p))) E('desc', `desc_paragraphs[${i}]: akapit legendy/ciekawostki/popkultury w opisie — przenieś do bloku, w opisie najwyżej jedno zdanie-zapowiedź`); });
    const mentions = plainDesc.flatMap(sentences).filter(s => LEGEND_MENTION.test(s));
    if (mentions.length > 1) E('desc', `opis opowiada legendę (${mentions.length} zdania o legendzie/tradycji) — legenda idzie do bloku legend, w opisie najwyżej jedno zdanie-zapowiedź`);
  }

  // powtórzenia: zdanie bloku dosłownie w opisie albo w innym bloku; wspólny ciąg ≥ MIN_SHARED_WORDS słów
  const descNorm = (desc ?? []).map(norm).join(' ');
  const descGrams = ngrams(descNorm.split(' ').filter(Boolean), MIN_SHARED_WORDS);
  const blockGrams = {};
  for (const b of BLOCKS) {
    const tx = blockTexts(b, m[b]);
    const all = tx.map(t => norm(t.text)).join(' ');
    blockGrams[b] = ngrams(all.split(' ').filter(Boolean), MIN_SHARED_WORDS);
    for (const t of tx) for (const s of sentences(t.text)) {
      const ns = norm(s);
      if (ns.split(' ').length >= 6 && descNorm.includes(ns)) E(b, `${t.where}: zdanie powtórzone dosłownie z opisu — blok ma rozwijać, nie powtarzać: „${stripRefs(s).slice(0, 90)}”`);
    }
    const shared = [...blockGrams[b]].find(g => descGrams.has(g));
    if (shared && !errors.some(e => e.block === b && /powtórzone dosłownie/.test(e.problem))) E(b, `${BLOCK_PL[b]} powtarza tekst opisu („${shared}…”)`);
  }
  for (let i = 0; i < BLOCKS.length; i++) for (let j = i + 1; j < BLOCKS.length; j++) {
    const a = BLOCKS[i], b = BLOCKS[j];
    const shared = [...blockGrams[a]].find(g => blockGrams[b].has(g));
    if (shared) E(b, `${BLOCK_PL[b]} powtarza tekst bloku ${BLOCK_PL[a]} („${shared}…”) — fakt stoi w jednym bloku`);
  }
  if (SIGHT_CATS.has(category) && BLOCKS.every(b => st?.[b]?.state === 'none'))
    W('desc', 'zabytek bez żadnego bloku — sprawdź, czy research przeszedł wszystkie pytania §2');
  return { errors, warnings };
}

// ── normalizacja odpowiedzi modelu do kształtu ops.stop_research ─────────────────────────────────
// Bez zmian merytorycznych: brakujące klucze → null, stan wyliczony, gdy go brak, accessed = dziś, sortowanie źródeł.
export function normalizeRecord(raw, { category = null, today = new Date().toISOString().slice(0, 10) } = {}) {
  const r = raw?.marked ? raw : { marked: raw ?? {}, state: raw?.state, sources: raw?.sources };
  const m = { ...(r.marked ?? {}) };
  m.desc_paragraphs = (Array.isArray(m.desc_paragraphs) ? m.desc_paragraphs : []).filter(x => typeof x === 'string' && x.trim()).map(x => x.trim());
  for (const b of BLOCKS) {
    let v = m[b];
    if (v === undefined || v === '' || (v && typeof v === 'object' && !Object.keys(v).length)) v = null;
    if (typeof v === 'string') v = b === 'pop_culture' ? null : { text: v };
    if (b === 'pop_culture' && Array.isArray(v)) v = { items: v };
    if (b === 'pop_culture' && v && Array.isArray(v.items) && !v.items.length) v = null;
    if (b === 'legend' && v) for (const k of ['trace', 'history']) if (v[k] == null || !String(v[k]).trim()) delete v[k];
    m[b] = v;
  }
  const state = {};
  for (const b of BLOCKS) {
    const s = r.state?.[b];
    if (m[b] != null) state[b] = { state: 'found' };
    else state[b] = { state: 'none', checked: String(s?.checked ?? '').trim() || null };
    if (state[b].state === 'none' && !state[b].checked) delete state[b].checked;   // walidator zgłosi brak
  }
  if (PRACTICAL_CATS.has(category) && m.legend == null) state.legend = { state: 'none', checked: PRACTICAL_CHECKED(category) };
  const sources = (Array.isArray(r.sources) ? r.sources : []).map(s => ({
    n: Number.isInteger(+s?.n) ? +s.n : s?.n, url: String(s?.url ?? '').trim(), title: String(s?.title ?? '').trim(),
    lang: String(s?.lang ?? '').trim() || null, accessed: String(s?.accessed ?? '').trim() || today,
  })).sort((a, b) => a.n - b.n);
  return { marked: { desc_paragraphs: m.desc_paragraphs, legend: m.legend, curiosity: m.curiosity, fun_fact: m.fun_fact, pop_culture: m.pop_culture }, state, sources };
}

// krótki opis stanu do powiadomień: „L✓ C✓ F✓ P–”
export function blocksLine(rec) {
  const ab = { legend: 'legenda', curiosity: 'ciekawostka', fun_fact: 'fun fact', pop_culture: 'popkultura' };
  return BLOCKS.map(b => `${ab[b]} ${rec?.state?.[b]?.state === 'found' ? '✓' : '–'}`).join(' · ');
}
