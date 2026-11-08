/* Quolino — niewidoczne sprawdzenie „czy to człowiek” (JP 2026-11-08) dla zgłoszeń przy przystankach i opinii.
   To samo wyzwanie co formularz kontaktowy (ALTCHA v2, SQL 2026-10-17-contact-altcha.sql), ale bez widżetu i bez klikania:
   przeglądarka sama liczy zadanie w tle (proof-of-work, SHA-256), serwer sprawdza wynik jednorazowo. Zero ciasteczek i firm trzecich.
   QPow.start(api, headers) → Promise<string> (payload do p_altcha). Zaczynamy liczyć przy otwarciu formularza, czekamy przy wysyłce. */
(function () {
  'use strict';
  var enc = new TextEncoder();
  function hex2(b) { var s = ''; for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16); return s; }
  function fromHex(h) { var a = new Uint8Array(h.length / 2); for (var i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a; }

  function solve(ch) {
    var p = ch.parameters, base = new Uint8Array(p.salt.length / 2 + p.nonce.length / 2 + 4);
    base.set(fromHex(p.salt), 0); base.set(fromHex(p.nonce), p.salt.length / 2);
    var off = base.length - 4, pre = p.keyPrefix, STEP = 500, MAX = 4294967295;
    function batch(from) {
      var jobs = [];
      for (var c = from; c < from + STEP && c <= MAX; c++) {
        var b = base.slice(); new DataView(b.buffer).setUint32(off, c, false);
        jobs.push(crypto.subtle.digest('SHA-256', b));
      }
      return Promise.all(jobs).then(function (rs) {
        for (var i = 0; i < rs.length; i++) {
          var k = hex2(new Uint8Array(rs[i]));
          if (k.slice(0, pre.length) === pre) return { counter: from + i, derivedKey: k };
        }
        if (from + STEP > MAX) throw new Error('pow');
        return batch(from + STEP);
      });
    }
    return batch(0).then(function (sol) {
      return btoa(String.fromCharCode.apply(null, enc.encode(JSON.stringify({ challenge: ch, solution: sol }))));
    });
  }

  window.QPow = {
    start: function (api, headers) {
      if (!window.crypto || !crypto.subtle) return Promise.reject(new Error('pow'));
      return fetch(api + '/rpc/contact_challenge', { method: 'POST', headers: headers, body: '{}' })
        .then(function (r) { if (!r.ok) throw new Error('pow'); return r.json(); })
        .then(solve);
    }
  };
})();
