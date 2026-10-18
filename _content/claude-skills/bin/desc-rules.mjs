// Progi głębokości opisu rodzica (JP 2026-10-13) — czysty moduł bez zależności (bez bazy, sieci i pg),
// żeby walidatory dało się testować lokalnie. draft-lib.mjs eksportuje te same nazwy dalej.
export const SIGHT_CATS = new Set(['monument', 'church', 'museum', 'castle', 'house', 'synagogue']);
export const PLACE_CATS = new Set(['viewpoint', 'street', 'photo', 'park']);
export const DESCRIBE_CATS = new Set([...SIGHT_CATS, ...PLACE_CATS]);
export const wordsOf = (s) => (String(s).match(/[\p{L}\p{N}]+/gu) ?? []).length;
export const sentencesOf = (s) => (String(s).match(/[.!?…]+(?:["”»)]*)(?=\s|$)/g) ?? []).length;

// problemy opisu wg progów JP: zabytek 4 akap./300 słów, miejsce 2 akap./120 słów, akapit zabytku min. 40 słów i 2+ zdania
export function descProblems(category, paras) {
  const p = Array.isArray(paras) ? paras.filter(x => typeof x === 'string') : [];
  const [minPar, minWords] = SIGHT_CATS.has(category) ? [4, 300] : PLACE_CATS.has(category) ? [2, 120] : [1, 0];
  const out = [];
  const words = p.reduce((n, x) => n + wordsOf(x), 0);
  if (p.length < minPar || words < minWords) out.push(`${p.length} akapitów i ${words} słów — minimum ${minPar} akapity i ${minWords} słów`);
  if (SIGHT_CATS.has(category)) {
    const bad = p.map((x, i) => ({ i: i + 1, w: wordsOf(x), s: sentencesOf(x) })).filter(x => x.w < 40 || x.s < 2);
    if (bad.length) out.push(`akapity ${bad.map(b => `${b.i} (${b.w} słów, ${b.s} zd.)`).join(', ')} za krótkie — akapit ma mieć min. 40 słów i 2+ zdania; nie tnij tekstu na jednozdaniowe akapity, łącz je`);
  }
  return out;
}
