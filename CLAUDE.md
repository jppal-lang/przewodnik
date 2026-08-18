# CLAUDE.md — Questini.com — instrukcje projektu

---

## 1. CZYM JEST QUESTINI

Questini zamienia zwiedzanie miast i atrakcji Europy w grę terenową dla rodzin
z dziećmi. Rodzic dostaje plan dnia (od parkingu po kolację), dziecko dostaje
misje i zagadki do wykonania na miejscu. Dwa widoki, jedno zwiedzanie.

- **Slogan:** Let's Explore!
- **Model:** wszystko za darmo, wsparcie przez Buy Me a Coffee
- **BMC:** https://buymeacoffee.com/questini
- **Domena:** questini.com (OVH, DNS → GitHub Pages)
- **Repo:** github.com/jppal-lang/przewodnik, branch `main`
- **Hosting treści:** GitHub Pages (statyczny HTML/CSS/JS, zero opłat)
- **Hosting interakcji:** Supabase (darmowy tier, PostgreSQL + REST API)

---

## 2. ARCHITEKTURA — HYBRYDA

### Zasada
Treść przewodników = statyczne pliki HTML na GitHub Pages (szybkie, darmowe, zero serwera).
Interakcje użytkowników = Supabase API odpytywane z frontendu przez `fetch()`.

```
questini.com (GitHub Pages)
│
├── WARSTWA STATYCZNA (pliki HTML/CSS/JS — bez zmian, bez backendu)
│   ├── treść przewodników (opisy, godziny, ceny, misje)
│   ├── tłumaczenia (lang/*.json + i18n.js)
│   ├── widok rodzica / dziecko (przełącznik CSS/JS)
│   ├── album zdjęć (localStorage)
│   ├── zdjęcia zabytków (Wikimedia API)
│   ├── geolokalizacja i sortowanie (browser API)
│   ├── cookie consent (localStorage)
│   ├── mapa Europy (SVG statyczny)
│   └── Buy Me a Coffee (zewnętrzny widget)
│
└── WARSTWA INTERAKCJI (Supabase — darmowy tier)
    ├── oceny (stars, comment, fingerprint, city, stop, timestamp)
    ├── uwagi / zgłoszenia (stop_id, type, message, email, status)
    ├── średnie ocen (widok materializowany lub obliczany na froncie)
    └── (przyszłość) analytics, konta użytkowników
```

### Dlaczego nie PHP + MySQL
- GitHub Pages = zero kosztów hostingu, zero administracji serwera
- Supabase darmowy tier: 500 MB bazy, 50k requestów/mies., auth, realtime
- PHP na OVH = 8–30 zł/mies., wymaga utrzymania, wolniejszy od CDN GitHub
- Treść przewodników to pliki — nie potrzebują bazy danych
- Backend potrzebny WYŁĄCZNIE do interakcji między użytkownikami

### Supabase — konfiguracja

**Tabele:**

```sql
-- Oceny
CREATE TABLE ratings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  city TEXT NOT NULL,              -- np. 'perugia'
  stop_id TEXT,                    -- np. '03' (opcjonalne, ocena może być na miasto)
  stars SMALLINT CHECK (stars BETWEEN 1 AND 5),
  comment TEXT CHECK (char_length(comment) <= 500),
  fingerprint TEXT NOT NULL,       -- hash: userAgent + resolution + timezone
  lang TEXT DEFAULT 'pl',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(city, stop_id, fingerprint)  -- jedna ocena per fingerprint per miejsce
);

-- Uwagi / zgłoszenia
CREATE TABLE reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  city TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  type TEXT NOT NULL,              -- 'wrong_price' | 'closed' | 'wrong_hours' | 'wrong_address' | 'other'
  message TEXT CHECK (char_length(message) <= 1000),
  email TEXT,                      -- opcjonalny, do odpowiedzi
  lang TEXT DEFAULT 'pl',
  status TEXT DEFAULT 'new',       -- 'new' | 'reviewed' | 'fixed' | 'rejected'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Widok: średnie ocen per miasto
CREATE VIEW city_ratings AS
SELECT city,
       ROUND(AVG(stars)::numeric, 1) AS avg_stars,
       COUNT(*) AS total_ratings
FROM ratings
WHERE stop_id IS NULL
GROUP BY city;
```

