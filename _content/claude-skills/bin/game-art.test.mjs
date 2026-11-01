// Grafiki gry „Quo: Wyprawa” — testy bez sieci i bez Antigravity: node --test bin/game-art.test.mjs
// Dane paczek, odpowiedzi JP, plan wyrównania klatek, manifest (zapis skryptu ↔ odczyt gry gra/art.js), zlecenia, obróbka obrazów (Pillow).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import CFG from './game-art-data.mjs';
import * as L from './game-art-lib.mjs';
import { pyRun, lastJson } from './game-art-img.mjs';
import * as RJ from './repo-jobs.mjs';

const ROOT = new URL('../../../', import.meta.url).pathname;
const Q = createRequire(import.meta.url)(join(ROOT, 'gra/art.js'));
const ORDER = CFG.packs.map(p => p.name);

test('dane paczek: kolejność JP, nazwy, referencje w repo, liczby klatek i siatki', () => {
  assert.deepEqual(ORDER, ['quo-run', 'quo-jump', 'spello-panorama', 'tiles-spello', 'tiles-frasassi', 'props']);
  assert.ok(CFG.maxCalls <= 50);
  assert.equal(new Set(ORDER).size, ORDER.length);
  for (const p of CFG.packs) {
    assert.ok(L.safeName(p.name), p.name);
    assert.equal(p.labels.length, p.refs.length, `${p.name}: etykieta na każdą referencję`);
    for (const r of p.refs) assert.ok(existsSync(join(ROOT, r)), `${p.name}: brak ${r}`);
    assert.match(p.prompt, /no text|No text/i);
    if (p.kind !== 'panorama') { assert.ok(p.grid[0] * p.grid[1] >= p.expect, p.name); assert.ok(['white', 'magenta'].includes(p.bg)); }
    if (p.kind === 'frames') assert.equal(p.frameNames.length, p.expect, p.name);
    if (p.kind === 'tiles' || p.kind === 'props') assert.equal(p.items.length, p.expect, p.name);
  }
  assert.equal(CFG.packs.find(p => p.name === 'quo-run').expect, 8);
  assert.deepEqual(CFG.packs.find(p => p.name === 'quo-jump').frameNames, ['takeoff', 'apex', 'fall', 'land']);
  assert.match(CFG.packs.find(p => p.name === 'spello-panorama').prompt, /no people/i);
  for (const p of CFG.packs.filter(p => p.kind === 'frames')) assert.match(p.prompt, /no shadow/i);
});

test('odpowiedzi JP: ok, ok z nazwą lub numerem, uwagi, dalej', () => {
  assert.deepEqual(L.parseReply('ok', ORDER), { type: 'ok-last' });
  assert.deepEqual(L.parseReply('OK quo-run', ORDER), { type: 'ok', pack: 'quo-run' });
  assert.deepEqual(L.parseReply('quo-jump ok', ORDER), { type: 'ok', pack: 'quo-jump' });
  assert.deepEqual(L.parseReply('ok 3', ORDER), { type: 'ok', pack: 'spello-panorama' });
  assert.deepEqual(L.parseReply('ok bieg', ORDER), { type: 'unknown', word: 'bieg' });
  assert.deepEqual(L.parseReply('quo-run: ogon wyżej, chusta czerwona', ORDER), { type: 'fix', pack: 'quo-run', notes: 'ogon wyżej, chusta czerwona' });
  assert.deepEqual(L.parseReply('tiles-spello mniej trawy', ORDER), { type: 'fix', pack: 'tiles-spello', notes: 'mniej trawy' });
  assert.deepEqual(L.parseReply('2 mniejsze odbicie', ORDER), { type: 'fix', pack: 'quo-jump', notes: 'mniejsze odbicie' });
  assert.deepEqual(L.parseReply('dalej', ORDER), { type: 'next' });
  assert.deepEqual(L.parseReply('za ciemne niebo', ORDER), { type: 'fix-last', notes: 'za ciemne niebo' });
  assert.equal(L.parseReply('  ', ORDER), null);
});

