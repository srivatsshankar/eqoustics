#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

if [ ! -f package.json ]; then
  echo "[Eqoustics] package.json not found in $(pwd)"
  exit 1
fi

echo "[Eqoustics] Installing Node dependencies..."
npm install

echo "[Eqoustics] Building Beta packages for Windows..."
npm run build:all

echo "[Eqoustics] Build artifacts are in the release folder."
