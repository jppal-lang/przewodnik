@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Questini - deploy

cd /d D:\PROGRAFIT\questini.com\przewodnik-full-repo\przewodnik
if errorlevel 1 goto :zlasciezka

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 goto :nierepo

for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "GALAZ=%%b"
if not "!GALAZ!"=="main" (
    echo.
    echo   UWAGA: jestes na galezi "!GALAZ!", a nie "main".
    set /p "DALEJ=  Kontynuowac? [t/N]: "
    if /i not "!DALEJ!"=="t" goto :przerwane
)

REM ---- opis zmian: argument > pytanie > data ----
set "MSG=%~1"
if "!MSG!"=="" set /p "MSG=Opis zmian (Enter = data i godzina): "
if "!MSG!"=="" set "MSG=deploy %DATE% %TIME:~0,5%"

echo.
echo === 1/4  Zmiany lokalne ===
git add -A
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "!MSG!"
    if errorlevel 1 goto :blad
    echo   Commit: !MSG!
) else (
    echo   Brak nowych zmian - nic do zacommitowania.
)

echo.
echo === 2/4  Pobieram z GitHuba ===
git pull --rebase
if errorlevel 1 goto :konflikt

echo.
echo === 3/4  Wysylam ===
git push
if errorlevel 1 goto :blad

echo.
echo === 4/4  GOTOWE - strona bedzie zaktualizowana za 1-2 minuty ===
echo.
git log --oneline -3
goto :koniec

:konflikt
echo.
echo   !!! KONFLIKT przy scalaniu ze zdalnym repo !!!
echo.
echo   Nic NIE zostalo wyslane. Masz dwie opcje:
echo     1. Rozwiaz konflikty w plikach, potem:  git add -A ^&^& git rebase --continue
echo     2. Cofnij scalanie:                     git rebase --abort
goto :koniec

:zlasciezka
echo.
echo   !!! Nie znalazlem katalogu repozytorium !!!
goto :koniec

:nierepo
echo.
echo   !!! To nie jest repozytorium git !!!
goto :koniec

:przerwane
echo.
echo   Przerwane na zyczenie.
goto :koniec

:blad
echo.
echo   !!! BLAD - zmiany NIE zostaly wyslane !!!
echo   Przeczytaj komunikat git powyzej.

:koniec
echo.
pause
