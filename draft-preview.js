/* ============================================================
   Podgląd szkicu wycieczki — city.html?draft=<klucz>[&v=<wersja>]
   Dane z RPC draft_preview (tylko z kluczem), wygląd identyczny jak strona,
   do tego stała fiszka „SZKIC” i szuflada z historią poprawek.
   Na stronie publicznej (bez ?draft=) ten plik nic nie robi.
   ============================================================ */
(function () {
  'use strict';
  var qs = new URLSearchParams(location.search);
  var TOKEN = qs.get('draft');
  if (!TOKEN) { window.QDraft = null; return; }
  var VER = parseInt(qs.get('v'), 10) || null;
  // widok w podglądzie (panel admina, JP 2026-10-24): as=guest — jak niezalogowany; domyślnie jak zalogowany; view=kid — widok dziecka
  var AS = qs.get('as') === 'guest' ? 'guest' : 'member';
  var stripRefs = function (t) { return String(t == null ? '' : t).replace(/\s*\[\d{1,3}\]/g, '').replace(/\s+([.,;:!?…])/g, '$1').trim(); };
  var BLOCKS = ['legend', 'curiosity', 'fun_fact', 'pop_culture'];
  // bloki nowych wytycznych (content.stop_blocks_v2, wersja z przypisami) → kształt stop_blocks strony, bez przypisów [n]
  function blocksOf(rec) {
    if (!rec || !rec.marked) return null;
    var m = rec.marked, st = rec.state || {}, out = { lang: FALLBACK_PL }, any = false;
    BLOCKS.forEach(function (b) {
      var v = m[b]; if (!v || (st[b] && st[b].state === 'none')) return;
      if (b === 'pop_culture') v = { items: (v.items || []).map(function (i) { return { title: i.title, year: i.year, text: stripRefs(i.text) }; }) };
      else { var o = {}; for (var k in v) o[k] = stripRefs(v[k]); v = o; }
      out[b] = v; any = true;
    });
    return any ? out : null;
  }
  var FALLBACK_PL = 'pl';

  var LABELS = {
    title: 'tytuł', subtitle: 'podtytuł', lead: 'wstęp', good_to_know: 'dobrze wiedzieć', hero_note: 'notka',
    local_food: 'lokalne jedzenie', region_label: 'region', name: 'nazwa', desc_paragraphs: 'opis dla rodzica',
    kids_box: 'quest', hint: 'wskazówka', local_flavor: 'lokalny smak', practical_note: 'praktyczne',
    dress_code: 'strój', photo_task: 'zadanie foto', opening_hours: 'godziny otwarcia', price: 'cena',
    parking_cost: 'parking', time_label: 'godzina dotarcia', visit_duration: 'czas zwiedzania',
    maps_query: 'mapa', category: 'kategoria', optional: 'opcjonalny', day_plan: 'plan dnia',
    emergency: 'punkty awaryjne', description: 'opis', label: 'nazwa', lat: 'położenie', lon: 'położenie',
    year_built: 'datowanie', rating: 'ocena', ztl: 'ZTL', sources: 'źródła'
  };
  var STATUS = { draft: 'Szkic', archived: 'Wersja archiwalna', published: 'Opublikowana', rejected: 'Odrzucona' };
  var SOURCE = { draft: 'pierwszy szkic', revise: 'poprawka', restore: 'przywrócenie', pipeline: 'automat',
    manual: 'ręcznie', import: 'import', migration: 'migracja' };

  var info = null;
  var names = {};   // stop_key → nazwa (do opisu zmian)

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u) { u = String(u == null ? '' : u).trim(); return /^https?:\/\//i.test(u) ? u : ''; }
  function when(t) {
    try { return new Date(t).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return ''; }
  }
  function short(v) {
    if (v == null) return '—';
    if (Array.isArray(v)) v = v.join(' ¶ ');
    else if (typeof v === 'object') v = JSON.stringify(v);
    v = String(v);
    return v.length > 220 ? v.slice(0, 217) + '…' : v;
  }
  function link(v) {
    var p = new URLSearchParams(location.search);
    p.set('draft', TOKEN);
    if (v) p.set('v', v); else p.delete('v');
    return location.pathname + '?' + p.toString();
  }
  // „content.stops.palazzo-dei-consoli.kids_box” → „Palazzo dei Consoli · quest”
  function where(ch) {
    if (ch.op === 'add_stop') return 'Nowy przystanek: ' + (ch.name || ch.stop_key || '');
    if (ch.op === 'remove_stop') return 'Usunięty przystanek: ' + (names[ch.stop_key] || ch.stop_key || '');
    if (ch.op === 'move_stop') return 'Przeniesiony przystanek: ' + (names[ch.stop_key] || ch.stop_key || '');
    var parts = String(ch.path || '').split('.').filter(function (x) { return x !== 'content' && x !== 'meta'; });
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var k = parts[i];
      if (k === 'stops' && parts[i + 1]) { out.push(names[parts[i + 1]] || parts[i + 1]); i++; continue; }
      if (k === 'city') { out.push('Miasto'); continue; }
      if (/^\d+$/.test(k)) { out.push('akapit ' + (+k + 1)); continue; }
      out.push(LABELS[k] || k);
    }
    return out.join(' · ');
  }

  // ── Dane: cztery „tabele” w kształcie, jakiego oczekuje city.html ──
  function core(lang, SB_URL, SB_KEY, FALLBACK) {
    var p = fetch(SB_URL + '/rpc/draft_preview', {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: TOKEN, p_version: VER })
    }).then(function (r) {
      if (!r.ok) throw new Error('draft ' + r.status);
      return r.json();
    }).then(function (d) {
      if (!d || !d.content) throw new Error('draft-missing');
      info = d;
      window.QDraft.info = d;
      return d.content;
    });
    function byOrder(a, b) { return (a.sort_order || 0) - (b.sort_order || 0); }
    return [
      p.then(function (c) { return c.city ? [c.city] : []; }),
      p.then(function (c) {
        return (c.city_translations || []).filter(function (t) { return t.lang === lang || t.lang === FALLBACK; });
      }),
      p.then(function (c) {
        var tr = c.stop_translations || [];
        return (c.stops || []).slice().sort(byOrder).map(function (s) {
          var o = {}; for (var k in s) o[k] = s[k];
          o.stop_translations = tr.filter(function (t) { return t.stop_id === s.id; });
          var bl = blocksOf((c.stop_blocks_v2 || {})[s.stop_key]);
          if (bl) o.stop_blocks = [bl];
          if (AS === 'guest') {   // jak gość: opis (nowe wytyczne — cały, stare — akapity 1–2), nazwy bloków zamiast treści, bez misji
            var v2 = c.workflow === 'v2';
            o.stop_translations = o.stop_translations.map(function (t) {
              var d = t.desc_paragraphs || [];
              return { lang: t.lang, name: t.name, desc_paragraphs: v2 ? d : d.slice(0, 2), paragraphs_total: d.length,
                has_mission: !!(t.kids_box || t.hint), blocks: bl ? BLOCKS.filter(function (b) { return b !== 'fun_fact' && bl[b]; }) : [] };
            });
            delete o.stop_blocks;
          }
          var pl = o.stop_translations.filter(function (t) { return t.lang === FALLBACK; })[0];
          names[s.stop_key] = pl ? pl.name : s.stop_key;
          return o;
        });
      }),
      p.then(function (c) {
        var e = c.emergency_points || [];
        var m = e.filter(function (x) { return x.lang === lang; });
        if (!m.length) m = e.filter(function (x) { return x.lang === FALLBACK; });
        return m.sort(byOrder);
      })
    ];
  }

  // ── Fiszka i szuflada historii ──
  function css() {
    var s = document.createElement('style');
    s.textContent = [
      '.qd-bar{position:relative;z-index:5;display:flex;align-items:center;gap:12px;flex-wrap:wrap;',
      ' padding:10px var(--gut,20px);background:var(--sun,#FFC629);color:var(--sun-ink,#3B2A00);',
      ' font:600 14px/1.35 Archivo,system-ui,sans-serif;box-shadow:0 2px 0 rgba(59,42,0,.18)}',
      '.qd-bar--old{background:#F2E3B3}',
      '.qd-tag{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;',
      ' background:var(--ink,#0E1A2B);color:#fff;font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:12px}',
      '.qd-tag::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--sun,#FFC629)}',
      '.qd-meta{flex:1 1 260px;min-width:0}',
      '.qd-meta b{font-weight:800}',
      '.qd-pill{display:inline-block;margin-left:6px;padding:1px 8px;border-radius:999px;font-size:12px;font-weight:700;',
      ' background:rgba(14,26,43,.1)}',
      '.qd-pill--ok{background:var(--verde-50,#E1F2E7);color:var(--verde,#1F7A48)}',
      '.qd-pill--fix{background:var(--rosso-50,#FBE6E9);color:var(--rosso,#C81E36)}',
      '.qd-btn{appearance:none;border:2px solid var(--ink,#0E1A2B);background:#fff;color:var(--ink,#0E1A2B);',
      ' border-radius:10px;padding:7px 12px;font:700 14px Archivo,system-ui,sans-serif;cursor:pointer;text-decoration:none}',
      '.qd-btn:hover{background:var(--ink,#0E1A2B);color:#fff}',
      '.qd-stamp{position:fixed;left:14px;bottom:14px;z-index:1500;transform:rotate(-6deg);pointer-events:none;',
      ' padding:6px 14px;border:3px solid var(--rosso,#C81E36);border-radius:8px;color:var(--rosso,#C81E36);',
      ' background:rgba(255,255,255,.88);opacity:.9;font:900 17px/1 Archivo,system-ui,sans-serif;letter-spacing:.14em}',
      '.qd-drawer{position:fixed;inset:0 0 0 auto;width:min(460px,100vw);z-index:2001;background:var(--card,#fff);',
      ' box-shadow:var(--lift-3,0 20px 40px rgba(0,0,0,.25));transform:translateX(105%);transition:transform .28s var(--ease,ease);',
      ' display:flex;flex-direction:column;color:var(--ink,#0E1A2B)}',
      '.qd-drawer.open{transform:none}',
      '.qd-drawer header{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--rule,#D3DDEA)}',
      '.qd-drawer h2{margin:0;font:800 18px Archivo,system-ui,sans-serif}',
      '.qd-x{appearance:none;border:0;background:none;font-size:26px;line-height:1;cursor:pointer;color:var(--ink2,#3E4C63)}',
      '.qd-list{overflow:auto;padding:8px 18px 32px}',
      '.qd-v{border:1px solid var(--rule,#D3DDEA);border-radius:12px;padding:12px 14px;margin:12px 0;background:#fff}',
      '.qd-v--cur{border-color:var(--ink,#0E1A2B);box-shadow:0 0 0 2px var(--sun,#FFC629)}',
      '.qd-v h3{margin:0 0 4px;font:800 15px Archivo,system-ui,sans-serif;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}',
      '.qd-v small{color:var(--muted,#5D6B82);font-weight:600}',
      '.qd-v p{margin:6px 0;font-size:14px;color:var(--ink2,#3E4C63)}',
      '.qd-ch{margin:8px 0 0;padding:0;list-style:none;font-size:13.5px}',
      '.qd-ch li{padding:8px 0;border-top:1px dashed var(--rule,#D3DDEA)}',
      '.qd-ch .qd-w{font-weight:700;color:var(--ink,#0E1A2B)}',
      '.qd-ch del{display:block;color:var(--rosso,#C81E36);text-decoration:line-through;opacity:.85;margin-top:3px}',
      '.qd-ch ins{display:block;color:var(--verde,#1F7A48);text-decoration:none;margin-top:3px}',
      '.qd-ch .qd-why{display:block;color:var(--muted,#5D6B82);font-style:italic;margin-top:3px}',
      '.qd-issues{margin:6px 0 0;padding-left:18px;font-size:13.5px}',
      '.qd-issues li{margin:4px 0}',
      '.qd-rules{margin:8px 0 0;padding:8px 10px;list-style:none;font-size:13.5px;background:var(--sun-50,#FFF6D6);border-radius:8px}',
      '.qd-rules li{margin:3px 0}.qd-pin{font-weight:800}',
      '.qd-facts .qd-pill{margin:0 6px 4px 0}',
      '.qd-v a{color:var(--blu,#0B4EA2)}',
      '.qd-shade{position:fixed;inset:0;z-index:2000;background:rgba(14,26,43,.35);display:none}',
      '.qd-shade.open{display:block}',
      '@media print{.qd-bar,.qd-drawer,.qd-shade{display:none}.qd-stamp{position:absolute}}'
    ].join('');
    document.head.appendChild(s);
  }

  function verdictPill(v, e, w) {
    if (!v) return '';
    return '<span class="qd-pill qd-pill--' + (v === 'ok' ? 'ok' : 'fix') + '">Claude: ' + esc(v) +
      (e ? ' · błędy ' + e : '') + (w ? ' · uwagi ' + w : '') + '</span>';
  }

  function drawerHtml() {
    var h = '<header><h2>Historia poprawek</h2><button class="qd-x" type="button" aria-label="Zamknij">×</button></header><div class="qd-list">';
    var r = info.review;
    var f = r && r.facts;
    if (f) {
      h += '<div class="qd-v qd-facts"><h3>Fakty i źródła <small>v' + info.version + '</small></h3>' +
        '<p><span class="qd-pill qd-pill--ok">✓ potwierdzone ' + (f.confirmed || 0) + '</span>' +
        (f.contradicted ? '<span class="qd-pill qd-pill--fix">✗ niezgodne ' + f.contradicted + '</span>' : '') +
        (f.unverified ? '<span class="qd-pill">bez źródła ' + f.unverified + '</span>' : '') + '</p>';
      if (f.issues && f.issues.length) {
        h += '<ul class="qd-issues">';
        f.issues.forEach(function (x) {
          h += '<li><b>' + esc(x.stop_key ? (names[x.stop_key] || x.stop_key) : 'Miasto') + ':</b> „' + esc(x.claim) + '” — ' + esc(x.evidence || '') +
            (safeUrl(x.url) ? ' <a href="' + esc(safeUrl(x.url)) + '" target="_blank" rel="noopener">artykuł</a>' : '') + '</li>';
        });
        h += '</ul>';
      }
      if (f.sources && f.sources.length) {
        h += '<p><small>Źródła potwierdzające (dopisane do przystanków): ' + f.sources.map(function (x) {
          return (safeUrl(x.url) ? '<a href="' + esc(safeUrl(x.url)) + '" target="_blank" rel="noopener">' + esc(x.title) + '</a>' : esc(x.title)) +
            (x.kind === 'local' ? ' (strona lokalna)' : ' (Wikipedia)');
        }).join(' · ') + '</small></p>';
      }
      h += '</div>';
    }
    if (r && ((r.errors && r.errors.length) || (r.warnings && r.warnings.length))) {
      h += '<div class="qd-v"><h3>Uwagi Claude do v' + info.version + '</h3>';
      if (r.summary) h += '<p>' + esc(r.summary) + '</p>';
      h += '<ul class="qd-issues">';
      (r.errors || []).forEach(function (x) {
        h += '<li><b>Błąd</b> ' + esc((x.stop_key ? (names[x.stop_key] || x.stop_key) + ': ' : '') + (x.problem || '')) +
          (x.fix ? ' → ' + esc(x.fix) : '') + '</li>';
      });
      (r.warnings || []).forEach(function (x) {
        h += '<li>Uwaga: ' + esc((x.stop_key ? (names[x.stop_key] || x.stop_key) + ': ' : '') + (x.problem || '')) + '</li>';
      });
      h += '</ul></div>';
    }
    (info.history || []).forEach(function (v) {
      var cur = v.version === info.version;
      h += '<div class="qd-v' + (cur ? ' qd-v--cur' : '') + '">';
      h += '<h3>v' + v.version + ' <small>' + esc(STATUS[v.status] || v.status) + ' · ' + esc(SOURCE[v.source] || v.source) +
        ' · ' + esc(when(v.created_at)) + ' · ' + v.stops + ' przyst.</small>' + verdictPill(v.verdict, v.errors, v.warnings) + '</h3>';
      if (v.note) h += '<p>' + esc(v.note) + '</p>';
      if (v.review_note) h += '<p><small>' + esc(v.review_note) + '</small></p>';
      var ch = v.changes || [];
      if (ch.length) {
        h += '<ul class="qd-ch">';
        ch.slice(0, 40).forEach(function (c) {
          h += '<li><span class="qd-w">' + esc(where(c)) + '</span>';
          if (c.op !== 'remove_stop' && c.op !== 'move_stop' && c.op !== 'add_stop') {
            h += '<del>' + esc(short(c.before)) + '</del><ins>' + esc(short(c.after)) + '</ins>';
          }
          if (c.why) h += '<span class="qd-why">' + esc(c.why) + '</span>';
          h += '</li>';
        });
        if (ch.length > 40) h += '<li>… i ' + (ch.length - 40) + ' więcej</li>';
        h += '</ul>';
      }
      if (v.learned && v.learned.length) {
        h += '<ul class="qd-rules">';
        v.learned.forEach(function (x) {
          h += '<li><span class="qd-pin">📌 Zasada #' + esc(x.id) + (x.action === 'update' ? ' (doprecyzowana)' : '') + '</span> ' + esc(x.rule) + '</li>';
        });
        h += '</ul>';
      }
      if (!cur) h += '<p><a class="qd-btn" href="' + esc(link(v.version)) + '">Pokaż v' + v.version + '</a></p>';
      h += '</div>';
    });
    return h + '</div>';
  }

  function chrome() {
    if (!info || document.querySelector('.qd-bar')) return;   // zmiana języka przeładowuje dane, nie fiszkę
    css();
    if (!document.querySelector('meta[name="robots"]')) {
      var meta = document.createElement('meta'); meta.name = 'robots'; meta.content = 'noindex,nofollow';
      document.head.appendChild(meta);
    }
    document.title = '[' + (STATUS[info.status] || 'Szkic').toUpperCase() + ' v' + info.version + '] ' + document.title;

    var latest = info.latest_draft;
    var old = info.status !== 'draft';
    var bar = document.createElement('div');
    bar.className = 'qd-bar' + (old ? ' qd-bar--old' : '');
    bar.setAttribute('role', 'status');
    var r = info.review || {};
    bar.innerHTML =
      '<span class="qd-tag">' + esc(STATUS[info.status] || 'Szkic') + ' v' + info.version + '</span>' +
      '<span class="qd-meta">' +
        (old ? 'To nie jest aktualny szkic. ' : 'Nie jest opublikowany — strona pokazuje ' +
          (info.published_version ? 'wersję v' + info.published_version + '. ' : 'nic (nowe miasto). ')) +
        '<b>' + esc(when(info.created_at)) + '</b>' + (info.note ? ' · ' + esc(info.note) : '') +
        verdictPill(r.verdict, r.errors && r.errors.length, r.warnings && r.warnings.length) +
      '</span>' +
      (old && latest ? '<a class="qd-btn" href="' + esc(link(null)) + '">Aktualny szkic v' + latest + '</a>' : '') +
      '<button class="qd-btn" type="button" data-qd="open">Historia poprawek (' + (info.history || []).length + ')</button>';
    document.body.insertBefore(bar, document.body.firstChild);

    var stamp = document.createElement('div');
    stamp.className = 'qd-stamp';
    stamp.textContent = { draft: 'SZKIC', archived: 'ARCHIWUM', published: 'OPUBLIKOWANA', rejected: 'ODRZUCONY' }[info.status] || 'SZKIC';
    stamp.setAttribute('aria-hidden', 'true');
    document.body.appendChild(stamp);

    var shade = document.createElement('div'); shade.className = 'qd-shade';
    var drawer = document.createElement('aside');
    drawer.className = 'qd-drawer'; drawer.setAttribute('aria-label', 'Historia poprawek');
    drawer.innerHTML = drawerHtml();
    document.body.appendChild(shade); document.body.appendChild(drawer);
    function open(o) { drawer.classList.toggle('open', o); shade.classList.toggle('open', o); }
    bar.querySelector('[data-qd="open"]').addEventListener('click', function () { open(true); });
    drawer.querySelector('.qd-x').addEventListener('click', function () { open(false); });
    shade.addEventListener('click', function () { open(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') open(false); });
    if (/[?&]historia\b/.test(location.search)) open(true);
  }

  window.QDraft = { token: TOKEN, version: VER, info: null, core: core, chrome: chrome, asGuest: AS === 'guest' };
})();
