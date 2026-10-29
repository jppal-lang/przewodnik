/* =====================================================================
   QUOLINO — trip-tools.js (strona trasy, widok rodzica; JP 2026-10-29)
   Narzędzia pod listą „Cała trasa” (QTripTools.mount woła trip-ui.js po każdym renderOverview):
   I-1  „Nie wygaszaj ekranu na trasie” — Wake Lock API, przełącznik domyślnie wyłączony, wybór w localStorage
        (qc.wakelock = '1'/'0'). Blokada zwalnia się po 30 min bez dotyku i przy zmianie karty; wraca przy
        powrocie na kartę i przy pierwszym dotknięciu. Bez wsparcia w przeglądarce przełącznika nie ma.
   I-12 „Wyślij plan drugiemu rodzicowi” — Web Share (zapas: kopiowanie): treść planu dnia (kolejność, pory,
        nazwy przystanków, bez danych osobowych) + link; link składa city.html (opts.planLink → Promise(url)):
        pominięte przystanki (hide=), token planu (pt=, RPC plan_token_create — szkic SQL do zatwierdzenia JP).
   I-13 „Zwykły dzień · Upał · Deszcz” — wybór rodzica, bez prognozy i bez API: podświetla przystanki
        z kategorii wnętrz (kościół, muzeum, synagoga). qc.daymode.<slug> = {m, d} — ważny dziś i jutro.
   I-16 Karta „Przy kolacji” na ostatnim przystanku (widać ją po dotarciu do końca trasy, #city[data-trip-end]):
        trzy pytania i notatka rodziny zapisywana w qc.album (pole note) — tylko na tym urządzeniu.
   I-17 Plan na kartce A4 + karta misji dla dziecka: arkusz #qcPrintPlan budowany przed drukiem
        (przycisk albo menu przeglądarki → „Drukuj” / „Zapisz jako PDF”), style w styles.css (@media print).
   Zero zależności; QR na kartce rysuje qrcodejs wbudowany w city.html (gdy jest).
   ===================================================================== */
