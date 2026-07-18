#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js 20.6 or newer is required."
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example."
  echo "Edit .env with the database credentials, then run ./start.sh again."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies. This only runs the first time..."
  npm ci
fi

npm start
