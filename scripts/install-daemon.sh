#!/usr/bin/env bash
# Install io.liminal.substrate as a launchd user agent.
# macOS only. Re-running replaces the existing plist cleanly.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: node not found on PATH. Install Node 20+ first." >&2
  exit 1
fi

SCRIPT="$REPO_ROOT/bin/liminal-substrated.js"
VAULT_DIR="${LIMINAL_VAULT_DIR:-$HOME/Library/Application Support/Liminal}"
LOG_PATH="$VAULT_DIR/daemon.log"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$PLIST_DIR/io.liminal.substrate.plist"

mkdir -p "$VAULT_DIR" "$PLIST_DIR"

node "$REPO_ROOT/scripts/setup.js"
node "$REPO_ROOT/scripts/write-plist.js" "$PLIST_PATH" "$NODE_BIN" "$SCRIPT" "$LOG_PATH"

launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo "io.liminal.substrate loaded"
echo "  plist:      $PLIST_PATH"
echo "  daemon log: $LOG_PATH"
