---
name: Quolino
description: Album naklejek dla rodzinnego zwiedzania — każde miasto to strona albumu, przystanki to numerowane naklejki do zebrania.
colors:
  azzurro: "#0B4EA2"
  azzurro-ink: "#083D80"
  azzurro-deep: "#062A58"
  azzurro-50: "#E2EBF7"
  sun: "#FFC629"
  sun-ink: "#3B2A00"
  sun-50: "#FFF4CF"
  rosso: "#C81E36"
  rosso-50: "#FBE6E9"
  verde: "#1F7A48"
  verde-50: "#E1F2E7"
  page: "#EAF0F8"
  card: "#FFFFFF"
  ink: "#0E1A2B"
  ink2: "#3E4C63"
  muted: "#5D6B82"
  rule: "#D3DDEA"
  slot: "#A9BBD3"
  slot-ink: "#B8C7DB"
  cover-ink-soft: "#DCE7F7"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(64px, 12vw, 152px)"
    fontWeight: 900
    lineHeight: 0.86
    letterSpacing: "-0.005em"
    fontVariation: "'wdth' 62"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(46px, 8.4vw, 96px)"
    fontWeight: 900
    lineHeight: 0.94
    letterSpacing: "-0.005em"
    fontVariation: "'wdth' 62"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(30px, 3.4vw, 40px)"
    fontWeight: 900
    lineHeight: 0.95
    fontVariation: "'wdth' 62"
  number:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 900
    letterSpacing: "-0.02em"
    fontFeature: "'tnum' 1"
    fontVariation: "'wdth' 125"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1.55
    fontFeature: "'tnum' 1"
  subhead:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    letterSpacing: "0.07em"
    fontVariation: "'wdth' 75"
rounded:
  tiny: "8px"
  btn: "10px"
  stk: "12px"
  panel: "16px"
spacing:
  gutter: "clamp(20px, 4vw, 48px)"
  wide: "1240px"
  touch: "44px"
  section: "clamp(64px, 9vw, 120px)"
components:
  button-primary:
    backgroundColor: "{colors.azzurro}"
    textColor: "{colors.card}"
    typography: "{typography.body}"
    rounded: "{rounded.btn}"
    padding: "0 26px"
    height: "56px"
  button-sun:
    backgroundColor: "{colors.sun}"
    textColor: "{colors.sun-ink}"
    rounded: "{rounded.btn}"
    padding: "0 26px"
    height: "56px"
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.azzurro-ink}"
    rounded: "{rounded.btn}"
    padding: "10px 20px"
    height: "52px"
  button-secondary-hover:
    backgroundColor: "{colors.azzurro-50}"
    textColor: "{colors.azzurro-ink}"
  sticker:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.stk}"
    padding: "7px 7px 0"
  sticker-number:
    backgroundColor: "{colors.azzurro}"
    textColor: "{colors.card}"
    typography: "{typography.number}"
    rounded: "{rounded.tiny}"
    height: "34px"
  slot:
    textColor: "{colors.muted}"
    rounded: "{rounded.stk}"
    padding: "16px"
  tab:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink2}"
    rounded: "{rounded.btn}"
    padding: "0 16px"
    height: "44px"
  tab-active:
    backgroundColor: "{colors.azzurro}"
    textColor: "{colors.card}"
  mission-card:
    backgroundColor: "{colors.azzurro-50}"
    textColor: "{colors.ink}"
    rounded: "14px"
    padding: "18px 20px"
  mission-card-done:
    backgroundColor: "{colors.verde-50}"
  panel:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
---

# Design System: Quolino

## Overview

**Creative North Star: „Album naklejek”**

Każde miasto to strona albumu z naklejkami w tradycji Panini z Modeny. Przystanki są numerowanymi naklejkami do zebrania, a rodzinny dzień to kompletowanie strony: od parkingu (01) po kolację (złota naklejka-folia). Rodzic czyta tę stronę jak plan, dziecko na tej samej stronie wkleja naklejki, zaliczając misje. Jeden świat, dwie role.

