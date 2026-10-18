#!/usr/bin/env node
// Baner miasta (hero z Quo) — paczka do Google Flow (decyzja JP 2026-10-18).
// JP pisze w wątku miasta „baner”. Hermes wrzuca do wątku:
//   1) herb miasta (Wikidata P94) — w Flow służy tylko do koloru chusty Quo,
//   2) 5 zdjęć zabytków z trasy do wyboru na tło (Wikipedia/Wikimedia Commons — tylko referencja dla Flow, nie publikujemy),
//   3) gotowy prompt (też jako plik .txt).
// JP generuje w Flow (obraz 1 = referencja Quo, 2 = herb, 3 = wybrane zdjęcie), wrzuca wynik i pisze „hero” → media.mjs.
//
//   node banner-brief.mjs <slug> [--notify <id wątku>]     paczka: herb + zdjęcia 1–5 + prompt
//   node banner-brief.mjs <slug> --more [--notify <id>]    kolejne 5 zdjęć (bez ponownego herbu i promptu)
//   node banner-brief.mjs <slug> --dry                     bez Discorda: wypisz wynik, pliki w work/banner/<slug>/
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { db, env, log, run } from './lib.mjs';
import { notify } from './draft-lib.mjs';

const [SLUG, ...argv] = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : undefined; };
const NOTIFY = opt('--notify');
const MORE = argv.includes('--more');
const DRY = argv.includes('--dry');
const PER = 5;
const WORK = '/opt/data/quolino/work/banner';
const TOKEN = env('DISCORD_BOT_TOKEN');
const UA = 'QuolinoBot/1.0 (https://quolino.com; banner references for internal use)';

const say = async (text) => { console.log(text); if (NOTIFY && !DRY) await notify(NOTIFY, text); };
const die = async (text) => { await say('⚠️ ' + text); process.exit(1); };

// ── kraje: język Wikipedii, nazwa EN, kolory flagi (fallback chusty, docs/QUOLINO.md §5) ──────────
const COUNTRY = {
  it: { wiki: 'it', en: 'Italy', flag: 'green, white and red (the Italian flag)' },
  pl: { wiki: 'pl', en: 'Poland', flag: 'white and red (the Polish flag)' },
  cz: { wiki: 'cs', en: 'Czechia', flag: 'white, red and blue (the Czech flag)' },
  fr: { wiki: 'fr', en: 'France', flag: 'blue, white and red (the French flag)' },
  gr: { wiki: 'el', en: 'Greece', flag: 'blue and white (the Greek flag)' },
  hr: { wiki: 'hr', en: 'Croatia', flag: 'red and white (the Croatian flag)' },
  de: { wiki: 'de', en: 'Germany', flag: 'black, red and gold (the German flag)' },
  es: { wiki: 'es', en: 'Spain', flag: 'red and yellow (the Spanish flag)' },
};
// przystanki, które nie nadają się na tło banera
const NOT_BACKGROUND = new Set(['parking', 'restaurant', 'icecream', 'sweets']);
const BAD_FILE = /(stemma|coat[_ ]of[_ ]arms|herb|wappen|blason|escudo|flag|bandiera|map|mappa|locator|location|logo|plan|schema|diagram|\.svg$|\.gif$)/i;

// ── sieć ─────────────────────────────────────────────────────────────────────────────────
async function getJson(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(25_000) });
      if (r.status === 429 || r.status >= 500) { await new Promise(s => setTimeout(s, 1500 * (i + 1))); continue; }
      if (!r.ok) { log('HTTP', r.status, url.slice(0, 160)); return null; }
      return await r.json();
    } catch (e) { log('sieć:', e.message, url.slice(0, 120)); await new Promise(s => setTimeout(s, 1000)); }
  }
  return null;
}
async function download(url, path) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) });
    if (!r.ok) { log('pobieranie', r.status, url.slice(0, 160)); return false; }
    writeFileSync(path, Buffer.from(await r.arrayBuffer()));
    return true;
  } catch (e) { log('pobieranie:', e.message); return false; }
}
const qs = (o) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const wikiApi = (lang, params) => getJson(`https://${lang}.wikipedia.org/w/api.php?${qs({ format: 'json', formatversion: 2, ...params })}`);
const commonsApi = (params) => getJson(`https://commons.wikimedia.org/w/api.php?${qs({ format: 'json', formatversion: 2, ...params })}`);

