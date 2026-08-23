@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Questini - deploy

cd /d D:\PROGRAFIT\questini.com\przewodnik-full-repo\przewodnik
if errorlevel 1 goto :zlasciezka

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 goto :nierepo

set RAPORT=powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push-raport.ps1"

%RAPORT% -Tryb naglowek

for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "GALAZ=%%b"
if not "!GALAZ!"=="main" (
    echo.
    echo   UWAGA: jestes na galezi "!GALAZ!", a nie "main".
    set /p "DALEJ=  Kontynuowac? [t/N]: "
    if /i not "!DALEJ!"=="t" goto :przerwane
)

REM ---- co sie zmienilo ----
git add -A
%RAPORT% -Tryb zmiany

git diff --cached --quiet
if not errorlevel 1 (
    echo.
    echo   Nie ma czego wysylac - sprawdzam tylko, czy cos nie czeka z poprzedniego razu.
    goto :wyslij
)

REM ---- data i godzina ----
REM %DATE% zalezy od ustawien regionalnych Windows i potrafi dokleic dzien
REM tygodnia. Bierzemy stempel z PowerShella w stalym formacie, a gdyby
REM go nie bylo - wracamy do %DATE%.
set "STEMPEL="
for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm'" 2^>nul`) do set "STEMPEL=%%d"
if not defined STEMPEL set "STEMPEL=%DATE% %TIME:~0,5%"

REM ---- opis zmian: argument > pytanie > sama data ----
set "MSG=%~1"
if "!MSG!"=="" set /p "MSG=  Opis zmian (Enter = !STEMPEL!): "
if "!MSG!"=="" set "MSG=deploy !STEMPEL!"

git commit -m "!MSG!" >nul
if errorlevel 1 goto :blad
echo.
echo   [1/3] Zapisane: !MSG!

:wyslij
echo   [2/3] Pobieram z GitHuba...
git pull --rebase --autostash >nul 2>&1
if errorlevel 1 goto :konflikt

echo   [3/3] Wysylam...
git push >nul 2>&1
if errorlevel 1 (
    echo.
    echo   Push odrzucony. Pelny komunikat:
    git push
    goto :koniec
)

%RAPORT% -Tryb historia
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
echo   Ponizej stan repozytorium:
echo.
git status --short
goto :koniec

:koniec
echo.
pause
