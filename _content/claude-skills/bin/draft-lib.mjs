// Wspólne narzędzia szkiców wycieczek prowadzonych w rozmowie (trip-draft, trip-revise, trip-approve).
// Szkic = para plików w formacie quolino-trip-writing: meta (dane maszynowe) + content (proza PL).
// Zmiany zawsze jako lista operacji na ścieżkach — model zmienia tylko to, o co go poproszono.
import { writeFileSync, mkdirSync, readdirSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { run, env, log, extractJson, openrouter, openrouterJson } from './lib.mjs';
import { rulesText, extraCheck, mergeReview } from './quality-lib.mjs';

export const SITE = env('QUOLINO_SITE_URL') || 'https://quolino.srv1984679.hstgr.cloud';
export const WORK = '/opt/data/quolino/work/drafts';
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
  return mergeReview(rv, await extraCheck(slug, trip));
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
  for (const op of ops ?? []) {
    try {
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
4 akapity i 300 słów (zwykle 5–8); ulica/punkt widokowy/zdjęcie — 2 akapity i 120 słów; parking i lokale — 1 akapit.
Szkielet zabytku: (1) hak — dlaczego warto tu stanąć; (2) historia i ludzie; (3) „Kim był/była…”; (4) co oglądać, z dokładnym miejscem;
(5) legenda — akapit zaczyna się od „Legenda mówi…” albo „Według tradycji…” i kończy tym, co wiadomo historycznie;
(6) ciekawostka, popkultura albo znaczenie dziś. Każdy akapit wnosi nową treść; bez wypełniaczy („zachwyca”, „warto zobaczyć”,
„bogata historia”) — zamiast przymiotnika fakt. Legenda z researchu MUSI trafić do opisu i nigdy nie jest podana jako fakt.
Rozbudowując opis, bierz fakty WYŁĄCZNIE z researchu; czego tam nie ma — nie wymyślaj, dodaj notatkę w content._notes.`;

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
