# INSPEKTOR-JEZYKOWY.md — spójność językowa stron

Status: JP 2026-10-18. Skrypt: `_content/claude-skills/bin/lang-inspect.mjs` (VPS, kontener Hermesa, Node 22, zero zależności).
Testy: `node lang-inspect.test.mjs` (w `bin/`, bez sieci i bazy).

## Co sprawdza

**Strony** — wszystkie adresy z `https://quolino.com/sitemap.xml` (także indeks map witryny). Strony statyczne
(index, kontakt, cookie-policy, zaloguj, konto) wchodzą, gdy mapa witryny je wymieni (dziś wymienia tylko miasta).
Język strony = prefiks adresu (`/pl/`, `/en/` …) albo `?lang=`, inaczej `<html lang>`.
Inspektor ogląda HTML tak, jak dostaje go Google **bez JavaScriptu** (z SSR). Napis, który dopiero skrypt
przetłumaczy w przeglądarce, i tak jest zgłaszany — wyszukiwarka widzi go w złym języku.

Na każdej stronie:
- `<html lang>`: brak albo inny niż w adresie; `og:locale` inny niż język strony;
- hreflang: brak wersji z mapy witryny, wskazanie adresu w innym języku, brak samej siebie, brak `x-default`;
- tekst widoczny (akapity, nagłówki, przyciski, linki, etykiety) oraz `alt`, `title`, `aria-label`, `placeholder`,
  `<title>`, `meta description`, `og:title`, `og:description` — każdy fragment osobno.

Rodzaje problemów:

| w raporcie | znaczy |
|---|---|
| fragment w innym języku [xx] | dłuższy tekst (≥ 4 słowa po odjęciu nazw) wykryty z pewnością jako język xx |
| napis UI z języka zapasowego | dokładny polski/angielski napis ze słownika UI (`i18n-ui.js` + `ui_translations`) na stronie innego języka |
| polskie słowo interfejsu | krótki napis z polskim słowem UI („Zaloguj”, „Nawiguj”, „Przystanek”, „Wesprzyj”…) poza `/pl/` |
| polskie litery | ą ę ł ń ś ź ż poza `/pl/` (także w nazwach przystanków) |
| brak hreflang / zły hreflang / … | problemy techniczne SEO strony |

Nie są zgłaszane: włoskie nazwy miejsc (Piazza, Duomo, Rocca, Palazzo dei Priori…), fragmenty złożone głównie
z Wielkich Słów, nazwy przystanków i miasta (nagłówki listy przystanków) — chyba że mają polskie litery lub
polskie przyimki; marka (Quolino, Quo, Let's Explore!). Wykrywanie: słowa funkcyjne + litery charakterystyczne
dla 17 języków strony (+ el); przy językach bliskich (cs/sk, da/no/sv, es/pt, de/nl) wymagana większa przewaga.
Ograniczenie: krótki polski tekst bez polskich liter i bez słów funkcyjnych może przejść — dlatego jest też kontrola bazy.

**Baza** (to samo połączenie co pozostałe skrypty, `QUOLINO_DATABASE_URL`) — dla każdego włączonego języka względem polskiego:
klucze `ui_translations` (brak klucza = SSR wstawia napis polski, przeglądarka angielski/polski → mieszanka),
opisy miast (`public_city_translations`) i przystanki (`public_stops`).

## Jak działa cyklicznie

- **co 15 min `--changed`**: tanie sygnały — skróty kilku plików strony (`/`, `city.html`, `i18n-ui.js`, `app.js`…
  pobranych z quolino.com, czyli to, co faktycznie jest na serwerze) i skróty treści w bazie (UI per język,
  miasto × język). Nic się nie zmieniło → koniec, bez przeglądu i bez wiadomości.
  - zmiana pliku strony albo UI polskiego/angielskiego (język zapasowy) → pełny przegląd;
  - zmiana treści miasta → tylko strony tego miasta we wszystkich językach; zmiana UI języka xx → strony xx;
  - SSR trzyma pamięć podręczną ~5 min: strona, której tekst jeszcze się nie zmienił, jest sprawdzana ponownie w 1–2 kolejnych przebiegach.
- **niedziela 05:37 pełny przegląd** (bez `--changed`) — siatka bezpieczeństwa, pełne podsumowanie na Discord.
- Stan: `/opt/data/quolino/work/lang-inspect.state.json` (sygnały, skróty tekstu stron, otwarte problemy).
  Usunięcie pliku = następny przebieg pełny, od zera.

## Uruchamianie ręczne (w kontenerze Hermesa, `/opt/data/quolino`)

```
node lang-inspect.mjs --dry-run              # pełny przegląd, wynik na ekran, bez Discorda i bez zapisu stanu
node lang-inspect.mjs --lang de --limit 20   # tylko niemieckie, 20 stron
node lang-inspect.mjs --changed              # jak cron
node lang-inspect.mjs --no-db                # bez kontroli bazy
```
Opcje: `--notify <kanał>`, `--site <adres>`. Kanał domyślny `#jezyki` (zmiana: `QUOLINO_LANG_CHANNEL` w `/opt/data/.env`).
Uprzejmie: 2 strony naraz, przerwa 0,4 s, limit 20 s, User-Agent `Quolino-lang-inspect`. Kod wyjścia zawsze 0, chyba że skrypt się wysypie.
Log crona: `/root/quolino-web/lang-inspect.log`.

## Raport i jak go czytać

Plik: `/opt/data/quolino/work/lang-inspect-RRRR-MM-DD.md` (przy `--dry-run`: `….dry.md`).
1. **Języki** — ile stron, ile z problemami, jakich najwięcej.
2. **Powtarzające się na wielu stronach** — to samo zdanie na ≥ 3 stronach jednego języka = szablon albo brakujący
   klucz UI. Jedna poprawka (klucz w `ui_translations` / tłumaczenie w SSR) naprawia wszystkie — zacznij stąd.
3. **Strony z problemami** — od najgorszej, z przykładami i wykrytym językiem w nawiasie `[xx]`.
4. **Zmiana od poprzedniego przebiegu** — 🆕 nowe, ✅ rozwiązane.
5. **Baza** — `ma/powinno` dla kluczy UI, opisów miast i przystanków; pierwsze brakujące klucze.

Discord: w trybie `--changed` tylko nowe i rozwiązane (zero wiadomości, gdy nic nowego); w niedzielę pełne
podsumowanie (języki, 10 najgorszych stron z przykładem, brakujące klucze UI). Pojedyncze fałszywe alarmy
(np. nazwa własna wykryta jako obcy język) zgłoś roli Backend — dopisujemy słowo do listy nazw w skrypcie.
