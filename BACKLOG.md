# BACKLOG — notatki uporządkowane

Źródło: notatki głosowe z 19.08.2026, 17:04–17:35 (14 pozycji).

**Legenda statusu:**
`→ CLAUDE.md §X` — przeniesione do instrukcji projektu jako obowiązująca zasada
`OTWARTE` — wymaga decyzji
`PÓŹNIEJ` — świadomie odłożone

---

## A. MODEL BIZNESOWY I PODMIOT

### A1. Forma prawna — fundacja czy spółka
**OTWARTE.** Fundacja daje dostęp do grantów (precedens: Fundacja Questingu,
110 tys. zł z MSiT w 2022) i wiarygodność, ale ogranicza komercję. Spółka
odwrotnie. Trzeci wariant: fundacja prowadzi serwis, osoba fizyczna posiada
markę i licencjonuje ją fundacji.

**Ustalone:** właścicielem marki i wizerunku maskotki pozostaje osoba fizyczna,
niezależnie od formy podmiotu operacyjnego.
**Następny krok:** konsultacja podatkowa przed rejestracją czegokolwiek.
→ CLAUDE.md §19

### A2. Monetyzacja — kolejność
1. BMC (teraz) → 2. affiliate B2B (przy ruchu) → 3. reklama (przy realnym
ruchu) → 4. ewentualnie premium.
**OTWARTE:** płatny region vs sponsoring vs granty. Decyzja wymaga danych
o ruchu, których nie mamy.
→ CLAUDE.md §19

### A3. Reklama — zasady twarde
Wyłącznie widok rodzica. Nigdy w widoku dziecka. Nigdy obok maskotki.
Format: pasek zamykalny albo interstitial z X po 5 s. Zero auto-play.
Serwis jest mobile-first, więc reklama nie może zasłaniać nawigacji.
**OTWARTE:** próg ruchu, przy którym reklamodawcy są zainteresowani.
→ CLAUDE.md §19

### A4. Licencjonowanie maskotki
Docelowo źródło przychodu niezależne od serwisu: merchandising, wydawnictwa,
licencje regionalne. Warunek: zarejestrowany znak graficzny i czysta
dokumentacja autorstwa.
→ CLAUDE.md §2, §22 · PÓŹNIEJ (faza 3)

### A5. Pozycjonowanie strategiczne
Airbnb, Booking i Pyszne mają content od dostawców. **My tworzymy cały content
sami i za niego odpowiadamy.** To trudniejszy model — i główne ryzyko
skalowania projektu.

Konsekwencja: automatyzacja tworzenia i weryfikacji treści nie jest
usprawnieniem, tylko **warunkiem istnienia** portalu w większej skali.
→ patrz C4, C5

---

## B. TECHNICZNE

### B1. Telemetria i pomiar użycia
Kluczowe zdarzenie: **kliknięcie „Nawiguj"**. Jeśli widzimy klik z przystanku
05 do 08, wiemy, że aplikacja towarzyszyła rodzinie w terenie — nawet bez
żadnej oceny.

Metryki: % ukończenia trasy · najczęściej pomijane przystanki · średnia liczba
misji · czas między pierwszym a ostatnim zdarzeniem · rozkład widoków.

Zasada: anonimowy `session_hash` (losowy UUID, nie fingerprint), zero GA,
zero pikseli, zgoda w banerze.
→ CLAUDE.md §7, §10

### B2. Problem offline
Jeśli rodzina straci zasięg, dane będą niepełne. **Akceptujemy to** — nie
obchodzimy tego kosztem prywatności.

Rozwiązanie: kolejka zdarzeń w `localStorage`, dosyłka przy powrocie sieci,
wygaszanie po 7 dniach. Założenie: rodzic ma internet, pełny offline
projektujemy tylko dla widoku dziecka.
→ CLAUDE.md §7, §10

### B3. Skalowanie serwerowe
Pęknie najpierw Supabase free (50k requestów/mies.), nie GitHub Pages.
**Próg:** >30k sesji/mies. → Supabase Pro (~25 USD/mies.), rozważyć
Cloudflare Pages. Nie optymalizować wcześniej.
→ CLAUDE.md §3

### B4. Edytor trasy
Rodzic wyłącza dowolny przystanek. Zapis `quolino_route:{miasto}`.
Widok dziecka natychmiast się przelicza.
→ CLAUDE.md §5 · **do zbudowania w fazie 1**

