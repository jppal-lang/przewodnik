// Test przeglądarkowy okna „+ Nowa trasa” w panelu (JP 2026-11-01): node _content/claude-skills/test/nowa-trasa-pw.mjs
// (Playwright z /opt/node-tools; nie wchodzi do test-all.sh). Tryb demo (?demo=1): RPC udawane, nic nie trafia do bazy.
// Sprawdza: przycisk na liście Trasy i na Pulpicie, slug z nazwy („Asyż” → asyz), walidację (brak regionu), „Przepisz od zera”
// przy starej trasie (fresh zaznaczone + ostrzeżenie), zlecenie udawane → komunikat z linkiem do Pipeline, Esc zamyka, focus wraca.
// Zrzut 1440 px: OUT (domyślnie /tmp/nowa-trasa-1440.png).
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const ROOT = new URL('../../../', import.meta.url).pathname.replace(/\/$/, ''), OUT = process.env.OUT ?? '/tmp/nowa-trasa-1440.png';
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
const must = (cond, msg) => { if (!cond) { console.error('BŁĄD:', msg); process.exitCode = 1; } else console.log('ok:', msg); };

await page.goto(`http://127.0.0.1:${port}/_admin/index.html?demo=1#/trasy`, { waitUntil: 'load' });
await page.waitForSelector('#results .adm-tc', { timeout: 15000 });
must(await page.$('#ntBar [data-nt-new]'), 'lista Trasy: przycisk „+ Nowa trasa”');
const rw = await page.$$('#results [data-nt-rewrite]');
must(rw.length > 0, `lista Trasy: „Przepisz od zera” przy starych trasach (${rw.length})`);
const box = await page.$eval('#ntBar [data-nt-new]', b => b.getBoundingClientRect().height);
must(box >= 44, `przycisk ≥ 44 px (${Math.round(box)})`);

// okno: slug z nazwy, walidacja bez regionu
await page.click('#ntBar [data-nt-new]');
await page.waitForSelector('#ntDlg[open] #ntName', { timeout: 5000 });
must(await page.evaluate(() => document.activeElement && document.activeElement.id === 'ntName'), 'focus na nazwie po otwarciu');
await page.fill('#ntName', 'Asyż');
must((await page.inputValue('#ntSlug')) === 'asyz', 'slug z nazwy: „Asyż” → asyz');
await page.fill('#ntName', 'Città di Castello');
must((await page.inputValue('#ntSlug')) === 'citta-di-castello', 'slug: „Città di Castello” → citta-di-castello');
await page.fill('#ntName', 'Asyż');
const fs = await page.$eval('#ntName', e => getComputedStyle(e).fontSize);
must(parseFloat(fs) >= 18, `pole ≥ 18 px (${fs})`);
must((await page.$eval('#ntCountry', e => e.value)) === 'it', 'kraj domyślnie Włochy');
const regions = await page.$$eval('#ntRegion option', o => o.map(x => x.value).filter(Boolean));
must(regions.includes('umbria') && regions.includes('marche'), `regiony Włoch: ${regions.join(', ')}`);
await page.selectOption('#ntRegion', '');
await page.click('#ntGo');
await page.waitForTimeout(100);
must(!(await page.$eval('#ntErr', e => e.hidden)) && /region/i.test(await page.$eval('#ntErr', e => e.textContent)), 'walidacja: bez regionu nie zleca');
// miasto, które już jest w demo (perugia) → fresh + ostrzeżenie
await page.fill('#ntName', 'Perugia');
await page.waitForTimeout(50);
must(await page.$eval('#ntFresh', e => e.checked), 'istniejące miasto → „od zera” zaznaczone');
must(!(await page.$eval('#ntWarn', e => e.hidden)) && /archiwum/.test(await page.$eval('#ntWarn', e => e.textContent)), 'ostrzeżenie o archiwum');
must(/20–40 wywołań Antigravity/.test(await page.$eval('#ntEstT', e => e.textContent)), 'szacunek widoczny');
// Esc zamyka, focus wraca na przycisk
await page.keyboard.press('Escape');
await page.waitForTimeout(100);
must(!(await page.$eval('#ntDlg', d => d.open)), 'Esc zamyka okno');
must(await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-nt-new')), 'focus wraca na „+ Nowa trasa”');

// „Przepisz od zera” → wypełnione pola, zlecenie udawane
await page.click('#results [data-nt-rewrite]');
await page.waitForSelector('#ntDlg[open] #ntSlug', { timeout: 5000 });
const pre = await page.evaluate(() => ({ slug: document.getElementById('ntSlug').value, name: document.getElementById('ntName').value, region: document.getElementById('ntRegion').value, fresh: document.getElementById('ntFresh').checked, h: document.getElementById('ntH').textContent }));
must(pre.slug && pre.name && pre.region && pre.fresh && /Przepisz od zera/.test(pre.h), `„Przepisz od zera”: wypełnione ${JSON.stringify(pre)}`);
await page.fill('#ntBrief', 'start z parkingu, finał z widokiem');
await page.screenshot({ path: OUT, fullPage: false });
await page.click('#ntGo');
await page.waitForSelector('#ntOk:not([hidden])', { timeout: 5000 });
const okT = await page.$eval('#ntOk', e => e.textContent);
must(/W kolejce jako #\d+/.test(okT) && /tryb demo/.test(okT), `zlecenie udawane: ${okT.slice(0, 60)}…`);
must(await page.$eval('#ntOk a', a => a.getAttribute('href') === '#/pipeline'), 'link do Pipeline');
await page.keyboard.press('Escape');

// pulpit: przycisk w kafelku Trasy
await page.goto(`http://127.0.0.1:${port}/_admin/index.html?demo=1#/pulpit`, { waitUntil: 'load' });
await page.waitForSelector('.ad-card--trips', { timeout: 15000 });
must(await page.$('.ad-card--trips .ad-card__h [data-nt-new]'), 'pulpit: „+ Nowa trasa” w kafelku Trasy');
must((await page.$$('.ad-card--trips [data-nt-rewrite]')).length > 0, 'pulpit: „Przepisz od zera” przy starych trasach');
must(!errors.length, 'bez błędów JS' + (errors.length ? ': ' + errors.join(' | ') : ''));
console.log('zrzut:', OUT, process.exitCode ? 'BŁĘDY' : 'OK');
await browser.close(); srv.close();
