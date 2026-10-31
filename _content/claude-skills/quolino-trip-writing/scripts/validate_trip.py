#!/usr/bin/env python3
"""
Walidator wycieczek Quolino dla umiejętności Claude „quolino-trip-writing”.
Bazuje na _content/validate.py; reguły zaktualizowane wg TRIP-WRITING-SKILL.md (JP, 2026-10-07):
  - opis rodzica: brak górnego limitu, ale MINIMUM głębokości (JP, 2026-10-13) — poniżej = błąd:
    zabytek 4 akapity i 300 słów; ulica/punkt widokowy/zdjęcie 2 akapity i 120 słów; parking i lokale 1 akapit,
  - wypełniacze („zachwyca”, „warto zobaczyć”, „bogata historia”) = uwaga; legenda bez oznaczenia = uwaga,
  - bez emoji w wartościach JSON (poza polem `icon`),
  - time_label = godzina dotarcia HH:MM, nie godziny otwarcia,
  - parking_cost ≠ price,
  - struktura _notes: {stop_key, field a–g, note},
  - quest (kids_box) i wskazówka (hint) przy punktach zwiedzania; wskazówka ≠ quest,
  - kolejność tłumaczeń: najpierw en, kolejne języki z angielskiego,
  - kids_choice (opcjonalne pytanie z wyborem, JP 2026-10-31): dokładnie 4 różne niepuste opcje, correct 0..3,
    bez „—”, najwyżej ~40 znaków na opcję (tłumaczenia ~56), tylko przy misji; brak pola = misja bez wyboru.

    python3 validate.py                        # wszystkie miasta
    python3 validate.py cities/umbria/spello   # jedno

Uruchamiaj z katalogu _content/. Kod wyjścia 1 = są błędy.
"""

import json
import re
import sys
from pathlib import Path

CATEGORIES = {"parking", "monument", "church", "museum", "house", "viewpoint",
              "restaurant", "icecream", "sweets", "photo", "street", "castle", "synagogue", "park"}
EMERGENCY  = {"pharmacy", "hospital", "toilet", "playground"}
DURATIONS  = {"half_day", "full_day"}
STATUSES   = {"draft", "published"}
VERIF      = {"confirmed", "unverified"}
ICONS      = {"🅿️", "🏛️", "✝️", "✡️", "⭐", "🏰", "🏞️", "🍦", "🍰", "🍽️", "📷", "🌳"}
LANGS      = {"pl","en","de","it","es","fr","nl","cs","sk","uk","hr","hu","ro","pt","sv","da","no"}

STOP_TEXT  = ["name", "desc_paragraphs", "kids_box", "hint", "local_flavor",
              "practical_note", "dress_code", "photo_task"]
CITY_TEXT  = ["title", "region_label", "subtitle", "lead", "good_to_know",
              "hero_note", "local_food"]

# Wzorce zakazane przez WYTYCZNE §13/§18 i REDAKCJA
BANNED = [
    (re.compile(r"\b\d+[\.,]?\d*\s?km\b", re.I),                 "odległość w km"),
    (re.compile(r"\bok\.\s*\d+\s?h\s?\d*\b", re.I),              "czas dojazdu"),
    (re.compile(r"\b(minut\w*|min\.|godzin\w*|kwadrans\w*)\s+(autem|samochodem|jazdy|busem|taksówką)\b", re.I), "KRYTYCZNE: czas dojazdu"),
    (re.compile(r"\b(autem|samochodem|busem)\s+(\w+\s+){0,2}(minut\w*|godzin\w*|kwadrans\w*)\b", re.I), "KRYTYCZNE: czas dojazdu"),
    (re.compile(r"\bdojazd\w*\s+(zajmie|trwa|zajmuje)\b", re.I), "KRYTYCZNE: czas dojazdu"),
    (re.compile(r"\b(holendersk\w+|szwajcarsk\w+ klimat|włosk\w+ Szwajcari\w+|jak (w|we|na) (Wenecj\w+|Amsterdam\w*|Szwajcari\w+|Paryż\w*|Londyn\w*|Wiedn\w+)|jak (Holendrz\w+|Niemc\w+|Szwajcar\w+|Francuz\w+|Anglik\w*|Polac\w+))\b", re.I), "porównanie do innego kraju/nacji (treść ma być uniwersalna)"),
    (re.compile(r"\bwyjazd z\b", re.I),                          "godzina wyjazdu z bazy"),
    (re.compile(r"\bpowrót (ok\.|do bazy)", re.I),               "godzina powrotu do bazy"),
    (re.compile(r"\bnie (udało się|znalazłem|podaję)\b", re.I),  "informacja o braku researchu w treści"),
]

