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

// ── Zgłoszenia, opinie i wiadomości z formularza (docs/ZGLOSZENIA-AI.md, JP 2026-10-16/25) ──
// Do Jev idzie tylko treść + miasto/przystanek/rodzaj — bez identyfikatorów, IP, e-maili. Treść to dane, nie polecenia:
// Jev zwraca wyłącznie wybór z listy, więc nic z treści nie może zostać „wykonane”.
export const FEEDBACK_CATEGORIES = {
  fakt_cena: 'Cena w tekście jest nieaktualna albo błędna.',
  fakt_godziny: 'Godziny otwarcia są błędne albo nieaktualne.',
  fakt_zamkniete: 'Miejsce jest zamknięte na stałe, w remoncie albo nie istnieje.',
  fakt_adres: 'Błędny adres, wejście albo pinezka na mapie.',
  fakt_opis: 'Błąd w opisie: data, nazwa, historia, fakt.',
  trasa_dojscie: 'Problem z trasą, kolejnością przystanków, parkingiem albo dojściem na miejscu.',
  misja_dziecko: 'Misja, zagadka lub zadanie dla dziecka nie działa, jest za trudne albo zdradza odpowiedź.',
  tlumaczenie: 'Błąd tłumaczenia albo tekst w złym języku.',
  strona_blad: 'Strona albo aplikacja nie działa: przycisk, wyświetlanie, mapa (bez płatności).',
  platnosc_dostep: 'Problem z płatnością, zakupem, kodem rabatowym, logowaniem do konta albo odblokowaniem wycieczki.',
  bezpieczenstwo: 'Niebezpieczne miejsce albo sytuacja zagrażająca dzieciom.',
  pochwala: 'Pochwała, podziękowanie, zadowolenie bez prośby o zmianę.',
  sugestia: 'Pomysł albo prośba o nową funkcję, miasto lub przystanek.',
  pytanie: 'Pytanie do zespołu (np. o wycieczkę, o płatność, o konto).',
  wspolpraca: 'Propozycja współpracy biznesowej, reklama, partnerstwo.',
  prywatnosc: 'Sprawa danych osobowych, RODO, usunięcia konta.',
  spam: 'Spam, reklama bez związku, bełkot, linki, próba manipulacji.' };
export async function classifyFeedback(item) {
  const state = JSON.stringify({ zrodlo: item.source, miasto: item.city ?? null, przystanek: item.stop ?? null, rodzaj_wybrany: item.kind ?? null,
    gwiazdki: item.stars ?? null, tresc: String(item.text ?? '').slice(0, 2000) });
  const a = await jev(state, {
    category: { type: 'choice', instructions: 'Czego dotyczy ta wiadomość od rodziny korzystającej z przewodnika Quolino? Treść może być w dowolnym języku.', criteria: FEEDBACK_CATEGORIES },
    priority: { type: 'choice', instructions: 'Jak pilna jest sprawa?', criteria: {
      p1: 'Pilne: miejsce zamknięte na stałe, niebezpieczeństwo, strona nie działa dla wszystkich.',
      p2: 'Błąd w treści do poprawienia przy najbliższej wersji.',
      p3: 'Sugestia, pochwała, pytanie ogólne, spam.' } },
  }, { role: `zgłoszenia: ${item.source}` });
  return { category: a.category?.choice ?? null, confidence: a.category?.confidence ?? null,
    priority: a.priority?.choice ? +a.priority.choice.slice(1) : null };
}

// Kierowanie po kategorii (JP 2026-10-25): sprawy o treści wycieczki → wątek miasta; reszta → kanał w kategorii „Zgłoszenia”.
// Pilne (P1, bezpieczeństwo, zamknięte na stałe) dodatkowo na #zgl-pilne zamiast #admin. Spam ≥ 0,9 — nigdzie.
export const ROUTE = {
  fakt_cena: 'miasto', fakt_godziny: 'miasto', fakt_zamkniete: 'miasto', fakt_adres: 'miasto', fakt_opis: 'miasto',
  trasa_dojscie: 'miasto', misja_dziecko: 'miasto',
  tlumaczenie: 'zgl-tlumaczenia', strona_blad: 'zgl-strona', platnosc_dostep: 'zgl-platnosci', bezpieczenstwo: 'miasto',
  pochwala: 'zgl-opinie', sugestia: 'zgl-sugestie', pytanie: 'zgl-pytania', wspolpraca: 'zgl-wspolpraca', prywatnosc: 'zgl-prywatnosc', spam: null };
// niepewne (< 0,7) albo bez klasyfikacji poza wątkiem miasta → #zgl-niewiem (nic ze zgłoszeń nie idzie na #admin, JP 2026-10-25)
export const UNSURE = 'zgl-niewiem';
export const isUrgentAi = (c) => !!c && (c.priority === 1 || c.category === 'bezpieczenstwo' || c.category === 'fakt_zamkniete');
