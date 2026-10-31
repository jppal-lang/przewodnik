#!/usr/bin/env node
// Meldunek „Dziś” dla panelu admina (JP 2026-10-31, „efekt WOW”): kilka ludzkich zdań o tym, co się zrobiło, co czeka na JP,
// co jest w toku i na co uważać — każde zdanie z linkiem do miejsca w panelu i oparte WYŁĄCZNIE na danych wejściowych.
//   node today-brief.mjs            — zapis do ops.status_snapshot (klucz 'brief'), gdy dane się zmieniły albo minęło ≥ 6 h
//   node today-brief.mjs --force    — zapis zawsze
//   node today-brief.mjs --print    — tylko wypisz (bez zapisu; z --no-ai bez wywołania modelu)
//   node today-brief.mjs --no-ai    — wersja szablonowa (tryb 'auto'), bez Antigravity
// Wołany z gemini-queue.mjs (każdy przebieg crona, po ops-status), z draft-comments.mjs (po zakończeniu prośby o poprawkę)
// i z repo-jobs.mjs (po zleceniu). Wejście: migawki ops.status_snapshot (versions, revisions+verify, queue, jobs, deploy, watch)
// + decyzje czekające (ops.deploy_requests / cost_requests pending, zdjęcia do ikon z terminem — pliki media/icons/place-candidates).
// Koszt: wyłącznie Antigravity (abonament, 0 $) i tylko gdy fakty się zmieniły (hash) — nie częściej niż co 30 min, nigdy przy wyczerpanym
// limicie ani powyżej 80 % tygodniowego progu (agy-alert.json): wtedy tryb 'auto' = te same zdania z szablonów. Nigdy płatne modele.
// Wyjście: { generated_at, mode: 'ai'|'auto', greeting, items: [{ id, text, href, kind, when, group }], summary, meta: { hash, ai_at } }.
// Walidacja odpowiedzi modelu: każde zdanie musi wskazywać istniejący fakt (id) i nie może zawierać liczb spoza faktu — inaczej odpada,
// a fakt dostaje zdanie szablonowe. Funkcje czyste są eksportowane i mają testy (today-brief.test.mjs).
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { scrubDeep } from './ops-status.mjs';

const BASE = process.env.QUOLINO_BASE ?? '/opt/data/quolino';
const WORK = join(BASE, 'work');
const REPO = process.env.QUOLINO_REPO ?? '/opt/data/repo/przewodnik';
const AGY = '/opt/data/home/.local/bin/agy';
export const MAX_ITEMS = 14;
export const MIN_AI_GAP_MS = 30 * 60_000;      // nie częściej niż co 30 min — Antigravity to wspólny limit z pisaniem tras
export const REFRESH_MS = 6 * 3600_000;         // bez zmian danych: odświeżenie najpóźniej co 6 h

// ── pomocnicze ─────────────────────────────────────────────────────────────────
const t_ = (iso) => { const t = Date.parse(iso ?? ''); return isNaN(t) ? 0 : t; };
const recent = (iso, hours, now) => t_(iso) > 0 && now - t_(iso) < hours * 3600_000;
export const titleCase = (slug) => String(slug ?? '').split('-').map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join(' ');
export function plForm(n, one, few, many) { n = Math.abs(+n || 0); if (n === 1) return `${n} ${one}`; const r = n % 10, d = n % 100; return `${n} ${r >= 2 && r <= 4 && (d < 12 || d > 14) ? few : many}`; }
const KIND_PL = { translate: 'tłumaczenie', draft: 'nowa trasa', revise: 'poprawki', recheck: 'kontrola źródeł', choices: 'pytania z wyborem', icons: 'ikony' };
const WKIND = { prices: 'ceny', hours: 'godziny', link: 'linki', links: 'linki', season: 'sezon', venues: 'lokale', site: 'strona', track: 'zamknięcia', costs: 'koszty', photos: 'zdjęcia' };
const PRACTICAL = { parking: 1, restaurant: 1, gelato: 1, sweets: 1, food: 1 };
const short = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const clean = (s) => String(s ?? '').replace(/^\[v\d+[a-z]?\]\s*/, '').replace(/^[a-z0-9-]+: /, '').replace(/[①②③④⑤]c?\s*/g, '').replace(/\s—\s/g, ', ').trim();
const ORDER = { todo: 0, warn: 1, wait: 2, done: 3, info: 4 };

