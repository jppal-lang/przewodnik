/* Quolino admin — mapa projektu (#/mapa) i „Mapa przystanków” w widoku trasy, JP 2026-10-31.
 *
 * Mapa projektu: Europa z media/map/europe.js (te same kształty co atlas.js na landingu, ten sam rzut azymutalny
 * równopowierzchniowy), w spokojnej kolorystyce narzędzia: szare lądy, białe tło. Pinezka każdej trasy w kolorze etapu
 * (opublikowana / do akceptacji / w pracy / odrzucona), podpis miasta, klaster gdy blisko, najechanie → karta, klik → trasa.
 * Filtry po etapie i kraju, legenda, zoom/pan myszą i dotykiem (transformacja <g>, bez bibliotek), +/−, „dopasuj”.
 * Współrzędne miasta: content.city.lat/lon najnowszej wersji (admin.admin_versions, lekki select), a gdy ich brak — środek
 * przystanków z lat/lon; gdy brak w ogóle — trasa trafia do listy „bez współrzędnych” (bez zgadywania).
 * „Dodaj miasto, klikając w mapę”: panel nie ma RPC ani formularza nowej trasy → klik w pustą mapę pokazuje tylko
 * współrzędne i podpowiedź (wątek na Discordzie: kategoria = kraj, forum = region, wątek = miasto). Zero zapisu.
 *
 * Mapa przystanków (widok trasy, hak w admin.js po drawMap): przystanki w kolejności, linia między nimi, numeracja,
 * ikona kategorii z media/icons, parking jako kwadrat, lokale jako romb; klik → karta przystanku z linkiem do pola.
 * Bez czasów dojazdu i km (twarda zasada). Podkład bez kafli: białe tło z siatką; „Otwórz w Google Maps” dla całej trasy.
 * Przystanki bez współrzędnych: schemat kolejności (równe odstępy) z wyraźną informacją — nic nie jest zgadywane.
 *
 * Plik ładuje się PRZED admin.js; z admin.js korzysta przez window.AdminHost przy wywołaniu.
 */
