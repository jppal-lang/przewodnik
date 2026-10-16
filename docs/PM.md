# PM.md — rola: Project Management

Zakres: cele, KPI, fazy, priorytety, dashboard postępu.
Backlog szczegółowy: `BACKLOG.md` (root repo).

---

## 0. KAMIEŃ MILOWY — 1 CZERWCA 2027: PLANY PŁATNE

Decyzja JP 2026-10-16. Od tego dnia Quolino sprzedaje plany; pierwsza wycieczka po rejestracji zostaje darmowa.
Musi być gotowe przed 1 czerwca 2027 (terminy pośrednie — propozycja do akceptacji JP):

| Do | Co | Gdzie |
|----|----|-------|
| 31 sty 2027 | Konta: Google + e-mail, sesje, token QR dla dziecka (etap B) | `docs/DOSTEP-I-KONTA.md` §4, §6 |
| 31 sty 2027 | API zamknięte: anonimowo tylko 1–2 akapity na przystanek | `docs/DOSTEP-I-KONTA.md` §3 |
| 31 mar 2027 | Panel rodzica na koncie: album, wyzwania, kody, prywatność | `konto.html`, `docs/KONTO-RODZICA.md` |
| 31 mar 2027 | Kody na darmowe trasy i rabaty (`QUO-XXXX-XXXX`), wydawanie przez Hermesa | `docs/KONTO-RODZICA.md` §2 |
| 30 kwi 2027 | Płatności w trybie testowym (Dodo Payments, MoR), webhooki, ceny | `docs/DOSTEP-I-KONTA.md` §6 etap C |
| 15 maj 2027 | Regulamin, polityka prywatności, teksty o braku prawa odstąpienia PL/EN — sprawdzone przez prawnika | `docs/PLATNOSCI-ODSTAPIENIE.md` |
| 1 cze 2027 | **Start sprzedaży** | — |

Zasada sprzedaży: treść cyfrowa z natychmiastowym dostępem — po zgodzie klienta brak prawa odstąpienia
(teksty PL/EN: `docs/PLATNOSCI-ODSTAPIENIE.md`).
Wyzwanie dla rodziców: 5 udostępnionych wycieczek → 5% zniżki na kolejny zakup.

## 1. CELE PROJEKTU (DO UZUPEŁNIENIA PRZEZ JP)

| Cel | Metryka | Wartość docelowa | Termin |
|-----|---------|------------------|--------|
| Ruch | odwiedziny/mies. (GitHub Pages / Cloudflare stats) | ___ | ___ |
| Zasięg treści | liczba miast live | 7 → ___ | ___ |
| Języki | wersje językowe live | 1 (PL) → ___ | ___ |
| Zaangażowanie | ukończone misje (localStorage → f.2 Supabase) | ___ | ___ |
| Oceny | liczba ocen / średnia | ___ | ___ |
| Przychód | kawy BMC / mies. | ___ zł | ___ |
| Współprace | aktywni influencerzy / partnerzy B2B | ___ | ___ |

> Uwaga: projekt nie ma trackingu użytkowników (twarda zasada) — pomiary ruchu
> tylko z logów hostingu/DNS lub statystyk BMC, nie z GA.

## 2. KPI TYGODNIOWE (szkielet dashboardu)

- [ ] Nowe miasta dodane: ___
- [ ] Poprawki zgłoszeń treści: ___
- [ ] Kawy BMC: ___
- [ ] Outreach wysłany / odpowiedzi: ___ / ___
- [ ] Commity / deploye: ___

## 3. FAZY WDROŻENIA — STATUS

### Faza 1 — MVP (obecna)
- [x] Design system v2
- [x] Landing page
- [x] Perugia (wzorzec karty miasta)
- [x] Rozdzielenie Marche / Umbria
- [x] Migracja miast na nowy szablon (7 miast live)
- [x] Rebranding na Quolino (kod; domena czeka na quolino.com)
- [ ] Widok dziecka (misje, checkboxy, progress)
- [ ] i18n runtime + PL/EN/IT/DE
- [ ] Cookie policy + consent baner
- [ ] places.html (indeks miejsc)
- [ ] Zgłoszenia uwag (mailto)
- [ ] Buy Me a Coffee widget

### Faza 2 — interakcje
- [ ] Supabase (ratings + reports), system ocen, średnie na kartach
- [ ] i18n: pozostałe 9 języków
- [ ] Mapa Europy (SVG + Leaflet)

### Faza 3 — wzrost
- [ ] Agent AI do moderacji uwag
- [ ] Partnerstwa B2B, program influencerów
- [ ] Nowe regiony (Toskania, Małopolska, Chorwacja)
- [ ] PWA (offline), auth (Google/Apple)

## 4. RYZYKA

| Ryzyko | Mitygacja |
|--------|-----------|
| Naruszenie zasad treści (czasy dojazdu itp.) | checklist w REDAKCJA.md, audyt przed każdym deployem |
| Dwie lokalizacje repo na dysku (C: i D:) | jedyne źródło prawdy: D:\PROGRAFIT\questini.com\...\przewodnik + push.bat |
| Rebranding domeny | CNAME nie ruszany do rejestracji quolino.com |
| Free tier Supabase | wdrożenie dopiero przy realnym ruchu (faza 2) |

## 5. RYTM PRACY

- Deploy: pliki na dysk → push.bat → live 1–2 min
- Role nie edytują cudzych plików; konflikty rozstrzyga JP
- Przegląd statusu faz: przy każdej większej zmianie aktualizować sekcję 3
