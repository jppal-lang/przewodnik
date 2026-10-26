#!/usr/bin/env node
// Zużycie AI w ostatnich N dniach (domyślnie 7) wg dostawcy, roli i miasta: node usage-summary.mjs [dni]
import { db } from './lib.mjs';
const days = +(process.argv[2] ?? 7), c = await db();
const q = async (s) => (await c.query(s, [days])).rows;
const fmt = (n) => (+n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : +n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n));
console.log(`— ostatnie ${days} dni —`);
for (const r of await q(`SELECT provider, billing, sum(calls) c, sum(tokens_in) i, sum(tokens_out) o, round(sum(usd_equiv),2) eq FROM public.ai_usage WHERE at > now() - ($1 || ' days')::interval GROUP BY 1,2 ORDER BY 4 DESC`))
  console.log(`${r.provider}/${r.billing}: ${r.c} wywołań, wej ${fmt(r.i)}, wyj ${fmt(r.o)}, ≈$${r.eq}`);
console.log('— gemini wg roli i miasta —');
for (const r of await q(`SELECT coalesce(role,'?') role, coalesce(city_slug,'-') city, sum(calls) c, sum(tokens_in) i, sum(tokens_out) o FROM public.ai_usage WHERE provider='gemini' AND at > now() - ($1 || ' days')::interval GROUP BY 1,2 ORDER BY 4 DESC LIMIT 25`))
  console.log(`${r.c}× ${r.role.slice(0, 40).padEnd(40)} ${r.city.padEnd(10)} wej ${fmt(r.i).padStart(6)} wyj ${fmt(r.o).padStart(6)}`);
console.log('— gemini wg dnia —');
for (const r of await q(`SELECT at::date d, sum(calls) c, sum(tokens_in) i FROM public.ai_usage WHERE provider='gemini' AND at > now() - ($1 || ' days')::interval GROUP BY 1 ORDER BY 1`))
  console.log(`${r.d.toISOString().slice(0, 10)}: ${r.c} wywołań, wej ${fmt(r.i)}`);
await c.end();
