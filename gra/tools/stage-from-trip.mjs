#!/usr/bin/env node
/* Quo: Wyprawa — etap gry z opublikowanej trasy (bez zależności).
     node gra/tools/stage-from-trip.mjs <slug> [--dry]
   Czyta gra/data/<slug>.trip.json (eksport opublikowanej wersji trasy, game-export.mjs) i zapisuje gra/<slug>.json
   w schemacie jak gra/frasassi.json: stops[] w kolejności trasy (sort_order), nazwy, ikony, klucze postępu z wycieczki
   (qc.task.<stop_key>-mission / -photo — tak zapisuje city.html), teren i atrakcje gry („game”), obiekt „i18n”.
   Pytania quizu pisze człowiek — tylko z faktów z polskich tekstów trasy, ze zdaniem źródłowym w „source”.
   Ponowne uruchomienie ZACHOWUJE z istniejącego gra/<slug>.json pytania („quests”) oraz pola wymienione w „manual”
   przystanku (np. ["name", "game"]) — reszta wraca do wartości z trasy i domyślnych atrakcji. Odświeża „i18n”.
   Dopisz etap do gra/stages.json, żeby pojawił się na ekranie startowym. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GRA = join(dirname(fileURLToPath(import.meta.url)), '..');
const slug = process.argv[2], DRY = process.argv.includes('--dry');
if (!slug || !/^[a-z0-9-]+$/.test(slug)) { console.error('node gra/tools/stage-from-trip.mjs <slug> [--dry]'); process.exit(2); }
const src = join(GRA, 'data', slug + '.trip.json'), out = join(GRA, slug + '.json');
const exp = JSON.parse(readFileSync(src, 'utf8')), C = exp.content;
const old = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;

/* Ikony naklejek: jak QUE w panelu admina (_admin/admin.js); emoji przystanku może wskazać lepszą,
   a powtórki zamieniamy na zapasowe z listy (album nie ma dwóch takich samych naklejek, jeśli się da). */
const QUE = { parking: 'parking', monument: 'monument', church: 'church', museum: 'museum', house: 'house', viewpoint: 'viewpoint-city',
  'viewpoint-city': 'viewpoint-city', 'viewpoint-nature': 'viewpoint-nature', restaurant: 'restaurant', icecream: 'icecream', sweets: 'sweets',
  photo: 'photo', street: 'street', castle: 'castle', synagogue: 'synagogue' };
const EMOJI = { '🏰': 'castle', '🏯': 'castle', '🅿️': 'parking', '🍦': 'icecream', '🍨': 'icecream', '🍽️': 'restaurant', '📷': 'photo', '🕍': 'synagogue' };
const ALT = { 'viewpoint-city': ['viewpoint-nature', 'photo'], monument: ['castle', 'museum'], museum: ['monument', 'house'], street: ['house'], castle: ['monument'] };
/* Praktyczne przystanki (parking, lody, posiłek) są w grze krótkim łącznikiem bez pytań. W widoku dziecka bez komercji:
   zamiast nazwy lokalu — nazwa ogólna (oryginał zostaje w „sourceName”). */
const CONNECTOR = ['parking', 'icecream', 'sweets', 'restaurant', 'photo'];
const GENERIC = { icecream: 'Przerwa na lody', sweets: 'Przerwa na słodycze' };
const genericName = (cat, name) => GENERIC[cat] || (cat === 'restaurant' && !/^(kolacja|obiad|lunch|śniadanie)/i.test(name) ? 'Przerwa na posiłek' : null);

/* Teren gry („miasteczko na wzgórzu”, Umbria): kategoria + słowa z nazwy/opisu. Nowe tereny rysuje game.js (sekcja 4b). */
function terrainFor(st, t, i, n) {
  const txt = (t.name + ' ' + (t.desc_paragraphs || []).join(' ')).toLowerCase();
  switch (st.category) {
    case 'parking': return 'olive';
    case 'museum': return /villa|mozaik|arche|rzymsk|wykop/.test(txt) ? 'villa' : 'fresco';
    case 'church': case 'synagogue': return 'fresco';
    case 'monument': case 'castle': return 'gate';
    case 'street': return /rzym|antycz|starożyt/.test(txt) ? 'gate' : 'alley';
    case 'viewpoint': case 'viewpoint-city': case 'viewpoint-nature': return /vicol|uliczk|zaułk/.test(t.name.toLowerCase()) ? 'alley' : 'belvedere';
    case 'icecream': case 'sweets': case 'house': return 'alley';
    case 'restaurant': return i === n - 1 ? 'dusk' : 'alley';
    default: return 'alley';
  }
}
/* Domyślne atrakcje terenu. len = długość sekcji × długość przystanku z poziomu trudności (170/250/290 kafli),
   hidden = zagubione naklejki (gwiazdka), mini = mini-wyzwanie przed naklejką (miniAll = także na Łatwym). */
/* maxGates: 1 brama z pytaniami na przystanek (Łatwy/Średni 1 pytanie, Trudny 2) — przy 8 przystankach zwiedzania tyle pytań,
   ile w Frasassi (4 × 2 bramy); pytania zmieniają się przy kolejnych grach. */
const BASE = {
  olive:     { len: .2, hidden: 1, connector: true },
  villa:     { len: .75, maxGates: 1, hidden: 3, chests: 1, mosaic: true, complex: true, mini: 'trench' },
  gate:      { len: .45, maxGates: 1, hidden: 2, chests: 1 },
  fresco:    { len: .4, maxGates: 1, hidden: 2, chests: 1 },
  alley:     { len: .64, maxGates: 1, hidden: 2, chests: 1, carpet: true, climb: true, cart: true, gateAt: [.22] },
  belvedere: { len: .58, maxGates: 1, hidden: 2, chests: 1, sky: true, skyHat: 'explorer', mini: 'glide', miniAll: true },
  dusk:      { len: .2, hidden: 1, connector: true, fireflies: true }
};
const POWER = { olive: 'magnet', villa: 'doublejump', gate: 'glide', fresco: 'magnet', alley: 'doublejump', belvedere: 'balloon', dusk: 'magnet' };

