/* Widok dziecka — misje, checkboxy, progress bar, ranking rodzinny.
   Dane misji pochodzą z TEJ SAMEJ treści co widok rodzica (box-kids / box-foto
   w każdym .stop) — nie ma osobnej bazy danych do utrzymania. */
(function(){
  var CITY = (location.pathname.split('/').pop() || 'index').replace('.html', '');
  var MISSIONS_KEY = 'quolino_missions:' + CITY;
  var FAMILY_KEY = 'quolino_family';
  var ACTIVE_KEY = 'quolino_active_player';

  function loadJSON(key, fallback){
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch(e){ return fallback; }
  }
  function saveJSON(key, val){
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(e){}
  }

  var AVATARS = ['👧','👦','👩','👨','🧒','👶'];
  function getFamily(){ return loadJSON(FAMILY_KEY, []); }
  function saveFamily(f){ saveJSON(FAMILY_KEY, f); }
  function getActive(){ return localStorage.getItem(ACTIVE_KEY) || ''; }
  function setActive(id){ try{ localStorage.setItem(ACTIVE_KEY, id); }catch(e){} }
  function getDone(){ return loadJSON(MISSIONS_KEY, {}); }
  function saveDone(d){ saveJSON(MISSIONS_KEY, d); }

  function parseStops(){
    var stops = [];
    document.querySelectorAll('.stops > .stop').forEach(function(stopEl){
      var numFull = (stopEl.querySelector('.stop-num') || {}).textContent || '';
      var num = numFull.split('·')[0].trim();
      var name = (stopEl.querySelector('.stop-name') || {}).textContent || '';
      var tasks = [];
      var kidsBox = stopEl.querySelector('.box-kids');
      if(kidsBox){
        var kidPs = kidsBox.querySelectorAll('ul li');
        if(kidPs.length){
          kidPs.forEach(function(li, i){
            tasks.push({ id: num + '-misja-' + i, type: 'Misja', text: li.textContent.trim() });
          });
        } else {
          var p = kidsBox.querySelector('p:not(.caps)');
          if(p) tasks.push({ id: num + '-misja-0', type: 'Misja', text: p.textContent.trim() });
        }
      }
      var fotoBox = stopEl.querySelector('.box-foto');
      if(fotoBox){
        var fp = fotoBox.querySelector('p:not(.caps)');
        if(fp) tasks.push({ id: num + '-foto', type: 'Zadanie foto', text: fp.textContent.trim() });
      }
      if(tasks.length) stops.push({ num: num, name: name, tasks: tasks });
    });
    return stops;
  }

  function el(tag, attrs, html){
    var e = document.createElement(tag);
    if(attrs) for(var k in attrs) e.setAttribute(k, attrs[k]);
    if(html != null) e.innerHTML = html;
    return e;
  }

  function buildKidView(stops){
    var wrap = el('div', { class: 'kid-view' });
    var famBar = el('div', { class: 'kid-fam-bar' });
    wrap.appendChild(famBar);
    var progWrap = el('div', { class: 'kid-progress' });
    wrap.appendChild(progWrap);
    var list = el('div', { class: 'kid-missions' });
    wrap.appendChild(list);
    var rankWrap = el('div', { class: 'kid-ranking' });
    wrap.appendChild(rankWrap);
    var openId = stops.length ? stops[0].num : null;

    function allTasks(){
      var t = [];
      stops.forEach(function(s){ s.tasks.forEach(function(tk){ t.push(tk.id); }); });
      return t;
    }

    function render(){
      var done = getDone();
      var family = getFamily();
      var active = getActive();
      famBar.innerHTML = '';
      if(family.length){
        famBar.appendChild(el('div', { class: 'kid-fam-label' }, 'Kto teraz gra?'));
        var row = el('div', { class: 'kid-fam-row' });
        family.forEach(function(p){
          var chip = el('button', { class: 'kid-fam-chip' + (active === p.id ? ' active' : ''), type: 'button' }, p.avatar + ' ' + p.name);
          chip.addEventListener('click', function(){ setActive(p.id); render(); });
          row.appendChild(chip);
        });
        var addBtn = el('button', { class: 'kid-fam-add', type: 'button' }, '+ dodaj');
        addBtn.addEventListener('click', addFamilyMember);
        row.appendChild(addBtn);
        famBar.appendChild(row);
      } else {
        var empty = el('div', { class: 'kid-fam-empty' });
        var btn = el('button', { class: 'kid-fam-add', type: 'button' }, '+ Dodaj domowników do rankingu');
        btn.addEventListener('click', addFamilyMember);
        empty.appendChild(btn);
        famBar.appendChild(empty);
      }
      var all = allTasks();
      var cc = all.filter(function(id){ return !!done[id]; }).length;
      var total = all.length;
      var pct = total ? Math.round(cc / total * 100) : 0;
      progWrap.innerHTML = '<div class="kid-progress-top"><span>Misje ukończone</span><span class="kid-progress-count">' + cc + ' / ' + total + '</span></div><div class="kid-progress-bar"><div class="kid-progress-fill" style="width:' + pct + '%"></div></div>' + (cc === total && total > 0 ? '<div class="kid-progress-done">🎉 Wszystkie misje ukończone! Brawo!</div>' : '');
      list.innerHTML = '';
      stops.forEach(function(s){
        var stopDone = s.tasks.every(function(t){ return !!done[t.id]; });
        var card = el('div', { class: 'kid-stop' + (stopDone ? ' done' : '') });
        var dc = s.tasks.filter(function(t){ return !!done[t.id]; }).length;
        var header = el('div', { class: 'kid-stop-header', role: 'button', tabindex: '0' });
        header.innerHTML = '<div class="kid-stop-num">' + s.num + '</div><div class="kid-stop-info"><div class="kid-stop-name">' + s.name + '</div><div class="kid-stop-count">' + (stopDone ? 'Ukończony ✓' : dc + ' z ' + s.tasks.length + ' misji') + '</div></div><div class="kid-stop-chev">' + (stopDone ? '✓' : (openId === s.num ? '▲' : '▼')) + '</div>';
        header.addEventListener('click', function(){ openId = (openId === s.num) ? null : s.num; render(); });
        card.appendChild(header);
        if(openId === s.num){
          var body = el('div', { class: 'kid-stop-body' });
          s.tasks.forEach(function(t){
            var isDone = !!done[t.id];
            var row = el('div', { class: 'kid-task' + (isDone ? ' done' : ''), role: 'button', tabindex: '0' });
            row.innerHTML = '<div class="kid-check">' + (isDone ? '✓' : '') + '</div><div><div class="kid-task-type">' + t.type + '</div><div class="kid-task-text">' + t.text + '</div></div>';
            row.addEventListener('click', function(){
              var d = getDone();
              if(d[t.id]) delete d[t.id]; else d[t.id] = getActive() || true;
              saveDone(d); render();
            });
            body.appendChild(row);
          });
          card.appendChild(body);
        }
        list.appendChild(card);
      });
      if(family.length){
        var scores = {};
        family.forEach(function(p){ scores[p.id] = 0; });
        Object.keys(done).forEach(function(id){
          var by = done[id];
          if(typeof by === 'string' && scores.hasOwnProperty(by)) scores[by]++;
        });
        var rh = '<div class="caps" style="color:var(--olive);margin-bottom:8px">Ranking rodzinny</div><div class="kid-rank-row">';
        family.forEach(function(p){ rh += '<div class="kid-rank-item"><div class="kid-rank-avatar">' + p.avatar + '</div><div class="kid-rank-name">' + p.name + '</div><div class="kid-rank-score">' + scores[p.id] + '</div></div>'; });
        rankWrap.innerHTML = rh + '</div>'; rankWrap.style.display = '';
      } else { rankWrap.style.display = 'none'; }
    }

    function addFamilyMember(){
      var name = prompt('Imię (np. Zuzia):');
      if(!name) return;
      var avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
      var family = getFamily();
      var id = 'p' + Date.now();
      family.push({ id: id, name: name, avatar: avatar });
      saveFamily(family);
      if(!getActive()) setActive(id);
      render();
    }
    render();
    return wrap;
  }

  function init(){
    var stopsRoot = document.querySelector('.stops');
    if(!stopsRoot) return;
    var stops = parseStops();
    if(!stops.length) return;
    var kidView = buildKidView(stops);
    stopsRoot.parentNode.insertBefore(kidView, stopsRoot);
    window.toggleKidView = function(){
      var isKid = document.body.classList.toggle('kid-mode');
      var btn = document.querySelector('.kid-toggle');
      if(btn){
        btn.setAttribute('aria-pressed', isKid ? 'true' : 'false');
        btn.textContent = isKid ? 'Rodzic ↔' : '👁 Widok dziecka';
      }
      try { sessionStorage.setItem('quolino_kidmode', isKid ? '1' : '0'); } catch(e){}
    };
    try {
      var params = new URLSearchParams(location.search);
      if(params.get('view') === 'kid') window.toggleKidView();
      else if(sessionStorage.getItem('quolino_kidmode') === '1') window.toggleKidView();
    } catch(e){}
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();