#!/usr/bin/env node
// Testy source-check (bez sieci, bez bazy): wstrzykiwany fetch (strony i API Wikipedii) i wstrzykiwane AI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { issueKind, splitFacts, anchors, snippets, codeConfirm, applyQuote, addField, locateStop, sourceCheck, makeNet } from './source-check.mjs';

const VILLA = 'https://example.org/villa';
const CAPP = 'https://example.org/cappella';
const INFI = 'https://it.wikipedia.org/wiki/Infiorata_di_Spello';
const PAGES = {
  [VILLA]: '<html><title>Villa</title><body><p>La Villa dei Mosaici di Spello fu scoperta nel luglio 2005 durante i lavori di realizzazione di un parcheggio pubblico. ' +
    'I mosaici policromi coprono dieci ambienti della villa romana, che si trova vicino alle mura della città.</p></body></html>',
  [CAPP]: '<html><title>Cappella Baglioni</title><body><p>The Baglioni Chapel in Santa Maria Maggiore was frescoed by Pinturicchio in 1500-1501. The chapel contains the artist\'s self-portrait. ' +
    'Visitors can also see the majolica floor from Deruta.</p></body></html>',
};
const WIKI = {
  'Infiorata di Spello': 'Le Infiorate di Spello sono una manifestazione che si svolge ogni anno a Spello in occasione della festa del Corpus Domini. ' +
    'Durante la notte gli infioratori realizzano tappeti e quadri floreali lungo le vie del centro storico, usando petali di fiori. La tradizione è documentata dal 1831.',
  Spello: 'Spello è un comune italiano della provincia di Perugia in Umbria. Il centro storico, costruito con la pietra del Monte Subasio, conserva mura romane e porte. ' +
    'La città è nota per le Infiorate del Corpus Domini.',
};
function fakeFetch(calls) {
  return async (url) => {
    calls.push(url);
    const u = new URL(url);
    if (/wikipedia\.org$/.test(u.hostname) && u.pathname === '/w/api.php') {
      const p = u.searchParams;
      if (p.get('list') === 'search') {
        const q = p.get('srsearch').toLowerCase();
        const hits = Object.keys(WIKI).filter(t => q.split(/\s+/).some(w => w.replace('*', '').length > 3 && t.toLowerCase().includes(w.replace('*', ''))));
        return { ok: true, json: async () => ({ query: { search: hits.map(title => ({ title })) } }) };
      }
      const t = p.get('titles'); const ex = u.hostname.startsWith('it.') ? WIKI[t] : null;
      return { ok: true, json: async () => ({ query: { pages: [ex ? { title: t, extract: ex } : { title: t, missing: true }] } }) };
    }
    if (PAGES[url]) return { ok: true, headers: { get: () => 'text/html' }, text: async () => PAGES[url] };
    return { ok: false, status: 404 };
  };
}
function trip() {
  return {
    meta: { city: { slug: 'spello', country: 'it', wiki_article: 'Spello', wiki_lang: 'it' }, stops: [
      { stop_key: 'parking', stop_number: 1, category: 'parking', sources: [] },
      { stop_key: 'villa', stop_number: 2, category: 'museum', sources: [], verify_url: VILLA },
      { stop_key: 'smm', stop_number: 3, category: 'church', sources: [] },
      { stop_key: 'borgo', stop_number: 4, category: 'street', sources: [] },
      { stop_key: 'belvedere', stop_number: 5, category: 'viewpoint', sources: [] }] },
    content: { city: { title: 'Spello', lead: 'Spello zbudowano z biało-różowego wapienia, który o zachodzie słońca świeci jak latarnia. Uliczki pną się w górę.' },
      stops: {
        villa: { name: 'Villa dei Mosaici', desc_paragraphs: ['Willę z mozaikami odkryto w 2005 roku podczas budowy parkingu. Dziś to muzeum.'] },
        smm: { name: 'Santa Maria Maggiore', desc_paragraphs: ['W kaplicy Baglioni Pinturicchio namalował swój autoportret. Freski powstały na zamówienie rodu.'] },
        borgo: { name: 'Via Borgo San Sisto', desc_paragraphs: ['Stroma uliczka.'], local_flavor: null },
        belvedere: { name: 'Belvedere', desc_paragraphs: ['Widok na dolinę. Podobno widać stąd 7 wież Asyżu w pogodny dzień.'] },
        parking: { name: 'Parking' } },
      _notes: [] },
  };
}

