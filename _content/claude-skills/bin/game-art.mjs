#!/usr/bin/env node
// Grafiki gry „Quo: Wyprawa” (zgoda JP 2026-10-31: „miałeś zlecić wykonanie nowych grafik”): Antigravity (abonament AI Pro, 0 $) generuje
// paczki z bin/game-art-data.mjs (bieg i skok Quo, panorama Spello, kafle Spello/Frasassi, drobiazgi), skrypt kroi je i wyrównuje,
// podgląd idzie do panelu admina (#/grafiki, ops.art_requests przez art-review.mjs; plik w gra/art/_review/) — JP klika
// Akceptuj / Popraw / Odrzuć (JP 2026-11-01); wątek „🎮 grafiki gry” w #ikony-miejsc dostaje powiadomienie z linkiem,
// a odpowiedź „ok” / uwagi w wątku działa dalej jako droga zapasowa.
//   node game-art.mjs gen <paczka|--next> [--force] [--wait-review]   generowanie (1 wywołanie Antigravity) → podgląd w wątku
//   node game-art.mjs fix <paczka> "uwagi JP"                          poprawka: poprzednia wersja + uwagi → nowa wersja
//   node game-art.mjs ok <paczka>                                      WebP → gra/art/<paczka>/ + gra/art/manifest.json → commit+push (repo.sh)
//   node game-art.mjs status
//   node game-art.mjs watch                                            decyzje JP z panelu + odpowiedzi w wątku (woła place-icons.mjs watch, cron co 2 min)
//   node game-art.mjs to-panel                                         zaległe (czekające na „ok” w wątku) → panel (raz, z art-review migrateOnce)
// Kod wyjścia 75 = „spróbuj później” (limit Antigravity, inny proces generuje, --wait-review i coś czeka na ocenę) — repo-jobs ponawia.
// Limit: CFG.maxCalls wywołań na wszystkie paczki razem (state.calls). Nigdy płatny model — tylko Antigravity.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { env, log, run, aiUsage, agyQuotaOut, agyQuotaHit, agyWeekCalls } from './lib.mjs';
import { ensureChannel, notify } from './draft-lib.mjs';
import CFG from './game-art-data.mjs';
import * as L from './game-art-lib.mjs';
import { pyRun, lastJson } from './game-art-img.mjs';
import * as AR from './art-review.mjs';

const DIR = new URL('.', import.meta.url).pathname;
const REPO = '/opt/data/repo/przewodnik', REPO_SH = '/opt/data/quolino/repo.sh', WORK = '/opt/data/quolino/work/game-art';
const AGY_LOCK = '/opt/data/quolino/work/place-icons/agy.lock';   // wspólna z ikonami miejsc: jeden proces Antigravity naraz
const TOKEN = env('DISCORD_BOT_TOKEN');
const EXIT_LATER = 75;
const argv = process.argv.slice(2);
const [cmd = 'status', a1, a2] = argv;
const flag = (n) => argv.includes(n);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
globalThis.__aiRole = () => 'grafiki gry';
mkdirSync(WORK, { recursive: true });

const ORDER = CFG.packs.map(p => p.name);
const packOf = (name) => CFG.packs.find(p => p.name === name) ?? (() => { throw new Error(`nie ma paczki „${name}” (są: ${ORDER.join(', ')})`); })();
const idxOf = (name) => ORDER.indexOf(name) + 1;

// ── stan: work/game-art/state.json; zapis „przeczytaj–zmień–zapisz” (gen/fix/ok w osobnych procesach) ──
const ST_F = join(WORK, 'state.json');
const loadState = () => readJson(ST_F) ?? { packs: {}, calls: [] };
function patchState(fn) { const st = loadState(); fn(st); st.packs ??= {}; st.calls ??= []; writeFileSync(ST_F, JSON.stringify(st, null, 2)); return st; }
const patchPack = (name, fn) => patchState(st => { fn(st.packs[name] ??= { history: [] }); });
const vDir = (name, v) => join(WORK, name, `v${v}`);

