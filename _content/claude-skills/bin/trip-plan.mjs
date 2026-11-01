#!/usr/bin/env node
// Plan tras: kolejność miast per region wg popularności turystycznej (decyzja JP 2026-11-01: „opublikowanie wyzwala następną trasę,
// kolejność wg najbardziej popularnych miejsc w danym regionie”).
//   node trip-plan.mjs                 — plan ze stanem z bazy (opublikowane w nowym procesie / szkic / w kolejce / następne)
//   node trip-plan.mjs --next umbria   — które miasto poszłoby po publikacji trasy z regionu (bez zlecania)
//   node trip-plan.mjs --sync [--dry]  — wgraj listę do ops.trip_plan (upsert + usunięcie wykreślonych); bez tego baza ma listę z SQL
//                                        2026-11-01-publikacja-bramka.sql (ta sama, pilnuje test trip-plan.test.mjs)
// Lista jest REDAKCYJNA i edytowalna: kolejność to ocena popularności wśród turystów (frekwencja zabytków, liczba noclegów, obecność
// w przewodnikach i rankingach „top Umbria / Marche / Emilia-Romagna”) — nie liczba z jednego źródła. Zmiana kolejności = przestawienie
// wierszy tutaj + `--sync`. Kolejność regionów: REGIONS (Umbria → Marche → Emilia-Romagna).
// Wybór następnego miasta (pickNext — te same reguły co admin.trip_next w SQL): pierwsze miasto regionu, które NIE jest opublikowane
// w nowym procesie, NIE ma szkicu w toku i NIE ma zadania draft/gemini w ops.jobs (żadnego: queued/running = w kolejce, done/failed =
// JP decyduje o powtórce sam); wyczerpany region → następny (potem wcześniejsze). Stare trasy (są w bazie) → fresh = true.
// Kto zleca: admin.admin_approve po udanej publikacji (SQL), tą samą ścieżką co „+ Nowa trasa” (admin.admin_trip_enqueue → ops.jobs).
// Ten skrypt nic nie zleca i nic nie kosztuje.

export const REGIONS = ['umbria', 'marche', 'emilia-romagna'];

// [slug, nazwa PL, czas, notka redakcyjna] — kolejność = popularność (1 = najpopularniejsze)
export const PLAN = {
  umbria: [
    ['asyz', 'Asyż', 'full_day', 'UNESCO, bazylika św. Franciszka — najczęściej odwiedzane miasto Umbrii'],
    ['perugia', 'Perugia', 'full_day', 'stolica regionu, Eurochocolate, Umbria Jazz'],
    ['orvieto', 'Orvieto', 'full_day', 'katedra, studnia św. Patryka, kolejka linowa'],
    ['spello', 'Spello', 'half_day', 'Infiorata, mozaiki — już w nowym procesie (pominięte automatycznie)'],
    ['gubbio', 'Gubbio', 'full_day', 'kolejka na Monte Ingino, Festa dei Ceri'],
    ['spoleto', 'Spoleto', 'full_day', 'Ponte delle Torri, Festival dei Due Mondi'],
    ['todi', 'Todi', 'half_day', 'Piazza del Popolo, Tempio della Consolazione'],
    ['norcia', 'Norcia', 'half_day', 'św. Benedykt, Piano Grande (Castelluccio)'],
    ['narni', 'Narni', 'half_day', 'Narni Sotterranea — Narnia dla dzieci'],
    ['castiglione-del-lago', 'Castiglione del Lago', 'half_day', 'Trasimeno, zamek Rocca del Leone, plaże'],
  ],
  marche: [
    ['urbino', 'Urbino', 'full_day', 'UNESCO, Palazzo Ducale, Rafael'],
    ['ancona', 'Ancona i Riviera del Conero', 'full_day', 'port, Conero, plaże'],
    ['frasassi', 'Frasassi', 'full_day', 'jaskinie — już w nowym procesie (pominięte automatycznie)'],
    ['loreto', 'Loreto', 'half_day', 'sanktuarium Świętego Domku'],
    ['ascoli-piceno', 'Ascoli Piceno', 'full_day', 'Piazza del Popolo, olive ascolane'],
    ['recanati', 'Recanati', 'half_day', 'Leopardi, Gigli'],
    ['fermo', 'Fermo', 'half_day', 'cysterny rzymskie, teatr'],
    ['pesaro', 'Pesaro', 'half_day', 'Rossini, plaża, rower'],
    ['macerata', 'Macerata', 'half_day', 'Sferisterio'],
    ['san-leo', 'San Leo', 'half_day', 'twierdza na skale, Cagliostro'],
  ],
  'emilia-romagna': [
    ['bolonia', 'Bolonia', 'full_day', 'wieże, portyki (UNESCO), kuchnia'],
    ['rimini', 'Rimini', 'full_day', 'plaża, Fellini, most Tyberiusza'],
    ['rawenna', 'Rawenna', 'full_day', 'mozaiki UNESCO'],
    ['ferrara', 'Ferrara', 'full_day', 'zamek Estense, rowery, UNESCO'],
    ['modena', 'Modena', 'half_day', 'katedra UNESCO, Ferrari, ocet balsamiczny'],
    ['parma', 'Parma', 'half_day', 'baptysterium, szynka i parmezan'],
  ],
};

// płaska lista wierszy jak w ops.trip_plan
export function rows(plan = PLAN) {
  return Object.entries(plan).flatMap(([region, list]) => list.map(([slug, name, duration, note], i) =>
    ({ region, rank: i + 1, slug, name, country: 'it', duration, note })));
}

