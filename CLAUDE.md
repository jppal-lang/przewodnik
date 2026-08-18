# CLAUDE.md — Questini.com — instrukcje projektu

---

## 1. CZYM JEST QUESTINI

Questini zamienia zwiedzanie miast i atrakcji Europy w grę terenową dla rodzin
z dziećmi. Rodzic dostaje plan dnia (od parkingu po kolację), dziecko dostaje
misje i zagadki do wykonania na miejscu. Dwa widoki, jedno zwiedzanie.

**Slogan:** Let's Explore!
**Model:** wszystko za darmo, wsparcie przez Buy Me a Coffee.
**BMC:** https://buymeacoffee.com/questini
**Hosting:** GitHub Pages, repo `jppal-lang/przewodnik`, branch `main`.
**Stack:** statyczny HTML + CSS + vanilla JS. Zero backendu, zero frameworków.

---

## 2. STRUKTURA SERWISU

```
questini.com/
├── index.html                     # landing page + wybór języka
├── cookie-policy.html             # polityka cookies (wielojęzyczna)
├── places.html                    # indeks: kraj → region → miejsca
├── styles.css                     # design system — jedno źródło prawdy
├── app.js                         # album zdjęć, Wikimedia, interakcje
├── i18n.js                        # runtime tłumaczeń
├── lang/
│   ├── pl.json                    # polski (domyślny)
│   ├── en.json                    # angielski
│   ├── it.json                    # włoski
│   ├── de.json                    # niemiecki
│   ├── fr.json                    # francuski
│   ├── es.json                    # hiszpański
│   ├── cs.json                    # czeski
│   ├── sk.json                    # słowacki
│   ├── ro.json                    # rumuński
│   ├── at.json                    # austriacki (de-AT)
│   ├── hr.json                    # chorwacki
│   ├── el.json                    # grecki
│   └── no.json                    # norweski
├── wlochy/
│   ├── marche/
│   │   ├── index.html             # lista miast regionu Marche
│   │   ├── ancona.html
│   │   ├── frasassi.html
│   │   ├── urbino.html
│   │   └── rimini.html
│   ├── umbria/
│   │   ├── index.html             # lista miast regionu Umbria
│   │   ├── perugia.html
│   │   └── asyz.html
│   ├── toskania/                  # przyszły region
│   │   └── index.html
│   └── ...
├── polska/
│   └── malopolska/
│       └── index.html
├── chorwacja/                     # przyszły kraj
│   └── ...
├── CLAUDE.md                      # ten plik
└── README.md
```

### Zasada podziału regionów
Marche i Umbria to OSOBNE regiony, NIE łączone. Każdy region ma własny
katalog, własną stronę z listą miast, własne plany dnia. Użytkownik wybiera:
Włochy → Marche → Ancona, ALBO Włochy → Umbria → Perugia.

---

## 3. DWA WIDOKI: RODZIC i DZIECKO

### Widok rodzica (domyślny)
Pełna strona z:
- Opisami zabytków (2–3 akapity, historia, kontekst, daty)
- Cenami biletów, godzinami, ostrzeżeniami
- Przyciskami nawigacji (Nawiguj / Napisz WhatsApp / WWW)
- Rozmówkami, telefonami awaryjnymi, planem dnia
- Sekcją „Dla dzieci" (widoczna, ale nie dominująca)
- Zadaniami foto
- Albumem zdjęć
- **Oceną miejsca** (1–5 gwiazdek + opcjonalny komentarz)
- **Przyciskiem „Zgłoś uwagę"** (do konkretnego przystanku)
- **Przyciskiem „Postaw kawę"** (Buy Me a Coffee)

### Widok dziecka
Rodzic generuje link lub przełącza widok — dziecko widzi:
- **Mapę przystanków** wizualną (nie listę tekstu)
- **Kartę misji** przy każdym przystanku: co znaleźć, policzyć, sfotografować
- **Odznaki / checkboxy** — ukończone misje się zaznaczają
- **Ranking rodzinny** — kto wykonał więcej misji
- **Galerię zdjęć** — dziecko dodaje zdjęcia jako dowody wykonania misji
- **BRAK:** cen, godzin, historii, telefonów awaryjnych, ocen

