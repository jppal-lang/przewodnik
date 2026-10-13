/* ============================================================
   „Jak wam poszło?” — opinia rodziny na końcu wycieczki (decyzja JP 2026-10-11).
   Ocena 1–5 + uwagi → RPC rate_trip → wątek miasta na Discordzie (Hermes: czy jest tu coś do poprawienia).
   Bez danych osobowych: ten sam losowy identyfikator urządzenia co przy zgłoszeniach. W podglądzie szkicu nie działa.
   ============================================================ */
(function () {
  'use strict';
  if (/[?&]draft=/.test(location.search)) return;
  var T = {
    pl: { title: 'Jak wam poszło?', sub: 'Wasza opinia pomaga nam poprawiać trasę dla kolejnych rodzin.',
      ph: 'Co było super? Co poprawić? (opcjonalnie)', send: 'Wyślij', ok: 'Dziękujemy! Przeczytamy każdą opinię.',
      again: 'Zmień opinię', err: 'Nie udało się wysłać. Spróbuj za chwilę.', pick: 'Wybierz ocenę',
      stars: ['Słabo', 'Tak sobie', 'Dobrze', 'Bardzo dobrze', 'Rewelacja'] },
    en: { title: 'How did it go?', sub: 'Your feedback helps us improve the route for the next families.',
      ph: 'What was great? What should we improve? (optional)', send: 'Send', ok: 'Thank you! We read every review.',
      again: 'Change your review', err: 'Could not send. Please try again shortly.', pick: 'Choose a rating',
      stars: ['Poor', 'So-so', 'Good', 'Very good', 'Excellent'] }
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
  var API = window.SB_URL || 'https://api.quolino.com/rest/v1';
  var KEY = window.SB_KEY || null;
  if (!KEY) { var m = (document.documentElement.innerHTML.match(/SB_KEY\s*=\s*'([^']+)'/) || [])[1]; KEY = m || null; }
  function city() { return (window.QSSR && window.QSSR.slug) || new URLSearchParams(location.search).get('c') || window.citySlug; }
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function done(c) { try { return localStorage.getItem('quolino_rated_' + c); } catch (e) { return null; } }
  function mark(c, s) { try { localStorage.setItem('quolino_rated_' + c, String(s)); } catch (e) {} }

  function css() {
    if (document.getElementById('qo-css')) return;
    var s = document.createElement('style'); s.id = 'qo-css';
    s.textContent = '.qo-box{margin:28px 0 8px;padding:18px;border:2px solid var(--ink,#0E1A2B);border-radius:16px;background:var(--card,#fff)}' +
      '.qo-box h3{margin:0 0 4px;font:800 20px Archivo,system-ui,sans-serif}' +
      '.qo-box p{margin:0 0 12px;font-size:14px;color:var(--muted,#5D6B82)}' +
      '.qo-stars{display:flex;gap:4px;margin-bottom:6px}' +
      '.qo-stars button{appearance:none;border:0;background:none;padding:2px;font-size:34px;line-height:1;cursor:pointer;color:#C9D2DE}' +
      '.qo-stars button.on{color:#F2A900}' +
      '.qo-lbl{min-height:18px;font:600 13px Archivo,system-ui,sans-serif;color:var(--muted,#5D6B82);margin-bottom:10px}' +
      '.qo-box textarea{width:100%;box-sizing:border-box;min-height:80px;padding:10px;border:1px solid var(--rule,#D3DDEA);' +
      'border-radius:10px;font:15px/1.4 system-ui,sans-serif;resize:vertical}' +
      '.qo-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px}' +
      '.qo-row button{appearance:none;border:2px solid var(--ink,#0E1A2B);border-radius:10px;padding:8px 18px;' +
      'font:700 15px Archivo,system-ui,sans-serif;cursor:pointer;background:var(--ink,#0E1A2B);color:#fff}' +
      '.qo-row button.qo-x{background:#fff;color:var(--ink,#0E1A2B)}' +
      '.qo-msg{font-size:14px;color:var(--muted,#5D6B82)}';
    document.head.appendChild(s);
  }

  function thanks(box, c) {
    var L = t();
    box.innerHTML = '<h3>' + esc(L.title) + '</h3><div class="qo-row"><span class="qo-msg">' + esc(L.ok) + '</span>' +
      '<button type="button" class="qo-x">' + esc(L.again) + '</button></div>';
    box.querySelector('.qo-x').addEventListener('click', function () { build(box, c, true); });
  }

  function build(box, c, force) {
    var L = t();
    if (done(c) && !force) return thanks(box, c);
    var stars = 0;
    box.innerHTML = '<h3>' + esc(L.title) + '</h3><p>' + esc(L.sub) + '</p><div class="qo-stars" role="radiogroup">' +
      [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" role="radio" aria-checked="false" data-n="' + n + '" aria-label="' + n + ' – ' + esc(L.stars[n - 1]) + '">★</button>'; }).join('') +
      '</div><div class="qo-lbl" aria-live="polite"></div><textarea maxlength="500" placeholder="' + esc(L.ph) + '"></textarea>' +
      '<div class="qo-row"><button type="button" class="qo-send">' + esc(L.send) + '</button><span class="qo-msg" aria-live="polite"></span></div>';
    var btns = box.querySelectorAll('.qo-stars button'), lbl = box.querySelector('.qo-lbl');
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        stars = +b.getAttribute('data-n'); lbl.textContent = L.stars[stars - 1];
        btns.forEach(function (x) { var on = +x.getAttribute('data-n') <= stars; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(+x.getAttribute('data-n') === stars)); });
      });
    });
    box.querySelector('.qo-send').addEventListener('click', function () {
      var msg = box.querySelector('.qo-msg'), send = box.querySelector('.qo-send');
      if (!stars) { lbl.textContent = L.pick; return; }
      send.disabled = true;
      var h = { 'Content-Type': 'application/json' };
      if (KEY) { h.apikey = KEY; h.Authorization = 'Bearer ' + KEY; }
      fetch(API + '/rpc/rate_trip', {
        method: 'POST', headers: h,
        body: JSON.stringify({ p_city: c, p_stars: stars, p_comment: box.querySelector('textarea').value.trim() || null, p_lang: lang(), p_client: client() })
      }).then(function (r) {
        if (r.ok) { mark(c, stars); thanks(box, c); return; }
        return r.json().catch(function () { return null; }).then(function (j) { throw new Error(j && j.message ? j.message : L.err); });
      }).catch(function (e) { msg.textContent = e.message || L.err; send.disabled = false; });
    });
  }

  function place() {
    var c = city(), stops = document.querySelectorAll('.qc-stop');
    if (!c || !stops.length) return;
    var last = stops[stops.length - 1], list = last.parentNode, box = document.querySelector('.qo-box');
    if (box && box.getAttribute('data-lang') === lang() && box.previousElementSibling === list) return;
    if (box) box.remove();
    css();
    box = document.createElement('section'); box.className = 'qo-box'; box.setAttribute('data-lang', lang());
    list.parentNode.insertBefore(box, list.nextSibling);
    build(box, c);
  }
  // przystanki rysuje skrypt strony (także po zmianie języka) — ramkę dokładamy po każdym rysowaniu
  var pending = false;
  new MutationObserver(function () {
    if (pending) return; pending = true;
    setTimeout(function () { pending = false; place(); }, 200);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
