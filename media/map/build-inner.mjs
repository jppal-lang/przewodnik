// Regiony wewnątrz kraju — dopisywane do europe-map.js:
//   inner[kraj] = granice między regionami (linia przerywana, bez brzegu morza)
//   areas[kraj] = [{s: slug regionu, a: [x,y] środek, d: kształt}] — podświetlenie i klik
// Źródło Włoch: openpolis/geojson-italy limits_IT_regions.geojson (ISTAT, CC BY 4.0). node build-inner.mjs 1e-4
import fs from 'fs';
import * as d3 from 'd3-geo';
import * as server from 'topojson-server';
import * as client from 'topojson-client';
import * as simp from 'topojson-simplify';
const src=fs.readFileSync('europe-map.js','utf8');const window={};eval(src);const E=window.QUO_EUROPE;
const proj=d3.geoAzimuthalEqualArea().rotate(E.rot).scale(E.scale).translate([E.tx,E.ty]);
const path=d3.geoPath(proj).digits(1);
const slug=n=>n.split('/')[0].normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
// d3 (geometria sferyczna) chce pierścieni zewnętrznych zgodnie z ruchem wskazówek — RFC 7946 ma odwrotnie
function rewind(f){const g=f.geometry;const polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;
  if(d3.geoArea(f)>2*Math.PI) polys.forEach(p=>p.forEach(r=>r.reverse())); return f;}
const SRC={it:{file:'/tmp/claude-0/geo/it_regions.geojson',name:'reg_name'}};
E.inner={};E.areas={};
for(const [code,cfg] of Object.entries(SRC)){
  const gj=JSON.parse(fs.readFileSync(cfg.file));
  let topo=server.topology({r:gj},1e5);
  topo=simp.simplify(simp.presimplify(topo),+process.argv[2]||1e-4);
  E.inner[code]=path(client.mesh(topo,topo.objects.r,(a,b)=>a!==b));
  const fc=client.feature(topo,topo.objects.r);
  E.areas[code]=fc.features.map(f=>{rewind(f);return {s:slug(f.properties[cfg.name]),a:proj(d3.geoCentroid(f)).map(v=>+v.toFixed(1)),d:path(f)};});
}
const head=src.slice(0,src.indexOf('window.QUO_EUROPE')).replace('Nie edytować ręcznie.','Regiony Włoch: ISTAT via openpolis/geojson-italy (CC BY 4.0). Nie edytować ręcznie.');
fs.writeFileSync('europe-map.js',head+'window.QUO_EUROPE='+JSON.stringify(E)+';\n');
console.log(Object.entries(E.areas).map(([k,v])=>k+': '+v.map(a=>a.s).join(' ')).join('\n'), (fs.statSync('europe-map.js').size/1024).toFixed(0)+'KB');
