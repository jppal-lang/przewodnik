#!/usr/bin/env node
// Ikony miejsc (JP 2026-10-27): jedna ilustracja na przystanek zwiedzania — naklejki w albumie, karty przystanków, gra.
// Źródło prawdy: 2 prawdziwe zdjęcia z Wikimedia Commons (NIGDY z ludźmi) → NOWA ilustracja w stylu ilustracji hero Quolino,
// zawsze złota godzina, sam obiekt na przezroczystym tle, metadane „© Quolino (quolino.com)”. Zasady: docs/IKONY-MIEJSC.md.
//   node place-icons.mjs refs <trasa> [--stop key] [--force] [--again] [--dry]   zdjęcia referencyjne (Wikidata + Commons, wybór: Claude)
//   node place-icons.mjs gen <trasa> [--only k1,k2] [--next] [--force] [--no-wait] generowanie (Antigravity) → #ikony-miejsc: 2 zdjęcia + ikona
// Wybór zdjęć przez JP w panelu admina (ops.icon_refs, kandydaci z place-candidates.mjs) ma pierwszeństwo przed automatem — także przy --force.
// JP może też wkleić własny link https (dowolna strona lub plik; place-icons-fetch.mjs). Nieudane pobranie → komunikat na Discordzie,
// przystanek czeka na nowy wybór JP (bez automatu po cichu) — docs/IKONY-MIEJSC.md §7.
// Przystanek z kandydatami bez wyboru JP i bez „automatu” czeka do 48 h od wygenerowania kandydatów (--no-wait: automat od razu).
//   node place-icons.mjs fix <trasa> <N> "uwagi"                                    poprawka z uwagami JP (przy wyczerpanym limicie: czeka w kolejce)
//   node place-icons.mjs ok <trasa> <N>                                             publikacja WebP 64/128/256/512 + media/icons/place-sources.json
//   node place-icons.mjs status [trasa]
//   node place-icons.mjs watch                                                      cron co 2 min: odpowiedzi JP w #ikony-miejsc
//   node place-icons.mjs queue [--max 3]                                            cron co 30 min: refs + gen dla tras z place-icons-data.mjs
// N = numer przystanku w trasie (stop_number, jak na stronie). Przystanki praktyczne (parking, restauracja, lody, słodycze) bez ikon.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync, unlinkSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { env, log, run, aiUsage, claude, extractJson, db, agyQuotaOut, agyQuotaHit, agyWeekCalls } from './lib.mjs';
import { ensureChannel, notify } from './draft-lib.mjs';
import { fileInfos, download, gatherCandidates } from './place-icons-commons.mjs';
import CFG from './place-icons-data.mjs';
import * as L from './place-icons-lib.mjs';
import { fetchImage, LinkError } from './place-icons-fetch.mjs';

const DIR = new URL('.', import.meta.url).pathname;
const REPO = '/opt/data/repo/przewodnik', REPO_SH = '/opt/data/quolino/repo.sh', WORK = '/opt/data/quolino/work/place-icons';
const STYLE = join(REPO, L.STYLE_REF);
const SOURCES = join(REPO, 'media/icons/place-sources.json');
const TOKEN = env('DISCORD_BOT_TOKEN');
const CHAN = ['ikony-miejsc', 'Grafiki'];
const argv = process.argv.slice(2);
const [cmd = 'status', a1, a2, a3] = argv;
const opt = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : null; };
const flag = (n) => argv.includes(n);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
globalThis.__aiRole = () => 'ikony miejsc';
mkdirSync(WORK, { recursive: true });

// ── stan: work/place-icons/<trasa>/state.json; zapis zawsze „przeczytaj–zmień–zapisz” (ok/fix/gen działają w osobnych procesach) ──
const stF = (trip) => join(WORK, trip, 'state.json');
const loadState = (trip) => readJson(stF(trip)) ?? { trip, stops: {} };
function patchState(trip, fn) { const st = loadState(trip); fn(st); mkdirSync(join(WORK, trip), { recursive: true }); writeFileSync(stF(trip), JSON.stringify(st, null, 2)); return st; }
const patchStop = (trip, key, fn) => patchState(trip, st => { fn(st.stops[key] ??= { history: [] }); });
function allStates() {
  const out = {};
  for (const d of readdirSync(WORK, { withFileTypes: true })) if (d.isDirectory() && existsSync(stF(d.name))) out[d.name] = loadState(d.name);
  return out;
}
const stopMeta = (trip, key) => readJson(join(L.stopDir(WORK, trip, key), 'stop.json'));
function keyOf(trip, n) {
  const e = Object.entries(loadState(trip).stops).find(([, s]) => s.n === +n);
  if (!e) throw new Error(`${trip}: nie ma przystanku nr ${n} z ikoną (status: node place-icons.mjs status ${trip})`);
  return e[0];
}

// ── trasa z bazy: najnowsza OPUBLIKOWANA wersja (requireV2: tylko nowy proces, content.workflow = 'v2') ──
async function ensureTrip(trip, { requireV2 = false } = {}) {
  if (!/^[a-z0-9-]+$/.test(trip ?? '')) throw new Error('podaj trasę (slug), np. spello');
  const c = await db();
  let v;
  try {
    ({ rows: [v] } = await c.query(`SELECT version, content FROM public.city_versions WHERE city_slug = $1 AND status = 'published'
      ${requireV2 ? `AND content->>'workflow' = 'v2'` : ''} ORDER BY version DESC LIMIT 1`, [trip]));
  } finally { await c.end(); }
  if (!v) return null;
  if (!requireV2 && v.content?.workflow !== 'v2') log(`${trip}: opublikowana v${v.version} jest ze starego procesu (bez workflow v2) — robię, bo trasa podana ręcznie`);
  const stops = L.stopsOf(v.content);
  patchState(trip, st => {
    st.version = v.version; st.workflow = v.content?.workflow ?? null; st.synced_at = new Date().toISOString();
    for (const s of stops) {
      mkdirSync(L.stopDir(WORK, trip, s.key), { recursive: true });
      writeFileSync(join(L.stopDir(WORK, trip, s.key), 'stop.json'), JSON.stringify(s, null, 1));
      const x = st.stops[s.key] ??= { history: [] };
      Object.assign(x, { n: s.n, name: s.name, category: s.category });
      x.status ??= 'new';
    }
  });
  return stops;
}

// ── Wikimedia Commons: place-icons-commons.mjs (wspólne z place-candidates.mjs) ──────────────

