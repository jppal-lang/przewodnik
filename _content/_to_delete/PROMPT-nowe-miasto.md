# PROMPT 1/2 — nowe miasto (wersja polska)

Zgodny z **WYTYCZNE_WYCIECZEK.md** (sygnatura 2026-08-22 21:49 CEST) i **REDAKCJA.md v4**.
Wklej ChatGPT-owi w całości. Podmień `{{MIASTO}}`, `{{REGION}}`, `{{KRAJ}}`.
Tłumaczenia to osobny krok — `PROMPT-tlumaczenia.md`.

---

Przygotuj komplet treści dla miasta **{{MIASTO}}** (region: {{REGION}}, kraj: {{KRAJ}})
do przewodnika rodzinnego Questini/Quolino.

Wynik: **dwa pliki JSON**, nic więcej. Bez HTML, bez markdownu, bez komentarzy w kodzie.

---

## 0. ZASADA NADRZĘDNA

**Nie budujemy listy atrakcji. Budujemy doświadczenie rodziny w konkretnym miejscu.**

Każdy punkt odpowiada na trzy pytania:
**Co zobaczymy? · Dlaczego to jest ciekawe? · Co możemy razem z tym zrobić?**

Rodzic ma zawsze wiedzieć: ile czasu to zajmie, ile kosztuje, czy trzeba się odpowiednio ubrać,
gdzie zaparkować, **co można pominąć** i gdzie samodzielnie sprawdzić aktualne informacje.

Trasa to **rama, nie klatka**. Rodzic widzi całość, może pominąć punkt, zmienić kolejność,
zostać dłużej, wrócić do pominiętego miejsca. To główna różnica względem klasycznego przewodnika.

Grupa docelowa: rodziny z dziećmi **9–15 lat**.

---

## 1. Pliki na wyjściu

```
{{slug}}.meta.json    — dane maszynowe, NIEZALEŻNE od języka
{{slug}}.pl.json      — cała proza po polsku
```

Podział jest ścisły. Współrzędne, ceny, godziny, statusy weryfikacji, kategorie, linki
i tytuły artykułów Wikipedii **nigdy** nie trafiają do pliku językowego — inaczej przy
siedemnastu tłumaczeniach zrobi się siedemnaście rozjeżdżających się kopii tych samych liczb.

---

## 2. `stop_key` — numer NIE jest tożsamością punktu

To najważniejsza zmiana. Punkt ma **stabilny klucz**, żeby dało się go przestawić, dodać
albo usunąć bez utraty tłumaczeń, komentarzy i ocen.

- `stop_key` — stały, opisowy, bez polskich znaków: `parking-mosaici`, `porta-consolare`,
  `santa-maria-maggiore`. **Nadawany raz i nigdy nie zmieniany.**
- `stop_number` — tylko pozycja na trasie. Może się zmienić przy każdej korekcie.

Pliki językowe kluczują przystanki **po `stop_key`**, nie po numerze.

---

## 3. `{{slug}}.meta.json`

```json
{
  "doc": { "version": "v1", "generated_at": "2026-08-22T22:10:00+02:00" },
  "city": {
    "slug": "spello",
    "country": "it",
    "region_slug": "umbria",
    "lat": 42.9917,
    "lon": 12.6706,
    "duration_type": "half_day",
    "duration_hours": 5,
    "bandana_color": "#7A9A3F",
    "wiki_article": "Villa dei Mosaici di Spello",
    "wiki_lang": "it",
    "sort_order": 3,
    "status": "draft"
  },
  "stops": [
    {
      "stop_key": "parking-mosaici",
      "stop_number": 1,
      "category": "parking",
      "icon": "🅿️",
      "optional": false,
      "sunset_spot": false,
      "time_label": "15:45",
      "visit_duration": "10 min",
      "price": "1,20 €/godz.",
      "price_status": "unverified",
      "opening_hours": "24 h",
      "hours_status": "confirmed",
      "ztl": "Parking poza strefą ZTL. Do centrum nie wjeżdżać.",
      "year_built": null,
      "wiki_article": null,
      "maps_query": "Parcheggio Villa dei Mosaici, Spello",
      "verify_url": "https://www.comune.spello.pg.it/…",
      "whatsapp": null,
      "website": null,
      "rating": null,
      "reviews_count": null,
      "reservation": null,
      "sources": ["https://…"]
    }
  ],
  "day_plan": [ { "sort_order": 1, "stop_key": "parking-mosaici", "time_label": "15:45" } ],
  "emergency": [ { "sort_order": 1, "type": "pharmacy", "maps_query": "Farmacia Comunale, Spello" } ]
}
```

