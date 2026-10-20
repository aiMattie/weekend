#!/bin/bash
# macOS: double-click this file in Finder to start Weekend (needs Node.js 22+ from https://nodejs.org).
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install version 22 or newer from https://nodejs.org and try again."
  read -r -p "Press Enter to close."
  exit 1
fi
node scripts/local.mjs "$@"