// ── Python: JPEG referencji, PNG, wycięcie tła + metadane, WebP ───────────────────────────────
const PY = `
import sys, json
from PIL import Image, ImageDraw, ImageFilter, PngImagePlugin
job = json.loads(sys.argv[1])
TITLE = job.get('title') or 'Quolino'
RIGHTS = '© Quolino (quolino.com). All rights reserved.'
DESC = job.get('desc') or ('Ilustracja miejsca: ' + TITLE + '. AI + redakcja Quolino.')
def exif():
    ex = Image.Exif()
    ex[0x013B] = 'Quolino (quolino.com)'
    ex[0x8298] = '(C) Quolino, quolino.com. All rights reserved.'
    ex[0x010E] = ('Quolino: ' + TITLE)[:300]
    ex[0x0131] = 'Quolino media pipeline'
    return ex.tobytes()
def xmp():
    e = lambda s: str(s).replace('&','&amp;').replace('<','&lt;').replace('>','&gt;').replace('"','&quot;')
    return ('<?xpacket begin="\\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
      '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" '
      'xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/">'
      '<dc:title><rdf:Alt><rdf:li xml:lang="x-default">' + e('Quolino: ' + TITLE) + '</rdf:li></rdf:Alt></dc:title>'
      '<dc:description><rdf:Alt><rdf:li xml:lang="x-default">' + e(DESC) + '</rdf:li></rdf:Alt></dc:description>'
      '<dc:creator><rdf:Seq><rdf:li>Quolino</rdf:li></rdf:Seq></dc:creator>'
      '<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">' + RIGHTS + '</rdf:li></rdf:Alt></dc:rights>'
      '<photoshop:Credit>Quolino (quolino.com)</photoshop:Credit><xmpRights:Marked>True</xmpRights:Marked>'
      '<xmpRights:WebStatement>https://quolino.com</xmpRights:WebStatement>'
      '<Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType>'
      '</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>').encode('utf-8')
def border_color(rgb):
    w, h = rgb.size; px = rgb.load(); pts = []
    for x in range(0, w, 8): pts += [px[x, 0], px[x, h - 1]]
    for y in range(0, h, 8): pts += [px[0, y], px[w - 1, y]]
    return tuple(sorted(p[i] for p in pts)[len(pts) // 2] for i in range(3))
def cut(src, dst):
    im = Image.open(src).convert('RGBA')
    w, h = im.size
    info = {}
    if im.getchannel('A').getextrema()[0] < 250:   # już ma przezroczystość
        out = im; info['bg'] = 'alpha'
    else:
        rgb = im.convert('RGB'); bg = border_color(rgb); info['bg'] = '#%02X%02X%02X' % bg
        t2 = int(job.get('tol', 70)) ** 2
        mask = Image.new('L', (w, h), 0); mp = mask.load(); px = rgb.load()
        for y in range(h):
            for x in range(w):
                r, g, b = px[x, y]
                if (r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2 <= t2: mp[x, y] = 255
        for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)] + [(x, 0) for x in range(0, w, 16)] + [(x, h - 1) for x in range(0, w, 16)] + [(0, y) for y in range(0, h, 16)] + [(w - 1, y) for y in range(0, h, 16)]:
            if mp[x, y] == 255: ImageDraw.floodfill(mask, (x, y), 128)
        bgm = Image.eval(mask, lambda v: 255 if v == 128 else 0)
        alpha = Image.eval(bgm, lambda v: 255 - v).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
        out = im.copy(); out.putalpha(alpha)
        mag = bg[1] < min(bg[0], bg[2]) - 60; grn = bg[1] > max(bg[0], bg[2]) + 60
        if mag or grn:   # przebarwienie krawędzi od tła (magenta / zieleń)
            inner = alpha.filter(ImageFilter.MinFilter(9)); op = out.load(); ip = inner.load(); ap = alpha.load()
            for y in range(h):
                for x in range(w):
                    if ap[x, y] and ip[x, y] < 255:
                        r, g, b, a = op[x, y]
                        if mag:
                            s = min(r, b) - g
                            if s > 0: r -= s; b -= s
                        else: g = min(g, max(r, b))
                        op[x, y] = (r, g, b, a)
    hist = out.getchannel('A').histogram(); info['transparent'] = round(sum(hist[:13]) / float(w * h), 3)
    box = out.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox() or (0, 0, w, h)
    c = out.crop(box); side = int(max(c.size) * 1.08)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0)); sq.paste(c, ((side - c.size[0]) // 2, (side - c.size[1]) // 2))
    sq = sq.resize((1024, 1024), Image.LANCZOS)
    pi = PngImagePlugin.PngInfo()
    for k, v in (('Title', 'Quolino: ' + TITLE), ('Author', 'Quolino (quolino.com)'), ('Copyright', RIGHTS), ('Source', 'https://quolino.com'), ('Description', DESC)):
        pi.add_text(k, v)
    sq.save(dst, 'PNG', pnginfo=pi, exif=exif())
    print(json.dumps(info))
def webp(src, base, sizes):
    im = Image.open(src).convert('RGBA')
    for s in sizes:
        im.resize((s, s), Image.LANCZOS).save(f'{base}-{s}.webp', 'WEBP', quality=90, method=6, exif=exif(), xmp=xmp())
def jpeg(src, dst):
    im = Image.open(src)
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGBA'); bgi = Image.new('RGB', im.size, (255, 255, 255)); bgi.paste(im, mask=im.getchannel('A')); im = bgi
    im = im.convert('RGB'); im.thumbnail((1280, 1280), Image.LANCZOS); im.save(dst, 'JPEG', quality=90)
m = job['mode']
if m == 'cut': cut(job['src'], job['dst'])
elif m == 'webp': webp(job['src'], job['base'], job.get('sizes') or [64, 128, 256, 512])
elif m == 'jpeg': jpeg(job['src'], job['dst'])
elif m == 'png': Image.open(job['src']).convert('RGBA').save(job['dst'], 'PNG')
`;
const py = (job) => run('python3', ['-c', PY, JSON.stringify(job)], { timeout: 300_000 });