const stops = C.stops.slice().sort((a, b) => a.sort_order - b.sort_order);
const tr = id => C.stop_translations.find(t => t.stop_id === id && t.lang === 'pl') || {};
const used = {}, seen = {};
const oldBy = {}; if (old) old.stops.forEach(s => { oldBy[s.qcKey] = s; });
const res = stops.map((st, i) => {
  const t = tr(st.id), cat = st.category, terr = terrainFor(st, t, i, stops.length);
  let icon = EMOJI[st.icon] || QUE[cat] || 'monument';
  if (used[icon]) for (const a of ALT[icon] || []) if (!used[a]) { icon = a; break; }
  used[icon] = 1;
  const g = { terrain: terr, ...BASE[terr] };
  const conn = CONNECTOR.includes(cat);
  if (conn) { g.connector = true; g.hidden = 1; delete g.chests; delete g.mosaic; delete g.complex; delete g.mini; delete g.carpet; delete g.climb; delete g.cart; delete g.sky; delete g.skyHat; delete g.gateAt; if (!BASE[terr].connector) g.len = .15; }
  // kolejne przystanki tego samego terenu: atrakcje tylko przy pierwszym (drugi dostaje inne mini-wyzwanie)
  seen[terr] = (seen[terr] || 0) + (conn ? 0 : 1);
  if (!conn && seen[terr] > 1) { delete g.mosaic; delete g.complex; delete g.carpet; delete g.climb; delete g.cart; delete g.gateAt; delete g.sky; delete g.skyHat; }
  if (!conn && terr === 'gate') { if (seen.gate === 1) { g.mini = 'lever'; g.miniAll = true; } else if (seen.gate === 3) { g.mini = 'tower'; } }
  if (!conn && terr === 'fresco' && seen.fresco === 2) g.mini = 'scaffold';
  if (!conn && terr === 'gate' && seen.gate === 2) g.len = .34;
  const name = genericName(cat, t.name || st.stop_key) || t.name || st.stop_key;
  const o = oldBy[st.stop_key] || {}, manual = o.manual || [];
  const stop = {
    key: String(i + 1).padStart(2, '0'),
    qcKey: st.stop_key,
    name,
    ...(name !== t.name ? { sourceName: t.name } : {}),
    category: cat,
    icon,
    missions: t.kids_box ? 1 : 0,
    photo: !!t.photo_task,
    powerup: POWER[terr] || 'magnet',
    kids: t.kids_box ? [t.kids_box] : [],
    photoTask: t.photo_task || null,
    game: g,
    quests: o.quests || []
  };
  for (const f of manual) if (f in o) stop[f] = o[f];
  if (manual.length) stop.manual = manual;
  if (conn && stop.quests.length) console.warn(`! ${st.stop_key}: łącznik nie powinien mieć pytań`);
  return stop;
});
const city = (C.city_translations || []).find(t => t.lang === 'pl') || {};
const tStop = res.find(s => s.game.sky && !s.game.connector) || res.find(s => s.game.terrain === 'olive');
const stage = {
  trip: slug,
  title: city.title || slug,
  region: (C.city && C.city.region === 'umbria') ? 'Umbria' : (city.region_label || '').split('·')[0].trim() || C.city?.region || '',
  source: `gra/data/${slug}.trip.json (wersja ${exp.version}, ${exp.status})`,
  generated: 'gra/tools/stage-from-trip.mjs — pytania i pola z „manual” są ręczne',
  progress: { legacyKey: null, note: 'Postęp z wycieczki jak w city.html: qc.task.<qcKey>-mission (misja przystanku) i qc.task.<qcKey>-photo (zadanie foto).' },
  hats: old?.hats || ['crown', 'explorer'],
  treasureStop: old?.treasureStop || (tStop ? tStop.qcKey : null),
  stops: res
};
// i18n: nazwy przystanków i pytania (klucze page.game.<slug>.s<nr>.name / <id>.q|hint|a0–a3) — źródło dla ui-translate.mjs
stage.i18nNote = 'Klucze tłumaczeń (page-i18n.js / ui_translations): generuje gra/tools/stage-from-trip.mjs z treści powyżej.';
stage.i18n = {};
res.forEach(s => { stage.i18n[`page.game.${slug}.s${s.key}.name`] = s.name; });
res.forEach(s => s.quests.forEach(q => {
  stage.i18n[`page.game.${slug}.${q.id}.q`] = q.q; stage.i18n[`page.game.${slug}.${q.id}.hint`] = q.hint;
  q.answers.forEach((a, k) => { stage.i18n[`page.game.${slug}.${q.id}.a${k}`] = a; });
}));
const txt = JSON.stringify(stage, null, 2) + '\n';
if (DRY) { process.stdout.write(txt); process.exit(0); }
writeFileSync(out, txt);
console.log(`${out}: ${res.length} przystanków, ${res.reduce((a, s) => a + s.quests.length, 0)} pytań`);
res.forEach(s => console.log(`  ${s.key} ${s.qcKey.padEnd(26)} ${s.game.terrain.padEnd(9)} ${s.icon.padEnd(16)} ${s.game.connector ? 'łącznik' : (s.game.mini || '')} q=${s.quests.length}`));
