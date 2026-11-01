# Nowa trasa — trzy drogi do kolejki (JP 2026-11-01)

> JP: „kiedy zaczynasz pracę nad kolejną wycieczką?” — od dziś trasę startuje się bez konsoli.

Każda droga kończy się **tym samym wierszem w `ops.jobs`**: `kind = 'draft'`, `worker = 'gemini'`, `status = 'queued'`,
`request = {"name","region","country","duration","brief","fresh"}`. Nic więcej się nie dzieje od razu: `gemini-queue.mjs`
(cron co 10 min, jedno miasto naraz) podejmuje zadanie przy najbliższym przebiegu i uruchamia `gemini-draft.mjs`
(research Gemini → szkic → kontrola Claude → szkic do akceptacji JP w panelu). Jedno miasto trwa ok. 1 h.

Koszt: ≈ 20–40 wywołań Antigravity z abonamentu AI Pro (ok. 15–25 % tygodniowego limitu), 0 $ z płatnych API.
Przy wyczerpanym limicie zadanie czeka w kolejce i rusza samo po odnowieniu.

Zasady wspólne (pilnowane w bazie, w skrypcie i w oknie panelu):
- slug `^[a-z0-9][a-z0-9-]{1,62}$`, z polskiej nazwy bez znaków diakrytycznych (Asyż → `asyz`, Rawenna → `rawenna`);
- region = `public.regions.slug` (Marche ≠ Umbria ≠ Emilia-Romagna), kraj dwuliterowy (`it`);
- `duration`: `half_day` (domyślnie) albo `full_day`;
- `fresh: true` = od zera, bez wznawiania przerwanego przebiegu — dla miast, które już są w bazie (stara trasa trafia do archiwum);
- to samo miasto z zadaniem `queued`/`running` → odmowa (nic się nie dubluje).

## 1. Panel (JP) — `admin.quolino.com` → Trasy albo Pulpit → **„+ Nowa trasa”**

Okno: nazwa (PL) → slug (auto, edytowalny), kraj (domyślnie Włochy), region kraju, czas, „życzenia do trasy” (brief),
„od zera (fresh)” — zaznaczone samo, gdy miasto już jest w bazie. Pokazuje szacunek kosztu i bieżące zużycie limitu.
„Zleć” → `POST /api/rpc/admin_trip_enqueue` → komunikat „W kolejce jako #id” z linkiem do Pipeline.
Przy starych trasach (stare wytyczne) przycisk **„Przepisz od zera”** otwiera to samo okno z wypełnionymi polami.
Wymaga wdrożenia SQL `_content/claude-skills/sql/2026-11-01-nowa-trasa.sql` (funkcja `admin.admin_trip_enqueue`, widok `admin.regions`).
Tryb `?demo=1`: zlecenie udawane.

## 2. Zlecenie z repo (Claude, gdy JP powie w czacie „zrób Asyż”)

Plik `_content/jobs/<data>-<slug>-nowa-trasa.json` (wykonuje `repo-jobs.mjs` przy najbliższym przebiegu crona, raz).
Skrypt `trip-enqueue.mjs` jest na białej liście jako **kosztowny** — zlecenie musi nieść `jp_ok` z datą i dosłownymi słowami JP
(nie starsze niż 3 dni), inaczej serwer je odrzuci.

```json
{
 "script": "trip-enqueue.mjs",
 "args": ["asyz", "--name", "Asyż", "--region", "umbria", "--country", "it", "--duration", "full_day", "--fresh",
          "--brief", "trasa od zera w nowym procesie; rodzina z dziećmi, start z parkingu, bez czasów dojazdu"],
 "why": "JP wybrał Asyż jako następną trasę (2026-11-01). Skrypt tylko dopisuje zadanie do kolejki ops.jobs; samą trasę zrobi gemini-queue.mjs.",
 "title": "Nowa trasa: Asyż (od zera, cały dzień)",
 "est_usd": 0,
 "est_limit": "≈20–40 wywołań Antigravity (AI Pro)",
 "jp_ok": {"date": "2026-11-01", "quote": "Asyż"},
 "by": "Claude",
 "timeout_min": 10
}
```

Składnia skryptu: `node trip-enqueue.mjs <slug> --name "Nazwa" --region <region_slug> [--country it] [--duration half_day|full_day] [--brief "…"] [--fresh] [--dry]`.
Idempotentny: gdy miasto ma już zadanie `queued`/`running`, wypisuje jego numer i kończy kodem 0.
Przykład na żywo: `_content/jobs/2026-11-01-asyz-nowa-trasa.json`.

## 3. Konsola na serwerze (Hermes w wątku miasta albo JP) — droga awaryjna

```bash
cd /opt/data/quolino && node qdb.mjs job-add asyz draft gemini '{"name":"Asyż","region":"umbria","country":"it","duration":"full_day","brief":"…","fresh":true}'
```

Stan kolejki: `node qdb.mjs jobs` albo panel → Pipeline. Testy: `sh _content/claude-skills/bin/test-all.sh`
(`trip-enqueue.test.mjs`) i Playwright `node _content/claude-skills/test/nowa-trasa-pw.mjs`.

