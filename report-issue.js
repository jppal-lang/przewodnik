/* ============================================================
   „Zgłoś błąd” przy każdym przystanku (decyzja JP 2026-10-11).
   Zgłoszenie → RPC report_issue (limit: 5 dziennie z urządzenia) → Hermes w wątku miasta.
   Bez e-maili i danych osobowych: losowy identyfikator urządzenia w localStorage, jak przy ocenach.
   W podglądzie szkicu (?draft=) nie działa.
   ============================================================ */
(function () {
  'use strict';
  if (/[?&]draft=/.test(location.search)) return;
  var T = {
    pl: { btn: 'Coś się nie zgadza? Zgłoś', title: 'Co się nie zgadza?', send: 'Wyślij', cancel: 'Anuluj',
      ph: 'Np. muzeum zamknięte w poniedziałki, bilet kosztuje 8 €…', ok: 'Dziękujemy! Sprawdzimy i poprawimy.',
      err: 'Nie udało się wysłać. Spróbuj za chwilę.',
      types: { closed: 'Zamknięte', wrong_hours: 'Godziny', wrong_price: 'Cena', wrong_address: 'Adres / dojście', other: 'Inne' } },
    en: { btn: 'Something wrong? Report it', title: 'What is wrong?', send: 'Send', cancel: 'Cancel',
      ph: 'E.g. the museum is closed on Mondays, the ticket costs €8…', ok: 'Thank you! We will check and fix it.',
      err: 'Could not send. Please try again shortly.',
      types: { closed: 'Closed', wrong_hours: 'Opening hours', wrong_price: 'Price', wrong_address: 'Address / access', other: 'Other' } }
  };
  function lang() { try { return (window.currentLang || localStorage.getItem('quolino_lang') || 'pl').slice(0, 2); } catch (e) { return 'pl'; } }
  function t() { return T[lang()] || T.en; }
  function client() {
    try {
      var id = localStorage.getItem('quolino_client');
      if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : null); if (id) localStorage.setItem('quolino_client', id); }
      return id;
    } catch (e) { return null; }
  }
  // konfiguracja strony jest w zamkniętym zakresie city.html — bierzemy ją z dokumentu, z bezpiecznym zapasem
  var API = window.SB_URL || 'https://quolino-api.srv1984679.hstgr.cloud/rest/v1';
  var KEY = window.SB_KEY || null;
  if (!KEY) { var m = (document.documentElement.innerHTML.match(/SB_KEY\s*=\s*'([^']+)'/) || [])[1]; KEY = m || null; }
  function city() { return new URLSearchParams(location.search).get('c') || window.citySlug || document.body.getAttribute('data-city'); }
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function css() {
    if (document.getElementById('qr-css')) return;
    var s = document.createElement('style'); s.id = 'qr-css';
    s.textContent = '.qr-open{appearance:none;border:0;background:none;padding:6px 0;margin-top:10px;cursor:pointer;' +
      'font:600 13px Archivo,system-ui,sans-serif;color:var(--muted,#5D6B82);text-decoration:underline;text-underline-offset:3px}' +
      '.qr-form{margin-top:10px;padding:12px;border:1px solid var(--rule,#D3DDEA);border-radius:12px;background:var(--card,#fff)}' +
      '.qr-form b{display:block;margin-bottom:8px;font:800 14px Archivo,system-ui,sans-serif}' +
      '.qr-types{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}' +
      '.qr-types label{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border:1px solid var(--rule,#D3DDEA);' +
      'border-radius:999px;font-size:13px;cursor:pointer}' +
      '.qr-types input{accent-color:var(--blu,#0B4EA2)}' +
      '.qr-form textarea{width:100%;box-sizing:border-box;min-height:70px;padding:8px;border:1px solid var(--rule,#D3DDEA);' +
      'border-radius:8px;font:14px/1.4 system-ui,sans-serif;resize:vertical}' +
      '.qr-row{display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap}' +
      '.qr-row button{appearance:none;border:2px solid var(--ink,#0E1A2B);border-radius:10px;padding:6px 14px;' +
      'font:700 14px Archivo,system-ui,sans-serif;cursor:pointer;background:var(--ink,#0E1A2B);color:#fff}' +
      '.qr-row button.qr-x{background:#fff;color:var(--ink,#0E1A2B)}' +
      '.qr-msg{font-size:13px;color:var(--muted,#5D6B82)}';
    document.head.appendChild(s);
  }

  function form(stop, btn) {
    var L = t(), num = parseInt(stop.getAttribute('data-stop-num'), 10);
    var f = document.createElement('div'); f.className = 'qr-form';
    var types = Object.keys(L.types).map(function (k, i) {
      return '<label><input type="radio" name="qr-type-' + num + '" value="' + k + '"' + (k === 'other' ? ' checked' : '') + '>' + esc(L.types[k]) + '</label>';
    }).join('');
    f.innerHTML = '<b>' + esc(L.title) + '</b><div class="qr-types">' + types + '</div>' +
      '<textarea maxlength="1000" placeholder="' + esc(L.ph) + '"></textarea>' +
      '<div class="qr-row"><button type="button" class="qr-send">' + esc(L.send) + '</button>' +
      '<button type="button" class="qr-x">' + esc(L.cancel) + '</button><span class="qr-msg" aria-live="polite"></span></div>';
    btn.replaceWith(f);
    var ta = f.querySelector('textarea'); ta.focus();
    f.querySelector('.qr-x').addEventListener('click', function () { f.replaceWith(btn); });
    f.querySelector('.qr-send').addEventListener('click', function () {
      var msg = f.querySelector('.qr-msg'), send = f.querySelector('.qr-send');
      var type = (f.querySelector('input[type=radio]:checked') || {}).value || 'other';
      if (ta.value.trim().length < 5) { ta.focus(); return; }
      send.disabled = true;
      var h = { 'Content-Type': 'application/json' };
      if (KEY) { h.apikey = KEY; h.Authorization = 'Bearer ' + KEY; }
      fetch(API + '/rpc/report_issue', {
        method: 'POST', headers: h,
        body: JSON.stringify({ p_city: city(), p_stop: num, p_type: type, p_message: ta.value.trim(), p_lang: lang(), p_client: client() })
      }).then(function (r) {
        if (r.ok) { f.innerHTML = '<span class="qr-msg">' + esc(L.ok) + '</span>'; return; }
        return r.json().catch(function () { return null; }).then(function (j) { throw new Error(j && j.message ? j.message : L.err); });
      }).catch(function (e) { msg.textContent = e.message || L.err; send.disabled = false; });
    });
  }

  function decorate() {
    css();
    document.querySelectorAll('.qc-stop').forEach(function (stop) {
      var body = stop.querySelector('.qc-stop__body');
      if (!body || body.querySelector('.qr-open, .qr-form')) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'qr-open'; b.textContent = t().btn;
      b.addEventListener('click', function (e) { e.preventDefault(); form(stop, b); });
      body.appendChild(b);
    });
  }
  // przystanki rysuje skrypt strony (także po zmianie języka) — dokładamy przycisk po każdym rysowaniu
  var pending = false;
  new MutationObserver(function () {
    if (pending) return; pending = true;
    setTimeout(function () { pending = false; if (document.querySelector('.qc-stop')) decorate(); }, 150);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
