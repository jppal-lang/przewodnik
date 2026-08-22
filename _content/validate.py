#!/usr/bin/env python3
"""
Walidator plików treści Questini/Quolino.

    python3 validate.py                        # sprawdza wszystkie miasta
    python3 validate.py cities/umbria/spello   # sprawdza jedno

Uruchamiaj z katalogu _content/. Kod wyjścia 1 = są błędy.
"""

import json
import re
import sys
from pathlib import Path

CATEGORIES = {"parking", "monument", "church", "museum", "house", "viewpoint", "restaurant"}
EMERGENCY  = {"pharmacy", "hospital", "toilet", "playground"}
DURATIONS  = {"half_day", "full_day"}
STATUSES   = {"draft", "published"}
LANGS      = {"pl","en","de","it","es","fr","nl","cs","sk","uk","hr","hu","ro","pt","sv","da","no"}

STOP_FIELDS = ["name", "desc_paragraphs", "kids_box", "hint", "local_flavor", "photo_task", "dress_code"]
CITY_FIELDS = ["title", "region_label", "subtitle", "lead", "good_to_know", "hero_note"]

# Wzorce zakazane przez REDAKCJA.md: kilometry i czasy dojazdu
BANNED = [
    (re.compile(r"\b\d+[\.,]?\d*\s?km\b", re.I),                    "odległość w km"),
    (re.compile(r"\bok\.\s*\d+\s?h\s?\d*\b", re.I),                 "czas dojazdu"),
    (re.compile(r"\bwyjazd z\b", re.I),                             "godzina wyjazdu z bazy"),
    (re.compile(r"\bpowrót (ok\.|do bazy)", re.I),                  "godzina powrotu do bazy"),
    (re.compile(r"\bnie (udało się|znalazłem|podaję)\b", re.I),     "informacja o braku researchu w treści"),
]

errors, warnings = [], []


def err(city, msg):  errors.append(f"  [BŁĄD] {city}: {msg}")
def warn(city, msg): warnings.append(f"  [uwaga] {city}: {msg}")


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
        if rx.search(text):
            err(city, f"{where}: {label} — „{rx.search(text).group(0)}”")