**Row Level Security (RLS):**
- ratings: INSERT dozwolony dla anonimowych, SELECT dozwolony dla wszystkich
- reports: INSERT dozwolony dla anonimowych, SELECT tylko dla admina
- Brak UPDATE/DELETE dla anonimowych — ocena jest finalna (edycja = nowy INSERT z UPSERT)

**Frontend integration:**
```javascript
// supabase-client.js — cienki wrapper
const SUPABASE_URL = 'https://xxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbG...';  // klucz publiczny, bezpieczny w froncie

async function submitRating(city, stars, comment) {
  const fp = await getFingerprint();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/ratings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify({ city, stars, comment, fingerprint: fp })
  });
  return res.ok;
}

async function getCityRatings(city) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/city_ratings?city=eq.${city}`,
    { headers: { 'apikey': SUPABASE_ANON_KEY } }
  );
  return res.ok ? (await res.json())[0] : null;
}

function getFingerprint() {
  const raw = navigator.userAgent + screen.width + screen.height
    + Intl.DateTimeFormat().resolvedOptions().timeZone;
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
    .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join(''));
}
```

### Kiedy wdrożyć Supabase
NIE na starcie. Priorytet fazy 1: treść (Marche/Umbria split, widok dziecka,
tłumaczenia). Supabase wchodzi w fazie 2, gdy są użytkownicy, którzy chcą oceniać.
Do tego czasu formularz uwag działa przez `mailto:kontakt@questini.com`.

---

## 3. STRUKTURA PLIKÓW

```
questini.com/
├── index.html                     # landing page + wybór języka
├── cookie-policy.html             # polityka cookies (wielojęzyczna)
├── places.html                    # indeks: kraj → region → miejsca
├── styles.css                     # design system — jedno źródło prawdy
├── app.js                         # album zdjęć, Wikimedia, interakcje
├── kids-view.js                   # widok dziecka — czyta box-kids/box-foto z DOM widoku rodzica
├── qr-share.js                    # generuje kod QR do ?view=kid w stopce karty miasta
├── qrcode.js                      # vendorowany qrcode-generator (Kazuhiko Arase, MIT) — patrz "Zależności JS"
├── i18n.js                        # runtime tłumaczeń
├── supabase-client.js             # wrapper Supabase (faza 2)
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
│   │   ├── rimini.html
│   │   └── rawenna.html           # geogr. Emilia-Romania, ale bez własnego regionu — patrz niżej
│   ├── umbria/
│   │   ├── index.html             # lista miast regionu Umbria
│   │   ├── perugia.html
│   │   └── asyz.html
│   └── toskania/                  # przyszły
│       └── index.html
├── polska/
│   └── malopolska/
│       └── index.html
├── chorwacja/                     # przyszły
├── CLAUDE.md
└── README.md
```

### Zasada podziału regionów
Marche i Umbria to OSOBNE regiony, NIE łączone. Każdy region ma własny
katalog, stronę z listą miast, własne plany dnia. Ścieżka:
Włochy → Marche → Ancona, ALBO Włochy → Umbria → Perugia.

Rawenna leży geograficznie w Emilia-Romania, nie w Marche — ale jedno miasto
nie uzasadnia osobnego regionu/zakładki. Decyzja robocza: Rawenna zostaje
wypisana pod zakładką „Marche" (jako piąte miasto, `wlochy/marche/rawenna.html`)
do czasu, aż region Emilia-Romania będzie miał więcej niż jedno miasto —
wtedy przenieść do własnego katalogu `wlochy/emilia-romania/`.

`marche-umbria.html` w katalogu głównym to teraz tylko przekierowanie
(meta refresh) do `wlochy/umbria/index.html`, zachowane dla starych linków.

---

## 4. DWA WIDOKI: RODZIC i DZIECKO

### Widok rodzica (domyślny)
- Opisy zabytków (2–3 akapity, historia, kontekst, daty budowy)
- Ceny biletów, godziny, ostrzeżenia ZTL
- Przyciski: Nawiguj / Napisz WhatsApp / WWW
- Rozmówki, telefony awaryjne, plan dnia
- Sekcja „Dla dzieci" (widoczna, ale nie dominująca)
- Zadania foto + album zdjęć
- **Oceń miejsce** (1–5 gwiazdek + komentarz) → Supabase
- **Zgłoś uwagę** (per przystanek) → mailto faza 1, Supabase faza 2
- **Postaw kawę** → Buy Me a Coffee
- Treści partnerskie (oznaczone chipem „Partner")

### Widok dziecka
Przełącznik: przycisk „👁 Widok dziecka" w nagłówku KAŻDEJ karty miasta, lub
`?view=kid` w URL (linki generowane przez QR — patrz niżej). Implementacja:
`kids-view.js`, czysty JS, zero zależności poza vendorowanym `qrcode.js`
(patrz sekcja „Zależności JS" niżej).

Stan zapisu:
- `sessionStorage('questini_kidmode')` — czy widok dziecka jest włączony na
  tej karcie w tej sesji (celowo NIE `localStorage` — rodzic wraca następnym
  razem do widoku rodzica, nie zostaje w trybie dziecka)
- `localStorage('questini_missions:{miasto}')` — `{taskId: true|personId}`,
  ukończone misje per miasto
- `localStorage('questini_family')` — roster domowników (imię + avatar) do rankingu
- `localStorage('questini_active_player')` — kto obecnie „gra"

Misje NIE mają osobnej bazy danych — `kids-view.js` czyta je bezpośrednio
z `box-kids` i `box-foto` każdego `.stop` w widoku rodzica przy starcie
strony. Dodanie/zmiana misji = edycja treści w `box-kids`/`box-foto`, nic więcej.

Dziecko widzi:
- Kartę misji per przystanek: co znaleźć, policzyć, sfotografować
- Odznaki / checkboxy — ukończone misje zaznaczają się
- Ranking rodzinny — kto wykonał więcej misji
- Progress bar: ile misji ukończono / ile jest

### QR dla dziecka
Sekcja w stopce każdej karty miasta („QR dla dziecka"): kod QR generowany
w przeglądarce (bez zewnętrznego API — offline, zero trackerów) prowadzący
do tej samej strony z `?view=kid`. Rodzic pokazuje ekran, dziecko skanuje
swoim telefonem/tabletem i od razu ląduje w widoku dziecka. Widoczne tylko
w widoku rodzica (`.foot-section` znika w `body.kid-mode`, więc dziecko nie
zobaczy tam własnego kodu QR). Implementacja: `qr-share.js`.

Dziecko NIE widzi:
- Cen, godzin otwarcia, historii
- Telefonów awaryjnych, rozmówek
- Ocen, komentarzy, zgłoszeń
- Treści partnerskich, BMC

### Wizualnie
Ten sam design system (Figtree, ta sama paleta), ale w widoku dziecka:
- Większe ikony misji, wyraźniejsze kolory akcentowe
- Tytuły mogą być większe
- Gratulacja po ukończeniu misji
- Spójność marki — to ten sam serwis, nie oddzielna apka

---

## 5. WIELOJĘZYCZNOŚĆ (i18n)

### 13 języków
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
1. Pierwsze wejście: autodetekcja z `navigator.language`
2. Ręczna zmiana: przełącznik z flagami w nagłówku
3. Zapis: `localStorage('questini_lang')`
4. Runtime: `i18n.js` ładuje `/lang/{kod}.json`, podmienia `data-i18n` atrybuty
5. Zmiana: bez przeładowania strony (DOM swap)
6. Override URL: `?lang=it`

### Reguły
- Nazwy własne zabytków: oryginał lokalny (np. „Fontana Maggiore")
- Opisy: tłumaczone w całości
- Ceny, godziny, telefony, linki: NIE tłumaczone
- Rozmówki: para język_użytkownika ↔ język_lokalny
- Layout musi znosić +30% dłuższy tekst (DE, EL, NO)

---

## 6. POLITYKA COOKIES

### Zapisywane dane (tylko localStorage)
| Klucz                               | Cel                   |
|--------------------------------------|-----------------------|
| `questini_lang`                      | wybrany język         |
| `questini_view`                      | rodzic / dziecko      |
| `questini_cookie_consent`            | zgoda na localStorage |
| `album:{strona}:{przystanek}`        | zdjęcia użytkownika   |
| `questini_missions:{miasto}`         | ukończone misje       |

### Strona cookie-policy.html
- Wielojęzyczna (data-i18n)
- Treść: „Zero trackerów, zero reklam śledzących. Zapisujemy preferencje
  i zdjęcia lokalnie, w twojej przeglądarce. Dane nie opuszczają urządzenia."
- Baner przy pierwszym wejściu: tekst + OK → consent = true
- Link w footerze każdej strony

---

## 7. MENU I INDEKS MIEJSC

### Nawigacja (hamburger mobile, rozwinięta desktop)
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

### Strona places.html
- Hierarchia: kraj → region → miejsce
- Każde miejsce: nazwa, lead, średnia ocen, liczba przystanków
- Filtrowanie: kraj, region
- Przyszłość: wyszukiwarka tekstowa

---

## 8. MAPA EUROPY (faza 2)

### Koncept
1. SVG mapa kontynentu: klikalne kraje z liczbą regionów
2. Klik na kraj → regiony z liczbą atrakcji
3. Klik na region → Leaflet + OpenStreetMap z pinezkami + średnie ocen
4. Klik na pinezkę → karta miasta

### Tech
- SVG: statyczny plik, zero API key
- Leaflet: darmowe, OpenStreetMap tiles
- Dane: statyczny JSON z koordynatami i metadanymi
- Oceny: z Supabase `city_ratings` view

---

## 9. SYSTEM OCEN

### UX (widok rodzica)
- Pod ostatnim przystankiem: „Oceń tę wycieczkę"
- 5 gwiazdek kliknięcie + textarea (max 500 znaków) + Wyślij

### Faza 1 (localStorage, przed Supabase)
- `localStorage` per urządzenie — jedno głosowanie
- Średnie niewidoczne (brak źródła współdzielonych danych)

### Faza 2 (Supabase)
- Tabela `ratings` z fingerprint (SHA-256 z userAgent+resolution+timezone)
- UNIQUE constraint: `(city, stop_id, fingerprint)` — jedna ocena per urządzenie
- Widok `city_ratings`: średnia + count, ładowany przy otwarciu karty regionu
- Po wystawieniu: przycisk → „Twoja ocena: ★★★★☆ [Edytuj]"

### Wyświetlanie
- Karta regionu: „★ 4.3 (12 ocen)" przy każdym mieście
- Hero miasta: pełna średnia z liczbą głosów

---

## 10. ZGŁASZANIE UWAG

### Faza 1 — mailto
- Przycisk „Zgłoś uwagę" przy KAŻDYM przystanku (tylko rodzic)
- Dropdown: błędna cena / zamknięte / złe godziny / zły adres / inne
- Pole tekstowe + opcjonalne zdjęcie
- `mailto:kontakt@questini.com` z tematem:
  `[Uwaga] Perugia > Przystanek 03 Fontana Maggiore`

### Faza 2 — Supabase + agent AI
- Tabela `reports` z typem, statusem i miastem/przystankiem
- Agent AI czyta, sprawdza fakty, generuje PR lub taguje do review
- Powiadomienie: „Dzięki! Sprawdzimy."

---

## 11. BUY ME A COFFEE

```html
<script data-name="BMC-Widget" data-cfasync="false"
  src="https://cdnjs.buymeacoffee.com/1.0.0/widget.prod.min.js"
  data-id="questini"
  data-description="Wspieraj rodzinne przewodniki po Europie"
  data-message="Questini jest za darmo. Jeśli pomogło — postaw nam kawę!"
  data-color="#B4502E"
  data-position="Right"
  data-x_margin="18" data-y_margin="18">