// ── fakty: to, co wolno powiedzieć (każdy ma id, zdanie szablonowe, link i rodzaj) ────────────
// snap: { versions, queue, jobs, deploy, watch } z ops.status_snapshot; extra: { names, deploys, costs, icons, now }
export function factsFrom(snap = {}, extra = {}) {
  const now = extra.now ?? Date.now();
  const names = extra.names ?? {};
  const nm = (slug) => names[slug] ?? titleCase(slug);
  const F = [];
  const add = (id, kind, text, href, when, more = {}) => { if (!F.some(f => f.id === id)) F.push({ id, kind, text, href, when: when ?? null, ...more }); };
  const V = snap.versions ?? {}, Q = snap.queue ?? {}, J = snap.jobs ?? {}, D = snap.deploy ?? {}, W = snap.watch ?? {};

  // wersje tras: szkice czekające, publikacje z ostatniej doby
  for (const v of Array.isArray(V.rows) ? V.rows : []) {
    const href = `#/${v.city_slug}/v${v.version}`;
    if (v.status === 'draft') {
      const ctrl = v.verdict === 'ok' ? 'kontrola bez uwag' : v.errors != null ? `kontrola: ${plForm(v.errors, 'uwaga', 'uwagi', 'uwag')}` : 'bez wyniku kontroli';
      add(`draft:${v.city_slug}:${v.version}`, 'todo', `Szkic ${nm(v.city_slug)} v${v.version} czeka na Twoje przejrzenie (${ctrl}).`, href, v.created_at, { trip: v.city_slug });
    } else if (v.status === 'published' && recent(v.published_at, 48, now)) {
      add(`pub:${v.city_slug}:${v.version}`, 'done', `${nm(v.city_slug)} v${v.version} jest opublikowana na stronie.`, href, v.published_at, { trip: v.city_slug });
    } else if (v.status === 'rejected' && recent(v.created_at, 48, now)) {
      add(`rej:${v.city_slug}:${v.version}`, 'info', `Szkic ${nm(v.city_slug)} v${v.version} został odrzucony.`, href, v.created_at, { trip: v.city_slug });
    }
  }
  // prośby o poprawkę (uwagi JP → Hermes) z weryfikacją naniesienia
  for (const r of Array.isArray(V.revisions?.requests) ? V.revisions.requests : []) {
    const id = `rev:${r.id}`, n = plForm(r.comments ?? 0, 'uwaga', 'uwagi', 'uwag'), city = nm(r.city_slug);
    if (r.status === 'new') add(id, 'wait', `${n} do ${city} v${r.city_version} czeka w kolejce Hermesa.`, `#/${r.city_slug}`, r.updated_at ?? r.created_at, { trip: r.city_slug });
    else if (r.status === 'working') add(id, 'wait', `Hermes nanosi ${n} do ${city} v${r.city_version}.`, `#/${r.city_slug}`, r.updated_at ?? r.created_at, { trip: r.city_slug });
    else if (r.status === 'failed' && recent(r.updated_at, 72, now)) add(id, 'warn', `Poprawka ${city} (prośba #${r.id}) nie udała się${r.reply ? ': ' + short(r.reply, 120) : '.'}`, `#/${r.city_slug}`, r.updated_at, { trip: r.city_slug });
    else if (r.status === 'done' && recent(r.updated_at, 72, now)) {
      const vf = r.verify, href = r.result_version ? `#/${r.city_slug}/v${r.result_version}` : `#/${r.city_slug}`;
      if (vf?.ready === true) add(id, 'todo', `${city} v${r.result_version} po poprawkach jest gotowa do akceptacji (${vf.applied ?? '?'} z ${vf.total ?? '?'} uwag naniesionych).`, href, vf.checked_at ?? r.updated_at, { trip: r.city_slug });
      else if (vf && vf.total != null) add(id, vf.pending_ai ? 'wait' : 'warn', `${city} v${r.result_version}: naniesiono ${vf.applied ?? 0} z ${vf.total} uwag${vf.pending_ai ? ', pełne sprawdzenie po odnowieniu limitu AI' : ''}${vf.new_errors ? `, ${plForm(vf.new_errors, 'nowy błąd', 'nowe błędy', 'nowych błędów')} w kontroli` : ''}.`, href, vf.checked_at ?? r.updated_at, { trip: r.city_slug });
      else add(id, 'done', `${n} do ${city} naniesione w v${r.result_version ?? '?'}.`, href, r.updated_at, { trip: r.city_slug });
    }
  }
  // kolejka ops.jobs
  for (const j of Array.isArray(Q.open) ? Q.open : []) {
    const what = KIND_PL[j.kind] ?? j.kind;
    add(`job:${j.id}`, 'wait', j.status === 'running' ? `${nm(j.city_slug)}: ${what} w pracy (zlecenie #${j.id})${j.result ? ', ' + short(j.result, 80) : ''}.` : `${nm(j.city_slug)}: ${what} czeka w kolejce (zlecenie #${j.id}).`, '#/pipeline', j.created_at, { trip: j.city_slug });
  }
  for (const j of Array.isArray(Q.failed_7d) ? Q.failed_7d : []) {
    if (!recent(j.finished_at, 72, now)) continue;
    add(`jobfail:${j.id}`, 'warn', `${nm(j.city_slug)}: ${KIND_PL[j.kind] ?? j.kind} (zlecenie #${j.id}) nie powiodło się${j.result ? ': ' + short(j.result, 100) : '.'}`, '#/pipeline', j.finished_at, { trip: j.city_slug });
  }
  for (const j of Array.isArray(Q.recent) ? Q.recent : []) {
    if (j.status !== 'done' || !recent(j.finished_at, 24, now)) continue;
    add(`jobdone:${j.id}`, 'done', `${nm(j.city_slug)}: ${KIND_PL[j.kind] ?? j.kind} zakończone${j.result ? ' (' + short(j.result, 80) + ')' : ''}.`, j.kind === 'draft' && /^v\d+/.test(j.result ?? '') ? `#/${j.city_slug}/${j.result.match(/^v\d+/)[0]}` : '#/pipeline', j.finished_at, { trip: j.city_slug });
  }
  // przebiegi pipeline'u (ostatni wpis każdego przebiegu z 2 dni)
  for (const p of Array.isArray(Q.pipeline) ? Q.pipeline : []) {
    if (p.status === 'running' && recent(p.created_at, 3, now)) add(`run:${p.run_id}`, 'wait', `Hermes ${p.kind === 'revise' ? 'poprawia' : 'pisze'} ${nm(p.city_slug)}${p.stop_k && p.stops_n ? `, przystanek ${p.stop_k} z ${p.stops_n}` : ''}${p.message ? ': ' + short(clean(p.message), 90) : '.'}`, '#/pipeline', p.created_at, { trip: p.city_slug });
    else if ((p.status === 'error' || p.status === 'stopped') && recent(p.created_at, 48, now)) add(`run:${p.run_id}`, 'warn', `Przebieg ${nm(p.city_slug)} ${p.status === 'error' ? 'zakończył się błędem' : 'został przerwany'}${p.message ? ': ' + short(clean(p.message), 100) : '.'}`, '#/pipeline', p.created_at, { trip: p.city_slug });
    else if (p.status === 'running' && recent(p.created_at, 24, now)) add(`run:${p.run_id}`, 'warn', `Przebieg ${nm(p.city_slug)} nie dał znaku życia od dłuższego czasu (ostatni krok: ${short(clean(p.message), 80)}).`, '#/pipeline', p.created_at, { trip: p.city_slug });
  }
  // zlecenia z repo (repo-jobs.mjs)
  for (const j of Array.isArray(J.registry) ? J.registry : []) {
    const id = `repo:${j.name}`, why = j.why ? ` (${short(j.why, 70)})` : '';
    if (j.status === 'running') add(id, 'wait', `Zlecenie ${j.name} jest w pracy${why}.`, '#/pipeline', j.started_at);
    else if (j.status === 'later') add(id, 'wait', `Zlecenie ${j.name} odłożone, ruszy samo${/limit|quota|Resets in/i.test(j.result ?? '') ? ' po odnowieniu limitu Antigravity' : ''}.`, '#/pipeline', j.finished_at ?? j.started_at);
    else if (j.status === 'failed' && recent(j.finished_at, 72, now)) add(id, 'warn', `Zlecenie ${j.name} nie powiodło się${j.result ? ': ' + short(j.result, 100) : '.'}`, '#/pipeline', j.finished_at);
    else if (j.status === 'done' && recent(j.finished_at, 24, now)) add(id, 'done', `Zlecenie ${j.name} wykonane${j.result ? ': ' + short(j.result, 90) : '.'}`, '#/pipeline', j.finished_at);
  }
  // wdrożenia
  for (const d of Array.isArray(extra.deploys) ? extra.deploys : []) {
    const files = (d.files ?? []).map(f => String(f).split('/').pop());
    add(`deploy:${d.id}`, 'todo', `Wdrożenie czeka na Twoją zgodę${files.length ? ': ' + files.slice(0, 3).join(', ') + (files.length > 3 ? ` i ${files.length - 3} innych` : '') : ''}.`, '#/decyzje', d.created_at);
  }
  if (!extra.deploys && D.waiting_for_jp) add('deploy:wait', 'todo', 'Wdrożenie czeka na Twoją zgodę.', '#/decyzje', D.last_message_at);
  if (D.last_message && !D.waiting_for_jp && recent(D.last_message_at, 24, now)) {
    const line = String(D.last_message).split('\n').filter(l => l && !/^\d{4}-\d\d-\d\d \d/.test(l))[0] ?? '';
    if (/✅|wdrożone/i.test(line)) add('deploy:last', 'done', `Wdrożono: ${short(line.replace(/^[✅❌⏳]\s*/, '').replace(/^zatwierdzone i wdrożone:\s*/i, ''), 110)}.`, '#/decyzje', D.last_message_at);
    else if (/❌|błąd|failed/i.test(line)) add('deploy:last', 'warn', `Ostatnie wdrożenie z błędem: ${short(line.replace(/^[✅❌⏳]\s*/, ''), 110)}.`, '#/decyzje', D.last_message_at);
  }
  // zgody na koszt
  for (const c of Array.isArray(extra.costs) ? extra.costs : []) {
    add(`cost:${c.id}`, 'todo', `Zgoda na koszt: ${short(c.title, 80)}${c.est_usd != null ? ` (szacunek ${(+c.est_usd).toFixed(2)} $)` : c.est_limit ? ` (${short(c.est_limit, 50)})` : ''}.`, '#/decyzje', c.created_at);
  }
  // strażnicy
  const wk = Array.isArray(W.open_by_kind) ? W.open_by_kind : [];
  const open = wk.reduce((n, k) => n + (+k.open || 0) + (+k.recheck || 0), 0);
  if (open) add('watch:open', 'todo', `${plForm(open, 'ustalenie strażników czeka', 'ustalenia strażników czekają', 'ustaleń strażników czeka')} na decyzję (${wk.filter(k => (+k.open || 0) + (+k.recheck || 0)).map(k => `${WKIND[k.kind] ?? k.kind} ${(+k.open || 0) + (+k.recheck || 0)}`).join(', ')}).`, '#/straznicy', newestWatch(W));
  const toApply = wk.reduce((n, k) => n + (+k.to_apply || 0), 0), applyFailed = wk.reduce((n, k) => n + (+k.apply_failed || 0), 0);
  if (toApply) add('watch:apply', 'wait', `${plForm(toApply, 'przyjęte ustalenie czeka', 'przyjęte ustalenia czekają', 'przyjętych ustaleń czeka')} na naniesienie do szkicu.`, '#/straznicy', null);
  if (applyFailed) add('watch:applyfail', 'warn', `${plForm(applyFailed, 'ustalenia strażników nie udało', 'ustaleń strażników nie udało', 'ustaleń strażników nie udało')} się nanieść.`, '#/straznicy', null);
  // zdjęcia do ikon
  for (const ic of Array.isArray(extra.icons) ? extra.icons : []) {
    const late = ic.deadline && t_(ic.deadline) < now;
    add(`icon:${ic.trip}`, late ? 'warn' : 'todo', `${nm(ic.trip)}: ${plForm(ic.stops, 'przystanek czeka', 'przystanki czekają', 'przystanków czeka')} na wybór zdjęcia do ikony${ic.deadline ? (late ? ', termin minął, automat wybierze sam' : `, automat ruszy ${dayHour(ic.deadline)}`) : ''}.`, '#/ikony', ic.generated_at ?? null, { trip: ic.trip });
  }
  // limit Antigravity
  if (Q.agyQuotaOut && t_(Q.agyQuotaOut) > now) add('agy:out', 'warn', `Limit Antigravity wyczerpany, wraca ${dayHour(Q.agyQuotaOut)}; nowe trasy i poprawki czekają.`, '#/pipeline', null);
  else if (Q.agyAlert?.lvl >= 80) add('agy:high', 'info', `Antigravity: ${Q.agyWeekCalls ?? '?'} wywołań w 7 dni, blisko tygodniowego progu.`, '#/pipeline', null);
  F.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || t_(b.when) - t_(a.when));
  return F.slice(0, 40);
}
function newestWatch(W) { let n = null; for (const r of Array.isArray(W.newest) ? W.newest : []) if (r.updated_at && (!n || r.updated_at > n)) n = r.updated_at; return n; }
export function dayHour(iso) {
  const t = t_(iso); if (!t) return '';
  const d = new Date(t), f = (o) => new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', ...o }).format(d);
  const today = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', day: 'numeric', month: 'numeric' }).format(new Date());
  const day = f({ day: 'numeric', month: 'numeric' });
  return (day === today ? 'dziś' : day) + ' o ' + f({ hour: '2-digit', minute: '2-digit' });
}

