/* Uwagi z kontroli → konkretne pole (JP 2026-10-30): „każda uwaga stoi przy konkretnej informacji”.
 * Jeden kod dla panelu i serwera: zwykły skrypt ustawiający globalThis.ReviewWhere (panel: <script>, Node: import './review-where.mjs').
 * KOPIA 1:1: _admin/review-where.js = _content/claude-skills/bin/review-where.mjs (pilnuje test review-where.test.mjs;
 * .mjs, bo tylko takie skrypty bin/ Hermes wdraża sam — ops/deploy.sh SAFE).
 * Bez AI i bez sieci: pole ustalane z `path`, potem z cytatu (quote/old/„…” w treści uwagi), potem z kluczowych słów faktu,
 * a na końcu z nazwy pola wspomnianej w uwadze. Polskie etykiety pól — FIELD_PL (te same, które pokazuje panel). */
(function (root, factory) {
  var api = factory();
  root.ReviewWhere = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  // ── jedna mapa: nazwa techniczna → etykieta w panelu ──
  var FIELD_PL = {
    // miasto
    title: 'Tytuł', subtitle: 'Podtytuł', lead: 'Wstęp miasta', good_to_know: 'Dobrze wiedzieć', local_food: 'Lokalne jedzenie',
    hero_note: 'Notka pod zdjęciem', region_label: 'Region (etykieta)', duration_type: 'Czas', duration_hours: 'Godziny',
    bandana_color: 'Kolor drużyny', hero_image: 'Grafika hero', route_url: 'Trasa (link)', travel_mode: 'Tryb trasy', region_slug: 'Region',
    // przystanek — tekst
    name: 'Nazwa', desc_paragraphs: 'Opis', kids_box: 'Misja dla dzieci', hint: 'Podpowiedź',
    local_flavor: 'Lokalny smaczek (tradycja, święto)', photo_task: 'Zadanie foto', practical_note: 'Informacje praktyczne', dress_code: 'Strój',
    // przystanek — bloki z przypisami
    legend: 'Legenda', curiosity: 'Ciekawostka', pop_culture: 'W popkulturze', fun_fact: 'Fun fact (dziecko)', sources: 'Źródła',
    // przystanek — dane
    category: 'Kategoria', time_label: 'Godzina', visit_duration: 'Czas zwiedzania', price: 'Cena', year_built: 'Rok', maps_query: 'Mapa',
    optional: 'Opcjonalny', sunset_spot: 'Na zachód słońca', lat: 'Szerokość geogr.', lon: 'Długość geogr.', opening_hours: 'Godziny otwarcia',
    rating: 'Ocena Google', reviews_count: 'Liczba opinii', website: 'Strona www', verify_url: 'Link do sprawdzenia', wiki_article: 'Artykuł w Wikipedii',
    day_plan: 'Plan dnia', emergency: 'Punkty awaryjne'
  };
  var CITY_TEXT = ['title', 'subtitle', 'lead', 'good_to_know', 'local_food', 'hero_note', 'region_label'];
  var CITY_META = ['duration_type', 'duration_hours', 'bandana_color', 'hero_image', 'route_url', 'travel_mode', 'region_slug'];
  var STOP_TEXT = ['name', 'desc_paragraphs', 'kids_box', 'hint', 'local_flavor', 'photo_task', 'practical_note', 'dress_code'];
  var BLOCKS = ['legend', 'curiosity', 'pop_culture', 'fun_fact'];
  var STOP_META = ['category', 'time_label', 'visit_duration', 'price', 'year_built', 'maps_query', 'opening_hours', 'optional', 'sunset_spot',
    'lat', 'lon', 'rating', 'reviews_count', 'website'];
  var LETTER = { b: 'desc_paragraphs', c: 'kids_box', d: 'hint', e: 'local_flavor', f: 'sources', plan: 'day_plan' };   // stary format „field” (SKILL.md, _notes)
  var GENERIC = { name: 1, title: 1, price: 1, category: 1, lat: 1, lon: 1, optional: 1, sources: 1, lead: 1, hint: 1, rating: 1, website: 1, emergency: 1 };

  function label(f) { return FIELD_PL[f] || f || ''; }

  // nazwy techniczne w tekście uwagi → „polska etykieta” (pełne ścieżki też: content.stops.x.local_flavor)
  var TECH = Object.keys(FIELD_PL).filter(function (k) { return k.indexOf('_') > 0 && !GENERIC[k]; }).sort(function (a, b) { return b.length - a.length; });
  var RE_PATH = /\b(?:content|meta|blocks|trip)\.[\w.\-[\]]*?([a-z]+(?:_[a-z]+)+|lead|hint|name|title|price)\b(?:\[\d+\]|\.\d+)?/g;
  var RE_TECH = new RegExp('`?\\b(' + TECH.join('|') + ')\\b`?', 'g');
  function humanize(s) {
    if (s == null) return s;
    return String(s)
      .replace(RE_PATH, function (m, f) { return FIELD_PL[f] ? '„' + FIELD_PL[f] + '”' : m; })
      .replace(RE_TECH, function (m, f) { return '„' + FIELD_PL[f] + '”'; });
  }

  // tekst bloku tak, jak pokazuje go panel (blockRows w admin.js)
  function blockText(k, v) {
    if (!v) return '';
    if (typeof v === 'string') return v;
    if (k === 'legend') return [v.text, v.trace ? 'Ślad na miejscu: ' + v.trace : '', v.history ? 'Historia: ' + v.history : ''].filter(Boolean).join('\n\n');
    if (k === 'pop_culture') return (v.items || []).map(function (i) { return [i.title, i.year].filter(Boolean).join(' (') + (i.year ? ')' : '') + ' — ' + (i.text || ''); }).join('\n\n');
    return v.text || '';
  }
  function txt(v) {
    if (v == null) return '';
    if (Array.isArray(v)) return v.map(txt).filter(Boolean).join('\n\n');
    if (typeof v === 'object') return '';
    return String(v);
  }

  // ── lista pól szkicu: { stops: [klucze w kolejności], names: {klucz: nazwa}, list: [{stop, field, path, text}] } ──
  // serwer: trip = {meta, content} (pliki *.meta.json / *.pl.json), blocks = stop_blocks_v2
  function fieldsFromTrip(trip, blocks) {
    var F = { stops: [], names: {}, list: [] }, m = (trip && trip.meta) || {}, c = (trip && trip.content) || {};
    var cc = c.city || {}, mc = m.city || {};
    CITY_TEXT.forEach(function (f) { F.list.push({ stop: null, field: f, path: 'content.city.' + f, text: txt(cc[f]) }); });
    CITY_META.forEach(function (f) { if (f in mc) F.list.push({ stop: null, field: f, path: 'meta.city.' + f, text: txt(mc[f]) }); });
    (m.stops || []).forEach(function (s) {
      var k = s.stop_key; if (!k) return;
      var pl = (c.stops || {})[k] || {};
      F.stops.push(k); F.names[k] = pl.name || k;
      STOP_TEXT.forEach(function (f) { F.list.push({ stop: k, field: f, path: 'content.stops.' + k + '.' + f, text: txt(pl[f]) }); });
      var b = blocks && blocks[k] && blocks[k].marked;
      if (b) BLOCKS.forEach(function (f) { F.list.push({ stop: k, field: f, path: 'blocks.' + k + '.' + f, text: blockText(f, b[f]) }); });
      STOP_META.forEach(function (f) { if (f in s) F.list.push({ stop: k, field: f, path: 'meta.stops.' + k + '.' + f, text: txt(s[f]) }); });
      if (c.day_plan && c.day_plan[k] != null) F.list.push({ stop: k, field: 'day_plan', path: 'content.day_plan.' + k, text: txt(c.day_plan[k]) });
    });
    return F;
  }
  // panel: content wersji (city_translations[], stops[], stop_translations[], stop_blocks_v2)
  function fieldsFromContent(content, stopKeyOf) {
    var F = { stops: [], names: {}, list: [] }, c = content || {};
    var tr = function (arr, key, id) { return (arr || []).filter(function (t) { return t.lang === 'pl' && (key == null || t[key] === id); })[0] || {}; };
    var ct = tr(c.city_translations), city = c.city || {};
    CITY_TEXT.forEach(function (f) { F.list.push({ stop: null, field: f, path: 'content.city.' + f, text: txt(ct[f]) }); });
    CITY_META.forEach(function (f) { if (f in city) F.list.push({ stop: null, field: f, path: 'meta.city.' + f, text: txt(city[f]) }); });
    (c.stops || []).slice().sort(function (a, b) { return a.stop_number - b.stop_number; }).forEach(function (s) {
      var k = stopKeyOf ? stopKeyOf(s) : s.stop_key; if (!k) return;
      var t = tr(c.stop_translations, 'stop_id', s.id);
      F.stops.push(k); F.names[k] = t.name || k;
      STOP_TEXT.forEach(function (f) { F.list.push({ stop: k, field: f, path: 'content.stops.' + k + '.' + f, text: txt(t[f]) }); });
      var b = c.stop_blocks_v2 && c.stop_blocks_v2[k] && c.stop_blocks_v2[k].marked;
      if (b) BLOCKS.forEach(function (f) { F.list.push({ stop: k, field: f, path: 'blocks.' + k + '.' + f, text: blockText(f, b[f]) }); });
      STOP_META.forEach(function (f) { if (f in s) F.list.push({ stop: k, field: f, path: 'meta.stops.' + k + '.' + f, text: txt(s[f]) }); });
      var dp = c.day_plan && !Array.isArray(c.day_plan) ? c.day_plan[k] : null;
      if (dp != null) F.list.push({ stop: k, field: 'day_plan', path: 'content.day_plan.' + k, text: txt(dp) });
    });
    return F;
  }

  // ── ścieżka → {stop, field}; przyjmuje też content.city_translations.pl.lead, meta.stops.3.x, desc_paragraphs[2], stops.<k>.fun_fact ──
  function parsePath(p, F) {
    if (!p) return null;
    var a = String(p).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
    if (a[0] === 'trip') a.shift();
    var stop = null, field = null, i;
    var si = a.indexOf('stops'), bi = a[0] === 'blocks' ? 0 : -1, di = a.indexOf('day_plan');
    if (bi === 0 && a[1]) stop = a[1];
    else if (di >= 0 && a[di + 1]) { stop = a[di + 1]; field = 'day_plan'; }
    else if (si >= 0 && a[si + 1]) {
      stop = a[si + 1];
      if (/^\d+$/.test(stop) && F) stop = F.stops[+stop] || (a[0] === 'meta' ? null : stop);   // meta.stops.<i> = kolejność trasy
    }
    if (!field) for (i = a.length - 1; i >= 0; i--) if (!/^\d+$/.test(a[i]) && a[i] !== 'marked' && a[i] !== 'text' && a[i] !== 'pl') { field = a[i]; break; }
    if (field === stop || field === 'stops' || field === 'city' || field === 'city_translations') field = null;
    return { stop: stop, field: field };
  }
  function pathOf(F, stop, field) {
    if (!field) return stop ? 'content.stops.' + stop : null;
    for (var i = 0; i < F.list.length; i++) if (F.list[i].stop === stop && F.list[i].field === field) return F.list[i].path;
    if (field === 'day_plan') return 'content.day_plan.' + stop;
    return stop ? (BLOCKS.indexOf(field) >= 0 ? 'blocks.' + stop + '.' + field : (STOP_META.indexOf(field) >= 0 ? 'meta.stops.' : 'content.stops.') + stop + '.' + field)
      : (CITY_META.indexOf(field) >= 0 ? 'meta.city.' : 'content.city.') + field;
  }

  // ── dopasowanie tekstu ──
  var PL = { 'ł': 'l', 'Ł': 'l' };
  // znormalizowany tekst + mapa: indeks znormalizowany → indeks w oryginale (do podświetlenia dokładnego fragmentu)
  function normMap(s) {
    s = String(s || '').replace(/\[\d+\]/g, function (m) { return new Array(m.length + 1).join(' '); });
    var out = '', map = [];
    for (var i = 0; i < s.length; i++) {
      var ch = PL[s[i]] || s[i].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      if (/^[a-z0-9]$/.test(ch)) { out += ch; map.push(i); }
      else if (out && out[out.length - 1] !== ' ') { out += ' '; map.push(i); }
    }
    return { t: out, m: map };
  }
  function norm(s) { return normMap(s).t.trim(); }
  var STOP = ' oraz albo jest byla bylo byly jako przez przy ktory ktora ktore ktorej ktorego tego tej ten tym tych sie jego jej ich ale lub dla pod nad bez czy tez juz nie tak jak gdzie kiedy jeszcze tylko bardzo wiec potem ze ich od do na po za w z i a o u to the and was were with from that this '.split(' ').reduce(function (o, w) { if (w) o[w] = 1; return o; }, {});
  function stems(s) {
    return norm(s).split(' ').filter(function (w) { return w.length >= 3 && !STOP[w]; }).map(function (w) { return /^\d+$/.test(w) ? w : w.slice(0, 5); });
  }
  // zdania pola (z pozycjami w oryginale)
  function sentences(text) {
    // koniec zdania: . ! ? … przed spacją i wielką literą/cyfrą/cudzysłowem albo nowa linia (skróty „p.n.e.”, „św.”, „ok. 1200” zostają w zdaniu)
    var out = [], s = String(text), start = 0, re = /([.!?…]+)(?=\s+[A-ZĄĆĘŁŃÓŚŹŻ0-9„"(])|\n+/g, m;
    var push = function (a, b) { var t = s.slice(a, b), lead = t.match(/^\s*/)[0].length; t = t.trim(); if (t.length > 3) out.push({ text: t, start: a + lead }); };
    while ((m = re.exec(s))) {
      var end = m.index + (m[1] ? m[1].length : 0);
      if (m[1] && /(\b(?:p\.n|n\.e|św|ok|r|w|ul|pl|tzw|np|m\.in|dr|ks|bł|wg|tj|godz|min|km|zob)|\b[A-ZĄĆĘŁŃÓŚŹŻ])$/.test(s.slice(start, m.index))) continue;
      push(start, end); start = end;
    }
    push(start, s.length);
    return out;
  }
  function exactIn(text, q) {
    var nq = norm(q); if (nq.length < 6) return null;
    var M = normMap(text), i = M.t.indexOf(nq);
    if (i < 0) return null;
    var a = M.m[i], b = M.m[i + nq.length - 1] + 1;
    return String(text).slice(a, b);
  }
  function order(F, stop) {   // najpierw przystanek uwagi, potem miasto, potem reszta
    return F.list.slice().sort(function (x, y) { return rank(x) - rank(y); });
    function rank(f) { return f.stop === stop ? 0 : f.stop == null ? 1 : 2; }
  }
  function findExact(F, stop, q) {
    if (!q) return null;
    var L = order(F, stop);
    for (var i = 0; i < L.length; i++) { if (!L[i].text) continue; var r = exactIn(L[i].text, q); if (r) return { f: L[i], quote: r }; }
    return null;
  }
  function findFuzzy(F, stop, claim) {
    var cs = stems(claim), uniq = {}; cs.forEach(function (w) { uniq[w] = 1; }); cs = Object.keys(uniq);
    if (cs.length < 2) return null;
    var best = null;
    F.list.forEach(function (f) {
      if (!f.text || f.text.length < 12) return;
      sentences(f.text).forEach(function (s) {
        var ws = {}; stems(s.text).forEach(function (w) { ws[w] = 1; });
        var hit = cs.filter(function (w) { return ws[w]; }).length;
        if (hit < 2) return;
        var sc = hit / cs.length + (f.stop === stop && stop ? 0.15 : 0) + (f.stop == null && !stop ? 0.05 : 0);
        if (!best || sc > best.sc) best = { sc: sc, hit: hit, f: f, quote: s.text };
      });
    });
    return best && best.hit / cs.length >= 0.5 ? { f: best.f, quote: best.quote } : null;
  }
  // nazwa pola wspomniana w uwadze (technicznie albo po polsku)
  function fieldMentioned(s) {
    var t = String(s || ''), i;
    for (i = 0; i < TECH.length; i++) if (new RegExp('\\b' + TECH[i] + '\\b').test(t)) return TECH[i];
    var m = t.match(/\b(lead|hint|subtitle|kids_box|time_label|maps_query|price)\b/); if (m) return m[1];
    var lo = t.toLowerCase(), keys = Object.keys(FIELD_PL).sort(function (a, b) { return FIELD_PL[b].length - FIELD_PL[a].length; });
    for (i = 0; i < keys.length; i++) { var l = FIELD_PL[keys[i]].toLowerCase(); if (l.length >= 5 && lo.indexOf(l) >= 0) return keys[i]; }
    if (/\bwstęp\b/i.test(t)) return 'lead';
    if (/\bmisj/i.test(t)) return 'kids_box';
    return null;
  }
  function quotedIn(s) {   // „…” i "…" w treści uwagi
    var out = [], re = /[„"“]([^”"„“]{6,300})[”"“]/g, m;
    while ((m = re.exec(String(s || '')))) out.push(m[1]);
    return out;
  }
  var CITY_ONLY = {}; CITY_TEXT.concat(CITY_META).forEach(function (f) { CITY_ONLY[f] = 1; });
  delete CITY_ONLY.title;

  // ── gdzie stoi uwaga: { stop, field, path, quote, exact, how } ──
  function locate(e, F) {
    e = e || {};
    var stop = e.stop_key || null, field = null, how = 'none';
    var pp = parsePath(e.path, F);
    if (pp) { stop = pp.stop || stop; field = pp.field; how = 'path'; }
    if (!field && e.field && FIELD_PL[e.field]) field = e.field;
    if (!field && e.field && LETTER[e.field]) field = LETTER[e.field];
    var problem = String(e.problem || ''), qs = [e.quote, e.old].filter(Boolean).concat(quotedIn(problem));
    var hit = null, i;
    // 1) cytat dosłowny — w znanym polu, potem wszędzie
    for (i = 0; i < qs.length && !hit; i++) {
      if (field) {
        var own = F.list.filter(function (f) { return f.field === field && (stop ? f.stop === stop : true); });
        for (var j = 0; j < own.length && !hit; j++) { var r = own[j].text && exactIn(own[j].text, qs[i]); if (r) hit = { f: own[j], quote: r }; }
      }
      if (!hit) hit = findExact(F, stop, qs[i]);
    }
    if (hit) return done(hit.f.stop, hit.f.field, hit.quote, true, how === 'path' ? 'path' : 'quote');
    if (field && (stop || CITY_ONLY[field])) return done(stop, field, null, false, how === 'path' ? 'path' : 'field');
    // 2) kluczowe słowa faktu (twierdzenie bywa streszczeniem, nie cytatem)
    var claim = e.claim || (qs[0] || '') || problem.replace(/^[^:]{0,80}:\s*/, '');
    var fz = findFuzzy(field ? { stops: F.stops, list: F.list.filter(function (f) { return f.field === field; }) } : F, stop, claim);
    if (fz && (!stop || fz.f.stop === stop || fz.f.stop == null)) return done(fz.f.stop, fz.f.field, fz.quote, false, 'words');
    // 3) nazwa pola w uwadze („lokalny smaczek pusty we wszystkich przystankach…”)
    field = field || fieldMentioned(problem + ' ' + (e.fix || ''));
    if (field && !stop && !CITY_ONLY[field] && F.stops.length) stop = firstStopFor(e, F, field);
    if (field) return done(stop, field, null, false, 'field');
    return done(stop, null, null, false, stop ? 'stop' : 'none');

    function done(s, f, q, exact, h) { return { stop: s || null, field: f || null, path: f || s ? pathOf(F, s || null, f) : null, quote: q || null, exact: !!exact, how: h }; }
  }
  // przystanek, którego dotyczy propozycja: nazwa w uwadze/poprawce → pierwszy przystanek z pustym polem → pierwszy przystanek
  function firstStopFor(e, F, field) {
    var t = norm([e.problem, e.fix, e['new']].filter(Boolean).join(' ')), i;
    var byName = F.stops.filter(function (k) { var n = norm(F.names[k]); return n.length >= 4 && t.indexOf(n) >= 0; });
    if (byName.length) return byName[0];
    var empty = F.stops.filter(function (k) { return F.list.some(function (f) { return f.stop === k && f.field === field && !f.text; }); });
    return empty[0] || F.stops[0] || null;
  }

  // ── uwagi zbiorcze ze starych kontroli → osobne (deterministycznie: ten sam podział w panelu i w reviseMain) ──
  var RE_AGG = /^(\[[^\]]+\]\s*)?Fakty bez źródła \((\d+)\)[^:]*:\s*([\s\S]+)$/;
  function splitAggregate(e) {
    var m = String(e && e.problem || '').match(RE_AGG);
    if (!m) return null;
    return m[3].split(/;\s+/).map(function (c) { return c.trim(); }).filter(Boolean).map(function (c, j) {
      var x = {}; for (var k in e) x[k] = e[k];
      x.problem = (m[1] || '') + 'Fakt bez źródła — potrzebny link do Wikipedii albo strony lokalnej: „' + c + '”';
      x.claim = c; x.sub = j;
      return x;
    });
  }
  // lista po rozbiciu: [{ k: 'e'|'w', i: indeks w review, j: indeks podpunktu albo null, e: uwaga }]
  function expand(rv) {
    var out = [];
    ['errors', 'warnings'].forEach(function (key) {
      ((rv && rv[key]) || []).forEach(function (e, i) {
        var parts = splitAggregate(e);
        if (parts) parts.forEach(function (x, j) { out.push({ k: key[0], i: i, j: j, e: x }); });
        else out.push({ k: key[0], i: i, j: null, e: e || {} });
      });
    });
    return out;
  }
  function itemId(x) { return 'review.' + x.k + '.' + x.i + (x.j != null ? '.' + x.j : ''); }

  // serwer: dopisuje path/quote (bez nadpisywania tego, co podał model) i rozbija stare uwagi zbiorcze
  function annotate(rv, F) {
    if (!rv) return rv;
    ['errors', 'warnings'].forEach(function (key) {
      var out = [];
      (rv[key] || []).forEach(function (e) {
        (splitAggregate(e) || [e]).forEach(function (x) {
          if (!x || typeof x !== 'object') return;
          var y = {}; for (var k in x) if (k !== 'sub') y[k] = x[k];
          if (!y.path || !y.quote) {
            var w = locate(y, F);
            if (!y.path && w.path) y.path = w.path;
            if (!y.quote && w.quote && w.exact) y.quote = w.quote;
            if (!y.stop_key && w.stop) y.stop_key = w.stop;
          }
          out.push(y);
        });
      });
      rv[key] = out;
    });
    return rv;
  }

  return { FIELD_PL: FIELD_PL, CITY_TEXT: CITY_TEXT, CITY_META: CITY_META, STOP_TEXT: STOP_TEXT, BLOCKS: BLOCKS, STOP_META: STOP_META,
    label: label, humanize: humanize, blockText: blockText, fieldsFromTrip: fieldsFromTrip, fieldsFromContent: fieldsFromContent,
    parsePath: parsePath, locate: locate, splitAggregate: splitAggregate, expand: expand, itemId: itemId, annotate: annotate, norm: norm, exactIn: exactIn };
});
