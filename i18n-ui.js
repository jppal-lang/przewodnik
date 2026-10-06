/* =====================================================================
   QUOLINO — i18n-ui.js (warstwa UI, frontend)
   Ładowany w <head> PRZED skryptami stron. Robi trzy rzeczy:

   1. SŁOWNIK INTERFEJSU — 60 napisów przycisków, zakładek, etykiet i komunikatów
      w 17 językach. Gdy klucza brakuje w Supabase (ui_translations), strona
      dostaje tłumaczenie stąd zamiast polskiego fallbacku z kodu.
      Kolejność: Supabase[język] > słownik[język] > Supabase[en] > słownik[en] > pl.

   2. ŁAŃCUCH JĘZYKÓW DLA DANYCH — zapytania *_translations, day_plan
      i emergency_points z „lang=eq.X” pobierają X, en i pl i zostawiają
      najlepszą wersję. Brak tłumaczenia regionu/kraju/miasta nie zamienia już
      nazwy w slug („it”, „umbria”, „asyz”), a brak planu dnia nie daje
      „Dane wkrótce.”, tylko wersję angielską lub polską.

   3. <html lang> i atrybuty aria/teksty statyczne oznaczone
      data-ui-aria / data-ui-local dostają język strony.

   Docelowo brakujące klucze powinny trafić do Supabase (rola Backend) —
   ten plik jest siatką bezpieczeństwa, nie źródłem prawdy treści.
   ===================================================================== */
