#!/usr/bin/env node
// Inspektor językowy (JP 2026-10-18): przechodzi po stronach z mapy witryny i sprawdza, czy każda strona
// mówi jednym językiem — tym z adresu (/pl/, /en/, …) i z <html lang>. Plus kompletność tłumaczeń w bazie.
//   node lang-inspect.mjs [--changed] [--dry-run] [--limit N] [--lang xx] [--no-db] [--notify <kanał>] [--site URL]
//   --changed   tryb cykliczny (cron co 15 min): nic się nie zmieniło → cisza; zmiana kodu strony → pełny przegląd;
//               zmiana treści w bazie → tylko strony dotkniętych miast (wszystkie języki) i języków ze zmienionym UI.
//               Na Discord tylko NOWE problemy i rozwiązane.
//   bez --changed: pełny przegląd + pełne podsumowanie na Discord (cron tygodniowy, siatka bezpieczeństwa).
// Strona jest oglądana tak, jak ją dostaje Google bez JavaScriptu (HTML z SSR) — napisy, które dopiero skrypt
// strony tłumaczy w przeglądarce, i tak są zgłaszane: wyszukiwarka i czytnik bez JS widzą je w złym języku.
// Detektor języka: wbudowany (słowa funkcyjne + litery charakterystyczne), zero zależności. Opis: docs/INSPEKTOR-JEZYKOWY.md.
// Kod wyjścia 0 zawsze, chyba że skrypt sam się wysypie.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, unlinkSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// ════════════════════════════════════════════════════════════════════════════════════════════
// 1. DETEKTOR JĘZYKA (czyste funkcje — testy: lang-inspect.test.mjs)
// ════════════════════════════════════════════════════════════════════════════════════════════
// 17 języków strony (i18n-ui.js) + el (jest w tabeli languages). „at” (niemiecki AT) = de, nb/nn = no.
export const LANGS = ['pl', 'en', 'de', 'it', 'cs', 'da', 'es', 'fr', 'hr', 'hu', 'nl', 'no', 'pt', 'ro', 'sk', 'sv', 'uk', 'el'];
export const normLang = (l) => { const x = String(l ?? '').toLowerCase().split(/[-_]/)[0]; return x === 'at' ? 'de' : (x === 'nb' || x === 'nn') ? 'no' : x; };

const W = (s) => new Set(s.split(/\s+/).filter(Boolean));
// Słowa funkcyjne: częste, krótkie, rzadko w nazwach własnych. Wspólne słowa w kilku listach są dozwolone —
// rozstrzygają słowa i litery charakterystyczne, a przy językach bliskich wymagamy większej przewagi.
export const STOP = {
  pl: W('i w z na się nie to jest do że jak po od dla ale o oraz przez tak czy są już tylko przy który która które którym dzieci dzieckiem dziećmi gdzie tu tutaj można bardzo lub ze we ich jego jej też także będzie mamy nad pod jeszcze kiedy bo żeby więc tym tej ten ta te być było była był wam was nas mnie sobie warto trzeba'),
  en: W('the and of to is in it you that with for are this on was from at your be have they there which can will kids children where what when but not all or by an we our their its into through up out about after before also than then these those has had been were very here more most just so if do does'),
  de: W('der die das und ist nicht mit ein eine einen einem dem den des zu auf für sich auch von sie wir ihr ihre es im bei nach über aus wie oder aber noch kinder kindern wird werden sind hier dort man durch zum zur vom unter schon sehr dann wenn kann können euch ihnen dieser diese dieses'),
  nl: W('de het een en van is niet met op voor zijn dat die er ook maar aan bij naar uit nog wordt worden kinderen hier je jullie jouw ze wat waar als door deze dit om tot over onder heel kunt kan wel geen veel'),
  it: W('il lo la gli le di del della dei degli delle che è e un una per con non sono nel nella alla al dal anche più come ma si ci questo questa bambini dove qui molto tra fra ogni suo sua loro ed nei sulla sul'),
  es: W('el los las del que y en un una es por con para se no su sus al lo como más pero muy también donde niños está están hay este esta estos desde hasta entre cuando sobre puede pueden hacia aquí'),
  pt: W('o os as do da dos das que e em um uma é para com não no na nos nas ao à se por mais como mas muito também onde crianças está são este esta isso pelo pela você vocês aqui há'),
  fr: W('le la les des du de et est un une en que qui pour dans sur pas ne avec au aux ce cette ces il elle ils nous vous sont mais plus où enfants très aussi être peut comme leur son sa ses y'),
  cs: W('a je se na v ve z ze do to že s o pro jako ale jsou jak by který která které také už jen při nebo děti dětmi kde tady můžete velmi být bude není jejich jeho její než když tak po od'),
  sk: W('a je sa na v vo z zo do to že s o pre ako ale sú by ktorý ktorá ktoré tiež už len pri alebo deti deťmi kde tu môžete veľmi byť bude nie ich jeho jej než keď tak po od aj'),
  hr: W('i je se na u za da su od do s sa kao ali ili koji koja koje što nije biti bit će djeca djecom gdje ovdje možete vrlo jako njihov njegov njezin kada kad tako po iz ima samo još već'),
  hu: W('a az és egy hogy nem is van meg de ez azt mint már csak még vagy el ki be fel gyerekek gyerekekkel ahol itt nagyon lehet lesz volt amely amit minden után között kell ezt'),
  ro: W('și în de la cu pe un o este sunt nu să ca care din pentru mai dar sau al ale lui ei copii copiii unde aici foarte puteți poate fi va acest această prin după între când cum doar'),
  da: W('og i er det en et at på til med for som af den de ikke har kan man der fra om men også børn børnene hvor her meget være bliver vil jeres deres efter eller hvis når sig jer hvad nu ud noget'),
  no: W('og i er det en et at på til med for som av den de ikke har kan man der fra om men også barn barna hvor her mye veldig være blir vil deres etter eller hvis når seg dere hva nå ut noe'),
  sv: W('och i är det en ett att på till med för som av den de inte har kan man där från om men också barn barnen var här mycket vara blir kommer ni er deras efter eller när sig jag vi ut nu något'),
  uk: W('і в на з що не це та до для як у є діти дітей ви ми вони його її їх або але також тут там дуже можна'),
  el: W('και το η ο να σε με για από που είναι τα τους της του στο στη οι παιδιά'),
};
// Litery wyłącznie jednego języka (z listy powyżej). Wspólne (é, ä, ö…) nie liczą się — rozstrzygają słowa.
export const CHARS = { pl: 'ąęłśźżń', cs: 'ěřů', sk: 'ôľĺŕ', hr: 'đ', de: 'ß', hu: 'őű', ro: 'ășțşţ', fr: 'êëœû', es: 'ñ¿¡', pt: 'ãõ', it: 'ìò', da: 'æø', no: 'æø' };
const FAMILY = [['cs', 'sk'], ['da', 'no', 'sv'], ['es', 'pt'], ['de', 'nl'], ['hr', 'cs', 'sk'], ['it', 'es', 'pt']];
export const sameFamily = (a, b) => FAMILY.some(f => f.includes(a) && f.includes(b));
const ALL_STOP = new Set(Object.values(STOP).flatMap(s => [...s]));

