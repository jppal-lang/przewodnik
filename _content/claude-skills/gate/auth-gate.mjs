// Bramka rejestracji i resetu hasła (JP 2026-10-18: „zakładanie konta odporne na boty”).
// Traefik kieruje tu tylko POST https://auth.quolino.com/auth/v1/signup i /recover (reszta idzie prosto do GoTrue).
// Przed przekazaniem do GoTrue: public.auth_gate_check w bazie (ALTCHA, pułapka, czas wypełnienia, limity na skrót IP).
// Bez zależności. Pola altcha/hp/ms nie trafiają do GoTrue.
import http from 'node:http';

const GOTRUE = process.env.GOTRUE_URL || 'http://gotrue:9999';
const API = process.env.API_URL || 'http://quolino-web-api-1:3000';
const ORIGIN = process.env.ALLOW_ORIGIN || 'https://quolino.com';
const PATHS = { '/signup': 'signup', '/recover': 'recover' };
const log = (...a) => console.log(new Date().toISOString(), ...a);
const cors = { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-client-info', 'Access-Control-Max-Age': '600', Vary: 'Origin' };
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors }); res.end(JSON.stringify(obj)); };

function readBody(req) {
  return new Promise((ok, bad) => {
    let n = 0; const parts = [];
    req.on('data', (c) => { n += c.length; if (n > 8192) { bad(new Error('too big')); req.destroy(); } else parts.push(c); });
    req.on('end', () => ok(Buffer.concat(parts).toString('utf8')));
    req.on('error', bad);
  });
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/health') return send(res, 200, { ok: true });
  const kind = PATHS[u.pathname];
  if (!kind) return send(res, 404, { code: 'not_found' });
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (req.method !== 'POST') return send(res, 405, { code: 'method' });
  const ip = String(req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0]).trim() || req.socket.remoteAddress;
  let body;
  try { body = JSON.parse(await readBody(req) || '{}'); } catch { return send(res, 400, { code: 'bad_json', msg: 'Nieprawidłowe dane.' }); }
  const { altcha, hp, ms, ...rest } = body || {};
  try {
    const r = await fetch(`${API}/rpc/auth_gate_check`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Real-IP': ip },
      body: JSON.stringify({ p_kind: kind, p_altcha: altcha || null, p_hp: hp || null, p_ms: Number.isFinite(+ms) ? Math.round(+ms) : null }) });
    const g = r.ok ? await r.json() : null;
    if (!g || !g.ok) {
      log(kind, 'odrzucone', g ? g.code : 'api ' + r.status);
      return send(res, g ? 400 : 503, { code: g ? 'gate_' + g.code : 'gate_unavailable', msg: g ? g.message : 'Chwilowy błąd. Spróbuj za minutę.' });
    }
  } catch (e) { log(kind, 'api niedostępne', e.message); return send(res, 503, { code: 'gate_unavailable', msg: 'Chwilowy błąd. Spróbuj za minutę.' }); }
  // przekazanie do GoTrue (redirect_to z adresu, nagłówek IP dla limitów GoTrue)
  try {
    const r = await fetch(`${GOTRUE}${u.pathname}${u.search}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Real-IP': ip }, body: JSON.stringify(rest) });
    const text = await r.text();
    log(kind, 'GoTrue', r.status);
    res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store', ...cors });
    res.end(text);
  } catch (e) { log(kind, 'GoTrue niedostępne', e.message); send(res, 503, { code: 'auth_unavailable', msg: 'Chwilowy błąd. Spróbuj za minutę.' }); }
}).listen(8080, () => log('auth-gate :8080'));
