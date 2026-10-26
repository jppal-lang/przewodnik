#!/bin/sh
# Wszystkie testy skryptów (bez npm, bez sieci, bez bazy): sh bin/test-all.sh
# Wymaga Node 22 i python3 (golden.test.mjs uruchamia scripts/validate_trip.py).
cd "$(dirname "$0")/.." || exit 1
exec node --test bin/*.test.mjs
