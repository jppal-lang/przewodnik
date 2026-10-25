# TRESC-PRZYSTANKU.md — standard treści przystanku

Decyzje JP 2026-10-18. Dotyczy: Redakcja (research, pisanie), Backend (pola w bazie, dostęp), Frontend (bloki na stronie),
Hermes (proces szkiców). Zastępuje w tych punktach „szkielet opisu” z `quolino-trip-writing` i podział z `docs/DOSTEP-I-KONTA.md` §1.

---

## 1. Bloki przystanku

| Blok | Pole | Dla kogo | Widoczność |
|---|---|---|---|
| Opis | `desc_paragraphs[]` | rodzic | **publiczny** — ściąga ruch z wyszukiwarek |
| Legenda | `legend` | rodzic | po zalogowaniu (od 06.2027: po wykupieniu trasy) |
| Ciekawostka | `curiosity` | **rodzic** (2–4 zdania, zgłębiona) | po zalogowaniu (później: po wykupieniu) |
| W popkulturze | `pop_culture[]` | rodzic | po zalogowaniu (później: po wykupieniu) |
| Fun fact | `fun_fact` | **dziecko** — jedno zdanie „Czy wiesz, że…” | widok dziecka (trasa odblokowana) |
| Quest, wskazówka, zadanie foto | bez zmian | dziecko | bez zmian |
| Źródła i przypisy | `sources[]`, znaczniki `[n]` | **tylko redaktor i AI** | nigdy na stronie |

- **Opis** to tylko: hak, historia i ludzie, „Kim był/była…”, co oglądać (z dokładnym miejscem). Legenda, ciekawostka i
  popkultura **nie** wchodzą do opisu — mają własne bloki. Minimum głębokości opisu bez zmian (zabytek 4 akapity / 300 słów).
- Zalogowany dostaje **lepszą treść**, nie tę samą dłuższą: bloki 2–4 są wartością konta.
- **Bez powtórzeń między blokami.** Fakt stoi w jednym bloku. Jeśli opis wspomina ciekawostkę, legendę albo popkulturę
  (jedno zdanie-zapowiedź), odpowiedni blok jest jej **rozwinięciem** — nie powtarza zdania z opisu, tylko idzie dalej.
  Niezalogowany widzi zapowiedź, zalogowany zapowiedź i rozwinięcie.

### Widok wycieczki: zalogowany / niezalogowany

Podział ma być **jasny na pierwszy rzut oka**, bez mieszania bloków:
- **Niezalogowany:** opis przystanku (cały), a pod nim **jeden** wyraźny pas „Po zalogowaniu: legenda · ciekawostka ·
  w popkulturze” — z nazwami bloków, które przystanek naprawdę ma (stan `found`), bez treści i bez rozmytych podglądów.
- **Zalogowany:** pod opisem bloki Legenda / Ciekawostka / W popkulturze jako osobne, nazwane karty, zawsze w tej kolejności.
- Od 06.2027 ten sam podział, tylko warunkiem jest wykupiona trasa (`docs/KONTO-RODZICA.md` §4).
  Trasy darmowe dla wszystkich (`cities.access = 'free'`, np. Frasassi, Wieliczka) nie wymagają zakupu.
- Każdy blok ma **stan**: `found` (treść + przypisy) albo `none` z polem `checked` (gdzie szukano). Puste pole bez `checked`
  = błąd walidatora. Na stronie blok `none` się nie pokazuje.
- Wszystkie bloki tłumaczone na 17 języków; przypisy `[n]` przechodzą przez tłumaczenie bez zmian.

## 2. Pytania dla każdego przystanku (research)

Research odpowiada na **każde** pytanie: odpowiedź + przypis do źródła albo „brak — sprawdzono: gdzie”.
Dotyczy zabytków, kościołów, muzeów, zamków, domów, synagog; ulica, punkt widokowy, park — pytania 1–2 z każdej grupy.

**Legenda**
1. Czy z miejscem wiąże się legenda, cud, podanie ludowe? Kto, co się stało, jak się skończyło?
2. Czy na miejscu jest jej ślad (rzeźba, tablica, odcisk, nazwa ulicy)? Gdzie dokładnie?
3. Co o tym samym mówi historia (fakt oddzielony od legendy)?

