// Wybór obrazka przystanku (stop-icon.js, wspólny dla city.html, panelu i SSR): ikona miejsca vs ikona kategorii, zapas przy braku pliku.
// node --test bin/stop-icon.test.mjs — bez przeglądarki (plik działa też jako moduł CommonJS).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { ALLOWED, validateJob } from './repo-jobs.mjs';

const require = createRequire(import.meta.url);
const SI = require('../../../stop-icon.js');
const ROOT = new URL('../../../', import.meta.url).pathname;

test('placeName: tylko poprawne nazwy place-<trasa>-<stop_key>', () => {
  assert.equal(SI.placeName({ icon: 'place-frasassi-tempio-del-valadier' }), 'place-frasassi-tempio-del-valadier');
  assert.equal(SI.placeName({ icon: 'place-spello-villa-dei-mosaici', category: 'museum' }), 'place-spello-villa-dei-mosaici');
  for (const bad of [null, undefined, '', 'icon-church', 'place-', 'place-frasassi', 'place-Frasassi-x', 'place-a-b/../c', 'place-a-b.webp', 'place-a-b c', 42])
    assert.equal(SI.placeName({ icon: bad }), null, String(bad));
  assert.equal(SI.placeName(null), null);
  assert.equal(SI.placeName({ icon: 'place-' + 'a-'.repeat(100) + 'b' }), null, 'za długa');
});

test('pick: ikona miejsca ma pierwszeństwo, z zapasem = ikona kategorii', () => {
  const p = SI.pick({ icon: 'place-frasassi-ponte-romano-torre-romanica', category: 'monument' }, [256, 512]);
  assert.equal(p.kind, 'place');
  assert.equal(p.src, '/media/icons/place-frasassi-ponte-romano-torre-romanica-256.webp');
  assert.equal(p.srcset, '/media/icons/place-frasassi-ponte-romano-torre-romanica-256.webp 1x, /media/icons/place-frasassi-ponte-romano-torre-romanica-512.webp 2x');
  assert.deepEqual(p.fallback, { src: '/media/icons/icon-monument-256.webp', srcset: '/media/icons/icon-monument-256.webp 1x, /media/icons/icon-monument-256.webp 2x' });
});
test('pick: bez stops.icon — ikona kategorii jak dotąd (64/128/256; 512 schodzi do 256), viewpoint → viewpoint-city, brak kategorii → monument', () => {
  const c = SI.pick({ category: 'church' }, [128, 256]);
  assert.equal(c.kind, 'category'); assert.equal(c.src, '/media/icons/icon-church-128.webp'); assert.equal(c.fallback, null);
  assert.equal(SI.pick({ category: 'viewpoint' }, [64, 128]).src, '/media/icons/icon-viewpoint-city-64.webp');
  assert.equal(SI.pick({}, [128, 256]).src, '/media/icons/icon-monument-128.webp');
  assert.equal(SI.pick({ category: 'museum', icon: null }, [256, 512]).srcset, '/media/icons/icon-museum-256.webp 1x, /media/icons/icon-museum-256.webp 2x');
});
test('pick: kategoria bez pliku ikony (park) → none; z ikoną miejsca → place bez zapasu (zostaje SVG karty)', () => {
  assert.equal(SI.pick({ category: 'park' }, [128, 256]).kind, 'none');
  const p = SI.pick({ category: 'park', icon: 'place-x-y' }, [128, 256]);
  assert.equal(p.kind, 'place'); assert.equal(p.fallback, null);
  assert.equal(SI.img({ category: 'park' }, [128, 256]), '');
});
test('img: atrybuty z zapasem (data-fb) i onerror → QStopIcon.fallback; wartości są escapowane', () => {
  const h = SI.img({ icon: 'place-spello-villa-dei-mosaici', category: 'museum' }, [128, 256], 'width="66" height="66"', "this.parentNode.classList.add('has-img')");
  assert.match(h, /^<img src="\/media\/icons\/place-spello-villa-dei-mosaici-128\.webp" srcset="[^"]+ 2x" alt="" decoding="async" width="66" height="66" data-fb="\/media\/icons\/icon-museum-128\.webp" data-fbset="[^"]+" data-place="place-spello-villa-dei-mosaici" onerror="QStopIcon\.fallback\(this\)" onload="this\.parentNode\.classList\.add\('has-img'\)">$/);
  const cat = SI.img({ category: 'castle' }, [256, 512]);
  assert.doesNotMatch(cat, /data-fb|data-place/);
  assert.match(cat, /onerror="QStopIcon\.fallback\(this\)"/);
  assert.equal(SI.imgAttrs(SI.pick({ category: 'park' }, [64, 128])), null);
});
test('fallback: najpierw ikona kategorii, potem usunięcie obrazka', () => {
  const el = (attrs) => ({ a: { ...attrs }, src: attrs.src, removed: false, parentNode: { removeChild() { el.removed = true; } },
    getAttribute(k) { return this.a[k] ?? null; }, setAttribute(k, v) { this.a[k] = v; }, removeAttribute(k) { delete this.a[k]; } });
  const e = el({ src: '/media/icons/place-a-b-128.webp', srcset: 'x 1x, y 2x', 'data-fb': '/media/icons/icon-church-128.webp', 'data-fbset': 'f 1x, g 2x', 'data-place': 'place-a-b' });
  SI.fallback(e);
  assert.equal(e.src, '/media/icons/icon-church-128.webp'); assert.equal(e.a.srcset, 'f 1x, g 2x');
  assert.equal(e.a['data-fb'], undefined); assert.equal(e.a['data-place'], undefined);
  let gone = false; e.parentNode = { removeChild() { gone = true; } };
  SI.fallback(e);   // drugi błąd: ikony kategorii też nie ma → obrazek znika (SVG karty zostaje)
  assert.equal(gone, true);
  SI.fallback(null);
});
test('strona i panel ładują stop-icon.js, a city.html pobiera stops.icon z public_stops', () => {
  const city = readFileSync(`${ROOT}city.html`, 'utf8');
  assert.match(city, /<script src="stop-icon\.js\?v=\d+"><\/script>/);
  assert.match(city, /sb\('public_stops',[^\n]*select=[^\n]*,icon,/);
  assert.match(city, /icon: row\.icon \|\| null/);
  assert.match(readFileSync(`${ROOT}_admin/index.html`, 'utf8'), /<script src="\.\.\/stop-icon\.js\?v=\d+"><\/script>/);
  assert.match(readFileSync(`${ROOT}_content/claude-skills/ssr/server.mjs`, 'utf8'), /public_stops\?[^`]*select=[^`]*\bicon\b/);
});
test('repo-jobs: place-icons.mjs sync jest na białej liście (darmowe), inne komendy nie', () => {
  assert.equal(ALLOWED['place-icons.mjs'](['sync']), true);
  for (const a of [['ok', 'spello', '2'], ['gen', 'spello'], ['sync', '--quiet'], []]) assert.equal(ALLOWED['place-icons.mjs'](a), false, a.join(' '));
  const job = JSON.parse(readFileSync(`${ROOT}_content/jobs/2026-10-31-ikony-sync.json`, 'utf8'));
  assert.equal(validateJob(job), null);
});