// ── porównywanie nazw ────────────────────────────────────────────────────────────────────
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const STOP_WORDS = new Set(['di', 'del', 'della', 'dei', 'delle', 'il', 'la', 'le', 'lo', 'san', 'santa', 'the', 'of', 'w', 'na', 'i', 'e', 'de', 'des', 'du', 'and']);
const tokens = (s) => norm(s).split(' ').filter(t => t.length > 2 && !STOP_WORDS.has(t));
function similarity(title, names) {
  const t = new Set(tokens(title));
  let best = 0;
  for (const n of names.filter(Boolean)) {
    const k = tokens(n); if (!k.length || !t.size) continue;
    const hit = k.filter(x => t.has(x) || [...t].some(y => y.length > 4 && (y.startsWith(x.slice(0, 5)) || x.startsWith(y.slice(0, 5))))).length;
    best = Math.max(best, hit / Math.max(k.length, 1));
  }
  return best;
}

// ── herb: Wikipedia (język kraju) → Wikidata P94 → Commons ───────────────────────────────
async function coatOfArms(city, wl) {
  const titles = [city.it, city.local, city.en, city.pl].filter(Boolean);
  let qid = null, article = null;
  for (const t of titles) {
    const r = await wikiApi(wl, { action: 'query', titles: t, redirects: 1, prop: 'pageprops|coordinates', ppprop: 'wikibase_item' });
    const p = r?.query?.pages?.find(x => !x.missing && x.pageprops?.wikibase_item);
    if (p) { qid = p.pageprops.wikibase_item; article = p.title; break; }
  }
  if (!qid && city.lat) {   // zapas: artykuł najbliżej środka miasta, którego tytuł pasuje do nazwy
    const r = await wikiApi(wl, { action: 'query', generator: 'geosearch', ggscoord: `${city.lat}|${city.lon}`, ggsradius: 10000, ggslimit: 30, prop: 'pageprops', ppprop: 'wikibase_item' });
    const p = (r?.query?.pages ?? []).filter(x => x.pageprops?.wikibase_item)
      .sort((a, b) => similarity(b.title, titles) - similarity(a.title, titles))[0];
    if (p && similarity(p.title, titles) >= 0.99) { qid = p.pageprops.wikibase_item; article = p.title; }
  }
  if (!qid) return { article: null };
  const wd = await getJson(`https://www.wikidata.org/w/api.php?${qs({ action: 'wbgetentities', ids: qid, props: 'claims', format: 'json' })}`);
  const file = wd?.entities?.[qid]?.claims?.P94?.[0]?.mainsnak?.datavalue?.value;
  if (!file) return { article, qid };
  const ii = await commonsApi({ action: 'query', titles: 'File:' + file, prop: 'imageinfo', iiprop: 'url', iiurlwidth: 700 });
  const info = ii?.query?.pages?.[0]?.imageinfo?.[0];
  return { article, qid, file, url: info?.thumburl || info?.url, page: info?.descriptionurl };
}

