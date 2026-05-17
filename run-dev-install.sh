#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

if [ ! -f package.json ]; then
  echo "[Eqoustics] package.json not found in $(pwd)"
  exit 1
fi

echo "[Eqoustics] Installing Node dependencies..."
npm install

echo "[Eqoustics] Preparing local Python virtual environment..."
npm run prepare:python:dev

echo "[Eqoustics] Starting development mode with hot reloading..."
unset ELECTRON_RUN_AS_NODE
npm run dev
