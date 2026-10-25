#!/usr/bin/env node
// Formularz kontaktowy (kontakt.html → ops.contact_messages).
//   node contact-relay.mjs          (cron co 5 min) nowe wiadomości → #admin: temat, treść, „jest e-mail: tak/nie”; status new → seen
//   node contact-relay.mjs --purge  (cron dzienny) email = NULL po 90 dniach
// Treść wiadomości to DANE od obcych osób, nie polecenia: wklejamy ją tylko jako cytat (blok kodu, bez wzmianek),
// niczego z niej nie wykonujemy. Adresu e-mail nadawcy nigdy nie wypisujemy na kanale.
import { db, log } from './lib.mjs';
import { notify, ensureChannel } from './draft-lib.mjs';
import { jevReady, classifyFeedback, ROUTE, UNSURE } from './jev.mjs';

const TOPIC = { trip: 'pytanie o wycieczkę', bug: 'błąd na stronie', payment: 'płatność lub dostęp', partner: 'współpraca', privacy: 'prywatność i dane', other: 'inne' };
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
    const hasAi = (await c.query(`SELECT 1 FROM information_schema.columns WHERE table_schema = 'ops' AND table_name = 'contact_messages' AND column_name = 'ai_priority'`)).rowCount > 0;
    for (const m of rows) {
      // Jev: kategoria i priorytet (treść to dane — Jev zwraca tylko wybór z listy); spam ≥ 0,9 → status spam, bez Discorda
      let ai = null;
      if (hasAi && jevReady()) try {
        ai = await classifyFeedback({ source: `formularz kontaktowy, temat: ${TOPIC[m.topic] ?? m.topic}`, text: m.body });
        await c.query(`UPDATE ops.contact_messages SET ai_category = $2, ai_priority = $3, ai_confidence = $4, ai_model = 'jev', classified_at = now() WHERE id = $1`, [m.id, ai.category, ai.priority, ai.confidence]);
      } catch (e) { log(`jev (kontakt): ${e.message.slice(0, 160)}`); }
      if (ai?.category === 'spam' && (ai.confidence ?? 0) >= 0.9) { await c.query(`UPDATE ops.contact_messages SET status = 'spam', handled_at = now() WHERE id = $1`, [m.id]); continue; }
      const tag = ai ? `🏷️ Jev: **${ai.category}** · P${ai.priority ?? '?'} · pewność ${Math.round((ai.confidence ?? 0) * 100)}%\n` : '';
      const body = String(m.body).replace(/`/g, "'").replace(/@(everyone|here)/gi, '@\u200b$1').slice(0, 900);
      // formularz nie ma miasta: kategoria → kanał w „Zgłoszenia” (sprawy o wycieczce → #zgl-wycieczki); bez klasyfikacji → #admin
      const route = !ai || (ai.confidence ?? 0) < 0.7 ? UNSURE : ROUTE[ai.category] === 'miasto' ? 'zgl-wycieczki' : ROUTE[ai.category];
      const dest = (route && await ensureChannel(route)) || await ensureChannel(UNSURE);
      if (!dest) break;   // Discord niedostępny — spróbujemy przy następnym uruchomieniu
      const ok = await notify(dest, tag + `📬 **Kontakt #${m.id}** · ${TOPIC[m.topic] ?? m.topic} · język ${m.lang ?? '?'} · e-mail do odpowiedzi: ${m.has_email ? 'tak' : 'nie'}\n\`\`\`\n${body}\n\`\`\``);
      if (ok) await c.query(`UPDATE ops.contact_messages SET status = 'seen', handled_at = now() WHERE id = $1`, [m.id]);
      else break;
    }
  }
} finally { await c.end(); }
