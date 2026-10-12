#!/usr/bin/env node
// Grafiki z Discorda → strona (decyzja JP 2026-10-12).
// JP wrzuca obraz w wątku miasta i pisze, gdzie ma trafić („hero”, „do przystanku Rocca Maggiore”).
//   node media.mjs add <slug> <cel> --from-thread <id wątku> [--focus x,y] [--notify <id wątku>]
//   node media.mjs add <slug> <cel> --url <adres obrazu> | --file <ścieżka>     (zamiast --from-thread)
//   node media.mjs crop <slug> <cel> --focus x,y [--notify <id>]               (nowy kadr z tego samego pliku)
//   node media.mjs accept <slug> <cel> [--notify <id>]                         (na stronę: repo + baza)
//   node media.mjs drop <slug> <cel>                                           (porzuć oczekujący podgląd)
//   node media.mjs status <slug>                                               (co jest, co czeka)
//   node media.mjs reapply <slug>                                              (po publikacji szkicu: przywróć wpisy w bazie)
// cel: hero | stop_key | numer przystanku | fragment polskiej nazwy przystanku
// focus: punkt, wokół którego kadrujemy (0–1, od lewej i od góry). Domyślnie 0.5,0.5.
//        „wyżej” = mniejsze y (np. 0.5,0.35), „w lewo” = mniejsze x.
//
// add/crop: kadr 16:9 (+ kwadrat dla hero), WebP w rozmiarach strony, metadane (© Quolino, AI, GPS zabytku)
//           → podgląd w wątku; NIC nie trafia na stronę bez „accept”.
// accept:   pliki → repo media/tours/ (repo.sh publish, strona po ~1–3 min) + cities.hero_image / stops.hero_image.
//           Poprzednia wersja zostaje w historii repo (git) i w work/media/log.jsonl.
import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, appendFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { db, env, log, run } from './lib.mjs';
import { notify } from './draft-lib.mjs';

const [cmd, SLUG, ...rest] = process.argv.slice(2);
const argv = rest;
const opt = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : undefined; };
const TARGET_ARG = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--'))).join(' ').trim();
const NOTIFY = opt('--notify');
const WORK = '/opt/data/quolino/work/media';
const REPO = '/opt/data/repo/przewodnik';
const REPO_SH = '/opt/data/quolino/repo.sh';
const SITE = env('QUOLINO_SITE_URL') || 'https://quolino.srv1984679.hstgr.cloud';
const JP = env('QUOLINO_JP_DISCORD_ID') || '946118130709692476';
const TOKEN = env('DISCORD_BOT_TOKEN');
const API = 'https://discord.com/api/v10';

const say = async (text) => { console.log(text); if (NOTIFY) await notify(NOTIFY, text); };
const die = async (text) => { await say('⚠️ ' + text); process.exit(1); };

async function upload(channel, text, files) {
  if (!channel || !TOKEN) return false;
  const fd = new FormData();
  fd.append('payload_json', JSON.stringify({ content: text.slice(0, 1900), allowed_mentions: { parse: [] } }));
  files.forEach((f, i) => fd.append(`files[${i}]`, new Blob([readFileSync(f.path)]), f.name));
  const r = await fetch(`${API}/channels/${channel}/messages`, { method: 'POST', headers: { Authorization: `Bot ${TOKEN}` }, body: fd })
    .catch(e => ({ ok: false, statusText: e.message }));
  if (!r.ok) log('Discord upload:', r.status, r.statusText, await r.text?.().catch(() => ''));
  return r.ok;
}

