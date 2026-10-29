#!/usr/bin/env node
// Quolino — grafiki podglądu linku (og:image) 1200×630 JPG < 300 KB (I-4, JP 2026-10-29).
// Uruchamiane ręcznie po publikacji miasta albo nowego języka — NIE jest częścią strony (zero build stepu strony).
//
//   node _content/claude-skills/bin/og-images.mjs            # wszystkie opublikowane miasta × gotowe języki + ogólna
//   node _content/claude-skills/bin/og-images.mjs spello     # tylko jedno miasto (wszystkie jego języki)
//   node _content/claude-skills/bin/og-images.mjs --home     # tylko ogólna grafika strony głównej
//
// Wynik: media/og/<slug>-<lang>.jpg (jeden plik na miasto i język: tytuł „Spello z dziećmi”, „Spello with kids”…
// i licznik przystanków są w języku strony), media/og/quolino.jpg (strona główna, kraj, region — bez tekstu w języku).
// Języki miasta = te z mapy adresów SSR (/pl/paths/), czyli tylko gotowe wersje (opis + wszystkie przystanki).
// Grafika Quo bez zmian: kadr hero miasta (media/tours/*-hero-1200.webp, Quo na zdjęciu) albo poza z media/icons;
// skrypt robi wyłącznie kompozycję „album naklejek” (tokeny i font ze styles.css).
// Dane: publiczne GET-y z API (te same co strona). Render: Playwright/Chromium (HTML → JPG), bez innych zależności.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');      // repo przewodnik/
const API = (process.env.API_URL ?? 'https://api.quolino.com/rest/v1').replace(/\/$/, '');
const SITE = (process.env.SITE_URL ?? 'https://quolino.com').replace(/\/$/, '');
const OUT = join(ROOT, 'media/og');
const MAX = 300 * 1024;
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50d3BqY3VwZmZkb3pzdGJpamhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMzc5MTUsImV4cCI6MjEwMjgxMzkxNX0.OddjLt-gKKmj2H7wrEKJ14CXrsXu0L4UBO2GC9OiCGo';   // klucz publiczny (anon), jak na stronie

const args = process.argv.slice(2);
const onlyHome = args.includes('--home');
const onlyCity = args.find(a => !a.startsWith('--'));

async function get(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`${r.status} ${url.slice(0, 100)}`);
  return r.json();
}
const api = (p) => get(`${API}/${p}`);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// odmiana licznika przystanków jak na stronie regionu (pl: 1 przystanek / 2–4 przystanki / 5+ przystanków)
function plForm(n, f) { const m = n % 10, h = n % 100; return n === 1 ? f[0] : (m >= 2 && m <= 4 && !(h >= 12 && h <= 14)) ? f[1] : f[2]; }
function stopsLabel(n, lang, ui) {
  if (lang === 'pl') return `${n} ${plForm(n, ['przystanek', 'przystanki', 'przystanków'])}`;
  const m = n % 10, h = n % 100;
  const few = ['cs', 'sk', 'uk', 'hr'].includes(lang) && m >= 2 && m <= 4 && !(h >= 12 && h <= 14);
  return String((few && ui['label.stops_count_few']) || ui['label.stops_count'] || '{n} stops').replace('{n}', n);
}
// kolor drużyny → czytelny tekst na nim (jak --team-ink na stronie)
function inkOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return '#FFFFFF';
  const v = parseInt(m[1], 16), ch = [v >> 16, (v >> 8) & 255, v & 255].map(c => { c /= 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2] > 0.36 ? '#0E1A2B' : '#FFFFFF';
}

// ── kompozycja: strona albumu (kropki), naklejka z kadrem Quo, nazwa miasta wersalikami ────────────
const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1200px;height:630px;overflow:hidden}
body{font-family:'Archivo','Noto Sans','DejaVu Sans',sans-serif;color:var(--ink);background-color:var(--page);
  background-image:radial-gradient(rgba(11,78,162,.11) 1.3px,transparent 1.7px);background-size:15px 15px;-webkit-font-smoothing:antialiased}