### Dozwolone wartości

| pole | wartości |
|---|---|
| `category` | `parking`, `monument`, `church`, `museum`, `house`, `viewpoint`, `restaurant`, `icecream`, `sweets`, `photo` |
| `icon` | `🅿️` parking · `🏛️` zabytek/muzeum · `✝️` kościół rzymskokatolicki · `✡️` synagoga · `🏰` zamek/twierdza · `🏞️` punkt widokowy · `🍦` lodziarnia · `🍰` słodkości · `🍽️` restauracja · `📷` punkt fotograficzny |
| `price_status`, `hours_status` | `confirmed` · `unverified` |
| `emergency.type` | `pharmacy`, `hospital`, `toilet`, `playground` |
| `duration_type` | `half_day`, `full_day` |
| `status` | zawsze `draft` |

Ikona informuje o charakterze punktu, **nie zastępuje jego nazwy**.

---

## 4. `{{slug}}.pl.json`

Klucze przystanków to **`stop_key`** z pliku meta. Muszą się zgadzać co do jednego.

```json
{
  "lang": "pl",
  "city": {
    "title": "Spello",
    "region_label": "Umbria · pół dnia",
    "subtitle": "Rzymskie mozaiki pod podłogą willi, renesansowe freski Pinturicchia i miasto, które w czerwcu tonie w kwiatach.",
    "lead": null,
    "good_to_know": "Centrum jest w strefie ZTL — parkuj przy Villa dei Mosaici.",
    "hero_note": null,
    "local_food": "Zwróć uwagę na bruschettę z oliwą z Trevi — zbiory z listopada są tu uznawane za jedne z najlepszych w Umbrii."
  },
  "stops": {
    "porta-consolare": {
      "name": "Porta Consolare",
      "desc_paragraphs": ["Pierwszy akapit.", "Drugi akapit."],
      "kids_box": "Treść questu.",
      "hint": "Wskazówka, która realnie pomaga rozwiązać quest.",
      "local_flavor": "Legenda, zwyczaj albo ciekawostka kulinarna.",
      "practical_note": null,
      "dress_code": null,
      "photo_task": null
    }
  },
  "day_plan": { "parking-mosaici": "Parking przy Villa dei Mosaici" },
  "emergency": { "1": { "label": "Farmacia Comunale", "description": "Przy głównym placu, czynna do 20:00" } }
}
```

Pole nieużywane → `null`. **Nie pomijaj klucza**, wpisz `null` — walidator to sprawdza.

---

## 5. Dane praktyczne — nie wolno udawać pewności

Dla muzeów, kościołów, pałaców, twierdz, atrakcji i restauracji sprawdzasz: godziny otwarcia,
dni zamknięcia, cenę, zakres biletu, konieczność rezerwacji, ograniczenia wejścia,
oficjalne zasady zwiedzania.

Źródło nie potwierdza ceny → `"price": "do potwierdzenia"`, `"price_status": "unverified"`.
Źródło nie potwierdza godzin → `"opening_hours": "do potwierdzenia"`, `"hours_status": "unverified"`.

**Każdy punkt musi mieć `verify_url`** — link pozwalający rodzicowi samodzielnie sprawdzić
aktualne informacje. Najlepiej strona oficjalna, nie Wikipedia.

Wikipedia jest punktem kontrolnym i źródłem kontekstu historycznego. Godzin, cen, rezerwacji
i zasad wejścia **nie bierzesz z Wikipedii** — tylko ze źródeł aktualnych, najlepiej oficjalnych.

Nigdy nie wymyślasz: ceny, godzin, adresu, numeru telefonu, informacji o dress code,
oceny Google ani liczby opinii.

---

## 6. Strój i uwagi praktyczne

`dress_code` jest **obowiązkowy wszędzie, gdzie są ograniczenia** — nie tylko w kościołach.
Sprawdzasz też: katedry i bazyliki, klasztory, synagogi, pałace, miejsca sakralne,
wybrane restauracje.