test('rozpoznanie uwag i rozbicie na fakty', () => {
  const w = { stop_key: 'villa', problem: 'Fakty bez źródła (2) — potrzebny link do Wikipedii albo strony lokalnej: willa odkryta w 2005 podczas budowy parkingu; dziesięć pomieszczeń z mozaikami' };
  assert.equal(issueKind(w), 'unsourced');
  assert.deepEqual(splitFacts(w), ['willa odkryta w 2005 podczas budowy parkingu', 'dziesięć pomieszczeń z mozaikami']);
  const a = { stop_key: null, problem: 'pole lokalny smaczek puste, Spello słynie z Infioraty — dodaj po potwierdzeniu w źródle' };
  assert.equal(issueKind(a), 'add');
  assert.deepEqual(splitFacts(a), ['Spello słynie z Infioraty']);
  assert.equal(addField(a), 'local_flavor');
  assert.equal(issueKind({ problem: 'Niezgodne ze źródłem (Wiki): „1500” — źródło: 1501' }), null);
  assert.equal(issueKind({ problem: 'Literówka w opisie' }), null);
  assert.deepEqual(splitFacts({ problem: 'Zdanie „Pinturicchio namalował swój autoportret w kaplicy” nie ma w źródle' }), ['Pinturicchio namalował swój autoportret w kaplicy']);
});

test('kotwice, wycinki i potwierdzenie samym kodem', () => {
  const a = anchors('Willa odkryta w 2005 roku przez Comune di Spello', { city: 'Spello' });
  assert.ok(a.strong.includes('2005'));
  assert.ok(a.strong.includes('comun') || a.strong.includes('comune'));
  assert.ok(!a.strong.some(x => x.startsWith('spell')), 'nazwa miasta nie jest kotwicą');
  assert.ok(anchors('Infioraty').strong.some(s => 'infiorata'.startsWith(s)), 'odmiana polska trafia w nazwę włoską');
  const sn = snippets('Primo. La villa fu scoperta nel 2005 dal Comune. Altro testo.', a.strong);
  assert.equal(sn[0].hits, 2);
  assert.equal(codeConfirm(a, sn), true);
  assert.equal(codeConfirm(anchors('Pinturicchio i Baglioni'), snippets('Pinturicchio dipinse la cappella Baglioni.', anchors('Pinturicchio i Baglioni').strong)), false, 'bez liczby — decyduje AI');
});

test('podmiana fragmentu: cudzysłowy, przypisy, bez długiej pauzy', () => {
  const t = { content: { stops: { x: { desc_paragraphs: ['Kościół z 1253 roku [2]. Dalej „brama” stoi.'] } } }, blocks: { x: { marked: { desc_paragraphs: ['Kościół z 1253 roku [2]. Dalej „brama” stoi.'] } } } };
  const n = applyQuote([[t.content.stops, 'x'], [t.blocks.x, 'marked']], 'Dalej "brama" stoi.', 'Dalej stoi brama — stara.');
  assert.equal(n, 2);
  assert.equal(t.content.stops.x.desc_paragraphs[0], 'Kościół z 1253 roku [2]. Dalej stoi brama - stara.');
  assert.equal(applyQuote([[t.content.stops, 'x']], 'Kościół z 1253 roku.', ''), 1, 'dopasowanie mimo przypisu [2]');
  assert.equal(t.content.stops.x.desc_paragraphs[0], 'Dalej stoi brama - stara.');
});

test('przystanek po nazwie i po treści', () => {
  const tr = trip();
  assert.equal(locateStop(tr, {}, { stop: 'Borgo San Sisto' }), 'borgo');
  assert.equal(locateStop(tr, {}, { fact: 'Pinturicchio autoportret Baglioni' }), 'smm');
  assert.equal(locateStop(tr, {}, { city: true, fact: 'x' }), null);
});

