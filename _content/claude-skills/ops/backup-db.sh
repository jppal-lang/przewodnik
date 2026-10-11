#!/bin/sh
# Quolino — kopia bazy co noc (cron 03:41). Zrzut całej bazy quolino, 14 dni na VPS + kopia poza serwerem.
# Poza VPS: prywatne repo GitHub (BACKUP_GIT_REMOTE w /root/quolino-web/.env, klucz /root/quolino-web/keys/backup_key).
set -eu
DIR=/root/quolino-web/backups
PG=postgresql-5bap-postgresql-1
mkdir -p "$DIR"
. /root/quolino-web/.env 2>/dev/null || true
STAMP=$(date -u +%Y-%m-%d)
OUT="$DIR/quolino-$STAMP.sql.gz"
docker exec "$PG" sh -c 'pg_dump -U "$POSTGRES_USER" -d quolino --no-owner --format=plain' | gzip -9 > "$OUT.tmp"
# zrzut musi mieć sens: niepusty i z tabelą wersji
if [ "$(gzip -dc "$OUT.tmp" | grep -c 'city_versions')" -lt 1 ]; then
  rm -f "$OUT.tmp"; echo "BŁĄD: pusty zrzut" >&2; exit 1
fi
mv "$OUT.tmp" "$OUT"
find "$DIR" -name 'quolino-*.sql.gz' -mtime +14 -delete
echo "kopia: $OUT ($(du -h "$OUT" | cut -f1))"

# kopia poza VPS (gdy skonfigurowana): repo z jednym plikiem „latest” + historia w commitach
if [ -n "${BACKUP_GIT_REMOTE:-}" ] && [ -f /root/quolino-web/keys/backup_key ]; then
  R=/root/quolino-web/backup-repo
  export GIT_SSH_COMMAND="ssh -i /root/quolino-web/keys/backup_key -o StrictHostKeyChecking=accept-new"
  [ -d "$R/.git" ] || git clone -q "$BACKUP_GIT_REMOTE" "$R" || { mkdir -p "$R" && git -C "$R" init -q && git -C "$R" remote add origin "$BACKUP_GIT_REMOTE"; }
  cp "$OUT" "$R/quolino-latest.sql.gz"
  git -C "$R" add quolino-latest.sql.gz
  git -C "$R" -c user.name="quolino-backup" -c user.email="backup@questini.com" commit -q -m "kopia $STAMP" || true
  git -C "$R" push -q origin HEAD:main && echo "wysłano poza VPS"
fi