test('stan: ostatnio wrzucona, następna paczka, czekające na ocenę, limit wywołań', () => {
  const st = { packs: { 'quo-run': { v: 1, status: 'ok' }, 'quo-jump': { v: 2, status: 'review', posted_at: '2026-11-01T10:00:00Z' }, props: { v: 1, status: 'review', posted_at: '2026-11-01T09:00:00Z' } }, calls: ['a', 'b', 'c'] };
  assert.equal(L.lastPosted(st), 'quo-jump');
  assert.equal(L.nextPack(ORDER, st), 'spello-panorama');
  assert.deepEqual(L.waitingReview(st).sort(), ['props', 'quo-jump']);
  assert.equal(L.budgetLeft(st, 50), 47);
  assert.equal(L.budgetLeft({ calls: Array(60).fill('x') }, 50), 0);
  assert.equal(L.nextPack(ORDER, { packs: {} }), 'quo-run');
});

test('plan klatek: jedna skala, stopy na wspólnej linii, środek sylwetki na środku, wszystko mieści się w klatce', () => {
  const boxes = [{ w: 300, h: 400, cx: 140, head: [200, 60] }, { w: 360, h: 340, cx: 180 }, { w: 280, h: 420, cx: 150 }];
  const p = L.framePlan(boxes);
  assert.equal(p.size, 512);
  for (const [i, f] of p.frames.entries()) {
    assert.equal(f.y + f.h, p.baseline, `klatka ${i}: stopy na linii`);
    assert.ok(Math.abs(f.x + boxes[i].cx * p.scale - 256) <= 1, `klatka ${i}: środek`);
    assert.ok(f.x >= 0 && f.x + f.w <= 512 && f.y >= 0, `klatka ${i}: w kadrze`);
    assert.ok(Math.abs(f.h / boxes[i].h - p.scale) < 0.01, 'ta sama skala');
  }
  assert.deepEqual(p.frames[0].head, [Math.round(p.frames[0].x + 200 * p.scale), Math.round(p.frames[0].y + 60 * p.scale)]);
  assert.equal(p.frames[1].head, null);
  assert.throws(() => L.framePlan([]), /brak klatek/);
  assert.throws(() => L.framePlan([{ w: 0, h: 10 }]), /wymiarów/);
});

test('arkusz kontaktowy: komórki nie nachodzą na siebie, rozmiar obejmuje wszystkie', () => {
  const l = L.contactLayout(8, { cell: 256, cols: 4 });
  assert.equal(l.cells.length, 8);
  for (const c of l.cells) assert.ok(c.x + c.w <= l.W && c.ly + 28 <= l.H);
  assert.ok(l.cells[4].y > l.cells[0].y + 256);
  assert.equal(L.contactLayout(3, { cols: 4 }).cells.length, 3);
});

// wpisy tak, jak zapisuje je „ok”
function sampleManifest() {
  const P = Object.fromEntries(CFG.packs.map(p => [p.name, p]));
  const fr = (n) => ({ frames: Array.from({ length: n }, (_, i) => ({ x: 100, y: 100, w: 300, h: 371, head: [300, 160 + i] })), baseline: 471, quoH: 371 });
  let m = null;
  m = L.mergeManifest(m, L.packEntry(P['quo-run'], fr(8), { v: 2, at: '2026-11-01T10:00:00Z' }));
  m = L.mergeManifest(m, L.packEntry(P['quo-jump'], fr(4), { v: 1 }));
  m = L.mergeManifest(m, L.packEntry(P['spello-panorama'], { w: 2048, h: 1152 }));
  m = L.mergeManifest(m, L.packEntry(P['tiles-spello'], { items: P['tiles-spello'].items }));
  m = L.mergeManifest(m, L.packEntry(P['tiles-frasassi'], { items: P['tiles-frasassi'].items }));
  m = L.mergeManifest(m, L.packEntry(P.props, { items: P.props.items }));
  return JSON.parse(JSON.stringify(m));
}

