#!/bin/sh
# Quolino — własna strona 404 w nginx kontenera „web” (JP 2026-10-29). Wywołuje install.sh przy każdym approve; można też ręcznie.
#   sh /root/quolino-web/ops/nginx-404.sh        — dopisz (jeśli brak), sprawdź nginx -t, przeładuj; błąd = przywraca poprzedni plik
#   sh /root/quolino-web/ops/nginx-404.sh down   — COFNIĘCIE: usuwa dopisany blok i przeładowuje
# Konfiguracja jest podpięta z hosta tylko do odczytu, więc poprawiamy PLIK NA HOŚCIE (zostaje po restarcie kontenera).
# Zapis przez „cat >” w miejscu (bez zmiany i-węzła), bo pojedynczy plik podpięty do kontenera nie znosi podmiany przez rename.
# Dopisywany blok (między znacznikami „# quolino-404 start/stop”), zaraz po „index index.html;”:
#   błąd 404 i 403 (katalog bez index.html, np. /wlochy/) → /404.html ze statusem 404; /wlochy/ → /pl/wlochy/.
set -u
C=$(docker ps --format '{{.Names}}' | grep -E '^quolino-web-web-[0-9]+$' | head -1)
[ -n "$C" ] || { echo "nginx-404: nie znalazłem kontenera quolino-web-web-*"; exit 1; }
F=/etc/nginx/conf.d/default.conf
SRC=$(docker inspect "$C" --format '{{range .Mounts}}{{if eq .Destination "/etc/nginx/conf.d/default.conf"}}{{.Source}}{{end}}{{end}}')
if [ -z "$SRC" ]; then
  D=$(docker inspect "$C" --format '{{range .Mounts}}{{if eq .Destination "/etc/nginx/conf.d"}}{{.Source}}{{end}}{{end}}')
  [ -n "$D" ] && SRC="$D/default.conf"
fi
[ -n "$SRC" ] && [ -f "$SRC" ] || { echo "nginx-404: nie znalazłem pliku konfiguracji na hoście (montowania $F)"; exit 1; }
BAK="$SRC.quolino-bak"
reload() { docker exec "$C" sh -c 'nginx -t 2>&1' > /tmp/q404-t.txt; grep -q successful /tmp/q404-t.txt && docker exec "$C" nginx -s reload >/dev/null 2>&1; }
restore() { cat "$BAK" > "$SRC"; reload; }
if [ "${1:-}" = down ]; then
  cp "$SRC" "$BAK"; awk '/# quolino-404 start/{s=1} !s{print} /# quolino-404 stop/{s=0}' "$BAK" > /tmp/q404.new && cat /tmp/q404.new > "$SRC"
  if reload; then echo "nginx-404: usunięte (wraca surowe 404 nginx)"; else restore; echo "nginx-404: błąd — przywrócono plik"; exit 1; fi
  exit 0
fi
if grep -q '# quolino-404 start' "$SRC"; then
  docker exec "$C" grep -q '# quolino-404 start' "$F" && { echo "nginx-404: już jest"; exit 0; }
fi
cp "$SRC" "$BAK" || exit 1
awk '{print} /^[[:space:]]*index[[:space:]]+index\.html;/{
  print "  # quolino-404 start"
  print "  error_page 404 /404.html;"
  print "  error_page 403 =404 /404.html;"
  print "  location = /wlochy/ { return 301 /pl/wlochy/; }"
  print "  # quolino-404 stop" }' "$BAK" > /tmp/q404.new
grep -q '# quolino-404 start' /tmp/q404.new || { echo "nginx-404: nie znalazłem linii „index index.html;” w $SRC"; exit 1; }
cat /tmp/q404.new > "$SRC" || { echo "nginx-404: nie udało się zapisać $SRC"; exit 1; }
docker exec "$C" grep -q '# quolino-404 start' "$F" || { restore; echo "nginx-404: kontener nie widzi zmiany pliku (montowanie przez kopię?) — cofnięte"; exit 1; }
if reload; then
  sleep 1
  code=$(curl -s -o /tmp/q404.html -w '%{http_code}' -m 15 "https://quolino.com/to-nie-istnieje-$(date +%s)")
  if [ "$code" = 404 ] && grep -qi 'quo' /tmp/q404.html; then
    echo "nginx-404: wdrożone — zły adres pokazuje stronę 404 Quolino (plik: $SRC, kopia: $BAK)"; exit 0
  fi
  echo "nginx-404: sprawdzenie nie przeszło (status $code) — cofam"
else
  echo "nginx-404: nginx -t odrzucił konfigurację:"; tail -5 /tmp/q404-t.txt
fi
restore; echo "nginx-404: cofnięte, nginx jak przed zmianą"; exit 1
