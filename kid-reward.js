/* Quolino — nagrody w widoku dziecka (2026-10-16).
 *
 *  • Awatar na dzień: po wejściu z QR (?view=kid) dziecko wybiera „swojego Quo” (8 póz) i kolor tła,
 *    opcjonalnie nick. Wybór ważny do końca dnia (localStorage qc.kid.avatar), nicki: qc.kid.nicks.
 *  • Obrazek-zagadka: zdjęcie hero miasta zakryte kawałkami. Liczba kawałków = liczba przystanków z misjami,
 *    które rodzic zostawił włączone przed wysłaniem QR (parametr hide=). Każdy zaliczony przystanek
 *    odsłania kawałek, ostatnia misja — cały obrazek.
 *  • Po całości: pobranie obrazka (PNG z ramką „Zdobyte: miasto”, awatarem i datą) i kolorowanka do druku
 *    (gotowy plik <hero>-coloring.webp, jeśli jest; inaczej kontury liczone z hero w przeglądarce).
 *  • Zdobyte miejsce trafia do albumu na tym urządzeniu (qc.album) — panel rodzica (konto.html) go czyta.
 *
 * Bez zależności. Widok dziecka bez komercji: żadnych cen, partnerów, BMC.
 * API: window.QReward.init({ slug, lang, cityName, country, region, hero })
 */