**Ciekawostka (dla rodzica)**
1. Co zaskoczy dorosłego: dawna funkcja, zmiana przeznaczenia, nietypowe wydarzenie?
2. Jaki detal turyści zwykle mijają, nie zauważając?
3. Co tu zniknęło, zostało przeniesione, odnalezione albo odkryte przypadkiem?

**Fun fact (dla dziecka)**
1. Jaka liczba robi wrażenie (schody, wysokość, wiek, waga dzwonu)?
2. Co jest zabawne albo dziwne (zwierzę, przezwisko, zwyczaj)?

**W popkulturze**
1. Film lub serial kręcony tutaj — tytuł, rok, która scena?
2. Książka, piosenka, gra, obraz, w których miejsce występuje?
3. Znana osoba związana z miejscem — urodziła się, mieszkała, występowała?

## 3. Ciekawostka musi być zgłębiona

- Nie jednozdaniowy „fakt z listy”: **co, dlaczego, w jakim kontekście, gdzie to widać dziś**.
- **Ciekawostka i fun fact — „z przymrużeniem oka”** (decyzja JP 2026-10-24): wystarczy **jedno źródło** z przypisem; drugie
  potwierdzenie mile widziane — wtedy spokojnie przytoczyć. Od źródła zależy, czy warto je cytować: przy słabszym (blog, przewodnik,
  tradycja lokalna) tekst to mówi („podobno”, „mówi się”, „według miejscowych”). Brak drugiego źródła nie jest błędem.
- Superlatyw („najstarszy”, „jedyny”) w opisie i legendzie — **dwa niezależne źródła** albo konkretny fakt bez superlatywu.
- Fun fact powstaje z ciekawostki lub researchu, nie z pamięci modelu; musi być zrozumiały dla 9-latka.

## 3a. Język naturalny

- **Bez długiej pauzy „—” i półpauzy „–”** (decyzja JP 2026-10-25): od razu wyglądają jak tekst AI. Zamiast nich zwykły łącznik „-”,
  przecinek albo nowe zdanie; zakresy liczb też z łącznikiem (10-12). Skrypt zamienia je mechanicznie przed zapisem szkicu.

## 4. Przypisy — każdy fakt ma źródło

- W tekście każdego bloku fakt (data, liczba, nazwisko, zdarzenie, przypisanie dzieła) kończy się przypisem `[n]`.
  Jedno zdanie może mieć kilka przypisów. Zdania bez faktów (hak, przejście) nie potrzebują przypisu.
- `sources[]` przystanku: `{n, url, title, lang, accessed}`. Numeracja wspólna dla wszystkich bloków przystanku.
- Źródło musi **zawierać** ten fakt — nie „strona o mieście”, tylko strona, na której to zdanie da się sprawdzić.
  Kolejność źródeł: oficjalne (zabytek, gmina, diecezja, muzeum) → Wikipedia w języku kraju → inne rzetelne.
- **Przypisy i źródła są tylko dla redaktora i AI** — nie trafiają na stronę ani do widoku publicznego API. Widok strony
  usuwa znaczniki `[n]` z tekstu; `sources[]` czyta tylko redakcja (panel admina, Hermes, kontrola Claude).
- Cel: każde zdanie da się zweryfikować i poprawić bez ponownego researchu całego miasta.

## 5. Kontrola Claude (zawsze, przed szkicem dla JP)

1. **Przypisy:** Claude otwiera każde źródło i sprawdza, czy fakt naprawdę tam jest. Brak = błąd z poprawką
   (inne źródło albo usunięcie zdania). Martwy link = błąd.
2. **Powtórzenia:** opis vs legenda vs ciekawostka vs popkultura — ten sam fakt w dwóch blokach = błąd z poprawką
   (zostaje w jednym; w opisie co najwyżej zapowiedź, rozwinięcie w bloku).
3. **Sens:** czy treść trzyma się kupy — chronologia (daty, wiek postaci, kolejność zdarzeń), brak sprzeczności między
   blokami, legenda nie podana jako fakt, ciekawostka naprawdę zaskakuje, fun fact zrozumiały dla dziecka, quest wykonalny
   na miejscu.
