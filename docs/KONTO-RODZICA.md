# KONTO-RODZICA.md — panel rodzica, album, wyzwania, kody, nagrody dziecka

Decyzje JP 2026-10-16. Status: frontend gotowy na danych z urządzenia (`konto.html`, `kid-reward.js`),
backend do zrobienia przed kamieniem milowym **1 czerwca 2027** (`docs/PM.md` §0).

**Zasada danych (JP): poza adresem e-mail nie przechowujemy danych osobowych.** Ksywki i awatary dzieci,
postęp misji i zdjęcia zostają w telefonie. Na serwerze jest tylko e-mail i to, co bez niego nie działa
(odblokowane i zdobyte wycieczki, kody) — bez imion, wieku, zdjęć, lokalizacji.

## 1. Co już działa (bez kont)

| Funkcja | Gdzie | Dane (localStorage) |
|---|---|---|
| Rodzic zatwierdza trasę przed QR (przełączniki przystanków) | `city.html`, zakładka QR | parametr `hide=`; pod kodem: „Dziecko dostanie N przystanków z misjami — obrazek podzieli się na N kawałków” |
| Awatar dziecka na dzień (8 póz Quo + kolor + ksywka, przycisk 🎲, podpowiedź „nie wpisuj prawdziwego imienia”) | `kid-reward.js` po `?view=kid` | `qc.kid.avatar` `{date,pose,color,nick}`, `qc.kid.nicks` (max 8) |
| Obrazek-zagadka: hero pod N kawałkami, każda zaliczona misja odsłania kawałek | `kid-reward.js` | liczone z `is-collected` |
| Po ostatniej misji: pobranie obrazka i kolorowanka A4 | `kid-reward.js` | kolorowanka z `<hero>-coloring.webp`, gdy jest; inaczej kontury z przeglądarki |
| Panel: zakładki Album · Wyzwania · Dzieci · Plan i kody · Prywatność | `konto.html` | `qc.album`, `qc.parent.shared` (slugi), `qc.parent.news`, `qc.parent.codes` (tylko podgląd) |

Gdy album na urządzeniu jest pusty (albo `?demo=1`), `konto.html` pokazuje przykładowe dane z paskiem „Podgląd”.
W podglądzie działa kod testowy `QUO-TEST-MAMA`.

Klucze localStorage do listy w `docs/BACKEND.md` §6: `qc.kid.avatar`, `qc.kid.nicks`, `qc.album`, `qc.parent.shared`,
`qc.parent.news`, `qc.parent.codes`, a w panelu admina `adm.outbox`.

## 2. Wyzwania i kody

- **Wyzwanie główne:** 5 udostępnionych wycieczek (każde miasto liczy się raz) → kod **−5%** na kolejny zakup.
  Udostępnienie = kliknięcie w panelu w Facebook / WhatsApp / Pobierz obrazek / Kopiuj tekst albo udany `navigator.share`.
  Nie sprawdzamy, czy post naprawdę się ukazał (bez śledzenia).
- **Odznaki bez rabatu:** Podróżnik (2 regiony), Złoty Quo (10 miejsc).
- **Kody** `QUO-XXXX-XXXX` (alfabet bez 0/O/1/I): `free_trip` (1 miasto do wyboru) albo `discount` (%). Źródła: wyzwanie,
  kampanie, partnerzy i influencerzy (MARKETING), ręcznie przez Hermesa na prośbę JP.

## 3. Backend (etap B/C) — kontrakt

- `accounts (id, email, created_at, login_methods)` — jedyna dana osobowa: e-mail.
- `entitlements (account_id, city_slug | pass, valid_until, source: purchase|free|code)` — co jest odblokowane.
- `album (account_id, city_slug, pieces, completed_at)` — **bez ksywki dziecka**; ksywka i awatar zostają w telefonie.
- `trip_runs (id, account_id, city_slug, city_version, stops jsonb, pieces, kid_token, expires_at)` — tworzone przy generowaniu QR;
  `pieces` = liczba przystanków z misjami po odznaczeniu. Link QR niesie `kid_token` (losowy, min. 128 bitów, ważny do końca dnia).
- `trip_progress (run_id, stop_key, done_at)` — widok dziecka zgłasza zaliczenia tokenem, bez konta dziecka i bez ksywki.
- `shares (account_id, city_slug, channel, created_at)` — tylko kliknięcia w panelu, do wyzwania.
- `promo_codes (code, kind, value, max_uses, used, expires_at, campaign)`, `redemptions (account_id, code, at)`;
  `POST /rpc/redeem_code {code}` z limitem prób na konto i IP (ochrona przed zgadywaniem).
- Kod rabatowy przekazujemy operatorowi płatności przy zakupie (Dodo discount codes).
- Migracja: po pierwszym zalogowaniu panel proponuje przeniesienie lokalnego `qc.album` (miasto + data) na konto.

## 4. Do decyzji JP

- Progi odznak i ewentualne dodatkowe nagrody.
- Czy kolorowanki robimy jako osobne grafiki (`-coloring.webp`) dla każdego miasta.
- Animacja odsłonięcia całego obrazka.
