# STATYSTYKI.md — plan zbierania statystyk Quolino

Status: decyzja JP 2026-10-13 — wdrażamy (kolejność w §8).
Zasady nadrzędne: zero trackingu w rozumieniu CLAUDE.md (bez GA, pikseli, ciasteczek śledzących,
bez identyfikatorów osób), dane zostają na naszym serwerze, bez baneru zgody.

---

## 1. Na jakie pytania mają odpowiadać statystyki

1. **Skąd przychodzą rodziny?** Google, asystenci AI, media społecznościowe (które, który post),
   strony linkujące (backlinki), partnerzy, e-mail, kody QR, wejścia bezpośrednie.
2. **Czego szukają w Google?** Hasła, na które się wyświetlamy, pozycja, klikalność — per miasto i język.
3. **Czy czytają?** Czas aktywnego czytania, głębokość, które przystanki otwierają.
4. **Czy używają w terenie?** Widok dziecka, misje, nawigacja do startu.
5. **Czy kupują?** Lejek: wejście → czytanie → „Pełna wycieczka” → konto → darmowa wycieczka → zakup → powrót.

## 2. Narzędzia

| Warstwa | Narzędzie | Co daje |
|---|---|---|
| Ruch i zdarzenia | **Umami** (własny serwer, `stats.quolino.com`) | odsłony, źródła wejść, UTM, zdarzenia, lejki, ścieżki, kraje/urządzenia, bez ciasteczek |
| Wyszukiwarki | **Google Search Console** + **Bing Webmaster Tools** | hasła, wyświetlenia, CTR, pozycje, strony linkujące, błędy indeksowania |
| Konta i sprzedaż (od etapu B/C) | **nasza baza** | rejestracje, użycie wycieczek, zakupy, powroty — powiązane z kontem |
| Raport | skrypt Hermesa → Discord **#statystyki** | tygodniowe i miesięczne podsumowanie |

Google Analytics usuwamy (dziś jest w index/region/city.html — łamie zasadę „zero trackingu”
i wymagałby zgody na ciasteczka).

## 3. Skąd przyszła osoba — kanały

Umami zapisuje domenę, z której ktoś przyszedł (referrer), oraz parametry UTM z adresu.
Raport grupuje to w kanały według naszej tabeli:

| Kanał | Rozpoznanie |
|---|---|
| Wyszukiwarka (organic) | google.*, bing.com, duckduckgo.com, ecosia.org, yahoo… |
| Asystenci AI | chatgpt.com, perplexity.ai, gemini.google.com, copilot.microsoft.com, claude.ai |
| Social — organicznie | facebook.com, l.facebook.com, instagram.com, l.instagram.com, tiktok.com, youtube.com, pinterest.*, t.co/x.com, reddit.com — albo `utm_medium=social/reel/story/bio` |
| Social — płatnie | `utm_medium=paid_social` / `cpc` |
| Backlinki / polecenia | każda inna domena (blogi, fora, portale) — lista domen co miesiąc |
| Partnerzy / influencerzy | `utm_source=<partner>` + kod partnera (od płatności) |
| E-mail | `utm_medium=email` |
| QR / druk | `utm_medium=qr` (osobny kod dla każdego materiału) |
| Bezpośrednio / nieznane | brak referrera i UTM |

**Ważne ograniczenie:** aplikacje Instagram, TikTok, Messenger i WhatsApp często nie przekazują
referrera — bez UTM takie wejście wygląda na „bezpośrednie”. Dlatego **każdy link, który sami
publikujemy, ma UTM.**

### Konwencja UTM (obowiązkowa)

```
utm_source   = instagram | facebook | tiktok | youtube | pinterest | newsletter | discord | qr-<nazwa> | <partner>
utm_medium   = social | reel | story | bio | paid_social | email | qr | referral
utm_campaign = <miasto-url-slug> lub <kampania>, np. perugia, toscana-2027, majowka-2027
utm_content  = wariant, np. reel-quo-1, post-legenda
```
Małe litery, myślniki, bez polskich znaków. Hermes (`social-draft`) dokleja UTM automatycznie do
każdego linku w poście; kody QR na materiałach drukowanych generowane z UTM.

### Backlinki
- Wejścia z backlinków: Umami → raport „strony polecające” (domena + strona docelowa).
- Backlinki, które nie dają ruchu: Search Console → „Linki” i Bing Webmaster → „Backlinks”
  (Bing ma pełniejszy eksport). Miesięcznie: nowe domeny linkujące.

