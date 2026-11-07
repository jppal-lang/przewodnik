#!/bin/sh
# Quolino — e-maile z panelu (JP 2026-11-07): odpowiedzi na tickety + wiadomości do list (kampanie). Cron roota co 2 min.
# Kolejka: ops.ticket_mail (dopisuje admin.ticket_reply, gdy JP odpowiada w panelu). Wysyłka: SMTP Brevo z secrets/smtp.env
# (te same dane co GoTrue; nic tajnego w repo). Najwyżej 20 maili na przebieg, 5 prób na mail. W logu tylko numery wpisów.
#   sh /root/quolino-web/ops/ticket-mail.sh          — wyślij zaległe
#   sh /root/quolino-web/ops/ticket-mail.sh --check  — tylko policz
set -eu
# jeden przebieg naraz (cron co 2 min, przebieg może trwać dłużej) — bez tego ten sam mail wychodził dwa razy
exec 9>/tmp/quolino-ticket-mail.lock
flock -n 9 || exit 0
cd /root/quolino-web
PG=postgresql-5bap-postgresql-1
pgq() { docker exec -i "$PG" sh -c 'psql -U "$POSTGRES_USER" -d quolino -v ON_ERROR_STOP=1 -q -At'; }
[ -f secrets/smtp.env ] || exit 0
smtp() { grep -E "^$1=" secrets/smtp.env | tail -1 | cut -d= -f2-; }
HOST=$(smtp SMTP_HOST); PORT=$(smtp SMTP_PORT); USER=$(smtp SMTP_USER); PASS=$(smtp SMTP_PASS)
FROM=$(smtp SMTP_ADMIN_EMAIL); NAME=$(smtp SMTP_SENDER_NAME); [ -n "$NAME" ] || NAME=Quolino
[ -n "$HOST" ] && [ -n "$FROM" ] || exit 0
echo "SELECT 1 FROM ops.ticket_mail LIMIT 1;" | pgq >/dev/null 2>&1 || exit 0   # tabela jeszcze nie wdrożona
if [ "${1:-}" = --check ]; then echo "W kolejce: tickety $(echo "SELECT count(*) FROM ops.ticket_mail WHERE sent_at IS NULL AND tries < 5;" | pgq), wiadomości $(echo "SELECT count(*) FROM ops.campaign_mail WHERE sent_at IS NULL AND tries < 5;" | pgq 2>/dev/null || echo 0)"; exit 0; fi

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
# hasło SMTP w pliku (0600), nie w argumentach curl (widać je w ps)
( umask 077; printf 'machine %s login %s password %s\n' "$HOST" "$USER" "$PASS" > "$TMP/netrc" )
RE='^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$'
ok=0; bad=0
# send <tabela> <limit>: jedna linia na mail: id <TAB> adres <TAB> cała wiadomość RFC 5322 w base64 (treść UTF-8, temat RFC 2047)
send() {
  tbl=$1; lim=$2; extra=${3:-"''"}; [ "$lim" -gt 0 ] 2>/dev/null || return 0
  # zły adres (np. literówka bez domeny) od razu do błędów — inaczej kampania wisiała w „wysyłanie” na zawsze
  echo "UPDATE ops.$tbl SET tries = 5, error = 'zły adres' WHERE sent_at IS NULL AND tries < 5 AND to_email !~ '$RE';" | pgq || true
  echo "SELECT id || E'\t' || to_email || E'\t' || replace(encode(convert_to(
        'From: =?UTF-8?B?' || encode(convert_to(:'name', 'UTF8'), 'base64') || '?= <' || :'from' || '>' || E'\r\n' ||
        'To: <' || to_email || '>' || E'\r\n' ||
        'Subject: ' || (SELECT string_agg('=?UTF-8?B?' || encode(convert_to(m[1], 'UTF8'), 'base64') || '?=', E'\r\n ') FROM regexp_matches(subject, '.{1,10}', 'g') AS m) || E'\r\n' ||
        $extra ||
        'Date: ' || to_char(now() AT TIME ZONE 'UTC', 'Dy, DD Mon YYYY HH24:MI:SS') || ' +0000' || E'\r\n' ||
        'Message-ID: <$tbl-' || id || '-' || extract(epoch FROM created_at)::bigint || '@quolino.com>' || E'\r\n' ||
        'MIME-Version: 1.0' || E'\r\n' || 'Content-Type: text/plain; charset=UTF-8' || E'\r\n' || 'Content-Transfer-Encoding: base64' || E'\r\n' || E'\r\n' ||
        replace(encode(convert_to(body, 'UTF8'), 'base64'), E'\n', E'\r\n'), 'UTF8'), 'base64'), E'\n', '')
      FROM ops.$tbl WHERE sent_at IS NULL AND tries < 5 AND to_email ~ '$RE'
      ORDER BY id LIMIT $lim;" | docker exec -i "$PG" sh -c 'psql -U "$POSTGRES_USER" -d quolino -v ON_ERROR_STOP=1 -q -At -v name="$1" -v from="$2"' sh "$NAME" "$FROM" > "$TMP/q"
  while IFS="$(printf '\t')" read -r id to msg; do
    [ -n "$id" ] || continue
    printf '%s' "$msg" | base64 -d > "$TMP/m"
    if curl -sS --max-time 30 --ssl-reqd --url "smtp://$HOST:${PORT:-587}" --netrc-file "$TMP/netrc" \
         --mail-from "$FROM" --mail-rcpt "$to" --upload-file "$TMP/m" > "$TMP/e" 2>&1; then
      echo "UPDATE ops.$tbl SET sent_at = now(), tries = tries + 1, error = NULL WHERE id = $id;" | pgq || true; ok=$((ok + 1))
    else
      err=$(head -c 200 "$TMP/e" | LC_ALL=C tr -cd ' -&(-~')   # tylko drukowalne ASCII bez apostrofu — ucięty polski znak blokował kolejkę
      echo "UPDATE ops.$tbl SET tries = tries + 1, error = '$err' WHERE id = $id;" | pgq || true; bad=$((bad + 1))
    fi
  done < "$TMP/q"
}
send ticket_mail 20
# wiadomości do list (kampanie z panelu): w dziennym limicie (ustawienie campaign_daily_max), po skończeniu kampania = „sent”
if echo "SELECT 1 FROM ops.campaign_mail LIMIT 1;" | pgq >/dev/null 2>&1; then
  left=$(echo "SELECT greatest(0, coalesce((SELECT value::int FROM ops.app_settings WHERE name = 'campaign_daily_max'), 200)
          - (SELECT count(*) FROM ops.campaign_mail WHERE sent_at > date_trunc('day', now())))::int;" | pgq)
  [ "${left:-0}" -gt 20 ] && left=20
  send campaign_mail "${left:-0}" "CASE WHEN unsub IS NOT NULL THEN 'List-Unsubscribe: <https://quolino.com/wypisz.html?t=' || unsub || '>' || E'\\r\\n' ELSE '' END"
  echo "UPDATE ops.campaigns c SET status = 'sent', updated_at = now() WHERE status = 'sending'
          AND NOT EXISTS (SELECT 1 FROM ops.campaign_mail m WHERE m.campaign_id = c.id AND m.sent_at IS NULL AND m.tries < 5);" | pgq
fi
[ $((ok + bad)) = 0 ] || echo "$(date -u '+%F %T UTC') mail: wysłane $ok, błędy $bad"
