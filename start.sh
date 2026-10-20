#!/usr/bin/env bash
# Linux (and macOS from a terminal): ./start.sh starts Weekend (needs Node.js 22+ from https://nodejs.org).
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install version 22 or newer from https://nodejs.org (or your package manager) and try again."
  exit 1
fi
exec node scripts/local.mjs "$@"
