#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

if [ ! -f package.json ]; then
  echo "[Eqoustics] package.json not found in $(pwd)"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "[Eqoustics] Installing dependencies..."
  npm install
fi

echo "[Eqoustics] Starting development mode with hot reloading..."
unset ELECTRON_RUN_AS_NODE
npm run dev
