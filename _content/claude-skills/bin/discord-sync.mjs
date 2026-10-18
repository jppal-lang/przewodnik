#!/usr/bin/env node
// discord-sync — buduje strukturę serwera Discord z bazy Quolino (układ JP 2026-10-18:
// „fora to kraje, kanały to wycieczki, nie rozbijamy na regiony, kolejność alfabetyczna”)
//   kraj   → forum (w kategorii kraju, np. „🇮🇹 Włochy” → forum „włochy”), region = tag posta (nie osobne forum)
//   miasto → post (wątek) w forum kraju
//   przypięty post „Spis wycieczek” A–Z z linkami — odświeżany przy każdym uruchomieniu (forum zna tylko sortowanie
//     „aktywność” i „data utworzenia”, więc alfabet gwarantuje tylko spis)
// Plus kategoria „Quolino HQ” z kanałem #hermes (polecenia ogólne).
// Idempotentny: zapisuje ID w bazie i przy kolejnym uruchomieniu tylko dokłada brakujące (nowe miasto → nowy wątek + spis).
//   node discord-sync.mjs                 — dołóż brakujące i odśwież spis
//   node discord-sync.mjs --archive-old   — jednorazowo: stare fora regionów → „archiwum-<region>”, kategoria „Archiwum”, blokada pisania
//   node discord-sync.mjs --dry-run       — tylko pokaż (nie czyta nic z Discorda)
// Wymaga w /opt/data/.env: DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, QUOLINO_DATABASE_URL. Niczego nie kasuje.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/opt/data/quolino/package.json');
const { Client } = require('pg');

function env(name) {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync('/opt/data/.env', 'utf8').split('\n').find(l => l.startsWith(name + '='));
    return line ? line.slice(name.length + 1).trim() : undefined;
  } catch { return undefined; }
}

const DRY = process.argv.includes('--dry-run');
const ARCHIVE = process.argv.includes('--archive-old');
const TOKEN = env('DISCORD_BOT_TOKEN');
const GUILD = env('DISCORD_GUILD_ID');
if (!DRY && (!TOKEN || !GUILD)) { console.error('Brak DISCORD_BOT_TOKEN lub DISCORD_GUILD_ID w .env'); process.exit(1); }

const T = { TEXT: 0, CATEGORY: 4, FORUM: 15 };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function api(method, path, body) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`https://discord.com/api/v10${path}`, {
      method,
      headers: { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) { const j = await res.json(); await sleep((j.retry_after ?? 1) * 1000 + 200); continue; }
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  }
  throw new Error('rate limit: za dużo prób');
}

const db = new Client({ connectionString: env('QUOLINO_DATABASE_URL') });
await db.connect();
const log = (...a) => console.log(DRY ? '[dry]' : '', ...a);
const link = (threadId) => `https://discord.com/channels/${GUILD}/${threadId}`;

// kolumny pomocnicze (idempotentnie)
if (!DRY) {
  await db.query('ALTER TABLE countries ADD COLUMN IF NOT EXISTS discord_forum_id text');
  await db.query('ALTER TABLE countries ADD COLUMN IF NOT EXISTS discord_index_thread_id text');
  await db.query('ALTER TABLE cities ADD COLUMN IF NOT EXISTS discord_thread_old text');
}

const channels = DRY ? [] : await api('GET', `/guilds/${GUILD}/channels`);
const exists = (id) => id && channels.some(c => c.id === id);
const byName = (name, type, parent) => channels.find(c => c.name === name && c.type === type && (parent === undefined || c.parent_id === parent));

async function ensureChannel(name, type, parent_id, extra = {}) {
  const found = byName(name, type, parent_id);
  if (found) return found.id;
  log('tworzę kanał', name, 'typ', type);
  if (DRY) return `dry-${name}`;
  const ch = await api('POST', `/guilds/${GUILD}/channels`, { name, type, parent_id, ...extra });
  channels.push(ch);
  return ch.id;
}

// 0. Quolino HQ
const hq = await ensureChannel('Quolino HQ', T.CATEGORY);
await ensureChannel('hermes', T.TEXT, hq, { topic: 'Polecenia ogólne dla Hermes-Quolino (bez kontekstu miasta).' });

