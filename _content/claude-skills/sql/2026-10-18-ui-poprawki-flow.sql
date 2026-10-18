-- Poprawki po przejściu całej strony (JP 2026-10-18):
-- 1) home.all_free_text — nie obiecujemy „nic nie trzeba zakładać”, bo pełna wycieczka wymaga darmowego konta.
-- 2) city.lang_fallback — notka na stronie miasta, gdy trasy nie ma jeszcze w języku interfejsu.
BEGIN;
INSERT INTO public.ui_translations (key, lang, value) VALUES
  ('home.all_free_text', 'pl', 'Otwórz region na telefonie, wybierz miasto na dziś i ruszaj. Pełną wycieczkę otwiera bezpłatne konto rodzica — bez aplikacji do pobrania.'),
  ('home.all_free_text', 'en', 'Open a region on your phone, pick today''s city and go. A free parent account unlocks the full trip — no app to download.'),
  ('home.all_free_text', 'de', 'Region auf dem Handy öffnen, Stadt für heute wählen und los. Ein kostenloses Elternkonto schaltet den ganzen Ausflug frei — keine App nötig.'),
  ('home.all_free_text', 'it', 'Apri una regione sul telefono, scegli la città di oggi e parti. Un account genitore gratuito sblocca la gita completa — nessuna app da scaricare.'),
  ('home.all_free_text', 'cs', 'Otevřete region v telefonu, vyberte město na dnešek a vyrazte. Celý výlet odemkne bezplatný účet rodiče — bez stahování aplikace.'),
  ('home.all_free_text', 'da', 'Åbn en region på telefonen, vælg dagens by og tag af sted. En gratis forældrekonto åbner hele udflugten — ingen app at downloade.'),
  ('home.all_free_text', 'es', 'Abre una región en el móvil, elige la ciudad de hoy y en marcha. Una cuenta de padres gratuita desbloquea la excursión completa — sin descargar ninguna app.'),
  ('home.all_free_text', 'fr', 'Ouvrez une région sur votre téléphone, choisissez la ville du jour et c''est parti. Un compte parent gratuit débloque l''excursion complète — aucune appli à télécharger.'),
  ('home.all_free_text', 'hr', 'Otvorite regiju na mobitelu, odaberite grad za danas i krenite. Besplatan roditeljski račun otključava cijeli izlet — bez preuzimanja aplikacije.'),
  ('home.all_free_text', 'hu', 'Nyisd meg a régiót a telefonodon, válaszd ki a mai várost, és indulás. Az ingyenes szülői fiók megnyitja a teljes kirándulást — nem kell alkalmazást letölteni.'),
  ('home.all_free_text', 'nl', 'Open een regio op je telefoon, kies de stad van vandaag en ga. Een gratis ouderaccount opent de volledige uitstap — geen app te downloaden.'),
  ('home.all_free_text', 'no', 'Åpne en region på telefonen, velg dagens by og dra. En gratis foreldrekonto åpner hele turen — ingen app å laste ned.'),
  ('home.all_free_text', 'pt', 'Abre uma região no telemóvel, escolhe a cidade de hoje e parte. Uma conta de pais gratuita desbloqueia o passeio completo — sem app para descarregar.'),
  ('home.all_free_text', 'ro', 'Deschide o regiune pe telefon, alege orașul de azi și pornește. Un cont gratuit de părinte deblochează excursia completă — fără aplicație de descărcat.'),
  ('home.all_free_text', 'sk', 'Otvorte región v telefóne, vyberte mesto na dnes a vyrazte. Celý výlet odomkne bezplatný účet rodiča — bez sťahovania aplikácie.'),
  ('home.all_free_text', 'sv', 'Öppna en region i mobilen, välj dagens stad och kör. Ett gratis föräldrakonto låser upp hela utflykten — ingen app att ladda ner.'),
  ('home.all_free_text', 'uk', 'Відкрийте регіон на телефоні, оберіть місто на сьогодні й вирушайте. Безкоштовний обліковий запис батьків відкриває всю поїздку — без завантаження застосунку.'),
  ('city.lang_fallback', 'pl', 'Tej trasy nie ma jeszcze w Twoim języku. Opis poniżej jest w języku:'),
  ('city.lang_fallback', 'en', 'This trip isn''t available in your language yet. The description below is in:'),
  ('city.lang_fallback', 'de', 'Diesen Ausflug gibt es noch nicht in deiner Sprache. Die Beschreibung unten ist auf:'),
  ('city.lang_fallback', 'it', 'Questa gita non è ancora disponibile nella tua lingua. La descrizione qui sotto è in:'),
  ('city.lang_fallback', 'cs', 'Tento výlet zatím není ve vašem jazyce. Popis níže je v jazyce:'),
  ('city.lang_fallback', 'da', 'Denne udflugt findes endnu ikke på dit sprog. Beskrivelsen nedenfor er på:'),
  ('city.lang_fallback', 'es', 'Esta excursión aún no está disponible en tu idioma. La descripción de abajo está en:'),
  ('city.lang_fallback', 'fr', 'Cette excursion n''est pas encore disponible dans votre langue. La description ci-dessous est en :'),
  ('city.lang_fallback', 'hr', 'Ovaj izlet još nije dostupan na vašem jeziku. Opis ispod je na jeziku:'),
  ('city.lang_fallback', 'hu', 'Ez a kirándulás még nem érhető el a nyelveden. Az alábbi leírás nyelve:'),
  ('city.lang_fallback', 'nl', 'Deze uitstap is nog niet beschikbaar in jouw taal. De beschrijving hieronder is in het:'),
  ('city.lang_fallback', 'no', 'Denne turen finnes ennå ikke på ditt språk. Beskrivelsen nedenfor er på:'),
  ('city.lang_fallback', 'pt', 'Este passeio ainda não está disponível no teu idioma. A descrição abaixo está em:'),
  ('city.lang_fallback', 'ro', 'Această excursie nu este încă disponibilă în limba ta. Descrierea de mai jos este în:'),
  ('city.lang_fallback', 'sk', 'Tento výlet zatiaľ nie je vo vašom jazyku. Popis nižšie je v jazyku:'),
  ('city.lang_fallback', 'sv', 'Den här utflykten finns ännu inte på ditt språk. Beskrivningen nedan är på:'),
  ('city.lang_fallback', 'uk', 'Цієї поїздки ще немає вашою мовою. Опис нижче мовою:')
ON CONFLICT (key, lang) DO UPDATE SET value = EXCLUDED.value;
COMMIT;
