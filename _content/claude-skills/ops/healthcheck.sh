#!/bin/sh
# Quolino — czuwanie (cron co 5 min). Alarm na Discord tylko przy zmianie stanu: padło / wróciło.
# Webhook: ALERT_WEBHOOK w /root/quolino-web/.env (Discord → kanał → Integracje → Webhook).
. /root/quolino-web/.env 2>/dev/null || true
STATE=/root/quolino-web/.health
SITE=https://quolino.com/
API="https://api.quolino.com/rest/v1/cities?select=slug&limit=1"
fail=""
code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$SITE") ; [ "$code" = 200 ] || fail="$fail strona:$code"
code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$API")  ; [ "$code" = 200 ] || fail="$fail API:$code"
docker inspect -f '{{.State.Running}}' hermes-quolino-hermes-agent-1 2>/dev/null | grep -q true || fail="$fail Hermes:stoi"
docker inspect -f '{{.State.Running}}' postgresql-5bap-postgresql-1 2>/dev/null | grep -q true || fail="$fail baza:stoi"
disk=$(df -P / | awk 'NR==2{gsub("%","",$5); print $5}'); [ "$disk" -lt 90 ] || fail="$fail dysk:${disk}%"
prev=$(cat "$STATE" 2>/dev/null || echo ok)
now=${fail:+fail}; now=${now:-ok}
post() { [ -n "${ALERT_WEBHOOK:-}" ] && curl -s -m 20 -H 'Content-Type: application/json' -d "{\"content\":\"$1\"}" "$ALERT_WEBHOOK" >/dev/null; }
if [ "$now" = fail ] && [ "$prev" = ok ]; then post "🔴 Quolino: problem —$fail"; fi
if [ "$now" = ok ] && [ "$prev" = fail ]; then post "🟢 Quolino: wszystko znowu działa"; fi
echo "$now" > "$STATE"
# sprawdzone: wdrozenie za zgoda JP 2026-10-11
