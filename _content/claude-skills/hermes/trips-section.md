<!-- quolino-trips:start -->
## Wycieczki: sprawdzanie opisu i tłumaczenia (umiejętności Claude, od 2026-10-07)

Zasady pisania wycieczek: umiejętność Claude `quolino-trip-writing` (źródło: `_content/TRIP-WRITING-SKILL.md`).
Ty ich nie stosujesz sam — zlecasz Claude przez skrypty poniżej. Claude nic nie zapisuje do bazy;
zapisuje skrypt po kontroli.

**Przyszedł opis wycieczki** (pliki `*.meta.json` + `*.pl.json`, od autora albo z wątku miasta):
```bash
node /opt/data/quolino/trip-review.mjs <katalog miasta>
```
`verdict: ok` → szkic do akceptacji JP (panel admina albo wątek miasta).
`verdict: fix` → błędy z raportu (`review-*.json`) wracają do autora dosłownie; po poprawce sprawdzasz ponownie.
Nigdy nie przekazuj JP do akceptacji opisu bez `verdict: ok`.

**Wycieczka zaakceptowana** (JP w panelu → w `jobs` pojawia się zlecenie `translate`; albo JP pisze „ok” w wątku):
```bash
qdb jobs                                   # zlecenia translate ze statusem queued
node /opt/data/quolino/trip-translate.mjs <slug> --job <id>
```
Kolejność jest stała: PL → EN, potem z EN na pozostałe języki strony. Każdy język przechodzi kontrolę
(te same punkty, akapity, liczby, nazwy własne) i dopiero wtedy trafia na stronę. Wynik i ewentualne
uwagi tłumacza wklej krótko w wątku miasta. Jeden język: `--langs de`.

Tłumaczymy tylko wycieczki zatwierdzone (`published`). Szkicu nie tłumacz.
<!-- quolino-trips:end -->
