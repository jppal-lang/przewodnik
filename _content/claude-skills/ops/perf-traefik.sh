#!/bin/sh
# Quolino — kompresja i Cache-Control w Traefiku (D1, decyzja JP 2026-10-29). Wdrożenie: deploy.sh approve → install.sh → „apply”.
#   sh /root/quolino-web/ops/perf-traefik.sh plan    — pokaż, co zostanie ustawione (nic nie zmienia)
#   sh /root/quolino-web/ops/perf-traefik.sh apply   — uruchom/odśwież kontener z etykietami + sprawdzenie; błąd sprawdzenia = samo się cofa
#   sh /root/quolino-web/ops/perf-traefik.sh down    — COFNIĘCIE: usuwa kontener i zapisuje .perf-off (kolejne approve nie włączy ponownie)
#   sh /root/quolino-web/ops/perf-traefik.sh on      — usuwa .perf-off i robi apply
# Jak to działa: NIE ruszamy docker-compose.yml ani override. Osobny mały kontener „quolino-perf-labels” (traefik/whoami) niesie
# tylko etykiety Traefika: middleware compress + nagłówki Cache-Control oraz routery-bliźniaki z tą samą regułą co istniejące
# routery api.quolino.com, SSR i strony (nazwy, reguły, middleware i usługi odczytane z działających kontenerów), z priorytetem
# o 1–2 wyżej. Ruch idzie do tych samych usług co dziś. Usunięcie kontenera = Traefik w ciągu sekund wraca do starych routerów.
set -u
W=/root/quolino-web
NAME=quolino-perf-labels
IMAGE=traefik/whoami:v1.10.1
OFF=$W/.perf-off
mode=${1:-plan}
case "$mode" in
  down) docker rm -f "$NAME" >/dev/null 2>&1 && echo "kompresja/cache: kontener usunięty (Traefik wraca do starych routerów)"; touch "$OFF"; exit 0 ;;
  on) rm -f "$OFF"; mode=apply ;;
  plan|apply) ;;
  *) echo "użycie: $0 plan|apply|down|on"; exit 1 ;;
esac
if [ "$mode" = apply ] && [ -f "$OFF" ]; then echo "kompresja/cache: wyłączone przez $OFF (włączenie: $0 on)"; exit 0; fi

T=$(docker ps --format '{{.Names}} {{.Image}}' | awk '$2 ~ /(^|\/)traefik:/ {print $1; exit}')
[ -n "$T" ] || { echo "Nie znalazłem kontenera Traefika"; exit 1; }
TV=$(docker inspect -f '{{.Config.Image}}' "$T" | sed 's/.*://')
docker ps -q | xargs docker inspect > /tmp/quolino-perf-inspect.json || exit 1

python3 - "$mode" "$NAME" "$IMAGE" "$TV" <<'PY' > /tmp/quolino-perf-plan.txt
import json, sys, re, hashlib
mode, NAME, IMAGE, TV = sys.argv[1:5]
data = json.load(open('/tmp/quolino-perf-inspect.json'))
def die(msg): print('ABORT ' + msg); sys.exit(0)
m = re.match(r'v?(\d+)', TV)
if TV not in ('latest',) and (not m or int(m.group(1)) < 3): die('Traefik %s — reguły PathRegexp/QueryRegexp wymagają v3' % TV)
routers, services_of, net_of = {}, {}, {}
for c in data:
    name = c['Name'].lstrip('/'); L = c['Config'].get('Labels') or {}
    if name == NAME or L.get('traefik.enable') != 'true': continue
    services_of[name] = sorted({k.split('.')[3] for k in L if k.startswith('traefik.http.services.')})
    net_of[name] = L.get('traefik.docker.network') or next(iter((c['NetworkSettings'].get('Networks') or {}).keys()), '')
    for k, v in L.items():
        mm = re.match(r'traefik\.http\.routers\.([^.]+)\.(.+)$', k)
        if mm: routers.setdefault(mm.group(1), {'container': name})[mm.group(2)] = v
def prio(r): return int(r['priority']) if r.get('priority') else len(r.get('rule', ''))
def svc(rn, r):
    if r.get('service'): s = r['service']
    else:
        s_ = services_of.get(r['container']) or []
        if len(s_) != 1: die('router %s bez service i %d usług w kontenerze' % (rn, len(s_)))
        s = s_[0]
    return s if '@' in s else s + '@docker'
