-- KROK 1: Aktualizacja stop_key i category w istniejących stops

UPDATE stops SET stop_key = 'parking-villa-dei-mosaici' WHERE city_slug = 'spello' AND stop_key = 'parking-mosaici';
UPDATE stops SET stop_key = 'villa-dei-mosaici' WHERE city_slug = 'spello' AND stop_key = 'villa-mosaici';
UPDATE stops SET stop_key = 'belvedere-panoramico' WHERE city_slug = 'spello' AND stop_key = 'belvedere';
UPDATE stops SET stop_key = 'kolacja' WHERE city_slug = 'spello' AND stop_key = 'osteria-del-buchetto';

-- Poprawka category
UPDATE stops SET category = 'monument' WHERE city_slug = 'spello' AND stop_key = 'porta-venere';

-- Aktualizacja optional / sunset_spot z v31 meta
UPDATE stops SET optional = false, sunset_spot = false WHERE city_slug = 'spello' AND stop_key = 'parking-villa-dei-mosaici';
UPDATE stops SET optional = false, sunset_spot = false WHERE city_slug = 'spello' AND stop_key = 'villa-dei-mosaici';
UPDATE stops SET optional = false, sunset_spot = false WHERE city_slug = 'spello' AND stop_key = 'porta-consolare';
UPDATE stops SET optional = false, sunset_spot = false WHERE city_slug = 'spello' AND stop_key = 'sant-andrea';
UPDATE stops SET optional = false, sunset_spot = false WHERE city_slug = 'spello' AND stop_key = 'santa-maria-maggiore';
UPDATE stops SET optional = false, sunset_spot = false WHERE city_slug = 'spello' AND stop_key = 'via-giulia';
UPDATE stops SET optional = false, sunset_spot = false WHERE city_slug = 'spello' AND stop_key = 'porta-venere';
UPDATE stops SET optional = false, sunset_spot = false WHERE city_slug = 'spello' AND stop_key = 'vicoli-belvedere';
UPDATE stops SET optional = true, sunset_spot = false WHERE city_slug = 'spello' AND stop_key = 'gelateria-la-paola';
UPDATE stops SET optional = true, sunset_spot = true WHERE city_slug = 'spello' AND stop_key = 'belvedere-panoramico';
UPDATE stops SET optional = false, sunset_spot = false WHERE city_slug = 'spello' AND stop_key = 'kolacja';


-- KROK 2: city_translations — UPSERT (INSERT ON CONFLICT UPDATE)

INSERT INTO city_translations (city_slug, lang, title, region_label, subtitle, lead, good_to_know, local_food, hero_note)
VALUES ('spello', 'cs', 'Spello', 'Umbrie · půl dne', 'Umbrijské městečko, kde se římské mozaiky, středověké uličky a výhledy na Umbrii spojují v jedno rodinné dobrodružství.', 'Spello je nejlepší poznávat vlastním tempem: zastavit se u mozaik, vejít do kostela, dát si cestou zmrzlinu nebo některé místo vynechat.', 'Trasa je flexibilní. Vyhlídka je zvlášť atraktivní při západu slunce. Před návštěvou ověřte aktuální otevírací dobu a ceny.', 'Všímejte si místních umbrijských produktů, hlavně olivového oleje a jednoduchých jídel z regionálních surovin. Zmrzlina je volitelná zastávka.', NULL)
ON CONFLICT (city_slug, lang) DO UPDATE SET
  title = EXCLUDED.title,
  region_label = EXCLUDED.region_label,
  subtitle = EXCLUDED.subtitle,
  lead = EXCLUDED.lead,
  good_to_know = EXCLUDED.good_to_know,
  local_food = EXCLUDED.local_food,
  hero_note = EXCLUDED.hero_note,
  updated_at = now();

INSERT INTO city_translations (city_slug, lang, title, region_label, subtitle, lead, good_to_know, local_food, hero_note)
VALUES ('spello', 'da', 'Spello', 'Umbrien · en halv dag', 'En umbrisk by, hvor romerske mosaikker, middelalderlige gader og udsigter over Umbrien bliver til ét familieeventyr.', 'Oplev Spello i jeres eget tempo: stop ved mosaikkerne, gå ind i en kirke, få en is undervejs eller spring et stop over.', 'Ruten er fleksibel. Udsigtspunktet er særligt flot ved solnedgang. Tjek aktuelle åbningstider og priser før besøget.', 'Se efter lokale umbriske produkter, især olivenolie og enkle retter med regionale råvarer. Isbutikken er et valgfrit stop.', NULL)
ON CONFLICT (city_slug, lang) DO UPDATE SET
  title = EXCLUDED.title,
  region_label = EXCLUDED.region_label,
  subtitle = EXCLUDED.subtitle,
  lead = EXCLUDED.lead,
  good_to_know = EXCLUDED.good_to_know,
  local_food = EXCLUDED.local_food,
  hero_note = EXCLUDED.hero_note,
  updated_at = now();

INSERT INTO city_translations (city_slug, lang, title, region_label, subtitle, lead, good_to_know, local_food, hero_note)
VALUES ('spello', 'de', 'Spello', 'Umbrien · halber Tag', 'Eine umbrische Bergstadt, in der römische Mosaike, mittelalterliche Gassen und Ausblicke über Umbrien zu einem Familienabenteuer werden.', 'Spello entdeckt man am besten im eigenen Tempo: bei den Mosaiken anhalten, eine Kirche betreten, unterwegs ein Eis essen oder einen Punkt überspringen und weitergehen.', 'Die Route ist flexibel. Der Aussichtspunkt ist bei Sonnenuntergang besonders schön. Prüft vor dem Besuch aktuelle Öffnungszeiten und Preise.', 'Achtet auf lokale Produkte Umbriens, besonders Olivenöl und einfache Gerichte mit regionalen Zutaten. Eine Eisdiele ist ein optionaler Stopp.', NULL)
ON CONFLICT (city_slug, lang) DO UPDATE SET
  title = EXCLUDED.title,
  region_label = EXCLUDED.region_label,
  subtitle = EXCLUDED.subtitle,
  lead = EXCLUDED.lead,
  good_to_know = EXCLUDED.good_to_know,
  local_food = EXCLUDED.local_food,
  hero_note = EXCLUDED.hero_note,
  updated_at = now();

INSERT INTO city_translations (city_slug, lang, title, region_label, subtitle, lead, good_to_know, local_food, hero_note)
VALUES ('spello', 'en', 'Spello', 'Umbria · half day', 'An Umbrian hill town where Roman mosaics, medieval streets and views over Umbria come together in one family adventure.', 'Spello is best explored at your own pace: stop at the mosaics, enter a church, have ice cream along the way, or skip a stop and continue.', 'The route is flexible. The viewpoint is especially attractive at sunset. Check current opening hours and prices before visiting.', 'Look out for local Umbrian products, especially olive oil and simple dishes based on regional ingredients. If you pass an ice-cream shop, treat it as an optional stop, not an obligation.', NULL)
ON CONFLICT (city_slug, lang) DO UPDATE SET
  title = EXCLUDED.title,
  region_label = EXCLUDED.region_label,
  subtitle = EXCLUDED.subtitle,
  lead = EXCLUDED.lead,
  good_to_know = EXCLUDED.good_to_know,
  local_food = EXCLUDED.local_food,
  hero_note = EXCLUDED.hero_note,
  updated_at = now();

INSERT INTO city_translations (city_slug, lang, title, region_label, subtitle, lead, good_to_know, local_food, hero_note)
VALUES ('spello', 'es', 'Spello', 'Umbría · medio día', 'Una localidad de Umbría donde mosaicos romanos, calles medievales y panoramas de Umbría forman una aventura para toda la familia.', 'Spello se disfruta mejor a vuestro ritmo: podéis deteneros en los mosaicos, entrar en una iglesia, tomar un helado o saltaros una parada y continuar.', 'La ruta es flexible. El mirador es especialmente atractivo al atardecer. Comprobad los horarios y precios actuales antes de la visita.', 'Buscad productos locales de Umbría, sobre todo aceite de oliva y platos sencillos con ingredientes de la región. La heladería es una parada opcional.', NULL)
ON CONFLICT (city_slug, lang) DO UPDATE SET
  title = EXCLUDED.title,
  region_label = EXCLUDED.region_label,
  subtitle = EXCLUDED.subtitle,
  lead = EXCLUDED.lead,
  good_to_know = EXCLUDED.good_to_know,
  local_food = EXCLUDED.local_food,
  hero_note = EXCLUDED.hero_note,
  updated_at = now();

INSERT INTO city_translations (city_slug, lang, title, region_label, subtitle, lead, good_to_know, local_food, hero_note)
VALUES ('spello', 'fr', 'Spello', 'Ombrie · demi-journée', 'Un village d''Ombrie où mosaïques romaines, ruelles médiévales et panoramas sur la région deviennent une aventure en famille.', 'Spello se découvre à votre rythme : arrêtez-vous aux mosaïques, entrez dans une église, prenez une glace ou passez une étape et continuez.', 'L''itinéraire est flexible. Le belvédère est particulièrement agréable au coucher du soleil. Vérifiez les horaires et les prix actuels avant la visite.', 'Repérez les produits locaux de l''Ombrie, notamment l''huile d''olive et les plats simples à base d''ingrédients régionaux. La gelateria est une étape facultative.', NULL)
ON CONFLICT (city_slug, lang) DO UPDATE SET
  title = EXCLUDED.title,
  region_label = EXCLUDED.region_label,
  subtitle = EXCLUDED.subtitle,
  lead = EXCLUDED.lead,
  good_to_know = EXCLUDED.good_to_know,
  local_food = EXCLUDED.local_food,
  hero_note = EXCLUDED.hero_note,
  updated_at = now();

INSERT INTO city_translations (city_slug, lang, title, region_label, subtitle, lead, good_to_know, local_food, hero_note)
VALUES ('spello', 'hr', 'Spello', 'Umbrija · pola dana', 'Umbrijski gradić u kojem se rimski mozaici, srednjovjekovne ulice i pogledi na Umbriju spajaju u obiteljsku pustolovinu.', 'Spello je najbolje upoznati vlastitim ritmom: zaustavite se kod mozaika, uđite u crkvu, pojedite sladoled usput ili preskočite neku točku.', 'Ruta je fleksibilna. Vidikovac je posebno privlačan pri zalasku sunca. Prije posjeta provjerite aktualno radno vrijeme i cijene.', 'Obratite pažnju na lokalne umbrijske proizvode, posebno maslinovo ulje i jednostavna jela od regionalnih sastojaka. Sladoled je izborna stanica.', NULL)
ON CONFLICT (city_slug, lang) DO UPDATE SET
  title = EXCLUDED.title,
  region_label = EXCLUDED.region_label,
  subtitle = EXCLUDED.subtitle,
  lead = EXCLUDED.lead,
  good_to_know = EXCLUDED.good_to_know,
  local_food = EXCLUDED.local_food,
  hero_note = EXCLUDED.hero_note,
  updated_at = now();

INSERT INTO city_translations (city_slug, lang, title, region_label, subtitle, lead, good_to_know, local_food, hero_note)
VALUES ('spello', 'hu', 'Spello', 'Umbria · fél nap', 'Umbriai kisváros, ahol a római mozaikok, a középkori utcák és az umbriai panoráma egyetlen családi kalanddá áll össze.', 'Spellót érdemes a saját tempótokban felfedezni: megállhattok a mozaikoknál, bemehettek egy templomba, ehettek egy fagyit útközben, vagy kihagyhattok egy pontot.', 'Az útvonal rugalmas. A kilátó naplementekor különösen szép. Látogatás előtt ellenőrizzétek az aktuális nyitvatartást és árakat.', 'Figyeljetek a helyi umbriai termékekre, különösen az olívaolajra és a regionális alapanyagokból készült egyszerű ételekre. A fagyizó opcionális megálló.', NULL)
ON CONFLICT (city_slug, lang) DO UPDATE SET
  title = EXCLUDED.title,
  region_label = EXCLUDED.region_label,
  subtitle = EXCLUDED.subtitle,
  lead = EXCLUDED.lead,
  good_to_know = EXCLUDED.good_to_know,
  local_food = EXCLUDED.local_food,
  hero_note = EXCLUDED.hero_note,
  updated_at = now();

INSERT INTO city_translations (city_slug, lang, title, region_label, subtitle, lead, good_to_know, local_food, hero_note)
VALUES ('spello', 'it', 'Spello', 'Umbria · mezza giornata', 'Un borgo umbro dove mosaici romani, vicoli medievali e panorami sull''Umbria diventano un''unica avventura per tutta la famiglia.', 'Spello si scopre meglio seguendo il proprio ritmo: ci si può fermare ai mosaici, entrare in una chiesa, prendere un gelato lungo il percorso oppure saltare una tappa e proseguire.', 'L''itinerario è flessibile. Il belvedere è particolarmente suggestivo al tramonto. Prima della visita controllate sempre orari e prezzi aggiornati.', 'Fate attenzione ai prodotti umbri locali, soprattutto all''olio extravergine d''oliva e ai piatti semplici preparati con ingredienti del territorio. Se incontrate una gelateria, consideratela una tappa facoltativa, non un obbligo.', NULL)
ON CONFLICT (city_slug, lang) DO UPDATE SET
  title = EXCLUDED.title,
  region_label = EXCLUDED.region_label,
  subtitle = EXCLUDED.subtitle,
  lead = EXCLUDED.lead,
  good_to_know = EXCLUDED.good_to_know,
  local_food = EXCLUDED.local_food,
  hero_note = EXCLUDED.hero_note,
  updated_at = now();

INSERT INTO city_translations (city_slug, lang, title, region_label, subtitle, lead, good_to_know, local_food, hero_note)
VALUES ('spello', 'nl', 'Spello', 'Umbrië · halve dag', 'Een Umbrisch stadje waar Romeinse mozaïeken, middeleeuwse straatjes en uitzichten over Umbrië samenkomen in één familieavontuur.', 'Ontdek Spello in jullie eigen tempo: stop bij de mozaïeken, ga een kerk binnen, neem onderweg een ijsje of sla een halte over.', 'De route is flexibel. Het uitzichtpunt is vooral mooi bij zonsondergang. Controleer voor vertrek de actuele openingstijden en prijzen.', 'Let op lokale Umbrische producten, vooral olijfolie en eenvoudige gerechten met regionale ingrediënten. De ijssalon is een optionele stop.', NULL)
ON CONFLICT (city_slug, lang) DO UPDATE SET
  title = EXCLUDED.title,
  region_label = EXCLUDED.region_label,
  subtitle = EXCLUDED.subtitle,
  lead = EXCLUDED.lead,
  good_to_know = EXCLUDED.good_to_know,
  local_food = EXCLUDED.local_food,
  hero_note = EXCLUDED.hero_note,
  updated_at = now();

INSERT INTO city_translations (city_slug, lang, title, region_label, subtitle, lead, good_to_know, local_food, hero_note)
VALUES ('spello', 'no', 'Spello', 'Umbria · en halv dag', 'En umbrisk småby der romerske mosaikker, middelalderske gater og utsikt over Umbria blir til ett familieeventyr.', 'Opplev Spello i deres eget tempo: stopp ved mosaikkene, gå inn i en kirke, ta en is underveis eller hopp over et stopp.', 'Ruten er fleksibel. Utsiktspunktet er spesielt fint ved solnedgang. Sjekk aktuelle åpningstider og priser før besøket.', 'Se etter lokale produkter fra Umbria, særlig olivenolje og enkle retter med regionale råvarer. Isbaren er et valgfritt stopp.', NULL)
ON CONFLICT (city_slug, lang) DO UPDATE SET
  title = EXCLUDED.title,
  region_label = EXCLUDED.region_label,
  subtitle = EXCLUDED.subtitle,
  lead = EXCLUDED.lead,
  good_to_know = EXCLUDED.good_to_know,
  local_food = EXCLUDED.local_food,
  hero_note = EXCLUDED.hero_note,
  updated_at = now();

INSERT INTO city_translations (city_slug, lang, title, region_label, subtitle, lead, good_to_know, local_food, hero_note)
VALUES ('spello', 'pl', 'Spello', 'Umbria · pół dnia', 'Umbryjskie miasteczko z rzymskimi śladami, renesansowymi freskami, średniowiecznymi bramami i panoramą Umbrii.', 'Zaakceptowana wersja redakcyjna v31 — źródło prawdy dla implementacji.', NULL, NULL, NULL)
ON CONFLICT (city_slug, lang) DO UPDATE SET
  title = EXCLUDED.title,
  region_label = EXCLUDED.region_label,
  subtitle = EXCLUDED.subtitle,
  lead = EXCLUDED.lead,
  good_to_know = EXCLUDED.good_to_know,
  local_food = EXCLUDED.local_food,
  hero_note = EXCLUDED.hero_note,
  updated_at = now();

INSERT INTO city_translations (city_slug, lang, title, region_label, subtitle, lead, good_to_know, local_food, hero_note)
VALUES ('spello', 'pt', 'Spello', 'Úmbria · meio dia', 'Uma cidade da Úmbria onde mosaicos romanos, ruas medievais e vistas sobre a região se transformam numa aventura para toda a família.', 'Explore Spello ao vosso ritmo: parem junto aos mosaicos, entrem numa igreja, tomem um gelado pelo caminho ou saltem uma paragem.', 'O percurso é flexível. O miradouro é especialmente bonito ao pôr do sol. Confirmem os horários e preços atuais antes da visita.', 'Procurem produtos locais da Úmbria, sobretudo azeite e pratos simples com ingredientes regionais. A gelataria é uma paragem opcional.', NULL)
ON CONFLICT (city_slug, lang) DO UPDATE SET
  title = EXCLUDED.title,
  region_label = EXCLUDED.region_label,
  subtitle = EXCLUDED.subtitle,
  lead = EXCLUDED.lead,
  good_to_know = EXCLUDED.good_to_know,
  local_food = EXCLUDED.local_food,
  hero_note = EXCLUDED.hero_note,
  updated_at = now();

INSERT INTO city_translations (city_slug, lang, title, region_label, subtitle, lead, good_to_know, local_food, hero_note)
VALUES ('spello', 'ro', 'Spello', 'Umbria · jumătate de zi', 'Un orășel din Umbria unde mozaicurile romane, străduțele medievale și priveliștile asupra regiunii devin o singură aventură de familie.', 'Descoperiți Spello în ritmul vostru: opriți-vă la mozaicuri, intrați într-o biserică, luați o înghețată pe drum sau săriți peste un punct.', 'Traseul este flexibil. Belvederea este deosebit de frumoasă la apus. Verificați programul și prețurile actuale înainte de vizită.', 'Urmăriți produsele locale din Umbria, mai ales uleiul de măsline și preparatele simple cu ingrediente regionale. Gelateria este o oprire opțională.', NULL)
ON CONFLICT (city_slug, lang) DO UPDATE SET
  title = EXCLUDED.title,
  region_label = EXCLUDED.region_label,
  subtitle = EXCLUDED.subtitle,
  lead = EXCLUDED.lead,
  good_to_know = EXCLUDED.good_to_know,
  local_food = EXCLUDED.local_food,
  hero_note = EXCLUDED.hero_note,
  updated_at = now();

