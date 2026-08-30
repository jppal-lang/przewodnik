#!/usr/bin/env python3
"""
Import Spello v31 do Supabase — generuje SQL z UPSERT-ami.

Obsługuje sytuację gdy dane już istnieją (UPDATE) lub nie (INSERT).
Mapuje stare stop_key na nowe z v31.

Użycie:
  python import_spello.py <folder_z_jsonami>

Wynik: pliki .sql w bieżącym katalogu
"""

import json
import sys
import os
import glob

# Mapowanie: stary stop_key w DB → nowy stop_key z v31 JSON
OLD_TO_NEW_KEYS = {
    'parking-mosaici': 'parking-villa-dei-mosaici',
    'villa-mosaici': 'villa-dei-mosaici',
    'belvedere': 'belvedere-panoramico',
    'osteria-del-buchetto': 'kolacja',
}

# ID w bazie (z SELECT — hardcoded po odczycie)
STOP_IDS = {
    'parking-villa-dei-mosaici': 58,
    'villa-dei-mosaici': 59,
    'porta-consolare': 72,
    'sant-andrea': 61,
    'santa-maria-maggiore': 60,
    'via-giulia': 75,
    'porta-venere': 64,
    'vicoli-belvedere': 77,
    'gelateria-la-paola': 62,
    'belvedere-panoramico': 65,
    'kolacja': 66,
}


def esc(val):
    """Escape SQL string — podwaja apostrofy (ASCII i typograficzne)."""
    if val is None:
        return 'NULL'
    s = str(val)
    s = s.replace('‘', "'")
    s = s.replace('’', "'")
    s = s.replace('“', '"')
    s = s.replace('”', '"')
    s = s.replace('ʼ', "'")
    s = s.replace("'", "''")
    return f"'{s}'"


def arr(lst):
    """Konwertuje listę stringów na PostgreSQL ARRAY literal."""
    if not lst or lst == ['']:
        return "ARRAY[]::text[]"
    items = ", ".join(esc(p) for p in lst if p)
    return f"ARRAY[{items}]"


