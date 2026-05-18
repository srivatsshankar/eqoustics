#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

if [ ! -f package.json ]; then
  echo "[Eqoustics] package.json not found in $(pwd)"
  exit 1
fi

echo "[Eqoustics] Installing Node dependencies..."
npm install

echo "[Eqoustics] Building self-contained Windows portable executable..."
npm run build:all

echo "[Eqoustics] Windows portable executable is in release/beta/<version>."