(function () {
  'use strict';

  var POSES = ['05-curious-sitting', '07-ready-to-spring', '08-running', '09-sprint', '11-leaping-forward', '12-high-jump', '13-celebration-jump', '15-gold-medal'];
  var COLORS = ['#0B4EA2', '#C81E36', '#1E7A46', '#FFC629', '#7A4FBF', '#F07F1A', '#0E8C8C', '#E05A9A'];
  var K_AVATAR = 'qc.kid.avatar', K_NICKS = 'qc.kid.nicks', K_ALBUM = 'qc.album';

  // ── słownik (17 języków) ─────────────────────────────
  var RAW = {
    pl: 'Kim dziś jesteś?|Wybierz swojego Quo na dzisiejszą wyprawę.|Twój nick (nie musisz)|Ruszamy!|Zmień|Twój obrazek|{n} z {t} kawałków|Każda zaliczona misja odsłania kawałek obrazka.|Cały obrazek jest Twój!|Pobierz obrazek|Kolorowanka do druku|Zamknij|Nowy kawałek!|Pokoloruj: {city}|Zdobyte: {city}|Drukuj|Pobierz kolorowankę|Odkrywca|Zwiadowca|Biegacz|Sprinter|Skoczek|Akrobata|Wesołek|Mistrz|Przygotowuję kolorowankę…|Dziecko dostanie {n} przystanków z misjami — obrazek podzieli się na {n} kawałków.|Wymyśl ksywkę — nie wpisuj prawdziwego imienia.|Losuj',
    en: 'Who are you today?|Pick your Quo for today\'s adventure.|Your nickname (optional)|Let\'s go!|Change|Your picture|{n} of {t} pieces|Every mission you finish uncovers a piece of the picture.|The whole picture is yours!|Download picture|Colouring page to print|Close|New piece!|Colour in: {city}|Conquered: {city}|Print|Download colouring page|Explorer|Scout|Runner|Sprinter|Jumper|Acrobat|Joker|Champion|Preparing the colouring page…|Your child will get {n} stops with missions — the picture splits into {n} pieces.|Make up a nickname — not your real name.|Random',
    de: 'Wer bist du heute?|Wähle deinen Quo für das heutige Abenteuer.|Dein Spitzname (freiwillig)|Los geht\'s!|Ändern|Dein Bild|{n} von {t} Teilen|Jede erledigte Mission deckt ein Stück des Bildes auf.|Das ganze Bild gehört dir!|Bild herunterladen|Ausmalbild zum Drucken|Schließen|Neues Teil!|Male aus: {city}|Erobert: {city}|Drucken|Ausmalbild herunterladen|Entdecker|Späher|Läufer|Sprinter|Springer|Akrobat|Spaßvogel|Meister|Ausmalbild wird vorbereitet…|Ihr Kind bekommt {n} Stopps mit Missionen — das Bild teilt sich in {n} Teile.|Denk dir einen Spitznamen aus – nicht deinen echten Namen.|Zufall',
    it: 'Chi sei oggi?|Scegli il tuo Quo per l\'avventura di oggi.|Il tuo soprannome (facoltativo)|Si parte!|Cambia|La tua immagine|{n} di {t} pezzi|Ogni missione completata scopre un pezzo dell\'immagine.|L\'immagine intera è tua!|Scarica l\'immagine|Disegno da colorare|Chiudi|Nuovo pezzo!|Colora: {city}|Conquistata: {city}|Stampa|Scarica il disegno|Esploratore|Esploratore curioso|Corridore|Velocista|Saltatore|Acrobata|Burlone|Campione|Preparo il disegno…|Il bambino avrà {n} tappe con missioni — l\'immagine si divide in {n} pezzi.|Inventa un soprannome, non il tuo vero nome.|A caso',
    cs: 'Kým jsi dnes?|Vyber si svého Quo na dnešní výpravu.|Tvoje přezdívka (nemusíš)|Jdeme na to!|Změnit|Tvůj obrázek|{n} z {t} dílků|Každá splněná mise odkryje dílek obrázku.|Celý obrázek je tvůj!|Stáhnout obrázek|Omalovánka k tisku|Zavřít|Nový dílek!|Vybarvi: {city}|Dobyto: {city}|Tisk|Stáhnout omalovánku|Objevitel|Průzkumník|Běžec|Sprinter|Skokan|Akrobat|Vtipálek|Mistr|Připravuji omalovánku…|Dítě dostane {n} zastávek s misemi — obrázek se rozdělí na {n} dílků.|Vymysli si přezdívku – ne své skutečné jméno.|Náhodně',
    da: 'Hvem er du i dag?|Vælg din Quo til dagens eventyr.|Dit kælenavn (frivilligt)|Af sted!|Skift|Dit billede|{n} af {t} brikker|Hver mission, du klarer, afslører en brik af billedet.|Hele billedet er dit!|Hent billedet|Tegning til at farvelægge|Luk|Ny brik!|Farvelæg: {city}|Erobret: {city}|Udskriv|Hent tegningen|Opdager|Spejder|Løber|Sprinter|Springer|Akrobat|Spøgefugl|Mester|Gør tegningen klar…|Barnet får {n} stop med missioner — billedet deles i {n} brikker.|Find på et kælenavn – ikke dit rigtige navn.|Tilfældig',
    es: '¿Quién eres hoy?|Elige tu Quo para la aventura de hoy.|Tu apodo (opcional)|¡Vamos!|Cambiar|Tu imagen|{n} de {t} piezas|Cada misión superada descubre una pieza de la imagen.|¡La imagen entera es tuya!|Descargar imagen|Dibujo para colorear|Cerrar|¡Nueva pieza!|Colorea: {city}|Conquistada: {city}|Imprimir|Descargar dibujo|Explorador|Rastreador|Corredor|Velocista|Saltarín|Acróbata|Bromista|Campeón|Preparando el dibujo…|Tu hijo tendrá {n} paradas con misiones — la imagen se divide en {n} piezas.|Inventa un apodo, no tu nombre real.|Al azar',
    fr: 'Qui es-tu aujourd\'hui ?|Choisis ton Quo pour l\'aventure du jour.|Ton surnom (facultatif)|C\'est parti !|Changer|Ton image|{n} sur {t} morceaux|Chaque mission réussie dévoile un morceau de l\'image.|L\'image entière est à toi !|Télécharger l\'image|Coloriage à imprimer|Fermer|Nouveau morceau !|Colorie : {city}|Conquise : {city}|Imprimer|Télécharger le coloriage|Explorateur|Éclaireur|Coureur|Sprinteur|Sauteur|Acrobate|Farceur|Champion|Préparation du coloriage…|Votre enfant aura {n} étapes avec missions — l\'image se divise en {n} morceaux.|Invente un surnom, pas ton vrai prénom.|Au hasard',
    hr: 'Tko si danas?|Odaberi svog Quoa za današnju pustolovinu.|Tvoj nadimak (ne moraš)|Krećemo!|Promijeni|Tvoja slika|{n} od {t} dijelova|Svaka riješena misija otkriva dio slike.|Cijela slika je tvoja!|Preuzmi sliku|Bojanka za ispis|Zatvori|Novi dio!|Oboji: {city}|Osvojeno: {city}|Ispiši|Preuzmi bojanku|Istraživač|Izviđač|Trkač|Sprinter|Skakač|Akrobat|Šaljivac|Prvak|Pripremam bojanku…|Dijete dobiva {n} stajališta s misijama — slika se dijeli na {n} dijelova.|Smisli nadimak – ne svoje pravo ime.|Nasumično',
    hu: 'Ki vagy ma?|Válaszd ki a Quódat a mai kalandhoz.|A beceneved (nem kötelező)|Indulás!|Csere|A képed|{n} / {t} darab|Minden teljesített küldetés felfed egy darabot a képből.|Az egész kép a tiéd!|Kép letöltése|Kifestő nyomtatáshoz|Bezárás|Új darab!|Színezd ki: {city}|Meghódítva: {city}|Nyomtatás|Kifestő letöltése|Felfedező|Felderítő|Futó|Sprinter|Ugró|Akrobata|Tréfamester|Bajnok|Készül a kifestő…|A gyerek {n} küldetéses megállót kap — a kép {n} darabra oszlik.|Találj ki egy becenevet – ne a valódi neved.|Véletlen',
    nl: 'Wie ben jij vandaag?|Kies je Quo voor het avontuur van vandaag.|Je bijnaam (hoeft niet)|We gaan!|Wijzig|Jouw plaatje|{n} van {t} stukjes|Elke missie die je haalt, laat een stukje van het plaatje zien.|Het hele plaatje is van jou!|Plaatje downloaden|Kleurplaat om te printen|Sluiten|Nieuw stukje!|Kleur in: {city}|Veroverd: {city}|Printen|Kleurplaat downloaden|Ontdekker|Verkenner|Renner|Sprinter|Springer|Acrobaat|Grapjas|Kampioen|Kleurplaat wordt gemaakt…|Je kind krijgt {n} stops met missies — het plaatje wordt in {n} stukjes verdeeld.|Verzin een bijnaam – niet je echte naam.|Willekeurig',
    no: 'Hvem er du i dag?|Velg din Quo til dagens eventyr.|Kallenavnet ditt (frivillig)|Vi drar!|Bytt|Bildet ditt|{n} av {t} biter|Hvert oppdrag du klarer, avslører en bit av bildet.|Hele bildet er ditt!|Last ned bildet|Fargelegging for utskrift|Lukk|Ny bit!|Fargelegg: {city}|Erobret: {city}|Skriv ut|Last ned fargeleggingen|Oppdager|Speider|Løper|Sprinter|Hopper|Akrobat|Spøkefugl|Mester|Lager fargeleggingen…|Barnet får {n} stopp med oppdrag — bildet deles i {n} biter.|Finn på et kallenavn – ikke ditt ekte navn.|Tilfeldig',
    pt: 'Quem és tu hoje?|Escolhe o teu Quo para a aventura de hoje.|A tua alcunha (opcional)|Vamos!|Mudar|A tua imagem|{n} de {t} peças|Cada missão cumprida revela uma peça da imagem.|A imagem inteira é tua!|Descarregar imagem|Desenho para colorir|Fechar|Nova peça!|Pinta: {city}|Conquistada: {city}|Imprimir|Descarregar desenho|Explorador|Batedor|Corredor|Velocista|Saltador|Acrobata|Brincalhão|Campeão|A preparar o desenho…|A criança terá {n} paragens com missões — a imagem divide-se em {n} peças.|Inventa uma alcunha, não o teu nome verdadeiro.|Aleatório',
    ro: 'Cine ești azi?|Alege-ți Quo-ul pentru aventura de azi.|Porecla ta (opțional)|Pornim!|Schimbă|Imaginea ta|{n} din {t} bucăți|Fiecare misiune reușită dezvăluie o bucată din imagine.|Toată imaginea e a ta!|Descarcă imaginea|Planșă de colorat|Închide|Bucată nouă!|Colorează: {city}|Cucerit: {city}|Tipărește|Descarcă planșa|Explorator|Cercetaș|Alergător|Sprinter|Săritor|Acrobat|Glumeț|Campion|Pregătesc planșa…|Copilul va avea {n} opriri cu misiuni — imaginea se împarte în {n} bucăți.|Inventează o poreclă, nu numele tău adevărat.|Aleatoriu',
    sk: 'Kým si dnes?|Vyber si svojho Quo na dnešnú výpravu.|Tvoja prezývka (nemusíš)|Ideme na to!|Zmeniť|Tvoj obrázok|{n} z {t} dielikov|Každá splnená misia odkryje dielik obrázka.|Celý obrázok je tvoj!|Stiahnuť obrázok|Omaľovánka na tlač|Zavrieť|Nový dielik!|Vyfarbi: {city}|Dobyté: {city}|Tlačiť|Stiahnuť omaľovánku|Objaviteľ|Prieskumník|Bežec|Šprintér|Skokan|Akrobat|Vtipkár|Majster|Pripravujem omaľovánku…|Dieťa dostane {n} zastávok s misiami — obrázok sa rozdelí na {n} dielikov.|Vymysli si prezývku – nie svoje skutočné meno.|Náhodne',
    sv: 'Vem är du i dag?|Välj din Quo för dagens äventyr.|Ditt smeknamn (frivilligt)|Nu kör vi!|Byt|Din bild|{n} av {t} bitar|Varje uppdrag du klarar visar en bit av bilden.|Hela bilden är din!|Ladda ner bilden|Målarbild att skriva ut|Stäng|Ny bit!|Färglägg: {city}|Erövrad: {city}|Skriv ut|Ladda ner målarbilden|Upptäckare|Spanare|Löpare|Sprinter|Hoppare|Akrobat|Skämtare|Mästare|Gör målarbilden…|Barnet får {n} stopp med uppdrag — bilden delas i {n} bitar.|Hitta på ett smeknamn – inte ditt riktiga namn.|Slumpa',
    uk: 'Ким ти є сьогодні?|Обери свого Quo для сьогоднішньої мандрівки.|Твій нік (не обов\'язково)|Вирушаємо!|Змінити|Твоя картинка|{n} з {t} шматочків|Кожна виконана місія відкриває шматочок картинки.|Уся картинка — твоя!|Завантажити картинку|Розмальовка для друку|Закрити|Новий шматочок!|Розфарбуй: {city}|Здобуто: {city}|Друкувати|Завантажити розмальовку|Дослідник|Розвідник|Бігун|Спринтер|Стрибун|Акробат|Жартівник|Чемпіон|Готую розмальовку…|Дитина отримає {n} зупинок з місіями — картинка поділиться на {n} шматочків.|Вигадай нік — не своє справжнє ім\'я.|Випадково'
  };
  var KEYS = ['choose', 'choose_sub', 'nick', 'start', 'change', 'picture', 'progress', 'hint', 'done', 'download', 'coloring', 'close', 'new_piece',
    'color_title', 'conquered', 'print', 'download_col', 'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'preparing', 'qr_note', 'nick_hint', 'random'];
  var DICT = {};
  Object.keys(RAW).forEach(function (l) {
    var v = RAW[l].split('|'), d = {};
    KEYS.forEach(function (k, i) { d[k] = v[i]; });
    DICT[l] = d;
  });

  var S = { av: null, lang: 'pl', slug: '', city: '', hero: '', country: '', region: '', total: 0, got: 0, cells: null, groups: null, prevGot: -1, root: null, built: false };

  function t(k, vars) {
    var s = (DICT[S.lang] || DICT.en)[k] || DICT.en[k] || k;
    if (vars) Object.keys(vars).forEach(function (n) { s = s.split('{' + n + '}').join(vars[n]); });
    return s;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* prywatne okno */ } }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function poseUrl(i, size) { return '/media/icons/pose-' + POSES[i % POSES.length] + '-' + (size || 256) + '.webp'; }
  function reduced() { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function isKid() { return S.root && S.root.dataset.view === 'kid'; }
  function kidDevice() { return /[?&]view=kid\b/.test(location.search); }

  // ── awatar ───────────────────────────────────────────
  function avatar() { var a = lsGet(K_AVATAR); return a && a.date === today() ? a : null; }
  function avatarHtml(a, cls) {
    if (!a) return '';
    return '<span class="qk-ava ' + (cls || '') + '" style="--ava:' + esc(COLORS[a.color] || COLORS[0]) + '"><img src="' + poseUrl(a.pose, 128) + '" alt="" width="64" height="64"></span>';
  }

  function openPicker() {
    var prev = lsGet(K_AVATAR) || { pose: 1, color: 0, nick: '' };
    var sel = { pose: prev.pose || 0, color: prev.color || 0 };
    var nicks = (lsGet(K_NICKS) || []).slice(0, 6);
    var dlg = sheet('qk-pick', '<h2 class="qk-sheet__title" id="qkPickT">' + esc(t('choose')) + '</h2>' +
      '<p class="qk-sheet__sub">' + esc(t('choose_sub')) + '</p>' +
      '<div class="qk-poses" role="radiogroup" aria-labelledby="qkPickT">' + POSES.map(function (p, i) {
        return '<button type="button" class="qk-pose" role="radio" aria-checked="' + (i === sel.pose) + '" data-pose="' + i + '">' +
          '<img src="' + poseUrl(i, 256) + '" alt="" width="96" height="96" loading="lazy"><span>' + esc(t('a' + i)) + '</span></button>';
      }).join('') + '</div>' +
      '<div class="qk-colors" role="radiogroup" aria-label="Kolor">' + COLORS.map(function (c, i) {
        return '<button type="button" class="qk-color" role="radio" aria-checked="' + (i === sel.color) + '" data-color="' + i + '" style="--c:' + c + '" aria-label="' + (i + 1) + '"></button>';
      }).join('') + '</div>' +
      '<label class="qk-nick"><span>' + esc(t('nick')) + '</span><span class="qk-nick__row"><input type="text" maxlength="20" autocomplete="off" value="' + esc(prev.nick || '') + '">' +
      '<button type="button" class="qk-dice" data-dice aria-label="' + esc(t('random')) + '" title="' + esc(t('random')) + '">🎲</button></span><small>' + esc(t('nick_hint')) + '</small></label>' +
      (nicks.length ? '<div class="qk-nicks">' + nicks.map(function (n) { return '<button type="button" data-nick="' + esc(n) + '">' + esc(n) + '</button>'; }).join('') + '</div>' : '') +
      '<button type="button" class="qc-btn qc-btn--primary qk-go">' + esc(t('start')) + '</button>', 'qkPickT');
    function paint() {
      [].forEach.call(dlg.querySelectorAll('.qk-pose'), function (b) { b.setAttribute('aria-checked', String(+b.dataset.pose === sel.pose)); b.style.setProperty('--ava', COLORS[sel.color]); });
      [].forEach.call(dlg.querySelectorAll('.qk-color'), function (b) { b.setAttribute('aria-checked', String(+b.dataset.color === sel.color)); });
    }
    paint();
    dlg.addEventListener('click', function (e) {
      var p = e.target.closest('[data-pose]'), c = e.target.closest('[data-color]'), n = e.target.closest('[data-nick]');
      if (p) { sel.pose = +p.dataset.pose; paint(); }
      if (c) { sel.color = +c.dataset.color; paint(); }
      if (n) dlg.querySelector('.qk-nick input').value = n.dataset.nick;
      if (e.target.closest('[data-dice]')) dlg.querySelector('.qk-nick input').value = t('a' + sel.pose) + ' ' + (10 + Math.floor(Math.random() * 90));
      if (e.target.closest('.qk-go')) {
        var nick = dlg.querySelector('.qk-nick input').value.trim().slice(0, 20);
        lsSet(K_AVATAR, { date: today(), pose: sel.pose, color: sel.color, nick: nick });
        if (nick) lsSet(K_NICKS, [nick].concat((lsGet(K_NICKS) || []).filter(function (x) { return x !== nick; })).slice(0, 8));
        closeSheet(dlg);
        paintCard();
      }
    });
  }

  // ── okno (dialog) ────────────────────────────────────
  var lastFocus = null;
  function sheet(cls, inner, labelId) {
    var old = document.querySelector('.qk-sheet'); if (old) old.remove();
    lastFocus = document.activeElement;
    var wrap = document.createElement('div');
    wrap.className = 'qk-sheet ' + cls;
    wrap.innerHTML = '<div class="qk-sheet__box" role="dialog" aria-modal="true"' + (labelId ? ' aria-labelledby="' + labelId + '"' : '') + ' tabindex="-1">' +
      '<button type="button" class="qk-x" aria-label="' + esc(t('close')) + '">×</button>' + inner + '</div>';
    document.body.appendChild(wrap);
    document.documentElement.classList.add('qk-lock');
    wrap.addEventListener('click', function (e) { if (e.target === wrap || e.target.closest('.qk-x')) closeSheet(wrap); });
    wrap.querySelector('.qk-sheet__box').focus();
    return wrap;
  }
  function closeSheet(w) {
    if (!w || !w.parentNode) return;
    w.remove();
    document.documentElement.classList.remove('qk-lock');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(document.querySelector('.qk-sheet')); });

  // ── obrazek-zagadka ──────────────────────────────────
  function seed(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function shuffle(arr, s) {
    var a = arr.slice(), x = s || 1;
    for (var i = a.length - 1; i > 0; i--) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; var j = x % (i + 1); var tmp = a[i]; a[i] = a[j]; a[j] = tmp; }
    return a;
  }
  // siatka ~16:9; komórek ≥ kawałków; kawałek = grupa komórek (ostatni dostaje resztę)
  function layout(total) {
    var n = Math.max(1, total), cols = Math.max(1, Math.round(Math.sqrt(n * 16 / 9))), rows = Math.ceil(n / cols);
    while (cols * rows < n) rows++;
    var cells = cols * rows, order = shuffle(Array.apply(null, { length: cells }).map(function (_, i) { return i; }), seed(S.slug + ':' + n));
    var groups = [], per = Math.floor(cells / n), extra = cells - per * n, at = 0;
    for (var g = 0; g < n; g++) { var size = per + (g >= n - extra ? 1 : 0); groups.push(order.slice(at, at + size)); at += size; }
    return { cols: cols, rows: rows, cells: cells, groups: groups };
  }
  function groupOf(cell) { for (var g = 0; g < S.groups.length; g++) if (S.groups[g].indexOf(cell) > -1) return g; return 0; }

  function puzzleHtml(big) {
    var L = layout(S.total); S.groups = L.groups;
    var cover = '';
    for (var i = 0; i < L.cells; i++) {
      var g = groupOf(i);
      cover += '<span class="qk-cell' + (g < S.got ? ' is-open' : '') + '" data-g="' + g + '"><b>' + (g + 1) + '</b></span>';
    }
    return '<div class="qk-puzzle' + (big ? ' qk-puzzle--big' : '') + (S.got >= S.total && S.total ? ' is-done' : '') + '" style="--cols:' + L.cols + ';--rows:' + L.rows + '">' +
      '<img src="' + esc(S.hero) + '-hero-' + (big ? '1200' : '800') + '.webp" alt="' + esc(S.city) + '" width="1200" height="675" decoding="async">' +
      '<div class="qk-cover" aria-hidden="true">' + cover + '</div></div>';
  }

  function paintCard() {
    var card = document.getElementById('qkCard');
    if (!card) return;
    var a = avatar(), done = S.total && S.got >= S.total;
    card.innerHTML =
      '<div class="qk-card__head">' +
        (a ? '<button type="button" class="qk-me" data-qk="pick" aria-label="' + esc(t('change')) + '">' + avatarHtml(a) +
          '<span class="qk-me__txt"><b>' + esc(a.nick || t('a' + a.pose)) + '</b><small>' + esc(t('change')) + '</small></span></button>'
          : '<button type="button" class="qc-btn qk-me--empty" data-qk="pick">' + esc(t('choose')) + '</button>') +
        '<p class="qk-card__count"><b>' + Math.min(S.got, S.total) + '</b> / ' + S.total + '</p>' +
      '</div>' +
      '<p class="qk-card__label">' + esc(done ? t('done') : t('picture')) + '</p>' +
      '<button type="button" class="qk-card__pz" data-qk="open" aria-label="' + esc(t('picture') + ' — ' + t('progress', { n: Math.min(S.got, S.total), t: S.total })) + '">' + puzzleHtml(false) + '</button>' +
      (done ? actionsHtml() : '<p class="qk-card__hint">' + esc(t('hint')) + '</p>');
  }
  function actionsHtml() {
    return '<div class="qk-acts"><button type="button" class="qc-btn qc-btn--primary" data-qk="dl">' + DL + ' ' + esc(t('download')) + '</button>' +
      '<button type="button" class="qc-btn" data-qk="color">' + PEN + ' ' + esc(t('coloring')) + '</button></div>';
  }
  var DL = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14"/></svg>';
  var PEN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/></svg>';

  function openPuzzle(newPiece) {
    var done = S.total && S.got >= S.total;
    var dlg = sheet('qk-pz', '<h2 class="qk-sheet__title" id="qkPzT">' + esc(done ? t('done') : newPiece ? t('new_piece') : t('picture')) + '</h2>' +
      '<p class="qk-sheet__sub">' + esc(t('progress', { n: Math.min(S.got, S.total), t: S.total })) + '</p>' + puzzleHtml(true) +
      (done ? actionsHtml() : ''), 'qkPzT');
    if (newPiece && !reduced()) {
      // nowy kawałek: najpierw zakryty, po chwili odpada
      var cells = dlg.querySelectorAll('.qk-cell[data-g="' + (S.got - 1) + '"]');
      [].forEach.call(cells, function (c) { c.classList.remove('is-open'); c.classList.add('is-next'); });
      setTimeout(function () { [].forEach.call(cells, function (c, i) { setTimeout(function () { c.classList.add('is-open', 'is-pop'); }, i * 120); }); }, 450);
      if (done) setTimeout(function () { var pz = dlg.querySelector('.qk-puzzle'); if (pz) pz.classList.add('is-done', 'is-cheer'); }, 900 + cells.length * 120);
    }
    return dlg;
  }

  // ── liczenie postępu (te same reguły co album naklejek w city.html) ──
  function count() {
    var total = 0, got = 0;
    [].forEach.call(document.querySelectorAll('.qc-stop[data-collectable]'), function (st) {
      if (st.classList.contains('qc-stop--disabled') || st.style.display === 'none') return;
      total++;
      if (st.classList.contains('is-collected')) got++;
    });
    return { total: total, got: got };
  }
  function sync(fromUser) {
    var c = count(), grew = c.got > S.got && S.prevGot > -1;
    S.total = c.total; S.got = c.got; S.prevGot = c.got;
    paintCard();
    paintQrNote();
    if (!isKid()) return;
    if (grew && fromUser) openPuzzle(true);
    if (S.total && S.got >= S.total) saveAlbum();
  }

  function saveAlbum() {
    var list = lsGet(K_ALBUM) || [], a = avatar() || lsGet(K_AVATAR) || {};
    var i = -1;
    list.forEach(function (e, j) { if (e.slug === S.slug) i = j; });
    var entry = { slug: S.slug, city: S.city, country: S.country, region: S.region, hero: S.hero, pieces: S.total,
      date: today(), nick: a.nick || '', pose: a.pose == null ? 1 : a.pose, color: a.color || 0 };
    if (i > -1) { if (list[i].date === entry.date && list[i].pieces === entry.pieces) return; entry.first = list[i].first || list[i].date; list[i] = entry; }
    else { entry.first = entry.date; list.push(entry); }
    lsSet(K_ALBUM, list);
  }

  // notatka w panelu QR rodzica: ile kawałków dostanie dziecko
  function paintQrNote() {
    var qr = document.getElementById('qr');
    if (!qr) return;
    var p = document.getElementById('qkQrNote');
    if (!p) { p = document.createElement('p'); p.id = 'qkQrNote'; p.className = 'qk-qrnote'; var code = document.getElementById('qrCode'); if (code) code.parentNode.insertBefore(p, code); else qr.appendChild(p); }
    p.textContent = t('qr_note', { n: S.total });
  }

  // ── pobranie obrazka ─────────────────────────────────
  function loadImg(src) {
    return new Promise(function (res, rej) { var i = new Image(); i.decoding = 'async'; i.onload = function () { res(i); }; i.onerror = rej; i.src = src; });
  }
  function saveCanvas(cv, name) {
    cv.toBlob(function (b) {
      if (!b) return;
      var url = URL.createObjectURL(b), a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }, 'image/png');
  }
  function font(w, px) { return w + ' ' + px + 'px Archivo, system-ui, sans-serif'; }
  function downloadPicture() {
    var a = S.av || avatar() || lsGet(K_AVATAR) || { pose: 1, color: 0 };
    Promise.all([loadImg(S.hero + '-hero-1200.webp'), loadImg(poseUrl(a.pose, 256)).catch(function () { return null; })]).then(function (r) {
      var img = r[0], ava = r[1], W = 1200, H = 675, F = 170, P = 28;
      var cv = document.createElement('canvas'); cv.width = W + P * 2; cv.height = H + F + P * 2;
      var x = cv.getContext('2d');
      x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, cv.width, cv.height);
      x.drawImage(img, P, P, W, H);
      x.fillStyle = COLORS[a.color] || COLORS[0]; x.fillRect(P, P + H, W, 10);
      if (ava) {
        x.save(); x.beginPath(); x.arc(P + 90, P + H + 92, 66, 0, Math.PI * 2); x.fillStyle = COLORS[a.color] || COLORS[0]; x.fill(); x.clip();
        x.drawImage(ava, P + 24, P + H + 26, 132, 132); x.restore();
      }
      x.fillStyle = '#0E1A2B'; x.textBaseline = 'alphabetic';
      x.font = font(900, 54); x.fillText(t('conquered', { city: S.city }), P + 180, P + H + 88);
      x.font = font(600, 30); x.fillStyle = '#5D6B82';
      x.fillText([a.nick, new Date().toLocaleDateString(S.lang)].filter(Boolean).join(' · '), P + 180, P + H + 132);
      x.textAlign = 'right'; x.font = font(900, 30); x.fillStyle = '#0B4EA2'; x.fillText('quolino.com', P + W, P + H + 132);
      saveCanvas(cv, 'quolino-' + S.slug + '.png');
    }).catch(function () { /* brak obrazka */ });
  }

  // ── kolorowanka ──────────────────────────────────────
  function lineArt(img) {
    var W = 1200, H = Math.round(img.naturalHeight * W / img.naturalWidth);
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var x = cv.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, W, H);
    var d = x.getImageData(0, 0, W, H).data, g = new Float32Array(W * H), i, j;
    for (i = 0; i < W * H; i++) g[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
    g = blur(blur(g, W, H, 2), W, H, 2);
    var m = new Float32Array(W * H), hist = new Uint32Array(256);
    for (j = 1; j < H - 1; j++) for (i = 1; i < W - 1; i++) {
      var k = j * W + i;
      var gx = -g[k - W - 1] - 2 * g[k - 1] - g[k + W - 1] + g[k - W + 1] + 2 * g[k + 1] + g[k + W + 1];
      var gy = -g[k - W - 1] - 2 * g[k - W] - g[k - W + 1] + g[k + W - 1] + 2 * g[k + W] + g[k + W + 1];
      var v = Math.min(255, Math.sqrt(gx * gx + gy * gy) / 4); m[k] = v; hist[v | 0]++;
    }
    // próg: najmocniejsze ~11% krawędzi
    var target = W * H * 0.11, acc = 0, th = 255;
    for (th = 255; th > 0; th--) { acc += hist[th]; if (acc >= target) break; }
    var out = x.createImageData(W, H), o = out.data;
    for (j = 0; j < H; j++) for (i = 0; i < W; i++) {
      var p = j * W + i, on = m[p] >= th;
      if (!on && i > 0 && i < W - 1 && j > 0 && j < H - 1) on = (m[p - 1] >= th * 1.25 || m[p + 1] >= th * 1.25 || m[p - W] >= th * 1.25 || m[p + W] >= th * 1.25);
      var c = on ? 30 : 255; o[p * 4] = o[p * 4 + 1] = o[p * 4 + 2] = c; o[p * 4 + 3] = 255;
    }
    x.putImageData(out, 0, 0);
    return cv;
  }
  function blur(src, W, H, r) {
    var tmp = new Float32Array(W * H), dst = new Float32Array(W * H), i, j, s, n = r * 2 + 1;
    for (j = 0; j < H; j++) { s = 0; for (i = -r; i <= r; i++) s += src[j * W + Math.min(W - 1, Math.max(0, i))];
      for (i = 0; i < W; i++) { tmp[j * W + i] = s / n; s += src[j * W + Math.min(W - 1, i + r + 1)] - src[j * W + Math.max(0, i - r)]; } }
    for (i = 0; i < W; i++) { s = 0; for (j = -r; j <= r; j++) s += tmp[Math.min(H - 1, Math.max(0, j)) * W + i];
      for (j = 0; j < H; j++) { dst[j * W + i] = s / n; s += tmp[Math.min(H - 1, j + r + 1) * W + i] - tmp[Math.max(0, j - r) * W + i]; } }
    return dst;
  }
  function coloringPage(art, ava) {
    // A4 pionowo, 150 dpi
    var W = 1240, H = 1754, M = 90;
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var x = cv.getContext('2d');
    x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#0E1A2B'; x.font = font(900, 64); x.textAlign = 'center';
    x.fillText(t('color_title', { city: S.city }), W / 2, M + 60);
    var aw = W - M * 2, ah = Math.round(art.height * aw / art.width), top = M + 110;
    x.drawImage(art, M, top, aw, ah);
    x.lineWidth = 6; x.strokeStyle = '#0E1A2B'; x.strokeRect(M, top, aw, ah);
    // pole na podpis i rysunek własny
    var by = top + ah + 60, bh = H - by - M - 60;
    x.setLineDash([16, 12]); x.lineWidth = 4; x.strokeStyle = '#8794A8'; x.strokeRect(M, by, aw, bh); x.setLineDash([]);
    if (ava) {
      // Quo jako kontur do pokolorowania
      var qa = lineArtSmall(ava, 360); x.drawImage(qa, W - M - 380, by + bh - 380, 360, 360);
    }
    x.textAlign = 'left'; x.fillStyle = '#5D6B82'; x.font = font(600, 30);
    x.fillText('quolino.com', M, H - M + 10);
    return cv;
  }
  function lineArtSmall(img, size) {
    var cv = document.createElement('canvas'); cv.width = cv.height = size;
    var x = cv.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, size, size);
    var d = x.getImageData(0, 0, size, size), p = d.data, a = new Uint8Array(size * size), i, j;
    for (i = 0; i < size * size; i++) a[i] = p[i * 4 + 3] > 40 ? 1 : 0;
    var lum = new Float32Array(size * size);
    for (i = 0; i < size * size; i++) lum[i] = p[i * 4] * 0.299 + p[i * 4 + 1] * 0.587 + p[i * 4 + 2] * 0.114;
    lum = blur(lum, size, size, 1);
    for (j = 1; j < size - 1; j++) for (i = 1; i < size - 1; i++) {
      var k = j * size + i, edgeA = a[k] && (!a[k - 1] || !a[k + 1] || !a[k - size] || !a[k + size]);
      var gx = lum[k + 1] - lum[k - 1], gy = lum[k + size] - lum[k - size], edgeL = a[k] && Math.sqrt(gx * gx + gy * gy) > 34;
      var c = edgeA || edgeL ? 30 : 255;
      p[k * 4] = p[k * 4 + 1] = p[k * 4 + 2] = c; p[k * 4 + 3] = edgeA || edgeL ? 255 : 0;
    }
    x.putImageData(d, 0, 0);
    return cv;
  }
  function openColoring() {
    var dlg = sheet('qk-col', '<h2 class="qk-sheet__title" id="qkColT">' + esc(t('coloring')) + '</h2><p class="qk-sheet__sub" data-st>' + esc(t('preparing')) + '</p><div class="qk-colprev"></div>', 'qkColT');
    var a = S.av || avatar() || lsGet(K_AVATAR) || { pose: 1 };
    var ready = loadImg(S.hero + '-coloring.webp').then(function (img) {          // gotowa kolorowanka od redakcji
      var cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight; cv.getContext('2d').drawImage(img, 0, 0); return cv;
    }).catch(function () { return loadImg(S.hero + '-hero-1200.webp').then(lineArt); });
    Promise.all([ready, loadImg(poseUrl(a.pose, 512)).catch(function () { return null; })]).then(function (r) {
      var page = coloringPage(r[0], r[1]), url = page.toDataURL('image/png');
      var st = dlg.querySelector('[data-st]'); if (st) st.remove();
      dlg.querySelector('.qk-colprev').innerHTML = '<img src="' + url + '" alt="' + esc(t('color_title', { city: S.city })) + '">' +
        '<div class="qk-acts"><button type="button" class="qc-btn qc-btn--primary" data-qk="print">' + esc(t('print')) + '</button>' +
        '<button type="button" class="qc-btn" data-qk="dlcol">' + DL + ' ' + esc(t('download_col')) + '</button></div>';
      dlg.addEventListener('click', function (e) {
        if (e.target.closest('[data-qk="dlcol"]')) saveCanvas(page, 'quolino-' + S.slug + '-kolorowanka.png');
        if (e.target.closest('[data-qk="print"]')) printImage(url);
      });
    }).catch(function () { var st = dlg.querySelector('[data-st]'); if (st) st.textContent = '—'; });
  }
  function printImage(url) {
    var box = document.getElementById('qkPrint');
    if (!box) { box = document.createElement('div'); box.id = 'qkPrint'; document.body.appendChild(box); }
    box.innerHTML = '<img src="' + url + '" alt="">';
    var img = box.querySelector('img');
    var go = function () {
      document.body.classList.add('qk-printing');
      window.addEventListener('afterprint', function done() { document.body.classList.remove('qk-printing'); window.removeEventListener('afterprint', done); });
      window.print();
      setTimeout(function () { document.body.classList.remove('qk-printing'); }, 1500);
    };
    if (img.complete) setTimeout(go, 50); else img.onload = go;
  }

  // ── zdarzenia ────────────────────────────────────────
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-qk]');
    if (!b) return;
    var k = b.getAttribute('data-qk');
    if (k === 'pick') openPicker();
    else if (k === 'open') openPuzzle(false);
    else if (k === 'dl') downloadPicture();
    else if (k === 'color') openColoring();
  });
  // po zmianie zadania city.html już przeliczył album (listener na checkboxie działa przed tym)
  document.addEventListener('change', function (e) {
    if (e.target.matches && e.target.matches('[data-qc-task], [data-toggle-stop]')) setTimeout(function () { sync(e.target.matches('[data-qc-task]')); }, 0);
  });

  function init(o) {
    S.lang = DICT[o.lang] ? o.lang : 'en';
    S.av = null; S.slug = o.slug || ''; S.city = o.cityName || S.slug; S.hero = o.hero || ''; S.country = o.country || ''; S.region = o.region || '';
    S.root = document.getElementById('city');
    if (!S.root || !S.hero) return;
    var main = S.root.querySelector('.qc-main');
    if (main && !document.getElementById('qkCard')) {
      var card = document.createElement('section');
      card.id = 'qkCard'; card.className = 'qk-card';
      card.setAttribute('aria-label', t('picture'));
      main.insertBefore(card, main.firstChild);
    }
    S.prevGot = -1; S.got = 0; S.total = 0;
    sync(false);
    if (kidDevice() && !avatar()) setTimeout(openPicker, 300);
  }

  // panel rodzica (konto.html): obrazek i kolorowanka dla wpisu z albumu
  function use(e, lang) {
    if (lang && DICT[lang]) S.lang = lang;
    S.slug = e.slug; S.city = e.city; S.hero = e.hero; S.av = { pose: e.pose == null ? 1 : e.pose, color: e.color || 0, nick: e.nick || '' };
  }

  window.QReward = { init: init, count: count, use: use, picture: downloadPicture, coloring: openColoring, avatarUrl: poseUrl, colors: COLORS, poseName: function (i) { return t('a' + i); } };
})();
