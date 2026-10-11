#!/usr/bin/env node
// Punkty gastro (restauracje, lody, słodycze) — comiesięczna aktualizacja ocen Google (decyzja JP 2026-10-11).
//   node gastro-refresh.mjs [--city <slug>] [--dry] [--notify <kanał zbiorczy>]
// Cron na VPS: 1. dnia miesiąca rano (patrz install w paczce). Klucz: GOOGLE_PLACES_API_KEY w środowisku Hermesa.
//
// Dla każdego lokalu z opublikowanych wycieczek: Google Places (New) → ocena, liczba opinii, status lokalu.
//   • zapis w stops (rating, reviews_count, google_place_id, business_status, rating_checked_at)
//     + pełna historia w public.gastro_checks
//   • ALARM w wątku miasta, gdy lokal: zamknięty (na stałe/czasowo), spadł poniżej progu
//     (ocena ≥ 4,1 i > 100 opinii), albo Google go nie znajduje. Lokalu NIE usuwamy automatycznie —
//     Hermes proponuje JP zamiennik w rozmowie (trip-revise).
//   • zbiorcze podsumowanie na kanale #lokale (albo --notify / QUOLINO_GASTRO_CHANNEL).
import { db, env, log } from './lib.mjs';
import { notify } from './draft-lib.mjs';

const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : undefined; };
const DRY = argv.includes('--dry');
const CITY = opt('--city');
const ADMIN = opt('--notify') ?? env('QUOLINO_GASTRO_CHANNEL') ?? '#lokale';   // podsumowanie: #lokale (decyzja JP 2026-10-11)
const KEY = env('GOOGLE_PLACES_API_KEY');
const FOOD = ['restaurant', 'icecream', 'sweets'];
const MIN_RATING = 4.1, MIN_REVIEWS = 100;
const FIELDS = 'id,displayName,rating,userRatingCount,businessStatus,googleMapsUri';

async function places(stop) {
  const headers = { 'X-Goog-Api-Key': KEY, 'Content-Type': 'application/json' };
  if (stop.google_place_id) {
    const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(stop.google_place_id)}`,
      { headers: { ...headers, 'X-Goog-FieldMask': FIELDS }, signal: AbortSignal.timeout(30_000) });
    if (r.ok) return r.json();
    if (r.status !== 404) throw new Error(`Places ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  const body = { textQuery: stop.maps_query || `${stop.name}, ${stop.city_slug}`, maxResultCount: 1, languageCode: 'pl' };
  if (stop.lat && stop.lon) body.locationBias = { circle: { center: { latitude: +stop.lat, longitude: +stop.lon }, radius: 400 } };
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST', headers: { ...headers, 'X-Goog-FieldMask': FIELDS.split(',').map(f => 'places.' + f).join(',') },
    body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`Places ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).places?.[0] ?? null;
}

const c = await db();
const q = async (sql, p) => (await c.query(sql, p)).rows;
try {
  if (!KEY) throw new Error('brak GOOGLE_PLACES_API_KEY w środowisku Hermesa (hPanel → Docker → hermes-quolino → zmienne)');
  const stops = await q(`
    SELECT s.id, s.city_slug, s.stop_key, s.category, s.maps_query, s.lat, s.lon, s.rating, s.reviews_count,
           s.google_place_id, coalesce(t.name, s.stop_key) AS name, oc.discord_thread_id
      FROM public.stops s
      JOIN public.cities c ON c.slug = s.city_slug AND c.status = 'published'
      LEFT JOIN public.stop_translations t ON t.stop_id = s.id AND t.lang = 'pl'
      LEFT JOIN ops.cities oc ON oc.slug = s.city_slug
     WHERE s.category = ANY($1) AND ($2::text IS NULL OR s.city_slug = $2)
     ORDER BY s.city_slug, s.sort_order`, [FOOD, CITY ?? null]);
  log(`gastro: ${stops.length} lokali${CITY ? ' w ' + CITY : ''}`);

  const alerts = [], changes = [];
  for (const s of stops) {
    let p, err = null;
    try { p = await places(s); } catch (e) { err = e.message; }
    const rating = p?.rating ?? null, count = p?.userRatingCount ?? null, status = p?.businessStatus ?? null;
    if (!DRY) {
      await q(`INSERT INTO public.gastro_checks (stop_id, city_slug, stop_key, place_id, name_google, rating, reviews_count, business_status, maps_url, error)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [s.id, s.city_slug, s.stop_key, p?.id ?? null, p?.displayName?.text ?? null, rating, count, status, p?.googleMapsUri ?? null, err]);
      if (p) await q(`UPDATE public.stops SET rating = $2, reviews_count = $3, google_place_id = $4, business_status = $5,
                        rating_checked_at = now() WHERE id = $1`, [s.id, rating, count, p.id, status]);
    }
    const why = [];
    if (err) why.push(`błąd zapytania: ${err}`);
    else if (!p) why.push('Google nie znajduje lokalu (zmiana nazwy albo zamknięty?)');
    else {
      if (status && status !== 'OPERATIONAL') why.push(status === 'CLOSED_PERMANENTLY' ? 'ZAMKNIĘTY NA STAŁE' : 'zamknięty czasowo');
      if (rating != null && (rating < MIN_RATING || (count ?? 0) <= MIN_REVIEWS))
        why.push(`poniżej progu: ${rating} (${count} opinii), wymagane ≥ ${MIN_RATING} i > ${MIN_REVIEWS}`);
    }
    if (why.length) alerts.push({ ...s, why, rating, count, url: p?.googleMapsUri });
    else if (s.rating != null && rating != null && Math.abs(rating - s.rating) >= 0.2)
      changes.push(`${s.city_slug} · ${s.name}: ${s.rating} → ${rating} (${count} opinii)`);
    await new Promise(r => setTimeout(r, 300));
  }

  // alarm w wątku miasta — Hermes podejmie rozmowę o zamienniku
  if (!DRY) for (const a of alerts) {
    await notify(a.discord_thread_id ?? ADMIN,
      `🍝 **${a.name}** (${a.city_slug}, ${a.category}) — przegląd ocen Google: ${a.why.join('; ')}.` +
      (a.url ? `\n${a.url}` : '') + `\nProponuję wymienić lokal na polecany przez Google — napisz „szukaj zamiennika”.`);
  }
  const summary = `🍝 Przegląd lokali (${new Date().toISOString().slice(0, 10)}): sprawdzonych ${stops.length}, ` +
    `alarmów ${alerts.length}${changes.length ? `, zmiany ocen ${changes.length}` : ''}.` +
    (alerts.length ? `\n${alerts.map(a => `• ${a.city_slug} · ${a.name}: ${a.why.join('; ')}`).join('\n')}` : '') +
    (changes.length ? `\nZmiany: \n${changes.map(x => `• ${x}`).join('\n')}` : '');
  if (!DRY) await notify(ADMIN, summary);
  console.log(summary);
} catch (e) {
  console.error('BŁĄD:', e.message);
  if (!DRY) await notify(ADMIN, `⚠️ Przegląd lokali: ${e.message.slice(0, 400)}`);
  process.exitCode = 1;
} finally { await c.end(); }