EMOJI = re.compile("[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF\uFE0F]")
HHMM = re.compile(r"^([01]?\d|2[0-3]):[0-5]\d$")
NO_QUEST = {"parking", "restaurant", "icecream", "sweets"}
SIGHTS = {"monument", "church", "museum", "castle", "house", "synagogue"}
NOTE_FIELDS = set("abcdefg")
# minimum głębokości opisu rodzica: kategoria → (akapity, słowa). Dolna granica, nie cel.
SIGHT_MIN = (4, 300)          # church, museum, castle, house, synagogue
SMALL_MIN = (3, 180)          # monument: most, wieża, pomnik, fontanna (JP 2026-10-25: małe obiekty mają mało źródeł)
PLACE_MIN = (2, 120)          # street, viewpoint, photo, park
PLACE = {"street", "viewpoint", "photo", "park"}
PARA_MIN_WORDS, PARA_MIN_SENTENCES = 40, 2   # akapit zabytku: min. ok. 40 słów i 2+ zdania (nie tnij tekstu na jednozdaniowe „akapity”)
SENTENCE_END = re.compile(r"[.!?…]+[\"”»)]*(?=\s|$)")
FILLERS = re.compile(
    r"\b(zachwyc\w*|warto (zobaczyć|odwiedzić|zwrócić uwagę|się tu zatrzymać)|bogat\w+ (historia|historię|historii|dziedzictw\w+)"
    r"|tętni\w* życiem|pełn\w+ (uroku|historii|życia)|nie sposób (pominąć|przegapić)|magiczn\w+ (atmosfer\w+|miejsc\w+)"
    r"|niepowtarzaln\w+ (atmosfer\w+|klimat\w*)|obowiązkow\w+ punkt)\b", re.I)
LEGEND_WORD = re.compile(r"\b(legend\w*|podani\w+|według tradycji)\b", re.I)
LEGEND_OPEN = re.compile(r"^\s*(Legenda mówi|Według tradycji)", re.I)
WORD = re.compile(r"\w+", re.UNICODE)

# ── Lekcje z poprawek JP (Rimini, Rawenna, Asyż, Ancona, Perugia; 2026-10-12…17) — docs/WNIOSKI-Z-POPRAWEK.md ──
# maps_query i linki źródeł po angielsku w kraju nieanglojęzycznym (Rawenna: „Mausoleum of Galla Placidia”, it.wikipedia/…_of_…)
EN_PLACE = re.compile(r"\b(Mausoleum|Basilica|Baptistery|Cathedral|Church|Tomb|Palace|Museum|Bridge|Square|Tower|Castle|Abbey|Chapel)\s+of\b"
                      r"|\b(Baptistery|Cathedral|Square|Tower|Bridge)\b(?!\s*\()", re.I)
WIKI = re.compile(r"https?://([a-z]{2,3})\.(?:m\.)?wikipedia\.org/wiki/([^\s?#]+)", re.I)
# tylko słowa wyłącznie angielskie: „Basilica”, „Castello”, „Museo” itp. są też włoskie/hiszpańskie — nie mogą dawać błędu
EN_TITLE = re.compile(r"(^|_)(of|the|Mausoleum|Baptistery|Cathedral|Church|Tomb|Palace|Bridge|Square|Tower|Abbey|Chapel)(_|$)", re.I)
# quest/wskazówka zdradza odpowiedź (Rawenna: „odpowiedź w nawiasie”, wskazówka podaje rozwiązanie)
GIVEAWAY = re.compile(r"\(\s*(odp\w*|odpowied\w*|rozwiąz\w*)|\b(odpowiedź|rozwiązanie)\s*(to|brzmi|:)|\bpoprawna odpowied\w*", re.I)
# superlatywy wymagają źródła (Rawenna: „najstarsze przedstawienie Trzech Mędrców” — fałsz)
SUPERLATIVE = re.compile(r"\b(najstarsz\w+|najwięk\w+|najwyższ\w+|najdłuższ\w+|jedyn\w+ (na świecie|w Europie|w kraju|we Włoszech|tego typu)"
                         r"|pierwsz\w+ (na świecie|w Europie|w historii))\b", re.I)
# nazwa przystanku = nazwa miejsca (Perugia: „Kolacja przy Corso Vannucci”)
MEAL_NAME = re.compile(r"^\s*(kolacja|obiad|lunch|śniadanie|przerwa|finał)\b", re.I)
SENT_SPLIT = re.compile(r"(?<=[.!?…])\s+")
STOPWORDS = set("które który która których tylko także przez jednak bardzo można miasta miasto jeszcze kiedy gdzie wtedy dzisiaj potem właśnie".split())

VAGUE = re.compile(r"\b(kilk\w*|parę|paru|chwil\w*)\b(?!.*\d)", re.I)
CHOICE_MAX, CHOICE_MAX_TR = 40, 56   # znaki na opcję pytania z wyborem: PL / tłumaczenie (to samo co bin/kids-choice-lib.mjs)


