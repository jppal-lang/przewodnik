// Naprawa uszkodzonego JSON-a od modeli — w kodzie, bez wywołań AI (JP 2026-10-26: „naprawa JSON” przez model kosztowała 1–2 wywołania).
// Czysty moduł bez zależności (bez pg, sieci), żeby dało się go testować lokalnie: node --test json-repair.test.mjs.
// lib.mjs eksportuje repairJson dalej i używa go w extractJson przed poddaniem się.
//
// repairJson(text) → string (JSON do JSON.parse). Automat znak po znaku:
//  - zdejmuje ``` płotki i prozę przed/po; bierze najbardziej zewnętrzny {…} albo […],
//  - prosty " wewnątrz tekstu (polskie „cytat" / "cytat") → typograficzny „ lub ”, gdy po nim nie stoi znak struktury,
//  - typograficzne cudzysłowy użyte jako ograniczniki JSON-a → ",
//  - surowe znaki nowej linii / tabulatory w tekstach → \n / \t, błędne \x → \\x,
//  - przecinki przed } ] usunięte, komentarze // i /* */ poza tekstami usunięte,
//  - ucięta odpowiedź: domknięty tekst, brakująca wartość = null, domknięte nawiasy.

const WS = new Set([' ', '\t', '\n', '\r', ' ', '﻿']);
const SMART_OPEN = new Set(['“', '„', '”']);     // jako ogranicznik otwierający poza tekstem
const SMART_CLOSE = new Set(['”', '“']);         // jako ogranicznik zamykający tekst otwarty typograficznie
const ESC_OK = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u']);

// pomija białe znaki i komentarze // /* */ (przy zaglądaniu w przód)
function skipWs(s, i) {
  for (;;) {
    while (i < s.length && WS.has(s[i])) i++;
    if (s[i] === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (s[i] === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i + 2); i = e < 0 ? s.length : e + 2; continue; }
    return i;
  }
}

// czy od pozycji i zaczyna się wartość JSON (po przecinku w tablicy)
function valueStartsAt(s, i) {
  const c = s[i];
  if (c === undefined) return true;                       // ucięte — przyjmij strukturę
  if (c === '"' || c === '{' || c === '[' || SMART_OPEN.has(c)) return true;
  if (/[-\d]/.test(c)) {
    const m = s.slice(i).match(/^-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/);
    if (!m) return false;
    const after = s[skipWs(s, i + m[0].length)];
    return after === undefined || after === ',' || after === '}' || after === ']';
  }
  for (const lit of ['true', 'false', 'null']) if (s.startsWith(lit, i)) {
    const after = s[skipWs(s, i + lit.length)];
    return after === undefined || after === ',' || after === '}' || after === ']';
  }
  return false;
}

// czy od pozycji i (cudzysłów) stoi klucz obiektu: "…" a potem :
function keyStartsAt(s, i) {
  const c = s[i];
  if (c === undefined) return true;
  if (c === '}') return true;                              // przecinek przed } — usuniemy go
  if (c !== '"' && !SMART_OPEN.has(c)) return false;
  for (let j = i + 1; j < s.length && j < i + 200; j++) {
    if (s[j] === '\\') { j++; continue; }
    if (s[j] === '"' || SMART_CLOSE.has(s[j])) {
      const k = skipWs(s, j + 1);
      return s[k] === ':' || k >= s.length;
    }
    if (s[j] === '\n') return false;
  }
  return false;
}

// cudzysłów na pozycji i zamyka tekst? (patrzymy, co stoi dalej)
function closesString(s, i, frame, isKey) {
  const j = skipWs(s, i + 1);
  const c = s[j];
  if (c === undefined) return true;
  if (isKey) return c === ':';
  if (c === '}' || c === ']') return true;
  if (c === ':') return false;                             // „Uwaga": w środku wartości — treść
  if (c === ',') {
    const k = skipWs(s, j + 1);
    if (k >= s.length) return true;
    if (s[k] === '}' || s[k] === ']') return true;         // przecinek wiszący
    return frame === '{' ? keyStartsAt(s, k) : valueStartsAt(s, k);
  }
  return false;
}

