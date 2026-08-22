# PROMPT 1/2 — nowe miasto (wersja polska)

Wklej ChatGPT-owi w całości. Podmień `{{MIASTO}}`, `{{REGION}}` i `{{KRAJ}}` w pierwszej linii.
Tłumaczenia to osobny krok — patrz `PROMPT-tlumaczenia.md`.

---

Przygotuj komplet treści dla miasta **{{MIASTO}}** (region: {{REGION}}, kraj: {{KRAJ}})
do przewodnika rodzinnego Questini/Quolino.

Wynik: **dwa pliki JSON**, nic więcej. Bez HTML, bez komentarzy w kodzie, bez markdownu.

---

## 1. Czym jest Questini

Zwiedzanie miast Europy jako gra terenowa dla rodzin z dziećmi **9–15 lat**.
Rodzic dostaje plan dnia od parkingu po kolację, dziecko dostaje misje i zagadki.
Dwa widoki, jedno zwiedzanie.

## 2. Pliki na wyjściu

```
{{slug}}.meta.json    — dane maszynowe, NIEZALEŻNE od języka
{{slug}}.pl.json      — cała proza po polsku
```

Podział jest ścisły. Współrzędne, ceny, godziny, kategorie, linki i tytuły artykułów Wikipedii
**nigdy** nie trafiają do pliku językowego — inaczej przy siedemnastu tłumaczeniach zrobi się
siedemnaście rozjeżdżających się kopii tych samych liczb.

---

## 3. `{{slug}}.meta.json`

```json
{
  "doc": {
    "version": "v1",
    "generated_at": "2026-08-22T19:15:00+02:00"
  },
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
      "stop_number": 1,
      "category": "parking",
      "time_label": "15:45",
      "visit_duration": "10 min",
      "price": "bezpłatnie",
      "year_built": null,
      "wiki_article": null,
      "maps_query": "Parcheggio Villa dei Mosaici, Spello",
      "whatsapp": null,
      "website": null,
      "sources": ["https://…"]
    }
  ],
  "day_plan": [
    { "sort_order": 1, "time_label": "15:45" }
  ],
  "emergency": [
    { "sort_order": 1, "type": "pharmacy", "maps_query": "Farmacia Comunale, Spello" }
  ]
}
```

**Dozwolone wartości:**

| pole | wartości |
|---|---|
| `category` | `parking`, `monument`, `church`, `museum`, `house`, `viewpoint`, `restaurant` |
| `emergency.type` | `pharmacy`, `hospital`, `toilet`, `playground` |
| `duration_type` | `half_day`, `full_day` |
| `status` | zawsze `draft` |

`bandana_color` — kolor akcentu miasta w hex, dobrany do charakteru miejsca.
`sort_order` miasta — pozycja w regionie, 1 = najbliżej bazy.

---

## 4. `{{slug}}.pl.json`

Klucze przystanków to **numery ze `stops[].stop_number`** z pliku meta.
Ten numer jest jedynym łącznikiem między plikami — musi się zgadzać co do jednego.

```json
{
  "lang": "pl",
  "city": {
    "title": "Spello",
    "region_label": "Umbria · pół dnia",
    "subtitle": "Rzymskie mozaiki pod podłogą willi, renesansowe freski Pinturicchia i miasto, które w czerwcu tonie w kwiatach.",
    "lead": null,
    "good_to_know": "Centrum jest w strefie ZTL — parkuj przy Villa dei Mosaici.",
    "hero_note": null
  },
  "stops": {
    "3": {
      "name": "Porta Consolare",
      "desc_paragraphs": [
        "Pierwszy akapit opisu dla rodzica.",
        "Drugi akapit."
      ],
      "kids_box": "Treść questu dla dziecka.",
      "hint": "Wskazówka, która realnie pomaga rozwiązać quest.",
      "local_flavor": "Legenda, anegdota albo ciekawostka ekonomiczna.",
      "photo_task": null,
      "dress_code": null
    }
  },
  "day_plan": {
    "1": "Parking przy Villa dei Mosaici"
  },
  "emergency": {
    "1": { "label": "Farmacia Comunale", "description": "Przy głównym placu, czynna do 20:00" }
  }
}
```

Pole nieużywane → `null`. Nie pomijaj klucza, wpisz `null` — walidator to sprawdza.

---

## 5. `wiki_article` — SPRAWDŹ, NIE ZGADUJ

Z tego pola bierze się zdjęcie na kafel i przy przystanku. Dla każdego wpisanego tytułu:

1. otwórz `it.wikipedia.org/wiki/<tytuł>` i potwierdź, że **artykuł istnieje**,
2. potwierdź, że **ma zdjęcie główne** (miniatura w boksie po prawej).

Nie ma artykułu albo nie ma zdjęcia → `null`. **Nie wymyślaj tytułów.**
Zmyślony tytuł = 404 i pusty kafel. Zdarzyło się już przy Rimini i Rawennie.

`city.wiki_article` ma wskazywać **najbardziej rozpoznawalny zabytek miasta**, nie samo miasto —
to zdjęcie sprzedaje kafel na stronie regionu.

---

## 6. Zasady treści

### `desc_paragraphs` — opis dla rodzica
Bogaty, jak w prawdziwym przewodniku: historia, datowanie, etapy budowy i przebudowy,
architektura, wnętrze, najważniejsze dzieła, autorzy, znaczenie, lokalny kontekst. 2–3 akapity.