def choice_problems(ch, max_len=CHOICE_MAX):
    """Problemy pytania z wyborem (kids_choice); pusta lista = poprawne. Te same reguły: bin/kids-choice-lib.mjs, SQL kids_choice_ok."""
    if ch is None:
        return []
    if not isinstance(ch, dict):
        return ['ma być obiektem {"options": [4 teksty], "correct": 0..3}']
    out = []
    o = ch.get("options")
    if not isinstance(o, list) or len(o) != 4:
        out.append(f"ma mieć dokładnie 4 opcje (jest {len(o) if isinstance(o, list) else 'brak listy'})")
    else:
        for i, x in enumerate(o, 1):
            if not isinstance(x, str) or not x.strip():
                out.append(f"opcja {i} pusta albo nie jest tekstem")
                continue
            if re.search("[—–]", x):
                out.append(f"opcja {i} ma długą pauzę „—”/„–”")
            if len(x.strip()) > max_len:
                out.append(f"opcja {i} ma {len(x.strip())} znaków (najwyżej ~{max_len}): „{x.strip()[:60]}”")
        txt = [x.strip().lower() for x in o if isinstance(x, str)]
        if len(set(txt)) != len(txt):
            out.append("opcje się powtarzają (muszą być 4 różne)")
    c = ch.get("correct")
    if isinstance(c, bool) or not isinstance(c, int) or not 0 <= c <= 3:
        out.append(f"„correct” = {json.dumps(c, ensure_ascii=False)} — ma być numerem poprawnej opcji 0..3")
    return out


errors, warnings = [], []
def err(c, m):  errors.append(f"  [BŁĄD] {c}: {m}")
def warn(c, m): warnings.append(f"  [uwaga] {c}: {m}")


