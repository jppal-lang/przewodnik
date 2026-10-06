---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["city.html","region.html","country.html"]
---

# Surface brief — Quolino (landing + kraj + region + karta miasta + widok dziecka)

Scope: cały serwis, jeden świat. Landing = Persuade; karta miasta = Operate (rodzic w terenie) i gra (dziecko).
Audience: rodzina z dziećmi 9–16 l. autem we Włoszech; rodzic planuje w domu i prowadzi w terenie; dziecko gra.
Action: wybrać miasto i ruszyć (landing/region); na miejscu: nawigacja do przystanku, misja dziecka.
Constraints: tekst ≥18px, dotyk ≥44px, zero km/czasów dojazdu, dziecko bez komercji, Quo dozwolone wszędzie, zero build stepu.
Build path: code-led (brak generowania obrazów w tej sesji).

## Direction contract

THESIS: Każde miasto to strona albumu z naklejkami (tradycja Panini, Modena) — przystanki to numerowane naklejki do zebrania, a rodzinny dzień to kompletowanie strony. Odrzuca „kremowy papier + terakota + zaokrąglone karty” typowe dla rodzinnych przewodników.

OWN-WORLD: Okładka i pasy albumu w głębokim azzurro (kolor reprezentacji Włoch) zajmują duże pola; strony z białego, gładkiego kartonu; naklejki = białe kartoniki z zaokrąglonymi rogami, cienkim obrysem i numerem w kapslu; puste miejsca = przerywany obrys z wielkim szarym numerem. Kolor „drużyny” miasta z bazy (bandana_color) maluje pas strony miasta. Złoto na naklejki-folie (kolacja, zachód słońca). Archivo: wąskie czarne kapitaliki do nazw, szerokie czarne cyfry do numerów, zwykła szerokość do tekstu. Statystyki przystanku jak odwrót naklejki: ROK · BILET · CZAS.

STORY: Rodzic widzi od razu cały album miast (co gotowe, co wkrótce), wybiera stronę = miasto, czyta plan jak album od parkingu (01) do kolacji (folia). Dziecko na tej samej stronie zbiera naklejki misjami. Wierzy: to jest gra i plan naraz, za darmo.

FIRST VIEWPORT: Landing: górny pas azzurro jak okładka albumu: po lewej tytuł albumu „Zwiedzanie z dziećmi, które dzieci naprawdę lubią” wąskimi kapitalikami, podtytuł, przycisk „Wybierz miasto”; prawa część pasa to arkusz naklejek miast — prawdziwe kafle-naklejki z ilustracjami Quo i numerami, klikalne (picker w formie roboczej), z pustymi miejscami „wkrótce”. Naklejka Quo #00 nachodzi na krawędź pasa. Karta miasta: pas w kolorze drużyny miasta z ogromną nazwą, licznikiem „0/11 naklejek” i przyciskiem trasy; pod nim strona albumu z rzędem naklejek przystanków.

FORM: Album naklejek (Panini), pozycja 3 na liście uporządkowanej wg rezonansu; seed key 67d7f2d0. Sygnaturowa interakcja: „przyklejenie” — zaznaczenie misji wkleja naklejkę w puste miejsce (krótki docisk z obrotem), licznik rośnie; hover unosi róg naklejki.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
