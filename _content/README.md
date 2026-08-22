# `_content/` — pliki źródłowe treści

Tu leżą treści przewodników: polskie źródło i tłumaczenia, jako JSON.
To jest **jedyne źródło prawdy**. Baza Supabase jest kopią, którą można odtworzyć z tych plików.

Folder zaczyna się od `_`, więc **Jekyll (GitHub Pages) go nie publikuje**.
Pliki siedzą w repo i są wersjonowane, ale nie trafiają na questini.com.
⚠️ Nie dodawajcie do repo pliku `.nojekyll` — wtedy ten folder stałby się publiczny.

## Struktura

```
_content/
├── CHATGPT-PROJEKT.md         ← instrukcje projektu ChatGPT (wklej w całości)
├── IMPORT.md                  ← kontrakt importu: co dostaję i co z tym robię
├── validate.py                ← walidator, uruchom przed importem
└── cities/<region>/<slug>/
    ├── <slug>.meta.json       ← dane maszynowe, bez języka
    ├── <slug>.pl.json         ← źródło
    ├── <slug>.en.json
    └── <slug>.de.json …
```

Obowiązujący standard treści: **WYTYCZNE_WYCIECZEK.md** (sygnatura 2026-08-22 21:49 CEST)
+ **REDAKCJA.md v4**. Oba prompty są z nimi zgodne.

## `stop_key` — numer nie jest tożsamością punktu

Zgodnie z WYTYCZNE §1 punkt ma stabilny klucz (`porta-consolare`), a `stop_number` to tylko
pozycja na trasie. Dzięki temu można przestawiać, dodawać i usuwać punkty bez utraty
tłumaczeń, komentarzy i ocen. Pliki językowe kluczują przystanki po `stop_key`.

## Dlaczego meta osobno

Współrzędne, ceny, godziny, kategorie, linki i tytuły artykułów Wikipedii **nie są tłumaczone**.
Gdyby siedziały w każdym pliku językowym, byłoby siedemnaście kopii tych samych liczb,
które przy pierwszej poprawce ceny się rozjadą. W `meta` są raz.

Pliki językowe zawierają **wyłącznie prozę**, kluczowaną numerem przystanku ze `meta`.
Ten numer jest jedynym łącznikiem — dzięki niemu plik niemiecki i polski zawsze wiedzą,
że mówią o tym samym punkcie, a brakujące tłumaczenie wykrywa się porównaniem zbioru kluczy.

## Workflow

0. **Raz** — wklej `CHATGPT-PROJEKT.md` jako instrukcje projektu ChatGPT.
   Potem wystarczają krótkie polecenia: „Zrób Spello, region Umbria".
1. **Treść** — ChatGPT oddaje `.meta.json` + `.pl.json`, pushuje.
2. **Weryfikacja** — redaktor sprawdza polską wersję. Uwagi lądują w bloku `_notes`.
3. **Tłumaczenia** — dopiero po zatwierdzeniu polskiego: „Przetłumacz Spello na en, de, it".
4. **Walidacja** — `python3 validate.py` w katalogu `_content/`. Kod wyjścia 1 = nie importować.
5. **Import** — JP mówi Claude'owi „zaimportuj Spello".
6. Poprawki robi się **w plikach**, potem re-import. Nigdy bezpośrednio w bazie.

Tłumaczenie niesprawdzonej treści to powielanie błędu razy siedemnaście — stąd kolejność 2 przed 3.

Miasto pojawia się na stronie dopiero przy `status: "published"` w bazie.
ChatGPT zawsze daje `draft`.

## Walidator

```
python3 validate.py                        # wszystkie miasta
python3 validate.py cities/umbria/spello   # jedno
```

Sprawdza: poprawność JSON-a, zgodność slugów z katalogiem, unikalność i format `stop_key`,
dozwolone kategorie i ikony, ciągłość numeracji, parking na pozycji 01, obecność `verify_url`
przy każdym punkcie, cenę i godziny bez statusu weryfikacji, próg 4,1 / 100 opinii dla
restauracji, parę `rating` + `reviews_count`, komplet kluczy w każdym języku, zgodność liczby
akapitów z wersją polską, brak `_notes` w tłumaczeniach oraz zakazane wzorce — kilometry,
czasy dojazdu i zdania typu „nie udało się ustalić" w treści dla turysty.

Ostrzega (nie blokuje), gdy: brak punktu opcjonalnego, brak punktu widokowego,
puste `city.local_food` — czyli gdy wytyczne §12–§15 mogły zostać pominięte.

## Co gdzie ląduje w bazie

| Plik / pole | Tabela |
|---|---|
| `meta.city` | `cities` |
| `meta.stops[]` | `stops` |
| `<lang>.city` | `city_translations` |
| `<lang>.stops{}` | `stop_translations` — w tym `hint`, `local_flavor`, `dress_code` |
| `meta.stops[].sources` | `stops.sources` — tylko dla redakcji, nie na stronie |
| `<lang>.day_plan` + `meta.day_plan` | `day_plan` |
| `<lang>.emergency` + `meta.emergency` | `emergency_points` |
| `pl._notes` | `editorial_notes` — **nigdy publicznie, nie tłumaczone** |

## Miasta już w bazie

`urbino`, `ancona`, `frasassi`, `rimini`, `rawenna` (marche) ·
`perugia`, `asyz` (umbria)

Nie dublować slugów. Rozmówek nie generować — są wspólne dla kraju, Włochy już je mają.