def main():
    if len(sys.argv) < 2:
        print("Użycie: python import_spello.py <folder_z_jsonami>")
        sys.exit(1)

    folder = sys.argv[1]

    # --- Wczytaj pliki ---
    meta_path = os.path.join(folder, 'spello.meta.json')
    with open(meta_path, 'r', encoding='utf-8') as f:
        meta = json.load(f)

    lang_files = sorted(glob.glob(os.path.join(folder, 'spello.??.json')))
    langs = {}
    for lf in lang_files:
        with open(lf, 'r', encoding='utf-8') as f:
            data = json.load(f)
        code = data['lang']
        langs[code] = data

    print(f"Znaleziono {len(langs)} języków: {', '.join(sorted(langs.keys()))}")

    stop_keys = [s['stop_key'] for s in meta['stops']]

    # =============================================================
    # KROK 1: Aktualizacja stop_key + category w stops
    # =============================================================
    with open('01_update_stops.sql', 'w', encoding='utf-8') as f:
        f.write("-- KROK 1: Aktualizacja stop_key i category w istniejących stops\n\n")

        # Zmiana stop_key
        for old_key, new_key in OLD_TO_NEW_KEYS.items():
            f.write(f"UPDATE stops SET stop_key = '{new_key}' WHERE city_slug = 'spello' AND stop_key = '{old_key}';\n")

        # Poprawka category porta-venere: castle → monument
        f.write("\n-- Poprawka category\n")
        f.write("UPDATE stops SET category = 'monument' WHERE city_slug = 'spello' AND stop_key = 'porta-venere';\n")

        # Aktualizacja optional i sunset_spot z meta
        f.write("\n-- Aktualizacja optional / sunset_spot z v31 meta\n")
        for stop in meta['stops']:
            sk = stop['stop_key']
            opt = 'true' if stop.get('optional') else 'false'
            sun = 'true' if stop.get('sunset_spot') else 'false'
            f.write(f"UPDATE stops SET optional = {opt}, sunset_spot = {sun} WHERE city_slug = 'spello' AND stop_key = '{sk}';\n")

    print("✓ 01_update_stops.sql")

    # =============================================================
    # KROK 2: city_translations — UPSERT
    # =============================================================
    with open('02_city_translations.sql', 'w', encoding='utf-8') as f:
        f.write("-- KROK 2: city_translations — UPSERT (INSERT ON CONFLICT UPDATE)\n\n")

        for code in sorted(langs.keys()):
            data = langs[code]
            city = data.get('city', {})

            title = esc(city.get('title'))
            region_label = esc(city.get('region_label'))
            subtitle = esc(city.get('subtitle'))
            lead = esc(city.get('lead'))
            good_to_know = esc(city.get('good_to_know'))
            local_food = esc(city.get('local_food'))
            hero_note = esc(city.get('hero_note'))

            f.write(f"""INSERT INTO city_translations (city_slug, lang, title, region_label, subtitle, lead, good_to_know, local_food, hero_note)
VALUES ('spello', '{code}', {title}, {region_label}, {subtitle}, {lead}, {good_to_know}, {local_food}, {hero_note})
ON CONFLICT (city_slug, lang) DO UPDATE SET
  title = EXCLUDED.title,
  region_label = EXCLUDED.region_label,
  subtitle = EXCLUDED.subtitle,
  lead = EXCLUDED.lead,
  good_to_know = EXCLUDED.good_to_know,
  local_food = EXCLUDED.local_food,
  hero_note = EXCLUDED.hero_note,
  updated_at = now();\n\n""")

    print("✓ 02_city_translations.sql")

    # =============================================================
    # KROK 3: stop_translations — UPSERT
    # =============================================================
    with open('03_stop_translations.sql', 'w', encoding='utf-8') as f:
        f.write("-- KROK 3: stop_translations — UPSERT\n")
        f.write(f"-- 11 przystanków × {len(langs)} języków = {11 * len(langs)} wierszy\n\n")

        for code in sorted(langs.keys()):
            data = langs[code]
            stops_data = data.get('stops', {})

            f.write(f"-- === JĘZYK: {code.upper()} ===\n")

            for sk in stop_keys:
                st = stops_data.get(sk)
                if st is None:
                    f.write(f"-- BRAK DANYCH: {sk} / {code}\n")
                    continue

                stop_id = STOP_IDS.get(sk)
                if stop_id is None:
                    f.write(f"-- NIEZNANY stop_key: {sk}\n")
                    continue

                name = esc(st.get('name'))
                dp = arr(st.get('desc_paragraphs', []))
                kids = esc(st.get('kids_box'))
                hint = esc(st.get('hint'))
                flavor = esc(st.get('local_flavor'))
                note = esc(st.get('practical_note'))
                dress = esc(st.get('dress_code'))
                photo = esc(st.get('photo_task'))

                f.write(f"""INSERT INTO stop_translations (stop_id, lang, name, desc_paragraphs, kids_box, hint, local_flavor, practical_note, dress_code, photo_task)
VALUES ({stop_id}, '{code}', {name}, {dp}, {kids}, {hint}, {flavor}, {note}, {dress}, {photo})
ON CONFLICT (stop_id, lang) DO UPDATE SET
  name = EXCLUDED.name,
  desc_paragraphs = EXCLUDED.desc_paragraphs,
  kids_box = EXCLUDED.kids_box,
  hint = EXCLUDED.hint,
  local_flavor = EXCLUDED.local_flavor,
  practical_note = EXCLUDED.practical_note,
  dress_code = EXCLUDED.dress_code,
  photo_task = EXCLUDED.photo_task,
  updated_at = now();\n\n""")

    print("✓ 03_stop_translations.sql")

    # =============================================================
    # KROK 4: day_plan — DELETE + INSERT (PL tylko, godziny orientacyjne)
    # =============================================================
    with open('04_day_plan.sql', 'w', encoding='utf-8') as f:
        f.write("-- KROK 4: day_plan — PL (DELETE stare + INSERT nowe z v31 stop_keys)\n\n")
        f.write("DELETE FROM day_plan WHERE city_slug = 'spello' AND lang = 'pl';\n\n")

        pl_stops = langs.get('pl', {}).get('stops', {})
        times = ['09:00', '09:15', '10:15', '10:30', '11:00', '11:45',
                 '12:00', '12:20', '12:45', '13:00', '13:30']

        f.write("INSERT INTO day_plan (city_slug, lang, time_label, description, sort_order, stop_key)\nVALUES\n")
        rows = []
        for i, sk in enumerate(stop_keys):
            name = pl_stops.get(sk, {}).get('name', sk)
            time = times[i] if i < len(times) else f'{13 + i}:00'
            rows.append(f"  ('spello', 'pl', '{time}', {esc(name)}, {i + 1}, '{sk}')")
        f.write(",\n".join(rows) + ";\n")

    print("✓ 04_day_plan.sql")

    # =============================================================
    # KROK 5: emergency_points — UPSERT PL + EN
    # =============================================================
    with open('05_emergency_points.sql', 'w', encoding='utf-8') as f:
        f.write("-- KROK 5: emergency_points\n")
        f.write("-- PL już istnieje — pomijamy, nie nadpisujemy\n")
        f.write("-- EN — wstawiamy jeśli brakuje\n\n")

        en_data = langs.get('en', {})
        emergency = en_data.get('emergency', {})

        if emergency:
            f.write("-- EN emergency points\n")
            sort = 10
            for key, ep in emergency.items():
                label = esc(ep.get('label', ''))
                desc = esc(ep.get('description', ''))
                maps_q = esc(ep.get('label', '') + ', Spello PG, Italy')

                if 'Farmacia' in ep.get('label', '') or 'harmac' in ep.get('label', '').lower():
                    etype = 'pharmacy'
                elif 'toilet' in ep.get('label', '').lower():
                    etype = 'toilet'
                elif 'playground' in ep.get('label', '').lower():
                    etype = 'playground'
                else:
                    etype = 'pharmacy'

                f.write(f"""INSERT INTO emergency_points (city_slug, lang, type, label, description, maps_query, sort_order)
VALUES ('spello', 'en', '{etype}', {label}, {desc}, {maps_q}, {sort})
ON CONFLICT (city_slug, lang, sort_order) DO UPDATE SET
  type = EXCLUDED.type, label = EXCLUDED.label,
  description = EXCLUDED.description, maps_query = EXCLUDED.maps_query;\n\n""")
                sort += 10

    print("✓ 05_emergency_points.sql")

    # =============================================================
    # KROK 6: Weryfikacja
    # =============================================================
    with open('06_verify.sql', 'w', encoding='utf-8') as f:
        f.write("""-- KROK 6: Weryfikacja po imporcie

-- Czy stop_keys się zgadzają z v31?
SELECT id, stop_key, category, optional, sunset_spot
FROM stops WHERE city_slug = 'spello' ORDER BY sort_order;

-- Ile tłumaczeń miasta per język?
SELECT lang, title FROM city_translations WHERE city_slug = 'spello' ORDER BY lang;
-- Oczekiwany wynik: 17 wierszy

-- Ile tłumaczeń przystanków per język?
SELECT lang, COUNT(*) as cnt
FROM stop_translations
WHERE stop_id IN (SELECT id FROM stops WHERE city_slug = 'spello')
GROUP BY lang ORDER BY lang;
-- Oczekiwany wynik: 17 wierszy, każdy z cnt = 11

-- Day plan
SELECT sort_order, time_label, description, stop_key
FROM day_plan WHERE city_slug = 'spello' AND lang = 'pl'
ORDER BY sort_order;
""")

    print("✓ 06_verify.sql")

    # =============================================================
    # KROK 7: Połączony plik all.sql
    # =============================================================
    with open('all_spello_import.sql', 'w', encoding='utf-8') as f:
        for fname in ['01_update_stops.sql', '02_city_translations.sql',
                      '03_stop_translations.sql', '04_day_plan.sql',
                      '05_emergency_points.sql']:
            with open(fname, 'r', encoding='utf-8') as src:
                f.write(src.read())
            f.write("\n\n")

    print("✓ all_spello_import.sql (połączony)")

    total_ops = 4 + 11 + len(langs) + 11 * len(langs) + 11 + 3
    print(f"""
╔══════════════════════════════════════════════════════════════╗
║  GOTOWE — {total_ops} operacji SQL                                  ║
╠══════════════════════════════════════════════════════════════╣
║  01_update_stops.sql       — 4 key renames + category fix    ║
║  02_city_translations.sql  — {len(langs):>2} UPSERT-ów                   ║
║  03_stop_translations.sql  — {11*len(langs):>3} UPSERT-ów                  ║
║  04_day_plan.sql           — DELETE + 11 INSERT              ║
║  05_emergency_points.sql   — EN emergency points             ║
║  06_verify.sql             — zapytania kontrolne             ║
║                                                              ║
║  all_spello_import.sql     — WSZYSTKO W JEDNYM PLIKU         ║
╚══════════════════════════════════════════════════════════════╝
""")


if __name__ == '__main__':
    main()