// ── Discord: wątek „🎮 grafiki gry” w #ikony-miejsc (osobny wątek, żeby place-icons watch nie brał odpowiedzi do siebie) ──
const api = async (method, path, body) => {
  const r = await fetch(`https://discord.com/api/v10${path}`, { method, headers: { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
};
async function thread() {
  if (!TOKEN) return null;
  const ch = await ensureChannel('ikony-miejsc', 'Grafiki');
  if (!ch) return null;
  const st = loadState();
  if (st.thread) {
    try {
      const t = await api('GET', `/channels/${st.thread}`);
      if (t.thread_metadata?.archived) await api('PATCH', `/channels/${st.thread}`, { archived: false });
      return st.thread;
    } catch (e) { log(`wątek grafik gry: ${e.message} — zakładam nowy`); }
  }
  try {
    const t = await api('POST', `/channels/${ch}/threads`, { name: `🎮 ${CFG.thread}`, type: 11, auto_archive_duration: 10080 });
    patchState(s => { s.thread = t.id; s.parent = ch; });
    await notify(t.id, '🎮 Tu trafiają grafiki gry „Quo: Wyprawa” (bieg i skok Quo, panorama Spello, kafle, drobiazgi). Odpowiadaj w tym wątku: **ok** / **ok quo-run** albo **quo-run: co poprawić**; **dalej** — następna paczka.');
    return t.id;
  } catch (e) { log(`wątek grafik gry: ${e.message} — piszę w kanale`); return ch; }
}
async function upload(text, files = []) {
  const ch = await thread();
  if (!ch) { log('Discord niedostępny'); return null; }
  const fd = new FormData();
  fd.append('payload_json', JSON.stringify({ content: text.slice(0, 1900), allowed_mentions: { parse: [] } }));
  files.forEach(([p, name], i) => fd.append(`files[${i}]`, new Blob([readFileSync(p)], { type: name.endsWith('.gif') ? 'image/gif' : name.endsWith('.jpg') ? 'image/jpeg' : 'image/png' }), name));
  const r = await fetch(`https://discord.com/api/v10/channels/${ch}/messages`, { method: 'POST', headers: { Authorization: `Bot ${TOKEN}` }, body: fd }).catch(e => ({ ok: false, status: 0, text: async () => e.message }));
  if (!r.ok) { log('Discord upload:', r.status, await r.text()); return null; }
  return (await r.json().catch(() => ({}))).id ?? null;
}
const say = async (text) => { const ch = await thread(); if (ch) await notify(ch, text); else log(text); };

// ── Antigravity (ten sam mechanizm co quo-icons / place-icons: pusty katalog, bez kluczy API) ──
const AGY = '/opt/data/home/.local/bin/agy', BRAIN = '/opt/data/home/.gemini/antigravity-cli/brain', GQ = '/tmp/gq/game';
const QUOTA_RE = /quota reached|upgrade your subscription|RESOURCE_EXHAUSTED|Resets in\s*\d/i;
class QuotaError extends Error {}
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
  const ask = `Use the image generator to create exactly one image named ${name}. Reference images: ${refs.map((p, i) => `${p} (${labels[i] ?? 'reference'})`).join(', ')}.\n${prompt}\nWhen the image is created, reply DONE.`;
  const t0 = Date.now();
  const envv = { ...process.env, HOME: '/opt/data/home' }; delete envv.GOOGLE_API_KEY; delete envv.GEMINI_API_KEY;
  const p = spawn(AGY, ['-p', ask], { cwd: GQ, env: envv, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', closedAt = 0;
  const take = (d) => { out = (out + d).slice(-20_000); };
  p.stdout.on('data', take); p.stderr.on('data', take);
  p.on('close', () => { closedAt = Date.now(); });
  p.on('error', (e) => { out += `\n${e.message}`; closedAt = Date.now(); });
  patchState(s => { s.calls.push(new Date().toISOString()); });   // liczymy próbę (limit tygodniowy liczy też nieudane)
  try {
    for (let i = 0; i < 72; i++) {   // do 6 minut
      await sleep(5000);
      const f = findNew(BRAIN, name.toLowerCase(), t0);
      if (f) { await sleep(2000); aiUsage({ provider: 'gemini', model: 'Antigravity (AI Pro) obraz', role: 'grafiki gry', billing: 'abonament' }); return readFileSync(f); }
      if (QUOTA_RE.test(out)) throw new QuotaError(`limit Antigravity: ${out.match(/[^\n]*(quota|Resets in|RESOURCE_EXHAUSTED)[^\n]*/i)?.[0]?.slice(0, 300) ?? out.slice(-300)}`);
      if (closedAt && Date.now() - closedAt > 15_000) throw new Error(`Antigravity zakończył bez obrazu: ${out.trim().slice(-300) || '(bez komunikatu)'}`);
    }
    throw new Error('Antigravity nie zapisał obrazu w 6 min');
  } finally { try { p.kill('SIGKILL'); } catch {} for (const r of refs) try { unlinkSync(r); } catch {} }
}
const isQuota = (e) => e instanceof QuotaError || QUOTA_RE.test(String(e?.message));

// ── blokada Antigravity (wspólna z place-icons.mjs) ──
function lock() {
  mkdirSync(join(AGY_LOCK, '..'), { recursive: true });
  if (existsSync(AGY_LOCK)) {
    const pid = +readFileSync(AGY_LOCK, 'utf8').trim();
    let alive = false; try { process.kill(pid, 0); alive = true; } catch {}
    if (alive && pid !== process.pid && Date.now() - statSync(AGY_LOCK).mtimeMs < 60 * 60_000) return false;
  }
  writeFileSync(AGY_LOCK, String(process.pid));
  process.on('exit', () => { try { if (readFileSync(AGY_LOCK, 'utf8').trim() === String(process.pid)) unlinkSync(AGY_LOCK); } catch {} });
  return true;
}
const quotaMsg = (at) => `limit Antigravity (AI Pro) wyczerpany do ${at.slice(0, 16).replace('T', ' ')} UTC`;

// ── obróbka: surowy obraz → podgląd + meta (klatki wyrównane, kafle 256, panorama 2048×1152) ──
async function py(job) {
  const r = await pyRun({ title: job.title, ...job });
  if (r.code !== 0) throw new Error(`obróbka (${job.mode}): ${r.err.slice(-400)}`);
  return lastJson(r.out);
}
async function processPack(pack, raw, dir) {
  const warn = [];
  if (pack.kind === 'panorama') {
    const r = await py({ mode: 'pano', src: raw, dst: join(dir, 'pano.png'), preview: join(dir, 'preview.jpg'), w: 2048, h: 1152, title: pack.title });
    if (r.upscaled) warn.push(`obraz z Antigravity miał ${r.src.join('×')} px — powiększony do 2048×1152 (może być miękki)`);
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ w: r.w, h: r.h, src: r.src }, null, 1));
    return { files: [[join(dir, 'preview.jpg'), `${pack.name}.jpg`]], warn };
  }
  const tol = pack.bg === 'magenta' ? 70 : 48;
  const sl = await py({ mode: 'slice', src: raw, outDir: join(dir, 'cells'), tol, expect: pack.expect, grid: pack.grid, shadow: pack.kind === 'frames', measure: pack.kind === 'frames' });
  if (sl.count !== pack.expect) warn.push(`znalazłem ${sl.count} elementów zamiast ${pack.expect} (krojenie: ${sl.how}) — sprawdź kolejność`);
  if (sl.bg !== 'alpha' && sl.transparent < 0.2) warn.push(`tło prawie się nie wycięło (${Math.round(sl.transparent * 100)}% przezroczyste, tło ${sl.bg})`);
  const cells = sl.cells.slice(0, pack.expect);
  if (!cells.length) throw new Error('nic nie wycięte z obrazu');
  if (pack.kind === 'frames') {
    const plan = L.framePlan(cells.map(c => ({ w: c.w, h: c.h, cx: c.cx, head: c.head })));
    const minH = Math.min(...cells.map(c => c.h));
    if (minH < 220) warn.push(`klatki małe w źródle (najniższa ${minH} px) — w 512 px mogą być miękkie`);
    const layout = L.contactLayout(cells.length, { cell: 256, cols: 4 });
    await py({ mode: 'compose', frames: cells.map(c => c.path), plan, layout, outDir: dir, names: pack.frameNames, ms: pack.role === 'run' ? 85 : 220, title: pack.title });
    const hs = plan.frames.map(f => f.h).sort((a, b) => a - b);
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ frames: plan.frames, baseline: plan.baseline, scale: plan.scale, quoH: hs[Math.floor(hs.length / 2)], how: sl.how }, null, 1));
    return { files: [[join(dir, 'contact.png'), `${pack.name}-klatki.png`], [join(dir, 'anim.gif'), `${pack.name}-animacja.gif`]], warn };
  }
  const items = pack.items.slice(0, cells.length);
  await py({ mode: pack.kind, cells: cells.map(c => c.path), items, fit: pack.fit, seamless: pack.seamless, outDir: dir, size: 256, title: pack.title });
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ items, how: sl.how }, null, 1));
  return { files: [[join(dir, 'contact.png'), `${pack.name}.png`]], warn };
}