const plSort = (a, b) => a.name.localeCompare(b.name, 'pl');
const regions = (await db.query('SELECT slug, name, country_code FROM regions')).rows;
const regionName = (s) => regions.find(r => r.slug === s)?.name ?? s;

for (const k of (await db.query('SELECT * FROM countries ORDER BY code')).rows) {
  // 1. kraj → kategoria (jak dotąd) i forum
  let catId = exists(k.discord_category_id) ? k.discord_category_id : null;
  if (!catId) {
    catId = await ensureChannel(`${k.emoji ?? ''} ${k.name_pl}`.trim(), T.CATEGORY);
    if (!DRY) await db.query('UPDATE countries SET discord_category_id=$1 WHERE code=$2', [catId, k.code]);
  }
  const cities = (await db.query(
    `SELECT c.slug, c.name, c.status, c.region_slug, c.discord_thread_id
       FROM cities c JOIN regions r ON r.slug = c.region_slug WHERE r.country_code = $1`, [k.code])).rows.sort(plSort);
  if (!cities.length) continue;                              // kraj bez miast: forum dopiero z pierwszym miastem

  let forumId = exists(k.discord_forum_id) ? k.discord_forum_id : null;
  const wantTags = regions.filter(r => r.country_code === k.code && cities.some(c => c.region_slug === r.slug)).map(r => r.name);
  if (!forumId) {
    forumId = await ensureChannel(k.name_pl.toLowerCase(), T.FORUM, catId, {
      topic: `${k.name_pl}. Każdy post = jedna wycieczka (miasto). Pisz w wątku miasta, Hermes zna jego kontekst. Region to tag posta. Spis A–Z: przypięty post.`,
      default_sort_order: 1,                                  // data utworzenia
      available_tags: wantTags.map(name => ({ name })),
    });
    if (!DRY) await db.query('UPDATE countries SET discord_forum_id=$1 WHERE code=$2', [forumId, k.code]);
  }
  // tagi regionów (dokładamy brakujące, nie ruszamy istniejących)
  let tags = [];
  if (!DRY) {
    const f = await api('GET', `/channels/${forumId}`);
    tags = f.available_tags || [];
    const missing = wantTags.filter(n => !tags.some(t => t.name === n));
    if (missing.length) {
      const keep = tags.map(t => ({ id: t.id, name: t.name, moderated: t.moderated, emoji_id: t.emoji_id, emoji_name: t.emoji_name }));
      const upd = await api('PATCH', `/channels/${forumId}`, { available_tags: [...keep, ...missing.map(name => ({ name }))] });
      tags = upd.available_tags || tags;
    }
  }
  const tagOf = (regionSlug) => { const n = regionName(regionSlug); return tags.find(t => t.name === n)?.id; };

  // 2. miasta → wątki. Wątek miasta „jest na miejscu”, gdy jego rodzicem jest forum kraju (GET działa też dla zarchiwizowanych).
  const inForum = async (threadId) => {
    if (!threadId || DRY) return false;
    try { return (await api('GET', `/channels/${threadId}`)).parent_id === forumId; } catch { return false; }
  };
  const needThread = [];
  for (const c of cities) if (!(await inForum(c.discord_thread_id))) needThread.push(c);
  // tworzone od Z do A: przy sortowaniu „data utworzenia” (najnowsze na górze) lista wygląda A…Z
  for (const c of [...needThread].reverse()) {
    log('tworzę wątek', c.name, 'w forum', k.name_pl.toLowerCase());
    if (DRY) continue;
    const old = c.discord_thread_id || null;
    const thread = await api('POST', `/channels/${forumId}/threads`, {
      name: c.name,
      auto_archive_duration: 10080,
      applied_tags: tagOf(c.region_slug) ? [tagOf(c.region_slug)] : [],
      message: { content:
        `**${c.name}** · ${regionName(c.region_slug)} · ${k.name_pl}\n` +
        `slug: \`${c.slug}\` · status: \`${c.status}\`\n` +
        `Pisz tu polecenia dotyczące tego miasta. Hermes zaczyna od \`qdb ctx ${c.slug}\`.` +
        (old ? `\nHistoria sprzed 2026-10-18 (stary układ z forami regionów): ${link(old)}` : '') },
    });
    await db.query('UPDATE cities SET discord_thread_old = COALESCE($3, discord_thread_old), discord_thread_id = $1, updated_at = now() WHERE slug = $2', [thread.id, c.slug, old]);
    c.discord_thread_id = thread.id;
    await sleep(700);
  }

  // 3. przypięty spis A–Z
  const fresh = DRY ? cities : (await db.query(
    `SELECT c.name, c.region_slug, c.discord_thread_id FROM cities c JOIN regions r ON r.slug = c.region_slug
      WHERE r.country_code = $1 AND c.discord_thread_id IS NOT NULL`, [k.code])).rows.sort(plSort);
  let body = `**Spis wycieczek — ${k.name_pl}** (A–Z)\n` + fresh.map(c => `• [${c.name}](${link(c.discord_thread_id)}) — ${regionName(c.region_slug)}`).join('\n');
  if (body.length > 1900) body = body.slice(0, body.lastIndexOf('\n', 1850)) + '\n… (lista skrócona — pełna w bazie)';
  if (DRY) { log('spis:\n' + body); continue; }
  let idx = k.discord_index_thread_id;
  if (idx) { try { await api('GET', `/channels/${idx}`); } catch { idx = null; } }
  if (!idx) {
    const t = await api('POST', `/channels/${forumId}/threads`, { name: 'Spis wycieczek', auto_archive_duration: 10080, message: { content: body } });
    idx = t.id;
    await db.query('UPDATE countries SET discord_index_thread_id=$1 WHERE code=$2', [idx, k.code]);
    await api('PATCH', `/channels/${idx}`, { flags: 2 });    // PINNED
  } else {
    await api('PATCH', `/channels/${idx}/messages/${idx}`, { content: body });
  }
  log('spis odświeżony:', fresh.length, 'wycieczek');
}

