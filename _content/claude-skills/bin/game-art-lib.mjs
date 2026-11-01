// Grafiki gry „Quo: Wyprawa” (JP 2026-10-31) — czyste funkcje bez sieci, bazy i plików: odpowiedzi JP, plan wyrównania klatek,
// układ arkusza kontaktowego, wpisy manifestu gra/art/manifest.json. Testy: game-art.test.mjs. Skrypt: game-art.mjs.

export const ART_DIR = 'gra/art';
export const MANIFEST = 'gra/art/manifest.json';
export const FRAME = 512;            // klatka Quo po wyrównaniu (px, kwadrat)
export const BASELINE = 0.92;        // linia stóp w klatce (ułamek wysokości)
export const TILE_SIZES = [32, 64, 128];
export const PROP_SIZES = [64, 128];
export const QUO_SIZES = [256, 512]; // wysokość klatki w arkuszu WebP (512 na ostre ekrany, 256 domyślnie)

const SAFE_NAME = /^[a-z0-9][a-z0-9-]{0,40}$/;
export const safeName = (s) => SAFE_NAME.test(String(s ?? ''));

// ── odpowiedzi JP w wątku „🎮 grafiki gry” ──────────────────────────────────────────────────────
// „ok”, „ok quo-run”, „quo-run ok”, „ok 1” (numer paczki w kolejności), „quo-run: uwagi…”, „1 uwagi…”, „następne”/„dalej”,
// same uwagi → poprawka ostatnio wrzuconej paczki.
export function parseReply(text, packs = []) {
  const t = String(text ?? '').trim().replace(/\s+/g, ' ');
  if (!t) return null;
  const P = (w) => {
    if (w == null) return null;
    const s = String(w).toLowerCase().replace(/^#/, '');
    if (/^\d+$/.test(s)) return packs[+s - 1] ?? undefined;
    return packs.includes(s) ? s : undefined;
  };
  let x;
  if ((x = t.match(/^(?:ok|akceptuj[eę]|zatwierdzam)[.!]?\s+(#?[a-z0-9-]+)[.!]?$/i)) || (x = t.match(/^(#?[a-z0-9-]+)\s+(?:ok|akceptuj[eę])[.!]?$/i))) {
    const pack = P(x[1]); if (pack === undefined) return { type: 'unknown', word: x[1] };
    return { type: 'ok', pack };
  }
  if (/^(ok|akceptuj[eę]|zatwierdzam)[.!]?$/i.test(t)) return { type: 'ok-last' };
  if (/^(nast[eę]pn[ea]|dalej|generuj( dalej)?)[.!]?$/i.test(t)) return { type: 'next' };
  // „paczka: uwagi” / „paczka uwagi” / „2 uwagi” — nazwa paczki ma myślniki, więc próbujemy obu form i bierzemy tę ze znaną paczką
  for (const re of [/^(#?[a-z0-9]+(?:-[a-z0-9]+)*)\s*[:.,–)]\s*(\S[\s\S]{2,})$/i, /^(#?[a-z0-9]+(?:-[a-z0-9]+)*)\s+(\S[\s\S]{2,})$/i]) {
    x = t.match(re);
    const pack = x && P(x[1]);
    if (pack) return { type: 'fix', pack, notes: x[2].trim() };
  }
  return t.length >= 3 ? { type: 'fix-last', notes: t } : null;
}

// ostatnio wrzucona paczka czekająca na ocenę
export function lastPosted(state) {
  let best = null;
  for (const [name, s] of Object.entries(state?.packs ?? {})) {
    if (!['review'].includes(s.status) || !s.posted_at) continue;
    if (!best || s.posted_at > best.at) best = { pack: name, at: s.posted_at };
  }
  return best?.pack ?? null;
}
// następna paczka do wygenerowania (kolejność z game-art-data.mjs): bez wersji i bez akceptacji
export const nextPack = (order, state) => order.find(p => !state?.packs?.[p]?.v && state?.packs?.[p]?.status !== 'ok') ?? null;
// czy coś czeka na ocenę JP (wtedy paczki ze zleceń z --wait-review czekają — JP ocenia po kolei)
export const waitingReview = (state) => Object.entries(state?.packs ?? {}).filter(([, s]) => ['review', 'fix-pending'].includes(s.status)).map(([k]) => k);

// limit wywołań Antigravity na cały projekt grafik gry (JP: „≤ 50 wywołań”, oszczędnie)
export const callsUsed = (state) => (state?.calls ?? []).length;
export const budgetLeft = (state, max) => Math.max(0, max - callsUsed(state));

// ── plan wyrównania klatek Quo ───────────────────────────────────────────────────────────────────
// boxes: [{ w, h, cx, head: [x, y] | null }] — wycięte klatki (bbox w px surowego obrazu, cx = środek ciężkości sylwetki w poziomie
// względem lewej krawędzi bboxa). Wszystkie klatki dostają TĘ SAMĄ skalę (arkusz wygenerowany jedną kamerą), stopy na wspólnej
// linii (BASELINE), środek sylwetki na środku klatki. Zwraca { scale, frames: [{ x, y, w, h, head }] } w px klatki FRAME.
export function framePlan(boxes, { size = FRAME, baseline = BASELINE, margin = 0.04 } = {}) {
  if (!Array.isArray(boxes) || !boxes.length) throw new Error('brak klatek');
  for (const b of boxes) if (!(b?.w > 0 && b?.h > 0)) throw new Error('klatka bez wymiarów');
  const top = size * margin, maxH = size * baseline - top, maxW = size * (1 - 2 * margin);
  // skala: najwyższa i najszersza klatka mieszczą się (z marginesem); środek sylwetki może być niesymetryczny — liczymy połówki
  let scale = Infinity;
  for (const b of boxes) {
    const cx = b.cx ?? b.w / 2, half = Math.max(cx, b.w - cx);
    scale = Math.min(scale, maxH / b.h, maxW / 2 / half);
  }
  const frames = boxes.map(b => {
    const w = b.w * scale, h = b.h * scale, cx = (b.cx ?? b.w / 2) * scale;
    const x = Math.round(size / 2 - cx), y = Math.round(size * baseline - h);
    const head = Array.isArray(b.head) ? [Math.round(x + b.head[0] * scale), Math.round(y + b.head[1] * scale)] : null;
    return { x, y, w: Math.round(w), h: Math.round(h), head };
  });
  return { scale: +scale.toFixed(5), size, baseline: Math.round(size * baseline), frames };
}

// układ arkusza kontaktowego (podgląd na Discord): n klatek w rzędach po cols, z odstępem i paskiem numerów
export function contactLayout(n, { cell = 256, cols = 4, gap = 12, label = 28 } = {}) {
  if (!(n > 0)) throw new Error('brak klatek');
  const c = Math.min(cols, n), rows = Math.ceil(n / c);
  const W = c * cell + (c + 1) * gap, H = rows * (cell + label) + (rows + 1) * gap;
  const cells = Array.from({ length: n }, (_, i) => ({ i, x: gap + (i % c) * (cell + gap), y: gap + Math.floor(i / c) * (cell + label + gap), w: cell, h: cell, ly: gap + Math.floor(i / c) * (cell + label + gap) + cell }));
  return { W, H, cells };
}

// ── manifest gry (gra/art/manifest.json) ────────────────────────────────────────────────────────
// Jeden wpis na paczkę; ścieżki względem gra/art/. Gra (gra/art.js) czyta tylko znane pola i ignoruje resztę.
export function packEntry(pack, meta, { v = 1, at = new Date().toISOString() } = {}) {
  if (!safeName(pack.name)) throw new Error(`zła nazwa paczki: ${pack.name}`);
  const base = { pack: pack.name, v, accepted_at: at };
  const dir = pack.name;
  if (pack.kind === 'frames') {
    const n = meta?.frames?.length ?? 0;
    if (!n) throw new Error(`${pack.name}: brak klatek w meta`);
    return { ...base, kind: 'frames', role: pack.role, frames: n, names: pack.frameNames?.slice(0, n) ?? null,
      cols: n, fw: FRAME, fh: FRAME, anchor: [FRAME / 2, meta.baseline ?? Math.round(FRAME * BASELINE)],
      quoH: meta.quoH ?? null, heads: meta.frames.map(f => f.head ?? null), boxes: meta.frames.map(f => [f.x, f.y, f.w, f.h]),
      src: Object.fromEntries(QUO_SIZES.map(s => [s, `${dir}/${pack.role}-${s}.webp`])) };
  }
  if (pack.kind === 'panorama') {
    return { ...base, kind: 'panorama', place: pack.place, w: meta?.w ?? 2048, h: meta?.h ?? 1152, ground: meta?.ground ?? 0.86,
      src: { 1024: `${dir}/${pack.place}-1024.webp`, 2048: `${dir}/${pack.place}-2048.webp` }, terrains: pack.terrains ?? [] };
  }
  if (pack.kind === 'tiles') {
    return { ...base, kind: 'tiles', set: pack.set, terrains: pack.terrains ?? [], sizes: TILE_SIZES,
      tiles: Object.fromEntries(pack.items.map(it => [it, Object.fromEntries(TILE_SIZES.map(s => [s, `${dir}/${it}-${s}.webp`]))])) };
  }
  if (pack.kind === 'props') {
    return { ...base, kind: 'props', sizes: PROP_SIZES,
      props: Object.fromEntries(pack.items.map(it => [it, Object.fromEntries(PROP_SIZES.map(s => [s, `${dir}/${it}-${s}.webp`]))])) };
  }
  throw new Error(`nieznany rodzaj paczki: ${pack.kind}`);
}
export function mergeManifest(json, entry) {
  const m = { note: 'Grafiki gry Quo: Wyprawa (bin/game-art.mjs, akceptacja JP na Discordzie). Ścieżki względem gra/art/. Brak wpisu = gra rysuje kodem.', version: 1, packs: {}, ...(json && typeof json === 'object' ? json : {}) };
  m.packs = { ...(m.packs ?? {}), [entry.pack]: entry };
  m.updated_at = entry.accepted_at;
  return m;
}

// podpis posta z paczką
export function caption(pack, idx, { v = 1, notes = null, warn = null, budget = null } = {}) {
  return `🎮 **${idx}. ${pack.name}** — ${pack.title} · wersja ${v}${notes ? ` (poprawki: ${String(notes).slice(0, 200)})` : ''}` +
    `${pack.hint ? `\n${pack.hint}` : ''}${warn ? `\n⚠️ ${warn}` : ''}${budget != null ? `\nlimit grafik gry: zostało ${budget} wywołań Antigravity` : ''}` +
    `\nOdpisz w tym wątku: **ok ${pack.name}** (albo samo **ok**) — publikacja do gry; **${pack.name}: co poprawić** — nowa wersja.`;
}
