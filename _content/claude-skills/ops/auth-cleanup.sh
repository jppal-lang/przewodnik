#!/bin/sh
# Quolino — sprzątanie kont (cron roota co godzinę). Decyzja JP 2026-10-18:
#   konto NIEPOTWIERDZONE (nikt nie kliknął linku z maila) kasujemy po 48 godzinach.
# Kasowanie w auth.users usuwa kaskadowo tożsamości, sesje i tokeny GoTrue. Do logu trafia tylko liczba, bez adresów.
#   sh /root/quolino-web/ops/auth-cleanup.sh           — skasuj
#   sh /root/quolino-web/ops/auth-cleanup.sh --check   — tylko policz
set -eu
PG=postgresql-5bap-postgresql-1
pgq() { docker exec -i "$PG" sh -c 'psql -U "$POSTGRES_USER" -d quolino -v ON_ERROR_STOP=1 -q -At'; }
WHERE="email_confirmed_at IS NULL AND phone_confirmed_at IS NULL AND created_at < now() - interval '48 hours'"
if [ "${1:-}" = --check ]; then
  echo "Niepotwierdzone starsze niż 48 h: $(echo "SELECT count(*) FROM auth.users WHERE $WHERE;" | pgq)"; exit 0
fi
n=$(echo "WITH d AS (DELETE FROM auth.users WHERE $WHERE RETURNING 1) SELECT count(*) FROM d;" | pgq)
[ "$n" = 0 ] || echo "$(date -u '+%F %T UTC') skasowane niepotwierdzone konta: $n"