test('source-check: potwierdza kodem, przez AI, łagodzi, dodaje, porzuca, pyta JP tylko o kluczowe', async () => {
  const work = mkdtempSync(join(tmpdir(), 'sc-'));
  mkdirSync(join(work, 'sources'));
  writeFileSync(join(work, 'research-v2.md'), `### Santa Maria Maggiore\n- Pinturicchio dipinse la Cappella Baglioni — źródło: ${CAPP}\n`);
  const tr = trip(), blocks = { smm: { marked: { desc_paragraphs: ['W kaplicy Baglioni Pinturicchio namalował swój autoportret [1]. Freski powstały na zamówienie rodu.'] } } };
  const rv = { verdict: 'fix', facts: { confirmed: 3, sources: [] }, errors: [{ stop_key: 'smm', problem: 'Literówka: „kaplicy”' }], warnings: [
    { stop_key: 'villa', problem: 'Fakty bez źródła (1) — potrzebny link do Wikipedii albo strony lokalnej: willa odkryta w 2005 podczas budowy parkingu (Comune)' },
    { stop_key: 'smm', problem: 'Fakty bez źródła (1) — potrzebny link do Wikipedii albo strony lokalnej: Pinturicchio namalował w kaplicy Baglioni autoportret' },
    { stop_key: 'belvedere', problem: 'Fakty bez źródła (1) — potrzebny link do Wikipedii albo strony lokalnej: z Belvedere widać 7 wież Asyżu' },
    { stop_key: 'borgo', field: 'stop.local_flavor', problem: 'pole lokalny smaczek puste, Spello słynie z Infioraty — dodaj po potwierdzeniu w źródle' },
    { stop_key: 'villa', problem: 'pole lokalny smak puste, w willi kręcono film Gladiator — dodaj po potwierdzeniu w źródle' },
    { stop_key: 'smm', problem: 'Cytat „Pinturicchio pracował tu w latach 1490–1492” nie ma w źródle' },
  ] };
  const calls = [], prompts = [];
  const ai = async (prompt) => {
    prompts.push(prompt);
    const items = JSON.parse(prompt.slice(prompt.indexOf('POZYCJE:') + 8)).map(p => {
      const blob = JSON.stringify(p.zrodla);
      if (/autoportret/.test(p.fakt) && /self-portrait/.test(blob)) { const n = p.zrodla.findIndex(z => /self-portrait/.test(JSON.stringify(z))); return { id: p.id, potwierdza: true, zrodlo: n, cytat: "The chapel contains the artist's self-portrait." }; }
      if (/Infiora/.test(p.fakt) && /Corpus Domini/.test(blob)) { const n = p.zrodla.findIndex(z => /in occasione della festa del Corpus Domini/.test(JSON.stringify(z))); return { id: p.id, potwierdza: true, zrodlo: n, cytat: 'in occasione della festa del Corpus Domini', zdanie: 'Na Boże Ciało mieszkańcy układają na ulicach dywany z płatków kwiatów — Infioraty.' }; }
      if (/2005/.test(p.fakt) && /parcheggio/.test(blob)) { const n = p.zrodla.findIndex(z => /parcheggio/.test(JSON.stringify(z))); return { id: p.id, potwierdza: true, zrodlo: n, cytat: 'durante i lavori di realizzazione di un parcheggio pubblico' }; }
      if (/wież Asyżu/.test(p.fakt)) return { id: p.id, potwierdza: false, quote: 'Podobno widać stąd 7 wież Asyżu w pogodny dzień.', replace: '', kluczowy: false };
      if (/1490/.test(p.fakt)) return { id: p.id, potwierdza: true, zrodlo: 0, cytat: 'Pinturicchio lavorò qui dal 1490 al 1492 secondo le fonti' };   // cytatu nie ma w źródle → nie wolno potwierdzić
      if (/wapie/.test(p.fakt)) return { id: p.id, potwierdza: false, quote: 'zbudowano z biało-różowego wapienia', replace: 'zbudowano z kamienia z Monte Subasio', zrodlo: 0 };
      return { id: p.id, potwierdza: false };
    });
    return JSON.stringify({ items });
  };
  const r = await sourceCheck({ trip: tr, blocks, review: rv, workDir: work, deps: { fetch: fakeFetch(calls), ai, stopWikidata: async () => null },
    facts: [{ fact: 'biało-różowy wapień w leadzie', city: true, kind: 'soften', note: 'Źródła mówią o „Monte Subasio”.' }] });

  // willa: na stronie nie ma „Comune”, więc decyduje AI — z cytatem dosłownym ze strony verify_url
  const villa = r.review.resolved.find(x => x.stop_key === 'villa' && /2005/.test(x.problem));
  assert.equal(villa.resolved.action, 'source_added'); assert.equal(villa.resolved.url, VILLA);
  assert.ok(tr.meta.stops[1].sources.includes(VILLA));
  // autoportret: AI z cytatem dosłownym ze strony z researchu
  const smm = r.review.resolved.find(x => x.stop_key === 'smm' && /autoportret/.test(x.problem));
  assert.equal(smm.resolved.action, 'source_added'); assert.equal(smm.resolved.url, CAPP);
  assert.ok(tr.meta.stops[2].sources.includes(CAPP));
  assert.ok(tr.content._notes.some(n => n.stop_key === 'smm' && n.field === 'f' && n.note.includes(CAPP)));
  assert.ok(r.review.facts.sources.some(s => s.url === CAPP));
  // drobny fakt bez źródła → usunięty
  const bel = r.review.resolved.find(x => x.stop_key === 'belvedere');
  assert.equal(bel.resolved.action, 'removed');
  assert.equal(tr.content.stops.belvedere.desc_paragraphs[0], 'Widok na dolinę.');
  // Infiorata → zdanie w lokalnym smaku, bez długiej pauzy, ze źródłem z Wikipedii (wyszukiwanie)
  const inf = r.review.resolved.find(x => x.stop_key === 'borgo');
  assert.equal(inf.resolved.action, 'added'); assert.match(inf.resolved.url, /Infiorata/);
  assert.equal(tr.content.stops.borgo.local_flavor, 'Na Boże Ciało mieszkańcy układają na ulicach dywany z płatków kwiatów - Infioraty.');
  // Gladiator: brak źródła → propozycja porzucona, nie trafia do JP
  assert.equal(r.review.resolved.find(x => /Gladiator/.test(x.problem)).resolved.action, 'dropped');
  // zmyślony cytat AI (1490–1492) → nie potwierdzony; bez quote/replace i nie kluczowy → bez zmian, nie do JP
  assert.equal(r.review.resolved.find(x => /1490/.test(x.problem)).resolved.action, 'dropped');
  assert.ok(!tr.meta.stops[2].sources.includes('https://it.wikipedia.org/wiki/Spello'));
  // polecenie „zlagodz” → lead złagodzony
  assert.equal(tr.content.city.lead.startsWith('Spello zbudowano z kamienia z Monte Subasio'), true);
  assert.ok(r.review.resolved.some(x => x.from === 'polecenie' && x.resolved.action === 'softened'));
  // do JP: tylko błąd spoza toru (literówka) — żadnych pytań o źródła
  assert.deepEqual(r.review.warnings, []);
  assert.equal(r.review.errors.length, 1);
  assert.equal(r.stats.ai_calls, 1, 'jedno zapytanie AI na całą paczkę');
  assert.ok(!calls.some(u => /google/.test(u)));
  assert.ok(r.changes.length >= 5);
});

