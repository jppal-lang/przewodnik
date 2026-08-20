# REDAKCJA.md — rola: Redaktor treści

Zakres: nowe lokalizacje, treść merytoryczna przewodników, misje dla dzieci.
Nie ruszasz: CSS, JS, Supabase, marketingu, maskotki.

---

## 1. ZASADY TREŚCI

### Widok rodzica
- Opisy zabytków: 2–3 akapity, historia, kontekst, daty budowy
- Ceny biletów, godziny otwarcia, ostrzeżenia ZTL
- Rozmówki (język użytkownika ↔ lokalny), telefony awaryjne
- Plan dnia: tabela godzinowa — TYLKO godziny na miejscu

### Widok dziecka (misje)
- Karta misji per przystanek: co znaleźć, policzyć, sfotografować
- Misje konkretne i wykonalne na miejscu ("policz przęsła mostu", nie "poczuj atmosferę")
- Boks "Dla dzieci": 2 punkty ciekawostek na poziomie 8–12 lat
- Boks "Zadanie foto": jedno konkretne ujęcie z instrukcją

### BEZWZGLĘDNY ZAKAZ (naruszenie = poprawka całego pliku)
- ŻADNYCH odległości (km) i czasów dojazdu ("ok. 1h05", "25 km")
- ŻADNYCH godzin wyjazdu/powrotu z bazy ("Wyjazd z Montefelcino 8:25", "powrót ok. 17:30")
- ŻADNYCH sztywnych ram całego dnia zależnych od miejsca noclegu
- Plan dnia zaczyna się od PARKINGU w mieście, kończy na ostatnim przystanku

### Fakty
- Brak źródła ceny/daty/telefonu → napisz "sprawdź na miejscu"
- Nazwy własne zabytków: oryginał lokalny ("Fontana Maggiore")
- Ceny, godziny, telefony, linki: nie tłumaczone

---

## 2. ANATOMIA KARTY MIASTA (co wypełniasz)

- **Hero:** H1 + lead (1–2 zdania z pazurem) + chip charakteru dnia
  (np. "starówka pieszo od mostu do łuku") — bez km/czasów
- **Przystanek 01 = ZAWSZE parking** (cena, ZTL, alternatywy)
- Każdy przystanek: numer · godzina na miejscu → nazwa → chipy (rok budowy,
  cena) → opis dorosły → boks dzieci → boks foto
- **Stopka:** plan dnia, punkty awaryjne, rozmówki, telefony

---

## 3. PROCEDURY

### Nowe miejsce (miasto/atrakcja)
1. Wybierz kraj/region (nowy katalog jeśli trzeba)
2. Skopiuj wzorcowy plik miasta (wzorzec: perugia.html)
3. Przystanek 01 = parking
4. Każdy zabytek: chip roku + `data-wiki` (nazwa artykułu Wikipedii do zdjęcia)
5. Misje dla widoku dziecka do każdego przystanku
6. Zgłoś JP: dodanie do `places.html` i `index.html` regionu (frontend)
7. Zgłoś JP: klucze tłumaczeń (backend)

### Nowy region
1. Katalog `/{kraj}/{region}/` + skopiowany `index.html` regionu
2. Regiony ZAWSZE osobno (Marche ≠ Umbria)

---

## 4. CHECKLIST PRZED ODDANIEM PLIKU

- [ ] Zero km, zero czasów dojazdu, zero godzin wyjazdu/powrotu z bazy
- [ ] Przystanek 01 = parking
- [ ] Każdy przystanek ma misję dziecka i zadanie foto
- [ ] Fakty ze źródłem albo "sprawdź na miejscu"
- [ ] Plan dnia = tylko godziny na miejscu
