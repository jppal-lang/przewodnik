#!/bin/sh
# Quolino — dopisuje do crontaba roota brakujące zadania z cron/crontab.txt (JP 2026-10-17).
#   sh /root/quolino-web/ops/cron-sync.sh            — pokaż, czego brakuje, i dopisz
#   sh /root/quolino-web/ops/cron-sync.sh --check    — tylko pokaż, nic nie zmieniaj
# Nie usuwa ani nie zmienia istniejących wpisów (także innych projektów na VPS). Kopia przed zmianą:
# /root/quolino-web/crontab.bak-<data>. Powtarzalne: drugi raz nic nie dopisze.
set -eu
SRC=/var/lib/docker/volumes/quolino-web_site/_data/_content/claude-skills/cron/crontab.txt
W=/root/quolino-web
[ -f "$SRC" ] || { echo "Brak $SRC"; exit 1; }
cur=$(mktemp); add=$(mktemp); trap 'rm -f "$cur" "$add"' EXIT
crontab -l 2>/dev/null > "$cur" || true

# zmienna H= musi być przed zadaniami, które z niej korzystają
if ! grep -q '^H=' "$cur"; then grep '^H=' "$SRC" >> "$add"; fi
# zadania: linie zaczynające się od harmonogramu (cyfra albo *); porównanie po samej komendzie (bez harmonogramu i spacji)
norm() { sed -E 's/^([^ ]+[ ]+){5}//; s/[[:space:]]+/ /g; s/ $//'; }
grep -E '^[0-9*]' "$SRC" | while IFS= read -r line; do
  cmd=$(printf '%s\n' "$line" | norm)
  if ! grep -E '^[0-9*]' "$cur" | norm | grep -qxF "$cmd"; then printf '%s\n' "$line" >> "$add"; fi
done

if [ ! -s "$add" ]; then echo "Crontab roota ma już wszystkie zadania Quolino."; exit 0; fi
echo "Brakujące wpisy:"; sed 's/^/  + /' "$add"
[ "${1:-}" = --check ] && exit 0
cp "$cur" "$W/crontab.bak-$(date +%Y%m%d-%H%M%S)"
{ cat "$cur"; echo "# ── Quolino: dopisane przez ops/cron-sync.sh $(date +%F)"; cat "$add"; } | crontab -
echo "Dopisane. Kopia poprzedniego crontaba: $W/crontab.bak-*"
