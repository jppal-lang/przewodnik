#!/usr/bin/env node
// Odczyt (bez AI, 0 $): lista ticketów do przeglądu przez Claude (JP 2026-11-08: „przejrzyj zgłoszenia, zrobione przez agentów usuń”)
// → _content/reports/tickety.json (repo.sh publish). Bez danych osobowych: e-mail tylko jako domena, urządzenie jako 8 znaków skrótu.
//   node tickets-dump.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { db, run, log } from './lib.mjs';
const REPO = '/opt/data/repo/przewodnik', REPO_SH = '/opt/data/quolino/repo.sh';
const h8 = (s) => s ? createHash('sha256').update(String(s)).digest('hex').slice(0, 8) : null;
const c = await db();
try {
  const rows = (await c.query(`
    SELECT t.number, t.source, t.source_id, t.subject, t.status, t.city_slug, t.stop, t.lang, t.created_at, t.updated_at,
           t.client_id, t.email, t.sub IS NOT NULL AS has_account,
           (SELECT json_agg(json_build_object('author', author, 'at', created_at, 'body', left(body, 300)) ORDER BY created_at) FROM ops.ticket_messages m WHERE m.ticket_id = t.id) AS messages
      FROM ops.tickets t ORDER BY t.created_at`)).rows;
  const out = { at: new Date().toISOString(), count: rows.length, tickets: rows.map(r => ({ ...r, client_id: h8(r.client_id), email: r.email ? '…@' + String(r.email).split('@')[1] : null })) };
  await run('sh', [REPO_SH, 'pull'], { timeout: 120_000 });
  mkdirSync(join(REPO, '_content/reports'), { recursive: true });
  writeFileSync(join(REPO, '_content/reports/tickety.json'), JSON.stringify(out, null, 1));
  const pub = await run('sh', [REPO_SH, 'publish', `raport ticketów: ${rows.length}`], { timeout: 5 * 60_000 });
  log(`tickety: ${rows.length} → _content/reports/tickety.json ${pub.code === 0 ? 'opublikowany' : 'BŁĄD publish'}`);
} finally { await c.end(); }
