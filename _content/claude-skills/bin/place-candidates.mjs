#!/usr/bin/env node
// Kandydaci zdjęć do ikon miejsc (JP 2026-10-30): dla każdego przystanku zwiedzania trasy 3–4 zdjęcia z Wikimedia Commons
// (ten sam dobór co place-icons.mjs: Wikidata P18, kategoria Commons i podkategorie, wyszukiwarka; filtr ludzi, map, nocy, wnętrz;
// tylko wolne licencje). JP w panelu admina (karta przystanku) klika 1–2 jako referencję do ilustracji Quo; wybór trafia do ops.icon_refs,
// a place-icons.mjs używa go zamiast automatu. Zasady: docs/IKONY-MIEJSC.md §6.
//   node place-candidates.mjs <trasa> [--dry] [--no-publish]
// Wynik: media/icons/place-candidates/<trasa>.json w repo (repo.sh publish → strona i panel admina czytają ten sam checkout)
// oraz kopia w work/place-icons/<trasa>/candidates.json (place-icons.mjs liczy od niej czas czekania na wybór JP: maks. 48 h).
// Przystanki: najnowsza opublikowana wersja + przystanki dodane w najnowszym szkicu. Praktyczne (parking, restauracja, lody, słodycze) — bez.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { log, run, db } from './lib.mjs';
import CFG from './place-icons-data.mjs';
import * as L from './place-icons-lib.mjs';
import { gatherCandidates, fileInfos } from './place-icons-commons.mjs';

const REPO = process.env.QUOLINO_REPO ?? '/opt/data/repo/przewodnik', REPO_SH = '/opt/data/quolino/repo.sh';
const WORK = '/opt/data/quolino/work/place-icons';
const argv = process.argv.slice(2);
const trip = argv[0], flag = (n) => argv.includes(n);
const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };

async function tripStops(slug) {
  const c = await db();
  let rows;
  try {
    ({ rows } = await c.query(`(SELECT version, status, content FROM public.city_versions WHERE city_slug = $1 AND status = 'published' ORDER BY version DESC LIMIT 1)
      UNION ALL (SELECT version, status, content FROM public.city_versions WHERE city_slug = $1 AND status = 'draft' ORDER BY version DESC LIMIT 1)`, [slug]));
  } finally { await c.end(); }
  const pub = rows.find(r => r.status === 'published'), draft = rows.find(r => r.status === 'draft' && (!pub || r.version > pub.version));
  const out = new Map();
  for (const r of [pub, draft].filter(Boolean)) for (const s of L.stopsOf(r.content)) if (!out.has(s.key)) out.set(s.key, s);
  return { stops: [...out.values()].sort((a, b) => a.n - b.n), versions: { published: pub?.version ?? null, draft: draft?.version ?? null } };
}

async function main() {
  if (!/^[a-z0-9-]+$/.test(trip ?? '')) throw new Error('podaj trasę (slug), np. spello');
  const { stops, versions } = await tripStops(trip);
  if (!stops.length) throw new Error(`${trip}: brak przystanków zwiedzania (opublikowana wersja / szkic)`);
  const result = { trip, generated_at: new Date().toISOString(), versions, per_stop: L.CANDIDATES_PER_STOP, wait_hours: L.WAIT_HOURS,
    note: 'Kandydaci do wyboru w panelu admina (referencja do ikony Quo). Wybór: ops.icon_refs. Zasady: docs/IKONY-MIEJSC.md §6.', stops: {} };
  for (const stop of stops) {
    const ov = CFG.stops?.[L.sourcesKey(trip, stop.key)] ?? {};
    const rec = { n: stop.n, name: stop.name, category: stop.category, view: null, status: 'none', candidates: [] };
    result.stops[stop.key] = rec;
    if (ov.skip) { rec.status = 'skip'; continue; }
    try {
      const g = await gatherCandidates(stop, ov);
      rec.view = g.view;
      const { kept, dropped } = L.rankCandidates(g.cands, { names: g.names, view: g.view });
      const free = kept.filter(c => L.licenseOk(c.license));
      const top = free.slice(0, L.CANDIDATES_PER_STOP);
      // miniatury 320 px (osobne zapytanie: ranking działał na metadanych, adresy miniatur liczy Commons dla podanej szerokości)
      const small = top.length ? await fileInfos(top.map(c => c.title), 'thumb', 320) : [];
      rec.candidates = top.map(c => L.candidateEntry({ ...c, thumb: small.find(s => s.title === c.title)?.thumb ?? null })).filter(Boolean);
      rec.status = rec.candidates.length ? 'ok' : 'none';
      rec.stats = { found: g.cands.length, dropped: dropped.length, license_dropped: kept.length - free.length };
      log(`${trip} #${stop.n} ${stop.key}: ${rec.candidates.length} kandydatów (z ${g.cands.length}, odrzuconych ${dropped.length}, licencja ${kept.length - free.length})`);
    } catch (e) { rec.status = 'error'; rec.error = String(e.message).slice(0, 200); log(`${trip} #${stop.n} ${stop.key}: BŁĄD ${e.message}`); }
  }
  const json = JSON.stringify(result, null, 1) + '\n';
  if (flag('--dry')) { console.log(json); return; }
  mkdirSync(join(WORK, trip), { recursive: true });
  writeFileSync(join(WORK, trip, 'candidates.json'), json);
  if (flag('--no-publish')) { console.log(`zapisano ${join(WORK, trip, 'candidates.json')}`); return; }
  const pull = await run('sh', [REPO_SH, 'pull'], { timeout: 120_000 });
  if (pull.code !== 0) throw new Error(`repo: ${(pull.err || pull.out).slice(-300)}`);
  const dest = join(REPO, L.candidatesPath(trip));
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, json);
  const n = Object.values(result.stops).filter(s => s.status === 'ok').length;
  const pub = await run('sh', [REPO_SH, 'publish', `kandydaci zdjęć do ikon miejsc: ${trip} (${n}/${stops.length} przystanków, wybór JP w panelu admina)`], { timeout: 5 * 60_000 });
  if (pub.code !== 0 || /BŁĄD/.test(pub.out)) throw new Error(`publikacja: ${(pub.err || pub.out).slice(-300)}`);
  console.log(`${trip}: kandydaci dla ${n}/${stops.length} przystanków → ${L.candidatesPath(trip)}`);
}

try { await main(); } catch (e) { console.error('BŁĄD:', e.message); process.exitCode = 1; }