(function () {
  'use strict';

  var H = function () { return window.AdminHost; };
  var NS = 'http://www.w3.org/2000/svg';
  var STAGE = { published: 'opublikowana', draft: 'do akceptacji', work: 'w pracy', rejected: 'odrzucona · archiwum', unknown: 'bez współrzędnych' };
  var STAGE_ORDER = ['work', 'draft', 'published', 'rejected'];
  var FILT_KEY = 'adm.mapFilters';   // tylko wygoda: zapamiętane filtry etapu/kraju
  // dane testowe: demo.json ma współrzędne tylko dla Spello (klony miast dziedziczą je), więc w trybie demo nadpisujemy
  var DEMO_CITY = { spello: [42.9917, 12.6706], assisi: [43.0707, 12.6196], urbino: [43.7262, 12.6365], ancona: [43.6158, 13.5189], krakow: [50.0647, 19.945], wieliczka: [49.9871, 20.0646], rovinj: [45.0811, 13.6387], zakopane: null };
  var DEMO_STOPS = { 'parking-villa-dei-mosaici': [42.9868, 12.6665], 'villa-dei-mosaici': [42.9872, 12.6672], 'porta-consolare': [42.9899, 12.6694], 'santa-maria-maggiore': [42.9917, 12.6706], 'belvedere-panoramico': [42.9958, 12.6724], kolacja: [42.9930, 12.6712] };
  var M = { data: null, pz: null, sel: null, hoverCard: null };

  window.AdminExt = window.AdminExt || { routes: {} };
  window.AdminExt.routes['#/mapa'] = openMap;

  function esc(s) { return H().esc(s); }
  function svg(tag, attrs) { var e = document.createElementNS(NS, tag); for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]); return e; }
  function fin(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* prywatne okno */ } }

  // ── rzut jak w atlas.js (d3.geoAzimuthalEqualArea) + odwrotność (klik w mapę → lon/lat) ──
  function projector(E) {
    var R = Math.PI / 180, dl = E.rot[0] * R, dp = E.rot[1] * R, cdp = Math.cos(dp), sdp = Math.sin(dp);
    var f = function (lon, lat) {
      var l = lon * R + dl, p = lat * R;
      var x = Math.cos(p) * Math.cos(l), y = Math.cos(p) * Math.sin(l), z = Math.sin(p);
      var L = Math.atan2(y, x * cdp - z * sdp), P = Math.asin(z * cdp + x * sdp);
      var c = Math.sqrt(2 / (1 + Math.cos(L) * Math.cos(P)));
      return [E.tx + E.scale * c * Math.cos(P) * Math.sin(L), E.ty - E.scale * c * Math.sin(P)];
    };
    f.invert = function (px, py) {
      var x = (px - E.tx) / E.scale, y = (E.ty - py) / E.scale, rho = Math.sqrt(x * x + y * y);
      if (rho > 2) return null;
      var cc = 2 * Math.asin(rho / 2), L = rho ? Math.atan2(x * Math.sin(cc), rho * Math.cos(cc)) : 0, P = rho ? Math.asin(y * Math.sin(cc) / rho) : 0;
      var X = Math.cos(P) * Math.cos(L), Y = Math.cos(P) * Math.sin(L), Z = Math.sin(P);
      var x1 = X * cdp + Z * sdp, z1 = Z * cdp - X * sdp;
      return [((Math.atan2(Y, x1) - dl) / R + 540) % 360 - 180, Math.asin(z1) / R];
    };
    return f;
  }

  // ── zoom/pan: jedna transformacja <g>, kółko (z Ctrl) / przyciski / przeciąganie / szczypanie ──
  function panzoom(el, g, o) {
    var Z = { k: 1, x: 0, y: 0, min: o.min || 0.5, max: o.max || 40, w: o.w, h: o.h, ptrs: {}, drag: null, moved: false, pinch: null };
    function apply() { g.setAttribute('transform', 'translate(' + Z.x.toFixed(2) + ',' + Z.y.toFixed(2) + ') scale(' + Z.k.toFixed(4) + ')'); if (o.onChange) o.onChange(Z); }
    function pt(e) { var r = el.getBoundingClientRect(); return [(e.clientX - r.left) * Z.w / r.width, (e.clientY - r.top) * Z.h / r.height]; }
    function zoomAt(f, px, py) { var k2 = Math.min(Z.max, Math.max(Z.min, Z.k * f)); f = k2 / Z.k; Z.x = px - (px - Z.x) * f; Z.y = py - (py - Z.y) * f; Z.k = k2; apply(); }
    Z.fit = function (bb, pad) {
      pad = pad == null ? 40 : pad;
      if (!bb || !(bb[2] > bb[0]) || !(bb[3] > bb[1])) { Z.k = 1; Z.x = 0; Z.y = 0; apply(); return; }
      var k = Math.min(Z.max, Math.max(Z.min, Math.min((Z.w - 2 * pad) / (bb[2] - bb[0]), (Z.h - 2 * pad) / (bb[3] - bb[1]))));
      Z.k = k; Z.x = (Z.w - (bb[0] + bb[2]) * k) / 2; Z.y = (Z.h - (bb[1] + bb[3]) * k) / 2; apply();
    };
    Z.center = function (x, y, k) { if (k) Z.k = Math.min(Z.max, Math.max(Z.min, k)); Z.x = Z.w / 2 - x * Z.k; Z.y = Z.h / 2 - y * Z.k; apply(); };
    Z.by = function (f) { zoomAt(f, Z.w / 2, Z.h / 2); };
    Z.toMap = function (px, py) { return [(px - Z.x) / Z.k, (py - Z.y) / Z.k]; };
    el.addEventListener('wheel', function (e) { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); var p = pt(e); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, p[0], p[1]); }, { passive: false });
    el.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      Z.ptrs[e.pointerId] = pt(e);   // przechwycenie wskaźnika dopiero przy ruchu — inaczej klik w pinezkę trafiałby w <svg>
      var ids = Object.keys(Z.ptrs);
      if (ids.length === 1) { Z.drag = { x: e.clientX, y: e.clientY, x0: Z.x, y0: Z.y }; Z.moved = false; }
      else if (ids.length === 2) { var a = Z.ptrs[ids[0]], b = Z.ptrs[ids[1]]; Z.pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: Z.k, c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], x: Z.x, y: Z.y }; Z.drag = null; }
    });
    el.addEventListener('pointermove', function (e) {
      if (!(e.pointerId in Z.ptrs)) return;
      Z.ptrs[e.pointerId] = pt(e);
      var ids = Object.keys(Z.ptrs);
      if (Z.pinch && ids.length === 2) {
        var a = Z.ptrs[ids[0]], b = Z.ptrs[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]), k2 = Math.min(Z.max, Math.max(Z.min, Z.pinch.k * d / (Z.pinch.d || 1)));
        var c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], f = k2 / Z.pinch.k;
        Z.k = k2; Z.x = c[0] - (Z.pinch.c[0] - Z.pinch.x) * f; Z.y = c[1] - (Z.pinch.c[1] - Z.pinch.y) * f; if (!Z.moved) { Z.moved = true; ids.forEach(function (id) { try { el.setPointerCapture(+id); } catch (x) { /* */ } }); } apply(); return;
      }
      if (!Z.drag) return;
      var r = el.getBoundingClientRect(), sx = Z.w / r.width, sy = Z.h / r.height, dx = (e.clientX - Z.drag.x) * sx, dy = (e.clientY - Z.drag.y) * sy;
      if (Math.abs(dx) + Math.abs(dy) > 3 && !Z.moved) { Z.moved = true; el.classList.add('is-drag'); try { el.setPointerCapture(e.pointerId); } catch (x) { /* bez przechwycenia */ } }
      Z.x = Z.drag.x0 + dx; Z.y = Z.drag.y0 + dy; apply();
    });
    var up = function (e) { delete Z.ptrs[e.pointerId]; if (!Object.keys(Z.ptrs).length) { Z.drag = null; Z.pinch = null; el.classList.remove('is-drag'); setTimeout(function () { Z.moved = false; }, 0); } };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    el.addEventListener('dblclick', function (e) { var p = pt(e); zoomAt(1.6, p[0], p[1]); });
    el.addEventListener('keydown', function (e) {
      var s = 40;
      if (e.key === '+' || e.key === '=') { Z.by(1.25); e.preventDefault(); } else if (e.key === '-') { Z.by(0.8); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { Z.x += s; apply(); e.preventDefault(); } else if (e.key === 'ArrowRight') { Z.x -= s; apply(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { Z.y += s; apply(); e.preventDefault(); } else if (e.key === 'ArrowDown') { Z.y -= s; apply(); e.preventDefault(); }
      else if (e.key === '0') { if (o.onFit) o.onFit(Z); e.preventDefault(); }
    });
    apply();
    return Z;
  }

  // ── dane mapy projektu ──
  function loadCoords() {
    var h = H();
    if (h.DEMO) {
      var load = h.state.demo ? Promise.resolve(h.state.demo) : h.api('/admin_queue').then(function () { return h.state.demo; });
      return load.then(function (d) {
        var by = {};
        (d.versions || []).forEach(function (v) { if (!by[v.city_slug] || v.version > by[v.city_slug].version) by[v.city_slug] = v; });
        return Object.keys(by).map(function (k) { var c = DEMO_CITY[k]; return { city_slug: k, lat: c ? c[0] : null, lon: c ? c[1] : null, stops: [] }; });
      });
    }
    // Współrzędne opublikowanych miast są w tabeli cities (public_cities: slug, lat, lon — publiczny odczyt, bez klucza).
    // Wersje szkiców mają je w content.city tylko czasem, dlatego oba źródła: najpierw miasto z bazy, potem wersja, potem środek przystanków.
    var pub = fetch('https://api.quolino.com/public_cities?select=slug,lat,lon', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
    return Promise.all([
      h.api('/admin_versions?select=city_slug,version,lat:content->city->>lat,lon:content->city->>lon,stops:content->stops&order=version.desc&limit=400'),
      pub
    ]).then(function (r) {
      var by = {}, rows = r[0], cities = {};
      (Array.isArray(r[1]) ? r[1] : []).forEach(function (c) { if (c && c.slug) cities[c.slug] = c; });
      (rows || []).forEach(function (v) { if (!by[v.city_slug]) by[v.city_slug] = v; });   // order=version.desc → pierwszy wiersz = najnowsza wersja
      Object.keys(cities).forEach(function (k) { if (!by[k]) by[k] = { city_slug: k, version: 0, stops: [] }; });
      return Object.keys(by).map(function (k) {
        var v = by[k], c = cities[k];
        if (c && fin(c.lat) != null && fin(c.lon) != null) { v.lat = c.lat; v.lon = c.lon; }
        return v;
      });
    });
  }
  function soft(p) { return Promise.resolve(p).then(function (v) { return { ok: v }; }, function (e) { if (e && e.session) throw e; return { err: e && e.message || 'błąd' }; }); }
  function load() {
    var h = H();
    return Promise.all([
      Promise.resolve(h.state.tripsP).catch(function () { return null; }),
      soft(loadCoords()),
      soft(h.api('/pipeline_runs?order=last_at.desc&limit=60')),
      soft(h.api('/draft_revision_requests?order=id.desc&limit=40')),
      soft(h.loadInbox())
    ]).then(function (r) {
      var T = h.state.trips || [], co = {}, runs = r[2].ok || [], revs = r[3].ok || [], I = r[4].ok;
      (r[1].ok || []).forEach(function (v) { co[v.city_slug] = v; });
      var red = {}; if (I && I.drafts.ok) I.drafts.ok.forEach(function (x) { red[x.city_slug] = x; });
      var pins = T.map(function (t) {
        var v = co[t.slug] || {}, lat = fin(v.lat), lon = fin(v.lon), src = 'miasto';
        if (lat == null || lon == null) {
          var pts = (Array.isArray(v.stops) ? v.stops : []).map(function (s) { return [fin(s.lat), fin(s.lon)]; }).filter(function (p) { return p[0] != null && p[1] != null; });
          if (pts.length) { lat = pts.reduce(function (a, p) { return a + p[0]; }, 0) / pts.length; lon = pts.reduce(function (a, p) { return a + p[1]; }, 0) / pts.length; src = 'środek ' + h.plForm(pts.length, 'przystanku', 'przystanków', 'przystanków'); }
          else { lat = null; lon = null; src = null; }
        }
        var busy = runs.some(function (x) { return x.city_slug === t.slug && (x.status === 'running' || x.status === 'stalled'); }) || revs.some(function (x) { return x.city_slug === t.slug && (x.status === 'new' || x.status === 'working'); });
        var st = busy ? 'work' : t.status === 'draft' ? 'draft' : t.status === 'published' ? 'published' : 'rejected';
        return { t: t, lat: lat, lon: lon, src: src, st: st, red: red[t.slug] || null };
      });
      return { pins: pins, err: r[1].err || null, coordsErr: r[1].err };
    });
  }

  function filters() {
    var f = lsGet(FILT_KEY) || {};
    return { st: Array.isArray(f.st) ? f.st : [], c: Array.isArray(f.c) ? f.c : [] };
  }
  function pass(p, f) { return (!f.st.length || f.st.indexOf(p.st) > -1) && (!f.c.length || f.c.indexOf(p.t.country) > -1); }

  // ── widok mapy projektu ──
  function openMap() {
    var h = H();
    h.enter('mapa', 'Mapa');
    document.title = 'Mapa · Quolino admin';
    h.$d.innerHTML = h.loadingHtml('Ładuję mapę…');
    if (!window.QUO_EUROPE) {
      var s = document.createElement('script'); s.src = '../media/map/europe.js';
      s.onload = function () { if (location.hash === '#/mapa') openMap(); };
      s.onerror = function () { h.$d.innerHTML = '<div class="adm-placeholder adm-placeholder--err" role="alert"><p>Nie mogę wczytać kształtów Europy (media/map/europe.js).</p></div>'; };
      document.head.appendChild(s); return;
    }
    load().then(function (D) {
      if (location.hash !== '#/mapa') return;
      M.data = D; M.sel = null;
      paintMap(D);
    }).catch(function (e) { h.$d.innerHTML = '<div class="adm-placeholder adm-placeholder--err" role="alert"><p>Mapa niedostępna: ' + esc(e.message) + '</p></div>'; });
  }
  function paintMap(D) {
    var h = H(), E = window.QUO_EUROPE, proj = projector(E), f = filters();
    var countries = {}; D.pins.forEach(function (p) { countries[p.t.country || ''] = (countries[p.t.country || ''] || 0) + 1; });
    var ck = Object.keys(countries).sort(function (a, b) { return h.countryName(a).localeCompare(h.countryName(b), 'pl'); });
    var stN = {}; D.pins.forEach(function (p) { stN[p.st] = (stN[p.st] || 0) + 1; });
    var shown = D.pins.filter(function (p) { return pass(p, f); }), placed = shown.filter(function (p) { return p.lat != null; }), unknown = shown.filter(function (p) { return p.lat == null; });
    var on = {}; shown.forEach(function (p) { on[p.t.country] = 1; });
    h.$d.innerHTML = '<div class="mp"><div class="mp-map" id="mpMap"><svg class="mp-svg" id="mpSvg" viewBox="0 0 ' + E.w + ' ' + E.h + '" role="group" aria-label="Mapa Europy z trasami — plus i minus przybliżają, strzałki przesuwają, 0 dopasowuje" tabindex="0"><g id="mpG"><g id="mpLand"></g><g id="mpPins"></g></g></svg>' +
      '<div class="mp-ctl"><button type="button" data-mz="in" aria-label="Przybliż">+</button><button type="button" data-mz="out" aria-label="Oddal">−</button><button type="button" data-mz="fit" aria-label="Dopasuj do tras" title="Dopasuj">⤢</button></div>' +
      '<div class="mp-card" id="mpCard" hidden></div>' +
      (unknown.length ? '<div class="mp-unknown"><b>Bez współrzędnych (' + unknown.length + '):</b> ' + unknown.map(function (p) { return '<a href="#/' + encodeURIComponent(p.t.slug) + '">' + esc(p.t.name) + '</a>'; }).join(', ') + '<br><small>Miasto nie ma lat/lon ani przystanków ze współrzędnymi — nic nie zgadujemy.</small></div>' : '') + '</div>' +
      '<aside class="mp-side"><section class="mp-box" aria-labelledby="mpStH"><h2 id="mpStH">Etap</h2><div class="mp-f">' + STAGE_ORDER.map(function (k) {
        return '<label><input type="checkbox" data-mf="st" value="' + k + '"' + (f.st.indexOf(k) > -1 ? ' checked' : '') + '><i class="mp-dot mp-dot--' + k + '" aria-hidden="true"></i>' + esc(STAGE[k]) + '<span class="mp-n">' + (stN[k] || 0) + '</span></label>';
      }).join('') + '</div></section>' +
      '<section class="mp-box" aria-labelledby="mpCH"><h2 id="mpCH">Kraj</h2><div class="mp-f">' + ck.map(function (c) {
        return '<label><input type="checkbox" data-mf="c" value="' + esc(c) + '"' + (f.c.indexOf(c) > -1 ? ' checked' : '') + '><span>' + esc(h.countryName(c)) + '</span><span class="mp-n">' + countries[c] + '</span></label>';
      }).join('') + '</div>' + (f.st.length || f.c.length ? '<button type="button" class="ad-btn ad-btn--ghost" data-mf-clear style="margin-top:8px">Wyczyść filtry</button>' : '') + '</section>' +
      '<section class="mp-box" aria-labelledby="mpLH"><h2 id="mpLH">Trasy na mapie <b class="ad-badge">' + shown.length + '</b></h2><ul class="mp-list" id="mpList">' + shown.slice().sort(function (a, b) { return a.t.name.localeCompare(b.t.name, 'pl'); }).map(function (p) {
        return '<li><button type="button" data-go="' + esc(p.t.slug) + '"' + (p.lat == null ? ' title="bez współrzędnych"' : '') + '><i class="mp-dot mp-dot--' + (p.lat == null ? 'unknown' : p.st) + '" aria-hidden="true"></i><span>' + esc(p.t.name) + '</span><small>' + esc(p.lat == null ? 'brak lat/lon' : STAGE[p.st]) + '</small></button></li>';
      }).join('') + '</ul>' + (D.coordsErr ? '<p class="mp-hint">Współrzędne niedostępne: ' + esc(D.coordsErr) + '</p>' : '') +
      '<p class="mp-hint" id="mpHint">Nowe miasto: panel nie ma jeszcze formularza ani RPC nowej trasy — klik w mapę pokazuje tylko współrzędne. Nową trasę zakłada wątek na Discordzie (kategoria = kraj, forum = region, wątek = miasto) → kolejka Gemini.</p></section></aside></div>';

    var g = document.getElementById('mpG'), land = document.getElementById('mpLand'), pinsG = document.getElementById('mpPins'), svgEl = document.getElementById('mpSvg');
    E.countries.forEach(function (c) { var p = svg('path', { d: c.d, class: 'mp-land' + (on[c.id] ? ' is-on' : ''), 'data-c': c.id }); land.appendChild(p); });
    var areas = (E.areas || {});
    Object.keys(areas).forEach(function (cc) { (areas[cc] || []).forEach(function (a) { if (a.d) land.appendChild(svg('path', { d: a.d, class: 'mp-area' })); }); });
    placed.forEach(function (p) { p.xy = proj(p.lon, p.lat); });
    var Z = panzoom(svgEl, g, { w: E.w, h: E.h, min: 0.6, max: 60, onChange: function (z) { drawPins(placed, pinsG, z); }, onFit: fitAll });
    M.pz = Z; M.placed = placed;
    function fitAll() {
      var xs = placed.map(function (p) { return p.xy[0]; }), ys = placed.map(function (p) { return p.xy[1]; });
      if (!placed.length) { var it = E.countries.filter(function (c) { return c.id === 'it'; })[0]; Z.center(it ? it.a[0] : E.w / 2, it ? it.a[1] : E.h / 2, 3); return; }
      var bb = [Math.min.apply(0, xs), Math.min.apply(0, ys), Math.max.apply(0, xs), Math.max.apply(0, ys)];
      if (bb[2] - bb[0] < 60) { bb[0] -= 30; bb[2] += 30; } if (bb[3] - bb[1] < 60) { bb[1] -= 30; bb[3] += 30; }
      Z.fit(bb, 110);
    }
    fitAll();
    document.getElementById('mpMap').addEventListener('click', function (e) {
      var b = e.target.closest('[data-mz]');
      if (b) { var k = b.getAttribute('data-mz'); if (k === 'in') Z.by(1.4); else if (k === 'out') Z.by(0.7); else fitAll(); return; }
    });
    // klik w pustą mapę (bez przeciągania): tylko współrzędne + podpowiedź — bez zapisu
    svgEl.addEventListener('click', function (e) {
      if (Z.moved || e.target.closest('.mp-pin, .mp-cl')) return;
      var r = svgEl.getBoundingClientRect(), px = (e.clientX - r.left) * E.w / r.width, py = (e.clientY - r.top) * E.h / r.height, m = Z.toMap(px, py), ll = proj.invert(m[0], m[1]);
      var hint = document.getElementById('mpHint'); if (!hint) return;
      hint.innerHTML = ll ? 'Kliknięte miejsce: <b>' + ll[1].toFixed(4) + ', ' + ll[0].toFixed(4) + '</b> (lat, lon). Panel nie dodaje miast — wklej współrzędne do wątku miasta na Discordzie (kategoria = kraj, forum = region, wątek = miasto); trasę zakolejkuje Hermes.' : 'Poza mapą.';
    });
  }
  function pinOf(p) { return p ? STAGE[p.st] : ''; }
  // pinezki o stałym rozmiarze na ekranie (odwrotna skala) + klastry, gdy bliżej niż 22 px
  function drawPins(placed, pinsG, Z) {
    // rozmiar pinezki stały w pikselach: viewBox (1000 j.) vs szerokość na ekranie, podzielone przez skalę <g>
    var svgEl = pinsG.ownerSVGElement, px = svgEl && svgEl.getBoundingClientRect().width ? (window.QUO_EUROPE.w / svgEl.getBoundingClientRect().width) : 1;
    var h = H(), k = Z.k / px, R = 22 / k, cells = {}, groups = [];
    placed.forEach(function (p) {
      var cx = Math.round(p.xy[0] / R), cy = Math.round(p.xy[1] / R), key = cx + ':' + cy, g = cells[key];
      if (!g) { g = cells[key] = { pts: [], x: 0, y: 0 }; groups.push(g); }
      g.pts.push(p);
    });
    // scal sąsiednie komórki, jeśli ich środki są bliżej niż R
    var merged = [];
    groups.forEach(function (g) {
      g.x = g.pts.reduce(function (a, p) { return a + p.xy[0]; }, 0) / g.pts.length; g.y = g.pts.reduce(function (a, p) { return a + p.xy[1]; }, 0) / g.pts.length;
      var near = merged.filter(function (m) { return Math.hypot(m.x - g.x, m.y - g.y) < R; })[0];
      if (near) { near.pts = near.pts.concat(g.pts); near.x = near.pts.reduce(function (a, p) { return a + p.xy[0]; }, 0) / near.pts.length; near.y = near.pts.reduce(function (a, p) { return a + p.xy[1]; }, 0) / near.pts.length; }
      else merged.push(g);
    });
    pinsG.innerHTML = '';
    merged.forEach(function (g) {
      if (g.pts.length > 1 && k < 60) {
        var cl = svg('g', { class: 'mp-cl', transform: 'translate(' + g.x + ',' + g.y + ') scale(' + (1 / k) + ')', role: 'button', tabindex: '0', 'aria-label': g.pts.length + ' tras blisko siebie: ' + g.pts.map(function (p) { return p.t.name; }).join(', ') + ' — przybliż' });
        cl.appendChild(svg('circle', { r: 14 })); var t = svg('text', {}); t.textContent = g.pts.length; cl.appendChild(t);
        var zoomTo = function () { var xs = g.pts.map(function (p) { return p.xy[0]; }), ys = g.pts.map(function (p) { return p.xy[1]; }); var bb = [Math.min.apply(0, xs) - 10 / k, Math.min.apply(0, ys) - 10 / k, Math.max.apply(0, xs) + 10 / k, Math.max.apply(0, ys) + 10 / k]; if (bb[2] - bb[0] < 1e-3 && bb[3] - bb[1] < 1e-3) Z.center(g.x, g.y, Z.k * 3); else Z.fit(bb, 80); };
        cl.addEventListener('click', function (e) { e.stopPropagation(); zoomTo(); });
        cl.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); zoomTo(); } });
        pinsG.appendChild(cl); return;
      }
      g.pts.forEach(function (p, i) {
        var dy = i * 14, pin = svg('g', { class: 'mp-pin mp-pin--' + p.st + (M.sel === p.t.slug ? ' is-on' : ''), transform: 'translate(' + p.xy[0] + ',' + (p.xy[1] + dy / k) + ') scale(' + (1 / k) + ')', role: 'link', tabindex: '0', 'data-pin': p.t.slug, 'aria-label': p.t.name + ' — ' + pinOf(p) + ' — otwórz trasę' });
        pin.appendChild(svg('circle', { class: 'mp-pin__d', r: 6 }));
        var tx = svg('text', { x: 9, y: 4 }); tx.textContent = p.t.name; pin.appendChild(tx);
        pin.addEventListener('mouseenter', function () { showCard(p); }); pin.addEventListener('focus', function () { showCard(p); });
        pin.addEventListener('mouseleave', hideCard); pin.addEventListener('blur', hideCard);
        pin.addEventListener('click', function (e) { e.stopPropagation(); if (Z.moved) return; location.hash = '#/' + encodeURIComponent(p.t.slug); });
        pin.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); location.hash = '#/' + encodeURIComponent(p.t.slug); } });
        pinsG.appendChild(pin);
      });
    });
  }
  function showCard(p) {
    var h = H(), c = document.getElementById('mpCard'); if (!c) return;
    var t = p.t, tone = p.st === 'published' ? 'ok' : p.st === 'draft' ? 'warn' : p.st === 'work' ? 'wait' : 'bad';
    var flags = p.red ? (p.red.red_flags ? h.plForm(p.red.red_flags, 'czerwona flaga', 'czerwone flagi', 'czerwonych flag') : p.red.red_flags === 0 ? 'bez czerwonych flag' : 'flagi nieznane') + (p.red.warnings ? ' · ' + h.plForm(+p.red.warnings, 'ostrzeżenie', 'ostrzeżenia', 'ostrzeżeń') : '') : (t.status === 'draft' ? 'flagi: brak danych' : '');
    c.innerHTML = '<b>' + esc(t.name) + '</b>' + h.stChip(tone, STAGE[p.st]) + '<p class="mp-card__m">' + esc([h.countryName(t.country), t.region ? h.regionName(t.region) : ''].filter(Boolean).join(' · ')) + ' · ' + esc(t.draft != null ? 'szkic v' + t.draft + (t.published != null ? ', na stronie v' + t.published : '') : t.published != null ? 'v' + t.published : 'v' + t.latest) + '</p>' +
      (flags ? '<p class="mp-card__m">' + esc(flags) + '</p>' : '') + '<p class="mp-card__l">' + esc(t.langs && t.langs.length ? h.plForm(t.langs.length, 'język', 'języki', 'języków') + ': ' + t.langs.slice(0, 8).join(' ') + (t.langs.length > 8 ? '…' : '') : 'języki: brak danych') + (p.src && p.src !== 'miasto' ? ' · pinezka: ' + esc(p.src) : '') + '</p>';
    c.hidden = false;
  }
  function hideCard() { var c = document.getElementById('mpCard'); if (c) c.hidden = true; }
  document.addEventListener('change', function (e) {
    if (location.hash !== '#/mapa' || !M.data) return;
    var cb = e.target.closest && e.target.closest('input[data-mf]'); if (!cb) return;
    var f = filters(), g = cb.getAttribute('data-mf'), i = f[g].indexOf(cb.value);
    if (cb.checked && i < 0) f[g].push(cb.value); else if (!cb.checked && i > -1) f[g].splice(i, 1);
    lsSet(FILT_KEY, f); paintMap(M.data);
    var nb = document.querySelector('input[data-mf="' + g + '"][value="' + cb.value.replace(/"/g, '') + '"]'); if (nb) nb.focus();
  });
  document.addEventListener('click', function (e) {
    if (location.hash !== '#/mapa' || !M.data) return;
    if (e.target.closest && e.target.closest('[data-mf-clear]')) { lsSet(FILT_KEY, { st: [], c: [] }); paintMap(M.data); return; }
    var b = e.target.closest && e.target.closest('[data-go]'); if (!b) return;
    var slug = b.getAttribute('data-go'), p = M.placed.filter(function (x) { return x.t.slug === slug; })[0];
    if (!p) { location.hash = '#/' + encodeURIComponent(slug); return; }
    M.sel = slug; M.pz.center(p.xy[0], p.xy[1], Math.max(M.pz.k, 8));
    [].forEach.call(document.querySelectorAll('#mpList button'), function (x) { x.classList.toggle('is-on', x === b); });
    showCard(p);
  });

  // ── mapa przystanków w widoku trasy ──
  function tripMap(stops, trs, city, title) {
    var h = H(), host = document.getElementById('admMap'); if (!host) return;
    var old = document.getElementById('admStopMap'); if (old) old.remove();
    var live = stops.filter(function (x) { return x.kind !== 'del'; });
    if (!live.length) return;
    var pts = live.map(function (x, i) {
      var s = x.s, la = fin(s.lat), lo = fin(s.lon), demo = false;
      if ((la == null || lo == null) && h.DEMO && DEMO_STOPS[x.key]) { la = DEMO_STOPS[x.key][0]; lo = DEMO_STOPS[x.key][1]; demo = true; }
      var cat = s.category || 'monument', shape = cat === 'parking' ? 'sq' : /^(restaurant|icecream|sweets)$/.test(cat) ? 'dm' : 'ci';
      return { i: i, key: x.key, s: s, name: (x.t && x.t.name) || '(bez nazwy)', la: la, lo: lo, cat: cat, shape: shape, demo: demo, kind: x.kind };
    });
    var withXY = pts.filter(function (p) { return p.la != null && p.lo != null; }), miss = pts.filter(function (p) { return p.la == null || p.lo == null; });
    var schema = withXY.length < 2;
    var route = h.routeUrl(city, live.map(function (x) { return x.s; }), trs, title), W = 600, Hh = 380, drawn = schema ? pts : withXY;
    var html = '<div class="sm" id="admStopMap"><div class="sm__h"><h4>Mapa przystanków</h4><span class="adm-cm__meta">' + (schema ? 'schemat kolejności — przystanki bez współrzędnych' : 'kolejność przystanków, bez drogi i czasów dojazdu') + (pts.some(function (p) { return p.demo; }) ? ' · współrzędne testowe (demo)' : '') + '</span>' +
      (route ? '<a href="' + esc(route) + '" target="_blank" rel="noopener">Otwórz w Google Maps ↗</a>' : '') + '</div><div class="sm__grid"><div class="sm__map"><svg class="sm__svg" id="smSvg" viewBox="0 0 600 380" role="group" tabindex="0" aria-label="Mapa przystanków — plus i minus przybliżają, strzałki przesuwają, 0 dopasowuje"><g id="smG"><g aria-hidden="true" id="smGrid"></g>' +
      '<polyline class="sm__line' + (schema ? ' is-schema' : '') + '" points="" id="smLine" aria-hidden="true"/><g id="smPins"></g></g></svg>' +
      '<div class="mp-ctl"><button type="button" data-smz="in" aria-label="Przybliż">+</button><button type="button" data-smz="out" aria-label="Oddal">−</button><button type="button" data-smz="fit" aria-label="Dopasuj" title="Dopasuj">⤢</button></div></div>' +
      '<div class="sm__card" id="smCard" aria-live="polite"><p class="ad-note" style="margin:0">Kliknij przystanek, żeby zobaczyć kartę.</p></div></div>' +
      (miss.length && !schema ? '<p class="sm__miss">Bez współrzędnych (nie na mapie): ' + esc(miss.map(function (p) { return h.num(p.s.stop_number) + ' ' + p.name; }).join(', ')) + '</p>' : '') + '</div>';
    host.insertAdjacentHTML('afterend', html);
    var svgEl = document.getElementById('smSvg'), g = document.getElementById('smG'), pinsG = document.getElementById('smPins');
    // viewBox = rozmiar kontenera mapy (po wstawieniu do DOM) → pinezki i podpisy w naturalnej skali
    var box = document.querySelector('#admStopMap .sm__map'), pad = 54;
    W = Math.max(300, Math.round(box && box.clientWidth || 600)); Hh = Math.round(Math.min(440, Math.max(240, W * 0.62)));
    if (schema) {   // brak współrzędnych → schemat kolejności (równe odstępy, lekka fala), bez zgadywania położenia
      pts.forEach(function (p, i) { var n = pts.length; p.x = pad + (n > 1 ? i * (W - 2 * pad) / (n - 1) : (W - 2 * pad) / 2); p.y = Hh / 2 + (i % 2 ? 46 : -46); });
    } else {
      var lat0 = withXY.reduce(function (a, p) { return a + p.la; }, 0) / withXY.length, cosL = Math.cos(lat0 * Math.PI / 180);
      withXY.forEach(function (p) { p.mx = p.lo * cosL; p.my = -p.la; });
      var xs = withXY.map(function (p) { return p.mx; }), ys = withXY.map(function (p) { return p.my; });
      var x0 = Math.min.apply(0, xs), x1 = Math.max.apply(0, xs), y0 = Math.min.apply(0, ys), y1 = Math.max.apply(0, ys);
      var sp = Math.max((x1 - x0), (y1 - y0), 1e-5), k = Math.min((W - 2 * pad) / Math.max(x1 - x0, sp * 0.3), (Hh - 2 * pad) / Math.max(y1 - y0, sp * 0.3));
      withXY.forEach(function (p) { p.x = (W - (x1 - x0) * k) / 2 + (p.mx - x0) * k; p.y = (Hh - (y1 - y0) * k) / 2 + (p.my - y0) * k; });
    }
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + Hh);
    var grid = ''; for (var gx = 0; gx <= W; gx += 50) grid += '<line class="sm__grid-bg" x1="' + gx + '" y1="0" x2="' + gx + '" y2="' + Hh + '"/>'; for (var gy = 0; gy <= Hh; gy += 50) grid += '<line class="sm__grid-bg" x1="0" y1="' + gy + '" x2="' + W + '" y2="' + gy + '"/>';
    document.getElementById('smGrid').innerHTML = grid;
    document.getElementById('smLine').setAttribute('points', drawn.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' '));
    var Z = panzoom(svgEl, g, { w: W, h: Hh, min: 0.8, max: 12, onChange: function (z) { paintStops(z); }, onFit: function (z) { z.fit([0, 0, W, Hh], 0); } });
    function paintStops(z) {
      var k = (z || Z).k; pinsG.innerHTML = '';
      drawn.forEach(function (p) {
        var pin = svg('g', { class: 'sm-st sm-st--' + p.cat + (M.smSel === p.key ? ' is-on' : ''), transform: 'translate(' + p.x + ',' + p.y + ') scale(' + (1 / k) + ')', role: 'button', tabindex: '0', 'data-sm': p.key, 'aria-label': h.num(p.s.stop_number) + ' ' + p.name + ' — karta przystanku' });
        if (p.shape === 'sq') pin.appendChild(svg('rect', { class: 'sm-st__b', x: -13, y: -13, width: 26, height: 26, rx: 4 }));
        else if (p.shape === 'dm') pin.appendChild(svg('rect', { class: 'sm-st__b', x: -12, y: -12, width: 24, height: 24, rx: 3, transform: 'rotate(45)' }));
        else pin.appendChild(svg('circle', { class: 'sm-st__b', r: 14 }));
        var n = svg('text', { class: 'sm-st__n', y: 0.5 }); n.textContent = h.num(p.s.stop_number); pin.appendChild(n);
        var im = svg('image', { href: h.icon(p.cat), x: -11, y: -40, width: 22, height: 22, 'aria-hidden': 'true' }); im.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', h.icon(p.cat)); pin.appendChild(im);
        var t = svg('text', { class: 'sm-st__t', x: 19, y: 4 }); t.textContent = p.name.length > 26 ? p.name.slice(0, 25) + '…' : p.name; pin.appendChild(t);
        pin.addEventListener('click', function (e) { e.stopPropagation(); if (!Z.moved) selectStop(p); });
        pin.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectStop(p); } });
        pinsG.appendChild(pin);
      });
    }
    function selectStop(p) {
      M.smSel = p.key; paintStops();
      var c = document.getElementById('smCard'), s = p.s, rows = [];
      if (s.time_label) rows.push(['Godzina', s.time_label]);
      if (s.visit_duration) rows.push(['Czas na miejscu', /^\d+$/.test(String(s.visit_duration)) ? s.visit_duration + ' min' : s.visit_duration]);
      if (s.price) rows.push(['Cena', s.price]);
      if (s.year_built) rows.push(['Rok', s.year_built]);
      if (p.la != null) rows.push(['Współrzędne', p.la.toFixed(5) + ', ' + p.lo.toFixed(5) + (p.demo ? ' (demo)' : '')]); else rows.push(['Współrzędne', 'brak']);
      c.innerHTML = '<h5><img src="' + esc(h.icon(p.cat)) + '" alt="" width="32" height="32">' + esc(h.num(s.stop_number) + ' ' + p.name) + '</h5><p>' + esc(p.cat) + (p.kind === 'new' ? ' · nowy' : p.kind === 'chg' ? ' · zmieniony' : '') + '</p>' +
        rows.map(function (r) { return '<p><small>' + esc(r[0]) + ':</small> ' + esc(r[1]) + '</p>'; }).join('') + '<a class="ad-btn ad-btn--ghost" href="#st-' + esc(p.key) + '">Przejdź do pól przystanku</a>';
    }
    paintStops();
    document.getElementById('admStopMap').addEventListener('click', function (e) {
      var b = e.target.closest('[data-smz]'); if (!b) return;
      var k = b.getAttribute('data-smz'); if (k === 'in') Z.by(1.4); else if (k === 'out') Z.by(0.7); else Z.fit([0, 0, W, Hh], 0);
    });
  }

  window.AdminMap = { tripMap: tripMap, open: openMap, projector: projector };
})();
