# MASKOTKA QUOLINO — brief 3D

> Zastępuje §4 dokumentu DESIGN-BRIEF.md. Wersja 2.0 — 19.08.2026.
> Kierunek: **nowoczesny render 3D**, świadomie odsunięty od stylu Disneya
> i Pixara, ale nadal ciepły i sympatyczny.

---

## 1. DECYZJA KIERUNKOWA

**Maskotka jest jedynym elementem 3D w całym serwisie.** Reszta zostaje
w estetyce ciepłego papierowego przewodnika — pergamin, gouache, kredka.

Kontrast jest zamierzony i pracuje na produkt: Quolino jest „żywy" na tle
papieru. Dziecko dostaje coś, czego rodzic nie ma. Widok rodzica pozostaje
bez zmian.

---

## 2. DYSTANS OD DISNEYA — CO KONKRETNIE ZMIENIAMY

Nie odchodzimy od uroku, tylko od rozpoznawalnych markerów cudzego stylu
domowego. Powód jest praktyczny: **maskotka ma być zarejestrowana jako znak
graficzny i później licencjonowana**, więc potrzebuje świadomej różnicy,
a nie przypadkowego podobieństwa.

| Element | Marker Disneya | Quolino |
|---|---|---|
| **Sylweta** | — | **gruszkowata**, ciężar u dołu, z **lekką szyją** unoszącą głowę |
| **Oczy** | brwi jako osobne kreski, blik w gwiazdkę, długie wywinięte rzęsy | **duże, ciemne, wyraziste**, duże źrenice, blik poza środkiem, **powieki i krótkie rzęsy**, **brwi jako kępki futra**, nie kreski |
| **Ogon** | szeroki, wachlarzowaty ogon wiewiórki | **owłosiony na całej długości**, średniej grubości — jak u popielicy. **Nigdy goły ogon myszy** |
| **Uszy** | — | **duże, ok. 2/3 wysokości głowy**, wnętrze wyraźnie różowe |
| **Mimika** | pełna antropomorfizacja, mimika aktorska | **prostsza, spokojniejsza**, wyraz budowany pozą, nie twarzą |
| **Akcesorium** | kilka elementów garderoby | **jedna czerwona chusta**, nic więcej |
| **Dłonie** | pięciopalczaste, ludzkie | **czteropalczaste, krótkie łapki** |

**Gruszkowaty kształt zostaje.** To ogólna konwencja projektowania postaci —
ciężar u dołu, lekkość u góry, stabilna sylweta. Używa jej Quicky z Nesquika,
królik Duracella i połowa maskotek spożywczych. Nikt nie ma na to monopolu
i nie jest to marker żadnego studia.

**Futro zostaje puszyste i bogate.** Uproszczone futro i kulisty kształt nie
dają dystansu od Disneya, tylko tańszą postać.

**Dystans niosą trzy rzeczy:** brwi jako kępki futra zamiast rysowanych
kresek, owłosiony ogon popielicy, oraz gatunek — Quolino jest **popielicą**.
Nie myszą, nie królikiem, nie wiewiórką. Żadna duża marka go nie zajęła
i to daje więcej odrębności niż kombinowanie z proporcjami.

**Czego dystans NIE ma kosztować:** uroku, energii i wyrazistości. Jeśli
wybór między „bezpieczne" a „sympatyczne" — wybieramy sympatyczne. Prawo
chroni konkretną postać, nie ogólną urodę. Ostrożność ma siedzieć
w checkliście odbioru (§10), nigdy w promptcie.

---

## 3. ANATOMIA I PROPORCJE

- Głowa do ciała: **1 : 1,3** — duża głowa, ale nie karykaturalnie
- Ciało: **gruszkowate** — szersze u dołu, węższe w górnej partii. Stabilne,
  pulchne, przyjazne. Delikatne zaznaczenie talii jest w porządku.
- **Szyja: krótka i miękka**, ledwo zaznaczona — tyle, żeby głowa siedziała
  odrobinę wyżej niż ramiona. Bez szyi postać wygląda tanio, z długą traci
  proporcje gryzonia. Celujemy w subtelność.
- Łapy: krótkie, grube, czteropalczaste
- Ogon: **pokryty futrem na całej długości**, zamaszysty, prowadzony w łuku.
  Goły, cienki ogon czyta się jako mysz i psuje gatunek.
