# Umiejętności Claude dla wycieczek Quolino (VPS)

Źródło prawdy dla zasad pisania: `../TRIP-WRITING-SKILL.md` (JP). Ten katalog to wersja wykonywalna.

| Element | Rola |
|---|---|
| `quolino-trip-writing/` | umiejętność: jak mają powstawać opisy (tryb A) i jak je sprawdzać (tryb B) |
| `quolino-trip-writing/scripts/validate_trip.py` | walidator mechaniczny wg nowych zasad (bez limitu 2–4 akapitów) |
| `quolino-trip-translate/` | umiejętność: tłumaczenie zatwierdzonej wycieczki PL → EN → pozostałe |
| `quolino-trip-translate/scripts/check_translation.py` | kontrola tłumaczenia przed zapisem do bazy |
| `bin/trip-review.mjs` | sprawdzenie opisu: walidator + ocena Claude (z weryfikacją faktów w sieci) → raport JSON |
| `bin/trip-translate.mjs` | tłumaczenie po akceptacji: eksport z bazy → Claude → kontrola → zapis → wersja |
| `sql/trip-translate.sql` | `trip_export`, `trip_apply_translation`, zlecenie tłumaczenia przy akceptacji w panelu |
| `bin/trip-draft.mjs` | nowa wycieczka w rozmowie: research (Claude + sieć) → GPT pisze → kontrola → szkic + link podglądu |
| `bin/trip-revise.mjs` | poprawki szkicu według rozmowy (`--say`), przywrócenie wersji (`--restore N`), stan (`--show`) |
| `bin/trip-approve.mjs` | decyzja JP: publikacja (+ zlecenie tłumaczenia) albo odrzucenie szkicu |
| `bin/draft-lib.mjs` | operacje na szkicu (ścieżki pól), zapis wersji, powiadomienia w wątku Discorda |
| `sql/trip-drafts.sql` | `trip_draft_save` (szkic bez ruszania strony), `draft_preview` (podgląd z kluczem), historia zmian |
| `install.sh` | kopiuje to do kontenera Hermesa (`~/.claude/skills`, `/opt/data/quolino`) |

Na VPS (kontener Hermesa):
```
node /opt/data/quolino/trip-review.mjs <katalog miasta>      # po otrzymaniu opisu
node /opt/data/quolino/trip-translate.mjs <slug>              # po akceptacji (pl → en → reszta)
node /opt/data/quolino/trip-translate.mjs <slug> --langs de   # jeden język z istniejącego EN
```
Claude pracuje tu bez narzędzi zapisu — tylko odpowiada; do bazy zapisuje skrypt po kontroli.

Podgląd szkicu: `city.html?draft=<klucz>` (fiszka SZKIC, historia poprawek: `&historia`, starsza wersja: `&v=N`).
Klucz jest jeden na miasto i nie zmienia się między poprawkami. Bez klucza szkicu nie widać.
