/* Album zdjęć per przystanek — localStorage, bez serwera */
(function(){
  var NS = 'quolino_album:' + (location.pathname.split('/').pop() || 'index').replace('.html','');
  var ICON_ADD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3.4"/><path d="M8 5l1.2-2h5.6L16 5"/></svg>';

  function load(key){ try{ return JSON.parse(localStorage.getItem(key)||'[]'); }catch(e){ return []; } }
  function save(key, arr){
    try{ localStorage.setItem(key, JSON.stringify(arr)); return true; }
    catch(e){ alert('Pamięć albumu pełna. Usuń kilka zdjęć (dotknij miniaturę).'); return false; }
  }

  function compress(file, cb){
    var img = new Image(), fr = new FileReader();
    fr.onload = function(){ img.src = fr.result; };
    img.onload = function(){
      var MAX = 1000, w = img.width, h = img.height;
      if(w > h && w > MAX){ h = h*MAX/w; w = MAX; }
      else if(h >= w && h > MAX){ w = w*MAX/h; h = MAX; }
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      cb(c.toDataURL('image/jpeg', 0.72));
    };
    fr.readAsDataURL(file);
  }

  function render(box, key){
    var arr = load(key);
    box.innerHTML = '';
    arr.forEach(function(d, i){
      var im = document.createElement('img');
      im.src = d; im.alt = 'zdjęcie ' + (i+1); im.loading = 'lazy';
      im.title = 'Dotknij, aby usunąć';
      im.addEventListener('click', function(){
        if(confirm('Usunąć to zdjęcie z albumu?')){
          arr.splice(i,1); save(key, arr); render(box, key);
        }
      });
      box.appendChild(im);
    });
  }

  document.querySelectorAll('.stop').forEach(function(stop, idx){
    var inner = stop.querySelector('.stop-body');
    if(!inner) return;
    var key = NS + ':' + idx;
    var wrap = document.createElement('div'); wrap.className = 'album';
    var box = document.createElement('div'); box.className = 'thumbs';
    var row = document.createElement('div'); row.className = 'albumrow';
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'addphoto';
    btn.innerHTML = ICON_ADD + '<span>Dodaj zdjęcie z galerii</span>';
    var input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.multiple = true; input.hidden = true;
    btn.addEventListener('click', function(){ input.click(); });
    input.addEventListener('change', function(){
      var files = Array.prototype.slice.call(input.files || []);
      (function next(){
        var f = files.shift();
        if(!f){ input.value=''; return; }
        compress(f, function(dataUrl){
          var arr = load(key); arr.push(dataUrl);
          if(save(key, arr)) render(box, key);
          next();
        });
      })();
    });
    row.appendChild(btn);
    wrap.appendChild(box); wrap.appendChild(row); wrap.appendChild(input);
    inner.appendChild(wrap);
    render(box, key);
  });
})();

/* Zdjęcia z wolnych źródeł: miniatury z Wikipedii (Wikimedia Commons) */
(function(){
  document.querySelectorAll('.stop[data-wiki]').forEach(function(stop){
    var title = stop.getAttribute('data-wiki');
    var slot = stop.querySelector('.stop-photo');
    if(!slot) return;
    var url = 'https://it.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g,'_'));
    fetch(url).then(function(r){ return r.ok ? r.json() : null; }).then(function(d){
      if(!d) return;
      var img = (d.originalimage && d.originalimage.source) || (d.thumbnail && d.thumbnail.source);
      if(!img) return;
      if(d.thumbnail && d.thumbnail.source) img = d.thumbnail.source.replace(/\/(\d+)px-/, '/900px-');
      var im = document.createElement('img');
      im.src = img; im.alt = title; im.loading = 'lazy';
      im.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:14px';
      slot.innerHTML = ''; slot.appendChild(im);
      var cap = document.createElement('a');
      cap.href = (d.content_urls && d.content_urls.desktop && d.content_urls.desktop.page) || '#';
      cap.target = '_blank'; cap.rel = 'noopener';
      cap.textContent = 'Foto: Wikimedia Commons / Wikipedia';
      cap.style.cssText = 'display:block;margin-top:6px;font-size:12px;color:var(--label);border-bottom:1px dashed var(--line);width:fit-content';
      slot.insertAdjacentElement('afterend', cap);
    }).catch(function(){});
  });
})();