Przykład: `"dress_code": "Ramiona i kolana zakryte."`

`practical_note` to osobna sprawa — warunki na miejscu, nie ubiór formalny:
`"practical_note": "Warto zabrać bluzę — w jaskini temperatura jest znacznie niższa."`

---

## 7. `desc_paragraphs` — opis rodzica ma być bogaty

Nie może być trzema zdaniami typu „Rzymska willa z bogatymi mozaikami".
Opis ma pozwolić rodzicowi **opowiedzieć miejsce dziecku**.

Zawiera, zależnie od obiektu: kiedy powstał, kto go zbudował, po co, co się tam działo,
jak zmieniało się w czasie, ważne postacie, funkcję pomieszczeń, znaczenie dla regionu,
ciekawostkę kulturową, ciekawostkę ekonomiczną. **Daty są ważne.**
Kilka faz budowy → podajesz je osobno.

### Skala czasu
Same daty nie wystarczą. Jeśli da się zrobić dobre porównanie czasowe — rób je:

> „753 p.n.e. to tradycyjna data założenia Rzymu. Ta willa zaczęła powstawać około 726 lat później."

### Terminy specjalistyczne
Każde pojęcie, którego 11-latek może nie znać, dostaje krótkie wyjaśnienie.

Za mało: *„Triclinium — sala bankietowa."*

Dobrze: *„Triclinium to rzymska sala ucztowania. Nazwa pochodzi od trzech miejsc do leżenia
ustawionych wokół stołu — zamożni Rzymianie jedli i pili na leżąco."*

### Ciekawostki ekonomiczne
Jeśli wiarygodne źródła podają koszt budowy, fundatora, koszt dzieła albo cenę historyczną —
wykorzystaj to. Najpierw prawdziwa liczba, potem porównanie pomagające zrozumieć skalę.
Porównanie współczesne oznacz jako **orientacyjne**. Brak danych → nie wymyślasz wartości.

---

## 8. `kids_box` — quest ma wynikać z miejsca

**Dobry quest** wymaga znalezienia czegoś, policzenia, porównania, sfotografowania,
odnalezienia detalu, rozwiązania prostego problemu albo rozmowy rodzinnej opartej na tym,
co właśnie zobaczyli.

**Zły quest** jest przypadkowy, można go wykonać wszędzie, nie ma związku z miejscem,
brzmi jak sztuczne zadanie szkolne.

Przykłady dobrych:
> „Znajdź triclinium. Zrób zdjęcie sali i odszukaj na mozaice scenę nalewania wina."

> „Znajdź oś czasu. Sprawdź 753 p.n.e. i porównaj tę datę z początkiem budowy willi."

> „Zrób zdjęcie wieży. Potem całą rodziną wymyślcie dwa sposoby, w jakie bohater
> mógłby się z niej wydostać."

Quest może być zabawny, ale musi mieć związek z miejscem.
Przy parkingu i restauracji **nie twórz questu na siłę** → `null`.

---

## 9. `hint` — wskazówka

Krótka, konkretna pomoc. Nie ogólnik, nie powtórzenie pytania:

> „Rzymskie elementy rozpoznasz po dużych, starannie dopasowanych blokach białego kamienia.
> Przy średniowiecznych wieżach zwróć uwagę na inny materiał."

Rodzic ma móc pomóc bez dodatkowego researchu.

---

## 10. `local_flavor` — lokalny smak

Regionalne jedzenie, zwyczaj, produkt, ciekawostka kulinarna **albo** legenda związana z miejscem.
Nie powtarzaj tego, co jest w opisie rodzica.

### Legendy — opowiadamy, nie wspominamy
Za mało: *„Legenda mówi, że więziono tu Orlanda."*

Jeśli postać jest nieznana polskiemu czy niemieckiemu dziecku, dodaj kontekst: kim był,
kiedy żył lub w jakiej epoce toczy się opowieść, dlaczego jest znany, z jaką tradycją
kulturową się wiąże.

