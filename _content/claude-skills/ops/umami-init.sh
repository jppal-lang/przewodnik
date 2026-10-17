#!/bin/sh
# Quolino — jednorazowe uruchomienie Umami (root na VPS). Powtarzalne: nic nie nadpisuje, co już istnieje.
#   1. sh /root/quolino-web/ops/deploy.sh approve <hash>
#   2. docker compose -f /root/quolino-web/ops/umami-compose.yml up -d
#   3. sh /root/quolino-web/ops/umami-init.sh
# Co robi: hasła w .env → baza i rola „umami” w PostgreSQL → start kontenera → hasło admina Umami (plik, nie ekran) →
#          witryna „Quolino” z ID z stats.js i tokenem odczytu → dopisanie UMAMI_* do .env Hermesa → kopia klucza GSC do prywatnego woluminu Hermesa.
# Żadnych sekretów w repo, w logu ani na Discordzie.
set -eu
W=/root/quolino-web
PG=postgresql-5bap-postgresql-1
H=hermes-quolino-hermes-agent-1
SITE_ID=8cf93dc3-4c4e-4218-a485-43a0c3d64c41          # musi być taki sam jak WEBSITE_ID w stats.js
GSC_KEY=$W/secrets/gsc-reader.json
cd "$W"; umask 077
touch .env; chmod 600 .env
rnd() { openssl rand -hex "${1:-24}"; }
getenv() { grep -E "^$1=" .env | tail -1 | cut -d= -f2-; }
setenv() { [ -n "$(getenv "$1")" ] || printf '%s=%s\n' "$1" "$2" >> .env; }
pgq() { docker exec -i "$PG" sh -c 'psql -U "$POSTGRES_USER" -v ON_ERROR_STOP=1 -q -At "$@"' sh "$@"; }

UC="docker compose -f $W/ops/umami-compose.yml"

setenv UMAMI_DB_PASSWORD "$(rnd 24)"; setenv UMAMI_APP_SECRET "$(rnd 32)"
DBPW=$(getenv UMAMI_DB_PASSWORD)
mkdir -p secrets; chmod 700 secrets
printf 'DATABASE_URL=postgresql://umami:%s@%s:5432/umami\nAPP_SECRET=%s\n' "$DBPW" "$PG" "$(getenv UMAMI_APP_SECRET)" > secrets/umami.env; chmod 600 secrets/umami.env

# baza i rola (hasło przez zmienną psql, nie w poleceniu)
if [ "$(echo "SELECT 1 FROM pg_roles WHERE rolname='umami'" | pgq -d postgres)" != 1 ]; then
  printf "CREATE ROLE umami LOGIN PASSWORD :'pw';\n" | pgq -d postgres -v pw="$DBPW"
else
  printf "ALTER ROLE umami PASSWORD :'pw';\n" | pgq -d postgres -v pw="$DBPW"
fi
[ "$(echo "SELECT 1 FROM pg_database WHERE datname='umami'" | pgq -d postgres)" = 1 ] || echo "CREATE DATABASE umami OWNER umami;" | pgq -d postgres
echo "REVOKE ALL ON DATABASE umami FROM PUBLIC;" | pgq -d postgres

$UC up -d --force-recreate umami
echo -n "Czekam na migracje Umami"
i=0; until echo "SELECT 1 FROM \"user\" WHERE username='admin'" | pgq -d umami 2>/dev/null | grep -q 1; do
  i=$((i+1)); [ $i -gt 60 ] && { echo; echo "Umami nie wstało w 5 min: $UC logs umami"; exit 1; }
  echo -n .; sleep 5
done; echo " ok"

hash() { $UC exec -T umami node -e 'console.log(require("bcryptjs").hashSync(process.argv[1],10))' "$1"; }

# hasło admina — tylko raz; zapis do pliku (chmod 600), nie na ekran
mkdir -p secrets; chmod 700 secrets
if [ ! -f secrets/umami-admin.txt ]; then
  AP=$(rnd 12); AH=$(hash "$AP")
  printf "UPDATE \"user\" SET password=:'h' WHERE username='admin';\n" | pgq -d umami -v h="$AH"
  printf 'https://stats.quolino.com\nlogin: admin\nhasło: %s\n' "$AP" > secrets/umami-admin.txt; chmod 600 secrets/umami-admin.txt
  echo "Hasło admina Umami: $W/secrets/umami-admin.txt (po pierwszym logowaniu zmień je w panelu)"
fi

# witryna z ustalonym ID + token tylko do odczytu (share_id) dla raportu Hermesa
SHARE=$(getenv UMAMI_SHARE_ID); [ -n "$SHARE" ] || { SHARE=$(rnd 12); printf 'UMAMI_SHARE_ID=%s\n' "$SHARE" >> .env; }
cat <<SQL | pgq -d umami -v sid="$SITE_ID" -v share="$SHARE"
INSERT INTO website (website_id, name, domain, share_id, user_id, created_by)
SELECT :'sid'::uuid, 'Quolino', 'quolino.com', :'share', user_id, user_id FROM "user" WHERE username='admin'
ON CONFLICT (website_id) DO UPDATE SET share_id = EXCLUDED.share_id, deleted_at = NULL;
SQL

# Hermes: adres i token odczytu (bez hasła admina)
for kv in "UMAMI_URL=https://stats.quolino.com" "UMAMI_SHARE_ID=$SHARE" "UMAMI_WEBSITE_ID=$SITE_ID"; do
  k=${kv%%=*}
  docker exec -u hermes "$H" sh -c "grep -q '^$k=' /opt/data/.env || printf '%s\n' '$kv' >> /opt/data/.env"
done

# Search Console: klucz konta serwisowego (tylko odczyt) do prywatnego katalogu Hermesa — raport czyta go stamtąd
if [ -f "$GSC_KEY" ]; then
  docker exec -i -u hermes "$H" sh -c 'umask 077; mkdir -p /opt/data/secrets && cat > /opt/data/secrets/gsc-reader.json' < "$GSC_KEY"
  echo "Klucz GSC skopiowany do /opt/data/secrets/gsc-reader.json (kontener Hermesa, chmod 600)"
else
  echo "Brak $GSC_KEY — raport pominie Search Console"
fi

echo "Gotowe. Test: curl -sI https://quolino.com/m.js | head -1   (200) oraz https://stats.quolino.com"
