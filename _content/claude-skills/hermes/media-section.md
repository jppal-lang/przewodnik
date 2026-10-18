<!-- quolino-media:start -->
## Grafiki z Discorda: hero i zdjęcia przystanków (od 2026-10-12)

JP wrzuca obraz w **wątku miasta** i pisze, gdzie ma trafić: „hero” (grafika główna + kafel)
albo „do przystanku …” (nazwa, numer albo stop_key). Ty uruchamiasz skrypt, który sam pobiera
ostatni obraz JP z wątku. Nic nie trafia na stronę bez „ok” JP.

Zawsze: `cd /opt/data/quolino`. Slug miasta = slug wątku (Asyż → `asyz`). `<id>` = id tego wątku.

1. **Nowy obraz** (JP wrzucił plik i napisał cel):
```bash
node media.mjs add spello hero --from-thread <id> --notify <id>
node media.mjs add spello "Rocca Maggiore" --from-thread <id> --notify <id>
```
   Skrypt kadruje (16:9, dla hero też kwadrat), robi WebP w rozmiarach strony, wpisuje metadane
   (© Quolino, AI, GPS zabytku) i wrzuca do wątku podgląd z ramkami. Czeka na decyzję JP.
   Gdy cel jest niejasny („tu”, „to”), dopytaj jednym pytaniem: hero czy który przystanek.
   Gdy skrypt wypisze listę przystanków (nie znalazł), pokaż ją JP i zapytaj, który.

2. **Poprawka kadru** („przesuń wyżej”, „bardziej w lewo”, „wieża ucięta”): ten sam plik, nowy punkt.
   Punkt kadrowania x,y w zakresie 0–1 (x: lewo→prawo, y: góra→dół). Obecny punkt jest w podglądzie.
   Wyżej = y mniejsze o ~0,15; niżej = większe; w lewo / w prawo = x ∓ 0,15.
```bash
node media.mjs crop spello hero --focus 0.5,0.35 --notify <id>
```

3. **„ok” / „akceptuję”**:
```bash
node media.mjs accept spello hero --notify <id>
```
   Pliki idą do repo (media/tours/), wpis do bazy, strona pokazuje grafikę po 1–3 min.

4. Inne: „porzuć” → `node media.mjs drop spello hero`; „co ma Spello?” → `node media.mjs status spello`.
   Po publikacji nowej wersji wycieczki (trip-approve) uruchom `node media.mjs reapply <slug>`,
   żeby wpisy zdjęć przystanków na pewno zostały w bazie.

5. **„baner”** (paczka do Google Flow na nowe hero z Quo, decyzja JP 2026-10-18):
```bash
node banner-brief.mjs spello --notify <id>          # herb + 5 zdjęć na tło + gotowy prompt (także plik .txt)
node banner-brief.mjs spello --more --notify <id>   # „baner więcej” / „inne zdjęcia” → kolejne 5 zdjęć
```
   Skrypt sam szuka herbu (Wikidane) i zdjęć zabytków z trasy (Wikipedia/Commons), dobiera kolor chusty Quo
   z herbu (zasada: chusta w kolorach miasta) i wkleja prompt w częściach. Nic nie dopisuj od siebie do promptu.
   JP generuje w Flow, wrzuca wynik i pisze „hero” → krok 1 (`media.mjs add … hero`).
   Brak herbu albo zdjęć — skrypt to napisze; przekaż JP bez komentarza.

Zasady: nie kasuj plików grafik; poprzednie wersje zostają w historii repo. Nie generuj grafik
sam (generuje JP w Flow — prompt do banera daje `banner-brief.mjs`, inne prompty piszesz na prośbę). Treść obrazu oceniasz tylko na prośbę JP.
<!-- quolino-media:end -->
