#!/bin/sh
# Quolino — wdrażanie z repo (cron roota co 2 min). Repo na VPS = katalog strony (synchronizacja z GitHub co 60 s).
# Tryb bezpieczny (decyzja JP 2026-10-11):
#   SAMO wchodzi: skrypty i instrukcje Hermesa (bin/*.mjs, bin/repo.sh, skille quolino-trip-*, hermes/*-section.md)
#                 — działają tylko w kontenerze Hermesa. Pliki strony są widoczne od razu (bez tego skryptu).
#   CZEKA NA ZGODĘ JP: wszystko, co działa jako root albo na bazie: ops/, cron/, ssr/, sql/, install.sh, inne pliki.
#   Zgoda JP (od 2026-10-30): przycisk „Zatwierdź i wdróż” w panelu admina (#/decyzje). Ten skrypt wpisuje prośbę do
#     ops.deploy_requests (pending: pliki, commity, diff), a gdy JP zatwierdzi (approved) — przy najbliższym przebiegu crona
#     robi dokładnie to samo co `approve <hash>` i zapisuje wynik (done/failed + ostatnie linie). Bez tabeli (przed SQL
#     2026-10-30-skrzynka-decyzji.sql) wszystko działa jak dawniej.
#   Awaryjnie (konsola, jak dotąd):
#   sh /root/quolino-web/ops/deploy.sh pending          — co czeka (pliki + zmiany)
#   sh /root/quolino-web/ops/deploy.sh approve <hash>   — wdróż to, co czeka (hash z komunikatu)
# SQL: każdy NOWY plik sql/*.sql wykonuje się raz (rejestr /root/quolino-web/.sql-applied), w całości albo wcale.
set -u
V=/var/lib/docker/volumes/quolino-web_site/_data
S=$V/_content/claude-skills
P=_content/claude-skills
W=/root/quolino-web
PG=postgresql-5bap-postgresql-1
H=hermes-quolino-hermes-agent-1
LEDGER=$W/.sql-applied
DEPLOYED=$W/.deployed      # ostatni commit wdrożony w części Hermesa
APPROVED=$W/.approved      # ostatni commit zatwierdzony przez JP (część roota)
ALERTED=$W/.pending-alerted
SAFE='^_content/claude-skills/(bin/[A-Za-z0-9._-]+\.mjs|bin/repo\.sh|quolino-trip-[A-Za-z0-9_-]+/.+|hermes/[A-Za-z0-9_-]+-section\.md|[A-Za-z0-9_-]+\.md)$'
exec 9>/tmp/quolino-deploy.lock; flock -n 9 || { echo "wdrożenie już trwa"; exit 0; }
. $W/.env 2>/dev/null || true
G() { git -c safe.directory='*' -C "$V" "$@"; }
post() { [ -n "${ALERT_WEBHOOK:-}" ] && curl -s -m 20 -H 'Content-Type: application/json' -d "{\"content\":$(printf '%s' "$1" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')}" "$ALERT_WEBHOOK" >/dev/null; return 0; }
tell_hermes() { printf '%s\n%s\n' "$(date -u '+%F %T UTC')" "$1" | docker exec -i -u hermes "$H" sh -c 'cat > /opt/data/quolino/work/deployed.txt' 2>/dev/null; }
HEAD=$(G rev-parse HEAD) || exit 1
short() { echo "$1" | cut -c1-8; }
root_files() { G diff --name-only "$1" "$2" -- "$P" | grep -Ev "$SAFE" || true; }

