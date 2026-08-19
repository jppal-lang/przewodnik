/* Migracja localStorage: questini_* → quolino_* (90 dni fallback) */
(function(){
  var MIGRATION_FLAG = 'quolino_migrated';
  var MIGRATION_EXPIRY = 'quolino_migration_expiry';
  if(localStorage.getItem(MIGRATION_FLAG)) return;
  var now = Date.now();
  var expiry = now + 90*24*60*60*1000; // 90 dni
  try {
    var keys = [];
    for(var i=0; i<localStorage.length; i++) keys.push(localStorage.key(i));
    keys.forEach(function(k){
      if(k && k.indexOf('questini') === 0){
        var newKey = k.replace(/^questini/, 'quolino');
        if(!localStorage.getItem(newKey)){
          localStorage.setItem(newKey, localStorage.getItem(k));
        }
      }
    });
    localStorage.setItem(MIGRATION_FLAG, '1');
    localStorage.setItem(MIGRATION_EXPIRY, String(expiry));
  } catch(e){}
})();
/* Czyszczenie starych kluczy po 90 dniach */
(function(){
  var expiry = parseInt(localStorage.getItem('quolino_migration_expiry')||'0',10);
  if(!expiry || Date.now() < expiry) return;
  try {
    var keys = [];
    for(var i=0; i<localStorage.length; i++) keys.push(localStorage.key(i));
    keys.forEach(function(k){
      if(k && k.indexOf('questini') === 0) localStorage.removeItem(k);
    });
    localStorage.removeItem('quolino_migration_expiry');
  } catch(e){}
})();