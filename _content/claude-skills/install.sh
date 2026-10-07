#!/bin/sh
# Instalacja umiejętności Claude i skryptów wycieczek w kontenerze Hermesa (uruchamiać na VPS jako root).
#   sh /var/lib/docker/volumes/quolino-web_site/_data/_content/claude-skills/install.sh
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
H="$(docker ps --format '{{.Names}}' | grep -m1 'hermes-quolino.*agent')"
[ -n "$H" ] || { echo "Nie znalazłem kontenera Hermesa"; exit 1; }
for s in quolino-trip-writing quolino-trip-translate; do
  docker exec "$H" mkdir -p /opt/data/home/.claude/skills/$s/scripts
  docker cp "$SRC/$s/." "$H:/opt/data/home/.claude/skills/$s/"
done
for f in lib.mjs trip-review.mjs trip-translate.mjs; do docker cp "$SRC/bin/$f" "$H:/opt/data/quolino/$f"; done
docker exec "$H" sh -c 'chown -R $(stat -c %u:%g /opt/data/quolino/qdb.mjs) /opt/data/home/.claude/skills /opt/data/quolino/lib.mjs /opt/data/quolino/trip-*.mjs 2>/dev/null; ls /opt/data/home/.claude/skills; node --check /opt/data/quolino/trip-translate.mjs && echo "umiejętności i skrypty zainstalowane"'

# sekcja w instrukcji Hermesa (podmiana między znacznikami, bez ruszania reszty)
docker cp "$SRC/hermes/trips-section.md" "$H:/tmp/trips-section.md"
docker exec "$H" python3 - <<'PY'
import re
p = '/opt/data/skills/quolino/SKILL.md'
s = open(p, encoding='utf-8').read()
sec = open('/tmp/trips-section.md', encoding='utf-8').read().strip()
pat = re.compile(r'<!-- quolino-trips:start -->.*?<!-- quolino-trips:end -->', re.S)
s = pat.sub(sec, s) if pat.search(s) else s.rstrip() + '\n\n' + sec + '\n'
open(p, 'w', encoding='utf-8').write(s)
print('instrukcja Hermesa zaktualizowana')
PY
