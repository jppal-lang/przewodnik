# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- Rodziny z dziećmi (głównie 9–16 lat) zwiedzające miasta Europy autem; dziś przede wszystkim polscy turyści we Włoszech (Marche, Umbria).
- Rodzic: dwie sceny po równo — planowanie w domu (wieczór, laptop/telefon na kanapie: wybór regionu i miasta na jutro) oraz teren (telefon w ręku, w słońcu na włoskiej uliczce, dziecko obok: karta miasta przystanek po przystanku).
- Dziecko: ten sam przewodnik w „widoku dziecka” (QR / `?view=kid`) — misje, zagadki, checkboxy, bez komercji.

## Product Purpose
Quolino zamienia zwiedzanie miasta w grę terenową dla rodziny. Rodzic dostaje gotowy plan dnia od parkingu po kolację (godziny, ceny, nawigacja, ZTL, plan awaryjny, rozmówki, telefony); dziecko dostaje misję na każdym przystanku. Sukces: rodzina otwiera plan na telefonie i jedzie, dziecko nie marudzi, rodzice zwiedzają w spokoju.

## Positioning
Jeden plan, dwa widoki: przewodnik dla dorosłego i gra terenowa dla dziecka nad tą samą trasą, oparte na zweryfikowanych faktach, za darmo. Trasa zawsze zaczyna się od parkingu i kończy kolacją; godziny ułożone pod klimat (omijają upał).

## Operating Context
- Kolejność: landing → kraj → region → miasto (city.html, dane z Supabase) → widok dziecka.
- W terenie: Google Maps (nawigacja do przystanków), WhatsApp do restauracji, QR do przekazania widoku dziecku.
- Wsparcie projektu przez Buy Me a Coffee (tylko widok rodzica).

## Capabilities and Constraints
- Statyczny HTML/CSS/JS na GitHub Pages, zero frameworków i build stepu; dane i tłumaczenia z Supabase; 13+ języków (layout musi znieść +30% dłuższy tekst).
- Twarde zasady (CLAUDE.md): nigdy km/czasów dojazdu; tekst min 18px, dotyk min 44×44px; zero trackingu; widok dziecka bez cen, BMC, ocen, partnerów; Marche ≠ Umbria; zero pop-upów i auto-play reklam; nie wymyślać faktów.
- Nazwa: Quolino®, domena questini.com (do czasu quolino.com). Maskotka: popielica Quo.

## Brand Commitments
- Nienaruszalne: grafiki maskotki Quo (media/icons/pose-*) i ikony przystanków (media/icons/icon-*), zdjęcia tras z Quo (media/tours).
- Quo może występować wszędzie, także w widoku rodzica (decyzja JP 2026-10-06; zastępuje dawną zasadę „Quo tylko w widoku dziecka”).
- Logo tekstowe, paleta i krój pisma: do zmiany przy redesignie (decyzja JP 2026-10-06).
- Slogan: Let's Explore!

## Evidence on Hand
- 8 opublikowanych miast (Marche: Urbino, Ancona, Frasassi, Rimini, Rawenna; Umbria: Perugia, Spello, Asyż), 60+ przystanków z misjami w Supabase.
- Ilustracje: 15 póz Quo, 15 ikon kategorii przystanków, hero-ilustracje Perugii, Spello, Asyżu; wideo hero (media/hero.mp4).
- Brak: opinii użytkowników, liczb użycia, partnerów — nie wolno ich wymyślać.

## Product Principles
1. Najpierw rodzina w terenie: wszystko czytelne jedną ręką, w słońcu, w biegu.
2. Dwa widoki, jedna marka: dziecko gra, rodzic planuje — ten sam świat, inna rola.
3. Fakty albo „sprawdź na miejscu” — zero zmyśleń, zero czasów dojazdu.
4. Za darmo i bez śledzenia; wsparcie dobrowolne i nigdy przy dziecku.

## Accessibility & Inclusion
Tekst treści min 18px, cele dotykowe min 44×44px, kontrast czytelny w pełnym słońcu, `prefers-reduced-motion` respektowane.
