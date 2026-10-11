<!-- quolino-trips:start -->
## Wycieczki: szkic w rozmowie, sprawdzanie, tłumaczenie (od 2026-10-10)

Zasady pisania: umiejętność Claude `quolino-trip-writing`. Role: **GPT pisze, Claude sprawdza, JP decyduje.**
Ty prowadzisz rozmowę w wątku miasta i uruchamiasz skrypty. Nic nie piszesz do bazy sam.
Skrypty są w `/opt/data/quolino/`: zawsze najpierw `cd /opt/data/quolino && mkdir -p work/drafts`. Uruchamiaj je **w tle** z `--notify <id tego wątku>`. Skrypt sam
napisze w wątku, gdy skończy (szkic trwa 10–25 min, poprawka 3–10 min). Ty od razu odpowiedz JP,
że pracujesz.

### 1. Nowa wycieczka („zrób Gubbio”, „szkic Todi, pół dnia”)
Zanim uruchomisz, ustal (dopytaj tylko o brakujące; reszta ma domyślne):
- nazwę i slug (bez polskich znaków, wg nazwy polskiej: Asyż → `asyz`),
- region (`regions.slug`; Marche ≠ Umbria ≠ Emilia-Romagna),
- `full_day` / `half_day` (domyślnie full_day),
- życzenia JP: must-see, kolejka, finał, tempo. Przepisz je do `--brief` jego słowami.

```bash
nohup node trip-draft.mjs gubbio --name "Gubbio" --region umbria --duration full_day \
  --brief "kolejka na Monte Ingino, finał z widokiem" --notify <id wątku> > work/drafts/gubbio.log 2>&1 &
```

### 2. Rozmowa o szkicu (każda uwaga JP)
1. Zrozum uwagę i przełóż ją na konkret: który przystanek, które pole (opis, quest, wskazówka, godziny,
   kolejność, nowy albo usunięty przystanek). Stan szkicu: `node trip-revise.mjs <slug> --show`.
2. Gdy uwaga jest niejednoznaczna, dopytaj jednym pytaniem. Gdy jest jasna, powiedz w 1–3 punktach,
   co zmienisz, i zapytaj „Robię?”. Kilka uwag zbieraj w jedno polecenie.
3. Po „tak” uruchom jedno polecenie. Opisz w nim zmiany po polsku, konkretnie, z nazwami przystanków.
   Dołącz `--context` z ostatnimi wiadomościami JP z wątku (dosłownie, kilka–kilkanaście linii) — Claude
   na tej podstawie rozumie, DLACZEGO JP prosi o zmianę, i rozstrzyga, czy to zasada na przyszłość:
```bash
nohup node trip-revise.mjs gubbio --say "Palazzo dei Consoli: quest prostszy dla 9-latka (liczenie, nie daty). \
Dodaj lodziarnię przed kolejką na Monte Ingino, opcjonalną." \
  --context work/drafts/gubbio-ctx.txt --notify <id wątku> > work/drafts/gubbio.log 2>&1 &
```
4. Skrypt pokaże w wątku nową wersję, werdykt Claude i link do podglądu. Podgląd pokazuje fiszkę SZKIC
   i historię poprawek; pełna historia: link + `&historia`.
5. Jeśli Claude zostawił błędy (`verdict: fix`), powiedz JP, czego dotyczą, i zaproponuj poprawkę.
   Nie proponuj zatwierdzenia szkicu z błędami.

Inne polecenia JP:
- „wróć do v2”: `node trip-revise.mjs <slug> --restore 2 --notify <id>` (tworzy nowy szkic z v2).
- „pokaż link”, „która wersja”: `node trip-revise.mjs <slug> --show`.

### Pamięć redakcyjna i fakty (od 2026-10-11)
- Po każdej poprawce Claude czyta ją w kontekście rozmowy i sam rozstrzyga: jednorazowa (dotyczy tego
  miasta) czy ogólna preferencja JP. Ogólną zapisuje jako zasadę; skrypt napisze w wątku „📌 Zapamiętane…”.
  Nie pytaj JP o każdą zasadę. Zasady obowiązują GPT przy pisaniu i Claude przy kontroli wszystkich
  kolejnych wycieczek.