### B5. System punktów — reguła nienaruszalna
```
punkty = round( (ukończone_misje / misje_w_planie_rodzica) * 10 )
```
Mianownik to plan **po edycji rodzica**. Dziecko nigdy nie traci punktów za
decyzję dorosłego. 100% planu = 10/10 + uśmiech Quolina, bezwarunkowo.
→ CLAUDE.md §5, §24 · **nie podlega optymalizacji**

---

## C. CONTENT

### C1. Zakaz podawania czasów dojazdu
Nie znamy punktu startu, korków, parkingu ani tempa z dzieckiem. Podana
godzina będzie błędna, a rodzic na niej polegnie.

Podajemy: czas zwiedzania przystanku · godziny otwarcia · kolejność.
Plan dnia to **sekwencja, nie rozkład jazdy**.
→ CLAUDE.md §16, §24 · **wymaga przeglądu istniejących treści Perugii**

### C2. Prawo autorskie i antyplagiat
Min. 2 niezależne źródła dla zabytków (Wikipedia + strona oficjalna).
Źródła w komentarzu HTML przy przystanku. Opis pisany od zera — parafraza
z podmienionymi synonimami to nadal kopia. Fakty (daty, wymiary, nazwiska)
są wolne, sformułowania nie.

**Wyjątek:** knajpy, kawiarnie, parkingi, sklepy — Wikipedia ich nie opisuje,
źródłem jest strona lokalu, Mapy Google i wizyta własna.

Zdjęcia: wyłącznie Wikimedia Commons z atrybucją.
→ CLAUDE.md §17

### C3. Wycieczki całodniowe, metropolie, sezonowość
Rzym, Londyn, Warszawa, Kopenhaga nie mieszczą się w jednym dniu.

Dla każdej: kilka tras tematycznych · warianty sezonowe (jesień/wczesna wiosna
z przewagą wnętrz, lato z przewagą cienia) · **wariant deszczowy** dla każdego
miasta · chip sezonu przy trasie.

Uzasadnienie: jesienią w Rzymie chodzenie po Forum z siedmiolatkiem w deszczu
kończy karierę przewodnika.
→ CLAUDE.md §18 · faza 2/3

### C4. Automatyzacja tworzenia treści
Warunek skalowania, nie usprawnienie. Obejmuje generowanie szkiców opisów,
tłumaczenia na 13 języków i przygotowanie misji.

**OTWARTE:** gdzie postawić granicę. Propozycja: agent tworzy szkic
i tłumaczenia, człowiek zatwierdza każdy przystanek przed publikacją.
PÓŹNIEJ (faza 3)

### C5. Agent weryfikacji aktualności
Argument „łuk triumfalny stoi 2000 lat" jest w połowie trafny — zmienia się
to, co decyduje o dniu rodziny: ceny, godziny, **remonty, rusztowania,
zamknięcia**.

Plan: agent sprawdza **jeden kraj dziennie**, cyklicznie. Porównuje ceny
i godziny ze stronami oficjalnymi, flaguje rozbieżności, generuje PR.

To realna przewaga nad papierowym przewodnikiem — papier nie wie, że obiekt
jest w remoncie. Warto to komunikować jako feature.

Do czasu agenta: chip „zweryfikowano: MM.RRRR" przy każdym przystanku.
→ CLAUDE.md §17 · faza 3

---

## D. WYGLĄD I UX

### D1. Regulacja wielkości tekstu
A− / A / A+ w widoku rodzica, skala 17/19/22 px, zapis w localStorage.
→ CLAUDE.md §15 · **faza 1, prosty do zrobienia**

### D2. Akordeon — do przeprojektowania
W widoku dziecka akordeon wystarcza. W widoku rodzica ukrywa treść potrzebną
**w ruchu, jedną ręką, na słońcu**.

Trzy warianty do przetestowania na Perugii:
1. Pełna lista rozwinięta + sticky spis przystanków
2. Karty pełnoekranowe ze swipe
3. Akordeon otwarty domyślnie na najbliższym geograficznie przystanku

Decyzja **po testach z grupą testerów**, nie z góry.
→ CLAUDE.md §15 · faza 2

### D3. Maskotka — trzy stany energii
Śpiący → ciekawy → rozpędzony, wg % ukończenia misji. Pasek postępu to
poziom energii Quolina. Kanon zatwierdzony 19.08.2026.
→ MASKOTKA-3D.md · faza 1

---

## E. PRAWO, MARKA, IP

