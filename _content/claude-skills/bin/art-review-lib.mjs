// Akceptacja grafik w panelu admina — czyste funkcje (bez bazy, sieci i Discorda), żeby art-review.test.mjs działał bez „pg”.
// Reszta (repo, baza, poll) w art-review.mjs. Opis całości: na początku art-review.mjs i docs/IKONY-MIEJSC.md §9.
export const PANEL_URL = 'https://admin.quolino.com/_admin/#/grafiki';
export const KINDS = { place_icon: 'ikona miejsca', quo_pose: 'poza Quo', game_art: 'grafika gry' };
export const REVIEW_DIR = { place_icon: 'media/icons/_review', quo_pose: 'media/icons/_review', game_art: 'gra/art/_review' };
export const MAX_TRIES = 3;   // tyle razy poll próbuje wykonać decyzję, zanim oznaczy ją jako nieudaną

export const safeKey = (k) => /^[a-z0-9][a-z0-9/_.-]{0,160}$/.test(String(k ?? ''));
// ścieżka podglądu w repo: media/icons/_review/spello-porta-venere-v2.webp
export function previewPath(kind, key, v, ext = 'webp') {
  if (!REVIEW_DIR[kind]) throw new Error(`nieznany rodzaj grafiki: ${kind}`);
  if (!safeKey(key)) throw new Error(`zły klucz grafiki: ${key}`);
  return `${REVIEW_DIR[kind]}/${String(key).replace(/\//g, '-')}-v${+v || 1}.${ext}`;
}
// decyzja JP z wiersza → co ma zrobić skrypt: { act: 'ok' | 'fix' | 'reject' | null, notes }
export function actionFor(row) {
  if (!row || row.handled_at) return { act: null, notes: null };
  const notes = row.note ? String(row.note).trim().slice(0, 800) : null;
  if (row.status === 'accepted') return { act: 'ok', notes: null };
  if (row.status === 'fix') return notes && notes.length >= 3 ? { act: 'fix', notes } : { act: null, notes: null, why: 'poprawka bez uwag' };
  if (row.status === 'rejected') return { act: 'reject', notes };
  return { act: null, notes: null };
}
// miniatura zdjęcia referencyjnego do panelu: plik Commons → Special:FilePath (stałe przekierowanie, bez publikowania cudzych zdjęć u nas);
// link JP → ten sam adres (panel pokaże obraz, a gdy to strona — sam link)
export function commonsThumb(ref, width = 640) {
  if (!ref) return null;
  if (ref.link || /^https?:\/\//i.test(String(ref.title ?? '')) ) return String(ref.url ?? ref.page ?? ref.title);
  const t = String(ref.title ?? '').replace(/^File:/i, '').replace(/ /g, '_');
  return t ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(t)}?width=${width}` : null;
}
export function inputsFromRefs(refs) {
  return (refs ?? []).map((r, i) => ({ url: commonsThumb(r), label: r.link ? `zdjęcie ${i + 1}: link JP (${r.host ?? ''})`.trim() : `zdjęcie ${i + 1}: ${String(r.author ?? '').slice(0, 60)}${r.license ? `, ${r.license}` : ''}`, page: r.page ?? r.url ?? null }))
    .filter(x => x.url);
}
export const inputsFromRepo = (paths, labels = []) => (paths ?? []).map((p, i) => ({ url: p, label: labels[i] ?? p.split('/').pop() }));
export const notifyLine = (title, { v = null, warn = null } = {}) =>
  `🖼️ Nowa grafika do akceptacji: **${String(title).slice(0, 150)}**${v ? ` · wersja ${v}` : ''} → ${PANEL_URL}${warn ? `\n⚠️ ${warn}` : ''}`;


// Wykonanie decyzji JP: każdy wiersz → handlers.ok(row) / handlers.fix(row, notes) / handlers.reject(row, notes) → krótki opis wyniku
// → io.markHandled(id, result, { done, tries }). Błąd: licznik prób w meta.handle_tries, po MAX_TRIES wiersz oznaczony jako wykonany
// z błędem (i io.say(), gdy jest). Zwraca liczbę wykonanych decyzji. Czysta logika — baza wstrzyknięta przez io (testy).
export async function runDecisions(rows, handlers, io) {
  const { markHandled, say = null, log = () => {} } = io;
  let n = 0;
  for (const row of rows ?? []) {
    const { act, notes, why } = actionFor(row);
    if (!act) { await markHandled(row.id, why ?? 'bez działania'); continue; }
    const tries = (+(row.meta?.handle_tries) || 0) + 1;
    try {
      const result = await handlers[act](row, notes);
      await markHandled(row.id, result ?? act);
      n++;
    } catch (e) {
      const msg = String(e?.message ?? e).slice(0, 300);
      log(`panel: decyzja #${row.id} (${act} ${row.key}) nie wykonana (próba ${tries}/${MAX_TRIES}): ${msg}`);
      await markHandled(row.id, `błąd: ${msg}`, { done: tries >= MAX_TRIES, tries });
      if (tries >= MAX_TRIES && say) await say(`⚠️ Decyzja z panelu dla „${row.title}” (${act}) nie wykonała się po ${MAX_TRIES} próbach: ${msg}`);
    }
  }
  return n;
}

// zaległe do przeniesienia do panelu: wygenerowane (v), czekające na ocenę JP ('review'), jeszcze bez wiersza w panelu (review_id)
// entries: [[klucz, stan], …] (Object.entries ze stanu skryptu) → [[klucz, stan], …]
export const backlog = (entries) => (entries ?? []).filter(([, s]) => s && s.status === 'review' && (+s.v || 0) >= 1 && !s.review_id);
// jedno zdanie na Discord po przeniesieniu (zamiast N powiadomień)
export const migratedLine = (what, n) => `🖼️ ${n} ${what} czekających tu na „ok” przeniosłem do panelu admina — oceń je tam: ${PANEL_URL} (odpowiedź „ok” tutaj też nadal działa).`;