def validate_city(folder: Path):
    slug = folder.name
    metas = list(folder.glob("*.meta.json"))
    if not metas:
        err(slug, "brak pliku *.meta.json")
        return
    meta = load(metas[0])
    if meta is None:
        return

    # ── meta: miasto ──
    c = meta.get("city", {})
    if c.get("slug") != slug:
        err(slug, f"city.slug = '{c.get('slug')}' ≠ nazwa katalogu '{slug}'")
    for f in ("country", "region_slug", "lat", "lon", "sort_order"):
        if c.get(f) in (None, ""):
            err(slug, f"city.{f} puste")
    if c.get("duration_type") not in DURATIONS:
        err(slug, f"city.duration_type = '{c.get('duration_type')}' (dozwolone: {sorted(DURATIONS)})")
    if c.get("status") not in STATUSES:
        err(slug, f"city.status = '{c.get('status')}'")
    if c.get("bandana_color") and not re.fullmatch(r"#[0-9A-Fa-f]{6}", c["bandana_color"]):
        err(slug, f"city.bandana_color = '{c['bandana_color']}' — oczekiwany hex #RRGGBB")
    if not c.get("wiki_article"):
        warn(slug, "city.wiki_article puste — kafel regionu dostanie gradient zamiast zdjęcia")

    # ── meta: przystanki ──
    stops = meta.get("stops", [])
    if not stops:
        err(slug, "brak przystanków w meta")
        return
    nums = [s.get("stop_number") for s in stops]
    if len(nums) != len(set(nums)):
        err(slug, f"zdublowane stop_number: {sorted(n for n in set(nums) if nums.count(n) > 1)}")
    if sorted(n for n in nums if n is not None) != list(range(1, len(nums) + 1)):
        err(slug, f"stop_number musi być ciągiem 1..{len(nums)}, jest: {nums}")
    for s in stops:
        n = s.get("stop_number")
        if s.get("category") not in CATEGORIES:
            err(slug, f"przystanek {n}: category = '{s.get('category')}'")
    if stops and stops[0].get("category") != "parking":
        err(slug, "przystanek 01 musi być parkingiem (REDAKCJA §Anatomia)")
    if not 6 <= len(stops) <= 9:
        warn(slug, f"{len(stops)} przystanków — wytyczna mówi 6–9")

    for e in meta.get("emergency", []):
        if e.get("type") not in EMERGENCY:
            err(slug, f"emergency.type = '{e.get('type')}'")

    meta_nums = {str(n) for n in nums}

    # ── pliki językowe ──
    # pl musi iść pierwszy — to on jest wzorcem, do którego porównujemy resztę
    lang_files = sorted(
        (p for p in folder.glob("*.*.json") if not p.name.endswith(".meta.json")),
        key=lambda p: (p.name.split(".")[-2] != "pl", p.name),
    )
    if not lang_files:
        err(slug, "brak pliku językowego")
        return

    pl_file = folder / f"{slug}.pl.json"
    if not pl_file.exists():
        err(slug, "brak pliku źródłowego .pl.json")

    pl_shape = None
    for lf in lang_files:
        code = lf.name.split(".")[-2]
        data = load(lf)
        if data is None:
            continue
        tag = f"{code}"
        if code not in LANGS:
            err(slug, f"nieznany kod języka '{code}' w {lf.name}")
            continue
        if data.get("lang") != code:
            err(slug, f"{tag}: pole 'lang' = '{data.get('lang')}', a plik nazywa się .{code}.json")

        for f in CITY_FIELDS:
            if f not in data.get("city", {}):
                err(slug, f"{tag}: brak klucza city.{f}")

        s_keys = set(data.get("stops", {}).keys())
        if s_keys != meta_nums:
            brak = meta_nums - s_keys
            nad  = s_keys - meta_nums
            if brak: err(slug, f"{tag}: brak przystanków {sorted(brak)}")
            if nad:  err(slug, f"{tag}: przystanki spoza meta {sorted(nad)}")

        shape = {}
        for num, st in data.get("stops", {}).items():
            for f in STOP_FIELDS:
                if f not in st:
                    err(slug, f"{tag}: przystanek {num} — brak klucza '{f}' (użyj null)")
            dp = st.get("desc_paragraphs")
            if dp is not None and not isinstance(dp, list):
                err(slug, f"{tag}: przystanek {num} — desc_paragraphs musi być listą")
            shape[num] = len(dp) if isinstance(dp, list) else None
            if not st.get("name"):
                err(slug, f"{tag}: przystanek {num} — pusta nazwa")

        if code == "pl":
            pl_shape = shape
            for num, st in data.get("stops", {}).items():
                for f in ("name", "kids_box", "hint", "local_flavor"):
                    check_banned(slug, f"przystanek {num}.{f}", st.get(f))
                for i, p in enumerate(st.get("desc_paragraphs") or []):
                    check_banned(slug, f"przystanek {num}.desc[{i}]", p)
            for f in CITY_FIELDS:
                check_banned(slug, f"city.{f}", data.get("city", {}).get(f))
        elif pl_shape:
            for num, cnt in shape.items():
                if num in pl_shape and pl_shape[num] != cnt:
                    err(slug, f"{tag}: przystanek {num} ma {cnt} akapitów, pl ma {pl_shape[num]}")

        if code != "pl" and "_notes" in data:
            err(slug, f"{tag}: blok _notes nie może być tłumaczony — usuń go")

    got = {p.name.split(".")[-2] for p in lang_files}
    if got == {"pl"}:
        warn(slug, "tylko wersja polska — brak tłumaczeń")
    print(f"  {slug}: {len(stops)} przystanków, języki: {', '.join(sorted(got))}")


def main():
    root = Path(".")
    if len(sys.argv) > 1:
        folders = [Path(sys.argv[1])]
    else:
        folders = sorted(p for p in root.glob("cities/*/*") if p.is_dir())

    if not folders:
        print("Nie znalazłem żadnych miast w cities/<region>/<slug>/")
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