# ── skrzynka decyzji w panelu (ops.deploy_requests) ──
# Wartości idą do psql przez stdin jako base64 (alfabet bez cudzysłowów i średników) — treść commitów ani plików nie może
# wstrzyknąć SQL. id tylko cyfry, hash tylko [0-9a-f]{40} i zawsze sprawdzony przez git rev-parse; pliki tylko z repo.
PSQL() { docker exec -i "$PG" sh -c 'psql -U "$POSTGRES_USER" -d quolino -v ON_ERROR_STOP=1 -qtA' 2>/dev/null; }
lit() { printf "convert_from(decode('%s','base64'),'UTF8')" "$(base64 | tr -d '\n')"; }      # stdin → literał SQL
cut_utf8() { python3 -c 'import sys;b=sys.stdin.buffer.read();n=int(sys.argv[1]);sys.stdout.write(b[:n].decode("utf-8","ignore")+("\n… (ucięte)" if len(b)>n else ""))' "$1"; }
DR=""; NEWREQ=""
dr_on() { [ -n "$DR" ] || DR=$(echo "SELECT to_regclass('ops.deploy_requests') IS NOT NULL" | PSQL); [ "$DR" = t ]; }
dr_set() {   # id status wynik
  dr_on || return 0
  case "$1" in ''|*[!0-9]*) return 0 ;; esac
  case "$2" in running|done|failed|superseded) ;; *) return 0 ;; esac
  fin=", finished_at = now()"; [ "$2" = running ] && fin=""
  echo "UPDATE ops.deploy_requests SET status = '$2', result = $(printf '%s' "$3" | cut_utf8 4000 | lit), updated_at = now()$fin WHERE id = $1" | PSQL >/dev/null
}
dr_register() {   # $1 = pliki czekające na zgodę (od .approved do HEAD) → jeden wiersz pending na HEAD, starsze pending: superseded
  dr_on || return 0
  [ "$(echo "SELECT count(*) FROM ops.deploy_requests WHERE hash = '$HEAD'" | PSQL)" = 0 ] || return 0
  # prośba już czeka i od jej commita nie doszło nic wymagającego zgody (np. tylko strona albo skrypty Hermesa) → bez nowego wiersza
  last_h=$(echo "SELECT hash FROM ops.deploy_requests WHERE status IN ('pending', 'approved', 'running') ORDER BY id DESC LIMIT 1" | PSQL)
  if echo "$last_h" | grep -qE '^[0-9a-f]{40}$' && G rev-parse --verify -q "$last_h^{commit}" >/dev/null && [ -z "$(root_files "$last_h" "$HEAD")" ]; then return 0; fi
  a=$(cat "$APPROVED"); echo "$a" | grep -qE '^[0-9a-f]{40}$' || return 0
  files=$(printf '%s' "$1" | lit)
  summ=$(G log --format='%h %s' "$a..$HEAD" -- $1 | head -40 | cut_utf8 6000 | lit)
  diff=$(G diff "$a" "$HEAD" -- $1 | cut_utf8 200000 | lit)
  printf '%s\n' "BEGIN;" \
    "UPDATE ops.deploy_requests SET status = 'superseded', updated_at = now(), finished_at = now(), result = 'zastąpione nowszą prośbą ($(short "$HEAD"))' WHERE status = 'pending';" \
    "INSERT INTO ops.deploy_requests (hash, base, files, summary, diff) VALUES ('$HEAD', '$a', string_to_array($files, E'\\n'), $summ, $diff) ON CONFLICT (hash) DO NOTHING;" \
    "COMMIT;" | PSQL >/dev/null && { NEWREQ=1; echo "prośba o zgodę w panelu: $(short "$HEAD")"; }
}
dr_run_approved() {   # zatwierdzone w panelu → to samo co `approve <hash>` (najwyżej jedno na przebieg)
  dr_on || return 0
  row=$(echo "SELECT id || ' ' || hash FROM ops.deploy_requests WHERE status = 'approved' ORDER BY decided_at, id LIMIT 1" | PSQL)
  [ -n "$row" ] || return 0
  id=${row%% *}; h=${row#* }
  case "$id" in ''|*[!0-9]*) return 0 ;; esac
  echo "$h" | grep -qE '^[0-9a-f]{40}$' || { dr_set "$id" failed "zły hash"; return 0; }
  want=$(G rev-parse --verify -q "$h^{commit}") || { dr_set "$id" failed "Serwer nie zna commita $(short "$h")"; return 0; }
  if [ -n "$(root_files "$want" "$HEAD")" ]; then
    dr_set "$id" superseded "Od $(short "$want") doszły kolejne zmiany wymagające zgody — zatwierdź nowszą pozycję w panelu"; return 0
  fi
  if [ -z "$(root_files "$(cat "$APPROVED")" "$HEAD")" ]; then dr_set "$id" done "Nic już nie czekało — wdrożone wcześniej (np. konsolą)"; return 0; fi
  dr_set "$id" running "wdrażam $(short "$HEAD")…"
  plog=$W/.deploy-panel.log; pid_=$id
  do_approve "$want" > "$plog" 2>&1; rc=$?
  cat "$plog"
  if [ "$rc" = 0 ]; then dr_set "$pid_" done "$(tail -n 15 "$plog")"; else dr_set "$pid_" failed "$(tail -n 15 "$plog")"; fi
}

if [ ! -f "$DEPLOYED" ] || [ ! -f "$APPROVED" ]; then   # pierwszy raz: obecny stan uznajemy za wdrożony
  echo "$HEAD" > "$DEPLOYED"; echo "$HEAD" > "$APPROVED"
  [ -f "$LEDGER" ] || ls "$S/sql" 2>/dev/null | grep '\.sql$' > "$LEDGER"
  echo "start: $(short "$HEAD")"; exit 0
