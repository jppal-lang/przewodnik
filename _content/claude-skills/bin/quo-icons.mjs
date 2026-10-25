#!/usr/bin/env node
// Ikony Quo na stronę (JP 2026-10-25): Gemini generuje według promptów z dokumentu „Quo na stronie: miejsca i prompty do Flow”
// (bin/quo-icons-data.mjs), każda ikona ląduje na Discordzie (#quo-ikony w kategorii „Grafiki”), JP odpisuje „ok N” albo „N: uwagi”.
//   node quo-icons.mjs gen [--only 1,2,3] [--force]     generuje brakujące (albo wskazane) i wrzuca na Discord
//   node quo-icons.mjs fix <N> "<uwagi JP>"             poprawka: poprzednia wersja + uwagi → nowa wersja na Discord
//   node quo-icons.mjs ok <N>                           akceptacja: WebP 128/256/512 → repo media/icons/quo-<slug>-<rozmiar>.webp
//   node quo-icons.mjs status                           lista: czeka / do poprawy / zaakceptowana
// Referencje: kanoniczny Quo (pose-05) + ikona ze stylem (icon-museum). Wygląd Quo opisuje tylko obrazek, nie słowa.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { env, log, run, aiUsage } from './lib.mjs';
import { ensureChannel } from './draft-lib.mjs';
import CFG from './quo-icons-data.mjs';

const DIR = new URL('.', import.meta.url).pathname;
const REPO = '/opt/data/repo/przewodnik';
const REPO_SH = '/opt/data/quolino/repo.sh';
const WORK = '/opt/data/quolino/work/quo-icons';
const MODEL = env('QUO_IMAGE_MODEL') || 'gemini-3.1-flash-image';
const KEY = env('GOOGLE_API_KEY') || env('GEMINI_API_KEY');
const TOKEN = env('DISCORD_BOT_TOKEN');
const [cmd = 'status', a1, a2] = process.argv.slice(2);
const opt = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
mkdirSync(WORK, { recursive: true });
const STATE_F = join(WORK, 'state.json'), LAST_F = join(WORK, 'watch-last.txt');
const state = existsSync(STATE_F) ? JSON.parse(readFileSync(STATE_F, 'utf8')) : {};
const save = () => writeFileSync(STATE_F, JSON.stringify(state, null, 2));
// stan odtwarzany z plików, gdyby state.json zgubił wpis (np. nadpisany): najwyższa wersja NN-slug-vK.png
for (const f of readdirSync(WORK)) { const m = f.match(/^(\d+)-.+-v(\d+)\.png$/); if (m) { const n = +m[1]; state[n] ??= { v: 0, status: 'review', history: [] }; if (+m[2] > state[n].v) state[n].v = +m[2]; } }
const icon = (n) => CFG.icons.find(x => x.n === +n) ?? (() => { throw new Error(`nie ma ikony nr ${n}`); })();
const b64 = (p) => readFileSync(p).toString('base64');
const mime = (p) => p.endsWith('.webp') ? 'image/webp' : p.endsWith('.jpg') ? 'image/jpeg' : 'image/png';

