#!/usr/bin/env bash
# Register the liminal:// URL scheme on macOS by installing a minimal
# .app bundle that forwards URLs to bin/liminal-surface.js.
#
# Re-runnable. Requires macOS + node on PATH.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: node not found on PATH." >&2
  exit 1
fi

SURFACE_BIN="$REPO_ROOT/bin/liminal-surface.js"
VAULT_DIR="${LIMINAL_VAULT_DIR:-$HOME/Library/Application Support/Liminal}"
APP_DIR="$VAULT_DIR/LiminalSurface.app"
CONTENTS="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS/MacOS"

mkdir -p "$MACOS_DIR"

cat > "$CONTENTS/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>io.liminal.surface</string>
  <key>CFBundleName</key><string>LiminalSurface</string>
  <key>CFBundleExecutable</key><string>run</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSUIElement</key><true/>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key><string>Liminal</string>
      <key>CFBundleURLSchemes</key>
      <array><string>liminal</string></array>
    </dict>
  </array>
</dict>
</plist>
PLIST

cat > "$MACOS_DIR/run" <<SH
#!/usr/bin/env bash
URL="\${1:-}"
exec "$NODE_BIN" "$SURFACE_BIN" "\$URL"
SH
chmod +x "$MACOS_DIR/run"

LSREG="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [ -x "$LSREG" ]; then
  "$LSREG" -f "$APP_DIR" || true
fi

echo "registered liminal:// -> $APP_DIR"
echo "test with: open 'liminal://close?surfacing_id=test'"