// ── zdjęcia tła: artykuły Wikipedii przy przystankach (nazwa + odległość) → zapas: Commons ─────
async function photoCandidates(city, stops, wl) {
  const out = [], seen = new Set();
  const push = (c) => {
    if (!c?.url || seen.has(c.file) || BAD_FILE.test(c.file)) return false;
    seen.add(c.file); out.push(c); return true;
  };
  const extra = [];   // drugie trafienia — na „więcej”
  for (const s of stops) {
    if (!s.lat || !s.lon) continue;
    const names = [s.it, s.local, s.en, s.pl];
    const r = await wikiApi(wl, { action: 'query', generator: 'geosearch', ggscoord: `${s.lat}|${s.lon}`, ggsradius: 400, ggslimit: 15,
      prop: 'pageimages|coordinates', piprop: 'thumbnail|name|original', pithumbsize: 1600, pilicense: 'any' });
    const pages = (r?.query?.pages ?? []).filter(p => p.pageimage && p.thumbnail && (p.original?.width ?? 0) >= 900)
      .map(p => {
        const sim = similarity(p.title, names);
        const landscape = (p.original.width >= p.original.height) ? 0.15 : 0;
        return { p, score: sim + landscape };
      })
      .sort((a, b) => b.score - a.score);
    const mk = (p) => ({ file: p.pageimage, url: p.thumbnail.source, w: p.original.width, h: p.original.height,
      label: `${s.pl ?? s.it ?? s.stop_key} (przystanek ${String(s.stop_number).padStart(2, '0')})`, source: `${wl}.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}` });
    const good = pages.filter(x => x.score >= 0.5);
    if (good[0]) push(mk(good[0].p)); else if (pages[0]) extra.push(mk(pages[0].p));
    for (const x of good.slice(1, 3)) extra.push(mk(x.p));
    // Commons: zdjęcia z nazwą zabytku (dodatkowe ujęcia tego samego miejsca)
    const q = [s.it || s.local || s.en || s.pl, city.it || city.local || city.pl].filter(Boolean).join(' ');
    const cm = await commonsApi({ action: 'query', generator: 'search', gsrnamespace: 6, gsrlimit: 8, gsrsearch: `${q} filetype:bitmap`,
      prop: 'imageinfo', iiprop: 'url|size|mime', iiurlwidth: 1600 });
    for (const p of (cm?.query?.pages ?? []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0))) {
      const i = p.imageinfo?.[0];
      if (!i || i.mime !== 'image/jpeg' || i.width < 1400 || i.width < i.height) continue;
      extra.push({ file: p.title.replace(/^File:/, ''), url: i.thumburl, w: i.width, h: i.height,
        label: `${s.pl ?? s.it ?? s.stop_key} (przystanek ${String(s.stop_number).padStart(2, '0')}, Commons)`, source: i.descriptionurl });
    }
  }
  // zdjęcie z artykułu o mieście (zwykle panorama albo najważniejszy zabytek)
  if (city.article) {
    const r = await wikiApi(wl, { action: 'query', titles: city.article, prop: 'pageimages', piprop: 'thumbnail|name|original', pithumbsize: 1600, pilicense: 'any' });
    const p = r?.query?.pages?.[0];
    if (p?.thumbnail && p.pageimage) extra.unshift({ file: p.pageimage, url: p.thumbnail.source, w: p.original?.width, h: p.original?.height,
      label: `${city.pl} — zdjęcie z artykułu o mieście`, source: `${wl}.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}` });
  }
  for (const c of extra) push(c);
  return out;
}

// ── kolory herbu (Python + Pillow, jak media.mjs) ─────────────────────────────────────────
const COLORS_PY = String.raw`
import sys, json
from PIL import Image
NAMES = [("red",(200,30,40)),("dark red",(130,20,30)),("white",(245,245,245)),("silver grey",(170,170,175)),
  ("gold yellow",(235,190,40)),("blue",(30,70,170)),("light blue",(110,170,225)),("green",(30,130,60)),
  ("black",(25,25,25)),("purple",(110,40,120)),("orange",(230,120,30)),("brown",(120,75,40))]
def name(c): return min(NAMES, key=lambda n: sum((a-b)**2 for a,b in zip(c,n[1])))[0]
im = Image.open(sys.argv[1]).convert("RGBA"); im.thumbnail((300,300))
px = [p[:3] for p in im.getdata() if p[3] > 200]
if not px: print(json.dumps([])); sys.exit()
q = Image.new("RGB", (len(px), 1)); q.putdata(px)
pal = q.quantize(colors=8, method=Image.Quantize.MEDIANCUT)
counts = sorted(pal.getcolors(), reverse=True); p = pal.getpalette()
tot = sum(c for c,_ in counts); res = {}
for c,i in counts:
    n = name(tuple(p[i*3:i*3+3]))
    res[n] = res.get(n, 0) + c/tot
out = [{"name":k,"share":round(v,3)} for k,v in sorted(res.items(), key=lambda x:-x[1]) if v >= 0.07 and k != "black"]
print(json.dumps(out[:3]))
`;
const COLOR_PL = { red: 'czerwony', 'dark red': 'ciemnoczerwony', white: 'biały', 'silver grey': 'srebrny', 'gold yellow': 'złoty/żółty', blue: 'niebieski',
  'light blue': 'błękitny', green: 'zielony', black: 'czarny', purple: 'fioletowy', orange: 'pomarańczowy', brown: 'brązowy' };
const HEX_NAMES = [['red', [200, 30, 40]], ['dark red', [130, 20, 30]], ['white', [245, 245, 245]], ['gold yellow', [235, 190, 40]],
  ['blue', [30, 70, 170]], ['light blue', [110, 170, 225]], ['green', [30, 130, 60]], ['black', [25, 25, 25]], ['purple', [110, 40, 120]], ['orange', [230, 120, 30]]];