// Antigravity (abonament AI Pro, JP 2026-10-25): podagent image-generator zapisuje obraz w swoim katalogu „brain”,
// a tryb -p nie czeka na niego — szukamy pliku z naszą nazwą nowszego niż start, potem zamykamy proces.
const AGY = '/opt/data/home/.local/bin/agy', BRAIN = '/opt/data/home/.gemini/antigravity-cli/brain', GQ = '/tmp/gq/quo';
function findNew(dir, prefix, since, depth = 0) {
  let hit = null;
  for (const e of (() => { try { return readdirSync(dir, { withFileTypes: true }); } catch { return []; } })()) {
    const f = join(dir, e.name);
    if (e.isDirectory() && depth < 3) { const h = findNew(f, prefix, since, depth + 1); if (h) hit = h; }
    else if (e.isFile() && e.name.toLowerCase().startsWith(prefix) && /\.(png|jpe?g|webp)$/i.test(e.name) && statSync(f).mtimeMs > since) hit = f;
  }
  return hit;
}
async function generateAgy(prompt, images, name) {
  mkdirSync(GQ, { recursive: true });
  const refs = images.map((p, i) => { const d = join(GQ, `ref${i + 1}-${p.split('/').pop()}`); copyFileSync(p, d); return d; });
  const ask = `Use the image generator to create exactly one image named ${name}. Reference images: ${refs.map((p, i) => `${p} (${i === 0 ? 'the character' : i === 1 ? 'the style' : 'the previous attempt'})`).join(', ')}.\n${prompt}\nWhen the image is created, reply DONE.`;
  const t0 = Date.now();
  const envv = { ...process.env, HOME: '/opt/data/home' }; delete envv.GOOGLE_API_KEY; delete envv.GEMINI_API_KEY;
  const p = spawn(AGY, ['-p', ask], { cwd: '/tmp/gq', env: envv, stdio: 'ignore' });
  try {
    for (let i = 0; i < 72; i++) {   // do 6 minut
      await new Promise(r => setTimeout(r, 5000));
      const f = findNew(BRAIN, name.toLowerCase(), t0);
      if (f) { await new Promise(r => setTimeout(r, 2000)); aiUsage({ provider: 'gemini', model: 'Antigravity (AI Pro) obraz', role: 'ikony Quo', billing: 'abonament' }); return readFileSync(f); }
    }
    throw new Error('Antigravity nie zapisał obrazu w 6 min');
  } finally { try { p.kill('SIGKILL'); } catch {} }
}
async function generate(prompt, images, name) {
  if (!process.argv.includes('--api')) return generateAgy(prompt, images, name);
  if (!KEY) throw new Error('brak GOOGLE_API_KEY');
  const parts = [...images.map(p => ({ inlineData: { mimeType: mime(p), data: b64(p) } })), { text: prompt }];
  for (let i = 1; i <= 2; i++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(180_000),
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } } }) })
      .catch(e => ({ ok: false, status: 0, text: async () => e.message }));
    if (!r.ok) { const t = await r.text(); if (i === 2 || r.status !== 503) throw new Error(`Gemini ${r.status}: ${t.slice(0, 300)}`); continue; }
    const j = await r.json();
    const u = j.usageMetadata ?? {};
    aiUsage({ provider: 'gemini', model: `${MODEL} (klucz API)`, role: 'ikony Quo', billing: env('GEMINI_BILLING') === '1' ? 'api' : 'darmowe', tin: u.promptTokenCount ?? 0, tout: u.candidatesTokenCount ?? 0 });
    const img = (j.candidates?.[0]?.content?.parts ?? []).find(p => p.inlineData?.data);
    if (img) return Buffer.from(img.inlineData.data, 'base64');
    if (i === 2) throw new Error(`Gemini nie zwrócił obrazu: ${JSON.stringify(j).slice(0, 300)}`);
  }
}


