/* Quolino admin — „+ Nowa trasa” (JP 2026-11-01: „kiedy zaczynasz pracę nad kolejną wycieczką?” — start trasy bez konsoli).
 *
 * Przycisk na liście Trasy i na Pulpicie (nagłówek kafelka „Trasy”) otwiera okno: nazwa (PL) → slug (auto, bez polskich znaków,
 * edytowalny), kraj (domyślnie Włochy), region (lista regionów kraju; Marche ≠ Umbria), czas (pół dnia / cały dzień),
 * „życzenia do trasy” (brief), „od zera (fresh)” — zaznaczone samo, gdy miasto już jest w bazie (stara trasa → archiwum).
 * Szacunek: ≈20–40 wywołań Antigravity (ok. 15–25 % tygodniowego limitu), 0 $ z abonamentu, ≈ 1 h + bieżące zużycie limitu z ops_status.
 * „Zleć” → POST /api/rpc/admin_trip_enqueue (SQL _content/claude-skills/sql/2026-11-01-nowa-trasa.sql) → wiersz ops.jobs (draft/gemini/queued),
 * dokładnie taki, jaki dotąd dodawało tylko `qdb.mjs job-add` na serwerze; gemini-queue.mjs (cron co 10 min) podejmuje go sam.
 * Przy starych trasach (stare wytyczne) przycisk „Przepisz od zera” otwiera to samo okno z wypełnionymi polami.
 * Tryb demo (?demo=1): RPC udawane, nic nie trafia do bazy.
 *
 * Źródła (miękkie): admin.regions (slug, country, name_pl) — bez niego lista regionów z tras w panelu + słownik REGION_PL;
 * rpc/ops_status → queue.agyWeekCalls (zużycie limitu) — bez niego tylko szacunek.
 * Haki w admin.js: zdarzenia adm:list (po renderList) i adm:dash (po drawDash); reszta tutaj przez window.AdminHost / window.ADM.
 * Czyste funkcje (slugify, validate, estimate) w window.AdminNewTrip — testuje je bin/trip-enqueue.test.mjs.
 */
