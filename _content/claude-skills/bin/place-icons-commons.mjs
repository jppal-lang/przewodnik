// Ikony miejsc: dostęp do Wikimedia Commons i Wikidata (sieć) — wspólny dla place-icons.mjs (wybór referencji, generowanie)
// i place-candidates.mjs (kandydaci do wyboru przez JP w panelu admina). Czyste funkcje (filtr, ranking, licencje): place-icons-lib.mjs.
import { writeFileSync } from 'node:fs';
import { qidOf, qidByName, entity } from './wikidata.mjs';
import * as L from './place-icons-lib.mjs';

export const UA = { 'User-Agent': 'QuolinoBot/1.0 (quolino.com; place icons)' };
const API = 'https://commons.wikimedia.org/w/api.php';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getJson(url) {
  // Commons ogranicza tempo (429) — czekamy wg Retry-After, do 5 prób; między zapytaniami stała przerwa (grzeczny robot)
  let last = '';
  for (let i = 0; i < 5; i++) {
    await sleep(700);
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30_000) }).catch((e) => { last = e.cause?.code ?? e.message; return null; });
    if (r?.ok) return r.json();
    if (r) last = `HTTP ${r.status}`;
    if (r && r.status !== 429 && r.status < 500) throw new Error(`Commons ${r.status}: ${url.slice(0, 160)}`);
    const ra = +(r?.headers?.get('retry-after') ?? 0);
    await sleep(Math.max(ra * 1000, 8000 * (i + 1)));
  }
  throw new Error(`Commons niedostępne (${last}): ${url.slice(0, 160)}`);
}
const api = (p) => getJson(`${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...p })}`);
const II = (width) => ({ prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: String(width), iiextmetadatalanguage: 'en',
  iiextmetadatafilter: 'Artist|Credit|LicenseShortName|UsageTerms|LicenseUrl|ImageDescription|Categories|DateTimeOriginal' });
export async function fileInfos(titles, source, width = 960) {
  const out = [];
  for (let i = 0; i < titles.length; i += 20) {
    const j = await api({ action: 'query', titles: titles.slice(i, i + 20).join('|'), ...II(width) });
    for (const pg of j.query?.pages ?? []) { const c = L.normPage(pg, source); if (c) out.push(c); }
  }
  return out;
}
export async function catMembers(cat, type, limit) {
  const j = await api({ action: 'query', list: 'categorymembers', cmtitle: `Category:${cat}`, cmtype: type, cmlimit: String(limit) });
  return (j.query?.categorymembers ?? []).map(m => m.title);
}
export async function searchTitles(q, ns, limit) {
  const j = await api({ action: 'query', list: 'search', srsearch: q, srnamespace: String(ns), srlimit: String(limit) });
  return (j.query?.search ?? []).map(s => s.title);
}
// kategoria Commons po nazwie, gdy Wikidata jej nie ma: pierwsza, która zawiera istotne słowo z nazwy przystanku
export async function findCategory(stop) {
  const words = String(stop.name_it || stop.name).toLowerCase().split(/[\s,'’()-]+/).filter(w => w.length >= 4 && w !== String(stop.city).toLowerCase());
  for (const t of await searchTitles(`${stop.name_it || stop.name} ${stop.city}`, 14, 8)) if (words.some(w => t.toLowerCase().includes(w))) return t.replace(/^Category:/, '');
  return null;
}
export async function download(url, dest) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60_000) }).catch(() => null);
    if (r?.ok && /^image\//.test(r.headers.get('content-type') ?? '')) { writeFileSync(dest, Buffer.from(await r.arrayBuffer())); return dest; }
    if (r && r.status !== 429 && r.status < 500) throw new Error(`pobieranie ${r.status}: ${url}`);
    await sleep(5000 * (i + 1));
  }
  throw new Error(`pobieranie nieudane: ${url}`);
}

// wszyscy kandydaci z Commons dla przystanku: zdjęcie główne z Wikidata (P18), kategoria (P373 / sitelink / wyszukiwanie) i jej podkategorie, wyszukiwarka
// ov = wyjątki z place-icons-data.mjs (commonsCategory, search, view)
export async function gatherCandidates(stop, ov = {}) {
  const view = L.viewMode({ category: stop.category, texts: stop.texts, override: ov.view });
  const names = [stop.name, stop.name_it, stop.name_en, stop.city].filter(Boolean);
  const cands = [];
  let cat = ov.commonsCategory ?? null;
  const qid = (await qidOf(stop.wiki_article, stop.wiki_lang || 'it').catch(() => null))
    ?? (stop.lat != null ? await qidByName(stop.name_it || stop.name, { lat: +stop.lat, lon: +stop.lon }, 'it').catch(() => null) : null);
  const e = qid ? await entity(qid).catch(() => null) : null;
  const p18 = (e?.claims?.P18 ?? []).map(c => c.mainsnak?.datavalue?.value).filter(Boolean).map(f => `File:${f}`);
  const sl = e?.sitelinks?.commonswiki?.title;
  cat ??= e?.claims?.P373?.[0]?.mainsnak?.datavalue?.value ?? (sl?.startsWith('Category:') ? sl.slice(9) : null) ?? await findCategory(stop).catch(() => null);
  if (p18.length) cands.push(...await fileInfos(p18, 'p18'));
  if (cat) {
    cands.push(...await fileInfos(await catMembers(cat, 'file', 50), 'cat'));
    const subs = (await catMembers(cat, 'subcat', 30)).filter(n => L.subcatOk(n, { names, view })).slice(0, 6);
    for (const sc of subs) cands.push(...await fileInfos(await catMembers(sc.replace(/^Category:/, ''), 'file', 15), 'subcat'));
  }
  const q = ov.search ?? `${stop.name_it || stop.name} ${stop.city}`;
  cands.push(...await fileInfos(await searchTitles(`${q} filetype:bitmap`, 6, 30), 'search'));
  return { cands, qid, cat, view, names };
}