fi

# ── zatwierdzenie przez JP: pełne install.sh + nowe SQL (konsola: approve <hash>; panel: dr_run_approved) ──
# Kod wyjścia: 0 = wdrożone, 1 = nie wdrożone (nic nie zmieniono albo install.sh padł), 3 = wdrożone, ale któryś SQL się wycofał.
do_approve() {
  want=$(G rev-parse --verify -q "$1^{commit}") || { echo "Nie znam commita $1"; return 1; }
  if [ -n "$(root_files "$want" "$HEAD")" ]; then
    echo "Od $(short "$want") doszły kolejne zmiany wymagające zgody — sprawdź: deploy.sh pending"; return 1
  fi
  prev_ok=$(cat "$APPROVED" 2>/dev/null)
  ssr_before=$(md5sum $W/ssr/server.mjs 2>/dev/null | cut -d' ' -f1)
  sh "$S/install.sh" || { post "🔴 Wdrożenie $(short "$HEAD"): install.sh nie przeszedł"; echo "install.sh nie przeszedł"; return 1; }
  msg="✅ zatwierdzone i wdrożone: $(G log -1 --format='%h %s')"; sql_bad=0
  for f in $(ls "$S/sql" 2>/dev/null | grep '\.sql$' | sort); do
    grep -qxF "$f" "$LEDGER" && continue
    if r=$(docker exec -i "$PG" sh -c 'psql -U "$POSTGRES_USER" -d quolino -v ON_ERROR_STOP=1 -1 -q' < "$S/sql/$f" 2>&1); then
      echo "$f" >> "$LEDGER"; msg="$msg · SQL $f"; echo "SQL OK: $f"
    else
      sql_bad=1
      echo "SQL BŁĄD $f: $r"; msg="$msg · SQL $f BŁĄD (wycofany)"; post "🔴 SQL $f nie wszedł: $(echo "$r" | tail -2)"
    fi
  done
  docker exec "$PG" sh -c 'psql -U "$POSTGRES_USER" -d quolino -qc "NOTIFY pgrst, '"'"'reload schema'"'"'"' >/dev/null 2>&1
  # SSR: restart, gdy zmienił się plik serwera ALBO commity od ostatniego approve ruszały ssr/ (sam md5 nie wystarcza: plik mógł być
  # skopiowany wcześniej ręcznie, a kontener nadal ma stary kod). `up -d` stosuje też zmienione etykiety Traefika z compose.
  # Błędy NIE są wyciszane: trafiają do komunikatu i na alert.
  ssr_changed=0
  [ "$ssr_before" != "$(md5sum $W/ssr/server.mjs 2>/dev/null | cut -d' ' -f1)" ] && ssr_changed=1
  [ -n "$prev_ok" ] && [ -n "$(G diff --name-only "$prev_ok" "$HEAD" -- "$P/ssr" 2>/dev/null)" ] && ssr_changed=1
  if [ "$ssr_changed" = 1 ]; then
    if out=$(cd $W && docker compose up -d --no-deps ssr 2>&1 && docker compose restart ssr 2>&1); then
      msg="$msg · SSR zrestartowany"
    else
      msg="$msg · SSR NIE zrestartowany: $(echo "$out" | tail -1 | cut -c1-160)"
      post "🔴 Wdrożenie $(short "$HEAD"): restart SSR nie powiódł się: $(echo "$out" | tail -2 | tr '\n' ' ' | cut -c1-300)"
    fi
  fi
  echo "$HEAD" > "$APPROVED"; echo "$HEAD" > "$DEPLOYED"; rm -f "$ALERTED"
  # prośby w panelu objęte tym wdrożeniem (także zatwierdzone konsolą) — już nie czekają
  DR=""; dr_on && echo "UPDATE ops.deploy_requests SET status = 'done', result = 'wdrożone razem z $(short "$HEAD")', updated_at = now(), finished_at = now() WHERE status = 'pending'" | PSQL >/dev/null
  tell_hermes "$msg"; echo "$msg"
  [ "$sql_bad" = 0 ] || return 3
  return 0
}

if [ "${1:-}" = approve ]; then
  [ -n "${2:-}" ] || { echo "Podaj hash z komunikatu: deploy.sh approve <hash>"; exit 1; }
  do_approve "$2"; exit $?
fi

