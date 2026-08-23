# Spello — poprawki do zamówienia u ChatGPT

Wklej poniższe do projektu ChatGPT jako jedno polecenie. Instrukcje projektu
(`CHATGPT-PROJEKT.md`) są już zaktualizowane, więc reguły zna — to jest lista tego,
co w oddanym Spello trzeba naprawić.

---

Popraw pliki `spello.meta.json` i `spello.pl.json`. Źródłem prawdy jest
`Spello_Questini_komplet_v31.html`. Nie przepisuj tekstów, które są poprawne.

**1. Wstęp miasta — przepadł przy pierwszym oddaniu.**
Weź go dosłownie z dokumentu:
- `city.subtitle` = opisowy człon nagłówka: „rzymskie mozaiki, renesansowe freski i legenda o Orlando"
- `city.lead` = oba akapity wstępu („Spello najlepiej odkrywać powoli…" oraz „To trasa dla rodzin…"), rozdzielone pustym wierszem
- `city.hero_note` = cała ramka „🌅 Po drodze…"

**2. Objętość opisów.** Osiem punktów z jedenastu ma jeden akapit, a kolacja jedenaście.
Wyrównaj do 2–4 akapitów przy każdym punkcie. Kolacja nie jest wyjątkiem — nadmiar
z osterii rozłóż albo skróć, nie przenoś do innych pól.

**3. Zadanie foto (`photo_task`) — brak we wszystkich 11 punktach.** Uzupełnij: jedno zdanie,
konkretny obiekt do sfotografowania i powód, dla którego akurat ten.

**4. Nazwy punktów wersalikami.** `"PORTA CONSOLARE"` → `"Porta Consolare"`, w każdym punkcie.

**5. `price` i `opening_hours` bez komentarzy o pewności.**
- `"€8 dorosły / €4 dziecko 6–14 lat — do ponownej weryfikacji"` → `"€8 dorosły / €4 dziecko 6–14 lat"` + `price_status: "unverified"`
- `"wymaga weryfikacji"` → `null`
- `"godziny sezonowe wymagają sprawdzenia"` → `null` + `hours_status: "unverified"`

**6. `year_built` to rok albo okres, nie zdanie.**
`"odkrycie pozostałości willi — lipiec 2005"` → `"I w. p.n.e."` (faza budowy), a okoliczności
odkrycia przenieś do `desc_paragraphs`.

**7. `dress_code`.** Osiem punktów ma „brak szczególnych wymogów" — tam ma być `null`.
Zostaw wypełnione tylko przy Sant'Andrea i Santa Maria Maggiore.

**8. `hint` pisany do dziecka, w drugiej osobie.**
`"Dziecko powinno wskazać konkretny detal…"` → `"Popatrz na dolne bloki bramy — …"`.

**9. Brakujące `lat`/`lon`** przy: `porta-consolare`, `via-giulia`, `vicoli-belvedere`.

**10. Kontakt do lokali.** `gelateria-la-paola` i `osteria-del-buchetto` potrzebują
`phone` (format międzynarodowy) i `website`. Osteria ma `reservation: "recommended"`,
więc bez telefonu ta informacja jest bezużyteczna. Numeru nie wymyślaj — brak
potwierdzenia to `null` i notka w `_notes`.

**11. `wiki_article` i `wiki_lang` → `null`.** Zdjęcia rysujemy sami, Wikipedia nie jest
już źródłem grafiki.

Po poprawkach oddaj oba pliki. Tłumaczeń jeszcze nie rób.

---

Dopiero gdy polska wersja przejdzie weryfikację — i etapami, zgodnie z §19:

1. > Przetłumacz Spello na angielski.
2. > Przetłumacz Spello na włoski.
3. > Skonfrontuj wersję angielską i włoską z polską: kompletność, fakty, daty i liczby,
   > nazwy własne, terminy historyczne, sens legend, nic dodanego ani utraconego, naturalność.
4. > Przetłumacz Spello na pozostałe języki.

Angielski jest wersją kontrolną, włoski — kontrolą kulturową dla atrakcji we Włoszech.
Przeskoczenie wprost z polskiego na kilkanaście języków rozsyła ewentualny błąd
w kilkanaście miejsc naraz.
