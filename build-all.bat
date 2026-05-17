@echo off
setlocal

cd /d "%~dp0"

if not exist package.json (
  echo [Eqoustics] package.json not found in %CD%
  exit /b 1
)

echo [Eqoustics] Installing Node dependencies...
call npm install
if errorlevel 1 (
  echo [Eqoustics] Node dependency installation failed.
  exit /b %errorlevel%
)

echo [Eqoustics] Building self-contained Windows app folder and portable executable...
call npm run build:all
if errorlevel 1 (
  echo [Eqoustics] Build failed.
  exit /b %errorlevel%
)

echo [Eqoustics] Windows app folder and portable executable are in release\beta\^<version^>.
endlocal
