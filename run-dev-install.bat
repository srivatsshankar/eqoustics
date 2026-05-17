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

echo [Eqoustics] Preparing local Python virtual environment...
call npm run prepare:python:dev
if errorlevel 1 (
  echo [Eqoustics] Python virtual environment setup failed.
  exit /b %errorlevel%
)

echo [Eqoustics] Starting development mode with hot reloading...
set ELECTRON_RUN_AS_NODE=
call npm run dev

endlocal
exit /b 0