def mws(r): return [x if '@' in x else x + '@docker' for x in (r.get('middlewares') or '').split(',') if x.strip()]
def host(r, h): return re.search(r'Host\(`%s`\)' % re.escape(h), r.get('rule', '')) is not None
api = {n: r for n, r in routers.items() if host(r, 'api.quolino.com')}
ssr = {n: r for n, r in routers.items() if n == 'quolino-ssr'}
web = [n for n, r in routers.items() if host(r, 'quolino.com') and 'ssr' not in n and 'umami' not in n and 'ssr' not in r['container'] and 'umami' not in r['container']
       and not re.search(r'redirect', r.get('middlewares', ''))]
if not api: die('brak routera dla api.quolino.com')
if len(web) != 1: die('router strony quolino.com: znaleziono %s (oczekiwany dokładnie 1)' % web)
L = {'traefik.enable': 'true', 'quolino.perf': 'D1 2026-10-29',
     'traefik.http.services.quolino-perf-noop.loadbalancer.server.port': '80',
     'traefik.http.middlewares.quolino-compress.compress.minresponsebodybytes': '1024',
     # PostgREST dodaje „Content-Range”, a kompresja Traefika pomija odpowiedzi z tym nagłówkiem — strona go nie używa, usuwamy
     'traefik.http.middlewares.quolino-norange.headers.customresponseheaders.Content-Range': ''}
CC = {'quolino-cc-api': 'public, max-age=300', 'quolino-cc-img': 'public, max-age=2592000, stale-while-revalidate=86400',
      'quolino-cc-font': 'public, max-age=31536000, immutable', 'quolino-cc-asset': 'public, max-age=86400', 'quolino-cc-html': 'no-cache'}
for k, v in CC.items(): L['traefik.http.middlewares.%s.headers.customresponseheaders.Cache-Control' % k] = v
def hosts(rule): return set(re.findall(r'Host\(`([^`]+)`\)', rule))
taken = [(hosts(r.get('rule', '')), prio(r), n) for n, r in routers.items()]
def add(rn, base, rule, p, extra):
    for hs, q, other in taken:   # ten sam priorytet przy tym samym hoście = niejednoznaczna kolejność → przerwij
        if q == p and hs & hosts(rule): die('priorytet %d zajęty na %s (router %s)' % (p, ','.join(hs & hosts(rule)), other))
    taken.append((hosts(rule), p, rn))
    pre = 'traefik.http.routers.%s.' % rn
    L[pre + 'rule'] = rule; L[pre + 'priority'] = str(p); L[pre + 'service'] = base['_svc']
    for k in ('entrypoints', 'tls', 'tls.certresolver'):
        if base.get(k): L[pre + k] = base[k]
    L[pre + 'middlewares'] = ','.join(mws(base) + extra)
for n, r in sorted(api.items()):
    r['_svc'] = svc(n, r); p = prio(r)
    add(n + '-perf', r, '(%s)' % r['rule'], p + 1, ['quolino-compress@docker', 'quolino-norange@docker'])
    add(n + '-perf-get', r, '(%s) && Method(`GET`) && !PathPrefix(`/rest/v1/rpc`)' % r['rule'], p + 2, ['quolino-compress@docker', 'quolino-norange@docker', 'quolino-cc-api@docker'])
for n, r in ssr.items():
    r['_svc'] = svc(n, r); add(n + '-perf', r, '(%s)' % r['rule'], prio(r) + 1, ['quolino-compress@docker'])
w = routers[web[0]]; w['_svc'] = svc(web[0], w)
if prio(w) >= 90: die('router strony ma priorytet %d ≥ 90' % prio(w))
H = 'Host(`quolino.com`)'
for i, (suffix, rule, cc) in enumerate([
        ('img', r'PathRegexp(`\.(?:webp|avif|jpe?g|png|gif|svg|ico|mp4|webm)$`)', 'quolino-cc-img'),
        ('font', r'PathRegexp(`\.woff2$`)', 'quolino-cc-font'),
        ('asset', r'PathRegexp(`\.(?:css|js)$`) && QueryRegexp(`v`, `.+`)', 'quolino-cc-asset'),
        ('html', r'(Path(`/`) || PathRegexp(`(?:/|\.html)$`))', 'quolino-cc-html')]):
    add('quolino-web-perf-' + suffix, w, '%s && %s' % (H, rule), 90 - i, ['quolino-compress@docker', cc + '@docker'])