test('fakt kluczowy bez źródła i bez bezpiecznego złagodzenia → JP z opcjami', async () => {
  const tr = trip();
  const rv = { verdict: 'ok', errors: [], warnings: [{ stop_key: 'villa', problem: 'Fakty bez źródła (1) — potrzebny link do Wikipedii albo strony lokalnej: willa należała do cesarza' }] };
  const r = await sourceCheck({ trip: tr, review: rv, deps: { fetch: fakeFetch([]), ai: async () => '{"items":[{"id":0,"potwierdza":false,"kluczowy":true}]}' } });
  assert.equal(r.review.warnings.length, 1);
  assert.ok(r.review.warnings[0].options.length >= 2);
  assert.match(r.review.warnings[0].recommend, /Usuń/);
  assert.equal(r.stats.to_jp, 1);
});

test('AI niedostępne → nic nie potwierdza na ślepo, nic nie ginie', async () => {
  const tr = trip();
  const rv = { errors: [], warnings: [{ stop_key: 'smm', problem: 'Fakty bez źródła (1) — potrzebny link: Pinturicchio namalował autoportret w kaplicy Baglioni' }] };
  const r = await sourceCheck({ trip: tr, review: rv, deps: { fetch: fakeFetch([]), ai: async () => { throw new Error('limit'); } } });
  assert.equal(r.stats.confirmed, 0);
  assert.equal(tr.meta.stops[2].sources.length, 0);
});

test('bez uwag o źródłach: zero sieci i zero AI', async () => {
  const calls = [];
  const r = await sourceCheck({ trip: trip(), review: { errors: [{ problem: 'Plan dnia niewykonalny' }], warnings: [] }, deps: { fetch: fakeFetch(calls), ai: async () => { throw new Error('nie wolno'); } } });
  assert.equal(calls.length, 0); assert.equal(r.stats.ai_calls, 0); assert.equal(r.review.errors.length, 1);
});

test('makeNet: Wikipedia i strona przez wstrzyknięty fetch', async () => {
  const net = makeNet(fakeFetch([]));
  assert.match((await net.wiki('it', INFI)).text, /Corpus Domini/);
  assert.match((await net.page(VILLA)).text, /parcheggio pubblico/);
  assert.equal(await net.page('https://www.google.com/maps/search/?q=x'), null);
});