// Przezroczyste tło + metadane praw (JP 2026-10-25): wycięcie białego tła połączonego z brzegiem obrazu (wnętrze postaci zostaje),
// miękka krawędź, kadr kwadratowy z marginesem; metadane jak w media.mjs: © Quolino (quolino.com), twórca, znacznik AI (IPTC).
const PY = `
import sys, json
from PIL import Image, ImageDraw, ImageFilter, PngImagePlugin
job = json.loads(sys.argv[1])
TITLE = job.get('title') or 'Quo'
RIGHTS = '© Quolino (quolino.com). All rights reserved.'
def exif():
    ex = Image.Exif()
    ex[0x013B] = 'Quolino (quolino.com)'
    ex[0x8298] = '(C) Quolino, quolino.com. All rights reserved.'
    ex[0x010E] = ('Quo, maskotka Quolino: ' + TITLE)[:300]
    ex[0x0131] = 'Quolino media pipeline'
    return ex.tobytes()
def xmp():
    e = lambda s: str(s).replace('&','&amp;').replace('<','&lt;').replace('>','&gt;').replace('"','&quot;')
    return ('<?xpacket begin="\\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
      '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" '
      'xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/">'
      '<dc:title><rdf:Alt><rdf:li xml:lang="x-default">' + e('Quo: ' + TITLE) + '</rdf:li></rdf:Alt></dc:title>'
      '<dc:creator><rdf:Seq><rdf:li>Quolino</rdf:li></rdf:Seq></dc:creator>'
      '<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">' + RIGHTS + '</rdf:li></rdf:Alt></dc:rights>'
      '<photoshop:Credit>Quolino (quolino.com)</photoshop:Credit><xmpRights:Marked>True</xmpRights:Marked>'
      '<xmpRights:WebStatement>https://quolino.com</xmpRights:WebStatement>'
      '<Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType>'
      '</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>').encode('utf-8')
def cut(src, dst):
    im = Image.open(src).convert('RGBA')
    w, h = im.size
    if im.getchannel('A').getextrema()[0] < 250:   # już ma przezroczystość
        out = im
    else:
        rgb = im.convert('RGB')
        white = Image.eval(rgb.convert('L'), lambda v: 0)
        px, wp = rgb.load(), white.load()
        for y in range(h):
            for x in range(w):
                r, g, b = px[x, y]
                if min(r, g, b) >= 212 and max(r, g, b) - min(r, g, b) <= 18: wp[x, y] = 255
        for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)] + [(x, 0) for x in range(0, w, 16)] + [(x, h - 1) for x in range(0, w, 16)] + [(0, y) for y in range(0, h, 16)] + [(w - 1, y) for y in range(0, h, 16)]:
            if wp[x, y] == 255: ImageDraw.floodfill(white, (x, y), 128)
        bg = Image.eval(white, lambda v: 255 if v == 128 else 0)
        alpha = Image.eval(bg, lambda v: 255 - v).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(1.0))
        out = im.copy(); out.putalpha(alpha)
    box = out.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox() or (0, 0, w, h)
    c = out.crop(box); side = int(max(c.size) * 1.08)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0)); sq.paste(c, ((side - c.size[0]) // 2, (side - c.size[1]) // 2))
    sq = sq.resize((1024, 1024), Image.LANCZOS)
    info = PngImagePlugin.PngInfo()
    for k, v in (('Title', 'Quo: ' + TITLE), ('Author', 'Quolino (quolino.com)'), ('Copyright', RIGHTS), ('Source', 'https://quolino.com'), ('Description', 'Quo, maskotka Quolino. AI + redakcja Quolino.')):
        info.add_text(k, v)
    sq.save(dst, 'PNG', pnginfo=info, exif=exif())
def webp(src, base):
    im = Image.open(src).convert('RGBA')
    for s in (128, 256, 512):
        im.resize((s, s), Image.LANCZOS).save(f'{base}-{s}.webp', 'WEBP', quality=90, method=6, exif=exif(), xmp=xmp())
if job['mode'] == 'cut': cut(job['src'], job['dst'])
else: webp(job['src'], job['base'])
`;
const py = (job) => run('python3', ['-c', PY, JSON.stringify(job)], { timeout: 180_000 });

async function upload(text, file) {
  const ch = await ensureChannel('quo-ikony', 'Grafiki');
  if (!ch || !TOKEN) { log('Discord niedostępny'); return false; }
  const fd = new FormData();
  fd.append('payload_json', JSON.stringify({ content: text.slice(0, 1900), allowed_mentions: { parse: [] } }));
  fd.append('files[0]', new Blob([readFileSync(file)]), file.split('/').pop());
  const r = await fetch(`https://discord.com/api/v10/channels/${ch}/messages`, { method: 'POST', headers: { Authorization: `Bot ${TOKEN}` }, body: fd });
  if (!r.ok) log('Discord upload:', r.status, await r.text());
  return r.ok;
}