function hexName(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return null;
  const c = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  return HEX_NAMES.reduce((b, n) => { const d = n[1].reduce((s, v, i) => s + (v - c[i]) ** 2, 0); return d < b.d ? { n: n[0], d } : b; }, { d: 1e9 }).n;
}
async function coatColors(path, dir) {
  writeFileSync(join(dir, '_colors.py'), COLORS_PY);
  const r = await run('python3', [join(dir, '_colors.py'), path], { timeout: 60_000 });
  try { return JSON.parse(r.out.trim().split('\n').pop()); } catch { log('kolory herbu:', r.err.slice(-300)); return []; }
}

// ── prompt ───────────────────────────────────────────────────────────────────────────────
function bandanaLine(city, colors, hasCoat, cc) {
  const fromDb = hexName(city.bandana_color);
  const names = [...new Set([fromDb, ...colors.map(c => c.name)].filter(Boolean))].slice(0, 2);
  if (hasCoat && names.length)
    return `in the colors of the ${city.en || city.it || city.pl} coat of arms shown in IMAGE 2: mainly ${names[0]}${names[1] ? `, with ${names[1]}` : ''}`;
  if (fromDb) return `in ${fromDb}, the heraldic color of ${city.en || city.it || city.pl}`;
  return `in ${cc.flag}`;
}
function buildPrompt(city, cc, bandana, hasCoat) {
  const cityName = city.en || city.it || city.pl;
  const file = `QuoBanner-${city.country}-${city.slug}.jpg`;
  return `QuoBanner-${city.country}-${city.slug}

ATTACHED IMAGES:
IMAGE 1 = the Que character reference.
${hasCoat ? `IMAGE 2 = the coat of arms of ${cityName} — use it ONLY to choose the neckerchief colors.\nIMAGE 3` : 'IMAGE 2'} = a real photograph of the location in ${cityName}, ${cc.en}.

QUE CHARACTER CONSISTENCY IS CRITICAL.
Use IMAGE 1 as the ONLY visual reference for the Que character.
Preserve the character from IMAGE 1 exactly:
- the exact character design
- the exact face
- the exact eyes
- the exact body proportions
- the exact fur appearance
- the exact colors
- the exact tail
- the exact overall 3D appearance
Do not reinterpret, redesign or replace the character.
Do not transform the character into a different creature.
Do not invent a new mascot.
Ignore the background, pose, clothing colors and framing of IMAGE 1 — use it only for the character's identity.

LOCATION FIDELITY IS CRITICAL.
Use ${hasCoat ? 'IMAGE 3' : 'IMAGE 2'} as the ONLY reference for the architecture and the place.
Recreate the place from ${hasCoat ? 'IMAGE 3' : 'IMAGE 2'} faithfully: the same shapes, proportions, materials,
number of towers, arches, windows and columns, the same decorations.
Do not invent extra buildings, towers, columns or statues.
Keep any existing sculptures exactly as in the photograph — small, part of the architecture, in the background.
Remove people, cars, scaffolding, modern signs and street clutter from the scene.

CREATE:
A beautiful premium colorful 3D animated-film banner illustration for the Quolino family travel guide:
Que visiting ${cityName}, ${cc.en}.

SCENE:
The landmark from the photograph fills the background and is clearly recognizable at first glance.
Que stands on the ground in the foreground, in front of the landmark — on the pavement, square or floor,
never sitting or climbing on the monument.
Pose: waving at the viewer with one paw, or pointing at the landmark — happy, curious, welcoming.

CLOTHING:
Que wears exactly one small neckerchief tied around the neck, ${bandana}.
The neckerchief stays small and close to the neck.${hasCoat ? `
Do NOT draw the coat of arms anywhere in the image — not on the neckerchief, not as a sign, not as a flag.` : ''}
No cape, no cloak, no flag, no scarf flowing behind the body, no other clothing or accessories.

CHARACTER SIZE AND POSITION:
Full body visible — ears, paws, feet and the entire tail.
Que occupies approximately 40–50% of the image height.
Que stands inside the CENTRAL THIRD of the frame (the image will also be cropped to a centered square).
The landmark remains large and readable behind Que; Que must not hide its most recognizable part.
Not a close-up. Not a selfie. Not a tiny figure.

LIGHT AND MOOD:
Golden hour, warm low sunlight, soft long shadows, warm sky with a few soft clouds.
If the photograph shows an interior or a cave: keep the place's own natural light, add a warm accent light on Quo.
Premium European travel brand, family adventure, sophisticated but playful.

STYLE:
premium colorful 3D animated-film illustration, beautiful soft detailed fur,
polished stylized architecture with realistic stone textures, controlled depth of field
(landmark sharp), clean cinematic composition.

COMPOSITION:
Wide 16:9 landscape banner. Eye-level or slightly low camera.
Que in the central third, landmark behind, a calm area of sky or square around them.
Only Que in the scene.

DO NOT INCLUDE:
text, titles, captions, letters, words, signs with writing, plaques, labels, logos, watermarks,
poster layout, frame, border, badge, coat of arms,
other characters, people, additional animals or creatures, statues added to the scene,
cape, cloak, flag held by Que, extra props,
white background, studio background,
flat vector style, emoji, dark or gloomy atmosphere.

OUTPUT FILE NAME:
Save/export the final generated image using EXACTLY this filename:
${file}
Do not generate an automatic descriptive filename. Do not use timestamps.
The filename must be exactly:
${file}`;
}

