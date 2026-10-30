#!/bin/sh
# Quolino — własna strona 404 w nginx kontenera „web” (JP 2026-10-29). Wywołuje install.sh przy każdym approve; można też ręcznie.
#   sh /root/quolino-web/ops/nginx-404.sh        — dopisz (jeśli brak), sprawdź nginx -t, przeładuj; błąd = przywraca poprzedni plik
#   sh /root/quolino-web/ops/nginx-404.sh down   — COFNIĘCIE: usuwa dopisany blok i przeładowuje
# Dopisuje do server{} w /etc/nginx/conf.d/default.conf blok między znacznikami „# quolino-404 start/stop”:
#   błąd 404 i 403 (katalog bez index.html, np. /wlochy/) → /404.html ze statusem 404; /wlochy/ → /pl/wlochy/.
# Gdy plik jest zamontowany z hosta, poprawiany jest plik hosta (zostaje po odtworzeniu kontenera); inaczej plik w kontenerze
# — wtedy przy odtworzeniu kontenera wraca stary, ale install.sh dopisze blok ponownie przy następnym approve.
set -u
C=$(docker ps --format '{{.Names}}' | grep -E '^quolino-web-web-[0-9]+$' | head -1)
[ -n "$C" ] || { echo "nginx-404: nie znalazłem kontenera quolino-web-web-*"; exit 1; }
F=/etc/nginx/conf.d/default.conf
BLOCK='  # quolino-404 start
  error_page 404 /404.html;
  error_page 403 =404 /404.html;
  location = /wlochy/ { return 301 /pl/wlochy/; }
  # quolino-404 stop'
docker exec "$C" sh -c "cp $F /tmp/default.conf.bak" || exit 1
if [ "${1:-}" = down ]; then
  docker exec "$C" sh -c "sed -i '/# quolino-404 start/,/# quolino-404 stop/d' $F && nginx -t && nginx -s reload" \
    && echo "nginx-404: usunięte (wraca surowe 404 nginx)" || { docker exec "$C" sh -c "cp /tmp/default.conf.bak $F"; echo "nginx-404: błąd — przywrócono plik"; exit 1; }
  exit 0
fi
if docker exec "$C" grep -q '# quolino-404 start' "$F"; then echo "nginx-404: już jest"; exit 0; fi
printf '%s\n' "$BLOCK" > /tmp/quolino-404.block
docker cp -q /tmp/quolino-404.block "$C":/tmp/quolino-404.block 2>/dev/null || docker cp /tmp/quolino-404.block "$C":/tmp/quolino-404.block >/dev/null || { echo "nginx-404: nie udało się skopiować bloku do kontenera"; exit 1; }
# wstaw blok zaraz po „index index.html;” (awk zamiast sed -i: działa też tam, gdzie sed -i nie może podmienić pliku)
docker exec "$C" sh -c "awk '{print} /^[[:space:]]*index[[:space:]]+index\.html;/{while((getline l < \"/tmp/quolino-404.block\")>0) print l}' $F > /tmp/default.conf.new && cat /tmp/default.conf.new > $F" \
  || { echo "nginx-404: nie udało się zapisać $F (plik tylko do odczytu?)"; exit 1; }
docker exec "$C" grep -q '# quolino-404 start' "$F" || { echo "nginx-404: nie znalazłem linii „index index.html;” — blok nie wstawiony"; docker exec "$C" sh -c "cp /tmp/default.conf.bak $F"; exit 1; }
T=$(docker exec "$C" sh -c 'nginx -t 2>&1')
if echo "$T" | grep -q 'successful'; then
  docker exec "$C" nginx -s reload
  sleep 1
  code=$(curl -s -o /tmp/q404.html -w '%{http_code}' -m 15 "https://quolino.com/to-nie-istnieje-$(date +%s)")
  if [ "$code" = 404 ] && grep -qi 'quo' /tmp/q404.html; then
    # zamontowany z hosta? zapisz też na hoście
    SRC=$(docker inspect "$C" --format '{{range .Mounts}}{{if eq .Destination "/etc/nginx/conf.d/default.conf"}}{{.Source}}{{end}}{{end}}')
    [ -n "$SRC" ] && docker cp "$C":$F "$SRC"
    echo "nginx-404: wdrożone — zły adres pokazuje stronę 404 Quolino (status 404)"; exit 0
  fi
  echo "nginx-404: sprawdzenie nie przeszło (status $code, $(head -c 120 /tmp/q404.html | tr -d '\n')) — cofam"
else
  echo "nginx-404: nginx -t odrzucił konfigurację:"; echo "$T" | tail -5
fi
docker exec "$C" sh -c "cp /tmp/default.conf.bak $F && nginx -s reload"
echo "nginx-404: cofnięte, nginx jak przed zmianą"; exit 1
