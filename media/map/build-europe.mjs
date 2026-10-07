// Generator media/map/europe.js — uruchamiany ręcznie, poza stroną (zero build stepu na stronie).
// npm i world-atlas@2 d3-geo@3 topojson-client@3 topojson-simplify@3 i18n-iso-countries
// node build-europe.mjs 0.0005   (próg uproszczenia; wynik: europe-map.js → skopiować jako europe.js)
import fs from 'fs';
import * as d3 from 'd3-geo';
import * as topo from 'topojson-client';
import * as simp from 'topojson-simplify';
import iso from 'i18n-iso-countries';
const world = JSON.parse(fs.readFileSync('node_modules/world-atlas/countries-50m.json'));
const pre = simp.presimplify(world);
const w2 = simp.simplify(pre, +process.argv[2] || 0.02);
const fc = topo.feature(w2, w2.objects.countries);
const ROT=[-12,-50];
const W=1000;
// kadr: Portugalia..Turcja zach., Grecja/Kreta..płd Skandynawia
const box={type:'MultiPoint',coordinates:[[-10,36],[30,35],[34,47],[24,60],[4,60],[-10,52],[12,34],[14,61]]};
const proj=d3.geoAzimuthalEqualArea().rotate(ROT).fitWidth(W,box);
const b=d3.geoPath(proj).bounds(box);
const H=Math.round(b[1][1]-b[0][1]);
proj.translate([proj.translate()[0]-b[0][0], proj.translate()[1]-b[0][1]]).clipExtent([[-20,-20],[W+20,H+20]]);
const path=d3.geoPath(proj).digits(1);
const out=[];
for(const f of fc.features){
  const c=d3.geoCentroid(f);

  let id=iso.numericToAlpha2(f.id)||(f.properties.name==='Kosovo'?'xk':null)||('n'+f.id);
  if(/^(va|sm)$/i.test(id)) continue;
  const d=path(f); if(!d) continue;
  const bb=path.bounds(f); if(bb[1][0]<0||bb[0][0]>W||bb[1][1]<0||bb[0][1]>H) continue;
  // punkt etykiety: środek największego obszaru (bez wysp i terytoriów zamorskich)
  let big=f; if(f.geometry.type==='MultiPolygon'){let best=null,ba=-1;for(const poly of f.geometry.coordinates){const g={type:'Polygon',coordinates:poly};const a=d3.geoArea(g);if(a>ba){ba=a;best=g;}}big=best;}
  const a=proj(d3.geoCentroid(big)).map(v=>+v.toFixed(1));
  out.push({id:id.toLowerCase(),a,d});
}
const data={w:W,h:H,rot:ROT,scale:+proj.scale().toFixed(4),tx:+proj.translate()[0].toFixed(3),ty:+proj.translate()[1].toFixed(3),countries:out};
const js='/* Mapa Europy dla #regiony — wygenerowane z Natural Earth 1:50m (domena publiczna) przez world-atlas,\n   rzutowanie azymutalne równopowierzchniowe (środek 12°E 50°N). Nie edytować ręcznie. */\nwindow.QUO_EUROPE='+JSON.stringify(data)+';\n';
fs.writeFileSync('europe-map.js',js);
console.log(out.length,'krajów', (js.length/1024).toFixed(0)+'KB', 'H',H, out.map(o=>o.id).join(' '));
// test projekcji: Rzym
console.log(proj([12.4964,41.9028]));