(function () {
  'use strict';
  var H = function () { return window.AdminHost; };
  var AGY_BUDGET = 150;   // ostrożna miara tygodniowa (gemini-queue.mjs, QUOLINO_AGY_WEEKLY_CALLS)
  var SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;
  var COUNTRY_PL = { it: 'Włochy', pl: 'Polska', hr: 'Chorwacja', fr: 'Francja', de: 'Niemcy', at: 'Austria', es: 'Hiszpania', si: 'Słowenia', cz: 'Czechy', sk: 'Słowacja', hu: 'Węgry', gr: 'Grecja', pt: 'Portugalia' };
  var REGION_PL = { umbria: 'Umbria', marche: 'Marche', 'emilia-romagna': 'Emilia-Romania', toscana: 'Toskania', toskania: 'Toskania', lazio: 'Lacjum',
    veneto: 'Wenecja Euganejska', lombardia: 'Lombardia', liguria: 'Liguria', piemonte: 'Piemont', campania: 'Kampania', sicilia: 'Sycylia', istria: 'Istria', malopolska: 'Małopolska' };
  var KNOWN_REGIONS = [{ slug: 'umbria', country: 'it' }, { slug: 'marche', country: 'it' }];   // zapas, gdy nie ma admin.regions ani tras
  var S = { regions: null, regionsP: null, dlg: null, opener: null, auto: true, busy: false };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // „Asyż” → asyz, „Rawenna” → rawenna, „Città di Castello” → citta-di-castello (jak bin/trip-enqueue.mjs)
  function slugify(name) {
    return String(name == null ? '' : name).toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function countryName(c) { return COUNTRY_PL[c] || (H() ? H().countryName(c) : String(c || '').toUpperCase()); }
  function regionName(r) { var x = (S.regions || []).filter(function (q) { return q.slug === r; })[0]; return (x && x.name_pl) || REGION_PL[r] || (H() ? H().regionName(r) : r); }
  // te same reguły co admin.admin_trip_enqueue → komunikat albo null
  function validate(v, regions) {
    var name = String(v.name || '').trim();
    if (name.length < 2 || name.length > 80) return 'Nazwa miasta: od 2 do 80 znaków.';
    if (/[\n\r"]/.test(name)) return 'Nazwa bez cudzysłowów.';
    if (!SLUG_RE.test(v.slug || '')) return 'Slug: małe litery bez polskich znaków, cyfry i myślniki, 2–63 znaki (np. asyz).';
    if (!/^[a-z]{2}$/.test(v.country || '')) return 'Wybierz kraj.';
    var reg = (regions || []).filter(function (r) { return r.slug === v.region; })[0];
    if (!reg) return 'Wybierz region z listy (Marche ≠ Umbria).';
    if (reg.country && reg.country !== v.country) return 'Region ' + regionName(reg.slug) + ' należy do kraju ' + countryName(reg.country) + ', nie ' + countryName(v.country) + '.';
    if (v.duration !== 'half_day' && v.duration !== 'full_day') return 'Czas: pół dnia albo cały dzień.';
    if (String(v.brief || '').length > 2000) return 'Życzenia do trasy: najwyżej 2000 znaków.';
    return null;
  }
  // szacunek kosztu + bieżące zużycie limitu (q = snapshots.queue z ops_status albo null)
  function estimate(q) {
    var base = '≈20–40 wywołań Antigravity (ok. 15–25 % tygodniowego limitu), 0 $ z abonamentu; czas ≈ 1 h.';
    if (!q || typeof q.agyWeekCalls !== 'number') return base;
    var pct = Math.round(q.agyWeekCalls / AGY_BUDGET * 100);
    var out = base + ' Zużycie limitu teraz: ' + q.agyWeekCalls + ' z ' + AGY_BUDGET + ' (' + pct + ' %).';
    if (q.agyQuotaOut && Date.parse(q.agyQuotaOut) > Date.now()) out += ' Limit wyczerpany — trasa poczeka w kolejce do ' + (H() ? H().when(q.agyQuotaOut) : q.agyQuotaOut) + '.';
    else if (pct >= 90) out += ' Kolejka zacznie nową trasę dopiero po odnowieniu limitu.';
    return out;
  }
  window.AdminNewTrip = { slugify: slugify, validate: validate, estimate: estimate, open: openDialog };

  function trips() { return (window.ADM && window.ADM.state && window.ADM.state.trips) || []; }
  function tripBySlug(slug) { return trips().filter(function (t) { return t.slug === slug; })[0] || null; }
  function regionsFromTrips() {
    var by = {}; trips().forEach(function (t) { if (t.region) by[t.region] = { slug: t.region, country: t.country || null }; });
    return Object.keys(by).map(function (k) { return by[k]; });
  }
  function loadRegions() {
    if (S.regions) return Promise.resolve(S.regions);
    if (S.regionsP) return S.regionsP;
    var fallback = function () {
      var list = regionsFromTrips(); KNOWN_REGIONS.forEach(function (k) { if (!list.some(function (r) { return r.slug === k.slug; })) list.push(k); });
      return list;
    };
    var p = H().DEMO ? Promise.resolve(fallback().map(function (r) { return { slug: r.slug, country: r.country, name_pl: REGION_PL[r.slug] || null }; }))
      : H().api('/regions?select=slug,country,name_pl&order=slug.asc').then(function (rows) {
        if (!Array.isArray(rows) || !rows.length) return fallback();
        return rows.map(function (r) { return { slug: r.slug, country: r.country ? String(r.country).toLowerCase() : null, name_pl: r.name_pl || null }; });
      }, function (e) { if (e && e.session) throw e; return fallback(); });
    S.regionsP = p.then(function (v) { S.regions = v; S.regionsP = null; return v; }, function (e) { S.regionsP = null; throw e; });
    return S.regionsP;
  }
  function countries() {
    var set = { it: 1 }; trips().forEach(function (t) { if (t.country) set[t.country] = 1; }); (S.regions || []).forEach(function (r) { if (r.country) set[r.country] = 1; });
    return Object.keys(set).sort(function (a, b) { return a === 'it' ? -1 : b === 'it' ? 1 : countryName(a).localeCompare(countryName(b), 'pl'); });
  }

  // ── okno ──────────────────────────────────────────────────────────────────────
  function dialog() {
    if (S.dlg) return S.dlg;
    var d = document.createElement('dialog'); d.id = 'ntDlg'; d.className = 'adm-dlg nt-dlg'; d.setAttribute('aria-labelledby', 'ntH');
    document.body.appendChild(d);
    d.addEventListener('close', function () { if (S.opener && S.opener.focus) { try { S.opener.focus(); } catch (e) { /* zniknął */ } } S.opener = null; });
    d.addEventListener('cancel', function (e) { if (S.busy) e.preventDefault(); });   // Esc w trakcie wysyłania: czekamy na odpowiedź
    d.addEventListener('click', function (e) { if (e.target.closest('[data-nt-close]')) d.close(); });
    d.addEventListener('input', onInput);
    d.addEventListener('change', onInput);
    d.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
    S.dlg = d;
    return d;
  }
  // pre = { slug, name, country, region, duration, brief, fresh } (przycisk „Przepisz od zera”) albo null
  function openDialog(pre, opener) {
    if (!H()) return;
    S.opener = opener || document.activeElement;
    var d = dialog();
    d.innerHTML = '<form method="dialog" class="adm-dlg__f nt-f" novalidate><header class="adm-dlg__h"><h2 id="ntH">Nowa trasa</h2>' +
      '<button type="button" class="adm-pop__x" data-nt-close aria-label="Zamknij okno">×</button></header>' + H().loadingHtml('Ładuję regiony…') + '</form>';
    if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
    loadRegions().then(function (regions) { render(regions, pre || {}); }, function (e) {
      d.querySelector('.ad-loading').outerHTML = '<p class="adm-msg adm-msg--err" role="alert">' + esc(e.message) + '</p>';
    });
    if (H().loadOps) H().loadOps().then(function () { refreshEstimate(); }).catch(function () { /* szacunek bez zużycia */ });
  }
  function render(regions, pre) {
    var d = S.dlg, f = d.querySelector('form');
    var country = pre.country || 'it', region = pre.region || '';
    S.auto = !pre.slug;
    var opt = function (list, val, label) { return list.map(function (x) { return '<option value="' + esc(x) + '"' + (x === val ? ' selected' : '') + '>' + esc(label(x)) + '</option>'; }).join(''); };
    f.innerHTML = '<header class="adm-dlg__h"><h2 id="ntH">' + (pre.slug ? 'Przepisz od zera: ' + esc(pre.name || pre.slug) : 'Nowa trasa') + '</h2>' +
      '<button type="button" class="adm-pop__x" data-nt-close aria-label="Zamknij okno">×</button></header>' +
      '<p class="adm-dlg__sub">Trasa powstaje w nowym procesie: Gemini (research + szkic) → kontrola Claude → szkic do Twojej akceptacji w panelu. Zajmuje ok. godziny.</p>' +
      '<div class="nt-body">' +
      '<div class="nt-row"><label class="nt-l" for="ntName">Nazwa miasta (po polsku)</label><input class="nt-in" id="ntName" name="name" type="text" required maxlength="80" autocomplete="off" spellcheck="false" placeholder="np. Asyż" value="' + esc(pre.name || '') + '"></div>' +
      '<div class="nt-row"><label class="nt-l" for="ntSlug">Slug <small>(adres i pliki; bez polskich znaków)</small></label><input class="nt-in nt-in--mono" id="ntSlug" name="slug" type="text" required maxlength="63" autocomplete="off" spellcheck="false" pattern="[a-z0-9][a-z0-9-]{1,62}" placeholder="asyz" value="' + esc(pre.slug || '') + '">' +
      '<p class="nt-hint" id="ntExists" hidden></p></div>' +
      '<div class="nt-grid">' +
      '<div class="nt-row"><label class="nt-l" for="ntCountry">Kraj</label><select class="nt-in" id="ntCountry" name="country">' + opt(countries(), country, countryName) + '</select></div>' +
      '<div class="nt-row"><label class="nt-l" for="ntRegion">Region</label><select class="nt-in" id="ntRegion" name="region" required></select></div>' +
      '</div>' +
      '<fieldset class="nt-fs"><legend class="nt-l">Czas zwiedzania</legend>' +
      '<label class="nt-radio"><input type="radio" name="duration" value="half_day"' + (pre.duration === 'full_day' ? '' : ' checked') + '><span>Pół dnia</span></label>' +
      '<label class="nt-radio"><input type="radio" name="duration" value="full_day"' + (pre.duration === 'full_day' ? ' checked' : '') + '><span>Cały dzień</span></label></fieldset>' +
      '<div class="nt-row"><label class="nt-l" for="ntBrief">Życzenia do trasy <small>(must-see, kolejność, finał, tempo — Twoimi słowami; opcjonalne)</small></label>' +
      '<textarea class="nt-in nt-ta" id="ntBrief" name="brief" rows="3" maxlength="2000" placeholder="np. start z parkingu, bazylika św. Franciszka, finał z widokiem">' + esc(pre.brief || '') + '</textarea></div>' +
      '<label class="nt-check"><input type="checkbox" name="fresh" id="ntFresh"' + (pre.fresh ? ' checked' : '') + '><span>Od zera (fresh) — bez wznawiania przerwanego przebiegu</span></label>' +
      '<p class="nt-warn" id="ntWarn" role="status" hidden></p>' +
      '<p class="nt-est" id="ntEst"><b>Szacunek:</b> <span id="ntEstT">' + esc(estimate(null)) + '</span></p>' +
      '<p class="adm-msg adm-msg--err nt-err" id="ntErr" role="alert" hidden></p>' +
      '<p class="nt-ok" id="ntOk" role="status" hidden></p>' +
      '</div>' +
      '<footer class="adm-dlg__foot"><button type="submit" class="qc-btn adm-btn-ok" id="ntGo">Zleć</button>' +
      '<button type="button" class="qc-btn qc-btn--ghost" data-nt-close>Anuluj</button>' +
      '<span class="nt-foot__n">Zlecenie trafia do kolejki — nic nie dzieje się bez Twojej akceptacji szkicu.</span></footer>';
    fillRegions(regions, country, region);
    refreshEstimate(); checkExists();
    var first = f.querySelector(pre.slug ? '#ntBrief' : '#ntName'); if (first) first.focus();
  }
  function fillRegions(regions, country, selected) {
    var sel = S.dlg.querySelector('#ntRegion'); if (!sel) return;
    var list = regions.filter(function (r) { return !r.country || r.country === country; }).sort(function (a, b) { return regionName(a.slug).localeCompare(regionName(b.slug), 'pl'); });
    sel.innerHTML = '<option value="">— wybierz —</option>' + list.map(function (r) { return '<option value="' + esc(r.slug) + '"' + (r.slug === selected ? ' selected' : '') + '>' + esc(regionName(r.slug)) + (regionName(r.slug).toLowerCase() !== r.slug ? ' (' + esc(r.slug) + ')' : '') + '</option>'; }).join('');
    if (list.length === 1 && !selected) sel.value = list[0].slug;
    if (!list.length) sel.innerHTML = '<option value="">brak regionów dla tego kraju w bazie</option>';
  }
  function values() {
    var f = S.dlg.querySelector('form'), g = function (n) { var el = f.querySelector('[name="' + n + '"]'); return el ? el.value : ''; };
    var dur = f.querySelector('[name="duration"]:checked');
    return { name: g('name').trim(), slug: g('slug').trim().toLowerCase(), country: g('country'), region: g('region'), duration: dur ? dur.value : '', brief: g('brief').trim(), fresh: !!(f.querySelector('#ntFresh') || {}).checked };
  }
  function onInput(e) {
    var t = e.target; if (!t || !t.name) return;
    var f = S.dlg.querySelector('form');
    if (t.name === 'name' && S.auto) f.querySelector('#ntSlug').value = slugify(t.value);
    if (t.name === 'slug') S.auto = !t.value;
    if (t.name === 'country') fillRegions(S.regions || [], t.value, '');
    if (t.name === 'name' || t.name === 'slug') checkExists();
    var err = f.querySelector('#ntErr'); if (err && !err.hidden && e.type === 'input') err.hidden = true;
  }
  // miasto już w bazie → „od zera” zaznaczone + ostrzeżenie (stara trasa do archiwum)
  function checkExists() {
    var f = S.dlg.querySelector('form'), v = values(), t = tripBySlug(v.slug), ex = f.querySelector('#ntExists'), w = f.querySelector('#ntWarn'), fr = f.querySelector('#ntFresh');
    if (!ex) return;
    if (t) {
      ex.hidden = false; ex.innerHTML = 'W bazie jest już <b>' + esc(t.name) + '</b> (' + esc(t.std === 'old' ? 'stare wytyczne' : 'wytyczne ' + t.std) + ', ' + esc(window.ADM.VST[t.status] || t.status) + ' v' + esc(t.latest) + ').';
      if (!fr.dataset.touched) fr.checked = true;
      w.hidden = false; w.textContent = 'Stara trasa trafi do archiwum, nowa powstaje od zera (nowy research i szkic; nic nie znika z panelu — wersje zostają w historii).';
    } else { ex.hidden = true; w.hidden = true; if (!fr.dataset.touched) fr.checked = false; }
    fr.onchange = function () { fr.dataset.touched = '1'; };
  }
  function refreshEstimate() {
    var el = S.dlg && S.dlg.querySelector('#ntEstT'); if (!el) return;
    var q = null; try { var o = H().ops && H().ops.data; q = o && o.snapshots && o.snapshots.queue && o.snapshots.queue.data; } catch (e) { q = null; }
    el.textContent = estimate(q);
  }
  function submit() {
    if (S.busy) return;
    var f = S.dlg.querySelector('form'), v = values(), err = f.querySelector('#ntErr'), ok = f.querySelector('#ntOk'), go = f.querySelector('#ntGo');
    var bad = validate(v, S.regions || []);
    if (bad) { err.hidden = false; err.textContent = bad; var bf = f.querySelector(/Slug/.test(bad) ? '#ntSlug' : /Region/.test(bad) ? '#ntRegion' : /Nazwa/.test(bad) ? '#ntName' : '#ntName'); if (bf) bf.focus(); return; }
    err.hidden = true; S.busy = true; go.disabled = true; go.textContent = 'Zlecam…';
    var body = { p_slug: v.slug, p_name: v.name, p_country: v.country, p_region: v.region, p_duration: v.duration, p_brief: v.brief, p_fresh: v.fresh };
    var p = H().DEMO ? new Promise(function (res) { setTimeout(function () { res({ id: 100 + Math.floor(Math.random() * 900), city_slug: v.slug, status: 'queued' }); }, 400); })
      : H().api('/rpc/admin_trip_enqueue', { method: 'POST', body: body });
    p.then(function (r) {
      var id = r && r.id != null ? r.id : '?';
      ok.hidden = false;
      ok.innerHTML = '<b>W kolejce jako #' + esc(id) + '.</b> Kolejka Gemini podejmie ' + esc(v.name) + ' przy najbliższym przebiegu (co 10 min); trasa zajmie ok. godziny, szkic pojawi się w Trasach do akceptacji. ' +
        '<a href="#/pipeline" data-nt-close>Pipeline →</a>' + (H().DEMO ? ' <small>(tryb demo — nic nie trafiło do bazy)</small>' : '');
      go.hidden = true; f.querySelector('[data-nt-close].qc-btn').textContent = 'Zamknij';
      ok.querySelector('a').focus();
      try { if (window.ADM && window.ADM.loadTrips) window.ADM.loadTrips(); } catch (e) { /* lista odświeży się sama */ }
    }, function (e) {
      err.hidden = false; err.textContent = 'Nie zlecono: ' + (e && e.message || 'błąd');
      go.disabled = false; go.textContent = 'Zleć';
    }).then(function () { S.busy = false; go.disabled = false; if (!go.hidden) go.textContent = 'Zleć'; });
  }

  // ── przyciski w panelu ─────────────────────────────────────────────────────
  function newBtn(cls) { return '<button type="button" class="' + cls + '" data-nt-new>+ Nowa trasa</button>'; }
  function rewriteBtn(t, cls) { return '<button type="button" class="' + cls + '" data-nt-rewrite="' + esc(t.slug) + '" title="Nowy research i szkic w nowym procesie; stara trasa do archiwum">Przepisz od zera<span class="adm-sr">: ' + esc(t.name) + '</span></button>'; }
  function hookList() {
    var res = document.getElementById('results'), h = document.getElementById('rh'); if (!res || !h) return;
    if (!document.getElementById('ntBar')) {
      var bar = document.createElement('div'); bar.id = 'ntBar'; bar.className = 'nt-bar'; bar.innerHTML = newBtn('ad-btn nt-btn');
      h.parentNode.insertBefore(bar, h);
    }
    var T = trips();
    [].forEach.call(res.querySelectorAll('a.adm-tc'), function (a) {
      if (a.parentNode.classList.contains('nt-wrap')) return;
      var slug = decodeURIComponent((a.getAttribute('href') || '').replace(/^#\//, '')), t = T.filter(function (x) { return x.slug === slug; })[0];
      if (!t || t.std !== 'old') return;
      var w = document.createElement('div'); w.className = 'nt-wrap'; a.parentNode.insertBefore(w, a); w.appendChild(a);
      w.insertAdjacentHTML('beforeend', rewriteBtn(t, 'ad-btn ad-btn--ghost nt-rw'));
    });
  }
  function hookDash() {
    var card = document.querySelector('.ad-card--trips'); if (!card) return;
    var head = card.querySelector('.ad-card__h');
    if (head && !head.querySelector('[data-nt-new]')) head.insertAdjacentHTML('beforeend', newBtn('ad-btn nt-btn nt-btn--dash'));
    var T = trips();
    [].forEach.call(card.querySelectorAll('.ad-tr:not(.ad-tr--h)'), function (row) {
      var a = row.querySelector('.ad-td--name a'), acts = row.querySelector('.ad-td--acts'); if (!a || !acts || acts.querySelector('[data-nt-rewrite]')) return;
      var slug = decodeURIComponent((a.getAttribute('href') || '').replace(/^#\//, '')), t = T.filter(function (x) { return x.slug === slug; })[0];
      if (t && t.std === 'old') acts.insertAdjacentHTML('beforeend', rewriteBtn(t, 'ad-btn ad-btn--ghost nt-rw'));
    });
  }
  document.addEventListener('adm:list', hookList);
  document.addEventListener('adm:route', function (e) { if (e.detail && e.detail.hash === '#/trasy') hookList(); });   // także pusta lista
  document.addEventListener('adm:dash', hookDash);
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-nt-new],[data-nt-rewrite]'); if (!b) return;
    e.preventDefault();
    var slug = b.getAttribute('data-nt-rewrite');
    if (!slug) { openDialog(null, b); return; }
    var t = tripBySlug(slug);
    openDialog({ slug: slug, name: t ? t.name : slug, country: (t && t.country) || 'it', region: (t && t.region) || '', duration: 'full_day', brief: '', fresh: true }, b);
  });
  // lista mogła być narysowana przed załadowaniem tego pliku
  if (document.getElementById('results') && document.querySelector('#results .adm-tc')) hookList();
})();