- Oczy: duże, ciemne, lekko rozstawione, jeden miękki blik poza środkiem
- **Powieki**: górna powieka wyraźnie zaznaczona, **łuk uniesiony**, ze
  szczytem po **zewnętrznej** stronie oka — to daje wyraz otwarty i przyjazny.
  Szczyt po stronie wewnętrznej czyta się jako smutek, tego unikamy.
- **Rzęsy**: krótkie i rzadkie, po trzy do czterech przy zewnętrznym kąciku.
  Długie i wywinięte kodują płeć żeńską i przechylają odbiór postaci.
  W rozmiarach poniżej 64 px rzęsy pomijamy — to detal do dużych renderów.
- Nos: mały trójkąt, ciemny
- Wąsy: cienkie, ledwo widoczne, maksymalnie trzy z każdej strony

---

## 4. PALETA — OBOWIĄZUJĄCA

| Element | Kolor |
|---|---|
| Futro grzbiet | **miodowo-karmelowy, nasycony** — ciepły i wyraźny |
| Futro brzuch | kremowy, jaśniejszy o 2–3 tony |
| **Chusta — jedyne akcesorium** | **terra `#B4502E`**, bez węzła w innym kolorze |
| Wnętrze ucha | wyraźnie różowe |
| Kontur i cienie | ink `#383026` |
| Tło renderu | **czysta biel `#FFFFFF`**, bez cienia i bez podłoża |

**Zakaz:** jaskrawa czerwień i zieleń świąteczna obok siebie.

**Zasada kontrastu:** **postać musi być ciemniejsza i bardziej nasycona niż
tło**. Nigdy nie ściągaj futra w stronę pergaminu — to główna przyczyna
wrażenia „blado".

---

## 4a. ENERGIA — SKĄD SIĘ BIERZE

Sympatia i energia nie biorą się z uroczych proporcji. Biorą się z sześciu
konkretnych rzeczy i każda jest do wyegzekwowania w promptcie:

1. **Linia akcji** — przez ciało musi biec wyraźna krzywa S lub C. Postać
   stojąca pionowo jest martwa niezależnie od tego, jak ładna.
2. **Asymetria** — jedno ucho w górę, drugie opadnięte. Głowa przekrzywiona.
   Ciężar na jednej nodze. Symetria czyta się jako pomnik.
3. **Brwi z kępek futra** — główne narzędzie wyrazu. Bez nich twarz jest pusta.
4. **Poza w ruchu** — nigdy neutralne stanie. Nawet stan „ciekawy" to moment
   *w trakcie* obracania się, nie po.
5. **Kontrast tonalny** — ciemne oczy, nasycone futro, mocna chusta.
6. **Światło konturowe** — rimlight odkleja postać od tła (nie dotyczy
   renderów na czystej bieli).

Test: **zamaluj postać na czarno.** Jeśli sylweta nie mówi, co robi
i w jakim jest nastroju, poza jest za słaba.

---

## 5. MATERIAŁY I RENDER

- Materiały **matowe**, zero połysku i zero plastiku
- Delikatny subsurface scattering w uszach i łapkach
- Futro **puszyste i miękkie**, z bogatą obwódką delikatnego włosa wokół
  sylwety. Ma się chcieć dotknąć. To jest miejsce, w którym nie oszczędzamy.
- **Tło: czysta biel `#FFFFFF`**, płaska i pusta. Bez podłoża, bez cienia
  kontaktowego, bez odbicia.
- Oświetlenie: równomierne, miękkie, **bezcieniowe**
- Eksport produkcyjny z **kanałem alfa**, nie z wypaloną bielą
- Zero depth of field, zero efektów filmowych

---

## 6. CZTERY STANY

| Stan | Kiedy | Opis pozy |
|---|---|---|
| **Śpiący** | 0–33% misji | zwinięty w kłębek, ogon owinięty wokół ciała, oczy zamknięte w proste łuki, obłoczek snu |
| **Ciekawy** | 34–66% misji | siedzi prosto, jedno oko szerzej otwarte, głowa przekrzywiona, łapka wskazuje poza kadr |
| **Rozpędzony** | 67–100% misji | biegnie, ciało pochylone do przodu, ogon w tyle, łapki w ruchu |
| **Uśmiech** | ekran końcowy | frontalnie, oczy zamknięte w łuki, łapki uniesione, lekki wyskok |

### Prompt bazowy