def load(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        errors.append(f"  [BŁĄD] {path.name}: niepoprawny JSON — {e}")
        return None


def check_emoji(city, where, obj, skip=("icon",)):
    """Emoji w wartościach JSON są zakazane (ikona idzie z kategorii)."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k not in skip:
                check_emoji(city, f"{where}.{k}", v, skip)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            check_emoji(city, f"{where}[{i}]", v, skip)
    elif isinstance(obj, str):
        m = EMOJI.search(obj)
        if m:
            err(city, f"{where}: emoji „{m.group(0)}” w wartości JSON — usuń (ikona wynika z kategorii)")


def check_banned(city, where, text):
    if not isinstance(text, str):
        return
    for rx, label in BANNED:
        for m in rx.finditer(text):
            # JP 2026-10-28: przybliżenie bez liczby jest OK („kilka minut autem”, „kilka do kilkunastu minut autem”)
            if "dojazdu" in label and VAGUE.search(text[max(0, m.start() - 30):m.end()]):
                continue
            err(city, f"{where}: {label} — „{m.group(0)}”")
            break



# ── plan dnia liczony kodem (JP 2026-10-26: Claude tego nie sprawdza — kod liczy bezbłędnie i za darmo) ──
# Czas przejścia jest TYLKO do sprawdzenia planu (nie pokazujemy go nigdzie): pieszo 3 km/h (rodzina z dziećmi),
# powyżej 2 km auto 40 km/h + 10 min na parkowanie. Odległość w linii prostej × 1,3.
def _mins(t):
    m = re.match(r"^(\d{1,2}):(\d{2})$", str(t or "").strip())
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None
def _dist_km(a, b):
    import math
    try:
        la1, lo1, la2, lo2 = map(lambda x: math.radians(float(x)), (a["lat"], a["lon"], b["lat"], b["lon"]))
    except (TypeError, ValueError, KeyError):
        return None
    d = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(d)) * 1.3
def _visit(s):
    m = re.search(r"\d+", str(s.get("visit_duration") or s.get("duration_min") or ""))
    return int(m.group(0)) if m else None
def check_schedule(slug, meta, pl):
    stops = [s for s in (meta.get("stops") or []) if not s.get("optional")]
    seq = [(s, _mins(s.get("time_label")), _visit(s)) for s in stops]
    for (a, ta, va), (b, tb, _) in zip(seq, seq[1:]):
        ka, kb = a.get("stop_key"), b.get("stop_key")
        if ta is None or tb is None:
            continue
        if tb <= ta:
            err(slug, f"plan: {kb} ({b.get('time_label')}) nie jest po {ka} ({a.get('time_label')}) — godziny dotarcia muszą rosnąć"); continue
        if va is None:
            warn(slug, f"plan: {ka} bez visit_duration — nie da się sprawdzić, czy zdążą na {kb}"); continue
        d = _dist_km(a, b)
        need = 0 if d is None else (round(d / 3 * 60) if d <= 2 else round(d / 40 * 60) + 10)
        gap = tb - (ta + va)
        if gap < need - 5:   # 5 min tolerancji
            err(slug, f"plan: po {ka} ({a.get('time_label')} + {va} min) zostaje {gap} min na przejście do {kb} ({b.get('time_label')}), potrzeba ok. {need} min "
                      f"— przesuń {kb} na {(ta + va + need) // 60:02d}:{(ta + va + need) % 60:02d} albo skróć zwiedzanie {ka}")
        elif gap - need > 90:
            warn(slug, f"plan: między {ka} a {kb} {gap - need} min bez zajęcia — przerwa celowa?")
    times = [(t, v) for _, t, v in seq if t is not None]
    if times:
        span = (times[-1][0] + (times[-1][1] or 0) - times[0][0]) / 60
        c = meta.get("city") or {}
        dh = c.get("duration_hours")
        if isinstance(dh, (int, float)) and dh and abs(dh - span) > 0.75:
            err(slug, f"city.duration_hours = {dh}, a plan od {stops[0].get('time_label')} do końca ostatniego przystanku trwa ok. {span:.1f} h — ustaw {round(span * 2) / 2}")
        want = "half_day" if span <= 5 else "full_day"
        if c.get("duration_type") and c.get("duration_type") != want:
            warn(slug, f"city.duration_type = {c.get('duration_type')}, plan trwa {span:.1f} h — pasuje {want}")
    dp = (pl or {}).get("day_plan") or {}
    if isinstance(dp, dict):
        for s in stops:
            line = dp.get(s.get("stop_key"))
            m = re.match(r"^\s*(\d{1,2}:\d{2})", str(line or ""))
            if m and s.get("time_label") and _mins(m.group(1)) != _mins(s.get("time_label")):
                err(slug, f"day_plan.{s.get('stop_key')} zaczyna się od {m.group(1)}, a time_label = {s.get('time_label')} — godziny muszą się zgadzać")
    for s, t, v in seq:
        oh = str(s.get("opening_hours") or "")
        rng = [(_mins(a), _mins(b)) for a, b in re.findall(r"(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})", oh)]
        rng = [r for r in rng if None not in r]
        if t is not None and rng and not any(o <= t and t + (v or 0) <= cl for o, cl in rng):
            warn(slug, f"plan: {s.get('stop_key')} — dotarcie {s.get('time_label')}{f' + {v} min' if v else ''} poza godzinami otwarcia „{oh}” (sprawdź dzień tygodnia)")

def validate_city(folder: Path):
    slug = folder.name
    metas = list(folder.glob("*.meta.json"))
    if not metas:
        err(slug, "brak pliku *.meta.json")
        return
    meta = load(metas[0])
    if meta is None:
        return

    # ── miasto ──
    c = meta.get("city", {})
    if c.get("slug") != slug:
        err(slug, f"city.slug = '{c.get('slug')}' ≠ nazwa katalogu '{slug}'")
    for f in ("country", "region_slug", "lat", "lon", "sort_order"):
        if c.get(f) in (None, ""):
            err(slug, f"city.{f} puste")
    if c.get("duration_type") not in DURATIONS:
        err(slug, f"city.duration_type = '{c.get('duration_type')}'")
    if c.get("status") not in STATUSES:
        err(slug, f"city.status = '{c.get('status')}'")
    if c.get("bandana_color") and not re.fullmatch(r"#[0-9A-Fa-f]{6}", c["bandana_color"]):
        err(slug, f"city.bandana_color = '{c['bandana_color']}' — oczekiwany hex #RRGGBB")
    if not c.get("wiki_article"):
        warn(slug, "city.wiki_article puste — kafel regionu dostanie gradient zamiast zdjęcia")

    # ── przystanki (meta) ──
    stops = meta.get("stops", [])
    if not stops:
        err(slug, "brak przystanków w meta")
        return

    keys = [s.get("stop_key") for s in stops]
    if any(not k for k in keys):
        err(slug, "przystanek bez stop_key — numer nie jest tożsamością punktu (WYTYCZNE §1)")
    if len(keys) != len(set(keys)):
        dup = sorted({k for k in keys if keys.count(k) > 1 and k})
        err(slug, f"zdublowane stop_key: {dup}")
    for k in keys:
        if k and not re.fullmatch(r"[a-z0-9\-]+", k):
            err(slug, f"stop_key '{k}' — dozwolone tylko małe litery, cyfry i myślniki")

    nums = [s.get("stop_number") for s in stops]
    if sorted(n for n in nums if n is not None) != list(range(1, len(nums) + 1)):
        err(slug, f"stop_number musi być ciągiem 1..{len(nums)}, jest: {nums}")

    for s in stops:
        k = s.get("stop_key") or f"#{s.get('stop_number')}"
        if s.get("category") not in CATEGORIES:
            err(slug, f"{k}: category = '{s.get('category')}'")
        if s.get("icon") and s["icon"] not in ICONS:
            err(slug, f"{k}: icon = '{s['icon']}' spoza standardu (WYTYCZNE §16)")
        # §3 — nie wolno udawać pewności
        if s.get("price") and s.get("price_status") not in VERIF:
            err(slug, f"{k}: podana cena bez price_status ({sorted(VERIF)})")
        if s.get("opening_hours") and s.get("hours_status") not in VERIF:
            err(slug, f"{k}: podane godziny bez hours_status")
        if not s.get("verify_url"):
            err(slug, f"{k}: brak verify_url — każdy punkt musi mieć link do samodzielnego sprawdzenia (§3)")
        if not s.get("maps_query"):
            err(slug, f"{k}: brak maps_query")
        elif (c.get("country") or "").lower() not in ("gb", "uk", "ie", "en") and EN_PLACE.search(str(s["maps_query"])):
            err(slug, f"{k}: maps_query po angielsku („{s['maps_query']}”) — podaj oryginalną nazwę w języku kraju + miasto, kraj "
                      f"(np. „Mausoleo di Galla Placidia, Ravenna, Italia”); angielska nazwa potrafi wskazać złe miejsce")
        if s.get("category") == "parking" and s.get("maps_query") and not re.search(r"parch|park|aparc|stationnement|parcare", str(s["maps_query"]), re.I):
            warn(slug, f"{k}: maps_query parkingu („{s['maps_query']}”) bez słowa parking — trasa w Mapach ma startować z parkingu, nie z adresu ulicy")
        for url in re.findall(r"https?://\S+", json.dumps(s, ensure_ascii=False)):
            m = WIKI.match(url.rstrip('",'))
            if m and m.group(1).lower() != "en" and EN_TITLE.search(m.group(2)):
                err(slug, f"{k}: link {url.rstrip(chr(34)+',')} — Wikipedia {m.group(1)} z angielskim tytułem, taki artykuł nie istnieje; "
                          f"użyj tytułu w języku tej Wikipedii (np. it.wikipedia.org/wiki/Mausoleo_di_Galla_Placidia)")
        # §14 — ocena i liczba opinii idą w parze
        if (s.get("rating") is None) != (s.get("reviews_count") is None):
            err(slug, f"{k}: rating i reviews_count muszą wystąpić razem albo wcale")
        # Lokale: turysta musi miec jak zadzwonic i gdzie sprawdzic karte
        if s.get("category") in ("restaurant", "icecream", "sweets"):
            if not s.get("phone"):
                err(slug, f"{k}: lokal bez telefonu — pole 'phone' jest obowiazkowe")
            if not s.get("website"):
                err(slug, f"{k}: lokal bez strony — pole 'website' jest obowiazkowe")
        if s.get("reservation") in ("required", "recommended") and not (s.get("phone") or s.get("whatsapp")):
            err(slug, f"{k}: rezerwacja '{s['reservation']}' bez telefonu i bez WhatsAppa — nie ma jak zarezerwowac")
        # Dane, ktore ida wprost na strone (IMPORT §4b)
        if s.get("price") and re.search(r"weryfikacj|do sprawdzenia|do potwierdzenia", str(s["price"]), re.I):
            err(slug, f"{k}: 'price' zawiera komentarz o pewnosci — cena albo null, watpliwosc niesie price_status")
        if s.get("opening_hours") and re.search(r"wymaga|weryfikacj|sprawdz", str(s["opening_hours"]), re.I):
            err(slug, f"{k}: 'opening_hours' to nie sa godziny — albo godziny, albo null")
        if s.get("year_built") and len(str(s["year_built"])) > 40:
            err(slug, f"{k}: 'year_built' ma {len(str(s['year_built']))} znakow — to plakietka na rok albo okres, historia idzie do desc_paragraphs")
        if not s.get("lat") or not s.get("lon"):
            err(slug, f"{k}: brak lat/lon — nawigacja po samej nazwie potrafi wskazac inne miasto")
        if s.get("category") == "restaurant" and s.get("rating") is not None:
            if s["rating"] < 4.1:
                err(slug, f"{k}: restauracja z oceną {s['rating']} — próg to 4,1")
            if (s.get("reviews_count") or 0) <= 100:
                err(slug, f"{k}: restauracja ma {s.get('reviews_count')} opinii — próg to 100")

    check_emoji(slug, "meta", meta)
    for s in stops:
        k = s.get("stop_key") or f"#{s.get('stop_number')}"
        tl = s.get("time_label")
        if tl and not HHMM.match(str(tl)):
            err(slug, f"{k}: time_label = '{tl}' — to godzina dotarcia HH:MM; godziny otwarcia idą do opening_hours")
        if s.get("category") == "parking":
            if s.get("price") and not s.get("parking_cost"):
                err(slug, f"{k}: koszt parkingu w 'price' — ma być w 'parking_cost' (parking_cost ≠ price)")
            if not s.get("parking_cost"):
                warn(slug, f"{k}: parking bez 'parking_cost' (null + notatka, jeśli niepotwierdzony)")
        elif s.get("parking_cost"):
            warn(slug, f"{k}: 'parking_cost' przy punkcie, który nie jest parkingiem")
    for d in (meta.get("day_plan") or []) if isinstance(meta.get("day_plan"), list) else []:
        tl = d.get("time_label") if isinstance(d, dict) else None
        if tl and not HHMM.match(str(tl)):
            err(slug, f"day_plan: time_label = '{tl}' — plan pokazuje tylko godzinę na miejscu (HH:MM)")
    if c.get("status") == "published":
        warn(slug, "city.status = published — dokument niezatwierdzony przez JP ma mieć status draft")
    cat_of = {s.get("stop_key"): s.get("category") for s in stops}
    _plf = next(iter(folder.glob("*.pl.json")), None)
    check_schedule(slug, meta, load(_plf) if _plf else None)

    if stops[0].get("category") != "parking":
        err(slug, "przystanek 01 musi być parkingiem (WYTYCZNE §17)")
    if not any(s.get("optional") for s in stops):
        warn(slug, "żaden punkt nie jest opcjonalny — trasa ma być ramą, nie klatką (§15)")
    if not any(s.get("category") == "viewpoint" for s in stops):
        warn(slug, "brak punktu widokowego — czy został rozważony? (§12)")
    if not 6 <= len(stops) <= 11:
        warn(slug, f"{len(stops)} przystanków — sprawdź logikę dnia (Google Maps przyjmuje do 11 punktów trasy)")

    for e in meta.get("emergency", []):
        if e.get("type") not in EMERGENCY:
            err(slug, f"emergency.type = '{e.get('type')}'")

    meta_keys = {k for k in keys if k}

    # ── pliki językowe (pl pierwszy — jest wzorcem) ──
    # .meta.json i .patch.json to nie są pliki językowe
    lang_files = sorted(
        (p for p in folder.glob("*.*.json")
         if not p.name.endswith((".meta.json", ".patch.json"))),
        key=lambda p: (p.name.split(".")[-2] != "pl", p.name),
    )
    if not lang_files:
        err(slug, "brak pliku językowego")
        return
    if not (folder / f"{slug}.pl.json").exists():
        err(slug, "brak pliku źródłowego .pl.json")

    pl_shape = None
    for lf in lang_files:
        code = lf.name.split(".")[-2]
        data = load(lf)
        if data is None:
            continue
        if code not in LANGS:
            err(slug, f"nieznany kod języka '{code}' w {lf.name}")
            continue
        if data.get("lang") != code:
            err(slug, f"{code}: pole 'lang' = '{data.get('lang')}', a plik nazywa się .{code}.json")

        for f in CITY_TEXT:
            if f not in data.get("city", {}):
                err(slug, f"{code}: brak klucza city.{f}")
        ct = data.get("city", {})
        if ct.get("region_label") and "·" in ct["region_label"]:
            err(slug, f"{code}: city.region_label = '{ct['region_label']}' — ma byc sama nazwa regionu, "
                      "czas trwania dokleja strona")
        if not ct.get("lead"):
            err(slug, f"{code}: city.lead puste — wstep dokumentu to tresc miasta, nie ozdoba")
        elif ct.get("lead") and "\n\n" not in ct["lead"] and len(ct["lead"]) > 400:
            warn(slug, f"{code}: city.lead to jeden dlugi blok — akapity rozdziel pustym wierszem")

        s_keys = set(data.get("stops", {}).keys())
        if s_keys != meta_keys:
            brak = meta_keys - s_keys
            nad  = s_keys - meta_keys
            if brak: err(slug, f"{code}: brak przystanków {sorted(brak)}")
            if nad:  err(slug, f"{code}: przystanki spoza meta {sorted(nad)}")

        shape = {}
        for key, st in data.get("stops", {}).items():
            for f in STOP_TEXT:
                if f not in st:
                    err(slug, f"{code}: {key} — brak klucza '{f}' (użyj null)")
            nm = st.get("name") or ""
            litery = [c for c in nm if c.isalpha()]
            if len(litery) > 3 and all(c.isupper() for c in litery):
                err(slug, f"{code}: {key} — nazwa wersalikami ('{nm}'); wielkosc liter ustawia CSS")
            if not st.get("photo_task"):
                err(slug, f"{code}: {key} — brak 'photo_task', a zadanie foto jest obowiazkowe")
            dc = (st.get("dress_code") or "").lower()
            if dc and re.search(r"brak (szczeg|wymog)|dowoln|bez wymog", dc):
                err(slug, f"{code}: {key} — dress_code '{st['dress_code']}' ma byc null, gdy nie ma wymogu")
            n_par = len(st.get("desc_paragraphs") or [])
            cat = cat_of.get(key)
            if code == "pl":
                if n_par < 1:
                    err(slug, f"{code}: {key} — brak opisu rodzica (desc_paragraphs)")
                else:
                    paras = [x for x in (st.get("desc_paragraphs") or []) if isinstance(x, str)]
                    words = sum(len(WORD.findall(x)) for x in paras)
                    need = SMALL_MIN if cat == "monument" else SIGHT_MIN if cat in SIGHTS else PLACE_MIN if cat in PLACE else None
                    # JP 2026-10-26: gdy fizycznie brak materiału, notatka redakcyjna _notes (field b, „ZA MAŁO MATERIAŁU”) zamienia błąd w uwagę
                    thin = any(isinstance(n, dict) and n.get("stop_key") == key and n.get("field") == "b"
                               and re.search(r"za ma[łl]o materia[łl]u|research nie wystarczy|brak materia[łl]u", str(n.get("note", "")), re.I)
                               for n in (data.get("_notes") or []))
                    if need and (n_par < need[0] or words < need[1]):
                        (warn if thin else err)(slug, f"{code}: {key} — opis rodzica poniżej minimum ({cat}: {n_par} akap., {words} słów; "
                                  f"minimum {need[0]} akapity i {need[1]} słów). Rozbuduj z researchu wg szkieletu: hak, "
                                  f"historia i ludzie, „Kim był…”, co oglądać, legenda, ciekawostka")
                    if cat in SIGHTS:
                        short = []
                        for i, ptxt in enumerate(paras, 1):
                            w, sn = len(WORD.findall(ptxt)), len(SENTENCE_END.findall(ptxt))
                            if w < PARA_MIN_WORDS or sn < PARA_MIN_SENTENCES:
                                short.append(f"{i} ({w} słów, {sn} zd.)")
                        if short:
                            (warn if thin else err)(slug, f"{code}: {key} — akapity za krótkie: {', '.join(short)}. Akapit zabytku ma mieć min. "
                                      f"{PARA_MIN_WORDS} słów i {PARA_MIN_SENTENCES}+ zdania; jednozdaniowe „akapity” (cięcie tekstu, "
                                      f"by zaliczyć próg) to błąd — połącz je w pełne akapity")
                    for i, ptxt in enumerate(paras):
                        m = FILLERS.search(ptxt)
                        if m:
                            warn(slug, f"{code}: {key} desc[{i}] — zdanie-wypełniacz „{m.group(0)}”: podaj fakt zamiast przymiotnika")
                        if LEGEND_WORD.search(ptxt) and not LEGEND_OPEN.match(ptxt):
                            warn(slug, f"{code}: {key} desc[{i}] — wzmianka o legendzie/tradycji w akapicie, który nie zaczyna się od "
                                       f"„Legenda mówi…” / „Według tradycji…” (legenda ma mieć własny, oznaczony akapit)")
                for f in ("kids_box", "hint"):
                    m = GIVEAWAY.search(st.get(f) or "")
                    if m:
                        err(slug, f"{code}: {key}.{f} — zdradza odpowiedź („{m.group(0)}”); quest i wskazówka prowadzą do odpowiedzi, nie podają jej")
                if cat == "restaurant" and MEAL_NAME.search(st.get("name") or ""):
                    warn(slug, f"{code}: {key} — nazwa „{st.get('name')}” opisuje posiłek; nazwa przystanku to nazwa lokalu (pora jest w planie dnia)")
                paras_all = [x for x in (st.get("desc_paragraphs") or []) if isinstance(x, str)]
                seen = {}
                for i, ptxt in enumerate(paras_all):
                    for zd in SENT_SPLIT.split(ptxt):
                        n = " ".join(WORD.findall(zd.lower()))
                        if len(n.split()) >= 8:
                            if n in seen:
                                err(slug, f"{code}: {key} desc[{seen[n]}] i desc[{i}] — to samo zdanie dwa razy: „{zd.strip()[:80]}…”")
                            seen.setdefault(n, i)
                    stems = {}
                    for w in WORD.findall(ptxt.lower()):
                        if len(w) >= 5 and w not in STOPWORDS:
                            stems[w[:6]] = stems.get(w[:6], 0) + 1
                    own = {w[:6] for w in WORD.findall((st.get("name") or "").lower())} | {"kości", "kośció", "bazyli", "katedr", "muzeum"}
                    rep = [w for w, n in stems.items() if n >= 3 and w not in own]
                    if rep:
                        warn(slug, f"{code}: {key} desc[{i}] — powtórzenia w jednym akapicie ({', '.join(rep[:4])}…): każde zdanie ma wnosić nową treść")
                    m = SUPERLATIVE.search(ptxt)
                    if m:
                        warn(slug, f"{code}: {key} desc[{i}] — superlatyw „{m.group(0)}”: musi mieć źródło w researchu; kontrola sprawdza go w sieci")
                if cat not in NO_QUEST:
                    if not st.get("kids_box"):
                        err(slug, f"{code}: {key} — brak questu (kids_box) przy punkcie zwiedzania")
                    if not st.get("hint"):
                        err(slug, f"{code}: {key} — brak wskazówki (hint) do questu")
                    elif st.get("kids_box") and st["hint"].strip() == st["kids_box"].strip():
                        err(slug, f"{code}: {key} — wskazówka powtarza quest; ma mówić, gdzie patrzeć")
            ch = st.get("kids_choice")
            if ch is not None:
                for p in choice_problems(ch, CHOICE_MAX if code == "pl" else CHOICE_MAX_TR):
                    err(slug, f"{code}: {key}.kids_choice — {p}")
                if not st.get("kids_box"):
                    err(slug, f"{code}: {key}.kids_choice — pytanie z wyborem bez misji (kids_box); usuń je albo dopisz misję")
                elif cat_of.get(key) in NO_QUEST:
                    err(slug, f"{code}: {key}.kids_choice — przystanek praktyczny ({cat_of.get(key)}) nie ma pytania z wyborem")
                elif code == "pl" and not choice_problems(ch):
                    good = ch["options"][ch["correct"]].strip()
                    tell = f"{st.get('kids_box') or ''} {st.get('hint') or ''}".lower()
                    if len(good) >= 4 and good.lower() in tell:
                        warn(slug, f"{code}: {key}.kids_choice — poprawna odpowiedź „{good}” stoi w misji albo wskazówce (zdradza odpowiedź)")
                    for i, x in enumerate(ch["options"]):
                        check_banned(slug, f"{key}.kids_choice[{i}]", x)
            dp = st.get("desc_paragraphs")
            if dp is not None and not isinstance(dp, list):
                err(slug, f"{code}: {key} — desc_paragraphs musi być listą")
            shape[key] = len(dp) if isinstance(dp, list) else None
            if not st.get("name"):
                err(slug, f"{code}: {key} — pusta nazwa")

        if code == "pl":
            pl_shape = shape
            for key, st in data.get("stops", {}).items():
                for f in ("name", "kids_box", "hint", "local_flavor", "practical_note"):
                    check_banned(slug, f"{key}.{f}", st.get(f))
                for i, p in enumerate(st.get("desc_paragraphs") or []):
                    check_banned(slug, f"{key}.desc[{i}]", p)
            for f in CITY_TEXT:
                check_banned(slug, f"city.{f}", data.get("city", {}).get(f))
            if not data.get("city", {}).get("local_food"):
                warn(slug, "city.local_food puste — lokalne jedzenie rozważone? (§13)")
        elif pl_shape:
            for key, cnt in shape.items():
                if key in pl_shape and pl_shape[key] != cnt:
                    err(slug, f"{code}: {key} ma {cnt} akapitów, pl ma {pl_shape[key]}")

        check_emoji(slug, code, {k: v for k, v in data.items() if k != "_notes"})
        if code == "pl":
            for i, n in enumerate(data.get("_notes") or []):
                if not isinstance(n, dict) or not n.get("note"):
                    err(slug, f"pl: _notes[{i}] — oczekiwane {{stop_key, field, note}}")
                    continue
                if n.get("field") not in NOTE_FIELDS:
                    err(slug, f"pl: _notes[{i}].field = '{n.get('field')}' — dozwolone a–g")
                if n.get("stop_key") not in meta_keys and n.get("stop_key") is not None:
                    err(slug, f"pl: _notes[{i}].stop_key = '{n.get('stop_key')}' — nie ma takiego punktu")

        if code != "pl" and "_notes" in data:
            err(slug, f"{code}: blok _notes nie może być tłumaczony — usuń go")

    got = {p.name.split(".")[-2] for p in lang_files}

    # §19 — etapy: pl → en → jezyk lokalny → reszta
    local = (c.get("country") or "").lower()
    dalsze = got - {"pl", "en", local}
    if dalsze and "en" not in got:
        err(slug, f"jezyki {sorted(dalsze)} bez wersji angielskiej — EN jest wersja kontrolna, "
                  "powstaje pierwszy (§19)")
    # JP 2026-10-07: po en kolejne języki tłumaczone z angielskiego (lokalny nie musi być drugi)

    if got == {"pl"}:
        warn(slug, "tylko wersja polska — po zatwierdzeniu zamów u ChatGPT etap 1: "
                   f"„Przetłumacz {slug} na angielski”")
    opt = sum(1 for s in stops if s.get("optional"))
    print(f"  {slug}: {len(stops)} przystanków ({opt} opcjonalnych), języki: {', '.join(sorted(got))}")


def main():
    folders = [Path(sys.argv[1])] if len(sys.argv) > 1 else \
              sorted(p for p in Path(".").glob("cities/*/*") if p.is_dir())
    if not folders:
        print("Nie znalazłem miast w cities/<region>/<slug>/")
        return 0

    print(f"Sprawdzam {len(folders)} miast:\n")
    for f in folders:
        validate_city(f)

    print()
    for w in warnings: print(w)
    if warnings: print()
    for e in errors:   print(e)

    if errors:
        print(f"\n✗ {len(errors)} błędów — nie importuj, popraw pliki.")
        return 1
    print(f"\n✓ Bez błędów{f' ({len(warnings)} uwag)' if warnings else ''}. Można importować.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
