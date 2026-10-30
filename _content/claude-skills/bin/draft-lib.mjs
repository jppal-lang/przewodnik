// Wspólne narzędzia szkiców wycieczek prowadzonych w rozmowie (trip-draft, trip-revise, trip-approve).
// Szkic = para plików w formacie quolino-trip-writing: meta (dane maszynowe) + content (proza PL).
// Zmiany zawsze jako lista operacji na ścieżkach — model zmienia tylko to, o co go poproszono.
import { writeFileSync, mkdirSync, readdirSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { run, env, log, extractJson, openrouter, openrouterJson } from './lib.mjs';
import { rulesText, extraCheck, mergeReview } from './quality-lib.mjs';
import './review-where.mjs';
const RW = globalThis.ReviewWhere;

export const SITE = env('QUOLINO_SITE_URL') || 'https://quolino.com';
export const WORK = '/opt/data/quolino/work/drafts';
// Adres strony miasta: /{lang}/{kraj}/{region}/{miasto}/ (kraj ISO, region i miasto = url_slug; brak url_slug → wewnętrzny slug)
export async function cityPageUrl(q, slug, lang = 'pl') {
  let r = null;
  try { r = (await q('SELECT c.country, COALESCE(c.url_slug, c.slug) AS u, COALESCE(r.url_slug, r.slug) AS rurl FROM public.cities c LEFT JOIN public.regions r ON r.slug = c.region_slug WHERE c.slug = $1', [slug]))[0]; }
  catch { /* kolumny url_slug jeszcze nie ma (SQL czeka na zgodę) */ }
  return r ? `${SITE}/${lang}/${String(r.country).toLowerCase()}/${r.rurl}/${r.u}/` : `${SITE}/city.html?c=${slug}`;   // ostatni wariant: 301 z SSR
}
export const previewUrl = (token, v) => `${SITE}/city.html?draft=${token}${v ? `&v=${v}` : ''}`;
const clone = (o) => JSON.parse(JSON.stringify(o));

// ── pliki robocze + kontrola (walidator mechaniczny + Claude, trip-review.mjs) ──────────────────
export function writeTrip(slug, trip) {
  const dir = join(WORK, slug, slug);              // katalog = slug (wymaga tego walidator)
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (/^review-.*\.json$/.test(f)) unlinkSync(join(dir, f));   // stare raporty nie mylą
  writeFileSync(join(dir, `${slug}.meta.json`), JSON.stringify(trip.meta, null, 2));
  writeFileSync(join(dir, `${slug}.pl.json`), JSON.stringify(trip.content, null, 2));
  return dir;
}

export async function review(dir) {
  const r = await run('node', ['/opt/data/quolino/trip-review.mjs', dir], { timeout: 30 * 60_000 });
  const files = readdirSync(dir).filter(f => /^review-.*\.json$/.test(f)).sort();
  for (const f of files.reverse()) {
    const t = readFileSync(join(dir, f), 'utf8');
    if (t.trim()) { const j = JSON.parse(t); return { verdict: j.verdict, summary: j.summary, errors: j.errors ?? [], warnings: j.warnings ?? [] }; }
  }
  throw new Error(`trip-review nie zwrócił raportu (kod ${r.code}): ${(r.err || r.out).slice(-400)}`);
}

// Pełna kontrola: trip-review (zasady umiejętności) + fakty z Wikipedią + zasady redakcyjne JP
export async function fullReview(slug, trip) {
  const rv = await review(writeTrip(slug, trip));
  const m = mergeReview(rv, await extraCheck(slug, trip));
  // każda uwaga przy konkretnym polu (JP 2026-10-30): path/quote kodem, gdy kontrola ich nie podała
  try { RW.annotate(m, RW.fieldsFromTrip(trip, trip.stop_blocks_v2)); } catch (e) { log(`miejsca uwag: ${e.message}`); }
  return m;
}

// ── operacje na szkicu ───────────────────────────────────────────────────────────────────────
// {op:"set", path, value, why}
//   meta.city.<pole> · meta.stops.<stop_key>.<pole> · meta.emergency.<n>.<pole> · meta.route
//   content.city.<pole> · content.stops.<stop_key>.<pole> · content.stops.<stop_key>.desc_paragraphs[.<n>]
//   content.day_plan.<stop_key> · content.emergency.<n>.<pole> · content._notes
// {op:"add_stop", after:"<stop_key>", meta:{…}, pl:{…}, day_plan:"…", why}
// {op:"remove_stop", stop_key, why} · {op:"move_stop", stop_key, after:"<stop_key>", why}
function resolve(trip, path) {
  const parts = path.split('.');
  if (!['meta', 'content'].includes(parts[0])) throw new Error(`ścieżka musi zaczynać się od meta. albo content.: ${path}`);
  let o = trip[parts[0]];
  for (let i = 1; i < parts.length - 1; i++) {
    const k = parts[i];
    if (Array.isArray(o)) o = /^\d+$/.test(k) ? o[+k] : o.find(x => x?.stop_key === k);
    else o = o?.[k];
    if (o == null || typeof o !== 'object') throw new Error(`nie ma takiego miejsca: ${path}`);
  }
  return { parent: o, key: parts.at(-1) };
}
function renumber(meta) { meta.stops.forEach((s, i) => { s.stop_number = i + 1; }); }

export function applyOps(trip, ops) {
  const t = clone(trip);
  const changes = [];
  const skipped = [];
  for (let op of ops ?? []) {
    try {
      // modele zapisują ścieżki jako desc_paragraphs[2] albo _notes[0].note — normalizujemy do formy z kropką
      if (typeof op.path === 'string') op = { ...op, path: op.path.replace(/\[(\d+)\]/g, '.$1') };
      if (op.op === 'set' || (!op.op && op.path)) {
        const { parent, key } = resolve(t, op.path);
        if (Array.isArray(parent)) {
          const i = /^\d+$/.test(key) ? +key : parent.findIndex(x => x?.stop_key === key);
          if (i < 0 || i > parent.length) throw new Error(`nie ma takiego miejsca: ${op.path}`);
          const before = parent[i];
          if (op.value === null && i < parent.length && op.path.includes('desc_paragraphs')) parent.splice(i, 1);   // usunięcie akapitu
          else parent[i] = op.value;
          changes.push({ path: op.path, before: before ?? null, after: op.value, why: op.why ?? null });
        } else {
          const content = op.path.startsWith('content.');
          if (!(key in parent) && !(content && op.path.split('.')[1] === 'day_plan') && !op.path.endsWith('_notes'))
            throw new Error(`nieznane pole ${op.path} — format nie przewiduje takiego klucza`);
          const before = parent[key];
          parent[key] = op.value;
          changes.push({ path: op.path, before: before ?? null, after: op.value, why: op.why ?? null });
        }
      } else if (op.op === 'add_stop') {
        const key = op.meta?.stop_key;
        if (!key || !/^[a-z0-9-]+$/.test(key)) throw new Error(`add_stop: zły stop_key ${key}`);
        if (t.meta.stops.some(s => s.stop_key === key)) throw new Error(`add_stop: ${key} już jest`);
        const at = op.after ? t.meta.stops.findIndex(s => s.stop_key === op.after) + 1 : t.meta.stops.length;
        if (op.after && at === 0) throw new Error(`add_stop: nie ma przystanku ${op.after}`);
        t.meta.stops.splice(at, 0, op.meta);
        t.content.stops[key] = op.pl;
        if (op.day_plan && t.content.day_plan && !Array.isArray(t.content.day_plan)) t.content.day_plan[key] = op.day_plan;
        renumber(t.meta);
        changes.push({ op: 'add_stop', stop_key: key, name: op.pl?.name ?? key, after: op.after ?? null, why: op.why ?? null });
      } else if (op.op === 'remove_stop') {
        const i = t.meta.stops.findIndex(s => s.stop_key === op.stop_key);
        if (i < 0) throw new Error(`remove_stop: nie ma ${op.stop_key}`);
        if (i === 0) throw new Error('remove_stop: przystanek 01 to parking — nie usuwam');
        t.meta.stops.splice(i, 1);
        delete t.content.stops[op.stop_key];
        if (t.content.day_plan && !Array.isArray(t.content.day_plan)) delete t.content.day_plan[op.stop_key];
        renumber(t.meta);
        changes.push({ op: 'remove_stop', stop_key: op.stop_key, why: op.why ?? null });
      } else if (op.op === 'move_stop') {
        const i = t.meta.stops.findIndex(s => s.stop_key === op.stop_key);
        if (i <= 0) throw new Error(`move_stop: nie ma ${op.stop_key} albo to parking`);
        const [s] = t.meta.stops.splice(i, 1);
        const at = t.meta.stops.findIndex(x => x.stop_key === op.after) + 1;
        if (at <= 0) { t.meta.stops.splice(i, 0, s); throw new Error(`move_stop: nie ma ${op.after}`); }
        t.meta.stops.splice(at, 0, s);
        renumber(t.meta);
        changes.push({ op: 'move_stop', stop_key: op.stop_key, after: op.after, why: op.why ?? null });
      } else throw new Error(`nieznana operacja ${JSON.stringify(op).slice(0, 80)}`);
    } catch (e) { skipped.push(e.message); }
  }
  return { trip: t, changes, skipped };
}

// kilka rund poprawek tej samej ścieżki → jedna zmiana „przed (pierwsze) → po (ostatnie)”
export function mergeChanges(list) {
  const out = []; const byPath = new Map();
  for (const c of list) {
    if (c.path && byPath.has(c.path)) { const p = byPath.get(c.path); p.after = c.after; if (c.why) p.why = p.why && p.why !== c.why ? `${p.why}; ${c.why}` : c.why; continue; }
    const x = { ...c }; out.push(x); if (c.path) byPath.set(c.path, x);
  }
  return out.filter(c => !c.path || JSON.stringify(c.before) !== JSON.stringify(c.after));
}

// ── GPT: operacje według poleceń albo według błędów kontroli ──────────────────────────────────
export const OPS_FORMAT = `Odpowiedz WYŁĄCZNIE JSON-em:
{"summary": "1–2 zdania po polsku: co zmieniasz", "ops": [ … ]}
Operacje:
 {"op":"set","path":"…","value":…,"why":"krótko po polsku"}
   ścieżki: meta.city.<pole> · meta.stops.<stop_key>.<pole> · meta.emergency.<n>.<pole>
            content.city.<pole> · content.stops.<stop_key>.<pole> · content.stops.<stop_key>.desc_paragraphs.<n>
            content.day_plan.<stop_key> · content.emergency.<n>.<pole> · content._notes
   value to pełna nowa wartość pola (tekst, liczba, lista, null). Nowy akapit: desc_paragraphs.<kolejny numer>.
 {"op":"add_stop","after":"<stop_key>","meta":{…komplet pól jak w meta.stops…},"pl":{…komplet pól jak w content.stops…},"day_plan":"…","why":"…"}
 {"op":"remove_stop","stop_key":"…","why":"…"}
 {"op":"move_stop","stop_key":"…","after":"<stop_key>","why":"…"}
Zmieniaj tylko to, czego dotyczy polecenie. Nie przepisuj pól, które są dobre. stop_key nigdy się nie zmienia.
Bez emoji w wartościach. Fakty, godziny i ceny tylko pewne — inaczej null / "unverified" / notatka w content._notes.`;

// Minimum głębokości opisu rodzica (JP, 2026-10-13) — wspólny tekst dla pisania i poprawek
export const DEPTH_TEXT = `GŁĘBOKOŚĆ OPISU RODZICA (dolna granica, nie cel; poniżej = błąd walidatora): zabytek/kościół/muzeum/zamek/synagoga/dom —
4 akapity i 300 słów (zwykle 5–8), mały obiekt (monument: most, wieża, pomnik) 3 akapity i 180 słów; ulica/punkt widokowy/zdjęcie — 2 akapity i 120 słów; parking i lokale — 1 akapit.
Szkielet zabytku: (1) hak — dlaczego warto tu stanąć; (2) historia i ludzie; (3) „Kim był/była…”; (4) co oglądać, z dokładnym miejscem.
Legenda, ciekawostka i popkultura NIE wchodzą do opisu (standard docs/TRESC-PRZYSTANKU.md, JP 2026-10-18) — mają własne bloki,
które pisze stop-content.mjs; w opisie najwyżej jedno zdanie-zapowiedź. Każdy akapit wnosi nową treść; bez wypełniaczy („zachwyca”,
„warto zobaczyć”, „bogata historia”) — zamiast przymiotnika fakt. Legenda nigdy nie jest podana jako fakt.
Rozbudowując opis, bierz fakty WYŁĄCZNIE z researchu; czego tam nie ma — nie wymyślaj, dodaj notatkę w content._notes.
GDY FIZYCZNIE NIE MA MATERIAŁU na minimum słów (JP 2026-10-26): NIE dopychaj tekstu wypełniaczami ani powtórzeniami — napisz krócej i dodaj notatkę redakcyjną
(pole „gap” albo content._notes: {stop_key, field: "b", note: "ZA MAŁO MATERIAŁU: czego brakuje"}). Notatki redakcyjne nie trafiają do widoku użytkownika; walidator traktuje wtedy krótszy opis jako ostrzeżenie, nie błąd.
AKAPIT TO AKAPIT: przy zabytku min. 40 słów i 2+ zdania. Jednozdaniowe „akapity” (cięcie tekstu, by zaliczyć próg) to błąd walidatora.`;

// research.md szkicu (z trip-draft) — kontrola i poprawki sprawdzają, czy opis go wykorzystał
export function loadResearch(slug) {
  const f = join(WORK, slug, 'research.md');
  return existsSync(f) ? readFileSync(f, 'utf8') : null;
}

export async function gptOps(trip, instruction, { reviewErrors } = {}) {
  const research = loadResearch(trip.meta.city.slug);
  const prompt = `Tryb A — POPRAWKI WYCIECZKI ${trip.meta.city.slug}.
${instruction ? `POLECENIE (od JP, przez Hermesa):\n${instruction}\n` : ''}${reviewErrors?.length ? `
BŁĘDY Z KONTROLI (Claude + walidator) — popraw każdy:
${reviewErrors.map(e => `- ${e.stop_key ?? 'miasto'} [${e.field ?? ''}]: ${e.problem}${e.fix ? ' → ' + e.fix : ''}`).join('\n')}
` : ''}
${OPS_FORMAT}

${DEPTH_TEXT}

${rulesText()}
${research ? `RESEARCH (jedyne źródło nowych faktów przy rozbudowie opisu):
${research}

` : ''}AKTUALNY SZKIC:
${JSON.stringify(trip)}`;
  const { model, cost, json: j } = await openrouterJson('quolino-trip-writing', prompt, 'draft');
  return { ops: Array.isArray(j.ops) ? j.ops : [], summary: j.summary ?? '', model, cost };
}

// ── Opis rodzica przystanek po przystanku (JP 2026-10-13) ────────────────────────────────────────
// Cała wycieczka w jednej odpowiedzi kończyła się skracaniem: model ciął tekst na jednozdaniowe „akapity”.
// Dlatego opis każdego zabytku/miejsca powstaje w osobnym wywołaniu, z całym research.md i sprawdzeniem lokalnym
// (te same progi co walidator), a szkielet, questy i plan dnia powstają osobno.
// progi i descProblems żyją w czystym module desc-rules.mjs (testy bez bazy); tu tylko eksport dalej
import { SIGHT_CATS, PLACE_CATS, DESCRIBE_CATS, descProblems } from './desc-rules.mjs';
export { SIGHT_CATS, PLACE_CATS, DESCRIBE_CATS, descProblems };

export async function describeStop(trip, stopKey, { errors = [], instruction = '' } = {}) {
  const slug = trip.meta.city.slug;
  const s = trip.meta.stops.find(x => x.stop_key === stopKey);
  const pl = trip.content.stops[stopKey] ?? {};
  const research = (loadResearch(slug) ?? '').slice(0, 70_000);
  let feedback = errors.map(e => `- ${e.problem}${e.fix ? ' → ' + e.fix : ''}`).join('\n');
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const prompt = `Tryb A — OPIS RODZICA jednego przystanku (pole desc_paragraphs). Wycieczka: ${trip.content.city?.title ?? slug}.
PRZYSTANEK: ${pl.name ?? stopKey} (stop_key \"${stopKey}\", kategoria ${s?.category}, rok/okres: ${s?.year_built ?? 'brak'}).
${instruction ? `POLECENIE: ${instruction}\n` : ''}${feedback ? `POPRAW (uwagi kontroli):\n${feedback}\n` : ''}
${DEPTH_TEXT}
AKAPIT to akapit: min. 40 słów i co najmniej 2 zdania (zabytek). Nigdy nie dziel tekstu na jednozdaniowe „akapity” — to obejście progu
i jest błędem. Pisz opowieść, nie listę faktów: kto, po co, co się wydarzyło, „kim był…”, detale do oglądania z dokładnym miejscem.
Legendy, ciekawostki i popkultury nie opowiadaj w opisie (osobne bloki) — najwyżej jedno zdanie-zapowiedź. Używaj WYŁĄCZNIE faktów z researchu
(sekcje o tym przystanku); czego brakuje — nie wymyślaj, opisz w polu \"gap\".
${rulesText()}
AKTUALNY OPIS:\n${JSON.stringify(pl.desc_paragraphs ?? [])}\n
RESEARCH:\n${research}\n
Odpowiedz WYŁĄCZNIE JSON-em: {"desc_paragraphs": ["…", …], "gap": null albo "czego zabrakło w researchu do pełnego opisu"}`;
    const { model, json: j } = await openrouterJson('quolino-trip-writing', prompt, 'draft');
    const paras = Array.isArray(j.desc_paragraphs) ? j.desc_paragraphs.filter(x => typeof x === 'string' && x.trim()) : [];
    const probs = descProblems(s?.category, paras);
    last = { paragraphs: paras, gap: j.gap ?? null, model, problems: probs };
    if (!probs.length) return last;
    log(`  ${stopKey}: opis nie spełnia progów (${probs.join('; ')}) — próba ${attempt + 1}/3`);
    feedback = `Poprzednia wersja nie spełniła progów: ${probs.join('; ')}. Napisz opis od nowa, dłuższy, z materiału researchu.\n${feedback}`;
  }
  return last;
}

