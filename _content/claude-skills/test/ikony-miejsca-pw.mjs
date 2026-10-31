// Test przeglądarkowy ikon miejsc (JP 2026-10-31): node _content/claude-skills/test/ikony-miejsca-pw.mjs (Playwright z /opt/node-tools; nie wchodzi do test-all.sh).
// Uruchamia lokalny serwer plików repo, mockuje api.quolino.com, sprawdza kartę + pasek naklejek i zapisuje zrzut 390 px (ścieżka OUT).
// Playwright: lokalna city.html z zamockowanym API — jeden przystanek z icon='place-frasassi-tempio-del-valadier' (plik jest w media/icons),
// drugi bez (ikona kategorii). Sprawdza kartę i pasek naklejek, robi zrzut 390 px.
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const ROOT = new URL('../../../', import.meta.url).pathname.replace(/\/$/, ''), OUT = process.env.OUT ?? '/tmp/ikona-miejsca-390.png';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = join(ROOT, p === '/' ? 'index.html' : p);
  try { statSync(f); res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' }); res.end(readFileSync(f)); }
  catch { res.writeHead(404); res.end('nie ma'); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;

const stops = [
  { stop_id: 1, stop_number: 1, sort_order: 1, stop_key: 'parcheggio', category: 'parking', icon: null, hero_image: null, lang: 'pl', name: 'Parking', desc_paragraphs: ['Parking przy wejściu.'], paragraphs_total: 1, has_mission: false, blocks: [] },
  { stop_id: 2, stop_number: 2, sort_order: 2, stop_key: 'grotte', category: 'monument', icon: null, hero_image: null, lang: 'pl', name: 'Grotte di Frasassi', desc_paragraphs: ['Jaskinie.'], paragraphs_total: 1, has_mission: true, blocks: [] },
  { stop_id: 6, stop_number: 3, sort_order: 3, stop_key: 'tempio-del-valadier', category: 'church', icon: 'place-frasassi-tempio-del-valadier', hero_image: null, lang: 'pl', name: 'Tempio del Valadier', desc_paragraphs: ['Świątynia w skale.'], paragraphs_total: 1, has_mission: true, blocks: [] },
  { stop_id: 7, stop_number: 4, sort_order: 4, stop_key: 'brak-pliku', category: 'museum', icon: 'place-frasassi-nie-ma-takiego', hero_image: null, lang: 'pl', name: 'Ikona bez pliku (zapas)', desc_paragraphs: ['Test zapasu.'], paragraphs_total: 1, has_mission: false, blocks: [] },
];
const tables = {
  cities: [{ slug: 'frasassi', country: 'it', region: 'marche', region_slug: 'marche', lat: 43.4, lon: 12.97, bandana_color: '#0B4EA2', duration_type: 'full_day', duration_hours: 7, hero_image: null, url_slug: 'frasassi', status: 'published' }],
  city_translations: [{ city_slug: 'frasassi', lang: 'pl', title: 'Frasassi', region_label: 'Marche', subtitle: 'Jaskinie i świątynia w skale', lead: 'Test.' }],
  public_stops: stops, languages: [{ code: 'pl', name_native: 'Polski', flag_code: 'pl' }], ui_translations: [], regions: [{ slug: 'marche', country_slug: 'it' }],
  region_translations: [{ region_slug: 'marche', lang: 'pl', name: 'Marche', description: '' }], country_translations: [{ country_slug: 'it', lang: 'pl', name: 'Włochy' }],
  countries: [{ slug: 'it', flag_code: 'it', sort_order: 1, continent: 'europe' }],
};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.route('https://api.quolino.com/**', route => {
  const u = new URL(route.request().url()), seg = u.pathname.replace('/rest/v1/', '');
  if (seg.startsWith('rpc/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  const rows = tables[seg];
  if (!rows) return route.fulfill({ status: 404, contentType: 'application/json', body: '[]' });
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
});
await page.goto(`http://127.0.0.1:${port}/city.html?c=frasassi&lang=pl`, { waitUntil: 'load' });
await page.waitForSelector('.qc-stop#p3 .qc-icon img', { state: 'attached', timeout: 15000 });
await page.evaluate(() => { document.querySelectorAll('details.qc-stop').forEach(d => { d.open = true; }); });
// telefon = widok stronicowany (.qc-paged: widać jeden przystanek) — przechodzimy po pasku naklejek do #2, #4, #3
for (const n of [2, 4, 3]) { await page.click(`.qc-strip__stk[data-strip-num="${n}"]`); await page.waitForTimeout(900); }
await page.waitForFunction(() => [...document.querySelectorAll('.qc-stop#p2 .qc-icon img, .qc-stop#p3 .qc-icon img, .qc-stop#p4 .qc-icon img, .qc-strip__stk img')].every(i => i.complete), null, { timeout: 15000 });
await page.waitForTimeout(800);
const got = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const card = (n) => { const i = q(`.qc-stop#p${n} .qc-icon img`); return i ? { src: i.getAttribute('src'), srcset: i.getAttribute('srcset'), cur: i.currentSrc.replace(/^https?:\/\/[^/]+/, ''), hasImg: q(`.qc-stop#p${n} .qc-icon`).classList.contains('has-img'), w: i.naturalWidth } : null; };
  const strip = (n) => { const i = q(`.qc-strip__stk[data-strip-num="${n}"] img`); return i ? { src: i.getAttribute('src'), srcset: i.getAttribute('srcset'), cur: i.currentSrc.replace(/^https?:\/\/[^/]+/, ''), w: i.naturalWidth } : null; };
  return { c2: card(2), c3: card(3), c4: card(4), s2: strip(2), s3: strip(3), s4: strip(4) };
});
console.log(JSON.stringify(got, null, 1));
const must = (cond, msg) => { if (!cond) { console.error('BŁĄD:', msg); process.exitCode = 1; } };
must(got.c3 && got.c3.src === '/media/icons/place-frasassi-tempio-del-valadier-256.webp' && got.c3.cur === '/media/icons/place-frasassi-tempio-del-valadier-512.webp' && got.c3.w === 256 && got.c3.hasImg, 'karta #3: ikona miejsca (2x = 512) widoczna');
must(got.c3 && /place-frasassi-tempio-del-valadier-512\.webp 2x/.test(got.c3.srcset), 'karta #3: srcset 2x = 512');
must(got.s3 && got.s3.src === '/media/icons/place-frasassi-tempio-del-valadier-128.webp' && got.s3.cur === '/media/icons/place-frasassi-tempio-del-valadier-256.webp' && got.s3.w === 128, 'pasek #3: ikona miejsca (2x = 256)');
must(got.c2 && got.c2.src === '/media/icons/icon-monument-256.webp' && got.c2.w === 128 && got.c2.hasImg, 'karta #2: ikona kategorii');
must(got.s2 && got.s2.src === '/media/icons/icon-monument-128.webp', 'pasek #2: ikona kategorii');
must(got.c4 && got.c4.src === '/media/icons/icon-museum-256.webp' && got.c4.w === 128 && got.c4.hasImg, 'karta #4: brak pliku → zapas = ikona kategorii');
must(got.s4 && got.s4.src === '/media/icons/icon-museum-128.webp' && got.s4.w === 128, 'pasek #4: brak pliku → zapas');
must(!errors.length, 'błędy JS: ' + errors.join(' | '));
await page.evaluate(() => { document.querySelector('.qc-stop#p3').scrollIntoView({ block: 'start' }); window.scrollBy(0, -90); });
await page.waitForTimeout(500);
await page.screenshot({ path: OUT, fullPage: false });
console.log('zrzut:', OUT, process.exitCode ? 'BŁĘDY' : 'OK');
await browser.close(); srv.close();