```
Modern stylized 3D character render of Quolino — an energetic, charming
mascot for a children's travel app.

Quolino is a small dormouse with a soft pear-shaped body, a short neck, and
short stubby four-fingered paws. Warm honey-caramel fur, rich and saturated,
with a cream belly. The fur is fluffy and touchable, with a bright rim of
backlit hair around the whole silhouette. Large dark expressive eyes with
big pupils and an off-centre highlight. Clearly defined upper eyelids with a
raised, upward-curving arc peaking toward the outer corner of the eye, giving
an open and friendly expression. A few short, sparse eyelashes at the outer
corners — short and subtle, never long or curled. Expressive brows made from
small tufts of fur above the eyes. Large rounded ears, about two thirds of
the head height, with a clearly pink inner ear. A long sweeping tail fully
covered in fur along its entire length — never a bare mouse tail.

He wears one single terracotta-red #B4502E neckerchief, tied loose and
slightly windblown. No other accessories.

Energy is essential. Never a neutral standing pose. A strong line of action
runs through the body — a clear S curve. Asymmetry everywhere: head tilted,
weight on one foot. He looks like he is about to do something.

Style: contemporary stylized 3D in the spirit of modern European indie
animation and designer vinyl collectibles. Soft matte materials, no gloss,
no plastic sheen. Gentle subsurface scattering in ears and paws.

Background: pure white #FFFFFF, completely flat and empty. No ground plane,
no contact shadow, no cast shadow, no reflection — the character floats
cleanly against white.

Centered, full body, generous margins, no depth of field.
```

**Uwaga do promptowania:** nie wpisuj „not Disney", „not Pixar" ani innych
zakazów stylistycznych. Generatory reagują na instrukcje negatywne słabo
i odsuwają się także od uroku, który chcesz zachować. Odrębność egzekwuj
przy odbiorze (§10), nie przy generowaniu.

### Podmiana pozy

**Śpiący**
```
Pose: curled into a tight ball, tail wrapped around the body, eyes closed
as simple curves, one ear flopped down, a small soft sleep cloud floating
above. He does not want to get up.
```

**Ciekawy**
```
Pose: caught mid-turn, just woken and already interested. One eye open
wider than the other, one brow raised, head tilted sharply, one paw raised
and pointing off-frame. Weight shifting onto one foot.
```

**Rozpędzony**
```
Pose: running forward, body leaning into the movement, tail trailing behind,
paws mid-stride, mouth open in a happy grin, one paw raised in greeting.
```

**Uśmiech**
```
Pose: facing viewer straight on, eyes closed in happy curves, both paws
raised in celebration, small hop off the ground.
```

---

## 6a. ARKUSZ OBROTU (TURNAROUND)

Model sheet — pięć rzutów tej samej postaci w jednym rzędzie: przód,
trzy czwarte przodu, bok, trzy czwarte tyłu, tył.

**Poza neutralna i identyczna w każdym rzucie.** To dokument techniczny,
nie ujęcie reklamowe — energia wchodzi dopiero w stanach z §6.

Format: szeroki, 16:9 lub szerszy. Przy pięciu rzutach spójność bywa krucha
— jeśli się sypie, zrób trzy rzuty (przód, bok, tył) i dogeneruj trzy
czwarte osobno.

---

## 6b. PARAMETRY ZABLOKOWANE

| Parametr | Wartość |
|---|---|
| Rzut kanoniczny | **render „rozpędzony", trzy czwarte przodu** — zatwierdzony 19.08.2026 |
| Rzut dla wersji ikonowej | frontalny |
| Wysokość głowy do całej postaci | ok. 1 : 2,6 |
| Szerokość ciała do wysokości | ok. 1 : 1,6 — **nie wydłużać w rzucie bocznym** |
| Długość ogona | **ok. 1,2 wysokości ciała** — długi, zamaszysty, w łuku |
| Grubość ogona | równomierna, ok. 1/4 szerokości ciała |
| Zasięg kremowego brzucha | od podbródka do krocza, ok. 1/2 szerokości ciała |
| Wąsy | trzy z każdej strony, cienkie, obecne w każdym ujęciu |
| Uszy | **duże, ok. 2/3 wysokości głowy**, wnętrze wyraźnie różowe |
| Rzęsy | 3–4 krótkie przy zewnętrznym kąciku, tylko powyżej 64 px |
| Łuk górnej powieki | uniesiony, szczyt po zewnętrznej stronie oka |
| Chusta | zawiązana z przodu, węzeł na środku klatki |

