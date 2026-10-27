// Ikony miejsc (JP 2026-10-27) — czyste funkcje bez sieci, bazy i plików: filtr ludzi, ranking zdjęć z Commons,
// odpowiedzi JP na Discordzie, nazwy plików, prompt generatora. Testy: place-icons.test.mjs. Opis zasad: docs/IKONY-MIEJSC.md.
import { PRACTICAL_CATS } from './stop-content-lib.mjs';

export const SIZES = [64, 128, 256, 512];
export const STYLE_REF = 'media/tours/quolino-it-rimini-hero-1200.webp';
export const BG = '#FF00FF';   // płaskie tło do wycięcia: magenta nie występuje w ciepłej architekturze o złotej godzinie
export { PRACTICAL_CATS };

// ── nazwy i ścieżki ───────────────────────────────────────────────────────────────────────────
export const safeKey = (k) => /^[a-z0-9][a-z0-9-]*$/.test(String(k ?? ''));
export const stopDir = (work, trip, key) => `${work}/${trip}/${key}`;
export const outName = (v) => `out-v${v}.png`;
export const iconPath = (trip, key, size) => `media/icons/place-${trip}-${key}-${size}.webp`;
export const iconBase = (repo, trip, key) => `${repo}/media/icons/place-${trip}-${key}`;
export const sourcesKey = (trip, key) => `${trip}/${key}`;
export const agyName = (trip, key, v, retry = false) => `place_${trip}_${key}_v${v}${retry ? '_r' : ''}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');

// ── tekst z Commons ───────────────────────────────────────────────────────────────────────────
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export function stripHtml(s) {
  return String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/&(#?\w+);/g, (m, e) => ENT[e] ?? (/^#\d+$/.test(e) ? String.fromCodePoint(+e.slice(1)) : m))
    .replace(/\s+/g, ' ').trim();
}
const rx = (words) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.join('|')})(?![\\p{L}\\p{N}])`, 'iu');
// ludzie na zdjęciu (JP: NIGDY zdjęć z ludźmi) — tytuł, opis, kategorie pliku
export const PEOPLE_RE = rx(['people', 'persons?', 'personen', 'persone', 'persona', 'man', 'men', 'woman', 'women', 'boys?', 'girls?', 'child', 'children', 'kids?',
  'famil(?:y|ies)', 'couples?', 'crowds?', 'tourists?', 'turisti', 'turista', 'visitors?', 'visitatori', 'pilgrims?', 'pellegrini', 'process(?:ion|ions|ione|ioni)', 'prozession',
  'festivals?', 'festa', 'feste', 'sagra', 'fête', 'fest', 'weddings?', 'matrimonio', 'sposi', 'bride', 'groom', 'hochzeit', 'mariage', 'boda', 'portraits?', 'ritratto',
  'self-portrait', 'selfies?', 'infiorat[ae]', 'corteo', 'parades?', 'sfilata', 'concerts?', 'concerto', 'ceremon(?:y|ies)', 'cerimonia', 'mass', 'messa', 'carnival',
  'carnevale', 'rievocazione', 'reenactment', 'costumes?', 'costumi', 'musicians?', 'band', 'folla', 'gente', 'menschen', 'leute', 'foule', 'gens', 'friends', 'amici',
  'students?', 'studenti', 'scouts?', 'marathon', 'maratona', 'cyclists?', 'ciclisti', 'runners?', 'wikimedians?', 'meetup', 'wikimeetup', 'events?', 'evento',
  'markets?', 'mercato', 'mercatino', 'bambin[oi]', 'ragazz[aei]', 'nuns?', 'monks?', 'priests?', 'suore', 'frati', 'sacerdote', 'pope', 'papa', 'actors?', 'dancers?', 'performers?', 'statisti']);
