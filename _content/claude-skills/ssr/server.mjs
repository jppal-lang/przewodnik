// Quolino SSR — strony miast składane z bazy przy wejściu (decyzja JP 2026-10-11, wariant 2).
// Baza zostaje jedynym źródłem prawdy: żadnych plików do generowania, zero tokenów, zmiana w bazie
// widoczna najpóźniej po CACHE_SECONDS. Google dostaje pełną warstwę publiczną w każdym języku.
//
//   GET /{lang}/{kraj}/{region}/{miasto}/ → city.html z treścią publiczną, meta, hreflang, JSON-LD (kraj = ISO, region i miasto = cities.url_slug / regions.url_slug)
//   GET /{lang}/{region}/{miasto}/ , /wlochy/…/*.html , /city.html?c=…  → 301 na nowy adres (jeden skok)
//   GET /{lang}/{kraj}/{region}/ → 302 /region.html?r=<slug wewnętrzny>, /{lang}/{kraj}/ → 302 /country.html?k=<kraj> (do czasu stron SSR; 302, bo docelowo to będą strony SSR)
//   GET /city.html (bez ?c=, np. ?draft=) → statyczny szablon bez zmian
//   GET /sitemap.xml                 → wszystkie opublikowane miasta × języki (z alternates)
//   GET /healthz
// Warstwa publiczna: opis miasta, przystanki (nazwa, opis dla rodzica, informacje praktyczne),
// plan dnia (godzina + przystanek), punkty awaryjne. GRA (questy, wskazówki, zadania foto, album)
// NIE trafia do HTML — doczytuje ją skrypt strony (później: za dostępem).
// Bez zależności: Node 20+ (fetch, http). Dane przez publiczne PostgREST (te same uprawnienia co strona).
import http from 'node:http';
import { readFileSync, statSync } from 'node:fs';

const PORT = +(process.env.PORT ?? 8080);
const API = (process.env.API_URL ?? 'https://api.quolino.com/rest/v1').replace(/\/$/, '');
const SITE = (process.env.SITE_URL ?? 'https://quolino.com').replace(/\/$/, '');
const TEMPLATE = process.env.TEMPLATE ?? '/site/city.html';
const CACHE_SECONDS = +(process.env.CACHE_SECONDS ?? 300);
const FALLBACK = 'pl';