if [ "${1:-}" = pending ]; then
  a=$(cat "$APPROVED"); f=$(root_files "$a" "$HEAD")
  [ -z "$f" ] && { echo "Nic nie czeka na zgodę."; exit 0; }
  echo "Czeka na zgodę (od $(short "$a") do $(short "$HEAD")):"; echo "$f"; echo
  G log --format='%h %an: %s' "$a..$HEAD" -- $f | head -20; echo
  G diff "$a" "$HEAD" -- $f | head -300
  echo; echo "Zatwierdzenie: panel admina → Decyzje → „Zatwierdź i wdróż” albo sh $W/ops/deploy.sh approve $(short "$HEAD")"; exit 0
fi

# ── cron: najpierw decyzje z panelu (zatwierdzone wdrożenia), potem prośba o zgodę dla nowych zmian ──
dr_run_approved
root=$(root_files "$(cat "$APPROVED")" "$HEAD")
[ -n "$root" ] && dr_register "$root"

# ── cron: część Hermesa sama ──
last=$(cat "$DEPLOYED")
[ "$last" = "$HEAD" ] && exit 0
safe=$(G diff --name-only --diff-filter=AMR "$last" "$HEAD" -- "$P" | grep -E "$SAFE" | grep -Ev '^_content/claude-skills/[A-Za-z0-9_-]+\.md$|^_content/claude-skills/hermes/' || true)
secs=$(G diff --name-only --diff-filter=AMR "$last" "$HEAD" -- "$P/hermes" | grep -E "$SAFE" || true)
msg=""
if [ -n "$safe$secs" ]; then
  U=$(docker exec "$H" stat -c %u:%g /opt/data/quolino/qdb.mjs)
  for f in $safe; do
    rel=${f#$P/}
    case "$rel" in
      bin/*) dst=/opt/data/quolino/${rel#bin/} ;;
      quolino-trip-*) dst=/opt/data/home/.claude/skills/$rel ;;
      *) continue ;;
    esac
    [ -f "$V/$f" ] && [ ! -L "$V/$f" ] || continue
    docker exec "$H" mkdir -p "$(dirname "$dst")"
    docker cp "$V/$f" "$H:$dst" && docker exec "$H" chown "$U" "$dst"
  done
  docker exec "$H" chmod 755 /opt/data/quolino/repo.sh 2>/dev/null
  for f in $secs; do
    [ -f "$V/$f" ] && [ ! -L "$V/$f" ] || continue
    docker cp "$V/$f" "$H:/tmp/section.md"
    docker exec -i "$H" python3 - <<'PY'
import re
p = '/opt/data/skills/quolino/SKILL.md'
s = open(p, encoding='utf-8').read()
sec = open('/tmp/section.md', encoding='utf-8').read().strip()
m = re.match(r'<!-- (quolino-[a-z0-9-]+):start -->', sec)
if m and sec.endswith('<!-- %s:end -->' % m.group(1)):
    n = re.escape(m.group(1))
    pat = re.compile(r'<!-- %s:start -->.*?<!-- %s:end -->' % (n, n), re.S)
    s = pat.sub(lambda _: sec, s) if pat.search(s) else s.rstrip() + '\n\n' + sec + '\n'
    open(p, 'w', encoding='utf-8').write(s)
    print('instrukcja:', m.group(1))
PY
  done
  bad=$(docker exec -w /opt/data/quolino "$H" sh -c 'for f in *.mjs; do node --check "$f" >/dev/null 2>&1 || echo "$f"; done')
  msg="✅ Hermes: wdrożone $(G log -1 --format='%h %s')"
  [ -n "$bad" ] && { msg="$msg · ⚠️ błąd składni: $bad"; post "⚠️ Quolino: skrypty Hermesa z błędem składni: $bad"; }
fi
echo "$HEAD" > "$DEPLOYED"

root=$(root_files "$(cat "$APPROVED")" "$HEAD")
if [ -n "$root" ]; then
  wait="⏸ czeka na zgodę JP ($(echo "$root" | wc -l) plik.): $(echo "$root" | sed "s#^$P/##" | head -5 | tr '\n' ' ')— JP: panel admina → Decyzje → „Zatwierdź i wdróż” (awaryjnie: sh $W/ops/deploy.sh approve $(short "$HEAD"))"
  msg="${msg:+$msg
}$wait"
  # alert raz na prośbę: z panelem tylko przy nowej prośbie (kolejne commity strony nie powtarzają powiadomienia)
  if [ "$(cat "$ALERTED" 2>/dev/null)" != "$HEAD" ]; then
    { dr_on && [ -z "$NEWREQ" ]; } || post "$wait"
    echo "$HEAD" > "$ALERTED"
  fi
fi
[ -n "$msg" ] && { tell_hermes "$msg"; echo "$(date -u '+%F %T') $msg"; }
exit 0