- „cofnij zasadę 7” → `node trip-rules.mjs off 7 --why "słowa JP"`. „pokaż zasady” → `node trip-rules.mjs list`.
  „zapamiętaj: …” (zasada podyktowana wprost) → `node trip-rules.mjs add --scope <quest|opis|praktyczne|plan-dnia|ton|struktura|fakty|inne> --rule "…"`.
- Każda kontrola szkicu sprawdza fakty historyczne (daty, osoby, autorstwo, liczby) z Wikipedią w języku
  kraju (Włochy: włoska, Hiszpania: hiszpańska…, potem angielska i polska) oraz ze stronami lokalnymi
  i oficjalnymi ze źródeł przystanku. Potwierdzające linki dopisują się do źródeł przystanku.
  Niezgodne = błąd (GPT poprawia z dowodem), bez źródła = uwaga. Godzin i cen nie sprawdzamy z Wikipedią.
- Lokale (restauracje, lody, słodycze) nie idą przez Wikipedię: tylko polecane przez Google
  (ocena ≥ 4,1 i ponad 100 opinii). Poniżej progu = błąd, brak oceny = uwaga.
  Wynik: linia „Fakty …” w wątku i sekcja „Fakty i źródła” w historii podglądu.
  Jeśli JP zna fakt lepiej niż Wikipedia (był na miejscu), jego słowo wygrywa — zapisz to w poprawce.

### Lokale gastro — przegląd co miesiąc (cron, 1. dnia miesiąca)
`gastro-refresh.mjs` sprawdza w Google oceny wszystkich lokali (restauracje, lody, słodycze) z opublikowanych
wycieczek i zapisuje je w bazie. Gdy lokal jest zamknięty, spadł poniżej progu (≥ 4,1 i > 100 opinii) albo
Google go nie znajduje, w wątku miasta pojawia się alarm 🍝. Wtedy: znajdź 2–3 zamienniki w pobliżu
spełniające próg (ocena, liczba opinii, telefon, strona), zaproponuj JP i po wyborze zrób poprawkę
(`trip-revise`, jeśli miasto ma szkic; jeśli nie — opisz JP, co trzeba zmienić). Ręcznie dla jednego miasta:
`node gastro-refresh.mjs --city <slug>`.

### Zgłoszenia od rodzin, linki, koszty (cron)
- 📣 „Zgłoszenie od rodziny” w wątku miasta (z przycisku „Coś się nie zgadza?” na stronie): sprawdź na stronie
  oficjalnej / w Google, zaproponuj JP poprawkę, po decyzji oznacz:
  `node reports-relay.mjs --close <8 znaków z wiadomości> fixed` (albo `rejected`).
  Kilka zgłoszeń tego samego przystanku = priorytet.
- 🔎 Przegląd linków i godzin (1. dnia miesiąca): martwy link → znajdź nowe źródło; godziny → sprawdź na stronie
  oficjalnej. Zaproponuj JP poprawkę.
- 💶 Raport kosztów (1. dnia miesiąca) idzie na #lokale — tylko informacja, nic nie rób.

### 3. Decyzja
- „zatwierdzam” / „publikuj”: upewnij się, że to aktualny szkic i ma `verdict: ok`, potem
  `node trip-approve.mjs <slug>`. Wycieczka trafia na stronę, a tłumaczenie do kolejki.
- „odrzuć”: `node trip-approve.mjs <slug> --reject "powód JP"`.

### 4. Opis przysłany z zewnątrz (pliki `*.meta.json` + `*.pl.json`)
`node trip-review.mjs <katalog miasta>`. `verdict: ok` → szkic do decyzji JP. `fix` → błędy wracają do autora.

### 5. Tłumaczenie (po zatwierdzeniu)
```bash
qdb jobs                                     # zlecenia translate ze statusem queued
node trip-translate.mjs <slug> --job <id>    # PL → EN → pozostałe, każdy język z kontrolą jakości Claude
```
Wynik i uwagi tłumacza wklej krótko w wątku miasta. Szkiców nie tłumaczymy.
<!-- quolino-trips:end -->