// panel admina (JP 2026-11-01): pliki podglądu wersji (te same, co szły do wątku) i wiersz w ops.art_requests
const reviewFiles = (pack, dir) => pack.kind === 'panorama' ? [join(dir, 'preview.jpg')] : pack.kind === 'frames' ? [join(dir, 'contact.png'), join(dir, 'anim.gif')] : [join(dir, 'contact.png')];
const reviewTitle = (pack) => `${pack.title} (${pack.name})`;
const reviewRow = (pack, v, rv, { notes = null, warn = null, onlyNew = false } = {}) => AR.requestReview({ kind: 'game_art', key: pack.name, title: reviewTitle(pack), version: v,
  preview: rv.preview, more: rv.more, inputs: AR.inputsFromRepo(pack.refs, pack.labels), onlyNew,
  meta: { pack: pack.name, kind: pack.kind, idx: idxOf(pack.name), notes, warn, budget_left: L.budgetLeft(loadState(), CFG.maxCalls), hint: pack.hint ?? null } });
// to-panel: paczki czekające na „ok” w wątku „🎮 grafiki gry” → panel (#/grafiki); jeden commit z podglądami. Kod 75 = baza/repo niedostępne.
async function cmdToPanel() {
  if (!(await AR.ready())) { console.error('panel grafik niedostępny — spróbuję później'); return EXIT_LATER; }
  const todo = AR.backlog(Object.entries(loadState().packs ?? {})).map(([name, s]) => {
    const pack = CFG.packs.find(p => p.name === name), files = pack ? reviewFiles(pack, vDir(name, s.v)) : [];
    return pack && existsSync(files[0]) ? { pack, s, files } : null;
  }).filter(Boolean);
  if (!todo.length) { console.log('to-panel: grafiki gry — nic zaległego'); return 0; }
  if (!(await AR.pullRepo(REPO_SH))) return EXIT_LATER;
  const done = [];
  for (const t of todo) {
    const rv = await AR.publishPreview({ repo: REPO, repoSh: REPO_SH, src: t.files[0], kind: 'game_art', key: t.pack.name, v: t.s.v, title: reviewTitle(t.pack), more: t.files.slice(1), sync: false });
    if (rv) done.push({ ...t, rv });
  }
  if (!done.length || !(await AR.publishRepo(REPO_SH, `podglądy ${done.length} paczek grafik gry do akceptacji w panelu (przeniesienie z Discorda)`))) return EXIT_LATER;
  let n = 0, code = 0;
  for (const t of done) {
    const h = t.s.history?.at(-1) ?? {};
    const rid = await reviewRow(t.pack, t.s.v, t.rv, { notes: h.notes ?? null, warn: Array.isArray(h.warn) ? h.warn.join(' · ') || null : h.warn ?? null, onlyNew: true });
    if (rid) { patchPack(t.pack.name, x => { x.review_id = rid; }); n++; } else code = EXIT_LATER;
  }
  console.log(`to-panel: grafiki gry — przeniesione ${n} z ${todo.length}`);
  if (n) await say(AR.migratedLine(n === 1 ? 'paczkę grafik gry' : 'paczek grafik gry', n)).catch(() => {});
  return code;
}