Wyraźnie oddzielaj fakt od legendy: **„Legenda głosi, że…"**.
Kilka wersji → **„Legenda ma kilka przekazów…"**, pokazujesz warianty, nie rozstrzygasz.
Źródła nie podają dalszego ciągu → **„Nie zachowały się inne znane przekazy dotyczące
tej części legendy."** Nie dopisujesz brakującego zakończenia jako faktu.

### Regionalne jedzenie
Jeśli region ma charakterystyczny produkt — wskaż go w `city.local_food` w formie
„Zwróć uwagę na…". Nie chodzi o polecenie restauracji, tylko o to, co warto zauważyć,
spróbować albo porównać. Obwarzanek w Krakowie, cannolo na Sycylii, lokalne sery, lody, słodycze.

---

## 11. Punkty widokowe, opcjonalne i dobre miejsca po drodze

**Punkt widokowy** rozważ jako osobny punkt trasy, ikona `🏞️`.
Szczególnie atrakcyjny o zachodzie → `"sunset_spot": true`. To informacja dla rodzica,
a nie powód, żeby ustawiać całą trasę pod zachód. Rodzic decyduje.

**Lokal z wyjątkowo dobrymi ocenami** po drodze możesz zasygnalizować jako **osobny punkt
opcjonalny** (`"optional": true`) z `rating` i `reviews_count`. Przy podobnych ocenach
preferuj miejsce z większą liczbą opinii; możesz wskazać 2–3, pokazując rodzicowi wybór.

Nie dodajesz lokalu jako obowiązkowego przystanku tylko dlatego, że ma dobrą ocenę.

Punkt opcjonalny jest **normalnym punktem trasy** — rodzic widzi `08 → 09 🍦 → 10 🏞️ → 11 🍽️`
i sam decyduje, czy wchodzi w dziewiątkę.

---

## 12. Parking i restauracja