(function () {
  'use strict';
  var KEYS = ["btn.copied", "btn.copy_link", "btn.navigate_start", "btn.parent_view", "btn.toggle_stop", "error.load", "error.region_not_found", "label.emergency_sub", "label.full_day", "label.half_day", "label.like_quolino", "label.mission", "label.no_data", "label.on_foot", "label.parking", "label.route", "label.stickers", "label.stops_label", "label.sunset_today", "label.ticket", "label.tickets", "label.today_route", "label.uphill", "label.uphill_label", "label.year", "nav.choose_lang", "nav.language_label", "nav.regions", "nav.support_coffee", "seo.trip_plan", "seo.with_kids", "tab.emergency", "tab.phones", "tab.plan", "tab.qr", "tab.route", "btn.kid_view", "btn.navigate", "btn.www", "label.day_plan", "label.emergency", "label.good_to_know", "label.phones", "label.photo_task", "label.qr_kid", "qr.scan_text", "nav.menu", "nav.close", "nav.breadcrumb", "nav.sections", "state.loading_trip", "error.back_home", "video.pause", "video.play", "error.oops", "btn.write", "emerg.pharmacy", "emerg.toilet", "emerg.playground", "emerg.hospital"];
  var RAW = {
  "pl": "Skopiowano!|Kopiuj link|Prowadź do startu|Widok rodzica|Włącz/wyłącz dla dziecka|Nie udało się wczytać danych. Odśwież stronę.|Nie znaleźliśmy tego regionu.|Apteka, toalety, cień i plac zabaw — wszystko kilka minut od trasy.|cały dzień|pół dnia|Podoba się Quolino?|Misja|Dane wkrótce.|pieszo|Parking|trasy|naklejek|Przystanki|Zachód słońca dziś|Bilet|Bilety (rodzina 2+2)|Dzisiejsza trasa|w górę|Wejście w górę|Rok|Wybierz język|Język|Wybierz region|Postaw nam kawę|plan wycieczki|z dziećmi|Punkty awaryjne|Telefony|Plan dnia|QR dla dziecka|Trasa|Widok dziecka|Nawiguj|WWW|Plan dnia|Punkty awaryjne|Warto wiedzieć|Telefony|Zadanie foto|QR dla dziecka|Zeskanuj na drugim telefonie — dziecko dostanie tylko misje i zadania foto.|Menu|Zamknij|Okruszki|Sekcje|Ładowanie wycieczki…|Wróć na stronę główną|Zatrzymaj animację|Odtwórz animację|Ups!|Napisz|Apteka|Toalety|Plac zabaw|Szpital",
  "en": "Copied!|Copy link|Navigate to start|Parent view|Show/hide for the child|Couldn't load the data. Please refresh the page.|We couldn't find this region.|Pharmacy, toilets, shade and a playground — all a few minutes from the route.|full day|half day|Enjoying Quolino?|Mission|Coming soon.|on foot|Parking|route|stickers|Stops|Sunset today|Ticket|Tickets (family 2+2)|Today's route|uphill|Climb|Year|Choose language|Language|Choose a region|Buy us a coffee|day trip plan|with kids|Emergency points|Phones|Day plan|QR for the child|Route|Child view|Navigate|Website|Day plan|Emergency points|Good to know|Phones|Photo task|QR for the child|Scan with a second phone — the child gets only missions and photo tasks.|Menu|Close|Breadcrumb|Sections|Loading the trip…|Back to the home page|Pause animation|Play animation|Oops!|Message|Pharmacy|Toilets|Playground|Hospital",
  "de": "Kopiert!|Link kopieren|Zum Start navigieren|Elternansicht|Für das Kind ein-/ausblenden|Daten konnten nicht geladen werden. Bitte Seite neu laden.|Diese Region haben wir nicht gefunden.|Apotheke, Toiletten, Schatten und Spielplatz — alles wenige Minuten von der Route.|ganzer Tag|halber Tag|Gefällt dir Quolino?|Mission|Daten folgen bald.|zu Fuß|Parken|Route|Sticker|Stopps|Sonnenuntergang heute|Ticket|Tickets (Familie 2+2)|Heutige Route|bergauf|Anstieg|Jahr|Sprache wählen|Sprache|Region wählen|Spendier uns einen Kaffee|Ausflugsplan|mit Kindern|Notfallpunkte|Telefone|Tagesplan|QR fürs Kind|Route|Kinderansicht|Navigieren|Website|Tagesplan|Notfallpunkte|Gut zu wissen|Telefone|Fotoaufgabe|QR fürs Kind|Mit einem zweiten Handy scannen — das Kind sieht nur Missionen und Fotoaufgaben.|Menü|Schließen|Brotkrumen|Abschnitte|Ausflug wird geladen…|Zurück zur Startseite|Animation anhalten|Animation abspielen|Hoppla!|Schreiben|Apotheke|Toiletten|Spielplatz|Krankenhaus",
  "it": "Copiato!|Copia link|Naviga alla partenza|Vista genitore|Mostra/nascondi per il bambino|Impossibile caricare i dati. Ricarica la pagina.|Non abbiamo trovato questa regione.|Farmacia, bagni, ombra e parco giochi — tutto a pochi minuti dal percorso.|giornata intera|mezza giornata|Ti piace Quolino?|Missione|Dati in arrivo.|a piedi|Parcheggio|di percorso|figurine|Tappe|Tramonto oggi|Biglietto|Biglietti (famiglia 2+2)|Percorso di oggi|in salita|Dislivello|Anno|Scegli la lingua|Lingua|Scegli la regione|Offrici un caffè|programma della gita|con i bambini|Punti di emergenza|Telefoni|Programma del giorno|QR per il bambino|Percorso|Vista bambino|Naviga|Sito web|Programma del giorno|Punti di emergenza|Buono a sapersi|Telefoni|Missione foto|QR per il bambino|Scansiona con un secondo telefono — il bambino vedrà solo missioni e foto.|Menu|Chiudi|Percorso di navigazione|Sezioni|Caricamento della gita…|Torna alla home|Metti in pausa l'animazione|Riproduci l'animazione|Ops!|Scrivi|Farmacia|Bagni|Parco giochi|Ospedale",
  "cs": "Zkopírováno!|Kopírovat odkaz|Navigovat na start|Pohled rodiče|Zobrazit/skrýt pro dítě|Data se nepodařilo načíst. Obnovte stránku.|Tento region jsme nenašli.|Lékárna, toalety, stín a hřiště — vše pár minut od trasy.|celý den|půl dne|Líbí se vám Quolino?|Mise|Údaje brzy doplníme.|pěšky|Parkování|trasy|samolepek|Zastávky|Západ slunce dnes|Vstupenka|Vstupenky (rodina 2+2)|Dnešní trasa|do kopce|Stoupání|Rok|Vyberte jazyk|Jazyk|Vyberte region|Kupte nám kávu|plán výletu|s dětmi|Nouzová místa|Telefony|Plán dne|QR pro dítě|Trasa|Pohled dítěte|Navigovat|Web|Plán dne|Nouzová místa|Dobré vědět|Telefony|Foto úkol|QR pro dítě|Naskenujte druhým telefonem — dítě uvidí jen mise a foto úkoly.|Menu|Zavřít|Drobečková navigace|Sekce|Načítám výlet…|Zpět na úvodní stránku|Pozastavit animaci|Přehrát animaci|Jejda!|Napsat|Lékárna|Toalety|Dětské hřiště|Nemocnice",
  "da": "Kopieret!|Kopiér link|Navigér til start|Forældrevisning|Vis/skjul for barnet|Kunne ikke hente data. Genindlæs siden.|Vi kunne ikke finde denne region.|Apotek, toiletter, skygge og legeplads — alt få minutter fra ruten.|hel dag|halv dag|Kan du lide Quolino?|Mission|Data kommer snart.|til fods|Parkering|rute|klistermærker|Stop|Solnedgang i dag|Billet|Billetter (familie 2+2)|Dagens rute|op ad bakke|Stigning|År|Vælg sprog|Sprog|Vælg region|Giv os en kop kaffe|udflugtsplan|med børn|Nødsteder|Telefoner|Dagsplan|QR til barnet|Rute|Børnevisning|Navigér|Hjemmeside|Dagsplan|Nødsteder|Godt at vide|Telefoner|Fotoopgave|QR til barnet|Scan med en anden telefon — barnet får kun missioner og fotoopgaver.|Menu|Luk|Brødkrummesti|Sektioner|Indlæser udflugten…|Tilbage til forsiden|Sæt animationen på pause|Afspil animationen|Ups!|Skriv|Apotek|Toiletter|Legeplads|Hospital",
  "es": "¡Copiado!|Copiar enlace|Ir al inicio|Vista de padres|Mostrar/ocultar para el niño|No se pudieron cargar los datos. Recarga la página.|No encontramos esta región.|Farmacia, aseos, sombra y parque infantil — todo a pocos minutos de la ruta.|día completo|medio día|¿Te gusta Quolino?|Misión|Datos próximamente.|a pie|Aparcamiento|de ruta|cromos|Paradas|Puesta de sol hoy|Entrada|Entradas (familia 2+2)|Ruta de hoy|de subida|Desnivel|Año|Elige idioma|Idioma|Elige una región|Invítanos a un café|plan de excursión|con niños|Puntos de emergencia|Teléfonos|Plan del día|QR para el niño|Ruta|Vista infantil|Navegar|Web|Plan del día|Puntos de emergencia|Conviene saber|Teléfonos|Reto fotográfico|QR para el niño|Escanéalo con otro móvil — el niño solo verá misiones y retos de fotos.|Menú|Cerrar|Ruta de navegación|Secciones|Cargando la excursión…|Volver a la página de inicio|Pausar animación|Reproducir animación|¡Vaya!|Escribir|Farmacia|Aseos|Parque infantil|Hospital",
  "fr": "Copié !|Copier le lien|Aller au départ|Vue parent|Afficher/masquer pour l'enfant|Impossible de charger les données. Actualisez la page.|Nous n'avons pas trouvé cette région.|Pharmacie, toilettes, ombre et aire de jeux — tout à quelques minutes du parcours.|journée entière|demi-journée|Vous aimez Quolino ?|Mission|Données bientôt disponibles.|à pied|Parking|de parcours|vignettes|Étapes|Coucher du soleil aujourd'hui|Billet|Billets (famille 2+2)|Parcours du jour|de montée|Dénivelé|Année|Choisir la langue|Langue|Choisir une région|Offrez-nous un café|programme d'excursion|avec des enfants|Points d'urgence|Téléphones|Programme du jour|QR pour l'enfant|Parcours|Vue enfant|Naviguer|Site web|Programme du jour|Points d'urgence|Bon à savoir|Téléphones|Défi photo|QR pour l'enfant|Scannez avec un deuxième téléphone — l'enfant ne verra que les missions et les défis photo.|Menu|Fermer|Fil d'Ariane|Sections|Chargement de l'excursion…|Retour à l'accueil|Mettre l'animation en pause|Lire l'animation|Oups !|Écrire|Pharmacie|Toilettes|Aire de jeux|Hôpital",
  "hr": "Kopirano!|Kopiraj poveznicu|Navigiraj do početka|Prikaz za roditelje|Prikaži/sakrij za dijete|Podaci se nisu učitali. Osvježite stranicu.|Nismo pronašli ovu regiju.|Ljekarna, toaleti, hlad i igralište — sve nekoliko minuta od rute.|cijeli dan|pola dana|Sviđa vam se Quolino?|Misija|Podaci uskoro.|pješice|Parkiralište|rute|sličica|Stajališta|Zalazak sunca danas|Ulaznica|Ulaznice (obitelj 2+2)|Današnja ruta|uzbrdo|Uspon|Godina|Odaberite jezik|Jezik|Odaberite regiju|Častite nas kavom|plan izleta|s djecom|Hitne točke|Telefoni|Plan dana|QR za dijete|Ruta|Prikaz za dijete|Navigiraj|Web|Plan dana|Hitne točke|Dobro je znati|Telefoni|Foto zadatak|QR za dijete|Skenirajte drugim mobitelom — dijete će vidjeti samo misije i foto zadatke.|Izbornik|Zatvori|Navigacijski put|Odjeljci|Učitavam izlet…|Natrag na početnu|Pauziraj animaciju|Pokreni animaciju|Ups!|Piši|Ljekarna|Toaleti|Dječje igralište|Bolnica",
  "hu": "Másolva!|Link másolása|Navigálás a kezdőponthoz|Szülői nézet|Megjelenítés/elrejtés a gyereknek|Nem sikerült betölteni az adatokat. Frissítsd az oldalt.|Ezt a régiót nem találtuk.|Gyógyszertár, mosdó, árnyék és játszótér — mind pár percre az útvonaltól.|egész nap|fél nap|Tetszik a Quolino?|Küldetés|Az adatok hamarosan jönnek.|gyalog|Parkolás|útvonal|matrica|Megállók|Naplemente ma|Jegy|Jegyek (család 2+2)|Mai útvonal|emelkedő|Szintemelkedés|Év|Válassz nyelvet|Nyelv|Válassz régiót|Hívj meg egy kávéra|kirándulási terv|gyerekekkel|Vészhelyzeti pontok|Telefonok|Napi terv|QR a gyereknek|Útvonal|Gyerek nézet|Navigálás|Weboldal|Napi terv|Vészhelyzeti pontok|Jó tudni|Telefonok|Fotós feladat|QR a gyereknek|Szkenneld be egy másik telefonnal — a gyerek csak a küldetéseket és a fotós feladatokat látja.|Menü|Bezárás|Morzsamenü|Szakaszok|Kirándulás betöltése…|Vissza a főoldalra|Animáció szüneteltetése|Animáció lejátszása|Hoppá!|Üzenet|Gyógyszertár|Mosdó|Játszótér|Kórház",
  "nl": "Gekopieerd!|Link kopiëren|Navigeer naar start|Oudersweergave|Tonen/verbergen voor het kind|Gegevens konden niet worden geladen. Vernieuw de pagina.|We hebben deze regio niet gevonden.|Apotheek, toiletten, schaduw en speeltuin — alles op een paar minuten van de route.|hele dag|halve dag|Vind je Quolino leuk?|Missie|Gegevens volgen binnenkort.|te voet|Parkeren|route|stickers|Stops|Zonsondergang vandaag|Ticket|Tickets (gezin 2+2)|Route van vandaag|bergop|Hoogteverschil|Jaar|Kies taal|Taal|Kies een regio|Trakteer ons op koffie|dagtripplan|met kinderen|Noodpunten|Telefoons|Dagplanning|QR voor het kind|Route|Kinderweergave|Navigeren|Website|Dagplanning|Noodpunten|Goed om te weten|Telefoons|Foto-opdracht|QR voor het kind|Scan met een tweede telefoon — het kind ziet alleen missies en foto-opdrachten.|Menu|Sluiten|Kruimelpad|Secties|Uitstap laden…|Terug naar de startpagina|Animatie pauzeren|Animatie afspelen|Oeps!|Bericht|Apotheek|Toiletten|Speeltuin|Ziekenhuis",
  "no": "Kopiert!|Kopier lenke|Naviger til start|Foreldrevisning|Vis/skjul for barnet|Kunne ikke laste data. Last inn siden på nytt.|Vi fant ikke denne regionen.|Apotek, toaletter, skygge og lekeplass — alt noen minutter fra ruten.|hel dag|halv dag|Liker du Quolino?|Oppdrag|Data kommer snart.|til fots|Parkering|rute|klistremerker|Stopp|Solnedgang i dag|Billett|Billetter (familie 2+2)|Dagens rute|oppover|Stigning|År|Velg språk|Språk|Velg region|Spander en kaffe på oss|turplan|med barn|Nødpunkter|Telefoner|Dagsplan|QR til barnet|Rute|Barnevisning|Naviger|Nettside|Dagsplan|Nødpunkter|Greit å vite|Telefoner|Fotooppgave|QR til barnet|Skann med en annen telefon — barnet får bare oppdrag og fotooppgaver.|Meny|Lukk|Brødsmulesti|Seksjoner|Laster turen…|Tilbake til forsiden|Sett animasjonen på pause|Spill av animasjonen|Oi!|Skriv|Apotek|Toaletter|Lekeplass|Sykehus",
  "pt": "Copiado!|Copiar link|Ir para o início|Vista dos pais|Mostrar/ocultar para a criança|Não foi possível carregar os dados. Atualize a página.|Não encontrámos esta região.|Farmácia, casas de banho, sombra e parque infantil — tudo a poucos minutos do percurso.|dia inteiro|meio dia|Gostas do Quolino?|Missão|Dados em breve.|a pé|Estacionamento|de percurso|cromos|Paragens|Pôr do sol hoje|Bilhete|Bilhetes (família 2+2)|Percurso de hoje|a subir|Desnível|Ano|Escolher idioma|Idioma|Escolher região|Paga-nos um café|plano de passeio|com crianças|Pontos de emergência|Telefones|Plano do dia|QR para a criança|Percurso|Vista da criança|Navegar|Site|Plano do dia|Pontos de emergência|Bom saber|Telefones|Desafio fotográfico|QR para a criança|Lê com um segundo telemóvel — a criança só vê missões e desafios fotográficos.|Menu|Fechar|Navegação estrutural|Secções|A carregar o passeio…|Voltar à página inicial|Pausar animação|Reproduzir animação|Ups!|Escrever|Farmácia|Casas de banho|Parque infantil|Hospital",
  "ro": "Copiat!|Copiază linkul|Navighează la start|Vedere părinte|Arată/ascunde pentru copil|Datele nu s-au putut încărca. Reîncarcă pagina.|Nu am găsit această regiune.|Farmacie, toalete, umbră și loc de joacă — totul la câteva minute de traseu.|o zi întreagă|jumătate de zi|Îți place Quolino?|Misiune|Date în curând.|pe jos|Parcare|de traseu|abțibilduri|Opriri|Apus de soare azi|Bilet|Bilete (familie 2+2)|Traseul de azi|urcare|Diferență de nivel|An|Alege limba|Limba|Alege regiunea|Fă-ne cinste cu o cafea|plan de excursie|cu copiii|Puncte de urgență|Telefoane|Planul zilei|QR pentru copil|Traseu|Vedere copil|Navighează|Site|Planul zilei|Puncte de urgență|Bine de știut|Telefoane|Provocare foto|QR pentru copil|Scanează cu un al doilea telefon — copilul vede doar misiuni și provocări foto.|Meniu|Închide|Fir de navigare|Secțiuni|Se încarcă excursia…|Înapoi la pagina principală|Pune animația pe pauză|Redă animația|Ups!|Scrie|Farmacie|Toalete|Loc de joacă|Spital",
  "sk": "Skopírované!|Kopírovať odkaz|Navigovať na štart|Pohľad rodiča|Zobraziť/skryť pre dieťa|Údaje sa nepodarilo načítať. Obnovte stránku.|Tento región sme nenašli.|Lekáreň, toalety, tieň a ihrisko — všetko pár minút od trasy.|celý deň|pol dňa|Páči sa vám Quolino?|Misia|Údaje čoskoro.|pešo|Parkovanie|trasy|nálepiek|Zastávky|Západ slnka dnes|Vstupenka|Vstupenky (rodina 2+2)|Dnešná trasa|do kopca|Stúpanie|Rok|Vyberte jazyk|Jazyk|Vyberte región|Kúpte nám kávu|plán výletu|s deťmi|Núdzové miesta|Telefóny|Plán dňa|QR pre dieťa|Trasa|Pohľad dieťaťa|Navigovať|Web|Plán dňa|Núdzové miesta|Dobré vedieť|Telefóny|Foto úloha|QR pre dieťa|Naskenujte druhým telefónom — dieťa uvidí len misie a foto úlohy.|Menu|Zavrieť|Omrvinková navigácia|Sekcie|Načítavam výlet…|Späť na úvodnú stránku|Pozastaviť animáciu|Prehrať animáciu|Ups!|Napísať|Lekáreň|Toalety|Detské ihrisko|Nemocnica",
  "sv": "Kopierat!|Kopiera länk|Navigera till start|Föräldravy|Visa/dölj för barnet|Det gick inte att läsa in data. Ladda om sidan.|Vi hittade inte den här regionen.|Apotek, toaletter, skugga och lekplats — allt några minuter från rutten.|heldag|halvdag|Gillar du Quolino?|Uppdrag|Data kommer snart.|till fots|Parkering|rutt|klistermärken|Stopp|Solnedgång i dag|Biljett|Biljetter (familj 2+2)|Dagens rutt|uppför|Stigning|År|Välj språk|Språk|Välj region|Bjud oss på en kaffe|utflyktsplan|med barn|Nödpunkter|Telefoner|Dagsplan|QR till barnet|Rutt|Barnvy|Navigera|Webbplats|Dagsplan|Nödpunkter|Bra att veta|Telefoner|Fotouppdrag|QR till barnet|Skanna med en andra telefon — barnet ser bara uppdrag och fotouppdrag.|Meny|Stäng|Brödsmulor|Avsnitt|Laddar utflykten…|Tillbaka till startsidan|Pausa animationen|Spela animationen|Hoppsan!|Skriv|Apotek|Toaletter|Lekplats|Sjukhus",
  "uk": "Скопійовано!|Копіювати посилання|Навігація до старту|Вигляд для батьків|Показати/сховати для дитини|Не вдалося завантажити дані. Оновіть сторінку.|Ми не знайшли цей регіон.|Аптека, туалети, тінь і майданчик — усе за кілька хвилин від маршруту.|цілий день|пів дня|Подобається Quolino?|Місія|Дані незабаром.|пішки|Паркування|маршруту|наліпок|Зупинки|Захід сонця сьогодні|Квиток|Квитки (сім'я 2+2)|Сьогоднішній маршрут|вгору|Підйом|Рік|Оберіть мову|Мова|Оберіть регіон|Пригостіть нас кавою|план поїздки|з дітьми|Пункти допомоги|Телефони|План дня|QR для дитини|Маршрут|Вигляд для дитини|Навігація|Сайт|План дня|Пункти допомоги|Варто знати|Телефони|Фотозавдання|QR для дитини|Відскануйте другим телефоном — дитина бачитиме лише місії та фотозавдання.|Меню|Закрити|Навігаційний ланцюжок|Розділи|Завантажуємо поїздку…|Назад на головну|Призупинити анімацію|Відтворити анімацію|Ой!|Написати|Аптека|Туалети|Дитячий майданчик|Лікарня"
  };
  var DICT = {};
  Object.keys(RAW).forEach(function (l) {
    var v = RAW[l].split('|'), d = {};
    KEYS.forEach(function (k, i) { d[k] = v[i]; });
    DICT[l] = d;
  });

  function pageLang() {
    var q = new URLSearchParams(location.search).get('lang');
    var p = null;
    try { p = localStorage.getItem('quolino_lang'); } catch (e) {}
    return q || p || 'pl';
  }
  var lang = pageLang();

  function t(key, l) {
    l = l || lang;
    return (DICT[l] && DICT[l][key]) || (DICT.en && DICT.en[key]) || (DICT.pl && DICT.pl[key]) || '';
  }

  function applyStatic(l) {
    document.documentElement.lang = l;
    document.querySelectorAll('[data-ui-aria]').forEach(function (el) {
      var v = t(el.getAttribute('data-ui-aria'), l);
      if (v) el.setAttribute('aria-label', v);
    });
    document.querySelectorAll('[data-ui-local]').forEach(function (el) {
      var v = t(el.getAttribute('data-ui-local'), l);
      if (v) el.textContent = v;
    });
  }
  window.QUI = { t: t, lang: function () { return lang; }, apply: function () { applyStatic(lang); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { applyStatic(lang); });
  else applyStatic(lang);

  // ── adapter zapytań Supabase ──
  var CHAIN_TABLES = { region_translations: 'region_slug', country_translations: 'country_slug', city_translations: 'city_slug' };
  var BEST_SET_TABLES = { day_plan: 1, emergency_points: 1 };
  var origFetch = window.fetch;
  if (!origFetch) return;

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var m = url.match(/\/rest\/v1\/([a-z_]+)\?(.*)$/);
    if (!m) return origFetch.apply(this, arguments);
    var table = m[1];
    var lm = m[2].match(/(^|&)lang=eq\.([a-z]{2,3})(&|$)/);
    var isUi = table === 'ui_translations';
    if (!lm || !(isUi || CHAIN_TABLES[table] || BEST_SET_TABLES[table])) return origFetch.apply(this, arguments);

    var L = lm[2];
    if (isUi) { lang = L; applyStatic(L); }
    var chain = [L, 'en', 'pl'].filter(function (x, i, a) { return a.indexOf(x) === i; });
    var newUrl = url.replace('lang=eq.' + L, 'lang=in.(' + chain.join(',') + ')');
    var rank = function (r) { var i = chain.indexOf(r.lang); return i < 0 ? 99 : i; };

    return origFetch.call(this, newUrl, init).then(function (res) {
      if (!res.ok) return res;
      return res.json().then(function (rows) {
        var out = rows;
        if (isUi) {
          var best = {};
          rows.forEach(function (r) { if (!best[r.key] || rank(r) < rank(best[r.key])) best[r.key] = r; });
          // słownik lokalny wygrywa z en/pl z bazy, ale nie z bazą w języku strony
          KEYS.forEach(function (k) {
            var cur = best[k], loc = DICT[L] && DICT[L][k];
            if (loc && (!cur || cur.lang !== L)) best[k] = { key: k, lang: L, value: loc };
          });
          out = Object.keys(best).map(function (k) { var r = best[k]; return { key: r.key, lang: L, value: r.value }; });
        } else if (CHAIN_TABLES[table]) {
          var idf = CHAIN_TABLES[table], pick = {};
          rows.forEach(function (r) { var id = r[idf]; if (!pick[id] || rank(r) < rank(pick[id])) pick[id] = r; });
          out = Object.keys(pick).map(function (k) { return pick[k]; });
        } else {
          var bestLang = null;
          rows.forEach(function (r) { if (bestLang === null || rank(r) < chain.indexOf(bestLang)) bestLang = r.lang; });
          out = rows.filter(function (r) { return r.lang === bestLang; });
        }
        return new Response(JSON.stringify(out), { status: res.status, statusText: res.statusText, headers: { 'Content-Type': 'application/json' } });
      });
    });
  };
})();
