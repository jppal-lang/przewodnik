/* Sticky TOC — generowany z nagłówków przystanków */
(function(){
  var stops = document.querySelectorAll('.stops > .stop');
  if(!stops.length) return;
  var nav = document.createElement('nav');
  nav.className = 'stop-toc';
  nav.setAttribute('aria-label', 'Przystanki');
  stops.forEach(function(s){
    var num = s.querySelector('.stop-num');
    var name = s.querySelector('.stop-name');
    if(!num || !name) return;
    var id = 'stop-' + (s.dataset.id || '');
    s.id = id;
    var a = document.createElement('a');
    a.href = '#' + id;
    a.textContent = num.textContent.split('·')[0].trim();
    a.title = name.textContent;
    a.addEventListener('click', function(e){
      e.preventDefault();
      s.scrollIntoView ? void 0 : null;
      var top = s.getBoundingClientRect().top + window.pageYOffset - 60;
      window.scrollTo({top: top, behavior: 'smooth'});
    });
    nav.appendChild(a);
  });
  var stopsDiv = document.querySelector('.stops');
  if(stopsDiv) stopsDiv.parentNode.insertBefore(nav, stopsDiv);
})();