@echo off
setlocal

cd /d "%~dp0"

if not exist package.json (
  echo [Eqoustics] package.json not found in %CD%
  exit /b 1
)

if not exist node_modules (
  echo [Eqoustics] Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [Eqoustics] Dependency installation failed.
    exit /b %errorlevel%
  )
)

echo [Eqoustics] Starting development mode with hot reloading...
call npm run dev

endlocal