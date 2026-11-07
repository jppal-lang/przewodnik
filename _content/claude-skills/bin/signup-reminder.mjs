#!/usr/bin/env node
// Przypomnienie o potwierdzeniu konta (JP 2026-11-07: „ilu wpisało @, ale nie potwierdziło”).
// Konto bez kliknięcia w link po ~20 h dostaje JEDEN drugi mail z linkiem (GoTrue /resend, ten sam mail co przy rejestracji).
// Niepotwierdzone konta kasuje ops/auth-cleanup.sh po 48 h, więc okno to 20–44 h. Najwyżej 20 maili na przebieg.
//   node signup-reminder.mjs [--dry]      (cron co godzinę)
// W logu tylko liczby — bez adresów.
import { db, env, log } from './lib.mjs';

const DRY = process.argv.includes('--dry');
const AUTH = (env('QUOLINO_AUTH_URL') || 'https://auth.quolino.com/auth/v1').replace(/\/$/, '');
const BACK = `${env('QUOLINO_SITE_URL') || 'https://quolino.com'}/konto.html`;

async function main() {
  const c = await db();
  try {
    // godzina przypomnienia z Ustawień panelu (signup_reminder_hours, domyślnie 20; okno do 44 h, bo po 48 h konto znika)
    const H = Math.min(40, Math.max(1, +((await c.query(`SELECT value FROM ops.app_settings WHERE name = 'signup_reminder_hours'`).catch(() => ({ rows: [] }))).rows[0]?.value ?? 20) || 20));
    const { rows } = await c.query(`
      SELECT u.id, u.email FROM auth.users u
       WHERE u.deleted_at IS NULL AND u.email_confirmed_at IS NULL AND u.email IS NOT NULL
         AND u.created_at < now() - make_interval(hours => $1::int) AND u.created_at > now() - interval '44 hours'
         AND NOT EXISTS (SELECT 1 FROM ops.signup_reminders r WHERE r.user_id = u.id AND (r.ok OR r.sent_at > now() - interval '3 hours'))   -- nieudane: kolejna próba po 3 h
       ORDER BY u.created_at LIMIT 20`, [H]);
    let ok = 0, bad = 0;
    for (const u of rows) {
      if (DRY) { ok++; continue; }
      let good = false, note = null;
      try {
        const r = await fetch(`${AUTH}/resend?redirect_to=${encodeURIComponent(BACK)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'signup', email: u.email }), signal: AbortSignal.timeout(20_000) });
        good = r.ok; if (!r.ok) note = `HTTP ${r.status}`;
      } catch (e) { note = e.message.slice(0, 120); }
      await c.query(`INSERT INTO ops.signup_reminders (user_id, ok, note) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET ok = EXCLUDED.ok, note = EXCLUDED.note, sent_at = now() WHERE NOT ops.signup_reminders.ok`, [u.id, good, note]);
      good ? ok++ : bad++;
    }
    if (rows.length) log(`signup-reminder: ${DRY ? '[próba] ' : ''}wysłane ${ok}, błędy ${bad}`);
  } finally { await c.end(); }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(`signup-reminder: ${e.message}`); process.exit(1); });