Świat jest zbudowany z trzech materiałów. **Okładka i pasy** w głębokim azzurro (kolor reprezentacji Włoch) zajmują duże, pełnoszerokie pola u góry i na końcu strony; na stronie miasta ten sam pas przyjmuje kolor „drużyny” miasta z bazy (`bandana_color`). **Strona albumu** to jasnoniebieski, drukowany papier z delikatnym rastrem kropek. **Naklejki** to białe kartoniki z zaokrąglonymi rogami, numerem w „kapslu” nachodzącym na róg, lekkim przechyłem i cienkim paskiem w kolorze drużyny u dołu. Puste miejsca na naklejki to przerywany obrys z wielkim, bladym numerem.

Typografia to jedna rodzina, Archivo, rozciągana osią szerokości: wąskie czarne kapitaliki na nazwy, szerokie czarne cyfry na numery, zwykła szerokość na tekst. Gęstość jest umiarkowana i hojna dla palca: wszystko musi dać się czytać jedną ręką, w słońcu, na włoskiej uliczce. Świat odrzuca „kremowy papier + terakotę + zaokrąglone karty” typowe dla rodzinnych przewodników.

**Odstępstwa od kontraktu kierunku (świadome, zatwierdzone w buildzie):**
1. Grunt strony to nie biały gładki karton, tylko jasnoniebieska drukowana strona albumu (`page` z rastrem kropek). Białe są wyłącznie naklejki i panele, dzięki czemu naklejka zawsze odcina się od strony.
2. Każda naklejka niesie cienki pasek w kolorze drużyny (8px na kafelkach, 12–14px na dużych naklejkach), którego kontrakt nie przewidywał. Pasek łączy naklejkę z jej miastem.