### Hasła z Google
Google nie przekazuje haseł do Umami. Hasła, pozycje i klikalność bierzemy z Search Console
(API, dane zbiorcze, bez danych o osobach) — per strona miasta i język.

## 4. Zdarzenia na stronie (Umami, bez danych o osobie)

| Zdarzenie | Dane | Po co |
|---|---|---|
| `czytanie-30s` / `czytanie-2m` / `czytanie-5m` | miasto, język | prawdziwy czas czytania (licznik tylko przy widocznej karcie) |
| `glebokosc` | miasto, ostatni widoczny przystanek (1, 3, 5, ostatni) | czy zajawki wciągają |
| `przystanek-otwarty` | miasto, nr przystanku, widok (rodzic/dziecko) | które miejsca interesują |
| `zakladka` | nazwa zakładki | co jest używane |
| `naklejka-klik` | miasto, nr | nawigacja paskiem |
| `pelna-wycieczka` | miasto, miejsce przycisku | główny krok lejka |
| `nawiguj-start` / `nawiguj-przystanek` | miasto, nr | użycie w terenie |
| `qr-dziecko` | miasto | przejście do widoku dziecka |
| `misja` / `naklejka-wklejona` | miasto, nr | zaangażowanie dziecka |
| `jezyk` | z → na | czy przełącznik języka jest potrzebny |
| `atlas-region` / `region-miasto` | slug | jak ludzie wybierają cel |
| `rejestracja-start` (etap B) | miasto | lejek |

Nazwy i dane stałe; nowe zdarzenia dopisujemy tutaj.

## 5. Lejek

| Etap | Źródło |
|---|---|
| 1. Wejście (kanał, kampania) | Umami |
| 2. Czyta ≥ 2 min albo przewinął do ostatniej zajawki | Umami |
| 3. Klik „Pełna wycieczka” | Umami |
| 4. Rejestracja | Umami (start) + baza (konto) |
| 5. Darmowa wycieczka użyta w terenie (QR, misje) | baza |
| 6. Zakup (wycieczka / 3 dni / 14 dni) | baza + operator płatności |
| 7. Kolejny zakup | baza |

Umami łączy kroki tylko w obrębie jednej wizyty (bez ciasteczek). Od rejestracji kroki łączą się
po koncie. Skąd przyszła osoba, która założyła konto:
- **pytanie przy rejestracji** „Skąd o nas wiesz?” (opcjonalne, lista + „inne”),
- **kanał wizyty rejestracji** (referrer/UTM tej wizyty) zapisany przy koncie,
- **kody partnerów** przy zakupie (influencerzy, blogi) — najpewniejsza atrybucja sprzedaży.

## 6. Prywatność

- Umami: bez ciasteczek, bez zapisu pełnego IP (skrót z dzienną solą), dane w naszej bazie na VPS.
- Zdarzenia bez danych osobowych (tylko miasto, numer, język, akcja).
- Ruch JP i testerów wyłączony (przełącznik w localStorage `quolino_nostats` — dopisać do listy kluczy).
- Polityka prywatności: akapit o statystykach bez ciasteczek.

## 7. Raporty (#statystyki na Discordzie)

**Co tydzień (poniedziałek):** wizyty i odwiedzający; kanały (udział, zmiana do poprzedniego
tygodnia); top 10 domen polecających i kampanii UTM; top miasta (wizyty, czytanie ≥ 2 min,
klik „Pełna wycieczka”); ranking przystanków per miasto; lejek etapy 1–3 (później 1–7);
Search Console: top hasła i strony, największe wzrosty/spadki pozycji.

**Co miesiąc:** nowe domeny linkujące (GSC, Bing); hasła z dużą liczbą wyświetleń i niską
klikalnością (do poprawy tytułów i opisów); języki i kraje; wejścia z asystentów AI.

## 8. Wdrożenie (kolejność)

1. Usunąć Google Analytics ze wszystkich stron.
2. Umami w Dockerze na VPS (baza `umami` w istniejącym PostgreSQL), `stats.quolino.com` (DNS A w OVH),
   skrypt serwowany z naszej domeny; konto admina dla JP.
3. Zdarzenia z §4 w city.html, index/region/country.html i widoku dziecka.
4. Search Console i Bing: weryfikacja domeny (TXT w OVH), dostęp API dla raportu
   (konto serwisowe Google z rolą tylko do odczytu — zakłada JP).
5. Konwencja UTM w `social-draft` i generatorze QR.
6. Skrypt raportu `stats-report.mjs` + cron (poniedziałek rano) → #statystyki.
7. Etap B/C: pytanie „Skąd o nas wiesz?”, kanał przy koncie, kody partnerów, lejek z bazy.