4. **Zgłębienie:** ciekawostka ma kontekst (§3); superlatywy w opisie i legendzie mają dwa źródła (ciekawostka i fun fact — jedno wystarczy).
5. Walidator mechaniczny: komplet bloków ze stanem, przypisy `[n]` wskazują istniejące `sources`, brak faktów bez przypisu
   w zdaniach z datą/liczbą.

## 6. Przeróbka istniejących miast

Wszystkie opublikowane i szkicowane trasy przechodzą raz pełną ścieżkę:
1. wyjęcie legend, ciekawostek i popkultury z akapitów do bloków;
2. nowy research według pytań z §2 (uzupełnia, nie zastępuje dobrego materiału);
3. przypisy do wszystkich bloków;
4. kontrola §5;
5. akceptacja JP, potem tłumaczenia.

## 7. Wdrożenie (kolejność)

1. Baza — **gotowe** (`sql/2026-10-18-tresc-przystanku.sql`):
   - `public.stop_blocks (stop_id, lang, legend, curiosity, fun_fact, pop_culture)` — czysty tekst, tłumaczony;
     bez dostępu dla `web_anon` (strona dostaje go tylko przez `trip_full`). Tabela odrzuca tekst z przypisami.
   - `ops.stop_research (stop_id, marked, state, sources, check_result)` — wersja PL z przypisami, stan bloków
     (`found`/`none` + `checked`), źródła, wynik kontroli. Tylko redakcja i AI.
   - `ops.stop_publish_pl(stop_id)` — kopiuje wersję redakcyjną do strony bez przypisów.
   - `ops.stop_content_status` — stan każdego przystanku: bloki, liczba źródeł, przypisy bez źródła, źródła bez przypisu.
   - `cities.access` (`standard` | `free`), `cities.content_v2` (miasto przerobione).
   - `public_stops`: miasto z `content_v2` → cały opis; pozostałe → akapity 1–2 jak dotąd; kolumna `blocks` = nazwy
     dostępnych bloków (pas „Po zalogowaniu…”). `trip_full`: dodane `stop_blocks`, przypisy wycięte, `stops.sources` usunięte.
2. Hermes: research z pytaniami §2, pisanie bloków z przypisami, kontrola §5, format `pl.json` i import.
3. Walidator i skill `quolino-trip-writing` zgodne z tym dokumentem.
4. Strona: pas „Po zalogowaniu…” (niezalogowany), karty Legenda / Ciekawostka / W popkulturze (zalogowany),
   fun fact w widoku dziecka; przypisy i źródła w panelu admina, nie na stronie.
5. Przeróbka miast (§6) — po jednym, każde do akceptacji JP.

## 8. Proces na serwerze (Hermes) — `bin/stop-content.mjs`

- Treść przystanków pisze serwer, nie Claude w czacie: research (§2) → pisanie z przypisami → walidator → kontrola Claude ze
  źródłami (§5) → zapis do `ops.stop_research`. Na stronę trafia dopiero po akceptacji JP (`--publish`, tylko przy werdykcie ok).
- **Tempo i koszt (JP 2026-10-18): jedno miasto porządnie w dwa dni, nie przepalanie pieniędzy na poprawki.** Kolejka
  `work/stop-content/queue.txt`, cron raz na dobę robi najwyżej 2 przystanki; przy dziennym limicie płatnych modeli
  (`QUOLINO_DAILY_USD`) skrypt kończy i dokańcza następnego dnia. Zrobione przystanki (werdykt ok) są pomijane.
  Poprawki: jedna runda GPT, potem jedna runda Claude.
- **Poprawki → przegląd wytycznych (JP 2026-10-18).** Po każdej poprawce Claude rozstrzyga, czy błędy to przypadek, czy luka w
  wytycznych. Luka = zasada w `editorial_rules` (od razu obowiązuje przy pisaniu i kontroli; JP cofa: `trip-rules.mjs off <id>`);
  uwaga do tego dokumentu trafia do JP w podsumowaniu na Discordzie. To samo dotyczy poprawek JP w wątku miasta (`trip-revise` → `learn`).