</script>
```

Miejsca integracji:
- Floating widget na każdej stronie
- CTA na landingu (przed footerem)
- CTA po sekcji oceny w widoku rodzica

---

## 12. INFLUENCERZY

### Profil
- Rodzinny/travel, 5k–50k followersów (mikro/nano)
- Podróże autem po Europie z dziećmi
- Instagram, TikTok, YouTube
- Języki: PL, EN, DE, CS

### Modele
1. **Barter:** test Questini na wyjeździe, relacja w stories. Zwrot: dedykowany przewodnik.
2. **Affiliate:** link `questini.com/?ref=nazwa` z trackingiem.
3. **Co-creation:** influencer współtworzy przewodnik, kredytowany jako autor.
4. **UGC:** tag @questini → repost.

### Szablon outreach
```
Cześć [imię]!

Śledzę wasz profil i widzę, że [konkret]. Buduję Questini — darmowe
przewodniki po miastach Europy, które zamieniają zwiedzanie z dziećmi
w grę terenową.

Propozycja: opiszę miasto pod waszą trasę — gotowy plan od parkingu po
kolację. Wy testujecie, relacjonujecie. Zero opłat, zero zobowiązań.

questini.com

[imię]
```

---

## 13. PARTNERSTWA B2B

| Partner          | Produkt               | Integracja                               |
|------------------|-----------------------|------------------------------------------|
| **Zen.com**      | Karty wielowalutowe   | „Płać w € bez prowizji" + affiliate     |
| **Sail / Airalo**| eSIM podróżne         | „Internet w Europie" + affiliate         |
| **EasyPark**     | Parking app           | Link przy przystanku 01                  |
| **Booking.com**  | Noclegi               | „Szukaj noclegu" na stronie regionu      |
| **GetYourGuide** | Bilety                | Link przy biletowanych przystankach      |
| **Revolut**      | Karta wielowalutowa   | Alternatywa Zen                          |
| **CampRest**     | Campingi              | PL rynek                                 |

### Zasady
- TYLKO w widoku rodzica (nigdy w widoku dziecka)
- Chip „Partner" przy każdym linku — transparentność
- UTM: `?utm_source=questini&utm_campaign={miasto}`
- Sekcja „Przydatne w podróży" w footerze regionu
- Zero pop-upów, auto-play, reklam w treści przystanków

---

## 14. DESIGN SYSTEM

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

- Tło: `#FFFFFF` + trzy radial-gradient mgły (terra, olive, sea)
- Font: **Figtree** 400–800, bazowy **19px, min 18px**
- Cele dotykowe: **min 44×44px**
- Zaokrąglenia: 12 / 16 / 20 / 999
- Cienie: sh1 (akordeon), sh2 (karta), sh-hover (karta:hover)
- Logo: `questini` 800 + `.` terra + `com` 600 ink2

