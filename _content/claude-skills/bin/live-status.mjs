// Praca AI na żywo dla panelu admina (JP 2026-10-31, „efekt WOW”): stan bieżącego przebiegu w ops.status_snapshot, klucz 'live',
// czytany przez public.ops_status / admin.ops_status. Pisze gemini-draft.mjs (szkic, poprawki, kontrola źródeł) i verify-revision.mjs.
// Kształt: { status: 'running'|'idle', trip, version_target, stage, stage_label_pl, stop_n, stop_total, stop_key, field, field_label_pl,
//   text_tail (≤ 600 ostatnich znaków bieżącego pola, oczyszczone), flags_found, started_at, updated_at, worker: 'Antigravity'|'automat',
//   last: { trip, version, label, status, finished_at } — po zakończeniu (status 'idle'), żeby panel mógł pokazać „Gotowe: v6 — otwórz”. }
// Zapis najwyżej co 10 s (throttle; zmiana etapu/pola pisze od razu). Nigdy nie rzuca — przebieg nie może paść przez podgląd.
// Modele nie strumieniują tokenów, więc „na żywo” = pole po polu, przystanek po przystanku — to wystarczy.
import { scrub } from './ops-status.mjs';

export const STAGE_PL = { 1: 'Research', 2: 'Szkic', 3: 'Bloki przystanków', 4: 'Kontrola źródeł', 5: 'Kontrola całej trasy', 6: 'Zapis wersji', 7: 'Gotowe', 8: 'Poprawki z uwag', 9: 'Weryfikacja uwag' };
export const FIELD_PL = { desc_paragraphs: 'Opis', kids_box: 'Misja dla dzieci', kids_choice: 'Pytanie z wyborem', hint: 'Wskazówka', local_flavor: 'Lokalny smak',
  legend: 'Legenda', curiosity: 'Ciekawostka', fun_fact: 'Fun fact', pop_culture: 'Popkultura', name: 'Nazwa', title: 'Tytuł', subtitle: 'Podtytuł', summary: 'Podsumowanie' };
const TEXT_KEYS = ['desc_paragraphs', 'kids_box', 'legend', 'curiosity', 'fun_fact', 'pop_culture', 'hint', 'local_flavor', 'kids_choice', 'subtitle', 'summary'];

// ostatnie n znaków tekstu, bez JSON-owych śmieci i sekretów; ucięcie na granicy słowa
export function tailOf(text, n = 600) {
  let s = String(text ?? '').replace(/\\n/g, ' ').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
  s = scrub(s);
  if (s.length <= n) return s;
  s = s.slice(-n); const sp = s.indexOf(' ');
  return (sp > 0 && sp < 40 ? s.slice(sp + 1) : s);
}
// z odpowiedzi modelu (JSON): które pole właśnie powstało i jego tekst — ostatnie pole tekstowe w kolejności dokumentu
export function textFrom(j) {
  let field = null, text = '';
  const take = (k, v) => {
    const t = Array.isArray(v) ? v.filter(x => typeof x === 'string').join(' ') : typeof v === 'string' ? v : v && typeof v === 'object' && typeof v.text === 'string' ? v.text : v && typeof v === 'object' && typeof v.question === 'string' ? v.question : '';
    if (t.trim().length >= 20) { field = k; text = t; }
  };
  const walk = (x, depth) => {
    if (depth > 8 || !x || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(y => walk(y, depth + 1)); return; }
    for (const [k, v] of Object.entries(x)) { if (TEXT_KEYS.includes(k)) take(k, v); else walk(v, depth + 1); }
  };
  walk(j, 0);
  return field ? { field, field_label_pl: FIELD_PL[field] ?? field, text_tail: tailOf(text) } : null;
}

export function createLive({ q, trip, worker = 'Antigravity', every = 10_000, now = () => Date.now() } = {}) {
  const st = { status: 'running', trip, version_target: null, stage: null, stage_label_pl: null, stop_n: null, stop_total: null, stop_key: null,
    field: null, field_label_pl: null, text_tail: '', flags_found: 0, started_at: new Date(now()).toISOString(), updated_at: null, worker, message: null };
  let lastWrite = 0, timer = null, dirty = false, ended = false;
  const write = async () => {
    timer = null; dirty = false; lastWrite = now();
    st.updated_at = new Date(lastWrite).toISOString();
    if (!q) return;
    try { await q(`INSERT INTO ops.status_snapshot (klucz, dane, updated_at) VALUES ('live', $1::jsonb, now())
                   ON CONFLICT (klucz) DO UPDATE SET dane = EXCLUDED.dane, updated_at = now()`, [JSON.stringify(st)]); } catch { /* podgląd pomocniczy */ }
  };
  const schedule = (urgent) => {
    if (ended) return;
    dirty = true;
    const wait = urgent ? 0 : Math.max(0, every - (now() - lastWrite));
    if (!wait) { if (timer) { clearTimeout(timer); timer = null; } return write(); }
    if (!timer) timer = setTimeout(write, wait);
    if (timer.unref) timer.unref();
    return Promise.resolve();
  };
  return {
    state: st,
    set(patch = {}) {
      if (ended) return Promise.resolve();
      const urgent = ('stage' in patch && patch.stage !== st.stage) || ('stop_key' in patch && patch.stop_key !== st.stop_key) || ('field' in patch && patch.field !== st.field);
      for (const [k, v] of Object.entries(patch)) if (v !== undefined) st[k] = v;
      if (patch.stage != null && !patch.stage_label_pl) st.stage_label_pl = STAGE_PL[patch.stage] ?? st.stage_label_pl;
      return schedule(urgent);
    },
    text(j) { const t = textFrom(j); return t ? this.set(t) : Promise.resolve(); },
    flags(n) { return this.set({ flags_found: (+st.flags_found || 0) + (+n || 0) }); },
    end({ status = 'done', version = null, label = null, message = null } = {}) {
      if (ended) return Promise.resolve();
      ended = true; if (timer) { clearTimeout(timer); timer = null; }
      const fin = new Date(now()).toISOString();
      const idle = { status: 'idle', trip: null, updated_at: fin, worker, last: { trip, version, label, status, message: message ? tailOf(message, 200) : null, finished_at: fin, started_at: st.started_at } };
      if (!q) return Promise.resolve();
      return q(`INSERT INTO ops.status_snapshot (klucz, dane, updated_at) VALUES ('live', $1::jsonb, now())
                ON CONFLICT (klucz) DO UPDATE SET dane = EXCLUDED.dane, updated_at = now()`, [JSON.stringify(idle)]).catch(() => {});
    },
    pending() { return dirty; }
  };
}