**Uwaga do wersji ikonowej:** duże uszy i długi ogon świetnie działają
w dużym renderze, ale poniżej 64 px rozbiją sylwetę. Ikona (§7) celowo
odbiega od kanonu: **ogon skrócony do 0,6 ciała i zwinięty przy korpusie,
uszy uproszczone**. Maskotka bogata i maskotka ikonowa nie muszą być
identyczne, muszą być rozpoznawalnie tą samą postacią.

**Najczęstszy dryf:** rzut boczny wydłuża postać i upodabnia ją do łasicy.
Przy każdej generacji porównuj bok z przodem — bryła musi być ta sama.

---

## 7. WERSJA IKONOWA — OBOWIĄZKOWA

Render 3D nie działa w 32 px. Potrzebna **druga wersja tej samej sylwety**:

- Płaska, wektorowa, maksymalnie uproszczona
- Dwa do trzech kolorów: piaskowy, ink, terra
- Zero cieni, zero gradientów, zero futra
- Ta sama sylweta co model 3D

**Zastosowanie:** odznaki miast, ikony misji, favicon, ikona aplikacji,
wskaźnik przy pasku energii.

**Zastosowanie renderu 3D:** ekran przystanku, ekran końcowy, hero.

---

## 8. SPECYFIKACJA TECHNICZNA

| Zastosowanie | Format | Budżet |
|---|---|---|
| Cztery stany, statycznie | **WebP z alfą**, 2× (retina) | 40–80 KB / stan |
| Animacja ekranu końcowego | sekwencja WebP + CSS `steps()` | max 250 KB |
| Wersja ikonowa | **SVG** | < 5 KB / stan |

**Budżet łączny: 500 KB.** Powyżej tego szkodzimy rodzinie, która ładuje
stronę na roamingu przed wjazdem do miasta.

### Wymiary źródłowe
- Render: **1024 × 1024 px**, kanał alfa, PNG jako master
- Eksport produkcyjny: WebP 512 px (1×) i 1024 px (2×)
- Ikona: SVG, viewBox kwadratowy, czytelna od 32 px

### Nazewnictwo
```
quolino-sleepy.webp      quolino-sleepy.svg
quolino-curious.webp     quolino-curious.svg
quolino-running.webp     quolino-running.svg
quolino-smile.webp       quolino-smile.svg
```

---

## 9. SPÓJNOŚĆ POSTACI — RZECZ KRYTYCZNA

Generatory obrazu **nie utrzymują spójności między pozami**. Cztery osobne
generacje dadzą cztery różne zwierzęta.

**A. Prawdziwy model 3D** (Blender) — jeden model, cztery pozy, gwarantowana
spójność. Więcej pracy na starcie, zero problemów później.

**B. Generacja z referencją** — jedna zatwierdzona poza jako obraz
referencyjny dla pozostałych, plus ręczne poprawki.

Przy planach licencjonowania **rekomenduję A**. Model 3D jest aktywem,
obrazek nie jest.

---

## 10. CHECKLIST ODBIORU

- [ ] Zamalowana na czarno sylweta mówi, co postać robi i w jakim jest nastroju
- [ ] Futro wyraźnie ciemniejsze i bardziej nasycone niż tło
- [ ] Tło czysta biel, bez cienia kontaktowego i bez podłoża
- [ ] Istnieje wersja z kanałem alfa
- [ ] Asymetria: głowa przekrzywiona, ciężar na jednej nodze
- [ ] Brwi jako kępki futra, nie rysowane kreski
- [ ] Powieki zaznaczone, łuk uniesiony, szczyt po zewnętrznej stronie
- [ ] Rzęsy krótkie i rzadkie — nie długie ani nie wywinięte
- [ ] Ogon owłosiony na całej długości — **nie goły ogon myszy**
- [ ] Wnętrze ucha wyraźnie różowe
- [ ] Postać czyta się jako **popielica**, nie jako mysz
- [ ] Szyja zaznaczona, ale krótka
- [ ] Futro puszyste, z wyraźną obwódką włosa wokół sylwety
- [ ] Chusta w terra `#B4502E`, bez węzła w innym kolorze
- [ ] Zero plecaka i innych akcesoriów
- [ ] Cztery stany wyglądają jak **ta sama postać**
- [ ] Waga wszystkich plików razem poniżej 500 KB
- [ ] Istnieje wersja ikonowa SVG
- [ ] Zachowany plik źródłowy (model .blend lub pliki generacji + prompty)
- [ ] **Dokumentacja autorstwa**: data powstania, narzędzie, a przy grafiku
      zewnętrznym umowa z **przeniesieniem autorskich praw majątkowych**
