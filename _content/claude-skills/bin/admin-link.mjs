#!/usr/bin/env node
// Jednorazowy link do panelu admina — WYŁĄCZNIE w wiadomości prywatnej do JP (decyzja JP 2026-10-11).
//   node admin-link.mjs --by "<kto prosił, nick z Discorda>"
// Link: ważny 10 minut, działa raz; potem sesja w przeglądarce (do 30 min bez ruchu, max 2 h).
// Odbiorca jest stały (QUOLINO_ADMIN_DISCORD_ID, a gdy brak — właściciel serwera Discord), niezależnie od tego, kto prosił.
// Hermes (bez dostępu do tokena bota) tylko ZAPISUJE prośbę; link wysyła cron serwera co minutę:
//   node admin-link.mjs --process   (z kontekstu serwera — ma token bota)
import crypto from 'node:crypto';
import { db, env, log } from './lib.mjs';

const argv = process.argv.slice(2);
const by = (() => { const i = argv.indexOf('--by'); return i > -1 ? String(argv[i + 1] ?? '').slice(0, 80) : '?'; })();
const BASE = env('QUOLINO_ADMIN_URL') || 'https://admin.quolino.com';
const token = env('DISCORD_BOT_TOKEN');
const H = { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' };
const api = async (path, opts = {}) => {
  const r = await fetch(`https://discord.com/api/v10${path}`, { headers: H, ...opts });
  if (!r.ok) throw new Error(`Discord ${path}: ${r.status}`);
  return r.json();
};

const c = await db();
const PROCESS = argv.includes('--process');
try {
  if (!PROCESS) {
    // prośba: zapis w kolejce (najwyżej 3 na 10 minut — reszta ignorowana)
    const [{ n }] = (await c.query(`SELECT count(*)::int AS n FROM ops.admin_link_requests WHERE requested_at > now() - interval '10 minutes'`)).rows;
    if (n >= 3) { console.log('Za dużo próśb w ostatnich 10 minutach — spróbuj za chwilę.'); process.exit(0); }
    await c.query('INSERT INTO ops.admin_link_requests (requested_by) VALUES ($1)', [by]);
    console.log('Prośba przyjęta. Link przyjdzie do JP w wiadomości prywatnej w ciągu minuty. Nie wklejaj niczego w kanale.');
    process.exit(0);
  }
  const [req] = (await c.query(`UPDATE ops.admin_link_requests SET done_at = now() WHERE id = (
      SELECT id FROM ops.admin_link_requests WHERE done_at IS NULL AND requested_at > now() - interval '10 minutes'
      ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id, requested_by`)).rows;
  await c.query(`UPDATE ops.admin_link_requests SET done_at = now(), result = 'przeterminowana' WHERE done_at IS NULL`);
  if (!req) process.exit(0);
  const by2 = req.requested_by || by;
  if (!token) throw new Error('brak DISCORD_BOT_TOKEN');
  let owner = env('QUOLINO_ADMIN_DISCORD_ID');
  if (!owner) {
    const guilds = await api('/users/@me/guilds');
    if (guilds.length !== 1) throw new Error('ustaw QUOLINO_ADMIN_DISCORD_ID (bot jest na kilku serwerach)');
    owner = (await api(`/guilds/${guilds[0].id}`)).owner_id;
  }
  const t = crypto.randomBytes(32).toString('base64url');
  await c.query(`INSERT INTO ops.admin_links (token_hash, expires_at, requested_by) VALUES ($1, now() + interval '10 minutes', $2)`,
    [crypto.createHash('sha256').update(t).digest('hex'), by2]);
  const dm = await api('/users/@me/channels', { method: 'POST', body: JSON.stringify({ recipient_id: owner }) });
  await api(`/channels/${dm.id}/messages`, { method: 'POST', body: JSON.stringify({
    content: `🔐 Jednorazowy link do panelu Quolino (prośba: ${by2}). Ważny 10 minut, działa raz — nie przekazuj dalej.\n<${BASE}/login?t=${t}>\n` +
      `Sesja wygaśnie po 30 min bez ruchu albo po 2 h. Jeśli to nie Ty prosiłeś — zignoruj i daj znać.`,
    allowed_mentions: { parse: [] } }) });
  await c.query("UPDATE ops.admin_link_requests SET result = 'wysłany' WHERE id = $1", [req.id]);
  log(`link wysłany prywatnie do właściciela (prośba: ${by2})`);
} catch (e) { console.error('BŁĄD:', e.message); process.exitCode = 1; }
finally { await c.end(); }