// opisy wszystkich przystanków zwiedzania (pierwszy szkic) albo wskazanych kluczy; zwraca operacje „set”
export async function describeOps(trip, keys) {
  const ops = []; const models = new Set();
  const notes = [...(trip.content._notes ?? [])];
  for (const s of trip.meta.stops) {
    if (!DESCRIBE_CATS.has(s.category) || (keys && !keys.includes(s.stop_key))) continue;
    const r = await describeStop(trip, s.stop_key, {});
    models.add(r.model);
    if (r.paragraphs.length) ops.push({ op: 'set', path: `content.stops.${s.stop_key}.desc_paragraphs`, value: r.paragraphs, why: 'opis rodzica (osobne wywołanie)' });
    if (r.gap) notes.push({ stop_key: s.stop_key, field: 'b', note: `ZA MAŁO MATERIAŁU: ${r.gap}` });
  }
  if (notes.length !== (trip.content._notes ?? []).length) ops.push({ op: 'set', path: 'content._notes', value: notes, why: 'luki w researchu' });
  return { ops, models: [...models] };
}

// runda poprawek po kontroli: błędy opisu rodzica → osobne wywołanie na przystanek, reszta → zwykłe gptOps
export async function fixRound(trip, instruction, reviewErrors) {
  const isDesc = (e) => e.stop_key && DESCRIBE_CATS.has(trip.meta.stops.find(s => s.stop_key === e.stop_key)?.category) &&
    (/^(b|desc)/i.test(e.field ?? '') || /akapit|minimum|legend|opis rodzica|research/i.test(e.problem ?? ''));
  const descErrs = (reviewErrors ?? []).filter(isDesc), rest = (reviewErrors ?? []).filter(e => !isDesc(e));
  const ops = []; const models = []; let summary = '';
  for (const key of [...new Set(descErrs.map(e => e.stop_key))]) {
    const r = await describeStop(trip, key, { errors: descErrs.filter(e => e.stop_key === key), instruction: instruction ?? '' });
    models.push(r.model);
    if (r.paragraphs.length) ops.push({ op: 'set', path: `content.stops.${key}.desc_paragraphs`, value: r.paragraphs, why: 'opis rodzica poprawiony po kontroli' });
  }
  if (descErrs.length) summary = `przepisane opisy: ${[...new Set(descErrs.map(e => e.stop_key))].join(', ')}`;
  if (rest.length || !descErrs.length) {
    const g = await gptOps(trip, instruction, { reviewErrors: rest });
    ops.push(...g.ops); models.push(g.model); summary = [summary, g.summary].filter(Boolean).join('; ');
  }
  return { ops, summary, model: models.filter(Boolean).join('+') };
}

