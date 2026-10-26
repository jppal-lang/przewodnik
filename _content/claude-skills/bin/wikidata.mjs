// Wikidata: twarde dane o zabytkach bez AI i bez tokenów (JP 2026-10-26).
// Daty, autorzy, patroni, styl, ochrona, wysokość, strona oficjalna, współrzędne — z elementu Wikidata
// powiązanego z artykułem Wikipedii przystanku. Używane w researchu (pewne fakty z URL) i do sprawdzenia pinezek.
const UA = { 'User-Agent': 'QuolinoBot/1.0 (quolino.com)' };   // tylko ASCII — inaczej fetch odrzuca nagłówek
const cache = new Map();
async function getJson(url) {
  if (cache.has(url)) return cache.get(url);
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  const j = r?.ok ? await r.json().catch(() => null) : null;
  cache.set(url, j); return j;
}
export async function qidOf(title, lang = 'it') {
  if (!title) return null;
  const t = String(title).replace(/^https?:\/\/[a-z-]+\.wikipedia\.org\/wiki\//, '');
  const j = await getJson(`https://${lang}.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageprops&ppprop=wikibase_item&titles=${encodeURIComponent(decodeURIComponent(t))}`);
  const pg = Object.values(j?.query?.pages ?? {})[0];
  return pg?.pageprops?.wikibase_item ?? null;
}
// szukanie po nazwie, gdy przystanek nie ma artykułu: pierwszy wynik w promieniu 3 km od miasta
export async function qidByName(name, near, lang = 'it') {
  const j = await getJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=${lang}&limit=5&search=${encodeURIComponent(name)}`);
  for (const h of j?.search ?? []) {
    const e = await entity(h.id); const c = coordOf(e);
    if (c && near && dist(c, near) < 3000) return h.id;
  }
  return null;
}
async function entity(qid) { const j = await getJson(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`); return j?.entities?.[qid] ?? null; }
const coordOf = (e) => { const v = e?.claims?.P625?.[0]?.mainsnak?.datavalue?.value; return v ? { lat: v.latitude, lon: v.longitude } : null; };
export function dist(a, b) { const R = 6371e3, r = (x) => x * Math.PI / 180; const d = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(d)); }
const PROPS = { P571: 'powstanie / rozpoczęcie budowy', P580: 'od', P582: 'do', P84: 'architekt', P170: 'twórca', P88: 'fundator / zleceniodawca',
  P825: 'wezwanie (patron)', P138: 'nazwany od', P149: 'styl architektoniczny', P1435: 'status ochrony', P2044: 'wysokość n.p.m. (m)',
  P2048: 'wysokość (m)', P2043: 'długość (m)', P186: 'materiał', P856: 'strona oficjalna', P131: 'położenie (jednostka)', P31: 'rodzaj obiektu', P1619: 'otwarcie', P2046: 'powierzchnia' };
async function labels(ids, langs = ['pl', 'it', 'en']) {
  if (!ids.length) return {};
  const out = {};
  for (let i = 0; i < ids.length; i += 40) {
    const j = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels&languages=${langs.join('|')}&ids=${ids.slice(i, i + 40).join('|')}`);
    for (const [id, e] of Object.entries(j?.entities ?? {})) out[id] = langs.map(l => e.labels?.[l]?.value).find(Boolean) ?? id;
  }
  return out;
}
function val(dv) {
  if (!dv) return null;
  if (dv.type === 'wikibase-entityid') return { q: dv.value.id };
  if (dv.type === 'time') { const t = dv.value.time, p = dv.value.precision; const y = t.match(/^([+-])0*(\d+)/); const yr = y ? (y[1] === '-' ? `${y[2]} p.n.e.` : y[2]) : t;
    return p >= 11 ? t.slice(1, 11) : p === 10 ? t.slice(1, 8) : p === 9 ? yr : p === 8 ? `lata ${yr.slice(0, -1)}0.` : p === 7 ? `${Math.ceil(+y[2] / 100)} wiek` : yr; }
  if (dv.type === 'quantity') return String(+dv.value.amount);
  if (dv.type === 'string' || dv.type === 'monolingualtext') return dv.value.text ?? dv.value;
  return null;
}
// fakty elementu jako linie Markdown z URL Wikidata (do researchu przystanku)
export async function facts(qid) {
  const e = await entity(qid); if (!e) return null;
  const rows = [], qs = new Set();
  for (const [p, name] of Object.entries(PROPS)) for (const c of (e.claims?.[p] ?? []).slice(0, 4)) {
    const v = val(c.mainsnak?.datavalue); if (v == null) continue;
    rows.push({ p, name, v }); if (v.q) qs.add(v.q);
  }
  const L = await labels([...qs]);
  const url = `https://www.wikidata.org/wiki/${qid}`;
  const by = {}; for (const r of rows) (by[r.name] ??= []).push(r.v.q ? L[r.v.q] ?? r.v.q : r.v);
  const c = coordOf(e);
  return { qid, url, coord: c, label: (await labels([qid]))[qid],
    lines: Object.entries(by).map(([k, vs]) => `- ${k}: ${[...new Set(vs)].join(', ')} — źródło: ${url}`).concat(c ? [`- współrzędne: ${c.lat.toFixed(5)}, ${c.lon.toFixed(5)} — źródło: ${url}`] : []),
    website: by['strona oficjalna']?.[0] ?? null };
}
// dane Wikidata przystanku (z artykułu Wikipedii, a bez niego — po nazwie w pobliżu miasta)
export async function stopWikidata(m, { lang = 'it', near = null, name = null } = {}) {
  const qid = (await qidOf(m.wiki_article, m.wiki_lang || lang)) ?? (name ? await qidByName(name, near, lang) : null);
  return qid ? facts(qid) : null;
}
// test ręczny: node wikidata.mjs "Tempio_del_Valadier" it
if (import.meta.url === `file://${process.argv[1]}`) {
  const q = await qidOf(process.argv[2], process.argv[3] ?? 'it');
  const f = q && await facts(q);
  console.log(q ?? 'brak elementu', '\n' + (f?.lines ?? []).join('\n'));
}