// ── stan (linia pod meldunkiem) i hash ──────────────────────────────────────────
export function statusLine(snap = {}, now = Date.now()) {
  const Q = snap.queue ?? {}, parts = [];
  if (Q.agyQuotaOut && t_(Q.agyQuotaOut) > now) parts.push(`Antigravity wraca ${dayHour(Q.agyQuotaOut)}`);
  else parts.push(`Antigravity dostępny${Q.agyWeekCalls != null ? ` (${Q.agyWeekCalls} wywołań w 7 dni)` : ''}`);
  const u = Array.isArray(Q.usage_24h) ? Q.usage_24h : [];
  const usd = u.reduce((s, r) => s + (+r.usd || 0), 0), eq = u.reduce((s, r) => s + (+r.usd_equiv || 0), 0);
  parts.push(`koszty 24 h: ${usd.toFixed(2)} $ zapłacone, ${eq.toFixed(2)} $ ekwiwalentu`);
  return 'stan: ' + parts.join(' · ') + '.';
}
export function hashFacts(facts) {
  return createHash('sha1').update(JSON.stringify(facts.map(f => [f.id, f.kind, f.text]))).digest('hex').slice(0, 16);
}
export function greetingFor(hour) { return hour < 5 ? 'Dobrej nocy, Janie' : hour < 12 ? 'Dzień dobry, Janie' : hour < 18 ? 'Dzień dobry, Janie' : 'Dobry wieczór, Janie'; }

