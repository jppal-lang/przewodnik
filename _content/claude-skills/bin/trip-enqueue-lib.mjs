// Nowa trasa do kolejki Gemini — czyste funkcje i INSERT przez przekazane q(sql, params) (bez lib.mjs, żeby testy szły bez pg).
// Użycie: bin/trip-enqueue.mjs (CLI, zlecenie z repo), testy: bin/trip-enqueue.test.mjs. Opis całości w trip-enqueue.mjs.

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;
export const DURATIONS = ['half_day', 'full_day'];

// „Asyż” → asyz, „Rawenna” → rawenna, „Città di Castello” → citta-di-castello (jak slug() w _admin/admin.js + ł/Ł, których NFD nie rozkłada)
export function slugify(name) {
  return String(name ?? '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// argv → { slug, name, region, country, duration, brief, fresh, dry } (bez walidacji)
export function parseArgs(argv) {
  const o = { slug: null, name: null, region: null, country: 'it', duration: 'half_day', brief: '', fresh: false, dry: false };
  const take = (i) => { const v = argv[i + 1]; if (v == null || /^--/.test(v)) throw new Error(`${argv[i]}: brak wartości`); return v; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--name') o.name = take(i++);
    else if (a === '--region') o.region = take(i++);
    else if (a === '--country') o.country = take(i++);
    else if (a === '--duration') o.duration = take(i++);
    else if (a === '--brief') o.brief = take(i++);
    else if (a === '--fresh') o.fresh = true;
    else if (a === '--dry') o.dry = true;
    else if (/^--/.test(a)) throw new Error(`nieznana opcja ${a}`);
    else if (o.slug == null) o.slug = a;
    else throw new Error(`nadmiarowy argument ${a}`);
  }
  return o;
}

// te same reguły co admin.admin_trip_enqueue (region z public.regions sprawdza baza) → komunikat albo null
export function validate(o) {
  if (!SLUG_RE.test(o.slug ?? '')) return 'slug: małe litery, cyfry i myślniki, 2–63 znaki (np. asyz)';
  const name = String(o.name ?? '').trim();
  if (name.length < 2 || name.length > 80) return 'nazwa (--name): od 2 do 80 znaków';
  if (/[\n\r"]/.test(name)) return 'nazwa bez cudzysłowów i nowych linii';
  if (!SLUG_RE.test(o.region ?? '')) return 'region (--region): slug z public.regions, np. umbria, marche';
  if (!/^[a-z]{2}$/.test(o.country ?? '')) return 'kraj (--country): dwuliterowy kod, np. it';
  if (!DURATIONS.includes(o.duration)) return 'czas (--duration): half_day albo full_day';
  if (String(o.brief ?? '').length > 2000) return 'życzenia (--brief): najwyżej 2000 znaków';
  return null;
}

// treść kolumny ops.jobs.request — dokładnie klucze, których oczekuje gemini-queue.mjs
export function buildRequest(o) {
  const r = { name: String(o.name).trim(), region: o.region, country: o.country, duration: o.duration };
  const brief = String(o.brief ?? '').trim();
  if (brief) r.brief = brief;
  if (o.fresh) r.fresh = true;
  return r;
}

// q(sql, params) → wiersze. Zwraca { id, created: true } albo { id, created: false } (istniejące zadanie queued/running).
export async function enqueue(o, q) {
  const bad = validate(o);
  if (bad) throw new Error(bad);
  const [reg] = await q('SELECT slug FROM public.regions WHERE slug = $1', [o.region]);
  if (!reg) throw new Error(`nieznany region „${o.region}” — nie ma go w public.regions`);
  const [dup] = await q(`SELECT id FROM ops.jobs WHERE city_slug = $1 AND kind = 'draft' AND worker = 'gemini' AND status IN ('queued', 'running') ORDER BY id LIMIT 1`, [o.slug]);
  if (dup) return { id: dup.id, created: false, request: null };
  const req = buildRequest(o);
  if (o.dry) return { id: null, created: false, dry: true, request: req };
  const [row] = await q(`INSERT INTO ops.jobs (city_slug, kind, worker, status, request) VALUES ($1, 'draft', 'gemini', 'queued', $2) RETURNING id`,
    [o.slug, JSON.stringify(req)]);
  return { id: row.id, created: true, request: req };
}