(function () {
  'use strict';

  var IDLE_MS = 30 * 60 * 1000;
  var K_WL = 'qc.wakelock', K_DAY = 'qc.daymode.', K_ALBUM = 'qc.album';
  var INDOOR = { church: 1, museum: 1, synagogue: 1 };   // tylko kategorie z danych, bez zgadywania
  var S = { o: null, root: null, mode: 'normal', bound: false };
  var WL = { on: false, lock: null, last: Date.now(), timer: null, idle: false };

  // ── teksty: słownik strony (ui_translations przez city.html) > polski z kodu; ui-translate dotłumaczy ──
  function PT(key, pl, vars) {
    var MISS = '\u0000', v = S.o && S.o.ui ? S.o.ui(key, MISS) : MISS;
    v = v && v !== MISS && v !== key ? v : pl;
    if (vars) Object.keys(vars).forEach(function (k) { v = v.split('{' + k + '}').join(vars[k]); });
    return v;
  }
  function U(key, fb) { var v = S.o && S.o.ui ? S.o.ui(key, fb) : fb; return v && v !== key ? v : fb; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function jGet(k) { try { return JSON.parse(lsGet(k) || 'null'); } catch (e) { return null; } }
  function today(off) { var d = new Date(Date.now() + (off || 0) * 864e5); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function isKid() { return S.root && S.root.dataset.view === 'kid'; }

  // przystanki w planie: bez wyłączonych przełącznikiem „dla dziecka” (ten sam wybór co hide= w QR)
  function hiddenNums() { return $$('[data-toggle-stop]').filter(function (c) { return !c.checked; }).map(function (c) { return String(c.getAttribute('data-toggle-stop')); }); }
  function planStops() {
    var off = hiddenNums();
    return (S.o.stops || []).filter(function (s) { return off.indexOf(String(s.num)) < 0; });
  }

  // ══════════ I-1 · EKRAN NIE GAŚNIE ══════════
  function wlSupported() { return !!(navigator.wakeLock && navigator.wakeLock.request); }
  function wlAcquire() {
    if (!WL.on || WL.lock || WL.pending || document.visibilityState !== 'visible') return;
    WL.pending = true;
    navigator.wakeLock.request('screen').then(function (l) {
      WL.pending = false;
      if (!WL.on) { l.release().catch(function () {}); return; }
      WL.lock = l; WL.idle = false;
      l.addEventListener('release', function () { if (WL.lock === l) WL.lock = null; wlPaint(); });
      wlArm(); wlPaint();
    }, function () { WL.pending = false; wlPaint(); });   // np. bez gestu — spróbujemy przy pierwszym dotknięciu
  }
  function wlRelease() {
    clearTimeout(WL.timer);
    var l = WL.lock; WL.lock = null;
    if (l) l.release().catch(function () {});
    wlPaint();
  }
  function wlArm() {
    clearTimeout(WL.timer);
    if (!WL.lock) return;
    WL.timer = setTimeout(function () {
      if (Date.now() - WL.last >= IDLE_MS - 1000) { WL.idle = true; wlRelease(); } else wlArm();
    }, Math.max(1000, IDLE_MS - (Date.now() - WL.last)));
  }
  function wlActivity() {
    WL.last = Date.now();
    if (!WL.on) return;
    if (WL.lock) { if (!WL.timer) wlArm(); } else wlAcquire();
  }
  function wlSet(on) {
    WL.on = !!on;
    lsSet(K_WL, on ? '1' : '0');
    WL.last = Date.now();
    if (on) wlAcquire(); else wlRelease();
    wlPaint();
  }
  function wlPaint() {
    $$('[data-wl]').forEach(function (box) {
      var cb = $('input', box), st = $('.qc-wl__state', box);
      if (cb) cb.checked = WL.on;
      if (!st) return;
      st.textContent = !WL.on ? PT('page.trip.wl_note', 'Zużywa trochę więcej baterii. Wyłącza się sam po 30 min bez dotyku.')
        : WL.lock ? PT('page.trip.wl_on', 'Włączone — ekran nie zgaśnie. Wyłącza się sam po 30 min bez dotyku.')
        : WL.idle ? PT('page.trip.wl_idle', 'Wstrzymane po 30 min bez dotyku. Dotknij ekranu, żeby wrócić.')
        : PT('page.trip.wl_wait', 'Włączy się przy pierwszym dotknięciu ekranu.');
    });
  }
  function wlBind() {
    var on = function () { wlActivity(); };
    ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(function (ev) { document.addEventListener(ev, on, { passive: true, capture: true }); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') { WL.last = Date.now(); wlAcquire(); }
      else { clearTimeout(WL.timer); WL.timer = null; }   // przeglądarka sama zwalnia blokadę na ukrytej karcie
    });
    WL.on = lsGet(K_WL) === '1';
    if (WL.on) wlAcquire();
  }
  function wlHtml() {
    if (!wlSupported()) return '';
    return '<label class="qc-wl" data-wl><input type="checkbox" role="switch">' +
      '<span class="qc-wl__slider" aria-hidden="true"></span>' +
      '<span class="qc-wl__txt"><span class="qc-wl__title">' + esc(PT('page.trip.wl_title', 'Nie wygaszaj ekranu na trasie')) + '</span>' +
      '<span class="qc-wl__state" aria-live="polite"></span></span></label>';
  }

  // ══════════ I-13 · UPAŁ / DESZCZ ══════════
  function dmKey() { return K_DAY + (S.o.slug || 'x'); }
  function dmLoad() {
    var v = jGet(dmKey());
    return v && (v.d === today() || v.d === today(-1)) && /^(heat|rain)$/.test(v.m) ? v.m : 'normal';
  }
  function dmHtml() {
    var b = function (m, label) { return '<button type="button" class="qc-dm__chip" role="radio" data-dm="' + m + '" aria-checked="false">' + label + '</button>'; };
    return '<div class="qc-dm"><div class="qc-dm__chips" role="radiogroup" aria-label="' + esc(PT('page.trip.dm_label', 'Jaki dziś dzień?')) + '">' +
      b('normal', esc(PT('page.trip.dm_normal', 'Zwykły dzień'))) +
      b('heat', esc(PT('page.trip.dm_heat', 'Upał')) + ' <span aria-hidden="true">☀️</span>') +
      b('rain', esc(PT('page.trip.dm_rain', 'Deszcz')) + ' <span aria-hidden="true">☔</span>') +
      '</div><p class="qc-dm__tip" hidden></p></div>';
  }
  function dmApply(m, save) {
    S.mode = m;
    if (S.root) { if (m === 'normal') S.root.removeAttribute('data-daymode'); else S.root.setAttribute('data-daymode', m); }
    if (save) lsSet(dmKey(), m === 'normal' ? null : JSON.stringify({ m: m, d: today() }));
    $$('.qc-dm__chip').forEach(function (c) { c.setAttribute('aria-checked', c.getAttribute('data-dm') === m ? 'true' : 'false'); });
    var n = 0, label = m === 'rain' ? PT('page.trip.dm_roof', 'pod dachem') : PT('page.trip.dm_inside', 'wewnątrz');
    (S.o.stops || []).forEach(function (s) {
      var on = m !== 'normal' && !!INDOOR[s.cat];
      if (on) n++;
      $$('.qc-ov__item[data-go="' + s.num + '"]').forEach(function (a) {
        a.classList.toggle('is-indoor', on);
        var tag = $('.qc-ov__dm', a);
        if (on && !tag) { tag = document.createElement('span'); tag.className = 'qc-ov__dm'; var tx = $('.qc-ov__txt', a); if (tx) tx.appendChild(tag); }
        if (tag) { tag.textContent = on ? label : ''; tag.hidden = !on; }
      });
      var st = $('#trasa > .qc-stop[data-stop-num="' + s.num + '"]');
      if (st) st.classList.toggle('is-indoor', on);
    });
    var tip = $('.qc-dm__tip');
    if (!tip) return;
    if (m === 'normal') { tip.hidden = true; tip.innerHTML = ''; return; }
    var help = !S.o.locked ? ' <a href="#awaryjne" data-dm-help>' + esc(PT('page.trip.dm_help', 'Toalety i apteka: {tab}', { tab: U('tab.emergency', 'Pomoc w pobliżu') })) + '</a>' : '';
    var txt = !n ? PT('page.trip.dm_none', 'Na tej trasie nie mamy przystanków oznaczonych jako wnętrza.')
      : m === 'heat' ? PT('page.trip.dm_heat_tip', 'W upale: podświetlone wnętrza zostawcie na środek dnia, a wodę uzupełniajcie na każdym przystanku.')
      : PT('page.trip.dm_rain_tip', 'W deszczu: podświetlone przystanki są pod dachem.');
    tip.innerHTML = esc(txt) + (m === 'heat' ? help : '');
    tip.hidden = false;
  }

  // ══════════ I-12 · PLAN DLA DRUGIEGO RODZICA ══════════
  function shareText() {
    var all = S.o.stops || [], list = planStops();
    var head = PT('page.trip.share_head', '{city} z dziećmi — plan dnia ({n} z {t} przystanków):', { city: S.o.cityName || '', n: list.length, t: all.length });
    var lines = list.map(function (s) { return pad(s.num) + (s.time ? ' · ' + s.time : '') + ' · ' + (s.name || ''); });
    return head + '\n' + lines.join('\n') + '\n\n' + PT('page.trip.share_open', 'Otwórz plan na telefonie 👉');
  }
  function shareHtml() {
    return '<div class="qc-share"><button type="button" class="qc-btn qc-btn--sm qc-share__btn" data-tt="share">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg> ' +
      esc(PT('page.trip.share_btn', 'Wyślij plan drugiemu rodzicowi')) + '</button>' +
      '<p class="qc-share__note">' + esc(S.o.member
        ? PT('page.trip.share_note_member', 'Link otworzy pełny plan bez zakładania konta przez 3 dni. Bez Twojego e-maila i bez danych dzieci.')
        : PT('page.trip.share_note', 'Wyślemy listę przystanków i link do trasy. Bez Twojego e-maila i bez danych dzieci.')) + '</p>' +
      '<div class="qc-share__fb" hidden><label class="qc-share__lbl" for="qcShareTxt">' + esc(PT('page.trip.share_copy_lbl', 'Skopiuj i wyślij')) + '</label>' +
      '<textarea id="qcShareTxt" class="qc-share__txt" rows="6" readonly></textarea></div></div>';
  }
  function doShare(btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    var linkP = S.o.planLink ? Promise.resolve().then(S.o.planLink).catch(function () { return location.href; }) : Promise.resolve(location.href);
    linkP.then(function (url) {
      btn.disabled = false;
      var text = shareText(), title = PT('page.trip.share_title', 'Plan dnia: {city}', { city: S.o.cityName || '' });
      if (navigator.share) {
        return navigator.share({ title: title, text: text, url: url }).catch(function (e) {
          if (e && e.name === 'AbortError') return;   // rodzic zamknął okno udostępniania
          fallback(btn, text + '\n' + url);
        });
      }
      fallback(btn, text + '\n' + url);
    });
  }
  function fallback(btn, all) {
    var box = btn.parentNode, fb = $('.qc-share__fb', box), ta = $('textarea', box);
    if (ta) ta.value = all;
    var done = function () {
      var old = btn.getAttribute('data-label') || btn.innerHTML;
      btn.setAttribute('data-label', old);
      btn.textContent = U('btn.copied', 'Skopiowano!');
      setTimeout(function () { btn.innerHTML = old; }, 1800);
    };
    if (fb) fb.hidden = false;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(all).then(done, function () { if (ta) ta.select(); });
    else if (ta) ta.select();
  }

  // ══════════ I-17 · PLAN NA KARTCE ══════════
  function printHtml() {
    var list = planStops(), o = S.o, city = o.cityName || '';
    var verify = PT('page.trip.print_verify', 'sprawdź na miejscu');
    var h = '<section class="qp-page">';
    h += '<header class="qp-head"><div class="qp-head__txt"><p class="qp-logo">QUOLINO<span>.</span>COM</p>' +
         '<h1 class="qp-title">' + esc(city) + '</h1>' +
         '<p class="qp-sub">' + esc(PT('page.trip.print_sub', 'Plan dnia · {n} przystanków', { n: list.length })) + '</p>' +
         '<p class="qp-date">' + esc(PT('page.trip.print_date', 'Data:')) + ' <span class="qp-line"></span></p></div>' +
         '<figure class="qp-qr"><div class="qp-qr__code" id="qpQr"></div><figcaption>' + esc(PT('page.trip.print_qr', 'Trasa w telefonie')) + '</figcaption></figure></header>';
    h += '<ol class="qp-stops">';
    list.forEach(function (s) {
      h += '<li><span class="qp-no">' + pad(s.num) + '</span><div class="qp-stop">' +
           '<p class="qp-stop__name">' + (s.time ? '<span class="qp-time">' + esc(s.time) + '</span> ' : '') + esc(s.name || '') + '</p>' +
           (s.hours ? '<p class="qp-stop__hrs">' + esc(U('label.hours', 'Godziny')) + ': ' + esc(s.hours) + (s.hoursUnverified ? ' · ' + esc(verify) : '') + '</p>' : '') +
           '</div><span class="qp-tick" aria-hidden="true"></span></li>';
    });
    h += '</ol>';
    h += '<p class="qp-foot">' + esc(PT('page.trip.print_foot', 'Godziny otwarcia mogą się zmienić — w razie wątpliwości sprawdź na miejscu.')) + '</p>';
    var em = o.emergency || [];
    if (em.length) {
      var TYP = { pharmacy: ['emerg.pharmacy', 'Apteka'], toilet: ['emerg.toilet', 'Toalety'], playground: ['emerg.playground', 'Plac zabaw'], hospital: ['emerg.hospital', 'Szpital'] };
      h += '<h2 class="qp-h2">' + esc(U('tab.emergency', 'Pomoc w pobliżu')) + '</h2><ul class="qp-help">';
      em.forEach(function (e) {
        var typ = TYP[e.type], head = typ ? U(typ[0], typ[1]) : (e.label || '');
        h += '<li><b>' + esc(head) + '</b>' + (e.label && e.label !== head ? ' — ' + esc(e.label) : '') + (e.description ? '<br>' + esc(e.description) : '') + '</li>';
      });
      h += '</ul>';
    }
    var ph = (o.phrases || []).slice(0, 8);
    if (ph.length) {
      h += '<h2 class="qp-h2">' + esc(U('label.phrases', 'Rozmówki')) + '</h2><dl class="qp-phr">';
      ph.forEach(function (p) { h += '<div><dt>' + esc(p.phrase_local || '') + '</dt><dd>' + esc(p.phrase_user || '') + '</dd></div>'; });
      h += '</dl>';
    }
    h += '</section>';

    var tasks = list.filter(function (s) { return s.mission || s.photo; });
    if (tasks.length) {
      h += '<section class="qp-page qp-kid"><header class="qp-kid__head"><p class="qp-logo">QUOLINO<span>.</span>COM</p>' +
           '<h1 class="qp-title">' + esc(PT('page.trip.print_kid_title', 'Karta misji: {city}', { city: city })) + '</h1>' +
           '<p class="qp-sub">' + esc(PT('page.trip.print_kid_sub', 'Odhacz kratkę po każdej misji. W pustym polu wklej naklejkę albo narysuj, co znalazłeś.')) + '</p>' +
           '<p class="qp-date">' + esc(PT('page.trip.print_kid_name', 'Odkrywca:')) + ' <span class="qp-line"></span></p></header><ol class="qp-tasks">';
      tasks.forEach(function (s) {
        h += '<li><span class="qp-box" aria-hidden="true"></span><div class="qp-task"><p class="qp-stop__name"><span class="qp-no qp-no--sm">' + pad(s.num) + '</span> ' + esc(s.name || '') + '</p>' +
             (s.mission ? '<p class="qp-task__txt">' + esc(s.mission) + '</p>' : '') +
             (s.photo ? '<p class="qp-task__txt"><b>' + esc(U('label.photo_task', 'Zadanie foto')) + ':</b> ' + esc(s.photo) + '</p>' : '') +
             '</div><span class="qp-stk" aria-hidden="true"></span></li>';
      });
      h += '</ol></section>';
    }
    return h;
  }
  function printUrl() {
    var c = document.querySelector('link[rel="canonical"]');
    return c && c.href ? c.href : location.origin + location.pathname;
  }
  function buildPrint() {
    if (!S.o) return null;
    var box = document.getElementById('qcPrintPlan');
    if (!box) { box = document.createElement('div'); box.id = 'qcPrintPlan'; box.setAttribute('aria-hidden', 'true'); document.body.appendChild(box); }
    box.innerHTML = printHtml();
    var q = document.getElementById('qpQr');
    if (q && typeof window.QRCode === 'function') {
      try { new window.QRCode(q, { text: printUrl(), width: 240, height: 240, colorDark: '#000000', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M }); }
      catch (e) { q.parentNode.style.display = 'none'; }
    } else if (q) q.parentNode.style.display = 'none';
    return box;
  }
  function printable() { return S.o && S.root && !isKid() && !document.body.classList.contains('qk-printing'); }
  function onBeforePrint() { if (printable() && buildPrint()) document.body.classList.add('qc-print-plan'); }
  function onAfterPrint() { document.body.classList.remove('qc-print-plan'); }
  function printHtmlBtn() {
    return '<div class="qc-print"><button type="button" class="qc-btn qc-btn--sm" data-tt="print">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg> ' +
      esc(PT('page.trip.print_btn', 'Drukuj plan dnia')) + '</button>' +
      '<p class="qc-share__note">' + esc(PT('page.trip.print_note', 'Kartka A4 z planem i karta misji dla dziecka. W oknie drukowania możesz też wybrać „Zapisz jako PDF”.')) + '</p></div>';
  }

  // ══════════ I-16 · PRZY KOLACJI ══════════
  function albumList() { var l = jGet(K_ALBUM); return Array.isArray(l) ? l : []; }
  function dinnerHtml(note) {
    return '<section class="qc-dinner" aria-labelledby="qcDinnerT">' +
      '<h3 class="qc-dinner__title" id="qcDinnerT">' + esc(PT('page.trip.dinner_title', 'Przy kolacji')) + '</h3>' +
      '<p class="qc-dinner__lead">' + esc(PT('page.trip.dinner_lead', 'Trzy pytania na rozmowę przy stole:')) + '</p>' +
      '<ol class="qc-dinner__qs"><li>' + esc(PT('page.trip.dinner_q1', 'Co było najdziwniejsze?')) + '</li>' +
      '<li>' + esc(PT('page.trip.dinner_q2', 'Którą misję zrobilibyście jeszcze raz?')) + '</li>' +
      '<li>' + esc(PT('page.trip.dinner_q3', 'Co Quo powinien zobaczyć następnym razem?')) + '</li></ol>' +
      '<label class="qc-dinner__lbl" for="qcDinnerNote">' + esc(PT('page.trip.dinner_note', 'Zapiszcie odpowiedź do albumu')) + '</label>' +
      '<textarea id="qcDinnerNote" class="qc-dinner__txt" rows="3" maxlength="600">' + esc(note || '') + '</textarea>' +
      '<div class="qc-dinner__acts"><button type="button" class="qc-btn qc-btn--sm" data-tt="dinner">' + esc(PT('page.trip.dinner_save', 'Zapisz w albumie')) + '</button>' +
      '<span class="qc-dinner__ok" role="status"></span></div>' +
      '<p class="qc-dinner__priv">' + esc(PT('page.trip.dinner_priv', 'Notatka zostaje tylko na tym telefonie, w albumie w panelu rodzica.')) + '</p></section>';
  }
  function saveDinner(btn) {
    var ta = document.getElementById('qcDinnerNote'), ok = $('.qc-dinner__ok');
    if (!ta) return;
    var text = String(ta.value || '').trim().slice(0, 600), list = albumList(), o = S.o, c = o.city || {}, i = -1;
    list.forEach(function (e, j) { if (e && e.slug === o.slug) i = j; });
    if (i < 0) {
      if (!text) return;
      var hero = c.hero_image ? '/media/tours/' + c.hero_image : (c.country && c.slug ? '/media/tours/quolino-' + c.country + '-' + c.slug : '');
      list.push({ slug: o.slug, city: o.cityName || o.slug, country: c.country || '', region: c.region_slug || c.region || '', hero: hero,
                  pieces: $$('.qc-stop[data-collectable]').length, date: today(), first: today(), nick: '', pose: 1, color: 0, from: 'dinner' });
      i = list.length - 1;
    }
    if (text) { list[i].note = text; list[i].note_date = today(); } else { delete list[i].note; delete list[i].note_date; }
    lsSet(K_ALBUM, JSON.stringify(list));
    if (ok) { ok.textContent = text ? PT('page.trip.dinner_saved', 'Zapisane w albumie.') : PT('page.trip.dinner_cleared', 'Notatka usunięta.'); setTimeout(function () { ok.textContent = ''; }, 3000); }
  }
  function mountDinner() {
    if (S.o.locked) return;
    var stops = $$('#trasa > .qc-stop'), last = stops[stops.length - 1], body = last && $('.qc-stop__body', last);
    if (!body || $('.qc-dinner', body)) return;
    var mine = albumList().filter(function (e) { return e && e.slug === S.o.slug; })[0];
    var wrap = document.createElement('div');
    wrap.innerHTML = dinnerHtml(mine && mine.note);
    var go = $('.qc-go-next', body);
    body.insertBefore(wrap.firstChild, go || null);
  }

  // ══════════ MONTAŻ (po każdym renderOverview) ══════════
  function mount(box, opts) {
    S.o = opts || {};
    S.root = document.getElementById('city');
    if (!box || !S.root) return;
    if (!S.bound) {
      S.bound = true;
      wlBind();
      window.addEventListener('beforeprint', onBeforePrint);
      window.addEventListener('afterprint', onAfterPrint);
      document.addEventListener('click', function (e) {
        var b = e.target.closest('[data-tt],[data-dm],[data-dm-help]');
        if (!b) return;
        if (b.hasAttribute('data-dm-help')) { e.preventDefault(); if (window.QTrip) window.QTrip.go('#awaryjne'); return; }
        if (b.hasAttribute('data-dm')) { dmApply(b.getAttribute('data-dm'), true); return; }
        var a = b.getAttribute('data-tt');
        if (a === 'share') doShare(b);
        else if (a === 'print') { if (buildPrint()) { document.body.classList.add('qc-print-plan'); window.print(); setTimeout(onAfterPrint, 1500); } }
        else if (a === 'dinner') saveDinner(b);
      });
      // token planu (RPC) pobieramy już przy dotknięciu przycisku — okno udostępniania musi wyjść z tego samego gestu
      document.addEventListener('pointerdown', function (e) {
        if (e.target.closest && e.target.closest('[data-tt="share"]') && S.o.planWarm) { try { S.o.planWarm(); } catch (x) {} }
      }, { passive: true });
      document.addEventListener('change', function (e) {
        if (e.target.closest && e.target.closest('[data-wl]')) wlSet(e.target.checked);
      });
    }
    // żetony dnia nad listą przystanków
    var list = $('.qc-ov__list', box);
    if (list && !$('.qc-dm', box)) {
      var d = document.createElement('div'); d.innerHTML = dmHtml();
      list.parentNode.insertBefore(d.firstChild, list);
    }
    // przełącznik ekranu, plan dla drugiego rodzica, druk — pod przyciskiem „Zaczynamy”
    if (!$('.qc-tools', box)) {
      var t = document.createElement('div');
      t.className = 'qc-tools';
      t.innerHTML = wlHtml() + shareHtml() + printHtmlBtn();
      box.appendChild(t);
    }
    mountDinner();
    dmApply(dmLoad(), false);
    wlPaint();
  }

  window.QTripTools = { mount: mount, print: function () { return buildPrint(); } };
})();
