// Test przeglądarkowy bramki publikacji (JP 2026-11-01): node _content/claude-skills/test/publikacja-pw.mjs
// (Playwright z /opt/node-tools; nie wchodzi do test-all.sh). Tryb demo (?demo=1): RPC udawane — bramka liczona tym samym kodem
// (publish-gate.js), nic nie trafia do bazy. Sprawdza: Spello v3 (flagi nierozstrzygnięte) → „Zatwierdź i opublikuj” zablokowany,
// powód pod przyciskiem i w „Gotowość do publikacji”, kliknięcie nic nie robi; Perugia v1 (bez flag) → odblokowany, dwa kliknięcia
// → „Opublikowano v1 · tłumaczenia w kolejce · następna trasa: …”. Zrzut 1440 px: OUT (domyślnie /tmp/publikacja-blokada-1440.png).
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const ROOT = new URL('../../../', import.meta.url).pathname.replace(/\/$/, ''), OUT = process.env.OUT ?? '/tmp/publikacja-blokada-1440.png';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const srv = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = join(ROOT, p === '/' ? 'index.html' : p);
  try { statSync(f); res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' }); res.end(readFileSync(f)); }
  catch { res.writeHead(404); res.end('nie ma'); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.route('https://api.quolino.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
// demo.json: szkic Perugii bez przystanków → dajemy mu przystanki Spello v1 (bez kontroli i bez uwag = „wszystko zielone”)
await page.route('**/_admin/demo.json', route => {
  const d = JSON.parse(readFileSync(join(ROOT, '_admin', 'demo.json'), 'utf8'));
  const sp = d.versions.find(v => v.city_slug === 'spello' && v.version === 1), pg = d.versions.find(v => v.city_slug === 'perugia');
  const c = JSON.parse(JSON.stringify(sp.content));
  c.city = { ...c.city, slug: 'perugia', region_slug: 'umbria' };
  (c.city_translations || []).forEach(t => { if (t.lang === 'pl') t.title = 'Perugia'; });
  pg.content = c; pg.review = null;
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) });
});
const must = (cond, msg) => { if (!cond) { console.error('BŁĄD:', msg); process.exitCode = 1; } else console.log('ok:', msg); };
const BTN = '.tv-dec [data-act="approve"]';

// 1) Spello v3: flagi z kontroli bez odpowiedzi → zablokowane
await page.goto(`http://127.0.0.1:${port}/_admin/index.html?demo=1#/spello`, { waitUntil: 'load' });
await page.waitForSelector(BTN, { timeout: 15000 });
await page.waitForFunction(() => { const p = document.getElementById('tvGate'); return p && !p.hidden; }, null, { timeout: 5000 }).catch(() => {});
must(await page.$eval(BTN, b => b.disabled), 'Spello: przycisk „Zatwierdź i opublikuj” nieaktywny');
const why = await page.$eval('#tvGate', e => e.hidden ? '' : e.textContent);
must(/Publikacja zablokowana/.test(why) && /nierozstrzygnięt\S+ flag/.test(why), `powód pod przyciskiem: „${why.trim()}”`);
const gfs = await page.$eval('#tvGate', e => parseFloat(getComputedStyle(e).fontSize));
must(gfs >= 18, `powód ≥ 18 px (${gfs})`);
must(await page.$eval(BTN, b => b.getAttribute('aria-describedby') === 'tvGate'), 'przycisk opisany powodem (aria-describedby)');
const ready = await page.$$eval('.tv-ready__it', l => l.map(x => x.textContent));
must(ready.some(t => /^.*Publikacja.*zablokowana/.test(t)), '„Gotowość do publikacji” pokazuje, co blokuje');
await page.$eval('#readyD', d => { d.open = true; });
await page.$eval(BTN, b => b.click());
await page.waitForTimeout(200);
must(!(await page.$eval(BTN, b => b.classList.contains('is-armed'))) && !/Publikuję/.test(await page.$eval('#msg', e => e.textContent)), 'kliknięcie w zablokowany przycisk nic nie robi (bez „mimo to”)');
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: OUT });
console.log('zrzut:', OUT);

// 1b) Ancona v1: prośba o poprawkę w toku (wysłane uwagi) → nadal zablokowane
await page.goto(`http://127.0.0.1:${port}/_admin/index.html?demo=1#/ancona`, { waitUntil: 'load' });
await page.waitForSelector(BTN, { timeout: 15000 });
await page.waitForFunction(() => { const p = document.getElementById('tvGate'); return p && !p.hidden; }, null, { timeout: 5000 }).catch(() => {});
must(await page.$eval(BTN, b => b.disabled) && /poprawka #6 w toku/.test(await page.$eval('#tvGate', e => e.textContent)), 'Ancona: wysłane poprawki w toku → zablokowane z powodem');

// 2) Perugia v1: bez flag, bez uwag → odblokowane; dwa kliknięcia → publikacja, tłumaczenia, następna trasa
await page.goto(`http://127.0.0.1:${port}/_admin/index.html?demo=1#/perugia`, { waitUntil: 'load' });
await page.waitForSelector(BTN, { timeout: 15000 });
await page.waitForTimeout(400);
must(!(await page.$eval(BTN, b => b.disabled)), 'Perugia: przycisk aktywny (wszystko zielone)');
must(await page.$eval('#tvGate', e => e.hidden), 'Perugia: brak powodu blokady');
must((await page.$$eval('.tv-ready__it', l => l.map(x => x.textContent))).some(t => /Publikacja.*odblokowana/.test(t)), 'Gotowość: „Publikacja — odblokowana”');
await page.click(BTN);
const armedTxt = await page.$eval(BTN, b => b.textContent);
must(/Tłumaczenia ruszą same/.test(armedTxt) && /USD/.test(armedTxt), `potwierdzenie z szacunkiem kosztu: „${armedTxt}”`);
await page.click(BTN);
await page.waitForSelector('.tv-pubres', { timeout: 5000 });
const res = await page.$eval('.tv-pubres', e => e.textContent);
must(/^Opublikowano v1 · tłumaczenia w kolejce \(zlecenie #21: EN, potem pozostałe języki/.test(res) && /następna trasa: Orvieto/.test(res), `wynik: „${res}”`);
must(/Zgoda na koszt tłumaczeń = ta publikacja/.test(await page.$eval('.tv-pubres__n', e => e.textContent)), 'zgoda na koszt = publikacja');

must(!errors.length, `bez błędów JS${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close(); srv.close();
