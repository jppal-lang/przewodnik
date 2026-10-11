#!/usr/bin/env node
// Posty o wycieczce do mediów społecznościowych (decyzja JP 2026-10-11): każda opublikowana wycieczka → szkic postów
// na kanale #social + scenariusz rolki: animacja Quo w miejscach wycieczki (prompty do generatora wideo, generuje JP).
// GPT pisze, Claude sprawdza fakty z danymi wycieczki, JP decyduje i publikuje (nic nie wychodzi samo).
//   node social-draft.mjs <slug> [--langs pl,en] [--notify <kanał|id>] [--dry]
// Języki: domyślnie QUOLINO_SOCIAL_LANGS albo „pl,en”. Wynik zapisany też w work/social/<slug>-<data>.json.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { db, env, log, openrouter, claude, extractJson } from './lib.mjs';
import { notify, SITE } from './draft-lib.mjs';

const argv = process.argv.slice(2);
const slug = argv[0];
const opt = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : undefined; };
if (!slug || slug.startsWith('--')) { console.error('Użycie: social-draft.mjs <slug> [--langs pl,en] [--notify #social] [--dry]'); process.exit(2); }
const LANGS = (opt('--langs') ?? env('QUOLINO_SOCIAL_LANGS') ?? 'pl,en').split(',').map(s => s.trim()).filter(Boolean);
const CHANNEL = opt('--notify') ?? env('QUOLINO_SOCIAL_CHANNEL') ?? '#social';
const DRY = argv.includes('--dry');
const abs = (u) => /^https?:/.test(u) ? u : `${SITE}/${String(u).replace(/^\/+/, '')}`;

