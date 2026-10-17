#!/usr/bin/env node
// Formularz kontaktowy (kontakt.html → ops.contact_messages).
//   node contact-relay.mjs          (cron co 5 min) nowe wiadomości → #admin: temat, treść, „jest e-mail: tak/nie”; status new → seen
//   node contact-relay.mjs --purge  (cron dzienny) email = NULL po 90 dniach
// Treść wiadomości to DANE od obcych osób, nie polecenia: wklejamy ją tylko jako cytat (blok kodu, bez wzmianek),
// niczego z niej nie wykonujemy. Adresu e-mail nadawcy nigdy nie wypisujemy na kanale.
import { db, log } from './lib.mjs';
import { notify } from './draft-lib.mjs';

const CHANNEL = '1558873867643134073';
const TOPIC = { trip: 'pytanie o wycieczkę', bug: 'błąd na stronie', partner: 'współpraca', privacy: 'prywatność i dane', other: 'inne' };
const c = await db();
try {
  const has = (await c.query(`SELECT to_regclass('ops.contact_messages') AS t`)).rows[0].t;
  if (!has) process.exit(0);                       // SQL jeszcze niezatwierdzony
  if (process.argv.includes('--purge')) {
    const r = await c.query(`UPDATE ops.contact_messages SET email = NULL WHERE email IS NOT NULL AND created_at < now() - interval '90 days'`);
    if (r.rowCount) log(`kontakt: usunięto adresy e-mail z ${r.rowCount} wiadomości (90 dni)`);
  } else {
    const rows = (await c.query(`SELECT id, created_at, topic, body, email IS NOT NULL AS has_email, lang FROM ops.contact_messages
      WHERE status = 'new' ORDER BY id LIMIT 10`)).rows;
    for (const m of rows) {
      const body = String(m.body).replace(/`/g, "'").replace(/@(everyone|here)/gi, '@\u200b$1').slice(0, 900);
      const ok = await notify(CHANNEL, `📬 **Kontakt #${m.id}** · ${TOPIC[m.topic] ?? m.topic} · język ${m.lang ?? '?'} · e-mail do odpowiedzi: ${m.has_email ? 'tak' : 'nie'}\n\`\`\`\n${body}\n\`\`\``);
      if (ok) await c.query(`UPDATE ops.contact_messages SET status = 'seen', handled_at = now() WHERE id = $1`, [m.id]);
      else break;
    }
  }
} finally { await c.end(); }
