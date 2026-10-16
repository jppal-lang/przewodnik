# KONTO-RODZICA.md — panel rodzica, album, wyzwania, nagrody dziecka

Decyzja JP 2026-10-16. Status: frontend gotowy na danych z urządzenia (`konto.html`, `kid-reward.js`),
backend do zrobienia w etapach B/C (`docs/DOSTEP-I-KONTA.md` §6).

## 1. Co już działa (bez kont)

| Funkcja | Gdzie | Dane |
|---|---|---|
| Rodzic zatwierdza trasę przed QR (przełączniki przystanków) | `city.html`, zakładka QR | parametr `hide=` w linku QR; pod kodem: „Dziecko dostanie N przystanków z misjami — obrazek podzieli się na N kawałków” |
| Awatar dziecka na dzień (8 póz Quo + kolor + opcjonalny nick) | `kid-reward.js`, po wejściu z `?view=kid` | `qc.kid.avatar` `{date,pose,color,nick}`, `qc.kid.nicks` (max 8) |
| Obrazek-zagadka: hero miasta pod N kawałkami, każda zaliczona misja odsłania kawałek | `kid-reward.js` | liczy z klas `is-collected` (te same reguły co album naklejek) |
| Po ostatniej misji: pobranie obrazka (PNG z ramką, awatarem, datą) i kolorowanka A4 | `kid-reward.js` | kolorowanka: plik `<hero>-coloring.webp`, gdy jest; inaczej kontury liczone w przeglądarce |
| Album zdobytych miejsc, nicki dzieci, wyzwania, udostępnianie, eksport JSON | `konto.html` | `qc.album`, `qc.parent.shares`, `qc.parent.news` |

Gdy album na urządzeniu jest pusty (albo `?demo=1`), `konto.html` pokazuje przykładowe dane z paskiem „Podgląd”.

Nowe klucze localStorage (dopisać do listy w `docs/BACKEND.md` §6): `qc.kid.avatar`, `qc.kid.nicks`, `qc.album`,
`qc.parent.shares`, `qc.parent.news`; w panelu admina `adm.outbox`.

## 2. Backend (etap B/C) — kontrakt

- `accounts` — jak w DOSTEP-I-KONTA §5 (e-mail, sposoby logowania, bez imion).
- `kid_profiles (id, account_id, nick, pose, color, created_at)` — tylko pseudonimy.
- `trip_runs (id, account_id, city_slug, city_version, stops jsonb, pieces int, kid_token, created_at, expires_at)` — tworzone,
  gdy rodzic generuje QR; `pieces` = liczba przystanków z misjami po odznaczeniu (to „liczba, która jest nam potrzebna”).
  Link QR niesie `kid_token` zamiast `hide=`.
- `trip_progress (run_id, stop_key, done_at)` — widok dziecka wysyła zaliczenia z tokenem (bez konta dziecka).
- `album (account_id, city_slug, kid_profile_id, run_id, pieces, completed_at)` — wpis powstaje, gdy `trip_progress` obejmie wszystkie przystanki.
- `shares (account_id, channel, created_at)` — licznik do wyzwań (bez śledzenia, tylko kliknięcia w panelu).
- `challenges` — konfiguracja progów i nagród; `rewards (account_id, challenge_id, code, used_at)` — kody rabatowe operatora płatności (Dodo).
- Migracja: po zalogowaniu panel wysyła lokalne `qc.album` i `qc.kid.nicks` na konto (jednorazowo, za zgodą).

## 3. Do decyzji JP

- Progi i nagrody wyzwań (dziś: 5 wycieczek → −10%, 3 udostępnienia → Ambasador i −10%, 2 regiony → odznaka, 10 wycieczek → −15%).
- Czy kolorowanki robimy jako osobne grafiki (Flow/Nano Banana, `-coloring.webp`) dla każdego miasta — jakość lepsza niż kontury z przeglądarki.
- Animacja odsłonięcia całego obrazka (wspomniana jako „może później”).
