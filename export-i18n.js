#!/usr/bin/env node
/**
 * QUOLINO — Eksport tłumaczeń z Supabase do statycznych JSON-ów
 *
 * Użycie:
 *   node export-i18n.js                    # eksportuj wszystko
 *   node export-i18n.js --city perugia     # tylko jedno miasto
 *   node export-i18n.js --ui-only          # tylko UI translations
 *
 * Wymagane zmienne środowiskowe:
 *   SUPABASE_URL    — https://<project>.supabase.co
 *   SUPABASE_KEY    — anon key (public read)
 *
 * Wynik:
 *   lang/
 *   ├── pl.json          ← UI translations
 *   ├── en.json
 *   ├── pl/
 *   │   └── perugia.json ← content per miasto
 *   └── en/
 *       └── perugia.json
 */

const fs = require('fs');
const path = require('path');

// ── Konfiguracja ───────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || './lang');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌  Ustaw zmienne SUPABASE_URL i SUPABASE_KEY');
  process.exit(1);
}

const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json'
};

// ── Argumenty CLI ──────────────────────────────────────
const args = process.argv.slice(2);
const cityOnly = args.includes('--city') ? args[args.indexOf('--city') + 1] : null;
const uiOnly = args.includes('--ui-only');

// ── Pomocnicze ─────────────────────────────────────────

/** Fetch z Supabase REST API — zwraca tablicę wierszy */
async function query(table, params) {
  const url = new URL('/rest/v1/' + table, SUPABASE_URL);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString(), { headers: HEADERS });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase ${table}: ${res.status} — ${body}`);
  }
  return res.json();
}

/** Zapisz JSON na dysk, tworząc katalogi */
function writeJSON(relPath, data) {
  const full = path.join(OUTPUT_DIR, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(data, null, 2), 'utf-8');
  console.log('  ✓ ' + relPath);
}

// ── EKSPORT UI ─────────────────────────────────────────

async function exportUI() {
  console.log('\n📦 Eksport UI translations...');

  const rows = await query('ui_translations', {
    select: 'key,lang,value',
    order: 'key.asc'
  });

  // Grupuj per język: { pl: { "btn.navigate": "Nawiguj", ... }, ... }
  const byLang = {};
  for (const row of rows) {
    if (!byLang[row.lang]) byLang[row.lang] = {};
    byLang[row.lang][row.key] = row.value;
  }

  for (const [lang, translations] of Object.entries(byLang)) {
    writeJSON(lang + '.json', translations);
  }

  console.log(`  → ${Object.keys(byLang).length} języków UI\n`);
  return Object.keys(byLang);
}

// ── EKSPORT KONTENTU MIASTA ────────────────────────────

async function exportCity(citySlug) {
  console.log(`🏙  Eksport miasta: ${citySlug}`);

  // Pobierz dane miasta, przystanków, planu dnia, punktów awaryjnych, rozmówek
  // — równolegle, bo są niezależne

  const cityFilter = `city_slug=eq.${citySlug}`;

  // Faza 1: miasto meta + przystanki (potrzebujemy stop_id do fazy 2)
  const [cityMeta, cityRows, stopRows, dayRows, emergRows] = await Promise.all([
    query('cities', { slug: 'eq.' + citySlug, select: 'slug,country' }),
    query('city_translations', { city_slug: 'eq.' + citySlug, select: '*' }),
    query('stops', { city_slug: 'eq.' + citySlug, select: '*', order: 'stop_number.asc' }),
    query('day_plan', { city_slug: 'eq.' + citySlug, select: '*', order: 'sort_order.asc' }),
    query('emergency_points', { city_slug: 'eq.' + citySlug, select: '*', order: 'sort_order.asc' }),
  ]);

  if (!cityMeta.length) {
    console.warn(`  ⚠ Miasto "${citySlug}" nie istnieje w bazie`);
    return;
  }
  const country = cityMeta[0].country;

  // Faza 2: tłumaczenia przystanków (filtr po ID) + rozmówki
  const stopIds = stopRows.map(s => s.id);
  const [relevantST, phraseRows] = await Promise.all([
    stopIds.length
      ? query('stop_translations', {
          stop_id: 'in.(' + stopIds.join(',') + ')',
          select: 'stop_id,lang,name,desc_paragraphs,kids_box,photo_task'
        })
      : Promise.resolve([]),
    query('phrases', { country: 'eq.' + country, select: '*', order: 'sort_order.asc' })
  ]);

  // Zbierz wszystkie języki, dla których mamy tłumaczenie miasta
  const langs = [...new Set(cityRows.map(r => r.lang))];

  for (const lang of langs) {
    const cityTrans = cityRows.find(r => r.lang === lang);
    if (!cityTrans) continue;

    // Hero
    const json = {
      city: citySlug,
      lang: lang,
      title: cityTrans.title,
      region_label: cityTrans.region_label,
      subtitle: cityTrans.subtitle,
      stops: [],
      day_plan: [],
      emergency: [],
      phrases: []
    };

    // Przystanki
    for (const stop of stopRows) {
      const trans = relevantST.find(st => st.stop_id === stop.id && st.lang === lang);
      if (!trans) continue;

      json.stops.push({
        number: stop.stop_number,
        time: stop.time_label,
        price: stop.price,
        year_built: stop.year_built,
        wiki_article: stop.wiki_article,
        maps_query: stop.maps_query,
        whatsapp: stop.whatsapp,
        website: stop.website,
        name: trans.name,
        desc_paragraphs: trans.desc_paragraphs,
        kids_box: trans.kids_box,
        photo_task: trans.photo_task
      });
    }

    // Plan dnia
    const dayForLang = dayRows.filter(r => r.lang === lang);
    for (const d of dayForLang) {
      json.day_plan.push({
        time: d.time_label,
        description: d.description
      });
    }

    // Punkty awaryjne
    const emergForLang = emergRows.filter(r => r.lang === lang);
    for (const e of emergForLang) {
      json.emergency.push({
        type: e.type,
        label: e.label,
        description: e.description,
        maps_query: e.maps_query
      });
    }

    // Rozmówki
    const phrasesForLang = phraseRows.filter(r => r.lang === lang);
    for (const p of phrasesForLang) {
      json.phrases.push({
        local: p.phrase_local,
        user: p.phrase_user
      });
    }

    writeJSON(path.join(lang, citySlug + '.json'), json);
  }

  console.log(`  → ${langs.length} wersji językowych\n`);
}

// ── EKSPORT WSZYSTKICH MIAST ───────────────────────────

async function exportAllCities() {
  const cities = await query('cities', { select: 'slug', order: 'slug.asc' });
  for (const c of cities) {
    await exportCity(c.slug);
  }
}

// ── MAIN ───────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════');
  console.log(' QUOLINO — Eksport tłumaczeń');
  console.log(' Supabase → statyczne JSON');
  console.log('═══════════════════════════════════════');
  console.log(`  URL:    ${SUPABASE_URL}`);
  console.log(`  Output: ${OUTPUT_DIR}`);
  if (cityOnly) console.log(`  Filtr:  --city ${cityOnly}`);
  if (uiOnly) console.log(`  Filtr:  --ui-only`);

  const t0 = Date.now();

  // 1. UI
  await exportUI();

  // 2. Content
  if (!uiOnly) {
    if (cityOnly) {
      await exportCity(cityOnly);
    } else {
      await exportAllCities();
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`✅ Gotowe w ${elapsed}s`);
}

main().catch(err => {
  console.error('❌ Błąd eksportu:', err.message);
  process.exit(1);
});
