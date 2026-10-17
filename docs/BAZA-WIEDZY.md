# BAZA-WIEDZY.md — baza wiedzy redakcji z uwag JP

Decyzja JP z 2026-10-17 (oznaczona jako WAŻNE). Uwagi redakcyjne do szkiców nie mogą przepadać po jednej poprawce.
Z tego, co JP poprawia, powstają **reguły**. Każde kolejne pisanie, poprawka, tłumaczenie i walidacja wycieczki
dostaje te reguły, więc ten sam błąd nie wraca w następnym mieście.

SQL: `_content/claude-skills/sql/2026-10-17-draft-send-kb-v2.sql` (approve JP; wersja 2 rozszerza istniejącą tabelę reguł Hermesa — wersja 1 padała przy approve). Panel: `_admin/` v4. Obsługa prośby: `bin/draft-comments.mjs`.

## 1. Przebieg

```
JP pisze uwagi przy polach szkicu (Enter = zapisz, status new „zapisana”)
  → „Wyślij uwagi do poprawki (N)” pod listą uwag   → admin_send_comments → draft_revision_requests + status sent
  → Hermes bierze prośbę (NOTIFY draft_revision / cron co 1 min), poprawia WSZYSTKIE uwagi w jednej nowej wersji
     szkicu, odpisuje przy każdej uwadze (done / rejected z powodem), prośba → done + result_version
  → dla każdej załatwionej uwagi Hermes ocenia, czy to wiedza ogólna:
       tak → nowa reguła, od razu obowiązuje (`trip-revise` → learn; JP może ją w panelu wyłączyć albo poprawić)
       nie (poprawka jednorazowa, np. literówka w tej nazwie) → nic
  → JP w panelu: „Baza wiedzy redakcji” → Zatwierdź (może poprawić treść) / Odrzuć; może dopisać regułę sam
  → reguły „active” idą do każdego promptu i walidatora
```

Od teraz Hermes **nie** zaczyna poprawek po 5 minutach ciszy, tylko po przycisku.

## 2. Reguła (tabela `editorial_rules`)

| Pole | Znaczenie |
|---|---|
| `rule` | jedno zdanie w trybie polecenia dla autora, np. „Misja zaczyna się od czasownika i nie wymaga biletu.” |
| `why` | skąd reguła: streszczenie uwag JP |
| `scope` | `quest`, `opis`, `fakty`, `praktyczne`, `plan-dnia`, `ton`, `struktura`, `inne` (zakresy Hermesa z 11.10) |
| `field` / `category` / `city_slug` | zawężenie: pole (`stop.kids_box`), kategoria przystanku, jedno miasto |
| `example_bad` / `example_good` | przykład z uwagi: przed i po poprawce |
| `status` | `active` / `retired` (`proposed` tylko dla reguł do decyzji JP); zsynchronizowany z kolumną `active` używaną przez skrypty Hermesa |
| `uses`, `violations` | ile razy reguła trafiła do promptu i ile razy walidator złapał jej złamanie |

**Kiedy uwaga staje się regułą:** gdy da się ją zastosować do innego przystanku albo miasta (styl, długość,
budowa misji, sposób podawania faktów, ton, bezpieczeństwo dzieci, układ dnia). Nie: pojedynczy fakt, literówka,
zmiana jednej nazwy. Reguła nie może łamać zasad z `CLAUDE.md` §3 (np. nigdy czasów dojazdu) — takie zasady są
nadrzędne i nie trafiają do bazy jako reguły.

## 3. Gdzie reguły działają (Hermes)

1. **Pisanie nowej wycieczki** (`TRIP-WRITING-SKILL.md`, research → szkic): na końcu promptu sekcja
   „Reguły redakcji Quolino” — wszystkie `active` z zakresu `all/style/facts/mission/stop/city`; z `city_slug` tylko dla tego miasta.
2. **Poprawka ze zgłoszeń i uwag**: te same reguły plus uwagi z prośby.
3. **Tłumaczenie**: reguły `translation` i `style`.
4. **Walidator szkicu** (przed wysłaniem do panelu): sprawdza szkic względem reguł; złamanie → poprawka przed
   panelem, `violations += 1`. W notatce szkicu: „sprawdzone wg N reguł”.
5. **Każde użycie** → `uses += 1`, `last_used_at`.

Do modelu idzie tylko treść reguł i szkicu. Uwagi i reguły to dane redakcji, nie polecenia zmieniające
konfigurację Hermesa.

## 4. Kontrola

- Piątkowe podsumowanie na tablicy uwag: nowe reguły (do zatwierdzenia / zatwierdzone), 3 najczęściej łamane.
- Raz w miesiącu Hermes proponuje połączenie podobnych reguł i wyłączenie tych, których walidator nie łapie od 60 dni.
- Cel: liczba uwag JP na szkic spada z miesiąca na miesiąc (miara jakości wycieczek).