// ── zapis szkicu w bazie (nowa wersja draft; tabele na żywo nietknięte) ──────────────────────
export async function saveDraft(q, trip, { note, source, changes, review }) {
  // teksty wycieczek są czystym tekstem (strona je escapuje) — HTML z modelu zamieniamy na akapity / zwykły tekst
  const plain = (v) => typeof v === 'string'
    ? v.replace(/\s*(<br\s*\/?>|<\/p>\s*<p[^>]*>)\s*/gi, '\n\n').replace(/<\/?[a-z][^>]*>/gi, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim()
    : Array.isArray(v) ? v.map(plain) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)])) : v;
  trip = { ...trip, meta: plain(trip.meta), content: plain(trip.content) };
  // time_label = sama godzina HH:MM (decyzja JP 2026-10-11): komentarz typu „orientacyjnie po…” trafia na stronę
  // we wszystkich językach bez tłumaczenia — zostawiamy tylko godzinę, a bez godziny pole jest puste
  const hhmm = (o) => Array.isArray(o) ? o.forEach(hhmm) : o && typeof o === 'object' && Object.entries(o).forEach(([k, v]) => {
    if (k === 'time_label' && typeof v === 'string' && !/^\d{1,2}:\d{2}$/.test(v.trim())) {
      const m = v.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
      o[k] = m ? `${m[1]}:${m[2]}` : null;
    } else if (v && typeof v === 'object') hhmm(v);
  });
  hhmm(trip.meta); hhmm(trip.content);
  // punkty awaryjne: tylko znane typy i z adresem. Rundy poprawek potrafiły zostawić puste wpisy (type: null)
  // albo wymyślone typy („alarm”) i cały zapis padał na NOT NULL w emergency_points (Arezzo, JP 2026-10-15).
  // Zachowujemy zgodność numerów: content.emergency (obiekt „1”,„2”… albo tablica) przesuwamy razem z meta.
  if (Array.isArray(trip.meta?.emergency)) {
    const OK = new Set(['pharmacy', 'hospital', 'toilet', 'playground']);
    const keep = trip.meta.emergency.map(e => !!(e && OK.has(e.type) && e.maps_query));
    if (keep.some(k => !k)) {
      const dropped = trip.meta.emergency.filter((_, i) => !keep[i]);
      trip.meta.emergency = trip.meta.emergency.filter((_, i) => keep[i]);
      const ce = trip.content?.emergency;
      if (Array.isArray(ce)) trip.content.emergency = ce.filter((_, i) => keep[i]);
      else if (ce && typeof ce === 'object') {
        const out = {}; let n = 0;
        keep.forEach((k, i) => { if (k && ce[String(i + 1)] !== undefined) out[String(++n)] = ce[String(i + 1)]; else if (k) n++; });
        trip.content.emergency = out;
      }
      console.error(`punkty awaryjne: pominięto ${dropped.length} wpis(y) bez poprawnego typu/adresu: ${JSON.stringify(dropped)}`);
    }
  }
  let r;
  // rola `quolino` ma search_path = ops, public, a funkcje importu (import_city…) nie ustawiają własnej ścieżki,
  // więc `cities` trafiało do ops.cities (bez sort_order). Na czas zapisu wymuszamy public (JP 2026-10-12).
  await q('SET search_path = public, pg_temp');
  try {
    [r] = await q('SELECT public.trip_draft_save($1::jsonb, $2::jsonb, $3, $4, $5::jsonb, $6::jsonb) AS r',
      [JSON.stringify(trip.meta), JSON.stringify(trip.content), note ?? null, source, JSON.stringify(changes ?? []), review ? JSON.stringify(review) : null]);
  } catch (e) {
    // zapisz niezapisany szkic na dysk, żeby nie przepadł 20-minutowy wysiłek, i pokaż kontekst błędu SQL (JP 2026-10-12)
    const slug = trip.meta?.city?.slug ?? 'unknown';
    const f = join(WORK, `${slug}-unsaved.json`);
    try { writeFileSync(f, JSON.stringify({ trip, review, error: String(e.message), where: e.where ?? null }, null, 2)); log(`szkic nie zapisał się w bazie — kopia: ${f}; SQL: ${e.where ?? e.message}`); } catch {}
    throw e;
  } finally {
    await q('SET search_path = ops, public').catch(() => {});
  }
  return r.r;
}

