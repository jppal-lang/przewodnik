# DOSTEP-I-KONTA.md — dostęp do treści, konta użytkowników, RODO

Decyzja JP 2026-10-13. Status: etap A w toku (robots.txt i krok 1 zrobione), reszta zaplanowana.

---

## 1. Co jest publiczne, a co po zalogowaniu

Zasada: **opowieść publiczna, narzędzie po zalogowaniu.** Google i gość widzą to samo (bez cloakingu).

| Publicznie (gość, Google) | Po zalogowaniu |
|---|---|
| Tytuł, lead, zdjęcie miasta, region | Pełne opisy przystanków (od 3. akapitu) |
| Przystanki: nazwa, zdjęcie, **1–2 pierwsze akapity** opisu | Legendy, „kim był…”, ciekawostki z dalszych akapitów |
| Informacja, co zawiera wycieczka (liczba przystanków i misji) | Plan dnia z godzinami i kolejnością |
| | Parking, ZTL, lokale z telefonami, punkty awaryjne |
| | Questy, wskazówki, zadania foto, widok dziecka (QR) |

Darmowa wycieczka z modelu freemium jest dostępna po rejestracji, nie publicznie.

## 2. SEO przy zamkniętej treści

- Strona publiczna miasta: minimum ok. 400–600 unikalnych słów (lead + 1–2 akapity × przystanki).
- Treść publiczna widoczna od razu, bez nakładki logowania; pod spodem sekcja „Pełna wycieczka po zalogowaniu”.
- Pełna treść NIE trafia do Google (odrzucony wariant z `isAccessibleForFree:false`).
- 17 języków = 17 stron miasta: `hreflang`, canonical, sitemap ze wszystkimi językami,
  dane strukturalne TouristTrip / TouristAttraction / ItemList / BreadcrumbList.
- `max-snippet` na stronach, `data-nosnippet` na fragmentach, których nie chcemy w AI Overviews.
- Pomiar: Google Search Console + Bing Webmaster Tools (bez śledzenia użytkowników).

### Roboty (robots.txt) — trzy grupy

Zasada: wpuszczamy wszystko, co przyprowadza ludzi (wyniki wyszukiwania z linkiem, podglądy linków
w mediach społecznościowych); blokujemy tylko roboty zbierające treść do trenowania modeli —
one nie dają wizyt ani pozycji. Blokada Google-Extended nie wpływa na pozycję w Google.
Nazwy robotów sprawdzić w dokumentacji dostawców przy wdrożeniu i przeglądać co kwartał.

| Wpuszczamy: wyszukiwarki | Wpuszczamy: pobieranie na prośbę użytkownika i podglądy linków | Blokujemy: trening modeli |
|---|---|---|
| Googlebot, Bingbot, Applebot | ChatGPT-User, Claude-User, Perplexity-User | GPTBot |
| OAI-SearchBot (wyszukiwarka ChatGPT) | facebookexternalhit (FB/Instagram) | ClaudeBot |
| Claude-SearchBot | Twitterbot, LinkedInBot, WhatsApp, Discordbot | CCBot (Common Crawl) |
| PerplexityBot, DuckDuckBot | | Google-Extended, Applebot-Extended |
| | | meta-externalagent, Bytespider |

Koszt blokady: modele nie „znają” Quolino z treningu, więc nie polecą go z pamięci. Gdy asystent
szuka na żywo (wyszukiwarka ChatGPT, Perplexity, Claude), roboty wyszukiwania są wpuszczone,
więc może nas znaleźć i podać link. Po etapie A roboty widzą i tak tylko treść publiczną.

## 3. API

- Dziś (2026-10-13) PostgREST zwraca anonimowo pełną treść wszystkich wycieczek — do zamknięcia.
- Rola anonimowa: tylko widoki z treścią publiczną (np. `desc_paragraphs[1:2]`), bez planu dnia,
  questów, lokali, telefonów.
- Pełna treść: tylko z kluczem dostępu (etap A: link testowy; etap B: sesja konta), z limitem
  zapytań na klucz, bez pobierania wszystkich miast naraz.

## 4. Logowanie