// ── Discord ──────────────────────────────────────────────────────────────────────────────
async function upload(channel, text, files) {
  if (!channel || !TOKEN || DRY) return !DRY ? false : true;
  const fd = new FormData();
  fd.append('payload_json', JSON.stringify({ content: text.slice(0, 1990), allowed_mentions: { parse: [] } }));
  files.forEach((f, i) => fd.append(`files[${i}]`, new Blob([readFileSync(f.path)]), f.name));
  const r = await fetch(`https://discord.com/api/v10/channels/${channel}/messages`, { method: 'POST', headers: { Authorization: `Bot ${TOKEN}` }, body: fd })
    .catch(e => ({ ok: false, statusText: e.message }));
  if (!r.ok) log('Discord upload:', r.status, r.statusText, await r.text?.().catch(() => ''));
  return r.ok;
}
// prompt w blokach kodu ≤ 1900 znaków, cięty na pustych liniach (żeby wklejać po kolei bez sklejania zdań)
function chunks(text, max = 1800) {
  const parts = [], paras = text.split('\n\n');
  let cur = '';
  for (const p of paras) {
    if ((cur + '\n\n' + p).length > max && cur) { parts.push(cur); cur = p; } else cur = cur ? cur + '\n\n' + p : p;
  }
  if (cur) parts.push(cur);
  return parts;
}

// ── main ─────────────────────────────────────────────────────────────────────────────────
if (!SLUG || SLUG.startsWith('--')) await die('podaj miasto (slug), np. node banner-brief.mjs perugia --notify <id wątku>');
const dir = join(WORK, SLUG);
mkdirSync(dir, { recursive: true });
const stateFile = join(dir, 'state.json');

