// „Kim był…” bez AI (JP 2026-10-26): krótki opis postaci z Wikipedii (pl → it → en) — pierwsze zdania streszczenia + URL.
// Używane przy dopytaniu: błąd „X jest niewyjaśniony (lekcja 9)” dostaje gotowy materiał, więc poprawka nie wymaga researchu.
const UA = { 'User-Agent': 'QuolinoBot/1.0 (quolino.com)' };
const cache = new Map();
async function j(url) {
  if (cache.has(url)) return cache.get(url);
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  const v = r?.ok ? await r.json().catch(() => null) : null; cache.set(url, v); return v;
}
export async function whoIs(name, { city = '', langs = ['pl', 'it', 'en'] } = {}) {
  const bare = name.replace(/^(Kardynał|Papież|Malarz|Rzeźbiarz|Architekt)\s+/i, '');
  const tries = [...new Set([city && /^(Święt|Św\.|San |Santa |Beato|Beata)/i.test(name) ? `${name} ${city}` : null, name, bare].filter(Boolean))];
  for (const q of tries) for (const lang of langs) {
    const s = await j(`https://${lang}.wikipedia.org/w/api.php?action=opensearch&format=json&limit=1&search=${encodeURIComponent(q)}`);
    const title = s?.[1]?.[0]; if (!title) continue;
    const sum = await j(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);
    if (!sum?.extract || sum.type === 'disambiguation') continue;
    const text = sum.extract.split(/(?<=[.!?])\s+/).slice(0, 3).join(' ');
    return { name, title: sum.title, lang, text, url: sum.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}` };
  }
  return null;
}
// nazwy postaci z treści błędów kontroli: „Perugino jest niewyjaśniony”, „Kardynał Gil Albornoz jest niewyjaśniony”, „Święty Feliks…”
export function namesFromProblem(problem) {
  const p = String(problem);
  if (!/niewyjaśnion|kim był|kim była|lekcja 9/i.test(p)) return [];
  const m = p.match(/^(?:\[[^\]]*\]\s*)?(.+?)\s+(?:w zdaniu[^,]*\s+)?(?:jest|są|pojawia się|zostaje)\b.*niewyjaśnion/i) ?? p.match(/^(?:\[[^\]]*\]\s*)?(.+?)\s+(?:jest|są)\s+niewyjaśnion/i);
  if (!m) return [];
  return [m[1].replace(/\s*\(.*\)$/, '').trim()].filter(x => x.length > 2 && x.length < 60);
}
if (import.meta.url === `file://${process.argv[1]}`) console.log(await whoIs(process.argv.slice(2).join(' ') || 'Perugino'));
