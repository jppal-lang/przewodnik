#!/usr/bin/env node
// Testy inspektora językowego: node lang-inspect.test.mjs  (bez zależności, bez sieci, bez bazy)
import assert from 'node:assert/strict';
import { detect, analyzeSegment, inspectPage, extract, foreignPhrases, parseUiJs, planChanges, selectPages, diffFindings, nextPending, findingKey, urlLang } from './lang-inspect.mjs';

let ok = 0, fail = 0;
const t = (name, fn) => { try { fn(); ok++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n    ', e.message); } };

console.log('Detektor języka');
const P = {
  pl: 'Ruchome schody jadą przez prawdziwe podziemne miasto. Policzcie, ile odcinków minie, zanim zobaczycie niebo — to jest najlepsza część dnia dla dzieci.',
  en: 'The escalators run through a real underground city. Count how many sections you pass before you see the sky — this is the best part of the day for kids.',
  de: 'Die Rolltreppen fahren durch eine echte unterirdische Stadt. Zählt, wie viele Abschnitte ihr passiert, bevor ihr den Himmel seht — das ist für die Kinder der beste Teil des Tages.',
  fr: 'Les escaliers mécaniques traversent une vraie ville souterraine. Comptez combien de sections vous passez avant de voir le ciel — c\'est la meilleure partie de la journée pour les enfants.',
  es: 'Las escaleras mecánicas atraviesan una verdadera ciudad subterránea. Contad cuántos tramos pasáis antes de ver el cielo: es la mejor parte del día para los niños.',
  it: 'Le scale mobili attraversano una vera città sotterranea. Contate quanti tratti passate prima di vedere il cielo: è la parte più bella della giornata per i bambini.',
  pt: 'As escadas rolantes atravessam uma verdadeira cidade subterrânea. Contem quantos troços passam antes de ver o céu — é a melhor parte do dia para as crianças.',
  nl: 'De roltrappen gaan door een echte ondergrondse stad. Tel hoeveel stukken je passeert voordat je de lucht ziet — dit is voor de kinderen het leukste deel van de dag.',
  cs: 'Eskalátory jedou skutečným podzemním městem. Spočítejte, kolik úseků projedete, než uvidíte nebe — pro děti je to nejlepší část dne a také velmi zábavná.',
  sk: 'Eskalátory idú cez skutočné podzemné mesto. Spočítajte, koľko úsekov prejdete, kým uvidíte nebo — pre deti je to najlepšia časť dňa a tiež veľmi zábavná.',
  hr: 'Pokretne stepenice voze kroz pravi podzemni grad. Prebrojite koliko dionica prođete prije nego što vidite nebo — za djecu je to najbolji dio dana i vrlo je zabavno.',
  hu: 'A mozgólépcső egy igazi föld alatti városon halad át. Számoljátok meg, hány szakaszt tesztek meg, mielőtt meglátjátok az eget — a gyerekek számára ez a nap legjobb része.',
  ro: 'Scările rulante trec printr-un adevărat oraș subteran. Numărați câte tronsoane treceți înainte să vedeți cerul — pentru copii este cea mai frumoasă parte a zilei.',
  da: 'Rulletrapperne kører gennem en ægte underjordisk by. Tæl hvor mange stykker I passerer, før I ser himlen — det er den bedste del af dagen for børnene, og det er meget sjovt.',
  no: 'Rulletrappene går gjennom en ekte underjordisk by. Tell hvor mange etapper dere passerer før dere ser himmelen — det er den beste delen av dagen for barna, og det er veldig gøy.',
  sv: 'Rulltrapporna går genom en riktig underjordisk stad. Räkna hur många etapper ni passerar innan ni ser himlen — det är den bästa delen av dagen för barnen och mycket roligt.',
  uk: 'Ескалатори проходять через справжнє підземне місто. Порахуйте, скільки відрізків ви проїдете, перш ніж побачите небо — для дітей це найкраща частина дня.',
};
for (const [lang, text] of Object.entries(P)) t(`akapit ${lang} wykryty jako ${lang}`, () => assert.equal(detect(text).lang, lang, JSON.stringify(detect(text).scores)));

console.log('Fragmenty na stronie');
const flag = (text, page, extra = {}) => analyzeSegment({ text, kind: 'paragraph', ...extra }, page, {});
t('polski akapit na stronie /en/ → zgłoszony jako pl', () => { const r = flag(P.pl, 'en'); assert.ok(r); assert.equal(r.detected, 'pl'); });
t('angielski akapit na stronie /en/ → bez zgłoszenia', () => assert.equal(flag(P.en, 'en'), null));
t('niemiecki akapit na stronie /fr/ → zgłoszony jako de', () => assert.equal(flag(P.de, 'fr')?.detected, 'de'));
t('francuski akapit na stronie /es/ → zgłoszony jako fr', () => assert.equal(flag(P.fr, 'es')?.detected, 'fr'));
t('hiszpański akapit na stronie /de/ → zgłoszony jako es', () => assert.equal(flag(P.es, 'de')?.detected, 'es'));
t('każdy akapit na swojej stronie → bez zgłoszenia', () => { for (const [l, x] of Object.entries(P)) assert.equal(flag(x, l), null, l); });
t('włoskie nazwy miejsc w tekście angielskim → bez zgłoszenia', () => {
  for (const x of ['Start at Piazza IV Novembre, walk past the Fontana Maggiore and the Palazzo dei Priori to the Duomo di San Lorenzo.',
    'From the Rocca Paolina take the scale mobili up to Piazza Italia and the Corso Vannucci, where the gelato is the best in town.',
    'Palazzo dei Priori e Fontana Maggiore', 'Rocca Paolina', 'Basilica di San Francesco d\'Assisi', 'Chiesa di Santa Maria della Piazza'])
    assert.equal(flag(x, 'en'), null, x);
});
t('włoskie nazwy miejsc w tekście niemieckim → bez zgłoszenia', () =>
  assert.equal(flag('Die Kinder lieben den Brunnen auf der Piazza del Popolo, gleich neben dem Palazzo Comunale und der Chiesa di San Michele.', 'de'), null));
t('nazwa przystanku (kontekst nazwy) po włosku na /pl/ → bez zgłoszenia', () => assert.equal(analyzeSegment({ text: 'Cattedrale di San Lorenzo', kind: 'heading', name: true }, 'pl', {}), null));
t('krótki przycisk „Zaloguj się” na /en/ → zgłoszony', () => { const r = analyzeSegment({ text: 'Zaloguj się', kind: 'button' }, 'en', {}); assert.ok(r); assert.equal(r.detected, 'pl'); });
t('krótki „Nawiguj” i „Przystanek 3” na /de/ → zgłoszone', () => { assert.ok(flag('Nawiguj', 'de')); assert.ok(flag('Przystanek 3', 'de')); });
t('krótki „Wesprzyj” na /pl/ → bez zgłoszenia', () => assert.equal(flag('Wesprzyj', 'pl'), null));
t('marka „Quolino” i „Let’s Explore!” → bez zgłoszenia', () => { assert.equal(flag('Quolino', 'de'), null); assert.equal(flag("Let's Explore!", 'pl'), null); });
t('napis polskiego UI ze słownika na /it/ → ui-fallback', () => {
  const dict = { pl: { 'nav.regions': 'Wybierz region', 'label.parking': 'Parking' }, en: { 'nav.regions': 'Choose a region', 'label.parking': 'Parking' },
    it: { 'nav.regions': 'Scegli una regione', 'label.parking': 'Parcheggio' }, de: { 'label.parking': 'Parkplatz' } };
  const foreign = foreignPhrases(dict, 'it');
  assert.equal(analyzeSegment({ text: 'Wybierz region', kind: 'link' }, 'it', { foreign })?.type, 'ui-fallback');
  assert.equal(analyzeSegment({ text: 'Choose a region', kind: 'link' }, 'it', { foreign })?.detected, 'en');
  assert.equal(analyzeSegment({ text: 'Scegli una regione', kind: 'link' }, 'it', { foreign }), null);
});
t('czeski akapit na stronie /sk/ (języki bliskie) → zgłoszony jako cs', () => assert.equal(flag(P.cs, 'sk')?.detected, 'cs'));

console.log('Strona HTML');
const HTML = `<!doctype html><html lang="pl"><head><title>Perugia with kids — trip plan | Quolino</title>
<meta name="description" content="Podziemne miasto, ruchome schody i najlepsza czekolada w całej Umbrii — plan dnia dla rodziców i misje dla dzieci.">
<link rel="alternate" hreflang="en" href="https://quolino.com/en/italy/umbria/perugia-with-kids/">
<link rel="alternate" hreflang="de" href="https://quolino.com/en/italien/umbrien/perugia-mit-kindern/">
<script>var x = "Zaloguj się";</script><style>.a{}</style></head>
<body><nav><a href="/" aria-label="Zmień język">EN</a><button>Zaloguj się</button></nav>
<article class="ssr-public"><h1>Perugia</h1><ol class="ssr-stops"><li><h3>Rocca Paolina</h3><p>${P.en}</p></li>
<li><h3>Parking przy murach</h3><p>${P.pl}</p></li></ol><img src="a.webp" alt="Fontana Maggiore"></article></body></html>`;
t('extract: <html lang>, tytuł, meta, hreflang, bez skryptów', () => {
  const x = extract(HTML);
  assert.equal(x.htmlLang, 'pl'); assert.match(x.title, /Perugia with kids/); assert.equal(x.alternates.length, 2);
  assert.ok(!x.segments.some(s => s.text.includes('var x')));
  assert.ok(x.segments.some(s => s.kind === 'attr:aria-label' && s.text === 'Zmień język'));
  assert.ok(x.segments.find(s => s.text === 'Rocca Paolina').name);
});
t('inspectPage: zła <html lang>, zły i brakujący hreflang, polskie fragmenty, nazwy OK', () => {
  const url = 'https://quolino.com/en/italy/umbria/perugia-with-kids/';
  const r = inspectPage({ url, html: HTML, expected: [{ hreflang: 'en', href: url }, { hreflang: 'it', href: 'https://quolino.com/it/italia/umbria/perugia-con-bambini/' }] });
  const types = r.issues.map(i => i.type);
  assert.equal(r.lang, 'en');
  for (const x of ['html-lang-mismatch', 'hreflang-wrong', 'hreflang-missing', 'hreflang-x-default']) assert.ok(types.includes(x), x);
  assert.ok(r.issues.some(i => i.text === 'Zaloguj się'), 'przycisk');
  assert.ok(r.issues.some(i => i.text === 'Zmień język'), 'aria-label');
  assert.ok(r.issues.some(i => i.kind === 'meta:description' && i.detected === 'pl'), 'meta description');
  assert.ok(r.issues.some(i => i.type === 'segment' && i.detected === 'pl'), 'akapit pl');
  assert.ok(r.issues.some(i => i.text === 'Parking przy murach'), 'polska nazwa przystanku (polskie litery)');
  assert.ok(!r.issues.some(i => /Rocca Paolina|Fontana Maggiore|^Perugia$/.test(i.text)), 'nazwy włoskie bez zgłoszeń');
  assert.ok(!r.issues.some(i => i.kind === 'title'), 'tytuł angielski OK');
});
t('urlLang: prefiks ścieżki i ?lang=', () => { assert.equal(urlLang('https://quolino.com/de/italien/x/'), 'de'); assert.equal(urlLang('https://quolino.com/kontakt.html?lang=fr'), 'fr'); assert.equal(urlLang('https://quolino.com/'), null); });
t('parseUiJs czyta słownik z i18n-ui.js', () => {
  const js = `var KEYS = ["a.b", "c.d"];\n  var RAW = {\n  "pl": "Jeden|Dwa",\n  "en": "One|Two"\n  };\n`;
  assert.deepEqual(parseUiJs(js), { pl: { 'a.b': 'Jeden', 'c.d': 'Dwa' }, en: { 'a.b': 'One', 'c.d': 'Two' } });
});

console.log('Wykrywanie zmian (tryb --changed)');
const base = { site: { '/': 'a', '/i18n-ui.js': 'b' }, ui: { pl: 'u1', en: 'u2', de: 'u3', fr: 'u4' }, content: { 'perugia|pl': 'c1', 'perugia|de': 'c2', 'asyz|pl': 'c3' }, pages: {}, findings: {} };
t('brak stanu → pełny', () => assert.equal(planChanges(null, base).mode, 'full'));
t('nic się nie zmieniło → none (cisza)', () => assert.equal(planChanges(base, structuredClone(base)).mode, 'none'));
t('chwilowy błąd pobrania pliku strony (ERR) → nie jest zmianą', () => assert.equal(planChanges(base, { ...base, site: { '/': 'ERR', '/i18n-ui.js': 'b' } }).mode, 'none'));
t('zmiana pliku strony → pełny', () => { const p = planChanges(base, { ...base, site: { '/': 'a', '/i18n-ui.js': 'X' } }); assert.equal(p.mode, 'full'); assert.match(p.reasons[0], /i18n-ui/); });
t('zmiana UI de → częściowy, tylko język de', () => { const p = planChanges(base, { ...base, ui: { ...base.ui, de: 'NEW' } }); assert.equal(p.mode, 'partial'); assert.deepEqual(p.langs, ['de']); assert.deepEqual(p.slugs, []); });
t('zmiana UI pl (język zapasowy) → pełny', () => assert.equal(planChanges(base, { ...base, ui: { ...base.ui, pl: 'NEW' } }).mode, 'full'));
t('zmiana treści Perugii (de) i nowe miasto → częściowy: perugia + spello', () => {
  const p = planChanges(base, { ...base, content: { ...base.content, 'perugia|de': 'NEW', 'spello|pl': 'n' } });
  assert.equal(p.mode, 'partial'); assert.deepEqual(p.slugs.sort(), ['perugia', 'spello']);
});
t('selectPages: strony dotkniętego miasta we wszystkich językach + języki ze zmianą UI', () => {
  const pages = [{ url: 'u/pl/perugia', lang: 'pl' }, { url: 'u/de/perugia', lang: 'de' }, { url: 'u/fr/asyz', lang: 'fr' }, { url: 'u/de/asyz', lang: 'de' }, { url: 'u/pl/asyz', lang: 'pl' }];
  const slugOf = (u) => u.split('/').pop();
  const sel = selectPages(pages, { mode: 'partial', slugs: ['perugia'], langs: ['de'] }, slugOf).map(p => p.url);
  assert.deepEqual(sel, ['u/pl/perugia', 'u/de/perugia', 'u/de/asyz']);
  assert.equal(selectPages(pages, { mode: 'none' }, slugOf).length, 0);
  assert.equal(selectPages(pages, { mode: 'full' }, slugOf).length, 5);
});
t('diffFindings: tylko nowe i rozwiązane; niesprawdzone strony bez zmian', () => {
  const f = (url, text) => ({ url, type: 'segment', text, detected: 'pl' });
  const a = f('u1', 'stary błąd'), b = f('u1', 'nadal jest'), c = f('u2', 'inna strona');
  const prev = { [findingKey('u1', a)]: a, [findingKey('u1', b)]: b, [findingKey('u2', c)]: c };
  const n = f('u1', 'nowy błąd');
  const fresh = { [findingKey('u1', b)]: b, [findingKey('u1', n)]: n };
  const d = diffFindings(prev, fresh, new Set(['u1']));
  assert.deepEqual(d.added.map(x => x.text), ['nowy błąd']);
  assert.deepEqual(d.resolved.map(x => x.text), ['stary błąd']);
  assert.equal(Object.keys(d.open).length, 3);   // nadal jest + nowy + inna strona (niesprawdzona)
  const again = diffFindings(d.open, fresh, new Set(['u1']));
  assert.equal(again.added.length + again.resolved.length, 0, 'drugi przebieg bez zmian = brak wiadomości');
});
t('nextPending: strona bez zmiany tekstu po zmianie w bazie → ponowienie (max 2 razy)', () => {
  const plan = { mode: 'partial' };
  const pages = [{ url: 'u1', textHash: 'h1' }, { url: 'u2', textHash: 'NEW' }];
  const p1 = nextPending({}, pages, { u1: 'h1', u2: 'h2' }, plan);
  assert.deepEqual(p1, { u1: 1 });
  assert.deepEqual(nextPending(p1, pages, { u1: 'h1' }, plan), { u1: 2 });
  assert.deepEqual(nextPending({ u1: 2 }, pages, { u1: 'h1' }, plan), {});
  assert.deepEqual(planChanges({ ...base, pending: { u1: 1 } }, base).pending, ['u1']);
});

console.log(`\n${ok} OK, ${fail} błędów`);
process.exitCode = fail ? 1 : 0;