// st: { [slug]: { doneV2, hasDraft, job, hasOld } } (job = status ostatniego zadania draft/gemini albo null); regionsOk: lista regionów
// z public.regions (null = nie sprawdzaj); skip = slug właśnie opublikowanej trasy. Zwraca { slug, name, region, country, duration, fresh } albo null (plan wyczerpany).
export function pickNext(region, st = {}, { plan = PLAN, regions = REGIONS, regionsOk = null, skip = null } = {}) {
  const r = String(region || '').toLowerCase();
  const at = regions.indexOf(r);
  // kolejność: region publikacji, potem następne wg REGIONS, na końcu wcześniejsze; nieznany region → od początku
  const order = at < 0 ? regions.slice() : [r, ...regions.slice(at + 1), ...regions.slice(0, at)];
  for (const reg of order) {
    if (regionsOk && !regionsOk.includes(reg)) continue;
    for (const [slug, name, duration] of plan[reg] || []) {
      const s = st[slug] || {};
      if (s.doneV2 || s.hasDraft || s.job || slug === skip) continue;   // skip: właśnie opublikowana trasa nie zleca samej siebie
      return { slug, name, region: reg, country: 'it', duration, fresh: !!s.hasOld };
    }
  }
  return null;
}

// stan z bazy (te same definicje co widok admin.trip_plan)
async function loadState(q) {
  const v = await q(`SELECT city_slug,
      bool_or((status = 'published' OR published_at IS NOT NULL) AND (content ->> 'workflow' = 'v2' OR coalesce(content ->> 'guidelines', 'v01') > 'v01')) AS done_v2,
      bool_or(status = 'draft') AS has_draft FROM public.city_versions GROUP BY city_slug`);
  const j = await q(`SELECT DISTINCT ON (city_slug) city_slug, status FROM ops.jobs WHERE kind = 'draft' AND worker = 'gemini' ORDER BY city_slug, id DESC`);
  const c = await q('SELECT slug FROM public.cities');
  const regs = (await q('SELECT slug FROM public.regions')).map(x => x.slug);
  const st = {};
  const at = (s) => (st[s] ??= { doneV2: false, hasDraft: false, job: null, hasOld: false });
  for (const x of v) Object.assign(at(x.city_slug), { doneV2: !!x.done_v2, hasDraft: !!x.has_draft, hasOld: true });
  for (const x of j) at(x.city_slug).job = x.status;
  for (const x of c) at(x.slug).hasOld = true;
  return { st, regs };
}

export async function sync(q, { dry = false, plan = PLAN } = {}) {
  const R = rows(plan);
  if (dry) return { upsert: R.length, dry: true };
  await q('BEGIN');
  try {
    for (const [i, reg] of REGIONS.entries()) await q(`INSERT INTO ops.trip_plan_regions (region, rank) VALUES ($1, $2) ON CONFLICT (region) DO UPDATE SET rank = EXCLUDED.rank`, [reg, i + 1]);
    for (const x of R) await q(`INSERT INTO ops.trip_plan (region, rank, slug, name, country, duration, note) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (region, slug) DO UPDATE SET rank = EXCLUDED.rank, name = EXCLUDED.name, country = EXCLUDED.country, duration = EXCLUDED.duration, note = EXCLUDED.note, updated_at = now()`,
      [x.region, x.rank, x.slug, x.name, x.country, x.duration, x.note]);
    const del = await q(`DELETE FROM ops.trip_plan WHERE NOT ((region || '/' || slug) = ANY($1::text[])) RETURNING slug`, [R.map(x => `${x.region}/${x.slug}`)]);
    await q('COMMIT');
    return { upsert: R.length, removed: del.map(x => x.slug) };
  } catch (e) { await q('ROLLBACK').catch(() => {}); throw e; }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const { db, log } = await import('./lib.mjs');
  const c = await db();
  const q = async (sql, p) => (await c.query(sql, p)).rows;
  try {
    if (argv.includes('--sync')) {
      const r = await sync(q, { dry: argv.includes('--dry') });
      log(`plan tras: ${r.dry ? '(próba) ' : ''}${r.upsert} miast${r.removed?.length ? `, usunięte: ${r.removed.join(', ')}` : ''}`);
    } else {
      const { st, regs } = await loadState(q);
      const ni = argv.indexOf('--next');
      if (ni >= 0) console.log(JSON.stringify(pickNext(argv[ni + 1], st, { regionsOk: regs })));
      else for (const reg of REGIONS) {
        const nx = pickNext(reg, st, { regionsOk: regs });
        console.log(`\n${reg}${regs.includes(reg) ? '' : ' (brak w public.regions — pomijany)'} → następna: ${nx ? `${nx.name}${nx.region !== reg ? ` (${nx.region})` : ''}` : '— plan wyczerpany'}`);
        for (const [i, [slug, name]] of (PLAN[reg] || []).entries()) {
          const s = st[slug] || {};
          const tag = s.doneV2 ? 'opublikowana (nowy proces)' : s.hasDraft ? 'szkic w toku' : s.job ? `zadanie: ${s.job}` : s.hasOld ? 'stara trasa → od zera' : 'nowa';
          console.log(`  ${String(i + 1).padStart(2)}. ${name.padEnd(28)} ${tag}`);
        }
      }
    }
  } catch (e) { console.error(`BŁĄD: ${e.message}`); process.exitCode = 1; } finally { await c.end(); }
}