.og{position:relative;width:1200px;height:630px}
.og-logo{position:absolute;left:64px;top:52px;display:inline-flex;align-items:center;gap:9px;padding:10px 18px 10px 16px;border-radius:12px;background:var(--azzurro);color:#fff;box-shadow:var(--lift-1)}
.og-logo b{font-stretch:62%;font-weight:900;font-size:34px;text-transform:uppercase;letter-spacing:.01em;line-height:1}
.og-logo i{width:12px;height:12px;border-radius:50%;background:var(--sun)}
.og-logo span{font-stretch:75%;font-weight:700;font-size:24px;opacity:.85;text-transform:uppercase;letter-spacing:.05em}
.og-copy{position:absolute;left:64px;top:150px;width:560px}
.og-name{font-stretch:62%;font-weight:900;text-transform:uppercase;line-height:.88;letter-spacing:-.005em;color:var(--ink);white-space:nowrap}
.og-kids{margin-top:12px;font-stretch:75%;font-weight:800;font-size:50px;line-height:1.05;color:var(--azzurro)}
.og-chips{margin-top:30px;display:flex;flex-direction:column;align-items:flex-start;gap:12px}
.og-chip{display:inline-flex;align-items:center;gap:12px;padding:10px 18px;border-radius:10px;background:var(--card);box-shadow:var(--lift-1);font-weight:800;font-size:28px;line-height:1.15;max-width:560px}
.og-chip--team{background:var(--team);color:var(--team-ink)}
.og-chip .no{display:grid;place-items:center;min-width:52px;height:40px;padding:0 10px;border-radius:8px;background:var(--azzurro);color:#fff;font-stretch:125%;font-weight:900;font-size:24px}
.og-place{position:absolute;left:64px;bottom:44px;font-stretch:75%;font-weight:700;font-size:24px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.og-stk{position:absolute;right:56px;top:58px;width:500px;padding:10px 10px 0;border-radius:14px;background:var(--card);box-shadow:var(--lift-3);transform:rotate(2deg)}
.og-stk .og-art{display:block;width:480px;height:440px;border-radius:8px;overflow:hidden;background:var(--team)}
.og-stk .og-art img{display:block;width:100%;height:100%;object-fit:cover}
.og-stk .og-cap{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:12px 6px 12px}
.og-stk .og-cap b{font-stretch:62%;font-weight:900;text-transform:uppercase;font-size:34px;line-height:1}
.og-stk .og-cap span{font-stretch:75%;font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-size:22px;color:var(--muted)}
.og-stk .og-band{height:12px;margin:0 -10px;border-radius:0 0 14px 14px;background:var(--team)}
.og-stk .og-no{position:absolute;top:-14px;left:-14px;display:grid;place-items:center;min-width:62px;height:48px;padding:0 12px;border-radius:10px;background:var(--sun);color:var(--sun-ink);font-stretch:125%;font-weight:900;font-size:26px;box-shadow:var(--lift-1)}
/* strona główna */
.og-home .og-name{font-size:148px}
.og-home .og-kids{font-size:58px}
.og-sheet{position:absolute;right:40px;top:40px;width:560px;height:550px}
.og-sheet .og-s{position:absolute;width:250px;padding:8px 8px 0;border-radius:12px;background:var(--card);box-shadow:var(--lift-2)}
.og-sheet .og-s .og-art{display:block;width:234px;height:234px;border-radius:7px;overflow:hidden;background:var(--team)}
.og-sheet .og-s img{display:block;width:100%;height:100%;object-fit:cover}
.og-sheet .og-s .og-band{height:10px;margin:8px -8px 0;border-radius:0 0 12px 12px;background:var(--team)}
.og-sheet .og-s .og-no{position:absolute;top:-10px;left:-10px;display:grid;place-items:center;min-width:52px;height:40px;border-radius:8px;background:var(--azzurro);color:#fff;font-stretch:125%;font-weight:900;font-size:22px;box-shadow:var(--lift-1)}
.og-sheet .og-quo{position:absolute;right:-6px;bottom:-14px;width:290px;height:290px;filter:drop-shadow(0 14px 18px rgba(6,42,88,.28))}
`;

function page(body, cls = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/styles.css"><style>${BASE_CSS}</style></head>` +
    `<body><div class="og ${cls}">${body}</div></body></html>`;
}
function cityCard(c) {
  const team = c.color || '#0B4EA2';
  return page(
    `<div class="og-logo"><b>Quolino</b><i></i><span>com</span></div>` +
    `<div class="og-copy"><div class="og-name" data-fit="560" data-max="170">${esc(c.name)}</div>` +
    `<div class="og-kids">${esc(c.kids)}</div>` +
    `<div class="og-chips"><span class="og-chip og-chip--team" style="--team:${esc(team)};--team-ink:${inkOn(team)}">${esc(c.stops)}</span>` +
    (c.chip ? `<span class="og-chip">${esc(c.chip)}</span>` : '') + `</div></div>` +
    (c.place ? `<div class="og-place">${esc(c.place)}</div>` : '') +
    `<figure class="og-stk" style="--team:${esc(team)}"><span class="og-art"><img src="${esc(c.img)}" alt=""></span>` +
    `<figcaption class="og-cap"><b>${esc(c.name)}</b><span>${esc(c.region)}</span></figcaption><span class="og-band"></span></figure>`);
}
function homeCard(tiles, chip) {
  const pos = [[0, 10, -3], [270, 0, 2.5], [40, 280, 1.5]];
  return page(
    `<div class="og-logo"><b>Quolino</b><i></i><span>com</span></div>` +
    `<div class="og-copy" style="top:170px"><div class="og-name" data-fit="560" data-max="148">Quolino</div>` +
    `<div class="og-kids">Let's Explore!</div>` +
    `<div class="og-chips"><span class="og-chip og-chip--team" style="--team:var(--azzurro);--team-ink:#fff">${esc(chip)}</span></div></div>` +
    `<div class="og-sheet">` + tiles.slice(0, 3).map((t, i) => `<span class="og-s" style="left:${pos[i][0]}px;top:${pos[i][1]}px;transform:rotate(${pos[i][2]}deg);--team:${esc(t.color || '#0B4EA2')}">` +
      `<span class="og-no">${String(i + 1).padStart(2, '0')}</span><span class="og-art"><img src="${esc(t.img)}" alt=""></span><span class="og-band"></span></span>`).join('') +
    `<img class="og-quo" src="/media/icons/pose-13-celebration-jump-512.webp" alt=""></div>`, 'og-home');
}

// ── render ──────────────────────────────────────────────────────────────────────────────────
const TYPES = { '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
async function renderer() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const pg = await ctx.newPage();
  let html = '';
  await pg.route('http://og.local/**', async (route) => {
    const p = decodeURIComponent(new URL(route.request().url()).pathname);
    if (p === '/card') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    const f = join(ROOT, p);
    if (!f.startsWith(ROOT) || !existsSync(f)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: TYPES[extname(f)] ?? 'application/octet-stream', body: readFileSync(f) });
  });
  return {
    async shot(doc, file) {
      html = doc;
      await pg.goto('http://og.local/card', { waitUntil: 'networkidle' });
      await pg.evaluate(async () => {
        await document.fonts.ready;
        // nazwa miasta: największy rozmiar, który mieści się w kolumnie (Montefalco, Sansepolcro, Ravenna…)
        for (const el of document.querySelectorAll('[data-fit]')) {
          let size = +el.dataset.max; el.style.fontSize = size + 'px';
          while (el.scrollWidth > +el.dataset.fit && size > 60) { size -= 4; el.style.fontSize = size + 'px'; }
        }
      });
      let q = 86, buf;
      do { buf = await pg.screenshot({ type: 'jpeg', quality: q }); q -= 6; } while (buf.length > MAX && q > 40);
      writeFileSync(file, buf);
      return buf.length;
    },
    close: () => browser.close(),
  };
}

// ── dane ────────────────────────────────────────────────────────────────────────────────────
async function main() {
  mkdirSync(OUT, { recursive: true });
  const [cities, ctr, rtr, kraje, pc, paths] = await Promise.all([
    api('cities?select=slug,country,region_slug,bandana_color,hero_image,sort_order&status=eq.published&order=sort_order'),
    api('city_translations?select=city_slug,lang,title'),
    api('region_translations?select=region_slug,lang,name'),
    api('country_translations?select=country_slug,lang,name'),
    api('public_cities?select=slug,stops_count'),
    get(`${SITE}/pl/paths/`).catch(() => ({})),
  ]);
  const ui = {};
  for (const r of await api('ui_translations?select=key,lang,value&key=in.(seo.with_kids,label.stops_count,label.stops_count_few,home.chip)')) (ui[r.lang] ??= {})[r.key] = r.value;
  const pick = (rows, key, id, lang, f = 'name') => (rows.find(r => r[key] === id && r.lang === lang && r[f]) ?? rows.find(r => r[key] === id && r.lang === 'pl' && r[f]) ?? {})[f];
  const heroOf = (c) => `/media/tours/${c.hero_image || `quolino-${c.country}-${c.slug}`}-hero-1200.webp`;
  const r = await renderer();
  const report = [];
  try {
    if (!onlyCity) {
      const tiles = cities.filter(c => existsSync(join(ROOT, `media/tours/${c.hero_image || `quolino-${c.country}-${c.slug}`}-tile-768.webp`)))
        .map(c => ({ color: c.bandana_color, img: `/media/tours/${c.hero_image || `quolino-${c.country}-${c.slug}`}-tile-768.webp` }));
      const hp = tiles.length >= 3 ? [tiles[3] ?? tiles[0], tiles[0], tiles[1]] : tiles;   // Spello, Perugia, Urbino (kolejność sort_order)
      // regiony z gotowymi trasami po włosku (nazwy własne, bez tekstu w języku strony — jedna grafika na wszystkie języki)
      const regs = [...new Set(cities.map(c => c.region_slug))].map(s => pick(rtr, 'region_slug', s, 'it')).filter(Boolean);
      report.push(['quolino.jpg', await r.shot(homeCard(hp, regs.join(' · ')), join(OUT, 'quolino.jpg'))]);
    }
    if (!onlyHome) {
      for (const c of cities) {
        if (onlyCity && c.slug !== onlyCity) continue;
        if (!existsSync(join(ROOT, heroOf(c)))) { console.warn(`! ${c.slug}: brak ${heroOf(c)} — pomijam`); continue; }
        const langs = Object.keys(paths[c.slug] ?? { pl: 1 });
        const n = pc.find(p => p.slug === c.slug)?.stops_count ?? 0;
        for (const lang of langs) {
          const U = { ...(ui.en ?? {}), ...(ui[lang] ?? {}) };
          const card = {
            name: pick(ctr, 'city_slug', c.slug, lang, 'title') || c.slug,
            kids: U['seo.with_kids'] || ui.pl?.['seo.with_kids'] || 'z dziećmi',
            stops: stopsLabel(n, lang, U), chip: U['home.chip'],
            region: pick(rtr, 'region_slug', c.region_slug, lang) || '',
            place: [pick(rtr, 'region_slug', c.region_slug, lang), pick(kraje, 'country_slug', c.country, lang)].filter(Boolean).join(' · '),
            no: String(n).padStart(2, '0'), color: c.bandana_color, img: heroOf(c),
          };
          const file = `${c.slug}-${lang}.jpg`;
          report.push([file, await r.shot(cityCard(card), join(OUT, file))]);
        }
      }
    }
  } finally { await r.close(); }
  for (const [f, b] of report) console.log(`${(b / 1024).toFixed(0).padStart(4)} KB  media/og/${f}${b > MAX ? '  ! ponad 300 KB' : ''}`);
  console.log(`${report.length} grafik w media/og/`);
}
main().catch(e => { console.error(e); process.exit(1); });
