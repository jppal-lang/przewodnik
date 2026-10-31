// Pytanie z wyborem odpowiedzi w misji dziecka (decyzja JP 2026-10-31) — wspólne reguły pipeline’u.
// Kształt pola przystanku (content.stops.<klucz>.kids_choice, baza: stop_translations.kids_choice):
//   {"options": ["…", "…", "…", "…"], "correct": 0..3}   — pole OPCJONALNE; brak / null = misja bez wyboru (jak dotąd).
// Te same reguły: scripts/validate_trip.py (choice_problems), baza public.kids_choice_ok (SQL 2026-10-31-misja-wybor.sql),
// strona kid-choice.js (valid). Używają: gemini-draft.mjs (prompt + czyszczenie przed zapisem), source-check.mjs (odpowiedź = fakt),
// trip-translate.mjs (opcje tłumaczone razem z misją, indeks z PL). Testy: kids-choice.test.mjs.

export const CHOICE_MAX = 40;          // znaków na opcję po polsku (przycisk dla dziecka, ~2 linie na telefonie)
export const CHOICE_MAX_TR = 56;       // tłumaczenie bywa dłuższe (DE, NL, HU: +30–40%)
const DASH = /[—–]/;
const NO_QUEST = new Set(['parking', 'restaurant', 'icecream', 'sweets']);

// lista problemów (po polsku); pusta = pytanie poprawne. max: limit znaków (PL 40, tłumaczenie 56)
export function choiceProblems(ch, { max = CHOICE_MAX } = {}) {
  if (ch == null) return [];
  if (typeof ch !== 'object' || Array.isArray(ch)) return ['ma być obiektem {"options": [4 teksty], "correct": 0..3}'];
  const out = [];
  const o = ch.options;
  if (!Array.isArray(o) || o.length !== 4) out.push(`ma mieć dokładnie 4 opcje (jest ${Array.isArray(o) ? o.length : 'brak listy'})`);
  else {
    o.forEach((x, i) => {
      if (typeof x !== 'string' || !x.trim()) { out.push(`opcja ${i + 1} pusta albo nie jest tekstem`); return; }
      if (DASH.test(x)) out.push(`opcja ${i + 1} ma długą pauzę „—”/„–” (zwykły łącznik „-” albo przecinek)`);
      if (x.trim().length > max) out.push(`opcja ${i + 1} ma ${x.trim().length} znaków (najwyżej ~${max}): „${x.trim().slice(0, 60)}”`);
    });
    const norm = o.filter(x => typeof x === 'string').map(x => x.trim().toLowerCase());
    if (new Set(norm).size !== norm.length) out.push('opcje się powtarzają (muszą być 4 różne)');
  }
  if (!Number.isInteger(ch.correct) || ch.correct < 0 || ch.correct > 3) out.push(`„correct” = ${JSON.stringify(ch.correct)} — ma być numerem poprawnej opcji 0..3`);
  return out;
}
export const choiceOk = (ch, opts) => ch != null && choiceProblems(ch, opts).length === 0;

// przed zapisem szkicu: przycięte spacje, złe pytanie → null (misja zostaje), pytanie bez misji albo przy przystanku praktycznym → null
// meta (opcjonalnie) — kategorie przystanków; zwraca listę usuniętych [{stop_key, why}]
export function cleanChoices(content, meta = null, log = () => {}) {
  const removed = [];
  const cat = Object.fromEntries((meta?.stops ?? []).map(s => [s.stop_key, s.category]));
  for (const [k, st] of Object.entries(content?.stops ?? {})) {
    if (!st || st.kids_choice == null) { if (st && 'kids_choice' in st) st.kids_choice = null; continue; }
    const ch = st.kids_choice;
    if (ch && Array.isArray(ch.options)) ch.options = ch.options.map(x => typeof x === 'string' ? x.trim().replace(/\s+/g, ' ') : x);
    if (ch && typeof ch.correct === 'string' && /^[0-3]$/.test(ch.correct)) ch.correct = +ch.correct;
    const why = !st.kids_box ? 'pytanie bez misji' : NO_QUEST.has(cat[k]) ? 'przystanek praktyczny (bez misji)' : choiceProblems(ch).join('; ');
    if (why) { st.kids_choice = null; removed.push({ stop_key: k, why }); log(`  ${k}: pytanie z wyborem usunięte — ${why}`); }
    else st.kids_choice = { options: ch.options, correct: ch.correct };
  }
  return removed;
}

// poprawna odpowiedź jako fakt do sprawdzenia w źródłach (source-check)
export function choiceFact(st) {
  const ch = st?.kids_choice;
  if (!choiceOk(ch)) return null;
  return { answer: ch.options[ch.correct], wrong: ch.options.filter((_, i) => i !== ch.correct), question: st.kids_box ?? '' };
}

// instrukcja do promptu szkicu (gemini-draft) — dla 1–2 przystanków, tylko gdy odpowiedź wynika z researchu
export const CHOICE_RULE = `PYTANIE Z WYBOREM (kids_choice, opcjonalne): przy 1–2 przystankach zwiedzania, gdzie misja jest pytaniem obserwacyjnym
(„co wyrasta na szczycie bramy?”, „jakie zwierzę jest w herbie nad drzwiami?”, „ile łuków ma most?”) i POPRAWNA ODPOWIEDŹ WYNIKA WPROST
z researchu albo z opisu tego przystanku, dodaj "kids_choice": {"options": ["…", "…", "…", "…"], "correct": <0..3>}.
- dokładnie 4 krótkie opcje (najwyżej ok. ${CHOICE_MAX} znaków, bez „—”), różne, ta sama kategoria (4 rośliny, 4 zwierzęta, 4 liczby);
- 3 błędne opcje wiarygodne dla dziecka, ale JEDNOZNACZNIE błędne według źródła (nie „też trochę prawda”);
- poprawna opcja w losowym miejscu listy; "correct" = jej numer (0 = pierwsza);
- dziecko sprawdza odpowiedź na miejscu (patrzy, liczy) albo w treści przystanku; misja i wskazówka NIE zdradzają odpowiedzi;
- brak pewności, pytanie otwarte („wymyśl”, „opisz”, „narysuj”), przystanek praktyczny (parking, restauracja, lody) → "kids_choice": null.
Nie wymyślaj faktów: lepiej bez pytania niż z odpowiedzią spoza źródła.`;
