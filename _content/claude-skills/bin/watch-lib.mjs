// Strażnicy aktualności tras (JP 2026-10-30) — czyste funkcje i strażnicy z wstrzykiwanymi zależnościami (sieć, magazyn, AI).
// Klej z bazą, harmonogram i CLI: watch.mjs. Testy: watch.test.mjs (sztuczne strony, magazyn w pamięci, bez sieci i bazy).
//
// Zasady JP: nie wymyślać faktów (cena/godziny tylko z cytatu strony oficjalnej, inaczej „sprawdź na miejscu”), nigdy „podobno”,
// AI wyłącznie przy wykrytej zmianie i krótko, bez „—” w tekstach dla czytelnika. Wynik: wiersze ops.watch_findings do decyzji JP.
import { plainHtml } from './source-check.mjs';

// ── drobiazgi ────────────────────────────────────────────────────────────────────────────────────
export const DAY = 86_400_000;
export const iso = (d) => new Date(d).toISOString().slice(0, 10);
export const addDays = (isoDate, n) => iso(Date.parse(isoDate + 'T00:00:00Z') + n * DAY);
export const plDate = (isoDate) => isoDate ? `${isoDate.slice(8, 10)}.${isoDate.slice(5, 7)}.${isoDate.slice(0, 4)}` : '';
export function shortHash(s) { let h = 5381; for (const c of String(s)) h = ((h << 5) + h + c.codePointAt(0)) >>> 0; return h.toString(36); }
const norm = (s) => String(s ?? '').toLowerCase().replace(/[„”"«»“’‘']/g, '').replace(/\s+/g, ' ').trim();
const clip = (s, n = 300) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
export const noDashText = (t) => String(t).replace(/\s*[—–]\s*/g, (m) => /^\S+$/.test(m) ? '-' : ' - ');

// ── daty włoskie i angielskie ────────────────────────────────────────────────────────────────────
const MONTHS = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, sett: 9, ott: 10, nov: 11, dic: 12,
  jan: 1, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, dec: 12,
};
const MON_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
const RE_DMY_WORD = new RegExp(`\\b(\\d{1,2})(?:°|º|st|nd|rd|th)?\\s+(?:of\\s+)?(${MON_RE})\\.?(?:\\s+(\\d{4}))?\\b`, 'giu');
const RE_MDY_WORD = new RegExp(`\\b(${MON_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?(?:\\s+(\\d{4}))?\\b`, 'giu');
const RE_NUM_Y = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})\b/g;
const RE_NUM_SLASH = /\b(\d{1,2})\/(\d{1,2})\b(?![./-]\d)/g;
function mkDate(d, m, y, now) {
  d = +d; m = +m; if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12)) return null;
  let year = y ? (String(y).length === 2 ? 2000 + +y : +y) : new Date(now).getUTCFullYear();
  const t = Date.UTC(year, m - 1, d); if (new Date(t).getUTCDate() !== d) return null;
  // bez roku: data sprzed ponad 60 dni to już następny rok („fino al 31 marzo” czytane w październiku)
  if (!y && t < now - 60 * DAY) year++;
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
export function parseDates(text, now = Date.now()) {
  const out = [], s = String(text ?? '');
  const push = (index, raw, isoDate) => { if (isoDate && !out.some(o => o.index === index)) out.push({ index, raw, iso: isoDate }); };
  for (const m of s.matchAll(RE_DMY_WORD)) push(m.index, m[0], mkDate(m[1], MONTHS[m[2].toLowerCase()], m[3], now));
  for (const m of s.matchAll(RE_MDY_WORD)) push(m.index, m[0], mkDate(m[2], MONTHS[m[1].toLowerCase()], m[3], now));
  for (const m of s.matchAll(RE_NUM_Y)) push(m.index, m[0], mkDate(m[1], m[2], m[3], now));
  for (const m of s.matchAll(RE_NUM_SLASH)) push(m.index, m[0], mkDate(m[1], m[2], null, now));
  return out.sort((a, b) => a.index - b.index);
}
const END_MARK = /(?:^|[^\p{L}])(fino\s+al?l?['’]?|fino\s+a|sino\s+al|until|till|through|thru|to|al|riapr\p{L}*(?:\s+(?:il|dal|a\s+partire\s+dal))?|riapertura(?:\s+prevista)?(?:\s+(?:il|per\s+il|dal))?|reopen\p{L}*(?:\s+on)?|-|–)\s*$/iu;
const START_MARK = /(?:^|[^\p{L}])(dal|from|a\s+partire\s+dal|since|starting)\s*$/iu;
// data końca w pobliżu trafienia: po znaczniku „fino al / until / riapre…”, w zakresie „dal X al Y” — Y
export function endDateNear(text, index, now = Date.now(), { before = 80, after = 350 } = {}) {
  const a = Math.max(0, index - before), win = String(text).slice(a, index + after);
  const ds = parseDates(win, now);
  if (!ds.length) return null;
  const marked = ds.filter(d => END_MARK.test(win.slice(Math.max(0, d.index - 40), d.index)));
  if (marked.length) return marked[0].iso;
  const notStart = ds.filter(d => !START_MARK.test(win.slice(Math.max(0, d.index - 25), d.index)));
  if (ds.length >= 2) return ds.map(d => d.iso).sort().at(-1);
  return notStart[0]?.iso ?? null;
}

// ── okna tekstu wokół słów kluczowych ────────────────────────────────────────────────────────────
export const PRICE_WORDS = /bigliett\p{L}*|ingress\p{L}*|tariff\p{L}*|prezz\p{L}*|costo|tickets?|admission|entrance fee|entry fee|prices?\b/giu;
export const HOURS_WORDS = /orari\p{L}*|apertur\p{L}*|opening|hours|timetable|aperto|open (?:daily|every|from)/giu;
export function windows(text, re, win = 260) {
  const s = String(text ?? ''), out = [];
  for (const m of s.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))) {
    const a = Math.max(0, m.index - 60), b = Math.min(s.length, m.index + win);
    const last = out.at(-1);
    if (last && a <= last.b) { last.b = Math.max(last.b, b); last.text = s.slice(last.a, last.b); } else out.push({ a, b, text: s.slice(a, b) });
  }
  return out;
}

// ── kwoty w euro ─────────────────────────────────────────────────────────────────────────────────
const AMOUNT_RE = /(?:€\s*(\d{1,3}(?:[.,]\d{1,2})?)(?![\d])|(?<![\d.,])(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:€|euro\b|eur\b))/giu;
export const fmtAmount = (n) => Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',');
export function amounts(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(AMOUNT_RE)) {
    const raw = m[1] ?? m[2], n = +raw.replace(',', '.');
    if (n >= 0 && n <= 300) out.push({ n, raw, index: m.index + m[0].indexOf(raw), len: raw.length });
  }
  return out;
}
const PAGE_FULL = /(intero|interi|adult\p{L}*|full|normale|ordinario|standard)[^€]{0,25}€?\s*$/iu;
const PAGE_RED = /(ridott\p{L}*|reduced|bambin\p{L}*|ragazz\p{L}*|children|child|kids?|under\s*\d+|student\p{L}*|concession\p{L}*|junior)[^€]{0,25}€?\s*$/iu;
const TRIP_RED = /(dzie(ci|cko|cięc)|ulgow\p{L}*|ulg\.|młodzież|student\p{L}*|senior\p{L}*|do \d+ lat|\d+[–-]\d+ lat)/iu;

