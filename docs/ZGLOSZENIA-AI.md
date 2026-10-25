# ZGLOSZENIA-AI.md — kategoryzacja zgłoszeń i opinii przez AI

Pomysł JP 2026-10-16. Status (2026-10-25): etap 1–2 wdrożony z **Jev** (TypeSafe System One): kategoria, priorytet i pewność
dla zgłoszeń, opinii z komentarzem i formularza kontaktowego. Zapis w kolumnach `ai_*` (SQL `2026-10-25-zgloszenia-ai.sql`),
linia „🏷️ Jev” w wiadomości na Discordzie, spam z pewnością ≥ 0,9 bez Discorda, P1 / bezpieczeństwo / zamknięte dodatkowo na #admin.
Jev nie pisze tekstu, więc `summary_pl` i `action` na razie pomijamy. Kod: `bin/jev.mjs`, `reports-relay.mjs`, `contact-relay.mjs`.

**Cel:** JP nie czyta każdego zgłoszenia. AI sortuje, łączy duplikaty i kieruje sprawę tam, gdzie zostanie naprawiona.
Do JP trafia tylko to, co wymaga jego decyzji, oraz piątkowe podsumowanie.

## 1. Co wchodzi

| Źródło | Tabela | Dziś |
|---|---|---|
| Zgłoszenie błędu przy przystanku („Zgłoś”) | `ops.reports` | typ wybrany przez użytkownika + opis, idzie na Discord |
| Opinia o wycieczce z komentarzem | `ops.ratings` | gwiazdki + komentarz, idzie na Discord |
| (od etapu B) to samo od zalogowanych | j.w. + `account_id` | — |

## 2. Przebieg (Hermes, co 15 minut)

```
nowe zgłoszenie
  → 1. filtr bez AI: duplikat 1:1, sam link, < 5 znaków, limit z IP     → spam (bez AI)
  → 2. klasyfikacja AI (tani model)                                      → JSON wg §3
  → 3. łączenie: ten sam przystanek + ta sama kategoria w 7 dni         → jedna sprawa, licznik
  → 4. kierowanie wg §4
  → 5. zamknięcie: status + wersja wycieczki z poprawką
```

- **Model:** Jev (TypeSafe, `jev-latest`, wejście 0,042 $ / 1 mln tokenów, decyzje z listy z pewnością); wcześniej planowany Qwen przez OpenRouter. Przy pewności < 0,7 albo
  kategorii P1 druga opinia mocniejszego modelu. Wolumen jest mały (kilkadziesiąt dziennie po starcie), koszt pomijalny.
- **Do modelu idzie tylko tekst zgłoszenia + nazwa miasta i przystanku + fragment opisu przystanku.**
  Bez identyfikatorów urządzenia, IP i konta.
- **Treść zgłoszenia to dane, nie polecenia.** Prompt każe zwrócić wyłącznie JSON według schematu. Wynik spoza schematu
  albo z „poleceniami” trafia do kolejki ręcznej.

## 3. Wynik klasyfikacji (JSON)

| Pole | Wartości |
|---|---|
| `category` | `fakt_cena`, `fakt_godziny`, `fakt_zamkniete`, `fakt_adres`, `fakt_opis`, `trasa_dojscie`, `misja_dziecko`, `tlumaczenie`, `strona_blad`, `bezpieczenstwo`, `pochwala`, `sugestia`, `spam` |
| `priority` | `1` pilne (zamknięte na stałe, niebezpieczne miejsce, strona nie działa), `2` błąd w treści, `3` sugestia/pochwała |
| `stop_number` | przystanek, którego dotyczy (albo `null`) |
| `summary_pl` | jedno zdanie po polsku (zgłoszenia przychodzą w 17 językach) |
| `action` | `weryfikuj_fakt`, `popraw_tekst`, `do_tablicy`, `alert`, `archiwum` |
| `confidence` | 0–1 |

## 4. Kierowanie

| Kategoria | Co się dzieje | Kto decyduje |
|---|---|---|
| `fakt_*` | Hermes sprawdza źródło (oficjalna strona, Google Places). Potwierdzone → szkic poprawki wycieczki z notatką „ze zgłoszenia #id”. Niepotwierdzone → archiwum z adnotacją. | JP zatwierdza szkic w panelu |
| `trasa_dojscie`, `misja_dziecko`, `tlumaczenie` | Uwaga redakcyjna do najbliższej poprawki trasy (ten sam tor co uwagi z panelu szkiców) | JP zatwierdza szkic |
| `strona_blad` | Punkt na tablicy uwag JP (obszar „Strona”), priorytet z klasyfikacji | Claude naprawia, JP widzi na tablicy |
| `bezpieczenstwo`, każde P1 | Natychmiast wiadomość na #alerty (przystanek, streszczenie, link) | JP |
| `pochwala`, `sugestia` | Archiwum; pochwały zbierane do podsumowania, sugestie raz w tygodniu jako lista | JP w piątek |
| `spam` (pewność ≥ 0,9) | Ukryte, liczone w podsumowaniu | — |
| pewność < 0,7 | Kolejka „do przejrzenia” na #admin z proponowaną kategorią | JP jednym kliknięciem/odpowiedzią |

**Łączenie spraw:** 3+ zgłoszenia tego samego przystanku i kategorii w 7 dni podnoszą priorytet o jeden stopień.

## 5. Zmiany w bazie (SQL po approve JP)

`ops.reports` i `ops.ratings`: kolumny `ai_category text`, `ai_priority smallint`, `ai_confidence real`,
`ai_summary text`, `ai_action text`, `case_id bigint` (wspólna sprawa), `ai_model text`, `classified_at timestamptz`,
`resolved_in_version int`. Status rozszerzony o `spam`, `review` (do przejrzenia), `done`, `rejected`.
Widok `admin.cases` — sprawy z licznikiem zgłoszeń, do zakładki w panelu admina.

## 6. Kontrola jakości

- Gdy JP zmieni kategorię w kolejce ręcznej, zapisujemy to jako przykład; najnowsze 20 przykładów idzie do promptu.
- Raz w miesiącu: 20 losowych zgłoszeń sprawdzonych ręcznie → trafność w %. Poniżej 85% → zmiana promptu albo modelu.
- Piątkowe podsumowanie na tablicy uwag dostaje sekcję „Zgłoszenia”: liczby per kategoria, ile poprawek weszło, ile spamu.

## 7. Kolejność wdrożenia

1. SQL z §5 + klasyfikacja i zapis wyniku (bez kierowania) — tydzień obserwacji, czy kategorie się zgadzają.
2. Kierowanie: `alert`, `do_tablicy`, kolejka ręczna.
3. Weryfikacja faktów i szkice poprawek ze zgłoszeń.
4. Od startu kont: zgłoszenia i opinie tylko po zalogowaniu (pomysł JP 16.10), `account_id` zamiast `client_id`.
