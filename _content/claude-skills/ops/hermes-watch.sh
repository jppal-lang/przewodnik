#!/bin/sh
# Quolino — nadzór połączenia Hermesa z Discordem (cron co 5 min; decyzja JP 2026-10-11).
# Stan bierzemy z /opt/data/gateway_state.json (platforms.discord.state). Gdy Discord nie jest „connected”:
#   1) restart TYLKO bramki Hermesa (s6: gateway-default) — tłumaczenia i skrypty w kontenerze liczą się dalej;
#   2) gdy po kolejnym sprawdzeniu nadal brak połączenia — restart całego kontenera, ale dopiero gdy nie trwa
#      żadne zadanie (trip-*, social-draft, gastro, links) albo minęło 15 min od wykrycia; przerwane tłumaczenia
#      są uruchamiane ponownie (zapisane języki są pomijane).
# Każdy krok → krótka informacja na ALERT_WEBHOOK (gdy ustawiony). Dziennik: /root/quolino-web/hermes-watch.log
set -u
H=hermes-quolino-hermes-agent-1
W=/root/quolino-web
ST=$W/.hermes-watch            # „<etap> <czas wykrycia>”
. $W/.env 2>/dev/null || true
now=$(date +%s)
log() { echo "$(date -u '+%F %T') $*"; }
post() { [ -n "${ALERT_WEBHOOK:-}" ] && curl -s -m 20 -H 'Content-Type: application/json' -d "{\"content\":\"$1\"}" "$ALERT_WEBHOOK" >/dev/null; return 0; }
X() { docker exec "$H" "$@"; }

docker inspect -f '{{.State.Running}}' "$H" 2>/dev/null | grep -q true || { log "kontener nie działa — to obsługuje healthcheck"; exit 0; }
state=$(X python3 -c "import json;d=json.load(open('/opt/data/gateway_state.json'));p=d.get('platforms',{}).get('discord',{});print(d.get('gateway_state','?'), p.get('state','?'))" 2>/dev/null || echo "? ?")
gw=${state% *}; dc=${state#* }

if [ "$gw" = running ] && [ "$dc" = connected ]; then
  if [ -f "$ST" ]; then log "Discord znów połączony"; post "🟢 Hermes: Discord znów połączony"; rm -f "$ST"; fi
  exit 0
fi

set -- $(cat "$ST" 2>/dev/null || echo "0 $now")
stage=$1; since=$2
log "brak połączenia (bramka: $gw, discord: $dc), etap $stage, od $(( (now - since) / 60 )) min"

if [ "$stage" = 0 ]; then
  # sprawdzenie, czy Discord nie łączy się właśnie sam (daj mu chwilę)
  echo "1 $now" > "$ST"; exit 0
fi
if [ "$stage" = 1 ]; then
  log "restart samej bramki Hermesa"
  X /package/admin/s6/command/s6-svc -r /run/service/gateway-default && post "🟠 Hermes stracił połączenie z Discordem — restartuję samą bramkę (zadania liczą się dalej)"
  echo "2 $since" > "$ST"; exit 0
fi
# etap 2+: bramka nie pomogła → cały kontener, ale nie w trakcie pracy (chyba że czekamy już 15 min)
busy=$(X sh -c "pgrep -af 'node (trip-|social-draft|gastro-refresh|links-check)' | grep -v pgrep" 2>/dev/null || true)
if [ -n "$busy" ] && [ $(( now - since )) -lt 900 ]; then
  log "czekam z restartem — trwa: $(echo "$busy" | awk '{print $3, $4}' | tr '\n' ';')"; exit 0
fi
resume=$(echo "$busy" | grep -o 'trip-translate.mjs [a-z0-9-]*' | awk '{print $2}' | sort -u)
log "restart całego kontenera Hermesa"
docker restart "$H" >/dev/null && sleep 40
for slug in $resume; do
  X -d -u hermes -e HOME=/opt/data/home -w /opt/data/quolino sh -c "node trip-translate.mjs $slug >> work/translate-$slug.log 2>&1"
  log "wznowione tłumaczenie: $slug"
done
post "🟠 Hermes: zrestartowany cały kontener (Discord nie wrócił po restarcie bramki)${resume:+; wznowione tłumaczenia: $resume}"
echo "3 $since" > "$ST"
