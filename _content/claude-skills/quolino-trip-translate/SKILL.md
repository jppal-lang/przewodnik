---
name: quolino-trip-translate
description: Tłumaczenie zatwierdzonych wycieczek Quolino — najpierw z polskiego na angielski, potem z angielskiego na pozostałe języki strony. Używaj ZAWSZE, gdy tłumaczysz wycieczkę, przystanek, quest, plan dnia albo punkty awaryjne Quolino.
---

# Wycieczki Quolino — tłumaczenie

Tłumaczymy **wyłącznie wycieczkę zatwierdzoną przez JP** (wersja `published` w bazie).
Szkiców nie tłumaczymy — każda poprawka polskiego unieważniłaby kilkanaście tłumaczeń.

## Kolejność (decyzja JP 2026-10-07)

1. **PL → EN.** Angielski jest wersją kontrolną.
2. **EN → każdy kolejny język** (cs, da, de, es, fr, hr, hu, it, nl, no, pt, ro, sk, sv, uk).
   Źródłem jest angielski; polski dostajesz obok jako odniesienie znaczeniowe — gdy angielski
   jest dwuznaczny, rozstrzyga polski.

Skrypt na VPS robi to sam: `node /opt/data/quolino/trip-translate.mjs <slug>`
(eksport z bazy → tłumaczenie → kontrola `check_translation.py` → zapis do bazy → wpis w historii wersji).

## Format wymiany

Dostajesz i oddajesz ten sam JSON (eksport `trip_export(slug, lang)`):

```json
{"city_slug": "spello", "lang": "en",
 "city": {"title", "region_label", "subtitle", "lead", "good_to_know", "hero_note", "local_food"},
 "stops": [{"stop_key", "stop_number", "category", "name", "desc_paragraphs": [], "kids_box",
            "photo_task", "hint", "local_flavor", "dress_code", "practical_note"}],
 "day_plan": [{"sort_order", "time_label", "stop_key", "description"}],
 "emergency_points": [{"sort_order", "type", "maps_query", "label", "description"}]}
```

Odpowiadasz **wyłącznie JSON-em** w tym kształcie, z `lang` ustawionym na język docelowy.

## Twarde zasady (z TRIP-WRITING-SKILL.md JP)

- **Te same klucze, ta sama kolejność, ta sama liczba elementów.** Nie dodawaj, nie usuwaj,
  nie łącz i nie dziel punktów.
- **Ta sama liczba akapitów** w `desc_paragraphs` co w źródle. Akapit = akapit.
- **`null` zostaje `null`.** Nie uzupełniaj pustych pól.
- **Bez zmian** (kopiuj dosłownie): `stop_key`, `stop_number`, `category`, `sort_order`,
  `time_label`, `type`, `maps_query`, ceny, godziny, daty, liczby, telefony, linki, kody,
  waluty i ich zapis.
- **Nazwy własne w oryginale**: zabytki, kościoły, restauracje, ulice, place, bramy
  (`Porta Consolare`, `Piazza della Repubblica`, `Osteria del Buchetto`). Tłumaczysz tylko
  opisowe części nazw: „Kolacja przy Corso Vannucci” → „Dinner on Corso Vannucci”.
- **`_notes` nigdy nie są tłumaczone** i nie trafiają do wyniku.
- **Bez emoji, bez wersalików** w nazwach (wielkość liter ustawia CSS).
- **Legenda zostaje legendą**: zachowaj oznaczenie, co jest faktem historycznym, a co
  legendą/tradycją. Nie wzmacniaj ani nie osłabiaj pewności źródła.
- **Zero kilometrów i czasów dojazdu** — także jeśli w danym języku tak się zwyczajowo pisze.
- **Nie dopisuj faktów.** Tłumaczysz, nie redagujesz. Błąd merytoryczny w źródle → zostaw
  treść, zgłoś w osobnym polu `"_translator_notes": ["…"]` (skrypt je zapisze, nie opublikuje).

## Styl

- **Rodzic** (`lead`, `desc_paragraphs`, `good_to_know`, `local_food`, `practical_note`):
  rzeczowo, ciepło, naturalnie w języku docelowym — jak dobry przewodnik w tym kraju, nie kalka.
  Zasada zagranicznego turysty obowiązuje dalej: wyjaśnienia świętych, artystów, terminów
  zostają; termin architektoniczny podaj w formie przyjętej w języku docelowym.
- **Dziecko** (`kids_box`, `hint`, `photo_task`): druga osoba, krótkie zdania, ciekawie dla
  9-latka i nieinfantylnie dla 15-latka. **Zadanie ma być to samo** — co policzyć, znaleźć,
  sfotografować; zmieniasz język, nie mechanikę questu.
- Liczby mnogie, formy grzecznościowe i cudzysłowy według zasad danego języka.

## Kontrola

Przed oddaniem sprawdź sam, a skrypt sprawdzi ponownie:

```bash
python3 ~/.claude/skills/quolino-trip-translate/scripts/check_translation.py <źródło.json> <tłumaczenie.json>
```

Kilka drobnych błędów (do 6) poprawia Claude w samych wskazanych polach; więcej albo błąd
struktury = tłumaczenie ponowione innym modelem z listą błędów.

## Kontrola jakości (Claude, decyzja JP 2026-10-08)

Tłumaczą darmowe modele (OpenRouter), jakość sprawdza Claude (subskrypcja):

| Zadanie | Modele (kolejność) | Kontrola Claude |
|---|---|---|
| PL → EN | Nemotron 3 Ultra → DeepSeek → Qwen → Gemma 4 31B → … | **pełna**: każde pole vs oryginał, poprawki `fixes` nanoszone od razu, ocena 1–5 |
| EN → pozostałe | Gemma 4 31B → Gemma 4 → Nemotron 3 Ultra → Qwen → … | **próbka**: lead miasta + 2 losowe przystanki; ocena < 4 → ponowne tłumaczenie z uwagami; druga porażka = język nie trafia na stronę |

- Gdy Claude jest niedostępny (limit sesji), nic nie trafia na stronę; tłumaczenie czeka w
  `work/translate/<slug>/<lang>.json` i jest użyte przy kolejnym uruchomieniu.
- Oceny: `public.translation_quality` (panel admina: `admin.translation_quality`).
- Wymuszenie modelu: `QUOLINO_MODEL_TRANSLATE_EN=…` / `QUOLINO_MODEL_TRANSLATE_XX=…`.
- Inkling (Thinking Machines) odrzuca zapytania spoza aplikacji agentowych (403) — pominięty.

Jako kontroler odpowiadasz wyłącznie JSON-em w formacie podanym w poleceniu. Poprawiasz tylko
to, co błędne lub nienaturalne; nie przepisujesz dobrych zdań po swojemu.