L['traefik.docker.network'] = net_of.get(w['container'], '')
h = hashlib.sha256(json.dumps(L, sort_keys=True).encode()).hexdigest()[:16]
L['quolino.perf.hash'] = h
print('OK %s %s' % (h, L['traefik.docker.network']))
for k in sorted(L): print('LABEL %s=%s' % (k, L[k]))
PY
head -1 /tmp/quolino-perf-plan.txt | grep -q '^OK ' || { cat /tmp/quolino-perf-plan.txt; exit 1; }
set -- $(head -1 /tmp/quolino-perf-plan.txt); HASH=$2; NET=$3
if [ "$mode" = plan ]; then
  echo "Traefik $TV ($T). Kontener $NAME ($IMAGE), sieć $NET. Etykiety:"; sed -n 's/^LABEL /  /p' /tmp/quolino-perf-plan.txt
  echo "Teraz: $(docker inspect -f '{{index .Config.Labels "quolino.perf.hash"}}' "$NAME" 2>/dev/null || echo 'brak kontenera') → po apply: $HASH"; exit 0
fi
[ "$(docker inspect -f '{{index .Config.Labels "quolino.perf.hash"}}' "$NAME" 2>/dev/null)" = "$HASH" ] && { echo "kompresja/cache: bez zmian ($HASH)"; exit 0; }
docker rm -f "$NAME" >/dev/null 2>&1
python3 - "$NAME" "$IMAGE" "$NET" <<'PY' || exit 1
import subprocess, sys
name, image, net = sys.argv[1:4]
args = ['docker', 'run', '-d', '--name', name, '--restart', 'unless-stopped', '--memory', '16m', '--cpus', '0.05']
if net: args += ['--network', net]
for line in open('/tmp/quolino-perf-plan.txt', encoding='utf-8'):
    if line.startswith('LABEL '): args += ['--label', line[6:].rstrip('\n')]
sys.exit(subprocess.run(args + [image], stdout=subprocess.DEVNULL).returncode)
PY
sleep 6
fail=""; warn=""
hdr() { curl -s -o /dev/null -D - -m 20 -H 'Accept-Encoding: gzip, br' "$1" | tr -d '\r' | tr 'A-Z' 'a-z'; }
h=$(hdr 'https://api.quolino.com/rest/v1/ui_translations?select=key,value&lang=eq.pl&limit=200')
echo "$h" | grep -q '^http/[0-9.]* 200' || fail="$fail API≠200"
echo "$h" | grep -q '^content-encoding: \(gzip\|br\|zstd\)' || warn="API bez kompresji (reszta działa)"
echo "$h" | grep -q '^cache-control: public, max-age=300' || fail="$fail API-bez-cache"
# POST (RPC) nie dostaje Cache-Control z założenia: router z cache ma Method(`GET`) && !PathPrefix(`/rest/v1/rpc`)
h=$(hdr 'https://quolino.com/'); echo "$h" | grep -q '^http/[0-9.]* 200' || fail="$fail strona≠200"
echo "$h" | grep -q '^cache-control: no-cache' || fail="$fail HTML-bez-no-cache"
h=$(hdr 'https://quolino.com/media/hero-poster.jpg'); echo "$h" | grep -q 'max-age=2592000' || fail="$fail zdjęcia-bez-cache"
h=$(hdr 'https://quolino.com/sitemap.xml'); echo "$h" | grep -q '^http/[0-9.]* 200' || fail="$fail SSR≠200"
echo "$h" | grep -q '^content-encoding: ' || fail="$fail SSR-bez-kompresji"
if [ -n "$fail" ]; then
  docker rm -f "$NAME" >/dev/null 2>&1
  echo "kompresja/cache: sprawdzenie NIE przeszło ($fail) — cofnięte (kontener usunięty)"; exit 1
fi
[ -n "$warn" ] && echo "kompresja/cache: uwaga — $warn"
echo "kompresja/cache: wdrożone ($HASH) — API gzip/br + max-age=300, SSR gzip/br, zdjęcia 30 dni, fonty 1 rok, CSS/JS z ?v= 1 dzień, HTML no-cache"
