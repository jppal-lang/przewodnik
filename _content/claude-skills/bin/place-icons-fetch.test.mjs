// Własny link JP do zdjęcia referencyjnego — bez sieci (resolver i transport wstrzyknięte): node --test bin/place-icons-fetch.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from './place-icons-fetch.mjs';
import * as L from './place-icons-lib.mjs';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const pub = async () => [{ address: '93.184.216.34', family: 4 }];
// transport z tabeli: url → { status, headers, body }
const fake = (routes, seen = []) => async (u, o) => { seen.push({ url: u.href, address: o.address }); const r = routes[u.href]; if (!r) return { status: 404, headers: {}, body: Buffer.alloc(0) }; return typeof r === 'function' ? r(u, o) : r; };
const img = (body, ct = 'image/jpeg') => ({ status: 200, headers: { 'content-type': ct }, body });

test('Google Drive i Dropbox → bezpośredni plik', () => {
  assert.equal(F.directUrl('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp_qr-st/view?usp=sharing'), 'https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOp_qr-st');
  assert.equal(F.directUrl('https://drive.google.com/file/u/0/d/1AbCdEfGhIjKlMnOp/view'), 'https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOp');
  assert.equal(F.directUrl('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp'), 'https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOp');
  assert.equal(F.directUrl('https://www.dropbox.com/s/abc123/porta.jpg?dl=0'), 'https://www.dropbox.com/s/abc123/porta.jpg?raw=1');
  assert.equal(F.directUrl('https://www.dropbox.com/scl/fi/xyz/porta.jpg?rlkey=k1&dl=0'), 'https://www.dropbox.com/scl/fi/xyz/porta.jpg?rlkey=k1&raw=1');
  assert.equal(F.directUrl('https://i.imgur.com/abc.jpg'), 'https://i.imgur.com/abc.jpg');
  assert.equal(F.directUrl('nie link'), null);
});
test('link w ops.icon_refs: tylko https, bez loginu, bez spacji i znaków kontrolnych, ≤ 2000', () => {
  for (const s of ['https://example.com/a.jpg', 'https://drive.google.com/file/d/1AbC/view?usp=sharing', 'https://example.com', 'https://x.pl:443/a?b=c#d'])
    assert.equal(F.isLinkRef(s), true, s);
  for (const s of ['javascript:alert(1)', 'http://example.com/a.jpg', 'https://user:pw@example.com/a.jpg', 'https://example.com/a b.jpg', 'https://example.com/a\n.jpg',
    'https://[::1]/a.jpg', 'https://example.com/"><script>', 'data:image/png;base64,AA', 'https://example.com/' + 'a'.repeat(2000), 'ftp://x.pl/a.jpg', 7, null])
    assert.equal(F.isLinkRef(s), false, String(s));
});
test('prywatne adresy IP odrzucone (v4, v6, zmapowane, metadane), publiczne przepuszczone', () => {
  for (const ip of ['127.0.0.1', '127.8.8.8', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fc00::1', 'fd00:ec2::254', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:7f00:1', '64:ff9b::a9fe:a9fe', '2002:c0a8:0101::1', 'nie-ip'])
    assert.equal(F.isBlockedIp(ip), true, ip);
  for (const ip of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '192.169.0.1', '2606:4700:4700::1111', '2a00:1450:4001:80b::200e', '::ffff:8.8.8.8'])
    assert.equal(F.isBlockedIp(ip), false, ip);
});
test('sprawdzenie celu: prywatny IP po DNS, login, http, port, localhost', async () => {
  await assert.rejects(F.checkTarget('https://intranet.example.com/a.jpg', async () => [{ address: '10.0.0.5', family: 4 }]), /sieci prywatnej \(10\.0\.0\.5\)/);
  await assert.rejects(F.checkTarget('https://mixed.example.com/a.jpg', async () => [{ address: '8.8.8.8', family: 4 }, { address: '::1', family: 6 }]), /sieci prywatnej/);
  await assert.rejects(F.checkTarget('https://169.254.169.254/latest/meta-data', pub), /sieci prywatnej/);
  await assert.rejects(F.checkTarget('https://[::ffff:127.0.0.1]/a.jpg', pub), /sieci prywatnej/);
  await assert.rejects(F.checkTarget('https://localhost/a.jpg', pub), /sieci lokalnej/);
  await assert.rejects(F.checkTarget('https://a:b@example.com/a.jpg', pub), /loginem/);
  await assert.rejects(F.checkTarget('http://example.com/a.jpg', pub), /tylko https/);
  await assert.rejects(F.checkTarget('https://example.com:8443/a.jpg', pub), /port/);
  await assert.rejects(F.checkTarget('https://nie-ma.example.com/a.jpg', async () => { throw Object.assign(new Error('x'), { code: 'ENOTFOUND' }); }), /ENOTFOUND/);
  const t = await F.checkTarget('https://example.com/a.jpg', pub);
  assert.equal(t.address, '93.184.216.34'); assert.equal(t.host, 'example.com');
});
test('sygnatury bajtów: JPEG, PNG, WebP; inne nie', () => {
  assert.equal(F.imageKind(JPEG), 'jpeg'); assert.equal(F.imageKind(PNG), 'png'); assert.equal(F.imageKind(WEBP), 'webp');
  assert.equal(F.imageKind(Buffer.from('<!doctype html><html>')), null);
  assert.equal(F.imageKind(Buffer.from('GIF89a......')), null);
  assert.equal(F.imageKind(Buffer.alloc(3)), null);
});
test('strona HTML → og:image / twitter:image / link rel=image_src (adres względny i encje)', () => {
  const b = 'https://www.example.com/blog/porta/';
  assert.equal(F.metaImage('<head><meta property="og:image" content="https://cdn.example.com/p.jpg?a=1&amp;b=2"></head>', b), 'https://cdn.example.com/p.jpg?a=1&b=2');
  assert.equal(F.metaImage("<meta content='/img/p.webp' property='og:image'>", b), 'https://www.example.com/img/p.webp');
  assert.equal(F.metaImage('<meta name="twitter:image" content="p.png">', b), 'https://www.example.com/blog/porta/p.png');
  assert.equal(F.metaImage('<link href="https://x.pl/i.jpg" rel="image_src">', b), 'https://x.pl/i.jpg');
  assert.equal(F.metaImage('<meta property="og:image" content="https://a.pl/1.jpg"><meta property="og:image:secure_url" content="https://a.pl/2.jpg">', b), 'https://a.pl/2.jpg');
  assert.equal(F.metaImage('<meta property="og:image" content="javascript:alert(1)">', b), null);
  assert.equal(F.metaImage('<title>bez obrazu</title>', b), null);
});
test('pobranie: bezpośredni plik, połączenie na sprawdzony IP', async () => {
  const seen = [];
  const r = await F.fetchImage('https://example.com/a.jpg', { resolve: pub, transport: fake({ 'https://example.com/a.jpg': img(JPEG) }, seen) });
  assert.equal(r.kind, 'jpeg'); assert.equal(r.via, 'plik'); assert.equal(r.host, 'example.com');
  assert.equal(seen[0].address, '93.184.216.34');
});
test('pobranie: strona → og:image → plik; Drive → uc; octet-stream z dobrą sygnaturą', async () => {
  const page = { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: Buffer.from('<meta property="og:image" content="https://cdn.example.com/p.webp">') };
  const r = await F.fetchImage('https://example.com/post/1', { resolve: pub, transport: fake({ 'https://example.com/post/1': page, 'https://cdn.example.com/p.webp': img(WEBP, 'image/webp') }) });
  assert.equal(r.kind, 'webp'); assert.equal(r.via, 'strona'); assert.equal(r.url, 'https://cdn.example.com/p.webp');
  const seen = [];
  const d = await F.fetchImage('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing', { resolve: pub, transport: fake({
    'https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOp': { status: 303, headers: { location: 'https://drive.usercontent.google.com/download?id=1AbCdEfGhIjKlMnOp' } },
    'https://drive.usercontent.google.com/download?id=1AbCdEfGhIjKlMnOp': img(PNG, 'application/octet-stream') }, seen) });
  assert.equal(d.kind, 'png'); assert.equal(seen[0].url, 'https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOp');
});
test('pobranie: przekierowanie do sieci prywatnej, na http i ponad 3 przekierowania — odrzucone', async () => {
  const resolve = async (h) => [{ address: h === 'evil.example.com' ? '127.0.0.1' : '93.184.216.34', family: 4 }];
  await assert.rejects(F.fetchImage('https://example.com/a.jpg', { resolve, transport: fake({ 'https://example.com/a.jpg': { status: 302, headers: { location: 'https://evil.example.com/x.jpg' } } }) }), /sieci prywatnej/);
  await assert.rejects(F.fetchImage('https://example.com/a.jpg', { resolve, transport: fake({ 'https://example.com/a.jpg': { status: 301, headers: { location: 'https://169.254.169.254/' } } }) }), /sieci prywatnej/);
  await assert.rejects(F.fetchImage('https://example.com/a.jpg', { resolve, transport: fake({ 'https://example.com/a.jpg': { status: 302, headers: { location: 'http://example.com/a.jpg' } } }) }), /tylko https/);
  const loop = (u) => ({ status: 302, headers: { location: u.href.replace(/(\d+)$/, (m) => +m + 1) } });
  await assert.rejects(F.fetchImage('https://example.com/r1', { resolve, transport: async (u) => loop(u) }), /za dużo przekierowań/);
  // og:image na stronie wskazujące sieć prywatną — ta sama kontrola
  const page = { status: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from('<meta property="og:image" content="https://evil.example.com/i.jpg">') };
  await assert.rejects(F.fetchImage('https://example.com/p', { resolve, transport: fake({ 'https://example.com/p': page }) }), /sieci prywatnej/);
});
test('pobranie: czytelne błędy (logowanie, 404, nie-obraz, zła sygnatura, za duży, czas)', async () => {
  const t = (r) => ({ resolve: pub, transport: async () => r });
  await assert.rejects(F.fetchImage('https://example.com/a.jpg', t({ status: 403, headers: {} })), /logowania/);
  await assert.rejects(F.fetchImage('https://example.com/a.jpg', t({ status: 404, headers: {} })), /nie ma takiej strony/);
  await assert.rejects(F.fetchImage('https://example.com/a.jpg', t({ status: 200, headers: { 'content-type': 'application/pdf' }, body: Buffer.from('%PDF') })), /to nie jest zdjęcie \(typ application\/pdf/);
  await assert.rejects(F.fetchImage('https://example.com/a.jpg', t(img(Buffer.from('<html>to nie jpeg</html>')))), /zła sygnatura/);
  await assert.rejects(F.fetchImage('https://example.com/a.gif', t(img(Buffer.from('GIF89a......'), 'image/gif'))), /JPEG, PNG albo WebP/);
  await assert.rejects(F.fetchImage('https://example.com/p', t({ status: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from('<title>x</title>') })), /og:image/);
  await assert.rejects(F.fetchImage('https://example.com/a.jpg', { ...t(img(Buffer.alloc(2048, 0xff))), maxBytes: 1024 }), /za duży/);
  await assert.rejects(F.fetchImage('https://example.com/a.jpg', { resolve: pub, transport: () => new Promise(() => {}), timeoutMs: 50 }), /nie odpowiedział/);
  await assert.rejects(F.fetchImage('javascript:alert(1)', t(img(JPEG))), /poprawny link/);
  const e = await F.fetchImage('https://example.com/a.jpg', t({ status: 404, headers: {} })).catch(x => x);
  assert.ok(e instanceof F.LinkError); assert.equal(e.host, 'example.com');
});
test('wybór JP: tytuły Commons i linki https razem, najwyżej 2', () => {
  assert.deepEqual(L.normFiles(['https://example.com/a.jpg', 'File:B.jpg', 'https://x.pl/c.jpg']), ['https://example.com/a.jpg', 'File:B.jpg']);
  assert.deepEqual(L.normFiles(['http://x.pl/a.jpg', 'javascript:alert(1)', 'https://a:b@x.pl/a.jpg']), []);
  assert.equal(L.MAX_JP_REFS, 2);
});
test('bramka: nieudany link JP — próby, potem czeka na nowy wybór (bez automatu); nowy wybór = od nowa', () => {
  const sel = { mode: 'pick', files: ['https://example.com/a.jpg'] }, sig = L.filesSig(sel.files);
  assert.deepEqual(L.iconGate({ sel, key: 'a' }), { use: 'pick', files: sel.files });
  assert.equal(L.iconGate({ sel, key: 'a', linkFail: { sig, tries: 1 } }).use, 'pick');               // jeszcze próbujemy
  const g = L.iconGate({ sel, key: 'a', linkFail: { sig, tries: L.LINK_TRIES, msg: 'nie udało się pobrać Twojego zdjęcia z example.com: HTTP 403' } });
  assert.equal(g.wait, true); assert.equal(g.jp, true); assert.equal(g.until, null); assert.match(g.why, /example\.com/);
  const sel2 = { mode: 'pick', files: ['https://example.com/b.jpg'] };
  assert.equal(L.iconGate({ sel: sel2, key: 'a', linkFail: { sig, tries: 9 } }).use, 'pick');          // JP zmienił wybór
  assert.equal(L.iconGate({ sel: { mode: 'auto', files: [] }, key: 'a', linkFail: { sig, tries: 9 } }).use, 'auto');
});
test('Discord i rejestr źródeł: link JP zamiast autora i licencji', () => {
  const refs = [{ title: 'https://example.com/p.jpg', page: 'https://example.com/p.jpg', url: 'https://cdn.example.com/p.jpg', link: true, host: 'example.com', author: 'link JP', license: 'link JP' },
    { title: 'File:B.jpg', page: 'https://commons.wikimedia.org/wiki/File:B.jpg', url: 'https://upload/B.jpg', author: 'Ola', license: 'CC0', license_url: null }];
  const stop = { n: 4, key: 'porta', name: 'Porta Venere', city: 'Spello' };
  const c = L.caption(stop, 'spello', refs);
  assert.match(c, /1\) <https:\/\/example\.com\/p\.jpg> — źródło: link JP/); assert.match(c, /2\) <https:\/\/commons.*Ola, CC0/);
  const e = L.sourcesEntry({ trip: 'spello', stop, refs, v: 1, version: 3, at: '2026-10-31' });
  assert.deepEqual(e.references[0], { url: 'https://example.com/p.jpg', file_url: 'https://cdn.example.com/p.jpg', source: 'link JP' });
  assert.equal(e.references[1].author, 'Ola');
  const m = L.linkFailMsg(stop, 'spello', [{ file: 'https://example.com/p.jpg', host: 'example.com', reason: 'strona wymaga logowania (HTTP 403)' }]);
  assert.match(m, /nie udało się pobrać Twojego zdjęcia z example\.com: strona wymaga logowania/); assert.match(m, /#4/); assert.match(m, /publiczna/);
});