**Przystanek 01 zawsze jest parkingiem.** Musi mieć nazwę, lokalizację, koszt (albo
„do potwierdzenia"), Google Maps, uwagi o ZTL i alternatywę, jeśli ma znaczenie.

**Restauracja** na końcu trasy jest oceniana też praktycznie. Nie wybierasz jako domyślnego
finału miejsca, które po 5–6 godzinach zwiedzania wymaga garnituru, eleganckiej sukienki
czy formalnego obuwia. Ma dress code → informujesz o nim.

W danych restauracji: orientacyjny koszt, poziom formalności, wymagany strój, godziny,
możliwość rezerwacji (`reservation`), `verify_url`.
Kryteria twarde: **Google ≥ 4,1**, **> 100 opinii**, możliwość kolacji o planowanej porze.

Do JSON-a trafia **jedna wybrana restauracja**. Odrzucone warianty → `_notes`.

---

## 13. BEZWZGLĘDNE ZAKAZY

- ❌ **Żadnych kilometrów i czasów dojazdu** („25 km", „ok. 1h05")
- ❌ **Żadnych godzin wyjazdu/powrotu z bazy** („wyjazd z Montefelcino 8:25")
- ❌ Żadnych sztywnych ram dnia zależnych od miejsca noclegu
- ❌ Zero konfabulacji: dat, nazwisk, legend, godzin, cen, ocen Google, liczby opinii,
  nazw dzieł, autorów
- ❌ Nie tłumacz niczego — **tylko polski**

Plan dnia pokazuje **tylko czas na miejscu**: czas zwiedzania, orientacyjny czas pobytu,
czas kolacji, czas punktu opcjonalnego. Zaczyna się na parkingu, kończy na ostatnim przystanku.

Tekst rodzica **nigdy nie informuje, czego nie znalazłeś**. Żadnych „nie udało się ustalić"
w treści — to idzie do `_notes`.

Nazwy własne zabytków zostają w oryginale: `Porta Consolare`, `Fontana Maggiore`.
Turysta musi je rozpoznać na tabliczce i w Google Maps.

---

## 14. `wiki_article` — SPRAWDŹ, NIE ZGADUJ

Z tego pola bierze się zdjęcie na kafel i przy przystanku. Dla każdego tytułu:

1. otwórz `it.wikipedia.org/wiki/<tytuł>` i potwierdź, że **artykuł istnieje**,
2. potwierdź, że **ma zdjęcie główne** (miniatura w boksie po prawej).

Nie ma artykułu albo nie ma zdjęcia → `null`. **Nie wymyślaj tytułów.**
Zmyślony tytuł = 404 i pusty kafel. Zdarzyło się już przy Rimini i Rawennie.

`city.wiki_article` wskazuje **najbardziej rozpoznawalny zabytek miasta** — to zdjęcie
sprzedaje kafel na stronie regionu.

---

## 15. Trasa zweryfikowana przez redaktora ma pierwszeństwo

Jeżeli redaktor przekazał trasę sprawdzoną w terenie albo w Google Maps — jej kolejność,
waypointy i przebieg są **wersją referencyjną**.

Nie zmieniasz samowolnie kolejności punktów ani przebiegu. Nie generujesz własnego linku,
który zastępuje trasę redaktora. Możesz zgłosić sugestię, ale **wyraźnie oznaczoną jako sugestię**:

> „Przyjmuję Twoją zweryfikowaną trasę. Mam jedną sugestię: … Czy chcesz ją zastosować?"

Hierarchia wiarygodności przebiegu trasy:
1. weryfikacja w terenie · 2. weryfikacja redaktora w Google Maps · 3. oficjalne źródła lokalne ·
4. research modelu · 5. wcześniejsza propozycja modelu.

Widzisz rozbieżność między własnym researchem a trasą redaktora → **sygnalizujesz ją,
nie naprawiasz automatycznie**.

---

## 16. Źródła w terenie

W researchu zwracaj uwagę na tablice muzealne, osie czasu, podpisy eksponatów, mapy,
informacje o renowacjach.

Materiał ze zdjęcia dostarczonego przez redaktora oznaczaj wyraźnie:
**„informacja widoczna na dostarczonym zdjęciu"** — w odróżnieniu od informacji potwierdzonej
niezależnym źródłem. Nie zakładaj, że zdjęcie znalezione w internecie pochodzi z danego miejsca.

---

## 17. Notatki redakcyjne

Wszystko, czego nie udało się potwierdzić, oraz odrzucone warianty — na końcu `.pl.json`:

```json
"_notes": [
  { "stop_key": "santa-maria-maggiore", "field": "a", "note": "Cena biletu niepotwierdzona — sprawdzić na miejscu." },
  { "stop_key": "osteria-finale", "field": "b", "note": "Alternatywy: Il Molino (4,3 / 210 opinii), La Cantina (4,2 / 130)." }
]
```

`field`: `a` dane · `b` opis rodzica · `c` quest · `d` wskazówka · `e` lokalny smak ·
`f` źródła · `g` uwaga ogólna. `stop_key: null` = uwaga do całego miasta.

Trafia do osobnej tabeli, **niewidocznej publicznie**, i nie jest tłumaczone.

---

## 18. Checklista przed oddaniem

**Każdy punkt:** stop_key · dane praktyczne · godziny otwarcia + status · cena + status ·
`verify_url` · Google Maps · dress code jeśli występuje · czas pobytu · bogaty opis rodzica ·
daty i kontekst · quest · wskazówka · lokalny smak jeśli istnieje · źródła · ikona

**Cała trasa:** punkt 01 = parking · punkty widokowe rozważone · lokalne jedzenie rozważone ·
dobre lokale po drodze rozważone · punkty opcjonalne oznaczone · kolejność logiczna pieszo ·
rodzic może pominąć punkt · brak wymuszonego sztywnego przebiegu · restauracja odpowiednia
po całym dniu · ikony spójne · brak niezweryfikowanych faktów podanych jako pewne ·
brak kilometrów i czasu dojazdu · brak godzin wyjazdu/powrotu z bazy

---

## 19. Nazewnictwo i miejsce w repo

```
przewodnik/_content/cities/{{REGION}}/{{slug}}/
├── {{slug}}.meta.json
└── {{slug}}.pl.json
```

Slug bez polskich znaków, małe litery, myślniki: `Asyż → asyz`, `San Gimignano → san-gimignano`.
Przy poprawkach podbij `doc.version` i `doc.generated_at`.

Miasta już w bazie — nie dubluj slugów:
`urbino`, `ancona`, `frasassi`, `rimini`, `rawenna` (marche) · `perugia`, `asyz` (umbria).

Rozmówek nie generuj — są wspólne dla kraju i Włochy już je mają.