## 4. Automatycznie po publikacji — następna trasa z planu regionu (JP 2026-11-01)

> JP: „Opublikowanie wyzwala następną trasę, kolejność wg najbardziej popularnych miejsc w danym regionie.”

**Gdzie wpięte:** w funkcji zatwierdzania `admin.admin_approve` (SQL `_content/claude-skills/sql/2026-11-01-publikacja-bramka.sql`),
**po** udanej publikacji, w tej samej transakcji. Dlaczego tu, a nie w `gemini-queue.mjs`: jedno miejsce, które wie, *że* i *co*
opublikowano (region z `content.city.region_slug`), blokada doradcza na mieście (dwa kliknięcia nie zrobią dwóch zadań), a panel od razu
dostaje odpowiedź „następna trasa: X — zadanie #N”. Kolejkowanie idzie **tą samą ścieżką co „+ Nowa trasa”** —
`admin.admin_trip_enqueue` (te same walidacje, ten sam wiersz `ops.jobs` draft/gemini). Błąd kolejkowania **nie cofa publikacji**
(trafia do wyniku jako `next_error` i do komunikatu w panelu). Brief pusty — pole „życzenia do trasy” idzie do modelu jako polecenie.

**Plan:** `_content/claude-skills/bin/trip-plan.mjs` — lista redakcyjna miast per region w kolejności popularności (edytowalna, z
komentarzem), kolejność regionów Umbria → Marche → Emilia-Romagna. Kopia w bazie: `ops.trip_plan` (+ `ops.trip_plan_regions`);
po zmianie listy w pliku: `node trip-plan.mjs --sync` na serwerze (test `trip-plan.test.mjs` pilnuje, że lista w SQL = lista w pliku).
Podgląd stanu: `node trip-plan.mjs` (co opublikowane, co w kolejce, co następne), `node trip-plan.mjs --next umbria`;
w panelu/API: `POST /api/rpc/admin_trip_next {p_region}`.

**Wybór następnego miasta** (`admin.trip_next(region, pomiń)` = `pickNext()` w trip-plan.mjs): pierwsze miasto z planu regionu, które
- nie jest opublikowane w nowym procesie (`content.workflow = 'v2'` albo wytyczne > v01),
- nie ma szkicu w toku,
- nie ma żadnego zadania draft/gemini w `ops.jobs` (queued/running = już w kolejce, np. Asyż zlecony 2026-11-01; done/failed = powtórkę
  decyduje JP przyciskiem „+ Nowa trasa”),
- nie jest właśnie opublikowaną trasą, a jego region istnieje w `public.regions`.

Region wyczerpany → następny wg kolejności, na końcu wcześniejsze; cały plan wyczerpany → nic (panel: „plan regionu wyczerpany”).
Miasto ze starą trasą w bazie → `fresh: true` (od zera). `gemini-queue.mjs` bierze jedno miasto naraz i wstrzymuje nowe trasy przy
≥ 90 % tygodniowego limitu Antigravity — łańcuch publikacji nie przeciąży abonamentu.

## 5. Bramka publikacji i tłumaczenia (JP 2026-11-01)

> JP: „Tłumaczenia mają ruszyć po tym jak kliknę zatwierdź i opublikuj. Jak są nierozstrzygnięte flagi muszę mieć zablokowaną możliwość
> publikacji; jak już wyślę poprawki, to też jeszcze nie — dopiero jak wszystkie flagi będą zielone możesz odblokować przycisk opublikuj.”

„Zatwierdź i opublikuj” jest nieaktywny, a pod nim stoi powód, dopóki: są flagi kontroli bez odpowiedzi; są uwagi niewysłane albo bez
przystanku; prośba o poprawkę jest w toku / nieudana; ostatnia poprawka nie przeszła weryfikacji (`verify.ready` — częściowo, nie
naniesione, nowe błędy, ocena wstępna); walidator ma błędy, których odpowiedzi Hermes jeszcze nie rozpatrzył. Reguły:
`_admin/publish-gate.js` (panel, test `publish-gate.test.mjs`) = `admin.publish_gate()` w SQL — serwer odmawia publikacji tak samo
(bez obejścia „mimo to”). „Gotowość do publikacji” pokazuje pierwszą pozycję „Publikacja” z listą tego, co blokuje.

Publikacja = zgoda JP na koszt tłumaczeń tej trasy: `admin_approve` kolejkuje tłumaczenie jak dotąd (`ops.jobs` kind translate →
`translate-queue.mjs`: najpierw EN, potem reszta) i zapisuje decyzję w `ops.cost_requests` (status `approved`, „JP (publikacja)”,
szacunek z `public.ai_usage`, bez danych 0,50 USD = dzienny limit płatnych modeli). Potwierdzenie w panelu pokazuje szacunek,
wynik: „Opublikowano vN · tłumaczenia w kolejce · następna trasa: <miasto>”. Test przeglądarkowy: `node _content/claude-skills/test/publikacja-pw.mjs`.
