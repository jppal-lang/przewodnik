#!/usr/bin/env node
// Dane trasy dla gry „Quo: Wyprawa” (JP 2026-10-27): opublikowana wersja trasy → repo gra/data/<slug>.trip.json → publish.
// Tylko treść ZATWIERDZONA (status published) — gra nie pokazuje dziecku szkiców. --draft = najnowszy szkic (do testów, bez publikacji w repo: plik w /tmp).
//   node game-export.mjs spello [--draft]
import { writeFileSync, mkdirSync } from 'node:fs';
import { db, run } from './lib.mjs';
const slug = process.argv[2], DRAFT = process.argv.includes('--draft');
if (!slug) { console.error('node game-export.mjs <slug> [--draft]'); process.exit(2); }
const c = await db();
const { rows: [v] } = await c.query(DRAFT
  ? `SELECT version, status, content FROM public.city_versions WHERE city_slug = $1 AND status = 'draft' ORDER BY version DESC LIMIT 1`
  : `SELECT version, status, content FROM public.city_versions WHERE city_slug = $1 AND status = 'published' ORDER BY version DESC LIMIT 1`, [slug]);
await c.end();
if (!v) { console.error(`${slug}: brak wersji ${DRAFT ? 'roboczej' : 'opublikowanej'}`); process.exit(1); }
const out = { slug, version: v.version, status: v.status, exported_at: new Date().toISOString(), content: v.content };
if (DRAFT) { writeFileSync(`/tmp/${slug}.draft.trip.json`, JSON.stringify(out, null, 1)); console.log(`/tmp/${slug}.draft.trip.json`); process.exit(0); }
const R = '/opt/data/repo/przewodnik';
await run('sh', ['/opt/data/quolino/repo.sh', 'pull'], { timeout: 120_000 });
mkdirSync(`${R}/gra/data`, { recursive: true });
writeFileSync(`${R}/gra/data/${slug}.trip.json`, JSON.stringify(out, null, 1));
const p = await run('sh', ['/opt/data/quolino/repo.sh', 'publish', `dane gry: ${slug} v${v.version} (opublikowana)`], { timeout: 5 * 60_000 });
console.log(p.out || p.err);
