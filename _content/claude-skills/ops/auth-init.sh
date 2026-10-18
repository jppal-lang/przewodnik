#!/bin/sh
# Quolino — uruchomienie kont (GoTrue) na VPS. Root. Powtarzalne: nic nie psuje przy drugim uruchomieniu.
#   sh /root/quolino-web/ops/auth-init.sh
# Wymaga: secrets/smtp.env (Brevo; JP wpisał 2026-10-17), rekordu DNS auth.quolino.com (OVH, jest).
# Co robi: sekret JWT i hasło bazy (raz, w .env) → rola „postgres” bez logowania (wymagają jej migracje GoTrue) →
#          rola supabase_auth_admin + schemat „auth” w bazie quolino → secrets/gotrue.env → start kontenera → test /health.
# Żadnych sekretów na ekranie, w repo ani na Discordzie.
set -eu
W=/root/quolino-web
PG=postgresql-5bap-postgresql-1
cd "$W"; umask 077
touch .env; chmod 600 .env
rnd() { openssl rand -hex "${1:-24}"; }
getenv() { grep -E "^$1=" .env | tail -1 | cut -d= -f2-; }
setenv() { [ -n "$(getenv "$1")" ] || printf '%s=%s\n' "$1" "$2" >> .env; }
pgq() { docker exec -i "$PG" sh -c 'psql -U "$POSTGRES_USER" -v ON_ERROR_STOP=1 -q -At "$@"' sh "$@"; }
[ -f secrets/smtp.env ] || { echo "Brak secrets/smtp.env (dane SMTP Brevo) — przerwane."; exit 1; }
smtp() { grep -E "^$1=" secrets/smtp.env | tail -1 | cut -d= -f2-; }

setenv AUTH_JWT_SECRET "$(rnd 32)"; setenv AUTH_DB_PASSWORD "$(rnd 24)"
DBPW=$(getenv AUTH_DB_PASSWORD)

# role i schemat (hasło przez zmienną psql, nie w poleceniu)
pgq -d postgres <<'SQL'
DO $$BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN CREATE ROLE postgres NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN CREATE ROLE supabase_auth_admin LOGIN NOINHERIT; END IF;
END$$;
SQL
printf "ALTER ROLE supabase_auth_admin PASSWORD :'pw';\n" | pgq -d postgres -v pw="$DBPW"
pgq -d quolino <<'SQL'
GRANT CONNECT ON DATABASE quolino TO supabase_auth_admin;
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
ALTER ROLE supabase_auth_admin SET search_path = auth;
SQL

mkdir -p secrets; chmod 700 secrets
{
  printf 'DATABASE_URL=postgres://supabase_auth_admin:%s@%s:5432/quolino?search_path=auth\n' "$DBPW" "$PG"
  printf 'GOTRUE_JWT_SECRET=%s\n' "$(getenv AUTH_JWT_SECRET)"
  printf 'GOTRUE_SMTP_HOST=%s\nGOTRUE_SMTP_PORT=%s\nGOTRUE_SMTP_USER=%s\nGOTRUE_SMTP_PASS=%s\n' \
    "$(smtp SMTP_HOST)" "$(smtp SMTP_PORT)" "$(smtp SMTP_USER)" "$(smtp SMTP_PASS)"
  printf 'GOTRUE_SMTP_ADMIN_EMAIL=%s\nGOTRUE_SMTP_SENDER_NAME=%s\n' "$(smtp SMTP_ADMIN_EMAIL)" "$(smtp SMTP_SENDER_NAME)"
} > secrets/gotrue.env
chmod 600 secrets/gotrue.env

docker compose -f "$W/ops/auth-compose.yml" up -d --force-recreate --remove-orphans
printf 'Czekam na GoTrue'
i=0; until docker exec quolino-auth-gotrue-1 wget -qO- http://127.0.0.1:9999/health >/dev/null 2>&1; do
  i=$((i+1)); [ $i -lt 40 ] || { echo; echo "GoTrue nie wstał. Ostatnie logi:"; docker logs --tail 15 quolino-auth-gotrue-1 2>&1 | cut -c1-300; exit 1; }
  printf '.'; sleep 3
done
echo " OK"
echo "Tabele kont: $(echo "SELECT count(*) FROM information_schema.tables WHERE table_schema='auth'" | pgq -d quolino)"
sleep 20
echo "Z zewnątrz: $(curl -s -o /dev/null -w "%{http_code}" https://auth.quolino.com/auth/v1/health) (200 = działa)"
echo "Bramka rejestracji: $(curl -s -o /dev/null -w "%{http_code}" -X POST -H "content-type: application/json" -d "{}" https://auth.quolino.com/auth/v1/signup) (400 = działa i odrzuca bez weryfikacji)"