Przełącznik widoku: toggle w nagłówku lub parametr URL `?view=kid`.
Stan zapisywany w `localStorage('questini_view')`.

### Wizualnie
Widok rodzica: ciepły, piaskowy, elegancki (obecny design).
Widok dziecka: ten sam design system, ale:
- Większe ikony misji, wyraźniejsze kolory
- Czcionka taka sama (Figtree), ale tytuły mogą być większe
- Progress bar: ile misji ukończono / ile jest w mieście
- Gratulacja po ukończeniu wszystkich misji przystanku
- Spójność z widokiem rodzica — to ta sama marka, nie oddzielna apka

---

## 4. WIELOJĘZYCZNOŚĆ (i18n)

### Obsługiwane języki
| Kod  | Język       | Flaga CSS                | Priorytet |
|------|-------------|--------------------------|-----------|
| `pl` | polski      | biało-czerwona           | P0 — domyślny |
| `en` | angielski   | Union Jack               | P0 |
| `it` | włoski      | tricolore pionowy        | P0 |
| `de` | niemiecki   | czarno-czerwono-złota    | P0 |
| `fr` | francuski   | tricolore pionowy        | P1 |
| `es` | hiszpański  | czerwono-żółto-czerwona  | P1 |
| `cs` | czeski      | biało-czerwono-niebieska | P1 |
| `sk` | słowacki    | biało-niebiesko-czerwona | P1 |
| `ro` | rumuński    | niebiesko-żółto-czerwona | P1 |
| `at` | austriacki  | czerwono-biało-czerwona  | P1 |
| `hr` | chorwacki   | czerwono-biało-niebieska | P2 |
| `el` | grecki      | niebiesko-biała          | P2 |
| `no` | norweski    | czerwono-biało-niebieska | P2 |

### Mechanizm
1. Pierwsze wejście: przeglądarka sugeruje język na podstawie `navigator.language`
2. Użytkownik może zmienić ręcznie (przełącznik z flagami w nagłówku)
3. Wybór zapisywany w `localStorage('questini_lang')`
4. Przy kolejnych wizytach: automatycznie ładuje zapamiętany język
5. Plik `i18n.js` ładuje `/lang/{kod}.json` i podmienia `data-i18n` atrybuty
6. Zmiana języka: bez przeładowania strony (podmiana DOM)
7. URL: `?lang=it` jako override (linkowanie do konkretnej wersji)