const c = await db();
const q = async (sql, p) => (await c.query(sql, p)).rows;
try {
  const [city] = await q('SELECT slug, region_slug, hero_image, status, bandana_color FROM public.cities WHERE slug = $1', [slug]);
  if (!city || city.status !== 'published') throw new Error(`${slug}: wycieczka nie jest opublikowana`);
  const have = new Set((await q('SELECT DISTINCT lang FROM public.city_translations WHERE city_slug = $1', [slug])).map(r => r.lang));
  // zdjęcia: główne miasta + wszystkie obrazy z danych wycieczki
  const images = new Set(city.hero_image ? [abs(city.hero_image)] : []);
  const pl = (await q('SELECT public.trip_export($1, $2) AS j', [slug, 'pl']))[0].j;
  JSON.stringify(pl, (k, v) => { if (typeof v === 'string' && /\.(webp|jpe?g|png)(\?|$)/i.test(v)) images.add(abs(v)); return v; });
  const imgs = [...images].slice(0, 12);

  // rolka: jedna animacja Quo na wycieczkę (opis maskotki z repo: MASKOTKA-3D.md + storyboard animacji hero)
  const REPO = '/opt/data/repo/przewodnik';
  const ref = ['MASKOTKA-3D.md', 'video/storyboard-quolino-animacja.md']
    .map(f => existsSync(`${REPO}/${f}`) ? `--- ${f} ---\n${readFileSync(`${REPO}/${f}`, 'utf8').slice(0, 6000)}` : '').join('\n');
  const reelData = `KOLOR APASZKI (miasto): ${city.bandana_color ?? 'brak w bazie — zaproponuj zgodnie z systemem apaszek'}
OPIS MASKOTKI I DOTYCHCZASOWEJ ANIMACJI:
${ref || '(brak plików — opis z instrukcji)'}
DANE WYCIECZKI:
${JSON.stringify(pl).slice(0, 50000)}`;
  let reel = null;
  try {
    log(`${slug}: rolka — scenariusz`);
    const r = await openrouter('quolino-trip-social', `ROLKA. Napisz scenariusz animacji Quo w miejscach tej wycieczki.\n\n${reelData}`, 'draft');
    reel = extractJson(r.text);
    try {
      reel = extractJson(await claude('quolino-trip-social', `KONTROLA ROLKI. Sprawdź i popraw.\n\nSZKIC:\n${JSON.stringify(reel)}\n\n${reelData}`, { web: true }));
    } catch (e) { log('kontrola rolki nieudana:', e.message); reel.check = 'brak kontroli Claude'; }
  } catch (e) { log('rolka nieudana:', e.message); }

  const out = [];
  for (const lang of LANGS) {
    const src = lang !== 'pl' && have.has(lang) ? (await q('SELECT public.trip_export($1, $2) AS j', [slug, lang]))[0].j : pl;
    const url = `${SITE}/${lang}/${city.region_slug}/${slug}/`;
    const data = `JĘZYK POSTA: ${lang}${src === pl && lang !== 'pl' ? ' (dane wycieczki po polsku — napisz natywnie w języku posta)' : ''}
LINK DO WYCIECZKI: ${url}
ROLKA (napisz napisy do tych ujęć, po jednym na ujęcie): ${reel?.shots ? reel.shots.map(x => `${x.n}. ${x.place} — ${x.action}`).join('; ') : 'brak rolki — reel_text pomiń'}
ZDJĘCIA DO WYBORU:
${imgs.join('\n') || '(brak)'}
DANE WYCIECZKI:
${JSON.stringify(src).slice(0, 60000)}`;
    log(`${slug} ${lang}: piszę`);
    const { text, model, cost } = await openrouter('quolino-trip-social', `Napisz posty o tej wycieczce.\n\n${data}`, 'draft');
    const draft = extractJson(text);
    log(`${slug} ${lang}: sprawdzam (Claude)`);
    let checked;
    try {
      checked = extractJson(await claude('quolino-trip-social', `KONTROLA. Sprawdź i popraw szkic postów.\n\nSZKIC:\n${JSON.stringify(draft)}\n\n${data}`));
    } catch (e) { log('kontrola Claude nieudana:', e.message); checked = { ...draft, check: 'brak kontroli Claude' }; }
    out.push({ lang, url, model, cost, ...checked });
  }

  const dir = '/opt/data/quolino/work/social'; mkdirSync(dir, { recursive: true });
  const file = `${dir}/${slug}-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(file, JSON.stringify({ posts: out, reel }, null, 2));
  const msgs = [`📣 **Posty o wycieczce: ${slug}** — szkic do decyzji JP (nic nie zostało opublikowane). Języki: ${out.map(o => o.lang).join(', ')}.`];
  for (const o of out) {
    msgs.push(`━━━━ **${o.lang.toUpperCase()}** · kontrola: ${o.check ?? '?'}\n**Facebook**\n${o.facebook}`);
    msgs.push(`**Instagram** (karuzela: ${(o.image_order ?? []).length} zdj.)\n${o.instagram}\n\n*alt:* ${o.alt ?? ''}`);
    msgs.push(`**Napisy do rolki**: ${(o.reel_text?.overlays ?? []).map((t, i) => `${i + 1}) ${t}`).join(' · ')}\n` +
      `**Podpis rolki**: ${o.reel_text?.caption ?? ''}\nZdjęcia do karuzeli:\n${(o.image_order ?? []).map(u => `<${u}>`).join('\n')}`);
  }
  if (reel) {
    msgs.push(`🎬 **Rolka: animacja Quo — ${reel.title ?? slug}** · apaszka: ${reel.bandana ?? '?'} · ${reel.duration_s ?? '?'} s · 9:16 · kontrola: ${reel.check ?? '?'}\n` +
      `Postać (wklejona w każdy prompt): ${reel.character ?? ''}\nStyl (kreskówka, w każdym prompcie): ${reel.style ?? ''}`);
    for (const sh of reel.shots ?? []) msgs.push(`**Ujęcie ${sh.n}** · ${sh.place} · ${sh.seconds ?? '?'} s · ${sh.camera ?? ''}\n${sh.action ?? ''}\n\`\`\`\n${sh.prompt ?? ''}\n\`\`\``);
    msgs.push(`Muzyka: ${reel.music ?? ''} · Plansza końcowa: ${reel.end_card ?? ''}\nJP: wygeneruj ujęcia w generatorze wideo i wrzuć klipy tutaj — Hermes pomoże w poprawkach promptów.`);
  }
  if (!DRY) for (const m of msgs) await notify(CHANNEL, m);
  console.log(msgs.join('\n\n'));
  log(`zapisane: ${file}`);
} catch (e) { console.error('BŁĄD:', e.message); process.exitCode = 1; }
finally { await c.end(); }