INSERT INTO city_translations (city_slug, lang, title, region_label, subtitle, lead, good_to_know, local_food, hero_note)
VALUES ('spello', 'sk', 'Spello', 'Umbria · pol dňa', 'Umbrijské mestečko, kde sa rímske mozaiky, stredoveké uličky a výhľady na Umbríu spájajú do jedného rodinného dobrodružstva.', 'Spello spoznávajte vlastným tempom: zastavte sa pri mozaikách, vojdite do kostola, dajte si po ceste zmrzlinu alebo niektorú zastávku vynechajte.', 'Trasa je flexibilná. Vyhliadka je obzvlášť atraktívna pri západe slnka. Pred návštevou skontrolujte aktuálne otváracie hodiny a ceny.', 'Všímajte si miestne umbrijské produkty, najmä olivový olej a jednoduché jedlá z regionálnych surovín. Zmrzlina je voliteľná zastávka.', NULL)
ON CONFLICT (city_slug, lang) DO UPDATE SET
  title = EXCLUDED.title,
  region_label = EXCLUDED.region_label,
  subtitle = EXCLUDED.subtitle,
  lead = EXCLUDED.lead,
  good_to_know = EXCLUDED.good_to_know,
  local_food = EXCLUDED.local_food,
  hero_note = EXCLUDED.hero_note,
  updated_at = now();

INSERT INTO city_translations (city_slug, lang, title, region_label, subtitle, lead, good_to_know, local_food, hero_note)
VALUES ('spello', 'sv', 'Spello', 'Umbrien · en halv dag', 'En umbrisk småstad där romerska mosaiker, medeltida gränder och utsikter över Umbrien blir ett gemensamt familjeäventyr.', 'Upptäck Spello i er egen takt: stanna vid mosaikerna, gå in i en kyrka, ta en glass på vägen eller hoppa över ett stopp.', 'Rutten är flexibel. Utsiktspunkten är särskilt fin vid solnedgång. Kontrollera aktuella öppettider och priser före besöket.', 'Leta efter lokala produkter från Umbrien, särskilt olivolja och enkla rätter med regionala råvaror. Glassbaren är ett valfritt stopp.', NULL)
ON CONFLICT (city_slug, lang) DO UPDATE SET
  title = EXCLUDED.title,
  region_label = EXCLUDED.region_label,
  subtitle = EXCLUDED.subtitle,
  lead = EXCLUDED.lead,
  good_to_know = EXCLUDED.good_to_know,
  local_food = EXCLUDED.local_food,
  hero_note = EXCLUDED.hero_note,
  updated_at = now();

INSERT INTO city_translations (city_slug, lang, title, region_label, subtitle, lead, good_to_know, local_food, hero_note)
VALUES ('spello', 'uk', 'Спелло', 'Умбрія · пів дня', 'Умбрійське містечко, де римські мозаїки, середньовічні вулички та краєвиди Умбрії складаються в одну сімейну пригоду.', 'Спелло найкраще відкривати у власному темпі: зупинитися біля мозаїк, зайти до церкви, скуштувати морозиво дорогою або пропустити один пункт.', 'Маршрут гнучкий. Оглядовий майданчик особливо привабливий на заході сонця. Перед візитом перевірте актуальні години роботи та ціни.', 'Зверніть увагу на місцеві продукти Умбрії, особливо оливкову олію та прості страви з регіональних продуктів. Джелатерія — необов''язкова зупинка.', NULL)
ON CONFLICT (city_slug, lang) DO UPDATE SET
  title = EXCLUDED.title,
  region_label = EXCLUDED.region_label,
  subtitle = EXCLUDED.subtitle,
  lead = EXCLUDED.lead,
  good_to_know = EXCLUDED.good_to_know,
  local_food = EXCLUDED.local_food,
  hero_note = EXCLUDED.hero_note,
  updated_at = now();



-- KROK 3: stop_translations — UPSERT
-- 11 przystanków × 17 języków = 187 wierszy