// ── 1. zdjęcia referencyjne ───────────────────────────────────────────────────────────────────
async function findRefs(trip, stop, { again = false, dry = false, jpFiles = null } = {}) {
  const dir = L.stopDir(WORK, trip, stop.key), refsF = join(dir, 'refs.json');
  mkdirSync(dir, { recursive: true });
  const ov = CFG.stops?.[L.sourcesKey(trip, stop.key)] ?? {};
  const prev = readJson(refsF);
  const done = (rec) => { if (!dry) { writeFileSync(refsF, JSON.stringify({ trip, stop_key: stop.key, n: stop.n, name: stop.name, at: new Date().toISOString(), ...rec }, null, 1)); patchStop(trip, stop.key, s => { s.refs = rec.status; if (rec.status !== 'ok' && !s.v) s.status = rec.status; }); } return rec; };
  if (jpFiles?.length) return jpRefs(trip, stop, jpFiles, { dir, done, view: L.viewMode({ category: stop.category, texts: stop.texts, override: ov.view }) });
  if (ov.skip) return done({ status: 'skip' });
  const rejected = [...new Set([...(prev?.rejected ?? []), ...(again ? (prev?.picked ?? []).map(p => p.title) : [])])];
  let cands = [], qid = null, cat = ov.commonsCategory ?? null, view = L.viewMode({ category: stop.category, texts: stop.texts, override: ov.view });
  let names = [stop.name, stop.name_it, stop.name_en, stop.city].filter(Boolean);
  const manual = Array.isArray(ov.files) && ov.files.length === 2;
  if (manual) cands = await fileInfos(ov.files, 'manual');
  else ({ cands, qid, cat, view, names } = await gatherCandidates(stop, ov));
  const { kept, dropped } = manual ? { kept: cands.map(c => ({ ...c, score: 10 })), dropped: [] } : L.rankCandidates(cands, { names, view, exclude: rejected });
  for (const c of kept.filter(c => !L.licenseOk(c.license))) dropped.push({ title: c.title, reason: `licencja „${c.license}”` });
  const top = kept.filter(c => L.licenseOk(c.license)).slice(0, CFG.candidates ?? 12);
  log(`${trip}/${stop.key}: Wikidata ${qid ?? '—'}, kategoria ${cat ?? '—'}, widok ${view}; kandydatów ${cands.length}, odrzuconych ${dropped.length}, do wyboru ${top.length}`);
  const base = { qid, commons_category: cat, view, rejected, dropped: dropped.slice(0, 60), candidates: top.map(c => ({ title: c.title, score: c.score, source: c.source })) };
  if (dry) { for (const c of top) console.log(`  ${String(c.score).padStart(5)} ${c.source.padEnd(6)} ${c.width}×${c.height} ${c.title}`); for (const d of dropped.slice(0, 40)) console.log(`   ✗ ${d.reason}: ${d.title}`); return base; }
  if (top.length < 2) return done({ status: 'none', ...base, reasons: `za mało zdjęć bez ludzi (${top.length})` });

  // miniatury 960 px do obejrzenia przez Claude
  const cdir = join(dir, 'cand');
  rmSync(cdir, { recursive: true, force: true }); mkdirSync(cdir, { recursive: true });
  const files = [];
  for (const [i, c] of top.entries()) {
    const ext = (c.thumb.match(/\.(jpe?g|png|webp)$/i)?.[1] ?? 'jpg').toLowerCase();
    try { files.push({ ...c, path: await download(c.thumb, join(cdir, `c${String(i + 1).padStart(2, '0')}.${ext}`)) }); } catch (e) { log(`  ${c.title}: ${e.message}`); }
    await sleep(400);
  }
  if (files.length < 2) return done({ status: 'none', ...base, reasons: 'nie udało się pobrać miniatur' });
  let pick, reasons = 'wybór ręczny (place-icons-data.mjs)';
  if (manual) pick = [0, 1];
  else {
    let lastErr = '';
    for (let i = 0; i < 2 && !pick; i++) {
      const raw = await claude(null, L.pickPrompt(stop, files, view) + (lastErr ? `\n\nPoprzednia odpowiedź była błędna: ${lastErr}. Popraw.` : ''), { read: cdir });
      let j = null; try { j = extractJson(raw); } catch { lastErr = 'odpowiedź nie była JSON-em'; continue; }
      const v = L.validatePick(j, files.length);
      if (v.ok) { pick = v.pick; reasons = v.reasons; }
      else if (v.noRead) throw new Error(v.error);
      else if (v.none) return done({ status: 'none', ...base, reasons: v.error, with_people: (j.with_people ?? []).map(n => files[n - 1]?.title).filter(Boolean) });
      else lastErr = v.error;
    }
    if (!pick) return done({ status: 'none', ...base, reasons: `Claude nie wybrał poprawnie: ${lastErr}` });
  }
  const picked = await saveRefs(dir, pick.map(i => files[i]));
  return done({ status: 'ok', ...base, picked, reasons, selection: manual ? 'data' : 'auto' });
}
// wybrane zdjęcia w 1280 px → ref-1.jpg (ref-2.jpg); stary ref-2.jpg znika, gdy JP wybrał jedno zdjęcie
// element z linkImg = zdjęcie pobrane z linku JP (bufor już sprawdzony w place-icons-fetch.mjs) — bez autora i licencji, „źródło: link JP”
async function saveRefs(dir, chosen) {
  const com = chosen.filter(c => !c.linkImg);
  const big = com.length ? await fileInfos(com.map(c => c.title), com[0].source, 1280) : [];
  const picked = [];
  for (const [k, f] of chosen.entries()) {
    const srcF = join(dir, `ref-${k + 1}.src`);
    const c = f.linkImg ? f : big.find(b => b.title === f.title) ?? f;
    let src;
    if (f.linkImg) { writeFileSync(srcF, f.linkImg.buf); src = srcF; }
    else src = await download(c.thumb, srcF);
    const r = await py({ mode: 'jpeg', src, dst: join(dir, `ref-${k + 1}.jpg`) });
    try { unlinkSync(src); } catch {}
    if (r.code !== 0) throw new Error(f.linkImg ? `zdjęcie z linku JP (${f.linkImg.host}) nie daje się odczytać: ${r.err.slice(-200)}` : `JPEG: ${r.err.slice(-300)}`);
    picked.push(f.linkImg
      ? { title: f.title, page: f.title, url: f.linkImg.url, host: f.linkImg.host, via: f.linkImg.via, link: true, author: 'link JP', license: 'link JP', license_url: null, source: 'link' }
      : { title: c.title, page: c.page, url: c.url, author: c.author, license: c.license, license_url: c.license_url, width: c.width, height: c.height, source: f.source });
  }
  if (chosen.length < 2) try { unlinkSync(join(dir, 'ref-2.jpg')); } catch { /* nie było */ }
  return picked;
}
// wybór JP z panelu admina (ops.icon_refs): 1–2 pliki Commons albo linki https (kolejność zachowana).
// Commons: nadal sprawdzamy licencję i format (autor i licencja idą do refs.json → place-sources.json); zły plik odpada.
// Link: bezpieczne pobranie (place-icons-fetch.mjs); jakikolwiek nieudany link → status 'jp-link-failed' (refs.json bez zmian, bez automatu).
async function jpRefs(trip, stop, files, { dir, done, view }) {
  const titles = files.filter(L.isCommonsRef);
  const infos = titles.length ? await fileInfos(titles, 'jp') : [];
  const ok = [], bad = [], fails = [];
  for (const t of files) {
    if (!L.isCommonsRef(t)) {
      try {
        const img = await fetchImage(t);
        log(`${trip}/${stop.key}: link JP ${img.host} → ${img.kind}, ${Math.round(img.buf.length / 1024)} kB${img.via === 'strona' ? ' (obraz ze strony: og:image)' : ''}`);
        ok.push({ title: t, linkImg: img });
      } catch (e) { fails.push({ file: t, host: e.host || L.hostOf(t), reason: e instanceof LinkError ? e.reason : `błąd (${String(e.message).slice(0, 120)})` }); }
      continue;
    }
    const c = infos.find(i => i.title === t || i.title.replace(/ /g, '_') === t.replace(/ /g, '_'));
    if (!c) { bad.push(`${t}: nie ma na Commons`); continue; }
    if (!/^image\/(jpeg|png|webp|tiff)$/.test(c.mime)) { bad.push(`${t}: format ${c.mime}`); continue; }
    if (!L.licenseOk(c.license)) { bad.push(`${t}: licencja „${c.license}”`); continue; }
    const ppl = L.peopleHit(`${c.title} ${c.description} ${c.categories}`, [stop.name, stop.name_it, stop.city]);
    if (ppl) log(`${trip}/${stop.key}: UWAGA — opis zdjęcia wybranego przez JP wspomina „${ppl}” (${t}); JP widział zdjęcie, zostawiam`);
    ok.push(c);
  }
  for (const b of bad) log(`${trip}/${stop.key}: wybór JP odrzucony — ${b}`);
  for (const f of fails) log(`${trip}/${stop.key}: link JP nieudany — ${f.host}: ${f.reason}`);
  if (fails.length) return { status: 'jp-link-failed', fails, reasons: fails.map(f => `${f.host}: ${f.reason}`).join('; ') };   // czeka na JP
  if (!ok.length) return { status: 'jp-invalid', reasons: bad.join('; ') };   // refs.json bez zmian; wołający przechodzi na automat
  let picked;
  try { picked = await saveRefs(dir, ok); }
  catch (e) { if (!/link JP/.test(e.message)) throw e; return { status: 'jp-link-failed', fails: [{ file: ok.find(o => o.linkImg)?.title, host: ok.find(o => o.linkImg)?.linkImg.host, reason: 'plik nie daje się otworzyć jako zdjęcie' }], reasons: e.message }; }
  log(`${trip}/${stop.key}: referencje z wyboru JP — ${picked.map(p => p.link ? `link ${p.host}` : p.title).join(' + ')}`);
  return done({ status: 'ok', view, picked, selection: 'jp', jp_files: files, reasons: `wybór JP w panelu admina${bad.length ? ` (odrzucone: ${bad.join('; ')})` : ''}` });
}

