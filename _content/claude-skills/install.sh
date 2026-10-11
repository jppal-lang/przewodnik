#!/bin/sh
# Instalacja na VPS (root) z repo strony:  sh /var/lib/docker/volumes/quolino-web_site/_data/_content/claude-skills/install.sh
#   1) umiejętności Claude + skrypty Hermesa   2) instrukcja Hermesa   3) ops (kopie, czuwanie) i serwis stron (SSR)
# Uruchamiane przez ops/deploy.sh approve <hash> (zgoda JP) albo ręcznie przez roota.
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
H="$(docker ps --format '{{.Names}}' | grep -m1 'hermes-quolino.*agent')"
[ -n "$H" ] || { echo "Nie znalazłem kontenera Hermesa"; exit 1; }
for s in $(cd "$SRC" && ls -d quolino-trip-*/ | tr -d /); do
  docker exec "$H" mkdir -p /opt/data/home/.claude/skills/$s/scripts
  docker cp "$SRC/$s/." "$H:/opt/data/home/.claude/skills/$s/"
done
docker exec "$H" mkdir -p /opt/data/quolino/work/drafts
for f in "$SRC"/bin/*.mjs; do docker cp "$f" "$H:/opt/data/quolino/$(basename "$f")"; done
docker exec "$H" sh -c 'U=$(stat -c %u:%g /opt/data/quolino/qdb.mjs); chown -R $U /opt/data/home/.claude/skills /opt/data/quolino/*.mjs /opt/data/quolino/work 2>/dev/null; cd /opt/data/quolino && for f in lib.mjs draft-lib.mjs quality-lib.mjs trip-*.mjs gastro-refresh.mjs links-check.mjs reports-relay.mjs cost-report.mjs; do node --check $f || exit 1; done && echo "skrypty Hermesa: OK"'

# sekcje w instrukcji Hermesa: każdy hermes/*-section.md podmieniany między swoimi znacznikami <!-- nazwa:start/end -->
for sec in "$SRC"/hermes/*-section.md; do
  docker cp "$sec" "$H:/tmp/section.md"
  docker exec -i "$H" python3 - <<'PY'
import re
p = '/opt/data/skills/quolino/SKILL.md'
s = open(p, encoding='utf-8').read()
sec = open('/tmp/section.md', encoding='utf-8').read().strip()
name = re.match(r'<!-- (\S+):start -->', sec).group(1)
pat = re.compile(r'<!-- %s:start -->.*?<!-- %s:end -->' % (re.escape(name), re.escape(name)), re.S)
s = pat.sub(lambda m: sec, s) if pat.search(s) else s.rstrip() + '\n\n' + sec + '\n'
open(p, 'w', encoding='utf-8').write(s)
print('instrukcja Hermesa:', name, 'OK')
PY
done

# repo Hermesa: własny klon z kluczem wdrożeniowym (raz) + narzędzie repo.sh
U=$(docker exec "$H" stat -c %u:%g /opt/data/quolino/qdb.mjs)
docker cp "$SRC/bin/repo.sh" "$H:/opt/data/quolino/repo.sh"
docker exec "$H" sh -c "chown $U /opt/data/quolino/repo.sh && chmod 755 /opt/data/quolino/repo.sh"
if [ -f /root/quolino-web/keys/deploy_key ] && ! docker exec "$H" test -d /opt/data/repo/przewodnik/.git; then
  docker exec "$H" mkdir -p /opt/data/home/.ssh /opt/data/repo
  docker cp /root/quolino-web/keys/deploy_key "$H:/opt/data/home/.ssh/quolino_deploy"
  docker exec "$H" sh -c "chown -R $U /opt/data/home/.ssh /opt/data/repo && chmod 700 /opt/data/home/.ssh && chmod 600 /opt/data/home/.ssh/quolino_deploy"
  docker exec -u "$U" -e HOME=/opt/data/home "$H" sh -c '
    K="ssh -i /opt/data/home/.ssh/quolino_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
    GIT_SSH_COMMAND="$K" git clone -q git@github.com:jppal-lang/przewodnik.git /opt/data/repo/przewodnik &&
    cd /opt/data/repo/przewodnik && git config core.sshCommand "$K" &&
    git config user.name "Hermes" && git config user.email "hermes@questini.com" && git config pull.rebase true &&
    echo "repo Hermesa: sklonowane ($(git log --oneline -1))"'
fi

# ops i serwis stron
mkdir -p /root/quolino-web/ops /root/quolino-web/ssr
# kopia przez plik tymczasowy + mv: deploy.sh może właśnie działać z tego katalogu
for f in "$SRC"/ops/*.sh; do cp "$f" "/root/quolino-web/ops/.$(basename "$f").new" && chmod +x "/root/quolino-web/ops/.$(basename "$f").new" && mv -f "/root/quolino-web/ops/.$(basename "$f").new" "/root/quolino-web/ops/$(basename "$f")"; done
cmp -s "$SRC/ssr/server.mjs" /root/quolino-web/ssr/server.mjs || cp "$SRC/ssr/server.mjs" /root/quolino-web/ssr/server.mjs
# bramka panelu admina (jednorazowe linki z Discorda)
mkdir -p /root/quolino-web/gate
if ! cmp -s "$SRC/gate/admin-gate.mjs" /root/quolino-web/gate/admin-gate.mjs; then
  cp "$SRC/gate/admin-gate.mjs" /root/quolino-web/gate/admin-gate.mjs
  docker ps --format '{{.Names}}' | grep -q '^quolino-web-admin-gate-1$' && docker restart quolino-web-admin-gate-1 >/dev/null && echo "bramka admina: zrestartowana"
fi
echo "ops i SSR: OK"
