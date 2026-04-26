#!/usr/bin/env bash
# scripts/demo.sh — one-command demo setup for the AgentHansa hackathon
# recording. Creates a fresh temp vault, seeds it with synthetic content,
# and prints the three demo commands ready to run.
#
# Usage:
#   bash scripts/demo.sh              # set up + show next commands
#   bash scripts/demo.sh --run TASK   # set up + run TUI on TASK
#
# Why this exists:
#   The vault dir + key need to be exported into the same shell that runs
#   the TUI. Forgetting one of them is the most common pre-recording fail.
#   This script bundles all the pre-flight into one command.
#
#   Critical: this writes to a fresh temp vault (NEVER ~/Library/.../Liminal)
#   so the demo recording does not surface real Granola content. See
#   SPEC.md §4.2 for the privacy rationale.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# 1. Fresh vault dir per recording session
VAULT_DIR="$(mktemp -d -t liminal-demo-XXXXX)"
VAULT_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"

export LIMINAL_VAULT_DIR="$VAULT_DIR"
export LIMINAL_VAULT_KEY="$VAULT_KEY"

# 2. Seed with synthetic content (5 signals, all fictional)
node scripts/seed-demo.js > /dev/null

# 3. Confirm seed worked
SIGNAL_COUNT=$(node -e "
  import('./lib/vault/db.js').then(m => {
    const db = m.openVault();
    const c = db.prepare('SELECT COUNT(*) AS c FROM signal_events').get().c;
    db.close();
    console.log(c);
  });
")

# 4. Auth path detection
AUTH_MODE=""
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  AUTH_MODE="api (fast)"
elif command -v claude >/dev/null 2>&1; then
  AUTH_MODE="cli (slow but works)"
else
  AUTH_MODE="none — set ANTHROPIC_API_KEY or run claude setup-token"
fi

cat <<EOF

────────────────────────────────────────────────────────────
  Liminal demo session ready
────────────────────────────────────────────────────────────
  vault:    $VAULT_DIR
  signals:  $SIGNAL_COUNT seeded
  auth:     $AUTH_MODE
────────────────────────────────────────────────────────────

The vault env is set in THIS shell. Open the TUI with:

  node bin/liminal-tui.js "competitive teardown of granola.ai"

Three canonical demo runs (one per agent in lane):

  # 1. Analyst in lane (judges' meta-tool)
  node bin/liminal-tui.js "competitive teardown of granola.ai"

  # 2. SDR in lane
  node bin/liminal-tui.js "draft a cold email to a16z about our Series A"

  # 3. Auditor in lane
  node bin/liminal-tui.js "is this email ready to send: 'Maya — moat question. Worth a 4-min sync?'"

When done, the vault auto-cleans on shell exit (it's in /tmp).

EOF

# 5. Optional: --run TASK shortcut
if [ "${1:-}" = "--run" ] && [ -n "${2:-}" ]; then
  shift
  echo "running: node bin/liminal-tui.js \"$*\""
  echo
  exec node bin/liminal-tui.js "$@"
fi