async function one(ic, notes = null) {
  const s = state[ic.n] ??= { v: 0, status: 'new', history: [] };
  const refs = CFG.refs.map(p => join(REPO, p));
  const prev = s.v ? join(WORK, `${String(ic.n).padStart(2, '0')}-${ic.slug}-v${s.v}.png`) : null;
  let prompt = ic.prompt;
  if (notes && prev && existsSync(prev)) {
    refs.push(prev);
    prompt += `\n\nThe third image is the previous attempt. Keep what works in it and apply these corrections from the art director (Polish): ${notes}`;
  }
  log(`ikona ${ic.n} ${ic.slug}: generuję${notes ? ' poprawkę' : ''}`);
  const png = await generate(prompt, refs, `quo_${String(ic.n).padStart(2, '0')}_${ic.slug.replace(/-/g, '_')}_v${s.v + 1}`);
  s.v++; s.status = 'review'; s.history.push({ v: s.v, at: new Date().toISOString(), notes });
  const f = join(WORK, `${String(ic.n).padStart(2, '0')}-${ic.slug}-v${s.v}.png`);
  if (png[0] === 0x89 && png[1] === 0x50) writeFileSync(f, png);
  else {   // JPG/WebP z Antigravity → PNG (nazwy plików i podglądy zawsze .png)
    writeFileSync(f + '.src', png);
    const c = await run('python3', ['-c', `from PIL import Image\nImage.open(${JSON.stringify(f + '.src')}).convert('RGBA').save(${JSON.stringify(f)},'PNG')`], { timeout: 60_000 });
    if (c.code !== 0) throw new Error(`PNG: ${c.err.slice(-200)}`);
  }
  const c2 = await py({ mode: 'cut', src: f, dst: f, title: ic.place });
  if (c2.code !== 0) throw new Error(`przezroczyste tło: ${c2.err.slice(-300)}`);
  save();
  await upload(`🎨 **Quo #${ic.n} — ${ic.place}** · wersja ${s.v}${notes ? ` (poprawki: ${notes.slice(0, 200)})` : ''}\nOdpisz: **ok ${ic.n}** albo **${ic.n}: co poprawić**.`, f);
  return f;
}