-- === JĘZYK: CS ===
INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (58, 'cs', 'Parkoviště Villa dei Mosaici di Spello', ARRAY['Praktický začátek pro návštěvu Spella. Auto zde necháte a dál pokračujete pěšky.', 'Před parkováním zkontrolujte ZTL, poplatky a omezení. Rozhodující je aktuální značení na místě.'], NULL, NULL, NULL, 'Na místě zkontrolujte aktuální značení parkoviště a ZTL.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (59, 'cs', 'Villa dei Mosaici di Spello', ARRAY['Villa dei Mosaici představuje pozůstatky římské vily a její mozaiky. Umožňuje vnímat římský život jako skutečný prostor, ne jen jako historické datum.', 'Všimněte si triclínia, římské jídelny se třemi místy k ležení. Dům sloužil také setkávání a hostinám.'], 'Najdi detail mozaiky, který ti připomíná moderní dekoraci. Pak společně vyberte, kde byste dnes vytvořili podobný pokoj.', 'Nejprve si prohlédněte podlahy a uspořádání místností, ne jen jednotlivé ozdobné fragmenty.', NULL, NULL, NULL, 'Zrób jedno zdjęcie mozaiki tak, aby było widać jej układ jako całość, a nie tylko pojedynczy fragment.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (72, 'cs', 'Porta Consolare', ARRAY['Zahrajte si na archeology. Najděte tři prvky z různých období historie brány, jeden vyfoťte.'], 'Zahrajte si na archeology. Najděte tři prvky z různých období historie brány, jeden vyfoťte.', 'Brána byla přestavěna v renesanci; tři mramorové sochy pocházejí z konce 1. století př. n. l. a byly zde znovu použity.', 'Tři mramorové sochy jsou znovu použité římské prvky.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (61, 'cs', 'Kostel Sant''Andrea', ARRAY['Sant''Andrea leží na Via Cavour a přirozeně zapadá do procházky historickým centrem. Zastavte se a prohlédněte si výzdobu.', 'Rozlišujte mezi údaji doloženými prameny a místními příběhy. Nepotvrzená autorství nepředstavujte jako fakta.'], 'Najdi detail mozaiky, který ti připomíná moderní dekoraci. Pak společně vyberte, kde byste dnes vytvořili podobný pokoj.', 'Nejprve si prohlédněte podlahy a uspořádání místností, ne jen jednotlivé ozdobné fragmenty.', NULL, NULL, 'Je vyžadováno vhodné oblečení; ramena a kolena by měla být zakrytá.', 'Zrób zdjęcie jednego powtarzającego się motywu, jeśli fotografowanie jest dozwolone.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (60, 'cs', 'Santa Maria Maggiore', ARRAY['Santa Maria Maggiore patří k hlavním církevním památkám Spella. Interiér spojuje středověkou historii s pozdějšími úpravami a uměním.', 'Zvláštní pozornost věnujte Cappella Baglioni a příběhům, které vyprávějí obrazy a fresky.'], 'Najdi detail mozaiky, který ti připomíná moderní dekoraci. Pak společně vyberte, kde byste dnes vytvořili podobný pokoj.', 'Nejprve si prohlédněte podlahy a uspořádání místností, ne jen jednotlivé ozdobné fragmenty.', 'W kościołach Umbrii sztuka często opowiada historię obrazami. Spróbuj odczytać jedną scenę bez korzystania z opisu.', NULL, 'Je vyžadováno vhodné oblečení; ramena a kolena by měla být zakrytá.', 'Zrób zdjęcie wybranego detalu dekoracji Cappella Baglioni, jeśli regulamin miejsca na to pozwala.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (75, 'cs', 'Via Giulia — Roman trace', ARRAY['Zahrajte si na archeology. Najděte tři prvky z různých období historie brány, jeden vyfoťte.'], 'Zahrajte si na archeology. Najděte tři prvky z různých období historie brány, jeden vyfoťte.', 'Brána byla přestavěna v renesanci; tři mramorové sochy pocházejí z konce 1. století př. n. l. a byly zde znovu použity.', 'Tři mramorové sochy jsou znovu použité římské prvky.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (64, 'cs', 'Porta Venere + věže Torri di Properzio', ARRAY['Porta Venere a Torri di Properzio patří k nejvýraznějším pozůstatkům opevnění. Brána ukazuje, jak byl kontrolován vstup do města.', 'Je to dobré místo k vysvětlení, proč města měla hradby: kvůli obraně a kontrole vstupu.'], 'Najdi detail mozaiky, který ti připomíná moderní dekoraci. Pak společně vyberte, kde byste dnes vytvořili podobný pokoj.', 'Nejprve si prohlédněte podlahy a uspořádání místností, ne jen jednotlivé ozdobné fragmenty.', NULL, NULL, NULL, 'Zrób zdjęcie, na którym widać jednocześnie bramę i wieże.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (77, 'cs', 'VICOLI / BELVEDERE — FINAŁ SPACERU', ARRAY[]::text[], NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (62, 'cs', 'Gelateria La Paola', ARRAY['Volitelná zastávka na zmrzlinu na Via Cavour. Rodiče se mohou rozhodnout podle chuti rodiny.', 'Zmrzlina je zařazena před závěrečnou částí prohlídky a večeří. Pokud ji nechcete, zastávku vynechte.'], 'Najdi detail mozaiky, který ti připomíná moderní dekoraci. Pak společně vyberte, kde byste dnes vytvořili podobný pokoj.', NULL, 'Zwróć uwagę, czy w ofercie pojawiają się smaki lub składniki charakterystyczne dla Umbrii.', 'Volitelná zastávka — můžete ji vynechat.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (65, 'cs', 'Vyhlídka', ARRAY['Vyhlídka nabízí jiný pohled na Spello a umbrijskou krajinu. Po úzkých ulicích je to dobré místo k odpočinku.', 'Při západu slunce může být místo zvlášť krásné. Rodina může pořadí přizpůsobit svému dni.'], 'Najdi detail mozaiky, který ti připomíná moderní dekoraci. Pak společně vyberte, kde byste dnes vytvořili podobný pokoj.', 'Nejprve si prohlédněte podlahy a uspořádání místností, ne jen jednotlivé ozdobné fragmenty.', NULL, NULL, NULL, 'Zrób rodzinne zdjęcie z panoramą Umbrii w tle.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (66, 'cs', 'Osteria del Buchetto', ARRAY['Závěrečná zastávka na klidnou večeři. Ceny a otevírací dobu je třeba ověřit v aktuálním zdroji.', 'Při výběru restaurace zvažte také čas večeře a prostředí vhodné pro rodinu.'], NULL, NULL, 'Przed zamówieniem zapytajcie, które danie lub składnik jest najbardziej lokalny.', 'Doporučujeme rezervaci; podnik má omezený počet míst. Ověřte otevírací dobu.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

-- === JĘZYK: DA ===
INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (58, 'da', 'Parkering Villa Dei Mosaici Di Spello', ARRAY['Dette er det praktiske startpunkt for besøget i Spello. Lad bilen stå her og fortsæt til fods.', 'Tjek skilte om ZTL, betaling og begrænsninger før parkering. Skiltene på stedet gælder.'], NULL, NULL, NULL, 'Kontrollér den aktuelle skiltning for parkering og ZTL på stedet.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (59, 'da', 'Villa dei Mosaici di Spello', ARRAY['Villa dei Mosaici viser resterne af en romersk villa og dens mosaikker. Her bliver romersk liv til et konkret rum, ikke kun en historisk dato.', 'Læg mærke til triclinium, den romerske spisesal med tre liggepladser. Huset var også et sted for møder og fester.'], 'Find en mosaikdetalje, der minder dig om moderne dekoration. Vælg derefter sammen, hvor I ville skabe et lignende rum i dag.', 'Se først på gulvene og rummenes indretning, ikke kun på enkelte dekorative fragmenter.', NULL, NULL, NULL, 'Zrób jedno zdjęcie mozaiki tak, aby było widać jej układ jako całość, a nie tylko pojedynczy fragment.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (72, 'da', 'Porta Consolare', ARRAY['Leg arkæologer. Find tre elementer fra forskellige perioder i portens historie og fotografer ét.'], 'Leg arkæologer. Find tre elementer fra forskellige perioder i portens historie og fotografer ét.', 'Porten blev ombygget i renæssancen; de tre marmorskulpturer er fra slutningen af 1. årh. f.Kr. og blev genbrugt her.', 'De tre marmorskulpturer er genbrugte romerske elementer.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (61, 'da', 'Sant''Andrea-kirken', ARRAY['Sant''Andrea ligger på Via Cavour og passer naturligt ind i turen gennem det historiske centrum. Stop og se på udsmykningen.', 'Skeln mellem oplysninger dokumenteret af kilder og lokale fortællinger. Ukendte tilskrivninger må ikke fremstilles som fakta.'], 'Find en mosaikdetalje, der minder dig om moderne dekoration. Vælg derefter sammen, hvor I ville skabe et lignende rum i dag.', 'Se først på gulvene og rummenes indretning, ikke kun på enkelte dekorative fragmenter.', NULL, NULL, 'Respektfuldt tøj er påkrævet; skuldre og knæ bør være dækket.', 'Zrób zdjęcie jednego powtarzającego się motywu, jeśli fotografowanie jest dozwolone.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (60, 'da', 'Santa Maria Maggiore', ARRAY['Santa Maria Maggiore er et af Spellos vigtigste religiøse monumenter. Interiøret forener middelalderlig historie med senere ændringer og kunst.', 'Se især på Cappella Baglioni og de historier, som malerier og fresker fortæller.'], 'Find en mosaikdetalje, der minder dig om moderne dekoration. Vælg derefter sammen, hvor I ville skabe et lignende rum i dag.', 'Se først på gulvene og rummenes indretning, ikke kun på enkelte dekorative fragmenter.', 'W kościołach Umbrii sztuka często opowiada historię obrazami. Spróbuj odczytać jedną scenę bez korzystania z opisu.', NULL, 'Respektfuldt tøj er påkrævet; skuldre og knæ bør være dækket.', 'Zrób zdjęcie wybranego detalu dekoracji Cappella Baglioni, jeśli regulamin miejsca na to pozwala.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (75, 'da', 'Via Giulia — Roman trace', ARRAY['Leg arkæologer. Find tre elementer fra forskellige perioder i portens historie og fotografer ét.'], 'Leg arkæologer. Find tre elementer fra forskellige perioder i portens historie og fotografer ét.', 'Porten blev ombygget i renæssancen; de tre marmorskulpturer er fra slutningen af 1. årh. f.Kr. og blev genbrugt her.', 'De tre marmorskulpturer er genbrugte romerske elementer.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (64, 'da', 'Porta Venere + Torri di Properzio', ARRAY['Porta Venere og Torri di Properzio er karakteristiske rester af byens befæstning. Porten viser, hvordan adgangen blev kontrolleret.', 'Det er et godt sted at tale om, hvorfor byer havde mure: forsvar og kontrol med adgangen.'], 'Find en mosaikdetalje, der minder dig om moderne dekoration. Vælg derefter sammen, hvor I ville skabe et lignende rum i dag.', 'Se først på gulvene og rummenes indretning, ikke kun på enkelte dekorative fragmenter.', NULL, NULL, NULL, 'Zrób zdjęcie, na którym widać jednocześnie bramę i wieże.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (77, 'da', 'VICOLI / BELVEDERE — FINAŁ SPACERU', ARRAY[]::text[], NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (62, 'da', 'Gelateria La Paola', ARRAY['Et valgfrit isstop på Via Cavour. Forældrene kan selv beslutte, om familien vil stoppe.', 'Isen ligger før den sidste del af besøget og middagen. Hvis I ikke ønsker is, kan stoppet springes over.'], 'Find en mosaikdetalje, der minder dig om moderne dekoration. Vælg derefter sammen, hvor I ville skabe et lignende rum i dag.', NULL, 'Zwróć uwagę, czy w ofercie pojawiają się smaki lub składniki charakterystyczne dla Umbrii.', 'Valgfrit stop — I kan springe det over.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (65, 'da', 'Udsigtspunkt', ARRAY['Udsigtspunktet giver et andet blik på Spello og Umbriens landskab. Efter de smalle gader er det et godt sted at holde pause.', 'Stedet kan være særligt smukt ved solnedgang. Familien kan tilpasse rækkefølgen til dagen.'], 'Find en mosaikdetalje, der minder dig om moderne dekoration. Vælg derefter sammen, hvor I ville skabe et lignende rum i dag.', 'Se først på gulvene og rummenes indretning, ikke kun på enkelte dekorative fragmenter.', NULL, NULL, NULL, 'Zrób rodzinne zdjęcie z panoramą Umbrii w tle.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (66, 'da', 'Osteria del Buchetto', ARRAY['Sidste stop til en rolig middag. Priser og åbningstider skal kontrolleres i en aktuel kilde.', 'Ved valg af restaurant er både middagstidspunkt og familievenlig stemning vigtige.'], NULL, NULL, 'Przed zamówieniem zapytajcie, które danie lub składnik jest najbardziej lokalny.', 'Reservation anbefales; der er et begrænset antal pladser. Tjek åbningstiderne før besøget.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

-- === JĘZYK: DE ===
INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (58, 'de', 'Parcheggio Villa Dei Mosaici Di Spello', ARRAY['Dies ist der praktische Ausgangspunkt für die Erkundung von Spello. Hier bleibt das Auto stehen; danach geht es zu Fuß weiter.', 'Prüft vor dem Parken die Hinweise zu ZTL, Gebühren und Einschränkungen. Vor Ort geltende Schilder haben Vorrang.'], NULL, NULL, NULL, 'Öffentliche Toiletten in Spello; genaue Lage und Verfügbarkeit vor Ort prüfen.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (59, 'de', 'Villa dei Mosaici di Spello', ARRAY['Die Villa dei Mosaici zeigt die Reste einer römischen Villa und ihrer Mosaike. Sie macht römisches Leben als konkreten Wohnraum erfahrbar.', 'Beachtet das Triclinium, den römischen Speisesaal mit drei Liegeplätzen. Das Haus war nicht nur Wohnort, sondern auch Ort für Treffen und Festmahle.'], 'Finde ein Mosaikdetail, das dich an eine moderne Dekoration erinnert. Überlegt dann gemeinsam, wo ihr heute einen ähnlichen Raum gestalten würdet.', 'Sucht zuerst nach Böden und der Raumaufteilung, nicht nur nach einzelnen Dekorationsfragmenten.', NULL, NULL, NULL, 'Zrób jedno zdjęcie mozaiki tak, aby było widać jej układ jako całość, a nie tylko pojedynczy fragment.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (72, 'de', 'Porta Consolare', ARRAY['Spielt Archäologen. Findet drei Elemente aus verschiedenen Epochen der Geschichte des Tores. Wählt eines aus und fotografiert es.'], 'Spielt Archäologen. Findet drei Elemente aus verschiedenen Epochen der Geschichte des Tores. Wählt eines aus und fotografiert es.', 'Das Tor wurde in der Renaissance umgebaut; die drei Marmorstatuen stammen aus dem späten 1. Jahrhundert v. Chr. und wurden hier wiederverwendet.', 'Die drei Marmorstatuen sind wiederverwendete römische Elemente.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (61, 'de', 'Chiesa di Sant''Andrea', ARRAY['Sant''Andrea liegt an der Via Cavour und passt natürlich in den Weg durch das historische Zentrum. Bleibt kurz stehen und betrachtet die Ausstattung.', 'Unterscheidet bei der Beschreibung von Kunstwerken belegte Angaben von lokalen Erzählungen. Unbestätigte Zuschreibungen dürfen nicht als Fakten erscheinen.'], 'Finde ein Mosaikdetail, das dich an eine moderne Dekoration erinnert. Überlegt dann gemeinsam, wo ihr heute einen ähnlichen Raum gestalten würdet.', 'Sucht zuerst nach Böden und der Raumaufteilung, nicht nur nach einzelnen Dekorationsfragmenten.', NULL, NULL, 'Respektvolle Kleidung ist erforderlich; Schultern und Knie sollten bedeckt sein.', 'Zrób zdjęcie jednego powtarzającego się motywu, jeśli fotografowanie jest dozwolone.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (60, 'de', 'Santa Maria Maggiore', ARRAY['Santa Maria Maggiore gehört zu den wichtigsten Sakraldenkmälern Spellos. Das Innere verbindet mittelalterliche Geschichte mit späteren Veränderungen und Kunstwerken.', 'Besonders wichtig ist die Cappella Baglioni. Betrachtet, welche Geschichten die Bilder und Fresken erzählen.'], 'Finde ein Mosaikdetail, das dich an eine moderne Dekoration erinnert. Überlegt dann gemeinsam, wo ihr heute einen ähnlichen Raum gestalten würdet.', 'Sucht zuerst nach Böden und der Raumaufteilung, nicht nur nach einzelnen Dekorationsfragmenten.', 'W kościołach Umbrii sztuka często opowiada historię obrazami. Spróbuj odczytać jedną scenę bez korzystania z opisu.', NULL, 'Respektvolle Kleidung ist erforderlich; Schultern und Knie sollten bedeckt sein.', 'Zrób zdjęcie wybranego detalu dekoracji Cappella Baglioni, jeśli regulamin miejsca na to pozwala.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (75, 'de', 'Via Giulia — römische Spur', ARRAY['Findet ein Detail, das viele Besucher übersehen könnten. Fotografiert es und erklärt, was auf seinen Ursprung in der antiken Stadt hindeutet.'], 'Findet ein Detail, das viele Besucher übersehen könnten. Fotografiert es und erklärt, was auf seinen Ursprung in der antiken Stadt hindeutet.', 'Achtet auf Steinsetzung, Material, Form oder ein Bauelement, das auf römischen Ursprung schließen lässt.', 'Spello lässt sich wie eine Überlagerung verschiedener Städte und Epochen lesen.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (64, 'de', 'Porta Venere + Torri di Properzio', ARRAY['Porta Venere und die Torri di Properzio gehören zu den charakteristischen Resten der Befestigung Spellos. Das Tor zeigt, wie der Zugang zur Stadt kontrolliert wurde.', 'Hier lässt sich erklären, warum Städte Mauern und kontrollierte Eingänge hatten: zur Verteidigung und zur Steuerung des Verkehrs.'], 'Finde ein Mosaikdetail, das dich an eine moderne Dekoration erinnert. Überlegt dann gemeinsam, wo ihr heute einen ähnlichen Raum gestalten würdet.', 'Sucht zuerst nach Böden und der Raumaufteilung, nicht nur nach einzelnen Dekorationsfragmenten.', NULL, NULL, NULL, 'Zrób zdjęcie, na którym widać jednocześnie bramę i wieże.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (77, 'de', 'VICOLI / BELVEDERE — FINAŁ SPACERU', ARRAY[]::text[], NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (62, 'de', 'Gelateria La Paola', ARRAY['Eine optionale Eispause an der Via Cavour. Sie ist ein eigener Punkt, damit Eltern spontan entscheiden können.', 'Das Eis liegt bewusst vor dem letzten Besichtigungsabschnitt und dem Abendessen. Wer kein Eis möchte, überspringt den Punkt.'], 'Finde ein Mosaikdetail, das dich an eine moderne Dekoration erinnert. Überlegt dann gemeinsam, wo ihr heute einen ähnlichen Raum gestalten würdet.', NULL, 'Zwróć uwagę, czy w ofercie pojawiają się smaki lub składniki charakterystyczne dla Umbrii.', 'Punkt opcjonalny — można go pominąć.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (65, 'de', 'Belvedere', ARRAY['Der Belvedere bietet einen anderen Blick auf Spello und die umbrische Landschaft. Nach den engen Gassen ist dies ein guter Ort für eine Pause.', 'Bei Sonnenuntergang kann der Ort besonders schön sein. Die Familie kann die Reihenfolge der Stopps an den eigenen Tag anpassen.'], 'Finde ein Mosaikdetail, das dich an eine moderne Dekoration erinnert. Überlegt dann gemeinsam, wo ihr heute einen ähnlichen Raum gestalten würdet.', 'Sucht zuerst nach Böden und der Raumaufteilung, nicht nur nach einzelnen Dekorationsfragmenten.', NULL, NULL, NULL, 'Zrób rodzinne zdjęcie z panoramą Umbrii w tle.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (66, 'de', 'Osteria del Buchetto', ARRAY['Dies ist der letzte Punkt für ein ruhiges Abendessen. Preise und Öffnungszeiten sollten vor dem Besuch mit einer aktuellen Quelle geprüft werden.', 'Bei der Restaurantwahl zählen neben der Bewertung auch die passende Essenszeit und eine familienfreundliche Atmosphäre.'], NULL, NULL, 'Przed zamówieniem zapytajcie, które danie lub składnik jest najbardziej lokalny.', 'Reservierung empfohlen; das Lokal hat nur wenige Plätze. Öffnungszeiten vor dem Besuch prüfen.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

-- === JĘZYK: EN ===
INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (58, 'en', 'Parcheggio Villa Dei Mosaici Di Spello', ARRAY['This is the practical starting point for exploring Spello. Leave the car here and continue on foot, so you can enter the historic centre without adding driving to the route.', 'Before parking, check signs concerning the ZTL, fees and any restrictions. If conditions on site differ from the guide, the current signs take priority.'], NULL, NULL, NULL, 'Check the current parking and ZTL signs on site.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (59, 'en', 'Villa dei Mosaici di Spello', ARRAY['Villa dei Mosaici is an archaeological site presenting the remains of a Roman villa and its mosaic decoration. It is a good first stop because it lets you see Roman life not as an abstract date, but as a house with rooms and floors that survived for centuries.', 'Pay attention to the triclinium. It was a Roman dining room; the name refers to three reclining places arranged around the table. It shows that a Roman house was not only a place to live, but also a place for gatherings and feasts.'], 'Find a mosaic detail that reminds you of a modern decoration. Then choose together where you would create a similar room today.', 'Look first at the floors and the layout of the rooms, not only at individual decorative fragments.', NULL, NULL, NULL, 'Take one photo of a mosaic showing its overall pattern, not just a single fragment.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (72, 'en', 'Porta Consolare', ARRAY['Play archaeologist. Find three elements from different periods in the history of the gate. Choose one and take a photo.'], 'Play archaeologist. Find three elements from different periods in the history of the gate. Choose one and take a photo.', 'The gate was rebuilt in the Renaissance, while the three marble statues date from the end of the 1st century BCE and were reused here.', 'The three marble statues are reused Roman elements.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (61, 'en', 'Chiesa di Sant''Andrea', ARRAY['Chiesa di Sant''Andrea stands on Via Cavour, so it naturally fits the walk through Spello''s historic centre. It is a place to pause and read its decoration rather than treat the church as another box to tick.', 'When describing works inside, distinguish what is supported by sources from local stories. If a work or attribution is not confirmed, do not present it as fact.'], 'Find one detail that is repeated in the interior decoration. Why do you think the artist may have used it more than once?', 'Look up first — the ceiling and upper parts of a church can tell a different story from the lower walls.', NULL, NULL, 'Respectful dress is required.', 'Take a photo of one repeated motif if photography is allowed.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (60, 'en', 'Santa Maria Maggiore', ARRAY['Santa Maria Maggiore is one of Spello''s key religious monuments. Its interior combines the town''s medieval history with later changes and works of art, so look not only at the age of the building but also at how its decoration changed over time.', 'Pay special attention to the Cappella Baglioni and the scenes shown in its decoration. In churches, always check what the main artwork near the altar represents and what stories the paintings and frescoes tell.'], 'Find a scene in the Cappella Baglioni that feels most like a film story. Tell each other what is happening and how you can recognize it.', 'First look at the whole scene, then search for individual figures and details.', 'In Umbrian churches, art often tells stories through images. Try to read one scene without using the description.', NULL, 'Respectful dress is required; shoulders and knees should be covered.', 'Take a photo of a chosen detail of the Cappella Baglioni if photography is allowed.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (75, 'en', 'Via Giulia — Roman trace', ARRAY['Find a detail most visitors might miss. Take a photo and explain what tells you it belongs to the ancient city.'], 'Find a detail most visitors might miss. Take a photo and explain what tells you it belongs to the ancient city.', 'Look for stonework, material, shape or a construction element that suggests Roman origin.', 'Spello can be read as layers of different cities placed one over another.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (64, 'en', 'Porta Venere + Torri di Properzio', ARRAY['Porta Venere and the Torri di Properzio are among Spello''s most characteristic remains of its former fortifications. The gate helps you imagine how the walls controlled entry to the town, while the nearby towers reinforce the monumental character of the whole complex.', 'This is a good place to talk about why towns were surrounded by walls. A gate was not decoration: it was a controlled entrance and part of the town''s defence and movement system.'], 'Look at the gate as an old checkpoint. Think of two ways guards might have checked people entering the town.', 'Notice the thickness of the walls, the shape of openings and the gate''s position relative to the town.', NULL, NULL, NULL, 'Take a photo showing both the gate and the towers.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (77, 'en', 'VICOLI / BELVEDERE — FINAŁ SPACERU', ARRAY[]::text[], NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (62, 'en', 'Gelateria La Paola', ARRAY['This is an optional ice-cream stop on Via Cavour. It is a separate stop so parents can see it on the route and decide whether the family wants to stop here.', 'Ice cream is deliberately placed before the final sightseeing stage and dinner. If the family is not in the mood for dessert or has already had ice cream, simply skip this stop.'], 'Choose a flavour you have never tried before. Everyone gives it a score and explains it in one sentence.', NULL, 'See whether the menu includes flavours or ingredients characteristic of Umbria.', 'Optional stop — you can skip it.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (65, 'en', 'Belvedere', ARRAY['The belvedere gives a different perspective on Spello and the Umbrian landscape. After several stops among compact historic buildings, pause here to see how the town looks from above and how its setting shapes the view.', 'This place can be especially attractive at sunset. We do not, however, make the whole trip depend on sunset — parents can adapt the order to their own day.'], 'Find three different parts of the view: buildings, fields or trees, and distant hills. Which changes most when you move to a different spot?', 'Look at the panorama without taking a photo first. Then choose your frame.', NULL, NULL, NULL, 'Take a family photo with the Umbrian panorama behind you.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (66, 'en', 'Osteria del Buchetto', ARRAY['This is the final stop for a relaxed dinner. Prices and opening details should remain subject to confirmation until checked in a current source.', 'When choosing the final restaurant, consider not only its rating but also whether dinner is available at your planned time and whether the level of formality suits a family after several hours of sightseeing.'], NULL, NULL, 'The menu features Umbrian flavours, including truffle dishes, lentils from the Lake Trasimeno area and wild boar. Ask which dish is most closely connected with the region.', 'Reservation is recommended; the restaurant has a limited number of seats. Check hours before visiting.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

-- === JĘZYK: ES ===
INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (58, 'es', 'Aparcamiento Villa dei Mosaici di Spello', ARRAY['Es el punto práctico de inicio para visitar Spello. Aquí se deja el coche y se continúa a pie.', 'Antes de aparcar, comprobad las señales sobre ZTL, tarifas y restricciones. Las señales actuales del lugar tienen prioridad.'], NULL, NULL, NULL, 'Baños públicos en Spello; comprobad allí la ubicación exacta y disponibilidad.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (59, 'es', 'Villa dei Mosaici di Spello', ARRAY['La Villa dei Mosaici conserva los restos de una villa romana y sus mosaicos. Es una buena primera parada para entender la vida romana como un espacio real.', 'Fijaos en el triclinium, la sala romana de comedor con tres plazas reclinadas. La casa era también un lugar de reuniones y banquetes.'], 'Busca un detalle del mosaico que te recuerde a una decoración moderna. Después decidid dónde crearíais hoy una habitación parecida.', 'Primero fijaos en los suelos y en la distribución de las salas, no solo en fragmentos decorativos.', NULL, NULL, NULL, 'Zrób jedno zdjęcie mozaiki tak, aby było widać jej układ jako całość, a nie tylko pojedynczy fragment.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (72, 'es', 'Porta Consolare', ARRAY['Jugad a ser arqueólogos. Encontrad tres elementos de distintas épocas de la historia de la puerta. Elegid uno y hacedle una foto.'], 'Jugad a ser arqueólogos. Encontrad tres elementos de distintas épocas de la historia de la puerta. Elegid uno y hacedle una foto.', 'La puerta fue modificada en el Renacimiento; las tres estatuas de mármol son de finales del siglo I a. C. y fueron reutilizadas aquí.', 'Las tres estatuas de mármol son elementos romanos reutilizados.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (61, 'es', 'Iglesia de Sant''Andrea', ARRAY['Sant''Andrea está en Via Cavour y encaja de forma natural en el recorrido por el centro histórico. Vale la pena detenerse y observar su decoración.', 'Al hablar de las obras, diferenciad lo documentado de las historias locales. Las atribuciones no confirmadas no deben presentarse como hechos.'], 'Busca un detalle del mosaico que te recuerde a una decoración moderna. Después decidid dónde crearíais hoy una habitación parecida.', 'Primero fijaos en los suelos y en la distribución de las salas, no solo en fragmentos decorativos.', NULL, NULL, 'Se requiere vestimenta respetuosa; hombros y rodillas cubiertos.', 'Zrób zdjęcie jednego powtarzającego się motywu, jeśli fotografowanie jest dozwolone.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (60, 'es', 'Santa Maria Maggiore', ARRAY['Santa Maria Maggiore es uno de los principales monumentos religiosos de Spello. Su interior une historia medieval, transformaciones posteriores y obras de arte.', 'Prestad especial atención a la Cappella Baglioni y a las historias representadas en sus pinturas y frescos.'], 'Busca un detalle del mosaico que te recuerde a una decoración moderna. Después decidid dónde crearíais hoy una habitación parecida.', 'Primero fijaos en los suelos y en la distribución de las salas, no solo en fragmentos decorativos.', 'W kościołach Umbrii sztuka często opowiada historię obrazami. Spróbuj odczytać jedną scenę bez korzystania z opisu.', NULL, 'Se requiere vestimenta respetuosa; hombros y rodillas cubiertos.', 'Zrób zdjęcie wybranego detalu dekoracji Cappella Baglioni, jeśli regulamin miejsca na to pozwala.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (75, 'es', 'Via Giulia — huella romana', ARRAY['Encontrad un detalle que muchos visitantes podrían pasar por alto. Haced una foto y explicad qué indica que procede de la ciudad antigua.'], 'Encontrad un detalle que muchos visitantes podrían pasar por alto. Haced una foto y explicad qué indica que procede de la ciudad antigua.', 'Buscad la disposición de las piedras, el material, la forma o un elemento constructivo que sugiera un origen romano.', 'Spello puede leerse como una superposición de ciudades y épocas diferentes.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (64, 'es', 'Porta Venere + Torri di Properzio', ARRAY['Porta Venere y las Torri di Properzio son restos característicos de las antiguas fortificaciones. La puerta permite imaginar cómo se controlaba la entrada a la ciudad.', 'Es un buen lugar para hablar de por qué las ciudades tenían murallas: defensa y control del acceso.'], 'Busca un detalle del mosaico que te recuerde a una decoración moderna. Después decidid dónde crearíais hoy una habitación parecida.', 'Primero fijaos en los suelos y en la distribución de las salas, no solo en fragmentos decorativos.', NULL, NULL, NULL, 'Zrób zdjęcie, na którym widać jednocześnie bramę i wieże.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (77, 'es', 'VICOLI / BELVEDERE — FINAŁ SPACERU', ARRAY[]::text[], NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (62, 'es', 'Gelateria La Paola', ARRAY['Parada opcional para tomar un helado en Via Cavour. Es un punto separado para que los padres decidan libremente.', 'El helado está colocado antes del tramo final y de la cena. Si ya habéis tomado uno, podéis saltarlo.'], 'Busca un detalle del mosaico que te recuerde a una decoración moderna. Después decidid dónde crearíais hoy una habitación parecida.', NULL, 'Zwróć uwagę, czy w ofercie pojawiają się smaki lub składniki charakterystyczne dla Umbrii.', 'Punkt opcjonalny — można go pominąć.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (65, 'es', 'Belvedere', ARRAY['El belvedere ofrece otra perspectiva de Spello y del paisaje de Umbría. Es un buen lugar para detenerse después de las calles del centro.', 'Puede ser especialmente bonito al atardecer. La familia puede adaptar el orden a su propio día.'], 'Busca un detalle del mosaico que te recuerde a una decoración moderna. Después decidid dónde crearíais hoy una habitación parecida.', 'Primero fijaos en los suelos y en la distribución de las salas, no solo en fragmentos decorativos.', NULL, NULL, NULL, 'Zrób rodzinne zdjęcie z panoramą Umbrii w tle.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (66, 'es', 'Osteria del Buchetto', ARRAY['Es la parada final para una cena tranquila. Los precios y horarios deben confirmarse con una fuente actual.', 'Al elegir el restaurante importan la valoración, la hora de la cena y un ambiente adecuado para familias.'], NULL, NULL, 'Przed zamówieniem zapytajcie, które danie lub składnik jest najbardziej lokalny.', 'Se recomienda reservar; el local tiene pocas plazas. Comprobad el horario antes de ir.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

-- === JĘZYK: FR ===
INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (58, 'fr', 'Parking Villa dei Mosaici di Spello', ARRAY['C''est le point de départ pratique pour découvrir Spello. Laissez la voiture ici et continuez à pied.', 'Avant de vous garer, vérifiez les indications concernant la ZTL, les tarifs et les restrictions. La signalisation sur place fait foi.'], NULL, NULL, NULL, 'Toilettes publiques à Spello ; vérifiez sur place leur emplacement exact et leur disponibilité.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (59, 'fr', 'Villa dei Mosaici di Spello', ARRAY['La Villa dei Mosaici conserve les vestiges d''une villa romaine et de ses mosaïques. Elle permet de découvrir la vie romaine comme un espace concret.', 'Observez le triclinium, salle à manger romaine avec trois places allongées. La maison servait aussi aux rencontres et aux banquets.'], 'Trouve un détail de mosaïque qui te fait penser à une décoration moderne. Puis choisissez ensemble où vous créeriez aujourd''hui une pièce similaire.', 'Regardez d''abord les sols et l''organisation des pièces, pas seulement les fragments décoratifs.', NULL, NULL, NULL, 'Zrób jedno zdjęcie mozaiki tak, aby było widać jej układ jako całość, a nie tylko pojedynczy fragment.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (72, 'fr', 'Porta Consolare', ARRAY['Jouez aux archéologues. Trouvez trois éléments appartenant à des périodes différentes de l''histoire de la porte. Choisissez-en un et prenez-le en photo.'], 'Jouez aux archéologues. Trouvez trois éléments appartenant à des périodes différentes de l''histoire de la porte. Choisissez-en un et prenez-le en photo.', 'La porte a été remaniée à la Renaissance ; les trois statues de marbre datent de la fin du Ier siècle av. J.-C. et ont été réutilisées ici.', 'Les trois statues de marbre sont des éléments romains réemployés.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (61, 'fr', 'Église Sant''Andrea', ARRAY['Sant''Andrea se trouve Via Cavour et s''intègre naturellement à la promenade dans le centre historique. Prenez le temps d''observer sa décoration.', 'Pour les œuvres, distinguez les informations documentées des récits locaux. Une attribution non confirmée ne doit pas être présentée comme un fait.'], 'Trouve un détail de mosaïque qui te fait penser à une décoration moderne. Puis choisissez ensemble où vous créeriez aujourd''hui une pièce similaire.', 'Regardez d''abord les sols et l''organisation des pièces, pas seulement les fragments décoratifs.', NULL, NULL, 'Une tenue correcte est exigée ; épaules et genoux couverts.', 'Zrób zdjęcie jednego powtarzającego się motywu, jeśli fotografowanie jest dozwolone.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (60, 'fr', 'Santa Maria Maggiore', ARRAY['Santa Maria Maggiore est l''un des principaux monuments religieux de Spello. Son intérieur associe histoire médiévale, transformations ultérieures et œuvres d''art.', 'Regardez particulièrement la Cappella Baglioni et les histoires représentées par les peintures et les fresques.'], 'Trouve un détail de mosaïque qui te fait penser à une décoration moderne. Puis choisissez ensemble où vous créeriez aujourd''hui une pièce similaire.', 'Regardez d''abord les sols et l''organisation des pièces, pas seulement les fragments décoratifs.', 'W kościołach Umbrii sztuka często opowiada historię obrazami. Spróbuj odczytać jedną scenę bez korzystania z opisu.', NULL, 'Une tenue correcte est exigée ; épaules et genoux couverts.', 'Zrób zdjęcie wybranego detalu dekoracji Cappella Baglioni, jeśli regulamin miejsca na to pozwala.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (75, 'fr', 'Via Giulia — trace romaine', ARRAY['Trouvez un détail que la plupart des visiteurs pourraient ne pas remarquer. Prenez-le en photo et expliquez ce qui indique son origine antique.'], 'Trouvez un détail que la plupart des visiteurs pourraient ne pas remarquer. Prenez-le en photo et expliquez ce qui indique son origine antique.', 'Observez la disposition des pierres, le matériau, la forme ou un élément de construction qui peut révéler une origine romaine.', 'Spello se lit comme une superposition de villes et d''époques.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (64, 'fr', 'Porta Venere + Torri di Properzio', ARRAY['Porta Venere et les Torri di Properzio comptent parmi les vestiges caractéristiques des fortifications. La porte permet d''imaginer le contrôle des entrées.', 'C''est un bon endroit pour expliquer pourquoi les villes étaient entourées de murailles : défense et contrôle des accès.'], 'Trouve un détail de mosaïque qui te fait penser à une décoration moderne. Puis choisissez ensemble où vous créeriez aujourd''hui une pièce similaire.', 'Regardez d''abord les sols et l''organisation des pièces, pas seulement les fragments décoratifs.', NULL, NULL, NULL, 'Zrób zdjęcie, na którym widać jednocześnie bramę i wieże.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (77, 'fr', 'VICOLI / BELVEDERE — FINAŁ SPACERU', ARRAY[]::text[], NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (62, 'fr', 'Gelateria La Paola', ARRAY['Une pause glace facultative Via Cavour. Elle constitue une étape séparée pour laisser le choix aux parents.', 'La glace est placée avant la dernière partie de la visite et le dîner. Vous pouvez la sauter si vous n''en voulez pas.'], 'Trouve un détail de mosaïque qui te fait penser à une décoration moderne. Puis choisissez ensemble où vous créeriez aujourd''hui une pièce similaire.', NULL, 'Zwróć uwagę, czy w ofercie pojawiają się smaki lub składniki charakterystyczne dla Umbrii.', 'Punkt opcjonalny — można go pominąć.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (65, 'fr', 'Belvédère', ARRAY['Le belvédère offre un autre point de vue sur Spello et le paysage ombrien. Après les rues étroites, c''est une bonne pause.', 'Le lieu peut être particulièrement beau au coucher du soleil. La famille peut adapter l''ordre à sa journée.'], 'Trouve un détail de mosaïque qui te fait penser à une décoration moderne. Puis choisissez ensemble où vous créeriez aujourd''hui une pièce similaire.', 'Regardez d''abord les sols et l''organisation des pièces, pas seulement les fragments décoratifs.', NULL, NULL, NULL, 'Zrób rodzinne zdjęcie z panoramą Umbrii w tle.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (66, 'fr', 'Osteria del Buchetto', ARRAY['Dernière étape pour un dîner tranquille. Prix et horaires doivent être vérifiés auprès d''une source actuelle.', 'Pour choisir le restaurant, comptez aussi sur l''horaire du dîner et une atmosphère adaptée aux familles.'], NULL, NULL, 'Przed zamówieniem zapytajcie, które danie lub składnik jest najbardziej lokalny.', 'Réservation recommandée ; le nombre de places est limité. Vérifiez les horaires avant la visite.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

-- === JĘZYK: HR ===
INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (58, 'hr', 'Parkiralište Villa Dei Mosaici Di Spello', ARRAY['Praktično polazište za obilazak Spella. Ovdje ostavite automobil i nastavite pješice.', 'Prije parkiranja provjerite ZTL, naplatu i ograničenja. Aktualne oznake na mjestu imaju prednost.'], NULL, NULL, NULL, 'Na licu mjesta provjerite aktualne oznake parkirališta i ZTL-a.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (59, 'hr', 'Villa dei Mosaici di Spello', ARRAY['Villa dei Mosaici čuva ostatke rimske vile i njezine mozaike. Rimski život ovdje možete vidjeti kao stvaran prostor, a ne samo kao datum.', 'Obratite pažnju na triclinium, rimsku blagovaonicu s tri ležaja. Kuća je služila i za druženja i gozbe.'], 'Pronađi detalj mozaika koji te podsjeća na moderni ukras. Zatim zajedno odaberite gdje biste danas napravili sličnu prostoriju.', 'Najprije pogledajte podove i raspored prostorija, a ne samo pojedine ukrasne fragmente.', NULL, NULL, NULL, 'Zrób jedno zdjęcie mozaiki tak, aby było widać jej układ jako całość, a nie tylko pojedynczy fragment.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (72, 'hr', 'Porta Consolare', ARRAY['Igrajte se arheologa. Pronađite tri elementa iz različitih razdoblja povijesti vrata i jedan fotografirajte.'], 'Igrajte se arheologa. Pronađite tri elementa iz različitih razdoblja povijesti vrata i jedan fotografirajte.', 'Vrata su pregrađivana u renesansi; tri mramorna kipa potječu s kraja 1. stoljeća pr. Kr. i ponovno su upotrijebljena ovdje.', 'Tri mramorna kipa ponovno su uporabljeni rimski elementi.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (61, 'hr', 'Crkva Sant''Andrea', ARRAY['Sant''Andrea nalazi se u Via Cavour i prirodno se uklapa u šetnju povijesnom jezgrom. Zastanite i pogledajte unutarnju dekoraciju.', 'Razlikujte podatke potvrđene izvorima od lokalnih priča. Nepotvrđene atribucije ne predstavljajte kao činjenice.'], 'Pronađi detalj mozaika koji te podsjeća na moderni ukras. Zatim zajedno odaberite gdje biste danas napravili sličnu prostoriju.', 'Najprije pogledajte podove i raspored prostorija, a ne samo pojedine ukrasne fragmente.', NULL, NULL, 'Potrebna je pristojna odjeća; ramena i koljena trebaju biti pokriveni.', 'Zrób zdjęcie jednego powtarzającego się motywu, jeśli fotografowanie jest dozwolone.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (60, 'hr', 'Santa Maria Maggiore', ARRAY['Santa Maria Maggiore jedan je od glavnih vjerskih spomenika Spella. Unutrašnjost povezuje srednjovjekovnu povijest s kasnijim preinakama i umjetnošću.', 'Posebno pogledajte Cappella Baglioni i priče koje prikazuju slike i freske.'], 'Pronađi detalj mozaika koji te podsjeća na moderni ukras. Zatim zajedno odaberite gdje biste danas napravili sličnu prostoriju.', 'Najprije pogledajte podove i raspored prostorija, a ne samo pojedine ukrasne fragmente.', 'W kościołach Umbrii sztuka często opowiada historię obrazami. Spróbuj odczytać jedną scenę bez korzystania z opisu.', NULL, 'Potrebna je pristojna odjeća; ramena i koljena trebaju biti pokriveni.', 'Zrób zdjęcie wybranego detalu dekoracji Cappella Baglioni, jeśli regulamin miejsca na to pozwala.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (75, 'hr', 'Via Giulia — Roman trace', ARRAY['Igrajte se arheologa. Pronađite tri elementa iz različitih razdoblja povijesti vrata i jedan fotografirajte.'], 'Igrajte se arheologa. Pronađite tri elementa iz različitih razdoblja povijesti vrata i jedan fotografirajte.', 'Vrata su pregrađivana u renesansi; tri mramorna kipa potječu s kraja 1. stoljeća pr. Kr. i ponovno su upotrijebljena ovdje.', 'Tri mramorna kipa ponovno su uporabljeni rimski elementi.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (64, 'hr', 'Porta Venere + Torri di Properzio', ARRAY['Porta Venere i Torri di Properzio karakteristični su ostaci nekadašnjih utvrda. Vrata pokazuju kako se kontrolirao ulaz u grad.', 'Ovdje je lako objasniti zašto su gradovi imali zidine: zbog obrane i kontrole pristupa.'], 'Pronađi detalj mozaika koji te podsjeća na moderni ukras. Zatim zajedno odaberite gdje biste danas napravili sličnu prostoriju.', 'Najprije pogledajte podove i raspored prostorija, a ne samo pojedine ukrasne fragmente.', NULL, NULL, NULL, 'Zrób zdjęcie, na którym widać jednocześnie bramę i wieże.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (77, 'hr', 'VICOLI / BELVEDERE — FINAŁ SPACERU', ARRAY[]::text[], NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (62, 'hr', 'Gelateria La Paola', ARRAY['Izborna stanica za sladoled u Via Cavour. Roditelji mogu odlučiti želi li se obitelj ovdje zaustaviti.', 'Sladoled je smješten prije završnog dijela obilaska i večere. Ako ga ne želite, preskočite stanicu.'], 'Pronađi detalj mozaika koji te podsjeća na moderni ukras. Zatim zajedno odaberite gdje biste danas napravili sličnu prostoriju.', NULL, 'Zwróć uwagę, czy w ofercie pojawiają się smaki lub składniki charakterystyczne dla Umbrii.', 'Izborna stanica — možete je preskočiti.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (65, 'hr', 'Vidikovac', ARRAY['Vidikovac pruža drugačiji pogled na Spello i umbrijski krajolik. Nakon uskih ulica ovo je dobro mjesto za predah.', 'Pri zalasku sunca mjesto može biti posebno lijepo. Obitelj može prilagoditi redoslijed vlastitom danu.'], 'Pronađi detalj mozaika koji te podsjeća na moderni ukras. Zatim zajedno odaberite gdje biste danas napravili sličnu prostoriju.', 'Najprije pogledajte podove i raspored prostorija, a ne samo pojedine ukrasne fragmente.', NULL, NULL, NULL, 'Zrób rodzinne zdjęcie z panoramą Umbrii w tle.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (66, 'hr', 'Osteria del Buchetto', ARRAY['Završna stanica za mirnu večeru. Cijene i radno vrijeme treba provjeriti u aktualnom izvoru.', 'Pri izboru restorana važni su i vrijeme večere te atmosfera prikladna obitelji.'], NULL, NULL, 'Przed zamówieniem zapytajcie, które danie lub składnik jest najbardziej lokalny.', 'Preporučuje se rezervacija; broj mjesta je ograničen. Provjerite radno vrijeme prije posjeta.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

-- === JĘZYK: HU ===
INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (58, 'hu', 'Villa dei Mosaici parkoló', ARRAY['Ez Spello praktikus kiindulópontja. Itt hagyjátok az autót, majd gyalog folytassátok.', 'Parkolás előtt ellenőrizzétek a ZTL-re, díjakra és korlátozásokra vonatkozó táblákat. A helyszíni jelzések az irányadók.'], NULL, NULL, NULL, 'A helyszínen ellenőrizzétek a parkoló és a ZTL aktuális jelzéseit.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (59, 'hu', 'Villa dei Mosaici di Spello', ARRAY['A Villa dei Mosaici egy római villa és mozaikjainak maradványait mutatja be. A római életet itt konkrét térként láthatjátok, nem csupán történelmi dátumként.', 'Figyeljétek meg a tricliniumot, a három fekvőhellyel kialakított római étkezőt. A ház találkozók és lakomák helyszíne is volt.'], 'Keress egy mozaikrészletet, amely modern díszítésre emlékeztet. Ezután válasszátok ki, hol alakítanátok ki ma hasonló szobát.', 'Először a padlót és a helyiségek elrendezését nézzétek meg, ne csak az egyes díszítőelemeket.', NULL, NULL, NULL, 'Zrób jedno zdjęcie mozaiki tak, aby było widać jej układ jako całość, a nie tylko pojedynczy fragment.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (72, 'hu', 'Porta Consolare', ARRAY['Játsszatok régészeket. Keressetek három, különböző korszakból származó elemet a kapun, és fotózzatok le egyet.'], 'Játsszatok régészeket. Keressetek három, különböző korszakból származó elemet a kapun, és fotózzatok le egyet.', 'A kaput a reneszánszban átépítették; a három márványszobor a Kr. e. 1. század végéről származik, és később újra felhasználták.', 'A három márványszobor újra felhasznált római elem.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (61, 'hu', 'Sant''Andrea-templom', ARRAY['A Sant''Andrea a Via Cavour utcában áll, ezért természetesen illeszkedik az óvárosi sétába. Álljatok meg, és figyeljétek meg a díszítést.', 'Különítsétek el a forrásokkal igazolt adatokat a helyi történetektől. A nem igazolt attribúciókat ne mutassátok be tényként.'], 'Keress egy mozaikrészletet, amely modern díszítésre emlékeztet. Ezután válasszátok ki, hol alakítanátok ki ma hasonló szobát.', 'Először a padlót és a helyiségek elrendezését nézzétek meg, ne csak az egyes díszítőelemeket.', NULL, NULL, 'Illő öltözet szükséges; a vállakat és a térdeket takarni kell.', 'Zrób zdjęcie jednego powtarzającego się motywu, jeśli fotografowanie jest dozwolone.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (60, 'hu', 'Santa Maria Maggiore', ARRAY['A Santa Maria Maggiore Spello egyik legfontosabb vallási emléke. Belseje a középkori történelmet későbbi átalakításokkal és művészettel kapcsolja össze.', 'Különösen figyeljetek a Cappella Baglionira és a festmények, freskók által elmesélt történetekre.'], 'Keress egy mozaikrészletet, amely modern díszítésre emlékeztet. Ezután válasszátok ki, hol alakítanátok ki ma hasonló szobát.', 'Először a padlót és a helyiségek elrendezését nézzétek meg, ne csak az egyes díszítőelemeket.', 'W kościołach Umbrii sztuka często opowiada historię obrazami. Spróbuj odczytać jedną scenę bez korzystania z opisu.', NULL, 'Illő öltözet szükséges; a vállakat és a térdeket takarni kell.', 'Zrób zdjęcie wybranego detalu dekoracji Cappella Baglioni, jeśli regulamin miejsca na to pozwala.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (75, 'hu', 'Via Giulia — Roman trace', ARRAY['Játsszatok régészeket. Keressetek három, különböző korszakból származó elemet a kapun, és fotózzatok le egyet.'], 'Játsszatok régészeket. Keressetek három, különböző korszakból származó elemet a kapun, és fotózzatok le egyet.', 'A kaput a reneszánszban átépítették; a három márványszobor a Kr. e. 1. század végéről származik, és később újra felhasználták.', 'A három márványszobor újra felhasznált római elem.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (64, 'hu', 'Porta Venere + Torri di Properzio', ARRAY['A Porta Venere és a Torri di Properzio a város erődítésének jellegzetes maradványai. A kapu segít elképzelni, hogyan ellenőrizték a bejutást.', 'Jó hely annak megértésére, miért épültek városfalak: védelem és a bejárás ellenőrzése miatt.'], 'Keress egy mozaikrészletet, amely modern díszítésre emlékeztet. Ezután válasszátok ki, hol alakítanátok ki ma hasonló szobát.', 'Először a padlót és a helyiségek elrendezését nézzétek meg, ne csak az egyes díszítőelemeket.', NULL, NULL, NULL, 'Zrób zdjęcie, na którym widać jednocześnie bramę i wieże.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (77, 'hu', 'VICOLI / BELVEDERE — FINAŁ SPACERU', ARRAY[]::text[], NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (62, 'hu', 'Gelateria La Paola', ARRAY['Opcionális fagylaltmegálló a Via Cavouron. A szülők dönthetnek arról, hogy a család megáll-e.', 'A fagylalt a látogatás utolsó szakasza és a vacsora előtt szerepel. Ha nem kértek, kihagyható.'], 'Keress egy mozaikrészletet, amely modern díszítésre emlékeztet. Ezután válasszátok ki, hol alakítanátok ki ma hasonló szobát.', NULL, 'Zwróć uwagę, czy w ofercie pojawiają się smaki lub składniki charakterystyczne dla Umbrii.', 'Opcionális megálló — kihagyható.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (65, 'hu', 'Kilátó', ARRAY['A kilátó más perspektívát ad Spellóra és Umbria tájára. A szűk utcák után jó hely egy kis pihenőre.', 'Naplementekor különösen szép lehet. A család a saját napjához igazíthatja a sorrendet.'], 'Keress egy mozaikrészletet, amely modern díszítésre emlékeztet. Ezután válasszátok ki, hol alakítanátok ki ma hasonló szobát.', 'Először a padlót és a helyiségek elrendezését nézzétek meg, ne csak az egyes díszítőelemeket.', NULL, NULL, NULL, 'Zrób rodzinne zdjęcie z panoramą Umbrii w tle.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (66, 'hu', 'Osteria del Buchetto', ARRAY['A túra utolsó állomása egy nyugodt vacsorához. Az árakat és nyitvatartást aktuális forrásból kell ellenőrizni.', 'Az étterem kiválasztásakor a vacsora időpontja és a családbarát környezet is számít.'], NULL, NULL, 'Przed zamówieniem zapytajcie, które danie lub składnik jest najbardziej lokalny.', 'Foglalás ajánlott; a helyek száma korlátozott. Látogatás előtt ellenőrizzétek a nyitvatartást.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

-- === JĘZYK: IT ===
INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (58, 'it', 'Parcheggio Villa Dei Mosaici di Spello', ARRAY['È il punto di partenza pratico per visitare Spello. Qui si lascia l''auto e si prosegue a piedi, entrando nel centro storico senza aggiungere spostamenti in macchina all''itinerario.', 'Prima di parcheggiare controllate la segnaletica relativa alla ZTL, ai parcheggi a pagamento e alle eventuali limitazioni. In caso di differenze, fa fede la segnaletica presente sul posto.'], NULL, NULL, NULL, 'Controllare sul posto la segnaletica aggiornata del parcheggio e della ZTL.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (59, 'it', 'Villa dei Mosaici di Spello', ARRAY['La Villa dei Mosaici è un sito archeologico che conserva i resti di una villa romana e delle sue decorazioni musive. È una buona prima tappa perché permette di vedere la vita romana non come una data astratta, ma come una casa con ambienti e pavimenti sopravvissuti per secoli.', 'Prestate attenzione al triclinium. Era la sala da pranzo romana; il nome richiama tre posti per sdraiarsi disposti intorno alla tavola. Mostra che una casa romana non era soltanto un luogo in cui abitare, ma anche uno spazio per incontri e banchetti.'], 'Trova un dettaglio del mosaico che ti ricorda una decorazione moderna. Poi scegliete insieme dove realizzereste oggi una stanza simile.', 'Guardate prima i pavimenti e la disposizione degli ambienti, non soltanto i singoli frammenti decorativi.', NULL, NULL, NULL, 'Scattate una foto di un mosaico mostrando il disegno nel suo insieme, non solo un frammento.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (72, 'it', 'Porta Consolare', ARRAY['Giocate agli archeologi. Trovate tre elementi appartenenti a momenti diversi della storia della porta. Sceglietene uno e fotografatelo.'], 'Giocate agli archeologi. Trovate tre elementi appartenenti a momenti diversi della storia della porta. Sceglietene uno e fotografatelo.', 'La porta fu modificata nel Rinascimento, mentre le tre statue marmoree risalgono alla fine del I secolo a.C. e furono riutilizzate qui.', 'Le tre statue marmoree sono elementi romani riutilizzati.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (61, 'it', 'Chiesa di Sant''Andrea', ARRAY['La Chiesa di Sant''Andrea si trova in Via Cavour e si inserisce naturalmente nel percorso attraverso il centro storico di Spello. È un luogo in cui vale la pena fermarsi a leggere la decorazione, invece di considerarlo soltanto una tappa da spuntare.', 'Nel descrivere le opere all''interno bisogna distinguere ciò che è documentato dalle fonti dalle storie locali. Se un''opera o un''attribuzione non è confermata, non va presentata come un fatto.'], 'Trova un dettaglio che si ripete nella decorazione interna. Perché secondo te l''artista potrebbe averlo usato più di una volta?', 'Guardate prima in alto: volta e parti superiori della chiesa possono raccontare una storia diversa rispetto alle pareti inferiori.', NULL, NULL, 'È richiesto un abbigliamento rispettoso.', 'Scattate una foto di un motivo ripetuto, se la fotografia è consentita.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (60, 'it', 'Santa Maria Maggiore', ARRAY['Santa Maria Maggiore è uno dei principali monumenti religiosi di Spello. L''interno unisce la storia medievale della città a trasformazioni successive e opere d''arte: osservate quindi non solo l''età dell''edificio, ma anche come la sua decorazione è cambiata nel tempo.', 'Prestate particolare attenzione alla Cappella Baglioni e alle scene rappresentate nella sua decorazione. Nelle chiese vale la pena capire che cosa rappresenta l''opera principale vicino all''altare e quali storie raccontano dipinti e affreschi.'], 'Trova nella Cappella Baglioni una scena che sembra la storia di un film. Raccontate cosa sta succedendo e come lo avete capito.', 'Prima osservate la scena nel suo insieme, poi cercate le singole figure e i dettagli.', 'Nelle chiese umbre l''arte racconta spesso storie attraverso le immagini. Provate a leggere una scena senza usare la descrizione.', NULL, 'È richiesto un abbigliamento rispettoso; spalle e ginocchia devono essere coperte.', 'Scattate una foto di un dettaglio scelto della Cappella Baglioni, se la fotografia è consentita.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (75, 'it', 'Via Giulia — traccia romana', ARRAY['Trovate un dettaglio che molti visitatori potrebbero non notare. Fotografatelo e spiegate cosa vi fa pensare alla città antica.'], 'Trovate un dettaglio che molti visitatori potrebbero non notare. Fotografatelo e spiegate cosa vi fa pensare alla città antica.', 'Cercate il modo di disporre le pietre, il materiale, la forma o un elemento costruttivo che suggerisca un''origine romana.', 'Spello si può leggere come una sovrapposizione di città e di epoche diverse.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (64, 'it', 'Porta Venere + Torri di Properzio', ARRAY['Porta Venere e le Torri di Properzio sono tra i resti più caratteristici delle antiche fortificazioni di Spello. La porta permette di immaginare come le mura controllassero l''ingresso alla città, mentre le torri vicine rafforzano l''impatto monumentale dell''insieme.', 'È un buon punto per parlare del motivo per cui le città venivano circondate da mura. Una porta non era una semplice decorazione: era un ingresso controllato e faceva parte del sistema difensivo e della gestione dei movimenti in città.'], 'Guarda la porta come se fosse un antico punto di controllo. Immagina due modi con cui le guardie potevano controllare chi entrava in città.', 'Osservate lo spessore delle mura, la forma delle aperture e la posizione della porta rispetto alla città.', NULL, NULL, NULL, 'Scattate una foto in cui si vedano insieme la porta e le torri.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (77, 'it', 'VICOLI / BELVEDERE — FINAŁ SPACERU', ARRAY[]::text[], NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (62, 'it', 'Gelateria La Paola', ARRAY['È una tappa facoltativa per un gelato in Via Cavour. È indicata come punto separato perché i genitori possano vederla nell''itinerario e decidere se fermarsi.', 'Il gelato è volutamente collocato prima dell''ultima parte della visita e della cena. Se non avete voglia di dessert o avete già mangiato il gelato, potete semplicemente saltare la tappa.'], 'Scegli un gusto che non hai mai provato. Ognuno gli dà un voto e lo spiega con una frase.', NULL, 'Controllate se sono presenti gusti o ingredienti caratteristici dell''Umbria.', 'Tappa facoltativa — si può saltare.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (65, 'it', 'Belvedere', ARRAY['Il belvedere offre una prospettiva diversa su Spello e sul paesaggio umbro. Dopo diverse tappe tra gli edifici del centro storico, fermatevi qui per vedere la città dall''alto e capire come la sua posizione influenzi il panorama.', 'Il luogo può essere particolarmente suggestivo al tramonto. Non facciamo però dipendere tutto l''itinerario dal tramonto: i genitori possono adattare l''ordine alla propria giornata.'], 'Trova tre elementi diversi nel panorama: edifici, campi o alberi e colline lontane. Quale cambia di più spostandoti?', 'Guardate prima il panorama senza fotografare. Poi scegliete l''inquadratura.', NULL, NULL, NULL, 'Scattate una foto di famiglia con il panorama dell''Umbria sullo sfondo.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (66, 'it', 'Osteria del Buchetto', ARRAY['È la tappa finale per una cena tranquilla. Prezzi e dettagli sugli orari devono comunque essere confermati prima della visita tramite una fonte aggiornata.', 'Nella scelta del ristorante finale contano non solo la valutazione, ma anche la possibilità di cenare all''orario previsto e un livello di formalità adatto a una famiglia dopo alcune ore di visita.'], NULL, NULL, 'Nel menu compaiono sapori umbri, tra cui piatti al tartufo, lenticchie della zona del Lago Trasimeno e cinghiale. Chiedete quale piatto è più legato al territorio.', 'È consigliata la prenotazione; il locale ha un numero limitato di posti. Controllare gli orari prima della visita.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

-- === JĘZYK: NL ===
INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (58, 'nl', 'Parkeerplaats Villa Dei Mosaici Di Spello', ARRAY['Dit is het praktische startpunt voor een bezoek aan Spello. Laat de auto hier staan en ga te voet verder.', 'Controleer vóór het parkeren de borden over ZTL, tarieven en beperkingen. De signalering ter plaatse heeft voorrang.'], NULL, NULL, NULL, 'Controleer ter plaatse de actuele parkeer- en ZTL-borden.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (59, 'nl', 'Villa dei Mosaici di Spello', ARRAY['Villa dei Mosaici toont de resten van een Romeinse villa en haar mozaïeken. Zo wordt het Romeinse leven een concrete ruimte, niet alleen een historische datum.', 'Let op het triclinium, de Romeinse eetzaal met drie ligplaatsen. Het huis was ook een plek voor bijeenkomsten en feesten.'], 'Zoek een mozaïekdetail dat je aan moderne decoratie doet denken. Kies daarna samen waar je vandaag een vergelijkbare kamer zou maken.', 'Bekijk eerst de vloeren en de indeling van de ruimtes, niet alleen losse decoratieve fragmenten.', NULL, NULL, NULL, 'Zrób jedno zdjęcie mozaiki tak, aby było widać jej układ jako całość, a nie tylko pojedynczy fragment.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (72, 'nl', 'Porta Consolare', ARRAY['Speel archeoloog. Zoek drie elementen uit verschillende perioden van de geschiedenis van de poort en fotografeer er één.'], 'Speel archeoloog. Zoek drie elementen uit verschillende perioden van de geschiedenis van de poort en fotografeer er één.', 'De poort werd in de renaissance verbouwd; de drie marmeren beelden dateren uit het einde van de 1e eeuw v.Chr. en werden hier hergebruikt.', 'De drie marmeren beelden zijn hergebruikte Romeinse elementen.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (61, 'nl', 'Kerk van Sant''Andrea', ARRAY['Sant''Andrea ligt aan de Via Cavour en past natuurlijk in de wandeling door het historische centrum. Stop even en bekijk de decoratie.', 'Maak onderscheid tussen informatie die door bronnen is bevestigd en lokale verhalen. Onbevestigde toeschrijvingen mogen niet als feiten worden gepresenteerd.'], 'Zoek een mozaïekdetail dat je aan moderne decoratie doet denken. Kies daarna samen waar je vandaag een vergelijkbare kamer zou maken.', 'Bekijk eerst de vloeren en de indeling van de ruimtes, niet alleen losse decoratieve fragmenten.', NULL, NULL, 'Gepaste kleding is vereist; schouders en knieën moeten bedekt zijn.', 'Zrób zdjęcie jednego powtarzającego się motywu, jeśli fotografowanie jest dozwolone.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (60, 'nl', 'Santa Maria Maggiore', ARRAY['Santa Maria Maggiore is een van de belangrijkste religieuze monumenten van Spello. Het interieur verbindt middeleeuwse geschiedenis met latere veranderingen en kunst.', 'Let vooral op de Cappella Baglioni en de verhalen die schilderijen en fresco''s vertellen.'], 'Zoek een mozaïekdetail dat je aan moderne decoratie doet denken. Kies daarna samen waar je vandaag een vergelijkbare kamer zou maken.', 'Bekijk eerst de vloeren en de indeling van de ruimtes, niet alleen losse decoratieve fragmenten.', 'W kościołach Umbrii sztuka często opowiada historię obrazami. Spróbuj odczytać jedną scenę bez korzystania z opisu.', NULL, 'Gepaste kleding is vereist; schouders en knieën moeten bedekt zijn.', 'Zrób zdjęcie wybranego detalu dekoracji Cappella Baglioni, jeśli regulamin miejsca na to pozwala.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (75, 'nl', 'Via Giulia — Roman trace', ARRAY['Speel archeoloog. Zoek drie elementen uit verschillende perioden van de geschiedenis van de poort en fotografeer er één.'], 'Speel archeoloog. Zoek drie elementen uit verschillende perioden van de geschiedenis van de poort en fotografeer er één.', 'De poort werd in de renaissance verbouwd; de drie marmeren beelden dateren uit het einde van de 1e eeuw v.Chr. en werden hier hergebruikt.', 'De drie marmeren beelden zijn hergebruikte Romeinse elementen.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (64, 'nl', 'Porta Venere + Torri di Properzio', ARRAY['Porta Venere en de Torri di Properzio zijn karakteristieke resten van de vroegere vestingwerken. De poort laat zien hoe de toegang tot de stad werd gecontroleerd.', 'Een goede plek om uit te leggen waarom steden muren hadden: verdediging en controle over de toegang.'], 'Zoek een mozaïekdetail dat je aan moderne decoratie doet denken. Kies daarna samen waar je vandaag een vergelijkbare kamer zou maken.', 'Bekijk eerst de vloeren en de indeling van de ruimtes, niet alleen losse decoratieve fragmenten.', NULL, NULL, NULL, 'Zrób zdjęcie, na którym widać jednocześnie bramę i wieże.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (77, 'nl', 'VICOLI / BELVEDERE — FINAŁ SPACERU', ARRAY[]::text[], NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (62, 'nl', 'Gelateria La Paola', ARRAY['Een optionele ijsstop aan de Via Cavour. Ouders kunnen zelf beslissen of het gezin stopt.', 'Het ijs staat vóór het laatste deel van de wandeling en het diner. Als jullie geen ijs willen, sla deze stop over.'], 'Zoek een mozaïekdetail dat je aan moderne decoratie doet denken. Kies daarna samen waar je vandaag een vergelijkbare kamer zou maken.', NULL, 'Zwróć uwagę, czy w ofercie pojawiają się smaki lub składniki charakterystyczne dla Umbrii.', 'Optionele stop — je kunt deze overslaan.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (65, 'nl', 'Uitzichtpunt', ARRAY['Het uitzichtpunt geeft een ander perspectief op Spello en het landschap van Umbrië. Na de smalle straten is dit een fijne pauze.', 'Bij zonsondergang kan het bijzonder mooi zijn. Het gezin kan de volgorde aanpassen aan de eigen dag.'], 'Zoek een mozaïekdetail dat je aan moderne decoratie doet denken. Kies daarna samen waar je vandaag een vergelijkbare kamer zou maken.', 'Bekijk eerst de vloeren en de indeling van de ruimtes, niet alleen losse decoratieve fragmenten.', NULL, NULL, NULL, 'Zrób rodzinne zdjęcie z panoramą Umbrii w tle.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (66, 'nl', 'Osteria del Buchetto', ARRAY['De laatste stop voor een rustig diner. Prijzen en openingstijden moeten met een actuele bron worden gecontroleerd.', 'Bij de restaurantkeuze tellen ook het tijdstip van het diner en een gezinsvriendelijke sfeer.'], NULL, NULL, 'Przed zamówieniem zapytajcie, które danie lub składnik jest najbardziej lokalny.', 'Reserveren wordt aanbevolen; er zijn maar weinig plaatsen. Controleer de openingstijden voor bezoek.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

-- === JĘZYK: NO ===
INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (58, 'no', 'Parkering Villa Dei Mosaici Di Spello', ARRAY['Dette er det praktiske startpunktet for Spello. Sett fra deg bilen her og fortsett til fots.', 'Sjekk skilt om ZTL, avgifter og begrensninger før du parkerer. Skiltingen på stedet gjelder.'], NULL, NULL, NULL, 'Sjekk gjeldende parkerings- og ZTL-skilt på stedet.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (59, 'no', 'Villa dei Mosaici di Spello', ARRAY['Villa dei Mosaici viser restene av en romersk villa og mosaikkene. Her blir romersk liv et konkret rom, ikke bare en historisk dato.', 'Se etter triclinium, den romerske spisesalen med tre liggeplasser. Huset var også et sted for møter og festmåltider.'], 'Finn en mosaikkdetalj som minner deg om moderne dekorasjon. Velg så sammen hvor dere ville laget et lignende rom i dag.', 'Se først på gulvene og rommenes planløsning, ikke bare på enkelte dekorative fragmenter.', NULL, NULL, NULL, 'Zrób jedno zdjęcie mozaiki tak, aby było widać jej układ jako całość, a nie tylko pojedynczy fragment.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (72, 'no', 'Porta Consolare', ARRAY['Lek arkeologer. Finn tre elementer fra ulike perioder i portens historie og fotografer ett.'], 'Lek arkeologer. Finn tre elementer fra ulike perioder i portens historie og fotografer ett.', 'Porten ble bygget om i renessansen; de tre marmorfigurene er fra slutten av 1. århundre f.Kr. og ble gjenbrukt her.', 'De tre marmorfigurene er gjenbrukte romerske elementer.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (61, 'no', 'Sant''Andrea-kirken', ARRAY['Sant''Andrea ligger i Via Cavour og passer naturlig inn i turen gjennom det historiske sentrum. Stopp og se på utsmykningen.', 'Skill mellom opplysninger som er dokumentert av kilder og lokale historier. Ubekreftede attribusjoner må ikke presenteres som fakta.'], 'Finn en mosaikkdetalj som minner deg om moderne dekorasjon. Velg så sammen hvor dere ville laget et lignende rom i dag.', 'Se først på gulvene og rommenes planløsning, ikke bare på enkelte dekorative fragmenter.', NULL, NULL, 'Sømmelig antrekk kreves; skuldre og knær bør være tildekket.', 'Zrób zdjęcie jednego powtarzającego się motywu, jeśli fotografowanie jest dozwolone.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (60, 'no', 'Santa Maria Maggiore', ARRAY['Santa Maria Maggiore er et av Spellos viktigste religiøse monumenter. Interiøret kombinerer middelalderhistorie med senere endringer og kunst.', 'Legg særlig merke til Cappella Baglioni og historiene som malerier og fresker forteller.'], 'Finn en mosaikkdetalj som minner deg om moderne dekorasjon. Velg så sammen hvor dere ville laget et lignende rom i dag.', 'Se først på gulvene og rommenes planløsning, ikke bare på enkelte dekorative fragmenter.', 'W kościołach Umbrii sztuka często opowiada historię obrazami. Spróbuj odczytać jedną scenę bez korzystania z opisu.', NULL, 'Sømmelig antrekk kreves; skuldre og knær bør være tildekket.', 'Zrób zdjęcie wybranego detalu dekoracji Cappella Baglioni, jeśli regulamin miejsca na to pozwala.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (75, 'no', 'Via Giulia — Roman trace', ARRAY['Lek arkeologer. Finn tre elementer fra ulike perioder i portens historie og fotografer ett.'], 'Lek arkeologer. Finn tre elementer fra ulike perioder i portens historie og fotografer ett.', 'Porten ble bygget om i renessansen; de tre marmorfigurene er fra slutten av 1. århundre f.Kr. og ble gjenbrukt her.', 'De tre marmorfigurene er gjenbrukte romerske elementer.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (64, 'no', 'Porta Venere + Torri di Properzio', ARRAY['Porta Venere og Torri di Properzio er karakteristiske rester av byens befestning. Porten viser hvordan adgangen ble kontrollert.', 'Dette er et godt sted å snakke om hvorfor byer hadde murer: forsvar og kontroll av adgangen.'], 'Finn en mosaikkdetalj som minner deg om moderne dekorasjon. Velg så sammen hvor dere ville laget et lignende rom i dag.', 'Se først på gulvene og rommenes planløsning, ikke bare på enkelte dekorative fragmenter.', NULL, NULL, NULL, 'Zrób zdjęcie, na którym widać jednocześnie bramę i wieże.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (77, 'no', 'VICOLI / BELVEDERE — FINAŁ SPACERU', ARRAY[]::text[], NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (62, 'no', 'Gelateria La Paola', ARRAY['Et valgfritt isstopp i Via Cavour. Foreldrene kan selv avgjøre om familien vil stoppe.', 'Isen er lagt før den siste delen av besøket og middagen. Hvis dere ikke vil ha is, kan stoppet hoppes over.'], 'Finn en mosaikkdetalj som minner deg om moderne dekorasjon. Velg så sammen hvor dere ville laget et lignende rom i dag.', NULL, 'Zwróć uwagę, czy w ofercie pojawiają się smaki lub składniki charakterystyczne dla Umbrii.', 'Valgfritt stopp — dere kan hoppe over det.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (65, 'no', 'Utsiktspunkt', ARRAY['Utsiktspunktet gir et annet perspektiv på Spello og landskapet i Umbria. Etter de smale gatene er det et godt sted å ta en pause.', 'Stedet kan være spesielt vakkert ved solnedgang. Familien kan tilpasse rekkefølgen til dagen.'], 'Finn en mosaikkdetalj som minner deg om moderne dekorasjon. Velg så sammen hvor dere ville laget et lignende rom i dag.', 'Se først på gulvene og rommenes planløsning, ikke bare på enkelte dekorative fragmenter.', NULL, NULL, NULL, 'Zrób rodzinne zdjęcie z panoramą Umbrii w tle.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (66, 'no', 'Osteria del Buchetto', ARRAY['Siste stopp for en rolig middag. Priser og åpningstider må sjekkes i en aktuell kilde.', 'Ved valg av restaurant er også middagstidspunkt og familievennlig atmosfære viktig.'], NULL, NULL, 'Przed zamówieniem zapytajcie, które danie lub składnik jest najbardziej lokalny.', 'Reservasjon anbefales; antall plasser er begrenset. Sjekk åpningstidene før besøket.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

-- === JĘZYK: PL ===
INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (58, 'pl', 'PARKING VILLA DEI MOSAICI', ARRAY['Ten punkt zaczyna historię Spello od bardzo dobrego pytania: czy wielkie odkrycia archeologiczne zawsze są planowane? W przypadku Villa dei Mosaici odpowiedź brzmi: nie. W lipcu 2005 roku, w miejscowości Sant''Anna, podczas prac związanych z budową publicznego parkingu, z ziemi zaczęły wychodzić pozostałości starożytnej mozaiki. Zamiast zakończenia prac budowlanych rozpoczęły się badania archeologiczne, które odsłoniły rozległą rzymską rezydencję. To dobry początek rodzinnej trasy, bo dziecko dostaje prawdziwą historię detektywistyczną: ludzie kopali pod parking, a znaleźli rzymską willę.'], 'Czy wiecie, że największe odkrycia są czasem dziełem przypadku? Zanim wejdziemy do willi, spróbujcie przewidzieć: co archeolog mógł zobaczyć jako pierwsze, kiedy z ziemi zaczęła wychodzić rzymska willa?', 'Nie chodzi o zgadywanie konkretnego przedmiotu. Pierwszym wyraźnym sygnałem były pozostałości starożytnej mozaiki.', 'W lipcu 2005 roku podczas prac przy budowie parkingu odkryto pozostałości rzymskiej willi — współczesna inwestycja odsłoniła fragment miasta sprzed prawie dwóch tysięcy lat.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (59, 'pl', 'VILLA DEI MOSAICI', ARRAY['💥 BOMBA NA START: zaraz po wyjściu z auta nie wchodzicie po prostu do „starego muzeum". Stoicie przy miejscu, które pokazuje, jak ogromna jest skala historii. Tradycyjna data założenia Rzymu to 753 r. p.n.e. . Pierwsza faza budowy tej willi przypada dopiero na epokę Augusta, 27 r. p.n.e.–14 r. n.e. — czyli około 726 lat po tradycyjnej dacie założenia Rzymu . A historia samego Hispellum i okolicy jest jeszcze starsza.'], 'Misja „Dwa zegary": znajdź na ekspozycji informację o 753 r. p.n.e. i sprawdź, ile lat później zaczęła powstawać Villa dei Mosaici. Potem odnajdź triclinium — salę bankietową — i zrób jej zdjęcie. Bonus: pokaż rodzicowi, gdzie na mozaice widzisz scenę nalewania wina.', 'Triclinium była rzymską salą przeznaczoną do uczt. Szukaj pomieszczenia z bogatą, wielobarwną mozaiką; szczególnie charakterystyczne są motywy związane z winem, porami roku, roślinnością i zwierzętami.', 'Właściciel willi pozostaje anonimowy, ale sama rezydencja pokazuje skalę prywatnego bogactwa w rzymskim Spello: około 500 m² odsłoniętej części i dziesięć pomieszczeń z zachowanymi polichromowanymi mozaikami.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (72, 'pl', 'PORTA CONSOLARE', ARRAY['Piazza della Repubblica to jeden z kluczowych punktów orientacyjnych Spello. Przy placu stoi Palazzo Comunale, którego pierwotna część pochodzi z XIII wieku; na fasadzie widnieje data 1270 . Budynek był później rozbudowywany i podwyższany.'], 'Zagrajcie w archeologów. Znajdź na Porta Consolare trzy elementy pochodzące z różnych momentów historii bramy. Wybierz jeden i zrób zdjęcie. Następnie zdecyduj: co jest rzymskie, co zostało dodane później?', 'Brama była przebudowywana w renesansie, a trzy marmurowe posągi pochodzą z końca I wieku p.n.e. i zostały tu umieszczone później.', 'Trzy marmurowe posągi na bramie pochodzą z końca I wieku p.n.e. i zostały tu wykorzystane ponownie. Warto spojrzeć na nie jak na „drugie życie" rzymskich zabytków.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (61, 'pl', 'CHIESA DI SANT''ANDREA', ARRAY['Pierwsza znana wzmianka o Sant''Andrea pochodzi z 1025 roku, kiedy kościół należał do dóbr mnichów kamedulskich z San Silvestro na Monte Subasio. W 1253 roku biskup Spoleto przekazał kościół wraz z domami, ogrodem i przyległymi gruntami franciszkanom. W kolejnych latach papieże potwierdzali darowiznę i przyznawali odpusty związane z kościołem. To sprawia, że kościół można czytać jako historię zmian właścicieli i funkcji: kameduli, biskupstwo, franciszkanie. We wnętrzu warto najpierw spojrzeć na jego układ i warstwy, a dopiero potem na pojedyncze dzieła. Świątynia nie jest „zamrożonym" wnętrzem z jednej epoki: przez stulecia była przekształcana, a wyposażenie i dekoracja narastały wraz ze zmianami funkcji i patronatu. Dla rodziny ciekawsze jest więc pytanie „co tu wygląda na starsze, a co na późniejsze?" niż próba zapamiętania listy nazwisk. Zwróćcie uwagę na różnice między architekturą, ołtarzami, malarstwem i detalem dekoracyjnym. W kontekście całej trasy Sant''Andrea jest przejściem od rzymskiego Spello do średniowiecznego i późniejszego miasta. We wnętrzu warto najpierw spojrzeć na układ i warstwy dekoracji, a dopiero potem na pojedyncze dzieła. Architektura, ołtarze, malarstwo i detal dekoracyjny pokazują, że świątynia była zmieniana przez kolejne pokolenia. Najstarszy etap jej udokumentowanej historii sięga 1025 roku, a w 1253 roku kościół przekazano franciszkanom.'], 'Kościół pamięta ponad 1000 lat. Znajdź ślad, który wygląda na najstarszy. Nie podawaj roku — wskaż konkretny detal i wyjaśnij, dlaczego uważasz go za starszy od reszty.', 'Odpowiedź: dziecko powinno wskazać konkretny detal, który jego zdaniem jest najstarszy, i podać widoczne uzasadnienie — np. starszy materiał, sposób wykonania, ślady przebudowy albo archaiczniejszą formę. Nie ma jednej poprawnej odpowiedzi bez wskazania konkretnego detalu; poprawna odpowiedź musi zawierać **element + argument**, np. „ten fragment wygląda na starszy, bo…".', 'Historia przekazania świątyni franciszkanom w 1253 roku i późniejsze papieskie potwierdzenia pokazują, że mały kościół w Spello był częścią większej sieci franciszkańskiej i papieskiej.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (60, 'pl', 'SANTA MARIA MAGGIORE / CAPPELLA BAGLIONI', ARRAY['Cappella Baglioni, nazywana również Cappella Bella, jest jednym z najważniejszych dzieł renesansowych w Spello. Pinturicchio został sprowadzony tutaj w 1500 roku przez Troilo Baglioniego, przeora kolegiaty Santa Maria Maggiore. Prace trwały od końca lata 1500 do wiosny 1501 roku. Na trzech ścianach artysta przedstawił Zwiastowanie, Narodzenie oraz Dysputę Jezusa z uczonymi w Piśmie. Na sklepieniu znajdują się cztery Sybille. Największą siłą kaplicy są drobne szczegóły: ubrania, fryzury, rośliny, dekoracje i sceny codzienności. To renesansowy świat, który można oglądać jak zatrzymany film. Co ważne dla rodzinnej gry, Pinturicchio zostawił tu również własną twarz.'], 'Pinturicchio zostawił tu swoją twarz. Odnajdź jego autoportret. Zrób zdjęcie i porównaj jego twarz z innymi osobami przedstawionymi we freskach.', 'Nie szukaj podpisu „Pinturicchio". Szukaj postaci, która nie należy do głównej historii przedstawionej na fresku, ale jest portretem samego artysty.', 'Pinturicchio umieścił w kaplicy własny wizerunek. Poszukaj go pośród pozostałych postaci — to jeden z tych drobnych szczegółów, które sprawiają, że renesansowy fresk można oglądać jak scenę pełną ukrytych historii.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (75, 'pl', 'VIA GIULIA — ŚLAD RZYMSKI', ARRAY['Ten punkt uczy czytania miasta zamiast zaliczania kolejnej dużej atrakcji. Miejski szlak archeologiczny P.A.U. prowadzi przez nakładające się warstwy Spello: rzymską, średniowieczną, renesansową, papieską i współczesną. W rzymskiej warstwie miasta zachowały się mury, bramy, forum, domy, termy, amfiteatr i inne pozostałości. Niewielki fragment może więc być równie ważny dla zrozumienia miasta jak duża, efektowna budowla.'], 'Znajdź detal, który większość turystów może minąć bez zauważenia. Zrób zdjęcie i odpowiedz: co mówi Ci, że pochodzi ze starożytnego miasta?', 'Szukaj cechy, która pozwala rozpoznać rzymskie pochodzenie: sposób ułożenia kamieni, materiał, kształt albo element konstrukcyjny. Nie musisz znać jego nazwy — wystarczy, że potrafisz wskazać, co zauważyłeś.', 'Spello można czytać jak pięć miast nałożonych jedno na drugie. To właśnie daje sens szukaniu małych śladów wśród współczesnej zabudowy.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (64, 'pl', 'PORTA VENERE + TORRI DI PROPERZIO', ARRAY['Porta Venere została zbudowana w epoce Augusta jako monumentalne wejście do miasta. Jest trójłukowa i wykonana z białego trawertynu; pomiędzy łukami zastosowano pilastry porządku doryckiego. Dwie charakterystyczne wieże po bokach bramy należą do zupełnie innej warstwy historii. Mają plan dwunastoboczny i są zwykle datowane na XII wiek. To jeden z najlepszych punktów trasy, żeby pokazać dziecku, że elementy stojące obok siebie nie muszą pochodzić z tego samego okresu. Z miejscem związana jest również lokalna opowieść o Orlando, według której jedna z wież miała być miejscem jego więzienia. Źródło miejskie wyraźnie traktuje tę identyfikację jako legendarną.'], 'Znajdź trzy różne epoki w jednym miejscu. Wskaż element rzymski, element średniowieczny i element będący wynikiem późniejszych zmian. Zrób jedno zdjęcie, na którym widać co najmniej dwa z nich.', 'Orlando to nie przypadkowe imię: to włoski bohater opowieści o rycerzach Karola Wielkiego. Jeśli widzisz dwie wysokie wieże przy rzymskiej bramie, pomyśl, która z nich mogła stać się bohaterką lokalnej legendy. Zwróć też uwagę na różnicę między rzymską bramą a średniowiecznymi wieżami.', 'Orlando, czyli Roland , to legendarny rycerz Karola Wielkiego, jeden z najsłynniejszych bohaterów średniowiecznych opowieści rycerskich. Jego historia pojawia się w „Pieśni o Rolandzie", a później została rozbudowana w wielkim włoskim poemacie Ludovica Ariosta Orlando furioso („Orlando szalony") z 1516 roku. Dlatego dla włoskiej kultury samo imię Orlando oznacza postać znacznie bardziej znaną niż zwykły bohater lokalnej opowieści.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (77, 'pl', 'VICOLI / BELVEDERE — FINAŁ SPACERU', ARRAY['Po kilku godzinach zwiedzania nie dokładamy kolejnego obowiązkowego zabytku. Spello najlepiej działa również jako miasto, po którym się idzie i patrzy. Współczesne Spello jest szczególnie mocno związane z kwiatami. Najbardziej spektakularnym przykładem są Infiorate del Corpus Domini. Tradycja jest udokumentowana w archiwum miejskim już w 1831 roku, kiedy mieszkańców poproszono o oczyszczenie ulic i udekorowanie ich kwiatami lub zielenią na trasie procesji. Z czasem zwyczaj przekształcił się w wielką sztukę kwiatowych dywanów. Współcześnie w przygotowanie wydarzenia angażują się tysiące mieszkańców, w tym dzieci i młodzież.'], 'Policz, ile różnych rodzajów kwiatów znajdziesz podczas spaceru. Sfotografuj najpiękniejszy. A potem czas na rodzinne selfie!', 'Podpowiedź: nie ograniczajcie się do jednego koloru. Zwróćcie uwagę na kształt płatków, wielkość kwiatów i rośliny w donicach oraz na balkonach.', 'Spello jest słynne z Infiorate del Corpus Domini — tradycji tworzenia wielkich kompozycji z kwiatów. Jej początki są udokumentowane w archiwum miejskim od 1831 roku, a współcześnie w przygotowanie wydarzenia angażują się także dzieci i młodzież.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (62, 'pl', 'GELATERIA LA PAOLA', ARRAY['To pełnoprawny, ale opcjonalny punkt trasy. Gelateria La Paola mieści się w historycznym centrum Spello. Aktualne zestawienia pokazują 4,6/5 przy 239 ocenach Google . Wśród wymienianych smaków pojawia się Sagrantino , a także nietypowe połączenie „Pane Burro & Marmellata". To dobry przykład miejsca, którego nie trzeba planować jako obowiązkowego przystanku: rodzina może zatrzymać się na lody, jeśli ma ochotę, albo po prostu przejść dalej.'], '🍦 Wybierz smak, którego normalnie nie zamówiłbyś w domu. Jeśli jest dostępny Sagrantino albo inny nietypowy smak, spróbujcie go i całą rodziną oceńcie go w skali 1–5. Jeśli nie macie ochoty na lody, pomińcie ten punkt i przejdźcie dalej.', 'Nie trzeba wybierać lodów właśnie tutaj. Punkt ma pokazać rodzicowi możliwość. Jeżeli dzieci jadły lody wcześniej, punkt można bez żalu pominąć.', 'Sagrantino jest regionalnym tropem smakowym Umbrii. Jeżeli smak jest dostępny tego dnia, warto zapytać dziecko, jak wyobrażało sobie smak lodów nazwanych od lokalnego produktu.', 'Opcjonalny punkt. Umieszczony przed punktem widokowym i kolacją, aby rodzina mogła zjeść lody wcześniej i zachować kolację jako finał dnia.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (65, 'pl', 'BELVEDERE PANORAMICO — PUNKT WIDOKOWY', ARRAY['Spello leży na zboczu i właśnie dlatego spacer po jego górnej części daje coś, czego nie da pojedynczy zabytek: panoramę Umbrii . Oficjalny opis miasta wskazuje belvedere panoramico osiągany w rejonie Arco Romano; trasa prowadzi także przez najwyżej położoną część miasta, nazywaną Belvedere. To miejsce warto traktować jako oddech po zwiedzaniu — nie trzeba tu niczego „zaliczać". Wystarczy zatrzymać się, popatrzeć na dolinę i pozwolić dzieciom samodzielnie znaleźć na horyzoncie charakterystyczne punkty.'], '👁️ Rodzinna lornetka bez lornetki. Każdy wybiera jeden szczegół na panoramie: wzgórze, wieżę, kościół, drogę albo miejscowość. Powiedzcie sobie nawzajem, co wybraliście i dlaczego. Na koniec zróbcie jedno wspólne zdjęcie widoku.', 'Nie ma jednej poprawnej odpowiedzi. Zadanie ma skłonić rodzinę do naprawdę uważnego patrzenia, a nie tylko do zrobienia zdjęcia panoramy.', 'Najciekawszy „smak" tego punktu to właśnie panorama: Spello pokazuje tu swój charakter miasta zbudowanego na zboczu. Jeżeli rodzina trafi tu przy zachodzie słońca, warto zostać kilka minut dłużej.', 'Opcjonalny punkt. Rodzic może go pominąć albo przesunąć w kolejności, zależnie od pogody, energii dzieci i pory dnia.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (66, 'pl', 'KOLACJA — FINAŁ DNIA', ARRAY['Kolacja ma być nagrodą po całym dniu, a nie kolejnym „obowiązkowym" punktem. Dlatego wybieramy miejsce z lokalnym charakterem, wygodną atmosferą i możliwością spokojnego zakończenia dnia. Najlepszy kandydat na finał to Osteria del Buchetto — restauracja przy Via Cappuccini, obok Arco Romano i blisko naturalnego belvedere. Opisy lokalu podkreślają taras z panoramą doliny Umbry, Monte Subasio, Bettony i Asyżu oraz kuchnię opartą na lokalnych produktach.'], 'Brak osobnego questu. To punkt dla rodzica i rodzinny finał dnia. Nie tworzymy sztucznego zadania przy kolacji.', 'Jeżeli rodzina chce widoku, wybierzcie stolik na tarasie Osteria del Buchetto i sprawdźcie przy rezerwacji, czy taras będzie dostępny. Po całym dniu chodzenia wybieramy wygodny, schludny strój — bez restauracji wymagających garnituru.', 'Wybierając kolację, szukamy konkretnego umbryjskiego produktu lub dania z aktualnego menu — np. trufli, oliwy ze Spello, domowego makaronu czy sezonowych produktów. Nazwę dania wpisujemy dopiero po sprawdzeniu aktualnego menu.', 'Kontrola przed publikacją: godziny kolacji na konkretny dzień, możliwość rezerwacji, aktualne menu i ceny, ocena Google, liczba opinii, dostępność tarasu/widoku oraz brak formalnego dress code''u.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

-- === JĘZYK: PT ===
INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (58, 'pt', 'Estacionamento Villa Dei Mosaici Di Spello', ARRAY['Este é o ponto prático de partida para visitar Spello. Deixem o carro aqui e continuem a pé.', 'Antes de estacionar, verifiquem a sinalização sobre ZTL, taxas e restrições. A sinalização no local prevalece.'], NULL, NULL, NULL, 'Confirmem no local a sinalização atual do estacionamento e da ZTL.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (59, 'pt', 'Villa dei Mosaici di Spello', ARRAY['A Villa dei Mosaici conserva os restos de uma villa romana e dos seus mosaicos. Aqui a vida romana torna-se um espaço concreto, não apenas uma data histórica.', 'Observem o triclinium, a sala de refeições romana com três lugares reclinados. A casa também servia para encontros e banquetes.'], 'Encontra um detalhe do mosaico que te lembre uma decoração moderna. Depois escolham juntos onde fariam hoje uma sala semelhante.', 'Observem primeiro os pavimentos e a disposição das salas, não apenas os fragmentos decorativos.', NULL, NULL, NULL, 'Zrób jedno zdjęcie mozaiki tak, aby było widać jej układ jako całość, a nie tylko pojedynczy fragment.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (72, 'pt', 'Porta Consolare', ARRAY['Brinquem aos arqueólogos. Encontrem três elementos de épocas diferentes da história da porta e fotografem um.'], 'Brinquem aos arqueólogos. Encontrem três elementos de épocas diferentes da história da porta e fotografem um.', 'A porta foi remodelada no Renascimento; as três estátuas de mármore são do final do século I a.C. e foram reutilizadas aqui.', 'As três estátuas de mármore são elementos romanos reutilizados.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (61, 'pt', 'Igreja de Sant''Andrea', ARRAY['Sant''Andrea fica na Via Cavour e integra-se naturalmente no percurso pelo centro histórico. Parem e observem a decoração.', 'Distingam os dados documentados pelas fontes das histórias locais. Atribuições não confirmadas não devem ser apresentadas como factos.'], 'Encontra um detalhe do mosaico que te lembre uma decoração moderna. Depois escolham juntos onde fariam hoje uma sala semelhante.', 'Observem primeiro os pavimentos e a disposição das salas, não apenas os fragmentos decorativos.', NULL, NULL, 'É exigido vestuário adequado; ombros e joelhos devem estar cobertos.', 'Zrób zdjęcie jednego powtarzającego się motywu, jeśli fotografowanie jest dozwolone.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (60, 'pt', 'Santa Maria Maggiore', ARRAY['Santa Maria Maggiore é um dos principais monumentos religiosos de Spello. O interior combina história medieval, alterações posteriores e obras de arte.', 'Prestem especial atenção à Cappella Baglioni e às histórias contadas pelas pinturas e frescos.'], 'Encontra um detalhe do mosaico que te lembre uma decoração moderna. Depois escolham juntos onde fariam hoje uma sala semelhante.', 'Observem primeiro os pavimentos e a disposição das salas, não apenas os fragmentos decorativos.', 'W kościołach Umbrii sztuka często opowiada historię obrazami. Spróbuj odczytać jedną scenę bez korzystania z opisu.', NULL, 'É exigido vestuário adequado; ombros e joelhos devem estar cobertos.', 'Zrób zdjęcie wybranego detalu dekoracji Cappella Baglioni, jeśli regulamin miejsca na to pozwala.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (75, 'pt', 'Via Giulia — traccia romana', ARRAY['Brinquem aos arqueólogos. Encontrem três elementos de épocas diferentes da história da porta e fotografem um.'], 'Brinquem aos arqueólogos. Encontrem três elementos de épocas diferentes da história da porta e fotografem um.', 'A porta foi remodelada no Renascimento; as três estátuas de mármore são do final do século I a.C. e foram reutilizadas aqui.', 'As três estátuas de mármore são elementos romanos reutilizados.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (64, 'pt', 'Porta Venere + Torri di Properzio', ARRAY['A Porta Venere e as Torri di Properzio são restos característicos das antigas fortificações. A porta mostra como a entrada na cidade era controlada.', 'É um bom lugar para explicar por que as cidades tinham muralhas: defesa e controlo do acesso.'], 'Encontra um detalhe do mosaico que te lembre uma decoração moderna. Depois escolham juntos onde fariam hoje uma sala semelhante.', 'Observem primeiro os pavimentos e a disposição das salas, não apenas os fragmentos decorativos.', NULL, NULL, NULL, 'Zrób zdjęcie, na którym widać jednocześnie bramę i wieże.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (77, 'pt', 'VICOLI / BELVEDERE — FINAŁ SPACERU', ARRAY[]::text[], NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (62, 'pt', 'Gelateria La Paola', ARRAY['Paragem opcional para gelado na Via Cavour. Os pais podem decidir se a família quer parar.', 'O gelado aparece antes da parte final da visita e do jantar. Se não quiserem, podem saltar a paragem.'], 'Encontra um detalhe do mosaico que te lembre uma decoração moderna. Depois escolham juntos onde fariam hoje uma sala semelhante.', NULL, 'Zwróć uwagę, czy w ofercie pojawiają się smaki lub składniki charakterystyczne dla Umbrii.', 'Paragem opcional — podem saltá-la.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (65, 'pt', 'Miradouro', ARRAY['O miradouro oferece outra perspetiva sobre Spello e a paisagem da Úmbria. Depois das ruas estreitas, é um bom lugar para uma pausa.', 'Pode ser especialmente bonito ao pôr do sol. A família pode adaptar a ordem ao seu dia.'], 'Encontra um detalhe do mosaico que te lembre uma decoração moderna. Depois escolham juntos onde fariam hoje uma sala semelhante.', 'Observem primeiro os pavimentos e a disposição das salas, não apenas os fragmentos decorativos.', NULL, NULL, NULL, 'Zrób rodzinne zdjęcie z panoramą Umbrii w tle.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (66, 'pt', 'Osteria del Buchetto', ARRAY['Última paragem para um jantar tranquilo. Os preços e horários devem ser confirmados numa fonte atual.', 'Na escolha do restaurante também contam o horário do jantar e um ambiente adequado para famílias.'], NULL, NULL, 'Przed zamówieniem zapytajcie, które danie lub składnik jest najbardziej lokalny.', 'Recomenda-se reserva; o número de lugares é limitado. Confirmem o horário antes da visita.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

-- === JĘZYK: RO ===
INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (58, 'ro', 'Parcarea Villa Dei Mosaici Di Spello', ARRAY['Acesta este punctul practic de pornire pentru vizitarea orașului Spello. Lăsați mașina aici și continuați pe jos.', 'Înainte de parcare verificați indicatoarele privind ZTL, taxele și restricțiile. Semnalizarea de la fața locului are prioritate.'], NULL, NULL, NULL, 'Verificați la fața locului indicatoarele actuale pentru parcare și ZTL.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (59, 'ro', 'Villa dei Mosaici di Spello', ARRAY['Villa dei Mosaici păstrează rămășițele unei vile romane și mozaicurile sale. Viața romană devine aici un spațiu concret, nu doar o dată istorică.', 'Observați tricliniumul, sala romană de mese cu trei locuri pentru stat întins. Casa era și un loc pentru întâlniri și banchete.'], 'Găsește un detaliu de mozaic care îți amintește de o decorațiune modernă. Apoi alegeți împreună unde ați crea astăzi o cameră asemănătoare.', 'Priviți mai întâi podelele și dispunerea încăperilor, nu doar fragmentele decorative.', NULL, NULL, NULL, 'Zrób jedno zdjęcie mozaiki tak, aby było widać jej układ jako całość, a nie tylko pojedynczy fragment.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (72, 'ro', 'Porta Consolare', ARRAY['Jucați-vă de-a arheologii. Găsiți trei elemente din perioade diferite ale istoriei porții și fotografiați unul.'], 'Jucați-vă de-a arheologii. Găsiți trei elemente din perioade diferite ale istoriei porții și fotografiați unul.', 'Poarta a fost modificată în Renaștere; cele trei statui de marmură datează de la sfârșitul secolului I î.Hr. și au fost refolosite aici.', 'Cele trei statui de marmură sunt elemente romane refolosite.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (61, 'ro', 'Biserica Sant''Andrea', ARRAY['Sant''Andrea se află pe Via Cavour și se potrivește natural în plimbarea prin centrul istoric. Opriți-vă și priviți decorul.', 'Deosebiți informațiile confirmate de surse de poveștile locale. Atribuirile neconfirmate nu trebuie prezentate drept fapte.'], 'Găsește un detaliu de mozaic care îți amintește de o decorațiune modernă. Apoi alegeți împreună unde ați crea astăzi o cameră asemănătoare.', 'Priviți mai întâi podelele și dispunerea încăperilor, nu doar fragmentele decorative.', NULL, NULL, 'Este necesară o ținută decentă; umerii și genunchii trebuie acoperiți.', 'Zrób zdjęcie jednego powtarzającego się motywu, jeśli fotografowanie jest dozwolone.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (60, 'ro', 'Santa Maria Maggiore', ARRAY['Santa Maria Maggiore este unul dintre principalele monumente religioase din Spello. Interiorul combină istoria medievală cu transformări ulterioare și opere de artă.', 'Acordați atenție Cappella Baglioni și poveștilor reprezentate în picturi și fresce.'], 'Găsește un detaliu de mozaic care îți amintește de o decorațiune modernă. Apoi alegeți împreună unde ați crea astăzi o cameră asemănătoare.', 'Priviți mai întâi podelele și dispunerea încăperilor, nu doar fragmentele decorative.', 'W kościołach Umbrii sztuka często opowiada historię obrazami. Spróbuj odczytać jedną scenę bez korzystania z opisu.', NULL, 'Este necesară o ținută decentă; umerii și genunchii trebuie acoperiți.', 'Zrób zdjęcie wybranego detalu dekoracji Cappella Baglioni, jeśli regulamin miejsca na to pozwala.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (75, 'ro', 'Via Giulia — Roman trace', ARRAY['Jucați-vă de-a arheologii. Găsiți trei elemente din perioade diferite ale istoriei porții și fotografiați unul.'], 'Jucați-vă de-a arheologii. Găsiți trei elemente din perioade diferite ale istoriei porții și fotografiați unul.', 'Poarta a fost modificată în Renaștere; cele trei statui de marmură datează de la sfârșitul secolului I î.Hr. și au fost refolosite aici.', 'Cele trei statui de marmură sunt elemente romane refolosite.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (64, 'ro', 'Porta Venere + Torri di Properzio', ARRAY['Porta Venere și Torri di Properzio sunt resturi caracteristice ale fortificațiilor. Poarta arată cum era controlat accesul în oraș.', 'Este un loc bun pentru a explica de ce orașele aveau ziduri: apărare și controlul accesului.'], 'Găsește un detaliu de mozaic care îți amintește de o decorațiune modernă. Apoi alegeți împreună unde ați crea astăzi o cameră asemănătoare.', 'Priviți mai întâi podelele și dispunerea încăperilor, nu doar fragmentele decorative.', NULL, NULL, NULL, 'Zrób zdjęcie, na którym widać jednocześnie bramę i wieże.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (77, 'ro', 'VICOLI / BELVEDERE — FINAŁ SPACERU', ARRAY[]::text[], NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (62, 'ro', 'Gelateria La Paola', ARRAY['O oprire opțională pentru înghețată pe Via Cavour. Părinții decid dacă familia dorește să se oprească.', 'Înghețata este înaintea ultimei părți a vizitei și a cinei. Dacă nu doriți, puteți sări peste oprire.'], 'Găsește un detaliu de mozaic care îți amintește de o decorațiune modernă. Apoi alegeți împreună unde ați crea astăzi o cameră asemănătoare.', NULL, 'Zwróć uwagę, czy w ofercie pojawiają się smaki lub składniki charakterystyczne dla Umbrii.', 'Oprire opțională — o puteți sări.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (65, 'ro', 'Belvedere', ARRAY['Belvederea oferă o perspectivă diferită asupra orașului Spello și a peisajului din Umbria. După străduțele înguste, este un loc bun pentru o pauză.', 'Poate fi deosebit de frumoasă la apus. Familia poate adapta ordinea în funcție de ziua proprie.'], 'Găsește un detaliu de mozaic care îți amintește de o decorațiune modernă. Apoi alegeți împreună unde ați crea astăzi o cameră asemănătoare.', 'Priviți mai întâi podelele și dispunerea încăperilor, nu doar fragmentele decorative.', NULL, NULL, NULL, 'Zrób rodzinne zdjęcie z panoramą Umbrii w tle.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (66, 'ro', 'Osteria del Buchetto', ARRAY['Ultima oprire pentru o cină liniștită. Prețurile și programul trebuie verificate într-o sursă actuală.', 'La alegerea restaurantului contează și ora cinei și atmosfera potrivită pentru familie.'], NULL, NULL, 'Przed zamówieniem zapytajcie, które danie lub składnik jest najbardziej lokalny.', 'Se recomandă rezervarea; numărul de locuri este limitat. Verificați programul înainte de vizită.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

-- === JĘZYK: SK ===
INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (58, 'sk', 'Parkovisko Villa Dei Mosaici Di Spello', ARRAY['Praktické východisko na návštevu Spella. Auto nechajte tu a pokračujte pešo.', 'Pred parkovaním skontrolujte ZTL, poplatky a obmedzenia. Rozhodujúce je aktuálne značenie na mieste.'], NULL, NULL, NULL, 'Na mieste skontrolujte aktuálne značenie parkoviska a ZTL.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (59, 'sk', 'Villa dei Mosaici di Spello', ARRAY['Villa dei Mosaici predstavuje pozostatky rímskej vily a jej mozaík. Rímsky život tu môžete vnímať ako skutočný priestor, nie iba ako historický dátum.', 'Všimnite si triclinium, rímsku jedáleň s tromi miestami na ležanie. Dom slúžil aj na stretnutia a hostiny.'], 'Nájdi detail mozaiky, ktorý ti pripomína modernú dekoráciu. Potom spoločne vyberte, kde by ste dnes vytvorili podobnú miestnosť.', 'Najprv si všimnite podlahy a usporiadanie miestností, nielen jednotlivé ozdobné fragmenty.', NULL, NULL, NULL, 'Zrób jedno zdjęcie mozaiki tak, aby było widać jej układ jako całość, a nie tylko pojedynczy fragment.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (72, 'sk', 'Porta Consolare', ARRAY['Zahrajte sa na archeológov. Nájdite tri prvky z rôznych období histórie brány a jeden odfoťte.'], 'Zahrajte sa na archeológov. Nájdite tri prvky z rôznych období histórie brány a jeden odfoťte.', 'Brána bola prestavaná v renesancii; tri mramorové sochy pochádzajú z konca 1. storočia pred n. l. a boli tu znovu použité.', 'Tri mramorové sochy sú znovu použité rímske prvky.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (61, 'sk', 'Kostol Sant''Andrea', ARRAY['Sant''Andrea sa nachádza na Via Cavour a prirodzene zapadá do prechádzky historickým centrom. Zastavte sa a pozrite si výzdobu.', 'Rozlišujte údaje potvrdené prameňmi od miestnych príbehov. Nepotvrdené autorstvá neuvádzajte ako fakty.'], 'Nájdi detail mozaiky, ktorý ti pripomína modernú dekoráciu. Potom spoločne vyberte, kde by ste dnes vytvorili podobnú miestnosť.', 'Najprv si všimnite podlahy a usporiadanie miestností, nielen jednotlivé ozdobné fragmenty.', NULL, NULL, 'Vyžaduje sa vhodné oblečenie; ramená a kolená by mali byť zakryté.', 'Zrób zdjęcie jednego powtarzającego się motywu, jeśli fotografowanie jest dozwolone.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (60, 'sk', 'Santa Maria Maggiore', ARRAY['Santa Maria Maggiore patrí medzi hlavné náboženské pamiatky Spella. Interiér spája stredovekú históriu s neskoršími úpravami a umením.', 'Zvláštnu pozornosť venujte Cappella Baglioni a príbehom na obrazoch a freskách.'], 'Nájdi detail mozaiky, ktorý ti pripomína modernú dekoráciu. Potom spoločne vyberte, kde by ste dnes vytvorili podobnú miestnosť.', 'Najprv si všimnite podlahy a usporiadanie miestností, nielen jednotlivé ozdobné fragmenty.', 'W kościołach Umbrii sztuka często opowiada historię obrazami. Spróbuj odczytać jedną scenę bez korzystania z opisu.', NULL, 'Vyžaduje sa vhodné oblečenie; ramená a kolená by mali byť zakryté.', 'Zrób zdjęcie wybranego detalu dekoracji Cappella Baglioni, jeśli regulamin miejsca na to pozwala.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (75, 'sk', 'Via Giulia — Roman trace', ARRAY['Zahrajte sa na archeológov. Nájdite tri prvky z rôznych období histórie brány a jeden odfoťte.'], 'Zahrajte sa na archeológov. Nájdite tri prvky z rôznych období histórie brány a jeden odfoťte.', 'Brána bola prestavaná v renesancii; tri mramorové sochy pochádzajú z konca 1. storočia pred n. l. a boli tu znovu použité.', 'Tri mramorové sochy sú znovu použité rímske prvky.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (64, 'sk', 'Porta Venere + Torri di Properzio', ARRAY['Porta Venere a Torri di Properzio sú charakteristické pozostatky opevnenia. Brána ukazuje, ako sa kontroloval vstup do mesta.', 'Je to dobré miesto na vysvetlenie, prečo mali mestá hradby: kvôli obrane a kontrole vstupu.'], 'Nájdi detail mozaiky, ktorý ti pripomína modernú dekoráciu. Potom spoločne vyberte, kde by ste dnes vytvorili podobnú miestnosť.', 'Najprv si všimnite podlahy a usporiadanie miestností, nielen jednotlivé ozdobné fragmenty.', NULL, NULL, NULL, 'Zrób zdjęcie, na którym widać jednocześnie bramę i wieże.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (77, 'sk', 'VICOLI / BELVEDERE — FINAŁ SPACERU', ARRAY[]::text[], NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (62, 'sk', 'Gelateria La Paola', ARRAY['Voliteľná zastávka na zmrzlinu na Via Cavour. Rodičia sa môžu rozhodnúť podľa chuti rodiny.', 'Zmrzlina je pred záverečnou časťou návštevy a večerou. Ak ju nechcete, zastávku vynechajte.'], 'Nájdi detail mozaiky, ktorý ti pripomína modernú dekoráciu. Potom spoločne vyberte, kde by ste dnes vytvorili podobnú miestnosť.', NULL, 'Zwróć uwagę, czy w ofercie pojawiają się smaki lub składniki charakterystyczne dla Umbrii.', 'Voliteľná zastávka — môžete ju vynechať.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (65, 'sk', 'Vyhliadka', ARRAY['Vyhliadka ponúka iný pohľad na Spello a umbrijskú krajinu. Po úzkych uliciach je to dobré miesto na oddych.', 'Pri západe slnka môže byť miesto obzvlášť krásne. Rodina môže poradie prispôsobiť svojmu dňu.'], 'Nájdi detail mozaiky, ktorý ti pripomína modernú dekoráciu. Potom spoločne vyberte, kde by ste dnes vytvorili podobnú miestnosť.', 'Najprv si všimnite podlahy a usporiadanie miestností, nielen jednotlivé ozdobné fragmenty.', NULL, NULL, NULL, 'Zrób rodzinne zdjęcie z panoramą Umbrii w tle.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (66, 'sk', 'Osteria del Buchetto', ARRAY['Záverečná zastávka na pokojnú večeru. Ceny a otváracie hodiny treba overiť v aktuálnom zdroji.', 'Pri výbere reštaurácie zohľadnite aj čas večere a prostredie vhodné pre rodinu.'], NULL, NULL, 'Przed zamówieniem zapytajcie, które danie lub składnik jest najbardziej lokalny.', 'Odporúča sa rezervácia; počet miest je obmedzený. Pred návštevou skontrolujte otváracie hodiny.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

-- === JĘZYK: SV ===
INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (58, 'sv', 'Parkering Villa Dei Mosaici Di Spello', ARRAY['Detta är den praktiska startpunkten för Spello. Lämna bilen här och fortsätt till fots.', 'Kontrollera skyltar om ZTL, avgifter och begränsningar innan ni parkerar. Skyltningen på plats gäller.'], NULL, NULL, NULL, 'Kontrollera aktuell skyltning för parkering och ZTL på plats.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (59, 'sv', 'Villa dei Mosaici di Spello', ARRAY['Villa dei Mosaici visar resterna av en romersk villa och dess mosaiker. Här blir det romerska livet ett konkret rum, inte bara ett historiskt datum.', 'Lägg märke till triclinium, den romerska matsalen med tre liggplatser. Huset användes också för möten och festmåltider.'], 'Hitta en mosaikdetalj som påminner dig om modern dekoration. Välj sedan tillsammans var ni skulle skapa ett liknande rum idag.', 'Titta först på golven och rummens planlösning, inte bara på enskilda dekorativa fragment.', NULL, NULL, NULL, 'Zrób jedno zdjęcie mozaiki tak, aby było widać jej układ jako całość, a nie tylko pojedynczy fragment.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (72, 'sv', 'Porta Consolare', ARRAY['Lek arkeologer. Hitta tre delar från olika perioder i portens historia och fotografera en.'], 'Lek arkeologer. Hitta tre delar från olika perioder i portens historia och fotografera en.', 'Porten byggdes om under renässansen; de tre marmorstatyerna är från slutet av 1:a århundradet f.Kr. och återanvändes här.', 'De tre marmorstatyerna är återanvända romerska delar.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (61, 'sv', 'Sant''Andrea-kyrkan', ARRAY['Sant''Andrea ligger på Via Cavour och passar naturligt in i promenaden genom den historiska stadskärnan. Stanna och titta på utsmyckningen.', 'Skilj mellan uppgifter som stöds av källor och lokala berättelser. Obekräftade attribueringar får inte presenteras som fakta.'], 'Hitta en mosaikdetalj som påminner dig om modern dekoration. Välj sedan tillsammans var ni skulle skapa ett liknande rum idag.', 'Titta först på golven och rummens planlösning, inte bara på enskilda dekorativa fragment.', NULL, NULL, 'Vårdad klädsel krävs; axlar och knän bör vara täckta.', 'Zrób zdjęcie jednego powtarzającego się motywu, jeśli fotografowanie jest dozwolone.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (60, 'sv', 'Santa Maria Maggiore', ARRAY['Santa Maria Maggiore är ett av Spellos viktigaste religiösa monument. Interiören förenar medeltida historia med senare förändringar och konst.', 'Titta särskilt på Cappella Baglioni och berättelserna i målningar och fresker.'], 'Hitta en mosaikdetalj som påminner dig om modern dekoration. Välj sedan tillsammans var ni skulle skapa ett liknande rum idag.', 'Titta först på golven och rummens planlösning, inte bara på enskilda dekorativa fragment.', 'W kościołach Umbrii sztuka często opowiada historię obrazami. Spróbuj odczytać jedną scenę bez korzystania z opisu.', NULL, 'Vårdad klädsel krävs; axlar och knän bör vara täckta.', 'Zrób zdjęcie wybranego detalu dekoracji Cappella Baglioni, jeśli regulamin miejsca na to pozwala.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (75, 'sv', 'Via Giulia — Roman trace', ARRAY['Lek arkeologer. Hitta tre delar från olika perioder i portens historia och fotografera en.'], 'Lek arkeologer. Hitta tre delar från olika perioder i portens historia och fotografera en.', 'Porten byggdes om under renässansen; de tre marmorstatyerna är från slutet av 1:a århundradet f.Kr. och återanvändes här.', 'De tre marmorstatyerna är återanvända romerska delar.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (64, 'sv', 'Porta Venere + Torri di Properzio', ARRAY['Porta Venere och Torri di Properzio är karakteristiska rester av de gamla befästningarna. Porten visar hur tillträdet till staden kontrollerades.', 'Här kan man förklara varför städer hade murar: försvar och kontroll av tillträdet.'], 'Hitta en mosaikdetalj som påminner dig om modern dekoration. Välj sedan tillsammans var ni skulle skapa ett liknande rum idag.', 'Titta först på golven och rummens planlösning, inte bara på enskilda dekorativa fragment.', NULL, NULL, NULL, 'Zrób zdjęcie, na którym widać jednocześnie bramę i wieże.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (77, 'sv', 'VICOLI / BELVEDERE — FINAŁ SPACERU', ARRAY[]::text[], NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (62, 'sv', 'Gelateria La Paola', ARRAY['Ett valfritt glassstopp på Via Cavour. Föräldrarna kan själva avgöra om familjen vill stanna.', 'Glassen ligger före den sista delen av besöket och middagen. Om ni inte vill ha glass kan ni hoppa över stoppet.'], 'Hitta en mosaikdetalj som påminner dig om modern dekoration. Välj sedan tillsammans var ni skulle skapa ett liknande rum idag.', NULL, 'Zwróć uwagę, czy w ofercie pojawiają się smaki lub składniki charakterystyczne dla Umbrii.', 'Valfritt stopp — ni kan hoppa över det.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (65, 'sv', 'Utsiktspunkt', ARRAY['Utsiktspunkten ger ett annat perspektiv på Spello och Umbriens landskap. Efter de smala gatorna är det en bra plats för en paus.', 'Platsen kan vara särskilt vacker vid solnedgång. Familjen kan anpassa ordningen efter dagen.'], 'Hitta en mosaikdetalj som påminner dig om modern dekoration. Välj sedan tillsammans var ni skulle skapa ett liknande rum idag.', 'Titta först på golven och rummens planlösning, inte bara på enskilda dekorativa fragment.', NULL, NULL, NULL, 'Zrób rodzinne zdjęcie z panoramą Umbrii w tle.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (66, 'sv', 'Osteria del Buchetto', ARRAY['Sista stoppet för en lugn middag. Priser och öppettider måste kontrolleras i en aktuell källa.', 'Vid valet av restaurang är även middagstiden och en familjevänlig miljö viktiga.'], NULL, NULL, 'Przed zamówieniem zapytajcie, które danie lub składnik jest najbardziej lokalny.', 'Bokning rekommenderas; antalet platser är begränsat. Kontrollera öppettiderna före besöket.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

-- === JĘZYK: UK ===
INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (58, 'uk', 'Парковка Villa Dei Mosaici Di Spello', ARRAY['Це практична початкова точка для відвідування Спелло. Залиште тут автомобіль і продовжуйте пішки.', 'Перед паркуванням перевірте знаки щодо ZTL, оплати та обмежень. На місці діють актуальні знаки.'], NULL, NULL, NULL, 'На місці перевірте актуальні знаки щодо паркування та ZTL.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (59, 'uk', 'Villa dei Mosaici di Spello', ARRAY['Villa dei Mosaici зберігає залишки римської вілли та її мозаїки. Тут римське життя постає як реальний простір, а не просто історична дата.', 'Зверніть увагу на трикліній — римську їдальню з трьома місцями для лежання. Будинок був також місцем зустрічей і бенкетів.'], 'Знайди деталь мозаїки, яка нагадує тобі сучасний декор. Потім разом вирішіть, де сьогодні ви створили б подібну кімнату.', 'Спочатку подивіться на підлоги та планування приміщень, а не лише на окремі декоративні фрагменти.', NULL, NULL, NULL, 'Zrób jedno zdjęcie mozaiki tak, aby było widać jej układ jako całość, a nie tylko pojedynczy fragment.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (72, 'uk', 'Porta Consolare', ARRAY['Пограйте в археологів. Знайдіть три елементи з різних періодів історії брами та сфотографуйте один.'], 'Пограйте в археологів. Знайдіть три елементи з різних періодів історії брами та сфотографуйте один.', 'Браму перебудували в епоху Відродження; три мармурові статуї датуються кінцем I століття до н. е. і були повторно використані тут.', 'Три мармурові статуї — повторно використані римські елементи.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (61, 'uk', 'Церква Sant''Andrea', ARRAY['Sant''Andrea розташована на Via Cavour і природно вписується в прогулянку історичним центром. Зупиніться й розгляньте оздоблення.', 'Відрізняйте дані, підтверджені джерелами, від місцевих історій. Непідтверджені атрибуції не можна подавати як факти.'], 'Знайди деталь мозаїки, яка нагадує тобі сучасний декор. Потім разом вирішіть, де сьогодні ви створили б подібну кімнату.', 'Спочатку подивіться на підлоги та планування приміщень, а не лише на окремі декоративні фрагменти.', NULL, NULL, 'Потрібен належний одяг; плечі та коліна мають бути прикриті.', 'Zrób zdjęcie jednego powtarzającego się motywu, jeśli fotografowanie jest dozwolone.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (60, 'uk', 'Santa Maria Maggiore', ARRAY['Santa Maria Maggiore — одна з головних релігійних пам''яток Спелло. Інтер''єр поєднує середньовічну історію з пізнішими змінами та мистецтвом.', 'Особливо зверніть увагу на Cappella Baglioni та історії, зображені на картинах і фресках.'], 'Знайди деталь мозаїки, яка нагадує тобі сучасний декор. Потім разом вирішіть, де сьогодні ви створили б подібну кімнату.', 'Спочатку подивіться на підлоги та планування приміщень, а не лише на окремі декоративні фрагменти.', 'W kościołach Umbrii sztuka często opowiada historię obrazami. Spróbuj odczytać jedną scenę bez korzystania z opisu.', NULL, 'Потрібен належний одяг; плечі та коліна мають бути прикриті.', 'Zrób zdjęcie wybranego detalu dekoracji Cappella Baglioni, jeśli regulamin miejsca na to pozwala.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (75, 'uk', 'Via Giulia — Roman trace', ARRAY['Пограйте в археологів. Знайдіть три елементи з різних періодів історії брами та сфотографуйте один.'], 'Пограйте в археологів. Знайдіть три елементи з різних періодів історії брами та сфотографуйте один.', 'Браму перебудували в епоху Відродження; три мармурові статуї датуються кінцем I століття до н. е. і були повторно використані тут.', 'Три мармурові статуї — повторно використані римські елементи.', NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (64, 'uk', 'Porta Venere + Torri di Properzio', ARRAY['Porta Venere та Torri di Properzio — характерні залишки колишніх укріплень. Ворота показують, як контролювали вхід до міста.', 'Це гарне місце, щоб пояснити, навіщо містам були мури: для оборони та контролю доступу.'], 'Знайди деталь мозаїки, яка нагадує тобі сучасний декор. Потім разом вирішіть, де сьогодні ви створили б подібну кімнату.', 'Спочатку подивіться на підлоги та планування приміщень, а не лише на окремі декоративні фрагменти.', NULL, NULL, NULL, 'Zrób zdjęcie, na którym widać jednocześnie bramę i wieże.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (77, 'uk', 'VICOLI / BELVEDERE — FINAŁ SPACERU', ARRAY[]::text[], NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (62, 'uk', 'Gelateria La Paola', ARRAY['Необов''язкова зупинка на морозиво на Via Cavour. Батьки можуть вирішити, чи хоче сім''я зупинитися.', 'Морозиво розташоване перед завершальною частиною прогулянки та вечерею. Якщо не хочете, зупинку можна пропустити.'], 'Знайди деталь мозаїки, яка нагадує тобі сучасний декор. Потім разом вирішіть, де сьогодні ви створили б подібну кімнату.', NULL, 'Zwróć uwagę, czy w ofercie pojawiają się smaki lub składniki charakterystyczne dla Umbrii.', 'Необов''язкова зупинка — її можна пропустити.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (65, 'uk', 'Оглядовий майданчик', ARRAY['Оглядовий майданчик дає інший погляд на Спелло та пейзаж Умбрії. Після вузьких вулиць це хороше місце для паузи.', 'На заході сонця тут може бути особливо красиво. Сім''я може пристосувати порядок до свого дня.'], 'Знайди деталь мозаїки, яка нагадує тобі сучасний декор. Потім разом вирішіть, де сьогодні ви створили б подібну кімнату.', 'Спочатку подивіться на підлоги та планування приміщень, а не лише на окремі декоративні фрагменти.', NULL, NULL, NULL, 'Zrób rodzinne zdjęcie z panoramą Umbrii w tle.')
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();

INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES (66, 'uk', 'Osteria del Buchetto', ARRAY['Остання зупинка для спокійної вечері. Ціни та години роботи потрібно перевірити в актуальному джерелі.', 'Під час вибору ресторану важливі також час вечері та атмосфера, зручна для сім''ї.'], NULL, NULL, 'Przed zamówieniem zapytajcie, które danie lub składnik jest najbardziej lokalny.', 'Рекомендується бронювання; кількість місць обмежена. Перед візитом перевірте години роботи.', NULL, NULL)
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();



-- KROK 4: day_plan — PL (DELETE stare + INSERT nowe z v31 stop_keys)

DELETE FROM day_plan WHERE city_slug = 'spello' AND lang = 'pl';

INSERT INTO day_plan (city_slug, lang, time_label, description, sort_order, stop_key)
VALUES
  ('spello', 'pl', '09:00', 'PARKING VILLA DEI MOSAICI', 1, 'parking-villa-dei-mosaici'),
  ('spello', 'pl', '09:15', 'VILLA DEI MOSAICI', 2, 'villa-dei-mosaici'),
  ('spello', 'pl', '10:15', 'PORTA CONSOLARE', 3, 'porta-consolare'),
  ('spello', 'pl', '10:30', 'CHIESA DI SANT''ANDREA', 4, 'sant-andrea'),
  ('spello', 'pl', '11:00', 'SANTA MARIA MAGGIORE / CAPPELLA BAGLIONI', 5, 'santa-maria-maggiore'),
  ('spello', 'pl', '11:45', 'VIA GIULIA — ŚLAD RZYMSKI', 6, 'via-giulia'),
  ('spello', 'pl', '12:00', 'PORTA VENERE + TORRI DI PROPERZIO', 7, 'porta-venere'),
  ('spello', 'pl', '12:20', 'VICOLI / BELVEDERE — FINAŁ SPACERU', 8, 'vicoli-belvedere'),
  ('spello', 'pl', '12:45', 'GELATERIA LA PAOLA', 9, 'gelateria-la-paola'),
  ('spello', 'pl', '13:00', 'BELVEDERE PANORAMICO — PUNKT WIDOKOWY', 10, 'belvedere-panoramico'),
  ('spello', 'pl', '13:30', 'KOLACJA — FINAŁ DNIA', 11, 'kolacja');


-- KROK 5: emergency_points
-- PL już istnieje — pomijamy, nie nadpisujemy
-- EN — wstawiamy jeśli brakuje

-- EN emergency points
INSERT INTO emergency_points (city_slug, lang, type, label, description, maps_query, sort_order)
VALUES ('spello', 'en', 'pharmacy', 'Farmacia Bartoli', 'Via Cavour 63. Check current opening hours before visiting.', 'Farmacia Bartoli, Spello PG, Italy', 10)
ON CONFLICT (city_slug, lang, sort_order) DO UPDATE SET
  type = EXCLUDED.type, label = EXCLUDED.label,
  description = EXCLUDED.description, maps_query = EXCLUDED.maps_query;

INSERT INTO emergency_points (city_slug, lang, type, label, description, maps_query, sort_order)
VALUES ('spello', 'en', 'pharmacy', 'Farmacia Buattini Sozi', 'Via Pinturicchio 6. Check current opening hours before visiting.', 'Farmacia Buattini Sozi, Spello PG, Italy', 20)
ON CONFLICT (city_slug, lang, sort_order) DO UPDATE SET
  type = EXCLUDED.type, label = EXCLUDED.label,
  description = EXCLUDED.description, maps_query = EXCLUDED.maps_query;

INSERT INTO emergency_points (city_slug, lang, type, label, description, maps_query, sort_order)
VALUES ('spello', 'en', 'toilet', 'Public toilets', 'Public toilets in Spello; check the exact location and availability on site.', 'Public toilets, Spello PG, Italy', 30)
ON CONFLICT (city_slug, lang, sort_order) DO UPDATE SET
  type = EXCLUDED.type, label = EXCLUDED.label,
  description = EXCLUDED.description, maps_query = EXCLUDED.maps_query;



