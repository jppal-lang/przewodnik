#!/usr/bin/env node
// Diagnostyka bazy tylko do odczytu (bez AI, 0 $): które obiekty z migracji istnieją, definicja CHECK ops.jobs.worker, workery w ops.jobs.
//   node db-diag.mjs   → JSON na stdout (repo-jobs pokazuje wynik w ops-status)
import { db } from './lib.mjs';
const c = await db();
const q = async (sql, p) => (await c.query(sql, p)).rows;
const objs = ['admin.admin_trip_enqueue', 'admin.regions', 'admin.admin_publish_gate', 'admin.publish_gate', 'admin.trip_plan', 'ops.trip_plan',
  'admin.draft_revision_requests', 'admin.ops_status', 'public.stops_icons_of', 'ops.art_requests', 'admin.admin_art_decide'];
const out = { objects: {} };
try {
  for (const o of objs) {
    const [s, n] = o.split('.');
    const [r] = await q(`SELECT (SELECT count(*) FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace WHERE ns.nspname = $1 AND p.proname = $2)
      + (SELECT count(*) FROM pg_class k JOIN pg_namespace ns ON ns.oid = k.relnamespace WHERE ns.nspname = $1 AND k.relname = $2) AS n`, [s, n]);
    out.objects[o] = +r.n > 0;
  }
  out.worker_check = (await q(`SELECT conrelid::regclass::text AS tbl, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'jobs_worker_check'`));
  out.workers = await q(`SELECT worker, count(*)::int AS n FROM ops.jobs GROUP BY worker ORDER BY 2 DESC`);
  out.kinds = await q(`SELECT kind, count(*)::int AS n FROM ops.jobs GROUP BY kind ORDER BY 2 DESC`);
  out.other_checks = await q(`SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'ops.jobs'::regclass AND contype = 'c'`);
} catch (e) { out.error = e.message; }
console.log(JSON.stringify(out));
await c.end();