try {
  if (cmd === 'gen') {
    const only = opt('--only')?.split(',').map(Number);
    let list = CFG.icons.filter(ic => only ? only.includes(ic.n) : (process.argv.includes('--force') || !state[ic.n]?.v));
    if (process.argv.includes('--next')) list = list.slice(0, 1);   // po jednej: JP ocenia, „ok” uruchamia następną
    for (const ic of list) {
      try { await one(ic); } catch (e) { log(`ikona ${ic.n}: ${e.message}`); if (/429|quota|RESOURCE_EXHAUSTED|403/.test(e.message)) { console.log(`STOP: ${e.message}`); break; } }
    }
  } else if (cmd === 'fix') {
    if (!a2) throw new Error('fix <N> "<uwagi>"');
    await one(icon(a1), a2);
  } else if (cmd === 'cut') {   // przerobienie istniejącej wersji na przezroczyste tło (bez generowania)
    const ic = icon(a1), s = state[ic.n];
    const f = join(WORK, `${String(ic.n).padStart(2, '0')}-${ic.slug}-v${s.v}.png`);
    const c = await py({ mode: 'cut', src: f, dst: f, title: ic.place });
    if (c.code !== 0) throw new Error(c.err.slice(-300));
    await upload(`🎨 **Quo #${ic.n} — ${ic.place}** · wersja ${s.v} na przezroczystym tle\nOdpisz: **ok ${ic.n}** albo **${ic.n}: co poprawić**.`, f);
  } else if (cmd === 'ok') {
    const ic = icon(a1), s = state[ic.n];
    if (!s?.v) throw new Error(`ikona ${ic.n} jeszcze nie wygenerowana`);
    const src = join(WORK, `${String(ic.n).padStart(2, '0')}-${ic.slug}-v${s.v}.png`);
    const pull = await run('sh', [REPO_SH, 'pull'], { timeout: 120_000 });
    if (pull.code !== 0) throw new Error(`repo: ${(pull.err || pull.out).slice(-300)}`);
    const r = await py({ mode: 'webp', src, base: join(REPO, 'media/icons/quo-' + ic.slug), title: ic.place });
    if (r.code !== 0) throw new Error(`WebP: ${r.err.slice(-300)}`);
    const pub = await run('sh', [REPO_SH, 'publish', `ikona Quo #${ic.n}: ${ic.place} (quo-${ic.slug}, 3 rozmiary WebP)`], { timeout: 5 * 60_000 });
    if (pub.code !== 0 || /BŁĄD/.test(pub.out)) throw new Error(`publikacja: ${(pub.err || pub.out).slice(-300)}`);
    s.status = 'ok'; s.accepted_at = new Date().toISOString(); save();
    const ch = await ensureChannel('quo-ikony', 'Grafiki');
    const { notify } = await import('./draft-lib.mjs');
    await notify(ch, `✅ Quo #${ic.n} (${ic.place}) zaakceptowana: media/icons/quo-${ic.slug}-128/256/512.webp. Wstawienie na stronę: Claude.`);
  } else if (cmd === 'watch') {
    // Hermes nie słucha #quo-ikony — cron co 2 min czyta odpowiedzi JP w kanale (JP 2026-10-25):
    // „ok 7” / „7 ok” / „ok7” → akceptacja; „7: uwagi” → poprawka; „następne” / „dalej” → kolejna niezaakceptowana; samo „ok” → ostatnia wrzucona.
    const LOCK = join(WORK, 'watch.lock');
    if (existsSync(LOCK) && Date.now() - statSync(LOCK).mtimeMs < 30 * 60_000) process.exit(0);
    writeFileSync(LOCK, String(process.pid));
    try {
      const ch = await ensureChannel('quo-ikony', 'Grafiki');
      const JP = env('QUOLINO_JP_DISCORD_ID') || '946118130709692476';
      // ostatnia przeczytana wiadomość w osobnym pliku: state.json zapisują procesy potomne (ok, fix, gen) — nie nadpisujemy ich zmian
      const last = existsSync(LAST_F) ? readFileSync(LAST_F, 'utf8').trim() : (state._last ?? '');
      const msgs = await (await fetch(`https://discord.com/api/v10/channels/${ch}/messages?limit=30${last ? `&after=${last}` : ''}`, { headers: { Authorization: `Bot ${TOKEN}` } })).json();
      const list = (Array.isArray(msgs) ? msgs : []).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
      const lastPosted = () => Object.entries(JSON.parse(readFileSync(STATE_F, 'utf8'))).filter(([k, v]) => /^\d+$/.test(k) && v.status === 'review').sort((a, b) => (a[1].history.at(-1)?.at > b[1].history.at(-1)?.at ? -1 : 1))[0]?.[0];
      const done = new Set();
      for (const m of list) {
        writeFileSync(LAST_F, m.id);
        if (m.author?.id !== JP) continue;
        const t = String(m.content || '').trim();
        let x;
        if ((x = t.match(/^(?:ok|akceptuj[eę]|zatwierdzam)\s*#?(\d+)$/i) || t.match(/^#?(\d+)\s*(?:ok|akceptuj[eę])$/i))) { if (!done.has('ok' + x[1])) { done.add('ok' + x[1]); await run('node', [join(DIR, 'quo-icons.mjs'), 'ok', x[1]], { timeout: 10 * 60_000 }); await run('node', [join(DIR, 'quo-icons.mjs'), 'gen', '--next'], { timeout: 10 * 60_000 }); } }
        else if (/^(ok|akceptuj[eę])$/i.test(t)) { const n = lastPosted(); if (n && !done.has('ok' + n)) { done.add('ok' + n); await run('node', [join(DIR, 'quo-icons.mjs'), 'ok', n], { timeout: 10 * 60_000 }); await run('node', [join(DIR, 'quo-icons.mjs'), 'gen', '--next'], { timeout: 10 * 60_000 }); } }
        else if ((x = t.match(/^#?(\d+)\s*[:.\-]\s*([\s\S]{3,})$/))) await run('node', [join(DIR, 'quo-icons.mjs'), 'fix', x[1], x[2].slice(0, 800)], { timeout: 10 * 60_000 });
        else if (/^(nast[eę]pne|dalej|generuj( dalej)?)$/i.test(t)) await run('node', [join(DIR, 'quo-icons.mjs'), 'gen', '--next'], { timeout: 10 * 60_000 });
      }
    } finally { try { (await import('node:fs')).unlinkSync(LOCK); } catch {} }
  } else {
    for (const ic of CFG.icons) console.log(`${String(ic.n).padStart(2)} ${ic.slug.padEnd(20)} ${state[ic.n]?.status ?? 'nie było'}${state[ic.n]?.v ? ' v' + state[ic.n].v : ''}`);
  }
} catch (e) { console.error('BŁĄD:', e.message); process.exitCode = 1; }
