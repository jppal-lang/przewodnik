#!/usr/bin/env node
// Pierwszy szkic nowej wycieczki — rozmowa z JP w wątku miasta (Hermes).
//   node trip-draft.mjs <slug> --name "Gubbio" --region umbria [--country it] [--duration full_day|half_day]
//        [--brief "co JP chce: tempo, must-see, kolejka…"] [--research <plik.md>] [--notify <id kanału>]
// 1) RESEARCH — Claude z dostępem do sieci (fakty ze źródłami; umiejętność quolino-trip-writing)
// 2) PISANIE  — GPT (OpenRouter, zadanie „draft”) pisze meta + pl według umiejętności
// 3) KONTROLA — walidator + Claude (trip-review); błędy wracają do GPT, najwyżej 2 rundy
// 4) ZAPIS    — nowa wersja „draft” w historii (tabele na żywo nietknięte) + link podglądu
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { claude, openrouter, openrouterJson, extractJson, log, db, spent } from './lib.mjs';
import { WORK, DEPTH_TEXT, fullReview, fixRound, describeOps, applyOps, mergeChanges, saveDraft, previewUrl, notify, verdictLine, factsLine } from './draft-lib.mjs';
import { loadRules, rulesText } from './quality-lib.mjs';

const argv = process.argv.slice(2);
const slug = argv[0];
const opt = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : undefined; };
const name = opt('--name'), region = opt('--region'), country = opt('--country') ?? 'it';
const duration = opt('--duration') ?? 'full_day', brief = opt('--brief') ?? '', channel = opt('--notify');
if (!slug || !/^[a-z0-9-]+$/.test(slug) || !name || !region) {
  console.error('Użycie: trip-draft.mjs <slug> --name "Nazwa" --region <region_slug> [--country it] [--duration full_day|half_day] [--brief "…"] [--research plik] [--notify kanał]');
  process.exit(2);
}
const dir = join(WORK, slug); mkdirSync(dir, { recursive: true });
const c = await db();
const q = async (sql, p) => (await c.query(sql, p)).rows;

const SKELETON = `FORMAT (dwa obiekty w jednym JSON-ie: {"meta": …, "content": …}). Każdy klucz obecny; brak danych = null.
meta = {
 "doc": {"version": "v1", "generated_at": "<ISO>"},
 "city": {"slug": "${slug}", "country": "${country}", "region_slug": "${region}", "lat": 0, "lon": 0,
          "duration_type": "${duration}", "duration_hours": 0, "bandana_color": "#RRGGBB", "wiki_article": "…",
          "wiki_lang": "it", "sort_order": 1, "status": "draft"},
 "stops": [ {"stop_key": "parking-…", "stop_number": 1, "category": "parking", "optional": false, "sunset_spot": false,
          "lat": 0, "lon": 0, "time_label": "HH:MM", "visit_duration": "…", "price": null, "price_status": "confirmed|unverified",
          "opening_hours": null, "hours_status": "confirmed|unverified", "ztl": null, "year_built": null, "wiki_article": null,
          "maps_query": "Nazwa, Miasto, Italia", "verify_url": "https://…", "whatsapp": null, "website": null, "phone": null,
          "rating": null, "reviews_count": null, "reservation": null, "parking_cost": null, "sources": ["https://…"]}, … ],
 "emergency": [ {"type": "pharmacy|hospital|toilet|playground", "maps_query": "…"} ]
}
content = {
 "lang": "pl",
 "city": {"title": "…", "region_label": "<sama nazwa regionu>", "subtitle": "…", "lead": "…", "good_to_know": "…", "hero_note": null, "local_food": "…"},
 "stops": { "<stop_key>": {"name": "…", "desc_paragraphs": ["1 hak: dlaczego warto tu stanąć", "2 historia i ludzie", "3 Kim był/była…", "4 co oglądać (dokładne miejsce)", "5 Legenda mówi… / Według tradycji… (na końcu: co wiadomo historycznie)", "6 ciekawostka / popkultura / znaczenie dziś"], "kids_box": "…", "hint": "…", "local_flavor": "…",
            "practical_note": null, "dress_code": null, "photo_task": "…"}, … },
 "day_plan": { "<stop_key>": "HH:MM — co się dzieje na miejscu", … },
 "emergency": { "1": {"label": "…", "description": "…"}, … },
 "_notes": [ {"stop_key": "…", "field": "a|b|c|d|e|f|g", "note": "…"} ]
}
Wzór desc_paragraphs pokazuje szkielet zabytku (6 elementów); ulica/punkt widokowy/zdjęcie — 2 akapity, parking i lokale — 1 (patrz GŁĘBOKOŚĆ OPISU).
Kategorie: parking, monument, museum, church, synagogue, castle, viewpoint, street, house, photo, park, icecream, sweets, restaurant.
Przystanek 01 = parking. 6–11 przystanków. Restauracja (finał): ocena ≥ 4,1 i > 100 opinii, telefon i strona obowiązkowe.`;

