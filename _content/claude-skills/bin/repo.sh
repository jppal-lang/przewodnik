#!/bin/sh
# Hermes — zmiany w repo Quolino (strona, skrypty, SQL, instrukcje) bez komputera JP.
# Repo: /opt/data/repo/przewodnik (klon GitHub). Po „publish” VPS sam wdraża zmiany w ciągu ~3 minut:
#   strona → od razu (synchronizacja), _content/claude-skills → install.sh (skrypty, instrukcje, ops, SSR), nowe pliki sql/ → baza.
#   sh repo.sh status | pull | diff | publish "opis zmiany" | deployed | discard
set -e
R=/opt/data/repo/przewodnik
export HOME=/opt/data/home
cd "$R"
git_pull() { git pull -q --rebase --autostash origin main; }
case "$1" in
  status)   git fetch -q origin; git status -sb | head -40; git log --oneline -5 ;;
  pull)     git_pull; git log --oneline -1 ;;
  diff)     git status -s | head -60; git diff | head -400 ;;
  publish)
    shift; msg="$*"
    [ -n "$msg" ] || { echo 'Podaj opis: sh repo.sh publish "co i dlaczego"'; exit 1; }
    git add -A
    if git diff --cached --quiet; then echo "Brak zmian do wysłania."; exit 0; fi
    # składnia skryptów przed wysłaniem — błąd zatrzymuje publikację
    for f in $(git diff --cached --name-only --diff-filter=AM | grep -E '\.(mjs|js)$' || true); do
      node --check "$f" || { echo "BŁĄD składni: $f — nic nie wysłano"; git reset -q; exit 1; }
    done
    for f in $(git diff --cached --name-only --diff-filter=AM | grep -E '\.sh$' || true); do
      sh -n "$f" || { echo "BŁĄD składni: $f — nic nie wysłano"; git reset -q; exit 1; }
    done
    git diff --cached --stat | tail -15
    git commit -q -m "Hermes: $msg"
    i=0
    until git_pull && git push -q origin HEAD:main; do
      i=$((i+1)); [ $i -ge 3 ] && { echo "BŁĄD: nie udało się wysłać (konflikt?) — sprawdź: sh repo.sh status"; exit 1; }
      sleep 5
    done
    echo "Wysłano: $(git log --oneline -1). VPS wdroży w ciągu ~3 min (sprawdź: sh repo.sh deployed)." ;;
  deployed) cat /opt/data/quolino/work/deployed.txt 2>/dev/null || echo "Brak informacji o wdrożeniu."; echo "Repo: $(git log --oneline -1 origin/main)" ;;
  discard)  git fetch -q origin; git reset -q --hard origin/main; git clean -qfd; echo "Lokalne zmiany odrzucone: $(git log --oneline -1)" ;;
  *) echo 'sh repo.sh status | pull | diff | publish "opis" | deployed | discard'; exit 1 ;;
esac
# test wdrozenia 2026-10-11