// ── powiadomienie w wątku Discorda (gdy Hermes uruchomił skrypt w tle) ──────────────────────
// kanał po nazwie („#lokale”) → id; bot widzi kanały swoich serwerów
const chanCache = {};
async function resolveChannel(channel, token) {
  if (!String(channel).startsWith('#')) return channel;
  if (chanCache[channel]) return chanCache[channel];
  const name = channel.slice(1).toLowerCase();
  const H = { Authorization: `Bot ${token}` };
  const guilds = await (await fetch('https://discord.com/api/v10/users/@me/guilds', { headers: H })).json().catch(() => []);
  for (const g of Array.isArray(guilds) ? guilds : []) {
    const chans = await (await fetch(`https://discord.com/api/v10/guilds/${g.id}/channels`, { headers: H })).json().catch(() => []);
    const ch = (Array.isArray(chans) ? chans : []).find(c => c.type === 0 && c.name?.toLowerCase() === name);
    if (ch) return (chanCache[channel] = ch.id);
  }
  log(`Discord: nie znalazłem kanału ${channel}`);
  return null;
}

// kanał tekstowy w kategorii Discorda (np. „Zgłoszenia” → #zgl-strona); tworzy kategorię i kanał przy pierwszym użyciu
export async function ensureChannel(name, category = 'Zgłoszenia') {
  const key = `${category}/${name}`;
  if (chanCache[key]) return chanCache[key];
  const token = env('DISCORD_BOT_TOKEN'), guild = env('DISCORD_GUILD_ID');
  if (!token || !guild) return null;
  const H = { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' };
  const api = async (m, path, body) => { const r = await fetch(`https://discord.com/api/v10${path}`, { method: m, headers: H, body: body ? JSON.stringify(body) : undefined }); if (!r.ok) throw new Error(`${m} ${path} → ${r.status}`); return r.json(); };
  try {
    const chans = await api('GET', `/guilds/${guild}/channels`);
    let cat = chans.find(c => c.type === 4 && c.name.toLowerCase() === category.toLowerCase());
    cat ??= await api('POST', `/guilds/${guild}/channels`, { name: category, type: 4 });
    let ch = chans.find(c => c.type === 0 && c.name === name && c.parent_id === cat.id);
    ch ??= await api('POST', `/guilds/${guild}/channels`, { name, type: 0, parent_id: cat.id });
    return (chanCache[key] = ch.id);
  } catch (e) { log(`Discord: kanał ${category}/${name} — ${e.message}`); return null; }
}

export async function notify(channel, text) {
  const token = env('DISCORD_BOT_TOKEN');
  if (!channel || !token) return false;
  channel = await resolveChannel(channel, token);
  if (!channel) return false;
  for (let i = 0; i < text.length; i += 1900) {
    const r = await fetch(`https://discord.com/api/v10/channels/${channel}/messages`, {
      method: 'POST', headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text.slice(i, i + 1900), allowed_mentions: { parse: [] } }),
    }).catch(e => ({ ok: false, statusText: e.message }));
    if (!r.ok) { log('Discord:', r.status, r.statusText); return false; }
  }
  return true;
}

export function verdictLine(rv) {
  if (!rv) return 'kontrola Claude: brak';
  return `Claude: ${rv.verdict}${rv.errors?.length ? ` · błędy ${rv.errors.length}` : ''}${rv.warnings?.length ? ` · uwagi ${rv.warnings.length}` : ''}`;
}

export function factsLine(rv) {
  const f = rv?.facts;
  if (!f) return '';
  return `\nFakty (Wikipedia ${(f.langs ?? []).join('→')} + strony lokalne): ✓ ${f.confirmed}${f.contradicted ? ` · ✗ niezgodne ${f.contradicted}` : ''}${f.unverified ? ` · bez źródła ${f.unverified}` : ''}${f.added_sources ? ` · dopisane źródła ${f.added_sources}` : ''}\n`;
}
