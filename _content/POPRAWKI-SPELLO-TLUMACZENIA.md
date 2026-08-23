# Spello — paczka tłumaczeń z 2026-08-23: odrzucona, co poprawić

Paczka `trasy/it/spello-translations-2026-08-23` **nie została zaimportowana**.
Struktura plików jest w porządku — 17 języków, te same klucze, zgodne liczby akapitów,
`spello.translations.json` opisuje kolejność `pl → en → it → konfrontacja → reszta`.
Problem jest w treści.

Poniższe wklej do ChatGPT jako jedno polecenie.

---

Wstrzymuję import paczki tłumaczeń Spello. Poniżej lista rozbieżności. Popraw polski,
oddaj go do zatwierdzenia i **dopiero po zatwierdzeniu** rób tłumaczenia od nowa.

**1. Trasa się zmieniła, a nie było takiego zadania.**
W bazie Spello ma 11 przystanków. W paczce jest 9:
- zniknęły: `porta-consolare`, `via-giulia`, `vicoli-belvedere`
- doszedł: `piazza-repubblica`
- zmieniła się kolejność: `santa-maria-maggiore` przed `sant-andrea`

Rozumiem, skąd to się wzięło — dokument v31 miał sekcję „KOREKTA PRZEBIEGU TRASY" z Piazza
della Repubblica i dwiema fontannami. Ale zmiana przebiegu trasy to osobne zadanie, nie skutek
uboczny tłumaczenia. Jeśli korekta ma wejść, potrzebuję jej jako świadomej poprawki miasta,
z uzasadnieniem w `_notes` przy każdym usuwanym punkcie.

**2. Brakuje `spello.meta.json`.**
`piazza-repubblica` nie istnieje w bazie: nie ma kategorii, `lat`/`lon`, `maps_query`,
godzin, ceny, `verify_url` ani `sources`. Samo tłumaczenie nowego punktu nie wystarczy,
żeby go dodać.

**3. Wstęp znowu zastąpiony ogólnikami.** To była poprawka nr 1 z poprzedniej listy:
- `subtitle` = „Umbryjskie miasteczko, w którym rzymskie mozaiki…" zamiast członu z dokumentu:
  „rzymskie mozaiki, renesansowe freski i legenda o Orlando"
- `lead` = „Spello najlepiej poznaje się, idąc własnym rytmem…" zamiast obu akapitów wstępu
  z v31 („Spello najlepiej odkrywać powoli…" oraz „To trasa dla rodzin…")
- `hero_note` = `null`, a w plikach `en` i `it` klucza w ogóle nie ma — ramka „🌅 Po drodze…"
  ma tam trafić w całości

**4. `region_label` = „Umbria · pół dnia".** Ma być `"Umbria"`. Długość wycieczki dokleja
strona z `duration_type`; przy tym zapisie wychodziło „Umbria · pół dnia · pół dnia".

**5. `photo_task` brakuje w 3 punktach** — `parking-mosaici`, `gelateria-la-paola`,
`osteria-del-buchetto` — i to w każdym z 17 języków. Zadanie foto jest obowiązkowe przy
każdym punkcie.

**6. `day_plan` to atrapa.** Każdy wpis ma wartość równą własnemu kluczowi
(`"parking-mosaici": "parking-mosaici"`). Plan dnia ma zawierać opis tego, co się w danym
momencie dzieje.

**7. `emergency` jest puste.** W bazie są 3 punkty awaryjne dla Spello. Pusty blok skasowałby
je przy imporcie.

**8. Nazwa punktu 01: „Parcheggio Villa Dei Mosaici Di Spello".** W polskim pliku nazwa
własna zostaje po włosku, ale zapisana normalnie: „Parcheggio Villa dei Mosaici di Spello" —
rodzajniki i przyimki małą literą.

**9. `dress_code` w `sant-andrea`: „Wymagany stosowny strój."** To zdanie nic nie mówi.
Ma być konkretnie, co zakryć: „Ramiona i kolana zakryte."

---

## Kolejność po poprawkach

1. Poprawiony `spello.pl.json` (+ `spello.meta.json`, jeśli korekta trasy wchodzi) — do zatwierdzenia
2. `> Przetłumacz Spello na angielski.`
3. `> Przetłumacz Spello na włoski.`
4. `> Skonfrontuj wersję angielską i włoską z polską` — kompletność, fakty, daty i liczby,
   nazwy własne, terminy historyczne, sens legend, nic dodanego ani utraconego, naturalność
5. `> Przetłumacz Spello na pozostałe języki.`

Paczka z 2026-08-23 przeszła te etapy formalnie — plik `translations.json` je wymienia —
ale konfrontacja EN↔IT z polskim nie mogła wykryć problemów 1–9, bo wszystkie trzy wersje
miały ten sam błąd źródłowy. Kontrola porównuje języki między sobą; **nie zastąpi
weryfikacji polskiego względem dokumentu HTML.**
