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
      types: { closed: 'Closed', wrong_hours: 'Opening hours', wrong_price: 'Price', wrong_address: 'Address / access', other: 'Other' } },
    de: {"btn": "Stimmt etwas nicht? Melden", "title": "Was stimmt nicht?", "send": "Senden", "cancel": "Abbrechen", "ph": "Z. B. Museum montags geschlossen, Eintritt kostet 8 €…", "ok": "Danke! Wir prüfen und korrigieren es.", "err": "Senden fehlgeschlagen. Bitte gleich noch einmal versuchen.", "types": {"closed": "Geschlossen", "wrong_hours": "Öffnungszeiten", "wrong_price": "Preis", "wrong_address": "Adresse / Zugang", "other": "Sonstiges"}},
    it: {"btn": "Qualcosa non torna? Segnalalo", "title": "Cosa non torna?", "send": "Invia", "cancel": "Annulla", "ph": "Es. il museo è chiuso il lunedì, il biglietto costa 8 €…", "ok": "Grazie! Controlleremo e correggeremo.", "err": "Invio non riuscito. Riprova tra poco.", "types": {"closed": "Chiuso", "wrong_hours": "Orari", "wrong_price": "Prezzo", "wrong_address": "Indirizzo / accesso", "other": "Altro"}},
    cs: {"btn": "Něco nesedí? Nahlaste to", "title": "Co nesedí?", "send": "Odeslat", "cancel": "Zrušit", "ph": "Např. muzeum je v pondělí zavřené, vstupné stojí 8 €…", "ok": "Děkujeme! Prověříme a opravíme.", "err": "Odeslání se nezdařilo. Zkuste to za chvíli.", "types": {"closed": "Zavřeno", "wrong_hours": "Otevírací doba", "wrong_price": "Cena", "wrong_address": "Adresa / přístup", "other": "Jiné"}},
    da: {"btn": "Er noget forkert? Giv besked", "title": "Hvad er forkert?", "send": "Send", "cancel": "Annuller", "ph": "F.eks. museet har lukket om mandagen, billetten koster 8 €…", "ok": "Tak! Vi tjekker og retter det.", "err": "Kunne ikke sende. Prøv igen om lidt.", "types": {"closed": "Lukket", "wrong_hours": "Åbningstider", "wrong_price": "Pris", "wrong_address": "Adresse / adgang", "other": "Andet"}},
    es: {"btn": "¿Algo no cuadra? Avísanos", "title": "¿Qué no cuadra?", "send": "Enviar", "cancel": "Cancelar", "ph": "P. ej., el museo cierra los lunes, la entrada cuesta 8 €…", "ok": "¡Gracias! Lo revisaremos y corregiremos.", "err": "No se pudo enviar. Inténtalo de nuevo en un momento.", "types": {"closed": "Cerrado", "wrong_hours": "Horario", "wrong_price": "Precio", "wrong_address": "Dirección / acceso", "other": "Otro"}},
    fr: {"btn": "Une erreur ? Signalez-la", "title": "Qu’est-ce qui ne va pas ?", "send": "Envoyer", "cancel": "Annuler", "ph": "Ex. : le musée est fermé le lundi, l’entrée coûte 8 €…", "ok": "Merci ! Nous allons vérifier et corriger.", "err": "Envoi impossible. Réessayez dans un instant.", "types": {"closed": "Fermé", "wrong_hours": "Horaires", "wrong_price": "Prix", "wrong_address": "Adresse / accès", "other": "Autre"}},
    hr: {"btn": "Nešto nije u redu? Prijavite", "title": "Što nije u redu?", "send": "Pošalji", "cancel": "Odustani", "ph": "Npr. muzej je ponedjeljkom zatvoren, ulaznica stoji 8 €…", "ok": "Hvala! Provjerit ćemo i ispraviti.", "err": "Slanje nije uspjelo. Pokušajte ponovno za trenutak.", "types": {"closed": "Zatvoreno", "wrong_hours": "Radno vrijeme", "wrong_price": "Cijena", "wrong_address": "Adresa / pristup", "other": "Ostalo"}},
    hu: {"btn": "Valami nem stimmel? Jelezd", "title": "Mi nem stimmel?", "send": "Küldés", "cancel": "Mégse", "ph": "Pl. a múzeum hétfőn zárva van, a jegy 8 €…", "ok": "Köszönjük! Ellenőrizzük és javítjuk.", "err": "Nem sikerült elküldeni. Próbáld újra egy kicsit később.", "types": {"closed": "Zárva", "wrong_hours": "Nyitvatartás", "wrong_price": "Ár", "wrong_address": "Cím / megközelítés", "other": "Egyéb"}},
    nl: {"btn": "Klopt er iets niet? Meld het", "title": "Wat klopt er niet?", "send": "Versturen", "cancel": "Annuleren", "ph": "Bijv. het museum is op maandag dicht, een kaartje kost € 8…", "ok": "Bedankt! We controleren en verbeteren het.", "err": "Versturen mislukt. Probeer het zo opnieuw.", "types": {"closed": "Gesloten", "wrong_hours": "Openingstijden", "wrong_price": "Prijs", "wrong_address": "Adres / bereikbaarheid", "other": "Anders"}},
    no: {"btn": "Er noe feil? Meld fra", "title": "Hva er feil?", "send": "Send", "cancel": "Avbryt", "ph": "F.eks. museet er stengt på mandager, billetten koster 8 €…", "ok": "Takk! Vi sjekker og retter det.", "err": "Kunne ikke sende. Prøv igjen om litt.", "types": {"closed": "Stengt", "wrong_hours": "Åpningstider", "wrong_price": "Pris", "wrong_address": "Adresse / adkomst", "other": "Annet"}},
    pt: {"btn": "Algo errado? Avise-nos", "title": "O que está errado?", "send": "Enviar", "cancel": "Cancelar", "ph": "Ex.: o museu fecha às segundas, o bilhete custa 8 €…", "ok": "Obrigado! Vamos verificar e corrigir.", "err": "Não foi possível enviar. Tente novamente daqui a pouco.", "types": {"closed": "Fechado", "wrong_hours": "Horário", "wrong_price": "Preço", "wrong_address": "Morada / acesso", "other": "Outro"}},
    ro: {"btn": "Ceva nu e corect? Semnalează", "title": "Ce nu este corect?", "send": "Trimite", "cancel": "Anulează", "ph": "De ex. muzeul e închis lunea, biletul costă 8 €…", "ok": "Mulțumim! Vom verifica și corecta.", "err": "Nu s-a putut trimite. Încercați din nou peste puțin timp.", "types": {"closed": "Închis", "wrong_hours": "Program", "wrong_price": "Preț", "wrong_address": "Adresă / acces", "other": "Altceva"}},
    sk: {"btn": "Niečo nesedí? Nahláste to", "title": "Čo nesedí?", "send": "Odoslať", "cancel": "Zrušiť", "ph": "Napr. múzeum je v pondelok zatvorené, vstupné stojí 8 €…", "ok": "Ďakujeme! Preveríme a opravíme.", "err": "Odoslanie sa nepodarilo. Skúste to o chvíľu.", "types": {"closed": "Zatvorené", "wrong_hours": "Otváracie hodiny", "wrong_price": "Cena", "wrong_address": "Adresa / prístup", "other": "Iné"}},
    sv: {"btn": "Stämmer något inte? Rapportera", "title": "Vad stämmer inte?", "send": "Skicka", "cancel": "Avbryt", "ph": "T.ex. museet är stängt på måndagar, biljetten kostar 8 €…", "ok": "Tack! Vi kontrollerar och rättar.", "err": "Kunde inte skicka. Försök igen om en stund.", "types": {"closed": "Stängt", "wrong_hours": "Öppettider", "wrong_price": "Pris", "wrong_address": "Adress / tillgänglighet", "other": "Annat"}},
    uk: {"btn": "Щось не так? Повідомте", "title": "Що не так?", "send": "Надіслати", "cancel": "Скасувати", "ph": "Напр. музей зачинений у понеділок, квиток коштує 8 €…", "ok": "Дякуємо! Перевіримо й виправимо.", "err": "Не вдалося надіслати. Спробуйте трохи згодом.", "types": {"closed": "Зачинено", "wrong_hours": "Години роботи", "wrong_price": "Ціна", "wrong_address": "Адреса / доїзд", "other": "Інше"}}
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
  var API = window.SB_URL || 'https://api.quolino.com/rest/v1';
  var KEY = window.SB_KEY || null;
  if (!KEY) { var m = (document.documentElement.innerHTML.match(/SB_KEY\s*=\s*'([^']+)'/) || [])[1]; KEY = m || null; }
  function city() { return new URLSearchParams(location.search).get('c') || window.citySlug || document.body.getAttribute('data-city'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // style formularza: styles.css, sekcja „Co się nie zgadza?” (bez wstrzykiwanego <style>)

  // Quo w zgłoszeniu (ikony z #quo-ikony, JP 2026-10-25): lupa → notes po wysłaniu, zmięta koperta przy błędzie
  function quo(slug) {
    return '<img class="qr-quo" src="/media/icons/quo-' + slug + '-256.webp" srcset="/media/icons/quo-' + slug + '-256.webp 1x, /media/icons/quo-' + slug +
      '-512.webp 2x" width="104" height="104" alt="" decoding="async" loading="lazy">';
  }
  function setQuo(f, slug) {
    var q = f.querySelector('.qr-quo'); if (!q) return;
    q.src = '/media/icons/quo-' + slug + '-256.webp'; q.srcset = '/media/icons/quo-' + slug + '-256.webp 1x, /media/icons/quo-' + slug + '-512.webp 2x';
  }

  function form(stop, btn) {
    var L = t(), num = parseInt(stop.getAttribute('data-stop-num'), 10);
    var f = document.createElement('div'); f.className = 'qr-form';
    var types = Object.keys(L.types).map(function (k, i) {
      return '<label><input type="radio" name="qr-type-' + num + '" value="' + k + '"' + (k === 'other' ? ' checked' : '') + '>' + esc(L.types[k]) + '</label>';
    }).join('');
    f.innerHTML = quo('zglos') + '<b>' + esc(L.title) + '</b><div class="qr-types">' + types + '</div>' +
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
      send.disabled = true; setQuo(f, 'zglos');
      var h = { 'Content-Type': 'application/json' };
      if (KEY) { h.apikey = KEY; h.Authorization = 'Bearer ' + KEY; }
      fetch(API + '/rpc/report_issue', {
        method: 'POST', headers: h,
        body: JSON.stringify({ p_city: city(), p_stop: num, p_type: type, p_message: ta.value.trim(), p_lang: lang(), p_client: client() })
      }).then(function (r) {
        if (r.ok) { f.innerHTML = quo('zgloszenie-dzieki') + '<span class="qr-msg">' + esc(L.ok) + '</span>'; return; }
        return r.json().catch(function () { return null; }).then(function (j) { throw new Error(j && j.message && lang() === 'pl' ? j.message : L.err); });
      }).catch(function (e) { setQuo(f, 'blad-wysylki'); msg.textContent = e.message || L.err; send.disabled = false; });
    });
  }

  function decorate() {
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
