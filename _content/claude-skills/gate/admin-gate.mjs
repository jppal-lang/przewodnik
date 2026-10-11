// Bramka panelu admina (decyzja JP 2026-10-11): dostęp tylko z jednorazowego linku z Discorda (#admin → DM do JP).
// Link (token) działa raz i przez 10 minut; po wejściu powstaje sesja (ciasteczko), która wygasa po SESSION_IDLE_MIN
// bez ruchu albo po SESSION_MAX_MIN od zalogowania, a także po zamknięciu przeglądarki. Potem trzeba nowego linku.
// Bez zależności. Za Traefikiem (HTTPS). Przepuszcza do admin-web (statyczny panel + /api → admin-api).
import http from 'node:http';
import crypto from 'node:crypto';

const UP = new URL(process.env.UPSTREAM || 'http://admin-web:80');
const API = process.env.ADMIN_API || 'http://admin-api:3000';
const MAX = (+process.env.SESSION_MAX_MIN || 120) * 60e3;
const IDLE = (+process.env.SESSION_IDLE_MIN || 30) * 60e3;
const sessions = new Map();                       // id → { start, last }
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const cookie = (req) => ((req.headers.cookie || '').match(/(?:^|;\s*)qadm=([A-Za-z0-9_-]{40,})/) || [])[1];
const log = (...a) => console.log(new Date().toISOString(), ...a);
// bez ważnego linku/sesji: bez żadnych komunikatów — przekierowanie na stronę główną (decyzja JP 2026-10-11)
const MAIN = process.env.MAIN_URL || 'https://quolino.srv1984679.hstgr.cloud/';
const away = (res, extra = {}) => { res.writeHead(302, { Location: MAIN, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', ...extra }); res.end(); };

function valid(id) {
  const s = id && sessions.get(id);
  if (!s) return false;
  const now = Date.now();
  if (now - s.start > MAX || now - s.last > IDLE) { sessions.delete(id); return false; }
  s.last = now;
  return true;
}
setInterval(() => { for (const id of sessions.keys()) valid(id); }, 60e3).unref();

function page(res, code, msg) {
  res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'no-referrer' });
  res.end(`<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Panel Quolino</title><body style="font:16px/1.5 system-ui,sans-serif;max-width:34em;margin:15vh auto;padding:0 16px;color:#0E1A2B">
<h1 style="font-size:22px">Panel Quolino</h1><p>${msg}</p></body></html>`);
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;

  // /login: GET niczego nie zużywa (podglądy linków Discorda/komunikatorów odwiedzają adres automatycznie);
  // przeglądarka sama odsyła formularz (POST) skryptem — dopiero POST zużywa jednorazowy link.
  if (u.pathname === '/login' && req.method === 'GET') {
    const t = u.searchParams.get('t') || '';
    if (!/^[A-Za-z0-9_-]{40,}$/.test(t)) return away(res);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer' });
    return res.end(`<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Quolino</title><body style="font:16px system-ui,sans-serif;margin:20vh auto;max-width:20em;text-align:center">
<form method="post" action="/login"><input type="hidden" name="t" value="${t}"><button type="submit" style="font:600 16px system-ui;padding:10px 22px">Wejdź</button></form>
<script>document.forms[0].submit()</script></body></html>`);
  }
  if (u.pathname === '/login' && req.method === 'POST') {
    let body = ''; for await (const ch of req) { body += ch; if (body.length > 2000) break; }
    const t = new URLSearchParams(body).get('t') || '';
    if (!/^[A-Za-z0-9_-]{40,}$/.test(t)) return away(res);
    let ok = false;
    try {
      const r = await fetch(`${API}/rpc/redeem_link`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_hash: sha(t), p_ip: ip }) });
      ok = r.ok && (await r.json()) === true;
    } catch (e) { log('redeem error', e.message); }
    if (!ok) { log('odrzucony link', ip); return away(res); }
    const id = crypto.randomBytes(32).toString('base64url');
    sessions.set(id, { start: Date.now(), last: Date.now() });
    log('nowa sesja', ip);
    res.writeHead(303, { 'Set-Cookie': `qadm=${id}; Path=/; HttpOnly; Secure; SameSite=Lax`, Location: '/_admin/',
      'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    return res.end();
  }
  if (u.pathname === '/logout') {
    const id = cookie(req); if (id) sessions.delete(id);
    return away(res, { 'Set-Cookie': 'qadm=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax' });
  }
  if (!valid(cookie(req))) return away(res);
  const h = { ...req.headers, host: UP.host };
  delete h.cookie; delete h.authorization;
  const p = http.request({ hostname: UP.hostname, port: UP.port || 80, path: req.url, method: req.method, headers: h }, (r) => {
    res.writeHead(r.statusCode, { ...r.headers, 'cache-control': 'no-store' });
    r.pipe(res);
  });
  p.on('error', () => page(res, 502, 'Panel chwilowo nie odpowiada.'));
  req.pipe(p);
}).listen(8080, () => log('admin-gate :8080'));
