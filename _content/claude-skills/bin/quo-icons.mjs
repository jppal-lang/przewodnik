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
const STATE_F = join(WORK, 'state.json');
const state = existsSync(STATE_F) ? JSON.parse(readFileSync(STATE_F, 'utf8')) : {};
const save = () => writeFileSync(STATE_F, JSON.stringify(state, null, 2));
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
  save();
  await upload(`🎨 **Quo #${ic.n} — ${ic.place}** · wersja ${s.v}${notes ? ` (poprawki: ${notes.slice(0, 200)})` : ''}\nOdpisz: **ok ${ic.n}** albo **${ic.n}: co poprawić**.`, f);
  return f;
}

try {
  if (cmd === 'gen') {
    const only = opt('--only')?.split(',').map(Number);
    const list = CFG.icons.filter(ic => only ? only.includes(ic.n) : (process.argv.includes('--force') || !state[ic.n]?.v));
    for (const ic of list) {
      try { await one(ic); } catch (e) { log(`ikona ${ic.n}: ${e.message}`); if (/429|quota|RESOURCE_EXHAUSTED|403/.test(e.message)) { console.log(`STOP: ${e.message}`); break; } }
    }
  } else if (cmd === 'fix') {
    if (!a2) throw new Error('fix <N> "<uwagi>"');
    await one(icon(a1), a2);
  } else if (cmd === 'ok') {
    const ic = icon(a1), s = state[ic.n];
    if (!s?.v) throw new Error(`ikona ${ic.n} jeszcze nie wygenerowana`);
    const src = join(WORK, `${String(ic.n).padStart(2, '0')}-${ic.slug}-v${s.v}.png`);
    const pull = await run('sh', [REPO_SH, 'pull'], { timeout: 120_000 });
    if (pull.code !== 0) throw new Error(`repo: ${(pull.err || pull.out).slice(-300)}`);
    const py = `from PIL import Image\nim=Image.open(${JSON.stringify(src)}).convert('RGBA')\nfor s in (128,256,512):\n  im.resize((s,s),Image.LANCZOS).save(${JSON.stringify(join(REPO, 'media/icons/quo-' + ic.slug))}+f'-{s}.webp','WEBP',quality=88,method=6)\n`;
    const r = await run('python3', ['-c', py], { timeout: 60_000 });
    if (r.code !== 0) throw new Error(`WebP: ${r.err.slice(-300)}`);
    const pub = await run('sh', [REPO_SH, 'publish', `ikona Quo #${ic.n}: ${ic.place} (quo-${ic.slug}, 3 rozmiary WebP)`], { timeout: 5 * 60_000 });
    if (pub.code !== 0 || /BŁĄD/.test(pub.out)) throw new Error(`publikacja: ${(pub.err || pub.out).slice(-300)}`);
    s.status = 'ok'; s.accepted_at = new Date().toISOString(); save();
    const ch = await ensureChannel('quo-ikony', 'Grafiki');
    const { notify } = await import('./draft-lib.mjs');
    await notify(ch, `✅ Quo #${ic.n} (${ic.place}) zaakceptowana: media/icons/quo-${ic.slug}-128/256/512.webp. Wstawienie na stronę: Claude.`);
  } else {
    for (const ic of CFG.icons) console.log(`${String(ic.n).padStart(2)} ${ic.slug.padEnd(20)} ${state[ic.n]?.status ?? 'nie było'}${state[ic.n]?.v ? ' v' + state[ic.n].v : ''}`);
  }
} catch (e) { console.error('BŁĄD:', e.message); process.exitCode = 1; }