async function main() {
  // 0) region i stan miasta
  const [reg] = await q('SELECT slug FROM public.regions WHERE slug = $1', [region]);
  if (!reg) throw new Error(`nie ma regionu ${region} w bazie`);
  await loadRules(q);
  const [live] = await q('SELECT status FROM public.cities WHERE slug = $1', [slug]);
  if (live) log(`${slug}: miasto już istnieje (${live.status}) — szkic zastąpi je dopiero po zatwierdzeniu`);
  await notify(channel, `🔎 ${name}: zbieram materiał (research), potem pisze GPT i sprawdza Claude. Dam znać tutaj.`);

  // 1) research
  let research;
  const rf = opt('--research');
  if (rf) research = readFileSync(rf, 'utf8');
  else if (existsSync(join(dir, 'research.md')) && !argv.includes('--fresh')) {
    research = readFileSync(join(dir, 'research.md'), 'utf8');
    // --enrich: uzupełnij istniejący research o narrację (500–800 słów na duży zabytek), nie zaczynaj od zera (JP 2026-10-13)
    if (argv.includes('--enrich') && !/^## NARRACJE/m.test(research)) {
      log(`${slug}: uzupełniam research o narrację (Claude + sieć)`);
      writeFileSync(join(dir, 'research.pre-enrich.md'), research);
      const add = await claude('quolino-trip-writing', `Tryb A — UZUPEŁNIENIE RESEARCHU (bez pisania wycieczki).
Miasto: ${name} (${region}, ${country}). Poniżej istniejący research (lista faktów). To za mało, żeby napisać opis rodzica bez zmyślania.
Dla KAŻDEGO dużego zabytku z researchu (monument, church, museum, castle, house, synagogue) napisz NARRACJĘ na ok. 500–800 słów — ciągły
tekst, nie wypunktowanie: kto to zbudował/założył i po co; co się tu wydarzyło (daty, osoby, wydarzenia); „kim był/była…” — bohater miejsca
wyjaśniony od podstaw; PEŁNA TREŚĆ LEGENDY z przebiegiem i zakończeniem (osobno: co wiadomo historycznie); detale do oglądania z dokładnym
miejscem; ciekawostka/popkultura/znaczenie dziś. Dla ulicy, punktu widokowego, zdjęcia i parku: ok. 200–300 słów. Fakty dopisz z Wikipedii
w języku kraju (${country === 'it' ? 'włoskiej' : 'lokalnej'}, potem angielskiej) i ze stron lokalnych/oficjalnych; KAŻDY fakt z linkiem (URL).
Nic nie zmyślaj: czego nie znajdziesz, napisz „brak w źródłach”. Zachowaj nazwy przystanków z researchu.
Wynik: Markdown zaczynający się od linii „## NARRACJE”, potem „### <nazwa przystanku>” i tekst.

ISTNIEJĄCY RESEARCH:\n${research}`, { web: true });
      research = `${research}\n\n${add.includes('## NARRACJE') ? add.slice(add.indexOf('## NARRACJE')) : '## NARRACJE\n' + add}`;
      writeFileSync(join(dir, 'research.md'), research);
    }
  }
  else {
    log(`${slug}: research (Claude + sieć)`);
    research = await claude('quolino-trip-writing', `Tryb A — etap RESEARCH (bez pisania wycieczki).
Miasto: ${name} (${region}, ${country}). Wycieczka: ${duration === 'full_day' ? 'cały dzień' : 'pół dnia'}.
Życzenia JP: ${brief || 'brak szczególnych'}.

Zbierz materiał do rodzinnej wycieczki pieszej według zasad umiejętności (proces nadrzędny, zasada turysty,
legendy, popkultura, parking 01, gastronomia z progiem 4,1/100). Dla każdego kandydata na przystanek podaj:
nazwę oryginalną, kategorię, współrzędne, godziny i ceny (z datą/źródłem albo „niepotwierdzone”),
historię, ludzi, detale do oglądania na miejscu (materiał na quest), legendy (oznaczone), popkulturę ze źródłem,
link do weryfikacji. RESEARCH TO MATERIAŁ DO OPOWIEŚCI, NIE LISTA PUNKTÓW. Przy każdym dużym zabytku (monument, church, museum, castle,
house, synagogue) napisz NARRACJĘ na ok. 500–800 słów (ciągły tekst, nie wypunktowanie): kto to zbudował/założył i po co, co się tu
wydarzyło (daty, osoby, wydarzenia), „kim był/była…” — bohater miejsca wyjaśniony od podstaw (święty, władca, artysta),
PEŁNA TREŚĆ LEGENDY z przebiegiem i zakończeniem (osobno: co wiadomo historycznie), detale do oglądania z dokładnym miejscem
(„nad drzwiami po lewej”, „w drugiej kaplicy od wejścia”), ciekawostka/popkultura/znaczenie dziś. Z tej narracji powstanie
opis rodzica (min. 4 akapity i 300 słów, zwykle 5–8). Ulica, punkt widokowy, zdjęcie, park: ok. 200–300 słów narracji.
Każdy fakt dalej ze źródłem (URL).
OBOWIĄZKOWO przy każdym zabytku (monument, church, museum, castle, house, synagogue) osobna linijka „Legendy: …”
ze źródłem (URL) — albo „Legendy: brak — sprawdzono: <gdzie szukano>”. Legendę oddziel od faktu historycznego. Fakty historyczne opieraj na Wikipedii w języku kraju (${country === 'it' ? 'włoskiej' : 'lokalnej'},
potem angielskiej) i na stronach lokalnych/oficjalnych (zabytek, gmina, diecezja, muzeum) — każdy fakt z linkiem.
Parking: koszt, ZTL, dojście. Lokale (restauracje, lody, słodycze) NIE z Wikipedii: tylko polecane przez Google —
ocena ≥ 4,1 i ponad 100 opinii; podaj ocenę, liczbę opinii, telefon, stronę.
Punkty awaryjne: apteka, toaleta, plac zabaw. Zaproponuj logikę dnia (kolejność, przerwy, finał).
Wynik: Markdown, każdy fakt ze źródłem (URL). Nic nie zmyślaj.`, { web: true });
    writeFileSync(join(dir, 'research.md'), research);
  }

  // 2) pisanie (GPT)
  log(`${slug}: pisanie szkicu (GPT)`);
  const { model, json: parsed } = await openrouterJson('quolino-trip-writing', `Tryb A — PISANIE nowej wycieczki.
Miasto: ${name}, slug "${slug}", region "${region}", kraj "${country}", ${duration === 'full_day' ? 'cały dzień' : 'pół dnia'}.
Życzenia JP: ${brief || 'brak szczególnych'}.
Pisz po polsku według WSZYSTKICH zasad umiejętności. Korzystaj wyłącznie z faktów z researchu poniżej;
każda legenda z researchu („Legendy: …”) trafia do opisu w osobnym, oznaczonym akapicie;
czego nie ma w researchu — null / unverified / notatka w _notes. Questy wynikają z detali z researchu.
OPISY RODZICA (desc_paragraphs) ZABYTKÓW I MIEJSC (monument, church, museum, castle, house, synagogue, viewpoint, street, photo, park)
w tej odpowiedzi wpisz tylko ROBOCZO (2 akapity po 2–3 zdania, hak i historia) — pełne opisy powstaną zaraz potem, osobno dla każdego
przystanku, z całego researchu. Dzięki temu masz miejsce na szkielet, questy, wskazówki, plan dnia i dane. Parking i lokale: 1 akapit docelowo.

${SKELETON}

${DEPTH_TEXT}

${rulesText()}
Odpowiedz WYŁĄCZNIE JSON-em {"meta": …, "content": …}.

RESEARCH:
${research}`, 'draft');
  let trip = parsed;
  if (!trip?.meta?.stops?.length || !trip?.content?.stops) throw new Error(`${model}: szkic bez przystanków albo w złym formacie`);
  Object.assign(trip.meta.city, { slug, region_slug: region, country, status: 'draft' });
  trip.content.lang = 'pl';
  const models = new Set([model]);

  // 2b) pełne opisy rodzica — jedno wywołanie na przystanek, z całym researchem (JP 2026-10-13)
  log(`${slug}: opisy rodzica przystanek po przystanku`);
  const d = await describeOps(trip, null);
  d.models.forEach(m => models.add(m));
  const da = applyOps(trip, d.ops);
  if (da.skipped.length) log('pominięte operacje (opisy):', da.skipped.join(' | '));
  trip = da.trip;

  // 3) kontrola + najwyżej 2 rundy poprawek
  let rv, changes = [];
  for (let round = 0; ; round++) {
    rv = await fullReview(slug, trip);
    log(`${slug}: kontrola ${round + 1}: ${verdictLine(rv)}`);
    if (rv.verdict === 'ok' || round >= 2) break;
    const fx = await fixRound(trip, null, rv.errors);
    models.add(fx.model);
    const a = applyOps(trip, fx.ops);
    if (a.skipped.length) log('pominięte operacje:', a.skipped.join(' | '));
    if (!a.changes.length) break;
    trip = a.trip; changes.push(...a.changes);
  }

  // 4) zapis
  const saved = await saveDraft(q, trip, { note: `pierwszy szkic${brief ? ': ' + brief.slice(0, 140) : ''}`, source: 'draft',
    changes: [], review: rv });
  const url = previewUrl(saved.token);
  const out = { slug, version: saved.version, stops: saved.stops, verdict: rv.verdict, errors: rv.errors, warnings: rv.warnings.length,
    summary: rv.summary, preview: url, models: [...models], cost_usd: +spent.usd.toFixed(4), fix_rounds_changes: mergeChanges(changes).length };
  writeFileSync(join(dir, 'last.json'), JSON.stringify(out, null, 2));
  await notify(channel, `📝 **${name} — szkic v${saved.version}** (${saved.stops} przystanków) · ${verdictLine(rv)}\n` +
    (rv.summary ? `${rv.summary}\n` : '') + factsLine(rv) +
    (rv.errors?.length ? `Do poprawy:\n${rv.errors.slice(0, 6).map(e => `• ${e.stop_key ?? 'miasto'}: ${e.problem}`).join('\n')}\n` : '') +
    `Podgląd: ${url}\nNapisz, co zmienić — albo „zatwierdzam”.`);
  console.log(JSON.stringify(out, null, 2));
}

try { await main(); }
catch (e) { console.error('BŁĄD:', e.message); await notify(channel, `⚠️ Szkic ${name}: ${e.message.slice(0, 500)}`); process.exitCode = 1; }
finally { await c.end(); }
