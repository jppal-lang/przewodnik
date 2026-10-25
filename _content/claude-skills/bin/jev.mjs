// Jev (TypeSafe System One, JP 2026-10-25): szybkie decyzje z listy z prawdopodobieństwem — nie pisze tekstu.
// POST https://api.typesafe.ai/v1/systemone · Bearer TYPESAFE_API_KEY (w /opt/data/.env) · model jev-latest.
// Cena wg TypeSafe: wejście 0,042 $ / 1 mln tokenów, wyjście darmowe.
import { env, aiUsage, log } from './lib.mjs';

const URL = 'https://api.typesafe.ai/v1/systemone';
const PRICE_IN = 0.042;
export const jevReady = () => !!env('TYPESAFE_API_KEY');

// questions: { nazwa: { type: 'choice', instructions, criteria: { opcja: 'opis' } } } → answers: { nazwa: { choice, confidence, probabilities } }
export async function jev(state, questions, { role = 'klasyfikacja', model = 'jev-latest' } = {}) {
  const key = env('TYPESAFE_API_KEY');
  if (!key) throw new Error('jev: brak TYPESAFE_API_KEY');
  const r = await fetch(URL, { method: 'POST', signal: AbortSignal.timeout(60_000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, state, questions }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`jev ${r.status}: ${JSON.stringify(j.detail ?? j).slice(0, 300)}`);
  const tin = j.usage?.input_tokens ?? 0;
  aiUsage({ provider: 'jev', model: j.model ?? model, role, billing: 'api', tin, tout: j.usage?.output_tokens ?? 0, usd: tin * PRICE_IN / 1e6 });
  return j.answers ?? {};
}

// Rozdział błędów z kontroli Claude: drobiazg (ostrzeżenie) / podmiana (skrypt) / przepisanie (Gemini).
// Jedno zapytanie na całą listę (pytania równoległe). Bez klucza albo przy błędzie: null — zostaje dotychczasowa ścieżka.
export async function triageErrors(errors, { min = 0.7 } = {}) {
  if (!jevReady() || !errors?.length) return null;
  const questions = {};
  errors.slice(0, 200).forEach((e, i) => {
    questions[`e${i}`] = { type: 'choice',
      instructions: `Błąd nr ${i} z listy w stanie (pole "nr" = ${i}). Jak go poprawić w tekście przewodnika dla rodzin?`,
      criteria: {
        drobiazg: 'Różnica pisowni, zaokrąglenia, pełnej nazwy albo poziomu szczegółu, która nie zmienia sensu dla czytelnika. Wystarczy ostrzeżenie.',
        podmiana: 'Błąd siedzi w jednym fragmencie tekstu, a kontrola podała dosłowny błędny fragment (old) i poprawione brzmienie (new) albo usunięcie.',
        przepisanie: 'Trzeba napisać coś od nowa: nowe zdanie albo akapit, zmiana planu dnia lub godzin, quest zdradzający odpowiedź, brakujący element, powtórzenia w kilku miejscach.' } };
  });
  const state = JSON.stringify(errors.slice(0, 200).map((e, i) => ({ nr: i, przystanek: e.stop_key ?? 'trasa', pole: e.field ?? null,
    problem: String(e.problem).slice(0, 600), poprawka: e.fix ? String(e.fix).slice(0, 400) : null,
    old: e.old ?? null, new: e.new ?? null })));
  try {
    const a = await jev(state, questions, { role: 'rozdział błędów z kontroli' });
    return errors.map((_, i) => { const x = a[`e${i}`]; return x?.choice && (x.confidence ?? 0) >= min ? x.choice : null; });
  } catch (e) { log(`jev: ${e.message.slice(0, 200)} — rozdział błędów bez Jev`); return null; }
}