// 4. jednorazowo: stare fora regionów → archiwum (bez kasowania)
if (ARCHIVE && !DRY) {
  const arch = await ensureChannel('Archiwum', T.CATEGORY);
  const DENY = (1n << 11n) | (1n << 38n) | (1n << 35n);      // wysyłanie wiadomości, wiadomości w wątkach, tworzenie wątków
  for (const r of (await db.query('SELECT slug, discord_forum_id FROM regions WHERE discord_forum_id IS NOT NULL')).rows) {
    if (!exists(r.discord_forum_id)) continue;
    const ch = await api('GET', `/channels/${r.discord_forum_id}`);
    if (ch.parent_id === arch) { log('już w archiwum:', ch.name); continue; }
    const others = (ch.permission_overwrites || []).filter(o => !(o.type === 0 && o.id === GUILD));
    const own = (ch.permission_overwrites || []).find(o => o.type === 0 && o.id === GUILD);
    others.push({ id: GUILD, type: 0, allow: String(BigInt(own?.allow ?? 0) & ~DENY), deny: String(BigInt(own?.deny ?? 0) | DENY) });
    await api('PATCH', `/channels/${r.discord_forum_id}`, { name: `archiwum-${r.slug}`, parent_id: arch });
    log('zarchiwizowano forum (nazwa + kategoria)', r.slug);
    try { await api('PATCH', `/channels/${r.discord_forum_id}`, { permission_overwrites: others }); log('  blokada pisania: ustawiona'); }
    catch (e) { log('  blokada pisania NIE ustawiona (bot nie ma uprawnienia „Zarządzaj rolami”/pozwoleń):', String(e.message).slice(0, 80)); }
    await sleep(700);
  }
}

if (!DRY) console.log('\nNowe fora krajów (do free_response_channels): ' +
  (await db.query('SELECT discord_forum_id FROM countries WHERE discord_forum_id IS NOT NULL')).rows.map(x => x.discord_forum_id).join(','));
await db.end();
