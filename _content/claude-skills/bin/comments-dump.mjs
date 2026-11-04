#!/usr/bin/env node
// Odczyt (bez AI, 0 $): uwagi JP do trasy + flagi kontroli najnowszych wersji + treść pól, których dotyczą → plik w repo
// _content/reports/<slug>-uwagi.json (repo.sh publish), żeby Claude mógł przeanalizować redakcję (JP 2026-11-04, Asyż).
//   node comments-dump.mjs <slug>
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { db, run, log } from './lib.mjs';
const slug = process.argv[2];
if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug ?? '')) { console.error('node comments-dump.mjs <slug>'); process.exit(2); }
const REPO = '/opt/data/repo/przewodnik', REPO_SH = '/opt/data/quolino/repo.sh';
const c = await db();
const q = async (s, p) => (await c.query(s, p)).rows;
try {
  const comments = await q(`SELECT * FROM public.draft_comments WHERE city_slug = $1 ORDER BY id`, [slug]);
  const versions = await q(`SELECT version, status, source, note, created_at, published_at, review, content FROM public.city_versions WHERE city_slug = $1 ORDER BY version DESC LIMIT 4`, [slug]);
  const reqs = await q(`SELECT * FROM public.draft_revision_requests WHERE city_slug = $1 ORDER BY id`, [slug]).catch(() => []);
  const out = { slug, at: new Date().toISOString(), comments, revision_requests: reqs,
    versions: versions.map(v => ({ version: v.version, status: v.status, source: v.source, note: v.note, created_at: v.created_at, review: v.review, content: v.content })) };
  await run('sh', [REPO_SH, 'pull'], { timeout: 120_000 });
  mkdirSync(join(REPO, '_content/reports'), { recursive: true });
  writeFileSync(join(REPO, `_content/reports/${slug}-uwagi.json`), JSON.stringify(out, null, 1));
  const pub = await run('sh', [REPO_SH, 'publish', `raport uwag: ${slug} (${comments.length} uwag, ${versions.length} wersji)`], { timeout: 5 * 60_000 });
  log(`${slug}: ${comments.length} uwag, ${versions.length} wersji → _content/reports/${slug}-uwagi.json ${pub.code === 0 ? 'opublikowany' : 'BŁĄD publish'}`);
} finally { await c.end(); }
