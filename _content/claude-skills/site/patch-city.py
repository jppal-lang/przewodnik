import sys, re
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
# strony z serwera (SSR, 2026-10-11): /{lang}/{region}/{miasto}/ — slug i język z window.QSSR,
# adres kanoniczny zawsze „ładny”, zmiana języka zmienia adres. Stary adres city.html?c= dalej działa.
if 'window.QSSR' not in s:
    def r1(a, b):
        global s
        assert s.count(a) == 1, ('SSR', s.count(a), a[:70])
        s = s.replace(a, b)
    r1("var citySlug = new URLSearchParams(location.search).get('c');",
       "var citySlug = new URLSearchParams(location.search).get('c') || (window.QSSR && window.QSSR.slug) || null;")
    r1("var currentLang = new URLSearchParams(location.search).get('lang') || readPref() || FALLBACK;",
       "var currentLang = new URLSearchParams(location.search).get('lang') || (window.QSSR && window.QSSR.lang) || readPref() || FALLBACK;")
    r1("  kanon.href = location.origin + location.pathname + '?c=' + encodeURIComponent(city.slug);",
       "  kanon.href = location.origin + '/' + currentLang + '/' + city.region_slug + '/' + encodeURIComponent(city.slug) + '/';")
    r1("  meta('property', 'og:url', location.href);",
       "  meta('property', 'og:url', location.origin + '/' + currentLang + '/' + city.region_slug + '/' + city.slug + '/');")
    r1("  currentLang = lang;\n  savePref(lang);",
       "  currentLang = lang;\n  savePref(lang);\n"
       "  if (window.QSSR && history.replaceState && window.QSSR.langs && window.QSSR.langs.indexOf(lang) > -1)\n"
       "    history.replaceState(null, '', '/' + lang + '/' + window.QSSR.region + '/' + window.QSSR.slug + '/' + location.search + location.hash);")

# zgłoszenia od rodzin (2026-10-11) — dokładane niezależnie od podglądu szkicu
if 'report-issue.js' not in s:
    t = '<script src="motion.js?v=4" defer></script>'
    assert s.count(t) == 1, 'nie znalazłem motion.js'
    s = s.replace(t, t + '\n<script src="report-issue.js?v=1" defer></script>')
# opinie rodzin na końcu wycieczki (2026-10-11)
if 'opinion.js' not in s:
    s = s.replace('<script src="report-issue.js?v=1" defer></script>', '<script src="report-issue.js?v=1" defer></script>\n<script src="opinion.js?v=1" defer></script>')
if 'draft-preview.js' in s:
    open(p, 'w', encoding='utf-8').write(s)
    print('podgląd już był; SSR i zgłoszenia dodane'); sys.exit(0)

def rep(a, b, count=1):
    global s
    assert s.count(a) == count, (s.count(a), a[:80])
    s = s.replace(a, b)

# 1) podgląd szkicu: bez Google Analytics, bez indeksowania, moduł podglądu przed skryptem strony
rep('<script async src="https://www.googletagmanager.com/gtag/js',
    '<script>if (/[?&]draft=/.test(location.search)) { window[\'ga-disable-G-Z3YC8NF30B\'] = true; '
    'document.write(\'<meta name="robots" content="noindex,nofollow">\'); }</script>\n'
    '<script src="draft-preview.js?v=1"></script>\n'
    '<script async src="https://www.googletagmanager.com/gtag/js')

# 2) brak ?c= dopuszczalny w podglądzie
rep("if (!citySlug) { showError('Brak parametru ?c= w adresie.'); return; }",
    "if (!citySlug && !window.QDraft) { showError('Brak parametru ?c= w adresie.'); return; }")

# 3) cztery pierwsze zapytania z migawki szkicu
m = re.search(r"  Promise\.all\(\[\n(    sb\('cities'.*?\n    sb\('city_translations'.*?\n    sb\('stops'.*?\n    sb\('emergency_points'.*?\n)", s)
assert m, 'nie znalazłem zapytań'
four = m.group(1).rstrip(',\n')
s = s[:m.start()] + ("  var QD = window.QDraft;\n  var core = QD ? QD.core(lang, SB_URL, SB_KEY, FALLBACK) : [\n"
                     + m.group(1).rstrip('\n').rstrip(',') + "\n  ];\n  Promise.all(core.concat([\n") + s[m.end():]
rep("    sb('countries', 'select=*'),\n  ]).then(function(results) {",
    "    sb('countries', 'select=*'),\n  ])).then(function(results) {")

# 4) slug z podglądu, fiszka po wyrenderowaniu, czytelny błąd
rep("    if (!city) { showError('Nie znaleziono wycieczki: ' + esc(citySlug)); return; }",
    "    if (QD && QD.info) citySlug = QD.info.city_slug;\n"
    "    if (!city) { showError('Nie znaleziono wycieczki: ' + esc(citySlug)); return; }")
rep("    applyKidViewParam();\n\n  }).catch(function(err) {",
    "    applyKidViewParam();\n    if (QD) QD.chrome();\n\n  }).catch(function(err) {")
rep("    console.error('[city.html]', err);\n",
    "    console.error('[city.html]', err);\n"
    "    if (window.QDraft) { showError('Nie znalazłem tego szkicu — link jest nieaktualny albo szkic został usunięty.'); return; }\n")
open(p, 'w', encoding='utf-8').write(s)
print('ok')