// ── 2. generowanie (Antigravity, AI Pro) ──────────────────────────────────────────────────────
const AGY = '/opt/data/home/.local/bin/agy', BRAIN = '/opt/data/home/.gemini/antigravity-cli/brain', GQ = '/tmp/gq/place';
const QUOTA_RE = /quota reached|upgrade your subscription|RESOURCE_EXHAUSTED|Resets in\s*\d/i;
class QuotaError extends Error {}
class LinkWaitError extends Error {}   // link JP nie dał się pobrać — komunikat już poszedł na Discord, przystanek czeka na nowy wybór
function findNew(dir, prefix, since, depth = 0) {
  let hit = null;
  for (const e of (() => { try { return readdirSync(dir, { withFileTypes: true }); } catch { return []; } })()) {
    const f = join(dir, e.name);
    if (e.isDirectory() && depth < 3) { const h = findNew(f, prefix, since, depth + 1); if (h) hit = h; }
    else if (e.isFile() && e.name.toLowerCase().startsWith(prefix) && /\.(png|jpe?g|webp)$/i.test(e.name) && statSync(f).mtimeMs > since) hit = f;
  }
  return hit;
}
async function generateAgy(prompt, images, labels, name) {
  mkdirSync(GQ, { recursive: true });
  const refs = images.map((p, i) => { const d = join(GQ, `${name}-ref${i + 1}.${p.split('.').pop()}`); copyFileSync(p, d); return d; });
  const ask = `Use the image generator to create exactly one image named ${name}. Reference images: ${refs.map((p, i) => `${p} (${labels[i]})`).join(', ')}.\n${prompt}\nWhen the image is created, reply DONE.`;
  const t0 = Date.now();
  const envv = { ...process.env, HOME: '/opt/data/home' }; delete envv.GOOGLE_API_KEY; delete envv.GEMINI_API_KEY;
  const p = spawn(AGY, ['-p', ask], { cwd: '/tmp/gq', env: envv, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', closedAt = 0;
  const take = (d) => { out = (out + d).slice(-20_000); };
  p.stdout.on('data', take); p.stderr.on('data', take);
  p.on('close', () => { closedAt = Date.now(); });
  p.on('error', (e) => { out += `\n${e.message}`; closedAt = Date.now(); });
  try {
    for (let i = 0; i < 72; i++) {   // do 6 minut
      await sleep(5000);
      const f = findNew(BRAIN, name.toLowerCase(), t0);
      if (f) { await sleep(2000); aiUsage({ provider: 'gemini', model: 'Antigravity (AI Pro) obraz', role: 'ikony miejsc', billing: 'abonament' }); return readFileSync(f); }
      if (QUOTA_RE.test(out)) throw new QuotaError(`limit Antigravity: ${out.match(/[^\n]*(quota|Resets in|RESOURCE_EXHAUSTED)[^\n]*/i)?.[0]?.slice(0, 300) ?? out.slice(-300)}`);
      if (closedAt && Date.now() - closedAt > 15_000) throw new Error(`Antigravity zakończył bez obrazu: ${out.trim().slice(-300) || '(bez komunikatu)'}`);
    }
    throw new Error('Antigravity nie zapisał obrazu w 6 min');
  } finally { try { p.kill('SIGKILL'); } catch {} for (const r of refs) try { unlinkSync(r); } catch {} }
}
async function generate(prompt, images, labels, name) {
  try { return await generateAgy(prompt, images, labels, name); }
  catch (e) { if (e instanceof QuotaError) throw e; log(`${name}: ${e.message} — ponawiam`); return generateAgy(prompt, images, labels, name + '_r'); }
}
const isQuota = (e) => e instanceof QuotaError || QUOTA_RE.test(String(e?.message));

// jedna wersja ikony przystanku → plik out-vN.png (przezroczysty) → #ikony-miejsc (2 zdjęcia + ikona)
async function one(trip, key, notes = null) {
  globalThis.__aiCity = trip;
  const stop = stopMeta(trip, key); if (!stop) throw new Error(`${trip}/${key}: brak stop.json — najpierw: refs ${trip}`);
  const dir = L.stopDir(WORK, trip, key);
  const er = await ensureRefs(trip, key, { noWait: true });   // wybór JP w panelu (ops.icon_refs) ma pierwszeństwo — także przy poprawkach i --force
  if (er === 'wait-link') throw new LinkWaitError(`${trip}/${key}: ${await waitMsg(trip, key)}`);
  const refs = readJson(join(dir, 'refs.json'));
  if (refs?.status !== 'ok') throw new Error(`${trip}/${key}: brak zdjęć referencyjnych (refs: ${refs?.status ?? 'nie było'})`);
  if (!existsSync(STYLE)) throw new Error(`brak obrazu stylu ${STYLE} (sh repo.sh pull)`);
  const s = loadState(trip).stops[key] ?? {};
  const prev = s.v ? join(dir, L.outName(s.v)) : null;
  const photos = [join(dir, 'ref-1.jpg'), join(dir, 'ref-2.jpg')].slice(0, Math.max(1, Math.min(2, refs.picked?.length ?? 2))).filter(existsSync);
  if (!photos.length) throw new Error(`${trip}/${key}: brak pliku ref-1.jpg`);
  const withPrev = !!(notes && prev && existsSync(prev));
  const max = +(env('PLACE_ICONS_MAX_REFS') ?? 4);   // gdyby Antigravity nie przyjmował 4 obrazów: PLACE_ICONS_MAX_REFS=3 (poprawka bez 2. zdjęcia)
  const usePhotos = photos.slice(0, Math.max(1, Math.min(photos.length, max - 1 - (withPrev ? 1 : 0))));
  const images = [...usePhotos, STYLE, ...(withPrev ? [prev] : [])];
  const labels = [...usePhotos.map((_, i) => `photo ${i + 1} of the real place, architecture reference only`), 'the style reference', ...(withPrev ? ['the previous attempt'] : [])];
  const v = (s.v ?? 0) + 1;
  log(`${trip} #${stop.n} ${key}: generuję v${v}${notes ? ' (poprawka)' : ''}`);
  const prompt = L.buildPrompt(stop, { view: refs.view, notes, hasPrev: withPrev, photos: usePhotos.length });
  const buf = await generate(prompt, images, labels, L.agyName(trip, key, v));
  const f = join(dir, L.outName(v));
  if (buf[0] === 0x89 && buf[1] === 0x50) writeFileSync(f, buf);
  else { writeFileSync(f + '.src', buf); const c = await py({ mode: 'png', src: f + '.src', dst: f }); if (c.code !== 0) throw new Error(`PNG: ${c.err.slice(-200)}`); unlinkSync(f + '.src'); }
  const c2 = await py({ mode: 'cut', src: f, dst: f, title: stop.name, desc: `Ilustracja miejsca: ${stop.name} (${stop.city}). AI + redakcja Quolino.` });
  if (c2.code !== 0) throw new Error(`przezroczyste tło: ${c2.err.slice(-300)}`);
  let info = {}; try { info = JSON.parse(c2.out.trim().split('\n').pop()); } catch {}
  const warn = info.bg !== 'alpha' && info.transparent != null && info.transparent < 0.08 ? `tło prawie się nie wycięło (${Math.round(info.transparent * 100)}% przezroczyste, tło ${info.bg}) — pewnie nie było jednolite` : null;
  const now = new Date().toISOString();
  patchStop(trip, key, x => { x.v = v; x.status = 'review'; x.pending_notes = null; x.errors = 0; x.posted_at = now; (x.history ??= []).push({ v, at: now, notes, cut: info }); });
  const id = await upload(L.caption(stop, trip, refs.picked, { v, notes, warn: [warn, refs.selection === 'jp' ? 'zdjęcia wybrał JP w panelu' : null].filter(Boolean).join(' · ') || null }), [
    ...photos.map((p, i) => [p, `${stop.n}-ref-${i + 1}.jpg`]), [f, `${stop.n}-${key}-v${v}.png`]]);
  if (id) patchStop(trip, key, x => { x.msgs = [...(x.msgs ?? []), id].slice(-20); });
  return f;
}

// ── Discord ───────────────────────────────────────────────────────────────────────────────────
const channel = () => ensureChannel(...CHAN);
async function upload(text, files = []) {
  const ch = await channel();
  if (!ch || !TOKEN) { log('Discord niedostępny'); return null; }
  const fd = new FormData();
  fd.append('payload_json', JSON.stringify({ content: text.slice(0, 1900), allowed_mentions: { parse: [] } }));
  files.forEach(([p, name], i) => fd.append(`files[${i}]`, new Blob([readFileSync(p)], { type: /\.png$/.test(name) ? 'image/png' : 'image/jpeg' }), name));
  const r = await fetch(`https://discord.com/api/v10/channels/${ch}/messages`, { method: 'POST', headers: { Authorization: `Bot ${TOKEN}` }, body: fd }).catch(e => ({ ok: false, status: 0, text: async () => e.message }));
  if (!r.ok) { log('Discord upload:', r.status, await r.text()); return null; }
  return (await r.json().catch(() => ({}))).id ?? null;
}
const say = async (text) => notify(await channel(), text);

// ── blokada generowania: jeden proces Antigravity naraz (gen / fix / queue) ──────────────────
const LOCK = join(WORK, 'agy.lock');
function lock() {
  if (existsSync(LOCK)) {
    const pid = +readFileSync(LOCK, 'utf8').trim();
    let alive = false; try { process.kill(pid, 0); alive = true; } catch {}
    if (alive && pid !== process.pid && Date.now() - statSync(LOCK).mtimeMs < 60 * 60_000) return false;
  }
  writeFileSync(LOCK, String(process.pid));
  process.on('exit', () => { try { if (readFileSync(LOCK, 'utf8').trim() === String(process.pid)) unlinkSync(LOCK); } catch {} });
  return true;
}
const quotaMsg = (at) => `limit Antigravity (AI Pro) wyczerpany do ${at.slice(0, 16).replace('T', ' ')} UTC`;
async function onGenError(trip, key, e) {
  const stop = stopMeta(trip, key) ?? { n: '?', name: key };
  if (e instanceof LinkWaitError) { log(e.message); return 'wait'; }   // bez licznika błędów i bez drugiego posta
  if (isQuota(e)) {
    agyQuotaHit(e.message);
    await say(`⏸️ ${trip} #${stop.n} (${stop.name}): ${quotaMsg(agyQuotaOut() ?? new Date().toISOString())}. Kolejka wznowi generowanie sama.`);
    return 'quota';
  }
  log(`${trip}/${key}: ${e.message}`);
  patchStop(trip, key, x => { x.errors = (x.errors ?? 0) + 1; x.last_error = e.message.slice(0, 300); });
  await upload(`⚠️ ${trip} #${stop.n} (${stop.name}) nie wygenerował się: ${e.message.slice(0, 300)}. Napisz **${stop.n} uwagi…** albo **następne**, żeby spróbować jeszcze raz.`);
  return 'error';
}

// ── komendy ───────────────────────────────────────────────────────────────────────────────────
async function cmdRefs(trip) {
  const stops = await ensureTrip(trip);
  if (!stops) throw new Error(`${trip}: brak opublikowanej wersji`);
  const only = opt('--stop');
  for (const s of stops.filter(s => !only || s.key === only)) {
    const r = readJson(join(L.stopDir(WORK, trip, s.key), 'refs.json'));
    if (r?.status === 'ok' && !flag('--force') && !flag('--again') && !flag('--dry')) { console.log(`#${s.n} ${s.key}: zdjęcia już są (--force / --again)`); continue; }
    try {
      const x = await findRefs(trip, s, { again: flag('--again'), dry: flag('--dry') });
      if (!flag('--dry')) console.log(`#${s.n} ${s.key}: ${x.status}${x.picked ? ' — ' + x.picked.map(p => p.title).join(' + ') : ''}${x.reasons ? ` (${x.reasons})` : ''}`);
    } catch (e) { console.log(`#${s.n} ${s.key}: BŁĄD ${e.message}`); if (/Read/.test(e.message)) throw e; }
  }
}
// kolejne przystanki do wygenerowania: bez wersji, bez akceptacji, bez „brak zdjęć”
function todo(trip, { only = null, force = false } = {}) {
  const st = loadState(trip);
  return Object.entries(st.stops).filter(([k, s]) => only ? only.includes(k) || only.includes(String(s.n)) : (force || (!s.v && !['ok', 'none', 'skip'].includes(s.status) && (s.errors ?? 0) < 2)))
    .sort((a, b) => a[1].n - b[1].n).map(([k]) => k);
}
// ── wybór referencji przez JP w panelu admina (JP 2026-10-30) ─────────────────────────────────
// ops.icon_refs (trip, stop_key, mode 'pick'|'auto', files) — zapis: admin.admin_icon_refs_set (SQL 2026-10-30-icon-refs.sql).
// Kandydaci: work/place-icons/<trasa>/candidates.json albo media/icons/place-candidates/<trasa>.json (place-candidates.mjs).
// Bezpiecznik: przystanek z kandydatami bez wyboru i bez „automatu” czeka na JP najwyżej L.WAIT_HOURS (48 h) od wygenerowania kandydatów.
let selCache = null;
async function selections(trip) {
  selCache ??= {};
  if (selCache[trip] !== undefined) return selCache[trip];
  let c;
  try {
    c = await db();
    const { rows } = await c.query(`SELECT stop_key, mode, files FROM ops.icon_refs WHERE trip = $1`, [trip]);
    selCache[trip] = Object.fromEntries(rows.map(r => [r.stop_key, { mode: r.mode, files: r.files }]));
  } catch (e) { log(`${trip}: wybór zdjęć z panelu niedostępny (${String(e.message).slice(0, 120)}) — liczę jak „brak wyboru”`); selCache[trip] = {}; }
  finally { try { await c?.end(); } catch {} }
  return selCache[trip];
}
const candidatesOf = (trip) => readJson(join(WORK, trip, 'candidates.json')) ?? readJson(join(REPO, L.candidatesPath(trip)));
async function gateOf(trip, key) {
  return L.iconGate({ sel: (await selections(trip))[key] ?? null, cand: candidatesOf(trip), key, linkFail: loadState(trip).stops[key]?.link_fail ?? null });
}
// true = są referencje; false = brak dobrych zdjęć; 'wait' = czeka na wybór JP (noWait: jawna komenda JP — bez czekania, automat);
// 'wait-link' = link JP nie dał się pobrać — czeka na nowy wybór JP (także przy noWait / --no-wait: nie podmieniamy linku JP automatem)
async function ensureRefs(trip, key, { noWait = false } = {}) {
  const g = await gateOf(trip, key);
  if (g.wait && g.jp) return 'wait-link';
  if (g.wait && !noWait && !flag('--no-wait')) return 'wait';
  const r = readJson(join(L.stopDir(WORK, trip, key), 'refs.json'));
  if (g.use === 'pick') {
    if (r?.status === 'ok' && r.selection === 'jp' && L.sameFiles(r.jp_files, g.files)) return true;
    const x = await findRefs(trip, stopMeta(trip, key), { jpFiles: g.files });
    if (x.status === 'ok') { patchStop(trip, key, s => { delete s.link_fail; }); return true; }
    if (x.status === 'jp-link-failed') { await onLinkFail(trip, key, g.files, x.fails); return 'wait-link'; }
    log(`${trip}/${key}: wybór JP nieużywalny (${x.reasons}) — automat`);
  }
  if (r?.status === 'ok' && r.selection !== 'jp') return true;
  if (r && r.status !== 'ok' && !flag('--force')) return false;   // „none” / „skip” — nie szukamy w kółko
  const x = await findRefs(trip, stopMeta(trip, key));             // brak referencji albo JP przełączył z wyboru na automat
  return x.status === 'ok';
}
// nieudany link JP: licznik prób dla TEGO wyboru (nowy wybór w panelu = od zera), post na Discordzie raz na wybór
async function onLinkFail(trip, key, files, fails) {
  const sig = L.filesSig(files), at = new Date().toISOString();
  let first = false, tries = 0;
  patchStop(trip, key, s => {
    if (s.link_fail?.sig !== sig) { first = true; s.link_fail = { sig, tries: 0 }; }
    s.link_fail.tries = tries = (s.link_fail.tries ?? 0) + 1; s.link_fail.at = at;
    s.link_fail.msg = fails.map(f => `nie udało się pobrać Twojego zdjęcia z ${f.host}: ${f.reason}`).join('; ').slice(0, 500);
  });
  log(`${trip}/${key}: link JP nieudany (próba ${tries}/${L.LINK_TRIES}) — czekam na JP`);
  if (first) await upload(L.linkFailMsg(stopMeta(trip, key) ?? { n: '?', name: key }, trip, fails));
}
const waitMsg = async (trip, key) => {
  const g = await gateOf(trip, key);
  if (g.wait && g.jp) return `czeka na nowy wybór zdjęć JP w panelu admina (${g.why})`;
  const lf = loadState(trip).stops[key]?.link_fail;
  if (lf && !g.wait) return `czeka na JP: ${lf.msg} (próba ${lf.tries}/${L.LINK_TRIES})`;
  return g.wait ? `czeka na wybór zdjęć JP w panelu admina (najpóźniej do ${g.until.slice(0, 16).replace('T', ' ')} UTC, potem automat)` : '';
};
async function cmdGen(trip) {
  if (agyQuotaOut()) { console.error(`STOP: ${quotaMsg(agyQuotaOut())}. Generowanie wznowi: node place-icons.mjs queue (cron).`); process.exitCode = 1; return; }
  if (!lock()) { console.error('STOP: inny proces generuje teraz ikony (work/place-icons/agy.lock) — spróbuj za chwilę.'); process.exitCode = 1; return; }
  if (!Object.keys(loadState(trip).stops).length) await ensureTrip(trip);
  const only = opt('--only')?.split(',').map(s => s.trim());
  let list = todo(trip, { only, force: flag('--force') });
  let n = flag('--next') ? 1 : Infinity;
  for (const key of list) {
    if (n <= 0) break;
    try {
      const ok = await ensureRefs(trip, key);
      if (ok === 'wait-link') { log(`${trip}/${key}: ${await waitMsg(trip, key)} — pomijam`); continue; }
      if (ok === 'wait') { log(`${trip}/${key}: ${await waitMsg(trip, key)} — pomijam (--no-wait wymusza automat)`); continue; }
      if (!ok) { log(`${trip}/${key}: brak dobrych zdjęć — pomijam`); continue; }
      await one(trip, key); n--;
    } catch (e) { const r = await onGenError(trip, key, e); if (r === 'quota') { process.exitCode = 1; break; } if (r !== 'wait') n--; }
  }
  if (flag('--next') && n > 0) {
    const st = loadState(trip), left = Object.values(st.stops).filter(s => s.status !== 'ok').length;
    await say(left ? `ℹ️ ${trip}: nic nowego do wygenerowania — ${left} ikon czeka na ocenę albo nie ma zdjęć (status: node place-icons.mjs status ${trip}).` : `🎉 ${trip}: wszystkie ikony miejsc zaakceptowane.`);
  }
}
async function cmdFix(trip, n, notes) {
  if (!notes) throw new Error('fix <trasa> <N> "uwagi"');
  const key = keyOf(trip, n), stop = stopMeta(trip, key);
  if (agyQuotaOut() || !lock()) {
    patchStop(trip, key, x => { x.pending_notes = notes.slice(0, 800); x.status = 'fix-pending'; });
    await say(`🕓 Poprawka ${trip} #${stop.n} (${stop.name}) zapisana: „${notes.slice(0, 200)}”. ${agyQuotaOut() ? quotaMsg(agyQuotaOut()) + ' — wygeneruję po odnowieniu.' : 'Teraz generuje się inna ikona — kolejka zrobi ją w ciągu 30 min.'}`);
    return;
  }
  try { await one(trip, key, notes.slice(0, 800)); }
  catch (e) { patchStop(trip, key, x => { x.pending_notes = notes.slice(0, 800); }); await onGenError(trip, key, e); process.exitCode = 1; }
}
async function cmdRefsAgain(trip, n) {   // „3 inne zdjęcia” → nowe referencje (bez dotychczasowych) i nowa wersja
  const key = keyOf(trip, n);
  await ensureTrip(trip).catch(() => null);
  const g0 = await gateOf(trip, key);
  if (g0.use === 'pick' || g0.jp) { await say(`ℹ️ ${trip} #${n}: zdjęcia tego przystanku wybrałeś w panelu admina (karta przystanku, „Referencja do ikony Quo”) — zmień tam wybór albo kliknij „Automat”.`); return; }
  const x = await findRefs(trip, stopMeta(trip, key), { again: true });
  if (x.status !== 'ok') { await say(`⚠️ ${trip} #${n}: nie ma innych zdjęć bez ludzi (${x.reasons ?? x.status}). Można wskazać pliki ręcznie w place-icons-data.mjs (files).`); return; }
  if (agyQuotaOut() || !lock()) {
    patchStop(trip, key, s => { s.status = 'fix-pending'; s.pending_notes = 'nowe zdjęcia referencyjne'; });
    await say(`🕓 ${trip} #${n}: nowe zdjęcia wybrane (${x.picked.map(p => p.title).join(' + ')}); ikonę wygeneruje kolejka${agyQuotaOut() ? ' po odnowieniu limitu' : ''}.`);
    return;
  }
  try { await one(trip, key); } catch (e) { await onGenError(trip, key, e); }
}
async function cmdOk(trip, n) {
  const key = keyOf(trip, n), stop = stopMeta(trip, key), s = loadState(trip).stops[key];
  if (!s?.v) throw new Error(`${trip} #${n} jeszcze nie wygenerowana`);
  const src = join(L.stopDir(WORK, trip, key), L.outName(s.v)), refs = readJson(join(L.stopDir(WORK, trip, key), 'refs.json'));
  if (!existsSync(src)) throw new Error(`brak pliku ${src}`);
  const pull = await run('sh', [REPO_SH, 'pull'], { timeout: 120_000 });
  if (pull.code !== 0) throw new Error(`repo: ${(pull.err || pull.out).slice(-300)}`);
  const r = await py({ mode: 'webp', src, base: L.iconBase(REPO, trip, key), sizes: L.SIZES, title: stop.name, desc: `Ilustracja miejsca: ${stop.name} (${stop.city}). AI + redakcja Quolino.` });
  if (r.code !== 0) throw new Error(`WebP: ${r.err.slice(-300)}`);
  const at = new Date().toISOString();
  const entry = L.sourcesEntry({ trip, stop, refs: refs?.picked, v: s.v, version: loadState(trip).version, at });
  writeFileSync(SOURCES, JSON.stringify(L.mergeSources(readJson(SOURCES), entry), null, 1) + '\n');
  // gra czyta własne ikony przystanków z gra/icons/manifest.json („media”) — dopisujemy klucz, gdy plik jest w repo
  const GM = join(REPO, 'gra/icons/manifest.json'), gm = readJson(GM);
  if (gm) writeFileSync(GM, JSON.stringify(L.addToGameManifest(gm, trip, key), null, 2) + '\n');
  const pub = await run('sh', [REPO_SH, 'publish', `ikona miejsca ${trip} #${stop.n}: ${stop.name} (place-${trip}-${key}, WebP ${L.SIZES.join('/')} + źródła)`], { timeout: 5 * 60_000 });
  if (pub.code !== 0 || /BŁĄD/.test(pub.out)) throw new Error(`publikacja: ${(pub.err || pub.out).slice(-300)}`);
  patchStop(trip, key, x => { x.status = 'ok'; x.accepted_at = at; x.accepted_v = s.v; });
  await say(`✅ ${trip} #${stop.n} (${stop.name}) zaakceptowana: media/icons/place-${trip}-${key}-{${L.SIZES.join(',')}}.webp + źródła w media/icons/place-sources.json.`);
}
async function cmdQueue() {
  const max = +(opt('--max') ?? CFG.max ?? 3), maxPending = CFG.maxPending ?? 6;
  if (agyQuotaOut()) { log(`kolejka ikon miejsc: ${quotaMsg(agyQuotaOut())} — czekam`); return; }
  if (!lock()) { log('kolejka ikon miejsc: inny proces generuje — pomijam'); return; }
  log(`kolejka ikon miejsc: do ${max} przystanków; Antigravity w ostatnich 7 dniach: ${agyWeekCalls()} wywołań`);
  let budget = max;
  const listed = CFG.trips.map(t => t.slug);
  const extra = Object.entries(allStates()).filter(([k, st]) => !listed.includes(k) && Object.values(st.stops).some(s => s.pending_notes)).map(([k]) => ({ slug: k, onlyPending: true }));
  outer: for (const t of [...CFG.trips, ...extra]) {
    if (!t.onlyPending) {
      let stops = null;
      try { stops = await ensureTrip(t.slug, { requireV2: !t.force }); } catch (e) { log(`${t.slug}: ${e.message}`); continue; }
      if (!stops) { log(`${t.slug}: brak opublikowanej wersji nowego procesu (workflow v2) — pomijam (force: true w place-icons-data.mjs wymusza)`); continue; }
    }
    // JP wybrał w panelu inne zdjęcia dla ikony, która czeka na ocenę → nowa wersja z tymi zdjęciami (zaakceptowanych nie ruszamy)
    for (const [key, s] of Object.entries(loadState(t.slug).stops)) {
      if (!s.v || !['review', 'fix-pending'].includes(s.status) || s.pending_notes) continue;
      const g = await gateOf(t.slug, key), r = readJson(join(L.stopDir(WORK, t.slug, key), 'refs.json'));
      if (g.use === 'pick' && !(r?.selection === 'jp' && L.sameFiles(r.jp_files, g.files)))
        patchStop(t.slug, key, x => { x.pending_notes = 'nowe zdjęcia referencyjne'; x.status = 'fix-pending'; });
    }
    // najpierw poprawki czekające na limit
    for (const [key, s] of Object.entries(loadState(t.slug).stops).filter(([, s]) => s.pending_notes && (s.errors ?? 0) < 2).sort((a, b) => a[1].n - b[1].n)) {
      if (budget <= 0) break outer;
      try { await one(t.slug, key, s.pending_notes === 'nowe zdjęcia referencyjne' ? null : s.pending_notes); budget--; }
      catch (e) { const r = await onGenError(t.slug, key, e); if (r === 'quota') break outer; if (r !== 'wait') budget--; }
    }
    if (t.onlyPending) continue;
    let waiting = Object.values(loadState(t.slug).stops).filter(s => s.status === 'review').length;
    for (const key of todo(t.slug)) {
      if (budget <= 0) break outer;
      if (waiting >= maxPending) { log(`${t.slug}: ${waiting} ikon czeka na ocenę JP — nie generuję na zapas`); break; }
      try {
        const ok = await ensureRefs(t.slug, key);
        if (ok === 'wait' || ok === 'wait-link') { log(`${t.slug}/${key}: ${await waitMsg(t.slug, key)} — pomijam`); continue; }
        if (!ok) { log(`${t.slug}/${key}: brak dobrych zdjęć (refs.json) — pomijam`); continue; }
        await one(t.slug, key); budget--; waiting++;
      } catch (e) { const r = await onGenError(t.slug, key, e); if (r === 'quota') break outer; if (r !== 'wait') budget--; }
    }
  }
}
async function cmdWatch() {
  const WLOCK = join(WORK, 'watch.lock'), LAST_F = join(WORK, 'watch-last.txt');
  if (existsSync(WLOCK) && Date.now() - statSync(WLOCK).mtimeMs < 30 * 60_000) return;
  writeFileSync(WLOCK, String(process.pid));
  try {
    const ch = await channel();
    if (!ch || !TOKEN) { log('Discord niedostępny'); return; }
    const JP = env('QUOLINO_JP_DISCORD_ID') || '946118130709692476';
    const last = existsSync(LAST_F) ? readFileSync(LAST_F, 'utf8').trim() : '';
    const msgs = await (await fetch(`https://discord.com/api/v10/channels/${ch}/messages?limit=30${last ? `&after=${last}` : ''}`, { headers: { Authorization: `Bot ${TOKEN}` } })).json();
    const list = (Array.isArray(msgs) ? msgs : []).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    const me = (...a) => run('node', [join(DIR, 'place-icons.mjs'), ...a.map(String)], { timeout: 15 * 60_000 }).then(r => { if (r.code) log(`${a.join(' ')}: ${(r.err || r.out).slice(-300)}`); return r; });
    const done = new Set();
    for (const m of list) {
      writeFileSync(LAST_F, m.id);
      if (m.author?.id !== JP) continue;
      const states = allStates(), trips = Object.keys(states);
      const r = L.parseReply(m.content, trips);
      if (!r) continue;
      // odpowiedź (reply) na konkretny post z ikoną → ten przystanek
      const refId = m.message_reference?.message_id;
      const viaReply = refId && Object.entries(states).flatMap(([trip, st]) => Object.values(st.stops).filter(s => (s.msgs ?? []).includes(refId)).map(s => ({ trip, n: s.n })))[0];
      const lastP = L.lastPostedOf(states);
      const target = r.n != null ? (viaReply && !r.trip ? { trip: viaReply.trip, n: r.n } : L.resolveTarget(r, states, lastP)) : (viaReply ?? (lastP ? { trip: lastP.trip, n: lastP.n } : null));
      if (r.type === 'unknown-trip') { await say(`❓ Nie znam trasy „${r.word}”. Trasy z ikonami: ${trips.join(', ') || '(brak)'}.`); continue; }
      if (r.type === 'next') {
        const trip = viaReply?.trip ?? lastP?.trip ?? CFG.trips[0]?.slug;
        if (agyQuotaOut()) { await say(`⏸️ ${quotaMsg(agyQuotaOut())} — następne ikony wygeneruje kolejka po odnowieniu.`); continue; }
        await me('gen', trip, '--next'); continue;
      }
      if (!target) { await say('❓ Nie wiem, której ikony dotyczy odpowiedź — napisz np. **ok 3** albo **spello 3 uwagi…**.'); continue; }
      const { trip, n } = target, tag = `${r.type}:${trip}:${n}`;
      if (r.type === 'ok' || r.type === 'ok-last') {
        if (done.has(tag)) continue; done.add(tag);
        const x = await me('ok', trip, n);
        if (x.code) { await say(`⚠️ Akceptacja ${trip} #${n} nie przeszła: ${(x.err || x.out).trim().slice(-300)}`); continue; }
        if (agyQuotaOut()) await say(`⏸️ Następną ikonę ${trip} wygeneruje kolejka — ${quotaMsg(agyQuotaOut())}.`);
        else await me('gen', trip, '--next');
      } else if (r.type === 'fix' || r.type === 'fix-last') {
        await say(`🔧 Poprawka ${trip} #${n} przyjęta: „${r.notes.slice(0, 200)}”. Generuję nową wersję (ok. 1–3 min).`);
        await me('fix', trip, n, r.notes.slice(0, 800));
      } else if (r.type === 'refs' || r.type === 'refs-last') {
        await say(`🔎 ${trip} #${n}: szukam innych zdjęć referencyjnych i generuję od nowa.`);
        await me('refs-again', trip, n);
      }
    }
  } finally { try { unlinkSync(WLOCK); } catch {} }
}
function cmdStatus(trip) {
  const q = agyQuotaOut();
  console.log(`Antigravity: ${q ? quotaMsg(q) : 'dostępny'}; wywołań w 7 dni: ${agyWeekCalls()}`);
  const states = trip ? { [trip]: loadState(trip) } : allStates();
  if (!Object.keys(states).length) console.log('(jeszcze żadnej trasy — node place-icons.mjs refs <trasa>)');
  for (const [t, st] of Object.entries(states)) {
    console.log(`\n${t} (wersja ${st.version ?? '?'}${st.workflow ? ', ' + st.workflow : ''})`);
    for (const [k, s] of Object.entries(st.stops).sort((a, b) => a[1].n - b[1].n))
      console.log(`  ${String(s.n).padStart(2)} ${k.padEnd(28)} ${String(s.status ?? '').padEnd(12)} ${s.v ? 'v' + s.v : '  '} zdjęcia: ${s.refs ?? '—'}${readJson(join(L.stopDir(WORK, t, k), 'refs.json'))?.selection === 'jp' ? ' (wybór JP)' : ''}${s.pending_notes ? ` · czeka poprawka: ${s.pending_notes.slice(0, 60)}` : ''}${s.link_fail ? ` · link JP: ${s.link_fail.msg.slice(0, 80)} (${s.link_fail.tries}/${L.LINK_TRIES})` : ''}${s.last_error && s.status !== 'ok' ? ` · błąd: ${s.last_error.slice(0, 80)}` : ''}  ${s.name ?? ''}`);
  }
}

try {
  if (cmd === 'refs') await cmdRefs(a1);
  else if (cmd === 'gen') await cmdGen(a1);
  else if (cmd === 'fix') await cmdFix(a1, a2, a3);
  else if (cmd === 'refs-again') await cmdRefsAgain(a1, a2);
  else if (cmd === 'ok') await cmdOk(a1, a2);
  else if (cmd === 'queue') await cmdQueue();
  else if (cmd === 'watch') await cmdWatch();
  else if (cmd === 'status') cmdStatus(a1);
  else { console.error('komendy: refs | gen | fix | ok | status | watch | queue (opis na początku place-icons.mjs)'); process.exitCode = 2; }
} catch (e) { console.error('BŁĄD:', e.message); process.exitCode = 1; }