**Key Characteristics:**
- Pełnoszerokie pasy azzurro / koloru drużyny jako okładka albumu.
- Jasnoniebieska strona z rastrem kropek jako tło wszystkiego.
- Białe naklejki: przechył, numer w kapslu, pasek drużyny, uniesienie na hover.
- Puste miejsca = przerywany obrys + duży blady numer.
- Złota folia zarezerwowana dla wyróżnionych naklejek (kolacja, Quo #00).
- Archivo w trzech szerokościach: 62% nazwy, 100% tekst, 125% cyfry.
- Sygnaturowa interakcja „wklejenia” naklejki w widoku dziecka.

## Colors

Chłodna, nasycona paleta z jednym dominującym granatem-azzurro, słonecznym żółtym do akcji i trzema sygnałowymi akcentami włoskiej flagi.

### Primary
- **Azzurro reprezentacji** (`azzurro`): kolor okładki i pasów, przyciski główne poza pasem, kapsle z numerami naklejek, aktywna zakładka, linki akcji („Zobacz →”), czasy przystanków. Domyślna wartość `--team`.
- **Azzurro ciemne** (`azzurro-ink`): hover przycisków głównych, tekst przycisków drugorzędnych i fraz włoskich.
- **Azzurro nocne** (`azzurro-deep`): baza cieni `--lift-3`, przyciemnienie nakładki języka, tekst notatki o stroju.
- **Azzurro blade** (`azzurro-50`): tło ilustracji w naklejkach przystanków, karteczek misji, hover elementów nawigacji, plakietek czasu trwania.

### Secondary
- **Słońce** (`sun`): przycisk akcji na pasie drużyny („Trasa”), link Buy Me a Coffee, pierścień fokusu, zaznaczenie tekstu, kropka w logo, kreska podpisu arkusza. Na żółtym zawsze tekst `sun-ink`.
- **Słońce blade** (`sun-50`): karteczki misji fotograficznych, ramka festiwalu, notatka „smak”.

### Tertiary
- **Rosso** (`rosso`) / `rosso-50`: numery alarmowe (duże cyfry), notatki ostrzegawcze, stan błędu.
- **Verde** (`verde`) / `verde-50`: zaliczona misja (ptaszek, obrys, tło), przełącznik przystanku włączony, obwódka zebranej naklejki w widoku dziecka.
- **Folia** (`--foil`, gradient złota 135°): naklejka-folia. Nie jest kolorem płaskim; patrz sidecar.

### Neutral
- **Strona albumu** (`page`): grunt każdej strony, z rastrem kropek azzurro 7,5% co 15px. Też tło pigułek i separatorów wewnątrz paneli.
- **Biały karton** (`card`): naklejki, panele, karty, przyciski drugorzędne.
- **Atrament** (`ink`): tekst główny i nazwy.
- **Atrament drugi** (`ink2`): akapity pomocnicze, opisy.
- **Szary albumu** (`muted`): etykiety, metadane, stopka.
- **Linia** (`rule`): obrysy 2px przycisków drugorzędnych i zakładek, separatory.
- **Obrys miejsca** (`slot`) / **numer miejsca** (`slot-ink`): przerywane obrysy pustych miejsc, linia trasy, wyłączony przełącznik.
- **Mgła okładki** (`cover-ink-soft`): podtytuły i okruszki na pasie azzurro.

### Named Rules
**The Team Colour Rule.** Kolor drużyny (`--team`) maluje tylko trzy rzeczy: pas nagłówka miasta, pasek u dołu naklejki i tło ilustracji, gdy brak zdjęcia. Nie trafia do tekstu ani przycisków. Gdy kolor drużyny jest jasny (np. żółte Urbino), pas przełącza się na ciemny atrament i przyciski azzurro.

**The Gold Is Earned Rule.** Folia jest wyłącznie dla naklejek wyróżnionych: kolacji na stronie miasta i Quo #00 na okładce. Jedna folia na stronę (ostatni przystanek, jeśli to restauracja lub lody; jego mini-naklejka w pasku pod zdjęciem też jest złota).

**The Sun Means Go Rule.** Żółte tło niosą tylko akcje (trasa, wsparcie) i fokus. Żółty nie jest dekoracją.

## Typography

**Display Font:** Archivo, oś szerokości 62% (z system-ui, sans-serif)
**Body Font:** Archivo, szerokość 100%
**Label/Mono Font:** Archivo 75% (etykiety) i 125% (cyfry)

**Character:** Jedna zmienna rodzina udaje trzy kroje albumu: wąskie czarne kapitaliki z nadruku naklejek, szerokie czarne cyfry z numeracji Panini i spokojny groteskowy tekst. Ładowana z Google Fonts jako `Archivo:wdth,wght@62..125,400..900`; w CSS przez `font-stretch`.

### Hierarchy
- **Display** (900, 62%, kapitaliki, clamp(64px, 12vw, 152px), 0.86): nazwa miasta na pasie drużyny; nazwa regionu do 140px.
- **Headline** (900, 62%, kapitaliki, h1 clamp(46px, 8.4vw, 96px) / h2 clamp(36px, 5.6vw, 64px), 0.94, `text-wrap: balance`): tytuły okładki i sekcji albumu; tytuł okładki ograniczony do 14ch.
- **Title** (900, 62%, kapitaliki, 24–40px, 0.92–1): nazwy na naklejkach i kafelkach (24–36px), nazwy przystanków clamp(30px, 3.4vw, 40px), nagłówki paneli 28–30px.
- **Number** (900, 125%, cyfry tabelaryczne, 14–32px): numery w kapslach, godziny przystanków, statystyki „odwrotu naklejki”, numery telefonów; pusta naklejka ma numer clamp(40px, 5vw, 64px).
- **Subhead** (800, 100%, 21–26px, 1.2): nagłówki h3 w treści, tytuły kart.
- **Body** (400, 19px, 1.55; proza przystanku 1.65 i max 66ch; lede clamp(19px, 2vw, 22px) i max 60ch): cały tekst czytany.
- **Label** (700, 75%, kapitaliki, 14–15px, rozstrzał 0.06–0.07em, `muted`): metadane naklejek, nagłówki pigułek, etykiety pól. Tylko krótkie metadane, nigdy treść.

### Named Rules
**The Three Widths Rule.** Nazwy są wąskie (62%), cyfry szerokie (125%), tekst normalny. Nie mieszamy: liczba w nazwie dostaje szerokość cyfr, a akapit nigdy nie jest wąski.

**The 18px Floor Rule.** Tekst treści ma min 18px (body 19px). Poniżej 18px wolno zejść tylko z krótką etykietą lub metadaną.

## Layout

Kontener `wide` (1240px) z marginesem `gutter` (clamp(20px, 4vw, 48px)). Pasy (`.band`) wychodzą na pełną szerokość okna przez cień 100vmax i `clip-path`, a ich zawartość zostaje w kontenerze. Sekcje strony albumu oddziela `section` (clamp(64px, 9vw, 120px)); nagłówek sekcji to wiersz tytuł + opis wyrównany do dołu.

Kompozycje nachodzą na krawędź pasa: siatka miast w regionie wjeżdża na pas o -48px, duże zdjęcie miasta (naklejka-hero) wjeżdża o clamp(-150px, -12vw, -96px), naklejka Quo #00 na okładce stoi na skraju arkusza. To nachodzenie jest podpisem świata.

Siatki są płynne (`auto-fill, minmax(250–270px, 1fr)`), z dużą przerwą pionową (34–40px), żeby przechylone naklejki nie kolidowały. Strona miasta: kolumna treści + boczny panel 320px od 1040px (panel sticky na 140px), zakładki sticky pod nawigacją (64px). Okładka: dwie kolumny od 960px, arkusz naklejek 1.25fr / 1fr / 1fr. Punkty przełamania w użyciu: 560, 720, 800, 900, 960, 1040px. Layout znosi +30% dłuższy tekst (13+ języków): przyciski i zakładki zawijają się lub przewijają poziomo, nazwy mają `text-wrap: balance`.

**The 44px Rule.** Każdy cel dotykowy ma min 44×44px; przyciski główne 56px, drugorzędne 52px, kompaktowe 46px.

## Elevation & Depth

System jest warstwowy i fizyczny: naklejka leży na stronie i rzuca miękki, chłodny cień z odcieniem atramentu lub azzurro. Głębia oznacza „ile naklejka odstaje od strony”. Panele treści leżą płasko z najniższym cieniem; naklejki stoją wyżej; podniesiona naklejka i nakładki stoją najwyżej. Przyciski mają dodatkowo wewnętrzny dolny „docisk” 4px, który sygnalizuje możliwość wciśnięcia.

### Shadow Vocabulary
- **Lift 1** (`--lift-1`): panele, karty, pigułki-kapsle, przyciski. Leży na stronie.
- **Lift 2** (`--lift-2`): naklejki w spoczynku, otwarty przystanek, panel „dlaczego”.
- **Lift 3** (`--lift-3`, odcień azzurro-deep): naklejka podniesiona na hover, duże zdjęcie miasta, okno języka.
- **Docisk przycisku** (`inset 0 -4px 0 rgba(0,0,0,.18)`): przyciski pełne; przy `:active` spłaszcza się do 1px.

### Named Rules
**The Lift On Touch Rule.** Naklejka unosi się (−6px, prostuje przechył, cień Lift 3) tylko jako odpowiedź na hover; w spoczynku ma swój przechył i Lift 2. Panele nie podskakują wyżej niż −3px.

## Shapes

Język form to tekturowe kartoniki: zaokrąglone, ale nie miękkie. Naklejka ma 12px (`stk`), przycisk 10px (`btn`), duże panele i przystanki 16px (`panel`), kapsle numerów i pigułki 8px (`tiny`); obraz w środku naklejki ma 7px, żeby biała ramka miała równą grubość. Brak kształtów pigułkowych 999px w buildzie.

Przechył jest częścią kształtu: naklejki mają `--tilt` od −3° do +2°, naprzemiennie (np. 3n+1 / 3n+2 / 3n w siatkach, parzyste/nieparzyste na trasie). Duże zdjęcie miasta ma −1,2°. Puste miejsca mają przerywany obrys 2,5px w kolorze `slot` i nie są przechylone. Linia trasy na landingu to przerywana kreska 3px łącząca naklejki.

## Components

### Buttons
Dotykowe, pełne, z dociskiem; jak przycisk na grubym kartonie.
- **Shape:** zaokrąglone rogi (10px), wysokość 56px, padding 0 26px, 19px / 800.
- **Primary:** azzurro z białym tekstem; na pasie drużyny przycisk główny zmienia się na słońce z `sun-ink`.
- **Hover / Focus:** uniesienie −2px i cień Lift 2; `:active` +1px i spłaszczony docisk; fokus to obrys 3px w kolorze słońca z odsunięciem 3px.
- **Sun:** słońce na przyciskach okładki i akcjach wsparcia.
- **Ghost:** przezroczysty z obrysem 2px w `currentColor`, używany na pasach.
- **Secondary (`.qc-btn`):** biały karton, tekst azzurro-ink, wewnętrzny obrys 2px `rule`; hover zmienia obrys na azzurro i tło na azzurro-50. Wariant kompaktowy 46px.

### Chips
- **Filtr czasu trwania (na pasie):** obrys 2px białego 45%, tekst biały, 44px; aktywny = białe tło, tekst azzurro-ink.
- **Fakty na pasie:** płytki 8px z białym 16% na tle drużyny; licznik naklejek „0/11” jako biała płytka z cyfrą azzurro.
- **Pigułki przystanku (odwrót naklejki):** tło `page`, 8px, etykieta w kapitalikach + wartość 17px/700; układ ROK · BILET · CZAS.

### Cards / Containers
- **Corner Style:** 14–16px dla paneli treści, 12px dla naklejek.
- **Background:** biały karton na stronie `page`; warianty tonalne `sun-50` (festiwal), `sun` (wsparcie), azzurro (ramka „drużyny” w regulaminie).
- **Shadow Strategy:** Lift 1 w spoczynku; panele z linkiem unoszą się −3px do Lift 2.
- **Border:** brak; separatory wewnątrz to linie 2px w kolorze `page` lub `rule`.
- **Internal Padding:** 18–26px.

### Inputs / Fields
- **Pole kopiowania linku:** 44px, obrys 2px `rule`, tło `page`, 8px; przycisk obok azzurro.
- **Checkbox misji:** 30×30, 8px, obrys 2,5px w kolorze tekstu karteczki; zaznaczony = verde z białym ptaszkiem wskakującym ze skali 0.
- **Przełącznik przystanku:** prostokątny suwak 52×26 (8px), wyłączony `slot`, włączony verde; przystanek wyłączony jest wyszarzony (38%, grayscale).

### Navigation
- **Pasek górny:** sticky, biały 94% z rozmyciem, dolna linia `rule`, wysokość 64px; logo to azzurro płytka z wąskim „QUOLINO”, żółtą kropką i domeną w etykiecie.
- **Elementy:** pigułki 44px z obrysem 2px `rule`, hover azzurro + azzurro-50; link wsparcia w słońcu. Poniżej 800px nawigacja desktopowa znika na rzecz szuflady.
- **Zakładki strony miasta:** sticky pod paskiem, tło `page` 94% z rozmyciem, przewijane poziomo; aktywna = azzurro, zakładka wsparcia = słońce.
- **Okruszki:** na pasie, cele 40px, bieżący element pogrubiony.

### Naklejka (komponent sygnaturowy)
Podstawowy obiekt świata. Biały karton (padding 7px, róg 12px, Lift 2, przechył `--tilt`); w środku kwadratowa ilustracja z tłem drużyny i delikatnym połyskiem 160°; numer w azzurro kapslu (min 44×34, 8px) nachodzi na lewy górny róg o −9px; podpis: nazwa w wąskich kapitalikach + etykieta drużyny; u dołu pasek drużyny 8px. Wariant **folia**: tło gradientu złota, podpis w ciemnym brązie, bez paska drużyny. Wariant **Quo**: ilustracja maskotki na promienistym żółtym tle. Wersje pokrewne: kafel regionu/miasta (4:3, plakietka w rogu, link „→” w azzurro), naklejka przystanku 132×156 (96×114 na telefonie), mini-naklejki w pasku pod zdjęciem miasta (76×88).

### Atlas (mapa Europy na landingu, `#regiony`)
Strona albumu z mapą: morze w odcieniu azzurro z rastrem kropek, kraje jako białe wycinanki z kartonu, kraj z gotowymi miastami w pełnym azzurro, kraje „wkrótce” zakreskowane (kreski `slot-ink` 45°). Na poziomie Europy piny to naklejki z nazwą kraju (gotowy: biała z paskiem drużyny; „wkrótce”: przerywany obrys jak puste miejsce). Granice regionów wewnątrz kraju to biała linia przerywana (cienka na mapie Europy, wyraźna po przybliżeniu; Włochy: ISTAT przez openpolis, CC BY 4.0). Kliknięcie kraju przybliża mapę (1,4 s, ease-in-out, skala logarytmiczna); na poziomie kraju piny to same kapsle z numerami regionów (zgodne ze spisem obok), a podpis w lewym dolnym rogu pokazuje region, przy którym stoi Quo. Quo biega po łukach między punktami (klatki póz 08/09 co 125 ms, podskok), zostawia kropkowany ślad, przy gotowym miejscu robi radosny skok (poza 13), potem siada (poza 05). Spis obok mapy steruje nią: najechanie na region = Quo tam biegnie. Przycisk pauzy (WCAG 2.2.2); poza ekranem i w ukrytej karcie Quo stoi. `prefers-reduced-motion` (w Windows często włączone domyślnie): Quo dalej biega i mapa się przybliża (jest pauza, jak przy filmie), znikają tylko podskoki i skok radości.

### Puste miejsce (slot)
Przerywany obrys 2,5px `slot`, róg 12px, biel 45%, wielki numer `slot-ink` clamp(40px, 5vw, 64px) i nazwa w etykiecie. Na pasie: obrys biały 55%, tło biel 7%. Oznacza „wkrótce” na okładce i niezebraną naklejkę w widoku dziecka.

### Przystanek (wiersz albumu)
Rozwijany panel 16px: po lewej naklejka przystanku, obok godzina (cyfry azzurro) i nazwa (wąskie kapitaliki), pod spodem pigułki i przycisk nawigacji; chevron 44px. Po rozwinięciu: proza, notatki tonalne (ostrzeżenie `rosso-50`, godziny `page`, strój `azzurro-50`, smak `sun-50`) i karteczki misji. Kolacja to przystanek-folia: złota ramka 5px wokół białej treści.

### Karteczka misji
Przerywany obrys 2,5px, róg 14px, tło azzurro-50 (fotograficzna: sun-50). Etykieta w kapitalikach z checkboxem; po zaliczeniu obrys staje się ciągły verde, a tło verde-50.

### Widok dziecka i „wklejenie”
Ten sam układ bez cen, nawigacji, paneli bocznych i wsparcia. Niezebrane naklejki przystanków są pustymi miejscami (przerywany obrys, ilustracja 20% w szarości, kapsel w `slot`). Zaliczenie misji uruchamia animację `wklej` (0,7s, `--ease`): naklejka spada z obrotem −14° i skalą 1,35, dociska się z lekkim przeskokiem i osiada na swoim przechyle; zebrany przystanek dostaje obwódkę verde 3px. `prefers-reduced-motion` wyłącza animacje i przechyły.

## Do's and Don'ts

### Do:
- **Do** kłaść każdą treść na stronie `page` z rastrem kropek, a białe zostawiać naklejkom i panelom.
- **Do** dawać każdej naklejce numer w kapslu nachodzącym na róg, przechył z zakresu −3°…+2° i pasek drużyny u dołu.
- **Do** pokazywać brakujące elementy jako puste miejsca z przerywanym obrysem i dużym bladym numerem, nie jako wyszarzone karty.
- **Do** malować pas nagłówka miasta kolorem `bandana_color` z bazy i przełączać na ciemny atrament, gdy kolor jest jasny.
- **Do** pisać nazwy wąskimi kapitalikami Archivo 62%/900, a numery szerokimi cyframi 125%/900.
- **Do** utrzymywać tekst treści ≥18px i cele dotykowe ≥44px.
- **Do** pozwalać dużym naklejkom i siatkom nachodzić na krawędź pasa.

### Don't:
- **Don't** wracać do kremowego papieru, terakoty i miękkich zaokrąglonych kart typowych dla rodzinnych przewodników.
- **Don't** używać folii częściej niż raz na stronę ani dla zwykłych przystanków.
- **Don't** używać koloru drużyny do tekstu lub przycisków.
- **Don't** przechylać pustych miejsc, paneli treści ani przycisków; przechył mają tylko naklejki.
- **Don't** stawiać żółtego tła pod czymś, co nie jest akcją lub fokusem.
- **Don't** pokazywać w widoku dziecka cen, przycisków nawigacji ani wsparcia.
