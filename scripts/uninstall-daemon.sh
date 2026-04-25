#!/usr/bin/env bash
# Unload + remove the io.liminal.substrate user agent. Leaves the vault untouched.

set -euo pipefail

PLIST_PATH="$HOME/Library/LaunchAgents/io.liminal.substrate.plist"

if [ -f "$PLIST_PATH" ]; then
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  rm "$PLIST_PATH"
  echo "removed $PLIST_PATH"
else
  echo "$PLIST_PATH does not exist (nothing to do)"
fi
