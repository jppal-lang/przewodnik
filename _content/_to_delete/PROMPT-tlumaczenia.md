# PROMPT 2/2 — tłumaczenia

Uruchamiaj dopiero, gdy `{{slug}}.pl.json` jest **zweryfikowany i zatwierdzony**.
Tłumaczenie niesprawdzonej treści to powielanie błędu razy siedemnaście.

Wklej ChatGPT-owi w całości razem z plikiem `{{slug}}.pl.json`.

---

Przetłumacz załączony plik `{{slug}}.pl.json` na języki: **{{JĘZYKI}}**.

Wynik: **jeden plik JSON na język**, nazwany `{{slug}}.{{kod}}.json`.
Bez HTML, bez markdownu, bez komentarzy.

---

## 1. Zasada nadrzędna

**Struktura pliku jest nietykalna.** Te same klucze, ta sama kolejność, ta sama liczba
akapitów w `desc_paragraphs`. Zmienia się wyłącznie treść tekstowa.

Przystanki są kluczowane po **`stop_key`** (np. `porta-consolare`), nie po numerze.
`stop_key` jest identyfikatorem technicznym — **nigdy go nie tłumacz i nie zmieniaj**,
nawet jeśli wygląda jak słowo.

Jeżeli w źródle pole ma `null` → w tłumaczeniu też `null`. Nie wypełniaj pustych pól.
Nie dodawaj kluczy, nie usuwaj kluczy.

Zmień tylko `"lang"` na kod tłumaczonego języka.

## 2. Czego NIE tłumaczysz

Zostawiasz **dosłownie, bez zmian**:

- **nazwy własne zabytków** — `Porta Consolare`, `Fontana Maggiore`, `Villa dei Mosaici`,
  `Ponte delle Torri`. Turysta musi je rozpoznać na tabliczce i w Google Maps.
- nazwy restauracji, hoteli, ulic i placów
- ceny, godziny, daty, liczby
- numery telefonów i linki
- kody i slugi

Jeżeli nazwa własna wymaga wyjaśnienia, dopisz je **obok** w języku docelowym, np.
`Porta Consolare (das Konsulartor)` — ale sama nazwa zostaje w oryginale.

**Nie tłumaczysz bloku `_notes`.** Pomijasz go całkowicie w plikach tłumaczeń.

## 3. Glosariusz — terminy stałe

Te słowa wracają w każdym mieście. Muszą brzmieć **identycznie we wszystkich plikach
i wszystkich miastach**, bo są etykietami interfejsu.

| PL | EN | DE | IT |
|---|---|---|---|
| Wskazówka | Hint | Tipp | Indizio |
| Lokalny smak | Local flavour | Lokales Flair | Sapore locale |
| Dla dzieci | For kids | Für Kinder | Per bambini |
| Zadanie foto | Photo task | Fotoaufgabe | Compito fotografico |
| Plan dnia | Day plan | Tagesplan | Piano del giorno |
| Parking | Parking | Parkplatz | Parcheggio |
| Pół dnia | Half day | Halber Tag | Mezza giornata |
| Pełny dzień | Full day | Ganzer Tag | Giornata intera |
| sprawdź na miejscu | check on site | vor Ort prüfen | verificare sul posto |
| strefa ZTL | ZTL zone | ZTL-Zone | zona ZTL |
| do potwierdzenia | to be confirmed | noch zu bestätigen | da confermare |
| wymaga weryfikacji | needs verification | überprüfungsbedürftig | da verificare |
| Zwróć uwagę na… | Look out for… | Achte auf… | Fai attenzione a… |
| punkt opcjonalny | optional stop | optionaler Halt | tappa facoltativa |
| punkt widokowy | viewpoint | Aussichtspunkt | punto panoramico |
| Legenda głosi, że… | Legend has it that… | Der Legende nach… | La leggenda narra che… |

Zwroty „do potwierdzenia" i „wymaga weryfikacji" muszą być tłumaczone **konsekwentnie** —
rodzic po nich poznaje, że danej informacji nie sprawdziliśmy.

Dla pozostałych języków trzymaj się tego samego rejestru — jedno tłumaczenie na termin,
konsekwentnie w całym pliku.

## 4. Ton

- **Zwracanie się do czytelnika**: bezpośrednie, na „ty". W niemieckim `du`, nie `Sie` —
  to przewodnik rodzinny, nie instrukcja urzędowa.
- **`kids_box` i `hint`** kierujesz do dziecka 9–15 lat. Prosto, żywo, bez zdrobnień
  i bez infantylizowania.
- **`desc_paragraphs`** kierujesz do dorosłego. Konkretnie, bez kwiecistości.
- **`local_flavor`** to anegdota — może być swobodniejszy, gawędziarski.

Nie skracaj i nie streszczaj. Nie dodawaj treści, której nie ma w oryginale.
Jeżeli oryginał ma trzy zdania, tłumaczenie ma trzy zdania.

## 5. Legendy

Tłumacz w całości, z zachowaniem sygnałów niepewności: „według jednej wersji legendy…",
„inna tradycja głosi…". Nie upraszczaj wariantów do jednego i nie rozstrzygaj,
która wersja jest prawdziwa.

## 6. Kontrola przed oddaniem

Dla każdego pliku sprawdź:

- [ ] `"lang"` ustawiony na właściwy kod
- [ ] identyczny zestaw kluczy jak w `pl` (te same `stop_key`, nieprzetłumaczone)
- [ ] pola `practical_note`, `dress_code` i `city.local_food` przetłumaczone lub `null`
- [ ] `desc_paragraphs` ma tyle samo elementów co w źródle
- [ ] `null` tam, gdzie w źródle był `null`
- [ ] nazwy własne zabytków nietknięte
- [ ] ceny, godziny i linki nietknięte
- [ ] brak bloku `_notes`
- [ ] plik jest poprawnym JSON-em (bez przecinka na końcu listy)

## 7. Kody języków

`en` angielski · `de` niemiecki · `it` włoski · `es` hiszpański · `fr` francuski ·
`nl` niderlandzki · `cs` czeski · `sk` słowacki · `uk` ukraiński · `hr` chorwacki ·
`hu` węgierski · `ro` rumuński · `pt` portugalski · `sv` szwedzki · `da` duński ·
`no` norweski

**Kolejność wdrażania.** Nie generuj wszystkich naraz. Zacznij od `en`, `de`, `it` —
to realni turyści w Marche i Umbrii. Resztę dorzucaj, gdy miast przybędzie.
Interfejs strony jest już przetłumaczony na wszystkie 17, więc brak treści w rzadszym
języku nie psuje wrażenia — opis leci wtedy po angielsku.

## 8. Gdzie wrzucić

Obok pliku źródłowego:

```
przewodnik/_content/cities/{{REGION}}/{{slug}}/
├── {{slug}}.meta.json
├── {{slug}}.pl.json
├── {{slug}}.en.json
├── {{slug}}.de.json
└── {{slug}}.it.json
```
