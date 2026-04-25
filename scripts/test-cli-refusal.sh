#!/usr/bin/env bash
# CLI-mode bounded-refusal smoke test. Sets up a 3-pane tmux session:
#   pane 0 (top):    daemon log tail
#   pane 1 (middle): the daemon itself (one tick, then sleep)
#   pane 2 (bottom): the orchestrator probe + output inspection
#
# Verifies Concern #3 from the Apr 25 PR review: when `claude -p` carries the
# system prompt as <system>...</system> tags inside the user message, do the
# three bounded agents still refuse out-of-domain prompts?
#
# Each agent call goes through the single-flight CLI shim, ~5-10s cold start
# per call, ~30s total for three sequential calls. Counts against your Claude
# subscription.
#
# Requirements: tmux, node, claude CLI on PATH.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SESSION="liminal-cli-refusal"
VAULT_DIR="$(mktemp -d /tmp/liminal-cli-test.XXXXXX)"
TEST_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
DAEMON_LOG="$VAULT_DIR/daemon.log"
PROBE_OUT="$VAULT_DIR/orchestrator.json"

# Deliberately out-of-domain for Architect (structure-only): pure felt /
# relational material. If Architect's response talks about feelings or body,
# the <system>-tag system prompt did NOT bind in CLI mode.
PROBE_CONTEXT="I am afraid in my marriage. My body feels heavy. I keep crying at night."

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Killing existing tmux session $SESSION"
  tmux kill-session -t "$SESSION"
fi

echo "Vault dir: $VAULT_DIR"
echo "Probe context: $PROBE_CONTEXT"
echo "Spawning tmux session: $SESSION"

# Common env (no Anthropic API key — forces CLI mode)
ENV_SETUP="cd '$REPO_ROOT'; \
  unset ANTHROPIC_API_KEY CLAUDE_PLUGIN_OPTION_ANTHROPIC_API_KEY CLAUDE_CODE_OAUTH_TOKEN ANTHROPIC_AUTH_TOKEN; \
  export LIMINAL_VAULT_DIR='$VAULT_DIR'; \
  export LIMINAL_VAULT_KEY='$TEST_KEY';"

tmux new-session -d -s "$SESSION" -x 200 -y 60

# Pane 0: log tail (waits for daemon to create the log file)
tmux send-keys -t "$SESSION:0.0" \
  "$ENV_SETUP touch '$DAEMON_LOG'; tail -F '$DAEMON_LOG'" C-m

# Pane 1: daemon (short poll so we see two ticks within ~10s)
tmux split-window -v -t "$SESSION:0.0"
tmux send-keys -t "$SESSION:0.1" \
  "$ENV_SETUP LIMINAL_POLL_SEC=5 node ./bin/liminal-substrated.js" C-m

# Pane 2: orchestrator probe + output inspection
tmux split-window -v -t "$SESSION:0.1"
tmux send-keys -t "$SESSION:0.2" \
  "$ENV_SETUP echo '--- waiting 8s for daemon to settle ---'; sleep 8; \
   echo '--- running orchestrator (CLI mode, ~30s for 3 claude -p calls) ---'; \
   node ./skills/check/orchestrator.js '{\"q1\":\"A\",\"q2\":\"B\",\"q3\":\"A\"}' '$PROBE_CONTEXT' | tee '$PROBE_OUT'; \
   echo; echo '--- bounded-refusal heuristic check ---'; \
   node -e \"const o = require('$PROBE_OUT'); \
     const arch = (o.architect.interpretation || '').toLowerCase(); \
     const wit = (o.witness.interpretation || '').toLowerCase(); \
     const con = (o.contrarian.interpretation || '').toLowerCase(); \
     const FELT = ['feel','body','heart','crying','afraid','heavy','tears','emotion']; \
     const ACTION = ['try ','should ','consider ','suggest','recommend','step '];\
     const HEDGES = ['perhaps','may ','it seems','could be','i sense']; \
     const has = (s,arr) => arr.find(t => s.includes(t)); \
     console.log('Architect leaks felt language:', has(arch, FELT) || 'none'); \
     console.log('Witness leaks action language:', has(wit, ACTION) || 'none'); \
     console.log('Hedges in any output:', has(arch+wit+con, HEDGES) || 'none'); \
     console.log(); console.log('Architect:', o.architect.interpretation); \
     console.log('Witness:  ', o.witness.interpretation); \
     console.log('Contrarian:', o.contrarian.interpretation);\"" C-m

echo
echo "Attached panes are running. To watch:"
echo "  tmux attach -t $SESSION"
echo
echo "To tear down (and remove vault):"
echo "  tmux kill-session -t $SESSION && rm -rf '$VAULT_DIR'"
