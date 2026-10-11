#!/bin/sh
# Instalacja na VPS (root) z repo strony:  sh /var/lib/docker/volumes/quolino-web_site/_data/_content/claude-skills/install.sh
#   1) umiejętności Claude + skrypty Hermesa   2) instrukcja Hermesa   3) ops (kopie, czuwanie) i serwis stron (SSR)
# SQL i crontab — osobno (README.md), bo wymagają decyzji przy pierwszym wdrożeniu.
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
H="$(docker ps --format '{{.Names}}' | grep -m1 'hermes-quolino.*agent')"
[ -n "$H" ] || { echo "Nie znalazłem kontenera Hermesa"; exit 1; }
for s in quolino-trip-writing quolino-trip-translate; do
  docker exec "$H" mkdir -p /opt/data/home/.claude/skills/$s/scripts
  docker cp "$SRC/$s/." "$H:/opt/data/home/.claude/skills/$s/"
done
docker exec "$H" mkdir -p /opt/data/quolino/work/drafts
for f in "$SRC"/bin/*.mjs; do docker cp "$f" "$H:/opt/data/quolino/$(basename "$f")"; done
docker exec "$H" sh -c 'U=$(stat -c %u:%g /opt/data/quolino/qdb.mjs); chown -R $U /opt/data/home/.claude/skills /opt/data/quolino/*.mjs /opt/data/quolino/work 2>/dev/null; cd /opt/data/quolino && for f in lib.mjs draft-lib.mjs quality-lib.mjs trip-*.mjs gastro-refresh.mjs links-check.mjs reports-relay.mjs cost-report.mjs; do node --check $f || exit 1; done && echo "skrypty Hermesa: OK"'

# sekcja w instrukcji Hermesa (podmiana między znacznikami)
docker cp "$SRC/hermes/trips-section.md" "$H:/tmp/trips-section.md"
docker exec -i "$H" python3 - <<'PY'
import re
p = '/opt/data/skills/quolino/SKILL.md'
s = open(p, encoding='utf-8').read()
sec = open('/tmp/trips-section.md', encoding='utf-8').read().strip()
pat = re.compile(r'<!-- quolino-trips:start -->.*?<!-- quolino-trips:end -->', re.S)
s = pat.sub(lambda m: sec, s) if pat.search(s) else s.rstrip() + '\n\n' + sec + '\n'
open(p, 'w', encoding='utf-8').write(s)
print('instrukcja Hermesa: OK')
PY

# ops i serwis stron
mkdir -p /root/quolino-web/ops /root/quolino-web/ssr
cp "$SRC"/ops/*.sh /root/quolino-web/ops/ && chmod +x /root/quolino-web/ops/*.sh
cp "$SRC/ssr/server.mjs" /root/quolino-web/ssr/server.mjs
echo "ops i SSR skopiowane — dalej: SQL, docker-compose (ssr), crontab (README.md)"