// ── dane ────────────────────────────────────────────────────────────────────────────────────
async function api(path) {
  const r = await fetch(`${API}/${path}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`API ${r.status} ${path.slice(0, 80)}`);
  return r.json();
}
const cache = new Map();
async function cached(key, fn, ttl = CACHE_SECONDS) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttl * 1000) return hit.v;
  const v = await fn();
  cache.set(key, { v, t: Date.now() });
  if (cache.size > 2000) cache.delete(cache.keys().next().value);
  return v;
}
const enabledLangs = () => cached('langs', async () =>
  (await api('languages?select=code,priority&enabled=eq.true&order=priority')).map(l => l.code));
const regionRows = () => cached('regions', () => api('regions?select=slug,url_slug,country_slug'));
const countryRows = () => cached('countries', () => api('countries?select=slug'));
// miasta opublikowane + adresy: u = cities.url_slug, rurl = regions.url_slug (brak → wewnętrzny slug)
const publishedCities = () => cached('cities', async () => {
  const [cs, rs] = await Promise.all([api('cities?select=slug,url_slug,region_slug,country,status&status=eq.published&order=sort_order'), regionRows()]);
  const ru = Object.fromEntries(rs.map(r => [r.slug, r.url_slug || r.slug]));
  return cs.map(c => ({ ...c, u: c.url_slug || c.slug, rurl: ru[c.region_slug] || c.region_slug, country: String(c.country || '').toLowerCase() }));
});
// język miasta jest „gotowy”, gdy ma opis miasta i tłumaczenie KAŻDEGO przystanku — inaczej strona
// byłaby mieszanką języków (słabe SEO); taki język nie trafia do hreflang ani mapy strony
const cityLangs = () => cached('city_langs', async () => {
  const [ct, stops, st] = await Promise.all([api('city_translations?select=city_slug,lang'),
    api('stops?select=id,city_slug'), api('stop_translations?select=stop_id,lang')]);
  const cityOf = Object.fromEntries(stops.map(s => [s.id, s.city_slug]));
  const nStops = {}; for (const s of stops) nStops[s.city_slug] = (nStops[s.city_slug] ?? 0) + 1;
  const cnt = {}; for (const t of st) { const c = cityOf[t.stop_id]; if (c) cnt[`${c}|${t.lang}`] = (cnt[`${c}|${t.lang}`] ?? 0) + 1; }
  const m = {};
  for (const r of ct) if ((cnt[`${r.city_slug}|${r.lang}`] ?? 0) >= (nStops[r.city_slug] ?? 0)) (m[r.city_slug] ??= new Set()).add(r.lang);
  return m;
});
const uiDict = (lang) => cached(`ui:${lang}`, async () => {
  const rows = await api(`ui_translations?select=key,value,lang&lang=in.(${lang},${FALLBACK})`);
  const d = {};
  for (const r of rows.filter(r => r.lang !== lang)) d[r.key] = r.value;   // najpierw polski
  for (const r of rows) if (r.lang === lang) d[r.key] = r.value;            // nadpisany językiem strony
  return d;
}).catch(() => ({}));

async function cityData(slug, lang) {
  return cached(`city:${slug}:${lang}`, async () => {
    const [cities, ct, stops, plan, emerg] = await Promise.all([
      api(`cities?slug=eq.${encodeURIComponent(slug)}&status=eq.published&select=*`),
      api(`city_translations?city_slug=eq.${encodeURIComponent(slug)}&lang=in.(${lang},${FALLBACK})&select=*`),
      api(`stops?city_slug=eq.${encodeURIComponent(slug)}&select=*,stop_translations(*)&order=sort_order`),
      api(`day_plan?city_slug=eq.${encodeURIComponent(slug)}&lang=in.(${lang},${FALLBACK})&select=*&order=sort_order`).catch(() => []),
      api(`emergency_points?city_slug=eq.${encodeURIComponent(slug)}&lang=in.(${lang},${FALLBACK})&select=*&order=sort_order`).catch(() => []),
    ]);
    if (!cities.length) return null;
    const pick = (rows) => { const own = rows.filter(r => r.lang === lang); return own.length ? own : rows.filter(r => r.lang === FALLBACK); };
    return {
      city: cities[0],
      tr: ct.find(t => t.lang === lang) ?? ct.find(t => t.lang === FALLBACK) ?? {},
      stops: stops.map(s => ({ s, t: (s.stop_translations ?? []).find(t => t.lang === lang) ?? (s.stop_translations ?? []).find(t => t.lang === FALLBACK) ?? {} })),
      plan: pick(plan), emergency: pick(emerg),
    };
  });
}

// ── HTML ────────────────────────────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cityPath = (lang, m) => `/${lang}/${m.country}/${m.rurl}/${m.u}/`;   // m z publishedCities()
const cityUrl = (lang, m) => SITE + cityPath(lang, m);
let tpl = { mtime: 0, html: '' };
// Bez <base href="/">: <base> przestawia też kotwice (href="#p1" → strona główna) i psuje zakładki oraz pasek naklejek (JP 2026-10-13).
// Zamiast tego adresy względne w statycznym HTML szablonu (link/script/img/a: href, src, poster) zamieniamy na bezwzględne od korzenia
// (/styles.css, /i18n-ui.js, /media/…). Kotwice „#…”, „?…”, adresy z schematem i „//host” zostają. Skrypty w treści (JS budujący HTML)
// są pomijane — adresy w city.html budowane w JS są już od korzenia.
const REL = /(\s(?:href|src|poster)=")(?![a-z][a-z0-9+.-]*:|\/|#|\?)([^"]*)"/gi;
function absolutize(html) {
  const keep = [];
  const protect = html.replace(/<(script|style)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (m, tag, attrs, body) => {
    keep.push(`<${tag}${attrs.replace(REL, (x, a, v) => `${a}/${v.replace(/^\.\//, '')}"`)}>${body}</${tag}>`);
    return `\u0000${keep.length - 1}\u0000`;
  });
  return protect.replace(REL, (x, a, v) => `${a}/${v.replace(/^\.\//, '')}"`).replace(/\u0000(\d+)\u0000/g, (m, i) => keep[+i]);
}
function template() {
  const m = statSync(TEMPLATE).mtimeMs;
  if (m !== tpl.mtime) tpl = { mtime: m, html: readFileSync(TEMPLATE, 'utf8') };
  return tpl.html;
}

function publicLayer(d, lang, ui) {
  const u = (k, f) => ui[k] ?? f;
  const { tr, stops, plan, emergency, city } = d;
  const paras = (txt) => String(txt ?? '').split(/\n\s*\n/).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('');
  let h = `<article class="ssr-public" lang="${esc(lang)}">`;
  h += `<header><h1>${esc(tr.title ?? city.slug)}</h1>`;
  if (tr.region_label) h += `<p class="ssr-region">${esc(tr.region_label)}</p>`;
  if (tr.subtitle) h += `<p class="ssr-sub">${esc(tr.subtitle)}</p>`;
  h += `<p>${esc(city.duration_type === 'half_day' ? u('label.half_day', 'pół dnia') : u('label.full_day', 'cały dzień'))} · ` +
       `${esc(u('label.stops_count', '{n} przystanków').replace('{n}', stops.length))}</p></header>`;
  if (tr.lead) h += paras(tr.lead);
  if (tr.good_to_know) h += `<section><h2>${esc(u('label.good_to_know', 'Warto wiedzieć'))}</h2>${paras(tr.good_to_know)}</section>`;
  if (tr.local_food) h += `<section><h2>${esc(u('label.local_food', 'Lokalne jedzenie'))}</h2>${paras(tr.local_food)}</section>`;
  if (plan.length) {
    h += `<section><h2>${esc(u('label.today_route', 'Dzisiejsza trasa'))}</h2><ol class="ssr-plan">`;
    for (const p of plan) h += `<li>${p.time_label ? `<time>${esc(p.time_label)}</time> ` : ''}${esc(p.description)}</li>`;
    h += '</ol></section>';
  }
  h += `<section><h2>${esc(u('label.route_stops', 'Trasa punkt po punkcie'))}</h2><ol class="ssr-stops">`;
  for (const { s, t } of stops) {
    h += `<li id="p${esc(s.stop_number)}"><h3>${esc(t.name ?? s.stop_key)}</h3>`;
    for (const p of (t.desc_paragraphs ?? []).slice(0, 2)) h += `<p>${esc(p)}</p>`;
    const facts = [];
    const f = (k) => t[k] || s[k];   // fakt w języku strony, gdy przetłumaczony
    if (s.time_label) facts.push(esc(s.time_label));
    if (f('visit_duration')) facts.push(`${esc(u('label.visit_time', 'Czas zwiedzania'))}: ${esc(f('visit_duration'))}`);
    if (f('opening_hours')) facts.push(`${esc(u('label.hours', 'Godziny'))}: ${esc(f('opening_hours'))}`);
    if (f('price') && s.price_status !== 'unverified') facts.push(`${esc(u('label.ticket', 'Bilet'))}: ${esc(f('price'))}`);
    if (s.parking_cost) facts.push(`${esc(u('label.parking', 'Parking'))}: ${esc(s.parking_cost)}`);
    if (t.practical_note) facts.push(esc(t.practical_note));
    if (facts.length) h += `<p class="ssr-facts">${facts.join(' · ')}</p>`;
    h += '</li>';
  }
  h += '</ol></section>';
  if (emergency.length) {
    h += `<section><h2>${esc(u('label.emergency', 'Punkty awaryjne'))}</h2><ul>`;
    for (const e of emergency) h += `<li><strong>${esc(e.label)}</strong>${e.description ? ' — ' + esc(e.description) : ''}</li>`;
    h += '</ul></section>';
  }
  return h + '</article>';
}

function headExtra(d, lang, langs, ui, loc, names) {
  const { city, tr, stops } = d;
  const u = (k, f) => ui[k] ?? f;
  const title = `${tr.title ?? city.slug} ${u('seo.with_kids', 'z dziećmi')} — ${u('seo.trip_plan', 'plan wycieczki')} | Quolino`;
  let desc = tr.subtitle || String(tr.lead ?? '').split(/\n\s*\n/)[0] || '';
  if (desc.length > 300) desc = desc.slice(0, 297) + '…';
  const url = cityUrl(lang, loc);
  const img = city.hero_image ? `${SITE}/media/tours/${city.hero_image}-hero-1200.webp`
    : `${SITE}/media/tours/quolino-${city.country}-${city.slug}-hero-1200.webp`;
  const ld = {
    '@context': 'https://schema.org', '@type': 'TouristTrip', name: `${tr.title ?? city.slug} ${u('seo.with_kids', 'z dziećmi')}`,
    description: desc, url, inLanguage: lang, touristType: 'Family', image: img,
    itinerary: { '@type': 'ItemList', itemListElement: stops.map(({ s, t }, i) => ({
      '@type': 'ListItem', position: i + 1,
      item: { '@type': 'TouristAttraction', name: t.name ?? s.stop_key,
        ...(t.desc_paragraphs?.[0] ? { description: t.desc_paragraphs[0] } : {}),
        ...(s.lat && s.lon ? { geo: { '@type': 'GeoCoordinates', latitude: +s.lat, longitude: +s.lon } } : {}) } })) },
  };
  const crumbs = [['Quolino', `${SITE}/`], [names.country, `${SITE}/country.html?k=${encodeURIComponent(loc.country)}`],
    [names.region, `${SITE}/region.html?r=${encodeURIComponent(city.region_slug)}`], [tr.title ?? city.slug, url]].filter(c => c[0]);
  const bc = { '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c[0], item: c[1] })) };
  let h = `<link rel="canonical" href="${esc(url)}">\n` +
    `<style>.ssr-public{max-width:760px;margin:0 auto;padding:24px 20px 48px;line-height:1.55}.ssr-public h1{font-size:clamp(40px,9vw,88px);line-height:1;margin:.2em 0}.ssr-public h2{margin-top:1.4em;font-size:clamp(22px,4vw,30px)}.ssr-public h3{margin:1.2em 0 .3em}.ssr-facts{color:#5D6B82;font-size:.92em}.ssr-plan,.ssr-stops{padding-left:1.2em}</style>\n`;
  for (const l of langs) h += `<link rel="alternate" hreflang="${esc(l)}" href="${esc(cityUrl(l, loc))}">\n`;
  h += `<link rel="alternate" hreflang="x-default" href="${esc(cityUrl(FALLBACK, loc))}">\n`;
  h += `<meta name="description" content="${esc(desc)}">\n<meta property="og:type" content="article">\n` +
       `<meta property="og:title" content="${esc((tr.title ?? city.slug) + ' — Quolino')}">\n<meta property="og:description" content="${esc(desc)}">\n` +
       `<meta property="og:url" content="${esc(url)}">\n<meta property="og:image" content="${esc(img)}">\n<meta property="og:locale" content="${esc(lang)}">\n` +
       `<meta name="twitter:card" content="summary_large_image">\n`;
  h += `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>\n` +
       `<script type="application/ld+json">${JSON.stringify(bc).replace(/</g, '\\u003c')}</script>\n`;
  h += `<script>window.QSSR=${JSON.stringify({ slug: city.slug, region: city.region_slug, country: loc.country, rurl: loc.rurl, uslug: loc.u, lang, langs }).replace(/</g, '\\u003c')};</script>\n`;
  return { title, head: h };
}

const nameOf = (rows, lang) => (rows.find(r => r.lang === lang) ?? rows.find(r => r.lang === FALLBACK) ?? {}).name;
const crumbNames = (m, lang) => cached(`crumb:${m.region_slug}:${m.country}:${lang}`, async () => {
  const [rt, ct] = await Promise.all([
    api(`region_translations?region_slug=eq.${encodeURIComponent(m.region_slug)}&lang=in.(${lang},${FALLBACK})&select=lang,name`).catch(() => []),
    api(`country_translations?country_slug=eq.${encodeURIComponent(m.country)}&lang=in.(${lang},${FALLBACK})&select=lang,name`).catch(() => [])]);
  return { region: nameOf(rt, lang), country: nameOf(ct, lang) };
});

// szukanie miasta po segmentach adresu: nowy schemat (kraj, region, miasto) albo stary (region, miasto);
// segment pasuje do adresowego (url_slug) albo do dawnego wewnętrznego sluga — dzięki temu stare adresy też się znajdą
function findCity(cities, region, city, country) {
  return cities.find(c => (c.u === city || c.slug === city) && (c.rurl === region || c.region_slug === region) && (!country || c.country === country));
}
async function langsFor(meta) {
  const [langs0, byCity] = await Promise.all([enabledLangs(), cityLangs()]);
  const have = [...(byCity[meta.slug] ?? new Set([FALLBACK]))];
  return [FALLBACK, ...langs0.filter(l => l !== FALLBACK)].filter(l => have.includes(l));
}
// język, którego miasto nie ma → polski (jeden skok); inaczej wskazany
const targetLang = (lang, langs) => (langs.includes(lang) ? lang : FALLBACK);

async function renderCity(lang, country, region, slug, oldSchema) {
  const cities = await publishedCities();
  const meta = findCity(cities, region, slug, oldSchema ? null : country);
  if (!meta) return { status: 404 };
  const langs = await langsFor(meta);
  const canonical = (l) => cityPath(l, meta);
  if (oldSchema) return { status: 301, location: canonical(targetLang(lang, langs)) };            // stary /{lang}/{region}/{miasto}/
  if (!langs.includes(lang)) return { status: 302, location: canonical(FALLBACK) };
  if (country !== meta.country || region !== meta.rurl || slug !== meta.u) return { status: 301, location: canonical(lang) };  // np. dawny slug w nowym schemacie
  const d = await cityData(meta.slug, lang);
  if (!d) return { status: 404 };
  const [ui, names] = await Promise.all([uiDict(lang), crumbNames(meta, lang)]);
  const { title, head } = headExtra(d, lang, langs, ui, meta, names);
  let html = absolutize(template())
    .replace(/<html lang="[^"]*">/, `<html lang="${esc(lang)}">`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace('</head>', head + '</head>');
  // treść publiczna w miejscu „Ładowanie wycieczki…” — skrypt strony podmieni ją pełną, interaktywną wersją
  html = html.replace(/(<div class="qc-wrap" id="mainContent">)[\s\S]*?(<\/div>\s*<\/main>)/,
    (m, a, b) => `${a}\n${publicLayer(d, lang, ui)}\n${b}`);
  return { status: 200, html };
}

// 301 ze starych adresów jednym skokiem: ?c=<slug> (lub dawny url) → /{lang}/{kraj}/{region}/{miasto}/
async function legacyTarget(slug, lang, wanted) {
  const cities = await publishedCities();
  const meta = cities.find(c => c.slug === slug || c.u === slug);
  if (!meta) return null;
  const langs = await langsFor(meta);
  return cityPath(targetLang(wanted && langs.includes(wanted) ? wanted : lang || FALLBACK, langs), meta);
}

async function sitemap() {
  return cached('sitemap', async () => {
    const [cities] = await Promise.all([publishedCities()]);
    let x = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n';
    for (const c of cities) {
      const langs = await langsFor(c);
      for (const l of langs) {
        x += `<url><loc>${esc(cityUrl(l, c))}</loc>`;
        for (const a of langs) x += `<xhtml:link rel="alternate" hreflang="${a}" href="${esc(cityUrl(a, c))}"/>`;
        x += `<xhtml:link rel="alternate" hreflang="x-default" href="${esc(cityUrl(FALLBACK, c))}"/></url>\n`;
      }
    }
    return x + '</urlset>\n';
  });
}

// ── serwer ──────────────────────────────────────────────────────────────────────────────────
const send = (res, status, body, type = 'text/html; charset=utf-8', extra = {}) => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': status === 200 ? `public, max-age=${CACHE_SECONDS}` : 'no-store', ...extra });
  res.end(body);
};
const redirect = (res, to, search = '') => send(res, 301, '', 'text/plain', { Location: to + search });
const LANG = '[a-z]{2}(?:-[a-z]{2})?';
const RE_NEW = new RegExp(`^/(${LANG})/([a-z]{2})/([a-z0-9-]+)/([a-z0-9-]+)(/?)$`);   // /{lang}/{kraj}/{region}/{miasto}/
const RE_OLD = new RegExp(`^/(${LANG})/([a-z0-9-]+)/([a-z0-9-]+)(/?)$`);              // /{lang}/{region}/{miasto}/ (do 301) — ALE też /{lang}/{kraj}/{region}/ (patrz niżej)
const RE_COUNTRY = new RegExp(`^/(${LANG})/([a-z]{2})(/?)$`);                          // /{lang}/{kraj}/
const RE_WLOCHY = /^\/wlochy\/[a-z0-9-]+\/([a-z0-9-]+)\.html$/;                       // dawne statyczne strony miast
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/healthz') return send(res, 200, 'ok', 'text/plain');
    if (url.pathname === '/sitemap.xml') return send(res, 200, await sitemap(), 'application/xml; charset=utf-8');
    const q = url.searchParams;
    if (url.pathname === '/city.html') {
      const c = q.get('c');
      if (c && !q.get('draft')) {
        const to = await legacyTarget(c, FALLBACK, (q.get('lang') || '').toLowerCase());
        if (to) { q.delete('c'); q.delete('lang'); return redirect(res, to, q.toString() ? `?${q}` : ''); }
      }
      return send(res, 200, template(), 'text/html; charset=utf-8', { 'Cache-Control': 'no-cache' });   // szkic (?draft=), brak parametrów, nieznane miasto
    }
    const w = url.pathname.match(RE_WLOCHY);
    if (w) {
      const to = await legacyTarget(w[1], FALLBACK);
      return to ? redirect(res, to, url.search) : send(res, 404, '<!doctype html><title>404</title><p>Nie ma takiej wycieczki. <a href="/">Quolino</a></p>');
    }
    // Skrócone adresy: /{lang}/{kraj}/ i /{lang}/{kraj}/{region}/ → strony statyczne (302, docelowo SSR). Trzy segmenty z kodem kraju
    // w drugim to region, nie stary adres miasta (kolizja z /{lang}/{region}/{miasto}/).
    const code = async (x) => (await countryRows()).some(c => c.slug === x);
    const mc = url.pathname.match(RE_COUNTRY);
    if (mc && await code(mc[2])) return send(res, 302, '', 'text/plain', { Location: `/country.html?k=${mc[2]}&lang=${mc[1]}${url.search ? '&' + url.search.slice(1) : ''}` });
    const mr = url.pathname.match(RE_OLD);
    if (mr && await code(mr[2])) {
      const reg = (await regionRows()).find(r => r.country_slug === mr[2] && (r.url_slug === mr[3] || r.slug === mr[3]));
      if (!reg) return send(res, 404, '<!doctype html><title>404</title><p>Nie ma takiego regionu. <a href="/">Quolino</a></p>');
      return send(res, 302, '', 'text/plain', { Location: `/region.html?r=${encodeURIComponent(reg.slug)}&lang=${mr[1]}${url.search ? '&' + url.search.slice(1) : ''}` });
    }
    const n = url.pathname.match(RE_NEW);
    const o = !n && url.pathname.match(RE_OLD);
    if (n || o) {
      const [lang, country, region, slug, slash] = n ? [n[1], n[2], n[3], n[4], n[5]] : [o[1], null, o[2], o[3], o[4]];
      const r = await renderCity(lang, country, region, slug, !!o);
      if (r.location) return send(res, r.status, '', 'text/plain', { Location: r.location + url.search });
      if (r.status !== 200) return send(res, 404, '<!doctype html><title>404</title><p>Nie ma takiej wycieczki. <a href="/">Quolino</a></p>');
      if (!slash) return redirect(res, url.pathname + '/', url.search);                 // bez końcowego „/” — tylko dla istniejącej strony
      return send(res, 200, r.html);
    }
    send(res, 404, 'not found', 'text/plain');
  } catch (e) {
    console.error(new Date().toISOString(), req.url, e.message);
    send(res, 503, '<!doctype html><title>Quolino</title><p>Chwilowy problem — spróbuj za moment.</p>', 'text/html; charset=utf-8', { 'Retry-After': '30' });
  }
}).listen(PORT, () => console.log(`quolino-ssr :${PORT} · API ${API} · SITE ${SITE}`));
