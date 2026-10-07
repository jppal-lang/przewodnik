/* =====================================================================
   QUOLINO — atlas (mapa Europy w sekcji #regiony)
   Strona albumu z mapą: kraje to wycinanki z kartonu, Włochy (i każdy kraj
   z gotowymi miastami) w azzurro, kraje „wkrótce” zakreskowane. Quo biega
   po mapie od kraju do kraju; kliknięcie kraju przybliża mapę i Quo biega
   między jego regionami. Spis obok steruje mapą (najechanie = Quo tam biegnie).

   Dane: kształty z media/map/europe.js (Natural Earth, rzut azymutalny
   równopowierzchniowy), regiony/miasta z API. Zero zależności.
   ===================================================================== */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var ICONS = 'media/icons/';
  var POSE = { run1: 'pose-08-running', run2: 'pose-09-sprint', sit: 'pose-05-curious-sitting', joy: 'pose-13-celebration-jump', leap: 'pose-11-leaping-forward' };
  // Kraje zapowiedziane przez JP (2026-10-07). Gdy kraj dostanie miasta w bazie, sam przechodzi do „gotowych”.
  var PLANNED = ['pl', 'cz', 'fr', 'gr'];
  // Regiony zapowiedziane (klucz UI z nazwą, punkt na mapie: lon, lat)
  var PLANNED_REGIONS = [{ country: 'it', key: 'region.toskania', name: 'Toskania', at: [11.1, 43.4] }];

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function svg(tag, attrs) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function easeOut(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }
  function easeInOut(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  // ── rzut: ten sam co przy generowaniu kształtów (d3.geoAzimuthalEqualArea) ──
  function projector(E) {
    var R = Math.PI / 180, dl = E.rot[0] * R, dp = E.rot[1] * R, cdp = Math.cos(dp), sdp = Math.sin(dp);
    return function (lon, lat) {
      var l = lon * R + dl, p = lat * R;
      var x = Math.cos(p) * Math.cos(l), y = Math.cos(p) * Math.sin(l), z = Math.sin(p);
      var L = Math.atan2(y, x * cdp - z * sdp), P = Math.asin(z * cdp + x * sdp);
      var c = Math.sqrt(2 / (1 + Math.cos(L) * Math.cos(P)));
      return [E.tx + E.scale * c * Math.cos(P) * Math.sin(L), E.ty - E.scale * c * Math.sin(P)];
    };
  }

  function countryName(code, lang, trs) {
    var t = trs.filter(function (r) { return r.country_slug === code; })[0];
    if (t && t.name) return t.name;
    try { return new Intl.DisplayNames([lang, 'en'], { type: 'region' }).of(code.toUpperCase()); } catch (e) { return code.toUpperCase(); }
  }
  var EUROPE = { pl: 'Europa', en: 'Europe', fr: 'Europe', cs: 'Evropa', hu: 'Európa', sk: 'Európa', uk: 'Європа' };
  function europeName(lang) {
    var n = null;
    try { n = new Intl.DisplayNames([lang, 'en'], { type: 'region' }).of('150'); } catch (e) {}
    return n && n !== '150' ? n : (EUROPE[lang] || 'Europa');
  }

  // ════════════════════════════════════════════════════════════════
  function render(o) {
    var E = window.QUO_EUROPE, root = document.getElementById(o.mount);
    if (!root || !E) return;
    root.innerHTML = '';
    var proj = projector(E), ui = o.ui, lang = o.lang || 'pl';
    var shapes = {}; E.countries.forEach(function (c) { shapes[c.id] = c; });

    // ── model: kraje → regiony → miasta ──
    var byRegion = {};
    o.cities.forEach(function (c) { (byRegion[c.region_slug] = byRegion[c.region_slug] || []).push(c); });
    var countries = {}, order = [];
    function country(code) {
      if (!countries[code]) { countries[code] = { code: code, regions: [], plans: 0, live: false }; order.push(code); }
      return countries[code];
    }
    o.countries.slice().sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); }).forEach(function (c) { country(c.slug); });
    o.regions.slice().sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); }).forEach(function (r) {
      var cs = (byRegion[r.slug] || []).filter(function (c) { return c.lat != null && c.lon != null; });
      if (!cs.length) return;
      var lon = 0, lat = 0; cs.forEach(function (c) { lon += +c.lon; lat += +c.lat; });
      var tr = o.regionTrs.filter(function (t) { return t.region_slug === r.slug; })[0];
      var co = country(r.country_slug);
      co.live = true; co.plans += cs.length;
      co.regions.push({ slug: r.slug, name: tr && tr.name ? tr.name : r.slug, cities: cs, lon: lon / cs.length, lat: lat / cs.length,
        team: cs[0].bandana_color || '#0B4EA2', cover: cs[0] });
    });
    PLANNED.forEach(function (c) { country(c); });
    var live = order.filter(function (c) { return countries[c].live; });
    var soon = order.filter(function (c) { return !countries[c].live && shapes[c]; });
    order.forEach(function (c) { countries[c].name = countryName(c, lang, o.countryTrs); });
    PLANNED_REGIONS.forEach(function (pr) {
      var co = countries[pr.country];
      if (!co || !co.live) return;
      if (co.regions.some(function (r) { return r.name.toLowerCase() === ui(pr.key, pr.name).toLowerCase(); })) return;
      co.soonRegions = (co.soonRegions || []).concat([{ name: ui(pr.key, pr.name), lon: pr.at[0], lat: pr.at[1], soon: true }]);
    });
    // punkt kraju na mapie: środek gotowych miast, a dla „wkrótce” środek największego obszaru
    order.forEach(function (c) {
      var co = countries[c];
      if (co.live) {
        var lon = 0, lat = 0, n = 0;
        co.regions.forEach(function (r) { r.cities.forEach(function (x) { lon += +x.lon; lat += +x.lat; n++; }); });
        co.pt = proj(lon / n, lat / n);
      } else if (shapes[c] && shapes[c].a) co.pt = shapes[c].a;
    });

    // ── DOM ──
    var wrap = el('div', 'atlas');
    var map = el('div', 'atlas-map is-europe');
    map.setAttribute('role', 'group');
    map.setAttribute('aria-label', ui('home.select_region', 'Wybierz region') + ' · ' + europeName(lang));
    var s = svg('svg', { class: 'atlas-svg', viewBox: '0 0 ' + E.w + ' ' + E.h, preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true', focusable: 'false' });
    var defs = svg('defs', {});
    var hatch = svg('pattern', { id: 'atlasHatch', patternUnits: 'userSpaceOnUse', width: 7, height: 7, patternTransform: 'rotate(45)' });
    hatch.appendChild(svg('rect', { width: 7, height: 7, fill: '#FFFFFF' }));
    hatch.appendChild(svg('line', { x1: 0, y1: 0, x2: 0, y2: 7, stroke: '#B8C7DB', 'stroke-width': 2.4 }));
    defs.appendChild(hatch);
    s.appendChild(defs);
    var gLand = svg('g', { class: 'atlas-land' });
    E.countries.forEach(function (c, i) {
      var st = countries[c.id] ? (countries[c.id].live ? 'live' : 'soon') : 'off';
      var p = svg('path', { d: c.d, class: 'atlas-c atlas-c--' + st, 'data-c': c.id });
      p.style.setProperty('--i', i);
      gLand.appendChild(p);
    });
    s.appendChild(gLand);
    var gDots = svg('g', { class: 'atlas-dots' });
    var gTrail = svg('g', { class: 'atlas-trail' });
    s.appendChild(gTrail);
    s.appendChild(gDots);
    map.appendChild(s);

    var pins = el('div', 'atlas-pins');
    map.appendChild(pins);
    var quo = el('div', 'atlas-quo');
    quo.setAttribute('aria-hidden', 'true');
    var quoImg = el('img'); quoImg.alt = ''; quoImg.width = 256; quoImg.height = 256; quoImg.decoding = 'async';
    quo.appendChild(el('span', 'atlas-quo__shadow'));
    quo.appendChild(quoImg);
    map.appendChild(quo);

    var callout = el('a', 'atlas-callout');
    callout.hidden = true;
    map.appendChild(callout);
    function showCallout(st) {
      if (!st || !st.cap) { callout.hidden = true; return; }
      callout.hidden = false;
      callout.className = 'atlas-callout' + (st.live ? '' : ' is-soon');
      if (st.href) callout.setAttribute('href', st.href); else callout.removeAttribute('href');
      if (st.team) callout.style.setProperty('--team', st.team);
      callout.innerHTML = '<span class="atlas-pin__no">' + pad(st.no) + '</span><span class="atlas-callout__txt"><span class="atlas-callout__name">' + esc(st.label) + '</span>' +
        '<span class="atlas-callout__meta">' + esc(st.meta || '') + '</span></span>' +
        (st.live ? '<span class="atlas-callout__go">' + esc(ui('home.cta_open', 'Zaczynamy!')) + ' <span aria-hidden="true">&rarr;</span></span>' : '');
      callout.classList.remove('is-swap'); void callout.offsetWidth; callout.classList.add('is-swap');
    }
    var bar = el('div', 'atlas-bar');
    var back = el('button', 'atlas-back');
    back.type = 'button';
    back.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg><span>' + esc(europeName(lang)) + '</span>';
    back.hidden = true;
    var title = el('p', 'atlas-title');
    var pause = el('button', 'atlas-pause');
    pause.type = 'button';
    pause.innerHTML = '<svg class="i-pause" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>' +
      '<svg class="i-play" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
    bar.appendChild(back); bar.appendChild(title); bar.appendChild(pause);
    map.appendChild(bar);

    var index = el('div', 'atlas-index');
    wrap.appendChild(map);
    wrap.appendChild(index);
    root.appendChild(wrap);

    // ── spis obok mapy ──
    var no = 0;
    live.forEach(function (code) {
      var co = countries[code];
      var box = el('section', 'atlas-country');
      box.setAttribute('aria-label', co.name);
      box.innerHTML = '<div class="atlas-country__head"><h3>' + esc(co.name) + '</h3>' +
        '<a href="country.html?k=' + encodeURIComponent(code) + '"><span>' + esc(ui('home.country_all', 'Zobacz cały kraj')) + '</span><span aria-hidden="true">&rarr;</span></a></div>';
      var ol = el('ol', 'atlas-regions');
      co.regions.forEach(function (r) {
        r.no = ++no;
        var li = el('li');
        var a = el('a', 'atlas-region');
        a.href = 'region.html?r=' + encodeURIComponent(r.slug);
        a.setAttribute('data-region', r.slug);
        a.style.setProperty('--team', r.team);
        var base = o.imgBase(r.cover);
        a.innerHTML = '<span class="atlas-region__no">' + pad(r.no) + '</span>' +
          '<span class="atlas-region__art" data-l="' + esc(r.name.charAt(0)) + '">' + (base ? '<img src="' + base + '-tile-384.webp" alt="" width="384" height="384" loading="lazy" decoding="async">' : '') + '</span>' +
          '<span class="atlas-region__txt"><span class="atlas-region__name">' + esc(r.name) + '</span>' +
          '<span class="atlas-region__meta">' + r.cities.length + ' ' + esc(ui('home.region_ready', 'gotowe plany')) + '</span></span>' +
          '<svg class="atlas-region__go" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
        var img = a.querySelector('img');
        if (img) img.onerror = function () { img.remove(); };
        r.link = a;
        li.appendChild(a); ol.appendChild(li);
      });
      (co.soonRegions || []).forEach(function (r) {
        var li = el('li', 'atlas-region atlas-region--soon');
        li.innerHTML = '<span class="atlas-region__no">' + pad(no + 1) + '</span><span class="atlas-region__art"></span>' +
          '<span class="atlas-region__txt"><span class="atlas-region__name">' + esc(r.name) + '</span><span class="atlas-region__meta">' + esc(ui('chip.soon', 'Wkrótce')) + '</span></span>';
        ol.appendChild(li);
      });
      box.appendChild(ol);
      index.appendChild(box);
    });
    if (soon.length) {
      var sb = el('section', 'atlas-soon');
      sb.innerHTML = '<h3>' + esc(ui('chip.soon', 'Wkrótce')) + '</h3><ul>' + soon.map(function (c) {
        return '<li data-country="' + c + '">' + esc(countries[c].name) + '</li>';
      }).join('') + '</ul>';
      index.appendChild(sb);
    }

    // ════════ stan mapy ════════
    var vb = { x: 0, y: 0, w: E.w, h: E.h };
    var level = 'europe', current = null;   // current = kod kraju w przybliżeniu
    var stops = [];                          // { pt, pin, live, label, region? , country? }
    var quoState = { at: null, idx: 0, pos: null, raf: 0, timer: 0, running: !reduce, visible: false, onscreen: false };

    function toPct(pt) { return [((pt[0] - vb.x) / vb.w) * 100, ((pt[1] - vb.y) / vb.h) * 100]; }
    function setVB(v) {
      vb = v;
      s.setAttribute('viewBox', v.x.toFixed(2) + ' ' + v.y.toFixed(2) + ' ' + v.w.toFixed(2) + ' ' + v.h.toFixed(2));
      map.style.setProperty('--k', (v.w / E.w).toFixed(4));
      placePins();
      if (quoState.pos) placeQuo(quoState.pos);
    }
    // svg zawsze ma proporcje okna mapy (slice), więc dopasowujemy pole widzenia do proporcji ramki
    function frameAspect() { var r = map.getBoundingClientRect(); return r.width && r.height ? r.height / r.width : E.h / E.w; }
    function fit(box, padFrac, minW) {
      var asp = frameAspect();
      var w = Math.max((box[2] - box[0]) * (1 + padFrac), minW || 0), h = (box[3] - box[1]) * (1 + padFrac);
      var cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
      if (h / w > asp) w = h / asp; else h = w * asp;
      return { x: cx - w / 2, y: cy - h / 2, w: w, h: h };
    }
    function europeVB() { return fit([0, 0, E.w, E.h], 0, 0); }
    function countryVB(code) { return fit(countryBox(code), 1.1, E.w * (map.clientWidth < 560 ? 0.11 : 0.14)); }

    // ── piny ──
    function pin(stop) {
      var p;
      if (stop.href) { p = el('a', 'atlas-pin'); p.href = stop.href; }
      else if (stop.action) { p = el('button', 'atlas-pin'); p.type = 'button'; }
      else { p = el('div', 'atlas-pin'); }
      p.className += (stop.live ? ' is-live' : ' is-soon') + (stop.cap ? ' is-cap' : '');
      if (stop.team) p.style.setProperty('--team', stop.team);
      p.innerHTML = '<span class="atlas-pin__dot"></span><span class="atlas-pin__tag">' +
        (stop.no ? '<span class="atlas-pin__no">' + pad(stop.no) + '</span>' : '') +
        '<span class="atlas-pin__txt"><span class="atlas-pin__name">' + esc(stop.label) + '</span>' +
        (stop.meta ? '<span class="atlas-pin__meta">' + esc(stop.meta) + '</span>' : '') + '</span></span>';
      if (stop.cap) {
        p.innerHTML = '<span class="atlas-pin__tag"><span class="atlas-pin__no">' + pad(stop.no) + '</span></span>';
        p.setAttribute('aria-label', stop.label + (stop.meta ? ' · ' + stop.meta : ''));
        if (stop.live) p.title = stop.label;
      } else if (!stop.live) p.setAttribute('aria-label', stop.label + ' · ' + ui('chip.soon', 'Wkrótce'));
      if (stop.action) p.addEventListener('click', stop.action);
      p.addEventListener('mouseenter', function () { goTo(stop); });
      p.addEventListener('focus', function () { goTo(stop); });
      stop.pin = p;
      pins.appendChild(p);
    }
    function placePins() {
      var rect = map.getBoundingClientRect();
      stops.forEach(function (st) {
        var q = toPct(st.pt);
        st.pin.style.left = q[0] + '%';
        st.pin.style.top = q[1] + '%';
        st.px = [q[0] / 100 * rect.width, q[1] / 100 * rect.height];
      });
      // etykieta po lewej, gdy po prawej stoi sąsiad albo brakuje miejsca (szerokości mierzone)
      stops.forEach(function (st) { st.tw = st.cap ? 0 : st.pin.lastChild.offsetWidth + 30; });
      stops.forEach(function (st) {
        if (st.cap) return;
        var clash = st.px[0] + st.tw > rect.width - 8 || stops.some(function (o) {
          return o !== st && o.px[0] >= st.px[0] && o.px[0] - st.px[0] < st.tw && Math.abs(o.px[1] - st.px[1]) < 50;
        });
        st.pin.classList.toggle('is-flip', clash && st.px[0] - st.tw > 8);
      });
    }

    function buildEurope() {
      pins.innerHTML = ''; gDots.innerHTML = ''; clearTrail(); showCallout(null);
      stops = [];
      live.forEach(function (c) {
        var co = countries[c];
        stops.push({ pt: co.pt, live: true, label: co.name, meta: co.plans + ' ' + ui('home.region_ready', 'gotowe plany'), country: c,
          action: function (e) { e.preventDefault(); zoomTo(c); } });
      });
      soon.forEach(function (c) { stops.push({ pt: countries[c].pt, live: false, label: countries[c].name, meta: ui('chip.soon', 'Wkrótce'), country: c }); });
      stops = tour(stops);
      stops.forEach(pin);
      title.textContent = '';
      back.hidden = true;
      map.classList.add('is-europe'); map.classList.remove('is-country');
      Array.prototype.forEach.call(gLand.children, function (p) { p.classList.remove('is-focus'); });
    }
    function buildCountry(code) {
      var co = countries[code];
      pins.innerHTML = ''; gDots.innerHTML = ''; clearTrail();
      stops = [];
      co.regions.forEach(function (r) {
        stops.push({ pt: proj(r.lon, r.lat), live: true, cap: true, no: r.no, label: r.name, meta: r.cities.length + ' ' + ui('home.region_ready', 'gotowe plany'),
          href: 'region.html?r=' + encodeURIComponent(r.slug), region: r.slug, team: r.team });
        r.cities.forEach(function (c) {
          var p = proj(+c.lon, +c.lat);
          gDots.appendChild(svg('circle', { cx: p[0], cy: p[1], r: (4.5 * countryVB(code).w / Math.max(1, map.clientWidth)).toFixed(2), class: 'atlas-city' }));
        });
      });
      var sn = co.regions.length ? co.regions[co.regions.length - 1].no : 0;
      (co.soonRegions || []).forEach(function (r) { stops.push({ pt: proj(r.lon, r.lat), live: false, cap: true, no: ++sn, label: r.name, meta: ui('chip.soon', 'Wkrótce') }); });
      stops.forEach(pin);
      title.textContent = co.name;
      back.hidden = false;
      map.classList.remove('is-europe'); map.classList.add('is-country');
      Array.prototype.forEach.call(gLand.children, function (p) { p.classList.toggle('is-focus', p.getAttribute('data-c') === code); });
    }
    // trasa Quo: od pierwszego gotowego punktu do najbliższego nieodwiedzonego
    function tour(list) {
      if (list.length < 3) return list;
      var left = list.slice(1), out = [list[0]];
      while (left.length) {
        var last = out[out.length - 1], best = 0, bd = Infinity;
        left.forEach(function (st, i) { var d = Math.hypot(st.pt[0] - last.pt[0], st.pt[1] - last.pt[1]); if (d < bd) { bd = d; best = i; } });
        out.push(left.splice(best, 1)[0]);
      }
      return out;
    }
    function countryBox(code) {
      var co = countries[code], xs = [], ys = [];
      co.regions.forEach(function (r) { var p = proj(r.lon, r.lat); xs.push(p[0]); ys.push(p[1]); });
      (co.soonRegions || []).forEach(function (r) { var p = proj(r.lon, r.lat); xs.push(p[0]); ys.push(p[1]); });
      return [Math.min.apply(0, xs), Math.min.apply(0, ys), Math.max.apply(0, xs), Math.max.apply(0, ys)];
    }

    // ── przybliżanie ──
    var zoomRaf = 0;
    function animateVB(to, ms, done) {
      cancelAnimationFrame(zoomRaf);
      var from = { x: vb.x, y: vb.y, w: vb.w, h: vb.h }, t0 = performance.now();
      if (reduce || !ms) { setVB(to); if (done) done(); return; }
      map.classList.add('is-zooming');
      (function step(now) {
        var t = Math.min(1, (now - t0) / ms), e = easeInOut(t);
        // przybliżenie w skali logarytmicznej — bez „pompowania” w połowie
        var w = Math.exp(Math.log(from.w) + (Math.log(to.w) - Math.log(from.w)) * e);
        var k = (w - from.w) / ((to.w - from.w) || 1);
        if (!isFinite(k)) k = e;
        setVB({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, w: w, h: w * (to.h / to.w) });
        if (t < 1) zoomRaf = requestAnimationFrame(step);
        else { map.classList.remove('is-zooming'); if (done) done(); }
      })(t0);
    }
    function zoomTo(code) {
      if (level === 'country' && current === code) return;
      stopQuo();
      hideQuo();
      level = 'country'; current = code;
      pins.classList.add('is-hidden');
      var box = countryBox(code);
      animateVB(countryVB(code), 1400, function () {
        buildCountry(code);
        placePins();
        pins.classList.remove('is-hidden');
        startQuo(0, true);
        if (pendingRegion) { var r = pendingRegion; pendingRegion = null; goTo(stopBy('region', r)); }
      });
    }
    function zoomOut() {
      if (level === 'europe') return;
      stopQuo(); hideQuo(); showCallout(null);
      level = 'europe'; current = null;
      pins.classList.add('is-hidden');
      animateVB(europeVB(), 1100, function () {
        buildEurope(); placePins();
        pins.classList.remove('is-hidden');
        startQuo(0, true);
      });
    }
    back.addEventListener('click', zoomOut);

    // ════════ Quo ════════
    var frames = {};
    Object.keys(POSE).forEach(function (k) { var i = new Image(); i.decoding = 'async'; i.src = ICONS + POSE[k] + '-256.webp'; frames[k] = i.src; });
    function setPose(k) { if (quoImg.getAttribute('src') !== frames[k]) quoImg.src = frames[k]; quo.setAttribute('data-pose', k); }
    function placeQuo(pt, bob, face) {
      quoState.pos = pt;
      var q = toPct(pt);
      quo.style.left = q[0] + '%';
      quo.style.top = q[1] + '%';
      quo.style.setProperty('--bob', (bob || 0).toFixed(2) + 'px');
      if (face != null) quo.style.setProperty('--face', face);
    }
    function hideQuo() { quo.classList.remove('is-on'); quoState.visible = false; }
    function showQuo() { quo.classList.add('is-on'); quoState.visible = true; }
    function stopQuo() { cancelAnimationFrame(quoState.raf); clearTimeout(quoState.timer); quoState.leg = null; }

    function startQuo(i, entrance) {
      if (!stops.length) return;
      quoState.idx = i;
      var st = stops[i];
      placeQuo(standPt(st), 0, 1);
      setPose(entrance && !reduce ? 'joy' : 'sit');
      showQuo();
      arrive(st, entrance);
    }
    function arrive(st, entrance) {
      stops.forEach(function (x) { x.pin.classList.toggle('is-here', x === st); });
      quoState.at = st;
      showCallout(st);
      if (!reduce) setPose(st.live ? 'joy' : 'sit');
      clearTimeout(quoState.timer);
      quoState.timer = setTimeout(function () {
        setPose('sit');
        quoState.timer = setTimeout(next, st.live ? 1700 : 1100);
      }, st.live && !reduce ? 650 : 0);
    }
    function next() {
      if (!quoState.running || !quoState.onscreen || stops.length < 2) return;
      var i = (stops.indexOf(quoState.at) + 1) % stops.length;
      walk(stops[i]);
    }
    function goTo(st) {
      if (!st || st === quoState.at || (quoState.leg && quoState.leg.to === st)) return;
      if (reduce) { placeQuo(standPt(st), 0, 1); arrive(st); return; }
      walk(st, true);
    }
    function standPt(st) {
      var rect = map.getBoundingClientRect(), ppu = rect.width / vb.w;
      var qw = quo.offsetWidth || 80;
      var side = st.cap ? (st.px && st.px[0] < qw * 1.2 ? 1 : -1) : (st.pin.classList.contains('is-flip') ? 1 : -1);
      var off = (qw * 0.36 + (st.cap ? 26 : 4)) / ppu;
      return [st.pt[0] + side * off, st.pt[1] + (st.cap ? 14 / ppu : 0)];
    }
    function stopBy(key, val) { return stops.filter(function (x) { return x[key] === val; })[0]; }

    // jeden odcinek marszu: łuk (krzywa kwadratowa) z punktu, w którym Quo stoi, do celu
    var arcSign = 1;
    function walk(to, eager) {
      stopQuo();
      var b = standPt(to), a = quoState.pos || b;
      var dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
      arcSign = -arcSign;
      var bend = Math.min(0.22 * d, vb.w * 0.12) * arcSign;
      var c = [(a[0] + b[0]) / 2 - dy / d * bend, (a[1] + b[1]) / 2 + dx / d * bend];
      var rect = map.getBoundingClientRect();
      var screen = d / vb.w * rect.width;
      var ms = Math.max(eager ? 650 : 1300, Math.min(eager ? 1400 : 3400, screen * (eager ? 5 : 11)));
      var trail = startTrail(a);
      var t0 = performance.now(), lastFrame = 0, frameOn = false;
      quoState.leg = { to: to };
      stops.forEach(function (x) { x.pin.classList.remove('is-here'); });
      setPose('run1');
      (function step(now) {
        var t = Math.min(1, (now - t0) / ms), e = t < 1 ? easeInOut(t) : 1;
        var u = 1 - e;
        var p = [u * u * a[0] + 2 * u * e * c[0] + e * e * b[0], u * u * a[1] + 2 * u * e * c[1] + e * e * b[1]];
        var tx = 2 * u * (c[0] - a[0]) + 2 * e * (b[0] - c[0]);
        if (now - lastFrame > 125) { frameOn = !frameOn; lastFrame = now; setPose(frameOn ? 'run2' : 'run1'); }
        var bob = -Math.abs(Math.sin(t * Math.PI * Math.max(3, Math.round(ms / 260)))) * 7;
        placeQuo(p, t < 1 ? bob : 0, tx > 0 ? -1 : 1);
        trail.add(p);
        if (t < 1) quoState.raf = requestAnimationFrame(step);
        else { quoState.leg = null; trail.done(); arrive(to); }
      })(t0);
    }

    // ── ślad: przerywana linia rysowana za Quo, starsze odcinki bledną ──
    function clearTrail() { gTrail.innerHTML = ''; }
    function startTrail(from) {
      var olds = gTrail.querySelectorAll('path');
      for (var i = 0; i < olds.length - 1; i++) olds[i].remove();
      if (olds.length) olds[olds.length - 1].classList.add('is-old');
      var k = vb.w / Math.max(1, map.clientWidth);
      var p = svg('path', { class: 'atlas-step', d: 'M' + from[0].toFixed(1) + ' ' + from[1].toFixed(1) });
      p.style.strokeWidth = (3 * k).toFixed(3);
      p.style.strokeDasharray = (2 * k).toFixed(3) + ' ' + (9 * k).toFixed(3);
      gTrail.appendChild(p);
      var pts = [from], minStep = 3 * k;
      return {
        add: function (pt) {
          var l = pts[pts.length - 1];
          if (Math.hypot(pt[0] - l[0], pt[1] - l[1]) < minStep) return;
          pts.push(pt);
          p.setAttribute('d', 'M' + pts.map(function (q) { return q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join('L'));
        },
        done: function () {}
      };
    }

    // ── spis steruje mapą ──
    var pendingRegion = null;
    live.forEach(function (code) {
      countries[code].regions.forEach(function (r) {
        function go() {
          if (level !== 'country' || current !== code) { pendingRegion = r.slug; zoomTo(code); }
          else goTo(stopBy('region', r.slug));
        }
        r.link.addEventListener('mouseenter', go);
        r.link.addEventListener('focus', go);
      });
    });
    index.querySelectorAll('.atlas-soon li').forEach(function (li) {
      li.addEventListener('mouseenter', function () {
        var c = li.getAttribute('data-country');
        if (level !== 'europe') return;
        goTo(stopBy('country', c));
      });
    });

    // ── pauza (WCAG 2.2.2) i oszczędzanie, gdy mapa poza ekranem ──
    function syncPause() {
      var on = quoState.running;
      pause.setAttribute('aria-pressed', String(!on));
      pause.setAttribute('aria-label', on ? (ui('video.pause', 'Zatrzymaj animację')) : (ui('video.play', 'Odtwórz animację')));
      pause.classList.toggle('is-paused', !on);
    }
    pause.addEventListener('click', function () {
      quoState.running = !quoState.running;
      syncPause();
      if (quoState.running && !quoState.leg) next();
    });
    if (reduce) pause.hidden = true;
    syncPause();

    var started = false;
    function intro() {
      if (started) return; started = true;
      map.classList.add('is-in');
      setTimeout(function () { startQuo(0, true); }, reduce ? 0 : 900);
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          quoState.onscreen = e.isIntersecting;
          if (e.isIntersecting) { intro(); if (quoState.running && !quoState.leg && quoState.at) { clearTimeout(quoState.timer); quoState.timer = setTimeout(next, 600); } }
        });
      }, { threshold: 0.25 }).observe(map);
    } else { quoState.onscreen = true; intro(); }
    document.addEventListener('visibilitychange', function () { if (document.hidden) stopQuo(); else if (quoState.at) arrive(quoState.at); });

    // ── start ──
    setVB(europeVB());
    buildEurope();
    placePins();
    var rz = 0;
    window.addEventListener('resize', function () {
      cancelAnimationFrame(rz);
      rz = requestAnimationFrame(function () {
        if (map.classList.contains('is-zooming')) return;
        setVB(level === 'europe' ? europeVB() : countryVB(current));
      });
    });
  }

  window.QuoAtlas = { render: render };
})();
