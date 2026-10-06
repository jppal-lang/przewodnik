# CLAUDE.md — Quolino (questini.com) — rdzeń projektu

> Ten plik czyta KAŻDA rola. Zawiera tylko to, co wspólne.
> Szczegóły kompetencji są w `docs/` — czytaj WYŁĄCZNIE plik swojej roli.

---

## 1. CZYM JEST QUOLINO

Quolino (dawniej Questini) zamienia zwiedzanie miast i atrakcji Europy w grę
terenową dla rodzin z dziećmi. Rodzic dostaje plan dnia (od parkingu po kolację),
dziecko dostaje misje i zagadki. Dwa widoki, jedno zwiedzanie.

- **Marka:** Quolino® · maskotka: popielica **Quo**
- **Etymologia:** Quolino = **Quo** (łac. „gdzie") + **-lino** (zdrobnienie) → „Dokąd, mały?"
- **Maskotka:** Quo — imię postaci chronione w ramach znaku Quolino® (bez osobnej rejestracji)
- **Slogan:** Let's Explore!
- **Model:** wszystko za darmo, wsparcie przez Buy Me a Coffee
- **Domena:** questini.com (OVH, DNS → GitHub Pages) — do czasu rejestracji quolino.com
- **Repo:** github.com/jppal-lang/przewodnik, branch `main`
- **Hosting treści:** GitHub Pages (statyczny HTML/CSS/JS)
- **Hosting interakcji:** Supabase (faza 2)

---

## 2. PODZIAŁ RÓL — KTO CZYTA CO

| Rola | Plik | Zakres |
|------|------|--------|
| **Redaktor** | `docs/REDAKCJA.md` | nowe lokalizacje, treść merytoryczna, misje dzieci, fakty |
| **Frontend** | `docs/FRONTEND.md` | design system, HTML/CSS/JS, widoki, dostępność |
| **Backend** | `docs/BACKEND.md` | Supabase, oceny, zgłoszenia, i18n runtime, postęp użytkownika |
| **Marketing** | `docs/MARKETING.md` | BMC, influencerzy, partnerstwa B2B, merch, licencje |
| **Maskotka** | `docs/QUOLINO.md` + `MASKOTKA-3D.md` | wizerunek, zasady użycia, 3D, IP |
| **PM** | `docs/PM.md` | cele, KPI, fazy, dashboard postępu |

Zasada: **nie edytuj plików spoza swojej roli.** Jeśli widzisz problem w cudzym
obszarze — zgłoś JP, on przekaże właściwej roli.

---

## 3. TWARDE ZASADY WSPÓLNE (obowiązują każdego)

1. **Zero frameworków** — czysty HTML/CSS/JS, zero build stepu, zero zależności.
2. **NIGDY czasów dojazdu** — żadnych km, minut jazdy, godzin wyjazdu/powrotu
   z bazy, "Wyjazd z Montefelcino" itp. Pokazujemy TYLKO: czas zwiedzania na
   miejscu, godziny otwarcia, kolejność przystanków. Rodzina sama decyduje
   kiedy jedzie.
3. **CNAME nie ruszać** — zostaje `questini.com` do rejestracji quolino.com.
4. **Tekst min 18px, cele dotykowe min 44×44px.**
5. **Zero trackingu** — bez GA, pixeli, cookies śledzących. Tylko localStorage
   ze zdefiniowanymi kluczami (lista w `docs/BACKEND.md`).
6. **Nie wymyślać faktów** — brak źródła ceny/daty/telefonu → "sprawdź na miejscu".
7. **Widok dziecka bez komercji** — zero partnerów, cen, BMC, ocen.
8. **Marche ≠ Umbria** — regiony zawsze osobno.
9. **Zero pop-upów i reklam w treści.** Auto-play wyłącznie dla filmu Quo na
   okładce strony głównej: bez dźwięku, w pętli, z przyciskiem pauzy
   (decyzja JP 2026-10-06).
10. **Maskotka Quo może występować wszędzie** — także w widoku rodzica
    (hero, kafle miast, zdjęcia tras). Decyzja JP 2026-10-06; zastępuje
    wcześniejszą zasadę „Quo tylko w widoku dziecka”.

---

## 4. OCHRONA MARKI I IP

- **Znak towarowy:** planowana rejestracja Quolino® w EUIPO (klasy 41, 42, 25).
  Szczegóły strategii IP: `docs/QUOLINO.md` §8.
- **Maskotka Quo:** imię postaci nie jest rejestrowane osobno — chronione jako
  element marki Quolino®. Analogia: Mickey → Disney, Żubr → Żubrówka.
- **Grafika maskotki:** generowana AI — wymaga dokumentowania procesu twórczego
  (prompty, iteracje, decyzje ludzkie) jako dowód wkładu twórczego.
  Docelowo: zlecenie rysownikowi wersji referencyjnej dla pełnej ochrony prawnoautorskiej.
- **Domena quolino.com:** do zarejestrowania (wolna na dzień analizy).

---

## 5. STRUKTURA PLIKÓW (skrót)

```
przewodnik/
├── index.html            # landing — okładka albumu z filmem Quo
├── country.html, region.html, city.html   # strony z danymi z Supabase
├── styles.css            # design system v4 „Album naklejek” — jedno źródło prawdy
├── legacy.css            # style starych stron /wlochy/
├── i18n-ui.js            # słownik UI (17 języków) + łańcuch języków dla danych
├── motion.js             # animacje (wklejanie naklejek, pauza filmu)
├── app.js, kids-view.js, stop-toc.js, qr-share.js, qrcode.js, migrate-storage.js
├── PRODUCT.md, DESIGN.md # prawda o produkcie i opis systemu wizualnego
├── .impeccable/          # kontrakt kierunku i tokeny (design.json)
├── lang/*.json           # tłumaczenia statyczne (stare strony)
├── media/                # hero.mp4, hero-poster.jpg, icons/, tours/
├── video/                # storyboard-quolino-animacja.md (storyboard + prompty AI)
├── wlochy/marche/        # stare strony: index + ancona, frasassi, urbino, rimini, rawenna
├── wlochy/umbria/        # stare strony: index + perugia, asyz
├── supabase-schema.sql, supabase-i18n-2026-10-06.sql
├── CNAME                 # questini.com — NIE RUSZAĆ
├── push.bat              # commit+push jednym klikiem (JP)
├── CLAUDE.md             # ten plik
├── docs/                 # instrukcje per rola
├── BACKLOG.md, DESIGN-BRIEF.md, MASKOTKA-3D.md
```

---

## 6. WORKFLOW

- Wykonawca (Cowork) zapisuje pliki na dysk → JP odpala `push.bat` → live w 1–2 min.
- Commity po polsku, opisowe.
- Fazy wdrożenia i status: `docs/PM.md`.
