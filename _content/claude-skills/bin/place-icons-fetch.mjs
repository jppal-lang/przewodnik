// Ikony miejsc — własny link JP do zdjęcia referencyjnego (JP 2026-10-31, docs/IKONY-MIEJSC.md §7).
// Bezpieczne pobranie obrazu z dowolnej publicznej strony: tylko https, bez „login:hasło@”, host po rozwiązaniu DNS nie może być
// prywatny / loopback / link-local / metadane (sprawdzane przy każdym przekierowaniu, max 3, ręcznie); połączenie idzie DOKŁADNIE
// na sprawdzony adres IP (własny lookup w https.request — bez okna na podmianę DNS). Limit 15 MB, 20 s na całość,
// tylko JPEG / PNG / WebP (Content-Type i sygnatura bajtów). Strona HTML → og:image / twitter:image / <link rel=image_src> (jeden krok).
// Google Drive (…/file/d/ID/view) → uc?export=download&id=ID; Dropbox ?dl=0 → ?raw=1.
// Czyste funkcje + fetchImage z wstrzykiwanym resolverem i transportem (testy: place-icons-fetch.test.mjs).
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import https from 'node:https';

export const MAX_BYTES = 15 * 1024 * 1024;
export const TIMEOUT_MS = 20_000;
export const MAX_REDIRECTS = 3;
const UA = 'Mozilla/5.0 (compatible; QuolinoBot/1.0; +https://quolino.com) place icons';

export class LinkError extends Error {
  constructor(reason, host = '') { super(reason); this.reason = reason; this.host = host; }
}

// ── link JP w ops.icon_refs (ta sama reguła co ops.icon_ref_ok w SQL 2026-10-31-icon-refs-linki.sql) ──
const LINK_RE = /^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]{0,252}[A-Za-z0-9])?(?::\d{1,5})?(?:[/?#][^\s\x00-\x1f\x7f<>"\\`{}|^]*)?$/;
export const isLinkRef = (s) => typeof s === 'string' && s.length <= 2000 && LINK_RE.test(s);
export const hostOf = (u) => { try { return new URL(u).hostname; } catch { return String(u ?? '').slice(0, 60); } };

// ── Google Drive / Dropbox → bezpośredni plik ──
export function directUrl(input) {
  let u;
  try { u = new URL(String(input ?? '').trim()); } catch { return null; }
  const host = u.hostname.toLowerCase();
  if (host === 'drive.google.com' || host === 'docs.google.com') {
    const id = u.pathname.match(/^\/file\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{10,200})(?:\/|$)/)?.[1]
      ?? (/^\/(open|uc)$/.test(u.pathname) ? u.searchParams.get('id') : null);
    if (id && /^[A-Za-z0-9_-]{10,200}$/.test(id)) return `https://drive.google.com/uc?export=download&id=${id}`;
    return u.href;
  }
  if (host === 'dropbox.com' || host === 'www.dropbox.com') {
    u.searchParams.delete('dl'); u.searchParams.set('raw', '1');
    return u.href;
  }
  return u.href;
}

// ── adresy IP, do których nie wolno się łączyć ──
function v4Num(ip) { const p = ip.split('.').map(Number); return p.length === 4 && p.every(n => Number.isInteger(n) && n >= 0 && n <= 255) ? ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3] : null; }
const V4_BLOCK = [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]]
  .map(([a, b]) => [v4Num(a), b]);