// ── cel: miasto / przystanek ──────────────────────────────────────────────────────────────
async function target(q, slug, arg) {
  const [city] = await q(`SELECT c.slug, c.country, c.region_slug, c.lat, c.lon, c.hero_image,
      coalesce((SELECT title FROM public.city_translations WHERE city_slug = c.slug AND lang = 'pl'), c.slug) AS name
    FROM public.cities c WHERE c.slug = $1`, [slug]);
  if (!city) await die(`nie ma miasta „${slug}” w bazie`);
  const a = (arg || 'hero').toLowerCase();
  if (['hero', 'główna', 'glowna', 'okładka', 'okladka', 'miasto'].includes(a))
    return { kind: 'hero', key: 'hero', city, title: city.name, lat: city.lat, lon: city.lon,
             base: `quolino-${city.country || 'it'}-${city.slug}`, current: city.hero_image };
  const stops = await q(`SELECT s.id, s.stop_key, s.stop_number, s.lat, s.lon, s.hero_image, t.name
    FROM public.stops s LEFT JOIN public.stop_translations t ON t.stop_id = s.id AND t.lang = 'pl'
    WHERE s.city_slug = $1 ORDER BY s.sort_order, s.stop_number`, [slug]);
  const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^(do |przystanek |przystanku )+/, '').trim();
  const n = norm(a);
  let hit = stops.filter(s => s.stop_key === a || String(s.stop_number) === n.replace(/^0+/, ''));
  if (!hit.length) hit = stops.filter(s => norm(s.name) === n);
  if (!hit.length) hit = stops.filter(s => norm(s.name).includes(n) || n.includes(norm(s.name)) && norm(s.name).length > 3);
  if (hit.length !== 1)
    await die(`${hit.length ? 'kilka' : 'żaden'} przystanek nie pasuje do „${arg}”. Przystanki ${slug}:\n` +
      stops.map(s => `• ${String(s.stop_number).padStart(2, '0')} ${s.name ?? s.stop_key} (\`${s.stop_key}\`)`).join('\n'));
  const s = hit[0];
  return { kind: 'stop', key: s.stop_key, stop: s, city, title: `${s.name ?? s.stop_key} — ${city.name}`,
           lat: s.lat ?? city.lat, lon: s.lon ?? city.lon,
           base: `quolino-${city.country || 'it'}-${city.slug}-${s.stop_key}`, current: s.hero_image };
}

// ── źródło: ostatni obraz JP w wątku ──────────────────────────────────────────────────────
async function fetchSource(dir) {
  let url = opt('--url'), name = 'zrodlo';
  const file = opt('--file');
  if (file) { copyFileSync(file, join(dir, 'zrodlo.bin')); return { name: file.split('/').pop() }; }
  if (!url) {
    const thread = opt('--from-thread') || NOTIFY;
    if (!thread || !TOKEN) await die('podaj --from-thread <id wątku> albo --url');
    const msgs = await (await fetch(`${API}/channels/${thread}/messages?limit=30`, { headers: { Authorization: `Bot ${TOKEN}` } })).json();
    if (!Array.isArray(msgs)) await die(`Discord: nie mogę czytać wątku (${JSON.stringify(msgs).slice(0, 120)})`);
    const att = msgs.filter(m => m.author?.id === JP)
      .flatMap(m => (m.attachments ?? []).map(x => ({ ...x, at: m.timestamp })))
      .find(x => /^image\//.test(x.content_type ?? '') || /\.(jpe?g|png|webp|heic|avif)$/i.test(x.filename ?? ''));
    if (!att) await die('nie widzę obrazu od JP w ostatnich 30 wiadomościach wątku');
    url = att.url; name = att.filename;
  }
  const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!r.ok) await die(`nie mogę pobrać obrazu (${r.status})`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 40e6) await die('obraz ma ponad 40 MB');
  writeFileSync(join(dir, 'zrodlo.bin'), buf);
  return { name };
}

