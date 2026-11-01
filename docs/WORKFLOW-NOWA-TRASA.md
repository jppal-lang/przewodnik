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