// Słownictwo nazw miejsc po włosku (nazwy przystanków są w tekstach każdego języka i NIE są błędem).
export const IT_PLACE = W(`piazza piazzale piazzetta duomo rocca palazzo palazzi chiesa basilica cattedrale fontana ponte torre torri porta porte via viale vicolo corso
  borgo castello museo musei pinacoteca galleria loggia chiostro pieve abbazia convento santuario oratorio teatro arco mura belvedere giardino giardini parco
  lago fiume monte colle valle grotta grotte gole cascata spiaggia lungomare porto mercato osteria trattoria pizzeria gelateria enoteca agriturismo cantina
  bottega forno pasticceria bar caffè gelato piadina tagliatelle cappuccino scale mobili minimetrò funicolare ascensore stazione centro storico rione contrada
  san santa santo santi madonna nostra signora maggiore vecchio vecchia nuovo nuova grande piccolo alto alta basso bassa sopra sotto antico antica`);
const IT_JOIN = W(`di del della dei degli delle dello d da dal dalla dai dagli dalle al alla ai agli alle e ed in sul sulla de la le lo il`);
// Marka i stałe napisy, które są takie same we wszystkich językach.
export const BRAND = [/^quolino(\.com)?[®™]?$/i, /^quo$/i, /^let['’]s explore!?$/i, /^buy me a coffee$/i, /^quolino\s*[—–-]\s*let['’]s explore!?$/i];
// Polskie słowa interfejsu — w krótkich napisach na stronach nie-polskich to prawie pewny polski fallback.
// (Bez słów wspólnych z innymi językami strony: konto, trasa, toalety, bilet, parking, menu…)
export const PL_UI_WORDS = W(`zaloguj zalogowaniu zalogować wyloguj zarejestruj nawiguj prowadź przystanek przystanki przystanków przystanku wycieczka wycieczki wycieczkę
  wycieczek wesprzyj wybierz język języka zmień zamknij ładowanie rodzica rodzice dziecka dzieci misja misje misji pieszo kopiuj skopiowano zagadki naklejki
  naklejek apteka się oraz jest żeby który która które gdzie dzień cały pół godziny otwarcia sprawdź miejscu punkt punkty wróć dalej zobacz więcej pełna pełny`);

