---
name: lemo-opuscar
description: Krótki film zrobiony w całości kodem, w jednym ze stylów biblioteki Lemo-Opuscar (66 stylów, github.com/lemomo-ai/lemo-opuscar, MIT + CC BY 4.0). Używaj, gdy JP prosi o film, rolkę, promo albo animację (np. Quo w danym mieście). Nie do zwykłej edycji gotowego wideo.
---

# Lemo-Opuscar (Hermes)

Style, przewodniki i narzędzia są w bibliotece Lemo-Opuscar. Ten skill ją pobiera i przekazuje jej sterowanie.

1. **Biblioteka.** Jeśli `~/lemo-opuscar/AGENTS.md` istnieje: `git -C ~/lemo-opuscar pull --quiet --depth 1`. Jeśli nie:
   `git clone --quiet --depth 1 --filter=blob:none --sparse --branch main https://github.com/lemomo-ai/lemo-opuscar.git ~/lemo-opuscar && git -C ~/lemo-opuscar sparse-checkout set --no-cone '/*' '!/styles/*/demo/' '!/styleboard/' '!/docs/frames/'`.
   `LIB=~/lemo-opuscar` (ścieżka bezwzględna).
2. **Narzędzia.** `$LIB/TECHNIQUE.md` §1: pakiety Node i Pythona instaluj w bibliotece. Brak ffmpeg, Chromium albo Node w kontenerze
   → zgłoś JP jednym zdaniem (instalacja systemowa = zmiana na serwerze, decyzja JP), nie instaluj sam.
3. **Postępuj według biblioteki:** przeczytaj `$LIB/AGENTS.md` i rób, co mówi (wybór stylu, jedna runda pytań do JP, scenariusz, produkcja, oddanie).
4. **Projekt:** `/opt/data/quolino/work/films/<nazwa>/`; narzędzia uruchamiaj z `$LIB` ze ścieżką projektu.

Zasady Quolino: Quo jak na referencji obrotu (złoto-pomarańczowa popielica, kremowy brzuszek, terakotowa chusta), bez ludzi
z rozpoznawalnymi twarzami, bez czasów dojazdu, bez wymyślonych faktów; tekst w filmie po polsku według humanizera.
Koszt: film to dużo wywołań — zanim zaczniesz, podaj JP szacunek i poczekaj na zgodę.