Przy **kościołach** obowiązkowo sprawdź: scenę na obrazie przy ołtarzu głównym, co przedstawia
sklepienie, czy jest tam bardzo znane dzieło lub bardzo znany autor, oraz **wymagania co do stroju**
(zakryte ramiona, kolana) → `dress_code`.

Tekst rodzica **nigdy nie informuje, czego nie znalazłeś**. Żadnych „nie udało się ustalić".
Braki idą do `_notes` (punkt 8).

### `kids_box` — quest
Musi wynikać z konkretnego miejsca, detalu, historii albo legendy. Konstrukcja:

1. znajdź / zauważ konkretny element,
2. zrób z nim coś — policz, porównaj, odczytaj, sfotografuj, znajdź różnicę,
3. dodaj element rodzinny — rozmowa, wybór, dedukcja, burza mózgów,
4. jeśli pasuje — zakończ pytaniem lub decyzją.

Dobrze: *znajdź wieżę z legendy o Orlando → zdjęcie → rodzinna burza mózgów „jak mógłby uciec?"
→ każdy podaje jeden sposób, rodzina wybiera najlepszy.*

Źle: „zrób zdjęcie drzwi", „policz trzy okna", „znajdź coś czerwonego".

**Samo zdjęcie nie może być całym questem.** Ma być ciekawe dla 9-latka i niegłupie dla 15-latka.
Przy parkingu i restauracji **nie twórz questu na siłę** → `null`.

### `hint` — wskazówka
Ma realnie pomóc rozwiązać quest. Nie ogólnik, nie powtórzenie pytania. Konkret, np.:
*„Rzymskie elementy rozpoznasz po dużych, starannie dopasowanych blokach białego kamienia.
Przy średniowiecznych wieżach zwróć uwagę na inny materiał."*
Rodzic ma móc pomóc bez dodatkowego researchu.

### `local_flavor` — lokalny smak
Legenda, anegdota, nietypowa historia, zwyczaj, charakterystyczny detal.
**Nie powtarzaj tego, co jest w opisie rodzica.**

Jeśli jest legenda — **opowiedz ją**, nie pisz „istnieje legenda". Podaj: kim jest bohater,
w jakiej epoce, dlaczego znany, co się według legendy stało, jakie są warianty, jaki związek
z tym konkretnym miejscem. Różne warianty pokaż jako różne („według jednej wersji…",
„inna tradycja głosi…") — nie rozstrzygaj, która prawdziwa.

Mocnym smaczkiem bywa **ciekawostka ekonomiczna**: ile kosztowała budowa, kto sfinansował,
ile zapłacono za dzieło. Najpierw prawdziwa liczba, potem porównanie pomagające zrozumieć skalę
(ile to było gospodarstw, rocznych dochodów). Porównanie modelowe oznacz jako **orientacyjne**.
Nie wymyślaj cen ani współczesnych wycen.

### Restauracja — ostatni przystanek
Punkt dla rodzica, bez questu. Kryteria twarde: **Google ≥ 4,1**, **> 100 opinii**, aktualne godziny,
możliwość kolacji o planowanej porze, orientacyjny koszt, brak formalnego dress code'u.
Preferuj widok, lokalną kuchnię, wygodę po całym dniu chodzenia.

Do JSON-a trafia **jedna, wybrana restauracja**. Alternatywy wpisz do `_notes` z uzasadnieniem —
nie do treści.

---

## 7. BEZWZGLĘDNE ZAKAZY

- ❌ **Żadnych kilometrów i czasów dojazdu** („25 km", „ok. 1h05")
- ❌ **Żadnych godzin wyjazdu/powrotu z bazy** („wyjazd z Montefelcino 8:25")
- ❌ Żadnych sztywnych ram dnia zależnych od miejsca noclegu
- ❌ Zero konfabulacji: dat, nazwisk, legend, godzin, cen, ocen Google, liczby opinii,
  nazw dzieł, autorów
- ❌ Nie tłumacz niczego — **tylko polski**

Plan dnia zaczyna się od **parkingu w mieście**, kończy na ostatnim przystanku.
Godziny wyłącznie „na miejscu".

Brak potwierdzonego źródła ceny/daty/telefonu → **„sprawdź na miejscu"**.
Nie znasz dokładnego roku → podaj potwierdzony okres (`I w. p.n.e.`). Nie zgaduj.

Nazwy własne zabytków zostają w oryginale: `Porta Consolare`, `Fontana Maggiore`.
Turysta musi je rozpoznać na tabliczce.

Przystanek 01 = **zawsze parking**. Ostatni = restauracja. Docelowo 6–9 przystanków.

---

## 8. Notatki redakcyjne

Wszystko, czego nie udało się potwierdzić, oraz odrzucone warianty (np. pozostałe restauracje)
wpisz na końcu `{{slug}}.pl.json` w osobnym bloku:

```json
"_notes": [
  { "stop_number": 5, "field": "a", "note": "Nie znalazłem potwierdzonej ceny biletu — sprawdzić na miejscu." },
  { "stop_number": 9, "field": "b", "note": "Alternatywy: Il Molino (4,3 / 210 opinii), La Cantina (4,2 / 130 opinii)." }
]
```

`field`: `a` dane · `b` opis rodzica · `c` quest · `d` wskazówka · `e` lokalny smak · `f` źródła · `g` uwaga ogólna.
`stop_number: null` = uwaga do całego miasta.

Ten blok trafia do osobnej tabeli w bazie, **niewidocznej publicznie**, i nie jest tłumaczony.

---

## 9. Nazewnictwo i miejsce w repo

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