// nie-zdjęcia i zdjęcia nieprzydatne do odtworzenia bryły
export const NONPHOTO_RE = rx(['maps?', 'mappa', 'karte', 'carte', 'plan', 'plans', 'pianta', 'planimetria', 'diagrams?', 'drawings?', 'disegno', 'sketch', 'schizzo',
  'stemma', 'coat of arms', 'wappen', 'logo', 'signs?', 'signage', 'cartello', 'postcards?', 'cartolina', 'stamps?', 'francobollo', 'nights?', 'notte', 'notturn[ao]',
  'nacht', 'nuit', 'fireworks', 'fuochi', 'scaffolding', 'ponteggi?o?', 'impalcatura', 'engraving', 'incisione', 'lithograph', 'painting', 'dipinto', 'model', 'plastico',
  'screenshot', 'satellite']);
// obniżka (nie odrzucenie): detale, stare/czarno-białe, śnieg, restauracja
export const PENALTY_RE = rx(['details?', 'dettagli?o?', 'particolar[ei]', 'close-?up', 'inscriptions?', 'iscrizion[ei]', 'lapide', 'plaques?', 'targa', 'epigrafe',
  'b\\s?&\\s?w', 'bw', 'black and white', 'bianco e nero', 'schwarzweiß', 'historic(?:al)? photo', 'foto storica', 'archivio', 'snow', 'neve', 'restauro', 'restoration', 'capitals?', 'capitell[oi]', 'aerial', 'drone']);
export const INTERIOR_RE = rx(['interiors?', 'intern[oi]', 'inside', 'innen', 'innenraum', 'intérieur', 'nave', 'navata', 'altars?', 'altare', 'apse', 'abside', 'ceiling', 'soffitto',
  'organ', 'organo', 'fresco(?:e?s)?', 'affresc[oh]i?', 'crypt', 'cripta', 'choir', 'pulpit', 'pulpito', 'mosaics?', 'mosaic[oi]', 'cappella', 'chapel', 'vault', 'volta']);
const EXT_TEXT_RE = /fasad|portal|bram|wież|mur(y|ach|ów)|facciat|porta |torr[ei]|mura|campanil|dzwonnic|łuk|arco|z zewnątrz|exterior/gi;
const INT_TEXT_RE = /wnętrz|fresk|mozaik|ołtarz|kaplic|sklepien|posadzk|intern[oi]|affresc|mosaic|altar|cappell|navat/gi;