function extractCandidate(text) {
  let t = String(text ?? '').replace(/^﻿/, '');
  const fence = t.match(/```[a-zA-Z]*[ \t]*\r?\n?([\s\S]*?)(?:```|$)/);
  if (fence && /[[{]/.test(fence[1])) t = fence[1];
  return t;
}

// Główny automat. start = indeks pierwszego { lub [.
function repairFrom(t, start) {
  let out = '';
  const stack = [];                 // '{' | '['
  const expectKey = [];             // dla ramek '{': czy następny tekst to klucz
  let i = start;
  let lastKey = false;              // ostatni domknięty token to klucz bez dwukropka
  const trimTrailingComma = () => { out = out.replace(/,\s*$/, ''); };

  while (i < t.length) {
    const c = t[i];
    // ── poza tekstem ──
    if (c === '/' && t[i + 1] === '/') { while (i < t.length && t[i] !== '\n') i++; continue; }
    if (c === '/' && t[i + 1] === '*') { const e = t.indexOf('*/', i + 2); i = e < 0 ? t.length : e + 2; continue; }
    if (c === '{' || c === '[') {
      stack.push(c); expectKey.push(c === '{'); out += c; lastKey = false; i++; continue;
    }
    if (c === '}' || c === ']') {
      if (!stack.length) break;
      trimTrailingComma();
      if (lastKey) { out += ':null'; lastKey = false; }
      if (/:\s*$/.test(out)) out += 'null';
      const open = stack.pop(); expectKey.pop();
      out += open === '{' ? '}' : ']';                     // zły nawias zamykający → właściwy
      i++;
      if (!stack.length) return out;                       // proza po JSON-ie odpada
      continue;
    }
    if (c === ',') {
      if (!/[,[{]\s*$/.test(out)) out += ',';              // podwójne przecinki i przecinek zaraz po [ {
      if (stack.at(-1) === '{') expectKey[expectKey.length - 1] = true;
      i++; continue;
    }
    if (c === ':') { out += ':'; lastKey = false; if (stack.at(-1) === '{') expectKey[expectKey.length - 1] = false; i++; continue; }
    if (c === '"' || SMART_OPEN.has(c)) {
      // ── tekst ──
      const smart = c !== '"';
      const frame = stack.at(-1);
      const isKey = frame === '{' && expectKey.at(-1);
      out += '"'; i++;
      let closed = false;
      while (i < t.length) {
        const d = t[i];
        if (d === '\\') {
          const n = t[i + 1];
          if (n === undefined) { i++; break; }
          if (ESC_OK.has(n)) {
            if (n === 'u' && !/^[0-9a-fA-F]{4}$/.test(t.slice(i + 2, i + 6))) { out += '\\\\'; i++; continue; }
            out += d + n; i += 2; continue;
          }
          out += '\\\\'; i++; continue;                    // \x → \\x
        }
        const closer = d === '"' || (smart && SMART_CLOSE.has(d));
        if (closer) {
          if (closesString(t, i, frame, isKey)) { out += '"'; i++; closed = true; break; }
          // cudzysłów w treści → typograficzny: otwierający po spacji/nawiasie, inaczej zamykający
          if (d === '"') {
            const prev = t[i - 1];
            out += prev === undefined || WS.has(prev) || '([{/–—-'.includes(prev) ? '„' : '”';
          } else out += d;
          i++; continue;
        }
        if (d === '\n') { out += '\\n'; i++; continue; }
        if (d === '\r') { out += '\\r'; i++; continue; }
        if (d === '\t') { out += '\\t'; i++; continue; }
        if (d < ' ') { out += '\\u' + d.charCodeAt(0).toString(16).padStart(4, '0'); i++; continue; }
        out += d; i++;
      }
      if (!closed) {                                       // ucięte w środku tekstu
        out = out.replace(/\\+$/, (m) => m.length % 2 ? m.slice(0, -1) : m);
        out += '"';
      }
      if (isKey) lastKey = true;
      else if (frame === '{') expectKey[expectKey.length - 1] = false;
      continue;
    }
    if (WS.has(c)) { out += c === ' ' || c === '﻿' ? ' ' : c; i++; continue; }
    // literały i liczby — przepisz słowo
    const m = t.slice(i).match(/^(?:-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?|true|false|null|True|False|None|NaN|undefined)/);
    if (m) {
      const map = { True: 'true', False: 'false', None: 'null', NaN: 'null', undefined: 'null' };
      out += map[m[0]] ?? m[0]; i += m[0].length; lastKey = false; continue;
    }
    // ucięty literał na końcu (tru, nul, fals)
    const tail = t.slice(i).match(/^(t|tr|tru|f|fa|fal|fals|n|nu|nul)\s*$/);
    if (tail) { out += { t: 'true', f: 'false', n: 'null' }[tail[1][0]]; i = t.length; continue; }
    i++;                                                   // śmieci poza tekstem pomijamy
  }

  // ── ucięta odpowiedź: domknij ──
  out = out.replace(/\s+$/, '');
  out = out.replace(/-$/, '');                             // urwana liczba ujemna
  out = out.replace(/(\d)\.$/, '$1');                     // urwany ułamek
  trimTrailingComma();
  if (lastKey) out += ':null';
  if (/:$/.test(out)) out += 'null';
  while (stack.length) {
    trimTrailingComma();
    out += stack.pop() === '{' ? '}' : ']';
  }
  return out;
}

export function repairJson(text) {
  const t = extractCandidate(text);
  // kandydaci na początek JSON-a: każde { i [ (najwyżej 60); najpierw te, po których wygląda na JSON
  // („Lista [3 pozycje]:” w prozie nie wygrywa z właściwą tablicą dalej)
  const starts = [];
  for (let i = 0; i < t.length && starts.length < 60; i++) if (t[i] === '{' || t[i] === '[') starts.push(i);
  if (!starts.length) throw new Error('repairJson: brak { ani [ w odpowiedzi');
  const plausible = (i) => { const k = skipWs(t, i + 1); return t[i] === '{' ? keyStartsAt(t, k) : (t[k] === ']' || valueStartsAt(t, k)); };
  const order = [...starts.filter(plausible), ...starts.filter(i => !plausible(i))];
  let first = null;
  for (const s of order) {
    const r = repairFrom(t, s);
    first ??= r;
    try { JSON.parse(r); return r; } catch {}
  }
  return first;
}

// Parsowanie odpowiedzi modelu: najpierw zwykłe (płotek albo {…}), potem naprawa w kodzie. onRepair(err) — do logu.
export function parseModelJson(text, { onRepair = null } = {}) {
  const s = String(text ?? '');
  let firstErr;
  try {
    const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = fenced ? fenced[1] : s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1);
    return JSON.parse(raw);
  } catch (e) { firstErr = e; }
  try { return JSON.parse(s.trim()); } catch {}
  let fixed;
  try { fixed = JSON.parse(repairJson(s)); } catch { throw firstErr; }
  onRepair?.(firstErr);
  return fixed;
}
