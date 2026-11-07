#!/bin/sh
# Quolino — e-maile z odpowiedziami na tickety (JP 2026-11-07). Cron roota co 2 min.
# Kolejka: ops.ticket_mail (dopisuje admin.ticket_reply, gdy JP odpowiada w panelu). Wysyłka: SMTP Brevo z secrets/smtp.env
# (te same dane co GoTrue; nic tajnego w repo). Najwyżej 20 maili na przebieg, 5 prób na mail. W logu tylko numery wpisów.
#   sh /root/quolino-web/ops/ticket-mail.sh          — wyślij zaległe
#   sh /root/quolino-web/ops/ticket-mail.sh --check  — tylko policz
set -eu
cd /root/quolino-web
PG=postgresql-5bap-postgresql-1
pgq() { docker exec -i "$PG" sh -c 'psql -U "$POSTGRES_USER" -d quolino -v ON_ERROR_STOP=1 -q -At'; }
[ -f secrets/smtp.env ] || exit 0
smtp() { grep -E "^$1=" secrets/smtp.env | tail -1 | cut -d= -f2-; }
HOST=$(smtp SMTP_HOST); PORT=$(smtp SMTP_PORT); USER=$(smtp SMTP_USER); PASS=$(smtp SMTP_PASS)
FROM=$(smtp SMTP_ADMIN_EMAIL); NAME=$(smtp SMTP_SENDER_NAME); [ -n "$NAME" ] || NAME=Quolino
[ -n "$HOST" ] && [ -n "$FROM" ] || exit 0
echo "SELECT 1 FROM ops.ticket_mail LIMIT 1;" | pgq >/dev/null 2>&1 || exit 0   # tabela jeszcze nie wdrożona
if [ "${1:-}" = --check ]; then echo "W kolejce: $(echo "SELECT count(*) FROM ops.ticket_mail WHERE sent_at IS NULL AND tries < 5;" | pgq)"; exit 0; fi

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
# jedna linia na mail: id <TAB> adres <TAB> cała wiadomość RFC 5322 w base64 (treść UTF-8, temat zakodowany wg RFC 2047)
echo "SELECT id || E'\t' || to_email || E'\t' || replace(encode(convert_to(
        'From: =?UTF-8?B?' || encode(convert_to(:'name', 'UTF8'), 'base64') || '?= <' || :'from' || '>' || E'\r\n' ||
        'To: <' || to_email || '>' || E'\r\n' ||
        'Subject: =?UTF-8?B?' || replace(encode(convert_to(subject, 'UTF8'), 'base64'), E'\n', '') || '?=' || E'\r\n' ||
        'Date: ' || to_char(now() AT TIME ZONE 'UTC', 'Dy, DD Mon YYYY HH24:MI:SS') || ' +0000' || E'\r\n' ||
        'Message-ID: <ticket-' || id || '-' || extract(epoch FROM created_at)::bigint || '@quolino.com>' || E'\r\n' ||
        'MIME-Version: 1.0' || E'\r\n' || 'Content-Type: text/plain; charset=UTF-8' || E'\r\n' || 'Content-Transfer-Encoding: base64' || E'\r\n' || E'\r\n' ||
        encode(convert_to(body, 'UTF8'), 'base64'), 'UTF8'), 'base64'), E'\n', '')
      FROM ops.ticket_mail WHERE sent_at IS NULL AND tries < 5 AND to_email ~ '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$'
      ORDER BY id LIMIT 20;" | docker exec -i "$PG" sh -c 'psql -U "$POSTGRES_USER" -d quolino -v ON_ERROR_STOP=1 -q -At -v name="$1" -v from="$2"' sh "$NAME" "$FROM" > "$TMP/q"
ok=0; bad=0
while IFS="$(printf '\t')" read -r id to msg; do
  [ -n "$id" ] || continue
  printf '%s' "$msg" | base64 -d > "$TMP/m"
  if curl -sS --max-time 30 --ssl-reqd --url "smtp://$HOST:${PORT:-587}" --user "$USER:$PASS" \
       --mail-from "$FROM" --mail-rcpt "$to" --upload-file "$TMP/m" > "$TMP/e" 2>&1; then
    echo "UPDATE ops.ticket_mail SET sent_at = now(), tries = tries + 1, error = NULL WHERE id = $id;" | pgq; ok=$((ok + 1))
  else
    err=$(head -c 200 "$TMP/e" | tr -d "'\r\n")
    echo "UPDATE ops.ticket_mail SET tries = tries + 1, error = '$err' WHERE id = $id;" | pgq; bad=$((bad + 1))
  fi
done < "$TMP/q"
[ $((ok + bad)) = 0 ] || echo "$(date -u '+%F %T UTC') ticket-mail: wysłane $ok, błędy $bad"