// słowa z nazwy przystanku i miasta nie są sygnałem („Villa dei Mosaici” to nie „wnętrze”, „Festa…” w nazwie placu to nie impreza)
export function withoutNames(text, names = []) {
  let t = ' ' + String(text ?? '') + ' ';
  for (const n of names) for (const w of String(n ?? '').split(/[\s,()'’\-_/]+/)) {
    if (w.length < 4) continue;
    t = t.replace(new RegExp(`(?<![\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'giu'), ' ');
  }
  return t.replace(/\s+/g, ' ').trim();
}
export const peopleHit = (text, names = []) => withoutNames(text, names).match(PEOPLE_RE)?.[0] ?? null;

// widok przystanku: zewnętrze (domyślnie) albo wnętrze — tylko gdy tekst przystanku jest wyraźnie o wnętrzu
export function viewMode({ category, texts = [], override = null }) {
  if (override === 'interior' || override === 'exterior') return override;
  if (!['church', 'museum'].includes(category)) return 'exterior';
  const t = texts.join(' ');
  const i = (t.match(INT_TEXT_RE) ?? []).length, e = (t.match(EXT_TEXT_RE) ?? []).length;
  return i >= 3 && i > e * 2 ? 'interior' : 'exterior';
}

// ── kandydaci z Commons ───────────────────────────────────────────────────────────────────────
// strona z API Commons (formatversion=2, prop=imageinfo z extmetadata) → rekord kandydata
export function normPage(page, source) {
  const ii = page?.imageinfo?.[0];
  if (!ii) return null;
  const m = ii.extmetadata ?? {}, g = (k) => stripHtml(m[k]?.value ?? '');
  return { title: page.title, source, width: ii.width ?? 0, height: ii.height ?? 0, mime: ii.mime ?? '', url: ii.url, thumb: ii.thumburl ?? ii.url,
    page: ii.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(page.title).replace(/ /g, '_'))}`,
    author: g('Artist') || g('Credit') || 'nieznany', license: g('LicenseShortName') || g('UsageTerms') || 'nieznana', license_url: g('LicenseUrl') || null,
    description: g('ImageDescription').slice(0, 600), categories: contentCats(g('Categories')).join(' | ').slice(0, 1200), date: g('DateTimeOriginal') };
}
// kategorie techniczne (licencje, aparat, „Pages with maps”, „Files by User:…”) nie mówią nic o treści zdjęcia
const TECH_CAT = /^(CC[- ]|GFDL|PD[- ]|Self-published|Pages? with|Files? (with|by|from|uploaded)|Uploaded|Media (needing|with|without)|Taken with|Photographs taken|Images? (from|by|with)|Quality|Valued|Featured|License|Supported by|Wiki Loves|WLM|Created with|Photos? by|Photographs by|Location|Lens|Exif|Template|User:|Checked|Unidentified|Items with|Artworks with|Shot with|Panoramio|Flickr|Geograph)/i;
export const contentCats = (s) => String(s ?? '').split('|').map(x => x.trim()).filter(x => x && !TECH_CAT.test(x));
export function classify(c, { names = [], view = 'exterior' } = {}) {
  const text = withoutNames(`${String(c.title).replace(/^File:/, '').replace(/\.\w+$/, '').replace(/[_]/g, ' ')} ${c.description ?? ''} ${c.categories ?? ''}`, names);
  if (!/^image\/(jpeg|png|webp|tiff)$/.test(c.mime ?? '')) return { drop: `format ${c.mime || '?'}` };
  if (Math.max(c.width, c.height) < 1000) return { drop: `za małe (${c.width}×${c.height})` };
  let x;
  if ((x = text.match(PEOPLE_RE))) return { drop: `ludzie („${x[0]}”)` };
  if ((x = text.match(NONPHOTO_RE))) return { drop: `nie do odtworzenia bryły („${x[0]}”)` };
  const interior = text.match(INTERIOR_RE)?.[0];
  if (interior && view === 'exterior') return { drop: `wnętrze („${interior}”)` };
  let score = { p18: 3, cat: 1.5, subcat: 1, search: 0, manual: 10 }[c.source] ?? 0;
  score += Math.min((c.width * c.height) / 12e6, 1) * 2;
  score += c.width >= c.height * 1.15 ? 1.5 : c.width >= c.height * 0.95 ? 0.5 : 0;
  const yr = +(String(c.date).match(/\b(1[89]\d\d|20\d\d)\b/)?.[1] ?? 0);
  if (yr >= 2005) score += 0.5; else if (yr && yr < 1980) score -= 2;
  const hr = String(c.date).match(/\b(\d\d):\d\d/)?.[1];
  if (hr != null && (+hr >= 21 || +hr <= 5)) score -= 1.5;   // pora nocna w EXIF
  const pen = text.match(new RegExp(PENALTY_RE.source, 'giu')) ?? [];
  score -= 2 * new Set(pen.map(p => p.toLowerCase())).size;
  if (view === 'interior' && !interior) score -= 1;
  return { drop: null, score: +score.toFixed(2) };
}
// ranking: bez duplikatów, bez odrzuconych, najlepsze najpierw; exclude = tytuły odrzucone wcześniej przez JP („inne zdjęcia”)
export function rankCandidates(cands, { names = [], view = 'exterior', exclude = [] } = {}) {
  const seen = new Set(exclude), kept = [], dropped = [];
  for (const c of cands) {
    if (!c?.title || seen.has(c.title)) continue;
    seen.add(c.title);
    const r = classify(c, { names, view });
    if (r.drop) dropped.push({ title: c.title, reason: r.drop }); else kept.push({ ...c, score: r.score });
  }
  kept.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return { kept, dropped };
}
// podkategorie Commons: pomijamy „People at…”, „Infiorata…”, „Interior of…” (dla zewnętrza), mapy, noc
export function subcatOk(name, { names = [], view = 'exterior' } = {}) {
  const t = withoutNames(String(name).replace(/^Category:/, ''), names);
  if (PEOPLE_RE.test(t) || NONPHOTO_RE.test(t)) return false;
  if (view === 'exterior' && INTERIOR_RE.test(t)) return false;
  return true;
}

// ── Claude wybiera 2 zdjęcia (ogląda miniatury narzędziem Read) ───────────────────────────────
export function pickPrompt(stop, files, view) {
  return `Wybierasz 2 zdjęcia referencyjne do ilustracji miejsca „${stop.name_it || stop.name}” (${stop.city}, przystanek: ${stop.name}).
Ilustrator na ich podstawie narysuje SAM obiekt (bryła, architektura, kolory materiałów) — ${view === 'interior' ? 'tu chodzi o WNĘTRZE (to, co rodzina ogląda w środku)' : 'z ZEWNĄTRZ, cały obiekt'}.
Obejrzyj KAŻDE zdjęcie narzędziem Read (pliki poniżej, numer = indeks):
${files.map((f, i) => `${i + 1}. ${f.path}  (${f.title})`).join('\n')}

Zasady:
- ODRZUĆ każde zdjęcie, na którym widać choćby jedną osobę (także małą, w tle, w oknie, sylwetkę, odbicie). Wątpliwość = odrzuć.
- Oba wybrane zdjęcia muszą pokazywać TEN obiekt (nie sąsiedni budynek, nie inny kościół, nie widok z niego), w dzień, wyraźnie, możliwie w całości.
- Najlepiej dwa różne ujęcia tego samego obiektu (np. front i 3/4), bez rusztowań, bez nocy, bez detali z bliska.
Odpowiedz WYŁĄCZNIE JSON-em:
{"seen":[1,2,…],"with_people":[…],"wrong_object":[…],"pick":[i,j] albo null,"reasons":"po polsku, 1–2 zdania: dlaczego te dwa","people_in_picks":false}`;
}
export function validatePick(j, count) {
  if (!j || typeof j !== 'object') return { ok: false, error: 'brak JSON' };
  const seen = Array.isArray(j.seen) ? j.seen.filter(n => Number.isInteger(n) && n >= 1 && n <= count) : [];
  if (seen.length < Math.ceil(count / 2)) return { ok: false, error: `Claude obejrzał ${seen.length}/${count} zdjęć — sprawdź uprawnienie Read (claude --add-dir)`, noRead: true };
  if (j.pick == null) return { ok: false, error: `brak 2 dobrych zdjęć: ${j.reasons ?? ''}`.trim(), none: true };
  const p = Array.isArray(j.pick) ? j.pick.map(Number) : [];
  const bad = new Set([...(j.with_people ?? []), ...(j.wrong_object ?? [])].map(Number));
  if (p.length !== 2 || p[0] === p[1] || p.some(n => !Number.isInteger(n) || n < 1 || n > count)) return { ok: false, error: `zły wybór ${JSON.stringify(j.pick)}` };
  if (j.people_in_picks !== false || p.some(n => bad.has(n))) return { ok: false, error: 'wybrane zdjęcie ma ludzi albo inny obiekt' };
  return { ok: true, pick: p.map(n => n - 1), reasons: String(j.reasons ?? '') };
}

// ── prompt generatora obrazu (angielski; obrazy: 1–2 zdjęcia, 3 styl, 4 poprzednia wersja) ──
export function buildPrompt(stop, { view = 'exterior', notes = null, hasPrev = false, photos = 2 } = {}) {
  const ord = ['first', 'second', 'third', 'fourth'];
  const what = view === 'interior' ? `the interior highlight of ${stop.name_en || stop.name_it || stop.name} in ${stop.city}, Italy, shown as a small cut-away diorama`
    : `${stop.name_en || stop.name_it || stop.name} in ${stop.city}, Italy`;
  let p = `Create a NEW illustration of ${what}, as a standalone icon.
${photos === 1 ? 'The first image is a real photograph' : 'The first two images are real photographs'} of this place: use ${photos === 1 ? 'it' : 'them'} ONLY to get the architecture right (overall shape, proportions, arches, towers, windows, materials and colours of the stone and brick). Do not copy their framing, light or anything else, and do not reproduce any person, car or sign from them.
The ${ord[photos]} image is the STYLE reference: match its hand-painted warm cartoon look, soft painterly shading and soft dark outlines exactly.
Light: ALWAYS golden hour — low warm sun from one side, long soft warm shadows, honey and apricot highlights on the stone, gentle glow. This is very important.
Composition: the landmark alone, centred, seen in a slight 3/4 view from a little above (isometric-ish, like a collectible sticker), the whole building visible with a clean readable silhouette, simplified details, a small tidy patch of ground at its base is fine. It fills about 80% of the square frame.
Background: one flat solid colour ${BG} (pure magenta) everywhere around the landmark, with no gradient, no sky, no clouds, no scenery, no shadow on the background, so it can be cut out cleanly.
Never include: people or human figures of any kind, animals, the mascot, vehicles, text, letters, numbers, signs, logos, watermarks or frames.
Square 1:1 image.`;
  if (hasPrev) p += `\nThe ${ord[photos + 1]} image is the previous attempt. Keep what works in it.`;
  if (notes) p += `\nApply these corrections from the art director (written in Polish): ${notes}`;
  return p;
}

// ── trasa → przystanki do ikon ────────────────────────────────────────────────────────────────
// content z city_versions (stops + stop_translations + city_translations); pomijamy przystanki praktyczne
export function stopsOf(content) {
  const tr = (id, lang) => (content.stop_translations ?? []).find(t => t.stop_id === id && t.lang === lang);
  const cityT = (lang) => (content.city_translations ?? []).find(t => t.lang === lang)?.title;
  const city = cityT('it') ?? cityT('en') ?? cityT('pl') ?? content.city?.slug ?? '';
  return (content.stops ?? []).map((s, i) => ({ s, i })).filter(({ s }) => !PRACTICAL_CATS.has(s.category) && safeKey(s.stop_key)).map(({ s, i }) => {
    const pl = tr(s.id, 'pl'), it = tr(s.id, 'it'), en = tr(s.id, 'en');
    const txt = (t) => [].concat(t?.desc_paragraphs ?? []).join(' ');
    return { n: s.stop_number ?? i + 1, key: s.stop_key, category: s.category, city, lat: s.lat, lon: s.lon,
      name: pl?.name ?? it?.name ?? s.stop_key, name_it: it?.name ?? null, name_en: en?.name ?? null,
      wiki_article: s.wiki_article ?? null, wiki_lang: s.wiki_lang ?? null, texts: [txt(pl), txt(it)] };
  });
}

// ── Discord ───────────────────────────────────────────────────────────────────────────────────
export function caption(stop, trip, refs, { v = 1, notes = null, warn = null } = {}) {
  const src = (refs ?? []).map((r, i) => `${i + 1}) <${r.page}> — ${r.author.slice(0, 80)}, ${r.license}`).join('\n');
  return `🏛️ **${stop.n}. ${stop.name}** (${trip}) · wersja ${v}${notes ? ` (poprawki: ${notes.slice(0, 200)})` : ''}\nźródła:\n${src}` +
    `${warn ? `\n⚠️ ${warn}` : ''}\nOdpisz: **ok ${stop.n}**, **${stop.n} uwagi…** albo **${stop.n} inne zdjęcia**.`;
}
// odpowiedź JP: „ok 3”, „3 ok”, „ok spello 3”, „3: bez drzew”, „spello 3 jaśniej”, „3 inne zdjęcia”, „następne”, samo „ok”, same uwagi
export function parseReply(text, trips = []) {
  const t = String(text ?? '').trim().replace(/\s+/g, ' ');
  if (!t) return null;
  const T = (s) => (s == null ? null : trips.includes(s.toLowerCase()) ? s.toLowerCase() : undefined);
  let x;
  if ((x = t.match(/^(?:ok|akceptuj[eę]|zatwierdzam)\s*(?:([a-z][a-z0-9-]*)\s+)?#?(\d+)$/i)) || (x = t.match(/^(?:([a-z][a-z0-9-]*)\s+)?#?(\d+)\s*(?:ok|akceptuj[eę])$/i))) {
    const trip = T(x[1]); if (trip === undefined) return { type: 'unknown-trip', word: x[1] };
    return { type: 'ok', n: +x[2], trip };
  }
  if (/^(ok|akceptuj[eę]|zatwierdzam)[.!]?$/i.test(t)) return { type: 'ok-last' };
  if (/^(nast[eę]pn[ea]|dalej|generuj( dalej)?)$/i.test(t)) return { type: 'next' };
  if ((x = t.match(/^(?:([a-z][a-z0-9-]*)\s+)?(?:nr\.?\s*|#)?(\d+)\s*[:.,\-–)]?\s*(?:inne|nowe)\s+(?:zdj[eę]cia|referencje|fotki|źródła)$/i))) {
    const trip = T(x[1]); if (trip !== undefined) return { type: 'refs', n: +x[2], trip };
  }
  if ((x = t.match(/^(?:([a-z][a-z0-9-]*)\s+)?(?:nr\.?\s*|#)?(\d+)\s*[:.,\-–)]?\s+(\S[\s\S]{2,})$/i)) || (x = t.match(/^(?:([a-z][a-z0-9-]*)\s+)?(?:nr\.?\s*|#)?(\d+)[:.,\-–)](\S[\s\S]{2,})$/i))) {
    const trip = T(x[1]); if (trip !== undefined) return { type: 'fix', n: +x[2], trip, notes: x[3].trim() };
  }
  if (/^(inne|nowe)\s+(zdj[eę]cia|referencje|fotki)$/i.test(t)) return { type: 'refs-last' };
  return t.length >= 3 ? { type: 'fix-last', notes: t } : null;
}
// które (trip, n) ma na myśli JP: podana trasa → ona; inaczej trasa, w której N czeka na ocenę (jedna), inaczej ostatnio wrzucona
export function resolveTarget({ n, trip }, states, lastPosted) {
  if (trip) return { trip, n };
  const waiting = Object.entries(states).filter(([, st]) => Object.values(st.stops ?? {}).some(s => s.n === n && ['review', 'fix-pending'].includes(s.status))).map(([k]) => k);
  if (waiting.length === 1) return { trip: waiting[0], n };
  return lastPosted ? { trip: lastPosted.trip, n } : null;
}
export function lastPostedOf(states) {
  let best = null;
  for (const [trip, st] of Object.entries(states)) for (const [key, s] of Object.entries(st.stops ?? {})) {
    if (s.status !== 'review' || !s.posted_at) continue;
    if (!best || s.posted_at > best.at) best = { trip, key, n: s.n, at: s.posted_at };
  }
  return best;
}

// ── rejestr źródeł (media/icons/place-sources.json) ───────────────────────────────────────────
export function sourcesEntry({ trip, stop, refs, v, version, at }) {
  return { trip, stop_key: stop.key, n: stop.n, name: stop.name, trip_version: version ?? null, icon_version: v, accepted_at: at,
    icons: Object.fromEntries(SIZES.map(s => [s, iconPath(trip, stop.key, s)])),
    rights: '© Quolino (quolino.com). Ilustracja nowa; zdjęcia poniżej służyły wyłącznie jako informacja wizualna o wyglądzie obiektu.',
    references: (refs ?? []).map(r => ({ title: r.title, url: r.page, file_url: r.url, author: r.author, license: r.license, license_url: r.license_url })) };
}
export function mergeSources(json, entry) {
  const all = { ...(json ?? {}) };
  all[sourcesKey(entry.trip, entry.stop_key)] = entry;
  return Object.fromEntries(Object.keys(all).sort().map(k => [k, all[k]]));
}