// ── obróbka (Pillow w kontenerze Hermesa) ─────────────────────────────────────────────────
const PY = String.raw`# Quolino — obróbka grafiki z Discorda (wywołuje media.mjs; kopia wbudowana w media.mjs).
# python3 media_process.py <job.json>
# job: {src, outdir, base, kind: hero|stop, focus: [fx, fy], title, description, lat, lon, year}
# Wynik (stdout JSON): {files: [...], preview: <jpg>, warnings: [...], src_size: [w, h]}
import json, sys, os
from PIL import Image, ImageOps, ImageDraw
from PIL.TiffImagePlugin import IFDRational

PROFILES = {
    'hero': [  # (sufiks, szerokość, proporcja w, h, jakość, maks. bajtów) — jak asset_profiles / city.html
        ('hero-1200', 1200, 16, 9, 82, 250_000),
        ('hero-800',   800, 16, 9, 80, 140_000),
        ('hero-480',   480, 16, 9, 78,  60_000),
        ('tile-768',   768,  1, 1, 80, 140_000),
        ('tile-384',   384,  1, 1, 78,  50_000),
    ],
    'stop': [
        ('800', 800, 16, 9, 80, 140_000),
        ('480', 480, 16, 9, 78,  60_000),
    ],
}


def crop_box(w, h, rw, rh, fx, fy):
    """Największy kadr o proporcji rw:rh, środek jak najbliżej punktu (fx, fy) (0–1)."""
    if w * rh > h * rw:            # obraz szerszy niż kadr
        ch, cw = h, round(h * rw / rh)
    else:
        cw, ch = w, round(w * rh / rw)
    x = min(max(round(fx * w - cw / 2), 0), w - cw)
    y = min(max(round(fy * h - ch / 2), 0), h - ch)
    return (x, y, x + cw, y + ch)


def dms(v):
    v = abs(float(v)); d = int(v); m = int((v - d) * 60); s = round(((v - d) * 60 - m) * 60, 2)
    return (IFDRational(d, 1), IFDRational(m, 1), IFDRational(int(s * 100), 100))


def exif_for(job):
    ex = Image.Exif()
    ex[0x013B] = 'Quolino'                                   # Artist
    ex[0x8298] = '(C) Quolino. All rights reserved.'         # Copyright (EXIF bez znaku ©)
    if job.get('description'): ex[0x010E] = job['description'][:300]   # ImageDescription
    ex[0x0131] = 'Quolino media pipeline'                    # Software
    lat, lon = job.get('lat'), job.get('lon')
    if lat not in (None, '') and lon not in (None, ''):
        gps = ex.get_ifd(0x8825)
        gps[1] = 'N' if float(lat) >= 0 else 'S'; gps[2] = dms(lat)
        gps[3] = 'E' if float(lon) >= 0 else 'W'; gps[4] = dms(lon)
    return ex.tobytes()


def xmp_for(job):
    esc = lambda s: (str(s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;'))
    gps = ''
    if job.get('lat') not in (None, '') and job.get('lon') not in (None, ''):
        gps = f'<Iptc4xmpExt:LocationShown><rdf:Bag><rdf:li Iptc4xmpExt:GPSLatitude="{float(job["lat"]):.6f}" Iptc4xmpExt:GPSLongitude="{float(job["lon"]):.6f}" Iptc4xmpExt:LocationName="{esc(job.get("title"))}"/></rdf:Bag></Iptc4xmpExt:LocationShown>'
    ai = '<Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType>' if job.get('ai', True) else ''
    return (f'<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>'
            f'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
            f'<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" '
            f'xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/">'
            f'<dc:title><rdf:Alt><rdf:li xml:lang="x-default">{esc(job.get("title"))}</rdf:li></rdf:Alt></dc:title>'
            f'<dc:description><rdf:Alt><rdf:li xml:lang="x-default">{esc(job.get("description"))}</rdf:li></rdf:Alt></dc:description>'
            f'<dc:creator><rdf:Seq><rdf:li>Quolino</rdf:li></rdf:Seq></dc:creator>'
            f'<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">© Quolino. All rights reserved.</rdf:li></rdf:Alt></dc:rights>'
            f'<photoshop:Credit>Quolino</photoshop:Credit><xmpRights:Marked>True</xmpRights:Marked>{ai}{gps}'
            f'</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>').encode('utf-8')


def save_webp(img, path, quality, max_bytes, exif, xmp):
    q = quality
    while True:
        img.save(path, 'WEBP', quality=q, method=6, exif=exif, xmp=xmp)
        if not max_bytes or os.path.getsize(path) <= max_bytes or q <= 50:
            return q
        q -= 4


def main():
    job = json.load(open(sys.argv[1], encoding='utf-8'))
    im = ImageOps.exif_transpose(Image.open(job['src']))      # obrót z telefonu, potem metadane źródła odpadają
    im = im.convert('RGB')
    w, h = im.size
    fx, fy = job.get('focus') or (0.5, 0.5)
    os.makedirs(job['outdir'], exist_ok=True)
    exif, xmp = exif_for(job), xmp_for(job)
    warnings, files, crops = [], [], {}
    for suffix, width, rw, rh, quality, max_bytes in PROFILES[job['kind']]:
        box = crop_box(w, h, rw, rh, fx, fy)
        crops[(rw, rh)] = box
        part = im.crop(box)
        if part.width < width:
            warnings.append(f'{suffix}: źródło ma tylko {part.width}px szerokości kadru (potrzeba {width}) — obraz będzie powiększony')
        out = part.resize((width, round(width * rh / rw)), Image.LANCZOS)
        name = f"{job['base']}-{suffix}.webp"
        path = os.path.join(job['outdir'], name)
        q = save_webp(out, path, quality, max_bytes, exif, xmp)
        files.append({'name': name, 'bytes': os.path.getsize(path), 'quality': q, 'size': [out.width, round(width * rh / rw)]})
    # podgląd dla Discorda: całe źródło, zaznaczony kadr 16:9, pas widoczny na stronie (16:7) i kafel 1:1
    pv = im.copy(); pv.thumbnail((1400, 1400))
    k = pv.width / w
    shade = Image.blend(pv, Image.new('RGB', pv.size, (0, 0, 0)), 0.55)   # poza kadrem przyciemnione
    mask = Image.new('L', pv.size, 255)
    x0, y0, x1, y1 = [round(v * k) for v in crops[(16, 9)]]
    ImageDraw.Draw(mask).rectangle((x0, y0, x1, y1), fill=0)
    pv = Image.composite(shade, pv, mask)
    d = ImageDraw.Draw(pv)
    d.rectangle((x0, y0, x1, y1), outline=(255, 210, 60), width=4)
    if job['kind'] == 'hero':
        band = (y1 - y0) * 7 / 9; by0 = y0 + ((y1 - y0) - band) / 2
        d.rectangle((x0, by0, x1, by0 + band), outline=(255, 255, 255), width=2)
        if (1, 1) in crops:
            a0, b0, a1, b1 = [round(v * k) for v in crops[(1, 1)]]
            d.rectangle((a0, b0, a1, b1), outline=(90, 200, 255), width=3)
    preview = os.path.join(job['outdir'], '_podglad.jpg')
    pv.save(preview, 'JPEG', quality=82)
    print(json.dumps({'files': files, 'preview': preview, 'warnings': warnings, 'src_size': [w, h]}, ensure_ascii=False))


main()
`;
async function processImage(t, dir, focus) {
  const out = join(dir, 'pliki');
  rmSync(out, { recursive: true, force: true });
  writeFileSync(join(WORK, '_process.py'), PY);
  const job = { src: join(dir, 'zrodlo.bin'), outdir: out, base: t.base, kind: t.kind, focus,
    title: t.title, description: t.kind === 'hero' ? `${t.city.name} — Quolino, rodzinna wycieczka` : `${t.title} — Quolino`,
    lat: t.lat, lon: t.lon, ai: true };
  writeFileSync(join(dir, 'job.json'), JSON.stringify(job, null, 2));
  const r = await run('python3', [join(WORK, '_process.py'), join(dir, 'job.json')], { timeout: 5 * 60_000 });
  if (r.code !== 0) await die(`obróbka nieudana: ${(r.err || r.out).slice(-400)}`);
  return JSON.parse(r.out.trim().split('\n').pop());
}

