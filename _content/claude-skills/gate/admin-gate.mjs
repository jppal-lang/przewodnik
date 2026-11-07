// Bramka panelu admina (decyzja JP 2026-10-11): dostęp tylko z jednorazowego linku z Discorda (#admin → DM do JP).
// Link (token) działa raz i przez 10 minut; po wejściu powstaje sesja (ciasteczko), która wygasa po SESSION_IDLE_MIN
// bez ruchu albo po SESSION_MAX_MIN od zalogowania, a także po zamknięciu przeglądarki. Potem trzeba nowego linku.
// Od 2026-11-06 (JP): panel admina (PURPOSE=admin) wpuszcza też kodem z Google Authenticatora (TOTP): bez sesji adres panelu
// pokazuje pole na 6 cyfr, baza liczy kod (admin.totp_verify — sekret nie wychodzi z bazy). Włączenie: jednorazowy link
// /totp-setup?t=… z Discorda → QR, przycisk otpauth:// i klucz. Link z Discorda działa dalej jako zapas.
// Od 2026-11-07: konta zespołu (role support / editor, każdy z własnym Authenticatorem); rola sprawdzana w bramce dla /api,
// kto zalogowany → nagłówek X-Admin-Who do API (dziennik zdarzeń), GET /_whoami dla panelu.
// Bez zależności. Za Traefikiem (HTTPS). Przepuszcza do admin-web (statyczny panel + /api → admin-api).
import http from 'node:http';
import crypto from 'node:crypto';

const UP = new URL(process.env.UPSTREAM || 'http://admin-web:80');
const API = process.env.ADMIN_API || 'http://admin-api:3000';
const MAX = (+process.env.SESSION_MAX_MIN || 120) * 60e3;
const IDLE = (+process.env.SESSION_IDLE_MIN || 30) * 60e3;
// Ta sama bramka obsługuje panel szkiców (admin.quolino.com) i statystyki (stats.quolino.com, JP 2026-10-17):
//   PURPOSE — cel linku (admin | stats), AFTER_LOGIN — dokąd po wejściu, COOKIE — nazwa ciasteczka sesji,
//   GATE_PATH — prefiks ścieżek bramki (stats: /_gate, bo Umami ma własne /login i /logout),
//   KEEP_AUTH=1 — przepuszcza nagłówek Authorization i ciasteczka aplikacji (Umami loguje się tokenem).
const PURPOSE = process.env.PURPOSE || 'admin';
// statystyki (JP 2026-11-06): po wejściu od razu widok udostępniony Umami (tylko odczyt), bez drugiego logowania do Umami.
// UMAMI_SHARE_ID z secrets/stats-gate.env (pisze install.sh z .env); bez niego — jak dotąd AFTER_LOGIN (logowanie Umami).
const SHARE = /^[A-Za-z0-9]{6,64}$/.test(process.env.UMAMI_SHARE_ID || '') ? process.env.UMAMI_SHARE_ID : '';
const AFTER = PURPOSE === 'stats' && SHARE ? `/share/${SHARE}/Quolino` : (process.env.AFTER_LOGIN || '/_admin/');
const CK = process.env.COOKIE || 'qadm';
const GP = process.env.GATE_PATH || '';
const KEEP_AUTH = process.env.KEEP_AUTH === '1';
const sessions = new Map();                       // id → { start, last, who, role }
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const cookie = (req) => ((req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + CK + '=([A-Za-z0-9_-]{40,})')) || [])[1];
const log = (...a) => console.log(new Date().toISOString(), ...a);
// bez ważnego linku/sesji: bez żadnych komunikatów — przekierowanie na stronę główną (decyzja JP 2026-10-11)
const MAIN = process.env.MAIN_URL || 'https://quolino.com/';
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