test('manifest: zapis skryptu odczytuje gra (gra/art.js) — bieg, skok, panorama, kafle, drobiazgi', () => {
  const A = Q.parse(sampleManifest());
  assert.equal(A.any, true);
  assert.equal(A.run.frames, 8); assert.equal(A.run.fw, 512); assert.deepEqual(A.run.anchor, [256, 471]);
  assert.equal(A.run.src[256], 'quo-run/run-256.webp'); assert.equal(A.run.src[512], 'quo-run/run-512.webp');
  assert.deepEqual(A.run.heads[3], [300, 163]);
  assert.deepEqual(A.jump.names, ['takeoff', 'apex', 'fall', 'land']);
  assert.equal(A.pano.spello.src[2048], 'spello-panorama/spello-2048.webp');
  assert.deepEqual(A.pano.spello.terrains, ['olive', 'gate', 'alley', 'belvedere']);
  assert.equal(A.tiles.spello.tiles.crumble[32], 'tiles-spello/crumble-32.webp');
  assert.equal(Q.tileSetFor(A, 'cave'), 'frasassi'); assert.equal(Q.tileSetFor(A, 'olive'), 'spello'); assert.equal(Q.tileSetFor(A, 'villa'), null);
  assert.equal(Q.panoFor(A, 'gate'), 'spello'); assert.equal(Q.panoFor(A, 'cave'), null);
  assert.equal(A.props['flower-red'][64], 'props/flower-red-64.webp');
  assert.equal(Q.pick(A.run.src, 300), 'quo-run/run-512.webp'); assert.equal(Q.pick(A.run.src, 100), 'quo-run/run-256.webp'); assert.equal(Q.pick(A.run.src, 9999), 'quo-run/run-512.webp');
  // ścieżki zapisu skryptu = ścieżki odczytu gry
  for (const e of Object.values(sampleManifest().packs)) for (const v of JSON.stringify(e).match(/"[^"]+\.webp"/g)) assert.match(JSON.parse(v), Q.PATH);
});

test('brak plików = bez grafik (gra rysuje jak dawniej); złe wpisy odrzucone', () => {
  for (const M of [null, undefined, {}, { packs: null }, 'x', [], { packs: { a: null } }]) { const A = Q.parse(M); assert.equal(A.any, false); assert.equal(A.run, null); assert.deepEqual(A.tiles, {}); }
  const m = sampleManifest();
  m.packs['quo-run'].src = { 256: '../../index.html', 512: '/etc/passwd.webp' };
  m.packs['quo-jump'].frames = 'cztery';
  m.packs['tiles-spello'].tiles.top = { 32: 'https://zly.example/x.webp' };
  m.packs['spello-panorama'].src = { 1024: 'spello-panorama/spello-1024.png' };
  m.packs.props.props = { '<b>': { 64: 'props/a-64.webp' } };
  const A = Q.parse(m);
  assert.equal(A.run, null); assert.equal(A.jump, null); assert.equal(A.tiles.spello, undefined); assert.deepEqual(A.pano, {}); assert.deepEqual(A.props, {});
  assert.ok(A.tiles.frasassi, 'poprawny zestaw zostaje');
});

test('klatki w grze: bieg zależny od prędkości, skok według vy, kafel według sąsiadów', () => {
  const n = 8, TAU = Math.PI * 2;
  assert.equal(Q.runFrame(0, n), 0); assert.equal(Q.runFrame(TAU / 8 * 3 + 0.01, n), 3); assert.equal(Q.runFrame(TAU * 5 + 0.01, n), 0); assert.equal(Q.runFrame(-0.1, n), 7);
  // P.phase += dt·|vx|/13: dwa razy szybciej → dwa razy więcej klatek w tym samym czasie
  const frames = (vx) => { let ph = 0, seen = 0, last = 0; for (let t = 0; t < 60; t++) { ph += (1 / 60) * vx / 13; const f = Q.runFrame(ph, n); if (f !== last) { seen++; last = f; } } return seen; };
  assert.ok(frames(320) >= 2 * frames(160) - 1);
  const names = ['takeoff', 'apex', 'fall', 'land'];
  assert.equal(Q.jumpFrame('jump', -600, names), 0); assert.equal(Q.jumpFrame('jump', -50, names), 1); assert.equal(Q.jumpFrame('fall', 400, names), 2); assert.equal(Q.jumpFrame('land', 0, names), 3);
  assert.equal(Q.jumpFrame('fall', 400, ['a', 'b']), 2);
  assert.equal(Q.tileFor(false, true, true), 'mid'); assert.equal(Q.tileFor(true, true, false), 'left'); assert.equal(Q.tileFor(true, false, true), 'right'); assert.equal(Q.tileFor(true, false, false), 'top'); assert.equal(Q.tileFor(true, true, true), 'top');
});

test('zlecenia: game-art na białej liście, kosztowne (jp_ok), argumenty sprawdzane', () => {
  const ok = { date: new Date().toISOString().slice(0, 10), quote: 'miałeś zlecić wykonanie nowych grafik' };
  assert.ok(RJ.COSTLY.has('game-art.mjs'));
  assert.equal(RJ.validateJob({ script: 'game-art.mjs', args: ['gen', 'quo-run', '--wait-review'], jp_ok: ok }), null);
  assert.equal(RJ.validateJob({ script: 'game-art.mjs', args: ['gen', '--next'], jp_ok: ok }), null);
  assert.equal(RJ.validateJob({ script: 'game-art.mjs', args: ['fix', 'quo-run', 'ogon wyżej'], jp_ok: ok }), null);
  assert.equal(RJ.validateJob({ script: 'game-art.mjs', args: ['ok', 'props'], jp_ok: ok }), null);
  assert.equal(RJ.validateJob({ script: 'game-art.mjs', args: ['status'], jp_ok: ok }), null);
  assert.match(RJ.validateJob({ script: 'game-art.mjs', args: ['gen', 'quo-run'] }), /brak zgody JP/);
  for (const a of [['gen', '../x'], ['gen', 'quo-run', '--api'], ['gen', 'quo-run', '--force', '--force'], ['watch'], ['ok'], ['fix', 'quo-run', ''], ['rm', '-rf']])
    assert.match(RJ.validateJob({ script: 'game-art.mjs', args: a, jp_ok: ok }) ?? '', /niedozwolone/, a.join(' '));
});

test('pliki zleceń w _content/jobs: sześć paczek w kolejności JP, zgoda JP, odstępy czasowe', () => {
  const dir = join(ROOT, '_content/jobs');
  const files = readdirSync(dir).filter(f => /^2026-10-31-gra-grafiki-/.test(f)).sort();
  assert.equal(files.length, 6);
  let prev = 0;
  files.forEach((f, i) => {
    const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    assert.equal(j.script, 'game-art.mjs');
    assert.deepEqual(j.args, ['gen', ORDER[i], '--wait-review'], f);
    assert.equal(j.jp_ok.quote, 'miałeś zlecić wykonanie nowych grafik');
    assert.equal(RJ.validateJob(j, { costApproved: true }) ?? 'ok', j.not_before && Date.parse(j.not_before) > Date.now() ? 'wait' : 'ok', f);
    const nb = j.not_before ? Date.parse(j.not_before) : 0;
    assert.ok(nb >= prev, `${f}: nie wcześniej niż poprzednie`); prev = nb;
  });
});

// ── obróbka obrazów (Pillow) na syntetycznych obrazach ──
const hasPil = (() => { try { execFileSync('python3', ['-c', 'import PIL'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const py = async (job) => { const r = await pyRun(job); assert.equal(r.code, 0, r.err.slice(-800)); return lastJson(r.out); };
const draw = (code) => execFileSync('python3', ['-c', `from PIL import Image, ImageDraw\n${code}`]);

test('obróbka: arkusz 4×2 na białym → 8 klatek po kolei, cień zdjęty, wyrównany arkusz + podgląd + GIF', { skip: !hasPil && 'brak python3/Pillow' }, async () => {
  const d = mkdtempSync(join(tmpdir(), 'game-art-'));
  const src = join(d, 'raw.png');
  // 8 „postaci” (pomarańczowe elipsy z jasnym brzuchem) o różnej wysokości, z szarym cieniem pod spodem
  draw(`im = Image.new('RGB', (1600, 900), (255, 255, 255)); dr = ImageDraw.Draw(im)
for i in range(8):
    c, r = i % 4, i // 4; x0 = 60 + c * 400; h = 250 + (i % 4) * 30; yb = 60 + r * 450 + 360
    dr.ellipse([x0 + 20, yb - 14, x0 + 260, yb + 6], fill=(205, 205, 205))
    dr.ellipse([x0 + 40, yb - h, x0 + 240, yb], fill=(214, 140, 60)); dr.ellipse([x0 + 90, yb - h + 60, x0 + 190, yb - 40], fill=(250, 240, 222))
    dr.rectangle([x0 + 200 + i * 2, yb - h + 10, x0 + 214 + i * 2, yb - h + 30], fill=(180, 80, 46))
im.save(${JSON.stringify(src)})`);
  const sl = await py({ mode: 'slice', src, outDir: join(d, 'cells'), tol: 48, expect: 8, grid: [4, 2], shadow: true, measure: true });
  assert.equal(sl.count, 8);
  assert.ok(sl.transparent > 0.5);
  const xs = sl.cells.map(c => c.src[0]), ys = sl.cells.map(c => c.src[1]);
  assert.ok(xs[0] < xs[1] && xs[1] < xs[2] && xs[2] < xs[3] && ys[4] > ys[0], 'kolejność: wiersz po wierszu, od lewej');
  assert.ok(sl.cells.every(c => c.h <= 346 && c.h >= 245), `cień zdjęty (wysokości: ${sl.cells.map(c => c.h)})`);
  const plan = L.framePlan(sl.cells);
  await py({ mode: 'compose', frames: sl.cells.map(c => c.path), plan, layout: L.contactLayout(8, { cell: 256, cols: 4 }), outDir: d, names: CFG.packs[0].frameNames });
  for (const f of ['sheet.png', 'contact.png', 'anim.gif', 'frame-08.png']) assert.ok(existsSync(join(d, f)), f);
  const info = JSON.parse(execFileSync('python3', ['-c', `from PIL import Image\nimport json\nim = Image.open(${JSON.stringify(join(d, 'sheet.png'))})\nbb = [im.crop((i*512, 0, i*512+512, 512)).getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox() for i in range(8)]\nprint(json.dumps({'size': im.size, 'bb': bb, 'copy': im.info.get('Copyright')}))`]).toString());
  assert.deepEqual(info.size, [8 * 512, 512]);
  for (const b of info.bb) assert.ok(Math.abs(b[3] - plan.baseline) <= 2, `stopy na linii ${plan.baseline}: ${b}`);
  assert.match(info.copy, /Quolino/);
  const w = await py({ mode: 'webp', src: join(d, 'sheet.png'), base: join(d, 'run'), sizes: L.QUO_SIZES, by: 'height' });
  assert.equal(w.files.length, 2);
  const ws = JSON.parse(execFileSync('python3', ['-c', `from PIL import Image\nimport json\nprint(json.dumps(Image.open(${JSON.stringify(join(d, 'run-256.webp'))}).size))`]).toString());
  assert.deepEqual(ws, [8 * 256, 256]);
});

test('obróbka: kafle na magencie → 6 kafli 256, wierzch bezszwowy w poziomie, krawędzie bez zmian', { skip: !hasPil && 'brak python3/Pillow' }, async () => {
  const d = mkdtempSync(join(tmpdir(), 'game-art-'));
  const src = join(d, 'raw.png');
  // kafle z poziomym gradientem (lewa krawędź ciemna, prawa jasna) — po „bezszwowo” lewa i prawa krawędź muszą się zgadzać
  draw(`im = Image.new('RGB', (1500, 1000), (255, 0, 255)); px = im.load()
for i in range(6):
    c, r = i % 3, i // 3; x0 = 80 + c * 480; y0 = 80 + r * 480; hh = 340 if i < 4 else 120
    for y in range(hh):
        for x in range(340): px[x0 + x, y0 + y] = (120 + x // 3, 90 + x // 4, 80 + (y // 6) % 20)
im.save(${JSON.stringify(src)})`);
  const P = CFG.packs.find(p => p.name === 'tiles-spello');
  const sl = await py({ mode: 'slice', src, outDir: join(d, 'cells'), tol: 70, expect: 6, grid: P.grid });
  assert.equal(sl.count, 6);
  const r = await py({ mode: 'tiles', cells: sl.cells.map(c => c.path), items: P.items, fit: P.fit, seamless: P.seamless, outDir: d, size: 256 });
  assert.equal(r.files.length, 6);
  const edge = (f) => JSON.parse(execFileSync('python3', ['-c', `from PIL import Image\nimport json\nim = Image.open(${JSON.stringify(join(d, f))}).convert('RGBA')\nprint(json.dumps([im.size, im.getpixel((0, 100)), im.getpixel((255, 100)), im.getpixel((128, 200))]))`]).toString());
  const [sz, l, rr] = edge('top.png');
  assert.deepEqual(sz, [256, 256]);
  assert.ok(Math.abs(l[0] - rr[0]) <= 6, `wierzch bezszwowy: ${l} / ${rr}`);
  const [, l2, r2] = edge('left.png');
  assert.ok(r2[0] - l2[0] > 40, 'krawędź lewa nie jest „zszywana”');
  const fl = edge('float.png');
  assert.equal(fl[3][3], 0, 'półka: dół kafla przezroczysty');
  assert.ok(existsSync(join(d, 'contact.png')));
});