// Cena: porównanie kwot z trasy z kwotami przy słowach o biletach na stronie. Zwraca same | changed | missing | no_data.
export function comparePrice(tripPrice, pageText) {
  const ws = windows(pageText, PRICE_WORDS, 240);
  const page = ws.flatMap(w => amounts(w.text).map(x => ({ ...x, w })));
  if (!page.length) return { status: 'no_data' };
  const pageSet = [...new Set(page.map(x => x.n))].sort((a, b) => a - b);
  const best = ws.map(w => ({ w, k: amounts(w.text).length })).sort((a, b) => b.k - a.k)[0].w;
  const quote = clip(best.text, 300);
  const trip = amounts(tripPrice);
  if (!tripPrice || !trip.length) return { status: tripPrice && /bezpł|gratis|darmow|free/i.test(tripPrice) ? (pageSet.some(n => n > 0) ? 'changed' : 'same') : 'missing', page: pageSet, quote };
  if (trip.every(t => pageSet.includes(t.n))) return { status: 'same', page: pageSet, quote };
  // propozycja kodem: kwota „intero / adulti” za kwotę ogólną, „ridotto / bambini” za ulgową — tylko gdy każda ma odpowiednik
  const cls = (x, src, re) => re.test(src.slice(Math.max(0, x.index - 40), x.index));
  const full = page.find(x => cls(x, x.w.text, PAGE_FULL)), red = page.find(x => cls(x, x.w.text, PAGE_RED));
  let after = null;
  const s = String(tripPrice);
  const map = trip.map(t => {   // klasa kwoty z trasy: tylko jej własny fragment (do przecinka / średnika / następnej kwoty)
    const aft = s.slice(t.index + t.len, t.index + t.len + 40).split(/[,;]|\d+\s*(?:€|euro)/)[0], bef = s.slice(Math.max(0, t.index - 30), t.index).split(/[,;]/).pop();
    return { t, to: TRIP_RED.test(aft) || TRIP_RED.test(bef) ? red : full };
  });
  if (map.every(m => m.to)) {
    let out = s;
    for (const m of [...map].sort((a, b) => b.t.index - a.t.index)) out = out.slice(0, m.t.index) + fmtAmount(m.to.n) + out.slice(m.t.index + m.t.len);
    if (out !== s) after = out;
  }
  const qa = map.find(m => m.to)?.to;
  return { status: 'changed', page: pageSet, before: s, after, quote: qa ? clip(qa.w.text, 300) : quote };
}

