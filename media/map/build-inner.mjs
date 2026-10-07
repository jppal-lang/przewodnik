// Granice regionów (linia przerywana) dopisywane do europe-map.js; uruchamiać po build-europe.mjs.
// Źródło: openpolis/geojson-italy limits_IT_regions.geojson (ISTAT, CC BY 4.0). node build-inner.mjs 1e-4
// Granice regionów wewnątrz kraju (bez linii brzegowej) — dopisywane do europe.js jako inner[kraj]
import fs from 'fs';
import * as d3 from 'd3-geo';
import * as server from 'topojson-server';
import * as client from 'topojson-client';
import * as simp from 'topojson-simplify';
const src=fs.readFileSync('europe-map.js','utf8');const window={};eval(src);const E=window.QUO_EUROPE;
const proj=d3.geoAzimuthalEqualArea().rotate(E.rot).scale(E.scale).translate([E.tx,E.ty]);
const path=d3.geoPath(proj).digits(2);
const gj=JSON.parse(fs.readFileSync('/tmp/claude-0/geo/it_regions.geojson'));
// openpolis: pierścienie zgodnie z RFC 7946 (przeciwnie do d3) — tu liczymy tylko granice, więc kierunek nie ma znaczenia
let topo=server.topology({r:gj},1e5);
topo=simp.simplify(simp.presimplify(topo),+process.argv[2]||1e-7);
const mesh=client.mesh(topo,topo.objects.r,(a,b)=>a!==b);
E.inner={it:path(mesh)};
const head=src.slice(0,src.indexOf('window.QUO_EUROPE'));
fs.writeFileSync('europe-map.js',head.replace('Nie edytować ręcznie.','Granice regionów Włoch: ISTAT via openpolis/geojson-italy (CC BY 4.0). Nie edytować ręcznie.')+'window.QUO_EUROPE='+JSON.stringify(E)+';\n');
console.log('inner it', (E.inner.it.length/1024).toFixed(1)+'KB');
