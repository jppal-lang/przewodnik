# Kontrakt importu — co ChatGPT ma przygotować

Ten plik opisuje **format wymiany**. Semantyka pól (co ma być w opisie, jak budować quest)
jest w `PROMPT-nowe-miasto.md`.

---

## 1. Dlaczego tak, a nie inaczej

Baza jest zbudowana tak, żeby **zmiana jednego punktu dotykała jednego wiersza**:

| Warstwa | Tożsamość | Kolejność |
|---|---|---|
| kraj | `countries.slug` | `sort_order` |
| region | `regions.slug` | `sort_order` |
| miasto | `cities.slug` | `sort_order` |
| punkt | `stops.stop_key` (unikalny w mieście) | `sort_order` |

Trzy zasady, które z tego wynikają:

**Numer punktu nie jest jego tożsamością.** `stop_number` to tylko numer wyświetlany.
Wszystko — tłumaczenia, komentarze redakcyjne, przyszłe oceny — wisi na `stop_key`.

**Kolejność jest rzadka: 10, 20, 30…** Wstawienie punktu między 20 a 30 to `sort_order: 25`.
Reszta trasy zostaje nietknięta. Sprawdzone: dodanie lodziarni w środek trasy Urbino
nie ruszyło żadnego innego wiersza.

**Kasowanie sprząta samo.** Usunięcie punktu kasuje jego tłumaczenia (`ON DELETE CASCADE`).
Zmiana sluga regionu przechodzi na miasta automatycznie (`ON UPDATE CASCADE`).

---

## 2. Nowe miasto — dwa pliki

```
przewodnik/_content/cities/<region>/<slug>/
├── <slug>.meta.json     ← dane maszynowe, bez języka
└── <slug>.pl.json       ← proza po polsku
```

Potem, osobnym krokiem, tłumaczenia: `<slug>.en.json`, `<slug>.de.json`, `<slug>.it.json`.

### Mapowanie na tabele

| Plik / klucz | Tabela | Uwaga |
|---|---|---|
| `meta.city` | `cities` | `slug` = nazwa katalogu |
| `meta.stops[]` | `stops` | łączenie po `stop_key` |
| `meta.stops[].sources` | `stops.sources` | tylko redakcja, nie na stronie |
| `meta.stops[].location` | `stops.location` | **kolumna do dodania** |
| `meta.stops[].parking_cost` | `stops.parking_cost` | **kolumna do dodania** |
| `<lang>.city` | `city_translations` | |
| `<lang>.stops{stop_key}` | `stop_translations` | klucz = `stop_key`, nie numer |
| `<lang>.day_plan{stop_key}` | `day_plan` | |
| `<lang>.emergency{n}` + `meta.emergency[]` | `emergency_points` | |
| `pl._notes[]` | `editorial_notes` | **nigdy publicznie, nie tłumaczone** |

---

## 2·0. Pole A z dokumentu → kolumny

Blok A w HTML jest jednym tekstem z emoji. W JSON każde podpole ma własny klucz,
a w bazie własną kolumnę:

| HTML | JSON | Kolumna |
|---|---|---|
| 📅 data / okres | `year_built` | `stops.year_built` |
| 📍 lokalizacja | `location` | `stops.location` ← **brakuje** |
| 🅿️ koszt | `parking_cost` | `stops.parking_cost` ← **brakuje** |
| 💶 cena | `price` | `stops.price` |
| 🕐 godziny | `opening_hours` | `stops.opening_hours` |
| 🕐 dotarcie | `time_label` | `stops.time_label` |
| ⏱️ czas | `visit_duration` | `stops.visit_duration` |
| 👕 strój | `dress_code` | `stop_translations.dress_code` |
| ⭐ ocena | `rating`, `reviews_count` | `stops.rating`, `stops.reviews_count` |
| 🌅 zachód | `sunset_spot` | `stops.sunset_spot` |
| „opcjonalny" | `optional` | `stops.optional` |
| 🗺️ | `maps_query` | `stops.maps_query` |

Migracja domykająca komplet:

```sql
ALTER TABLE stops ADD COLUMN IF NOT EXISTS location     text;  -- 📍
ALTER TABLE stops ADD COLUMN IF NOT EXISTS parking_cost text;  -- 🅿️
```

**Pułapki parsera** — sprawdzone na Spello v31:

