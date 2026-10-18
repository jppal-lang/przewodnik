#!/bin/sh
# Quolino — przepisuje sekrety potrzebne funkcjom bazy do ops.app_secrets (root). Powtarzalne.
#   sh /root/quolino-web/ops/app-secrets.sh
# gotrue_jwt = AUTH_JWT_SECRET z /root/quolino-web/.env (ten sam, którym GoTrue podpisuje tokeny logowania);
# używa go public.trip_member (sql/2026-10-18-trip-member.sql). Sekret nie pojawia się na ekranie ani w repo.
set -eu
W=/root/quolino-web
PG=postgresql-5bap-postgresql-1
pgq() { docker exec -i "$PG" sh -c 'psql -U "$POSTGRES_USER" -d quolino -v ON_ERROR_STOP=1 -q -At "$@"' sh "$@"; }
S=$(grep -E '^AUTH_JWT_SECRET=' "$W/.env" | tail -1 | cut -d= -f2-)
[ -n "$S" ] || { echo "Brak AUTH_JWT_SECRET w .env (najpierw ops/auth-init.sh)."; exit 1; }
[ "$(echo "SELECT to_regclass('ops.app_secrets') IS NOT NULL;" | pgq)" = t ] || { echo "Brak tabeli ops.app_secrets (najpierw approve SQL 2026-10-18-trip-member.sql)."; exit 1; }
printf "INSERT INTO ops.app_secrets (name, value) VALUES ('gotrue_jwt', :'s') ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, updated_at = now();\n" | pgq -v s="$S"
echo "Sekret logowania w bazie: OK"
