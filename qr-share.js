/* QR dla dziecka — generuje kod QR (offline, bez zewnętrznego API) prowadzący
   do TEJ SAMEJ strony z ?view=kid, żeby dziecko mogło otworzyć widok dziecka
   na własnym telefonie/tablecie skanując kod pokazany przez rodzica.
   Wymaga qrcode.js (Kazuhiko Arase, MIT) załadowanego wcześniej na stronie. */
(function(){
  function kidUrl(){
    var u = new URL(location.href);
    u.searchParams.set('view', 'kid');
    u.hash = '';
    return u.toString();
  }

  function render(){
    var box = document.querySelector('.qr-share-code');
    if(!box || typeof qrcode === 'undefined') return;
    var url = kidUrl();
    try {
      var qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      box.innerHTML = qr.createSvgTag({ scalable: true });
    } catch(e) { return; }

    // Quo z telefonem przy kodzie (ikony z #quo-ikony, JP 2026-10-25); .qr-share to flex z zawijaniem
    var wrap = box.parentNode;
    if(wrap && !wrap.querySelector('.qr-share-quo')){
      wrap.insertAdjacentHTML('beforeend', '<img class="qr-share-quo" src="/media/icons/quo-qr-256.webp" srcset="/media/icons/quo-qr-256.webp 1x, /media/icons/quo-qr-512.webp 2x" width="96" height="96" alt="" decoding="async" loading="lazy" style="flex:none">');
    }

    var linkEl = document.querySelector('.qr-share-link');
    if(linkEl){ linkEl.textContent = url; linkEl.href = url; }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