`🕐` występuje **dwa razy** w tym samym bloku, raz jako godziny otwarcia, raz jako godzina
dotarcia. Parser biorący pierwsze trafienie wpisze „z zewnątrz bez ograniczeń" jako godzinę
dotarcia i rozwali plan dnia.

`🅿️` i `💶` to **różne pola**. Zlanie ich w `price` gubi rozróżnienie między kosztem parkingu
a ceną wstępu.

`⭐` ma **dwa znaczenia**: prawdziwa ocena lokalu (`4,6 / 239 opinii`) oraz kryterium redakcyjne
(`filtr redakcyjny: Google ≥ 4,1 + 100+ opinii`). Drugie nigdy nie trafia do `rating` —
to notatka do `editorial_notes`.

Sekcje `C`, `D` i `E` bywają **wieloakapitowe**. Import musi brać wszystkie akapity
i łączyć je `\n\n`, nie pierwszy z brzegu. Legenda o Orlandzie przy Porta Venere ma
cztery akapity.

---

## 2a. Kategorie i ikony — znaczenie jest wiążące

Ikona nie jest ozdobą. Wybierasz **kategorię**, ikona idzie z niej automatycznie.
Nie wymyślaj własnych emoji — walidator odrzuci kategorię spoza listy.

| kategoria | ikona | znaczenie |
|---|---|---|
| `parking` | 🅿️ | Parking. Zawsze punkt 01. Cena, ZTL, alternatywa. |
| `monument` | 🏛️ | Zabytek lub budowla oglądana z zewnątrz. |
| `museum` | 🏛️ | Muzeum lub wnętrze biletowane. Wymaga godzin i ceny. |
| `church` | ✝️ | Kościół rzymskokatolicki. Sprawdzić dress code. |
| `synagogue` | ✡️ | Synagoga lub obiekt innej tradycji religijnej. |
| `castle` | 🏰 | Zamek, twierdza, fortyfikacja. |
| `viewpoint` | 🏞️ | Punkt widokowy, panorama. Możliwy `sunset_spot`. |
| `street` | 🛣️ | Ulica, rzymska droga lub trakt jako osobny punkt. |
| `house` | 🏠 | Dom znanej osoby, kamienica z historią. |
| `photo` | 📷 | Punkt szczególnie fotograficzny. |
| `icecream` | 🍦 | Lodziarnia. Zwykle punkt opcjonalny. |
| `sweets` | 🍰 | Cukiernia, lokalne słodycze. Zwykle opcjonalny. |
| `restaurant` | 🍽️ | Restauracja, kolacja, finał dnia. Próg 4,1 / 100 opinii. |

Emoji są **tymczasowe**. Docelowo dostaną własny zestaw z maskotką Quo — podmiana to jeden
`UPDATE` w tabeli `stop_categories`, bez ruszania treści miast. Dlatego ikona **nigdy**
nie jest wpisywana do treści punktu.

Jeden punkt = jedna kategoria. Kościół w zabytkowym pałacu to `church`, nie `church` + `monument`.

---

## 2b. Trasa wycieczki

Trasa zweryfikowana przez redaktora jest **referencyjna** (WYTYCZNE §25) i wygrywa
z generowaną z bazy.

```json
"route": {
  "url": "https://www.google.com/maps/dir/?api=1&origin=…&waypoints=…&travelmode=walking",
  "source": "maps",
  "verified_at": "2026-08-22T21:00:00+02:00"
}
```

`source`: `field` = sprawdzona w terenie · `maps` = sprawdzona przez redaktora w Google Maps ·
`generated` = złożona z punktów przez bazę.

Bez tego bloku trasa powstaje automatycznie z `maps_query` / współrzędnych punktów,
w kolejności `sort_order`.

**Kolejność w trasie musi zgadzać się z kolejnością punktów w dokumencie.** Jeśli trasa
pomija punkt albo prowadzi przez miejsce, którego nie ma na liście — to błąd do zgłoszenia,
nie do przemilczenia. Rodzic dostaje wtedy inną kolejność w opisie i inną w nawigacji.

Google przyjmuje do **9 waypointów** plus start i metę, czyli 11 punktów łącznie.

---

## 3. Zmiana w istniejącym mieście — plik łatki

Do drobnych korekt **nie przysyłaj całego miasta**. Wystarczy plik łatki:

```
<slug>.patch.json
```