### E1. Rejestracja marki i domen — checklista
Pełna lista w CLAUDE.md §22: weryfikacja (OVH, EUIPO, UPRP, UIBM, app store)
→ domeny (6 pozycji) → social media (7) → usługi (4) → znaki towarowe (2)
→ migracja z Questini (4).

**Priorytet: zablokować wszystko, zanim cokolwiek opublikujesz.**
→ CLAUDE.md §22 · **blokuje resztę fazy 1**

### E2. Rejestracja maskotki jako znaku graficznego
Znak słowny „Quolino" + znak graficzny (wizerunek). Klasy 09/39/41,
dodatkowo 28 (zabawki) i 16 (druk) pod przyszłe licencje.

Terytorium: EUIPO, rozszerzenie przez protokół madrycki.

**Krytyczne:** jeśli maskotkę rysuje ktoś zewnętrzny — umowa z **przeniesieniem
autorskich praw majątkowych**, nie licencją. Bez tego nie da się jej później
licencjonować dalej.
→ CLAUDE.md §2, §22

---

## F. UŻYTKOWNICY I SPOŁECZNOŚĆ

### F1. Grupa testerów
Największa dziura w projekcie — zero testów z prawdziwą rodziną w terenie.
Większa niż nazwa i niż liczba miast.

Cel: 8–12 rodzin, dzieci 6–12 lat, min. jedna zagraniczna.
Skąd: znajomi (3–4 natychmiast) → grupy FB o podróżach z dziećmi → szkoły
i przedszkola → mikroinfluencerzy jako testerzy przed ambasadorstwem.

Mierzymy: czy dziecko dotrwało do końca · na którym przystanku padło „nudzi
mi się" · czy rodzic znalazł przełącznik widoku · czy użył edytora trasy ·
czy telefon wytrzymał cały dzień.

Ankieta 5 pytań (nie 20) + jedna rozmowa. Wnioski w `TESTY.md`.
→ CLAUDE.md §20 · **faza 1, można zacząć w tym tygodniu**

### F2. Feedback jawny
Oceny gwiazdkowe + komentarze przy trasie i przy pojedynczych atrakcjach.
→ CLAUDE.md §10 · faza 2

---

## G. OPERACJE

### G1. Customer service — struktura działów
| Dział | Zakres | Mail |
|-------|--------|------|
| Trasy | ceny, godziny, zamknięcia, adresy | trasy@ |
| Aplikacja | błędy techniczne, offline | pomoc@ |
| Współpraca | media, influencerzy, B2B, miasta | wspolpraca@ |
| Prawne / IP | licencje, prawa do zdjęć, naruszenia | prawne@ |

Wszystkie na jedną skrzynkę do czasu, aż wolumen wymusi podział.
→ CLAUDE.md §21 · faza 3

---

## PODSUMOWANIE — KOLEJNOŚĆ

### Ten tydzień
1. **E1** — checklista rejestracji, domeny i social media (blokuje wszystko)
2. **F1** — odezwij się do pierwszych trzech rodzin
3. **C1** — przejrzyj Perugię i usuń czasy dojazdu

### Faza 1
4. **D3** — maskotka, cztery stany + wersja ikonowa
5. **B4 + B5** — edytor trasy i system 10 punktów
6. **D1** — regulacja wielkości tekstu
7. Rozdzielenie Marche/Umbria, migracja miast, i18n PL/EN/IT/DE

### Faza 2
8. **B1 + B2** — telemetria i kolejka offline
9. **D2** — decyzja o akordeonie po testach
10. **F2** — oceny
11. **C3** — pierwsze warianty sezonowe

### Faza 3
12. **C4 + C5** — agenci treści i weryfikacji
13. **A1 + A2 + A3** — podmiot, monetyzacja, reklama
14. **A4 + E2** — licencjonowanie maskotki
15. **G1** — customer service

---

## DECYZJE, KTÓRE MUSISZ PODJĄĆ SAM

1. **Czy questini.com zostaje** jako przekierowanie 301, czy wygasa? *(wpływa na E1)*
2. **Kto rysuje maskotkę finalnie** — generator, ty, czy grafik? Jeśli grafik,
   potrzebna umowa z przeniesieniem praw. *(blokuje E2 i A4)*
3. **Ile miast przed pierwszym testem** — testujemy na samej Perugii, czy
   czekamy na komplet sześciu? *(wpływa na F1)*
4. **Fundacja czy spółka** — konsultacja podatkowa powinna być przed
   rejestracją znaku, żeby wiedzieć, na kogo go zgłosić. *(wpływa na E2)*