// ── godziny i dni zamknięcia ─────────────────────────────────────────────────────────────────────
const TIME_RE = /(?<![\d,.€])([01]?\d|2[0-3])[:.]([0-5]\d)(?![\d])(?!\s*(?:€|euro|eur))/giu;
export const times = (t) => [...new Set([...String(t ?? '').matchAll(TIME_RE)].map(m => `${+m[1]}:${m[2]}`))];
const IT_DAYS = { domenic: 0, luned: 1, marted: 2, mercoled: 3, gioved: 4, venerd: 5, sabat: 6, sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const DAY_RE = '(domenic\\p{L}*|luned\\p{L}*|marted\\p{L}*|mercoled\\p{L}*|gioved\\p{L}*|venerd\\p{L}*|sabat\\p{L}*|sundays?|mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?)';
const dayNo = (w) => { const k = Object.keys(IT_DAYS).find(k => w.toLowerCase().startsWith(k)); return k == null ? null : IT_DAYS[k]; };
export function closedDaysPage(text) {
  const s = String(text ?? ''), out = new Set();
  const a = new RegExp(`(?:chius[oa]|chiusura(?:\\s+settimanale)?|giorno\\s+di\\s+chiusura|closed)\\s*(?:il|la|di|on|every|ogni|:)?\\s*(?:il\\s+|la\\s+|ogni\\s+)?${DAY_RE}`, 'giu');
  const b = new RegExp(`${DAY_RE}\\s*(?::|-|–)?\\s*(?:chius[oa]|closed)`, 'giu');
  for (const m of s.matchAll(a)) { const d = dayNo(m[1]); if (d != null) out.add(d); }
  for (const m of s.matchAll(b)) { const d = dayNo(m[1]); if (d != null) out.add(d); }
  return [...out].sort();
}
const PL_DAYS = [['niedz', 0], ['pon', 1], ['wt', 2], ['śr', 3], ['czw', 4], ['pt', 5], ['piąt', 5], ['sob', 6]];
export function closedDaysTrip(text) {
  const s = String(text ?? ''), out = new Set();
  const re = /(poniedziałk\p{L}*|pon\.?|wtork\p{L}*|wt\.?|środ\p{L}*|śr\.?|czwartk\p{L}*|czw\.?|piątk\p{L}*|pt\.?|sobot\p{L}*|sob\.?|niedziel\p{L}*|niedz\.?)/giu;
  for (const m of s.matchAll(re)) {
    const ctx = s.slice(Math.max(0, m.index - 28), m.index + m[0].length + 28);
    if (!/zamk|nieczynn/iu.test(ctx)) continue;
    const w = m[1].toLowerCase(), d = PL_DAYS.find(([p]) => w.startsWith(p));
    if (d) out.add(d[1]);
  }
  return [...out].sort();
}
export const SEASON_RE = /orario\s+(?:invernale|estivo|ridotto|di\s+bassa\s+stagione)|(?:winter|summer)\s+(?:opening\s+)?(?:hours|timetable)|bassa\s+stagione|alta\s+stagione|dal\s+\d{1,2}°?\s+\p{L}+\s+al\s+\d{1,2}°?\s+\p{L}+/iu;
export const SEASON_PL = /zim\p{L}*|lat\p{L}*\s+(?:od|do)|w\s+sezonie|poza\s+sezonem|sezon\p{L}*|od\s+\d{1,2}\s+(?:stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)/iu;
// Godziny: zmiana zestawu godzin albo dni zamknięcia. Okres sezonowy („orario invernale fino al 31 marzo”) → season.until.
export function compareHours(tripHours, pageText, now = Date.now()) {
  const ws = windows(pageText, HOURS_WORDS, 320);
  const text = ws.map(w => w.text).join(' … ');
  const pt = times(text), pd = closedDaysPage(text);
  if (!pt.length && !pd.length) return { status: 'no_data' };
  let season = null;
  const sm = String(pageText).match(SEASON_RE);
  if (sm) season = { label: clip(sm[0], 80), until: endDateNear(pageText, sm.index, now) };
  const quote = clip((ws.find(w => times(w.text).length || closedDaysPage(w.text).length) ?? ws[0]).text, 300);
  if (!tripHours) return { status: 'missing', page_times: pt, page_closed: pd, quote, season };
  const tt = times(tripHours), td = closedDaysTrip(tripHours);
  const timesDiff = tt.length > 0 && pt.length >= 2 && !tt.every(t => pt.includes(t));
  const daysDiff = pd.length > 0 && pd.some(d => !td.includes(d));
  if (!timesDiff && !daysDiff) return { status: 'same', page_times: pt, page_closed: pd, quote, season };
  return { status: 'changed', before: String(tripHours), after: null, page_times: pt, page_closed: pd, times_diff: timesDiff, days_diff: daysDiff, quote, season };
}

// ── zamknięcia, ponowne otwarcia, lokale zamknięte na stałe ──────────────────────────────────────
const CLOSURE_STRONG = /chiusura\s+temporanea|temporaneamente\s+chius\p{L}*|chius[oa]\s+(?:per|a\s+causa\s+(?:di|dei))\s+(?:lavori|restaur\p{L}*|manutenzion\p{L}*|inagibilit\p{L}*)|chius[oa]\s+fino\s+a|inagibil\p{L}*|temporarily\s+closed|closed\s+(?:for|due\s+to)\s+(?:renovation|restoration|works|maintenance|repairs)|closed\s+until|under\s+renovation|(?:sarà|rimarrà|resterà)\s+chius\p{L}*|riaprir\p{L}*\s+(?:il|dal|a\s+partire)|riapertura\s+(?:prevista|il|dal)/giu;
const CLOSURE_WEAK = /chius\p{L}*[^.]{0,60}(?:lavori|restaur\p{L}*)|(?:lavori|restaur\p{L}*)[^.]{0,60}chius\p{L}*|\bclosed\b[^.]{0,40}renovation/giu;
const REOPEN_RE = /\briapert[oa]\b|ha\s+riaperto|di\s+nuovo\s+apert[oa]|nuovamente\s+apert[oa]|torna\s+(?:ad\s+essere\s+)?apert[oa]|reopened|is\s+open\s+again|now\s+open\s+again/iu;
const HOLIDAY = /natale|25\s+dicembre|capodanno|1°?\s+gennaio|pasqua|ferragosto|christmas|new\s+year|easter/iu;
export const VENUE_DEAD = /chius[oa]\s+definitivamente|chiusura\s+definitiva|cessata\s+attivit\p{L}*|cessazione\s+(?:dell['’]\s*)?attivit\p{L}*|ha\s+chiuso\s+i\s+battenti|permanently\s+closed|closed\s+permanently|closed\s+for\s+good/iu;
function sentence(text, index, len) {
  const s = String(text);
  let a = index; while (a > 0 && index - a < 220 && !/[.!?]\s/.test(s.slice(a - 2, a))) a--;
  let b = index + len; while (b < s.length && b - index < 260 && !/[.!?]/.test(s[b])) b++;
  return clip(s.slice(a, b + 1), 300);
}
// names: nazwa przystanku (i hasło Wikipedii) — na stronie gminy zamknięcie musi dotyczyć TEGO miejsca
export function detectClosure(text, now = Date.now(), { names = null } = {}) {
  const s = String(text ?? '');
  const reopenM = s.match(REOPEN_RE);
  const hits = [];
  for (const [re, strength] of [[CLOSURE_STRONG, 'strong'], [CLOSURE_WEAK, 'weak']]) for (const m of s.matchAll(re)) hits.push({ m, strength });
  const nameOk = (i) => !names?.length || names.some(n => n && n.length >= 4 && norm(s.slice(Math.max(0, i - 400), i + 400)).includes(norm(n)));
  for (const { m, strength } of hits) {
    const q = sentence(s, m.index, m[0].length);
    if (HOLIDAY.test(q) && !/lavori|restaur|renovation|inagibil/iu.test(q)) continue;
    if (!nameOk(m.index)) continue;
    const ends = endDateNear(s, m.index, now);
    const word = m[0].toLowerCase();
    // „riapre il 2 dicembre” z datą w przeszłości = już otwarte
    if (/riapr|riapertura/.test(word) && ends && ends <= iso(now)) return { hit: false, reopen: true, quote: q, ends_at: ends };
    return { hit: true, strength, word: clip(m[0], 60), quote: q, ends_at: ends, reopen: false };
  }
  if (reopenM && nameOk(reopenM.index)) return { hit: false, reopen: true, quote: sentence(s, reopenM.index, reopenM[0].length) };
  return { hit: false, reopen: false };
}
export function detectVenueDead(text) {
  const s = String(text ?? ''), m = s.match(VENUE_DEAD);
  return m ? { hit: true, quote: sentence(s, m.index, m[0].length), word: m[0] } : { hit: false };
}

// Cykl życia zamknięcia (wymóg JP): still | extend | reopen | overdue | unknown
export function closureStep(f, det, { pageOk, today }) {
  const pastEnd = f.ends_at && today > f.ends_at;   // od dnia po dacie końca
  if (!pageOk) return pastEnd ? 'overdue' : 'unknown';
  if (det.reopen || !det.hit) return 'reopen';
  if (det.ends_at && (!f.ends_at || det.ends_at > f.ends_at) && det.ends_at >= today) return 'extend';
  return pastEnd ? 'overdue' : 'still';
}
// Track: zamknięcie sprawdzane co tydzień oraz w dniu końca i dzień po nim
export function closureDue(f, now) {
  const today = iso(now);
  if (f.ends_at && (today === f.ends_at || today === addDays(f.ends_at, 1))) return !f.last_checked_at || iso(new Date(f.last_checked_at)) !== today;
  return !f.last_checked_at || now - new Date(f.last_checked_at).getTime() >= 7 * DAY - 3600_000;
}

// ── propozycje ───────────────────────────────────────────────────────────────────────────────────
export const TEMP_NOTE_RE = /\s*Tymczasowo zamknięte(?: do \d{2}\.\d{2}\.\d{4})? - sprawdź na miejscu\.\s*/u;
export const tempNote = (ends) => `Tymczasowo zamknięte${ends ? ` do ${plDate(ends)}` : ''} - sprawdź na miejscu.`;
export function closureProposal(det, { official }) {
  const confidence = det.strength === 'strong' && official ? 'high' : det.strength === 'strong' ? 'medium' : 'low';
  const inag = /inagibil/i.test(`${det.word ?? ''} ${det.quote ?? ''}`);
  const long = !det.ends_at || inag ? null : (Date.parse(det.ends_at) - Date.now()) / DAY;
  const recommended = confidence === 'low' ? 3 : inag || (long != null && long > 120) ? 2 : 1;
  return {
    confidence, recommended, ends_at: det.ends_at ?? null, note_text: tempNote(det.ends_at),
    options: [
      { n: 1, label: `Zostaw z dopiskiem „${tempNote(det.ends_at)}” + misja zastępcza z zewnątrz (misję pisze AI: osobna prośba o zgodę na koszt)` },
      { n: 2, label: 'Ukryj przystanek do otwarcia (zostaje zapisany, wraca po potwierdzeniu otwarcia)' },
      { n: 3, label: 'Fałszywy alarm', false_alarm: true },
    ],
  };
}

// ── zmiany w szkicu (kodem, bez AI) ──────────────────────────────────────────────────────────────
const clone = (o) => JSON.parse(JSON.stringify(o));
const metaStop = (trip, k) => trip.meta?.stops?.find(s => s.stop_key === k);
function renumber(trip) { (trip.meta.stops ?? []).forEach((s, i) => { s.stop_number = i + 1; }); }
export function removeStop(trip, k) {
  const i = trip.meta.stops.findIndex(s => s.stop_key === k);
  if (i < 0) throw new Error(`nie ma przystanku ${k}`);
  if (i === 0) throw new Error('przystanek 01 to parking — nie ukrywam');
  const snap = { after: trip.meta.stops[i - 1].stop_key, meta: trip.meta.stops[i], content: trip.content?.stops?.[k] ?? null,
    dp_meta: Array.isArray(trip.meta.day_plan) ? trip.meta.day_plan.find(d => d.stop_key === k) ?? null : null,
    dp_content: trip.content?.day_plan && !Array.isArray(trip.content.day_plan) ? trip.content.day_plan[k] ?? null : null };
  trip.meta.stops.splice(i, 1);
  if (trip.content?.stops) delete trip.content.stops[k];
  if (Array.isArray(trip.meta.day_plan)) trip.meta.day_plan = trip.meta.day_plan.filter(d => d.stop_key !== k);
  if (trip.content?.day_plan && !Array.isArray(trip.content.day_plan)) delete trip.content.day_plan[k];
  renumber(trip);
  return snap;
}
export function restoreStop(trip, snap) {
  const k = snap.meta.stop_key;
  if (metaStop(trip, k)) return false;
  const at = trip.meta.stops.findIndex(s => s.stop_key === snap.after) + 1 || trip.meta.stops.length;
  trip.meta.stops.splice(at, 0, snap.meta);
  if (snap.content) (trip.content.stops ??= {})[k] = snap.content;
  if (snap.dp_meta && Array.isArray(trip.meta.day_plan)) {
    const j = trip.meta.day_plan.findIndex(d => d.stop_key === snap.after) + 1 || trip.meta.day_plan.length;
    trip.meta.day_plan.splice(j, 0, snap.dp_meta);
  }
  if (snap.dp_content && trip.content.day_plan && !Array.isArray(trip.content.day_plan)) trip.content.day_plan[k] = snap.dp_content;
  renumber(trip);
  return true;
}
function setNote(trip, k, text) {
  const st = trip.content?.stops?.[k]; if (!st) throw new Error(`brak treści przystanku ${k}`);
  const before = st.practical_note ?? null;
  const rest = String(before ?? '').replace(TEMP_NOTE_RE, ' ').trim();
  st.practical_note = text ? (rest ? `${text} ${rest}` : text) : (rest || null);
  return { path: `content.stops.${k}.practical_note`, before, after: st.practical_note };
}
function addSource(trip, k, url) {
  const s = metaStop(trip, k); if (!s || !url) return;
  s.sources = Array.isArray(s.sources) ? s.sources : [];
  if (!s.sources.includes(url)) s.sources.push(url);
}
function editorialNote(trip, k, note) { (trip.content._notes ??= []).push({ stop_key: k, field: 'a', note }); }

// Zastosowanie przyjętej propozycji do szkicu. Zwraca { trip, changes, snapshot?, needsAi?, skip? }.
// option: wybrana opcja (zamknięcie: 1 dopisek, 2 ukryj, 3 fałszywy alarm). closure: wiersz zamknięcia (dla „reopen”).
export function applyFinding(tripIn, f, { option = null, closure = null } = {}) {
  const trip = clone(tripIn), k = f.stop_key, p = f.proposal ?? {}, ch = [], why = `strażnik #${f.id}: ${f.title}`;
  const opt = option ?? f.decided_option ?? p.recommended ?? 1;
  const res = (extra = {}) => ({ trip, changes: ch.map(c => ({ ...c, why, auto: true })), ...extra });
  if (f.kind === 'price' || f.kind === 'hours') {
    const s = metaStop(trip, k); if (!s) return res({ skip: `nie ma przystanku ${k}` });
    const field = f.kind === 'price' ? 'price' : 'opening_hours', st = f.kind === 'price' ? 'price_status' : 'hours_status';
    const before = s[field] ?? null;
    if (p.after) { s[field] = noDashText(p.after); s[st] = 'confirmed'; addSource(trip, k, f.url); }
    else { s[field] = null; s[st] = 'unverified'; }   // strona mówi inaczej, a nowej wartości nie da się bezpiecznie zapisać → „sprawdź na miejscu”
    ch.push({ path: `meta.stops.${k}.${field}`, before, after: s[field] });
    editorialNote(trip, k, `Strażnik (${iso(Date.now())}): ${f.kind === 'price' ? 'cena' : 'godziny'} wg ${f.url}: „${clip(f.quote, 200)}”`);
    return res();
  }
  if (f.kind === 'closure' || f.kind === 'closure_overdue') {
    if (f.kind === 'closure_overdue' && opt === 3) return applyFinding(tripIn, { ...f, kind: 'reopen' }, { closure });
    if (opt === 2) { const snapshot = removeStop(trip, k); ch.push({ op: 'remove_stop', stop_key: k, path: `meta.stops.${k}`, before: snapshot.meta?.stop_key, after: null }); return res({ snapshot }); }
    if (opt === 1) {
      ch.push(setNote(trip, k, f.kind === 'closure_overdue' ? tempNote(null) : tempNote(f.ends_at ?? p.ends_at)));
      return res(f.kind === 'closure' ? { needsAi: `misja zastępcza z zewnątrz dla przystanku ${k} (zamknięty do ${plDate(f.ends_at ?? p.ends_at) || 'odwołania'})` } : {});
    }
    return res({ skip: 'fałszywy alarm — bez zmian' });
  }
  if (f.kind === 'reopen') {
    const applied = closure?.proposal?.applied_option ?? p.applied_option ?? closure?.decided_option;
    const snap = closure?.proposal?.snapshot ?? p.snapshot;
    if (snap && !metaStop(trip, snap.meta?.stop_key)) { restoreStop(trip, snap); ch.push({ op: 'add_stop', stop_key: snap.meta.stop_key, path: `meta.stops.${snap.meta.stop_key}`, before: null, after: snap.meta.stop_key }); return res(); }
    if (applied === 2 && !snap) return res({ skip: 'brak zapisanego przystanku do przywrócenia — decyzja JP' });
    if (trip.content?.stops?.[k] && TEMP_NOTE_RE.test(trip.content.stops[k].practical_note ?? '')) ch.push(setNote(trip, k, null));
    return ch.length ? res() : res({ skip: 'nic do przywrócenia' });
  }
  if (f.kind === 'venue') {
    if (opt !== 1) return res({ skip: 'fałszywy alarm — bez zmian' });
    const snapshot = removeStop(trip, k); ch.push({ op: 'remove_stop', stop_key: k, path: `meta.stops.${k}`, before: k, after: null });
    return res({ snapshot, needsAi: `zamiennik lokalu ${k} (zamknięty na stałe)` });
  }
  return res({ skip: `rodzaj ${f.kind} nie zmienia trasy` });
}
export const PATCH_KINDS = new Set(['price', 'hours', 'closure', 'closure_overdue', 'reopen', 'venue']);

// ── deduplikacja: ten sam problem = ten sam wiersz (aktualizacja updated_at), nie nowy co tydzień ──
export function mergeFinding(ex, inc, now = new Date().toISOString()) {
  if (!ex) return { row: { status: 'open', proposal: {}, seen_count: 1, apply_state: 'none', ...inc, created_at: now, updated_at: now, last_seen_at: now }, inserted: true };
  const r = { ...ex, updated_at: now, last_seen_at: now, seen_count: (ex.seen_count ?? 1) + 1 };
  if (inc.ends_at && (!ex.ends_at || inc.ends_at > ex.ends_at)) r.ends_at = inc.ends_at;
  if (ex.status === 'open' || ex.status === 'recheck') {
    Object.assign(r, { title: inc.title, detail: inc.detail, quote: inc.quote ?? ex.quote, url: inc.url ?? ex.url,
      proposal: { ...(inc.proposal ?? {}), ...pick(ex.proposal, ['applied_option', 'snapshot']) }, recheck_at: inc.recheck_at ?? ex.recheck_at });
  } else if (ex.status === 'resolved') {
    Object.assign(r, { status: 'open', title: inc.title, detail: inc.detail, quote: inc.quote, url: inc.url, proposal: inc.proposal ?? {},
      decided_at: null, decision_note: null, decided_option: null, apply_state: 'none', apply_result: null, recheck_at: inc.recheck_at ?? null, ends_at: inc.ends_at ?? null });
  }
  return { row: r, inserted: false, reopened: ex.status === 'resolved' };
}
const pick = (o, ks) => Object.fromEntries(ks.filter(k => o?.[k] !== undefined).map(k => [k, o[k]]));

// Magazyn w pamięci (testy; ten sam interfejs co magazyn bazy w watch.mjs)
export function memoryStore() {
  const rows = []; let seq = 0;
  const now = () => new Date().toISOString();
  return {
    rows,
    async upsert(f) {
      const ex = rows.find(r => r.dedupe_key === f.dedupe_key);
      const { row, inserted, reopened } = mergeFinding(ex, f, now());
      if (inserted) { row.id = ++seq; rows.push(row); } else Object.assign(ex, row);
      return { id: row.id, inserted, reopened, status: row.status };
    },
    async tracked(kinds, statuses = ['open', 'accepted', 'recheck']) { return rows.filter(r => kinds.includes(r.kind) && statuses.includes(r.status)); },
    async get(id) { return rows.find(r => r.id === id) ?? null; },
    async update(id, patch) { const r = rows.find(x => x.id === id); if (r) Object.assign(r, patch, { updated_at: now() }); return r; },
    async dueRechecks(nowMs) { return rows.filter(r => (r.status === 'recheck' && (!r.recheck_at || Date.parse(r.recheck_at) <= nowMs)) || (r.recheck_at && Date.parse(r.recheck_at) <= nowMs && ['open', 'accepted', 'resolved'].includes(r.status))); },
    async pendingApply() { return rows.filter(r => r.status === 'accepted' && r.apply_state === 'pending'); },
    async supersede(kind, city, stop, keepKey) { for (const r of rows) if (r.kind === kind && r.city_slug === city && r.stop_key === stop && r.dedupe_key !== keepKey && r.status === 'open') Object.assign(r, { status: 'resolved', decision_note: 'zastąpione nowszym odczytem strony', updated_at: now() }); },
  };
}

// ── harmonogram ──────────────────────────────────────────────────────────────────────────────────
// every: day | week (weekday 1 = pon.) | month (day) | season (1 marca i 1 października); hour = najwcześniejsza godzina (czas polski)
export const DEFAULT_SCHEDULE = {
  costs: { every: 'day', hour: 7 },
  track: { every: 'day', hour: 5 },
  recheck: { every: 'day', hour: 5 },
  season: { every: 'season', hour: 4 },
  prices: { every: 'week', weekday: 1, hour: 3 },
  closures: { every: 'week', weekday: 2, hour: 3 },
  links: { every: 'week', weekday: 3, hour: 3 },
  site: { every: 'week', weekday: 4, hour: 3 },
  venues: { every: 'month', day: 2, hour: 3 },
};
export const ORDER = ['costs', 'track', 'recheck', 'season', 'prices', 'closures', 'links', 'site', 'venues'];
export function localParts(now, tz = 'Europe/Warsaw') {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' })
    .formatToParts(new Date(now)).map(x => [x.type, x.value]));
  const wd = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday];
  return { date: `${p.year}-${p.month}-${p.day}`, y: +p.year, m: +p.month, d: +p.day, hour: +p.hour, weekday: wd };
}
export function periodOf(cfg, L) {
  if (cfg.every === 'day') return L.date;
  if (cfg.every === 'month') return `${L.y}-${String(L.m).padStart(2, '0')}`;
  if (cfg.every === 'season') return L.m >= 10 ? `${L.y}-10` : L.m >= 3 ? `${L.y}-03` : `${L.y - 1}-10`;
  // tydzień: poniedziałek tygodnia
  const t = Date.UTC(L.y, L.m - 1, L.d) - (L.weekday - 1) * DAY;
  return 'w' + iso(t);
}
export function dueGuards(state, schedule = DEFAULT_SCHEDULE, now = Date.now()) {
  const L = localParts(now), out = [];
  for (const name of ORDER) {
    const cfg = { ...DEFAULT_SCHEDULE[name], ...(schedule?.[name] ?? {}) };
    if (cfg.off) continue;
    const per = periodOf(cfg, L), last = state?.last?.[name];
    if (state?.cursor?.[name] != null) { out.push(name); continue; }   // przerwany przebieg (limit czasu) — dokończ
    if (last?.period === per) continue;
    if (L.hour < (cfg.hour ?? 0)) continue;
    if (cfg.every === 'week' && L.weekday < (cfg.weekday ?? 1)) continue;
    if (cfg.every === 'month' && L.d < (cfg.day ?? 1)) continue;
    out.push(name);
  }
  return out;
}

// ── sieć ─────────────────────────────────────────────────────────────────────────────────────────
const UA = { 'User-Agent': 'Mozilla/5.0 (QuolinoWatch/1.0; +https://quolino.com)', 'Accept-Language': 'it,en;q=0.8,pl;q=0.5' };
export const SKIP_URL = /google\.[a-z.]+\/maps|maps\.google|goo\.gl|tripadvisor|facebook\.com|instagram\.com|restaurantguru|booking\.com|wikipedia\.org|wikimedia\.org|wikidata\.org/i;
export const TOURISM_URL = /comune\.|turismo|tourism|visit|proloco|pro-loco|\.gov\.it|regione\./i;
export function makeGetter(fetchFn = globalThis.fetch, { timeout = 25_000 } = {}) {
  const cache = new Map();
  return async function get(url) {
    if (cache.has(url)) return cache.get(url);
    const t0 = Date.now(); let v;
    try {
      const r = await fetchFn(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
      const ct = r.headers?.get?.('content-type') ?? 'text/html';
      const html = /text\/html|text\/plain|xml/.test(ct) ? await r.text() : '';
      v = { ok: !!r.ok, status: r.status, final: r.url || url, html, text: plainHtml(html).slice(0, 200_000), bytes: html.length, ms: Date.now() - t0 };
    } catch (e) { v = { ok: false, status: 0, final: url, html: '', text: '', bytes: 0, ms: Date.now() - t0, error: e.cause?.code ?? e.name ?? 'błąd' }; }
    cache.set(url, v); return v;
  };
}
export async function checkLink(fetchFn, url, { timeout = 25_000 } = {}) {
  const t0 = Date.now();
  for (const method of ['HEAD', 'GET']) {
    try {
      const r = await fetchFn(url, { method, redirect: 'follow', headers: UA, signal: AbortSignal.timeout(timeout) });
      if (method === 'HEAD' && [403, 405, 501, 400].includes(r.status)) continue;
      return { status: r.status, final: r.url || url, ms: Date.now() - t0 };
    } catch (e) { if (method === 'GET') return { status: 0, final: url, error: e.cause?.code ?? e.name ?? 'błąd', ms: Date.now() - t0 }; }
  }
  return { status: 0, final: url, error: 'brak odpowiedzi', ms: Date.now() - t0 };
}
const TWO_LEVEL = /\.(co|com|org|gov|net|ac|edu)\.[a-z]{2}$/;
export function regDomain(u) {
  try { const h = new URL(u).hostname.replace(/^www\./, '').toLowerCase(); const p = h.split('.'); return p.slice(TWO_LEVEL.test(h) ? -3 : -2).join('.'); } catch { return ''; }
}

// ── dane tras → przystanki ───────────────────────────────────────────────────────────────────────
export const FOOD = ['restaurant', 'icecream', 'sweets', 'cafe', 'bar', 'food'];
const NO_PRICE = new Set(['parking', 'street', 'viewpoint', 'photo', 'square', 'park', ...FOOD]);
export function stopsOf(row) {
  const meta = row.trip?.meta, content = row.trip?.content;
  const list = Array.isArray(meta?.stops) ? meta.stops : Array.isArray(row.content?.stops) ? row.content.stops : [];
  return list.map(s => ({ ...s, city_slug: row.city_slug, name: content?.stops?.[s.stop_key]?.name ?? s.name ?? s.stop_key,
    practical_note: content?.stops?.[s.stop_key]?.practical_note ?? null }));
}
const official = (s) => [...new Set([s.verify_url, s.website].filter(u => /^https?:\/\//.test(u ?? '') && !SKIP_URL.test(u)))];
const tourism = (s) => (Array.isArray(s.sources) ? s.sources : []).filter(u => /^https?:\/\//.test(u ?? '') && !SKIP_URL.test(u) && TOURISM_URL.test(u) && !official(s).includes(u));

// ── strażnicy ────────────────────────────────────────────────────────────────────────────────────
// ctx: { trips:[{city_slug, title, stops:[…]}], store, get(url), fetch, ai(prompt)|null, aiMax, now, deadline, cursor, log, sleep, touched:Set }
async function* iterate(ctx, items) {
  for (let i = ctx.cursor ?? 0; i < items.length; i++) {
    if (Date.now() > ctx.deadline) { ctx.partial = i; return; }
    yield items[i];
    if (ctx.sleep) await ctx.sleep(200);
  }
  ctx.partial = null;
}
// pola czytane przez skrzynkę decyzji w panelu (_admin/admin.js proposalHtml): old / new / recommendation
export function panelFields(f) {
  const p = { ...(f.proposal ?? {}) };
  if (p.before !== undefined && p.old === undefined) p.old = p.before ?? 'brak';
  if ((f.kind === 'price' || f.kind === 'hours') && p.new === undefined) p.new = p.after ?? 'usunąć z trasy (na stronie: sprawdź na miejscu)';
  if (!p.recommendation && Array.isArray(p.options) && p.options.length) {
    const rec = p.options.find(o => o.n === p.recommended) ?? p.options[0];
    p.recommendation = `${rec.false_alarm ? 'Odrzuć' : 'Przyjmij'}: ${rec.label}.` + (p.options.length > 2 || (p.options.length === 2 && !p.options[1].false_alarm)
      ? ` Inna opcja: „Przyjmij” z notatką ${p.options.filter(o => o.n !== rec.n).map(o => `„opcja ${o.n}” (${o.label})`).join(' albo ')}.` : '');
  }
  return { ...f, proposal: p };
}
async function put(ctx, f0) {
  const f = panelFields(f0);
  const r = await ctx.store.upsert(f);
  ctx.touched?.add(f.dedupe_key);
  if (r.inserted || r.reopened) ctx.found.push({ id: r.id, ...f });
  return r;
}

// AI (opcjonalnie): jedno krótkie pytanie z wycinkiem, żeby potwierdzić znaczenie zmiany. Cytat musi stać w wycinku,
// liczby z nowej wartości też — inaczej odpowiedź ignorowana (zostaje wynik kodu).
export async function aiConfirm(ctx, { kind, name, current, snippet }) {
  if (!ctx.ai || (ctx.aiUsed ?? 0) >= (ctx.aiMax ?? 0)) return null;
  ctx.aiUsed = (ctx.aiUsed ?? 0) + 1;
  const what = kind === 'price' ? 'cenę biletu' : 'godziny otwarcia lub dni zamknięcia';
  const prompt = `Strona oficjalna miejsca „${name}”. W naszej trasie (po polsku) jest teraz: „${current ?? 'brak'}”.\nWycinek strony:\n<<<${clip(snippet, 1400)}>>>\n` +
    `Czy wycinek pokazuje inną ${what} niż nasza wartość? Odpowiedz WYŁĄCZNIE JSON-em: {"changed": true|false, "after": "nowa wartość po polsku, krótko, w formacie naszej wartości, albo null", ` +
    `"quote": "dosłowny fragment wycinka (do 200 znaków)", "seasonal_until": "RRRR-MM-DD albo null"}. Nie zgaduj: gdy wycinek nie wystarcza, changed=false. Bez znaku „—”.`;
  let j;
  try { const t = await ctx.ai(prompt); const a = t.indexOf('{'), b = t.lastIndexOf('}'); j = JSON.parse(t.slice(a, b + 1)); } catch (e) { ctx.log?.(`strażnik AI: ${String(e.message).slice(0, 100)}`); return null; }
  if (typeof j?.changed !== 'boolean') return null;
  if (j.changed) {
    if (typeof j.quote !== 'string' || !norm(snippet).includes(norm(j.quote))) return null;
    const nums = (x) => (String(x ?? '').match(/\d+(?:[.,:]\d+)?/g) ?? []).map(n => n.replace(',', '.').replace(/^0+(\d)/, '$1'));
    const sn = new Set(nums(snippet).flatMap(n => [n, n.replace(/\.0+$/, ''), n.replace(':', '.'), n.replace('.', ':')]));
    if (j.after && !nums(j.after).every(n => sn.has(n) || sn.has(n.replace(':', '.')) || sn.has(n.replace('.', ':')))) j.after = null;
  }
  return { changed: j.changed, after: j.changed && j.after ? noDashText(String(j.after).slice(0, 300)) : null, quote: j.quote ?? null,
    seasonal_until: /^\d{4}-\d{2}-\d{2}$/.test(j.seasonal_until ?? '') ? j.seasonal_until : null };
}

export async function checkStopPrices(ctx, t, s) {
  for (const url of official(s)) {
    const pg = await ctx.get(url);
    if (!pg.ok || !pg.text) continue;
    let any = false;
    if (!NO_PRICE.has(s.category)) {
      const pr = comparePrice(s.price, pg.text);
      if (pr.status !== 'no_data') any = true;
      if (pr.status === 'changed') {   // AI tylko przy wykrytej zmianie (brak ceny w trasie to nie zmiana)
        const ai = await aiConfirm(ctx, { kind: 'price', name: s.name, current: s.price, snippet: pr.quote });
        const after = ai?.after ?? pr.after;
        if (!(ai && ai.changed === false)) {
          const key = `price:${s.city_slug}:${s.stop_key}:${pr.page.join('|')}`;
          await put(ctx, { kind: 'price', city_slug: s.city_slug, stop_key: s.stop_key, dedupe_key: key, url, quote: ai?.quote ?? pr.quote,
            title: `${t.title}: ${s.name} — ${pr.status === 'missing' ? 'cena do uzupełnienia' : 'cena na stronie inna niż w trasie'}`,
            detail: `W trasie: ${s.price ?? 'brak'}. Na stronie: ${pr.page.map(fmtAmount).join(', ')} €.${after ? ` Propozycja: ${after}.` : ' Nowej wartości nie da się bezpiecznie zapisać kodem: przyjęcie usuwa cenę (na stronie „sprawdź na miejscu”).'}`,
            proposal: { path: `meta.stops.${s.stop_key}.price`, before: s.price ?? null, after: after ?? null, quote: ai?.quote ?? pr.quote, url, ai: !!ai?.after, recommended: 1,
              options: [{ n: 1, label: after ? `Wpisz: ${after}` : 'Usuń cenę z trasy (sprawdź na miejscu)' }, { n: 2, label: 'Fałszywy alarm', false_alarm: true }] },
            recheck_at: ai?.seasonal_until ? addDays(ai.seasonal_until, 1) + 'T06:00:00Z' : null });
          await ctx.store.supersede?.('price', s.city_slug, s.stop_key, key);
        }
      }
    }
    const hr = compareHours(s.opening_hours, pg.text, ctx.now);
    if (hr.status !== 'no_data') any = true;
    if (hr.status === 'changed') {
      const ai = await aiConfirm(ctx, { kind: 'hours', name: s.name, current: s.opening_hours, snippet: hr.quote });
      const until = ai?.seasonal_until ?? hr.season?.until ?? null;
      if (!(ai && ai.changed === false)) {
        const key = `hours:${s.city_slug}:${s.stop_key}:${shortHash(hr.page_times.join(',') + '|' + hr.page_closed.join(','))}`;
        const DN = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
        await put(ctx, { kind: 'hours', city_slug: s.city_slug, stop_key: s.stop_key, dedupe_key: key, url, quote: ai?.quote ?? hr.quote,
          title: `${t.title}: ${s.name} — ${hr.status === 'missing' ? 'godziny do uzupełnienia' : 'godziny na stronie inne niż w trasie'}${hr.season ? ' (sezonowe)' : ''}`,
          detail: `W trasie: ${s.opening_hours ?? 'brak'}. Na stronie: ${hr.page_times.join(', ') || '—'}${hr.page_closed.length ? `; zamknięte: ${hr.page_closed.map(d => DN[d]).join(', ')}` : ''}.` +
            `${hr.season ? ` Okres sezonowy: ${hr.season.label}${until ? `, do ${plDate(until)} (ponowne sprawdzenie ${plDate(addDays(until, 1))})` : ''}.` : ''}`,
          proposal: { path: `meta.stops.${s.stop_key}.opening_hours`, before: s.opening_hours ?? null, after: ai?.after ?? null, quote: ai?.quote ?? hr.quote, url, ai: !!ai?.after, season: hr.season, recommended: 1,
            options: [{ n: 1, label: ai?.after ? `Wpisz: ${ai.after}` : 'Usuń godziny z trasy (sprawdź na miejscu)' }, { n: 2, label: 'Fałszywy alarm', false_alarm: true }] },
          recheck_at: until ? addDays(until, 1) + 'T06:00:00Z' : null });
        await ctx.store.supersede?.('hours', s.city_slug, s.stop_key, key);
      }
    }
    if (any) return;   // pierwsza strona z danymi wystarcza
  }
}
export async function guardPrices(ctx, { only = null } = {}) {
  const items = ctx.trips.flatMap(t => t.stops.filter(s => !only || only.some(o => o.city_slug === s.city_slug && o.stop_key === s.stop_key)).map(s => ({ t, s })));
  for await (const { t, s } of iterate(ctx, items)) await checkStopPrices(ctx, t, s);
  return { checked: items.length };
}

async function closureFor(ctx, s) {
  const names = [s.name, s.wiki_article].filter(Boolean);
  let pageOk = false, det = { hit: false, reopen: false }, url = null, isOfficial = false;
  for (const [u, off] of [...official(s).map(u => [u, true]), ...tourism(s).map(u => [u, false])]) {
    const pg = await ctx.get(u);
    if (!pg.ok) continue;
    if (off) pageOk = true;
    const d = detectClosure(pg.text, ctx.now, { names: off ? null : names });
    if (d.hit || (d.reopen && !det.hit)) { det = d; url = u; isOfficial = off; if (d.hit) break; }
  }
  return { pageOk, det, url, isOfficial };
}
export async function guardClosures(ctx) {
  const items = ctx.trips.flatMap(t => t.stops.filter(s => !FOOD.includes(s.category) && s.category !== 'parking').map(s => ({ t, s })));
  for await (const { t, s } of iterate(ctx, items)) {
    const { det, url, isOfficial } = await closureFor(ctx, s);
    if (!det.hit) continue;
    await put(ctx, closureFinding(t, s, det, url, isOfficial));
  }
  return { checked: items.length };
}
function closureFinding(t, s, det, url, isOfficial, suffix = '') {
  return { kind: 'closure', city_slug: s.city_slug, stop_key: s.stop_key, dedupe_key: `closure:${s.city_slug}:${s.stop_key}${suffix}`, url, quote: det.quote, ends_at: det.ends_at ?? null,
    title: `${t.title}: ${s.name} — ${suffix ? 'zamknięcie przedłużone' : 'tymczasowo zamknięte'}${det.ends_at ? ` do ${plDate(det.ends_at)}` : ''}`,
    detail: `Strona ${isOfficial ? 'oficjalna' : 'gminy / turystyki'}: „${clip(det.quote, 240)}”.`,
    proposal: { ...closureProposal(det, { official: isOfficial }), quote: det.quote, url } };
}
// Track: otwarte i przyjęte zamknięcia — co tydzień, w dniu końca i dzień po
export async function guardTrack(ctx) {
  const today = iso(ctx.now);
  const list = (await ctx.store.tracked(['closure'])).filter(f => closureDue(f, ctx.now));
  for await (const f of iterate(ctx, list)) {
    const t = ctx.trips.find(x => x.city_slug === f.city_slug), s = t?.stops.find(x => x.stop_key === f.stop_key)
      ?? (f.proposal?.snapshot?.meta ? { ...f.proposal.snapshot.meta, city_slug: f.city_slug, name: f.proposal.snapshot.content?.name ?? f.stop_key } : null);
    if (!s) continue;
    const { pageOk, det, url, isOfficial } = await closureFor(ctx, { ...s, verify_url: s.verify_url ?? f.url });
    const step = closureStep(f, det, { pageOk, today });
    if (step === 'still' || step === 'extend' || step === 'overdue') ctx.touched?.add(f.dedupe_key);
    await ctx.store.update(f.id, { last_checked_at: new Date(ctx.now).toISOString() });
    if (step === 'reopen') {
      if (f.status === 'accepted') {
        await put(ctx, { kind: 'reopen', city_slug: f.city_slug, stop_key: f.stop_key, dedupe_key: `reopen:${f.id}`, url: url ?? f.url, quote: det.quote ?? null,
          title: `${t?.title ?? f.city_slug}: ${s.name} — otwarte ponownie. Przywrócić przystanek?`,
          detail: det.reopen ? `Strona: „${clip(det.quote, 240)}”.` : 'Strona nie mówi już o zamknięciu.',
          proposal: { closure_id: f.id, applied_option: f.proposal?.applied_option ?? f.decided_option ?? null, recommended: 1,
            options: [{ n: 1, label: 'Przywróć (usuń dopisek albo przywróć ukryty przystanek)' }, { n: 2, label: 'Fałszywy alarm — zostaw jak jest', false_alarm: true }] } });
      } else await ctx.store.update(f.id, { status: 'resolved', decision_note: 'strażnik: strona nie mówi już o zamknięciu (przed decyzją JP)' });
    } else if (step === 'overdue') {
      await put(ctx, { kind: 'closure_overdue', city_slug: f.city_slug, stop_key: f.stop_key, dedupe_key: `overdue:${f.id}:${f.ends_at}`, url: f.url, quote: det.quote ?? f.quote, ends_at: f.ends_at,
        title: `${t?.title ?? f.city_slug}: ${s.name} — minęła data końca zamknięcia (${plDate(f.ends_at)}) bez potwierdzenia otwarcia`,
        detail: pageOk ? `Strona nadal: „${clip(det.quote, 200)}”.` : 'Strona nie odpowiada.',
        proposal: { closure_id: f.id, applied_option: f.proposal?.applied_option ?? f.decided_option ?? null, recommended: 1,
          options: [{ n: 1, label: `Dopisek bez daty „${tempNote(null)}”` }, { n: 2, label: 'Ukryj przystanek do otwarcia' }, { n: 3, label: 'Otwarte — przywróć' }] } });
    } else if (step === 'extend') {
      if (f.status === 'accepted' && (f.proposal?.applied_option ?? f.decided_option) === 1) await put(ctx, closureFinding(t ?? { title: f.city_slug }, s, det, url, isOfficial, `:do:${det.ends_at}`));
      else await ctx.store.update(f.id, { ends_at: det.ends_at, detail: `${f.detail ?? ''} Przedłużone do ${plDate(det.ends_at)}.`.trim() });
    }
  }
  return { checked: list.length };
}

export async function guardLinks(ctx) {
  const urls = new Map();
  for (const t of ctx.trips) for (const s of t.stops) {
    const list = [s.verify_url, s.website, ...(Array.isArray(s.sources) ? s.sources : []), s.maps_url].filter(u => /^https?:\/\//.test(u ?? ''));
    for (const u of new Set(list)) { if (!urls.has(u)) urls.set(u, []); urls.get(u).push({ t, s }); }
  }
  const items = [...urls.entries()];
  for await (const [url, refs] of iterate(ctx, items)) {
    const r = await checkLink(ctx.fetch, url);
    const prevBad = await ctx.prevLinkBad?.(url);
    await ctx.recordLink?.(url, r, [...new Set(refs.map(x => x.s.city_slug))]);
    let type = null;
    if (r.status === 404 || r.status === 410) type = 'dead';
    else if ((r.status === 0 || r.status >= 500) && prevBad) type = 'down';
    else if (r.status && r.status < 400 && regDomain(r.final) && regDomain(r.final) !== regDomain(url)) type = 'moved';
    else if (r.status && r.status < 400 && new URL(r.final).pathname.replace(/\/+$/, '') === '' && new URL(url).pathname.replace(/\/+$/, '') !== '') type = 'home';
    if (!type) continue;
    const where = refs.map(x => `${x.t.title}: ${x.s.name}`).slice(0, 6).join('; ');
    const label = { dead: `martwy link (${r.status})`, down: `strona nie odpowiada drugi raz z rzędu (${r.status || r.error})`, moved: `przekierowanie na inną domenę (${regDomain(r.final)})`, home: 'podstrona zniknęła (przekierowanie na stronę główną)' }[type];
    await put(ctx, { kind: 'link', city_slug: refs[0].s.city_slug, stop_key: refs[0].s.stop_key, dedupe_key: `link:${url}:${type}`, url, quote: null,
      title: `Link: ${label}`, detail: `${url}${r.final && r.final !== url ? ` → ${r.final}` : ''}. Używany: ${where}.`,
      proposal: { url, final: r.final ?? null, status: r.status, type, refs: refs.map(x => ({ city_slug: x.s.city_slug, stop_key: x.s.stop_key })), recommended: 1,
        options: [{ n: 1, label: 'Przyjęte do poprawki (nowe źródło wskazuje JP albo redakcja)' }, { n: 2, label: 'Fałszywy alarm', false_alarm: true }] } });
  }
  return { checked: items.length };
}

export async function guardVenues(ctx) {
  const items = ctx.trips.flatMap(t => t.stops.filter(s => FOOD.includes(s.category)).map(s => ({ t, s })));
  for await (const { t, s } of iterate(ctx, items)) {
    let sig = null, quote = null, url = null;
    const g = await ctx.gastroStatus?.(s.city_slug, s.stop_key);
    if (g === 'CLOSED_PERMANENTLY') { sig = 'google'; quote = 'Google Maps: CLOSED_PERMANENTLY (przegląd gastro)'; }
    for (const u of official(s)) {
      if (sig === 'text') break;
      const pg = await ctx.get(u);
      if (pg.ok) { const d = detectVenueDead(pg.text); if (d.hit) { sig = 'text'; quote = d.quote; url = u; } }
      else if ([404, 410, 0].includes(pg.status) && !sig) { sig = 'site'; quote = `Strona lokalu nie działa (${pg.status || pg.error})`; url = u; }
    }
    if (!sig) continue;
    const strong = sig !== 'site';
    await put(ctx, { kind: 'venue', city_slug: s.city_slug, stop_key: s.stop_key, dedupe_key: `venue:${s.city_slug}:${s.stop_key}:${sig}`, url, quote,
      title: `${t.title}: ${s.name} — ${strong ? 'lokal zamknięty na stałe?' : 'strona lokalu nie działa'}`, detail: quote,
      proposal: { signal: sig, confidence: strong ? 'high' : 'low', recommended: strong ? 1 : 2,
        options: [{ n: 1, label: 'Usuń lokal z trasy (zamiennik: AI za zgodą na koszt)' }, { n: 2, label: 'Fałszywy alarm', false_alarm: true }] } });
  }
  return { checked: items.length };
}

export async function guardSeason(ctx, { period }) {
  const due = await ctx.store.tracked(['price', 'hours'], ['open', 'accepted', 'resolved']);
  const only = [];
  for (const t of ctx.trips) {
    const seasonal = t.stops.filter(s => SEASON_PL.test(s.opening_hours ?? '') || SEASON_PL.test(s.practical_note ?? '') ||
      due.some(f => f.city_slug === s.city_slug && f.stop_key === s.stop_key && (f.recheck_at || f.proposal?.season)));
    if (!seasonal.length) continue;
    only.push(...seasonal.map(s => ({ city_slug: s.city_slug, stop_key: s.stop_key })));
    await put(ctx, { kind: 'season', city_slug: t.city_slug, stop_key: null, dedupe_key: `season:${t.city_slug}:${period}`, url: null, quote: null,
      title: `${t.title}: zmiana sezonu — sprawdź godziny sezonowe`, detail: `Przystanki z godzinami sezonowymi: ${seasonal.map(s => s.name).join(', ')}. Strażnik cen sprawdza je teraz.`,
      proposal: { stops: seasonal.map(s => s.stop_key), recommended: 1, options: [{ n: 1, label: 'Przyjęte do wiadomości' }] } });
  }
  if (only.length) { ctx.cursor = 0; await guardPrices(ctx, { only }); }
  return { checked: only.length };
}

// Ponowne sprawdzenie: decyzja JP „sprawdź ponownie” albo recheck_at (np. koniec okresu sezonowego)
export async function guardRecheck(ctx) {
  const list = await ctx.store.dueRechecks(ctx.now);
  for await (const f of iterate(ctx, list)) {
    const t = ctx.trips.find(x => x.city_slug === f.city_slug), s = t?.stops.find(x => x.stop_key === f.stop_key);
    ctx.touched.delete(f.dedupe_key);
    const sub = { ...ctx, cursor: 0 };   // wspólne touched i found (te same obiekty)
    if ((f.kind === 'price' || f.kind === 'hours') && s) await checkStopPrices(sub, t, s);
    else if (f.kind === 'link' && t) await guardLinks({ ...sub, trips: [{ ...t, stops: t.stops.filter(x => [x.verify_url, x.website, ...(x.sources ?? [])].includes(f.url)) }] });
    else if (f.kind === 'venue' && s) await guardVenues({ ...sub, trips: [{ ...t, stops: [s] }] });
    else if (f.kind === 'closure') await guardTrack({ ...sub, store: { ...ctx.store, tracked: async () => [{ ...f, last_checked_at: null }] } });
    const still = ctx.touched.has(f.dedupe_key);
    if (f.status === 'recheck') await ctx.store.update(f.id, still ? { status: 'open', recheck_at: null } : { status: 'resolved', recheck_at: null, decision_note: `${f.decision_note ?? ''} · ponowne sprawdzenie: problemu już nie ma`.replace(/^ · /, '') });
    else await ctx.store.update(f.id, { recheck_at: null });
  }
  return { checked: list.length };
}

// Strona quolino.com bez przeglądarki: statusy, wagi, kluczowe elementy, błędy SSR, 404 na złym adresie
export async function guardSite(ctx, { site, max = 400, browser = null } = {}) {
  const sm = await ctx.get(`${site}/sitemap.xml`);
  const locs = sm.ok ? [...sm.html.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(m => m[1].replace(/&amp;/g, '&')) : [];
  const key = ['/', '/konto.html', '/zaloguj.html', '/gra/', '/kontakt.html'].map(p => site + p);
  const pages = [...new Set([...key, ...locs])].slice(0, max);
  const bad404 = `${site}/nie-ma-takiej-strony-${shortHash(String(ctx.now))}/`;
  const problems = [];
  if (!sm.ok) problems.push({ url: `${site}/sitemap.xml`, type: 'sitemap', msg: `sitemap.xml: ${sm.status || sm.error}` });
  const items = [...pages, bad404];
  for await (const url of iterate(ctx, items)) {
    const r = await ctx.get(url), path = url.slice(site.length) || '/';
    if (url === bad404) { if (r.status !== 404) problems.push({ url, type: '404', msg: `zły adres zwraca ${r.status} zamiast 404` }); continue; }
    if (r.status !== 200) { problems.push({ url, type: 'status', msg: `${path}: ${r.status || r.error}` }); continue; }
    if (/Chwilowy problem/i.test(r.html)) problems.push({ url, type: 'ssr', msg: `${path}: błąd SSR („Chwilowy problem”)` });
    if (!/<title[\s>]/i.test(r.html)) problems.push({ url, type: 'title', msg: `${path}: brak <title>` });
    if (/^\/[a-z]{2}(?:-[a-z]{2})?\/[^/]+\/[^/]+\/[^/]+\/$/.test(path) && !(/<h1[\s>]/i.test(r.html) && /ssr-stops/.test(r.html))) problems.push({ url, type: 'city', msg: `${path}: strona miasta bez nagłówka albo listy przystanków` });
    if (r.bytes > 1_500_000) problems.push({ url, type: 'weight', msg: `${path}: HTML waży ${Math.round(r.bytes / 1024)} KB` });
    if (r.ms > 8000) problems.push({ url, type: 'slow', msg: `${path}: odpowiedź ${Math.round(r.ms / 1000)} s` });
  }
  if (browser && ctx.partial == null) {
    try { for (const p of await browser([site + '/', locs.find(u => /\/pl\//.test(u)) ?? locs[0], site + '/gra/'].filter(Boolean))) problems.push(p); }
    catch (e) { ctx.log?.(`strażnik strony: przeglądarka — ${String(e.message).slice(0, 120)}`); }
  }
  for (const p of problems) await put(ctx, { kind: 'site', city_slug: null, stop_key: null, dedupe_key: `site:${p.url.slice(site.length) || '/'}:${p.type}`, url: p.url, quote: null,
    title: `Strona: ${clip(p.msg, 160)}`, detail: p.msg, proposal: { type: p.type, recommended: 1, options: [{ n: 1, label: 'Przyjęte do poprawki (Frontend/Backend)' }, { n: 2, label: 'Fałszywy alarm', false_alarm: true }] } });
  return { checked: items.length, problems: problems.length };
}

// Koszty AI: 24 h realnie zapłacone > próg albo równowartość abonamentu > 3× średniej z 7 dni
export async function guardCosts(ctx, { threshold = 1, factor = 3, floor = 0.5 } = {}) {
  const u = await ctx.usage();
  const day = iso(ctx.now), out = [];
  if (u.usd24 > threshold) out.push({ type: 'usd', title: `Koszty AI: $${u.usd24.toFixed(2)} w 24 h (próg $${threshold.toFixed(2)})`, detail: `Realnie zapłacone (API) w ostatnich 24 h: $${u.usd24.toFixed(2)}. Próg: ops.app_settings ai_alert_day_usd.` });
  const avg = (u.equivDays ?? []).length ? u.equivDays.reduce((a, b) => a + b, 0) / u.equivDays.length : 0;
  if (u.equiv24 > floor && avg > 0 && u.equiv24 > factor * avg) out.push({ type: 'equiv', title: `Zużycie AI ${(u.equiv24 / avg).toFixed(1)}× średniej z 7 dni`, detail: `Równowartość cennika API w 24 h: $${u.equiv24.toFixed(2)}, średnio dziennie z 7 dni: $${avg.toFixed(2)}.${u.top ? ` Najwięcej: ${u.top}.` : ''}` });
  for (const o of out) {
    const r = await put(ctx, { kind: 'cost', city_slug: null, stop_key: null, dedupe_key: `cost:${day}:${o.type}`, url: null, quote: null, title: o.title, detail: o.detail,
      proposal: { type: o.type, usd24: u.usd24, equiv24: u.equiv24, avg7: avg, recommended: 1, options: [{ n: 1, label: 'Przyjęte do wiadomości' }] } });
    if (r.inserted) await ctx.notify?.(`💸 Strażnik kosztów: ${o.title}. ${o.detail}`);
  }
  return { checked: 1, alerts: out.length };
}

// ── wykonanie decyzji JP: przyjęte propozycje → NOWA WERSJA szkicu (kodem, bez AI) ───────────────────
// ctx: { store, loadBase(city) → {version, trip, review, content}, saveDraft(city, trip, {note, changes, base}) → {version}, costRequest?, dry, log }
export async function applyPending(ctx) {
  const pend = await ctx.store.pendingApply();
  const byCity = new Map();
  for (const f of pend) { if (!byCity.has(f.city_slug)) byCity.set(f.city_slug, []); byCity.get(f.city_slug).push(f); }
  const out = [];
  for (const [city, list] of byCity) {
    const fail = async (f, why) => ctx.store.update(f.id, { apply_state: 'failed', apply_result: clip(why, 400) });
    let base = null;
    try { base = await ctx.loadBase(city); } catch (e) { ctx.log?.(`strażnicy: ${city} — ${e.message}`); }
    if (!base?.trip?.meta) { for (const f of list) await fail(f, 'brak szkicu ani opublikowanej wersji z plikami trasy'); continue; }
    let trip = base.trip; const changes = [], done = [];
    for (const f of list.sort((a, b) => a.id - b.id)) {
      try {
        const closure = f.proposal?.closure_id ? await ctx.store.get(f.proposal.closure_id) : null;
        const opt = f.decided_option ?? f.proposal?.recommended ?? 1;
        const r = applyFinding(trip, f, { option: opt, closure });
        if (r.skip) { await ctx.store.update(f.id, { apply_state: 'done', apply_result: `bez zmian: ${r.skip}` }); continue; }
        trip = r.trip; changes.push(...r.changes); done.push({ f, r, opt, closure });
      } catch (e) { await fail(f, e.message); }
    }
    if (!done.length) continue;
    if (ctx.dry) { out.push({ city, dry: true, changes }); continue; }
    let saved;
    try { saved = await ctx.saveDraft(city, trip, { note: `strażnicy: ${done.map(d => `#${d.f.id} ${d.f.kind}`).join(', ')}`, changes, base }); }
    catch (e) { for (const d of done) await fail(d.f, `zapis szkicu: ${e.message}`); continue; }
    for (const { f, r, opt, closure } of done) {
      let result = `szkic v${saved.version} do zatwierdzenia`;
      if (r.needsAi) {
        let ok = false; try { ok = !!(await ctx.costRequest?.({ city_slug: city, finding_id: f.id, title: r.needsAi })); } catch { ok = false; }
        result += ` · AI (${r.needsAi}) czeka na zgodę na koszt${ok ? '' : ' — prośba nie zapisana (brak ops.cost_requests), decyzja JP'}`;
      }
      await ctx.store.update(f.id, { apply_state: 'done', apply_result: result, proposal: { ...f.proposal, applied_option: opt, ...(r.snapshot ? { snapshot: r.snapshot } : {}) } });
      if (closure && (f.kind === 'reopen' || (f.kind === 'closure_overdue' && opt === 3)))
        await ctx.store.update(closure.id, { status: 'resolved', decision_note: `otwarte ponownie (strażnik #${f.id}, szkic v${saved.version})` });
      else if (closure && f.kind === 'closure_overdue')
        await ctx.store.update(closure.id, { proposal: { ...closure.proposal, applied_option: opt, ...(r.snapshot ? { snapshot: r.snapshot } : {}) } });
    }
    out.push({ city, version: saved.version, n: done.length, titles: done.map(d => d.f.title) });
  }
  return out;
}