// jedna wersja paczki: Antigravity → raw.png → obróbka → wątek
async function one(pack, notes = null) {
  const st = loadState(), s = st.packs[pack.name] ?? {};
  const left = L.budgetLeft(st, CFG.maxCalls);
  if (left <= 0) throw new Error(`wyczerpany limit grafik gry (${CFG.maxCalls} wywołań Antigravity) — więcej tylko po zgodzie JP (maxCalls w game-art-data.mjs)`);
  const refs = pack.refs.map(p => join(REPO, p));
  for (const r of refs) if (!existsSync(r)) throw new Error(`brak referencji ${r} (sh repo.sh pull)`);
  const prevDir = s.v ? vDir(pack.name, s.v) : null, prevRaw = prevDir && join(prevDir, 'raw.png');
  const withPrev = !!(notes && prevRaw && existsSync(prevRaw));
  const images = [...refs, ...(withPrev ? [prevRaw] : [])];
  const labels = [...pack.labels, ...(withPrev ? ['the previous attempt'] : [])];
  let prompt = `${pack.prompt}\nImage aspect ratio ${pack.aspect ?? '16:9'}, high resolution.`;
  if (withPrev) prompt += `\n\nThe last reference image is the previous attempt. Keep what works in it and apply these corrections from the art director (Polish): ${notes}`;
  const v = (s.v ?? 0) + 1, dir = vDir(pack.name, v);
  mkdirSync(dir, { recursive: true });
  log(`${pack.name}: generuję v${v}${notes ? ' (poprawka)' : ''}`);
  const buf = await generateAgy(prompt, images, labels, `quolino_game_${pack.name.replace(/-/g, '_')}_v${v}`);
  const raw = join(dir, 'raw.png');
  if (buf[0] === 0x89 && buf[1] === 0x50) writeFileSync(raw, buf);
  else { writeFileSync(raw + '.src', buf); await py({ mode: 'png', src: raw + '.src', dst: raw }); unlinkSync(raw + '.src'); }
  const { files, warn } = await processPack(pack, raw, dir);
  const now = new Date().toISOString();
  patchPack(pack.name, x => { x.v = v; x.status = 'review'; x.pending_notes = null; x.errors = 0; x.posted_at = now; (x.history ??= []).push({ v, at: now, notes, warn }); });
  const warnTxt = warn.join(' · ') || null, title = `${pack.title} (${pack.name})`;
  // JP 2026-11-01: akceptacja w panelu — podgląd (arkusz / panorama + gif animacji) do repo, wiersz pending; w wątku tylko link do panelu
  const rv = await AR.publishPreview({ repo: REPO, repoSh: REPO_SH, src: files[0][0], kind: 'game_art', key: pack.name, v, title, more: files.slice(1).map(f => f[0]) });
  const rid = rv && await reviewRow(pack, v, rv, { notes, warn: warnTxt });
  const id = rid
    ? await upload(AR.notifyLine(title, { v, warn: warnTxt }), files.slice(0, 1))
    : await upload(L.caption(pack, idxOf(pack.name), { v, notes, warn: warnTxt, budget: L.budgetLeft(loadState(), CFG.maxCalls) }), files);
  patchPack(pack.name, x => { if (id) x.msgs = [...(x.msgs ?? []), id].slice(-20); x.review_id = rid ?? null; });
}
async function onGenError(pack, e, notes = null) {
  if (isQuota(e)) {
    agyQuotaHit(e.message);
    patchPack(pack.name, x => { x.status = notes ? 'fix-pending' : 'queued'; if (notes) x.pending_notes = notes; });
    await say(`⏸️ ${pack.name}: ${quotaMsg(agyQuotaOut() ?? new Date().toISOString())}. Wygeneruję sam po odnowieniu limitu.`);
    return EXIT_LATER;
  }
  log(`${pack.name}: ${e.message}`);
  patchPack(pack.name, x => { x.errors = (x.errors ?? 0) + 1; x.last_error = e.message.slice(0, 300); if (notes) { x.pending_notes = notes; } });
  await say(`⚠️ ${pack.name} nie wygenerował się: ${e.message.slice(0, 300)}. Napisz **${pack.name}: uwagi…** albo **dalej**, żeby spróbować jeszcze raz.`);
  return 1;
}

