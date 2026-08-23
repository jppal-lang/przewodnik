#!/usr/bin/env python3
"""
Walidator plików treści Questini/Quolino.
Zgodny z WYTYCZNE_WYCIECZEK.md (2026-08-22 21:49 CEST) i REDAKCJA.md v4.

    python3 validate.py                        # wszystkie miasta
    python3 validate.py cities/umbria/spello   # jedno

Uruchamiaj z katalogu _content/. Kod wyjścia 1 = są błędy.
"""

import json
import re
import sys
from pathlib import Path

CATEGORIES = {"parking", "monument", "church", "museum", "house", "viewpoint",
              "restaurant", "icecream", "sweets", "photo", "street", "castle", "synagogue"}
EMERGENCY  = {"pharmacy", "hospital", "toilet", "playground"}
DURATIONS  = {"half_day", "full_day"}
STATUSES   = {"draft", "published"}
VERIF      = {"confirmed", "unverified"}
ICONS      = {"🅿️", "🏛️", "✝️", "✡️", "⭐", "🏰", "🏞️", "🍦", "🍰", "🍽️", "📷"}
LANGS      = {"pl","en","de","it","es","fr","nl","cs","sk","uk","hr","hu","ro","pt","sv","da","no"}

STOP_TEXT  = ["name", "desc_paragraphs", "kids_box", "hint", "local_flavor",
              "practical_note", "dress_code", "photo_task"]
CITY_TEXT  = ["title", "region_label", "subtitle", "lead", "good_to_know",
              "hero_note", "local_food"]

# Wzorce zakazane przez WYTYCZNE §13/§18 i REDAKCJA
BANNED = [
    (re.compile(r"\b\d+[\.,]?\d*\s?km\b", re.I),                 "odległość w km"),
    (re.compile(r"\bok\.\s*\d+\s?h\s?\d*\b", re.I),              "czas dojazdu"),
    (re.compile(r"\bwyjazd z\b", re.I),                          "godzina wyjazdu z bazy"),
    (re.compile(r"\bpowrót (ok\.|do bazy)", re.I),               "godzina powrotu do bazy"),
    (re.compile(r"\bnie (udało się|znalazłem|podaję)\b", re.I),  "informacja o braku researchu w treści"),
]

errors, warnings = [], []
def err(c, m):  errors.append(f"  [BŁĄD] {c}: {m}")
def warn(c, m): warnings.append(f"  [uwaga] {c}: {m}")


def load(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        errors.append(f"  [BŁĄD] {path.name}: niepoprawny JSON — {e}")
        return None


def check_banned(city, where, text):
    if not isinstance(text, str):
        return
    for rx, label in BANNED:
        m = rx.search(text)
        if m:
            err(city, f"{where}: {label} — „{m.group(0)}”")


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

    if stops[0].get("category") != "parking":
        err(slug, "przystanek 01 musi być parkingiem (WYTYCZNE §17)")
    if not any(s.get("optional") for s in stops):
        warn(slug, "żaden punkt nie jest opcjonalny — trasa ma być ramą, nie klatką (§15)")
    if not any(s.get("category") == "viewpoint" for s in stops):
        warn(slug, "brak punktu widokowego — czy został rozważony? (§12)")
    if not 6 <= len(stops) <= 9:
        warn(slug, f"{len(stops)} przystanków — wytyczna mówi 6–9")

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
            if code == "pl" and not 2 <= n_par <= 4:
                err(slug, f"{code}: {key} — {n_par} akapitow opisu, wytyczna mowi 2–4")
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

        if code != "pl" and "_notes" in data:
            err(slug, f"{code}: blok _notes nie może być tłumaczony — usuń go")

    got = {p.name.split(".")[-2] for p in lang_files}

    # §19 — etapy: pl → en → jezyk lokalny → reszta
    local = (c.get("country") or "").lower()
    dalsze = got - {"pl", "en", local}
    if dalsze and "en" not in got:
        err(slug, f"jezyki {sorted(dalsze)} bez wersji angielskiej — EN jest wersja kontrolna, "
                  "powstaje pierwszy (§19)")
    if dalsze and local and local not in got:
        err(slug, f"jezyki {sorted(dalsze)} bez wersji lokalnej '{local}' — lokalna jest kontrola "
                  "kulturowa i powstaje przed pozostalymi (§19)")
    if got == {"pl", "en"} and local and local not in got:
        warn(slug, f"jest pl i en — kolejny etap to jezyk lokalny: „Przetlumacz {slug} na {local}”")

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
