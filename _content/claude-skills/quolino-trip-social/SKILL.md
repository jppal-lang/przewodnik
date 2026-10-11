---
name: quolino-trip-social
description: Posty w mediach społecznościowych o nowej wycieczce Quolino (Facebook, Instagram) i scenariusz rolki z animacją Quo w danym miejscu — pisanie (GPT) i kontrola (Claude).
---
# Quolino — posty o nowej wycieczce

Quolino to darmowy przewodnik dla rodzin z dziećmi połączony z grą terenową (questy dla dzieci przy każdym przystanku).
Maskotka: Quo, popielica w apaszce w kolorze miasta. Domena: questini.com (przejściowo).

## Zasady treści
- Piszesz WYŁĄCZNIE na podstawie danych wycieczki z polecenia. Zero nowych faktów, cen, godzin, rekordów, „najlepszy w Europie”.
  Jeśli czegoś nie ma w danych — nie piszesz o tym.
- Odbiorca: rodzic planujący wyjazd z dziećmi (4–12 lat). Ton: ciepły, konkretny, z humorem, bez infantylizmu i bez wykrzykników co zdanie.
- Język posta = język odbiorcy (podany w poleceniu). Piszesz natywnie w tym języku, nie tłumaczysz dosłownie z polskiego.
- Konkret zamiast przymiotników: 2–3 przystanki z nazwy, jeden quest dla dzieci (bez zdradzania rozwiązania), czas trasy, jedna praktyczna rada.
- Zawsze link do wycieczki (podany w poleceniu) i zachęta „zapisz na wyjazd” / „save for your trip”.
- Bez danych osobowych, bez wizerunku dzieci, bez obietnic bezpieczeństwa. Komercja (partnerzy, kawa) — nigdy w tych postach.
- Emoji z umiarem (najwyżej 3–4 w poście). Hashtagi tylko w Instagramie: 8–12, mieszanka ogólnych (rodzinne podróże) i lokalnych (miasto, region) w języku posta.

## Format (zawsze JSON, jeden obiekt na język)
```json
{ "lang": "pl",
  "facebook": "post 400–800 znaków, akapity, link na końcu",
  "instagram": "podpis 300–600 znaków + pusty wiersz + hashtagi",
  "reel_text": { "overlays": ["napis do ujęcia 1", "…"], "caption": "podpis rolki 150–300 znaków + 5–8 hashtagów" },
  "alt": "opis zdjęcia głównego dla niewidomych (1 zdanie)",
  "image_order": ["url1", "url2"] }
```
`image_order`: wybierz z podanych zdjęć 1–5 najlepszych w kolejności karuzeli (najpierw najbardziej „rodzinne”).

## Rolka = animacja Quo w danym miejscu (decyzja JP 2026-10-11)
Rolki (Reels / TikTok / Shorts) to krótka animacja maskotki Quo w prawdziwych miejscach wycieczki — nie zdjęcia z lektorem.
Jeden scenariusz na wycieczkę (obraz jest wspólny dla wszystkich języków); napisy i podpis — w każdym języku osobno (`reel_text`).
- Quo: popielica (Glis glis), rysunkowa, ciepła, nie infantylna (6–12 lat); apaszka w kolorze miasta (podany w poleceniu).
  Wygląd postaci trzymaj ściśle według opisu maskotki z polecenia — w każdym prompcie ten sam opis postaci.
- Miejsca: 3–5 przystanków z wycieczki, w kolejności trasy; architektura i krajobraz zgodne z rzeczywistością
  (żadnych wymyślonych budowli). Dzieci i ludzie — tylko z daleka, bez twarzy.
- Łuk: haczyk w 1–2 s (Quo coś odkrywa) → 2–3 miejsca → finał (Quo zadowolony, zaproszenie „zagraj z Quo”).
  9:16, 15–25 s, każde ujęcie 3–5 s. Bez tekstu i logo w samym obrazie (napisy dokładamy w montażu).
- Generowanie jest ręczne (JP, generator wideo AI): prompt na ujęcie po angielsku, samodzielny (pełny opis postaci,
  miejsca, ruchu kamery, światła, stylu) — tak, by każde ujęcie dało się wygenerować osobno.

Format rolki (osobne polecenie „ROLKA”):
```json
{ "title": "robocza nazwa", "bandana": "kolor apaszki", "duration_s": 20,
  "character": "stały opis Quo po angielsku (wklejany do każdego promptu)",
  "shots": [ { "n": 1, "place": "nazwa przystanku", "action": "co robi Quo (PL)", "seconds": 4,
               "camera": "ruch kamery", "prompt": "pełny prompt EN do generatora wideo" } ],
  "music": "nastrój muzyki", "end_card": "co na planszy końcowej (logo Quolino, link)" }
```

## Kontrola (Claude)
Sprawdź każdy fakt w poście z danymi wycieczki. Popraw wszystko, czego nie ma w danych, zdradzone rozwiązania questów,
ton, błędy językowe, długość. W rolce sprawdź dodatkowo: czy miejsca są z wycieczki i wyglądają w prompcie jak naprawdę
(sprawdź w źródłach, jeśli masz dostęp do sieci), czy opis Quo jest identyczny w każdym ujęciu, czy apaszka ma kolor miasta,
czy nie ma twarzy dzieci, tekstu ani logo w obrazie. Odpowiedz tym samym JSON-em, poprawionym, z polem `"check": "ok"` albo
`"check": "poprawione: <co>"`.
