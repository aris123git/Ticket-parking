@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo  ParkFlow Caisse - creation du logiciel .exe
echo ============================================
echo.
echo 1) Installez Node.js LTS si ce n'est pas deja fait :
echo    https://nodejs.org/
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js est introuvable. Installez-le puis relancez ce fichier.
  pause
  exit /b 1
)

echo Installation des dependances...
call npm ci
if errorlevel 1 (
  echo Echec de npm ci
  pause
  exit /b 1
)

echo Construction de l'application Windows...
call npm run dist:win
if errorlevel 1 (
  echo Echec de la construction
  pause
  exit /b 1
)

echo.
echo Termine. Les fichiers .exe sont dans :
echo   apps\local\release\
echo.
echo - ParkFlow Caisse-1.0.0-win.exe  = installateur (raccourci bureau)
echo - ParkFlow-Caisse-Portable.exe   = version portable sans installation
echo.
explorer "%~dp0apps\local\release"
pause