function v6Words(ip) {
  let s = ip.toLowerCase().replace(/%.*$/, '');
  const m4 = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (m4) { const n = v4Num(m4[2]); if (n == null) return null; s = m4[1] + (n >>> 16).toString(16) + ':' + (n & 0xffff).toString(16); }
  const [head, tail, extra] = s.split('::');
  if (extra !== undefined) return null;
  const h = head ? head.split(':') : [], t = tail !== undefined && tail ? tail.split(':') : [];
  const fill = tail === undefined ? 0 : 8 - h.length - t.length;
  if (fill < 0 || (tail === undefined && h.length !== 8)) return null;
  const w = [...h, ...Array(fill).fill('0'), ...t].map(x => parseInt(x, 16));
  return w.length === 8 && w.every(x => Number.isInteger(x) && x >= 0 && x <= 0xffff) ? w : null;
}
export function isBlockedIp(ip) {
  const fam = isIP(String(ip ?? ''));
  if (fam === 4) { const n = v4Num(ip); return V4_BLOCK.some(([net, bits]) => ((n ^ net) >>> (32 - bits)) === 0); }
  if (fam !== 6) return true;   // nie-IP = nie łączymy
  const w = v6Words(ip);
  if (!w) return true;
  if (w.every(x => x === 0)) return true;                                        // ::
  if (w.slice(0, 7).every(x => x === 0) && w[7] === 1) return true;              // ::1
  const v4of = (a, b) => `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
  if (w.slice(0, 5).every(x => x === 0) && w[5] === 0xffff) return isBlockedIp(v4of(w[6], w[7]));   // ::ffff:a.b.c.d
  if (w.slice(0, 6).every(x => x === 0)) return true;                            // ::a.b.c.d (przestarzałe)
  if (w[0] === 0x64 && w[1] === 0xff9b && w.slice(2, 6).every(x => x === 0)) return isBlockedIp(v4of(w[6], w[7]));   // NAT64
  if ((w[0] & 0xfe00) === 0xfc00) return true;                                   // fc00::/7 (w tym fd00:ec2::254 — metadane AWS)
  if ((w[0] & 0xffc0) === 0xfe80) return true;                                   // fe80::/10
  if ((w[0] & 0xffc0) === 0xfec0) return true;                                   // fec0::/10 (site-local)
  if ((w[0] & 0xff00) === 0xff00) return true;                                   // multicast
  if (w[0] === 0x2001 && w[1] === 0x0db8) return true;                           // dokumentacja
  if (w[0] === 0x2002) return isBlockedIp(v4of(w[1], w[2]));                     // 6to4
  return false;
}

// ── sygnatura bajtów ──
export function imageKind(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return 'png';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}
const IMG_CT = /^image\/(jpeg|jpg|pjpeg|png|webp)$/;
const HTML_CT = /^(text\/html|application\/xhtml\+xml)$/;
const BIN_CT = /^(application\/octet-stream|binary\/octet-stream)$/;   // Drive/Dropbox bywa bez typu — wtedy decyduje sygnatura

// ── strona HTML → adres obrazu (og:image, twitter:image, <link rel=image_src>) ──
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#x27': "'", '#47': '/', '#x2F': '/', '#x2f': '/' };
const unent = (s) => String(s).replace(/&(#?\w+);/g, (m, e) => ENT[e] ?? m);
function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) out[m[1].toLowerCase()] = unent(m[3] ?? m[4] ?? m[5] ?? '');
  return out;
}
export function metaImage(html, base) {
  const h = String(html ?? '').slice(0, 1_000_000);
  const metas = [...h.matchAll(/<meta\b[^>]*>/gi)].map(m => attrs(m[0]));
  const links = [...h.matchAll(/<link\b[^>]*>/gi)].map(m => attrs(m[0]));
  const pick = (names) => { for (const n of names) { const m = metas.find(a => [a.property, a.name, a.itemprop].map(x => String(x ?? '').toLowerCase()).includes(n) && a.content); if (m) return m.content; } return null; };
  const raw = pick(['og:image:secure_url', 'og:image:url', 'og:image']) ?? pick(['twitter:image', 'twitter:image:src'])
    ?? links.find(a => String(a.rel ?? '').toLowerCase().split(/\s+/).includes('image_src') && a.href)?.href ?? null;
  if (!raw) return null;
  try { const u = new URL(raw.trim(), base); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null; } catch { return null; }
}

// ── sprawdzenie adresu przed połączeniem: https, bez loginu, port 443, publiczny IP ──
export async function checkTarget(urlStr, resolve) {
  let u;
  try { u = new URL(urlStr); } catch { throw new LinkError('to nie jest poprawny adres'); }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (u.protocol !== 'https:') throw new LinkError(`tylko https (adres zaczyna się od ${u.protocol})`, host);
  if (u.username || u.password) throw new LinkError('adres z loginem/hasłem nie jest dozwolony', host);
  if (u.port && u.port !== '443') throw new LinkError(`niestandardowy port ${u.port}`, host);
  let addrs;
  if (isIP(host)) addrs = [{ address: host, family: isIP(host) }];
  else {
    if (!/\./.test(host) || /\.(local|localhost|internal|lan|home|corp|intranet)$/i.test(host) || /^localhost$/i.test(host)) throw new LinkError('adres w sieci lokalnej', host);
    try { addrs = await resolve(host); } catch (e) { throw new LinkError(`nie ma takiego serwera (${e.code ?? e.message})`, host); }
  }
  if (!addrs?.length) throw new LinkError('nie ma takiego serwera', host);
  const bad = addrs.find(a => isBlockedIp(a.address));
  if (bad) throw new LinkError(`adres prowadzi do sieci prywatnej (${bad.address}) — niedozwolone`, host);
  return { url: u, host, address: addrs[0].address, family: addrs[0].family ?? isIP(addrs[0].address) };
}
export const dnsResolve = (host) => dnsLookup(host, { all: true, verbatim: true });

// ── transport: https.request na sprawdzony IP (SNI i certyfikat dla nazwy hosta), limit bajtów, przerwanie sygnałem ──
export function httpsTransport(u, { address, family, signal, maxBytes }) {
  return new Promise((res, rej) => {
    const req = https.request(u, {
      method: 'GET', signal, agent: false,
      headers: { 'User-Agent': UA, Accept: 'image/jpeg,image/png,image/webp,text/html;q=0.8,*/*;q=0.1', 'Accept-Encoding': 'identity' },
      lookup: (_h, o, cb) => (o?.all ? cb(null, [{ address, family }]) : cb(null, address, family)),
    }, (r) => {
      const len = +(r.headers['content-length'] ?? 0);
      const head = { status: r.statusCode, headers: r.headers };
      if (r.statusCode >= 300 && r.statusCode < 400) { r.resume(); return res({ ...head, body: Buffer.alloc(0) }); }
      if (len > maxBytes) { r.destroy(); return rej(new LinkError(`plik za duży (${Math.round(len / 1048576)} MB, limit ${Math.round(maxBytes / 1048576)} MB)`)); }
      const chunks = []; let n = 0;
      r.on('data', (c) => { n += c.length; if (n > maxBytes) { r.destroy(); rej(new LinkError(`plik za duży (ponad ${Math.round(maxBytes / 1048576)} MB)`)); } else chunks.push(c); });
      r.on('end', () => res({ ...head, body: Buffer.concat(chunks) }));
      r.on('error', rej);
    });
    req.on('error', rej);
    req.end();
  });
}

// ── pobranie obrazu z linku JP ──
// → { buf, kind: 'jpeg'|'png'|'webp', url (końcowy), host, via: 'plik'|'strona' }; błąd → LinkError z czytelnym powodem (po polsku)
export async function fetchImage(input, { resolve = dnsResolve, transport = httpsTransport, maxBytes = MAX_BYTES, timeoutMs = TIMEOUT_MS, maxRedirects = MAX_REDIRECTS } = {}) {
  const start = directUrl(input);
  const host0 = hostOf(input);
  if (!start || !isLinkRef(String(input ?? '').trim())) throw new LinkError('to nie jest poprawny link https', host0);
  const ctl = new AbortController();
  let timer;
  const late = new Promise((_, rej) => { timer = setTimeout(() => { ctl.abort(); rej(new LinkError(`serwer nie odpowiedział w ${Math.round(timeoutMs / 1000)} s`, host0)); }, timeoutMs); });
  late.catch(() => {});
  const inTime = (p) => Promise.race([p, late]);   // 20 s na całość: DNS, przekierowania, strona i plik
  try {
    let url = start, hops = 0, fromPage = false;
    for (;;) {
      const t = await inTime(checkTarget(url, resolve));
      let r;
      try { r = await inTime(transport(t.url, { address: t.address, family: t.family, signal: ctl.signal, maxBytes })); }
      catch (e) {
        if (e instanceof LinkError) { e.host ||= t.host; throw e; }
        if (ctl.signal.aborted || e.name === 'AbortError') throw new LinkError(`serwer nie odpowiedział w ${Math.round(timeoutMs / 1000)} s`, t.host);
        throw new LinkError(`błąd połączenia (${e.code ?? e.message})`, t.host);
      }
      const hdr = (k) => { const v = r.headers?.[k] ?? (typeof r.headers?.get === 'function' ? r.headers.get(k) : null); return Array.isArray(v) ? v[0] : v; };
      if (r.status >= 300 && r.status < 400) {
        const loc = hdr('location');
        if (!loc) throw new LinkError(`przekierowanie bez adresu (HTTP ${r.status})`, t.host);
        if (++hops > maxRedirects) throw new LinkError(`za dużo przekierowań (ponad ${maxRedirects})`, t.host);
        url = new URL(loc, t.url).href;
        continue;
      }
      if (r.status === 401 || r.status === 403) throw new LinkError(`strona wymaga logowania albo nie jest publiczna (HTTP ${r.status})`, t.host);
      if (r.status === 404 || r.status === 410) throw new LinkError(`nie ma takiej strony (HTTP ${r.status})`, t.host);
      if (r.status !== 200) throw new LinkError(`serwer odpowiedział HTTP ${r.status}`, t.host);
      const ct = String(hdr('content-type') ?? '').split(';')[0].trim().toLowerCase();
      const buf = Buffer.isBuffer(r.body) ? r.body : Buffer.from(r.body ?? '');
      if (buf.length > maxBytes) throw new LinkError(`plik za duży (ponad ${Math.round(maxBytes / 1048576)} MB)`, t.host);
      if (IMG_CT.test(ct) || BIN_CT.test(ct)) {
        const kind = imageKind(buf);
        if (!kind) throw new LinkError(`plik nie jest zdjęciem JPEG, PNG ani WebP (typ ${ct}, zła sygnatura)`, t.host);
        return { buf, kind, url: t.url.href, host: t.host, via: fromPage ? 'strona' : 'plik' };
      }
      if (HTML_CT.test(ct) && !fromPage) {
        const html = buf.toString('utf8');
        if (/accounts\.google\.com\/(ServiceLogin|v3\/signin)|<title>[^<]*(Sign in|Zaloguj|Log in)[^<]*<\/title>/i.test(html.slice(0, 200_000)) && !metaImage(html, t.url))
          throw new LinkError('strona wymaga logowania (udostępnij plik „każdy, kto ma link”)', t.host);
        const img = metaImage(html, t.url);
        if (!img) throw new LinkError('to strona, a nie zdjęcie, i nie podaje obrazu (og:image) — wklej link do samego pliku', t.host);
        url = img.replace(/^http:\/\//i, 'https://'); fromPage = true; hops = 0;
        continue;
      }
      if (/^image\//.test(ct)) throw new LinkError(`format ${ct} — potrzebny JPEG, PNG albo WebP`, t.host);
      throw new LinkError(`to nie jest zdjęcie (typ ${ct || 'nieznany'})`, t.host);
    }
  } finally { clearTimeout(timer); }
}