---

## 15. ANATOMIA KARTY MIASTA

### Hero
Zdjęcie full-bleed → ← wstecz + lang switcher → H1 + lead + chipy

### Przystanki (akordeony, jeden otwarty naraz)
**Przystanek 01 = ZAWSZE parking.**

Nagłówek (widoczny BEZ rozwinięcia):
1. `{num} · {time}` terra → nazwa 21px/600 → ▼
2. Chipy: rok budowy (neutral) + cena (olive)
3. Akcje: Nawiguj (terra) / Napisz (outline) / WWW (outline)

Wnętrze:
- Zdjęcie Wikimedia (`data-wiki`)
- Opis dorosły 2–3 akapity z datami — patrz zasada niżej
- Boks „Dla dzieci" (olive-bg)
- Boks „Zadanie foto" (sea-bg)
- Album zdjęć
- Zgłoś uwagę (tylko rodzic)

### Zasada: jak pisać `stop-desc` (opis dla rodzica)

**Ma dawać rodzicowi tyle wiedzy, żeby sam, bez googlowania, mógł coś
ciekawego opowiedzieć dziecku na miejscu.** Dwa krótkie zdania to za mało —
to jest materiał dla `box-kids`, nie dla `stop-desc`. Trzy trafione,
konkretne fakty w 2–3 akapitach.