const c = await db();
const q = async (sql, p) => (await c.query(sql, p)).rows;
try {
  const tr = (lang) => `(SELECT title FROM public.city_translations WHERE city_slug = c.slug AND lang = '${lang}')`;
  const [city] = await q(`SELECT c.slug, coalesce(c.country, 'it') AS country, c.lat, c.lon, c.bandana_color,
      coalesce(${tr('pl')}, c.slug) AS pl, ${tr('en')} AS en, ${tr('it')} AS it FROM public.cities c WHERE c.slug = $1`, [SLUG]);
  if (!city) await die(`nie ma miasta „${SLUG}” w bazie`);
  const cc = COUNTRY[city.country] ?? { wiki: 'en', en: city.country.toUpperCase(), flag: 'the national flag colors' };
  const wl = cc.wiki;
  const st = (lang) => `(SELECT name FROM public.stop_translations WHERE stop_id = s.id AND lang = '${lang}')`;
  const stops = (await q(`SELECT s.stop_number, s.stop_key, s.category, s.lat, s.lon,
      ${st('pl')} AS pl, ${st('en')} AS en, ${st('it')} AS it, ${st(wl)} AS local
    FROM public.stops s WHERE s.city_slug = $1 ORDER BY s.sort_order, s.stop_number`, [SLUG]))
    .filter(s => !NOT_BACKGROUND.has(s.category));
  city.local = null;

  let state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : null;
  if (!MORE || !state) {
    // herb
    const coa = await coatOfArms(city, wl);
    city.article = coa.article;
    let coatPath = null, colors = [];
    if (coa.url) {
      coatPath = join(dir, `herb-${SLUG}.png`);
      if (await download(coa.url, coatPath)) colors = await coatColors(coatPath, dir); else coatPath = null;
    }
    // zdjęcia
    const cands = await photoCandidates(city, stops, wl);
    const bandana = bandanaLine(city, colors, !!coatPath, cc);
    const prompt = buildPrompt(city, cc, bandana, !!coatPath);
    writeFileSync(join(dir, `prompt-baner-${SLUG}.txt`), prompt);
    const plNames = [...new Set([hexName(city.bandana_color), ...colors.map(x => x.name)].filter(Boolean))].slice(0, 2).map(n => COLOR_PL[n] ?? n);
    state = { slug: SLUG, at: new Date().toISOString(), coa, coatPath, colors, bandana, bandanaPl: plNames.join(' + '), cands, shown: 0 };
  }

  const batch = state.cands.slice(state.shown, state.shown + PER);
  const files = [];
  for (const [i, ph] of batch.entries()) {
    const n = state.shown + i + 1;
    const p = join(dir, `tlo-${n}.jpg`);
    if (existsSync(p) || await download(ph.url, p)) files.push({ path: p, name: `tlo-${n}-${SLUG}.jpg`, n, ph });
  }
  state.shown += batch.length;
  writeFileSync(stateFile, JSON.stringify(state, null, 2));

  const list = files.map(f => `**${f.n}** — ${f.ph.label} · <https://${f.ph.source.replace(/^https?:\/\//, '')}>`).join('\n');
  const left = state.cands.length - state.shown;

  if (MORE) {
    if (!files.length) await die(`nie mam więcej zdjęć dla ${city.pl} (pokazane: ${state.shown}). Wrzuć własne zdjęcie — prompt działa z dowolnym.`);
    const text = `🖼️ **${city.pl} — kolejne zdjęcia na tło**\n${list}\n${left > 0 ? `Jeszcze ${left} — napisz „baner więcej”.` : 'To wszystkie, które znalazłem.'}`;
    if (!(await upload(NOTIFY, text, files.map(({ path, name }) => ({ path, name })))) && !DRY) await notify(NOTIFY, text + '\n(nie udało się dołączyć zdjęć)');
    console.log(text);
    process.exit(0);
  }

  const attach = [];
  if (state.coatPath) attach.push({ path: state.coatPath, name: `herb-${SLUG}.png` });
  attach.push(...files.map(({ path, name }) => ({ path, name })));
  attach.push({ path: join(dir, `prompt-baner-${SLUG}.txt`), name: `prompt-baner-${SLUG}.txt` });
  const head = `🎨 **${city.pl} — baner do Google Flow**\n` +
    (state.coatPath ? `Herb: \`herb-${SLUG}.png\` → chusta: ${state.bandanaPl || 'kolory herbu'}\n`
                    : `⚠️ Nie znalazłem herbu w Wikidanych — chusta: ${state.bandanaPl || 'kolory flagi kraju'}. Możesz wrzucić herb sam jako obraz 2 (wtedy popraw w prompcie numery obrazów).\n`) +
    `Tło do wyboru:\n${list || '— brak zdjęć z trasy w Wikipedii; wrzuć własne.'}\n` +
    `**W Flow:** obraz 1 = referencja Quo · ${state.coatPath ? 'obraz 2 = herb · obraz 3 = wybrane tło' : 'obraz 2 = wybrane tło'} + prompt poniżej (cały jest też w pliku .txt).\n` +
    `Gotową grafikę wrzuć tutaj i napisz „hero”.${left > 0 ? ` Inne zdjęcia: „baner więcej” (jeszcze ${left}).` : ''}`;
  console.log(head);
  const ok = await upload(NOTIFY, head, attach);
  if (!ok && !DRY) await notify(NOTIFY, head + '\n(nie udało się dołączyć plików)');
  const prompt = readFileSync(join(dir, `prompt-baner-${SLUG}.txt`), 'utf8');
  const parts = chunks(prompt);
  for (const [i, p] of parts.entries()) {
    const msg = `${parts.length > 1 ? `Prompt ${i + 1}/${parts.length}:\n` : ''}\`\`\`\n${p}\n\`\`\``;
    if (DRY) console.log(msg); else if (NOTIFY) await notify(NOTIFY, msg);
  }
} finally { await c.end().catch(() => {}); }