Strona (etap B): **Google** i **e-mail + hasło**. **Apple dopiero razem z aplikacją** (decyzja JP
2026-10-13): logowanie Apple również na stronie wymaga płatnego konta Apple Developer, a przy aplikacji
iOS i tak będzie potrzebne. Jedno konto może mieć kilka sposobów logowania (łączenie po zweryfikowanym
e-mailu), więc Apple dołączymy później bez migracji. Użytkownicy iPhone'ów do tego czasu logują się
przez Google albo e-mail.

- Google: OpenID Connect, zakresy tylko `openid email` (bez `profile` — nie pobieramy imienia ani zdjęcia).
- E-mail + hasło: weryfikacja adresu, reset hasła mailem, hasło jako skrót (scrypt/argon2id),
  limit prób logowania.
- Apple (etap aplikacji): Sign in with Apple, zakres tylko `email`; akceptujemy adres ukryty przez
  Apple (relay).
- Sesja: cookie `HttpOnly; Secure; SameSite=Lax` — niezbędne do działania, bez zgody;
  polityka cookies do aktualizacji (dziś mówi tylko o localStorage).
- Widok dziecka: link/QR z tokenem ważnym ograniczony czas, przypisanym do wycieczki rodzica —
  dziecko nie ma konta i nie loguje się.

## 5. RODO — założenia

- **Minimalizacja:** konto = e-mail, skrót hasła lub identyfikator Google/Apple (`sub`), data
  utworzenia, języki, postęp albumu, zakupy. **Bez imion, nazwisk, zdjęć, wieku, telefonu.**
- **Dzieci:** konto zakłada dorosły; profile dzieci tylko jako pseudonimy (opcjonalnie), bez
  wieku i zdjęć. Zdjęcia z zadań foto zostają w telefonie (localStorage), nie na serwerze.
- **Podstawa prawna:** wykonanie umowy (art. 6 ust. 1 lit. b) dla konta i zakupów; newsletter
  tylko za osobną, dobrowolną zgodą (domyślnie odznaczony).
- **Prawa użytkownika:** usunięcie konta jednym przyciskiem (kasuje dane konta i postęp),
  eksport danych (JSON), zmiana e-maila.
- **Retencja:** nieaktywne konto — przypomnienie, potem usunięcie (np. po 24 mies.); dowody zakupu
  przechowywane tak długo, jak wymagają przepisy podatkowe (min. dane potrzebne do faktury).
- **Przetwarzanie:** serwer w UE (Hostinger, Frankfurt). Podmioty przetwarzające / odrębni
  administratorzy do wpisania w politykę: Hostinger, dostawca e-maili transakcyjnych, operator
  płatności, Google (logowanie), później Apple.
- **Dokumenty:** polityka prywatności, regulamin (także zakaz kopiowania treści), rejestr czynności
  przetwarzania; ocena skutków (DPIA) raczej niepotrzebna — brak danych wrażliwych i profilowania.
- **Statystyki:** Umami na własnym serwerze, bez cookies i bez identyfikatorów (docs/STATYSTYKI.md).
- Dokumenty prawne przed startem do sprawdzenia przez prawnika.

## 6. Kolejność wdrożenia

1. **Etap A (teraz):** robots.txt (trzy grupy z §2); strony publiczne SSR z 1–2 akapitami;
   zamknięcie pełnej treści w API; dostęp testowy (link z kluczem) dla JP i testerów
   na czas, zanim powstaną konta.
2. **Etap B (zima):** konta — e-mail + hasło, potem Google; sesje; token QR dla dziecka;
   polityka prywatności, regulamin, aktualizacja polityki cookies.
3. **Etap C (wiosna, przed majem 2027):** panel użytkownika i album naklejek, płatności
   (wycieczka 3 €, 3 dni 5 €, 14 dni 6 €), statystyki produktowe.
4. **Aplikacja (później):** konto Apple Developer, logowanie Apple (strona i aplikacja).

## 7. Otwarte pytania

- Kto jest administratorem danych (JDG JP czy spółka) — od tego zależy polityka prywatności i faktury.
- Dostawca e-maili transakcyjnych (najlepiej z serwerami w UE).
- Operator płatności.