// ── komendy ──
async function cmdGen(name) {
  const st = loadState();
  if (name === '--next' || !name) { name = L.nextPack(ORDER, st); if (!name) { log('wszystkie paczki wygenerowane'); return 0; } }
  const pack = packOf(name), s = st.packs[name];
  if (s?.status === 'ok' && !flag('--force')) { log(`${name}: już zaakceptowana`); return 0; }
  if (s?.v && s.status !== 'queued' && !flag('--force')) { log(`${name}: już jest v${s.v} (${s.status}) — poprawki: fix, nowa wersja: --force`); return 0; }
  if (flag('--wait-review')) { const w = L.waitingReview(st).filter(k => k !== name); if (w.length) { log(`${name}: czeka — JP ocenia ${w.join(', ')}`); return EXIT_LATER; } }
  if (agyQuotaOut()) { patchPack(name, x => { x.status = x.v ? x.status : 'queued'; }); log(`${name}: ${quotaMsg(agyQuotaOut())}`); return EXIT_LATER; }
  if (!lock()) { log(`${name}: inny proces generuje (agy.lock) — później`); return EXIT_LATER; }
  try { await one(pack); return 0; } catch (e) { return onGenError(pack, e); }
}
async function cmdFix(name, notes) {
  if (!notes) throw new Error('fix <paczka> "uwagi"');
  const pack = packOf(name);
  await AR.closePending('game_art', name, 'fix', `uwagi spoza panelu (Discord/konsola): ${notes.slice(0, 200)}`);
  if (agyQuotaOut() || !lock()) {
    patchPack(name, x => { x.pending_notes = notes.slice(0, 800); x.status = 'fix-pending'; });
    await say(`🕓 Poprawka ${name} zapisana: „${notes.slice(0, 200)}”. ${agyQuotaOut() ? quotaMsg(agyQuotaOut()) + ' — wygeneruję po odnowieniu.' : 'Teraz generuje się coś innego — zrobię ją za kilka minut.'}`);
    return 0;
  }
  try { await one(pack, notes.slice(0, 800)); return 0; } catch (e) { return onGenError(pack, e, notes.slice(0, 800)); }
}
async function cmdOk(name) {
  const pack = packOf(name), s = loadState().packs[name];
  if (!s?.v) throw new Error(`${name}: jeszcze nie wygenerowana`);
  const dir = vDir(name, s.v), meta = readJson(join(dir, 'meta.json'));
  if (!meta) throw new Error(`${name}: brak ${dir}/meta.json`);
  const pull = await run('sh', [REPO_SH, 'pull'], { timeout: 120_000 });
  if (pull.code !== 0) throw new Error(`repo: ${(pull.err || pull.out).slice(-300)}`);
  const out = join(REPO, L.ART_DIR, name);
  mkdirSync(out, { recursive: true });
  const desc = `Grafika gry Quo: Wyprawa (${pack.title}). AI + redakcja Quolino.`;
  if (pack.kind === 'frames') await py({ mode: 'webp', src: join(dir, 'sheet.png'), base: join(out, pack.role), sizes: L.QUO_SIZES, by: 'height', title: pack.title, desc });
  else if (pack.kind === 'panorama') await py({ mode: 'webp', src: join(dir, 'pano.png'), base: join(out, pack.place), sizes: [1024, 2048], by: 'width', alpha: false, q: 86, title: pack.title, desc });
  else for (const it of meta.items) await py({ mode: 'webp', src: join(dir, `${it}.png`), base: join(out, it), sizes: pack.kind === 'tiles' ? L.TILE_SIZES : L.PROP_SIZES, title: `${pack.title}: ${it}`, desc });
  const at = new Date().toISOString();
  const entry = L.packEntry(pack.kind === 'tiles' || pack.kind === 'props' ? { ...pack, items: meta.items } : pack, meta, { v: s.v, at });
  const MF = join(REPO, L.MANIFEST);
  writeFileSync(MF, JSON.stringify(L.mergeManifest(readJson(MF), entry), null, 1) + '\n');
  const pub = await run('sh', [REPO_SH, 'publish', `grafika gry: ${pack.title} (${name} v${s.v}, gra/art/${name}/ + manifest)`], { timeout: 5 * 60_000 });
  if (pub.code !== 0 || /BŁĄD/.test(pub.out)) throw new Error(`publikacja: ${(pub.err || pub.out).slice(-300)}`);
  patchPack(name, x => { x.status = 'ok'; x.accepted_at = at; x.accepted_v = s.v; });
  await AR.closePending('game_art', name, 'accepted', 'ok spoza panelu (Discord/konsola) — w grze');
  await say(`✅ ${name} (${pack.title}) w grze: gra/art/${name}/ + gra/art/manifest.json. Strona odświeży się w 1–3 min.`);
  return 0;
}
function cmdStatus() {
  const st = loadState(), q = agyQuotaOut();
  console.log(`Antigravity: ${q ? quotaMsg(q) : 'dostępny'}; wywołań w 7 dni (wszystkie skrypty): ${agyWeekCalls()}; grafiki gry: ${L.callsUsed(st)}/${CFG.maxCalls}`);
  console.log(`wątek: ${st.thread ?? '(jeszcze nie ma)'}`);
  for (const p of CFG.packs) {
    const s = st.packs[p.name] ?? {};
    console.log(`${String(idxOf(p.name)).padStart(2)} ${p.name.padEnd(16)} ${String(s.status ?? 'nie było').padEnd(12)} ${s.v ? 'v' + s.v : '  '}${s.pending_notes ? ` · czeka poprawka: ${s.pending_notes.slice(0, 60)}` : ''}${s.last_error && s.status !== 'ok' ? ` · błąd: ${s.last_error.slice(0, 80)}` : ''}  ${p.title}`);
  }
  return 0;
}
// decyzje JP z panelu admina (#/grafiki): accepted → ok (+ następna paczka), fix → fix z uwagami, rejected → paczka stoi do nowego polecenia
async function pollPanel(me) {
  return AR.poll('game_art', {
    ok: async (row) => {
      const x = await me('ok', row.key);
      if (x.code) throw new Error((x.err || x.out).trim().slice(-300) || 'ok nie przeszło');
      if (!agyQuotaOut()) await me('gen', '--next');
      return `w grze (v${row.version})`;
    },
    fix: async (row, notes) => {
      await say(`🔧 Poprawka z panelu ${row.key}: „${notes.slice(0, 200)}”. Generuję nową wersję (ok. 1–3 min).`);
      const x = await me('fix', row.key, notes);   // błąd/limit: fix sam zapisał pending_notes, watch ponowi — nie powtarzamy z poll
      return x.code && x.code !== EXIT_LATER ? 'poprawka zapisana, generowanie ponowi watch' : 'nowa wersja wygenerowana';
    },
    reject: async (row, notes) => {
      patchPack(row.key, x => { x.status = 'rejected'; x.rejected_at = new Date().toISOString(); x.reject_note = notes; x.pending_notes = null; });
      await say(`🚫 ${row.key} (${row.title}) odrzucona w panelu${notes ? `: „${notes.slice(0, 200)}”` : ''}. Nie generuję dalej — nowa wersja tylko na polecenie (**${row.key}: uwagi…** albo gen ${row.key} --force).`);
      return 'odrzucona';
    }
  }, { say });
}
async function cmdWatch() {
  const WLOCK = join(WORK, 'watch.lock'), LAST_F = join(WORK, 'watch-last.txt');
  if (existsSync(WLOCK) && Date.now() - statSync(WLOCK).mtimeMs < 30 * 60_000) return 0;
  writeFileSync(WLOCK, String(process.pid));
  const me = (...a) => run('node', [join(DIR, 'game-art.mjs'), ...a.map(String)], { timeout: 15 * 60_000 }).then(r => { if (r.code && r.code !== EXIT_LATER) log(`${a.join(' ')}: ${(r.err || r.out).slice(-300)}`); return r; });
  try {
    try { await pollPanel(me); } catch (e) { log(`decyzje z panelu: ${e.message}`); }
    const st0 = loadState();
    if (st0.thread && TOKEN) {
      const JP = env('QUOLINO_JP_DISCORD_ID') || '946118130709692476';
      const last = existsSync(LAST_F) ? readFileSync(LAST_F, 'utf8').trim() : '';
      const msgs = await (await fetch(`https://discord.com/api/v10/channels/${st0.thread}/messages?limit=30${last ? `&after=${last}` : ''}`, { headers: { Authorization: `Bot ${TOKEN}` } })).json().catch(() => []);
      const list = (Array.isArray(msgs) ? msgs : []).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
      const done = new Set();
      for (const m of list) {
        writeFileSync(LAST_F, m.id);
        if (m.author?.id !== JP) continue;
        const r = L.parseReply(m.content, ORDER);
        if (!r) continue;
        const st = loadState();
        const viaReply = m.message_reference?.message_id && Object.entries(st.packs).find(([, s]) => (s.msgs ?? []).includes(m.message_reference.message_id))?.[0];
        const target = r.pack ?? viaReply ?? L.lastPosted(st);
        if (r.type === 'unknown') { await say(`❓ Nie znam paczki „${r.word}”. Paczki: ${ORDER.map((p, i) => `${i + 1}. ${p}`).join(', ')}.`); continue; }
        if (r.type === 'next') { if (agyQuotaOut()) await say(`⏸️ ${quotaMsg(agyQuotaOut())} — następną paczkę wygeneruję po odnowieniu.`); else await me('gen', '--next'); continue; }
        if (!target) { await say('❓ Nie wiem, której paczki dotyczy odpowiedź — napisz np. **ok quo-run** albo **quo-run: uwagi…**.'); continue; }
        if (r.type === 'ok' || r.type === 'ok-last') {
          if (done.has('ok' + target)) continue; done.add('ok' + target);
          const x = await me('ok', target);
          if (x.code) { await say(`⚠️ Akceptacja ${target} nie przeszła: ${(x.err || x.out).trim().slice(-300)}`); continue; }
          if (!agyQuotaOut()) await me('gen', '--next');
        } else if (r.type === 'fix' || r.type === 'fix-last') {
          await say(`🔧 Poprawka ${target} przyjęta: „${r.notes.slice(0, 200)}”. Generuję nową wersję (ok. 1–3 min).`);
          await me('fix', target, r.notes.slice(0, 800));
        }
      }
    }
    // zaległe: poprawki i paczki odłożone przez limit — jedna na przebieg, gdy Antigravity wolny
    if (!agyQuotaOut()) {
      const st = loadState();
      const pend = ORDER.find(p => st.packs[p]?.status === 'fix-pending' && st.packs[p]?.pending_notes && (st.packs[p].errors ?? 0) < 3);
      const queued = ORDER.find(p => st.packs[p]?.status === 'queued');
      if (pend) await me('fix', pend, st.packs[pend].pending_notes);
      else if (queued) await me('gen', queued);
    }
  } finally { try { unlinkSync(WLOCK); } catch {} }
  return 0;
}

try {
  let code = 0;
  if (cmd === 'gen') code = await cmdGen(a1);
  else if (cmd === 'fix') code = await cmdFix(a1, a2);
  else if (cmd === 'ok') code = await cmdOk(a1);
  else if (cmd === 'watch') code = await cmdWatch();
  else if (cmd === 'to-panel') code = await cmdToPanel();
  else if (cmd === 'status') code = cmdStatus();
  else { console.error('komendy: gen | fix | ok | status | watch | to-panel (opis na początku game-art.mjs)'); code = 2; }
  process.exitCode = code;
} catch (e) { console.error('BŁĄD:', e.message); process.exitCode = 1; }