// ── tryb 'auto': zdania z szablonów ─────────────────────────────────────────────
export function autoBrief(facts, snap = {}, now = Date.now()) {
  const hour = +new Intl.DateTimeFormat('pl-PL', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Warsaw' }).format(new Date(now));
  const items = facts.slice(0, MAX_ITEMS).map(f => ({ id: f.id, text: f.text, href: f.href, kind: f.kind, when: f.when, trip: f.trip ?? null }));
  const n = (k) => facts.filter(f => f.kind === k).length;
  const summary = facts.length ? [n('todo') ? plForm(n('todo'), 'rzecz czeka', 'rzeczy czekają', 'rzeczy czeka') + ' na Ciebie' : 'nic nie czeka na Twoją decyzję',
    n('warn') ? plForm(n('warn'), 'sprawa wymaga', 'sprawy wymagają', 'spraw wymaga') + ' uwagi' : '', n('wait') ? plForm(n('wait'), 'zadanie w toku', 'zadania w toku', 'zadań w toku') : ''].filter(Boolean).join(', ') + '.'
    : 'Spokojnie: nic nie czeka, nic się nie dzieje w tle.';
  return { generated_at: new Date(now).toISOString(), mode: 'auto', greeting: greetingFor(hour), items, summary: summary[0].toUpperCase() + summary.slice(1), status: statusLine(snap, now) };
}

// ── odpowiedź modelu: tylko zdania pokryte faktami ─────────────────────────────
export function validateAi(ai, facts) {
  const by = new Map(facts.map(f => [f.id, f]));
  const out = [], seen = new Set();
  for (const it of Array.isArray(ai?.items) ? ai.items : []) {
    const f = by.get(String(it?.id ?? '')); if (!f || seen.has(f.id)) continue;
    let text = String(it.text ?? '').replace(/\s+/g, ' ').replace(/!/g, '.').trim();
    if (text.length < 12 || text.length > 220) continue;
    if (/https?:\/\/|<[a-z]/i.test(text)) continue;
    const nums = text.match(/\d+(?:[.,]\d+)?/g) ?? [];
    if (!nums.every(x => f.text.includes(x))) continue;         // liczba spoza faktu = zmyślenie
    if (!/[.?]$/.test(text)) text += '.';
    seen.add(f.id);
    out.push({ id: f.id, text, href: f.href, kind: f.kind, when: f.when, trip: f.trip ?? null });
  }
  let summary = String(ai?.summary ?? '').replace(/\s+/g, ' ').replace(/!/g, '.').trim();
  if (summary.length > 300 || /https?:\/\//.test(summary)) summary = '';
  const sNums = summary.match(/\d+(?:[.,]\d+)?/g) ?? [];
  if (!sNums.every(x => facts.some(f => f.text.includes(x)))) summary = '';
  return { items: out, summary };
}
export function mergeAi(valid, facts, snap, now = Date.now()) {
  const base = autoBrief(facts, snap, now);
  if (!valid.items.length) return base;
  const got = new Set(valid.items.map(i => i.id));
  const rest = base.items.filter(i => !got.has(i.id));
  const items = valid.items.concat(rest).sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || t_(b.when) - t_(a.when)).slice(0, MAX_ITEMS);
  return { ...base, mode: 'ai', items, summary: valid.summary || base.summary };
}
export function aiPrompt(facts) {
  return `Jesteś asystentem redakcji Quolino. Napisz krótki meldunek dla Jana (JP) o stanie prac — po polsku, rzeczowo, bez wykrzykników,
krótkimi zdaniami, jak człowiek do człowieka. Nie dodawaj ŻADNYCH faktów spoza listy; nie zmieniaj liczb, nazw ani numerów wersji.
Każde zdanie przepisz z jednego faktu (zachowaj jego id). Możesz pominąć mniej ważne fakty, ale zostaw wszystkie rodzaju todo i warn.
Odpowiedz WYŁĄCZNIE JSON-em: {"items": [{"id": "…", "text": "jedno zdanie"}], "summary": "1–2 zdania podsumowania"}.
W tekstach używaj cudzysłowów „…”, nigdy prostego ".

FAKTY (id · rodzaj · zdanie szablonowe):
${facts.map(f => `${f.id} · ${f.kind} · ${f.text}`).join('\n')}`;
}

// ── Antigravity bez narzędzi (jak verify-revision.mjs) ─────────────────────────
function agyAsk(prompt, aiUsage) {
  return new Promise((resolve, reject) => {
    mkdirSync('/tmp/gq', { recursive: true });
    const env = { ...process.env, HOME: '/opt/data/home' }; delete env.GOOGLE_API_KEY; delete env.GEMINI_API_KEY;
    const p = spawn(AGY, ['-p', prompt + '\n\nNie używaj wyszukiwarki ani narzędzi. ODPOWIEDZ WYŁĄCZNIE POPRAWNYM JSON-em.', '--output-format', 'json', '--print-timeout', '300s', '--sandbox', '--mode', 'plan'],
      { cwd: '/tmp/gq', env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '', done = false;
    const finish = (code) => {
      if (done) return;
      let j = null; try { j = JSON.parse(out.slice(out.indexOf('{'))); } catch { /* niepełne */ }
      if (!j && code === 'stream') return;
      done = true; clearTimeout(t); try { p.kill('SIGKILL'); } catch { /* już zamknięty */ }
      if (j?.status === 'SUCCESS' && j.response) {
        aiUsage?.({ provider: 'gemini', model: 'Antigravity (AI Pro)', role: 'meldunek Dziś', billing: 'abonament',
          tin: j.usage?.input_tokens ?? j.usage?.prompt_tokens ?? j.usage?.total_tokens ?? 0, tout: j.usage?.output_tokens ?? j.usage?.completion_tokens ?? 0 });
        return resolve(String(j.response));
      }
      reject(new Error(`Antigravity ${j?.status ?? 'kod ' + code} ${String(j?.error ?? err ?? out).slice(0, 300)}`));
    };
    const t = setTimeout(() => finish('timeout'), 5 * 60_000);
    p.stdout.on('data', d => { out += d; if (/\}\s*$/.test(out)) finish('stream'); });
    p.stderr.on('data', d => { err += d; });
    p.on('close', code => finish(code));
    p.on('error', e => { if (!done) { done = true; clearTimeout(t); reject(e); } });
  });
}

// ── dane dodatkowe: decyzje czekające ──────────────────────────────────────────
async function extraFrom(q) {
  const safe = async (sql, p) => { try { return await q(sql, p); } catch { return null; } };
  const names = {};
  for (const r of (await safe(`SELECT city_slug, title FROM public.city_translations WHERE lang = 'pl'`)) ?? []) names[r.city_slug] = r.title;
  const deploys = await safe(`SELECT id, files, created_at FROM ops.deploy_requests WHERE status = 'pending' ORDER BY id DESC LIMIT 5`);
  const costs = await safe(`SELECT id, title, est_usd, est_limit, created_at FROM ops.cost_requests WHERE status = 'pending' ORDER BY id DESC LIMIT 5`);
  const refs = await safe(`SELECT trip, stop_key FROM ops.icon_refs`);
  return { names, deploys: deploys ?? undefined, costs: costs ?? [], icons: iconsWaiting(refs ? new Set(refs.map(r => `${r.trip}|${r.stop_key}`)) : null) };
}
export function iconsWaiting(done, dir = join(REPO, 'media/icons/place-candidates')) {
  if (!done || !existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
    let c; try { c = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { continue; }
    const slug = f.replace(/\.json$/, ''), stops = Object.entries(c?.stops ?? {}).filter(([k, st]) => !PRACTICAL[st?.category] && !done.has(`${slug}|${k}`) && Array.isArray(st?.candidates) && st.candidates.length);
    if (!stops.length) continue;
    const t0 = t_(c.generated_at);
    out.push({ trip: slug, stops: stops.length, generated_at: c.generated_at ?? null, deadline: t0 ? new Date(t0 + (+c.wait_hours || 48) * 3600_000).toISOString() : null });
  }
  return out;
}

// ── zapis: czyta migawki, liczy fakty, pisze 'brief' (nigdy nie rzuca) ──────────
export async function writeBrief({ force = false, noAi = false, log = () => {}, print = false } = {}) {
  let c;
  try {
    const lib = await import('./lib.mjs');
    c = await lib.db();
    const q = async (sql, p) => (await c.query(sql, p)).rows;
    const rows = await q(`SELECT klucz, dane FROM ops.status_snapshot`);
    const snap = Object.fromEntries(rows.map(r => [r.klucz, r.dane]));
    const prev = snap.brief ?? null;
    const now = Date.now();
    const facts = factsFrom(snap, { ...(await extraFrom(q)), now });
    const hash = hashFacts(facts);
    const changed = !prev || prev.meta?.hash !== hash, stale = !prev || now - t_(prev.generated_at) > REFRESH_MS;
    if (!force && !changed && !stale) return { ok: true, skipped: true, hash };
    let brief = autoBrief(facts, snap, now), aiAt = prev?.meta?.ai_at ?? null;
    let alert = {}; try { alert = JSON.parse(readFileSync(join(BASE, 'agy-alert.json'), 'utf8')); } catch { /* brak */ }
    const canAi = !noAi && facts.length && existsSync(AGY) && !lib.agyQuotaOut() && !(alert.lvl >= 80) && (force || !aiAt || now - t_(aiAt) > MIN_AI_GAP_MS);
    if (canAi) {
      try {
        const raw = await agyAsk(aiPrompt(facts), lib.aiUsage);
        const valid = validateAi(lib.extractJson(raw), facts);
        brief = mergeAi(valid, facts, snap, now); aiAt = new Date(now).toISOString();
        log(`meldunek: AI ${valid.items.length}/${facts.length} zdań pokrytych faktami`);
      } catch (e) {
        if (/quota|limit|Resets in/i.test(e.message)) lib.agyQuotaHit(e.message);
        log(`meldunek: Antigravity bez odpowiedzi (${String(e.message).slice(0, 120)}) — tryb auto`);
      }
    }
    brief.meta = { hash, ai_at: aiAt, facts: facts.length, why: force ? 'force' : changed ? 'zmiana danych' : 'odświeżenie' };
    brief = scrubDeep(brief);
    if (print) console.log(JSON.stringify(brief, null, 1));
    else await q(`INSERT INTO ops.status_snapshot (klucz, dane, updated_at) VALUES ('brief', $1::jsonb, now())
                  ON CONFLICT (klucz) DO UPDATE SET dane = EXCLUDED.dane, updated_at = now()`, [JSON.stringify(brief)]);
    return { ok: true, mode: brief.mode, items: brief.items.length, hash };
  } catch (e) { log(`meldunek: ${String(e.message).slice(0, 160)}`); return { ok: false }; }
  finally { try { await c?.end(); } catch { /* zamknięte */ } }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  console.log(JSON.stringify(await writeBrief({ force: a.includes('--force') || a.includes('--print'), noAi: a.includes('--no-ai'), print: a.includes('--print'), log: console.error })));
}
