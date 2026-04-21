#!/usr/bin/env bash
# Installs plugin Node dependencies on first session start.
# Idempotent: returns immediately if node_modules already exists.
set -e

cd "${CLAUDE_PLUGIN_ROOT}"

if [ -d "node_modules" ]; then
  exit 0
fi

echo "liminal-agents: installing Node dependencies (one-time, ~20s)..." >&2

if ! command -v npm >/dev/null 2>&1; then
  echo "liminal-agents: npm not found. Install Node 20+ and re-open Claude Code." >&2
  exit 0
fi

npm install --silent --no-audit --no-fund >&2 || {
  echo "liminal-agents: npm install failed. Run it manually in ${CLAUDE_PLUGIN_ROOT}." >&2
  exit 0
}