### Reguły tłumaczeniowe
- Nazwy własne zabytków: oryginał włoski/lokalny (np. „Fontana Maggiore")
- Opis zabytku: tłumaczony w całości
- Ceny, godziny, telefony, linki Maps/WhatsApp: NIE tłumaczone
- Rozmówki: para język_użytkownika ↔ język_lokalny (np. FR ↔ IT)
- Tekst DE/NO/EL bywa +30% dłuższy — layout MUSI to znosić

---

## 5. POLITYKA COOKIES (cookie-policy.html)

### Co zapisujemy
| Klucz localStorage                  | Cel                   | Czas życia   |
|--------------------------------------|-----------------------|--------------|
| `questini_lang`                      | wybrany język         | bezterminowo |
| `questini_view`                      | widok rodzic/dziecko  | bezterminowo |
| `questini_cookie_consent`            | zgoda na localStorage | bezterminowo |
| `album:{strona}:{przystanek}`        | zdjęcia użytkownika   | bezterminowo |
| `questini_rating:{miasto}:{stop}`    | ocena przystanku      | bezterminowo |
| `questini_missions:{miasto}`         | ukończone misje       | bezterminowo |

### Treść polityki
- Strona cookie-policy.html w pełni wielojęzyczna (data-i18n)
- Informacja: „Questini nie używa ciasteczek śledzących, reklamowych ani
  analitycznych. Zapisujemy wyłącznie twoje preferencje (język, widok) i zdjęcia
  z albumu w pamięci przeglądarki (localStorage). Dane nie opuszczają twojego
  urządzenia."
- Prosty baner przy pierwszym wejściu: „Zapisujemy twoje preferencje lokalnie.
  Żadnych trackerów." + przycisk OK
- Baner znika po kliknięciu OK → `questini_cookie_consent` = true
- Link do pełnej polityki w footerze każdej strony

---

## 6. MENU I INDEKS MIEJSC (places.html)

### Struktura menu
Hierarchiczne rozwijane menu w nawigacji:

```
🇮🇹 Włochy
  ├── Marche (4 miejsca)
  │   ├── Ancona
  │   ├── Jaskinie Frasassi
  │   ├── Urbino
  │   └── Rimini
  ├── Umbria (2 miejsca)
  │   ├── Perugia
  │   └── Asyż
  └── Toskania (wkrótce)
🇵🇱 Polska
  └── Małopolska (wkrótce)
🇭🇷 Chorwacja (wkrótce)
```

### Strona indeksu (places.html)
- Lista wszystkich krajów, regionów i miejsc
- Każde miejsce: nazwa, krótki lead, średnia ocen, liczba przystanków
- Filtrowanie: kraj, region
- Przyszłość: wyszukiwarka tekstowa

---

## 7. MAPA EUROPY (faza 2)

### Koncept
Interaktywna mapa Europy (SVG lub Leaflet):
1. Widok kontynentu: kraje z liczbą regionów
2. Klik na kraj → regiony z liczbą dostępnych atrakcji
3. Klik na region → pinezki atrakcji na mapie + średnia ocen użytkowników
4. Klik na pinezkę → otwiera kartę miasta

### Wymagania techniczne
- SVG mapa dla prostego widoku krajów (zero API key)
- Leaflet + OpenStreetMap dla widoku pinezek (darmowe)
- Dane o atrakcjach: statyczny JSON ładowany z repo
- Oceny: agregowane z localStorage (faza MVP) lub z prostego API (faza 2+)

---

## 8. SYSTEM OCEN I KOMENTARZY

### Ocena miejsca (widok rodzica)
- Na każdej karcie miasta, pod ostatnim przystankiem: „Oceń tę wycieczkę"
- 5 gwiazdek (1–5), kliknięcie = ocena
- Opcjonalny komentarz (textarea, max 500 znaków)
- Jedno kliknięcie „Wyślij"

### Zabezpieczenie przed wielokrotnymi ocenami
**Faza 1 (localStorage, MVP):**
- `questini_rating:{miasto}` = { stars: 4, comment: "...", ts: "..." }
- Po wystawieniu oceny przycisk zmienia się na „Twoja ocena: ★★★★☆ [Edytuj]"
- Jeden użytkownik = jedna ocena per urządzenie per przeglądarka

**Faza 2 (backend):**
- Fingerprint: hash z `navigator.userAgent` + rozdzielczość + strefa czasowa
- Rate limiting: max 1 ocena z jednego fingerprinta na 24h
- Alternatywa: logowanie przez Google/Apple (dopiero gdy skala uzasadni)

### Wyświetlanie średniej
- Na karcie regionu przy każdym mieście: „★ 4.3 (12 ocen)"
- Na karcie miasta w hero: pełna średnia z liczbą głosów
- Faza 1: dane lokalne, faza 2: API

---

## 9. ZGŁASZANIE UWAG

### Faza 1 — email
- Przycisk „Zgłoś uwagę" przy KAŻDYM przystanku (widok rodzica)
- Formularz: dropdown (typ: błędna cena / zamknięte / złe godziny /
  zły adres / inne) + pole tekstowe + opcjonalne zdjęcie
- Po wysłaniu: `mailto:kontakt@questini.com` z preformatowanym tematem:
  `[Uwaga] Perugia > Przystanek 03 Fontana Maggiore`
- Treść: typ uwagi + komentarz + data + język użytkownika

### Faza 2 — agent AI
- Uwagi wpadają do kolejki (Notion / Google Sheet / API)
- Agent AI czyta uwagę, sprawdza fakty i:
  - jednoznaczna zmiana → generuje PR na GitHubie
  - niejasna → taguje do ręcznego sprawdzenia
- Powiadomienie do użytkownika: „Dzięki! Sprawdzimy."

---

## 10. BUY ME A COFFEE

### Integracja
**Floating widget (każda strona):**
```html
<script data-name="BMC-Widget"
  data-cfasync="false"
  src="https://cdnjs.buymeacoffee.com/1.0.0/widget.prod.min.js"
  data-id="questini"
  data-description="Wspieraj rodzinne przewodniki po Europie"
  data-message="Questini jest za darmo. Jeśli pomogło — postaw nam kawę!"
  data-color="#B4502E"
  data-position="Right"
  data-x_margin="18"
  data-y_margin="18">
</script>
```

**CTA na landingu:** „Questini jest za darmo. Jeśli pomogło wam na
wakacjach — postaw nam kawę." Przycisk → buymeacoffee.com/questini

**CTA po zwiedzaniu (widok rodzica):** „Spodobała się wycieczka?
Pomóż nam opisać kolejne miasto." Link do BMC.

---

## 11. WSPÓŁPRACA Z INFLUENCERAMI

### Profil idealnego influencera
- Rodzinny/travel, 5k–50k followersów (mikro/nano)
- Treści: podróże autem po Europie z dziećmi, camping, city breaks
- Platformy: Instagram, TikTok, YouTube
- Języki: PL, EN, DE, CS

### Model współpracy
1. **Barter:** influencer testuje Questini, relacjonuje w stories/reels.
   W zamian: dedykowany region/miasto opisane pod jego trasę.
2. **Affiliate:** unikalny link `questini.com/?ref=nazwa` → tracking.
3. **Co-creation:** influencer współtworzy przewodnik — kredytowany jako autor.
4. **UGC:** influencer używa Questini, taguje @questini — repost.

### Outreach — szablon
```
Cześć [imię]!

Śledzę wasz profil i widzę, że [konkret o ich treściach z dziećmi].
Buduję Questini — darmowe przewodniki po miastach Europy, które zamieniają
zwiedzanie z dziećmi w grę terenową (misje, zagadki, album zdjęć).

Chciałbym zaproponować: opiszę miasto/region pod waszą następną trasę
— gotowy plan od parkingu po kolację. Wy testujecie, relacjonujecie.
Żadnych opłat, żadnych zobowiązań.

Rzuć okiem: questini.com

[imię]
```

---

## 12. PARTNERSTWA B2B

### Potencjalni partnerzy
| Partner          | Produkt               | Model współpracy                         |
|------------------|-----------------------|------------------------------------------|
| **Zen.com**      | Karty wielowalutowe   | Banner „Płać w € bez prowizji" + affiliate |
| **Sail / Airalo**| eSIM podróżne         | „Internet w Europie" + affiliate         |
| **EasyPark**     | Aplikacja parkingowa  | Link przy przystanku 01 parkingowym      |
| **Booking.com**  | Noclegi               | „Szukaj noclegu" na stronie regionu      |
| **GetYourGuide** | Bilety do atrakcji    | Link przy biletowanych przystankach      |
| **Revolut**      | Karta wielowalutowa   | Alternatywa Zen                          |
| **CampRest**     | Campingi              | PL rynek, link „Noclegi pod namiotem"    |

### Zasady
- Treści partnerskie TYLKO w widoku rodzica (nigdy w widoku dziecka)
- Oznaczenie chipem „Partner" — transparentność
- UTM tracking: `?utm_source=questini&utm_campaign={miasto}`
- Sekcja „Przydatne w podróży" w footerze regionu
- Zero pop-upów, auto-play, reklam w treści przystanków

---

## 13. DESIGN SYSTEM

### Paleta
| Token          | Hex       | Użycie                              |
|----------------|-----------|-------------------------------------|
| --parchment    | #FFFCF5   | tło kart                            |
| --ink          | #383026   | tekst główny                        |
| --ink2         | #6E6154   | tekst wtórny                        |
| --label        | #8A7B68   | etykiety caps                       |
| --line         | #E7DBC6   | separatory                          |
| --terra        | #B4502E   | CTA / primary                       |
| --olive        | #5F6637   | chipy logistyczne, boks dzieci      |
| --sea          | #23677A   | akcent, boks foto, focus            |

Tło: `#FFFFFF` + trzy radial-gradient mgły (terra, olive, sea).
Font: **Figtree** 400–800. Bazowy: **19px, min 18px**.
Cele dotykowe: **min 44×44px**.
Logo: `questini` 800 + `.` terra + `com` 600 ink2.

---

## 14. ANATOMIA KARTY MIASTA

### Hero
Zdjęcie full-bleed → przycisk wstecz + lang switcher → H1 + lead + chipy

### Przystanki (akordeony)
**Przystanek 01 = ZAWSZE parking.**

Nagłówek (widoczny bez rozwinięcia):
1. `{num} · {time}` terra → nazwa 21px/600 → ▼
2. Chipy: rok budowy (neutral) + cena (olive)
3. Akcje: Nawiguj (terra filled) / Napisz (outline) / WWW (outline)

Wnętrze:
- Zdjęcie Wikimedia
- Opis dorosły (2–3 akapity z datami)
- Boks „Dla dzieci" (olive-bg)
- Boks „Zadanie foto" (sea-bg)
- Album zdjęć
- Przycisk „Zgłoś uwagę" (tylko rodzic)

### Stopka miasta
- Plan dnia
- Punkty awaryjne
- Rozmówki
- Telefony
- Oceń wycieczkę
- Buy Me a Coffee CTA

---

## 15. DODAWANIE NOWEGO MIEJSCA

1. Wybierz kraj i region (utwórz katalog jeśli nowy)
2. Skopiuj wzorcowy plik miasta
3. Przystanek 01 = parking (Prowadź z lokalizacji)
4. Każdy zabytek: chip roku + `data-wiki`
5. Misje dla widoku dziecka
6. Dodaj do `places.html` i regionu `index.html`
7. Klucze tłumaczeń w `lang/*.json`
8. Commit + push → live w minutę

---

## 16. CZEGO NIGDY NIE ROBIĆ

- Tekst poniżej 18px
- Cele dotykowe poniżej 44×44px
- Ukrywanie przycisków akcji wewnątrz akordeonu
- Wymyślanie dat, cen, telefonów
- Treści partnerskie w widoku dziecka
- Import frameworków (zero dependencies)
- Łączenie regionów (Marche ≠ Umbria)
- Pop-upy, auto-play, overlay reklamy
- Tracking użytkowników (zero GA, zero pixeli)
- Używanie `localStorage` poza zdefiniowanymi kluczami

---

## 17. STATUS WDROŻENIA

| Element                              | Status |
|--------------------------------------|--------|
| Design tokens v2 (CSS)               | ✅     |
| Landing page questini.com            | ✅     |
| Perugia (wzorzec karty miasta)       | ✅     |
| 6 miast (treść pełna, format stary)  | ⚠️     |
| Podział Marche / Umbria              | 🔲     |
| Widok dziecka                        | 🔲     |
| i18n runtime + PL/EN/IT/DE           | 🔲     |
| i18n: FR/ES/CS/SK/RO/AT/HR/EL/NO    | 🔲     |
| Polityka cookies                     | 🔲     |
| Cookie consent baner                 | 🔲     |
| Menu / indeks miejsc                 | 🔲     |
| System ocen (localStorage)           | 🔲     |
| Zgłaszanie uwag (mailto)             | 🔲     |
| Buy Me a Coffee widget               | 🔲     |
| Mapa Europy (SVG/Leaflet)            | 🔲     |
| System ocen (backend)                | 🔲     |
| Agent AI do uwag                     | 🔲     |
| Partnerstwa B2B                      | 🔲     |
| Program influencerów                 | 🔲     |