**Format:** dwa akapity `<p class="stop-desc">` (osobne `<p>`, nie jeden
blok tekstu), 100–180 słów łącznie. Jeden akapit też wystarczy, jeśli
miejsce jest naprawdę drobne (np. krótki przystanek widokowy) — ale
wtedy nadal musi mieć konkretną treść, nie dwa ogólnikowe zdania.

**Co musi się znaleźć (nie wszystko naraz, ale przynajmniej 2–3 z tych):**
- konkretna data lub wiek („zbudowano w 1540 roku", nie „dawno temu")
- nazwisko: architekt, fundator, artysta, władca — ktoś, kogo można wymienić z imienia
- anegdota lub zwrot akcji — coś, co da się opowiedzieć jak mini-historię, nie tylko opisać
- „dlaczego to ważne" — kontekst, który tłumaczy, czemu w ogóle warto stanąć i patrzeć
- powiązanie z innym przystankiem trasy, jeśli istnieje (np. „ten sam akwedukt co przy fontannie z przystanku 03")

**Czego unikać:**
- ogólników bez treści („piękne, historyczne miejsce")
- zdań, które właściwie są opisem dla dziecka przepisanym innymi słowami
  (jeśli `stop-desc` i `box-kids` mówią to samo, `stop-desc` jest za płytki)
- wymyślonych faktów, dat, cen, nazwisk — jeśli nie masz pewności, pisz
  ostrożniej („podobno", „wg lokalnej tradycji") albo pomiń, nigdy nie zgaduj

**Rejestr — trzy różne głosy w jednym przystanku:**
| Element | Kto czyta | Długość | Ton |
|---|---|---|---|
| `stop-desc` | rodzic | 2–3 akapity, 100–180 słów | rzeczowy, konkretny, z datami i nazwiskami — jak dobry przewodnik turystyczny |
| `box-kids` | dziecko (lub rodzic na głos) | 1 zdanie, czasem pytanie/zadanie | proste, zaczepne, angażujące („znajdźcie…", „policzcie…") |
| `box-foto` | rodzic/dziecko przy aparacie | 1 zdanie | konkretna instrukcja kadru, nie opis miejsca |

Przykład złego `stop-desc` (za płytki — to jest właściwie `box-kids`):
„Papież zburzył dzielnicę i przykrył ją twierdzą. Dziś idzie się tam jak
zamrożonym w czasie miastem."

Przykład dobrego `stop-desc` (dwa akapity, patrz `wlochy/umbria/perugia.html`
przystanek 02 „Rocca Paolina" dla pełnego wzorca): zawiera datę (1540),
nazwisko architekta (Antonio da Sangallo Młodszy), przyczynę (wojna o sól),
zwrot akcji (Perugianie rozbierają fortecę w 1860) i sensoryczny detal na
zamknięcie (chłodno, cicho, podświetlone łuki).

Przed dodaniem nowego miejsca **sprawdź liczbę słów w `stop-desc`** — jeśli
suma akapitów w przystanku wychodzi poniżej ~60 słów, dopisz.

### Stopka miasta
- Plan dnia (tabela godzinowa)
- Punkty awaryjne — każdy wiersz (`.info-row`) ma tekst PLUS przycisk
  „Nawiguj" (`.info-nav`) do Google Maps, tak jak `.tel-row` ma klikalny numer
- Rozmówki (język użytkownika ↔ język lokalny)
- Telefony (klikalne)
- Oceń wycieczkę
- BMC CTA

---

## 16. PROCEDURY

### Dodawanie nowego miejsca
1. Wybierz kraj/region (utwórz katalog jeśli nowy)
2. Skopiuj wzorcowy plik miasta (`wlochy/umbria/perugia.html`)
3. Przystanek 01 = parking (Prowadź z lokalizacji użytkownika)
4. Każdy zabytek: chip roku + `data-wiki` do zdjęcia + **`stop-desc` wg
   zasady w sekcji 15** (2–3 akapity, konkretne fakty — nie dwa ogólnikowe
   zdania; sprawdź liczbę słów przed commitem)
5. Misje dla widoku dziecka (`box-kids` + `box-foto`) — dostaje je
   automatycznie `kids-view.js`, nic dodatkowo nie trzeba spinać
6. Dodaj do `places.html` i regionu `index.html`
7. Klucze tłumaczeń w `lang/*.json`
8. Commit + push → live w minutę

### Dodawanie nowego regionu
1. Utwórz katalog `/{kraj}/{region}/`
2. Skopiuj wzorcowy `index.html` regionu
3. Dodaj kartę regionu na stronie kraju / landingu
4. Klucze `region.{slug}.*` w `lang/*.json`

### Dodawanie nowego kraju
1. Utwórz katalog `/{kraj}/`
2. Dodaj do nawigacji i `places.html`
3. Dodaj na mapę SVG Europy (faza 2)

### Zależności JS
Zasada „zero dependencies" (sekcja 17) dotyczy frameworków (React, Vue,
jQuery i podobne) i zewnętrznych CDN-ów w runtime — nie zabrania w ogóle
żadnego kodu. Jedyny obecny wyjątek: `qrcode.js` (biblioteka
`qrcode-generator`, Kazuhiko Arase, licencja MIT) — zvendorowana jako
zwykły plik w repo, bez menedżera pakietów i bez fetchowania z CDN w
runtime, żeby kod QR działał offline i bez zapytań do zewnętrznych API
(zero trackerów zostaje zachowane). Jeśli dochodzi kolejna taka potrzeba:
vendoruj tak samo — jeden plik, bez build stepu, z komentarzem o źródle
i licencji na górze.

---

## 17. CZEGO NIGDY NIE ROBIĆ

- Tekst poniżej 18px
- Cele dotykowe poniżej 44×44px
- Ukrywanie akcji wewnątrz akordeonu
- Wymyślanie dat, cen, telefonów — brak źródła → „sprawdź na miejscu"
- Treści partnerskie w widoku dziecka
- Import frameworków JS/CSS (zero dependencies — wyjątek: patrz „Zależności JS" w sekcji 16)
- Łączenie regionów (Marche ≠ Umbria)
- Pop-upy, auto-play, overlay reklamy
- Tracking użytkowników (zero GA, zero pixeli, zero cookies śledzących)
- `localStorage` poza zdefiniowanymi kluczami
- PHP/server-side rendering (treść = pliki statyczne, interakcje = Supabase API)

---

## 18. GIT WORKFLOW

- Branch: `main` (jedyny, bezpośredni push)
- Commit: po polsku, opisowy, z zakresem zmian
- Push: wymaga PAT, token jednorazowy, usuwany z remote URL po pushu
- Deploy: automatyczny przez GitHub Pages (1–2 min po pushu)
- CNAME: `questini.com` (plik w repo root)

---

## 19. FAZY WDROŻENIA

### Faza 1 — MVP (obecna)
- [x] Design system v2
- [x] Landing page questini.com
- [x] Perugia (wzorzec karty miasta)
- [x] Rozdzielenie Marche / Umbria do osobnych katalogów (`/wlochy/marche/`, `/wlochy/umbria/`)
- [x] Migracja 6 miast na nowy szablon (format Perugii)
- [x] Widok dziecka (misje, checkboxy, progress, ranking rodzinny)
- [ ] i18n runtime + PL/EN/IT/DE
- [ ] Cookie policy + consent baner
- [ ] Menu / indeks miejsc (places.html)
- [ ] Zgłoszenia uwag (mailto)
- [ ] Buy Me a Coffee widget

### Faza 2 — interakcje
- [ ] Supabase: tabele ratings + reports
- [ ] System ocen (gwiazdki + komentarz + fingerprint)
- [ ] Średnie ocen na kartach regionów
- [ ] Zgłoszenia uwag przez formularz (Supabase)
- [ ] i18n: FR/ES/CS/SK/RO/AT/HR/EL/NO
- [ ] Mapa Europy (SVG + Leaflet)

### Faza 3 — wzrost
- [ ] Agent AI do moderacji uwag
- [ ] Partnerstwa B2B (Zen, Sail, EasyPark, Booking)
- [ ] Program influencerów
- [ ] Kolejne regiony (Toskania, Kraków, Chorwacja)
- [ ] PWA (offline, install prompt)
- [ ] System ocen z auth (Google/Apple sign-in)