// Polskie przyimki w nazwach (małą literą — w nazwach włoskich nie występują).
const PL_NAME_WORDS = W('przy obok koło przed pomiędzy między dla oraz');
const LETTER = /\p{L}/u;
const TOKEN = /[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu;
export const normText = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const normKey = (s) => normText(s).toLowerCase().replace(/[.!?…:]+$/, '');
const isCap = (w) => /^\p{Lu}/u.test(w);

// Tokeny po usunięciu nazw własnych: ciągi Wielkich Słów (z włoskimi łącznikami: „Palazzo dei Priori”),
// włoskie słownictwo miejsc, liczby. Słowo na początku zdania zostaje, jeśli jest słowem funkcyjnym („Die”, „The”).
export function contentTokens(text) {
  const toks = [];
  for (const m of String(text).matchAll(TOKEN)) {
    const before = text.slice(Math.max(0, m.index - 3), m.index);
    toks.push({ w: m[0], lower: m[0].toLowerCase(), start: toks.length === 0 || /[.!?:;„"«(\n—–]\s*$/.test(before) || /^\s*[-–—•]\s*$/.test(before) });
  }
  const drop = toks.map(t => isCap(t.w) && !(t.start && ALL_STOP.has(t.lower)));
  // łączniki między dwiema nazwami (Palazzo dei Priori, San Pietro in Valle)
  for (let i = 1; i < toks.length - 1; i++) if (!drop[i] && IT_JOIN.has(toks[i].lower)) {
    let j = i; while (j < toks.length - 1 && !drop[j] && IT_JOIN.has(toks[j].lower)) j++;
    if (drop[i - 1] && drop[j] && isCap(toks[j].w)) for (let k = i; k < j; k++) drop[k] = true;
  }
  return toks.filter((t, i) => !drop[i] && !IT_PLACE.has(t.lower)).map(t => t.lower);
}

// Wykrywanie języka listy tokenów (małe litery). Zwraca { lang, conf, best, scores }.
export function detectTokens(tokens, rawText = tokens.join(' ')) {
  const scores = Object.fromEntries(LANGS.map(l => [l, 0]));
  const letters = rawText.match(/\p{L}/gu) ?? [];
  const cyr = letters.filter(c => /[Ѐ-ӿ]/.test(c)).length, gr = letters.filter(c => /[Ͱ-Ͽ]/.test(c)).length;
  if (letters.length && cyr / letters.length > 0.4) return { lang: 'uk', conf: 1, best: 99, scores: { ...scores, uk: 99 } };
  if (letters.length && gr / letters.length > 0.4) return { lang: 'el', conf: 1, best: 99, scores: { ...scores, el: 99 } };
  for (const t of tokens) for (const l of LANGS) if (STOP[l].has(t)) scores[l] += 1;
  const low = rawText.toLowerCase();
  for (const [l, cs] of Object.entries(CHARS)) {
    let n = 0; for (const ch of low) if (cs.includes(ch)) n++;
    scores[l] += Math.min(4, n) * 0.75;
  }
  const order = LANGS.slice().sort((a, b) => scores[b] - scores[a]);
  const best = scores[order[0]], second = scores[order[1]];
  return { lang: best > 0 ? order[0] : null, conf: best > 0 ? (best - second) / best : 0, best, scores };
}
export const detect = (text) => detectTokens(contentTokens(text), text);

// Słownik napisów UI → zbiór „obcych” napisów dla języka strony (polski i angielski fallback).
// dict = { lang: { key: value } } (z i18n-ui.js i/lub ui_translations). Napis wspólny dla ≥ 3 języków (Parking, Menu, QR) — pomijamy.
export function foreignPhrases(dict, pageLang) {
  const page = normLang(pageLang), out = new Map();
  const count = new Map();
  for (const d of Object.values(dict ?? {})) for (const v of new Set(Object.values(d).map(normKey))) count.set(v, (count.get(v) ?? 0) + 1);
  const own = new Set(Object.values(dict?.[page] ?? {}).map(normKey));
  for (const src of ['pl', 'en']) {
    if (src === page || !dict?.[src]) continue;
    for (const [k, v] of Object.entries(dict[src])) {
      const n = normKey(v);
      if (n.length < 3 || !LETTER.test(n) || own.has(n) || (count.get(n) ?? 0) >= 3) continue;
      if (dict[page]?.[k] && normKey(dict[page][k]) === n) continue;
      if (!out.has(n)) out.set(n, src);
    }
  }
  return out;
}

const PL_LETTERS = /[ąęłńśźż]/giu;
// Analiza jednego fragmentu. seg = { text, kind, name }. ctx = { foreign: Map (z foreignPhrases) }.
// Zwraca null albo { type, detected, conf, text, kind }.
export function analyzeSegment(seg, pageLang, ctx = {}) {
  const page = normLang(pageLang);
  const text = normText(seg.text);
  if (!text || !LETTER.test(text)) return null;
  if (/^(https?:\/\/|www\.)\S+$/i.test(text) || /^\S+@\S+\.\S+$/.test(text)) return null;
  if (BRAND.some(re => re.test(text))) return null;
  const f = (type, detected, conf = 1) => ({ type, detected, conf: Math.round(conf * 100) / 100, text: text.slice(0, 300), kind: seg.kind ?? 'text' });
  const plLetters = page !== 'pl' ? (text.match(PL_LETTERS) ?? []).length : 0;
  const words = text.match(TOKEN) ?? [];
  // dokładny napis polskiego/angielskiego UI w obcym języku
  const fx = ctx.foreign?.get(normKey(text));
  if (fx && words.length <= 12) return f('ui-fallback', fx);
  const plWord = page !== 'pl' && words.some(w => PL_UI_WORDS.has(w.toLowerCase()));
  if (seg.name) {   // nazwy przystanków/miast: włoskie są w porządku; zgłaszamy tylko polskie litery i polskie słowa („Parking przy murach”)
    if (plLetters) return f('pl-letters', 'pl');
    return page !== 'pl' && words.some(w => PL_NAME_WORDS.has(w) || PL_UI_WORDS.has(w.toLowerCase())) ? f('ui-word', 'pl') : null;
  }
  const toks = contentTokens(text);
  const capRatio = words.length ? words.filter(isCap).length / words.length : 0;
  if (words.length < 4 || toks.length < 4 || (capRatio >= 0.6 && words.length <= 10)) {
    if (plWord) return f('ui-word', 'pl');
    if (plLetters) return f('pl-letters', 'pl');
    return null;
  }
  const d = detectTokens(toks, text);
  if (d.lang && d.lang !== page) {
    const own = d.scores[page] ?? 0;
    const fam = sameFamily(d.lang, page);
    const minConf = fam ? 0.5 : 0.3;
    if (d.best >= 2 && own <= d.best * (fam ? 0.4 : 0.5) && d.conf >= minConf && (!fam || d.best - own >= 2)) return f('segment', d.lang, d.conf);
  }
  if (plLetters >= 2 || (plLetters && plWord)) return f('pl-letters', 'pl');
  if (plWord && words.length < 8) return f('ui-word', 'pl');
  return null;
}

// ════════════════════════════════════════════════════════════════════════════════════════════
// 2. HTML → fragmenty (bez zależności; HTML z naszego SSR jest przewidywalny)
// ════════════════════════════════════════════════════════════════════════════════════════════
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', bdquo: '„', rdquo: '”', ldquo: '“', rsquo: '’', lsquo: '‘', middot: '·', copy: '©', reg: '®' };
export const decode = (s) => String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e.toLowerCase()] ?? m));
const attrsOf = (s) => {
  const a = {};
  for (const m of String(s).matchAll(/([^\s=\/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) a[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  return a;
};
const BLOCK = new Set('p h1 h2 h3 h4 h5 h6 li ul ol div section article header footer nav main aside button a label td th tr table figcaption figure summary details dt dd dl blockquote option select form br title legend fieldset caption hr body html head dialog menu'.split(' '));
const KIND = { h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading', button: 'button', a: 'link', label: 'label', li: 'list', p: 'paragraph', title: 'title', option: 'option', summary: 'button', figcaption: 'caption', td: 'cell', th: 'cell' };
const VOID = new Set('area base br col embed hr img input link meta source track wbr'.split(' '));
const ATTRS = ['alt', 'title', 'aria-label', 'placeholder'];

export function extract(html) {
  const out = { htmlLang: null, title: null, meta: {}, alternates: [], canonical: null, segments: [] };
  const lang = String(html).match(/<html\b([^>]*)>/i);
  if (lang) out.htmlLang = attrsOf(lang[1]).lang || null;
  const src = String(html).replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|math|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  const stack = [];
  let buf = '';
  const nameCtx = () => stack.some(e => e.name);
  const kindNow = () => { for (let i = stack.length - 1; i >= 0; i--) if (KIND[stack[i].tag]) return KIND[stack[i].tag]; return 'text'; };
  const flush = () => {
    const t = normText(decode(buf)); buf = '';
    if (!t) return;
    const k = kindNow();
    if (k === 'title' && !out.title) { out.title = t; return; }
    out.segments.push({ text: t, kind: k, name: nameCtx() });
  };
  for (const m of src.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>|([^<]+)|</g)) {
    if (m[4] !== undefined || m[0] === '<') { buf += m[4] ?? '<'; continue; }
    const close = !!m[1], tag = m[2].toLowerCase(), a = close ? {} : attrsOf(m[3]);
    if (BLOCK.has(tag)) flush();
    if (close) {
      const i = stack.map(e => e.tag).lastIndexOf(tag);
      if (i > -1) stack.length = i;
      continue;
    }
    if (tag === 'meta') {
      const key = (a.name || a.property || '').toLowerCase();
      if (key && a.content != null) out.meta[key] = normText(a.content);
    }
    if (tag === 'link' && /\balternate\b/i.test(a.rel ?? '') && a.hreflang) out.alternates.push({ hreflang: a.hreflang, href: a.href });
    if (tag === 'link' && /\bcanonical\b/i.test(a.rel ?? '')) out.canonical = a.href;
    for (const at of ATTRS) if (a[at] && normText(a[at])) out.segments.push({ text: normText(a[at]), kind: `attr:${at}`, name: false });
    if (!VOID.has(tag) && !m[3].trim().endsWith('/')) {
      const cls = a.class ?? '';
      const parentStops = stack.some(e => /\bssr-stops\b/.test(e.cls));
      const name = a.translate === 'no' || /(^|[\s_-])name(\b|$)/i.test(cls) || 'data-name' in a
        || (tag === 'h3' && parentStops) || (tag === 'h1' && stack.some(e => /\bssr-public\b/.test(e.cls)));
      stack.push({ tag, cls, name });
    }
  }
  flush();
  for (const k of ['description', 'og:title', 'og:description', 'twitter:title', 'twitter:description'])
    if (out.meta[k]) out.segments.push({ text: out.meta[k], kind: `meta:${k}`, name: false });
  if (out.title) out.segments.push({ text: out.title, kind: 'title', name: false });
  return out;
}

// Język z adresu: /pl/…, /en/… albo ?lang=xx (strony statyczne).
export function urlLang(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)(\/|$)/i);
    return m ? m[1].toLowerCase() : (u.searchParams.get('lang')?.toLowerCase() ?? null);
  } catch { return null; }
}

// Kontrola całej strony: <html lang>, hreflang, og:locale + fragmenty. expected = [{hreflang, href}] z mapy witryny.
export function inspectPage({ url, html, finalUrl, expected = [], foreign }) {
  const x = extract(html);
  const fromUrl = urlLang(url);
  const lang = fromUrl ?? x.htmlLang ?? null;
  const issues = [];
  const add = (type, text, detected = null) => issues.push({ type, text: String(text).slice(0, 300), detected, kind: 'page', conf: 1 });
  if (finalUrl && finalUrl !== url) add('redirect', `przekierowanie na ${finalUrl}`);
  if (!x.htmlLang) add('html-lang-missing', 'brak <html lang>');
  else if (fromUrl && normLang(x.htmlLang) !== normLang(fromUrl)) add('html-lang-mismatch', `<html lang="${x.htmlLang}"> przy adresie /${fromUrl}/`, normLang(x.htmlLang));
  if (x.meta['og:locale'] && lang && normLang(x.meta['og:locale']) !== normLang(lang)) add('og-locale', `og:locale="${x.meta['og:locale']}"`, normLang(x.meta['og:locale']));
  if (x.alternates.length || expected.length) {
    const alt = new Map(x.alternates.map(a => [a.hreflang.toLowerCase(), a.href]));
    for (const a of x.alternates) {
      if (a.hreflang.toLowerCase() === 'x-default') continue;
      const hl = urlLang(a.href);
      if (hl && normLang(hl) !== normLang(a.hreflang)) add('hreflang-wrong', `hreflang="${a.hreflang}" wskazuje ${a.href}`, normLang(hl));
    }
    if (lang && !alt.has(lang)) add('hreflang-self', `brak hreflang="${lang}" wskazującego tę stronę`);
    else if (lang && alt.get(lang) && stripSlash(alt.get(lang)) !== stripSlash(url)) add('hreflang-self', `hreflang="${lang}" wskazuje ${alt.get(lang)} zamiast tej strony`);
    if (!alt.has('x-default')) add('hreflang-x-default', 'brak hreflang="x-default"');
    for (const e of expected) {
      const k = e.hreflang.toLowerCase();
      if (k === 'x-default') continue;
      if (!alt.has(k)) add('hreflang-missing', `brak hreflang="${e.hreflang}" (${e.href})`);
      else if (stripSlash(alt.get(k)) !== stripSlash(e.href)) add('hreflang-wrong', `hreflang="${e.hreflang}" → ${alt.get(k)}, mapa witryny: ${e.href}`);
    }
  }
  const seen = new Set();
  if (lang) for (const s of x.segments) {
    const r = analyzeSegment(s, lang, { foreign });
    if (!r) continue;
    const k = r.type + '|' + normKey(r.text) + '|' + r.detected;
    if (seen.has(k)) continue;
    seen.add(k); issues.push(r);
  }
  const textHash = sha(x.segments.map(s => s.kind + ':' + s.text).join('\n') + '\n' + (x.htmlLang ?? '') + '\n' + x.alternates.map(a => a.hreflang + a.href).join(','));
  return { url, lang, htmlLang: x.htmlLang, segments: x.segments.length, issues, textHash };
}
const stripSlash = (u) => String(u ?? '').replace(/\/+$/, '');
export const sha = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 16);
export const findingKey = (url, f) => sha([url, f.type, normKey(f.text), f.detected ?? ''].join('|'));

// ════════════════════════════════════════════════════════════════════════════════════════════
// 3. WYKRYWANIE ZMIAN (czyste funkcje — testy)
// ════════════════════════════════════════════════════════════════════════════════════════════
// cur = { site: {plik: hash}, ui: {lang: hash}, content: {"slug|lang": hash} }; ERR/null = nie udało się sprawdzić (nie liczymy jako zmiany)
export function planChanges(prev, cur) {
  if (!prev || !prev.site) return { mode: 'full', reasons: ['brak stanu z poprzedniego przebiegu'], slugs: [], langs: [] };
  const reasons = [];
  const siteChanged = Object.entries(cur.site ?? {}).filter(([k, v]) => v && v !== 'ERR' && prev.site[k] && prev.site[k] !== 'ERR' && prev.site[k] !== v
    || (v && v !== 'ERR' && !(k in prev.site))).map(([k]) => k);
  if (siteChanged.length) return { mode: 'full', reasons: [`zmiana kodu strony: ${siteChanged.join(', ')}`], slugs: [], langs: [] };
  const langs = new Set();
  if (cur.ui && prev.ui) {
    const keys = new Set([...Object.keys(cur.ui), ...Object.keys(prev.ui)]);
    for (const l of keys) if (cur.ui[l] !== prev.ui[l]) langs.add(l);
    if (langs.has('pl') || langs.has('en')) return { mode: 'full', reasons: [`zmiana UI w języku zapasowym (${[...langs].filter(l => l === 'pl' || l === 'en').join(', ')}) — dotyczy wszystkich języków`], slugs: [], langs: [] };
    if (langs.size) reasons.push(`zmiana UI: ${[...langs].join(', ')}`);
  }
  const slugs = new Set();
  if (cur.content && prev.content) {
    const keys = new Set([...Object.keys(cur.content), ...Object.keys(prev.content)]);
    for (const k of keys) if (cur.content[k] !== prev.content[k]) slugs.add(k.split('|')[0]);
    if (slugs.size) reasons.push(`zmiana treści miast: ${[...slugs].join(', ')}`);
  }
  const pending = Object.keys(prev.pending ?? {});
  if (pending.length) reasons.push(`strony czekające na odświeżenie pamięci podręcznej SSR: ${pending.length}`);
  if (!langs.size && !slugs.size && !pending.length) return { mode: 'none', reasons: [], slugs: [], langs: [] };
  return { mode: 'partial', reasons, slugs: [...slugs], langs: [...langs], pending };
}

// Które strony sprawdzić w trybie częściowym. pages = [{url, lang}], slugOf(url) → slug | null.
export function selectPages(pages, plan, slugOf) {
  if (plan.mode === 'full') return pages;
  if (plan.mode === 'none') return [];
  const S = new Set(plan.slugs), L = new Set(plan.langs.map(normLang)), P = new Set(plan.pending ?? []);
  return pages.filter(p => P.has(p.url) || L.has(normLang(p.lang)) || (slugOf(p.url) && S.has(slugOf(p.url))));
}

// Nowe i rozwiązane problemy. prev = { key: finding }, fresh = { key: finding } tylko ze sprawdzonych stron,
// checked = Set(url) sprawdzonych, gone = Set(url) stron, których już nie ma w mapie witryny (tylko przy pełnym przeglądzie).
export function diffFindings(prev, fresh, checked, gone = new Set()) {
  const open = {}, added = [], resolved = [];
  for (const [k, f] of Object.entries(prev ?? {})) {
    if (checked.has(f.url) || gone.has(f.url)) { if (!(k in fresh)) resolved.push(f); else open[k] = { ...fresh[k], firstSeen: f.firstSeen ?? fresh[k].firstSeen }; }
    else open[k] = f;
  }
  for (const [k, f] of Object.entries(fresh)) if (!(k in (prev ?? {}))) { added.push(f); open[k] = f; }
  return { open, added, resolved };
}

// Strony, którym po zmianie w bazie nie zmienił się tekst (SSR trzyma pamięć podręczną ~5 min) → jeszcze raz w następnym przebiegu.
export function nextPending(prevPending, checkedPages, prevHashes, plan, maxTries = 2) {
  const out = {};
  if (plan.mode !== 'partial') return out;
  for (const p of checkedPages) {
    const unchanged = prevHashes[p.url] && prevHashes[p.url] === p.textHash;
    const tries = (prevPending?.[p.url] ?? 0) + 1;
    if (unchanged && tries <= maxTries) out[p.url] = tries;
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════════════════════
// 4. URUCHOMIENIE (VPS, kontener Hermesa)
// ════════════════════════════════════════════════════════════════════════════════════════════
const UA = 'Quolino-lang-inspect/1.0 (+https://quolino.com)';
const SITE_FILES = ['/', '/city.html', '/i18n-ui.js', '/i18n.js', '/app.js', '/trip-ui.js', '/kids-view.js', '/styles.css'];
const TYPE_PL = {
  'segment': 'fragment w innym języku', 'pl-letters': 'polskie litery', 'ui-word': 'polskie słowo interfejsu', 'ui-fallback': 'napis UI z języka zapasowego',
  'html-lang-missing': 'brak <html lang>', 'html-lang-mismatch': '<html lang> ≠ adres', 'og-locale': 'og:locale ≠ język', 'hreflang-missing': 'brak hreflang',
  'hreflang-wrong': 'zły hreflang', 'hreflang-self': 'hreflang bez tej strony', 'hreflang-x-default': 'brak x-default', 'redirect': 'przekierowanie',
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const safe = (s, n = 120) => String(s ?? '').replace(/[`*_~|<>@]/g, '').replace(/\s+/g, ' ').slice(0, n);

async function get(url, timeout = 20_000) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': '*' }, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
  return { status: r.status, url: r.url || url, text: await r.text() };
}

async function sitemapPages(site) {
  const pages = new Map();   // url → { url, alternates: [{hreflang, href}] }
  const queue = [`${site}/sitemap.xml`], seen = new Set();
  while (queue.length && seen.size < 50) {
    const sm = queue.shift();
    if (seen.has(sm)) continue;
    seen.add(sm);
    const r = await get(sm, 30_000);
    if (r.status !== 200) throw new Error(`mapa witryny ${sm}: HTTP ${r.status}`);
    if (/<sitemapindex\b/i.test(r.text)) { for (const m of r.text.matchAll(/<sitemap>[\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>/gi)) queue.push(decode(m[1])); continue; }
    for (const m of r.text.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
      const loc = m[1].match(/<loc>\s*([^<\s]+)\s*<\/loc>/i);
      if (!loc) continue;
      const url = decode(loc[1]);
      const alternates = [...m[1].matchAll(/<xhtml:link\b([^>]*)\/?>/gi)].map(a => attrsOf(a[1])).filter(a => a.hreflang && a.href).map(a => ({ hreflang: a.hreflang, href: a.href }));
      pages.set(url, { url, alternates });
    }
  }
  return [...pages.values()];
}

// Słownik UI ze strony (i18n-ui.js): { lang: { key: value } }
export function parseUiJs(js) {
  try {
    const keys = JSON.parse(js.match(/var KEYS\s*=\s*(\[[\s\S]*?\]);/)[1]);
    const raw = JSON.parse(js.match(/var RAW\s*=\s*(\{[\s\S]*?\n\s*\});/)[1].replace(/,\s*}/g, '}'));
    return Object.fromEntries(Object.entries(raw).map(([l, s]) => { const v = s.split('|'); return [l, Object.fromEntries(keys.map((k, i) => [k, v[i]]).filter(([, x]) => x))]; }));
  } catch { return {}; }
}

async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

async function dbSignals(c, onlyLang) {
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;
  const ui = Object.fromEntries((await q(`SELECT lang, md5(string_agg(key || '=' || coalesce(value, ''), '|' ORDER BY key)) AS h FROM public.ui_translations GROUP BY lang`)).map(r => [r.lang, r.h]));
  const content = Object.fromEntries((await q(`
    SELECT slug || '|' || lang AS k, md5(string_agg(h, '|' ORDER BY h)) AS h FROM (
      SELECT c.slug, '*' AS lang, md5(row(c.slug, c.status, c.duration_type, c.region_slug, c.country)::text) AS h FROM public.cities c WHERE c.status = 'published'
      UNION ALL
      SELECT t.city_slug, t.lang, md5(row(t.title, t.region_label, t.subtitle, t.lead)::text) FROM public.city_translations t
        JOIN public.cities c ON c.slug = t.city_slug AND c.status = 'published'
      UNION ALL
      SELECT s.city_slug, t.lang, md5(row(s.id, s.sort_order, s.stop_key, t.name, t.desc_paragraphs)::text) FROM public.stops s
        JOIN public.cities c ON c.slug = s.city_slug AND c.status = 'published' JOIN public.stop_translations t ON t.stop_id = s.id
    ) x GROUP BY 1`)).map(r => [r.k, r.h]));
  if (onlyLang) for (const k of Object.keys(content)) if (!k.endsWith('|' + onlyLang) && !k.endsWith('|*') && !k.endsWith('|pl')) delete content[k];
  return { ui, content };
}

async function dbCompleteness(c, onlyLang) {
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;
  const langs = (await q(`SELECT code FROM public.languages WHERE enabled IS NOT FALSE ORDER BY priority, code`)).map(r => r.code).filter(l => !onlyLang || l === onlyLang || l === 'pl');
  const ui = {}; for (const r of await q(`SELECT lang, key, value FROM public.ui_translations WHERE btrim(coalesce(value, '')) <> ''`)) (ui[r.lang] ??= {})[r.key] = r.value;
  const cities = {}; for (const r of await q(`SELECT lang, city_slug FROM public.public_city_translations`)) (cities[r.lang] ??= new Set()).add(r.city_slug);
  const stops = {}; for (const r of await q(`SELECT lang, stop_id, city_slug FROM public.public_stops`)) (stops[r.lang] ??= new Map()).set(r.stop_id, r.city_slug);
  const plUi = Object.keys(ui.pl ?? {}), plCities = cities.pl ?? new Set(), plStops = stops.pl ?? new Map();
  const rows = langs.filter(l => l !== 'pl').map(l => {
    const missUi = plUi.filter(k => !ui[l]?.[k]).sort();
    const missCities = [...plCities].filter(s => !cities[l]?.has(s)).sort();
    const missStopsBy = {};
    for (const [id, slug] of plStops) if (!stops[l]?.has(id)) missStopsBy[slug] = (missStopsBy[slug] ?? 0) + 1;
    return { lang: l, uiHave: plUi.length - missUi.length, uiTotal: plUi.length, missUi, cityHave: plCities.size - missCities.length, cityTotal: plCities.size, missCities,
      stopHave: plStops.size - Object.values(missStopsBy).reduce((a, b) => a + b, 0), stopTotal: plStops.size, missStopsBy };
  });
  return { rows, ui };
}

function dbFindings(rows) {
  const out = {};
  for (const r of rows) {
    for (const k of r.missUi) { const f = { url: `db:ui:${r.lang}`, lang: r.lang, type: 'db-ui-missing', text: k, detected: null }; out[findingKey(f.url, f)] = f; }
    for (const s of r.missCities) { const f = { url: `db:city:${r.lang}`, lang: r.lang, type: 'db-city-missing', text: s, detected: null }; out[findingKey(f.url, f)] = f; }
    for (const [s, n] of Object.entries(r.missStopsBy)) { const f = { url: `db:stops:${r.lang}`, lang: r.lang, type: 'db-stops-missing', text: s, detected: null, n }; out[findingKey(f.url, f)] = f; }
  }
  return out;
}

const describe = (f) => {
  if (f.type?.startsWith('db-')) return { 'db-ui-missing': `brak klucza UI „${f.text}”`, 'db-city-missing': `brak opisu miasta ${f.text}`, 'db-stops-missing': `brak tłumaczeń przystanków w ${f.text}${f.n ? ` (${f.n})` : ''}` }[f.type];
  return `${TYPE_PL[f.type] ?? f.type}${f.detected ? ` [${f.detected}]` : ''}${f.kind && f.kind !== 'page' ? ` (${f.kind})` : ''}: „${f.text}”`;
};
const pathOf = (u) => { try { const x = new URL(u); return x.pathname + x.search; } catch { return u; } };

function buildReport({ date, mode, plan, pages, results, open, added, resolved, db, errors, limitNote }) {
  const L = [`# Inspektor językowy — ${date}`, '', `Tryb: **${mode}**${plan?.reasons?.length ? ` — ${plan.reasons.join('; ')}` : ''}${limitNote ? ` · ${limitNote}` : ''}`, '',
    `Sprawdzone teraz: ${results.length} stron (z ${pages.length} w mapie witryny). Błędy pobrania: ${errors.length}.`, ''];
  const byPage = {};
  for (const f of Object.values(open)) if (!f.url.startsWith('db:')) (byPage[f.url] ??= []).push(f);
  const langs = [...new Set(pages.map(p => p.lang))].sort();
  L.push('## Języki (stan bieżący — wszystkie znane strony)', '', '| język | stron | z problemami | problemów | najczęściej |', '|---|---|---|---|---|');
  for (const l of langs) {
    const ps = pages.filter(p => p.lang === l), bad = ps.filter(p => byPage[p.url]?.length);
    const types = {}; for (const p of bad) for (const f of byPage[p.url]) types[f.type] = (types[f.type] ?? 0) + 1;
    L.push(`| ${l} | ${ps.length} | ${bad.length} | ${bad.reduce((a, p) => a + byPage[p.url].length, 0)} | ${Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, n]) => `${TYPE_PL[t] ?? t} ${n}`).join(', ')} |`);
  }
  // napisy powtarzające się na wielu stronach = szablon / UI (jedna poprawka naprawia wszystkie)
  const rep = {};
  for (const fs of Object.values(byPage)) for (const f of fs) if (f.kind !== 'page') { const k = `${f.lang}|${f.type}|${normKey(f.text)}`; (rep[k] ??= { f, n: 0 }).n++; }
  const common = Object.values(rep).filter(x => x.n >= 3).sort((a, b) => b.n - a.n);
  if (common.length) {
    L.push('', '## Powtarzające się na wielu stronach (szablon / brakujący klucz UI)', '');
    for (const { f, n } of common.slice(0, 40)) L.push(`- **${f.lang}** × ${n} stron — ${describe(f)}`);
  }
  const worst = Object.entries(byPage).sort((a, b) => b[1].length - a[1].length);
  L.push('', '## Strony z problemami (od najgorszej)', '');
  if (!worst.length) L.push('Brak. 🎉');
  for (const [url, fs] of worst.slice(0, 60)) {
    L.push(`### ${pathOf(url)} (${fs[0].lang}, ${fs.length})`);
    for (const f of fs.slice(0, 12)) L.push(`- ${describe(f)}`);
    if (fs.length > 12) L.push(`- … i ${fs.length - 12} więcej`);
    L.push('');
  }
  if (added || resolved) {
    L.push('## Zmiana od poprzedniego przebiegu', '', `Nowe: ${added.length} · rozwiązane: ${resolved.length}`, '');
    for (const f of added.slice(0, 50)) L.push(`- 🆕 ${f.url.startsWith('db:') ? '' : pathOf(f.url) + ' — '}${describe(f)}`);
    for (const f of resolved.slice(0, 50)) L.push(`- ✅ ${f.url.startsWith('db:') ? '' : pathOf(f.url) + ' — '}${describe(f)}`);
    L.push('');
  }
  if (db) {
    L.push('## Baza: kompletność tłumaczeń względem polskiego', '', '| język | klucze UI | opisy miast | przystanki | brakujące klucze UI (pierwsze) |', '|---|---|---|---|---|');
    for (const r of db.rows) L.push(`| ${r.lang} | ${r.uiHave}/${r.uiTotal} | ${r.cityHave}/${r.cityTotal} | ${r.stopHave}/${r.stopTotal} | ${r.missUi.slice(0, 8).join(', ')}${r.missUi.length > 8 ? ` … (+${r.missUi.length - 8})` : ''} |`);
    L.push('', 'Brak klucza UI = strona w tym języku pokazuje napis polski (SSR) albo angielski/polski (przeglądarka) — mieszanka języków.');
  } else L.push('## Baza', '', 'Pominięta (--no-db albo brak połączenia).');
  if (errors.length) { L.push('', '## Błędy pobrania', ''); for (const e of errors.slice(0, 30)) L.push(`- ${pathOf(e.url)}: ${e.error}`); }
  L.push('', '---', 'Jak czytać: docs/INSPEKTOR-JEZYKOWY.md');
  return L.join('\n') + '\n';
}

function discordFull({ date, pages, open, db, added, resolved, errors, reportFile }) {
  const byPage = {};
  for (const f of Object.values(open)) if (!f.url.startsWith('db:')) (byPage[f.url] ??= []).push(f);
  const langs = [...new Set(pages.map(p => p.lang))].sort();
  const L = [`🈯 **Inspektor językowy — ${date}** (pełny przegląd, ${pages.length} stron)`];
  L.push(langs.map(l => { const ps = pages.filter(p => p.lang === l); const bad = ps.filter(p => byPage[p.url]?.length).length; return `${l} ${bad ? `**${bad}**` : '0'}/${ps.length}`; }).join(' · ') + '  _(stron z problemami / sprawdzonych)_');
  const worst = Object.entries(byPage).sort((a, b) => b[1].length - a[1].length).slice(0, 10);
  if (worst.length) {
    L.push('**Najgorsze strony:**');
    for (const [url, fs] of worst) { const f = fs.find(x => x.kind !== 'page') ?? fs[0]; L.push(`• ${safe(pathOf(url), 90)} — ${fs.length}× · „${safe(f.text, 70)}” → ${f.detected ?? TYPE_PL[f.type] ?? f.type}`); }
  } else L.push('Wszystkie strony spójne językowo. ✅');
  if (db) {
    const miss = db.rows.filter(r => r.missUi.length);
    L.push(miss.length ? `**Brakujące klucze UI:** ${miss.map(r => `${r.lang} ${r.missUi.length}`).join(' · ')}` : 'Klucze UI: komplet we wszystkich językach.');
    const mc = db.rows.filter(r => r.cityHave < r.cityTotal || r.stopHave < r.stopTotal);
    if (mc.length) L.push(`**Treści:** ${mc.map(r => `${r.lang} miasta ${r.cityHave}/${r.cityTotal}, przystanki ${r.stopHave}/${r.stopTotal}`).join(' · ')}`);
  }
  if (added.length || resolved.length) L.push(`Od poprzedniego przebiegu: 🆕 ${added.length} · ✅ ${resolved.length}`);
  if (errors.length) L.push(`⚠️ błędy pobrania: ${errors.length}`);
  L.push(`Raport: \`${reportFile}\``);
  return L.join('\n');
}

function discordChanges({ added, resolved, plan, reportFile }) {
  if (!added.length && !resolved.length) return null;
  const L = [`🈯 **Inspektor językowy** — ${safe(plan.reasons.join('; '), 200)}`];
  const grp = (fs) => { const m = {}; for (const f of fs) (m[f.url] ??= []).push(f); return Object.entries(m); };
  if (added.length) {
    L.push(`🆕 **Nowe problemy: ${added.length}**`);
    for (const [url, fs] of grp(added).slice(0, 12)) L.push(`• ${url.startsWith('db:') ? safe(url.slice(3), 40) : safe(pathOf(url), 90)} — ${fs.length > 1 ? `${fs.length}× · ` : ''}${safe(describe(fs[0]), 140)}`);
  }
  if (resolved.length) {
    L.push(`✅ **Rozwiązane: ${resolved.length}**`);
    for (const [url, fs] of grp(resolved).slice(0, 6)) L.push(`• ${url.startsWith('db:') ? safe(url.slice(3), 40) : safe(pathOf(url), 90)} — ${fs.length}×`);
  }
  L.push(`Raport: \`${reportFile}\``);
  return L.join('\n');
}

async function main() {
  const { env, log, db } = await import('./lib.mjs');
  const { notify } = await import('./draft-lib.mjs');
  const argv = process.argv.slice(2);
  const opt = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : undefined; };
  const DRY = argv.includes('--dry-run') || argv.includes('--dry');
  const CHANGED = argv.includes('--changed');
  const NO_DB = argv.includes('--no-db');
  const LIMIT = opt('--limit') ? Math.max(1, +opt('--limit')) : null;
  const ONLY = opt('--lang')?.toLowerCase() ?? null;
  const SITE = (opt('--site') ?? env('QUOLINO_SITE_URL') ?? 'https://quolino.com').replace(/\/$/, '');
  const CHANNEL = opt('--notify') ?? env('QUOLINO_LANG_CHANNEL') ?? '#jezyki';
  const WORK = env('QUOLINO_WORK_DIR') ?? '/opt/data/quolino/work';
  const STATE = `${WORK}/lang-inspect.state.json`, LOCK = `${WORK}/lang-inspect.lock`;
  const date = new Date().toISOString().slice(0, 10);
  const REPORT = `${WORK}/lang-inspect-${date}${DRY ? '.dry' : ''}.md`;
  const partialRun = !!(LIMIT || ONLY);   // ograniczony przebieg: nie zamyka problemów stron, których nie sprawdził
  mkdirSync(WORK, { recursive: true });

  // blokada: tygodniowy pełny przegląd i przebieg co 15 min nie mogą się nałożyć
  try { if (existsSync(LOCK) && Date.now() - statSync(LOCK).mtimeMs < 2 * 3600_000) { log('lang-inspect: poprzedni przebieg jeszcze trwa — pomijam'); return; } } catch {}
  writeFileSync(LOCK, String(process.pid));
  let c = null;
  try {
    let prev = null;
    try { prev = JSON.parse(readFileSync(STATE, 'utf8')); } catch {}

    // ── sygnały zmian (tanie: kilka małych plików + dwa zapytania do bazy) ──
    const site = {}; let uiJs = '';
    await pool(SITE_FILES, 2, async (p) => {
      try { const r = await get(SITE + p); site[p] = r.status === 200 ? sha(r.text) : 'ERR'; if (p === '/i18n-ui.js' && r.status === 200) uiJs = r.text; }
      catch { site[p] = 'ERR'; }
    });
    let sig = { ui: null, content: null };
    if (!NO_DB) {
      try { c = await db(); sig = await dbSignals(c, ONLY); } catch (e) { log('lang-inspect: baza niedostępna —', e.message); try { await c?.end(); } catch {} c = null; }
    }
    const cur = { site, ui: sig.ui, content: sig.content };
    const plan = CHANGED ? planChanges(prev, { ...cur, ui: cur.ui ?? prev?.ui, content: cur.content ?? prev?.content, pending: undefined })
      : { mode: 'full', reasons: ['przegląd pełny'], slugs: [], langs: [] };
    if (CHANGED && prev?.pending && plan.mode === 'partial') plan.pending = Object.keys(prev.pending);
    if (plan.mode === 'none') { log('lang-inspect: bez zmian'); return; }
    log(`lang-inspect: ${plan.mode} — ${plan.reasons.join('; ')}`);

    // ── lista stron ──
    let pages;
    try { pages = (await sitemapPages(SITE)).map(p => ({ ...p, lang: urlLang(p.url) })); }
    catch (e) {
      // strona niedostępna to nie błąd skryptu (alarm daje healthcheck); stan bez zmian → następny przebieg spróbuje znowu
      const msg = `lang-inspect: nie pobrałem mapy witryny (${e.cause?.code ?? e.message}) — przegląd pominięty`;
      log(msg);
      if (!CHANGED && !DRY) await notify(CHANNEL, `⚠️ Inspektor językowy: ${safe(msg, 300)}`);
      return;
    }
    if (ONLY) pages = pages.filter(p => !p.lang || normLang(p.lang) === normLang(ONLY));
    let slugOf = () => null;
    if (plan.mode === 'partial' && plan.slugs.length) {
      try {
        let paths; try { paths = JSON.parse((await get(`${SITE}/pl/paths/`)).text); } catch { paths = JSON.parse((await get(`${SITE}/paths.json`)).text); }
        const m = new Map(); for (const [slug, ls] of Object.entries(paths)) for (const p of Object.values(ls)) m.set(stripSlash(p), slug);
        slugOf = (u) => { try { return m.get(stripSlash(new URL(u).pathname)) ?? null; } catch { return null; } };
      } catch (e) { log('lang-inspect: brak mapy adresów miast (paths) — sprawdzam wszystko', e.message); plan.mode = 'full'; plan.reasons.push('brak mapy adresów → pełny'); }
    }
    let todo = selectPages(pages, plan, slugOf);
    if (LIMIT) todo = todo.slice(0, LIMIT);

    // ── słownik UI (strona + baza) do wykrywania napisów-fallbacków ──
    const dict = parseUiJs(uiJs);
    let dbc = null;
    if (c) {
      try { dbc = await dbCompleteness(c, ONLY); for (const [l, d] of Object.entries(dbc.ui)) dict[l] = { ...(dict[l] ?? {}), ...d }; }
      catch (e) { log('lang-inspect: kontrola bazy nie powiodła się —', e.message); }
      try { await c.end(); } catch {}
      c = null;
    }
    const foreignBy = {};
    const foreignFor = (l) => (foreignBy[l] ??= foreignPhrases(dict, l));

    // ── przegląd stron: 2 naraz, z przerwą ──
    const errors = [];
    const results = (await pool(todo, 2, async (p) => {
      await sleep(400);
      try {
        const r = await get(p.url);
        if (r.status !== 200) { errors.push({ url: p.url, error: `HTTP ${r.status}` }); return null; }
        const lang = p.lang ?? extract(r.text).htmlLang;
        return inspectPage({ url: p.url, html: r.text, finalUrl: r.url, expected: p.alternates, foreign: foreignFor(normLang(lang)) });
      } catch (e) { errors.push({ url: p.url, error: e.cause?.code ?? e.name ?? e.message }); return null; }
    })).filter(Boolean);
    for (const p of pages) if (!p.lang) p.lang = results.find(r => r.url === p.url)?.lang ?? '?';

    // ── nowe / rozwiązane ──
    const fresh = {};
    const now = new Date().toISOString();
    for (const r of results) for (const f of r.issues) fresh[findingKey(r.url, f)] = { ...f, url: r.url, lang: r.lang, firstSeen: now };
    const checked = new Set(results.map(r => r.url));
    const known = new Set(pages.map(p => p.url));
    const gone = plan.mode === 'full' && !partialRun ? new Set(Object.values(prev?.findings ?? {}).map(f => f.url).filter(u => !u.startsWith('db:') && !known.has(u))) : new Set();
    let dbFresh = null;
    if (dbc) { dbFresh = dbFindings(dbc.rows); for (const f of Object.values(dbFresh)) f.firstSeen = now; Object.assign(fresh, dbFresh); for (const r of dbc.rows) for (const u of ['ui', 'city', 'stops']) checked.add(`db:${u}:${r.lang}`); }
    const prevFindings = prev?.findings ?? {};
    const { open, added, resolved } = diffFindings(prevFindings, fresh, checked, gone);

    const prevHashes = Object.fromEntries(Object.entries(prev?.pages ?? {}).map(([u, p]) => [u, p.hash]));
    const pending = nextPending(prev?.pending, results, prevHashes, plan);
    const report = buildReport({ date, mode: CHANGED ? `zmiany (${plan.mode})` : 'pełny', plan, pages, results, open, added: prev ? added : null, resolved: prev ? resolved : null, db: dbc, errors,
      limitNote: [LIMIT && `--limit ${LIMIT}`, ONLY && `--lang ${ONLY}`].filter(Boolean).join(' ') });
    writeFileSync(REPORT, report);
    log(`lang-inspect: ${results.length} stron, problemów otwartych ${Object.keys(open).length}, nowych ${added.length}, rozwiązanych ${resolved.length} → ${REPORT}`);

    const text = CHANGED && prev ? discordChanges({ added, resolved, plan, reportFile: REPORT })
      : discordFull({ date, pages, open, db: dbc, added: prev ? added : [], resolved: prev ? resolved : [], errors, reportFile: REPORT });
    if (DRY) { console.log(report); if (text) console.log('\n--- Discord (nie wysłano: --dry-run) ---\n' + text); }
    else {
      if (text) await notify(CHANNEL, text);
      // stan (nie przy --dry-run): sygnały, skróty tekstu stron, otwarte problemy
      const pagesState = { ...(prev?.pages ?? {}) };
      for (const r of results) pagesState[r.url] = { hash: r.textHash, lang: r.lang, at: now, issues: r.issues.length };
      if (plan.mode === 'full' && !partialRun) for (const u of Object.keys(pagesState)) if (!known.has(u)) delete pagesState[u];
      const keepSig = (a, b) => { const o = { ...(b ?? {}) }; for (const [k, v] of Object.entries(a ?? {})) if (v !== 'ERR' || !o[k]) o[k] = v; return o; };
      const state = { version: 1, at: now, site: keepSig(site, prev?.site), ui: sig.ui ?? prev?.ui ?? null, content: sig.content ?? prev?.content ?? null,
        pages: pagesState, findings: open, pending };
      // ograniczony przebieg (--limit/--lang) nie przesuwa sygnałów: następny --changed sprawdzi resztę
      if (partialRun && prev) { state.site = prev.site; state.ui = prev.ui; state.content = prev.content; }
      writeFileSync(STATE + '.tmp', JSON.stringify(state)); renameSync(STATE + '.tmp', STATE);
    }
    if (!text && CHANGED) log('lang-inspect: brak nowych i rozwiązanych problemów — bez wiadomości');
  } finally { try { await c?.end(); } catch {} try { unlinkSync(LOCK); } catch {} }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('lang-inspect BŁĄD:', e.stack ?? e.message); process.exitCode = 1; });
}
