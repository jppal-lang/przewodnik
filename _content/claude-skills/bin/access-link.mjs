#!/usr/bin/env node
// Linki testowe z kluczem dostępu do pełnych wycieczek (Etap A, JP 2026-10-13) — WYŁĄCZNIE w wiadomości prywatnej do JP.
//   node access-link.mjs new --label "JP" --days 60   prośba o nowy link (Hermes tylko zapisuje prośbę)
//   node access-link.mjs list                          klucze: id, etykieta, ważność, użycie (bez samych kluczy)
//   node access-link.mjs revoke <id>                   unieważnia klucz od razu
//   node access-link.mjs --process                     (cron co minutę, kontekst serwera) generuje klucz i wysyła DM
// W bazie jest tylko skrót SHA-256 klucza. Klucz widzi wyłącznie odbiorca wiadomości prywatnej — Hermes nigdy.
// Odbiorca jest stały (QUOLINO_ADMIN_DISCORD_ID, a gdy brak — właściciel serwera Discord), niezależnie od tego, kto prosił.
import crypto from 'node:crypto';
import { db, env, log } from './lib.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0] === '--process' ? '--process' : argv[0];
const opt = (n, d) => { const i = argv.indexOf(n); return i > -1 ? String(argv[i + 1] ?? d) : d; };
const SITE = env('QUOLINO_SITE_URL') || 'https://quolino.srv1984679.hstgr.cloud';
const token = env('DISCORD_BOT_TOKEN');
const api = async (path, opts = {}) => {
  const r = await fetch(`https://discord.com/api/v10${path}`, { headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' }, ...opts });
  if (!r.ok) throw new Error(`Discord ${path}: ${r.status}`);
  return r.json();
};

const c = await db();
try {
  if (cmd === 'new') {
    const label = opt('--label', '').slice(0, 60).trim();
    const days = Math.max(1, Math.min(365, parseInt(opt('--days', '60'), 10) || 60));
    if (!label) { console.log('Podaj --label "nazwa" (np. "JP").'); process.exitCode = 2; }
    else {
      const [{ n }] = (await c.query(`SELECT count(*)::int AS n FROM ops.access_link_requests WHERE requested_at > now() - interval '10 minutes'`)).rows;
      if (n >= 3) { console.log('Za dużo próśb w ostatnich 10 minutach — spróbuj za chwilę.'); process.exit(0); }
      await c.query('INSERT INTO ops.access_link_requests (requested_by, label, days) VALUES ($1, $2, $3)', ['hermes', label, days]);
      console.log(`Prośba przyjęta (etykieta „${label}”, ważny ${days} dni). Link przyjdzie do JP w wiadomości prywatnej w ciągu minuty. Nie wklejaj niczego w kanale.`);
    }
  } else if (cmd === 'list') {
    const rows = (await c.query(`SELECT k.id, k.label, k.created_at::date AS created, k.expires_at::date AS expires,
        CASE WHEN k.revoked_at IS NOT NULL THEN 'unieważniony' WHEN k.expires_at < now() THEN 'wygasł' ELSE 'ważny' END AS status,
        (SELECT count(*) FROM public.access_key_usage u WHERE u.key_id = k.id)::int AS uses,
        (SELECT max(used_at) FROM public.access_key_usage u WHERE u.key_id = k.id) AS last_used
        FROM public.access_keys k ORDER BY k.id DESC LIMIT 50`)).rows;
    console.log(rows.length ? JSON.stringify(rows, null, 2) : 'Brak kluczy.');
  } else if (cmd === 'revoke') {
    const id = parseInt(argv[1], 10);
    if (!id) { console.log('Użycie: access-link.mjs revoke <id>'); process.exitCode = 2; }
    else {
      const r = await c.query('UPDATE public.access_keys SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING id, label', [id]);
      console.log(r.rows.length ? `Unieważniono klucz ${id} („${r.rows[0].label}”).` : `Klucz ${id} nie istnieje albo już jest unieważniony.`);
    }
  } else if (cmd === '--process') {
    const [req] = (await c.query(`UPDATE ops.access_link_requests SET done_at = now() WHERE id = (
        SELECT id FROM ops.access_link_requests WHERE done_at IS NULL AND requested_at > now() - interval '10 minutes'
        ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id, label, days`)).rows;
    await c.query(`UPDATE ops.access_link_requests SET done_at = now(), result = 'przeterminowana' WHERE done_at IS NULL AND requested_at <= now() - interval '10 minutes'`);
    if (!req) process.exit(0);
    if (!token) throw new Error('brak DISCORD_BOT_TOKEN');
    let owner = env('QUOLINO_ADMIN_DISCORD_ID');
    if (!owner) {
      const guilds = await api('/users/@me/guilds');
      if (guilds.length !== 1) throw new Error('ustaw QUOLINO_ADMIN_DISCORD_ID (bot jest na kilku serwerach)');
      owner = (await api(`/guilds/${guilds[0].id}`)).owner_id;
    }
    const key = crypto.randomBytes(32).toString('base64url');
    const [row] = (await c.query(`INSERT INTO public.access_keys (key_hash, label, expires_at, created_by)
        VALUES ($1, $2, now() + make_interval(days => $3), 'access-link') RETURNING id, expires_at::date AS expires`,
      [crypto.createHash('sha256').update(key).digest('hex'), req.label, req.days])).rows;
    const dm = await api('/users/@me/channels', { method: 'POST', body: JSON.stringify({ recipient_id: owner }) });
    await api(`/channels/${dm.id}/messages`, { method: 'POST', body: JSON.stringify({
      content: `🔑 Link dostępu do pełnych wycieczek („${req.label}”, klucz #${row.id}). Ważny do ${row.expires}.\n<${SITE}/?k=${key}>\n` +
        `Otwórz raz na urządzeniu — przeglądarka zapamięta klucz. Nie przekazuj dalej. Unieważnienie: Hermes → „odwołaj klucz ${row.id}”.`,
      allowed_mentions: { parse: [] } }) });
    await c.query("UPDATE ops.access_link_requests SET result = 'wysłany' WHERE id = $1", [req.id]);
    log(`klucz #${row.id} („${req.label}”) wysłany prywatnie do właściciela`);
  } else {
    console.log('Użycie: access-link.mjs new --label "JP" --days 60 | list | revoke <id> | --process');
    process.exitCode = 2;
  }
} catch (e) { console.error('BŁĄD:', e.message); process.exitCode = 1; }
finally { await c.end(); }