```json
{
  "doc": { "version": "v3", "generated_at": "2026-08-23T10:00:00+02:00" },
  "city_slug": "spello",

  "add_stops": [
    {
      "stop_key": "gelateria-centrale",
      "after": "porta-consolare",
      "category": "icecream",
      "icon": "🍦",
      "optional": true,
      "rating": 4.8,
      "reviews_count": 1240,
      "maps_query": "Gelateria Centrale, Spello",
      "verify_url": "https://…",
      "pl": {
        "name": "Gelateria Centrale",
        "desc_paragraphs": ["…"],
        "kids_box": null,
        "hint": null,
        "local_flavor": "Lody z pistacji z Bronte.",
        "practical_note": null,
        "dress_code": null,
        "photo_task": null
      }
    }
  ],

  "remove_stops": ["via-giulia"],

  "reorder": ["parking-mosaici", "villa-mosaici", "porta-consolare", "gelateria-centrale"],

  "update_stops": {
    "santa-maria-maggiore": {
      "price": "5 €",
      "price_status": "confirmed",
      "pl": { "hint": "Poprawiona wskazówka." }
    }
  }
}
```

Co się dzieje przy imporcie:

- **`add_stops`** — `after` wskazuje punkt, po którym ma stanąć nowy. Liczę `sort_order`
  jako średnią sąsiadów. Reszta trasy bez zmian. `"after": null` = na początek.
- **`remove_stops`** — lista `stop_key`. Tłumaczenia lecą kaskadą.
- **`reorder`** — pełna lista `stop_key` w nowej kolejności. Przepisuję tylko `sort_order`
  na 10, 20, 30… Treść nietknięta.
- **`update_stops`** — tylko podane pola. Reszta zostaje. `null` = wyczyść pole.

Wszystkie sekcje są opcjonalne. Może być sama `reorder`, sama `update_stops` itd.

---

## 4. Twarde reguły formatu

**`stop_key` jest nienaruszalny.** Nadany raz, nigdy nie zmieniany — nawet gdy zmienia się
nazwa punktu. Małe litery, cyfry, myślniki: `porta-consolare`, `villa-mosaici`.
Zmiana `stop_key` to dla bazy usunięcie starego punktu i utworzenie nowego — traci się
tłumaczenia i komentarze.

**Nie podawaj `sort_order` w plikach miasta.** Kolejność wynika z pozycji w tablicy `stops[]`.
Rzadką numerację nadaje import.

**`stop_number` jest opcjonalny.** Jeśli go podasz, potraktuję jako numer wyświetlany.
Jeśli nie — policzę z kolejności.

**W plikach językowych klucz to `stop_key`**, nigdy numer. `stop_key` nie jest tłumaczone.

**Pole nieużywane → `null`.** Nie pomijaj klucza — walidator to sprawdza.

**`_notes` wyłącznie w `.pl.json`.** W tłumaczeniach nie może się pojawić.

---

## 4a. Gdy treść powstała najpierw w HTML

Dokument HTML jest wtedy **źródłem prawdy**, a JSON jego wiernym odwzorowaniem.
Import ma prawo odrzucić plik, w którym:

- liczba akapitów w `desc_paragraphs` nie zgadza się z sekcją B dokumentu,
- `kids_box`, `hint` albo `local_flavor` są krótsze niż w sekcji C, D, E,
- brakuje punktu, który w HTML ma własny `<article class="stop">`,
- kolejność `stop_number` nie odpowiada kolejności artykułów.

Przy Spello v31 JSON od ChatGPT różnił się od HTML-a **w ośmiu punktach na osiem** i pomijał
dwa całe przystanki. Dlatego ta reguła jest tu wpisana, a nie domyślna.

---

## 5. Zanim wyślesz

```
cd przewodnik/_content
python3 validate.py cities/umbria/spello
```

Kod wyjścia 1 = są błędy, nie importuję.

Walidator sprawdza m.in.: unikalność i format `stop_key`, parking na pozycji 01,
`verify_url` przy każdym punkcie, cenę i godziny bez statusu weryfikacji, próg 4,1 / 100 opinii
dla restauracji, komplet kluczy w każdym języku, zgodność liczby akapitów z wersją polską,
brak `_notes` w tłumaczeniach oraz zakazane kilometry i czasy dojazdu.

---

## 6. Czego NIE przysyłać

- ❌ SQL-a ani `INSERT`-ów — import robię sam
- ❌ HTML-a jako źródła treści
- ❌ `sort_order`, `id`, `stop_id` — to nadaje baza
- ❌ tłumaczeń w pliku `.pl.json`
- ❌ rozmówek — są wspólne dla kraju, Włochy już je mają