const parseFocus = (s) => {
  if (!s) return [0.5, 0.5];
  const m = String(s).split(/[ ,;]+/).map(Number);
  if (m.length !== 2 || m.some(v => !(v >= 0 && v <= 1))) return null;
  return m;
};
const kb = (b) => `${Math.round(b / 1024)} KB`;

async function preview(t, dir, res, focus) {
  const pending = { slug: SLUG, key: t.key, kind: t.kind, base: t.base, focus, files: res.files, src_size: res.src_size, at: new Date().toISOString() };
  writeFileSync(join(dir, 'pending.json'), JSON.stringify(pending, null, 2));
  const where = t.kind === 'hero' ? 'grafika główna (hero) + kafel' : `przystanek ${t.stop.name ?? t.key}`;
  const text = `🖼️ **${t.city.name} — ${where}** · podgląd kadru (źródło ${res.src_size.join('×')} px, punkt kadrowania ${focus.join(', ')})\n` +
    (t.kind === 'hero' ? 'Żółta ramka = kadr 16:9 · biała = pas widoczny na stronie miasta · niebieska = kafel na listach.\n' : 'Żółta ramka = kadr 16:9.\n') +
    res.files.map(f => `• \`${f.name}\` ${f.size.join('×')} · ${kb(f.bytes)}`).join('\n') +
    (res.warnings.length ? `\n⚠️ ${res.warnings.join('\n⚠️ ')}` : '') +
    `\n${t.current ? `Zastąpi obecną grafikę (\`${t.current}\`). ` : ''}Odpowiedz **ok**, albo „przesuń wyżej / niżej / w lewo / w prawo”.`;
  const big = res.files.find(f => /hero-800|-800\.webp$/.test(f.name));
  const tile = res.files.find(f => /tile-384/.test(f.name));
  const files = [{ path: res.preview, name: 'kadr.jpg' }, big && { path: join(dir, 'pliki', big.name), name: big.name },
                 tile && { path: join(dir, 'pliki', tile.name), name: tile.name }].filter(Boolean);
  console.log(text);
  if (NOTIFY && !(await upload(NOTIFY, text, files))) await notify(NOTIFY, text + '\n(nie udało się dołączyć obrazów podglądu)');
}

const c = await db();
const q = async (sql, p) => (await c.query(sql, p)).rows;
try {
  if (!SLUG && cmd !== 'help') await die('podaj miasto (slug), np. node media.mjs add spello hero --from-thread <id>');
  mkdirSync(WORK, { recursive: true });

  if (cmd === 'status') {
    const t = await target(q, SLUG, 'hero');
    const stops = await q(`SELECT s.stop_key, s.hero_image, t.name FROM public.stops s
      LEFT JOIN public.stop_translations t ON t.stop_id = s.id AND t.lang = 'pl' WHERE s.city_slug = $1 ORDER BY s.sort_order`, [SLUG]);
    const pend = readdirSync(WORK).filter(d => d.startsWith(SLUG + '__') && existsSync(join(WORK, d, 'pending.json')));
    console.log(`${t.city.name}: hero ${t.current ? '`' + t.current + '`' : '(domyślna nazwa, plik ' + (existsSync(join(REPO, 'media/tours', t.base + '-hero-1200.webp')) ? 'jest' : 'BRAK') + ')'}\n` +
      stops.map(s => `• ${s.name ?? s.stop_key}: ${s.hero_image ? '🖼️ ' + s.hero_image : '—'}`).join('\n') +
      (pend.length ? `\nCzeka na „ok”: ${pend.map(d => d.split('__')[1]).join(', ')}` : ''));
    process.exit(0);
  }

  if (cmd === 'reapply') {
    const lines = existsSync(join(WORK, 'log.jsonl')) ? readFileSync(join(WORK, 'log.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)) : [];
    const last = {};
    for (const l of lines.filter(l => l.slug === SLUG && l.action === 'accept')) last[l.key] = l;
    for (const l of Object.values(last)) {
      if (l.kind === 'hero') await q('UPDATE public.cities SET hero_image = $2 WHERE slug = $1', [SLUG, l.base]);
      else await q('UPDATE public.stops SET hero_image = $3 WHERE city_slug = $1 AND stop_key = $2', [SLUG, l.key, l.base]);
    }
    await say(`↻ ${SLUG}: przywrócone wpisy grafik w bazie: ${Object.keys(last).join(', ') || 'brak'}`);
    process.exit(0);
  }

  const t = await target(q, SLUG, TARGET_ARG);
  const dir = join(WORK, `${SLUG}__${t.key}`);

  if (cmd === 'add') {
    const focus = parseFocus(opt('--focus'));
    if (!focus) await die('--focus: dwie liczby 0–1, np. 0.5,0.35');
    rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
    const src = await fetchSource(dir);
    log(`${SLUG}/${t.key}: źródło ${src.name}`);
    const res = await processImage(t, dir, focus);
    await preview(t, dir, res, focus);
  } else if (cmd === 'crop') {
    if (!existsSync(join(dir, 'zrodlo.bin'))) await die(`brak wrzuconego obrazu dla ${SLUG}/${t.key} — najpierw add`);
    const focus = parseFocus(opt('--focus'));
    if (!focus) await die('--focus: dwie liczby 0–1, np. 0.5,0.35');
    const res = await processImage(t, dir, focus);
    await preview(t, dir, res, focus);
  } else if (cmd === 'drop') {
    rmSync(dir, { recursive: true, force: true });
    await say(`🗑️ ${SLUG}/${t.key}: podgląd porzucony, nic nie zmieniono na stronie.`);
  } else if (cmd === 'accept') {
    if (!existsSync(join(dir, 'pending.json'))) await die(`nic nie czeka na zatwierdzenie dla ${SLUG}/${t.key}`);
    const p = JSON.parse(readFileSync(join(dir, 'pending.json'), 'utf8'));
    const pull = await run('sh', [REPO_SH, 'pull'], { timeout: 120_000 });
    if (pull.code !== 0) await die(`repo: ${(pull.err || pull.out).slice(-300)}`);
    mkdirSync(join(REPO, 'media/tours'), { recursive: true });
    for (const f of p.files) copyFileSync(join(dir, 'pliki', f.name), join(REPO, 'media/tours', f.name));
    const what = p.kind === 'hero' ? 'hero' : `przystanek ${t.stop.name ?? t.key}`;
    const pub = await run('sh', [REPO_SH, 'publish', `grafika ${SLUG}: ${what} (${p.files.length} plików WebP)`], { timeout: 5 * 60_000 });
    if (pub.code !== 0 || /BŁĄD/.test(pub.out)) await die(`publikacja w repo nieudana: ${(pub.err || pub.out).slice(-400)}`);
    if (p.kind === 'hero') await q('UPDATE public.cities SET hero_image = $2 WHERE slug = $1', [SLUG, p.base]);
    else await q('UPDATE public.stops SET hero_image = $3 WHERE city_slug = $1 AND stop_key = $2', [SLUG, p.key, p.base]);
    appendFileSync(join(WORK, 'log.jsonl'), JSON.stringify({ ...p, action: 'accept', accepted_at: new Date().toISOString(),
      previous: t.current ?? null, commit: (pub.out.match(/Wysłano: (\w+)/) || [])[1] ?? null }) + '\n');
    rmSync(join(dir, 'pending.json'));
    const url = `${SITE}/pl/${t.city.region_slug}/${SLUG}/`;
    await say(`✅ ${t.city.name}: ${what} zapisana. Strona pokaże ją za ~1–3 min (synchronizacja repo): ${url}\n` +
      `${(pub.out.match(/Wysłano: .*/) || [''])[0]}`);
  } else {
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith('//')).join('\n'));
  }
} finally { await c.end().catch(() => {}); }