const rpc = async (fn, args) => {
  try {
    const r = await fetch(`${API}/rpc/${fn}`, { signal: AbortSignal.timeout(5000), method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) });
    return r.ok ? await r.json() : null;
  } catch (e) { log('rpc', fn, e.message); return null; }
};
const readBody = async (req) => { let b = ''; for await (const ch of req) { b += ch; if (b.length > 2000) break; } return new URLSearchParams(b); };
const newSession = (res, ip, how, who = 'JP', role = 'owner') => {
  const id = crypto.randomBytes(32).toString('base64url');
  sessions.set(id, { start: Date.now(), last: Date.now(), who, role });
  log('nowa sesja', how, who, role, ip);
  res.writeHead(303, { 'Set-Cookie': `${CK}=${id}; Path=/; HttpOnly; Secure; SameSite=Lax`, Location: AFTER,
    'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  res.end();
};
const HEAD = `<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Panel Quolino</title><body style="font:18px/1.5 system-ui,sans-serif;max-width:24em;margin:12vh auto;padding:0 16px;color:#0E1A2B;text-align:center">`;
const codeForm = (msg) => `${HEAD}<h1 style="font-size:24px">Panel Quolino</h1>${msg ? `<p style="color:#B42318">${msg}</p>` : ''}
<form method="post" action="/code"><label for="c">Kod z Google Authenticatora</label><br>
<input id="c" name="c" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required autofocus
 style="font:600 28px ui-monospace,monospace;letter-spacing:.3em;width:8em;text-align:center;margin:12px 0;padding:10px;min-height:44px">
<br><button type="submit" style="font:600 18px system-ui;padding:12px 28px;min-height:44px">Wejdź</button></form></body></html>`;
const html = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' }); res.end(body); };
const TOTP = PURPOSE === 'admin';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

http.createServer((req, res) => handle(req, res).catch((e) => { log('błąd', e.message); if (!res.headersSent) away(res); else res.destroy(); }))
  .listen(8080, () => log(`gate ${PURPOSE} :8080`));
async function handle(req, res) {
  if (!req.url.startsWith('/') || req.url.startsWith('//')) return away(res);
  const u = new URL(req.url, 'http://x');
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;

  if (TOTP) {
    // biblioteka QR z panelu (plik publiczny) — potrzebna stronie włączenia, zanim jest sesja
    if (u.pathname === '/qrcode.js' && req.method === 'GET' && !valid(cookie(req))) {
      const p = http.request({ hostname: UP.hostname, port: UP.port || 80, path: '/qrcode.js', method: 'GET', headers: { host: UP.host } }, (r) => { res.writeHead(r.statusCode, { 'Content-Type': r.headers['content-type'] || 'text/javascript', 'Cache-Control': 'no-store' }); r.pipe(res); });
      p.on('error', () => away(res)); return p.end();
    }
    // logowanie kodem: formularz pod adresem panelu, gdy nie ma sesji
    if (req.method === 'GET' && (u.pathname === '/' || u.pathname === AFTER || u.pathname === '/login' && !u.searchParams.get('t')) && !valid(cookie(req))) {
      return (await rpc('totp_enabled')) === true ? html(res, 200, codeForm('')) : away(res);
    }
    if (u.pathname === '/code' && req.method === 'POST') {
      const c = String((await readBody(req)).get('c') || '').replace(/\s/g, '');
      // od 2026-11-07: kod JP albo osoby z zespołu (admin.totp_login → {ok, who, role}); bez tej funkcji — jak dotąd tylko JP
      const lg = await rpc('totp_login', { p_code: c, p_ip: ip });
      if (lg && typeof lg === 'object') { if (lg.ok && ['owner', 'support', 'editor'].includes(lg.role)) return newSession(res, ip, 'kod', String(lg.who || '?').slice(0, 40), lg.role); }
      else if ((await rpc('totp_verify', { p_code: c, p_ip: ip })) === true) return newSession(res, ip, 'kod');
      log('zły kod', ip);
      return html(res, 403, codeForm('Kod się nie zgadza albo był już użyty. Wpisz nowy (po kilku błędach blokada na 15 minut).'));
    }
    // włączenie Authenticatora: GET nic nie zużywa (podglądy linków), dopiero POST zużywa jednorazowy link
    if (u.pathname === '/totp-setup' && req.method === 'GET') {
      const t = u.searchParams.get('t') || '';
      if (!/^[A-Za-z0-9_-]{40,}$/.test(t)) return away(res);
      return html(res, 200, `${HEAD}<form method="post" action="/totp-setup"><input type="hidden" name="t" value="${t}"><button type="submit" style="font:600 18px system-ui;padding:12px 28px;min-height:44px">Dalej</button></form><script>document.forms[0].submit()</script></body></html>`);
    }
    if (u.pathname === '/totp-setup' && req.method === 'POST') {
      const t = (await readBody(req)).get('t') || '';
      if (!/^[A-Za-z0-9_-]{40,}$/.test(t)) return away(res);
      const uri = await rpc('totp_setup', { p_hash: sha(t), p_ip: ip });
      if (typeof uri !== 'string' || !uri.startsWith('otpauth://')) { log('odrzucony link totp', ip); return away(res); }
      const key = (uri.match(/secret=([A-Z2-7]+)/) || [])[1] || '';
      log('włączanie Authenticatora', ip);
      return html(res, 200, `${HEAD}<h1 style="font-size:24px">Google Authenticator</h1>
<p>Na telefonie: <a href="${esc(uri)}" style="display:inline-block;padding:12px 20px;min-height:44px;font-weight:600">Dodaj do Authenticatora</a></p>
<p>Na komputerze: zeskanuj kod aplikacją.</p><div id="qr" style="display:inline-block;background:#fff;padding:12px"></div>
<p style="font-size:16px">Albo wpisz klucz ręcznie:<br><code style="font-size:18px;word-break:break-all">${key.replace(/(.{4})/g, '$1 ').trim()}</code></p>
<p>Na koniec wpisz pierwszy kod z aplikacji — to go zatwierdzi i od razu Cię wpuści. Ta strona działa tylko raz.</p>
<form method="post" action="/code"><input name="c" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required
 style="font:600 28px ui-monospace,monospace;letter-spacing:.3em;width:8em;text-align:center;margin:12px 0;padding:10px;min-height:44px">
<br><button type="submit" style="font:600 18px system-ui;padding:12px 28px;min-height:44px">Zatwierdź</button></form>
<script src="/qrcode.js"></script><script>try{var q=qrcode(0,'M');q.addData(${JSON.stringify(uri).replace(/</g, '\\u003c')});q.make();document.getElementById('qr').innerHTML=q.createSvgTag(6,0);}catch(e){}</script></body></html>`);
    }
  }
  // /login: GET niczego nie zużywa (podglądy linków Discorda/komunikatorów odwiedzają adres automatycznie);
  // przeglądarka sama odsyła formularz (POST) skryptem — dopiero POST zużywa jednorazowy link.
  if (u.pathname === GP + '/login' && req.method === 'GET') {
    const t = u.searchParams.get('t') || '';
    if (!/^[A-Za-z0-9_-]{40,}$/.test(t)) return away(res);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer' });
    return res.end(`<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Quolino</title><body style="font:16px system-ui,sans-serif;margin:20vh auto;max-width:20em;text-align:center">
<form method="post" action="${GP}/login"><input type="hidden" name="t" value="${t}"><button type="submit" style="font:600 16px system-ui;padding:10px 22px">Wejdź</button></form>
<script>document.forms[0].submit()</script></body></html>`);
  }
  if (u.pathname === GP + '/login' && req.method === 'POST') {
    const t = (await readBody(req)).get('t') || '';
    if (!/^[A-Za-z0-9_-]{40,}$/.test(t)) return away(res);
    if ((await rpc('redeem_link', { p_hash: sha(t), p_ip: ip, p_purpose: PURPOSE })) !== true) { log('odrzucony link', ip); return away(res); }
    return newSession(res, ip, 'link');
  }
  if (u.pathname === GP + '/logout') {
    const id = cookie(req); if (id) sessions.delete(id);
    return away(res, { 'Set-Cookie': `${CK}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` });
  }
  if (!valid(cookie(req))) return away(res);
  const S = sessions.get(cookie(req));
  // kto jest zalogowany (panel chowa sekcje spoza roli) — JP 2026-11-07, konta zespołu
  if (u.pathname === '/_whoami') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify({ who: S.who || 'JP', role: S.role || 'owner' })); }
  // role: support = tylko tickety, klienci i partnerzy; editor = wszystko poza kontami, RODO, kosztami, wdrożeniami, publikacją i ustawieniami.
  // Sprawdzane TUTAJ (serwer), nie w panelu — ukrycie przycisków to tylko wygoda.
  // konto zespołu: tylko ścieżka kanoniczna (bez %xx, //, \\, ./..) — to samo widzi bramka i nginx/PostgREST
  const rawPath = req.url.split('?')[0];
  if (PURPOSE === 'admin' && S.role !== 'owner' && (rawPath !== u.pathname || /%|\/\/|\\/.test(rawPath))) { res.writeHead(403); return res.end(); }
  if (PURPOSE === 'admin' && S.role !== 'owner' && /^\/api(\/|$)/i.test(u.pathname)) {
    const ep = u.pathname.slice(4);
    const okSupport = /^\/(rpc\/(tickets_list|ticket_get|ticket_reply|ticket_set|ticket_templates|ticket_template_save|customer|search|nav_counts|today_numbers|partners_list|partner_stage)|feedback_ai)$/.test(ep);
    const denyEditor = /^\/rpc\/(team_|user_delete|user_export|setting_save|admin_setting_set|coupon_|campaign_|admin_deploy_decide|admin_cost_decide|translation_request|admin_approve|admin_publish|admin_reject|totp_|stats_link|audit_list|users_overview|customer|coupons_list|campaigns_list|search)|^(\/(cost_requests|deploy_requests|ai_budget|ai_usage_daily)?)?$/i.test(ep);
    if (S.role === 'support' ? !okSupport : denyEditor) { log('rola', S.role, S.who, 'zablokowane', ep); res.writeHead(403, { 'Content-Type': 'application/json' }); return res.end('{"message":"Brak uprawnień dla tej roli."}'); }
  }
  const h = { ...req.headers, host: UP.host };
  delete h['x-admin-who'];
  if (PURPOSE === 'admin') h['x-admin-who'] = String(S.who || 'JP').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60);   // dziennik zdarzeń (ops.admin_audit)
  if (KEEP_AUTH) {                                 // aplikacja (Umami) dostaje swoje nagłówki, ale nie ciasteczko bramki
    const rest = String(h.cookie || '').split(/;\s*/).filter((c) => c && !c.startsWith(CK + '=')).join('; ');
    if (rest) h.cookie = rest; else delete h.cookie;
  } else { delete h.cookie; delete h.authorization; }
  const p = http.request({ hostname: UP.hostname, port: UP.port || 80, path: req.url, method: req.method, headers: h }, (r) => {
    res.writeHead(r.statusCode, { ...r.headers, 'cache-control': 'no-store' });
    r.pipe(res);
  });
  p.on('error', () => page(res, 502, 'Panel chwilowo nie odpowiada.'));
  req.pipe(p);
}
