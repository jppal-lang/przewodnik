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
      stars: ['Poor', 'So-so', 'Good', 'Very good', 'Excellent'] },
    de: {"title": "Wie war es?", "sub": "Eure Meinung hilft uns, die Route für die nächsten Familien zu verbessern.", "ph": "Was war toll? Was sollen wir verbessern? (optional)", "send": "Senden", "ok": "Danke! Wir lesen jede Bewertung.", "again": "Bewertung ändern", "err": "Senden fehlgeschlagen. Bitte versucht es gleich noch einmal.", "pick": "Bitte Sterne wählen", "stars": ["Schwach", "Geht so", "Gut", "Sehr gut", "Großartig"]},
    it: {"title": "Com’è andata?", "sub": "La vostra opinione ci aiuta a migliorare il percorso per le prossime famiglie.", "ph": "Cosa vi è piaciuto? Cosa possiamo migliorare? (facoltativo)", "send": "Invia", "ok": "Grazie! Leggiamo ogni opinione.", "again": "Modifica la valutazione", "err": "Invio non riuscito. Riprovate tra poco.", "pick": "Scegliete una valutazione", "stars": ["Scarso", "Così così", "Buono", "Molto buono", "Fantastico"]},
    cs: {"title": "Jak se vám to líbilo?", "sub": "Váš názor nám pomáhá zlepšit trasu pro další rodiny.", "ph": "Co bylo skvělé? Co zlepšit? (nepovinné)", "send": "Odeslat", "ok": "Děkujeme! Čteme každé hodnocení.", "again": "Změnit hodnocení", "err": "Odeslání se nezdařilo. Zkuste to za chvíli.", "pick": "Vyberte hodnocení", "stars": ["Slabé", "Ujde to", "Dobré", "Velmi dobré", "Skvělé"]},
    da: {"title": "Hvordan gik det?", "sub": "Jeres mening hjælper os med at gøre ruten bedre for de næste familier.", "ph": "Hvad var godt? Hvad kan vi gøre bedre? (valgfrit)", "send": "Send", "ok": "Tak! Vi læser hver anmeldelse.", "again": "Ret din vurdering", "err": "Kunne ikke sende. Prøv igen om lidt.", "pick": "Vælg en vurdering", "stars": ["Dårlig", "Så som så", "God", "Meget god", "Fremragende"]},
    es: {"title": "¿Qué tal os ha ido?", "sub": "Vuestra opinión nos ayuda a mejorar la ruta para las próximas familias.", "ph": "¿Qué os gustó? ¿Qué podemos mejorar? (opcional)", "send": "Enviar", "ok": "¡Gracias! Leemos todas las opiniones.", "again": "Cambiar la valoración", "err": "No se pudo enviar. Inténtalo de nuevo en un momento.", "pick": "Elige una valoración", "stars": ["Flojo", "Regular", "Bien", "Muy bien", "Excelente"]},
    fr: {"title": "Alors, c’était comment ?", "sub": "Votre avis nous aide à améliorer le parcours pour les prochaines familles.", "ph": "Qu’avez-vous aimé ? Que pouvons-nous améliorer ? (facultatif)", "send": "Envoyer", "ok": "Merci ! Nous lisons chaque avis.", "again": "Modifier mon avis", "err": "Envoi impossible. Réessayez dans un instant.", "pick": "Choisissez une note", "stars": ["Décevant", "Moyen", "Bien", "Très bien", "Génial"]},
    hr: {"title": "Kako je prošlo?", "sub": "Vaše mišljenje pomaže nam poboljšati rutu za sljedeće obitelji.", "ph": "Što je bilo super? Što poboljšati? (neobavezno)", "send": "Pošalji", "ok": "Hvala! Čitamo svaku recenziju.", "again": "Promijeni ocjenu", "err": "Slanje nije uspjelo. Pokušajte ponovno za trenutak.", "pick": "Odaberite ocjenu", "stars": ["Slabo", "Može proći", "Dobro", "Vrlo dobro", "Odlično"]},
    hu: {"title": "Milyen volt?", "sub": "A véleményetek segít jobbá tenni az útvonalat a következő családoknak.", "ph": "Mi tetszett? Min javítsunk? (nem kötelező)", "send": "Küldés", "ok": "Köszönjük! Minden véleményt elolvasunk.", "again": "Értékelés módosítása", "err": "Nem sikerült elküldeni. Próbáljátok újra egy kicsit később.", "pick": "Válassz értékelést", "stars": ["Gyenge", "Elmegy", "Jó", "Nagyon jó", "Kiváló"]},
    nl: {"title": "Hoe was het?", "sub": "Jullie mening helpt ons de route te verbeteren voor de volgende gezinnen.", "ph": "Wat was leuk? Wat kan beter? (optioneel)", "send": "Versturen", "ok": "Bedankt! We lezen elke beoordeling.", "again": "Beoordeling wijzigen", "err": "Versturen mislukt. Probeer het zo opnieuw.", "pick": "Kies een beoordeling", "stars": ["Matig", "Gaat wel", "Goed", "Heel goed", "Geweldig"]},
    no: {"title": "Hvordan gikk det?", "sub": "Meningen deres hjelper oss å gjøre ruten bedre for de neste familiene.", "ph": "Hva var bra? Hva kan vi gjøre bedre? (valgfritt)", "send": "Send", "ok": "Takk! Vi leser hver vurdering.", "again": "Endre vurderingen", "err": "Kunne ikke sende. Prøv igjen om litt.", "pick": "Velg en vurdering", "stars": ["Svak", "Sånn passe", "Bra", "Veldig bra", "Fantastisk"]},
    pt: {"title": "Como correu?", "sub": "A vossa opinião ajuda-nos a melhorar o percurso para as próximas famílias.", "ph": "O que foi ótimo? O que devemos melhorar? (opcional)", "send": "Enviar", "ok": "Obrigado! Lemos todas as opiniões.", "again": "Alterar a avaliação", "err": "Não foi possível enviar. Tente novamente daqui a pouco.", "pick": "Escolha uma avaliação", "stars": ["Fraco", "Razoável", "Bom", "Muito bom", "Excelente"]},
    ro: {"title": "Cum a fost?", "sub": "Părerea voastră ne ajută să îmbunătățim traseul pentru următoarele familii.", "ph": "Ce v-a plăcut? Ce să îmbunătățim? (opțional)", "send": "Trimite", "ok": "Mulțumim! Citim fiecare părere.", "again": "Schimbă evaluarea", "err": "Nu s-a putut trimite. Încercați din nou peste puțin timp.", "pick": "Alegeți o notă", "stars": ["Slab", "Așa și așa", "Bine", "Foarte bine", "Excelent"]},
    sk: {"title": "Ako sa vám páčilo?", "sub": "Váš názor nám pomáha zlepšiť trasu pre ďalšie rodiny.", "ph": "Čo bolo super? Čo zlepšiť? (nepovinné)", "send": "Odoslať", "ok": "Ďakujeme! Čítame každé hodnotenie.", "again": "Zmeniť hodnotenie", "err": "Odoslanie sa nepodarilo. Skúste to o chvíľu.", "pick": "Vyberte hodnotenie", "stars": ["Slabé", "Ujde to", "Dobré", "Veľmi dobré", "Skvelé"]},
    sv: {"title": "Hur gick det?", "sub": "Er åsikt hjälper oss att göra rutten bättre för nästa familjer.", "ph": "Vad var bra? Vad kan vi förbättra? (valfritt)", "send": "Skicka", "ok": "Tack! Vi läser varje omdöme.", "again": "Ändra omdömet", "err": "Kunde inte skicka. Försök igen om en stund.", "pick": "Välj ett betyg", "stars": ["Svagt", "Sådär", "Bra", "Mycket bra", "Fantastiskt"]},
    uk: {"title": "Як вам сподобалося?", "sub": "Ваша думка допомагає нам покращувати маршрут для наступних родин.", "ph": "Що було чудово? Що покращити? (необов’язково)", "send": "Надіслати", "ok": "Дякуємо! Ми читаємо кожен відгук.", "again": "Змінити оцінку", "err": "Не вдалося надіслати. Спробуйте трохи згодом.", "pick": "Оберіть оцінку", "stars": ["Слабо", "Так собі", "Добре", "Дуже добре", "Чудово"]}
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
        return r.json().catch(function () { return null; }).then(function (j) { throw new Error(j && j.message && lang() === 'pl' ? j.message : L.err); });
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
