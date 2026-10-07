#!/usr/bin/env python3
"""
Kontrola tłumaczenia wycieczki Quolino (format trip_export).

    python3 check_translation.py zrodlo.json tlumaczenie.json [--json]

Kod wyjścia 1 = błędy (tłumaczenie nie może trafić do bazy).
Sprawdza: te same klucze i kolejność, liczbę akapitów, null ↔ null, pola niezmienne,
zachowane liczby (ceny, daty, godziny), brak _notes, brak emoji, nieprzetłumaczone pola.
"""
import json, re, sys
from collections import Counter

KEEP_STOP = ["stop_key", "stop_number", "category"]
TEXT_STOP = ["name", "kids_box", "photo_task", "hint", "local_flavor", "dress_code", "practical_note"]
TEXT_CITY = ["title", "region_label", "subtitle", "lead", "good_to_know", "hero_note", "local_food"]
EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿⬀-⯿]")
NUM = re.compile(r"\d+(?:[.,:]\d+)*")
BANNED = re.compile(r"\b\d+[\.,]?\d*\s?(km|kilom)", re.I)

errors, warnings = [], []
same = total = 0


GROUP = re.compile(r"(?<=\d)[\s\u00a0\u202f.,'](?=\d{3}(?!\d))")


def nums(s):
    """Liczby ze źródła; separator tysięcy nieistotny (220 000 = 220,000 = 220000)."""
    return Counter(re.sub(r"[.,]", "", n) for n in NUM.findall(GROUP.sub("", s or "")))


def text(where, a, b, long_check=True):
    global same, total
    if a is None:
        if b is not None:
            errors.append(f"{where}: źródło ma null, tłumaczenie nie — null zostaje null")
        return
    if b is None or (isinstance(b, str) and not b.strip()):
        errors.append(f"{where}: puste tłumaczenie")
        return
    if not isinstance(b, str):
        errors.append(f"{where}: oczekiwany tekst")
        return
    # każda liczba ze źródła musi zostać (dodatkowe wolno: „XIII wiek” → „13th century”)
    missing = nums(a) - nums(b)
    if missing:
        errors.append(f"{where}: brakuje liczb ze źródła {sorted(missing.elements())} — ceny, daty, godziny i liczby bez zmian")
    if EMOJI.search(b) and not EMOJI.search(a):
        errors.append(f"{where}: emoji w tłumaczeniu")
    if BANNED.search(b):
        errors.append(f"{where}: odległość w km")
    if long_check and len(a) > 40:
        total += 1
        if a.strip() == b.strip():
            same += 1


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    as_json = "--json" in sys.argv
    src = json.load(open(args[0], encoding="utf-8"))
    dst = json.load(open(args[1], encoding="utf-8"))

    if "_notes" in dst:
        errors.append("_notes w tłumaczeniu — notatki redakcyjne nie są tłumaczone")
    if dst.get("city_slug") != src.get("city_slug"):
        errors.append(f"city_slug: '{dst.get('city_slug')}' ≠ '{src.get('city_slug')}'")
    if not dst.get("lang") or dst.get("lang") == src.get("lang"):
        errors.append(f"lang: '{dst.get('lang')}' — ustaw język docelowy")

    sc, dc = src.get("city") or {}, dst.get("city") or {}
    for f in TEXT_CITY:
        if f not in dc:
            errors.append(f"city.{f}: brak klucza")
        else:
            text(f"city.{f}", sc.get(f), dc.get(f), f not in ("title",))

    ss, ds = src.get("stops") or [], dst.get("stops") or []
    if [s.get("stop_key") for s in ss] != [s.get("stop_key") for s in ds]:
        errors.append(f"stops: inna lista lub kolejność stop_key — źródło {[s.get('stop_key') for s in ss]}, "
                      f"tłumaczenie {[s.get('stop_key') for s in ds]}")
    for a, b in zip(ss, ds):
        k = a.get("stop_key")
        for f in KEEP_STOP:
            if a.get(f) != b.get(f):
                errors.append(f"{k}.{f}: zmienione ('{a.get(f)}' → '{b.get(f)}') — pole niezmienne")
        for f in TEXT_STOP:
            if f not in b:
                errors.append(f"{k}.{f}: brak klucza")
            else:
                text(f"{k}.{f}", a.get(f), b.get(f), f != "name")
        pa, pb = a.get("desc_paragraphs") or [], b.get("desc_paragraphs") or []
        if not isinstance(pb, list):
            errors.append(f"{k}.desc_paragraphs: musi być listą")
            continue
        if len(pa) != len(pb):
            errors.append(f"{k}.desc_paragraphs: {len(pb)} akapitów, źródło ma {len(pa)}")
        for i, (x, y) in enumerate(zip(pa, pb)):
            text(f"{k}.desc_paragraphs[{i}]", x, y)

    for sect, keep, txt in (("day_plan", ["sort_order", "time_label", "stop_key"], ["description"]),
                            ("emergency_points", ["sort_order", "type", "maps_query"], ["label", "description"])):
        sa, sb = src.get(sect) or [], dst.get(sect) or []
        if len(sa) != len(sb):
            errors.append(f"{sect}: {len(sb)} pozycji, źródło ma {len(sa)}")
        for i, (a, b) in enumerate(zip(sa, sb)):
            for f in keep:
                if a.get(f) != b.get(f):
                    errors.append(f"{sect}[{i}].{f}: zmienione ('{a.get(f)}' → '{b.get(f)}')")
            for f in txt:
                text(f"{sect}[{i}].{f}", a.get(f), b.get(f), False)

    if total and same / total > 0.3:
        errors.append(f"{same} z {total} dłuższych pól identycznych ze źródłem — nieprzetłumaczone")
    elif same:
        warnings.append(f"{same} dłuższych pól identycznych ze źródłem — sprawdź, czy to nazwy własne")

    if as_json:
        print(json.dumps({"ok": not errors, "errors": errors, "warnings": warnings}, ensure_ascii=False))
    else:
        for w in warnings: print("  [uwaga]", w)
        for e in errors: print("  [BŁĄD]", e)
        print(("✗ %d błędów" % len(errors)) if errors else "✓ Tłumaczenie zgodne ze źródłem")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
